// ═══════════════════════════════════════════════════════════════════════════
// PDF REPORT SERVICE - Generador de reportes PDF
// Generates PDF reports for weekly/monthly summaries
// Note: Uses HTML-to-PDF approach via external service or simple text reports
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ReportConfig {
  type: 'weekly' | 'monthly' | 'quarterly' | 'custom';
  title: string;
  start_date: string;
  end_date: string;
  include_sections: ReportSection[];
  recipient_name?: string;
  recipient_role?: 'ceo' | 'vendedor' | 'coordinador';
  vendor_id?: string;
}

export type ReportSection =
  | 'executive_summary'
  | 'leads_overview'
  | 'sales_metrics'
  | 'pipeline_status'
  | 'team_performance'
  | 'appointments'
  | 'sources_analysis'
  | 'goals_progress'
  | 'recommendations';

export interface ReportData {
  config: ReportConfig;
  generated_at: string;

  // Executive Summary
  summary?: {
    total_leads: number;
    new_leads: number;
    qualified_leads: number;
    appointments_scheduled: number;
    appointments_completed: number;
    sales_closed: number;
    total_revenue: number;
    conversion_rate: string;
    comparison_vs_previous: string;
  };

  // Leads Overview
  leads?: {
    by_status: Array<{ status: string; count: number; percent: string }>;
    by_source: Array<{ source: string; count: number; conversion: string }>;
    by_development: Array<{ development: string; count: number; sales: number }>;
    hot_leads: Array<{ name: string; score: number; interest: string }>;
  };

  // Sales Metrics
  sales?: {
    closed_count: number;
    revenue: number;
    avg_deal_size: number;
    days_to_close: number;
    top_performers: Array<{ name: string; sales: number; revenue: number }>;
    by_development: Array<{ development: string; sales: number; revenue: number }>;
  };

  // Pipeline Status
  pipeline?: {
    total_value: number;
    by_stage: Array<{ stage: string; count: number; value: number }>;
    expected_close_30d: number;
    at_risk: Array<{ name: string; reason: string; days_stuck: number }>;
  };

  // Team Performance
  team?: {
    active_members: number;
    total_leads_handled: number;
    avg_response_time: string;
    by_member: Array<{
      name: string;
      leads: number;
      appointments: number;
      sales: number;
      response_time: string;
    }>;
  };

  // Appointments
  appointments?: {
    scheduled: number;
    completed: number;
    no_show_rate: string;
    by_development: Array<{ development: string; scheduled: number; completed: number }>;
  };

  // Goals Progress
  goals?: {
    company_goal: number;
    current_sales: number;
    progress_percent: string;
    projected_end_month: number;
    status: 'on_track' | 'at_risk' | 'behind';
    by_vendor: Array<{ name: string; goal: number; current: number; percent: string }>;
  };

  // Recommendations
  recommendations?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PDFReportService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATE REPORT DATA
  // ═══════════════════════════════════════════════════════════════════════════

