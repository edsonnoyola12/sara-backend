// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE SERVICE - Sales Pipeline Intelligence
// Provides real-time pipeline metrics, forecasting, and at-risk detection
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PipelineStage {
  stage: string;
  count: number;
  value: number;
  avg_days_in_stage: number;
  conversion_rate: string;
}

export interface AtRiskLead {
  id: string;
  name: string;
  phone: string;
  stage: string;
  days_in_stage: number;
  last_contact: string | null;
  assigned_to_name: string | null;
  risk_reason: string;
  value: number;
}

export interface PipelineSummary {
  generated_at: string;
  timeframe_days: number;

  // Stage breakdown
  by_stage: {
    new: number;
    contacted: number;
    qualified: number;
    visit_scheduled: number;
    visited: number;
    negotiating: number;
    reserved: number;
    sold: number;
    lost: number;
  };

  // Values
  total_leads: number;
  total_pipeline_value: number;
  expected_revenue: number;

  // Rates
  overall_conversion_rate: string;
  stage_conversion_rates: {
    new_to_contacted: string;
    contacted_to_qualified: string;
    qualified_to_visited: string;
    visited_to_negotiating: string;
    negotiating_to_sold: string;
  };

  // Time metrics
  avg_days_to_close: number;
  avg_days_by_stage: Record<string, number>;

  // At-risk
  at_risk_leads: AtRiskLead[];
  at_risk_value: number;

  // Velocity
  leads_this_week: number;
  leads_last_week: number;
  velocity_change: string;

  // By vendor
  by_vendor: Array<{
    vendor_id: string;
    vendor_name: string;
    leads: number;
    pipeline_value: number;
    conversion_rate: string;
    at_risk: number;
  }>;

  // Forecast
  forecast: {
    expected_closes_this_month: number;
    expected_revenue_this_month: number;
    confidence: string;
  };
}

export interface LeadWithDetails {
  id: string;
  name: string;
  phone: string;
  status: string;
  budget: number | null;
  property_interest: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  last_contact: string | null;
  score: number | null;
  notes: any;
}

// Stage order for funnel
const STAGE_ORDER = [
  'new',
  'contacted',
  'qualified',
  'visit_scheduled',
  'visited',
  'negotiating',
  'reserved',
  'sold',
  'delivered'
];

const LOST_STAGES = ['lost', 'inactive', 'fallen', 'closed_lost'];

// Default property values by development (MXN)
const DEFAULT_PROPERTY_VALUES: Record<string, number> = {
  'monte verde': 2800000,
  'los encinos': 3100000,
  'distrito falco': 2950000,
  'miravalle': 2200000,
  'andes': 1800000,
  'villa campelo': 3500000,
  'villa galiano': 3200000,
  'colinas del padre': 2500000,
  'default': 2500000
};

