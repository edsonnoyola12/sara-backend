// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD MODULE - System status, analytics, and health monitoring
// Extracted from index.ts for better code organization
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { CacheService } from '../services/cacheService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SystemStatus {
  timestamp: string;
  overall_status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  version: string;
  services: {
    database: { status: string; latency_ms?: number; error?: string };
    cache: { status: string; available: boolean; stats?: any };
    meta_whatsapp: { status: string; configured: boolean };
    anthropic: { status: string; configured: boolean };
    google_calendar: { status: string; configured: boolean };
  };
  metrics: {
    total_leads: number;
    leads_today: number;
    leads_this_week: number;
    active_conversations: number;
    pending_followups: number;
    messages_today: number;
  };
  team: {
    total_members: number;
    active_members: number;
    on_duty: number;
  };
  recent_activity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
}

export interface AnalyticsDashboard {
  period_days: number;
  generated_at: string;
  funnel: {
    total_leads: number;
    leads_with_appointment: number;
    leads_converted: number;
    conversion_rate_appointment: string;
    conversion_rate_sale: string;
  };
  leads_by_period: {
    today: number;
    yesterday: number;
    this_week: number;
    last_week: number;
    this_month: number;
  };
  leads_by_source: Array<{ source: string; count: number; percentage: string }>;
  leads_by_status: Array<{ status: string; count: number; percentage: string }>;
  top_sellers: Array<{ name: string; leads: number; appointments: number; sales: number }>;
  response_times: {
    avg_first_response_minutes: number;
    avg_to_appointment_hours: number;
  };
  recent_conversions: Array<{ lead_name: string; property: string; date: string; seller: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM STATUS
// ═══════════════════════════════════════════════════════════════════════════

export async function getSystemStatus(
  supabase: SupabaseService,
  env: any,
  cache: CacheService | null
): Promise<SystemStatus> {
  const startTime = Date.now();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const status: SystemStatus = {
    timestamp: now.toISOString(),
    overall_status: 'healthy',
    uptime: 'running',
    version: '2.0.0',
    services: {
      database: { status: 'checking' },
      cache: { status: 'checking', available: false },
      meta_whatsapp: { status: 'unknown', configured: false },
      anthropic: { status: 'unknown', configured: false },
      google_calendar: { status: 'unknown', configured: false },
    },
    metrics: {
      total_leads: 0,
      leads_today: 0,
      leads_this_week: 0,
      active_conversations: 0,
      pending_followups: 0,
      messages_today: 0,
    },
    team: {
      total_members: 0,
      active_members: 0,
      on_duty: 0,
    },
    recent_activity: [],
  };

  // 1. Check Database
  try {
    const dbStart = Date.now();
    const { count: totalLeads } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true });

    status.services.database = {
      status: 'ok',
      latency_ms: Date.now() - dbStart,
    };
    status.metrics.total_leads = totalLeads || 0;
  } catch (e) {
    status.services.database = { status: 'error', error: String(e) };
    status.overall_status = 'degraded';
  }

  // 2. Check Cache
  if (cache && env.SARA_CACHE) {
    try {
      const cacheStats = cache.getStats();
      status.services.cache = {
        status: 'ok',
        available: true,
        stats: cacheStats,
      };
    } catch (e) {
      status.services.cache = { status: 'error', available: false };
    }
  } else {
    status.services.cache = { status: 'not_configured', available: false };
  }

  // 3. Check External Services Configuration
  status.services.meta_whatsapp = {
    status: env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID ? 'configured' : 'not_configured',
    configured: !!(env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID),
  };

  status.services.anthropic = {
    status: env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured',
    configured: !!env.ANTHROPIC_API_KEY,
  };

  status.services.google_calendar = {
    status: env.GOOGLE_CALENDAR_ID && env.GOOGLE_PRIVATE_KEY ? 'configured' : 'not_configured',
    configured: !!(env.GOOGLE_CALENDAR_ID && env.GOOGLE_PRIVATE_KEY),
  };

  // 4. Get Metrics
  try {
    // Leads today
    const { count: leadsToday } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart);
    status.metrics.leads_today = leadsToday || 0;

