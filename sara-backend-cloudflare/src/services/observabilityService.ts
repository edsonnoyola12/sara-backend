// ═══════════════════════════════════════════════════════════════════════════
// OBSERVABILITY SERVICE - Unified logging, CRON tracking, business metrics
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CronExecution {
  name: string;
  startedAt: number;
  duration_ms: number;
  success: boolean;
  error?: string;
  itemsProcessed?: number;
}

export interface CronRunSummary {
  trigger: string;
  startedAt: string;
  totalDuration_ms: number;
  tasks: CronExecution[];
  successCount: number;
  failCount: number;
}

export interface ObservabilityDashboard {
  timestamp: string;
  crons: {
    last24h: { total: number; success: number; failed: number; avgDuration_ms: number };
    slowest: { name: string; duration_ms: number; timestamp: string }[];
    failures: { name: string; error: string; timestamp: string }[];
  };
  errors: {
    last24h: number;
    bySeverity: Record<string, number>;
    bySource: { source: string; count: number }[];
  };
  health: {
    status: string;
    lastCheck: string;
    supabase_ok: boolean;
    meta_ok: boolean;
    openai_ok: boolean;
  };
  business: {
    leadsToday: number;
    messagesToday: number;
    aiResponsesToday: number;
    avgResponseTime_ms: number;
    appointmentsToday: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON TRACKER - Track execution time of individual CRON tasks
// ═══════════════════════════════════════════════════════════════════════════

export class CronTracker {
  private executions: CronExecution[] = [];
  private trigger: string;
  private startTime: number;

  constructor(trigger: string) {
    this.trigger = trigger;
    this.startTime = Date.now();
  }

  /**
   * Wrap a CRON task with timing and error tracking.
   * Replaces bare safeCron with observability.
   */
  async track(name: string, fn: () => Promise<any>): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      this.executions.push({
        name,
        startedAt: start,
        duration_ms: Date.now() - start,
        success: true
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.executions.push({
        name,
        startedAt: start,
        duration_ms: Date.now() - start,
        success: false,
        error
      });
      console.error(`❌ Error en ${name}:`, e);
    }
  }

  /** Get summary of all tracked CRON executions in this run */
  getSummary(): CronRunSummary {
    return {
      trigger: this.trigger,
      startedAt: new Date(this.startTime).toISOString(),
      totalDuration_ms: Date.now() - this.startTime,
      tasks: this.executions,
      successCount: this.executions.filter(e => e.success).length,
      failCount: this.executions.filter(e => !e.success).length
    };
  }

  /** Persist summary to sara_logs for historical analysis */
  async persist(supabase: SupabaseService): Promise<void> {
    const summary = this.getSummary();
    try {
      await supabase.client.from('sara_logs').insert({
        tipo: 'cron_execution',
        mensaje: `CRON ${summary.trigger}: ${summary.successCount}/${summary.tasks.length} OK en ${summary.totalDuration_ms}ms`,
        datos: {
          trigger: summary.trigger,
          totalDuration_ms: summary.totalDuration_ms,
          taskCount: summary.tasks.length,
          successCount: summary.successCount,
          failCount: summary.failCount,
          tasks: summary.tasks.map(t => ({
            name: t.name,
            duration_ms: t.duration_ms,
            success: t.success,
            ...(t.error && { error: t.error.slice(0, 200) })
          })),
          // Flag slow tasks (>5s)
          slowTasks: summary.tasks
            .filter(t => t.duration_ms > 5000)
            .map(t => ({ name: t.name, duration_ms: t.duration_ms }))
        },
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('Error persisting CRON summary:', e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVABILITY DASHBOARD - Aggregate metrics from multiple tables
// ═══════════════════════════════════════════════════════════════════════════

export async function getObservabilityDashboard(
  supabase: SupabaseService
): Promise<ObservabilityDashboard> {
  const now = new Date();
  const hace24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // Run all queries in parallel
  const [
    cronLogsResult,
    errorLogsResult,
    healthResult,
    leadsResult,
    aiResult,
    appointmentsResult
  ] = await Promise.all([
    // 1. CRON execution logs (last 24h)
    supabase.client
      .from('sara_logs')
      .select('tipo, mensaje, datos, created_at')
      .eq('tipo', 'cron_execution')
      .gte('created_at', hace24h)
      .order('created_at', { ascending: false })
      .limit(100),

    // 2. Error logs (last 24h)
    supabase.client
      .from('error_logs')
      .select('severity, source, message, created_at')
      .gte('created_at', hace24h)
      .order('created_at', { ascending: false })
      .limit(200),

    // 3. Last health check
    supabase.client
      .from('health_checks')
      .select('status, supabase_ok, meta_ok, openai_ok, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 4. Leads today
    supabase.client
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayISO),

    // 5. AI responses today
    supabase.client
      .from('ai_responses')
      .select('response_time_ms')
      .gte('created_at', todayISO),

    // 6. Appointments today
    supabase.client
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('scheduled_date', now.toISOString().split('T')[0])
  ]);

  // Process CRON logs
  const cronLogs = cronLogsResult.data || [];
  const allCronTasks: { name: string; duration_ms: number; success: boolean; error?: string; timestamp: string }[] = [];
  for (const log of cronLogs) {
    const tasks = log.datos?.tasks || [];
    for (const task of tasks) {
      allCronTasks.push({
        name: task.name,
        duration_ms: task.duration_ms,
        success: task.success,
        error: task.error,
        timestamp: log.created_at
      });
    }
  }

  const cronSuccess = allCronTasks.filter(t => t.success).length;
  const cronFailed = allCronTasks.filter(t => !t.success).length;
  const avgDuration = allCronTasks.length > 0
    ? Math.round(allCronTasks.reduce((sum, t) => sum + t.duration_ms, 0) / allCronTasks.length)
    : 0;

  const slowest = allCronTasks
    .filter(t => t.success)
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 5)
    .map(t => ({ name: t.name, duration_ms: t.duration_ms, timestamp: t.timestamp }));

  const failures = allCronTasks
    .filter(t => !t.success)
    .slice(0, 10)
    .map(t => ({ name: t.name, error: t.error || 'unknown', timestamp: t.timestamp }));

  // Process error logs
  const errors = errorLogsResult.data || [];
  const bySeverity: Record<string, number> = {};
  const bySourceMap: Record<string, number> = {};
  for (const err of errors) {
    bySeverity[err.severity] = (bySeverity[err.severity] || 0) + 1;
    const src = err.source || 'unknown';
    bySourceMap[src] = (bySourceMap[src] || 0) + 1;
  }
  const bySource = Object.entries(bySourceMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  // Process health
  const health = healthResult.data;

  // Process AI responses
  const aiResponses = aiResult.data || [];
  const avgResponseTime = aiResponses.length > 0
    ? Math.round(aiResponses.reduce((sum: number, r: any) => sum + (r.response_time_ms || 0), 0) / aiResponses.length)
    : 0;

  return {
    timestamp: now.toISOString(),
    crons: {
      last24h: {
        total: allCronTasks.length,
        success: cronSuccess,
        failed: cronFailed,
        avgDuration_ms: avgDuration
      },
      slowest,
      failures
    },
    errors: {
      last24h: errors.length,
      bySeverity,
      bySource
    },
    health: {
      status: health?.status || 'unknown',
      lastCheck: health?.created_at || 'never',
      supabase_ok: health?.supabase_ok ?? false,
      meta_ok: health?.meta_ok ?? false,
      openai_ok: health?.openai_ok ?? false
    },
    business: {
      leadsToday: leadsResult.count || 0,
      messagesToday: 0, // Could add message tracking query
      aiResponsesToday: aiResponses.length,
      avgResponseTime_ms: avgResponseTime,
      appointmentsToday: appointmentsResult.count || 0
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT FOR WHATSAPP - CEO "observabilidad" command
// ═══════════════════════════════════════════════════════════════════════════

export function formatObservabilityForWhatsApp(dashboard: ObservabilityDashboard): string {
  const { crons, errors, health, business } = dashboard;

  let msg = `📊 *OBSERVABILIDAD SARA*\n\n`;

  // Health
  const statusMap: Record<string, string> = { healthy: 'SALUDABLE', degraded: 'DEGRADADO', critical: 'CRÍTICO' };
  const statusEmoji = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❓';
  msg += `*Sistema:* ${statusEmoji} ${statusMap[health.status] || health.status.toUpperCase()}\n`;
  msg += `${health.supabase_ok ? '✅' : '❌'} Supabase | ${health.meta_ok ? '✅' : '❌'} Meta | ${health.openai_ok ? '✅' : '❌'} OpenAI\n\n`;

  // Business
  msg += `*Hoy:*\n`;
  msg += `• Leads nuevos: ${business.leadsToday}\n`;
  msg += `• Respuestas IA: ${business.aiResponsesToday}`;
  if (business.avgResponseTime_ms > 0) msg += ` (avg ${business.avgResponseTime_ms}ms)`;
  msg += `\n`;
  msg += `• Citas: ${business.appointmentsToday}\n\n`;

  // CRONs (last 24h)
  msg += `*CRONs (24h):*\n`;
  msg += `• Total tareas: ${crons.last24h.total}\n`;
  msg += `• Exitosas: ${crons.last24h.success} | Fallidas: ${crons.last24h.failed}\n`;
  if (crons.last24h.avgDuration_ms > 0) msg += `• Duración promedio: ${crons.last24h.avgDuration_ms}ms\n`;

  if (crons.slowest.length > 0) {
    msg += `\n*Tareas más lentas:*\n`;
    for (const s of crons.slowest.slice(0, 3)) {
      msg += `• ${s.name}: ${s.duration_ms}ms\n`;
    }
  }

  if (crons.failures.length > 0) {
    msg += `\n*Fallos recientes:*\n`;
    for (const f of crons.failures.slice(0, 3)) {
      msg += `• ${f.name}: ${f.error.slice(0, 60)}\n`;
    }
  }

  // Errors
  if (errors.last24h > 0) {
    msg += `\n*Errores (24h):* ${errors.last24h}\n`;
    for (const [sev, count] of Object.entries(errors.bySeverity)) {
      const emoji = sev === 'critical' ? '🔴' : sev === 'error' ? '🟠' : '🟡';
      msg += `${emoji} ${sev}: ${count}\n`;
    }
  } else {
    msg += `\n✅ *Sin errores en 24h*\n`;
  }

  return msg;
}
