import { SupabaseService } from './supabase';
import { GoogleCalendarService } from './googleCalendar';
import { parseCancelarCitaCommand, parseReagendarCommand, formatearFechaLegible, formatearHoraLegible } from '../handlers/appointmentService';
import { parseFecha, parseHoraISO } from '../handlers/dateParser';

interface CancelarResult {
  success?: boolean;
  error?: string;
  multipleLeads?: any[];
  leadName?: string;
  fechaStr?: string;
  horaStr?: string;
  appointmentId?: string;
}

interface ReagendarResult {
  success?: boolean;
  error?: string;
  needsHelp?: boolean;
  needsDateTime?: boolean;
  multipleLeads?: any[];
  nombreLead?: string;
  leadName?: string;
  nuevaFecha?: string;
  nuevaHora?: string;
  appointmentId?: string;
}

export class AppointmentSchedulingService {
  constructor(
    private supabase: SupabaseService,
    private calendar?: GoogleCalendarService
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // CANCELAR CITA
  // ═══════════════════════════════════════════════════════════════════

  parseCancelarCita(body: string): string | null {
    return parseCancelarCitaCommand(body);
  }

  getMensajeAyudaCancelar(): string {
    return `❌ *Para cancelar cita escribe:*

"cancelar cita con [nombre]"

*Ejemplos:*
• cancelar cita con Ana
• cancelar cita de Juan Perez`;
  }

  async cancelarCitaCompleto(nombreLead: string, vendedor: any): Promise<CancelarResult> {
    try {
      // Buscar leads que coincidan
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone')
        .ilike('name', `%${nombreLead}%`)
        .limit(10);

      if (!leads || leads.length === 0) {
        return { error: `No encontré a "${nombreLead}" en tus leads.` };
      }

      if (leads.length > 1) {
        return { multipleLeads: leads };
      }

      const lead = leads[0];

      // Buscar cita activa del lead
      const { data: appointment } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', lead.id)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .single();

      if (!appointment) {
        return { error: `${lead.name} no tiene citas pendientes.` };
      }

      // Cancelar la cita
      await this.supabase.client
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: vendedor.name
        })
        .eq('id', appointment.id);

      // Registrar actividad en lead_activities
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: lead.id,
          type: 'whatsapp',
          notes: `Cita cancelada por ${vendedor.name} (era: ${formatearFechaLegible(appointment.scheduled_date)} ${formatearHoraLegible(appointment.scheduled_time)})`,
          created_by: vendedor.id
        });
      console.log(`📋 Actividad registrada: Cita cancelada para ${lead.name}`);

      // Cancelar en Google Calendar si existe
      if (this.calendar && appointment.google_event_id) {
        try {
          await this.calendar.deleteEvent(appointment.google_event_id);
        } catch (e) {
          console.log('⚠️ No se pudo eliminar evento de Calendar:', e);
        }
      }

      return {
        success: true,
        leadName: lead.name,
        fechaStr: formatearFechaLegible(appointment.scheduled_date),
        horaStr: formatearHoraLegible(appointment.scheduled_time),
        appointmentId: appointment.id
      };

    } catch (e) {
      console.error('Error cancelando cita:', e);
      return { error: 'Error interno al cancelar cita.' };
    }
  }

  formatCancelarCitaExito(result: CancelarResult): string {
    return `✅ *Cita cancelada*

👤 ${result.leadName}
📅 Era: ${result.fechaStr}, ${result.horaStr}

Puedes reagendar cuando quieras.`;
  }

  // Cancelar cita directamente por ID del lead (cuando ya se seleccionó de múltiples)
  async cancelarCitaPorId(leadId: string, leadName: string, vendedor: any): Promise<CancelarResult> {
    try {
      // Buscar cita activa del lead
      const { data: appointment } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', leadId)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .single();

      if (!appointment) {
        return { error: `${leadName} no tiene citas pendientes.` };
      }

      // Cancelar la cita
      await this.supabase.client
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: vendedor.name
        })
        .eq('id', appointment.id);

      // Registrar actividad en lead_activities
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          type: 'whatsapp',
          notes: `Cita cancelada por ${vendedor.name} (era: ${formatearFechaLegible(appointment.scheduled_date)} ${formatearHoraLegible(appointment.scheduled_time)})`,
          created_by: vendedor.id
        });
      console.log(`📋 Actividad registrada: Cita cancelada para ${leadName}`);

      // Cancelar en Google Calendar si existe
      if (this.calendar && appointment.google_event_id) {
        try {
          await this.calendar.deleteEvent(appointment.google_event_id);
        } catch (e) {
          console.log('⚠️ No se pudo eliminar evento de Calendar:', e);
        }
      }

      return {
        success: true,
        leadName: leadName,
        fechaStr: formatearFechaLegible(appointment.scheduled_date),
        horaStr: formatearHoraLegible(appointment.scheduled_time),
        appointmentId: appointment.id
      };

    } catch (e) {
      console.error('Error cancelando cita por ID:', e);
      return { error: 'Error interno al cancelar cita.' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // REAGENDAR CITA
  // ═══════════════════════════════════════════════════════════════════

  getMensajeAyudaReagendar(): string {
    return `📅 *Para reagendar cita escribe:*

"reagendar [nombre] [día] [hora]"

*Ejemplos:*
• reagendar Ana mañana 4pm
• reagendar Juan lunes 10am
• reagendar María viernes 3pm`;
  }

  formatReagendarNeedsDateTime(nombreLead: string): string {
    return `📅 *Reagendar cita de ${nombreLead}*

¿Para cuándo la movemos?

*Escribe:*
"reagendar ${nombreLead} [día] [hora]"

*Ejemplo:*
reagendar ${nombreLead} mañana 4pm`;
  }

  async reagendarCitaCompleto(body: string, vendedor: any): Promise<ReagendarResult> {
    try {
      const parsed = parseReagendarCommand(body);

      if (!parsed.nombreLead) {
        return { needsHelp: true };
      }

      // Buscar leads que coincidan
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone')
        .ilike('name', `%${parsed.nombreLead}%`)
        .limit(10);

      if (!leads || leads.length === 0) {
        return { error: `No encontré a "${parsed.nombreLead}" en tus leads.` };
      }

      if (leads.length > 1) {
        return { multipleLeads: leads };
      }

      const lead = leads[0];

      // Verificar si tiene día y hora
      if (!parsed.dia || !parsed.hora) {
        return { needsDateTime: true, nombreLead: lead.name };
      }

      // Buscar cita activa del lead
      const { data: appointment } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', lead.id)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .single();

      if (!appointment) {
        return { error: `${lead.name} no tiene citas pendientes para reagendar.` };
      }

      // Parsear nueva fecha y hora
      const nuevaFecha = parseFecha(parsed.dia);
      if (!nuevaFecha) {
        return { error: `No entendí la fecha "${parsed.dia}". Intenta con: mañana, lunes, martes, etc.` };
      }

      let horaNum = parseInt(parsed.hora);
      if (parsed.ampm?.toLowerCase() === 'pm' && horaNum < 12) {
        horaNum += 12;
      }
      if (parsed.ampm?.toLowerCase() === 'am' && horaNum === 12) {
        horaNum = 0;
      }
      const nuevaHoraISO = `${String(horaNum).padStart(2, '0')}:00:00`;

      // Actualizar la cita
      await this.supabase.client
        .from('appointments')
        .update({
          scheduled_date: nuevaFecha,
          scheduled_time: nuevaHoraISO,
          status: 'scheduled',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointment.id);

      // Registrar actividad en lead_activities
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: lead.id,
          type: 'whatsapp',
          notes: `Cita reagendada por ${vendedor.name} (nueva: ${formatearFechaLegible(nuevaFecha)} ${formatearHoraLegible(nuevaHoraISO)})`,
          created_by: vendedor.id
        });
      console.log(`📋 Actividad registrada: Cita reagendada para ${lead.name}`);

      // Actualizar en Google Calendar si existe
      if (this.calendar && appointment.google_event_id) {
        try {
          const startDateTime = new Date(`${nuevaFecha}T${nuevaHoraISO}`);
          const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

          await this.calendar.updateEvent(appointment.google_event_id, {
            start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Mexico_City' },
            end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Mexico_City' }
          });
        } catch (e) {
          console.log('⚠️ No se pudo actualizar evento en Calendar:', e);
        }
      }

      return {
        success: true,
        leadName: lead.name,
        nuevaFecha: formatearFechaLegible(nuevaFecha),
        nuevaHora: formatearHoraLegible(nuevaHoraISO),
        appointmentId: appointment.id
      };

    } catch (e) {
      console.error('Error reagendando cita:', e);
      return { error: 'Error interno al reagendar cita.' };
    }
  }

  formatReagendarCitaExito(result: ReagendarResult): string {
    return `✅ *Cita reagendada*

👤 ${result.leadName}
📅 Nueva fecha: ${result.nuevaFecha}
🕐 Nueva hora: ${result.nuevaHora}

¿Le aviso a ${result.leadName}?
*1.* Sí, mándale mensaje
*2.* No, yo le aviso`;
  }
}
