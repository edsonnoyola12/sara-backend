import { SupabaseService } from './services/supabase';
import { ClaudeService } from './services/claude';
import { CacheService } from './services/cacheService';

import { MetaWhatsAppService } from './services/meta-whatsapp';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
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
import { BusinessHoursService } from './services/businessHoursService';
import { safeJsonParse } from './utils/safeHelpers';

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
  alertaCitaNoConfirmada
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
  llamadasRecordatorioCita
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
  limpiarFlagsEncuestasExpirados
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
import { exportBackup } from './crons/dashboard';

// Health Check - Automated monitoring and alerts
import {
  runHealthCheck,
  trackError,
  cronHealthCheck,
  logErrorToDB,
  enviarDigestoErroresDiario,
  enviarAlertaSistema
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
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS: Dominios permitidos (whitelist)
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://sara-crm.vercel.app',
  'https://sara-crm-new.vercel.app',
  'https://sara-crm.netlify.app',
  'https://gruposantarita.com',
  'https://www.gruposantarita.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

// Función para verificar orígenes dinámicos de Vercel
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // Webhooks sin Origin
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Permitir cualquier subdominio de vercel.app para el proyecto sara-crm
  if (origin.match(/^https:\/\/sara-crm.*\.vercel\.app$/)) return true;
  return false;
}

