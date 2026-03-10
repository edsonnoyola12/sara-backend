// ═══════════════════════════════════════════════════════════════════════════
// FUNNEL VELOCITY SERVICE - Velocidad y cuellos de botella del funnel
// ═══════════════════════════════════════════════════════════════════════════
// Mide tiempos promedio por etapa, identifica cuellos de botella,
// compara velocidad entre vendedores y genera reportes para WhatsApp
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface StageVelocity {
  stage: string;
  avgDaysInStage: number;
  medianDaysInStage: number;
  leadsCurrentlyInStage: number;
  conversionRateToNext: number; // percentage
}

export interface VelocityReport {
  period: string;
  stages: StageVelocity[];
  overallAvgDaysToClose: number;
  bottleneckStage: string;
  fastestVendedor: { name: string; avgDays: number } | null;
  slowestVendedor: { name: string; avgDays: number } | null;
}

interface StageTransition {
  from: string;
  to: string;
  timestamp: string;
  triggeredBy?: string;
}

// Canonical funnel order
const FUNNEL_STAGES = [
  'new',
  'contacted',
  'scheduled',
  'visited',
  'negotiation',
  'reserved',
  'closed',
  'delivered',
];

// Map aliases to canonical names
const STAGE_ALIASES: Record<string, string> = {
  visit_scheduled: 'scheduled',
  qualified: 'contacted',
  negotiating: 'negotiation',
  sold: 'closed',
};

function canonicalStage(stage: string): string {
  return STAGE_ALIASES[stage] || stage;
}

