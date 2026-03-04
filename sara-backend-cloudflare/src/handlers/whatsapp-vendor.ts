import { HandlerContext } from './whatsapp-types';
import { VendorCommandsService, sanitizeNotes } from '../services/vendorCommandsService';
import { AppointmentSchedulingService } from '../services/appointmentSchedulingService';
import { MortgageService } from '../services/mortgageService';
import { IACoachingService } from '../services/iaCoachingService';
import { VentasService } from '../services/ventasService';
import { OfferTrackingService, CreateOfferParams, OfferStatus } from '../services/offerTrackingService';
import { FollowupService } from '../services/followupService';
import { BridgeService } from '../services/bridgeService';
import { isPendingExpired } from '../utils/teamMessaging';
import { deliverPendingMessage, parseNotasSafe, formatPhoneForDisplay, findLeadByName, freshNotesUpdate } from './whatsapp-utils';
import { AppointmentService } from '../services/appointmentService';
import { safeJsonParse } from '../utils/safeHelpers';
import { formatVendorFeedback } from './whatsapp-utils';
import { createSLAMonitoring } from '../services/slaMonitoringService';
import { ReferralService } from '../services/referralService';

// ═══════════════════════════════════════════════════════════
// Helper: Notificar lead de cita con fallback a template si ventana 24h cerrada
// ═══════════════════════════════════════════════════════════
async function notificarLeadCita(
  ctx: HandlerContext,
  leadPhone: string,
  mensajeDirecto: string,
  pendingNotify: any,
  tipo: 'agendar' | 'reagendar' | 'cancelar'
): Promise<{ enviado: boolean; metodo: string }> {
  // 1. Verificar ventana 24h del lead
  const { data: leadInfo } = await ctx.supabase.client
    .from('leads')
    .select('last_message_at')
    .eq('id', pendingNotify.lead_id)
    .single();

  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const ventanaAbierta = leadInfo?.last_message_at && leadInfo.last_message_at > hace24h;

  if (ventanaAbierta) {
    // Ventana abierta → mensaje directo
    await ctx.meta.sendWhatsAppMessage(leadPhone, mensajeDirecto);
    console.log(`📤 Notificación ${tipo} enviada DIRECTO a lead ${leadPhone}`);
    return { enviado: true, metodo: 'directo' };
  }

  // 2. Ventana cerrada → template fallback
  console.log(`📤 Ventana cerrada para lead ${leadPhone}, usando template para ${tipo}...`);
  const nombreCorto = pendingNotify.lead_name?.split(' ')[0] || 'Hola';

  if (tipo === 'agendar' || tipo === 'reagendar') {
    // appointment_confirmation_v2: ¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.
    try {
      const tipoTexto = tipo === 'reagendar'
        ? 'reagendada'
        : `visita a ${pendingNotify.ubicacion || 'nuestras oficinas'}`;

      await ctx.meta.sendTemplate(leadPhone, 'appointment_confirmation_v2', 'es', [{
        type: 'body',
        parameters: [
          { type: 'text', text: nombreCorto },
          { type: 'text', text: 'Grupo Santa Rita' },
          { type: 'text', text: tipoTexto },
          { type: 'text', text: pendingNotify.fecha },
          { type: 'text', text: pendingNotify.hora }
        ]
      }]);
      console.log(`✅ Template appointment_confirmation_v2 enviado a lead (${tipo})`);
      return { enviado: true, metodo: 'template' };
    } catch (templateErr: any) {
      console.log(`⚠️ Template appointment_confirmation_v2 falló: ${templateErr?.message}`);
    }
  }

  // 3. Para cancelar o si el template de cita falló → seguimiento_lead genérico + guardar mensaje pendiente
  try {
    await ctx.meta.sendTemplate(leadPhone, 'seguimiento_lead', 'es_MX', [{
      type: 'body',
      parameters: [
        { type: 'text', text: nombreCorto },
        { type: 'text', text: 'Grupo Santa Rita' }
      ]
    }]);
    console.log(`✅ Template seguimiento_lead enviado a lead (fallback ${tipo})`);

    // Guardar mensaje real como pendiente en notes del lead
    try {
      const { data: leadData } = await ctx.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', pendingNotify.lead_id)
        .single();

      const notasLead = typeof leadData?.notes === 'object' && leadData?.notes ? leadData.notes : {};
      await ctx.supabase.client
        .from('leads')
        .update({
          notes: {
            ...notasLead,
            pending_notification_message: {
              mensaje: mensajeDirecto,
              tipo,
              saved_at: new Date().toISOString()
            }
          }
        })
        .eq('id', pendingNotify.lead_id);
      console.log(`💾 Mensaje ${tipo} guardado como pending_notification_message`);
    } catch (saveErr) {
      console.error('⚠️ Error guardando pending_notification_message:', saveErr);
    }

    return { enviado: true, metodo: 'template_pending' };
  } catch (e2: any) {
    console.log(`⚠️ Todos los templates fallaron para lead: ${e2?.message}`);
    return { enviado: false, metodo: 'fallido' };
  }
}