// Probability weights by stage
const STAGE_PROBABILITIES: Record<string, number> = {
  'new': 0.05,
  'contacted': 0.10,
  'qualified': 0.20,
  'visit_scheduled': 0.30,
  'visited': 0.50,
  'negotiating': 0.70,
  'reserved': 0.90,
  'sold': 1.0,
  'delivered': 1.0
};

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PipelineService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get complete pipeline summary
   */
  async getPipelineSummary(timeframeDays: number = 90): Promise<PipelineSummary> {
    const now = new Date();
    const startDate = new Date(now.getTime() - timeframeDays * 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Fetch leads
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .gte('created_at', startDate.toISOString());

    // Fetch team members for names
    const { data: teamMembers } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .eq('active', true);

    const teamMap = new Map(teamMembers?.map(t => [t.id, t.name]) || []);

    if (!leads || leads.length === 0) {
      return this.getEmptyPipelineSummary(timeframeDays);
    }

    // Calculate stage counts
    const stageCounts: Record<string, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      visit_scheduled: 0,
      visited: 0,
      negotiating: 0,
      reserved: 0,
      sold: 0,
      lost: 0
    };

    // Calculate values and metrics
    let totalPipelineValue = 0;
    let expectedRevenue = 0;
    const stageValues: Record<string, number[]> = {};
    const stageDays: Record<string, number[]> = {};
    const vendorStats: Record<string, { leads: number; value: number; sold: number; at_risk: number }> = {};
    const atRiskLeads: AtRiskLead[] = [];

    for (const lead of leads) {
      const status = this.normalizeStatus(lead.status);
      const isLost = LOST_STAGES.includes(status);

      // Count by stage
      if (isLost) {
        stageCounts.lost++;
      } else if (stageCounts[status] !== undefined) {
        stageCounts[status]++;
      }

      // Calculate value
      const value = this.getLeadValue(lead);
      if (!isLost && status !== 'delivered') {
        totalPipelineValue += value;

        // Expected revenue (weighted by probability)
        const probability = STAGE_PROBABILITIES[status] || 0.1;
        expectedRevenue += value * probability;
      }

      // Track values by stage
      if (!stageValues[status]) stageValues[status] = [];
      stageValues[status].push(value);

      // Calculate days in current stage
      const daysInStage = this.getDaysInStage(lead);
      if (!stageDays[status]) stageDays[status] = [];
      stageDays[status].push(daysInStage);

      // Track vendor stats
      if (lead.assigned_to) {
        if (!vendorStats[lead.assigned_to]) {
          vendorStats[lead.assigned_to] = { leads: 0, value: 0, sold: 0, at_risk: 0 };
        }
        vendorStats[lead.assigned_to].leads++;
        vendorStats[lead.assigned_to].value += value;
        if (status === 'sold' || status === 'delivered') {
          vendorStats[lead.assigned_to].sold++;
        }
      }

      // Check if at-risk
      const riskReason = this.checkIfAtRisk(lead, daysInStage);
      if (riskReason && !isLost) {
        const atRiskLead: AtRiskLead = {
          id: lead.id,
          name: lead.name || 'Sin nombre',
          phone: lead.phone,
          stage: status,
          days_in_stage: daysInStage,
          last_contact: lead.last_contact,
          assigned_to_name: lead.assigned_to ? teamMap.get(lead.assigned_to) || null : null,
          risk_reason: riskReason,
          value
        };
        atRiskLeads.push(atRiskLead);

        if (lead.assigned_to && vendorStats[lead.assigned_to]) {
          vendorStats[lead.assigned_to].at_risk++;
        }
      }
    }

    // Calculate conversion rates
    const conversionRates = this.calculateConversionRates(stageCounts);

    // Calculate avg days by stage
    const avgDaysByStage: Record<string, number> = {};
    for (const [stage, days] of Object.entries(stageDays)) {
      if (days.length > 0) {
        avgDaysByStage[stage] = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
      }
    }

    // Calculate velocity
    const leadsThisWeek = leads.filter(l => new Date(l.created_at) >= weekAgo).length;
    const leadsLastWeek = leads.filter(l => {
      const d = new Date(l.created_at);
      return d >= twoWeeksAgo && d < weekAgo;
    }).length;

    const velocityChange = leadsLastWeek > 0
      ? (((leadsThisWeek - leadsLastWeek) / leadsLastWeek) * 100).toFixed(1) + '%'
      : '+100%';

    // Build vendor summary
    const byVendor = Object.entries(vendorStats).map(([vendorId, stats]) => ({
      vendor_id: vendorId,
      vendor_name: teamMap.get(vendorId) || 'Desconocido',
      leads: stats.leads,
      pipeline_value: stats.value,
      conversion_rate: stats.leads > 0
        ? ((stats.sold / stats.leads) * 100).toFixed(1) + '%'
        : '0%',
      at_risk: stats.at_risk
    })).sort((a, b) => b.pipeline_value - a.pipeline_value);

    // Calculate forecast
    const forecast = this.calculateForecast(leads, stageCounts);

    // Calculate avg days to close
    const closedLeads = leads.filter(l =>
      l.status === 'sold' || l.status === 'delivered' || l.status === 'closed_won'
    );
    let avgDaysToClose = 0;
    if (closedLeads.length > 0) {
      const totalDays = closedLeads.reduce((acc, l) => {
        const created = new Date(l.created_at).getTime();
        const closed = new Date(l.updated_at || l.created_at).getTime();
        return acc + Math.round((closed - created) / (24 * 60 * 60 * 1000));
      }, 0);
      avgDaysToClose = Math.round(totalDays / closedLeads.length);
    }

    // Calculate at-risk total value
    const atRiskValue = atRiskLeads.reduce((acc, l) => acc + l.value, 0);

    // Overall conversion rate
    const totalClosed = stageCounts.sold + (leads.filter(l => l.status === 'delivered').length);
    const overallConversionRate = leads.length > 0
      ? ((totalClosed / leads.length) * 100).toFixed(1) + '%'
      : '0%';

    return {
      generated_at: now.toISOString(),
      timeframe_days: timeframeDays,
      by_stage: stageCounts as any,
      total_leads: leads.length,
      total_pipeline_value: totalPipelineValue,
      expected_revenue: Math.round(expectedRevenue),
      overall_conversion_rate: overallConversionRate,
      stage_conversion_rates: conversionRates,
      avg_days_to_close: avgDaysToClose,
      avg_days_by_stage: avgDaysByStage,
      at_risk_leads: atRiskLeads.slice(0, 20), // Top 20
      at_risk_value: atRiskValue,
      leads_this_week: leadsThisWeek,
      leads_last_week: leadsLastWeek,
      velocity_change: velocityChange,
      by_vendor: byVendor,
      forecast
    };
  }

  /**
   * Get leads at risk of being lost
   */
  async getAtRiskLeads(limit: number = 20): Promise<AtRiskLead[]> {
    const summary = await this.getPipelineSummary(90);
    return summary.at_risk_leads.slice(0, limit);
  }

  /**
   * Get pipeline by stage with details
   */
  async getPipelineByStage(): Promise<PipelineStage[]> {
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('status, budget, property_interest, created_at, updated_at')
      .not('status', 'in', `(${LOST_STAGES.join(',')})`);

    if (!leads) return [];

    const stageData: Record<string, { count: number; value: number; days: number[] }> = {};

    for (const lead of leads) {
      const status = this.normalizeStatus(lead.status);
      if (!stageData[status]) {
        stageData[status] = { count: 0, value: 0, days: [] };
      }
      stageData[status].count++;
      stageData[status].value += this.getLeadValue(lead);
      stageData[status].days.push(this.getDaysInStage(lead));
    }

    const totalLeads = leads.length;

    return STAGE_ORDER
      .filter(stage => stageData[stage])
      .map(stage => {
        const data = stageData[stage];
        const avgDays = data.days.length > 0
          ? Math.round(data.days.reduce((a, b) => a + b, 0) / data.days.length)
          : 0;

        return {
          stage,
          count: data.count,
          value: data.value,
          avg_days_in_stage: avgDays,
          conversion_rate: totalLeads > 0
            ? ((data.count / totalLeads) * 100).toFixed(1) + '%'
            : '0%'
        };
      });
  }

  /**
   * Get forecast for current month
   */
  async getMonthlyForecast(): Promise<{
    expected_closes: number;
    expected_revenue: number;
    high_probability_leads: Array<{ name: string; value: number; probability: number }>;
    confidence: string;
  }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysRemaining = Math.max(1, Math.ceil((monthEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .in('status', ['visited', 'negotiating', 'reserved'])
      .gte('updated_at', monthStart.toISOString());

    if (!leads || leads.length === 0) {
      return {
        expected_closes: 0,
        expected_revenue: 0,
        high_probability_leads: [],
        confidence: 'low'
      };
    }

    let expectedCloses = 0;
    let expectedRevenue = 0;
    const highProbLeads: Array<{ name: string; value: number; probability: number }> = [];

    for (const lead of leads) {
      const status = this.normalizeStatus(lead.status);
      const probability = STAGE_PROBABILITIES[status] || 0;
      const value = this.getLeadValue(lead);

      // Adjust probability based on time remaining in month
      const adjustedProb = Math.min(probability * (daysRemaining / 15), probability);

      expectedCloses += adjustedProb;
      expectedRevenue += value * adjustedProb;

      if (probability >= 0.5) {
        highProbLeads.push({
          name: lead.name || 'Sin nombre',
          value,
          probability: Math.round(probability * 100)
        });
      }
    }

    // Determine confidence
    let confidence = 'medium';
    if (leads.length < 5) confidence = 'low';
    if (leads.length >= 10 && highProbLeads.length >= 3) confidence = 'high';

    return {
      expected_closes: Math.round(expectedCloses),
      expected_revenue: Math.round(expectedRevenue),
      high_probability_leads: highProbLeads.sort((a, b) => b.probability - a.probability).slice(0, 10),
      confidence
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private normalizeStatus(status: string | null): string {
    if (!status) return 'new';
    const s = status.toLowerCase().trim();

    // Map various status names to standard stages
    const statusMap: Record<string, string> = {
      'nuevo': 'new',
      'contactado': 'contacted',
      'calificado': 'qualified',
      'cita_agendada': 'visit_scheduled',
      'scheduled': 'visit_scheduled',
      'cita_realizada': 'visited',
      'visited': 'visited',
      'negociacion': 'negotiating',
      'negotiation': 'negotiating',
      'apartado': 'reserved',
      'reserved': 'reserved',
      'ganado': 'sold',
      'closed_won': 'sold',
      'sold': 'sold',
      'entregado': 'delivered',
      'delivered': 'delivered',
      'perdido': 'lost',
      'lost': 'lost',
      'caido': 'lost',
      'fallen': 'lost',
      'closed_lost': 'lost',
      'inactive': 'lost'
    };

    return statusMap[s] || s;
  }

  private getLeadValue(lead: any): number {
    // Use budget if available (convert to number to ensure proper arithmetic)
    if (lead.budget && Number(lead.budget) > 0) {
      return Number(lead.budget);
    }

    // Otherwise estimate from property interest
    if (lead.property_interest) {
      const interest = lead.property_interest.toLowerCase();
      for (const [development, value] of Object.entries(DEFAULT_PROPERTY_VALUES)) {
        if (interest.includes(development)) {
          return value;
        }
      }
    }

    return DEFAULT_PROPERTY_VALUES.default;
  }

  private getDaysInStage(lead: any): number {
    const updated = new Date(lead.updated_at || lead.created_at);
    const now = new Date();
    return Math.floor((now.getTime() - updated.getTime()) / (24 * 60 * 60 * 1000));
  }

  private checkIfAtRisk(lead: any, daysInStage: number): string | null {
    const status = this.normalizeStatus(lead.status);

    // Check days without movement
    const riskThresholds: Record<string, number> = {
      'new': 3,
      'contacted': 7,
      'qualified': 10,
      'visit_scheduled': 5,
      'visited': 14,
      'negotiating': 21,
      'reserved': 30
    };

    const threshold = riskThresholds[status];
    if (threshold && daysInStage > threshold) {
      return `${daysInStage} dias en etapa "${status}" (limite: ${threshold})`;
    }

    // Check last contact
    if (lead.last_contact) {
      const daysSinceContact = Math.floor(
        (Date.now() - new Date(lead.last_contact).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysSinceContact > 7 && status !== 'sold' && status !== 'delivered') {
        return `${daysSinceContact} dias sin contacto`;
      }
    }

    // Check score
    if (lead.score !== null && lead.score < 30 && status !== 'new') {
      return `Score bajo (${lead.score})`;
    }

    return null;
  }

  private calculateConversionRates(stageCounts: Record<string, number>): {
    new_to_contacted: string;
    contacted_to_qualified: string;
    qualified_to_visited: string;
    visited_to_negotiating: string;
    negotiating_to_sold: string;
  } {
    const safeRate = (from: number, to: number) => {
      if (from === 0) return '0%';
      return ((to / from) * 100).toFixed(1) + '%';
    };

    const contacted = stageCounts.contacted + stageCounts.qualified + stageCounts.visit_scheduled +
                      stageCounts.visited + stageCounts.negotiating + stageCounts.reserved + stageCounts.sold;
    const qualified = stageCounts.qualified + stageCounts.visit_scheduled + stageCounts.visited +
                      stageCounts.negotiating + stageCounts.reserved + stageCounts.sold;
    const visited = stageCounts.visited + stageCounts.negotiating + stageCounts.reserved + stageCounts.sold;
    const negotiating = stageCounts.negotiating + stageCounts.reserved + stageCounts.sold;
    const sold = stageCounts.sold;

    return {
      new_to_contacted: safeRate(stageCounts.new + contacted, contacted),
      contacted_to_qualified: safeRate(stageCounts.contacted + qualified, qualified),
      qualified_to_visited: safeRate(stageCounts.qualified + stageCounts.visit_scheduled + visited, visited),
      visited_to_negotiating: safeRate(stageCounts.visited + negotiating, negotiating),
      negotiating_to_sold: safeRate(stageCounts.negotiating + sold, sold)
    };
  }

  private calculateForecast(leads: any[], stageCounts: Record<string, number>): {
    expected_closes_this_month: number;
    expected_revenue_this_month: number;
    confidence: string;
  } {
    const now = new Date();
    const daysRemainingInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

    // Base on historical conversion rate and current pipeline
    const activeLeads = leads.filter(l => !LOST_STAGES.includes(this.normalizeStatus(l.status)));

    let expectedCloses = 0;
    let expectedRevenue = 0;

    for (const lead of activeLeads) {
      const status = this.normalizeStatus(lead.status);
      const probability = STAGE_PROBABILITIES[status] || 0;
      const value = this.getLeadValue(lead);

      // Adjust for time remaining - only count if likely to close this month
      const adjustedProb = status === 'reserved' ? probability :
                           status === 'negotiating' ? probability * 0.7 :
                           status === 'visited' ? probability * 0.3 : 0;

      expectedCloses += adjustedProb;
      expectedRevenue += value * adjustedProb;
    }

    // Determine confidence based on data quality
    let confidence = 'medium';
    if (activeLeads.length < 10) confidence = 'low';
    if (activeLeads.length >= 20 && stageCounts.negotiating >= 3) confidence = 'high';

    return {
      expected_closes_this_month: Math.round(expectedCloses),
      expected_revenue_this_month: Math.round(expectedRevenue),
      confidence
    };
  }

  private getEmptyPipelineSummary(timeframeDays: number): PipelineSummary {
    return {
      generated_at: new Date().toISOString(),
      timeframe_days: timeframeDays,
      by_stage: {
        new: 0,
        contacted: 0,
        qualified: 0,
        visit_scheduled: 0,
        visited: 0,
        negotiating: 0,
        reserved: 0,
        sold: 0,
        lost: 0
      },
      total_leads: 0,
      total_pipeline_value: 0,
      expected_revenue: 0,
      overall_conversion_rate: '0%',
      stage_conversion_rates: {
        new_to_contacted: '0%',
        contacted_to_qualified: '0%',
        qualified_to_visited: '0%',
        visited_to_negotiating: '0%',
        negotiating_to_sold: '0%'
      },
      avg_days_to_close: 0,
      avg_days_by_stage: {},
      at_risk_leads: [],
      at_risk_value: 0,
      leads_this_week: 0,
      leads_last_week: 0,
      velocity_change: '0%',
      by_vendor: [],
      forecast: {
        expected_closes_this_month: 0,
        expected_revenue_this_month: 0,
        confidence: 'low'
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatPipelineForWhatsApp(summary: PipelineSummary): string {
  const lines = [
    `📊 *PIPELINE DE VENTAS*`,
    `📅 Últimos ${summary.timeframe_days} días`,
    ``,
    `*Por Etapa:*`,
    `• Nuevos: ${summary.by_stage.new}`,
    `• Contactados: ${summary.by_stage.contacted}`,
    `• Calificados: ${summary.by_stage.qualified}`,
    `• Visita agendada: ${summary.by_stage.visit_scheduled}`,
    `• Visitados: ${summary.by_stage.visited}`,
    `• Negociando: ${summary.by_stage.negotiating}`,
    `• Apartados: ${summary.by_stage.reserved}`,
    `• Vendidos: ${summary.by_stage.sold}`,
    ``,
    `💰 *Valor Pipeline:* ${formatCurrency(summary.total_pipeline_value)}`,
    `📈 *Ingreso Esperado:* ${formatCurrency(summary.expected_revenue)}`,
    `✅ *Tasa de Cierre:* ${summary.overall_conversion_rate}`,
    `⏱️ *Días promedio cierre:* ${summary.avg_days_to_close}`,
    ``
  ];

  if (summary.at_risk_leads.length > 0) {
    lines.push(`⚠️ *En Riesgo (${summary.at_risk_leads.length}):*`);
    for (const lead of summary.at_risk_leads.slice(0, 5)) {
      lines.push(`• ${lead.name} - ${lead.risk_reason}`);
    }
    lines.push(``);
  }

  if (summary.forecast.expected_closes_this_month > 0) {
    lines.push(`🔮 *Pronóstico Mes:*`);
    lines.push(`• Cierres esperados: ${summary.forecast.expected_closes_this_month}`);
    lines.push(`• Ingreso esperado: ${formatCurrency(summary.forecast.expected_revenue_this_month)}`);
    lines.push(`• Confianza: ${summary.forecast.confidence}`);
  }

  return lines.join('\n');
}
