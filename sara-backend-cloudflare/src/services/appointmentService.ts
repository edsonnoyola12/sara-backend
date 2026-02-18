import { SupabaseService } from './supabase';
import { CalendarService } from './calendar';
import { TwilioService } from './twilio';
import { HORARIOS } from '../handlers/constants';
import { parseFecha as parseFechaCentral, parseFechaISO as parseFechaISOCentral, parseHoraISO as parseHoraISOCentral } from '../utils/dateParser';
import { formatPhoneForDisplay } from '../handlers/whatsapp-utils';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CrearCitaParams {
  from: string;
  cleanPhone: string;
  lead: any;
  desarrollo: string;
  fecha: string;
  hora: string;
  teamMembers: any[];
  analysis: any;
  properties: any[];
  env: any;
  isReschedule?: boolean;  // ← Para saltarse verificación de duplicados en reagendamientos
}

export interface CrearCitaResult {
  success: boolean;
  error?: string;
  errorType?: 'duplicate' | 'out_of_hours' | 'db_error';
  horaInvalida?: { horaNumero: number; horaInicio: number; horaFin: number; esSabado: boolean };
  appointment?: any;
  vendedor?: any;
  asesorHipotecario?: any;
  direccion?: string;
  gpsLink?: string;
  clientName?: string;
  score?: number;
  temp?: string;
  necesitaCredito?: boolean;
  needsBirthdayQuestion?: boolean;
  calendarEventoVendedorId?: string;
  calendarEventoAsesorId?: string;
}

export class AppointmentService {
  private supabase: SupabaseService;
  private calendar: CalendarService;
  private twilio: TwilioService;

  constructor(supabase: SupabaseService, calendar: CalendarService, twilio: TwilioService) {
    this.supabase = supabase;
    this.calendar = calendar;
    this.twilio = twilio;
  }