export async function handleVendedorMessage(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, teamMembers: any[]): Promise<void> {
  const mensaje = body.toLowerCase().trim();
  const nombreVendedor = vendedor.name?.split(' ')[0] || 'crack';
  const vendorService: any = new VendorCommandsService(ctx.supabase);

  console.log('🔍 VENDEDOR HANDLER - mensaje:', mensaje);

  // ═══════════════════════════════════════════════════════════
  // 0. VERIFICAR SI HAY FLUJO POST-VISITA EN CURSO
  // Intenta por ID primero, luego por teléfono como fallback
  // ═══════════════════════════════════════════════════════════
  let postVisitResult = await handler.procesarPostVisitaVendedor(vendedor.id, body);
  if (!postVisitResult) {
    // Fallback: buscar por teléfono (cubre caso de ID mismatch en test endpoint)
    postVisitResult = await handler.buscarYProcesarPostVisitaPorPhone(from, body, teamMembers);
  }
  if (postVisitResult) {
    console.log('📋 POST-VISITA: Procesando respuesta de vendedor');
    await ctx.meta.sendWhatsAppMessage(from, postVisitResult.respuesta);

    // Ejecutar acciones adicionales si hay
    if (postVisitResult.accion) {
      await handler.ejecutarAccionPostVisita(postVisitResult);
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 0.5 VERIFICAR pending_show_confirmation (pregunta ¿LLEGÓ?)
  // CRÍTICO: Debe correr ANTES de pending_template_selection y
  // pending_message_to_lead que interceptarían "1"/"2"
  // ═══════════════════════════════════════════════════════════
  const showConfirmResult = await procesarRespuestaShowConfirmation(ctx, handler, vendedor.id, mensaje);
  if (showConfirmResult.handled) {
    await ctx.meta.sendWhatsAppMessage(from, showConfirmResult.mensajeVendedor!);

    // Si el lead SÍ llegó, enviar encuesta de satisfacción
    if (showConfirmResult.siLlego && showConfirmResult.leadPhone) {
      await enviarEncuestaSatisfaccion(ctx, handler, showConfirmResult.leadPhone, showConfirmResult.leadName, showConfirmResult.property);
    }

    // Si NO llegó, ofrecer reagendar
    if (showConfirmResult.noLlego && showConfirmResult.leadPhone) {
      const nombreCliente = showConfirmResult.leadName?.split(' ')[0] || 'Hola';
      try {
        await ctx.meta.sendWhatsAppMessage(showConfirmResult.leadPhone,
          `Hola ${nombreCliente}, notamos que no pudiste asistir a tu cita. 😊\n\n` +
          `¿Te gustaría reagendar para otro día?\n` +
          `Escríbenos cuando gustes y con gusto te ayudamos.`
        );
      } catch (err) {
        console.error('Error enviando mensaje reagenda:', err);
      }
    }

    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 1. OBTENER NOTAS Y PROCESAR ESTADOS PENDIENTES
  // ═══════════════════════════════════════════════════════════
  const { notes, notasVendedor } = await vendorService.getVendedorNotes(vendedor.id);

  // ╔════════════════════════════════════════════════════════════════════════╗
  // ║  CRÍTICO: VERIFICAR PENDING MESSAGES PRIMERO                           ║
  // ║  Cuando responden al template, entregar mensaje pendiente y salir      ║
  // ╚════════════════════════════════════════════════════════════════════════╝

  // Actualizar last_sara_interaction (ventana 24h ahora está abierta) — atomic
  if (notasVendedor) {
    notasVendedor.last_sara_interaction = new Date().toISOString();
  }
  await freshNotesUpdate(ctx, vendedor.id, n => { n.last_sara_interaction = new Date().toISOString(); });

  // ═══════════════════════════════════════════════════════════
  // PENDING MESSAGES: Entrega TODOS los pending acumulados (no solo el primero)
  // Usa deliverPendingMessage() que resuelve:
  // 1. Re-lee notes frescas de DB (evita sobreescribir cambios de CRONs)
  // 2. Captura wamid de Meta API (verifica delivery)
  // 3. Verifica errores de Supabase .update() (no falla silenciosamente)
  // ═══════════════════════════════════════════════════════════
  let pendingDelivered = 0;

  // Orden de prioridad: briefing → recap → reportes → video → audio → mensaje → alerta
  const pendingChecks: Array<{
    key: string;
    data: any;
    tipo: string;
    contextKey?: string;
    label: string;
    isSpecial?: 'audio' | 'video';
  }> = [
    { key: 'pending_briefing', data: notasVendedor?.pending_briefing, tipo: 'briefing', contextKey: 'last_briefing_context', label: 'briefing' },
    { key: 'pending_recap', data: notasVendedor?.pending_recap, tipo: 'recap', contextKey: 'last_recap_context', label: 'recap' },
    { key: 'pending_reporte_diario', data: notasVendedor?.pending_reporte_diario, tipo: 'reporte_diario', contextKey: 'last_reporte_diario_context', label: 'reporte diario' },
    { key: 'pending_reporte_semanal', data: notasVendedor?.pending_reporte_semanal, tipo: 'resumen_semanal', contextKey: 'last_reporte_semanal_context', label: 'reporte semanal' },
    { key: 'pending_resumen_semanal', data: notasVendedor?.pending_resumen_semanal, tipo: 'resumen_semanal', contextKey: 'last_resumen_semanal_context', label: 'resumen semanal' },
    { key: 'pending_video_semanal', data: notasVendedor?.pending_video_semanal, tipo: 'video', label: 'video semanal', isSpecial: 'video' },
    { key: 'pending_audio', data: notasVendedor?.pending_audio, tipo: 'audio', label: 'audio TTS', isSpecial: 'audio' },
    { key: 'pending_mensaje', data: notasVendedor?.pending_mensaje, tipo: 'notificacion', label: 'mensaje pendiente' },
    { key: 'pending_alerta_lead', data: notasVendedor?.pending_alerta_lead, tipo: 'notificacion', label: 'alerta de lead' },
  ];

  for (const pc of pendingChecks) {
    try {
      // Audio special case
      if (pc.isSpecial === 'audio' && pc.data?.sent_at && pc.data?.texto) {
        const horasDesde = (Date.now() - new Date(pc.data.sent_at).getTime()) / (1000 * 60 * 60);
        if (horasDesde <= 24 && ctx.env?.OPENAI_API_KEY) {
          console.log(`🔊 [PENDING] ${nombreVendedor} - enviando ${pc.label}`);
          try {
            const { createTTSService } = await import('../services/ttsService');
            const tts = createTTSService(ctx.env.OPENAI_API_KEY);
            const audioResult = await tts.generateAudio(pc.data.texto);
            if (audioResult.success && audioResult.audioBuffer) {
              await ctx.meta.sendVoiceMessage(from, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
              console.log(`✅ Audio TTS entregado a ${nombreVendedor} (${audioResult.audioBuffer.byteLength} bytes)`);
            }
          } catch (ttsErr) {
            console.error('⚠️ Error generando audio TTS:', ttsErr);
          }
          await deliverPendingMessage(ctx, vendedor.id, from, pc.key, '__ALREADY_SENT__');
          pendingDelivered++;
        }
        continue;
      }

      // Video special case (24h expiration)
      if (pc.isSpecial === 'video' && pc.data?.sent_at && pc.data?.mensaje_completo) {
        const horasDesde = (Date.now() - new Date(pc.data.sent_at).getTime()) / (1000 * 60 * 60);
        if (horasDesde <= 24) {
          console.log(`🎬 [PENDING] ${nombreVendedor} - enviando ${pc.label}`);
          await deliverPendingMessage(ctx, vendedor.id, from, pc.key, pc.data.mensaje_completo);
          pendingDelivered++;
        }
        continue;
      }

      // Standard pending messages
      if (pc.data?.sent_at && pc.data?.mensaje_completo) {
        if (!isPendingExpired(pc.data, pc.tipo)) {
          console.log(`📬 [PENDING] ${nombreVendedor} - enviando ${pc.label}`);
          await deliverPendingMessage(ctx, vendedor.id, from, pc.key, pc.data.mensaje_completo, pc.contextKey);
          pendingDelivered++;
        }
      }
    } catch (pendingErr) {
      console.error(`⚠️ Error entregando ${pc.key} a ${nombreVendedor}:`, pendingErr);
      // Continuar con el siguiente pending, no perder los demás
    }
  }

  if (pendingDelivered > 0) {
    console.log(`✅ ${pendingDelivered} pending(s) entregados a ${nombreVendedor}`);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // SELECCIÓN DE TEMPLATE PENDIENTE (lead fuera de 24h)
  // ═══════════════════════════════════════════════════════════
  const pendingTemplateSelection = notasVendedor?.pending_template_selection;
  if (pendingTemplateSelection && /^[1-5]$/.test(mensaje.trim())) {
    const opcion = parseInt(mensaje.trim());
    const leadPhone = pendingTemplateSelection.lead_phone;
    const leadName = pendingTemplateSelection.lead_name?.split(' ')[0] || 'Hola';
    const leadFullName = pendingTemplateSelection.lead_name || 'Lead';
    const leadId = pendingTemplateSelection.lead_id;

    // Formatear teléfono para mostrar
    const telLimpio = leadPhone.replace(/\D/g, '').slice(-10);
    const telFormateado = `${telLimpio.slice(0,3)}-${telLimpio.slice(3,6)}-${telLimpio.slice(6)}`;

    // Opción 5: Cancelar
    if (opcion === 5) {
      const { data: freshCancel } = await ctx.supabase.client
        .from('team_members').select('notes').eq('id', vendedor.id).single();
      const freshCancelNotes: any = typeof freshCancel?.notes === 'string'
        ? parseNotasSafe(freshCancel.notes) : (freshCancel?.notes || {});
      delete freshCancelNotes.pending_template_selection;
      const { error: cancelErr } = await ctx.supabase.client.from('team_members').update({ notes: freshCancelNotes }).eq('id', vendedor.id);
      if (cancelErr) console.error('⚠️ Error updating notes (cancel template):', cancelErr);
      await ctx.meta.sendWhatsAppMessage(from, `✅ Cancelado. No se envió nada a ${leadFullName}.`);
      return;
    }

    // Opción 4: Contacto directo (llamar/WhatsApp desde su cel)
    if (opcion === 4) {
      // Fresh re-read + save direct contact state
      const { data: freshDirect } = await ctx.supabase.client
        .from('team_members').select('notes').eq('id', vendedor.id).single();
      const freshDirectNotes: any = typeof freshDirect?.notes === 'string'
        ? parseNotasSafe(freshDirect.notes) : (freshDirect?.notes || {});
      freshDirectNotes.pending_direct_contact = {
        lead_id: leadId,
        lead_name: leadFullName,
        lead_phone: leadPhone,
        timestamp: new Date().toISOString()
      };
      delete freshDirectNotes.pending_template_selection;
      const { error: directErr } = await ctx.supabase.client.from('team_members').update({ notes: freshDirectNotes }).eq('id', vendedor.id);
      if (directErr) console.error('⚠️ Error updating notes (direct contact):', directErr);

      await ctx.meta.sendWhatsAppMessage(from,
        `📞 *Contacto directo con ${leadFullName}*\n\n` +
        `📱 *Teléfono:* ${formatPhoneForDisplay(leadPhone)}\n` +
        `📲 *WhatsApp:* wa.me/${formatPhoneForDisplay(leadPhone).replace('+', '')}\n` +
        `📞 *Llamar:* tel:${formatPhoneForDisplay(leadPhone)}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *IMPORTANTE*: Después de contactarlo, registra qué pasó:\n\n` +
        `Escribe: *nota ${leadName} [lo que pasó]*\n\n` +
        `Ejemplo:\n` +
        `_nota ${leadName} hablé por tel, quiere visita el sábado_`
      );
      console.log(`📞 Vendedor ${vendedor.name} solicitó contacto directo con ${leadFullName}`);
      return;
    }

    // Opciones 1-3: Enviar template — fresh re-read + error check
    const { data: freshTemplate } = await ctx.supabase.client
      .from('team_members').select('notes').eq('id', vendedor.id).single();
    const freshTemplateNotes: any = typeof freshTemplate?.notes === 'string'
      ? parseNotasSafe(freshTemplate.notes) : (freshTemplate?.notes || {});
    delete freshTemplateNotes.pending_template_selection;
    const { error: tmplErr } = await ctx.supabase.client.from('team_members').update({ notes: freshTemplateNotes }).eq('id', vendedor.id);
    if (tmplErr) console.error('⚠️ Error updating notes (template selection):', tmplErr);

    try {
      // Obtener desarrollo del lead para los templates que lo requieren
      const { data: leadData } = await ctx.supabase.client
        .from('leads')
        .select('property_interest')
        .eq('id', leadId)
        .single();
      const desarrollo = leadData?.property_interest || 'nuestros desarrollos';

      let templateName = '';
      let templateParams: any[] = [];

      switch (opcion) {
        case 1: // Seguimiento - requiere: nombre, desarrollo
          templateName = 'seguimiento_lead';
          templateParams = [{ type: 'body', parameters: [
            { type: 'text', text: leadName },
            { type: 'text', text: desarrollo }
          ] }];
          break;
        case 2: // Reactivación - requiere: solo nombre
          templateName = 'reactivacion_lead';
          templateParams = [{ type: 'body', parameters: [
            { type: 'text', text: leadName }
          ] }];
          break;
        case 3: // Info crédito - requiere: nombre, desarrollo
          templateName = 'info_credito';
          templateParams = [{ type: 'body', parameters: [
            { type: 'text', text: leadName },
            { type: 'text', text: desarrollo }
          ] }];
          break;
      }

      await ctx.meta.sendTemplate(leadPhone, templateName, 'es_MX', templateParams);

      // Guardar qué template se envió en notes (JSONB) para manejar respuesta
      const { data: leadActual } = await ctx.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', pendingTemplateSelection.lead_id)
        .single();
      const notesActuales = typeof leadActual?.notes === 'object' ? leadActual.notes : {};
      notesActuales.template_sent = templateName;
      notesActuales.template_sent_at = new Date().toISOString();
      const { error: leadNoteErr } = await ctx.supabase.client.from('leads').update({
        notes: notesActuales
      }).eq('id', pendingTemplateSelection.lead_id);
      if (leadNoteErr) console.error('⚠️ Error guardando template_sent en lead notes:', leadNoteErr);
      else console.log(`💾 template_sent guardado en notes: ${templateName} para lead ${pendingTemplateSelection.lead_id}`);

      await ctx.meta.sendWhatsAppMessage(from,
        `✅ *Template enviado a ${leadFullName}*\n\n` +
        `Cuando responda, podrás escribirle directamente.\n\n` +
        `💡 Usa *bridge ${leadName}* cuando responda.`
      );
      console.log(`📤 Template ${templateName} enviado a ${leadPhone}`);
    } catch (err) {
      console.error('Error enviando template seleccionado:', err);
      await ctx.meta.sendWhatsAppMessage(from,
        `❌ Error al enviar template. Intenta de nuevo o llama directamente:\n\n` +
        `📱 ${formatPhoneForDisplay(leadPhone)}`
      );
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // MENSAJE PENDIENTE A LEAD (después de comando "ver")
  // ═══════════════════════════════════════════════════════════
  const pendingMsgToLead = notasVendedor?.pending_message_to_lead;
  // ═══ GUARD: Si parece comando conocido, NO reenviar al lead — dejar que el routing normal lo maneje ═══
  const esComandoPending = /^(ver|bridge|citas?|leads?|hoy|ayuda|help|resumen|briefing|meta|brochure|ubicacion|video|coach|quien|quién|info|hot|pendientes|credito|crédito|nuevo|reagendar|cambiar|mover|cancelar|agendar|recordar|llamar|nota|notas|contactar|conectar|cerrar|apartado|aparto|reserva|cumple|email|correo|referido|programar|propiedades|inventario|asignar|adelante|atras|atrás|perdido|cotizar|ofertas?|enviar|coaching|historial|pausar|reanudar|on|off|mis|#)/i.test(mensaje);
  if (pendingMsgToLead && pendingMsgToLead.lead_phone && !esComandoPending) {
    const sentAt = pendingMsgToLead.timestamp ? new Date(pendingMsgToLead.timestamp) : null;
    const minutosTranscurridos = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60) : 999;

    // Solo válido por 10 minutos
    if (minutosTranscurridos <= 10) {
      // Verificar ventana de 24h del lead
      const { data: leadData } = await ctx.supabase.client
        .from('leads')
        .select('last_message_at, name')
        .eq('id', pendingMsgToLead.lead_id)
        .single();

      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const dentroVentana24h = leadData?.last_message_at && leadData.last_message_at > hace24h;
      console.log(`📊 Verificación 24h: last_message_at=${leadData?.last_message_at}, hace24h=${hace24h}, dentroVentana=${dentroVentana24h}`);

      const leadPhone = pendingMsgToLead.lead_phone.startsWith('521')
        ? pendingMsgToLead.lead_phone
        : '521' + pendingMsgToLead.lead_phone.replace(/\D/g, '').slice(-10);

      // Si está fuera de la ventana de 24h, preguntar qué template enviar
      if (!dentroVentana24h) {
        console.error(`⚠️ Lead ${pendingMsgToLead.lead_name} fuera de ventana 24h, preguntando template`);

        // Fresh re-read + save template selection context
        const { data: freshTmplSel } = await ctx.supabase.client
          .from('team_members').select('notes').eq('id', vendedor.id).single();
        const freshTmplSelNotes: any = typeof freshTmplSel?.notes === 'string'
          ? parseNotasSafe(freshTmplSel.notes) : (freshTmplSel?.notes || {});
        freshTmplSelNotes.pending_template_selection = {
          lead_id: pendingMsgToLead.lead_id,
          lead_name: pendingMsgToLead.lead_name,
          lead_phone: leadPhone,
          mensaje_original: body,
          timestamp: new Date().toISOString()
        };
        delete freshTmplSelNotes.pending_message_to_lead;
        const { error: tmplSelErr } = await ctx.supabase.client.from('team_members').update({ notes: freshTmplSelNotes }).eq('id', vendedor.id);
        if (tmplSelErr) console.error('⚠️ Error updating notes (template selection from msg):', tmplSelErr);

        // Formatear teléfono para mostrar
        const telLimpio = leadPhone.replace(/\D/g, '').slice(-10);
        const telFormateado = `${telLimpio.slice(0,3)}-${telLimpio.slice(3,6)}-${telLimpio.slice(6)}`;

        await ctx.meta.sendWhatsAppMessage(from,
          `⚠️ *${pendingMsgToLead.lead_name} no ha escrito en 24h*\n\n` +
          `WhatsApp no permite mensajes directos.\n\n` +
          `*¿Qué quieres hacer?*\n\n` +
          `*1.* 📩 Template reactivación\n` +
          `*2.* 📩 Template seguimiento\n` +
          `*3.* 📩 Template info crédito\n` +
          `*4.* 📞 Contactar directo (te doy su cel)\n` +
          `*5.* ❌ Cancelar\n\n` +
          `_Responde con el número_`
        );
        return;
      }

      try {
        console.log(`📤 Enviando mensaje pendiente a: ${leadPhone} (dentro de 24h)`);
        await ctx.meta.sendWhatsAppMessage(leadPhone,
          `💬 *Mensaje de ${vendedor.name?.split(' ')[0] || 'tu asesor'}:*\n\n${body}`
        );

        // Fresh re-read + clean pending
        const { data: freshMsgSent } = await ctx.supabase.client
          .from('team_members').select('notes').eq('id', vendedor.id).single();
        const freshMsgSentNotes: any = typeof freshMsgSent?.notes === 'string'
          ? parseNotasSafe(freshMsgSent.notes) : (freshMsgSent?.notes || {});
        delete freshMsgSentNotes.pending_message_to_lead;
        freshMsgSentNotes.last_sara_interaction = new Date().toISOString();
        const { error: msgSentErr } = await ctx.supabase.client.from('team_members').update({ notes: freshMsgSentNotes }).eq('id', vendedor.id);
        if (msgSentErr) console.error('⚠️ Error updating notes (msg sent to lead):', msgSentErr);

        await ctx.meta.sendWhatsAppMessage(from,
          `✅ *Mensaje enviado a ${pendingMsgToLead.lead_name}*\n\n` +
          `"${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"\n\n` +
          `💡 Para hablar directo: *bridge ${pendingMsgToLead.lead_name?.split(' ')[0] || 'lead'}*`
        );
        console.log(`✅ Mensaje pendiente enviado exitosamente a ${leadPhone}`);
        return;
      } catch (err: any) {
        console.error('❌ Error enviando mensaje pendiente:', err);
        // Notificar al vendedor del error
        await ctx.meta.sendWhatsAppMessage(from,
          `❌ *Error al enviar mensaje a ${pendingMsgToLead.lead_name}*\n\n` +
          `El mensaje no pudo ser entregado. Intenta con *bridge ${pendingMsgToLead.lead_name?.split(' ')[0]}*`
        );
        // Fresh re-read + clean pending on error
        const { data: freshMsgErr } = await ctx.supabase.client
          .from('team_members').select('notes').eq('id', vendedor.id).single();
        const freshMsgErrNotes: any = typeof freshMsgErr?.notes === 'string'
          ? parseNotasSafe(freshMsgErr.notes) : (freshMsgErr?.notes || {});
        delete freshMsgErrNotes.pending_message_to_lead;
        const { error: msgErrUpd } = await ctx.supabase.client.from('team_members').update({ notes: freshMsgErrNotes }).eq('id', vendedor.id);
        if (msgErrUpd) console.error('⚠️ Error updating notes (msg error cleanup):', msgErrUpd);
        return;
      }
    } else {
      // Expirado — fresh re-read + clean
      const { data: freshExpired } = await ctx.supabase.client
        .from('team_members').select('notes').eq('id', vendedor.id).single();
      const freshExpiredNotes: any = typeof freshExpired?.notes === 'string'
        ? parseNotasSafe(freshExpired.notes) : (freshExpired?.notes || {});
      delete freshExpiredNotes.pending_message_to_lead;
      const { error: expErr } = await ctx.supabase.client.from('team_members').update({ notes: freshExpiredNotes }).eq('id', vendedor.id);
      if (expErr) console.error('⚠️ Error updating notes (expired msg cleanup):', expErr);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🎓 ONBOARDING - Tutorial para vendedores nuevos
  // Solo mostrar si NO es un comando conocido y NO hay bridge/pending activo
  // ═══════════════════════════════════════════════════════════
  const esComandoConocido = /^(ver|bridge|citas?|leads?|hoy|ayuda|help|resumen|briefing|meta|brochure|ubicacion|video|coach|quien|info|hot|pendientes|credito|nuevo|reagendar|cambiar|mover|cancelar|agendar|recordar|llamar|nota|notas|contactar|conectar|cerrar|apartado|aparto|reserva|cumple|birthday|email|correo|referido|programar|propiedades|desarrollos|proyectos|disponibilidad|buscar|banco|enviar|consultar|asignar|preguntar|confirmar|etapa|perdido|crear|material|ok|si|sí|editar|mis|status|mensaje|pipeline|historial|#)/i.test(mensaje);
  const tieneBridgeActivo = notasVendedor?.active_bridge && notasVendedor.active_bridge.expires_at && new Date(notasVendedor.active_bridge.expires_at) > new Date();
  const tienePendingMessage = notasVendedor?.pending_message_to_lead;
  // Verificar si hay algún pending state que espera respuesta numérica
  const tienePendingState = notasVendedor?.pending_reagendar_notify ||
                            notasVendedor?.pending_cancelar_notify ||
                            notasVendedor?.pending_agendar_notify ||
                            notasVendedor?.pending_reagendar_selection ||
                            notasVendedor?.pending_cita_action ||
                            notasVendedor?.pending_agendar_cita ||
                            notasVendedor?.pending_template_selection;

  if (!notasVendedor?.onboarding_completed && !esComandoConocido && !tieneBridgeActivo && !tienePendingMessage && !tienePendingState) {
    console.log(`🎓 ONBOARDING: ${nombreVendedor} es nuevo, enviando tutorial`);

    // Mensaje de bienvenida y tutorial
    const mensajeOnboarding = `¡Hola ${nombreVendedor}! 👋\n\n` +
      `Soy *SARA*, tu asistente de ventas. Te ayudo a:\n\n` +
      `📱 *Comunicarte con leads*\n` +
      `→ Escribe *bridge Juan* para hablar directo\n\n` +
      `📅 *Agendar citas*\n` +
      `→ Escribe *cita María mañana 10am*\n\n` +
      `📊 *Ver tus pendientes*\n` +
      `→ Escribe *mis leads* o *resumen*\n\n` +
      `📍 *Enviar recursos*\n` +
      `→ Escribe *enviar video a Pedro*\n\n` +
      `💡 *Tip:* Escribe *#ayuda* para ver todos los comandos.\n\n` +
      `¿Listo para empezar? Responde *sí* o pregúntame lo que necesites.`;

    await ctx.meta.sendWhatsAppMessage(from, mensajeOnboarding);

    // Fresh re-read + mark onboarding completed
    const { data: freshOnboard } = await ctx.supabase.client
      .from('team_members').select('notes').eq('id', vendedor.id).single();
    const freshOnboardNotes: any = typeof freshOnboard?.notes === 'string'
      ? parseNotasSafe(freshOnboard.notes) : (freshOnboard?.notes || {});
    freshOnboardNotes.onboarding_completed = true;
    freshOnboardNotes.onboarding_date = new Date().toISOString();
    const { error: onboardErr } = await ctx.supabase.client.from('team_members').update({
      notes: freshOnboardNotes
    }).eq('id', vendedor.id);
    if (onboardErr) console.error('⚠️ Error updating notes (onboarding):', onboardErr);

    // Si respondieron "sí" o similar, continuar normalmente
    if (['si', 'sí', 'ok', 'listo', 'va', 'dale'].includes(mensaje)) {
      const confirmacion = `¡Perfecto! 🚀\n\nYa estás listo. Cada mañana a las 8am te enviaré tu briefing con pendientes.\n\n¿En qué te ayudo?`;
      await ctx.meta.sendWhatsAppMessage(from, confirmacion);
    }

    return;
  }

  // ═══════════════════════════════════════════════════════════
  // RESPUESTA A FELICITACIÓN DE CUMPLEAÑOS DEL EQUIPO (ANTES de comandos)
  // ═══════════════════════════════════════════════════════════
  const pendingBirthdayResponse = notasVendedor?.pending_birthday_response;
  if (pendingBirthdayResponse && pendingBirthdayResponse.type === 'cumpleanos_equipo') {
    const sentAt = pendingBirthdayResponse.sent_at ? new Date(pendingBirthdayResponse.sent_at) : null;
    const horasTranscurridas = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60 * 60) : 999;

    // Solo si fue enviado en las últimas 48 horas
    if (horasTranscurridas <= 48) {
      console.log(`🎂 Respuesta a felicitación de cumpleaños de ${nombreVendedor}`);

      // Responder con cariño
      const respuestaCumple = `¡Gracias ${nombreVendedor}! 🎉\n\n` +
        `Nos alegra mucho tu respuesta. ¡Esperamos que la pases increíble en tu día especial!\n\n` +
        `Todo el equipo te manda un abrazo. 🤗`;

      await ctx.meta.sendWhatsAppMessage(from, respuestaCumple);

      // Fresh re-read + clean pending birthday + error check
      const { data: freshBday } = await ctx.supabase.client
        .from('team_members').select('notes').eq('id', vendedor.id).single();
      const freshBdayNotes: any = typeof freshBday?.notes === 'string'
        ? parseNotasSafe(freshBday.notes) : (freshBday?.notes || {});
      delete freshBdayNotes.pending_birthday_response;
      freshBdayNotes.birthday_response_received = {
        at: new Date().toISOString(),
        message: body.substring(0, 200)
      };
      const { error: bdayErr } = await ctx.supabase.client.from('team_members').update({
        notes: freshBdayNotes
      }).eq('id', vendedor.id);
      if (bdayErr) console.error('⚠️ Error updating birthday response:', bdayErr);

      return;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RESPUESTA A BRIEFING/RECAP YA ENTREGADO (feedback simple)
  // (Nota: Los pending se verifican al INICIO del handler)
  // ═══════════════════════════════════════════════════════════
  const briefingContext = notasVendedor?.last_briefing_context;
  const recapContext = notasVendedor?.last_recap_context;

  // Detectar si es una respuesta simple tipo "ok", "gracias", "sí", "va", "perfecto", etc.
  const esRespuestaSimple = /^(ok|okey|okay|va|sí|si|gracias|grax|perfecto|listo|entendido|claro|sale|de acuerdo|recibido|👍|✅|💪|🙏)$/i.test(mensaje);

  if (esRespuestaSimple) {
    // Verificar si hay contexto de briefing reciente YA ENTREGADO (últimas 4 horas)
    if (briefingContext?.sent_at && briefingContext?.delivered) {
      const horasDesde = (Date.now() - new Date(briefingContext.sent_at).getTime()) / (1000 * 60 * 60);
      if (horasDesde <= 4) {
        console.log(`📋 Respuesta a briefing de ${nombreVendedor}: "${body}"`);
        const respuestasBriefing = [
          `¡Éxito hoy ${nombreVendedor}! 💪 Si necesitas algo, escríbeme.`,
          `¡A darle ${nombreVendedor}! 🎯 Recuerda que puedes escribir "citas" o "leads" para más info.`,
          `¡Vamos por esas ${briefingContext.citas || 0} citas! 💪 Estoy aquí si me necesitas.`
        ];
        await ctx.meta.sendWhatsAppMessage(from, respuestasBriefing[Math.floor(Math.random() * respuestasBriefing.length)]);

        // Fresh re-read + clean briefing context
        const { data: freshBriefFb } = await ctx.supabase.client
          .from('team_members').select('notes').eq('id', vendedor.id).single();
        const freshBriefFbNotes: any = typeof freshBriefFb?.notes === 'string'
          ? parseNotasSafe(freshBriefFb.notes) : (freshBriefFb?.notes || {});
        delete freshBriefFbNotes.last_briefing_context;
        const { error: briefFbErr } = await ctx.supabase.client.from('team_members').update({ notes: freshBriefFbNotes }).eq('id', vendedor.id);
        if (briefFbErr) console.error('⚠️ Error cleaning briefing context:', briefFbErr);
        return;
      }
    }

    // Verificar si hay contexto de recap reciente YA ENTREGADO (últimas 4 horas)
    if (recapContext?.sent_at && recapContext?.delivered) {
      const horasDesde = (Date.now() - new Date(recapContext.sent_at).getTime()) / (1000 * 60 * 60);
      if (horasDesde <= 4) {
        console.log(`📋 Respuesta a recap de ${nombreVendedor}: "${body}"`);
        const respuestasRecap = [
          `¡Descansa bien ${nombreVendedor}! 🌙 Mañana con todo.`,
          `¡Buen trabajo hoy! 🎉 Nos vemos mañana.`,
          `¡Gracias por tu esfuerzo ${nombreVendedor}! 💪 Recarga energías.`
        ];
        await ctx.meta.sendWhatsAppMessage(from, respuestasRecap[Math.floor(Math.random() * respuestasRecap.length)]);

        // Fresh re-read + clean recap context
        const { data: freshRecapFb } = await ctx.supabase.client
          .from('team_members').select('notes').eq('id', vendedor.id).single();
        const freshRecapFbNotes: any = typeof freshRecapFb?.notes === 'string'
          ? parseNotasSafe(freshRecapFb.notes) : (freshRecapFb?.notes || {});
        delete freshRecapFbNotes.last_recap_context;
        const { error: recapFbErr } = await ctx.supabase.client.from('team_members').update({ notes: freshRecapFbNotes }).eq('id', vendedor.id);
        if (recapFbErr) console.error('⚠️ Error cleaning recap context:', recapFbErr);
        return;
      }
    }
  }

  const vendorCtx: any = {
    from,
    body,
    mensaje,
    vendedor,
    nombreVendedor,
    teamMembers,
    notes,
    notasVendedor
  };

  // Procesar estados pendientes (birthday, acknowledgment, bridge, pending selections)
  const initialResult = await vendorService.processVendorMessageInitial(vendorCtx);

  if (await executeVendorResult(ctx, handler, from, initialResult, vendedor, nombreVendedor, teamMembers)) {
    return;
  }

  // ╔════════════════════════════════════════════════════════════════════════╗
  // ║  CRÍTICO - NO MODIFICAR SIN CORRER TESTS: npm test                      ║
  // ║  Test file: src/tests/conversationLogic.test.ts                         ║
  // ║  Lógica: src/utils/conversationLogic.ts → shouldForwardToLead()         ║
  // ║                                                                         ║
  // ║  Bridge Vendedor = Chat directo Vendedor ↔ Lead (6 min)                ║
  // ║  - NO reenviar comandos (bridge X, cerrar, #mas, etc)                   ║
  // ║  - SÍ reenviar mensajes normales al lead                                ║
  // ╚════════════════════════════════════════════════════════════════════════╝
  // ═══════════════════════════════════════════════════════════
  // 1.5. BRIDGE ACTIVO - Reenviar mensaje al lead
  // ═══════════════════════════════════════════════════════════
  const activeBridge = notasVendedor?.active_bridge;
  if (activeBridge && activeBridge.expires_at && new Date(activeBridge.expires_at) > new Date()) {
    // Si es comando de bridge o cerrar, procesarlo más abajo (no reenviar)
    const esBridgeCmd = /^(?:bridge|chat\s*directo|directo)\s+/i.test(mensaje);
    const esCerrarCmd = mensaje === 'cerrar' || mensaje === 'fin' || mensaje === '#cerrar' || mensaje === '#fin' || mensaje === 'salir';
    const esExtenderCmd = mensaje === '#mas' || mensaje === '#más' || mensaje === '#continuar';

    if (esBridgeCmd || esCerrarCmd || esExtenderCmd) {
      // Continuar al handler de comandos
    } else {
      // Reenviar mensaje al lead
      console.log('🔗 BRIDGE VENDEDOR activo, reenviando mensaje a:', activeBridge.lead_name);

      const leadPhone = activeBridge.lead_phone;
      if (leadPhone) {
        // Verificar ventana de 24h del lead
        const { data: leadData } = await ctx.supabase.client
          .from('leads')
          .select('last_message_at')
          .eq('id', activeBridge.lead_id)
          .single();

        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const dentroVentana24h = leadData?.last_message_at && leadData.last_message_at > hace24h;
        console.log(`📊 Bridge 24h check: last_message_at=${leadData?.last_message_at}, dentroVentana=${dentroVentana24h}`);

        if (!dentroVentana24h) {
          // Fuera de ventana - preguntar qué hacer
          console.error(`⚠️ Bridge: Lead ${activeBridge.lead_name} fuera de ventana 24h`);

          // Formatear teléfono para mostrar
          const telLimpio = leadPhone.replace(/\D/g, '').slice(-10);

          // Guardar contexto para selección de template (atomic)
          await freshNotesUpdate(ctx, vendedor.id, n => {
            n.pending_template_selection = {
              lead_id: activeBridge.lead_id,
              lead_name: activeBridge.lead_name,
              lead_phone: leadPhone,
              mensaje_original: body,
              from_bridge: true,
              timestamp: new Date().toISOString()
            };
            n.last_sara_interaction = new Date().toISOString();
          });

          await ctx.meta.sendWhatsAppMessage(from,
            `⚠️ *${activeBridge.lead_name} no ha escrito en 24h*\n\n` +
            `WhatsApp no permite mensajes directos.\n\n` +
            `*¿Qué quieres hacer?*\n\n` +
            `*1.* 📩 Template reactivación\n` +
            `*2.* 📩 Template seguimiento\n` +
            `*3.* 📩 Template info crédito\n` +
            `*4.* 📞 Contactar directo (te doy su cel)\n` +
            `*5.* ❌ Cancelar\n\n` +
            `_Responde con el número_`
          );
          return;
        }

        const msgFormateado = `💬 *${nombreVendedor}:*\n${body}`;
        await ctx.meta.sendWhatsAppMessage(leadPhone, msgFormateado);

        // ═══ SLA: Vendor responded to lead via bridge ═══
        if (activeBridge.lead_id && ctx.env?.SARA_CACHE) {
          try {
            const sla = createSLAMonitoring(ctx.env.SARA_CACHE);
            await sla.trackVendorResponse(activeBridge.lead_id, vendedor.id);
          } catch (slaErr) { console.error('⚠️ SLA bridge track error (non-blocking):', slaErr); }
        }

        // Actualizar last_activity (atomic — avoid stale overwrite from CRONs)
        await freshNotesUpdate(ctx, vendedor.id, n => {
          if (n.active_bridge) {
            n.active_bridge.last_activity = new Date().toISOString();
          }
        });

        // Registrar actividad
        if (activeBridge.lead_id) {
          await ctx.supabase.client.from('lead_activities').insert({
            lead_id: activeBridge.lead_id,
            team_member_id: vendedor.id,
            activity_type: 'whatsapp',
            notes: `Bridge: ${nombreVendedor} → ${activeBridge.lead_name}`,
            created_at: new Date().toISOString()
          });
        }

        // Confirmar al vendedor (mensaje corto)
        await ctx.meta.sendWhatsAppMessage(from, `✓ Enviado a ${activeBridge.lead_name}`);
        return;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2. INTERCEPCIÓN TEMPRANA DE COMANDOS CRÍTICOS
  // ═══════════════════════════════════════════════════════════

  // CERRAR BRIDGE - Vendedor termina chat directo
  if (mensaje === 'cerrar' || mensaje === 'fin' || mensaje === '#cerrar' || mensaje === '#fin' || mensaje === 'salir') {
    await vendedorCerrarBridge(ctx, handler, from, vendedor, nombreVendedor);
    return;
  }

  const earlyCmd = vendorService.detectEarlyCommand(mensaje, body);
  if (earlyCmd) {
    switch (earlyCmd.command) {
      case 'reagendar':
        await vendedorReagendarCita(ctx, handler, from, body, vendedor, nombreVendedor);
        return;
      case 'cancelar_cita':
        await vendedorCancelarCita(ctx, handler, from, body, vendedor, nombreVendedor);
        return;
      case 'crear_lead':
        await vendedorCrearLead(ctx, handler, from, body, vendedor, nombreVendedor);
        return;
      case 'asignar_hipoteca':
        await vendedorAsignarHipoteca(ctx, handler, from, body, vendedor, nombreVendedor, teamMembers);
        return;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3. SELECCIÓN PENDIENTE DE REAGENDAR (respuestas "1", "2", etc.)
  // ═══════════════════════════════════════════════════════════
  if (/^[1-9]$/.test(mensaje.trim()) && notasVendedor?.pending_reagendar_selection) {
    const selection = notasVendedor.pending_reagendar_selection;
    console.log('📅 PENDING REAGENDAR SELECTION:', JSON.stringify(selection));
    const idx = parseInt(mensaje.trim()) - 1;

    if (idx >= 0 && idx < selection.leads.length) {
      const selectedLead = selection.leads[idx];
      console.log('📅 Lead seleccionado para reagendar:', selectedLead?.name);
      // Limpiar la selección pendiente
      const { pending_reagendar_selection, ...restNotes } = notasVendedor;
      await ctx.supabase.client
        .from('team_members')
        .update({ notes: restNotes })
        .eq('id', vendedor.id);

      // Ejecutar reagendar con el lead seleccionado
      const schedulingService = new AppointmentSchedulingService(ctx.supabase, ctx.calendar);

      // Buscar cita activa del lead
      const { data: appointment } = await ctx.supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', selectedLead.id)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .single();

      if (!appointment) {
        await ctx.twilio.sendWhatsAppMessage(from, `⚠️ ${selectedLead.name} no tiene citas pendientes para reagendar.`);
        return;
      }

      // Parsear fecha/hora del comando original
      const originalBody = selection.original_body || '';
      const parsed = handler.parseReagendarParams(originalBody);

      if (!parsed.dia || !parsed.hora) {
        await ctx.twilio.sendWhatsAppMessage(from,
          `📅 *Reagendar cita de ${selectedLead.name}*\n\n` +
          `¿Para cuándo la movemos?\n\n` +
          `*Escribe:*\n` +
          `reagendar ${selectedLead.name} [día] [hora]\n\n` +
          `*Ejemplo:*\n` +
          `reagendar ${selectedLead.name} mañana 4pm`
        );
        return;
      }

      // Ejecutar reagendar con el lead ya seleccionado
      console.log('📅 Llamando reagendarCitaConSeleccion con:', selectedLead.name, parsed.dia, parsed.hora, parsed.minutos, parsed.ampm);
      const result = await schedulingService.reagendarCitaConSeleccion(
        selectedLead,
        parsed.dia,
        parsed.hora,
        parsed.ampm || 'pm',
        vendedor,
        parsed.minutos
      );
      console.log('📅 Resultado reagendarCitaConSeleccion:', JSON.stringify(result));

      if (result.success) {
        await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatReagendarCitaExito(result));

        // Guardar estado para notificación al lead (si tiene teléfono)
        if (selectedLead.phone) {
          const notesToSave = sanitizeNotes(restNotes);
          notesToSave.pending_reagendar_notify = {
            lead_id: selectedLead.id,
            lead_name: selectedLead.name,
            lead_phone: selectedLead.phone,
            fecha: result.nuevaFecha,
            hora: result.nuevaHora,
            timestamp: Date.now()
          };
          await ctx.supabase.client
            .from('team_members')
            .update({ notes: notesToSave })
            .eq('id', vendedor.id);
        }
      } else {
        await ctx.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error || 'Error al reagendar'}`);
      }
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3.5. SELECCIÓN PENDIENTE DE CANCELAR CITA
  // ═══════════════════════════════════════════════════════════
  if (/^[1-9]$/.test(mensaje.trim()) && notasVendedor?.pending_cita_action) {
    const pendingAction = notasVendedor.pending_cita_action;
    const idx = parseInt(mensaje.trim()) - 1;

    if (idx >= 0 && idx < pendingAction.leads.length) {
      const selectedLead = pendingAction.leads[idx];
      // Limpiar pending_cita_action
      const { pending_cita_action, ...restNotes } = notasVendedor;
      await ctx.supabase.client
        .from('team_members')
        .update({ notes: restNotes })
        .eq('id', vendedor.id);

      if (pendingAction.action === 'cancelar') {
        // Cancelar cita del lead seleccionado
        const schedulingService = new AppointmentSchedulingService(ctx.supabase, ctx.calendar);
        const result = await schedulingService.cancelarCitaPorId(selectedLead.id, selectedLead.name, vendedor);

        if (result.success) {
          await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatCancelarCitaExito(result));

          // Preguntar si desea notificar al lead (si tiene teléfono)
          if (result.leadPhone) {
            const notesToUpdate = restNotes || {};
            notesToUpdate.pending_cancelar_notify = {
              lead_id: result.leadId,
              lead_name: result.leadName,
              lead_phone: result.leadPhone,
              fecha: result.fechaStr,
              hora: result.horaStr,
              timestamp: Date.now()
            };
            await ctx.supabase.client
              .from('team_members')
              .update({ notes: notesToUpdate })
              .eq('id', vendedor.id);

            await ctx.twilio.sendWhatsAppMessage(from,
              `📱 *¿Deseas notificar a ${result.leadName} de la cancelación?*\n\n` +
              `1️⃣ Sí, enviar mensaje\n` +
              `2️⃣ No, yo le aviso`
            );
          }
        } else {
          await ctx.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error || 'Error al cancelar'}`);
        }
      }
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3.6. SELECCIÓN PENDIENTE DE AGENDAR CITA
  // ═══════════════════════════════════════════════════════════
  if (/^[1-9]$/.test(mensaje.trim()) && notasVendedor?.pending_agendar_cita) {
    const pendingAgendar = notasVendedor.pending_agendar_cita;
    console.log('📅 PENDING AGENDAR:', JSON.stringify(pendingAgendar));
    const idx = parseInt(mensaje.trim()) - 1;

    if (idx >= 0 && idx < pendingAgendar.leads.length) {
      const selectedLead = pendingAgendar.leads[idx];
      console.log('📅 Lead seleccionado:', selectedLead?.name, 'dia:', pendingAgendar.dia, 'hora:', pendingAgendar.hora, 'minutos:', pendingAgendar.minutos, 'ampm:', pendingAgendar.ampm);
      // Limpiar pending_agendar_cita
      const { pending_agendar_cita, ...restNotes } = notasVendedor;
      await ctx.supabase.client
        .from('team_members')
        .update({ notes: restNotes })
        .eq('id', vendedor.id);

      // Crear cita con el lead seleccionado
      const schedulingService = new AppointmentSchedulingService(ctx.supabase, ctx.calendar);

      if (!pendingAgendar.dia || !pendingAgendar.hora) {
        // Si no hay día/hora, pedir que complete
        await ctx.twilio.sendWhatsAppMessage(from,
          `✅ Seleccionaste a *${selectedLead.name}*\n\n` +
          `¿Cuándo quieres agendar la cita?\n\n` +
          `Escribe: *agendar ${selectedLead.name} mañana 4pm*`
        );
        return;
      }

      const result = await schedulingService.agendarCitaConSeleccion(
        selectedLead,
        pendingAgendar.dia,
        pendingAgendar.hora,
        pendingAgendar.ampm || 'pm',
        vendedor,
        pendingAgendar.minutos,
        pendingAgendar.desarrollo
      );

      if (result.success) {
        await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatAgendarCitaExito(result));

        // Guardar estado para notificación al lead (si tiene teléfono)
        console.log('📱 DEBUG: selectedLead.phone =', selectedLead.phone);
        if (selectedLead.phone) {
          const notesToSave = sanitizeNotes(restNotes);
          notesToSave.pending_agendar_notify = {
            lead_id: selectedLead.id,
            lead_name: selectedLead.name,
            lead_phone: selectedLead.phone,
            fecha: result.fecha,
            hora: result.hora,
            ubicacion: result.ubicacion,
            gpsLink: result.gpsLink,
            timestamp: Date.now()
          };
          console.log('📱 DEBUG: Guardando pending_agendar_notify:', JSON.stringify(notesToSave));
          const { error } = await ctx.supabase.client
            .from('team_members')
            .update({ notes: notesToSave })
            .eq('id', vendedor.id);
          if (error) console.log('📱 DEBUG: Error guardando notes:', error);
          else console.log('📱 DEBUG: Notes guardadas OK');
        } else {
          console.log('📱 DEBUG: Lead sin teléfono, no se guarda pending_agendar_notify');
        }
      } else {
        await ctx.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error || 'Error al agendar'}`);
      }
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3.7. RESPUESTA A NOTIFICACIÓN DE AGENDAR
  // ═══════════════════════════════════════════════════════════
  if (/^[12]$/.test(mensaje.trim()) && notasVendedor?.pending_agendar_notify) {
    const pendingNotify = notasVendedor.pending_agendar_notify;
    console.log('📱 PENDING AGENDAR NOTIFY:', JSON.stringify(pendingNotify));

    // Limpiar pending_agendar_notify
    const { pending_agendar_notify, ...restNotesAgendar } = notasVendedor;
    const cleanNotes = sanitizeNotes(restNotesAgendar);
    await ctx.supabase.client
      .from('team_members')
      .update({ notes: cleanNotes })
      .eq('id', vendedor.id);

    if (mensaje.trim() === '1') {
      // Enviar notificación al lead (con fallback a template si ventana cerrada)
      const leadPhone = pendingNotify.lead_phone.startsWith('521')
        ? pendingNotify.lead_phone
        : `521${pendingNotify.lead_phone.replace(/\D/g, '').slice(-10)}`;

      // Formatear teléfono del vendedor para el lead
      const vendedorPhoneFormatted = vendedor.phone ? formatPhoneForDisplay(vendedor.phone) : '';

      let mensajeLead = `¡Hola ${pendingNotify.lead_name.split(' ')[0]}! 👋\n\n` +
        `Te confirmamos tu cita:\n` +
        `📅 ${pendingNotify.fecha}\n` +
        `🕐 ${pendingNotify.hora}`;

      if (pendingNotify.ubicacion && pendingNotify.ubicacion !== 'Por confirmar') {
        mensajeLead += `\n📍 ${pendingNotify.ubicacion}`;
      }
      if (pendingNotify.gpsLink) {
        mensajeLead += `\n🗺️ ${pendingNotify.gpsLink}`;
      }

      mensajeLead += `\n\n👤 Te atenderá: *${nombreVendedor}*`;
      if (vendedorPhoneFormatted) {
        mensajeLead += `\n📱 ${vendedorPhoneFormatted}`;
      }
      mensajeLead += `\n\n¡Te esperamos!`;

      const resultado = await notificarLeadCita(ctx, leadPhone, mensajeLead, pendingNotify, 'agendar');
      const metodoMsg = resultado.metodo === 'directo' ? '' : ' (via template, ventana 24h cerrada)';
      await ctx.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${pendingNotify.lead_name}*${metodoMsg}`);

      // Registrar actividad
      await ctx.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: pendingNotify.lead_id,
          type: 'whatsapp',
          notes: `Lead notificado de cita por ${nombreVendedor} (${resultado.metodo})`,
          created_by: vendedor.id
        });
    } else {
      await ctx.twilio.sendWhatsAppMessage(from, `✅ Entendido, tú le avisarás a ${pendingNotify.lead_name}.`);
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 3.8. RESPUESTA A NOTIFICACIÓN DE CANCELACIÓN
  // ═══════════════════════════════════════════════════════════
  if (/^[12]$/.test(mensaje.trim()) && notasVendedor?.pending_cancelar_notify) {
    const pendingNotify = notasVendedor.pending_cancelar_notify;
    console.log('📱 PENDING CANCELAR NOTIFY:', JSON.stringify(pendingNotify));

    // Limpiar pending_cancelar_notify (sanitizar para evitar corrupción)
    const { pending_cancelar_notify, ...restNotesCancelar } = notasVendedor;
    const cleanNotesCancelar = sanitizeNotes(restNotesCancelar);
    await ctx.supabase.client
      .from('team_members')
      .update({ notes: cleanNotesCancelar })
      .eq('id', vendedor.id);

    if (mensaje.trim() === '1') {
      // Enviar notificación al lead (con fallback a template si ventana cerrada)
      const leadPhone = pendingNotify.lead_phone.startsWith('521')
        ? pendingNotify.lead_phone
        : `521${pendingNotify.lead_phone.replace(/\D/g, '').slice(-10)}`;

      const mensajeLead = `Hola ${pendingNotify.lead_name.split(' ')[0]}, te informamos que tu cita programada para el ${pendingNotify.fecha} a las ${pendingNotify.hora} ha sido cancelada.\n\n` +
        `Si deseas reagendar, por favor contacta a tu asesor.\n\n` +
        `Disculpa las molestias.`;

      const resultado = await notificarLeadCita(ctx, leadPhone, mensajeLead, pendingNotify, 'cancelar');
      const metodoMsg = resultado.metodo === 'directo' ? '' : ' (via template, ventana 24h cerrada)';
      await ctx.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${pendingNotify.lead_name}*${metodoMsg}`);

      // Registrar actividad
      await ctx.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: pendingNotify.lead_id,
          type: 'whatsapp',
          notes: `Lead notificado de cancelación por ${nombreVendedor} (${resultado.metodo})`,
          created_by: vendedor.id
        });
    } else {
      await ctx.twilio.sendWhatsAppMessage(from, `✅ Entendido, tú le avisarás a ${pendingNotify.lead_name}.`);
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 3.9. RESPUESTA A NOTIFICACIÓN DE REAGENDAR
  // ═══════════════════════════════════════════════════════════
  if (/^[12]$/.test(mensaje.trim()) && notasVendedor?.pending_reagendar_notify) {
    const pendingNotify = notasVendedor.pending_reagendar_notify;
    console.log('📱 PENDING REAGENDAR NOTIFY:', JSON.stringify(pendingNotify));

    // Limpiar pending_reagendar_notify
    const { pending_reagendar_notify, ...restNotesReagendar } = notasVendedor;
    const cleanNotesReagendar = sanitizeNotes(restNotesReagendar);
    await ctx.supabase.client
      .from('team_members')
      .update({ notes: cleanNotesReagendar })
      .eq('id', vendedor.id);

    if (mensaje.trim() === '1') {
      // Enviar notificación al lead (con fallback a template si ventana cerrada)
      const leadPhone = pendingNotify.lead_phone.startsWith('521')
        ? pendingNotify.lead_phone
        : `521${pendingNotify.lead_phone.replace(/\D/g, '').slice(-10)}`;

      const vendedorPhoneFormatted = vendedor.phone ? formatPhoneForDisplay(vendedor.phone) : '';

      let mensajeLead = `¡Hola ${pendingNotify.lead_name.split(' ')[0]}! 👋\n\n` +
        `Tu cita ha sido *reagendada*:\n` +
        `📅 ${pendingNotify.fecha}\n` +
        `🕐 ${pendingNotify.hora}`;

      mensajeLead += `\n\n👤 Te atenderá: *${nombreVendedor}*`;
      if (vendedorPhoneFormatted) {
        mensajeLead += `\n📱 ${vendedorPhoneFormatted}`;
      }
      mensajeLead += `\n\n¡Te esperamos!`;

      const resultado = await notificarLeadCita(ctx, leadPhone, mensajeLead, pendingNotify, 'reagendar');
      const metodoMsg = resultado.metodo === 'directo' ? '' : ' (via template, ventana 24h cerrada)';
      await ctx.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${pendingNotify.lead_name}*${metodoMsg}`);

      // Registrar actividad
      await ctx.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: pendingNotify.lead_id,
          type: 'whatsapp',
          notes: `Lead notificado de reagenda por ${nombreVendedor} (${resultado.metodo})`,
          created_by: vendedor.id
        });
    } else {
      await ctx.twilio.sendWhatsAppMessage(from, `✅ Entendido, tú le avisarás a ${pendingNotify.lead_name}.`);
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 3b. CONFIRMACIONES PENDIENTES (respuestas "1", "2", "si", "no")
  // ═══════════════════════════════════════════════════════════
  if (await handlePendingConfirmations(ctx, handler, from, mensaje, vendedor, nombreVendedor)) {
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 4. MOTIVO DE CAÍDA
  // ═══════════════════════════════════════════════════════════
  if (['1', '2', '3', '4'].includes(mensaje.trim())) {
    await vendedorMotivoRespuesta(ctx, handler, from, mensaje.trim(), vendedor);
    return;
  }

  // Motivo personalizado (después de elegir 4)
  const { data: leadPendiente } = await ctx.supabase.client
    .from('leads')
    .select('id, notes')
    .eq('assigned_to', vendedor.id)
    .eq('status', 'fallen')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  
  if (leadPendiente?.notes?.pending_custom_reason) {
    await vendedorMotivoCustom(ctx, handler, from, body, vendedor);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 5. COMANDOS COORDINADOR (solo si es coordinador o admin)
  // ═══════════════════════════════════════════════════════════
  if (vendedor.role === 'coordinador' || vendedor.role === 'admin') {
    if (await routeCoordinadorCommand(ctx, handler, from, body, mensaje, vendedor, nombreVendedor, teamMembers)) {
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 6. DETECTAR Y EJECUTAR COMANDOS VENDEDOR
  // ═══════════════════════════════════════════════════════════
  if (await routeVendorCommand(ctx, handler, from, body, mensaje, vendedor, nombreVendedor, teamMembers)) {
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 6. DEFAULT: IA PARA CLASIFICAR
  // ═══════════════════════════════════════════════════════════
  await vendedorIntentIA(ctx, handler, from, body, vendedor, nombreVendedor);
}

/**
 * Ejecuta el resultado del procesamiento de mensaje de vendedor
 */
export async function executeVendorResult(
  ctx: HandlerContext, handler: any,
  from: string,
  result: any,
  vendedor: any,
  nombreVendedor: string,
  teamMembers: any[]
): Promise<boolean> {
  if (result.action === 'continue') {
    return false;
  }

  switch (result.action) {
    case 'send_twilio':
      if (result.twilioMessage) {
        await ctx.twilio.sendWhatsAppMessage(from, result.twilioMessage);
      }
      return true;

    case 'send_meta':
      if (result.metaMessage && result.metaPhone) {
        await ctx.meta.sendWhatsAppMessage(result.metaPhone, result.metaMessage);
      }
      return true;

    case 'send_both':
      if (result.twilioMessage) {
        await ctx.twilio.sendWhatsAppMessage(from, result.twilioMessage);
      }
      if (result.metaMessage && result.metaPhone) {
        await ctx.meta.sendWhatsAppMessage(result.metaPhone, result.metaMessage);
      }
      return true;

    case 'call_handler':
      return await executeSubHandler(ctx, handler, from, result, vendedor, nombreVendedor, teamMembers);

    case 'handled':
      return true;

    case 'use_ai':
      return false; // Continue to AI fallback
  }

  return false;
}

/**
 * Ejecuta sub-handlers específicos
 */
export async function executeSubHandler(
  ctx: HandlerContext, handler: any,
  from: string,
  result: any,
  vendedor: any,
  nombreVendedor: string,
  teamMembers: any[]
): Promise<boolean> {
  const params = result.handlerParams || {};

  switch (result.handlerName) {
    case 'enviarMensajePendienteLead':
      await enviarMensajePendienteLead(ctx, handler, from, params.body || '', vendedor, params.pendingData);
      return true;

    case 'asignarHipotecaALead':
      await asignarHipotecaALead(ctx, handler, from, params.leadSeleccionado, vendedor, teamMembers);
      return true;

    case 'processShowConfirmationResult':
      await processShowConfirmationResult(ctx, handler, from, params.showResult, params.confirmacion);
      return true;

    case 'forwardBridgeMessage':
      await ctx.meta.sendWhatsAppMessage(params.leadPhone, params.mensaje);
      const vendorService: any = new VendorCommandsService(ctx.supabase);
      await ctx.meta.sendWhatsAppMessage(params.vendedorFrom, vendorService.formatBridgeConfirmation(params.leadName));
      // Detectar intención de cita
      const intencion = handler.detectarIntencionCita(params.mensaje);
      if (intencion.detectado && intencion.fecha && intencion.hora) {
        const { notes } = await vendorService.getVendedorNotes(vendedor.id);
        if (notes?.active_bridge) {
          await vendorService.savePendingBridgeAppointment(vendedor.id, notes, intencion);
          setTimeout(async () => {
            await ctx.meta.sendWhatsAppMessage(params.vendedorFrom,
              vendorService.formatBridgeAppointmentSuggestion(intencion.tipo, notes.active_bridge.lead_name, intencion.fecha!, intencion.hora!)
            );
          }, 1000);
        }
      }
      return true;
  }

  return false;
}

/**
 * Maneja confirmaciones pendientes (reagendar, citas)
 */
export async function handlePendingConfirmations(ctx: HandlerContext, handler: any, from: string, mensaje: string, vendedor: any, nombreVendedor: string): Promise<boolean> {
  // ═══════════════════════════════════════════════════════════
  // PRIMERO: Verificar pending_show_confirmation (pregunta ¿LLEGÓ?)
  // ═══════════════════════════════════════════════════════════
  const showConfirmResult = await procesarRespuestaShowConfirmation(ctx, handler, vendedor.id, mensaje);
  if (showConfirmResult.handled) {
    await ctx.meta.sendWhatsAppMessage(from, showConfirmResult.mensajeVendedor!);

    // Si el lead SÍ llegó, enviar encuesta de satisfacción
    if (showConfirmResult.siLlego && showConfirmResult.leadPhone) {
      await enviarEncuestaSatisfaccion(ctx, handler, showConfirmResult.leadPhone, showConfirmResult.leadName, showConfirmResult.property);
    }

    // Si NO llegó, ofrecer reagendar y guardar contexto para seguimiento
    console.log(`👻 NO-SHOW DEBUG: noLlego=${showConfirmResult.noLlego}, leadPhone=${showConfirmResult.leadPhone}, leadName=${showConfirmResult.leadName}`);
    if (showConfirmResult.noLlego && showConfirmResult.leadPhone) {
      const nombreCliente = showConfirmResult.leadName?.split(' ')[0] || 'Hola';
      console.log(`📅 Enviando mensaje de reagenda a ${showConfirmResult.leadPhone}...`);
      try {
        // Enviar mensaje al lead
        await ctx.meta.sendWhatsAppMessage(showConfirmResult.leadPhone,
          `Hola ${nombreCliente}, notamos que no pudiste asistir a tu cita. 😊\n\n` +
          `¿Te gustaría reagendar para otro día?\n` +
          `Escríbenos cuando gustes y con gusto te ayudamos.`
        );
        console.log(`✅ Mensaje de reagenda enviado exitosamente a ${showConfirmResult.leadName} (${showConfirmResult.leadPhone})`);

        // Guardar contexto en el lead para seguimiento de respuesta
        const phoneSuffix = showConfirmResult.leadPhone.replace(/\D/g, '').slice(-10);
        const { data: leadData } = await ctx.supabase.client
          .from('leads')
          .select('id, notes, assigned_to')
          .or(`phone.ilike.%${phoneSuffix},whatsapp_phone.ilike.%${phoneSuffix}`)
          .single();

        if (leadData) {
          const notasLead = typeof leadData.notes === 'object' ? leadData.notes : {};
          await ctx.supabase.client
            .from('leads')
            .update({
              status: 'no_show',
              notes: {
                ...notasLead,
                pending_noshow_response: {
                  vendedor_id: vendedor.id,
                  vendedor_name: nombreVendedor,
                  vendedor_phone: from,
                  property: showConfirmResult.property,
                  asked_at: new Date().toISOString()
                }
              }
            })
            .eq('id', leadData.id);
          console.log(`📋 Contexto no-show guardado en lead ${leadData.id}`);
        }
      } catch (err) {
        console.error('❌ Error enviando mensaje reagenda:', err);
      }
    } else {
      console.error(`⚠️ NO se envió mensaje de reagenda: noLlego=${showConfirmResult.noLlego}, leadPhone=${showConfirmResult.leadPhone || 'NULL'}`);
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════
  // SEGUNDO: Otras confirmaciones pendientes
  // ═══════════════════════════════════════════════════════════
  // Respuestas afirmativas
  if (mensaje === '1' || mensaje === 'si' || mensaje === 'sí' || mensaje.includes('si manda') || mensaje.includes('sí manda')) {
    if (await hayReagendarPendiente(ctx, handler, vendedor.id)) {
      await enviarNotificacionReagendar(ctx, handler, from, vendedor);
      return true;
    }
    if (await hayConfirmacionPendiente(ctx, handler, vendedor.id)) {
      await enviarConfirmacionAlLead(ctx, handler, from, vendedor, nombreVendedor);
      return true;
    }
  }

  // Respuestas negativas
  if (mensaje === '2' || mensaje === 'no' || mensaje.includes('yo le aviso')) {
    if (await hayReagendarPendiente(ctx, handler, vendedor.id)) {
      await cancelarNotificacionReagendar(ctx, handler, from, vendedor);
      return true;
    }
    if (await hayConfirmacionPendiente(ctx, handler, vendedor.id)) {
      await cancelarConfirmacionPendiente(ctx, handler, from, vendedor, nombreVendedor);
      return true;
    }
  }

  return false;
}

/**
 * Procesa respuesta a la pregunta "¿LLEGÓ [LEAD]?"
 */
export async function procesarRespuestaShowConfirmation(ctx: HandlerContext, handler: any, vendedorId: string, mensaje: string): Promise< {
  handled: boolean;
  mensajeVendedor?: string;
  siLlego?: boolean;
  noLlego?: boolean;
  leadPhone?: string;
  leadName?: string;
  property?: string;
}> {
  // Obtener notas del vendedor
  const { data: vendedor } = await ctx.supabase.client
    .from('team_members')
    .select('notes, name')
    .eq('id', vendedorId)
    .single();

  if (!vendedor) return { handled: false };

  let notes: any = {};
  try {
    if (vendedor.notes) {
      notes = typeof vendedor.notes === 'string' ? JSON.parse(vendedor.notes) : vendedor.notes;
    }
  } catch (e) {
    return { handled: false };
  }

  const confirmacion = notes?.pending_show_confirmation;
  if (!confirmacion) return { handled: false };

  const msg = mensaje.toLowerCase().trim();

  // Verificar si es respuesta "1" (sí llegó) o "2" (no llegó)
  // Normalizar acentos para comparación
  const msgNorm = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar acentos
  const siLlego = msg === '1' || msg === 'si' || msg === 'sí' ||
                  msg.startsWith('si ') || msg.startsWith('sí ') ||
                  msgNorm.includes('si llego') || msg.includes('llegó') || msg.includes('llego');
  const noLlego = msg === '2' || msg === 'no' ||
                  msgNorm.includes('no llego') || msg.includes('no llegó') || msg.includes('no llego') ||
                  msg.includes('no vino') || msg.includes('no asistio') || msg.includes('faltó');

  if (!siLlego && !noLlego) return { handled: false };

  const leadName = confirmacion.lead_name || 'el cliente';
  const property = confirmacion.property || 'la propiedad';

  if (siLlego) {
    // Marcar cita como completada
    if (confirmacion.appointment_id) {
      await ctx.supabase.client
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', confirmacion.appointment_id);
    }

    // Limpiar pending_show_confirmation
    delete notes.pending_show_confirmation;
    await ctx.supabase.client
      .from('team_members')
      .update({ notes: JSON.stringify(notes) })
      .eq('id', vendedorId);

    console.log(`✅ Cita ${confirmacion.appointment_id} marcada como completed por ${vendedor.name}`);

    return {
      handled: true,
      mensajeVendedor: `✅ Perfecto, registré que *${leadName}* SÍ llegó a su cita.\n\nLe enviaré una encuesta de satisfacción. ¡Gracias!`,
      siLlego: true,
      leadPhone: confirmacion.lead_phone,
      leadName: confirmacion.lead_name,
      property
    };
  }

  if (noLlego) {
    // Marcar cita como no_show
    if (confirmacion.appointment_id) {
      await ctx.supabase.client
        .from('appointments')
        .update({ status: 'no_show' })
        .eq('id', confirmacion.appointment_id);
    }

    // Limpiar pending_show_confirmation
    delete notes.pending_show_confirmation;
    await ctx.supabase.client
      .from('team_members')
      .update({ notes: JSON.stringify(notes) })
      .eq('id', vendedorId);

    console.log(`👻 Cita ${confirmacion.appointment_id} marcada como no_show por ${vendedor.name}`);

    return {
      handled: true,
      mensajeVendedor: `👻 Registré que *${leadName}* NO llegó a su cita.\n\nLe enviaré un mensaje para ofrecerle reagendar.`,
      noLlego: true,
      leadPhone: confirmacion.lead_phone,
      leadName: confirmacion.lead_name,
      property
    };
  }

  return { handled: false };
}

/**
 * Envía encuesta de satisfacción al lead y guarda el estado pendiente
 */
export async function enviarEncuestaSatisfaccion(ctx: HandlerContext, handler: any, leadPhone: string, leadName?: string, property?: string): Promise<void> {
  const nombreCliente = leadName?.split(' ')[0] || 'Cliente';
  const propiedad = property || 'la propiedad';

  try {
    // Guardar en lead.notes que está esperando respuesta de encuesta
    const cleanLeadPhone = leadPhone.replace(/\D/g, '');
    const { data: leadData } = await ctx.supabase.client
      .from('leads')
      .select('id, notes')
      .or(`phone.eq.${cleanLeadPhone},phone.like.%${cleanLeadPhone.slice(-10)}`)
      .single();

    if (leadData) {
      let notasLead: any = {};
      try {
        notasLead = typeof leadData.notes === 'object' && leadData.notes ? leadData.notes : {};
      } catch (e) { notasLead = {}; }

      notasLead.pending_satisfaction_survey = {
        property: propiedad,
        asked_at: new Date().toISOString()
      };

      await ctx.supabase.client
        .from('leads')
        .update({ notes: notasLead })
        .eq('id', leadData.id);

      console.log(`📝 Guardado pending_satisfaction_survey para lead ${leadData.id}`);
    }

    await ctx.meta.sendWhatsAppMessage(leadPhone,
      `¡Hola ${nombreCliente}! 👋\n\n` +
      `Gracias por visitarnos en *${propiedad}*. 🏠\n\n` +
      `¿Cómo fue tu experiencia?\n` +
      `1️⃣ Excelente\n` +
      `2️⃣ Buena\n` +
      `3️⃣ Regular\n` +
      `4️⃣ Mala\n\n` +
      `_Responde con el número_ 🙏`
    );
    console.log(`📋 Encuesta post-visita enviada a ${leadName}`);
  } catch (err) {
    console.error('Error enviando encuesta post-visita:', err);
  }
}

/**
 * Busca un lead que tenga pending_noshow_response (esperando respuesta a mensaje de reagendar)
 */
export async function buscarLeadConNoShowPendiente(ctx: HandlerContext, handler: any, phone: string): Promise<any | null> {
  try {
    const phoneSuffix = phone.replace(/\D/g, '').slice(-10);

    const { data: leads } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to')
      .or(`phone.ilike.%${phoneSuffix},whatsapp_phone.ilike.%${phoneSuffix}`);

    if (!leads || leads.length === 0) return null;

    // Buscar el que tenga pending_noshow_response
    for (const lead of leads) {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      if (notas.pending_noshow_response) {
        console.log(`📋 Encontrado lead con no-show pendiente: ${lead.name}`);
        return lead;
      }
    }

    return null;
  } catch (err) {
    console.error('Error buscando lead con no-show pendiente:', err);
    return null;
  }
}

/**
 * Procesa el resultado de confirmación de asistencia
 */
export async function processShowConfirmationResult(ctx: HandlerContext, handler: any, from: string, showResult: any, confirmacion: any): Promise<void> {
  await ctx.meta.sendWhatsAppMessage(from, showResult.mensajeVendedor);

  if (showResult.tipo === 'si_llego' && showResult.needsClientSurvey && showResult.leadPhone && showResult.leadId) {
    const nombreCliente = showResult.leadName?.split(' ')[0] || '';
    const propiedad = showResult.property || 'la propiedad';
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    try {
      const templateComponents = [{
        type: 'body',
        parameters: [
          { type: 'text', text: nombreCliente },
          { type: 'text', text: propiedad }
        ]
      }];
      await ctx.meta.sendTemplate(showResult.leadPhone, 'encuesta_post_visita', 'es_MX', templateComponents);
    } catch (templateErr) {
      await ctx.meta.sendWhatsAppMessage(showResult.leadPhone,
        `¡Hola ${nombreCliente}! 👋\n\nGracias por visitarnos en *${propiedad}*. 🏠\n\n¿Qué te pareció? Responde:\n1️⃣ Me encantó\n2️⃣ Quiero ver más opciones\n3️⃣ Tengo dudas`
      );
    }
    await vendorService.saveClientSurveyPending(showResult.leadId, propiedad, showResult.vendedorId!, showResult.vendedorName!);
  }

  if (showResult.tipo === 'no_llego' && showResult.needsReagendarMessage && showResult.leadPhone) {
    const nombreCliente = showResult.leadName?.split(' ')[0] || 'Hola';
    const propiedad = showResult.property || 'la propiedad';
    try {
      const templateComponents = [{
        type: 'body',
        parameters: [
          { type: 'text', text: nombreCliente },
          { type: 'text', text: propiedad }
        ]
      }];
      await ctx.meta.sendTemplate(showResult.leadPhone, 'reagendar_noshow', 'es_MX', templateComponents);
    } catch (templateErr) {
      await ctx.meta.sendWhatsAppMessage(showResult.leadPhone,
        `👋 Hola ${nombreCliente},\n\nNotamos que no pudiste llegar a tu cita en *${propiedad}*.\n\n¡No te preocupes! 😊 ¿Te gustaría reagendar?`
      );
    }
  }
}

/**
 * Rutea comandos específicos de coordinador
 */
export async function routeCoordinadorCommand(ctx: HandlerContext, handler: any, 
  from: string,
  body: string,
  mensaje: string,
  vendedor: any,
  nombreVendedor: string,
  teamMembers: any[]
): Promise<boolean> {
  const vendorService: any = new VendorCommandsService(ctx.supabase);
  const result = vendorService.detectCoordinadorCommand(mensaje, body);

  if (!result.matched) {
    return false;
  }

  console.log('📋 COORDINADOR Command:', result.command);

  try {
    switch (result.command) {
      case 'guardia': {
        const data = await vendorService.getGuardiaHoy();
        await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatGuardiaHoy(data));
        return true;
      }

      case 'disponibilidad': {
        const data = await vendorService.getDisponibilidadEquipo();
        await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatDisponibilidadEquipo(data));
        return true;
      }

      case 'sin_asignar': {
        const data = await vendorService.getLeadsSinAsignar();
        await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatLeadsSinAsignar(data));
        return true;
      }

      case 'citas_equipo': {
        const data = await vendorService.getCitasEquipoHoy();
        await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatCitasHoy(data, 'Equipo', true));
        return true;
      }

      case 'equipo_hoy': {
        const data = await vendorService.getEquipoHoy();
        await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatEquipoHoy(data));
        return true;
      }

      case 'asignar':
      case 'reasignar': {
        const { nombreLead, nombreVendedor: targetVendedor } = result.params;
        const asignacion = await vendorService.asignarLeadAVendedor(nombreLead, targetVendedor);
        if (asignacion.success) {
          await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatAsignacionExitosa(asignacion.lead, asignacion.vendedor));
        } else {
          await ctx.twilio.sendWhatsAppMessage(from, `❌ ${asignacion.error}`);
        }
        return true;
      }

      case 'agendar_con': {
        const { nombreLead, nombreVendedor: targetVendedor, fecha } = result.params;
        const cita = await vendorService.agendarCitaConVendedor(nombreLead, targetVendedor, fecha);
        if (cita.success) {
          await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatCitaAgendadaConVendedor(cita.lead, cita.vendedor, fecha));
        } else {
          await ctx.twilio.sendWhatsAppMessage(from, `❌ ${cita.error}`);
        }
        return true;
      }

      case 'nuevo': {
        const { nombre, telefono } = result.params;
        const crear = await vendorService.crearLeadCoordinador(nombre, telefono);
        if (crear.success) {
          await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreado(crear.lead));
        } else {
          await ctx.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
        }
        return true;
      }

      case 'nuevo_para': {
        const { nombre, telefono, nombreVendedor: targetVendedor } = result.params;
        const crear = await vendorService.crearYAsignarLead(nombre, telefono, targetVendedor);
        if (crear.success) {
          await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreadoYAsignado(crear.lead, crear.vendedor));
          // Notificar al vendedor
          if (crear.vendedor?.phone) {
            const vendedorPhone = crear.vendedor.phone.replace(/[^0-9]/g, '');
            const notif = `🆕 *NUEVO LEAD ASIGNADO*\n\n👤 *${crear.lead.name}*\n📱 ${formatPhoneForDisplay(crear.lead.phone)}\n\n¡Contáctalo pronto!`;
            await ctx.meta.sendWhatsAppMessage(vendedorPhone, notif);
          }
        } else {
          await ctx.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
        }
        return true;
      }

      case 'nuevo_completo': {
        const { nombre, telefono, desarrollo, nombreVendedor: targetVendedor } = result.params;
        const crear = await vendorService.crearYAsignarLead(nombre, telefono, targetVendedor, desarrollo);
        if (crear.success) {
          await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreadoYAsignado(crear.lead, crear.vendedor));
          // Notificar al vendedor con el desarrollo de interés
          if (crear.vendedor?.phone) {
            const vendedorPhone = crear.vendedor.phone.replace(/[^0-9]/g, '');
            const notif = `🆕 *NUEVO LEAD ASIGNADO*\n\n👤 *${crear.lead.name}*\n📱 ${formatPhoneForDisplay(crear.lead.phone)}\n🏠 Interés: *${desarrollo}*\n\n¡Contáctalo pronto!`;
            await ctx.meta.sendWhatsAppMessage(vendedorPhone, notif);
          }
        } else {
          await ctx.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
        }
        return true;
      }

      case 'nuevo_interes': {
        const { nombre, telefono, desarrollo } = result.params;
        const crear = await vendorService.crearLeadConInteres(nombre, telefono, desarrollo);
        if (crear.success) {
          await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreadoConInteres(crear.lead));
        } else {
          await ctx.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
        }
        return true;
      }

      default:
        return false;
    }
  } catch (error) {
    console.error('❌ Error en comando coordinador:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al procesar comando. Intenta de nuevo.');
    return true;
  }
}

/**
 * Rutea comandos de vendedor a los handlers apropiados
 */
export async function routeVendorCommand(ctx: HandlerContext, handler: any, 
  from: string,
  body: string,
  mensaje: string,
  vendedor: any,
  nombreVendedor: string,
  teamMembers: any[]
): Promise<boolean> {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🆕 APROBAR SUGERENCIA: Si vendedor responde "ok" a una alerta
  // NOTA: Usamos maybeSingle() en vez de single() porque puede haber 0 o múltiples leads
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const mensajeLimpio = body.trim().toLowerCase();
  if (['ok', 'si', 'sí', 'enviar', 'dale', 'va'].includes(mensajeLimpio)) {
    // Buscar si hay un lead con sugerencia pendiente para este vendedor
    const { data: leadsConSugerencia } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .eq('notes->>alerta_vendedor_id', vendedor.id)
      .not('notes->>sugerencia_pendiente', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(10); // Traer todos para limpiarlos después

    const leadConSugerencia = leadsConSugerencia?.[0]; // Solo procesar el primero

    if (leadConSugerencia?.notes?.sugerencia_pendiente) {
      const sugerencia = leadConSugerencia.notes.sugerencia_pendiente;
      const notasActuales = leadConSugerencia.notes || {};

      // Enviar el mensaje sugerido al lead
      await ctx.meta.sendWhatsAppMessage(leadConSugerencia.phone, sugerencia);

      // Limpiar la sugerencia pendiente de ESTE lead
      delete notasActuales.sugerencia_pendiente;
      delete notasActuales.alerta_vendedor_id;
      await ctx.supabase.client.from('leads')
        .update({ notes: notasActuales })
        .eq('id', leadConSugerencia.id);

      // ═══ CRÍTICO: Limpiar TODOS los demás leads con alerta del mismo vendedor ═══
      // Esto evita que si Meta envía duplicados, se envíe a múltiples leads
      if (leadsConSugerencia && leadsConSugerencia.length > 1) {
        for (const otroLead of leadsConSugerencia.slice(1)) {
          if (otroLead.notes) {
            const otrasNotas = { ...otroLead.notes };
            delete otrasNotas.sugerencia_pendiente;
            delete otrasNotas.alerta_vendedor_id;
            await ctx.supabase.client.from('leads')
              .update({ notes: otrasNotas })
              .eq('id', otroLead.id);
          }
        }
        console.log(`🧹 Limpiados ${leadsConSugerencia.length - 1} leads adicionales con alerta pendiente`);
      }

      // Registrar actividad del vendedor
      await ctx.supabase.client.from('lead_activities').insert({
        lead_id: leadConSugerencia.id,
        team_member_id: vendedor.id,
        activity_type: 'message_sent',
        description: `Mensaje de seguimiento enviado (sugerencia aprobada)`,
        metadata: { mensaje: sugerencia.substring(0, 100) }
      });

      // Confirmar al vendedor
      const nombreLead = leadConSugerencia.name || 'lead';
      await ctx.twilio.sendWhatsAppMessage(from,
        `✅ *Mensaje enviado a ${nombreLead}*\n\n` +
        `"${sugerencia.substring(0, 80)}..."\n\n` +
        `💡 Usa *bridge ${nombreLead.split(' ')[0]}* si responde y quieres continuar la conversación.`
      );

      console.log(`✅ Vendedor ${nombreVendedor} aprobó sugerencia para lead ${leadConSugerencia.phone}`);
      return true;
    }
  }

  // Si el vendedor escribe un mensaje personalizado (no es comando conocido),
  // verificar si hay sugerencia pendiente y usarlo como mensaje
  // NOTA: Usamos limit(10) para traer todos y limpiarlos, evitando envíos duplicados
  const { data: leadsPendientes } = await ctx.supabase.client
    .from('leads')
    .select('id, name, phone, notes')
    .eq('notes->>alerta_vendedor_id', vendedor.id)
    .not('notes->>sugerencia_pendiente', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(10);

  const leadPendiente = leadsPendientes?.[0]; // Solo procesar el primero

  const vendorService: any = new VendorCommandsService(ctx.supabase);
  const result = vendorService.detectRouteCommand(body, mensaje);

  // ═══ DEFENSIVE: Keyword whitelist para evitar que comandos sean forwarded como mensajes ═══
  const COMMAND_KEYWORDS = [
    'notas', 'nota', 'llamar', 'quien', 'quién', 'citas', 'cita', 'mis', 'hoy',
    'briefing', 'hot', 'pendientes', 'meta', 'ayuda', 'help', 'bridge',
    'brochure', 'ubicacion', 'ubicación', 'video', 'credito', 'crédito',
    'agendar', 'reagendar', 'cancelar', 'contactar', 'pausar', 'reanudar',
    'coaching', 'coach', 'ver', 'historial', 'cotizar', 'ofertas', 'oferta',
    'enviar', 'cerrar', 'apartado', 'aparto', 'nuevo', 'ok', 'perdido',
    'recordar', 'programar', 'propiedades', 'inventario', 'asignar',
    'adelante', 'atras', 'atrás', '#cerrar', '#mas', '#más', 'apunte',
    'registrar', 'referido', 'cumple', 'email', 'correo',
    'humano', 'bot', 'entregado', 'delivery', 'entregas'
  ];
  const firstWord = mensaje.split(/\s+/)[0];
  const looksLikeCommand = COMMAND_KEYWORDS.includes(firstWord);

  // Si hay sugerencia pendiente y el mensaje NO es un comando conocido,
  // tratarlo como mensaje personalizado para enviar al lead
  if (leadPendiente?.notes?.sugerencia_pendiente && !result.matched && !looksLikeCommand) {
    const notasActuales = leadPendiente.notes || {};

    // Enviar el mensaje personalizado del vendedor al lead
    await ctx.meta.sendWhatsAppMessage(leadPendiente.phone, body);

    // ═══ SLA: Vendor responded to lead via sugerencia pendiente ═══
    if (leadPendiente.id && ctx.env?.SARA_CACHE) {
      try {
        const sla = createSLAMonitoring(ctx.env.SARA_CACHE);
        await sla.trackVendorResponse(leadPendiente.id, vendedor.id);
      } catch (slaErr) { console.error('⚠️ SLA sugerencia track error (non-blocking):', slaErr); }
    }

    // Limpiar la sugerencia pendiente de ESTE lead
    delete notasActuales.sugerencia_pendiente;
    delete notasActuales.alerta_vendedor_id;
    await ctx.supabase.client.from('leads')
      .update({ notes: notasActuales })
      .eq('id', leadPendiente.id);

    // ═══ CRÍTICO: Limpiar TODOS los demás leads con alerta del mismo vendedor ═══
    // Esto evita que si Meta envía duplicados, se envíe a múltiples leads
    if (leadsPendientes && leadsPendientes.length > 1) {
      for (const otroLead of leadsPendientes.slice(1)) {
        if (otroLead.notes) {
          const otrasNotas = { ...otroLead.notes };
          delete otrasNotas.sugerencia_pendiente;
          delete otrasNotas.alerta_vendedor_id;
          await ctx.supabase.client.from('leads')
            .update({ notes: otrasNotas })
            .eq('id', otroLead.id);
        }
      }
      console.log(`🧹 Limpiados ${leadsPendientes.length - 1} leads adicionales con alerta pendiente`);
    }

    // Registrar actividad del vendedor
    await ctx.supabase.client.from('lead_activities').insert({
      lead_id: leadPendiente.id,
      team_member_id: vendedor.id,
      activity_type: 'message_sent',
      description: `Mensaje personalizado de seguimiento`,
      metadata: { mensaje: body.substring(0, 100) }
    });

    // Confirmar al vendedor
    const nombreLead = leadPendiente.name || 'lead';
    await ctx.twilio.sendWhatsAppMessage(from,
      `✅ *Tu mensaje fue enviado a ${nombreLead}*\n\n` +
      `💡 Usa *bridge ${nombreLead.split(' ')[0]}* para continuar la conversación.`
    );

    console.log(`✅ Vendedor ${nombreVendedor} envió mensaje personalizado a lead ${leadPendiente.phone}`);
    return true;
  }

  if (!result.matched) {
    return false;
  }

  const params = result.handlerParams || {};

  // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
  const handlerResult = await vendorService.executeHandler(
    result.handlerName!,
    vendedor,
    nombreVendedor,
    params
  );

  // Si el servicio manejó el comando exitosamente, enviar mensaje
  if (handlerResult.message) {
    await ctx.twilio.sendWhatsAppMessage(from, handlerResult.message);
    return true;
  }

  // Si hay error pero no necesita handler externo, mostrar error
  if (handlerResult.error && !handlerResult.needsExternalHandler) {
    await ctx.twilio.sendWhatsAppMessage(from, handlerResult.error);
    return true;
  }

  // ━━━ FALLBACK: Handlers que requieren lógica externa (múltiples envíos, media, etc.) ━━━
  switch (result.handlerName) {
    // ━━━ VENTAS Y ETAPAS (envían a múltiples destinos) ━━━
    case 'vendedorRegistrarApartado':
      await vendedorRegistrarApartado(ctx, handler, from, body, vendedor, params.match);
      break;
    case 'vendedorCambiarEtapa':
      await vendedorCambiarEtapa(ctx, handler, from, body, vendedor, params.etapa, params.texto);
      break;
    case 'vendedorCerrarVenta':
      await vendedorCerrarVenta(ctx, handler, from, body, vendedor, nombreVendedor, params.nombreLead);
      break;
    case 'vendedorMoverEtapa':
      await vendedorMoverEtapa(ctx, handler, from, body, mensaje, vendedor, nombreVendedor);
      break;
    case 'vendedorCancelarLead':
      await vendedorCancelarLeadConParams(ctx, handler, from, params.nombreLead, vendedor, nombreVendedor);
      break;
    case 'vendedorPausarLead':
      await vendedorPausarLead(ctx, from, params.nombreLead, vendedor);
      break;
    case 'vendedorReanudarLead':
      await vendedorReanudarLead(ctx, from, params.nombreLead, vendedor);
      break;
    case 'vendedorHumanoLead':
      await vendedorHumanoLead(ctx, from, params.nombreLead, vendedor);
      break;
    case 'vendedorBotLead':
      await vendedorBotLead(ctx, from, params.nombreLead, vendedor);
      break;
    case 'vendedorEntregado':
      await vendedorEntregado(ctx, from, params.nombreLead, vendedor);
      break;

    // ━━━ HIPOTECA Y ASESORES (interactúan con externos) ━━━
    case 'vendedorEnviarABanco':
      await vendedorEnviarABanco(ctx, handler, from, body, vendedor);
      break;
    case 'vendedorConfirmarEnvioABanco':
      await vendedorConfirmarEnvioABanco(ctx, handler, from, body, vendedor);
      break;
    case 'vendedorConsultarCredito':
      await vendedorConsultarCredito(ctx, handler, from, params.nombreLead || params.nombre || body, vendedor);
      break;
    case 'vendedorPreguntarAsesor':
      await vendedorPreguntarAsesor(ctx, handler, from, params.nombre, vendedor, teamMembers);
      break;
    case 'vendedorAsignarAsesor':
      await vendedorAsignarAsesor(ctx, handler, from, params.nombreLead || params.nombre, vendedor, teamMembers, params.telefono);
      break;

    // ━━━ CITAS (flujos complejos) ━━━
    case 'vendedorAgendarCitaCompleta':
      await vendedorAgendarCitaCompleta(ctx, handler, from, body, vendedor, nombreVendedor);
      break;
    case 'vendedorAgendarCita':
      await vendedorAgendarCita(ctx, handler, from, body, vendedor, nombreVendedor);
      break;
    case 'vendedorCancelarCita':
      await vendedorCancelarCita(ctx, handler, from, body, vendedor, nombreVendedor);
      break;
    case 'vendedorReagendarCita':
      await vendedorReagendarCita(ctx, handler, from, body, vendedor, nombreVendedor);
      break;

    // ━━━ LEADS (crean/actualizan entidades) ━━━
    case 'vendedorCrearLead':
      await vendedorCrearLead(ctx, handler, from, body, vendedor, nombreVendedor);
      break;
    case 'crearLeadDesdeWhatsApp':
      await handler.crearLeadDesdeWhatsApp(from, params.nombre, params.telefono, vendedor);
      break;
    case 'vendedorGuardarCumple':
      await vendedorGuardarCumple(ctx, handler, from, params.match, vendedor);
      break;
    case 'vendedorGuardarEmail':
      await vendedorGuardarEmail(ctx, handler, from, params.match, vendedor);
      break;
    case 'vendedorRegistrarReferido':
      await vendedorRegistrarReferido(ctx, handler, from, params.match, vendedor);
      break;

    // ━━━ NOTAS Y ACTIVIDADES ━━━
    case 'vendedorAgregarNota':
      await vendedorAgregarNotaConParams(ctx, handler, from, params.nombreLead, params.textoNota, vendedor, nombreVendedor);
      break;
    case 'vendedorVerNotas':
      await vendedorVerNotasConParams(ctx, handler, from, params.nombreLead, vendedor, nombreVendedor);
      break;

    // ━━━ FOLLOW-UP PENDIENTE: APROBAR / CANCELAR / EDITAR ━━━
    case 'vendedorAprobarFollowup':
      await vendedorAprobarFollowup(ctx, handler, from, params.nombreLead, vendedor, nombreVendedor);
      break;
    case 'vendedorCancelarFollowup':
      await vendedorCancelarFollowup(ctx, handler, from, params.nombreLead, vendedor, nombreVendedor);
      break;
    case 'vendedorEditarFollowup':
      await vendedorEditarFollowup(ctx, handler, from, params.nombreLead, params.nuevoMensaje, vendedor, nombreVendedor);
      break;

    case 'registrarActividad':
      await handler.registrarActividad(from, params.nombre, params.tipo, vendedor, params.monto);
      break;
    case 'mostrarActividadesHoy':
      await handler.mostrarActividadesHoy(from, vendedor);
      break;
    case 'mostrarHistorialLead':
      await handler.mostrarHistorialLead(from, params.nombre, vendedor);
      break;

    // ━━━ LLAMADAS Y RECORDATORIOS ━━━
    case 'vendedorLlamar':
      await vendedorLlamar(ctx, handler, from, params.nombre, vendedor, nombreVendedor);
      break;
    case 'vendedorLlamarIA':
      await vendedorLlamarIA(ctx, handler, from, params.nombre, vendedor, nombreVendedor);
      break;
    case 'vendedorProgramarLlamada':
      await vendedorProgramarLlamada(ctx, handler, from, params.nombre, params.cuando, vendedor, nombreVendedor);
      break;
    case 'vendedorRecordarLlamar':
      await vendedorRecordarLlamar(ctx, handler, from, params.nombreLead, params.fechaHora, vendedor, nombreVendedor);
      break;
    case 'vendedorReagendarLlamada':
      await vendedorReagendarLlamada(ctx, handler, from, params.nombreLead, params.nuevaFechaHora, vendedor, nombreVendedor);
      break;
    case 'vendedorLlamadasPendientes':
      await vendedorLlamadasPendientes(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorCrearRecordatorio':
      await vendedorCrearRecordatorio(ctx, handler, from, params.texto, vendedor, nombreVendedor);
      break;

    // ━━━ BRIDGE Y MENSAJES ━━━
    case 'enviarMensajeLead':
      await enviarMensajeLead(ctx, handler, from, params.nombre, vendedor);
      break;
    case 'bridgeLead':
      await handler.ceoBridgeLead(from, params.nombreLead, vendedor, nombreVendedor, params.mensajeInicial);
      break;
    case 'extenderBridge':
      await handler.ceoExtenderBridge(from, vendedor, nombreVendedor);
      break;
    case 'cerrarBridge':
      await handler.ceoCerrarBridge(from, vendedor, nombreVendedor);
      break;

    // ━━━ MATERIAL Y MEDIA ━━━
    case 'vendedorEnviarMaterial':
      await vendedorEnviarMaterial(ctx, handler, from, params.desarrollo, body, vendedor);
      break;
    case 'vendedorEnviarInfoALead':
      await vendedorEnviarInfoALead(ctx, handler, from, params.desarrollo, params.leadNombre, vendedor, nombreVendedor);
      break;
    case 'vendedorPropiedades':
      await vendedorPropiedades(ctx, handler, from, vendedor);
      break;

    // ━━━ IA Y COACHING ━━━
    case 'vendedorAyudaContextual':
      await vendedorAyudaContextual(ctx, handler, from, body, nombreVendedor);
      break;
    case 'vendedorCoaching':
      await vendedorCoaching(ctx, handler, from, params.nombre, vendedor, nombreVendedor);
      break;
    case 'vendedorVerHistorial':
      await vendedorVerHistorial(ctx, handler, from, params.identificador, vendedor);
      break;

    // ━━━ CONSULTAS ESPECIALES (no en servicio aún) ━━━
    case 'vendedorMisHot':
      await vendedorMisHot(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorOnOff':
      await vendedorOnOff(ctx, handler, from, vendedor, nombreVendedor, params.estado);
      break;
    case 'vendedorDisponibilidad':
      await vendedorDisponibilidad(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorBuscarPorTelefono':
      await vendedorBuscarPorTelefono(ctx, handler, from, params.telefono, vendedor);
      break;

    // ━━━ REPORTES Y CONSULTAS BÁSICAS ━━━
    case 'vendedorCitasHoy':
      await vendedorCitasHoy(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorCitasManana':
      await vendedorCitasManana(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorResumenLeads':
      await vendedorResumenLeads(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorResumenHoy':
      await vendedorBriefing(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorAyuda':
      await vendedorAyuda(ctx, handler, from, nombreVendedor);
      break;
    case 'vendedorBriefing':
      await vendedorBriefing(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorMetaAvance':
      await vendedorMetaAvance(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorQuienEs':
      await vendedorQuienEs(ctx, handler, from, params.nombre, vendedor);
      break;
    case 'vendedorBrochure':
      await vendedorEnviarBrochure(ctx, handler, from, params.desarrollo, vendedor);
      break;
    case 'vendedorUbicacion':
      await vendedorEnviarUbicacion(ctx, handler, from, params.desarrollo, vendedor);
      break;
    case 'vendedorVideo':
      await vendedorEnviarVideo(ctx, handler, from, params.desarrollo, vendedor);
      break;
    case 'vendedorPasarACredito':
      await vendedorPasarACredito(ctx, handler, from, params.nombreLead, vendedor);
      break;
    case 'vendedorNuevoLead':
      await vendedorNuevoLead(ctx, handler, from, params.nombre, params.telefono, params.desarrollo, vendedor);
      break;
    case 'vendedorLeadsHot':
      await vendedorLeadsHot(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorLeadsPendientes':
      await vendedorLeadsPendientes(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorContactarLead':
      await vendedorContactarLead(ctx, handler, from, params.nombreLead, vendedor, nombreVendedor);
      break;

    // ━━━ OFERTAS / COTIZACIONES ━━━
    case 'vendedorCotizar':
      await vendedorCotizar(ctx, handler, from, params.nombreLead, params.precio, vendedor, nombreVendedor);
      break;
    case 'vendedorMisOfertas':
      await vendedorMisOfertas(ctx, handler, from, vendedor, nombreVendedor);
      break;
    case 'vendedorVerOferta':
      await vendedorVerOferta(ctx, handler, from, params.nombreLead, vendedor);
      break;
    case 'vendedorEnviarOferta':
      await vendedorEnviarOferta(ctx, handler, from, params.nombreLead, vendedor, nombreVendedor);
      break;
    case 'vendedorOfertaAceptada':
      await vendedorOfertaAceptada(ctx, handler, from, params.nombreLead, vendedor);
      break;
    case 'vendedorOfertaRechazada':
      await vendedorOfertaRechazada(ctx, handler, from, params.nombreLead, params.razon, vendedor);
      break;

    default:
      console.log('Handler vendedor no reconocido (fallback):', result.handlerName);
      return false;
  }

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VENDEDOR CERRAR BRIDGE - Terminar chat directo y mensajes pendientes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorCerrarBridge(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombreVendedor: string): Promise<void> {
  const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
  console.log(`🔒 Vendedor ${nombreVendedor} quiere cerrar conexiones`);

  try {
    // Obtener notas del vendedor
    const { data: vendedorData } = await ctx.supabase.client
      .from('team_members')
      .select('notes')
      .eq('id', vendedor.id)
      .single();

    const notes = safeJsonParse(vendedorData?.notes);

    let cerradoAlgo = false;
    let leadsAfectados: string[] = [];

    // ═══ 1. CERRAR BRIDGE ACTIVO ═══
    if (notes.active_bridge) {
      const bridgeInfo = notes.active_bridge;
      delete notes.active_bridge;

      const { data: leadData } = await ctx.supabase.client
        .from('leads')
        .select('id, name, notes')
        .eq('id', bridgeInfo.lead_id)
        .single();

      if (leadData) {
        const leadNotes = safeJsonParse(leadData.notes);
        delete leadNotes.active_bridge_to_vendedor;
        await ctx.supabase.client
          .from('leads')
          .update({ notes: leadNotes })
          .eq('id', leadData.id);

        leadsAfectados.push(bridgeInfo.lead_name || 'lead');

        const leadPhone = bridgeInfo.lead_phone?.replace(/\D/g, '');
        if (leadPhone) {
          await ctx.meta.sendWhatsAppMessage(leadPhone,
            `Listo, si necesitas algo más aquí estoy para ayudarte. 🏠`
          );
        }
      }
      cerradoAlgo = true;
      console.log(`🔒 Bridge cerrado: ${vendedor.name} ↔ ${bridgeInfo.lead_name}`);
    }

    // ═══ 2. LIMPIAR pending_response_to DE LEADS ═══
    const { data: leadsConPending } = await ctx.supabase.client
      .from('leads')
      .select('id, name, notes')
      .not('notes', 'is', null);

    for (const lead of leadsConPending || []) {
      let leadNotes: any = {};
      try {
        leadNotes = lead.notes ?
          (typeof lead.notes === 'string' ? JSON.parse(lead.notes) : lead.notes) : {};
      } catch (e) {
        console.error(`⚠️ Error parseando notas de ${lead.name}, saltando`);
        continue;
      }

      if (leadNotes.pending_response_to?.team_member_id === vendedor.id) {
        delete leadNotes.pending_response_to;
        await ctx.supabase.client
          .from('leads')
          .update({ notes: leadNotes })
          .eq('id', lead.id);

        if (!leadsAfectados.includes(lead.name)) {
          leadsAfectados.push(lead.name);
        }
        cerradoAlgo = true;
        console.log(`🔒 pending_response_to limpiado de: ${lead.name}`);
      }
    }

    // Guardar notas del vendedor
    await ctx.supabase.client
      .from('team_members')
      .update({ notes })
      .eq('id', vendedor.id);

    if (cerradoAlgo) {
      await ctx.meta.sendWhatsAppMessage(cleanPhone,
        `✅ Listo, cerrado.\n\n` +
        `Para reconectar: *bridge ${leadsAfectados[0] || 'nombre'}*`
      );
    } else {
      await ctx.meta.sendWhatsAppMessage(cleanPhone,
        `ℹ️ No tienes conexiones activas.`
      );
    }

  } catch (e) {
    console.error('❌ Error en vendedorCerrarBridge:', e);
    await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al cerrar conexiones.`);
  }
}

/**
 * Guarda cumpleaños de cliente entregado
 */
export async function vendedorGuardarCumple(ctx: HandlerContext, handler: any, from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
  const nombreCliente = match[1].trim();
  const dia = match[2].padStart(2, '0');
  const mes = match[3].padStart(2, '0');
  
  const leads = await findLeadByName(ctx.supabase, nombreCliente, {
    vendedorId: vendedor.id, statusFilter: 'delivered', limit: 1
  });
  const lead = leads[0];

  if (!lead) {
    await ctx.twilio.sendWhatsAppMessage(from, '❌ No encontré cliente entregado "' + nombreCliente + '"');
    return;
  }

  await ctx.supabase.client.from('leads').update({ birthday: '2000-' + mes + '-' + dia }).eq('id', lead.id);
  await ctx.twilio.sendWhatsAppMessage(from, '🎂 Cumpleaños de *' + lead.name + '* guardado: *' + dia + '/' + mes + '*');
}

/**
 * Guarda email de cliente entregado
 */
export async function vendedorGuardarEmail(ctx: HandlerContext, handler: any, from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
  const nombreCliente = match[1].trim();
  const correo = match[2].toLowerCase();
  
  const leads = await findLeadByName(ctx.supabase, nombreCliente, {
    vendedorId: vendedor.id, statusFilter: 'delivered', limit: 1
  });
  const lead = leads[0];

  if (!lead) {
    await ctx.twilio.sendWhatsAppMessage(from, '❌ No encontré cliente entregado "' + nombreCliente + '"');
    return;
  }

  await ctx.supabase.client.from('leads').update({ email: correo }).eq('id', lead.id);
  await ctx.twilio.sendWhatsAppMessage(from, '📧 Email de *' + lead.name + '* guardado: *' + correo + '*');
}

/**
 * Registra un referido por vendedor (usa ReferralService)
 */
export async function vendedorRegistrarReferido(ctx: HandlerContext, handler: any, from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
  const nombreReferido = match[1].trim();
  const telReferido = match[2];
  const nombreReferidor = match[3].trim();

  const refService = new ReferralService(ctx.supabase);
  const result = await refService.registerReferral({
    referrerName: nombreReferidor,
    referredName: nombreReferido,
    referredPhone: telReferido,
    vendorId: vendedor.id
  });

  if (!result.success) {
    await ctx.meta.sendWhatsAppMessage(from, `⚠️ Error al registrar referido: ${result.error}`);
    return;
  }

  // Send welcome message to referred lead
  const cleanPhone = telReferido.replace(/\D/g, '');
  const phoneFormatted = cleanPhone.length === 10 ? `521${cleanPhone}` : cleanPhone;
  await ctx.meta.sendWhatsAppMessage(phoneFormatted,
    '👋 ¡Hola *' + nombreReferido.split(' ')[0] + '*!\n\n' +
    'Tu amigo *' + nombreReferidor.split(' ')[0] + '* te recomendó con nosotros para ayudarte a encontrar tu casa ideal. 🏠\n\n' +
    'Tenemos opciones increíbles para ti.\n\n' +
    'Pronto te contactará uno de nuestros asesores. ¿Mientras tanto, te gustaría ver información de nuestras propiedades?\n\n' +
    'Responde *SÍ* para conocer más.');

  // Confirm to vendor
  await ctx.meta.sendWhatsAppMessage(from,
    '✅ *Referido registrado*\n\n' +
    '*' + nombreReferido + '* - ' + telReferido + '\n' +
    '👤 Por: ' + nombreReferidor +
    (result.referrer ? ` (${result.referrer.name})` : '') + '\n\n' +
    'Ya le enviamos mensaje de bienvenida.');
}

/**
 * Mueve lead en el funnel (siguiente/anterior/específico)
 */
export async function vendedorMoverEtapa(ctx: HandlerContext, handler: any, from: string, body: string, mensaje: string, vendedor: any, nombreVendedor: string): Promise<void> {
  const vendorService: any = new VendorCommandsService(ctx.supabase);
  let nombreLead: string | null = null;
  let direccion: 'next' | 'prev' | null = null;

  // Formato 1: "[nombre] adelante/al siguiente"
  let match = body.match(/^([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:al?\s+)?(?:siguiente|proximo|próximo|avanzar|adelante)$/i);
  if (match) {
    nombreLead = match[1].trim();
    direccion = 'next';
  }

  // Formato 2: "adelante/avanzar [nombre]"
  if (!nombreLead) {
    match = body.match(/^(?:adelante|avanzar|siguiente|proximo|próximo)\s+(.+)$/i);
    if (match) {
      nombreLead = match[1].trim();
      direccion = 'next';
    }
  }

  // Formato 3: "[nombre] atrás/anterior"
  if (!nombreLead) {
    match = body.match(/^([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:para\s+)?(?:atras|atrás|regresar|anterior)$/i);
    if (match) {
      nombreLead = match[1].trim();
      direccion = 'prev';
    }
  }

  // Formato 4: "atrás/regresar [nombre]"
  if (!nombreLead) {
    match = body.match(/^(?:atras|atrás|regresar|anterior)\s+(.+)$/i);
    if (match) {
      nombreLead = match[1].trim();
      direccion = 'prev';
    }
  }

  if (nombreLead && direccion) {
    console.log(`📌 Mover lead: "${nombreLead}" ${direccion}`);
    const result = await vendorService.moveFunnelStep(nombreLead, vendedor.id, vendedor.role, direccion);
    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || 'Error al mover lead');
      return;
    }
    if (result.multipleLeads) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeads(result.multipleLeads));
      return;
    }
    // Enviar confirmación directamente
    const etapaLabel = vendorService.getFunnelStageLabel(result.newStatus!);
    await ctx.twilio.sendWhatsAppMessage(from,
      `✅ *${result.lead!.name}* movido a ${etapaLabel}`
    );
    return;
  }

  // Formato: "Hilda atrás" - formato legacy
  const matchAtras = body.match(/(?:regresar\s+(?:a\s+)?)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:para\s+)?(?:atras|atrás|regresar|anterior)/i);
  if (matchAtras) {
    const result = await vendorService.moveFunnelStep(matchAtras[1].trim(), vendedor.id, vendedor.role, 'prev');
    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || 'Error al mover lead');
      return;
    }
    if (result.multipleLeads) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeads(result.multipleLeads));
      return;
    }
    const etapaLabel = vendorService.getFunnelStageLabel(result.newStatus!);
    await ctx.twilio.sendWhatsAppMessage(from,
      `✅ *${result.lead!.name}* movido a ${etapaLabel}`
    );
    return;
  }

  // Formato: "Hilda pasó a negociación"
  let matchEtapa = body.match(/^([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s*(?:pasó a|paso a|pasa a)\s*(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
  if (!matchEtapa) {
    matchEtapa = body.match(/(?:mover|mueve)\s+a?\s*([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:de\s+\w+\s+)?a\s+(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
  }
  
  if (matchEtapa) {
    const nombreLead = matchEtapa[1].trim();
    const etapaRaw = matchEtapa[2].toLowerCase();
    const etapaMap: Record<string, {key: string, label: string}> = {
      'contactado': {key: 'contacted', label: '📌 CONTACTADO'},
      'cita': {key: 'scheduled', label: '📅 CITA'},
      'scheduled': {key: 'scheduled', label: '📅 CITA'},
      'visitó': {key: 'visited', label: '🏠 VISITÓ'},
      'visito': {key: 'visited', label: '🏠 VISITÓ'},
      'negociación': {key: 'negotiation', label: '💰 NEGOCIACIÓN'},
      'negociacion': {key: 'negotiation', label: '💰 NEGOCIACIÓN'},
      'reservado': {key: 'reserved', label: '📝 RESERVADO'},
      'cerrado': {key: 'closed', label: '✅ CERRADO'},
      'entregado': {key: 'delivered', label: '🏠 ENTREGADO'},
      'nuevo': {key: 'new', label: '📌 NUEVO'},
      'new': {key: 'new', label: '📌 NUEVO'}
    };
    const etapa = etapaMap[etapaRaw];
    if (etapa) {
      await vendedorCambiarEtapaConNombre(ctx, handler, from, nombreLead, vendedor, etapa.key, etapa.label);
      return;
    }
  }

  await ctx.twilio.sendWhatsAppMessage(from, 
    `📌 *Para cambiar etapa escribe:*\n\n"[nombre] pasó a [etapa]"\n\n*Etapas:* contactado, cita, visitó, negociación, reservado, cerrado, entregado\n\n*Ejemplo:*\n• "Juan pasó a negociación"\n• "Mover María a reservado"\n• "Hilda al siguiente"`
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIONES DEL ASISTENTE VENDEDOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VER LEADS POR TIPO - compradores, caídos, inactivos, todos, archivados
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function verLeadsPorTipo(ctx: HandlerContext, handler: any, from: string, vendedor: any, tipo: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    const result = await vendorService.getLeadsPorTipo(vendedor.id, esAdmin, tipo);
    const mensaje = vendorService.formatLeadsPorTipo(result);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error en verLeadsPorTipo:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads. Intenta de nuevo.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ARCHIVAR/DESARCHIVAR LEAD - Para spam, números erróneos, etc
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function archivarDesarchivarLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, archivar: boolean): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    const result = await vendorService.archivarDesarchivarLead(nombreLead, vendedor.id, esAdmin, archivar);

    if (!result.success) {
      if (result.multipleLeads) {
        const msg = vendorService.formatMultipleLeads(result.multipleLeads);
        await ctx.twilio.sendWhatsAppMessage(from, msg);
      } else {
        await ctx.twilio.sendWhatsAppMessage(from, result.error || '❌ Error.');
      }
      return;
    }

    const mensaje = vendorService.formatArchivarExito(result.lead, archivar);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error en archivarDesarchivarLead:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error. Intenta de nuevo.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REACTIVAR LEAD - Cambiar de fallen a new
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function reactivarLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    const result = await vendorService.reactivarLead(nombreLead, vendedor.id, esAdmin);

    if (!result.success) {
      if (result.multipleLeads) {
        const msg = vendorService.formatMultipleLeads(result.multipleLeads);
        await ctx.twilio.sendWhatsAppMessage(from, msg);
      } else {
        await ctx.twilio.sendWhatsAppMessage(from, result.error || '❌ Error.');
      }
      return;
    }

    const mensaje = vendorService.formatReactivarExito(result.lead);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error en reactivarLead:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error. Intenta de nuevo.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENVIAR MATERIAL DE VENTAS - Brochure, video, ubicación
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorEnviarMaterial(ctx: HandlerContext, handler: any, from: string, desarrollo: string, mensaje: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.buscarMaterialDesarrollo(desarrollo);

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || '❌ Error buscando desarrollo.');
      return;
    }

    const material = vendorService.getMaterialDisponible(result.property, mensaje);
    let materialesEnviados = 0;

    if (material.pideBrochure) {
      const brochureUrl = handler.getBrochureUrl(material.nombreDesarrollo);
      if (brochureUrl) {
        await ctx.twilio.sendWhatsAppMessage(from, `📌 *Brochure ${material.nombreDesarrollo}:*\n${brochureUrl}`);
        materialesEnviados++;
      }
    }

    if (material.pideVideo && material.youtubeLink) {
      await ctx.twilio.sendWhatsAppMessage(from, `📌 *Video ${material.nombreDesarrollo}:*\n${material.youtubeLink}`);
      materialesEnviados++;
    }

    if (material.pideUbicacion && material.gpsLink) {
      await ctx.twilio.sendWhatsAppMessage(from, `📌 *Ubicación ${material.nombreDesarrollo}:*\n${material.gpsLink}`);
      materialesEnviados++;
    }

    if (material.pideRecorrido && material.matterportLink) {
      await ctx.twilio.sendWhatsAppMessage(from, `🏠 *Recorrido 3D ${material.nombreDesarrollo}:*\n${material.matterportLink}`);
      materialesEnviados++;
    }

    if (materialesEnviados === 0) {
      const pidio = mensaje.toLowerCase().includes('video') ? 'video registrado' :
                    mensaje.toLowerCase().includes('ubicaci') ? 'ubicación GPS registrada' :
                    mensaje.toLowerCase().includes('recorrido') ? 'recorrido 3D registrado' : 'ese material';
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatMaterialNoDisponible(material, pidio));
    }
  } catch (error) {
    console.error('Error en vendedorEnviarMaterial:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al buscar material.');
  }
}
export async function vendedorMotivoRespuesta(ctx: HandlerContext, handler: any, from: string, opcion: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.procesarMotivoRespuesta(opcion, vendedor.id);

    if (!result.success) {
      if (result.error) {
        await ctx.twilio.sendWhatsAppMessage(from, result.error);
      }
      return;
    }

    if (result.needsCustomReason) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatPedirMotivoCustom());
      return;
    }

    const mensaje = vendorService.formatMotivoGuardado(result.lead.name, result.motivo!, result.rechazadoCredito);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error en vendedorMotivoRespuesta:', error);
  }
}
export async function vendedorMotivoCustom(ctx: HandlerContext, handler: any, from: string, motivo: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.procesarMotivoCustom(motivo, vendedor.id);

    if (!result.success) return;

    const mensaje = vendorService.formatMotivoGuardado(result.lead.name, result.motivo!);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error en vendedorMotivoCustom:', error);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNNEL VENDEDOR - CAMBIO DE ETAPAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Función auxiliar para cambiar etapa por nombre
export async function vendedorCambiarEtapaConNombre(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    const result = await vendorService.cambiarEtapa(nombreLead, nuevaEtapa, vendedor.id, esAdmin);

    if (result.error) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error);
      return;
    }

    if (result.multipleLeads) {
      let msg = `📌 Encontré ${result.multipleLeads.length} leads:\n`;
      result.multipleLeads.forEach((l: any, i: number) => {
        msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4)}) - ${l.status}\n`;
      });
      msg += `\nEscribe el nombre completo.`;
      await ctx.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    if (!result.success || !result.lead) return;

    const lead = result.lead;
    console.log('✅ Lead actualizado:', lead.name, '- Score:', result.newScore, 'Temp:', result.nuevaCategoria);

    // NOTIFICAR AL VENDEDOR ASIGNADO (si existe y no es quien hizo el cambio)
    if (lead.assigned_to && lead.assigned_to !== vendedor.id) {
      try {
        const vendedorAsignado = await vendorService.getVendedorAsignado(lead.assigned_to);
        if (vendedorAsignado?.phone) {
          const notificacion = vendorService.formatNotificacionCambio(lead, result.oldStatus!, nuevaEtapa, result.newScore!, vendedor.name);
          await ctx.twilio.sendWhatsAppMessage(vendedorAsignado.phone, notificacion);
          console.log('📌 Notificación enviada al vendedor:', vendedorAsignado.name);
        }
      } catch (e) {
        console.error('⚠️ Error notificando vendedor:', e);
      }
    }

    // PROGRAMAR FOLLOW-UPS automáticos según nuevo status
    try {
      const followupService = new FollowupService(ctx.supabase);
      await followupService.programarFollowups(lead.id, lead.phone || '', lead.name, 'Por definir', 'status_change', nuevaEtapa);
      console.log(`📌 Follow-ups programados para ${lead.name} (${nuevaEtapa})`);
    } catch (e) {
      console.error('⚠️ Error programando follow-ups:', e);
    }

    const mensaje = vendorService.formatCambioEtapa(lead.name, etapaTexto);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error cambiando etapa:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al cambiar etapa. Intenta de nuevo.');
  }
}
export async function vendedorCambiarEtapa(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const nombreLead = vendorService.parseNombreLeadCambioEtapa(body);

    if (!nombreLead) {
      await ctx.twilio.sendWhatsAppMessage(from, `📝 Escribe el nombre: *"Juan reservó"* o *"Reservó Juan"*`);
      return;
    }

    const result = await vendorService.cambiarEtapa(nombreLead, nuevaEtapa, vendedor.id, false);

    if (result.error) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error);
      return;
    }

    if (result.multipleLeads) {
      let msg = `🤝 Encontré ${result.multipleLeads.length} leads:\n`;
      result.multipleLeads.forEach((l: any, i: number) => {
        msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4)}) - ${l.status}\n`;
      });
      msg += `\nEscribe el nombre completo.`;
      await ctx.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    if (!result.success || !result.lead) return;
    const lead = result.lead;

    // PROGRAMAR FOLLOW-UPS
    try {
      const followupService = new FollowupService(ctx.supabase);
      await followupService.programarFollowups(lead.id, lead.phone || '', lead.name, 'Por definir', 'status_change', nuevaEtapa);
    } catch (e) { console.error('⚠️ Error follow-ups:', e); }

    let respuesta = vendorService.formatCambioEtapa(lead.name, etapaTexto);

    // Si es entregado - VENTA REAL (delegado a servicio)
    if (nuevaEtapa === 'delivered' && lead.phone) {
      const entregaResult = await vendorService.procesarEntregaVenta(lead.id);
      if (entregaResult.leadPhone) {
        await ctx.twilio.sendWhatsAppMessage(handler.formatPhoneMX(entregaResult.leadPhone), vendorService.formatMensajeEntregaCliente(entregaResult.leadNombre));
      }
      respuesta = `🎉 *¡Entrega registrada!*\n\n${lead.name} ha sido marcado como *entregado*.\n\n🏠 ¡Felicidades por cerrar esta venta!`;
    }

    // Si se cayó (delegado a servicio)
    if (nuevaEtapa === 'fallen') {
      respuesta = vendorService.formatMensajeCaidoVendedor(lead.name);
      const caidoResult = await vendorService.procesarLeadCaido(lead.id, lead.notes);
      if (caidoResult.leadPhone) {
        await ctx.twilio.sendWhatsAppMessage(handler.formatPhoneMX(caidoResult.leadPhone), vendorService.formatMensajeCaidoCliente(caidoResult.leadNombre));
        respuesta += '\n\n📤 Ya le envié encuesta al cliente.';
      }
    }

    await ctx.twilio.sendWhatsAppMessage(from, respuesta);
  } catch (error) {
    console.error('Error cambiando etapa:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al cambiar etapa.');
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HIPOTECA - ENVIAR A BANCO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorEnviarABanco(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const parsed = vendorService.parseEnvioABanco(body);

    if (!parsed.nombre || !parsed.banco) {
      await ctx.twilio.sendWhatsAppMessage(from, `📝 Escribe:\n• *"Manda a Juan a BBVA"*\n• *"Envía a Juan a Infonavit"*\n\nBancos: BBVA, Santander, Banorte, HSBC, Infonavit, Fovissste`);
      return;
    }

    const result = await vendorService.enviarABanco(parsed.nombre, parsed.banco, vendedor.id, vendedor.name);

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || 'Error al enviar a banco');
      return;
    }

    // Notificar al asesor si existe y está activo
    if (result.asesor?.phone && result.asesor?.is_active !== false) {
      const asesorPhone = result.asesor.phone.replace(/\D/g, '');
      const notificacion = vendorService.formatNotificacionAsesor(result.lead, result.banco!, vendedor.name);
      await ctx.twilio.sendWhatsAppMessage(asesorPhone, notificacion);
    }

    const mensaje = vendorService.formatEnvioABanco(result.lead, result.banco!, result.asesor, result.bancosPrevios);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error enviando a banco:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al procesar solicitud de crédito.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HIPOTECA - CONFIRMAR ENVÍO (ya tiene solicitud en otro banco)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorConfirmarEnvioABanco(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const parsed = vendorService.parseConfirmarEnvio(body);

    if (!parsed.nombre || !parsed.banco) {
      await ctx.twilio.sendWhatsAppMessage(from, `📝 Escribe:\n*"Confirmar envio Juan Test BBVA"*`);
      return;
    }

    const result = await vendorService.enviarABancoForzado(parsed.nombre, parsed.banco, vendedor.id, vendedor.name);

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || 'Error al enviar a banco');
      return;
    }

    // Notificar al asesor si existe y está activo
    if (result.asesor?.phone && result.asesor?.is_active !== false) {
      const asesorPhone = result.asesor.phone.replace(/\D/g, '');
      const notificacion = vendorService.formatNotificacionAsesor(result.lead, result.banco!, vendedor.name);
      await ctx.twilio.sendWhatsAppMessage(asesorPhone, notificacion);
    }

    const mensaje = `✅ *Confirmado*\n\n${vendorService.formatEnvioABanco(result.lead, result.banco!, result.asesor)}`;
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error confirmando envío a banco:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al procesar confirmación.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HIPOTECA - CONSULTAR ESTADO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorConsultarCredito(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any): Promise<void> {
  try {
    const mortgageService: any = new MortgageService(ctx.supabase);

    // Extraer nombre
    const matchNombre = body.match(/(?:cómo va|como va|estatus|status).*?(?:de\s+)?([a-záéíóúñ\s]+?)(?:\?|$)/i) ||
                        body.match(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9 ]+).*?(?:cómo va|como va|crédit|hipoteca)/i);

    let nombreLead = '';
    if (matchNombre) {
      nombreLead = matchNombre[1].replace(/(?:el\s+)?(?:crédit|credit|hipoteca|banco).*$/i, '').trim();
    }

    // Si no hay nombre, mostrar los créditos de MIS leads
    if (!nombreLead || nombreLead.length < 2) {
      const result = await mortgageService.getCreditsForVendor(vendedor.id);

      if (result.isEmpty) {
        await ctx.twilio.sendWhatsAppMessage(from, `📋 No tienes leads con crédito en proceso.\n\n💡 Para asignar un lead al asesor: *"asesor para [nombre]"*`);
        return;
      }

      const resp = mortgageService.formatCreditList(result.credits);
      await ctx.twilio.sendWhatsAppMessage(from, resp);
      return;
    }

    // Buscar créditos del lead específico
    const result = await mortgageService.getCreditStatusByName(nombreLead);

    if (!result.found) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré solicitudes de crédito para *${nombreLead}*`);
      return;
    }

    let resp = mortgageService.formatCreditList(result.credits!);

    // Preguntar al asesor si hay solicitud activa
    if (result.hasPendingInquiry) {
      resp += `\n¿Quieres que le pregunte al asesor?\n*1.* Sí, pregúntale\n*2.* No, está bien`;

      // Guardar estado para siguiente mensaje
      const creditLeads = await findLeadByName(ctx.supabase, nombreLead, {
        select: 'id, notes', limit: 1
      });
      const lead = creditLeads[0];

      if (lead) {
        await ctx.supabase.client
          .from('leads')
          .update({
            notes: {
              ...(lead.notes || {}),
              pending_credit_inquiry: result.pendingInquiryId
            }
          })
          .eq('id', lead.id);
      }
    }

    await ctx.twilio.sendWhatsAppMessage(from, resp);
  } catch (error) {
    console.error('Error consultando crédito:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al consultar créditos.');
  }
}

// ═══════════════════════════════════════════════════════════════
// VENDEDOR: Asignar lead a asesor hipotecario
// Comando: "asesor para Juan", "asesor para Juan 5512345678", "crédito para Pedro"
// ═══════════════════════════════════════════════════════════════
export async function vendedorAsignarAsesor(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, teamMembers: any[], telefonoLead?: string | null): Promise<void> {
  try {
    console.log(`🏦 Vendedor ${vendedor.name} asignando "${nombreLead}" a asesor hipotecario...`);
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.asignarAsesorHipotecario(nombreLead, vendedor, teamMembers, telefonoLead);

    if (!result.success) {
      if (result.multipleLeads) {
        await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsAsesor(result.multipleLeads, result.nombreBuscado!));
      } else {
        await ctx.twilio.sendWhatsAppMessage(from, result.error!);
      }
      return;
    }

    // Notificar al asesor (solo si está activo)
    if (result.asesor.is_active !== false) {
      await ctx.twilio.sendWhatsAppMessage(result.asesor.phone, vendorService.formatMensajeAsesorNuevoLead(result.lead, result.vendedor));
    }
    // Confirmar al vendedor
    await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionAsesorAsignado(result.lead, result.asesor));
    console.log(`✅ Lead ${result.lead.name} asignado a asesor ${result.asesor.name} (notif=${result.asesor.is_active !== false})`);
  } catch (e) {
    console.error('❌ Error asignando asesor:', e);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al asignar. Intenta de nuevo.');
  }
}

// ═══════════════════════════════════════════════════════════════
// VENDEDOR: Preguntar al asesor cómo va un lead (comunicación en vivo)
// Comando: "preguntar asesor vanessa"
// ═══════════════════════════════════════════════════════════════
export async function vendedorPreguntarAsesor(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, teamMembers: any[]): Promise<void> {
  try {
    console.log(`💬 Vendedor ${vendedor.name} preguntando al asesor por "${nombreLead}"...`);
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.preguntarAsesorCredito(nombreLead, vendedor, teamMembers);

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error!);
      return;
    }

    // Enviar mensaje al asesor (solo si está activo)
    if (result.asesor.is_active !== false) {
      await ctx.twilio.sendWhatsAppMessage(result.asesor.phone, vendorService.formatMensajeAsesorPregunta(result.lead, result.solicitud, result.vendedor));
    }
    // Confirmar al vendedor
    await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionPreguntaEnviada(result.asesor, result.lead));
    console.log(`✅ Pregunta a asesor ${result.asesor.name} sobre ${result.lead.name} (notif=${result.asesor.is_active !== false})`);
  } catch (e) {
    console.error('❌ Error preguntando a asesor:', e);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error. Intenta de nuevo.');
  }
}

// ═══════════════════════════════════════════════════════════════
// LLAMAR [nombre] - Mostrar teléfono clickeable para marcar
// ═══════════════════════════════════════════════════════════════
export async function mostrarTelefonoLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, usuario: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.buscarLeadTelefono(nombreLead, usuario);

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || '❌ Error buscando lead.');
      return;
    }

    const msg = vendorService.formatTelefonoLead(result.lead, result.telFormateado!);
    await ctx.twilio.sendWhatsAppMessage(from, msg);
    console.log(`📞 Teléfono mostrado: ${result.lead.name} -> ${usuario.name}`);
  } catch (e) {
    console.error('❌ Error mostrando teléfono:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error. Intenta de nuevo.`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MENSAJE [nombre] - Enviar WhatsApp al lead (pregunta qué mensaje)
// ═══════════════════════════════════════════════════════════════
export async function enviarMensajeLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, usuario: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.buscarLeadMensaje(nombreLead, usuario);

    if (!result.success) {
      // Si hay múltiples leads, guardar opciones y mostrar lista
      if (result.multipleLeads && result.pendingSelection) {
        await vendorService.guardarPendingLeadSelection(usuario.id, result.pendingSelection);
        const msg = vendorService.formatMultipleLeads(result.multipleLeads);
        await ctx.twilio.sendWhatsAppMessage(from, msg);
        return;
      }
      // Error simple
      await ctx.twilio.sendWhatsAppMessage(from, result.error || '❌ Error buscando lead.');
      return;
    }

    // Guardar pending para esperar el mensaje
    await vendorService.guardarPendingMessageToLead(usuario.id, result.lead, result.telefono!);

    // Preguntar qué mensaje enviar
    const pregunta = vendorService.formatPreguntaMensaje(result.lead.name);
    await ctx.twilio.sendWhatsAppMessage(from, pregunta);
    console.log(`💬 Esperando mensaje para ${result.lead.name} de ${usuario.name}`);
  } catch (e) {
    console.error('❌ Error preparando mensaje:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error. Intenta de nuevo.`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Enviar mensaje pendiente al lead (cuando el usuario escribe el contenido)
// Activa un "bridge" temporal de 10 minutos para chat directo
// ═══════════════════════════════════════════════════════════════
export async function enviarMensajePendienteLead(ctx: HandlerContext, handler: any, from: string, mensaje: string, usuario: any, pendingData: any): Promise<void> {
  try {
    const { lead_id, lead_name, lead_phone } = pendingData;
    const bridgeService = new BridgeService(ctx.supabase);

    // Enviar mensaje al lead
    await ctx.meta.sendWhatsAppMessage(lead_phone, mensaje);

    // Activar bridge usando el servicio
    const result = await bridgeService.activarBridge(
      usuario.id,
      usuario.name,
      from,
      lead_id,
      lead_name,
      lead_phone
    );

    if (result.success) {
      // Confirmar al usuario
      const confirmacion = bridgeService.formatMensajeBridgeActivado(lead_name, mensaje);
      await ctx.meta.sendWhatsAppMessage(from, confirmacion);

      // Registrar actividad
      await ctx.supabase.client.from('lead_activities').insert({
        lead_id: lead_id,
        team_member_id: usuario.id,
        activity_type: 'whatsapp',
        notes: `Mensaje enviado: "${mensaje.substring(0, 100)}"`,
        created_at: new Date().toISOString()
      });

      console.log(`💬 Mensaje enviado a ${lead_name} por ${usuario.name} - Bridge activo`);
    } else {
      await ctx.meta.sendWhatsAppMessage(from, `❌ Error activando chat directo. Intenta de nuevo.`);
    }
  } catch (e) {
    console.error('❌ Error enviando mensaje pendiente:', e);
    await ctx.meta.sendWhatsAppMessage(from, `❌ Error enviando mensaje. Intenta de nuevo.`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIONES DE ACTUALIZACIÓN DEL VENDEDOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ═══════════════════════════════════════════════════════════════
// APARTADO COMPLETO - Con enganche y fecha de pago
// Formato: "apartar Juan en Distrito Falco 50000 para el 20 enero"
// ═══════════════════════════════════════════════════════════════
export async function vendedorRegistrarApartado(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, match: RegExpMatchArray): Promise<void> {
  try {
    const ventasService = new VentasService(ctx.supabase);
    const datos = ventasService.parseApartado(body, match);
    console.log('📝 APARTADO - nombre:', datos.nombreLead, 'propiedad:', datos.propiedad, 'enganche:', datos.enganche);

    const result = await ventasService.registrarApartado(datos, vendedor);

    if (result.multipleLeads) {
      await ctx.twilio.sendWhatsAppMessage(from, ventasService.formatMultipleLeadsApartado(result.multipleLeads));
      return;
    }

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    // Enviar confirmación al vendedor
    await ctx.twilio.sendWhatsAppMessage(from, ventasService.formatApartadoExito(result));

    // Enviar felicitación al cliente
    if (result.lead?.phone) {
      const clientePhone = result.lead.phone.replace(/[^0-9]/g, '');
      const clienteFormatted = clientePhone.startsWith('52') ? clientePhone : '52' + clientePhone.slice(-10);
      const mensajeCliente = ventasService.formatMensajeClienteApartado(result.lead, datos.propiedad, vendedor);
      await ctx.twilio.sendWhatsAppMessage(handler.formatPhoneMX(clienteFormatted), mensajeCliente);
      console.log('📤 Mensaje de felicitación enviado a cliente:', result.lead.name);
    }
  } catch (e) {
    console.error('❌ Error en vendedorRegistrarApartado:', e);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error registrando apartado. Intenta de nuevo.');
  }
}
export async function vendedorCerrarVenta(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string, nombreLeadParam?: string): Promise<void> {
  const ventasService = new VentasService(ctx.supabase);

  // Usar nombre pre-parseado de detectRouteCommand si disponible
  const nombreLead = nombreLeadParam || ventasService.parseCerrarVenta(body);
  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, ventasService.getMensajeAyudaCerrarVenta());
    return;
  }

  const result = await ventasService.cerrarVenta(nombreLead, vendedor);

  if (!result.success) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
    return;
  }

  await ctx.twilio.sendWhatsAppMessage(from, ventasService.formatCerrarVentaExito(result.lead!, nombre));

  // Enviar celebración al CLIENTE
  const leadVenta = result.lead!;
  if (leadVenta.phone) {
    try {
      const desarrolloNombre = leadVenta.property_interest || 'tu nuevo hogar';
      const msgCliente = `🎉 *¡Felicidades ${leadVenta.name || ''}!*\n\n¡Tu nuevo hogar en *${desarrolloNombre}* te espera!\n\nTu asesor *${nombre}* te dará seguimiento con los próximos pasos.\n\n¡Bienvenido a la familia Grupo Santa Rita! 🏡`;
      await ctx.twilio.sendWhatsAppMessage(leadVenta.phone, msgCliente);
      console.log(`🎉 Celebración enviada al cliente ${leadVenta.name}`);
    } catch (e) {
      console.error('Error enviando celebración al cliente:', e);
    }
  }

  // Notificar al CEO
  try {
    const { data: ceo } = await ctx.supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'admin')
      .eq('active', true)
      .limit(1)
      .single();
    if (ceo?.phone) {
      const msgCEO = `🏆 *¡VENTA CERRADA!*\n\n👤 Cliente: ${leadVenta.name || 'N/A'}\n🏠 Desarrollo: ${leadVenta.property_interest || 'N/A'}\n💼 Vendedor: ${nombre}\n📅 Fecha: ${new Date().toLocaleDateString('es-MX')}\n\n¡Felicidades al equipo! 🎉`;
      const { enviarMensajeTeamMember } = await import('../utils/teamMessaging');
      const ceoResult = await enviarMensajeTeamMember(ctx.supabase, ctx.twilio as any, ceo, msgCEO, {
        tipoMensaje: 'alerta_lead',
        pendingKey: 'pending_alerta_lead'
      });
      if (!ceoResult.success) {
        console.error(`❌ CRITICAL: CEO NO fue notificado de venta cerrada (${leadVenta.name})`);
      }
    }
  } catch (e) {
    console.error('❌ CRITICAL: Error notificando CEO de venta:', e);
  }
}
export async function vendedorCancelarLead(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  const ventasService = new VentasService(ctx.supabase);

  const nombreLead = ventasService.parseCancelarLead(body);
  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, ventasService.getMensajeAyudaCancelarLead());
    return;
  }

  const result = await ventasService.cancelarLead(nombreLead, vendedor);

  if (result.multipleLeads) {
    await ctx.twilio.sendWhatsAppMessage(from, ventasService.formatMultipleLeadsCancelar(result.multipleLeads));
    return;
  }

  if (!result.success) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
    return;
  }

  await ctx.twilio.sendWhatsAppMessage(from, ventasService.formatCancelarLeadExito(result.lead!));
}

// Versión con params ya parseados (para rutas desde vendorCommandsService)
export async function vendedorCancelarLeadConParams(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
  const ventasService = new VentasService(ctx.supabase);

  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, ventasService.getMensajeAyudaCancelarLead());
    return;
  }

  const result = await ventasService.cancelarLead(nombreLead, vendedor);

  if (result.multipleLeads) {
    await ctx.twilio.sendWhatsAppMessage(from, ventasService.formatMultipleLeadsCancelar(result.multipleLeads));
    return;
  }

  if (!result.success) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
    return;
  }

  await ctx.twilio.sendWhatsAppMessage(from, ventasService.formatCancelarLeadExito(result.lead!));
}

// ═══ PAUSAR LEAD ═══
export async function vendedorPausarLead(ctx: HandlerContext, from: string, nombreLead: string, vendedor: any): Promise<void> {
  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Escribe: *pausar [nombre del lead]*');
    return;
  }

  const leads = await findLeadByName(ctx.supabase, nombreLead, {
    vendedorId: vendedor.id, select: 'id, name, status, notes', limit: 5
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
    return;
  }
  if (leads.length > 1) {
    const lista = leads.map(l => `• ${l.name} (${l.status})`).join('\n');
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ Encontré varios leads:\n${lista}\n\nSé más específico con el nombre.`);
    return;
  }

  const lead = leads[0];
  if (lead.status === 'paused') {
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ *${lead.name}* ya está pausado. Usa *reanudar ${lead.name}* para reactivar.`);
    return;
  }

  const notes = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
  await ctx.supabase.client
    .from('leads')
    .update({
      status: 'paused',
      notes: { ...notes, status_before_pause: lead.status, paused_at: new Date().toISOString() }
    })
    .eq('id', lead.id);

  await ctx.twilio.sendWhatsAppMessage(from, `⏸️ *${lead.name}* ha sido pausado.\nEstaba en: *${lead.status}*\n\nNo recibirá follow-ups ni nurturing automático.\nUsa *reanudar ${lead.name}* para reactivar.`);
}

// ═══ REANUDAR LEAD ═══
export async function vendedorReanudarLead(ctx: HandlerContext, from: string, nombreLead: string, vendedor: any): Promise<void> {
  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Escribe: *reanudar [nombre del lead]*');
    return;
  }

  const leads = await findLeadByName(ctx.supabase, nombreLead, {
    vendedorId: vendedor.id, select: 'id, name, status, notes', limit: 5
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
    return;
  }
  if (leads.length > 1) {
    const lista = leads.map(l => `• ${l.name} (${l.status})`).join('\n');
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ Encontré varios leads:\n${lista}\n\nSé más específico con el nombre.`);
    return;
  }

  const lead = leads[0];
  if (lead.status !== 'paused') {
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ *${lead.name}* no está pausado (status: *${lead.status}*).`);
    return;
  }

  const notes = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
  const previousStatus = notes.status_before_pause || 'contacted';

  await ctx.supabase.client
    .from('leads')
    .update({
      status: previousStatus,
      notes: { ...notes, status_before_pause: undefined, paused_at: undefined, resumed_at: new Date().toISOString() }
    })
    .eq('id', lead.id);

  await ctx.twilio.sendWhatsAppMessage(from, `▶️ *${lead.name}* ha sido reactivado.\nRestaurado a: *${previousStatus}*\n\nVolverá a recibir follow-ups automáticos.`);
}

