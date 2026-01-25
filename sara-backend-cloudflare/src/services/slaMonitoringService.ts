// ═══════════════════════════════════════════════════════════════════════════
// SLA MONITORING SERVICE - Monitoreo de tiempos de respuesta
// ═══════════════════════════════════════════════════════════════════════════
// Alerta cuando vendedores exceden límites de tiempo de respuesta
// Escalamiento automático y métricas de cumplimiento SLA
// ═══════════════════════════════════════════════════════════════════════════

export interface SLAConfig {
  id: string;
  name: string;
  description?: string;
  // Tiempos en minutos
  firstResponseTime: number; // Tiempo máximo para primer contacto (ej: 5 min)
  followUpTime: number; // Tiempo máximo para responder mensaje (ej: 15 min)
  escalationTime: number; // Tiempo para escalar a supervisor (ej: 30 min)
  // Configuración de alertas
  alertChannels: ('whatsapp' | 'email')[];
  escalationContacts: string[]; // IDs de supervisores
  // Horario de aplicación
  applyDuringBusinessHours: boolean;
  businessHoursStart?: string; // "09:00"
  businessHoursEnd?: string; // "19:00"
  businessDays?: number[]; // [1,2,3,4,5] = Lun-Vie
  // Estado
  active: boolean;
  createdAt: string;
}

export interface SLAViolation {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  violationType: 'first_response' | 'follow_up' | 'escalation';
  configId: string;
  expectedMinutes: number;
  actualMinutes: number;
  createdAt: string;
  resolvedAt?: string;
  escalatedAt?: string;
  escalatedTo?: string;
  status: 'open' | 'resolved' | 'escalated';
}

export interface SLAMetrics {
  period: string;
  totalLeads: number;
  withinSLA: number;
  violations: number;
  slaComplianceRate: number; // Porcentaje
  avgFirstResponseMinutes: number;
  avgFollowUpMinutes: number;
  violationsByType: {
    first_response: number;
    follow_up: number;
    escalation: number;
  };
  violationsByVendor: Array<{
    vendorId: string;
    vendorName: string;
    violations: number;
    complianceRate: number;
  }>;
}

export interface PendingResponse {
  leadId: string;
  leadName: string;
  leadPhone: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  messageReceivedAt: string;
  waitingMinutes: number;
  slaLimit: number;
  percentUsed: number;
  status: 'ok' | 'warning' | 'breach';
}

const SLA_CONFIG_KEY = 'sla:config';
const SLA_VIOLATIONS_KEY = 'sla:violations';
const SLA_PENDING_KEY = 'sla:pending';

// Configuración por defecto
const DEFAULT_SLA_CONFIG: Omit<SLAConfig, 'id' | 'createdAt'> = {
  name: 'SLA Estándar Inmobiliaria',
  description: 'SLA por defecto para leads inmobiliarios',
  firstResponseTime: 5, // 5 minutos para primer contacto
  followUpTime: 15, // 15 minutos para responder
  escalationTime: 30, // 30 minutos para escalar
  alertChannels: ['whatsapp'],
  escalationContacts: [],
  applyDuringBusinessHours: true,
  businessHoursStart: '09:00',
  businessHoursEnd: '19:00',
  businessDays: [1, 2, 3, 4, 5, 6], // Lun-Sab
  active: true
};

export class SLAMonitoringService {
  private kv: KVNamespace | undefined;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURACIÓN DE SLA
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene la configuración SLA activa
   */
  async getConfig(): Promise<SLAConfig> {
    if (!this.kv) {
      return this.createDefaultConfig();
    }

    try {
      const data = await this.kv.get(SLA_CONFIG_KEY, 'json');
      if (data) {
        return data as SLAConfig;
      }
    } catch (e) {
      console.error('Error obteniendo config SLA:', e);
    }

    return this.createDefaultConfig();
  }