function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('Origin');
  // Validar contra whitelist
  if (origin && isAllowedOrigin(origin)) {
    return origin;
  }
  // Para webhooks de Meta/Facebook que no tienen Origin header
  return ALLOWED_ORIGINS[0];
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
async function checkRateLimit(request: Request, env: Env, requestId: string): Promise<Response | null> {
  // Solo aplicar rate limit si KV está disponible
  if (!env.SARA_CACHE) return null;

  // No limitar webhooks de Meta (necesitan responder rápido)
  const url = new URL(request.url);
  if (url.pathname.startsWith('/webhook')) return null;

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const key = `ratelimit:${ip}`;
  const limit = 100; // requests por minuto
  const windowSeconds = 60;

  try {
    const current = await env.SARA_CACHE.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
      log('warn', `Rate limit exceeded for IP: ${ip}`, requestId, { ip, count, limit });
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
    // Si falla KV, permitir la request (fail open)
    log('error', 'Rate limit check failed', requestId, { error: String(e) });
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGURIDAD: Verificación de API Key para endpoints protegidos
// ═══════════════════════════════════════════════════════════════════════════
function checkApiAuth(request: Request, env: Env): Response | null {
  // Si no hay API_SECRET configurado, permitir acceso (desarrollo local)
  if (!env.API_SECRET) {
    console.warn('⚠️ API_SECRET no configurado - endpoints desprotegidos');
    return null;
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
    /^\/api\/tts-metrics/,                   // Métricas de TTS (CRM)
    /^\/api\/metrics\/quality/,              // Calidad de respuestas (CRM)
    /^\/api\/surveys/,                       // Encuestas (CRM)
    /^\/api\/send-surveys/,                  // Enviar encuestas (CRM)
  ];

  for (const pattern of crmPublicPatterns) {
    if (pattern.test(pathname)) return false;
  }

  // Todo lo demás requiere auth
  return pathname.startsWith('/api/') ||
         pathname.startsWith('/test-') ||
         pathname.startsWith('/debug-');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Crear MetaWhatsAppService con tracking habilitado
// ═══════════════════════════════════════════════════════════════════════════
function createMetaWithTracking(env: any, supabase: SupabaseService): MetaWhatsAppService {
  const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

  // Configurar tracking automático de mensajes
  const msgTracking = createMessageTrackingService(supabase);
  meta.setTrackingCallback(async (data) => {
    await msgTracking.logMessageSent({
      messageId: data.messageId,
      recipientPhone: data.recipientPhone,
      recipientType: 'lead', // Default, se puede mejorar
      messageType: data.messageType,
      categoria: data.categoria,
      contenido: data.contenido
    });
  });

  return meta;
}

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
      await supabase.client.from('surveys').update({
        status: 'answered',
        nps_score: score,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', survey.id);

      console.log(`📋 Encuesta CRM NPS procesada: ${nombre} = ${score}/10 (${categoria})`);
      return true;

    } else {
      // Para otros tipos (satisfaction, post_cita, etc.)
      const matchRating = mensaje.trim().match(/^\s*([1-5])\s*$/);
      const esTexto = mensaje.length > 3;

      if (matchRating) {
        const rating = parseInt(matchRating[1]);
        await meta.sendWhatsAppMessage(phone, `Gracias por tu calificacion ${primerNombre}! ${rating >= 4 ? 'Nos alegra que hayas tenido una buena experiencia.' : 'Tomaremos en cuenta tu opinion para mejorar.'}\n\nHay algo mas que quieras compartirnos?`);

        await supabase.client.from('surveys').update({
          status: 'awaiting_feedback',
          rating,
          answered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', survey.id);

        console.log(`📋 Encuesta CRM rating procesada: ${nombre} = ${rating}/5`);
        return true;

      } else if (survey.status === 'awaiting_feedback' || esTexto) {
        // Es feedback de texto
        await meta.sendWhatsAppMessage(phone, `Gracias por tu comentario ${primerNombre}! Lo tomaremos muy en cuenta.`);

        await supabase.client.from('surveys').update({
          status: 'answered',
          feedback: mensaje,
          updated_at: new Date().toISOString()
        }).eq('id', survey.id);

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
    // RATE LIMITING: 100 req/min por IP
    // ═══════════════════════════════════════════════════════════
    const rateLimitError = await checkRateLimit(request, env, requestId);
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
    const retellResp = await handleRetellRoutes(url, request, env, supabase, corsResponse, checkApiAuth);
    if (retellResp) return retellResp;

    // ═══════════════════════════════════════════════════════════════
    // TEST/DEBUG ROUTES (extracted to src/routes/test.ts)
    // ═══════════════════════════════════════════════════════════════
    const testResp = await handleTestRoutes(url, request, env, supabase, corsResponse, checkApiAuth, cache);
    if (testResp) return testResp;

    // ═══════════════════════════════════════════════════════════════
    // API CORE ROUTES (extracted to src/routes/api-core.ts)
    // ═══════════════════════════════════════════════════════════════
    const apiCoreResp = await handleApiCoreRoutes(url, request, env, supabase, corsResponse, checkApiAuth);
    if (apiCoreResp) return apiCoreResp;

    // ═══════════════════════════════════════════════════════════════
    // API BI ROUTES (extracted to src/routes/api-bi.ts)
    // ═══════════════════════════════════════════════════════════════
    const apiBiResp = await handleApiBiRoutes(url, request, env, supabase, cache, corsResponse, checkApiAuth);
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

        const body = JSON.parse(bodyText) as any;
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

              // Log especial para errores
              if (statusType === 'failed') {
                console.error(`❌ MENSAJE FALLIDO: ${recipientId} - Error ${errorCode}: ${errorTitle}`);
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
                // Silencioso si falla - no es crítico
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
                // Silencioso si falla
              }
            }
          }
          return new Response('OK', { status: 200 });
        }

        console.log('📥 Messages encontrados:', messages?.length || 0);

        if (messages && messages.length > 0) {
          const message = messages[0];
          const from = message.from;
          const messageId = message.id; // WhatsApp message ID para dedup
          const messageType = message.type; // text, image, document, interactive, etc.

          // ═══ EXTRAER TEXTO DEL MENSAJE (incluyendo respuestas interactivas) ═══
          let text = '';
          if (messageType === 'text') {
            text = message.text?.body || '';
          } else if (messageType === 'interactive') {
            // Respuesta a lista o botones
            const interactiveType = message.interactive?.type;
            if (interactiveType === 'list_reply') {
              // Respuesta a lista: usar el ID o título
              text = message.interactive.list_reply?.id || message.interactive.list_reply?.title || '';
              console.log(`📋 Respuesta a LISTA: id="${message.interactive.list_reply?.id}", title="${message.interactive.list_reply?.title}"`);
            } else if (interactiveType === 'button_reply') {
              // Respuesta a botones: usar el ID o título
              text = message.interactive.button_reply?.id || message.interactive.button_reply?.title || '';
              console.log(`🔘 Respuesta a BOTÓN: id="${message.interactive.button_reply?.id}", title="${message.interactive.button_reply?.title}"`);
            }
          } else if (messageType === 'button') {
            // Botón de template (diferente a interactive button)
            text = message.button?.text || message.button?.payload || '';
            console.log(`🔲 Respuesta a TEMPLATE BUTTON: "${text}"`);
          }

          console.log(`📥 Procesando mensaje de ${from}: tipo=${messageType}, texto="${text.substring(0, 50)}..."`);

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
          const meta = createMetaWithTracking(env, supabase);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);

          // ═══ AVISO FUERA DE HORARIO (solo leads, no team members) ═══
          if (!teamMember) {
            try {
              const bhService = new BusinessHoursService();
              const outsideMsg = bhService.getOutsideHoursMessage('es');
              if (outsideMsg) {
                // Verificar dedup: no enviar más de 1 vez cada 12h al mismo lead
                const { data: leadBH } = await supabase.client
                  .from('leads')
                  .select('notes')
                  .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
                  .maybeSingle();
                const bhNotes = leadBH?.notes || {};
                const lastNotified = bhNotes.outside_hours_notified_at;
                const hace12h = Date.now() - 12 * 60 * 60 * 1000;
                const yaNotifico = lastNotified && new Date(lastNotified).getTime() > hace12h;

                if (!yaNotifico) {
                  console.log(`🕐 Lead escribe fuera de horario - enviando aviso`);
                  await meta.sendWhatsAppMessage(from, outsideMsg);
                  // Guardar flag de dedup
                  if (leadBH) {
                    await supabase.client
                      .from('leads')
                      .update({ notes: { ...bhNotes, outside_hours_notified_at: new Date().toISOString() } })
                      .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`);
                  }
                } else {
                  console.log(`🕐 Lead fuera de horario pero ya notificado en últimas 12h - skip aviso`);
                }
                // NO retornar - seguir procesando con IA normalmente
              }
            } catch (bhErr) {
              console.error('Error en BusinessHoursService:', bhErr);
            }
          }
          // ═══ FIN AVISO FUERA DE HORARIO ═══

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
                    .single();

                  if (lead) {
                    const enFlujoCredito = await creditService.estaEnFlujoCredito(lead.id);

                    if (enFlujoCredito) {
                      console.log(`🏦 Lead ${lead.id} en flujo de crédito - procesando documento`);

                      const resultado = await creditService.procesarRespuesta(lead.id, caption, mediaUrl);

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

                          // Notificar al asesor via enviarMensajeTeamMember (24h safe)
                          if (asesor.phone && asesor.is_active !== false) {
                            const { data: asesorFull } = await supabase.client
                              .from('team_members').select('*').eq('id', asesor.id).single();
                            if (asesorFull) {
                              const msgAsesor = creditService.generarNotificacionAsesor(lead, resultado.context);
                              await enviarMensajeTeamMember(supabase, meta, asesorFull, msgAsesor, {
                                tipoMensaje: 'alerta_lead',
                                guardarPending: true,
                                pendingKey: 'pending_alerta_lead'
                              });
                              console.log(`📤 Asesor ${asesor.name} notificado (enviarMensajeTeamMember)`);
                            }
                          }

                          // Notificar al vendedor original que su lead entró a crédito
                          if (vendedorOriginalId && vendedorOriginalId !== asesor?.id) {
                            const { data: vendedorOriginal } = await supabase.client
                              .from('team_members').select('*').eq('id', vendedorOriginalId).single();
                            if (vendedorOriginal?.phone) {
                              const msgVendedor = `🏦 *LEAD EN CRÉDITO HIPOTECARIO*\n\n` +
                                `👤 *${resultado.context.lead_name}*\n` +
                                `📱 ${lead.phone}\n\n` +
                                `Tu lead fue asignado al asesor hipotecario *${asesor.name || 'N/A'}* para su trámite de crédito.\n\n` +
                                `💡 Sigues siendo responsable de la venta. Cuando el crédito esté listo, coordina la visita.\n\n` +
                                `Escribe *mis leads* para ver tu lista.`;
                              await enviarMensajeTeamMember(supabase, meta, vendedorOriginal, msgVendedor, {
                                tipoMensaje: 'alerta_lead',
                                guardarPending: true,
                                pendingKey: 'pending_alerta_lead'
                              });
                              console.log(`📤 Vendedor original ${vendedorOriginal.name} notificado del crédito`);
                            }
                          }
                        }
                      }

                      console.log('✅ Documento de crédito procesado');
                      return new Response('OK', { status: 200 });
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
              .single();

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
                  `📱 ${leadImg.phone}\n` +
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
                `📱 ${leadImg.phone}\n` +
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
            console.log(`😄 Sticker recibido`);

            // Respuesta amigable a stickers
            await meta.sendWhatsAppMessage(from,
              '😄 ¡Me encanta tu sticker! Soy SARA de Grupo Santa Rita.\n\n¿Buscas casa en Zacatecas? Tengo opciones increíbles desde $1.5 millones 🏠\n\n¿Qué tipo de casa te interesa?');
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE STICKERS ═══

          // ═══ MANEJO DE UBICACIÓN ═══
          if (messageType === 'location') {
            console.log(`📍 Ubicación recibida`);

            const lat = message.location?.latitude;
            const lon = message.location?.longitude;

            await meta.sendWhatsAppMessage(from,
              `📍 ¡Gracias por compartir tu ubicación!\n\nNuestros desarrollos están en *Zacatecas, México*. Tenemos casas en varias zonas:\n\n🏘️ *Monte Verde* - Zona sur\n🏘️ *Los Encinos* - Zona centro\n🏘️ *Miravalle* - Zona premium\n🏘️ *Distrito Falco* - Zona exclusiva\n\n¿Te gustaría conocer cuál te queda más cerca o cuál se ajusta mejor a tu presupuesto?`);
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
            console.log(`🎬 Video recibido`);

            await meta.sendWhatsAppMessage(from,
              '🎬 ¡Gracias por el video! Por ahora trabajo mejor con mensajes de texto.\n\n¿Buscas casa en Zacatecas? Cuéntame qué tipo de casa necesitas y te muestro nuestras opciones 🏠');
            return new Response('OK', { status: 200 });
          }
          // ═══ FIN MANEJO DE VIDEO ═══

          // ═══ MANEJO DE CONTACTOS ═══
          if (messageType === 'contacts') {
            console.log(`👤 Contacto compartido`);

            await meta.sendWhatsAppMessage(from,
              '👤 ¡Gracias por compartir el contacto! Si es alguien que busca casa, con gusto lo puedo atender.\n\n¿Te gustaría que le escriba directamente o prefieres darle mi número para que me contacte?');
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
                .single();

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

        // Persist to error_logs
        ctx.waitUntil(logErrorToDB(supabase, 'webhook_error', error instanceof Error ? error.message : String(error), {
          severity: 'error',
          source: 'webhook:meta',
          stack: error instanceof Error ? error.stack : undefined,
          context: { from: from || 'unknown' }
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

        const body = JSON.parse(bodyText) as any;
        console.log('🔥 Facebook Lead recibido:', JSON.stringify(body));

        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];

        // Facebook Lead Ads envía el campo "leadgen_id"
        if (changes?.field === 'leadgen' && changes?.value?.leadgen_id) {
          const leadgenId = changes.value.leadgen_id;
          const formId = changes.value.form_id;
          const pageId = changes.value.page_id;
          const createdTime = changes.value.created_time;

          console.log(`🎯 Nuevo lead de Facebook: ${leadgenId}`);

          // Obtener datos reales del lead desde Graph API
          let leadName = `Facebook Lead ${leadgenId.slice(-6)}`;
          let leadPhone = '';
          let leadEmail = '';
          let leadNotes = '';

          try {
            const graphResponse = await fetch(
              `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${env.META_ACCESS_TOKEN}`
            );

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
              .single();
            existingLead = byPhone;
          }

          if (existingLead) {
            console.error(`⚠️ Lead ya existe: ${existingLead.id}`);
            // Actualizar con datos de Facebook si es más reciente
            await supabase.client.from('leads').update({
              source: 'facebook_ads',
              notes: `${existingLead.notes || ''}\n---\nActualizado desde Facebook Lead ${leadgenId} el ${new Date().toLocaleString('es-MX')}`
            }).eq('id', existingLead.id);

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
            .single();

          if (error) {
            console.error('Error creando lead de Facebook:', error);
          } else {
            console.log(`✅ Lead creado: ${nuevoLead.id} - ${leadName}`);

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
              .single();
            
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
          '/health',
          '/backup',
          '/ab-results'
        ]
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

      // Persist to error_logs
      ctx.waitUntil(logErrorToDB(supabase, 'fetch_error', error instanceof Error ? error.message : String(error), {
        severity: 'critical',
        source: `fetch:${url.pathname}`,
        stack: error instanceof Error ? error.stack : undefined,
        context: { request_id: requestId, path: url.pathname, method: request.method }
      }));

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

    try {
    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

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
                      `📱 ${lead.phone}\n` +
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

            // Verificar si hay actividad del vendedor en lead_activities
            const { data: actividades } = await supabase.client
              .from('lead_activities')
              .select('id')
              .eq('lead_id', lead.id)
              .eq('team_member_id', lead.assigned_to)
              .limit(1);

            const tieneActividad = actividades && actividades.length > 0;
            if (tieneActividad) continue;

            // Este lead NO ha sido contactado - alertar al vendedor
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('id, name, phone')
              .eq('id', lead.assigned_to)
              .single();

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

              await meta.sendWhatsAppMessage(vendedor.phone, alertaMsg);
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
              // Enviar template de reactivación
              const response = await fetch(`https://sara-backend.edson-633.workers.dev/send-template?phone=${m.phone}&template=reactivar_equipo&nombre=${encodeURIComponent(m.name.split(' ')[0])}`);

              if (response.ok) {
                // Marcar como reactivado hoy para no repetir
                const updatedNotes = { ...notas, reactivacion_enviada: hoyReactivacion };
                await supabase.client
                  .from('team_members')
                  .update({ notes: updatedNotes })
                  .eq('id', m.id);
                reactivados++;
                console.log(`   ✅ ${m.name} reactivado`);
              }
            } catch (e) {
              console.log(`   ⚠️ Error reactivando ${m.name}:`, e);
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
      console.log('💬 Enviando recordatorios a vendedores/asesores...');
      await recordatorioAsesores(supabase, meta);
    }

    // 8am L-V: Reporte diario consolidado CEO/Admin (incluye supervisión + métricas)
    // CONSOLIDADO: Antes se enviaban 2 mensajes separados, ahora es 1 solo
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reporte diario consolidado a CEO/Admin...');
      await enviarReporteDiarioConsolidadoCEO(supabase, meta);
    }

    // 8am LUNES: Reporte semanal CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📈 Enviando reporte semanal a CEO...');
      await enviarReporteSemanalCEO(supabase, meta);
    }

    // 9am LUNES: Reporte semanal individual a vendedores
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📊 Enviando reportes semanales a vendedores...');
      await enviarReporteSemanalVendedores(supabase, meta);
    }

    // 9am LUNES: Reporte semanal individual a asesores hipotecarios
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📊 Enviando reportes semanales a asesores...');
      await enviarReporteSemanalAsesores(supabase, meta);
    }

    // 9am LUNES: Reporte semanal marketing
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📊 Enviando reporte semanal a marketing...');
      await enviarReporteSemanalMarketing(supabase, meta);
    }

    // 10am MARTES: Coaching automático personalizado a vendedores
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 2) {
      console.log('🎓 Enviando coaching personalizado a vendedores...');
      const coachingService = new IACoachingService(supabase, meta);
      await coachingService.enviarCoachingEquipo(7); // Solo si no recibió en 7 días
    }

    // 8am DÍA 1 DE CADA MES: Reporte mensual CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reporte mensual a CEO...');
      await enviarReporteMensualCEO(supabase, meta);
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual individual a vendedores
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reportes mensuales a vendedores...');
      await enviarReporteMensualVendedores(supabase, meta);
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual individual a asesores hipotecarios
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reportes mensuales a asesores...');
      await enviarReporteMensualAsesores(supabase, meta);
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual marketing
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reporte mensual a marketing...');
      await enviarReporteMensualMarketing(supabase, meta);
    }

    // 12:01am DÍA 1 DE CADA MES: Aplicar nuevos precios programados
    if (mexicoHour === 0 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('💰 Aplicando precios programados del mes...');
      await aplicarPreciosProgramados(supabase, meta);
    }

    // ═══════════════════════════════════════════════════════════════
    // 9am L-V: REACTIVAR EQUIPO - DESACTIVADO
    // Ahora el briefing de 8am se envía DIRECTO sin template
    // ═══════════════════════════════════════════════════════════════

    // 7pm L-V: Reporte diario consolidado a vendedores (incluye recap + métricas)
    // CONSOLIDADO: Antes se enviaban 2 mensajes separados (recap + reporte), ahora es 1 solo
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reporte diario consolidado a vendedores...');
      await enviarReporteDiarioVendedores(supabase, meta);
    }

    // 7pm L-V: Reporte diario individual a asesores hipotecarios
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reportes diarios a asesores...');
      await enviarReporteDiarioAsesores(supabase, meta);
    }

    // 10am L-V: Alertas de leads fríos (vendedores, asesores, CEO)
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🥶 Enviando alertas de leads fríos...');
      await enviarAlertasLeadsFrios(supabase, meta);
      console.log('🔥 Verificando leads HOT sin seguimiento...');
      await alertaLeadsHotSinSeguimiento(supabase, meta);
    }

    // 7pm L-V: Reporte diario marketing
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reporte diario a marketing...');
      await enviarReporteDiarioMarketing(supabase, meta);
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
      console.log('🎬 Generando video semanal de logros...');
      await generarVideoSemanalLogros(supabase, meta, env);
    }

    // Sábado 2pm: Recap semanal
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek === 6 && vendedores) {
      console.log('📊 Enviando recap semanal...');
      for (const v of vendedores) {
        if (!v.phone || !v.recibe_recap) continue;
        await enviarRecapSemanal(supabase, meta, v);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // SISTEMA CENTRALIZADO DE NOTIFICACIONES (CON TTS)
    // ═══════════════════════════════════════════════════════════
    const notificationService = new NotificationService(supabase, meta, env.OPENAI_API_KEY);

    // RECORDATORIOS DE CITAS - cada ejecución del cron (24h y 2h antes)
    // ✅ FIX 14-ENE-2026: Verificar consistencia ANTES de enviar mensajes
    console.log('🔄 Verificando consistencia calendario...');
    await verificarConsistenciaCalendario(supabase, env);

    console.log('🔔 Verificando recordatorios de citas...');
    const recordatoriosResult = await notificationService.enviarRecordatoriosCitas();
    if (recordatoriosResult.enviados > 0) {
      console.log(`✅ ${recordatoriosResult.enviados} recordatorios enviados`);
    }

    // ENCUESTAS POST-CITA - cada ejecución (2-24h después de cita completada)
    console.log('📋 Verificando encuestas post-cita...');
    const encuestasResult = await notificationService.enviarEncuestasPostCita();
    if (encuestasResult.enviados > 0) {
      console.log(`✅ ${encuestasResult.enviados} encuestas enviadas`);
    }

    // FOLLOW-UP POST-CITA - día siguiente de cita completada
    console.log('📧 Verificando follow-ups post-cita...');
    const followupPostCitaResult = await notificationService.enviarFollowupPostCita();
    if (followupPostCitaResult.enviados > 0) {
      console.log(`✅ ${followupPostCitaResult.enviados} follow-ups post-cita enviados`);
      await logEvento(supabase, 'followup', `Follow-ups post-cita: ${followupPostCitaResult.enviados} enviados`, { enviados: followupPostCitaResult.enviados });
    }

    // NO-SHOWS - detectar citas donde no se presentó el lead (cada 2 min)
    console.log('👻 Verificando no-shows...');
    await detectarNoShows(supabase, meta);

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
              .single();

            // Obtener lead
            const { data: lead } = await supabase.client
              .from('leads')
              .select('name, phone')
              .eq('id', cita.lead_id)
              .single();

            if (vendedor?.phone && lead) {
              await meta.sendWhatsAppMessage(vendedor.phone,
                `⚠️ *CITA EN 2 HORAS - SIN CONFIRMAR*\n\n` +
                `👤 *${lead.name || 'Lead'}*\n` +
                `📱 ${lead.phone}\n` +
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
    console.log('⏰ Verificando timeouts de confirmación...');
    await verificarTimeoutConfirmaciones(supabase, meta);

    // Verificar videos pendientes
    console.log('🎬 Verificando videos pendientes...');
    await verificarVideosPendientes(supabase, meta, env);

    // FOLLOW-UPS AUTOMÁTICOS
    console.log('📬 Procesando follow-ups pendientes...');
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

    // ═══════════════════════════════════════════════════════════
    // FOLLOW-UPS CON APROBACIÓN - Sistema de aprobación por vendedor
    // ═══════════════════════════════════════════════════════════
    const approvalService = new FollowupApprovalService(supabase);

    // Enviar propuestas pendientes a vendedores (cada ejecución)
    console.log('📋 Enviando propuestas de follow-up a vendedores...');
    await approvalService.enviarPropuestasPendientes(async (phone, message) => {
      try {
        await meta.sendWhatsAppMessage(phone, message);
        return true;
      } catch (e) {
        console.log('Error enviando propuesta:', e);
        return false;
      }
    });

    // Expirar aprobaciones viejas (cada ejecución)
    await approvalService.expirarAprobacionesViejas();

    // 10am L-V: Pedir status a vendedores sobre leads estancados
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Pidiendo status a vendedores sobre leads estancados...');
      await approvalService.pedirStatusLeadsEstancados(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error pidiendo status:', e);
          return false;
        }
      });
    }

    // FLUJO POST-VISITA - pregunta al vendedor "¿Llegó el lead?" (30-90min después de cita)
    console.log('📋 Verificando citas pasadas para flujo post-visita...');
    await iniciarFlujosPostVisita(supabase, meta, env.SARA_CACHE);

    // ENCUESTAS AUTOMÁTICAS - cada hora verifica citas completadas hace 2h
    console.log('📋 Verificando encuestas post-cita pendientes...');
    await enviarEncuestasPostCita(supabase, meta);

    // ENCUESTAS NPS - 10am L-V, 7 días después del cierre
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Verificando encuestas NPS pendientes...');
      await enviarEncuestasNPS(supabase, meta);
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
      console.log('🚨 Verificando alertas proactivas CEO...');
      await enviarAlertasProactivasCEO(supabase, meta);
    }

    // MIÉRCOLES 8am: Remarketing leads fríos
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 3) {
      console.log('📣 Ejecutando remarketing leads fríos...');
      await remarketingLeadsFrios(supabase, meta);
    }

    // PRIMER LUNES DEL MES 10am: Reactivación de leads perdidos
    const dayOfMonth = new Date().getDate();
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 1 && dayOfMonth <= 7) {
      console.log('🔄 Ejecutando reactivación de leads perdidos...');
      await reactivarLeadsPerdidos(supabase, meta);
    }

    // 9am DIARIO (TODOS LOS DÍAS): Felicitaciones de cumpleaños (leads + equipo)
    if (mexicoHour === 9 && isFirstRunOfHour) {
      console.log('🎂 Enviando felicitaciones de cumpleaños...');
      await felicitarCumpleañosLeads(supabase, meta);
      await felicitarCumpleañosEquipo(supabase, meta);
      // Aniversarios solo L-V
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        console.log('🏠 Verificando aniversarios de compra...');
        await felicitarAniversarioCompra(supabase, meta);
      }
    }

    // 11am L-V: Follow-up automático a leads inactivos (3+ días sin responder)
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📬 Ejecutando follow-up de leads inactivos...');
      await followUpLeadsInactivos(supabase, meta);
    }

    // 10am DIARIO: Recordatorios de pago de apartados (5 días antes, 1 día antes, día del pago)
    if (mexicoHour === 10 && isFirstRunOfHour) {
      console.log('💰 Verificando recordatorios de pago de apartados...');
      await recordatoriosPagoApartado(supabase, meta);
    }

    // 2pm L-V: Alerta leads HOT sin contactar hoy
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🔥 Verificando leads HOT sin contactar hoy...');
      await alertaLeadsHotUrgentes(supabase, meta);
    }

    // 5pm L-V: Recordatorio final del día - pendientes críticos
    if (mexicoHour === 17 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('⏰ Enviando recordatorio final del día...');
      await recordatorioFinalDia(supabase, meta);
    }

    // 11am L-V: Alerta de inactividad de vendedores a admins (consolidado - antes era 11am y 3pm)
    if (isFirstRunOfHour && mexicoHour === 11 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('👔 Verificando inactividad de vendedores...');
      await alertaInactividadVendedor(supabase, meta);
    }

    // MARTES y JUEVES 8am: Seguimiento hipotecas estancadas (alerta adicional a asesores)
    if (mexicoHour === 8 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      console.log('🏦 Verificando hipotecas estancadas...');
      await seguimientoHipotecas(supabase, meta);
    }

    // RE-ENGAGEMENT AUTOMÁTICO: Cada hora de 9am a 7pm L-V
    // Envía mensajes a leads que no han respondido en 48h+
    if (isFirstRunOfHour && mexicoHour >= 9 && mexicoHour <= 19 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🔄 Verificando leads para re-engagement...');
      await verificarReengagement(supabase, meta);
    }

    // LEADS FRÍOS - Secuencia de mensajes directos al lead
    // 11am y 5pm L-S: Día 3, Día 7, Día 14
    if (isFirstRunOfHour && (mexicoHour === 11 || mexicoHour === 17) && dayOfWeek >= 1 && dayOfWeek <= 6) {
      console.log('❄️ Verificando leads fríos para re-engagement directo...');
      await reengagementDirectoLeads(supabase, meta);
    }

    // SEGUIMIENTO POST-VENTA: 10am diario
    // Mensajes a clientes que compraron: 30 días (cómo estás), 60 días (referidos), 90 días (recordatorio)
    if (mexicoHour === 10 && isFirstRunOfHour) {
      console.log('🎉 Verificando seguimiento post-venta...');
      await seguimientoPostVenta(supabase, meta);
    }

    // CUMPLEAÑOS: 9am diario
    // Enviar felicitación a leads/clientes que cumplen años hoy
    if (mexicoHour === 9 && isFirstRunOfHour) {
      console.log('🎂 Verificando cumpleaños del día...');
      await enviarFelicitacionesCumple(supabase, meta);
    }

    // SEGUIMIENTO CRÉDITO: 12pm L-V
    // Leads que necesitan crédito pero no han avanzado
    if (mexicoHour === 12 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🏦 Verificando seguimiento de crédito...');
      await seguimientoCredito(supabase, meta);
    }

    // FOLLOW-UP 24H LEADS NUEVOS: 10am y 4pm L-V
    // Leads status='new' que no han respondido en 24h (usa campo alerta_enviada_24h)
    if (isFirstRunOfHour && (mexicoHour === 10 || mexicoHour === 16) && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('⏰ Verificando leads nuevos sin respuesta 24h...');
      await followUp24hLeadsNuevos(supabase, meta);
    }

    // REMINDER DOCS CRÉDITO: 11am L-V
    // Leads con credit_status='docs_requested' por 3+ días sin avanzar
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📄 Verificando leads pendientes de documentos...');
      await reminderDocumentosCredito(supabase, meta);
    }

    // VIDEO FELICITACIÓN POST-VENTA: 10am diario
    // Genera video personalizado Veo 3 para leads que acaban de comprar (status='sold')
    if (mexicoHour === 10 && isFirstRunOfHour) {
      console.log('🎬 Verificando nuevas ventas para video felicitación...');
      await videoFelicitacionPostVenta(supabase, meta, env);
    }

    // VIDEO BIENVENIDA LEADS NUEVOS: cada 2 horas en horario laboral (8am-8pm)
    // Genera video personalizado Veo 3 para leads que acaban de entrar al sistema
    if (isFirstRunOfHour && mexicoHour >= 8 && mexicoHour <= 20 && mexicoHour % 2 === 0) {
      console.log('🎬 Verificando leads nuevos para video de bienvenida...');
      await videoBienvenidaLeadNuevo(supabase, meta, env);
    }

    // RECUPERACIÓN ABANDONOS CRÉDITO: 3pm L-V
    // Re-engagement para leads que empezaron proceso de crédito pero no continuaron
    if (mexicoHour === 15 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🏦 Verificando abandonos de crédito para recuperación...');
      await recuperarAbandonosCredito(supabase, meta);
    }

    // LEAD SCORING AUTOMÁTICO: cada 2 horas en horario laboral
    // Actualiza scores de leads basado en comportamiento y señales
    if (isFirstRunOfHour && mexicoHour >= 8 && mexicoHour <= 20 && mexicoHour % 2 === 0) {
      console.log('📊 Actualizando lead scores...');
      await actualizarLeadScores(supabase);
    }

    // FOLLOW-UP POST-VISITA: 4pm L-V
    // Re-engagement para leads que visitaron pero no avanzaron
    if (mexicoHour === 16 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📍 Verificando leads post-visita para follow-up...');
      await followUpPostVisita(supabase, meta);
    }

    // NURTURING EDUCATIVO: Martes y Jueves 11am
    // Contenido educativo sobre crédito y compra de casa
    if (mexicoHour === 11 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      console.log('📚 Enviando nurturing educativo...');
      await nurturingEducativo(supabase, meta);
    }

    // CHECK-IN 60 DÍAS POST-VENTA: Jueves 11am
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek === 4) {
      console.log('📅 Enviando check-in 60 días post-venta...');
      await checkIn60Dias(supabase, meta);
    }

    // PROGRAMA DE REFERIDOS: Miércoles 11am
    // Solicitar referidos a clientes satisfechos (30-90 días post-venta)
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek === 3) {
      console.log('🤝 Solicitando referidos a clientes...');
      await solicitarReferidos(supabase, meta);
    }

    // ENCUESTAS NPS: Viernes 10am
    // Medir satisfacción de clientes post-visita y post-venta
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 5) {
      console.log('📊 Enviando encuestas NPS...');
      await enviarEncuestaNPS(supabase, meta);
    }

    // SEGUIMIENTO POST-ENTREGA: Lunes y Jueves 10am
    // Verificar que todo esté bien después de recibir las llaves (3-7 días post-entrega)
    if (mexicoHour === 10 && isFirstRunOfHour && (dayOfWeek === 1 || dayOfWeek === 4)) {
      console.log('🔑 Enviando seguimiento post-entrega...');
      await seguimientoPostEntrega(supabase, meta);
    }

    // ENCUESTA SATISFACCIÓN CASA: Martes 11am
    // Preguntar cómo les va 3-6 meses después de la entrega
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek === 2) {
      console.log('🏡 Enviando encuestas de satisfacción con la casa...');
      await encuestaSatisfaccionCasa(supabase, meta);
    }

    // CHECK-IN MANTENIMIENTO: Sábado 10am
    // Recordatorio anual de mantenimiento preventivo (~1 año post-entrega)
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 6) {
      console.log('🔧 Enviando check-in de mantenimiento...');
      await checkInMantenimiento(supabase, meta);
    }

    // ═══════════════════════════════════════════════════════════
    // LLAMADAS AUTOMÁTICAS CON IA (Retell.ai)
    // ═══════════════════════════════════════════════════════════

    // LLAMADAS POST-VISITA: Diario 11am L-V
    // Seguimiento a leads que visitaron hace 1 día
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📞 Ejecutando llamadas de seguimiento post-visita...');
      await llamadasSeguimientoPostVisita(supabase, meta, env);
    }

    // LLAMADAS REACTIVACIÓN: Martes y Jueves 10am
    // Reactivar leads fríos (7+ días sin respuesta)
    if (mexicoHour === 10 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      console.log('📞 Ejecutando llamadas de reactivación leads fríos...');
      await llamadasReactivacionLeadsFrios(supabase, meta, env);
    }

    // LLAMADAS RECORDATORIO CITA: Diario 5pm L-V
    // Recordar citas del día siguiente
    if (mexicoHour === 17 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📞 Ejecutando llamadas de recordatorio de cita...');
      await llamadasRecordatorioCita(supabase, meta, env);
    }

    // ═══════════════════════════════════════════════════════════
    // BRIDGES - Verificar bridges por expirar (cada 2 min)
    // ═══════════════════════════════════════════════════════════
    console.log('🔗 Verificando bridges por expirar...');
    await verificarBridgesPorExpirar(supabase, meta);

    // ═══════════════════════════════════════════════════════════
    // FOLLOW-UPS PENDIENTES - Enviar si pasaron 30 min (cada 2 min)
    // ═══════════════════════════════════════════════════════════
    console.log('📤 Verificando follow-ups pendientes expirados...');
    await procesarFollowupsPendientes(supabase, meta);

    // ═══════════════════════════════════════════════════════════
    // BROADCAST QUEUE - Procesar broadcasts encolados (cada 2 min)
    // ═══════════════════════════════════════════════════════════
    console.log('📤 Procesando broadcasts encolados...');
    await procesarBroadcastQueue(supabase, meta);

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
    // DELIVERY CHECK - Verificar que mensajes al equipo llegaron (cada 10 min)
    // Detecta mensajes aceptados por Meta pero nunca entregados
    // ═══════════════════════════════════════════════════════════
    if (mexicoMinute % 10 === 0) {
      try {
        const deliveryResult = await verificarDeliveryTeamMessages(supabase, meta, '5610016226');
        if (deliveryResult.undelivered > 0) {
          console.log(`⚠️ ${deliveryResult.undelivered} mensajes sin entregar al equipo`);
        }
      } catch (deliveryError) {
        console.error('⚠️ Error en verificarDeliveryTeamMessages:', deliveryError);
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
      } catch (_) { /* fail silently */ }

      throw error; // Re-throw para que Cloudflare lo registre
    }
  },
};