// ═══ HUMANO LEAD (desactivar IA) ═══
export async function vendedorHumanoLead(ctx: HandlerContext, from: string, nombreLead: string, vendedor: any): Promise<void> {
  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Escribe: *humano [nombre del lead]*');
    return;
  }

  const leads = await findLeadByName(ctx.supabase, nombreLead, {
    vendedorId: vendedor.id, select: 'id, name, status, notes', limit: 5
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
    return;
  }
  if (leads.length > 1) {
    const lista = leads.map(l => `• ${l.name} (${l.status})`).join('\n');
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ Encontré varios leads:\n${lista}\n\nSé más específico con el nombre.`);
    return;
  }

  const lead = leads[0];
  const notes = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};

  if (notes.ai_enabled === false) {
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ *${lead.name}* ya tiene la IA desactivada. Tú atiendes sus mensajes.\nUsa *bot ${lead.name}* para reactivar SARA.`);
    return;
  }

  await ctx.supabase.client
    .from('leads')
    .update({ notes: { ...notes, ai_enabled: false, handoff_at: new Date().toISOString(), handoff_by: vendedor.id } })
    .eq('id', lead.id);

  await ctx.twilio.sendWhatsAppMessage(from,
    `🧑 *${lead.name}* — IA desactivada.\n\n` +
    `SARA ya NO responderá a este lead. Tú recibirás sus mensajes y debes atenderlo directamente.\n\n` +
    `Usa *bot ${lead.name}* para reactivar a SARA.`
  );
}

