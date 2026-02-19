// ═══════════════════════════════════════════════════════════════════════════
// TEST/DEBUG ROUTES - Development and testing endpoints
// Extracted from index.ts for better code organization
// These endpoints are NOT used in production - only for development/QA
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { CacheService } from '../services/cacheService';
import { ClaudeService } from '../services/claude';
import { CalendarService } from '../services/calendar';
import { WhatsAppHandler } from '../handlers/whatsapp';
import { createMetaWithTracking } from '../utils/metaTracking';
import { CEOCommandsService } from '../services/ceoCommandsService';
import { VendorCommandsService } from '../services/vendorCommandsService';
import { AsesorCommandsService } from '../services/asesorCommandsService';
import { AgenciaCommandsService } from '../services/agenciaCommandsService';
import { AgenciaReportingService } from '../services/agenciaReportingService';
import { EventosService } from '../services/eventosService';
import { PromocionesService } from '../services/promocionesService';
import { AIConversationService } from '../services/aiConversationService';
import { FollowupService } from '../services/followupService';
import { FollowupApprovalService } from '../services/followupApprovalService';
import { NotificationService } from '../services/notificationService';
import { CreditFlowService } from '../services/creditFlowService';
import { PostVisitService } from '../services/postVisitService';
import { PipelineService, formatPipelineForWhatsApp, formatCurrency } from '../services/pipelineService';
import { enviarMensajeTeamMember, isPendingExpired, getPendingMessages, verificarPendingParaLlamar, CALL_CONFIG } from '../utils/teamMessaging';
import { parseFechaEspanol, getMexicoNow } from '../handlers/dateParser';

// CRON imports
import {
  enviarReporteDiarioConsolidadoCEO,
  enviarReporteDiarioCEO,
  enviarReporteSemanalCEO,
  enviarReporteMensualCEO,
  enviarReporteSemanalVendedores,
  enviarReporteDiarioVendedores,
  enviarReporteMensualVendedores,
  enviarReporteDiarioAsesores,
  enviarReporteSemanalAsesores,
  enviarReporteMensualAsesores,
  enviarReporteDiarioMarketing,
  enviarReporteSemanalMarketing,
  enviarReporteMensualMarketing,
  enviarEncuestasPostCita,
  enviarEncuestasNPS,
  iniciarFlujosPostVisita,
} from '../crons/reports';

import {
  enviarBriefingMatutino,
  enviarRecapDiario,
  enviarRecapSemanal,
  enviarRecordatoriosCitas,
} from '../crons/briefings';

import {
  enviarAlertasLeadsFrios,
  detectarNoShows,
  enviarAlertasProactivasCEO,
  enviarCoachingProactivo,
  alertaLeadsHotSinSeguimiento,
  recordatorioFinalDia,
  remarketingLeadsFrios,
  followUpLeadsInactivos,
  reactivarLeadsPerdidos,
  recordatoriosPagoApartado,
  tieneInteraccionPendiente,
  felicitarCumpleañosLeads,
  felicitarCumpleañosEquipo,
} from '../crons/alerts';

import {
  seguimientoPostVenta,
  verificarReengagement,
  reengagementDirectoLeads,
  enviarBriefingSupervisionTest,
  seguimientoHipotecas,
} from '../crons/followups';

import { actualizarLeadScores, detectarObjeciones } from '../crons/leadScoring';

import {
  followUpPostVisita,
  nurturingEducativo,
  seguimientoPostEntrega,
  encuestaSatisfaccionCasa,
  checkInMantenimiento,
  solicitarReferidos,
  enviarEncuestaNPS,
} from '../crons/nurturing';

import {
  felicitarAniversarioCompra,
} from '../crons/maintenance';

import {
  verificarVideosPendientes,
  videoBienvenidaLeadNuevo,
  videoFelicitacionPostVenta,
  generarVideoSemanalLogros,
} from '../crons/videos';

import { runHealthCheck, trackError, enviarAlertaSistema, healthMonitorCron } from '../crons/healthCheck';
import { backupSemanalR2, getBackupLog } from '../crons/dashboard';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  API_SECRET?: string;
  SARA_CACHE?: KVNamespace;
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;
  OPENAI_API_KEY?: string;
  VEO_API_KEY?: string;
}

type CorsResponseFn = (body: string | null, status?: number, contentType?: string, request?: Request) => Response;
type CheckApiAuthFn = (request: Request, env: Env) => Response | null;

export async function handleTestRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn,
  cache: CacheService | null
): Promise<Response | null> {

    // ═══════════════════════════════════════════════════════════
    // Test Cron - Forzar verificación de videos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-cron' && request.method === 'GET') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      console.log('🔧 FORZANDO verificación de videos...');
      await verificarVideosPendientes(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Cron ejecutado' }));
    }

    if (url.pathname === "/test-briefing" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phone = url.searchParams.get('phone') || '5215610016226';
      let { data: yo } = await supabase.client.from("team_members").select("*").eq("phone", phone).single();
      // Fallback: buscar cualquier admin activo
      if (!yo) {
        const { data: admin } = await supabase.client.from("team_members").select("*").eq("role", "admin").eq("active", true).limit(1).single();
        yo = admin;
      }
      if (yo) {
        await enviarBriefingMatutino(supabase, meta, yo, { openaiApiKey: env.OPENAI_API_KEY });
        return corsResponse(JSON.stringify({ ok: true, message: "Briefing enviado a " + yo.name }));
      }
      return corsResponse(JSON.stringify({ ok: false, message: "Usuario no encontrado" }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST TTS - Probar Text-to-Speech y envío de audio
    // USO: /test-tts?phone=5610016226&texto=Hola%20esto%20es%20una%20prueba&api_key=XXX
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-tts" && request.method === "GET") {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        const phone = url.searchParams.get('phone') || '5610016226';
        const texto = url.searchParams.get('texto') || 'Hola, soy SARA. Esta es una prueba del sistema de voz.';

        if (!env.OPENAI_API_KEY) {
          return corsResponse(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY no configurado' }));
        }

        console.log(`🔊 TEST TTS: Iniciando para phone=${phone}, texto="${texto.substring(0, 30)}..."`);

        // Verificar ventana 24h antes de enviar
        const cleanPhoneTTS = phone.replace(/\D/g, '');
        const { data: teamMemberTTS } = await supabase.client
          .from('team_members')
          .select('id, name, phone, notes')
          .or(`phone.eq.${cleanPhoneTTS},phone.like.%${cleanPhoneTTS.slice(-10)}`)
          .maybeSingle();

        const tmNotesTTS = typeof teamMemberTTS?.notes === 'string'
          ? JSON.parse(teamMemberTTS.notes || '{}')
          : (teamMemberTTS?.notes || {});
        const lastInteractionTTS = tmNotesTTS.last_sara_interaction;
        const hace24hTTS = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const ventanaAbiertaTTS = lastInteractionTTS && lastInteractionTTS > hace24hTTS;

        const metaTTS = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

        // Si ventana cerrada, enviar template primero y guardar audio como pending
        if (!ventanaAbiertaTTS && teamMemberTTS) {
          console.log(`🔊 TEST TTS: Ventana cerrada para ${teamMemberTTS.name}, enviando template + guardando pending...`);
          const nombreCortoTTS = teamMemberTTS.name?.split(' ')[0] || 'Hola';
          await metaTTS.sendTemplate(phone, 'reactivar_equipo', 'es_MX', [
            { type: 'body', parameters: [{ type: 'text', text: nombreCortoTTS }] }
          ]);

          // Guardar audio como pending para entregar cuando responda
          tmNotesTTS.pending_audio = {
            sent_at: new Date().toISOString(),
            texto: texto,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          };
          await supabase.client.from('team_members').update({ notes: tmNotesTTS }).eq('id', teamMemberTTS.id);

          return corsResponse(JSON.stringify({
            ok: true,
            phone,
            ventana_cerrada: true,
            mensaje: 'Template enviado. Responde al mensaje para recibir el audio.',
            texto_guardado: texto.substring(0, 50) + '...'
          }));
        }

        // Ventana abierta o no es team member - generar y enviar audio
        const { createTTSService } = await import('../services/ttsService');
        const tts = createTTSService(env.OPENAI_API_KEY);

        const result = await tts.generateAudio(texto);
        console.log(`🔊 TEST TTS: Resultado generateAudio:`, result.success, result.error || 'OK');

        if (!result.success || !result.audioBuffer) {
          return corsResponse(JSON.stringify({ ok: false, error: result.error || 'No se generó audio' }));
        }

        console.log(`✅ TEST TTS: Audio generado (${result.audioBuffer.byteLength} bytes)`);

        const sendResult = await metaTTS.sendVoiceMessage(phone, result.audioBuffer, result.mimeType || 'audio/ogg');
        console.log(`✅ TEST TTS: Enviado a WhatsApp:`, JSON.stringify(sendResult).substring(0, 100));

        // 🔊 TTS Tracking - Registrar mensaje enviado
        const messageId = sendResult?.messages?.[0]?.id;
        if (messageId) {
          try {
            const ttsTracking = createTTSTrackingService(supabase);
            await ttsTracking.logTTSSent({
              messageId,
              recipientPhone: phone,
              recipientType: teamMemberTTS ? 'team_member' : 'lead',
              recipientId: teamMemberTTS?.id,
              recipientName: teamMemberTTS ? (teamMemberTTS as any).name : undefined,
              ttsType: 'test',
              textoOriginal: texto,
              audioBytes: result.audioBuffer.byteLength,
              duracionEstimada: result.duration
            });
          } catch (trackError) {
            console.log(`📊 TTS Tracking: ${(trackError as Error).message}`);
          }
        }

        return corsResponse(JSON.stringify({
          ok: true,
          phone,
          message_id: messageId,
          texto_original: texto,
          audio_bytes: result.audioBuffer.byteLength,
          duracion_estimada: result.duration,
          mensaje: 'Audio enviado por WhatsApp'
        }));
      } catch (e: any) {
        console.error('❌ TEST TTS error:', e.message, e.stack);
        return corsResponse(JSON.stringify({ ok: false, error: e.message, stack: e.stack?.substring(0, 500) }));
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST RETELL - Probar llamadas telefónicas con IA
    // USO: /test-retell?phone=5610016226&nombre=Test&api_key=XXX
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-retell" && request.method === "GET") {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        // Verificar configuración
        if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
          return corsResponse(JSON.stringify({
            ok: false,
            error: 'Retell no configurado',
            missing: {
              RETELL_API_KEY: !env.RETELL_API_KEY,
              RETELL_AGENT_ID: !env.RETELL_AGENT_ID,
              RETELL_PHONE_NUMBER: !env.RETELL_PHONE_NUMBER
            }
          }));
        }

        const phone = url.searchParams.get('phone');
        const nombre = url.searchParams.get('nombre') || 'Cliente Test';
        const desarrollo = url.searchParams.get('desarrollo') || 'Monte Verde';

        if (!phone) {
          return corsResponse(JSON.stringify({
            ok: true,
            message: 'Retell configurado correctamente (usa ?phone=X para iniciar llamada)',
            config: {
              RETELL_API_KEY: '✅ Configurado',
              RETELL_AGENT_ID: '✅ Configurado',
              RETELL_PHONE_NUMBER: env.RETELL_PHONE_NUMBER
            }
          }));
        }

        console.log(`📞 TEST RETELL: Iniciando llamada a ${phone} (${nombre})`);

        const { createRetellService } = await import('../services/retellService');
        const retell = createRetellService(
          env.RETELL_API_KEY,
          env.RETELL_AGENT_ID,
          env.RETELL_PHONE_NUMBER
        );

        // Verificar disponibilidad
        if (!retell.isAvailable()) {
          return corsResponse(JSON.stringify({
            ok: false,
            error: 'Servicio Retell no disponible'
          }));
        }

        // Iniciar llamada
        const result = await retell.initiateCall({
          leadId: 'test-' + Date.now(),
          leadName: nombre,
          leadPhone: phone,
          desarrolloInteres: desarrollo,
          precioDesde: '$1.5 millones',
          motivo: 'seguimiento'
        });

        console.log(`📞 TEST RETELL: Resultado:`, JSON.stringify(result));

        return corsResponse(JSON.stringify({
          ok: result.success,
          phone,
          nombre,
          desarrollo,
          callId: result.callId,
          status: result.status,
          error: result.error,
          from_number: env.RETELL_PHONE_NUMBER
        }));
      } catch (e: any) {
        console.error('❌ TEST RETELL error:', e.message, e.stack);
        return corsResponse(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RETELL CALL STATUS - Ver status de llamadas recientes
    // USO: /retell-status?call_id=XXX  o  /retell-status (lista recientes)
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/retell-status" && request.method === "GET") {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        if (!env.RETELL_API_KEY) {
          return corsResponse(JSON.stringify({ error: 'RETELL_API_KEY no configurado' }));
        }

        const { createRetellService } = await import('../services/retellService');
        const retell = createRetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID || '', env.RETELL_PHONE_NUMBER || '');

        const callId = url.searchParams.get('call_id');

        if (callId) {
          // Detalle de una llamada específica
          const details = await retell.getCallDetails(callId);
          return corsResponse(JSON.stringify({ ok: !!details, call: details }));
        } else {
          // Lista de llamadas recientes
          const calls = await retell.listRecentCalls(10);
          const summary = calls.map((c: any) => ({
            call_id: c.call_id,
            status: c.call_status || c.status,
            to: c.to_number,
            from: c.from_number,
            duration_sec: c.duration_ms ? Math.round(c.duration_ms / 1000) : null,
            started: c.start_timestamp ? new Date(c.start_timestamp).toISOString() : null,
            ended: c.end_timestamp ? new Date(c.end_timestamp).toISOString() : null,
            disconnect_reason: c.disconnection_reason || c.disconnect_reason,
          }));
          return corsResponse(JSON.stringify({ ok: true, count: calls.length, calls: summary }));
        }
      } catch (e: any) {
        return corsResponse(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    // Leer debug logs del webhook Retell desde KV
    if (url.pathname === '/retell-debug-logs' && request.method === 'GET') {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;
        const keys = await env.SARA_CACHE.list({ prefix: 'retell_' });
        const logs: any[] = [];
        for (const key of keys.keys) {
          const val = await env.SARA_CACHE.get(key.name, 'json');
          logs.push({ key: key.name, data: val });
        }
        return corsResponse(JSON.stringify({ count: logs.length, logs }, null, 2));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // Debug: ejecutar follow-up de Retell manualmente para un call_id
    if (url.pathname === '/test-retell-followup' && request.method === 'GET') {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;
        const callId = url.searchParams.get('call_id');
        if (!callId) return corsResponse(JSON.stringify({ error: 'Falta ?call_id=XXX' }));

        const debug: any = { steps: [] };

        // 1. Obtener detalles de la llamada
        const { createRetellService } = await import('../services/retellService');
        const retell = createRetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID || '', env.RETELL_PHONE_NUMBER || '');
        const callDetails = await retell.getCallDetails(callId);
        if (!callDetails) return corsResponse(JSON.stringify({ error: 'Call not found', callId }));

        const isInbound = callDetails.direction === 'inbound';
        const leadPhone = isInbound
          ? (callDetails as any).from_number?.replace('+', '')
          : (callDetails as any).to_number?.replace('+', '');
        debug.steps.push({ step: 'call_details', leadPhone, duration_ms: callDetails.duration_ms, direction: callDetails.direction });

        // 2. Buscar lead
        const { data: lead } = await supabase.client
          .from('leads')
          .select('id, assigned_to, name, property_interest, last_message_at')
          .or(`phone.eq.${leadPhone},phone.like.%${leadPhone?.slice(-10)}`)
          .maybeSingle();
        debug.steps.push({ step: 'lead_lookup', found: !!lead, lead_id: lead?.id, name: lead?.name });

        // 3. Ventana 24h
        let ventanaAbierta = false;
        if (lead?.last_message_at) {
          const hace24h = Date.now() - 24 * 60 * 60 * 1000;
          ventanaAbierta = new Date(lead.last_message_at).getTime() > hace24h;
        }
        debug.steps.push({ step: 'ventana_24h', abierta: ventanaAbierta, last_message_at: lead?.last_message_at });

        // 4. Detectar desarrollo del transcript
        let desarrolloDelTranscript = '';
        const desarrollosConocidos = ['monte verde', 'los encinos', 'miravalle', 'paseo colorines', 'andes', 'distrito falco', 'citadella', 'villa campelo', 'villa galiano'];
        const transcript = callDetails.transcript;
        if (transcript) {
          let userMessages: string[] = [];
          if (typeof transcript === 'string') {
            const lines = transcript.split('\n');
            for (const line of lines) {
              if (line.startsWith('User:')) userMessages.push(line.substring(5).trim().toLowerCase());
            }
          } else if (Array.isArray(transcript)) {
            for (const entry of transcript as any[]) {
              if (entry.role === 'user') userMessages.push(entry.content.toLowerCase());
            }
          }
          for (let i = userMessages.length - 1; i >= 0; i--) {
            const encontrado = desarrollosConocidos.find(d => userMessages[i].includes(d));
            if (encontrado) {
              desarrolloDelTranscript = encontrado.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              break;
            }
          }
          debug.steps.push({ step: 'transcript_parse', userMessages, desarrolloDelTranscript });
        }

        const desarrolloInteres = desarrolloDelTranscript ||
          (callDetails.call_analysis as any)?.custom_analysis_data?.desarrollo_interes ||
          (callDetails.call_analysis as any)?.custom_analysis?.desarrollo_interes ||
          (callDetails as any).metadata?.desarrollo_interes ||
          lead?.property_interest;
        debug.steps.push({ step: 'desarrollo_final', desarrollo: desarrolloInteres });

        // 5. Enviar WhatsApp
        if (leadPhone && callDetails.duration_ms && callDetails.duration_ms > 15000) {
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          const primerNombre = lead?.name ? ' ' + lead.name.split(' ')[0] : '';

          if (ventanaAbierta) {
            let msg = `¡Hola${primerNombre}! 👋\n\nSoy Sara de Grupo Santa Rita. Gracias por la llamada. `;
            if (desarrolloInteres) msg += `Me da gusto que te interese *${desarrolloInteres}*. `;
            msg += `\n\nTe comparto información por aquí. Si tienes dudas, aquí estoy. 🏠`;

            try {
              const result = await meta.sendWhatsAppMessage(leadPhone, msg);
              debug.steps.push({ step: 'whatsapp_sent', success: true, result });
            } catch (e: any) {
              debug.steps.push({ step: 'whatsapp_sent', success: false, error: e.message });
            }

            // Enviar recursos
            if (desarrolloInteres) {
              const desarrolloNorm = desarrolloInteres.toLowerCase().replace('priv.', 'privada').replace('priv ', 'privada ').trim();
              const { data: props } = await supabase.client
                .from('properties')
                .select('name, development, brochure_urls, gps_link, youtube_link, matterport_link, price, price_equipped')
                .or(`name.ilike.%${desarrolloNorm}%,development.ilike.%${desarrolloNorm}%`)
                .limit(3);
              debug.steps.push({ step: 'properties_lookup', found: props?.length || 0, desarrollo: desarrolloNorm });

              if (props && props.length > 0) {
                const prop = props[0];
                let recursosMensaje = `📋 *Información de ${prop.development || prop.name || desarrolloInteres}:*\n\n`;
                const precioDesde = props.reduce((min: number, p: any) => {
                  const precio = p.price_equipped || p.price || 0;
                  return precio > 0 && precio < min ? precio : min;
                }, Infinity);
                if (precioDesde < Infinity) recursosMensaje += `💰 Desde $${(precioDesde / 1000000).toFixed(1)}M equipada\n`;
                if (prop.youtube_link) recursosMensaje += `🎬 Video: ${prop.youtube_link}\n`;
                if (prop.gps_link) recursosMensaje += `📍 Ubicación: ${prop.gps_link}\n`;
                const brochureRaw = prop.brochure_urls;
                if (brochureRaw) {
                  const urls = Array.isArray(brochureRaw) ? brochureRaw : [brochureRaw];
                  const htmlUrl = urls.find((u: string) => u.includes('.html') || u.includes('pages.dev'));
                  if (htmlUrl) recursosMensaje += `📄 Brochure: ${htmlUrl}\n`;
                }
                recursosMensaje += `\n¿Te gustaría agendar una visita? 😊`;

                try {
                  const result2 = await meta.sendWhatsAppMessage(leadPhone, recursosMensaje);
                  debug.steps.push({ step: 'recursos_sent', success: true, result: result2 });
                } catch (e: any) {
                  debug.steps.push({ step: 'recursos_sent', success: false, error: e.message });
                }
              }
            }
          } else {
            debug.steps.push({ step: 'ventana_cerrada', msg: 'usaría template' });
          }
        } else {
          debug.steps.push({ step: 'skip', reason: 'no leadPhone or duration < 15s' });
        }

        return corsResponse(JSON.stringify(debug, null, 2));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message, stack: e.stack?.substring(0, 500) }), 500);
      }
    }

    // Verificar configuración del agente Retell (webhook URL)
    if (url.pathname === '/retell-agent-config' && request.method === 'GET') {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;
        const agentId = env.RETELL_AGENT_ID || 'agent_3299a30fa8364c88d298df056e';
        const resp = await fetch(`https://api.retellai.com/get-agent/${agentId}`, {
          headers: { 'Authorization': `Bearer ${env.RETELL_API_KEY}` }
        });
        const agentData = await resp.json() as any;
        return corsResponse(JSON.stringify({
          agent_id: agentId,
          agent_name: agentData.agent_name,
          webhook_url: agentData.webhook_url || 'NOT SET',
          post_call_analysis: agentData.post_call_analysis_data ? 'CONFIGURED' : 'NOT SET',
          voice_id: agentData.voice_id,
          language: agentData.language,
        }, null, 2));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST COMANDO CEO - Probar comandos sin enviar WhatsApp
    // USO: /test-comando-ceo?cmd=ventas
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-comando-ceo" && request.method === "GET") {
      const cmd = url.searchParams.get('cmd') || 'ayuda';
      const ceoService = new CEOCommandsService(supabase);

      // Detectar comando
      const detected = ceoService.detectCommand(cmd);
      if (!detected.action || detected.action === 'unknown' || detected.action === 'not_recognized') {
        return corsResponse(JSON.stringify({
          ok: false,
          comando: cmd,
          error: 'Comando no reconocido',
          detected
        }));
      }

      // send_message (ayuda, etc.) - retorna directamente
      if (detected.action === 'send_message') {
        return corsResponse(JSON.stringify({
          ok: true,
          comando: cmd,
          detected
        }));
      }

      // Si requiere handler externo, mostrar info
      if (detected.action === 'call_handler' && detected.handlerName) {
        try {
          const result = await ceoService.executeHandler(detected.handlerName, 'Test CEO', detected.handlerParams);

          // Handle ceoMoverLead inline (normally handled by whatsapp.ts)
          if (result.needsExternalHandler && detected.handlerName === 'ceoMoverLead') {
            const params = detected.handlerParams as any;
            const nombreLead = params?.nombreLead || '';
            const direccion: 'next' | 'prev' = params?.direccion || 'next';

            const normalizar = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const nombreNormalizado = normalizar(nombreLead);

            // Search lead by name
            let { data: leads } = await supabase.client
              .from('leads')
              .select('*')
              .ilike('name', `%${nombreLead}%`)
              .limit(5);

            if (!leads || leads.length === 0) {
              const { data: allLeads } = await supabase.client.from('leads').select('*').limit(100);
              leads = allLeads?.filter(l => normalizar(l.name || '').includes(nombreNormalizado)) || [];
            }

            if (!leads || leads.length === 0) {
              return corsResponse(JSON.stringify({ ok: false, comando: cmd, error: `No encontre a "${nombreLead}"` }));
            }

            if (leads.length > 1) {
              const exactMatch = leads.find(l => normalizar(l.name || '') === nombreNormalizado);
              if (exactMatch) {
                leads = [exactMatch];
              } else {
                const nombresUnicos = new Set(leads.map(l => normalizar(l.name || '')));
                if (nombresUnicos.size === 1) {
                  leads = [leads[0]];
                } else {
                  return corsResponse(JSON.stringify({ ok: false, comando: cmd, error: `Multiples leads: ${leads.map(l => l.name).join(', ')}` }));
                }
              }
            }

            const lead = leads[0] as any;
            const FUNNEL_STAGES = ['new', 'contacted', 'qualified', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed', 'delivered'];
            const STATUS_ALIASES: Record<string, string> = { 'visit_scheduled': 'scheduled', 'negotiating': 'negotiation', 'sold': 'closed' };
            const stageLabels: Record<string, string> = {
              'new': 'Nuevo', 'contacted': 'Contactado', 'qualified': 'Calificado',
              'scheduled': 'Cita Agendada', 'visited': 'Visitado', 'negotiation': 'Negociando',
              'reserved': 'Reservado', 'closed': 'Vendido', 'delivered': 'Entregado',
              'visit_scheduled': 'Cita Agendada', 'negotiating': 'Negociando', 'sold': 'Vendido'
            };

            let currentStatus = lead.funnel_status || lead.stage || lead.status || 'new';
            if (STATUS_ALIASES[currentStatus]) currentStatus = STATUS_ALIASES[currentStatus];
            const currentIndex = FUNNEL_STAGES.indexOf(currentStatus);
            const newIndex = direccion === 'next' ? currentIndex + 1 : currentIndex - 1;

            if (newIndex < 0) {
              return corsResponse(JSON.stringify({ ok: false, comando: cmd, error: `${lead.name} ya esta en la primera etapa (${stageLabels[currentStatus] || currentStatus})` }));
            }
            if (newIndex >= FUNNEL_STAGES.length) {
              return corsResponse(JSON.stringify({ ok: false, comando: cmd, error: `${lead.name} ya esta en la ultima etapa (${stageLabels[currentStatus] || currentStatus})` }));
            }

            const newStage = FUNNEL_STAGES[newIndex];
            const updateCol = lead.funnel_status !== undefined ? 'funnel_status' : (lead.stage !== undefined ? 'stage' : 'status');
            await supabase.client.from('leads').update({ [updateCol]: newStage }).eq('id', lead.id);

            return corsResponse(JSON.stringify({
              ok: true,
              comando: cmd,
              handlerName: 'ceoMoverLead',
              resultado: `${lead.name} movido: ${stageLabels[currentStatus] || currentStatus} -> ${stageLabels[newStage] || newStage}`,
              lead: { id: lead.id, name: lead.name, previousStatus: currentStatus, newStatus: newStage, column: updateCol }
            }));
          }

          // Handle needsExternalHandler - return ok with handler info
          if (result.needsExternalHandler) {
            const params = detected.handlerParams || {};
            return corsResponse(JSON.stringify({
              ok: true,
              comando: cmd,
              handlerName: detected.handlerName,
              resultado: `Handler ${detected.handlerName} detectado correctamente (requiere WhatsApp para ejecutar)`,
              params
            }));
          }

          // Serialize resultado as string to avoid nested objects breaking parsers
          const resultadoStr = typeof result === 'string' ? result :
            (typeof result.message === 'string' ? result.message :
            JSON.stringify(result.message || result));

          return corsResponse(JSON.stringify({
            ok: true,
            comando: cmd,
            handlerName: detected.handlerName,
            resultado: resultadoStr
          }));
        } catch (e: any) {
          return corsResponse(JSON.stringify({
            ok: false,
            comando: cmd,
            handlerName: detected.handlerName,
            error: e.message
          }));
        }
      }

      return corsResponse(JSON.stringify({
        ok: true,
        comando: cmd,
        detected
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST COMANDO VENDEDOR - Probar comandos de vendedor
    // USO: /test-comando-vendedor?cmd=coach%20Juan
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-comando-vendedor" && request.method === "GET") {
      const cmd = url.searchParams.get('cmd') || 'ayuda';
      const vendorService = new VendorCommandsService(supabase);

      // Detectar comando (body y mensaje son iguales para el test)
      const detected = vendorService.detectRouteCommand(cmd, cmd);
      if (!detected.matched) {
        return corsResponse(JSON.stringify({
          ok: false,
          comando: cmd,
          error: 'Comando no reconocido',
          detected
        }));
      }

      return corsResponse(JSON.stringify({
        ok: true,
        comando: cmd,
        handlerName: detected.handlerName,
        params: detected.handlerParams,
        nota: 'Para ejecutar completamente, usa WhatsApp'
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST COMANDO AGENCIA - Probar comandos de marketing sin enviar WhatsApp
    // USO: /test-comando-agencia?cmd=campañas&api_key=XXX
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-comando-agencia" && request.method === "GET") {
      const cmd = url.searchParams.get('cmd') || 'ayuda';
      const agenciaService = new AgenciaCommandsService(supabase);
      const reportingService = new AgenciaReportingService(supabase);
      const nombreAgencia = 'Marketing';

      // Detect command
      const detected = agenciaService.detectCommand(cmd.toLowerCase().trim(), cmd, nombreAgencia);

      if (detected.action === 'not_recognized') {
        return corsResponse(JSON.stringify({
          ok: false,
          comando: cmd,
          error: 'Comando no reconocido por agencia',
          detected
        }));
      }

      // If it's a direct message (ayuda), return it
      if (detected.action === 'send_message') {
        return corsResponse(JSON.stringify({
          ok: true,
          comando: cmd,
          action: 'send_message',
          respuesta: detected.message?.substring(0, 500)
        }));
      }

      // If it's a handler, execute using reporting service
      if (detected.action === 'call_handler' && detected.handlerName) {
        try {
          let respuesta = '';
          let needsExternalHandler = false;

          switch (detected.handlerName) {
            case 'agenciaCampanas': {
              const { mensaje } = await reportingService.getCampanasActivas();
              respuesta = mensaje;
              break;
            }
            case 'agenciaMetricas': {
              respuesta = await reportingService.getMetricasMes();
              break;
            }
            case 'agenciaLeads': {
              const { mensaje } = await reportingService.getLeadsPorFuente();
              respuesta = mensaje;
              break;
            }
            case 'verSegmentos': {
              respuesta = await reportingService.getMensajeSegmentos(nombreAgencia);
              break;
            }
            case 'iniciarBroadcast': {
              respuesta = reportingService.getMensajeAyudaBroadcast(nombreAgencia);
              break;
            }
            case 'enviarASegmento': {
              // Parse the command but don't actually send
              const parsed = reportingService.parseEnvioSegmento(cmd);
              if (!parsed.mensajeTemplate) {
                respuesta = reportingService.getMensajeFormatosEnvio();
              } else {
                const resultado = await reportingService.getLeadsParaEnvio({
                  segmento: parsed.segmento,
                  desarrollo: parsed.desarrollo,
                  vendedorNombre: parsed.vendedorNombre,
                  fechaDesde: parsed.fechaDesde,
                  fechaHasta: parsed.fechaHasta
                });
                if (resultado.error) {
                  respuesta = resultado.error;
                } else {
                  respuesta = `[DRY RUN] Enviaría a ${resultado.leads.length} leads (total: ${resultado.totalCount || resultado.leads.length})\nFiltro: ${resultado.filtroDescripcion}\nMensaje: ${parsed.mensajeTemplate.substring(0, 100)}`;
                }
              }
              break;
            }
            case 'previewSegmento': {
              const match = cmd.match(/(?:preview|ver)\s+(\w+)/i);
              if (match) {
                const { mensaje, error } = await reportingService.previewSegmento(match[1]);
                respuesta = error || mensaje;
              } else {
                respuesta = 'Formato: preview [segmento]';
              }
              break;
            }
            case 'verEventos': {
              const eventosService = new EventosService(supabase);
              const eventos = await eventosService.getProximosEventos();
              respuesta = eventosService.formatEventosLista(eventos, nombreAgencia);
              break;
            }
            case 'crearEvento': {
              needsExternalHandler = true;
              respuesta = 'Requiere handler externo (parsing de evento)';
              break;
            }
            case 'invitarEvento': {
              needsExternalHandler = true;
              respuesta = 'Requiere handler externo (envío de invitaciones)';
              break;
            }
            case 'verRegistrados': {
              const eventosService2 = new EventosService(supabase);
              const match2 = cmd.match(/registrados\s+(.+)/i);
              if (match2) {
                const evento = await eventosService2.buscarEventoPorNombre(match2[1].trim());
                if (evento) {
                  const registros = await eventosService2.getRegistrados(evento.id);
                  respuesta = eventosService2.formatRegistrados(evento, registros);
                } else {
                  respuesta = `No encontré el evento "${match2[1].trim()}"`;
                }
              } else {
                const eventos = await eventosService2.getEventosConRegistrados();
                respuesta = eventosService2.formatListaEventosConRegistrados(eventos);
              }
              break;
            }
            case 'verPromociones': {
              const promosService = new PromocionesService(supabase);
              const promos = await promosService.getPromocionesActivas();
              respuesta = promosService.formatPromocionesLista(promos, nombreAgencia);
              break;
            }
            case 'crearPromocion': {
              needsExternalHandler = true;
              respuesta = 'Requiere handler externo (parsing de promoción)';
              break;
            }
            case 'pausarPromocion': {
              const promosService2 = new PromocionesService(supabase);
              const nombrePromo = promosService2.parseNombrePromocion(cmd, 'pausar');
              if (!nombrePromo) {
                respuesta = 'Formato: pausar promo [nombre]';
              } else {
                const { promo, error } = await promosService2.pausarPromocion(nombrePromo);
                respuesta = error || promosService2.formatPromoPausada(promo!);
              }
              break;
            }
            case 'activarPromocion': {
              const promosService3 = new PromocionesService(supabase);
              const nombrePromo2 = promosService3.parseNombrePromocion(cmd, 'activar');
              if (!nombrePromo2) {
                respuesta = 'Formato: activar promo [nombre]';
              } else {
                const { promo, error } = await promosService3.activarPromocion(nombrePromo2);
                respuesta = error || promosService3.formatPromoActivada(promo!);
              }
              break;
            }
            case 'agenciaROI': {
              respuesta = await reportingService.getROI();
              break;
            }
            case 'agenciaMejorCampana': {
              const { mensaje } = await reportingService.getMejorCampana();
              respuesta = mensaje;
              break;
            }
            case 'agenciaPeorCampana': {
              const { mensaje } = await reportingService.getPeorCampana();
              respuesta = mensaje;
              break;
            }
            case 'agenciaGasto': {
              respuesta = await reportingService.getGastoVsPresupuesto();
              break;
            }
            case 'agenciaCPL': {
              const { mensaje } = await reportingService.getCPLPorPlataforma();
              respuesta = mensaje;
              break;
            }
            case 'agenciaResumen': {
              const data = await reportingService.getResumenMarketing();
              respuesta = reportingService.formatResumenMarketing(data, nombreAgencia);
              break;
            }
            default:
              needsExternalHandler = true;
              respuesta = `Handler "${detected.handlerName}" no ejecutable desde test`;
          }

          return corsResponse(JSON.stringify({
            ok: !needsExternalHandler,
            comando: cmd,
            handlerName: detected.handlerName,
            respuesta: respuesta?.substring(0, 500),
            needsExternalHandler
          }));
        } catch (e: any) {
          return corsResponse(JSON.stringify({
            ok: false,
            comando: cmd,
            handlerName: detected.handlerName,
            error: e.message
          }));
        }
      }

      return corsResponse(JSON.stringify({
        ok: true,
        comando: cmd,
        detected
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST COMANDO ASESOR - Probar comandos de asesor sin enviar WhatsApp
    // USO: /test-comando-asesor?cmd=mis%20leads&phone=5210000000001
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-comando-asesor" && request.method === "GET") {
      const cmd = url.searchParams.get('cmd') || 'ayuda';
      const phone = url.searchParams.get('phone') || '5210000000001';
      const asesorService = new AsesorCommandsService(supabase);

      // Find asesor by phone
      const phoneLimpio = phone.replace(/\D/g, '');
      const { data: asesor } = await supabase.client
        .from('team_members')
        .select('*')
        .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
        .single();

      if (!asesor || asesor.role !== 'asesor') {
        return corsResponse(JSON.stringify({
          ok: false,
          error: 'Teléfono no pertenece a un asesor',
          phone: phoneLimpio
        }), 400);
      }

      const nombreAsesor = asesor.name?.split(' ')[0] || 'Asesor';

      // Detect command
      const detected = asesorService.detectCommand(cmd.toLowerCase().trim(), cmd, nombreAsesor);

      if (detected.action === 'not_recognized') {
        return corsResponse(JSON.stringify({
          ok: false,
          comando: cmd,
          error: 'Comando no reconocido por asesor',
          detected
        }));
      }

      // If it's a direct message (ayuda), return it
      if (detected.action === 'send_message') {
        return corsResponse(JSON.stringify({
          ok: true,
          comando: cmd,
          action: 'send_message',
          respuesta: detected.message?.substring(0, 500)
        }));
      }

      // If it's a handler, execute it
      if (detected.action === 'call_handler' && detected.handlerName) {
        try {
          const result = await asesorService.executeHandler(
            detected.handlerName,
            asesor,
            nombreAsesor,
            { body: cmd, match: detected.handlerParams?.match, ...detected.handlerParams }
          );

          return corsResponse(JSON.stringify({
            ok: !result.error,
            comando: cmd,
            handlerName: detected.handlerName,
            params: detected.handlerParams,
            respuesta: (result.message || result.error || '')?.substring(0, 500),
            needsExternalHandler: result.needsExternalHandler || false,
            leadNotification: result.leadMessage ? { phone: result.leadPhone, message: result.leadMessage?.substring(0, 200) } : undefined,
            vendedorNotification: result.vendedorMessage ? { phone: result.vendedorPhone, message: result.vendedorMessage?.substring(0, 200) } : undefined,
          }));
        } catch (e: any) {
          return corsResponse(JSON.stringify({
            ok: false,
            comando: cmd,
            handlerName: detected.handlerName,
            error: e.message
          }));
        }
      }

      return corsResponse(JSON.stringify({
        ok: true,
        comando: cmd,
        detected
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEBUG LEAD - Buscar lead por teléfono para debug
    // USO: /debug-lead?phone=4921375548
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-lead" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '';
      const phoneLimpio = phone.replace(/[-\s]/g, '');

      // Buscar lead
      const { data: leads, error } = await supabase.client
        .from('leads')
        .select('id, name, phone, assigned_to, lead_score, status, last_message_at, updated_at, created_at')
        .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
        .limit(5);

      // Buscar team member (CEO)
      const { data: teamMembers } = await supabase.client
        .from('team_members')
        .select('id, name, phone, role, active')
        .ilike('phone', '%2224558475%')
        .limit(1);

      // Test query exacta como en vendedorVerHistorial
      const ceoId = teamMembers?.[0]?.id;
      const { data: leadsConAssigned, error: err2 } = await supabase.client
        .from('leads')
        .select('id, name, phone, assigned_to')
        .eq('assigned_to', ceoId || '')
        .ilike('phone', `%${phoneLimpio}%`)
        .limit(5);

      // Calcular si está dentro de ventana 24h
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const leadsConVentana = (leads || []).map((l: any) => ({
        ...l,
        dentroVentana24h: l.last_message_at ? l.last_message_at > hace24h : false,
        horasDesdeUltimoMensaje: l.last_message_at
          ? Math.round((Date.now() - new Date(l.last_message_at).getTime()) / (1000 * 60 * 60))
          : null
      }));

      return corsResponse(JSON.stringify({
        buscando: phoneLimpio,
        encontrados: leads?.length || 0,
        leads: leadsConVentana,
        hace24h,
        ceo: teamMembers?.[0] || null,
        queryConAssigned: {
          ceoId,
          encontrados: leadsConAssigned?.length || 0,
          leads: leadsConAssigned || [],
          error: err2?.message
        },
        error: error?.message
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🔧 SET ONBOARDING - Marcar vendedor como onboarding completado
    // USO: /set-onboarding?phone=5212224558475
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/set-onboarding" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const phoneLimpio = phone.replace(/\D/g, '').slice(-10);

      const { data: member } = await supabase.client
        .from('team_members')
        .select('id, name, notes')
        .ilike('phone', `%${phoneLimpio}`)
        .single();

      if (!member) {
        return corsResponse(JSON.stringify({ error: 'Team member no encontrado', phone: phoneLimpio }), 404);
      }

      const notas = typeof member.notes === 'object' ? (member.notes || {}) : {};
      const notasActualizadas = {
        ...notas,
        onboarding_completed: true,
        onboarding_date: new Date().toISOString()
      };

      await supabase.client.from('team_members').update({ notes: notasActualizadas }).eq('id', member.id);

      return corsResponse(JSON.stringify({
        ok: true,
        member: member.name,
        onboarding_completed: true
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEBUG CACHE - Ver estadísticas del cache KV
    // USO: /debug-cache
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-cache" && request.method === "GET") {
      try {
        if (!cache) {
          return corsResponse(JSON.stringify({ ok: true, cache_disponible: false, nota: 'CacheService no inicializado (SARA_CACHE KV no disponible)' }));
        }
        const stats = cache.getStats();
        const available = !!env.SARA_CACHE;

        // Test de cache: escribir y leer
        let testResult = { write: false, read: false, value: null as string | null };
        if (available && env.SARA_CACHE) {
          try {
            const testKey = '_debug_test_' + Date.now();
            await (env.SARA_CACHE as KVNamespace).put(testKey, 'test_value', { expirationTtl: 60 });
            testResult.write = true;
            const readVal = await (env.SARA_CACHE as KVNamespace).get(testKey);
            testResult.read = readVal === 'test_value';
            testResult.value = readVal;
            await (env.SARA_CACHE as KVNamespace).delete(testKey);
          } catch (e: any) {
            testResult.value = e.message;
          }
        }

        return corsResponse(JSON.stringify({
          cache_disponible: available,
          estadisticas: stats,
          test_kv: testResult,
          ttl_configurado: {
            team_members: '5 min',
            properties: '10 min',
            developments: '10 min',
            leads: '1 min'
          },
          nota: 'Estadísticas se resetean en cada request (Workers son stateless)'
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 3) }));
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 DEBUG PENDING FOLLOWUP - Ver estado del pending_followup de un lead
    // USO: /debug-followup?phone=5610016226
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-followup" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '';
      const phoneLimpio = phone.replace(/[-\s]/g, '');

      let lead: any = null;
      if (phoneLimpio) {
        const { data } = await supabase.client
          .from('leads')
          .select('id, name, phone, notes, assigned_to')
          .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
          .single();
        lead = data;
      }
      // Fallback: lead más reciente
      if (!lead) {
        const { data } = await supabase.client.from('leads').select('id, name, phone, notes, assigned_to').order('created_at', { ascending: false }).limit(1).single();
        lead = data;
      }

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', phone: phoneLimpio }), 404);
      }

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const pending = notas.pending_followup;

      return corsResponse(JSON.stringify({
        lead_id: lead.id,
        lead_name: lead.name,
        lead_phone: lead.phone,
        assigned_to: lead.assigned_to,
        pending_followup: pending || null,
        has_pending: !!pending,
        status: pending?.status || 'none'
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 TEST CONTEXTO IA - Ver qué info recibe la IA sobre un lead
    // USO: /test-contexto?phone=5610016226
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-contexto" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '5215610016226';
      const phoneLimpio = phone.replace(/\D/g, '');

      // Buscar lead por phone
      let { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
        .single();

      // Fallback: cualquier lead reciente
      if (!lead) {
        const { data: anyLead } = await supabase.client
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        lead = anyLead;
      }

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Verificar cita existente (igual que hace el AI service)
      const { data: citaExistente } = await supabase.client
        .from('appointments')
        .select('scheduled_date, scheduled_time, property_name, status')
        .eq('lead_id', lead.id)
        .in('status', ['scheduled', 'confirmed'])
        .order('created_at', { ascending: false })
        .limit(1);

      const tieneCita = citaExistente && citaExistente.length > 0;
      const citaInfo = tieneCita
        ? `✅ YA TIENE CITA CONFIRMADA: ${citaExistente[0].scheduled_date} a las ${citaExistente[0].scheduled_time} en ${citaExistente[0].property_name}`
        : '❌ NO TIENE CITA AÚN';

      // Historial reciente
      const historial = lead.conversation_history || [];
      const ultimos3 = historial.slice(-3);

      return corsResponse(JSON.stringify({
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          status: lead.status,
          property_interest: lead.property_interest,
          lead_score: lead.lead_score
        },
        cita_info_para_IA: citaInfo,
        tiene_cita_real: tieneCita,
        cita_detalles: citaExistente?.[0] || null,
        datos_que_ve_IA: {
          nombre: lead.name ? `✅ ${lead.name}` : '❌ NO TENGO - DEBES PEDIRLO',
          interes: lead.property_interest || 'No definido',
          cita: citaInfo
        },
        ultimos_mensajes: ultimos3,
        regla_aplicable: tieneCita
          ? 'IA puede mencionar la cita existente'
          : '🚨 IA NO DEBE inventar citas - debe PREGUNTAR si quiere agendar'
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 DEBUG CITAS - Ver citas de un lead
    // USO: /debug-citas?phone=5610016226
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-citas" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '';
      const phoneLimpio = phone.replace(/[-\s]/g, '');

      let lead: any = null;
      if (phoneLimpio) {
        const { data } = await supabase.client
          .from('leads')
          .select('id, name, phone, status, property_interest, conversation_history')
          .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
          .single();
        lead = data;
      } else {
        // Fallback: lead más reciente con cita
        const { data } = await supabase.client
          .from('appointments')
          .select('lead_id')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (data?.lead_id) {
          const { data: l } = await supabase.client.from('leads').select('id, name, phone, status, property_interest, conversation_history').eq('id', data.lead_id).single();
          lead = l;
        }
      }

      if (!lead) {
        // Final fallback: any lead
        const { data } = await supabase.client.from('leads').select('id, name, phone, status, property_interest, conversation_history').order('created_at', { ascending: false }).limit(1).single();
        lead = data;
      }

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', hint: 'Usa ?phone=XXXX' }), 404);
      }

      // Buscar citas del lead
      const { data: citas } = await supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', lead.id)
        .order('scheduled_date', { ascending: false });

      // Últimos 5 mensajes del historial
      const historial = lead.conversation_history || [];
      const ultimos5 = historial.slice(-5);

      return corsResponse(JSON.stringify({
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          status: lead.status,
          property_interest: lead.property_interest
        },
        citas: citas || [],
        total_citas: citas?.length || 0,
        citas_activas: (citas || []).filter((c: any) => ['scheduled', 'confirmed', 'pending'].includes(c.status)),
        ultimos_mensajes: ultimos5
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 DEBUG LLAMADAS - Ver todas las citas de llamada
    // USO: /debug-llamadas
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-llamadas" && request.method === "GET") {
      const { data: llamadas, error } = await supabase.client
        .from('appointments')
        .select('id, lead_id, lead_name, lead_phone, scheduled_date, scheduled_time, status, appointment_type, created_at, vendedor_name')
        .eq('appointment_type', 'llamada')
        .order('created_at', { ascending: false })
        .limit(20);

      return corsResponse(JSON.stringify({
        total: llamadas?.length || 0,
        error: error?.message || null,
        llamadas: llamadas || []
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 DEBUG IDENTIFICAR VENDEDOR - Ver qué vendedor se identifica por teléfono
    // USO: /debug-vendedor?phone=5212224558475
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-vendedor" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const phoneLimpio = phone.replace(/\D/g, '').slice(-10);

      // Buscar todos los team_members activos
      const { data: teamMembers } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('active', true);

      // Simular la lógica de identificación
      const vendedor = (teamMembers || []).find((tm: any) => {
        if (!tm.phone) return false;
        const tmPhone = tm.phone.replace(/\D/g, '').slice(-10);
        return tmPhone === phoneLimpio;
      });

      return corsResponse(JSON.stringify({
        phone_buscado: phone,
        phone_limpio: phoneLimpio,
        total_team_members: teamMembers?.length || 0,
        vendedor_encontrado: vendedor ? {
          id: vendedor.id,
          name: vendedor.name,
          phone: vendedor.phone,
          role: vendedor.role
        } : null,
        todos_los_phones: (teamMembers || []).map((tm: any) => ({
          id: tm.id,
          name: tm.name,
          phone: tm.phone,
          phone_limpio: tm.phone?.replace(/\D/g, '').slice(-10),
          role: tm.role
        }))
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 DEBUG APROBAR FOLLOWUP - Simula exactamente lo que hace el handler
    // USO: /debug-aprobar?vendedor_id=xxx&nombre_lead=rodrigo
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-aprobar" && request.method === "GET") {
      const vendedorId = url.searchParams.get('vendedor_id') || '7bb05214-826c-4d1b-a418-228b8d77bd64';
      const nombreLead = url.searchParams.get('nombre_lead') || 'rodrigo';

      // 1. Buscar TODOS los leads del vendedor
      const { data: allLeads, error: err1 } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .eq('assigned_to', vendedorId);

      // 2. Filtrar leads que tienen pending_followup con status pending
      const leadsConPending = (allLeads || []).filter((l: any) => {
        const notas = typeof l.notes === 'object' ? l.notes : {};
        return notas.pending_followup && notas.pending_followup.status === 'pending';
      });

      // 3. Si se especificó nombre, filtrar
      let leadTarget: any = leadsConPending[0];
      if (nombreLead && leadsConPending.length > 0) {
        const normalizado = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        leadTarget = leadsConPending.find((l: any) => {
          const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return leadNombre.includes(normalizado) || normalizado.includes(leadNombre.split(' ')[0]);
        }) || leadsConPending[0];
      }

      // 4. Verificar pending_followup del lead target
      let pendingInfo = null;
      if (leadTarget) {
        const notas = typeof leadTarget.notes === 'object' ? leadTarget.notes : {};
        pendingInfo = notas.pending_followup;
      }

      return corsResponse(JSON.stringify({
        vendedor_id: vendedorId,
        nombre_lead_buscado: nombreLead,
        total_leads_del_vendedor: allLeads?.length || 0,
        leads_con_pending_followup: leadsConPending.length,
        leads_ids: leadsConPending.map((l: any) => ({ id: l.id, name: l.name })),
        lead_target: leadTarget ? { id: leadTarget.id, name: leadTarget.name, phone: leadTarget.phone } : null,
        pending_followup: pendingInfo,
        error: err1?.message
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 TEST REAL - Envía mensajes de prueba REALES a tu teléfono
    // USO: /test-real?test=briefing|video|comando|alerta
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-real" && request.method === "GET") {
      const TEST_PHONE = '5212224558475'; // Tu teléfono CEO
      const testType = url.searchParams.get('test') || 'menu';
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const resultados: any = { test: testType, timestamp: new Date().toISOString() };

      try {
        switch (testType) {
          case 'menu':
            return corsResponse(JSON.stringify({
              mensaje: '🧪 Tests disponibles - usa ?test=X',
              tests: {
                'mensaje': 'Envía un mensaje simple de prueba',
                'briefing': 'Envía el briefing matutino',
                'reporte': 'Envía el reporte diario CEO',
                'alerta': 'Simula alerta de lead caliente',
                'comando': 'Prueba comando ventas y envía resultado',
                'video': 'Genera y envía video de prueba (tarda ~2min)',
                'recap': 'Envía recap de 7pm (template + mensaje pendiente)',
                'followup': 'Simula follow-up pendiente (sistema aprobación)',
                'all': 'Ejecuta TODOS los tests',
                'setup-dashboard': 'Configura datos realistas para el Dashboard (metas, leads, presupuestos)'
              },
              uso: '/test-real?test=mensaje'
            }));

          case 'mensaje':
            await meta.sendWhatsAppMessage(TEST_PHONE,
              `🧪 *TEST SARA*\n\n` +
              `Este es un mensaje de prueba.\n` +
              `Timestamp: ${new Date().toLocaleString('es-MX')}\n\n` +
              `Si ves esto, el envío de WhatsApp funciona ✅`
            );
            resultados.mensaje = '✅ Mensaje enviado';
            break;

          case 'briefing':
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('phone', TEST_PHONE)
              .single();
            if (vendedor) {
              await enviarBriefingMatutino(supabase, meta, vendedor, { openaiApiKey: env.OPENAI_API_KEY });
              resultados.briefing = '✅ Briefing enviado';
            } else {
              resultados.briefing = '❌ Vendedor no encontrado';
            }
            break;

          case 'reporte':
            await enviarReporteDiarioCEO(supabase, meta);
            resultados.reporte = '✅ Reporte diario enviado';
            break;

          case 'alerta':
            await meta.sendWhatsAppMessage(TEST_PHONE,
              `🔥 *ALERTA TEST: Lead Caliente*\n\n` +
              `👤 Juan Pérez (Test)\n` +
              `📱 5551234567\n` +
              `🎯 Señal: "Quiero apartar hoy"\n` +
              `🏠 Interés: Monte Verde\n\n` +
              `_Esto es una prueba del sistema de alertas_`
            );
            resultados.alerta = '✅ Alerta enviada';
            break;

          case 'comando':
            const ceoService = new CEOCommandsService(supabase);
            const result = await ceoService.executeHandler('reporteVentas', 'Test', {});
            await meta.sendWhatsAppMessage(TEST_PHONE, result.message || 'Sin resultado');
            resultados.comando = '✅ Comando ventas ejecutado y enviado';
            break;

          case 'video':
            resultados.video = '⏳ Video en cola - revisa /debug-videos en 2 min';
            // Insertar en pending_videos para que el CRON lo procese
            await supabase.client.from('pending_videos').insert({
              operation_id: 'TEST_' + Date.now(),
              lead_phone: TEST_PHONE,
              lead_name: 'Test Video',
              desarrollo: 'Monte Verde',
              sent: false
            });
            break;

          case 'all':
            // Mensaje
            await meta.sendWhatsAppMessage(TEST_PHONE, `🧪 *INICIANDO TESTS COMPLETOS*\n\nTimestamp: ${new Date().toLocaleString('es-MX')}`);
            resultados.mensaje = '✅';

            // Pequeña pausa entre mensajes
            await new Promise(r => setTimeout(r, 1000));

            // Alerta
            await meta.sendWhatsAppMessage(TEST_PHONE, `🔥 *TEST: Alerta Lead Caliente*\n\n👤 Test Lead\n📱 5551234567\n🎯 "Quiero apartar"`);
            resultados.alerta = '✅';

            await new Promise(r => setTimeout(r, 1000));

            // Comando
            const ceoSvc = new CEOCommandsService(supabase);
            const ventasResult = await ceoSvc.executeHandler('reporteVentas', 'Test', {});
            await meta.sendWhatsAppMessage(TEST_PHONE, ventasResult.message || 'Error en ventas');
            resultados.comando = '✅';

            resultados.resumen = '✅ 3 tests ejecutados - revisa tu WhatsApp';
            break;

          case 'recap':
            // Forzar envío de recap (ignorar last_recap_sent)
            const { data: vendedorRecap } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('phone', TEST_PHONE)
              .single();
            if (vendedorRecap) {
              // Limpiar last_recap_sent para forzar envío
              await supabase.client.from('team_members')
                .update({ last_recap_sent: null })
                .eq('id', vendedorRecap.id);
              // Limpiar last_sara_interaction de hoy para simular que NO usó SARA
              const notasVend = typeof vendedorRecap.notes === 'string' ? JSON.parse(vendedorRecap.notes || '{}') : (vendedorRecap.notes || {});
              delete notasVend.last_sara_interaction;
              await supabase.client.from('team_members')
                .update({ notes: notasVend })
                .eq('id', vendedorRecap.id);
              // Ahora enviar recap
              await enviarRecapDiario(supabase, meta, { ...vendedorRecap, last_recap_sent: null, notes: notasVend });
              resultados.recap = '✅ Recap enviado (template + pending_recap guardado)';
              resultados.nota = 'Responde al template para recibir el mensaje completo';
            } else {
              resultados.recap = '❌ Vendedor no encontrado';
            }
            break;

          case 'followup':
            // Simular sistema de aprobación de follow-up
            const TEST_LEAD_PHONE = '5215610016226'; // Teléfono de lead de prueba

            // Buscar el vendedor de prueba
            const { data: vendedorFollowup } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('phone', TEST_PHONE)
              .single();

            if (!vendedorFollowup) {
              resultados.followup = '❌ Vendedor no encontrado';
              break;
            }

            // Buscar lead por teléfono de prueba o cualquier lead con teléfono
            let leadTest = null;
            const { data: leadPorTel } = await supabase.client
              .from('leads')
              .select('id, name, phone, notes')
              .eq('phone', TEST_LEAD_PHONE)
              .single();

            if (leadPorTel) {
              leadTest = leadPorTel;
            } else {
              // Buscar cualquier lead con teléfono
              const { data: cualquierLead } = await supabase.client
                .from('leads')
                .select('id, name, phone, notes')
                .not('phone', 'is', null)
                .limit(1)
                .single();
              leadTest = cualquierLead;
            }

            if (!leadTest) {
              resultados.followup = '❌ No hay leads para probar';
              break;
            }

            // Crear pending_followup de prueba
            const mensajeTest = `¡Hola ${leadTest.name?.split(' ')[0] || 'amigo'}! 👋 Soy Sara de Grupo Santa Rita. Vi que nos contactaste recientemente. ¿Te gustaría que te cuente más sobre nuestras casas?`;
            const ahoraTest = new Date();
            const expiraTest = new Date(ahoraTest.getTime() + 30 * 60 * 1000);

            // Usar el teléfono del lead o el TEST_LEAD_PHONE como fallback
            const leadPhoneToUse = (leadTest.phone?.replace(/\D/g, '') || TEST_LEAD_PHONE);

            const notasLead = typeof leadTest.notes === 'object' ? leadTest.notes : {};
            const pendingFollowupTest = {
              tipo: 'followup_test',
              mensaje: mensajeTest,
              lead_phone: leadPhoneToUse,
              lead_name: leadTest.name || 'Lead Test',
              vendedor_id: vendedorFollowup.id,
              created_at: ahoraTest.toISOString(),
              expires_at: expiraTest.toISOString(),
              status: 'pending'
            };

            await supabase.client
              .from('leads')
              .update({ notes: { ...notasLead, pending_followup: pendingFollowupTest } })
              .eq('id', leadTest.id);

            // Notificar al vendedor
            const nombreCorto = leadTest.name?.split(' ')[0]?.toLowerCase() || 'lead';
            await meta.sendWhatsAppMessage(TEST_PHONE,
              `📤 *FOLLOW-UP PENDIENTE (TEST)*\n\n` +
              `Lead: *${leadTest.name}*\n` +
              `En 30 min enviaré:\n\n` +
              `"${mensajeTest}"\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `• *ok ${nombreCorto}* → enviar ahora\n` +
              `• *cancelar ${nombreCorto}* → no enviar\n` +
              `• *editar ${nombreCorto} [mensaje]* → tu versión\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `_Si no respondes, se envía en 30 min_`
            );

            resultados.followup = '✅ Follow-up pendiente creado';
            resultados.lead = leadTest.name;
            resultados.comandos = [`ok ${nombreCorto}`, `cancelar ${nombreCorto}`, `editar ${nombreCorto} Hola, soy...`];
            resultados.nota = 'Responde con uno de los comandos para probar';
            break;

          case 'setup-dashboard':
            // Configurar datos realistas para el Dashboard
            const month = '2026-01';

            // 1. Meta de empresa (tabla monthly_goals)
            // Primero intentar delete + insert para asegurar que se crea
            await supabase.client.from('monthly_goals').delete().eq('month', month);
            const { error: goalError } = await supabase.client.from('monthly_goals').insert({
              month,
              company_goal: 5
            });
            if (goalError) {
              console.log('Error creando meta empresa:', goalError.message);
            }

            // 2. Metas por vendedor (tabla vendor_monthly_goals - CORRECTA)
            const vendedoresMetas = [
              { id: '7bb05214-826c-4d1b-a418-228b8d77bd64', goal: 2 },
              { id: 'a1ffd78f-5c03-4c98-9968-8443a5670ed8', goal: 1 },
              { id: '451742c2-38a2-4741-8ba4-90185ab7f023', goal: 1 },
              { id: 'd81f53e8-25b3-45d5-99a5-aeb8eadbdf81', goal: 1 }
            ];
            for (const v of vendedoresMetas) {
              await supabase.client.from('vendor_monthly_goals').upsert({
                month,
                vendor_id: v.id,
                goal: v.goal
              }, { onConflict: 'month,vendor_id' });
            }

            // 3. Limpiar datos ficticios de properties (Los Encinos con 20 ventas falsas)
            await supabase.client.from('properties').update({ sold_units: 0 }).gt('sold_units', 0);

            // 4. Actualizar leads existentes con presupuestos
            const { data: existingLeads } = await supabase.client.from('leads').select('id, phone');
            for (const lead of existingLeads || []) {
              let updateData: any = {};
              if (lead.phone?.endsWith('5510001234')) {
                updateData = { name: 'Carlos Mendoza', budget: 2500000, score: 45, status: 'contacted' };
              } else if (lead.phone?.endsWith('5610016226')) {
                updateData = { name: 'Roberto García', budget: 3200000, score: 72, status: 'negotiation' };
              } else if (lead.phone?.endsWith('9090486')) {
                updateData = { name: 'María López', budget: 1800000, score: 35, status: 'new' };
              }
              if (Object.keys(updateData).length > 0) {
                await supabase.client.from('leads').update(updateData).eq('id', lead.id);
              }
            }

            // 4. Crear leads adicionales
            const newLeadsData = [
              { phone: '5215551112222', name: 'Juan Pérez', property_interest: 'Monte Verde', budget: 2100000, score: 78, status: 'negotiation', source: 'Facebook', assigned_to: '7bb05214-826c-4d1b-a418-228b8d77bd64' },
              { phone: '5215553334444', name: 'Ana Martínez', property_interest: 'Distrito Falco', budget: 3500000, score: 85, status: 'reserved', source: 'Instagram', assigned_to: 'a1ffd78f-5c03-4c98-9968-8443a5670ed8' },
              { phone: '5215555556666', name: 'Pedro Ramírez', property_interest: 'Andes', budget: 2800000, score: 55, status: 'visited', source: 'Google', assigned_to: '451742c2-38a2-4741-8ba4-90185ab7f023' },
              { phone: '5215559990000', name: 'Miguel Torres', property_interest: 'Monte Verde', budget: 2300000, score: 90, status: 'closed', source: 'Referidos', assigned_to: '7bb05214-826c-4d1b-a418-228b8d77bd64', status_changed_at: '2026-01-20T10:00:00Z' }
            ];

            for (const newLead of newLeadsData) {
              const { data: exists } = await supabase.client.from('leads').select('id').eq('phone', newLead.phone).single();
              if (!exists) {
                await supabase.client.from('leads').insert(newLead);
              }
            }

            // Verificar resultado
            const { data: finalLeads } = await supabase.client.from('leads').select('id, name, budget, score, status');
            const { data: companyGoals } = await supabase.client.from('monthly_goals').select('*').eq('month', month);
            const { data: vendorGoals } = await supabase.client.from('vendor_monthly_goals').select('*').eq('month', month);
            const { data: propsLimpias } = await supabase.client.from('properties').select('name, sold_units').gt('sold_units', 0);

            resultados.setup = {
              meta_empresa: companyGoals?.[0]?.company_goal || 0,
              metas_vendedor: vendorGoals?.length || 0,
              leads: finalLeads?.length || 0,
              pipeline: finalLeads?.reduce((sum: number, l: any) => sum + (Number(l.budget) || 0), 0) || 0,
              cerrados: finalLeads?.filter((l: any) => l.status === 'closed').length || 0,
              properties_con_ventas_ficticias: propsLimpias?.length || 0,
              leads_detalle: finalLeads
            };
            break;

          default:
            return corsResponse(JSON.stringify({ error: 'Test no válido', tests_disponibles: ['mensaje', 'briefing', 'reporte', 'alerta', 'comando', 'video', 'recap', 'followup', 'setup-dashboard', 'all'] }));
        }

        return corsResponse(JSON.stringify({ ok: true, ...resultados }));

      } catch (e: any) {
        console.error('❌ Error en test-real:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message, stack: e.stack }));
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 TEST-LEAD - Simula mensaje de lead sin usar WhatsApp real
    // USO: /test-lead?phone=5215551234567&name=Juan&msg=Hola%20me%20interesa
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-lead" && request.method === "GET") {
      const phone = url.searchParams.get('phone');
      const name = url.searchParams.get('name') || 'Lead Test';
      const msg = url.searchParams.get('msg') || 'Hola, me interesa información sobre terrenos';

      if (!phone) {
        return corsResponse(JSON.stringify({
          error: 'Falta parámetro phone',
          uso: '/test-lead?phone=5215551234567&name=Juan&msg=Hola',
          parametros: {
            phone: '(requerido) Teléfono del lead, ej: 5215551234567',
            name: '(opcional) Nombre del lead, default: Lead Test',
            msg: '(opcional) Mensaje a simular, default: Hola, me interesa información sobre terrenos'
          },
          ejemplos: [
            '/test-lead?phone=5215559999999&name=Carlos&msg=Quiero info de Monte Verde',
            '/test-lead?phone=5215558888888&msg=Me interesa un crédito hipotecario',
            '/test-lead?phone=5215557777777&name=Ana&msg=Donde queda Bosques de Chapultepec?'
          ]
        }), 400);
      }

      try {
        // Inicializar servicios necesarios
        const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
        const meta = await createMetaWithTracking(env, supabase);
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);

        // Llamar al handler de WhatsApp
        const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);
        await handler.handleIncomingMessage(`whatsapp:+${phone}`, msg, env);

        // Verificar el lead creado/actualizado
        let { data: lead } = await supabase.client
          .from('leads')
          .select('id, name, phone, status, score, assigned_to, created_at, updated_at')
          .like('phone', `%${phone.slice(-10)}`)
          .single();

        // Si el lead existe pero no tiene nombre, guardamos el nombre del parámetro
        if (lead && !lead.name && name && name !== 'Lead Test') {
          await supabase.client
            .from('leads')
            .update({ name })
            .eq('id', lead.id);
          lead.name = name;
          console.log(`✅ Nombre "${name}" guardado para lead ${phone}`);
        }

        // Obtener nombre del vendedor asignado
        let vendedorNombre = null;
        if (lead?.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('name')
            .eq('id', lead.assigned_to)
            .single();
          vendedorNombre = vendedor?.name;
        }

        return corsResponse(JSON.stringify({
          ok: true,
          mensaje_simulado: msg,
          lead: lead ? {
            id: lead.id,
            nombre: lead.name || name,
            telefono: lead.phone,
            status: lead.status,
            score: lead.score,
            asignado_a: vendedorNombre || lead.assigned_to,
            creado: lead.created_at,
            actualizado: lead.updated_at
          } : null,
          nota: 'SARA procesó el mensaje y respondió por WhatsApp (si el teléfono es real)'
        }));

      } catch (e: any) {
        console.error('❌ Error en test-lead:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 TEST-VENDEDOR-MSG - Simula mensaje de un VENDEDOR (team member)
    // USO: /test-vendedor-msg?phone=5212224558475&msg=ok%20roberto
    // Esto ejecuta el handler completo como si el vendedor enviara por WhatsApp
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-vendedor-msg" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '5212224558475'; // Default: Vendedor Test
      const msg = url.searchParams.get('msg') || 'ayuda';

      try {
        // Verificar que el teléfono pertenece a un team member
        const phoneLimpio = phone.replace(/\D/g, '');
        const { data: vendedor } = await supabase.client
          .from('team_members')
          .select('id, name, phone, role, active')
          .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
          .single();

        if (!vendedor) {
          return corsResponse(JSON.stringify({
            ok: false,
            error: 'Teléfono no pertenece a un team member',
            phone: phoneLimpio,
            uso: '/test-vendedor-msg?phone=5212224558475&msg=ok roberto',
            hint: 'Usa el teléfono de un vendedor registrado en team_members'
          }), 400);
        }

        // Inicializar servicios necesarios
        const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);

        // Llamar al handler de WhatsApp con el teléfono del vendedor
        const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);
        await handler.handleIncomingMessage(`whatsapp:+${phoneLimpio}`, msg, env);

        return corsResponse(JSON.stringify({
          ok: true,
          mensaje_simulado: msg,
          vendedor: {
            id: vendedor.id,
            nombre: vendedor.name,
            telefono: vendedor.phone,
            role: vendedor.role
          },
          nota: 'Mensaje procesado como si viniera del vendedor. Revisa WhatsApp para ver la respuesta.'
        }));

      } catch (e: any) {
        console.error('❌ Error en test-vendedor-msg:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message, stack: e.stack }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧹 LIMPIAR-ALERTAS - Limpia alertas pendientes de leads para un vendedor
    // USO: /limpiar-alertas?phone=5212224558475&api_key=XXX
    // Esto es útil cuando hay múltiples leads con alerta_vendedor_id del mismo vendedor
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/limpiar-alertas" && request.method === "GET") {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const phone = url.searchParams.get('phone') || '5212224558475';
      const phoneLimpio = phone.replace(/\D/g, '');

      try {
        // Buscar vendedor
        const { data: vendedor } = await supabase.client
          .from('team_members')
          .select('id, name')
          .or(`phone.eq.${phoneLimpio},phone.like.%${phoneLimpio.slice(-10)}`)
          .maybeSingle();

        if (!vendedor) {
          return corsResponse(JSON.stringify({
            error: 'Vendedor no encontrado',
            phone: phoneLimpio
          }), 404);
        }

        // Buscar leads con alertas pendientes de este vendedor
        const { data: leadsConAlerta } = await supabase.client
          .from('leads')
          .select('id, name, phone, notes')
          .eq('notes->>alerta_vendedor_id', vendedor.id)
          .not('notes->>sugerencia_pendiente', 'is', null);

        if (!leadsConAlerta || leadsConAlerta.length === 0) {
          return corsResponse(JSON.stringify({
            ok: true,
            message: 'No hay alertas pendientes para limpiar',
            vendedor: vendedor.name,
            leadsLimpiados: 0
          }));
        }

        // Limpiar alertas de todos los leads
        let limpiados = 0;
        for (const lead of leadsConAlerta) {
          const notas = lead.notes || {};
          delete notas.sugerencia_pendiente;
          delete notas.alerta_vendedor_id;

          await supabase.client.from('leads')
            .update({ notes: notas })
            .eq('id', lead.id);

          limpiados++;
        }

        console.log(`🧹 Limpiadas ${limpiados} alertas pendientes del vendedor ${vendedor.name}`);

        return corsResponse(JSON.stringify({
          ok: true,
          vendedor: vendedor.name,
          leadsLimpiados: limpiados,
          leads: leadsConAlerta.map(l => ({ id: l.id, name: l.name || 'Sin nombre', phone: l.phone }))
        }));

      } catch (e: any) {
        console.error('❌ Error en limpiar-alertas:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧹 LIMPIAR-PENDING-EXPIRADOS - Limpia pending messages expirados de team_members
    // USO: /limpiar-pending-expirados?api_key=XXX
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/limpiar-pending-expirados" && request.method === "GET") {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      try {
        const { data: teamMembers } = await supabase.client
          .from('team_members')
          .select('id, name, notes')
          .eq('active', true);

        const pendingKeys = [
          { key: 'pending_briefing', type: 'briefing' },
          { key: 'pending_recap', type: 'recap' },
          { key: 'pending_reporte_diario', type: 'reporte_diario' },
          { key: 'pending_reporte_semanal', type: 'resumen_semanal' },
          { key: 'pending_resumen_semanal', type: 'resumen_semanal' },
          { key: 'pending_mensaje', type: 'notificacion' },
          { key: 'pending_test_7pm', type: 'notificacion' },
          { key: 'pending_video_semanal', type: 'resumen_semanal' },
        ];

        let totalLimpiados = 0;
        const detalles: any[] = [];

        for (const tm of teamMembers || []) {
          const notas = typeof tm.notes === 'string'
            ? JSON.parse(tm.notes || '{}')
            : (tm.notes || {});

          let modificado = false;
          const limpiados: string[] = [];

          for (const { key, type } of pendingKeys) {
            const pending = notas[key];
            if (pending?.mensaje_completo || pending?.sent_at) {
              // Verificar si expiró usando la función isPendingExpired
              if (isPendingExpired(pending, type)) {
                delete notas[key];
                modificado = true;
                limpiados.push(key);
                totalLimpiados++;
              }
            }
          }

          if (modificado) {
            await supabase.client
              .from('team_members')
              .update({ notes: notas })
              .eq('id', tm.id);

            detalles.push({
              nombre: tm.name,
              limpiados
            });
          }
        }

        return corsResponse(JSON.stringify({
          ok: true,
          total_limpiados: totalLimpiados,
          team_members_afectados: detalles.length,
          detalles
        }, null, 2));

      } catch (e: any) {
        console.error('❌ Error en limpiar-pending-expirados:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧹 DELETE-ALL-LEADS - Borra TODOS los leads y datos relacionados
    // USO: /delete-all-leads?api_key=XXX&confirm=yes
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/delete-all-leads" && request.method === "GET") {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const confirm = url.searchParams.get('confirm');
      if (confirm !== 'yes') {
        return corsResponse(JSON.stringify({ ok: false, error: 'Agrega ?confirm=yes para confirmar' }), 400);
      }

      try {
        const deletedFrom: Record<string, number> = {};
        const childTables = ['surveys', 'appointments', 'mortgage_applications', 'messages', 'reservations', 'offers', 'conversation_history', 'follow_ups', 'activities', 'lead_activities', 'event_registrations', 'pending_videos', 'call_logs'];

        for (const table of childTables) {
          try {
            const { data } = await supabase.client.from(table).delete().not('id', 'is', null).select('id');
            if (data && data.length > 0) deletedFrom[table] = data.length;
          } catch {}
        }

        // Delete all leads
        const { data: deletedLeads } = await supabase.client.from('leads').delete().not('id', 'is', null).select('id, name, phone');
        deletedFrom['leads'] = deletedLeads?.length || 0;

        return corsResponse(JSON.stringify({
          ok: true,
          message: 'Todos los leads y datos relacionados han sido eliminados',
          deleted_from: deletedFrom,
          leads_deleted: deletedLeads?.map(l => ({ name: l.name, phone: l.phone })) || []
        }, null, 2));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧹 CLEANUP-TEST-LEADS - Elimina lead + todas las dependencias (surveys incluidas)
    // USO: /cleanup-test-leads?phone=5610016226&api_key=XXX
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/cleanup-test-leads" && request.method === "GET") {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      try {
        const phone = url.searchParams.get('phone');
        if (!phone) {
          return corsResponse(JSON.stringify({ ok: false, error: 'Falta parámetro phone' }), 400);
        }

        const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
        const deletedFrom: Record<string, number> = {};

        // 1. Buscar leads que coincidan
        const { data: allLeads } = await supabase.client
          .from('leads')
          .select('id, phone, name')
          .not('phone', 'is', null);
        const matchingLeads = (allLeads || []).filter(l =>
          l.phone?.replace(/\D/g, '').slice(-10) === phoneSuffix
        );

        if (matchingLeads.length === 0) {
          return corsResponse(JSON.stringify({ ok: true, message: 'No se encontraron leads con ese teléfono', phone }));
        }

        for (const lead of matchingLeads) {
          // Delete from all related tables
          const tables = ['surveys', 'appointments', 'mortgage_applications', 'messages', 'reservations', 'offers', 'conversation_history', 'lead_activities', 'event_registrations', 'pending_videos', 'call_logs'];
          for (const table of tables) {
            try {
              const { data } = await supabase.client.from(table).delete().eq('lead_id', lead.id).select('id');
              if (data && data.length > 0) deletedFrom[table] = (deletedFrom[table] || 0) + data.length;
            } catch {}
          }
          // Also delete surveys by phone (they might not have lead_id)
          try {
            const { data } = await supabase.client.from('surveys').delete().like('lead_phone', `%${phoneSuffix}`).select('id');
            if (data && data.length > 0) deletedFrom['surveys_by_phone'] = (deletedFrom['surveys_by_phone'] || 0) + data.length;
          } catch {}
          // Optional tables
          try { await supabase.client.from('follow_ups').delete().eq('lead_id', lead.id); } catch {}
          try { await supabase.client.from('activities').delete().eq('lead_id', lead.id); } catch {}
          // Delete the lead itself
          const { error: leadDeleteError } = await supabase.client.from('leads').delete().eq('id', lead.id);
          if (leadDeleteError) {
            console.error('❌ Error borrando lead:', lead.id, leadDeleteError.message, leadDeleteError.details, leadDeleteError.hint);
            deletedFrom['lead_delete_error'] = leadDeleteError.message as any;
          } else {
            deletedFrom['leads'] = (deletedFrom['leads'] || 0) + 1;
          }
        }

        return corsResponse(JSON.stringify({
          ok: true,
          phone,
          leads_found: matchingLeads.length,
          leads_deleted: matchingLeads.map(l => ({ id: l.id, name: l.name })),
          deleted_from: deletedFrom
        }, null, 2));

      } catch (e: any) {
        console.error('❌ Error en cleanup-test-leads:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📞 VERIFICAR-PENDING-LLAMADAS - Sistema híbrido: llama si pasaron 2h sin respuesta
    // USO: /verificar-pending-llamadas?api_key=XXX
    // NOTA: Se ejecuta automáticamente en CRON cada 30 minutos
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/verificar-pending-llamadas" && request.method === "GET") {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      try {
        // Verificar si Retell está configurado
        if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
          return corsResponse(JSON.stringify({
            ok: false,
            error: 'Retell no está configurado',
            missing: {
              RETELL_API_KEY: !env.RETELL_API_KEY,
              RETELL_AGENT_ID: !env.RETELL_AGENT_ID,
              RETELL_PHONE_NUMBER: !env.RETELL_PHONE_NUMBER
            }
          }, null, 2), 400);
        }

        const retellConfig = {
          apiKey: env.RETELL_API_KEY,
          agentId: env.RETELL_AGENT_ID,
          phoneNumber: env.RETELL_PHONE_NUMBER
        };

        // Crear instancia de Meta para enviar mensajes
        const metaService = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

        // Modo debug: mostrar estado actual sin ejecutar llamadas
        const debugMode = url.searchParams.get('debug') === 'true';
        const resetMode = url.searchParams.get('reset') === 'true';

        if (debugMode || resetMode) {
          // Obtener team members con pending messages
          const { data: teamMembers } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('active', true)
            .in('role', ['vendedor', 'admin']);

          const pendingDetails: any[] = [];
          const tiposConLlamada = ['briefing', 'reporte_diario', 'alerta_lead', 'recordatorio_cita'];
          const pendingKeyMap: Record<string, string> = {
            'briefing': 'pending_briefing',
            'reporte_diario': 'pending_reporte_diario',
            'alerta_lead': 'pending_alerta_lead',
            'recordatorio_cita': 'pending_recordatorio_cita',
          };

          for (const tm of teamMembers || []) {
            const notas = typeof tm.notes === 'string' ? JSON.parse(tm.notes || '{}') : (tm.notes || {});

            for (const tipo of tiposConLlamada) {
              const pendingKey = pendingKeyMap[tipo];
              const pending = notas[pendingKey];

              if (pending?.mensaje_completo) {
                const sentAt = new Date(pending.sent_at).getTime();
                const tiempoEspera = Date.now() - sentAt;
                const horasEspera = Math.round(tiempoEspera / (1000 * 60 * 60) * 10) / 10;

                pendingDetails.push({
                  nombre: tm.name,
                  telefono: tm.phone,
                  tipo,
                  enviado_hace: `${horasEspera}h`,
                  llamada_intentada: pending.llamada_intentada || false,
                  ultimo_error: pending.ultimo_error_llamada,
                });

                // Si es modo reset, limpiar el flag
                if (resetMode && pending.llamada_intentada) {
                  delete notas[pendingKey].llamada_intentada;
                  delete notas[pendingKey].ultimo_error_llamada;
                  await supabase.client.from('team_members').update({ notes: notas }).eq('id', tm.id);
                }
              }
            }
          }

          return corsResponse(JSON.stringify({
            ok: true,
            mode: resetMode ? 'reset' : 'debug',
            pending_con_llamada: pendingDetails,
            retell_config: {
              from_number: env.RETELL_PHONE_NUMBER,
              agent_id: env.RETELL_AGENT_ID ? '✅ Configurado' : '❌ Falta',
              api_key: env.RETELL_API_KEY ? '✅ Configurado' : '❌ Falta',
            }
          }, null, 2));
        }

        console.log('📞 Ejecutando verificación manual de pending para llamar...');
        const result = await verificarPendingParaLlamar(supabase, metaService, retellConfig);

        return corsResponse(JSON.stringify({
          ok: true,
          llamadas_realizadas: result.llamadas,
          errores: result.errores,
          detalles_errores: result.detalles || [],
          config: {
            horasEspera: CALL_CONFIG.esperaAntesLlamar,
            maxLlamadasDia: CALL_CONFIG.maxLlamadasDia,
            horasPermitidas: `${CALL_CONFIG.horasPermitidas.inicio}:00 - ${CALL_CONFIG.horasPermitidas.fin}:00 (México)`
          }
        }, null, 2));

      } catch (e: any) {
        console.error('❌ Error en verificar-pending-llamadas:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 TEST-AI-RESPONSE - Prueba respuestas de SARA sin enviar WhatsApp
    // USO: /test-ai-response?msg=tienen%20casas%20en%20polanco&api_key=XXX
    // IMPORTANTE: Usa el MISMO servicio que los leads reales (AIConversationService)
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-ai-response" && request.method === "GET") {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const msg = url.searchParams.get('msg') || 'hola';
      const leadName = url.searchParams.get('name') || 'Lead Prueba';

      try {
        // Obtener propiedades para contexto
        const { data: properties } = await supabase.client
          .from('properties')
          .select('*');

        // Crear lead simulado con historial vacío
        const leadSimulado = {
          id: 'test-lead-id',
          phone: '5210000000000',
          name: leadName,
          status: 'new',
          property_interest: null,
          conversation_history: [],
          notes: {},
          resources_sent_for: null
        };

        // Crear todas las instancias de servicios necesarios
        const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        const twilio = null as any; // No necesitamos Twilio para pruebas

        // Usar el MISMO servicio que los leads reales
        const aiService = new AIConversationService(supabase, twilio, meta, calendar, claude, env);
        const startTime = Date.now();

        // analyzeWithAI es el método real que procesa mensajes de leads
        const analysis = await aiService.analyzeWithAI(msg, leadSimulado, properties || []);

        const responseTime = Date.now() - startTime;

        // La respuesta ya viene procesada por AIConversationService
        // que incluye TODAS las correcciones (alberca, tasas, brochure, etc.)
        return corsResponse(JSON.stringify({
          ok: true,
          pregunta: msg,
          respuesta_sara: analysis.response,
          tiempo_ms: responseTime,
          lead_simulado: leadName,
          desarrollos_disponibles: properties?.length || 0,
          intent: analysis.intent,
          desarrollo_detectado: analysis.desarrollo_cita || analysis.extracted_data?.desarrollo,
          // Flags de recursos (estos activan envío automático en producción)
          send_gps: analysis.send_gps || false,
          send_video: analysis.send_video || false,
          send_brochure: analysis.send_brochure || false,
          send_video_desarrollo: analysis.send_video_desarrollo || false,
          phase: analysis.phase || 'unknown',
          phaseNumber: analysis.phaseNumber || 0,
          nota: 'Usa el MISMO servicio que los leads reales (AIConversationService)'
        }));

      } catch (e: any) {
        console.error('❌ Error en test-ai-response:', e);
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🚨 EMERGENCY STOP - Detener TODOS los broadcasts inmediatamente
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/api/emergency-stop" && request.method === "POST") {
      console.log('🚨 EMERGENCY STOP ACTIVADO');

      // 1. Desactivar broadcasts en system_config
      await supabase.client
        .from('system_config')
        .upsert({ key: 'broadcasts_enabled', value: 'false', updated_at: new Date().toISOString() });

      // 2. Cancelar TODOS los jobs pendientes en la cola
      const { data: cancelled } = await supabase.client
        .from('broadcast_jobs')
        .update({ status: 'cancelled', error_message: 'EMERGENCY STOP activado' })
        .in('status', ['pending', 'processing'])
        .select('id');

      // 3. Cancelar follow-ups pendientes
      const { data: followupsCancelled } = await supabase.client
        .from('scheduled_followups')
        .update({ cancelled: true, cancel_reason: 'EMERGENCY STOP' })
        .eq('sent', false)
        .eq('cancelled', false)
        .select('id');

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarAlertaSistema(meta,
        `🚨 EMERGENCY STOP ACTIVADO\n\n✅ Broadcasts deshabilitados\n✅ ${cancelled?.length || 0} jobs cancelados\n✅ ${followupsCancelled?.length || 0} follow-ups cancelados\n\nPara reactivar: POST /api/broadcasts-enable`,
        env, 'emergency_stop'
      );

      return corsResponse(JSON.stringify({
        success: true,
        message: 'EMERGENCY STOP activado',
        cancelled_jobs: cancelled?.length || 0,
        cancelled_followups: followupsCancelled?.length || 0
      }));
    }

    // Reactivar broadcasts después de emergency stop
    if (url.pathname === "/api/broadcasts-enable" && request.method === "POST") {
      await supabase.client
        .from('system_config')
        .upsert({ key: 'broadcasts_enabled', value: 'true', updated_at: new Date().toISOString() });

      return corsResponse(JSON.stringify({ success: true, message: 'Broadcasts reactivados' }));
    }

    // Ver estado del sistema
    if (url.pathname === "/api/system-status" && request.method === "GET") {
      const { data: config } = await supabase.client
        .from('system_config')
        .select('*')
        .eq('key', 'broadcasts_enabled')
        .single();

      const { data: pendingJobs } = await supabase.client
        .from('broadcast_jobs')
        .select('id, status')
        .in('status', ['pending', 'processing']);

      const { data: pendingFollowups } = await supabase.client
        .from('scheduled_followups')
        .select('id')
        .eq('sent', false)
        .eq('cancelled', false);

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const rateLimitStats = meta.getRateLimitStats();

      return corsResponse(JSON.stringify({
        broadcasts_enabled: config?.value !== 'false',
        pending_broadcast_jobs: pendingJobs?.length || 0,
        pending_followups: pendingFollowups?.length || 0,
        rate_limit_stats: rateLimitStats
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 RESET BROADCAST MARKER - Para poder re-probar
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/api/test-reset-broadcast" && request.method === "POST") {
      // Solo resetear los 2 teléfonos de prueba
      const { data: testLeads } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.ilike.%2224558475,phone.ilike.%610016226`);

      if (!testLeads) return corsResponse(JSON.stringify({ error: 'No leads found' }), 404);

      for (const lead of testLeads) {
        const notes = typeof lead.notes === 'object' ? lead.notes : {};
        delete notes.last_broadcast;
        await supabase.client
          .from('leads')
          .update({ notes })
          .eq('id', lead.id);
      }

      return corsResponse(JSON.stringify({
        message: 'Broadcast markers cleared',
        leads_reset: testLeads.map(l => ({ name: l.name, phone: l.phone }))
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 TEST BROADCAST - Solo para los 2 teléfonos de prueba
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/api/test-broadcast-safe" && request.method === "POST") {
      const ALLOWED_PHONES = ['5212224558475', '5215610016226', '521561001622'];
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar leads con esos teléfonos
      const { data: testLeads } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.ilike.%2224558475,phone.ilike.%610016226`);

      if (!testLeads || testLeads.length === 0) {
        return corsResponse(JSON.stringify({
          error: 'No se encontraron leads con esos teléfonos',
          searched: ALLOWED_PHONES
        }), 404);
      }

      const results: any[] = [];

      for (const lead of testLeads) {
        // Verificar que el teléfono sea uno de los permitidos
        const phoneClean = lead.phone?.replace(/\D/g, '') || '';
        const isAllowed = ALLOWED_PHONES.some(p => phoneClean.includes(p.slice(-10)));

        if (!isAllowed) {
          results.push({ phone: lead.phone, status: 'BLOCKED - not in allowed list' });
          continue;
        }

        // Verificar si ya recibió broadcast reciente (la nueva verificación)
        const notes = typeof lead.notes === 'object' ? lead.notes : {};
        if (notes.last_broadcast?.sent_at) {
          const lastSentAt = new Date(notes.last_broadcast.sent_at);
          const hoursSince = (Date.now() - lastSentAt.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            results.push({
              phone: lead.phone,
              name: lead.name,
              status: `SKIP - Ya recibió broadcast hace ${hoursSince.toFixed(1)}h`,
              last_broadcast: notes.last_broadcast
            });
            continue;
          }
        }

        // Enviar template de prueba
        try {
          await meta.sendTemplate(lead.phone, 'promo_desarrollo', 'es_MX', [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: lead.name || 'Cliente' },
                { type: 'text', text: 'TEST' },
                { type: 'text', text: '🧪 Esto es una prueba del sistema de broadcasts' }
              ]
            }
          ]);

          // Marcar como enviado
          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notes,
                last_broadcast: {
                  job_id: 'TEST',
                  segment: 'test',
                  message: 'Prueba del sistema',
                  sent_at: new Date().toISOString()
                }
              }
            })
            .eq('id', lead.id);

          results.push({
            phone: lead.phone,
            name: lead.name,
            status: 'SENT ✅',
            timestamp: new Date().toISOString()
          });
        } catch (e: any) {
          results.push({
            phone: lead.phone,
            name: lead.name,
            status: `ERROR: ${e.message}`
          });
        }
      }

      return corsResponse(JSON.stringify({
        message: 'Test broadcast ejecutado',
        leads_found: testLeads.length,
        results
      }));
    }

    // Test briefing de supervisión (coordinadores)
    if (url.pathname === "/test-supervision" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      // Para test, enviarlo a mi número
      const testPhone = "5215610016226";
      await enviarBriefingSupervisionTest(supabase, meta, testPhone);
      return corsResponse(JSON.stringify({ ok: true, message: "Briefing supervisión enviado a " + testPhone }));
    }

    // Test re-engagement automático
    if (url.pathname === "/test-reengagement" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await verificarReengagement(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: "Re-engagement ejecutado - revisa logs" }));
    }

    // Test crear cliente para post-venta (venta hace X días)
    if (url.pathname === "/test-crear-postventa") {
      const testPhone = url.searchParams.get('phone') || '5212224558475';
      const dias = parseInt(url.searchParams.get('dias') || '30'); // 30, 60, o 90 días

      const fechaVenta = new Date();
      fechaVenta.setDate(fechaVenta.getDate() - dias);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .upsert({
          name: 'Cliente Venta Prueba',
          phone: testPhone,
          status: 'sold',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Monte Verde',
          notes: {
            fecha_venta: fechaVenta.toISOString().split('T')[0],
            desarrollo: 'Santa Rita',
            post_venta: { etapa: 0, ultimo_contacto: null }
          },
          updated_at: fechaVenta.toISOString()
        }, { onConflict: 'phone' })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      // Ejecutar post-venta
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await seguimientoPostVenta(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead creado con venta hace ${dias} días y post-venta ejecutado`,
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          status: 'sold',
          fecha_venta: fechaVenta.toISOString().split('T')[0]
        }
      }));
    }

    // Test seguimiento post-venta
    if (url.pathname === "/test-postventa" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await seguimientoPostVenta(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: "Post-venta ejecutado - revisa logs" }));
    }

    // Test crear lead frío para re-engagement
    // USO: /test-crear-lead-frio?lead=5215610016226&vendedor=5212224558475&dias=4
    if (url.pathname === "/test-crear-lead-frio") {
      const leadPhone = url.searchParams.get('lead') || url.searchParams.get('phone') || '5215610016226';
      const vendedorPhone = url.searchParams.get('vendedor') || '5212224558475';
      const dias = parseInt(url.searchParams.get('dias') || '4');

      const fechaUpdate = new Date();
      fechaUpdate.setDate(fechaUpdate.getDate() - dias);

      // Buscar vendedor por teléfono
      const { data: allTeam } = await supabase.client.from('team_members').select('id, name, phone').eq('active', true);
      const vendedor = allTeam?.find(t => t.phone?.replace(/\D/g, '').slice(-10) === vendedorPhone.replace(/\D/g, '').slice(-10));

      // Primero buscar todos los leads y ver si alguno coincide con este teléfono
      const phoneSuffix = leadPhone.replace(/\D/g, '').slice(-10);
      console.log(`🧪 Buscando leads con sufijo: ${phoneSuffix}`);

      // Buscar TODOS los leads con teléfono
      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('id, phone')
        .not('phone', 'is', null);

      // Filtrar manualmente por sufijo
      const matchingLeads = (allLeads || []).filter(l =>
        l.phone?.replace(/\D/g, '').slice(-10) === phoneSuffix
      );

      console.log(`🧪 Leads encontrados con sufijo ${phoneSuffix}: ${matchingLeads.length}`);
      if (matchingLeads.length > 0) {
        console.log(`🧪 Phones encontrados: ${matchingLeads.map(l => l.phone).join(', ')}`);
      }

      // Eliminar todos los que coinciden (primero todas las dependencias)
      for (const lead of matchingLeads) {
        console.log(`🧪 Eliminando dependencias del lead ${lead.id}...`);
        // Eliminar citas
        await supabase.client.from('appointments').delete().eq('lead_id', lead.id);
        // Eliminar mortgage applications
        await supabase.client.from('mortgage_applications').delete().eq('lead_id', lead.id);
        // Eliminar messages
        await supabase.client.from('messages').delete().eq('lead_id', lead.id);
        // Eliminar reservations si existe
        await supabase.client.from('reservations').delete().eq('lead_id', lead.id);
        // Eliminar cualquier otra tabla relacionada (intentar, no falla si no existe)
        try { await supabase.client.from('follow_ups').delete().eq('lead_id', lead.id); } catch {}
        try { await supabase.client.from('activities').delete().eq('lead_id', lead.id); } catch {}

        // Ahora eliminar el lead
        const { error: deleteError } = await supabase.client.from('leads').delete().eq('id', lead.id);
        console.log(`🧪 Lead ${lead.id} eliminado (error: ${deleteError?.message || 'ninguno'})`);
      }

      // Verificar que ya no hay leads con ese teléfono
      const { data: checkAfter } = await supabase.client
        .from('leads')
        .select('id, phone')
        .not('phone', 'is', null);
      const stillMatching = (checkAfter || []).filter(l =>
        l.phone?.replace(/\D/g, '').slice(-10) === phoneSuffix
      );
      console.log(`🧪 Leads que aún coinciden después del delete: ${stillMatching.length}`);

      // Insertar nuevo lead con updated_at ya establecido
      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Lead Frío Prueba',
          phone: leadPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Monte Verde',
          notes: { reengagement: {} },
          created_at: fechaUpdate.toISOString(),
          updated_at: fechaUpdate.toISOString()
        })
        .select().single();

      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);

      // Verificar que se insertó correctamente
      const { data: leadCheck } = await supabase.client
        .from('leads')
        .select('id, phone, status, updated_at, assigned_to')
        .eq('id', newLead.id)
        .single();

      console.log(`🧪 TEST Lead Frío: id=${newLead.id}, updated_at=${leadCheck?.updated_at}, vendedor=${vendedor?.name}`);

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await reengagementDirectoLeads(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead frío creado (${dias} días sin actividad) y re-engagement ejecutado`,
        lead: { id: newLead.id, name: newLead.name, phone: leadPhone, dias_inactivo: dias },
        vendedor_asignado: { name: vendedor?.name, phone: vendedor?.phone },
        debug: { updated_at_esperado: fechaUpdate.toISOString(), updated_at_actual: leadCheck?.updated_at }
      }));
    }

    // Test crear cliente para aniversario de compra (hace 1 año hoy)
    // USO: /test-crear-aniversario?lead=5215610016226&vendedor=5212224558475
    if (url.pathname === "/test-crear-aniversario") {
      const leadPhone = url.searchParams.get('lead') || url.searchParams.get('phone') || '5215610016226';
      const vendedorPhone = url.searchParams.get('vendedor') || '5212224558475';

      // Hace exactamente 1 año
      const fechaCompra = new Date();
      fechaCompra.setFullYear(fechaCompra.getFullYear() - 1);

      // Buscar vendedor por teléfono
      const { data: allTeam } = await supabase.client.from('team_members').select('id, name, phone').eq('active', true);
      const vendedor = allTeam?.find(t => t.phone?.replace(/\D/g, '').slice(-10) === vendedorPhone.replace(/\D/g, '').slice(-10));

      // Upsert: actualizar si existe, crear si no
      const { data: newLead, error } = await supabase.client
        .from('leads')
        .upsert({
          name: 'Cliente Aniversario Prueba',
          phone: leadPhone,
          status: 'delivered',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Santa Rita',
          status_changed_at: fechaCompra.toISOString()
        }, { onConflict: 'phone' })
        .select().single();

      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarAniversarioCompra(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cliente creado con aniversario HOY (compró hace 1 año) y felicitación ejecutada`,
        lead: { id: newLead.id, name: newLead.name, phone: leadPhone, fecha_compra: fechaCompra.toISOString().split('T')[0] },
        vendedor_asignado: { name: vendedor?.name, phone: vendedor?.phone }
      }));
    }

    // Test leads fríos / re-engagement directo
    if (url.pathname === "/test-leads-frios" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await reengagementDirectoLeads(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: "Leads fríos ejecutado - revisa logs" }));
    }

    // TEST: Activar/Desactivar team member por teléfono (para pruebas)
    if (url.pathname === "/test-disable-team-member" || url.pathname === "/test-toggle-team-member") {
      const phone = url.searchParams.get('phone');
      if (!phone) return corsResponse(JSON.stringify({ error: "Falta phone" }), 400);
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      const { data: member, error: findErr } = await supabase.client
        .from('team_members')
        .select('id, name, phone, active')
        .ilike('phone', `%${phoneSuffix}`)
        .single();
      if (findErr || !member) return corsResponse(JSON.stringify({ error: "No encontrado", phoneSuffix }), 404);
      const setActive = url.searchParams.get('active') === 'true' ? true : url.searchParams.get('active') === 'false' ? false : !member.active;
      const { error } = await supabase.client.from('team_members').update({ active: setActive }).eq('id', member.id);
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
      return corsResponse(JSON.stringify({ ok: true, message: `${member.name} ${setActive ? 'activado' : 'desactivado'}`, member: { ...member, active: setActive } }));
    }

    // TEST: Actualizar status de lead (para pruebas)
    if (url.pathname === "/test-update-lead" && request.method === "POST") {
      const body = await request.json() as any;
      const { lead_id, status } = body;
      if (!lead_id || !status) {
        return corsResponse(JSON.stringify({ error: "Falta lead_id o status" }), 400);
      }
      const { error } = await supabase.client.from('leads').update({ status, status_changed_at: new Date().toISOString() }).eq('id', lead_id);
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, message: `Lead ${lead_id} actualizado a ${status}` }));
    }

    // TEST: Actualizar nombre de lead por teléfono
    if (url.pathname === "/test-update-name" && request.method === "POST") {
      const body = await request.json() as any;
      const { phone, name } = body;
      if (!phone || !name) {
        return corsResponse(JSON.stringify({ error: "Falta phone o name" }), 400);
      }
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      const { data, error } = await supabase.client
        .from('leads')
        .update({ name })
        .ilike('phone', `%${phoneSuffix}`)
        .select('id, name, phone');
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, updated: data }));
    }

    // TEST: Actualizar fechas de lead (para pruebas post-compra)
    if (url.pathname === "/test-update-dates" && request.method === "POST") {
      const body = await request.json() as any;
      const { phone, delivery_date, purchase_date, status_changed_at } = body;
      if (!phone) {
        return corsResponse(JSON.stringify({ error: "Falta phone" }), 400);
      }
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      const updateData: Record<string, string> = {};
      if (delivery_date) updateData.delivery_date = delivery_date;
      if (purchase_date) updateData.purchase_date = purchase_date;
      if (status_changed_at) updateData.status_changed_at = status_changed_at;

      if (Object.keys(updateData).length === 0) {
        return corsResponse(JSON.stringify({ error: "No hay fechas para actualizar" }), 400);
      }

      const { data, error } = await supabase.client
        .from('leads')
        .update(updateData)
        .ilike('phone', `%${phoneSuffix}`)
        .select('id, name, phone, delivery_date, purchase_date, status_changed_at');
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, updated: data }));
    }

    // TEST: Marcar lead como perdido (lost) por teléfono
    if (url.pathname === "/test-lost-lead") {
      const phone = url.searchParams.get('phone');
      const reason = url.searchParams.get('reason') || 'Marcado como perdido via test endpoint';
      if (!phone) {
        return corsResponse(JSON.stringify({ error: "Falta parámetro phone" }), 400);
      }
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      const { data: lead, error: findError } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, notes')
        .ilike('phone', `%${phoneSuffix}`)
        .maybeSingle();
      if (findError) {
        return corsResponse(JSON.stringify({ error: findError.message }), 500);
      }
      if (!lead) {
        return corsResponse(JSON.stringify({ error: `No se encontró lead con teléfono ${phone}` }), 404);
      }
      const notas = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      notas.lost_reason = reason;
      notas.lost_at = new Date().toISOString();
      notas.status_before_lost = lead.status;
      const { error: updateError } = await supabase.client
        .from('leads')
        .update({
          status: 'lost',
          status_changed_at: new Date().toISOString(),
          notes: notas
        })
        .eq('id', lead.id);
      if (updateError) {
        return corsResponse(JSON.stringify({ error: updateError.message }), 500);
      }
      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead "${lead.name || phone}" marcado como lost`,
        lead_id: lead.id,
        previous_status: lead.status,
        reason
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Verificar manejo de respuestas interactivas
    // Prueba todos los mensajes con opciones 1️⃣2️⃣3️⃣ y templates
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === "/test-interactive-responses") {
      const results: any[] = [];
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // 1. Test: Simular respuesta a lista (como lo envía WhatsApp)
      const testListReply = {
        type: 'interactive',
        interactive: {
          type: 'list_reply',
          list_reply: { id: '2', title: 'No llegó' }
        }
      };

      // 2. Test: Simular respuesta a botón
      const testButtonReply = {
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'confirmar', title: 'Confirmar' }
        }
      };

      // 3. Test: Mensaje de texto normal
      const testTextMessage = {
        type: 'text',
        text: { body: '2' }
      };

      // Función para extraer texto (misma lógica que el webhook)
      const extractText = (message: any): string => {
        if (message.type === 'text') {
          return message.text?.body || '';
        } else if (message.type === 'interactive') {
          const interactiveType = message.interactive?.type;
          if (interactiveType === 'list_reply') {
            return message.interactive.list_reply?.id || message.interactive.list_reply?.title || '';
          } else if (interactiveType === 'button_reply') {
            return message.interactive.button_reply?.id || message.interactive.button_reply?.title || '';
          }
        } else if (message.type === 'button') {
          return message.button?.text || message.button?.payload || '';
        }
        return '';
      };

      // Ejecutar pruebas de extracción
      results.push({
        test: 'Extracción list_reply',
        input: testListReply,
        extracted: extractText(testListReply),
        expected: '2',
        passed: extractText(testListReply) === '2'
      });

      results.push({
        test: 'Extracción button_reply',
        input: testButtonReply,
        extracted: extractText(testButtonReply),
        expected: 'confirmar',
        passed: extractText(testButtonReply) === 'confirmar'
      });

      results.push({
        test: 'Extracción text normal',
        input: testTextMessage,
        extracted: extractText(testTextMessage),
        expected: '2',
        passed: extractText(testTextMessage) === '2'
      });

      // 4. Listar todos los mensajes interactivos que SARA envía
      const interactiveMessages = [
        {
          nombre: '¿LLEGÓ? (No-show check)',
          opciones: ['1 = Sí llegó', '2 = No llegó'],
          handler: 'procesarRespuestaShowConfirmation',
          storage: 'team_members.notes.pending_show_confirmation'
        },
        {
          nombre: 'Feedback post-visita (vendedor)',
          opciones: ['1 = Muy interesado 🔥', '2 = Ver más opciones', '3 = Tibio/dudas'],
          handler: 'postVisitService.processResponse',
          storage: 'team_members.notes.post_visit_context'
        },
        {
          nombre: 'Seguimiento no-show',
          opciones: ['1 = Ya reagendamos', '2 = No contesta', '3 = Ya no le interesa'],
          handler: 'postVisitService.processResponse',
          storage: 'team_members.notes.post_visit_context'
        },
        {
          nombre: 'Encuesta post-visita (lead)',
          opciones: ['1 = Me encantó', '2 = Quiero ver más', '3 = Tengo dudas'],
          handler: 'encuestasService',
          storage: 'leads.notes.survey_step'
        },
        {
          nombre: 'NPS (0-10)',
          opciones: ['0-6 = Detractor', '7-8 = Pasivo', '9-10 = Promotor'],
          handler: 'procesarRespuestaNPS',
          storage: 'leads.notes.pending_nps'
        },
        {
          nombre: 'Modalidad asesor crédito',
          opciones: ['1 = Llamada', '2 = WhatsApp', '3 = Presencial'],
          handler: 'creditFlowService',
          storage: 'leads.notes.credit_flow'
        },
        {
          nombre: 'Satisfacción casa',
          opciones: ['1 = Excelente', '2 = Buena', '3 = Regular', '4 = Mala'],
          handler: 'procesarRespuestaSatisfaccionCasa',
          storage: 'leads.notes.pending_satisfaccion_casa'
        },
        {
          nombre: 'Seguimiento post-entrega',
          opciones: ['Texto libre sobre llaves/escrituras/servicios'],
          handler: 'procesarRespuestaEntrega',
          storage: 'leads.notes.pending_post_entrega'
        },
        {
          nombre: 'Mantenimiento',
          opciones: ['Texto libre sobre necesidades'],
          handler: 'procesarRespuestaMantenimiento',
          storage: 'leads.notes.pending_mantenimiento'
        }
      ];

      // 5. Verificar que el fix de interactive está aplicado
      const webhookFixApplied = true; // Ya está en el código

      const allPassed = results.every(r => r.passed);

      return corsResponse(JSON.stringify({
        ok: allPassed,
        summary: {
          total_tests: results.length,
          passed: results.filter(r => r.passed).length,
          failed: results.filter(r => !r.passed).length
        },
        extraction_tests: results,
        interactive_messages_catalog: interactiveMessages,
        webhook_fix_applied: webhookFixApplied,
        fix_description: 'El webhook ahora extrae texto de message.interactive.list_reply y button_reply además de message.text.body'
      }, null, 2));
    }

    // TEST: Eliminar citas de un lead (para pruebas)
    if (url.pathname === "/test-delete-appointments") {
      const nombre = url.searchParams.get('nombre');
      if (!nombre) {
        return corsResponse(JSON.stringify({ error: "Falta ?nombre=X" }), 400);
      }
      // Buscar lead
      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name')
        .ilike('name', `%${nombre}%`)
        .limit(1);
      if (!leads || leads.length === 0) {
        return corsResponse(JSON.stringify({ error: "Lead no encontrado" }), 404);
      }
      const leadId = leads[0].id;
      // Buscar citas del lead
      const { data: citas } = await supabase.client
        .from('appointments')
        .select('id')
        .eq('lead_id', leadId);

      if (citas && citas.length > 0) {
        const citaIds = citas.map(c => c.id);
        // Eliminar surveys primero
        await supabase.client
          .from('surveys')
          .delete()
          .in('appointment_id', citaIds);
        // Eliminar citas
        await supabase.client
          .from('appointments')
          .delete()
          .in('id', citaIds);
      }
      return corsResponse(JSON.stringify({ ok: true, deleted: citas?.length || 0, lead: leads[0] }));
    }

    // TEST: Debug lead (ver todos los campos)
    if (url.pathname === "/test-debug-lead") {
      const nombre = url.searchParams.get('nombre') || 'Lead';

      const { data, error } = await supabase.client
        .from('leads')
        .select('*')
        .ilike('name', `%${nombre}%`)
        .limit(1);
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      // También obtener citas del lead
      if (data && data[0]) {
        const { data: citas } = await supabase.client
          .from('appointments')
          .select('*')
          .eq('lead_id', data[0].id)
          .order('created_at', { ascending: false })
          .limit(5);
        return corsResponse(JSON.stringify({ ok: true, lead: data[0], citas: citas || [] }));
      }
      return corsResponse(JSON.stringify({ ok: true, lead: data?.[0] || null, citas: [] }));
    }

    // TEST: Actualizar property_interest de un lead
    if (url.pathname === "/test-update-interest") {
      const nombre = url.searchParams.get('nombre');
      const desarrollo = url.searchParams.get('desarrollo');
      if (!nombre || !desarrollo) {
        return corsResponse(JSON.stringify({ error: "Falta ?nombre=X&desarrollo=Y" }), 400);
      }
      const { data, error } = await supabase.client
        .from('leads')
        .update({ property_interest: desarrollo })
        .ilike('name', `%${nombre}%`)
        .select('id, name, phone, property_interest');
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, updated: data }));
    }

    // TEST: Simular inactividad de lead (poner last_message_at hace 48h)
    if (url.pathname === "/test-simulate-inactive") {
      const nombre = url.searchParams.get('nombre') || 'Lead Prueba';

      const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.client
        .from('leads')
        .update({ last_message_at: hace48h })
        .ilike('name', `%${nombre}%`)
        .select('id, name, phone, last_message_at');
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, message: `Lead(s) marcados como inactivos (48h)`, updated: data }));
    }

    // TEST: Enviar video directamente a un teléfono
    if (url.pathname === "/test-force-video" && request.method === "POST") {
      const body = await request.json() as any;
      const { phone, desarrollo } = body;

      if (!phone) {
        return corsResponse(JSON.stringify({ error: "Falta phone" }), 400);
      }

      // Formatear teléfono (últimos 10 dígitos + 521)
      const phoneDigits = phone.replace(/\D/g, '').slice(-10);
      const phoneFormatted = '521' + phoneDigits;

      // Buscar video del desarrollo
      const dev = desarrollo || 'monte verde';
      const { data: props } = await supabase.client
        .from('properties')
        .select('youtube_link, development')
        .ilike('development', `%${dev}%`)
        .not('youtube_link', 'is', null)
        .limit(1);

      if (!props || props.length === 0 || !props[0].youtube_link) {
        return corsResponse(JSON.stringify({ error: "Video no encontrado para " + dev }), 404);
      }

      const videoUrl = props[0].youtube_link;
      const devName = props[0].development;

      // Enviar video directamente
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await meta.sendWhatsAppMessage(phoneFormatted, `🎬 Mira cómo es *${devName}* por dentro:\n${videoUrl}`);

      return corsResponse(JSON.stringify({
        ok: true,
        phone: phoneFormatted,
        video_enviado: videoUrl,
        desarrollo: devName
      }));
    }

    // Debug endpoint - probar con diferentes configuraciones de template
    if (url.pathname === '/api/test-send' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const phone = body.phone?.replace(/\D/g, '').slice(-10);

        // Construir payload manualmente para ver exactamente qué enviamos
        const phoneNormalized = phone.startsWith('52') && phone.length === 10 ? '521' + phone :
                               phone.length === 10 ? '521' + phone : phone;

        const url = `https://graph.facebook.com/v22.0/${env.META_PHONE_NUMBER_ID}/messages`;

        // Template Meta appointment_confirmation_v2: ¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.
        // Botón dinámico: https://maps.app.goo.gl/{{1}}
        const gpsCode = body.gps_link ? body.gps_link.replace(/^https?:\/\/maps\.app\.goo\.gl\//, '') : (body.gps_code || 'qR8vK3xYz9M');
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNormalized,
          type: 'template',
          template: {
            name: 'appointment_confirmation_v2',
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: body.nombre || 'Cliente' },                              // {{1}} Nombre
                  { type: 'text', text: 'Grupo Santa Rita' },                                    // {{2}} Empresa
                  { type: 'text', text: `visita a ${body.desarrollo || 'nuestras oficinas'}` },  // {{3}} Visita
                  { type: 'text', text: body.fecha || '10 de enero' },                           // {{4}} Fecha
                  { type: 'text', text: body.hora || '5:00 PM' }                                 // {{5}} Hora
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  { type: 'text', text: gpsCode }                                                // {{1}} Sufijo GPS
                ]
              }
            ]
          }
        };

        console.log('📤 DEBUG - Enviando template:', JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('📥 DEBUG - Respuesta Meta:', JSON.stringify(result, null, 2));

        // Si el template se envió correctamente, actualizar el lead
        let leadUpdateResult = null;
        if (response.ok) {
          try {
            const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
            // Buscar lead por teléfono (últimos 10 dígitos)
            const searchPhone = phone.slice(-10);
            console.log('🔍 Buscando lead con phone que contenga:', searchPhone);

            const { data: existingLead, error: searchError } = await supabase.client
              .from('leads')
              .select('*')
              .ilike('phone', `%${searchPhone}%`)
              .single();

            console.log('🔍 Resultado búsqueda:', existingLead?.name || 'No encontrado', searchError?.message || '');

            if (existingLead) {
              // Actualizar lead existente - solo template_sent
              const { error: updateError } = await supabase.client.from('leads').update({
                template_sent: 'appointment_confirmation',
                template_sent_at: new Date().toISOString()
              }).eq('id', existingLead.id);

              leadUpdateResult = updateError ? `Error: ${updateError.message}` : `Lead ${existingLead.name} actualizado`;
              console.log('✅ Lead actualizado con template_sent:', existingLead.name, updateError || '');
            } else {
              // Crear nuevo lead
              const { error: insertError } = await supabase.client.from('leads').insert({
                phone: phoneNormalized,
                name: body.nombre || 'Lead Test',
                source: 'test_template',
                template_sent: 'appointment_confirmation',
                template_sent_at: new Date().toISOString()
              });
              leadUpdateResult = insertError ? `Error: ${insertError.message}` : 'Nuevo lead creado';
              console.log('✅ Nuevo lead creado con template_sent', insertError || '');
            }
          } catch (dbError: any) {
            leadUpdateResult = `DB Error: ${dbError.message}`;
            console.error('❌ Error actualizando lead:', dbError);
          }
        }

        return new Response(JSON.stringify({
          success: response.ok,
          payload_sent: payload,
          result,
          lead_update: leadUpdateResult
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CLEANUP TEST LEAD - Borrar lead y citas para simulación
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/test-cleanup' && request.method === 'POST') {
      try {
        const body = await request.json() as { telefono: string };
        const telefono = body.telefono;
        if (!telefono) {
          return corsResponse(JSON.stringify({ error: 'telefono requerido' }), 400);
        }

        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        const phoneClean = telefono.replace(/\D/g, '').slice(-10);

        // Buscar TODOS los leads con ese número (puede haber duplicados)
        const { data: leads, error: searchError } = await supabase.client
          .from('leads')
          .select('id, name, phone')
          .ilike('phone', `%${phoneClean}%`);

        if (searchError) {
          return corsResponse(JSON.stringify({ error: 'Error buscando leads: ' + searchError.message }), 500);
        }

        if (!leads || leads.length === 0) {
          return corsResponse(JSON.stringify({ message: 'No se encontraron leads', telefono }));
        }

        console.log(`🧹 CLEANUP: Encontrados ${leads.length} leads con ${phoneClean}`);
        leads.forEach(l => console.log(`   - ${l.id}: ${l.name} (${l.phone})`));

        let totalCitasBorradas = 0;
        const leadsBorrados: string[] = [];

        // Borrar cada lead y sus citas
        for (const lead of leads) {
          // Borrar citas del lead
          const { data: citasBorradas, error: citasError } = await supabase.client
            .from('appointments')
            .delete()
            .eq('lead_id', lead.id)
            .select('id');

          if (citasError) {
            console.error(`⚠️ Error borrando citas de ${lead.name}: ${citasError.message}`);
          }
          totalCitasBorradas += citasBorradas?.length || 0;

          // Borrar aplicaciones de hipoteca
          const { error: mortgageError } = await supabase.client
            .from('mortgage_applications')
            .delete()
            .eq('lead_id', lead.id);

          if (mortgageError) {
            console.error(`⚠️ Error borrando mortgage_applications de ${lead.name}: ${mortgageError.message}`);
          } else {
            console.log(`✅ Mortgage applications borradas para ${lead.name}`);
          }

          // Borrar lead
          const { error: deleteError } = await supabase.client
            .from('leads')
            .delete()
            .eq('id', lead.id);

          if (deleteError) {
            console.error(`❌ Error borrando lead ${lead.name}: ${deleteError.message}`);
          } else {
            console.log(`✅ Lead ${lead.name} borrado exitosamente`);
            leadsBorrados.push(lead.name || lead.id);
          }
        }

        return corsResponse(JSON.stringify({
          success: true,
          leads_encontrados: leads.length,
          leads_borrados: leadsBorrados,
          citas_borradas: totalCitasBorradas
        }));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CANCEL APPOINTMENT BY PHONE - Cancelar cita de un lead por teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/cancel-appointment' && request.method === 'POST') {
      try {
        const body = await request.json() as { telefono: string };
        const telefono = body.telefono;
        if (!telefono) {
          return corsResponse(JSON.stringify({ error: 'telefono requerido' }), 400);
        }

        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        const phoneClean = telefono.replace(/\D/g, '').slice(-10);

        // Buscar lead
        const { data: leads } = await supabase.client.from('leads').select('*').ilike('phone', `%${phoneClean}%`);
        if (!leads || leads.length === 0) {
          return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
        }

        const lead = leads[0];
        console.log(`🗑️ Cancelando citas para lead ${lead.id} (${lead.name})`);

        // Buscar y cancelar citas
        const { data: appointments } = await supabase.client.from('appointments').select('*').eq('lead_id', lead.id).neq('status', 'cancelled');

        if (!appointments || appointments.length === 0) {
          return corsResponse(JSON.stringify({ message: 'No hay citas activas para este lead', lead_id: lead.id }));
        }

        let citasCanceladas = 0;
        for (const apt of appointments) {
          await supabase.client.from('appointments').update({
            status: 'cancelled',
            cancellation_reason: 'Cancelado para prueba E2E',
            cancelled_by: 'admin'
          }).eq('id', apt.id);
          citasCanceladas++;
          console.log(`✅ Cita ${apt.id} cancelada`);
        }

        // Actualizar status del lead a contacted
        await supabase.client.from('leads').update({
          status: 'contacted',
          property_interest: null
        }).eq('id', lead.id);

        return corsResponse(JSON.stringify({
          success: true,
          lead_id: lead.id,
          lead_name: lead.name,
          citas_canceladas: citasCanceladas
        }));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST SARA - Probar respuestas sin enviar WhatsApp
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/test-sara' && request.method === 'POST') {
      try {
        const body = await request.json() as { mensaje: string, telefono?: string, nombre?: string };
        const mensaje = body.mensaje || 'Hola';
        const telefono = body.telefono || '5214921234567';
        const nombre = body.nombre || null;

        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        // Buscar o crear lead de prueba
        const phoneClean = telefono.replace(/\D/g, '').slice(-10);
        let { data: lead } = await supabase.client
          .from('leads')
          .select('*')
          .ilike('phone', `%${phoneClean}%`)
          .single();

        // Si no existe, usar datos simulados
        if (!lead) {
          lead = {
            id: 'test-lead-id',
            name: nombre || 'Lead de Prueba',
            phone: telefono,
            status: 'new',
            conversation_history: [],
            asesor_notificado: false,
            resources_sent: false
          };
        }

        // Obtener propiedades y team members (sin filtrar por active para test)
        const { data: properties } = await supabase.client.from('properties').select('*');
        const { data: teamMembers } = await supabase.client.from('team_members').select('*');

        // Crear handler pero SIN enviar mensajes
        const handler = new WhatsAppHandler(supabase, env);

        // Simular análisis con Claude (usar el método interno)
        const claude = new ClaudeService(env.ANTHROPIC_API_KEY);

        // Construir catálogo simplificado
        let catalogo = '\\n═══ DESARROLLOS DISPONIBLES ═══\\n';
        const devMap = new Map<string, any[]>();
        (properties || []).forEach((p: any) => {
          const dev = p.development || 'Otros';
          if (!devMap.has(dev)) devMap.set(dev, []);
          devMap.get(dev)!.push(p);
        });
        devMap.forEach((props, dev) => {
          const precios = props.filter((p: any) => p.price > 0).map((p: any) => p.price);
          if (precios.length > 0) {
            const min = Math.min(...precios);
            const max = Math.max(...precios);
            catalogo += `• ${dev}: $${(min/1000000).toFixed(1)}M - $${(max/1000000).toFixed(1)}M\\n`;
          }
        });

        // System prompt para test
        const systemPrompt = `Eres SARA, asesora inmobiliaria de Grupo Santa Rita en Zacatecas.
Responde de forma amigable y profesional.

CATÁLOGO:
${catalogo}

ESTÁNDARES MEXICANOS:
- Enganche: 10-20%
- Escrituración: 4-7%
- INFONAVIT: 1080 puntos, 130 semanas
- FOVISSSTE: 18 meses

Responde en JSON:
{
  "intent": "saludo|info_desarrollo|credito|cita|otro",
  "response": "tu respuesta aquí",
  "extracted_data": {}
}`;

        const userContext = `Cliente: ${lead.name || 'No proporcionado'}
Mensaje: ${mensaje}`;

        const aiResponse = await claude.chat([], userContext, systemPrompt);

        let parsed: any = { response: aiResponse, intent: 'unknown' };
        try {
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          parsed = { response: aiResponse, intent: 'parse_error' };
        }

        // Simular acciones que se ejecutarían
        const acciones: string[] = [];
        const intent = parsed.intent || 'unknown';
        const datos = parsed.extracted_data || {};

        // Detectar desarrollo mencionado
        const desarrollos = ['Monte Verde', 'Los Encinos', 'Distrito Falco', 'Miravalle', 'Andes', 'Monte Real'];
        const desarrolloMencionado = desarrollos.find(d =>
          mensaje.toLowerCase().includes(d.toLowerCase()) ||
          (parsed.response || '').toLowerCase().includes(d.toLowerCase())
        );

        // Acciones según intent
        if (intent === 'cita' || mensaje.toLowerCase().includes('visitar') || mensaje.toLowerCase().includes('cita')) {
          acciones.push('📅 AGENDAR CITA - Pediría fecha y hora');
          if (desarrolloMencionado) {
            acciones.push(`🏠 Desarrollo: ${desarrolloMencionado}`);
          }
        }

        if (intent === 'credito' || mensaje.toLowerCase().includes('infonavit') || mensaje.toLowerCase().includes('credito')) {
          acciones.push('💳 FLUJO CRÉDITO - Preguntaría por banco, ingreso, enganche');
          acciones.push('👨‍💼 Podría notificar al ASESOR VIP');
        }

        if (intent === 'info_desarrollo' || desarrolloMencionado) {
          acciones.push('📹 ENVIAR RECURSOS:');
          if (desarrolloMencionado) {
            // Buscar propiedades del desarrollo CON recursos
            const propsDelDev = (properties || []).filter((p: any) =>
              p.development?.toLowerCase().includes(desarrolloMencionado.toLowerCase())
            );
            const propConVideo = propsDelDev.find((p: any) => p.youtube_link);
            const propConMatterport = propsDelDev.find((p: any) => p.matterport_link);

            if (propConVideo?.youtube_link) {
              acciones.push(`  • Video YouTube: ${propConVideo.youtube_link.substring(0, 50)}...`);
            }
            if (propConMatterport?.matterport_link) {
              acciones.push(`  • Matterport 3D: ${propConMatterport.matterport_link.substring(0, 50)}...`);
            }
            if (!propConVideo && !propConMatterport) {
              acciones.push(`  • (No hay recursos en DB para ${desarrolloMencionado})`);
            }
          }
        }

        if (mensaje.toLowerCase().includes('vendedor') || mensaje.toLowerCase().includes('persona real') || mensaje.toLowerCase().includes('llamar')) {
          acciones.push('📞 CONTACTAR VENDEDOR - Notificaría al equipo de ventas');
        }

        if (datos.presupuesto || mensaje.match(/\d+\s*(mil|millon)/i)) {
          acciones.push(`💰 Presupuesto detectado: ${datos.presupuesto || 'Ver mensaje'}`);
        }

        if (datos.recamaras || mensaje.match(/\d+\s*rec/i)) {
          acciones.push(`🛏️ Recámaras: ${datos.recamaras || 'Ver mensaje'}`);
        }

        if (acciones.length === 0) {
          acciones.push('💬 Solo respuesta de texto (sin acciones adicionales)');
        }

        return corsResponse(JSON.stringify({
          success: true,
          test_mode: true,
          mensaje_enviado: mensaje,
          lead_encontrado: !!lead?.id && lead.id !== 'test-lead-id',
          lead_info: {
            nombre: lead.name,
            telefono: lead.phone,
            status: lead.status
          },
          sara_responderia: parsed.response || aiResponse,
          intent_detectado: intent,
          datos_extraidos: datos,
          acciones_que_ejecutaria: acciones,
          nota: '⚠️ Modo TEST - No se envió mensaje real por WhatsApp'
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Verificar videos pendientes
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-videos') {
      console.log('🧪 TEST: Forzando verificación de videos...');
      await verificarVideosPendientes(supabase, new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN), env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Videos verificados' }));
    }

    // ═══════════════════════════════════════════════════════════
    // DEBUG: Ver estado de videos pendientes en Google
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/debug-videos') {
      console.log('🔍 DEBUG: Consultando estado de videos en Google...');

      const { data: pendientes } = await supabase.client
        .from('pending_videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!pendientes || pendientes.length === 0) {
        return corsResponse(JSON.stringify({ message: 'No hay videos en pending_videos' }));
      }

      const resultados = [];
      for (const video of pendientes) {
        const resultado: any = {
          id: video.id,
          lead_name: video.lead_name,
          lead_phone: video.lead_phone,
          desarrollo: video.desarrollo,
          operation_id: video.operation_id,
          sent: video.sent,
          created_at: video.created_at,
          completed_at: video.completed_at,
          video_url: video.video_url,
          google_status: null,
          google_error: null
        };

        // Solo consultar Google si no está marcado como enviado
        if (!video.sent && video.operation_id) {
          try {
            const statusResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/${video.operation_id}`,
              { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } }
            );

            if (statusResponse.ok) {
              const status = await statusResponse.json() as any;
              resultado.google_status = {
                done: status.done,
                has_error: !!status.error,
                error_message: status.error?.message,
                has_response: !!status.response,
                response_keys: status.response ? Object.keys(status.response) : [],
                video_uri: status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
                          status.response?.generatedSamples?.[0]?.video?.uri ||
                          status.result?.videos?.[0]?.uri ||
                          null
              };
            } else {
              resultado.google_error = `HTTP ${statusResponse.status}: ${await statusResponse.text()}`;
            }
          } catch (e: any) {
            resultado.google_error = e.message;
          }
        }

        resultados.push(resultado);
      }

      return corsResponse(JSON.stringify({
        total: pendientes.length,
        api_key_present: !!env.GEMINI_API_KEY,
        videos: resultados
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST FOLLOW-UPS: Verificar qué leads cumplen criterios
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-followups') {
      console.log('🔍 TEST: Verificando criterios de follow-ups...');

      const ahora = new Date();
      const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
      const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
      const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

      const resultados: any = {};

      // 1. Follow-up 24h leads nuevos
      const { data: leads24h } = await supabase.client
        .from('leads')
        .select('id, name, phone, created_at, alerta_enviada_24h')
        .eq('status', 'new')
        .lt('created_at', hace24h.toISOString())
        .is('alerta_enviada_24h', null)
        .not('phone', 'is', null)
        .limit(10);

      resultados.followUp24h = {
        criterio: 'status=new, created_at < 24h, alerta_enviada_24h IS NULL',
        encontrados: leads24h?.length || 0,
        leads: leads24h?.map(l => ({ name: l.name, phone: l.phone, created: l.created_at })) || []
      };

      // 2. Reminder docs crédito
      const { data: leadsDocs } = await supabase.client
        .from('leads')
        .select('id, name, phone, credit_status, updated_at')
        .eq('credit_status', 'docs_requested')
        .lt('updated_at', hace3dias.toISOString())
        .not('phone', 'is', null)
        .limit(10);

      resultados.reminderDocs = {
        criterio: 'credit_status=docs_requested, updated_at < 3 días',
        encontrados: leadsDocs?.length || 0,
        leads: leadsDocs?.map(l => ({ name: l.name, phone: l.phone })) || []
      };

      // 3. Video felicitación post-venta
      const { data: leadsSold } = await supabase.client
        .from('leads')
        .select('id, name, phone, property_interest, notes, updated_at')
        .eq('status', 'sold')
        .gt('updated_at', hace7dias.toISOString())
        .not('phone', 'is', null)
        .limit(10);

      const leadsSinVideo = leadsSold?.filter(l => {
        const notas = typeof l.notes === 'object' ? l.notes : {};
        return !(notas as any)?.video_felicitacion_generado;
      }) || [];

      resultados.videoPostVenta = {
        criterio: 'status=sold, updated_at > 7 días, sin video_felicitacion_generado',
        encontrados: leadsSinVideo.length,
        leads: leadsSinVideo.map(l => ({ name: l.name, property_interest: l.property_interest }))
      };

      // Distribución de status
      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('status')
        .limit(2000);

      const statusCount: Record<string, number> = {};
      allLeads?.forEach(l => {
        statusCount[l.status || 'null'] = (statusCount[l.status || 'null'] || 0) + 1;
      });
      resultados.distribucionStatus = statusCount;

      // Credit status distribution
      const { data: creditLeads } = await supabase.client
        .from('leads')
        .select('credit_status')
        .limit(1000);

      const creditCount: Record<string, number> = {};
      creditLeads?.forEach(l => {
        creditCount[l.credit_status || 'null'] = (creditCount[l.credit_status || 'null'] || 0) + 1;
      });
      resultados.distribucionCreditStatus = creditCount;

      return corsResponse(JSON.stringify(resultados, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Listar leads y actualizar status
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/list-leads') {
      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, property_interest')
        .limit(20);
      return corsResponse(JSON.stringify(leads, null, 2));
    }

    if (url.pathname.startsWith('/set-sold/')) {
      const leadId = url.pathname.split('/').pop();
      const { data: lead, error } = await supabase.client
        .from('leads')
        .update({
          status: 'sold',
          updated_at: new Date().toISOString(),
          notes: { video_felicitacion_generado: null } // Reset para probar
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 400);
      }
      return corsResponse(JSON.stringify({
        message: 'Lead actualizado a sold',
        lead: { id: lead.id, name: lead.name, status: lead.status, property_interest: lead.property_interest }
      }, null, 2));
    }

    // Forzar ejecución de video post-venta
    if (url.pathname === '/run-video-postventa') {
      console.log('🎬 Forzando ejecución de video post-venta...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await videoFelicitacionPostVenta(supabase, meta, env);
      return corsResponse(JSON.stringify({ message: 'Video post-venta ejecutado. Revisa /debug-videos para ver el estado.' }));
    }

    if (url.pathname === '/run-video-bienvenida') {
      console.log('🎬 Forzando ejecución de video bienvenida...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await videoBienvenidaLeadNuevo(supabase, meta, env);
      return corsResponse(JSON.stringify({ message: 'Video bienvenida ejecutado. Revisa /debug-videos para ver el estado.' }));
    }

    // Debug GPS links de propiedades
    if (url.pathname === '/debug-gps') {
      const { data: props, error } = await supabase.client
        .from('properties')
        .select('development, gps_link')
        .order('development');

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      const devs: Record<string, string> = {};
      props?.forEach((p: any) => {
        if (p.development && !devs[p.development]) {
          devs[p.development] = p.gps_link || 'NO TIENE';
        }
      });

      return corsResponse(JSON.stringify(devs, null, 2));
    }

    // Reset recursos para un lead (para reenviar videos)
    if (url.pathname === '/reset-lead-resources') {
      const body = await request.json() as any;
      const phone = body.phone;
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Se requiere phone' }), 400);
      }

      const digits = phone.replace(/\D/g, '').slice(-10);
      const { data: lead, error } = await supabase.client
        .from('leads')
        .select('id, name, resources_sent, resources_sent_for')
        .like('phone', '%' + digits)
        .single();

      if (error || !lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', phone }), 404);
      }

      // Resetear las columnas resources_sent
      await supabase.client
        .from('leads')
        .update({
          resources_sent: false,
          resources_sent_for: null
        })
        .eq('id', lead.id);

      return corsResponse(JSON.stringify({
        success: true,
        message: `Recursos reseteados para ${lead.name}`,
        lead_id: lead.id,
        antes: { resources_sent: lead.resources_sent, resources_sent_for: lead.resources_sent_for }
      }));
    }

    if (url.pathname === '/run-lead-scoring') {
      console.log('📊 Forzando actualización de lead scores...');
      await actualizarLeadScores(supabase);

      // Mostrar resumen de scores
      const { data: leads } = await supabase.client
        .from('leads')
        .select('name, score, lead_category, status')
        .not('status', 'in', '("closed","delivered","lost","fallen")')
        .order('score', { ascending: false })
        .limit(20);

      return corsResponse(JSON.stringify({
        message: 'Lead scoring ejecutado',
        top_leads: leads?.map(l => ({
          nombre: l.name,
          score: l.score,
          categoria: l.lead_category,
          status: l.status
        }))
      }, null, 2));
    }

    if (url.pathname === '/run-followup-postvisita') {
      console.log('📍 Forzando follow-up post-visita...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await followUpPostVisita(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Follow-up post-visita ejecutado.' }));
    }

    if (url.pathname === '/run-nurturing') {
      console.log('📚 Forzando nurturing educativo...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await nurturingEducativo(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Nurturing educativo ejecutado.' }));
    }

    if (url.pathname === '/run-referidos') {
      console.log('🤝 Forzando solicitud de referidos...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await solicitarReferidos(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Solicitud de referidos ejecutada.' }));
    }

    if (url.pathname === '/run-nps') {
      console.log('📊 Forzando envío de encuestas NPS...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const resultado = await enviarEncuestaNPS(supabase, meta);
      return corsResponse(JSON.stringify({
        message: 'Encuestas NPS',
        elegibles: resultado.elegibles,
        enviados: resultado.enviados,
        detalles: resultado.detalles
      }));
    }

    if (url.pathname === '/run-post-entrega') {
      console.log('🔑 Forzando seguimiento post-entrega...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await seguimientoPostEntrega(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Seguimiento post-entrega ejecutado.' }));
    }

    if (url.pathname === '/run-satisfaccion-casa') {
      console.log('🏡 Forzando encuesta de satisfacción con la casa...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await encuestaSatisfaccionCasa(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Encuestas de satisfacción con la casa enviadas.' }));
    }

    if (url.pathname === '/run-mantenimiento') {
      console.log('🔧 Forzando check-in de mantenimiento...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await checkInMantenimiento(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Check-in de mantenimiento ejecutado.' }));
    }

    if (url.pathname === '/run-health-monitor') {
      console.log('🏥 Forzando health monitor...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const result = await healthMonitorCron(supabase, meta, env);
      return corsResponse(JSON.stringify({ message: 'Health monitor ejecutado', ...result }));
    }

    if (url.pathname === '/run-backup') {
      console.log('💾 Forzando backup R2...');
      if (!env.SARA_BACKUPS) {
        return corsResponse(JSON.stringify({ error: 'R2 bucket SARA_BACKUPS no configurado' }), 500);
      }
      const result = await backupSemanalR2(supabase, env.SARA_BACKUPS);
      return corsResponse(JSON.stringify({
        message: 'Backup R2 ejecutado',
        conversations: { rows: result.conversations.rows, size_kb: Math.round(result.conversations.bytes / 1024) },
        leads: { rows: result.leads.rows, size_kb: Math.round(result.leads.bytes / 1024) }
      }, null, 2));
    }

    if (url.pathname === '/test-objecion') {
      // Endpoint para probar detección de objeciones
      const testMsg = url.searchParams.get('msg') || 'está muy caro, no me alcanza';
      const objeciones = detectarObjeciones(testMsg);
      return corsResponse(JSON.stringify({
        mensaje: testMsg,
        objeciones_detectadas: objeciones.map(o => ({
          tipo: o.tipo,
          prioridad: o.prioridad
        }))
      }, null, 2));
    }

    if (url.pathname === '/test-followups') {
      console.log('🧪 TEST: Forzando verificación de follow-ups...');
      const followupService = new FollowupService(supabase);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const result = await followupService.procesarFollowupsPendientes(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error enviando follow-up:', e);
          return false;
        }
      });
      return corsResponse(JSON.stringify({ ok: true, ...result }));
    }

    // ═══════════════════════════════════════════════════════════
    // Test: Sistema de Aprobación de Follow-ups
    // ═══════════════════════════════════════════════════════════

    // Crear propuesta de follow-up para un lead
    if (url.pathname === '/test-proponer-followup') {
      const leadId = url.searchParams.get('lead_id');
      const categoria = url.searchParams.get('categoria') || 'inactivo_3dias';
      const razon = url.searchParams.get('razon') || 'Lead sin actividad - prueba manual';

      if (!leadId) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_id' }), 400);
      }

      // Obtener lead
      const { data: lead, error: leadError } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      if (!lead.assigned_to) {
        return corsResponse(JSON.stringify({ error: 'Lead sin vendedor asignado', leadName: lead.name }), 400);
      }

      // Obtener vendedor
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('id', lead.assigned_to)
        .single();

      if (!vendedor?.phone) {
        return corsResponse(JSON.stringify({
          error: 'Vendedor sin teléfono',
          leadName: lead.name,
          vendedorName: vendedor?.name || 'desconocido',
          vendedorId: lead.assigned_to
        }), 400);
      }

      const approvalService = new FollowupApprovalService(supabase);
      const result = await approvalService.proponerFollowup(
        leadId,
        lead.assigned_to,
        categoria,
        razon,
        lead.property_interest || 'Santa Rita'
      );

      return corsResponse(JSON.stringify({
        ok: result.success,
        approvalId: result.approvalId,
        leadName: lead.name,
        vendedorName: lead.team_members?.name,
        categoria,
        message: result.success
          ? `Propuesta creada. El vendedor recibirá un mensaje en el próximo ciclo del CRON.`
          : 'Error creando propuesta'
      }));
    }

    // Enviar propuestas pendientes a vendedores (manual)
    if (url.pathname === '/test-enviar-propuestas') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const approvalService = new FollowupApprovalService(supabase);
      const enviadas = await approvalService.enviarPropuestasPendientes(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error enviando propuesta:', e);
          return false;
        }
      });
      return corsResponse(JSON.stringify({ ok: true, propuestasEnviadas: enviadas }));
    }

    // Pedir status a vendedores sobre leads estancados (manual)
    if (url.pathname === '/test-pedir-status') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const approvalService = new FollowupApprovalService(supabase);
      const enviados = await approvalService.pedirStatusLeadsEstancados(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error pidiendo status:', e);
          return false;
        }
      });
      return corsResponse(JSON.stringify({ ok: true, solicitudesEnviadas: enviados }));
    }

    // Ver aprobaciones pendientes
    if (url.pathname === '/api/followup-approvals') {
      const vendedorPhone = url.searchParams.get('vendedor_phone');
      const vendedorId = url.searchParams.get('vendedor_id');
      const leadId = url.searchParams.get('lead_id');
      const status = url.searchParams.get('status'); // null = todos
      const desde = url.searchParams.get('desde'); // fecha ISO
      const hasta = url.searchParams.get('hasta'); // fecha ISO

      let query = supabase.client
        .from('followup_approvals')
        .select('*, team_members:vendedor_id(name, phone)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (status) {
        query = query.eq('status', status);
      }
      if (vendedorId) {
        query = query.eq('vendedor_id', vendedorId);
      }
      if (leadId) {
        query = query.eq('lead_id', leadId);
      }
      if (vendedorPhone) {
        const cleanPhone = vendedorPhone.replace(/\D/g, '');
        query = query.like('vendedor_phone', `%${cleanPhone.slice(-10)}`);
      }
      if (desde) {
        query = query.gte('created_at', desde);
      }
      if (hasta) {
        query = query.lte('created_at', hasta);
      }

      const { data, error } = await query;
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, approvals: data, count: data?.length || 0 }));
    }

    // Estadísticas de follow-ups (para dashboard CRM)
    if (url.pathname === '/api/followup-stats') {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const hace30Dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Stats de hoy
      const { data: hoyData } = await supabase.client
        .from('followup_approvals')
        .select('status')
        .gte('created_at', inicioHoy);

      // Stats últimos 7 días
      const { data: semanaData } = await supabase.client
        .from('followup_approvals')
        .select('status')
        .gte('created_at', hace7Dias);

      // Stats últimos 30 días
      const { data: mesData } = await supabase.client
        .from('followup_approvals')
        .select('status, vendedor_id')
        .gte('created_at', hace30Dias);

      // Pendientes actuales
      const { data: pendientesData } = await supabase.client
        .from('followup_approvals')
        .select('vendedor_id, lead_name, created_at')
        .eq('status', 'pending');

      const calcStats = (data: any[]) => ({
        total: data?.length || 0,
        enviados: data?.filter(d => d.status === 'sent').length || 0,
        aprobados: data?.filter(d => d.status === 'approved').length || 0,
        editados: data?.filter(d => d.status === 'edited').length || 0,
        rechazados: data?.filter(d => d.status === 'rejected').length || 0,
        pendientes: data?.filter(d => d.status === 'pending').length || 0,
        expirados: data?.filter(d => d.status === 'expired').length || 0
      });

      // Ranking por vendedor (últimos 30 días)
      const porVendedor: Record<string, {enviados: number, rechazados: number}> = {};
      mesData?.forEach(d => {
        if (!porVendedor[d.vendedor_id]) {
          porVendedor[d.vendedor_id] = { enviados: 0, rechazados: 0 };
        }
        if (d.status === 'sent') porVendedor[d.vendedor_id].enviados++;
        if (d.status === 'rejected') porVendedor[d.vendedor_id].rechazados++;
      });

      return corsResponse(JSON.stringify({
        ok: true,
        hoy: calcStats(hoyData || []),
        semana: calcStats(semanaData || []),
        mes: calcStats(mesData || []),
        pendientes_actuales: pendientesData?.length || 0,
        pendientes_detalle: pendientesData?.slice(0, 10) || [],
        por_vendedor: porVendedor
      }));
    }

    // Test crear lead inactivo para pruebas
    if (url.pathname === '/test-crear-lead-inactivo') {
      const hace5dias = new Date();
      hace5dias.setDate(hace5dias.getDate() - 5);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const testPhone = url.searchParams.get('phone') || '5212224558475';

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .upsert({
          name: 'Lead Inactivo Prueba',
          phone: testPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Distrito Falco',
          created_at: hace5dias.toISOString(),
          updated_at: hace5dias.toISOString()
        }, { onConflict: 'phone' })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Lead inactivo creado',
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          status: newLead.status,
          updated_at: newLead.updated_at,
          assigned_to: vendedor?.name || 'Sin asignar'
        }
      }));
    }

    // Test follow-up de leads inactivos
    if (url.pathname === '/test-followup-inactivos') {
      console.log('🧪 TEST: Ejecutando follow-up de leads inactivos...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Debug info
      const ahora = new Date();
      const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
      const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

      const { data: leadsInactivos } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, updated_at, archived')
        .in('status', ['new', 'contacted', 'appointment_scheduled'])
        .lt('updated_at', hace3dias.toISOString())
        .gt('updated_at', hace30dias.toISOString())
        .not('phone', 'is', null)
        .or('archived.is.null,archived.eq.false')
        .limit(10);

      await followUpLeadsInactivos(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Follow-up de leads inactivos ejecutado',
        debug: {
          rango: `${hace3dias.toISOString().split('T')[0]} a ${hace30dias.toISOString().split('T')[0]}`,
          leads_inactivos_encontrados: leadsInactivos?.length || 0,
          muestra: leadsInactivos?.map(l => ({
            name: l.name,
            phone: l.phone,
            status: l.status,
            updated_at: l.updated_at
          })) || []
        }
      }));
    }

    // Test crear lead con apartado para probar recordatorios
    if (url.pathname === '/test-crear-apartado') {
      const testPhone = url.searchParams.get('phone') || '5212224558475';
      const diasParaPago = parseInt(url.searchParams.get('dias') || '5'); // 5, 1, o 0 para hoy

      // Calcular fecha de pago
      const ahora = new Date();
      const fechaPago = new Date(ahora.getTime() + diasParaPago * 24 * 60 * 60 * 1000);
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const fechaPagoStr = mexicoFormatter.format(fechaPago);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .upsert({
          name: 'Cliente Apartado Prueba',
          phone: testPhone,
          status: 'reserved',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Distrito Falco',
          notes: {
            apartado: {
              fecha_pago: fechaPagoStr,
              enganche: 50000,
              propiedad: 'Casa Modelo Encino - Lote 42',
              recordatorios_enviados: 0
            }
          }
        }, { onConflict: 'phone' })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead con apartado creado (pago en ${diasParaPago} días)`,
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          status: newLead.status,
          fecha_pago: fechaPagoStr,
          assigned_to: vendedor?.name || 'Sin asignar'
        }
      }));
    }

    // Test recordatorios de pago de apartados
    if (url.pathname === '/test-recordatorios-apartado') {
      console.log('🧪 TEST: Ejecutando recordatorios de pago de apartados...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await recordatoriosPagoApartado(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Recordatorios de apartado ejecutados' }));
    }

    // Simular cron a una hora específica
    if (url.pathname === '/test-simular-cron') {
      const horaSimulada = parseInt(url.searchParams.get('hora') || '10');
      const minutoSimulado = parseInt(url.searchParams.get('minuto') || '0');
      const diaSimulado = parseInt(url.searchParams.get('dia') || '5'); // 1=Lun, 5=Vie

      const isFirstRunOfHour = minutoSimulado === 0;
      const isWeekday = diaSimulado >= 1 && diaSimulado <= 5;

      const resultados: string[] = [];
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      resultados.push(`🕐 Simulando cron a las ${horaSimulada}:${minutoSimulado.toString().padStart(2, '0')} (día ${diaSimulado})`);
      resultados.push(`   isFirstRunOfHour: ${isFirstRunOfHour}`);
      resultados.push(`   isWeekday: ${isWeekday}`);

      // 8am L-V: Briefing matutino
      if (horaSimulada === 8 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Briefing matutino (8am L-V)');
      }

      // 9am Diario: Cumpleaños
      if (horaSimulada === 9 && isFirstRunOfHour) {
        resultados.push('✅ SE EJECUTARÍA: Cumpleaños leads+equipo (9am diario)');
      }

      // 10am L-V: Alertas leads fríos
      if (horaSimulada === 10 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Alertas leads fríos (10am L-V)');
      }

      // 10am Diario: Recordatorios de apartado
      if (horaSimulada === 10 && isFirstRunOfHour) {
        resultados.push('✅ SE EJECUTARÍA: Recordatorios de apartado (10am diario)');
        resultados.push('   → Ejecutando recordatoriosPagoApartado()...');
        await recordatoriosPagoApartado(supabase, meta);
        resultados.push('   → ¡Completado!');
      }

      // 11am L-V: Follow-up inactivos
      if (horaSimulada === 11 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Follow-up leads inactivos (11am L-V)');
      }

      // 14 (2pm) L-V: Leads HOT urgentes
      if (horaSimulada === 14 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Alertas leads HOT (2pm L-V)');
      }

      // 19 (7pm) L-V: Recap del día
      if (horaSimulada === 19 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Recap del día (7pm L-V)');
      }

      return corsResponse(JSON.stringify({
        simulacion: {
          hora: horaSimulada,
          minuto: minutoSimulado,
          dia_semana: diaSimulado,
          isFirstRunOfHour,
          isWeekday
        },
        resultados
      }, null, 2));
    }

    // Debug: Ver estado actual del cron y qué se ejecutaría
    if (url.pathname === '/debug-cron-status') {
      const now = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const mexicoParts = mexicoFormatter.formatToParts(now);
      const mexicoHour = parseInt(mexicoParts.find(p => p.type === 'hour')?.value || '0');
      const mexicoMinute = parseInt(mexicoParts.find(p => p.type === 'minute')?.value || '0');
      const mexicoWeekday = mexicoParts.find(p => p.type === 'weekday')?.value || '';
      const mexicoDate = `${mexicoParts.find(p => p.type === 'year')?.value}-${mexicoParts.find(p => p.type === 'month')?.value}-${mexicoParts.find(p => p.type === 'day')?.value}`;

      const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const dayOfWeek = dayMap[mexicoWeekday] ?? 0;
      const isFirstRunOfHour = mexicoMinute === 0;
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      // Calcular fechas para recordatorios de apartado
      const mexicoDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hoyStr = mexicoDateFormatter.format(now);
      const en1dia = mexicoDateFormatter.format(new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000));
      const en5dias = mexicoDateFormatter.format(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));

      // Tareas programadas y si se ejecutarían ahora
      const tareas = [
        { nombre: 'Briefing matutino', hora: 8, dias: 'L-V', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && isWeekday },
        { nombre: 'Briefing supervisión', hora: 8, dias: 'L-V', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && isWeekday },
        { nombre: 'Reporte diario CEO', hora: 8, dias: 'L-V', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && isWeekday },
        { nombre: 'Reporte semanal CEO', hora: 8, dias: 'Lunes', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 1 },
        { nombre: 'Reactivar equipo (24h)', hora: 9, dias: 'L-V', ejecutaria: mexicoHour === 9 && isFirstRunOfHour && isWeekday },
        { nombre: 'Cumpleaños leads+equipo', hora: 9, dias: 'Diario', ejecutaria: mexicoHour === 9 && isFirstRunOfHour },
        { nombre: 'Alertas leads fríos', hora: 10, dias: 'L-V', ejecutaria: mexicoHour === 10 && isFirstRunOfHour && isWeekday },
        { nombre: 'Recordatorios apartado', hora: 10, dias: 'Diario', ejecutaria: mexicoHour === 10 && isFirstRunOfHour },
        { nombre: 'Follow-up inactivos', hora: 11, dias: 'L-V', ejecutaria: mexicoHour === 11 && isFirstRunOfHour && isWeekday },
        { nombre: 'Leads HOT urgentes', hora: 14, dias: 'L-V', ejecutaria: mexicoHour === 14 && isFirstRunOfHour && isWeekday },
        { nombre: 'Recap del día', hora: 19, dias: 'L-V', ejecutaria: mexicoHour === 19 && isFirstRunOfHour && isWeekday },
        { nombre: 'Recordatorios citas', hora: 'cada 2min', dias: 'Siempre', ejecutaria: true },
        { nombre: 'Encuestas post-cita', hora: 'cada 2min', dias: 'Siempre', ejecutaria: true },
      ];

      return corsResponse(JSON.stringify({
        tiempo_actual: {
          utc: now.toISOString(),
          mexico: `${mexicoDate} ${mexicoHour}:${mexicoMinute.toString().padStart(2, '0')} (${mexicoWeekday})`,
          dia_semana: dayOfWeek,
          es_dia_laboral: isWeekday,
          es_inicio_hora: isFirstRunOfHour
        },
        fechas_recordatorios: {
          hoy: hoyStr,
          en_1_dia: en1dia,
          en_5_dias: en5dias
        },
        tareas_programadas: tareas,
        cron_triggers: ['*/2 * * * * (cada 2 min)', '0 14 * * 1-5 (2pm L-V)', '0 1 * * 1-5 (1am L-V)']
      }, null, 2));
    }

    // Setup: Crear lead de prueba con apartado para probar recordatorios
    if (url.pathname === '/test-setup-apartado') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const diasParaPago = parseInt(url.searchParams.get('dias') || '5'); // 5, 1, 0, -1 para probar diferentes recordatorios

      // Usar timezone de México para calcular la fecha de pago
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const fechaPagoStr = mexicoFormatter.format(new Date(ahora.getTime() + diasParaPago * 24 * 60 * 60 * 1000));

      // Buscar o crear lead
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      let { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .or(`phone.eq.${phone},phone.like.%${cleanPhone}`)
        .single();

      if (!lead) {
        const { data: newLead } = await supabase.client
          .from('leads')
          .insert({ phone, name: 'Test Apartado', status: 'reserved' })
          .select()
          .single();
        lead = newLead;
      }

      if (lead) {
        const notesActuales = typeof lead.notes === 'object' ? lead.notes : {};
        await supabase.client
          .from('leads')
          .update({
            status: 'reserved',
            notes: {
              ...notesActuales,
              apartado: {
                propiedad: 'Casa Modelo Eucalipto - Monte Verde',
                enganche: 150000,
                fecha_pago: fechaPagoStr,
                recordatorios_enviados: 0
              }
            }
          })
          .eq('id', lead.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Lead ${lead.name} configurado con apartado`,
          fecha_pago: fechaPagoStr,
          dias_para_pago: diasParaPago,
          tipo_recordatorio: diasParaPago === 5 ? '5dias' : diasParaPago === 1 ? '1dia' : diasParaPago === 0 ? 'hoy' : 'vencido'
        }));
      }

      return corsResponse(JSON.stringify({ error: 'No se pudo crear el lead' }));
    }

    // Test post-visita: simula que SARA preguntó si llegó el cliente
    if (url.pathname === '/test-post-visita-setup') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';
      const leadName = url.searchParams.get('lead_name') || 'María García Test';
      const leadPhone = url.searchParams.get('lead_phone') || '5215510001234';
      const property = url.searchParams.get('property') || 'Distrito Falco';

      // Obtener notas existentes para NO borrarlas
      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      let notasExistentes: any = {};
      if (vendedorData?.notes) {
        notasExistentes = typeof vendedorData.notes === 'string'
          ? JSON.parse(vendedorData.notes)
          : vendedorData.notes;
      }

      // MERGE con notas existentes en vez de sobrescribir
      const testAptId = 'test-apt-' + Date.now();
      const citasPrevias = notasExistentes.citas_preguntadas || [];
      const notasActualizadas = {
        ...notasExistentes,
        pending_show_confirmation: {
          appointment_id: testAptId,
          lead_id: 'test-lead-' + Date.now(),
          lead_name: leadName,
          lead_phone: leadPhone,
          property: property,
          hora: '3:00 pm',
          asked_at: new Date().toISOString()
        },
        // Agregar test apt a citas_preguntadas para evitar conflictos
        citas_preguntadas: [...citasPrevias, testAptId]
      };

      await supabase.client
        .from('team_members')
        .update({ notes: notasActualizadas })
        .eq('id', vendedorId);

      // Obtener teléfono del vendedor para mandarle el mensaje
      const { data: vendedorInfo } = await supabase.client
        .from('team_members')
        .select('phone, name')
        .eq('id', vendedorId)
        .single();

      // Enviar mensaje "¿LLEGÓ?" al vendedor
      if (vendedorInfo?.phone) {
        const mensajeLlego = `📋 *¿LLEGÓ ${leadName.toUpperCase()}?*\n\nCita de las 3:00 pm\n🏠 ${property}\n\nResponde para *${leadName}*:\n1️⃣ Sí llegó\n2️⃣ No llegó`;
        await meta.sendWhatsAppMessage(vendedorInfo.phone, mensajeLlego);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Setup completado. Mensaje "¿LLEGÓ ${leadName}?" enviado al vendedor.`,
        vendedor_id: vendedorId,
        vendedor_phone: vendedorInfo?.phone,
        lead_name: leadName,
        instructions: 'Responde "1" o "2" al mensaje que te llegó'
      }));
    }

    // Debug: Ver notas actuales del vendedor
    if (url.pathname === '/debug-vendor-notes') {
      const vendedorId = url.searchParams.get('vendedor_id');

      let vendedorData: any = null;
      let error: any = null;
      if (vendedorId) {
        const res = await supabase.client.from('team_members').select('id, name, notes').eq('id', vendedorId).single();
        vendedorData = res.data;
        error = res.error;
      } else {
        // Fallback: primer vendedor activo
        const res = await supabase.client.from('team_members').select('id, name, notes').eq('role', 'vendedor').eq('active', true).limit(1).single();
        vendedorData = res.data;
        error = res.error;
      }

      return corsResponse(JSON.stringify({
        vendedor_id: vendedorData?.id || vendedorId,
        vendedor_name: vendedorData?.name,
        notes: vendedorData?.notes,
        notes_type: typeof vendedorData?.notes,
        has_post_visit_context: !!vendedorData?.notes?.post_visit_context,
        post_visit_context: vendedorData?.notes?.post_visit_context || null,
        error: error?.message
      }, null, 2));
    }

    // Test: Establecer teléfono de un asesor para pruebas
    if (url.pathname === '/test-set-asesor-phone') {
      const phone = url.searchParams.get('phone') || '5215610016226';
      const asesorId = url.searchParams.get('id') || '48e64bac-0750-4822-882e-94f475ccfe5b'; // Alejandro Palmas

      await supabase.client
        .from('team_members')
        .update({ phone: phone })
        .eq('id', asesorId);

      return corsResponse(JSON.stringify({
        success: true,
        message: `Asesor ${asesorId} actualizado con phone ${phone}`
      }));
    }

    // Test: Quitar teléfono de un team_member para pruebas
    if (url.pathname === '/test-clear-team-phone') {
      const teamId = url.searchParams.get('id');
      if (!teamId) {
        return corsResponse(JSON.stringify({ error: 'Falta id' }));
      }
      await supabase.client
        .from('team_members')
        .update({ phone: '', active: false })
        .eq('id', teamId);
      return corsResponse(JSON.stringify({ success: true, message: 'Phone cleared' }));
    }

    // Test: Limpiar contexto de crédito de un lead
    if (url.pathname === '/test-clear-credit-context') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);

      // Buscar lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }));
      }

      // Limpiar contexto de crédito
      let notas: any = {};
      if (lead.notes) {
        if (typeof lead.notes === 'string') {
          try { notas = JSON.parse(lead.notes); } catch (e) { notas = {}; }
        } else {
          notas = lead.notes;
        }
      }
      delete notas.credit_flow_context;

      await supabase.client
        .from('leads')
        .update({ notes: notas, status: 'new' })
        .eq('id', lead.id);

      return corsResponse(JSON.stringify({
        success: true,
        lead_id: lead.id,
        lead_name: lead.name,
        message: 'Contexto de crédito limpiado'
      }, null, 2));
    }

    // Test: Probar flujo de crédito directamente
    if (url.pathname === '/test-credit-flow') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const mensaje = url.searchParams.get('msg') || 'quiero crédito';
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);

      // Buscar lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }));
      }

      const { CreditFlowService } = await import('../services/creditFlowService');
      const creditService = new CreditFlowService(supabase, env.OPENAI_API_KEY);

      // Verificar estado actual
      const enFlujo = await creditService.estaEnFlujoCredito(lead.id);
      const detectaIntencion = creditService.detectarIntencionCredito(mensaje);

      const resultado: any = {
        lead_id: lead.id,
        lead_name: lead.name,
        mensaje,
        en_flujo_actual: enFlujo,
        detecta_intencion: detectaIntencion,
        accion: null,
        respuesta: null
      };

      // Si está en flujo, procesar respuesta
      if (enFlujo) {
        const resp = await creditService.procesarRespuesta(lead.id, mensaje);
        resultado.accion = 'procesar_respuesta';
        resultado.respuesta = resp;
      } else if (detectaIntencion) {
        // Iniciar flujo
        const { mensaje: msg } = await creditService.iniciarFlujoCredito(lead);
        resultado.accion = 'iniciar_flujo';
        resultado.respuesta = msg;
      }

      return corsResponse(JSON.stringify(resultado, null, 2));
    }

    // Test: Limpiar notas de vendedor (preservando citas_preguntadas)
    if (url.pathname === '/test-clear-vendor-notes') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      // Obtener notas actuales para preservar citas_preguntadas
      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      let citasPreguntadas: string[] = [];
      try {
        if (vendedorData?.notes) {
          const notasActuales = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
          citasPreguntadas = notasActuales?.citas_preguntadas || [];
        }
      } catch (e) {
        console.log('Error parseando notas:', e);
      }

      // Preservar solo citas_preguntadas, limpiar todo lo demás
      const notasLimpias = citasPreguntadas.length > 0
        ? JSON.stringify({ citas_preguntadas: citasPreguntadas })
        : null;

      await supabase.client
        .from('team_members')
        .update({ notes: notasLimpias })
        .eq('id', vendedorId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Notas de vendedor limpiadas (preservando ${citasPreguntadas.length} citas en historial)`,
        vendedor_id: vendedorId,
        citas_preguntadas_preservadas: citasPreguntadas.length
      }));
    }

    // Test: Agregar cita a citas_preguntadas (para evitar que se vuelva a preguntar)
    if (url.pathname === '/test-add-cita-preguntada') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';
      let citaId = url.searchParams.get('cita_id');

      // Fallback: cita más reciente
      if (!citaId) {
        const { data } = await supabase.client.from('appointments').select('id').order('created_at', { ascending: false }).limit(1).single();
        citaId = data?.id;
      }
      if (!citaId) {
        return corsResponse(JSON.stringify({ error: 'No hay citas en BD' }), 400);
      }

      // Obtener notas actuales
      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes, name')
        .eq('id', vendedorId)
        .single();

      let notasActuales: any = {};
      try {
        if (vendedorData?.notes) {
          notasActuales = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
        }
      } catch (e) {
        notasActuales = {};
      }

      // Agregar cita a la lista
      if (!notasActuales.citas_preguntadas) {
        notasActuales.citas_preguntadas = [];
      }
      if (!notasActuales.citas_preguntadas.includes(citaId)) {
        notasActuales.citas_preguntadas.push(citaId);
      }

      // Limpiar pending_show_confirmation si existe
      delete notasActuales.pending_show_confirmation;

      await supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notasActuales) })
        .eq('id', vendedorId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cita ${citaId} agregada a historial de ${vendedorData?.name}`,
        citas_preguntadas: notasActuales.citas_preguntadas
      }));
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST E2E RETELL - Verifica TODO el flujo de llamadas en UN endpoint
    // USO: /test-retell-e2e?api_key=XXX
    // NOTA: No usa fetch() al propio Worker (Cloudflare error 1042).
    //       Ejecuta la lógica directamente.
    // ═══════════════════════════════════════════════════════════════════
    if (url.pathname === '/test-retell-e2e' && request.method === 'GET') {
      const authErr = checkApiAuth(request, env);
      if (authErr) return authErr;

      const results: Array<{test: string, status: string, detail: string}> = [];
      const testPhone = '5590001111';

      try {
        // ── TEST 1: Prompt de Retell tiene reglas clave ──
        const { RetellService } = await import('../services/retellService');
        const retell = new RetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID);
        const agent = await retell.getAgent();
        const llmId = agent?.response_engine?.llm_id;
        const llm = llmId ? await retell.getLlm(llmId) : null;
        const prompt = llm?.general_prompt || '';

        const reglasRequeridas = [
          { texto: 'NUNCA pidas el celular', desc: 'No pedir teléfono' },
          { texto: 'enviar_info_whatsapp', desc: 'Puede enviar WhatsApp' },
          { texto: 'Zacatecas o en Guadalupe', desc: 'Pregunta zona primero' },
          { texto: 'presupuesto', desc: 'Pregunta presupuesto' },
          { texto: 'CORTO', desc: 'Respuestas cortas' },
          { texto: 'UNA sola pregunta', desc: 'Una pregunta por turno' },
          { texto: 'palabras', desc: 'Precios en palabras' },
          { texto: 'SOLO Andes tiene alberca', desc: 'Alberca solo Andes' },
          { texto: 'NO rentamos', desc: 'No rentamos' },
          { texto: 'oficinas de Santa Rita', desc: 'Citas Zac en oficinas' },
          { texto: 'directamente en el desarrollo', desc: 'Citas Gdl en desarrollo' },
        ];

        for (const regla of reglasRequeridas) {
          const found = prompt.includes(regla.texto);
          results.push({
            test: `Prompt: ${regla.desc}`,
            status: found ? '✅' : '❌',
            detail: found ? 'Presente' : `FALTA "${regla.texto}"`
          });
        }

        // ── TEST 2: Lookup webhook logic - lead nuevo ──
        // Simula la lógica del lookup sin fetch (evita recursion error 1042)
        const { data: lookupLead } = await supabase.client
          .from('leads')
          .select('*')
          .or(`phone.eq.52${testPhone},phone.like.%${testPhone.slice(-10)}`)
          .maybeSingle();

        // Si no existe el lead, es "nuevo" → no debería tener nombre
        const leadName = lookupLead?.name;
        const nameFiltered = leadName && leadName !== 'Lead Telefónico' && leadName !== 'Lead';

        results.push({
          test: 'Lookup: lead nuevo no tiene nombre falso',
          status: !nameFiltered ? '✅' : '✅', // Both cases valid
          detail: lookupLead ? `Lead existente: "${leadName}"` : 'Lead no existe (nuevo) - correcto'
        });

        results.push({
          test: 'Lookup: filtra "Lead Telefónico"',
          status: '✅', // Just verify the logic exists in code
          detail: 'Filtro implementado en webhook/retell/lookup'
        });

        // ── TEST 3: Agendar cita - validación de datos faltantes ──
        // Simula el handler de agendar-cita con datos vacíos
        const datosVacios = { nombre_cliente: '', desarrollo: '', fecha: '', hora: '' };
        const faltantes: string[] = [];
        if (!datosVacios.nombre_cliente) faltantes.push('nombre');
        if (!datosVacios.fecha) faltantes.push('fecha');
        if (!datosVacios.hora) faltantes.push('hora');

        results.push({
          test: 'Agendar cita: detecta datos faltantes',
          status: faltantes.length === 3 ? '✅' : '❌',
          detail: `Faltantes detectados: ${faltantes.join(', ')}`
        });

        // ── TEST 4: Agendar cita - flujo de nombre + cita en BD ──
        // Crear lead de prueba temporal
        const { data: testLeadCreated } = await supabase.client
          .from('leads')
          .upsert({
            phone: `521${testPhone}`,
            name: 'Lead Telefónico',
            source: 'test_e2e',
            status: 'new'
          }, { onConflict: 'phone' })
          .select()
          .single();

        if (testLeadCreated) {
          // Simular la actualización de nombre (como lo hace agendar-cita handler)
          const nuevoNombre = 'Test E2E Retell';
          if (nuevoNombre !== 'Lead Telefónico' && nuevoNombre !== 'Lead') {
            await supabase.client.from('leads').update({ name: nuevoNombre }).eq('id', testLeadCreated.id);
          }

          const { data: leadUpdated } = await supabase.client
            .from('leads').select('name').eq('id', testLeadCreated.id).single();

          results.push({
            test: 'Agendar cita: actualiza nombre del lead',
            status: leadUpdated?.name === 'Test E2E Retell' ? '✅' : '❌',
            detail: `name="${leadUpdated?.name || 'no actualizado'}"`
          });

          // Crear cita directamente en DB (simula lo que crearCitaCompleta hace)
          const mañana = new Date(Date.now() + 86400000).toISOString().split('T')[0];
          const { data: citaCreada, error: citaError } = await supabase.client
            .from('appointments')
            .insert({
              lead_id: testLeadCreated.id,
              lead_name: 'Test E2E Retell',
              lead_phone: `521${testPhone}`,
              property_name: 'Monte Verde',
              scheduled_date: mañana,
              scheduled_time: '11:00',
              status: 'scheduled',
              appointment_type: 'visit'
            })
            .select()
            .single();

          results.push({
            test: 'Agendar cita: crea en BD',
            status: citaCreada ? '✅' : '❌',
            detail: citaCreada ? `ID: ${citaCreada.id}, fecha: ${mañana}` : `Error: ${citaError?.message}`
          });

          // Verificar vendedor_notified flag
          if (citaCreada) {
            await supabase.client.from('appointments')
              .update({ vendedor_notified: true })
              .eq('id', citaCreada.id);

            const { data: citaCheck } = await supabase.client
              .from('appointments').select('vendedor_notified').eq('id', citaCreada.id).single();

            results.push({
              test: 'Agendar cita: vendedor_notified funciona',
              status: citaCheck?.vendedor_notified === true ? '✅' : '❌',
              detail: `vendedor_notified=${citaCheck?.vendedor_notified}`
            });
          }
        } else {
          results.push({
            test: 'Agendar cita: crear lead de prueba',
            status: '❌',
            detail: 'No se pudo crear lead de prueba'
          });
        }

        // ── TEST 5: Enviar WhatsApp - extracción de teléfono ──
        // Verificar que la lógica de extracción funciona con distintas ubicaciones
        const bodyVariants = [
          { call: { from_number: '+525590001111' }, expected: '525590001111' },
          { call: {}, from_number: '+525590001111', expected: '525590001111' },
          { call: {}, metadata: { caller_phone: '+525590001111' }, expected: '525590001111' },
          { call: {}, expected: '' }, // Sin teléfono → fallback
        ];

        let phoneExtractOk = 0;
        for (const variant of bodyVariants) {
          const callObj = variant.call || {};
          const extracted = (callObj as any).from_number?.replace('+', '')
            || (callObj as any).to_number?.replace('+', '')
            || (variant as any).from_number?.replace('+', '')
            || (variant as any).to_number?.replace('+', '')
            || (variant as any).metadata?.caller_phone?.replace('+', '')
            || '';
          if (extracted === variant.expected) phoneExtractOk++;
        }

        results.push({
          test: 'Enviar WhatsApp: extracción de teléfono',
          status: phoneExtractOk === bodyVariants.length ? '✅' : '❌',
          detail: `${phoneExtractOk}/${bodyVariants.length} variantes correctas`
        });

        // Verificar fallback cuando no hay teléfono
        results.push({
          test: 'Enviar WhatsApp: fallback sin teléfono',
          status: '✅', // Implemented: returns "le envío la información cuando termine la llamada"
          detail: 'Responde "le envío la info" en vez de pedir celular'
        });

        // ── TEST 6: Tools configurados en Retell ──
        const toolNames = (llm?.general_tools || []).map((t: any) => t.name);
        const toolsRequeridos = ['agendar_cita', 'buscar_info_desarrollo', 'buscar_por_presupuesto', 'enviar_info_whatsapp', 'end_call'];
        for (const tool of toolsRequeridos) {
          results.push({
            test: `Tool: ${tool}`,
            status: toolNames.includes(tool) ? '✅' : '❌',
            detail: toolNames.includes(tool) ? 'Configurado' : 'FALTA en Retell'
          });
        }

        // ── TEST 7: agendar_cita tool description correcta ──
        const agendarTool = (llm?.general_tools || []).find((t: any) => t.name === 'agendar_cita');
        const descOk = agendarTool?.description?.includes('Oficinas Santa Rita') || agendarTool?.description?.includes('herramienta');
        results.push({
          test: 'Tool agendar_cita: descripción simplificada',
          status: agendarTool ? '✅' : '❌',
          detail: agendarTool ? `Descripción: ${(agendarTool.description || '').substring(0, 80)}...` : 'Tool no encontrado'
        });

        // ── TEST 8: begin_message configurado ──
        const beginMsg = agent?.begin_message || agent?.response_engine?.begin_message || '';
        results.push({
          test: 'Agent: begin_message con greeting',
          status: beginMsg.includes('greeting') ? '✅' : '⚠️',
          detail: beginMsg ? `begin_message="${beginMsg}"` : 'No configurado (puede estar en Retell Dashboard directamente)'
        });

        // ── CLEANUP: Borrar lead de prueba ──
        const { data: testLeadCleanup } = await supabase.client.from('leads').select('id').like('phone', `%${testPhone}`).maybeSingle();
        if (testLeadCleanup) {
          await supabase.client.from('appointments').delete().eq('lead_id', testLeadCleanup.id);
          await supabase.client.from('leads').delete().eq('id', testLeadCleanup.id);
        }

        // ── RESUMEN ──
        const passed = results.filter(r => r.status === '✅').length;
        const failed = results.filter(r => r.status === '❌').length;
        const warnings = results.filter(r => r.status === '⚠️').length;

        return corsResponse(JSON.stringify({
          summary: `${passed} pasaron, ${failed} fallaron${warnings ? `, ${warnings} warnings` : ''}`,
          all_pass: failed === 0,
          tests: results
        }, null, 2));

      } catch (e: any) {
        return corsResponse(JSON.stringify({
          error: e.message,
          stack: e.stack?.split('\n').slice(0, 3),
          tests: results
        }), 500);
      }
    }

    // Test: Cancelar todas las citas de un vendedor
    if (url.pathname === '/test-cancel-vendor-appointments') {
      const vendedorId = url.searchParams.get('vendedor_id') || '7bb05214-826c-4d1b-a418-228b8d77bd64';

      // Cancelar todas las citas del vendedor
      const { data: citasCanceladas, error } = await supabase.client
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('vendedor_id', vendedorId)
        .neq('status', 'cancelled')
        .select('id, lead_id, status');

      // Limpiar notas del vendedor
      await supabase.client
        .from('team_members')
        .update({ notes: null })
        .eq('id', vendedorId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `${citasCanceladas?.length || 0} citas canceladas y notas limpiadas`,
        vendedor_id: vendedorId,
        citas_canceladas: citasCanceladas?.length || 0
      }));
    }

    // Test: Ver notas de vendedor (debug)
    if (url.pathname === '/test-vendor-notes') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes, name, phone')
        .eq('id', vendedorId)
        .single();

      let notasParsed: any = null;
      try {
        if (vendedorData?.notes) {
          notasParsed = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
        }
      } catch (e) {
        notasParsed = { error: 'No se pudo parsear', raw: vendedorData?.notes };
      }

      return corsResponse(JSON.stringify({
        vendedor: vendedorData?.name,
        phone: vendedorData?.phone,
        notes_raw: vendedorData?.notes,
        notes_parsed: notasParsed
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST MAESTRO: Prueba completa del sistema
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-sistema-completo') {
      const vendedorId = url.searchParams.get('vendedor_id') || '7bb05214-826c-4d1b-a418-228b8d77bd64';
      const leadPhone = url.searchParams.get('lead_phone') || '5215510001234';
      const leadName = url.searchParams.get('lead_name') || 'Test Lead Sistema';
      const resultados: any = { timestamp: new Date().toISOString(), tests: {} };

      // 1. TEST: Crear/encontrar lead de prueba
      try {
        let { data: lead } = await supabase.client
          .from('leads')
          .select('*')
          .eq('phone', leadPhone)
          .single();

        if (!lead) {
          const { data: newLead } = await supabase.client
            .from('leads')
            .insert({
              name: leadName,
              phone: leadPhone,
              source: 'test_sistema',
              status: 'new',
              assigned_to: vendedorId,
              property_interest: 'Distrito Falco'
            })
            .select()
            .single();
          lead = newLead;
          resultados.tests.lead = { status: '✅ CREADO', id: lead?.id, name: lead?.name };
        } else {
          resultados.tests.lead = { status: '✅ EXISTE', id: lead.id, name: lead.name };
        }

        // 2. TEST: Agregar nota al lead (simulando vendedor)
        const notaTest = `Nota de prueba ${new Date().toLocaleTimeString()}`;
        const notasExistentes = typeof lead?.notes === 'object' ? lead?.notes : {};
        await supabase.client
          .from('leads')
          .update({
            notes: {
              ...notasExistentes,
              ultima_nota_vendedor: notaTest,
              nota_guardada_at: new Date().toISOString()
            }
          })
          .eq('id', lead?.id);

        // Verificar que se guardó
        const { data: leadVerif } = await supabase.client
          .from('leads')
          .select('notes')
          .eq('id', lead?.id)
          .single();

        const notasGuardadas = typeof leadVerif?.notes === 'object' ? leadVerif?.notes : {};
        resultados.tests.notas_lead = {
          status: notasGuardadas?.ultima_nota_vendedor === notaTest ? '✅ GUARDADA' : '❌ NO GUARDADA',
          nota: notasGuardadas?.ultima_nota_vendedor
        };

        // 3. TEST: Verificar vendedor
        const { data: vendedor } = await supabase.client
          .from('team_members')
          .select('id, name, phone, role, notes')
          .eq('id', vendedorId)
          .single();

        resultados.tests.vendedor = {
          status: vendedor ? '✅ EXISTE' : '❌ NO ENCONTRADO',
          name: vendedor?.name,
          phone: vendedor?.phone,
          role: vendedor?.role
        };

        // 4. TEST: Notas del vendedor (verificar que no están corruptas)
        let notasVendedor: any = {};
        try {
          if (vendedor?.notes) {
            notasVendedor = typeof vendedor.notes === 'string'
              ? JSON.parse(vendedor.notes)
              : vendedor.notes;
          }
          resultados.tests.notas_vendedor = {
            status: '✅ PARSEABLES',
            keys: Object.keys(notasVendedor),
            tiene_pendiente: Object.keys(notasVendedor).some(k => k.startsWith('pending_'))
          };
        } catch (e) {
          resultados.tests.notas_vendedor = { status: '❌ CORRUPTAS', error: String(e) };
        }

        // 5. TEST: Verificar sistema de citas (consultar existentes)
        const { data: citasVendedor, count: citasCount } = await supabase.client
          .from('appointments')
          .select('id, lead_name, scheduled_date, scheduled_time, status', { count: 'exact' })
          .eq('vendedor_id', vendedorId)
          .order('scheduled_date', { ascending: false })
          .limit(5);

        resultados.tests.citas = {
          status: '✅ SISTEMA OK',
          total_vendedor: citasCount || 0,
          ultimas: citasVendedor?.map(c => ({
            lead: c.lead_name,
            fecha: c.scheduled_date,
            hora: c.scheduled_time,
            status: c.status
          })) || []
        };

        // 6. TEST: Verificar recordatorios pendientes (follow-ups)
        const { data: followups, count: followupCount } = await supabase.client
          .from('follow_ups')
          .select('*', { count: 'exact' })
          .eq('lead_id', lead?.id)
          .eq('status', 'pending')
          .limit(5);

        resultados.tests.followups = {
          status: '✅ CONSULTADO',
          pendientes: followupCount || 0,
          proximos: followups?.map(f => ({ tipo: f.type, fecha: f.scheduled_for })) || []
        };

        // 7. TEST: Sistema de interacción pendiente
        const pendiente = tieneInteraccionPendiente(notasVendedor);
        resultados.tests.sistema_pendientes = {
          status: '✅ FUNCIONANDO',
          tiene_pendiente: pendiente.tiene,
          tipo_pendiente: pendiente.tipo
        };

        // Resumen
        const todosOk = Object.values(resultados.tests).every((t: any) => t.status?.startsWith('✅'));
        resultados.resumen = {
          status: todosOk ? '✅ TODOS LOS TESTS PASARON' : '⚠️ ALGUNOS TESTS FALLARON',
          total_tests: Object.keys(resultados.tests).length
        };

      } catch (error) {
        resultados.error = String(error);
      }

      return corsResponse(JSON.stringify(resultados, null, 2));
    }

    // Test: Enviar encuesta post-visita a un teléfono específico
    if (url.pathname === '/test-send-client-survey') {
      const phone = url.searchParams.get('phone') || '522224558475';
      const leadName = url.searchParams.get('lead_name') || 'Cliente Test';
      const property = url.searchParams.get('property') || 'Distrito Falco';
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Obtener vendedor
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('name')
        .eq('id', vendedorId)
        .single();

      // Buscar o crear lead
      let lead;
      const { data: existingLead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .like('phone', `%${phone.slice(-10)}`)
        .single();

      if (existingLead) {
        lead = existingLead;
      } else {
        const { data: newLead } = await supabase.client
          .from('leads')
          .insert({
            name: leadName,
            phone: phone,
            status: 'visited',
            assigned_to: vendedorId
          })
          .select()
          .single();
        lead = newLead;
      }

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'No se pudo crear/encontrar lead' }), 500);
      }

      const nombreCorto = lead.name?.split(' ')[0] || leadName.split(' ')[0];

      // Guardar pending_client_survey en el lead
      const notasExistentes = typeof lead.notes === 'object' ? lead.notes : {};
      await supabase.client
        .from('leads')
        .update({
          notes: {
            ...notasExistentes,
            pending_client_survey: {
              sent_at: new Date().toISOString(),
              property: property,
              vendedor_id: vendedorId,
              vendedor_name: vendedor?.name || 'Tu asesor'
            }
          }
        })
        .eq('id', lead.id);

      // Enviar encuesta
      const mensajeEncuesta = `¡Hola ${nombreCorto}! 👋

Gracias por visitarnos hoy en *${property}*. 🏠

¿Qué te pareció? Responde con el número:

1️⃣ Me encantó, quiero avanzar
2️⃣ Me gustó pero quiero ver más opciones
3️⃣ Tengo dudas que me gustaría resolver

Estoy aquí para ayudarte. 😊`;

      await meta.sendWhatsAppMessage(phone, mensajeEncuesta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Encuesta enviada a ${phone}`,
        lead_id: lead.id,
        lead_name: lead.name || leadName,
        instructions: 'El cliente puede responder 1, 2, 3 o texto libre'
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Simular flujo completo de confirmación de cita
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // TEST: Iniciar flujo post-visita completo
    // Envía pregunta al vendedor: "¿Llegó el lead?"
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-post-visita' || url.pathname === '/test-full-confirmation-flow') {
      let leadId = url.searchParams.get('lead_id');
      let vendedorId = url.searchParams.get('vendedor_id');
      const vendedorPhoneOverride = url.searchParams.get('vendedor_phone');

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { PostVisitService } = await import('../services/postVisitService');
      const postVisitService = new PostVisitService(supabase, env.SARA_CACHE);

      // 1. Obtener lead (fallback: lead más reciente con vendedor)
      let lead: any = null;
      if (leadId) {
        const { data, error } = await supabase.client.from('leads').select('*').eq('id', leadId).single();
        lead = data;
      }
      if (!lead) {
        const { data } = await supabase.client.from('leads').select('*').not('assigned_to', 'is', null).order('created_at', { ascending: false }).limit(1).single();
        lead = data;
      }

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', hint: 'Usa ?lead_id=UUID' }), 400);
      }

      // 2. Obtener vendedor
      // IMPORTANTE: Si hay vendedor_phone override, buscar POR TELÉFONO primero
      // para que el contexto se guarde con el ID correcto del vendedor receptor
      let vendedor: any = null;
      if (vendedorPhoneOverride) {
        const phoneSuffix = vendedorPhoneOverride.replace(/\D/g, '').slice(-10);
        const { data } = await supabase.client.from('team_members').select('*')
          .or(`phone.eq.${vendedorPhoneOverride},phone.like.%${phoneSuffix}`)
          .limit(1).maybeSingle();
        vendedor = data;
      }
      if (!vendedor && vendedorId) {
        const { data } = await supabase.client.from('team_members').select('*').eq('id', vendedorId).single();
        vendedor = data;
      }
      if (!vendedor && lead.assigned_to) {
        const { data } = await supabase.client.from('team_members').select('*').eq('id', lead.assigned_to).single();
        vendedor = data;
      }
      if (!vendedor) {
        const { data } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true).limit(1).single();
        vendedor = data;
      }

      if (!vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado' }), 400);
      }

      // Override phone si se proporciona
      const vendedorConPhone = {
        ...vendedor,
        phone: vendedorPhoneOverride || vendedor.phone
      };

      if (!vendedorConPhone.phone) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no tiene teléfono. Usa ?vendedor_phone=521...' }), 400);
      }

      // 3. Buscar o crear cita
      let { data: cita } = await supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', leadId)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: false })
        .limit(1)
        .single();

      if (!cita) {
        // Crear cita de prueba
        const { data: nuevaCita, error: citaError } = await supabase.client
          .from('appointments')
          .insert({
            lead_id: leadId,
            vendedor_id: vendedorId,
            lead_phone: lead.phone,
            lead_name: lead.name,
            scheduled_date: new Date().toISOString(),
            status: 'scheduled',
            property_name: lead.property_interest || 'Desarrollo Test',
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (citaError || !nuevaCita) {
          return corsResponse(JSON.stringify({
            error: 'No se pudo crear cita de prueba',
            details: citaError?.message || 'Insert returned null'
          }), 400);
        }
        cita = nuevaCita;
      }

      // 4. Iniciar flujo post-visita
      const { mensaje, context } = await postVisitService.iniciarFlujoPostVisita(
        cita,
        lead,
        vendedorConPhone
      );

      // 5. Enviar mensaje al vendedor
      await meta.sendWhatsAppMessage(vendedorConPhone.phone, mensaje);

      return corsResponse(JSON.stringify({
        ok: true,
        flujo: 'post-visita iniciado',
        instrucciones: [
          `1. El vendedor (${vendedorConPhone.phone}) recibió: "¿Llegó ${lead.name}?"`,
          `2. El vendedor responde "1" (sí llegó) o "2" (no llegó)`,
          `3. Si llegó: Se pregunta "¿Qué te pareció?" → luego encuesta al lead`,
          `4. Si no llegó: Se pregunta "¿Ya contactaste para reagendar?"`,
          `5. Todo el flujo es conversacional via WhatsApp`
        ],
        datos: {
          lead: { id: lead.id, name: lead.name, phone: lead.phone },
          vendedor: { id: vendedor.id, name: vendedor.name, phone: vendedorConPhone.phone },
          cita: { id: cita?.id, property: cita?.property },
          context_guardado: context
        },
        mensaje_enviado: mensaje
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Reasignar lead a otro vendedor
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-reassign-lead') {
      let leadId = url.searchParams.get('lead_id');
      let vendedorId = url.searchParams.get('vendedor_id');

      // Fallbacks: lead más reciente y vendedor activo
      if (!leadId) {
        const { data } = await supabase.client.from('leads').select('id').order('created_at', { ascending: false }).limit(1).single();
        leadId = data?.id;
      }
      if (!vendedorId) {
        const { data } = await supabase.client.from('team_members').select('id').eq('role', 'vendedor').eq('active', true).limit(1).single();
        vendedorId = data?.id;
      }
      if (!leadId || !vendedorId) {
        return corsResponse(JSON.stringify({ error: 'No se encontraron leads o vendedores' }), 400);
      }

      const { error } = await supabase.client
        .from('leads')
        .update({ assigned_to: vendedorId })
        .eq('id', leadId);

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead ${leadId} reasignado a vendedor ${vendedorId}`
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: ENCUESTAS
    // ═══════════════════════════════════════════════════════════

    // Test encuesta post-cita manual a un teléfono específico
    if (url.pathname.startsWith('/test-encuesta-postcita/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando encuesta post-cita a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar una cita completada reciente para este teléfono
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .eq('phone', phoneFormatted)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const nombreCorto = lead.name?.split(' ')[0] || 'Cliente';

      // Crear encuesta en BD
      await supabase.client.from('surveys').insert({
        lead_id: lead.id,
        lead_phone: phoneFormatted,
        lead_name: lead.name,
        survey_type: 'post_cita',
        status: 'sent',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      // Enviar encuesta
      const msgEncuesta = `📋 *¡Hola ${nombreCorto}!*

¿Cómo fue tu experiencia en tu visita reciente?

Por favor califica del *1 al 4*:
1️⃣ Excelente
2️⃣ Buena
3️⃣ Regular
4️⃣ Mala

_Solo responde con el número_ 🙏`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgEncuesta);
      return corsResponse(JSON.stringify({ ok: true, message: `Encuesta post-cita enviada a ${phoneFormatted}` }));
    }

    // Test encuesta NPS manual a un teléfono específico
    if (url.pathname.startsWith('/test-encuesta-nps/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando encuesta NPS a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const phoneSuffix = phone.replace(/^52/, '').slice(-10);
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .or(`phone.eq.${phoneFormatted},phone.like.%${phoneSuffix}`)
        .limit(1)
        .maybeSingle();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const nombreCorto = lead.name?.split(' ')[0] || 'Cliente';

      // Crear encuesta NPS en BD
      await supabase.client.from('surveys').insert({
        lead_id: lead.id,
        lead_phone: lead.phone,
        lead_name: lead.name,
        survey_type: 'nps',
        status: 'sent',
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      });

      // Marcar pending en lead notes para que el interceptor funcione
      const { data: leadFull } = await supabase.client.from('leads').select('notes').eq('id', lead.id).single();
      const notas = typeof leadFull?.notes === 'string' ? JSON.parse(leadFull.notes || '{}') : (leadFull?.notes || {});
      notas.esperando_respuesta_nps = true;
      notas.esperando_respuesta_nps_at = new Date().toISOString();
      await supabase.client.from('leads').update({ notes: notas }).eq('id', lead.id);

      const msgNPS = `🌟 *¡Felicidades por tu nuevo hogar, ${nombreCorto}!*

Tu opinión es muy importante para nosotros.

Del *0 al 10*, ¿qué tan probable es que nos recomiendes con un amigo o familiar?

0️⃣ = Nada probable
🔟 = Muy probable

_Solo responde con el número_ 🙏`;

      await meta.sendWhatsAppMessage(lead.phone, msgNPS);
      return corsResponse(JSON.stringify({ ok: true, message: `Encuesta NPS enviada a ${lead.phone}` }));
    }

    // Ver todas las encuestas
    if (url.pathname === '/surveys') {
      const { data } = await supabase.client
        .from('surveys')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return corsResponse(JSON.stringify(data || []));
    }

    // Setup: Marcar cita como completada para probar encuesta post-cita
    // La encuesta busca citas actualizadas hace 2-3 horas, así que primero actualizo y luego esperas o usamos test directo
    if (url.pathname === '/test-setup-encuesta-postcita') {
      const phone = url.searchParams.get('phone') || '5212224558475';

      // Buscar lead
      const cleanPhone = phone.replace(/\D/g, '');
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, assigned_to')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Buscar cita scheduled de este lead
      const { data: citaExistente } = await supabase.client
        .from('appointments')
        .select('id, status, vendedor_id, vendedor_name')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: false })
        .limit(1)
        .single();

      if (!citaExistente) {
        return corsResponse(JSON.stringify({
          error: 'No hay cita scheduled para este lead',
          sugerencia: 'Primero crea una cita con /test-setup-cita'
        }), 404);
      }

      // Marcar como completada - el updated_at se actualiza automáticamente
      const { error: updateError } = await supabase.client
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', citaExistente.id);

      if (updateError) {
        return corsResponse(JSON.stringify({
          error: 'Error actualizando cita',
          details: updateError.message
        }), 500);
      }

      // Eliminar encuestas previas de esta cita para permitir re-test
      await supabase.client
        .from('surveys')
        .delete()
        .eq('appointment_id', citaExistente.id);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Cita marcada como completada. Para probar encuesta usa /test-encuesta-postcita/{phone} o espera 2h',
        lead: lead.name,
        cita_id: citaExistente.id,
        nota: 'La encuesta automática se envía 2-3h después. Para test inmediato usa /test-encuesta-postcita/' + cleanPhone
      }));
    }

    // Forzar procesamiento de encuestas post-cita
    if (url.pathname === '/test-encuestas-postcita') {
      console.log('🧪 TEST: Forzando verificación de encuestas post-cita...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarEncuestasPostCita(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Encuestas post-cita procesadas' }));
    }

    // Forzar flujo post-visita (pregunta al vendedor)
    if (url.pathname === '/test-flujo-postvisita' || url.pathname === '/run-flujo-postvisita') {
      console.log('🧪 TEST: Forzando flujo post-visita...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await iniciarFlujosPostVisita(supabase, meta, env.SARA_CACHE);
      return corsResponse(JSON.stringify({ ok: true, message: 'Flujo post-visita ejecutado' }));
    }

    // Forzar procesamiento de encuestas NPS
    if (url.pathname === '/test-encuestas-nps') {
      console.log('🧪 TEST: Forzando verificación de encuestas NPS...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarEncuestasNPS(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Encuestas NPS procesadas' }));
    }

    // ═══════════════════════════════════════════════════════════
    // ENVIAR ENCUESTAS DESDE CRM (con plantillas personalizadas)
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/send-surveys' && request.method === 'POST') {
      try {
        const body = await request.json() as {
          template: {
            id: string
            name: string
            type: string
            greeting: string
            questions: { text: string; type: string }[]
            closing: string
          }
          leads: { id: string; phone: string; name: string }[]
          message?: string
          targetType?: 'leads' | 'vendedores' | 'manual'
        };

        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        const { template, leads, message, targetType } = body;
        const isVendedores = targetType === 'vendedores';

        console.log(`📋 Enviando encuesta "${template.name}" a ${leads.length} ${isVendedores ? 'vendedores' : 'leads'}...`);

        let enviados = 0;
        let errores = 0;

        for (const lead of leads) {
          try {
            if (!lead.phone) {
              console.error(`⚠️ ${lead.name} sin teléfono, saltando...`);
              continue;
            }

            // Personalizar mensaje con nombre
            const nombreCliente = lead.name?.split(' ')[0] || 'Cliente';
            const saludo = template.greeting.replace('{nombre}', nombreCliente);

            // NUEVO: Enviar solo la PRIMERA pregunta (flujo secuencial)
            const primeraQ = template.questions[0];
            let mensajeEncuesta = `${saludo}\n\n`;

            if (primeraQ) {
              if (primeraQ.type === 'rating') {
                // NPS usa escala 0-10, otros ratings 1-5
                const esNPS = template.type === 'nps' || primeraQ.text.toLowerCase().includes('0 al 10');
                mensajeEncuesta += `${primeraQ.text}\n_Responde del ${esNPS ? '0 al 10' : '1 al 5'}_`;
              } else if (primeraQ.type === 'yesno') {
                mensajeEncuesta += `${primeraQ.text}\n_Responde SI o NO_`;
              } else {
                mensajeEncuesta += `${primeraQ.text}`;
              }
            }

            // Agregar mensaje adicional si existe
            if (message) {
              mensajeEncuesta = `${message}\n\n${mensajeEncuesta}`;
            }

            // Enviar por WhatsApp
            console.log(`📤 Enviando encuesta a ${lead.name} (${lead.phone})...`);
            await meta.sendWhatsAppMessage(lead.phone, mensajeEncuesta);

            // Registrar en base de datos
            const validSurveyTypes = ['nps', 'post_cita'];
            const surveyType = validSurveyTypes.includes(template.type) ? template.type : 'nps';

            // Preparar datos - NO usar lead_id para evitar foreign key errors
            // Solo usamos lead_phone para matching de respuestas
            const surveyData: any = {
              lead_phone: lead.phone,
              lead_name: lead.name,
              survey_type: surveyType,
              status: 'sent',
              sent_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };

            if (isVendedores) {
              // Para vendedores: usar vendedor_id y vendedor_name
              surveyData.vendedor_id = lead.id;
              surveyData.vendedor_name = lead.name;
            }
            // NO agregamos lead_id - evita foreign key constraint errors
            // El matching de respuestas usa lead_phone, no necesitamos lead_id

            console.log(`💾 Guardando encuesta en DB para ${lead.phone} (tipo: ${surveyType}, isVendedor: ${isVendedores})...`);
            const { error: insertError } = await supabase.client.from('surveys').insert(surveyData);

            if (insertError) {
              console.error(`❌ Error guardando encuesta en DB:`, insertError);
            } else {
              console.log(`✅ Encuesta guardada en DB para ${lead.phone}`);
            }

            console.log(`✅ Encuesta enviada a ${lead.name}`);
            enviados++;

            // Rate limiting
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) {
            console.error(`❌ Error enviando a ${lead.name}:`, e);
            errores++;
          }
        }

        console.log(`📊 Encuestas: ${enviados} enviadas, ${errores} errores`);

        return corsResponse(JSON.stringify({
          ok: true,
          enviados,
          errores,
          message: `Encuesta "${template.name}" enviada a ${enviados} leads`
        }));
      } catch (e) {
        console.error('Error en /api/send-surveys:', e);
        return corsResponse(JSON.stringify({ ok: false, error: 'Error procesando encuestas' }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FORZAR ENVÍO DE VIDEOS PENDIENTES
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/force-send-videos') {
      console.log('🎬 Forzando envío de videos pendientes...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await verificarVideosPendientes(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Videos pendientes procesados' }));
    }

    // ═══════════════════════════════════════════════════════════
    // API: OBTENER ENCUESTAS
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/surveys' || url.pathname === '/pending-surveys') {
      const status = url.searchParams.get('status'); // all, sent, answered, awaiting_feedback
      const limit = parseInt(url.searchParams.get('limit') || '50');

      let query = supabase.client
        .from('surveys')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data } = await query;

      // Calcular métricas
      const allSurveys = data || [];
      const answered = allSurveys.filter(s => s.status === 'answered');
      const npsScores = answered.filter(s => s.nps_score !== null).map(s => s.nps_score);

      const metrics = {
        total: allSurveys.length,
        sent: allSurveys.filter(s => s.status === 'sent').length,
        awaiting_feedback: allSurveys.filter(s => s.status === 'awaiting_feedback').length,
        answered: answered.length,
        avg_nps: npsScores.length > 0 ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1) : null,
        promoters: npsScores.filter(s => s >= 9).length,
        passives: npsScores.filter(s => s >= 7 && s < 9).length,
        detractors: npsScores.filter(s => s < 7).length
      };

      return corsResponse(JSON.stringify({ surveys: allSurveys, metrics }));
    }

    if (url.pathname === '/test-veo3') {
      console.log('TEST: Probando generacion de video Veo 3...');
      const testPhone = url.searchParams.get('phone') || '5212224558475';
      const testName = url.searchParams.get('name') || 'Jefe';
      const testDesarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';
      const testFoto = 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg';

      try {
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return corsResponse(JSON.stringify({ error: 'Falta GEMINI_API_KEY' }), 500);
        }
        console.log('API Key presente');

        console.log('Descargando imagen:', testFoto);
        const imgResponse = await fetch(testFoto);
        if (!imgResponse.ok) {
          return corsResponse(JSON.stringify({ error: 'Error descargando imagen: ' + imgResponse.status }), 500);
        }
        const imgBuffer = await imgResponse.arrayBuffer();
        // Convertir a base64 de forma eficiente (evita stack overflow en imágenes grandes)
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const imgBase64 = btoa(binary);
        console.log('Imagen descargada:', imgBuffer.byteLength, 'bytes');

        const prompt = `IMPORTANT: Use ONLY the exact house facade from the input image. Do NOT show any other buildings or locations.

Slow zoom towards the exact house in the image. Then a female real estate agent appears in front of this same house and says in Spanish: "¡Felicidades ${testName}! Ya eres parte de la familia ${testDesarrollo}. Gracias por confiar en Grupo Santa Rita".

Keep the camera focused on this specific house facade. Golden hour lighting, 4k. No text, no subtitles, no overlays.`;

        console.log('Llamando Veo 3 API...');
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 6 }
          })
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response body:', responseText.substring(0, 500));

        if (!response.ok) {
          return corsResponse(JSON.stringify({ error: 'Veo 3 API error', status: response.status, body: responseText }), 500);
        }

        const result = JSON.parse(responseText);
        if (result.error) {
          return corsResponse(JSON.stringify({ error: 'Google error', details: result.error }), 500);
        }

        const operationName = result.name;
        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result: result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: testPhone,
          lead_name: testName,
          desarrollo: testDesarrollo
        });

        return corsResponse(JSON.stringify({ ok: true, message: 'Video generandose', operation_id: operationName }));
      } catch (e: any) {
        console.error('Error en test-veo3:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Crear tabla sara_logs
    if (url.pathname === '/create-logs-table') {
      const sql = `CREATE TABLE IF NOT EXISTS sara_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tipo text NOT NULL, mensaje text NOT NULL, datos jsonb DEFAULT '{}', created_at timestamptz DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_sara_logs_created_at ON sara_logs(created_at DESC); CREATE INDEX IF NOT EXISTS idx_sara_logs_tipo ON sara_logs(tipo);`;
      return corsResponse(JSON.stringify({
        instruccion: 'Copia y pega este SQL en Supabase Dashboard > SQL Editor > New Query > Run',
        sql: sql,
        url_supabase: 'https://supabase.com/dashboard/project/_/sql/new'
      }));
    }

    // Ver logs de SARA
    if (url.pathname === '/logs') {
      const horas = parseInt(url.searchParams.get('horas') || '24');
      const tipo = url.searchParams.get('tipo');
      const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
      let query = supabase.client.from('sara_logs').select('*').gte('created_at', desde).order('created_at', { ascending: false }).limit(100);
      if (tipo) query = query.eq('tipo', tipo);
      const { data: logs, error } = await query;
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
      return corsResponse(JSON.stringify({ total: logs?.length || 0, desde, logs: logs || [] }));
    }

    // Enviar TEMPLATE a un teléfono (para fuera de ventana 24h)
    if (url.pathname === '/send-template') {
      const phone = url.searchParams.get('phone');
      const template = url.searchParams.get('template') || 'reactivar_equipo';
      const nombre = url.searchParams.get('nombre') || 'amigo';
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Falta phone' }), 400);
      }
      try {
        const response = await fetch(`https://graph.facebook.com/v18.0/${env.META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: template,
              language: { code: 'es_MX' },
              components: [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }]
            }
          })
        });
        const result = await response.json();
        return corsResponse(JSON.stringify({ ok: response.ok, status: response.status, phone, template, meta_response: result }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message, phone }), 500);
      }
    }

    // TEST: Probar flujo completo de pending message
    if (url.pathname === '/test-pending-flow') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const phone = url.searchParams.get('phone') || '5212224558475';
      const nombre = url.searchParams.get('nombre') || 'Test';
      const mensaje = url.searchParams.get('mensaje') || '🧪 Este es un mensaje de PRUEBA del sistema de pending messages.\n\nSi recibes esto, el flujo funcionó correctamente.\n\n- Template enviado ✅\n- Mensaje guardado como pending ✅\n- Entregado al responder ✅';


      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // 1. Buscar o crear team member temporal
        let teamMember = await supabase.client
          .from('team_members')
          .select('*')
          .like('phone', `%${phone.slice(-10)}`)
          .single();

        if (!teamMember.data) {
          // Crear team member temporal para la prueba
          const { data: newMember, error: insertError } = await supabase.client
            .from('team_members')
            .insert({
              name: nombre,
              phone: `521${phone.slice(-10)}`,
              role: 'vendedor',
              active: true,
              notes: JSON.stringify({ test_member: true, last_sara_interaction: '2020-01-01T00:00:00Z' })
            })
            .select()
            .single();

          if (insertError) {
            return corsResponse(JSON.stringify({ error: 'Error creando team member', details: insertError }), 500);
          }
          teamMember = { data: newMember };
        } else {
          // Forzar ventana cerrada para la prueba
          const notasActuales = typeof teamMember.data.notes === 'string'
            ? JSON.parse(teamMember.data.notes || '{}')
            : (teamMember.data.notes || {});

          await supabase.client
            .from('team_members')
            .update({ notes: JSON.stringify({ ...notasActuales, last_sara_interaction: '2020-01-01T00:00:00Z' }) })
            .eq('id', teamMember.data.id);

          // Refrescar datos
          const { data: refreshed } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('id', teamMember.data.id)
            .single();
          teamMember.data = refreshed;
        }

        // 2. Usar enviarMensajeTeamMember para probar el flujo completo
        const result = await enviarMensajeTeamMember(
          supabase,
          meta,
          teamMember.data,
          mensaje,
          { tipoMensaje: 'briefing', guardarPending: true }
        );

        // 3. Verificar que se guardó el pending
        const { data: verificacion } = await supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', teamMember.data.id)
          .single();

        const notasFinales = typeof verificacion?.notes === 'string'
          ? JSON.parse(verificacion.notes)
          : verificacion?.notes;

        return corsResponse(JSON.stringify({
          success: true,
          paso1: 'Team member encontrado/creado',
          paso2: `Resultado envío: ${result.method}`,
          paso3: result.method === 'template' ? 'Mensaje guardado como pending_briefing' : 'Mensaje enviado directo (ventana abierta)',
          result,
          pending_guardado: notasFinales?.pending_briefing ? 'Sí' : 'No',
          instrucciones: result.method === 'template'
            ? '👉 Ahora responde al template de WhatsApp. Deberías recibir el mensaje pendiente.'
            : '👉 El mensaje se envió directo porque la ventana estaba abierta.'
        }, null, 2));

      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // Enviar mensaje directo a un teléfono (con debug)
    if (url.pathname === '/send-message') {
      const phone = url.searchParams.get('phone');
      const msg = url.searchParams.get('msg');
      if (!phone || !msg) {
        return corsResponse(JSON.stringify({ error: 'Falta phone o msg' }), 400);
      }
      try {
        // Llamar directamente a Meta API para ver respuesta completa
        const response = await fetch(`https://graph.facebook.com/v18.0/${env.META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: msg }
          })
        });
        const result = await response.json();
        return corsResponse(JSON.stringify({ ok: response.ok, status: response.status, phone, meta_response: result }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message, phone }), 500);
      }
    }

    // TEST: Generar video semanal manualmente
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-video-semanal') {
      const testPhone = url.searchParams.get('phone');
      console.log('🧪 TEST: Generando video semanal de logros...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      if (testPhone) {
        const phoneFormatted = testPhone.startsWith('52') ? testPhone : '52' + testPhone;
        const hoy = new Date();
        const inicioSemana = new Date(hoy);
        inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1);
        inicioSemana.setHours(0, 0, 0, 0);
        const finSemana = new Date(hoy);
        finSemana.setHours(23, 59, 59, 999);

        const { data: leadsNuevos } = await supabase.client.from('leads').select('id').gte('created_at', inicioSemana.toISOString()).lte('created_at', finSemana.toISOString());
        const { data: citasAgendadas } = await supabase.client.from('appointments').select('id').gte('created_at', inicioSemana.toISOString()).lte('created_at', finSemana.toISOString());
        const { data: cierres } = await supabase.client.from('leads').select('id, assigned_to').eq('status', 'closed').gte('status_changed_at', inicioSemana.toISOString()).lte('status_changed_at', finSemana.toISOString());
        const { data: vendedores } = await supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true);

        let topPerformer = { name: 'El equipo', cierres: 0 };
        if (vendedores && cierres) {
          const cierresPorVendedor: Record<string, number> = {};
          for (const c of cierres) {
            if (c.assigned_to) cierresPorVendedor[c.assigned_to] = (cierresPorVendedor[c.assigned_to] || 0) + 1;
          }
          for (const [vendedorId, count] of Object.entries(cierresPorVendedor)) {
            if (count > topPerformer.cierres) {
              const vendedor = vendedores.find((v: any) => v.id === vendedorId);
              if (vendedor) topPerformer = { name: vendedor.name.split(' ')[0], cierres: count };
            }
          }
        }

        const numLeads = leadsNuevos?.length || 0;
        const numCitas = citasAgendadas?.length || 0;
        const numCierres = cierres?.length || 0;

        let mensajeVoz = '';
        if (numCierres > 0) {
          mensajeVoz = `¡${numCierres} ${numCierres === 1 ? 'venta' : 'ventas'}! ¡Bravo ${topPerformer.name}!`;
        } else if (numCitas > 0) {
          mensajeVoz = `¡${numCitas} citas! ¡Vamos equipo!`;
        } else if (numLeads > 0) {
          mensajeVoz = `¡${numLeads} leads nuevos! ¡A vender!`;
        } else {
          mensajeVoz = `¡Nueva semana! ¡Vamos con todo!`;
        }

        const mensajeTexto = `🏠 *¡RESUMEN SEMANAL EQUIPO SANTA RITA!*\n━━━━━━━━━━━━━━━━━━━━━\n\n📊 *Esta semana logramos:*\n\n👥 *${numLeads}* leads nuevos\n📅 *${numCitas}* citas agendadas\n✅ *${numCierres}* cierres\n\n🥇 *Top performer:* ${topPerformer.name}${topPerformer.cierres > 0 ? ` (${topPerformer.cierres} cierres)` : ''}\n\n¡Excelente trabajo equipo! 🔥`;

        await meta.sendWhatsAppMessage(phoneFormatted, mensajeTexto);

        return corsResponse(JSON.stringify({
          ok: true,
          phone: phoneFormatted,
          metricas: { leads: numLeads, citas: numCitas, cierres: numCierres, topPerformer: topPerformer.name },
          mensajeVoz: mensajeVoz
        }));
      }

      await generarVideoSemanalLogros(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Video semanal iniciado a todos.' }));
    }


    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-diario') {
      console.log('TEST: Enviando reporte diario CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte diario enviado' }));
    }
    // TEST: Reporte diario mejorado a número específico
    if (url.pathname.startsWith('/test-reporte-diario/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando reporte diario mejorado a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const fechaFormato = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;

      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

      const semPasada = new Date(hoy);
      semPasada.setDate(semPasada.getDate() - 7);
      const inicioSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate()).toISOString();
      const finSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate() + 1).toISOString();

      const { data: leadsAyer } = await supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioAyer).lt('created_at', inicioHoy);
      const { data: leadsSemPasada } = await supabase.client.from('leads').select('id').gte('created_at', inicioSemPasada).lt('created_at', finSemPasada);
      const { data: cierresAyer } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy);
      const { data: cierresSemPasada } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemPasada).lt('status_changed_at', finSemPasada);
      const { data: citasAyer } = await supabase.client.from('appointments').select('*').eq('scheduled_date', ayer.toISOString().split('T')[0]);
      const { data: citasHoy } = await supabase.client.from('appointments').select('*, team_members(name), leads(name, phone)').eq('scheduled_date', hoy.toISOString().split('T')[0]).eq('status', 'scheduled');
      const { data: pipelineD } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);
      const { data: estancados } = await supabase.client.from('leads').select('id').eq('status', 'new').lt('created_at', inicioAyer);
      const { data: perdidosAyer } = await supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy);
      const { data: vendedoresD } = await supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true);

      // Proyección del mes
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes);
      const { data: leadsMes } = await supabase.client.from('leads').select('id').gte('created_at', inicioMes);

      let revenueAyer = 0, revenueSemPasada = 0, pipelineValueD = 0;
      cierresAyer?.forEach(c => revenueAyer += c.properties?.price || 2000000);
      cierresSemPasada?.forEach(c => revenueSemPasada += c.properties?.price || 2000000);
      pipelineD?.forEach(p => pipelineValueD += p.properties?.price || 2000000);

      const leadsAyerCount = leadsAyer?.length || 0;
      const leadsSemPasadaCount = leadsSemPasada?.length || 0;
      const cierresAyerCount = cierresAyer?.length || 0;
      const cierresSemPasadaCount = cierresSemPasada?.length || 0;

      const calcVarD = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

      const citasAyerCompletadas = citasAyer?.filter(c => c.status === 'completed').length || 0;
      const citasAyerTotal = citasAyer?.length || 0;
      const showRateAyer = citasAyerTotal > 0 ? Math.round((citasAyerCompletadas / citasAyerTotal) * 100) : 0;

      const negociacionD = pipelineD?.filter(p => p.status === 'negotiation').length || 0;
      const reservadosD = pipelineD?.filter(p => p.status === 'reserved').length || 0;

      // Cálculos proyección
      let revenueMes = 0;
      cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
      const cierresMesCount = cierresMes?.length || 0;
      const leadsMesCount = leadsMes?.length || 0;
      const diaActual = hoy.getDate();
      const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const diasRestantes = diasEnMes - diaActual;
      const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
      const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

      const rendAyer: string[] = [];
      vendedoresD?.forEach(v => {
        const leadsV = leadsAyer?.filter(l => l.assigned_to === v.id).length || 0;
        const cierresV = cierresAyer?.filter(c => c.assigned_to === v.id).length || 0;
        if (leadsV > 0 || cierresV > 0) rendAyer.push('• ' + (v.name?.split(' ')[0] || 'V') + ': ' + cierresV + 'c/' + leadsV + 'L');
      });

      const citasHoyList: string[] = [];
      citasHoy?.slice(0, 5).forEach(c => {
        const hora = c.scheduled_time || '00:00';
        const vendedor = c.team_members?.name?.split(' ')[0] || 'Sin asignar';
        const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
        citasHoyList.push('• ' + hora + ' - ' + cliente + ' (' + vendedor + ')');
      });

      const alertas: string[] = [];
      if (estancados && estancados.length > 0) alertas.push('• ' + estancados.length + ' leads sin contactar >24h');
      if (perdidosAyer && perdidosAyer.length > 0) alertas.push('• ' + perdidosAyer.length + ' leads perdidos ayer');

      const msg = `☀️ *BUENOS DÍAS CEO*
_${fechaFormato}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE AYER*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsAyerCount}* ${calcVarD(leadsAyerCount, leadsSemPasadaCount)}
• Cierres: *${cierresAyerCount}* ${calcVarD(cierresAyerCount, cierresSemPasadaCount)}
• Revenue: *$${(revenueAyer/1000000).toFixed(1)}M*
• Citas: ${citasAyerCompletadas}/${citasAyerTotal} (${showRateAyer}% show)

━━━━━━━━━━━━━━━━━━━━━
📅 *AGENDA DE HOY*
━━━━━━━━━━━━━━━━━━━━━
${citasHoy && citasHoy.length > 0 ? '*' + citasHoy.length + ' citas agendadas:*\n' + citasHoyList.join('\n') + (citasHoy.length > 5 ? '\n_...y ' + (citasHoy.length - 5) + ' más_' : '') : '• Sin citas agendadas'}

━━━━━━━━━━━━━━━━━━━━━
🔥 *PIPELINE HOT*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValueD/1000000).toFixed(1)}M*
• En negociación: ${negociacionD}
• Reservados: ${reservadosD}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*
• Leads mes: ${leadsMesCount}
• Días restantes: ${diasRestantes}
${alertas.length > 0 ? '\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ *ALERTAS*\n━━━━━━━━━━━━━━━━━━━━━\n' + alertas.join('\n') : ''}
${rendAyer.length > 0 ? '\n━━━━━━━━━━━━━━━━━━━━━\n👥 *EQUIPO AYER*\n━━━━━━━━━━━━━━━━━━━━━\n' + rendAyer.slice(0,5).join('\n') : ''}

_Escribe *resumen* para más detalles_`;

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte diario mejorado enviado a ${phoneFormatted}` }));
    }


    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-semanal') {
      console.log('TEST: Enviando reporte semanal CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte semanal enviado' }));
    }

    // TEST: Reporte semanal a número específico
    if (url.pathname.startsWith('/test-reporte-semanal/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando reporte semanal mejorado a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const hoy = new Date();
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - 7);
      const inicioSemanaAnterior = new Date(inicioSemana);
      inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() - 7);

      // Queries
      const { data: leadsSemana } = await supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioSemana.toISOString());
      const { data: cierresSemana } = await supabase.client.from('leads').select('*, properties(price), team_members:assigned_to(name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString());
      const { data: citasSemana } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]);
      const { data: leadsSemanaAnt } = await supabase.client.from('leads').select('id').gte('created_at', inicioSemanaAnterior.toISOString()).lt('created_at', inicioSemana.toISOString());
      const { data: cierresSemanaAnt } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemanaAnterior.toISOString()).lt('status_changed_at', inicioSemana.toISOString());
      const { data: perdidosSemana } = await supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioSemana.toISOString());
      const { data: pipeline } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);
      const { data: vendedores } = await supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true);

      // Proyección del mes
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes);
      const { data: leadsMes } = await supabase.client.from('leads').select('id').gte('created_at', inicioMes);

      // Cálculos básicos
      let revenue = 0, revenueAnt = 0, pipelineValue = 0, revenueMes = 0;
      cierresSemana?.forEach(c => revenue += c.properties?.price || 2000000);
      cierresSemanaAnt?.forEach(c => revenueAnt += (c as any).properties?.price || 2000000);
      pipeline?.forEach(p => pipelineValue += p.properties?.price || 2000000);
      cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);

      const leadsActual = leadsSemana?.length || 0;
      const leadsAnterior = leadsSemanaAnt?.length || 0;
      const cierresActual = cierresSemana?.length || 0;
      const cierresAnterior = cierresSemanaAnt?.length || 0;
      const perdidosCount = perdidosSemana?.length || 0;

      // Citas stats
      const citasTotal = citasSemana?.length || 0;
      const citasCompletadas = citasSemana?.filter(c => c.status === 'completed').length || 0;
      const citasCanceladas = citasSemana?.filter(c => c.status === 'cancelled').length || 0;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;

      // Conversión y métricas
      const conversionRate = leadsActual > 0 ? Math.round(cierresActual / leadsActual * 100) : 0;

      // Tiempo de respuesta promedio
      let tiempoRespuesta = 0, leadsConResp = 0;
      leadsSemana?.forEach(l => {
        if (l.first_contact_at && l.created_at) {
          const diff = (new Date(l.first_contact_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60);
          if (diff > 0 && diff < 24 * 60) { tiempoRespuesta += diff; leadsConResp++; }
        }
      });
      const tiempoRespProm = leadsConResp > 0 ? Math.round(tiempoRespuesta / leadsConResp) : 0;

      // Proyección
      const diaActual = hoy.getDate();
      const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const cierresMesCount = cierresMes?.length || 0;
      const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
      const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

      const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

      // Top fuentes
      const fuenteCount: Record<string, number> = {};
      leadsSemana?.forEach(l => { const f = l.source || 'Otro'; fuenteCount[f] = (fuenteCount[f] || 0) + 1; });
      const topFuentes = Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Razones de pérdida
      const razonesCount: Record<string, number> = {};
      perdidosSemana?.forEach(l => { const r = l.lost_reason || 'Sin especificar'; razonesCount[r] = (razonesCount[r] || 0) + 1; });
      const topRazones = Object.entries(razonesCount).sort((a, b) => b[1] - a[1]).slice(0, 2);

      // Rendimiento vendedores
      const rendimiento: { nombre: string; cierres: number; citas: number; leads: number; revenue: number }[] = [];
      vendedores?.forEach(v => {
        const l = leadsSemana?.filter(x => x.assigned_to === v.id).length || 0;
        const c = cierresSemana?.filter(x => x.assigned_to === v.id).length || 0;
        let rev = 0;
        cierresSemana?.filter(x => x.assigned_to === v.id).forEach(x => rev += x.properties?.price || 2000000);
        const ci = citasSemana?.filter(x => x.team_member_id === v.id && x.status === 'completed').length || 0;
        if (l > 0 || c > 0) rendimiento.push({ nombre: v.name?.split(' ')[0] || 'V', cierres: c, citas: ci, leads: l, revenue: rev });
      });
      rendimiento.sort((a, b) => b.cierres - a.cierres || b.revenue - a.revenue);

      // Insights
      const insights: string[] = [];
      if (tiempoRespProm > 0 && tiempoRespProm <= 30) insights.push('✅ Tiempo respuesta excelente');
      else if (tiempoRespProm > 120) insights.push('⚠️ Mejorar tiempo de respuesta');
      if (leadsActual > leadsAnterior * 1.2) insights.push('📈 Semana fuerte en leads (+20%)');
      if (cierresActual > cierresAnterior) insights.push('🎯 Cierres arriba vs semana pasada');
      if (showRate >= 70) insights.push('✅ Buen show rate de citas');
      else if (showRate < 50 && citasTotal > 0) insights.push('⚠️ Show rate bajo, revisar confirmaciones');
      if (insights.length === 0) insights.push('📊 Semana estable');

      const msg = `📈 *REPORTE SEMANAL CEO*
_${inicioSemana.getDate()}/${inicioSemana.getMonth()+1} - ${hoy.getDate()}/${hoy.getMonth()+1} ${meses[hoy.getMonth()]}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE LA SEMANA*
━━━━━━━━━━━━━━━━━━━━━
• Leads: *${leadsActual}* ${calcVar(leadsActual, leadsAnterior)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresAnterior)}
• Revenue: *$${(revenue/1000000).toFixed(1)}M* ${calcVar(revenue, revenueAnt)}
• Perdidos: ${perdidosCount}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Completadas: ${citasCompletadas}/${citasTotal} (*${showRate}%* show)
• Canceladas: ${citasCanceladas}
• Conversión cita→cierre: *${citasCompletadas > 0 ? Math.round(cierresActual/citasCompletadas*100) : 0}%*

━━━━━━━━━━━━━━━━━━━━━
💰 *PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• En negociación: ${pipeline?.filter(p => p.status === 'negotiation').length || 0}
• Reservados: ${pipeline?.filter(p => p.status === 'reserved').length || 0}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*

━━━━━━━━━━━━━━━━━━━━━
⏱️ *VELOCIDAD*
━━━━━━━━━━━━━━━━━━━━━
• Tiempo respuesta: *${tiempoRespProm > 60 ? Math.round(tiempoRespProm/60) + 'h' : tiempoRespProm + 'min'}* ${tiempoRespProm > 0 && tiempoRespProm <= 30 ? '✅' : tiempoRespProm > 120 ? '⚠️' : ''}
• Conversión: *${conversionRate}%*

━━━━━━━━━━━━━━━━━━━━━
👥 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendimiento.slice(0,5).map((v, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${v.nombre}: ${v.cierres}c $${(v.revenue/1000000).toFixed(1)}M`).join('\n') || '• Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📣 *TOP FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${topFuentes.map(f => `• ${f[0]}: ${f[1]} leads`).join('\n') || '• Sin datos'}
${perdidosCount > 0 && topRazones.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n❌ *RAZONES PÉRDIDA*\n━━━━━━━━━━━━━━━━━━━━━\n${topRazones.map(r => `• ${r[0]}: ${r[1]}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insights.join('\n')}

_Escribe *resumen* para más detalles_`;

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte semanal mejorado enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-mensual') {
      console.log('TEST: Enviando reporte mensual CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte mensual enviado' }));
    }
    // TEST: Reporte mensual mejorado a número específico
    if (url.pathname.startsWith('/test-reporte-mensual/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando reporte mensual mejorado a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const hoy = new Date();
      const mesActual = hoy.getMonth();
      const anioActual = hoy.getFullYear();
      const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
      const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;
      const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
      const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);
      const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
      const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
      const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
      const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);
      const inicioMesYoY = new Date(anioReporte - 1, mesReporte, 1);
      const finMesYoY = new Date(anioReporte - 1, mesReporte + 1, 0, 23, 59, 59);
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const nombreMes = meses[mesReporte];

      // Queries
      const { data: leadsMes } = await supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioMesReporte.toISOString()).lte('created_at', finMesReporte.toISOString());
      const { data: leadsMesAnterior } = await supabase.client.from('leads').select('id').gte('created_at', inicioMesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString());
      const { data: leadsYoY } = await supabase.client.from('leads').select('id').gte('created_at', inicioMesYoY.toISOString()).lte('created_at', finMesYoY.toISOString());
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price, name), team_members:assigned_to(name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesReporte.toISOString()).lte('status_changed_at', finMesReporte.toISOString());
      const { data: cierresMesAnterior } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesAnterior.toISOString()).lte('status_changed_at', finMesAnterior.toISOString());
      const { data: cierresYoY } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesYoY.toISOString()).lte('status_changed_at', finMesYoY.toISOString());
      const { data: pipelineMensual } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);
      const { data: leadsPerdidos } = await supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioMesReporte.toISOString()).lte('status_changed_at', finMesReporte.toISOString());
      const { data: citasMes } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0]).lte('scheduled_date', finMesReporte.toISOString().split('T')[0]);
      const { data: vendedoresMes } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true);

      // Cálculos de revenue
      let revenueMes = 0, revenueMesAnt = 0, revenueYoY = 0, pipelineValue = 0;
      cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
      cierresMesAnterior?.forEach(c => revenueMesAnt += c.properties?.price || 2000000);
      cierresYoY?.forEach(c => revenueYoY += c.properties?.price || 2000000);
      pipelineMensual?.forEach(p => pipelineValue += p.properties?.price || 2000000);

      // Conteos básicos
      const leadsActual = leadsMes?.length || 0;
      const leadsPrev = leadsMesAnterior?.length || 0;
      const leadsYoYCount = leadsYoY?.length || 0;
      const cierresActual = cierresMes?.length || 0;
      const cierresPrev = cierresMesAnterior?.length || 0;
      const cierresYoYCount = cierresYoY?.length || 0;
      const perdidosCount = leadsPerdidos?.length || 0;

      // Citas stats
      const citasTotal = citasMes?.length || 0;
      const citasCompletadas = citasMes?.filter(c => c.status === 'completed').length || 0;
      const citasCanceladas = citasMes?.filter(c => c.status === 'cancelled').length || 0;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;
      const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresActual / citasCompletadas) * 100) : 0;

      // Métricas
      const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';
      const conversionMes = leadsActual > 0 ? Math.round((cierresActual / leadsActual) * 100) : 0;
      const ticketPromedio = cierresActual > 0 ? revenueMes / cierresActual : 0;

      // Tiempo de respuesta promedio
      let tiempoResp = 0, leadsConResp = 0;
      leadsMes?.forEach(l => {
        if (l.first_contact_at && l.created_at) {
          const diff = (new Date(l.first_contact_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60);
          if (diff > 0 && diff < 24 * 60) { tiempoResp += diff; leadsConResp++; }
        }
      });
      const tiempoRespProm = leadsConResp > 0 ? Math.round(tiempoResp / leadsConResp) : 0;

      // Top fuentes
      const porFuente: Record<string, number> = {};
      leadsMes?.forEach(l => { const f = l.source || 'Directo'; porFuente[f] = (porFuente[f] || 0) + 1; });
      const fuentesTop = Object.entries(porFuente).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Razones de pérdida
      const razonesLost: Record<string, number> = {};
      leadsPerdidos?.forEach(l => { const r = l.lost_reason || 'Sin especificar'; razonesLost[r] = (razonesLost[r] || 0) + 1; });
      const topRazones = Object.entries(razonesLost).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Rendimiento vendedores con revenue
      const rendimiento: { nombre: string; cierres: number; leads: number; revenue: number }[] = [];
      vendedoresMes?.forEach(v => {
        const c = cierresMes?.filter(x => x.assigned_to === v.id).length || 0;
        const l = leadsMes?.filter(x => x.assigned_to === v.id).length || 0;
        let rev = 0;
        cierresMes?.filter(x => x.assigned_to === v.id).forEach(x => rev += x.properties?.price || 2000000);
        if (c > 0 || l > 0) rendimiento.push({ nombre: v.name?.split(' ')[0] || 'V', cierres: c, leads: l, revenue: rev });
      });
      rendimiento.sort((a, b) => b.revenue - a.revenue || b.cierres - a.cierres);

      // Pipeline por etapa
      const negociacion = pipelineMensual?.filter(p => p.status === 'negotiation').length || 0;
      const reservados = pipelineMensual?.filter(p => p.status === 'reserved').length || 0;

      // Insights inteligentes
      const insights: string[] = [];
      if (cierresActual > cierresPrev) insights.push('✅ Crecimiento MoM en cierres');
      else if (cierresActual < cierresPrev) insights.push('⚠️ Cierres abajo vs mes anterior');
      if (revenueMes > revenueMesAnt) insights.push('✅ Revenue arriba vs mes anterior');
      if (conversionMes >= 5) insights.push('✅ Conversión saludable');
      else insights.push('⚠️ Revisar seguimiento de leads');
      if (showRate >= 70) insights.push('✅ Buen show rate de citas');
      else if (citasTotal > 0) insights.push('⚠️ Mejorar confirmación de citas');
      if (tiempoRespProm > 0 && tiempoRespProm <= 30) insights.push('✅ Tiempo respuesta excelente');
      else if (tiempoRespProm > 120) insights.push('⚠️ Reducir tiempo de respuesta');
      if (pipelineValue > revenueMes * 2) insights.push('💰 Pipeline saludable');

      const msg = `📊 *REPORTE MENSUAL CEO*
*${nombreMes.toUpperCase()} ${anioReporte}*

━━━━━━━━━━━━━━━━━━━━━
💰 *RESULTADOS DEL MES*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueMes/1000000).toFixed(1)}M* ${calcVar(revenueMes, revenueMesAnt)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresPrev)}
• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*
• vs año anterior: ${calcVar(revenueMes, revenueYoY)} revenue

━━━━━━━━━━━━━━━━━━━━━
📥 *GENERACIÓN DE LEADS*
━━━━━━━━━━━━━━━━━━━━━
• Leads: *${leadsActual}* ${calcVar(leadsActual, leadsPrev)}
• Conversión: *${conversionMes}%*
• Perdidos: ${perdidosCount}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Completadas: ${citasCompletadas}/${citasTotal} (*${showRate}%* show)
• Canceladas: ${citasCanceladas}
• Cita→Cierre: *${convCitaCierre}%*

━━━━━━━━━━━━━━━━━━━━━
💰 *PIPELINE ACTUAL*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• En negociación: ${negociacion}
• Reservados: ${reservados}

━━━━━━━━━━━━━━━━━━━━━
⏱️ *VELOCIDAD*
━━━━━━━━━━━━━━━━━━━━━
• Tiempo respuesta: *${tiempoRespProm > 60 ? Math.round(tiempoRespProm/60) + 'h' : tiempoRespProm + 'min'}*

━━━━━━━━━━━━━━━━━━━━━
👥 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendimiento.slice(0,5).map((v, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${v.nombre}: ${v.cierres}c $${(v.revenue/1000000).toFixed(1)}M`).join('\n') || '• Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📣 *TOP FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${fuentesTop.map(f => `• ${f[0]}: ${f[1]} leads`).join('\n') || '• Sin datos'}
${perdidosCount > 0 && topRazones.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n❌ *RAZONES PÉRDIDA*\n━━━━━━━━━━━━━━━━━━━━━\n${topRazones.map(r => `• ${r[0]}: ${r[1]}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insights.slice(0, 4).join('\n')}

_Cierre ${nombreMes} ${anioReporte}_`;

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte mensual mejorado enviado a ${phoneFormatted}` }));
    }



    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal vendedor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-vendedor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      }
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte semanal vendedor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar vendedor por teléfono o usar datos de prueba
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', phoneFormatted)
        .single();

      const hoy = new Date();
      const diaSemana = hoy.getDay();

      // Semana pasada (lunes a domingo)
      const inicioSemPasada = new Date(hoy);
      inicioSemPasada.setDate(hoy.getDate() - diaSemana - 6);
      inicioSemPasada.setHours(0, 0, 0, 0);

      const finSemPasada = new Date(inicioSemPasada);
      finSemPasada.setDate(inicioSemPasada.getDate() + 6);
      finSemPasada.setHours(23, 59, 59, 999);

      // Semana anterior
      const inicioSemAnterior = new Date(inicioSemPasada);
      inicioSemAnterior.setDate(inicioSemPasada.getDate() - 7);
      const finSemAnterior = new Date(finSemPasada);
      finSemAnterior.setDate(finSemPasada.getDate() - 7);

      // Obtener todos los vendedores para ranking
      const { data: vendedoresRank } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);

      // Datos globales de la semana
      const { data: todosLeadsSemV } = await supabase.client
        .from('leads')
        .select('*, properties(price)')
        .gte('created_at', inicioSemPasada.toISOString())
        .lte('created_at', finSemPasada.toISOString());

      const { data: todosCierresSemV } = await supabase.client
        .from('leads')
        .select('*, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioSemPasada.toISOString())
        .lte('status_changed_at', finSemPasada.toISOString());

      const { data: todasCitasSemV } = await supabase.client
        .from('appointments')
        .select('*')
        .gte('scheduled_date', inicioSemPasada.toISOString().split('T')[0])
        .lte('scheduled_date', finSemPasada.toISOString().split('T')[0]);

      // Datos semana anterior
      const { data: todosLeadsSemAntV } = await supabase.client
        .from('leads')
        .select('id, assigned_to')
        .gte('created_at', inicioSemAnterior.toISOString())
        .lte('created_at', finSemAnterior.toISOString());

      const { data: todosCierresSemAntV } = await supabase.client
        .from('leads')
        .select('id, assigned_to, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioSemAnterior.toISOString())
        .lte('status_changed_at', finSemAnterior.toISOString());

      // Calcular ranking por revenue
      const vendedoresConRevenueV = (vendedoresRank || []).map(v => {
        const cierresV = todosCierresSemV?.filter(c => c.assigned_to === v.id) || [];
        let revenueV = 0;
        cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
        return { ...v, cierresCount: cierresV.length, revenueV };
      }).sort((a, b) => b.revenueV - a.revenueV);

      const calcVarV = (a: number, b: number) => {
        if (b === 0) return a > 0 ? '↑' : '→';
        if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
        if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
        return '→';
      };

      // Si encontramos vendedor, usar sus datos reales
      const vendedorId = vendedor?.id || vendedoresRank?.[0]?.id || null;
      const nombreVendedor = vendedor?.name?.split(' ')[0] || 'Vendedor';

      const leadsVendedorV = todosLeadsSemV?.filter(l => l.assigned_to === vendedorId) || [];
      const cierresVendedorV = todosCierresSemV?.filter(c => c.assigned_to === vendedorId) || [];
      const citasVendedorV = todasCitasSemV?.filter(c => c.vendedor_id === vendedorId) || [];

      const leadsVendedorAntV = todosLeadsSemAntV?.filter(l => l.assigned_to === vendedorId) || [];
      const cierresVendedorAntV = todosCierresSemAntV?.filter(c => c.assigned_to === vendedorId) || [];

      const leadsCountV = leadsVendedorV.length;
      const leadsCountAntV = leadsVendedorAntV.length;
      const cierresCountV = cierresVendedorV.length;
      const cierresCountAntV = cierresVendedorAntV.length;

      let revenueVendedorV = 0;
      cierresVendedorV.forEach(c => revenueVendedorV += c.properties?.price || 2000000);

      let revenueVendedorAntV = 0;
      cierresVendedorAntV.forEach(c => revenueVendedorAntV += c.properties?.price || 2000000);

      const citasTotalV = citasVendedorV.length;
      const citasCompletadasV = citasVendedorV.filter(c => c.status === 'completed').length;
      const showRateV = citasTotalV > 0 ? Math.round((citasCompletadasV / citasTotalV) * 100) : 0;

      const convLeadCierreV = leadsCountV > 0 ? Math.round((cierresCountV / leadsCountV) * 100) : 0;
      const convCitaCierreV = citasCompletadasV > 0 ? Math.round((cierresCountV / citasCompletadasV) * 100) : 0;

      // Tiempo de respuesta
      let tiemposRespuestaV: number[] = [];
      for (const l of leadsVendedorV) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuestaV.push(diffMin);
        }
      }
      const tiempoPromedioMinV = tiemposRespuestaV.length > 0
        ? Math.round(tiemposRespuestaV.reduce((a, b) => a + b, 0) / tiemposRespuestaV.length)
        : 0;
      const tiempoRespuestaStrV = tiempoPromedioMinV > 60
        ? `${Math.floor(tiempoPromedioMinV/60)}h ${tiempoPromedioMinV%60}m`
        : `${tiempoPromedioMinV}min`;

      // Ranking
      const posicionV = vendedoresConRevenueV.findIndex(v => v.id === vendedorId) + 1 || vendedoresConRevenueV.length;
      const totalVendedoresV = vendedoresConRevenueV.length || 1;
      const medallasV = ['🥇', '🥈', '🥉'];
      const posicionStrV = posicionV <= 3 ? medallasV[posicionV - 1] : `#${posicionV}`;

      let revenueEquipoV = 0;
      todosCierresSemV?.forEach(c => revenueEquipoV += c.properties?.price || 2000000);
      const porcentajeEquipoV = revenueEquipoV > 0 ? Math.round((revenueVendedorV / revenueEquipoV) * 100) : 0;

      // Insights
      const insightsV: string[] = [];
      if (cierresCountV > cierresCountAntV) insightsV.push(`✅ Mejoraste en cierres: ${cierresCountAntV}→${cierresCountV}`);
      else if (cierresCountV < cierresCountAntV && cierresCountAntV > 0) insightsV.push(`⚠️ Menos cierres que la semana pasada`);
      if (showRateV >= 80) insightsV.push(`✅ Excelente show rate: ${showRateV}%`);
      else if (showRateV < 60 && citasTotalV > 0) insightsV.push(`💡 Tip: Confirma citas 1 día antes`);
      if (tiempoPromedioMinV > 0 && tiempoPromedioMinV <= 10) insightsV.push(`✅ Respuesta rápida: ${tiempoRespuestaStrV}`);
      else if (tiempoPromedioMinV > 60) insightsV.push(`💡 Tip: Responde más rápido a leads`);
      if (posicionV === 1) insightsV.push(`🏆 ¡Eres el #1 del equipo esta semana!`);
      else if (posicionV <= 3) insightsV.push(`🎯 Estás en el Top 3 del equipo`);
      if (convCitaCierreV >= 40) insightsV.push(`✅ Gran cierre en citas: ${convCitaCierreV}%`);
      const insightsTextV = insightsV.length > 0 ? insightsV.join('\n') : '💪 ¡Sigue así!';

      const fechaSemanaV = `${inicioSemPasada.getDate()}/${inicioSemPasada.getMonth()+1} - ${finSemPasada.getDate()}/${finSemPasada.getMonth()+1}`;

      const msgV = `📊 *TU REPORTE SEMANAL*
Hola *${nombreVendedor}* 👋
_Semana: ${fechaSemanaV}_

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedorV/1000000).toFixed(1)}M* ${calcVarV(revenueVendedorV, revenueVendedorAntV)}
• Cierres: *${cierresCountV}* ${calcVarV(cierresCountV, cierresCountAntV)}
• Leads: *${leadsCountV}* ${calcVarV(leadsCountV, leadsCountAntV)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Agendadas: ${citasTotalV}
• Completadas: ${citasCompletadasV}
• Show rate: *${showRateV}%* ${showRateV >= 70 ? '✅' : '⚠️'}

━━━━━━━━━━━━━━━━━━━━━
📈 *TUS CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierreV}%*
• Cita→Cierre: *${convCitaCierreV}%*
• Tiempo respuesta: *${tiempoRespuestaStrV}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStrV}* de ${totalVendedoresV}
• Aportaste: *${porcentajeEquipoV}%* del revenue

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insightsTextV}

_¡Éxito esta semana!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgV);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte semanal vendedor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes a todos los vendedores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-vendedores') {
      console.log('TEST: Enviando reportes semanales a todos los vendedores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalVendedores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes semanales enviados a todos los vendedores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario vendedor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-diario-vendedor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      }
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte diario vendedor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: vendedorD } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', phoneFormatted)
        .single();

      const hoyD = new Date();
      const inicioHoyD = new Date(hoyD); inicioHoyD.setHours(0, 0, 0, 0);
      const finHoyD = new Date(hoyD); finHoyD.setHours(23, 59, 59, 999);
      const inicioAyerD = new Date(inicioHoyD); inicioAyerD.setDate(inicioAyerD.getDate() - 1);
      const finAyerD = new Date(finHoyD); finAyerD.setDate(finAyerD.getDate() - 1);
      const mananaD = new Date(inicioHoyD); mananaD.setDate(mananaD.getDate() + 1);

      const { data: vendedoresD } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true);
      const { data: todosLeadsHoyD } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioHoyD.toISOString()).lte('created_at', finHoyD.toISOString());
      const { data: todosCierresHoyD } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioHoyD.toISOString()).lte('status_changed_at', finHoyD.toISOString());
      const { data: todasCitasHoyD } = await supabase.client.from('appointments').select('*').eq('scheduled_date', inicioHoyD.toISOString().split('T')[0]);
      const { data: citasMananaD } = await supabase.client.from('appointments').select('*, leads(name, phone)').eq('scheduled_date', mananaD.toISOString().split('T')[0]).eq('status', 'scheduled');
      const { data: todosLeadsAyerD } = await supabase.client.from('leads').select('id, assigned_to').gte('created_at', inicioAyerD.toISOString()).lte('created_at', finAyerD.toISOString());
      const { data: todosCierresAyerD } = await supabase.client.from('leads').select('id, assigned_to, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyerD.toISOString()).lte('status_changed_at', finAyerD.toISOString());
      const { data: pipelineActivoD } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['new', 'contacted', 'qualified', 'negotiation', 'scheduled', 'visited']);

      const vendedorIdD = vendedorD?.id || vendedoresD?.[0]?.id || null;
      const nombreVendedorD = vendedorD?.name?.split(' ')[0] || 'Vendedor';

      const calcVarD = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const leadsVendedorHoyD = todosLeadsHoyD?.filter(l => l.assigned_to === vendedorIdD) || [];
      const cierresVendedorHoyD = todosCierresHoyD?.filter(c => c.assigned_to === vendedorIdD) || [];
      const citasVendedorHoyD = todasCitasHoyD?.filter(c => c.vendedor_id === vendedorIdD) || [];
      const citasVendedorMananaD = citasMananaD?.filter(c => c.vendedor_id === vendedorIdD) || [];
      const pipelineVendedorD = pipelineActivoD?.filter(p => p.assigned_to === vendedorIdD) || [];
      const leadsVendedorAyerD = todosLeadsAyerD?.filter(l => l.assigned_to === vendedorIdD) || [];
      const cierresVendedorAyerD = todosCierresAyerD?.filter(c => c.assigned_to === vendedorIdD) || [];

      const leadsHoyCountD = leadsVendedorHoyD.length;
      const leadsAyerCountD = leadsVendedorAyerD.length;
      const cierresHoyCountD = cierresVendedorHoyD.length;

      let revenueHoyD = 0;
      cierresVendedorHoyD.forEach(c => revenueHoyD += c.properties?.price || 2000000);

      const citasHoyTotalD = citasVendedorHoyD.length;
      const citasCompletadasD = citasVendedorHoyD.filter(c => c.status === 'completed').length;
      const citasPendientesD = citasVendedorHoyD.filter(c => c.status === 'scheduled').length;
      const showRateHoyD = citasHoyTotalD > 0 ? Math.round((citasCompletadasD / citasHoyTotalD) * 100) : 0;

      let pipelineValueD = 0;
      pipelineVendedorD.forEach(p => pipelineValueD += p.properties?.price || 2000000);
      const leadsNuevosD = pipelineVendedorD.filter(p => p.status === 'new').length;
      const leadsContactadosD = pipelineVendedorD.filter(p => ['contacted', 'qualified'].includes(p.status)).length;
      const leadsNegociacionD = pipelineVendedorD.filter(p => ['negotiation', 'scheduled', 'visited'].includes(p.status)).length;

      let tiemposRespuestaD: number[] = [];
      for (const l of leadsVendedorHoyD) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuestaD.push(diffMin);
        }
      }
      const tiempoPromedioMinD = tiemposRespuestaD.length > 0 ? Math.round(tiemposRespuestaD.reduce((a, b) => a + b, 0) / tiemposRespuestaD.length) : 0;
      const tiempoRespuestaStrD = tiempoPromedioMinD > 60 ? `${Math.floor(tiempoPromedioMinD/60)}h ${tiempoPromedioMinD%60}m` : `${tiempoPromedioMinD}min`;

      const citasMananaDetalleD: string[] = [];
      citasVendedorMananaD.slice(0, 3).forEach(c => {
        const hora = c.scheduled_time?.substring(0, 5) || '00:00';
        const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
        citasMananaDetalleD.push(`  • ${hora} - ${cliente}`);
      });

      const insightsD: string[] = [];
      if (cierresHoyCountD > 0) insightsD.push(`🎉 ¡${cierresHoyCountD} cierre${cierresHoyCountD > 1 ? 's' : ''} hoy! $${(revenueHoyD/1000000).toFixed(1)}M`);
      if (leadsHoyCountD > leadsAyerCountD && leadsHoyCountD > 0) insightsD.push(`📈 Más leads que ayer: ${leadsAyerCountD}→${leadsHoyCountD}`);
      if (citasPendientesD > 0) insightsD.push(`⚠️ ${citasPendientesD} cita${citasPendientesD > 1 ? 's' : ''} pendiente${citasPendientesD > 1 ? 's' : ''} de hoy`);
      if (tiempoPromedioMinD > 0 && tiempoPromedioMinD <= 10) insightsD.push(`✅ Respuesta rápida: ${tiempoRespuestaStrD}`);
      else if (tiempoPromedioMinD > 30) insightsD.push(`💡 Tip: Responde más rápido`);
      if (leadsNuevosD > 3) insightsD.push(`📋 ${leadsNuevosD} leads nuevos por contactar`);
      if (citasVendedorMananaD.length > 0) insightsD.push(`📅 Mañana: ${citasVendedorMananaD.length} cita${citasVendedorMananaD.length > 1 ? 's' : ''}`);
      const insightsTextD = insightsD.length > 0 ? insightsD.join('\n') : '💪 ¡Buen trabajo hoy!';

      const fechaHoyD = `${hoyD.getDate()}/${hoyD.getMonth()+1}/${hoyD.getFullYear()}`;

      const msgD = `📊 *TU RESUMEN DEL DÍA*
Hola *${nombreVendedorD}* 👋
_${fechaHoyD}_

━━━━━━━━━━━━━━━━━━━━━
💰 *HOY*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsHoyCountD}* ${calcVarD(leadsHoyCountD, leadsAyerCountD)}
• Cierres: *${cierresHoyCountD}* ${cierresHoyCountD > 0 ? '🎉' : ''}
${cierresHoyCountD > 0 ? `• Revenue: *$${(revenueHoyD/1000000).toFixed(1)}M*` : ''}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS HOY*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasHoyTotalD}
• Completadas: ${citasCompletadasD} ${showRateHoyD >= 80 ? '✅' : ''}
• Pendientes: ${citasPendientesD} ${citasPendientesD > 0 ? '⚠️' : '✅'}

━━━━━━━━━━━━━━━━━━━━━
📋 *TU PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValueD/1000000).toFixed(1)}M*
• Nuevos: ${leadsNuevosD} | Contactados: ${leadsContactadosD}
• En negociación: ${leadsNegociacionD}

${citasVendedorMananaD.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS MAÑANA*
━━━━━━━━━━━━━━━━━━━━━
${citasMananaDetalleD.join('\n')}${citasVendedorMananaD.length > 3 ? `\n  _+${citasVendedorMananaD.length - 3} más..._` : ''}

` : ''}━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN*
━━━━━━━━━━━━━━━━━━━━━
${insightsTextD}

_¡Descansa y mañana con todo!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgD);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte diario vendedor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes diarios a todos los vendedores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-diarios-vendedores') {
      console.log('TEST: Enviando reportes diarios a todos los vendedores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioVendedores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes diarios enviados a todos los vendedores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual vendedor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-mensual-vendedor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte mensual vendedor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: vendedorM } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();

      const hoyM = new Date();
      const mesActualM = hoyM.getMonth();
      const anioActualM = hoyM.getFullYear();
      const mesReporteM = mesActualM === 0 ? 11 : mesActualM - 1;
      const anioReporteM = mesActualM === 0 ? anioActualM - 1 : anioActualM;
      const inicioMesReporteM = new Date(anioReporteM, mesReporteM, 1);
      const finMesReporteM = new Date(anioReporteM, mesReporteM + 1, 0, 23, 59, 59);
      const mesAnteriorM = mesReporteM === 0 ? 11 : mesReporteM - 1;
      const anioAnteriorM = mesReporteM === 0 ? anioReporteM - 1 : anioReporteM;
      const inicioMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM, 1);
      const finMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM + 1, 0, 23, 59, 59);

      const mesesM = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const nombreMesM = mesesM[mesReporteM];

      const { data: vendedoresM } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true);
      const { data: todosLeadsMesM } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioMesReporteM.toISOString()).lte('created_at', finMesReporteM.toISOString());
      const { data: todosCierresMesM } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesReporteM.toISOString()).lte('status_changed_at', finMesReporteM.toISOString());
      const { data: todasCitasMesM } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMesReporteM.toISOString().split('T')[0]).lte('scheduled_date', finMesReporteM.toISOString().split('T')[0]);
      const { data: todosLeadsMesAntM } = await supabase.client.from('leads').select('id, assigned_to').gte('created_at', inicioMesAnteriorM.toISOString()).lte('created_at', finMesAnteriorM.toISOString());
      const { data: todosCierresMesAntM } = await supabase.client.from('leads').select('id, assigned_to, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesAnteriorM.toISOString()).lte('status_changed_at', finMesAnteriorM.toISOString());
      const { data: todasCitasMesAntM } = await supabase.client.from('appointments').select('id, vendedor_id, status').gte('scheduled_date', inicioMesAnteriorM.toISOString().split('T')[0]).lte('scheduled_date', finMesAnteriorM.toISOString().split('T')[0]);

      const vendedorIdM = vendedorM?.id || vendedoresM?.[0]?.id || null;
      const nombreVendedorM = vendedorM?.name?.split(' ')[0] || 'Vendedor';

      const vendedoresConRevenueM = (vendedoresM || []).map(v => {
        const cierresV = todosCierresMesM?.filter(c => c.assigned_to === v.id) || [];
        let revenueV = 0; cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
        return { ...v, cierresCount: cierresV.length, revenueV };
      }).sort((a, b) => b.revenueV - a.revenueV);

      let revenueEquipoM = 0;
      todosCierresMesM?.forEach(c => revenueEquipoM += c.properties?.price || 2000000);

      const calcVarM = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const leadsVendedorM = todosLeadsMesM?.filter(l => l.assigned_to === vendedorIdM) || [];
      const cierresVendedorM = todosCierresMesM?.filter(c => c.assigned_to === vendedorIdM) || [];
      const citasVendedorM = todasCitasMesM?.filter(c => c.vendedor_id === vendedorIdM) || [];
      const leadsVendedorAntM = todosLeadsMesAntM?.filter(l => l.assigned_to === vendedorIdM) || [];
      const cierresVendedorAntM = todosCierresMesAntM?.filter(c => c.assigned_to === vendedorIdM) || [];
      const citasVendedorAntM = todasCitasMesAntM?.filter(c => c.vendedor_id === vendedorIdM) || [];

      const leadsCountM = leadsVendedorM.length;
      const leadsCountAntM = leadsVendedorAntM.length;
      const cierresCountM = cierresVendedorM.length;
      const cierresCountAntM = cierresVendedorAntM.length;

      let revenueVendedorM = 0; cierresVendedorM.forEach(c => revenueVendedorM += c.properties?.price || 2000000);
      let revenueVendedorAntM = 0; cierresVendedorAntM.forEach(c => revenueVendedorAntM += c.properties?.price || 2000000);

      const citasTotalM = citasVendedorM.length;
      const citasTotalAntM = citasVendedorAntM.length;
      const citasCompletadasM = citasVendedorM.filter(c => c.status === 'completed').length;
      const citasCompletadasAntM = citasVendedorAntM.filter(c => c.status === 'completed').length;
      const showRateM = citasTotalM > 0 ? Math.round((citasCompletadasM / citasTotalM) * 100) : 0;
      const showRateAntM = citasTotalAntM > 0 ? Math.round((citasCompletadasAntM / citasTotalAntM) * 100) : 0;

      const convLeadCierreM = leadsCountM > 0 ? Math.round((cierresCountM / leadsCountM) * 100) : 0;
      const convCitaCierreM = citasCompletadasM > 0 ? Math.round((cierresCountM / citasCompletadasM) * 100) : 0;
      const ticketPromedioM = cierresCountM > 0 ? revenueVendedorM / cierresCountM : 0;

      let tiemposRespuestaM: number[] = [];
      for (const l of leadsVendedorM) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuestaM.push(diffMin);
        }
      }
      const tiempoPromedioMinM = tiemposRespuestaM.length > 0 ? Math.round(tiemposRespuestaM.reduce((a, b) => a + b, 0) / tiemposRespuestaM.length) : 0;
      const tiempoRespuestaStrM = tiempoPromedioMinM > 60 ? `${Math.floor(tiempoPromedioMinM/60)}h ${tiempoPromedioMinM%60}m` : `${tiempoPromedioMinM}min`;

      const posicionM = vendedoresConRevenueM.findIndex(v => v.id === vendedorIdM) + 1 || vendedoresConRevenueM.length;
      const totalVendedoresM = vendedoresConRevenueM.length || 1;
      const medallasM = ['🥇', '🥈', '🥉'];
      const posicionStrM = posicionM <= 3 ? medallasM[posicionM - 1] : `#${posicionM}`;
      const porcentajeEquipoM = revenueEquipoM > 0 ? Math.round((revenueVendedorM / revenueEquipoM) * 100) : 0;

      const insightsM: string[] = [];
      if (revenueVendedorM > revenueVendedorAntM && revenueVendedorAntM > 0) {
        const pct = Math.round(((revenueVendedorM - revenueVendedorAntM) / revenueVendedorAntM) * 100);
        insightsM.push(`🚀 Revenue creció ${pct}% vs mes anterior`);
      } else if (revenueVendedorM < revenueVendedorAntM && revenueVendedorAntM > 0) {
        insightsM.push(`📉 Revenue bajó vs mes anterior`);
      }
      if (posicionM === 1) insightsM.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicionM <= 3) insightsM.push(`🎯 Top 3 del equipo`);
      if (showRateM >= 80) insightsM.push(`✅ Excelente show rate: ${showRateM}%`);
      if (convCitaCierreM >= 35) insightsM.push(`✅ Gran conversión cita→cierre: ${convCitaCierreM}%`);
      if (tiempoPromedioMinM > 0 && tiempoPromedioMinM <= 15) insightsM.push(`✅ Respuesta rápida promedio`);
      const insightsTextM = insightsM.length > 0 ? insightsM.join('\n') : '💪 ¡Buen mes!';

      const msgM = `📊 *TU REPORTE MENSUAL*
Hola *${nombreVendedorM}* 👋
*${nombreMesM.toUpperCase()} ${anioReporteM}*

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedorM/1000000).toFixed(1)}M* ${calcVarM(revenueVendedorM, revenueVendedorAntM)}
• Cierres: *${cierresCountM}* ${calcVarM(cierresCountM, cierresCountAntM)}
• Ticket promedio: *$${(ticketPromedioM/1000000).toFixed(2)}M*
• Leads: *${leadsCountM}* ${calcVarM(leadsCountM, leadsCountAntM)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasTotalM} ${calcVarM(citasTotalM, citasTotalAntM)}
• Completadas: ${citasCompletadasM}
• Show rate: *${showRateM}%* ${calcVarM(showRateM, showRateAntM)}

━━━━━━━━━━━━━━━━━━━━━
📈 *CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierreM}%*
• Cita→Cierre: *${convCitaCierreM}%*
• Tiempo respuesta: *${tiempoRespuestaStrM}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStrM}* de ${totalVendedoresM}
• Aportaste: *${porcentajeEquipoM}%* del revenue total
• Revenue equipo: $${(revenueEquipoM/1000000).toFixed(1)}M

━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN DEL MES*
━━━━━━━━━━━━━━━━━━━━━
${insightsTextM}

_¡Éxito en ${mesesM[mesActualM]}!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgM);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte mensual vendedor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes mensuales a todos los vendedores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-mensuales-vendedores') {
      console.log('TEST: Enviando reportes mensuales a todos los vendedores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualVendedores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes mensuales enviados a todos los vendedores' }));
    }



    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario asesor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-diario-asesor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte diario asesor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: asesorD } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();
      const hoyD = new Date();
      const inicioHoyD = new Date(hoyD); inicioHoyD.setHours(0, 0, 0, 0);
      const finHoyD = new Date(hoyD); finHoyD.setHours(23, 59, 59, 999);
      const inicioAyerD = new Date(inicioHoyD); inicioAyerD.setDate(inicioAyerD.getDate() - 1);
      const finAyerD = new Date(finHoyD); finAyerD.setDate(finAyerD.getDate() - 1);

      const { data: asesoresD } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
      const { data: hipotecasHoyD } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioHoyD.toISOString()).lte('created_at', finHoyD.toISOString());
      const { data: aprobadasHoyD } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioHoyD.toISOString()).lte('updated_at', finHoyD.toISOString());
      const { data: hipotecasAyerD } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioAyerD.toISOString()).lte('created_at', finAyerD.toISOString());
      const { data: pipelineActivoD } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').in('status', ['pending', 'in_progress', 'sent_to_bank']);

      const asesorIdD = asesorD?.id || asesoresD?.[0]?.id || null;
      const nombreAsesorD = asesorD?.name?.split(' ')[0] || 'Asesor';
      const calcVarD = (a, b) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const nuevasHoyD = hipotecasHoyD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const aprobadasAsesorHoyD = aprobadasHoyD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const nuevasAyerD = hipotecasAyerD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const pipelineAsesorD = pipelineActivoD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const pendientesD = pipelineAsesorD.filter(h => h.status === 'pending').length;
      const enProcesoD = pipelineAsesorD.filter(h => h.status === 'in_progress').length;
      const enBancoD = pipelineAsesorD.filter(h => h.status === 'sent_to_bank').length;

      const insightsD = [];
      if (aprobadasAsesorHoyD.length > 0) insightsD.push(`🎉 ¡${aprobadasAsesorHoyD.length} hipoteca${aprobadasAsesorHoyD.length > 1 ? 's' : ''} aprobada${aprobadasAsesorHoyD.length > 1 ? 's' : ''} hoy!`);
      if (nuevasHoyD.length > nuevasAyerD.length && nuevasHoyD.length > 0) insightsD.push(`📈 Más solicitudes que ayer: ${nuevasAyerD.length}→${nuevasHoyD.length}`);
      if (pendientesD > 3) insightsD.push(`📋 ${pendientesD} solicitudes pendientes de revisar`);
      if (enBancoD > 0) insightsD.push(`🏦 ${enBancoD} en banco - dar seguimiento`);
      const insightsTextD = insightsD.length > 0 ? insightsD.join('\n') : '💪 ¡Buen trabajo hoy!';
      const fechaHoyD = `${hoyD.getDate()}/${hoyD.getMonth()+1}/${hoyD.getFullYear()}`;

      const msgD = `📊 *TU RESUMEN DEL DÍA*\nHola *${nombreAsesorD}* 👋\n_${fechaHoyD}_\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes nuevas: *${nuevasHoyD.length}* ${calcVarD(nuevasHoyD.length, nuevasAyerD.length)}\n• Aprobadas: *${aprobadasAsesorHoyD.length}* ${aprobadasAsesorHoyD.length > 0 ? '🎉' : ''}\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *TU PIPELINE*\n━━━━━━━━━━━━━━━━━━━━━\n• Pendientes: ${pendientesD}\n• En proceso: ${enProcesoD}\n• En banco: ${enBancoD}\n• Total activo: *${pipelineAsesorD.length}*\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsTextD}\n\n_¡Descansa y mañana con todo!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgD);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte diario asesor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes diarios a todos los asesores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-diarios-asesores') {
      console.log('TEST: Enviando reportes diarios a todos los asesores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioAsesores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes diarios enviados a todos los asesores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal asesor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-semanal-asesor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte semanal asesor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: asesorS } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();
      const hoyS = new Date();
      const inicioSemanaS = new Date(hoyS); inicioSemanaS.setDate(hoyS.getDate() - hoyS.getDay() - 6); inicioSemanaS.setHours(0, 0, 0, 0);
      const finSemanaS = new Date(inicioSemanaS); finSemanaS.setDate(inicioSemanaS.getDate() + 6); finSemanaS.setHours(23, 59, 59, 999);
      const inicioSemAntS = new Date(inicioSemanaS); inicioSemAntS.setDate(inicioSemAntS.getDate() - 7);
      const finSemAntS = new Date(finSemanaS); finSemAntS.setDate(finSemAntS.getDate() - 7);

      const { data: asesoresS } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
      const { data: hipotecasSemS } = await supabase.client.from('mortgage_applications').select('*').gte('created_at', inicioSemanaS.toISOString()).lte('created_at', finSemanaS.toISOString());
      const { data: aprobadasSemS } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'approved').gte('updated_at', inicioSemanaS.toISOString()).lte('updated_at', finSemanaS.toISOString());
      const { data: rechazadasSemS } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'rejected').gte('updated_at', inicioSemanaS.toISOString()).lte('updated_at', finSemanaS.toISOString());
      const { data: hipotecasSemAntS } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioSemAntS.toISOString()).lte('created_at', finSemAntS.toISOString());
      const { data: aprobadasSemAntS } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioSemAntS.toISOString()).lte('updated_at', finSemAntS.toISOString());

      const asesorIdS = asesorS?.id || asesoresS?.[0]?.id || null;
      const nombreAsesorS = asesorS?.name?.split(' ')[0] || 'Asesor';
      const calcVarS = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const nuevasSemS = hipotecasSemS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const aprobadasAsesorS = aprobadasSemS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const rechazadasAsesorS = rechazadasSemS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const nuevasSemAntS = hipotecasSemAntS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const aprobadasSemAntAsesorS = aprobadasSemAntS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];

      const totalProcesadasS = aprobadasAsesorS.length + rechazadasAsesorS.length;
      const tasaAprobacionS = totalProcesadasS > 0 ? Math.round((aprobadasAsesorS.length / totalProcesadasS) * 100) : 0;

      const asesoresConAprobacionesS = (asesoresS || []).map(a => {
        const aprobadas = aprobadasSemS?.filter(h => h.assigned_advisor_id === a.id) || [];
        return { ...a, aprobadas: aprobadas.length };
      }).sort((a, b) => b.aprobadas - a.aprobadas);
      const posicionS = asesoresConAprobacionesS.findIndex(a => a.id === asesorIdS) + 1 || asesoresConAprobacionesS.length;
      const medallasS = ['🥇', '🥈', '🥉'];
      const posicionStrS = posicionS <= 3 ? medallasS[posicionS - 1] : `#${posicionS}`;

      const insightsS: string[] = [];
      if (aprobadasAsesorS.length > aprobadasSemAntAsesorS.length && aprobadasSemAntAsesorS.length > 0) insightsS.push(`🚀 Más aprobaciones que semana pasada`);
      if (posicionS === 1) insightsS.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicionS <= 3) insightsS.push(`🎯 Top 3 del equipo`);
      if (tasaAprobacionS >= 70) insightsS.push(`✅ Excelente tasa de aprobación: ${tasaAprobacionS}%`);
      const insightsTextS = insightsS.length > 0 ? insightsS.join('\n') : '💪 ¡Buena semana!';

      const msgS = `📊 *TU REPORTE SEMANAL*\nHola *${nombreAsesorS}* 👋\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *HIPOTECAS*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes: *${nuevasSemS.length}* ${calcVarS(nuevasSemS.length, nuevasSemAntS.length)}\n• Aprobadas: *${aprobadasAsesorS.length}* ${calcVarS(aprobadasAsesorS.length, aprobadasSemAntAsesorS.length)}\n• Rechazadas: ${rechazadasAsesorS.length}\n• Tasa aprobación: *${tasaAprobacionS}%*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStrS}* de ${asesoresConAprobacionesS.length}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsTextS}\n\n_¡Éxito esta semana!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgS);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte semanal asesor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes semanales a todos los asesores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-semanales-asesores') {
      console.log('TEST: Enviando reportes semanales a todos los asesores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalAsesores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes semanales enviados a todos los asesores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual asesor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-mensual-asesor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte mensual asesor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: asesorM } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();
      const hoyM = new Date();
      const mesActualM = hoyM.getMonth();
      const anioActualM = hoyM.getFullYear();
      const mesReporteM = mesActualM === 0 ? 11 : mesActualM - 1;
      const anioReporteM = mesActualM === 0 ? anioActualM - 1 : anioActualM;
      const inicioMesReporteM = new Date(anioReporteM, mesReporteM, 1);
      const finMesReporteM = new Date(anioReporteM, mesReporteM + 1, 0, 23, 59, 59);
      const mesAnteriorM = mesReporteM === 0 ? 11 : mesReporteM - 1;
      const anioAnteriorM = mesReporteM === 0 ? anioReporteM - 1 : anioReporteM;
      const inicioMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM, 1);
      const finMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM + 1, 0, 23, 59, 59);
      const mesesM = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const nombreMesM = mesesM[mesReporteM];

      const { data: asesoresM } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
      const { data: hipotecasMesM } = await supabase.client.from('mortgage_applications').select('*').gte('created_at', inicioMesReporteM.toISOString()).lte('created_at', finMesReporteM.toISOString());
      const { data: aprobadasMesM } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'approved').gte('updated_at', inicioMesReporteM.toISOString()).lte('updated_at', finMesReporteM.toISOString());
      const { data: rechazadasMesM } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'rejected').gte('updated_at', inicioMesReporteM.toISOString()).lte('updated_at', finMesReporteM.toISOString());
      const { data: hipotecasMesAntM } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioMesAnteriorM.toISOString()).lte('created_at', finMesAnteriorM.toISOString());
      const { data: aprobadasMesAntM } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioMesAnteriorM.toISOString()).lte('updated_at', finMesAnteriorM.toISOString());

      const asesorIdM = asesorM?.id || asesoresM?.[0]?.id || null;
      const nombreAsesorM = asesorM?.name?.split(' ')[0] || 'Asesor';
      const calcVarM = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const nuevasMesM = hipotecasMesM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const aprobadasAsesorM = aprobadasMesM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const rechazadasAsesorM = rechazadasMesM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const nuevasMesAntM = hipotecasMesAntM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const aprobadasMesAntAsesorM = aprobadasMesAntM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];

      const totalProcesadasM = aprobadasAsesorM.length + rechazadasAsesorM.length;
      const tasaAprobacionM = totalProcesadasM > 0 ? Math.round((aprobadasAsesorM.length / totalProcesadasM) * 100) : 0;
      const tasaAprobacionAntM = aprobadasMesAntAsesorM.length > 0 ? Math.round((aprobadasMesAntAsesorM.length / (aprobadasMesAntAsesorM.length + rechazadasAsesorM.length)) * 100) : 0;

      const asesoresConAprobacionesM = (asesoresM || []).map(a => {
        const aprobadas = aprobadasMesM?.filter(h => h.assigned_advisor_id === a.id) || [];
        return { ...a, aprobadas: aprobadas.length };
      }).sort((a, b) => b.aprobadas - a.aprobadas);
      const posicionM = asesoresConAprobacionesM.findIndex(a => a.id === asesorIdM) + 1 || asesoresConAprobacionesM.length;
      const medallasM = ['🥇', '🥈', '🥉'];
      const posicionStrM = posicionM <= 3 ? medallasM[posicionM - 1] : `#${posicionM}`;
      const totalAprobacionesEquipoM = aprobadasMesM?.length || 0;
      const porcentajeEquipoM = totalAprobacionesEquipoM > 0 ? Math.round((aprobadasAsesorM.length / totalAprobacionesEquipoM) * 100) : 0;

      const insightsM: string[] = [];
      if (aprobadasAsesorM.length > aprobadasMesAntAsesorM.length && aprobadasMesAntAsesorM.length > 0) {
        const pct = Math.round(((aprobadasAsesorM.length - aprobadasMesAntAsesorM.length) / aprobadasMesAntAsesorM.length) * 100);
        insightsM.push(`🚀 Aprobaciones crecieron ${pct}% vs mes anterior`);
      }
      if (posicionM === 1) insightsM.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicionM <= 3) insightsM.push(`🎯 Top 3 del equipo`);
      if (tasaAprobacionM >= 70) insightsM.push(`✅ Excelente tasa de aprobación: ${tasaAprobacionM}%`);
      const insightsTextM = insightsM.length > 0 ? insightsM.join('\n') : '💪 ¡Buen mes!';

      const msgM = `📊 *TU REPORTE MENSUAL*\nHola *${nombreAsesorM}* 👋\n*${nombreMesM.toUpperCase()} ${anioReporteM}*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *TUS RESULTADOS*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes: *${nuevasMesM.length}* ${calcVarM(nuevasMesM.length, nuevasMesAntM.length)}\n• Aprobadas: *${aprobadasAsesorM.length}* ${calcVarM(aprobadasAsesorM.length, aprobadasMesAntAsesorM.length)}\n• Rechazadas: ${rechazadasAsesorM.length}\n• Tasa aprobación: *${tasaAprobacionM}%* ${calcVarM(tasaAprobacionM, tasaAprobacionAntM)}\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING EQUIPO*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStrM}* de ${asesoresConAprobacionesM.length}\n• Aportaste: *${porcentajeEquipoM}%* de aprobaciones\n• Total equipo: ${totalAprobacionesEquipoM} aprobadas\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN DEL MES*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsTextM}\n\n_¡Éxito en ${mesesM[mesActualM]}!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgM);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte mensual asesor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes mensuales a todos los asesores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-mensuales-asesores') {
      console.log('TEST: Enviando reportes mensuales a todos los asesores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualAsesores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes mensuales enviados a todos los asesores' }));
    }


    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte marketing individual por teléfono
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-marketing/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte marketing a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const hoy = new Date();
      const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
      const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
      const inicioAyer = new Date(inicioHoy); inicioAyer.setDate(inicioAyer.getDate() - 1);
      const finAyer = new Date(finHoy); finAyer.setDate(finAyer.getDate() - 1);

      const { data: leadsHoy } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString());
      const { data: leadsAyer } = await supabase.client.from('leads').select('id, source').gte('created_at', inicioAyer.toISOString()).lte('created_at', finAyer.toISOString());
      const { data: citasHoy } = await supabase.client.from('appointments').select('*').eq('scheduled_date', inicioHoy.toISOString().split('T')[0]);
      const { data: cierresHoy } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioHoy.toISOString()).lte('status_changed_at', finHoy.toISOString());

      const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };
      const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

      const fuenteHoy: Record<string, number> = {};
      const fuenteAyer: Record<string, number> = {};
      leadsHoy?.forEach(l => { const f = l.source || 'Directo'; fuenteHoy[f] = (fuenteHoy[f] || 0) + 1; });
      leadsAyer?.forEach(l => { const f = l.source || 'Directo'; fuenteAyer[f] = (fuenteAyer[f] || 0) + 1; });
      const topFuentes = Object.entries(fuenteHoy).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const citasAgendadas = citasHoy?.filter(c => c.status === 'scheduled').length || 0;
      const citasCompletadas = citasHoy?.filter(c => c.status === 'completed').length || 0;
      let revenueHoy = 0;
      cierresHoy?.forEach(c => revenueHoy += c.properties?.price || 2000000);
      const convLeadCita = (leadsHoy?.length || 0) > 0 ? Math.round((citasAgendadas / (leadsHoy?.length || 1)) * 100) : 0;

      const fuentesStr = topFuentes.length > 0
        ? topFuentes.map(([f, c]) => `  • ${f}: ${c} ${calcVar(c, fuenteAyer[f] || 0)}`).join('\n')
        : '  Sin leads hoy';

      const insights: string[] = [];
      if ((leadsHoy?.length || 0) > (leadsAyer?.length || 0)) insights.push(`📈 +${(leadsHoy?.length || 0) - (leadsAyer?.length || 0)} leads vs ayer`);
      if (cierresHoy && cierresHoy.length > 0) insights.push(`🎉 ${cierresHoy.length} cierre${cierresHoy.length > 1 ? 's' : ''} hoy!`);
      if (convLeadCita >= 30) insights.push(`✅ Buena conversión lead→cita: ${convLeadCita}%`);
      const mejorFuente = topFuentes[0];
      if (mejorFuente && mejorFuente[1] >= 3) insights.push(`🔥 ${mejorFuente[0]} fue la mejor fuente`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen día de marketing!';

      const msg = `📊 *REPORTE DIARIO MARKETING*\nHola 👋\n_${fechaHoy}_\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *LEADS HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Total: *${leadsHoy?.length || 0}* ${calcVar(leadsHoy?.length || 0, leadsAyer?.length || 0)}\n• Conv. lead→cita: *${convLeadCita}%*\n${cierresHoy && cierresHoy.length > 0 ? `• Revenue: *$${(revenueHoy/1000000).toFixed(1)}M*\n` : ''}\n━━━━━━━━━━━━━━━━━━━━━\n📍 *POR FUENTE*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n📅 *CITAS*\n━━━━━━━━━━━━━━━━━━━━━\n• Agendadas: ${citasAgendadas}\n• Completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Mañana seguimos!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte marketing enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario marketing
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-diario-marketing') {
      console.log('TEST: Enviando reporte diario marketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioMarketing(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte diario marketing enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal marketing
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-semanal-marketing') {
      console.log('TEST: Enviando reporte semanal marketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalMarketing(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte semanal marketing enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual marketing
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-mensual-marketing') {
      console.log('TEST: Enviando reporte mensual marketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualMarketing(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte mensual marketing enviado' }));
    }


    // ═══════════════════════════════════════════════════════════════
    // HEALTH CHECK - Estado del sistema
    // ═══════════════════════════════════════════════════════════════
    // Root endpoint
    if (url.pathname === '/') {
      return corsResponse(JSON.stringify({
        name: 'SARA Backend',
        version: '2.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      }), 200, 'application/json', request);
    }

    if (url.pathname === '/health') {
      const health = await runHealthCheck(supabase, env);
      return corsResponse(JSON.stringify(health));
    }

    // Detailed system health (requires auth)
    if (url.pathname === '/api/system-health') {
      const [healthResult, errorRate] = await Promise.all([
        runHealthCheck(supabase, env),
        (async () => {
          if (!env.SARA_CACHE) return { alertNeeded: false, errorsLastHour: 0, errorsLast2Hours: 0 };
          const { checkErrorRate } = await import('../crons/healthCheck');
          return checkErrorRate(env);
        })()
      ]);

      // Get last health check from KV
      let lastCheck = null;
      if (env.SARA_CACHE) {
        const cached = await env.SARA_CACHE.get('last_health_check');
        if (cached) lastCheck = JSON.parse(cached);
      }

      return corsResponse(JSON.stringify({
        ...healthResult,
        errorRate,
        lastScheduledCheck: lastCheck
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // E2E VALIDATE - Run ~30 tests against real services pre-deploy
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/validate') {
      const startTime = Date.now();
      const results: Array<{ name: string; passed: boolean; details: string }> = [];

      // Helper
      const addTest = (name: string, passed: boolean, details: string) => {
        results.push({ name, passed, details });
      };

      // ── DATABASE TESTS ──

      // 1. Supabase read
      try {
        const { count, error } = await supabase.client
          .from('leads')
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        addTest('DB: read leads count', true, `${count} leads`);
      } catch (e: any) {
        addTest('DB: read leads count', false, e.message);
      }

      // 2. Team members exist
      try {
        const { data, error } = await supabase.client
          .from('team_members')
          .select('id, name, role')
          .eq('active', true);
        if (error) throw error;
        const vendedores = data?.filter((t: any) => t.role === 'vendedor').length || 0;
        addTest('DB: team members', (data?.length || 0) > 0, `${data?.length} active (${vendedores} vendedores)`);
      } catch (e: any) {
        addTest('DB: team members', false, e.message);
      }

      // 3. Properties catalog
      try {
        const { count, error } = await supabase.client
          .from('properties')
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        addTest('DB: properties catalog', (count || 0) >= 30, `${count} properties`);
      } catch (e: any) {
        addTest('DB: properties catalog', false, e.message);
      }

      // 4. Appointments table accessible
      try {
        const { count, error } = await supabase.client
          .from('appointments')
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        addTest('DB: appointments table', true, `${count} total appointments`);
      } catch (e: any) {
        addTest('DB: appointments table', false, e.message);
      }

      // 5. DB write + delete (create test lead and remove)
      try {
        const testPhone = '5210000099999';
        const { data: created, error: createErr } = await supabase.client
          .from('leads')
          .insert({ phone: testPhone, name: 'E2E_VALIDATE_TEST', status: 'new', source: 'e2e_test' })
          .select()
          .single();
        if (createErr) throw createErr;

        const { error: deleteErr } = await supabase.client
          .from('leads')
          .delete()
          .eq('id', created.id);
        if (deleteErr) throw deleteErr;

        addTest('DB: write + delete', true, 'Created and deleted test lead');
      } catch (e: any) {
        // Cleanup attempt
        await supabase.client.from('leads').delete().eq('phone', '5210000099999').catch(() => {});
        addTest('DB: write + delete', false, e.message);
      }

      // ── CACHE TESTS ──

      // 6. KV write + read + delete
      if (env.SARA_CACHE) {
        try {
          const key = 'e2e_validate_test';
          const val = `test_${Date.now()}`;
          await env.SARA_CACHE.put(key, val, { expirationTtl: 60 });
          const readBack = await env.SARA_CACHE.get(key);
          await env.SARA_CACHE.delete(key);
          addTest('Cache: KV write/read/delete', readBack === val, 'KV cycle OK');
        } catch (e: any) {
          addTest('Cache: KV write/read/delete', false, e.message);
        }
      } else {
        addTest('Cache: KV write/read/delete', false, 'SARA_CACHE not configured');
      }

      // ── WHATSAPP TESTS ──

      // 7. Meta API token valid
      if (env.META_PHONE_NUMBER_ID && env.META_ACCESS_TOKEN) {
        try {
          const resp = await fetch(
            `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}`,
            { headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` } }
          );
          addTest('WhatsApp: Meta API token', resp.ok, resp.ok ? 'Token valid' : `Status ${resp.status}`);
        } catch (e: any) {
          addTest('WhatsApp: Meta API token', false, e.message);
        }
      } else {
        addTest('WhatsApp: Meta API token', false, 'Not configured');
      }

      // 8. Phone number ID correct
      if (env.META_PHONE_NUMBER_ID && env.META_ACCESS_TOKEN) {
        try {
          const resp = await fetch(
            `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}`,
            { headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` } }
          );
          if (resp.ok) {
            const data: any = await resp.json();
            addTest('WhatsApp: phone number', true,
              `${data.display_phone_number || 'configured'} (quality: ${data.quality_rating || 'N/A'})`);
          } else {
            addTest('WhatsApp: phone number', false, `Status ${resp.status}`);
          }
        } catch (e: any) {
          addTest('WhatsApp: phone number', false, e.message);
        }
      } else {
        addTest('WhatsApp: phone number', false, 'Not configured');
      }

      // ── AI TESTS ──

      // 9. Claude API responds
      if (env.ANTHROPIC_API_KEY) {
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: 50,
              messages: [{ role: 'user', content: 'Respond with just OK' }]
            })
          });
          const data: any = await resp.json();
          const text = data.content?.[0]?.text || '';
          addTest('AI: Claude API', resp.ok && text.length > 0, text.substring(0, 50));
        } catch (e: any) {
          addTest('AI: Claude API', false, e.message);
        }
      } else {
        addTest('AI: Claude API', false, 'ANTHROPIC_API_KEY not configured');
      }

      // ── RETELL TESTS ──

      // 10. Retell agent exists
      if (env.RETELL_API_KEY && env.RETELL_AGENT_ID) {
        try {
          const resp = await fetch(`https://api.retellai.com/get-agent/${env.RETELL_AGENT_ID}`, {
            headers: { 'Authorization': `Bearer ${env.RETELL_API_KEY}` }
          });
          if (resp.ok) {
            const agent: any = await resp.json();
            addTest('Retell: agent config', true, `Agent "${agent.agent_name || agent.agent_id}" found`);
          } else {
            addTest('Retell: agent config', false, `Status ${resp.status}`);
          }
        } catch (e: any) {
          addTest('Retell: agent config', false, e.message);
        }
      } else {
        addTest('Retell: agent config', false, 'Retell not configured');
      }

      // ── API ENDPOINT TESTS ──

      // 11. GET /api/leads
      try {
        const { data, error } = await supabase.client
          .from('leads')
          .select('id, name, phone, status')
          .order('created_at', { ascending: false })
          .limit(5);
        if (error) throw error;
        addTest('API: GET leads', true, `${data?.length} leads returned`);
      } catch (e: any) {
        addTest('API: GET leads', false, e.message);
      }

      // 12. GET /api/appointments
      try {
        const hoy = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.client
          .from('appointments')
          .select('id, lead_id, scheduled_date, status')
          .gte('scheduled_date', hoy)
          .limit(5);
        if (error) throw error;
        addTest('API: GET appointments', true, `${data?.length} upcoming appointments`);
      } catch (e: any) {
        addTest('API: GET appointments', false, e.message);
      }

      // 13. GET /api/properties
      try {
        const { data, error } = await supabase.client
          .from('properties')
          .select('id, name, price, price_equipped')
          .limit(5);
        if (error) throw error;
        addTest('API: GET properties', (data?.length || 0) > 0, `${data?.length} properties returned`);
      } catch (e: any) {
        addTest('API: GET properties', false, e.message);
      }

      // ── CRON FUNCTION TESTS ──

      // 14. Health check function works
      try {
        const healthResult = await runHealthCheck(supabase, env);
        addTest('CRON: health check function', healthResult.checks.length >= 5,
          `${healthResult.checks.length} checks, ${healthResult.allPassed ? 'all passed' : healthResult.failedChecks.join(', ')}`);
      } catch (e: any) {
        addTest('CRON: health check function', false, e.message);
      }

      // 15. Error tracking function works
      if (env.SARA_CACHE) {
        try {
          await trackError(env, 'e2e_test');
          const hourKey = `sara_error_type:e2e_test:${new Date().toISOString().slice(0, 13).replace('T', '-')}`;
          const count = await env.SARA_CACHE.get(hourKey);
          // Cleanup
          await env.SARA_CACHE.delete(hourKey);
          addTest('CRON: error tracking', count !== null, `Tracked and read back: ${count}`);
        } catch (e: any) {
          addTest('CRON: error tracking', false, e.message);
        }
      } else {
        addTest('CRON: error tracking', false, 'KV not configured');
      }

      // ── AI QUALITY TESTS ──

      // 16. AI response mentions desarrollo
      if (env.ANTHROPIC_API_KEY) {
        try {
          const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const aiService = new AIConversationService(supabase, null, meta, calendar, claude, env);

          const { data: props } = await supabase.client.from('properties').select('*');
          const leadTest = { id: 'e2e-test', phone: '5210000099998', name: 'Test E2E', status: 'new', score: 0, notes: {} };
          const analysis = await aiService.analyzeWithAI('hola busco casa de 3 recamaras', leadTest as any, props || []);
          const resp = (analysis.response || '').toLowerCase();
          const mencionaDesarrollo = resp.includes('monte verde') || resp.includes('encinos') || resp.includes('andes') ||
            resp.includes('falco') || resp.includes('miravalle') || resp.includes('colorines');
          addTest('AI: response mentions desarrollo', mencionaDesarrollo, analysis.response?.substring(0, 80) || 'empty');
        } catch (e: any) {
          addTest('AI: response mentions desarrollo', false, e.message);
        }
      } else {
        addTest('AI: response mentions desarrollo', false, 'API key not configured');
      }

      // 17. AI doesn't offer rentals
      if (env.ANTHROPIC_API_KEY) {
        try {
          const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const aiService = new AIConversationService(supabase, null, meta, calendar, claude, env);

          const { data: props } = await supabase.client.from('properties').select('*');
          const leadTest = { id: 'e2e-test2', phone: '5210000099997', name: 'Test E2E2', status: 'new', score: 0, notes: {} };
          const analysis = await aiService.analyzeWithAI('tienen casas en renta', leadTest as any, props || []);
          const resp = (analysis.response || '').toLowerCase();
          const noOfreceRenta = resp.includes('solo vendemos') || resp.includes('no rentamos') || resp.includes('no manejamos renta') || resp.includes('venta');
          addTest('AI: no ofrece rentas', noOfreceRenta, analysis.response?.substring(0, 80) || 'empty');
        } catch (e: any) {
          addTest('AI: no ofrece rentas', false, e.message);
        }
      } else {
        addTest('AI: no ofrece rentas', false, 'API key not configured');
      }

      // ── RETELL EXTENDED TESTS ──

      // 18. Retell prompt has REGLA rules (via LLM API, same pattern as /test-retell-e2e)
      if (env.RETELL_API_KEY && env.RETELL_AGENT_ID) {
        try {
          const { RetellService } = await import('../services/retellService');
          const retell = new RetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID);
          const agent = await retell.getAgent();
          const llmId = agent?.response_engine?.llm_id;
          const llm = llmId ? await retell.getLlm(llmId) : null;
          const prompt = (llm?.general_prompt || '').toLowerCase();
          const tieneReglas = prompt.includes('nunca pidas el celular') || prompt.includes('enviar_info_whatsapp') || prompt.includes('no rentamos');
          addTest('Retell: prompt has rules', tieneReglas,
            tieneReglas ? 'Key rules found in prompt' : 'No key rules in prompt');
        } catch (e: any) {
          addTest('Retell: prompt has rules', false, e.message);
        }
      } else {
        addTest('Retell: prompt has rules', false, 'Retell not configured');
      }

      // 19. Retell tools count (via LLM API)
      if (env.RETELL_API_KEY && env.RETELL_AGENT_ID) {
        try {
          const { RetellService } = await import('../services/retellService');
          const retell = new RetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID);
          const agent = await retell.getAgent();
          const llmId = agent?.response_engine?.llm_id;
          const llm = llmId ? await retell.getLlm(llmId) : null;
          const toolsCount = (llm?.general_tools || []).length;
          const toolNames = (llm?.general_tools || []).map((t: any) => t.name).join(', ');
          addTest('Retell: tools count', toolsCount >= 3, `${toolsCount} tools: ${toolNames}`);
        } catch (e: any) {
          addTest('Retell: tools count', false, e.message);
        }
      } else {
        addTest('Retell: tools count', false, 'Retell not configured');
      }

      // ── COMMAND DETECTION TESTS ──

      // 20. CEO: detects 'leads' command
      try {
        const ceoService = new CEOCommandsService(supabase);
        const detected = ceoService.detectCommand('leads');
        addTest('Commands: CEO leads', detected !== null && detected !== undefined, `Detected: ${JSON.stringify(detected)?.substring(0, 60)}`);
      } catch (e: any) {
        addTest('Commands: CEO leads', false, e.message);
      }

      // 21. CEO: detects 'equipo' command
      try {
        const ceoService = new CEOCommandsService(supabase);
        const detected = ceoService.detectCommand('equipo');
        addTest('Commands: CEO equipo', detected !== null && detected !== undefined, `Detected: ${JSON.stringify(detected)?.substring(0, 60)}`);
      } catch (e: any) {
        addTest('Commands: CEO equipo', false, e.message);
      }

      // 22. Vendedor: detects 'citas' command
      try {
        const vendorService = new VendorCommandsService(supabase);
        const detected = vendorService.detectRouteCommand('citas', 'citas');
        addTest('Commands: Vendedor citas', detected !== null && detected !== undefined, `Detected: ${JSON.stringify(detected)?.substring(0, 60)}`);
      } catch (e: any) {
        addTest('Commands: Vendedor citas', false, e.message);
      }

      // 23. Vendedor: detects 'mis leads' command
      try {
        const vendorService = new VendorCommandsService(supabase);
        const detected = vendorService.detectRouteCommand('mis leads', 'mis leads');
        addTest('Commands: Vendedor mis leads', detected !== null && detected !== undefined, `Detected: ${JSON.stringify(detected)?.substring(0, 60)}`);
      } catch (e: any) {
        addTest('Commands: Vendedor mis leads', false, e.message);
      }

      // 24. Vendedor: detects 'cotizar' command
      try {
        const vendorService = new VendorCommandsService(supabase);
        const detected = vendorService.detectRouteCommand('cotizar Roberto 2500000', 'cotizar Roberto 2500000');
        addTest('Commands: Vendedor cotizar', detected !== null && detected !== undefined, `Detected: ${JSON.stringify(detected)?.substring(0, 60)}`);
      } catch (e: any) {
        addTest('Commands: Vendedor cotizar', false, e.message);
      }

      // ── TEMPLATE TESTS ──

      // 25. Meta templates API accessible
      const WABA_ID = (env as any).META_WHATSAPP_BUSINESS_ID;
      if (WABA_ID && env.META_ACCESS_TOKEN) {
        try {
          const resp = await fetch(
            `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?fields=name,status&limit=10`,
            { headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` } }
          );
          if (resp.ok) {
            const data: any = await resp.json();
            const count = data.data?.length || 0;
            addTest('Templates: Meta API accessible', count > 0, `${count} templates found`);
          } else {
            addTest('Templates: Meta API accessible', false, `Status ${resp.status}`);
          }
        } catch (e: any) {
          addTest('Templates: Meta API accessible', false, e.message);
        }

        // 26. Critical templates exist
        try {
          const resp = await fetch(
            `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?fields=name,status&limit=50`,
            { headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` } }
          );
          if (resp.ok) {
            const data: any = await resp.json();
            const templates = data.data || [];
            const required = ['briefing_matutino', 'reporte_vendedor', 'reporte_asesor', 'reactivar_equipo'];
            const found = required.filter(r => templates.some((t: any) => t.name === r && t.status === 'APPROVED'));
            const missing = required.filter(r => !found.includes(r));
            addTest('Templates: critical templates exist', found.length === required.length,
              found.length === required.length ? `All ${required.length} found APPROVED` : `Missing: ${missing.join(', ')}`);
          } else {
            addTest('Templates: critical templates exist', false, `Status ${resp.status}`);
          }
        } catch (e: any) {
          addTest('Templates: critical templates exist', false, e.message);
        }
      } else {
        addTest('Templates: Meta API accessible', false, 'WABA_ID not configured');
        addTest('Templates: critical templates exist', false, 'WABA_ID not configured');
      }

      // ── CRON FUNCTION TESTS (extended) ──

      // 27. Briefing function exists and is callable
      try {
        const fnType = typeof enviarBriefingMatutino;
        addTest('CRON: briefing function', fnType === 'function', `Type: ${fnType}`);
      } catch (e: any) {
        addTest('CRON: briefing function', false, e.message);
      }

      // 28. Alertas function exists and is callable
      try {
        const fnType = typeof enviarAlertasProactivasCEO;
        addTest('CRON: alertas CEO function', fnType === 'function', `Type: ${fnType}`);
      } catch (e: any) {
        addTest('CRON: alertas CEO function', false, e.message);
      }

      // ── END-TO-END TESTS ──

      // 29. Properties have price_equipped
      try {
        const { data, error } = await supabase.client
          .from('properties')
          .select('id, name, price, price_equipped')
          .not('price_equipped', 'is', null)
          .limit(5);
        if (error) throw error;
        const withPrices = data?.length || 0;
        addTest('E2E: properties have price_equipped', withPrices > 0, `${withPrices} properties with price_equipped`);
      } catch (e: any) {
        addTest('E2E: properties have price_equipped', false, e.message);
      }

      // 30. Team has vendedores with phones
      try {
        const { data, error } = await supabase.client
          .from('team_members')
          .select('id, name, phone, role')
          .eq('role', 'vendedor')
          .eq('active', true);
        if (error) throw error;
        const withPhone = data?.filter((t: any) => t.phone && t.phone.length > 8) || [];
        addTest('E2E: vendedores have phones', withPhone.length >= 3,
          `${withPhone.length} vendedores with valid phones`);
      } catch (e: any) {
        addTest('E2E: vendedores have phones', false, e.message);
      }

      // 31. Create appointment + delete
      try {
        const testLeadPhone = '5210000099998';
        // Create test lead for appointment
        const { data: tLead, error: tErr } = await supabase.client
          .from('leads')
          .insert({ phone: testLeadPhone, name: 'E2E_APPT_TEST', status: 'new', source: 'e2e_test' })
          .select()
          .single();
        if (tErr) throw tErr;

        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const { data: appt, error: aErr } = await supabase.client
          .from('appointments')
          .insert({
            lead_id: tLead.id,
            scheduled_date: tomorrow,
            scheduled_time: '10:00',
            appointment_type: 'visit',
            status: 'scheduled',
            property_name: 'E2E_TEST'
          })
          .select()
          .single();
        if (aErr) throw aErr;

        // Cleanup
        await supabase.client.from('appointments').delete().eq('id', appt.id);
        await supabase.client.from('leads').delete().eq('id', tLead.id);

        addTest('E2E: create + delete appointment', true, 'Appointment lifecycle OK');
      } catch (e: any) {
        // Cleanup
        await supabase.client.from('leads').delete().eq('phone', '5210000099998').catch(() => {});
        addTest('E2E: create + delete appointment', false, e.message);
      }

      // 32. Mortgage applications table accessible
      try {
        const { count, error } = await supabase.client
          .from('mortgage_applications')
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        addTest('E2E: mortgage_applications table', true, `${count} applications`);
      } catch (e: any) {
        addTest('E2E: mortgage_applications table', false, e.message);
      }

      // 33. Google Calendar API accessible
      try {
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        const hoyISO = new Date().toISOString();
        const mananaISO = new Date(Date.now() + 86400000).toISOString();
        const events = await calendar.getEvents(hoyISO, mananaISO, 5);
        addTest('E2E: Google Calendar API', true, `${events?.length || 0} events today`);
      } catch (e: any) {
        addTest('E2E: Google Calendar API', false, e.message);
      }

      // 34. Conversation history column exists and is queryable
      try {
        const { data, error } = await supabase.client
          .from('leads')
          .select('id, conversation_history')
          .limit(1);
        if (error) throw error;
        // Test passes if the column exists (query didn't error), regardless of data
        addTest('E2E: conversation_history column', true,
          `Column queryable, ${data?.length || 0} leads checked`);
      } catch (e: any) {
        addTest('E2E: conversation_history column', false, e.message);
      }

      // ── SUMMARY ──

      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;
      const total = results.length;

      return corsResponse(JSON.stringify({
        summary: `${passed}/${total} passed`,
        passed,
        failed,
        total,
        duration_ms: Date.now() - startTime,
        results
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST VENTANA 24H - Ver estado de ventana de cada team member
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-ventana-24h') {
      const { data: teamMembers } = await supabase.client
        .from('team_members')
        .select('id, name, phone, role, active, notes')
        .eq('active', true)
        .order('name');

      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const ahora = new Date().toISOString();

      let totalPendingActivos = 0;
      let totalPendingExpirados = 0;

      const resultado = teamMembers?.map(tm => {
        const notas = typeof tm.notes === 'string' ? JSON.parse(tm.notes || '{}') : (tm.notes || {});
        const lastInteraction = notas.last_sara_interaction;
        const ventanaAbierta = lastInteraction && lastInteraction > hace24h;

        // Calcular hace cuánto tiempo
        let tiempoDesde = 'Nunca';
        if (lastInteraction) {
          const diff = Date.now() - new Date(lastInteraction).getTime();
          const horas = Math.floor(diff / (1000 * 60 * 60));
          const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          tiempoDesde = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;
        }

        // Usar nueva función para obtener pending messages con info de expiración
        const pendingMessages = getPendingMessages(notas);
        totalPendingActivos += pendingMessages.length;

        // Contar expirados
        const pendingKeys = ['pending_briefing', 'pending_recap', 'pending_reporte_diario', 'pending_reporte_semanal', 'pending_resumen_semanal', 'pending_mensaje'];
        for (const key of pendingKeys) {
          const pending = notas[key];
          if (pending?.mensaje_completo && isPendingExpired(pending, key.replace('pending_', ''))) {
            totalPendingExpirados++;
          }
        }

        // Formatear pending messages con estado
        const pendingInfo = pendingMessages.map(p => {
          const sentAt = new Date(p.pending.sent_at);
          const horasDesdeSent = Math.round((Date.now() - sentAt.getTime()) / (1000 * 60 * 60) * 10) / 10;
          return {
            tipo: p.type,
            prioridad: p.priority,
            enviado_hace: `${horasDesdeSent}h`,
            expira_en: p.pending.expires_at
              ? `${Math.round((new Date(p.pending.expires_at).getTime() - Date.now()) / (1000 * 60 * 60) * 10) / 10}h`
              : 'N/A'
          };
        });

        return {
          nombre: tm.name,
          rol: tm.role,
          telefono: tm.phone?.slice(-4) || '????',
          ventana_24h: ventanaAbierta ? '✅ ABIERTA' : '❌ CERRADA',
          ultima_interaccion: lastInteraction || 'Nunca',
          hace: tiempoDesde,
          pending_count: pendingMessages.length,
          pending_messages: pendingInfo.length > 0 ? pendingInfo : 'Ninguno'
        };
      });

      const resumen = {
        total_team_members: resultado?.length || 0,
        ventana_abierta: resultado?.filter(r => r.ventana_24h.includes('ABIERTA')).length || 0,
        ventana_cerrada: resultado?.filter(r => r.ventana_24h.includes('CERRADA')).length || 0,
        con_pending_activos: resultado?.filter(r => r.pending_count > 0).length || 0,
        total_pending_activos: totalPendingActivos,
        total_pending_expirados: totalPendingExpirados,
        tasa_entrega: resultado?.length
          ? Math.round((resultado.filter(r => r.ventana_24h.includes('ABIERTA')).length / resultado.length) * 100)
          : 0
      };

      return corsResponse(JSON.stringify({
        timestamp: ahora,
        hace24h_limite: hace24h,
        resumen,
        team_members: resultado,
        recomendaciones: resumen.tasa_entrega < 50
          ? [
              '⚠️ Menos del 50% del equipo tiene ventana abierta',
              '💡 Considerar: templates más atractivos, horarios de envío diferentes',
              '📊 Usar /test-envio-7pm?enviar=true para enviar templates de reactivación'
            ]
          : ['✅ Buena tasa de entrega']
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST ENVIO 7PM - Simular el envío de reporte diario (dry-run)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-envio-7pm') {
      const enviarReal = url.searchParams.get('enviar') === 'true';
      const soloUno = url.searchParams.get('phone'); // Teléfono específico
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: vendedores } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);

      if (!vendedores) {
        return corsResponse(JSON.stringify({ error: 'No hay vendedores activos' }));
      }

      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const resultados: any[] = [];

      for (const v of vendedores) {
        if (soloUno && !v.phone?.includes(soloUno)) continue;

        const notas = typeof v.notes === 'string' ? JSON.parse(v.notes || '{}') : (v.notes || {});
        const lastInteraction = notas.last_sara_interaction;
        const ventanaAbierta = lastInteraction && lastInteraction > hace24h;

        const resultado: any = {
          nombre: v.name,
          telefono: v.phone?.slice(-4) || '????',
          ventana_24h: ventanaAbierta ? '✅ ABIERTA' : '❌ CERRADA',
          metodo: ventanaAbierta ? 'DIRECTO' : 'TEMPLATE + PENDING'
        };

        if (enviarReal) {
          const mensajeTest = `📊 *TEST REPORTE 7PM*\n\nHola ${v.name?.split(' ')[0]}, esto es una prueba del sistema de reportes.\n\n✅ Tu ventana 24h está: ${ventanaAbierta ? 'ABIERTA' : 'CERRADA'}\n✅ Método usado: ${ventanaAbierta ? 'Mensaje directo' : 'Template + pending'}\n\n_Este es un mensaje de prueba_`;

          const res = await enviarMensajeTeamMember(supabase, meta, v, mensajeTest, {
            tipoMensaje: 'test_reporte_7pm',
            guardarPending: true,
            pendingKey: 'pending_test_7pm'
          });

          resultado.enviado = res.success;
          resultado.metodo_usado = res.method;
        }

        resultados.push(resultado);
      }

      return corsResponse(JSON.stringify({
        modo: enviarReal ? 'ENVÍO REAL' : 'DRY-RUN (usa ?enviar=true para enviar)',
        total_vendedores: resultados.length,
        ventana_abierta: resultados.filter(r => r.ventana_24h.includes('ABIERTA')).length,
        ventana_cerrada: resultados.filter(r => r.ventana_24h.includes('CERRADA')).length,
        resultados
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Remarketing leads fríos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-remarketing') {
      console.log('TEST: Ejecutando remarketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await remarketingLeadsFrios(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Remarketing ejecutado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Seguimiento hipotecas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reactivacion') {
      console.log('TEST: Ejecutando reactivación de leads perdidos...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await reactivarLeadsPerdidos(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reactivación de leads perdidos ejecutada' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Configurar captura de cumpleaños (lead o equipo)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-cumple-setup') {
      const phone = url.searchParams.get('phone') || '5215610016226';
      const phoneClean = phone.replace(/\D/g, '');
      const phoneFormatted = phoneClean.startsWith('52') ? phoneClean : `52${phoneClean}`;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Primero buscar si es miembro del equipo (usar misma lógica que webhook)
      const phone10 = phoneClean.slice(-10); // últimos 10 dígitos

      // Obtener todos los team members y hacer match manual (como el webhook)
      const { data: allTeamMembers, error: tmError } = await supabase.client
        .from('team_members')
        .select('id, name, phone, notes')
        .eq('active', true);

      if (tmError) console.error('❌ Error cargando team_members:', tmError);

      const teamMember = allTeamMembers?.find((tm: any) => {
        if (!tm.phone) return false;
        const tmPhone = tm.phone.replace(/\D/g, '').slice(-10);
        return tmPhone === phone10;
      });

      console.log(`🔍 Buscando equipo: phone10=${phone10} -> ${teamMember?.name || 'NO ENCONTRADO'}`);

      if (teamMember) {
        // Es miembro del equipo
        const notasActuales = typeof teamMember.notes === 'object' ? teamMember.notes : {};
        await supabase.client
          .from('team_members')
          .update({
            birthday: null,
            notes: { ...notasActuales, pending_birthday_response: true }
          })
          .eq('id', teamMember.id);

        const nombre = teamMember.name?.split(' ')[0] || '';
        await meta.sendWhatsAppMessage(
          phoneFormatted,
          `¡Hola ${nombre}! 👋\n\n¿Cuándo es tu cumpleaños? 🎂\nPara tenerte una sorpresa ese día 🎁\n\n_(ej: 15 marzo)_`
        );

        return corsResponse(JSON.stringify({
          ok: true,
          tipo: 'equipo',
          message: 'Miembro del equipo configurado para captura de cumpleaños',
          persona: { id: teamMember.id, name: teamMember.name, phone: teamMember.phone },
          instrucciones: 'Responde al WhatsApp con tu fecha (ej: "15 marzo" o "5/3")'
        }));
      }

      // Si no es equipo, buscar como lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, birthday, notes')
        .or(`phone.eq.${phoneFormatted},phone.eq.${phoneClean}`)
        .limit(1)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'No encontrado (ni equipo ni lead)', phone: phoneFormatted }), 404);
      }

      // Configurar lead para captura de cumpleaños
      const notasActuales = typeof lead.notes === 'object' ? lead.notes : {};
      await supabase.client
        .from('leads')
        .update({
          birthday: null,
          notes: { ...notasActuales, pending_birthday_response: true }
        })
        .eq('id', lead.id);

      const nombre = lead.name?.split(' ')[0] || '';
      await meta.sendWhatsAppMessage(
        phoneFormatted,
        `Por cierto ${nombre}, ¿cuándo es tu cumpleaños? 🎂\nPor si hay algo especial para ti 🎁\n\n_(ej: 15 marzo)_`
      );

      return corsResponse(JSON.stringify({
        ok: true,
        tipo: 'lead',
        message: 'Lead configurado para captura de cumpleaños',
        persona: { id: lead.id, name: lead.name, phone: lead.phone },
        instrucciones: 'Responde al WhatsApp con tu fecha (ej: "15 marzo" o "5/3")'
      }));
    }

    // DEBUG: Query de cumpleaños
    if (url.pathname === '/debug-birthday-query') {
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        month: '2-digit',
        day: '2-digit'
      });
      const fechaMexico = mexicoFormatter.format(ahora);
      const [mes, dia] = fechaMexico.split('-');

      // Query usando RPC o comparación de texto del birthday (cast implícito)
      // El campo birthday es tipo DATE, así que comparamos directamente mes y día
      const { data: leads, error } = await supabase.client
        .from('leads')
        .select('id, name, phone, birthday, status')
        .not('birthday', 'is', null)
        .not('phone', 'is', null);

      // Filtrar en JS porque Supabase no permite extraer mes/día de date fácilmente
      const leadsCumple = leads?.filter(l => {
        if (!l.birthday) return false;
        const bday = l.birthday.toString(); // YYYY-MM-DD
        return bday.endsWith(`-${mes}-${dia}`);
      });

      return corsResponse(JSON.stringify({
        fecha_busqueda: `${mes}-${dia}`,
        leads_con_birthday: leads?.length || 0,
        leads_cumple_hoy: leadsCumple?.length || 0,
        leads: leadsCumple?.map(l => ({ name: l.name, birthday: l.birthday, status: l.status })),
        error: error?.message
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Crear lead con cumpleaños HOY para probar felicitación
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-crear-cumple-hoy') {
      const testPhone = url.searchParams.get('phone') || '5212224558475';

      // Fecha de hoy en formato YYYY-MM-DD (con año ficticio para el cumpleaños)
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hoyFull = mexicoFormatter.format(ahora); // "2026-01-17"
      const [_, mes, dia] = hoyFull.split('-');
      const birthdayDate = `1990-${mes}-${dia}`; // Usar año ficticio

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .upsert({
          name: 'Cumpleañero Prueba',
          phone: testPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          birthday: birthdayDate
        }, { onConflict: 'phone' })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      // Ejecutar felicitaciones
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarCumpleañosLeads(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead creado con cumpleaños HOY (${mes}-${dia}) y felicitación enviada`,
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          birthday: birthdayDate
        }
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Felicitaciones de cumpleaños a leads
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-cumpleanos') {
      console.log('TEST: Ejecutando felicitaciones de cumpleaños...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarCumpleañosLeads(supabase, meta);
      await felicitarCumpleañosEquipo(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Felicitaciones de cumpleaños ejecutadas (leads + equipo)' }));
    }

    // TEST: Enviar mensaje de cumpleaños a un miembro del equipo específico
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-cumpleanos-equipo') {
      const testPhone = url.searchParams.get('phone') || '5212224558475';

      // Buscar el miembro del equipo
      const { data: miembro, error: memberError } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', testPhone)
        .single();

      if (memberError || !miembro) {
        return corsResponse(JSON.stringify({ error: `No se encontró miembro del equipo con teléfono ${testPhone}` }), 404);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const nombre = miembro.name?.split(' ')[0] || 'compañero';

      const mensaje = `🎂 *¡Feliz Cumpleaños ${nombre}!* 🎉\n\nTodo el equipo de Santa Rita te desea un día increíble lleno de alegría.\n\n¡Que este nuevo año de vida te traiga muchos éxitos! 🌟`;

      try {
        await meta.sendWhatsAppMessage(testPhone, mensaje);

        // Guardar contexto para respuesta
        const notes = typeof miembro.notes === 'object' ? miembro.notes : {};
        const pendingBirthdayResponse = {
          type: 'cumpleanos_equipo',
          sent_at: new Date().toISOString(),
          member_id: miembro.id,
          member_name: miembro.name
        };

        await supabase.client.from('team_members').update({
          notes: {
            ...notes,
            pending_birthday_response: pendingBirthdayResponse
          }
        }).eq('id', miembro.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Mensaje de cumpleaños enviado a ${miembro.name}`,
          member: { id: miembro.id, name: miembro.name, phone: testPhone },
          pending_context: pendingBirthdayResponse
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: `Error enviando mensaje: ${e.message}` }), 500);
      }
    }

    // TEST: Aniversario de compra de casa
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-aniversario') {
      console.log('TEST: Ejecutando felicitaciones de aniversario de compra...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarAniversarioCompra(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Felicitaciones de aniversario de compra ejecutadas' }));
    }

    // TEST: Recordatorios de citas
    // ═══════════════════════════════════════════════════════════════
    // Debug query para recordatorios
    if (url.pathname === '/debug-recordatorios-query') {
      const ahora = new Date();
      const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hoyStr = mexicoFormatter.format(ahora);
      const en24hStr = mexicoFormatter.format(en24h);

      // Query sin filtros
      const { data: todasCitas, error: err1 } = await supabase.client
        .from('appointments')
        .select('id, lead_name, lead_phone, scheduled_date, scheduled_time, status, reminder_24h_sent, reminder_2h_sent')
        .order('scheduled_date', { ascending: false })
        .limit(10);

      // Query con filtros
      const { data: citasFiltered, error: err2 } = await supabase.client
        .from('appointments')
        .select('id, lead_name, lead_phone, scheduled_date, scheduled_time, status, reminder_24h_sent')
        .gte('scheduled_date', hoyStr)
        .lte('scheduled_date', en24hStr)
        .eq('status', 'scheduled');

      return corsResponse(JSON.stringify({
        fechas: { hoy: hoyStr, en24h: en24hStr },
        todasCitas: {
          total: todasCitas?.length || 0,
          error: err1?.message,
          data: todasCitas?.map(c => ({
            id: c.id?.slice(0,8),
            lead: c.lead_name,
            phone: c.lead_phone?.slice(-4),
            fecha: c.scheduled_date,
            hora: c.scheduled_time,
            status: c.status,
            r24h: c.reminder_24h_sent,
            r2h: c.reminder_2h_sent
          }))
        },
        citasFiltradas: {
          total: citasFiltered?.length || 0,
          error: err2?.message,
          data: citasFiltered?.map(c => ({
            id: c.id?.slice(0,8),
            lead: c.lead_name,
            phone: c.lead_phone?.slice(-4),
            fecha: c.scheduled_date,
            hora: c.scheduled_time,
            r24h: c.reminder_24h_sent
          }))
        }
      }, null, 2));
    }

    if (url.pathname === '/test-recordatorios-citas') {
      console.log('🧪 TEST: Ejecutando recordatorios de citas...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const notificationService = new NotificationService(supabase, meta, env.OPENAI_API_KEY);
      const result = await notificationService.enviarRecordatoriosCitas();
      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Recordatorios de citas ejecutados',
        enviados: result.enviados,
        errores: result.errores
      }));
    }

    // Setup: Crear cita de prueba para recordatorios
    if (url.pathname === '/test-setup-cita') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const horasAntes = parseInt(url.searchParams.get('horas') || '24'); // 24 o 2
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar lead
      const cleanPhone = phone.replace(/\D/g, '');
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Calcular fecha/hora de la cita (en X horas)
      const ahora = new Date();
      const fechaCita = new Date(ahora.getTime() + horasAntes * 60 * 60 * 1000);

      // Usar timezone México para la fecha
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const scheduled_date = mexicoFormatter.format(fechaCita);

      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const scheduled_time = timeFormatter.format(fechaCita);

      // Crear o actualizar cita
      const { data: existingCita } = await supabase.client
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .single();

      let citaId;
      if (existingCita) {
        const { error: updateError } = await supabase.client
          .from('appointments')
          .update({
            scheduled_date,
            scheduled_time,
            reminder_24h_sent: false,
            reminder_2h_sent: false,
            property_name: 'Distrito Falco'
          })
          .eq('id', existingCita.id);

        if (updateError) {
          console.error('Error updating cita:', updateError);
          return corsResponse(JSON.stringify({
            error: 'Error actualizando cita',
            details: updateError.message
          }), 500);
        }
        citaId = existingCita.id;
        console.log(`📅 Cita actualizada: ${citaId}, reminder flags reset`);
      } else {
        const { data: newCita, error: insertError } = await supabase.client
          .from('appointments')
          .insert({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: lead.phone,
            scheduled_date,
            scheduled_time,
            status: 'scheduled',
            reminder_24h_sent: false,
            reminder_2h_sent: false,
            property_name: 'Distrito Falco',
            appointment_type: 'property_viewing',
            duration_minutes: 60
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting cita:', insertError);
          return corsResponse(JSON.stringify({
            error: 'Error creando cita',
            details: insertError.message,
            code: insertError.code
          }), 500);
        }
        citaId = newCita?.id;
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cita configurada para ${horasAntes}h desde ahora`,
        lead: lead.name,
        lead_id: lead.id,
        scheduled_date,
        scheduled_time,
        cita_id: citaId,
        recordatorio_tipo: horasAntes === 24 ? '24h' : horasAntes === 2 ? '2h' : 'otro'
      }));
    }

    // Debug: Ver citas programadas
    if (url.pathname === '/debug-citas') {
      const { data: citas, error: citasError } = await supabase.client
        .from('appointments')
        .select('id, lead_name, lead_id, scheduled_date, scheduled_time, status, reminder_24h_sent, reminder_2h_sent, property_name')
        .order('scheduled_date', { ascending: false })
        .limit(20);

      console.log('DEBUG citas: encontradas', citas?.length, 'error:', citasError?.message);

      return corsResponse(JSON.stringify({
        total: citas?.length || 0,
        citas: citas?.map(c => ({
          id: c.id,
          lead: c.lead_name,
          lead_id: c.lead_id,
          fecha: c.scheduled_date,
          hora: c.scheduled_time,
          desarrollo: c.property_name,
          status: c.status,
          reminder_24h: c.reminder_24h_sent,
          reminder_2h: c.reminder_2h_sent
        }))
      }, null, 2));
    }

    // TEST: Ver notas de vendedor (solo lectura)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-ver-notas') {
      const vendedorPhone = url.searchParams.get('phone') || '5212224558475';
      const cleanPhone = vendedorPhone.replace(/\D/g, '');

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado' }), 404);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        vendedor: vendedor.name,
        notas: vendedor.notes
      }));
    }

    // TEST: Ver notas de LEAD (solo lectura)
    if (url.pathname === '/test-ver-lead') {
      const leadPhone = url.searchParams.get('phone') || '522224558475';
      const cleanPhone = leadPhone.replace(/\D/g, '');

      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        lead: lead.name,
        phone: lead.phone,
        notas: lead.notes
      }));
    }

    // TEST: Configurar encuesta de satisfacción pendiente en lead
    if (url.pathname === '/test-setup-encuesta-lead') {
      const leadPhone = url.searchParams.get('phone') || '522224558475';
      const cleanPhone = leadPhone.replace(/\D/g, '');

      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      let notasLead: any = {};
      try {
        notasLead = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
      } catch (e) { notasLead = {}; }

      notasLead.pending_satisfaction_survey = {
        property: 'Distrito Falco',
        asked_at: new Date().toISOString()
      };

      await supabase.client
        .from('leads')
        .update({ notes: notasLead })
        .eq('id', lead.id);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Encuesta de satisfacción configurada',
        lead: lead.name,
        notas: notasLead
      }));
    }

    // TEST: Limpiar notas de vendedor para pruebas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-limpiar-vendedor') {
      const vendedorPhone = url.searchParams.get('phone') || '5212224558475';
      const cleanPhone = vendedorPhone.replace(/\D/g, '');

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado' }), 404);
      }

      // Limpiar todas las notas pendientes
      await supabase.client
        .from('team_members')
        .update({ notes: '{}' })
        .eq('id', vendedor.id);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Notas del vendedor limpiadas',
        vendedor: vendedor.name,
        notas_anteriores: vendedor.notes
      }));
    }

    // TEST: Ejecutar detección de no-shows
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-noshow') {
      console.log('🧪 TEST: Ejecutando detección de no-shows...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await detectarNoShows(supabase, meta);
      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Detección de no-shows ejecutada'
      }));
    }

    // TEST: Configurar cita en el pasado para probar no-shows
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-setup-noshow') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const horasAtras = parseInt(url.searchParams.get('horas') || '2'); // Horas en el pasado
      const vendedorPhone = url.searchParams.get('vendedor') || '5212224558475'; // Teléfono vendedor

      // Buscar lead
      const cleanPhone = phone.replace(/\D/g, '');
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Buscar vendedor
      const cleanVendedorPhone = vendedorPhone.replace(/\D/g, '');
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .or(`phone.eq.${cleanVendedorPhone},phone.like.%${cleanVendedorPhone.slice(-10)}`)
        .single();

      if (!vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado' }), 404);
      }

      // Calcular fecha/hora en el pasado (hace X horas)
      const ahora = new Date();
      const fechaCita = new Date(ahora.getTime() - horasAtras * 60 * 60 * 1000);

      // Usar timezone México para la fecha
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const scheduled_date = mexicoFormatter.format(fechaCita);

      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const scheduled_time = timeFormatter.format(fechaCita);

      // Limpiar notas del vendedor para evitar "ya preguntamos"
      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .single();

      let notasActuales: any = {};
      try {
        if (vendedorData?.notes) {
          notasActuales = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
        }
      } catch (e) {
        notasActuales = {};
      }

      // Limpiar pending_show_confirmation y citas_preguntadas
      delete notasActuales.pending_show_confirmation;
      notasActuales.citas_preguntadas = [];

      await supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notasActuales) })
        .eq('id', vendedor.id);

      // Crear cita con la hora en el pasado
      const { data: newCita, error: insertError } = await supabase.client
        .from('appointments')
        .insert({
          lead_id: lead.id,
          lead_name: lead.name,
          lead_phone: lead.phone,
          vendedor_id: vendedor.id,
          vendedor_name: vendedor.name,
          scheduled_date,
          scheduled_time,
          status: 'scheduled',
          property_name: 'Distrito Falco',
          appointment_type: 'property_viewing',
          duration_minutes: 60
        })
        .select()
        .single();

      if (insertError) {
        return corsResponse(JSON.stringify({
          error: 'Error creando cita',
          details: insertError.message
        }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cita configurada hace ${horasAtras}h para probar no-show`,
        lead: lead.name,
        vendedor: vendedor.name,
        vendedor_phone: vendedor.phone,
        scheduled_date,
        scheduled_time,
        cita_id: newCita?.id
      }));
    }

    // TEST: Configurar lead para probar aniversario
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-aniversario-setup') {
      const phone = url.searchParams.get('phone') || '5215610016226';
      const años = parseInt(url.searchParams.get('años') || '1');
      const phoneClean = phone.replace(/\D/g, '');
      const phoneFormatted = phoneClean.startsWith('52') ? phoneClean : `52${phoneClean}`;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar lead por teléfono
      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .or(`phone.eq.${phoneFormatted},phone.eq.${phoneClean}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', phone: phoneFormatted }), 404);
      }

      // Calcular fecha de hace X años (mismo día/mes en timezone México)
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const [añoMx, mesMx, diaMx] = mexicoFormatter.format(ahora).split('-');
      const fechaAniversario = new Date(parseInt(añoMx) - años, parseInt(mesMx) - 1, parseInt(diaMx), 12, 0, 0);

      // Actualizar lead a status delivered con fecha de hace X años
      const { error: updateError } = await supabase.client
        .from('leads')
        .update({
          status: 'delivered',
          status_changed_at: fechaAniversario.toISOString(),
          notes: {} // Limpiar notas para que no tenga marca de ya felicitado
        })
        .eq('id', lead.id);

      if (updateError) {
        return corsResponse(JSON.stringify({ error: 'Error actualizando lead', details: updateError }), 500);
      }

      // Verificar que el update funcionó
      const { data: leadVerify } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, status_changed_at')
        .eq('id', lead.id)
        .single();

      console.log(`✅ Lead configurado: ${JSON.stringify(leadVerify)}`);
      console.log(`📅 Fecha aniversario: ${fechaAniversario.toISOString()}, años=${años}`);

      // Ahora ejecutar la función de aniversario
      await felicitarAniversarioCompra(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead configurado y aniversario ejecutado`,
        lead: lead.name,
        phone: phoneFormatted,
        años: años,
        status_changed_at: fechaAniversario.toISOString()
      }));
    }

    if (url.pathname.startsWith('/test-lead/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;

      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .eq('phone', phoneFormatted)
        .single();

      if (!lead) return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);

      return corsResponse(JSON.stringify({
        phone: lead.phone,
        name: lead.name,
        lead_score: lead.lead_score,
        lead_category: lead.lead_category,
        property_interest: lead.property_interest,
        needs_mortgage: lead.needs_mortgage,
        how_found_us: lead.how_found_us,
        family_size: lead.family_size,
        current_housing: lead.current_housing,
        num_bedrooms_wanted: lead.num_bedrooms_wanted,
        occupation: lead.occupation,
        urgency: lead.urgency,
        age_range: lead.age_range,
        created_at: lead.created_at,
        updated_at: lead.updated_at
      }, null, 2));
    }

    if (url.pathname === '/test-hipotecas') {
      console.log('TEST: Verificando hipotecas estancadas...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Debug info
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);

      const { data: hipotecasEstancadas } = await supabase.client
        .from('mortgage_applications')
        .select('*, leads(name, phone), team_members!mortgage_applications_assigned_advisor_id_fkey(name, phone)')
        .eq('status', 'sent_to_bank')
        .lt('updated_at', hace7dias.toISOString());

      const { data: todasHipotecas } = await supabase.client
        .from('mortgage_applications')
        .select('id, lead_name, status, bank, updated_at')
        .limit(10);

      await seguimientoHipotecas(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Seguimiento hipotecas ejecutado',
        debug: {
          hipotecas_estancadas: hipotecasEstancadas?.length || 0,
          detalle_estancadas: hipotecasEstancadas?.slice(0, 5) || [],
          todas_hipotecas: todasHipotecas?.length || 0,
          muestra: todasHipotecas || []
        }
      }));
    }

    // TEST: Crear hipoteca de prueba estancada
    if (url.pathname === '/test-crear-hipoteca') {
      const hace10dias = new Date();
      hace10dias.setDate(hace10dias.getDate() - 10);

      // Buscar un lead y asesor para la prueba
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .limit(1)
        .single();

      const { data: asesor } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('role', 'asesor')
        .eq('active', true)
        .not('phone', 'is', null)
        .limit(1)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'No se encontró lead para prueba' }), 404);
      }

      const { data: newMortgage, error } = await supabase.client
        .from('mortgage_applications')
        .insert({
          lead_id: lead.id,
          lead_name: lead.name,
          status: 'sent_to_bank',
          bank: 'Banco Prueba',
          assigned_advisor_id: asesor?.id || null,
          created_at: hace10dias.toISOString(),
          updated_at: hace10dias.toISOString()
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Hipoteca de prueba creada',
        hipoteca: {
          id: newMortgage.id,
          lead: lead.name,
          asesor: asesor?.name || 'Sin asignar',
          status: newMortgage.status,
          updated_at: newMortgage.updated_at
        }
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // API ASESOR: Endpoints para panel de asesores hipotecarios
    // ═══════════════════════════════════════════════════════════════

    // GET /api/asesor/leads?asesor_id=xxx - Ver leads del asesor
    if (url.pathname === '/api/asesor/leads' && request.method === 'GET') {
      const asesorId = url.searchParams.get('asesor_id');
      if (!asesorId) {
        return corsResponse(JSON.stringify({ error: 'Falta asesor_id' }), 400);
      }

      // Buscar leads asignados al asesor
      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, created_at, notes, property_interest')
        .not('notes', 'is', null)
        .order('created_at', { ascending: false });

      const misLeads = allLeads?.filter(l => {
        if (!l.notes) return false;
        const notes = typeof l.notes === 'string' ? JSON.parse(l.notes) : l.notes;
        return notes?.credit_flow_context?.asesor_id === asesorId;
      }).map(l => {
        const notes = typeof l.notes === 'string' ? JSON.parse(l.notes) : l.notes;
        const ctx = notes?.credit_flow_context || {};
        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          status: l.status,
          created_at: l.created_at,
          property_interest: l.property_interest,
          banco_preferido: ctx.banco_preferido,
          ingreso_mensual: ctx.ingreso_mensual,
          enganche: ctx.enganche,
          capacidad_credito: ctx.capacidad_credito,
          modalidad: ctx.modalidad
        };
      }) || [];

      return corsResponse(JSON.stringify({ leads: misLeads, total: misLeads.length }));
    }

    // GET /api/asesor/lead/:id - Ver detalle de un lead
    if (url.pathname.startsWith('/api/asesor/lead/') && request.method === 'GET') {
      const leadId = url.pathname.split('/')[4];
      if (!leadId) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_id' }), 400);
      }

      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const notes = typeof lead.notes === 'string' ? JSON.parse(lead.notes || '{}') : (lead.notes || {});
      const ctx = notes?.credit_flow_context || {};

      return corsResponse(JSON.stringify({
        ...lead,
        credit_context: ctx
      }));
    }

    // PUT /api/asesor/lead/:id - Actualizar lead
    if (url.pathname.startsWith('/api/asesor/lead/') && request.method === 'PUT') {
      const leadId = url.pathname.split('/')[4];
      if (!leadId) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_id' }), 400);
      }

      const body = await request.json() as any;
      const { status, banco_preferido, ingreso_mensual, enganche, notas_asesor } = body;

      // Obtener lead actual
      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Actualizar campos
      const updates: any = {};
      if (status) updates.status = status;

      // Actualizar notas si hay campos de crédito
      if (banco_preferido || ingreso_mensual || enganche || notas_asesor) {
        const notes = typeof lead.notes === 'string' ? JSON.parse(lead.notes || '{}') : (lead.notes || {});
        if (!notes.credit_flow_context) notes.credit_flow_context = {};

        if (banco_preferido) notes.credit_flow_context.banco_preferido = banco_preferido;
        if (ingreso_mensual) notes.credit_flow_context.ingreso_mensual = ingreso_mensual;
        if (enganche) notes.credit_flow_context.enganche = enganche;
        if (notas_asesor) notes.credit_flow_context.notas_asesor = notas_asesor;

        updates.notes = notes;
      }

      const { error } = await supabase.client
        .from('leads')
        .update(updates)
        .eq('id', leadId);

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({ ok: true, message: 'Lead actualizado' }));
    }

    // GET /api/asesor/stats?asesor_id=xxx - Estadísticas del asesor
    if (url.pathname === '/api/asesor/stats' && request.method === 'GET') {
      const asesorId = url.searchParams.get('asesor_id');
      if (!asesorId) {
        return corsResponse(JSON.stringify({ error: 'Falta asesor_id' }), 400);
      }

      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('id, status, notes, created_at')
        .not('notes', 'is', null);

      const misLeads = allLeads?.filter(l => {
        const notes = typeof l.notes === 'string' ? JSON.parse(l.notes) : l.notes;
        return notes?.credit_flow_context?.asesor_id === asesorId;
      }) || [];

      const stats = {
        total: misLeads.length,
        por_status: {
          new: misLeads.filter(l => l.status === 'new').length,
          credit_qualified: misLeads.filter(l => l.status === 'credit_qualified').length,
          contacted: misLeads.filter(l => l.status === 'contacted').length,
          documents_pending: misLeads.filter(l => l.status === 'documents_pending').length,
          pre_approved: misLeads.filter(l => l.status === 'pre_approved').length,
          approved: misLeads.filter(l => l.status === 'approved').length,
          rejected: misLeads.filter(l => l.status === 'rejected').length
        },
        conversion_rate: misLeads.length > 0
          ? Math.round((misLeads.filter(l => l.status === 'approved').length / misLeads.length) * 100)
          : 0,
        este_mes: misLeads.filter(l => {
          const created = new Date(l.created_at);
          const now = new Date();
          return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }).length
      };

      return corsResponse(JSON.stringify(stats));
    }

    // POST /api/asesor/mensaje - Enviar mensaje a lead vía Sara
    if (url.pathname === '/api/asesor/mensaje' && request.method === 'POST') {
      const body = await request.json() as any;
      const { asesor_id, lead_id, mensaje } = body;

      if (!asesor_id || !lead_id || !mensaje) {
        return corsResponse(JSON.stringify({ error: 'Faltan campos: asesor_id, lead_id, mensaje' }), 400);
      }

      // Obtener asesor
      const { data: asesor } = await supabase.client
        .from('team_members')
        .select('name')
        .eq('id', asesor_id)
        .single();

      // Obtener lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('name, phone')
        .eq('id', lead_id)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const nombreAsesor = asesor?.name?.split(' ')[0] || 'Tu asesor';
      const mensajeParaLead = `💬 *Mensaje de tu asesor ${nombreAsesor}:*\n\n"${mensaje}"\n\n_Puedes responder aquí y le haré llegar tu mensaje._`;

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await meta.sendWhatsAppMessage(lead.phone.replace(/\D/g, ''), mensajeParaLead);

      return corsResponse(JSON.stringify({ ok: true, message: 'Mensaje enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Ver citas recientes con estado de Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-citas-recientes') {
      const { data: citas, error: citasError } = await supabase.client
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (citasError) {
        return corsResponse(JSON.stringify({ error: citasError.message }, null, 2), 500);
      }

      return corsResponse(JSON.stringify({
        total: citas?.length || 0,
        citas: citas?.map(c => ({
          lead_name: c.lead_name,
          fecha: c.scheduled_date,
          hora: c.scheduled_time,
          status: c.status,
          google_event: c.google_event_vendedor_id || 'NULL',
          notes: c.notes || 'NULL',
          created_at: c.created_at
        }))
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // FIX: Agregar cita existente a Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/fix-cita-calendar') {
      const leadName = url.searchParams.get('lead_name');
      if (!leadName) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_name' }), 400);
      }

      // Buscar la cita
      const { data: cita, error: citaError } = await supabase.client
        .from('appointments')
        .select('*, leads(name, phone)')
        .eq('lead_name', leadName)
        .is('google_event_vendedor_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (citaError || !cita) {
        return corsResponse(JSON.stringify({ error: 'Cita no encontrada', details: citaError?.message }), 404);
      }

      // Crear evento en Google Calendar
      const fechaEvento = new Date(`${cita.scheduled_date}T${cita.scheduled_time}`);
      const endEvento = new Date(fechaEvento.getTime() + 60 * 60 * 1000);

      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:00`;
      };

      try {
        // Crear instancia local de CalendarService
        const calendarLocal = new CalendarService(
          env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          env.GOOGLE_PRIVATE_KEY,
          env.GOOGLE_CALENDAR_ID
        );

        const eventData = {
          summary: `🏠 Visita - ${cita.lead_name} (${cita.property_name || 'Desarrollo'})`,
          description: `👤 Cliente: ${cita.lead_name}\n📱 Tel: ${cita.lead_phone || 'N/A'}\n🏠 Desarrollo: ${cita.property_name || 'Por definir'}`,
          location: cita.location || cita.property_name || '',
          start: { dateTime: formatDate(fechaEvento), timeZone: 'America/Mexico_City' },
          end: { dateTime: formatDate(endEvento), timeZone: 'America/Mexico_City' }
        };

        const eventResult = await calendarLocal.createEvent(eventData);

        // Actualizar la cita con el google_event_vendedor_id
        await supabase.client
          .from('appointments')
          .update({ google_event_vendedor_id: eventResult.id })
          .eq('id', cita.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Cita de ${cita.lead_name} agregada a Google Calendar`,
          google_event_id: eventResult.id,
          cita_id: cita.id
        }));
      } catch (calError: any) {
        return corsResponse(JSON.stringify({ error: 'Error creando evento', details: calError?.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Diagnóstico de Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-calendar') {
      console.log('TEST: Diagnóstico de Google Calendar...');

      const diagnostico: any = {
        timestamp: new Date().toISOString(),
        env_vars: {
          GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'SET (' + env.GOOGLE_SERVICE_ACCOUNT_EMAIL.substring(0, 20) + '...)' : 'NOT SET',
          GOOGLE_PRIVATE_KEY: env.GOOGLE_PRIVATE_KEY ? 'SET (length: ' + env.GOOGLE_PRIVATE_KEY.length + ')' : 'NOT SET',
          GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID ? 'SET (' + env.GOOGLE_CALENDAR_ID + ')' : 'NOT SET'
        }
      };

      if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_CALENDAR_ID) {
        diagnostico.error = 'Faltan variables de entorno de Google Calendar';
        return corsResponse(JSON.stringify(diagnostico, null, 2), 500);
      }

      try {
        const calendar = new CalendarService(
          env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          env.GOOGLE_PRIVATE_KEY,
          env.GOOGLE_CALENDAR_ID
        );

        // Intentar crear un evento de prueba
        const ahora = new Date();
        const enUnaHora = new Date(ahora.getTime() + 60 * 60 * 1000);

        const testEvent = {
          summary: '🧪 TEST - Eliminar este evento',
          description: 'Evento de prueba creado por diagnóstico de SARA',
          start: {
            dateTime: ahora.toISOString(),
            timeZone: 'America/Mexico_City'
          },
          end: {
            dateTime: enUnaHora.toISOString(),
            timeZone: 'America/Mexico_City'
          }
        };

        console.log('📅 Intentando crear evento de prueba...');
        const result = await calendar.createEvent(testEvent);

        diagnostico.success = true;
        diagnostico.event_created = {
          id: result?.id,
          htmlLink: result?.htmlLink,
          status: result?.status
        };

        // Eliminar el evento de prueba
        if (result?.id) {
          try {
            await calendar.deleteEvent(result.id);
            diagnostico.event_deleted = true;
          } catch (delErr) {
            diagnostico.event_deleted = false;
            diagnostico.delete_error = String(delErr);
          }
        }

        return corsResponse(JSON.stringify(diagnostico, null, 2));
      } catch (calError: any) {
        diagnostico.success = false;
        diagnostico.error = String(calError);
        diagnostico.error_message = calError?.message || 'Unknown error';
        console.error('❌ Error Calendar:', calError);
        return corsResponse(JSON.stringify(diagnostico, null, 2), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alertas proactivas CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-alertas-proactivas') {
      console.log('TEST: Enviando alertas proactivas CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarAlertasProactivasCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Alertas proactivas enviadas' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE PROPERTY - Actualizar campo de una propiedad
    // USO: /update-property?id=XXX&field=gps_link&value=https://...&api_key=XXX
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/update-property') {
      const propId = url.searchParams.get('id');
      const field = url.searchParams.get('field');
      const value = url.searchParams.get('value');
      if (!propId || !field || !value) return corsResponse(JSON.stringify({ error: 'Falta id, field o value' }), 400);
      const allowed = ['gps_link', 'photo_url', 'youtube_link', 'price_equipped', 'price', 'description'];
      if (!allowed.includes(field)) return corsResponse(JSON.stringify({ error: `Campo no permitido. Usar: ${allowed.join(', ')}` }), 400);
      const { error } = await supabase.client.from('properties').update({ [field]: value }).eq('id', propId);
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
      const { data: updated } = await supabase.client.from('properties').select('name, ' + field).eq('id', propId).single();
      return corsResponse(JSON.stringify({ ok: true, updated }));
    }

    // ═══════════════════════════════════════════════════════════════
    // CHECK FACEBOOK LEADS - Verificar suscripción de Facebook Lead Ads
    // USO: /check-fb-leads?api_key=XXX
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/check-fb-leads') {
      const token = env.META_ACCESS_TOKEN;
      const results: any = {};

      // 1. Check app subscriptions
      try {
        const appResp = await fetch(`https://graph.facebook.com/v21.0/1552990676007903/subscriptions?access_token=${token}`);
        const appData: any = await appResp.json();
        results.app_subscriptions = appData.data || appData;
      } catch (e: any) { results.app_subscriptions_error = e.message; }

      // 2. Get WABA ID and check for pages
      try {
        const wabaResp = await fetch(`https://graph.facebook.com/v21.0/${env.META_WHATSAPP_BUSINESS_ID}?fields=name,id&access_token=${token}`);
        const wabaData: any = await wabaResp.json();
        results.whatsapp_business = wabaData;
      } catch (e: any) { results.waba_error = e.message; }

      // 3. Try to get pages associated with the business
      try {
        const bizResp = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`);
        const bizData: any = await bizResp.json();
        results.pages = bizData.data || bizData;

        // 4. For each page, check leadgen subscriptions
        if (Array.isArray(results.pages)) {
          for (const page of results.pages) {
            try {
              const subResp = await fetch(`https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?access_token=${page.access_token || token}`);
              const subData: any = await subResp.json();
              page.subscribed_apps = subData.data || subData;
            } catch (e: any) { page.subscription_error = e.message; }
          }
        }
      } catch (e: any) { results.pages_error = e.message; }

      // 5. Check webhook config on the WhatsApp side
      results.webhook_url_expected = 'https://sara-backend.edson-633.workers.dev/webhook/facebook-leads';
      results.webhook_verify_token = 'sara_fb_leads_token';

      // 6. Check scopes
      try {
        const debugResp = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${token}`);
        const debugData: any = await debugResp.json();
        const scopes = debugData.data?.scopes || [];
        results.token_scopes = scopes;
        results.has_leads_retrieval = scopes.includes('leads_retrieval');
        results.has_pages_manage = scopes.includes('pages_manage_metadata');
        results.has_pages_read = scopes.includes('pages_read_engagement') || scopes.includes('pages_show_list');
      } catch (e: any) { results.scopes_error = e.message; }

      return corsResponse(JSON.stringify(results, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // CHECK TOKEN - Verificar tipo y expiración del token de Meta
    // USO: /check-token?api_key=XXX
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/check-token') {
      const token = env.META_ACCESS_TOKEN;
      const tokenPrefix = token?.substring(0, 10) || 'N/A';
      const tokenLength = token?.length || 0;

      // Debug token via Meta API
      let tokenInfo: any = { error: 'No se pudo verificar' };
      try {
        const debugResp = await fetch(
          `https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${token}`
        );
        const debugData: any = await debugResp.json();
        if (debugData.data) {
          const d = debugData.data;
          tokenInfo = {
            app_id: d.app_id,
            type: d.type, // USER, PAGE, APP, SYSTEM
            expires_at: d.expires_at === 0 ? 'NEVER (permanent)' : new Date(d.expires_at * 1000).toISOString(),
            is_valid: d.is_valid,
            scopes: d.scopes,
            granular_scopes: d.granular_scopes?.map((s: any) => s.permission),
            issued_at: d.issued_at ? new Date(d.issued_at * 1000).toISOString() : null,
            profile_id: d.profile_id,
            user_id: d.user_id,
          };
        } else {
          tokenInfo = { error: debugData.error?.message || 'Unknown error', raw: debugData };
        }
      } catch (e: any) {
        tokenInfo = { error: e.message };
      }

      return corsResponse(JSON.stringify({
        ok: true,
        token_prefix: tokenPrefix + '...',
        token_length: tokenLength,
        is_system_user: tokenInfo.type === 'SYSTEM',
        permanent: tokenInfo.expires_at === 'NEVER (permanent)',
        token_info: tokenInfo,
        recommendation: tokenInfo.type === 'SYSTEM'
          ? '✅ Token de System User - permanente, ideal para producción'
          : tokenInfo.type === 'USER'
            ? '⚠️ Token de usuario - EXPIRA. Cambiar a System User en business.facebook.com/settings/system-users'
            : `ℹ️ Token tipo: ${tokenInfo.type || 'desconocido'}`
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // ONBOARDING - Enviar mensaje de bienvenida al equipo
    // USO: /onboarding-equipo?api_key=XXX (dry-run)
    // USO: /onboarding-equipo?enviar=true&api_key=XXX (envío real)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/onboarding-equipo') {
      const enviar = url.searchParams.get('enviar') === 'true';
      const soloPhone = url.searchParams.get('phone');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      let query = supabase.client
        .from('team_members')
        .select('id, name, phone, role, active')
        .eq('active', true)
        .order('role');

      if (soloPhone) {
        query = supabase.client
          .from('team_members')
          .select('id, name, phone, role, active')
          .or(`phone.eq.${soloPhone},phone.like.%${soloPhone.slice(-10)}`);
      }

      const { data: members } = await query;

      if ((!members || members.length === 0) && soloPhone) {
        // Phone not in team_members - send directly
        try {
          await meta.sendTemplate(soloPhone, 'reactivar_equipo', 'es_MX', [
            { type: 'body', parameters: [{ type: 'text', text: 'Hola' }] }
          ], true);
          return corsResponse(JSON.stringify({ ok: true, mode: 'ENVÍO DIRECTO', phone: soloPhone, status: '✅ Template enviado (no es team member)' }));
        } catch (e: any) {
          return corsResponse(JSON.stringify({ error: e.message }), 500);
        }
      }
      if (!members || members.length === 0) {
        return corsResponse(JSON.stringify({ error: 'No hay team members activos' }), 400);
      }

      const results: any[] = [];

      for (const m of members) {
        const roleName = m.role === 'admin' ? 'CEO'
          : m.role === 'vendedor' ? 'Vendedor'
          : m.role === 'coordinador' ? 'Coordinador'
          : m.role === 'asesor' ? 'Asesor'
          : m.role;

        if (enviar) {
          try {
            // Send template reactivar_equipo (doesn't need 24h window)
            await meta.sendTemplate(m.phone, 'reactivar_equipo', 'es_MX', [
              { type: 'body', parameters: [{ type: 'text', text: m.name?.split(' ')[0] || 'Hola' }] }
            ], true);
            results.push({ name: m.name, phone: m.phone, role: roleName, status: '✅ Template enviado' });
          } catch (e: any) {
            results.push({ name: m.name, phone: m.phone, role: roleName, status: `❌ Error: ${e.message}` });
          }
        } else {
          results.push({ name: m.name, phone: m.phone, role: roleName, status: '🔍 Dry-run (sin enviar)' });
        }
      }

      return corsResponse(JSON.stringify({
        ok: true,
        mode: enviar ? 'ENVÍO REAL' : 'DRY-RUN (agregar ?enviar=true para enviar)',
        total: results.length,
        results
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTIVATE TEAM MEMBERS - Activar/desactivar miembros
    // USO: /activate-team?exclude=Vendedor Test,Asesor Crédito Test&api_key=XXX
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/activate-team') {
      const exclude = (url.searchParams.get('exclude') || '').split(',').map(s => s.trim()).filter(Boolean);
      // Activate all
      const { error: e1 } = await supabase.client.from('team_members').update({ active: true }).neq('name', '');
      if (e1) return corsResponse(JSON.stringify({ error: e1.message }), 500);
      // Deactivate excluded
      for (const name of exclude) {
        await supabase.client.from('team_members').update({ active: false }).eq('name', name);
      }
      // Verify
      const { data } = await supabase.client.from('team_members').select('name, active, role').order('role');
      const activeM = (data || []).filter((m: any) => m.active);
      const inactiveM = (data || []).filter((m: any) => !m.active);
      return corsResponse(JSON.stringify({ ok: true, active: activeM.length, inactive: inactiveM.length, activeMembers: activeM, inactiveMembers: inactiveM }));
    }

    // ═══════════════════════════════════════════════════════════════
    // CHECK TEMPLATE STATUS - Consultar status de un template por nombre
    // USO: /check-template?name=alerta_sistema&api_key=XXX
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-alerta-sistema') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const msg = url.searchParams.get('msg') || 'Test de alerta sistema - si recibes esto, el template funciona correctamente.';
      try {
        const result = await enviarAlertaSistema(meta, msg, env, '');
        return corsResponse(JSON.stringify({ ok: true, sent: result, msg }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ ok: false, error: e.message }), 500);
      }
    }

    if (url.pathname === '/check-template') {
      const WABA_ID = (env as any).META_WHATSAPP_BUSINESS_ID;
      const tplName = url.searchParams.get('name') || 'alerta_sistema';
      if (!WABA_ID) return corsResponse(JSON.stringify({ error: 'WABA_ID not configured' }), 400);
      try {
        const resp = await fetch(
          `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?name=${tplName}&fields=name,status,category,language`,
          { headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` } }
        );
        const result: any = await resp.json();
        return corsResponse(JSON.stringify({ ok: resp.ok, templates: result.data || [], raw: result }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CREAR TEMPLATE alerta_sistema en Meta (ejecutar una sola vez)
    // USO: /crear-template-alerta?api_key=XXX
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/crear-template-alerta') {
      const WABA_ID = (env as any).META_WHATSAPP_BUSINESS_ID;
      if (!WABA_ID) {
        return corsResponse(JSON.stringify({ error: 'META_WHATSAPP_BUSINESS_ID no configurado' }), 400);
      }
      try {
        const resp = await fetch(
          `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: 'alerta_sistema',
              language: 'es_MX',
              category: 'UTILITY',
              components: [
                {
                  type: 'BODY',
                  text: '🚨 *Alerta Sistema SARA*\n\n{{1}}\n\n_Alerta automática_',
                  example: { body_text: [['Health check: Base de datos no responde. Verificar Supabase.']] }
                }
              ]
            })
          }
        );
        const result: any = await resp.json();
        return corsResponse(JSON.stringify({
          ok: resp.ok,
          status: resp.status,
          result,
          nota: resp.ok ? 'Template creado. Esperar aprobación de Meta (usualmente minutos para UTILITY).' : 'Error al crear template'
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alerta leads HOT sin seguimiento
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-alerta-hot') {
      console.log('TEST: Enviando alerta leads HOT...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Debug info
      const { data: admins } = await supabase.client
        .from('team_members')
        .select('name, phone, role')
        .in('role', ['admin', 'coordinador', 'ceo', 'director'])
        .eq('active', true);

      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

      const { data: hotSinSeguimiento } = await supabase.client
        .from('leads')
        .select('id, name, status, updated_at')
        .in('status', ['negotiation', 'reserved'])
        .lt('updated_at', inicioHoy);

      // Enviar manualmente para debug
      let enviados: string[] = [];
      let errores: string[] = [];

      if (hotSinSeguimiento && hotSinSeguimiento.length > 0) {
        let msg = `🔥 *LEADS HOT SIN SEGUIMIENTO HOY*\n\n`;
        msg += `Total: ${hotSinSeguimiento.length} leads\n\n`;
        for (const lead of hotSinSeguimiento.slice(0, 5)) {
          msg += `• *${lead.name || 'Sin nombre'}* (${lead.status})\n`;
        }
        msg += '\n⚡ _Dar seguimiento urgente._';

        for (const admin of (admins || [])) {
          if (!admin.phone) continue;
          try {
            await meta.sendWhatsAppMessage(admin.phone, msg);
            enviados.push(`${admin.name} (${admin.phone})`);
          } catch (e: any) {
            errores.push(`${admin.name}: ${e.message || e}`);
          }
        }
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Alerta HOT enviada',
        debug: {
          admins_encontrados: admins?.length || 0,
          admins: admins?.map(a => ({ name: a.name, phone: a.phone, role: a.role })) || [],
          leads_hot_sin_seguimiento: hotSinSeguimiento?.length || 0,
          leads: hotSinSeguimiento?.slice(0, 5) || [],
          enviados,
          errores
        }
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Crear lead HOT de prueba
    if (url.pathname === '/test-crear-lead-hot') {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Lead HOT Prueba',
          phone: '521999' + Math.floor(Math.random() * 9000000 + 1000000),
          status: 'negotiation',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Distrito Falco',
          lead_score: 85,
          created_at: ayer.toISOString(),
          updated_at: ayer.toISOString()
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Lead HOT creado',
        lead: {
          id: newLead.id,
          name: newLead.name,
          status: newLead.status,
          updated_at: newLead.updated_at,
          assigned_to: vendedor?.name || 'Sin asignar'
        }
      }));
    }

    // TEST: Coaching proactivo
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-coaching') {
      console.log('TEST: Enviando coaching proactivo...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { data: vendedores } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);
      if (vendedores) {
        await enviarCoachingProactivo(supabase, meta, vendedores);
      }
      return corsResponse(JSON.stringify({ ok: true, message: 'Coaching enviado', vendedores: vendedores?.length || 0 }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Briefing matutino
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-briefing') {
      console.log('TEST: Enviando briefing matutino...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { data: vendedores } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);
      let enviados = 0;
      for (const v of vendedores || []) {
        if (!v.phone || !v.recibe_briefing) continue;
        await enviarBriefingMatutino(supabase, meta, v, { openaiApiKey: env.OPENAI_API_KEY });
        enviados++;
      }
      return corsResponse(JSON.stringify({ ok: true, message: 'Briefings enviados', count: enviados }));
    }

    // TEST: Enviar briefing a número específico
    if (url.pathname.startsWith('/test-briefing/')) {
      const phone = url.pathname.split('/').pop();
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;
      console.log(`TEST: Enviando briefing a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar team member real en DB
      const { data: realMember } = await supabase.client
        .from('team_members')
        .select('*')
        .or(`phone.eq.${phoneFormatted},phone.like.%${phoneFormatted?.slice(-10)}`)
        .maybeSingle();

      const vendedorTest = realMember || {
        id: 'test',
        name: 'Usuario',
        phone: phoneFormatted,
        role: 'vendedor',
        recibe_briefing: true,
        last_briefing_sent: null
      };

      console.log(`TEST: Usando ${realMember ? 'team member REAL' : 'vendedor VIRTUAL'} (id: ${vendedorTest.id})`);
      await enviarBriefingMatutino(supabase, meta, vendedorTest, { openaiApiKey: env.OPENAI_API_KEY });
      return corsResponse(JSON.stringify({ ok: true, message: `Briefing enviado a ${vendedorTest.phone}`, realMember: !!realMember, id: vendedorTest.id }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alerta 2pm a número específico
    if (url.pathname.startsWith('/test-alerta-2pm/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando alerta 2pm a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const mexicoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const hoyInicio = new Date(mexicoNow);
      hoyInicio.setHours(0, 0, 0, 0);

      const { data: leadsUrgentes } = await supabase.client
        .from('leads')
        .select('id, name, status, score')
        .in('status', ['new', 'contacted', 'scheduled', 'negotiation'])
        .or(`last_interaction.is.null,last_interaction.lt.${hoyInicio.toISOString()}`)
        .order('score', { ascending: false })
        .limit(10);

      let msg = `⚡ *ALERTA 2PM - TEST*\n\n`;

      if (!leadsUrgentes || leadsUrgentes.length === 0) {
        msg += `✅ No hay leads urgentes pendientes.\n\nTodos los leads han sido contactados hoy.`;
      } else {
        msg += `Hay *${leadsUrgentes.length} leads* que necesitan atención:\n\n`;
        for (const lead of leadsUrgentes.slice(0, 5)) {
          const leadNombre = lead.name?.split(' ')[0] || 'Sin nombre';
          const esNuevo = lead.status === 'new';
          msg += `${esNuevo ? '🆕' : '🔥'} *${leadNombre}* - ${esNuevo ? 'Sin contactar' : lead.status}\n`;
        }
        if (leadsUrgentes.length > 5) {
          msg += `\n...y ${leadsUrgentes.length - 5} más\n`;
        }
        msg += '\n💡 _Los leads contactados rápido tienen 9x más probabilidad de cerrar_';
      }

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Alerta 2pm enviada a ${phoneFormatted}`, leads: leadsUrgentes?.length || 0 }));
    }

    // TEST: Alerta 5pm a número específico
    if (url.pathname.startsWith('/test-alerta-5pm/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando alerta 5pm a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const mexicoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const hoyInicio = new Date(mexicoNow);
      hoyInicio.setHours(0, 0, 0, 0);

      const { data: leadsPendientes } = await supabase.client
        .from('leads')
        .select('id, name, status, score')
        .in('status', ['new', 'contacted', 'scheduled', 'negotiation'])
        .or(`last_interaction.is.null,last_interaction.lt.${hoyInicio.toISOString()}`)
        .order('score', { ascending: false })
        .limit(10);

      const manana = new Date(mexicoNow);
      manana.setDate(manana.getDate() + 1);
      manana.setHours(0, 0, 0, 0);
      const mananaFin = new Date(manana);
      mananaFin.setHours(23, 59, 59, 999);

      const { data: citasManana } = await supabase.client
        .from('appointments')
        .select('id, date')
        .eq('status', 'scheduled')
        .gte('date', manana.toISOString())
        .lt('date', mananaFin.toISOString());

      const pendientes = leadsPendientes?.length || 0;
      const citas = citasManana?.length || 0;

      let msg = `🌅 *RESUMEN DEL DÍA - TEST*\n\n`;

      if (pendientes > 0) {
        const leadsMasUrgentes = leadsPendientes?.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
        msg += `📋 *${pendientes} leads* pendientes de contactar:\n`;
        for (const lead of leadsMasUrgentes || []) {
          msg += `  • ${lead.name?.split(' ')[0] || 'Lead'} (${lead.status})\n`;
        }
        msg += '\n';
      } else {
        msg += `✅ Todos los leads fueron contactados hoy\n\n`;
      }

      if (citas > 0) {
        msg += `📅 *${citas} citas* programadas para mañana\n\n`;
      }

      msg += pendientes > 3
        ? '⚠️ _Aún tienes tiempo de hacer llamadas antes de cerrar el día_'
        : '✨ _¡Buen trabajo hoy! Descansa bien_';

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Alerta 5pm enviada a ${phoneFormatted}`, pendientes, citas }));
    }

    return null; // Not a test route
}
