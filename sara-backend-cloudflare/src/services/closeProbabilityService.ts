// ═══════════════════════════════════════════════════════════════════════════
// CLOSE PROBABILITY SERVICE - Probabilidad de Cierre
// Calculates and predicts close probability for leads using ML-like scoring
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LeadProbability {
  lead_id: string;
  lead_name: string;
  phone: string;
  current_stage: string;
  close_probability: number;       // 0-100
  confidence: 'low' | 'medium' | 'high';
  expected_close_date: string | null;
  factors: ProbabilityFactor[];
  recommendations: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  assigned_to: string | null;
  property_interest: string | null;
  estimated_value: number;
}

export interface ProbabilityFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;             // -100 to +100
  description: string;
}

export interface TeamProbabilities {
  generated_at: string;
  total_leads: number;
  high_probability: number;   // > 70%
  medium_probability: number; // 40-70%
  low_probability: number;    // < 40%
  expected_closes_30d: number;
  expected_revenue_30d: number;
  leads: LeadProbability[];
  by_vendor: Array<{
    vendor_id: string;
    vendor_name: string;
    leads: number;
    high_prob_count: number;
    expected_closes: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHTS AND THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_BASE_PROBABILITY: Record<string, number> = {
  'new': 5,
  'contacted': 10,
  'qualified': 25,
  'visit_scheduled': 40,
  'visited': 55,
  'negotiating': 70,
  'reserved': 90,
  'sold': 100,
  'delivered': 100,
  'lost': 0,
  'inactive': 0
};

const FACTOR_WEIGHTS = {
  // Positive factors
  HOT_TEMPERATURE: 15,
  HIGH_SCORE: 10,
  RECENT_ACTIVITY: 10,
  HAS_BUDGET: 8,
  MULTIPLE_VISITS: 12,
  ASKED_ABOUT_CREDIT: 10,
  QUICK_RESPONSE: 8,
  RETURNING_LEAD: 10,
  REFERRED: 15,

  // Negative factors
  COLD_TEMPERATURE: -15,
  LOW_SCORE: -10,
  NO_RECENT_ACTIVITY: -12,
  STALLED_IN_STAGE: -15,
  NO_RESPONSE: -20,
  OBJECTIONS_RAISED: -8,
  COMPETITOR_MENTION: -10,
  BUDGET_MISMATCH: -15
};

const DAYS_THRESHOLDS = {
  RECENT_ACTIVITY: 3,         // Days for "recent" activity
  STALLED_WARNING: 7,         // Days before stage is considered stalled
  STALLED_CRITICAL: 14        // Days before critically stalled
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CloseProbabilityService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATE PROBABILITY FOR SINGLE LEAD
  // ═══════════════════════════════════════════════════════════════════════════

  async calculateForLead(leadId: string): Promise<LeadProbability | null> {
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('*, appointments(*)')
      .eq('id', leadId)
      .single();

    if (!lead) return null;

    // Get team member name if assigned
    let assignedToName: string | null = null;
    if (lead.assigned_to) {
      const { data: member } = await this.supabase.client
        .from('team_members')
        .select('name')
        .eq('id', lead.assigned_to)
        .single();
      assignedToName = member?.name || null;
    }

    return this.calculateProbability(lead, assignedToName);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATE PROBABILITIES FOR ALL ACTIVE LEADS
  // ═══════════════════════════════════════════════════════════════════════════

  async calculateForAllLeads(limit: number = 100): Promise<TeamProbabilities> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get active leads
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*, appointments(*)')
      .not('status', 'in', '(lost,inactive,delivered)')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('updated_at', { ascending: false })
      .limit(limit);

    // Get team members
    const { data: members } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .eq('active', true);

    const memberMap = new Map(members?.map(m => [m.id, m.name]) || []);

    // Calculate probabilities
    const probabilities: LeadProbability[] = [];
    const vendorStats: Record<string, { leads: number; highProb: number; expectedCloses: number }> = {};

    for (const lead of leads || []) {
      const assignedToName = lead.assigned_to ? memberMap.get(lead.assigned_to) || null : null;
      const prob = this.calculateProbability(lead, assignedToName);
      probabilities.push(prob);

      // Track vendor stats
      if (lead.assigned_to) {
        if (!vendorStats[lead.assigned_to]) {
          vendorStats[lead.assigned_to] = { leads: 0, highProb: 0, expectedCloses: 0 };
        }
        vendorStats[lead.assigned_to].leads++;
        if (prob.close_probability >= 70) vendorStats[lead.assigned_to].highProb++;
        vendorStats[lead.assigned_to].expectedCloses += prob.close_probability / 100;
      }
    }

    // Sort by probability
    probabilities.sort((a, b) => b.close_probability - a.close_probability);

    // Calculate summary stats
    const highProb = probabilities.filter(p => p.close_probability >= 70).length;
    const mediumProb = probabilities.filter(p => p.close_probability >= 40 && p.close_probability < 70).length;
    const lowProb = probabilities.filter(p => p.close_probability < 40).length;

    const expectedCloses = probabilities.reduce((sum, p) => sum + (p.close_probability / 100), 0);
    const expectedRevenue = probabilities.reduce((sum, p) =>
      sum + (p.estimated_value * p.close_probability / 100), 0);

    // Build vendor summary
    const byVendor = Object.entries(vendorStats).map(([vendorId, stats]) => ({
      vendor_id: vendorId,
      vendor_name: memberMap.get(vendorId) || 'Desconocido',
      leads: stats.leads,
      high_prob_count: stats.highProb,
      expected_closes: Math.round(stats.expectedCloses * 10) / 10
    })).sort((a, b) => b.expected_closes - a.expected_closes);

    return {
      generated_at: new Date().toISOString(),
      total_leads: probabilities.length,
      high_probability: highProb,
      medium_probability: mediumProb,
      low_probability: lowProb,
      expected_closes_30d: Math.round(expectedCloses),
      expected_revenue_30d: Math.round(expectedRevenue),
      leads: probabilities.slice(0, 50),  // Top 50
      by_vendor: byVendor
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET HIGH PROBABILITY LEADS
  // ═══════════════════════════════════════════════════════════════════════════

  async getHighProbabilityLeads(threshold: number = 70): Promise<LeadProbability[]> {
    const all = await this.calculateForAllLeads(200);
    return all.leads.filter(l => l.close_probability >= threshold);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET AT-RISK LEADS (low probability that should be higher)
  // ═══════════════════════════════════════════════════════════════════════════

  async getAtRiskLeads(): Promise<LeadProbability[]> {
    const all = await this.calculateForAllLeads(200);
    return all.leads.filter(l =>
      l.risk_level === 'high' || l.risk_level === 'critical'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE PROBABILITY CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateProbability(lead: any, assignedToName: string | null): LeadProbability {
    const factors: ProbabilityFactor[] = [];
    const recommendations: string[] = [];

    // Base probability from stage
    const stage = this.normalizeStage(lead.status || 'new');
    let probability = STAGE_BASE_PROBABILITY[stage] || 5;

    // Factor 1: Temperature
    const temp = (lead.temperature || 'COLD').toUpperCase();
    if (temp === 'HOT') {
      probability += FACTOR_WEIGHTS.HOT_TEMPERATURE;
      factors.push({
        name: 'Temperatura HOT',
        impact: 'positive',
        weight: FACTOR_WEIGHTS.HOT_TEMPERATURE,
        description: 'Lead marcado como caliente'
      });
    } else if (temp === 'COLD') {
      probability += FACTOR_WEIGHTS.COLD_TEMPERATURE;
      factors.push({
        name: 'Temperatura COLD',
        impact: 'negative',
        weight: FACTOR_WEIGHTS.COLD_TEMPERATURE,
        description: 'Lead marcado como frío'
      });
      recommendations.push('Reactivar con oferta especial o nuevo desarrollo');
    }

    // Factor 2: Score
    const score = Number(lead.score) || 0;
    if (score >= 70) {
      probability += FACTOR_WEIGHTS.HIGH_SCORE;
      factors.push({
        name: 'Score alto',
        impact: 'positive',
        weight: FACTOR_WEIGHTS.HIGH_SCORE,
        description: `Score de ${score}/100`
      });
    } else if (score < 30) {
      probability += FACTOR_WEIGHTS.LOW_SCORE;
      factors.push({
        name: 'Score bajo',
        impact: 'negative',
        weight: FACTOR_WEIGHTS.LOW_SCORE,
        description: `Score de ${score}/100`
      });
      recommendations.push('Calificar mejor: verificar presupuesto y timing');
    }

    // Factor 3: Recent activity
    const lastActivity = lead.last_activity_at || lead.updated_at;
    const daysSinceActivity = lastActivity
      ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    if (daysSinceActivity <= DAYS_THRESHOLDS.RECENT_ACTIVITY) {
      probability += FACTOR_WEIGHTS.RECENT_ACTIVITY;
      factors.push({
        name: 'Actividad reciente',
        impact: 'positive',
        weight: FACTOR_WEIGHTS.RECENT_ACTIVITY,
        description: `Activo hace ${daysSinceActivity} día(s)`
      });
    } else if (daysSinceActivity > DAYS_THRESHOLDS.STALLED_WARNING) {
      probability += FACTOR_WEIGHTS.NO_RECENT_ACTIVITY;
      factors.push({
        name: 'Sin actividad reciente',
        impact: 'negative',
        weight: FACTOR_WEIGHTS.NO_RECENT_ACTIVITY,
        description: `${daysSinceActivity} días sin actividad`
      });
      recommendations.push(`Contactar urgente - ${daysSinceActivity} días sin respuesta`);
    }

    // Factor 4: Has budget info
    if (lead.budget && Number(lead.budget) > 0) {
      probability += FACTOR_WEIGHTS.HAS_BUDGET;
      factors.push({
        name: 'Presupuesto definido',
        impact: 'positive',
        weight: FACTOR_WEIGHTS.HAS_BUDGET,
        description: `Presupuesto: $${Number(lead.budget).toLocaleString()}`
      });
    }

    // Factor 5: Multiple visits
    const visits = (lead.appointments || []).filter((a: any) =>
      a.status === 'completed' || a.appointment_type === 'visit'
    ).length;
    if (visits >= 2) {
      probability += FACTOR_WEIGHTS.MULTIPLE_VISITS;
      factors.push({
        name: 'Múltiples visitas',
        impact: 'positive',
        weight: FACTOR_WEIGHTS.MULTIPLE_VISITS,
        description: `${visits} visitas realizadas`
      });
    }

    // Factor 6: Asked about credit (from conversation history or flags)
    if (lead.mortgage_interest || lead.asked_credit) {
      probability += FACTOR_WEIGHTS.ASKED_ABOUT_CREDIT;
      factors.push({
        name: 'Interés en crédito',
        impact: 'positive',
        weight: FACTOR_WEIGHTS.ASKED_ABOUT_CREDIT,
        description: 'Preguntó por financiamiento'
      });
    }

    // Factor 7: Stalled in stage
    const stageEntryDate = lead.stage_changed_at || lead.updated_at;
    const daysInStage = stageEntryDate
      ? Math.floor((Date.now() - new Date(stageEntryDate).getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    if (daysInStage > DAYS_THRESHOLDS.STALLED_CRITICAL && !['sold', 'delivered', 'lost'].includes(stage)) {
      probability += FACTOR_WEIGHTS.STALLED_IN_STAGE;
      factors.push({
        name: 'Estancado en etapa',
        impact: 'negative',
        weight: FACTOR_WEIGHTS.STALLED_IN_STAGE,
        description: `${daysInStage} días en etapa ${stage}`
      });
      recommendations.push(`Mover a siguiente etapa o cerrar - estancado ${daysInStage} días`);
    }

    // Factor 8: Source quality (referrals are higher quality)
    if (lead.source === 'referral' || lead.source === 'referido') {
      probability += FACTOR_WEIGHTS.REFERRED;
      factors.push({
        name: 'Lead referido',
        impact: 'positive',
        weight: FACTOR_WEIGHTS.REFERRED,
        description: 'Viene de referencia'
      });
    }

    // Clamp probability to 0-100
    probability = Math.max(0, Math.min(100, Math.round(probability)));

    // Determine confidence
    let confidence: 'low' | 'medium' | 'high' = 'medium';
    if (factors.length < 3) confidence = 'low';
    if (factors.length >= 5 && score >= 50) confidence = 'high';

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (probability < 40) riskLevel = 'medium';
    if (probability < 25 || daysSinceActivity > DAYS_THRESHOLDS.STALLED_CRITICAL) riskLevel = 'high';
    if (probability < 15 && daysSinceActivity > DAYS_THRESHOLDS.STALLED_CRITICAL) riskLevel = 'critical';

    // Expected close date
    let expectedCloseDate: string | null = null;
    if (probability >= 70) {
      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + Math.round((100 - probability) / 5));
      expectedCloseDate = closeDate.toISOString().split('T')[0];
    } else if (probability >= 40) {
      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + Math.round((100 - probability) / 3));
      expectedCloseDate = closeDate.toISOString().split('T')[0];
    }

    // Estimated value
    const estimatedValue = Number(lead.budget) || 2500000; // Default 2.5M

    return {
      lead_id: lead.id,
      lead_name: lead.name || 'Sin nombre',
      phone: lead.phone,
      current_stage: stage,
      close_probability: probability,
      confidence,
      expected_close_date: expectedCloseDate,
      factors: factors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
      recommendations,
      risk_level: riskLevel,
      assigned_to: assignedToName,
      property_interest: lead.property_interest || null,
      estimated_value: estimatedValue
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatForWhatsApp(data: TeamProbabilities): string {
    let msg = `📊 *PROBABILIDADES DE CIERRE*\n`;
    msg += `📅 ${new Date().toLocaleDateString('es-MX')}\n\n`;

    msg += `*Resumen:*\n`;
    msg += `• Total leads activos: ${data.total_leads}\n`;
    msg += `• 🟢 Alta prob (>70%): ${data.high_probability}\n`;
    msg += `• 🟡 Media prob (40-70%): ${data.medium_probability}\n`;
    msg += `• 🔴 Baja prob (<40%): ${data.low_probability}\n\n`;

    msg += `📈 *Proyección 30 días:*\n`;
    msg += `• Cierres esperados: ${data.expected_closes_30d}\n`;
    msg += `• Ingreso esperado: $${data.expected_revenue_30d.toLocaleString()}\n\n`;

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎯 *TOP 10 LEADS:*\n\n`;

    for (const lead of data.leads.slice(0, 10)) {
      const emoji = lead.close_probability >= 70 ? '🟢' :
                   lead.close_probability >= 40 ? '🟡' : '🔴';
      msg += `${emoji} *${lead.lead_name}*\n`;
      msg += `   Prob: ${lead.close_probability}% | ${lead.current_stage}\n`;
      if (lead.assigned_to) {
        msg += `   👤 ${lead.assigned_to}\n`;
      }
      if (lead.recommendations.length > 0) {
        msg += `   💡 ${lead.recommendations[0]}\n`;
      }
      msg += `\n`;
    }

    if (data.by_vendor.length > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `👥 *POR VENDEDOR:*\n\n`;
      for (const vendor of data.by_vendor.slice(0, 5)) {
        msg += `• ${vendor.vendor_name}: ${vendor.expected_closes} cierres esperados\n`;
      }
    }

    return msg;
  }

  formatLeadForWhatsApp(lead: LeadProbability): string {
    const emoji = lead.close_probability >= 70 ? '🟢' :
                 lead.close_probability >= 40 ? '🟡' : '🔴';

    let msg = `${emoji} *PROBABILIDAD DE CIERRE*\n\n`;
    msg += `👤 *${lead.lead_name}*\n`;
    msg += `📱 ${lead.phone}\n`;
    msg += `📍 Etapa: ${lead.current_stage}\n\n`;

    msg += `📊 *Probabilidad:* ${lead.close_probability}%\n`;
    msg += `🎯 *Confianza:* ${lead.confidence}\n`;
    if (lead.expected_close_date) {
      msg += `📅 *Cierre esperado:* ${lead.expected_close_date}\n`;
    }
    msg += `\n`;

    if (lead.factors.length > 0) {
      msg += `*Factores:*\n`;
      for (const factor of lead.factors.slice(0, 5)) {
        const icon = factor.impact === 'positive' ? '✅' : '❌';
        msg += `${icon} ${factor.name}\n`;
      }
      msg += `\n`;
    }

    if (lead.recommendations.length > 0) {
      msg += `💡 *Recomendaciones:*\n`;
      for (const rec of lead.recommendations) {
        msg += `• ${rec}\n`;
      }
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private normalizeStage(status: string): string {
    const normalized = status.toLowerCase().replace(/[_-]/g, '_');

    const stageMap: Record<string, string> = {
      'nuevo': 'new',
      'contactado': 'contacted',
      'calificado': 'qualified',
      'cita_agendada': 'visit_scheduled',
      'scheduled': 'visit_scheduled',
      'visitado': 'visited',
      'visit': 'visited',
      'negociando': 'negotiating',
      'negotiation': 'negotiating',
      'apartado': 'reserved',
      'reservado': 'reserved',
      'vendido': 'sold',
      'closed_won': 'sold',
      'entregado': 'delivered',
      'perdido': 'lost',
      'closed_lost': 'lost',
      'inactivo': 'inactive'
    };

    return stageMap[normalized] || normalized;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function formatProbabilityIcon(probability: number): string {
  if (probability >= 70) return '🟢';
  if (probability >= 40) return '🟡';
  return '🔴';
}