    // Leads this week
    const { count: leadsWeek } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekStart);
    status.metrics.leads_this_week = leadsWeek || 0;

    // Active conversations (leads with recent activity)
    const { count: activeConvos } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('last_contact', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    status.metrics.active_conversations = activeConvos || 0;

    // Pending followups
    const { count: pendingFollowups } = await supabase.client
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    status.metrics.pending_followups = pendingFollowups || 0;
  } catch (e) {
    console.error('Error getting metrics:', e);
  }

  // 5. Get Team Stats
  try {
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, active, is_on_duty');

    if (teamMembers) {
      status.team.total_members = teamMembers.length;
      status.team.active_members = teamMembers.filter((m: any) => m.active).length;
      status.team.on_duty = teamMembers.filter((m: any) => m.active && m.is_on_duty).length;
    }
  } catch (e) {
    console.error('Error getting team stats:', e);
  }

  // 6. Get Recent Activity
  try {
    const { data: recentLeads } = await supabase.client
      .from('leads')
      .select('name, created_at, source')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentLeads) {
      status.recent_activity = recentLeads.map((lead: any) => ({
        type: 'new_lead',
        description: `Nuevo lead: ${lead.name} (${lead.source || 'WhatsApp'})`,
        timestamp: lead.created_at,
      }));
    }
  } catch (e) {
    console.error('Error getting recent activity:', e);
  }

  // Determine overall status
  const serviceStatuses = Object.values(status.services);
  if (serviceStatuses.some((s: any) => s.status === 'error')) {
    status.overall_status = 'degraded';
  }
  if (status.services.database.status === 'error') {
    status.overall_status = 'down';
  }

  return status;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

