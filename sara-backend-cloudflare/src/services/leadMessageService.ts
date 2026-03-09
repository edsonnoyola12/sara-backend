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
import { OfferTrackingService, OfferStatus } from './offerTrackingService';

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
  notifyVendor?: { phone: string; message: string } | boolean;
  updateLead?: Record<string, any>;
  error?: string;
  broadcastContext?: {
    message: string;
    sentAt: string;
  };
  deleteCalendarEvent?: string; // ID del evento a borrar de Google Calendar
  sendRetellResources?: {
    desarrollo: string;
    video_url?: string;
    brochure_url?: string;
    gps_url?: string;
  };
}

interface CitaActiva {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  property_name?: string;
  team_members?: { id: string; name: string; phone: string };
  google_event_vendedor_id?: string;
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

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DETECCIÓN DE MENSAJES REPETIDOS (spam/duplicados)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const duplicateResult = this.checkDuplicateMessage(lead, body);
    if (duplicateResult.isDuplicate) {
      console.log(`⚠️ Mensaje repetido detectado de ${lead.name || lead.phone}: "${body.slice(0, 50)}..." (${duplicateResult.count}x)`);

      // Si es el 3er mensaje idéntico consecutivo, responder diferente
      if (duplicateResult.count >= 3) {
        return {
          action: 'handled',
          response: `¡Hola! Noté que me enviaste el mismo mensaje varias veces 😊

¿Hay algo específico en lo que pueda ayudarte? Si tienes alguna duda o problema, cuéntame y con gusto te asisto.

¿Te gustaría:
1. Información de desarrollos
2. Agendar una visita
3. Hablar con un asesor`
        };
      }
      // Si es 2do mensaje, continuar normal pero logear
    }

    // 0. RECURSOS PENDING DE RETELL (lead respondió al template post-llamada)
    const retellResult = this.checkRetellPendingResources(lead, notasLead);
    if (retellResult.action === 'handled') return retellResult;

    // 0.1. RESPUESTA A MENSAJE AUTOMÁTICO (lead frío, aniversario, cumpleaños, etc.)
    const autoResponseResult = await this.checkAutoMessageResponse(lead, body, mensajeLower, notasLead);
    if (autoResponseResult.action === 'handled') return autoResponseResult;
    // Propagar continue_to_ai con updateLead/notifyVendor (ej: esSolicitudEspecifica limpia pending_auto_response)
    if (autoResponseResult.action === 'continue_to_ai' && autoResponseResult.updateLead) return autoResponseResult;

    // 0.5. ENCUESTA DE SATISFACCIÓN POST-VISITA (respuestas 1-4)
    const satisfactionResult = await this.checkSatisfactionSurvey(lead, body, mensajeLower, notasLead);
    if (satisfactionResult.action === 'handled') return satisfactionResult;

    // 0.6. RESPUESTA A OFERTA/COTIZACIÓN
    const offerResult = await this.checkOfferResponse(lead, body, mensajeLower);
    if (offerResult.action === 'handled') return offerResult;

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
  // DETECCIÓN DE MENSAJES DUPLICADOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private checkDuplicateMessage(lead: any, currentMessage: string): { isDuplicate: boolean; count: number } {
    const history = lead.conversation_history || [];
    if (history.length === 0) return { isDuplicate: false, count: 1 };

    const currentMsgNormalized = currentMessage.toLowerCase().trim();

    // Contar mensajes idénticos consecutivos del usuario (últimos 10 mensajes)
    const recentUserMsgs = history
      .slice(-10)
      .filter((m: any) => m.role === 'user')
      .map((m: any) => (m.content || '').toLowerCase().trim());

    // Contar cuántos de los últimos mensajes son idénticos al actual
    let consecutiveCount = 0;
    for (let i = recentUserMsgs.length - 1; i >= 0; i--) {
      if (recentUserMsgs[i] === currentMsgNormalized) {
        consecutiveCount++;
      } else {
        break; // Dejar de contar si encontramos uno diferente
      }
    }

    // Si el mensaje actual es igual al último
    const lastUserMsg = recentUserMsgs[recentUserMsgs.length - 1] || '';
    const isDuplicate = lastUserMsg === currentMsgNormalized;