  // NOTA: El método principal para crear citas es crearCitaCompleta()
  // createAppointment() fue eliminado por ser código muerto con signature incorrecta

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
          console.error('⚠️ No se pudo cancelar en Google (continuamos)');
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
📱 ${formatPhoneForDisplay(lead.phone)}
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CREAR CITA COMPLETA - Migrado de whatsapp.ts
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async crearCitaCompleta(params: CrearCitaParams): Promise<CrearCitaResult> {
    const { from, cleanPhone, lead, desarrollo, fecha, hora, teamMembers, analysis, properties, env, isReschedule } = params;

    // Validación defensiva
    const teamMembersArray = Array.isArray(teamMembers) ? teamMembers : [];
    const propertiesArray = Array.isArray(properties) ? properties : [];

    // Buscar vendedor y asesor
    const vendedor = teamMembersArray.find(t => t.id === lead.assigned_to);
    const asesorHipotecario = teamMembersArray.find(t =>
      t.role?.toLowerCase().includes('hipotec') ||
      t.role?.toLowerCase().includes('credito') ||
      t.role?.toLowerCase().includes('crédito') ||
      t.role?.toLowerCase().includes('financ') ||
      t.role?.toLowerCase().includes('asesor') ||
      t.position?.toLowerCase().includes('hipotec') ||
      t.position?.toLowerCase().includes('credito') ||
      t.name?.toLowerCase().includes('asesor')
    );

    console.log('👤 Vendedor:', vendedor?.name || 'NO', '| Asesor:', asesorHipotecario?.name || 'NO');

    const clientNameFull = analysis.extracted_data?.nombre || lead.name || 'Cliente';
    const clientName = clientNameFull !== 'Cliente' ? clientNameFull.split(' ')[0] : 'Cliente';
    const score = lead.lead_score || 0;
    const temp = score >= 70 ? 'HOT 🔥' : score >= 40 ? 'WARM ⚠️' : 'COLD ❄️';
    const necesitaCredito = analysis.extracted_data?.quiere_asesor === true;

    // Buscar propiedad para dirección y GPS
    let desarrolloBusqueda = desarrollo;
    if (desarrollo.includes(',')) {
      desarrolloBusqueda = desarrollo.split(',')[0].trim();
    }

    console.log('🔍 Buscando GPS para desarrollo:', desarrolloBusqueda);

    // Búsqueda 1: Por nombre de desarrollo exacto/parcial
    let propDesarrollo = propertiesArray.find(p =>
      p.development?.toLowerCase().includes(desarrolloBusqueda.toLowerCase())
    );

    // Búsqueda 2: Si no encontró, intentar con nombre de propiedad
    if (!propDesarrollo) {
      propDesarrollo = propertiesArray.find(p =>
        p.name?.toLowerCase().includes(desarrolloBusqueda.toLowerCase())
      );
    }

    // Búsqueda 3: Búsqueda inversa (el nombre de la propiedad contiene parte del desarrollo buscado)
    if (!propDesarrollo) {
      const palabrasClave = desarrolloBusqueda.toLowerCase().split(' ');
      propDesarrollo = propertiesArray.find(p =>
        palabrasClave.some(palabra =>
          palabra.length > 3 && (p.development?.toLowerCase().includes(palabra) || p.name?.toLowerCase().includes(palabra))
        )
      );
    }

    console.log('🔍 Propiedad encontrada:', propDesarrollo?.development || propDesarrollo?.name || 'NO ENCONTRADA');
    console.log('🔍 GPS disponible:', propDesarrollo?.gps_link ? 'SÍ' : 'NO');

    const direccion = propDesarrollo?.address || propDesarrollo?.location || `Fraccionamiento ${desarrolloBusqueda}, Zacatecas`;
    const gpsLink = propDesarrollo?.gps_link || '';

    // Verificar si ya existe una cita reciente (últimos 30 minutos) - EXCLUIR CANCELADAS y REAGENDADAS
    // ═══ SKIP si es un RESCHEDULE - ya marcamos la cita anterior como rescheduled ═══
    if (!isReschedule) {
      try {
        const { data: citaExistente } = await this.supabase.client
          .from('appointments')
          .select('id, created_at, lead_name, status')
          .eq('lead_id', lead.id)
          .not('status', 'in', '("cancelled","rescheduled")')  // ← FIX: No contar citas canceladas ni reagendadas
          .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (citaExistente && citaExistente.length > 0) {
          console.error('⚠️ Ya existe cita reciente para este lead (status:', citaExistente[0].status, ')');
          if (analysis.extracted_data?.nombre && !citaExistente[0].lead_name) {
            await this.supabase.client
              .from('appointments')
              .update({ lead_name: analysis.extracted_data?.nombre })
              .eq('id', citaExistente[0].id);
          }
          return { success: false, errorType: 'duplicate' };
        }
      } catch (e) {
        console.error('⚠️ Error verificando cita existente:', e);
      }
    } else {
      console.log('🔄 RESCHEDULE: Saltando verificación de duplicados');
    }

    // Validar horario del vendedor
    const parseHoraV = (v: any, d: number) => !v ? d : typeof v === 'number' ? v : parseInt(String(v).split(':')[0]) || d;
    const horaInicioVendedor = parseHoraV(vendedor?.work_start, HORARIOS.HORA_INICIO_DEFAULT);
    const horaFinVendedorBase = parseHoraV(vendedor?.work_end, HORARIOS.HORA_FIN_DEFAULT);
    const horaNumero = parseInt(hora.split(':')[0]) || parseInt(hora) || 0;
    const fechaCita = this.parseFecha(fecha, hora);
    const esSabado = fechaCita.getDay() === 6;
    const horaFinVendedor = esSabado ? HORARIOS.HORA_FIN_SABADO : horaFinVendedorBase;

    console.log(`📅 Validando hora: ${horaNumero}:00 vs horario: ${horaInicioVendedor}-${horaFinVendedor}`);

    if (horaNumero < horaInicioVendedor || horaNumero >= horaFinVendedor) {
      return {
        success: false,
        errorType: 'out_of_hours',
        horaInvalida: { horaNumero, horaInicio: horaInicioVendedor, horaFin: horaFinVendedor, esSabado },
        clientName
      };
    }

    // Crear cita en DB
    const { data: appointment, error } = await this.supabase.client
      .from('appointments')
      .insert([{
        lead_id: lead.id,
        lead_name: clientName,
        lead_phone: cleanPhone,
        property_name: desarrollo,
        location: direccion,
        scheduled_date: this.parseFechaISO(fecha),
        scheduled_time: this.parseHoraISO(hora),
        status: 'scheduled',
        vendedor_id: vendedor?.id,
        vendedor_name: vendedor?.name,
        appointment_type: 'visita',
        duration_minutes: 60
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creando cita en DB:', error);
      return { success: false, errorType: 'db_error', error: error.message };
    }

    console.log('📅 Cita creada en DB:', appointment?.id);

    // Actualizar status del lead a 'scheduled'
    try {
      await this.supabase.client
        .from('leads')
        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', lead.id);
    } catch (e) {
      console.error('⚠️ Error actualizando status del lead:', e);
    }

    // Registrar actividad
    try {
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: lead.id,
          team_member_id: vendedor?.id || null,
          activity_type: 'appointment_scheduled',
          notes: `Cita agendada en ${desarrollo} para ${fecha} a las ${hora}`,
          created_at: new Date().toISOString()
        });
    } catch (e) {
      console.error('⚠️ Error registrando actividad:', e);
    }

    // Crear eventos en Google Calendar
    let calendarEventoVendedorId: string | undefined;
    let calendarEventoAsesorId: string | undefined;

    const fechaEvento = this.parseFecha(fecha, hora);
    const endEvento = new Date(fechaEvento.getTime() + 60 * 60 * 1000);
    const formatDateForCalendar = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    };

