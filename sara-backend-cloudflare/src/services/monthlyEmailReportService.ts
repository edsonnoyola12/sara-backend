// ═══════════════════════════════════════════════════════════════════════════
// MONTHLY EMAIL REPORT SERVICE - Reporte mensual ejecutivo por email
// ═══════════════════════════════════════════════════════════════════════════
// Genera y envia reportes HTML profesionales mensuales y semanales
// a CEO (Oscar) y Dev (Edson) via Resend API.
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';
import { sendEmail } from './emailService';
import { Env } from '../types/env';
import { logErrorToDB } from '../crons/healthCheck';

// ─── Colors & Branding ──────────────────────────────────────────────────

const PRIMARY = '#1a365d';
const PRIMARY_LIGHT = '#2a4a7f';
const ACCENT = '#c53030';
const SUCCESS = '#38a169';
const WARNING = '#d69e2e';
const BG = '#f7fafc';
const WHITE = '#ffffff';
const TEXT_DARK = '#2d3748';
const TEXT_MUTED = '#718096';
const BORDER = '#e2e8f0';
const LIGHT_GREEN_BG = '#f0fff4';
const LIGHT_RED_BG = '#fff5f5';
const LIGHT_YELLOW_BG = '#fffff0';
const LIGHT_BLUE_BG = '#ebf8ff';

const FROM_EMAIL = 'SARA <no-reply@gruposantarita.com>';

// ─── Recipients ─────────────────────────────────────────────────────────

const REPORT_RECIPIENTS = [
  'oscar@gruposantarita.com',
  'edson@gruposantarita.com',
];

// ─── Types ──────────────────────────────────────────────────────────────

interface MonthlyReport {
  month: string; // 'Febrero 2026'
  monthKey: string; // '2026-02'

  // KPIs
  totalLeads: number;
  totalLeadsPrev: number;
  totalSales: number;
  totalSalesPrev: number;
  totalRevenue: number;
  totalRevenuePrev: number;
  avgDealSize: number;
  avgDealSizePrev: number;
  conversionRate: number;
  conversionRatePrev: number;

  // Funnel
  funnel: {
    stage: string;
    label: string;
    count: number;
    pct: number;
  }[];

  // Team
  teamPerformance: {
    name: string;
    leads: number;
    sales: number;
    revenue: number;
    conversionRate: number;
    avgResponseMin: number;
  }[];

  // Appointments
  totalAppointments: number;
  completedAppointments: number;
  noShowAppointments: number;
  showRate: number;

  // Sources
  topSources: { source: string; count: number }[];

  // Lost reasons
  lostReasons: { reason: string; count: number }[];
  totalLost: number;

  // AI / SARA metrics
  totalMessages: number;
  aiResponses: number;
  resourcesSent: number;

  // Top development
  topDevelopments: { name: string; leads: number; sales: number }[];

  // Trends (3 months)
  trends: {
    month: string;
    leads: number;
    sales: number;
    revenue: number;
    conversionRate: number;
    avgResponseMin: number;
  }[];

  // Pipeline
  pipelineValue: number;
  pipelineLeads: number;

  // Response time
  avgResponseMin: number;
  avgResponseMinPrev: number;

  // Time metrics
  avgDaysToClose: number;
}

