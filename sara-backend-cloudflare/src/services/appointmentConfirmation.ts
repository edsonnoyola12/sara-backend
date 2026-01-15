import { CalendarService } from './calendar';
import { SupabaseService } from './supabase';

export class AppointmentConfirmation {
  private calendar: CalendarService;
  private supabase: SupabaseService;

  constructor(calendar: CalendarService, supabase: SupabaseService) {
    this.calendar = calendar;
    this.supabase = supabase;
  }

  async confirmAppointment(
    leadId: string,
    date: string,
    time: string,
    property: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Obtener lead
      const lead = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead.data) {
        return { success: false, message: 'Lead no encontrado' };
      }

      // Obtener vendedor con menos citas (round-robin simple)
      const { data: salespeople } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'salesperson')
        .limit(1);

      const salesperson = salespeople && salespeople[0] ? salespeople[0] : null;

      // Crear evento en calendario
      const [hours, minutes] = time.split(':');
      const startTime = `${date}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00-06:00`;
      const endHour = String(parseInt(hours) + 1).padStart(2, '0');
      const endTime = `${date}T${endHour}:${minutes.padStart(2, '0')}:00-06:00`;

      const event = await this.calendar.createEvent({
        summary: `🏠 ${property} - ${lead.data.name || 'Cliente'}`,
        description: `👤 Cliente: ${lead.data.name || 'Sin nombre'}\n📱 ${lead.data.phone}\n🏠 Propiedad: ${property}\n${salesperson ? '👨‍💼 Asesor: ' + salesperson.name : ''}`,
        start: { dateTime: startTime, timeZone: 'America/Mexico_City' },
        end: { dateTime: endTime, timeZone: 'America/Mexico_City' },
        attendees: lead.data.email ? [{ email: lead.data.email }] : undefined
      });

      if (!event) {
        return { success: false, message: 'Error al crear evento en calendario' };
      }

      // Actualizar lead
      await this.supabase.updateLead(leadId, {
        status: 'appointment_scheduled',
        property_interest: property,
        assigned_to: salesperson?.id || null
      });

      const dateFormatted = new Date(date + 'T00:00:00-06:00').toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });

      return {
        success: true,
        message: `✅ ¡Listo! Tu cita está confirmada:\n\n📅 ${dateFormatted}\n🕐 ${time}\n🏠 ${property}\n${salesperson ? '👨‍💼 Te atenderá: ' + salesperson.name : ''}\n\nTe esperamos. Si necesitas hacer algún cambio, avísame.`
      };
    } catch (error) {
      console.error('❌ Error confirming appointment:', error);
      return { success: false, message: 'Error al confirmar la cita' };
    }
  }
}