    return {
      isDuplicate,
      count: consecutiveCount + 1 // +1 por el mensaje actual
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RECURSOS PENDING DE RETELL (después de llamada telefónica)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private checkRetellPendingResources(lead: any, notasLead: any): LeadMessageResult {
    const pendingResources = notasLead?.pending_retell_resources;
    if (!pendingResources) return { action: 'continue_to_ai' };

    // Verificar que los recursos no sean muy viejos (máximo 48 horas)
    const savedAt = pendingResources.saved_at ? new Date(pendingResources.saved_at).getTime() : 0;
    const horasDesde = (Date.now() - savedAt) / (1000 * 60 * 60);

    if (horasDesde > 48) {
      console.log(`⏭️ Recursos Retell expirados para ${lead.name || lead.phone} (${horasDesde.toFixed(1)}h)`);
      // Limpiar recursos expirados
      return {
        action: 'continue_to_ai',
        updateLead: {
          notes: {
            ...notasLead,
            pending_retell_resources: null // Limpiar
          }
        }
      };
    }

    console.log(`📞 Lead ${lead.name || lead.phone} respondió a template Retell - enviando recursos de ${pendingResources.desarrollo}`);

    // Devolver los recursos para enviar y continuar a IA para la conversación
    return {
      action: 'continue_to_ai',
      sendRetellResources: {
        desarrollo: pendingResources.desarrollo,
        video_url: pendingResources.video_url,
        brochure_url: pendingResources.brochure_url,
        gps_url: pendingResources.gps_url
      },
      updateLead: {
        notes: {
          ...notasLead,
          pending_retell_resources: null // Limpiar después de enviar
        }
      }
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ENCUESTA DE SATISFACCIÓN POST-VISITA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async checkSatisfactionSurvey(
    lead: any,
    body: string,
    mensajeLower: string,
    notasLead: any
  ): Promise<LeadMessageResult> {
    const pendingSurvey = notasLead?.pending_satisfaction_survey;
    if (!pendingSurvey) return { action: 'continue_to_ai' };

    // Verificar si es respuesta 1-4
    const respuesta = mensajeLower.trim();
    const ratings: { [key: string]: { label: string; emoji: string } } = {
      '1': { label: 'Excelente', emoji: '🌟' },
      '2': { label: 'Buena', emoji: '👍' },
      '3': { label: 'Regular', emoji: '😐' },
      '4': { label: 'Mala', emoji: '😔' }
    };

    const rating = ratings[respuesta];
    if (!rating) return { action: 'continue_to_ai' };

    const nombreCliente = lead.name?.split(' ')[0] || '';
    const propiedad = pendingSurvey.property || 'la propiedad';

    // Guardar la respuesta en surveys
    try {
      await this.supabase.client.from('surveys').insert({
        lead_id: lead.id,
        survey_type: 'satisfaction',
        rating: parseInt(respuesta),
        rating_label: rating.label,
        property: propiedad,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('⚠️ Error guardando encuesta (tabla puede no existir):', err);
    }

    // Limpiar pending_satisfaction_survey
    delete notasLead.pending_satisfaction_survey;

    let respuestaCliente = '';
    if (respuesta === '1' || respuesta === '2') {
      respuestaCliente = `¡Gracias por tu feedback, ${nombreCliente}! ${rating.emoji}\n\n` +
        `Nos alegra que hayas tenido una experiencia *${rating.label.toLowerCase()}*.\n\n` +
        `Si tienes alguna pregunta sobre *${propiedad}*, ¡aquí estamos para ayudarte! 🏠`;
    } else {
      respuestaCliente = `Gracias por tu feedback, ${nombreCliente}. ${rating.emoji}\n\n` +
        `Lamentamos que tu experiencia no haya sido la mejor.\n` +
        `Tomaremos en cuenta tus comentarios para mejorar.\n\n` +
        `¿Hay algo específico que podamos hacer para ayudarte? 🙏`;
    }

    return {
      action: 'handled',
      response: respuestaCliente,
      sendVia: 'meta',
      updateLead: { notes: notasLead }
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESPUESTA A OFERTA/COTIZACIÓN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async checkOfferResponse(
    lead: any,
    body: string,
    mensajeLower: string
  ): Promise<LeadMessageResult> {
    try {
      // Buscar ofertas enviadas a este lead en las últimas 48 horas
      const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const { data: recentOffer, error } = await this.supabase.client
        .from('offers')
        .select('*, team_members(id, name, phone)')
        .eq('lead_id', lead.id)
        .in('status', ['sent', 'viewed', 'negotiating'])
        .gte('sent_at', hace48h)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !recentOffer) {
        return { action: 'continue_to_ai' };
      }

      // Hay una oferta reciente enviada a este lead
      console.log(`📋 Lead ${lead.name} respondió a oferta de ${recentOffer.property_name}`);

      const nombreLead = lead.name?.split(' ')[0] || 'Cliente';
      const vendedor = recentOffer.team_members;
      const propiedad = recentOffer.property_name;
      const desarrollo = recentOffer.development;
      const precioFmt = recentOffer.offered_price?.toLocaleString('es-MX', { maximumFractionDigits: 0 });

      // Solo tratar como respuesta a oferta si es un mensaje corto (≤10 palabras)
      // Mensajes largos como "hola quiero info de monte verde" NO son respuestas a oferta
      const wordCount = body.trim().split(/\s+/).length;
      if (wordCount > 10) {
        console.log(`📋 Mensaje muy largo (${wordCount} palabras) para ser respuesta a oferta, pasando a IA`);
        return { action: 'continue_to_ai' };
      }

      // Detectar tipo de respuesta
      const respuestasPositivas = ['si', 'sí', 'quiero', 'me interesa', 'interesado', 'interesada', 'va', 'sale', 'ok', 'dale', 'perfecto', 'acepto', 'de acuerdo', 'claro'];
      const respuestasNegativas = ['no', 'no me interesa', 'no gracias', 'paso', 'muy caro', 'no puedo', 'no tengo', 'descartado'];
      const respuestasPregunta = ['cuanto', 'cuánto', 'precio', 'enganche', 'financiamiento', 'mensualidad', 'credito', 'crédito', 'banco', 'requisitos', 'cuando', 'cuándo', 'donde', 'dónde', 'que incluye', 'qué incluye'];

      // Palabras que indican que NO es respuesta a oferta sino un mensaje normal
      const palabrasNoOferta = ['hola', 'info', 'información', 'informacion', 'busco', 'tienen', 'donde', 'ubicacion', 'ubicación', 'brochure', 'folleto', 'video', 'casa', 'terreno', 'desarrollo'];
      const esConversacionNormal = palabrasNoOferta.some(p => mensajeLower.includes(p));
      if (esConversacionNormal) {
        console.log(`📋 Mensaje parece conversación normal, no respuesta a oferta`);
        return { action: 'continue_to_ai' };
      }

      const esNegativo = respuestasNegativas.some(r => mensajeLower.includes(r));
      // Solo es positivo si NO es negativo (para evitar "no me interesa" detectado como "me interesa")
      const esPositivo = !esNegativo && respuestasPositivas.some(r => mensajeLower.includes(r));
      const esPregunta = respuestasPregunta.some(r => mensajeLower.includes(r));

      // Actualizar oferta a "viewed" o más según respuesta
      const offerService = new OfferTrackingService(this.supabase);

      let respuestaLead = '';
      let nuevoStatus = 'viewed';
      let notaVendedor = '';

      if (esPositivo) {
        nuevoStatus = 'negotiating';
        respuestaLead = `¡Excelente ${nombreLead}! 🎉\n\n` +
          `Me alegra que te interese *${propiedad}* en *${desarrollo}*.\n\n` +
          `Para avanzar con la compra, lo ideal es que conozcas la propiedad en persona.\n\n` +
          `*¿Qué día te gustaría visitarla?* 🏠`;
        notaVendedor = `🔥 *¡LEAD INTERESADO EN OFERTA!*\n\n` +
          `*${lead.name}* respondió *"${body}"* a la oferta de:\n` +
          `📦 ${propiedad} - ${desarrollo}\n` +
          `💰 $${precioFmt}\n\n` +
          `📞 Contáctalo: ${lead.phone}\n\n` +
          `_Escribe "bridge ${nombreLead}" para chatear directo_`;
      } else if (esNegativo) {
        nuevoStatus = 'rejected';
        respuestaLead = `¡Claro ${nombreLead}! Solo una pregunta rápida:\n\n` +
          `¿Qué te hizo dudar?\n` +
          `• ¿El precio? Tenemos opciones desde $1.5M\n` +
          `• ¿La ubicación? Tenemos en varias zonas\n` +
          `• ¿El tamaño? Hay desde 2 hasta 3 recámaras\n\n` +
          `A veces hay opciones que no conoces 😉`;
        notaVendedor = `❌ *Lead rechazó oferta*\n\n` +
          `*${lead.name}* respondió *"${body}"* a:\n` +
          `📦 ${propiedad} - ${desarrollo}\n` +
          `💰 $${precioFmt}\n\n` +
          `Podrías contactarlo para conocer sus objeciones.`;
      } else if (esPregunta) {
        nuevoStatus = 'negotiating';
        respuestaLead = `¡Claro ${nombreLead}! 📋\n\n` +
          `Sobre *${propiedad}* en *${desarrollo}* a *$${precioFmt}*:\n\n` +
          `Le paso tu pregunta a *${vendedor?.name || 'tu asesor'}* para que te dé información detallada.\n\n` +
          `Mientras tanto, ¿hay algo más que pueda ayudarte?`;
        notaVendedor = `❓ *Lead tiene preguntas sobre oferta*\n\n` +
          `*${lead.name}* preguntó: *"${body}"*\n\n` +
          `Sobre: ${propiedad} - ${desarrollo}\n` +
          `💰 $${precioFmt}\n\n` +
          `📞 Contáctalo: ${lead.phone}`;
      } else {
        // Cualquier otra respuesta - notificar al vendedor
        nuevoStatus = 'viewed';
        respuestaLead = `Gracias por responder ${nombreLead}. 😊\n\n` +
          `Le paso tu mensaje a *${vendedor?.name || 'tu asesor'}* quien te contactará pronto para darte más detalles sobre *${propiedad}*.\n\n` +
          `Si tienes alguna pregunta mientras tanto, aquí estoy.`;
        notaVendedor = `💬 *Lead respondió a oferta*\n\n` +
          `*${lead.name}* respondió: *"${body}"*\n\n` +
          `Sobre: ${propiedad} - ${desarrollo}\n` +
          `💰 $${precioFmt}\n\n` +
          `📞 Contáctalo: ${lead.phone}`;
      }

      // Actualizar status de la oferta
      await offerService.updateOfferStatus(recentOffer.id, nuevoStatus as OfferStatus, vendedor?.id, body);

      // Retornar respuesta con notificación al vendedor
      return {
        action: 'handled',
        response: respuestaLead,
        sendVia: 'meta',
        notifyVendor: vendedor?.phone ? {
          phone: vendedor.phone,
          message: notaVendedor
        } : undefined
      };

    } catch (err) {
      console.error('Error en checkOfferResponse:', err);
      return { action: 'continue_to_ai' };
    }
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
        `¡Claro! Solo una pregunta: ¿rentas actualmente o ya tienes casa propia? 🏠\n\nMuchos clientes que rentaban ahora tienen su casa propia pagando lo mismo.`
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
    // Detectar si el lead pregunta por "llamada" o "cita" (visita presencial)
    const pideLlamada = mensajeLower.includes('llamada') || mensajeLower.includes('llamar');
    const pideCita = mensajeLower.includes('cita') || mensajeLower.includes('visita');
    console.log(`🔍 Buscando cita para lead_id: ${lead.id} - Lead: ${lead.name} - Tipo: ${pideLlamada ? 'LLAMADA' : pideCita ? 'CITA' : 'GENÉRICO'}`);

    // Buscar cita activa (scheduled o confirmed) - filtrar por tipo
    let query = this.supabase.client
      .from('appointments')
      .select('id, scheduled_date, scheduled_time, property_name, vendedor_id, vendedor_name, google_event_vendedor_id, appointment_type')
      .eq('lead_id', lead.id)
      .in('status', ['scheduled', 'confirmed']);

    // Filtrar por tipo según lo que pide el lead
    if (pideLlamada && !pideCita) {
      query = query.eq('appointment_type', 'llamada');
    } else if (pideCita && !pideLlamada) {
      query = query.neq('appointment_type', 'llamada');
    }

    const { data: citasActivas, error: citaError } = await query
      .order('scheduled_date', { ascending: true })
      .limit(1);

    const citaActiva = citasActivas && citasActivas.length > 0 ? citasActivas[0] : null;

    // Si encontró cita, buscar datos del vendedor
    let citaConVendedor = citaActiva as any;
    if (citaActiva && citaActiva.vendedor_id) {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('id', citaActiva.vendedor_id)
        .single();
      if (vendedor) {
        citaConVendedor = { ...citaActiva, team_members: vendedor };
      }
    }
    console.log('🔍 Cita encontrada:', citaConVendedor ? `${citaConVendedor.id} (${citaConVendedor.appointment_type || 'visita'})` : 'NINGUNA', '- Error:', citaError?.message || 'ninguno');

    // Si no encontró del tipo pedido, verificar si hay del otro tipo
    if (!citaActiva && (pideLlamada || pideCita)) {
      const { data: citaOtroTipo } = await this.supabase.client
        .from('appointments')
        .select('id, scheduled_date, scheduled_time, appointment_type')
        .eq('lead_id', lead.id)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1);

      if (citaOtroTipo && citaOtroTipo.length > 0) {
        const tipoEncontrado = citaOtroTipo[0].appointment_type === 'llamada' ? 'llamada' : 'cita presencial';
        const tipoPedido = pideLlamada ? 'llamada' : 'cita';
        const nombreLead = lead.name?.split(' ')[0] || '';
        console.log(`⚠️ No hay ${tipoPedido}, pero sí hay ${tipoEncontrado}`);

        return {
          action: 'handled',
          response: `Hola ${nombreLead}! 😊\n\nNo tienes una *${tipoPedido}* programada, pero sí tienes una *${tipoEncontrado}* para el ${citaOtroTipo[0].scheduled_date} a las ${citaOtroTipo[0].scheduled_time}.\n\n¿Te gustaría hacer algo con esa ${tipoEncontrado}?`,
          sendVia: 'meta'
        };
      }
    }

    // REAGENDAR/CAMBIAR CITA - Pasar a IA para manejar con contexto
    if (this.detectaReagendarCita(mensajeLower)) {
      console.log('🔄 Detectado intento de reagendar cita - pasando a IA');
      return { action: 'continue_to_ai' };
    }

    // CANCELAR CITA
    if (this.detectaCancelarCita(mensajeLower)) {
      return this.procesarCancelarCita(lead, citaConVendedor, pideLlamada ? 'llamada' : pideCita ? 'cita' : null);
    }

    // CONFIRMAR CITA
    if (this.detectaConfirmarCita(mensajeLower) && citaConVendedor) {
      return this.procesarConfirmarCita(lead, citaConVendedor);
    }

    // PREGUNTAR POR CITA (solo si no es reagendar)
    if (this.detectaPreguntaCita(mensajeLower)) {
      return this.procesarPreguntaCita(lead, citaConVendedor);
    }

    return { action: 'continue_to_ai' };
  }

  private detectaReagendarCita(msg: string): boolean {
    return msg.includes('cambiar') || msg.includes('mover') ||
           msg.includes('reagendar') || msg.includes('re-agendar') ||
           msg.includes('otra fecha') || msg.includes('otro día') ||
           msg.includes('otro dia') || msg.includes('otra hora');
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
    // Excluir preguntas sobre horarios disponibles (para agendar)
    if (msg.includes('horario') || msg.includes('disponible')) {
      return false;
    }
    return msg.includes('a que hora es') || msg.includes('a qué hora es') ||
           msg.includes('a que hora tengo') || msg.includes('a qué hora tengo') ||
           msg.includes('cuando es mi cita') || msg.includes('cuándo es mi cita') ||
           msg.includes('fecha de mi cita') ||
           (msg.includes('mi cita') && !msg.includes('agendar') && !msg.includes('nueva'));
  }

  private async procesarCancelarCita(lead: any, cita: CitaActiva | null, tipoPedido?: string | null): Promise<LeadMessageResult> {
    if (!cita) {
      const tipoTexto = tipoPedido === 'llamada' ? 'llamada' : tipoPedido === 'cita' ? 'cita' : 'cita';
      return {
        action: 'handled',
        response: `No encontré ninguna ${tipoTexto} activa a tu nombre. 🤔\n\n¿En qué más puedo ayudarte?`,
        sendVia: 'meta'
      };
    }

    // Cancelar en BD
    const { error: cancelErr } = await this.supabase.client.from('appointments').update({
      status: 'cancelled',
      cancellation_reason: 'Cancelado por cliente via WhatsApp'
    }).eq('id', cita.id);
    if (cancelErr) console.error('⚠️ Error cancelando cita:', cancelErr);
    else console.log('✅ Cita cancelada en BD');

    const esLlamada = (cita as any).appointment_type === 'llamada';
    const tipoTexto = esLlamada ? 'llamada' : 'cita';
    const respuestaCancelacion = `Entendido ${lead.name?.split(' ')[0] || ''}, tu ${tipoTexto} ha sido cancelada. 😊\n\n` +
                `Si cambias de opinión o quieres reagendar, solo escríbeme.\n\n¡Que tengas buen día!`;
    const result: LeadMessageResult = {
      action: 'handled',
      response: respuestaCancelacion,
      sendVia: 'meta'
    };

    // Revertir lead.status a 'contacted' + guardar en conversation_history (atómico)
    try {
      const { data: leadActual } = await this.supabase.client
        .from('leads')
        .select('conversation_history, status')
        .eq('id', lead.id)
        .single();
      const historial = leadActual?.conversation_history || [];
      historial.push(
        { role: 'user', content: `quiero cancelar mi ${tipoTexto}`, timestamp: new Date().toISOString() },
        { role: 'assistant', content: respuestaCancelacion, timestamp: new Date().toISOString() }
      );
      const { error: updateErr } = await this.supabase.client
        .from('leads')
        .update({
          status: 'contacted',
          status_changed_at: new Date().toISOString(),
          conversation_history: historial.slice(-30)
        })
        .eq('id', lead.id);
      if (updateErr) console.error('⚠️ Error actualizando lead post-cancelación:', updateErr);
      else console.log('✅ Lead actualizado: status→contacted + historial guardado');
    } catch (e) {
      console.error('⚠️ Error en update post-cancelación:', e);
    }

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

    // Borrar evento de Google Calendar
    const eventId = cita.google_event_vendedor_id;
    if (eventId) {
      result.deleteCalendarEvent = eventId;
      console.log('📅 Marcando evento para borrar de Calendar:', eventId);
    }

    console.error('❌ Cita cancelada por lead:', lead.name);
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

    // Si muestra interés, pasar a IA con contexto para que responda con info real de la promo
    if (esInteres) {
      console.log('📢 Interés en broadcast detectado, pasando a IA con contexto');
      return {
        action: 'continue_to_ai',
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
        response: `¡Claro! Solo una pregunta: ¿rentas actualmente o ya tienes casa propia? 🏠\n\nA veces hay opciones que no conoces.`,
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESPUESTA A MENSAJE AUTOMÁTICO
  // Maneja respuestas a: lead frío, aniversario, cumpleaños, post-venta, etc.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async checkAutoMessageResponse(
    lead: any,
    body: string,
    mensajeLower: string,
    notasLead: any
  ): Promise<LeadMessageResult> {
    const pendingResponse = notasLead?.pending_auto_response;
    if (!pendingResponse) return { action: 'continue_to_ai' };

    // Verificar que el mensaje automático fue enviado en las últimas 48 horas
    const sentAt = pendingResponse.sent_at ? new Date(pendingResponse.sent_at) : null;
    if (!sentAt) return { action: 'continue_to_ai' };

    const horasTranscurridas = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
    if (horasTranscurridas > 48) {
      console.log('⏰ Mensaje automático muy antiguo (>48h), ignorando contexto');
      return { action: 'continue_to_ai' };
    }

    const tipoMensaje = pendingResponse.type;
    const nombreLead = lead.name?.split(' ')[0] || 'Hola';
    const propiedad = lead.property_interest || 'nuestros desarrollos';

    console.log(`📩 Respuesta a mensaje automático tipo: ${tipoMensaje}`);

    // Detectar tipo de respuesta
    const respuestasPositivas = ['si', 'sí', 'me interesa', 'quiero', 'ok', 'va', 'dale', 'claro', 'por supuesto', 'adelante', 'bueno', 'bien', 'perfecto', 'de acuerdo'];
    const respuestasNegativas = ['no', 'no gracias', 'no me interesa', 'paso', 'ya no', 'no por ahora', 'despues', 'después', 'luego'];
    const respuestasNeutras = ['gracias', 'voy bien', 'todo bien', 'bien gracias', 'bien', 'excelente', 'muy bien', 'genial', '👍', '🙏', '😊'];

    // Detectar si es una SOLICITUD ESPECÍFICA que debe pasar a la IA
    // Palabras clave que indican una pregunta/solicitud concreta
    const palabrasSolicitud = [
      'ubicación', 'ubicacion', 'dirección', 'direccion', 'donde', 'dónde', 'mapa',
      'video', 'videos', 'foto', 'fotos', 'imagen', 'imagenes', 'imágenes',
      'precio', 'precios', 'costo', 'costos', 'cuánto', 'cuanto', 'enganche', 'mensualidad',
      'información', 'informacion', 'info', 'detalles', 'más', 'mas',
      'agendar', 'cita', 'visita', 'cuando', 'cuándo', 'horario', 'disponible',
      'recorrido', 'recorridos', 'conocer', 'ver',
      'credito', 'crédito', 'infonavit', 'fovissste', 'financiamiento',
      'amenidades', 'metros', 'm2', 'tamaño', 'habitaciones', 'recámaras', 'recamaras',
      'llamar', 'llamame', 'llámame', 'llama', 'contactar', 'contacta',
      'enviar', 'mandar', 'manda', 'mandame', 'mándame', 'enviame', 'envíame', 'pasa',
      'qué', 'que', 'cómo', 'como', 'cuál', 'cual' // Preguntas
    ];

    // Usar word boundaries para evitar falsos positivos (ej: 'ver' en 'verdad', 'que' en 'aunque')
    const esSolicitudEspecifica = palabrasSolicitud.some(palabra => {
      // Palabras cortas (<=3 chars) necesitan word boundary estricto
      if (palabra.length <= 3) {
        const regex = new RegExp(`(?:^|\\s|[¿¡])${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$|[?!.,;:])`, 'i');
        return regex.test(mensajeLower);
      }
      return mensajeLower.includes(palabra);
    }) || mensajeLower.includes('?') ||
         mensajeLower.length > 100; // Solo mensajes MUY largos (>100 chars) — antes era 60 que capturaba respuestas normales

    const esPositiva = respuestasPositivas.some(r => mensajeLower === r || mensajeLower.startsWith(r + ' '));
    const esNegativa = respuestasNegativas.some(r => mensajeLower === r || mensajeLower.startsWith(r + ' '));
    const esNeutra = respuestasNeutras.some(r => mensajeLower === r || mensajeLower.startsWith(r));

    // Si es una SOLICITUD ESPECÍFICA, pasar a la IA para que responda apropiadamente
    // Pero aún notificar al vendedor
    if (esSolicitudEspecifica && !esNegativa) {
      console.log(`📝 Solicitud específica detectada, pasando a IA: "${body.substring(0, 50)}..."`);

      // Notificar al vendedor sobre la solicitud
      const vendedorId = pendingResponse.vendedor_id || lead.assigned_to;
      let notifyVendor: LeadMessageResult['notifyVendor'];

      if (vendedorId) {
        const { data: vendedorData } = await this.supabase.client
          .from('team_members')
          .select('phone, name')
          .eq('id', vendedorId)
          .single();

        if (vendedorData?.phone) {
          const tipoLabel = this.getTipoMensajeLabel(tipoMensaje);
          notifyVendor = {
            phone: vendedorData.phone,
            message: `📬 *SOLICITUD DE LEAD*\n\n` +
                     `👤 *${lead.name || 'Lead sin nombre'}*\n` +
                     `📱 ${lead.phone}\n` +
                     `📝 Contexto: ${tipoLabel}\n\n` +
                     `💬 Pide: "${body.substring(0, 200)}"\n\n` +
                     `⚡ *Atender pronto - Lead reactivado*`
          };
        }
      }

      // Limpiar pending_auto_response y marcar como reactivado
      const newNotes = { ...notasLead };
      delete newNotes.pending_auto_response;
      newNotes.reactivado_solicitud = {
        type: tipoMensaje,
        solicitud: body.substring(0, 200),
        at: new Date().toISOString()
      };

      // Si respondió a un mensaje de cadencia, DETENER la cadencia
      if (tipoMensaje.startsWith('cadencia_') && newNotes.cadencia?.activa) {
        console.log(`🛑 Cadencia ${newNotes.cadencia.tipo} detenida: lead ${lead.name} respondió con solicitud`);
        newNotes.cadencia = {
          ...newNotes.cadencia,
          activa: false,
          motivo_fin: 'lead_respondio',
          respondio_en_paso: newNotes.cadencia.paso_actual,
          respondio_at: new Date().toISOString()
        };
      }

      // Pasar a la IA pero con contexto de que es un lead reactivado
      return {
        action: 'continue_to_ai',
        notifyVendor,
        updateLead: {
          notes: newNotes,
          status: lead.status === 'cold' ? 'contacted' : lead.status
        }
      };
    }

    // Obtener vendedor para notificar
    let notifyVendor: LeadMessageResult['notifyVendor'];
    const vendedorId = pendingResponse.vendedor_id || lead.assigned_to;

    if (vendedorId) {
      const { data: vendedorData } = await this.supabase.client
        .from('team_members')
        .select('phone, name')
        .eq('id', vendedorId)
        .single();

      if (vendedorData?.phone) {
        const tipoLabel = this.getTipoMensajeLabel(tipoMensaje);
        const estadoRespuesta = esPositiva ? '✅ INTERESADO' : esNegativa ? '❌ No interesado' : '💬 Respuesta recibida';

        notifyVendor = {
          phone: vendedorData.phone,
          message: `📬 *RESPUESTA DE LEAD*\n\n` +
                   `👤 *${lead.name || 'Lead sin nombre'}*\n` +
                   `📱 ${lead.phone}\n` +
                   `📝 Mensaje: ${tipoLabel}\n\n` +
                   `💬 Respondió: "${body.substring(0, 150)}"\n\n` +
                   `${estadoRespuesta}\n\n` +
                   `${esPositiva ? '⚡ *¡Contáctalo ahora!*' : ''}`
        };
      }
    }

    // Generar respuesta según tipo de mensaje y respuesta del lead
    let respuesta = '';
    let updateLead: Record<string, any> = {};

    switch (tipoMensaje) {
      case 'lead_frio':
      case 'reengagement': {
        const palabrasPosFrio = ['sí', 'si', 'claro', 'dale', 'va', 'sale', 'ok', 'okey', 'bueno', 'bien',
          'interesa', 'interesado', 'interesada', 'quiero', 'me gustaría', 'me gustaria', 'ándale', 'andale',
          'por supuesto', 'encantado', 'encantada', 'perfecto', 'genial', 'excelente', 'adelante', 'venga'];
        const palabrasNegFrio = ['no', 'nel', 'nop', 'nope', 'paso', 'ya no', 'no gracias', 'no me interesa',
          'dejame', 'déjame', 'no quiero', 'ya compré', 'ya compre', 'ya tengo', 'otro lado'];

        const esFrioPositivo = esPositiva || palabrasPosFrio.some(p => mensajeLower.includes(p));
        const esFrioNegativo = esNegativa || palabrasNegFrio.some(p => mensajeLower.includes(p));

        if (esFrioNegativo && !esFrioPositivo) {
          respuesta = `¡Claro ${nombreLead}! Solo una pregunta rápida: ¿rentas actualmente o ya tienes casa propia? 🏠\n\n` +
                      `A veces hay opciones de financiamiento que podrían sorprenderte.`;
        } else if (esFrioPositivo) {
          respuesta = `¡Qué gusto ${nombreLead}! 😊\n\n` +
                      `Me encanta que sigas interesado en ${propiedad}.\n\n` +
                      `Para que conozcas todos los detalles, *¿qué día te funciona para una visita?* 🏠`;
          updateLead = { status: 'contacted', notes: { ...notasLead, reactivado: new Date().toISOString() } };
        } else {
          respuesta = `¡Gracias por responder ${nombreLead}! 😊\n\n` +
                      `¿Te gustaría que tu asesor te contacte para platicar sobre ${propiedad}?`;
        }
        break;
      }

      case 'aniversario':
        if (esNeutra || body.length < 50) {
          respuesta = `¡Nos da mucho gusto saber que estás bien ${nombreLead}! 🏠💙\n\n` +
                      `Disfruta tu hogar. Si necesitas algo, aquí estamos para ayudarte.`;
        } else {
          respuesta = `¡Gracias por compartir ${nombreLead}! 🏠\n\n` +
                      `Nos alegra que disfrutes tu hogar. Cualquier cosa que necesites, no dudes en escribirnos.`;
        }
        break;

      case 'cumpleanos':
        respuesta = `¡Gracias ${nombreLead}! 🎉\n\n` +
                    `Esperamos que la pases increíble en tu día especial. ¡Un abrazo grande!`;
        break;

      case 'postventa': {
        const palabrasPosPostventa = ['excelente', 'perfecto', 'genial', 'increíble', 'increible', 'maravilloso',
          'muy bien', 'todo bien', 'contento', 'contenta', 'satisfecho', 'satisfecha', 'feliz', 'encantado', 'encantada',
          'super', 'mejor', 'bien', 'bueno', 'buena', 'a gusto', 'agusto', 'sin problema', 'sin novedad', 'gracias'];
        const palabrasNegPostventa = ['mal', 'peor', 'horrible', 'terrible', 'pésimo', 'pesimo', 'molesto', 'molesta',
          'problema', 'problemas', 'queja', 'mala', 'malo', 'pésima', 'pesima', 'no funciona', 'defecto', 'desperfecto'];

        const esPostvPositivo = esPositiva || esNeutra || palabrasPosPostventa.some(p => mensajeLower.includes(p));
        const esPostvNegativo = esNegativa || palabrasNegPostventa.some(p => mensajeLower.includes(p));

        if (esPostvNegativo && !esPostvPositivo) {
          respuesta = `Gracias por tu respuesta ${nombreLead}.\n\n` +
                      `Tu asesor te contactará para ver cómo podemos ayudarte.`;
          notifyVendor = true;
        } else if (esPostvPositivo) {
          respuesta = `¡Qué bueno saber que todo va bien ${nombreLead}! 🏠\n\n` +
                      `Gracias por ser parte de nuestra comunidad. Si necesitas algo, aquí estamos.`;
        } else {
          respuesta = `¡Gracias por tu opinión ${nombreLead}! 🏠\n\n` +
                      `Tu asesor revisará tu mensaje. Si necesitas algo, aquí estamos.`;
        }
        break;
      }

      case 'recordatorio_pago': {
        const palabrasPosPago = ['sí', 'si', 'claro', 'listo', 'ya pagué', 'ya pague', 'ya lo hice', 'hecho',
          'pagado', 'transferí', 'transferi', 'deposité', 'deposite', 'ok', 'bien', 'perfecto', 'gracias',
          'ya quedó', 'ya quedo', 'confirmado', 'realizado'];
        const palabrasNegPago = ['no', 'no puedo', 'problema', 'dificultad', 'ayuda', 'aplazar', 'atrasar',
          'no tengo', 'sin dinero', 'difícil', 'dificil', 'complicado'];

        const esPagoPositivo = esPositiva || palabrasPosPago.some(p => mensajeLower.includes(p));
        const esPagoNegativo = esNegativa || palabrasNegPago.some(p => mensajeLower.includes(p));

        if (esPagoNegativo && !esPagoPositivo) {
          respuesta = `Entendido ${nombreLead}. Tu asesor te contactará para ver las opciones disponibles.`;
          notifyVendor = true;
        } else if (esPagoPositivo) {
          respuesta = `Perfecto ${nombreLead}, ¡gracias por confirmar! 💪\n\n` +
                      `Si tienes alguna duda sobre tu pago, tu asesor está disponible para ayudarte.`;
        } else {
          respuesta = `Entendido ${nombreLead}. Tu asesor te contactará para ver las opciones disponibles.`;
        }
        break;
      }

      case 'seguimiento_credito': {
        const palabrasPosCredito = ['sí', 'si', 'claro', 'perfecto', 'genial', 'bien', 'bueno', 'ok',
          'quiero', 'interesa', 'adelante', 'me gustaría', 'me gustaria', 'avanzar', 'continuar',
          'seguir', 'actualización', 'actualizacion', 'cómo va', 'como va', 'qué pasó', 'que paso'];
        const palabrasNegCredito = ['no', 'ya no', 'cancelar', 'no me interesa', 'no quiero', 'desisto',
          'paso', 'dejarlo', 'olvidalo', 'olvídalo', 'no gracias', 'otro banco', 'otra opción'];

        const esCreditoPositivo = esPositiva || palabrasPosCredito.some(p => mensajeLower.includes(p));
        const esCreditoNegativo = esNegativa || palabrasNegCredito.some(p => mensajeLower.includes(p));

        if (esCreditoNegativo && !esCreditoPositivo) {
          respuesta = `Entendido ${nombreLead}. Si cambias de opinión o necesitas información sobre otras opciones de financiamiento, aquí estamos. 🏠`;
        } else if (esCreditoPositivo) {
          respuesta = `¡Perfecto ${nombreLead}! 🏦\n\n` +
                      `Tu asesor de crédito te contactará para darte una actualización detallada sobre tu solicitud.`;
        } else {
          respuesta = `¡Gracias por responder ${nombreLead}! 🏦\n\n` +
                      `Le paso tu mensaje a tu asesor de crédito para que te contacte con los detalles.`;
        }
        break;
      }

      case 'followup_inactivo':
      case 'remarketing': {
        const palabrasPosInactivo = ['sí', 'si', 'claro', 'dale', 'va', 'sale', 'ok', 'okey', 'bueno', 'bien',
          'interesa', 'interesado', 'interesada', 'quiero', 'me gustaría', 'me gustaria', 'ándale', 'andale',
          'por supuesto', 'encantado', 'encantada', 'perfecto', 'genial', 'excelente', 'adelante', 'venga',
          'sigo buscando', 'sigo interesado', 'sigo interesada', 'todavía busco', 'aún busco'];
        const palabrasNegInactivo = ['no', 'nel', 'nop', 'nope', 'paso', 'ya no', 'no gracias', 'no me interesa',
          'dejame', 'déjame', 'no quiero', 'ya compré', 'ya compre', 'ya tengo', 'otro lado', 'ya encontré',
          'ya encontre', 'no busco'];

        const esInactivoPositivo = esPositiva || palabrasPosInactivo.some(p => mensajeLower.includes(p));
        const esInactivoNegativo = esNegativa || palabrasNegInactivo.some(p => mensajeLower.includes(p));

        if (esInactivoNegativo && !esInactivoPositivo) {
          respuesta = `¡Claro ${nombreLead}! Sin presión. Solo una pregunta: ¿ya encontraste casa o sigues buscando? 🏠`;
        } else if (esInactivoPositivo) {
          respuesta = `¡Qué gusto ${nombreLead}! 😊\n\n` +
                      `Me alegra que sigas interesado. Tenemos casas desde $1.6M con excelentes opciones de financiamiento.\n\n` +
                      `*¿Qué día te funciona para una visita?* 🏠`;
          updateLead = { status: 'contacted', notes: { ...notasLead, reactivado: new Date().toISOString() } };
        } else {
          respuesta = `¡Gracias por responder ${nombreLead}! 😊\n\n` +
                      `¿Te gustaría conocer las opciones disponibles? Puedo agendar una visita sin compromiso.`;
        }
        break;
      }

      case 'recordatorio_cita': {
        const citaDesarrollo = (notasLead.pending_auto_response as any)?.desarrollo || 'nuestro desarrollo';
        const palabrasPosCita = ['sí', 'si', 'claro', 'confirmo', 'confirmado', 'ahí estaré', 'ahi estare',
          'ahí estamos', 'perfecto', 'listo', 'va', 'sale', 'ok', 'voy', 'llego', 'nos vemos', 'dale',
          'por supuesto', 'cuenten conmigo', 'de acuerdo', 'bien', 'excelente', 'genial'];
        const palabrasNegCita = ['no', 'no puedo', 'cancelo', 'cancela', 'cancelar', 'reagendar', 'cambiar',
          'otro día', 'otro dia', 'no voy', 'no llego', 'surgió algo', 'surgio algo', 'imposible',
          'no me es posible', 'mover la cita', 'posponer'];

        const esCitaPositivo = esPositiva || palabrasPosCita.some(p => mensajeLower.includes(p));
        const esCitaNegativo = esNegativa || palabrasNegCita.some(p => mensajeLower.includes(p));

        if (esCitaNegativo && !esCitaPositivo) {
          respuesta = `Entendido ${nombreLead}. ¿Te gustaría reagendar para otro día? Puedo buscarte un horario que te funcione mejor. 📅`;
        } else if (esCitaPositivo) {
          respuesta = `¡Perfecto ${nombreLead}! 🏠\n\n` +
                      `Te esperamos en ${citaDesarrollo}. Si necesitas la ubicación, con gusto te la envío. 📍`;
        } else {
          respuesta = `¡Gracias por confirmar ${nombreLead}! 😊\n\n` +
                      `Si tienes alguna pregunta antes de tu visita, aquí estoy para ayudarte.`;
        }
        break;
      }

      case 'referidos': {
        const palabrasPosReferidos = ['sí', 'si', 'claro', 'tengo', 'conozco', 'un amigo', 'una amiga',
          'mi hermano', 'mi hermana', 'mi primo', 'mi prima', 'mi vecino', 'mi vecina', 'mi compadre',
          'mi comadre', 'un familiar', 'un conocido', 'alguien', 'un compañero', 'un compañera',
          'de hecho', 'justo', 'dale', 'va', 'ok', 'perfecto', 'me interesa'];
        const palabrasNegReferidos = ['no', 'no conozco', 'nadie', 'no tengo', 'no se me ocurre',
          'ahorita no', 'por ahora no', 'no gracias', 'paso', 'no sé', 'no se', 'ninguno'];

        const esRefPositivo = esPositiva || palabrasPosReferidos.some(p => mensajeLower.includes(p));
        const esRefNegativo = esNegativa || palabrasNegReferidos.some(p => mensajeLower.includes(p));

        if (esRefNegativo && !esRefPositivo) {
          respuesta = `¡Sin problema ${nombreLead}! Si en el futuro alguien te pregunta por casas, aquí estamos. 😊`;
        } else if (esRefPositivo) {
          respuesta = `¡Excelente ${nombreLead}! 🎁\n\n` +
                      `Comparte el nombre y teléfono de tu referido y yo me encargo de contactarlo.\n\n` +
                      `Recuerda: *ambos reciben un regalo especial* si tu referido compra. 🏠`;
        } else {
          respuesta = `¡Gracias por responder ${nombreLead}! 🏠\n\n` +
                      `Si tienes algún familiar o amigo buscando casa, solo pásame su nombre y número. ¡Sin compromiso!`;
        }
        break;
      }

      case 'nps': {
        // Intentar extraer score numérico del mensaje verbose (ej: "9 de 10 todo excelente")
        const npsMatch = body.match(/\b(\d{1,2})\b/);
        const npsScore = npsMatch ? parseInt(npsMatch[1]) : null;
        const npsValido = npsScore !== null && npsScore >= 0 && npsScore <= 10;

        if (npsValido) {
          // Score extraído — clasificar y guardar
          const categoria = npsScore >= 9 ? 'promotor' : npsScore >= 7 ? 'pasivo' : 'detractor';
          notasLead.nps_score = npsScore;
          notasLead.nps_categoria = categoria;
          notasLead.nps_respondido = new Date().toISOString();
          notasLead.esperando_feedback_nps = true;
          notasLead.esperando_feedback_nps_at = new Date().toISOString();
          updateLead = { ...updateLead, survey_rating: npsScore, survey_completed: true };

          if (npsScore >= 9) {
            respuesta = `¡Muchas gracias por tu calificación ${nombreLead}! 🎉\n\n` +
                        `Nos alegra saber que tuviste una gran experiencia. Si conoces a alguien que busque casa, ¡con gusto lo atendemos!`;
          } else if (npsScore >= 7) {
            respuesta = `¡Gracias por tu respuesta ${nombreLead}! 😊\n\n` +
                        `Tu opinión nos ayuda a seguir mejorando. ¿Hay algo que podamos mejorar?`;
          } else {
            respuesta = `Gracias por tu honestidad ${nombreLead}. 🙏\n\n` +
                        `Lamentamos que tu experiencia no haya sido la mejor. Tu asesor te contactará para ver cómo podemos mejorar.`;
            notifyVendor = true;
          }
        } else {
          // Sin número — clasificar sentimiento con palabras clave (más flexible que esPositiva/esNeutra)
          const palabrasPositivasNPS = ['excelente', 'perfecto', 'genial', 'increíble', 'increible', 'maravilloso',
            'muy bien', 'todo bien', 'contento', 'satisfecho', 'feliz', 'encantado', 'super', 'buenísimo',
            'buenisimo', 'mejor', 'bien', 'bueno', 'buena', 'recomiendo', 'padre', 'chido', 'chingon'];
          const palabrasNegativasNPS = ['mal', 'peor', 'horrible', 'terrible', 'pésimo', 'pesimo', 'molesto',
            'enojado', 'decepcion', 'decepción', 'queja', 'problema', 'mala', 'malo', 'pésima', 'pesima'];

          const esNpsPositivo = palabrasPositivasNPS.some(p => mensajeLower.includes(p));
          const esNpsNegativo = palabrasNegativasNPS.some(p => mensajeLower.includes(p));

          if (esNpsNegativo && !esNpsPositivo) {
            const estimatedScore = 3;
            notasLead.nps_score = estimatedScore;
            notasLead.nps_categoria = 'detractor';
            notasLead.nps_respondido = new Date().toISOString();
            updateLead = { ...updateLead, survey_rating: estimatedScore, survey_completed: true };
            respuesta = `Gracias por tu honestidad ${nombreLead}. 🙏\n\n` +
                        `Lamentamos que tu experiencia no haya sido la mejor. Tu asesor te contactará para ver cómo podemos mejorar.`;
            notifyVendor = true;
          } else {
            // Positivo o neutral → tratar como positivo
            const estimatedScore = esNpsPositivo ? 9 : 8;
            const categoria = estimatedScore >= 9 ? 'promotor' : 'pasivo';
            notasLead.nps_score = estimatedScore;
            notasLead.nps_categoria = categoria;
            notasLead.nps_respondido = new Date().toISOString();
            updateLead = { ...updateLead, survey_rating: estimatedScore, survey_completed: true };
            respuesta = esNpsPositivo
              ? `¡Muchas gracias por tu calificación ${nombreLead}! 🎉\n\n` +
                `Nos alegra saber que tuviste una gran experiencia. Si conoces a alguien que busque casa, ¡con gusto lo atendemos!`
              : `¡Muchas gracias por tu respuesta ${nombreLead}! 🙏\n\n` +
                `Tu opinión nos ayuda a seguir mejorando. Si hay algo específico que podamos mejorar, no dudes en escribirnos.`;
          }
        }
        // Siempre limpiar flag de espera NPS
        notasLead.esperando_respuesta_nps = false;
        break;
      }

      case 'post_entrega': {
        const palabrasPosEntrega = ['excelente', 'perfecto', 'genial', 'increíble', 'increible', 'maravilloso',
          'muy bien', 'todo bien', 'contento', 'contenta', 'satisfecho', 'satisfecha', 'feliz', 'encantado', 'encantada',
          'super', 'mejor', 'bien', 'bueno', 'buena', 'en orden', 'correcto', 'completo', 'listo', 'lista',
          'sin problema', 'sin novedad', 'todo listo', 'ya tengo', 'ya llegaron', 'ya está'];
        const palabrasNegEntrega = ['mal', 'peor', 'horrible', 'terrible', 'pésimo', 'pesimo', 'molesto', 'molesta',
          'problema', 'problemas', 'falta', 'faltan', 'no llega', 'no llegó', 'no han', 'no me han',
          'pendiente', 'pendientes', 'retraso', 'demora', 'escritura', 'llave', 'llaves', 'servicio', 'servicios',
          'mala', 'malo', 'pésima', 'pesima', 'queja', 'no funciona', 'roto', 'rota'];

        const esEntregaPositivo = esPositiva || esNeutra || palabrasPosEntrega.some(p => mensajeLower.includes(p));
        const esEntregaNegativo = esNegativa || palabrasNegEntrega.some(p => mensajeLower.includes(p));

        if (esEntregaNegativo && !esEntregaPositivo) {
          respuesta = `Gracias por avisarnos ${nombreLead}. 🔧\n\n` +
                      `Tu asesor te contactará lo antes posible para resolver cualquier pendiente.`;
          notifyVendor = true;
        } else if (esEntregaPositivo) {
          respuesta = `¡Qué bueno que todo está en orden ${nombreLead}! 🏠🔑\n\n` +
                      `¡Bienvenido a la familia Santa Rita! Si necesitas algo en el futuro, aquí estamos.`;
        } else {
          respuesta = `¡Gracias por tu respuesta ${nombreLead}! 🏠\n\n` +
                      `Si necesitas ayuda con algo de tu nueva casa, no dudes en escribirme.`;
        }
        break;
      }

      case 'satisfaccion_casa': {
        // Matching flexible para respuestas verbales (mismo patrón que NPS)
        const palabrasPosSatisf = ['excelente', 'perfecto', 'genial', 'increíble', 'increible', 'maravilloso',
          'muy bien', 'todo bien', 'contento', 'contenta', 'satisfecho', 'satisfecha', 'feliz', 'encantado', 'encantada',
          'super', 'mejor', 'bien', 'bueno', 'buena', 'me encanta', 'me gusta', 'padre', 'chido', 'bonita', 'bonito',
          'comoda', 'cómoda', 'comodo', 'cómodo', 'a gusto', 'agusto', 'tranquilo', 'tranquila'];
        const palabrasNegSatisf = ['mal', 'peor', 'horrible', 'terrible', 'pésimo', 'pesimo', 'molesto', 'molesta',
          'problema', 'problemas', 'filtra', 'filtración', 'humedad', 'goteras', 'grieta', 'fisura', 'daño',
          'mala', 'malo', 'pésima', 'pesima', 'queja', 'defecto', 'desperfecto', 'no funciona', 'roto', 'rota'];

        const esSatisfPositivo = esPositiva || esNeutra || palabrasPosSatisf.some(p => mensajeLower.includes(p));
        const esSatisfNegativo = esNegativa || palabrasNegSatisf.some(p => mensajeLower.includes(p));

        if (esSatisfNegativo && !esSatisfPositivo) {
          respuesta = `Lamentamos escuchar eso ${nombreLead}. 😔\n\n` +
                      `Tu asesor se pondrá en contacto contigo para atender cualquier situación. Queremos que estés 100% satisfecho.`;
          notifyVendor = true;
        } else if (esSatisfPositivo) {
          respuesta = `¡Nos da mucho gusto que estés contento con tu casa ${nombreLead}! 🏠💙\n\n` +
                      `¡Gracias por confiar en Grupo Santa Rita!`;
        } else {
          respuesta = `¡Gracias por tu opinión ${nombreLead}! 🏠\n\n` +
                      `Tu retroalimentación es muy valiosa para nosotros. Si hay algo por mejorar, cuéntanos.`;
        }
        break;
      }

      case 'mantenimiento': {
        const palabrasPosMant = ['excelente', 'perfecto', 'genial', 'increíble', 'increible', 'maravilloso',
          'muy bien', 'todo bien', 'contento', 'contenta', 'satisfecho', 'satisfecha', 'feliz', 'encantado', 'encantada',
          'super', 'mejor', 'bien', 'bueno', 'buena', 'en orden', 'sin problema', 'sin novedad', 'no necesito', 'todo perfecto'];
        const palabrasNegMant = ['mal', 'peor', 'horrible', 'terrible', 'pésimo', 'pesimo', 'molesto', 'molesta',
          'problema', 'problemas', 'filtra', 'filtración', 'humedad', 'goteras', 'grieta', 'fisura', 'daño',
          'mala', 'malo', 'pésima', 'pesima', 'queja', 'defecto', 'desperfecto', 'no funciona', 'roto', 'rota',
          'necesito', 'ayuda', 'reparar', 'reparación', 'arreglar', 'proveedores', 'proveedor'];

        const esMantPositivo = esPositiva || esNeutra || palabrasPosMant.some(p => mensajeLower.includes(p));
        const esMantNegativo = esNegativa || palabrasNegMant.some(p => mensajeLower.includes(p));

        if (esMantNegativo && !esMantPositivo) {
          respuesta = `Entendido ${nombreLead}. 🔧\n\n` +
                      `Te paso contacto de proveedores de confianza para lo que necesites. Tu asesor te contactará.`;
          notifyVendor = true;
        } else if (esMantPositivo) {
          respuesta = `¡Perfecto ${nombreLead}! 🏠✅\n\n` +
                      `Qué bueno que todo está en orden. Recuerda que el mantenimiento preventivo alarga la vida de tu hogar. ¡Felicidades!`;
        } else {
          respuesta = `¡Gracias por responder ${nombreLead}! 🏠\n\n` +
                      `Si necesitas recomendación de proveedores para mantenimiento, con gusto te ayudo.`;
        }
        break;
      }

      case 'checkin_60d': {
        const palabrasPosCheckin = ['excelente', 'perfecto', 'genial', 'increíble', 'increible', 'maravilloso',
          'muy bien', 'todo bien', 'contento', 'contenta', 'satisfecho', 'satisfecha', 'feliz', 'encantado', 'encantada',
          'super', 'mejor', 'bien', 'bueno', 'buena', 'a gusto', 'agusto', 'tranquilo', 'tranquila',
          'sin problema', 'sin novedad', 'gracias', 'todo perfecto', 'en orden'];
        const palabrasNegCheckin = ['mal', 'peor', 'horrible', 'terrible', 'pésimo', 'pesimo', 'molesto', 'molesta',
          'problema', 'problemas', 'queja', 'mala', 'malo', 'pésima', 'pesima', 'no funciona', 'defecto',
          'desperfecto', 'filtra', 'humedad', 'goteras', 'grieta', 'daño'];

        const esCheckinPositivo = esPositiva || esNeutra || palabrasPosCheckin.some(p => mensajeLower.includes(p));
        const esCheckinNegativo = esNegativa || palabrasNegCheckin.some(p => mensajeLower.includes(p));

        if (esCheckinNegativo && !esCheckinPositivo) {
          respuesta = `Gracias por compartir ${nombreLead}. 🏡\n\n` +
                      `Tu asesor te contactará para ver cómo podemos ayudarte.`;
          notifyVendor = true;
        } else if (esCheckinPositivo) {
          respuesta = `¡Qué gusto saber que todo va bien ${nombreLead}! 🏡😊\n\n` +
                      `Disfruta tu hogar. Si necesitas algo, aquí estamos para ayudarte.`;
        } else {
          respuesta = `¡Gracias por tu respuesta ${nombreLead}! 🏡\n\n` +
                      `Si hay algo en lo que podamos ayudarte, no dudes en escribirnos.`;
        }
        break;
      }

      default:
        // Respuesta genérica
        if (esPositiva) {
          respuesta = `¡Perfecto ${nombreLead}! 😊\n\n` +
                      `Para avanzar, lo ideal es que conozcas las opciones en persona.\n\n` +
                      `*¿Qué día y hora te funcionan para la visita?* 🏠`;
        } else if (esNegativa) {
          respuesta = `¡Claro ${nombreLead}! Solo una pregunta: ¿buscas casa para ti o para inversión? 🏠\n\n` +
                      `Tenemos opciones desde $1.5M con excelente plusvalía.`;
        } else {
          respuesta = `¡Gracias por tu respuesta ${nombreLead}! 😊\n\n` +
                      `Tu asesor revisará tu mensaje y te contactará si es necesario.`;
        }
    }

    // Limpiar pending_auto_response después de procesar
    const newNotes = { ...notasLead };
    delete newNotes.pending_auto_response;
    newNotes.last_auto_response = {
      type: tipoMensaje,
      response: body.substring(0, 200),
      responded_at: new Date().toISOString()
    };

    // Si respondió a un mensaje de cadencia, DETENER la cadencia
    // El lead ya está activo — no tiene sentido seguir con pasos automáticos
    if (tipoMensaje.startsWith('cadencia_') && newNotes.cadencia?.activa) {
      console.log(`🛑 Cadencia ${newNotes.cadencia.tipo} detenida: lead ${lead.name} respondió`);
      newNotes.cadencia = {
        ...newNotes.cadencia,
        activa: false,
        motivo_fin: 'lead_respondio',
        respondio_en_paso: newNotes.cadencia.paso_actual,
        respondio_at: new Date().toISOString()
      };
    }

    return {
      action: 'handled',
      response: respuesta,
      sendVia: 'meta',
      notifyVendor,
      updateLead: { notes: newNotes, ...updateLead }
    };
  }

  private getTipoMensajeLabel(tipo: string): string {
    const labels: Record<string, string> = {
      'lead_frio': '❄️ Re-engagement lead frío',
      'reengagement': '🔄 Re-engagement',
      'aniversario': '🏠 Felicitación aniversario',
      'cumpleanos': '🎂 Felicitación cumpleaños',
      'postventa': '📦 Seguimiento post-venta',
      'recordatorio_pago': '💰 Recordatorio de pago',
      'seguimiento_credito': '🏦 Seguimiento crédito hipotecario',
      'followup_inactivo': '📬 Follow-up lead inactivo',
      'remarketing': '📣 Remarketing lead frío',
      'recordatorio_cita': '📅 Recordatorio de cita',
      'referidos': '🤝 Solicitud de referidos',
      'nps': '📊 Encuesta NPS',
      'post_entrega': '🔑 Seguimiento post-entrega',
      'satisfaccion_casa': '🏡 Encuesta satisfacción casa',
      'mantenimiento': '🔧 Check-in mantenimiento',
      'checkin_60d': '📅 Check-in 60 días post-venta'
    };
    return labels[tipo] || '📩 Mensaje automático';
  }
}