// Stage display names for report
const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  scheduled: 'Scheduled',
  visited: 'Visited',
  negotiation: 'Negotiation',
  reserved: 'Reserved',
  closed: 'Closed',
  delivered: 'Delivered',
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / msPerDay;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function periodStartDate(period: 'week' | 'month' | 'quarter'): Date {
  const now = new Date();
  switch (period) {
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'quarter':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

function periodLabel(period: 'week' | 'month' | 'quarter'): string {
  switch (period) {
    case 'week': return 'Última semana';
    case 'month': return 'Último mes';
    case 'quarter': return 'Último trimestre';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class FunnelVelocityService {
  constructor(private supabase: SupabaseService) {}

  // ─────────────────────────────────────────────────────────────────────
  // Record a stage transition (call on every status change)
  // ─────────────────────────────────────────────────────────────────────
  async recordTransition(
    leadId: string,
    fromStatus: string,
    toStatus: string,
    triggeredBy: string
  ): Promise<void> {
    try {
      // Fresh read to avoid JSONB race condition
      const lead = await this.supabase.getLeadById(leadId);
      if (!lead) {
        console.error(`⚠️ FunnelVelocity: lead ${leadId} not found`);
        return;
      }

      const notes = lead.notes || {};
      const transitions: StageTransition[] = notes.stage_transitions || [];

      transitions.push({
        from: canonicalStage(fromStatus),
        to: canonicalStage(toStatus),
        timestamp: new Date().toISOString(),
        triggeredBy,
      });

      // Keep last 50 transitions max
      const trimmed = transitions.slice(-50);

      await this.supabase.updateLead(leadId, {
        notes: { ...notes, stage_transitions: trimmed },
      });
    } catch (err: any) {
      console.error('⚠️ FunnelVelocity recordTransition error:', err?.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Calculate velocity metrics for a period
  // ─────────────────────────────────────────────────────────────────────
  async calculateVelocity(period: 'week' | 'month' | 'quarter'): Promise<VelocityReport> {
    const startDate = periodStartDate(period);

    // Fetch leads updated/created in the period
    const { data: leads, error } = await this.supabase.client
      .from('leads')
      .select('id, name, status, assigned_to, created_at, updated_at, notes')
      .gte('updated_at', startDate.toISOString());

    if (error) {
      console.error('⚠️ FunnelVelocity query error:', error.message);
    }

    const allLeads = leads || [];

    // Fetch team members for vendor names
    const { data: teamMembers } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .eq('active', true);

    const teamMap = new Map<string, string>(
      (teamMembers || []).map((t: any) => [t.id, t.name])
    );

    // ── Collect time-in-stage data ──
    // Map: stage → array of durations (days)
    const stageDurations: Record<string, number[]> = {};
    // Map: stage → number of leads currently in it
    const stageCounts: Record<string, number> = {};
    // Map: stage → { advanced: number, total: number } for conversion
    const stageConversions: Record<string, { advanced: number; total: number }> = {};
    // Map: vendorId → total days new→closed
    const vendorCloseDays: Record<string, number[]> = {};

    for (const stage of FUNNEL_STAGES) {
      stageDurations[stage] = [];
      stageCounts[stage] = 0;
      stageConversions[stage] = { advanced: 0, total: 0 };
    }

    const closeDays: number[] = [];

    for (const lead of allLeads) {
      const status = canonicalStage(lead.status || 'new');

      // Count current stage
      if (stageCounts[status] !== undefined) {
        stageCounts[status]++;
      }

      const transitions: StageTransition[] = lead.notes?.stage_transitions || [];

      if (transitions.length > 0) {
        // Use recorded transitions
        for (let i = 0; i < transitions.length; i++) {
          const t = transitions[i];
          const fromStage = canonicalStage(t.from);
          const toStage = canonicalStage(t.to);

          // Calculate time in fromStage
          const prevTimestamp = i > 0 ? transitions[i - 1].timestamp : lead.created_at;
          const daysInStage = daysBetween(prevTimestamp, t.timestamp);

          if (stageDurations[fromStage]) {
            stageDurations[fromStage].push(daysInStage);
          }

          // Track conversion from→to
          if (stageConversions[fromStage]) {
            stageConversions[fromStage].total++;
            // Check if it advanced (index of to > index of from)
            const fromIdx = FUNNEL_STAGES.indexOf(fromStage);
            const toIdx = FUNNEL_STAGES.indexOf(toStage);
            if (toIdx > fromIdx) {
              stageConversions[fromStage].advanced++;
            }
          }
        }

        // Total days to close if lead is closed/delivered
        if (status === 'closed' || status === 'delivered') {
          const lastTransition = transitions[transitions.length - 1];
          const totalDays = daysBetween(lead.created_at, lastTransition.timestamp);
          closeDays.push(totalDays);

          if (lead.assigned_to) {
            if (!vendorCloseDays[lead.assigned_to]) vendorCloseDays[lead.assigned_to] = [];
            vendorCloseDays[lead.assigned_to].push(totalDays);
          }
        }
      } else {
        // No transitions recorded — approximate from created_at / updated_at
        const daysExisting = daysBetween(lead.created_at, lead.updated_at || new Date().toISOString());

        if (status !== 'new' && stageDurations[status]) {
          stageDurations[status].push(daysExisting);
        }

        // Count for conversion (all non-lost leads that moved past 'new' count as converted from new)
        const statusIdx = FUNNEL_STAGES.indexOf(status);
        if (statusIdx > 0) {
          stageConversions['new'].total++;
          stageConversions['new'].advanced++;
        } else if (statusIdx === 0) {
          stageConversions['new'].total++;
        }

        if (status === 'closed' || status === 'delivered') {
          closeDays.push(daysExisting);
          if (lead.assigned_to) {
            if (!vendorCloseDays[lead.assigned_to]) vendorCloseDays[lead.assigned_to] = [];
            vendorCloseDays[lead.assigned_to].push(daysExisting);
          }
        }
      }
    }

    // ── Build stage velocities ──
    const stages: StageVelocity[] = FUNNEL_STAGES.map((stage) => {
      const durations = stageDurations[stage];
      const conv = stageConversions[stage];
      const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
      const med = median(durations);
      const convRate = conv.total > 0 ? (conv.advanced / conv.total) * 100 : 0;

      return {
        stage,
        avgDaysInStage: Math.round(avg * 10) / 10,
        medianDaysInStage: Math.round(med * 10) / 10,
        leadsCurrentlyInStage: stageCounts[stage] || 0,
        conversionRateToNext: Math.round(convRate),
      };
    });

    // ── Find bottleneck (longest avg, exclude delivered) ──
    const activeStages = stages.filter(
      (s) => s.stage !== 'delivered' && s.stage !== 'closed' && s.avgDaysInStage > 0
    );
    const bottleneck = activeStages.length > 0
      ? activeStages.reduce((max, s) => (s.avgDaysInStage > max.avgDaysInStage ? s : max)).stage
      : 'N/A';

    // ── Overall avg days to close ──
    const overallAvg = closeDays.length > 0
      ? Math.round((closeDays.reduce((a, b) => a + b, 0) / closeDays.length) * 10) / 10
      : 0;

    // ── Fastest / slowest vendedor ──
    let fastestVendedor: { name: string; avgDays: number } | null = null;
    let slowestVendedor: { name: string; avgDays: number } | null = null;

    const vendorAvgs = Object.entries(vendorCloseDays)
      .filter(([, days]) => days.length > 0)
      .map(([vendorId, days]) => ({
        name: teamMap.get(vendorId) || vendorId,
        avgDays: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
      }))
      .sort((a, b) => a.avgDays - b.avgDays);

    if (vendorAvgs.length > 0) {
      fastestVendedor = vendorAvgs[0];
      slowestVendedor = vendorAvgs[vendorAvgs.length - 1];
      // Don't show same person as both
      if (vendorAvgs.length === 1) slowestVendedor = null;
    }

    return {
      period: periodLabel(period),
      stages,
      overallAvgDaysToClose: overallAvg,
      bottleneckStage: bottleneck,
      fastestVendedor,
      slowestVendedor,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Format velocity report for WhatsApp
  // ─────────────────────────────────────────────────────────────────────
  formatVelocityReport(report: VelocityReport): string {
    const lines: string[] = [];

    lines.push('📊 *VELOCIDAD DEL FUNNEL*');
    lines.push(`Período: ${report.period}`);
    lines.push('━━━━━━━━━━━━━━━━━');
    lines.push('');

    // Time per stage
    lines.push('⏱️ *Tiempo promedio por etapa:*');
    const activeStages = report.stages.filter(
      (s) => s.stage !== 'delivered' && (s.avgDaysInStage > 0 || s.leadsCurrentlyInStage > 0)
    );

    for (let i = 0; i < activeStages.length; i++) {
      const s = activeStages[i];
      const nextStage = i < activeStages.length - 1 ? activeStages[i + 1] : null;
      const label = STAGE_LABELS[s.stage] || s.stage;
      const nextLabel = nextStage ? (STAGE_LABELS[nextStage.stage] || nextStage.stage) : 'Cierre';
      const bottleneckMark = s.stage === report.bottleneckStage ? ' ← 🐌 Cuello de botella' : '';
      lines.push(`• ${label} → ${nextLabel}: ${s.avgDaysInStage} días${bottleneckMark}`);
    }

    lines.push('');

    // Conversion rates
    lines.push('📈 *Conversión entre etapas:*');
    for (let i = 0; i < activeStages.length; i++) {
      const s = activeStages[i];
      const nextStage = i < activeStages.length - 1 ? activeStages[i + 1] : null;
      if (!nextStage) break;
      const label = STAGE_LABELS[s.stage] || s.stage;
      const nextLabel = STAGE_LABELS[nextStage.stage] || nextStage.stage;
      lines.push(`• ${label} → ${nextLabel}: ${s.conversionRateToNext}%`);
    }

    lines.push('');

    // Vendor comparison
    if (report.fastestVendedor) {
      lines.push(`🏆 Vendedor más rápido: ${report.fastestVendedor.name} (${report.fastestVendedor.avgDays} días promedio)`);
    }
    if (report.slowestVendedor) {
      lines.push(`🐢 Vendedor más lento: ${report.slowestVendedor.name} (${report.slowestVendedor.avgDays} días promedio)`);
    }

    lines.push(`⏰ Promedio general: ${report.overallAvgDaysToClose} días new → closed`);

    return lines.join('\n');
  }
}
