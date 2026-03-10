import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies BEFORE importing the module
vi.mock('../crons/healthCheck', () => ({
  logErrorToDB: vi.fn().mockResolvedValue(undefined),
}));

// ═══════════════════════════════════════════════════════════════
// Mock Factories
// ═══════════════════════════════════════════════════════════════

function createMockSupabase(responses: Record<string, any> = {}) {
  return {
    client: {
      from: vi.fn((table: string) => {
        const response = responses[table] || { data: null, error: null, count: null };

        // Build a deep chain of chainable methods
        // Must create object first, then assign self-referencing methods
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.gte = vi.fn().mockReturnValue(chain);
        chain.lt = vi.fn().mockReturnValue(chain);
        chain.lte = vi.fn().mockReturnValue(chain);
        chain.not = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.single = vi.fn().mockResolvedValue(response);
        chain.maybeSingle = vi.fn().mockResolvedValue(response);
        chain.insert = vi.fn().mockReturnValue(chain);
        chain.delete = vi.fn().mockReturnValue(chain);
        // Resolve when the chain is awaited (for queries that end without .single()/.limit())
        chain.then = (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject);

        return chain;
      }),
    },
  };
}

function createMockEnv() {
  return {
    META_ACCESS_TOKEN: 'fake-meta-token',
    META_PHONE_NUMBER_ID: 'fake-phone-id',
    ANTHROPIC_API_KEY: 'fake-anthropic-key',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'fake@gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: 'fake-private-key',
    GOOGLE_CALENDAR_ID: 'fake-calendar-id',
    SARA_CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    SARA_BACKUPS: {
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockCache() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({
      hits: 10,
      misses: 5,
      hitRate: '66.7%',
      totalKeys: 3,
      lastReset: new Date().toISOString(),
    }),
  };
}

// ═══════════════════════════════════════════════════════════════
// Imports (AFTER vi.mock)
// ═══════════════════════════════════════════════════════════════

import {
  getSystemStatus,
  getAnalyticsDashboard,
  renderAnalyticsPage,
  renderStatusPage,
  getHealthStatus,
  exportBackup,
  backupSemanalR2,
  getBackupLog,
} from '../crons/dashboard';

import { logErrorToDB } from '../crons/healthCheck';

// ═══════════════════════════════════════════════════════════════
// Test Data
// ═══════════════════════════════════════════════════════════════

const now = new Date();
const todayISO = now.toISOString();
const yesterdayISO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
const lastWeekISO = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

const sampleLeads = [
  {
    id: 'l1',
    name: 'Roberto Garcia',
    status: 'new',
    source: 'WhatsApp',
    created_at: todayISO,
    assigned_to: 'v1',
    property_interest: 'Monte Verde',
    first_response_at: new Date(new Date(todayISO).getTime() + 5 * 60000).toISOString(),
  },
  {
    id: 'l2',
    name: 'Maria Lopez',
    status: 'cita_agendada',
    source: 'Facebook',
    created_at: yesterdayISO,
    assigned_to: 'v1',
    property_interest: 'Los Encinos',
    first_response_at: new Date(new Date(yesterdayISO).getTime() + 10 * 60000).toISOString(),
  },
  {
    id: 'l3',
    name: 'Carlos Mendez',
    status: 'ganado',
    source: 'WhatsApp',
    created_at: lastWeekISO,
    assigned_to: 'v2',
    property_interest: 'Distrito Falco',
    first_response_at: new Date(new Date(lastWeekISO).getTime() + 3 * 60000).toISOString(),
  },
];

const sampleTeamMembers = [
  { id: 'v1', name: 'Javier Frausto', active: true, is_on_duty: true },
  { id: 'v2', name: 'Karla Muedano', active: true, is_on_duty: false },
  { id: 'v3', name: 'Refugio Pulido', active: false, is_on_duty: false },
];

const sampleRecentLeads = [
  { name: 'Roberto Garcia', created_at: todayISO, source: 'WhatsApp' },
  { name: 'Maria Lopez', created_at: yesterdayISO, source: 'Facebook' },
];

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// getSystemStatus
// ═══════════════════════════════════════════════════════════════

describe('getSystemStatus', () => {
  it('should return healthy status with all services OK', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null, count: 42 },
      scheduled_followups: { data: null, error: null, count: 3 },
      team_members: { data: sampleTeamMembers, error: null },
    });

    const env = createMockEnv();
    const cache = createMockCache();

    const status = await getSystemStatus(mockSupabase as any, env, cache as any);

    expect(status).toBeDefined();
    expect(status.overall_status).toBe('healthy');
    expect(status.version).toBe('2.0.0');
    expect(status.timestamp).toBeDefined();
    expect(status.services.database.status).toBe('ok');
    expect(status.services.database.latency_ms).toBeGreaterThanOrEqual(0);
    expect(status.services.meta_whatsapp.configured).toBe(true);
    expect(status.services.anthropic.configured).toBe(true);
    expect(status.services.google_calendar.configured).toBe(true);
  });

  it('should handle database error gracefully and set status to degraded/down', async () => {
    const mockSupabase = {
      client: {
        from: vi.fn(() => {
          throw new Error('DB connection failed');
        }),
      },
    };

    const env = createMockEnv();

    const status = await getSystemStatus(mockSupabase as any, env, null);

    expect(status.services.database.status).toBe('error');
    expect(status.services.database.error).toContain('DB connection failed');
    expect(status.overall_status).toBe('down');
  });

  it('should handle missing env vars and mark services as not configured', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null, count: 10 },
      team_members: { data: [], error: null },
    });

    const emptyEnv = {};

    const status = await getSystemStatus(mockSupabase as any, emptyEnv, null);

    expect(status.services.meta_whatsapp.configured).toBe(false);
    expect(status.services.meta_whatsapp.status).toBe('not_configured');
    expect(status.services.anthropic.configured).toBe(false);
    expect(status.services.anthropic.status).toBe('not_configured');
    expect(status.services.google_calendar.configured).toBe(false);
    expect(status.services.google_calendar.status).toBe('not_configured');
    expect(status.services.cache.status).toBe('not_configured');
    expect(status.services.cache.available).toBe(false);
  });

  it('should include correct metrics (total leads, leads today, etc.)', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null, count: 100 },
      scheduled_followups: { data: null, error: null, count: 7 },
      team_members: { data: sampleTeamMembers, error: null },
    });

    const env = createMockEnv();

    const status = await getSystemStatus(mockSupabase as any, env, null);

    expect(status.metrics).toBeDefined();
    expect(typeof status.metrics.total_leads).toBe('number');
    expect(typeof status.metrics.leads_today).toBe('number');
    expect(typeof status.metrics.leads_this_week).toBe('number');
    expect(typeof status.metrics.active_conversations).toBe('number');
    expect(typeof status.metrics.pending_followups).toBe('number');
  });

  it('should include team info with correct counts', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null, count: 5 },
      team_members: { data: sampleTeamMembers, error: null },
    });

    const env = createMockEnv();

    const status = await getSystemStatus(mockSupabase as any, env, null);

    expect(status.team).toBeDefined();
    expect(status.team.total_members).toBe(3);
    expect(status.team.active_members).toBe(2);
    expect(status.team.on_duty).toBe(1);
  });

  it('should include cache stats when cache is available', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null, count: 5 },
      team_members: { data: [], error: null },
    });

    const env = createMockEnv();
    const cache = createMockCache();

    const status = await getSystemStatus(mockSupabase as any, env, cache as any);

    expect(status.services.cache.status).toBe('ok');
    expect(status.services.cache.available).toBe(true);
    expect(status.services.cache.stats).toBeDefined();
  });

  it('should include recent activity from latest leads', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleRecentLeads, error: null, count: 2 },
      team_members: { data: [], error: null },
    });

    const env = createMockEnv();

    const status = await getSystemStatus(mockSupabase as any, env, null);

    expect(status.recent_activity).toBeDefined();
    expect(Array.isArray(status.recent_activity)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// getAnalyticsDashboard
// ═══════════════════════════════════════════════════════════════

describe('getAnalyticsDashboard', () => {
  it('should return analytics with funnel data', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleLeads, error: null },
      team_members: {
        data: [
          { id: 'v1', name: 'Javier Frausto' },
          { id: 'v2', name: 'Karla Muedano' },
        ],
        error: null,
      },
    });

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics).toBeDefined();
    expect(analytics.period_days).toBe(30);
    expect(analytics.generated_at).toBeDefined();
    expect(analytics.funnel.total_leads).toBe(3);
    expect(analytics.funnel.leads_with_appointment).toBe(2); // cita_agendada + ganado
    expect(analytics.funnel.leads_converted).toBe(1); // ganado
    expect(analytics.funnel.conversion_rate_appointment).toContain('%');
    expect(analytics.funnel.conversion_rate_sale).toContain('%');
  });

  it('should respect days parameter', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleLeads, error: null },
      team_members: { data: [], error: null },
    });

    const analytics7 = await getAnalyticsDashboard(mockSupabase as any, 7);
    const analytics90 = await getAnalyticsDashboard(mockSupabase as any, 90);

    expect(analytics7.period_days).toBe(7);
    expect(analytics90.period_days).toBe(90);
  });

  it('should handle empty data', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null },
      team_members: { data: [], error: null },
    });

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics.funnel.total_leads).toBe(0);
    expect(analytics.funnel.leads_with_appointment).toBe(0);
    expect(analytics.funnel.leads_converted).toBe(0);
    expect(analytics.funnel.conversion_rate_appointment).toBe('0%');
    expect(analytics.funnel.conversion_rate_sale).toBe('0%');
    expect(analytics.leads_by_source).toEqual([]);
    expect(analytics.leads_by_status).toEqual([]);
    expect(analytics.top_sellers).toEqual([]);
  });

  it('should include leads by source with percentages', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleLeads, error: null },
      team_members: { data: [], error: null },
    });

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics.leads_by_source.length).toBeGreaterThan(0);

    const whatsappSource = analytics.leads_by_source.find(s => s.source === 'WhatsApp');
    expect(whatsappSource).toBeDefined();
    expect(whatsappSource!.count).toBe(2);
    expect(whatsappSource!.percentage).toContain('%');

    const fbSource = analytics.leads_by_source.find(s => s.source === 'Facebook');
    expect(fbSource).toBeDefined();
    expect(fbSource!.count).toBe(1);
  });

  it('should include leads by status with percentages', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleLeads, error: null },
      team_members: { data: [], error: null },
    });

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics.leads_by_status.length).toBeGreaterThan(0);

    const newStatus = analytics.leads_by_status.find(s => s.status === 'new');
    expect(newStatus).toBeDefined();
    expect(newStatus!.count).toBe(1);
    expect(newStatus!.percentage).toContain('%');
  });

  it('should include top sellers with correct stats', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleLeads, error: null },
      team_members: {
        data: [
          { id: 'v1', name: 'Javier Frausto' },
          { id: 'v2', name: 'Karla Muedano' },
        ],
        error: null,
      },
    });

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics.top_sellers.length).toBeGreaterThan(0);

    const javier = analytics.top_sellers.find(s => s.name === 'Javier Frausto');
    expect(javier).toBeDefined();
    expect(javier!.leads).toBe(2);
    expect(javier!.appointments).toBe(1); // cita_agendada

    const karla = analytics.top_sellers.find(s => s.name === 'Karla Muedano');
    expect(karla).toBeDefined();
    expect(karla!.leads).toBe(1);
    expect(karla!.sales).toBe(1); // ganado
  });

  it('should calculate response times', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleLeads, error: null },
      team_members: { data: [], error: null },
    });

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics.response_times).toBeDefined();
    expect(typeof analytics.response_times.avg_first_response_minutes).toBe('number');
    expect(analytics.response_times.avg_first_response_minutes).toBeGreaterThan(0);
  });

  it('should include recent conversions', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: sampleLeads, error: null },
      team_members: {
        data: [
          { id: 'v1', name: 'Javier Frausto' },
          { id: 'v2', name: 'Karla Muedano' },
        ],
        error: null,
      },
    });

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics.recent_conversions.length).toBe(1);
    expect(analytics.recent_conversions[0].lead_name).toBe('Carlos Mendez');
    expect(analytics.recent_conversions[0].property).toBe('Distrito Falco');
    expect(analytics.recent_conversions[0].seller).toBe('Karla Muedano');
  });

  it('should log error to DB on failure', async () => {
    const mockSupabase = {
      client: {
        from: vi.fn(() => {
          throw new Error('Analytics query failed');
        }),
      },
    };

    const analytics = await getAnalyticsDashboard(mockSupabase as any, 30);

    expect(analytics.funnel.total_leads).toBe(0);
    expect(logErrorToDB).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// renderAnalyticsPage
// ═══════════════════════════════════════════════════════════════

describe('renderAnalyticsPage', () => {
  const sampleAnalytics = {
    period_days: 30,
    generated_at: todayISO,
    funnel: {
      total_leads: 100,
      leads_with_appointment: 40,
      leads_converted: 10,
      conversion_rate_appointment: '40.0%',
      conversion_rate_sale: '10.0%',
    },
    leads_by_period: {
      today: 5,
      yesterday: 3,
      this_week: 15,
      last_week: 12,
      this_month: 50,
    },
    leads_by_source: [
      { source: 'WhatsApp', count: 60, percentage: '60.0%' },
      { source: 'Facebook', count: 40, percentage: '40.0%' },
    ],
    leads_by_status: [
      { status: 'new', count: 30, percentage: '30.0%' },
      { status: 'contacted', count: 25, percentage: '25.0%' },
    ],
    top_sellers: [
      { name: 'Javier', leads: 20, appointments: 10, sales: 5 },
    ],
    response_times: {
      avg_first_response_minutes: 8,
      avg_to_appointment_hours: 24,
    },
    recent_conversions: [
      { lead_name: 'Roberto', property: 'Monte Verde', date: todayISO, seller: 'Javier' },
    ],
  };

  it('should return valid HTML string', () => {
    const html = renderAnalyticsPage(sampleAnalytics);

    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('SARA Analytics');
  });

  it('should include key metrics in output', () => {
    const html = renderAnalyticsPage(sampleAnalytics);

    expect(html).toContain('100'); // total_leads
    expect(html).toContain('40'); // leads_with_appointment
    expect(html).toContain('10'); // leads_converted
    expect(html).toContain('40.0%'); // conversion_rate_appointment
    expect(html).toContain('10.0%'); // conversion_rate_sale
    expect(html).toContain('30 dias'); // period
  });

  it('should include leads by source chart', () => {
    const html = renderAnalyticsPage(sampleAnalytics);

    expect(html).toContain('WhatsApp');
    expect(html).toContain('Facebook');
    expect(html).toContain('60.0%');
    expect(html).toContain('40.0%');
  });

  it('should include top sellers table', () => {
    const html = renderAnalyticsPage(sampleAnalytics);

    expect(html).toContain('Javier');
    expect(html).toContain('Top Vendedores');
  });

  it('should include recent conversions', () => {
    const html = renderAnalyticsPage(sampleAnalytics);

    expect(html).toContain('Roberto');
    expect(html).toContain('Monte Verde');
    expect(html).toContain('Ventas Recientes');
  });

  it('should show empty state for recent conversions when none exist', () => {
    const emptyConversions = { ...sampleAnalytics, recent_conversions: [] };
    const html = renderAnalyticsPage(emptyConversions);

    expect(html).toContain('Sin ventas en este periodo');
  });
});

// ═══════════════════════════════════════════════════════════════
// renderStatusPage
// ═══════════════════════════════════════════════════════════════

describe('renderStatusPage', () => {
  it('should return valid HTML string for healthy status', () => {
    const status = {
      timestamp: todayISO,
      overall_status: 'healthy' as const,
      uptime: 'running',
      version: '2.0.0',
      services: {
        database: { status: 'ok', latency_ms: 50 },
        cache: { status: 'ok', available: true },
        meta_whatsapp: { status: 'configured', configured: true },
        anthropic: { status: 'configured', configured: true },
        google_calendar: { status: 'configured', configured: true },
      },
      metrics: {
        total_leads: 500,
        leads_today: 10,
        leads_this_week: 42,
        active_conversations: 8,
        pending_followups: 3,
        messages_today: 0,
      },
      team: {
        total_members: 20,
        active_members: 18,
        on_duty: 5,
      },
      recent_activity: [
        { type: 'new_lead', description: 'Nuevo lead: Roberto (WhatsApp)', timestamp: todayISO },
      ],
    };

    const html = renderStatusPage(status);

    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('SARA Backend Status');
    expect(html).toContain('OK HEALTHY');
    expect(html).toContain('#22c55e'); // green color for healthy
    expect(html).toContain('500'); // total_leads
  });

  it('should show degraded status correctly', () => {
    const status = {
      timestamp: todayISO,
      overall_status: 'degraded' as const,
      uptime: 'running',
      version: '2.0.0',
      services: {
        database: { status: 'ok', latency_ms: 100 },
        cache: { status: 'error', available: false },
        meta_whatsapp: { status: 'configured', configured: true },
        anthropic: { status: 'configured', configured: true },
        google_calendar: { status: 'not_configured', configured: false },
      },
      metrics: {
        total_leads: 100,
        leads_today: 0,
        leads_this_week: 5,
        active_conversations: 0,
        pending_followups: 0,
        messages_today: 0,
      },
      team: { total_members: 3, active_members: 2, on_duty: 1 },
      recent_activity: [],
    };

    const html = renderStatusPage(status);

    expect(html).toContain('WARN DEGRADED');
    expect(html).toContain('#f59e0b'); // amber color for degraded
  });

  it('should show down status correctly', () => {
    const status = {
      timestamp: todayISO,
      overall_status: 'down' as const,
      uptime: 'running',
      version: '2.0.0',
      services: {
        database: { status: 'error', error: 'DB timeout' },
        cache: { status: 'not_configured', available: false },
        meta_whatsapp: { status: 'not_configured', configured: false },
        anthropic: { status: 'not_configured', configured: false },
        google_calendar: { status: 'not_configured', configured: false },
      },
      metrics: {
        total_leads: 0,
        leads_today: 0,
        leads_this_week: 0,
        active_conversations: 0,
        pending_followups: 0,
        messages_today: 0,
      },
      team: { total_members: 0, active_members: 0, on_duty: 0 },
      recent_activity: [],
    };

    const html = renderStatusPage(status);

    expect(html).toContain('DOWN DOWN');
    expect(html).toContain('#ef4444'); // red color for down
    expect(html).toContain('Sin actividad reciente');
  });

  it('should include team metrics', () => {
    const status = {
      timestamp: todayISO,
      overall_status: 'healthy' as const,
      uptime: 'running',
      version: '2.0.0',
      services: {
        database: { status: 'ok', latency_ms: 30 },
        cache: { status: 'ok', available: true },
        meta_whatsapp: { status: 'configured', configured: true },
        anthropic: { status: 'configured', configured: true },
        google_calendar: { status: 'configured', configured: true },
      },
      metrics: {
        total_leads: 0,
        leads_today: 0,
        leads_this_week: 0,
        active_conversations: 0,
        pending_followups: 0,
        messages_today: 0,
      },
      team: { total_members: 20, active_members: 18, on_duty: 5 },
      recent_activity: [],
    };

    const html = renderStatusPage(status);

    expect(html).toContain('Total Miembros');
    expect(html).toContain('20');
    expect(html).toContain('Activos');
    expect(html).toContain('18');
    expect(html).toContain('De Guardia');
    expect(html).toContain('5');
  });
});

// ═══════════════════════════════════════════════════════════════
// getHealthStatus
// ═══════════════════════════════════════════════════════════════

describe('getHealthStatus', () => {
  it('should return health data with all checks OK', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null, count: 50 },
      scheduled_followups: { data: null, error: null, count: 5 },
      pending_videos: { data: null, error: null, count: 2 },
      appointments: { data: null, error: null, count: 3 },
    });

    const health = await getHealthStatus(mockSupabase as any);

    expect(health).toBeDefined();
    expect(health.status).toBe('healthy');
    expect(health.timestamp).toBeDefined();
    expect(health.checks.supabase.status).toBe('ok');
    expect(health.checks.followups.status).toBe('ok');
    expect(health.checks.videos.status).toBe('ok');
    expect(health.metrics).toBeDefined();
  });

  it('should set status to degraded on supabase error', async () => {
    const mockSupabase = {
      client: {
        from: vi.fn((table: string) => {
          if (table === 'leads') {
            throw new Error('Supabase timeout');
          }
          const chain: any = {
            select: vi.fn().mockReturnValue(chain),
            eq: vi.fn().mockReturnValue(chain),
            gte: vi.fn().mockReturnValue(chain),
            then: (resolve: any) => resolve({ data: null, error: null, count: 0 }),
          };
          return chain;
        }),
      },
    };

    const health = await getHealthStatus(mockSupabase as any);

    expect(health.status).toBe('degraded');
    expect(health.checks.supabase.status).toBe('error');
    expect(health.checks.supabase.error).toContain('Supabase timeout');
  });

  it('should handle followups check error gracefully', async () => {
    let callCount = 0;
    const mockSupabase = {
      client: {
        from: vi.fn((table: string) => {
          const chain: any = {
            select: vi.fn().mockReturnValue(chain),
            eq: vi.fn().mockReturnValue(chain),
            gte: vi.fn().mockReturnValue(chain),
            then: (resolve: any) => resolve({ data: null, error: null, count: 10 }),
          };

          if (table === 'scheduled_followups') {
            chain.select = vi.fn(() => { throw new Error('followups error'); });
          }

          return chain;
        }),
      },
    };

    const health = await getHealthStatus(mockSupabase as any);

    // Should still return data, followups check fails gracefully
    expect(health).toBeDefined();
    expect(health.checks.followups.status).toBe('error');
  });

  it('should include daily metrics', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null, count: 100 },
      scheduled_followups: { data: null, error: null, count: 5 },
      pending_videos: { data: null, error: null, count: 0 },
      appointments: { data: null, error: null, count: 7 },
    });

    const health = await getHealthStatus(mockSupabase as any);

    expect(health.metrics).toBeDefined();
    expect(typeof health.metrics.leads_today).toBe('number');
    expect(typeof health.metrics.appointments_today).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════
