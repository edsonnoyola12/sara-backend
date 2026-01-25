// ═══════════════════════════════════════════════════════════════════════════
// TEAM DASHBOARD SERVICE - Métricas y estadísticas del equipo de ventas
// ═══════════════════════════════════════════════════════════════════════════
// Proporciona KPIs, rankings y métricas de rendimiento por vendedor
// Incluye comparativas y tendencias
// ═══════════════════════════════════════════════════════════════════════════

export interface VendorMetrics {
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  period: string; // e.g., "2026-01", "2026-W04"

  // Leads
  leadsAssigned: number;
  leadsContacted: number;
  leadsQualified: number;
  leadsConverted: number;
  leadsLost: number;

  // Conversión
  contactRate: number; // % contactados / asignados
  qualificationRate: number; // % calificados / contactados
  conversionRate: number; // % convertidos / asignados
  lossRate: number; // % perdidos / asignados

  // Actividad
  messagesSent: number;
  messagesReceived: number;
  appointmentsScheduled: number;
  appointmentsCompleted: number;
  appointmentsCanceled: number;

  // Tiempos
  avgResponseTimeMinutes: number;
  avgTimeToFirstContact: number;
  avgTimeToConversion: number; // días

  // Valor
  totalSalesValue?: number;
  avgDealSize?: number;

  // Scoring
  performanceScore: number; // 0-100
  trend: 'up' | 'down' | 'stable';
}

export interface TeamSummary {
  period: string;
  totalVendors: number;
  totalLeads: number;
  totalConversions: number;
  teamConversionRate: number;
  totalRevenue?: number;
  avgResponseTime: number;
  topPerformer: { name: string; score: number } | null;
  needsAttention: { name: string; reason: string }[];
}

export interface LeaderboardEntry {
  rank: number;
  vendorId: string;
  vendorName: string;
  score: number;
  metric: string;
  value: number | string;
  change?: number; // vs periodo anterior
}

const TEAM_METRICS_KEY = 'team:metrics';
const VENDOR_METRICS_PREFIX = 'vendor:metrics:';

export class TeamDashboardService {
  private kv: KVNamespace | undefined;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRO DE EVENTOS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Registra asignación de lead a vendedor
   */
  async recordLeadAssigned(vendorId: string, vendorName: string, vendorPhone: string): Promise<void> {
    const metrics = await this.getVendorMetrics(vendorId);
    metrics.vendorId = vendorId;
    metrics.vendorName = vendorName;
    metrics.vendorPhone = vendorPhone;
    metrics.leadsAssigned++;
    await this.saveVendorMetrics(vendorId, metrics);
  }

  /**
   * Registra primer contacto con lead
   */
  async recordLeadContacted(vendorId: string, responseTimeMinutes?: number): Promise<void> {
    const metrics = await this.getVendorMetrics(vendorId);
    metrics.leadsContacted++;

    if (responseTimeMinutes !== undefined) {
      // Calcular promedio móvil
      const currentAvg = metrics.avgResponseTimeMinutes || 0;
      const count = metrics.leadsContacted;
      metrics.avgResponseTimeMinutes = ((currentAvg * (count - 1)) + responseTimeMinutes) / count;
    }

    await this.saveVendorMetrics(vendorId, metrics);
  }

  /**
   * Registra lead calificado
   */
  async recordLeadQualified(vendorId: string): Promise<void> {
    const metrics = await this.getVendorMetrics(vendorId);
    metrics.leadsQualified++;
    await this.saveVendorMetrics(vendorId, metrics);
  }

  /**
   * Registra conversión (venta)
   */
  async recordConversion(vendorId: string, saleValue?: number, daysToConvert?: number): Promise<void> {
    const metrics = await this.getVendorMetrics(vendorId);
    metrics.leadsConverted++;

    if (saleValue) {
      metrics.totalSalesValue = (metrics.totalSalesValue || 0) + saleValue;
      metrics.avgDealSize = metrics.totalSalesValue / metrics.leadsConverted;
    }

    if (daysToConvert !== undefined) {
      const currentAvg = metrics.avgTimeToConversion || 0;
      const count = metrics.leadsConverted;
      metrics.avgTimeToConversion = ((currentAvg * (count - 1)) + daysToConvert) / count;
    }

    await this.saveVendorMetrics(vendorId, metrics);
  }