export async function getAnalyticsDashboard(
  supabase: SupabaseService,
  periodDays: number
): Promise<AnalyticsDashboard> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const dashboard: AnalyticsDashboard = {
    period_days: periodDays,
    generated_at: now.toISOString(),
    funnel: {
      total_leads: 0,
      leads_with_appointment: 0,
      leads_converted: 0,
      conversion_rate_appointment: '0%',
      conversion_rate_sale: '0%',
    },
    leads_by_period: {
      today: 0,
      yesterday: 0,
      this_week: 0,
      last_week: 0,
      this_month: 0,
    },
    leads_by_source: [],
    leads_by_status: [],
    top_sellers: [],
    response_times: {
      avg_first_response_minutes: 0,
      avg_to_appointment_hours: 0,
    },
    recent_conversions: [],
  };

  try {
    // Get all leads in period
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, status, source, created_at, assigned_to, property_interest, first_response_at')
      .gte('created_at', periodStart.toISOString());

    if (!leads) return dashboard;

    // Funnel metrics
    dashboard.funnel.total_leads = leads.length;
    dashboard.funnel.leads_with_appointment = leads.filter((l: any) =>
      l.status === 'cita_agendada' || l.status === 'cita_realizada' || l.status === 'ganado'
    ).length;
    dashboard.funnel.leads_converted = leads.filter((l: any) => l.status === 'ganado').length;

    if (dashboard.funnel.total_leads > 0) {
      dashboard.funnel.conversion_rate_appointment =
        ((dashboard.funnel.leads_with_appointment / dashboard.funnel.total_leads) * 100).toFixed(1) + '%';
      dashboard.funnel.conversion_rate_sale =
        ((dashboard.funnel.leads_converted / dashboard.funnel.total_leads) * 100).toFixed(1) + '%';
    }

    // Leads by period
    dashboard.leads_by_period.today = leads.filter((l: any) =>
      new Date(l.created_at) >= todayStart
    ).length;
    dashboard.leads_by_period.yesterday = leads.filter((l: any) => {
      const d = new Date(l.created_at);
      return d >= yesterdayStart && d < todayStart;
    }).length;
    dashboard.leads_by_period.this_week = leads.filter((l: any) =>
      new Date(l.created_at) >= weekStart
    ).length;
    dashboard.leads_by_period.last_week = leads.filter((l: any) => {
      const d = new Date(l.created_at);
      return d >= lastWeekStart && d < weekStart;
    }).length;
    dashboard.leads_by_period.this_month = leads.filter((l: any) =>
      new Date(l.created_at) >= monthStart
    ).length;

    // Leads by source
    const sourceCount: Record<string, number> = {};
    leads.forEach((l: any) => {
      const src = l.source || 'WhatsApp';
      sourceCount[src] = (sourceCount[src] || 0) + 1;
    });
    dashboard.leads_by_source = Object.entries(sourceCount)
      .map(([source, count]) => ({
        source,
        count,
        percentage: ((count / leads.length) * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.count - a.count);

    // Leads by status
    const statusCount: Record<string, number> = {};
    leads.forEach((l: any) => {
      const st = l.status || 'nuevo';
      statusCount[st] = (statusCount[st] || 0) + 1;
    });
    dashboard.leads_by_status = Object.entries(statusCount)
      .map(([status, count]) => ({
        status,
        count,
        percentage: ((count / leads.length) * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.count - a.count);

    // Top sellers
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, name')
      .eq('active', true);

    if (teamMembers) {
      const sellerStats: Record<string, { name: string; leads: number; appointments: number; sales: number }> = {};

      teamMembers.forEach((tm: any) => {
        sellerStats[tm.id] = { name: tm.name, leads: 0, appointments: 0, sales: 0 };
      });

      leads.forEach((l: any) => {
        if (l.assigned_to && sellerStats[l.assigned_to]) {
          sellerStats[l.assigned_to].leads++;
          if (['cita_agendada', 'cita_realizada', 'ganado'].includes(l.status)) {
            sellerStats[l.assigned_to].appointments++;
          }
          if (l.status === 'ganado') {
            sellerStats[l.assigned_to].sales++;
          }
        }
      });

      dashboard.top_sellers = Object.values(sellerStats)
        .filter(s => s.leads > 0)
        .sort((a, b) => b.sales - a.sales || b.appointments - a.appointments || b.leads - a.leads)
        .slice(0, 10);
    }

    // Response times (simplified)
    const leadsWithResponse = leads.filter((l: any) => l.first_response_at && l.created_at);
    if (leadsWithResponse.length > 0) {
      const totalMinutes = leadsWithResponse.reduce((acc: number, l: any) => {
        const created = new Date(l.created_at).getTime();
        const responded = new Date(l.first_response_at).getTime();
        return acc + (responded - created) / 60000;
      }, 0);
      dashboard.response_times.avg_first_response_minutes = Math.round(totalMinutes / leadsWithResponse.length);
    }

    // Recent conversions
    const recentWins = leads
      .filter((l: any) => l.status === 'ganado')
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    dashboard.recent_conversions = recentWins.map((l: any) => ({
      lead_name: l.name || 'Sin nombre',
      property: l.property_interest || 'No especificada',
      date: l.created_at,
      seller: teamMembers?.find((tm: any) => tm.id === l.assigned_to)?.name || 'No asignado'
    }));

  } catch (e) {
    console.error('Error generating analytics:', e);
  }

  return dashboard;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS - HTML page generation
// ═══════════════════════════════════════════════════════════════════════════

export function renderAnalyticsPage(analytics: AnalyticsDashboard): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SARA Analytics - Dashboard de Conversion</title>
  <meta http-equiv="refresh" content="60">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e2e8f0;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #334155;
    }
    .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .header p { color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card {
      background: rgba(30, 41, 59, 0.8);
      border-radius: 1rem;
      padding: 1.5rem;
      border: 1px solid #334155;
      backdrop-filter: blur(10px);
    }
    .card h2 {
      font-size: 0.875rem;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 1rem;
      letter-spacing: 0.05em;
    }
    .funnel { grid-column: span 2; }
    .funnel-stages {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .funnel-stage {
      flex: 1;
      text-align: center;
      padding: 1.5rem;
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.1) 0%, rgba(56, 189, 248, 0.05) 100%);
      border-radius: 0.75rem;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .funnel-stage .number {
      font-size: 2.5rem;
      font-weight: 700;
      color: #38bdf8;
    }
    .funnel-stage .label { color: #94a3b8; margin-top: 0.5rem; }
    .funnel-stage .rate { color: #22c55e; font-size: 0.875rem; margin-top: 0.25rem; }
    .arrow {
      font-size: 2rem;
      color: #475569;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid #334155;
    }
    .metric-row:last-child { border-bottom: none; }
    .metric-value { font-weight: 600; color: #38bdf8; }
    .bar-chart { margin-top: 1rem; }
    .bar-item {
      display: flex;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .bar-label { width: 100px; font-size: 0.875rem; }
    .bar-container {
      flex: 1;
      height: 24px;
      background: #1e293b;
      border-radius: 4px;
      overflow: hidden;
      margin: 0 0.75rem;
    }
    .bar {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0.5rem;
      font-size: 0.75rem;
      min-width: 30px;
    }
    .bar-count { font-size: 0.875rem; width: 40px; text-align: right; }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    .table th, .table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    .table th { color: #94a3b8; font-weight: 500; }
    .conversion-item {
      padding: 0.75rem 0;
      border-bottom: 1px solid #334155;
    }
    .conversion-item:last-child { border-bottom: none; }
    .conversion-name { font-weight: 600; }
    .conversion-details { font-size: 0.875rem; color: #94a3b8; }
    .timestamp { text-align: center; margin-top: 2rem; color: #64748b; font-size: 0.75rem; }
    .period-selector {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      justify-content: center;
    }
    .period-btn {
      padding: 0.5rem 1rem;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      color: #e2e8f0;
      cursor: pointer;
      text-decoration: none;
    }
    .period-btn:hover, .period-btn.active { background: #3b82f6; border-color: #3b82f6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SARA Analytics</h1>
      <p>Dashboard de Conversion - Ultimos ${analytics.period_days} dias</p>
    </div>

    <div class="period-selector">
      <a href="/analytics?period=7" class="period-btn ${analytics.period_days === 7 ? 'active' : ''}">7 dias</a>
      <a href="/analytics?period=30" class="period-btn ${analytics.period_days === 30 ? 'active' : ''}">30 dias</a>
      <a href="/analytics?period=90" class="period-btn ${analytics.period_days === 90 ? 'active' : ''}">90 dias</a>
    </div>

    <div class="grid">
      <!-- Funnel -->
      <div class="card funnel">
        <h2>Embudo de Conversion</h2>
        <div class="funnel-stages">
          <div class="funnel-stage">
            <div class="number">${analytics.funnel.total_leads}</div>
            <div class="label">Leads Totales</div>
          </div>
          <div class="arrow">→</div>
          <div class="funnel-stage">
            <div class="number">${analytics.funnel.leads_with_appointment}</div>
            <div class="label">Con Cita</div>
            <div class="rate">${analytics.funnel.conversion_rate_appointment}</div>
          </div>
          <div class="arrow">→</div>
          <div class="funnel-stage">
            <div class="number">${analytics.funnel.leads_converted}</div>
            <div class="label">Ventas</div>
            <div class="rate">${analytics.funnel.conversion_rate_sale}</div>
          </div>
        </div>
      </div>

      <!-- Leads por periodo -->
      <div class="card">
        <h2>Leads por Periodo</h2>
        <div class="metric-row">
          <span>Hoy</span>
          <span class="metric-value">${analytics.leads_by_period.today}</span>
        </div>
        <div class="metric-row">
          <span>Ayer</span>
          <span class="metric-value">${analytics.leads_by_period.yesterday}</span>
        </div>
        <div class="metric-row">
          <span>Esta semana</span>
          <span class="metric-value">${analytics.leads_by_period.this_week}</span>
        </div>
        <div class="metric-row">
          <span>Semana pasada</span>
          <span class="metric-value">${analytics.leads_by_period.last_week}</span>
        </div>
        <div class="metric-row">
          <span>Este mes</span>
          <span class="metric-value">${analytics.leads_by_period.this_month}</span>
        </div>
      </div>

      <!-- Leads por fuente -->
      <div class="card">
        <h2>Leads por Fuente</h2>
        <div class="bar-chart">
          ${analytics.leads_by_source.slice(0, 5).map(s => `
            <div class="bar-item">
              <span class="bar-label">${s.source}</span>
              <div class="bar-container">
                <div class="bar" style="width: ${s.percentage}">${s.percentage}</div>
              </div>
              <span class="bar-count">${s.count}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Top Vendedores -->
      <div class="card">
        <h2>Top Vendedores</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Leads</th>
              <th>Citas</th>
              <th>Ventas</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.top_sellers.slice(0, 5).map(s => `
              <tr>
                <td>${s.name}</td>
                <td>${s.leads}</td>
                <td>${s.appointments}</td>
                <td style="color: #22c55e; font-weight: 600;">${s.sales}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Status de Leads -->
      <div class="card">
        <h2>Estado de Leads</h2>
        <div class="bar-chart">
          ${analytics.leads_by_status.slice(0, 6).map(s => `
            <div class="bar-item">
              <span class="bar-label">${s.status}</span>
              <div class="bar-container">
                <div class="bar" style="width: ${s.percentage}">${s.percentage}</div>
              </div>
              <span class="bar-count">${s.count}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Conversiones Recientes -->
      <div class="card">
        <h2>Ventas Recientes</h2>
        ${analytics.recent_conversions.length > 0 ? analytics.recent_conversions.map(c => `
          <div class="conversion-item">
            <div class="conversion-name">${c.lead_name}</div>
            <div class="conversion-details">${c.property} - ${c.seller}</div>
          </div>
        `).join('') : '<p style="color: #64748b;">Sin ventas en este periodo</p>'}
      </div>
    </div>

    <p class="timestamp">
      Ultima actualizacion: ${new Date(analytics.generated_at).toLocaleString('es-MX')} - Auto-refresh cada 60s
    </p>
  </div>
</body>
</html>`;
}

export function renderStatusPage(status: SystemStatus): string {
  const statusColor = status.overall_status === 'healthy' ? '#22c55e' :
                      status.overall_status === 'degraded' ? '#f59e0b' : '#ef4444';
  const statusEmoji = status.overall_status === 'healthy' ? 'OK' :
                      status.overall_status === 'degraded' ? 'WARN' : 'DOWN';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SARA Backend - Status</title>
  <meta http-equiv="refresh" content="30">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #334155;
    }
    .header h1 { font-size: 1.5rem; }
    .status-badge {
      background: ${statusColor};
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.875rem;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
    .card {
      background: #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
      border: 1px solid #334155;
    }
    .card h2 {
      font-size: 0.875rem;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 1rem;
      letter-spacing: 0.05em;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid #334155;
    }
    .metric:last-child { border-bottom: none; }
    .metric-value { font-weight: 600; font-size: 1.25rem; }
    .metric-label { color: #94a3b8; }
    .service-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid #334155;
    }
    .service-row:last-child { border-bottom: none; }
    .service-status {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .status-ok { background: #166534; color: #86efac; }
    .status-error { background: #991b1b; color: #fca5a5; }
    .status-warning { background: #92400e; color: #fcd34d; }
    .activity-item {
      padding: 0.75rem 0;
      border-bottom: 1px solid #334155;
      font-size: 0.875rem;
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-time { color: #64748b; font-size: 0.75rem; }
    .timestamp { color: #64748b; font-size: 0.75rem; }
    .big-number { font-size: 2.5rem; font-weight: 700; color: #38bdf8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SARA Backend Status</h1>
      <span class="status-badge">${statusEmoji} ${status.overall_status.toUpperCase()}</span>
    </div>

    <div class="grid">
      <!-- Metrics Overview -->
      <div class="card">
        <h2>Metricas</h2>
        <div class="metric">
          <span class="metric-label">Total Leads</span>
          <span class="metric-value">${status.metrics.total_leads.toLocaleString()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Leads Hoy</span>
          <span class="metric-value">${status.metrics.leads_today}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Leads Esta Semana</span>
          <span class="metric-value">${status.metrics.leads_this_week}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Conversaciones Activas (24h)</span>
          <span class="metric-value">${status.metrics.active_conversations}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Followups Pendientes</span>
          <span class="metric-value">${status.metrics.pending_followups}</span>
        </div>
      </div>

      <!-- Services Status -->
      <div class="card">
        <h2>Servicios</h2>
        <div class="service-row">
          <span>Database (Supabase)</span>
          <span class="service-status ${status.services.database.status === 'ok' ? 'status-ok' : 'status-error'}">
            ${status.services.database.status === 'ok' ? `OK (${status.services.database.latency_ms}ms)` : status.services.database.status}
          </span>
        </div>
        <div class="service-row">
          <span>Cache (KV)</span>
          <span class="service-status ${status.services.cache.available ? 'status-ok' : 'status-warning'}">
            ${status.services.cache.available ? 'OK' : 'No disponible'}
          </span>
        </div>
        <div class="service-row">
          <span>WhatsApp (Meta)</span>
          <span class="service-status ${status.services.meta_whatsapp.configured ? 'status-ok' : 'status-warning'}">
            ${status.services.meta_whatsapp.configured ? 'Configurado' : 'No configurado'}
          </span>
        </div>
        <div class="service-row">
          <span>IA (Claude)</span>
          <span class="service-status ${status.services.anthropic.configured ? 'status-ok' : 'status-warning'}">
            ${status.services.anthropic.configured ? 'Configurado' : 'No configurado'}
          </span>
        </div>
        <div class="service-row">
          <span>Calendar (Google)</span>
          <span class="service-status ${status.services.google_calendar.configured ? 'status-ok' : 'status-warning'}">
            ${status.services.google_calendar.configured ? 'Configurado' : 'No configurado'}
          </span>
        </div>
      </div>

      <!-- Team Status -->
      <div class="card">
        <h2>Equipo</h2>
        <div class="metric">
          <span class="metric-label">Total Miembros</span>
          <span class="metric-value">${status.team.total_members}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Activos</span>
          <span class="metric-value">${status.team.active_members}</span>
        </div>
        <div class="metric">
          <span class="metric-label">De Guardia</span>
          <span class="metric-value">${status.team.on_duty}</span>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="card">
        <h2>Actividad Reciente</h2>
        ${status.recent_activity.length > 0 ? status.recent_activity.map(activity => `
          <div class="activity-item">
            <div>${activity.description}</div>
            <div class="activity-time">${new Date(activity.timestamp).toLocaleString('es-MX')}</div>
          </div>
        `).join('') : '<div class="activity-item">Sin actividad reciente</div>'}
      </div>
    </div>

    <div style="margin-top: 2rem; text-align: center;">
      <p class="timestamp">Ultima actualizacion: ${new Date(status.timestamp).toLocaleString('es-MX')}</p>
      <p class="timestamp">Auto-refresh cada 30 segundos</p>
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH STATUS
// ═══════════════════════════════════════════════════════════════════════════

export async function getHealthStatus(supabase: SupabaseService): Promise<any> {
  const checks: any = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {}
  };

  try {
    // Check Supabase
    const { count: leadsCount } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true });
    checks.checks.supabase = { status: 'ok', leads_count: leadsCount };
  } catch (e) {
    checks.checks.supabase = { status: 'error', error: String(e) };
    checks.status = 'degraded';
  }

  try {
    // Check follow-ups pendientes
    const { count: followupsCount } = await supabase.client
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    checks.checks.followups = { status: 'ok', pending: followupsCount };
  } catch (e) {
    checks.checks.followups = { status: 'error' };
  }

  try {
    // Check videos pendientes
    const { count: videosCount } = await supabase.client
      .from('pending_videos')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    checks.checks.videos = { status: 'ok', pending: videosCount };
  } catch (e) {
    checks.checks.videos = { status: 'error' };
  }

  // Metricas del dia
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

  try {
    const { count: leadsHoy } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioHoy);

    const { count: citasHoy } = await supabase.client
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('scheduled_date', hoy.toISOString().split('T')[0]);

    checks.metrics = {
      leads_today: leadsHoy || 0,
      appointments_today: citasHoy || 0
    };
  } catch (e) {
    checks.metrics = { error: 'Failed to fetch' };
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP - Export critical data
// ═══════════════════════════════════════════════════════════════════════════

export async function exportBackup(supabase: SupabaseService): Promise<any> {
  const backup: any = {
    generated_at: new Date().toISOString(),
    tables: {}
  };

  try {
    // Leads (ultimos 90 dias)
    const hace90dias = new Date();
    hace90dias.setDate(hace90dias.getDate() - 90);

    const { data: leads } = await supabase.client
      .from('leads')
      .select('*')
      .gte('created_at', hace90dias.toISOString());
    backup.tables.leads = { count: leads?.length || 0, data: leads };

    // Appointments (ultimos 90 dias)
    const { data: appointments } = await supabase.client
      .from('appointments')
      .select('*')
      .gte('created_at', hace90dias.toISOString());
    backup.tables.appointments = { count: appointments?.length || 0, data: appointments };

    // Team members
    const { data: team } = await supabase.client
      .from('team_members')
      .select('*');
    backup.tables.team_members = { count: team?.length || 0, data: team };

    // Followup rules
    const { data: rules } = await supabase.client
      .from('followup_rules')
      .select('*');
    backup.tables.followup_rules = { count: rules?.length || 0, data: rules };

    // Properties
    const { data: properties } = await supabase.client
      .from('properties')
      .select('*');
    backup.tables.properties = { count: properties?.length || 0, data: properties };

    backup.status = 'success';
  } catch (e) {
    backup.status = 'error';
    backup.error = String(e);
  }

  return backup;
}