// exportBackup
// ═══════════════════════════════════════════════════════════════

describe('exportBackup', () => {
  it('should export backup with all tables', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: [{ id: 'l1', name: 'Roberto' }], error: null },
      appointments: { data: [{ id: 'a1', lead_id: 'l1' }], error: null },
      team_members: { data: sampleTeamMembers, error: null },
      followup_rules: { data: [{ id: 'r1' }], error: null },
      properties: { data: [{ id: 'p1', name: 'Monte Verde' }], error: null },
    });

    const backup = await exportBackup(mockSupabase as any);

    expect(backup).toBeDefined();
    expect(backup.status).toBe('success');
    expect(backup.generated_at).toBeDefined();
    expect(backup.tables.leads.count).toBe(1);
    expect(backup.tables.appointments.count).toBe(1);
    expect(backup.tables.team_members.count).toBe(3);
    expect(backup.tables.followup_rules.count).toBe(1);
    expect(backup.tables.properties.count).toBe(1);
  });

  it('should handle export error', async () => {
    const mockSupabase = {
      client: {
        from: vi.fn(() => {
          throw new Error('Backup query failed');
        }),
      },
    };

    const backup = await exportBackup(mockSupabase as any);

    expect(backup.status).toBe('error');
    expect(backup.error).toContain('Backup query failed');
  });
});