  /**
   * Registra lead perdido
   */
  async recordLeadLost(vendorId: string): Promise<void> {
    const metrics = await this.getVendorMetrics(vendorId);
    metrics.leadsLost++;
    await this.saveVendorMetrics(vendorId, metrics);
  }

  /**
   * Registra mensaje enviado/recibido
   */
  async recordMessage(vendorId: string, direction: 'sent' | 'received'): Promise<void> {
    const metrics = await this.getVendorMetrics(vendorId);
    if (direction === 'sent') {
      metrics.messagesSent++;
    } else {
      metrics.messagesReceived++;
    }
    await this.saveVendorMetrics(vendorId, metrics);
  }

  /**
   * Registra cita agendada/completada/cancelada
   */
  async recordAppointment(vendorId: string, status: 'scheduled' | 'completed' | 'canceled'): Promise<void> {
    const metrics = await this.getVendorMetrics(vendorId);
    switch (status) {
      case 'scheduled':
        metrics.appointmentsScheduled++;
        break;
      case 'completed':
        metrics.appointmentsCompleted++;
        break;
      case 'canceled':
        metrics.appointmentsCanceled++;
        break;
    }
    await this.saveVendorMetrics(vendorId, metrics);
  }

  // ═══════════════════════════════════════════════════════════════
  // CONSULTA DE MÉTRICAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene métricas de un vendedor
   */
  async getVendorMetrics(vendorId: string, period?: string): Promise<VendorMetrics> {
    const key = this.getMetricsKey(vendorId, period);

    if (this.kv) {
      try {
        const data = await this.kv.get(key, 'json');
        if (data) {
          return this.calculateRates(data as VendorMetrics);
        }
      } catch (e) {
        console.error('Error obteniendo métricas:', e);
      }
    }

    // Retornar métricas vacías
    return this.createEmptyMetrics(vendorId, period);
  }

  /**
   * Obtiene métricas de todos los vendedores
   */
  async getAllVendorMetrics(period?: string): Promise<VendorMetrics[]> {
    if (!this.kv) return [];

    const actualPeriod = period || this.getCurrentPeriod();
    const indexKey = `${TEAM_METRICS_KEY}:${actualPeriod}:index`;

    try {
      const vendorIds = await this.kv.get(indexKey, 'json') as string[] || [];
      const metrics = await Promise.all(
        vendorIds.map(id => this.getVendorMetrics(id, actualPeriod))
      );
      return metrics.sort((a, b) => b.performanceScore - a.performanceScore);
    } catch (e) {
      console.error('Error obteniendo métricas del equipo:', e);
      return [];
    }
  }

  /**
   * Obtiene resumen del equipo
   */
  async getTeamSummary(period?: string): Promise<TeamSummary> {
    const allMetrics = await this.getAllVendorMetrics(period);

    if (allMetrics.length === 0) {
      return {
        period: period || this.getCurrentPeriod(),
        totalVendors: 0,
        totalLeads: 0,
        totalConversions: 0,
        teamConversionRate: 0,
        avgResponseTime: 0,
        topPerformer: null,
        needsAttention: []
      };
    }

    const totalLeads = allMetrics.reduce((sum, m) => sum + m.leadsAssigned, 0);
    const totalConversions = allMetrics.reduce((sum, m) => sum + m.leadsConverted, 0);
    const totalRevenue = allMetrics.reduce((sum, m) => sum + (m.totalSalesValue || 0), 0);
    const avgResponseTime = allMetrics.reduce((sum, m) => sum + m.avgResponseTimeMinutes, 0) / allMetrics.length;

    // Top performer
    const top = allMetrics[0];
    const topPerformer = top ? { name: top.vendorName, score: top.performanceScore } : null;

    // Vendedores que necesitan atención
    const needsAttention: { name: string; reason: string }[] = [];
    for (const m of allMetrics) {
      if (m.conversionRate < 5 && m.leadsAssigned >= 5) {
        needsAttention.push({ name: m.vendorName, reason: 'Conversión muy baja' });
      } else if (m.avgResponseTimeMinutes > 60) {
        needsAttention.push({ name: m.vendorName, reason: 'Tiempo de respuesta lento' });
      } else if (m.contactRate < 50 && m.leadsAssigned >= 5) {
        needsAttention.push({ name: m.vendorName, reason: 'Bajo índice de contacto' });
      }
    }

    return {
      period: period || this.getCurrentPeriod(),
      totalVendors: allMetrics.length,
      totalLeads,
      totalConversions,
      teamConversionRate: totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0,
      totalRevenue: totalRevenue > 0 ? totalRevenue : undefined,
      avgResponseTime,
      topPerformer,
      needsAttention: needsAttention.slice(0, 5) // Max 5
    };
  }

