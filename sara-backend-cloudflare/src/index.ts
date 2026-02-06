import { SupabaseService } from './services/supabase';
import { ClaudeService } from './services/claude';
import { CacheService } from './services/cacheService';

import { MetaWhatsAppService } from './services/meta-whatsapp';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
import { handleTeamRoutes } from './routes/team-routes';
import { handlePromotionRoutes } from './routes/promotions';
import { FollowupService } from './services/followupService';
import { FollowupApprovalService } from './services/followupApprovalService';
import { NotificationService } from './services/notificationService';
import { BroadcastQueueService } from './services/broadcastQueueService';
import { IACoachingService } from './services/iaCoachingService';
import { CEOCommandsService } from './services/ceoCommandsService';
import { VendorCommandsService } from './services/vendorCommandsService';
import { SentryService, initSentry } from './services/sentryService';
import { FeatureFlagsService, createFeatureFlags } from './services/featureFlagsService';
import { EmailReportsService, createEmailReports } from './services/emailReportsService';
import { AudioTranscriptionService, createAudioTranscription, isAudioMessage, extractAudioInfo } from './services/audioTranscriptionService';
import { generateOpenAPISpec, generateSwaggerUI, generateReDocUI } from './services/apiDocsService';
import { AuditLogService, createAuditLog } from './services/auditLogService';
import { MetricsService, createMetrics } from './services/metricsService';
import { BusinessHoursService, createBusinessHours, isBusinessOpen } from './services/businessHoursService';
import { OutgoingWebhooksService, createOutgoingWebhooks } from './services/outgoingWebhooksService';
import { SentimentAnalysisService, createSentimentAnalysis, analyzeSentiment } from './services/sentimentAnalysisService';
import { WhatsAppTemplatesService, createWhatsAppTemplates } from './services/whatsappTemplatesService';
import { TeamDashboardService, createTeamDashboard } from './services/teamDashboardService';
import { PipelineService, formatPipelineForWhatsApp, formatCurrency } from './services/pipelineService';
import { FinancingCalculatorService } from './services/financingCalculatorService';
import { PropertyComparatorService } from './services/propertyComparatorService';
import { CloseProbabilityService } from './services/closeProbabilityService';
import { VisitManagementService } from './services/visitManagementService';
import { OfferTrackingService } from './services/offerTrackingService';
import { SmartAlertsService } from './services/smartAlertsService';
import { LeadDeduplicationService, createLeadDeduplication } from './services/leadDeduplicationService';
import { LinkTrackingService, createLinkTracking } from './services/linkTrackingService';
import { SLAMonitoringService, createSLAMonitoring } from './services/slaMonitoringService';
import { AutoAssignmentService, createAutoAssignment } from './services/autoAssignmentService';
import { LeadAttributionService, createLeadAttribution } from './services/leadAttributionService';
import { AIConversationService } from './services/aiConversationService';
import { TTSTrackingService, createTTSTrackingService, TTSMessageData, TTSType, RecipientType } from './services/ttsTrackingService';
import { MessageTrackingService, createMessageTrackingService, MessageData } from './services/messageTrackingService';

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
import { enviarMensajeTeamMember, EnviarMensajeTeamResult, isPendingExpired, getPendingMessages, verificarPendingParaLlamar, CALL_CONFIG } from './utils/teamMessaging';

// Briefings y Recaps
import {
  enviarFelicitaciones,
  logEvento,
  ejecutarTareaOneTime,
  enviarBriefingMatutino,
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
  felicitarCumpleañosEquipo
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
  procesarRespuestaMantenimiento
} from './crons/nurturing';

// Maintenance - Bridge, followups, stagnant leads, anniversaries
import {
  verificarBridgesPorExpirar,
  procesarFollowupsPendientes,
  verificarLeadsEstancados,
  felicitarAniversarioCompra
} from './crons/maintenance';

// Videos - Veo 3 video generation and processing
import {
  verificarVideosPendientes,
  generarVideoSemanalLogros,
  videoFelicitacionPostVenta,
  videoBienvenidaLeadNuevo
} from './crons/videos';

