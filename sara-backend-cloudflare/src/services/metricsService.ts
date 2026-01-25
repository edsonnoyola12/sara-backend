// ═══════════════════════════════════════════════════════════════════════════
// METRICS SERVICE - Métricas de rendimiento y latencia
// ═══════════════════════════════════════════════════════════════════════════
// Mide tiempos de respuesta, errores y throughput
// Almacena métricas en KV para análisis
// ═══════════════════════════════════════════════════════════════════════════

export interface RequestMetric {
  path: string;
  method: string;
  statusCode: number;
  duration: number; // ms
  timestamp: string;
  requestId?: string;
}

export interface MetricsSummary {
  period: string;
  totalRequests: number;
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  successRate: number;
  requestsByPath: Record<string, number>;
  requestsByStatus: Record<string, number>;
  slowestEndpoints: Array<{ path: string; avgTime: number; count: number }>;
}

const METRICS_PREFIX = 'metrics:';
const METRICS_WINDOW_KEY = 'metrics:window';
const MAX_METRICS = 1000; // Máximo de métricas en ventana
const METRIC_TTL = 60 * 60 * 24; // 24 horas

export class MetricsService {
  private kv: KVNamespace | undefined;
  private localMetrics: RequestMetric[] = [];
  private alertThresholds = {
    responseTime: 5000, // 5 segundos
    errorRate: 0.1, // 10%
  };

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Registra una métrica de request
   */
  async recordRequest(metric: Omit<RequestMetric, 'timestamp'>): Promise<void> {
    const fullMetric: RequestMetric = {
      ...metric,
      timestamp: new Date().toISOString()
    };

    // Guardar en memoria local para stats inmediatas
    this.localMetrics.push(fullMetric);
    if (this.localMetrics.length > 100) {
      this.localMetrics.shift();
    }

    // Guardar en KV para persistencia
    if (this.kv) {
      try {
        const windowData = await this.kv.get(METRICS_WINDOW_KEY, 'json') as RequestMetric[] || [];
        windowData.push(fullMetric);

        // Mantener solo las últimas MAX_METRICS
        const trimmed = windowData.slice(-MAX_METRICS);

        await this.kv.put(METRICS_WINDOW_KEY, JSON.stringify(trimmed), {
          expirationTtl: METRIC_TTL
        });
      } catch (e) {
        console.error('Error guardando métrica:', e);
      }
    }

    // Verificar alertas
    this.checkAlerts(fullMetric);
  }

  /**
   * Verifica si se deben disparar alertas
   */
  private checkAlerts(metric: RequestMetric): void {
    // Alerta por tiempo de respuesta lento
    if (metric.duration > this.alertThresholds.responseTime) {
      console.warn(`⚠️ ALERTA: Respuesta lenta en ${metric.path}: ${metric.duration}ms`);
    }

    // Alerta por error 5xx
    if (metric.statusCode >= 500) {
      console.error(`🚨 ALERTA: Error ${metric.statusCode} en ${metric.path}`);
    }
  }