  /**
   * Obtiene leaderboard por métrica
   */
  async getLeaderboard(
    metric: 'conversions' | 'revenue' | 'response_time' | 'score',
    period?: string,
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    const allMetrics = await this.getAllVendorMetrics(period);

    let sorted: VendorMetrics[];
    let getValue: (m: VendorMetrics) => number | string;
    let metricLabel: string;

    switch (metric) {
      case 'conversions':
        sorted = allMetrics.sort((a, b) => b.leadsConverted - a.leadsConverted);
        getValue = m => m.leadsConverted;
        metricLabel = 'Conversiones';
        break;
      case 'revenue':
        sorted = allMetrics.sort((a, b) => (b.totalSalesValue || 0) - (a.totalSalesValue || 0));
        getValue = m => `$${(m.totalSalesValue || 0).toLocaleString()}`;
        metricLabel = 'Ventas';
        break;
      case 'response_time':
        sorted = allMetrics
          .filter(m => m.avgResponseTimeMinutes > 0)
          .sort((a, b) => a.avgResponseTimeMinutes - b.avgResponseTimeMinutes);
        getValue = m => `${Math.round(m.avgResponseTimeMinutes)} min`;
        metricLabel = 'Tiempo de Respuesta';
        break;
      case 'score':
      default:
        sorted = allMetrics.sort((a, b) => b.performanceScore - a.performanceScore);
        getValue = m => m.performanceScore;
        metricLabel = 'Score';
        break;
    }

    return sorted.slice(0, limit).map((m, i) => ({
      rank: i + 1,
      vendorId: m.vendorId,
      vendorName: m.vendorName,
      score: m.performanceScore,
      metric: metricLabel,
      value: getValue(m)
    }));
  }

