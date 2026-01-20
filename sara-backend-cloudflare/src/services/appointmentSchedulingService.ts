import { SupabaseService } from './supabase';
import { GoogleCalendarService } from './googleCalendar';
import { parseCancelarCitaCommand, parseReagendarCommand, formatearFechaLegible, formatearHoraLegible } from '../handlers/appointmentService';
import { parseFechaISO, parseHoraISO } from '../handlers/dateParser';

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

interface AgendarResult {
  success?: boolean;
  error?: string;
  needsHelp?: boolean;
  needsPhone?: boolean;
  multipleLeads?: any[];
  nombreLead?: string;
  leadName?: string;
  fecha?: string;
  hora?: string;
  dia?: string;      // día raw del parsing (mañana, viernes, etc)
  ampm?: string;     // am/pm del parsing
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
      const nuevaFecha = parseFechaISO(parsed.dia);
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
          status: 'scheduled'
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
          // Usar formato ISO con timezone de México directamente
          const startISO = `${nuevaFecha}T${nuevaHoraISO}`;
          const endHour = (horaNum + 1) % 24;
          const endISO = `${nuevaFecha}T${String(endHour).padStart(2, '0')}:00:00`;

          await this.calendar.updateEvent(appointment.google_event_id, {
            start: { dateTime: startISO, timeZone: 'America/Mexico_City' },
            end: { dateTime: endISO, timeZone: 'America/Mexico_City' }
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

  // Reagendar cita cuando ya tenemos el lead seleccionado (evita búsqueda por nombre)
  async reagendarCitaConSeleccion(lead: any, dia: string, hora: string, ampm: string, vendedor: any): Promise<ReagendarResult> {
    try {
      console.log('📅 reagendarCitaConSeleccion:', { lead: lead?.name, dia, hora, ampm, vendedor: vendedor?.name });

      // Validar parámetros
      if (!lead?.id || !lead?.name) {
        return { error: 'Lead inválido.' };
      }
      if (!dia) {
        return { error: 'Falta el día. Ejemplo: mañana, lunes, martes' };
      }
      if (!hora) {
        return { error: 'Falta la hora. Ejemplo: 4pm, 10am' };
      }

      // Buscar cita activa del lead
      const { data: appointment, error: appointmentError } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', lead.id)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .single();

      console.log('📅 Cita encontrada:', {
        id: appointment?.id,
        lead_id: appointment?.lead_id,
        fecha_actual: appointment?.scheduled_date,
        hora_actual: appointment?.scheduled_time,
        google_event_id: appointment?.google_event_id,
        error: appointmentError?.message
      });

      if (!appointment) {
        return { error: `${lead.name} no tiene citas pendientes para reagendar.` };
      }

      // Parsear fecha
      const nuevaFecha = parseFechaISO(dia);
      console.log('📅 Fecha parseada:', { dia, nuevaFecha });
      if (!nuevaFecha) {
        return { error: `No entendí la fecha "${dia}".` };
      }

      // Parsear hora
      let horaNum = parseInt(hora);
      if (isNaN(horaNum)) {
        return { error: `No entendí la hora "${hora}".` };
      }
      if (ampm?.toLowerCase() === 'pm' && horaNum < 12) {
        horaNum += 12;
      }
      if (ampm?.toLowerCase() === 'am' && horaNum === 12) {
        horaNum = 0;
      }
      const nuevaHoraISO = `${String(horaNum).padStart(2, '0')}:00:00`;
      console.log('📅 Hora parseada:', { hora, ampm, horaNum, nuevaHoraISO });

      // Actualizar la cita
      console.log('📅 Actualizando cita ID:', appointment.id, 'con fecha:', nuevaFecha, 'hora:', nuevaHoraISO);
      const { error: updateError } = await this.supabase.client
        .from('appointments')
        .update({
          scheduled_date: nuevaFecha,
          scheduled_time: nuevaHoraISO,
          status: 'scheduled'
        })
        .eq('id', appointment.id);

      if (updateError) {
        console.error('❌ Error actualizando cita:', updateError);
        return { error: 'Error actualizando la cita en base de datos.' };
      }
      console.log('✅ Cita actualizada correctamente en BD');

      // Registrar actividad en lead_activities
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: lead.id,
          type: 'whatsapp',
          notes: `Cita reagendada por ${vendedor.name} (nueva: ${formatearFechaLegible(nuevaFecha)} ${formatearHoraLegible(nuevaHoraISO)})`,
          created_by: vendedor.id
        });

      // Actualizar o crear evento en Google Calendar
      console.log('📅 Google Calendar check:', { hasCalendar: !!this.calendar, google_event_id: appointment.google_event_id });
      if (this.calendar) {
        try {
          const startISO = `${nuevaFecha}T${nuevaHoraISO}`;
          const endHour = (horaNum + 1) % 24;
          const endISO = `${nuevaFecha}T${String(endHour).padStart(2, '0')}:00:00`;

          if (appointment.google_event_id) {
            // Actualizar evento existente
            await this.calendar.updateEvent(appointment.google_event_id, {
              start: { dateTime: startISO, timeZone: 'America/Mexico_City' },
              end: { dateTime: endISO, timeZone: 'America/Mexico_City' }
            });
            console.log('✅ Evento de Calendar actualizado');
          } else {
            // Buscar y eliminar eventos existentes con el nombre del lead (evita duplicados)
            console.log('🔍 Buscando eventos existentes para:', lead.name);
            const existingEvents = await this.calendar.findEventsByName(`Cita: ${lead.name}`);
            console.log('🔍 Eventos encontrados:', existingEvents.length);

            // Eliminar eventos existentes del mismo lead
            for (const existingEvent of existingEvents) {
              if (existingEvent.id) {
                console.log('🗑️ Eliminando evento duplicado:', existingEvent.id);
                await this.calendar.deleteEvent(existingEvent.id);
              }
            }

            // Crear nuevo evento con fecha/hora actualizados
            const event = await this.calendar.createEvent({
              summary: `Cita: ${lead.name}`,
              description: `Cita con ${lead.name}\nVendedor: ${vendedor.name}\nTeléfono: ${lead.phone || 'N/A'}`,
              start: { dateTime: startISO, timeZone: 'America/Mexico_City' },
              end: { dateTime: endISO, timeZone: 'America/Mexico_City' }
            });
            if (event?.id) {
              await this.supabase.client
                .from('appointments')
                .update({ google_event_id: event.id })
                .eq('id', appointment.id);
              console.log('✅ Evento de Calendar creado (sin duplicados):', event.id);
            }
          }
        } catch (e) {
          console.log('⚠️ No se pudo crear/actualizar evento en Calendar:', e);
        }
      }

      // Guardar pending_reagendar en el lead para la notificación
      const { data: leadData } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', lead.id)
        .single();

      const currentLeadNotes = typeof leadData?.notes === 'object' ? leadData.notes : {};
      await this.supabase.client
        .from('leads')
        .update({
          notes: {
            ...currentLeadNotes,
            pending_reagendar: {
              vendedor_id: vendedor.id,
              nueva_fecha: nuevaFecha,
              nueva_hora: nuevaHoraISO,
              appointment_id: appointment.id,
              created_at: new Date().toISOString()
            }
          }
        })
        .eq('id', lead.id);
      console.log('📋 pending_reagendar guardado en lead:', lead.name);

      return {
        success: true,
        leadId: lead.id,
        leadName: lead.name,
        leadPhone: lead.phone,
        nuevaFecha: formatearFechaLegible(nuevaFecha),
        nuevaHora: formatearHoraLegible(nuevaHoraISO),
        appointmentId: appointment.id
      };

    } catch (e) {
      console.error('Error reagendando cita con selección:', e);
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

  // ═══════════════════════════════════════════════════════════════════
  // AGENDAR CITA
  // ═══════════════════════════════════════════════════════════════════

  parseAgendarCommand(body: string): { nombreLead?: string; dia?: string; hora?: string; ampm?: string } {
    // Patrones: "agendar cita con Juan mañana 4pm" o "agendar cumpleañero viernes 10am"
    const texto = body.toLowerCase().trim();

    // Extraer nombre del lead
    // Patrones: "agendar cita cumpleañero", "agendar cumpleañero", "cita con juan"
    const nombreMatch = texto.match(/(?:agendar(?:\s+cita)?|cita)\s+(?:con\s+)?([a-záéíóúñ\s]+?)(?:\s+(?:para\s+)?(?:el\s+)?(?:mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\d))/i);
    const nombreLead = nombreMatch ? nombreMatch[1].trim() : undefined;

    // Extraer día
    const diasPatterns = ['hoy', 'mañana', 'pasado mañana', 'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'];
    let dia: string | undefined;
    for (const d of diasPatterns) {
      if (texto.includes(d)) { dia = d; break; }
    }

    // Extraer hora
    const horaMatch = texto.match(/(\d{1,2})\s*(am|pm)?/i);
    const hora = horaMatch ? horaMatch[1] : undefined;
    const ampm = horaMatch ? horaMatch[2] : undefined;

    return { nombreLead, dia, hora, ampm };
  }

  getMensajeAyudaAgendar(): string {
    return `📅 *Para agendar cita escribe:*

"agendar cita con [nombre] [día] [hora]"

*Ejemplos:*
• agendar cita con Ana mañana 4pm
• agendar Juan lunes 10am
• agendar María viernes 3pm`;
  }

  formatAgendarCitaNeedsPhone(nombreLead: string): string {
    return `📅 *Agendar cita con ${nombreLead}*

¿Para cuándo?

*Escribe:*
"agendar ${nombreLead} [día] [hora]"

*Ejemplo:*
agendar ${nombreLead} mañana 4pm`;
  }

  formatMultipleLeadsCita(leads: any[]): string {
    let msg = `🤝 Encontré ${leads.length} leads:\n\n`;
    leads.forEach((l: any, i: number) => {
      msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
    });
    msg += `\nResponde con el *número* para agendar.`;
    return msg;
  }

  formatAgendarCitaExito(result: AgendarResult): string {
    return `✅ *Cita agendada*

👤 ${result.leadName}
📅 ${result.fecha}
🕐 ${result.hora}

¿Le aviso a ${result.leadName}?
*1.* Sí, mándale mensaje
*2.* No, yo le aviso`;
  }

  async agendarCitaCompleto(body: string, vendedor: any): Promise<AgendarResult> {
    try {
      const parsed = this.parseAgendarCommand(body);

      if (!parsed.nombreLead) {
        return { needsHelp: true };
      }

      // Buscar leads que coincidan
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone')
        .eq('assigned_to', vendedor.id)
        .ilike('name', `%${parsed.nombreLead}%`)
        .limit(10);

      if (!leads || leads.length === 0) {
        return { error: `No encontré a "${parsed.nombreLead}" en tus leads.` };
      }

      if (leads.length > 1) {
        return {
          multipleLeads: leads,
          nombreLead: parsed.nombreLead,
          dia: parsed.dia,
          hora: parsed.hora,
          ampm: parsed.ampm
        };
      }

      const lead = leads[0];

      // Verificar si tiene día y hora
      if (!parsed.dia || !parsed.hora) {
        return { needsPhone: true, nombreLead: lead.name };
      }

      // Parsear fecha y hora
      const fechaStr = parseFechaISO(parsed.dia);
      if (!fechaStr) {
        return { error: `No entendí la fecha "${parsed.dia}". Intenta con: mañana, lunes, martes, etc.` };
      }

      let horaNum = parseInt(parsed.hora);
      if (parsed.ampm?.toLowerCase() === 'pm' && horaNum < 12) {
        horaNum += 12;
      }
      if (parsed.ampm?.toLowerCase() === 'am' && horaNum === 12) {
        horaNum = 0;
      }
      const horaISO = `${String(horaNum).padStart(2, '0')}:00:00`;

      // Crear la cita en DB
      const { data: appointment, error: insertError } = await this.supabase.client
        .from('appointments')
        .insert({
          lead_id: lead.id,
          lead_name: lead.name,
          vendedor_id: vendedor.id,
          scheduled_date: fechaStr,
          scheduled_time: horaISO,
          status: 'scheduled',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error insertando cita:', insertError);
        return { error: 'Error al crear la cita en base de datos.' };
      }

      // Registrar actividad
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: lead.id,
          type: 'whatsapp',
          notes: `Cita agendada por ${vendedor.name} (${formatearFechaLegible(fechaStr)} ${formatearHoraLegible(horaISO)})`,
          created_by: vendedor.id
        });
      console.log(`📋 Actividad registrada: Cita agendada para ${lead.name}`);

      // Crear evento en Google Calendar si está disponible
      if (this.calendar) {
        try {
          // Usar formato ISO con timezone de México directamente
          // No usar new Date() porque interpreta como UTC en Workers
          const startISO = `${fechaStr}T${horaISO}`;
          const endHour = (horaNum + 1) % 24;
          const endISO = `${fechaStr}T${String(endHour).padStart(2, '0')}:00:00`;

          const event = await this.calendar.createEvent({
            summary: `Cita: ${lead.name}`,
            description: `Cita con ${lead.name}\nVendedor: ${vendedor.name}\nTeléfono: ${lead.phone || 'N/A'}`,
            start: { dateTime: startISO, timeZone: 'America/Mexico_City' },
            end: { dateTime: endISO, timeZone: 'America/Mexico_City' }
          });

          // Actualizar cita con google_event_id
          if (event?.id) {
            await this.supabase.client
              .from('appointments')
              .update({ google_event_id: event.id })
              .eq('id', appointment.id);
          }
        } catch (e) {
          console.log('⚠️ No se pudo crear evento en Calendar:', e);
        }
      }

      // Actualizar stage del lead
      await this.supabase.client
        .from('leads')
        .update({ stage: 'visit_scheduled', updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      return {
        success: true,
        leadName: lead.name,
        fecha: formatearFechaLegible(fechaStr),
        hora: formatearHoraLegible(horaISO),
        appointmentId: appointment.id
      };

    } catch (e) {
      console.error('Error agendando cita:', e);
      return { error: 'Error interno al agendar cita.' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AGENDAR CITA CON LEAD YA SELECCIONADO
  // ═══════════════════════════════════════════════════════════════════
  async agendarCitaConSeleccion(lead: any, dia: string, hora: string, ampm: string, vendedor: any): Promise<AgendarResult> {
    try {
      console.log('📅 agendarCitaConSeleccion:', { lead: lead?.name, dia, hora, ampm, vendedor: vendedor?.name });

      // Validar parámetros
      if (!lead?.id || !lead?.name) {
        return { error: 'Lead inválido.' };
      }
      if (!dia) {
        return { error: 'Falta el día. Ejemplo: mañana, lunes, martes' };
      }
      if (!hora) {
        return { error: 'Falta la hora. Ejemplo: 4pm, 10am' };
      }

      // Parsear fecha
      const fechaStr = parseFechaISO(dia);
      console.log('📅 Fecha parseada:', { dia, fechaStr });
      if (!fechaStr) {
        return { error: `No entendí la fecha "${dia}".` };
      }

      // Parsear hora
      let horaNum = parseInt(hora);
      if (isNaN(horaNum)) {
        return { error: `No entendí la hora "${hora}".` };
      }
      if (ampm?.toLowerCase() === 'pm' && horaNum < 12) {
        horaNum += 12;
      }
      if (ampm?.toLowerCase() === 'am' && horaNum === 12) {
        horaNum = 0;
      }
      const horaISO = `${String(horaNum).padStart(2, '0')}:00:00`;
      console.log('📅 Hora parseada:', { hora, ampm, horaNum, horaISO });

      // Crear la cita en DB
      const { data: appointment, error: insertError } = await this.supabase.client
        .from('appointments')
        .insert({
          lead_id: lead.id,
          lead_name: lead.name,
          vendedor_id: vendedor.id,
          scheduled_date: fechaStr,
          scheduled_time: horaISO,
          status: 'scheduled',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error insertando cita:', insertError);
        return { error: 'Error al crear la cita.' };
      }

      // Registrar actividad
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: lead.id,
          type: 'whatsapp',
          notes: `Cita agendada por ${vendedor.name} (${formatearFechaLegible(fechaStr)} ${formatearHoraLegible(horaISO)})`,
          created_by: vendedor.id
        });

      // Crear evento en Google Calendar
      if (this.calendar) {
        try {
          // Usar formato ISO con timezone de México directamente
          // No usar new Date() porque interpreta como UTC en Workers
          const startISO = `${fechaStr}T${horaISO}`;
          // Calcular hora de fin (+1 hora)
          const endHour = (horaNum + 1) % 24;
          const endISO = `${fechaStr}T${String(endHour).padStart(2, '0')}:00:00`;

          const event = await this.calendar.createEvent({
            summary: `Cita: ${lead.name}`,
            description: `Cita con ${lead.name}\nVendedor: ${vendedor.name}\nTeléfono: ${lead.phone || 'N/A'}`,
            start: { dateTime: startISO, timeZone: 'America/Mexico_City' },
            end: { dateTime: endISO, timeZone: 'America/Mexico_City' }
          });

          if (event?.id) {
            await this.supabase.client
              .from('appointments')
              .update({ google_event_id: event.id })
              .eq('id', appointment.id);
          }
        } catch (e) {
          console.log('⚠️ No se pudo crear evento en Calendar:', e);
        }
      }

      // Actualizar stage del lead
      await this.supabase.client
        .from('leads')
        .update({ stage: 'visit_scheduled', updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      return {
        success: true,
        leadName: lead.name,
        fecha: formatearFechaLegible(fechaStr),
        hora: formatearHoraLegible(horaISO),
        appointmentId: appointment.id
      };

    } catch (e) {
      console.error('Error agendando cita con selección:', e);
      return { error: 'Error interno al agendar cita.' };
    }
  }
}
