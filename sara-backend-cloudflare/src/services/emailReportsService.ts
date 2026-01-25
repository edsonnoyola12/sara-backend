// ═══════════════════════════════════════════════════════════════════════════
// EMAIL REPORTS SERVICE - Reportes automáticos por correo
// ═══════════════════════════════════════════════════════════════════════════
// Envía resúmenes diarios/semanales al CEO y equipo
// Usa Resend API para envío de emails
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

export interface ReportData {
  period: string;
  startDate: string;
  endDate: string;

  // Métricas de leads
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  conversionRate: number;

  // Métricas de citas
  totalAppointments: number;
  completedAppointments: number;
  canceledAppointments: number;
  showRate: number;

  // Métricas de ventas
  totalSales: number;
  salesAmount: number;

  // Top performers
  topSellers: Array<{
    name: string;
    sales: number;
    leads: number;
  }>;

  // Desarrollos más populares
  topDevelopments: Array<{
    name: string;
    inquiries: number;
    appointments: number;
  }>;

  // Actividad
  totalMessages: number;
  aiResponses: number;
  humanResponses: number;
}

export interface EmailConfig {
  resendApiKey: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails?: string[];
}

export class EmailReportsService {
  constructor(
    private supabase: SupabaseService,
    private config: EmailConfig
  ) {}

  /**
   * Genera datos del reporte para un período
   */
  async generateReportData(days: number = 7): Promise<ReportData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Obtener leads del período
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const totalLeads = leads?.length || 0;
    const newLeads = leads?.filter(l => l.status === 'nuevo').length || 0;
    const qualifiedLeads = leads?.filter(l => ['calificado', 'en_negociacion'].includes(l.status)).length || 0;
    const convertedLeads = leads?.filter(l => l.status === 'vendido').length || 0;

    // Obtener citas del período
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('*')
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const totalAppointments = appointments?.length || 0;
    const completedAppointments = appointments?.filter(a => a.status === 'completed').length || 0;
    const canceledAppointments = appointments?.filter(a => a.status === 'canceled').length || 0;

    // Obtener ventas (leads con status vendido)
    const { data: sales } = await this.supabase.client
      .from('leads')
      .select('*, assigned_to')
      .eq('status', 'vendido')
      .gte('updated_at', startStr)
      .lte('updated_at', endStr);

    const totalSales = sales?.length || 0;
    // Estimación de monto (si hay campo budget)
    const salesAmount = sales?.reduce((sum, s) => sum + (s.budget || 0), 0) || 0;

    // Top vendedores
    const { data: teamMembers } = await this.supabase.client
      .from('team_members')
      .select('id, name, sales_count')
      .eq('role', 'vendedor')
      .eq('active', true)
      .order('sales_count', { ascending: false })
      .limit(5);

    const topSellers = (teamMembers || []).map(tm => ({
      name: tm.name,
      sales: tm.sales_count || 0,
      leads: leads?.filter(l => l.assigned_to === tm.id).length || 0
    }));

    // Desarrollos más populares
    const developmentCounts: Record<string, { inquiries: number; appointments: number }> = {};
    leads?.forEach(l => {
      const dev = l.property_interest || 'Sin especificar';
      if (!developmentCounts[dev]) {
        developmentCounts[dev] = { inquiries: 0, appointments: 0 };
      }
      developmentCounts[dev].inquiries++;
    });
    appointments?.forEach(a => {
      const dev = a.property_name || 'Sin especificar';
      if (developmentCounts[dev]) {
        developmentCounts[dev].appointments++;
      }
    });

    const topDevelopments = Object.entries(developmentCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.inquiries - a.inquiries)
      .slice(0, 5);

    // Actividad de mensajes (aproximado desde conversation_history)
    let totalMessages = 0;
    let aiResponses = 0;
    leads?.forEach(l => {
      const history = l.conversation_history || [];
      totalMessages += history.length;
      aiResponses += history.filter((m: any) => m.role === 'assistant').length;
    });