  /**
   * Obtiene comparativa entre dos vendedores
   */
  async compareVendors(vendorId1: string, vendorId2: string, period?: string): Promise<{
    vendor1: VendorMetrics;
    vendor2: VendorMetrics;
    comparison: Record<string, { vendor1: number; vendor2: number; winner: 1 | 2 | 0 }>;
  }> {
    const vendor1 = await this.getVendorMetrics(vendorId1, period);
    const vendor2 = await this.getVendorMetrics(vendorId2, period);

    const compareMetric = (v1: number, v2: number, higherIsBetter: boolean = true): 1 | 2 | 0 => {
      if (v1 === v2) return 0;
      if (higherIsBetter) return v1 > v2 ? 1 : 2;
      return v1 < v2 ? 1 : 2;
    };

    return {
      vendor1,
      vendor2,
      comparison: {
        leadsConverted: {
          vendor1: vendor1.leadsConverted,
          vendor2: vendor2.leadsConverted,
          winner: compareMetric(vendor1.leadsConverted, vendor2.leadsConverted)
        },
        conversionRate: {
          vendor1: vendor1.conversionRate,
          vendor2: vendor2.conversionRate,
          winner: compareMetric(vendor1.conversionRate, vendor2.conversionRate)
        },
        avgResponseTime: {
          vendor1: vendor1.avgResponseTimeMinutes,
          vendor2: vendor2.avgResponseTimeMinutes,
          winner: compareMetric(vendor1.avgResponseTimeMinutes, vendor2.avgResponseTimeMinutes, false)
        },
        performanceScore: {
          vendor1: vendor1.performanceScore,
          vendor2: vendor2.performanceScore,
          winner: compareMetric(vendor1.performanceScore, vendor2.performanceScore)
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ═══════════════════════════════════════════════════════════════

  private getMetricsKey(vendorId: string, period?: string): string {
    const actualPeriod = period || this.getCurrentPeriod();
    return `${VENDOR_METRICS_PREFIX}${vendorId}:${actualPeriod}`;
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private createEmptyMetrics(vendorId: string, period?: string): VendorMetrics {
    return {
      vendorId,
      vendorName: '',
      vendorPhone: '',
      period: period || this.getCurrentPeriod(),
      leadsAssigned: 0,
      leadsContacted: 0,
      leadsQualified: 0,
      leadsConverted: 0,
      leadsLost: 0,
      contactRate: 0,
      qualificationRate: 0,
      conversionRate: 0,
      lossRate: 0,
      messagesSent: 0,
      messagesReceived: 0,
      appointmentsScheduled: 0,
      appointmentsCompleted: 0,
      appointmentsCanceled: 0,
      avgResponseTimeMinutes: 0,
      avgTimeToFirstContact: 0,
      avgTimeToConversion: 0,
      performanceScore: 0,
      trend: 'stable'
    };
  }

  private calculateRates(metrics: VendorMetrics): VendorMetrics {
    const assigned = metrics.leadsAssigned || 1;
    const contacted = metrics.leadsContacted || 1;

    metrics.contactRate = Math.round((metrics.leadsContacted / assigned) * 100);
    metrics.qualificationRate = Math.round((metrics.leadsQualified / contacted) * 100);
    metrics.conversionRate = Math.round((metrics.leadsConverted / assigned) * 100);
    metrics.lossRate = Math.round((metrics.leadsLost / assigned) * 100);

    // Calcular score de rendimiento (0-100)
    metrics.performanceScore = this.calculatePerformanceScore(metrics);

    return metrics;
  }

  private calculatePerformanceScore(metrics: VendorMetrics): number {
    // Pesos para cada métrica
    const weights = {
      conversionRate: 35, // 35%
      contactRate: 20, // 20%
      responseTime: 20, // 20%
      appointmentCompletion: 15, // 15%
      messageActivity: 10 // 10%
    };

    let score = 0;

    // Conversión (máximo 35 puntos)
    score += Math.min(metrics.conversionRate * 1.75, weights.conversionRate);

    // Contacto (máximo 20 puntos)
    score += Math.min(metrics.contactRate * 0.2, weights.contactRate);

    // Tiempo de respuesta (máximo 20 puntos, inversamente proporcional)
    if (metrics.avgResponseTimeMinutes > 0) {
      const responseScore = Math.max(0, 20 - (metrics.avgResponseTimeMinutes / 3));
      score += Math.min(responseScore, weights.responseTime);
    }

    // Citas completadas (máximo 15 puntos)
    const appointmentRate = metrics.appointmentsScheduled > 0
      ? (metrics.appointmentsCompleted / metrics.appointmentsScheduled) * 100
      : 0;
    score += Math.min(appointmentRate * 0.15, weights.appointmentCompletion);

    // Actividad de mensajes (máximo 10 puntos)
    const messageActivity = Math.min(metrics.messagesSent / 10, 10);
    score += messageActivity;

    return Math.round(Math.min(100, Math.max(0, score)));
  }

  private async saveVendorMetrics(vendorId: string, metrics: VendorMetrics): Promise<void> {
    if (!this.kv) return;

    const key = this.getMetricsKey(vendorId, metrics.period);

    // Guardar métricas
    await this.kv.put(key, JSON.stringify(metrics));

    // Actualizar índice de vendedores del período
    const indexKey = `${TEAM_METRICS_KEY}:${metrics.period}:index`;
    try {
      const vendorIds = await this.kv.get(indexKey, 'json') as string[] || [];
      if (!vendorIds.includes(vendorId)) {
        vendorIds.push(vendorId);
        await this.kv.put(indexKey, JSON.stringify(vendorIds));
      }
    } catch (e) {
      await this.kv.put(indexKey, JSON.stringify([vendorId]));
    }
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createTeamDashboard(kv?: KVNamespace): TeamDashboardService {
  return new TeamDashboardService(kv);
}