// ═══ BOT LEAD (reactivar IA) ═══
export async function vendedorBotLead(ctx: HandlerContext, from: string, nombreLead: string, vendedor: any): Promise<void> {
  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Escribe: *bot [nombre del lead]*');
    return;
  }

  const leads = await findLeadByName(ctx.supabase, nombreLead, {
    vendedorId: vendedor.id, select: 'id, name, status, notes', limit: 5
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
    return;
  }
  if (leads.length > 1) {
    const lista = leads.map(l => `• ${l.name} (${l.status})`).join('\n');
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ Encontré varios leads:\n${lista}\n\nSé más específico con el nombre.`);
    return;
  }

  const lead = leads[0];
  const notes = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};

  if (notes.ai_enabled !== false) {
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ *${lead.name}* ya tiene SARA activada.`);
    return;
  }

  await ctx.supabase.client
    .from('leads')
    .update({ notes: { ...notes, ai_enabled: true, handoff_at: undefined, handoff_by: undefined, bot_reactivated_at: new Date().toISOString() } })
    .eq('id', lead.id);

  await ctx.twilio.sendWhatsAppMessage(from,
    `🤖 *${lead.name}* — SARA reactivada.\n\n` +
    `SARA volverá a responder automáticamente a este lead.\n\n` +
    `Usa *humano ${lead.name}* si necesitas desactivarla de nuevo.`
  );
}