// ═══════════════════════════════════════════════════════════════
// backupSemanalR2
// ═══════════════════════════════════════════════════════════════

describe('backupSemanalR2', () => {
  it('should create backup with conversations and leads', async () => {
    const conversationLeads = [
      { id: 'l1', phone: '5215551234567', name: 'Roberto', conversation_history: [{ role: 'user', content: 'Hola' }], last_message_at: todayISO },
    ];
    const activeLeads = [
      { id: 'l1', phone: '5215551234567', name: 'Roberto', status: 'new' },
      { id: 'l2', phone: '5215559876543', name: 'Maria', status: 'contacted' },
    ];

    const mockSupabase = createMockSupabase({
      leads: { data: conversationLeads, error: null },
      backup_log: { data: [], error: null },
    });

    // Override: second call to 'leads' should return activeLeads
    let leadsCallCount = 0;
    const originalFrom = mockSupabase.client.from;
    mockSupabase.client.from = vi.fn((table: string) => {
      if (table === 'leads') {
        leadsCallCount++;
        const data = leadsCallCount === 1 ? conversationLeads : activeLeads;
        const resp = { data, error: null };
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.gte = vi.fn().mockReturnValue(chain);
        chain.not = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.then = (resolve: any) => resolve(resp);
        return chain;
      }
      return originalFrom(table);
    });

    const r2 = {
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await backupSemanalR2(mockSupabase as any, r2 as any);

    expect(result).toBeDefined();
    expect(result.conversations.rows).toBe(1);
    expect(result.conversations.bytes).toBeGreaterThan(0);
    expect(result.conversations.key).toContain('backups/conversations/');
    expect(result.leads.rows).toBe(2);
    expect(result.leads.bytes).toBeGreaterThan(0);
    expect(result.leads.key).toContain('backups/leads/');
  });

  it('should write to R2 bucket', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: [{ id: 'l1', phone: '521555', name: 'Test', conversation_history: [], last_message_at: todayISO }], error: null },
      backup_log: { data: [], error: null },
    });

    const r2 = {
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await backupSemanalR2(mockSupabase as any, r2 as any);

    expect(r2.put).toHaveBeenCalledTimes(2); // conversations + leads
    expect(r2.put.mock.calls[0][0]).toContain('backups/conversations/');
    expect(r2.put.mock.calls[1][0]).toContain('backups/leads/');
  });

  it('should log in backup_log table', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: [], error: null },
      backup_log: { data: [], error: null },
    });

    const r2 = {
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await backupSemanalR2(mockSupabase as any, r2 as any);

    // Verify insert was called on backup_log
    const fromCalls = mockSupabase.client.from.mock.calls;
    const backupLogCalls = fromCalls.filter((c: any) => c[0] === 'backup_log');
    expect(backupLogCalls.length).toBeGreaterThan(0);
  });

  it('should handle empty data gracefully', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: null, error: null },
      backup_log: { data: [], error: null },
    });

    const r2 = {
      put: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await backupSemanalR2(mockSupabase as any, r2 as any);

    expect(result.conversations.rows).toBe(0);
    expect(result.leads.rows).toBe(0);
    // R2 put still called (empty JSONL files)
    expect(r2.put).toHaveBeenCalledTimes(2);
  });

  it('should handle R2 errors gracefully', async () => {
    const mockSupabase = createMockSupabase({
      leads: { data: [], error: null },
      backup_log: { data: [], error: null },
    });

    const r2 = {
      put: vi.fn().mockRejectedValue(new Error('R2 write failed')),
      list: vi.fn().mockResolvedValue({ objects: [] }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    // Should throw because R2 put is awaited directly
    await expect(backupSemanalR2(mockSupabase as any, r2 as any)).rejects.toThrow('R2 write failed');
  });
});

