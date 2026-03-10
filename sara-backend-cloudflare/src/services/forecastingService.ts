// ═══════════════════════════════════════════════════════════════════════════
// FORECASTING SERVICE - Pipeline Revenue Forecasting
// Calculates weighted revenue forecasts based on current pipeline status
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ForecastResult {
  total_pipeline_value: number;
  weighted_forecast: number;
  by_status: ForecastByStatus[];
  by_development: ForecastByDevelopment[];
  monthly_projection: MonthlyProjection[];
  confidence: 'low' | 'medium' | 'high';
  generated_at: string;
}

export interface ForecastByStatus {
  status: string;
  count: number;
  total_value: number;
  weight: number;
  weighted_value: number;
}

export interface ForecastByDevelopment {
  development: string;
  count: number;
  total_value: number;
  weighted_value: number;
}

export interface MonthlyProjection {
  month: string;       // YYYY-MM
  projected_revenue: number;
  projected_deals: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_WEIGHTS: Record<string, number> = {
  new: 0.05,
  contacted: 0.10,
  qualified: 0.20,
  scheduled: 0.30,
  visited: 0.50,
  negotiation: 0.70,
  reserved: 0.90,
  closed: 1.0,
  delivered: 1.0,
  lost: 0,
  inactive: 0,
};

// Aliases used across the codebase
const STATUS_ALIASES: Record<string, string> = {
  visit_scheduled: 'scheduled',
  negotiating: 'negotiation',
  sold: 'closed',
};

const ACTIVE_STATUSES = ['new', 'contacted', 'qualified', 'scheduled', 'visit_scheduled', 'visited', 'negotiation', 'negotiating', 'reserved', 'closed', 'sold', 'delivered'];

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the normalized status and its weight
 */
function getStatusWeight(status: string): number {
  const normalized = STATUS_ALIASES[status] || status;
  return STATUS_WEIGHTS[normalized] ?? 0;
}

/**
 * Pure function: estimate value of a lead based on property_interest.
 * Looks up price from properties array, returns midpoint of price_min/price_max.
 */
export function getLeadPropertyValue(lead: any, properties: any[]): number {
  const interest = (lead.property_interest || '').toLowerCase().trim();
  if (!interest) return 0;

  const match = properties.find((p: any) =>
    interest.includes((p.name || '').toLowerCase()) ||
    (p.name || '').toLowerCase().includes(interest)
  );

  if (match && (match.price_min || match.price_max)) {
    const min = match.price_min || match.price_max || 0;
    const max = match.price_max || match.price_min || 0;
    return (min + max) / 2;
  }

  // Fallback: use lead budget if available
  return lead.budget || 0;
}

/**
 * Calculate historical conversion rates from leads table.
 * Returns the ratio of leads that moved past each stage.
 */
export async function getConversionRates(supabase: SupabaseService): Promise<Record<string, number>> {
  const { data: leads } = await supabase.client
    .from('leads')
    .select('status')
    .in('status', ACTIVE_STATUSES);

  const all = leads || [];
  const total = all.length || 1;

  const stageCounts: Record<string, number> = {};
  for (const lead of all) {
    const normalized = STATUS_ALIASES[lead.status] || lead.status;
    stageCounts[normalized] = (stageCounts[normalized] || 0) + 1;
  }

  // Conversion rate = leads at or past a stage / total leads
  const orderedStages = ['contacted', 'qualified', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed', 'delivered'];
  const rates: Record<string, number> = {};
  let cumulative = 0;

  for (const stage of [...orderedStages].reverse()) {
    cumulative += stageCounts[stage] || 0;
    rates[stage] = cumulative / total;
  }

  return rates;
}

/**
 * Main forecast function. Queries leads with properties for price data
 * and calculates pipeline revenue forecasts.
 */
export async function generateForecast(supabase: SupabaseService): Promise<ForecastResult> {
  // Fetch leads and properties in parallel
  const [{ data: leads }, { data: properties }] = await Promise.all([
    supabase.client.from('leads').select('id, name, status, property_interest, budget, created_at').in('status', ACTIVE_STATUSES),
    supabase.client.from('properties').select('id, name, price_min, price_max').order('name'),
  ]);

  const allLeads = leads || [];
  const allProperties = properties || [];

  // --- By Status ---
  const statusMap: Record<string, { count: number; total_value: number; weighted_value: number }> = {};
  let totalPipelineValue = 0;
  let weightedForecast = 0;

  for (const lead of allLeads) {
    const normalized = STATUS_ALIASES[lead.status] || lead.status;
    const weight = getStatusWeight(lead.status);
    const value = getLeadPropertyValue(lead, allProperties);

    if (!statusMap[normalized]) {
      statusMap[normalized] = { count: 0, total_value: 0, weighted_value: 0 };
    }
    statusMap[normalized].count += 1;
    statusMap[normalized].total_value += value;
    statusMap[normalized].weighted_value += value * weight;

    totalPipelineValue += value;
    weightedForecast += value * weight;
  }

  const by_status: ForecastByStatus[] = Object.entries(statusMap).map(([status, data]) => ({
    status,
    count: data.count,
    total_value: data.total_value,
    weight: STATUS_WEIGHTS[status] ?? 0,
    weighted_value: data.weighted_value,
  }));

  // --- By Development ---
  const devMap: Record<string, { count: number; total_value: number; weighted_value: number }> = {};

  for (const lead of allLeads) {
    const dev = (lead.property_interest || 'Sin desarrollo').trim();
    const weight = getStatusWeight(lead.status);
    const value = getLeadPropertyValue(lead, allProperties);

    if (!devMap[dev]) {
      devMap[dev] = { count: 0, total_value: 0, weighted_value: 0 };
    }
    devMap[dev].count += 1;
    devMap[dev].total_value += value;
    devMap[dev].weighted_value += value * weight;
  }

  const by_development: ForecastByDevelopment[] = Object.entries(devMap)
    .map(([development, data]) => ({
      development,
      count: data.count,
      total_value: data.total_value,
      weighted_value: data.weighted_value,
    }))
    .sort((a, b) => b.weighted_value - a.weighted_value);

  // --- Monthly Projection (next 3 months) ---
  const conversionRates = await getConversionRates(supabase);
  const closeRate = conversionRates['closed'] || 0.05;
  const activeLeads = allLeads.filter(l => {
    const n = STATUS_ALIASES[l.status] || l.status;
    return !['closed', 'delivered', 'lost', 'inactive'].includes(n);
  });
  const avgDealValue = activeLeads.length > 0
    ? activeLeads.reduce((sum, l) => sum + getLeadPropertyValue(l, allProperties), 0) / activeLeads.length
    : 0;

  const monthly_projection: MonthlyProjection[] = [];
  const now = new Date();
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // Projected deals = active leads * close rate, spread across 3 months
    const projectedDeals = Math.round(activeLeads.length * closeRate / 3);
    monthly_projection.push({
      month,
      projected_revenue: Math.round(projectedDeals * avgDealValue),
      projected_deals: projectedDeals,
    });
  }

  // --- Confidence ---
  const totalActive = allLeads.length;
  const confidence: 'low' | 'medium' | 'high' = totalActive >= 20
    ? 'high'
    : totalActive >= 10
      ? 'medium'
      : 'low';

  return {
    total_pipeline_value: Math.round(totalPipelineValue),
    weighted_forecast: Math.round(weightedForecast),
    by_status,
    by_development,
    monthly_projection,
    confidence,
    generated_at: new Date().toISOString(),
  };
}
