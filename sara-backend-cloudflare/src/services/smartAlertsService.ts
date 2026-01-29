// ═══════════════════════════════════════════════════════════════════════════
// SMART ALERTS SERVICE - Alertas Inteligentes
// Proactive notifications for leads at risk, opportunities, and team actions
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SmartAlert {
  id: string;
  type: AlertType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  data: Record<string, any>;
  action_required: string | null;
  action_url: string | null;
  created_at: string;
  expires_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export type AlertType =
  // Lead-related
  | 'lead_going_cold'           // Lead sin actividad por X días
  | 'lead_hot_signal'           // Lead mostró señal de compra
  | 'lead_budget_match'         // Nuevo inventario match con presupuesto
  | 'lead_stalled'              // Lead estancado en etapa
  | 'lead_reactivation'         // Lead inactivo volvió a escribir
  | 'lead_birthday'             // Cumpleaños de lead
  // Offer-related
  | 'offer_expiring'            // Oferta por vencer
  | 'offer_no_response'         // Sin respuesta a oferta
  | 'offer_counter'             // Cliente hizo contraoferta
  // Visit-related
  | 'visit_upcoming'            // Visita próxima (recordatorio)
  | 'visit_no_show'             // No se presentó a visita
  | 'visit_followup_due'        // Seguimiento post-visita pendiente
  // Team-related
  | 'vendor_inactive'           // Vendedor sin actividad
  | 'vendor_low_conversion'     // Conversión baja del vendedor
  | 'vendor_high_load'          // Vendedor con muchos leads
  // Business-related
  | 'goal_at_risk'              // Meta mensual en riesgo
  | 'pipeline_drop'             // Caída significativa en pipeline
  | 'competitor_mention';       // Cliente mencionó competencia

export interface AlertConfig {
  type: AlertType;
  enabled: boolean;
  threshold: number;           // Threshold value (days, percentage, etc.)
  priority: 'low' | 'medium' | 'high' | 'critical';
  notify_vendor: boolean;
  notify_ceo: boolean;
  notify_coordinator: boolean;
}

export interface AlertSummary {
  generated_at: string;
  total_alerts: number;
  by_priority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  by_type: Record<AlertType, number>;
  unacknowledged: number;
  alerts: SmartAlert[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_ALERT_CONFIGS: AlertConfig[] = [
  // Lead alerts
  { type: 'lead_going_cold', enabled: true, threshold: 5, priority: 'high', notify_vendor: true, notify_ceo: false, notify_coordinator: true },
  { type: 'lead_hot_signal', enabled: true, threshold: 0, priority: 'high', notify_vendor: true, notify_ceo: true, notify_coordinator: true },
  { type: 'lead_stalled', enabled: true, threshold: 10, priority: 'medium', notify_vendor: true, notify_ceo: false, notify_coordinator: true },
  { type: 'lead_reactivation', enabled: true, threshold: 30, priority: 'high', notify_vendor: true, notify_ceo: false, notify_coordinator: false },
  { type: 'lead_birthday', enabled: true, threshold: 0, priority: 'low', notify_vendor: true, notify_ceo: false, notify_coordinator: false },

  // Offer alerts
  { type: 'offer_expiring', enabled: true, threshold: 2, priority: 'high', notify_vendor: true, notify_ceo: false, notify_coordinator: true },
  { type: 'offer_no_response', enabled: true, threshold: 3, priority: 'medium', notify_vendor: true, notify_ceo: false, notify_coordinator: false },
  { type: 'offer_counter', enabled: true, threshold: 0, priority: 'high', notify_vendor: true, notify_ceo: true, notify_coordinator: true },

  // Visit alerts
  { type: 'visit_upcoming', enabled: true, threshold: 24, priority: 'medium', notify_vendor: true, notify_ceo: false, notify_coordinator: false },
  { type: 'visit_no_show', enabled: true, threshold: 0, priority: 'high', notify_vendor: true, notify_ceo: false, notify_coordinator: true },
  { type: 'visit_followup_due', enabled: true, threshold: 2, priority: 'medium', notify_vendor: true, notify_ceo: false, notify_coordinator: false },

  // Team alerts
  { type: 'vendor_inactive', enabled: true, threshold: 2, priority: 'high', notify_vendor: false, notify_ceo: true, notify_coordinator: true },
  { type: 'vendor_low_conversion', enabled: true, threshold: 5, priority: 'medium', notify_vendor: false, notify_ceo: true, notify_coordinator: true },
  { type: 'vendor_high_load', enabled: true, threshold: 30, priority: 'medium', notify_vendor: true, notify_ceo: true, notify_coordinator: true },

  // Business alerts
  { type: 'goal_at_risk', enabled: true, threshold: 70, priority: 'critical', notify_vendor: false, notify_ceo: true, notify_coordinator: true },
  { type: 'pipeline_drop', enabled: true, threshold: 20, priority: 'high', notify_vendor: false, notify_ceo: true, notify_coordinator: true },
  { type: 'competitor_mention', enabled: true, threshold: 0, priority: 'medium', notify_vendor: true, notify_ceo: false, notify_coordinator: false },
];

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class SmartAlertsService {
  private configs: AlertConfig[] = DEFAULT_ALERT_CONFIGS;

  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // SCAN FOR ALERTS (Main entry point for CRON)
  // ═══════════════════════════════════════════════════════════════════════════

  async scanForAlerts(): Promise<SmartAlert[]> {
    const alerts: SmartAlert[] = [];

    // Run all alert checks in parallel
    const [
      coldLeads,
      stalledLeads,
      expiringOffers,
      upcomingVisits,
      inactiveVendors,
      goalRisk
    ] = await Promise.all([
      this.checkLeadsGoingCold(),
      this.checkStalledLeads(),
      this.checkExpiringOffers(),
      this.checkUpcomingVisits(),
      this.checkInactiveVendors(),
      this.checkGoalAtRisk()
    ]);

    alerts.push(...coldLeads, ...stalledLeads, ...expiringOffers,
                ...upcomingVisits, ...inactiveVendors, ...goalRisk);

    return alerts;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAD ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  async checkLeadsGoingCold(): Promise<SmartAlert[]> {
    const config = this.getConfig('lead_going_cold');
    if (!config?.enabled) return [];

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - config.threshold);

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, last_activity_at, status, temperature')
      .not('status', 'in', '(sold,delivered,lost,inactive)')
      .neq('temperature', 'COLD')  // Not already marked cold
      .lt('last_activity_at', thresholdDate.toISOString())
      .order('last_activity_at', { ascending: true })
      .limit(20);

    if (!leads || leads.length === 0) return [];

    const vendorMap = await this.getVendorMap(leads.map(l => l.assigned_to).filter(Boolean));

    return leads.map(lead => {
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(lead.last_activity_at).getTime()) / (24 * 60 * 60 * 1000)
      );

      return this.createAlert({
        type: 'lead_going_cold',
        priority: config.priority,
        title: '❄️ Lead enfriándose',
        message: `${lead.name} lleva ${daysSinceActivity} días sin actividad`,
        lead_id: lead.id,
        lead_name: lead.name,
        lead_phone: lead.phone,
        vendor_id: lead.assigned_to,
        vendor_name: vendorMap.get(lead.assigned_to) || null,
        data: { days_inactive: daysSinceActivity, current_status: lead.status },
        action_required: 'Contactar al lead para reactivar'
      });
    });
  }

  async checkStalledLeads(): Promise<SmartAlert[]> {
    const config = this.getConfig('lead_stalled');
    if (!config?.enabled) return [];

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - config.threshold);

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, status, updated_at')
      .in('status', ['contacted', 'qualified', 'visit_scheduled'])
      .lt('updated_at', thresholdDate.toISOString())
      .order('updated_at', { ascending: true })
      .limit(15);

    if (!leads || leads.length === 0) return [];

    const vendorMap = await this.getVendorMap(leads.map(l => l.assigned_to).filter(Boolean));

    return leads.map(lead => {
      const daysStalled = Math.floor(
        (Date.now() - new Date(lead.updated_at).getTime()) / (24 * 60 * 60 * 1000)
      );

      return this.createAlert({
        type: 'lead_stalled',
        priority: config.priority,
        title: '⏸️ Lead estancado',
        message: `${lead.name} lleva ${daysStalled} días en etapa "${lead.status}"`,
        lead_id: lead.id,
        lead_name: lead.name,
        lead_phone: lead.phone,
        vendor_id: lead.assigned_to,
        vendor_name: vendorMap.get(lead.assigned_to) || null,
        data: { days_stalled: daysStalled, current_stage: lead.status },
        action_required: 'Avanzar a siguiente etapa o marcar como perdido'
      });
    });
  }

  async detectHotSignal(leadId: string, signal: string): Promise<SmartAlert | null> {
    const config = this.getConfig('lead_hot_signal');
    if (!config?.enabled) return null;

    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to')
      .eq('id', leadId)
      .single();

    if (!lead) return null;

    const vendorName = lead.assigned_to
      ? await this.getVendorName(lead.assigned_to)
      : null;

    return this.createAlert({
      type: 'lead_hot_signal',
      priority: 'high',
      title: '🔥 Señal de compra detectada',
      message: `${lead.name}: "${signal}"`,
      lead_id: lead.id,
      lead_name: lead.name,
      lead_phone: lead.phone,
      vendor_id: lead.assigned_to,
      vendor_name: vendorName,
      data: { signal },
      action_required: 'Contactar inmediatamente'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OFFER ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  async checkExpiringOffers(): Promise<SmartAlert[]> {
    const config = this.getConfig('offer_expiring');
    if (!config?.enabled) return [];

    const now = new Date();
    const deadline = new Date(now.getTime() + config.threshold * 24 * 60 * 60 * 1000);

    const { data: offers } = await this.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .in('status', ['sent', 'viewed', 'negotiating'])
      .gte('expires_at', now.toISOString())
      .lte('expires_at', deadline.toISOString())
      .order('expires_at', { ascending: true });

    if (!offers || offers.length === 0) return [];

    const vendorMap = await this.getVendorMap(offers.map(o => o.vendor_id).filter(Boolean));

    return offers.map(offer => {
      const hoursUntilExpiry = Math.ceil(
        (new Date(offer.expires_at).getTime() - now.getTime()) / (60 * 60 * 1000)
      );

      return this.createAlert({
        type: 'offer_expiring',
        priority: hoursUntilExpiry < 24 ? 'critical' : config.priority,
        title: '⏰ Oferta por vencer',
        message: `Oferta para ${offer.leads?.name} vence en ${hoursUntilExpiry}h`,
        lead_id: offer.lead_id,
        lead_name: offer.leads?.name,
        lead_phone: offer.leads?.phone,
        vendor_id: offer.vendor_id,
        vendor_name: vendorMap.get(offer.vendor_id) || null,
        data: {
          offer_id: offer.id,
          hours_until_expiry: hoursUntilExpiry,
          offered_price: offer.offered_price,
          development: offer.development
        },
        action_required: 'Dar seguimiento antes de que expire'
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VISIT ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  async checkUpcomingVisits(): Promise<SmartAlert[]> {
    const config = this.getConfig('visit_upcoming');
    if (!config?.enabled) return [];

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: visits } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .in('scheduled_date', [todayStr, tomorrowStr])
      .eq('status', 'scheduled')
      .order('scheduled_date')
      .order('scheduled_time');

    if (!visits || visits.length === 0) return [];

    const vendorMap = await this.getVendorMap(visits.map(v => v.assigned_to).filter(Boolean));

    return visits.map(visit => {
      const isToday = visit.scheduled_date === todayStr;

      return this.createAlert({
        type: 'visit_upcoming',
        priority: isToday ? 'high' : config.priority,
        title: isToday ? '📅 Visita HOY' : '📅 Visita MAÑANA',
        message: `${visit.leads?.name} - ${visit.scheduled_time}`,
        lead_id: visit.lead_id,
        lead_name: visit.leads?.name,
        lead_phone: visit.leads?.phone,
        vendor_id: visit.assigned_to,
        vendor_name: vendorMap.get(visit.assigned_to) || null,
        data: {
          visit_id: visit.id,
          scheduled_date: visit.scheduled_date,
          scheduled_time: visit.scheduled_time,
          development: visit.development || visit.property_interest
        },
        action_required: isToday ? 'Confirmar asistencia' : 'Enviar recordatorio'
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  async checkInactiveVendors(): Promise<SmartAlert[]> {
    const config = this.getConfig('vendor_inactive');
    if (!config?.enabled) return [];

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - config.threshold);

    const { data: vendors } = await this.supabase.client
      .from('team_members')
      .select('id, name, phone, notes')
      .eq('active', true)
      .eq('role', 'vendedor');

    if (!vendors || vendors.length === 0) return [];

    const alerts: SmartAlert[] = [];

    for (const vendor of vendors) {
      let lastInteraction: string | null = null;

      // Extract last_sara_interaction from notes
      if (vendor.notes) {
        try {
          const notesObj = typeof vendor.notes === 'string'
            ? JSON.parse(vendor.notes)
            : vendor.notes;
          lastInteraction = notesObj?.last_sara_interaction || null;
        } catch { /* ignore */ }
      }

      if (!lastInteraction) continue;

      const lastDate = new Date(lastInteraction);
      if (lastDate < thresholdDate) {
        const daysInactive = Math.floor(
          (Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000)
        );

        alerts.push(this.createAlert({
          type: 'vendor_inactive',
          priority: config.priority,
          title: '👤 Vendedor inactivo',
          message: `${vendor.name} lleva ${daysInactive} días sin usar SARA`,
          lead_id: null,
          lead_name: null,
          lead_phone: null,
          vendor_id: vendor.id,
          vendor_name: vendor.name,
          data: { days_inactive: daysInactive, last_activity: lastInteraction },
          action_required: 'Verificar actividad del vendedor'
        }));
      }
    }

    return alerts;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUSINESS ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  async checkGoalAtRisk(): Promise<SmartAlert[]> {
    const config = this.getConfig('goal_at_risk');
    if (!config?.enabled) return [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const dayOfMonth = now.getDate();
    const totalDays = endOfMonth.getDate();
    const monthProgress = (dayOfMonth / totalDays) * 100;

    // Get monthly goal
    const monthKey = now.toISOString().slice(0, 7); // "2026-01"
    const { data: goalData } = await this.supabase.client
      .from('monthly_goals')
      .select('company_goal')
      .eq('month', monthKey)
      .single();

    const monthlyGoal = goalData?.company_goal || 5; // Default 5 sales

    // Get current sales
    const { count: currentSales } = await this.supabase.client
      .from('leads')
      .select('id', { count: 'exact' })
      .eq('status', 'sold')
      .gte('updated_at', startOfMonth.toISOString());

    const salesProgress = ((currentSales || 0) / monthlyGoal) * 100;

    // Alert if sales progress is significantly behind month progress
    if (monthProgress > 50 && salesProgress < monthProgress - config.threshold) {
      return [this.createAlert({
        type: 'goal_at_risk',
        priority: 'critical',
        title: '🎯 Meta mensual en riesgo',
        message: `${currentSales || 0}/${monthlyGoal} ventas (${salesProgress.toFixed(0)}%) - Mes al ${monthProgress.toFixed(0)}%`,
        lead_id: null,
        lead_name: null,
        lead_phone: null,
        vendor_id: null,
        vendor_name: null,
        data: {
          goal: monthlyGoal,
          current: currentSales,
          month_progress: monthProgress,
          sales_progress: salesProgress
        },
        action_required: 'Revisar pipeline y acelerar cierres'
      })];
    }

    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ALERTS SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  async getAlertsSummary(): Promise<AlertSummary> {
    const alerts = await this.scanForAlerts();

    const byPriority = {
      critical: alerts.filter(a => a.priority === 'critical').length,
      high: alerts.filter(a => a.priority === 'high').length,
      medium: alerts.filter(a => a.priority === 'medium').length,
      low: alerts.filter(a => a.priority === 'low').length
    };

    const byType: Record<AlertType, number> = {} as any;
    for (const alert of alerts) {
      byType[alert.type] = (byType[alert.type] || 0) + 1;
    }

    return {
      generated_at: new Date().toISOString(),
      total_alerts: alerts.length,
      by_priority: byPriority,
      by_type: byType,
      unacknowledged: alerts.filter(a => !a.acknowledged_at).length,
      alerts: alerts.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatSummaryForWhatsApp(summary: AlertSummary): string {
    let msg = `🚨 *ALERTAS INTELIGENTES*\n\n`;

    if (summary.total_alerts === 0) {
      msg += `✅ No hay alertas pendientes.\n\n`;
      msg += `_Todo está bajo control._`;
      return msg;
    }

    msg += `*Resumen:*\n`;
    msg += `• 🔴 Críticas: ${summary.by_priority.critical}\n`;
    msg += `• 🟠 Altas: ${summary.by_priority.high}\n`;
    msg += `• 🟡 Medias: ${summary.by_priority.medium}\n`;
    msg += `• 🟢 Bajas: ${summary.by_priority.low}\n\n`;

    // Show critical and high priority alerts
    const urgentAlerts = summary.alerts.filter(a =>
      a.priority === 'critical' || a.priority === 'high'
    );

    if (urgentAlerts.length > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚠️ *REQUIEREN ATENCIÓN:*\n\n`;

      for (const alert of urgentAlerts.slice(0, 10)) {
        const priorityEmoji = alert.priority === 'critical' ? '🔴' : '🟠';
        msg += `${priorityEmoji} *${alert.title}*\n`;
        msg += `   ${alert.message}\n`;
        if (alert.vendor_name) {
          msg += `   👤 ${alert.vendor_name}\n`;
        }
        if (alert.action_required) {
          msg += `   💡 ${alert.action_required}\n`;
        }
        msg += `\n`;
      }
    }

    if (urgentAlerts.length < summary.total_alerts) {
      msg += `\n_+${summary.total_alerts - urgentAlerts.length} alertas de menor prioridad_`;
    }

    return msg;
  }

  formatAlertForWhatsApp(alert: SmartAlert): string {
    const priorityEmoji: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    };

    let msg = `${priorityEmoji[alert.priority]} *${alert.title}*\n\n`;
    msg += `${alert.message}\n\n`;

    if (alert.lead_name) {
      msg += `👤 *Lead:* ${alert.lead_name}\n`;
      if (alert.lead_phone) {
        msg += `📱 ${alert.lead_phone}\n`;
      }
    }

    if (alert.vendor_name) {
      msg += `👤 *Vendedor:* ${alert.vendor_name}\n`;
    }

    if (alert.action_required) {
      msg += `\n💡 *Acción:* ${alert.action_required}`;
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private getConfig(type: AlertType): AlertConfig | undefined {
    return this.configs.find(c => c.type === type);
  }

  private createAlert(params: {
    type: AlertType;
    priority: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    lead_id: string | null;
    lead_name: string | null;
    lead_phone: string | null;
    vendor_id: string | null;
    vendor_name: string | null;
    data: Record<string, any>;
    action_required: string | null;
  }): SmartAlert {
    return {
      id: `${params.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: params.type,
      priority: params.priority,
      title: params.title,
      message: params.message,
      lead_id: params.lead_id,
      lead_name: params.lead_name,
      lead_phone: params.lead_phone,
      vendor_id: params.vendor_id,
      vendor_name: params.vendor_name,
      data: params.data,
      action_required: params.action_required,
      action_url: null,
      created_at: new Date().toISOString(),
      expires_at: null,
      acknowledged_at: null,
      acknowledged_by: null
    };
  }

  private async getVendorName(vendorId: string): Promise<string | null> {
    const { data } = await this.supabase.client
      .from('team_members')
      .select('name')
      .eq('id', vendorId)
      .single();
    return data?.name || null;
  }

  private async getVendorMap(vendorIds: string[]): Promise<Map<string, string>> {
    if (vendorIds.length === 0) return new Map();
    const uniqueIds = [...new Set(vendorIds)];
    const { data } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .in('id', uniqueIds);
    return new Map(data?.map(v => [v.id, v.name]) || []);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getAlertPriorityEmoji(priority: string): string {
  const emojis: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  };
  return emojis[priority] || '⚪';
}
