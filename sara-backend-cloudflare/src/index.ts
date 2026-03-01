import { SupabaseService } from './services/supabase';
import { ClaudeService } from './services/claude';
import { CacheService } from './services/cacheService';

import { MetaWhatsAppService } from './services/meta-whatsapp';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
import { formatPhoneForDisplay } from './handlers/whatsapp-utils';
import { handleTeamRoutes } from './routes/team-routes';
import { handlePromotionRoutes } from './routes/promotions';
import { handleRetellRoutes } from './routes/retell';
import { handleTestRoutes } from './routes/test';
import { handleApiCoreRoutes } from './routes/api-core';
import { handleApiBiRoutes } from './routes/api-bi';
import { FollowupService } from './services/followupService';
import { FollowupApprovalService } from './services/followupApprovalService';
import { NotificationService } from './services/notificationService';
import { BroadcastQueueService } from './services/broadcastQueueService';
import { IACoachingService } from './services/iaCoachingService';
import { CEOCommandsService } from './services/ceoCommandsService';
import { VendorCommandsService } from './services/vendorCommandsService';
import { initSentry } from './services/sentryService';
import { AudioTranscriptionService, createAudioTranscription, isAudioMessage, extractAudioInfo } from './services/audioTranscriptionService';
import { AIConversationService } from './services/aiConversationService';
import { getAvailableVendor, TeamMemberAvailability } from './services/leadManagementService';
import { createTTSTrackingService } from './services/ttsTrackingService';
import { createMessageTrackingService } from './services/messageTrackingService';
import { safeJsonParse } from './utils/safeHelpers';
import { createMetaWithTracking } from './utils/metaTracking';
import { processRetryQueue, enqueueFailedMessage } from './services/retryQueueService';
import { createLeadAttribution } from './services/leadAttributionService';
import { createSLAMonitoring } from './services/slaMonitoringService';
import { createLeadDeduplication } from './services/leadDeduplicationService';
import { CronTracker, getObservabilityDashboard, formatObservabilityForWhatsApp } from './services/observabilityService';

// CRON modules
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
  procesarRespuestaEncuesta,
  aplicarPreciosProgramados
} from './crons/reports';

// Utils
import { isAllowedCrmOrigin, ALLOWED_CRM_ORIGINS } from './routes/cors';
import { enviarMensajeTeamMember, EnviarMensajeTeamResult, isPendingExpired, getPendingMessages, verificarPendingParaLlamar, verificarDeliveryTeamMessages, CALL_CONFIG } from './utils/teamMessaging';
import { parseFechaEspanol, detectarIntencionCita, getMexicoNow } from './handlers/dateParser';

// Briefings y Recaps
import {
  enviarFelicitaciones,
  logEvento,
  ejecutarTareaOneTime,
  enviarBriefingMatutino,
  prefetchBriefingData,
  enviarRecapDiario,
  enviarRecapSemanal,
  enviarRecordatoriosCitas,
  recordatorioAsesores
} from './crons/briefings';

// Alertas y Notificaciones
import {
  enviarAlertasLeadsFrios,
  verificarConsistenciaCalendario,
  tieneInteraccionPendiente,
  detectarNoShows,
  verificarTimeoutConfirmaciones,
  enviarAlertasProactivasCEO,
  alertaInactividadVendedor,
  alertaLeadsHotSinSeguimiento,
  alertaLeadsHotUrgentes,
  recordatorioFinalDia,
  enviarCoachingProactivo,
  calcularDiasEnEtapa,
  getABVariant,
  trackABConversion,
  getABTestResults,
  remarketingLeadsFrios,
  followUpLeadsInactivos,
  recordatoriosPagoApartado,
  reactivarLeadsPerdidos,
  felicitarCumpleañosLeads,
  procesarCumpleañosLeads,
  felicitarCumpleañosEquipo,
  alertaCitaNoConfirmada,
  alertarLeadsEstancados
} from './crons/alerts';

// Follow-ups y Nurturing
import {
  puedeEnviarMensajeAutomatico,
  registrarMensajeAutomatico,
  seguimientoHipotecas,
  enviarRecordatoriosPromociones,
  enviarBriefingSupervision,
  enviarBriefingSupervisionTest,
  verificarReengagement,
  reengagementDirectoLeads,
  seguimientoPostVenta,
  enviarFelicitacionesCumple,
  felicitarEquipoCumple,
  seguimientoCredito,
  procesarBroadcastQueue,
  followUp24hLeadsNuevos,
  reminderDocumentosCredito,
  llamadasSeguimientoPostVisita,
  llamadasReactivacionLeadsFrios,
  llamadasRecordatorioCita,
  llamadasEscalamiento48h
} from './crons/followups';

// Lead Scoring y Objeciones
import {
  HotLeadSignal,
  detectarSeñalesCalientes,
  calcularLeadScore,
  alertarLeadCaliente,
  actualizarLeadScores,
  Objecion,
  OBJECIONES_COMUNES,
  detectarObjeciones,
  alertarObjecion
} from './crons/leadScoring';

// Nurturing y NPS
import {
  recuperarAbandonosCredito,
  followUpPostVisita,
  CONTENIDO_EDUCATIVO,
  nurturingEducativo,
  solicitarReferidos,
  enviarEncuestaNPS,
  procesarRespuestaNPS,
  seguimientoPostEntrega,
  procesarRespuestaEntrega,
  encuestaSatisfaccionCasa,
  procesarRespuestaSatisfaccionCasa,
  checkInMantenimiento,
  procesarRespuestaMantenimiento,
  isLikelySurveyResponse,
  checkIn60Dias,
  limpiarFlagsEncuestasExpirados,
  procesarFeedbackEncuesta,
  llamadasEscalamientoPostVenta
} from './crons/nurturing';

// Maintenance - Bridge, followups, stagnant leads, anniversaries
import {
  verificarBridgesPorExpirar,
  procesarFollowupsPendientes,
  verificarLeadsEstancados,
  felicitarAniversarioCompra,
  archivarConversationHistory
} from './crons/maintenance';

// Videos - Veo 3 video generation and processing
import {
  verificarVideosPendientes,
  generarVideoSemanalLogros,
  videoFelicitacionPostVenta,
  videoBienvenidaLeadNuevo
} from './crons/videos';

// Dashboard - backup (status/analytics moved to routes/api-bi.ts)
import { exportBackup, backupSemanalR2, getBackupLog } from './crons/dashboard';

// Health Check - Automated monitoring and alerts
import {
  runHealthCheck,
  trackError,
  cronHealthCheck,
  logErrorToDB,
  enviarDigestoErroresDiario,
  enviarAlertaSistema,
  healthMonitorCron,
} from './crons/healthCheck';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  GEMINI_API_KEY: string;
  API_SECRET?: string; // Para proteger endpoints sensibles
  META_WEBHOOK_SECRET?: string; // Para validar firma de webhooks Meta/Facebook
  SARA_CACHE?: KVNamespace; // Cache KV para reducir queries a DB
  SENTRY_DSN?: string; // DSN de Sentry para error tracking
  ENVIRONMENT?: string; // production, staging, development
  // Email reports
  RESEND_API_KEY?: string; // API key de Resend para enviar emails
  REPORT_TO_EMAILS?: string; // Emails destino separados por coma
  OPENAI_API_KEY?: string; // Para transcripción de audio (Whisper) y TTS
  // Retell.ai - Llamadas telefónicas con IA
  RETELL_API_KEY?: string; // API key de Retell.ai
  RETELL_AGENT_ID?: string; // ID del agente SARA en Retell
  RETELL_PHONE_NUMBER?: string; // Número de teléfono para llamadas salientes
  SARA_BACKUPS?: R2Bucket; // R2 bucket para backups semanales
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS: Uses canonical whitelist from routes/cors.ts
// ═══════════════════════════════════════════════════════════════════════════
function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('Origin');
  if (origin && isAllowedCrmOrigin(origin)) {
    return origin;
  }
  // Webhooks (Meta/Facebook) don't send Origin — return default
  return ALLOWED_CRM_ORIGINS[0];
}

