import { SupabaseService } from '../services/supabase';
import { AppointmentService } from '../services/appointmentService';

export class AppointmentCommandHandler {
  private supabase: SupabaseService;
  private appointments: AppointmentService;
  private pendingCancellations: Map<string, any[]> = new Map();
  private awaitingReason: Map<string, string> = new Map();

  constructor(supabase: SupabaseService, appointments: AppointmentService) {
    this.supabase = supabase;
    this.appointments = appointments;
  }

  async handleLeadCommand(phone: string, message: string): Promise<string | null> {
    const msg = message.toLowerCase().trim();

    // SI ESTÁ ESPERANDO MOTIVO DE CANCELACIÓN
    if (this.awaitingReason.has(phone)) {
      const appointmentId = this.awaitingReason.get(phone)!;
      this.awaitingReason.delete(phone);
      
      let reason = 'Cancelado por el cliente';
      if (msg.includes('reagendar') || msg.includes('cambiar')) {
        reason = 'Quiere reagendar para otra fecha';
      } else if (msg.includes('ya no') || msg.includes('no me interesa')) {
        reason = 'Ya no le interesa';
      } else {
        reason = message;
      }
      
      const success = await this.appointments.cancelAppointment(appointmentId, reason);
      
      if (msg.includes('reagendar') || msg.includes('cambiar')) {
        return success 
          ? '✅ Cita cancelada.\n\n¿Qué día te vendría mejor? Ejemplo: "martes 3pm"'
          : '❌ Error al cancelar.';
      }
      
      return success 
        ? '✅ Cita cancelada.\n\nCualquier cosa, aquí estoy!'
        : '❌ Error al cancelar.';
    }

    // VER MIS CITAS
    if (msg.includes('mis citas') || msg.includes('ver citas')) {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('id')
        .eq('phone', phone)
        .single();

      if (!lead) return 'No tienes citas registradas.';

      const { data: appointments } = await this.supabase.client
        .from('appointments')
        .select('*, team_members(name)')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: true });

      if (!appointments || appointments.length === 0) {
        return 'No tienes citas agendadas.';
      }

      let response = '📅 *TUS CITAS:*\n\n';
      for (let i = 0; i < appointments.length; i++) {
        const apt = appointments[i];
        const date = new Date(apt.scheduled_date + 'T00:00:00-06:00')
          .toLocaleDateString('es-MX', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
          });
        response += `${i + 1}. ${date} - ${apt.scheduled_time}\n`;
        response += `   Con: ${apt.team_members.name}\n\n`;
      }
      response += 'Para cancelar: CANCELAR CITA';
      return response;
    }

    // CANCELAR CITA
    if (msg === 'cancelar cita' || msg === 'cancelar') {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('id')
        .eq('phone', phone)
        .single();

      if (!lead) return 'No tienes citas para cancelar.';

      const { data: appointments } = await this.supabase.client
        .from('appointments')
        .select('*, team_members(name)')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: true });

      if (!appointments || appointments.length === 0) {
        return 'No tienes citas para cancelar.';
      }

      if (appointments.length === 1) {
        // Preguntar motivo
        this.awaitingReason.set(phone, appointments[0].id);
        return '¿Por qué quieres cancelar?\n\n1. Quiero reagendar\n2. Ya no me interesa\n3. Otro motivo';
      }

      // Múltiples citas
      this.pendingCancellations.set(phone, appointments);

      let response = '¿Cuál cita quieres cancelar?\n\n';
      for (let i = 0; i < appointments.length; i++) {
        const apt = appointments[i];
        const date = new Date(apt.scheduled_date + 'T00:00:00-06:00')
          .toLocaleDateString('es-MX', { 
            weekday: 'long',
            day: 'numeric', 
            month: 'long' 
          });
        response += `${i + 1}. ${date} - ${apt.scheduled_time} con ${apt.team_members.name}\n`;
      }
      response += '\nResponde con el número';
      return response;
    }

    // SELECCIÓN DE CITA (número)
    if (this.pendingCancellations.has(phone)) {
      const number = parseInt(msg);
      if (!isNaN(number) && number > 0) {
        const appointments = this.pendingCancellations.get(phone)!;
        
        if (number <= appointments.length) {
          const apt = appointments[number - 1];
          this.pendingCancellations.delete(phone);
          this.awaitingReason.set(phone, apt.id);
          
          return '¿Por qué quieres cancelar?\n\n1. Quiero reagendar\n2. Ya no me interesa\n3. Otro motivo';
        }
      }
    }

    return null;
  }
}
