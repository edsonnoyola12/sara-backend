import { SupabaseService } from './supabase';
import { CalendarService as GoogleCalendarService } from './calendar';
import { parseCancelarCitaCommand, parseReagendarCommand, formatearFechaLegible, formatearHoraLegible } from '../handlers/appointmentService';
import { parseFechaISO, parseHoraISO } from '../handlers/dateParser';
import { parseHora } from '../utils/vendedorParsers';
import { findLeadByName } from '../handlers/whatsapp-utils';

interface CancelarResult {
  success?: boolean;
  error?: string;
  multipleLeads?: any[];
  leadName?: string;
  leadPhone?: string;  // Para notificar al lead
  fechaStr?: string;
  horaStr?: string;
  appointmentId?: string;
  leadId?: string;     // Para el flujo de notificación
}

interface ReagendarResult {
  success?: boolean;
  error?: string;
  needsHelp?: boolean;
  needsDateTime?: boolean;
  multipleLeads?: any[];
  nombreLead?: string;
  leadName?: string;
  leadId?: string;
  leadPhone?: string;
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
  leadPhone?: string;  // para notificación
  fecha?: string;
  hora?: string;
  dia?: string;      // día raw del parsing (mañana, viernes, etc)
  minutos?: string;  // minutos del parsing (00-59)
  ampm?: string;     // am/pm del parsing
  desarrollo?: string; // desarrollo del comando
  appointmentId?: string;
  ubicacion?: string;  // dirección del desarrollo
  gpsLink?: string;    // link de Google Maps
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
      // Buscar leads que coincidan (con fallback accent-tolerant)
      const leads = await findLeadByName(this.supabase, nombreLead, {
        select: 'id, name, phone',
        limit: 10
      });

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
          console.error('⚠️ No se pudo eliminar evento de Calendar:', e);
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
      console.log(`🗑️ CANCELAR CITA - Lead: ${leadName} (${leadId})`);

      // Buscar cita activa del lead
      const { data: appointment, error: appError } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', leadId)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .single();

      console.log(`🗑️ Cita encontrada:`, appointment ? `ID=${appointment.id}, status=${appointment.status}` : 'ninguna', appError ? `error=${appError.message}` : '');

      if (!appointment) {
        return { error: `${leadName} no tiene citas pendientes.` };
      }

      // Buscar teléfono del lead
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('phone')
        .eq('id', leadId)
        .single();
      console.log(`🗑️ Teléfono del lead:`, lead?.phone || 'no tiene');