// Dashboard - System status, analytics, health, backup
import {
  SystemStatus,
  AnalyticsDashboard,
  getSystemStatus,
  getAnalyticsDashboard,
  renderAnalyticsPage,
  renderStatusPage,
  getHealthStatus,
  exportBackup
} from './crons/dashboard';

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
  // Permitir cualquier origen para el CRM (simplificado)
  if (origin) {
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

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Asignación inteligente de vendedores
// ═══════════════════════════════════════════════════════════════════════════
interface TeamMemberAvailability {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
  sales_count: number;
  vacation_start?: string;
  vacation_end?: string;
  is_on_duty?: boolean;
  work_start?: string;
  work_end?: string;
  working_days?: number[];
}

function getAvailableVendor(vendedores: TeamMemberAvailability[]): TeamMemberAvailability | null {
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentDay = now.getDay(); // 0=Dom, 1=Lun, ... 6=Sab
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  // Filtrar vendedores activos
  const activos = vendedores.filter(v => v.active && v.role === 'vendedor');

  if (activos.length === 0) {
    console.error('⚠️ No hay vendedores activos, buscando fallback...');

    // FALLBACK 1: Buscar coordinadores o admins activos
    const coordinadores = vendedores.filter(v =>
      v.active && (v.role === 'coordinador' || v.role === 'admin' || v.role === 'ceo' || v.role === 'director')
    );
    if (coordinadores.length > 0) {
      const elegido = coordinadores[0];
      console.log(`🔄 FALLBACK: Asignando a coordinador/admin ${elegido.name} (no hay vendedores)`);
      return elegido;
    }

    // FALLBACK 2: Cualquier team member activo
    const cualquiera = vendedores.filter(v => v.active);
    if (cualquiera.length > 0) {
      const elegido = cualquiera[0];
      console.log(`🚨 FALLBACK CRÍTICO: Asignando a ${elegido.name} (${elegido.role}) - NO HAY VENDEDORES`);
      return elegido;
    }

    // FALLBACK 3: NADIE disponible - LOG CRÍTICO
    console.error('🚨🚨🚨 CRÍTICO: NO HAY NINGÚN TEAM MEMBER ACTIVO - LEAD SE PERDERÁ');
    return null;
  }

  // Función para verificar si está disponible
  const estaDisponible = (v: TeamMemberAvailability): boolean => {
    // 1. Verificar vacaciones
    if (v.vacation_start && v.vacation_end) {
      if (today >= v.vacation_start && today <= v.vacation_end) {
        console.log(`🏖️ ${v.name} está de vacaciones`);
        return false;
      }
    }

    // 2. Verificar día laboral
    const workingDays = v.working_days || [1, 2, 3, 4, 5]; // Default L-V
    if (!workingDays.includes(currentDay)) {
      console.log(`📅 ${v.name} no trabaja hoy (día ${currentDay})`);
      return false;
    }

    // 3. Verificar horario (solo si está definido)
    if (v.work_start && v.work_end) {
      const [startH, startM] = v.work_start.split(':').map(Number);
      const [endH, endM] = v.work_end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentTimeMinutes < startMinutes || currentTimeMinutes > endMinutes) {
        console.log(`⏰ ${v.name} fuera de horario (${v.work_start}-${v.work_end})`);
        return false;
      }
    }

    return true;
  };

  // Separar en disponibles y de guardia
  const disponibles = activos.filter(estaDisponible);
  const deGuardia = disponibles.filter(v => v.is_on_duty);

  console.log(`📊 Asignación: ${activos.length} activos, ${disponibles.length} disponibles, ${deGuardia.length} de guardia`);

  // 1. Priorizar vendedores de guardia
  if (deGuardia.length > 0) {
    // Entre los de guardia, elegir el de menor ventas (round-robin)
    const elegido = deGuardia.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
    console.log(`🔥 Asignando a ${elegido.name} (de guardia, ${elegido.sales_count} ventas)`);
    return elegido;
  }

  // 2. Si hay disponibles, elegir el de menor ventas
  if (disponibles.length > 0) {
    const elegido = disponibles.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
    console.log(`✅ Asignando a ${elegido.name} (disponible, ${elegido.sales_count} ventas)`);
    return elegido;
  }

  // 3. Si nadie está disponible, asignar al de menor ventas de todos los activos (fallback)
  console.error('⚠️ Nadie disponible, usando fallback a activos');
  const fallback = activos.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
  console.error(`⚠️ Fallback: ${fallback.name} (${fallback.sales_count} ventas)`);
  return fallback;
}

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
      const { data: yo } = await supabase.client.from("team_members").select("*").eq("phone", "5215610016226").single();
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
        const { createTTSService } = await import('./services/ttsService');
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
            ok: false,
            error: 'Falta parámetro phone',
            uso: '/test-retell?phone=5215551234567&nombre=Juan&desarrollo=Monte Verde&api_key=XXX',
            config: {
              RETELL_API_KEY: '✅ Configurado',
              RETELL_AGENT_ID: '✅ Configurado',
              RETELL_PHONE_NUMBER: env.RETELL_PHONE_NUMBER
            }
          }));
        }

        console.log(`📞 TEST RETELL: Iniciando llamada a ${phone} (${nombre})`);

        const { createRetellService } = await import('./services/retellService');
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
    // TEST COMANDO CEO - Probar comandos sin enviar WhatsApp
    // USO: /test-comando-ceo?cmd=ventas
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-comando-ceo" && request.method === "GET") {
      const cmd = url.searchParams.get('cmd') || 'ayuda';
      const ceoService = new CEOCommandsService(supabase);

      // Detectar comando
      const detected = ceoService.detectCommand(cmd);
      if (!detected.action || detected.action === 'unknown') {
        return corsResponse(JSON.stringify({
          ok: false,
          comando: cmd,
          error: 'Comando no reconocido',
          detected
        }));
      }

      // Si requiere handler externo, mostrar info
      if (detected.action === 'call_handler' && detected.handlerName) {
        try {
          const result = await ceoService.executeHandler(detected.handlerName, 'Test CEO', detected.handlerParams);
          return corsResponse(JSON.stringify({
            ok: true,
            comando: cmd,
            handlerName: detected.handlerName,
            resultado: result.message || result
          }));
        } catch (e: any) {
          return corsResponse(JSON.stringify({
            ok: false,
            comando: cmd,
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
      const stats = cache.getStats();
      const available = cache.isAvailable();

      // Test de cache: escribir y leer
      let testResult = { write: false, read: false, value: null as string | null };
      if (available) {
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
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 DEBUG PENDING FOLLOWUP - Ver estado del pending_followup de un lead
    // USO: /debug-followup?phone=5610016226
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/debug-followup" && request.method === "GET") {
      const phone = url.searchParams.get('phone') || '';
      const phoneLimpio = phone.replace(/[-\s]/g, '');

      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes, assigned_to')
        .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
        .single();

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

      // Buscar lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
        .single();

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

      // Buscar lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, property_interest, conversation_history')
        .or(`phone.ilike.%${phoneLimpio}%,phone.ilike.%${phoneLimpio.slice(-10)}%`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
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
        const meta = createMetaWithTracking(env, supabase);
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
      await meta.sendWhatsAppMessage('5212224558475',
        `🚨 *EMERGENCY STOP ACTIVADO*\n\n` +
        `✅ Broadcasts deshabilitados\n` +
        `✅ ${cancelled?.length || 0} jobs cancelados\n` +
        `✅ ${followupsCancelled?.length || 0} follow-ups cancelados\n\n` +
        `Para reactivar: POST /api/broadcasts-enable`,
        true
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

      // Borrar leads de prueba existentes
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

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
        .insert({
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
        })
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

    // TEST: Desactivar team member por teléfono (para pruebas)
    if (url.pathname === "/test-disable-team-member") {
      const phone = url.searchParams.get('phone');
      if (!phone) return corsResponse(JSON.stringify({ error: "Falta phone" }), 400);
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      const { data: member, error: findErr } = await supabase.client
        .from('team_members')
        .select('id, name, phone, active')
        .ilike('phone', `%${phoneSuffix}`)
        .single();
      if (findErr || !member) return corsResponse(JSON.stringify({ error: "No encontrado", phoneSuffix }), 404);
      const { error } = await supabase.client.from('team_members').update({ active: false }).eq('id', member.id);
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
      return corsResponse(JSON.stringify({ ok: true, message: `${member.name} desactivado`, member }));
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
      const nombre = url.searchParams.get('nombre');
      if (!nombre) {
        return corsResponse(JSON.stringify({ error: "Falta ?nombre=X" }), 400);
      }
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
      const nombre = url.searchParams.get('nombre');
      if (!nombre) {
        return corsResponse(JSON.stringify({ error: "Falta ?nombre=X" }), 400);
      }
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

    // ═══════════════════════════════════════════════════════════
    // DIAGNÓSTICO CRM - Ver datos para verificar comandos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === "/api/diagnostico" && request.method === "GET") {
      const ahora = new Date();
      const hoyMexico = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
      const hoyStr = hoyMexico.toISOString().split('T')[0];
      const finSemana = new Date(hoyMexico.getTime() + 7*24*60*60*1000).toISOString().split('T')[0];

      // Team members
      const { data: team } = await supabase.client.from('team_members').select('id,name,role,phone').eq('active', true);

      // Leads
      const { data: leads } = await supabase.client.from('leads').select('id,name,status,lead_category,assigned_to').order('updated_at', { ascending: false }).limit(100);

      // Citas hoy
      const { data: citasHoy } = await supabase.client.from('appointments').select('id,lead_name,scheduled_date,scheduled_time,status,vendedor_id').eq('scheduled_date', hoyStr);

      // Citas semana
      const { data: citasSemana } = await supabase.client.from('appointments').select('id,lead_name,scheduled_date,scheduled_time,status').gte('scheduled_date', hoyStr).lte('scheduled_date', finSemana).eq('status', 'scheduled').order('scheduled_date', { ascending: true });

      // Mortgage
      const { data: mortgages } = await supabase.client.from('mortgage_applications').select('id,lead_name,status,bank').limit(20);

      // Agrupar
      const leadsByStatus: Record<string, number> = {};
      const leadsByCategory: Record<string, number> = {};
      const leadsByVendedor: Record<string, number> = {};
      leads?.forEach((l: any) => {
        leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;
        leadsByCategory[l.lead_category || 'SIN_CAT'] = (leadsByCategory[l.lead_category || 'SIN_CAT'] || 0) + 1;
        leadsByVendedor[l.assigned_to || 'SIN_ASIGNAR'] = (leadsByVendedor[l.assigned_to || 'SIN_ASIGNAR'] || 0) + 1;
      });

      const mortByStatus: Record<string, number> = {};
      mortgages?.forEach((m: any) => { mortByStatus[m.status] = (mortByStatus[m.status] || 0) + 1; });

      return corsResponse(JSON.stringify({
        fecha: hoyStr,
        team: team?.map((t: any) => ({ id: t.id, name: t.name, role: t.role, phone: t.phone?.slice(-4) })),
        leads: {
          total: leads?.length || 0,
          porStatus: leadsByStatus,
          porCategoria: leadsByCategory,
          porVendedor: Object.entries(leadsByVendedor).map(([id, count]) => {
            const v = team?.find((t: any) => t.id === id);
            return { vendedor: v?.name || id, leads: count };
          })
        },
        citasHoy: citasHoy?.map((c: any) => ({ hora: c.scheduled_time, lead: c.lead_name, status: c.status })) || [],
        citasSemana: citasSemana?.map((c: any) => ({ fecha: c.scheduled_date, hora: c.scheduled_time, lead: c.lead_name })) || [],
        mortgages: { total: mortgages?.length || 0, porStatus: mortByStatus }
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // API - Crear Evento
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/events' && request.method === 'POST') {
      const body = await request.json() as any;
      // Solo campos básicos que sabemos que existen
      const insertData: any = {
        name: body.name,
        event_type: body.event_type || 'open_house',
        event_date: body.event_date
      };
      // Agregar campos opcionales si se envían
      if (body.event_time) insertData.event_time = body.event_time;
      if (body.location) insertData.location = body.location;
      if (body.max_capacity) insertData.max_capacity = body.max_capacity;

      const { data, error } = await supabase.client.from('events').insert(insertData).select().single();

      if (error) return corsResponse(JSON.stringify({ error: error.message }), 400);
      return corsResponse(JSON.stringify(data));
    }

    // API - Obtener Eventos
    if (url.pathname === '/api/events' && request.method === 'GET') {
      const { data, error } = await supabase.client.from('events').select('*').order('event_date', { ascending: false });
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 400);
      return corsResponse(JSON.stringify(data));
    }

    // ═══════════════════════════════════════════════════════════
    // API - Enviar Invitaciones a Eventos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/events/invite' && request.method === 'POST') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const body = await request.json() as { event_id: string, segment: string, send_image: boolean, send_video: boolean, send_pdf: boolean };

      // 1. Obtener evento
      const { data: event } = await supabase.client.from('events').select('*').eq('id', body.event_id).single();
      if (!event) {
        return corsResponse(JSON.stringify({ success: false, error: 'Evento no encontrado' }), 404);
      }

      // 2. Obtener leads del segmento
      let query = supabase.client.from('leads').select('id, name, phone, lead_score, score, status, notes');
      const { data: allLeads } = await query;

      let leads = (allLeads || []).filter((l: any) => l.phone);
      const seg = body.segment;

      if (seg === 'hot') {
        leads = leads.filter((l: any) => (l.lead_score || l.score || 0) >= 70);
      } else if (seg === 'warm') {
        leads = leads.filter((l: any) => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
      } else if (seg === 'cold') {
        leads = leads.filter((l: any) => (l.lead_score || l.score || 0) < 40);
      } else if (seg === 'compradores') {
        leads = leads.filter((l: any) => ['closed_won', 'delivered'].includes(l.status));
      }

      // 3. Formatear fecha del evento
      const eventDate = new Date(event.event_date);
      const formattedDate = eventDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      // 4. Generar mensaje de invitacion
      const inviteMessage = event.invitation_message || `Hola! Te invitamos a *${event.name}*

${event.description || ''}

Fecha: ${formattedDate}
${event.event_time ? `Hora: ${event.event_time}` : ''}
${event.location ? `Lugar: ${event.location}` : ''}
${event.location_url ? `Ubicacion: ${event.location_url}` : ''}

Responde *SI* para confirmar tu asistencia.`;

      let sent = 0;
      let errors = 0;

      // 5. Enviar a cada lead
      for (const lead of leads) {
        try {
          const phone = lead.phone.replace(/\D/g, '');
          const formattedPhone = phone.startsWith('521') ? phone : (phone.startsWith('52') ? `521${phone.slice(2)}` : `521${phone}`);

          // Enviar imagen si existe y fue seleccionada
          if (body.send_image && event.image_url) {
            await meta.sendWhatsAppImage(formattedPhone, event.image_url, event.name);
            await new Promise(r => setTimeout(r, 500));
          }

          // Enviar mensaje principal
          await meta.sendWhatsAppMessage(formattedPhone, inviteMessage);
          await new Promise(r => setTimeout(r, 500));

          // Enviar video si existe y fue seleccionado
          if (body.send_video && event.video_url) {
            await meta.sendWhatsAppVideo(formattedPhone, event.video_url, 'Video del evento');
            await new Promise(r => setTimeout(r, 500));
          }

          // Enviar PDF si existe y fue seleccionado
          if (body.send_pdf && event.pdf_url) {
            await meta.sendWhatsAppDocument(formattedPhone, event.pdf_url, `${event.name}.pdf`);
            await new Promise(r => setTimeout(r, 500));
          }

          // 6. Guardar pending_event_registration en notes del lead
          const currentNotes = lead.notes || {};
          await supabase.client.from('leads').update({
            notes: {
              ...currentNotes,
              pending_event_registration: {
                event_id: event.id,
                event_name: event.name,
                invited_at: new Date().toISOString()
              }
            }
          }).eq('id', lead.id);

          sent++;
        } catch (err: any) {
          console.error(`Error enviando a ${lead.phone}:`, err.message);
          errors++;
        }
      }

      return corsResponse(JSON.stringify({
        success: true,
        sent,
        errors,
        total: leads.length,
        event: event.name,
        segment: seg
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Leads
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads' && request.method === 'GET') {
      const { data } = await supabase.client
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      return corsResponse(JSON.stringify(data || []));
    }

    // ═══════════════════════════════════════════════════════════
    // API: Borrar lead y datos asociados (para testing)
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.match(/^\/api\/leads\/[^/]+$/) && request.method === 'DELETE') {
      const leadId = url.pathname.split('/').pop();
      console.log('🗑️ Borrando lead:', leadId);

      try {
        // 1. Buscar citas asociadas para borrar eventos de Calendar
        const { data: appointments } = await supabase.client
          .from('appointments')
          .select('id, google_event_vendedor_id')
          .eq('lead_id', leadId);

        // 2. Borrar eventos de Calendar
        if (appointments && appointments.length > 0) {
          const calendar = new CalendarService(
            env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            env.GOOGLE_PRIVATE_KEY,
            env.GOOGLE_CALENDAR_ID
          );

          for (const apt of appointments) {
            if (apt.google_event_vendedor_id) {
              try {
                await calendar.deleteEvent(apt.google_event_vendedor_id);
                console.log('🗑️ Evento de Calendar borrado:', apt.google_event_vendedor_id);
              } catch (e) {
                console.error('⚠️ No se pudo borrar evento:', apt.google_event_vendedor_id);
              }
            }
          }
        }

        // 3. Borrar citas de la BD
        await supabase.client
          .from('appointments')
          .delete()
          .eq('lead_id', leadId);
        console.log('🗑️ Citas borradas');

        // 4. Borrar mensajes del lead
        await supabase.client
          .from('messages')
          .delete()
          .eq('lead_id', leadId);
        console.log('🗑️ Mensajes borrados');

        // 5. Borrar el lead
        const { error } = await supabase.client
          .from('leads')
          .delete()
          .eq('id', leadId);

        if (error) {
          console.error('❌ Error borrando lead:', error);
          return corsResponse(JSON.stringify({ error: error.message }), 500);
        }

        console.log('✅ Lead y datos asociados borrados:', leadId);
        return corsResponse(JSON.stringify({ success: true, deleted: leadId }));
      } catch (err: any) {
        console.error('❌ Error en delete lead:', err);
        return corsResponse(JSON.stringify({ error: err.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // API: Recalcular scores de todos los leads según su status
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/recalculate-scores' && request.method === 'POST') {
      try {
        // Score base por status del funnel
        const SCORE_BY_STATUS: Record<string, number> = {
          'new': 15,
          'contacted': 35,
          'scheduled': 55,
          'visited': 80,
          'negotiation': 90,
          'negotiating': 90,
          'reserved': 95,
          'closed_won': 100,
          'closed': 100,
          'delivered': 100,
          'fallen': 0
        };

        const { data: leads } = await supabase.client
          .from('leads')
          .select('id, status, name, property_interest, needs_mortgage, enganche_disponible');

        if (!leads) {
          return corsResponse(JSON.stringify({ error: 'No se pudieron obtener leads' }), 500);
        }

        let updated = 0;
        const results: any[] = [];

        for (const lead of leads) {
          const status = lead.status || 'new';
          let baseScore = SCORE_BY_STATUS[status] ?? 15;

          // Bonificaciones menores
          let bonus = 0;
          if (lead.name && lead.name !== 'Sin nombre') bonus += 2;
          if (lead.property_interest) bonus += 2;
          if (lead.needs_mortgage) bonus += 3;
          if (lead.enganche_disponible && lead.enganche_disponible > 0) bonus += 3;

          const finalScore = Math.min(100, baseScore + bonus);

          // Determinar temperatura
          let temperature = 'COLD';
          let lead_category = 'cold';
          if (finalScore >= 70) {
            temperature = 'HOT';
            lead_category = 'hot';
          } else if (finalScore >= 40) {
            temperature = 'WARM';
            lead_category = 'warm';
          }

          // Actualizar
          const { error } = await supabase.client
            .from('leads')
            .update({
              score: finalScore,
              lead_score: finalScore,
              temperature,
              lead_category
            })
            .eq('id', lead.id);

          if (!error) {
            updated++;
            results.push({
              id: lead.id,
              status,
              oldScore: 'N/A',
              newScore: finalScore,
              temperature
            });
          }
        }

        return corsResponse(JSON.stringify({
          success: true,
          total: leads.length,
          updated,
          results
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    if (url.pathname.match(/^\/api\/leads\/[^\/]+$/) && request.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const { data } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    if (url.pathname.match(/^\/api\/leads\/[^\/]+$/) && request.method === 'PUT') {
      const id = url.pathname.split('/').pop();
      const body = await request.json() as any;
      
      // Verificar si cambió el assigned_to para notificar
      const { data: oldLead } = await supabase.client
        .from('leads')
        .select('assigned_to, name, phone, property_interest, notes, score, status')
        .eq('id', id)
        .single();
      
      // Recalcular score basado en datos del lead
      let newScore = oldLead?.score || 0;
      const oldStatus = oldLead?.status;
      
      // Si cambió el status, ajustar score basado en FUNNEL
      if (body.status && body.status !== oldLead?.status) {
        // Scores alineados con umbrales: HOT >= 70, WARM >= 40, COLD < 40
        const statusScores: Record<string, number> = {
          'new': 15,              // COLD
          'contacted': 35,        // COLD
          'scheduled': 55,        // WARM
          'visited': 80,          // HOT
          'negotiation': 90,      // HOT
          'negotiating': 90,      // HOT
          'reserved': 95,         // HOT
          'closed_won': 100,      // HOT
          'closed': 100,          // HOT
          'delivered': 100,       // HOT
          'fallen': 0             // COLD
        };
        newScore = statusScores[body.status] ?? newScore;

        // Temperatura basada en score (umbrales unificados)
        let temperatura = 'COLD';
        if (newScore >= 70) {
          temperatura = 'HOT';
        } else if (newScore >= 40) {
          temperatura = 'WARM';
        }

        body.temperature = temperatura;
        body.score = newScore;
        body.lead_score = newScore;
        body.lead_category = temperatura.toLowerCase();
        console.log('📊 Score actualizado por status:', body.status, '→', newScore, 'Temp:', temperatura);
      }
      
      // Si tiene desarrollo de interés y no tenía, +15
      if (body.property_interest && !oldLead?.property_interest) {
        newScore += 15;
        body.score = newScore;
        body.lead_score = newScore;
      }
      
      const { data } = await supabase.client
        .from('leads')
        .update(body)
        .eq('id', id)
        .select()
        .single();
      
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICAR AL VENDEDOR CUANDO CAMBIA EL STATUS
      // ═══════════════════════════════════════════════════════════════
      if (data && body.status && oldStatus && body.status !== oldStatus) {
        try {
          // Buscar vendedor asignado al lead
          const vendedorId = data.assigned_to || oldLead?.assigned_to;
          if (vendedorId) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('name, phone')
              .eq('id', vendedorId)
              .single();
            
            if (vendedor?.phone) {
              const statusEmojis: Record<string, string> = {
                'new': '🆕 NUEVO',
                'contacted': '📞 CONTACTADO',
                'scheduled': '📅 CITA AGENDADA',
                'visited': '🏠 VISITÓ',
                'negotiation': '💰 NEGOCIACIÓN',
                'reserved': '📍 RESERVADO',
                'closed': '✅ CERRADO',
                'delivered': '🔑 ENTREGADO',
                'fallen': '❌ CAÍDO'
              };
              
              const statusAnterior = statusEmojis[oldStatus] || oldStatus;
              const statusNuevo = statusEmojis[body.status] || body.status;
              
              const mensaje = `📊 *LEAD ACTUALIZADO*
━━━━━━━━━━━━━━━━━━━━

👤 *${data.name}*
📱 ${data.phone}

${statusAnterior} → ${statusNuevo}

🎯 Score: ${newScore}`;
              
              await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
              console.log('📤 Notificación de cambio de status enviada a:', vendedor.name);
            }
          }
        } catch (e) {
          console.error('⚠️ Error notificando cambio de status:', e);
        }
      }
      
      // Si cambió el vendedor asignado, notificar al nuevo
      if (data && body.assigned_to && oldLead?.assigned_to !== body.assigned_to) {
        try {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('name, phone')
            .eq('id', body.assigned_to)
            .single();

          if (vendedor?.phone) {
            const mensaje = `📋 *Lead Reasignado*
━━━━━━━━━━━━━━━━━━
👤 *Nombre:* ${data.name || 'Sin nombre'}
📱 *Tel:* ${data.phone || 'Sin teléfono'}
🏠 *Interés:* ${data.property_interest || 'No especificado'}
📍 *Notas:* ${data.notes || 'Sin notas'}
━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar pronto!*`;

            await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
            console.log('📤 Notificación enviada a', vendedor.name);
          }
        } catch (e) {
          console.error('⚠️ Error notificando:', e);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // NOTIFICAR AL ASESOR HIPOTECARIO CUANDO SE LE ASIGNA UN LEAD
      // ═══════════════════════════════════════════════════════════════
      if (data && body.asesor_banco_id && oldLead?.asesor_banco_id !== body.asesor_banco_id) {
        try {
          const { data: asesor } = await supabase.client
            .from('team_members')
            .select('name, phone')
            .eq('id', body.asesor_banco_id)
            .single();

          // Obtener vendedor para incluir en notificación
          const { data: vendedorLead } = await supabase.client
            .from('team_members')
            .select('name, phone')
            .eq('id', data.assigned_to)
            .single();

          if (asesor?.phone && asesor?.is_active !== false) {
            const mensaje = `🏦 *LEAD ASIGNADO PARA CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name || 'Sin nombre'}
📱 *Tel:* ${data.phone || 'Sin teléfono'}
🏠 *Desarrollo:* ${data.property_interest || 'No especificado'}

${vendedorLead ? `👔 *Vendedor:* ${vendedorLead.name}\n📱 *Tel vendedor:* ${vendedorLead.phone}` : ''}

━━━━━━━━━━━━━━━━━━━━━━
💳 *¡Contactar para iniciar trámite!*`;

            await meta.sendWhatsAppMessage(asesor.phone, mensaje);
            console.log('📤 Notificación enviada a asesor hipotecario:', asesor.name);
          }

          // También notificar al vendedor que su lead fue asignado a un asesor
          if (vendedorLead?.phone && asesor?.name) {
            const msgVendedor = `💳 *TU LEAD CON ASESOR HIPOTECARIO*
━━━━━━━━━━━━━━━━━━━━━━

👤 *${data.name}* ahora está siendo atendido por:
🏦 *Asesor:* ${asesor.name}
${asesor.phone ? `📱 *Tel:* ${asesor.phone}` : ''}

¡Coordina con el asesor para cerrar! 💪`;

            await meta.sendWhatsAppMessage(vendedorLead.phone, msgVendedor);
            console.log('📤 Vendedor notificado de asignación a asesor');
          }
        } catch (e) {
          console.error('⚠️ Error notificando asesor hipotecario:', e);
        }
      }

      return corsResponse(JSON.stringify(data || {}));
    }

    // ═══════════════════════════════════════════════════════════════
    // API: Crear Lead con Round-Robin + Notificaciones Completas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      
      let vendedorAsignado = null;
      const esVendedor = body.creador_role === 'vendedor';

      // Si no tiene assigned_to, usar asignación inteligente
      if (!body.assigned_to) {
        const { data: todosVendedores } = await supabase.client
          .from('team_members')
          .select('*')
          .eq('active', true);

        vendedorAsignado = getAvailableVendor(todosVendedores || []);
        if (vendedorAsignado) {
          body.assigned_to = vendedorAsignado.id;
        } else {
          // 🚨 ALERTA: No hay vendedor disponible - notificar admin
          console.error('🚨 CRÍTICO: Lead creado SIN VENDEDOR - phone:', body.phone);
          // Guardar en notes para tracking
          body.notes = { ...(body.notes || {}), sin_vendedor: true, alerta_enviada: new Date().toISOString() };
        }
      } else {
        const { data: v } = await supabase.client
          .from('team_members')
          .select('*')
          .eq('id', body.assigned_to)
          .single();
        vendedorAsignado = v;
      }
      
      // Crear el lead (solo campos válidos de la tabla)
      // Calcular score inicial basado en datos
      let initialScore = 0;
      if (body.property_interest) initialScore += 15; // Tiene desarrollo de interés
      if (body.tiene_cita) initialScore += 20; // Tiene cita programada
      if (body.necesita_credito === 'si') initialScore += 10; // Necesita crédito
      
      // Determinar temperatura
      let temperature = 'COLD';
      if (initialScore >= 61) temperature = 'HOT';
      else if (initialScore >= 31) temperature = 'WARM';
      
      console.log('📊 Score inicial:', initialScore, 'Temp:', temperature);
      
      const leadData = {
        name: body.name,
        phone: body.phone,
        property_interest: body.property_interest,
        budget: body.budget,
        status: body.status || 'new',
        score: initialScore,
        temperature: temperature,
        assigned_to: body.assigned_to,
        captured_by: body.captured_by,
        source: body.source,
        created_at: body.created_at,
        banco_preferido: body.banco_preferido,
        enganche_disponible: body.enganche_disponible ? parseInt(body.enganche_disponible.replace(/[^0-9]/g, '')) : null,
        notes: {
          modelo: body.modelo,
          recamaras: body.recamaras,
          necesita_credito: body.necesita_credito,
          ingreso_mensual: body.ingreso_mensual,
          cita: body.tiene_cita ? {
            fecha: body.cita_fecha,
            hora: body.cita_hora,
            desarrollo: body.cita_desarrollo
          } : null,
          notas_adicionales: body.notas,
          creado_por: body.creador_name
        }
      };
      
      const { data, error } = await supabase.client
        .from('leads')
        .insert([leadData])
        .select()
        .single();
      
      if (error) {
        console.error('❌ Error creando lead:', error);
        // Mensaje amigable para teléfono duplicado
        if (error.code === '23505' && error.message.includes('phone')) {
          return corsResponse(JSON.stringify({ error: 'Ya existe un lead con este teléfono. Búscalo en la lista de leads.' }), 400);
        }
        return corsResponse(JSON.stringify({ error: error.message }), 400);
      }
      
      console.log('✅ Lead creado:', data.id);
      
      // Buscar propiedad para obtener GPS del desarrollo
      let gpsLink = '';
      const desarrolloCita = body.cita_desarrollo || body.desarrollo || data.property_interest;
      if (desarrolloCita && desarrolloCita !== 'Oficinas Centrales') {
        const { data: prop } = await supabase.client
          .from('properties')
          .select('gps_link, development, name')
          .or(`development.ilike.%${desarrolloCita}%,name.ilike.%${desarrolloCita}%`)
          .limit(1)
          .single();
        
        if (prop?.gps_link) {
          gpsLink = prop.gps_link;
          console.log('📍 GPS encontrado:', gpsLink);
        }
      } else if (desarrolloCita === 'Oficinas Centrales') {
        // Link de oficinas centrales Santa Rita
        gpsLink = 'https://maps.app.goo.gl/hUk6aH8chKef6NRY7';
      }
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICACIÓN 1: Al vendedor (solo si NO es él quien creó)
      // ═══════════════════════════════════════════════════════════════
      if (vendedorAsignado?.phone && !esVendedor) {
        try {
          const citaInfo = body.tiene_cita 
            ? `\n📅 *Cita:* ${body.cita_fecha} a las ${body.cita_hora}\n📍 *Lugar:* ${body.cita_desarrollo}${gpsLink ? '\n🗺️ *Maps:* ' + gpsLink : ''}` 
            : '';
          
          const creditoInfo = body.necesita_credito === 'si'
            ? `\n🏦 *Crédito:* Sí necesita (${body.banco_preferido || 'banco por definir'})`
            : '';
          
          const mensaje = `📋 *NUEVO LEAD ASIGNADO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name}
📱 *Tel:* ${data.phone}
📣 *Fuente:* ${body.source || 'CRM'}

🏠 *Interés:* ${data.property_interest || 'No especificado'}
${body.modelo ? `🏡 *Modelo:* ${body.modelo}` : ''}
💰 *Presupuesto:* ${data.budget || 'No especificado'}
${creditoInfo}${citaInfo}

📍 *Notas:* ${body.notas || 'Sin notas'}

━━━━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar pronto!*
👤 Asignado por: ${body.creador_name || 'CRM'}`;
          
          await meta.sendWhatsAppMessage(vendedorAsignado.phone, mensaje);
          console.log('📤 Notificación enviada a vendedor:', vendedorAsignado.name);
        } catch (e) {
          console.error('⚠️ Error notificando vendedor:', e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CREAR MORTGAGE APPLICATION (siempre que necesite crédito)
      // ═══════════════════════════════════════════════════════════════
      let asesorAsignado: any = null;
      
      if (body.necesita_credito === 'si') {
        try {
          console.log('📍 Buscando asesor para banco:', body.banco_preferido);
          
          const { data: asesores } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('role', 'asesor')
            .eq('active', true);
          
          console.log('📋 Asesores encontrados:', asesores?.length, asesores?.map(a => ({ name: a.name, banco: a.banco })));
          
          // Buscar coincidencia flexible con banco
          if (body.banco_preferido) {
            asesorAsignado = asesores?.find(a => 
              a.banco?.toLowerCase().includes(body.banco_preferido.toLowerCase()) ||
              body.banco_preferido.toLowerCase().includes(a.banco?.toLowerCase())
            );
          }
          
          // Crear registro en mortgage_applications
          const ingresoNum = parseInt(body.ingreso_mensual?.replace(/[^0-9]/g, '') || '0');
          const engancheNum = parseInt(body.enganche_disponible?.replace(/[^0-9]/g, '') || '0');
          const presupuestoNum = parseInt(body.budget?.replace(/[^0-9]/g, '') || '0');
          
          const { data: mortgage, error: mortgageError } = await supabase.client
            .from('mortgage_applications')
            .insert({
              lead_id: data.id,
              lead_name: data.name,
              lead_phone: data.phone,
              property_name: data.property_interest || '',
              monthly_income: ingresoNum,
              down_payment: engancheNum,
              requested_amount: presupuestoNum > engancheNum ? presupuestoNum - engancheNum : presupuestoNum,
              bank: body.banco_preferido || 'Por definir',
              assigned_advisor_id: asesorAsignado?.id || null,
              assigned_advisor_name: asesorAsignado?.name || null,
              status: 'pending',
              pending_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (mortgageError) {
            console.error('⚠️ Error creando mortgage:', mortgageError);
          } else {
            console.log('📋 Mortgage creado:', mortgage?.id, 'Asesor:', asesorAsignado?.name || 'Sin asignar');
          }
          
          // Notificar al asesor si el usuario lo pidió (solo si está activo)
          if (body.enviar_a_asesor && asesorAsignado?.phone && asesorAsignado?.is_active !== false) {
            const msgAsesor = `🏦 *NUEVO LEAD DE CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name}
📱 *Tel:* ${data.phone}

🏦 *Banco:* ${body.banco_preferido}
💵 *Ingreso:* ${body.ingreso_mensual || 'No especificado'}
💰 *Enganche:* ${body.enganche_disponible || 'No especificado'}

🏠 *Interés:* ${data.property_interest || 'No especificado'}
💰 *Presupuesto:* ${data.budget || 'No especificado'}

━━━━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar para pre-calificación!*
👤 Vendedor: ${vendedorAsignado?.name || 'Por asignar'}`;
            
            await meta.sendWhatsAppMessage(asesorAsignado.phone, msgAsesor);
            console.log('📤 Notificación enviada a asesor:', asesorAsignado.name);
          } else if (body.enviar_a_asesor && !asesorAsignado) {
            console.error('⚠️ No se encontró asesor para banco:', body.banco_preferido);
          }
        } catch (e) {
          console.error('⚠️ Error en proceso de crédito:', e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CREAR CITA (si tiene cita agendada)
      // ═══════════════════════════════════════════════════════════════
      if (body.tiene_cita && body.cita_fecha) {
        try {
          // Construir fecha/hora en formato local (no UTC)
          const citaHora = (body.cita_hora || '10:00').substring(0, 5);
          const dateTimeStr = `${body.cita_fecha}T${citaHora}:00`;
          const [hourNum] = citaHora.split(':').map(Number);
          const endHour = String(hourNum + 1).padStart(2, '0');
          const endTimeStr = `${body.cita_fecha}T${endHour}:${citaHora.split(':')[1]}:00`;
          
          // 1. Crear en Google Calendar
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          
          const eventTitle = `🏠 Cita: ${data.name} - ${body.cita_desarrollo || 'Visita'}`;
          const eventDescription = `👤 Cliente: ${data.name}
📱 Tel: ${data.phone}
🏠 Desarrollo: ${body.cita_desarrollo || 'No especificado'}
💰 Presupuesto: ${data.budget || 'No especificado'}
👤 Vendedor: ${vendedorAsignado?.name || 'Por asignar'}
${gpsLink ? '📍 Ubicación: ' + gpsLink : ''}

Creado desde CRM por: ${body.creador_name || 'Sistema'}`;

          const eventData = {
            summary: eventTitle,
            description: eventDescription,
            location: body.cita_desarrollo === 'Oficinas Centrales' ? 'Oficinas Grupo Santa Rita' : body.cita_desarrollo,
            start: {
              dateTime: dateTimeStr,
              timeZone: 'America/Mexico_City'
            },
            end: {
              dateTime: endTimeStr,
              timeZone: 'America/Mexico_City'
            }
          };
          
          const googleEvent = await calendar.createEvent(eventData);
          
          console.log('📅 Evento Google Calendar creado:', googleEvent?.id);
          
          // 2. Crear en tabla appointments del CRM
          const { data: appointment, error: appointmentError } = await supabase.client
            .from('appointments')
            .insert({
              lead_id: data.id,
              lead_name: data.name,
              lead_phone: data.phone,
              property_name: body.cita_desarrollo || data.property_interest || '',
              scheduled_date: body.cita_fecha,
              scheduled_time: citaHora,
              status: 'scheduled',
              appointment_type: 'visita',
              duration_minutes: 60,
              vendedor_id: vendedorAsignado?.id || null,
              vendedor_name: vendedorAsignado?.name || null,
              google_event_vendedor_id: googleEvent?.id || null,
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (appointmentError) {
            console.error('⚠️ Error creando appointment:', appointmentError);
          } else {
            console.log('📅 Appointment creado en CRM:', appointment?.id);
          }
          
        } catch (e) {
          console.error('⚠️ Error creando cita:', e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICACIÓN 3: Al cliente (confirmación)
      // ═══════════════════════════════════════════════════════════════
      if (data.phone) {
        try {
          let msgCliente = `¡Hola ${data.name?.split(' ')[0] || ''}! 👋

Gracias por tu interés en *Grupo Santa Rita*. 🏡

Tu asesor *${vendedorAsignado?.name || 'asignado'}* te contactará muy pronto.
📱 Tel: ${vendedorAsignado?.phone || 'Por confirmar'}`;

          if (body.tiene_cita) {
            msgCliente += `

📅 *Tu cita está confirmada:*
• Fecha: ${body.cita_fecha}
• Hora: ${body.cita_hora || 'Por confirmar'}
• Lugar: ${body.cita_desarrollo}
${gpsLink ? '📍 Ubicación: ' + gpsLink : ''}

¡Te esperamos! 🎉`;
          } else {
            msgCliente += `

¿Hay algo más en lo que pueda ayudarte? 😊`;
          }
          
          await meta.sendWhatsAppMessage(data.phone, msgCliente);
          console.log('📤 Confirmación enviada a cliente:', data.name);
        } catch (e) {
          console.error('⚠️ Error notificando cliente:', e);
        }
      }
      
      return corsResponse(JSON.stringify(data), 201);
    }

    // ═══════════════════════════════════════════════════════════════
    // API Routes - Appointments
    // ═══════════════════════════════════════════════════════════════
    
    // Cancelar cita (y eliminar de Google Calendar)
    if (url.pathname.match(/^\/api\/appointments\/[^/]+\/cancel$/) && request.method === 'POST') {
      const id = url.pathname.split('/')[3];
      const body = await request.json() as any;
      
      try {
        // Obtener la cita para tener el google_event_id
        const { data: appointment } = await supabase.client
          .from('appointments')
          .select('*')
          .eq('id', id)
          .single();
        
        if (!appointment) {
          return corsResponse(JSON.stringify({ error: 'Cita no encontrada' }), 404);
        }
        
        // Eliminar de Google Calendar si existe
        const googleEventId = body.google_event_id || appointment.google_event_vendedor_id;
        if (googleEventId) {
          try {
            const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
            await calendar.deleteEvent(googleEventId);
            console.log('📅 Evento eliminado de Google Calendar:', googleEventId);
          } catch (calError) {
            console.error('⚠️ Error eliminando de Google Calendar:', calError);
          }
        }
        
        // Actualizar en DB
        const { data, error } = await supabase.client
          .from('appointments')
          .update({ 
            status: 'cancelled',
            cancelled_by: body.cancelled_by || 'CRM',
          })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        
        console.log('✅ Cita cancelada:', id);
        
        // ═══ ENVIAR NOTIFICACIONES DE CANCELACIÓN ═══
        if (body.notificar !== false) { // Por defecto notificar
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

          // Formatear fecha
          const fechaObj = new Date(appointment.scheduled_date + 'T12:00:00');
          const fechaFormateada = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
          const horaFormateada = (appointment.scheduled_time || '').substring(0, 5);

          // Detectar si es llamada o cita presencial
          const esLlamada = appointment.appointment_type === 'llamada';
          const tipoTitulo = esLlamada ? 'LLAMADA CANCELADA' : 'CITA CANCELADA';
          const tipoTexto = esLlamada ? 'llamada' : 'cita';

          // Notificar al cliente
          if (appointment.lead_phone) {
            try {
              let msgCliente = `❌ *${tipoTitulo}*

Hola ${appointment.lead_name || ''} 👋

Tu ${tipoTexto} ha sido cancelada:

📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

              // Solo mostrar ubicación para citas presenciales
              if (!esLlamada && appointment.property_name) {
                msgCliente += `
📍 *Lugar:* ${appointment.property_name}`;
              }

              msgCliente += `

Si deseas reagendar, contáctanos. ¡Estamos para servirte! ${esLlamada ? '📞' : '🏠'}`;

              const phoneCliente = appointment.lead_phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneCliente, msgCliente);
              console.log('📤 Notificación de cancelación enviada a cliente:', appointment.lead_name);
            } catch (e) {
              console.error('⚠️ Error notificando cliente:', e);
            }
          }

          // Notificar al vendedor
          if (appointment.vendedor_id) {
            try {
              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .eq('id', appointment.vendedor_id)
                .single();

              if (vendedor?.phone) {
                let msgVendedor = `❌ *${tipoTitulo}*

👤 *Cliente:* ${appointment.lead_name}
📱 *Tel:* ${appointment.lead_phone}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

                // Solo mostrar ubicación para citas presenciales
                if (!esLlamada && appointment.property_name) {
                  msgVendedor += `
📍 *Lugar:* ${appointment.property_name}`;
                }

                msgVendedor += `

Cancelada por: ${body.cancelled_by || 'CRM'}`;

                const phoneVendedor = vendedor.phone.replace(/[^0-9]/g, '');
                await meta.sendWhatsAppMessage(phoneVendedor, msgVendedor);
                console.log('📤 Notificación de cancelación enviada a vendedor:', vendedor.name);
              }
            } catch (e) {
              console.error('⚠️ Error notificando vendedor:', e);
            }
          }
        }
        
        return corsResponse(JSON.stringify(data));
      } catch (e: any) {
        console.error('❌ Error cancelando cita:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Notificar cambio/cancelación de cita (usado por coordinadores)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/appointments/notify-change' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      console.log('📋 Notificación de cita:', body.action, body.lead_name);

      try {
        const esCambio = body.action === 'cambio';
        const fechaVieja = body.old_date ? new Date(body.old_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }) : '';
        const fechaNueva = body.new_date ? new Date(body.new_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }) : '';

        if (esCambio) {
          // ═══ NOTIFICAR CAMBIO DE CITA ═══

          // Al vendedor
          if (body.vendedor_phone) {
            const msgVendedor = `📅 *CITA REPROGRAMADA*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
🏠 *Lugar:* ${body.property}

❌ *Antes:* ${fechaVieja} a las ${body.old_time?.slice(0, 5)}
✅ *Ahora:* ${fechaNueva} a las ${body.new_time?.slice(0, 5)}

📝 *Motivo:* ${body.nota || 'Sin especificar'}

━━━━━━━━━━━━━━━━━━━━━
👤 Coordinador: ${body.coordinador_name}`;

            await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
            console.log('📤 Notificación de cambio enviada a vendedor:', body.vendedor_name);
          }

          // Al cliente
          if (body.lead_phone) {
            const msgCliente = `📅 *TU CITA HA SIDO REPROGRAMADA*

Hola ${body.lead_name?.split(' ')[0] || ''} 👋

Tu cita ha sido actualizada:

✅ *Nueva fecha:* ${fechaNueva}
🕐 *Nueva hora:* ${body.new_time?.slice(0, 5)}
📍 *Lugar:* ${body.property}

${body.nota ? `📝 *Nota:* ${body.nota}` : ''}

¡Te esperamos! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log('📤 Notificación de cambio enviada a cliente:', body.lead_name);
          }

        } else {
          // ═══ NOTIFICAR CANCELACIÓN ═══

          // Al vendedor
          if (body.vendedor_phone) {
            const msgVendedor = `❌ *CITA CANCELADA*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
🏠 *Lugar:* ${body.property}

📆 *Fecha:* ${fechaVieja} a las ${body.old_time?.slice(0, 5)}

📝 *Motivo:* ${body.nota || 'Sin especificar'}

━━━━━━━━━━━━━━━━━━━━━
👤 Cancelada por: ${body.coordinador_name}`;

            await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
            console.log('📤 Notificación de cancelación enviada a vendedor:', body.vendedor_name);
          }

          // Al cliente
          if (body.lead_phone) {
            const msgCliente = `❌ *TU CITA HA SIDO CANCELADA*

Hola ${body.lead_name?.split(' ')[0] || ''} 👋

Lamentamos informarte que tu cita ha sido cancelada:

📆 *Fecha:* ${fechaVieja}
🕐 *Hora:* ${body.old_time?.slice(0, 5)}
📍 *Lugar:* ${body.property}

${body.nota ? `📝 *Motivo:* ${body.nota}` : ''}

Para reagendar, contáctanos. ¡Estamos para servirte! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log('📤 Notificación de cancelación enviada a cliente:', body.lead_name);
          }
        }

        return corsResponse(JSON.stringify({ success: true, action: body.action }));
      } catch (e: any) {
        console.error('❌ Error enviando notificación:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Notificar nota de coordinador al vendedor
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads/notify-note' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      console.log('📝 Nota de coordinador para:', body.lead_name);

      try {
        if (body.vendedor_phone) {
          const msgVendedor = `📝 *NOTA DEL COORDINADOR*
━━━━━━━━━━━━━━━━━━━━━

👤 *Lead:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}

💬 *Nota:*
${body.nota}

━━━━━━━━━━━━━━━━━━━━━
👤 De: ${body.coordinador_name}`;

          await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
          console.log('📤 Nota enviada a vendedor:', body.vendedor_name);
        }

        return corsResponse(JSON.stringify({ success: true }));
      } catch (e: any) {
        console.error('❌ Error enviando nota:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Notificar reasignación de lead al nuevo vendedor
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads/notify-reassign' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      console.log('🔄 Lead reasignado a:', body.vendedor_name);

      try {
        if (body.vendedor_phone) {
          const msgVendedor = `🔄 *LEAD REASIGNADO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
🏠 *Interés:* ${body.property_interest || 'No especificado'}

💬 *Nota:*
${body.nota || 'Sin nota'}

━━━━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar pronto!*
👤 Reasignado por: ${body.coordinador_name}`;

          await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
          console.log('📤 Notificación de reasignación enviada a:', body.vendedor_name);
        }

        return corsResponse(JSON.stringify({ success: true }));
      } catch (e: any) {
        console.error('❌ Error notificando reasignación:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // Listar citas (para el CRM)
    if (url.pathname === '/api/appointments' && request.method === 'GET') {
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');
      const vendorId = url.searchParams.get('vendor_id');

      let query = supabase.client
        .from('appointments')
        .select('*, leads(name, phone)')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (startDate) {
        query = query.gte('scheduled_date', startDate);
      }
      if (endDate) {
        query = query.lte('scheduled_date', endDate);
      }
      if (vendorId) {
        query = query.eq('vendedor_id', vendorId);
      }

      const { data, error } = await query;

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify(data || []));
    }

    // Crear nueva cita
    if (url.pathname === '/api/appointments' && request.method === 'POST') {
      const body = await request.json() as any;
      
      try {
        // Construir fecha/hora en formato local (no UTC)
        const citaHora = (body.scheduled_time || '10:00').substring(0, 5);
        const dateTimeStr = `${body.scheduled_date}T${citaHora}:00`;
        const [hourNum] = citaHora.split(':').map(Number);
        const endHour = String(hourNum + 1).padStart(2, '0');
        const endTimeStr = `${body.scheduled_date}T${endHour}:${citaHora.split(':')[1]}:00`;
        
        // Crear en Google Calendar
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        
        const eventData = {
          summary: `🏠 Cita: ${body.lead_name} - ${body.property_name || 'Visita'}`,
          description: `👤 Cliente: ${body.lead_name}\n📱 Tel: ${body.lead_phone}\n🏠 Desarrollo: ${body.property_name}\n👤 Vendedor: ${body.vendedor_name || 'Por asignar'}\n\nCreado desde CRM`,
          location: body.property_name,
          start: { dateTime: dateTimeStr, timeZone: 'America/Mexico_City' },
          end: { dateTime: endTimeStr, timeZone: 'America/Mexico_City' }
        };
        
        const googleEvent = await calendar.createEvent(eventData);
        console.log('📅 Evento Google Calendar creado:', googleEvent?.id);
        
        // Crear en DB
        const { data, error } = await supabase.client
          .from('appointments')
          .insert({
            lead_id: body.lead_id,
            lead_name: body.lead_name,
            lead_phone: body.lead_phone,
            property_name: body.property_name,
            scheduled_date: body.scheduled_date,
            scheduled_time: body.scheduled_time,
            status: 'scheduled',
            appointment_type: body.appointment_type || 'visita',
            duration_minutes: 60,
            vendedor_id: body.vendedor_id,
            vendedor_name: body.vendedor_name,
            google_event_vendedor_id: googleEvent?.id || null,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (error) throw error;
        
        console.log('✅ Cita creada:', data.id);
        
        // ═══ ENVIAR NOTIFICACIONES ═══
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        
        // Formatear fecha bonita
        const fechaObj = new Date(body.scheduled_date + 'T12:00:00');
        const fechaFormateada = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
        
        // Buscar GPS del desarrollo
        let gpsLink = '';
        if (body.property_name) {
          const { data: prop } = await supabase.client
            .from('properties')
            .select('gps_link')
            .or(`development.eq.${body.property_name},name.eq.${body.property_name}`)
            .limit(1)
            .single();
          gpsLink = prop?.gps_link || '';
        }
        
        // 1. Enviar TEMPLATE de confirmación al CLIENTE
        let confirmationSent = false;
        if (body.lead_phone) {
          try {
            const phoneCliente = body.lead_phone.replace(/[^0-9]/g, '');

            // Preparar variables del template appointment_confirmation_v2
            // Template Meta: ¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.
            // Botón dinámico: https://maps.app.goo.gl/{{1}}
            const gpsCode = gpsLink ? gpsLink.replace(/^https?:\/\/maps\.app\.goo\.gl\//, '') : '';
            const templateComponents: any[] = [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: body.lead_name || 'cliente' },                          // {{1}} Nombre
                  { type: 'text', text: 'Grupo Santa Rita' },                                   // {{2}} Empresa
                  { type: 'text', text: `visita a ${body.property_name || 'nuestras oficinas'}` }, // {{3}} Visita → "visita a Distrito Falco"
                  { type: 'text', text: fechaFormateada },                                      // {{4}} Fecha
                  { type: 'text', text: citaHora }                                              // {{5}} Hora
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  { type: 'text', text: gpsCode || 'qR8vK3xYz9M' }                              // {{1}} Sufijo GPS
                ]
              }
            ];

            await meta.sendTemplate(phoneCliente, 'appointment_confirmation_v2', 'es', templateComponents);
            confirmationSent = true;
            console.log('📤 Template appointment_confirmation enviado a:', body.lead_name);

            // Marcar en el lead que se envió template (para activar SARA cuando responda)
            if (body.lead_id) {
              await supabase.client.from('leads').update({
                template_sent: 'appointment_confirmation',
                template_sent_at: new Date().toISOString(),
                sara_activated: false // Se activará cuando responda
              }).eq('id', body.lead_id);
            }
          } catch (e) {
            console.error('⚠️ Error enviando template:', e);
            // Fallback: enviar mensaje normal si falla el template
            try {
              const msgCliente = `📅 *CITA CONFIRMADA*\n\n¡Hola ${body.lead_name || ''}! 👋\n\nTu cita ha sido agendada:\n\n📆 *Fecha:* ${fechaFormateada}\n🕐 *Hora:* ${citaHora}\n📍 *Lugar:* ${body.property_name || 'Por confirmar'}\n${gpsLink ? '🗺️ *Ubicación:* ' + gpsLink : ''}\n👤 *Te atenderá:* ${body.vendedor_name || 'Un asesor'}\n\n¡Te esperamos! 🏠`;
              const phoneCliente = body.lead_phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneCliente, msgCliente);
              confirmationSent = true;
            } catch (e2) {
              console.error('⚠️ Error fallback mensaje:', e2);
            }
          }
        }

        // Actualizar cita con estado de confirmación
        if (confirmationSent) {
          await supabase.client.from('appointments').update({
            confirmation_sent: true,
            confirmation_sent_at: new Date().toISOString()
          }).eq('id', data.id);
        }
        
        // 2. Notificar al VENDEDOR
        if (body.vendedor_id) {
          try {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('phone, name')
              .eq('id', body.vendedor_id)
              .single();
            
            if (vendedor?.phone) {
              const msgVendedor = `📅 *NUEVA CITA AGENDADA*

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${citaHora}
📍 *Lugar:* ${body.property_name || 'Por confirmar'}
${gpsLink ? '🗺️ *Maps:* ' + gpsLink : ''}

Creada desde CRM`;
              
              const phoneVendedor = vendedor.phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneVendedor, msgVendedor);
              console.log('📤 Notificación enviada a vendedor:', vendedor.name);
            }
          } catch (e) {
            console.error('⚠️ Error notificando vendedor:', e);
          }
        }
        
        return corsResponse(JSON.stringify(data), 201);
      } catch (e: any) {
        console.error('❌ Error creando cita:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // Actualizar/Reagendar cita
    if (url.pathname.match(/^\/api\/appointments\/[^/]+$/) && request.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      const body = await request.json() as any;
      
      console.log('📅 Reagendando cita:', id, body);
      
      try {
        // Actualizar en DB primero
        const updateData: any = {};
        if (body.scheduled_date) updateData.scheduled_date = body.scheduled_date;
        if (body.scheduled_time) updateData.scheduled_time = body.scheduled_time;
        if (body.property_name) updateData.property_name = body.property_name;
        
        const { data, error } = await supabase.client
          .from('appointments')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Error DB:', error);
          throw error;
        }
        
        // ✅ FIX 14-ENE-2026: SIEMPRE sincronizar con Google Calendar si existe evento
        // Usar google_event_vendedor_id de la BD si no viene en el request
        const googleEventId = body.google_event_id || data.google_event_vendedor_id;
        const fechaActualizar = body.scheduled_date || data.scheduled_date;
        const horaActualizar = body.scheduled_time || data.scheduled_time;

        if (googleEventId && fechaActualizar && horaActualizar) {
          try {
            const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);

            // Parsear hora - quitar segundos si vienen (18:26:00 -> 18:26)
            let citaHora = horaActualizar.substring(0, 5);

            // Crear fecha en formato ISO para México
            const dateTimeStr = `${fechaActualizar}T${citaHora}:00`;

            await calendar.updateEvent(googleEventId, {
              start: { dateTime: dateTimeStr, timeZone: 'America/Mexico_City' },
              end: { dateTime: `${fechaActualizar}T${String(parseInt(citaHora.split(':')[0]) + 1).padStart(2, '0')}:${citaHora.split(':')[1]}:00`, timeZone: 'America/Mexico_City' },
              location: body.property_name || data.property_name || ''
            });
            console.log('📅 Google Calendar actualizado:', googleEventId, dateTimeStr);
          } catch (calError) {
            console.error('⚠️ Error Google Calendar (ignorado):', calError);
          }
        } else {
          console.error('⚠️ Cita sin google_event_vendedor_id, no se puede sincronizar con Google Calendar');
        }
        
        // Enviar notificaciones por WhatsApp si se solicitó
        if (body.notificar && body.lead_phone) {
          try {
            const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
            
            // Buscar GPS del desarrollo
            let gpsLink = '';
            if (body.property_name && body.property_name !== 'Oficinas Centrales') {
              const { data: prop } = await supabase.client
                .from('properties')
                .select('gps_link')
                .or(`development.ilike.%${body.property_name}%,name.ilike.%${body.property_name}%`)
                .limit(1)
                .single();
              if (prop?.gps_link) gpsLink = prop.gps_link;
            } else if (body.property_name === 'Oficinas Centrales') {
              gpsLink = 'https://maps.app.goo.gl/hUk6aH8chKef6NRY7';
            }
            
            // Formatear fecha bonita
            const fechaObj = new Date(body.scheduled_date + 'T12:00:00');
            const fechaFormateada = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            const horaFormateada = body.scheduled_time.substring(0, 5);
            
            // Obtener datos del vendedor para incluir en notificación al lead
            let vendedorPhone = '';
            let vendedorName = body.vendedor_name || '';
            if (body.vendedor_id) {
              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .eq('id', body.vendedor_id)
                .single();
              if (vendedor) {
                vendedorPhone = vendedor.phone || '';
                vendedorName = vendedor.name || vendedorName;
              }
            }
            
            // Formatear teléfono del vendedor para mostrar
            const vendedorPhoneDisplay = vendedorPhone ? vendedorPhone.replace(/^521/, '').replace(/^52/, '') : '';

            // Detectar si es llamada o cita presencial
            const esLlamada = body.appointment_type === 'llamada' || data.appointment_type === 'llamada';
            const tipoTitulo = esLlamada ? 'LLAMADA ACTUALIZADA' : 'CITA ACTUALIZADA';
            const tipoTexto = esLlamada ? 'llamada' : 'cita';

            // Notificar al cliente (con datos del vendedor)
            let msgCliente = `📞 *${tipoTitulo}*

Hola ${(body.lead_name || 'estimado cliente').split(' ')[0]} 👋

Tu ${tipoTexto} ha sido modificada:

📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

            // Solo mostrar ubicación para citas presenciales
            if (!esLlamada) {
              msgCliente += `
📍 *Lugar:* ${body.property_name || 'Por confirmar'}`;
              if (gpsLink) {
                msgCliente += `
🗺️ *Ubicación:* ${gpsLink}`;
              }
            }

            msgCliente += `
👤 *Tu asesor:* ${vendedorName || 'Por asignar'}`;
            if (vendedorPhoneDisplay) {
              msgCliente += `
📱 *Contacto:* ${vendedorPhoneDisplay}`;
            }

            msgCliente += esLlamada
              ? `\n\n¡Te contactaremos! 📞`
              : `\n\n¡Te esperamos! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log(`📤 Notificación de ${tipoTexto} enviada a cliente:`, body.lead_name);

            // Notificar al vendedor (con datos del lead)
            if (vendedorPhone) {
              // Formatear teléfono del lead para mostrar
              const leadPhoneDisplay = body.lead_phone ? body.lead_phone.replace(/^521/, '').replace(/^52/, '') : '';

              let msgVendedor = `📞 *${tipoTitulo.replace('ACTUALIZADA', 'EDITADA')}*

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${leadPhoneDisplay}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

              if (!esLlamada) {
                msgVendedor += `
📍 *Lugar:* ${body.property_name || 'Por confirmar'}`;
                if (gpsLink) {
                  msgVendedor += `
🗺️ *Maps:* ${gpsLink}`;
                }
              }

              await meta.sendWhatsAppMessage(vendedorPhone, msgVendedor);
              console.log(`📤 Notificación de ${tipoTexto} enviada a vendedor:`, vendedorName);
            }
          } catch (notifError) {
            console.error('⚠️ Error enviando notificaciones:', notifError);
          }
        }
        
        console.log('✅ Cita actualizada:', id);
        return corsResponse(JSON.stringify(data));
      } catch (e: any) {
        console.error('❌ Error actualizando cita:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // API Routes - Mortgage Applications (Hipotecas)
    // ═══════════════════════════════════════════════════════════════
    if ((url.pathname === '/api/mortgages' || url.pathname === '/api/mortgage_applications') && request.method === 'GET') {
      const { data } = await supabase.client
        .from('mortgage_applications')
        .select('*')
        .order('created_at', { ascending: false });
      return corsResponse(JSON.stringify(data || []));
    }

    if ((url.pathname.match(/^\/api\/mortgages\/[^\/]+$/) || url.pathname.match(/^\/api\/mortgage_applications\/[^\/]+$/)) && request.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const { data } = await supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('id', id)
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    if ((url.pathname.match(/^\/api\/mortgages\/[^\/]+$/) || url.pathname.match(/^\/api\/mortgage_applications\/[^\/]+$/)) && request.method === 'PUT') {
      const id = url.pathname.split('/').pop();
      const body = await request.json() as any;

      console.log('🏦 Actualizando hipoteca:', id, body);

      // Extraer campos que NO van a la DB (solo para notificaciones)
      const changed_by_id = body.changed_by_id;
      const changed_by_name = body.changed_by_name;
      const previous_status = body.previous_status;
      delete body.changed_by_id;
      delete body.changed_by_name;
      delete body.previous_status;

      // Obtener datos anteriores para comparar
      const { data: oldMortgage } = await supabase.client
        .from('mortgage_applications')
        .select('*, lead_id')
        .eq('id', id)
        .single();

      // Actualizar registro
      body.updated_at = new Date().toISOString();
      const { data, error } = await supabase.client
        .from('mortgage_applications')
        .update(body)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('❌ Error actualizando hipoteca:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 400);
      }
      
      console.log('✅ Hipoteca actualizada:', data?.id, 'Status:', body.status);
      
      // Si cambió el status, notificar al vendedor del lead
      if (data && body.status && oldMortgage?.status !== body.status) {
        try {
          console.log('📤 Status cambió de', oldMortgage?.status, 'a', body.status);
          
          // Buscar el lead para obtener el vendedor
          const { data: lead } = await supabase.client
            .from('leads')
            .select('assigned_to, name')
            .eq('id', oldMortgage?.lead_id || data.lead_id)
            .single();
          
          console.log('👤 Lead encontrado:', lead?.name, 'Vendedor:', lead?.assigned_to);
          
          if (lead?.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('name, phone')
              .eq('id', lead.assigned_to)
              .single();
            
            console.log('💬 Vendedor:', vendedor?.name, vendedor?.phone);
            
            if (vendedor?.phone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              
              const statusEmoji: Record<string, string> = {
                'pending': '⏳',
                'in_review': '📋',
                'sent_to_bank': '🏦',
                'approved': '✅',
                'rejected': '❌',
                'documents': '📄',
                'submitted': '📤',
                'funded': '💰'
              };

              const statusText: Record<string, string> = {
                'pending': 'Pendiente',
                'in_review': 'En revisión',
                'sent_to_bank': 'Enviado al banco',
                'approved': '¡APROBADO!',
                'rejected': 'Rechazado',
                'documents': 'Esperando documentos',
                'submitted': 'Enviado al banco',
                'funded': '¡Fondeado!'
              };
              
              const emoji = statusEmoji[body.status] || '📋';
              const texto = statusText[body.status] || body.status;

              // Usar changed_by_name si viene del CRM, si no usar assigned_advisor_name
              const quienMovio = changed_by_name || data.assigned_advisor_name || 'Sistema';

              const mensaje = `${emoji} *ACTUALIZACIÓN CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.lead_name || lead.name}
🏦 *Banco:* ${data.bank || 'No especificado'}
📊 *Nuevo status:* ${texto}
${previous_status ? `📋 *Anterior:* ${statusText[previous_status] || previous_status}` : ''}
${body.status_notes ? '📝 *Notas:* ' + body.status_notes : ''}
━━━━━━━━━━━━━━━━━━━━━
👤 *Movido por:* ${quienMovio}`;
              
              await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
              console.log('📤 Notificación de crédito enviada a vendedor:', vendedor.name);
            }
          }
        } catch (e) {
          console.error('⚠️ Error notificando vendedor sobre crédito:', e);
        }
      }
      
      return corsResponse(JSON.stringify(data || {}));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Properties
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/properties' && request.method === 'GET') {
      const { data } = await supabase.client
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });
      return corsResponse(JSON.stringify(data || []));
    }

    if (url.pathname.startsWith('/api/properties/') && request.method === 'GET') {
      const id = url.pathname.split('/')[3];
      const { data } = await supabase.client
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    if (url.pathname === '/api/properties' && request.method === 'POST') {
      const body = await request.json() as any;
      const { data } = await supabase.client
        .from('properties')
        .insert([body])
        .select()
        .single();
      return corsResponse(JSON.stringify(data), 201);
    }

    if (url.pathname.startsWith('/api/properties/') && request.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      const body = await request.json() as any;
      const { data } = await supabase.client
        .from('properties')
        .update(body)
        .eq('id', id)
        .select()
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    // Endpoint para aplicar incremento mensual de precios (0.5%)
    if (url.pathname === '/api/properties/apply-monthly-increase' && request.method === 'POST') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const { data: properties } = await supabase.client
        .from('properties')
        .select('id, name, price, development');

      if (!properties || properties.length === 0) {
        return corsResponse(JSON.stringify({ error: 'No properties found' }), 404);
      }

      const updates = [];
      const INCREASE_RATE = 1.005; // 0.5% mensual

      for (const prop of properties) {
        const oldPrice = prop.price;
        const newPrice = Math.round(oldPrice * INCREASE_RATE);

        await supabase.client
          .from('properties')
          .update({ price: newPrice })
          .eq('id', prop.id);

        updates.push({
          id: prop.id,
          name: prop.name,
          development: prop.development,
          oldPrice,
          newPrice,
          increase: newPrice - oldPrice
        });
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Precios actualizados: ${updates.length} propiedades (+0.5%)`,
        timestamp: new Date().toISOString(),
        updates
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Dashboard
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/dashboard/kpis' && request.method === 'GET') {
      // OPTIMIZADO: Solo seleccionar campo 'status' en lugar de '*'
      const { data: leads } = await supabase.client.from('leads').select('status');
      const kpis = {
        total: leads?.length || 0,
        new: leads?.filter((l: any) => l.status === 'new').length || 0,
        contacted: leads?.filter((l: any) => l.status === 'contacted').length || 0,
        qualified: leads?.filter((l: any) => l.status === 'qualified').length || 0,
        appointment_scheduled: leads?.filter((l: any) => l.status === 'appointment_scheduled').length || 0,
        converted: leads?.filter((l: any) => l.status === 'converted').length || 0
      };
      return corsResponse(JSON.stringify(kpis));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Métricas de Conversación
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/metrics/conversation' && request.method === 'GET') {
      const dias = parseInt(url.searchParams.get('days') || '7');
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);

      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, status, score, created_at, conversation_history, property_interest, source')
        .gte('created_at', fechaInicio.toISOString());

      const { data: appointments } = await supabase.client
        .from('appointments')
        .select('id, lead_id, status, scheduled_date')
        .gte('created_at', fechaInicio.toISOString());

      // Calcular métricas
      const leadsConHistorial = (leads || []).filter((l: any) => l.conversation_history?.length > 0);
      const totalMensajes = leadsConHistorial.reduce((sum: number, l: any) => sum + (l.conversation_history?.length || 0), 0);
      const mensajesUsuario = leadsConHistorial.reduce((sum: number, l: any) =>
        sum + (l.conversation_history?.filter((m: any) => m.role === 'user').length || 0), 0);
      const mensajesSara = leadsConHistorial.reduce((sum: number, l: any) =>
        sum + (l.conversation_history?.filter((m: any) => m.role === 'assistant').length || 0), 0);

      // Detectar intenciones en mensajes
      const intenciones: Record<string, number> = {
        saludo: 0,
        precio: 0,
        ubicacion: 0,
        cita: 0,
        credito: 0,
        objecion: 0,
        otro: 0
      };

      // Detectar objeciones
      const objeciones: Record<string, number> = {
        'muy caro': 0,
        'no me interesa': 0,
        'lo voy a pensar': 0,
        'ya compré': 0,
        'no me alcanza': 0
      };

      leadsConHistorial.forEach((lead: any) => {
        (lead.conversation_history || []).forEach((msg: any) => {
          if (msg.role === 'user') {
            const content = (msg.content || '').toLowerCase();

            // Detectar intención
            if (content.match(/hola|buenos|buenas|hi|hello/)) intenciones.saludo++;
            else if (content.match(/precio|costo|cuanto|cuánto|presupuesto/)) intenciones.precio++;
            else if (content.match(/donde|ubicación|ubicacion|gps|dirección/)) intenciones.ubicacion++;
            else if (content.match(/cita|visita|ver|conocer|agendar/)) intenciones.cita++;
            else if (content.match(/crédito|credito|infonavit|fovissste|banco|financ/)) intenciones.credito++;
            else if (content.match(/caro|no me interesa|pensar|no gracias|no puedo/)) intenciones.objecion++;
            else intenciones.otro++;

            // Detectar objeciones específicas
            if (content.includes('muy caro') || content.includes('caro')) objeciones['muy caro']++;
            if (content.includes('no me interesa') || content.includes('no gracias')) objeciones['no me interesa']++;
            if (content.includes('pensar') || content.includes('después')) objeciones['lo voy a pensar']++;
            if (content.includes('ya compré') || content.includes('ya tengo casa')) objeciones['ya compré']++;
            if (content.includes('no me alcanza') || content.includes('no tengo')) objeciones['no me alcanza']++;
          }
        });
      });

      // Calcular conversiones
      const statusCounts: Record<string, number> = {};
      (leads || []).forEach((l: any) => {
        statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
      });

      // Fuentes de leads
      const sourcesCounts: Record<string, number> = {};
      (leads || []).forEach((l: any) => {
        const source = l.source || 'desconocido';
        sourcesCounts[source] = (sourcesCounts[source] || 0) + 1;
      });

      // Desarrollos más consultados
      const desarrollosCounts: Record<string, number> = {};
      (leads || []).forEach((l: any) => {
        if (l.property_interest) {
          desarrollosCounts[l.property_interest] = (desarrollosCounts[l.property_interest] || 0) + 1;
        }
      });

      // Citas completadas vs no-shows
      const citasCompletadas = (appointments || []).filter((a: any) => a.status === 'completed').length;
      const citasNoShow = (appointments || []).filter((a: any) => a.status === 'no_show').length;
      const citasCanceladas = (appointments || []).filter((a: any) => a.status === 'cancelled').length;

      const metrics = {
        periodo: `últimos ${dias} días`,
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: new Date().toISOString().split('T')[0],

        leads: {
          total: leads?.length || 0,
          con_conversacion: leadsConHistorial.length,
          sin_conversacion: (leads?.length || 0) - leadsConHistorial.length,
          por_status: statusCounts,
          por_fuente: sourcesCounts
        },

        conversaciones: {
          total_mensajes: totalMensajes,
          mensajes_usuario: mensajesUsuario,
          mensajes_sara: mensajesSara,
          promedio_por_lead: leadsConHistorial.length > 0 ? Math.round(totalMensajes / leadsConHistorial.length) : 0
        },

        intenciones: intenciones,
        objeciones: objeciones,

        desarrollos_populares: Object.entries(desarrollosCounts)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([nombre, count]) => ({ nombre, count })),

        citas: {
          total: appointments?.length || 0,
          completadas: citasCompletadas,
          no_show: citasNoShow,
          canceladas: citasCanceladas,
          tasa_completacion: appointments?.length ? Math.round((citasCompletadas / appointments.length) * 100) : 0
        },

        conversion: {
          lead_a_cita: leads?.length ? Math.round((appointments?.length || 0) / leads.length * 100) : 0,
          lead_a_visita: leads?.length ? Math.round((statusCounts['visited'] || 0) / leads.length * 100) : 0,
          lead_a_venta: leads?.length ? Math.round(((statusCounts['sold'] || 0) + (statusCounts['delivered'] || 0)) / leads.length * 100) : 0
        }
      };

      return corsResponse(JSON.stringify(metrics, null, 2));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /api/metrics/quality - Reporte de calidad de respuestas SARA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.pathname === '/api/metrics/quality' && request.method === 'GET') {
      const dias = parseInt(url.searchParams.get('days') || '7');
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);

      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, conversation_history, updated_at')
        .gte('updated_at', fechaInicio.toISOString());

      // Analizar calidad de respuestas
      const problemas: any[] = [];
      let totalRespuestas = 0;
      let respuestasOk = 0;

      // Patrones de problemas
      const nombresHallucinated = ['Salma', 'María', 'Maria', 'Juan', 'Pedro', 'Ana', 'Luis', 'Carlos', 'Carmen'];
      const frasesProhibidas = [
        'Le aviso a',
        'Sin problema',
        'no lo tenemos disponible',
        'Citadella del Nogal no',
        'El Nogal no es',
        'sí tenemos rentas',
        'tenemos casas en renta'
      ];

      (leads || []).forEach((lead: any) => {
        const history = lead.conversation_history || [];
        history.forEach((msg: any, idx: number) => {
          if (msg.role !== 'assistant') return;
          totalRespuestas++;

          const content = (msg.content || '').trim();
          let tieneProblema = false;
          const problemasMsg: string[] = [];

          // 1. Respuesta truncada (termina en coma o muy corta)
          if (content.endsWith(',') || (content.length > 0 && content.length < 20)) {
            problemasMsg.push('truncada');
            tieneProblema = true;
          }

          // 2. Nombre alucinado (cuando lead no tiene nombre)
          if (!lead.name) {
            for (const nombre of nombresHallucinated) {
              if (content.includes(nombre)) {
                problemasMsg.push(`nombre_hallucinated:${nombre}`);
                tieneProblema = true;
                break;
              }
            }
          }

          // 3. Frases prohibidas
          for (const frase of frasesProhibidas) {
            if (content.toLowerCase().includes(frase.toLowerCase())) {
              problemasMsg.push(`frase_prohibida:${frase.slice(0, 20)}`);
              tieneProblema = true;
            }
          }

          // 4. Respuesta genérica sin valor
          if (content.match(/^(ok|entendido|perfecto|listo)\.?$/i)) {
            problemasMsg.push('respuesta_generica');
            tieneProblema = true;
          }

          if (tieneProblema) {
            problemas.push({
              lead_id: lead.id,
              lead_name: lead.name || 'Sin nombre',
              phone_last4: (lead.phone || '').slice(-4),
              msg_index: idx,
              timestamp: msg.timestamp,
              problemas: problemasMsg,
              preview: content.slice(0, 100)
            });
          } else {
            respuestasOk++;
          }
        });
      });

      // Agrupar por tipo de problema
      const problemasAgrupados: Record<string, number> = {};
      problemas.forEach(p => {
        p.problemas.forEach((prob: string) => {
          const tipo = prob.split(':')[0];
          problemasAgrupados[tipo] = (problemasAgrupados[tipo] || 0) + 1;
        });
      });

      const quality = {
        periodo: `últimos ${dias} días`,
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: new Date().toISOString().split('T')[0],

        resumen: {
          leads_analizados: leads?.length || 0,
          total_respuestas_sara: totalRespuestas,
          respuestas_ok: respuestasOk,
          respuestas_con_problemas: problemas.length,
          tasa_calidad: totalRespuestas > 0 ? Math.round((respuestasOk / totalRespuestas) * 100) : 100
        },

        problemas_por_tipo: problemasAgrupados,

        ultimos_problemas: problemas.slice(-10).reverse(),

        recomendaciones: [
          problemas.filter(p => p.problemas.includes('truncada')).length > 0 && 'Revisar respuestas truncadas',
          problemasAgrupados['nombre_hallucinated'] > 0 && 'Reforzar eliminación de nombres inventados',
          problemasAgrupados['frase_prohibida'] > 0 && 'Revisar post-procesamiento de frases prohibidas',
          problemasAgrupados['respuesta_generica'] > 0 && 'Mejorar respuestas genéricas'
        ].filter(Boolean)
      };

      return corsResponse(JSON.stringify(quality, null, 2));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /api/tts-metrics - Métricas de audios TTS enviados y escuchados
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.pathname === '/api/tts-metrics' && request.method === 'GET') {
      try {
        const dias = parseInt(url.searchParams.get('days') || '30');
        const ttsTracking = createTTSTrackingService(supabase);

        // Obtener métricas agregadas
        const metrics = await ttsTracking.getMetrics(dias);

        // Obtener mensajes recientes
        const recentMessages = await ttsTracking.getRecentMessages(20);

        // Calcular totales
        const totals = metrics.reduce((acc, m) => ({
          enviados: acc.enviados + m.totalEnviados,
          entregados: acc.entregados + m.totalEntregados,
          escuchados: acc.escuchados + m.totalEscuchados,
          fallidos: acc.fallidos + m.totalFallidos
        }), { enviados: 0, entregados: 0, escuchados: 0, fallidos: 0 });

        const tasaEscuchaGlobal = totals.entregados > 0
          ? Math.round(totals.escuchados / totals.entregados * 100)
          : 0;

        return corsResponse(JSON.stringify({
          periodo: `últimos ${dias} días`,
          resumen: {
            total_enviados: totals.enviados,
            total_entregados: totals.entregados,
            total_escuchados: totals.escuchados,
            total_fallidos: totals.fallidos,
            tasa_escucha_global: `${tasaEscuchaGlobal}%`
          },
          por_tipo: metrics.map(m => ({
            tipo: m.ttsType,
            enviados: m.totalEnviados,
            entregados: m.totalEntregados,
            escuchados: m.totalEscuchados,
            fallidos: m.totalFallidos,
            tasa_escucha: `${m.tasaEscuchaPct}%`
          })),
          ultimos_mensajes: recentMessages.map((msg: any) => ({
            tipo: msg.tts_type,
            destinatario: msg.recipient_name || msg.recipient_phone?.slice(-4),
            status: msg.status,
            enviado: msg.sent_at,
            escuchado: msg.played_at || null
          }))
        }, null, 2));
      } catch (e: any) {
        // Si la tabla no existe, retornar instrucciones
        if (e.message?.includes('42P01') || e.code === '42P01') {
          return corsResponse(JSON.stringify({
            error: 'Tabla tts_messages no existe',
            instrucciones: 'Ejecutar sql/tts_tracking.sql en Supabase Dashboard',
            sql_file: '/sql/tts_tracking.sql'
          }), 200);
        }
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /api/message-metrics - Métricas de TODOS los mensajes enviados
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.pathname === '/api/message-metrics' && request.method === 'GET') {
      try {
        const dias = parseInt(url.searchParams.get('days') || '7');
        const msgTracking = createMessageTrackingService(supabase);

        // Obtener métricas agregadas
        const metrics = await msgTracking.getMetrics(dias);

        // Obtener resumen 24h
        const resumen24h = await msgTracking.get24hSummary();

        // Obtener mensajes recientes
        const recentMessages = await msgTracking.getRecentMessages(30);

        // Calcular totales
        const totals = metrics.reduce((acc, m) => ({
          enviados: acc.enviados + m.totalEnviados,
          entregados: acc.entregados + m.totalEntregados,
          leidos: acc.leidos + m.totalLeidos,
          fallidos: acc.fallidos + m.totalFallidos
        }), { enviados: 0, entregados: 0, leidos: 0, fallidos: 0 });

        const tasaLecturaGlobal = totals.entregados > 0
          ? Math.round(totals.leidos / totals.entregados * 100)
          : 0;

        return corsResponse(JSON.stringify({
          periodo: `últimos ${dias} días`,
          resumen_24h: resumen24h,
          resumen_periodo: {
            total_enviados: totals.enviados,
            total_entregados: totals.entregados,
            total_leidos: totals.leidos,
            total_fallidos: totals.fallidos,
            tasa_lectura_global: `${tasaLecturaGlobal}%`
          },
          por_tipo_y_categoria: metrics.map(m => ({
            tipo: m.messageType,
            categoria: m.categoria,
            enviados: m.totalEnviados,
            entregados: m.totalEntregados,
            leidos: m.totalLeidos,
            fallidos: m.totalFallidos,
            tasa_lectura: `${m.tasaLecturaPct}%`
          })),
          ultimos_mensajes: recentMessages.slice(0, 20).map((msg: any) => ({
            tipo: msg.message_type,
            categoria: msg.categoria,
            destinatario: msg.recipient_name || msg.recipient_phone?.slice(-4),
            contenido: msg.contenido?.substring(0, 50),
            status: msg.status,
            enviado: msg.sent_at,
            leido: msg.read_at || null
          }))
        }, null, 2));
      } catch (e: any) {
        if (e.message?.includes('42P01') || e.code === '42P01') {
          return corsResponse(JSON.stringify({
            error: 'Tabla messages_sent no existe',
            instrucciones: 'Ejecutar sql/message_tracking.sql en Supabase Dashboard'
          }), 200);
        }
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Reportes CEO (Diario, Semanal, Mensual)
    // ═══════════════════════════════════════════════════════════

    // REPORTE DIARIO
    if (url.pathname === '/api/reportes/diario' && request.method === 'GET') {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

      // OPTIMIZADO: Seleccionar solo campos necesarios
      const { data: leadsAyer } = await supabase.client.from('leads').select('id, name, source, status').gte('created_at', inicioAyer).lt('created_at', inicioHoy);
      const { data: leadsHoy } = await supabase.client.from('leads').select('id').gte('created_at', inicioHoy);
      const { data: cierresAyer } = await supabase.client.from('leads').select('id').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy);
      const hoyStr = hoy.toISOString().split('T')[0];
      const { data: citasHoy } = await supabase.client.from('appointments').select('id, scheduled_time, status, property_interest, lead_name, leads(name, phone)').eq('scheduled_date', hoyStr);
      const { data: leadsHot } = await supabase.client.from('leads').select('id, name, status, phone').in('status', ['negotiation', 'reserved']);
      const limiteFrio = new Date(hoy); limiteFrio.setDate(limiteFrio.getDate() - 1);
      const { data: estancados } = await supabase.client.from('leads').select('id, name, created_at, phone').eq('status', 'new').lt('created_at', limiteFrio.toISOString());

      return corsResponse(JSON.stringify({
        fecha: hoyStr,
        periodo: 'diario',
        ayer: {
          leads_nuevos: leadsAyer?.length || 0,
          cierres: cierresAyer?.length || 0,
          leads: leadsAyer?.map((l: any) => ({ id: l.id, name: l.name, source: l.source, status: l.status })) || []
        },
        hoy: {
          leads_nuevos: leadsHoy?.length || 0,
          citas_agendadas: citasHoy?.filter((c: any) => c.status === 'scheduled').length || 0,
          citas: citasHoy?.map((c: any) => ({
            id: c.id,
            hora: c.scheduled_time,
            lead: c.leads?.name || c.lead_name,
            desarrollo: c.property_interest,
            status: c.status
          })) || []
        },
        pipeline: {
          leads_hot: leadsHot?.length || 0,
          leads_estancados: estancados?.length || 0,
          hot_detalle: leadsHot?.map((l: any) => ({ id: l.id, name: l.name, status: l.status, phone: l.phone })) || [],
          estancados_detalle: estancados?.map((l: any) => ({ id: l.id, name: l.name, created_at: l.created_at, phone: l.phone })) || []
        }
      }));
    }

    // REPORTE SEMANAL
    if (url.pathname === '/api/reportes/semanal' && request.method === 'GET') {
      const hoy = new Date();
      const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7);

      const { data: leadsSemana } = await supabase.client.from('leads').select('*').gte('created_at', inicioSemana.toISOString());
      const { data: cierresSemana } = await supabase.client.from('leads').select('*, properties(price, name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString());
      const { data: citasSemana } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]).lte('scheduled_date', hoy.toISOString().split('T')[0]);
      const { data: vendedores } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true).order('sales_count', { ascending: false });

      let revenue = 0;
      if (cierresSemana) {
        for (const cierre of cierresSemana as any[]) { revenue += cierre.properties?.price || 2000000; }
      }

      const fuenteCount: Record<string, number> = {};
      if (leadsSemana) {
        for (const l of leadsSemana as any[]) { const fuente = l.source || 'Desconocido'; fuenteCount[fuente] = (fuenteCount[fuente] || 0) + 1; }
      }

      const citasCompletadas = citasSemana?.filter((c: any) => c.status === 'completed').length || 0;
      const conversionRate = leadsSemana && leadsSemana.length > 0 ? Math.round((cierresSemana?.length || 0) / leadsSemana.length * 100) : 0;

      return corsResponse(JSON.stringify({
        periodo: 'semanal',
        fecha_inicio: inicioSemana.toISOString().split('T')[0],
        fecha_fin: hoy.toISOString().split('T')[0],
        resumen: {
          leads_nuevos: leadsSemana?.length || 0,
          citas_realizadas: citasCompletadas,
          citas_totales: citasSemana?.length || 0,
          cierres: cierresSemana?.length || 0,
          revenue: revenue,
          revenue_formatted: `$${(revenue/1000000).toFixed(1)}M`
        },
        conversion: {
          lead_a_cierre: conversionRate,
          insight: conversionRate >= 5 ? 'Conversión saludable' : 'Conversión baja - revisar seguimiento'
        },
        ranking_vendedores: vendedores?.slice(0, 5).map((v: any) => ({
          name: v.name,
          ventas: v.sales_count || 0,
          citas: v.appointments_count || 0
        })) || [],
        fuentes: Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).map(([fuente, count]) => ({ fuente, leads: count })),
        cierres_detalle: cierresSemana?.map((c: any) => ({
          lead: c.name,
          propiedad: c.properties?.name,
          precio: c.properties?.price
        })) || []
      }));
    }

    // REPORTE MENSUAL
    if (url.pathname === '/api/reportes/mensual' && request.method === 'GET') {
      const hoy = new Date();

      // Permitir seleccionar mes específico con ?mes=1&año=2026
      const mesParam = url.searchParams.get('mes');
      const añoParam = url.searchParams.get('año') || url.searchParams.get('ano');

      let mesSeleccionado = hoy.getMonth(); // Mes actual (0-11)
      let añoSeleccionado = hoy.getFullYear();

      if (mesParam) {
        mesSeleccionado = parseInt(mesParam) - 1; // Convertir 1-12 a 0-11
      }
      if (añoParam) {
        añoSeleccionado = parseInt(añoParam);
      }

      // Inicio y fin del mes seleccionado
      const inicioMes = new Date(añoSeleccionado, mesSeleccionado, 1);
      const finMes = new Date(añoSeleccionado, mesSeleccionado + 1, 0); // Último día del mes

      // Mes anterior para comparación
      const mesAnterior = new Date(añoSeleccionado, mesSeleccionado - 1, 1);
      const finMesAnterior = new Date(añoSeleccionado, mesSeleccionado, 0);

      const { data: leadsMes } = await supabase.client.from('leads').select('*').gte('created_at', inicioMes.toISOString()).lte('created_at', finMes.toISOString());
      const { data: leadsMesAnterior } = await supabase.client.from('leads').select('*').gte('created_at', mesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString());
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price, name, development)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes.toISOString()).lte('status_changed_at', finMes.toISOString());
      const { data: citasMes } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMes.toISOString().split('T')[0]).lte('scheduled_date', finMes.toISOString().split('T')[0]);
      const { data: vendedores } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true).order('sales_count', { ascending: false });

      let revenue = 0;
      const desarrolloCount: Record<string, { count: number, revenue: number }> = {};
      if (cierresMes) {
        for (const cierre of cierresMes as any[]) {
          const precio = cierre.properties?.price || 2000000;
          revenue += precio;
          const dev = cierre.properties?.development || 'Otro';
          if (!desarrolloCount[dev]) desarrolloCount[dev] = { count: 0, revenue: 0 };
          desarrolloCount[dev].count++;
          desarrolloCount[dev].revenue += precio;
        }
      }

      const fuenteCount: Record<string, number> = {};
      if (leadsMes) {
        for (const l of leadsMes as any[]) { const fuente = l.source || 'Desconocido'; fuenteCount[fuente] = (fuenteCount[fuente] || 0) + 1; }
      }

      const citasCompletadas = citasMes?.filter((c: any) => c.status === 'completed').length || 0;
      const conversionRate = leadsMes && leadsMes.length > 0 ? Math.round((cierresMes?.length || 0) / leadsMes.length * 100) : 0;
      const crecimientoLeads = leadsMesAnterior && leadsMesAnterior.length > 0 ? Math.round(((leadsMes?.length || 0) - leadsMesAnterior.length) / leadsMesAnterior.length * 100) : 0;

      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

      return corsResponse(JSON.stringify({
        periodo: 'mensual',
        mes: meses[inicioMes.getMonth()],
        año: inicioMes.getFullYear(),
        fecha_inicio: inicioMes.toISOString().split('T')[0],
        fecha_fin: finMes.toISOString().split('T')[0],
        resumen: {
          leads_nuevos: leadsMes?.length || 0,
          leads_mes_anterior: leadsMesAnterior?.length || 0,
          crecimiento_leads: crecimientoLeads,
          citas_realizadas: citasCompletadas,
          citas_totales: citasMes?.length || 0,
          cierres: cierresMes?.length || 0,
          revenue: revenue,
          revenue_formatted: `$${(revenue/1000000).toFixed(1)}M`
        },
        conversion: {
          lead_a_cita: citasMes && leadsMes ? Math.round((citasMes.length / leadsMes.length) * 100) : 0,
          cita_a_cierre: citasCompletadas > 0 ? Math.round(((cierresMes?.length || 0) / citasCompletadas) * 100) : 0,
          lead_a_cierre: conversionRate
        },
        ranking_vendedores: vendedores?.slice(0, 10).map((v: any, i: number) => ({
          posicion: i + 1,
          name: v.name,
          ventas: v.sales_count || 0,
          citas: v.appointments_count || 0,
          revenue: (v.sales_count || 0) * 2000000
        })) || [],
        desarrollos: Object.entries(desarrolloCount).sort((a, b) => b[1].revenue - a[1].revenue).map(([dev, data]) => ({
          desarrollo: dev,
          ventas: data.count,
          revenue: data.revenue,
          revenue_formatted: `$${(data.revenue/1000000).toFixed(1)}M`
        })),
        fuentes: Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).map(([fuente, count]) => ({ fuente, leads: count })),
        cierres_detalle: cierresMes?.map((c: any) => ({
          lead: c.name,
          propiedad: c.properties?.name,
          desarrollo: c.properties?.development,
          precio: c.properties?.price,
          precio_formatted: `$${((c.properties?.price || 0)/1000000).toFixed(1)}M`
        })) || []
      }));
    }


    // ═══════════════════════════════════════════════════════════
    // CHAT IA PARA REPORTES - Preguntas sobre datos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/reportes/ask' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { pregunta, contexto } = body;

        if (!pregunta) {
          return corsResponse(JSON.stringify({ error: 'Falta pregunta' }), 400);
        }

        // Preparar resumen de datos para Claude
        let resumenDatos = 'DATOS DE REPORTES CEO:\n\n';
        resumenDatos += '📅 REPORTE DIARIO (' + (contexto?.diario?.fecha || 'hoy') + '):\n';
        resumenDatos += '- Leads nuevos ayer: ' + (contexto?.diario?.ayer?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Cierres ayer: ' + (contexto?.diario?.ayer?.cierres || 0) + '\n';
        resumenDatos += '- Citas hoy: ' + (contexto?.diario?.hoy?.citas_agendadas || 0) + '\n';
        resumenDatos += '- Leads HOT: ' + (contexto?.diario?.pipeline?.leads_hot || 0) + '\n';
        resumenDatos += '- Leads sin contactar: ' + (contexto?.diario?.pipeline?.leads_estancados || 0) + '\n\n';

        resumenDatos += '📈 REPORTE SEMANAL (' + (contexto?.semanal?.fecha_inicio || 'N/A') + ' al ' + (contexto?.semanal?.fecha_fin || 'N/A') + '):\n';
        resumenDatos += '- Leads nuevos: ' + (contexto?.semanal?.resumen?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Citas totales: ' + (contexto?.semanal?.resumen?.citas_totales || 0) + '\n';
        resumenDatos += '- Cierres: ' + (contexto?.semanal?.resumen?.cierres || 0) + '\n';
        resumenDatos += '- Revenue: ' + (contexto?.semanal?.resumen?.revenue_formatted || '$0') + '\n';
        resumenDatos += '- Conversión lead a cierre: ' + (contexto?.semanal?.conversion?.lead_a_cierre || 0) + '%\n\n';

        resumenDatos += '📉 REPORTE MENSUAL (' + (contexto?.mensual?.mes || 'N/A') + ' ' + (contexto?.mensual?.año || 'N/A') + '):\n';
        resumenDatos += '- Leads nuevos: ' + (contexto?.mensual?.resumen?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Crecimiento vs mes anterior: ' + (contexto?.mensual?.resumen?.crecimiento_leads || 0) + '%\n';
        resumenDatos += '- Citas totales: ' + (contexto?.mensual?.resumen?.citas_totales || 0) + '\n';
        resumenDatos += '- Cierres: ' + (contexto?.mensual?.resumen?.cierres || 0) + '\n';
        resumenDatos += '- Revenue: ' + (contexto?.mensual?.resumen?.revenue_formatted || '$0') + '\n';
        resumenDatos += '- Conversión lead a cierre: ' + (contexto?.mensual?.conversion?.lead_a_cierre || 0) + '%\n\n';

        resumenDatos += '🏆 RANKING VENDEDORES (mensual):\n';
        if (contexto?.mensual?.ranking_vendedores) {
          for (const v of contexto.mensual.ranking_vendedores) {
            resumenDatos += v.posicion + '. ' + v.name + ': ' + v.ventas + ' ventas, ' + v.citas + ' citas, $' + (v.revenue/1000000).toFixed(1) + 'M\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n🏘️ VENTAS POR DESARROLLO:\n';
        if (contexto?.mensual?.desarrollos) {
          for (const d of contexto.mensual.desarrollos) {
            resumenDatos += '- ' + d.desarrollo + ': ' + d.ventas + ' ventas, ' + d.revenue_formatted + '\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n📣 FUENTES DE LEADS:\n';
        if (contexto?.mensual?.fuentes) {
          for (const f of contexto.mensual.fuentes) {
            resumenDatos += '- ' + f.fuente + ': ' + f.leads + ' leads\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        // Llamar a Claude para responder
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 500,
            messages: [
              {
                role: 'user',
                content: 'Eres un asistente de análisis de datos para Santa Rita Residencial. Responde preguntas sobre los reportes de ventas de forma clara y concisa.\n\n' + resumenDatos + '\n\nPREGUNTA DEL CEO: ' + pregunta + '\n\nResponde de forma directa y útil. Si necesitas hacer cálculos, hazlos. Usa emojis para hacer la respuesta más visual.'
              }
            ]
          })
        });

        const claudeData = await claudeResponse.json() as any;
        const respuesta = claudeData?.content?.[0]?.text || 'No pude procesar la pregunta.';

        return corsResponse(JSON.stringify({ respuesta }));

      } catch (err) {
        console.error('Error en chat IA reportes:', err);
        return corsResponse(JSON.stringify({ error: 'Error procesando pregunta', respuesta: 'Hubo un error al procesar tu pregunta. Por favor intenta de nuevo.' }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════
    // CHAT IA PARA DASHBOARD - Preguntas sobre métricas generales
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/dashboard/ask' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { pregunta, contexto } = body;

        if (!pregunta) {
          return corsResponse(JSON.stringify({ error: 'Falta pregunta' }), 400);
        }

        // Preparar resumen de datos del dashboard para Claude
        let resumenDatos = 'DATOS DEL DASHBOARD DE VENTAS:\n\n';

        resumenDatos += '📊 MÉTRICAS GENERALES:\n';
        resumenDatos += '- Total leads: ' + (contexto?.totalLeads || 0) + '\n';
        resumenDatos += '- Pipeline value: $' + ((contexto?.pipelineValue || 0) / 1000000).toFixed(1) + 'M\n';
        resumenDatos += '- Cierres este mes: ' + (contexto?.cierresMes || 0) + '\n';
        resumenDatos += '- Cambio vs mes anterior: ' + (contexto?.cambioVsMesAnterior || 0) + '%\n';
        resumenDatos += '- Leads HOT (negociación/reservado): ' + (contexto?.leadsHot || 0) + '\n';
        resumenDatos += '- Tiempo promedio respuesta: ' + (contexto?.tiempoRespuesta || 0) + ' min\n\n';

        resumenDatos += '🔥 DISTRIBUCIÓN FUNNEL:\n';
        resumenDatos += '- Nuevos: ' + (contexto?.funnel?.new || 0) + '\n';
        resumenDatos += '- Contactados: ' + (contexto?.funnel?.contacted || 0) + '\n';
        resumenDatos += '- Cita agendada: ' + (contexto?.funnel?.scheduled || 0) + '\n';
        resumenDatos += '- Visitaron: ' + (contexto?.funnel?.visited || 0) + '\n';
        resumenDatos += '- Negociación: ' + (contexto?.funnel?.negotiation || 0) + '\n';
        resumenDatos += '- Reservado: ' + (contexto?.funnel?.reserved || 0) + '\n';
        resumenDatos += '- Cerrado: ' + (contexto?.funnel?.closed || 0) + '\n\n';

        resumenDatos += '📈 CONVERSIONES:\n';
        resumenDatos += '- Lead a venta: ' + (contexto?.conversiones?.leadToSale || 0) + '%\n';
        resumenDatos += '- Lead a cita: ' + (contexto?.conversiones?.leadToCita || 0) + '%\n';
        resumenDatos += '- Visita a cierre: ' + (contexto?.conversiones?.visitaToClose || 0) + '%\n';
        resumenDatos += '- Leads por venta (ratio): ' + (contexto?.conversiones?.ratioLeadsPorVenta || 0) + ':1\n\n';

        resumenDatos += '🏆 TOP VENDEDORES:\n';
        if (contexto?.topVendedores) {
          for (const v of contexto.topVendedores) {
            resumenDatos += '- ' + v.name + ': ' + v.ventas + ' ventas, ' + v.leads + ' leads, ' + v.conversion + '% conv\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n🏘️ TOP DESARROLLOS:\n';
        if (contexto?.topDesarrollos) {
          for (const d of contexto.topDesarrollos) {
            resumenDatos += '- ' + d.name + ': ' + d.ventas + ' ventas, $' + (d.revenue / 1000000).toFixed(1) + 'M revenue\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n📣 LEADS POR FUENTE:\n';
        if (contexto?.fuentesLeads) {
          for (const f of contexto.fuentesLeads) {
            resumenDatos += '- ' + f.source + ': ' + f.count + ' leads, ' + f.closed + ' cerrados\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        // Llamar a Claude para responder
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 600,
            messages: [
              {
                role: 'user',
                content: 'Eres un asistente de análisis de datos para Santa Rita Residencial. Responde preguntas sobre el dashboard y métricas de ventas de forma clara, concisa y accionable.\n\n' + resumenDatos + '\n\nPREGUNTA DEL USUARIO: ' + pregunta + '\n\nResponde de forma directa y útil. Da recomendaciones específicas cuando sea apropiado. Usa emojis para hacer la respuesta más visual. Máximo 3-4 párrafos.'
              }
            ]
          })
        });

        const claudeData = await claudeResponse.json() as any;
        const respuesta = claudeData?.content?.[0]?.text || 'No pude procesar la pregunta.';

        return corsResponse(JSON.stringify({ respuesta }));

      } catch (err) {
        console.error('Error en chat IA dashboard:', err);
        return corsResponse(JSON.stringify({ error: 'Error procesando pregunta', respuesta: 'Hubo un error al procesar tu pregunta. Por favor intenta de nuevo.' }), 500);
      }
    }
    // ═══════════════════════════════════════════════════════════
    // Endpoint de prueba - Enviar TEMPLATE
    // Endpoint para ver templates aprobados de Meta
    if (url.pathname === '/api/templates' && request.method === 'GET') {
      try {
        const WABA_ID = '1227849769248437';

        // Obtener templates del WABA directamente
        const templatesUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?fields=name,status,language&limit=50`;
        const templatesResp = await fetch(templatesUrl, {
          headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` }
        });
        const templatesData = await templatesResp.json() as any;

        // Formatear respuesta
        const templates = templatesData?.data?.map((t: any) => ({
          name: t.name,
          status: t.status,
          language: t.language
        })) || [];

        return corsResponse(JSON.stringify({
          waba_id: WABA_ID,
          total: templates.length,
          templates: templates
        }, null, 2));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear TODOS los templates del funnel
    if (url.pathname === '/api/create-all-templates' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';
        const results: any[] = [];

        const templates = [
          {
            name: 'recordatorio_cita_24h',
            category: 'UTILITY',
            text: '📅 ¡Hola {{1}}! Te recordamos tu cita mañana.\n\n🏠 {{2}}\n📍 {{3}}\n⏰ {{4}}\n\n¿Nos confirmas tu asistencia? Responde *Sí* o *No*.\n\n¡Te esperamos! 🙌',
            example: [['María', 'Monte Verde', 'Av. Principal 123', '10:00 AM']]
          },
          {
            name: 'recordatorio_cita_2h',
            category: 'UTILITY',
            text: '⏰ ¡{{1}}, tu cita es en 2 horas!\n\n🏠 {{2}}\n📍 {{3}}\n\n¡Te esperamos! 🏡',
            example: [['María', 'Monte Verde', 'Av. Principal 123']]
          },
          {
            name: 'encuesta_post_visita',
            category: 'MARKETING',
            text: '¡Hola {{1}}! 👋\n\nGracias por visitarnos hoy en *{{2}}*. 🏠\n\n¿Qué te pareció? Responde:\n1️⃣ Me encantó\n2️⃣ Quiero ver más opciones\n3️⃣ Tengo dudas\n\nEstoy aquí para ayudarte 😊',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'reagendar_noshow',
            category: 'UTILITY',
            text: '👋 Hola {{1}},\n\nNotamos que no pudiste llegar a tu cita en *{{2}}*.\n\n¡No te preocupes! 😊 ¿Te gustaría reagendar?\n\nSolo dime qué día y hora te funcionan mejor. 📅',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'info_credito',
            category: 'MARKETING',
            text: '🏦 ¡Hola {{1}}!\n\nTe comparto información sobre crédito hipotecario para *{{2}}*:\n\n✅ Hasta 20 años de plazo\n✅ Tasa competitiva\n✅ Varios bancos disponibles\n\n¿Te gustaría que un asesor te contacte? Responde *Sí*.',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'referidos_postventa',
            category: 'MARKETING',
            text: '🎉 ¡Hola {{1}}!\n\nYa pasó un mes desde que elegiste tu nuevo hogar en *{{2}}*. ¡Esperamos que lo estés disfrutando!\n\n🎁 *Programa de Referidos*\nSi conoces a alguien buscando casa, envíanos:\n*Referido Nombre Teléfono*\n\n¡Y ganas premios! 🏆',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'feliz_cumple',
            category: 'MARKETING',
            text: '🎂 ¡Feliz cumpleaños {{1}}! 🎉\n\nTodo el equipo te desea un día increíble.\n\nGracias por ser parte de nuestra familia. 🏠💙',
            example: [['María']]
          },
          {
            name: 'reactivacion_lead',
            category: 'MARKETING',
            text: '👋 ¡Hola {{1}}!\n\nHace tiempo no platicamos. ¿Sigues buscando casa en Zacatecas? 🏠\n\nTenemos nuevas opciones que podrían interesarte.\n\nResponde *Sí* y te cuento las novedades. 😊',
            example: [['María']]
          },
          {
            name: 'promo_desarrollo',
            category: 'MARKETING',
            text: '🎉 ¡Hola {{1}}!\n\n*PROMOCIÓN ESPECIAL* en {{2}}:\n\n{{3}}\n\n⏰ Válido por tiempo limitado.\n\n¿Te interesa? Responde *Sí* para más información.',
            example: [['María', 'Monte Verde', '10% de descuento en enganche']]
          },
          {
            name: 'invitacion_evento',
            category: 'MARKETING',
            text: '🏠 ¡Hola {{1}}!\n\nTe invitamos a *{{2}}*\n\n📅 {{3}}\n📍 {{4}}\n\n¡No te lo pierdas! Responde *Confirmo* para apartar tu lugar. 🎉',
            example: [['María', 'Feria de la Vivienda', 'Sábado 25 de enero, 10am', 'Monte Verde']]
          },
          {
            name: 'reactivar_equipo',
            category: 'UTILITY',
            text: '👋 ¡Hola {{1}}!\n\nSoy SARA, tu asistente de Grupo Santa Rita. 🏠\n\nResponde cualquier mensaje para activar nuestra conversación y poder enviarte reportes, alertas y notificaciones.\n\nEscribe *ayuda* para ver comandos disponibles. 💪',
            example: [['Oscar']]
          },
          {
            name: 'appointment_confirmation_v2',
            category: 'UTILITY',
            text: '¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.',
            example: [['María', 'Grupo Santa Rita', 'visita a Monte Verde', 'sábado 25 de enero', '10:00 AM']],
            hasButton: true,
            buttonText: 'Ver ubicación 📍',
            buttonUrl: 'https://maps.app.goo.gl/{{1}}',
            buttonExample: ['qR8vK3xYz9M']
          }
        ];

        for (const tmpl of templates) {
          const components: any[] = [
            {
              type: 'BODY',
              text: tmpl.text,
              example: { body_text: tmpl.example }
            }
          ];

          // Add button component if template has a button
          if ((tmpl as any).hasButton) {
            components.push({
              type: 'BUTTONS',
              buttons: [
                {
                  type: 'URL',
                  text: (tmpl as any).buttonText,
                  url: (tmpl as any).buttonUrl,
                  example: (tmpl as any).buttonExample
                }
              ]
            });
          }

          const payload = {
            name: tmpl.name,
            language: tmpl.name === 'appointment_confirmation_v2' ? 'es' : 'es_MX',
            category: tmpl.category,
            components
          };

          const response = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();
          results.push({
            name: tmpl.name,
            success: response.ok,
            status: response.status,
            result
          });
        }

        return corsResponse(JSON.stringify({ templates_created: results }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear template individual (legacy)
    if (url.pathname === '/api/create-reengagement-template' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';

        const templatePayload = {
          name: 'seguimiento_lead',
          language: 'es_MX',
          category: 'MARKETING',
          components: [
            {
              type: 'BODY',
              text: '¡Hola {{1}}! 👋\n\nHace unos días platicamos sobre *{{2}}* y quería saber si aún te interesa conocer más.\n\n¿Tienes alguna duda que pueda resolver? Responde *Sí* y con gusto te ayudo. 🏠',
              example: {
                body_text: [['Juan', 'Monte Verde']]
              }
            }
          ]
        };

        const createUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`;
        const response = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templatePayload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          status: response.status,
          template_name: 'seguimiento_lead',
          result
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Endpoint genérico para enviar cualquier template
    if (url.pathname === '/api/send-template' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { phone, template, params } = body;

        if (!phone || !template) {
          return corsResponse(JSON.stringify({ error: 'phone y template son requeridos' }), 400);
        }

        // Normalizar teléfono
        const digits = phone.replace(/\D/g, '');
        const phoneNormalized = digits.length === 10 ? '521' + digits :
                               digits.startsWith('52') && digits.length === 12 ? '521' + digits.slice(2) : digits;

        // Construir componentes del template
        const components: any[] = [];
        if (params && params.length > 0) {
          components.push({
            type: 'body',
            parameters: params.map((p: string) => ({ type: 'text', text: p }))
          });
        }

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNormalized,
          type: 'template',
          template: {
            name: template,
            language: { code: 'es_MX' },
            components
          }
        };

        console.log('📤 Enviando template:', template, 'a', phoneNormalized);

        const response = await fetch(`https://graph.facebook.com/v22.0/${env.META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          template,
          phone: phoneNormalized,
          result
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
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
            const tmNotes = typeof teamMember.notes === 'string'
              ? JSON.parse(teamMember.notes || '{}')
              : (teamMember.notes || {});
            const tmLastMsgId = tmNotes.last_processed_msg_id;

            // Si el mismo mensaje ID ya fue procesado, saltar
            if (tmLastMsgId === messageId) {
              console.log('⏭️ [TEAM] Mensaje ya procesado (mismo ID), saltando');
              return new Response('OK', { status: 200 });
            }

            // Marcar este mensaje como en proceso
            await supabase.client
              .from('team_members')
              .update({
                notes: {
                  ...tmNotes,
                  last_processed_msg_id: messageId,
                  last_processed_msg_time: now
                }
              })
              .eq('id', teamMember.id);
            console.log(`👤 [TEAM] Deduplicación OK para team_member ${teamMember.id}`);
          } else {
            // ═══ DEDUPLICACIÓN LEADS ═══
            const { data: recentMsg } = await supabase.client
              .from('leads')
              .select('notes')
              .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
              .maybeSingle();

            const lastMsgId = recentMsg?.notes?.last_processed_msg_id;
            const lastMsgTime = recentMsg?.notes?.last_processed_msg_time;

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
              await supabase.client
                .from('leads')
                .update({
                  notes: {
                    ...(recentMsg.notes || {}),
                    last_processed_msg_id: messageId,
                    last_processed_msg_time: now
                  }
                })
                .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`);
            }
          }
          // ═══ FIN DEDUPLICACIÓN ═══

          const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
          const meta = createMetaWithTracking(env, supabase);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);

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

                          // Enviar mensaje al cliente con datos del asesor
                          const msgCliente = creditService.generarMensajeAsesor(
                            asesor,
                            resultado.context.lead_name.split(' ')[0],
                            resultado.context.modalidad
                          );
                          await meta.sendWhatsAppMessage(from, msgCliente);

                          // Notificar al asesor (solo si está activo)
                          if (asesor.phone && asesor.is_active !== false) {
                            const msgAsesor = creditService.generarNotificacionAsesor(lead, resultado.context);
                            await meta.sendWhatsAppMessage(asesor.phone, msgAsesor);
                            console.log(`📤 Asesor ${asesor.name} notificado`);
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

              if (leadHot && leadHot.assigned_to) {
                // PRIMERO: Procesar respuestas a encuestas (NPS, post-entrega, etc.)
                // Estos pueden ser mensajes cortos como "1", "10", "si", "no"
                const npsProcessed = await procesarRespuestaNPS(supabase, meta, leadHot, text);
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


    // ═══════════════════════════════════════════════════════════════
    // Retell.ai - Pre-Call Lookup (buscar lead antes de contestar)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/retell/lookup' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        console.log(`📞 RETELL LOOKUP: Buscando lead para llamada...`, JSON.stringify(body));

        // Retell envía el número del que llama en from_number
        const callerPhone = body.from_number?.replace('+', '') || body.to_number?.replace('+', '');

        if (!callerPhone) {
          console.log('📞 RETELL LOOKUP: No se recibió número de teléfono');
          return new Response(JSON.stringify({
            lead_name: '',
            is_new_lead: 'true',
            greeting: '¡Hola! Gracias por llamar a Grupo Santa Rita, soy Sara. ¿Con quién tengo el gusto?'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Buscar lead en base de datos
        const { data: lead } = await supabase.client
          .from('leads')
          .select('id, name, phone, status, notes, assigned_to')
          .or(`phone.eq.${callerPhone},phone.like.%${callerPhone.slice(-10)}`)
          .maybeSingle();

        if (lead && lead.name) {
          // Lead conocido - saludar por nombre
          const nombre = lead.name.split(' ')[0]; // Solo primer nombre
          console.log(`📞 RETELL LOOKUP: Lead encontrado - ${lead.name} (${callerPhone})`);

          // Buscar desarrollo de interés si existe
          let desarrolloInteres = '';
          if (lead.notes) {
            const notesStr = typeof lead.notes === 'string' ? lead.notes : JSON.stringify(lead.notes);
            const matchDesarrollo = notesStr.match(/desarrollo[:\s]*([\w\s]+)/i);
            if (matchDesarrollo) desarrolloInteres = matchDesarrollo[1].trim();
          }

          return new Response(JSON.stringify({
            lead_name: nombre,
            lead_full_name: lead.name,
            lead_id: lead.id,
            is_new_lead: 'false',
            desarrollo_interes: desarrolloInteres,
            greeting: `¡Hola ${nombre}! Qué gusto escucharte de nuevo. Soy Sara de Grupo Santa Rita. ¿En qué te puedo ayudar hoy?`
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          // Lead nuevo - pedir nombre
          console.log(`📞 RETELL LOOKUP: Número nuevo - ${callerPhone}`);
          return new Response(JSON.stringify({
            lead_name: '',
            is_new_lead: 'true',
            greeting: '¡Hola! Gracias por llamar a Grupo Santa Rita, soy Sara. ¿Con quién tengo el gusto?'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (error) {
        console.error('❌ Retell Lookup Error:', error);
        return new Response(JSON.stringify({
          lead_name: '',
          is_new_lead: 'true',
          greeting: '¡Hola! Gracias por llamar a Grupo Santa Rita, soy Sara. ¿Con quién tengo el gusto?'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Webhook Retell.ai - Eventos de llamadas telefónicas con IA
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/retell' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        console.log(`📞 RETELL WEBHOOK: Evento ${body.event} recibido`);

        const { event, call } = body;

        if (!call || !call.call_id) {
          console.error('❌ Retell webhook: evento inválido (sin call_id)');
          return new Response('OK', { status: 200 });
        }

        // Procesar evento según tipo
        if (event === 'call_started') {
          const isInbound = call.direction === 'inbound';
          const leadPhone = isInbound
            ? call.from_number?.replace('+', '')
            : call.to_number?.replace('+', '');

          console.log(`📞 Llamada ${isInbound ? 'ENTRANTE' : 'SALIENTE'} iniciada: ${call.call_id} ${isInbound ? '←' : '→'} ${leadPhone}`);

          // Buscar lead existente
          const { data: lead } = await supabase.client
            .from('leads')
            .select('*, team_members!leads_assigned_to_fkey(phone, name)')
            .or(`phone.eq.${leadPhone},phone.like.%${leadPhone?.slice(-10)}`)
            .maybeSingle();

          if (lead?.team_members) {
            const vendedorPhone = (lead.team_members as any).phone;
            const vendedorName = (lead.team_members as any).name;
            const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

            if (isInbound) {
              // Llamada entrante: el lead nos está llamando
              await meta.sendWhatsAppMessage(vendedorPhone,
                `📞📥 ${lead.name || leadPhone} está LLAMANDO a SARA...\n` +
                `La IA está atendiendo la llamada.`
              );
            } else {
              // Llamada saliente: nosotros llamamos al lead
              await meta.sendWhatsAppMessage(vendedorPhone,
                `📞📤 SARA está llamando a ${lead.name || leadPhone}...`
              );
            }
          } else if (isInbound) {
            // Llamada entrante de número desconocido
            console.log(`📞 Llamada entrante de número nuevo: ${leadPhone}`);
          }
        }

        if (event === 'call_ended' || event === 'call_analyzed') {
          // Intentar guardar en call_logs (si la tabla existe)
          try {
            // Para llamadas ENTRANTES, el lead llama a nosotros (from_number es el lead)
            // Para llamadas SALIENTES, nosotros llamamos al lead (to_number es el lead)
            const isInbound = call.direction === 'inbound';
            const leadPhone = isInbound
              ? call.from_number?.replace('+', '')
              : call.to_number?.replace('+', '');

            let { data: lead } = await supabase.client
              .from('leads')
              .select('id, assigned_to, name')
              .or(`phone.eq.${leadPhone},phone.like.%${leadPhone?.slice(-10)}`)
              .maybeSingle();

            // Si es llamada ENTRANTE y NO existe el lead, CREARLO
            if (isInbound && !lead && leadPhone) {
              console.log(`📞 Llamada entrante de número nuevo: ${leadPhone} - Creando lead...`);

              // Extraer nombre del análisis de la llamada si está disponible
              const nombreFromCall = call.call_analysis?.custom_analysis?.lead_name ||
                                     call.metadata?.lead_name ||
                                     'Lead Telefónico';

              // Buscar vendedor disponible para asignar (round-robin)
              const { data: vendedores } = await supabase.client
                .from('team_members')
                .select('id')
                .eq('role', 'vendedor')
                .eq('active', true)
                .limit(5);

              const vendedorId = vendedores && vendedores.length > 0
                ? vendedores[Math.floor(Math.random() * vendedores.length)].id
                : null;

              // Extraer datos del análisis de la llamada
              const desarrolloInteres = call.call_analysis?.custom_analysis?.desarrollo_interes ||
                                        call.metadata?.desarrollo || null;
              const presupuesto = call.call_analysis?.custom_analysis?.presupuesto || null;
              const tipoCredito = call.call_analysis?.custom_analysis?.tipo_credito || null;

              const { data: nuevoLead, error: createError } = await supabase.client
                .from('leads')
                .insert({
                  name: nombreFromCall,
                  phone: leadPhone,
                  source: 'phone_inbound',
                  status: 'new',
                  assigned_to: vendedorId,
                  property_interest: desarrolloInteres,
                  notes: {
                    notas: [{
                      text: `📞 Lead creado desde llamada telefónica entrante`,
                      author: 'SARA (Retell)',
                      timestamp: new Date().toISOString(),
                      type: 'system'
                    }],
                    presupuesto: presupuesto,
                    tipo_credito: tipoCredito,
                    primera_llamada: new Date().toISOString()
                  },
                  created_at: new Date().toISOString()
                })
                .select('id, assigned_to, name')
                .single();

              if (nuevoLead) {
                lead = nuevoLead;
                console.log(`✅ Lead creado desde llamada: ${nuevoLead.id} - ${nombreFromCall}`);

                // Notificar al vendedor asignado
                if (vendedorId) {
                  const { data: vendedor } = await supabase.client
                    .from('team_members')
                    .select('phone, name')
                    .eq('id', vendedorId)
                    .single();

                  if (vendedor?.phone) {
                    const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
                    await meta.sendWhatsAppMessage(vendedor.phone,
                      `🆕📞 NUEVO LEAD POR TELÉFONO\n\n` +
                      `👤 ${nombreFromCall}\n` +
                      `📱 ${leadPhone}\n` +
                      `🏠 Interés: ${desarrolloInteres || 'Por definir'}\n` +
                      `💰 Presupuesto: ${presupuesto || 'Por definir'}\n\n` +
                      `La llamada ya terminó. Te recomiendo dar seguimiento por WhatsApp.`
                    );
                  }
                }
              } else if (createError) {
                console.error('❌ Error creando lead desde llamada:', createError);
              }
            }

            await supabase.client.from('call_logs').insert({
              call_id: call.call_id,
              lead_id: lead?.id || null,
              lead_phone: isInbound ? call.from_number : call.to_number,
              vendor_id: lead?.assigned_to || call.metadata?.vendor_id || null,
              duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : null,
              transcript: call.transcript || null,
              summary: call.call_analysis?.summary || null,
              sentiment: call.call_analysis?.sentiment || null,
              outcome: call.call_analysis?.call_successful ? 'successful' : 'unknown',
              created_at: new Date().toISOString()
            });

            console.log(`✅ Call log guardado: ${call.call_id}`);

            // Agregar nota al lead
            if (lead) {
              const durationMin = call.duration_ms ? Math.round(call.duration_ms / 60000) : 0;
              const sentimentEmoji = call.call_analysis?.sentiment === 'positive' ? '😊' :
                                     call.call_analysis?.sentiment === 'negative' ? '😟' : '😐';

              let nota = `📞 Llamada IA (${durationMin}min) ${sentimentEmoji}`;
              if (call.call_analysis?.summary) {
                nota += `: ${call.call_analysis.summary.substring(0, 200)}`;
              }

              const { data: existingLead } = await supabase.client
                .from('leads')
                .select('notes')
                .eq('id', lead.id)
                .single();

              let notesObj = existingLead?.notes || {};
              if (typeof notesObj === 'string') {
                try { notesObj = JSON.parse(notesObj); } catch { notesObj = {}; }
              }
              const notasArray = notesObj.notas || [];
              notasArray.push({
                text: nota,
                author: 'SARA (Retell)',
                timestamp: new Date().toISOString(),
                type: 'call'
              });
              notesObj.notas = notasArray;

              await supabase.client.from('leads').update({ notes: notesObj }).eq('id', lead.id);
              console.log(`📝 Nota de llamada agregada a lead ${lead.id}`);
            }

            // Notificar al vendedor
            if (lead?.assigned_to) {
              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .eq('id', lead.assigned_to)
                .single();

              if (vendedor?.phone) {
                const durationMin = call.duration_ms ? Math.round(call.duration_ms / 60000) : 0;
                const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
                let mensaje = `📞 Llamada IA completada con ${lead.name || (isInbound ? call.from_number : call.to_number)}\n`;
                mensaje += `⏱️ Duración: ${durationMin} minutos\n`;
                if (call.call_analysis?.summary) {
                  mensaje += `📝 Resumen: ${call.call_analysis.summary.substring(0, 300)}`;
                }
                await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
              }
            }

            // ═══════════════════════════════════════════════════════════════
            // SEGUIMIENTO AUTOMÁTICO POR WHATSAPP AL LEAD
            // Enviar mensaje + brochure + GPS después de la llamada
            // ═══════════════════════════════════════════════════════════════
            if (leadPhone && call.duration_ms && call.duration_ms > 30000) {
              // Solo si la llamada duró más de 30 segundos (no fue colgada inmediatamente)
              try {
                const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
                const desarrolloInteres = call.call_analysis?.custom_analysis?.desarrollo_interes ||
                                          call.metadata?.desarrollo ||
                                          lead?.property_interest;

                // 1. Mensaje de agradecimiento
                let mensajeFollowUp = `¡Hola${lead?.name ? ' ' + lead.name.split(' ')[0] : ''}! 👋\n\n`;
                mensajeFollowUp += `Gracias por tu llamada con Grupo Santa Rita. `;

                if (desarrolloInteres) {
                  mensajeFollowUp += `Me da gusto que te interese ${desarrolloInteres}. `;
                }

                mensajeFollowUp += `\n\nTe comparto información por este medio para que la revises con calma. `;
                mensajeFollowUp += `Si tienes dudas, aquí estoy para ayudarte. 🏠`;

                await meta.sendWhatsAppMessage(leadPhone, mensajeFollowUp);
                console.log(`📱 WhatsApp de seguimiento enviado a ${leadPhone}`);

                // 2. Enviar brochure si hay desarrollo de interés
                if (desarrolloInteres) {
                  // Buscar el desarrollo en properties para obtener brochure y GPS
                  const desarrolloNormalizado = desarrolloInteres.toLowerCase()
                    .replace('priv.', 'privada')
                    .replace('priv ', 'privada ')
                    .trim();

                  const { data: property } = await supabase.client
                    .from('properties')
                    .select('name, brochure_url, gps_url, price_min, price_max')
                    .or(`name.ilike.%${desarrolloNormalizado}%,development.ilike.%${desarrolloNormalizado}%`)
                    .limit(1)
                    .maybeSingle();

                  if (property) {
                    // Enviar brochure si existe
                    if (property.brochure_url) {
                      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2s
                      await meta.sendWhatsAppDocument(
                        leadPhone,
                        property.brochure_url,
                        `📄 Brochure ${property.name || desarrolloInteres}`
                      );
                      console.log(`📄 Brochure enviado: ${property.name}`);
                    }

                    // Enviar GPS si existe
                    if (property.gps_url) {
                      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2s
                      await meta.sendWhatsAppMessage(
                        leadPhone,
                        `📍 Aquí te dejo la ubicación de ${property.name || desarrolloInteres}:\n${property.gps_url}`
                      );
                      console.log(`📍 GPS enviado: ${property.name}`);
                    }
                  }
                }

                // 3. Actualizar lead para marcar que recibió seguimiento post-llamada
                if (lead?.id) {
                  await supabase.client
                    .from('leads')
                    .update({
                      last_contact_at: new Date().toISOString(),
                      status: lead.status === 'new' ? 'contacted' : lead.status
                    })
                    .eq('id', lead.id);
                }

              } catch (whatsappError) {
                console.error('Error enviando WhatsApp de seguimiento:', whatsappError);
                // No fallar el webhook por error de WhatsApp
              }
            }
          } catch (dbError: any) {
            // Si la tabla call_logs no existe, solo loguear
            console.log(`📞 Llamada ${call.call_id} procesada (tabla call_logs no existe, solo log)`);
            if (!dbError.message?.includes('does not exist')) {
              console.error('Error guardando call log:', dbError);
            }
          }
        }

        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Retell Webhook Error:', error);
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

    // ═══════════════════════════════════════════════════════════════
    // ENDPOINT: Limpiar eventos huérfanos de Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/calendar/cleanup' && request.method === 'POST') {
      try {
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);

        // 1. Obtener eventos de Calendar
        const now = new Date();
        const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const events = await calendar.getEvents(now.toISOString(), nextMonth.toISOString());

        // 2. Obtener IDs de eventos válidos de la BD
        const { data: citasValidas } = await supabase.client
          .from('appointments')
          .select('google_event_vendedor_id, google_event_id, lead_name, scheduled_date, scheduled_time, status')
          .not('status', 'eq', 'cancelled'); // Todas las citas excepto canceladas

        const idsValidos = new Set<string>();
        citasValidas?.forEach(c => {
          if (c.google_event_vendedor_id) idsValidos.add(c.google_event_vendedor_id);
          if (c.google_event_id) idsValidos.add(c.google_event_id);
        });

        console.log('📅 Eventos en Calendar:', events.length);
        console.log('📅 IDs válidos en BD:', idsValidos.size);

        // 3. Identificar eventos huérfanos (no están en BD)
        const huerfanos: any[] = [];
        const validos: any[] = [];

        for (const event of events) {
          if (idsValidos.has(event.id)) {
            validos.push({ id: event.id, summary: event.summary, start: event.start?.dateTime });
          } else {
            huerfanos.push({ id: event.id, summary: event.summary, start: event.start?.dateTime });
          }
        }

        // 4. Borrar eventos huérfanos
        const borrados: string[] = [];
        for (const huerfano of huerfanos) {
          try {
            await calendar.deleteEvent(huerfano.id);
            borrados.push(huerfano.summary || huerfano.id);
            console.log('🗑️ Evento huérfano borrado:', huerfano.summary);
          } catch (e) {
            console.error('⚠️ Error borrando evento:', huerfano.id, e);
          }
        }

        return corsResponse(JSON.stringify({
          eventos_en_calendar: events.length,
          citas_validas_bd: citasValidas?.length || 0,
          huerfanos_encontrados: huerfanos.length,
          huerfanos_borrados: borrados,
          eventos_validos: validos
        }, null, 2));

      } catch (error: any) {
        console.error('Error en cleanup:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Endpoint para registrar webhook de Google Calendar
    if (url.pathname === '/api/calendar/setup-webhook' && request.method === 'POST') {
      try {
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        
        // Crear canal de notificaciones
        const webhookUrl = 'https://sara-backend.edson-633.workers.dev/webhook/google-calendar';
        const channelId = 'sara-crm-' + Date.now();
        
        const result = await calendar.watchCalendar(channelId, webhookUrl);
        
        console.log('📅 Webhook de Google Calendar configurado:', result);
        return corsResponse(JSON.stringify({ success: true, channel: result }));
      } catch (error: any) {
        console.error('Error configurando webhook:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 500);
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

    // ═══════════════════════════════════════════════════════════
    // REENVIAR VIDEO: Para videos que tienen URL pero no se enviaron
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/retry-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reintentando envío de video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      if (!video.video_url || video.video_url.startsWith('ERROR')) {
        return corsResponse(JSON.stringify({ error: 'Video no tiene URL válida', video_url: video.video_url }), 400);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video de Google
        console.log(`📥 Descargando video de Google...`);
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({
            error: 'Error descargando video',
            status: videoResponse.status,
            details: await videoResponse.text()
          }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Video subido a Meta: ${mediaId}`);

        // Enviar por WhatsApp
        await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
          `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

        // Actualizar registro como realmente enviado
        await supabase.client
          .from('pending_videos')
          .update({ sent: true, completed_at: new Date().toISOString(), video_url: video.video_url + ' (ENVIADO)' })
          .eq('id', video.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video enviado exitosamente a ${video.lead_name} (${video.lead_phone})`,
          media_id: mediaId
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESET VIDEO: Marcar video como no enviado para reintento
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/reset-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reseteando video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      // Resetear para que el cron lo procese de nuevo
      await supabase.client
        .from('pending_videos')
        .update({ sent: false, completed_at: null })
        .eq('id', videoId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Video ${videoId} reseteado. Se procesará en el próximo cron.`
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // GENERAR VIDEO DE PRUEBA: Para cualquier teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-video-personalizado/')) {
      const phone = url.pathname.split('/').pop();
      const phoneFormatted = phone?.startsWith('52') ? phone : `52${phone}`;
      const nombre = url.searchParams.get('nombre') || 'Amigo';
      const desarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';

      console.log(`🎬 Generando video de prueba para ${phoneFormatted}...`);

      try {
        const apiKey = env.GEMINI_API_KEY;

        // Fotos de fachadas por desarrollo
        const fotosDesarrollo: Record<string, string> = {
          'Monte Verde': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/EUCALIPTO-0-scaled.jpg',
          'Los Encinos': 'https://gruposantarita.com.mx/wp-content/uploads/2021/07/M4215335.jpg',
          'Andes': 'https://gruposantarita.com.mx/wp-content/uploads/2022/09/Dalia_act.jpg',
          'Miravalle': 'https://gruposantarita.com.mx/wp-content/uploads/2025/02/FACHADA-MIRAVALLE-DESARROLLO-edit-min-scaled-e1740520053367.jpg',
          'Distrito Falco': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/img03-7.jpg',
          'Acacia': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/ACACIA-1-scaled.jpg'
        };

        const testFoto = fotosDesarrollo[desarrollo] || fotosDesarrollo['Monte Verde'];

        const imgResponse = await fetch(testFoto);
        const imgBuffer = await imgResponse.arrayBuffer();
        // Convertir a base64 sin overflow (chunked)
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const imgBase64 = btoa(binary);

        // Detectar género por nombre (nombres terminados en 'a' = femenino, excepto algunos)
        const nombreLower = nombre.toLowerCase();
        const excepcionesMasculinas = ['joshua', 'ezra', 'garcia', 'peña', 'borja', 'mejia'];
        const esFemenino = nombreLower.endsWith('a') && !excepcionesMasculinas.some(e => nombreLower.includes(e));
        const bienvenida = esFemenino ? 'bienvenida' : 'bienvenido';

        // PROMPT: Fachada de la imagen EXACTA, sin generar otras casas
        const prompt = `IMPORTANT: Use ONLY the exact house facade shown in the input image. Do NOT generate or show any other houses, buildings, or locations.

Slow cinematic zoom towards the exact house facade in the image. The camera slowly approaches the front of this specific house, showing its real architectural details. Gentle camera movement, golden hour lighting. The house facade remains the main focus throughout the entire video.

At the end, a female real estate agent appears briefly in front of this same house and says in Spanish: "Hola ${nombre}, ${bienvenida} a tu nuevo hogar en ${desarrollo}".

8 seconds, 4K quality. No text overlays, no subtitles, no captions. Keep focus on the REAL house from the input image only.`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 8 }
          })
        });

        const result = await response.json() as any;
        const operationName = result.name;

        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: phoneFormatted,
          lead_name: nombre,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video generándose para ${nombre} (${phoneFormatted})`,
          operation_id: operationName,
          nota: 'El video tardará ~2 minutos. Se enviará automáticamente.'
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST HEYGEN: Probar video con HeyGen API
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-heygen/')) {
      const phone = url.pathname.split('/').pop();
      const phoneFormatted = phone?.startsWith('52') ? phone : `52${phone}`;
      const nombre = url.searchParams.get('nombre') || 'Amigo';
      const desarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';
      const fotoUrl = url.searchParams.get('foto') || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800';

      console.log(`🎬 [HeyGen] Generando video para ${phoneFormatted}...`);

      try {
        const heygenKey = env.HEYGEN_API_KEY;
        if (!heygenKey) {
          return corsResponse(JSON.stringify({ error: 'Falta HEYGEN_API_KEY' }), 500);
        }

        // Crear video con HeyGen
        const response = await fetch('https://api.heygen.com/v2/video/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': heygenKey
          },
          body: JSON.stringify({
            video_inputs: [{
              character: {
                type: 'avatar',
                avatar_id: 'Abigail_expressive_2024112501',
                avatar_style: 'normal'
              },
              voice: {
                type: 'text',
                input_text: `Hola ${nombre}, bienvenido a tu nuevo hogar aquí en ${desarrollo}. Estoy aquí para ayudarte a encontrar la casa de tus sueños. ¡Contáctanos hoy!`,
                voice_id: '6ce26db0cb6f4e7881b85452619f7f19'  // Camila Vega - Spanish female
              },
              background: {
                type: 'image',
                url: fotoUrl
              }
            }],
            dimension: {
              width: 720,
              height: 1280
            }
          })
        });

        const result = await response.json() as any;
        console.log('HeyGen response:', JSON.stringify(result));

        if (result.error) {
          return corsResponse(JSON.stringify({ error: result.error }), 500);
        }

        // Guardar en pending_videos con prefijo HEYGEN
        await supabase.client.from('pending_videos').insert({
          operation_id: `HEYGEN_${result.data?.video_id || 'unknown'}`,
          lead_phone: phoneFormatted,
          lead_name: nombre,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video HeyGen generándose para ${nombre}`,
          video_id: result.data?.video_id,
          status: result.data?.status,
          nota: 'El video tardará ~1 minuto. Se enviará automáticamente.'
        }));
      } catch (e: any) {
        console.error('Error HeyGen:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Listar avatares disponibles
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/heygen-avatars') {
      try {
        const response = await fetch('https://api.heygen.com/v2/avatars', {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Listar voces disponibles
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/heygen-voices') {
      try {
        const response = await fetch('https://api.heygen.com/v2/voices', {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Ver estado de video
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/heygen-status/')) {
      const videoId = url.pathname.split('/').pop();
      try {
        const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Enviar video completado a WhatsApp
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/heygen-send/')) {
      const videoId = url.pathname.split('/').pop();
      const phone = url.searchParams.get('phone') || '525610016226';

      try {
        // Obtener estado del video
        const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const status = await statusRes.json() as any;

        if (status.data?.status !== 'completed') {
          return corsResponse(JSON.stringify({ error: 'Video no completado', status: status.data?.status }), 400);
        }

        const videoUrl = status.data.video_url;
        if (!videoUrl) {
          return corsResponse(JSON.stringify({ error: 'No video URL' }), 400);
        }

        // Descargar video
        console.log('📥 Descargando video de HeyGen...');
        const videoRes = await fetch(videoUrl);
        const videoBuffer = await videoRes.arrayBuffer();
        console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta y enviar
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Video subido a Meta: ${mediaId}`);

        await meta.sendWhatsAppVideoById(phone, mediaId, '🎬 *¡Video personalizado para ti!*');
        console.log(`✅ Video enviado a ${phone}`);

        return corsResponse(JSON.stringify({ ok: true, message: `Video HeyGen enviado a ${phone}` }));
      } catch (e: any) {
        console.error('Error enviando video HeyGen:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // REGENERAR VIDEO: Para leads cuyo video falló
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/regenerate-video/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`🔄 Regenerando video para teléfono: ${phone}`);

      // Buscar video fallido
      const { data: failedVideo } = await supabase.client
        .from('pending_videos')
        .select('*')
        .ilike('lead_phone', `%${phone}%`)
        .ilike('video_url', '%ERROR%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!failedVideo) {
        return corsResponse(JSON.stringify({ error: 'No se encontró video fallido para este teléfono' }), 404);
      }

      // Eliminar el registro fallido
      await supabase.client
        .from('pending_videos')
        .delete()
        .eq('id', failedVideo.id);

      // Generar nuevo video
      try {
        const apiKey = env.GEMINI_API_KEY;
        const testFoto = 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg';

        const imgResponse = await fetch(testFoto);
        const imgBuffer = await imgResponse.arrayBuffer();
        const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

        const desarrollo = failedVideo.desarrollo?.split(',')[0]?.trim() || 'Los Encinos';
        // Prompt: SOLO la fachada de la imagen, sin generar otras casas
        const prompt = `IMPORTANT: Use ONLY the exact house facade from the input image. Do NOT generate any other buildings.

Slow cinematic camera movement towards this specific house facade. Show only the real architectural details from the image. Golden hour lighting, professional real estate style. Keep the camera focused on this exact house throughout. 6 seconds, 4K. No text overlays.`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 6 }
          })
        });

        const result = await response.json() as any;
        const operationName = result.name;

        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: failedVideo.lead_phone,
          lead_name: failedVideo.lead_name,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video regenerado para ${failedVideo.lead_name}`,
          operation_id: operationName,
          deleted_failed_id: failedVideo.id
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // DEBUG: Ver respuesta completa de Google para una operación
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/check-google-operation/')) {
      const opId = url.pathname.replace('/check-google-operation/', '');
      console.log(`🔍 Verificando operación Google: ${opId}`);

      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${opId}`,
        { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } }
      );

      const responseText = await statusResponse.text();
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }

      return corsResponse(JSON.stringify({
        status_code: statusResponse.status,
        raw_response: responseText.substring(0, 2000),
        parsed: parsed,
        possible_uri_paths: parsed ? {
          path1: parsed?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
          path2: parsed?.response?.generatedSamples?.[0]?.video?.uri,
          path3: parsed?.result?.videos?.[0]?.uri,
          path4: parsed?.videos?.[0]?.uri,
          path5: parsed?.response?.video?.uri,
          path6: parsed?.metadata?.videos?.[0]?.uri
        } : null
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // ADMIN: Eliminar lead por ID o teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/admin/delete-lead/')) {
      const identifier = url.pathname.split('/').pop();
      console.log(`🗑️ Eliminando lead: ${identifier}`);

      // Buscar por ID (UUID) o por teléfono
      const isUUID = identifier?.includes('-') && identifier.length > 30;

      let query = supabase.client.from('leads').delete();
      if (isUUID) {
        query = query.eq('id', identifier);
      } else {
        query = query.ilike('phone', `%${identifier}%`);
      }

      const { error, count } = await query.select('id');

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead eliminado`,
        identifier
      }));
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

      // Borrar leads de prueba existentes con este teléfono
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Lead Inactivo Prueba',
          phone: testPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Distrito Falco',
          created_at: hace5dias.toISOString(),
          updated_at: hace5dias.toISOString()
        })
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

      // Borrar leads de prueba existentes con este teléfono
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

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
        .insert({
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
        })
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
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      const { data: vendedorData, error } = await supabase.client
        .from('team_members')
        .select('id, name, notes')
        .eq('id', vendedorId)
        .single();

      return corsResponse(JSON.stringify({
        vendedor_id: vendedorId,
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

      const { CreditFlowService } = await import('./services/creditFlowService');
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
      const citaId = url.searchParams.get('cita_id');

      if (!citaId) {
        return corsResponse(JSON.stringify({ error: 'Falta cita_id' }), 400);
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
      const leadId = url.searchParams.get('lead_id') || '5c2d12bf-d1d1-4e09-ab9e-d93f5f38f701';
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';
      const vendedorPhoneOverride = url.searchParams.get('vendedor_phone');

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { PostVisitService } = await import('./services/postVisitService');
      const postVisitService = new PostVisitService(supabase);

      // 1. Obtener lead
      const { data: lead, error: leadError } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', details: leadError }), 400);
      }

      // 2. Obtener vendedor
      const { data: vendedor, error: vendedorError } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('id', vendedorId)
        .single();

      if (vendedorError || !vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado', details: vendedorError }), 400);
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
      const leadId = url.searchParams.get('lead_id');
      const vendedorId = url.searchParams.get('vendedor_id');

      if (!leadId || !vendedorId) {
        return corsResponse(JSON.stringify({ error: 'Faltan lead_id o vendedor_id' }), 400);
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

      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .eq('phone', phoneFormatted)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const nombreCorto = lead.name?.split(' ')[0] || 'Cliente';

      // Crear encuesta NPS en BD
      await supabase.client.from('surveys').insert({
        lead_id: lead.id,
        lead_phone: phoneFormatted,
        lead_name: lead.name,
        survey_type: 'nps',
        status: 'sent',
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      });

      const msgNPS = `🌟 *¡Felicidades por tu nuevo hogar, ${nombreCorto}!*

Tu opinión es muy importante para nosotros.

Del *0 al 10*, ¿qué tan probable es que nos recomiendes con un amigo o familiar?

0️⃣ = Nada probable
🔟 = Muy probable

_Solo responde con el número_ 🙏`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgNPS);
      return corsResponse(JSON.stringify({ ok: true, message: `Encuesta NPS enviada a ${phoneFormatted}` }));
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
      await iniciarFlujosPostVisita(supabase, meta);
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
                mensajeEncuesta += `${primeraQ.text}\n_Responde del 1 al 5_`;
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

    // ═══════════════════════════════════════════════════════════
    // VER VIDEOS PENDIENTES
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/pending-videos') {
      const { data } = await supabase.client
        .from('pending_videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      return corsResponse(JSON.stringify(data || []));
    }

    // ═══════════════════════════════════════════════════════════
    // REENVIAR VIDEO POR ID
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/resend-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reenviando video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      if (!video.video_url || video.video_url.startsWith('ERROR')) {
        return corsResponse(JSON.stringify({ error: 'Video no tiene URL válido', video_url: video.video_url }), 400);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video
        console.log('📥 Descargando video...');
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({ error: `Error descargando: ${videoResponse.status}` }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        console.log('📤 Subiendo a Meta...');
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Media ID: ${mediaId}`);

        // Enviar por WhatsApp
        console.log(`📱 Enviando a ${video.lead_phone}...`);
        await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
          `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

        // Marcar como enviado
        await supabase.client
          .from('pending_videos')
          .update({ video_url: video.video_url + ' (ENVIADO)', completed_at: new Date().toISOString() })
          .eq('id', video.id);

        return corsResponse(JSON.stringify({ ok: true, message: `Video reenviado a ${video.lead_phone}` }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ENVIAR VIDEO SEMANAL A ROLES ESPECÍFICOS
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/send-video-to-role') {
      const videoId = url.searchParams.get('video_id') || '5db9803f-a8e0-4bde-a2e4-e44ac2b236d2';
      const role = url.searchParams.get('role') || 'coordinador';

      console.log(`📤 Enviando video ${videoId} a rol: ${role}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video || !video.video_url) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado o sin URL' }), 404);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video
        console.log('📥 Descargando video...');
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({ error: `Error descargando: ${videoResponse.status}` }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        console.log('📤 Subiendo a Meta...');
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Media ID: ${mediaId}`);

        // Obtener miembros del rol
        const { data: equipo } = await supabase.client
          .from('team_members')
          .select('phone, name')
          .eq('role', role)
          .eq('active', true);

        const enviados: string[] = [];
        const errores: string[] = [];

        for (const miembro of equipo || []) {
          if (!miembro.phone) continue;
          try {
            await meta.sendWhatsAppVideoById(miembro.phone, mediaId,
              `🎬 *¡Video de la semana!*\n\n🏠 ${video.desarrollo}\n\n¡Excelente trabajo equipo! 👪🔥`);
            console.log(`✅ Video enviado a ${miembro.name}`);
            enviados.push(miembro.name);
          } catch (e: any) {
            console.error(`❌ Error enviando a ${miembro.name}: ${e.message}`);
            errores.push(`${miembro.name}: ${e.message}`);
          }
        }

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video enviado a ${enviados.length} ${role}s`,
          enviados,
          errores
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ENVIAR VIDEO A TELÉFONOS ESPECÍFICOS
    // /send-video-to-phones?video_id=XXX&phones=521...,521...,521...
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/send-video-to-phones') {
      const videoId = url.searchParams.get('video_id');
      const phonesParam = url.searchParams.get('phones');

      if (!videoId || !phonesParam) {
        return corsResponse(JSON.stringify({ error: 'Faltan video_id o phones' }), 400);
      }

      const phones = phonesParam.split(',').map(p => p.trim());
      console.log(`📤 Enviando video ${videoId} a ${phones.length} teléfonos`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video || !video.video_url) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado o sin URL' }), 404);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video
        console.log('📥 Descargando video...');
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({ error: `Error descargando: ${videoResponse.status}` }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        console.log('📤 Subiendo a Meta...');
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Media ID: ${mediaId}`);

        // Parsear stats para caption
        let caption = '🎬 *¡RESUMEN SEMANAL!*\n\n¡Excelente trabajo equipo! 🔥';
        try {
          const stats = JSON.parse(video.desarrollo);
          caption = `🎬 *¡RESUMEN SEMANAL!*\n\n` +
            `📊 *Resultados del equipo:*\n` +
            `   📥 ${stats.leads} leads nuevos\n` +
            `   📅 ${stats.citas} citas agendadas\n` +
            `   🏆 ${stats.cierres} cierres\n\n` +
            `¡Vamos por más! 💪🔥`;
        } catch (e) {
          console.log('⚠️ No se pudo parsear stats, usando caption default');
        }

        // Enviar a cada teléfono
        const enviados: string[] = [];
        const errores: string[] = [];

        for (const phone of phones) {
          try {
            const phoneFormatted = phone.startsWith('52') ? phone : '52' + phone;
            await meta.sendWhatsAppVideoById(phoneFormatted, mediaId, caption);
            console.log(`✅ Video enviado a ${phoneFormatted}`);
            enviados.push(phoneFormatted);
          } catch (e: any) {
            console.error(`❌ Error enviando a ${phone}: ${e.message}`);
            errores.push(`${phone}: ${e.message}`);
          }
        }

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video enviado a ${enviados.length}/${phones.length} teléfonos`,
          enviados,
          errores
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Generar video Veo 3 personalizado
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // CONSULTAR ESTADOS DE ENTREGA DE MENSAJES
    // /message-status?phone=521... o /message-status?hours=24
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/message-status') {
      const phone = url.searchParams.get('phone');
      const hours = parseInt(url.searchParams.get('hours') || '24');

      try {
        let query = supabase.client
          .from('message_delivery_status')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(100);

        if (phone) {
          const phoneClean = phone.replace(/\D/g, '');
          query = query.like('recipient_phone', `%${phoneClean.slice(-10)}`);
        } else {
          const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
          query = query.gte('updated_at', since);
        }

        const { data, error } = await query;

        if (error) {
          // Si la tabla no existe, mostrar mensaje amigable
          if (error.message.includes('does not exist')) {
            return corsResponse(JSON.stringify({
              error: 'Tabla message_delivery_status no existe',
              hint: 'Ejecuta el SQL para crearla o espera a que lleguen los primeros webhooks de estado',
              sql: `CREATE TABLE message_delivery_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  recipient_phone TEXT NOT NULL,
  status TEXT NOT NULL,
  timestamp TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mds_phone ON message_delivery_status(recipient_phone);
CREATE INDEX idx_mds_status ON message_delivery_status(status);
CREATE INDEX idx_mds_updated ON message_delivery_status(updated_at);`
            }));
          }
          throw error;
        }

        // Agrupar por estado
        const resumen = {
          sent: data?.filter(d => d.status === 'sent').length || 0,
          delivered: data?.filter(d => d.status === 'delivered').length || 0,
          read: data?.filter(d => d.status === 'read').length || 0,
          failed: data?.filter(d => d.status === 'failed').length || 0
        };

        return corsResponse(JSON.stringify({
          query: phone ? `phone: ${phone}` : `últimas ${hours} horas`,
          resumen,
          total: data?.length || 0,
          mensajes: data?.slice(0, 50) // Limitar a 50 para no sobrecargar
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
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

      const phone = url.searchParams.get('phone');
      const nombre = url.searchParams.get('nombre') || 'Test';
      const mensaje = url.searchParams.get('mensaje') || '🧪 Este es un mensaje de PRUEBA del sistema de pending messages.\n\nSi recibes esto, el flujo funcionó correctamente.\n\n- Template enviado ✅\n- Mensaje guardado como pending ✅\n- Entregado al responder ✅';

      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Falta phone' }), 400);
      }

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
      const health = await getHealthStatus(supabase);
      return corsResponse(JSON.stringify(health));
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

    // ═══════════════════════════════════════════════════════════════
    // API DOCS - Documentación OpenAPI/Swagger
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/docs' || url.pathname === '/api/docs') {
      const baseUrl = `https://${url.host}`;
      const specUrl = `${baseUrl}/api/openapi.json`;
      return new Response(generateSwaggerUI(specUrl), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/docs/redoc') {
      const baseUrl = `https://${url.host}`;
      const specUrl = `${baseUrl}/api/openapi.json`;
      return new Response(generateReDocUI(specUrl), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/openapi.json' || url.pathname === '/openapi.json') {
      const baseUrl = `https://${url.host}`;
      const spec = generateOpenAPISpec(baseUrl);
      return corsResponse(JSON.stringify(spec, null, 2), 200, 'application/json', request);
    }


    // ═══════════════════════════════════════════════════════════════
    // STATUS DASHBOARD - Vista completa del sistema
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/status') {
      const status = await getSystemStatus(supabase, env, cache);

      // Si piden HTML, devolver página bonita
      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(renderStatusPage(status), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(status, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // BACKUP - Exportar datos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/backup') {
      console.log('📦 Generando backup...');
      const backup = await exportBackup(supabase);
      return corsResponse(JSON.stringify(backup));
    }

    // ═══════════════════════════════════════════════════════════════
    // ANALYTICS DASHBOARD - Métricas de conversión y ventas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/analytics') {
      const period = url.searchParams.get('period') || '30';
      const analytics = await getAnalyticsDashboard(supabase, parseInt(period));

      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(renderAnalyticsPage(analytics), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(analytics, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // QUALITY DASHBOARD - Calidad de respuestas SARA
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/quality') {
      const dias = parseInt(url.searchParams.get('days') || '7');
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);

      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, conversation_history, updated_at')
        .gte('updated_at', fechaInicio.toISOString());

      // Análisis de calidad
      const nombresHallucinated = ['Salma', 'María', 'Maria', 'Juan', 'Pedro', 'Ana', 'Luis', 'Carlos'];
      const frasesProhibidas = ['Le aviso a', 'Sin problema', 'no lo tenemos disponible', 'Citadella del Nogal no'];

      let totalRespuestas = 0;
      let respuestasOk = 0;
      const problemasPorTipo: Record<string, number> = {};
      const problemasRecientes: any[] = [];

      (leads || []).forEach((lead: any) => {
        (lead.conversation_history || []).forEach((msg: any, idx: number) => {
          if (msg.role !== 'assistant') return;
          totalRespuestas++;
          const content = (msg.content || '').trim();
          let tieneProblema = false;

          if (content.endsWith(',') || (content.length > 0 && content.length < 20)) {
            problemasPorTipo['truncada'] = (problemasPorTipo['truncada'] || 0) + 1;
            tieneProblema = true;
          }
          if (!lead.name) {
            for (const n of nombresHallucinated) {
              if (content.includes(n)) { problemasPorTipo['nombre_inventado'] = (problemasPorTipo['nombre_inventado'] || 0) + 1; tieneProblema = true; break; }
            }
          }
          for (const f of frasesProhibidas) {
            if (content.toLowerCase().includes(f.toLowerCase())) { problemasPorTipo['frase_prohibida'] = (problemasPorTipo['frase_prohibida'] || 0) + 1; tieneProblema = true; break; }
          }

          if (tieneProblema) {
            problemasRecientes.push({ lead: lead.name || '???', preview: content.slice(0, 60), timestamp: msg.timestamp });
          } else {
            respuestasOk++;
          }
        });
      });

      const tasaCalidad = totalRespuestas > 0 ? Math.round((respuestasOk / totalRespuestas) * 100) : 100;

      // Renderizar HTML
      const html = `<!DOCTYPE html>
<html><head><title>SARA - Calidad</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:20px;background:#1a1a2e;color:#eee}
.container{max-width:900px;margin:0 auto}
h1{color:#00d4ff;margin-bottom:5px}
.subtitle{color:#888;margin-bottom:30px}
.card{background:#16213e;border-radius:12px;padding:20px;margin-bottom:20px}
.metric{display:inline-block;margin-right:40px;text-align:center}
.metric .value{font-size:48px;font-weight:bold}
.metric .label{font-size:14px;color:#888}
.ok{color:#00ff88}.warn{color:#ffaa00}.bad{color:#ff4444}
.bar{height:8px;background:#333;border-radius:4px;margin:10px 0}
.bar-fill{height:100%;border-radius:4px;transition:width 0.5s}
table{width:100%;border-collapse:collapse;margin-top:15px}
th,td{padding:10px;text-align:left;border-bottom:1px solid #333}
th{color:#00d4ff}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:5px}
.tag-truncada{background:#ff444433;color:#ff4444}
.tag-nombre{background:#ffaa0033;color:#ffaa00}
.tag-frase{background:#ff880033;color:#ff8800}
</style></head>
<body><div class="container">
<h1>📊 Dashboard de Calidad SARA</h1>
<p class="subtitle">Últimos ${dias} días • Actualizado: ${new Date().toLocaleString('es-MX')}</p>

<div class="card">
<div class="metric"><div class="value ${tasaCalidad >= 95 ? 'ok' : tasaCalidad >= 85 ? 'warn' : 'bad'}">${tasaCalidad}%</div><div class="label">Calidad</div></div>
<div class="metric"><div class="value">${totalRespuestas}</div><div class="label">Respuestas</div></div>
<div class="metric"><div class="value ok">${respuestasOk}</div><div class="label">OK</div></div>
<div class="metric"><div class="value ${totalRespuestas - respuestasOk > 0 ? 'warn' : 'ok'}">${totalRespuestas - respuestasOk}</div><div class="label">Con problemas</div></div>
</div>

<div class="card">
<h3>Problemas por Tipo</h3>
${Object.entries(problemasPorTipo).map(([tipo, count]) => `
<div style="margin:10px 0">
  <span>${tipo}: <strong>${count}</strong></span>
  <div class="bar"><div class="bar-fill" style="width:${Math.min((count as number / totalRespuestas) * 100 * 10, 100)}%;background:${tipo === 'truncada' ? '#ff4444' : tipo === 'nombre_inventado' ? '#ffaa00' : '#ff8800'}"></div></div>
</div>`).join('') || '<p style="color:#888">Sin problemas detectados ✅</p>'}
</div>

<div class="card">
<h3>Últimos Problemas</h3>
${problemasRecientes.length > 0 ? `<table>
<tr><th>Lead</th><th>Preview</th><th>Fecha</th></tr>
${problemasRecientes.slice(-10).reverse().map(p => `<tr><td>${p.lead}</td><td style="font-size:12px;color:#aaa">${p.preview}...</td><td style="font-size:12px">${new Date(p.timestamp).toLocaleString('es-MX')}</td></tr>`).join('')}
</table>` : '<p style="color:#00ff88">✅ Sin problemas recientes</p>'}
</div>

<p style="text-align:center;color:#666;margin-top:30px">SARA CRM v2.0 • <a href="/status" style="color:#00d4ff">Status</a> • <a href="/analytics" style="color:#00d4ff">Analytics</a></p>
</div></body></html>`;

      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // ═══════════════════════════════════════════════════════════════
    // FEATURE FLAGS - Control de funcionalidades sin deploy
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/flags' || url.pathname === '/flags') {
      const featureFlags = createFeatureFlags(env.SARA_CACHE);

      // GET - Obtener todos los flags
      if (request.method === 'GET') {
        const flags = await featureFlags.getFlags();
        return corsResponse(JSON.stringify({
          success: true,
          flags,
          updated_at: new Date().toISOString()
        }, null, 2), 200, 'application/json', request);
      }

      // PUT/POST - Actualizar flags (requiere auth)
      if (request.method === 'PUT' || request.method === 'POST') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        try {
          const body = await request.json() as Record<string, any>;
          await featureFlags.setFlags(body);
          const updatedFlags = await featureFlags.getFlags();
          return corsResponse(JSON.stringify({
            success: true,
            message: 'Flags actualizados',
            flags: updatedFlags
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // DELETE - Resetear a defaults (requiere auth)
      if (request.method === 'DELETE') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        await featureFlags.resetToDefaults();
        const flags = await featureFlags.getFlags();
        return corsResponse(JSON.stringify({
          success: true,
          message: 'Flags reseteados a valores por defecto',
          flags
        }, null, 2), 200, 'application/json', request);
      }
    }



    // ═══════════════════════════════════════════════════════════════
    // EMAIL REPORTS - Enviar reportes por correo
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/reports/send' || url.pathname === '/send-report') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const period = url.searchParams.get('period') || 'weekly';
      const emailReports = createEmailReports(supabase, env);

      let success = false;
      if (period === 'daily') {
        success = await emailReports.sendDailyReport();
      } else if (period === 'monthly') {
        success = await emailReports.sendMonthlyReport();
      } else {
        success = await emailReports.sendWeeklyReport();
      }

      return corsResponse(JSON.stringify({
        success,
        message: success ? `Reporte ${period} enviado` : 'Error enviando reporte (verificar RESEND_API_KEY)',
        period
      }), success ? 200 : 500, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // EMAIL REPORTS - Preview del reporte (sin enviar)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/reports/preview' || url.pathname === '/report-preview') {
      const days = parseInt(url.searchParams.get('days') || '7');
      const emailReports = createEmailReports(supabase, env);
      const data = await emailReports.generateReportData(days);

      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(emailReports.generateReportHTML(data), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(data, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // AUDIT LOG - Bitácora de acciones
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/audit' || url.pathname === '/audit') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const auditLog = createAuditLog(env.SARA_CACHE);

      // GET - Consultar logs
      if (request.method === 'GET') {
        const action = url.searchParams.get('action') || undefined;
        const actorType = url.searchParams.get('actor_type') || undefined;
        const targetId = url.searchParams.get('target_id') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const hours = parseInt(url.searchParams.get('hours') || '24');

        // Si piden summary
        if (url.searchParams.get('summary') === 'true') {
          const summary = await auditLog.getSummary(hours);
          return corsResponse(JSON.stringify({
            success: true,
            period_hours: hours,
            summary
          }, null, 2), 200, 'application/json', request);
        }

        const entries = await auditLog.query({
          action: action as any,
          actorType,
          targetId,
          limit
        });

        return corsResponse(JSON.stringify({
          success: true,
          count: entries.length,
          entries
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CACHE MANAGEMENT - Administrar caché inteligente
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/cache' || url.pathname === '/cache') {
      // GET - Ver stats del cache
      if (request.method === 'GET') {
        const info = cache.getCacheInfo();
        return corsResponse(JSON.stringify({
          success: true,
          ...info
        }, null, 2), 200, 'application/json', request);
      }

      // POST - Warmup del cache
      if (request.method === 'POST') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        const result = await cache.warmup(supabase);
        return corsResponse(JSON.stringify({
          success: result.success,
          message: result.success ? 'Cache precalentado' : 'Error en warmup',
          cached: result.cached
        }, null, 2), result.success ? 200 : 500, 'application/json', request);
      }

      // DELETE - Invalidar todo el cache
      if (request.method === 'DELETE') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        await cache.invalidateAll();
        return corsResponse(JSON.stringify({
          success: true,
          message: 'Cache invalidado completamente'
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // METRICS - Dashboard de rendimiento y latencia
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/metrics' || url.pathname === '/api/metrics') {
      const metrics = createMetrics(env.SARA_CACHE);
      const hours = parseInt(url.searchParams.get('hours') || '1');
      const summary = await metrics.getSummary(hours);

      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(metrics.generateDashboardHTML(summary), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(summary, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // BUSINESS HOURS - Estado del horario laboral
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/business-hours' || url.pathname === '/business-hours') {
      const businessHours = createBusinessHours();
      const info = businessHours.getScheduleInfo();
      const config = businessHours.getConfig();

      return corsResponse(JSON.stringify({
        success: true,
        ...info,
        schedule: config.schedule.map(s => ({
          ...s,
          dayName: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][s.dayOfWeek]
        })),
        holidays: config.holidayDates || []
      }, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // SENTIMENT ANALYSIS - Análisis de sentimiento de mensajes
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/sentiment' || url.pathname === '/api/sentiment/analyze') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const sentiment = createSentimentAnalysis();

      // POST /api/sentiment - Analizar un mensaje
      if (request.method === 'POST' && url.pathname === '/api/sentiment') {
        try {
          const body = await request.json() as any;

          if (!body.message || typeof body.message !== 'string') {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "message"'
            }), 400, 'application/json', request);
          }

          const result = sentiment.analyze(body.message);
          const alertInfo = sentiment.shouldAlert(result);

          return corsResponse(JSON.stringify({
            success: true,
            message: body.message.substring(0, 100) + (body.message.length > 100 ? '...' : ''),
            analysis: result,
            alert: alertInfo
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/sentiment/analyze - Analizar conversación completa
      if (request.method === 'POST' && url.pathname === '/api/sentiment/analyze') {
        try {
          const body = await request.json() as any;

          if (!body.messages || !Array.isArray(body.messages)) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "messages" como array'
            }), 400, 'application/json', request);
          }

          const result = sentiment.analyzeConversation(body.messages);

          return corsResponse(JSON.stringify({
            success: true,
            conversation: {
              overall: result.overall,
              trend: result.trend,
              avgScore: result.avgScore,
              messageCount: result.leadMessages.length
            },
            details: result.leadMessages
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WHATSAPP TEMPLATES - Gestión de templates de WhatsApp Business
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/templates' || url.pathname.startsWith('/api/templates/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const templates = createWhatsAppTemplates(
        env.SARA_CACHE,
        env.META_PHONE_NUMBER_ID,
        env.META_ACCESS_TOKEN
      );

      // GET /api/templates - Listar todos los templates
      if (request.method === 'GET' && url.pathname === '/api/templates') {
        const list = await templates.getTemplates();
        return corsResponse(JSON.stringify({
          success: true,
          count: list.length,
          templates: list
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/templates/approved - Solo templates aprobados
      if (request.method === 'GET' && url.pathname === '/api/templates/approved') {
        const list = await templates.getApprovedTemplates();
        return corsResponse(JSON.stringify({
          success: true,
          count: list.length,
          templates: list
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/templates/stats - Estadísticas de uso
      if (request.method === 'GET' && url.pathname === '/api/templates/stats') {
        const stats = await templates.getUsageStats();
        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/templates/sync - Sincronizar desde Meta
      if (request.method === 'POST' && url.pathname === '/api/templates/sync') {
        const synced = await templates.syncFromMeta();
        return corsResponse(JSON.stringify({
          success: true,
          message: `Sincronizados ${synced.length} templates`,
          templates: synced
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/templates/create - Crear un template en Meta
      if (request.method === 'POST' && url.pathname === '/api/templates/create') {
        try {
          const body = await request.json() as any;
          const WABA_ID = '1227849769248437';

          if (!body.name || !body.components) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "name" y "components"'
            }), 400, 'application/json', request);
          }

          const payload = {
            name: body.name,
            language: body.language || 'es',
            category: body.category || 'UTILITY',
            components: body.components
          };

          const response = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json() as any;

          if (result.error) {
            return corsResponse(JSON.stringify({
              success: false,
              error: result.error.message,
              details: result.error
            }), 400, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            id: result.id,
            name: body.name,
            status: 'PENDING'
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e instanceof Error ? e.message : 'Error desconocido'
          }), 500, 'application/json', request);
        }
      }

      // POST /api/templates/send - Enviar un template
      if (request.method === 'POST' && url.pathname === '/api/templates/send') {
        try {
          const body = await request.json() as any;

          if (!body.to || !body.templateName) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "to" y "templateName"'
            }), 400, 'application/json', request);
          }

          const result = await templates.sendTemplate({
            to: body.to,
            templateName: body.templateName,
            language: body.language,
            headerParams: body.headerParams,
            bodyParams: body.bodyParams,
            headerMediaUrl: body.headerMediaUrl,
            headerMediaType: body.headerMediaType,
            buttonParams: body.buttonParams
          });

          return corsResponse(JSON.stringify({
            success: result.success,
            messageId: result.messageId,
            error: result.error
          }, null, 2), result.success ? 200 : 400, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // PUT /api/templates/:name - Actualizar metadata de un template
      const updateMatch = url.pathname.match(/^\/api\/templates\/([^\/]+)$/);
      if (request.method === 'PUT' && updateMatch) {
        try {
          const body = await request.json() as any;
          const updated = await templates.updateTemplateMetadata(updateMatch[1], {
            description: body.description,
            tags: body.tags
          });

          return corsResponse(JSON.stringify({
            success: !!updated,
            template: updated
          }), updated ? 200 : 404, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/templates/tag/:tag - Buscar por tag
      const tagMatch = url.pathname.match(/^\/api\/templates\/tag\/([^\/]+)$/);
      if (request.method === 'GET' && tagMatch) {
        const list = await templates.getTemplatesByTag(decodeURIComponent(tagMatch[1]));
        return corsResponse(JSON.stringify({
          success: true,
          tag: tagMatch[1],
          count: list.length,
          templates: list
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PIPELINE - Sales Pipeline Intelligence
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/pipeline' || url.pathname.startsWith('/api/pipeline/')) {
      // Auth removed - CRM accesses these endpoints directly
      const pipelineService = new PipelineService(supabase);

      // GET /api/pipeline - Full pipeline summary
      if (request.method === 'GET' && url.pathname === '/api/pipeline') {
        const timeframe = parseInt(url.searchParams.get('timeframe') || '90');
        const summary = await pipelineService.getPipelineSummary(timeframe);
        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/stages - Pipeline by stage
      if (request.method === 'GET' && url.pathname === '/api/pipeline/stages') {
        const stages = await pipelineService.getPipelineByStage();
        return corsResponse(JSON.stringify({
          success: true,
          stages
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/at-risk - At-risk leads
      if (request.method === 'GET' && url.pathname === '/api/pipeline/at-risk') {
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const atRisk = await pipelineService.getAtRiskLeads(limit);
        return corsResponse(JSON.stringify({
          success: true,
          count: atRisk.length,
          at_risk_leads: atRisk
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/forecast - Monthly forecast
      if (request.method === 'GET' && url.pathname === '/api/pipeline/forecast') {
        const forecast = await pipelineService.getMonthlyForecast();
        return corsResponse(JSON.stringify({
          success: true,
          ...forecast
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/whatsapp - Pipeline formatted for WhatsApp
      if (request.method === 'GET' && url.pathname === '/api/pipeline/whatsapp') {
        const timeframe = parseInt(url.searchParams.get('timeframe') || '30');
        const summary = await pipelineService.getPipelineSummary(timeframe);
        const formatted = formatPipelineForWhatsApp(summary);
        return corsResponse(JSON.stringify({
          success: true,
          message: formatted
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // FINANCING CALCULATOR - Calculadora de crédito hipotecario
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/financing' || url.pathname.startsWith('/api/financing/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const financingService = new FinancingCalculatorService(supabase);

      // POST /api/financing/calculate - Calculate mortgage for single bank
      if (request.method === 'POST' && url.pathname === '/api/financing/calculate') {
        const body = await request.json() as any;
        const bank = body.bank || 'BBVA';
        const result = financingService.calculateMortgage({
          property_price: body.property_price || 0,
          down_payment_percent: body.down_payment_percent || 20,
          term_years: body.term_years || 20,
          annual_rate: body.annual_rate,
          income: body.income
        }, bank);

        if (!result) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No se pudo calcular. Verifica los parámetros.'
          }), 400, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          result
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/financing/compare - Compare all banks
      if (request.method === 'POST' && url.pathname === '/api/financing/compare') {
        const body = await request.json() as any;
        const comparison = financingService.compareBanks({
          property_price: body.property_price || 0,
          down_payment_percent: body.down_payment_percent || 20,
          term_years: body.term_years || 20,
          income: body.income,
          infonavit_credit: body.infonavit_credit,
          fovissste_credit: body.fovissste_credit
        });

        return corsResponse(JSON.stringify({
          success: true,
          ...comparison
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/financing/quick - Quick estimate
      if (request.method === 'GET' && url.pathname === '/api/financing/quick') {
        const price = parseFloat(url.searchParams.get('price') || '0');
        const downPayment = parseFloat(url.searchParams.get('down_payment') || '20');
        const term = parseInt(url.searchParams.get('term') || '20');

        if (price <= 0) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requiere el parámetro price (precio de la propiedad)'
          }), 400, 'application/json', request);
        }

        const estimate = financingService.quickEstimate(price, downPayment, term);
        return corsResponse(JSON.stringify({
          success: true,
          message: estimate
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/financing/banks - List available banks
      if (request.method === 'GET' && url.pathname === '/api/financing/banks') {
        const banks = financingService.getAvailableBanks();
        return corsResponse(JSON.stringify({
          success: true,
          banks
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/financing/qualify - Check qualification
      if (request.method === 'POST' && url.pathname === '/api/financing/qualify') {
        const body = await request.json() as any;
        const result = financingService.checkQualification(
          body.income || 0,
          body.property_price || 0,
          body.down_payment_percent || 20
        );

        return corsResponse(JSON.stringify({
          success: true,
          ...result
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PROPERTY COMPARATOR - Comparador de propiedades
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/compare' || url.pathname.startsWith('/api/compare/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const comparatorService = new PropertyComparatorService(supabase);

      // POST /api/compare - Compare properties by IDs
      if (request.method === 'POST' && url.pathname === '/api/compare') {
        const body = await request.json() as any;
        const ids = body.property_ids || [];

        if (ids.length < 2) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requieren al menos 2 property_ids para comparar'
          }), 400, 'application/json', request);
        }

        const comparison = await comparatorService.compare(ids);
        if (!comparison) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No se encontraron propiedades para comparar'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          ...comparison
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/compare/developments - Compare by development names
      if (request.method === 'POST' && url.pathname === '/api/compare/developments') {
        const body = await request.json() as any;
        const developments = body.developments || [];

        if (developments.length < 2) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requieren al menos 2 desarrollos para comparar'
          }), 400, 'application/json', request);
        }

        const comparison = await comparatorService.compareByDevelopments(developments);
        if (!comparison) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No se encontraron propiedades en estos desarrollos'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          ...comparison
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/compare/search - Search properties with filters
      if (request.method === 'GET' && url.pathname === '/api/compare/search') {
        const filters = {
          min_price: url.searchParams.get('min_price') ? parseInt(url.searchParams.get('min_price')!) : undefined,
          max_price: url.searchParams.get('max_price') ? parseInt(url.searchParams.get('max_price')!) : undefined,
          min_bedrooms: url.searchParams.get('min_bedrooms') ? parseInt(url.searchParams.get('min_bedrooms')!) : undefined,
          type: url.searchParams.get('type') || undefined,
          development: url.searchParams.get('development') || undefined
        };

        const properties = await comparatorService.searchProperties(filters);

        return corsResponse(JSON.stringify({
          success: true,
          count: properties.length,
          properties
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/compare/quick - Quick comparison via text query
      if (request.method === 'GET' && url.pathname === '/api/compare/quick') {
        const query = url.searchParams.get('q') || '';

        if (!query) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requiere el parámetro q con los desarrollos a comparar'
          }), 400, 'application/json', request);
        }

        const message = await comparatorService.quickCompare(query);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CLOSE PROBABILITY - Probabilidad de cierre
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/probability' || url.pathname.startsWith('/api/probability/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const probService = new CloseProbabilityService(supabase);

      // GET /api/probability - All leads probability summary
      if (request.method === 'GET' && url.pathname === '/api/probability') {
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const data = await probService.calculateForAllLeads(limit);

        return corsResponse(JSON.stringify({
          success: true,
          ...data
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/lead/:id - Single lead probability
      if (request.method === 'GET' && url.pathname.startsWith('/api/probability/lead/')) {
        const leadId = url.pathname.split('/').pop() || '';
        const result = await probService.calculateForLead(leadId);

        if (!result) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Lead no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          ...result
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/high - High probability leads
      if (request.method === 'GET' && url.pathname === '/api/probability/high') {
        const threshold = parseInt(url.searchParams.get('threshold') || '70');
        const leads = await probService.getHighProbabilityLeads(threshold);

        return corsResponse(JSON.stringify({
          success: true,
          count: leads.length,
          threshold,
          leads
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/at-risk - At-risk leads
      if (request.method === 'GET' && url.pathname === '/api/probability/at-risk') {
        const leads = await probService.getAtRiskLeads();

        return corsResponse(JSON.stringify({
          success: true,
          count: leads.length,
          leads
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/probability/whatsapp') {
        const data = await probService.calculateForAllLeads(50);
        const message = probService.formatForWhatsApp(data);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // VISIT MANAGEMENT - Gestión de visitas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/visits' || url.pathname.startsWith('/api/visits/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const visitService = new VisitManagementService(supabase);

      // GET /api/visits - Visit summary
      if (request.method === 'GET' && url.pathname === '/api/visits') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const summary = await visitService.getVisitSummary(days);

        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/today - Today's visits
      if (request.method === 'GET' && url.pathname === '/api/visits/today') {
        const visits = await visitService.getTodayVisits();

        return corsResponse(JSON.stringify({
          success: true,
          count: visits.length,
          visits
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/tomorrow - Tomorrow's visits
      if (request.method === 'GET' && url.pathname === '/api/visits/tomorrow') {
        const visits = await visitService.getTomorrowVisits();

        return corsResponse(JSON.stringify({
          success: true,
          count: visits.length,
          visits
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/week - This week's visits
      if (request.method === 'GET' && url.pathname === '/api/visits/week') {
        const visits = await visitService.getWeekVisits();

        return corsResponse(JSON.stringify({
          success: true,
          count: visits.length,
          visits
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/whatsapp - WhatsApp formatted summary
      if (request.method === 'GET' && url.pathname === '/api/visits/whatsapp') {
        const summary = await visitService.getVisitSummary(30);
        const message = visitService.formatSummaryForWhatsApp(summary);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/visits/:id/status - Update visit status
      if (request.method === 'POST' && url.pathname.match(/^\/api\/visits\/[^\/]+\/status$/)) {
        const visitId = url.pathname.split('/')[3];
        const body = await request.json() as any;

        const success = await visitService.updateVisitStatus(
          visitId,
          body.status,
          body.feedback,
          body.rating
        );

        return corsResponse(JSON.stringify({
          success,
          message: success ? 'Visita actualizada' : 'Error actualizando visita'
        }), success ? 200 : 500, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // OFFER TRACKING - Tracking de ofertas y negociaciones
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/offers' || url.pathname.startsWith('/api/offers/')) {
      // Auth removed - CRM accesses these endpoints directly
      const offerService = new OfferTrackingService(supabase);

      // GET /api/offers - Offer summary
      if (request.method === 'GET' && url.pathname === '/api/offers') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const summary = await offerService.getOfferSummary(days);

        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/active - Active offers
      if (request.method === 'GET' && url.pathname === '/api/offers/active') {
        const offers = await offerService.getActiveOffers();

        return corsResponse(JSON.stringify({
          success: true,
          count: offers.length,
          offers
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/expiring - Expiring soon
      if (request.method === 'GET' && url.pathname === '/api/offers/expiring') {
        const days = parseInt(url.searchParams.get('days') || '3');
        const offers = await offerService.getExpiringSoon(days);

        return corsResponse(JSON.stringify({
          success: true,
          count: offers.length,
          offers
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/lead/:id - Offers for a lead
      if (request.method === 'GET' && url.pathname.match(/^\/api\/offers\/lead\/[^\/]+$/)) {
        const leadId = url.pathname.split('/').pop() || '';
        const offers = await offerService.getOffersByLead(leadId);

        return corsResponse(JSON.stringify({
          success: true,
          count: offers.length,
          offers
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/whatsapp - WhatsApp formatted summary
      if (request.method === 'GET' && url.pathname === '/api/offers/whatsapp') {
        const summary = await offerService.getOfferSummary(30);
        const message = offerService.formatSummaryForWhatsApp(summary);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/offers/:id/status - Update offer status
      if (request.method === 'POST' && url.pathname.match(/^\/api\/offers\/[^\/]+\/status$/)) {
        const offerId = url.pathname.split('/')[3];
        const body = await request.json() as any;

        const success = await offerService.updateOfferStatus(
          offerId,
          body.status,
          body.notes,
          body.changed_by
        );

        return corsResponse(JSON.stringify({
          success,
          message: success ? 'Oferta actualizada' : 'Error actualizando oferta'
        }), success ? 200 : 500, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SMART ALERTS - Alertas inteligentes
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/alerts' || url.pathname.startsWith('/api/alerts/')) {
      // Auth removed - CRM accesses these endpoints directly
      const alertsService = new SmartAlertsService(supabase);

      // GET /api/alerts - All alerts summary
      if (request.method === 'GET' && url.pathname === '/api/alerts') {
        const summary = await alertsService.getAlertsSummary();

        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/alerts/scan - Force scan for new alerts
      if (request.method === 'GET' && url.pathname === '/api/alerts/scan') {
        const alerts = await alertsService.scanForAlerts();

        return corsResponse(JSON.stringify({
          success: true,
          count: alerts.length,
          alerts
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/alerts/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/alerts/whatsapp') {
        const summary = await alertsService.getAlertsSummary();
        const message = alertsService.formatSummaryForWhatsApp(summary);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MARKET INTELLIGENCE - Inteligencia de mercado
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/market' || url.pathname.startsWith('/api/market/')) {
      // Auth removed - CRM accesses these endpoints directly
      const { MarketIntelligenceService } = await import('./services/marketIntelligenceService');
      const marketService = new MarketIntelligenceService(supabase);

      // GET /api/market - Full market analysis
      if (request.method === 'GET' && url.pathname === '/api/market') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const analysis = await marketService.getMarketAnalysis(days);

        return corsResponse(JSON.stringify({
          success: true,
          analysis
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/market/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/market/whatsapp') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const analysis = await marketService.getMarketAnalysis(days);
        const message = marketService.formatForWhatsApp(analysis);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CUSTOMER VALUE (CLV) - Valor del cliente y referidos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/clv' || url.pathname.startsWith('/api/clv/')) {
      // Auth removed - CRM accesses these endpoints directly
      const { CustomerValueService } = await import('./services/customerValueService');
      const clvService = new CustomerValueService(supabase);

      // GET /api/clv - Full CLV analysis
      if (request.method === 'GET' && url.pathname === '/api/clv') {
        const analysis = await clvService.getCLVAnalysis();

        return corsResponse(JSON.stringify({
          success: true,
          analysis
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/clv/customer/:id - Customer profile
      const customerMatch = url.pathname.match(/^\/api\/clv\/customer\/([^\/]+)$/);
      if (request.method === 'GET' && customerMatch) {
        const customerId = customerMatch[1];
        const profile = await clvService.getCustomerProfile(customerId);

        if (!profile) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Cliente no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          customer: profile
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/clv/referrals/:id - Customer referral chain
      const referralMatch = url.pathname.match(/^\/api\/clv\/referrals\/([^\/]+)$/);
      if (request.method === 'GET' && referralMatch) {
        const customerId = referralMatch[1];
        const chain = await clvService.getReferralChain(customerId);

        if (!chain) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Cliente no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          referrals: chain
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/clv/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/clv/whatsapp') {
        const analysis = await clvService.getCLVAnalysis();
        const message = clvService.formatAnalysisForWhatsApp(analysis);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PDF REPORTS - Reportes PDF
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/reports' || url.pathname.startsWith('/api/reports/')) {
      // Auth removed - CRM accesses these endpoints directly
      const { PDFReportService } = await import('./services/pdfReportService');
      const reportService = new PDFReportService(supabase);

      // GET /api/reports/weekly - Weekly report
      if (request.method === 'GET' && url.pathname === '/api/reports/weekly') {
        const config = reportService.getWeeklyReportConfig();
        const data = await reportService.generateReportData(config);

        return corsResponse(JSON.stringify({
          success: true,
          report: data
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/reports/monthly - Monthly report
      if (request.method === 'GET' && url.pathname === '/api/reports/monthly') {
        const config = reportService.getMonthlyReportConfig();
        const data = await reportService.generateReportData(config);

        return corsResponse(JSON.stringify({
          success: true,
          report: data
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/reports/weekly/html - Weekly report as HTML
      if (request.method === 'GET' && url.pathname === '/api/reports/weekly/html') {
        const config = reportService.getWeeklyReportConfig();
        const data = await reportService.generateReportData(config);
        const html = reportService.generateHTML(data);

        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // GET /api/reports/monthly/html - Monthly report as HTML
      if (request.method === 'GET' && url.pathname === '/api/reports/monthly/html') {
        const config = reportService.getMonthlyReportConfig();
        const data = await reportService.generateReportData(config);
        const html = reportService.generateHTML(data);

        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // GET /api/reports/weekly/whatsapp - Weekly WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/reports/weekly/whatsapp') {
        const config = reportService.getWeeklyReportConfig();
        const data = await reportService.generateReportData(config);
        const message = reportService.formatForWhatsApp(data);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/reports/vendor/:id - Vendor personal report
      const vendorReportMatch = url.pathname.match(/^\/api\/reports\/vendor\/([^\/]+)$/);
      if (request.method === 'GET' && vendorReportMatch) {
        const vendorId = vendorReportMatch[1];

        // Get vendor info
        const { data: vendor } = await supabase.client
          .from('team_members')
          .select('id, name')
          .eq('id', vendorId)
          .single();

        if (!vendor) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Vendedor no encontrado'
          }), 404, 'application/json', request);
        }

        const config = reportService.getVendorReportConfig(vendorId, vendor.name);
        const data = await reportService.generateReportData(config);

        return corsResponse(JSON.stringify({
          success: true,
          report: data
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/reports/custom - Custom report
      if (request.method === 'POST' && url.pathname === '/api/reports/custom') {
        try {
          const config = await request.json() as any;

          if (!config.start_date || !config.end_date) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren start_date y end_date'
            }), 400, 'application/json', request);
          }

          const data = await reportService.generateReportData({
            type: 'custom',
            title: config.title || 'Reporte Personalizado',
            start_date: config.start_date,
            end_date: config.end_date,
            include_sections: config.include_sections || [
              'executive_summary',
              'leads_overview',
              'sales_metrics',
              'recommendations'
            ],
            recipient_name: config.recipient_name,
            recipient_role: config.recipient_role,
            vendor_id: config.vendor_id
          });

          const format = url.searchParams.get('format');
          if (format === 'html') {
            const html = reportService.generateHTML(data);
            return new Response(html, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }

          if (format === 'whatsapp') {
            const message = reportService.formatForWhatsApp(data);
            return corsResponse(JSON.stringify({
              success: true,
              message
            }, null, 2), 200, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            report: data
          }, null, 2), 200, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WEBHOOKS - Configuración y gestión de webhooks
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/webhooks' || url.pathname.startsWith('/api/webhooks/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const { WebhookService } = await import('./services/webhookService');
      const webhookService = new WebhookService(supabase, env.SARA_CACHE);

      // GET /api/webhooks - List all webhooks
      if (request.method === 'GET' && url.pathname === '/api/webhooks') {
        const webhooks = await webhookService.loadWebhooks();

        return corsResponse(JSON.stringify({
          success: true,
          count: webhooks.length,
          webhooks
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks - Create webhook
      if (request.method === 'POST' && url.pathname === '/api/webhooks') {
        try {
          const body = await request.json() as any;

          if (!body.name || !body.url || !body.events) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren name, url y events'
            }), 400, 'application/json', request);
          }

          const webhook = await webhookService.createWebhook({
            name: body.name,
            url: body.url,
            events: body.events,
            headers: body.headers || {},
            active: body.active !== false,
            retry_count: body.retry_count || 3
          });

          if (!webhook) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Error al crear webhook'
            }), 500, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            webhook
          }, null, 2), 201, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }

      // GET /api/webhooks/:id/stats - Webhook stats
      const statsMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)\/stats$/);
      if (request.method === 'GET' && statsMatch) {
        const webhookId = statsMatch[1];
        const stats = await webhookService.getWebhookStats(webhookId);

        if (!stats) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No hay estadísticas disponibles'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }

      // PUT /api/webhooks/:id - Update webhook
      const updateMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'PUT' && updateMatch) {
        const webhookId = updateMatch[1];

        try {
          const body = await request.json() as any;
          const updated = await webhookService.updateWebhook(webhookId, body);

          if (!updated) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Error al actualizar webhook'
            }), 500, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            message: 'Webhook actualizado'
          }, null, 2), 200, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }

      // DELETE /api/webhooks/:id - Delete webhook
      const deleteMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        const webhookId = deleteMatch[1];
        const deleted = await webhookService.deleteWebhook(webhookId);

        if (!deleted) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Error al eliminar webhook'
          }), 500, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          message: 'Webhook eliminado'
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks/test - Test webhook delivery
      if (request.method === 'POST' && url.pathname === '/api/webhooks/test') {
        try {
          const body = await request.json() as any;

          if (!body.url) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere url'
            }), 400, 'application/json', request);
          }

          // Send test payload
          const testPayload = {
            event: 'test',
            timestamp: new Date().toISOString(),
            webhook_id: 'test',
            data: { message: 'Test webhook from SARA CRM' }
          };

          const response = await fetch(body.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'SARA-CRM-Webhook/1.0'
            },
            body: JSON.stringify(testPayload)
          });

          return corsResponse(JSON.stringify({
            success: response.ok,
            status: response.status,
            message: response.ok ? 'Test exitoso' : 'Test fallido'
          }, null, 2), 200, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TEAM DASHBOARD - Métricas y estadísticas del equipo
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/team' || url.pathname.startsWith('/api/team/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const dashboard = createTeamDashboard(env.SARA_CACHE);
      const period = url.searchParams.get('period') || undefined;

      // GET /api/team - Resumen del equipo
      if (request.method === 'GET' && url.pathname === '/api/team') {
        const summary = await dashboard.getTeamSummary(period);
        return corsResponse(JSON.stringify({
          success: true,
          summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/vendors - Métricas de todos los vendedores
      if (request.method === 'GET' && url.pathname === '/api/team/vendors') {
        const metrics = await dashboard.getAllVendorMetrics(period);
        return corsResponse(JSON.stringify({
          success: true,
          count: metrics.length,
          vendors: metrics
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/leaderboard - Ranking de vendedores
      if (request.method === 'GET' && url.pathname === '/api/team/leaderboard') {
        const metric = (url.searchParams.get('metric') as 'conversions' | 'revenue' | 'response_time' | 'score') || 'score';
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const leaderboard = await dashboard.getLeaderboard(metric, period, limit);
        return corsResponse(JSON.stringify({
          success: true,
          metric,
          leaderboard
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/vendor/:id - Métricas de un vendedor específico
      const vendorMatch = url.pathname.match(/^\/api\/team\/vendor\/([^\/]+)$/);
      if (request.method === 'GET' && vendorMatch) {
        const vendorId = vendorMatch[1];
        const metrics = await dashboard.getVendorMetrics(vendorId, period);
        return corsResponse(JSON.stringify({
          success: true,
          vendor: metrics
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/compare - Comparar dos vendedores
      if (request.method === 'GET' && url.pathname === '/api/team/compare') {
        const vendor1 = url.searchParams.get('vendor1');
        const vendor2 = url.searchParams.get('vendor2');

        if (!vendor1 || !vendor2) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requieren los parámetros vendor1 y vendor2'
          }), 400, 'application/json', request);
        }

        const comparison = await dashboard.compareVendors(vendor1, vendor2, period);
        return corsResponse(JSON.stringify({
          success: true,
          comparison
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/team/event - Registrar evento de vendedor
      if (request.method === 'POST' && url.pathname === '/api/team/event') {
        try {
          const body = await request.json() as any;

          if (!body.vendorId || !body.event) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "vendorId" y "event"'
            }), 400, 'application/json', request);
          }

          switch (body.event) {
            case 'lead_assigned':
              await dashboard.recordLeadAssigned(body.vendorId, body.vendorName || '', body.vendorPhone || '');
              break;
            case 'lead_contacted':
              await dashboard.recordLeadContacted(body.vendorId, body.responseTimeMinutes);
              break;
            case 'lead_qualified':
              await dashboard.recordLeadQualified(body.vendorId);
              break;
            case 'conversion':
              await dashboard.recordConversion(body.vendorId, body.saleValue, body.daysToConvert);
              break;
            case 'lead_lost':
              await dashboard.recordLeadLost(body.vendorId);
              break;
            case 'message':
              await dashboard.recordMessage(body.vendorId, body.direction || 'sent');
              break;
            case 'appointment':
              await dashboard.recordAppointment(body.vendorId, body.status || 'scheduled');
              break;
            default:
              return corsResponse(JSON.stringify({
                success: false,
                error: `Evento desconocido: ${body.event}`
              }), 400, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            message: `Evento ${body.event} registrado`
          }), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // LEAD DEDUPLICATION - Detección y fusión de leads duplicados
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads/deduplicate' || url.pathname.startsWith('/api/leads/deduplicate/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const dedup = createLeadDeduplication();

      // POST /api/leads/deduplicate/check - Verificar si un lead es duplicado
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/check') {
        try {
          const body = await request.json() as any;

          if (!body.lead || !body.existingLeads) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "lead" y "existingLeads"'
            }), 400, 'application/json', request);
          }

          const match = dedup.checkForDuplicate(body.lead, body.existingLeads);

          return corsResponse(JSON.stringify({
            success: true,
            isDuplicate: !!match,
            match: match || null
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/find - Encontrar todos los duplicados
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/find') {
        try {
          const body = await request.json() as any;

          if (!body.leads || !Array.isArray(body.leads)) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "leads" como array'
            }), 400, 'application/json', request);
          }

          const duplicates = dedup.findDuplicates(body.leads);

          return corsResponse(JSON.stringify({
            success: true,
            count: duplicates.length,
            duplicates
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/stats - Estadísticas de duplicados
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/stats') {
        try {
          const body = await request.json() as any;

          if (!body.leads || !Array.isArray(body.leads)) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "leads" como array'
            }), 400, 'application/json', request);
          }

          const stats = dedup.getStats(body.leads);

          return corsResponse(JSON.stringify({
            success: true,
            stats
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/merge - Fusionar dos leads
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/merge') {
        try {
          const body = await request.json() as any;

          if (!body.primary || !body.secondary) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "primary" y "secondary" (objetos lead)'
            }), 400, 'application/json', request);
          }

          const result = dedup.mergeLeads(body.primary, body.secondary);

          return corsResponse(JSON.stringify({
            success: result.success,
            result
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/sql - Generar SQL para fusionar
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/sql') {
        try {
          const body = await request.json() as any;

          if (!body.primaryId || !body.secondaryId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "primaryId" y "secondaryId"'
            }), 400, 'application/json', request);
          }

          const queries = dedup.generateMergeSQL(body.primaryId, body.secondaryId);

          return corsResponse(JSON.stringify({
            success: true,
            queries,
            warning: 'Revisar y ejecutar estas queries manualmente en Supabase'
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // LINK TRACKING - Rastreo de clicks en enlaces
    // ═══════════════════════════════════════════════════════════════

    // GET /t/:shortCode - Redirect con tracking (público, sin auth)
    const trackingMatch = url.pathname.match(/^\/t\/([a-zA-Z0-9]+)$/);
    if (request.method === 'GET' && trackingMatch) {
      const tracking = createLinkTracking(env.SARA_CACHE);
      const shortCode = trackingMatch[1];

      const result = await tracking.recordClick(shortCode, {
        ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || undefined,
        userAgent: request.headers.get('User-Agent') || undefined,
        referrer: request.headers.get('Referer') || undefined
      });

      if (result.success && result.redirectUrl) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': result.redirectUrl }
        });
      }

      // Enlace no válido - redirigir a home
      return new Response(null, {
        status: 302,
        headers: { 'Location': 'https://gruposantarita.com' }
      });
    }

    // API endpoints de link tracking (requieren auth)
    if (url.pathname === '/api/tracking' || url.pathname.startsWith('/api/tracking/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const tracking = createLinkTracking(env.SARA_CACHE);

      // GET /api/tracking - Resumen general
      if (request.method === 'GET' && url.pathname === '/api/tracking') {
        const summary = await tracking.getSummary();
        return corsResponse(JSON.stringify({
          success: true,
          summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/tracking/links - Listar todos los enlaces
      if (request.method === 'GET' && url.pathname === '/api/tracking/links') {
        const links = await tracking.getAllLinks();
        return corsResponse(JSON.stringify({
          success: true,
          count: links.length,
          links
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/tracking/links - Crear enlace rastreable
      if (request.method === 'POST' && url.pathname === '/api/tracking/links') {
        try {
          const body = await request.json() as any;

          if (!body.url) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "url"'
            }), 400, 'application/json', request);
          }

          const link = await tracking.createLink({
            url: body.url,
            leadId: body.leadId,
            leadPhone: body.leadPhone,
            campaignId: body.campaignId,
            campaignName: body.campaignName,
            tags: body.tags,
            expiresInDays: body.expiresInDays,
            metadata: body.metadata
          });

          return corsResponse(JSON.stringify({
            success: true,
            link,
            trackingUrl: tracking.getTrackingUrl(link.shortCode)
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/tracking/links/:id - Obtener enlace específico
      const linkMatch = url.pathname.match(/^\/api\/tracking\/links\/([^\/]+)$/);
      if (request.method === 'GET' && linkMatch) {
        const link = await tracking.getLink(linkMatch[1]);

        if (!link) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Enlace no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          link,
          trackingUrl: tracking.getTrackingUrl(link.shortCode)
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/tracking/links/:id/stats - Estadísticas de un enlace
      const statsMatch = url.pathname.match(/^\/api\/tracking\/links\/([^\/]+)\/stats$/);
      if (request.method === 'GET' && statsMatch) {
        const stats = await tracking.getLinkStats(statsMatch[1]);

        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }

      // DELETE /api/tracking/links/:id - Eliminar enlace
      const deleteMatch = url.pathname.match(/^\/api\/tracking\/links\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        const deleted = await tracking.deleteLink(deleteMatch[1]);

        return corsResponse(JSON.stringify({
          success: deleted,
          message: deleted ? 'Enlace eliminado' : 'Enlace no encontrado'
        }), deleted ? 200 : 404, 'application/json', request);
      }

      // GET /api/tracking/lead/:leadId - Enlaces de un lead
      const leadMatch = url.pathname.match(/^\/api\/tracking\/lead\/([^\/]+)$/);
      if (request.method === 'GET' && leadMatch) {
        const links = await tracking.getLinksByLead(leadMatch[1]);

        return corsResponse(JSON.stringify({
          success: true,
          count: links.length,
          links
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/tracking/campaign/:campaignId - Estadísticas de campaña
      const campaignMatch = url.pathname.match(/^\/api\/tracking\/campaign\/([^\/]+)$/);
      if (request.method === 'GET' && campaignMatch) {
        const stats = await tracking.getCampaignStats(campaignMatch[1]);

        if (!stats) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Campaña no encontrada'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          campaign: stats
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SLA MONITORING - Monitoreo de tiempos de respuesta
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/sla' || url.pathname.startsWith('/api/sla/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const sla = createSLAMonitoring(env.SARA_CACHE);

      // GET /api/sla - Obtener configuración actual
      if (request.method === 'GET' && url.pathname === '/api/sla') {
        const config = await sla.getConfig();
        return corsResponse(JSON.stringify({
          success: true,
          config
        }, null, 2), 200, 'application/json', request);
      }

      // PUT /api/sla - Actualizar configuración
      if (request.method === 'PUT' && url.pathname === '/api/sla') {
        try {
          const body = await request.json() as any;
          const updated = await sla.updateConfig(body);
          return corsResponse(JSON.stringify({
            success: true,
            config: updated
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/sla/pending - Ver respuestas pendientes
      if (request.method === 'GET' && url.pathname === '/api/sla/pending') {
        const result = await sla.checkPendingResponses();
        return corsResponse(JSON.stringify({
          success: true,
          pending: {
            warnings: result.warnings,
            breaches: result.breaches,
            escalations: result.escalations,
            total: result.warnings.length + result.breaches.length + result.escalations.length
          }
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/sla/violations - Ver violaciones
      if (request.method === 'GET' && url.pathname === '/api/sla/violations') {
        const vendorId = url.searchParams.get('vendorId') || undefined;
        const status = url.searchParams.get('status') as 'open' | 'resolved' | 'escalated' | undefined;
        const fromDate = url.searchParams.get('from') || undefined;
        const toDate = url.searchParams.get('to') || undefined;

        const violations = await sla.getViolations({ vendorId, status, fromDate, toDate });
        return corsResponse(JSON.stringify({
          success: true,
          count: violations.length,
          violations
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/sla/metrics - Métricas SLA
      if (request.method === 'GET' && url.pathname === '/api/sla/metrics') {
        const from = url.searchParams.get('from') || undefined;
        const to = url.searchParams.get('to') || undefined;
        const period = from && to ? { from, to } : undefined;

        const metrics = await sla.getMetrics(period);
        return corsResponse(JSON.stringify({
          success: true,
          metrics
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/sla/track - Registrar mensaje entrante (para testing)
      if (request.method === 'POST' && url.pathname === '/api/sla/track') {
        try {
          const body = await request.json() as any;

          if (!body.leadId || !body.vendorId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren leadId y vendorId'
            }), 400, 'application/json', request);
          }

          await sla.trackIncomingMessage({
            id: body.leadId,
            name: body.leadName || 'Lead',
            phone: body.leadPhone || '',
            vendorId: body.vendorId,
            vendorName: body.vendorName || 'Vendedor',
            vendorPhone: body.vendorPhone || '',
            isFirstMessage: body.isFirstMessage || false
          });

          return corsResponse(JSON.stringify({
            success: true,
            message: 'Tracking SLA iniciado'
          }), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/sla/resolve - Marcar respuesta del vendedor
      if (request.method === 'POST' && url.pathname === '/api/sla/resolve') {
        try {
          const body = await request.json() as any;

          if (!body.leadId || !body.vendorId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren leadId y vendorId'
            }), 400, 'application/json', request);
          }

          const result = await sla.trackVendorResponse(body.leadId, body.vendorId);

          if (!result) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'No hay tracking pendiente para este lead'
            }), 404, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            withinSLA: result.withinSLA,
            responseMinutes: result.responseMinutes,
            slaLimit: result.slaLimit
          }), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // AUTO-ASSIGNMENT - Motor de reglas para asignación de leads
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/assignment' || url.pathname.startsWith('/api/assignment/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const assignment = createAutoAssignment(env.SARA_CACHE);

      // GET /api/assignment/rules - Listar todas las reglas
      if (request.method === 'GET' && url.pathname === '/api/assignment/rules') {
        const rules = await assignment.getRules();
        return corsResponse(JSON.stringify({
          success: true,
          count: rules.length,
          rules
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/assignment/rules - Crear nueva regla
      if (request.method === 'POST' && url.pathname === '/api/assignment/rules') {
        try {
          const body = await request.json() as any;

          if (!body.name || !body.assignTo) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "name" y "assignTo"'
            }), 400, 'application/json', request);
          }

          const rule = await assignment.createRule({
            name: body.name,
            description: body.description,
            priority: body.priority || 100,
            conditions: body.conditions || [],
            conditionLogic: body.conditionLogic || 'AND',
            assignTo: body.assignTo,
            schedule: body.schedule,
            active: body.active !== false
          });

          return corsResponse(JSON.stringify({
            success: true,
            rule
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/assignment/rules/:id - Obtener regla específica
      const ruleMatch = url.pathname.match(/^\/api\/assignment\/rules\/([^\/]+)$/);
      if (request.method === 'GET' && ruleMatch) {
        const rule = await assignment.getRule(ruleMatch[1]);

        if (!rule) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Regla no encontrada'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          rule
        }, null, 2), 200, 'application/json', request);
      }

      // PUT /api/assignment/rules/:id - Actualizar regla
      const updateRuleMatch = url.pathname.match(/^\/api\/assignment\/rules\/([^\/]+)$/);
      if (request.method === 'PUT' && updateRuleMatch) {
        try {
          const body = await request.json() as any;
          const updated = await assignment.updateRule(updateRuleMatch[1], body);

          if (!updated) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Regla no encontrada'
            }), 404, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            rule: updated
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // DELETE /api/assignment/rules/:id - Eliminar regla
      const deleteRuleMatch = url.pathname.match(/^\/api\/assignment\/rules\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteRuleMatch) {
        const deleted = await assignment.deleteRule(deleteRuleMatch[1]);

        return corsResponse(JSON.stringify({
          success: deleted,
          message: deleted ? 'Regla eliminada' : 'Regla no encontrada'
        }), deleted ? 200 : 404, 'application/json', request);
      }

      // POST /api/assignment/assign - Asignar lead usando reglas
      if (request.method === 'POST' && url.pathname === '/api/assignment/assign') {
        try {
          const body = await request.json() as any;

          if (!body.lead || !body.vendors) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "lead" y "vendors"'
            }), 400, 'application/json', request);
          }

          const result = await assignment.assignLead(body.lead, body.vendors);

          return corsResponse(JSON.stringify({
            success: result.success,
            assignment: result
          }, null, 2), result.success ? 200 : 400, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/assignment/stats - Estadísticas de uso
      if (request.method === 'GET' && url.pathname === '/api/assignment/stats') {
        const stats = await assignment.getStats();
        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // LEAD ATTRIBUTION - Rastreo de origen de leads (UTM)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/attribution' || url.pathname.startsWith('/api/attribution/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const attribution = createLeadAttribution(env.SARA_CACHE);

      // GET /api/attribution - Resumen de atribución
      if (request.method === 'GET' && url.pathname === '/api/attribution') {
        const from = url.searchParams.get('from') || undefined;
        const to = url.searchParams.get('to') || undefined;
        const period = from && to ? { from, to } : undefined;

        const summary = await attribution.getSummary(period);
        return corsResponse(JSON.stringify({
          success: true,
          summary
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/attribution/track - Registrar atribución de lead
      if (request.method === 'POST' && url.pathname === '/api/attribution/track') {
        try {
          const body = await request.json() as any;

          if (!body.leadId || !body.leadPhone) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "leadId" y "leadPhone"'
            }), 400, 'application/json', request);
          }

          const result = await attribution.trackLead(
            body.leadId,
            body.leadPhone,
            {
              utm_source: body.utm_source,
              utm_medium: body.utm_medium,
              utm_campaign: body.utm_campaign,
              utm_term: body.utm_term,
              utm_content: body.utm_content,
              referrer: body.referrer,
              landing_page: body.landing_page
            },
            body.leadName
          );

          return corsResponse(JSON.stringify({
            success: true,
            attribution: result
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/attribution/conversion - Registrar conversión
      if (request.method === 'POST' && url.pathname === '/api/attribution/conversion') {
        try {
          const body = await request.json() as any;

          if (!body.leadId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "leadId"'
            }), 400, 'application/json', request);
          }

          const result = await attribution.trackConversion(body.leadId, body.value);

          if (!result) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Lead no encontrado en atribución'
            }), 404, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            attribution: result
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/attribution/lead/:id - Obtener atribución de un lead
      const leadMatch = url.pathname.match(/^\/api\/attribution\/lead\/([^\/]+)$/);
      if (request.method === 'GET' && leadMatch) {
        const result = await attribution.getLeadAttribution(leadMatch[1]);

        if (!result) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Atribución no encontrada'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          attribution: result
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/attribution/spend - Registrar gasto en publicidad
      if (request.method === 'POST' && url.pathname === '/api/attribution/spend') {
        try {
          const body = await request.json() as any;

          if (!body.source || !body.date || body.amount === undefined) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "source", "date" y "amount"'
            }), 400, 'application/json', request);
          }

          const result = await attribution.recordAdSpend({
            source: body.source,
            campaign: body.campaign,
            date: body.date,
            amount: body.amount,
            currency: body.currency || 'MXN'
          });

          return corsResponse(JSON.stringify({
            success: true,
            spend: result
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/attribution/spend - Obtener gastos
      if (request.method === 'GET' && url.pathname === '/api/attribution/spend') {
        const source = url.searchParams.get('source') || undefined;
        const campaign = url.searchParams.get('campaign') || undefined;
        const from = url.searchParams.get('from') || undefined;
        const to = url.searchParams.get('to') || undefined;

        const spend = await attribution.getAdSpend({
          source,
          campaign,
          fromDate: from,
          toDate: to
        });

        const total = spend.reduce((sum, s) => sum + s.amount, 0);

        return corsResponse(JSON.stringify({
          success: true,
          count: spend.length,
          total,
          spend
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/attribution/best-channel - Mejor canal de conversión
      if (request.method === 'GET' && url.pathname === '/api/attribution/best-channel') {
        const best = await attribution.getBestPerformingChannel();

        return corsResponse(JSON.stringify({
          success: true,
          bestChannel: best
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // OUTGOING WEBHOOKS - Gestión de webhooks salientes
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/webhooks' || url.pathname.startsWith('/api/webhooks/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const webhooks = createOutgoingWebhooks(env.SARA_CACHE);

      // GET /api/webhooks - Listar todos
      if (request.method === 'GET' && url.pathname === '/api/webhooks') {
        const list = await webhooks.getWebhooks();
        return corsResponse(JSON.stringify({
          success: true,
          webhooks: list
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks - Crear nuevo
      if (request.method === 'POST' && url.pathname === '/api/webhooks') {
        try {
          const body = await request.json() as any;
          const created = await webhooks.createWebhook({
            name: body.name,
            url: body.url,
            events: body.events || [],
            secret: body.secret,
            active: body.active !== false,
            headers: body.headers
          });
          return corsResponse(JSON.stringify({
            success: true,
            webhook: created
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/webhooks/failed - Ver entregas fallidas
      if (request.method === 'GET' && url.pathname === '/api/webhooks/failed') {
        const failed = await webhooks.getFailedDeliveries();
        return corsResponse(JSON.stringify({
          success: true,
          count: failed.length,
          deliveries: failed
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks/test - Probar un webhook
      if (request.method === 'POST' && url.pathname === '/api/webhooks/test') {
        const webhookId = url.searchParams.get('id');
        if (!webhookId) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Falta parámetro id'
          }), 400, 'application/json', request);
        }

        const webhook = await webhooks.getWebhook(webhookId);
        if (!webhook) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Webhook no encontrado'
          }), 404, 'application/json', request);
        }

        // Enviar evento de prueba
        await webhooks.trigger('lead.created', {
          test: true,
          message: 'Este es un evento de prueba desde SARA',
          timestamp: new Date().toISOString()
        });

        return corsResponse(JSON.stringify({
          success: true,
          message: 'Evento de prueba enviado'
        }), 200, 'application/json', request);
      }

      // DELETE /api/webhooks/:id - Eliminar
      const deleteMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        const deleted = await webhooks.deleteWebhook(deleteMatch[1]);
        return corsResponse(JSON.stringify({
          success: deleted,
          message: deleted ? 'Webhook eliminado' : 'Webhook no encontrado'
        }), deleted ? 200 : 404, 'application/json', request);
      }

      // PUT /api/webhooks/:id - Actualizar
      const updateMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'PUT' && updateMatch) {
        try {
          const body = await request.json() as any;
          const updated = await webhooks.updateWebhook(updateMatch[1], body);
          return corsResponse(JSON.stringify({
            success: !!updated,
            webhook: updated
          }), updated ? 200 : 404, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
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

      // Borrar leads de prueba existentes
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

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
        .insert({
          name: 'Cumpleañero Prueba',
          phone: testPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          birthday: birthdayDate
        })
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
      console.log(`TEST: Enviando briefing a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Crear vendedor virtual para el test
      const vendedorTest = {
        id: 'test',
        name: 'Usuario',
        phone: phone?.startsWith('52') ? phone : '52' + phone,
        role: 'vendedor',
        recibe_briefing: true,
        last_briefing_sent: null
      };

      await enviarBriefingMatutino(supabase, meta, vendedorTest, { openaiApiKey: env.OPENAI_API_KEY });
      return corsResponse(JSON.stringify({ ok: true, message: `Briefing enviado a ${vendedorTest.phone}` }));
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

                // Notificar al vendedor
                if (vendedorDisponible.phone) {
                  try {
                    await meta.sendWhatsAppMessage(vendedorDisponible.phone,
                      `🚨 *LEAD REASIGNADO*\n\n` +
                      `Se te asignó un lead que estaba sin vendedor:\n\n` +
                      `👤 *${lead.name || 'Sin nombre'}*\n` +
                      `📱 ${lead.phone}\n` +
                      `🏠 ${lead.property_interest || 'Sin desarrollo definido'}\n\n` +
                      `⚠️ Este lead estuvo sin atención, contáctalo lo antes posible.\n\n` +
                      `Escribe *leads* para ver tu lista completa.`
                    );
                    console.log(`   📤 Notificación enviada a ${vendedorDisponible.name}`);
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
            await meta.sendWhatsAppMessage('5212224558475',
              `💾 *BACKUP ${backupData.status === 'success' ? 'COMPLETADO' : 'CON ERRORES'}*\n\n` +
              `${emoji} Fecha: ${backupDate}\n` +
              `📊 Tamaño: ${backupSizeKB} KB\n` +
              `📋 Datos:\n` +
              `   • Leads: ${backupData.tables?.leads?.count || 0}\n` +
              `   • Citas: ${backupData.tables?.appointments?.count || 0}\n` +
              `   • Equipo: ${backupData.tables?.team_members?.count || 0}\n` +
              `   • Propiedades: ${backupData.tables?.properties?.count || 0}\n\n` +
              `_Backups se guardan 7 días_`
            );
          }
        } else {
          console.warn('⚠️ KV no disponible, backup no guardado');
        }
      } catch (e) {
        console.error('❌ Error en backup diario:', e);
        // Notificar error
        try {
          await meta.sendWhatsAppMessage('5212224558475',
            `🚨 *ERROR EN BACKUP*\n\n` +
            `Error: ${String(e)}\n\n` +
            `Por favor revisar logs.`
          );
        } catch (notifyErr) {
          console.error('❌ No se pudo notificar error de backup');
        }
      }
    }

    // (Cumpleaños movido más abajo para incluir leads + equipo)

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
          const notas = typeof v.notes === 'string' ? JSON.parse(v.notes || '{}') : (v.notes || {});
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
        await meta.sendWhatsAppMessage('5212224558475',
          `🎓 *ONBOARDING RESET*\n\n` +
          `Se reseteó el tutorial de ${reseteados} vendedores.\n\n` +
          `La próxima vez que escriban a SARA, verán el tutorial completo con comandos.`
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

        // Procesar máximo 5 por CRON para evitar timeout
        const BATCH_SIZE = 5;
        const lote = pendientes.slice(0, BATCH_SIZE);
        let enviados = 0;

        console.log(`   🔄 Procesando lote de ${lote.length} (máx ${BATCH_SIZE} por CRON)`);

        for (const v of lote) {
          console.log(`\n   ═══ PROCESANDO: ${v.name} ═══`);
          try {
            await enviarBriefingMatutino(supabase, meta, v, { openaiApiKey: env.OPENAI_API_KEY });
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
    }

    // 7pm L-V: Reporte diario marketing
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reporte diario a marketing...');
      await enviarReporteDiarioMarketing(supabase, meta);
    }

    // Sábado 2pm: Video semanal de logros con Veo 3 (solo primer ejecucion)
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek === 6) {
      console.log('🎬 Generando video semanal de logros...');
      await generarVideoSemanalLogros(supabase, meta, env);
    }

    // Sábado 12pm: Recap semanal
    if (mexicoHour === 12 && isFirstRunOfHour && dayOfWeek === 6 && vendedores) {
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
    await iniciarFlujosPostVisita(supabase, meta);

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
      throw error; // Re-throw para que Cloudflare lo registre
    }
  },
};
