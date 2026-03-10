import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronTracker, getObservabilityDashboard, formatObservabilityForWhatsApp } from '../services/observabilityService';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

function createMockSupabase(overrides: Record<string, any> = {}) {
  const defaultData: Record<string, any> = {
    sara_logs: [],
    error_logs: [],
    health_checks: null,
    leads: [],
    ai_responses: [],
    appointments: [],
    ...overrides
  };

  return {
    client: {
      from: (table: string) => {
        const data = defaultData[table];
        const isCount = table === 'leads' || table === 'appointments';

        return {
          select: (_cols?: string, _opts?: any) => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: data, error: null })
                })
              }),
              gte: () => ({
                order: () => ({
                  limit: async () => ({ data: Array.isArray(data) ? data : [], error: null, count: Array.isArray(data) ? data.length : 0 })
                })
              }),
              limit: async () => ({ data: Array.isArray(data) ? data : [], error: null, count: Array.isArray(data) ? data.length : 0 })
            }),
            gte: (_col: string, _val: string) => ({
              order: (_col2: string, _opts2: any) => ({
                limit: async (_n: number) => ({ data: Array.isArray(data) ? data : [], error: null, count: Array.isArray(data) ? data.length : 0 })
              }),
              limit: async (_n: number) => ({ data: Array.isArray(data) ? data : [], error: null, count: Array.isArray(data) ? data.length : 0 }),
              not: () => ({
                limit: async () => ({ data: Array.isArray(data) ? data : [], error: null })
              })
            }),
            order: (_col: string, _opts2: any) => ({
              limit: (_n: number) => ({
                maybeSingle: async () => ({ data: data, error: null })
              })
            }),
            // For head count queries
            count: Array.isArray(data) ? data.length : 0,
            error: null,
            data: Array.isArray(data) ? data : []
          }),
          insert: async (_row: any) => ({ error: null })
        };
      }
    }
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON TRACKER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('CronTracker', () => {
  it('should track successful task execution', async () => {
    const tracker = new CronTracker('*/2 * * * *');

    await tracker.track('testTask', async () => {
      // Simulate work
    });

    const summary = tracker.getSummary();
    expect(summary.trigger).toBe('*/2 * * * *');
    expect(summary.tasks).toHaveLength(1);
    expect(summary.tasks[0].name).toBe('testTask');
    expect(summary.tasks[0].success).toBe(true);
    expect(summary.tasks[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(summary.successCount).toBe(1);
    expect(summary.failCount).toBe(0);
  });

  it('should track failed task execution', async () => {
    const tracker = new CronTracker('*/2 * * * *');

    await tracker.track('failingTask', async () => {
      throw new Error('Task failed');
    });

    const summary = tracker.getSummary();
    expect(summary.tasks).toHaveLength(1);
    expect(summary.tasks[0].name).toBe('failingTask');
    expect(summary.tasks[0].success).toBe(false);
    expect(summary.tasks[0].error).toBe('Task failed');
    expect(summary.successCount).toBe(0);
    expect(summary.failCount).toBe(1);
  });

  it('should track multiple tasks', async () => {
    const tracker = new CronTracker('0 14 * * 1-5');

    await tracker.track('task1', async () => {});
    await tracker.track('task2', async () => { throw new Error('boom'); });
    await tracker.track('task3', async () => {});

    const summary = tracker.getSummary();
    expect(summary.tasks).toHaveLength(3);
    expect(summary.successCount).toBe(2);
    expect(summary.failCount).toBe(1);
    expect(summary.totalDuration_ms).toBeGreaterThanOrEqual(0);
  });

  it('should measure execution time', async () => {
    const tracker = new CronTracker('*/2 * * * *');

    await tracker.track('slowTask', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const summary = tracker.getSummary();
    expect(summary.tasks[0].duration_ms).toBeGreaterThanOrEqual(40);
  });

  it('should persist summary to supabase', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      client: {
        from: () => ({ insert: insertSpy })
      }
    } as any;

    const tracker = new CronTracker('*/2 * * * *');
    await tracker.track('task1', async () => {});
    await tracker.track('task2', async () => { throw new Error('fail'); });

    await tracker.persist(supabase);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertedRow = insertSpy.mock.calls[0][0];
    expect(insertedRow.tipo).toBe('cron_execution');
    expect(insertedRow.mensaje).toContain('1/2 OK');
    expect(insertedRow.datos.taskCount).toBe(2);
    expect(insertedRow.datos.successCount).toBe(1);
    expect(insertedRow.datos.failCount).toBe(1);
    expect(insertedRow.datos.tasks).toHaveLength(2);
  });

  it('should not throw if persist fails', async () => {
    const supabase = {
      client: {
        from: () => ({ insert: async () => { throw new Error('DB down'); } })
      }
    } as any;

    const tracker = new CronTracker('*/2 * * * *');
    await tracker.track('task1', async () => {});

    // Should not throw
    await tracker.persist(supabase);
  });

  it('should flag slow tasks (>5s) in persist data', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      client: {
        from: () => ({ insert: insertSpy })
      }
    } as any;

    const tracker = new CronTracker('*/2 * * * *');
    // Manually add a "slow" task to executions
    (tracker as any).executions.push({
      name: 'slowTask',
      startedAt: Date.now() - 6000,
      duration_ms: 6000,
      success: true
    });

    await tracker.persist(supabase);

    const insertedRow = insertSpy.mock.calls[0][0];
    expect(insertedRow.datos.slowTasks).toHaveLength(1);
    expect(insertedRow.datos.slowTasks[0].name).toBe('slowTask');
    expect(insertedRow.datos.slowTasks[0].duration_ms).toBe(6000);
  });

  it('should handle empty tracker with no tasks', async () => {
    const tracker = new CronTracker('*/2 * * * *');
    const summary = tracker.getSummary();
    expect(summary.tasks).toHaveLength(0);
    expect(summary.successCount).toBe(0);
    expect(summary.failCount).toBe(0);
  });

  it('should capture startedAt timestamp for each task', async () => {
    const tracker = new CronTracker('*/2 * * * *');
    const before = Date.now();
    await tracker.track('timedTask', async () => {});
    const after = Date.now();

    const summary = tracker.getSummary();
    expect(summary.tasks[0].startedAt).toBeGreaterThanOrEqual(before);
    expect(summary.tasks[0].startedAt).toBeLessThanOrEqual(after);
  });

  it('should include trigger and startedAt in summary', async () => {
    const before = new Date().toISOString();
    const tracker = new CronTracker('0 1 * * *');
    const summary = tracker.getSummary();

    expect(summary.trigger).toBe('0 1 * * *');
    expect(summary.startedAt).toBeDefined();
    expect(new Date(summary.startedAt).getTime()).toBeGreaterThan(0);
  });

  it('should truncate error messages to 200 chars in persist', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      client: {
        from: () => ({ insert: insertSpy })
      }
    } as any;

    const tracker = new CronTracker('*/2 * * * *');
    await tracker.track('longErrorTask', async () => {
      throw new Error('x'.repeat(500));
    });

    await tracker.persist(supabase);

    const insertedRow = insertSpy.mock.calls[0][0];
    const taskError = insertedRow.datos.tasks[0].error;
    expect(taskError.length).toBeLessThanOrEqual(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT FOR WHATSAPP TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('formatObservabilityForWhatsApp', () => {
  it('should format dashboard with healthy system', () => {
    const dashboard = {
      timestamp: new Date().toISOString(),
      crons: {
        last24h: { total: 150, success: 148, failed: 2, avgDuration_ms: 45 },
        slowest: [{ name: 'enviarBriefing', duration_ms: 3200, timestamp: new Date().toISOString() }],
        failures: [{ name: 'videoFail', error: 'Veo API timeout', timestamp: new Date().toISOString() }]
      },
      errors: {
        last24h: 5,
        bySeverity: { error: 3, warning: 2 },
        bySource: [{ source: 'cron:followups', count: 3 }]
      },
      health: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        supabase_ok: true,
        meta_ok: true,
        openai_ok: true
      },
      business: {
        leadsToday: 8,
        messagesToday: 0,
        aiResponsesToday: 45,
        avgResponseTime_ms: 1200,
        appointmentsToday: 3
      }
    };

    const result = formatObservabilityForWhatsApp(dashboard);

    expect(result).toContain('OBSERVABILIDAD SARA');
    expect(result).toContain('SALUDABLE');
    expect(result).toContain('Leads nuevos: 8');
    expect(result).toContain('Respuestas IA: 45');
    expect(result).toContain('avg 1200ms');
    expect(result).toContain('Citas: 3');
    expect(result).toContain('Total tareas: 150');
    expect(result).toContain('Exitosas: 148');
    expect(result).toContain('Fallidas: 2');
    expect(result).toContain('enviarBriefing');
    expect(result).toContain('videoFail');
    expect(result).toContain('Errores (24h):');
  });

  it('should format dashboard with no errors', () => {
    const dashboard = {
      timestamp: new Date().toISOString(),
      crons: {
        last24h: { total: 50, success: 50, failed: 0, avgDuration_ms: 30 },
        slowest: [],
        failures: []
      },
      errors: {
        last24h: 0,
        bySeverity: {},
        bySource: []
      },
      health: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        supabase_ok: true,
        meta_ok: true,
        openai_ok: true
      },
      business: {
        leadsToday: 0,
        messagesToday: 0,
        aiResponsesToday: 0,
        avgResponseTime_ms: 0,
        appointmentsToday: 0
      }
    };

    const result = formatObservabilityForWhatsApp(dashboard);
    expect(result).toContain('Sin errores en 24h');
    expect(result).not.toContain('Fallos recientes');
  });

  it('should format degraded system status', () => {
    const dashboard = {
      timestamp: new Date().toISOString(),
      crons: {
        last24h: { total: 10, success: 5, failed: 5, avgDuration_ms: 100 },
        slowest: [],
        failures: []
      },
      errors: {
        last24h: 20,
        bySeverity: { critical: 5, error: 10, warning: 5 },
        bySource: [{ source: 'meta_api', count: 10 }]
      },
      health: {
        status: 'degraded',
        lastCheck: new Date().toISOString(),
        supabase_ok: true,
        meta_ok: false,
        openai_ok: true
      },
      business: {
        leadsToday: 3,
        messagesToday: 0,
        aiResponsesToday: 10,
        avgResponseTime_ms: 2500,
        appointmentsToday: 1
      }
    };

    const result = formatObservabilityForWhatsApp(dashboard);
    expect(result).toContain('DEGRADADO');
    expect(result).toContain('critical: 5');
  });

  it('should show correct service emojis', () => {
    const dashboard = {
      timestamp: new Date().toISOString(),
      crons: { last24h: { total: 0, success: 0, failed: 0, avgDuration_ms: 0 }, slowest: [], failures: [] },
      errors: { last24h: 0, bySeverity: {}, bySource: [] },
      health: {
        status: 'degraded',
        lastCheck: new Date().toISOString(),
        supabase_ok: true,
        meta_ok: false,
        openai_ok: true
      },
      business: { leadsToday: 0, messagesToday: 0, aiResponsesToday: 0, avgResponseTime_ms: 0, appointmentsToday: 0 }
    };

    const result = formatObservabilityForWhatsApp(dashboard);
    // Supabase OK, Meta NOT OK, OpenAI OK
    expect(result).toMatch(/✅ Supabase/);
    expect(result).toMatch(/❌ Meta/);
    expect(result).toMatch(/✅ OpenAI/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CEO COMMAND INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('CEO observabilidad command', () => {
  it('should recognize "observabilidad" command', async () => {
    const { CEOCommandsService } = await import('../services/ceoCommandsService');
    const supabase = createMockSupabase();
    const service = new CEOCommandsService(supabase);

    const result = await service.detectCommand('observabilidad');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('observabilidad');
  });

  it('should recognize "obs" command', async () => {
    const { CEOCommandsService } = await import('../services/ceoCommandsService');
    const supabase = createMockSupabase();
    const service = new CEOCommandsService(supabase);

    const result = await service.detectCommand('obs');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('observabilidad');
  });

  it('should recognize "crons" command', async () => {
    const { CEOCommandsService } = await import('../services/ceoCommandsService');
    const supabase = createMockSupabase();
    const service = new CEOCommandsService(supabase);

    const result = await service.detectCommand('crons');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('observabilidad');
  });

  it('should recognize "metricas" command', async () => {
    const { CEOCommandsService } = await import('../services/ceoCommandsService');
    const supabase = createMockSupabase();
    const service = new CEOCommandsService(supabase);

    const result = await service.detectCommand('metricas');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('observabilidad');
  });
});