function corsResponse(body: string | null, status: number = 200, contentType: string = 'application/json', request?: Request): Response {
  // When request is provided, use the actual origin; otherwise use wildcard for flexibility
  const allowedOrigin = request ? getCorsOrigin(request) : '*';
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
      'Content-Type': contentType,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING: Structured JSON logging con requestId
// ═══════════════════════════════════════════════════════════════════════════
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function log(level: 'info' | 'warn' | 'error', message: string, requestId: string, metadata?: Record<string, any>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    requestId,
    message,
    ...metadata
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING: 100 req/min por IP usando KV
// ═══════════════════════════════════════════════════════════════════════════
async function checkRateLimit(request: Request, env: Env, requestId: string, maxRequests: number = 100, failClosed: boolean = false): Promise<Response | null> {
  // Si KV no está configurado, permitir (config issue, no runtime failure)
  if (!env.SARA_CACHE) return null;

  // No limitar webhooks de Meta (necesitan responder rápido)
  const url = new URL(request.url);
  if (url.pathname.startsWith('/webhook')) return null;

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const endpoint = url.pathname.split('?')[0];
  const key = `ratelimit:${ip}:${endpoint}`;
  const limit = maxRequests;
  const windowSeconds = 60;

  try {
    const current = await env.SARA_CACHE.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
      log('warn', `Rate limit exceeded for IP: ${ip}`, requestId, { ip, count, limit, endpoint });
      return new Response(JSON.stringify({
        error: 'Too many requests',
        retry_after: windowSeconds
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(windowSeconds),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        }
      });
    }

    // Incrementar contador
    await env.SARA_CACHE.put(key, String(count + 1), { expirationTtl: windowSeconds });
  } catch (e) {
    if (failClosed) {
      // Fail closed for expensive endpoints: block request when KV is unavailable
      console.warn(`⚠️ Rate limit KV error (fail-closed, request BLOCKED): ${String(e)}`);
      log('warn', 'Rate limit KV failed, blocking request (fail-closed)', requestId, { error: String(e), ip, endpoint });
      return new Response(JSON.stringify({
        error: 'Service temporarily unavailable',
        retry_after: 30
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '30',
        }
      });
    }
    // Fail open for standard CRM traffic: KV failures are transient
    console.warn(`⚠️ Rate limit KV error (fail-open, request allowed): ${String(e)}`);
    log('warn', 'Rate limit KV failed, allowing request (fail-open)', requestId, { error: String(e), ip, endpoint });
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGURIDAD: Verificación de API Key para endpoints protegidos
// ═══════════════════════════════════════════════════════════════════════════
function checkApiAuth(request: Request, env: Env): Response | null {
  // Si no hay API_SECRET configurado, bloquear acceso (seguridad restrictiva)
  if (!env.API_SECRET) {
    console.error('🚨 API_SECRET no configurado - bloqueando endpoints protegidos');
    return corsResponse(JSON.stringify({
      error: 'Configuración de seguridad incompleta',
      hint: 'API_SECRET no está configurado en el entorno'
    }), 500);
  }

  const authHeader = request.headers.get('Authorization');
  const apiKey = authHeader?.replace('Bearer ', '');

  // También aceptar ?api_key= en query string para debugging fácil
  const url = new URL(request.url);
  const queryKey = url.searchParams.get('api_key');

  if (apiKey === env.API_SECRET || queryKey === env.API_SECRET) {
    return null; // Autorizado
  }

  return corsResponse(JSON.stringify({
    error: 'No autorizado',
    hint: 'Incluye header Authorization: Bearer <API_SECRET> o ?api_key=<API_SECRET>'
  }), 401);
}

// Helper para verificar si una ruta necesita autenticación
function requiresAuth(pathname: string): boolean {
  // Endpoints que NO requieren auth (webhooks, health checks, status, analytics)
  const publicPaths = [
    '/webhook',           // Meta webhook
    '/health',            // Health check
    '/status',            // Status dashboard
    '/analytics',         // Analytics dashboard
    '/',                  // Root
    // NOTA: /test-ventana-24h y /test-envio-7pm AHORA requieren API key
    // porque exponen nombres y teléfonos parciales del equipo
  ];

  if (publicPaths.includes(pathname)) return false;

  // Todos los webhooks son públicos (Meta, Retell, Facebook, etc.)
  if (pathname.startsWith('/webhook')) return false;

  // Endpoints del CRM que no requieren auth (usados por el frontend)
  const crmPublicPatterns = [
    /^\/api\/appointments\/[^/]+\/cancel$/,  // Cancelar cita
    /^\/api\/appointments\/notify-change$/,  // Notificar cambio
    /^\/api\/calendar\//,                    // Endpoints de calendario
    /^\/api\/leads/,                         // Endpoints de leads
    /^\/api\/team/,                          // Endpoints de equipo
    /^\/api\/appointments$/,                 // Lista/crear citas
    /^\/api\/developments/,                  // Desarrollos
    /^\/api\/properties/,                    // Propiedades/Inventario
    /^\/api\/pipeline/,                      // Business Intelligence - Pipeline
    /^\/api\/alerts/,                        // Business Intelligence - Alerts
    /^\/api\/market/,                        // Business Intelligence - Market
    /^\/api\/clv/,                           // Business Intelligence - CLV
    /^\/api\/offers/,                        // Business Intelligence - Offers
    /^\/api\/reports/,                       // Business Intelligence - Reports
    /^\/api\/reportes/,                      // Reportes legacy
    /^\/api\/message-metrics/,               // Métricas de mensajes (CRM)
    /^\/api\/message-audit/,                 // Auditoría de mensajes (CRM)
    /^\/api\/tts-metrics/,                   // Métricas de TTS (CRM)
    /^\/api\/metrics\/quality/,              // Calidad de respuestas (CRM)
    /^\/api\/surveys/,                       // Encuestas (CRM)
    /^\/api\/send-surveys/,                  // Enviar encuestas (CRM)
    /^\/api\/error-logs/,                    // Error logs (CRM Sistema)
    /^\/api\/sla/,                           // SLA Monitoring (CRM)
  ];

  for (const pattern of crmPublicPatterns) {
    if (pattern.test(pathname)) return false;
  }

  // Todo lo demás requiere auth
  return pathname.startsWith('/api/') ||
         pathname.startsWith('/test-') ||
         pathname.startsWith('/debug-');
}

// createMetaWithTracking moved to src/utils/metaTracking.ts

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Procesar respuesta a encuesta pendiente (tabla surveys)
// ═══════════════════════════════════════════════════════════════════════════
async function checkPendingSurveyResponse(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  phone: string,
  mensaje: string,
  nombre: string
): Promise<boolean> {
  try {
    // Buscar encuesta pendiente para este teléfono
    const phoneSuffix = phone.slice(-10);
    const { data: survey } = await supabase.client
      .from('surveys')
      .select('*')
      .eq('status', 'sent')
      .or(`lead_phone.like.%${phoneSuffix}`)
      .gt('expires_at', new Date().toISOString())
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!survey) return false;

    // Validar que parece respuesta a encuesta antes de procesar
    if (!isLikelySurveyResponse(mensaje)) return false;

    const primerNombre = nombre?.split(' ')[0] || 'amigo';

    // Procesar según tipo de encuesta
    if (survey.survey_type === 'nps') {
      const match = mensaje.trim().match(/^\s*(\d{1,2})\s*$/);
      if (!match || parseInt(match[1]) > 10) return false;

      const score = parseInt(match[1]);
      let categoria: string;
      let respuesta: string;

      if (score >= 9) {
        categoria = 'promotor';
        respuesta = `Muchas gracias ${primerNombre}! Tu calificacion de ${score}/10 nos motiva mucho.\n\nSi conoces a alguien que busque casa, con gusto lo atendemos. Solo compartenos su nombre y telefono.\n\nGracias por confiar en Grupo Santa Rita!`;
      } else if (score >= 7) {
        categoria = 'pasivo';
        respuesta = `Gracias por tu respuesta ${primerNombre}! Un ${score}/10 nos dice que vamos bien.\n\nHay algo que podamos mejorar? Tu opinion nos ayuda mucho.`;
      } else {
        categoria = 'detractor';
        respuesta = `Gracias por tu honestidad ${primerNombre}. Un ${score}/10 nos dice que debemos mejorar.\n\nPodrias contarnos que paso? Queremos resolver cualquier inconveniente.\n\nUn asesor te contactara pronto.`;
      }

      await meta.sendWhatsAppMessage(phone, respuesta);

      // Actualizar encuesta en DB
      const { error: surveyErr1 } = await supabase.client.from('surveys').update({
        status: 'answered',
        nps_score: score,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', survey.id);
      if (surveyErr1) console.error('⚠️ Error actualizando encuesta NPS:', surveyErr1.message);

      console.log(`📋 Encuesta CRM NPS procesada: ${nombre} = ${score}/10 (${categoria})`);
      return true;

    } else {
      // Para otros tipos (satisfaction, post_cita, etc.)
      const matchRating = mensaje.trim().match(/^\s*([1-5])\s*$/);
      const esTexto = mensaje.length > 3;

      if (matchRating) {
        const rating = parseInt(matchRating[1]);
        await meta.sendWhatsAppMessage(phone, `Gracias por tu calificacion ${primerNombre}! ${rating >= 4 ? 'Nos alegra que hayas tenido una buena experiencia.' : 'Tomaremos en cuenta tu opinion para mejorar.'}\n\nHay algo mas que quieras compartirnos?`);

        const { error: surveyErr2 } = await supabase.client.from('surveys').update({
          status: 'awaiting_feedback',
          rating,
          answered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', survey.id);
        if (surveyErr2) console.error('⚠️ Error actualizando encuesta rating:', surveyErr2.message);

        console.log(`📋 Encuesta CRM rating procesada: ${nombre} = ${rating}/5`);
        return true;

      } else if (survey.status === 'awaiting_feedback' || esTexto) {
        // Es feedback de texto
        await meta.sendWhatsAppMessage(phone, `Gracias por tu comentario ${primerNombre}! Lo tomaremos muy en cuenta.`);

        const { error: surveyErr3 } = await supabase.client.from('surveys').update({
          status: 'answered',
          feedback: mensaje,
          updated_at: new Date().toISOString()
        }).eq('id', survey.id);
        if (surveyErr3) console.error('⚠️ Error actualizando encuesta feedback:', surveyErr3.message);

        console.log(`📋 Encuesta CRM feedback procesado: ${nombre}`);
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error('Error checking pending survey:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGURIDAD: Verificación de firma de webhooks Meta/Facebook
// ═══════════════════════════════════════════════════════════════════════════
async function verifyMetaSignature(request: Request, body: string, secret: string): Promise<boolean> {
  const signature = request.headers.get('X-Hub-Signature-256');
  if (!signature) {
    console.error('❌ Webhook sin firma X-Hub-Signature-256');
    return false;
  }

  // La firma viene como "sha256=HASH"
  const expectedSignature = signature.replace('sha256=', '');

  try {
    // Crear HMAC-SHA256 del body con el secret
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(body)
    );

    // Convertir a hex
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Comparación timing-safe (evita timing attacks)
    if (computedSignature.length !== expectedSignature.length) {
      console.error('❌ Firma inválida: longitud incorrecta');
      return false;
    }

    let match = true;
    for (let i = 0; i < computedSignature.length; i++) {
      if (computedSignature[i] !== expectedSignature[i]) {
        match = false;
      }
    }

    if (!match) {
      console.error('❌ Firma inválida: no coincide');
    }

    return match;
  } catch (e) {
    console.error('❌ Error verificando firma:', e);
    return false;
  }
}

// getAvailableVendor importado de leadManagementService.ts (fuente única)

// ═══════════════════════════════════════════════════════════════
// LÍMITE DE MENSAJES AUTOMÁTICOS POR LEAD
// Máximo 2 mensajes automáticos por día para evitar spam
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = generateRequestId();

    // Inicializar Sentry para error tracking
    const sentry = initSentry(request, env, ctx);
    sentry.setTag('request_id', requestId);
    sentry.setTag('path', url.pathname);
    sentry.addBreadcrumb({
      message: `${request.method} ${url.pathname}`,
      category: 'http',
      level: 'info',
      data: { method: request.method, path: url.pathname }
    });

    // Log incoming request
    log('info', `${request.method} ${url.pathname}`, requestId, {
      method: request.method,
      path: url.pathname,
      ip: request.headers.get('CF-Connecting-IP') || 'unknown'
    });

    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, 'application/json', request);
    }

    try {

    // ═══════════════════════════════════════════════════════════
    // RATE LIMITING: per-endpoint limits (req/min per IP)
    // ═══════════════════════════════════════════════════════════
    const pathname = url.pathname;
    let rateLimitMax = 100; // default: 100/min
    let rateLimitFailClosed = false; // default: fail open for CRM traffic
    if (pathname === '/test-ai-response') {
      rateLimitMax = 10; // expensive Claude API call
      rateLimitFailClosed = true;
    } else if (pathname === '/test-load-test') {
      rateLimitMax = 5; // very expensive: simulates N concurrent leads
      rateLimitFailClosed = true;
    } else if (pathname.startsWith('/run-')) {
      rateLimitMax = 10; // CRON triggers: run-nps, run-backup, etc.
      rateLimitFailClosed = true;
    } else if (pathname === '/test-lead') {
      rateLimitMax = 20; // sends real WhatsApp messages
      rateLimitFailClosed = true;
    }
    const rateLimitError = await checkRateLimit(request, env, requestId, rateLimitMax, rateLimitFailClosed);
    if (rateLimitError) return rateLimitError;

    // ═══════════════════════════════════════════════════════════
    // SEGURIDAD: Verificar autenticación para rutas protegidas
    // ═══════════════════════════════════════════════════════════
    if (requiresAuth(url.pathname)) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;
    }

    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    const cache = new CacheService(env.SARA_CACHE);
    // ═══════════════════════════════════════════════════════════
    // API Routes - Team Members
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/api/team-members') || url.pathname.startsWith('/api/admin/')) {
      const response = await handleTeamRoutes(request, env, supabase);
      if (response) return response;
    }


    // API Routes - Promotions
    if (url.pathname.startsWith("/api/promotions")) {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const response = await handlePromotionRoutes(request, url, supabase, meta);
      if (response) return response;
    }

    // ═══════════════════════════════════════════════════════════════
    // RETELL ROUTES (extracted to src/routes/retell.ts)
    // ═══════════════════════════════════════════════════════════════
    const retellResp = await handleRetellRoutes(url, request, env, supabase, corsResponse, checkApiAuth as any);
    if (retellResp) return retellResp;

    // ═══════════════════════════════════════════════════════════════
    // TEST/DEBUG ROUTES (extracted to src/routes/test.ts)
    // ═══════════════════════════════════════════════════════════════
    const testResp = await handleTestRoutes(url, request, env, supabase, corsResponse, checkApiAuth as any, cache);
    if (testResp) return testResp;

    // ═══════════════════════════════════════════════════════════════
    // API CORE ROUTES (extracted to src/routes/api-core.ts)
    // ═══════════════════════════════════════════════════════════════
    const apiCoreResp = await handleApiCoreRoutes(url, request, env, supabase, corsResponse, checkApiAuth as any);
    if (apiCoreResp) return apiCoreResp;

    // ═══════════════════════════════════════════════════════════════
    // API BI ROUTES (extracted to src/routes/api-bi.ts)
    // ═══════════════════════════════════════════════════════════════
    const apiBiResp = await handleApiBiRoutes(url, request, env, supabase, cache, corsResponse, checkApiAuth as any);
    if (apiBiResp) return apiBiResp;



    // Webhook WhatsApp (Meta)
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/meta' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      
      if (mode === 'subscribe' && token === 'sara_verify_token') {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname === '/webhook/meta' && request.method === 'POST') {
      let from: string | undefined;
      let messageId: string | undefined;
      let kvDedupKey: string | null = null;
      try {
        console.log('📥 WEBHOOK META: Recibiendo mensaje...');

        // Leer body como texto para verificar firma
        const bodyText = await request.text();

        // Verificar firma si META_WEBHOOK_SECRET está configurado
        if (env.META_WEBHOOK_SECRET) {
          const isValid = await verifyMetaSignature(request, bodyText, env.META_WEBHOOK_SECRET);
          if (!isValid) {
            console.error('🚫 WEBHOOK META: Firma inválida - posible spoofing');
            return new Response('Invalid signature', { status: 401 });
          }
          console.log('✅ WEBHOOK META: Firma verificada');
        } else {
          console.warn('⚠️ META_WEBHOOK_SECRET no configurado - webhooks sin verificar');
        }

        const body = safeJsonParse(bodyText, null);
        if (!body) {
          console.error('❌ WEBHOOK META: JSON inválido, bodyText:', bodyText?.substring(0, 200));
          return new Response('OK', { status: 200 });
        }
        console.log('📥 Body recibido:', JSON.stringify(body).substring(0, 500));

        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;
        const statuses = value?.statuses;

        // ═══════════════════════════════════════════════════════════
        // TRACKING DE ESTADOS DE ENTREGA (sent, delivered, read, failed)
        // ═══════════════════════════════════════════════════════════
        if (statuses && statuses.length > 0) {
          for (const status of statuses) {
            const messageId = status.id;
            const statusType = status.status; // sent, delivered, read, failed

            // KV dedup — same message+status combo only processed once
            try {
              const statusDedupKey = `wast:${messageId}:${statusType}`;
              if (await env.SARA_CACHE.get(statusDedupKey)) {
                console.log(`⏭️ Status ya procesado: ${statusType} ${messageId?.substring(0, 20)}...`);
                continue;
              }
              await env.SARA_CACHE.put(statusDedupKey, '1', { expirationTtl: 86400 });
            } catch (_kvErr) { /* fallback: DB upsert is idempotent */ }
            const recipientId = status.recipient_id;
            const timestamp = status.timestamp;
            const errorCode = status.errors?.[0]?.code;
            const errorTitle = status.errors?.[0]?.title;

            console.log(`📬 STATUS UPDATE: ${statusType} | To: ${recipientId} | MsgID: ${messageId?.substring(0, 30)}...`);

            // Guardar en tabla message_delivery_status
            try {
              await supabase.client.from('message_delivery_status').upsert({
                message_id: messageId,
                recipient_phone: recipientId,
                status: statusType,
                timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
                error_code: errorCode,
                error_message: errorTitle,
                updated_at: new Date().toISOString()
              }, { onConflict: 'message_id' });

              // Log especial para errores + encolar en retry_queue
              if (statusType === 'failed') {
                console.error(`❌ MENSAJE FALLIDO: ${recipientId} - Error ${errorCode}: ${errorTitle}`);
                // Encolar en retry_queue para reintento
                try {
                  await enqueueFailedMessage(
                    supabase,
                    recipientId,
                    'text', // tipo genérico, se resolverá en retry
                    { body: `[Re-send from failed status: ${messageId}]`, originalMessageId: messageId },
                    `Status webhook failed: ${errorCode}`,
                    `Meta delivery failed: ${errorCode} - ${errorTitle}`
                  );
                } catch (retryErr) { console.error('⚠️ Error encolando retry:', retryErr); }
              }
            } catch (dbError) {
              // Si la tabla no existe, solo loguear
              console.log(`📬 ${statusType.toUpperCase()}: ${recipientId} (tabla no existe, solo log)`);
            }

            // 🔊 TTS Tracking - Actualizar estado de mensajes TTS
            if (statusType === 'delivered' || statusType === 'read' || statusType === 'failed') {
              try {
                const ttsTracking = createTTSTrackingService(supabase);
                const updated = await ttsTracking.updateTTSStatus(
                  messageId,
                  statusType as 'delivered' | 'read' | 'failed',
                  statusType === 'failed' ? errorTitle : undefined
                );
                if (updated) {
                  console.log(`🔊 TTS Status actualizado: ${messageId.substring(0, 20)}... → ${statusType}`);
                }
              } catch (ttsError) {
                console.error('⚠️ Error actualizando TTS status:', ttsError);
              }

              // 📬 Message Tracking - Actualizar estado de TODOS los mensajes
              try {
                const msgTracking = createMessageTrackingService(supabase);
                await msgTracking.updateMessageStatus(
                  messageId,
                  statusType as 'delivered' | 'read' | 'failed',
                  statusType === 'failed' ? errorTitle : undefined
                );
              } catch (msgError) {
                console.error('⚠️ Error actualizando message tracking:', msgError);
              }
            }
          }
          return new Response('OK', { status: 200 });
        }

        console.log('📥 Messages encontrados:', messages?.length || 0);

        if (messages && messages.length > 0) {
          const message = messages[0];
          from = message.from;
          messageId = message.id; // WhatsApp message ID para dedup
          const messageType = message.type; // text, image, document, interactive, etc.

          // ═══ EXTRAER TEXTO DEL MENSAJE (incluyendo respuestas interactivas) ═══
          let text = '';
          let buttonPayloadRaw = ''; // Raw payload/id para detectar carousel_ver_* etc.
          if (messageType === 'text') {
            text = message.text?.body || '';
          } else if (messageType === 'interactive') {
            // Respuesta a lista o botones
            const interactiveType = message.interactive?.type;
            if (interactiveType === 'list_reply') {
              // Respuesta a lista: preferir título (legible) sobre ID
              text = message.interactive.list_reply?.title || message.interactive.list_reply?.id || '';
              buttonPayloadRaw = message.interactive.list_reply?.id || '';
              console.log(`📋 Respuesta a LISTA: id="${message.interactive.list_reply?.id}", title="${message.interactive.list_reply?.title}"`);
            } else if (interactiveType === 'button_reply') {
              // Respuesta a botones: preferir título (legible) sobre ID (btn_xxx)
              text = message.interactive.button_reply?.title || message.interactive.button_reply?.id || '';
              buttonPayloadRaw = message.interactive.button_reply?.id || '';
              console.log(`🔘 Respuesta a BOTÓN: id="${message.interactive.button_reply?.id}", title="${message.interactive.button_reply?.title}"`);
            }
          } else if (messageType === 'button') {
            // Botón de template (diferente a interactive button)
            text = message.button?.text || message.button?.payload || '';
            buttonPayloadRaw = message.button?.payload || '';
            console.log(`🔲 Respuesta a TEMPLATE BUTTON: "${text}", payload="${buttonPayloadRaw}"`);
          }

          console.log(`📥 Procesando mensaje de ${from}: tipo=${messageType}, texto="${text.substring(0, 50)}..."`);

          // ═══ KV FAST DEDUP: Skip si ya procesamos este messageId ═══
          // MARK-BEFORE + RECOVERY: Marca KV antes de procesar, pero si el procesamiento
          // falla (catch línea ~1526), ELIMINA la entrada KV para que Meta pueda reintentar.
          if (messageId) {
            kvDedupKey = `wamsg:${messageId}`;
            try {
              const kvHit = await env.SARA_CACHE.get(kvDedupKey);
              if (kvHit) {
                console.log(`⏭️ KV dedup: ${messageId} already processed`);
                return new Response('OK', { status: 200 });
              }
              await env.SARA_CACHE.put(kvDedupKey, '1', { expirationTtl: 86400 });
            } catch (kvErr) {
              console.warn('KV dedup failed, falling back to DB:', kvErr);
            }
          }

          // ═══ DEDUPLICACIÓN: Evitar procesar mensajes rápidos duplicados ═══
          const cleanPhone = from.replace(/\D/g, '');
          const now = Date.now();

          // Primero verificar si es un team_member (vendedor, CEO, asesor, etc.)
          const { data: teamMember } = await supabase.client
            .from('team_members')
            .select('id, notes')
            .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
            .maybeSingle();

          if (teamMember) {
            // ═══ DEDUPLICACIÓN TEAM MEMBERS ═══
            const tmNotes = safeJsonParse(teamMember.notes);
            const tmLastMsgId = tmNotes.last_processed_msg_id;

            // Si el mismo mensaje ID ya fue procesado, saltar
            if (tmLastMsgId === messageId) {
              console.log('⏭️ [TEAM] Mensaje ya procesado (mismo ID), saltando');
              return new Response('OK', { status: 200 });
            }

            // Marcar este mensaje como en proceso
            const { error: dedupTmErr } = await supabase.client
              .from('team_members')
              .update({
                notes: {
                  ...tmNotes,
                  last_processed_msg_id: messageId,
                  last_processed_msg_time: now
                }
              })
              .eq('id', teamMember.id);
            if (dedupTmErr) console.error('❌ Dedup team_member write failed:', dedupTmErr.message);
            else console.log(`👤 [TEAM] Deduplicación OK para team_member ${teamMember.id}`);
          } else {
            // ═══ DEDUPLICACIÓN LEADS ═══
            const { data: recentMsg } = await supabase.client
              .from('leads')
              .select('notes')
              .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
              .maybeSingle();

            const leadNotes = safeJsonParse(recentMsg?.notes);
            const lastMsgId = leadNotes.last_processed_msg_id;
            const lastMsgTime = leadNotes.last_processed_msg_time;

            // Si el mismo mensaje ID ya fue procesado, saltar
            if (lastMsgId === messageId) {
              console.log('⏭️ [LEAD] Mensaje ya procesado (mismo ID), saltando');
              return new Response('OK', { status: 200 });
            }

            // Si hubo un mensaje procesado hace menos de 3 segundos, esperar y combinar
            if (lastMsgTime && (now - lastMsgTime) < 3000) {
              console.log('⏳ Mensaje muy rápido, esperando 2s para combinar...');
              await new Promise(r => setTimeout(r, 2000));
            }

            // Marcar este mensaje como en proceso
            if (recentMsg) {
              const { error: dedupLeadErr } = await supabase.client
                .from('leads')
                .update({
                  notes: {
                    ...leadNotes,
                    last_processed_msg_id: messageId,
                    last_processed_msg_time: now
                  }
                })
                .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`);
              if (dedupLeadErr) console.error('❌ Dedup lead write failed:', dedupLeadErr.message);
            }
          }
          // ═══ FIN DEDUPLICACIÓN ═══

          const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
          const meta = await createMetaWithTracking(env, supabase);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);

          // ═══ REACTION ✅ al lead (fire-and-forget, después de crear meta) ═══
          if (messageId && !teamMember && meta) {
            try {
              ctx.waitUntil(
                meta.sendReaction(from, messageId, '✅').catch((e) => console.error('⚠️ Reaction failed:', e))
              );
            } catch (reactErr) { console.error('⚠️ Reaction setup error:', reactErr); }
          }

          // ═══ AVISO FUERA DE HORARIO — DESACTIVADO ═══
          // SARA responde 24/7 con IA. No enviamos "fuera de horario" a leads.
          // El servicio BusinessHoursService sigue disponible para otros usos
          // (ej: coordinadores, reportes) pero NO interrumpe respuestas a leads.
          // ═══ FIN AVISO FUERA DE HORARIO ═══

          // ═══ MANEJO DE MENSAJES VACÍOS / WHITESPACE ═══
          // Si el mensaje es puramente de texto pero vacío o solo whitespace, ignorar
          if (messageType === 'text' && (!text || !text.trim())) {
            console.log('⏭️ Mensaje vacío/whitespace recibido, ignorando');
            return new Response('OK', { status: 200 });
          }

          // ═══ MANEJO DE IMÁGENES PARA FLUJO DE CRÉDITO ═══
          if (messageType === 'image' || messageType === 'document') {
            console.log(`📸 Mensaje de tipo ${messageType} recibido`);

            // Obtener el media_id
            const mediaId = message.image?.id || message.document?.id;
            const caption = message.image?.caption || message.document?.caption || '';

            if (mediaId) {
              try {
                // Obtener URL del media
                const mediaUrl = await meta.getMediaUrl(mediaId);
                console.log(`📸 Media URL obtenida: ${mediaUrl ? 'OK' : 'ERROR'}`);

                if (mediaUrl) {
                  // Verificar si el lead está en flujo de crédito
                  const { CreditFlowService } = await import('./services/creditFlowService');
                  const creditService = new CreditFlowService(supabase, env.OPENAI_API_KEY);

                  // Buscar lead
                  const { data: lead } = await supabase.client
                    .from('leads')
                    .select('*')
                    .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
                    .maybeSingle();

                  if (lead) {
                    const enFlujoCredito = await creditService.estaEnFlujoCredito(lead.id);

                    if (enFlujoCredito) {
                      console.log(`🏦 Lead ${lead.id} en flujo de crédito - procesando documento`);

                      const resultado = await creditService.procesarRespuesta(lead.id, caption);

                      if (resultado) {
                        await meta.sendWhatsAppMessage(from, resultado.respuesta);

                        // Si hay acción de conectar asesor
                        if (resultado.accion === 'conectar_asesor' && resultado.datos?.asesor) {
                          const asesor = resultado.datos.asesor;
                          const vendedorOriginalId = resultado.datos.vendedorOriginalId;

                          // Enviar mensaje al cliente con datos del asesor
                          const msgCliente = creditService.generarMensajeAsesor(
                            asesor,
                            resultado.context
                          );
                          await meta.sendWhatsAppMessage(from, msgCliente);

                          // Notificar al asesor + vendedor original en paralelo (24h safe)
                          const needAsesor = asesor.phone && asesor.is_active !== false;
                          const needVendor = vendedorOriginalId && vendedorOriginalId !== asesor?.id;

                          // Fetch ambos team members en paralelo
                          const [asesorResult, vendedorResult] = await Promise.all([
                            needAsesor
                              ? supabase.client.from('team_members').select('*').eq('id', asesor.id).maybeSingle()
                              : Promise.resolve({ data: null }),
                            needVendor
                              ? supabase.client.from('team_members').select('*').eq('id', vendedorOriginalId).maybeSingle()
                              : Promise.resolve({ data: null })
                          ]);

                          const asesorFull = asesorResult.data;
                          const vendedorOriginal = vendedorResult.data;

                          // Enviar notificaciones en paralelo
                          const notificaciones: Promise<any>[] = [];

                          if (asesorFull) {
                            const msgAsesor = creditService.generarNotificacionAsesor(lead, resultado.context);
                            notificaciones.push(
                              enviarMensajeTeamMember(supabase, meta, asesorFull, msgAsesor, {
                                tipoMensaje: 'alerta_lead',
                                guardarPending: true,
                                pendingKey: 'pending_alerta_lead'
                              }).then(() => console.log(`📤 Asesor ${asesor.name} notificado (enviarMensajeTeamMember)`))
                            );
                          }

                          if (vendedorOriginal?.phone) {
                            const msgVendedor = `🏦 *LEAD EN CRÉDITO HIPOTECARIO*\n\n` +
                              `👤 *${resultado.context.lead_name}*\n` +
                              `📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n\n` +
                              `Tu lead fue asignado al asesor hipotecario *${asesor.name || 'N/A'}* para su trámite de crédito.\n\n` +
                              `💡 Sigues siendo responsable de la venta. Cuando el crédito esté listo, coordina la visita.\n\n` +
                              `Escribe *mis leads* para ver tu lista.`;
                            notificaciones.push(
                              enviarMensajeTeamMember(supabase, meta, vendedorOriginal, msgVendedor, {
                                tipoMensaje: 'alerta_lead',
                                guardarPending: true,
                                pendingKey: 'pending_alerta_lead'
                              }).then(() => console.log(`📤 Vendedor original ${vendedorOriginal.name} notificado del crédito`))
                            );
                          }

                          if (notificaciones.length > 0) {
                            await Promise.all(notificaciones);
                          }
                        }
                      }

                      console.log('✅ Documento de crédito procesado');
                      return new Response('OK', { status: 200 });
                    }
                  }

                  // ═══ BROKER HIPOTECARIO - ANÁLISIS DE DOCUMENTOS ═══
                  // Si el lead tiene needs_mortgage=true y asesor asignado, procesar como doc hipotecario
                  const leadNotesBroker = safeJsonParse(lead.notes);
                  const needsMortgage = leadNotesBroker.needs_mortgage === true;
                  const asesorAsignado = leadNotesBroker.asesor_asignado || lead.assigned_advisor_id;

                  if (needsMortgage && asesorAsignado) {
                    try {
                      console.log(`🏦 Lead ${lead.name} tiene needs_mortgage + asesor - procesando doc hipotecario`);

                      // Meta media URLs require auth headers — download as base64 first
                      const base64Data = await meta.downloadMediaAsBase64(mediaUrl);
                      if (base64Data) {
                        const dataUrl = `data:image/jpeg;base64,${base64Data}`;

                        const { BrokerHipotecarioService } = await import('./services/brokerHipotecarioService');
                        const brokerService = new BrokerHipotecarioService(supabase.client, env.OPENAI_API_KEY);

                        const resultadoBroker = await brokerService.procesarDocumento(lead.id, dataUrl, lead.name || 'Cliente');

                        // Enviar respuesta al lead
                        await meta.sendWhatsAppMessage(from, resultadoBroker.respuesta);

                        // Si todos los documentos están completos, notificar equipo
                        if (resultadoBroker.todosCompletos) {
                          const notifBroker: Promise<any>[] = [];

                          // Notificar asesor asignado
                          const asesorId = typeof asesorAsignado === 'string' ? asesorAsignado : String(asesorAsignado);
                          const { data: asesorMember } = await supabase.client
                            .from('team_members')
                            .select('*')
                            .eq('id', asesorId)
                            .maybeSingle();

                          if (asesorMember) {
                            const msgAsesorBroker = `🏦 *DOCUMENTOS COMPLETOS*\n\n` +
                              `👤 *${lead.name || 'Lead'}*\n` +
                              `📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n\n` +
                              `¡Ya tiene todos los documentos para el trámite hipotecario!\n` +
                              `Revisa y continúa con el proceso.`;
                            notifBroker.push(
                              enviarMensajeTeamMember(supabase, meta, asesorMember, msgAsesorBroker, {
                                tipoMensaje: 'alerta_lead',
                                guardarPending: true,
                                pendingKey: 'pending_alerta_lead'
                              })
                            );
                          }

                          // Notificar vendedor original
                          const vendedorOrigId = leadNotesBroker.vendedor_original_id || lead.assigned_to;
                          if (vendedorOrigId && vendedorOrigId !== asesorId) {
                            const { data: vendedorMember } = await supabase.client
                              .from('team_members')
                              .select('*')
                              .eq('id', vendedorOrigId)
                              .maybeSingle();

                            if (vendedorMember) {
                              const msgVendedorBroker = `🏦 *DOCS HIPOTECARIOS LISTOS*\n\n` +
                                `👤 *${lead.name || 'Lead'}*\n` +
                                `📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n\n` +
                                `Tu lead ya completó todos los documentos para su crédito.\n` +
                                `El asesor procederá con el trámite.`;
                              notifBroker.push(
                                enviarMensajeTeamMember(supabase, meta, vendedorMember, msgVendedorBroker, {
                                  tipoMensaje: 'alerta_lead',
                                  guardarPending: true,
                                  pendingKey: 'pending_alerta_lead'
                                })
                              );
                            }
                          }

                          if (notifBroker.length > 0) {
                            await Promise.all(notifBroker);
                          }
                        }

                        console.log('✅ Documento hipotecario procesado por BrokerService');
                        return new Response('OK', { status: 200 });
                      }
                    } catch (brokerErr) {
                      console.warn('⚠️ Error en BrokerHipotecarioService:', brokerErr);
                      // Fall through to desperfecto handler
                    }
                  }
                }
              } catch (imgErr) {
                console.error('❌ Error procesando imagen:', imgErr);
              }
            }

            // ═══ DETECCIÓN DE FOTOS DE DESPERFECTOS (CLIENTES POST-ENTREGA) ═══
            // caption ya definido arriba en línea 5839
            const captionLower = caption.toLowerCase();

            // Palabras clave que indican desperfectos/problemas
            const palabrasDesperfecto = [
              'humedad', 'húmedo', 'mojado', 'goteras', 'gotera', 'fuga', 'fugas',
              'grieta', 'grietas', 'fisura', 'fisuras', 'cuarteado', 'cuarteadura',
              'rotura', 'roto', 'rota', 'dañado', 'dañada', 'daño', 'desperfecto',
              'mancha', 'manchas', 'moho', 'hongos', 'filtración', 'filtra',
              'problema', 'defecto', 'mal estado', 'deterioro', 'deteriorado',
              'pintura', 'descascarado', 'ampolla', 'burbuja',
              'puerta', 'ventana', 'no cierra', 'no abre', 'atorado', 'atorada',
              'piso', 'azulejo', 'loseta', 'levantado', 'quebrado',
              'tubería', 'drenaje', 'atascado', 'tapado', 'no sirve',
              'luz', 'eléctrico', 'apagón', 'corto', 'chispa',
              'techo', 'plafón', 'caído', 'cayendo'
            ];

            const esReporteDesperfecto = palabrasDesperfecto.some(p => captionLower.includes(p));

            // Buscar lead para verificar si es cliente post-entrega
            const { data: leadImg } = await supabase.client
              .from('leads')
              .select('*, team_members!leads_assigned_to_fkey(phone, name)')
              .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
              .maybeSingle();

            const esClientePostEntrega = leadImg && ['delivered', 'sold', 'closed'].includes(leadImg.status);

            // Si es cliente post-entrega y manda foto (con o sin caption de desperfecto)
            if (esClientePostEntrega && (esReporteDesperfecto || !caption)) {
              console.log(`🏠 Foto de posible desperfecto de cliente post-entrega: ${leadImg.name}`);

              // Notificar al vendedor asignado
              const vendedor = leadImg.team_members;
              if (vendedor?.phone) {
                const tipoProblema = esReporteDesperfecto ? `"${caption}"` : '(sin descripción)';
                await meta.sendWhatsAppMessage(vendedor.phone,
                  `🚨 *REPORTE DE CLIENTE*\n\n` +
                  `👤 ${leadImg.name}\n` +
                  `📱 ${leadImg.phone ? formatPhoneForDisplay(leadImg.phone) : 'Sin tel'}\n` +
                  `🏠 Cliente entregado\n` +
                  `📸 Envió foto ${tipoProblema}\n\n` +
                  `Por favor contacta al cliente para dar seguimiento.`
                );
                console.log(`📤 Vendedor ${vendedor.name} notificado del reporte`);
              }

              // También notificar al CEO
              const CEO_PHONE = '5214922019052';
              await meta.sendWhatsAppMessage(CEO_PHONE,
                `🚨 *REPORTE POST-ENTREGA*\n\n` +
                `👤 ${leadImg.name}\n` +
                `📱 ${leadImg.phone ? formatPhoneForDisplay(leadImg.phone) : 'Sin tel'}\n` +
                `📸 Envió foto: ${caption || '(sin descripción)'}\n` +
                `👷 Vendedor: ${vendedor?.name || 'Sin asignar'}`
              );

              // Responder al cliente
              await meta.sendWhatsAppMessage(from,
                `📸 Recibí tu foto${caption ? ` sobre: "${caption}"` : ''}.\n\n` +
                `Tu reporte ha sido registrado y ${vendedor?.name || 'nuestro equipo'} te contactará pronto para dar seguimiento.\n\n` +
                `Si es algo urgente, puedes llamarnos directamente. ¡Gracias por reportarlo! 🏠`
              );

              // Guardar nota en el lead
              const notaActual = leadImg.notes || [];
              const nuevaNota = {
                text: `📸 REPORTE CON FOTO: ${caption || 'Imagen sin descripción'}`,
                author: 'SARA',
                timestamp: new Date().toISOString(),
                type: 'system'
              };
              await supabase.client
                .from('leads')
                .update({ notes: [...notaActual, nuevaNota] })
                .eq('id', leadImg.id);

              return new Response('OK', { status: 200 });
            }

            // Si hay caption con palabras de desperfecto pero NO es cliente post-entrega
            // (podría ser lead mostrando su casa actual)
            if (esReporteDesperfecto && leadImg && !esClientePostEntrega) {
              console.log(`📸 Lead ${leadImg.name} envió foto con descripción de problema (no es post-entrega)`);
              await meta.sendWhatsAppMessage(from,
                `📸 Veo que me compartes una foto. ¿Es de tu casa actual?\n\n` +
                `Si estás buscando mudarte por esos problemas, ¡tengo casas nuevas desde $1.5M! 🏠\n\n` +
                `¿Te gustaría conocer nuestros desarrollos?`
              );
              return new Response('OK', { status: 200 });
            }

            // ═══ RESPUESTA GENÉRICA PARA DOCUMENTOS (PDF/Word/etc) ═══
            if (messageType === 'document') {
              const docName = message.document?.filename || 'documento';
              console.log(`📄 Documento genérico recibido: ${docName}`);
              await meta.sendWhatsAppMessage(from,
                `📄 Recibimos tu documento "${docName}".\n\n` +
                `Un asesor lo revisará y te contactará. ¡Gracias!`);
              return new Response('OK', { status: 200 });
            }

            // Respuesta genérica para otras imágenes
            if (!text && !caption) {
              await meta.sendWhatsAppMessage(from,
                '📷 Recibí tu imagen. ¿En qué te puedo ayudar?\n\n' +
                '🏠 Si buscas casa, tenemos opciones desde $1.5M\n' +
                '💳 Si necesitas crédito, escríbeme "quiero crédito"');
              return new Response('OK', { status: 200 });
            }
          }
          // ═══ FIN MANEJO DE IMÁGENES ═══

          // ═══ MANEJO DE AUDIOS/NOTAS DE VOZ ═══
          if (messageType === 'audio') {
            console.log(`🎤 Mensaje de audio recibido`);

            const audioId = message.audio?.id;
            const audioMimeType = message.audio?.mime_type || 'audio/ogg';

            if (audioId && env.OPENAI_API_KEY) {
              try {
                const audioService = createAudioTranscription(env.OPENAI_API_KEY, env.META_ACCESS_TOKEN);
                const transcription = await audioService.processWhatsAppAudio({
                  mediaId: audioId,
                  mimeType: audioMimeType
                });

                if (transcription.success && transcription.text) {
                  console.log(`✅ Audio transcrito: "${transcription.text.substring(0, 100)}..."`);

                  // Marcar en el lead que el último mensaje fue audio (para TTS en respuesta)
                  const cleanPhoneAudio = from.replace(/\D/g, '');
                  const { data: leadForAudio } = await supabase.client
                    .from('leads')
                    .select('id, notes')
                    .or(`phone.eq.${cleanPhoneAudio},phone.like.%${cleanPhoneAudio.slice(-10)}`)
                    .maybeSingle();

                  if (leadForAudio) {
                    const notesAudio = typeof leadForAudio.notes === 'object' ? leadForAudio.notes : {};
                    await supabase.client
                      .from('leads')
                      .update({ notes: { ...notesAudio, last_message_was_audio: true } })
                      .eq('id', leadForAudio.id);
                    console.log('🎤 Marcado: último mensaje fue audio (TTS activado para respuesta)');
                  }

                  // Procesar el texto transcrito como si fuera un mensaje normal
                  const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);
                  await handler.handleIncomingMessage(`whatsapp:+${from}`, transcription.text, env);

                  console.log('✅ Audio procesado correctamente');
                  return new Response('OK', { status: 200 });
                } else {
                  // Si falla la transcripción, responder amigablemente
                  console.log(`⚠️ No se pudo transcribir audio: ${transcription.error}`);
                  await meta.sendWhatsAppMessage(from,
                    '🎤 Recibí tu nota de voz, pero no pude escucharla bien. ¿Podrías escribirme tu mensaje? Así te ayudo mejor 😊');
                  return new Response('OK', { status: 200 });
                }
              } catch (audioErr) {
                console.error('❌ Error procesando audio:', audioErr);
                await meta.sendWhatsAppMessage(from,
                  '🎤 Recibí tu audio. Por el momento prefiero mensajes de texto para atenderte mejor. ¿En qué te puedo ayudar? 🏠');
                return new Response('OK', { status: 200 });
              }
            } else {
              // No hay API key de OpenAI - respuesta genérica
              await meta.sendWhatsAppMessage(from,
                '🎤 Recibí tu nota de voz. Por el momento trabajo mejor con mensajes de texto. ¿Podrías escribirme en qué te puedo ayudar? 🏠');
              return new Response('OK', { status: 200 });
            }
          }
          // ═══ FIN MANEJO DE AUDIOS ═══

          // ═══ MANEJO DE STICKERS Y GIFS ═══
          if (messageType === 'sticker') {
            console.log(`😄 Sticker recibido - ignorando silenciosamente`);
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE STICKERS ═══

          // ═══ MANEJO DE UBICACIÓN ═══
          if (messageType === 'location') {
            const lat = message.location?.latitude;
            const lon = message.location?.longitude;
            const locName = message.location?.name || '';
            const locAddress = message.location?.address || '';
            console.log(`📍 Ubicación recibida: lat=${lat}, lon=${lon}, name=${locName}`);

            // Guardar ubicación en lead.notes
            try {
              const cleanPhoneLoc = from.replace(/\D/g, '');
              const { data: leadLoc } = await supabase.client
                .from('leads')
                .select('id, notes')
                .or(`phone.eq.${cleanPhoneLoc},phone.like.%${cleanPhoneLoc.slice(-10)}`)
                .maybeSingle();
              if (leadLoc) {
                const locNotes = typeof leadLoc.notes === 'object' && leadLoc.notes ? leadLoc.notes : {};
                await supabase.client.from('leads').update({
                  notes: { ...locNotes, location: { lat, lon, name: locName, address: locAddress, saved_at: new Date().toISOString() } }
                }).eq('id', leadLoc.id);
                console.log(`📍 Ubicación guardada en lead ${leadLoc.id}`);
              }
            } catch (locErr) {
              console.error('Error guardando ubicación:', locErr);
            }

            // ═══ HAVERSINE: Calcular distancia a cada desarrollo ═══
            const GPS_DESARROLLOS: Array<{ name: string; lat: number; lon: number; zona: string }> = [
              { name: 'Monte Verde', lat: 22.7685, lon: -102.5557, zona: 'Colinas del Padre' },
              { name: 'Los Encinos', lat: 22.7690, lon: -102.5560, zona: 'Colinas del Padre' },
              { name: 'Miravalle', lat: 22.7695, lon: -102.5555, zona: 'Colinas del Padre' },
              { name: 'Paseo Colorines', lat: 22.7680, lon: -102.5550, zona: 'Colinas del Padre' },
              { name: 'Andes', lat: 22.7650, lon: -102.5100, zona: 'Guadalupe' },
              { name: 'Distrito Falco', lat: 22.7700, lon: -102.5200, zona: 'Guadalupe' },
              { name: 'Villa Campelo', lat: 22.7600, lon: -102.5150, zona: 'Citadella del Nogal' },
              { name: 'Villa Galiano', lat: 22.7605, lon: -102.5155, zona: 'Citadella del Nogal' },
            ];

            if (lat && lon) {
              // Haversine formula
              const toRad = (deg: number) => deg * Math.PI / 180;
              const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
                const R = 6371; // km
                const dLat = toRad(lat2 - lat1);
                const dLon = toRad(lon2 - lon1);
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              };

              const distancias = GPS_DESARROLLOS.map(d => ({
                ...d,
                distancia: haversine(lat, lon, d.lat, d.lon)
              })).sort((a, b) => a.distancia - b.distancia);

              // Top 3 más cercanos con precios dinámicos
              const { data: locProps } = await supabase.client.from('properties').select('development_name, name, price_equipped, price, gps_link').limit(50);
              const allProps = locProps || [];
              const top3 = distancias.slice(0, 3);

              let respuesta = `📍 ¡Gracias por tu ubicación! Los desarrollos más cercanos a ti son:\n`;
              for (const dev of top3) {
                const distKm = dev.distancia.toFixed(1);
                const precio = AIConversationService.precioMinDesarrollo(allProps, dev.name);
                respuesta += `\n🏘️ *${dev.name}* (${dev.zona})\n   📏 ~${distKm} km — Desde ${precio}\n`;
              }
              respuesta += `\n¿Cuál te gustaría visitar?`;

              await meta.sendWhatsAppMessage(from, respuesta);

              // CTA button del más cercano (si tiene GPS link)
              const nearest = top3[0];
              const nearestProp = allProps.find(p =>
                (p.development_name || '').toLowerCase().includes(nearest.name.toLowerCase()) && p.gps_link
              );
              if (nearestProp?.gps_link) {
                await new Promise(r => setTimeout(r, 300));
                try {
                  await meta.sendCTAButton(from,
                    `📍 ${nearest.name} es el más cercano a ti (~${nearest.distancia.toFixed(1)} km)`,
                    'Ver ubicación 📍',
                    nearestProp.gps_link
                  );
                } catch (ctaErr: any) {
                  console.error(`❌ CTA location falló: ${ctaErr.message?.slice(0, 200)}`);
                }
              }
            } else {
              // Sin coordenadas válidas — fallback con precios dinámicos
              const { data: fallbackProps } = await supabase.client.from('properties').select('development_name, name, price_equipped, price').limit(50);
              const fbProps = fallbackProps || [];
              const listaDesarrollos = AIConversationService.listaBulletDesarrollos(fbProps);
              await meta.sendWhatsAppMessage(from,
                `📍 ¡Gracias por tu ubicación!\n\nNuestros desarrollos en *Zacatecas*:\n\n${listaDesarrollos}\n\n¿Cuál te gustaría conocer?`);
            }
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE UBICACIÓN ═══

          // ═══ MANEJO DE REACCIONES ═══
          if (messageType === 'reaction') {
            console.log(`👍 Reacción recibida: ${message.reaction?.emoji}`);

            const emoji = message.reaction?.emoji;

            // Ignorar reacciones negativas silenciosamente
            if (emoji === '👎' || emoji === '😡' || emoji === '😠') {
              console.log('⚠️ Reacción negativa - no responder');
              return new Response('OK', { status: 200 });
            }

            // Para reacciones positivas, no responder para no ser invasivo
            // Solo logueamos
            console.log(`✅ Reacción positiva registrada: ${emoji}`);
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE REACCIONES ═══

          // ═══ MANEJO DE VIDEO ═══
          if (messageType === 'video') {
            const videoSizeBytes = message.video?.file_size || 0;
            const videoSizeMB = videoSizeBytes / (1024 * 1024);
            console.log(`🎬 Video recibido (${videoSizeMB.toFixed(1)} MB)`);

            if (videoSizeMB > 20) {
              await meta.sendWhatsAppMessage(from,
                '🎬 Recibimos tu video pero es muy pesado. ¿Puedes enviarnos fotos o un mensaje de texto? Así te podemos ayudar más rápido 📸');
            } else {
              await meta.sendWhatsAppMessage(from,
                '🎬 ¡Gracias por el video! Trabajo mejor con mensajes de texto.\n\n¿Buscas casa en Zacatecas? Cuéntame qué necesitas y te muestro opciones 🏠');
            }
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE VIDEO ═══

          // ═══ MANEJO DE CONTACTOS ═══
          if (messageType === 'contacts') {
            const contacts = message.contacts || [];
            const contactInfo = contacts[0];
            const contactName = contactInfo?.name?.formatted_name || contactInfo?.name?.first_name || '';
            const contactPhone = contactInfo?.phones?.[0]?.phone || contactInfo?.phones?.[0]?.wa_id || '';
            console.log(`👤 Contacto compartido: ${contactName} ${contactPhone}`);

            // Si tiene teléfono válido, crear lead referido
            if (contactPhone) {
              try {
                const cleanContactPhone = contactPhone.replace(/\D/g, '');
                if (cleanContactPhone.length >= 10) {
                  // Verificar si ya existe
                  const { data: existingLead } = await supabase.client
                    .from('leads')
                    .select('id, name')
                    .or(`phone.eq.${cleanContactPhone},phone.like.%${cleanContactPhone.slice(-10)}`)
                    .maybeSingle();

                  if (!existingLead) {
                    // Crear lead referido
                    const cleanPhoneRef = from.replace(/\D/g, '');
                    const { data: referrer } = await supabase.client
                      .from('leads')
                      .select('id, name')
                      .or(`phone.eq.${cleanPhoneRef},phone.like.%${cleanPhoneRef.slice(-10)}`)
                      .maybeSingle();

                    const { error: refInsertErr } = await supabase.client.from('leads').insert({
                      phone: cleanContactPhone,
                      name: contactName || 'Referido',
                      status: 'new',
                      source: 'referral',
                      notes: { referido_por: referrer?.name || from, referido_por_phone: from, created_via: 'shared_contact' }
                    });
                    if (refInsertErr) console.error('⚠️ Error creando lead referido:', refInsertErr.message);
                    else console.log(`✅ Lead referido creado: ${contactName} (${cleanContactPhone})`);

                    await meta.sendWhatsAppMessage(from,
                      `👤 ¡Registré a *${contactName || 'tu contacto'}*! Le escribiré para ofrecerle nuestras casas.\n\n¡Gracias por la referencia! 🏠`);
                  } else {
                    await meta.sendWhatsAppMessage(from,
                      `👤 *${existingLead.name || contactName}* ya está registrado con nosotros. ¡Gracias por compartirlo!`);
                  }
                } else {
                  await meta.sendWhatsAppMessage(from,
                    '👤 ¡Gracias por compartir el contacto! Si busca casa, dile que nos escriba por WhatsApp 🏠');
                }
              } catch (contactErr) {
                console.error('Error procesando contacto compartido:', contactErr);
                await meta.sendWhatsAppMessage(from,
                  '👤 ¡Gracias por compartir el contacto! Si busca casa, con gusto lo atendemos 🏠');
              }
            } else {
              await meta.sendWhatsAppMessage(from,
                '👤 ¡Gracias por compartir el contacto! Si busca casa, dile que nos escriba por WhatsApp 🏠');
            }
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE CONTACTOS ═══

          // ═══ MANEJO DE EMOJIS SOLOS ═══
          const textoLimpio = text.trim();
          // NOTA: Excluir strings puramente numéricos (0-10) para no interferir con respuestas NPS
          const esPuroNumero = /^\d+$/.test(textoLimpio);
          const esEmojiSolo = textoLimpio.length <= 4 && /^[\p{Emoji}\s]+$/u.test(textoLimpio) && !esPuroNumero;

          if (esEmojiSolo && textoLimpio.length > 0) {
            console.log(`😊 Emoji solo recibido: "${textoLimpio}"`);

            // Interpretar emojis comunes
            const emojisPositivos = ['👍', '👌', '✅', '🙌', '💪', '👏', '🔥', '❤️', '😍', '🥰', '😊', '🙂', '😃', '😄', '🤩', '💯'];
            const emojisNegativos = ['👎', '❌', '😢', '😭', '😔', '😞', '🙁', '☹️'];
            const emojisNeutrales = ['🤔', '😐', '😑', '🙄'];
            const emojisCasa = ['🏠', '🏡', '🏘️', '🏢', '🏗️'];
            const emojisDinero = ['💰', '💵', '💸', '🤑'];

            let respuesta = '';

            if (emojisPositivos.some(e => textoLimpio.includes(e))) {
              respuesta = '¡Perfecto! 😊 Me da gusto que te interese.\n\n¿Te gustaría agendar una visita para conocer las casas en persona? Te puedo mostrar las mejores opciones este fin de semana 🏠';
            } else if (emojisNegativos.some(e => textoLimpio.includes(e))) {
              respuesta = 'Entiendo 😊 ¿Hay algo en específico que te preocupe o que pueda ayudarte a resolver?\n\nEstoy aquí para apoyarte en lo que necesites.';
            } else if (emojisNeutrales.some(e => textoLimpio.includes(e))) {
              respuesta = '¿Tienes alguna duda? 🤔 Con gusto te ayudo a resolver cualquier pregunta sobre nuestras casas o el proceso de compra.';
            } else if (emojisCasa.some(e => textoLimpio.includes(e))) {
              respuesta = '¡Veo que te interesan las casas! 🏠\n\nTenemos opciones desde $1.5 millones en Zacatecas. ¿Qué tipo de casa buscas? ¿De 2 o 3 recámaras?';
            } else if (emojisDinero.some(e => textoLimpio.includes(e))) {
              respuesta = '¡Hablemos de números! 💰\n\nTenemos casas desde $1.5M hasta $5M. Aceptamos INFONAVIT, FOVISSSTE y créditos bancarios.\n\n¿Cuál es tu presupuesto aproximado?';
            } else {
              // Emoji no reconocido - respuesta genérica amigable
              respuesta = `¡Hola! 😊 Soy SARA de Grupo Santa Rita.\n\n¿En qué te puedo ayudar hoy? Tenemos casas increíbles en Zacatecas desde $1.5 millones 🏠`;
            }

            await meta.sendWhatsAppMessage(from, respuesta);
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE EMOJIS SOLOS ═══

          // ═══ DETECCIÓN DE LEADS CALIENTES, OBJECIONES Y RESPUESTAS A ENCUESTAS ═══
          // Detectar señales de compra, objeciones y respuestas NPS ANTES de procesar el mensaje
          // NOTA: No filtrar por longitud para capturar respuestas NPS cortas como "1", "10"
          if (text) {
            try {
              const cleanPhoneHot = from.replace(/\D/g, '');
              const { data: leadHot } = await supabase.client
                .from('leads')
                .select('id, name, phone, assigned_to, property_interest, notes, status')
                .or(`phone.eq.${cleanPhoneHot},phone.like.%${cleanPhoneHot.slice(-10)}`)
                .maybeSingle();

              if (leadHot) {
                // PRIMERO: Verificar si hay encuesta pendiente en tabla surveys (enviada desde CRM)
                const pendingSurvey = await checkPendingSurveyResponse(supabase, meta, cleanPhoneHot, text, leadHot.name);
                if (pendingSurvey) {
                  console.log(`📋 Respuesta a encuesta CRM procesada para ${leadHot.name} - NO enviar respuesta genérica`);
                  return new Response('OK', { status: 200 });
                }

                // SEGUNDO: Procesar respuestas a encuestas de CRONs (NPS, post-entrega, etc.)
                // Estos pueden ser mensajes cortos como "1", "10", "si", "no"
                const npsProcessed = leadHot.assigned_to ? await procesarRespuestaNPS(supabase, meta, leadHot, text) : false;
                if (npsProcessed) {
                  console.log(`📊 Respuesta NPS procesada para ${leadHot.name} - NO enviar respuesta genérica`);
                  return new Response('OK', { status: 200 });
                }

                const entregaProcessed = await procesarRespuestaEntrega(supabase, meta, leadHot, text);
                if (entregaProcessed) {
                  console.log(`🔑 Respuesta post-entrega procesada para ${leadHot.name} - NO enviar respuesta genérica`);
                  return new Response('OK', { status: 200 });
                }

                const satisfaccionProcessed = await procesarRespuestaSatisfaccionCasa(supabase, meta, leadHot, text);
                if (satisfaccionProcessed) {
                  console.log(`🏡 Respuesta satisfacción casa procesada para ${leadHot.name} - NO enviar respuesta genérica`);
                  return new Response('OK', { status: 200 });
                }

                const mantenimientoProcessed = await procesarRespuestaMantenimiento(supabase, meta, leadHot, text);
                if (mantenimientoProcessed) {
                  console.log(`🔧 Respuesta mantenimiento procesada para ${leadHot.name} - NO enviar respuesta genérica`);
                  return new Response('OK', { status: 200 });
                }

                // TERCERO: Capturar feedback post-encuesta (mensaje de seguimiento después de calificar)
                const feedbackProcessed = await procesarFeedbackEncuesta(supabase, meta, leadHot, text);
                if (feedbackProcessed) {
                  console.log(`💬 Feedback post-encuesta capturado para ${leadHot.name} - NO enviar respuesta genérica`);
                  return new Response('OK', { status: 200 });
                }

                // DESPUÉS: Detectar señales calientes y objeciones (solo para mensajes más largos)
                if (text.length > 3) {
                  // Detectar señales calientes
                  const señalesCalientes = detectarSeñalesCalientes(text);
                  if (señalesCalientes.length > 0) {
                  console.log(`🔥 Señales calientes detectadas para ${leadHot.name}: ${señalesCalientes.map(s => s.tipo).join(', ')}`);
                  await alertarLeadCaliente(supabase, meta, leadHot, text, señalesCalientes, { openaiApiKey: env.OPENAI_API_KEY });
                }

                // Detectar objeciones
                const objeciones = detectarObjeciones(text);
                if (objeciones.length > 0) {
                  console.error(`⚠️ Objeciones detectadas para ${leadHot.name}: ${objeciones.map(o => o.tipo).join(', ')}`);
                  await alertarObjecion(supabase, meta, leadHot, text, objeciones);
                }
                }
              }
            } catch (hotErr) {
              console.error('Error en detección de leads calientes/objeciones:', hotErr);
            }
          }
          // ═══ FIN DETECCIÓN DE LEADS CALIENTES Y OBJECIONES ═══

          // ═══ CAROUSEL QUICK REPLY: Interceptar payloads carousel_ver_* y carousel_cita_* ═══
          if (buttonPayloadRaw.startsWith('carousel_ver_') || buttonPayloadRaw.startsWith('carousel_cita_')) {
            const isVerMas = buttonPayloadRaw.startsWith('carousel_ver_');
            const slug = buttonPayloadRaw.replace(/^carousel_(ver|cita)_/, '');
            // Reverse slug to development name: monte_verde → Monte Verde
            const devName = slug.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            console.log(`🎠 Carousel ${isVerMas ? 'VER MÁS' : 'AGENDAR CITA'}: slug="${slug}", desarrollo="${devName}"`);

            if (isVerMas) {
              // "Ver más" → trigger resource sending (video+GPS+brochure) for that development
              text = `Quiero ver información de ${devName}`;
            } else {
              // "Agendar visita" → trigger appointment flow for that development
              text = `Quiero agendar una visita a ${devName}`;
            }
          }
          // ═══ FIN CAROUSEL QUICK REPLY ═══

          // ═══ RECURSO QUICK REPLY: Handle recurso_gps_*, recurso_brochure_*, recurso_video_*, recurso_3d_* ═══
          if (buttonPayloadRaw.startsWith('recurso_')) {
            const recursoMatch = buttonPayloadRaw.match(/^recurso_(gps|brochure|video|3d)_(.+)$/);
            if (recursoMatch) {
              const recursoType = recursoMatch[1]; // gps, brochure, video, 3d
              const slug = recursoMatch[2]; // monte_verde, andes, etc.
              const devName = slug.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              console.log(`🖼️ Recurso button tap: tipo="${recursoType}", slug="${slug}", desarrollo="${devName}"`);

              try {
                // Look up property in DB by development name
                const slugNorm = slug.replace(/_/g, ' ');
                const { data: recursoProps } = await supabase.client
                  .from('properties')
                  .select('development, name, gps_link, youtube_link, matterport_link, brochure_urls')
                  .ilike('development', `%${slugNorm}%`)
                  .limit(5);
                const propMatch = (recursoProps || [])[0];

                if (propMatch) {
                  let recursoEnviado = false;
                  if (recursoType === 'gps' && propMatch.gps_link) {
                    await meta.sendCTAButton(from,
                      `📍 Ubicación de *${devName}*`,
                      'Abrir en Maps 📍',
                      propMatch.gps_link
                    );
                    recursoEnviado = true;
                    console.log(`✅ GPS CTA enviado para ${devName}`);
                  } else if (recursoType === 'brochure') {
                    const brochureUrl = Array.isArray(propMatch.brochure_urls)
                      ? propMatch.brochure_urls[0]
                      : (typeof propMatch.brochure_urls === 'string' ? propMatch.brochure_urls : null);
                    if (brochureUrl) {
                      if (brochureUrl.includes('.html') || brochureUrl.includes('pages.dev')) {
                        await meta.sendCTAButton(from,
                          `📋 Brochure de *${devName}*`,
                          'Ver brochure 📋',
                          brochureUrl
                        );
                      } else {
                        // PDF brochure → send as document
                        const filename = `Brochure_${devName.replace(/\s+/g, '_')}.pdf`;
                        await meta.sendWhatsAppDocument(from, brochureUrl, filename, `📋 Brochure ${devName}`);
                      }
                      recursoEnviado = true;
                      console.log(`✅ Brochure enviado para ${devName}`);
                    } else {
                      // Fallback brochure URL
                      const fallbackUrl = `https://sara-backend.edson-633.workers.dev/brochure/${slug.replace(/_/g, '-').replace(/\.html$/, '')}`;
                      await meta.sendCTAButton(from,
                        `📋 Brochure de *${devName}*`,
                        'Ver brochure 📋',
                        fallbackUrl
                      );
                      recursoEnviado = true;
                      console.log(`✅ Brochure fallback enviado para ${devName}`);
                    }
                  } else if (recursoType === 'video' && propMatch.youtube_link) {
                    await meta.sendCTAButton(from,
                      `🎬 Video de *${devName}*`,
                      'Ver video 🎬',
                      propMatch.youtube_link
                    );
                    recursoEnviado = true;
                    console.log(`✅ Video CTA enviado para ${devName}`);
                  } else if (recursoType === '3d' && propMatch.matterport_link) {
                    await meta.sendCTAButton(from,
                      `🏠 Recorrido 3D de *${devName}*`,
                      'Ver recorrido 🏠',
                      propMatch.matterport_link
                    );
                    recursoEnviado = true;
                    console.log(`✅ Matterport CTA enviado para ${devName}`);
                  } else {
                    // Resource not available for this development
                    await meta.sendWhatsAppMessage(from,
                      `Lo siento, ese recurso no está disponible para *${devName}*. ¿Te puedo ayudar con algo más?`);
                    console.log(`⚠️ Recurso "${recursoType}" no disponible para ${devName}`);
                  }

                  // Follow-up de venta después de enviar recurso
                  if (recursoEnviado) {
                    await new Promise(r => setTimeout(r, 1000));
                    const followUps: Record<string, string> = {
                      'gps': `¿Te gustaría visitar *${devName}*? Puedo agendarte una visita este fin de semana 🏡`,
                      'video': `¿Qué te pareció? Si quieres conocerlo en persona, te agendo una visita. ¿Sábado o domingo? 📅`,
                      '3d': `¿Te gustó el recorrido? Nada como verlo en persona. ¿Qué día te funciona para visitarlo? 🏠`,
                      'brochure': `Ahí tienes todos los detalles. ¿Te gustaría agendar una visita para conocer *${devName}*? 📅`,
                    };
                    await meta.sendWhatsAppMessage(from, followUps[recursoType] || `¿Te gustaría visitar *${devName}*? 🏡`);
                    console.log(`✅ Follow-up de venta enviado después de recurso ${recursoType}`);
                  }
                } else {
                  console.error(`⚠️ No se encontró propiedad para slug: ${slug}`);
                  await meta.sendWhatsAppMessage(from,
                    `No encontré información de ese desarrollo. ¿Cuál te interesa conocer?`);
                }
              } catch (recursoErr) {
                console.error('❌ Error procesando recurso button:', recursoErr);
                // Fall through to normal AI processing
              }
              return new Response('OK', { status: 200 });
            }
          }
          // ═══ FIN RECURSO QUICK REPLY ═══

          // ═══ LIST MENU QUICK REPLY: Rewrite cmd_* payloads to recognizable commands ═══
          if (buttonPayloadRaw.startsWith('cmd_')) {
            const cmdMap: Record<string, string> = {
              'cmd_mis_leads': 'mis leads',
              'cmd_citas': 'citas',
              'cmd_hot': 'hot',
              'cmd_pendientes': 'pendientes'
            };

            if (cmdMap[buttonPayloadRaw]) {
              text = cmdMap[buttonPayloadRaw];
              console.log(`📱 List menu cmd rewrite: "${buttonPayloadRaw}" → "${text}"`);
            } else if (buttonPayloadRaw.startsWith('cmd_oferta_')) {
              const leadSlug = buttonPayloadRaw.replace('cmd_oferta_', '').replace(/_/g, ' ');
              text = `oferta ${leadSlug}`;
              console.log(`📱 List menu oferta rewrite: "${buttonPayloadRaw}" → "${text}"`);
            } else if (buttonPayloadRaw.startsWith('cmd_quien_es_')) {
              const nameSlug = buttonPayloadRaw.replace('cmd_quien_es_', '').replace(/_/g, ' ');
              text = `quien es ${nameSlug}`;
              console.log(`📱 List menu quien_es rewrite: "${buttonPayloadRaw}" → "${text}"`);
            } else if (buttonPayloadRaw.startsWith('btn_credito_')) {
              const tipoCredito = buttonPayloadRaw.replace('btn_credito_', '');
              const creditoMap: Record<string, string> = {
                'infonavit': 'Quiero información sobre crédito INFONAVIT',
                'bancario': 'Quiero información sobre crédito bancario',
                'cofinavit': 'Quiero información sobre crédito Cofinavit',
                'fovissste': 'Quiero información sobre crédito FOVISSSTE'
              };
              text = creditoMap[tipoCredito] || `Quiero crédito ${tipoCredito}`;
              console.log(`📱 List menu crédito rewrite: "${buttonPayloadRaw}" → "${text}"`);
            }
          }
          // ═══ FIN LIST MENU QUICK REPLY ═══

          await handler.handleIncomingMessage(`whatsapp:+${from}`, text, env);

          console.log('✅ Mensaje procesado correctamente');

          // Cancelar follow-ups cuando el lead responde
          const followupService = new FollowupService(supabase);
          await followupService.cancelarPorRespuesta('', from);
        } else {
          console.error('⚠️ No hay mensajes en el webhook (puede ser status update)');
        }

        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('❌ Meta Webhook Error:', error);

        // RECOVERY: Si el procesamiento falló, eliminar la marca KV para que
        // el retry de Meta NO sea rechazado como duplicado (Lead Fantasma fix)
        if (kvDedupKey) {
          try {
            await env.SARA_CACHE.delete(kvDedupKey);
            console.log(`🔄 KV dedup cleared for retry: ${kvDedupKey}`);
          } catch (kvCleanErr) {
            console.warn('KV cleanup failed (non-critical):', kvCleanErr);
          }
        }

        // Persist to error_logs
        ctx.waitUntil(logErrorToDB(supabase, 'webhook_error', error instanceof Error ? error.message : String(error), {
          severity: 'critical',
          source: 'webhook:meta',
          stack: error instanceof Error ? error.stack : undefined,
          context: { from: from || 'unknown', messageId: messageId || 'unknown' }
        }));

        return new Response('OK', { status: 200 });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Webhook Facebook Lead Ads - Recibir leads de Meta Ads
    // ═══════════════════════════════════════════════════════════════
    
    if (url.pathname === '/webhook/facebook-leads' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      
      if (mode === 'subscribe' && token === 'sara_fb_leads_token') {
        console.log('✅ Facebook Leads webhook verified');
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname === '/webhook/facebook-leads' && request.method === 'POST') {
      try {
        // Leer body como texto para verificar firma
        const bodyText = await request.text();

        // Verificar firma si META_WEBHOOK_SECRET está configurado
        if (env.META_WEBHOOK_SECRET) {
          const isValid = await verifyMetaSignature(request, bodyText, env.META_WEBHOOK_SECRET);
          if (!isValid) {
            console.error('🚫 FACEBOOK LEADS: Firma inválida - posible spoofing');
            return new Response('Invalid signature', { status: 401 });
          }
          console.log('✅ FACEBOOK LEADS: Firma verificada');
        } else {
          console.warn('⚠️ META_WEBHOOK_SECRET no configurado - webhooks sin verificar');
        }

        const body = safeJsonParse(bodyText, null);
        if (!body) {
          console.error('❌ FACEBOOK LEADS: JSON inválido, bodyText:', bodyText?.substring(0, 200));
          return new Response('OK', { status: 200 });
        }
        console.log('🔥 Facebook Lead recibido:', JSON.stringify(body));

        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];

        // Facebook Lead Ads envía el campo "leadgen_id"
        if (changes?.field === 'leadgen' && changes?.value?.leadgen_id) {
          const leadgenId = changes.value.leadgen_id;
          const formId = changes.value.form_id;
          const pageId = changes.value.page_id;
          const createdTime = changes.value.created_time;

          // KV dedup — prevent duplicate processing of same Facebook lead
          try {
            const fbDedupKey = `fblead:${leadgenId}`;
            if (await env.SARA_CACHE.get(fbDedupKey)) {
              console.log(`⏭️ Facebook lead ya procesado: ${leadgenId}`);
              return new Response('OK', { status: 200 });
            }
            await env.SARA_CACHE.put(fbDedupKey, '1', { expirationTtl: 86400 });
          } catch (_kvErr) { /* fallback: DB phone dedup below */ }

          console.log(`🎯 Nuevo lead de Facebook: ${leadgenId}`);

          // Obtener datos reales del lead desde Graph API
          let leadName = `Facebook Lead ${leadgenId.slice(-6)}`;
          let leadPhone = '';
          let leadEmail = '';
          let leadNotes = '';

          try {
            const fbCtrl = new AbortController();
            const fbTimer = setTimeout(() => fbCtrl.abort(), 10_000);
            const graphResponse = await fetch(
              `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${env.META_ACCESS_TOKEN}`,
              { signal: fbCtrl.signal }
            );
            clearTimeout(fbTimer);

            if (graphResponse.ok) {
              const leadData = await graphResponse.json() as any;
              console.log('📋 Datos del lead:', JSON.stringify(leadData));

              // Parsear field_data del formulario
              if (leadData.field_data) {
                for (const field of leadData.field_data) {
                  const fieldName = field.name?.toLowerCase() || '';
                  const fieldValue = field.values?.[0] || '';

                  if (fieldName.includes('name') || fieldName.includes('nombre')) {
                    leadName = fieldValue || leadName;
                  } else if (fieldName.includes('phone') || fieldName.includes('tel') || fieldName.includes('whatsapp') || fieldName.includes('celular')) {
                    leadPhone = fieldValue.replace(/\D/g, ''); // Solo números
                    // Agregar 521 si es número mexicano de 10 dígitos
                    if (leadPhone.length === 10) {
                      leadPhone = '521' + leadPhone;
                    }
                  } else if (fieldName.includes('email') || fieldName.includes('correo')) {
                    leadEmail = fieldValue;
                  } else {
                    // Otros campos van a notas
                    leadNotes += `${field.name}: ${fieldValue}\n`;
                  }
                }
              }
            } else {
              console.error('❌ Error obteniendo datos de Graph API:', await graphResponse.text());
            }
          } catch (graphError) {
            console.error('❌ Error llamando Graph API:', graphError);
          }

          // Verificar si el lead ya existe (por teléfono o leadgen_id)
          let existingLead = null;
          if (leadPhone) {
            const { data: byPhone } = await supabase.client
              .from('leads')
              .select('*')
              .eq('phone', leadPhone)
              .maybeSingle();
            existingLead = byPhone;
          }

          if (existingLead) {
            console.error(`⚠️ Lead ya existe: ${existingLead.id}`);
            // Actualizar con datos de Facebook si es más reciente
            const { error: fbUpdateErr } = await supabase.client.from('leads').update({
              source: 'facebook_ads',
              notes: `${existingLead.notes || ''}\n---\nActualizado desde Facebook Lead ${leadgenId} el ${new Date().toLocaleString('es-MX')}`
            }).eq('id', existingLead.id);
            if (fbUpdateErr) console.error('⚠️ Error actualizando lead de Facebook:', fbUpdateErr.message);

            return new Response('OK', { status: 200 });
          }

          // Buscar vendedor usando asignación inteligente
          const { data: todosVendedores } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('active', true);

          const vendedorAsignado = getAvailableVendor(todosVendedores || []);

          // Crear lead con datos reales
          const { data: nuevoLead, error } = await supabase.client
            .from('leads')
            .insert({
              name: leadName,
              phone: leadPhone || null,
              email: leadEmail || null,
              source: 'facebook_ads',
              status: 'new',
              score: 65, // Score alto porque viene de ads pagados
              temperature: 'WARM',
              assigned_to: vendedorAsignado?.id || null,
              notes: `Lead de Facebook Ads\n${leadNotes}\n---\nLeadgen ID: ${leadgenId}\nForm ID: ${formId}\nPage ID: ${pageId}`
            })
            .select()
            .maybeSingle();

          if (error) {
            console.error('Error creando lead de Facebook:', error);
          } else {
            console.log(`✅ Lead creado: ${nuevoLead.id} - ${leadName}`);

            // ═══ ATTRIBUTION TRACKING (auto-wire) ═══
            try {
              const attribution = createLeadAttribution(env.SARA_CACHE);
              await attribution.trackLead(nuevoLead.id, leadPhone || '', {
                utm_source: 'facebook',
                utm_medium: 'paid_social',
                utm_campaign: formId ? `form_${formId}` : undefined,
                utm_content: pageId ? `page_${pageId}` : undefined,
              }, leadName);
              console.log(`📊 Attribution tracked: facebook_ads → ${nuevoLead.id}`);
            } catch (attrErr) {
              console.error('⚠️ Attribution tracking error (non-blocking):', attrErr);
            }

            // Notificar al vendedor asignado
            if (vendedorAsignado?.phone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              await meta.sendWhatsAppMessage(vendedorAsignado.phone,
                `🎯 *NUEVO LEAD DE FACEBOOK*\n\n` +
                `👤 *${leadName}*\n` +
                (leadPhone ? `📱 ${leadPhone}\n` : '') +
                (leadEmail ? `📧 ${leadEmail}\n` : '') +
                `\n⏰ ${new Date(createdTime * 1000).toLocaleString('es-MX')}\n\n` +
                `💡 _Contacta al cliente lo antes posible_`
              );
            }

            // ENVIAR TEMPLATE DE BIENVENIDA AL LEAD (fuera de ventana 24h)
            if (leadPhone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              const primerNombre = leadName.split(' ')[0];

              try {
                // Template: bienvenida_lead_facebook con 1 variable (nombre)
                const templateComponents = [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: primerNombre }
                    ]
                  }
                ];

                await meta.sendTemplate(leadPhone, 'bienvenida_lead_facebook', 'es', templateComponents);
                console.log(`✅ Template bienvenida enviado a lead de Facebook: ${leadPhone}`);

                // Marcar que se envió template (SARA se activa cuando responda)
                await supabase.client.from('leads').update({
                  template_sent: 'bienvenida_lead_facebook',
                  template_sent_at: new Date().toISOString()
                }).eq('id', nuevoLead.id);

              } catch (templateError) {
                console.error('⚠️ Error enviando template de bienvenida:', templateError);
                // Si falla el template, al menos el lead ya está creado y el vendedor notificado
              }
            }
          }
        }

        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Facebook Leads Webhook Error:', error);
        return new Response('OK', { status: 200 });
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // Webhook Google Calendar - Sincronizar cambios Google → CRM
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/google-calendar' && request.method === 'POST') {
      try {
        const channelId = request.headers.get('X-Goog-Channel-ID');
        const resourceState = request.headers.get('X-Goog-Resource-State');
        
        console.log('📅 Google Calendar Webhook:', resourceState, channelId);

        // Solo procesar si hay cambios (no sync inicial)
        if (resourceState === 'exists' || resourceState === 'update') {
          console.log('📅 Procesando cambios de Google Calendar...');
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          
          // Obtener eventos de las últimas 24 horas y próximos 30 días
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          
          const events = await calendar.getEvents(yesterday.toISOString(), nextMonth.toISOString());
          const googleEventIds = events.map((e: any) => e.id);
          console.log(`📅 Eventos en Google Calendar: ${events.length}, IDs: ${googleEventIds.slice(0, 5).join(', ')}...`);

          // 1. DETECTAR EVENTOS ELIMINADOS: Buscar citas que tienen google_event_id pero ya no existen en Google
          // IMPORTANTE: Solo verificar citas dentro del rango de fechas que consultamos a Google
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          const nextMonthStr = nextMonth.toISOString().split('T')[0];

          // ✅ FIX 14-ENE-2026: También detectar citas completadas que fueron borradas del calendario
          // ✅ FIX 15-ENE-2026: Incluir canceladas para poder verificar si Sara ya canceló
          const { data: citasConGoogle } = await supabase.client
            .from('appointments')
            .select('*')
            .not('google_event_vendedor_id', 'is', null)
            .in('status', ['scheduled', 'completed', 'cancelled']) // Incluir canceladas para verificar
            .gte('scheduled_date', yesterdayStr)  // Solo citas desde ayer
            .lte('scheduled_date', nextMonthStr); // Hasta próximo mes
          
          console.log(`📅 Citas con google_event_vendedor_id en BD: ${citasConGoogle?.length || 0}`);
          if (citasConGoogle && citasConGoogle.length > 0) {
            console.log(`📅 IDs de eventos en citas: ${citasConGoogle.map(c => c.google_event_vendedor_id?.substring(0,15)).join(', ')}`);
          }

          if (citasConGoogle) {
            for (const cita of citasConGoogle) {
              if (cita.google_event_vendedor_id && !googleEventIds.includes(cita.google_event_vendedor_id)) {
                // El evento fue eliminado de Google Calendar

                // ═══ FIX: Ignorar citas ya procesadas por Sara ═══
                if (cita.status === 'rescheduled') {
                  console.log(`📅 Evento eliminado pero cita ya reagendada, ignorando: ${cita.id}`);
                  continue;
                }
                if (cita.status === 'cancelled') {
                  console.log(`📅 Evento eliminado pero cita ya cancelada por Sara, ignorando: ${cita.id}`);
                  continue;
                }

                // Solo actualizar BD - NO enviar notificaciones (Sara se encarga de eso)
                const eraCompletada = cita.status === 'completed';
                console.log(`📅 Evento eliminado de Google, actualizando BD: ${cita.id} (era: ${cita.status})`);

                await supabase.client
                  .from('appointments')
                  .update({
                    status: 'cancelled',
                    cancelled_by: eraCompletada ? 'Google Calendar (eliminado post-visita)' : 'Google Calendar (eliminado)',
                  })
                  .eq('id', cita.id);

                console.log(`📅 Cita ${cita.id} marcada como cancelada (sin notificaciones - Sara se encarga)`);
              }
            }
          }
          
          // 2. PROCESAR CAMBIOS EN EVENTOS EXISTENTES
          for (const event of events) {
            // Buscar cita en DB por google_event_id
            const { data: appointment } = await supabase.client
              .from('appointments')
              .select('*')
              .eq('google_event_vendedor_id', event.id)
              .maybeSingle();
            
            if (appointment) {
              // Verificar si el evento fue cancelado (marcado como cancelled en Google)
              if (event.status === 'cancelled') {
                // Solo procesar si no estaba ya cancelado
                if (appointment.status !== 'cancelled') {
                  await supabase.client
                    .from('appointments')
                    .update({ 
                      status: 'cancelled', 
                      cancelled_by: 'Google Calendar',
                    })
                    .eq('id', appointment.id);
                  console.log('📅 Cita cancelada desde Google:', appointment.id);
                  
                  // Notificar al LEAD por WhatsApp
                  if (appointment.lead_phone) {
                    try {
                      const fechaStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                      const msgLead = `❌ *CITA CANCELADA*\n\nHola ${appointment.lead_name?.split(' ')[0] || ''} 👋\n\nTu cita del ${fechaStr} a las ${(appointment.scheduled_time || '').substring(0,5)} ha sido cancelada.\n\nSi deseas reagendar, contáctanos. ¡Estamos para servirte! 🏠`;
                      const phoneLead = appointment.lead_phone.replace(/[^0-9]/g, '');
                      await meta.sendWhatsAppMessage(phoneLead, msgLead);
                      console.log('📤 Notificación cancelación (Google→WhatsApp) a lead:', appointment.lead_name);
                    } catch (e) {
                      console.error('⚠️ Error notificando lead:', e);
                    }
                  }
                }
              } else {
                // Actualizar fecha/hora si cambió
                const dateTimeStr = event.start?.dateTime || event.start?.date || '';
                const newDate = dateTimeStr.substring(0, 10);
                const newTime = dateTimeStr.substring(11, 16);
                
                if (newDate && newTime && (appointment.scheduled_date !== newDate || (appointment.scheduled_time || '').substring(0,5) !== newTime)) {
                  const oldDate = appointment.scheduled_date;
                  const oldTime = (appointment.scheduled_time || '').substring(0,5);

                  // ═══ VERIFICAR SI SARA YA REAGENDÓ (evitar duplicados) ═══
                  // Verificar si las notas indican que Sara ya reagendó a esta fecha/hora
                  const notes = appointment.notes || '';
                  if (notes.includes('Reagendada') && notes.includes('→')) {
                    // Formato: "Reagendada de 2026-01-16 10:00 → 2026-01-16 11:15"
                    const partes = notes.split('→');
                    if (partes.length >= 2) {
                      const destino = partes[1].trim(); // "2026-01-16 11:15"
                      if (destino.includes(newDate) && destino.includes(newTime)) {
                        console.log('📅 Webhook Calendar: Ignorando - Sara ya reagendó a', destino);
                        continue; // Saltar notificaciones, Sara ya las envió
                      }
                    }
                  }

                  // Solo actualizar BD - NO enviar notificaciones (Sara ya las envía)
                  await supabase.client
                    .from('appointments')
                    .update({
                      scheduled_date: newDate,
                      scheduled_time: newTime,
                      property_name: event.location || appointment.property_name,
                    })
                    .eq('id', appointment.id);
                  console.log('📅 Cita sincronizada desde Google Calendar:', appointment.id, newDate, newTime);
                  console.log('📅 (Sin notificaciones - Sara ya las envió)');
                }
              }
            }
          }
        }
        
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Google Calendar Webhook Error:', error);
        return new Response('OK', { status: 200 });
      }
    }







    // ═══════════════════════════════════════════════════════════════
    // A/B TEST RESULTS - Ver resultados
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/ab-results') {
      const testName = url.searchParams.get('test') || 'welcome_message';
      const results = await getABTestResults(supabase, testName);
      return corsResponse(JSON.stringify(results || { error: 'No results found' }));
    }

    // ═══ E2E TEST: Resilience Features ═══
    if (url.pathname === '/test-resilience-e2e') {
      const tests: Array<{ name: string; pass: boolean; detail: string }> = [];

      // ── TEST 1: retry_queue table exists ──
      try {
        const { data: rqData, error: rqErr } = await supabase.client.from('retry_queue').select('id', { count: 'exact', head: true });
        tests.push({ name: 'retry_queue table exists', pass: !rqErr, detail: rqErr ? rqErr.message : 'OK' });
      } catch (e: any) { tests.push({ name: 'retry_queue table exists', pass: false, detail: e.message }); }

      // ── TEST 2: enqueueFailedMessage inserts retryable error ──
      try {
        await enqueueFailedMessage(supabase, '5210000099999', 'text', { body: 'E2E test message' }, 'e2e-test', 'Meta API error 500: Internal Server Error');
        const { data: inserted } = await supabase.client.from('retry_queue').select('*').eq('recipient_phone', '5210000099999').eq('context', 'e2e-test').order('created_at', { ascending: false }).limit(1);
        const ok = inserted && inserted.length > 0 && inserted[0].status === 'pending';
        tests.push({ name: 'enqueueFailedMessage inserts pending entry', pass: !!ok, detail: ok ? `id=${inserted![0].id}` : 'No row found' });
      } catch (e: any) { tests.push({ name: 'enqueueFailedMessage inserts pending entry', pass: false, detail: e.message }); }

      // ── TEST 3: enqueueFailedMessage skips non-retryable (400) ──
      try {
        const { count: before } = await supabase.client.from('retry_queue').select('id', { count: 'exact', head: true }).eq('recipient_phone', '5210000088888');
        await enqueueFailedMessage(supabase, '5210000088888', 'text', { body: 'skip' }, 'e2e-skip', 'Meta API error 400: Bad Request');
        const { count: after } = await supabase.client.from('retry_queue').select('id', { count: 'exact', head: true }).eq('recipient_phone', '5210000088888');
        const ok = (after || 0) === (before || 0);
        tests.push({ name: 'enqueueFailedMessage skips 400 error', pass: ok, detail: ok ? 'Correctly skipped' : `before=${before} after=${after}` });
      } catch (e: any) { tests.push({ name: 'enqueueFailedMessage skips 400 error', pass: false, detail: e.message }); }

      // Create meta instance for tests that need it
      const testMeta = await createMetaWithTracking(env, supabase);

      // ── TEST 4: processRetryQueue processes & delivers test entry ──
      try {
        const rqResult = await processRetryQueue(supabase, testMeta, env.DEV_PHONE || '5610016226');
        tests.push({ name: 'processRetryQueue runs without error', pass: true, detail: `processed=${rqResult.processed} delivered=${rqResult.delivered} failed=${rqResult.failedPermanent}` });
      } catch (e: any) { tests.push({ name: 'processRetryQueue runs without error', pass: false, detail: e.message }); }

      // ── TEST 5: processRetryQueue increments attempts on failure ──
      try {
        const { data: updated } = await supabase.client.from('retry_queue').select('*').eq('recipient_phone', '5210000099999').eq('context', 'e2e-test').order('created_at', { ascending: false }).limit(1);
        const entry = updated?.[0];
        const ok = entry && entry.attempts >= 1;
        tests.push({ name: 'retry entry attempts incremented after processing', pass: !!ok, detail: entry ? `attempts=${entry.attempts} status=${entry.status}` : 'No entry found' });
      } catch (e: any) { tests.push({ name: 'retry entry attempts incremented after processing', pass: false, detail: e.message }); }

      // ── TEST 6: KV dedup write ──
      try {
        const testKey = 'wamsg:e2e_test_msg_' + Date.now();
        await env.SARA_CACHE.put(testKey, '1', { expirationTtl: 60 });
        const val = await env.SARA_CACHE.get(testKey);
        tests.push({ name: 'KV dedup write + read works', pass: val === '1', detail: val === '1' ? 'OK' : `got: ${val}` });
      } catch (e: any) { tests.push({ name: 'KV dedup write + read works', pass: false, detail: e.message }); }

      // ── TEST 7: KV dedup blocks duplicate messageId ──
      try {
        const dupKey = 'wamsg:e2e_dup_test_' + Date.now();
        await env.SARA_CACHE.put(dupKey, '1', { expirationTtl: 60 });
        const hit = await env.SARA_CACHE.get(dupKey);
        tests.push({ name: 'KV dedup detects duplicate messageId', pass: hit === '1', detail: hit === '1' ? 'Duplicate correctly detected' : `got: ${hit}` });
      } catch (e: any) { tests.push({ name: 'KV dedup detects duplicate messageId', pass: false, detail: e.message }); }

      // ── TEST 8: KV dedup returns null for new messageId ──
      try {
        const newKey = 'wamsg:e2e_new_test_' + Date.now() + '_unique';
        const miss = await env.SARA_CACHE.get(newKey);
        tests.push({ name: 'KV dedup returns null for new messageId', pass: miss === null, detail: miss === null ? 'Correctly null' : `got: ${miss}` });
      } catch (e: any) { tests.push({ name: 'KV dedup returns null for new messageId', pass: false, detail: e.message }); }

      // ── TEST 9: AI fallback code path exists (import check) ──
      try {
        const hasLogErrorToDB = typeof logErrorToDB === 'function';
        const hasEnviarMensaje = typeof enviarMensajeTeamMember === 'function';
        tests.push({ name: 'AI fallback dependencies available (logErrorToDB + enviarMensajeTeamMember)', pass: hasLogErrorToDB && hasEnviarMensaje, detail: `logErrorToDB=${hasLogErrorToDB} enviarMensajeTeamMember=${hasEnviarMensaje}` });
      } catch (e: any) { tests.push({ name: 'AI fallback dependencies available', pass: false, detail: e.message }); }

      // ── TEST 10: AI fallback - logErrorToDB writes to error_logs ──
      try {
        await logErrorToDB(supabase, 'e2e_test_error', 'Resilience E2E test - safe to ignore', { severity: 'warning' as any, source: 'e2e-test-resilience', context: { test: true } });
        const { data: errLog } = await supabase.client.from('error_logs').select('id').eq('error_type', 'e2e_test_error').eq('source', 'e2e-test-resilience').order('created_at', { ascending: false }).limit(1);
        const ok = errLog && errLog.length > 0;
        tests.push({ name: 'logErrorToDB writes to error_logs table', pass: !!ok, detail: ok ? `id=${errLog![0].id}` : 'No row found' });
        // Cleanup
        if (ok) await supabase.client.from('error_logs').delete().eq('id', errLog![0].id);
      } catch (e: any) { tests.push({ name: 'logErrorToDB writes to error_logs table', pass: false, detail: e.message }); }

      // ── TEST 11: failedMessageCallback is wired in MetaWhatsAppService ──
      try {
        const hasCallback = typeof (testMeta as any).failedMessageCallback === 'function';
        tests.push({ name: 'MetaWhatsAppService has failedMessageCallback wired', pass: hasCallback, detail: hasCallback ? 'Callback is set' : 'Callback is null/undefined' });
      } catch (e: any) { tests.push({ name: 'MetaWhatsAppService has failedMessageCallback wired', pass: false, detail: e.message }); }

      // ── TEST 12: trackingCallback is also wired (sanity) ──
      try {
        const hasTracking = typeof (testMeta as any).trackingCallback === 'function';
        tests.push({ name: 'MetaWhatsAppService has trackingCallback wired (sanity)', pass: hasTracking, detail: hasTracking ? 'OK' : 'Missing' });
      } catch (e: any) { tests.push({ name: 'MetaWhatsAppService has trackingCallback wired', pass: false, detail: e.message }); }

      // ── CLEANUP: Remove test entries from retry_queue ──
      try {
        await supabase.client.from('retry_queue').delete().eq('recipient_phone', '5210000099999');
        await supabase.client.from('retry_queue').delete().eq('recipient_phone', '5210000088888');
      } catch (_) {}

      const passed = tests.filter(t => t.pass).length;
      const failed = tests.filter(t => !t.pass).length;

      return corsResponse(JSON.stringify({
        summary: `${passed}/${tests.length} passed, ${failed} failed`,
        timestamp: new Date().toISOString(),
        tests
      }, null, 2));
    }


    // STATUS: Ver estado de todos los CRONs
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/cron-status') {
      const now = new Date();
      // Usar timezone correcto de México (maneja DST automáticamente)
      const mexicoFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false
      });
      const mexicoParts = mexicoFormatter.formatToParts(now);
      const mexicoHour = parseInt(mexicoParts.find(p => p.type === 'hour')?.value || '0');
      const mexicoMinute = parseInt(mexicoParts.find(p => p.type === 'minute')?.value || '0');
      const mexicoWeekday = mexicoParts.find(p => p.type === 'weekday')?.value || '';
      const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const dayOfWeek = dayMap[mexicoWeekday] ?? now.getUTCDay();
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
      
      const crons = [
        { name: '📋 BRIEFING CONSOLIDADO', hora: '8:00', dias: 'L-V', desc: 'Citas + Leads pendientes + Hipotecas + Cumples + Promos' },
        { name: 'Reporte diario CEO', hora: '8:00', dias: 'L-V' },
        { name: 'Reporte semanal CEO', hora: '8:00', dias: 'Lunes' },
        { name: 'Reporte mensual CEO', hora: '8:00', dias: 'Dia 1' },
        { name: 'Alertas proactivas CEO', hora: '8:00', dias: 'L-V' },
        { name: 'Felicitaciones cumple', hora: '9:00', dias: 'Diario' },
        { name: 'Video semanal', hora: '18:00', dias: 'Viernes' },
        { name: 'Recap diario', hora: '19:00', dias: 'L-V' },
        { name: 'Recap semanal', hora: '12:00', dias: 'Sabado' },
        { name: 'Recordatorios citas', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Follow-ups automáticos', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Videos pendientes', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Remarketing fríos', hora: '8:00', dias: 'Miércoles' },
        { name: 'Seguimiento hipotecas', hora: '8:00', dias: 'Mar/Jue' },
        // POST-COMPRA
        { name: '🔑 Seguimiento post-entrega', hora: '10:00', dias: 'Lun/Jue', desc: '3-7 días después de entrega' },
        { name: '🏡 Satisfacción casa', hora: '11:00', dias: 'Martes', desc: '3-6 meses post-entrega' },
        { name: '🔧 Check-in mantenimiento', hora: '10:00', dias: 'Sábado', desc: '~1 año post-entrega' },
        { name: '🤝 Solicitud referidos', hora: '11:00', dias: 'Miércoles', desc: '30-90 días post-venta' },
        { name: '📊 Encuestas NPS', hora: '10:00', dias: 'Viernes', desc: '7-30 días post-visita/compra' },
        { name: '🎉 Aniversarios compra', hora: '9:00', dias: 'L-V', desc: 'Cada año' },
      ];

      return corsResponse(JSON.stringify({
        ok: true,
        hora_mexico: mexicoHour + ':' + mexicoMinute.toString().padStart(2, '0'),
        dia: dayNames[dayOfWeek],
        crons: crons,
        endpoints_test: [
          '/test-reporte-diario',
          '/test-reporte-semanal',
          '/test-reporte-mensual',
          '/test-alertas-proactivas',
          '/test-alerta-hot',
          '/test-coaching',
          '/test-briefing',
          '/test-followups',
          '/test-video-semanal',
          '/test-remarketing',
          '/test-hipotecas',
          '/run-post-entrega',
          '/run-satisfaccion-casa',
          '/run-mantenimiento',
          '/run-referidos',
          '/run-nps',
          '/run-health-monitor',
          '/health',
          '/backup',
          '/ab-results'
        ]
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // LOAD TEST: Simula N leads concurrentes (NO envía WhatsApp real)
    // POST /test-load-test?concurrent=20&api_key=XXX
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-load-test' && request.method === 'POST') {
      const concurrent = parseInt(url.searchParams.get('concurrent') || '10');
      const maxConcurrent = Math.min(concurrent, 50); // Cap at 50

      const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
      const loadTestMeta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const aiService = new AIConversationService(supabase, null, loadTestMeta, null, claude, env);

      // Obtener propiedades para contexto
      const { data: props } = await supabase.client.from('properties').select('*').limit(50);
      const properties = props || [];

      const desarrollos = ['Monte Verde', 'Los Encinos', 'Distrito Falco', 'Andes', 'Miravalle'];
      const mensajes = [
        'hola busco casa de 3 recamaras',
        'que tienen en {desarrollo}',
        'quiero agendar cita el sabado a las 11'
      ];

      const results: Array<{ leadId: number; step: string; success: boolean; time_ms: number; error?: string }> = [];
      const startTime = Date.now();

      // Simular leads concurrentes
      const promises = Array.from({ length: maxConcurrent }, async (_, i) => {
        const leadNum = i + 1;
        const desarrollo = desarrollos[i % desarrollos.length];

        for (const msgTemplate of mensajes) {
          const msg = msgTemplate.replace('{desarrollo}', desarrollo);
          const stepStart = Date.now();

          try {
            const fakeLead = {
              id: `load-test-${leadNum}`,
              name: `Lead Test ${leadNum}`,
              phone: `521000000${String(leadNum).padStart(4, '0')}`,
              status: 'new',
              score: 0,
              notes: {},
              conversation_history: [],
              property_interest: null,
              assigned_to: null
            };

            const analysis = await aiService.analyzeWithAI(msg, fakeLead, properties);
            const elapsed = Date.now() - stepStart;

            results.push({
              leadId: leadNum,
              step: msg.substring(0, 40),
              success: !!analysis?.response,
              time_ms: elapsed
            });
          } catch (err: any) {
            results.push({
              leadId: leadNum,
              step: msg.substring(0, 40),
              success: false,
              time_ms: Date.now() - stepStart,
              error: err.message?.substring(0, 100)
            });
          }
        }
      });

      await Promise.all(promises);

      const totalTime = Date.now() - startTime;
      const successResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      const times = successResults.map(r => r.time_ms);
      const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      const maxTime = times.length > 0 ? Math.max(...times) : 0;
      const minTime = times.length > 0 ? Math.min(...times) : 0;

      return corsResponse(JSON.stringify({
        ok: true,
        concurrent: maxConcurrent,
        total_requests: results.length,
        success: successResults.length,
        failed: failedResults.length,
        total_time_ms: totalTime,
        avg_response_ms: avgTime,
        min_response_ms: minTime,
        max_response_ms: maxTime,
        errors: failedResults.map(r => ({ lead: r.leadId, step: r.step, error: r.error }))
      }));
    }

    return corsResponse(JSON.stringify({ error: 'Not Found' }), 404);
    } catch (error) {
      // Capturar error en Sentry con contexto completo
      sentry.captureException(error, {
        request_id: requestId,
        path: url.pathname,
        method: request.method,
        ip: request.headers.get('CF-Connecting-IP') || 'unknown'
      });

      log('error', `Unhandled error: ${error instanceof Error ? error.message : String(error)}`, requestId, {
        error: error instanceof Error ? error.stack : String(error)
      });

      // Track error in KV for rate monitoring
      ctx.waitUntil(trackError(env, 'fetch_error'));

      // Persist to error_logs (create new supabase instance since the one in try block is out of scope)
      try {
        const errorSupabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        ctx.waitUntil(logErrorToDB(errorSupabase, 'fetch_error', error instanceof Error ? error.message : String(error), {
          severity: 'critical',
          source: `fetch:${url.pathname}`,
          stack: error instanceof Error ? error.stack : undefined,
          context: { request_id: requestId, path: url.pathname, method: request.method }
        }));
      } catch (logErr) { console.error('⚠️ Error logging to DB failed:', logErr); }

      return corsResponse(JSON.stringify({
        error: 'Internal Server Error',
        request_id: requestId
      }), 500, 'application/json', request);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CRON JOBS - Mensajes automáticos
  // ═══════════════════════════════════════════════════════════
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Inicializar Sentry para cron jobs
    const cronRequest = new Request('https://cron.internal/scheduled');
    const sentry = initSentry(cronRequest, env, ctx);
    sentry.setTag('cron', event.cron);
    sentry.addBreadcrumb({
      message: `Cron triggered: ${event.cron}`,
      category: 'cron',
      level: 'info'
    });

    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    try {
    const meta = await createMetaWithTracking(env, supabase);

    const now = new Date();

    // Usar timezone correcto de México (maneja DST automáticamente)
    const mexicoFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false
    });
    const mexicoParts = mexicoFormatter.formatToParts(now);
    const mexicoHour = parseInt(mexicoParts.find(p => p.type === 'hour')?.value || '0');
    const mexicoMinute = parseInt(mexicoParts.find(p => p.type === 'minute')?.value || '0');
    const mexicoWeekday = mexicoParts.find(p => p.type === 'weekday')?.value || '';

    // Mapear día de la semana (Mon=1, Tue=2, ..., Sun=0)
    const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const dayOfWeek = dayMap[mexicoWeekday] ?? now.getUTCDay();

    // Solo ejecutar tareas horarias en el minuto exacto (evita duplicados)
    const isFirstRunOfHour = mexicoMinute === 0;

    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`🕐 CRON EJECUTADO`);
    console.log(`   UTC: ${now.toISOString()}`);
    console.log(`   México: ${mexicoHour}:${mexicoMinute.toString().padStart(2, '0')} (${mexicoWeekday})`);
    console.log(`   Día semana: ${dayOfWeek} (0=Dom, 1=Lun...)`);
    console.log(`   isFirstRunOfHour: ${isFirstRunOfHour}`);
    console.log(`   Cron trigger: ${event.cron}`);
    console.log(`═══════════════════════════════════════════════════════════`);

    // Log CRON execution (solo cada hora para no saturar)
    if (isFirstRunOfHour) {
      await logEvento(supabase, 'cron', `CRON horario: ${mexicoHour}:00 (${mexicoWeekday})`, { hora: mexicoHour, dia: dayOfWeek });
    }

    // Obtener vendedores activos
    const { data: vendedores, error: vendedoresError } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('active', true);

    // CronTracker: tracks execution time + errors for each CRON task
    const cronTracker = new CronTracker(event.cron);
    async function safeCron(label: string, fn: () => Promise<any>): Promise<void> {
      await cronTracker.track(label, fn);
    }

    console.log(`👥 Vendedores activos: ${vendedores?.length || 0}`);
    if (vendedoresError) {
      console.error(`❌ Error obteniendo vendedores:`, vendedoresError);
    }
    if (vendedores) {
      vendedores.forEach((v: any) => {
        console.log(`   - ${v.name} (${v.role}): phone=${v.phone ? '✅' : '❌'}, recibe_briefing=${v.recibe_briefing ? '✅' : '❌'}, last_briefing=${v.last_briefing_sent || 'nunca'}`);
      });
    }

    // ═══════════════════════════════════════════════════════════
    // REASIGNAR LEADS SIN VENDEDOR - Cada 2 minutos
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '*/2 * * * *') {
      console.log('🔍 Buscando leads sin vendedor asignado...');
      try {
        // Buscar leads con assigned_to = null creados en las últimas 24h
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: leadsSinVendedor, error: lsvError } = await supabase.client
          .from('leads')
          .select('id, name, phone, property_interest, created_at')
          .is('assigned_to', null)
          .gte('created_at', hace24h)
          .limit(10);

        if (lsvError) {
          console.error('❌ Error buscando leads sin vendedor:', lsvError);
        } else if (leadsSinVendedor && leadsSinVendedor.length > 0) {
          console.log(`🚨 ENCONTRADOS ${leadsSinVendedor.length} leads SIN VENDEDOR:`);

          for (const lead of leadsSinVendedor) {
            console.log(`   - ${lead.name || 'Sin nombre'} (${lead.phone}) - ${lead.property_interest || 'Sin desarrollo'}`);

            // Intentar asignar vendedor
            const vendedorDisponible = getAvailableVendor(vendedores || []);
            if (vendedorDisponible) {
              const { error: updateError } = await supabase.client
                .from('leads')
                .update({
                  assigned_to: vendedorDisponible.id,
                  notes: {
                    reasignado_automaticamente: true,
                    reasignado_at: new Date().toISOString(),
                    reasignado_a: vendedorDisponible.name
                  }
                })
                .eq('id', lead.id);

              if (!updateError) {
                console.log(`   ✅ REASIGNADO a ${vendedorDisponible.name}`);

                // Notificar al vendedor (respetando ventana 24h)
                if (vendedorDisponible.phone) {
                  try {
                    const msgReasignado = `🚨 *LEAD REASIGNADO*\n\n` +
                      `Se te asignó un lead que estaba sin vendedor:\n\n` +
                      `👤 *${lead.name || 'Sin nombre'}*\n` +
                      `📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n` +
                      `🏠 ${lead.property_interest || 'Sin desarrollo definido'}\n\n` +
                      `⚠️ Este lead estuvo sin atención, contáctalo lo antes posible.\n\n` +
                      `Escribe *leads* para ver tu lista completa.`;
                    await enviarMensajeTeamMember(supabase, meta, vendedorDisponible, msgReasignado, {
                      tipoMensaje: 'alerta_lead',
                      guardarPending: true,
                      pendingKey: 'pending_alerta_lead'
                    });
                    console.log(`   📤 Notificación enviada a ${vendedorDisponible.name} (via enviarMensajeTeamMember)`);
                  } catch (notifError) {
                    console.log(`   ⚠️ Error enviando notificación:`, notifError);
                  }
                }
              } else {
                console.log(`   ❌ Error reasignando:`, updateError);
              }
            } else {
              console.log(`   ⚠️ No hay vendedor disponible para reasignar`);
            }
          }
        } else {
          console.log('✅ No hay leads sin vendedor en las últimas 24h');
        }
      } catch (e) {
        console.error('❌ Error en reasignación de leads:', e);
      }

      // ═══════════════════════════════════════════════════════════
      // 🚨 ALERTA INTELIGENTE: Leads sin seguimiento del vendedor
      // - Espera a que SARA haya respondido y extraído datos
      // - Muestra contexto completo (qué dijo lead, qué respondió SARA)
      // - Sugiere mensaje de seguimiento para aprobar/editar
      // ═══════════════════════════════════════════════════════════
      console.log('🔍 Verificando leads nuevos sin contactar...');
      try {
        const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        // Buscar leads: creados hace 10-120 min, con vendedor, sin actividad registrada
        const { data: leadsNuevosSinContactar } = await supabase.client
          .from('leads')
          .select('id, name, phone, property_interest, assigned_to, created_at, notes, conversation_history')
          .not('assigned_to', 'is', null)
          .lt('created_at', hace10min)      // Creado hace más de 10 min
          .gt('created_at', hace2h)         // Pero menos de 2h (no muy viejos)
          .limit(10);

        if (leadsNuevosSinContactar && leadsNuevosSinContactar.length > 0) {
          // Batch: cargar actividades de TODOS los leads de una vez (evita N+1 queries)
          const leadIds = leadsNuevosSinContactar.map((l: any) => l.id);
          const { data: allActivities } = await supabase.client
            .from('lead_activities')
            .select('lead_id, team_member_id')
            .in('lead_id', leadIds);

          const activitySet = new Set(
            (allActivities || []).map((a: any) => `${a.lead_id}:${a.team_member_id}`)
          );

          // Reuse vendedores already fetched at CRON start (line 2408)
          const vendedoresMap = new Map((vendedores || []).map((v: any) => [v.id, v]));

          // Filtrar los que realmente no han sido contactados
          for (const lead of leadsNuevosSinContactar) {
            const notas = typeof lead.notes === 'object' ? lead.notes : {};
            const yaAlertado = notas.alerta_sin_contactar_enviada;
            if (yaAlertado) continue;

            // NUEVO: Esperar a que SARA haya extraído al menos nombre O desarrollo
            // Si no hay ninguno, SARA aún no ha procesado bien → esperar
            const tieneNombre = lead.name && lead.name.trim().length > 0 && !['lead', 'nuevo', 'sin nombre'].includes(lead.name.toLowerCase().trim());
            const tieneDesarrollo = lead.property_interest && lead.property_interest.trim().length > 0;

            // Si no tiene ni nombre ni desarrollo, esperar un poco más
            if (!tieneNombre && !tieneDesarrollo) {
              console.log(`⏳ Lead ${lead.phone} sin datos extraídos aún, esperando...`);
              continue;
            }

            // Verificar si hay actividad del vendedor (batch lookup)
            const tieneActividad = activitySet.has(`${lead.id}:${lead.assigned_to}`);
            if (tieneActividad) continue;

            // Lookup vendedor del cache (no query individual)
            const vendedor = vendedoresMap.get(lead.assigned_to) as any;

            if (vendedor?.phone) {
              const minutosSinContactar = Math.round((Date.now() - new Date(lead.created_at).getTime()) / 60000);

              // Extraer último mensaje del lead y respuesta de SARA del historial
              const historial = Array.isArray(lead.conversation_history) ? lead.conversation_history : [];
              const mensajesLead = historial.filter((m: any) => m.role === 'user' || m.from === 'lead');
              const mensajesSara = historial.filter((m: any) => m.role === 'assistant' || m.from === 'sara');

              const ultimoMensajeLead = mensajesLead.length > 0
                ? (mensajesLead[mensajesLead.length - 1].content || mensajesLead[mensajesLead.length - 1].message || '').substring(0, 100)
                : '';
              const ultimaRespuestaSara = mensajesSara.length > 0
                ? (mensajesSara[mensajesSara.length - 1].content || mensajesSara[mensajesSara.length - 1].message || '').substring(0, 120)
                : '';

              // Identificador del lead: nombre si existe, si no teléfono formateado
              const telefonoCorto = lead.phone.replace(/^521/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
              const identificadorLead = tieneNombre ? lead.name : `Lead ${telefonoCorto}`;
              const primerNombre = tieneNombre ? lead.name.split(' ')[0] : 'cliente';

              // Generar sugerencia de mensaje basada en contexto
              let sugerenciaMensaje = '';
              if (tieneDesarrollo) {
                sugerenciaMensaje = `Hola${tieneNombre ? ' ' + primerNombre : ''}, soy ${vendedor.name} de Grupo Santa Rita. Vi tu interés en ${lead.property_interest}. ¿Te gustaría que te cuente más o agendamos una visita?`;
              } else {
                sugerenciaMensaje = `Hola${tieneNombre ? ' ' + primerNombre : ''}, soy ${vendedor.name} de Grupo Santa Rita. ¿En qué puedo ayudarte? Tenemos casas desde $1.5M con excelentes ubicaciones.`;
              }

              // Construir mensaje de alerta completo
              let alertaMsg = `⏰ *SEGUIMIENTO PENDIENTE*\n\n`;
              alertaMsg += `👤 *${identificadorLead}*\n`;
              alertaMsg += `📱 ${telefonoCorto}\n`;
              alertaMsg += `🏠 ${lead.property_interest || 'Sin desarrollo aún'}\n`;
              alertaMsg += `⏱️ Hace ${minutosSinContactar} min\n\n`;

              if (ultimoMensajeLead) {
                alertaMsg += `💬 *Lead dijo:*\n"${ultimoMensajeLead}${ultimoMensajeLead.length >= 100 ? '...' : ''}"\n\n`;
              }

              if (ultimaRespuestaSara) {
                alertaMsg += `🤖 *SARA respondió:*\n"${ultimaRespuestaSara}${ultimaRespuestaSara.length >= 120 ? '...' : ''}"\n\n`;
              }

              alertaMsg += `📝 *Sugerencia:*\n"${sugerenciaMensaje}"\n\n`;
              alertaMsg += `→ *ok* - Enviar sugerencia\n`;
              alertaMsg += `→ *bridge ${primerNombre}* - Chat directo\n`;
              alertaMsg += `→ Escribe tu mensaje para enviarlo`;

              await enviarMensajeTeamMember(supabase, meta, vendedor, alertaMsg, {
                tipoMensaje: 'alerta_lead',
                pendingKey: 'pending_alerta_lead'
              });
              console.log(`⏰ ALERTA INTELIGENTE enviada a ${vendedor.name}: ${identificadorLead} sin contactar (${minutosSinContactar} min)`);

              // Marcar como alertado y guardar sugerencia para cuando responda "ok"
              await supabase.client.from('leads')
                .update({
                  notes: {
                    ...notas,
                    alerta_sin_contactar_enviada: new Date().toISOString(),
                    sugerencia_pendiente: sugerenciaMensaje,
                    alerta_vendedor_id: vendedor.id
                  }
                })
                .eq('id', lead.id);
            }
          }
        }
      } catch (e) {
        console.error('❌ Error verificando leads sin contactar:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // BACKUP DIARIO - Corre con tareas nocturnas 1 AM UTC (7 PM México)
    // Guarda backup en KV, mantiene últimos 7 días
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '0 1 * * *') {
      console.log('💾 INICIANDO BACKUP DIARIO...');
      try {
        const backupDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const backupKey = `backup:${backupDate}`;

        // Generar backup
        const backupData = await exportBackup(supabase);
        backupData.backup_date = backupDate;
        backupData.backup_type = 'automated_daily';

        // Calcular tamaño aproximado
        const backupJson = JSON.stringify(backupData);
        const backupSizeKB = Math.round(backupJson.length / 1024);

        console.log(`📊 Backup generado: ${backupSizeKB} KB`);
        console.log(`   - Leads: ${backupData.tables?.leads?.count || 0}`);
        console.log(`   - Appointments: ${backupData.tables?.appointments?.count || 0}`);
        console.log(`   - Team: ${backupData.tables?.team_members?.count || 0}`);
        console.log(`   - Properties: ${backupData.tables?.properties?.count || 0}`);

        // Guardar en KV (si está disponible)
        if (env.SARA_CACHE) {
          // Guardar backup (expira en 7 días)
          await env.SARA_CACHE.put(backupKey, backupJson, {
            expirationTtl: 7 * 24 * 60 * 60 // 7 días
          });

          // Guardar metadata del último backup
          const backupMeta = {
            last_backup: backupDate,
            last_backup_time: now.toISOString(),
            size_kb: backupSizeKB,
            tables: {
              leads: backupData.tables?.leads?.count || 0,
              appointments: backupData.tables?.appointments?.count || 0,
              team_members: backupData.tables?.team_members?.count || 0,
              properties: backupData.tables?.properties?.count || 0,
            },
            status: backupData.status
          };
          await env.SARA_CACHE.put('backup:latest', JSON.stringify(backupMeta));

          console.log(`✅ BACKUP GUARDADO: ${backupKey} (${backupSizeKB} KB)`);

          // Notificar al CEO (solo si hay errores o es lunes para resumen semanal)
          const dayOfWeek = now.getDay();
          if (backupData.status !== 'success' || dayOfWeek === 1) {
            const emoji = backupData.status === 'success' ? '✅' : '⚠️';
            await enviarAlertaSistema(meta,
              `💾 BACKUP ${backupData.status === 'success' ? 'COMPLETADO' : 'CON ERRORES'}\n\n` +
              `${emoji} Fecha: ${backupDate}\n` +
              `📊 Tamaño: ${backupSizeKB} KB\n` +
              `📋 Datos:\n` +
              `• Leads: ${backupData.tables?.leads?.count || 0}\n` +
              `• Citas: ${backupData.tables?.appointments?.count || 0}\n` +
              `• Equipo: ${backupData.tables?.team_members?.count || 0}\n` +
              `• Propiedades: ${backupData.tables?.properties?.count || 0}`,
              env, 'backup'
            );
          }
        } else {
          console.warn('⚠️ KV no disponible, backup no guardado');
        }
      } catch (e) {
        console.error('❌ Error en backup diario:', e);
        // Notificar error
        try {
          await enviarAlertaSistema(meta,
            `🚨 ERROR EN BACKUP\n\nError: ${String(e)}\n\nPor favor revisar logs.`,
            env, 'backup_error'
          );
        } catch (notifyErr) {
          console.error('❌ No se pudo notificar error de backup');
        }
      }
    }

    // (Cumpleaños movido más abajo para incluir leads + equipo)

    // ═══════════════════════════════════════════════════════════
    // ARCHIVAL: Recortar conversation_history >90 días (diario, 7 PM MX)
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '0 1 * * *') {
      try {
        console.log('🗄️ Iniciando archival de conversation_history...');
        await archivarConversationHistory(supabase);
      } catch (e) {
        console.error('❌ Error en archival:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // DEDUP SCAN - Escanear leads duplicados diario 7 PM MX
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '0 1 * * *') {
      try {
        const dedup = createLeadDeduplication();
        const { data: activeLeads } = await supabase.client
          .from('leads')
          .select('id, phone, name, email, status, created_at, assigned_to')
          .not('status', 'in', '("lost","inactive","fallen")')
          .order('created_at', { ascending: false })
          .limit(500);
        if (activeLeads && activeLeads.length > 10) {
          const duplicates = dedup.findDuplicates(activeLeads);
          const highConfidence = duplicates.filter(d => d.confidence >= 0.7);
          if (highConfidence.length > 0) {
            console.log(`🔍 Dedup scan: ${highConfidence.length} potential duplicates found`);
            // Flag top 10 in leads notes
            for (const dup of highConfidence.slice(0, 10)) {
              const lead1Id = dup.lead1?.id;
              const lead2Id = dup.lead2?.id;
              if (lead1Id && lead2Id) {
                console.log(`  ⚠️ ${dup.lead1?.name || dup.lead1?.phone} ↔ ${dup.lead2?.name || dup.lead2?.phone} (${Math.round(dup.confidence * 100)}% ${dup.matchType})`);
              }
            }
            // Notify dev
            await meta.sendWhatsAppMessage(env.DEV_PHONE || '5610016226',
              `🔍 *Dedup Scan Diario*\n\n` +
              `Encontrados ${highConfidence.length} posibles duplicados:\n\n` +
              highConfidence.slice(0, 5).map((d, i) =>
                `${i + 1}. ${d.lead1?.name || d.lead1?.phone || '?'} ↔ ${d.lead2?.name || d.lead2?.phone || '?'} (${Math.round(d.confidence * 100)}%)`
              ).join('\n') +
              `\n\n_Revisa en CRM → Leads → Duplicados_`
            );
          } else {
            console.log('🔍 Dedup scan: no duplicates found');
          }
        }
      } catch (dedupErr) {
        console.error('⚠️ Dedup scan error (non-blocking):', dedupErr);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // BACKUP SEMANAL R2 - Domingos 7 PM MX (1 AM UTC lunes)
    // Exporta conversations + leads activos como JSONL
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '0 1 * * *' && dayOfWeek === 0) { // domingo
      try {
        if (env.SARA_BACKUPS) {
          console.log('💾 Iniciando backup semanal R2...');
          const result = await backupSemanalR2(supabase, env.SARA_BACKUPS);
          console.log(`✅ Backup R2: ${result.conversations.rows} convs, ${result.leads.rows} leads`);
          // Notificar al dev
          await enviarAlertaSistema(meta,
            `💾 *Backup Semanal R2*\n\n` +
            `📝 Conversaciones: ${result.conversations.rows} (${Math.round(result.conversations.bytes/1024)}KB)\n` +
            `👤 Leads activos: ${result.leads.rows} (${Math.round(result.leads.bytes/1024)}KB)`,
            env, 'backup_r2'
          );
        } else {
          console.log('⚠️ R2 no configurado, saltando backup semanal');
        }
      } catch (e) {
        console.error('❌ Error en backup semanal R2:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LIMPIEZA: Flags de encuestas expirados (>72h) - diario 7 PM MX
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '0 1 * * *') {
      try {
        await limpiarFlagsEncuestasExpirados(supabase);
      } catch (e) {
        console.error('❌ Error limpiando flags expirados:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 🎓 ONE-TIME: Reset onboarding 23-ene-2026 7:56am (antes del briefing)
    // Para que todos los vendedores vean el tutorial de SARA
    // ═══════════════════════════════════════════════════════════
    const fechaHoy = now.toISOString().split('T')[0];
    if (fechaHoy === '2026-01-23' && mexicoHour === 7 && mexicoMinute >= 54 && mexicoMinute <= 58) {
      console.log('🎓 ONE-TIME: Reseteando onboarding de todos los vendedores...');
      try {
        const { data: todosVendedores } = await supabase.client
          .from('team_members')
          .select('id, name, notes')
          .eq('active', true);

        let reseteados = 0;
        for (const v of todosVendedores || []) {
          const notas = safeJsonParse(v.notes);
          if (notas.onboarding_completed) {
            delete notas.onboarding_completed;
            delete notas.onboarding_date;
            await supabase.client.from('team_members').update({ notes: notas }).eq('id', v.id);
            reseteados++;
            console.log(`   ✅ Reset onboarding: ${v.name}`);
          }
        }
        console.log(`🎓 ONBOARDING RESET COMPLETADO: ${reseteados} vendedores`);

        // Notificar al admin
        await enviarAlertaSistema(meta,
          `🎓 ONBOARDING RESET\n\nSe reseteó el tutorial de ${reseteados} vendedores.\n\nLa próxima vez que escriban a SARA, verán el tutorial completo con comandos.`,
          env, 'onboarding_reset'
        );
      } catch (e) {
        console.error('❌ Error reseteando onboarding:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7:55am L-V: REACTIVAR VENTANAS 24H - Enviar templates a quienes no han
    // interactuado en 24h para que les lleguen los briefings
    // ═══════════════════════════════════════════════════════════════════════════
    if (mexicoHour === 7 && mexicoMinute >= 55 && mexicoMinute <= 59 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🔄 REACTIVACIÓN 24H - Checando ventanas de WhatsApp...');
      try {
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const hoyReactivacion = new Date().toISOString().split('T')[0];

        // Obtener team members activos que reciben briefings
        const { data: miembros } = await supabase.client
          .from('team_members')
          .select('id, name, phone, notes')
          .eq('active', true)
          .eq('recibe_briefing', true);

        let reactivados = 0;
        for (const m of miembros || []) {
          if (!m.phone) continue;

          const notas = typeof m.notes === 'object' ? m.notes : {};
          const lastInteraction = notas?.last_sara_interaction;
          const yaReactivadoHoy = notas?.reactivacion_enviada === hoyReactivacion;

          // Si nunca ha interactuado O hace más de 24h Y no se le reactivó hoy
          const necesitaReactivar = (!lastInteraction || lastInteraction < hace24h) && !yaReactivadoHoy;

          if (necesitaReactivar) {
            console.log(`   📤 Reactivando ventana para ${m.name}...`);
            try {
              // MARK-BEFORE-SEND: Marcar ANTES de enviar para evitar duplicados por race condition
              const updatedNotes = { ...notas, reactivacion_enviada: hoyReactivacion };
              await supabase.client
                .from('team_members')
                .update({ notes: updatedNotes })
                .eq('id', m.id);

              // Enviar template de reactivación
              const nombre = m.name?.split(' ')[0] || 'amigo';
              await meta.sendTemplate(m.phone, 'reactivar_equipo', 'es_MX', [
                { type: 'body', parameters: [{ type: 'text', text: nombre }] }
              ]);

              reactivados++;
              console.log(`   ✅ ${m.name} reactivado`);
            } catch (e) {
              console.error(`   ⚠️ Error reactivando ${m.name}:`, e);
            }
          }
        }

        if (reactivados > 0) {
          console.log(`🔄 REACTIVACIÓN COMPLETADA: ${reactivados} ventanas reactivadas`);
          await logEvento(supabase, 'reactivacion_24h', `Reactivadas ${reactivados} ventanas de WhatsApp`, { reactivados });
        } else {
          console.log('✅ REACTIVACIÓN - Todos dentro de ventana 24h');
        }
      } catch (e) {
        console.error('❌ Error en reactivación 24h:', e);
      }
    }

    // 8am L-V: Briefing matutino (solo primer ejecucion de la hora)
    console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
    console.log(`║  📋 BRIEFING MATUTINO - VERIFICACIÓN                              ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);
    console.log(`   🕐 Hora México: ${mexicoHour} (debe ser 8)`);
    console.log(`   📅 Día semana: ${dayOfWeek} (L=1 a V=5, hoy=${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][dayOfWeek]})`);
    console.log(`   👥 Total vendedores cargados: ${vendedores?.length || 0}`);

    // 8am-8:30am L-V: Briefing matutino (procesa en lotes para evitar timeout)
    const hoyStrBriefing = new Date().toISOString().split('T')[0];
    console.log(`   📆 Fecha hoy: ${hoyStrBriefing}`);

    if (mexicoHour === 8 && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log(`\n   ✅ CONDICIONES CUMPLIDAS - Procesando briefings...`);

      // Listar todos los vendedores y su estado
      console.log(`\n   📋 ESTADO DE CADA VENDEDOR:`);
      for (const v of vendedores) {
        const tienePhone = !!v.phone;
        const recibeBriefing = !!v.recibe_briefing;
        const yaRecibioHoy = v.last_briefing_sent === hoyStrBriefing;
        const elegible = tienePhone && recibeBriefing && !yaRecibioHoy;
        console.log(`   ${elegible ? '🟢' : '⚪'} ${v.name} - phone:${tienePhone?'✓':'✗'} recibe:${recibeBriefing?'✓':'✗'} yaRecibió:${yaRecibioHoy?'✓':'✗'} → ${elegible ? 'ELEGIBLE' : 'SKIP'}`);
      }

      // Filtrar solo los que NO han recibido briefing hoy
      const pendientes = vendedores.filter((v: any) =>
        v.phone && v.recibe_briefing && v.last_briefing_sent !== hoyStrBriefing
      );

      if (pendientes.length > 0) {
        console.log(`\n   📤 ${pendientes.length} VENDEDORES ELEGIBLES para briefing`);

        // Pre-cargar datos en batch (6 queries en vez de 5-6 POR vendedor)
        console.log(`   📦 Pre-cargando datos en batch...`);
        const prefetchedData = await prefetchBriefingData(supabase);
        console.log(`   ✅ Datos pre-cargados: ${prefetchedData.allCitasHoy.length} citas, ${prefetchedData.allLeadsNew.length} leads nuevos`);

        // Procesar máximo 5 por CRON para evitar timeout
        const BATCH_SIZE = 5;
        const lote = pendientes.slice(0, BATCH_SIZE);
        let enviados = 0;

        console.log(`   🔄 Procesando lote de ${lote.length} (máx ${BATCH_SIZE} por CRON)`);

        for (const v of lote) {
          console.log(`\n   ═══ PROCESANDO: ${v.name} ═══`);
          try {
            await enviarBriefingMatutino(supabase, meta, v, { openaiApiKey: env.OPENAI_API_KEY, prefetchedData });
            enviados++;
          } catch (err) {
            console.error(`   ❌ Error enviando briefing a ${v.name}:`, err);
          }
        }

        const restantes = pendientes.length - enviados;
        console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
        console.log(`║  📊 BRIEFING RESULTADO                                            ║`);
        console.log(`║  ✅ Enviados: ${enviados}                                                    ║`);
        console.log(`║  ⏳ Pendientes: ${restantes} ${restantes > 0 ? '(siguiente CRON)' : ''}                                          ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════════╝`);
        await logEvento(supabase, 'briefing', `Briefing matutino: ${enviados} enviados, ${restantes} pendientes`, { enviados, restantes, total: vendedores.length });
      } else {
        console.log(`\n   ✅ Todos los ${vendedores.length} vendedores ya recibieron su briefing hoy`);
      }
    } else {
      console.log(`\n   ⏭️ BRIEFING NO EJECUTADO:`);
      if (mexicoHour !== 8) console.log(`      - Hora incorrecta: ${mexicoHour} (debe ser 8)`);
      if (dayOfWeek < 1 || dayOfWeek > 5) console.log(`      - Día incorrecto: ${dayOfWeek} (debe ser L-V)`);
      if (!vendedores) console.log(`      - No hay vendedores cargados`);
    }

    // 8am L-V: Recordatorio a vendedores/asesores sobre leads sin contactar
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('recordatorioAsesores', () => recordatorioAsesores(supabase, meta));
    }

    // 8am L-V: Reporte diario consolidado CEO/Admin (incluye supervisión + métricas)
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('enviarReporteDiarioConsolidadoCEO', () => enviarReporteDiarioConsolidadoCEO(supabase, meta));
    }

    // 8am LUNES: Reporte semanal CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 1) {
      await safeCron('enviarReporteSemanalCEO', () => enviarReporteSemanalCEO(supabase, meta));
    }

    // 9am LUNES: Reporte semanal individual a vendedores
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      await safeCron('enviarReporteSemanalVendedores', () => enviarReporteSemanalVendedores(supabase, meta));
    }

    // 9am LUNES: Reporte semanal individual a asesores hipotecarios
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      await safeCron('enviarReporteSemanalAsesores', () => enviarReporteSemanalAsesores(supabase, meta));
    }

    // 9am LUNES: Reporte semanal marketing
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      await safeCron('enviarReporteSemanalMarketing', () => enviarReporteSemanalMarketing(supabase, meta));
    }

    // 10am MARTES: Coaching automático personalizado a vendedores
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 2) {
      await safeCron('coachingEquipo', async () => {
        const coachingService = new IACoachingService(supabase, meta as any);
        await coachingService.enviarCoachingEquipo(7);
      });
    }

    // 8am DÍA 1 DE CADA MES: Reporte mensual CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && now.getUTCDate() === 1) {
      await safeCron('enviarReporteMensualCEO', () => enviarReporteMensualCEO(supabase, meta));
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual individual a vendedores
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      await safeCron('enviarReporteMensualVendedores', () => enviarReporteMensualVendedores(supabase, meta));
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual individual a asesores hipotecarios
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      await safeCron('enviarReporteMensualAsesores', () => enviarReporteMensualAsesores(supabase, meta));
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual marketing
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      await safeCron('enviarReporteMensualMarketing', () => enviarReporteMensualMarketing(supabase, meta));
    }

    // 12:01am DÍA 1 DE CADA MES: Aplicar nuevos precios programados
    if (mexicoHour === 0 && isFirstRunOfHour && now.getUTCDate() === 1) {
      await safeCron('aplicarPreciosProgramados', () => aplicarPreciosProgramados(supabase, meta, env));
    }

    // ═══════════════════════════════════════════════════════════════
    // 9am L-V: REACTIVAR EQUIPO - DESACTIVADO
    // Ahora el briefing de 8am se envía DIRECTO sin template
    // ═══════════════════════════════════════════════════════════════

    // 7pm L-V: Reporte diario consolidado a vendedores (incluye recap + métricas)
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('enviarReporteDiarioVendedores', () => enviarReporteDiarioVendedores(supabase, meta));
    }

    // 7pm L-V: Reporte diario individual a asesores hipotecarios
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('enviarReporteDiarioAsesores', () => enviarReporteDiarioAsesores(supabase, meta));
    }

    // 10am L-V: Alertas de leads fríos (vendedores, asesores, CEO)
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('enviarAlertasLeadsFrios', () => enviarAlertasLeadsFrios(supabase, meta));
      await safeCron('alertaLeadsHotSinSeguimiento', () => alertaLeadsHotSinSeguimiento(supabase, meta));
    }

    // 7pm L-V: Reporte diario marketing
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('enviarReporteDiarioMarketing', () => enviarReporteDiarioMarketing(supabase, meta));
    }

    // 7pm diario: Digesto de errores al CEO
    if (mexicoHour === 19 && isFirstRunOfHour) {
      console.log('📊 Enviando digesto de errores al CEO...');
      try {
        await enviarDigestoErroresDiario(supabase, meta);
      } catch (digestError) {
        console.error('⚠️ Error en enviarDigestoErroresDiario:', digestError);
      }
    }

    // Sábado 2pm: Video semanal de logros con Veo 3 (solo primer ejecucion)
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek === 6) {
      await safeCron('generarVideoSemanalLogros', () => generarVideoSemanalLogros(supabase, meta, env));
    }

    // Sábado 2pm: Recap semanal
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek === 6 && vendedores) {
      await safeCron('recapSemanal', async () => {
        for (const v of vendedores) {
          if (!v.phone || !v.recibe_recap) continue;
          await enviarRecapSemanal(supabase, meta, v);
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    // SISTEMA CENTRALIZADO DE NOTIFICACIONES (CON TTS)
    // ═══════════════════════════════════════════════════════════
    const notificationService = new NotificationService(supabase, meta, env.OPENAI_API_KEY);

    // RECORDATORIOS DE CITAS - cada ejecución del cron (24h y 2h antes)
    await safeCron('verificarConsistenciaCalendario', () => verificarConsistenciaCalendario(supabase, env, meta));

    await safeCron('enviarRecordatoriosCitas', async () => {
      const recordatoriosResult = await notificationService.enviarRecordatoriosCitas();
      if (recordatoriosResult.enviados > 0) {
        console.log(`✅ ${recordatoriosResult.enviados} recordatorios enviados`);
      }
    });

    // ENCUESTAS POST-CITA - cada ejecución (2-24h después de cita completada)
    await safeCron('enviarEncuestasPostCita_notif', async () => {
      const encuestasResult = await notificationService.enviarEncuestasPostCita();
      if (encuestasResult.enviados > 0) {
        console.log(`✅ ${encuestasResult.enviados} encuestas enviadas`);
      }
    });

    // FOLLOW-UP POST-CITA - día siguiente de cita completada
    await safeCron('enviarFollowupPostCita', async () => {
      const followupPostCitaResult = await notificationService.enviarFollowupPostCita();
      if (followupPostCitaResult.enviados > 0) {
        console.log(`✅ ${followupPostCitaResult.enviados} follow-ups post-cita enviados`);
        await logEvento(supabase, 'followup', `Follow-ups post-cita: ${followupPostCitaResult.enviados} enviados`, { enviados: followupPostCitaResult.enviados });
      }
    });

    // NO-SHOWS - detectar citas donde no se presentó el lead (cada 2 min)
    await safeCron('detectarNoShows', () => detectarNoShows(supabase, meta));

    // ═══════════════════════════════════════════════════════════
    // 🚨 PRE-NO-SHOW ALERT: Citas en 2h sin confirmación
    // Alerta al vendedor para que contacte al lead antes de la cita
    // ═══════════════════════════════════════════════════════════
    console.error('⚠️ Verificando citas próximas sin confirmación...');
    try {
      const ahora = new Date();
      const en2horas = new Date(ahora.getTime() + 2 * 60 * 60 * 1000);
      const en3horas = new Date(ahora.getTime() + 3 * 60 * 60 * 1000);

      // Buscar citas: programadas entre 2-3 horas, sin confirmar, no alertadas
      const { data: citasSinConfirmar } = await supabase.client
        .from('appointments')
        .select('id, lead_id, lead_phone, scheduled_date, scheduled_time, development, team_member_id, notes, client_responded')
        .eq('status', 'scheduled')
        .is('client_responded', null)  // No ha confirmado
        .gte('scheduled_date', ahora.toISOString().split('T')[0])
        .limit(10);

      if (citasSinConfirmar && citasSinConfirmar.length > 0) {
        for (const cita of citasSinConfirmar) {
          // Calcular hora de la cita
          const citaDate = new Date(`${cita.scheduled_date}T${cita.scheduled_time || '10:00'}:00`);
          const horasFaltantes = (citaDate.getTime() - ahora.getTime()) / (1000 * 60 * 60);

          // Solo alertar si faltan 2-3 horas
          if (horasFaltantes >= 2 && horasFaltantes <= 3) {
            const notas = typeof cita.notes === 'object' ? cita.notes : {};
            if (notas.pre_noshow_alert_sent) continue;

            // Obtener vendedor
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('id, name, phone')
              .eq('id', cita.team_member_id)
              .maybeSingle();

            // Obtener lead
            const { data: lead } = await supabase.client
              .from('leads')
              .select('name, phone')
              .eq('id', cita.lead_id)
              .maybeSingle();

            if (vendedor?.phone && lead) {
              await meta.sendWhatsAppMessage(vendedor.phone,
                `⚠️ *CITA EN 2 HORAS - SIN CONFIRMAR*\n\n` +
                `👤 *${lead.name || 'Lead'}*\n` +
                `📱 ${lead.phone ? formatPhoneForDisplay(lead.phone) : 'Sin tel'}\n` +
                `🏠 ${cita.development || 'Sin desarrollo'}\n` +
                `🕐 ${cita.scheduled_time} hoy\n\n` +
                `💡 El cliente NO ha confirmado.\n` +
                `Escribe *bridge ${lead.name?.split(' ')[0] || 'lead'}* para contactarlo y confirmar.`
              );
              console.error(`⚠️ PRE-NO-SHOW ALERT enviada a ${vendedor.name}: Cita con ${lead.name} en 2h sin confirmar`);

              // Marcar como alertado
              await supabase.client.from('appointments')
                .update({ notes: { ...notas, pre_noshow_alert_sent: new Date().toISOString() } })
                .eq('id', cita.id);
            }
          }
        }
      }
    } catch (preNoShowErr) {
      console.error('❌ Error verificando pre-no-shows:', preNoShowErr);
    }

    // ALERTA CITA NO CONFIRMADA - leads que no respondieron al recordatorio 24h
    try {
      await alertaCitaNoConfirmada(supabase, meta);
    } catch (ancErr) {
      console.error('❌ Error en alertaCitaNoConfirmada:', ancErr);
    }

    // TIMEOUT VENDEDOR - si no responde en 2hrs, enviar encuesta al lead
    await safeCron('verificarTimeoutConfirmaciones', () => verificarTimeoutConfirmaciones(supabase, meta));

    // Verificar videos pendientes
    await safeCron('verificarVideosPendientes', () => verificarVideosPendientes(supabase, meta, env));

    // FOLLOW-UPS AUTOMÁTICOS
    await safeCron('followupService', async () => {
      const followupService = new FollowupService(supabase);
      await followupService.procesarFollowupsPendientes(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error enviando follow-up:', e);
          return false;
        }
      });
    });

    // ═══════════════════════════════════════════════════════════
    // FOLLOW-UPS CON APROBACIÓN - Sistema de aprobación por vendedor
    // ═══════════════════════════════════════════════════════════
    const approvalService = new FollowupApprovalService(supabase);

    // Enviar propuestas pendientes a vendedores (cada ejecución)
    await safeCron('enviarPropuestasPendientes', () => approvalService.enviarPropuestasPendientes(async (phone, message) => {
      try {
        await meta.sendWhatsAppMessage(phone, message);
        return true;
      } catch (e) {
        console.log('Error enviando propuesta:', e);
        return false;
      }
    }));

    // Expirar aprobaciones viejas (cada ejecución)
    await safeCron('expirarAprobacionesViejas', () => approvalService.expirarAprobacionesViejas());

    // 10am L-V: Pedir status a vendedores sobre leads estancados
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('pedirStatusLeadsEstancados', () => approvalService.pedirStatusLeadsEstancados(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error pidiendo status:', e);
          return false;
        }
      }));
    }

    // FLUJO POST-VISITA - pregunta al vendedor "¿Llegó el lead?" (30-90min después de cita)
    await safeCron('iniciarFlujosPostVisita', () => iniciarFlujosPostVisita(supabase, meta, env.SARA_CACHE));

    // ENCUESTAS AUTOMÁTICAS - cada hora verifica citas completadas hace 2h
    await safeCron('enviarEncuestasPostCita', () => enviarEncuestasPostCita(supabase, meta));

    // ENCUESTAS NPS - 10am L-V, 7 días después del cierre
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('enviarEncuestasNPS', () => enviarEncuestasNPS(supabase, meta));
    }

    // ═══════════════════════════════════════════════════════════
    // NOTA: Las siguientes tareas ahora están CONSOLIDADAS en el
    // briefing matutino de las 8am:
    // - Alertas de leads estancados
    // - Recordatorios a asesores hipotecarios
    // - Cumpleaños del día
    // - Promociones activas
    //
    // Esto evita "notification fatigue" y consolida toda la info
    // relevante en UN solo mensaje matutino.
    // ═══════════════════════════════════════════════════════════

    // 8am L-V: Alertas proactivas CEO (situaciones críticas) - JUNTO CON BRIEFING
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('enviarAlertasProactivasCEO', () => enviarAlertasProactivasCEO(supabase, meta));
    }

    // MIÉRCOLES 8am: Remarketing leads fríos
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 3) {
      await safeCron('remarketingLeadsFrios', () => remarketingLeadsFrios(supabase, meta));
    }

    // PRIMER LUNES DEL MES 10am: Reactivación de leads perdidos
    const dayOfMonth = new Date().getDate();
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 1 && dayOfMonth <= 7) {
      await safeCron('reactivarLeadsPerdidos', () => reactivarLeadsPerdidos(supabase, meta));
    }

    // 9am DIARIO (TODOS LOS DÍAS): Felicitaciones de cumpleaños (leads + equipo)
    if (mexicoHour === 9 && isFirstRunOfHour) {
      await safeCron('felicitarCumpleañosLeads', () => felicitarCumpleañosLeads(supabase, meta));
      await safeCron('felicitarCumpleañosEquipo', () => felicitarCumpleañosEquipo(supabase, meta));
      // Aniversarios solo L-V
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        await safeCron('felicitarAniversarioCompra', () => felicitarAniversarioCompra(supabase, meta));
      }
      // Stale leads: alertar vendedores sobre leads >72h sin contacto (L-V)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        await safeCron('alertarLeadsEstancados', () => alertarLeadsEstancados(supabase, meta));
      }
    }

    // 11am L-V: Follow-up automático a leads inactivos (3+ días sin responder)
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('followUpLeadsInactivos', () => followUpLeadsInactivos(supabase, meta));
    }

    // 10am DIARIO: Recordatorios de pago de apartados
    if (mexicoHour === 10 && isFirstRunOfHour) {
      await safeCron('recordatoriosPagoApartado', () => recordatoriosPagoApartado(supabase, meta));
    }

    // 2pm L-V: Alerta leads HOT sin contactar hoy
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('alertaLeadsHotUrgentes', () => alertaLeadsHotUrgentes(supabase, meta));
    }

    // 5pm L-V: Recordatorio final del día - pendientes críticos
    if (mexicoHour === 17 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('recordatorioFinalDia', () => recordatorioFinalDia(supabase, meta));
    }

    // 11am L-V: Alerta de inactividad de vendedores a admins
    if (isFirstRunOfHour && mexicoHour === 11 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('alertaInactividadVendedor', () => alertaInactividadVendedor(supabase, meta));
    }

    // MARTES y JUEVES 8am: Seguimiento hipotecas estancadas
    if (mexicoHour === 8 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      await safeCron('seguimientoHipotecas', () => seguimientoHipotecas(supabase, meta));
    }

    // RE-ENGAGEMENT AUTOMÁTICO: Cada hora de 9am a 7pm L-V
    if (isFirstRunOfHour && mexicoHour >= 9 && mexicoHour <= 19 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('verificarReengagement', () => verificarReengagement(supabase, meta));
    }

    // LEADS FRÍOS - Secuencia de mensajes directos al lead (11am y 5pm L-S)
    if (isFirstRunOfHour && (mexicoHour === 11 || mexicoHour === 17) && dayOfWeek >= 1 && dayOfWeek <= 6) {
      await safeCron('reengagementDirectoLeads', () => reengagementDirectoLeads(supabase, meta));
    }

    // SEGUIMIENTO POST-VENTA: 10am diario
    if (mexicoHour === 10 && isFirstRunOfHour) {
      await safeCron('seguimientoPostVenta', () => seguimientoPostVenta(supabase, meta));
    }

    // CUMPLEAÑOS: 9am diario
    if (mexicoHour === 9 && isFirstRunOfHour) {
      await safeCron('enviarFelicitacionesCumple', () => enviarFelicitacionesCumple(supabase, meta));
    }

    // SEGUIMIENTO CRÉDITO: 12pm L-V
    if (mexicoHour === 12 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('seguimientoCredito', () => seguimientoCredito(supabase, meta));
    }

    // FOLLOW-UP 24H LEADS NUEVOS: 10am y 4pm L-V
    if (isFirstRunOfHour && (mexicoHour === 10 || mexicoHour === 16) && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('followUp24hLeadsNuevos', () => followUp24hLeadsNuevos(supabase, meta));
    }

    // REMINDER DOCS CRÉDITO: 11am L-V
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('reminderDocumentosCredito', () => reminderDocumentosCredito(supabase, meta));
    }

    // VIDEO FELICITACIÓN POST-VENTA: 10am diario
    if (mexicoHour === 10 && isFirstRunOfHour) {
      await safeCron('videoFelicitacionPostVenta', () => videoFelicitacionPostVenta(supabase, meta, env));
    }

    // VIDEO BIENVENIDA LEADS NUEVOS: cada 2 horas en horario laboral (8am-8pm)
    if (isFirstRunOfHour && mexicoHour >= 8 && mexicoHour <= 20 && mexicoHour % 2 === 0) {
      await safeCron('videoBienvenidaLeadNuevo', () => videoBienvenidaLeadNuevo(supabase, meta, env));
    }

    // RECUPERACIÓN ABANDONOS CRÉDITO: 3pm L-V
    if (mexicoHour === 15 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('recuperarAbandonosCredito', () => recuperarAbandonosCredito(supabase, meta));
    }

    // LEAD SCORING AUTOMÁTICO: cada 2 horas en horario laboral
    if (isFirstRunOfHour && mexicoHour >= 8 && mexicoHour <= 20 && mexicoHour % 2 === 0) {
      await safeCron('actualizarLeadScores', () => actualizarLeadScores(supabase));
    }

    // FOLLOW-UP POST-VISITA: 4pm L-V
    if (mexicoHour === 16 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('followUpPostVisita', () => followUpPostVisita(supabase, meta));
    }

    // NURTURING EDUCATIVO: Martes y Jueves 11am
    if (mexicoHour === 11 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      await safeCron('nurturingEducativo', () => nurturingEducativo(supabase, meta));
    }

    // CHECK-IN 60 DÍAS POST-VENTA: Jueves 11am
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek === 4) {
      await safeCron('checkIn60Dias', () => checkIn60Dias(supabase, meta));
    }

    // PROGRAMA DE REFERIDOS: Miércoles 11am
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek === 3) {
      await safeCron('solicitarReferidos', () => solicitarReferidos(supabase, meta));
    }

    // ENCUESTAS NPS: Viernes 10am
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 5) {
      await safeCron('enviarEncuestaNPS', () => enviarEncuestaNPS(supabase, meta));
    }

    // SEGUIMIENTO POST-ENTREGA: Lunes y Jueves 10am
    if (mexicoHour === 10 && isFirstRunOfHour && (dayOfWeek === 1 || dayOfWeek === 4)) {
      await safeCron('seguimientoPostEntrega', () => seguimientoPostEntrega(supabase, meta));
    }

    // ENCUESTA SATISFACCIÓN CASA: Martes 11am
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek === 2) {
      await safeCron('encuestaSatisfaccionCasa', () => encuestaSatisfaccionCasa(supabase, meta));
    }

    // CHECK-IN MANTENIMIENTO: Sábado 10am
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 6) {
      await safeCron('checkInMantenimiento', () => checkInMantenimiento(supabase, meta));
    }

    // ═══════════════════════════════════════════════════════════
    // LLAMADAS AUTOMÁTICAS CON IA (Retell.ai)
    // ═══════════════════════════════════════════════════════════

    // LLAMADAS POST-VISITA: Diario 11am L-V
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('llamadasSeguimientoPostVisita', () => llamadasSeguimientoPostVisita(supabase, meta, env));
    }

    // LLAMADAS ESCALAMIENTO 48h: Diario 12pm L-V
    if (mexicoHour === 12 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('llamadasEscalamiento48h', () => llamadasEscalamiento48h(supabase, meta, env));
    }

    // LLAMADAS REACTIVACIÓN: Martes y Jueves 10am
    if (mexicoHour === 10 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      await safeCron('llamadasReactivacionLeadsFrios', () => llamadasReactivacionLeadsFrios(supabase, meta, env));
    }

    // LLAMADAS RECORDATORIO CITA: Diario 5pm L-V
    if (mexicoHour === 17 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('llamadasRecordatorioCita', () => llamadasRecordatorioCita(supabase, meta, env));
    }

    // LLAMADAS ESCALAMIENTO POST-VENTA: Diario 1pm L-V
    if (mexicoHour === 13 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await safeCron('llamadasEscalamientoPostVenta', () => llamadasEscalamientoPostVenta(supabase, meta, env));
    }

    // BRIDGES - Verificar bridges por expirar (cada 2 min)
    await safeCron('verificarBridgesPorExpirar', () => verificarBridgesPorExpirar(supabase, meta));

    // FOLLOW-UPS PENDIENTES - Enviar si pasaron 30 min (cada 2 min)
    await safeCron('procesarFollowupsPendientes', () => procesarFollowupsPendientes(supabase, meta));

    // BROADCAST QUEUE - Procesar broadcasts encolados (cada 2 min)
    await safeCron('procesarBroadcastQueue', () => procesarBroadcastQueue(supabase, meta));

    // ═══════════════════════════════════════════════════════════
    // HEALTH CHECK - Verificar servicios externos (cada 10 min, offset :05)
    // Supabase, KV, Meta API, properties catalog, error rate
    // ═══════════════════════════════════════════════════════════
    if (mexicoMinute % 10 === 5) {
      try {
        await cronHealthCheck(supabase, meta, env);
      } catch (healthError) {
        console.error('⚠️ Error en cronHealthCheck:', healthError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEALTH MONITOR - Ping Supabase/Meta/OpenAI, save to health_checks (cada 5 min)
    // ═══════════════════════════════════════════════════════════
    if (mexicoMinute % 5 === 2) {
      try {
        await healthMonitorCron(supabase, meta, env);
      } catch (hmError) {
        console.error('⚠️ Error en healthMonitorCron:', hmError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RETRY QUEUE - Re-enviar mensajes fallidos de Meta API (cada 4 min)
    // ═══════════════════════════════════════════════════════════
    if (mexicoMinute % 4 === 0) {
      try {
        const retryResult = await processRetryQueue(supabase, meta, env.DEV_PHONE || '5610016226');
        if (retryResult.processed > 0) {
          console.log(`📬 Retry queue: ${retryResult.delivered} delivered, ${retryResult.failedPermanent} failed of ${retryResult.processed} processed`);
        }
      } catch (retryError) {
        console.error('⚠️ Error en processRetryQueue:', retryError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // DELIVERY CHECK - Verificar que mensajes al equipo llegaron (cada 10 min)
    // Detecta mensajes aceptados por Meta pero nunca entregados
    // ═══════════════════════════════════════════════════════════
    if (mexicoMinute % 10 === 0) {
      try {
        const deliveryResult = await verificarDeliveryTeamMessages(supabase, meta, env.DEV_PHONE || '5610016226', env);
        if (deliveryResult.undelivered > 0) {
          console.log(`⚠️ ${deliveryResult.undelivered} mensajes sin entregar al equipo`);
        }
      } catch (deliveryError) {
        console.error('⚠️ Error en verificarDeliveryTeamMessages:', deliveryError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // SLA CHECK - Verificar respuestas pendientes de vendedores (cada 5 min, horario laboral)
    // ═══════════════════════════════════════════════════════════
    if (mexicoMinute % 5 === 0 && mexicoHour >= 9 && mexicoHour < 19) {
      try {
        const sla = createSLAMonitoring(env.SARA_CACHE);
        const slaResult = await sla.checkPendingResponses();
        const totalIssues = (slaResult.warnings?.length || 0) + (slaResult.breaches?.length || 0) + (slaResult.escalations?.length || 0);
        if (totalIssues > 0) {
          console.log(`⏱️ SLA issues: ${slaResult.warnings?.length || 0} warnings, ${slaResult.breaches?.length || 0} breaches, ${slaResult.escalations?.length || 0} escalations`);
          // Alert vendors for breaches
          for (const breach of (slaResult.breaches || [])) {
            if (breach.vendorPhone) {
              try {
                await meta.sendWhatsAppMessage(breach.vendorPhone,
                  `⏱️ *SLA Alert:* Lead *${breach.leadName || 'Sin nombre'}* lleva ${breach.waitingMinutes || '?'} min sin respuesta.\n\n` +
                  `📱 Responde cuanto antes para mantener tu SLA.`
                );
              } catch (alertErr) { console.error('⚠️ SLA alert send error:', alertErr); }
            }
          }
        }
      } catch (slaErr) {
        console.error('⚠️ SLA check error (non-blocking):', slaErr);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // SISTEMA HÍBRIDO - Verificar pending para llamar (cada 30 min)
    // Si pasaron 2h sin respuesta, llamar con Retell
    // ═══════════════════════════════════════════════════════════
    if (mexicoMinute === 0 || mexicoMinute === 30) {
      console.log('📞 Verificando pending messages para llamar...');

      if (env.RETELL_API_KEY && env.RETELL_AGENT_ID && env.RETELL_PHONE_NUMBER) {
        try {
          const retellConfig = {
            apiKey: env.RETELL_API_KEY,
            agentId: env.RETELL_AGENT_ID,
            phoneNumber: env.RETELL_PHONE_NUMBER
          };

          const result = await verificarPendingParaLlamar(supabase, meta, retellConfig);
          console.log(`📞 Resultado: ${result.llamadas} llamadas, ${result.errores} errores`);
        } catch (callError) {
          console.error('⚠️ Error en verificarPendingParaLlamar:', callError);
        }
      } else {
        console.log('⏭️ Retell no configurado, saltando verificación de llamadas');
      }
    }
    // Persist CRON execution summary for observability
    await cronTracker.persist(supabase);
    const cronSummary = cronTracker.getSummary();
    if (cronSummary.failCount > 0) {
      console.warn(`⚠️ CRON run: ${cronSummary.failCount}/${cronSummary.tasks.length} tasks failed (${cronSummary.totalDuration_ms}ms)`);
    } else {
      console.log(`✅ CRON run: ${cronSummary.tasks.length} tasks OK (${cronSummary.totalDuration_ms}ms)`);
    }

    } catch (error) {
      // Capturar errores de cron en Sentry
      sentry.captureException(error, {
        cron: event.cron,
        scheduled_time: new Date(event.scheduledTime).toISOString()
      });
      console.error('❌ Error en cron job:', error);

      // Persist to error_logs
      try {
        await logErrorToDB(supabase, 'cron_error', error instanceof Error ? error.message : String(error), {
          severity: 'critical',
          source: `cron:${event.cron}`,
          stack: error instanceof Error ? error.stack : undefined,
          context: { cron: event.cron, scheduled_time: new Date(event.scheduledTime).toISOString() }
        });
      } catch (logErr) { console.error('⚠️ CRON error logging to DB failed:', logErr); }

      throw error; // Re-throw para que Cloudflare lo registre
    }
  },
};
