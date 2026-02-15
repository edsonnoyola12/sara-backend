// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHATSAPP HANDLER - CEO MODULE
// Extraído de whatsapp.ts para modularización
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { HandlerContext } from './whatsapp-types';
import * as utils from './whatsapp-utils';
import { isPendingExpired } from '../utils/teamMessaging';
import { CEOCommandsService } from '../services/ceoCommandsService';
import { AgenciaCommandsService } from '../services/agenciaCommandsService';
import { safeJsonParse } from '../utils/safeHelpers';
import { AsesorCommandsService } from '../services/asesorCommandsService';
import { VendorCommandsService } from '../services/vendorCommandsService';
import { BridgeService } from '../services/bridgeService';
import { OfferTrackingService } from '../services/offerTrackingService';

// ═══════════════════════════════════════════════════════════════
// HANDLE CEO MESSAGE (entry point)
// ═══════════════════════════════════════════════════════════════

export async function handleCEOMessage(ctx: HandlerContext, handler: any, from: string, body: string, ceo: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreCEO = ceo.name?.split(' ')[0] || 'Jefe';
    console.log('CEO Command:', mensaje);

    // Obtener teléfono limpio para Meta WhatsApp
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

    // ═══════════════════════════════════════════════════════════
    // RESPUESTA A FELICITACIÓN DE CUMPLEAÑOS (CEOs también reciben)
    // ═══════════════════════════════════════════════════════════
    let notasCEO: any = {};
    if (ceo.notes) {
      if (typeof ceo.notes === 'string') {
        try { notasCEO = JSON.parse(ceo.notes); } catch { notasCEO = {}; }
      } else if (typeof ceo.notes === 'object') {
        notasCEO = ceo.notes;
      }
    }

    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║  CRÍTICO: VERIFICAR PENDING MESSAGES PRIMERO (CEO también los recibe)  ║
    // ╚════════════════════════════════════════════════════════════════════════╝

    // Actualizar last_sara_interaction (ventana 24h ahora está abierta)
    notasCEO.last_sara_interaction = new Date().toISOString();

    // PENDING BRIEFING - Usa expiración configurable (18h)
    const pendingBriefingCEO = notasCEO?.pending_briefing;
    if (pendingBriefingCEO?.sent_at && pendingBriefingCEO?.mensaje_completo) {
      if (!isPendingExpired(pendingBriefingCEO, 'briefing')) {
        console.log(`📋 [PENDING] CEO ${nombreCEO} respondió template - enviando briefing`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingBriefingCEO.mensaje_completo);

        const { pending_briefing, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString(), last_briefing_context: { sent_at: new Date().toISOString(), delivered: true } }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING RECAP - Usa expiración configurable (18h)
    const pendingRecapCEO = notasCEO?.pending_recap;
    if (pendingRecapCEO?.sent_at && pendingRecapCEO?.mensaje_completo) {
      if (!isPendingExpired(pendingRecapCEO, 'recap')) {
        console.log(`📋 [PENDING] CEO ${nombreCEO} respondió template - enviando recap`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingRecapCEO.mensaje_completo);

        const { pending_recap, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString(), last_recap_context: { sent_at: new Date().toISOString(), delivered: true } }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING REPORTE DIARIO - Usa expiración configurable (24h)
    const pendingReporteDiarioCEO = notasCEO?.pending_reporte_diario;
    if (pendingReporteDiarioCEO?.sent_at && pendingReporteDiarioCEO?.mensaje_completo) {
      if (!isPendingExpired(pendingReporteDiarioCEO, 'reporte_diario')) {
        console.log(`📊 [PENDING] CEO ${nombreCEO} respondió template - enviando reporte diario`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingReporteDiarioCEO.mensaje_completo);

        const { pending_reporte_diario, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString(), last_reporte_diario_context: { sent_at: new Date().toISOString(), delivered: true } }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING REPORTE SEMANAL - Usa expiración configurable (72h)
    const pendingReporteSemanalCEO = notasCEO?.pending_reporte_semanal;
    if (pendingReporteSemanalCEO?.sent_at && pendingReporteSemanalCEO?.mensaje_completo) {
      if (!isPendingExpired(pendingReporteSemanalCEO, 'resumen_semanal')) {
        console.log(`📊 [PENDING] CEO ${nombreCEO} respondió template - enviando reporte semanal`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingReporteSemanalCEO.mensaje_completo);

        const { pending_reporte_semanal, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString(), last_reporte_semanal_context: { sent_at: new Date().toISOString(), delivered: true } }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING RESUMEN SEMANAL (recap semanal - sábado) - Usa expiración configurable (72h)
    const pendingResumenSemanalCEO = notasCEO?.pending_resumen_semanal;
    if (pendingResumenSemanalCEO?.sent_at && pendingResumenSemanalCEO?.mensaje_completo) {
      if (!isPendingExpired(pendingResumenSemanalCEO, 'resumen_semanal')) {
        console.log(`📋 [PENDING] CEO ${nombreCEO} respondió template - enviando resumen semanal`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingResumenSemanalCEO.mensaje_completo);

        const { pending_resumen_semanal, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString(), last_resumen_semanal_context: { sent_at: new Date().toISOString(), delivered: true } }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING VIDEO SEMANAL (resumen semanal de logros)
    const pendingVideoSemanalCEO = notasCEO?.pending_video_semanal;
    if (pendingVideoSemanalCEO?.sent_at && pendingVideoSemanalCEO?.mensaje_completo) {
      const horasDesde = (Date.now() - new Date(pendingVideoSemanalCEO.sent_at).getTime()) / (1000 * 60 * 60);
      if (horasDesde <= 24) {
        console.log(`🎬 [PENDING PRIORITY] CEO ${nombreCEO} respondió template - enviando resumen semanal de logros`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingVideoSemanalCEO.mensaje_completo);

        const { pending_video_semanal, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString() }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING AUDIO (TTS) - Enviar nota de voz pendiente
    const pendingAudioCEO = notasCEO?.pending_audio;
    if (pendingAudioCEO?.sent_at && pendingAudioCEO?.texto) {
      const horasDesdeAudio = (Date.now() - new Date(pendingAudioCEO.sent_at).getTime()) / (1000 * 60 * 60);
      if (horasDesdeAudio <= 24 && ctx.env?.OPENAI_API_KEY) {
        console.log(`🔊 [PENDING] CEO ${nombreCEO} respondió template - enviando audio TTS`);
        try {
          const { createTTSService } = await import('../services/ttsService');
          const tts = createTTSService(ctx.env.OPENAI_API_KEY);
          const audioResult = await tts.generateAudio(pendingAudioCEO.texto);
          if (audioResult.success && audioResult.audioBuffer) {
            await ctx.meta.sendVoiceMessage(cleanPhone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
            console.log(`✅ Audio TTS entregado a CEO (${audioResult.audioBuffer.byteLength} bytes)`);
          }
        } catch (ttsErr) {
          console.error('⚠️ Error generando audio TTS:', ttsErr);
        }

        const { pending_audio, ...notasSinPendingAudio } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPendingAudio, last_sara_interaction: new Date().toISOString() }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING MENSAJE GENÉRICO CEO (notificaciones de citas, alertas, etc.)
    const pendingMensajeCEO = notasCEO?.pending_mensaje;
    if (pendingMensajeCEO?.sent_at && pendingMensajeCEO?.mensaje_completo) {
      if (!isPendingExpired(pendingMensajeCEO, 'notificacion')) {
        console.log(`📬 [PENDING] CEO ${nombreCEO} respondió template - enviando mensaje pendiente`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingMensajeCEO.mensaje_completo);

        const { pending_mensaje, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString() }
        }).eq('id', ceo.id);
        return;
      }
    }

    // PENDING ALERTA LEAD CEO (alertas prioritarias)
    const pendingAlertaLeadCEO = notasCEO?.pending_alerta_lead;
    if (pendingAlertaLeadCEO?.sent_at && pendingAlertaLeadCEO?.mensaje_completo) {
      if (!isPendingExpired(pendingAlertaLeadCEO, 'notificacion')) {
        console.log(`🔥 [PENDING] CEO ${nombreCEO} respondió template - enviando alerta de lead`);
        await ctx.meta.sendWhatsAppMessage(cleanPhone, pendingAlertaLeadCEO.mensaje_completo);

        const { pending_alerta_lead, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: { ...notasSinPending, last_sara_interaction: new Date().toISOString() }
        }).eq('id', ceo.id);
        return;
      }
    }

    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║  CRÍTICO - NO MODIFICAR SIN CORRER TESTS: npm test                      ║
    // ║  Test file: src/tests/conversationLogic.test.ts                         ║
    // ║  Lógica: src/utils/conversationLogic.ts → shouldForwardToLead()         ║
    // ║                                                                         ║
    // ║  Bridge = Chat directo CEO/Vendedor ↔ Lead (6 min)                     ║
    // ║  - NO reenviar comandos (#cerrar, bridge X, etc)                        ║
    // ║  - SÍ reenviar mensajes normales                                        ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    // ═══════════════════════════════════════════════════════════
    // BRIDGE ACTIVO - Reenviar mensaje directo al lead
    // Esto debe ir PRIMERO antes de cualquier otro procesamiento
    // ═══════════════════════════════════════════════════════════
    const activeBridge = notasCEO?.active_bridge;
    if (activeBridge && activeBridge.expires_at && new Date(activeBridge.expires_at) > new Date()) {
      // Si es comando cerrar, procesarlo (solo con #)
      if (mensaje === '#cerrar' || mensaje === '#fin') {
        // Continuar al handler de cerrar más abajo
      } else {
        // Reenviar mensaje al lead CON formato (simétrico)
        console.log('🔗 BRIDGE CEO activo, reenviando mensaje a:', activeBridge.lead_name);

        const leadPhone = activeBridge.lead_phone;
        if (leadPhone) {
          // Enviar mensaje con formato igual que cuando el lead responde
          const msgFormateado = `💬 *${nombreCEO}:*\n${body}`;
          await ctx.meta.sendWhatsAppMessage(leadPhone, msgFormateado);

          // Actualizar last_activity (NO extender automáticamente)
          notasCEO.active_bridge.last_activity = new Date().toISOString();
          await ctx.supabase.client
            .from('team_members')
            .update({ notes: notasCEO })
            .eq('id', ceo.id);

          // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
          if (activeBridge.lead_id) {
            await ctx.supabase.client.from('lead_activities').insert({
              lead_id: activeBridge.lead_id,
              team_member_id: ceo.id,
              activity_type: 'whatsapp',
              notes: `Mensaje bridge a ${activeBridge.lead_name}: "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"`,
              created_at: new Date().toISOString()
            });
          }

          console.log(`✅ Mensaje bridge reenviado a ${activeBridge.lead_name}`);
        }
        return;
      }
    }

    const pendingBirthdayResponse = notasCEO?.pending_birthday_response;
    if (pendingBirthdayResponse && pendingBirthdayResponse.type === 'cumpleanos_equipo') {
      const sentAt = pendingBirthdayResponse.sent_at ? new Date(pendingBirthdayResponse.sent_at) : null;
      const horasTranscurridas = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60 * 60) : 999;

      if (horasTranscurridas <= 48) {
        console.log(`🎂 CEO ${nombreCEO} respondiendo a felicitación de cumpleaños`);

        const respuestaCumple = `¡Gracias ${nombreCEO}! 🎉\n\n` +
          `Nos alegra mucho tu respuesta. ¡Esperamos que la pases increíble en tu día especial!\n\n` +
          `Todo el equipo te manda un abrazo. 🤗`;

        await ctx.meta.sendWhatsAppMessage(cleanPhone, respuestaCumple);

        // Limpiar pending_birthday_response
        const { pending_birthday_response, ...notasSinPending } = notasCEO;
        await ctx.supabase.client.from('team_members').update({
          notes: {
            ...notasSinPending,
            birthday_response_received: {
              at: new Date().toISOString(),
              message: body.substring(0, 200)
            }
          }
        }).eq('id', ceo.id);

        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PRIMERO: Verificar pending_show_confirmation (pregunta ¿LLEGÓ?)
    // Los CEOs también pueden recibir estas preguntas si son vendedores
    // ═══════════════════════════════════════════════════════════
    const showConfirmResult = await handler.procesarRespuestaShowConfirmation(ceo.id, mensaje);
    if (showConfirmResult.handled) {
      await ctx.meta.sendWhatsAppMessage(cleanPhone, showConfirmResult.mensajeVendedor!);

      // Si el lead SÍ llegó, enviar encuesta de satisfacción
      if (showConfirmResult.siLlego && showConfirmResult.leadPhone) {
        await handler.enviarEncuestaSatisfaccion(showConfirmResult.leadPhone, showConfirmResult.leadName, showConfirmResult.property);
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
                    vendedor_id: ceo.id,
                    vendedor_name: nombreCEO,
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

      return;
    }

    // ═══════════════════════════════════════════════════════════
    // SELECCIÓN DE LEAD PENDIENTE (cuando hay múltiples)
    // ═══════════════════════════════════════════════════════════
    const pendingSelection = notasCEO?.pending_lead_selection;
    if (pendingSelection && pendingSelection.leads) {
      const sentAt = pendingSelection.timestamp ? new Date(pendingSelection.timestamp) : null;
      const minutosTranscurridos = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60) : 999;

      if (minutosTranscurridos <= 10) {
        const num = parseInt(mensaje);
        if (!isNaN(num) && num >= 1 && num <= pendingSelection.leads.length) {
          const selectedLead = pendingSelection.leads[num - 1];
          const actionType = pendingSelection.action_type || 'mensaje'; // mensaje o bridge
          console.log(`✅ CEO seleccionó lead #${num}: ${selectedLead.name} para ${actionType}`);

          // Limpiar selección
          delete notasCEO.pending_lead_selection;

          if (actionType === 'bridge') {
            // ═══ ACTIVAR BRIDGE ═══
            await ctx.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);
            await ceoBridgeLeadDirect(ctx, handler, cleanPhone, selectedLead, ceo, nombreCEO);
          } else {
            // ═══ MENSAJE INTERMEDIADO ═══
            const leadPhone = selectedLead.phone?.replace(/\D/g, '');
            notasCEO.pending_message_to_lead = {
              lead_id: selectedLead.id,
              lead_name: selectedLead.name,
              lead_phone: leadPhone?.startsWith('521') ? leadPhone : '521' + leadPhone?.slice(-10),
              timestamp: new Date().toISOString()
            };
            await ctx.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);

            await ctx.meta.sendWhatsAppMessage(cleanPhone,
              `💬 ¿Qué le quieres decir a *${selectedLead.name}*?\n\n_Escribe tu mensaje y se lo enviaré._`
            );
          }
          return;
        }
      } else {
        // Expirado, limpiar
        delete notasCEO.pending_lead_selection;
        await ctx.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // MENSAJE PENDIENTE A LEAD (Sara como intermediario)
    // ═══════════════════════════════════════════════════════════
    const pendingMsgToLead = notasCEO?.pending_message_to_lead;
    if (pendingMsgToLead && pendingMsgToLead.lead_phone) {
      const sentAt = pendingMsgToLead.timestamp ? new Date(pendingMsgToLead.timestamp) : null;
      const minutosTranscurridos = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60) : 999;

      // Solo válido por 30 minutos
      if (minutosTranscurridos <= 30) {
        console.log(`💬 CEO ${nombreCEO} enviando mensaje (intermediario) a ${pendingMsgToLead.lead_name}`);

        // Enviar mensaje al lead CON FORMATO DE INTERMEDIARIO
        const mensajeParaLead = `💬 *Mensaje de ${ceo.name}:*\n\n"${body}"\n\n_Puedes responder aquí y le haré llegar tu mensaje._`;
        await ctx.meta.sendWhatsAppMessage(pendingMsgToLead.lead_phone, mensajeParaLead);

        // Guardar contexto para que cuando el lead responda, se reenvíe al CEO
        const { data: leadData } = await ctx.supabase.client
          .from('leads')
          .select('notes')
          .eq('id', pendingMsgToLead.lead_id)
          .single();

        let leadNotes: any = safeJsonParse(leadData?.notes);
        leadNotes.pending_response_to = {
          team_member_id: ceo.id,
          team_member_name: ceo.name,
          team_member_phone: cleanPhone,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
        };
        await ctx.supabase.client.from('leads').update({ notes: leadNotes }).eq('id', pendingMsgToLead.lead_id);

        // Limpiar pending y confirmar al CEO
        delete notasCEO.pending_message_to_lead;
        await ctx.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);

        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `✅ *Mensaje enviado a ${pendingMsgToLead.lead_name}*\n\n` +
          `"${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"\n\n` +
          `_Cuando responda, te haré llegar su mensaje._`
        );

        return;
      } else {
        // Expirado, limpiar
        delete notasCEO.pending_message_to_lead;
        await ctx.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);
      }
    }

    const ceoService = new CEOCommandsService(ctx.supabase);
    const result = ceoService.detectCommand(mensaje, body, nombreCEO);
    console.log(`📤 CEO Action: ${result.action}, Phone: ${cleanPhone}`);

    switch (result.action) {
      case 'send_message':
        console.log('📤 CEO: Enviando mensaje directo');
        await ctx.meta.sendWhatsAppMessage(cleanPhone, result.message!);
        return;

      case 'call_handler':
        console.log('📤 CEO: Ejecutando handler:', result.handlerName);
        await executeCEOHandler(ctx, handler, from, body, ceo, nombreCEO, teamMembers, result.handlerName!, result.handlerParams);
        return;

      case 'not_recognized':
        // ━━━ FALLBACK: Intentar comandos de asesor (preaprobado, rechazado, etc.) ━━━
        console.log('📤 CEO: Comando CEO no reconocido, intentando comandos de asesor...');
        const asesorService = new AsesorCommandsService(ctx.supabase);
        const asesorResult = asesorService.detectCommand(mensaje, body, nombreCEO);

        if (asesorResult.action === 'call_handler') {
          console.log('📤 CEO: Comando reconocido como asesor:', asesorResult.handlerName);
          await handler.executeAsesorHandler(from, body, ceo, nombreCEO, teamMembers, asesorResult.handlerName!, asesorResult.handlerParams);
          return;
        }
        if (asesorResult.action === 'send_message') {
          await ctx.meta.sendWhatsAppMessage(cleanPhone, asesorResult.message!);
          return;
        }

        // ━━━ FALLBACK 2: Intentar comandos de vendedor ━━━
        console.log('📤 CEO: Comando no es asesor, intentando comandos de vendedor...');
        const vendorService = new VendorCommandsService(ctx.supabase);
        const vendorResult = vendorService.detectCommand(mensaje, nombreCEO);

        if (vendorResult.action === 'call_handler') {
          console.log('📤 CEO: Comando reconocido como vendedor:', vendorResult.handlerName);
          await handler.executeVendedorHandler(from, body, ceo, nombreCEO, teamMembers, vendorResult.handlerName!, vendorResult.handlerParams);
          return;
        }
        if (vendorResult.action === 'send_message') {
          await ctx.meta.sendWhatsAppMessage(cleanPhone, vendorResult.message!);
          return;
        }

        // ━━━ FALLBACK 3: Intentar comandos de agencia/marketing ━━━
        console.log('📤 CEO: Comando no es vendedor, intentando comandos de agencia...');
        const agenciaService = new AgenciaCommandsService(ctx.supabase);
        const agenciaResult = agenciaService.detectCommand(mensaje, body, nombreCEO);

        if (agenciaResult.action === 'call_handler') {
          console.log('📤 CEO: Comando reconocido como agencia:', agenciaResult.handlerName);
          await handler.executeAgenciaHandlerForCEO(from, body, ceo, nombreCEO, agenciaResult.handlerName!);
          return;
        }
        if (agenciaResult.action === 'send_message') {
          await ctx.meta.sendWhatsAppMessage(cleanPhone, agenciaResult.message!);
          return;
        }

        // Si no es ni CEO, ni asesor, ni vendedor, ni agencia, mostrar mensaje original
        console.log('📤 CEO: Comando no reconocido (ni CEO, ni asesor, ni vendedor, ni agencia)');
        await ctx.meta.sendWhatsAppMessage(cleanPhone, result.message!);
        return;
    }
}

// ═══════════════════════════════════════════════════════════════
// EXECUTE CEO HANDLER
// ═══════════════════════════════════════════════════════════════

export async function executeCEOHandler(ctx: HandlerContext, handler: any, from: string, body: string, ceo: any, nombreCEO: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
    const ceoService = new CEOCommandsService(ctx.supabase);
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

    // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
    const handlerResult = await ceoService.executeHandler(
      handlerName,
      nombreCEO,
      params || {}
    );

    // Si el servicio manejó el comando
    if (handlerResult.message) {
      console.log(`📤 CEO Handler ${handlerName}: Enviando respuesta`);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, handlerResult.message);
      return;
    }

    // Error sin necesidad de handler externo
    if (handlerResult.error && !handlerResult.needsExternalHandler) {
      await ctx.meta.sendWhatsAppMessage(cleanPhone, handlerResult.error);
      return;
    }

    // ━━━ FALLBACK: Handlers que requieren lógica externa ━━━
    switch (handlerName) {
      // ━━━ CITAS ━━━
      case 'vendedorCitasHoy':
        await handler.vendedorCitasHoy(from, ceo, nombreCEO);
        break;
      case 'vendedorCitasManana':
        await handler.vendedorCitasManana(from, ceo, nombreCEO);
        break;
      case 'vendedorCancelarCita':
        await handler.vendedorCancelarCita(from, body, ceo, nombreCEO);
        break;
      case 'vendedorReagendarCita':
        await handler.vendedorReagendarCita(from, body, ceo, nombreCEO);
        break;
      case 'vendedorAgendarCitaCompleta':
        await handler.vendedorAgendarCitaCompleta(from, body, ceo, nombreCEO);
        break;

      // ━━━ SEGMENTOS / BROADCAST ━━━
      case 'verSegmentos':
        await handler.verSegmentos(from, nombreCEO);
        break;
      case 'iniciarBroadcast':
        await handler.iniciarBroadcast(from, nombreCEO);
        break;
      case 'enviarASegmento':
        await handler.enviarASegmento(from, body, ceo);
        break;
      case 'previewSegmento':
        await handler.previewSegmento(from, body);
        break;

      // ━━━ EVENTOS ━━━
      case 'verEventos':
        await handler.verEventos(from, nombreCEO);
        break;
      case 'crearEvento':
        await handler.crearEvento(from, body, ceo);
        break;
      case 'invitarEvento':
        await handler.invitarEvento(from, body, ceo);
        break;
      case 'verRegistrados':
        await handler.verRegistrados(from, body);
        break;

      // ━━━ PROMOCIONES ━━━
      case 'verPromociones':
        await handler.verPromociones(from, nombreCEO);
        break;
      case 'crearPromocion':
        await handler.crearPromocion(from, body, ceo);
        break;
      case 'pausarPromocion':
        await handler.pausarPromocion(from, body);
        break;
      case 'activarPromocion':
        await handler.activarPromocion(from, body);
        break;

      // ━━━ MENSAJE A LEAD (Sara intermediario) ━━━
      case 'mensajeLead':
        await ceoMensajeLead(ctx, handler, from, params?.nombreLead, ceo, nombreCEO);
        break;

      // ━━━ BRIDGE / CHAT DIRECTO ━━━
      case 'bridgeLead':
        await ceoBridgeLead(ctx, handler, from, params?.nombreLead, ceo, nombreCEO, params?.mensajeInicial);
        break;

      // ━━━ NUEVO LEAD ━━━
      case 'ceoNuevoLead':
        await ceoNuevoLead(ctx, handler, from, params?.nombre, params?.telefono, params?.desarrollo, ceo);
        break;

      // ━━━ EXTENDER BRIDGE ━━━
      case 'extenderBridge':
        await ceoExtenderBridge(ctx, handler, from, ceo, nombreCEO);
        break;

      // ━━━ CERRAR BRIDGE ━━━
      case 'cerrarBridge':
        await ceoCerrarBridge(ctx, handler, from, ceo, nombreCEO);
        break;

      // ━━━ VER ACTIVIDAD / BITÁCORA ━━━
      case 'verActividad':
        await handler.mostrarActividadesHoy(from, ceo);
        break;

      // ━━━ MOVER LEAD EN FUNNEL ━━━
      case 'ceoMoverLead':
        await ceoMoverLead(ctx, handler, from, params?.nombreLead, params?.direccion, ceo);
        break;

      // ━━━ QUIEN ES - BUSCAR LEAD ━━━
      case 'ceoQuienEs':
        await ceoQuienEs(ctx, handler, from, params?.nombreLead);
        break;

      // ━━━ BROCHURE ━━━
      case 'ceoBrochure':
        await ceoBrochure(ctx, handler, from, params?.desarrollo);
        break;

      // ━━━ UBICACION ━━━
      case 'ceoUbicacion':
        await ceoUbicacion(ctx, handler, from, params?.desarrollo);
        break;

      // ━━━ VIDEO ━━━
      case 'ceoVideo':
        await ceoVideo(ctx, handler, from, params?.desarrollo);
        break;

      // ━━━ VER LEAD (historial/info) ━━━
      case 'ceoVerLead':
        await ceoVerLead(ctx, handler, from, params?.identificador);
        break;

      // ━━━ COMANDOS DE VENDEDOR PARA CEO ━━━
      case 'vendedorResumenLeads':
        await handler.vendedorResumenLeads(from, ceo, nombreCEO);
        break;

      case 'vendedorLeadsHot':
        await handler.vendedorLeadsHot(from, ceo, nombreCEO);
        break;

      case 'vendedorAgregarNota':
        await handler.vendedorAgregarNotaConParams(from, params?.nombreLead, params?.nota, ceo, nombreCEO);
        break;

      case 'vendedorVerNotas':
        await handler.vendedorVerNotasConParams(from, params?.nombreLead, ceo, nombreCEO);
        break;

      case 'vendedorCoaching':
        await handler.vendedorCoaching(from, '', ceo, nombreCEO);
        break;

      // ━━━ TRACKING DE OFERTAS ━━━
      case 'trackingOfertas':
        await ceoTrackingOfertas(ctx, handler, from, nombreCEO);
        break;

      default:
        console.log('Handler CEO no reconocido:', handlerName);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO MENSAJE A LEAD - Buscar lead y preparar bridge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoMensajeLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, ceo: any, nombreCEO: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`💬 CEO ${nombreCEO} quiere enviar mensaje a: ${nombreLead}`);

    try {
      // Buscar lead por nombre
      const { data: leads } = await ctx.supabase.client
        .from('leads')
        .select('id, name, phone, status')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      if (!leads || leads.length === 0) {
        // Buscar sugerencias de nombres similares
        const { data: recentLeads } = await ctx.supabase.client
          .from('leads')
          .select('name')
          .order('created_at', { ascending: false })
          .limit(100);

        if (recentLeads && recentLeads.length > 0) {
          const similarity = (a: string, b: string): number => {
            a = a.toLowerCase(); b = b.toLowerCase();
            if (a === b) return 1;
            if (a.startsWith(b) || b.startsWith(a)) return 0.8;
            if (a.includes(b) || b.includes(a)) return 0.6;
            let matches = 0;
            const minLen = Math.min(a.length, b.length);
            for (let i = 0; i < minLen; i++) { if (a[i] === b[i]) matches++; }
            return matches / Math.max(a.length, b.length);
          };

          const sugerencias = recentLeads
            .map(l => ({ name: l.name, score: similarity(l.name?.split(' ')[0] || '', nombreLead) }))
            .filter(s => s.score >= 0.4 && s.name)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.name?.split(' ')[0]);

          const sugerenciasUnicas = [...new Set(sugerencias)];

          if (sugerenciasUnicas.length > 0) {
            await ctx.meta.sendWhatsAppMessage(cleanPhone,
              `❌ No encontré "${nombreLead}"\n\n💡 *¿Quisiste decir?*\n` +
              sugerenciasUnicas.map(s => `• ${s}`).join('\n')
            );
            return;
          }
        }

        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré ningún lead con nombre "${nombreLead}"`);
        return;
      }

      if (leads.length > 1) {
        // Guardar selección pendiente
        let notes: any = safeJsonParse(ceo.notes);
        notes.pending_lead_selection = {
          leads: leads.map((l: any) => ({ id: l.id, name: l.name, phone: l.phone })),
          action: 'mensaje',
          timestamp: new Date().toISOString()
        };
        await ctx.supabase.client.from('team_members').update({ notes }).eq('id', ceo.id);

        let msg = `📋 Encontré ${leads.length} leads:\n\n`;
        leads.forEach((l: any, i: number) => {
          msg += `${i + 1}. *${l.name}* - ${l.phone?.slice(-10) || 'sin tel'}\n`;
        });
        msg += `\n💡 Responde con el número (1, 2, etc.)`;
        await ctx.meta.sendWhatsAppMessage(cleanPhone, msg);
        return;
      }

      const lead = leads[0];
      const leadPhone = lead.phone?.replace(/\D/g, '');

      if (!leadPhone) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ ${lead.name} no tiene teléfono registrado.`);
        return;
      }

      // Guardar pending para esperar el mensaje
      let notes: any = safeJsonParse(ceo.notes);
      notes.pending_message_to_lead = {
        lead_id: lead.id,
        lead_name: lead.name,
        lead_phone: leadPhone.startsWith('521') ? leadPhone : '521' + leadPhone.slice(-10),
        timestamp: new Date().toISOString()
      };

      await ctx.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', ceo.id);

      await ctx.meta.sendWhatsAppMessage(cleanPhone,
        `💬 ¿Qué le quieres decir a *${lead.name}*?\n\n_Escribe tu mensaje y se lo enviaré._`
      );
      console.log(`💬 CEO esperando mensaje para ${lead.name}`);

    } catch (e) {
      console.error('❌ Error en ceoMensajeLead:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error. Intenta de nuevo.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO BRIDGE - Activar chat directo con lead
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoBridgeLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, ceo: any, nombreCEO: string, mensajeInicial?: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔗 CEO ${nombreCEO} quiere bridge con: ${nombreLead}`);

    try {
      // Buscar lead por nombre
      const { data: leads } = await ctx.supabase.client
        .from('leads')
        .select('id, name, phone, status')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      if (!leads || leads.length === 0) {
        // Buscar sugerencias de nombres similares
        const { data: recentLeads } = await ctx.supabase.client
          .from('leads')
          .select('name')
          .order('created_at', { ascending: false })
          .limit(100);

        if (recentLeads && recentLeads.length > 0) {
          // Función simple de similitud
          const similarity = (a: string, b: string): number => {
            a = a.toLowerCase();
            b = b.toLowerCase();
            if (a === b) return 1;
            if (a.startsWith(b) || b.startsWith(a)) return 0.8;
            if (a.includes(b) || b.includes(a)) return 0.6;
            // Comparar primeras letras
            let matches = 0;
            const minLen = Math.min(a.length, b.length);
            for (let i = 0; i < minLen; i++) {
              if (a[i] === b[i]) matches++;
            }
            return matches / Math.max(a.length, b.length);
          };

          // Encontrar nombres similares
          const sugerencias = recentLeads
            .map(l => ({ name: l.name, score: similarity(l.name?.split(' ')[0] || '', nombreLead) }))
            .filter(s => s.score >= 0.4 && s.name)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.name?.split(' ')[0]); // Solo primer nombre

          // Eliminar duplicados
          const sugerenciasUnicas = [...new Set(sugerencias)];

          if (sugerenciasUnicas.length > 0) {
            await ctx.meta.sendWhatsAppMessage(cleanPhone,
              `❌ No encontré "${nombreLead}"\n\n` +
              `💡 *¿Quisiste decir?*\n` +
              sugerenciasUnicas.map(s => `• bridge ${s}`).join('\n')
            );
            return;
          }
        }

        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré ningún lead con nombre "${nombreLead}"`);
        return;
      }

      if (leads.length > 1) {
        // Guardar selección pendiente para bridge
        const { data: ceoData } = await ctx.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', ceo.id)
          .single();

        const notes = safeJsonParse(ceoData?.notes);

        notes.pending_lead_selection = {
          leads: leads.map(l => ({ id: l.id, name: l.name, phone: l.phone })),
          action_type: 'bridge',
          timestamp: new Date().toISOString()
        };

        await ctx.supabase.client.from('team_members').update({ notes }).eq('id', ceo.id);

        let msg = `📋 Encontré ${leads.length} leads:\n\n`;
        leads.forEach((l: any, i: number) => {
          msg += `${i + 1}. *${l.name}* - ${l.phone?.slice(-10) || 'sin tel'}\n`;
        });
        msg += `\n💡 Responde con el *número* para activar bridge.`;
        await ctx.meta.sendWhatsAppMessage(cleanPhone, msg);
        return;
      }

      const lead = leads[0];
      const leadPhone = lead.phone?.replace(/\D/g, '');

      if (!leadPhone) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ ${lead.name} no tiene teléfono registrado.`);
        return;
      }

      const leadPhoneFormatted = leadPhone.startsWith('521') ? leadPhone : '521' + leadPhone.slice(-10);

      // Activar bridge usando el servicio
      const bridgeService = new BridgeService(ctx.supabase);
      const bridgeResult = await bridgeService.activarBridge(
        ceo.id,
        ceo.name,
        from,
        lead.id,
        lead.name,
        leadPhoneFormatted
      );

      if (!bridgeResult.success) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error activando bridge: ${bridgeResult.error}`);
        return;
      }

      // Notificar al lead
      await ctx.meta.sendWhatsAppMessage(leadPhoneFormatted,
        `🔗 *Chat directo activado*\n\n` +
        `*${ceo.name}* quiere hablar contigo directamente.\n\n` +
        `Los próximos mensajes irán directo a él por *6 minutos*.\n\n` +
        `_Escribe tu mensaje:_`
      );

      // Notificar al CEO y enviar mensaje inicial si existe
      if (mensajeInicial) {
        // Si hay mensaje inicial, enviarlo directamente al lead
        await ctx.meta.sendWhatsAppMessage(leadPhoneFormatted, mensajeInicial);

        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `🔗 *Bridge activado con ${lead.name}*\n\n` +
          `✅ Tu mensaje ya fue enviado.\n\n` +
          `El bridge estará activo por *6 minutos*.\n` +
          `_Puedes seguir escribiendo mensajes._`
        );
      } else {
        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `🔗 *Bridge activado con ${lead.name}*\n\n` +
          `Tus mensajes irán directo a ${lead.name} por *6 minutos*.\n\n` +
          `_Escribe tu mensaje:_`
        );
      }

      // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
      const { error: activityError } = await ctx.supabase.client.from('lead_activities').insert({
        lead_id: lead.id,
        team_member_id: ceo.id,
        activity_type: 'whatsapp',
        notes: mensajeInicial ? `Bridge iniciado con ${lead.name} (6 min) + mensaje inicial` : `Bridge iniciado con ${lead.name} (6 min)`,
        created_at: new Date().toISOString()
      });
      if (activityError) {
        console.error('❌ Error registrando actividad bridge_start:', activityError);
      } else {
        console.log('📝 Actividad bridge_start registrada para', ceo.name, 'lead:', lead.id);
      }

      console.log(`🔗 Bridge activado: ${ceo.name} ↔ ${lead.name}`);

    } catch (e) {
      console.error('❌ Error en ceoBridgeLead:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error. Intenta de nuevo.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO BRIDGE DIRECTO - Activar bridge con lead ya seleccionado
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoBridgeLeadDirect(ctx: HandlerContext, handler: any, cleanPhone: string, lead: any, ceo: any, nombreCEO: string): Promise<void> {
    try {
      const leadPhone = lead.phone?.replace(/\D/g, '');
      if (!leadPhone) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ ${lead.name} no tiene teléfono registrado.`);
        return;
      }

      const leadPhoneFormatted = leadPhone.startsWith('521') ? leadPhone : '521' + leadPhone.slice(-10);

      // Activar bridge usando el servicio
      const bridgeService = new BridgeService(ctx.supabase);
      const bridgeResult = await bridgeService.activarBridge(
        ceo.id,
        ceo.name,
        cleanPhone,
        lead.id,
        lead.name,
        leadPhoneFormatted
      );

      if (!bridgeResult.success) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error activando bridge: ${bridgeResult.error}`);
        return;
      }

      // Notificar al lead
      await ctx.meta.sendWhatsAppMessage(leadPhoneFormatted,
        `🔗 *Chat directo activado*\n\n` +
        `*${ceo.name}* quiere hablar contigo directamente.\n\n` +
        `Los próximos mensajes irán directo a él por *6 minutos*.\n\n` +
        `_Escribe tu mensaje:_`
      );

      // Notificar al CEO
      await ctx.meta.sendWhatsAppMessage(cleanPhone,
        `🔗 *Bridge activado con ${lead.name}*\n\n` +
        `Tus mensajes irán directo a ${lead.name} por *6 minutos*.\n\n` +
        `_Escribe tu mensaje:_`
      );

      // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
      console.log('📝 Intentando registrar actividad bridge_start para lead:', lead.id, 'team_member:', ceo.id);
      const { error: activityError2 } = await ctx.supabase.client.from('lead_activities').insert({
        lead_id: lead.id,
        team_member_id: ceo.id,
        activity_type: 'whatsapp',
        notes: `Bridge iniciado con ${lead.name} (6 min)`,
        created_at: new Date().toISOString()
      });
      if (activityError2) {
        console.error('❌ Error registrando actividad bridge_start:', JSON.stringify(activityError2));
      } else {
        console.log('✅ Actividad bridge_start registrada OK');
      }

      console.log(`🔗 Bridge activado (directo): ${ceo.name} ↔ ${lead.name}`);

    } catch (e) {
      console.error('❌ Error en ceoBridgeLeadDirect:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error activando bridge.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO EXTENDER BRIDGE - Agregar 6 minutos más
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoExtenderBridge(ctx: HandlerContext, handler: any, from: string, ceo: any, nombreCEO: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`⏰ CEO ${nombreCEO} quiere extender bridge`);

    try {
      const { data: ceoData } = await ctx.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', ceo.id)
        .single();

      let notes: any = {};
      try {
        notes = ceoData?.notes ?
          (typeof ceoData.notes === 'string' ? JSON.parse(ceoData.notes) : ceoData.notes) : {};
      } catch { notes = {}; }

      if (!notes.active_bridge) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No tienes un bridge activo para extender.`);
        return;
      }

      // Extender 6 minutos desde ahora
      const nuevoExpira = new Date(Date.now() + 6 * 60 * 1000).toISOString();
      notes.active_bridge.expires_at = nuevoExpira;
      notes.active_bridge.warning_sent = false; // Resetear warning

      await ctx.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', ceo.id);

      // También extender del lado del lead
      if (notes.active_bridge.lead_id) {
        const { data: leadData } = await ctx.supabase.client
          .from('leads')
          .select('notes')
          .eq('id', notes.active_bridge.lead_id)
          .single();

        if (leadData) {
          let leadNotes: any = {};
          try {
            leadNotes = leadData.notes ?
              (typeof leadData.notes === 'string' ? JSON.parse(leadData.notes) : leadData.notes) : {};
          } catch { leadNotes = {}; }

          if (leadNotes.active_bridge_to_vendedor) {
            leadNotes.active_bridge_to_vendedor.expires_at = nuevoExpira;
            await ctx.supabase.client
              .from('leads')
              .update({ notes: leadNotes })
              .eq('id', notes.active_bridge.lead_id);
          }
        }
      }

      const leadName = notes.active_bridge.lead_name || 'el lead';
      await ctx.meta.sendWhatsAppMessage(cleanPhone,
        `✅ *Bridge extendido 6 minutos más*\n\nContinúa tu conversación con ${leadName}.`
      );

      // Notificar al lead
      if (notes.active_bridge.lead_phone) {
        await ctx.meta.sendWhatsAppMessage(notes.active_bridge.lead_phone,
          `✅ *Chat directo extendido 6 min más*\n\nContinúa la conversación.`
        );
      }

      console.log(`✅ Bridge extendido: ${nombreCEO} ↔ ${leadName}`);

    } catch (e) {
      console.error('❌ Error extendiendo bridge:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error extendiendo bridge.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO CERRAR BRIDGE - Terminar chat directo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoCerrarBridge(ctx: HandlerContext, handler: any, from: string, ceo: any, nombreCEO: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔒 CEO ${nombreCEO} quiere cerrar conexiones`);

    try {
      // Obtener notas del CEO
      const { data: ceoData } = await ctx.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', ceo.id)
        .single();

      const notes = safeJsonParse(ceoData?.notes);

      let cerradoAlgo = false;
      let leadsAfectados: string[] = [];

      // ═══ 1. CERRAR BRIDGE ACTIVO ═══
      if (notes.active_bridge) {
        const bridgeInfo = notes.active_bridge;
        delete notes.active_bridge;

        // Limpiar bridge del lead
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

          // Notificar al lead (mensaje simple, sin tecnicismos)
          const leadPhone = bridgeInfo.lead_phone?.replace(/\D/g, '');
          if (leadPhone) {
            await ctx.meta.sendWhatsAppMessage(leadPhone,
              `Listo, si necesitas algo más aquí estoy para ayudarte. 🏠`
            );
          }
        }

        // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
        if (bridgeInfo.lead_id) {
          await ctx.supabase.client.from('lead_activities').insert({
            lead_id: bridgeInfo.lead_id,
            team_member_id: ceo.id,
            activity_type: 'whatsapp',
            notes: `Bridge cerrado con ${bridgeInfo.lead_name}`,
            created_at: new Date().toISOString()
          });
        }

        cerradoAlgo = true;
        console.log(`🔒 Bridge cerrado: ${ceo.name} ↔ ${bridgeInfo.lead_name}`);
      }

      // ═══ 2. CERRAR MENSAJE PENDIENTE (pending_message_to_lead) ═══
      if (notes.pending_message_to_lead) {
        const pendingInfo = notes.pending_message_to_lead;
        delete notes.pending_message_to_lead;
        leadsAfectados.push(pendingInfo.lead_name || 'lead');
        cerradoAlgo = true;
        console.log(`🔒 Mensaje pendiente cancelado para: ${pendingInfo.lead_name}`);
      }

      // ═══ 3. LIMPIAR pending_response_to DE LEADS ═══
      // Buscar leads que tienen pending_response_to apuntando a este CEO
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

        if (leadNotes.pending_response_to?.team_member_id === ceo.id) {
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

      // Guardar notas actualizadas del CEO
      await ctx.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', ceo.id);

      // Confirmar al CEO
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
      console.error('❌ Error en ceoCerrarBridge:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al cerrar conexiones.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO MOVER LEAD - Mover lead en funnel (adelante/atrás)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoMoverLead(ctx: HandlerContext, handler: any, from: string, nombreLead: string, direccion: 'next' | 'prev', ceo: any): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`📌 CEO mover lead: "${nombreLead}" ${direccion}`);

    // Normalizar texto (remover acentos para búsqueda tolerante)
    const normalizar = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreNormalizado = normalizar(nombreLead);
    console.log(`📌 Nombre normalizado: "${nombreNormalizado}"`);

    try {
      // CEO puede ver TODOS los leads - buscar con ilike primero
      let { data: leads } = await ctx.supabase.client
        .from('leads')
        .select('*')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      console.log(`📌 Búsqueda ilike: ${leads?.length || 0} resultados`);

      // Si no encuentra, buscar todos y filtrar manualmente (más tolerante a acentos)
      if (!leads || leads.length === 0) {
        const { data: allLeads, error: allErr } = await ctx.supabase.client
          .from('leads')
          .select('*')
          .limit(100);

        console.log(`📌 Total leads en BD: ${allLeads?.length || 0}, error: ${allErr?.message || 'ninguno'}`);
        if (allLeads && allLeads.length > 0) {
          console.log(`📌 Primeros 5 leads: ${allLeads.slice(0, 5).map(l => l.name).join(', ')}`);
        }

        leads = allLeads?.filter(l => normalizar(l.name || '').includes(nombreNormalizado)) || [];
        console.log(`📌 Búsqueda manual: ${leads.length} resultados`);
      }

      const FUNNEL_STAGES = ['new', 'contacted', 'qualified', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed', 'delivered'];
      const STATUS_ALIASES: Record<string, string> = {
        'visit_scheduled': 'scheduled',
        'negotiating': 'negotiation',
        'sold': 'closed',
      };
      const stageLabels: Record<string, string> = {
        'new': '🆕 Nuevo',
        'contacted': '📞 Contactado',
        'qualified': '✅ Calificado',
        'scheduled': '📅 Cita Agendada',
        'visited': '🏠 Visitado',
        'negotiation': '💰 Negociando',
        'reserved': '📝 Reservado',
        'closed': '✅ Vendido',
        'delivered': '🏠 Entregado',
        // Aliases
        'visit_scheduled': '📅 Cita Agendada',
        'negotiating': '💰 Negociando',
        'sold': '✅ Vendido',
      };

      if (!leads || leads.length === 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré a "${nombreLead}"`);
        return;
      }

      if (leads.length > 1) {
        // Buscar match exacto o parcial más cercano
        const exactMatch = leads.find(l => normalizar(l.name || '') === nombreNormalizado);
        if (exactMatch) {
          leads = [exactMatch];
        } else {
          // Si todos tienen el mismo nombre (duplicados), usar el primero
          const nombresUnicos = new Set(leads.map(l => normalizar(l.name || '')));
          if (nombresUnicos.size === 1) {
            console.log(`📌 Duplicados detectados, usando el primero`);
            leads = [leads[0]];
          } else {
            const lista = leads.map((l, i) => `${i + 1}. ${l.name}`).join('\n');
            await ctx.meta.sendWhatsAppMessage(cleanPhone,
              `🔍 Encontré ${leads.length} leads:\n${lista}\n\n_Sé más específico._`
            );
            return;
          }
        }
      }

      const lead = leads[0] as any;
      console.log(`📌 Lead keys: ${Object.keys(lead).join(', ')}`);
      console.log(`📌 Lead status fields: funnel_status=${lead.funnel_status}, stage=${lead.stage}, status=${lead.status}`);
      let currentStatus = lead.funnel_status || lead.stage || lead.status || 'new';
      // Normalizar aliases al canónico
      if (STATUS_ALIASES[currentStatus]) currentStatus = STATUS_ALIASES[currentStatus];
      const currentIndex = FUNNEL_STAGES.indexOf(currentStatus);
      let newIndex = direccion === 'next' ? currentIndex + 1 : currentIndex - 1;

      if (newIndex < 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `⚠️ ${lead.name} ya está en la primera etapa (${stageLabels[currentStatus] || currentStatus})`);
        return;
      }
      if (newIndex >= FUNNEL_STAGES.length) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `⚠️ ${lead.name} ya está en la última etapa (${stageLabels[currentStatus] || currentStatus})`);
        return;
      }

      const newStage = FUNNEL_STAGES[newIndex];
      // Usar la columna que exista (funnel_status o status)
      const updateCol = lead.funnel_status !== undefined ? 'funnel_status' : (lead.stage !== undefined ? 'stage' : 'status');
      console.log(`📌 Actualizando columna: ${updateCol} = ${newStage}`);
      await ctx.supabase.client.from('leads').update({ [updateCol]: newStage }).eq('id', lead.id);

      await ctx.meta.sendWhatsAppMessage(cleanPhone,
        `✅ *${lead.name}* movido:\n${stageLabels[currentStatus] || currentStatus} → ${stageLabels[newStage] || newStage}`
      );

    } catch (e) {
      console.error('❌ Error en ceoMoverLead:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al mover lead.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO QUIEN ES - Buscar información de un lead
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoQuienEs(ctx: HandlerContext, handler: any, from: string, nombreLead: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔍 CEO busca: "${nombreLead}"`);

    const normalizar = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreNormalizado = normalizar(nombreLead);

    try {
      let { data: leads } = await ctx.supabase.client
        .from('leads')
        .select('id, name, phone, stage, status, created_at, notes, assigned_to')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      // Búsqueda tolerante a acentos si no encuentra
      if (!leads || leads.length === 0) {
        const { data: allLeads } = await ctx.supabase.client
          .from('leads')
          .select('id, name, phone, stage, status, created_at, notes, assigned_to')
          .limit(100);
        leads = allLeads?.filter(l => normalizar(l.name || '').includes(nombreNormalizado)) || [];
      }

      if (!leads || leads.length === 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré a "${nombreLead}"`);
        return;
      }

      if (leads.length === 1) {
        const l = leads[0];
        const { data: vendedor } = l.assigned_to ?
          await ctx.supabase.client.from('team_members').select('name').eq('id', l.assigned_to).single() : { data: null };

        const stageLabels: Record<string, string> = {
          'nuevo': '🆕 Nuevo', 'contactado': '📞 Contactado', 'interesado': '💡 Interesado',
          'cita_agendada': '📅 Cita Agendada', 'visitado': '🏠 Visitado', 'negociacion': '💰 Negociación',
          'apartado': '✍️ Apartado', 'escrituracion': '📝 Escrituración', 'ganado': '🎉 Ganado'
        };

        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `📋 *${l.name}*\n\n` +
          `📱 ${l.phone || 'Sin teléfono'}\n` +
          `📊 ${stageLabels[l.stage || 'nuevo'] || l.stage || 'Sin etapa'}\n` +
          `👤 ${vendedor?.name || 'Sin asignar'}\n` +
          `📅 Registrado: ${new Date(l.created_at).toLocaleDateString('es-MX')}`
        );
      } else {
        const lista = leads.map((l, i) => `${i + 1}. *${l.name}* - ${l.stage || 'nuevo'}`).join('\n');
        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `🔍 Encontré ${leads.length} leads:\n\n${lista}\n\n_Escribe "quien es [nombre completo]" para más detalles._`
        );
      }
    } catch (e) {
      console.error('❌ Error en ceoQuienEs:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al buscar lead.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO NUEVO LEAD - Crear lead con round-robin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoNuevoLead(ctx: HandlerContext, handler: any, from: string, nombre: string, telefono: string, desarrollo: string | null, ceo: any): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`➕ CEO crea lead: ${nombre} ${telefono} ${desarrollo || ''}`);

    try {
      // Normalizar teléfono
      let phoneNormalized = telefono.replace(/\D/g, '');
      if (phoneNormalized.length === 10) {
        phoneNormalized = '521' + phoneNormalized;
      } else if (phoneNormalized.length === 12 && phoneNormalized.startsWith('52')) {
        phoneNormalized = '521' + phoneNormalized.slice(2);
      }

      // Verificar si ya existe
      const { data: existente } = await ctx.supabase.client
        .from('leads')
        .select('id, name, assigned_to')
        .eq('phone', phoneNormalized)
        .limit(1);

      if (existente && existente.length > 0) {
        const { data: vendedor } = existente[0].assigned_to ?
          await ctx.supabase.client.from('team_members').select('name').eq('id', existente[0].assigned_to).single() : { data: null };

        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `⚠️ Este teléfono ya existe:\n\n` +
          `👤 ${existente[0].name}\n` +
          `📱 ${phoneNormalized}\n` +
          `👨‍💼 Asignado a: ${vendedor?.name || 'Sin asignar'}`
        );
        return;
      }

      // Obtener vendedor por round-robin simple
      const { data: vendedores } = await ctx.supabase.client
        .from('team_members')
        .select('*')
        .eq('active', true);

      // Buscar vendedor activo (priorizar role='vendedor')
      const vendedoresActivos = (vendedores || []).filter((v: any) => v.role === 'vendedor');
      const vendedor = vendedoresActivos.length > 0
        ? vendedoresActivos[Math.floor(Math.random() * vendedoresActivos.length)]
        : (vendedores || [])[0] || null;

      // Crear lead
      const { data: nuevoLead, error } = await ctx.supabase.client
        .from('leads')
        .insert({
          name: nombre,
          phone: phoneNormalized,
          property_interest: desarrollo || null,
          assigned_to: vendedor?.id || ceo.id,
          captured_by: ceo.id,
          created_by: ceo.id,
          source: 'ceo_directo',
          status: 'new',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al crear lead: ${error.message}`);
        return;
      }

      const asignadoA = vendedor?.name || 'Ti (sin vendedores disponibles)';

      await ctx.meta.sendWhatsAppMessage(cleanPhone,
        `✅ *Lead creado*\n\n` +
        `👤 ${nombre}\n` +
        `📱 ${phoneNormalized}\n` +
        (desarrollo ? `🏠 Interés: ${desarrollo}\n` : '') +
        `👨‍💼 Asignado a: ${asignadoA}`
      );

      // Notificar al vendedor si no es el CEO
      if (vendedor && vendedor.id !== ceo.id && vendedor.phone) {
        try {
          await ctx.twilio.sendWhatsAppMessage(`whatsapp:+${vendedor.phone}`,
            `🆕 *NUEVO LEAD ASIGNADO*\n\n` +
            `👤 ${nombre}\n` +
            `📱 ${phoneNormalized}\n` +
            (desarrollo ? `🏠 Interés: ${desarrollo}\n` : '') +
            `\n¡Contáctalo pronto!`
          );
        } catch (e) {
          console.error('⚠️ No se pudo notificar al vendedor');
        }
      }

    } catch (e) {
      console.error('❌ Error en ceoNuevoLead:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al crear lead.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO BROCHURE - Enviar brochure de desarrollo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoBrochure(ctx: HandlerContext, handler: any, from: string, desarrollo: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`📄 CEO pide brochure: "${desarrollo}"`);

    try {
      const { data: props } = await ctx.supabase.client
        .from('properties')
        .select('development, brochure_urls')
        .ilike('development', `%${desarrollo}%`)
        .not('brochure_urls', 'is', null)
        .limit(1);

      if (!props || props.length === 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré brochure para "${desarrollo}"`);
        return;
      }

      const prop = props[0];
      let urls: string[] = [];
      if (typeof prop.brochure_urls === 'string') {
        urls = prop.brochure_urls.split(',').map(u => u.trim()).filter(u => u);
      } else if (Array.isArray(prop.brochure_urls)) {
        urls = prop.brochure_urls;
      }

      if (urls.length === 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ ${prop.development} no tiene brochure configurado.`);
        return;
      }

      await ctx.meta.sendWhatsAppMessage(cleanPhone, `📄 *Brochure ${prop.development}*\n\n${urls[0]}`);
    } catch (e) {
      console.error('❌ Error en ceoBrochure:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al obtener brochure.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO UBICACION - Enviar ubicación de desarrollo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoUbicacion(ctx: HandlerContext, handler: any, from: string, desarrollo: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`📍 CEO pide ubicación: "${desarrollo}"`);

    try {
      // Buscar por desarrollo O por nombre del modelo
      let foundByName = false;
      let { data: props } = await ctx.supabase.client
        .from('properties')
        .select('name, development, gps_link, address')
        .ilike('development', `%${desarrollo}%`)
        .limit(1);

      // Si no encuentra por desarrollo, buscar por nombre del modelo
      if (!props || props.length === 0) {
        const { data: byName } = await ctx.supabase.client
          .from('properties')
          .select('name, development, gps_link, address')
          .ilike('name', `%${desarrollo}%`)
          .limit(1);
        props = byName;
        foundByName = true;
      }

      if (!props || props.length === 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré ubicación para "${desarrollo}"`);
        return;
      }

      const prop = props[0];
      if (!prop.gps_link && !prop.address) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ ${prop.development} no tiene ubicación configurada.`);
        return;
      }

      // Solo mostrar nombre del modelo si buscaron por modelo
      const titulo = foundByName && prop.name && prop.name !== prop.development
        ? `${prop.name} (${prop.development})`
        : prop.development;
      let msg = `📍 *Ubicación ${titulo}*\n\n`;
      if (prop.address) msg += `${prop.address}\n\n`;
      if (prop.gps_link) msg += `${prop.gps_link}`;

      await ctx.meta.sendWhatsAppMessage(cleanPhone, msg);
    } catch (e) {
      console.error('❌ Error en ceoUbicacion:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al obtener ubicación.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO VIDEO - Enviar video de desarrollo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoVideo(ctx: HandlerContext, handler: any, from: string, desarrollo: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🎬 CEO pide video: "${desarrollo}"`);

    try {
      // Buscar por desarrollo O por nombre del modelo
      let foundByName = false;
      let { data: props } = await ctx.supabase.client
        .from('properties')
        .select('name, development, video_url, youtube_link')
        .ilike('development', `%${desarrollo}%`)
        .limit(1);

      // Si no encuentra por desarrollo, buscar por nombre del modelo
      if (!props || props.length === 0) {
        const { data: byName } = await ctx.supabase.client
          .from('properties')
          .select('name, development, video_url, youtube_link')
          .ilike('name', `%${desarrollo}%`)
          .limit(1);
        props = byName;
        foundByName = true;
      }

      if (!props || props.length === 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré video para "${desarrollo}"`);
        return;
      }

      const prop = props[0];
      const videoUrl = prop.video_url || prop.youtube_link;

      if (!videoUrl) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ ${prop.development} no tiene video configurado.`);
        return;
      }

      // Solo mostrar nombre del modelo si buscaron por modelo
      const titulo = foundByName && prop.name && prop.name !== prop.development
        ? `${prop.name} (${prop.development})`
        : prop.development;
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `🎬 *Video ${titulo}*\n\n${videoUrl}`);
    } catch (e) {
      console.error('❌ Error en ceoVideo:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al obtener video.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO TRACKING OFERTAS - Ver métricas de ofertas por vendedor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoTrackingOfertas(ctx: HandlerContext, handler: any, from: string, nombreCEO: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`📊 CEO ${nombreCEO} consulta tracking de ofertas`);

    try {
      const offerService = new OfferTrackingService(ctx.supabase);
      const summary = await offerService.getOfferSummary(30);

      let msg = `📋 *TRACKING DE OFERTAS*\n`;
      msg += `_Últimos 30 días_\n\n`;

      // Resumen general
      msg += `*📊 RESUMEN GENERAL*\n`;
      msg += `• Total ofertas: ${summary.total_offers}\n`;
      msg += `• Enviadas: ${summary.sent_count}\n`;
      msg += `• Aceptadas: ${summary.accepted_count} (${summary.acceptance_rate})\n`;
      msg += `• Apartados: ${summary.reserved_count} (${summary.reservation_rate})\n`;
      msg += `• Rechazadas: ${summary.rejected_count} (${summary.rejection_rate})\n\n`;

      // Valores
      msg += `*💰 VALORES*\n`;
      msg += `• Total ofertado: $${summary.total_offered_value.toLocaleString()}\n`;
      msg += `• Total aceptado: $${summary.total_accepted_value.toLocaleString()}\n`;
      msg += `• Descuento promedio: ${summary.avg_discount_percent}%\n\n`;

      // Por vendedor (CLAVE: muestra descuentos por vendedor)
      if (summary.by_vendor && summary.by_vendor.length > 0) {
        msg += `*👥 POR VENDEDOR*\n`;
        summary.by_vendor.slice(0, 5).forEach((v: any) => {
          const discountStr = v.avg_discount > 0 ? ` (dto: ${v.avg_discount}%)` : '';
          msg += `• ${v.vendor_name}: ${v.offers} ofertas`;
          msg += ` → ${v.accepted} aceptadas${discountStr}\n`;
        });
        msg += `\n`;
      }

      // Por desarrollo
      if (summary.by_development && summary.by_development.length > 0) {
        msg += `*🏘️ POR DESARROLLO*\n`;
        summary.by_development.slice(0, 5).forEach((d: any) => {
          msg += `• ${d.development}: ${d.offers} ofertas → ${d.accepted} aceptadas\n`;
        });
        msg += `\n`;
      }

      // Por vencer
      if (summary.expiring_soon && summary.expiring_soon.length > 0) {
        msg += `⚠️ *POR VENCER* (${summary.expiring_soon.length})\n`;
        summary.expiring_soon.slice(0, 3).forEach((o: any) => {
          msg += `• ${o.lead_name} - ${o.development}\n`;
        });
      }

      await ctx.meta.sendWhatsAppMessage(cleanPhone, msg);

    } catch (e) {
      console.error('Error en ceoTrackingOfertas:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al obtener tracking de ofertas. Verifica que la tabla *offers* existe en Supabase.`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO VER LEAD - Ver info y historial de un lead (por teléfono o nombre)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function ceoVerLead(ctx: HandlerContext, handler: any, from: string, identificador: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔍 CEO ver lead: "${identificador}"`);

    try {
      const idLimpio = identificador.replace(/[-\s]/g, '');
      const esTelefono = /^\d{10,15}$/.test(idLimpio);

      let leads: any[] = [];

      if (esTelefono) {
        // Buscar por teléfono (CEO puede ver cualquier lead)
        const { data: foundLeads } = await ctx.supabase.client
          .from('leads')
          .select('id, name, phone, interested_development, lead_score, status, conversation_history, created_at, notes, assigned_to, last_message_at')
          .ilike('phone', `%${idLimpio}%`)
          .limit(1);

        leads = foundLeads || [];
      } else {
        // Buscar por nombre
        const { data } = await ctx.supabase.client
          .from('leads')
          .select('id, name, phone, interested_development, lead_score, status, conversation_history, created_at, notes, assigned_to, last_message_at')
          .ilike('name', `%${identificador}%`)
          .limit(1);

        leads = data || [];
      }

      if (!leads || leads.length === 0) {
        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `❌ No encontré un lead con "${identificador}".\n\n` +
          `💡 Intenta con el teléfono completo (ej: ver 4921234567)`
        );
        return;
      }

      const lead = leads[0];
      const historial = Array.isArray(lead.conversation_history) ? lead.conversation_history : [];

      // Obtener vendedor asignado
      let vendedorNombre = 'Sin asignar';
      if (lead.assigned_to) {
        const { data: vendedor } = await ctx.supabase.client
          .from('team_members')
          .select('name')
          .eq('id', lead.assigned_to)
          .single();
        vendedorNombre = vendedor?.name || 'Desconocido';
      }

      // Formatear teléfono
      const telefonoCorto = lead.phone.replace(/^521/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
      const scoreEmoji = lead.lead_score >= 70 ? '🔥' : lead.lead_score >= 40 ? '🟡' : '🔵';

      // Verificar ventana 24h
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const dentroVentana = lead.last_message_at && lead.last_message_at > hace24h;
      const ventanaStatus = dentroVentana ? '✅ Activo (24h)' : '⚠️ Fuera de ventana';

      // Construir mensaje
      let msg = `📋 *Info de ${lead.name || 'Lead'}*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📱 *Tel:* ${telefonoCorto}\n`;
      msg += `🏠 *Desarrollo:* ${lead.interested_development || 'Sin especificar'}\n`;
      msg += `${scoreEmoji} *Score:* ${lead.lead_score || 0} | *Status:* ${lead.status || 'new'}\n`;
      msg += `👤 *Vendedor:* ${vendedorNombre}\n`;
      msg += `📡 *WhatsApp:* ${ventanaStatus}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Mostrar últimos mensajes
      if (historial.length === 0) {
        msg += `_No hay mensajes registrados._\n\n`;
      } else {
        msg += `📝 *Últimos mensajes:*\n\n`;
        const ultimosMensajes = historial.slice(-8);

        for (const m of ultimosMensajes) {
          const esLead = m.role === 'user' || m.from === 'lead' || m.from === 'user';
          const contenido = (m.content || m.message || '').substring(0, 100);
          const hora = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';

          if (esLead) {
            msg += `💬 *Lead* ${hora ? `(${hora})` : ''}: "${contenido}${contenido.length >= 100 ? '...' : ''}"\n\n`;
          } else {
            msg += `🤖 *SARA* ${hora ? `(${hora})` : ''}: "${contenido}${contenido.length >= 100 ? '...' : ''}"\n\n`;
          }
        }

        if (historial.length > 8) {
          msg += `_...y ${historial.length - 8} mensajes anteriores_\n\n`;
        }
      }

      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (dentroVentana) {
        msg += `✍️ *Responde aquí* para enviar mensaje al lead`;
      } else {
        msg += `📤 *Responde 1-3* para enviar template:\n`;
        msg += `*1.* Reactivación | *2.* Seguimiento | *3.* Info crédito`;
      }

      // Guardar contexto para permitir enviar mensaje al lead
      const { data: ceoMember } = await ctx.supabase.client
        .from('team_members')
        .select('id, notes')
        .eq('phone', cleanPhone)
        .single();

      if (ceoMember) {
        const notasCeo = typeof ceoMember.notes === 'object' ? ceoMember.notes : {};

        if (dentroVentana) {
          // Dentro de 24h - permitir mensaje directo
          await ctx.supabase.client.from('team_members')
            .update({
              notes: {
                ...notasCeo,
                pending_message_to_lead: {
                  lead_id: lead.id,
                  lead_name: lead.name || 'Lead',
                  lead_phone: lead.phone,
                  timestamp: new Date().toISOString()
                }
              }
            })
            .eq('id', ceoMember.id);
        } else {
          // Fuera de 24h - permitir selección de template
          await ctx.supabase.client.from('team_members')
            .update({
              notes: {
                ...notasCeo,
                pending_template_selection: {
                  lead_id: lead.id,
                  lead_name: lead.name || 'Lead',
                  lead_phone: lead.phone,
                  timestamp: new Date().toISOString()
                }
              }
            })
            .eq('id', ceoMember.id);
        }
      }

      await ctx.meta.sendWhatsAppMessage(cleanPhone, msg);

    } catch (e) {
      console.error('❌ Error en ceoVerLead:', e);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al buscar lead.`);
    }
}
