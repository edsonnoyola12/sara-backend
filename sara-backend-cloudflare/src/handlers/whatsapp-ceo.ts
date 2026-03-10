// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHATSAPP HANDLER - CEO MODULE
// Extraído de whatsapp.ts para modularización
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { HandlerContext } from './whatsapp-types';
import * as utils from './whatsapp-utils';
import { deliverPendingMessage, findLeadByName, freshNotesUpdate } from './whatsapp-utils';
import { isPendingExpired } from '../utils/teamMessaging';
import { CEOCommandsService } from '../services/ceoCommandsService';
import { AgenciaCommandsService } from '../services/agenciaCommandsService';
import { safeJsonParse } from '../utils/safeHelpers';
import { AsesorCommandsService } from '../services/asesorCommandsService';
import { VendorCommandsService } from '../services/vendorCommandsService';
import { BridgeService } from '../services/bridgeService';
import { OfferTrackingService } from '../services/offerTrackingService';
import { createSLAMonitoring } from '../services/slaMonitoringService';

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

    // Actualizar last_sara_interaction (ventana 24h ahora está abierta) — atomic
    notasCEO.last_sara_interaction = new Date().toISOString();
    await freshNotesUpdate(ctx, ceo.id, n => { n.last_sara_interaction = new Date().toISOString(); });

    // ═══════════════════════════════════════════════════════════
    // 🔗 BRIDGE RÁPIDO: CEO responde "1" ANTES de entregar pendings
    // ═══════════════════════════════════════════════════════════
    if (mensaje === '1' && !notasCEO?.active_bridge) {
      const ultimoLeadBridge = notasCEO?.ultimo_lead_notificado;
      if (ultimoLeadBridge?.lead_id && ultimoLeadBridge?.lead_name) {
        const notifTimeBridge = ultimoLeadBridge.timestamp ? new Date(ultimoLeadBridge.timestamp).getTime() : 0;
        const minutosDesde = (Date.now() - notifTimeBridge) / (1000 * 60);
        if (minutosDesde <= 30) {
          try {
            // Entregar pending primero para contexto
            if (notasCEO?.pending_alerta_lead?.mensaje_completo) {
              await ctx.meta.sendWhatsAppMessage(cleanPhone, notasCEO.pending_alerta_lead.mensaje_completo);
              await freshNotesUpdate(ctx, ceo.id, n => { delete n.pending_alerta_lead; });
              console.log(`📬 Pending alerta_lead entregado a CEO antes de bridge`);
            }
            const bridgeService = new BridgeService(ctx.supabase);
            const bridgeResult = await bridgeService.activarBridge(
              ceo.id, ceo.name, cleanPhone,
              ultimoLeadBridge.lead_id, ultimoLeadBridge.lead_name, ultimoLeadBridge.lead_phone
            );
            if (bridgeResult.success) {
              const nombreCorto = ultimoLeadBridge.lead_name.split(' ')[0];
              await ctx.meta.sendWhatsAppMessage(cleanPhone,
                `🔗 *Chat directo con ${nombreCorto}* activado (6 min)\n\n` +
                `Todo lo que escribas se le enviará directamente.\n` +
                `*#cerrar* para terminar | *#mas* para extender`
              );
              try {
                const ceoNombre = ceo.name || 'Tu asesor';
                await ctx.meta.sendWhatsAppMessage(ultimoLeadBridge.lead_phone,
                  `💬 *${ceoNombre}* de Grupo Santa Rita quiere hablar contigo directamente 🏠\n\n` +
                  `Es tu asesor asignado y te ayudará personalmente con lo que necesites.`
                );
                try {
                  await ctx.meta.sendContactCard(ultimoLeadBridge.lead_phone, {
                    name: ceoNombre,
                    phone: ceo.phone || cleanPhone,
                    company: 'Grupo Santa Rita'
                  });
                } catch (_vcard) {
                  console.log('⚠️ vCard no enviada (no crítico)');
                }
              } catch (_) {}
              console.log(`🔗 Bridge rápido CEO: ${ceo.name} → ${ultimoLeadBridge.lead_name}`);
              return;
            }
          } catch (bridgeErr) {
            console.error('⚠️ Error bridge rápido CEO:', bridgeErr);
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PENDING MESSAGES: Entrega TODOS los pending acumulados (no solo el primero)
    // Usa deliverPendingMessage() que resuelve:
    // 1. Re-lee notes frescas de DB (evita sobreescribir cambios de CRONs)
    // 2. Captura wamid de Meta API (verifica delivery)
    // 3. Verifica errores de Supabase .update() (no falla silenciosamente)
    // ═══════════════════════════════════════════════════════════
    let pendingDelivered = 0;

    // Orden de prioridad: alerta_lead (máxima) → briefing → recap → reportes → video → audio → mensaje
    const pendingChecks: Array<{
      key: string;
      data: any;
      tipo: string;
      contextKey?: string;
      label: string;
      isSpecial?: 'audio' | 'video';
    }> = [
      { key: 'pending_alerta_lead', data: notasCEO?.pending_alerta_lead, tipo: 'notificacion', label: '🔥 alerta de lead' },
      { key: 'pending_briefing', data: notasCEO?.pending_briefing, tipo: 'briefing', contextKey: 'last_briefing_context', label: 'briefing' },
      { key: 'pending_recap', data: notasCEO?.pending_recap, tipo: 'recap', contextKey: 'last_recap_context', label: 'recap' },
      { key: 'pending_reporte_diario', data: notasCEO?.pending_reporte_diario, tipo: 'reporte_diario', contextKey: 'last_reporte_diario_context', label: 'reporte diario' },
      { key: 'pending_reporte_semanal', data: notasCEO?.pending_reporte_semanal, tipo: 'resumen_semanal', contextKey: 'last_reporte_semanal_context', label: 'reporte semanal' },
      { key: 'pending_resumen_semanal', data: notasCEO?.pending_resumen_semanal, tipo: 'resumen_semanal', contextKey: 'last_resumen_semanal_context', label: 'resumen semanal' },
      { key: 'pending_video_semanal', data: notasCEO?.pending_video_semanal, tipo: 'video', label: 'video semanal', isSpecial: 'video' },
      { key: 'pending_audio', data: notasCEO?.pending_audio, tipo: 'audio', label: 'audio TTS', isSpecial: 'audio' },
      { key: 'pending_mensaje', data: notasCEO?.pending_mensaje, tipo: 'notificacion', label: 'mensaje pendiente' },
    ];

    for (const pc of pendingChecks) {
      try {
        // Audio special case
        if (pc.isSpecial === 'audio' && pc.data?.sent_at && pc.data?.texto) {
          const horasDesde = (Date.now() - new Date(pc.data.sent_at).getTime()) / (1000 * 60 * 60);
          if (horasDesde <= 24 && ctx.env?.OPENAI_API_KEY) {
            console.log(`🔊 [PENDING] CEO ${nombreCEO} - enviando ${pc.label}`);
            try {
              const { createTTSService } = await import('../services/ttsService');
              const tts = createTTSService(ctx.env.OPENAI_API_KEY);
              const audioResult = await tts.generateAudio(pc.data.texto);
              if (audioResult.success && audioResult.audioBuffer) {
                await ctx.meta.sendVoiceMessage(cleanPhone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
                console.log(`✅ Audio TTS entregado a CEO (${audioResult.audioBuffer.byteLength} bytes)`);
              }
            } catch (ttsErr) {
              console.error('⚠️ Error generando audio TTS:', ttsErr);
            }
            await deliverPendingMessage(ctx, ceo.id, cleanPhone, pc.key, '__ALREADY_SENT__');
            pendingDelivered++;
          }
          continue;
        }

        // Video special case (24h expiration)
        if (pc.isSpecial === 'video' && pc.data?.sent_at && pc.data?.mensaje_completo) {
          const horasDesde = (Date.now() - new Date(pc.data.sent_at).getTime()) / (1000 * 60 * 60);
          if (horasDesde <= 24) {
            console.log(`🎬 [PENDING] CEO ${nombreCEO} - enviando ${pc.label}`);
            await deliverPendingMessage(ctx, ceo.id, cleanPhone, pc.key, pc.data.mensaje_completo);
            pendingDelivered++;
          }
          continue;
        }

        // Standard pending messages
        if (pc.data?.sent_at && pc.data?.mensaje_completo) {
          if (!isPendingExpired(pc.data, pc.tipo)) {
            console.log(`📬 [PENDING] CEO ${nombreCEO} - enviando ${pc.label}`);
            await deliverPendingMessage(ctx, ceo.id, cleanPhone, pc.key, pc.data.mensaje_completo, pc.contextKey);
            pendingDelivered++;
          }
        }
      } catch (pendingErr) {
        console.error(`⚠️ Error entregando ${pc.key} a CEO ${nombreCEO}:`, pendingErr);
        // Continuar con el siguiente pending, no perder los demás
      }
    }

    if (pendingDelivered > 0) {
      console.log(`✅ ${pendingDelivered} pending(s) entregados a CEO ${nombreCEO}`);
      return;
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

          // ═══ SLA: CEO responded to lead via bridge ═══
          if (activeBridge.lead_id && ctx.env?.SARA_CACHE) {
            try {
              const sla = createSLAMonitoring(ctx.env.SARA_CACHE);
              await sla.trackVendorResponse(activeBridge.lead_id, ceo.id);
            } catch (slaErr) { console.error('⚠️ SLA CEO bridge track error (non-blocking):', slaErr); }
          }

          // Actualizar last_activity (re-read fresh notes to avoid stale overwrite)
          const { data: freshBridge } = await ctx.supabase.client
            .from('team_members').select('notes').eq('id', ceo.id).single();
          const freshBridgeNotes = utils.parseNotasSafe(freshBridge?.notes);
          if (freshBridgeNotes.active_bridge) {
            freshBridgeNotes.active_bridge.last_activity = new Date().toISOString();
          }
          const { error: bridgeErr } = await ctx.supabase.client
            .from('team_members')
            .update({ notes: freshBridgeNotes })
            .eq('id', ceo.id);
          if (bridgeErr) console.error('⚠️ Error updating bridge activity:', bridgeErr);

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

        // Limpiar pending_birthday_response (re-read fresh + error check)
        const { data: freshBday } = await ctx.supabase.client
          .from('team_members').select('notes').eq('id', ceo.id).single();
        const freshBdayNotes = utils.parseNotasSafe(freshBday?.notes);
        delete freshBdayNotes.pending_birthday_response;
        freshBdayNotes.birthday_response_received = {
          at: new Date().toISOString(),
          message: body.substring(0, 200)
        };
        const { error: bdayErr } = await ctx.supabase.client.from('team_members').update({
          notes: freshBdayNotes
        }).eq('id', ceo.id);
        if (bdayErr) console.error('⚠️ Error updating birthday response:', bdayErr);

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
            await freshNotesUpdate(ctx, ceo.id, n => {
              delete n.pending_lead_selection;
              n.last_sara_interaction = new Date().toISOString();
            });
            await ceoBridgeLeadDirect(ctx, handler, cleanPhone, selectedLead, ceo, nombreCEO);
          } else {
            // ═══ MENSAJE INTERMEDIADO ═══
            const leadPhone = selectedLead.phone?.replace(/\D/g, '');
            await freshNotesUpdate(ctx, ceo.id, n => {
              delete n.pending_lead_selection;
              n.pending_message_to_lead = {
                lead_id: selectedLead.id,
                lead_name: selectedLead.name,
                lead_phone: leadPhone?.startsWith('521') ? leadPhone : '521' + leadPhone?.slice(-10),
                timestamp: new Date().toISOString()
              };
              n.last_sara_interaction = new Date().toISOString();
            });

            await ctx.meta.sendWhatsAppMessage(cleanPhone,
              `💬 ¿Qué le quieres decir a *${selectedLead.name}*?\n\n_Escribe tu mensaje y se lo enviaré._`
            );
          }
          return;
        }
      } else {
        // Expirado, limpiar
        await freshNotesUpdate(ctx, ceo.id, n => { delete n.pending_lead_selection; });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // MENSAJE PENDIENTE A LEAD (Sara como intermediario)
    // ═══════════════════════════════════════════════════════════
    const pendingMsgToLead = notasCEO?.pending_message_to_lead;
    // ═══ GUARD: Si parece comando conocido, NO reenviar al lead ═══
    const esComandoCEO = /^(leads?|hoy|pipeline|equipo|ventas|reporte|llamadas|status|funnel|calcular|probabilidad|comparar|mercado|segmentos|referidos|backups|alertas|broadcast|bridge|#cerrar|#mas|#más|mensaje|adelante|atras|atrás|quien|quién|historial|nota|notas|asignar|brochure|ubicacion|video|propiedades|ofertas?|ayuda|help|ver|briefing)/i.test(mensaje);
    if (pendingMsgToLead && pendingMsgToLead.lead_phone && !esComandoCEO) {
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

        // Limpiar pending y confirmar al CEO (atomic)
        await freshNotesUpdate(ctx, ceo.id, n => {
          delete n.pending_message_to_lead;
          n.last_sara_interaction = new Date().toISOString();
        });

        await ctx.meta.sendWhatsAppMessage(cleanPhone,
          `✅ *Mensaje enviado a ${pendingMsgToLead.lead_name}*\n\n` +
          `"${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"\n\n` +
          `_Cuando responda, te haré llegar su mensaje._`
        );

        return;
      } else {
        // Expirado, limpiar (atomic)
        await freshNotesUpdate(ctx, ceo.id, n => { delete n.pending_message_to_lead; });
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
        const vendorResult = vendorService.detectRouteCommand(body, mensaje);

        if (vendorResult.matched && vendorResult.handlerName) {
          console.log('📤 CEO: Comando reconocido como vendedor:', vendorResult.handlerName);
          await handler.executeVendedorHandler(from, body, ceo, nombreCEO, teamMembers, vendorResult.handlerName, vendorResult.handlerParams);
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

      // Send list menu if metadata has vendedores (equipo scorecard)
      if (handlerResult.metadata?.vendedores?.length > 0) {
        try {
          const vendedorRows = handlerResult.metadata.vendedores.slice(0, 10).map((v: any) => ({
            id: `cmd_quien_es_${v.name.toLowerCase().split(' ')[0]}`,
            title: `📊 ${v.name}`.substring(0, 24),
            description: `${v.leads} leads activos`.substring(0, 72)
          }));
          await new Promise(r => setTimeout(r, 300));
          await ctx.meta.sendListMenu(
            cleanPhone,
            'Selecciona un vendedor para ver detalle.',
            'Ver vendedores 👥',
            [{ title: 'Vendedores', rows: vendedorRows }]
          );
        } catch (listErr) {
          console.log('⚠️ No se pudo enviar lista equipo:', listErr);
        }
      }

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
      // Buscar lead por nombre (con fallback accent-tolerant)
      const leads = await findLeadByName(ctx.supabase, nombreLead, {
        select: 'id, name, phone, status',
        limit: 5
      });

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
      // Buscar lead por nombre (con fallback accent-tolerant)
      const leads = await findLeadByName(ctx.supabase, nombreLead, {
        select: 'id, name, phone, status',
        limit: 5
      });

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

    // Normalizar texto para comparación exacta downstream
    const normalizar = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreNormalizado = normalizar(nombreLead);

    try {
      // CEO puede ver TODOS los leads - buscar con accent-tolerant fallback
      let leads = await findLeadByName(ctx.supabase, nombreLead, {
        limit: 5
      });

      console.log(`📌 Búsqueda findLeadByName: ${leads?.length || 0} resultados`);

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

    try {
      const leads = await findLeadByName(ctx.supabase, nombreLead, {
        select: 'id, name, phone, stage, status, created_at, notes, assigned_to',
        limit: 5
      });

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
        // Buscar por nombre (con fallback accent-tolerant)
        leads = await findLeadByName(ctx.supabase, identificador, {
          select: 'id, name, phone, interested_development, lead_score, status, conversation_history, created_at, notes, assigned_to, last_message_at',
          limit: 1
        });
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
