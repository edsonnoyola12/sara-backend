// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENV INTERFACE — Single source of truth for Cloudflare Worker bindings
// Previously duplicated in: index.ts, api-core.ts, api-bi.ts, retell.ts,
//   test.ts, ServiceFactory.ts
// ═══════════════════════════════════════════════════════════════════════════

export interface Env {
  // ── Supabase ──
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;

  // ── Anthropic (Claude) ──
  ANTHROPIC_API_KEY: string;

  // ── Twilio (SMS/Voice) ──
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;

  // ── Google (Calendar, Gemini) ──
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  GEMINI_API_KEY?: string;

  // ── Meta / WhatsApp ──
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  META_WEBHOOK_SECRET?: string;
  META_WHATSAPP_BUSINESS_ID?: string;

  // ── Auth ──
  API_SECRET?: string;

  // ── Cloudflare Bindings ──
  SARA_CACHE?: KVNamespace;
  SARA_BACKUPS?: R2Bucket;

  // ── Sentry ──
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;

  // ── Email (Resend) ──
  RESEND_API_KEY?: string;
  REPORT_TO_EMAILS?: string;

  // ── OpenAI (Whisper TTS) ──
  OPENAI_API_KEY?: string;

  // ── Retell.ai (Voice AI) ──
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;

  // ── Video ──
  VEO_API_KEY?: string;
  HEYGEN_API_KEY?: string;
}

// Helper types used across route handlers
export type CorsResponseFn = (body: string | null, status?: number, contentType?: string, request?: Request) => Response;
export type CheckApiAuthFn = (request: Request, env: Env) => Response | null;
