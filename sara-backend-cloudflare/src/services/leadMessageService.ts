// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MÓDULO: leadMessageService - Manejo de mensajes de leads/clientes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Centraliza la lógica de procesamiento de mensajes entrantes
// de leads (clientes/prospectos) que NO son del equipo interno.
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { SupabaseService } from './supabase';
import { BroadcastQueueService } from './broadcastQueueService';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LeadMessageAction =
  | 'handled'           // Mensaje procesado completamente
  | 'continue_to_ai'    // Continuar a procesamiento IA
  | 'error';            // Error en procesamiento

export interface LeadMessageResult {
  action: LeadMessageAction;
  response?: string;
  sendVia?: 'meta' | 'twilio';
  notifyVendor?: { phone: string; message: string };
  updateLead?: Record<string, any>;
  error?: string;
  broadcastContext?: {
    message: string;
    sentAt: string;
  };
}

interface CitaActiva {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  property_name?: string;
  team_members?: { id: string; name: string; phone: string };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLASE PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class LeadMessageService {
  constructor(private supabase: SupabaseService) {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROCESAR MENSAJE DE LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async processLeadMessage(
    lead: any,
    body: string,
    cleanPhone: string
  ): Promise<LeadMessageResult> {
    const mensajeLower = body.toLowerCase().trim();
    const notasLead = typeof lead.notes === 'object' ? lead.notes : {};

    // 1. REGISTRO A EVENTOS
    const eventResult = await this.checkEventRegistration(lead, body, mensajeLower, notasLead);
    if (eventResult.action === 'handled') return eventResult;

    // 2. ACCIONES DE CITA
    const citaResult = await this.checkAppointmentActions(lead, body, mensajeLower);
    if (citaResult.action === 'handled') return citaResult;

    // 3. CAPTURA DE CUMPLEAÑOS
    const birthdayResult = this.checkBirthdayCapture(lead, body, notasLead);
    if (birthdayResult.action === 'handled') return birthdayResult;

    // 4. RESPUESTA A ANIVERSARIO (clientes delivered)
    const anniversaryResult = this.checkAnniversaryResponse(lead, body, notasLead);
    if (anniversaryResult.action === 'handled') return anniversaryResult;

    // 5. ENCUESTA ACTIVA
    if (lead.survey_step > 0) {
      return { action: 'handled', response: '__SURVEY__' }; // Handler especial
    }

    // 6. REFERIDO DESDE CLIENTE
    const referidoResult = await this.checkClientReferral(lead, body, cleanPhone);
    if (referidoResult.action === 'handled') return referidoResult;

    // 7. RESPUESTA A BROADCAST (detectar y contextualizar)
    const broadcastResult = await this.checkBroadcastResponse(lead, body, mensajeLower, notasLead);
    if (broadcastResult.action === 'handled') return broadcastResult;
    // Si hay contexto de broadcast pero no se maneja directamente, pasarlo
    if (broadcastResult.broadcastContext) {
      return { action: 'continue_to_ai', broadcastContext: broadcastResult.broadcastContext };
    }

    // No se detectó ningún patrón especial, continuar a IA
    return { action: 'continue_to_ai' };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REGISTRO A EVENTOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async checkEventRegistration(
    lead: any,
    body: string,
    mensajeLower: string,
    notasLead: any
  ): Promise<LeadMessageResult> {
    const pendingEvent = notasLead?.pending_event_registration;
    if (!pendingEvent) return { action: 'continue_to_ai' };

    const respuestasPositivas = ['si', 'sí', 'quiero', 'me apunto', 'reservar', 'reserva', 'va', 'sale', 'confirmo', 'voy', 'ahi estare', 'ahí estaré', 'claro', 'por supuesto', 'ok', 'dale'];
    const esPositivo = respuestasPositivas.some(r => mensajeLower.includes(r));

    const respuestasNegativas = ['no', 'nel', 'nop', 'no puedo', 'no gracias', 'paso', 'otra vez'];
    const esNegativo = respuestasNegativas.some(r => mensajeLower.includes(r));

    if (esPositivo) {
      const { data: evento } = await this.supabase.client
        .from('events')
        .select('*')
        .eq('id', pendingEvent.event_id)
        .single();

      if (!evento) {
        return this.limpiarPendingEvent(lead, notasLead, 'Lo siento, el evento ya no está disponible. 😔');
      }

      // Verificar capacidad
      if (evento.max_capacity && evento.registered_count >= evento.max_capacity) {
        return this.limpiarPendingEvent(lead, notasLead,
          `Lo siento ${lead.name?.split(' ')[0] || ''}, el evento *${evento.name}* ya está lleno. 😔\n\n` +
          `Te avisaremos si se abre un lugar o si hay otro evento similar.`
        );
      }

      // Registrar
      await this.supabase.client.from('event_registrations').upsert({
        event_id: evento.id,
        lead_id: lead.id,
        status: 'registered',
        registered_at: new Date().toISOString()
      }, { onConflict: 'event_id,lead_id' });

      await this.supabase.client.from('events')
        .update({ registered_count: (evento.registered_count || 0) + 1 })
        .eq('id', evento.id);

      const fechaEvento = new Date(evento.event_date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      return this.limpiarPendingEvent(lead, notasLead,
        `🎉 *¡Listo ${lead.name?.split(' ')[0] || ''}!*\n\n` +
        `Quedaste registrado en:\n` +
        `📌 *${evento.name}*\n` +
        `📅 ${fechaEvento}${evento.event_time ? ' a las ' + evento.event_time : ''}\n` +
        `${evento.location ? '📍 ' + evento.location : ''}\n\n` +
        `Te enviaremos un recordatorio antes del evento. ¡Te esperamos!`
      );
    }

    if (esNegativo) {
      return this.limpiarPendingEvent(lead, notasLead,
        `Entendido, sin problema. 👍\n\nSi cambias de opinión o necesitas algo más, aquí estoy.`
      );
    }

    return { action: 'continue_to_ai' };
  }

  private async limpiarPendingEvent(lead: any, notasLead: any, response: string): Promise<LeadMessageResult> {
    const { pending_event_registration, ...notasLimpias } = notasLead;
    return {
      action: 'handled',
      response,
      sendVia: 'meta',
      updateLead: { notes: notasLimpias }
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ACCIONES DE CITA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async checkAppointmentActions(
    lead: any,
    body: string,
    mensajeLower: string
  ): Promise<LeadMessageResult> {
    // Buscar cita activa
    const { data: citaActiva } = await this.supabase.client
      .from('appointments')
      .select('*, team_members!appointments_assigned_to_fkey(id, name, phone)')
      .eq('lead_id', lead.id)
      .eq('status', 'scheduled')
      .order('scheduled_date', { ascending: true })
      .limit(1)
      .single();

    // CANCELAR CITA
    if (this.detectaCancelarCita(mensajeLower)) {
      return this.procesarCancelarCita(lead, citaActiva);
    }

    // CONFIRMAR CITA
    if (this.detectaConfirmarCita(mensajeLower) && citaActiva) {
      return this.procesarConfirmarCita(lead, citaActiva);
    }

    // PREGUNTAR POR CITA
    if (this.detectaPreguntaCita(mensajeLower)) {
      return this.procesarPreguntaCita(lead, citaActiva);
    }

    return { action: 'continue_to_ai' };
  }

  private detectaCancelarCita(msg: string): boolean {
    return msg.includes('cancelar') || msg.includes('cancela') ||
           msg.includes('no puedo ir') || msg.includes('no voy a poder');
  }

  private detectaConfirmarCita(msg: string): boolean {
    return msg === 'si' || msg === 'sí' || msg === 'confirmo' ||
           msg === 'ok' || msg === 'va' || msg === 'dale' ||
           msg.includes('confirmo mi cita') || msg.includes('si voy');
  }

  private detectaPreguntaCita(msg: string): boolean {
    return (msg.includes('hora') && !msg.includes('ahora')) ||
           msg.includes('a que hora') || msg.includes('a qué hora') ||
           msg.includes('cuando es mi cita') || msg.includes('cuándo es mi cita') ||
           msg.includes('mi cita') || msg.includes('fecha de mi cita');
  }

  private async procesarCancelarCita(lead: any, cita: CitaActiva | null): Promise<LeadMessageResult> {
    if (!cita) {
      return {
        action: 'handled',
        response: `No encontré ninguna cita activa a tu nombre. 🤔\n\n¿En qué más puedo ayudarte?`,
        sendVia: 'meta'
      };
    }

    // Cancelar en BD
    await this.supabase.client.from('appointments').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Cancelado por cliente via WhatsApp'
    }).eq('id', cita.id);

    const result: LeadMessageResult = {
      action: 'handled',
      response: `Entendido ${lead.name?.split(' ')[0] || ''}, tu cita ha sido cancelada. 😊\n\n` +
                `Si cambias de opinión o quieres reagendar, solo escríbeme.\n\n¡Que tengas buen día!`,
      sendVia: 'meta'
    };

    // Notificar al vendedor
    const vendedorCita = cita.team_members;
    if (vendedorCita?.phone) {
      result.notifyVendor = {
        phone: vendedorCita.phone,
        message: `❌ *CITA CANCELADA*\n\n` +
                 `👤 ${lead.name || 'Cliente'}\n` +
                 `📅 Era: ${cita.scheduled_date || 'Sin fecha'} a las ${cita.scheduled_time || 'Sin hora'}\n` +
                 `📍 ${cita.property_name || 'Sin desarrollo'}\n\n` +
                 `_El cliente canceló por WhatsApp_`
      };
    }

    console.log('❌ Cita cancelada por lead:', lead.name);
    return result;
  }

  private async procesarConfirmarCita(lead: any, cita: CitaActiva): Promise<LeadMessageResult> {
    await this.supabase.client.from('appointments').update({
      client_confirmed: true,
      client_confirmed_at: new Date().toISOString()
    }).eq('id', cita.id);

    console.log('✅ Cita confirmada por lead:', lead.name);
    return {
      action: 'handled',
      response: `¡Perfecto ${lead.name?.split(' ')[0] || ''}! ✅\n\n` +
                `Tu cita está confirmada:\n` +
                `📅 ${cita.scheduled_date || ''}\n` +
                `🕐 ${cita.scheduled_time || ''}\n` +
                `📍 ${cita.property_name || 'Santa Rita'}\n\n` +
                `¡Te esperamos! 😊`,
      sendVia: 'meta'
    };
  }

  private procesarPreguntaCita(lead: any, cita: CitaActiva | null): LeadMessageResult {
    if (cita) {
      return {
        action: 'handled',
        response: `¡Claro ${lead.name?.split(' ')[0] || ''}! 😊\n\n` +
                  `Tu cita es:\n` +
                  `📅 ${cita.scheduled_date || 'Por definir'}\n` +
                  `🕐 ${cita.scheduled_time || 'Por definir'}\n` +
                  `📍 ${cita.property_name || 'Santa Rita'}\n\n` +
                  `¿Te confirmo o necesitas reagendar?`,
        sendVia: 'meta'
      };
    }
    return {
      action: 'handled',
      response: `No tienes ninguna cita agendada actualmente. 📅\n\n` +
                `¿Te gustaría agendar una visita a nuestros desarrollos?`,
      sendVia: 'meta'
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CAPTURA DE CUMPLEAÑOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private checkBirthdayCapture(lead: any, body: string, notasLead: any): LeadMessageResult {
    if (!notasLead?.pending_birthday_response || lead.birthday) {
      return { action: 'continue_to_ai' };
    }

    const fechaMatch = body.match(/(\d{1,2})\s*(de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{1,2})/i);
    const fechaSlash = body.match(/^(\d{1,2})[\/\-](\d{1,2})$/);

    if (!fechaMatch && !fechaSlash) {
      return { action: 'continue_to_ai' };
    }

    const meses: Record<string, string> = {
      enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
      julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12'
    };

    let birthday = null;
    if (fechaMatch) {
      const dia = fechaMatch[1].padStart(2, '0');
      const mesTexto = fechaMatch[3].toLowerCase();
      const mes = meses[mesTexto] || mesTexto.padStart(2, '0');
      birthday = '2000-' + mes + '-' + dia;
    } else if (fechaSlash) {
      const dia = fechaSlash[1].padStart(2, '0');
      const mes = fechaSlash[2].padStart(2, '0');
      birthday = '2000-' + mes + '-' + dia;
    }

    if (!birthday) return { action: 'continue_to_ai' };

    const { pending_birthday_response, ...notasSinPending } = notasLead;
    console.log('✅ Cumpleaños detectado:', birthday);

    return {
      action: 'handled',
      response: `🎂 ¡Anotado${lead.name?.split(' ')[0] ? ' ' + lead.name.split(' ')[0] : ''}! Te tendremos una sorpresa ese día 🎁`,
      sendVia: 'meta',
      updateLead: { birthday, notes: notasSinPending }
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESPUESTA A ANIVERSARIO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private checkAnniversaryResponse(lead: any, body: string, notasLead: any): LeadMessageResult {
    if (lead.status !== 'delivered') return { action: 'continue_to_ai' };

    const añoActual = new Date().getFullYear();
    const tieneAniversario = notasLead?.[`Aniversario ${añoActual}`];
    if (!tieneAniversario) return { action: 'continue_to_ai' };

    const esAgradecimiento = /^(gracias|muchas gracias|mil gracias|thank|thx|grax|que (bonito|lindo|padre)|muy amable|se los agradezco|bendiciones|saludos|igualmente|😊|🙏|❤️|👍|🏠|🎉)+[!.]*$/i.test(body.trim());
    if (!esAgradecimiento) return { action: 'continue_to_ai' };

    const nombreCliente = lead.name?.split(' ')[0] || '';
    const respuestas = [
      `¡Con mucho gusto${nombreCliente ? ' ' + nombreCliente : ''}! 🏠💙 Que sigas disfrutando tu hogar. ¡Aquí estamos para lo que necesites!`,
      `¡Para eso estamos${nombreCliente ? ' ' + nombreCliente : ''}! 🙌 Nos da gusto saber de ti. ¡Disfruta tu casa!`,
      `¡Un abrazo${nombreCliente ? ' ' + nombreCliente : ''}! 🤗 Gracias por seguir siendo parte de la familia Santa Rita 🏠`
    ];

    console.log('🏠 Respuesta a aniversario:', body);
    return {
      action: 'handled',
      response: respuestas[Math.floor(Math.random() * respuestas.length)],
      sendVia: 'meta'
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REFERIDO DESDE CLIENTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async checkClientReferral(lead: any, body: string, cleanPhone: string): Promise<LeadMessageResult> {
    if (lead.status !== 'delivered') return { action: 'continue_to_ai' };

    const refMatch = body.match(/^r[eéi]f[eéi]r[ií]?do\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)\s+(\d{10,})/i);
    if (!refMatch) return { action: 'continue_to_ai' };

    const nombreRef = refMatch[1].trim();
    const telRef = refMatch[2].replace(/\D/g, '').slice(-10);

    // Crear lead referido
    await this.supabase.client.from('leads').insert({
      name: nombreRef,
      phone: '521' + telRef,
      source: 'referido',
      referrer_id: lead.id,
      assigned_to: lead.assigned_to,
      status: 'new',
      score: 80,
      notes: { referido_por: lead.name, fecha_referido: new Date().toISOString() }
    });

    console.log('🎁 Referido registrado:', nombreRef, telRef);

    // Obtener vendedor para notificar
    let notifyVendor: LeadMessageResult['notifyVendor'];
    if (lead.assigned_to) {
      const { data: vendedorData } = await this.supabase.client
        .from('team_members')
        .select('phone, name')
        .eq('id', lead.assigned_to)
        .single();

      if (vendedorData?.phone) {
        notifyVendor = {
          phone: vendedorData.phone,
          message: '🎁 *REFERIDO NUEVO*\n\n' +
                   'Tu cliente *' + (lead.name || 'Cliente') + '* te refirió a:\n' +
                   '👤 ' + nombreRef + '\n' +
                   '📱 ' + telRef + '\n\n' +
                   'Contáctalo pronto.'
        };
      }
    }

    return {
      action: 'handled',
      response: '🎉 *¡Gracias por tu referido!*\n\n' +
                'Ya registramos a *' + nombreRef + '* y tu asesor lo contactará pronto.\n\n' +
                'Cuando compre, recibirás tus beneficios del Programa Embajador. 🎁',
      sendVia: 'twilio',
      notifyVendor
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESPUESTA A BROADCAST
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async checkBroadcastResponse(
    lead: any,
    body: string,
    mensajeLower: string,
    notasLead: any
  ): Promise<LeadMessageResult> {
    // Verificar si hay broadcast reciente
    const broadcastQueueService = new BroadcastQueueService(this.supabase);
    const broadcastInfo = await broadcastQueueService.getRecentBroadcast(lead.id);

    if (!broadcastInfo.hasBroadcast) {
      return { action: 'continue_to_ai' };
    }

    // Si ya hay historial de conversación DESPUÉS del broadcast, dejar que la IA maneje
    // Esto evita interceptar "Sí" cuando ya se está en una conversación activa
    const historial = lead.conversation_history || [];
    if (historial.length >= 2) {
      // Ya hay conversación, solo pasar contexto a la IA sin interceptar
      console.log('📢 Broadcast detectado pero ya hay conversación activa, pasando a IA');
      return {
        action: 'continue_to_ai',
        broadcastContext: {
          message: broadcastInfo.message || '',
          sentAt: broadcastInfo.sentAt || ''
        }
      };
    }

    // Detectar respuestas de interés (solo para primera respuesta)
    const respuestasInteres = ['si', 'sí', 'me interesa', 'quiero', 'informacion', 'información', 'info', 'cuanto', 'cuánto', 'precio', 'detalles', 'más info', 'mas info', 'ok', 'va', 'dale'];
    const esInteres = respuestasInteres.some(r => mensajeLower.includes(r) || mensajeLower === r);

    const respuestasRechazo = ['no gracias', 'no me interesa', 'no', 'paso', 'ya no'];
    const esRechazo = respuestasRechazo.some(r => mensajeLower === r || mensajeLower.startsWith(r));

    // Obtener vendedor asignado para notificar
    let notifyVendor: LeadMessageResult['notifyVendor'];
    if (lead.assigned_to) {
      const { data: vendedorData } = await this.supabase.client
        .from('team_members')
        .select('phone, name')
        .eq('id', lead.assigned_to)
        .single();

      if (vendedorData?.phone) {
        const contexto = broadcastInfo.message ? `"${broadcastInfo.message}..."` : 'promoción enviada';
        notifyVendor = {
          phone: vendedorData.phone,
          message: `📢 *RESPUESTA A BROADCAST*\n\n` +
                   `👤 *${lead.name || 'Lead'}* respondió:\n` +
                   `💬 "${body.substring(0, 100)}"\n\n` +
                   `📝 Contexto: ${contexto}\n\n` +
                   `${esInteres ? '✅ *Muestra interés* - ¡Contáctalo!' : esRechazo ? '❌ No interesado' : '❓ Respuesta no clara - revisa'}`
        };
      }
    }

    // Si muestra interés, Sara responde y notifica
    if (esInteres) {
      const nombreCorto = lead.name?.split(' ')[0] || '';
      return {
        action: 'handled',
        response: `¡Qué bueno ${nombreCorto}! 🎉\n\n` +
                  `Tu asesor te contactará en breve con toda la información.\n\n` +
                  `¿Hay algo específico que te gustaría saber?`,
        sendVia: 'meta',
        notifyVendor,
        broadcastContext: {
          message: broadcastInfo.message || '',
          sentAt: broadcastInfo.sentAt || ''
        }
      };
    }

    // Si rechaza, Sara agradece
    if (esRechazo) {
      return {
        action: 'handled',
        response: `Entendido, sin problema. 👍\n\nSi cambias de opinión, aquí estoy para ayudarte.`,
        sendVia: 'meta',
        notifyVendor
      };
    }

    // Cualquier otra respuesta: notificar vendedor y pasar contexto a IA
    return {
      action: 'continue_to_ai',
      notifyVendor,
      broadcastContext: {
        message: broadcastInfo.message || '',
        sentAt: broadcastInfo.sentAt || ''
      }
    };
  }
}