      // Cancelar la cita en Supabase
      const { error: updateError } = await this.supabase.client
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: vendedor.name
        })
        .eq('id', appointment.id);

      if (updateError) {
        console.error(`🗑️ ❌ Error actualizando cita en Supabase:`, updateError);
        return { error: 'Error al cancelar en la base de datos.' };
      }
      console.log(`🗑️ ✅ Cita actualizada a status=cancelled en Supabase`);

      // Registrar actividad en lead_activities
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          type: 'whatsapp',
          notes: `Cita cancelada por ${vendedor.name} (era: ${formatearFechaLegible(appointment.scheduled_date)} ${formatearHoraLegible(appointment.scheduled_time)})`,
          created_by: vendedor.id
        });
      console.log(`🗑️ ✅ Actividad registrada en lead_activities`);

      // Cancelar en Google Calendar
      if (this.calendar) {
        let calendarDeleted = false;

        // Primero intentar con el event_id guardado
        if (appointment.google_event_id) {
          try {
            await this.calendar.deleteEvent(appointment.google_event_id);
            calendarDeleted = true;
            console.log(`🗑️ ✅ Evento eliminado de Calendar por ID: ${appointment.google_event_id}`);
          } catch (e) {
            console.log(`🗑️ ⚠️ No se pudo eliminar por ID, buscando por nombre...`);
          }
        }

        // Si no hay event_id o falló, buscar por nombre del lead
        if (!calendarDeleted) {
          try {
            const existingEvents = await this.calendar.findEventsByName(`Cita: ${leadName}`);
            console.log(`🗑️ Eventos encontrados en Calendar para "${leadName}":`, existingEvents.length);

            for (const event of existingEvents) {
              if (event.id) {
                await this.calendar.deleteEvent(event.id);
                console.log(`🗑️ ✅ Evento eliminado de Calendar: ${event.id}`);
                calendarDeleted = true;
              }
            }
          } catch (e) {
            console.log(`🗑️ ⚠️ Error buscando/eliminando eventos por nombre:`, e);
          }
        }

        if (!calendarDeleted) {
          console.log(`🗑️ ⚠️ No se encontró evento en Calendar para eliminar`);
        }
      } else {
        console.log(`🗑️ ⚠️ Calendar service no disponible`);
      }

      return {
        success: true,
        leadName: leadName,
        leadId: leadId,
        leadPhone: lead?.phone || undefined,
        fechaStr: formatearFechaLegible(appointment.scheduled_date),
        horaStr: formatearHoraLegible(appointment.scheduled_time),
        appointmentId: appointment.id
      };

    } catch (e) {
      console.error('🗑️ ❌ Error cancelando cita por ID:', e);
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

      // Buscar leads que coincidan (con fallback accent-tolerant)
      const leads = await findLeadByName(this.supabase, parsed.nombreLead, {
        select: 'id, name, phone',
        limit: 10
      });

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
          console.error('⚠️ No se pudo actualizar evento en Calendar:', e);
        }
      }

      return {
        success: true,
        leadName: lead.name,
        leadId: lead.id,
        leadPhone: lead.phone,
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
  async reagendarCitaConSeleccion(lead: any, dia: string, hora: string, ampm: string, vendedor: any, minutos?: string): Promise<ReagendarResult> {
    try {
      console.log('📅 reagendarCitaConSeleccion:', { lead: lead?.name, dia, hora, minutos, ampm, vendedor: vendedor?.name });

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
      const mins = minutos || '00';
      const nuevaHoraISO = `${String(horaNum).padStart(2, '0')}:${mins}:00`;
      console.log('📅 Hora parseada:', { hora, minutos: mins, ampm, horaNum, nuevaHoraISO });

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
          console.error('⚠️ No se pudo crear/actualizar evento en Calendar:', e);
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

  parseAgendarCommand(body: string): { nombreLead?: string; dia?: string; hora?: string; minutos?: string; ampm?: string; desarrollo?: string } {
    // Patrones: "agendar cita con Juan mañana 4pm Distrito Falco"
    let texto = body.toLowerCase().trim();

    // ═══ NORMALIZAR ERRORES COMUNES ═══
    // Errores de "mañana"
    texto = texto.replace(/mañnaa|mañaan|manana|mannana|mñana|ma[ñn]a+na/gi, 'mañana');
    // Errores de días
    texto = texto.replace(/lune?s?(?![\w])/gi, 'lunes');
    texto = texto.replace(/marte?s?(?![\w])/gi, 'martes');
    texto = texto.replace(/miercole?s?|miércole?s?/gi, 'miercoles');
    texto = texto.replace(/jueve?s?(?![\w])/gi, 'jueves');
    texto = texto.replace(/vierne?s?(?![\w])/gi, 'viernes');
    texto = texto.replace(/sabad?o?|sabádo?/gi, 'sabado');
    texto = texto.replace(/doming?o?(?![\w])/gi, 'domingo');
    // Quitar "a las", "a la", "a kas", "alas", etc.
    texto = texto.replace(/\s+a\s*(las?|kas?|l|k)\s+/gi, ' ');
    texto = texto.replace(/\s+alas\s+/gi, ' ');
    // Quitar "para el", "el", "para"
    texto = texto.replace(/\s+(para\s+el|para|el)\s+/gi, ' ');
    // Normalizar espacios múltiples
    texto = texto.replace(/\s+/g, ' ').trim();

    // ═══ EXTRAER NOMBRE DEL LEAD ═══
    const nombreMatch = texto.match(/(?:agendar(?:\s+cita)?|cita)\s+(?:con\s+)?([a-záéíóúñ\s]+?)(?:\s+(?:mañana|hoy|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d))/i);
    const nombreLead = nombreMatch ? nombreMatch[1].trim() : undefined;

    // ═══ EXTRAER DÍA ═══
    const diasPatterns = ['hoy', 'mañana', 'pasado mañana', 'pasado', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    let dia: string | undefined;
    for (const d of diasPatterns) {
      if (texto.includes(d)) { dia = d; break; }
    }

    // ═══ EXTRAER HORA ═══
    const { hora, minutos, ampm } = parseHora(texto);

    // ═══ EXTRAER DESARROLLO ═══
    let desarrollo: string | undefined;
    const desarrolloMatch = body.match(/(?:\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(?:en\s+)?(.+)$/i);
    if (desarrolloMatch) {
      desarrollo = desarrolloMatch[1].trim();
    }

    return { nombreLead, dia, hora, minutos, ampm, desarrollo };
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
    // Formatear teléfono del lead
    const leadPhoneFormatted = result.leadPhone
      ? result.leadPhone.replace(/\D/g, '').slice(-10)
      : '';

    let msg = `✅ *Cita agendada*

👤 ${result.leadName}`;

    if (leadPhoneFormatted) {
      msg += `\n📱 ${leadPhoneFormatted}`;
    }

    msg += `\n📅 ${result.fecha}
🕐 ${result.hora}`;

    if (result.ubicacion && result.ubicacion !== 'Por confirmar') {
      msg += `\n📍 ${result.ubicacion}`;
    }
    if (result.gpsLink) {
      msg += `\n🗺️ ${result.gpsLink}`;
    }

    msg += `\n\n¿Le aviso a ${result.leadName}?
*1.* Sí, mándale mensaje
*2.* No, yo le aviso`;

    return msg;
  }

  async agendarCitaCompleto(body: string, vendedor: any): Promise<AgendarResult> {
    try {
      const parsed = this.parseAgendarCommand(body);

      if (!parsed.nombreLead) {
        return { needsHelp: true };
      }

      // Buscar leads que coincidan (incluir property_interest para ubicación)
      const leads = await findLeadByName(this.supabase, parsed.nombreLead, {
        vendedorId: vendedor.id,
        select: 'id, name, phone, property_interest',
        limit: 10
      });

      if (!leads || leads.length === 0) {
        return { error: `No encontré a "${parsed.nombreLead}" en tus leads.` };
      }

      if (leads.length > 1) {
        return {
          multipleLeads: leads,
          nombreLead: parsed.nombreLead,
          dia: parsed.dia,
          hora: parsed.hora,
          minutos: parsed.minutos,
          ampm: parsed.ampm,
          desarrollo: parsed.desarrollo
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
      const mins = parsed.minutos || '00';
      const horaISO = `${String(horaNum).padStart(2, '0')}:${mins}:00`;
      console.log('📅 Hora parseada para agendar:', { hora: parsed.hora, minutos: mins, ampm: parsed.ampm, horaNum, horaISO });

      // Buscar ubicación: primero del desarrollo en comando, luego del property_interest del lead
      let ubicacion = 'Por confirmar';
      let gpsLink = '';
      const desarrolloBuscar = parsed.desarrollo || lead.property_interest;
      console.log('🔍 Desarrollo a buscar:', desarrolloBuscar);

      if (desarrolloBuscar) {
        const { data: propData } = await this.supabase.client
          .from('properties')
          .select('name, development, address, location, gps_link')
          .or(`name.ilike.%${desarrolloBuscar}%,development.ilike.%${desarrolloBuscar}%`)
          .limit(1)
          .single();

        if (propData) {
          ubicacion = propData.address || propData.location || propData.development || desarrolloBuscar;
          gpsLink = propData.gps_link || '';
          console.log('📍 Ubicación encontrada:', { ubicacion, gpsLink: gpsLink ? 'SÍ' : 'NO' });
        } else {
          console.error('⚠️ No se encontró propiedad para:', desarrolloBuscar);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // CANCELAR CITAS ANTERIORES (evita duplicados al reagendar)
      // ═══════════════════════════════════════════════════════════════
      const { data: citasAnteriores } = await this.supabase.client
        .from('appointments')
        .select('id, scheduled_date, scheduled_time, google_event_id')
        .eq('lead_id', lead.id)
        .in('status', ['scheduled', 'confirmed']);

      if (citasAnteriores && citasAnteriores.length > 0) {
        console.log(`📅 Cancelando ${citasAnteriores.length} cita(s) anterior(es) del lead ${lead.id}`);
        for (const citaAnterior of citasAnteriores) {
          // Cancelar en DB
          await this.supabase.client
            .from('appointments')
            .update({
              status: 'cancelled',
              cancellation_reason: 'Reagendada automáticamente',
              updated_at: new Date().toISOString()
            })
            .eq('id', citaAnterior.id);

          // Cancelar en Google Calendar si tiene evento
          if (citaAnterior.google_event_id && this.calendar) {
            try {
              await this.calendar.deleteEvent(citaAnterior.google_event_id);
              console.log(`   🗑️ Evento Calendar eliminado: ${citaAnterior.google_event_id}`);
            } catch (e) {
              console.error('   ⚠️ Error eliminando evento Calendar:', e);
            }
          }

          console.log(`   🗑️ Cita ${citaAnterior.id} (${citaAnterior.scheduled_date} ${citaAnterior.scheduled_time}) cancelada`);
        }
      }

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
          location: ubicacion,
          property_name: parsed.desarrollo || lead.property_interest || '',
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
          const endISO = `${fechaStr}T${String(endHour).padStart(2, '0')}:${mins}:00`;

          const event = await this.calendar.createEvent({
            summary: `Cita: ${lead.name}`,
            description: `Cita con ${lead.name}\nVendedor: ${vendedor.name}\nTeléfono: ${lead.phone || 'N/A'}${gpsLink ? '\nMaps: ' + gpsLink : ''}`,
            location: ubicacion,
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
          console.error('⚠️ No se pudo crear evento en Calendar:', e);
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
        leadPhone: lead.phone,
        fecha: formatearFechaLegible(fechaStr),
        hora: formatearHoraLegible(horaISO),
        appointmentId: appointment.id,
        ubicacion,
        gpsLink
      };

    } catch (e) {
      console.error('Error agendando cita:', e);
      return { error: 'Error interno al agendar cita.' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AGENDAR CITA CON LEAD YA SELECCIONADO
  // ═══════════════════════════════════════════════════════════════════
  async agendarCitaConSeleccion(lead: any, dia: string, hora: string, ampm: string, vendedor: any, minutos?: string, desarrollo?: string): Promise<AgendarResult> {
    try {
      console.log('📅 agendarCitaConSeleccion:', { lead: lead?.name, dia, hora, minutos, ampm, desarrollo, vendedor: vendedor?.name });

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
      const mins = minutos || '00';
      const horaISO = `${String(horaNum).padStart(2, '0')}:${mins}:00`;
      console.log('📅 Hora parseada:', { hora, minutos: mins, ampm, horaNum, horaISO });

      // Buscar ubicación: primero del desarrollo del comando, luego del property_interest del lead
      let ubicacion = 'Por confirmar';
      let gpsLink = '';
      const desarrolloBuscar = desarrollo || lead.property_interest;
      console.log('🔍 Desarrollo a buscar (selección):', desarrolloBuscar);

      if (desarrolloBuscar) {
        const { data: propData } = await this.supabase.client
          .from('properties')
          .select('name, development, address, location, gps_link')
          .or(`name.ilike.%${desarrolloBuscar}%,development.ilike.%${desarrolloBuscar}%`)
          .limit(1)
          .single();

        if (propData) {
          ubicacion = propData.address || propData.location || propData.development || desarrolloBuscar;
          gpsLink = propData.gps_link || '';
          console.log('📍 Ubicación encontrada:', { ubicacion, gpsLink: gpsLink ? 'SÍ' : 'NO' });
        } else {
          console.error('⚠️ No se encontró propiedad para:', desarrolloBuscar);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // CANCELAR CITAS ANTERIORES (evita duplicados al reagendar)
      // ═══════════════════════════════════════════════════════════════
      const { data: citasAnteriores } = await this.supabase.client
        .from('appointments')
        .select('id, scheduled_date, scheduled_time, google_event_id')
        .eq('lead_id', lead.id)
        .in('status', ['scheduled', 'confirmed']);

      if (citasAnteriores && citasAnteriores.length > 0) {
        console.log(`📅 Cancelando ${citasAnteriores.length} cita(s) anterior(es) del lead ${lead.id}`);
        for (const citaAnterior of citasAnteriores) {
          // Cancelar en DB
          await this.supabase.client
            .from('appointments')
            .update({
              status: 'cancelled',
              cancellation_reason: 'Reagendada automáticamente',
              updated_at: new Date().toISOString()
            })
            .eq('id', citaAnterior.id);

          // Cancelar en Google Calendar si tiene evento
          if (citaAnterior.google_event_id && this.calendar) {
            try {
              await this.calendar.deleteEvent(citaAnterior.google_event_id);
              console.log(`   🗑️ Evento Calendar eliminado: ${citaAnterior.google_event_id}`);
            } catch (e) {
              console.error('   ⚠️ Error eliminando evento Calendar:', e);
            }
          }

          console.log(`   🗑️ Cita ${citaAnterior.id} (${citaAnterior.scheduled_date} ${citaAnterior.scheduled_time}) cancelada`);
        }
      }

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
          location: ubicacion,
          property_name: desarrollo || lead.property_interest || '',
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
          const endISO = `${fechaStr}T${String(endHour).padStart(2, '0')}:${mins}:00`;

          const event = await this.calendar.createEvent({
            summary: `Cita: ${lead.name}`,
            description: `Cita con ${lead.name}\nVendedor: ${vendedor.name}\nTeléfono: ${lead.phone || 'N/A'}${gpsLink ? '\nMaps: ' + gpsLink : ''}`,
            location: ubicacion,
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
          console.error('⚠️ No se pudo crear evento en Calendar:', e);
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
        leadPhone: lead.phone,
        fecha: formatearFechaLegible(fechaStr),
        hora: formatearHoraLegible(horaISO),
        appointmentId: appointment.id,
        ubicacion,
        gpsLink
      };

    } catch (e) {
      console.error('Error agendando cita con selección:', e);
      return { error: 'Error interno al agendar cita.' };
    }
  }
}