  /**
   * Actualiza la configuración SLA
   */
  async updateConfig(updates: Partial<SLAConfig>): Promise<SLAConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...updates };

    if (this.kv) {
      await this.kv.put(SLA_CONFIG_KEY, JSON.stringify(updated));
    }

    console.log('📋 SLA config actualizada');
    return updated;
  }

  private createDefaultConfig(): SLAConfig {
    return {
      ...DEFAULT_SLA_CONFIG,
      id: 'sla_default',
      createdAt: new Date().toISOString()
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRO Y MONITOREO
  // ═══════════════════════════════════════════════════════════════

  /**
   * Registra un mensaje entrante de lead para monitoreo SLA
   */
  async trackIncomingMessage(lead: {
    id: string;
    name: string;
    phone: string;
    vendorId: string;
    vendorName: string;
    vendorPhone: string;
    isFirstMessage?: boolean;
  }): Promise<void> {
    const config = await this.getConfig();

    if (!config.active) return;

    // Verificar si estamos en horario de aplicación
    if (config.applyDuringBusinessHours && !this.isWithinBusinessHours(config)) {
      return;
    }

    const pending: PendingResponse = {
      leadId: lead.id,
      leadName: lead.name,
      leadPhone: lead.phone,
      vendorId: lead.vendorId,
      vendorName: lead.vendorName,
      vendorPhone: lead.vendorPhone,
      messageReceivedAt: new Date().toISOString(),
      waitingMinutes: 0,
      slaLimit: lead.isFirstMessage ? config.firstResponseTime : config.followUpTime,
      percentUsed: 0,
      status: 'ok'
    };

    await this.savePendingResponse(pending);
    console.log(`⏱️ SLA tracking iniciado para lead ${lead.name}`);
  }

  /**
   * Registra respuesta del vendedor (resuelve el pending)
   */
  async trackVendorResponse(leadId: string, vendorId: string): Promise<{
    withinSLA: boolean;
    responseMinutes: number;
    slaLimit: number;
  } | null> {
    const pending = await this.getPendingResponse(leadId);

    if (!pending || pending.vendorId !== vendorId) {
      return null;
    }

    const responseTime = new Date();
    const messageTime = new Date(pending.messageReceivedAt);
    const responseMinutes = (responseTime.getTime() - messageTime.getTime()) / (1000 * 60);
    const withinSLA = responseMinutes <= pending.slaLimit;

    // Si excedió SLA, registrar violación
    if (!withinSLA) {
      await this.recordViolation({
        leadId: pending.leadId,
        leadName: pending.leadName,
        leadPhone: pending.leadPhone,
        vendorId: pending.vendorId,
        vendorName: pending.vendorName,
        vendorPhone: pending.vendorPhone,
        violationType: pending.slaLimit <= 5 ? 'first_response' : 'follow_up',
        expectedMinutes: pending.slaLimit,
        actualMinutes: Math.round(responseMinutes)
      });
    }

    // Eliminar de pendientes
    await this.removePendingResponse(leadId);

    console.log(`✅ SLA ${withinSLA ? 'cumplido' : 'VIOLADO'}: ${Math.round(responseMinutes)} min (límite: ${pending.slaLimit} min)`);

    return {
      withinSLA,
      responseMinutes: Math.round(responseMinutes * 10) / 10,
      slaLimit: pending.slaLimit
    };
  }

  /**
   * Verifica todos los pendientes y genera alertas/escalamientos
   */
  async checkPendingResponses(): Promise<{
    warnings: PendingResponse[];
    breaches: PendingResponse[];
    escalations: PendingResponse[];
  }> {
    const config = await this.getConfig();
    const allPending = await this.getAllPendingResponses();
    const now = new Date();

    const warnings: PendingResponse[] = [];
    const breaches: PendingResponse[] = [];
    const escalations: PendingResponse[] = [];

    for (const pending of allPending) {
      const messageTime = new Date(pending.messageReceivedAt);
      const waitingMinutes = (now.getTime() - messageTime.getTime()) / (1000 * 60);
      const percentUsed = (waitingMinutes / pending.slaLimit) * 100;

      pending.waitingMinutes = Math.round(waitingMinutes);
      pending.percentUsed = Math.round(percentUsed);

      // Determinar status
      if (waitingMinutes >= config.escalationTime) {
        pending.status = 'breach';
        escalations.push(pending);
      } else if (waitingMinutes >= pending.slaLimit) {
        pending.status = 'breach';
        breaches.push(pending);
      } else if (percentUsed >= 80) {
        pending.status = 'warning';
        warnings.push(pending);
      } else {
        pending.status = 'ok';
      }
    }

    return { warnings, breaches, escalations };
  }

  /**
   * Genera alertas para el vendedor
   */
  generateVendorAlert(pending: PendingResponse): string {
    const emoji = pending.status === 'breach' ? '🚨' : '⚠️';
    const urgency = pending.status === 'breach' ? 'URGENTE' : 'Aviso';

    return `${emoji} *SLA ${urgency}*

Lead: *${pending.leadName}*
📱 ${pending.leadPhone}
⏱️ Esperando: ${pending.waitingMinutes} min
📊 Límite: ${pending.slaLimit} min

${pending.status === 'breach'
      ? '❌ *SLA EXCEDIDO* - Responde inmediatamente'
      : `⚡ ${100 - pending.percentUsed}% del tiempo restante`}

Escribe *bridge ${pending.leadName.split(' ')[0]}* para contactar`;
  }

  /**
   * Genera alerta de escalamiento para supervisor
   */
  generateEscalationAlert(pending: PendingResponse): string {
    return `🚨 *ESCALAMIENTO SLA*

Lead sin atender: *${pending.leadName}*
📱 ${pending.leadPhone}
⏱️ Esperando: ${pending.waitingMinutes} min

Vendedor asignado: *${pending.vendorName}*
📱 ${pending.vendorPhone}

❌ Se requiere intervención inmediata`;
  }

  // ═══════════════════════════════════════════════════════════════
  // VIOLACIONES
  // ═══════════════════════════════════════════════════════════════

  private async recordViolation(data: Omit<SLAViolation, 'id' | 'createdAt' | 'status' | 'configId'>): Promise<SLAViolation> {
    const config = await this.getConfig();

    const violation: SLAViolation = {
      ...data,
      id: `vio_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      configId: config.id,
      createdAt: new Date().toISOString(),
      status: 'open'
    };

    const violations = await this.getViolations();
    violations.push(violation);

    // Mantener últimas 500 violaciones
    const trimmed = violations.slice(-500);

    if (this.kv) {
      await this.kv.put(SLA_VIOLATIONS_KEY, JSON.stringify(trimmed));
    }

    console.log(`🚨 SLA Violation registrada: ${data.vendorName} - ${data.actualMinutes} min`);
    return violation;
  }

  /**
   * Obtiene violaciones (con filtros opcionales)
   */
  async getViolations(filters?: {
    vendorId?: string;
    status?: 'open' | 'resolved' | 'escalated';
    fromDate?: string;
    toDate?: string;
  }): Promise<SLAViolation[]> {
    if (!this.kv) return [];

    try {
      let violations = await this.kv.get(SLA_VIOLATIONS_KEY, 'json') as SLAViolation[] || [];

      if (filters) {
        if (filters.vendorId) {
          violations = violations.filter(v => v.vendorId === filters.vendorId);
        }
        if (filters.status) {
          violations = violations.filter(v => v.status === filters.status);
        }
        if (filters.fromDate) {
          violations = violations.filter(v => v.createdAt >= filters.fromDate!);
        }
        if (filters.toDate) {
          violations = violations.filter(v => v.createdAt <= filters.toDate!);
        }
      }

      return violations;
    } catch (e) {
      return [];
    }
  }

  /**
   * Resuelve una violación
   */
  async resolveViolation(violationId: string): Promise<boolean> {
    const violations = await this.getViolations();
    const index = violations.findIndex(v => v.id === violationId);

    if (index === -1) return false;

    violations[index].status = 'resolved';
    violations[index].resolvedAt = new Date().toISOString();

    if (this.kv) {
      await this.kv.put(SLA_VIOLATIONS_KEY, JSON.stringify(violations));
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTRICAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calcula métricas SLA para un período
   */
  async getMetrics(period?: { from: string; to: string }): Promise<SLAMetrics> {
    const fromDate = period?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = period?.to || new Date().toISOString();

    const violations = await this.getViolations({ fromDate, toDate });

    // Agrupar por tipo
    const byType = {
      first_response: violations.filter(v => v.violationType === 'first_response').length,
      follow_up: violations.filter(v => v.violationType === 'follow_up').length,
      escalation: violations.filter(v => v.violationType === 'escalation').length
    };

    // Agrupar por vendedor
    const vendorMap = new Map<string, { name: string; violations: number }>();
    for (const v of violations) {
      const existing = vendorMap.get(v.vendorId);
      if (existing) {
        existing.violations++;
      } else {
        vendorMap.set(v.vendorId, { name: v.vendorName, violations: 1 });
      }
    }

    const byVendor = Array.from(vendorMap.entries()).map(([vendorId, data]) => ({
      vendorId,
      vendorName: data.name,
      violations: data.violations,
      complianceRate: 0 // Se calcularía con total de leads atendidos
    }));

    // Calcular promedios de tiempo de respuesta
    const firstResponseTimes = violations
      .filter(v => v.violationType === 'first_response')
      .map(v => v.actualMinutes);
    const followUpTimes = violations
      .filter(v => v.violationType === 'follow_up')
      .map(v => v.actualMinutes);

    const avgFirst = firstResponseTimes.length > 0
      ? firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length
      : 0;
    const avgFollowUp = followUpTimes.length > 0
      ? followUpTimes.reduce((a, b) => a + b, 0) / followUpTimes.length
      : 0;

    // Nota: totalLeads y withinSLA requerirían datos de Supabase
    // Por ahora retornamos valores basados en violaciones
    const totalViolations = violations.length;

    return {
      period: `${fromDate.split('T')[0]} - ${toDate.split('T')[0]}`,
      totalLeads: 0, // Requiere query a Supabase
      withinSLA: 0, // Requiere query a Supabase
      violations: totalViolations,
      slaComplianceRate: 0, // Se calcularía: (withinSLA / totalLeads) * 100
      avgFirstResponseMinutes: Math.round(avgFirst * 10) / 10,
      avgFollowUpMinutes: Math.round(avgFollowUp * 10) / 10,
      violationsByType: byType,
      violationsByVendor: byVendor.sort((a, b) => b.violations - a.violations)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  private isWithinBusinessHours(config: SLAConfig): boolean {
    const now = new Date();

    // Ajustar a zona horaria de México
    const mexicoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const dayOfWeek = mexicoTime.getDay();
    const hours = mexicoTime.getHours();
    const minutes = mexicoTime.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    // Verificar día
    if (config.businessDays && !config.businessDays.includes(dayOfWeek)) {
      return false;
    }

    // Verificar hora
    if (config.businessHoursStart && config.businessHoursEnd) {
      const [startH, startM] = config.businessHoursStart.split(':').map(Number);
      const [endH, endM] = config.businessHoursEnd.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    return true;
  }

  private async savePendingResponse(pending: PendingResponse): Promise<void> {
    if (!this.kv) return;

    const all = await this.getAllPendingResponses();
    const index = all.findIndex(p => p.leadId === pending.leadId);

    if (index >= 0) {
      all[index] = pending;
    } else {
      all.push(pending);
    }

    await this.kv.put(SLA_PENDING_KEY, JSON.stringify(all));
  }

  private async getPendingResponse(leadId: string): Promise<PendingResponse | null> {
    const all = await this.getAllPendingResponses();
    return all.find(p => p.leadId === leadId) || null;
  }

  private async getAllPendingResponses(): Promise<PendingResponse[]> {
    if (!this.kv) return [];

    try {
      return await this.kv.get(SLA_PENDING_KEY, 'json') as PendingResponse[] || [];
    } catch (e) {
      return [];
    }
  }

  private async removePendingResponse(leadId: string): Promise<void> {
    if (!this.kv) return;

    const all = await this.getAllPendingResponses();
    const filtered = all.filter(p => p.leadId !== leadId);
    await this.kv.put(SLA_PENDING_KEY, JSON.stringify(filtered));
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createSLAMonitoring(kv?: KVNamespace): SLAMonitoringService {
  return new SLAMonitoringService(kv);
}