  async generateReportData(config: ReportConfig): Promise<ReportData> {
    const reportData: ReportData = {
      config,
      generated_at: new Date().toISOString()
    };

    // Fetch data based on config
    const startDate = new Date(config.start_date);
    const endDate = new Date(config.end_date);

    // Get leads in period
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    const allLeads = leads || [];

    // Get appointments
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('*')
      .gte('scheduled_date', startDate.toISOString().split('T')[0])
      .lte('scheduled_date', endDate.toISOString().split('T')[0]);

    const allAppointments = appointments || [];

    // Get team members
    const { data: team } = await this.supabase.client
      .from('team_members')
      .select('*')
      .eq('active', true)
      .eq('role', 'vendedor');

    const teamMembers = team || [];

    // Generate sections based on config
    for (const section of config.include_sections) {
      switch (section) {
        case 'executive_summary':
          reportData.summary = await this.generateExecutiveSummary(allLeads, allAppointments, startDate, endDate);
          break;
        case 'leads_overview':
          reportData.leads = this.generateLeadsOverview(allLeads);
          break;
        case 'sales_metrics':
          reportData.sales = await this.generateSalesMetrics(allLeads, teamMembers);
          break;
        case 'pipeline_status':
          reportData.pipeline = this.generatePipelineStatus(allLeads);
          break;
        case 'team_performance':
          reportData.team = await this.generateTeamPerformance(allLeads, allAppointments, teamMembers, config.vendor_id);
          break;
        case 'appointments':
          reportData.appointments = this.generateAppointmentsSection(allAppointments);
          break;
        case 'goals_progress':
          reportData.goals = await this.generateGoalsProgress(allLeads, teamMembers, startDate);
          break;
        case 'recommendations':
          reportData.recommendations = this.generateRecommendations(reportData);
          break;
      }
    }

    return reportData;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  private async generateExecutiveSummary(
    leads: any[],
    appointments: any[],
    startDate: Date,
    endDate: Date
  ): Promise<ReportData['summary']> {
    // Get previous period for comparison
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const prevStart = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

    const { data: prevLeads } = await this.supabase.client
      .from('leads')
      .select('id, status')
      .gte('created_at', prevStart.toISOString())
      .lt('created_at', startDate.toISOString());

    const prevPeriod = prevLeads || [];

    const newLeads = leads.filter(l => l.funnel_status === 'new').length;
    const qualified = leads.filter(l => ['qualified', 'visit_scheduled', 'visited', 'negotiating'].includes(l.funnel_status)).length;
    const soldLeads = leads.filter(l => ['sold', 'reserved', 'delivered'].includes(l.status));
    const salesClosed = soldLeads.length;
    const totalRevenue = soldLeads.reduce((sum, l) => sum + (Number(l.budget) || 0), 0);

    const aptsScheduled = appointments.length;
    const aptsCompleted = appointments.filter(a => a.status === 'completed').length;

    const prevSales = prevPeriod.filter(l => ['sold', 'reserved'].includes(l.status)).length;
    const changePercent = prevSales > 0
      ? Math.round(((salesClosed - prevSales) / prevSales) * 100)
      : salesClosed > 0 ? 100 : 0;

    const conversionRate = leads.length > 0
      ? ((salesClosed / leads.length) * 100).toFixed(1) + '%'
      : '0%';

    return {
      total_leads: leads.length,
      new_leads: newLeads,
      qualified_leads: qualified,
      appointments_scheduled: aptsScheduled,
      appointments_completed: aptsCompleted,
      sales_closed: salesClosed,
      total_revenue: totalRevenue,
      conversion_rate: conversionRate,
      comparison_vs_previous: `${changePercent >= 0 ? '+' : ''}${changePercent}% vs periodo anterior`
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEADS OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  private generateLeadsOverview(leads: any[]): ReportData['leads'] {
    const total = leads.length || 1;

    // By status
    const statusCount: Record<string, number> = {};
    for (const lead of leads) {
      const status = lead.funnel_status || 'new';
      statusCount[status] = (statusCount[status] || 0) + 1;
    }

    const byStatus = Object.entries(statusCount)
      .map(([status, count]) => ({
        status: this.translateStatus(status),
        count,
        percent: ((count / total) * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.count - a.count);

    // By source
    const sourceStats: Record<string, { count: number; sold: number }> = {};
    for (const lead of leads) {
      const source = lead.source || 'Directo';
      if (!sourceStats[source]) sourceStats[source] = { count: 0, sold: 0 };
      sourceStats[source].count++;
      if (['sold', 'reserved'].includes(lead.status)) {
        sourceStats[source].sold++;
      }
    }

    const bySource = Object.entries(sourceStats)
      .map(([source, stats]) => ({
        source,
        count: stats.count,
        conversion: stats.count > 0 ? ((stats.sold / stats.count) * 100).toFixed(1) + '%' : '0%'
      }))
      .sort((a, b) => b.count - a.count);

    // By development
    const devStats: Record<string, { count: number; sales: number }> = {};
    for (const lead of leads) {
      const dev = lead.property_interest || 'Sin especificar';
      if (!devStats[dev]) devStats[dev] = { count: 0, sales: 0 };
      devStats[dev].count++;
      if (['sold', 'reserved'].includes(lead.status)) {
        devStats[dev].sales++;
      }
    }

    const byDevelopment = Object.entries(devStats)
      .map(([development, stats]) => ({
        development,
        count: stats.count,
        sales: stats.sales
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Hot leads
    const hotLeads = leads
      .filter(l => l.temperature === 'HOT' || (l.score && Number(l.score) >= 70))
      .slice(0, 10)
      .map(l => ({
        name: l.name || 'Sin nombre',
        score: Number(l.score) || 0,
        interest: l.property_interest || 'No especificado'
      }));

    return {
      by_status: byStatus,
      by_source: bySource,
      by_development: byDevelopment,
      hot_leads: hotLeads
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  private async generateSalesMetrics(leads: any[], teamMembers: any[]): Promise<ReportData['sales']> {
    const soldLeads = leads.filter(l => ['sold', 'reserved', 'delivered'].includes(l.status));
    const revenue = soldLeads.reduce((sum, l) => sum + (Number(l.budget) || 0), 0);
    const avgDealSize = soldLeads.length > 0 ? Math.round(revenue / soldLeads.length) : 0;

    // Days to close
    const daysToClose = soldLeads.map(l => {
      const created = new Date(l.created_at).getTime();
      const closed = new Date(l.updated_at).getTime();
      return Math.floor((closed - created) / (24 * 60 * 60 * 1000));
    });
    const avgDaysToClose = daysToClose.length > 0
      ? Math.round(daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length)
      : 0;

    // Top performers
    const salesByVendor: Record<string, { name: string; sales: number; revenue: number }> = {};
    for (const lead of soldLeads) {
      if (lead.assigned_to) {
        const vendor = teamMembers.find(t => t.id === lead.assigned_to);
        const name = vendor?.name || 'Desconocido';
        if (!salesByVendor[lead.assigned_to]) {
          salesByVendor[lead.assigned_to] = { name, sales: 0, revenue: 0 };
        }
        salesByVendor[lead.assigned_to].sales++;
        salesByVendor[lead.assigned_to].revenue += Number(lead.budget) || 0;
      }
    }

    const topPerformers = Object.values(salesByVendor)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    // By development
    const salesByDev: Record<string, { sales: number; revenue: number }> = {};
    for (const lead of soldLeads) {
      const dev = lead.property_interest || 'Sin especificar';
      if (!salesByDev[dev]) salesByDev[dev] = { sales: 0, revenue: 0 };
      salesByDev[dev].sales++;
      salesByDev[dev].revenue += Number(lead.budget) || 0;
    }

    const byDevelopment = Object.entries(salesByDev)
      .map(([development, stats]) => ({
        development,
        sales: stats.sales,
        revenue: stats.revenue
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      closed_count: soldLeads.length,
      revenue,
      avg_deal_size: avgDealSize,
      days_to_close: avgDaysToClose,
      top_performers: topPerformers,
      by_development: byDevelopment
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  private generatePipelineStatus(leads: any[]): ReportData['pipeline'] {
    const activeLeads = leads.filter(l =>
      !['sold', 'delivered', 'lost', 'inactive'].includes(l.status)
    );

    const totalValue = activeLeads.reduce((sum, l) => sum + (Number(l.budget) || 2500000), 0);

    // By stage
    const stages = ['new', 'contacted', 'qualified', 'visit_scheduled', 'visited', 'negotiating', 'reserved'];
    const byStage = stages.map(stage => {
      const stageLeads = activeLeads.filter(l => l.funnel_status === stage);
      return {
        stage: this.translateStatus(stage),
        count: stageLeads.length,
        value: stageLeads.reduce((sum, l) => sum + (Number(l.budget) || 2500000), 0)
      };
    }).filter(s => s.count > 0);

    // Expected close in 30 days
    const expected30d = activeLeads
      .filter(l => ['negotiating', 'reserved'].includes(l.funnel_status))
      .reduce((sum, l) => sum + (Number(l.budget) || 2500000), 0);

    // At risk leads (stuck more than 7 days)
    const now = Date.now();
    const atRisk = activeLeads
      .filter(l => {
        const lastActivity = new Date(l.last_activity_at || l.updated_at).getTime();
        const daysSince = (now - lastActivity) / (24 * 60 * 60 * 1000);
        return daysSince > 7;
      })
      .slice(0, 10)
      .map(l => {
        const daysSince = Math.floor((now - new Date(l.last_activity_at || l.updated_at).getTime()) / (24 * 60 * 60 * 1000));
        return {
          name: l.name || 'Sin nombre',
          reason: daysSince > 14 ? 'Sin contacto' : 'Estancado',
          days_stuck: daysSince
        };
      });

    return {
      total_value: totalValue,
      by_stage: byStage,
      expected_close_30d: expected30d,
      at_risk: atRisk
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════

  private async generateTeamPerformance(
    leads: any[],
    appointments: any[],
    teamMembers: any[],
    vendorId?: string
  ): Promise<ReportData['team']> {
    const membersToAnalyze = vendorId
      ? teamMembers.filter(t => t.id === vendorId)
      : teamMembers;

    const byMember = membersToAnalyze.map(member => {
      const memberLeads = leads.filter(l => l.assigned_to === member.id);
      const memberApts = appointments.filter(a => a.vendor_id === member.id);
      const memberSales = memberLeads.filter(l => ['sold', 'reserved'].includes(l.status));

      return {
        name: member.name,
        leads: memberLeads.length,
        appointments: memberApts.filter(a => a.status === 'completed').length,
        sales: memberSales.length,
        response_time: 'N/A' // Would need more detailed tracking
      };
    }).sort((a, b) => b.sales - a.sales);

    return {
      active_members: membersToAnalyze.length,
      total_leads_handled: leads.filter(l => l.assigned_to).length,
      avg_response_time: 'N/A',
      by_member: byMember
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPOINTMENTS SECTION
  // ═══════════════════════════════════════════════════════════════════════════

  private generateAppointmentsSection(appointments: any[]): ReportData['appointments'] {
    const completed = appointments.filter(a => a.status === 'completed').length;
    const noShow = appointments.filter(a => a.status === 'no_show').length;
    const noShowRate = appointments.length > 0
      ? ((noShow / appointments.length) * 100).toFixed(1) + '%'
      : '0%';

    // By development
    const devStats: Record<string, { scheduled: number; completed: number }> = {};
    for (const apt of appointments) {
      const dev = apt.development || apt.property_interest || 'Sin especificar';
      if (!devStats[dev]) devStats[dev] = { scheduled: 0, completed: 0 };
      devStats[dev].scheduled++;
      if (apt.status === 'completed') devStats[dev].completed++;
    }

    const byDevelopment = Object.entries(devStats)
      .map(([development, stats]) => ({
        development,
        scheduled: stats.scheduled,
        completed: stats.completed
      }))
      .sort((a, b) => b.scheduled - a.scheduled);

    return {
      scheduled: appointments.length,
      completed,
      no_show_rate: noShowRate,
      by_development: byDevelopment
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOALS PROGRESS
  // ═══════════════════════════════════════════════════════════════════════════

  private async generateGoalsProgress(
    leads: any[],
    teamMembers: any[],
    periodStart: Date
  ): Promise<ReportData['goals']> {
    const monthKey = periodStart.toISOString().slice(0, 7);

    // Get company goal
    const { data: companyGoal } = await this.supabase.client
      .from('monthly_goals')
      .select('company_goal')
      .eq('month', monthKey)
      .single();

    const goal = companyGoal?.company_goal || 5;
    const currentSales = leads.filter(l => ['sold', 'reserved'].includes(l.status)).length;
    const progressPercent = ((currentSales / goal) * 100).toFixed(1) + '%';

    // Days progress in month
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();
    const daysRemaining = daysInMonth - daysPassed;
    const avgPerDay = daysPassed > 0 ? currentSales / daysPassed : 0;
    const projected = Math.round(currentSales + avgPerDay * daysRemaining);

    const status: 'on_track' | 'at_risk' | 'behind' =
      currentSales >= goal ? 'on_track' :
      projected >= goal ? 'on_track' :
      projected >= goal * 0.8 ? 'at_risk' : 'behind';

    // By vendor
    const { data: vendorGoals } = await this.supabase.client
      .from('vendor_monthly_goals')
      .select('vendor_id, goal')
      .eq('month', monthKey);

    const byVendor = teamMembers.map(member => {
      const vendorGoal = vendorGoals?.find(vg => vg.vendor_id === member.id)?.goal || 1;
      const vendorSales = leads.filter(l =>
        l.assigned_to === member.id && ['sold', 'reserved'].includes(l.status)
      ).length;

      return {
        name: member.name,
        goal: vendorGoal,
        current: vendorSales,
        percent: ((vendorSales / vendorGoal) * 100).toFixed(0) + '%'
      };
    }).sort((a, b) => parseFloat(b.percent) - parseFloat(a.percent));

    return {
      company_goal: goal,
      current_sales: currentSales,
      progress_percent: progressPercent,
      projected_end_month: projected,
      status,
      by_vendor: byVendor
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private generateRecommendations(data: ReportData): string[] {
    const recommendations: string[] = [];

    // Based on summary
    if (data.summary) {
      if (data.summary.appointments_completed < data.summary.appointments_scheduled * 0.7) {
        recommendations.push('Alta tasa de no-show en citas. Implementar confirmaciones 24h antes.');
      }
      if (parseFloat(data.summary.conversion_rate) < 5) {
        recommendations.push('Tasa de conversión baja. Revisar calidad de leads y proceso de calificación.');
      }
    }

    // Based on pipeline
    if (data.pipeline && data.pipeline.at_risk.length > 5) {
      recommendations.push(`${data.pipeline.at_risk.length} leads en riesgo. Priorizar seguimiento urgente.`);
    }

    // Based on goals
    if (data.goals) {
      if (data.goals.status === 'behind') {
        recommendations.push('Meta en riesgo. Enfocarse en leads calientes y negociaciones avanzadas.');
      } else if (data.goals.status === 'at_risk') {
        recommendations.push('Avance lento hacia meta. Aumentar actividad de prospección.');
      }
    }

    // Based on sources
    if (data.leads && data.leads.by_source.length > 0) {
      const bestSource = data.leads.by_source.reduce((best, current) =>
        parseFloat(current.conversion) > parseFloat(best.conversion) ? current : best
      );
      if (parseFloat(bestSource.conversion) > 10) {
        recommendations.push(`${bestSource.source} tiene mejor conversión (${bestSource.conversion}). Aumentar inversión.`);
      }
    }

    // General recommendations
    recommendations.push('Mantener seguimiento dentro de 24 horas con leads nuevos.');
    recommendations.push('Programar revisión semanal de leads estancados.');

    return recommendations.slice(0, 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT FOR WHATSAPP
  // ═══════════════════════════════════════════════════════════════════════════

  formatForWhatsApp(data: ReportData): string {
    let msg = `📊 *${data.config.title}*\n`;
    msg += `📅 ${this.formatDate(data.config.start_date)} - ${this.formatDate(data.config.end_date)}\n\n`;

    // Executive Summary
    if (data.summary) {
      msg += `━━━ *RESUMEN EJECUTIVO* ━━━\n\n`;
      msg += `📈 *Leads:* ${data.summary.total_leads} (${data.summary.new_leads} nuevos)\n`;
      msg += `📅 *Citas:* ${data.summary.appointments_completed}/${data.summary.appointments_scheduled}\n`;
      msg += `💰 *Ventas:* ${data.summary.sales_closed}\n`;
      msg += `💵 *Revenue:* $${this.formatNumber(data.summary.total_revenue)}\n`;
      msg += `📊 *Conversión:* ${data.summary.conversion_rate}\n`;
      msg += `${data.summary.comparison_vs_previous}\n\n`;
    }

    // Sales Metrics
    if (data.sales && data.sales.top_performers.length > 0) {
      msg += `━━━ *TOP VENDEDORES* ━━━\n\n`;
      data.sales.top_performers.slice(0, 3).forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        msg += `${medal} ${p.name}: ${p.sales} ventas ($${this.formatNumber(p.revenue)})\n`;
      });
      msg += `\n`;
    }

    // Goals Progress
    if (data.goals) {
      const statusEmoji = data.goals.status === 'on_track' ? '✅' :
                         data.goals.status === 'at_risk' ? '⚠️' : '🔴';
      msg += `━━━ *META DEL MES* ━━━\n\n`;
      msg += `${statusEmoji} ${data.goals.current_sales}/${data.goals.company_goal} (${data.goals.progress_percent})\n`;
      msg += `📊 Proyección: ${data.goals.projected_end_month} ventas\n\n`;
    }

    // Pipeline
    if (data.pipeline) {
      msg += `━━━ *PIPELINE* ━━━\n\n`;
      msg += `💼 Valor total: $${this.formatNumber(data.pipeline.total_value)}\n`;
      msg += `🎯 Cierre esperado 30d: $${this.formatNumber(data.pipeline.expected_close_30d)}\n`;
      if (data.pipeline.at_risk.length > 0) {
        msg += `⚠️ ${data.pipeline.at_risk.length} leads en riesgo\n`;
      }
      msg += `\n`;
    }

    // Recommendations
    if (data.recommendations && data.recommendations.length > 0) {
      msg += `━━━ *RECOMENDACIONES* ━━━\n\n`;
      for (const rec of data.recommendations.slice(0, 4)) {
        msg += `💡 ${rec}\n`;
      }
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATE HTML REPORT (for PDF conversion)
  // ═══════════════════════════════════════════════════════════════════════════

  generateHTML(data: ReportData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${data.config.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h2 { color: #2980b9; margin-top: 30px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
    .metric-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 32px; font-weight: bold; color: #2c3e50; }
    .metric-label { color: #7f8c8d; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #3498db; color: white; }
    tr:hover { background: #f5f5f5; }
    .status-on_track { color: #27ae60; }
    .status-at_risk { color: #f39c12; }
    .status-behind { color: #e74c3c; }
    .recommendations { background: #ffeaa7; padding: 20px; border-radius: 8px; margin-top: 30px; }
    .recommendations li { margin: 10px 0; }
    .footer { margin-top: 40px; text-align: center; color: #95a5a6; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${data.config.title}</h1>
  <p><strong>Periodo:</strong> ${this.formatDate(data.config.start_date)} - ${this.formatDate(data.config.end_date)}</p>
  <p><strong>Generado:</strong> ${new Date(data.generated_at).toLocaleString('es-MX')}</p>

  ${data.summary ? `
  <h2>Resumen Ejecutivo</h2>
  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-value">${data.summary.total_leads}</div>
      <div class="metric-label">Total Leads</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${data.summary.sales_closed}</div>
      <div class="metric-label">Ventas Cerradas</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">$${this.formatNumber(data.summary.total_revenue)}</div>
      <div class="metric-label">Revenue Total</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${data.summary.conversion_rate}</div>
      <div class="metric-label">Tasa de Conversión</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${data.summary.appointments_completed}/${data.summary.appointments_scheduled}</div>
      <div class="metric-label">Citas Completadas</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${data.summary.comparison_vs_previous}</div>
      <div class="metric-label">vs Periodo Anterior</div>
    </div>
  </div>
  ` : ''}

  ${data.sales && data.sales.top_performers.length > 0 ? `
  <h2>Top Vendedores</h2>
  <table>
    <tr><th>Vendedor</th><th>Ventas</th><th>Revenue</th></tr>
    ${data.sales.top_performers.map(p => `
    <tr><td>${p.name}</td><td>${p.sales}</td><td>$${this.formatNumber(p.revenue)}</td></tr>
    `).join('')}
  </table>
  ` : ''}

  ${data.goals ? `
  <h2>Avance de Meta</h2>
  <p class="status-${data.goals.status}">
    <strong>${data.goals.current_sales}</strong> de <strong>${data.goals.company_goal}</strong> ventas
    (${data.goals.progress_percent})
  </p>
  <p>Proyección fin de mes: ${data.goals.projected_end_month} ventas</p>
  ` : ''}

  ${data.pipeline ? `
  <h2>Pipeline</h2>
  <p><strong>Valor Total:</strong> $${this.formatNumber(data.pipeline.total_value)}</p>
  <p><strong>Cierre esperado 30 días:</strong> $${this.formatNumber(data.pipeline.expected_close_30d)}</p>
  ${data.pipeline.at_risk.length > 0 ? `
  <h3>Leads en Riesgo (${data.pipeline.at_risk.length})</h3>
  <table>
    <tr><th>Lead</th><th>Razón</th><th>Días sin actividad</th></tr>
    ${data.pipeline.at_risk.slice(0, 10).map(l => `
    <tr><td>${l.name}</td><td>${l.reason}</td><td>${l.days_stuck}</td></tr>
    `).join('')}
  </table>
  ` : ''}
  ` : ''}

  ${data.recommendations && data.recommendations.length > 0 ? `
  <div class="recommendations">
    <h2>Recomendaciones</h2>
    <ul>
      ${data.recommendations.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <p>Reporte generado por SARA CRM - ${new Date().getFullYear()}</p>
  </div>
</body>
</html>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRESET REPORT CONFIGS
  // ═══════════════════════════════════════════════════════════════════════════

  getWeeklyReportConfig(recipientName?: string): ReportConfig {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() - 7); // Last Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return {
      type: 'weekly',
      title: 'Reporte Semanal de Ventas',
      start_date: startOfWeek.toISOString().split('T')[0],
      end_date: endOfWeek.toISOString().split('T')[0],
      include_sections: [
        'executive_summary',
        'leads_overview',
        'sales_metrics',
        'pipeline_status',
        'team_performance',
        'goals_progress',
        'recommendations'
      ],
      recipient_name: recipientName,
      recipient_role: 'ceo'
    };
  }

  getMonthlyReportConfig(recipientName?: string): ReportConfig {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    return {
      type: 'monthly',
      title: 'Reporte Mensual de Ventas',
      start_date: startOfMonth.toISOString().split('T')[0],
      end_date: endOfMonth.toISOString().split('T')[0],
      include_sections: [
        'executive_summary',
        'leads_overview',
        'sales_metrics',
        'pipeline_status',
        'team_performance',
        'appointments',
        'sources_analysis',
        'goals_progress',
        'recommendations'
      ],
      recipient_name: recipientName,
      recipient_role: 'ceo'
    };
  }

  getVendorReportConfig(vendorId: string, vendorName: string): ReportConfig {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    return {
      type: 'weekly',
      title: `Reporte Personal - ${vendorName}`,
      start_date: startOfWeek.toISOString().split('T')[0],
      end_date: now.toISOString().split('T')[0],
      include_sections: [
        'executive_summary',
        'leads_overview',
        'appointments',
        'goals_progress',
        'recommendations'
      ],
      recipient_name: vendorName,
      recipient_role: 'vendedor',
      vendor_id: vendorId
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private translateStatus(status: string): string {
    const translations: Record<string, string> = {
      'new': 'Nuevo',
      'contacted': 'Contactado',
      'qualified': 'Calificado',
      'visit_scheduled': 'Cita agendada',
      'visited': 'Visitó',
      'negotiating': 'En negociación',
      'reserved': 'Apartado',
      'sold': 'Vendido',
      'delivered': 'Entregado',
      'lost': 'Perdido',
      'inactive': 'Inactivo'
    };
    return translations[status] || status;
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatNumber(num: number): string {
    return num.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }
}
