// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE UTILITIES — CORS, Rate Limiting, Auth, Logging, Signature Verification
// Extracted from index.ts for modularity
// ═══════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/env';
import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';

// ═══════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════

export const ALLOWED_CRM_ORIGINS = [
  'https://sara-crm-new.vercel.app',
  'https://sara-crm.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

export function isAllowedCrmOrigin(origin: string): boolean {
  return ALLOWED_CRM_ORIGINS.includes(origin) || origin.endsWith('.vercel.app');
}

export function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('Origin');
  if (origin && isAllowedCrmOrigin(origin)) {
    return origin;
  }
  return ALLOWED_CRM_ORIGINS[0];
}

export function corsResponse(body: string | null, status: number = 200, contentType: string = 'application/json', request?: Request): Response {
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

export function corsOptionsResponse(request: Request): Response {
  return corsResponse(null, 204, 'text/plain', request);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function log(level: 'info' | 'warn' | 'error', message: string, requestId: string, metadata?: Record<string, any>): void {
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
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

export async function checkRateLimit(request: Request, env: Env, requestId: string, maxRequests: number = 100, failClosed: boolean = false): Promise<Response | null> {
  if (!env.SARA_CACHE) return null;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/webhook')) return null;

  const queryKey = url.searchParams.get('api_key');
  const authHeader = request.headers.get('Authorization')?.replace('Bearer ', '');
  if ((queryKey === env.API_SECRET || authHeader === env.API_SECRET) && url.pathname.startsWith('/test-')) return null;

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const endpoint = url.pathname.split('?')[0];
  let tenantSuffix = '';
  if (authHeader && authHeader !== env.API_SECRET) {
    try {
      const parts = authHeader.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.tenantId) tenantSuffix = `:${payload.tenantId}`;
      }
    } catch {}
  }
  const key = `ratelimit:${ip}${tenantSuffix}:${endpoint}`;
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

    await env.SARA_CACHE.put(key, String(count + 1), { expirationTtl: windowSeconds });
  } catch (e) {
    if (failClosed) {
      console.warn(`⚠️ Rate limit KV error (fail-closed, request BLOCKED): ${String(e)}`);
      log('warn', 'Rate limit KV failed, blocking request (fail-closed)', requestId, { error: String(e), ip, endpoint });
      return new Response(JSON.stringify({
        error: 'Service temporarily unavailable',
        retry_after: 30
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '30' }
      });
    }
    console.warn(`⚠️ Rate limit KV error (fail-open, request allowed): ${String(e)}`);
    log('warn', 'Rate limit KV failed, allowing request (fail-open)', requestId, { error: String(e), ip, endpoint });
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════

export function checkApiAuth(request: Request, env: Env): Response | null {
  if (!env.API_SECRET) {
    console.error('🚨 API_SECRET no configurado - bloqueando endpoints protegidos');
    return corsResponse(JSON.stringify({
      error: 'Configuración de seguridad incompleta',
      hint: 'API_SECRET no está configurado en el entorno'
    }), 500);
  }

  const authHeader = request.headers.get('Authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
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

export function requiresAuth(pathname: string): boolean {
  const publicPaths = ['/webhook', '/health', '/status', '/analytics', '/'];
  if (publicPaths.includes(pathname)) return false;
  if (pathname.startsWith('/webhook')) return false;
  if (pathname.startsWith('/api/auth/')) return false;

  const crmPublicPatterns = [
    /^\/api\/appointments\/[^/]+\/cancel$/,
    /^\/api\/appointments\/notify-change$/,
    /^\/api\/calendar\//,
    /^\/api\/leads/,
    /^\/api\/team/,
    /^\/api\/appointments$/,
    /^\/api\/developments/,
    /^\/api\/properties/,
    /^\/api\/pipeline/,
    /^\/api\/alerts/,
    /^\/api\/market/,
    /^\/api\/clv/,
    /^\/api\/offers/,
    /^\/api\/reports/,
    /^\/api\/reportes/,
    /^\/api\/message-metrics/,
    /^\/api\/message-audit/,
    /^\/api\/tts-metrics/,
    /^\/api\/metrics\/quality/,
    /^\/api\/surveys/,
    /^\/api\/send-surveys/,
    /^\/api\/error-logs/,
    /^\/api\/sla/,
    /^\/api\/plans$/,
    /^\/api\/signup$/,
    /^\/api\/invitations\/accept$/,
    /^\/api\/billing\/webhook$/,
    /^\/api\/onboarding/,
    /^\/api\/billing/,
    /^\/api\/usage/,
    /^\/api\/invitations/,
    /^\/api\/admin\//,
  ];

  for (const pattern of crmPublicPatterns) {
    if (pattern.test(pathname)) return false;
  }

  return pathname.startsWith('/api/') ||
         pathname.startsWith('/test-') ||
         pathname.startsWith('/debug-');
}

// ═══════════════════════════════════════════════════════════════════════════
// META WEBHOOK SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

export async function verifyMetaSignature(request: Request, body: string, secret: string): Promise<boolean> {
  const signature = request.headers.get('X-Hub-Signature-256');
  if (!signature) {
    console.error('❌ Webhook sin firma X-Hub-Signature-256');
    return false;
  }

  const expectedSignature = signature.replace('sha256=', '');

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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
// SURVEY RESPONSE HELPER
// ═══════════════════════════════════════════════════════════════════════════

function isLikelySurveyResponse(msg: string): boolean {
  const trimmed = msg.trim();
  if (/^\d{1,2}$/.test(trimmed)) return true; // Just a number 0-10
  if (/^[1-5]$/.test(trimmed)) return true; // Rating 1-5
  return false;
}

export async function checkPendingSurveyResponse(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  phone: string,
  mensaje: string,
  nombre: string
): Promise<boolean> {
  try {
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
    if (!isLikelySurveyResponse(mensaje)) return false;

    const primerNombre = nombre?.split(' ')[0] || 'amigo';

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