// ═══ ENTREGADO: Marcar lead como entregado (casa entregada) ═══
export async function vendedorEntregado(ctx: HandlerContext, from: string, nombreLead: string, vendedor: any): Promise<void> {
  if (!nombreLead) {
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Escribe: *entregado [nombre del lead]*');
    return;
  }

  const leads = await findLeadByName(ctx.supabase, nombreLead, {
    vendedorId: vendedor.id, select: 'id, name, phone, status, property_interest, notes', limit: 5
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
    return;
  }
  if (leads.length > 1) {
    const lista = leads.map(l => `• ${l.name}`).join('\n');
    await ctx.twilio.sendWhatsAppMessage(from, `⚠️ Encontré varios leads:\n${lista}\n\nSé más específico.`);
    return;
  }

  const lead = leads[0];
  const nombre = vendedor.name?.split(' ')[0] || 'Vendedor';

  // Actualizar status a delivered + guardar delivery_date en notes
  const notasActuales = typeof lead.notes === 'string' ? safeJsonParse(lead.notes, {}) : (lead.notes || {});
  notasActuales.delivery_date = new Date().toISOString();
  notasActuales.status_before_delivered = lead.status;

  const { error: updateErr } = await ctx.supabase.client
    .from('leads')
    .update({
      status: 'delivered',
      notes: JSON.stringify(notasActuales)
    })
    .eq('id', lead.id);

  if (updateErr) {
    console.error('Error marcando lead como entregado:', updateErr);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al marcar como entregado: ${updateErr.message}`);
    return;
  }

  // Confirmar al vendedor
  const desarrolloNombre = lead.property_interest || 'su nuevo hogar';
  await ctx.twilio.sendWhatsAppMessage(from,
    `🔑 *¡Entrega registrada!*\n\n👤 Cliente: ${lead.name}\n🏠 Desarrollo: ${desarrolloNombre}\n📅 Fecha: ${new Date().toLocaleDateString('es-MX')}\n\nSe activarán los seguimientos post-entrega automáticos.`
  );

  // Enviar celebración al CLIENTE
  if (lead.phone) {
    try {
      const msgCliente = `🔑 *¡Felicidades ${lead.name || ''}!*\n\n¡Tu nuevo hogar en *${desarrolloNombre}* ya es tuyo!\n\nEsperamos que disfrutes cada momento en tu nueva casa. Tu asesor *${nombre}* seguirá disponible para cualquier cosa que necesites.\n\n¡Bienvenido(a) a tu hogar! 🏡`;
      await ctx.twilio.sendWhatsAppMessage(lead.phone, msgCliente);
      console.log(`🔑 Celebración de entrega enviada al cliente ${lead.name}`);
    } catch (e) {
      console.error('Error enviando celebración de entrega al cliente:', e);
    }
  }

  // Notificar al CEO (24h-safe)
  try {
    const { data: ceo } = await ctx.supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'admin')
      .eq('active', true)
      .limit(1)
      .single();
    if (ceo?.phone) {
      const msgCEO = `🔑 *¡ENTREGA REALIZADA!*\n\n👤 Cliente: ${lead.name || 'N/A'}\n🏠 Desarrollo: ${desarrolloNombre}\n💼 Vendedor: ${nombre}\n📅 Fecha: ${new Date().toLocaleDateString('es-MX')}\n\n¡Otra familia feliz en su nuevo hogar! 🏡`;
      const { enviarMensajeTeamMember } = await import('../utils/teamMessaging');
      const ceoResult = await enviarMensajeTeamMember(ctx.supabase, ctx.twilio as any, ceo, msgCEO, {
        tipoMensaje: 'alerta_lead',
        pendingKey: 'pending_alerta_lead'
      });
      if (!ceoResult.success) {
        console.error(`❌ CRITICAL: CEO NO fue notificado de entrega (${lead.name})`);
      }
    }
  } catch (e) {
    console.error('❌ CRITICAL: Error notificando CEO de entrega:', e);
  }
}

export async function vendedorAgendarCita(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  // Extraer: agendar cita con [nombre] [fecha/día] [hora]
  const match = body.match(/agendar?.*(?:con|a)\s+([a-záéíóúñ\s]+?)(?:\s+(?:para\s+)?(?:el\s+)?)?(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|sábado|domingo)?/i);

  if (!match) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `🤝 No entendí.

Escribe así:
*"Agendar cita con Juan García mañana 10am"*`
    );
    return;
  }

  const nombreLead = match[1].trim();

  // Buscar lead
  let leads = await findLeadByName(ctx.supabase, nombreLead, {
    vendedorId: vendedor.id, limit: 1
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `❌’ No encontré a *${nombreLead}* en tus leads.`
    );
    return;
  }

  const lead = leads[0];
  
  // Por ahora solo confirmar - después agregaremos fecha/hora parsing
  await ctx.twilio.sendWhatsAppMessage(from,
    `📅 ¿Para cuándo quieres la cita con *${lead.name}*?

Responde con fecha y hora:
*"Mañana 10am"*
*"Viernes 3pm"*`
  );
}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NOTAS POR LEAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorAgregarNota(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const parsed = vendorService.parseAgregarNota(body);

    if (!parsed.nombreLead || !parsed.textoNota) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.getMensajeAyudaAgregarNota());
      return;
    }

    const result = await vendorService.agregarNotaPorNombre(parsed.nombreLead, parsed.textoNota, vendedor.id, vendedor.name || nombre);

    if (result.error) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    if (result.multipleLeads) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsNotas(result.multipleLeads));
      return;
    }

    if (result.success && result.lead) {
      const mensaje = vendorService.formatNotaAgregada(result.lead.name, parsed.textoNota, result.totalNotas!);
      await ctx.twilio.sendWhatsAppMessage(from, mensaje);
    }
  } catch (error) {
    console.error('Error agregando nota:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al agregar nota. Intenta de nuevo.');
  }
}
export async function vendedorVerNotas(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const nombreLead = vendorService.parseVerNotas(body);

    if (!nombreLead) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.getMensajeAyudaVerNotas());
      return;
    }

    const result = await vendorService.getLeadNotas(nombreLead, vendedor.id);

    if (result.error) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    if (result.multipleLeads) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsNotas(result.multipleLeads));
      return;
    }

    if (result.lead) {
      const mensaje = vendorService.formatLeadNotas(result.lead);
      await ctx.twilio.sendWhatsAppMessage(from, mensaje);
    }
  } catch (error) {
    console.error('Error viendo notas:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener notas. Intenta de nuevo.');
  }
}

// Versión con params ya parseados
export async function vendedorAgregarNotaConParams(ctx: HandlerContext, handler: any, from: string, nombreLead: string, textoNota: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);

    if (!nombreLead || !textoNota) {
      await ctx.meta.sendWhatsAppMessage(from, vendorService.getMensajeAyudaAgregarNota());
      return;
    }

    const result = await vendorService.agregarNotaPorNombre(nombreLead, textoNota, vendedor.id, vendedor.name || nombre);

    if (result.error) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    if (result.multipleLeads) {
      await ctx.meta.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsNotas(result.multipleLeads));
      return;
    }

    if (result.success && result.lead) {
      const mensaje = vendorService.formatNotaAgregada(result.lead.name, textoNota, result.totalNotas!);
      await ctx.meta.sendWhatsAppMessage(from, mensaje);
    }
  } catch (error) {
    console.error('Error agregando nota:', error);
    await ctx.meta.sendWhatsAppMessage(from, 'Error al agregar nota. Intenta de nuevo.');
  }
}
export async function vendedorVerNotasConParams(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);

    if (!nombreLead) {
      await ctx.meta.sendWhatsAppMessage(from, vendorService.getMensajeAyudaVerNotas());
      return;
    }

    const result = await vendorService.getLeadNotas(nombreLead, vendedor.id);

    if (result.error) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    if (result.lead) {
      const mensaje = vendorService.formatLeadNotas(result.lead);
      await ctx.meta.sendWhatsAppMessage(from, mensaje);
    }
  } catch (error) {
    console.error('Error viendo notas:', error);
    await ctx.meta.sendWhatsAppMessage(from, 'Error al obtener notas. Intenta de nuevo.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOLLOW-UP PENDIENTE: APROBAR / CANCELAR / EDITAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorAprobarFollowup(ctx: HandlerContext, handler: any, from: string, nombreLead: string | undefined, vendedor: any, nombre: string): Promise<void> {
  try {
    console.log(`🔍 vendedorAprobarFollowup: vendedor.id=${vendedor.id}, nombreLead=${nombreLead}`);

    // Buscar TODOS los leads del vendedor y filtrar en código
    // (la query JSONB de Supabase no siempre funciona bien)
    const { data: allLeads, error } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .eq('assigned_to', vendedor.id);

    if (error) {
      console.error('Error buscando leads:', error);
      await ctx.meta.sendWhatsAppMessage(from, `❌ Error BD: ${error.message}`);
      return;
    }

    console.log(`🔍 Leads encontrados para vendedor ${vendedor.id}: ${allLeads?.length || 0}`);

    // Filtrar leads que tienen pending_followup con status pending
    const leads = (allLeads || []).filter(l => {
      const notas = typeof l.notes === 'object' ? l.notes : {};
      const hasPending = notas.pending_followup && notas.pending_followup.status === 'pending';
      if (hasPending) {
        console.log(`✓ Lead ${l.name} tiene pending_followup pendiente`);
      }
      return hasPending;
    });

    console.log(`🔍 Leads con pending_followup: ${leads.length} de ${allLeads?.length || 0}`);

    if (!leads || leads.length === 0) {
      // DEBUG: mostrar por qué no hay leads
      const debugInfo = `vendedor.id=${vendedor.id}, total_leads=${allLeads?.length || 0}`;
      console.log(`📭 No hay follow-ups pendientes. Debug: ${debugInfo}`);
      await ctx.meta.sendWhatsAppMessage(from, `📭 No tienes follow-ups pendientes.\n\n_Debug: ${debugInfo}_`);
      return;
    }

    // Si se especificó nombre, filtrar
    let leadTarget = leads[0];
    if (nombreLead) {
      const normalizado = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      leadTarget = leads.find(l => {
        const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return leadNombre.includes(normalizado) || normalizado.includes(leadNombre.split(' ')[0]);
      }) || leads[0];
    }

    const notas = typeof leadTarget.notes === 'object' ? leadTarget.notes : {};
    const pending = notas.pending_followup;

    console.log(`🔍 leadTarget: ${leadTarget.name} (${leadTarget.id}), pending: ${JSON.stringify(pending)?.substring(0, 200)}`);

    // Nombre del lead (preferir pending, fallback a leadTarget)
    const leadName = pending?.lead_name || leadTarget.name || 'lead';

    if (!pending || pending.status !== 'pending') {
      // DEBUG: mostrar qué falló
      const debugStatus = `pending=${!!pending}, status=${pending?.status}`;
      console.log(`📭 No hay follow-up pendiente para ${leadName}. Debug: ${debugStatus}`);
      await ctx.meta.sendWhatsAppMessage(from, `📭 No hay follow-up pendiente para ${leadName}.\n\n_Debug: ${debugStatus}_`);
      return;
    }

    // Teléfono del lead (preferir pending, fallback a leadTarget.phone)
    const leadPhone = (pending.lead_phone || leadTarget.phone || '').replace(/\D/g, '');

    if (!leadPhone) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ Error: ${leadName} no tiene teléfono registrado.`);
      console.error(`❌ Lead ${leadTarget.id} sin teléfono`);
      return;
    }

    // Enviar mensaje al lead
    console.log(`📤 Enviando follow-up a ${leadName} (${leadPhone})...`);
    try {
      const sendResult = await ctx.meta.sendWhatsAppMessage(leadPhone, pending.mensaje);
      console.log(`📤 Resultado envío a ${leadPhone}:`, JSON.stringify(sendResult));
    } catch (sendError: any) {
      console.error(`❌ Error enviando a ${leadPhone}:`, sendError?.message || sendError);
      // Intentar con template si falla (fuera de ventana 24h)
      await ctx.meta.sendWhatsAppMessage(from, `⚠️ No pude enviar a ${leadName} - puede estar fuera de ventana 24h.\n\nEl lead debe escribir primero para poder enviarle mensajes.`);
      return;
    }

    // Actualizar status
    notas.pending_followup = { ...pending, status: 'approved', approved_at: new Date().toISOString() };
    await ctx.supabase.client.from('leads').update({ notes: notas }).eq('id', leadTarget.id);

    await ctx.meta.sendWhatsAppMessage(from, `✅ Follow-up enviado a *${leadName}* (${leadPhone})\n\n"${pending.mensaje.substring(0, 100)}..."`);
    console.log(`✅ Follow-up aprobado por ${nombre} para ${leadName} (${leadPhone})`);

  } catch (error) {
    console.error('Error aprobando follow-up:', error);
    await ctx.meta.sendWhatsAppMessage(from, 'Error al aprobar. Intenta de nuevo.');
  }
}
export async function vendedorCancelarFollowup(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
  try {
    // Buscar lead por nombre
    const normalizado = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const { data: leads } = await ctx.supabase.client
      .from('leads')
      .select('id, name, notes')
      .eq('assigned_to', vendedor.id)
      .not('notes->pending_followup', 'is', null);

    if (!leads || leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from, `📭 No tienes follow-ups pendientes.`);
      return;
    }

    const leadTarget = leads.find(l => {
      const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return leadNombre.includes(normalizado) || normalizado.includes(leadNombre.split(' ')[0]);
    });

    if (!leadTarget) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ No encontré follow-up pendiente para "${nombreLead}".`);
      return;
    }

    const notas = typeof leadTarget.notes === 'object' ? leadTarget.notes : {};
    notas.pending_followup = { ...notas.pending_followup, status: 'cancelled', cancelled_at: new Date().toISOString() };
    await ctx.supabase.client.from('leads').update({ notes: notas }).eq('id', leadTarget.id);

    await ctx.meta.sendWhatsAppMessage(from, `🚫 Follow-up cancelado para *${leadTarget.name}*.\nNo se enviará mensaje.`);
    console.log(`🚫 Follow-up cancelado por ${nombre} para ${leadTarget.name}`);

  } catch (error) {
    console.error('Error cancelando follow-up:', error);
    await ctx.meta.sendWhatsAppMessage(from, 'Error al cancelar. Intenta de nuevo.');
  }
}
export async function vendedorEditarFollowup(ctx: HandlerContext, handler: any, from: string, nombreLead: string, nuevoMensaje: string, vendedor: any, nombre: string): Promise<void> {
  try {
    // Buscar lead por nombre
    const normalizado = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const { data: leads } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .eq('assigned_to', vendedor.id)
      .not('notes->pending_followup', 'is', null);

    if (!leads || leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from, `📭 No tienes follow-ups pendientes.`);
      return;
    }

    const leadTarget = leads.find(l => {
      const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return leadNombre.includes(normalizado) || normalizado.includes(leadNombre.split(' ')[0]);
    });

    if (!leadTarget) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ No encontré follow-up pendiente para "${nombreLead}".`);
      return;
    }

    const notas = typeof leadTarget.notes === 'object' ? leadTarget.notes : {};
    const pending = notas.pending_followup;

    // Enviar mensaje personalizado del vendedor
    const phoneLimpio = (leadTarget.phone || '').replace(/\D/g, '');
    await ctx.meta.sendWhatsAppMessage(phoneLimpio, nuevoMensaje);

    // Actualizar status
    notas.pending_followup = {
      ...pending,
      status: 'edited',
      mensaje_original: pending.mensaje,
      mensaje_enviado: nuevoMensaje,
      edited_at: new Date().toISOString()
    };
    await ctx.supabase.client.from('leads').update({ notes: notas }).eq('id', leadTarget.id);

    await ctx.meta.sendWhatsAppMessage(from, `✅ Mensaje editado enviado a *${leadTarget.name}*\n\n"${nuevoMensaje.substring(0, 100)}..."`);
    console.log(`✏️ Follow-up editado por ${nombre} para ${leadTarget.name}`);

  } catch (error) {
    console.error('Error editando follow-up:', error);
    await ctx.meta.sendWhatsAppMessage(from, 'Error al editar. Intenta de nuevo.');
  }
}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AYUDA CONTEXTUAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorAyudaContextual(ctx: HandlerContext, handler: any, from: string, body: string, nombre: string): Promise<void> {
  const msg = body.toLowerCase();
  
  if (msg.includes('cita') && (msg.includes('agend') || msg.includes('crear') || msg.includes('hago'))) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `📅 *Para agendar cita escribe:*\n\n"Cita con [nombre] [día] [hora] en [desarrollo]"\n\n*Ejemplos:*\n• "Cita con Ana mañana 10am en Distrito Falco"\n• "Agendar Juan viernes 3pm en Los Encinos"\n\n*Si el lead es nuevo:*\n• "Crear Ana García 5512345678"`
    );
    return;
  }
  
  if (msg.includes('cancel')) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `❌’ *Para cancelar cita escribe:*\n\n"Cancelar cita con [nombre]"\n\n*Ejemplo:*\n• "Cancelar cita con Ana"`
    );
    return;
  }
  
  if (msg.includes('reagend') || msg.includes('mover') || msg.includes('cambiar')) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `👋ž *Para reagendar cita escribe:*\n\n"Reagendar [nombre] para [día] [hora]"\n\n*Ejemplo:*\n• "Reagendar Ana para lunes 3pm"`
    );
    return;
  }
  
  if (msg.includes('nota') || msg.includes('apunte')) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `📝 *Para agregar nota escribe:*\n\n"Nota [nombre]: [texto]"\n\n*Ejemplos:*\n• "Nota Juan: le interesa jardín"\n• "Apunte María: presupuesto 2M"\n\n*Para ver notas:*\n• "Notas de Juan"`
    );
    return;
  }
  
  if (msg.includes('cerr') || msg.includes('venta') || msg.includes('vend')) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `🎉 *Para cerrar venta escribe:*\n\n"Cerré venta con [nombre]"\n\n*Ejemplo:*\n• "Cerré venta con Juan García"`
    );
    return;
  }
  
  if (msg.includes('etapa') || msg.includes('avanz') || msg.includes('mover lead')) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `📊 *Para cambiar etapa escribe:*\n\n"[nombre] pasó a [etapa]"\n\n*Etapas:* contactado, cita agendada, visitó, negociación, cierre\n\n*Ejemplo:*\n• "Juan pasó a negociación"`
    );
    return;
  }
  
  if (msg.includes('lead') && msg.includes('crear')) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `👤 *Para crear lead nuevo escribe:*\n\n"Crear [nombre] [teléfono]"\n\n*Ejemplo:*\n• "Crear Ana García 5512345678"`
    );
    return;
  }
  
  // Default: mostrar todo
  await ctx.twilio.sendWhatsAppMessage(from,
    `🤝 ¿Qué necesitas saber ${nombre}?\n\n• ¿Cómo agendo cita?\n• ¿Cómo cancelo cita?\n• ¿Cómo agrego nota?\n• ¿Cómo cierro venta?\n• ¿Cómo cambio etapa?\n• ¿Cómo creo lead?\n\nPregúntame cualquiera 👨 `
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CREAR LEAD NUEVO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorCrearLead(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const parsed = vendorService.parseCrearLead(body);

    if (!parsed) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatCrearLeadAyuda());
      return;
    }

    const result = await vendorService.crearLead(parsed.nombre, parsed.telefono, parsed.interes, vendedor.id);

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || '❌ Error al crear lead.');
      return;
    }

    const mensaje = vendorService.formatCrearLeadExito(parsed.nombre, parsed.telefono, parsed.interes);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error en vendedorCrearLead:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al crear lead. Intenta de nuevo.');
  }
}

