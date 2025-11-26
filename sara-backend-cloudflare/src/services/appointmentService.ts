import { SupabaseService } from './supabase';
import { CalendarService } from './calendar';
import { TwilioService } from './twilio';

export class AppointmentService {
  private supabase: SupabaseService;
  private calendar: CalendarService;
  private twilio: TwilioService;

  constructor(supabase: SupabaseService, calendar: CalendarService, twilio: TwilioService) {
    this.supabase = supabase;
    this.calendar = calendar;
    this.twilio = twilio;
  }

  async createAppointment(
    lead: any,
    assignedTo: any,
    date: string,
    time: string,
    appointmentType: string = 'property_viewing'
  ): Promise<any> {
    
    console.log('📅 Creando cita...');

    const [hours, minutes] = time.split(':');
    const startTime = `${date}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00-06:00`;
    const endHour = String(parseInt(hours) + 1).padStart(2, '0');
    const endTime = `${date}T${endHour}:${minutes.padStart(2, '0')}:00-06:00`;

    const property = lead.property_interest || 'Propiedad';
    const clientName = lead.name || `Cliente ${lead.phone.slice(-4)}`;
    
    const calendarEvent = await this.calendar.createEvent(
      `${property} - ${clientName}`,
      `Cliente: ${clientName}\nVendedor: ${assignedTo.name}\nTelefono: ${lead.phone}\nPropiedad: ${property}\nPresupuesto: ${lead.budget || 'No definido'}`,
      startTime,
      endTime,
      lead.email
    );

    if (!calendarEvent) {
      console.error('❌ Error creando evento en calendario');
      return null;
    }

    const { data: appointment, error } = await this.supabase.client
      .from('appointments')
      .insert({
        lead_id: lead.id,
        assigned_to_id: assignedTo.id,
        assigned_to_type: 'salesperson',
        scheduled_date: date,
        scheduled_time: time,
        status: 'scheduled',
        appointment_type: appointmentType,
        google_calendar_event_id: calendarEvent.id,
        google_calendar_event_url: calendarEvent.htmlLink
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error guardando cita:', error);
      return null;
    }

    console.log('✅ Cita creada:', appointment.id);

    await this.supabase.updateLead(lead.id, { status: 'appointment_scheduled' });
    await this.notifyVendedor(appointment, lead, assignedTo);

    return appointment;
  }

  async cancelAppointment(appointmentId: string, reason?: string): Promise<boolean> {
    try {
      console.log(`🚫 Cancelando cita ${appointmentId}...`);

      const { data: appointment, error: fetchError } = await this.supabase.client
        .from('appointments')
        .select('*, leads(*), team_members(*)')
        .eq('id', appointmentId)
        .single();

      if (fetchError || !appointment) {
        console.error('❌ Error buscando cita:', fetchError);
        return false;
      }

      console.log(`✅ Cita encontrada para ${appointment.leads.phone}`);

      // Cancelar en Google Calendar (no crítico si falla)
      if (appointment.google_calendar_event_id) {
        console.log(`📅 Intentando cancelar en Google: ${appointment.google_calendar_event_id}`);
        const deleted = await this.calendar.deleteEvent(appointment.google_calendar_event_id);
        if (deleted) {
          console.log('✅ Cancelado en Google Calendar');
        } else {
          console.log('⚠️ No se pudo cancelar en Google (continuamos)');
        }
      }

      // Cancelar en BD (crítico)
      console.log('💾 Actualizando estado en BD...');
      const { error: updateError } = await this.supabase.client
        .from('appointments')
        .update({
          status: 'cancelled',
          cancellation_reason: reason || 'Cancelado por el cliente',
          cancelled_by: 'client'
        })
        .eq('id', appointmentId);

      if (updateError) {
        console.error('❌ Error actualizando BD:', updateError);
        return false;
      }

      console.log('✅ Estado actualizado en BD');

      // Notificar vendedor
      await this.notifyVendedorCancellation(appointment, reason);

      console.log('✅ Cita cancelada completamente');
      return true;
      
    } catch (error) {
      console.error('❌ Error general en cancelAppointment:', error);
      return false;
    }
  }

  private async notifyVendedor(appointment: any, lead: any, assignedTo: any) {
    const dateFormatted = new Date(appointment.scheduled_date + 'T00:00:00-06:00')
      .toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });

    const clientName = lead.name || `Cliente ${lead.phone.slice(-4)}`;

    const salesMsg = `📅 *NUEVA CITA*

*Cliente:* ${clientName}
📱 ${lead.phone}
*Propiedad:* ${lead.property_interest || 'No especificado'}

*Fecha:* ${dateFormatted}
*Hora:* ${appointment.scheduled_time}`;

    await this.twilio.sendWhatsAppMessage(assignedTo.phone, salesMsg);
  }

  private async notifyVendedorCancellation(appointment: any, reason?: string) {
    const dateFormatted = new Date(appointment.scheduled_date + 'T00:00:00-06:00')
      .toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });

    const clientName = appointment.leads.name || `Cliente ${appointment.leads.phone.slice(-4)}`;

    const salesMsg = `🚫 *CITA CANCELADA*

Cliente: ${clientName}
Fecha: ${dateFormatted} ${appointment.scheduled_time}`;

    await this.twilio.sendWhatsAppMessage(appointment.team_members.phone, salesMsg);
  }
}
