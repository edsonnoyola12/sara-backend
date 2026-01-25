import { SupabaseService } from './supabase';

export class AvailabilityService {
  private supabase: SupabaseService;

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
  }

  async checkAvailability(
    date: string,
    time: string,
    userType: 'salesperson' | 'mortgage_advisor' = 'salesperson'
  ): Promise<{
    available: boolean;
    assignedTo?: any;
    suggestedSlots: string[];
    suggestedDates: string[];
  }> {
    
    const dayOfWeek = new Date(date).getDay();
    
    console.log(`🔍 Verificando disponibilidad: ${date} ${time}`);

    // 1. Buscar quien trabaja ese día/hora
    const { data: schedules } = await this.supabase.client
      .from('availability_schedules')
      .select('*, team_members(*)')
      .eq('user_type', userType)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)
      .lte('start_time', time)
      .gte('end_time', time);

    if (!schedules || schedules.length === 0) {
      console.error('❌ Nadie trabaja ese día/hora');
      
      // Buscar próximos días laborables
      const alternatives = await this.findAlternativeDays(date, userType);
      
      return {
        available: false,
        suggestedSlots: [],
        suggestedDates: alternatives
      };
    }

    // 2. Verificar si tienen citas en ese horario
    const availableUsers = [];
    
    for (const schedule of schedules) {
      const { count } = await this.supabase.client
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to_id', schedule.user_id)
        .eq('scheduled_date', date)
        .eq('scheduled_time', time)
        .in('status', ['scheduled', 'confirmed']);

      if (count === 0) {
        availableUsers.push(schedule.team_members);
      }
    }

    if (availableUsers.length > 0) {
      console.log(`✅ Disponible - ${availableUsers[0].name}`);
      return {
        available: true,
        assignedTo: availableUsers[0],
        suggestedSlots: [],
        suggestedDates: []
      };
    }

    // 3. Todos ocupados - buscar horarios alternativos
    console.error('⚠️ Ocupado - buscando alternativas...');
    const alternatives = await this.findAlternativeSlots(date, schedules[0].user_id);
    
    return {
      available: false,
      suggestedSlots: alternatives.slots,
      suggestedDates: alternatives.dates
    };
  }

  private async findAlternativeSlots(
    date: string,
    userId: string
  ): Promise<{ slots: string[]; dates: string[] }> {
    
    const dayOfWeek = new Date(date).getDay();
    
    // Obtener horario de trabajo
    const { data: schedule } = await this.supabase.client
      .from('availability_schedules')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (!schedule) return { slots: [], dates: [] };

    // Obtener citas existentes ese día
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('scheduled_time')
      .eq('assigned_to_id', userId)
      .eq('scheduled_date', date)
      .in('status', ['scheduled', 'confirmed']);

    const bookedTimes = new Set(appointments?.map(a => a.scheduled_time) || []);

    // Generar slots disponibles
    const slots: string[] = [];
    const startHour = parseInt(schedule.start_time.split(':')[0]);
    const endHour = parseInt(schedule.end_time.split(':')[0]);

    for (let hour = startHour; hour < endHour; hour++) {
      const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
      if (!bookedTimes.has(timeSlot)) {
        slots.push(timeSlot);
      }
    }

    // Si no hay slots ese día, buscar próximos días
    const dates = slots.length === 0 
      ? await this.findAlternativeDays(date, 'salesperson')
      : [];

    return { 
      slots: slots.slice(0, 3),
      dates 
    };
  }

  private async findAlternativeDays(
    requestedDate: string,
    userType: string
  ): Promise<string[]> {
    
    const suggestions: string[] = [];
    const requested = new Date(requestedDate);
    
    // Buscar próximos 7 días
    for (let i = 1; i <= 7; i++) {
      const nextDay = new Date(requested);
      nextDay.setDate(nextDay.getDate() + i);
      const dayOfWeek = nextDay.getDay();
      
      // Verificar si alguien trabaja ese día
      const { data: schedules } = await this.supabase.client
        .from('availability_schedules')
        .select('start_time')
        .eq('user_type', userType)
        .eq('day_of_week', dayOfWeek)
        .limit(1);

      if (schedules && schedules.length > 0) {
        const dateStr = nextDay.toISOString().split('T')[0];
        const formatted = nextDay.toLocaleDateString('es-MX', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long' 
        });
        const time = schedules[0].start_time.substring(0, 5);
        
        suggestions.push(`${formatted} a las ${time}`);
        
        if (suggestions.length >= 3) break;
      }
    }
    
    return suggestions;
  }
}