// ═══════════════════════════════════════════════════════════════
// VENDEDOR ASIGNAR HIPOTECA A LEAD EXISTENTE
// Formato: "hipoteca Juan" - busca lead existente y le asigna asesor
// ═══════════════════════════════════════════════════════════════
export async function vendedorAsignarHipoteca(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string, teamMembers: any[]): Promise<void> {
  console.log('🏦 vendedorAsignarHipoteca llamado con:', body);

  // Extraer nombre del lead: "hipoteca Juan García"
  const match = body.match(/hipoteca\s+(.+)/i);
  if (!match) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `🏦 *Asignar hipoteca a lead:*\n\n` +
      `📝 *"hipoteca Juan García"*\n\n` +
      `Se asigna asesor automáticamente.`
    );
    return;
  }

  const nombreBusqueda = match[1].trim();

  // Buscar lead existente del vendedor
  const leads = await findLeadByName(ctx.supabase, nombreBusqueda, {
    vendedorId: vendedor.id, select: 'id, name, phone, needs_mortgage', limit: 5
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `❌ No encontré ningún lead tuyo con el nombre *"${nombreBusqueda}"*`
    );
    return;
  }

  // Si hay múltiples leads, mostrar opciones
  if (leads.length > 1) {
    const notesData = JSON.stringify({
      pending_hipoteca_selection: {
        leads: leads.map((l: any) => ({ id: l.id, name: l.name, phone: l.phone })),
        asked_at: new Date().toISOString()
      }
    });

    await ctx.supabase.client
      .from('team_members')
      .update({ notes: notesData })
      .eq('id', vendedor.id);

    let msg = `📋 Encontré *${leads.length} leads* con ese nombre:\n\n`;
    leads.forEach((l: any, i: number) => {
      const tel = l.phone?.replace(/\D/g, '').slice(-10) || 'sin tel';
      msg += `${i + 1}️⃣ *${l.name}* - ${tel}\n`;
    });
    msg += `\n💡 Responde con el número (1, 2, etc.)`;
    await ctx.twilio.sendWhatsAppMessage(from, msg);
    return;
  }

  // Un solo lead encontrado - asignar hipoteca
  const leadEncontrado = leads[0];
  await asignarHipotecaALead(ctx, handler, from, leadEncontrado, vendedor, teamMembers);
}

// Función auxiliar para asignar hipoteca a un lead (usa MortgageService)
export async function asignarHipotecaALead(ctx: HandlerContext, handler: any, from: string, lead: any, vendedor: any, teamMembers: any[]): Promise<void> {
  const mortgageService: any = new MortgageService(ctx.supabase);
  const result = await mortgageService.assignMortgageToLead(lead, teamMembers);

  // Si ya tiene hipoteca asignada
  if (result.alreadyAssigned && result.existingApp) {
    await ctx.twilio.sendWhatsAppMessage(from,
      `⚠️ *${lead.name}* ya tiene hipoteca asignada.\n` +
      `🏦 Asesor: ${result.existingApp.team_members?.name || 'Sin asesor'}\n` +
      `📊 Estado: ${result.existingApp.status}`
    );
    return;
  }

  // Notificar al asesor si fue asignado y está activo
  if (result.asesor?.phone && result.asesor?.is_active !== false) {
    const aPhone = result.asesor.phone.replace(/[^0-9]/g, '');
    const aFormatted = aPhone.startsWith('52') ? aPhone : '52' + aPhone.slice(-10);
    await ctx.twilio.sendWhatsAppMessage(handler.formatPhoneMX(aFormatted),
      `🏦 *NUEVO LEAD HIPOTECARIO*\n\n` +
      `👤 *${lead.name}*\n` +
      `📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n` +
      `👔 Vendedor: ${vendedor.name}\n\n` +
      `💡 El vendedor ${vendedor.name} te asignó este lead para crédito hipotecario.`
    );
    console.log('📤 Asesor notificado:', result.asesor.name);
  }

  // Confirmar al vendedor
  const msg = mortgageService.formatAssignmentConfirmation(lead, result.asesor);
  await ctx.twilio.sendWhatsAppMessage(from, `✅ ${msg}`);
  console.log('✅ Hipoteca asignada a lead:', lead.name, result.asesor ? `→ asesor ${result.asesor.name}` : '');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENDAR CITA COMPLETA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorAgendarCitaCompleta(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const schedulingService = new AppointmentSchedulingService(ctx.supabase, ctx.calendar);

    const result = await schedulingService.agendarCitaCompleto(body, vendedor);

    if (result.needsHelp) {
      await ctx.twilio.sendWhatsAppMessage(from, schedulingService.getMensajeAyudaAgendar());
      return;
    }
    if (result.needsPhone) {
      await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatAgendarCitaNeedsPhone(result.nombreLead!));
      return;
    }
    if (result.multipleLeads) {
      // Guardar estado pendiente para selección
      const { data: vendedorActual } = await ctx.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .single();

      // SIEMPRE sanitizar notas antes de spread para evitar corrupción
      const notasActuales = sanitizeNotes(vendedorActual?.notes);
      await ctx.supabase.client
        .from('team_members')
        .update({
          notes: {
            ...notasActuales,
            pending_agendar_cita: {
              leads: result.multipleLeads,
              dia: result.dia,
              hora: result.hora,
              minutos: result.minutos,
              ampm: result.ampm,
              desarrollo: result.desarrollo
            }
          }
        })
        .eq('id', vendedor.id);

      await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatMultipleLeadsCita(result.multipleLeads));
      return;
    }
    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatAgendarCitaExito(result));

    // Guardar estado para notificación al lead (si tiene teléfono)
    if (result.leadPhone) {
      const { data: vendedorActualNotify } = await ctx.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .single();

      const notesToSave = sanitizeNotes(vendedorActualNotify?.notes);
      notesToSave.pending_agendar_notify = {
        lead_id: result.appointmentId,  // En este caso no tenemos lead_id directo
        lead_name: result.leadName,
        lead_phone: result.leadPhone,
        fecha: result.fecha,
        hora: result.hora,
        ubicacion: result.ubicacion,
        gpsLink: result.gpsLink,
        timestamp: Date.now()
      };
      await ctx.supabase.client
        .from('team_members')
        .update({ notes: notesToSave })
        .eq('id', vendedor.id);
    }
  } catch (error) {
    console.error('Error en agendarCitaCompleta:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al agendar cita. Intenta de nuevo.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CANCELAR CITA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorCancelarCita(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const schedulingService = new AppointmentSchedulingService(ctx.supabase, ctx.calendar);

    const nombreLead = schedulingService.parseCancelarCita(body);
    if (!nombreLead) {
      await ctx.twilio.sendWhatsAppMessage(from, schedulingService.getMensajeAyudaCancelar());
      return;
    }

    const result = await schedulingService.cancelarCitaCompleto(nombreLead, vendedor);

    if (result.multipleLeads) {
      // Guardar estado para selección numérica (sanitizar para evitar corrupción)
      let rawNotes = vendedor.notes;
      if (typeof rawNotes === 'string') {
        try { rawNotes = JSON.parse(rawNotes); } catch (e) { rawNotes = {}; }
      }
      const notes = sanitizeNotes(rawNotes);
      notes.pending_cita_action = {
        action: 'cancelar',
        leads: result.multipleLeads,
        timestamp: new Date().toISOString()
      };
      await ctx.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', vendedor.id);

      let msg = `🤝 Encontré ${result.multipleLeads.length} leads:\n\n`;
      result.multipleLeads.forEach((l: any, i: number) => {
        msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
      });
      msg += `\nResponde con el *número* para cancelar.`;
      await ctx.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error}`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatCancelarCitaExito(result));
  } catch (error) {
    console.error('Error cancelando cita:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al cancelar cita.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REAGENDAR CITA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorReagendarCita(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const schedulingService = new AppointmentSchedulingService(ctx.supabase, ctx.calendar);

    const result = await schedulingService.reagendarCitaCompleto(body, vendedor);

    if (result.needsHelp) {
      await ctx.twilio.sendWhatsAppMessage(from, schedulingService.getMensajeAyudaReagendar());
      return;
    }
    if (result.needsDateTime) {
      await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatReagendarNeedsDateTime(result.nombreLead!));
      return;
    }
    if (result.multipleLeads) {
      let msg = `🤝 Encontré ${result.multipleLeads.length} leads:\n\n`;
      result.multipleLeads.forEach((l: any, i: number) => {
        msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
      });
      // Guardar contexto para procesar la selección (sanitizar para evitar corrupción)
      const { data: vendedorData } = await ctx.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .single();
      const currentNotes = sanitizeNotes(vendedorData?.notes);
      await ctx.supabase.client
        .from('team_members')
        .update({
          notes: {
            ...currentNotes,
            pending_reagendar_selection: {
              leads: result.multipleLeads.map((l: any) => ({ id: l.id, name: l.name })),
              original_body: body,
              created_at: new Date().toISOString()
            }
          }
        })
        .eq('id', vendedor.id);
      await ctx.twilio.sendWhatsAppMessage(from, msg);
      return;
    }
    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error}`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, schedulingService.formatReagendarCitaExito(result));

    // Guardar estado para notificación al lead (si tiene teléfono)
    if (result.leadPhone) {
      const { data: vendedorData } = await ctx.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .single();
      const currentNotes = sanitizeNotes(vendedorData?.notes);
      await ctx.supabase.client
        .from('team_members')
        .update({
          notes: {
            ...currentNotes,
            pending_reagendar_notify: {
              lead_id: result.leadId,
              lead_name: result.leadName,
              lead_phone: result.leadPhone,
              fecha: result.nuevaFecha,
              hora: result.nuevaHora,
              timestamp: Date.now()
            }
          }
        })
        .eq('id', vendedor.id);
    }
  } catch (error) {
    console.error('Error reagendando cita:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al reagendar cita.');
  }
}

// Enviar notificación de reagendado al lead
export async function enviarNotificacionReagendar(ctx: HandlerContext, handler: any, from: string, vendedor: any): Promise<void> {
  const appointmentService = new AppointmentService(ctx.supabase, ctx.calendar, ctx.twilio);
  const result = await appointmentService.getLeadWithPendingReagendar(vendedor.id);

  if (!result) {
    await ctx.twilio.sendWhatsAppMessage(from, '⚠️ No hay citas reagendadas pendientes de notificar.');
    return;
  }

  const { lead, reagendar } = result;
  if (!lead.phone) {
    await ctx.twilio.sendWhatsAppMessage(from, '⚠️ El lead no tiene teléfono registrado.');
    return;
  }

  try {
    const leadPhone = handler.formatPhoneMX(lead.phone);
    const msgLead = appointmentService.formatRescheduleMessage(lead, reagendar);
    await ctx.twilio.sendWhatsAppMessage(leadPhone, msgLead);
    await appointmentService.updateLeadAfterRescheduleNotification(lead.id, lead.notes);
    await ctx.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${lead.name}*\n\n📱 ${formatPhoneForDisplay(lead.phone)}`);
  } catch (error) {
    console.error('❌ Error enviando notificación:', error);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error enviando notificación: ${error}`);
  }
}