    return {
      period: days === 1 ? 'Diario' : days === 7 ? 'Semanal' : `${days} días`,
      startDate: startStr,
      endDate: endStr,
      totalLeads,
      newLeads,
      qualifiedLeads,
      convertedLeads,
      conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0,
      totalAppointments,
      completedAppointments,
      canceledAppointments,
      showRate: totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0,
      totalSales,
      salesAmount,
      topSellers,
      topDevelopments,
      totalMessages,
      aiResponses,
      humanResponses: totalMessages - aiResponses
    };
  }

  /**
   * Genera HTML del reporte
   */
  generateReportHTML(data: ReportData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 10px 0 0; opacity: 0.9; }
    .content { padding: 30px; }
    .section { margin-bottom: 30px; }
    .section h2 { color: #333; font-size: 18px; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-bottom: 15px; }
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
    .metric { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 28px; font-weight: bold; color: #667eea; }
    .metric-label { font-size: 12px; color: #666; margin-top: 5px; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
    .table th { background: #f8f9fa; font-weight: 600; }
    .highlight { color: #28a745; font-weight: bold; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reporte ${data.period} SARA</h1>
      <p>${data.startDate} - ${data.endDate}</p>
    </div>

    <div class="content">
      <div class="section">
        <h2>Resumen de Leads</h2>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">${data.totalLeads}</div>
            <div class="metric-label">Total Leads</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.newLeads}</div>
            <div class="metric-label">Nuevos</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.qualifiedLeads}</div>
            <div class="metric-label">Calificados</div>
          </div>
          <div class="metric">
            <div class="metric-value highlight">${data.conversionRate}%</div>
            <div class="metric-label">Conversion</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Citas</h2>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">${data.totalAppointments}</div>
            <div class="metric-label">Total Citas</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.completedAppointments}</div>
            <div class="metric-label">Completadas</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.canceledAppointments}</div>
            <div class="metric-label">Canceladas</div>
          </div>
          <div class="metric">
            <div class="metric-value highlight">${data.showRate}%</div>
            <div class="metric-label">Show Rate</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Ventas</h2>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value highlight">${data.totalSales}</div>
            <div class="metric-label">Ventas Cerradas</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${data.salesAmount.toLocaleString()}</div>
            <div class="metric-label">Monto Total</div>
          </div>
        </div>
      </div>

      ${data.topSellers.length > 0 ? `
      <div class="section">
        <h2>Top Vendedores</h2>
        <table class="table">
          <tr><th>Vendedor</th><th>Ventas</th><th>Leads</th></tr>
          ${data.topSellers.map(s => `<tr><td>${s.name}</td><td>${s.sales}</td><td>${s.leads}</td></tr>`).join('')}
        </table>
      </div>
      ` : ''}

      ${data.topDevelopments.length > 0 ? `
      <div class="section">
        <h2>Desarrollos Populares</h2>
        <table class="table">
          <tr><th>Desarrollo</th><th>Consultas</th><th>Citas</th></tr>
          ${data.topDevelopments.map(d => `<tr><td>${d.name}</td><td>${d.inquiries}</td><td>${d.appointments}</td></tr>`).join('')}
        </table>
      </div>
      ` : ''}

      <div class="section">
        <h2>Actividad</h2>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">${data.totalMessages}</div>
            <div class="metric-label">Mensajes Totales</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.aiResponses}</div>
            <div class="metric-label">Respuestas IA</div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      Generado automaticamente por SARA | Grupo Santa Rita
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Envía el reporte por email usando Resend
   */
  async sendReport(data: ReportData): Promise<boolean> {
    if (!this.config.resendApiKey) {
      console.warn('RESEND_API_KEY no configurado, no se puede enviar email');
      return false;
    }

    const html = this.generateReportHTML(data);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.config.fromEmail || 'SARA <noreply@gruposantarita.com>',
          to: this.config.toEmails,
          cc: this.config.ccEmails,
          subject: `Reporte ${data.period} SARA - ${data.endDate}`,
          html
        })
      });

      if (response.ok) {
        console.log(`Email de reporte enviado a: ${this.config.toEmails.join(', ')}`);
        return true;
      } else {
        const error = await response.text();
        console.error('Error enviando email:', error);
        return false;
      }
    } catch (e) {
      console.error('Error en sendReport:', e);
      return false;
    }
  }

  /**
   * Genera y envía reporte diario
   */
  async sendDailyReport(): Promise<boolean> {
    const data = await this.generateReportData(1);
    return this.sendReport(data);
  }

  /**
   * Genera y envía reporte semanal
   */
  async sendWeeklyReport(): Promise<boolean> {
    const data = await this.generateReportData(7);
    return this.sendReport(data);
  }

  /**
   * Genera y envía reporte mensual
   */
  async sendMonthlyReport(): Promise<boolean> {
    const data = await this.generateReportData(30);
    return this.sendReport(data);
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createEmailReports(
  supabase: SupabaseService,
  env: {
    RESEND_API_KEY?: string;
    REPORT_FROM_EMAIL?: string;
    REPORT_TO_EMAILS?: string;
    REPORT_CC_EMAILS?: string;
  }
): EmailReportsService {
  return new EmailReportsService(supabase, {
    resendApiKey: env.RESEND_API_KEY || '',
    fromEmail: env.REPORT_FROM_EMAIL || 'SARA <noreply@gruposantarita.com>',
    toEmails: (env.REPORT_TO_EMAILS || '').split(',').filter(e => e.trim()),
    ccEmails: (env.REPORT_CC_EMAILS || '').split(',').filter(e => e.trim())
  });
}