// ═══════════════════════════════════════════════════════════════
// getBackupLog
// ═══════════════════════════════════════════════════════════════

describe('getBackupLog', () => {
  it('should return backup entries', async () => {
    const backupEntries = [
      { id: '1', fecha: '2026-02-28', tipo: 'conversations', file_key: 'backups/conversations/2026-02-28.jsonl', row_count: 10, size_bytes: 5000, created_at: todayISO },
      { id: '2', fecha: '2026-02-28', tipo: 'leads', file_key: 'backups/leads/2026-02-28.jsonl', row_count: 20, size_bytes: 12000, created_at: todayISO },
    ];

    const mockSupabase = createMockSupabase({
      backup_log: { data: backupEntries, error: null },
    });

    const log = await getBackupLog(mockSupabase as any);

    expect(log).toEqual(backupEntries);
    expect(log.length).toBe(2);
  });

  it('should handle empty log', async () => {
    const mockSupabase = createMockSupabase({
      backup_log: { data: [], error: null },
    });

    const log = await getBackupLog(mockSupabase as any);

    expect(log).toEqual([]);
  });

  it('should handle null data', async () => {
    const mockSupabase = createMockSupabase({
      backup_log: { data: null, error: null },
    });

    const log = await getBackupLog(mockSupabase as any);

    expect(log).toEqual([]);
  });

  it('should handle errors gracefully and return empty array', async () => {
    const mockSupabase = {
      client: {
        from: vi.fn(() => {
          throw new Error('backup_log read error');
        }),
      },
    };

    const log = await getBackupLog(mockSupabase as any);

    expect(log).toEqual([]);
  });
});