interface WeeklyDigest {
  weekLabel: string;
  leadsThisWeek: number;
  leadsLastWeek: number;
  appointmentsThisWeek: number;
  appointmentsCompleted: number;
  advancedLeads: { name: string; from: string; to: string }[];
  stuckLeads: { name: string; stage: string; days: number }[];
  noShows: { name: string; date: string }[];
  overdueFollowups: number;
  salesThisWeek: number;
  revenueThisWeek: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('es-MX').format(n);
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${fmt(n)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function pctChange(current: number, previous: number): { value: number; label: string; color: string; arrow: string } {
  if (previous === 0) {
    if (current > 0) return { value: 100, label: '+100%', color: SUCCESS, arrow: '&#9650;' };
    return { value: 0, label: '0%', color: TEXT_MUTED, arrow: '&#8212;' };
  }
  const change = ((current - previous) / previous) * 100;
  if (change > 0) return { value: change, label: `+${change.toFixed(1)}%`, color: SUCCESS, arrow: '&#9650;' };
  if (change < 0) return { value: change, label: `${change.toFixed(1)}%`, color: ACCENT, arrow: '&#9660;' };
  return { value: 0, label: '0%', color: TEXT_MUTED, arrow: '&#8212;' };
}

function responseTimeStr(min: number): string {
  if (min <= 0) return 'N/A';
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const STAGE_LABELS: Record<string, string> = {
  new: 'Nuevos',
  contacted: 'Contactados',
  scheduled: 'Cita Agendada',
  visit_scheduled: 'Cita Agendada',
  visited: 'Visitados',
  negotiation: 'Negociaci\u00f3n',
  negotiating: 'Negociaci\u00f3n',
  reserved: 'Apartados',
  closed: 'Cerrados',
  sold: 'Cerrados',
  delivered: 'Entregados',
  lost: 'Perdidos',
};

function normalizeStatus(s: string | null): string {
  if (!s) return 'new';
  const map: Record<string, string> = {
    visit_scheduled: 'scheduled',
    negotiating: 'negotiation',
    sold: 'closed',
    closed_won: 'closed',
  };
  return map[s.toLowerCase()] || s.toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class MonthlyEmailReportService {
  constructor(
    private supabase: SupabaseService,
    private env: Env
  ) {}

  // ─── Generate Monthly Report Data ──────────────────────────────────────

  async generateMonthlyReport(): Promise<MonthlyReport> {
    const now = new Date();
    // Report on the PREVIOUS month
    const reportMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const reportYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const startReport = new Date(reportYear, reportMonth, 1);
    const endReport = new Date(reportYear, reportMonth + 1, 0, 23, 59, 59);

    // Previous month (for MoM comparison)
    const prevMonth = reportMonth === 0 ? 11 : reportMonth - 1;
    const prevYear = reportMonth === 0 ? reportYear - 1 : reportYear;
    const startPrev = new Date(prevYear, prevMonth, 1);
    const endPrev = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);

    // 3 months back for trends
    const trend3Start = new Date(reportYear, reportMonth - 2, 1);

    const monthLabel = `${MESES[reportMonth]} ${reportYear}`;
    const monthKey = `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}`;

    // ═══ PARALLEL QUERIES ═══
    const [
      { data: leadsMonth },
      { data: leadsPrev },
      { data: salesMonth },
      { data: salesPrev },
      { data: appointmentsMonth },
      { data: pipeline },
      { data: lostMonth },
      { data: vendedores },
      { data: allLeads3Mo },
      { data: allSales3Mo },
      { data: conversationStats },
    ] = await Promise.all([
      this.supabase.client.from('leads')
        .select('*, team_members:assigned_to(name)')
        .gte('created_at', startReport.toISOString())
        .lte('created_at', endReport.toISOString()),
      this.supabase.client.from('leads')
        .select('id, first_response_at, created_at')
        .gte('created_at', startPrev.toISOString())
        .lte('created_at', endPrev.toISOString()),
      this.supabase.client.from('leads')
        .select('*, properties(price, name), team_members:assigned_to(name)')
        .in('status', ['closed', 'delivered', 'sold'])
        .gte('status_changed_at', startReport.toISOString())
        .lte('status_changed_at', endReport.toISOString()),
      this.supabase.client.from('leads')
        .select('id, properties(price)')
        .in('status', ['closed', 'delivered', 'sold'])
        .gte('status_changed_at', startPrev.toISOString())
        .lte('status_changed_at', endPrev.toISOString()),
      this.supabase.client.from('appointments')
        .select('*')
        .gte('scheduled_date', startReport.toISOString().split('T')[0])
        .lte('scheduled_date', endReport.toISOString().split('T')[0]),
      this.supabase.client.from('leads')
        .select('*, properties(price)')
        .in('status', ['negotiation', 'reserved', 'scheduled', 'visited', 'visit_scheduled']),
      this.supabase.client.from('leads')
        .select('id, lost_reason')
        .eq('status', 'lost')
        .gte('status_changed_at', startReport.toISOString())
        .lte('status_changed_at', endReport.toISOString()),
      this.supabase.client.from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true),
      // 3-month leads for trends
      this.supabase.client.from('leads')
        .select('id, created_at, first_response_at, status')
        .gte('created_at', trend3Start.toISOString())
        .lte('created_at', endReport.toISOString()),
      // 3-month sales for trends
      this.supabase.client.from('leads')
        .select('id, status_changed_at, properties(price)')
        .in('status', ['closed', 'delivered', 'sold'])
        .gte('status_changed_at', trend3Start.toISOString())
        .lte('status_changed_at', endReport.toISOString()),
      // Conversation stats for AI metrics
      this.supabase.client.from('conversation_history')
        .select('id, messages')
        .gte('updated_at', startReport.toISOString())
        .lte('updated_at', endReport.toISOString())
        .limit(500),
    ]);

    // ═══ CALCULATIONS ═══

    const totalLeads = leadsMonth?.length || 0;
    const totalLeadsPrev = leadsPrev?.length || 0;
    const totalSales = salesMonth?.length || 0;
    const totalSalesPrev = salesPrev?.length || 0;

    let totalRevenue = 0;
    for (const s of salesMonth || []) totalRevenue += (s as any).properties?.price || 2_000_000;

    let totalRevenuePrev = 0;
    for (const s of salesPrev || []) totalRevenuePrev += (s as any).properties?.price || 2_000_000;

    const avgDealSize = totalSales > 0 ? totalRevenue / totalSales : 0;
    const avgDealSizePrev = totalSalesPrev > 0 ? totalRevenuePrev / totalSalesPrev : 0;

    const conversionRate = totalLeads > 0 ? (totalSales / totalLeads) * 100 : 0;
    const conversionRatePrev = totalLeadsPrev > 0 ? (totalSalesPrev / totalLeadsPrev) * 100 : 0;

    // Funnel
    const stages = ['new', 'contacted', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed', 'lost'];
    const funnelCounts: Record<string, number> = {};
    for (const stage of stages) funnelCounts[stage] = 0;

    for (const l of leadsMonth || []) {
      const s = normalizeStatus(l.status);
      if (funnelCounts[s] !== undefined) funnelCounts[s]++;
      else if (s === 'delivered') funnelCounts['closed']++;
    }
    // Also count sales that came from this month's leads
    for (const s of salesMonth || []) {
      const createdAt = new Date((s as any).created_at);
      if (createdAt >= startReport && createdAt <= endReport) {
        // Already counted in leadsMonth
      } else {
        // Sales from leads created in previous months
        funnelCounts['closed'] = (funnelCounts['closed'] || 0) + 1;
      }
    }

    const maxFunnel = Math.max(...Object.values(funnelCounts), 1);
    const funnel = stages.map(stage => ({
      stage,
      label: STAGE_LABELS[stage] || stage,
      count: funnelCounts[stage] || 0,
      pct: ((funnelCounts[stage] || 0) / maxFunnel) * 100,
    }));

    // Appointments
    const totalAppointments = appointmentsMonth?.length || 0;
    const completedAppointments = appointmentsMonth?.filter((a: any) => a.status === 'completed').length || 0;
    const noShowAppointments = appointmentsMonth?.filter((a: any) => a.status === 'no_show' || a.status === 'missed').length || 0;
    const showRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0;

    // Response times
    const responseTimes: number[] = [];
    for (const l of leadsMonth || []) {
      if (l.first_response_at && l.created_at) {
        const diff = (new Date(l.first_response_at).getTime() - new Date(l.created_at).getTime()) / 60000;
        if (diff > 0 && diff < 1440) responseTimes.push(diff);
      }
    }
    const avgResponseMin = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const responseTimesPrev: number[] = [];
    for (const l of leadsPrev || []) {
      if ((l as any).first_response_at && (l as any).created_at) {
        const diff = (new Date((l as any).first_response_at).getTime() - new Date((l as any).created_at).getTime()) / 60000;
        if (diff > 0 && diff < 1440) responseTimesPrev.push(diff);
      }
    }
    const avgResponseMinPrev = responseTimesPrev.length > 0
      ? responseTimesPrev.reduce((a, b) => a + b, 0) / responseTimesPrev.length
      : 0;

    // Team performance
    const teamPerformance = (vendedores || []).map((v: any) => {
      const vLeads = (leadsMonth || []).filter((l: any) => l.assigned_to === v.id);
      const vSales = (salesMonth || []).filter((s: any) => s.assigned_to === v.id);
      let vRevenue = 0;
      for (const s of vSales) vRevenue += (s as any).properties?.price || 2_000_000;

      const vResponseTimes: number[] = [];
      for (const l of vLeads) {
        if (l.first_response_at && l.created_at) {
          const diff = (new Date(l.first_response_at).getTime() - new Date(l.created_at).getTime()) / 60000;
          if (diff > 0 && diff < 1440) vResponseTimes.push(diff);
        }
      }

      return {
        name: v.name || 'Sin nombre',
        leads: vLeads.length,
        sales: vSales.length,
        revenue: vRevenue,
        conversionRate: vLeads.length > 0 ? (vSales.length / vLeads.length) * 100 : 0,
        avgResponseMin: vResponseTimes.length > 0
          ? vResponseTimes.reduce((a: number, b: number) => a + b, 0) / vResponseTimes.length
          : 0,
      };
    }).sort((a: any, b: any) => b.revenue - a.revenue);

    // Sources
    const sourceMap: Record<string, number> = {};
    for (const l of leadsMonth || []) {
      const src = (l as any).source || (l as any).notes?.utm_source || 'Directo';
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    }
    const topSources = Object.entries(sourceMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    // Lost reasons
    const lostMap: Record<string, number> = {};
    for (const l of lostMonth || []) {
      const reason = (l as any).lost_reason || 'Sin raz\u00f3n';
      lostMap[reason] = (lostMap[reason] || 0) + 1;
    }
    const lostReasons = Object.entries(lostMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    // Top developments
    const devMap: Record<string, { leads: number; sales: number }> = {};
    for (const l of leadsMonth || []) {
      const dev = (l as any).property_interest || 'Sin especificar';
      if (!devMap[dev]) devMap[dev] = { leads: 0, sales: 0 };
      devMap[dev].leads++;
    }
    for (const s of salesMonth || []) {
      const dev = (s as any).properties?.name || (s as any).property_interest || 'Sin especificar';
      if (!devMap[dev]) devMap[dev] = { leads: 0, sales: 0 };
      devMap[dev].sales++;
    }
    const topDevelopments = Object.entries(devMap)
      .sort((a, b) => b[1].leads - a[1].leads)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data }));

    // AI metrics (count messages from conversation_history)
    let totalMessages = 0;
    let aiResponses = 0;
    let resourcesSent = 0;
    for (const conv of conversationStats || []) {
      const msgs = (conv as any).messages;
      if (Array.isArray(msgs)) {
        totalMessages += msgs.length;
        aiResponses += msgs.filter((m: any) => m.role === 'assistant').length;
        resourcesSent += msgs.filter((m: any) =>
          m.role === 'assistant' && m.content &&
          (m.content.includes('brochure') || m.content.includes('ubicaci') || m.content.includes('video'))
        ).length;
      }
    }

    // Pipeline
    let pipelineValue = 0;
    for (const p of pipeline || []) pipelineValue += (p as any).properties?.price || 2_000_000;

    // Days to close
    let daysToCloseArr: number[] = [];
    for (const s of salesMonth || []) {
      if ((s as any).created_at && (s as any).status_changed_at) {
        const days = (new Date((s as any).status_changed_at).getTime() - new Date((s as any).created_at).getTime()) / (86400000);
        if (days > 0) daysToCloseArr.push(days);
      }
    }
    const avgDaysToClose = daysToCloseArr.length > 0
      ? Math.round(daysToCloseArr.reduce((a, b) => a + b, 0) / daysToCloseArr.length)
      : 0;

    // Trends (3 months)
    const trends: MonthlyReport['trends'] = [];
    for (let i = 2; i >= 0; i--) {
      const tMonth = reportMonth - i < 0 ? reportMonth - i + 12 : reportMonth - i;
      const tYear = reportMonth - i < 0 ? reportYear - 1 : reportYear;
      const tStart = new Date(tYear, tMonth, 1);
      const tEnd = new Date(tYear, tMonth + 1, 0, 23, 59, 59);
      const tLabel = `${MESES[tMonth].substring(0, 3)} ${tYear}`;

      const tLeads = (allLeads3Mo || []).filter((l: any) => {
        const d = new Date(l.created_at);
        return d >= tStart && d <= tEnd;
      });

      const tSales = (allSales3Mo || []).filter((s: any) => {
        const d = new Date((s as any).status_changed_at);
        return d >= tStart && d <= tEnd;
      });

      let tRevenue = 0;
      for (const s of tSales) tRevenue += (s as any).properties?.price || 2_000_000;

      const tResponseTimes: number[] = [];
      for (const l of tLeads) {
        if ((l as any).first_response_at && (l as any).created_at) {
          const diff = (new Date((l as any).first_response_at).getTime() - new Date((l as any).created_at).getTime()) / 60000;
          if (diff > 0 && diff < 1440) tResponseTimes.push(diff);
        }
      }

      trends.push({
        month: tLabel,
        leads: tLeads.length,
        sales: tSales.length,
        revenue: tRevenue,
        conversionRate: tLeads.length > 0 ? (tSales.length / tLeads.length) * 100 : 0,
        avgResponseMin: tResponseTimes.length > 0
          ? tResponseTimes.reduce((a: number, b: number) => a + b, 0) / tResponseTimes.length
          : 0,
      });
    }

    return {
      month: monthLabel,
      monthKey,
      totalLeads,
      totalLeadsPrev,
      totalSales,
      totalSalesPrev,
      totalRevenue,
      totalRevenuePrev,
      avgDealSize,
      avgDealSizePrev,
      conversionRate,
      conversionRatePrev,
      funnel,
      teamPerformance,
      totalAppointments,
      completedAppointments,
      noShowAppointments,
      showRate,
      topSources,
      lostReasons,
      totalLost: lostMonth?.length || 0,
      totalMessages,
      aiResponses,
      resourcesSent,
      topDevelopments,
      trends,
      pipelineValue,
      pipelineLeads: pipeline?.length || 0,
      avgResponseMin,
      avgResponseMinPrev,
      avgDaysToClose,
    };
  }

  // ─── Generate Email HTML ──────────────────────────────────────────────

  generateEmailHTML(r: MonthlyReport): { subject: string; html: string } {
    const leadsChange = pctChange(r.totalLeads, r.totalLeadsPrev);
    const salesChange = pctChange(r.totalSales, r.totalSalesPrev);
    const revenueChange = pctChange(r.totalRevenue, r.totalRevenuePrev);
    const convChange = pctChange(r.conversionRate, r.conversionRatePrev);
    const responseChange = pctChange(
      r.avgResponseMinPrev > 0 ? r.avgResponseMinPrev : 1,
      r.avgResponseMin > 0 ? r.avgResponseMin : 1
    ); // inverted: lower is better

    // ═══ INSIGHTS ═══
    const insights = this.generateInsights(r);

    // ═══ BUSINESS CASE ═══
    const businessCase = this.generateBusinessCase(r);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte Mensual - ${r.month}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">

<!-- Wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BG};">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="max-width:680px;width:100%;background-color:${WHITE};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">

<!-- Header -->
<tr>
<td style="background:linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%);background-color:${PRIMARY};padding:32px 40px;text-align:center;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="font-size:13px;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase;text-align:center;">Grupo Santa Rita</td></tr>
<tr><td style="font-size:28px;font-weight:bold;color:${WHITE};text-align:center;padding-top:8px;">Reporte Mensual</td></tr>
<tr><td style="font-size:16px;color:rgba(255,255,255,0.8);text-align:center;padding-top:4px;">${r.month}</td></tr>
</table>
</td>
</tr>

<!-- KPI Cards -->
<tr>
<td style="padding:24px 24px 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
${this.kpiCard('Leads', fmt(r.totalLeads), leadsChange)}
${this.kpiCard('Ventas', fmt(r.totalSales), salesChange)}
${this.kpiCard('Revenue', fmtCurrency(r.totalRevenue), revenueChange)}
${this.kpiCard('Conversi\u00f3n', fmtPct(r.conversionRate), convChange)}
</tr>
</table>
</td>
</tr>

<!-- Secondary KPIs -->
<tr>
<td style="padding:12px 24px 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
${this.kpiCardSmall('Ticket Promedio', fmtCurrency(r.avgDealSize))}
${this.kpiCardSmall('Tiempo Respuesta', responseTimeStr(r.avgResponseMin))}
${this.kpiCardSmall('Show Rate', fmtPct(r.showRate))}
${this.kpiCardSmall('D\u00edas al Cierre', `${r.avgDaysToClose}d`)}
</tr>
</table>
</td>
</tr>

<!-- Section: Funnel -->
<tr>
<td style="padding:32px 32px 0 32px;">
${this.sectionHeader('An\u00e1lisis de Funnel')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;">
${r.funnel.filter(f => f.stage !== 'lost').map(f => this.funnelBar(f.label, f.count, f.pct)).join('\n')}
</table>
${r.totalLost > 0 ? `<p style="margin:12px 0 0 0;font-size:13px;color:${ACCENT};">Perdidos: ${r.totalLost} leads</p>` : ''}
</td>
</tr>

<!-- Section: Team Leaderboard -->
<tr>
<td style="padding:32px 32px 0 32px;">
${this.sectionHeader('Rendimiento del Equipo')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
<tr style="background-color:${PRIMARY};">
<td style="padding:10px 12px;font-size:12px;font-weight:bold;color:${WHITE};text-transform:uppercase;letter-spacing:0.5px;">Vendedor</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${WHITE};text-align:center;">Leads</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${WHITE};text-align:center;">Ventas</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${WHITE};text-align:center;">Revenue</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${WHITE};text-align:center;">Conv.</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${WHITE};text-align:center;">Resp.</td>
</tr>
${r.teamPerformance.slice(0, 8).map((t, i) => this.teamRow(t, i)).join('\n')}
</table>
</td>
</tr>

<!-- Section: Trends (3-month) -->
<tr>
<td style="padding:32px 32px 0 32px;">
${this.sectionHeader('Tendencias (3 meses)')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
<tr style="background-color:${BG};">
<td style="padding:10px 12px;font-size:12px;font-weight:bold;color:${TEXT_DARK};">Mes</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${TEXT_DARK};text-align:center;">Leads</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${TEXT_DARK};text-align:center;">Ventas</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${TEXT_DARK};text-align:center;">Revenue</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${TEXT_DARK};text-align:center;">Conv.</td>
<td style="padding:10px 8px;font-size:12px;font-weight:bold;color:${TEXT_DARK};text-align:center;">Resp.</td>
</tr>
${r.trends.map((t, i) => `<tr style="background-color:${i === r.trends.length - 1 ? LIGHT_BLUE_BG : WHITE};">
<td style="padding:8px 12px;font-size:13px;color:${TEXT_DARK};font-weight:${i === r.trends.length - 1 ? 'bold' : 'normal'};border-top:1px solid ${BORDER};">${t.month}</td>
<td style="padding:8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${t.leads}</td>
<td style="padding:8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${t.sales}</td>
<td style="padding:8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${fmtCurrency(t.revenue)}</td>
<td style="padding:8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${fmtPct(t.conversionRate)}</td>
<td style="padding:8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${responseTimeStr(t.avgResponseMin)}</td>
</tr>`).join('\n')}
</table>
</td>
</tr>

<!-- Section: Top Sources -->
<tr>
<td style="padding:32px 32px 0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td width="48%" valign="top">
${this.sectionHeader('Top Fuentes')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
${r.topSources.map((s, i) => `<tr>
<td style="padding:6px 0;font-size:13px;color:${TEXT_DARK};"><span style="color:${PRIMARY};font-weight:bold;">${i + 1}.</span> ${s.source}</td>
<td style="padding:6px 0;font-size:13px;color:${TEXT_DARK};text-align:right;font-weight:bold;">${s.count}</td>
</tr>`).join('\n')}
</table>
</td>
<td width="4%">&nbsp;</td>
<td width="48%" valign="top">
${this.sectionHeader('Top Desarrollos')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
${r.topDevelopments.map((d, i) => `<tr>
<td style="padding:6px 0;font-size:13px;color:${TEXT_DARK};"><span style="color:${PRIMARY};font-weight:bold;">${i + 1}.</span> ${d.name}</td>
<td style="padding:6px 0;font-size:13px;color:${TEXT_DARK};text-align:right;">${d.leads}L / ${d.sales}V</td>
</tr>`).join('\n')}
</table>
</td>
</tr>
</table>
</td>
</tr>

<!-- Section: Insights -->
<tr>
<td style="padding:32px 32px 0 32px;">
${this.sectionHeader('Mejores Pr\u00e1cticas e Insights')}
<div style="margin-top:16px;background-color:${LIGHT_YELLOW_BG};border-left:4px solid ${WARNING};border-radius:0 8px 8px 0;padding:20px;">
${insights.map(i => `<p style="margin:0 0 10px 0;font-size:14px;color:${TEXT_DARK};line-height:1.6;">
<span style="font-size:16px;margin-right:6px;">${i.icon}</span> <strong>${i.title}:</strong> ${i.description}
</p>`).join('\n')}
</div>
</td>
</tr>

<!-- Section: Business Case -->
<tr>
<td style="padding:32px 32px 0 32px;">
${this.sectionHeader('ROI de SARA')}
<div style="margin-top:16px;background-color:${LIGHT_GREEN_BG};border-left:4px solid ${SUCCESS};border-radius:0 8px 8px 0;padding:20px;">
${businessCase.map(b => `<p style="margin:0 0 10px 0;font-size:14px;color:${TEXT_DARK};line-height:1.6;">
<strong style="color:${SUCCESS};">${b.metric}:</strong> ${b.value}
</p>`).join('\n')}
</div>
</td>
</tr>

<!-- Section: Lost Reasons -->
${r.lostReasons.length > 0 ? `<tr>
<td style="padding:32px 32px 0 32px;">
${this.sectionHeader('Razones de P\u00e9rdida')}
<div style="margin-top:16px;background-color:${LIGHT_RED_BG};border-left:4px solid ${ACCENT};border-radius:0 8px 8px 0;padding:16px;">
${r.lostReasons.map(lr => `<p style="margin:0 0 8px 0;font-size:14px;color:${TEXT_DARK};">
<strong>${lr.reason}:</strong> ${lr.count} leads
</p>`).join('\n')}
</div>
</td>
</tr>` : ''}

<!-- Pipeline -->
<tr>
<td style="padding:32px 32px 0 32px;">
<div style="background-color:${LIGHT_BLUE_BG};border-radius:8px;padding:20px;text-align:center;">
<p style="margin:0;font-size:13px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:1px;">Pipeline Actual</p>
<p style="margin:8px 0 0 0;font-size:28px;font-weight:bold;color:${PRIMARY};">${fmtCurrency(r.pipelineValue)}</p>
<p style="margin:4px 0 0 0;font-size:14px;color:${TEXT_MUTED};">${r.pipelineLeads} leads activos en pipeline</p>
</div>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:32px;text-align:center;border-top:1px solid ${BORDER};margin-top:32px;">
<p style="margin:0;font-size:11px;color:${TEXT_MUTED};line-height:1.6;">
Powered by <strong style="color:${PRIMARY};">SARA AI</strong> &mdash; Grupo Santa Rita<br>
Este reporte se genera autom&aacute;ticamente el d&iacute;a 1 de cada mes.
</p>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    return {
      subject: `Reporte Mensual ${r.month} \u2014 Grupo Santa Rita`,
      html,
    };
  }

  // ─── Generate Weekly Digest ──────────────────────────────────────────

  async generateWeeklyDigestData(): Promise<WeeklyDigest> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const prevWeekStart = new Date(now);
    prevWeekStart.setDate(now.getDate() - 14);

    const weekLabel = `${weekStart.getDate()} - ${now.getDate()} ${MESES[now.getMonth()]}`;

    const [
      { data: leadsThisWeek },
      { data: leadsLastWeek },
      { data: appointmentsWeek },
      { data: recentAdvanced },
      { data: stuckLeads },
      { data: salesWeek },
    ] = await Promise.all([
      this.supabase.client.from('leads').select('id')
        .gte('created_at', weekStart.toISOString()),
      this.supabase.client.from('leads').select('id')
        .gte('created_at', prevWeekStart.toISOString())
        .lt('created_at', weekStart.toISOString()),
      this.supabase.client.from('appointments').select('*, leads(name)')
        .gte('scheduled_date', weekStart.toISOString().split('T')[0])
        .lte('scheduled_date', now.toISOString().split('T')[0]),
      // Leads that advanced status this week
      this.supabase.client.from('leads').select('name, status, notes')
        .gte('status_changed_at', weekStart.toISOString())
        .not('status', 'in', '(lost,inactive)')
        .limit(10),
      // Leads stuck (no movement > 7 days)
      this.supabase.client.from('leads').select('name, status, updated_at')
        .not('status', 'in', '(closed,delivered,lost,inactive,sold)')
        .lt('updated_at', weekStart.toISOString())
        .limit(10),
      this.supabase.client.from('leads').select('*, properties(price)')
        .in('status', ['closed', 'delivered', 'sold'])
        .gte('status_changed_at', weekStart.toISOString()),
    ]);

    const completedAppointments = appointmentsWeek?.filter((a: any) => a.status === 'completed').length || 0;
    const noShows = (appointmentsWeek || [])
      .filter((a: any) => a.status === 'no_show' || a.status === 'missed')
      .slice(0, 5)
      .map((a: any) => ({ name: a.leads?.name || 'Desconocido', date: a.scheduled_date }));

    const advanced = (recentAdvanced || []).slice(0, 5).map((l: any) => ({
      name: l.name || 'Sin nombre',
      from: l.notes?.previous_status || '?',
      to: l.status,
    }));

    const stuck = (stuckLeads || []).slice(0, 5).map((l: any) => ({
      name: l.name || 'Sin nombre',
      stage: l.status,
      days: Math.floor((now.getTime() - new Date(l.updated_at).getTime()) / 86400000),
    }));

    let revenueWeek = 0;
    for (const s of salesWeek || []) revenueWeek += (s as any).properties?.price || 2_000_000;

    return {
      weekLabel,
      leadsThisWeek: leadsThisWeek?.length || 0,
      leadsLastWeek: leadsLastWeek?.length || 0,
      appointmentsThisWeek: appointmentsWeek?.length || 0,
      appointmentsCompleted: completedAppointments,
      advancedLeads: advanced,
      stuckLeads: stuck,
      noShows,
      overdueFollowups: 0, // Could query followup_approvals
      salesThisWeek: salesWeek?.length || 0,
      revenueThisWeek: revenueWeek,
    };
  }

  generateWeeklyDigestHTML(d: WeeklyDigest): { subject: string; html: string } {
    const leadsChange = pctChange(d.leadsThisWeek, d.leadsLastWeek);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resumen Semanal - ${d.weekLabel}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BG};">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${WHITE};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">

<!-- Header -->
<tr>
<td style="background-color:${PRIMARY};padding:24px 32px;text-align:center;">
<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase;">Grupo Santa Rita</p>
<p style="margin:6px 0 0 0;font-size:22px;font-weight:bold;color:${WHITE};">Resumen Semanal</p>
<p style="margin:4px 0 0 0;font-size:14px;color:rgba(255,255,255,0.8);">${d.weekLabel}</p>
</td>
</tr>

<!-- Quick Stats -->
<tr>
<td style="padding:24px 24px 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
${this.kpiCardSmall('Leads', `${d.leadsThisWeek} <span style="font-size:11px;color:${leadsChange.color};">${leadsChange.arrow} ${leadsChange.label}</span>`)}
${this.kpiCardSmall('Citas', `${d.appointmentsThisWeek} (${d.appointmentsCompleted} ok)`)}
${this.kpiCardSmall('Ventas', `${d.salesThisWeek}`)}
${this.kpiCardSmall('Revenue', fmtCurrency(d.revenueThisWeek))}
</tr>
</table>
</td>
</tr>

<!-- Advanced Leads -->
${d.advancedLeads.length > 0 ? `<tr>
<td style="padding:24px 32px 0 32px;">
${this.sectionHeader('Avances de la Semana')}
<div style="margin-top:12px;background-color:${LIGHT_GREEN_BG};border-radius:8px;padding:16px;">
${d.advancedLeads.map(l => `<p style="margin:0 0 8px 0;font-size:13px;color:${TEXT_DARK};">
&#9989; <strong>${l.name}</strong>: ${STAGE_LABELS[l.from] || l.from} &#8594; ${STAGE_LABELS[l.to] || l.to}
</p>`).join('\n')}
</div>
</td>
</tr>` : ''}

<!-- Stuck Leads -->
${d.stuckLeads.length > 0 ? `<tr>
<td style="padding:24px 32px 0 32px;">
${this.sectionHeader('Leads Estancados')}
<div style="margin-top:12px;background-color:${LIGHT_RED_BG};border-radius:8px;padding:16px;">
${d.stuckLeads.map(l => `<p style="margin:0 0 8px 0;font-size:13px;color:${TEXT_DARK};">
&#9888; <strong>${l.name}</strong>: ${STAGE_LABELS[l.stage] || l.stage} (${l.days} d&iacute;as)
</p>`).join('\n')}
</div>
</td>
</tr>` : ''}

<!-- No-Shows -->
${d.noShows.length > 0 ? `<tr>
<td style="padding:24px 32px 0 32px;">
${this.sectionHeader('No-Shows')}
<div style="margin-top:12px;background-color:${LIGHT_YELLOW_BG};border-radius:8px;padding:16px;">
${d.noShows.map(n => `<p style="margin:0 0 8px 0;font-size:13px;color:${TEXT_DARK};">
&#10060; <strong>${n.name}</strong> - ${n.date}
</p>`).join('\n')}
</div>
</td>
</tr>` : ''}

<!-- Footer -->
<tr>
<td style="padding:24px 32px;text-align:center;border-top:1px solid ${BORDER};margin-top:24px;">
<p style="margin:0;font-size:11px;color:${TEXT_MUTED};">
Powered by <strong style="color:${PRIMARY};">SARA AI</strong> &mdash; Grupo Santa Rita
</p>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    return {
      subject: `Resumen Semanal ${d.weekLabel} \u2014 Grupo Santa Rita`,
      html,
    };
  }

  // ─── Send Methods ─────────────────────────────────────────────────────

  async sendMonthlyReport(): Promise<void> {
    if (!this.env.RESEND_API_KEY) {
      console.error('[monthlyEmailReport] RESEND_API_KEY not configured, skipping');
      return;
    }

    try {
      console.log('[monthlyEmailReport] Generating monthly report...');
      const report = await this.generateMonthlyReport();
      const { subject, html } = this.generateEmailHTML(report);

      // Fetch admin emails from team_members or use defaults
      const recipients = await this.getRecipientEmails();

      for (const to of recipients) {
        const result = await sendEmail(this.env.RESEND_API_KEY, {
          from: FROM_EMAIL,
          to,
          subject,
          html,
        });

        if (result.error) {
          console.error(`[monthlyEmailReport] Failed to send to ${to}:`, result.error);
        } else {
          console.log(`[monthlyEmailReport] Monthly report sent to ${to}, id=${result.id}`);
        }
      }

      console.log(`[monthlyEmailReport] Monthly report sent to ${recipients.length} recipients`);
    } catch (e) {
      console.error('[monthlyEmailReport] Error:', e);
      await logErrorToDB(this.supabase, 'cron_error', (e as Error).message || String(e), {
        severity: 'error',
        source: 'sendMonthlyReport',
        stack: (e as Error).stack,
      });
    }
  }

  async sendWeeklyDigest(): Promise<void> {
    if (!this.env.RESEND_API_KEY) {
      console.error('[weeklyDigest] RESEND_API_KEY not configured, skipping');
      return;
    }

    try {
      console.log('[weeklyDigest] Generating weekly digest...');
      const digest = await this.generateWeeklyDigestData();
      const { subject, html } = this.generateWeeklyDigestHTML(digest);

      const recipients = await this.getRecipientEmails();

      for (const to of recipients) {
        const result = await sendEmail(this.env.RESEND_API_KEY, {
          from: FROM_EMAIL,
          to,
          subject,
          html,
        });

        if (result.error) {
          console.error(`[weeklyDigest] Failed to send to ${to}:`, result.error);
        } else {
          console.log(`[weeklyDigest] Weekly digest sent to ${to}, id=${result.id}`);
        }
      }

      console.log(`[weeklyDigest] Weekly digest sent to ${recipients.length} recipients`);
    } catch (e) {
      console.error('[weeklyDigest] Error:', e);
      await logErrorToDB(this.supabase, 'cron_error', (e as Error).message || String(e), {
        severity: 'error',
        source: 'sendWeeklyDigest',
        stack: (e as Error).stack,
      });
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async getRecipientEmails(): Promise<string[]> {
    // Try to get emails from team_members with admin role
    try {
      const { data: admins } = await this.supabase.client
        .from('team_members')
        .select('email, name, role')
        .in('role', ['admin', 'coordinador'])
        .eq('active', true);

      const emails = (admins || [])
        .map((a: any) => a.email)
        .filter((e: string | null) => e && e.includes('@'));

      if (emails.length > 0) return emails;
    } catch (e) {
      console.log('[monthlyEmailReport] Could not fetch admin emails from DB, using defaults');
    }

    return REPORT_RECIPIENTS;
  }

  private generateInsights(r: MonthlyReport): { icon: string; title: string; description: string }[] {
    const insights: { icon: string; title: string; description: string }[] = [];

    // Revenue trend
    if (r.totalRevenue > r.totalRevenuePrev) {
      const pct = r.totalRevenuePrev > 0 ? Math.round(((r.totalRevenue - r.totalRevenuePrev) / r.totalRevenuePrev) * 100) : 100;
      insights.push({
        icon: '&#9989;',
        title: 'Revenue en crecimiento',
        description: `Crecimiento de ${pct}% vs mes anterior. ${r.totalSales > r.totalSalesPrev ? 'Impulsado por mayor volumen de ventas.' : 'Impulsado por mayor ticket promedio.'}`,
      });
    } else if (r.totalRevenue < r.totalRevenuePrev && r.totalRevenuePrev > 0) {
      insights.push({
        icon: '&#9888;',
        title: 'Revenue en descenso',
        description: `Revisar pipeline y estrategia de cierre. Considerar acciones de re-engagement con leads calificados.`,
      });
    }

    // Show rate
    if (r.showRate >= 75) {
      insights.push({
        icon: '&#9989;',
        title: 'Excelente show rate',
        description: `${fmtPct(r.showRate)} de asistencia a citas. Los recordatorios autom\u00e1ticos est\u00e1n funcionando bien.`,
      });
    } else if (r.showRate < 60 && r.totalAppointments > 5) {
      insights.push({
        icon: '&#9888;',
        title: 'Show rate por debajo del objetivo',
        description: `Solo ${fmtPct(r.showRate)} de asistencia. Reforzar confirmaciones por WhatsApp 24h y 1h antes.`,
      });
    }

    // Response time
    if (r.avgResponseMin > 0 && r.avgResponseMin <= 15) {
      insights.push({
        icon: '&#9989;',
        title: 'Tiempo de respuesta excelente',
        description: `Promedio de ${responseTimeStr(r.avgResponseMin)}. Los leads se atienden r\u00e1pidamente.`,
      });
    } else if (r.avgResponseMin > 60) {
      insights.push({
        icon: '&#9888;',
        title: 'Tiempo de respuesta alto',
        description: `${responseTimeStr(r.avgResponseMin)} en promedio. Cada minuto extra reduce la probabilidad de conversi\u00f3n un 5%.`,
      });
    }

    // Conversion
    if (r.conversionRate > r.conversionRatePrev && r.conversionRatePrev > 0) {
      insights.push({
        icon: '&#9989;',
        title: 'Conversi\u00f3n mejorando',
        description: `${fmtPct(r.conversionRate)} vs ${fmtPct(r.conversionRatePrev)} el mes anterior. La calificaci\u00f3n de leads est\u00e1 mejorando.`,
      });
    }

    // Top performer callout
    if (r.teamPerformance.length > 0 && r.teamPerformance[0].sales > 0) {
      const top = r.teamPerformance[0];
      insights.push({
        icon: '&#127942;',
        title: `Vendedor del mes: ${top.name.split(' ')[0]}`,
        description: `${top.sales} ventas por ${fmtCurrency(top.revenue)} con conversi\u00f3n de ${fmtPct(top.conversionRate)}.`,
      });
    }

    // Bottleneck (largest drop in funnel)
    const funnelActive = r.funnel.filter(f => f.stage !== 'lost' && f.stage !== 'closed');
    if (funnelActive.length >= 2) {
      let maxDrop = 0;
      let bottleneck = '';
      for (let i = 1; i < funnelActive.length; i++) {
        if (funnelActive[i - 1].count > 0) {
          const dropRate = 1 - (funnelActive[i].count / funnelActive[i - 1].count);
          if (dropRate > maxDrop) {
            maxDrop = dropRate;
            bottleneck = `${funnelActive[i - 1].label} &#8594; ${funnelActive[i].label}`;
          }
        }
      }
      if (maxDrop > 0.5 && bottleneck) {
        insights.push({
          icon: '&#128269;',
          title: 'Cuello de botella detectado',
          description: `Mayor ca\u00edda en ${bottleneck} (${Math.round(maxDrop * 100)}% de p\u00e9rdida). Focalizar esfuerzos aqu\u00ed.`,
        });
      }
    }

    return insights.slice(0, 6);
  }

  private generateBusinessCase(r: MonthlyReport): { metric: string; value: string }[] {
    const cases: { metric: string; value: string }[] = [];

    cases.push({
      metric: 'Mensajes gestionados por SARA',
      value: `${fmt(r.totalMessages)} mensajes procesados autom\u00e1ticamente`,
    });

    cases.push({
      metric: 'Respuestas IA generadas',
      value: `${fmt(r.aiResponses)} respuestas inteligentes (${r.totalMessages > 0 ? Math.round((r.aiResponses / r.totalMessages) * 100) : 0}% del total)`,
    });

    // Estimated time saved: ~3 min per message handled by AI
    const hoursSaved = Math.round((r.aiResponses * 3) / 60);
    cases.push({
      metric: 'Horas de trabajo ahorradas',
      value: `~${fmt(hoursSaved)} horas (equivalente a ${Math.round(hoursSaved / 8)} d\u00edas laborales)`,
    });

    // Resources sent automatically
    cases.push({
      metric: 'Recursos enviados autom\u00e1ticamente',
      value: `${fmt(r.resourcesSent)} brochures, ubicaciones y videos`,
    });

    // Leads managed 24/7
    cases.push({
      metric: 'Atenci\u00f3n 24/7',
      value: `${fmt(r.totalLeads)} leads atendidos instant\u00e1neamente, incluyendo fines de semana y noches`,
    });

    // Appointments scheduled
    cases.push({
      metric: 'Citas gestionadas',
      value: `${fmt(r.totalAppointments)} citas agendadas con recordatorios autom\u00e1ticos`,
    });

    return cases;
  }

  private kpiCard(label: string, value: string, change: { label: string; color: string; arrow: string }): string {
    return `<td width="25%" valign="top" style="padding:6px;">
<div style="background-color:${BG};border-radius:10px;padding:16px 12px;text-align:center;border:1px solid ${BORDER};">
<p style="margin:0;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">${label}</p>
<p style="margin:6px 0 4px 0;font-size:22px;font-weight:bold;color:${PRIMARY};">${value}</p>
<p style="margin:0;font-size:12px;color:${change.color};font-weight:bold;">${change.arrow} ${change.label}</p>
</div>
</td>`;
  }

  private kpiCardSmall(label: string, value: string): string {
    return `<td width="25%" valign="top" style="padding:4px;">
<div style="background-color:${WHITE};border-radius:8px;padding:10px 8px;text-align:center;border:1px solid ${BORDER};">
<p style="margin:0;font-size:10px;color:${TEXT_MUTED};text-transform:uppercase;">${label}</p>
<p style="margin:4px 0 0 0;font-size:15px;font-weight:bold;color:${TEXT_DARK};">${value}</p>
</div>
</td>`;
  }

  private sectionHeader(title: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="font-size:18px;font-weight:bold;color:${PRIMARY};padding-bottom:4px;border-bottom:2px solid ${PRIMARY};">${title}</td>
</tr>
</table>`;
  }

  private funnelBar(label: string, count: number, pct: number): string {
    const barWidth = Math.max(pct, 5);
    const barColor = pct > 60 ? PRIMARY : pct > 30 ? PRIMARY_LIGHT : '#a0aec0';
    return `<tr>
<td style="padding:4px 0;width:120px;font-size:13px;color:${TEXT_DARK};vertical-align:middle;">${label}</td>
<td style="padding:4px 8px;vertical-align:middle;">
<div style="background-color:${BORDER};border-radius:4px;height:22px;width:100%;overflow:hidden;">
<div style="background-color:${barColor};height:22px;width:${barWidth}%;border-radius:4px;"></div>
</div>
</td>
<td style="padding:4px 0;width:40px;font-size:13px;font-weight:bold;color:${TEXT_DARK};text-align:right;vertical-align:middle;">${count}</td>
</tr>`;
  }

  private teamRow(t: { name: string; leads: number; sales: number; revenue: number; conversionRate: number; avgResponseMin: number }, idx: number): string {
    const medals = ['&#129351;', '&#129352;', '&#129353;'];
    const medal = idx < 3 ? medals[idx] : `${idx + 1}.`;
    const bgColor = idx % 2 === 0 ? WHITE : BG;
    return `<tr style="background-color:${bgColor};">
<td style="padding:10px 12px;font-size:13px;color:${TEXT_DARK};border-top:1px solid ${BORDER};">${medal} ${t.name.split(' ')[0]}</td>
<td style="padding:10px 8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${t.leads}</td>
<td style="padding:10px 8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};font-weight:bold;">${t.sales}</td>
<td style="padding:10px 8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${fmtCurrency(t.revenue)}</td>
<td style="padding:10px 8px;font-size:13px;color:${t.conversionRate >= 20 ? SUCCESS : t.conversionRate >= 10 ? WARNING : ACCENT};text-align:center;border-top:1px solid ${BORDER};font-weight:bold;">${fmtPct(t.conversionRate)}</td>
<td style="padding:10px 8px;font-size:13px;color:${TEXT_DARK};text-align:center;border-top:1px solid ${BORDER};">${responseTimeStr(t.avgResponseMin)}</td>
</tr>`;
  }
}