// Cancelar notificación de reagendado pendiente
export async function cancelarNotificacionReagendar(ctx: HandlerContext, handler: any, from: string, vendedor: any): Promise<void> {
  const appointmentService = new AppointmentService(ctx.supabase, ctx.calendar, ctx.twilio);
  const result = await appointmentService.cancelPendingReagendar(vendedor.id);
  if (result) {
    await ctx.twilio.sendWhatsAppMessage(from, `👍 No se notificó a ${result.lead.name}.`);
  } else {
    await ctx.twilio.sendWhatsAppMessage(from, '👍 Entendido.');
  }
}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IA HÍÍBRIDA - Clasificar intent cuando no matchea palabras
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorIntentIA(ctx: HandlerContext, handler: any, from: string, body: string, vendedor: any, nombre: string): Promise<void> {
  console.log(`🧠 [IA-INTENT] Vendedor ${nombre} escribió: "${body.substring(0, 50)}..."`);

  try {
    // Ir directo a respuesta inteligente - Claude entenderá el intent y sugerirá el comando correcto
    console.log(`🧠 [IA-INTENT] Llamando a generateSmartResponse...`);
    await vendedorRespuestaInteligente(ctx, handler, from, body, vendedor, nombre);
  } catch (error) {
    console.error('❌ [IA-INTENT] Error:', error);
    await vendedorAyuda(ctx, handler, from, nombre);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESPUESTA INTELIGENTE CON CLAUDE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorRespuestaInteligente(ctx: HandlerContext, handler: any, from: string, mensaje: string, vendedor: any, nombre: string): Promise<void> {
  console.log(`🤖 [SMART-RESPONSE] Iniciando para ${nombre}, mensaje: "${mensaje.substring(0, 50)}..."`);
  console.log(`🤖 [SMART-RESPONSE] Claude disponible: ${!!ctx.claude}`);

  try {
    const iaService = new IACoachingService(ctx.supabase, ctx.claude);
    console.log(`🤖 [SMART-RESPONSE] IACoachingService creado, llamando generateSmartResponse...`);
    const respuesta = await iaService.generateSmartResponse(mensaje, vendedor, nombre);
    console.log(`🤖 [SMART-RESPONSE] Respuesta obtenida (${respuesta?.length || 0} chars): "${respuesta?.substring(0, 100)}..."`);
    await ctx.twilio.sendWhatsAppMessage(from, respuesta);
    console.log(`🤖 [SMART-RESPONSE] ✅ Mensaje enviado`);
  } catch (error) {
    console.error('❌ [SMART-RESPONSE] Error:', error);
    await vendedorAyuda(ctx, handler, from, nombre);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COACHING IA - Análisis y sugerencias por lead
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorCoaching(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const iaService = new IACoachingService(ctx.supabase, ctx.claude);
    const result = await iaService.getCoaching(nombreLead, vendedor);

    if (!result.success) {
      await ctx.twilio.sendWhatsAppMessage(from, result.error || iaService.getMensajeAyudaCoaching());
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, result.mensaje!);
  } catch (error) {
    console.error('❌ Error en coaching:', error);
    await ctx.twilio.sendWhatsAppMessage(from,
      `❌ Error al analizar el lead. Intenta de nuevo.\n\nUso: *coach [nombre del lead]*`
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VER HISTORIAL - Muestra conversación completa con un lead
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorVerHistorial(ctx: HandlerContext, handler: any, from: string, identificador: string, vendedor: any): Promise<void> {
  try {
    // Buscar lead por nombre o teléfono
    const idLimpio = identificador.replace(/[-\s]/g, '');
    const esTelefono = /^\d{10,15}$/.test(idLimpio);

    console.log(`🔍 VER HISTORIAL: idLimpio="${idLimpio}" esTelefono=${esTelefono} vendedor.id="${vendedor.id}"`);

    let leads: any[] = [];

    // Variable para debug
    let queryDebug = '';

    if (esTelefono) {
      queryDebug += `esTel=true, idLimpio=${idLimpio}`;

      // Buscar por teléfono
      const { data: foundLeads, error: err1 } = await ctx.supabase.client
        .from('leads')
        .select('id, name, phone, property_interest, lead_score, status, conversation_history, created_at, notes, assigned_to')
        .ilike('phone', `%${idLimpio}%`)
        .limit(1);

      queryDebug += `, Q1=${foundLeads?.length || 0}/${err1?.message || 'ok'}`;

      if (foundLeads && foundLeads.length > 0) {
        leads = foundLeads;
      }
    } else {
      queryDebug += `esTel=false`;
      // Buscar por nombre
      leads = await findLeadByName(ctx.supabase, identificador, {
        vendedorId: vendedor.id, select: 'id, name, phone, property_interest, lead_score, status, conversation_history, created_at, notes, assigned_to', limit: 1
      });
    }

    console.log(`🔍 VER HISTORIAL FINAL: encontrados=${leads?.length || 0}`);

    if (!leads || leads.length === 0) {
      // DEBUG: Enviar info de diagnóstico
      const { data: debugLeads } = await ctx.supabase.client
        .from('leads')
        .select('id, phone, assigned_to')
        .ilike('phone', `%${idLimpio}%`)
        .limit(1);

      const debugInfo = debugLeads?.[0]
        ? `\n\n🔧 DEBUG: ${queryDebug}\n📍 Lead existe: phone=${debugLeads[0].phone}`
        : `\n\n🔧 DEBUG: ${queryDebug}\n📍 No existe lead`;

      await ctx.twilio.sendWhatsAppMessage(from,
        `❌ No encontré un lead con "${identificador}".${debugInfo}`
      );
      return;
    }

    const lead = leads[0];
    const historial = Array.isArray(lead.conversation_history) ? lead.conversation_history : [];

    // Formatear teléfono para mostrar
    const scoreEmoji = lead.lead_score >= 70 ? '🔥' : lead.lead_score >= 40 ? '🟡' : '🔵';

    // Construir mensaje de historial
    let msg = `📋 *Historial con ${lead.name || 'Lead'}*\n`;
    msg += `📱 ${formatPhoneForDisplay(lead.phone)} | ${scoreEmoji} Score: ${lead.lead_score || 0}\n`;
    msg += `🏠 ${lead.property_interest || 'Sin desarrollo'} | ${lead.status || 'new'}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (historial.length === 0) {
      msg += `_No hay mensajes registrados aún._\n\n`;
    } else {
      // Mostrar últimos 10 mensajes (para no exceder límite de WhatsApp)
      const ultimosMensajes = historial.slice(-10);

      for (const m of ultimosMensajes) {
        const esLead = m.role === 'user' || m.from === 'lead' || m.from === 'user';
        const contenido = (m.content || m.message || '').substring(0, 150);
        const hora = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';

        if (esLead) {
          msg += `💬 *Lead* ${hora ? `(${hora})` : ''}:\n"${contenido}${contenido.length >= 150 ? '...' : ''}"\n\n`;
        } else {
          msg += `🤖 *SARA* ${hora ? `(${hora})` : ''}:\n"${contenido}${contenido.length >= 150 ? '...' : ''}"\n\n`;
        }
      }

      if (historial.length > 10) {
        msg += `_...y ${historial.length - 10} mensajes anteriores_\n\n`;
      }
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📝 *Responde aquí* para enviarle mensaje\n`;
    msg += `→ *bridge ${lead.name?.split(' ')[0] || 'lead'}* para chat directo`;

    // Guardar pending_message_to_lead en el vendedor para que el siguiente mensaje se envíe al lead
    const vendedorNotes = typeof vendedor.notes === 'object' ? vendedor.notes : {};
    await ctx.supabase.client.from('team_members')
      .update({
        notes: {
          ...vendedorNotes,
          pending_message_to_lead: {
            lead_id: lead.id,
            lead_name: lead.name || 'Lead',
            lead_phone: lead.phone,
            timestamp: new Date().toISOString(),
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutos
          }
        }
      })
      .eq('id', vendedor.id);

    await ctx.twilio.sendWhatsAppMessage(from, msg);
    console.log(`📋 Historial mostrado a ${vendedor.name} para lead ${lead.phone} - pending_message activado`);

  } catch (error) {
    console.error('❌ Error en verHistorial:', error);
    await ctx.twilio.sendWhatsAppMessage(from,
      `❌ Error al buscar historial. Intenta de nuevo.\n\nUso: *ver [nombre o teléfono]*`
    );
  }
}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIRMACIÓN DE CITA AL LEAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function hayReagendarPendiente(ctx: HandlerContext, handler: any, vendedorId: string): Promise<boolean> {
  // Buscar leads con pending_reagendar del vendedor actual
  // Usar filtro JSON para buscar específicamente leads con pending_reagendar
  const { data, error } = await ctx.supabase.client
    .from('leads')
    .select('id, name, notes')
    .not('notes->pending_reagendar', 'is', null)
    .limit(100);

  console.log('🔍 hayReagendarPendiente - buscando para vendedor:', vendedorId);
  console.log('🔍 hayReagendarPendiente - leads con pending_reagendar:', data?.length, 'error:', error?.message || 'ninguno');

  if (data?.length) {
    data.forEach((l: any) => {
      console.log('🔍 Lead con pending_reagendar:', l.name, 'vendedor_id:', l.notes?.pending_reagendar?.vendedor_id);
    });
  }

  const conReagendar = data?.filter((l: any) => {
    return l.notes?.pending_reagendar?.vendedor_id === vendedorId;
  });

  console.log('🔍 hayReagendarPendiente - encontrados para este vendedor:', conReagendar?.length);
  return conReagendar && conReagendar.length > 0;
}
export async function hayConfirmacionPendiente(ctx: HandlerContext, handler: any, vendedorId: string): Promise<boolean> {
  // Buscar leads con pending_confirmation del vendedor actual
  const { data } = await ctx.supabase.client
    .from('leads')
    .select('id, notes')
    .not('notes->pending_confirmation', 'is', null)
    .limit(10);

  // Filtrar por vendedor_id en el JSON
  const conConfirmacion = data?.filter((l: any) =>
    l.notes?.pending_confirmation?.vendedor_id === vendedorId
  );

  return conConfirmacion && conConfirmacion.length > 0;
}
export async function enviarConfirmacionAlLead(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  const appointmentService = new AppointmentService(ctx.supabase, ctx.calendar, ctx.twilio);

  // Buscar lead con confirmación pendiente
  const result = await appointmentService.getLeadWithPendingConfirmation(vendedor.id);
  if (!result) {
    await ctx.twilio.sendWhatsAppMessage(from, '⚠️ No encontré cita pendiente de confirmar.');
    return;
  }

  const { lead, conf } = result;
  if (!lead.phone) {
    await ctx.twilio.sendWhatsAppMessage(from, '⚠️ El lead no tiene teléfono registrado.');
    return;
  }

  const leadPhone = lead.phone.replace(/\D/g, '').slice(-10);
  const leadActivo = appointmentService.isLeadActiveRecently(lead);
  console.log('📱 Lead activo recientemente:', leadActivo);

  try {
    if (leadActivo) {
      // Mensaje normal (lead activo en 24h)
      console.log('📤 Enviando mensaje NORMAL');
      const msgLead = appointmentService.formatConfirmationMessage(lead, conf);
      await ctx.meta.sendWhatsAppMessage(leadPhone, msgLead);
      await appointmentService.updateLeadAfterConfirmation(lead.id, true, lead.notes);
      await ctx.twilio.sendWhatsAppMessage(from, appointmentService.formatConfirmationSentToVendor(lead.name, lead.phone, false) + `\n\n¡Listo ${nombre}!`);
    } else {
      // Template (lead inactivo)
      console.log('📤 Enviando TEMPLATE');
      const templateComponents = appointmentService.buildTemplateComponents(lead, conf);
      await ctx.meta.sendTemplate(leadPhone, 'appointment_confirmation_v2', 'es', templateComponents);

      const extraDetails = appointmentService.formatExtraDetails(conf);
      if (extraDetails) await ctx.meta.sendWhatsAppMessage(leadPhone, extraDetails);

      await appointmentService.updateLeadAfterConfirmation(lead.id, false, lead.notes);
      await ctx.twilio.sendWhatsAppMessage(from, appointmentService.formatConfirmationSentToVendor(lead.name, lead.phone, true) + `\n\n¡Listo ${nombre}!`);
    }

    if (conf.lead_id) await appointmentService.markAppointmentConfirmationSent(conf.lead_id);

  } catch (error: any) {
    console.error('Error enviando confirmación:', error);
    // Fallback: mensaje normal
    try {
      const msgLead = appointmentService.formatConfirmationMessage(lead, conf);
      await ctx.twilio.sendWhatsAppMessage(leadPhone, msgLead);
      await appointmentService.updateLeadAfterConfirmation(lead.id, true, lead.notes);
      await ctx.twilio.sendWhatsAppMessage(from, `✅ *Confirmación enviada a ${lead.name}* (mensaje normal)\n\n📱 ${formatPhoneForDisplay(lead.phone)}`);
    } catch (e2) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No pude enviar a ${lead.name}. Verifica el número: ${formatPhoneForDisplay(lead.phone)}`);
    }
  }
}
export async function cancelarConfirmacionPendiente(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  const appointmentService = new AppointmentService(ctx.supabase, ctx.calendar, ctx.twilio);
  const result = await appointmentService.cancelPendingConfirmation(vendedor.id);
  if (result) {
    await ctx.twilio.sendWhatsAppMessage(from, `📌 Ok ${nombre}, tú le avisas a ${result.lead.name}.`);
  }
}
export async function vendedorPropiedades(ctx: HandlerContext, handler: any, from: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const props = await vendorService.getPropiedadesDisponibles();
    const mensaje = vendorService.formatPropiedadesDisponibles(props);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error en propiedades:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener propiedades.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MÉTODOS VENDEDOR - AYUDA, CITAS, BRIEFING, META, RESUMEN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorAyuda(ctx: HandlerContext, handler: any, from: string, nombre: string): Promise<void> {
  const mensaje = `*📋 COMANDOS - ${nombre}*\n\n` +
    `*📊 REPORTES*\n` +
    `• *hoy* - Resumen del día\n` +
    `• *briefing* - Briefing completo\n` +
    `• *mis leads* - Tus leads\n` +
    `• *hot* - Leads calientes\n` +
    `• *pendientes* - Sin seguimiento\n` +
    `• *meta* - Avance de meta\n\n` +
    `*📅 CITAS*\n` +
    `• *citas* / *citas mañana*\n` +
    `• *agendar cita [lead] [fecha] [hora]*\n` +
    `• *reagendar [lead] [fecha] [hora]*\n` +
    `• *cancelar cita [lead]*\n\n` +
    `*🔄 GESTIÓN LEADS*\n` +
    `• *adelante/atrás [lead]* - Mover funnel\n` +
    `• *nota [lead]: [texto]* - Agregar nota\n` +
    `• *notas [lead]* - Ver notas\n` +
    `• *quién es [lead]* - Info\n` +
    `• *historial [lead]* - Conversación\n` +
    `• *perdido [lead]* - Marcar perdido\n\n` +
    `*➕ CREAR/ASIGNAR*\n` +
    `• *nuevo lead [nombre] [tel] [desarrollo]*\n` +
    `• *crédito [lead]* - Pasar a asesor\n` +
    `• *asignar asesor [lead]*\n\n` +
    `*💬 COMUNICACIÓN*\n` +
    `• *bridge [lead]* - Chat directo 6min\n` +
    `• *#cerrar* / *#mas* - Bridge\n` +
    `• *llamar [lead]* - Ver teléfono\n` +
    `• *llamar ia [lead]* - SARA llama al lead 📞🤖\n` +
    `• *recordar llamar [lead] [fecha]*\n` +
    `• *contactar [lead]* - Template 24h\n\n` +
    `*💰 OFERTAS*\n` +
    `• *cotizar [lead] [precio]*\n` +
    `• *enviar oferta [lead]*\n` +
    `• *ofertas* - Ver activas\n` +
    `• *oferta aceptada/rechazada [lead]*\n\n` +
    `*🏠 RECURSOS*\n` +
    `• *brochure/ubicación/video [desarrollo]*\n\n` +
    `*✅ VENTAS*\n` +
    `• *cerrar venta [lead] [propiedad]*\n` +
    `• *apartado [lead] [propiedad]*\n\n` +
    `*🤖 IA*\n` +
    `• *coaching [lead]* - Consejos`;
  await ctx.meta.sendWhatsAppMessage(from, mensaje);
}
export async function vendedorCitasHoy(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    const citas = await vendorService.getCitasHoy(vendedor.id, esAdmin);
    const mensaje = vendorService.formatCitasHoy(citas, nombre, esAdmin);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error en citas hoy:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener citas.');
  }
}
export async function vendedorCitasManana(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    const citas = await vendorService.getCitasManana(vendedor.id, esAdmin);
    const mensaje = vendorService.formatCitasManana(citas, nombre, esAdmin);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error en citas mañana:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener citas.');
  }
}
export async function vendedorBriefing(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const data = await vendorService.getBriefing(vendedor.id);
    const mensaje = vendorService.formatBriefing(data, nombre);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error en briefing:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener briefing.');
  }
}
export async function vendedorMetaAvance(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);

    // Meta configurable: 1) del vendedor, 2) de system_config, 3) default 5
    let metaMensual = 5;
    if (vendedor.meta_mensual && vendedor.meta_mensual > 0) {
      metaMensual = vendedor.meta_mensual;
    } else {
      // Intentar obtener de system_config
      const { data: config } = await ctx.supabase.client
        .from('system_config')
        .select('value')
        .eq('key', 'meta_mensual_default')
        .single();
      if (config?.value) {
        metaMensual = parseInt(config.value) || 5;
      }
    }

    const data = await vendorService.getMetaAvance(vendedor.id, metaMensual);
    const mensaje = vendorService.formatMetaAvance(data, nombre);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error en meta avance:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener meta.');
  }
}

// ═══════════════════════════════════════════════════════════════════
// VENDEDOR: QUIEN ES [nombre] - Buscar info de lead
// ═══════════════════════════════════════════════════════════════════
export async function vendedorQuienEs(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any): Promise<void> {
  try {
    const esAdmin = ['admin', 'coordinador', 'ceo', 'director'].includes(vendedor.role?.toLowerCase() || '');

    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      vendedorId: esAdmin ? undefined : vendedor.id,
      select: 'id, name, phone, stage, status, created_at, notes', limit: 5
    });

    if (!leads || leads.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a "${nombreLead}" en tus leads.`);
      return;
    }

    if (leads.length === 1) {
      const l = leads[0];
      const feedback = formatVendorFeedback(l.notes);
      const msg = `👤 *${l.name}*\n\n` +
        `📱 Tel: ${l.phone ? formatPhoneForDisplay(l.phone) : 'No disponible'}\n` +
        `📌 Etapa: ${l.stage || l.status || 'Sin etapa'}\n` +
        (feedback ? `📝 ${feedback}\n` : '') +
        `📅 Registrado: ${new Date(l.created_at).toLocaleDateString('es-MX')}`;
      await ctx.twilio.sendWhatsAppMessage(from, msg);
    } else {
      let msg = `🔍 Encontré ${leads.length} leads:\n\n`;
      leads.forEach((l, i) => {
        const fb = formatVendorFeedback(l.notes, { compact: true });
        msg += `*${i + 1}.* ${l.name} (${l.stage || l.status || 'Sin etapa'})${fb ? ' ' + fb : ''}\n`;
      });
      await ctx.twilio.sendWhatsAppMessage(from, msg);
    }
  } catch (e) {
    console.log('Error en quien es:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al buscar "${nombreLead}".`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// VENDEDOR: BROCHURE [desarrollo] - Enviar brochure de desarrollo
// ═══════════════════════════════════════════════════════════════════
export async function vendedorEnviarBrochure(ctx: HandlerContext, handler: any, from: string, desarrollo: string, vendedor: any): Promise<void> {
  try {
    // Buscar por desarrollo O por nombre del modelo
    let { data: props } = await ctx.supabase.client
      .from('properties')
      .select('name, development, brochure_urls')
      .ilike('development', `%${desarrollo}%`)
      .not('brochure_urls', 'is', null)
      .limit(1);

    // Si no encuentra por desarrollo, buscar por nombre del modelo
    if (!props || props.length === 0) {
      const { data: byName } = await ctx.supabase.client
        .from('properties')
        .select('name, development, brochure_urls')
        .ilike('name', `%${desarrollo}%`)
        .not('brochure_urls', 'is', null)
        .limit(1);
      props = byName;
    }

    if (!props || props.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré brochure para "${desarrollo}".`);
      return;
    }

    const brochureRaw = props[0].brochure_urls;
    const brochureUrl = Array.isArray(brochureRaw) ? brochureRaw[0] : brochureRaw;

    if (!brochureUrl) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ "${desarrollo}" no tiene brochure configurado.`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, `📄 *Brochure ${props[0].development}:*\n${brochureUrl}`);
  } catch (e) {
    console.log('Error en brochure:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al obtener brochure.`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// VENDEDOR: UBICACION [desarrollo] - Enviar GPS del desarrollo
// ═══════════════════════════════════════════════════════════════════
export async function vendedorEnviarUbicacion(ctx: HandlerContext, handler: any, from: string, desarrollo: string, vendedor: any): Promise<void> {
  try {
    // Buscar por desarrollo O por nombre del modelo
    let { data: props } = await ctx.supabase.client
      .from('properties')
      .select('name, development, gps_link, address')
      .ilike('development', `%${desarrollo}%`)
      .not('gps_link', 'is', null)
      .limit(1);

    // Si no encuentra por desarrollo, buscar por nombre del modelo
    if (!props || props.length === 0) {
      const { data: byName } = await ctx.supabase.client
        .from('properties')
        .select('name, development, gps_link, address')
        .ilike('name', `%${desarrollo}%`)
        .not('gps_link', 'is', null)
        .limit(1);
      props = byName;
    }

    if (!props || props.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré ubicación para "${desarrollo}".`);
      return;
    }

    const prop = props[0];
    let msg = `📍 *Ubicación ${prop.development}:*\n`;
    if (prop.address) msg += `${prop.address}\n`;
    msg += `\n🗺️ ${prop.gps_link}`;

    await ctx.twilio.sendWhatsAppMessage(from, msg);
  } catch (e) {
    console.log('Error en ubicacion:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al obtener ubicación.`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// VENDEDOR: VIDEO [desarrollo] - Enviar video del desarrollo
// ═══════════════════════════════════════════════════════════════════
export async function vendedorEnviarVideo(ctx: HandlerContext, handler: any, from: string, desarrollo: string, vendedor: any): Promise<void> {
  try {
    // Buscar por desarrollo O por nombre del modelo
    let { data: props } = await ctx.supabase.client
      .from('properties')
      .select('name, development, youtube_link')
      .ilike('development', `%${desarrollo}%`)
      .not('youtube_link', 'is', null)
      .limit(1);

    // Si no encuentra por desarrollo, buscar por nombre del modelo
    if (!props || props.length === 0) {
      const { data: byName } = await ctx.supabase.client
        .from('properties')
        .select('name, development, youtube_link')
        .ilike('name', `%${desarrollo}%`)
        .not('youtube_link', 'is', null)
        .limit(1);
      props = byName;
    }

    if (!props || props.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré video para "${desarrollo}".`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, `🎬 *Video ${props[0].development}:*\n${props[0].youtube_link}`);
  } catch (e) {
    console.log('Error en video:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al obtener video.`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// VENDEDOR: PASAR LEAD A CREDITO/ASESOR HIPOTECARIO
// ═══════════════════════════════════════════════════════════════════
export async function vendedorPasarACredito(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any): Promise<void> {
  console.log(`🏦 Vendedor ${vendedor.name} pasa "${nombreLead}" a crédito`);

  try {
    // Buscar el lead
    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      vendedorId: vendedor.id, select: 'id, name, phone, email, property_interest, budget', limit: 5
    });

    if (!leads || leads.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré lead "${nombreLead}" en tus leads asignados.`);
      return;
    }

    // Si hay múltiples, usar el primero (o podrías pedir selección)
    const lead = leads[0];

    // Buscar asesor hipotecario disponible
    const { data: asesores } = await ctx.supabase.client
      .from('team_members')
      .select('id, name, phone, role')
      .or('role.ilike.%asesor%,role.ilike.%hipoteca%,role.ilike.%credito%,role.ilike.%crédito%')
      .limit(10);

    if (asesores.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No hay asesores hipotecarios disponibles.`);
      return;
    }

    // Usar el primer asesor disponible (puedes agregar round robin después)
    const asesor = asesores[0];

    // Actualizar lead con needs_mortgage y asesor_banco_id
    await ctx.supabase.client
      .from('leads')
      .update({
        needs_mortgage: true,
        asesor_banco_id: asesor.id,
        credit_status: 'pending_contact'
      })
      .eq('id', lead.id);

    // Notificar al vendedor
    await ctx.twilio.sendWhatsAppMessage(from,
      `✅ *Lead pasado a crédito*\n\n` +
      `👤 ${lead.name}\n` +
      `🏦 Asesor asignado: ${asesor.name}\n\n` +
      `El lead quedó marcado para seguimiento de crédito.`
    );

    // Notificar al asesor hipotecario
    const asesorPhone = asesor.phone?.replace(/\D/g, '');
    if (asesorPhone) {
      try {
        await ctx.twilio.sendWhatsAppMessage(asesorPhone,
          `🏦 *NUEVO LEAD PARA CRÉDITO*\n\n` +
          `👤 *${lead.name}*\n` +
          `📱 ${formatPhoneForDisplay(lead.phone)}\n` +
          `🏠 Interés: ${lead.property_interest || 'No especificado'}\n` +
          `👔 Vendedor: ${vendedor.name}\n\n` +
          `⏰ Contáctalo pronto.\n\n` +
          `💡 Escribe *leads* para ver tu lista completa.`
        );
        console.log(`📤 Notificación enviada a asesor: ${asesor.name}`);
      } catch (notifError) {
        console.error(`⚠️ Error notificando a asesor ${asesor.name}:`, notifError);
      }
    }

  } catch (e) {
    console.log('Error en pasarACredito:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al pasar lead a crédito.`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// VENDEDOR: NUEVO LEAD (se queda con el vendedor, no round robin)
// ═══════════════════════════════════════════════════════════════════
export async function vendedorNuevoLead(ctx: HandlerContext, handler: any, from: string, nombre: string, telefono: string, desarrollo: string | null, vendedor: any): Promise<void> {
  console.log(`➕ Vendedor ${vendedor.name} agrega lead: ${nombre} ${telefono} ${desarrollo || ''}`);

  try {
    // Normalizar teléfono (agregar 521 si es necesario)
    let phoneNormalized = telefono.replace(/\D/g, '');
    if (phoneNormalized.length === 10) {
      phoneNormalized = '521' + phoneNormalized;
    } else if (phoneNormalized.length === 12 && phoneNormalized.startsWith('52')) {
      phoneNormalized = '521' + phoneNormalized.slice(2);
    }

    // Verificar si ya existe un lead con ese teléfono
    const { data: existente } = await ctx.supabase.client
      .from('leads')
      .select('id, name, assigned_to')
      .eq('phone', phoneNormalized)
      .limit(1);

    if (existente && existente.length > 0) {
      const leadExistente = existente[0];
      // Verificar si ya es del vendedor
      if (leadExistente.assigned_to === vendedor.id) {
        // Si se proporciona desarrollo, actualizar property_interest
        if (desarrollo) {
          await ctx.supabase.client
            .from('leads')
            .update({ property_interest: desarrollo })
            .eq('id', leadExistente.id);

          await ctx.twilio.sendWhatsAppMessage(from,
            `✅ Lead actualizado:\n\n` +
            `👤 ${leadExistente.name}\n` +
            `📱 ${formatPhoneForDisplay(phoneNormalized)}\n` +
            `🏠 Interés: ${desarrollo}`
          );
        } else {
          await ctx.twilio.sendWhatsAppMessage(from,
            `⚠️ Este lead ya existe y es tuyo:\n\n` +
            `👤 ${leadExistente.name}\n` +
            `📱 ${formatPhoneForDisplay(phoneNormalized)}`
          );
        }
      } else {
        await ctx.twilio.sendWhatsAppMessage(from,
          `⚠️ Este teléfono ya está registrado con otro lead:\n\n` +
          `👤 ${leadExistente.name}\n\n` +
          `Contacta a tu coordinador si necesitas reasignación.`
        );
      }
      return;
    }

    // Crear el lead asignado al vendedor
    const { data: nuevoLead, error } = await ctx.supabase.client
      .from('leads')
      .insert({
        name: nombre,
        phone: phoneNormalized,
        property_interest: desarrollo || null,
        assigned_to: vendedor.id,
        captured_by: vendedor.id,
        created_by: vendedor.id,
        source: 'vendedor_directo',
        status: 'new',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.log('Error creando lead:', error);
      await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al crear lead: ${error.message}`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from,
      `✅ *Lead registrado*\n\n` +
      `👤 ${nombre}\n` +
      `📱 ${formatPhoneForDisplay(phoneNormalized)}\n` +
      (desarrollo ? `🏠 Interés: ${desarrollo}\n` : '') +
      `\n📌 El lead está asignado a ti.`
    );

  } catch (e) {
    console.log('Error en nuevoLead:', e);
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al registrar lead.`);
  }
}
export async function vendedorResumenLeads(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const data = await vendorService.getResumenLeads(vendedor.id);
    const mensaje = vendorService.formatResumenLeads(data, nombre);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error en resumen leads:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener resumen.');
  }
}

// HOT: Leads calientes
export async function vendedorLeadsHot(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    // Buscar leads con score >= 70 (calientes)
    const { data: leads, error } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, status, score, last_activity_at')
      .eq('assigned_to', vendedor.id)
      .gte('score', 70)
      .not('status', 'in', '("won","lost","dnc")')
      .order('score', { ascending: false })
      .limit(10);

    if (error) {
      console.log('Error obteniendo leads hot:', error);
      await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads calientes.');
      return;
    }

    if (!leads || leads.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `🔥 *${nombre}, no tienes leads calientes*\n\n` +
        `Los leads HOT tienen score ≥70.\n` +
        `Sigue dando seguimiento para calentar tus leads! 💪`
      );
      return;
    }

    let msg = `🔥 *LEADS CALIENTES* (${leads.length})\n`;
    msg += `_Score ≥70 - Listos para cerrar_\n\n`;

    leads.forEach((lead: any, i: number) => {
      msg += `${i + 1}. *${lead.name || 'Sin nombre'}* (${lead.score}🔥)\n`;
      msg += `   📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n`;
      msg += `   📊 Status: ${lead.status || 'new'}\n\n`;
    });

    msg += `_Escribe "contactar [nombre]" para dar seguimiento_`;

    await ctx.twilio.sendWhatsAppMessage(from, msg);
  } catch (e) {
    console.log('Error en leads hot:', e);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads calientes.');
  }
}

// PENDIENTES: Leads sin seguimiento reciente
export async function vendedorLeadsPendientes(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    // Buscar leads asignados sin actividad en los últimos 3 días
    const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: leads, error } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, status, last_activity_at, score')
      .eq('assigned_to', vendedor.id)
      .not('status', 'in', '("won","lost","dnc")')
      .or(`last_activity_at.is.null,last_activity_at.lt.${hace3Dias}`)
      .order('last_activity_at', { ascending: true, nullsFirst: true })
      .limit(10);

    if (error) {
      console.log('Error obteniendo pendientes:', error);
      await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads pendientes.');
      return;
    }

    if (!leads || leads.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `✅ *${nombre}, no tienes leads pendientes!*\n\n` +
        `Todos tus leads tienen seguimiento reciente. ¡Buen trabajo! 🎯`
      );
      return;
    }

    let msg = `⏰ *LEADS PENDIENTES DE SEGUIMIENTO*\n`;
    msg += `_${leads.length} lead(s) sin actividad en 3+ días_\n\n`;

    leads.forEach((lead: any, i: number) => {
      const diasSinActividad = lead.last_activity_at
        ? Math.floor((Date.now() - new Date(lead.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))
        : '∞';
      const temp = lead.score >= 70 ? '🔥' : lead.score >= 40 ? '🟡' : '🔵';
      msg += `${i + 1}. ${temp} *${lead.name || 'Sin nombre'}*\n`;
      msg += `   📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n`;
      msg += `   ⏱️ ${diasSinActividad} días sin actividad\n\n`;
    });

    msg += `_Escribe "contactar [nombre]" para iniciar seguimiento_`;

    await ctx.twilio.sendWhatsAppMessage(from, msg);
  } catch (e) {
    console.log('Error en leads pendientes:', e);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads pendientes.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OFERTAS / COTIZACIONES - Handlers de vendedor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crear oferta rápida para un lead
 * Comando: cotizar [nombre] [precio]
 */
export async function vendedorCotizar(ctx: HandlerContext, handler: any, from: string, nombreLead: string, precio: number, vendedor: any, nombreVendedor: string): Promise<void> {
  console.log(`💰 vendedorCotizar: ${nombreVendedor} cotiza $${precio} para ${nombreLead}`);

  try {
    // Buscar lead por nombre
    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      vendedorId: vendedor.id, select: 'id, name, phone, property_interest, assigned_to', limit: 5
    });

    if (!leads || leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from,
        `❌ No encontré ningún lead con nombre *${nombreLead}* en tu cartera.\n\n` +
        `Escribe *mis leads* para ver tus leads.`
      );
      return;
    }

    if (leads.length > 1) {
      let msg = `🔍 Encontré ${leads.length} leads:\n\n`;
      leads.forEach((l: any, i: number) => {
        msg += `${i + 1}. *${l.name}*\n`;
      });
      msg += `\n💡 Sé más específico con el nombre`;
      await ctx.meta.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];
    const desarrollo = lead.property_interest || 'Sin especificar';

    // Buscar propiedad si hay property_interest
    let propertyId: string | undefined = undefined;
    let propertyName = desarrollo;
    let listPrice = precio; // Por defecto el precio ofertado = precio lista

    if (lead.property_interest) {
      const { data: property } = await ctx.supabase.client
        .from('properties')
        .select('id, name, price, development')
        .or(`name.ilike.%${lead.property_interest}%,development.ilike.%${lead.property_interest}%`)
        .limit(1)
        .single();

      if (property) {
        propertyId = property.id;
        propertyName = property.name;
        listPrice = property.price || precio;
      }
    }

    // Crear oferta usando OfferTrackingService
    const offerService = new OfferTrackingService(ctx.supabase);
    const offerParams: CreateOfferParams = {
      lead_id: lead.id,
      property_id: propertyId,
      property_name: propertyName,
      development: desarrollo,
      list_price: listPrice,
      offered_price: precio,
      vendor_id: vendedor.id,
      expires_days: 7,
      notes: `Creada vía WhatsApp por ${nombreVendedor}`
    };

    const offer = await offerService.createOffer(offerParams);

    if (!offer) {
      await ctx.meta.sendWhatsAppMessage(from,
        `❌ Error al crear la oferta. Verifica que la tabla *offers* existe en Supabase.`
      );
      return;
    }

    // Calcular fecha de vencimiento
    const vencimiento = new Date(offer.expires_at!);
    const vencimientoStr = vencimiento.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long'
    });

    // Formatear precio
    const precioFmt = precio.toLocaleString('es-MX', { maximumFractionDigits: 0 });
    const descuentoStr = offer.discount_percent > 0
      ? `📉 Descuento: ${offer.discount_percent}%`
      : '';

    await ctx.meta.sendWhatsAppMessage(from,
      `✅ *Oferta creada para ${lead.name}*\n\n` +
      `📦 *Propiedad:* ${propertyName}\n` +
      `🏘️ *Desarrollo:* ${desarrollo}\n` +
      `💰 *Precio ofertado:* $${precioFmt}\n` +
      (descuentoStr ? `${descuentoStr}\n` : '') +
      `📅 *Válida hasta:* ${vencimientoStr}\n\n` +
      `📋 Status: *Borrador*\n\n` +
      `💡 Escribe *enviar oferta ${lead.name.split(' ')[0]}* para enviarla al cliente.`
    );

  } catch (e) {
    console.error('Error en vendedorCotizar:', e);
    await ctx.meta.sendWhatsAppMessage(from, '❌ Error al crear la oferta.');
  }
}

/**
 * Ver ofertas activas del vendedor
 * Comando: ofertas / mis ofertas
 */
export async function vendedorMisOfertas(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombreVendedor: string): Promise<void> {
  console.log(`📋 vendedorMisOfertas: ${nombreVendedor} consulta ofertas`);

  try {
    const { data: offers, error } = await ctx.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .eq('vendor_id', vendedor.id)
      .in('status', ['draft', 'sent', 'viewed', 'negotiating', 'counter_offer', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error obteniendo ofertas:', error);
      await ctx.meta.sendWhatsAppMessage(from, '❌ Error al obtener ofertas.');
      return;
    }

    if (!offers || offers.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from,
        `📋 *${nombreVendedor}, no tienes ofertas activas*\n\n` +
        `Para crear una oferta escribe:\n` +
        `*cotizar [nombre] [precio]*\n\n` +
        `Ejemplo: cotizar Juan 2500000`
      );
      return;
    }

    const statusEmoji: Record<string, string> = {
      draft: '📝', sent: '📤', viewed: '👁️', negotiating: '🤝',
      counter_offer: '↩️', accepted: '✅', reserved: '🏠',
      contracted: '📄', rejected: '❌', expired: '⏰', cancelled: '🚫'
    };

    const statusName: Record<string, string> = {
      draft: 'Borrador', sent: 'Enviada', viewed: 'Vista', negotiating: 'Negociando',
      counter_offer: 'Contraoferta', accepted: 'Aceptada', reserved: 'Apartado',
      contracted: 'Contrato', rejected: 'Rechazada', expired: 'Expirada', cancelled: 'Cancelada'
    };

    let msg = `📋 *TUS OFERTAS ACTIVAS* (${offers.length})\n\n`;

    offers.forEach((o: any, i: number) => {
      const emoji = statusEmoji[o.status] || '❓';
      const status = statusName[o.status] || o.status;
      const leadName = o.leads?.name || 'Sin nombre';
      const precio = Number(o.offered_price).toLocaleString('es-MX', { maximumFractionDigits: 0 });

      msg += `${i + 1}. ${emoji} *${leadName}*\n`;
      msg += `   💰 $${precio} • ${status}\n`;
      msg += `   🏘️ ${o.development || 'Sin desarrollo'}\n\n`;
    });

    msg += `💡 Comandos:\n`;
    msg += `• *oferta [nombre]* - Ver detalle\n`;
    msg += `• *enviar oferta [nombre]* - Enviar al cliente`;

    await ctx.meta.sendWhatsAppMessage(from, msg);

    // Interactive list menu with offers for quick access
    if (offers.length > 0) {
      try {
        const offerRows = offers.slice(0, 10).map((o: any) => {
          const leadName = o.leads?.name || 'Sin nombre';
          const precio = Number(o.offered_price).toLocaleString('es-MX', { maximumFractionDigits: 0 });
          const emoji = statusEmoji[o.status] || '❓';
          return {
            id: `cmd_oferta_${(leadName).toLowerCase().replace(/\s+/g, '_').substring(0, 30)}`,
            title: `${emoji} ${leadName}`.substring(0, 24),
            description: `$${precio} • ${statusName[o.status] || o.status}`.substring(0, 72)
          };
        });

        await new Promise(r => setTimeout(r, 300));
        await ctx.meta.sendListMenu(
          from,
          `Selecciona una oferta para ver más detalles o realizar acciones.`,
          'Ver ofertas 📋',
          [{ title: 'Ofertas activas', rows: offerRows }],
          undefined,
          'Toca para seleccionar'
        );
      } catch (listErr) {
        console.log('⚠️ No se pudo enviar lista de ofertas:', listErr);
      }
    }

  } catch (e) {
    console.error('Error en vendedorMisOfertas:', e);
    await ctx.meta.sendWhatsAppMessage(from, '❌ Error al obtener ofertas.');
  }
}

/**
 * Ver detalle de oferta de un lead
 * Comando: oferta [nombre]
 */
export async function vendedorVerOferta(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any): Promise<void> {
  console.log(`🔍 vendedorVerOferta: Buscando oferta de ${nombreLead}`);

  try {
    // Buscar lead
    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      vendedorId: vendedor.id, select: 'id, name', limit: 1
    });

    if (!leads || leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
      return;
    }

    const lead = leads[0];

    // Buscar oferta más reciente del lead
    const { data: offer } = await ctx.supabase.client
      .from('offers')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('vendor_id', vendedor.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!offer) {
      await ctx.meta.sendWhatsAppMessage(from,
        `📋 *${lead.name}* no tiene ofertas.\n\n` +
        `Para crear una escribe:\n` +
        `*cotizar ${lead.name.split(' ')[0]} [precio]*`
      );
      return;
    }

    const offerService = new OfferTrackingService(ctx.supabase);
    const mappedOffer = await offerService.getOfferById(offer.id);

    if (mappedOffer) {
      const formattedOffer = offerService.formatOfferForWhatsApp(mappedOffer);
      await ctx.meta.sendWhatsAppMessage(from, formattedOffer);
    } else {
      await ctx.meta.sendWhatsAppMessage(from, '❌ Error al formatear oferta.');
    }

  } catch (e) {
    console.error('Error en vendedorVerOferta:', e);
    await ctx.meta.sendWhatsAppMessage(from, '❌ Error al buscar oferta.');
  }
}

/**
 * Enviar oferta al cliente
 * Comando: enviar oferta [nombre]
 */
export async function vendedorEnviarOferta(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombreVendedor: string): Promise<void> {
  console.log(`📤 vendedorEnviarOferta: ${nombreVendedor} envía oferta a ${nombreLead}`);

  try {
    // Buscar lead
    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      vendedorId: vendedor.id, select: 'id, name, phone, last_message_at', limit: 1
    });

    if (!leads || leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
      return;
    }

    const lead = leads[0];

    // Buscar oferta en estado draft
    const { data: offer, error } = await ctx.supabase.client
      .from('offers')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('vendor_id', vendedor.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !offer) {
      await ctx.meta.sendWhatsAppMessage(from,
        `⚠️ *${lead.name}* no tiene ofertas pendientes de envío.\n\n` +
        `Las ofertas en borrador se envían con este comando.\n` +
        `Si ya fue enviada, usa *oferta ${lead.name.split(' ')[0]}* para ver su status.`
      );
      return;
    }

    // Verificar ventana de 24h
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dentroVentana = lead.last_message_at && lead.last_message_at > hace24h;

    if (!dentroVentana) {
      await ctx.meta.sendWhatsAppMessage(from,
        `⚠️ *${lead.name}* no ha escrito en las últimas 24h.\n\n` +
        `WhatsApp no permite enviar mensajes fuera de la ventana de 24h.\n\n` +
        `Usa *contactar ${lead.name.split(' ')[0]}* para enviar un template y reactivar la conversación.`
      );
      return;
    }

    // Formatear y enviar oferta al lead
    const leadPhone = lead.phone?.startsWith('521')
      ? lead.phone
      : '521' + (lead.phone || '').replace(/\D/g, '').slice(-10);

    const precioFmt = Number(offer.offered_price).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    const vencimiento = new Date(offer.expires_at);
    const vencimientoStr = vencimiento.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long'
    });

    // Generate cotización link
    const cotizacionUrl = `https://sara-backend.edson-633.workers.dev/cotizacion/${offer.id}`;

    const ofertaMsg =
      `🏠 *COTIZACIÓN PERSONALIZADA*\n\n` +
      `📦 *${offer.property_name}*\n` +
      `🏘️ ${offer.development}\n\n` +
      `💰 *Precio especial:* $${precioFmt} MXN\n` +
      (offer.discount_percent > 0 ? `📉 *Descuento:* ${offer.discount_percent}%\n` : '') +
      `📅 *Válido hasta:* ${vencimientoStr}\n\n` +
      `👉 Ver cotización completa:\n${cotizacionUrl}\n\n` +
      `¿Te interesa? Responde a este mensaje para que te ayude con los siguientes pasos. 🙌`;

    await ctx.meta.sendWhatsAppMessage(leadPhone, ofertaMsg);

    // Actualizar status de la oferta
    const offerService = new OfferTrackingService(ctx.supabase);
    await offerService.updateOfferStatus(offer.id, 'sent', 'Enviada vía WhatsApp con cotización', vendedor.id);

    await ctx.meta.sendWhatsAppMessage(from,
      `✅ *Oferta enviada a ${lead.name}*\n\n` +
      `📤 Cotización enviada con link profesional.\n` +
      `🔗 ${cotizacionUrl}\n\n` +
      `💡 Cuando responda puedes actualizar el status:\n` +
      `• *oferta aceptada ${lead.name.split(' ')[0]}*\n` +
      `• *oferta rechazada ${lead.name.split(' ')[0]} [razón]*`
    );

  } catch (e) {
    console.error('Error en vendedorEnviarOferta:', e);
    await ctx.meta.sendWhatsAppMessage(from, '❌ Error al enviar oferta.');
  }
}

