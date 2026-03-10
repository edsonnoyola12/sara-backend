// ═══════════════════════════════════════════════════════════════════════════
// TENANT MIDDLEWARE — Resolves tenant context from request
// Sources (in priority order):
//   1. JWT auth header (future: Phase 2)
//   2. Meta webhook phone_number_id
//   3. API key → default tenant
//   4. Fallback: Santa Rita (backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';

export const SANTA_RITA_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface TenantContext {
  tenantId: string;
  slug: string;
  name: string;
  timezone: string;
  plan: string;
  config: TenantConfig;
}

export interface TenantConfig {
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  whatsappWebhookSecret?: string;
  whatsappBusinessId?: string;
  googleCalendarId?: string;
  googleServiceAccountEmail?: string;
  googlePrivateKey?: string;
  retellApiKey?: string;
  retellAgentId?: string;
  retellPhoneNumber?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  maxLeads?: number;
  maxTeamMembers?: number;
  maxMessagesPerDay?: number;
}

// Cache tenant lookups in-memory for the duration of a request
// (Cloudflare Workers are short-lived, so this is safe)
const tenantCache = new Map<string, TenantContext>();

/**
 * Resolve tenant from Meta webhook phone_number_id
 */
export async function resolveTenantFromWebhook(
  phoneNumberId: string,
  supabase: SupabaseService
): Promise<TenantContext> {
  const cacheKey = `phone:${phoneNumberId}`;
  if (tenantCache.has(cacheKey)) {
    return tenantCache.get(cacheKey)!;
  }

  // Look up tenant by phone_number_id
  const { data: tenant, error } = await supabase.client
    .from('tenants')
    .select('*')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .eq('active', true)
    .single();

  if (tenant && !error) {
    if (isTrialExpired(tenant)) {
      console.warn(`⚠️ Tenant ${tenant.slug} trial expired (${tenant.trial_ends_at}), blocking webhook`);
      const ctx = mapTenantRow(tenant);
      ctx.plan = 'expired';
      tenantCache.set(cacheKey, ctx);
      return ctx;
    }
    const ctx = mapTenantRow(tenant);
    tenantCache.set(cacheKey, ctx);
    return ctx;
  }

  // Fallback to Santa Rita (backward compat — single-tenant mode)
  console.warn(`⚠️ No tenant found for phone_number_id: ${phoneNumberId}, defaulting to Santa Rita`);
  return getDefaultTenant();
}

/**
 * Resolve tenant from API request (auth header or default)
 */
export async function resolveTenantFromRequest(
  request: Request,
  supabase: SupabaseService
): Promise<TenantContext> {
  // Phase 2: Extract tenant from JWT
  // const jwt = request.headers.get('Authorization')?.replace('Bearer ', '');
  // if (jwt) { ... decode and extract tenantId ... }

  // Check X-Tenant-ID header (for API clients)
  const tenantIdHeader = request.headers.get('X-Tenant-ID');
  if (tenantIdHeader) {
    return resolveTenantById(tenantIdHeader, supabase);
  }

  // Default to Santa Rita
  return getDefaultTenant();
}

/**
 * Resolve tenant by ID
 */
export async function resolveTenantById(
  tenantId: string,
  supabase: SupabaseService
): Promise<TenantContext> {
  const cacheKey = `id:${tenantId}`;
  if (tenantCache.has(cacheKey)) {
    return tenantCache.get(cacheKey)!;
  }

  const { data: tenant, error } = await supabase.client
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .eq('active', true)
    .single();

  if (tenant && !error) {
    if (isTrialExpired(tenant)) {
      console.warn(`⚠️ Tenant ${tenant.slug} trial expired (${tenant.trial_ends_at}), marking as expired`);
      const ctx = mapTenantRow(tenant);
      ctx.plan = 'expired';
      tenantCache.set(cacheKey, ctx);
      return ctx;
    }
    const ctx = mapTenantRow(tenant);
    tenantCache.set(cacheKey, ctx);
    return ctx;
  }

  console.warn(`⚠️ Tenant not found: ${tenantId}, defaulting to Santa Rita`);
  return getDefaultTenant();
}

/**
 * Resolve all active tenants for CRON jobs
 * Returns all active tenants from DB, falls back to Santa Rita if query fails
 */
export async function resolveTenantsForCron(
  supabase: SupabaseService
): Promise<TenantContext[]> {
  try {
    const { data: tenants, error } = await supabase.client
      .from('tenants')
      .select('*')
      .eq('active', true);
    if (error || !tenants?.length) {
      console.warn('⚠️ Could not fetch tenants for CRON, defaulting to Santa Rita:', error?.message);
      return [getDefaultTenant()];
    }
    // Filter out trial-expired tenants from CRONs
    return tenants.filter(t => !isTrialExpired(t)).map(mapTenantRow);
  } catch (err: any) {
    console.warn('⚠️ resolveTenantsForCron error, defaulting to Santa Rita:', err?.message);
    return [getDefaultTenant()];
  }
}

/**
 * Default tenant context (Santa Rita)
 */
export function getDefaultTenant(): TenantContext {
  return {
    tenantId: SANTA_RITA_TENANT_ID,
    slug: 'santa-rita',
    name: 'Grupo Santa Rita',
    timezone: 'America/Mexico_City',
    plan: 'enterprise',
    config: {},
  };
}

/**
 * Check if tenant's trial has expired.
 * Returns true if tenant should be blocked (trial expired, no paid plan).
 */
function isTrialExpired(row: any): boolean {
  if (!row.trial_ends_at) return false; // no trial set = always active
  if (row.plan !== 'free') return false; // paid plans don't expire
  if (row.stripe_subscription_id) return false; // has active subscription
  return new Date(row.trial_ends_at).getTime() < Date.now();
}

/**
 * Map a database row to TenantContext
 */
function mapTenantRow(row: any): TenantContext {
  return {
    tenantId: row.id,
    slug: row.slug,
    name: row.name,
    timezone: row.timezone || 'America/Mexico_City',
    plan: row.plan || 'free',
    config: {
      whatsappPhoneNumberId: row.whatsapp_phone_number_id,
      whatsappAccessToken: row.whatsapp_access_token,
      whatsappWebhookSecret: row.whatsapp_webhook_secret,
      whatsappBusinessId: row.whatsapp_business_id,
      googleCalendarId: row.google_calendar_id,
      googleServiceAccountEmail: row.google_service_account_email,
      googlePrivateKey: row.google_private_key,
      retellApiKey: row.retell_api_key,
      retellAgentId: row.retell_agent_id,
      retellPhoneNumber: row.retell_phone_number,
      logoUrl: row.logo_url,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      maxLeads: row.max_leads,
      maxTeamMembers: row.max_team_members,
      maxMessagesPerDay: row.max_messages_per_day,
    },
  };
}

/**
 * Clear the in-memory tenant cache (for testing)
 */
export function clearTenantCache(): void {
  tenantCache.clear();
}
