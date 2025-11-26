import { SupabaseService } from './supabase';
import { OpenAIService } from './openai';

export class SalespersonScheduler {
  private supabase: SupabaseService;
  private ai: OpenAIService;

  constructor(supabase: SupabaseService, ai: OpenAIService) {
    this.supabase = supabase;
    this.ai = ai;
  }

  async findAvailableSalesperson(
    requestedDate: string, 
    requestedTime: string,
    lead: any
  ): Promise<{ salesperson: any; isAvailable: boolean } | null> {
    
    const date = new Date(requestedDate);
    const dayOfWeek = date.getDay();
    
    // 1. Obtener vendedores que trabajan ese día
    const { data: availabilities } = await this.supabase.client
      .from('salesperson_availability')
      .select('*, team_members(*)')
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)
      .lte('start_time', requestedTime)
      .gte('end_time', requestedTime);

    if (!availabilities || availabilities.length === 0) {
      console.log('❌ No hay vendedores disponibles ese día/hora');
      return null;
    }

    // 2. Verificar citas existentes
    const availableSalespeople = [];
    
    for (const avail of availabilities) {
      const { count } = await this.supabase.client
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('salesperson_id', avail.salesperson_id)
        .eq('scheduled_date', requestedDate)
        .eq('scheduled_time', requestedTime)
        .eq('status', 'scheduled');

      if (count === 0) {
        availableSalespeople.push(avail.team_members);
      }
    }

    if (availableSalespeople.length === 0) {
      console.log('⚠️ Todos ocupados en ese horario');
      return { salesperson: availabilities[0].team_members, isAvailable: false };
    }

    // 3. Usar IA para elegir el mejor vendedor
    const best = await this.selectBestSalesperson(availableSalespeople, lead);
    
    return { salesperson: best, isAvailable: true };
  }

  private async selectBestSalesperson(salespeople: any[], lead: any): Promise<any> {
    if (salespeople.length === 1) return salespeople[0];

    const prompt = `Selecciona el mejor vendedor para este lead:

LEAD:
- Propiedad: ${lead.property_interest || 'No especificado'}
- Presupuesto: ${lead.budget || 'No definido'}
- Score: ${lead.score} (${lead.score_points} pts)

VENDEDORES DISPONIBLES:
${salespeople.map((s, i) => `${i + 1}. ${s.name} - Especialización: ${s.specialization || 'general'} - Ventas: ${s.sales_count || 0}`).join('\n')}

Responde SOLO con el número del vendedor (1, 2, 3, etc).`;

    try {
      const response = await this.ai.chat([], prompt, 'Selecciona número.');
      const index = parseInt(response.trim()) - 1;
      
      if (index >= 0 && index < salespeople.length) {
        return salespeople[index];
      }
    } catch (error) {
      console.error('Error selecting salesperson:', error);
    }

    // Fallback: el que tiene menos citas
    return salespeople[0];
  }

  async createAppointment(lead: any, salesperson: any, date: string, time: string, propertyId?: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from('appointments')
      .insert({
        lead_id: lead.id,
        salesperson_id: salesperson.id,
        property_id: propertyId,
        scheduled_date: date,
        scheduled_time: time,
        status: 'scheduled'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating appointment:', error);
      return null;
    }

    console.log('✅ Appointment created:', data.id);
    return data;
  }

  async getSuggestedTimes(date: string, salesperson: any): Promise<string[]> {
    const dayOfWeek = new Date(date).getDay();
    
    // Obtener horario de trabajo
    const { data: availability } = await this.supabase.client
      .from('salesperson_availability')
      .select('*')
      .eq('salesperson_id', salesperson.id)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (!availability) return [];

    // Obtener citas existentes
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('scheduled_time')
      .eq('salesperson_id', salesperson.id)
      .eq('scheduled_date', date)
      .eq('status', 'scheduled');

    const bookedTimes = new Set(appointments?.map(a => a.scheduled_time) || []);

    // Generar slots disponibles
    const slots: string[] = [];
    const start = parseInt(availability.start_time.split(':')[0]);
    const end = parseInt(availability.end_time.split(':')[0]);

    for (let hour = start; hour < end; hour++) {
      const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
      if (!bookedTimes.has(timeSlot)) {
        slots.push(timeSlot);
      }
    }

    return slots.slice(0, 5); // Max 5 sugerencias
  }
}