    const startDateTime = formatDateForCalendar(fechaEvento);
    const endDateTime = formatDateForCalendar(endEvento);

    // Evento vendedor
    try {
      const calendarLocal = new CalendarService(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        env.GOOGLE_PRIVATE_KEY,
        env.GOOGLE_CALENDAR_ID
      );

      const eventData: any = {
        summary: `🏠 Visita ${desarrollo} - ${clientName}`,
        description: `👤 Cliente: ${clientName}\n📱 Teléfono: ${formatPhoneForDisplay(cleanPhone)}\n🏠 Desarrollo: ${desarrollo}\n📍 Dirección: ${direccion}\n🗺️ GPS: ${gpsLink}\n📊 Score: ${score}/100 ${temp}\n💳 Necesita crédito: ${necesitaCredito ? 'SÍ' : 'No especificado'}\n👤 Vendedor: ${vendedor?.name || 'Por asignar'}`,
        location: direccion,
        start: { dateTime: startDateTime, timeZone: 'America/Mexico_City' },
        end: { dateTime: endDateTime, timeZone: 'America/Mexico_City' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 },
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 30 }
          ]
        }
      };

      const eventResult = await calendarLocal.createEvent(eventData);
      calendarEventoVendedorId = eventResult?.id;
      console.log('📅 Evento vendedor creado:', calendarEventoVendedorId);

      if (appointment?.id && calendarEventoVendedorId) {
        await this.supabase.client
          .from('appointments')
          .update({ google_event_vendedor_id: calendarEventoVendedorId })
          .eq('id', appointment.id);
      }

      // Evento asesor (si necesita crédito)
      if (necesitaCredito && asesorHipotecario?.email) {
        const eventAsesorData: any = {
          summary: `💳 Asesoría Crédito - ${clientName} (${desarrollo})`,
          description: `👤 Cliente: ${clientName}\n📱 Teléfono: ${formatPhoneForDisplay(cleanPhone)}\n🏠 Desarrollo: ${desarrollo}\n📍 Dirección: ${direccion}\n🗺️ GPS: ${gpsLink}\n📊 Score: ${score}/100 ${temp}\n👤 Vendedor: ${vendedor?.name || 'Por asignar'}`,
          location: direccion,
          start: { dateTime: startDateTime, timeZone: 'America/Mexico_City' },
          end: { dateTime: endDateTime, timeZone: 'America/Mexico_City' },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 1440 },
              { method: 'email', minutes: 60 },
              { method: 'popup', minutes: 30 }
            ]
          }
        };
        const eventAsesor = await calendarLocal.createEvent(eventAsesorData);
        calendarEventoAsesorId = eventAsesor?.id;
        console.log('📅 Evento asesor creado:', calendarEventoAsesorId);
      }
    } catch (calError: any) {
      console.error('❌ Error Calendar:', calError);
      if (appointment?.id) {
        await this.supabase.client
          .from('appointments')
          .update({ notes: `Calendar Error: ${calError?.message || String(calError)}` })
          .eq('id', appointment.id);
      }
    }

    // Marcar pending_birthday si no tiene
    const needsBirthdayQuestion = !lead.birthday;
    if (needsBirthdayQuestion) {
      try {
        const notasActuales = typeof lead.notes === 'object' ? lead.notes : {};
        await this.supabase.client
          .from('leads')
          .update({ notes: { ...notasActuales, pending_birthday_response: true } })
          .eq('id', lead.id);
      } catch (e) {
        console.error('⚠️ Error marcando pending_birthday');
      }
    }

    // Marcar cita como confirmada
    try {
      if (appointment?.id) {
        await this.supabase.client.from('appointments').update({
          confirmation_sent: true,
          confirmation_sent_at: new Date().toISOString()
        }).eq('id', appointment.id);
      }
    } catch (e) {
      console.error('⚠️ Error marcando confirmación');
    }

    // Actualizar score del lead
    try {
      let nuevoScore = lead.lead_score || 0;
      nuevoScore += 30;
      if (necesitaCredito) nuevoScore += 20;
      nuevoScore = Math.min(100, nuevoScore);

      await this.supabase.client
        .from('leads')
        .update({ lead_score: nuevoScore })
        .eq('id', lead.id);
      console.log('📊 Score actualizado:', nuevoScore);
    } catch (e) {
      console.error('⚠️ Error actualizando score');
    }

    console.log('✅ CITA COMPLETA CREADA');

    return {
      success: true,
      appointment,
      vendedor,
      asesorHipotecario,
      direccion,
      gpsLink,
      clientName,
      score,
      temp,
      necesitaCredito,
      needsBirthdayQuestion,
      calendarEventoVendedorId,
      calendarEventoAsesorId
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FORMATTERS PARA MENSAJES DE CITA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  formatMensajeHoraInvalida(result: CrearCitaResult): string {
    const { horaInvalida, clientName } = result;
    if (!horaInvalida) return '';
    const { horaNumero, horaInicio, horaFin, esSabado } = horaInvalida;
    const nombreCliente = clientName !== 'Cliente' ? clientName : '';
    const horaFinTexto = horaFin > 12 ? (horaFin - 12) + ':00 PM' : horaFin + ':00 AM';
    const diaTexto = esSabado ? ' los sábados' : '';
    return `⚠️ ${nombreCliente ? nombreCliente + ', las' : 'Las'} *${horaNumero}:00* está fuera de nuestro horario de atención${diaTexto}.\n\n📅 *Horario disponible${diaTexto}:* ${horaInicio}:00 AM a ${horaFinTexto}\n\n¿A qué hora dentro de este horario te gustaría visitarnos? 😊`;
  }

  formatMensajeVendedorNuevaCita(result: CrearCitaResult, desarrollo: string, fecha: string, hora: string): string {
    const { clientName, cleanPhone, score, temp, necesitaCredito, direccion, gpsLink } = result as any;
    return `👋👋👋 *¡NUEVA CITA!* 👋👋👋
━━━━━━━━━━━━━━━━━━━━

🏠 *${desarrollo}*
📅 *${fecha}* a las *${hora}*

━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone ? formatPhoneForDisplay(cleanPhone) : ''}
📊 *Score:* ${score}/100 ${temp}
💳 *Crédito:* ${necesitaCredito ? '⚠️ SÍ NECESITA' : 'No especificado'}

━━━━━━━━━━━━━━━━━━━━

📍 ${direccion}
🗺️ ${gpsLink}

━━━━━━━━━━━━━━━━━━━━
📅 *Ver en Calendar:*
https://calendar.google.com/calendar/u/1/r

━━━━━━━━━━━━━━━━━━━━
⚠️ *PREPÁRATE PARA RECIBIRLO* ⚠️`;
  }

  // ═══ MENSAJE PARA REAGENDAMIENTO ═══
  formatMensajeVendedorReagendamiento(
    result: CrearCitaResult,
    desarrollo: string,
    nuevaFecha: string,
    nuevaHora: string,
    fechaAnterior?: string,
    horaAnterior?: string
  ): string {
    const { clientName, cleanPhone, score, temp, necesitaCredito, direccion, gpsLink } = result as any;

    const cambioTexto = fechaAnterior && horaAnterior
      ? `\n❌ *Antes:* ${fechaAnterior} a las ${horaAnterior}\n✅ *Ahora:* ${nuevaFecha} a las ${nuevaHora}`
      : `\n📅 *Nueva fecha:* ${nuevaFecha} a las ${nuevaHora}`;

    return `🔄🔄🔄 *CITA REAGENDADA* 🔄🔄🔄
━━━━━━━━━━━━━━━━━━━━

🏠 *${desarrollo}*
${cambioTexto}

━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone ? formatPhoneForDisplay(cleanPhone) : ''}
📊 *Score:* ${score}/100 ${temp}
💳 *Crédito:* ${necesitaCredito ? '⚠️ SÍ NECESITA' : 'No especificado'}

━━━━━━━━━━━━━━━━━━━━

📍 ${direccion}
🗺️ ${gpsLink}

━━━━━━━━━━━━━━━━━━━━
📅 *Ver en Calendar:*
https://calendar.google.com/calendar/u/1/r

━━━━━━━━━━━━━━━━━━━━
⚠️ *TOMA NOTA DEL CAMBIO* ⚠️`;
  }

  formatMensajeAsesorNuevaCita(result: CrearCitaResult, desarrollo: string, fecha: string, hora: string): string {
    const { clientName, cleanPhone, score, temp, vendedor, direccion, gpsLink } = result as any;
    return `🔥🔥🔥 *LEAD NECESITA CRÉDITO* 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━

🏠 *${desarrollo}*
📅 *Visita:* ${fecha} a las ${hora}

━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone ? formatPhoneForDisplay(cleanPhone) : ''}
📊 *Score:* ${score}/100 ${temp}
👤 *Vendedor:* ${vendedor?.name || 'Por asignar'}

━━━━━━━━━━━━━━━━━━━━

📍 ${direccion}
🗺️ ${gpsLink}

━━━━━━━━━━━━━━━━━━━━
⚠️ *¡CONTÁCTALO PARA INICIAR TRÁMITE!* ⚠️`;
  }

  formatMensajeConfirmacionCliente(result: CrearCitaResult, desarrollo: string, fecha: string, hora: string): string {
    const { vendedor, asesorHipotecario, necesitaCredito, direccion, gpsLink } = result;

    let infoContactos = '';
    if (vendedor?.name) {
      infoContactos += `\n👤 *Vendedor:* ${vendedor.name}`;
      if (vendedor.phone) {
        infoContactos += `\n📱 *Tel vendedor:* ${formatPhoneForDisplay(vendedor.phone)}`;
      }
    }
    if (necesitaCredito && asesorHipotecario?.name) {
      infoContactos += `\n\n💳 *Asesor de crédito:* ${asesorHipotecario.name}`;
      if (asesorHipotecario.phone) {
        infoContactos += `\n📱 *Tel asesor:* ${formatPhoneForDisplay(asesorHipotecario.phone)}`;
      }
    }

    // Solo mostrar GPS si existe
    const gpsLine = gpsLink ? `\n🗺️ *Google Maps:* ${gpsLink}` : '';

    return `✅ *¡Cita confirmada!*

📅 *Fecha:* ${fecha}
🕐 *Hora:* ${hora}
🏠 *Desarrollo:* ${desarrollo}

📍 *Dirección:* ${direccion}${gpsLine}
${infoContactos}

¡Te esperamos! 🎉`;
  }

  formatMensajeCumpleanos(clientName: string): string {
    return `Por cierto ${clientName}, ¿cuándo es tu cumpleaños? 🎂\nPor si hay algo especial para ti 🎁\n\n_(ej: 15 marzo)_`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPERS - Delegados a utils/dateParser centralizado
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private parseFecha(fecha: string, hora: string): Date {
    return parseFechaCentral(fecha, hora);
  }

  private parseFechaISO(fecha: string): string {
    return parseFechaISOCentral(fecha);
  }

  private parseHoraISO(hora: string): string {
    return parseHoraISOCentral(hora).substring(0, 5); // Quitar segundos para compatibilidad
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CONFIRMACIÓN DE CITAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getLeadWithPendingConfirmation(vendedorId: string): Promise<{ lead: any; conf: any } | null> {
    const { data: allLeads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, notes, last_message_at')
      .not('notes->pending_confirmation', 'is', null)
      .limit(10);

    const leads = allLeads?.filter((l: any) =>
      l.notes?.pending_confirmation?.vendedor_id === vendedorId
    );

    if (!leads || leads.length === 0) return null;

    const lead = leads[0];
    const conf = lead.notes?.pending_confirmation;
    return { lead, conf };
  }

  isLeadActiveRecently(lead: any): boolean {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastMsg = lead.last_message_at ? new Date(lead.last_message_at) : null;
    return Boolean(lastMsg && lastMsg > hace24h);
  }

  formatConfirmationMessage(lead: any, conf: any): string {
    const nombre = lead.name?.split(' ')[0] || '';
    let msg = `¡Hola ${nombre}! 🏠\n\n`;
    msg += `*Tu cita está confirmada:*\n\n`;
    msg += `📅 *Fecha:* ${conf.fecha}\n`;
    msg += `🕐 *Hora:* ${conf.hora}\n`;
    msg += `📍 *Lugar:* ${conf.desarrollo || 'Por confirmar'}\n`;
    if (conf.gps_link) msg += `🗺️ *Ubicación:* ${conf.gps_link}\n`;
    msg += `\n👤 *Te atiende:* ${conf.vendedor_name || 'Un asesor'}\n`;
    if (conf.vendedor_phone) msg += `📱 *Su cel:* ${formatPhoneForDisplay(conf.vendedor_phone)}\n`;
    msg += `\n¡Te esperamos! ¿Tienes alguna duda? 😊`;
    return msg;
  }

  buildTemplateComponents(lead: any, conf: any): any[] {
    const gpsCode = conf.gps_link
      ? conf.gps_link.replace(/^https?:\/\/maps\.app\.goo\.gl\//, '')
      : 'qR8vK3xYz9M';

    return [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: lead.name?.split(' ')[0] || 'cliente' },
          { type: 'text', text: 'Grupo Santa Rita' },
          { type: 'text', text: `visita a ${conf.desarrollo || 'nuestras oficinas'}` },
          { type: 'text', text: conf.fecha },
          { type: 'text', text: conf.hora }
        ]
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [
          { type: 'text', text: gpsCode }
        ]
      }
    ];
  }

  formatExtraDetails(conf: any): string {
    let msg = '';
    if (conf.gps_link) msg += `🗺️ *Ubicación:* ${conf.gps_link}\n`;
    if (conf.vendedor_name) msg += `👤 *Te atiende:* ${conf.vendedor_name}\n`;
    if (conf.vendedor_phone) msg += `📱 *Su cel:* ${formatPhoneForDisplay(conf.vendedor_phone)}\n`;
    if (msg) msg += '\n¡Te esperamos! 🏠';
    return msg;
  }

  cleanPendingConfirmation(notes: any): any {
    const clean = { ...(notes || {}) };
    delete clean.pending_confirmation;
    return clean;
  }

  async updateLeadAfterConfirmation(leadId: string, wasActive: boolean, notes: any): Promise<void> {
    const cleanNotes = this.cleanPendingConfirmation(notes);

    if (wasActive) {
      await this.supabase.client.from('leads').update({
        notes: cleanNotes,
        sara_activated: true
      }).eq('id', leadId);
    } else {
      await this.supabase.client.from('leads').update({
        notes: cleanNotes,
        template_sent: 'appointment_confirmation',
        template_sent_at: new Date().toISOString(),
        sara_activated: false
      }).eq('id', leadId);
    }
  }

  async markAppointmentConfirmationSent(leadId: string): Promise<void> {
    await this.supabase.client.from('appointments').update({
      confirmation_sent: true,
      confirmation_sent_at: new Date().toISOString()
    }).eq('lead_id', leadId).eq('status', 'scheduled');
  }

  formatConfirmationSentToVendor(leadName: string, phone: string, wasTemplate: boolean): string {
    const tipo = wasTemplate ? '(Template - esperando respuesta)' : '(Mensaje normal - lead activo)';
    return `✅ *Confirmación enviada a ${leadName}*\n\n📱 ${formatPhoneForDisplay(phone)}\n📝 ${tipo}`;
  }

  async cancelPendingConfirmation(vendedorId: string): Promise<{ lead: any } | null> {
    const result = await this.getLeadWithPendingConfirmation(vendedorId);
    if (!result) return null;

    const { lead } = result;
    const cleanNotes = this.cleanPendingConfirmation(lead.notes);

    await this.supabase.client
      .from('leads')
      .update({ notes: cleanNotes })
      .eq('id', lead.id);

    return { lead };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NOTIFICACIONES DE REAGENDADO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getLeadWithPendingReagendar(vendedorId: string): Promise<{ lead: any; reagendar: any } | null> {
    const { data: allLeads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .not('notes->pending_reagendar', 'is', null)
      .limit(10);

    const leads = allLeads?.filter((l: any) =>
      l.notes?.pending_reagendar?.vendedor_id === vendedorId
    );

    if (!leads || leads.length === 0) return null;

    const lead = leads[0];
    const reagendar = lead.notes?.pending_reagendar;
    return { lead, reagendar };
  }

  formatRescheduleMessage(lead: any, reagendar: any): string {
    const nombre = lead.name || 'cliente';
    let msg = `¡Hola ${nombre}! 👋\n\n`;
    msg += `Tu cita ha sido reprogramada:\n\n`;
    msg += `📅 *${reagendar.nueva_fecha}*\n`;
    msg += `🕐 *${reagendar.nueva_hora}*\n`;
    msg += `📍 *${reagendar.ubicacion || 'Por confirmar'}*\n\n`;
    msg += `👤 Te atiende: *${reagendar.vendedor_nombre}*\n`;
    if (reagendar.vendedor_phone) msg += `📱 ${formatPhoneForDisplay(reagendar.vendedor_phone)}\n`;
    msg += `\n¡Te esperamos! 🏠`;
    return msg;
  }

  cleanPendingReagendar(notes: any): any {
    const clean = { ...(notes || {}) };
    delete clean.pending_reagendar;
    return clean;
  }

  async updateLeadAfterRescheduleNotification(leadId: string, notes: any): Promise<void> {
    const cleanNotes = this.cleanPendingReagendar(notes);
    await this.supabase.client.from('leads').update({ notes: cleanNotes }).eq('id', leadId);
  }

  async cancelPendingReagendar(vendedorId: string): Promise<{ lead: any } | null> {
    const result = await this.getLeadWithPendingReagendar(vendedorId);
    if (!result) return null;

    const { lead } = result;
    const cleanNotes = this.cleanPendingReagendar(lead.notes);

    await this.supabase.client
      .from('leads')
      .update({ notes: cleanNotes })
      .eq('id', lead.id);

    return { lead };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CITA DE LLAMADA (Callback) - Sin GPS, con follow-up
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async crearCitaLlamada(params: {
    lead: any;
    cleanPhone: string;
    clientName: string;
    fecha: string;
    hora: string;
    vendedor: any;
    desarrollo?: string;
    skipDuplicateCheck?: boolean;  // ← Para comandos de vendedor
    skipVendorNotification?: boolean;  // ← Evitar notificación duplicada
  }): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
    const { lead, cleanPhone, clientName, fecha, hora, vendedor, desarrollo, skipDuplicateCheck, skipVendorNotification } = params;

    try {
      console.log('📞 Creando cita de LLAMADA para', clientName);

      // Validar hora
      const horaNumero = parseInt(hora.split(':')[0]) || parseInt(hora) || 0;
      if (horaNumero < 8 || horaNumero >= 20) {
        console.error('⚠️ Hora fuera de horario laboral:', horaNumero);
        return { success: false, error: 'hora_invalida' };
      }

      // Verificar si ya existe una cita de llamada reciente (skip si vendedor lo solicita explícitamente)
      if (!skipDuplicateCheck) {
        const { data: citaExistente } = await this.supabase.client
          .from('appointments')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('appointment_type', 'llamada')
          .not('status', 'in', '("cancelled","completed")')
          .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .limit(1);

        if (citaExistente && citaExistente.length > 0) {
          console.log('⚠️ Ya existe cita de llamada reciente');
          return { success: false, error: 'duplicada' };
        }
      }

      // Crear cita de llamada en DB
      const { data: appointment, error } = await this.supabase.client
        .from('appointments')
        .insert([{
          lead_id: lead.id,
          lead_name: clientName,
          lead_phone: cleanPhone,
          property_name: desarrollo || lead.property_interest || 'Llamada programada',
          location: 'Llamada telefónica',
          scheduled_date: this.parseFechaISO(fecha),
          scheduled_time: this.parseHoraISO(hora),
          status: 'scheduled',
          vendedor_id: vendedor?.id,
          vendedor_name: vendedor?.name,
          appointment_type: 'llamada',
          duration_minutes: 15
        }])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creando cita de llamada:', error);
        return { success: false, error: error.message };
      }

      console.log('📞 Cita de llamada creada:', appointment?.id);

      // Registrar actividad
      try {
        await this.supabase.client
          .from('lead_activities')
          .insert({
            lead_id: lead.id,
            team_member_id: vendedor?.id || null,
            activity_type: 'callback_scheduled',
            notes: `Llamada programada para ${fecha} a las ${hora}`,
            created_at: new Date().toISOString()
          });
      } catch (e) {
        console.error('⚠️ Error registrando actividad:', e);
      }

      // Notificar vendedor (SIN GPS) - skip si el vendedor ya recibe su propia confirmación
      if (vendedor?.phone && !skipVendorNotification) {
        const fechaFormateada = new Date(this.parseFechaISO(fecha) + 'T12:00:00-06:00')
          .toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

        const notifVendedor = `📞 *LLAMADA PROGRAMADA*\n\n` +
          `👤 *${clientName}*\n` +
          `📱 ${formatPhoneForDisplay(cleanPhone)}\n` +
          (desarrollo ? `🏠 Interés: ${desarrollo}\n` : '') +
          `\n📅 *${fechaFormateada}*\n` +
          `🕐 *${hora}*\n\n` +
          `⏰ El cliente espera tu llamada`;

        await this.twilio.sendWhatsAppMessage(
          'whatsapp:+52' + vendedor.phone.replace(/\D/g, '').slice(-10),
          notifVendedor
        );
        console.log('✅ Notificación de llamada enviada a:', vendedor.name);
      }

      // Crear follow-up para 30 minutos después de la llamada programada
      try {
        const fechaISO = this.parseFechaISO(fecha);
        const horaISO = this.parseHoraISO(hora);
        const fechaHoraLlamada = new Date(`${fechaISO}T${horaISO}`);
        const fechaFollowup = new Date(fechaHoraLlamada.getTime() + 30 * 60 * 1000); // 30 min después

        await this.supabase.client
          .from('scheduled_followups')
          .insert({
            lead_id: lead.id,
            lead_phone: cleanPhone,
            lead_name: clientName,
            desarrollo: desarrollo || 'Seguimiento llamada',
            message: `📞 *VERIFICAR LLAMADA*\n\n¿Se completó la llamada con ${clientName}?\n\nSi no pudiste contactarle, reagenda la llamada.\n\n📱 ${formatPhoneForDisplay(cleanPhone)}`,
            scheduled_at: fechaFollowup.toISOString(),
            sent: false,
            cancelled: false,
            rule_id: null
          });
        console.log('✅ Follow-up de verificación programado para:', fechaFollowup.toISOString());
      } catch (e) {
        console.error('⚠️ Error creando follow-up:', e);
      }

      return { success: true, appointmentId: appointment?.id };

    } catch (e) {
      console.error('❌ Error general en crearCitaLlamada:', e);
      return { success: false, error: String(e) };
    }
  }
}
