import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// USAGE TRACKING SERVICE - Tenant billing & limit enforcement
// ═══════════════════════════════════════════════════════════════════════════
// Tracks per-tenant metrics in usage_metrics table (YYYY-MM periods)
// Metrics: leads_count, messages_sent, emails_sent, sms_sent, api_calls, storage_mb
// ═══════════════════════════════════════════════════════════════════════════

const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free:       { leads_count: 50,    messages_sent: 500,   emails_sent: 100,   sms_sent: 20,   api_calls: 1000,   storage_mb: 100   },
  starter:    { leads_count: 500,   messages_sent: 5000,  emails_sent: 1000,  sms_sent: 200,  api_calls: 10000,  storage_mb: 1000  },
  pro:        { leads_count: 5000,  messages_sent: 50000, emails_sent: 10000, sms_sent: 2000, api_calls: 100000, storage_mb: 10000 },
  enterprise: { leads_count: -1,    messages_sent: -1,    emails_sent: -1,    sms_sent: -1,   api_calls: -1,     storage_mb: -1    },
};

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Increment a metric for current tenant/month. Uses read-then-upsert pattern. */
export async function incrementMetric(
  supabase: SupabaseService,
  metric: string,
  amount: number = 1
): Promise<boolean> {
  const tenantId = supabase.getTenantId();
  const period = getCurrentPeriod();

  const { data: existing } = await supabase.client
    .from('usage_metrics')
    .select('id, value')
    .eq('tenant_id', tenantId).eq('metric', metric).eq('period', period)
    .single();

  if (existing) {
    const { error } = await supabase.client
      .from('usage_metrics')
      .update({ value: existing.value + amount, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) { console.error('incrementMetric update error:', error.message); return false; }
  } else {
    const { error } = await supabase.client
      .from('usage_metrics')
      .insert({ tenant_id: tenantId, metric, value: amount, period });
    if (error) { console.error('incrementMetric insert error:', error.message); return false; }
  }
  return true;
}

/** Get all metrics for current tenant/period. Defaults to current month. */
export async function getUsage(
  supabase: SupabaseService,
  period?: string
): Promise<Record<string, number>> {
  const tenantId = supabase.getTenantId();
  const { data, error } = await supabase.client
    .from('usage_metrics')
    .select('metric, value')
    .eq('tenant_id', tenantId)
    .eq('period', period || getCurrentPeriod());

  if (error) { console.error('getUsage error:', error.message); return {}; }
  const usage: Record<string, number> = {};
  for (const row of data || []) usage[row.metric] = Number(row.value);
  return usage;
}

/** Get historical values for a metric across N months. */
export async function getUsageHistory(
  supabase: SupabaseService,
  metric: string,
  months: number = 6
): Promise<Array<{ period: string; value: number }>> {
  const tenantId = supabase.getTenantId();
  const now = new Date();
  const periods = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data, error } = await supabase.client
    .from('usage_metrics')
    .select('period, value')
    .eq('tenant_id', tenantId).eq('metric', metric)
    .in('period', periods)
    .order('period', { ascending: true });

  if (error) { console.error('getUsageHistory error:', error.message); return []; }
  return (data || []).map(r => ({ period: r.period, value: Number(r.value) }));
}

/** Check if a metric has exceeded its limit. */
export async function checkLimit(
  supabase: SupabaseService,
  metric: string,
  limit: number
): Promise<{ within_limit: boolean; current: number; limit: number; percentage: number }> {
  const usage = await getUsage(supabase);
  const current = usage[metric] || 0;
  const unlimited = limit === -1;
  return {
    within_limit: unlimited || current < limit,
    current,
    limit,
    percentage: unlimited ? 0 : Math.round((current / limit) * 100),
  };
}

/** Export plan limits for external use. */
export { PLAN_LIMITS };

/**
 * Check if tenant can perform an action based on plan limits.
 * Returns true if within limits, false if exceeded.
 * Enterprise plans (-1) are always unlimited.
 */
export async function checkPlanLimit(
  supabase: SupabaseService,
  metric: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const tenantId = supabase.getTenantId();
  const { data: tenant } = await supabase.client
    .from('tenants').select('plan').eq('id', tenantId).single();

  const plan = tenant?.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const limit = limits[metric];

  // Unlimited (-1) or unknown metric → allow
  if (limit === undefined || limit === -1) return { allowed: true, current: 0, limit: -1 };

  const usage = await getUsage(supabase);
  const current = usage[metric] || 0;
  return { allowed: current < limit, current, limit };
}

/**
 * Check message limit with cached result (avoids DB hit on every message).
 * Returns { allowed, current, limit, warning }.
 * warning=true when >80% used. allowed=false when exceeded.
 * Uses KV cache with 5min TTL to avoid hammering DB.
 */
export async function checkMessageLimit(
  supabase: SupabaseService,
  kv?: KVNamespace
): Promise<{ allowed: boolean; current: number; limit: number; warning: boolean; percentage: number }> {
  const tenantId = supabase.getTenantId();
  const period = getCurrentPeriod();
  const cacheKey = `msg_limit:${tenantId}:${period}`;

  // Try cache first (5 min TTL)
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json') as any;
      if (cached) return cached;
    } catch {}
  }

  const { allowed, current, limit } = await checkPlanLimit(supabase, 'messages_sent');
  const percentage = limit === -1 ? 0 : Math.round((current / limit) * 100);
  const result = { allowed, current, limit, warning: percentage >= 80, percentage };

  // Cache for 5 min
  if (kv) {
    try { await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 }); } catch {}
  }

  return result;
}

/** Get all current-month metrics with tenant plan limits. */
export async function getUsageSummary(
  supabase: SupabaseService
): Promise<Array<{ metric: string; current: number; limit: number; percentage: number }>> {
  const tenantId = supabase.getTenantId();
  const { data: tenant } = await supabase.client
    .from('tenants').select('plan').eq('id', tenantId).single();

  const limits = PLAN_LIMITS[tenant?.plan || 'free'] || PLAN_LIMITS.free;
  const usage = await getUsage(supabase);

  return Object.entries(limits).map(([metric, limit]) => {
    const current = usage[metric] || 0;
    const unlimited = limit === -1;
    return { metric, current, limit, percentage: unlimited ? 0 : Math.round((current / limit) * 100) };
  });
}