/**
 * Marcar oferta como aceptada
 * Comando: oferta aceptada [nombre]
 */
export async function vendedorOfertaAceptada(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any): Promise<void> {
  console.log(`✅ vendedorOfertaAceptada: ${nombreLead}`);

  try {
    // Buscar lead
    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      vendedorId: vendedor.id, select: 'id, name', limit: 1
    });

    if (!leads || leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
      return;
    }

    const lead = leads[0];

    // Buscar oferta activa
    const { data: offer } = await ctx.supabase.client
      .from('offers')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('vendor_id', vendedor.id)
      .in('status', ['sent', 'viewed', 'negotiating', 'counter_offer'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!offer) {
      await ctx.meta.sendWhatsAppMessage(from,
        `⚠️ *${lead.name}* no tiene ofertas activas para aceptar.`
      );
      return;
    }

    const offerService = new OfferTrackingService(ctx.supabase);
    await offerService.updateOfferStatus(offer.id, 'accepted', 'Aceptada por el cliente', vendedor.id);

    const precioFmt = Number(offer.offered_price).toLocaleString('es-MX', { maximumFractionDigits: 0 });

    await ctx.meta.sendWhatsAppMessage(from,
      `🎉 *¡OFERTA ACEPTADA!*\n\n` +
      `👤 ${lead.name}\n` +
      `💰 $${precioFmt}\n` +
      `🏘️ ${offer.development}\n\n` +
      `El lead ha sido movido a negociación.\n` +
      `¡Felicidades! 🏆`
    );

  } catch (e) {
    console.error('Error en vendedorOfertaAceptada:', e);
    await ctx.meta.sendWhatsAppMessage(from, '❌ Error al actualizar oferta.');
  }
}

/**
 * Marcar oferta como rechazada
 * Comando: oferta rechazada [nombre] [razón]
 */
export async function vendedorOfertaRechazada(ctx: HandlerContext, handler: any, from: string, nombreLead: string, razon: string | null, vendedor: any): Promise<void> {
  console.log(`❌ vendedorOfertaRechazada: ${nombreLead}, razón: ${razon}`);

  try {
    // Buscar lead
    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      vendedorId: vendedor.id, select: 'id, name', limit: 1
    });

    if (!leads || leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads.`);
      return;
    }

    const lead = leads[0];

    // Buscar oferta activa
    const { data: offer } = await ctx.supabase.client
      .from('offers')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('vendor_id', vendedor.id)
      .in('status', ['sent', 'viewed', 'negotiating', 'counter_offer'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!offer) {
      await ctx.meta.sendWhatsAppMessage(from,
        `⚠️ *${lead.name}* no tiene ofertas activas para rechazar.`
      );
      return;
    }

    const offerService = new OfferTrackingService(ctx.supabase);
    await offerService.updateOfferStatus(
      offer.id,
      'rejected',
      razon || 'Rechazada por el cliente',
      vendedor.id
    );

    await ctx.meta.sendWhatsAppMessage(from,
      `📋 *Oferta rechazada registrada*\n\n` +
      `👤 ${lead.name}\n` +
      (razon ? `📝 Razón: ${razon}\n\n` : '\n') +
      `💡 Puedes crear una nueva oferta:\n` +
      `*cotizar ${lead.name.split(' ')[0]} [nuevo precio]*`
    );

  } catch (e) {
    console.error('Error en vendedorOfertaRechazada:', e);
    await ctx.meta.sendWhatsAppMessage(from, '❌ Error al actualizar oferta.');
  }
}

// CONTACTAR: Iniciar contacto con un lead (template si fuera de 24h, bridge si dentro)
export async function vendedorContactarLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombreVendedor: string): Promise<void> {
  try {
    console.log(`📞 vendedorContactarLead: ${nombreVendedor} quiere contactar a ${nombreLead}`);

    // Buscar lead por nombre
    // Buscar en todos los leads (no solo asignados) para flexibilidad
    const leads = await findLeadByName(ctx.supabase, nombreLead, {
      select: 'id, name, phone, last_message_at, property_interest, status, assigned_to', limit: 5
    });
    // Filter out lost/dnc leads (findLeadByName doesn't support .not() filter)
    const filteredLeads = leads.filter((l: any) => !['lost', 'dnc'].includes(l.status));

    if (!filteredLeads || filteredLeads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(from,
        `❌ No encontré ningún lead con nombre *${nombreLead}*.\n\n` +
        `Escribe *mis leads* para ver tu cartera.`
      );
      return;
    }

    // Si hay múltiples coincidencias, pedir especificar
    if (filteredLeads.length > 1) {
      let msg = `🔍 Encontré ${filteredLeads.length} leads con ese nombre:\n\n`;
      filteredLeads.forEach((l: any, i: number) => {
        const tel = l.phone?.replace(/\D/g, '').slice(-10) || 'Sin tel';
        msg += `${i + 1}. *${l.name}* (${tel})\n`;
      });
      msg += `\n_Sé más específico con el nombre_`;
      await ctx.meta.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = filteredLeads[0];
    const leadPhone = lead.phone?.startsWith('521')
      ? lead.phone
      : '521' + (lead.phone || '').replace(/\D/g, '').slice(-10);

    // Verificar ventana de 24h
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dentroVentana24h = lead.last_message_at && lead.last_message_at > hace24h;

    console.log(`📊 Contactar check: last_message_at=${lead.last_message_at}, dentroVentana=${dentroVentana24h}`);

    if (dentroVentana24h) {
      // Dentro de 24h - iniciar bridge
      await ctx.meta.sendWhatsAppMessage(from,
        `✅ *${lead.name}* escribió recientemente.\n\n` +
        `Puedes iniciar chat directo:\n` +
        `→ Escribe *bridge ${lead.name.split(' ')[0]}*`
      );
      return;
    }

    // Fuera de 24h - mostrar opciones de template
    // Guardar contexto para selección
    const { data: vendedorData } = await ctx.supabase.client
      .from('team_members')
      .select('notes')
      .eq('id', vendedor.id)
      .single();

    let notasVendedor: any = safeJsonParse(vendedorData?.notes);

    notasVendedor.pending_template_selection = {
      lead_id: lead.id,
      lead_name: lead.name,
      lead_phone: leadPhone,
      desarrollo: lead.property_interest || 'Santa Rita',
      timestamp: new Date().toISOString()
    };

    await ctx.supabase.client
      .from('team_members')
      .update({ notes: notasVendedor })
      .eq('id', vendedor.id);

    await ctx.meta.sendWhatsAppMessage(from,
      `⚠️ *${lead.name} no ha escrito en 24h*\n\n` +
      `WhatsApp no permite mensajes directos.\n\n` +
      `*¿Qué quieres hacer?*\n\n` +
      `*1.* 📩 Template seguimiento\n` +
      `*2.* 📩 Template reactivación\n` +
      `*3.* 📩 Template info crédito\n` +
      `*4.* 📞 Llamar directo (${formatPhoneForDisplay(leadPhone)})\n` +
      `*5.* ❌ Cancelar\n\n` +
      `_Responde con el número_`
    );

  } catch (e) {
    console.error('Error en vendedorContactarLead:', e);
    await ctx.meta.sendWhatsAppMessage(from, '❌ Error al contactar lead.');
  }
}
export async function vendedorBuscarPorTelefono(ctx: HandlerContext, handler: any, from: string, telefono: string, vendedor: any): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.getBusquedaTelefono(telefono);
    const mensaje = vendorService.formatBusquedaTelefono(result, telefono);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error buscando por telefono:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al buscar lead.');
  }
}
export async function vendedorCrearRecordatorio(ctx: HandlerContext, handler: any, from: string, texto: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const scheduledFor = await vendorService.crearRecordatorio(texto);
    const mensaje = vendorService.formatRecordatorioCreado(texto, scheduledFor);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error creando recordatorio:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al crear recordatorio.');
  }
}

// MIS HOT: Leads calientes asignados
export async function vendedorMisHot(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const leads = await vendorService.getLeadsHot(vendedor.id);
    const mensaje = vendorService.formatLeadsHot(leads, nombre);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (error) {
    console.error('Error en vendedorMisHot:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error obteniendo leads HOT');
  }
}

// ON/OFF: Toggle disponibilidad del vendedor
export async function vendedorOnOff(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string, estado: boolean): Promise<void> {
  try {
    await ctx.supabase.client
      .from('team_members')
      .update({ is_on_duty: estado })
      .eq('id', vendedor.id);

    if (estado) {
      await ctx.twilio.sendWhatsAppMessage(from, `✅ *Disponibilidad activada*\n\n${nombre}, ahora recibirás nuevos leads y notificaciones.\n\n💡 Escribe *OFF* para pausar.`);
    } else {
      await ctx.twilio.sendWhatsAppMessage(from, `⏸️ *Disponibilidad pausada*\n\n${nombre}, no recibirás nuevos leads por ahora.\n\n💡 Escribe *ON* cuando estés listo.`);
    }
  } catch (error) {
    console.error('Error en vendedorOnOff:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al cambiar disponibilidad.');
  }
}

// DISPONIBILIDAD: Huecos en agenda
export async function vendedorDisponibilidad(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    // Próximos 3 días
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const en3Dias = new Date(hoy.getTime() + 3 * 24 * 60 * 60 * 1000);
    const en3DiasStr = en3Dias.toISOString().split('T')[0];

    const { data: citas, error } = await ctx.supabase.client
      .from('appointments')
      .select('scheduled_date, scheduled_time, lead_name')
      .eq('vendedor_id', vendedor.id)
      .gte('scheduled_date', hoyStr)
      .lte('scheduled_date', en3DiasStr)
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_date', { ascending: true });

    console.log('📅 Citas para disponibilidad:', citas?.length || 0, 'vendedor:', vendedor.id);

    // Guardar hora + nombre del lead
    const citasPorDia: Record<string, Array<{hora: string, lead: string}>> = {};
    
    if (citas) {
      citas.forEach((c: any) => {
        const diaKey = c.scheduled_date;
        const hora = c.scheduled_time ? parseInt(c.scheduled_time.split(':')[0]) : 0;
        if (!citasPorDia[diaKey]) citasPorDia[diaKey] = [];
        citasPorDia[diaKey].push({
          hora: `${hora}:00`,
          lead: c.lead_name || 'Sin nombre'
        });
      });
    }
    
    console.log('📅 Citas por día:', JSON.stringify(citasPorDia));

    let msg = `📌 *TU DISPONIBILIDAD*\n`;
    msg += `━━━━━━━━━━━━━━━\n\n`;

    const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    
    for (let i = 0; i < 3; i++) {
      const dia = new Date(hoy.getTime() + i * 24 * 60 * 60 * 1000);
      const diaKey = dia.toISOString().split('T')[0];
      const nombreDia = i === 0 ? 'HOY' : i === 1 ? 'MAÑANA' : diasSemana[dia.getDay()].toUpperCase();
      
      const citasDelDia = citasPorDia[diaKey] || [];
      const horasOcupadas = citasDelDia.map(c => c.hora);
      const libres: string[] = [];
      
      // Horarios disponibles (9am - 6pm, cada 2 horas)
      for (let h = 9; h <= 18; h += 2) {
        if (!horasOcupadas.includes(`${h}:00`)) {
          libres.push(`${h}:00`);
        }
      }

      msg += `*${nombreDia}* (${dia.getDate()}/${dia.getMonth() + 1})\n`;
      
      if (citasDelDia.length === 0) {
        // Sin citas = disponible todo el día
        msg += `✅ Disponible todo el día\n`;
      } else {
        // Hay citas - mostrar libres y ocupadas
        if (libres.length > 0) {
          msg += `✅ Libre: ${libres.join(', ')}\n`;
        } else {
          msg += `❌ Sin disponibilidad\n`;
        }
        // Mostrar citas con nombre
        citasDelDia.forEach(cita => {
          msg += `📌 ${cita.hora} - ${cita.lead}\n`;
        });
      }
      msg += `\n`;
    }

    msg += `_Para agendar: "Cita mañana 3pm con Juan"_`;

    await ctx.twilio.sendWhatsAppMessage(from, msg);
  } catch (error) {
    console.error('Error en vendedorDisponibilidad:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error obteniendo disponibilidad');
  }
}

// ENVIAR INFO A LEAD: Manda info de desarrollo a un lead
export async function vendedorEnviarInfoALead(ctx: HandlerContext, handler: any, from: string, desarrollo: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);

    // Buscar lead
    const leadResult = await vendorService.getLeadParaEnviarInfo(nombreLead, vendedor.id, vendedor.role);
    if (!leadResult.found) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }
    if (leadResult.multiple) {
      await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeads(leadResult.multiple));
      return;
    }

    // Buscar desarrollo
    const prop = await vendorService.getDesarrolloInfo(desarrollo);
    if (!prop) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré el desarrollo *${desarrollo}*\n\n_Escribe "propiedades" para ver disponibles_`);
      return;
    }

    const lead = leadResult.lead!;
    const desarrolloNombre = prop.development || prop.name;

    // Enviar info al lead
    const msgLead = vendorService.formatMensajeInfoLead(lead.name, vendedor.name, prop);
    await ctx.twilio.sendWhatsAppMessage(handler.formatPhoneMX(lead.phone), msgLead);

    // Registrar envío
    await vendorService.registrarEnvioInfo(lead.id, vendedor.id, desarrolloNombre);

    // Confirmar al vendedor
    await ctx.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionEnvioInfo(lead.name, desarrolloNombre, lead.phone));
  } catch (error) {
    console.error('Error en vendedorEnviarInfoALead:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error enviando info');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOICE AI - Funciones de llamadas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function vendedorLlamar(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.getLlamarLead(nombreLead, vendedor.id);

    // Si encontró uno solo, registrar la llamada
    if (result.found && result.lead && !result.multiple) {
      await vendorService.registrarLlamada(result.lead.id, vendedor.id);
    }

    const mensaje = vendorService.formatLlamarLead(result, nombreLead);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);

    // Enviar contact card del lead al vendedor (si encontró uno solo)
    if (result.found && result.lead && !result.multiple && result.lead.phone && result.lead.name) {
      try {
        await ctx.meta.sendContactCard(from, {
          name: result.lead.name,
          phone: result.lead.phone,
          company: 'Lead - Grupo Santa Rita'
        });
      } catch (ccErr) {
        console.log('⚠️ Error enviando contact card del lead:', ccErr);
      }
    }
  } catch (e) {
    console.log('Error en llamar:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al procesar llamada.');
  }
}

/**
 * Inicia una llamada telefónica con IA usando Retell.ai
 * Comando: "llamar ia [nombre]"
 */
export async function vendedorLlamarIA(ctx: HandlerContext, handler: any, from: string, nombreLead: string, vendedor: any, nombreVendedor: string): Promise<void> {
  try {
    // Verificar que Retell esté configurado
    if (!ctx.env.RETELL_API_KEY || !ctx.env.RETELL_AGENT_ID || !ctx.env.RETELL_PHONE_NUMBER) {
      await ctx.twilio.sendWhatsAppMessage(from,
        '❌ Llamadas IA no disponibles.\n\n' +
        'Contacta al administrador para configurar Retell.ai:\n' +
        '• RETELL_API_KEY\n' +
        '• RETELL_AGENT_ID\n' +
        '• RETELL_PHONE_NUMBER'
      );
      return;
    }

    // Verificar feature flag (KV-based)
    const { createFeatureFlags } = await import('../services/featureFlagsService');
    const flagsService = createFeatureFlags(ctx.env.SARA_CACHE);
    const retellEnabled = await flagsService.isEnabled('retell_enabled');
    if (!retellEnabled) {
      await ctx.twilio.sendWhatsAppMessage(from,
        '❌ Llamadas IA desactivadas temporalmente.\n' +
        'Usa "llamar [nombre]" para obtener el teléfono y llamar manualmente.'
      );
      return;
    }

    // Buscar lead
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.getLlamarLead(nombreLead, vendedor.id);

    if (!result.found || !result.lead) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    if ((result as any).multiple) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `⚠️ Encontré varios leads con ese nombre:\n\n` +
        ((result as any).leads || [result.lead]).map((l: any) => `• ${l.name} - ${l.phone ? formatPhoneForDisplay(l.phone) : 'Sin tel'}`).join('\n') +
        '\n\nSé más específico con el nombre.'
      );
      return;
    }

    const lead = result.lead;

    if (!lead.phone) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `❌ ${lead.name} no tiene número de teléfono registrado.`
      );
      return;
    }

    // Obtener info del desarrollo de interés
    let desarrolloInteres = '';
    let precioDesde = '';
    if (lead.notes?.desarrollo_interes) {
      desarrolloInteres = lead.notes?.desarrollo_interes;
    } else if (lead.property_interest) {
      desarrolloInteres = lead.property_interest;
    }

    // Iniciar llamada con Retell
    const { createRetellService } = await import('../services/retellService');
    const retell = createRetellService(
      ctx.env.RETELL_API_KEY,
      ctx.env.RETELL_AGENT_ID,
      ctx.env.RETELL_PHONE_NUMBER
    );

    const callResult = await retell.initiateCall({
      leadId: lead.id,
      leadName: lead.name,
      leadPhone: lead.phone,
      vendorId: vendedor.id,
      vendorName: nombreVendedor,
      desarrolloInteres,
      precioDesde: precioDesde || '$1.5 millones',
      motivo: 'seguimiento'
    });

    if (callResult.success) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `📞 *Llamada IA iniciada*\n\n` +
        `👤 Lead: ${lead.name}\n` +
        `📱 Teléfono: ${formatPhoneForDisplay(lead.phone)}\n` +
        `🏠 Interés: ${desarrolloInteres || 'Por definir'}\n\n` +
        `SARA está llamando ahora. Te notificaré cuando termine con el resumen.`
      );

      // Agregar nota al lead
      const notesObj = lead.notes || {};
      const notasArray = notesObj.notas || [];
      notasArray.push({
        text: `📞 Llamada IA iniciada por ${nombreVendedor}`,
        author: nombreVendedor,
        timestamp: new Date().toISOString(),
        type: 'call'
      });
      notesObj.notas = notasArray;

      await ctx.supabase.client
        .from('leads')
        .update({ notes: notesObj })
        .eq('id', lead.id);
    } else {
      await ctx.twilio.sendWhatsAppMessage(from,
        `❌ Error iniciando llamada:\n${callResult.error}\n\n` +
        `Puedes llamar manualmente: ${formatPhoneForDisplay(lead.phone)}`
      );
    }
  } catch (e) {
    console.error('Error en llamarIA:', e);
    await ctx.twilio.sendWhatsAppMessage(from,
      '❌ Error al iniciar llamada IA. Intenta más tarde.'
    );
  }
}
export async function vendedorProgramarLlamada(ctx: HandlerContext, handler: any, from: string, nombreLead: string, cuando: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.getLlamarLead(nombreLead, vendedor.id);

    if (!result.found || !result.lead) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    const lead = result.lead;
    const scheduledFor = await vendorService.programarLlamada(lead.id, lead.name, lead.phone, cuando);
    const mensaje = vendorService.formatLlamadaProgramada(lead.name, scheduledFor);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.log('Error programando llamada:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al programar llamada.');
  }
}
export async function vendedorRecordarLlamar(ctx: HandlerContext, handler: any, from: string, nombreLead: string, fechaHora: string, vendedor: any, nombreVendedor: string): Promise<void> {
  try {
    console.log(`📞 RECORDAR LLAMAR: ${nombreLead} - ${fechaHora} (vendedor: ${nombreVendedor})`);

    // 1. Buscar el lead
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.getLlamarLead(nombreLead, vendedor.id);

    if (!result.found || !result.lead) {
      // Buscar sugerencias
      const { data: recentLeads } = await ctx.supabase.client
        .from('leads')
        .select('name')
        .eq('assigned_to', vendedor.id)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (recentLeads && recentLeads.length > 0) {
        const similarity = (a: string, b: string): number => {
          a = a.toLowerCase(); b = b.toLowerCase();
          if (a === b) return 1;
          if (a.startsWith(b) || b.startsWith(a)) return 0.8;
          if (a.includes(b) || b.includes(a)) return 0.6;
          return 0;
        };

        const sugerencias = recentLeads
          .map(l => ({ name: l.name, score: similarity(l.name?.split(' ')[0] || '', nombreLead) }))
          .filter(s => s.score >= 0.4 && s.name)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(s => s.name?.split(' ')[0]);

        const sugerenciasUnicas = [...new Set(sugerencias)];

        if (sugerenciasUnicas.length > 0) {
          await ctx.twilio.sendWhatsAppMessage(from,
            `❌ No encontré a *${nombreLead}*\n\n💡 *¿Quisiste decir?*\n` +
            sugerenciasUnicas.map(s => `• recordar llamar ${s} ${fechaHora}`).join('\n')
          );
          return;
        }
      }

      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads`);
      return;
    }

    const lead = result.lead;

    // 2. Parsear fecha y hora con parseFechaEspanol
    const { parseFechaEspanol } = await import('../utils/dateParser');
    const parsed = parseFechaEspanol(fechaHora);

    if (!parsed || !parsed.fecha || !parsed.hora) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `⚠️ No entendí la fecha/hora.\n\n` +
        `*Ejemplos:*\n` +
        `• recordar llamar ${nombreLead} mañana 10am\n` +
        `• recordar llamar ${nombreLead} lunes 3pm\n` +
        `• recordar llamar ${nombreLead} 28/01 4pm`
      );
      return;
    }

    const fecha = parsed.fecha;
    const hora = parsed.hora;

    // 3. Crear cita de llamada usando AppointmentService
    const { AppointmentService } = await import('../services/appointmentService');
    const appointmentService = new AppointmentService(ctx.supabase, ctx.calendar, ctx.twilio);

    const cleanPhone = lead.phone.replace(/\D/g, '');
    const resultCita = await appointmentService.crearCitaLlamada({
      lead,
      cleanPhone,
      clientName: lead.name || nombreLead,
      fecha,
      hora,
      vendedor,
      desarrollo: lead.property_interest,
      skipDuplicateCheck: true,  // Vendedor solicita explícitamente, permitir
      skipVendorNotification: true  // Evitar duplicado, enviamos nuestra propia confirmación
    });

    if (resultCita.success) {
      // Formatear fecha bonita
      const fechaObj = new Date(fecha + 'T12:00:00-06:00');
      const fechaFormateada = fechaObj.toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });

      await ctx.twilio.sendWhatsAppMessage(from,
        `✅ *Llamada programada*\n\n` +
        `👤 *${lead.name}*\n` +
        `📱 ${formatPhoneForDisplay(lead.phone)}\n` +
        `📅 ${fechaFormateada}\n` +
        `🕐 ${hora}\n\n` +
        `Te recordaré antes de la llamada 📞`
      );
    } else {
      await ctx.twilio.sendWhatsAppMessage(from,
        `⚠️ No pude programar la llamada: ${resultCita.error || 'error desconocido'}`
      );
    }

  } catch (e) {
    console.error('Error en vendedorRecordarLlamar:', e);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al programar llamada');
  }
}
export async function vendedorReagendarLlamada(ctx: HandlerContext, handler: any, from: string, nombreLead: string, nuevaFechaHora: string, vendedor: any, nombreVendedor: string): Promise<void> {
  try {
    console.log(`🔄 REAGENDAR LLAMADA: ${nombreLead} -> ${nuevaFechaHora} (vendedor: ${nombreVendedor})`);

    // 1. Buscar el lead
    const vendorService: any = new VendorCommandsService(ctx.supabase);
    const result = await vendorService.getLlamarLead(nombreLead, vendedor.id);

    if (!result.found || !result.lead) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads`);
      return;
    }

    const lead = result.lead;

    // 2. Buscar cita de llamada activa para este lead
    const { data: citaActiva } = await ctx.supabase.client
      .from('appointments')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('appointment_type', 'llamada')
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_date', { ascending: true })
      .limit(1)
      .single();

    if (!citaActiva) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `⚠️ No encontré llamada programada para *${lead.name}*.\n\n` +
        `💡 Usa: *recordar llamar ${nombreLead} [fecha] [hora]*`
      );
      return;
    }

    // 3. Parsear nueva fecha y hora
    // Si solo se proporciona hora (ej: "3pm"), asumir "hoy"
    const { parseFechaEspanol } = await import('../utils/dateParser');
    let textoParaParsear = nuevaFechaHora;
    const soloHora = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?)?$/i.test(nuevaFechaHora.trim());
    if (soloHora) {
      textoParaParsear = `hoy ${nuevaFechaHora}`;
      console.log(`🔄 REAGENDAR: Solo hora detectada, asumiendo hoy -> "${textoParaParsear}"`);
    }
    const parsed = parseFechaEspanol(textoParaParsear);

    if (!parsed || !parsed.fecha || !parsed.hora) {
      await ctx.twilio.sendWhatsAppMessage(from,
        `⚠️ No entendí la nueva fecha/hora.\n\n` +
        `*Ejemplos:*\n` +
        `• reagendar llamada ${nombreLead} mañana 3pm\n` +
        `• reagendar llamada ${nombreLead} lunes 10am`
      );
      return;
    }

    const nuevaFecha = parsed.fecha;
    const nuevaHora = parsed.hora;
    const fechaAnterior = citaActiva.scheduled_date;
    const horaAnterior = citaActiva.scheduled_time;

    // 4. Actualizar la cita
    const { parseFechaISO, parseHoraISO } = await import('../utils/dateParser');
    const { error: updateError } = await ctx.supabase.client
      .from('appointments')
      .update({
        scheduled_date: parseFechaISO(nuevaFecha),
        scheduled_time: parseHoraISO(nuevaHora).substring(0, 5)
      })
      .eq('id', citaActiva.id);

    if (updateError) {
      console.error('Error actualizando cita:', updateError);
      await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al reagendar la llamada');
      return;
    }

    // 5. Formatear fecha bonita
    const fechaObj = new Date(nuevaFecha + 'T12:00:00-06:00');
    const fechaFormateada = fechaObj.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    // 6. Notificar al LEAD sobre el cambio
    const cleanPhone = lead.phone.replace(/\D/g, '');
    const msgLead = `📞 *Llamada reagendada*\n\n` +
      `Hola ${lead.name?.split(' ')[0] || ''}! 👋\n\n` +
      `Tu llamada ha sido movida a:\n` +
      `📅 *${fechaFormateada}*\n` +
      `🕐 *${nuevaHora}*\n\n` +
      `¡Te contactamos pronto! 😊`;

    await ctx.meta.sendWhatsAppMessage('whatsapp:+' + cleanPhone, msgLead);
    console.log('✅ Lead notificado del reagendamiento:', lead.name);

    // 7. Confirmar al vendedor
    await ctx.twilio.sendWhatsAppMessage(from,
      `✅ *Llamada reagendada*\n\n` +
      `👤 *${lead.name}*\n` +
      `📱 ${formatPhoneForDisplay(lead.phone)}\n` +
      `❌ Antes: ${fechaAnterior} ${horaAnterior}\n` +
      `✅ Ahora: ${fechaFormateada} ${nuevaHora}\n\n` +
      `📲 *${lead.name?.split(' ')[0]} ya fue notificado*`
    );

  } catch (e) {
    console.error('Error en vendedorReagendarLlamada:', e);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al reagendar llamada');
  }
}
export async function vendedorLlamadasPendientes(ctx: HandlerContext, handler: any, from: string, vendedor: any, nombre: string): Promise<void> {
  try {
    const hace3dias = new Date();
    hace3dias.setDate(hace3dias.getDate() - 3);

    // Leads que necesitan llamada (new sin contactar, scheduled sin confirmar)
    const { data: porLlamar } = await ctx.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .in('status', ['new', 'contacted', 'scheduled'])
      .lt('updated_at', hace3dias.toISOString())
      .order('score', { ascending: false })
      .limit(5);

    // Leads HOT que necesitan seguimiento
    const { data: hotPendientes } = await ctx.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .in('status', ['visited', 'negotiation', 'reserved'])
      .order('score', { ascending: false })
      .limit(3);

    let msg = `📌 *LLAMADAS PENDIENTES*\n${nombre}\n\n`;

    if (hotPendientes && hotPendientes.length > 0) {
      msg += `*📌 URGENTES (HOT):*\n`;
      for (const l of hotPendientes) {
        const tel = l.phone?.slice(-10) || '';
        msg += `• *${l.name}* - ${l.status}\n`;
        msg += `  tel:+52${tel}\n`;
      }
      msg += '\n';
    }

    if (porLlamar && porLlamar.length > 0) {
      msg += `*⏳ SIN CONTACTAR (+3 días):*\n`;
      for (const l of porLlamar) {
        const tel = l.phone?.slice(-10) || '';
        msg += `• *${l.name}* - ${l.status}\n`;
        msg += `  tel:+52${tel}\n`;
      }
    }

    if ((!porLlamar || porLlamar.length === 0) && (!hotPendientes || hotPendientes.length === 0)) {
      msg = `✅ *${nombre}*, no tienes llamadas pendientes urgentes!\n\n_Buen trabajo manteniéndote al día_ 📌`;
    } else {
      msg += '\n_Toca el número para llamar_';
    }

    await ctx.twilio.sendWhatsAppMessage(from, msg);
  } catch (e) {
    console.log('Error en llamadas pendientes:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener llamadas pendientes.');
  }
}