  /**
   * Obtiene resumen de métricas
   */
  async getSummary(hours: number = 1): Promise<MetricsSummary> {
    let metrics: RequestMetric[] = [];

    // Obtener métricas de KV
    if (this.kv) {
      const stored = await this.kv.get(METRICS_WINDOW_KEY, 'json') as RequestMetric[] || [];
      metrics = stored;
    } else {
      metrics = this.localMetrics;
    }

    // Filtrar por período
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const filtered = metrics.filter(m => m.timestamp >= cutoff);

    if (filtered.length === 0) {
      return {
        period: `${hours}h`,
        totalRequests: 0,
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        successRate: 100,
        requestsByPath: {},
        requestsByStatus: {},
        slowestEndpoints: []
      };
    }

    // Calcular métricas
    const durations = filtered.map(m => m.duration).sort((a, b) => a - b);
    const totalRequests = filtered.length;
    const errors = filtered.filter(m => m.statusCode >= 400).length;

    // Percentiles
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    // Requests por path
    const requestsByPath: Record<string, number> = {};
    const pathDurations: Record<string, number[]> = {};
    filtered.forEach(m => {
      requestsByPath[m.path] = (requestsByPath[m.path] || 0) + 1;
      if (!pathDurations[m.path]) pathDurations[m.path] = [];
      pathDurations[m.path].push(m.duration);
    });

    // Requests por status
    const requestsByStatus: Record<string, number> = {};
    filtered.forEach(m => {
      const statusGroup = `${Math.floor(m.statusCode / 100)}xx`;
      requestsByStatus[statusGroup] = (requestsByStatus[statusGroup] || 0) + 1;
    });

    // Endpoints más lentos
    const slowestEndpoints = Object.entries(pathDurations)
      .map(([path, times]) => ({
        path,
        avgTime: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        count: times.length
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);

    return {
      period: `${hours}h`,
      totalRequests,
      avgResponseTime: Math.round(durations.reduce((a, b) => a + b, 0) / totalRequests),
      p50ResponseTime: durations[p50Index] || 0,
      p95ResponseTime: durations[p95Index] || 0,
      p99ResponseTime: durations[p99Index] || 0,
      errorRate: Math.round((errors / totalRequests) * 100 * 100) / 100,
      successRate: Math.round(((totalRequests - errors) / totalRequests) * 100 * 100) / 100,
      requestsByPath,
      requestsByStatus,
      slowestEndpoints
    };
  }

  /**
   * Genera HTML del dashboard de métricas
   */
  generateDashboardHTML(summary: MetricsSummary): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Metricas SARA</title>
  <meta http-equiv="refresh" content="30">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 30px; color: #38bdf8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; text-align: center; }
    .card-value { font-size: 36px; font-weight: bold; color: #38bdf8; }
    .card-label { color: #94a3b8; margin-top: 5px; font-size: 14px; }
    .card.success .card-value { color: #22c55e; }
    .card.warning .card-value { color: #f59e0b; }
    .card.error .card-value { color: #ef4444; }
    .section { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .section h2 { color: #38bdf8; margin-bottom: 15px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 500; }
    .bar { height: 8px; background: #38bdf8; border-radius: 4px; }
    .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Metricas de Rendimiento</h1>
    <p style="text-align: center; color: #64748b; margin-bottom: 20px;">Periodo: ${summary.period} | Auto-refresh: 30s</p>

    <div class="grid">
      <div class="card">
        <div class="card-value">${summary.totalRequests}</div>
        <div class="card-label">Total Requests</div>
      </div>
      <div class="card">
        <div class="card-value">${summary.avgResponseTime}ms</div>
        <div class="card-label">Avg Response Time</div>
      </div>
      <div class="card">
        <div class="card-value">${summary.p95ResponseTime}ms</div>
        <div class="card-label">P95 Latency</div>
      </div>
      <div class="card ${summary.successRate >= 99 ? 'success' : summary.successRate >= 95 ? 'warning' : 'error'}">
        <div class="card-value">${summary.successRate}%</div>
        <div class="card-label">Success Rate</div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="card">
        <div class="card-value">${summary.p50ResponseTime}ms</div>
        <div class="card-label">P50 (Median)</div>
      </div>
      <div class="card">
        <div class="card-value">${summary.p95ResponseTime}ms</div>
        <div class="card-label">P95</div>
      </div>
      <div class="card">
        <div class="card-value">${summary.p99ResponseTime}ms</div>
        <div class="card-label">P99</div>
      </div>
      <div class="card ${summary.errorRate <= 1 ? 'success' : summary.errorRate <= 5 ? 'warning' : 'error'}">
        <div class="card-value">${summary.errorRate}%</div>
        <div class="card-label">Error Rate</div>
      </div>
    </div>

    <div class="section">
      <h2>Endpoints mas Lentos</h2>
      <table>
        <tr><th>Endpoint</th><th>Avg Time</th><th>Requests</th><th></th></tr>
        ${summary.slowestEndpoints.map(e => `
          <tr>
            <td><code>${e.path}</code></td>
            <td>${e.avgTime}ms</td>
            <td>${e.count}</td>
            <td><div class="bar" style="width: ${Math.min(e.avgTime / 50, 100)}%"></div></td>
          </tr>
        `).join('')}
      </table>
    </div>

    <div class="section">
      <h2>Distribucion por Status</h2>
      <div style="display: flex; gap: 20px; flex-wrap: wrap;">
        ${Object.entries(summary.requestsByStatus).map(([status, count]) => `
          <div style="flex: 1; min-width: 100px;">
            <div style="font-size: 24px; font-weight: bold; color: ${status === '2xx' ? '#22c55e' : status === '4xx' ? '#f59e0b' : '#ef4444'}">${count}</div>
            <div style="color: #94a3b8;">${status}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="footer">
      Actualizado: ${new Date().toISOString()} | SARA Backend Metrics
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Middleware helper para medir tiempo de request
   */
  createTimer(): { end: () => number } {
    const start = Date.now();
    return {
      end: () => Date.now() - start
    };
  }

  /**
   * Configura umbrales de alerta
   */
  setAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createMetrics(kv?: KVNamespace): MetricsService {
  return new MetricsService(kv);
}
