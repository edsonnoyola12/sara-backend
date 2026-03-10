import { describe, it, expect, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Report Builder Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  buildReport,
  saveReport,
  getReport,
  listReports,
  updateReport,
  deleteReport,
  saveSnapshot,
  getSnapshots,
  exportReportToCSV,
} from '../services/reportBuilderService';
import type { ReportConfig, ReportResult } from '../services/reportBuilderService';

// ═══════════════════════════════════════════════════════════════════════════
// Forecasting Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  getLeadPropertyValue,
  getConversionRates,
  generateForecast,
} from '../services/forecastingService';

// ═══════════════════════════════════════════════════════════════════════════
// Agent Scorecard Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  calculateCompositeScore,
  generateAgentScorecard,
  generateTeamScorecard,
} from '../services/agentScorecardService';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockSupabase(mockData: any = [], mockError: any = null, mockCount: number | null = null) {
  const chainable: any = {};
  const methods = [
    'from', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'in', 'is', 'lt', 'ilike', 'gte', 'lte', 'or',
    'order', 'range', 'limit', 'single', 'maybeSingle', 'select',
  ];
  for (const m of methods) {
    chainable[m] = (..._args: any[]) => chainable;
  }
  chainable.then = undefined;

  chainable.single = () => {
    return Promise.resolve({
      data: Array.isArray(mockData) ? mockData[0] ?? null : mockData,
      error: mockError,
    });
  };

  Object.defineProperty(chainable, 'then', {
    get() {
      return (resolve: any) =>
        resolve({
          data: mockData,
          error: mockError,
          count: mockCount ?? (Array.isArray(mockData) ? mockData.length : 0),
        });
    },
    configurable: true,
  });

  return {
    client: {
      from: () => chainable,
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
    getTenantId: () => '00000000-0000-0000-0000-000000000001',
  } as any;
}

function createErrorSupabase(message = 'db_error') {
  return createMockSupabase(null, { message, code: 'ERROR' });
}

/**
 * Multi-table mock: tracks which table is being queried and returns
 * different data per table. Used by generateForecast, generateAgentScorecard, etc.
 */
function createMultiTableMock(tables: Record<string, { data: any[]; error?: any }>) {
  const chainable = (tableName: string) => {
    const mock: any = {};
    const tableData = tables[tableName] || { data: [] };
    const methods = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'in', 'is', 'ilike', 'gte', 'lte', 'or',
      'order', 'range', 'limit', 'single',
    ];
    for (const m of methods) {
      mock[m] = () => mock;
    }
    mock.then = undefined;
    Object.defineProperty(mock, 'then', {
      get() {
        return (resolve: any) =>
          resolve({
            data: tableData.data,
            error: tableData.error || null,
            count: tableData.data.length,
          });
      },
      configurable: true,
    });
    mock.single = () =>
      Promise.resolve({
        data: tableData.data[0] || null,
        error: tableData.error || null,
      });
    return mock;
  };
  return {
    client: {
      from: (table: string) => chainable(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
    getTenantId: () => '00000000-0000-0000-0000-000000000001',
  } as any;
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// 1. REPORT BUILDER SERVICE (~30 tests)
// ───────────────────────────────────────────────────────────────────────────

describe('Report Builder Service', () => {
  // ── buildReport ──────────────────────────────────────────────────────

  describe('buildReport', () => {
    it('should return basic count metric', async () => {
      const rows = [
        { id: '1', score: 80, budget_min: 1000, budget_max: 2000 },
        { id: '2', score: 90, budget_min: 1500, budget_max: 2500 },
        { id: '3', score: 70, budget_min: 800, budget_max: 1200 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = { entity: 'leads', metrics: ['count'] };
      const result = await buildReport(sb, config);
      expect(result.totals.count).toBe(3);
      expect(result.row_count).toBe(1);
      expect(result.rows[0].count).toBe(3);
    });

    it('should apply eq filters', async () => {
      const rows = [{ id: '1', status: 'new', score: 50, budget_min: 1000, budget_max: 2000 }];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = {
        entity: 'leads',
        metrics: ['count'],
        filters: { status: 'new' },
      };
      const result = await buildReport(sb, config);
      expect(result.totals.count).toBe(1);
    });

    it('should group by dimensions', async () => {
      const rows = [
        { id: '1', status: 'new', score: 80, budget_min: 1000, budget_max: 2000 },
        { id: '2', status: 'new', score: 60, budget_min: 1500, budget_max: 2500 },
        { id: '3', status: 'contacted', score: 90, budget_min: 800, budget_max: 1200 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = {
        entity: 'leads',
        metrics: ['count'],
        dimensions: ['status'],
      };
      const result = await buildReport(sb, config);
      expect(result.row_count).toBe(2);
      const newGroup = result.rows.find(r => r.status === 'new');
      expect(newGroup?.count).toBe(2);
      const contactedGroup = result.rows.find(r => r.status === 'contacted');
      expect(contactedGroup?.count).toBe(1);
    });

    it('should filter by date_range', async () => {
      const rows = [{ id: '1', score: 50, budget_min: 1000, budget_max: 2000 }];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = {
        entity: 'leads',
        metrics: ['count'],
        date_range: { from: '2026-01-01', to: '2026-01-31' },
      };
      const result = await buildReport(sb, config);
      expect(result.totals.count).toBe(1);
      expect(result.generated_at).toBeDefined();
    });

    it('should sort results', async () => {
      const rows = [
        { id: '1', status: 'a', score: 30, budget_min: 100, budget_max: 200 },
        { id: '2', status: 'b', score: 90, budget_min: 500, budget_max: 600 },
        { id: '3', status: 'c', score: 60, budget_min: 300, budget_max: 400 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = {
        entity: 'leads',
        metrics: ['count', 'sum'],
        dimensions: ['status'],
        sort: { field: 'sum_score', direction: 'desc' },
      };
      const result = await buildReport(sb, config);
      expect(result.rows[0].sum_score).toBe(90);
      expect(result.rows[2].sum_score).toBe(30);
    });

    it('should apply limit', async () => {
      const rows = [
        { id: '1', status: 'a', score: 10, budget_min: 100, budget_max: 200 },
        { id: '2', status: 'b', score: 20, budget_min: 300, budget_max: 400 },
        { id: '3', status: 'c', score: 30, budget_min: 500, budget_max: 600 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = {
        entity: 'leads',
        metrics: ['count'],
        dimensions: ['status'],
        limit: 2,
      };
      const result = await buildReport(sb, config);
      expect(result.row_count).toBe(2);
      expect(result.rows.length).toBe(2);
    });

    it('should handle empty data', async () => {
      const sb = createMockSupabase([]);
      const config: ReportConfig = { entity: 'leads', metrics: ['count'] };
      const result = await buildReport(sb, config);
      expect(result.totals.count).toBe(0);
      expect(result.rows[0].count).toBe(0);
    });

    it('should handle query error', async () => {
      const sb = createErrorSupabase('query_failed');
      const config: ReportConfig = { entity: 'leads', metrics: ['count'] };
      const result = await buildReport(sb, config);
      expect(result.rows).toEqual([]);
      expect(result.row_count).toBe(0);
    });

    it('should compute multiple metrics (count + sum)', async () => {
      const rows = [
        { id: '1', score: 80, budget_min: 1000, budget_max: 2000 },
        { id: '2', score: 20, budget_min: 500, budget_max: 1500 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = { entity: 'leads', metrics: ['count', 'sum'] };
      const result = await buildReport(sb, config);
      expect(result.totals.count).toBe(2);
      expect(result.totals.sum_score).toBe(100);
      expect(result.totals.sum_budget_min).toBe(1500);
      expect(result.totals.sum_budget_max).toBe(3500);
    });

    it('should compute avg metric', async () => {
      const rows = [
        { id: '1', score: 80, budget_min: 1000, budget_max: 2000 },
        { id: '2', score: 60, budget_min: 2000, budget_max: 4000 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = { entity: 'leads', metrics: ['avg'] };
      const result = await buildReport(sb, config);
      expect(result.totals.avg_score).toBe(70);
      expect(result.totals.avg_budget_min).toBe(1500);
    });

    it('should compute min metric', async () => {
      const rows = [
        { id: '1', score: 80, budget_min: 1000, budget_max: 2000 },
        { id: '2', score: 30, budget_min: 500, budget_max: 1500 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = { entity: 'leads', metrics: ['min'] };
      const result = await buildReport(sb, config);
      expect(result.totals.min_score).toBe(30);
      expect(result.totals.min_budget_min).toBe(500);
    });

    it('should compute max metric', async () => {
      const rows = [
        { id: '1', score: 80, budget_min: 1000, budget_max: 2000 },
        { id: '2', score: 30, budget_min: 500, budget_max: 1500 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = { entity: 'leads', metrics: ['max'] };
      const result = await buildReport(sb, config);
      expect(result.totals.max_score).toBe(80);
      expect(result.totals.max_budget_max).toBe(2000);
    });

    it('should handle array filter values with in()', async () => {
      const rows = [
        { id: '1', status: 'new', score: 10, budget_min: 100, budget_max: 200 },
        { id: '2', status: 'contacted', score: 20, budget_min: 300, budget_max: 400 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = {
        entity: 'leads',
        metrics: ['count'],
        filters: { status: ['new', 'contacted'] },
      };
      const result = await buildReport(sb, config);
      expect(result.totals.count).toBe(2);
    });

    it('should handle null filter values with is()', async () => {
      const rows = [{ id: '1', assigned_to: null, score: 10, budget_min: 100, budget_max: 200 }];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = {
        entity: 'leads',
        metrics: ['count'],
        filters: { assigned_to: null },
      };
      const result = await buildReport(sb, config);
      expect(result.totals.count).toBe(1);
    });

    it('should use correct numeric fields for appointments entity', async () => {
      const rows = [
        { id: '1', duration_minutes: 30 },
        { id: '2', duration_minutes: 60 },
      ];
      const sb = createMockSupabase(rows);
      const config: ReportConfig = { entity: 'appointments', metrics: ['sum'] };
      const result = await buildReport(sb, config);
      expect(result.totals.sum_duration_minutes).toBe(90);
    });
  });

  // ── saveReport ───────────────────────────────────────────────────────

  describe('saveReport', () => {
    it('should save a report with all fields', async () => {
      const saved = {
        id: 'r1', tenant_id: 't1', name: 'My Report', description: 'desc',
        report_type: 'custom', config: { entity: 'leads', metrics: ['count'] },
        schedule: null, is_default: false, created_by: 'user1',
        created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      const sb = createMockSupabase(saved);
      const result = await saveReport(sb, {
        name: 'My Report', description: 'desc',
        config: { entity: 'leads', metrics: ['count'] },
        created_by: 'user1',
      });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('My Report');
      expect(result!.id).toBe('r1');
    });

    it('should return null on error', async () => {
      const sb = createErrorSupabase('insert_failed');
      const result = await saveReport(sb, {
        name: 'Fail',
        config: { entity: 'leads', metrics: ['count'] },
      });
      expect(result).toBeNull();
    });
  });

  // ── getReport ────────────────────────────────────────────────────────

  describe('getReport', () => {
    it('should return report by id', async () => {
      const report = { id: 'r1', name: 'My Report', tenant_id: 't1' };
      const sb = createMockSupabase(report);
      const result = await getReport(sb, 'r1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('r1');
    });

    it('should return null when not found', async () => {
      const sb = createMockSupabase(null, { message: 'not found' });
      const result = await getReport(sb, 'missing');
      expect(result).toBeNull();
    });
  });

  // ── listReports ──────────────────────────────────────────────────────

  describe('listReports', () => {
    it('should return all reports', async () => {
      const reports = [
        { id: 'r1', name: 'Report 1' },
        { id: 'r2', name: 'Report 2' },
      ];
      const sb = createMockSupabase(reports);
      const result = await listReports(sb);
      expect(result.length).toBe(2);
    });

    it('should filter by report_type', async () => {
      const reports = [{ id: 'r1', name: 'Sales', report_type: 'sales' }];
      const sb = createMockSupabase(reports);
      const result = await listReports(sb, { report_type: 'sales' });
      expect(result.length).toBe(1);
      expect(result[0].report_type).toBe('sales');
    });

    it('should return empty array on error', async () => {
      const sb = createErrorSupabase('list_failed');
      const result = await listReports(sb);
      expect(result).toEqual([]);
    });
  });

  // ── updateReport ─────────────────────────────────────────────────────

  describe('updateReport', () => {
    it('should update report fields', async () => {
      const updated = { id: 'r1', name: 'Updated Name', updated_at: '2026-02-01' };
      const sb = createMockSupabase(updated);
      const result = await updateReport(sb, 'r1', { name: 'Updated Name' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Name');
    });

    it('should return null on error', async () => {
      const sb = createErrorSupabase('update_failed');
      const result = await updateReport(sb, 'r1', { name: 'Fail' });
      expect(result).toBeNull();
    });
  });

  // ── deleteReport ─────────────────────────────────────────────────────

  describe('deleteReport', () => {
    it('should return true on success', async () => {
      const sb = createMockSupabase([]);
      const result = await deleteReport(sb, 'r1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      const sb = createErrorSupabase('delete_failed');
      const result = await deleteReport(sb, 'r1');
      expect(result).toBe(false);
    });
  });

  // ── saveSnapshot ─────────────────────────────────────────────────────

  describe('saveSnapshot', () => {
    it('should save snapshot with data', async () => {
      const reportResult: ReportResult = {
        rows: [{ count: 5 }],
        totals: { count: 5 },
        row_count: 1,
        generated_at: '2026-01-01T00:00:00Z',
      };
      const snapshot = { id: 's1', report_id: 'r1', data: reportResult, row_count: 1, generated_at: '2026-01-01T00:00:00Z' };
      const sb = createMockSupabase(snapshot);
      const result = await saveSnapshot(sb, 'r1', reportResult);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('s1');
      expect(result!.report_id).toBe('r1');
    });

    it('should return null on error', async () => {
      const sb = createErrorSupabase('snapshot_failed');
      const reportResult: ReportResult = {
        rows: [], totals: {}, row_count: 0, generated_at: '2026-01-01T00:00:00Z',
      };
      const result = await saveSnapshot(sb, 'r1', reportResult);
      expect(result).toBeNull();
    });
  });

  // ── getSnapshots ─────────────────────────────────────────────────────

  describe('getSnapshots', () => {
    it('should return recent snapshots', async () => {
      const snapshots = [
        { id: 's1', report_id: 'r1', generated_at: '2026-01-02' },
        { id: 's2', report_id: 'r1', generated_at: '2026-01-01' },
      ];
      const sb = createMockSupabase(snapshots);
      const result = await getSnapshots(sb, 'r1');
      expect(result.length).toBe(2);
    });

    it('should accept custom limit', async () => {
      const snapshots = [{ id: 's1', report_id: 'r1', generated_at: '2026-01-01' }];
      const sb = createMockSupabase(snapshots);
      const result = await getSnapshots(sb, 'r1', 5);
      expect(result.length).toBe(1);
    });

    it('should return empty array on error', async () => {
      const sb = createErrorSupabase('snapshot_error');
      const result = await getSnapshots(sb, 'r1');
      expect(result).toEqual([]);
    });
  });

  // ── exportReportToCSV ────────────────────────────────────────────────

  describe('exportReportToCSV', () => {
    it('should produce CSV output', () => {
      const result: ReportResult = {
        rows: [
          { status: 'new', count: 5 },
          { status: 'contacted', count: 3 },
        ],
        totals: { count: 8 },
        row_count: 2,
        generated_at: '2026-01-01T00:00:00Z',
      };
      const csv = exportReportToCSV(result);
      const lines = csv.split('\n');
      expect(lines[0]).toBe('status,count');
      expect(lines[1]).toBe('new,5');
      expect(lines[2]).toBe('contacted,3');
    });

    it('should return empty string for empty rows', () => {
      const result: ReportResult = {
        rows: [],
        totals: {},
        row_count: 0,
        generated_at: '2026-01-01T00:00:00Z',
      };
      const csv = exportReportToCSV(result);
      expect(csv).toBe('');
    });

    it('should escape commas and quotes in values', () => {
      const result: ReportResult = {
        rows: [
          { name: 'Hello, World', note: 'He said "hi"' },
        ],
        totals: {},
        row_count: 1,
        generated_at: '2026-01-01T00:00:00Z',
      };
      const csv = exportReportToCSV(result);
      const lines = csv.split('\n');
      expect(lines[1]).toContain('"Hello, World"');
      expect(lines[1]).toContain('"He said ""hi"""');
    });

    it('should handle null and undefined values', () => {
      const result: ReportResult = {
        rows: [{ a: null, b: undefined, c: 'ok' }],
        totals: {},
        row_count: 1,
        generated_at: '2026-01-01T00:00:00Z',
      };
      const csv = exportReportToCSV(result);
      const lines = csv.split('\n');
      expect(lines[1]).toBe(',,ok');
    });
  });
});


// ───────────────────────────────────────────────────────────────────────────
// 2. FORECASTING SERVICE (~20 tests)
// ───────────────────────────────────────────────────────────────────────────

describe('Forecasting Service', () => {
  // ── getLeadPropertyValue ─────────────────────────────────────────────

  describe('getLeadPropertyValue', () => {
    const properties = [
      { id: 'p1', name: 'Monte Verde', price_min: 1_000_000, price_max: 2_000_000 },
      { id: 'p2', name: 'Los Encinos', price_min: 3_000_000, price_max: 5_000_000 },
    ];

    it('should match property by property_interest', () => {
      const lead = { property_interest: 'Monte Verde' };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(1_500_000); // midpoint of 1M and 2M
    });

    it('should return 0 when no property_interest', () => {
      const lead = { property_interest: '' };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(0);
    });

    it('should return 0 when no match found and no budget', () => {
      const lead = { property_interest: 'Nonexistent' };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(0);
    });

    it('should use midpoint of price_min and price_max', () => {
      const lead = { property_interest: 'Los Encinos' };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(4_000_000); // (3M + 5M) / 2
    });

    it('should handle null property_interest', () => {
      const lead = { property_interest: null };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(0);
    });

    it('should handle property with only price_min', () => {
      const props = [{ id: 'p1', name: 'Test', price_min: 2_000_000, price_max: null }];
      const lead = { property_interest: 'Test' };
      const value = getLeadPropertyValue(lead, props);
      // min=2M, max falls back to price_min=2M => (2M+2M)/2 = 2M
      expect(value).toBe(2_000_000);
    });

    it('should handle property with only price_max', () => {
      const props = [{ id: 'p1', name: 'Test', price_min: null, price_max: 3_000_000 }];
      const lead = { property_interest: 'Test' };
      const value = getLeadPropertyValue(lead, props);
      // min falls back to price_max=3M, max=3M => (3M+3M)/2 = 3M
      expect(value).toBe(3_000_000);
    });

    it('should fallback to lead budget when no matching property', () => {
      const lead = { property_interest: 'Unknown Dev', budget: 500_000 };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(500_000);
    });

    it('should match case-insensitively', () => {
      const lead = { property_interest: 'monte verde' };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(1_500_000);
    });

    it('should match partial name inclusion', () => {
      const lead = { property_interest: 'Monte' };
      const value = getLeadPropertyValue(lead, properties);
      expect(value).toBe(1_500_000);
    });
  });

  // ── getConversionRates ───────────────────────────────────────────────

  describe('getConversionRates', () => {
    it('should calculate conversion rates from lead data', async () => {
      const leads = [
        { status: 'new' },
        { status: 'contacted' },
        { status: 'qualified' },
        { status: 'visited' },
        { status: 'closed' },
      ];
      const sb = createMockSupabase(leads);
      const rates = await getConversionRates(sb);
      // closed: 1 lead at closed. cumulative from the bottom up.
      expect(rates.closed).toBeDefined();
      expect(typeof rates.closed).toBe('number');
    });

    it('should handle empty data (no leads)', async () => {
      const sb = createMockSupabase([]);
      const rates = await getConversionRates(sb);
      // total is 0, division by 1 (||1 guard), so all rates = 0
      expect(rates.closed).toBe(0);
      expect(rates.contacted).toBe(0);
    });
  });

  // ── generateForecast ────────────────────────────────────────────────

  describe('generateForecast', () => {
    it('should generate forecast with mock leads and properties', async () => {
      const sb = createMultiTableMock({
        leads: {
          data: [
            { id: 'l1', name: 'Lead 1', status: 'qualified', property_interest: 'Monte Verde', budget: 1_000_000, created_at: '2026-01-01' },
            { id: 'l2', name: 'Lead 2', status: 'negotiation', property_interest: 'Los Encinos', budget: 3_000_000, created_at: '2026-01-15' },
            { id: 'l3', name: 'Lead 3', status: 'new', property_interest: 'Monte Verde', budget: 1_000_000, created_at: '2026-02-01' },
          ],
        },
        properties: {
          data: [
            { id: 'p1', name: 'Monte Verde', price_min: 1_000_000, price_max: 2_000_000 },
            { id: 'p2', name: 'Los Encinos', price_min: 3_000_000, price_max: 5_000_000 },
          ],
        },
      });
      const result = await generateForecast(sb);
      expect(result.total_pipeline_value).toBeGreaterThan(0);
      expect(result.weighted_forecast).toBeGreaterThan(0);
      expect(result.by_status.length).toBeGreaterThan(0);
      expect(result.by_development.length).toBeGreaterThan(0);
      expect(result.monthly_projection.length).toBe(3);
      expect(result.generated_at).toBeDefined();
    });

    it('should handle empty pipeline', async () => {
      const sb = createMultiTableMock({
        leads: { data: [] },
        properties: { data: [] },
      });
      const result = await generateForecast(sb);
      expect(result.total_pipeline_value).toBe(0);
      expect(result.weighted_forecast).toBe(0);
      expect(result.by_status).toEqual([]);
      expect(result.by_development).toEqual([]);
    });

    it('should assign low confidence for <10 leads', async () => {
      const leads = Array.from({ length: 5 }, (_, i) => ({
        id: `l${i}`, name: `Lead ${i}`, status: 'new',
        property_interest: '', budget: 100_000, created_at: '2026-01-01',
      }));
      const sb = createMultiTableMock({
        leads: { data: leads },
        properties: { data: [] },
      });
      const result = await generateForecast(sb);
      expect(result.confidence).toBe('low');
    });

    it('should assign medium confidence for 10-19 leads', async () => {
      const leads = Array.from({ length: 15 }, (_, i) => ({
        id: `l${i}`, name: `Lead ${i}`, status: 'contacted',
        property_interest: '', budget: 200_000, created_at: '2026-01-01',
      }));
      const sb = createMultiTableMock({
        leads: { data: leads },
        properties: { data: [] },
      });
      const result = await generateForecast(sb);
      expect(result.confidence).toBe('medium');
    });

    it('should assign high confidence for >=20 leads', async () => {
      const leads = Array.from({ length: 25 }, (_, i) => ({
        id: `l${i}`, name: `Lead ${i}`, status: 'qualified',
        property_interest: '', budget: 300_000, created_at: '2026-01-01',
      }));
      const sb = createMultiTableMock({
        leads: { data: leads },
        properties: { data: [] },
      });
      const result = await generateForecast(sb);
      expect(result.confidence).toBe('high');
    });

    it('should calculate weighted values correctly', async () => {
      // A single lead in negotiation (weight=0.70) with value 2M
      const sb = createMultiTableMock({
        leads: {
          data: [
            { id: 'l1', name: 'Lead 1', status: 'negotiation', property_interest: 'Test', budget: 0, created_at: '2026-01-01' },
          ],
        },
        properties: {
          data: [
            { id: 'p1', name: 'Test', price_min: 2_000_000, price_max: 2_000_000 },
          ],
        },
      });
      const result = await generateForecast(sb);
      expect(result.total_pipeline_value).toBe(2_000_000);
      // weighted = 2M * 0.70 = 1.4M, rounded
      expect(result.weighted_forecast).toBe(1_400_000);
    });

    it('should produce 3 monthly projections', async () => {
      const leads = [
        { id: 'l1', name: 'Lead 1', status: 'qualified', property_interest: '', budget: 1_000_000, created_at: '2026-01-01' },
      ];
      const sb = createMultiTableMock({
        leads: { data: leads },
        properties: { data: [] },
      });
      const result = await generateForecast(sb);
      expect(result.monthly_projection.length).toBe(3);
      for (const mp of result.monthly_projection) {
        expect(mp.month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof mp.projected_revenue).toBe('number');
        expect(typeof mp.projected_deals).toBe('number');
      }
    });

    it('should breakdown by_status', async () => {
      const sb = createMultiTableMock({
        leads: {
          data: [
            { id: 'l1', name: 'A', status: 'new', property_interest: '', budget: 100_000, created_at: '2026-01-01' },
            { id: 'l2', name: 'B', status: 'new', property_interest: '', budget: 200_000, created_at: '2026-01-01' },
            { id: 'l3', name: 'C', status: 'reserved', property_interest: '', budget: 500_000, created_at: '2026-01-01' },
          ],
        },
        properties: { data: [] },
      });
      const result = await generateForecast(sb);
      const newStatus = result.by_status.find(s => s.status === 'new');
      expect(newStatus).toBeDefined();
      expect(newStatus!.count).toBe(2);
      const reservedStatus = result.by_status.find(s => s.status === 'reserved');
      expect(reservedStatus).toBeDefined();
      expect(reservedStatus!.count).toBe(1);
    });

    it('should breakdown by_development', async () => {
      const sb = createMultiTableMock({
        leads: {
          data: [
            { id: 'l1', name: 'A', status: 'new', property_interest: 'Monte Verde', budget: 100_000, created_at: '2026-01-01' },
            { id: 'l2', name: 'B', status: 'qualified', property_interest: 'Monte Verde', budget: 200_000, created_at: '2026-01-01' },
            { id: 'l3', name: 'C', status: 'reserved', property_interest: 'Los Encinos', budget: 500_000, created_at: '2026-01-01' },
          ],
        },
        properties: { data: [] },
      });
      const result = await generateForecast(sb);
      expect(result.by_development.length).toBe(2);
      const mv = result.by_development.find(d => d.development === 'Monte Verde');
      expect(mv).toBeDefined();
      expect(mv!.count).toBe(2);
    });
  });
});


// ───────────────────────────────────────────────────────────────────────────
// 3. AGENT SCORECARD SERVICE (~20 tests)
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Scorecard Service', () => {
  // ── calculateCompositeScore ──────────────────────────────────────────

  describe('calculateCompositeScore', () => {
    it('should return perfect score (100) with ideal metrics', () => {
      const sc = {
        leads_assigned: 10,
        leads_contacted: 10,         // 100% contact rate → 20pts
        appointments_completed: 10,  // >=10 → 20pts
        conversion_rate: 20,         // >=20% → 30pts
        tasks_completed: 10,
        tasks_pending: 0,            // 100% completion → 15pts
        avg_response_time_hours: 0,  // 0h → 15pts
      };
      const score = calculateCompositeScore(sc);
      expect(score).toBe(100);
    });

    it('should return zero score with no activity', () => {
      const sc = {
        leads_assigned: 0,
        leads_contacted: 0,
        appointments_completed: 0,
        conversion_rate: 0,
        tasks_completed: 0,
        tasks_pending: 0,
        avg_response_time_hours: 24,
      };
      const score = calculateCompositeScore(sc);
      expect(score).toBe(0);
    });

    it('should handle partial scores', () => {
      const sc = {
        leads_assigned: 10,
        leads_contacted: 5,          // 50% → 10pts
        appointments_completed: 5,   // 50% of 10 → 10pts
        conversion_rate: 10,         // 50% of 20 → 15pts
        tasks_completed: 5,
        tasks_pending: 5,            // 50% → 7.5pts
        avg_response_time_hours: 12, // 50% of 24h → 7.5pts
      };
      const score = calculateCompositeScore(sc);
      expect(score).toBe(50); // 10+10+15+7.5+7.5 = 50
    });

    it('should reward high conversion rate', () => {
      const highConv = calculateCompositeScore({ conversion_rate: 25 });
      const lowConv = calculateCompositeScore({ conversion_rate: 5 });
      expect(highConv).toBeGreaterThan(lowConv);
    });

    it('should reward fast response time', () => {
      const fast = calculateCompositeScore({ avg_response_time_hours: 1 });
      const slow = calculateCompositeScore({ avg_response_time_hours: 20 });
      expect(fast).toBeGreaterThan(slow);
    });

    it('should produce balanced metrics contribution', () => {
      // Only conversion rate maxed
      const convOnly = calculateCompositeScore({
        conversion_rate: 25,
        leads_assigned: 0,
        appointments_completed: 0,
        tasks_completed: 0,
        tasks_pending: 0,
        avg_response_time_hours: 24,
      });
      // Max is 30pts for conversion alone
      expect(convOnly).toBe(30);
    });

    it('should cap score at 100', () => {
      const sc = {
        leads_assigned: 1,
        leads_contacted: 100,        // way over cap
        appointments_completed: 100,
        conversion_rate: 100,
        tasks_completed: 100,
        tasks_pending: 0,
        avg_response_time_hours: 0,
      };
      const score = calculateCompositeScore(sc);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle undefined optional fields', () => {
      const score = calculateCompositeScore({});
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // ── generateAgentScorecard ───────────────────────────────────────────

  describe('generateAgentScorecard', () => {
    it('should generate scorecard with mock data', async () => {
      const sb = createMultiTableMock({
        team_members: {
          data: [{ id: 'agent1', name: 'Juan Vendedor' }],
        },
        leads: {
          data: [
            { id: 'l1', status: 'contacted', created_at: '2026-01-05', last_sara_interaction: '2026-01-05T02:00:00Z', budget: 1_000_000 },
            { id: 'l2', status: 'closed', created_at: '2026-01-10', last_sara_interaction: '2026-01-10T01:00:00Z', budget: 2_000_000 },
          ],
        },
        appointments: {
          data: [
            { id: 'a1', status: 'completed' },
            { id: 'a2', status: 'scheduled' },
          ],
        },
        tasks: {
          data: [
            { id: 't1', status: 'completed' },
            { id: 't2', status: 'pending' },
            { id: 't3', status: 'completed' },
          ],
        },
      });
      const result = await generateAgentScorecard(sb, 'agent1', '2026-01');
      expect(result).not.toBeNull();
      expect(result!.agent_id).toBe('agent1');
      expect(result!.agent_name).toBe('Juan Vendedor');
      expect(result!.leads_assigned).toBe(2);
      expect(result!.leads_contacted).toBe(2); // both contacted and closed are in CONTACTED
      expect(result!.deals_closed).toBe(1);
      expect(result!.revenue).toBe(2_000_000);
      expect(result!.appointments_scheduled).toBe(2);
      expect(result!.appointments_completed).toBe(1);
      expect(result!.tasks_completed).toBe(2);
      expect(result!.tasks_pending).toBe(1);
      expect(result!.score).toBeGreaterThan(0);
    });

    it('should return null when agent not found', async () => {
      const sb = createMultiTableMock({
        team_members: { data: [] },
        leads: { data: [] },
        appointments: { data: [] },
        tasks: { data: [] },
      });
      const result = await generateAgentScorecard(sb, 'nonexistent', '2026-01');
      expect(result).toBeNull();
    });

    it('should handle agent with zero leads', async () => {
      const sb = createMultiTableMock({
        team_members: {
          data: [{ id: 'agent1', name: 'Empty Agent' }],
        },
        leads: { data: [] },
        appointments: { data: [] },
        tasks: { data: [] },
      });
      const result = await generateAgentScorecard(sb, 'agent1', '2026-01');
      expect(result).not.toBeNull();
      expect(result!.leads_assigned).toBe(0);
      expect(result!.deals_closed).toBe(0);
      expect(result!.revenue).toBe(0);
      expect(result!.conversion_rate).toBe(0);
    });

    it('should use current period if not specified', async () => {
      const sb = createMultiTableMock({
        team_members: {
          data: [{ id: 'agent1', name: 'Agent' }],
        },
        leads: { data: [] },
        appointments: { data: [] },
        tasks: { data: [] },
      });
      const result = await generateAgentScorecard(sb, 'agent1');
      expect(result).not.toBeNull();
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(result!.period).toBe(expected);
    });
  });

  // ── generateTeamScorecard ────────────────────────────────────────────

  describe('generateTeamScorecard', () => {
    it('should generate team scorecard with multiple agents', async () => {
      // We need a mock that can handle multiple sequential calls to different tables
      // generateTeamScorecard calls: team_members (list), then for each agent:
      //   team_members (single), leads, appointments, tasks
      const sb = createMultiTableMock({
        team_members: {
          data: [
            { id: 'v1', name: 'Vendedor 1', role: 'vendedor', active: true },
            { id: 'v2', name: 'Vendedor 2', role: 'vendedor', active: true },
          ],
        },
        leads: {
          data: [
            { id: 'l1', status: 'closed', created_at: '2026-01-05', last_sara_interaction: '2026-01-05T01:00:00Z', budget: 1_500_000 },
          ],
        },
        appointments: {
          data: [{ id: 'a1', status: 'completed' }],
        },
        tasks: {
          data: [{ id: 't1', status: 'completed' }],
        },
      });
      const result = await generateTeamScorecard(sb, '2026-01');
      expect(result.period).toBe('2026-01');
      expect(result.agents.length).toBe(2);
      expect(result.team_totals).toBeDefined();
      expect(result.top_performer).toBeDefined();
    });

    it('should identify top performer', async () => {
      // Both agents get same mock data, so both get same score
      const sb = createMultiTableMock({
        team_members: {
          data: [
            { id: 'v1', name: 'Agent A', role: 'vendedor', active: true },
            { id: 'v2', name: 'Agent B', role: 'vendedor', active: true },
          ],
        },
        leads: {
          data: [
            { id: 'l1', status: 'closed', created_at: '2026-01-05', last_sara_interaction: '2026-01-05T01:00:00Z', budget: 2_000_000 },
          ],
        },
        appointments: {
          data: [{ id: 'a1', status: 'completed' }],
        },
        tasks: {
          data: [{ id: 't1', status: 'completed' }],
        },
      });
      const result = await generateTeamScorecard(sb, '2026-01');
      expect(result.top_performer.agent_id).toBeDefined();
      expect(result.top_performer.score).toBeGreaterThan(0);
    });

    it('should aggregate team totals', async () => {
      const sb = createMultiTableMock({
        team_members: {
          data: [
            { id: 'v1', name: 'Agent A', role: 'vendedor', active: true },
          ],
        },
        leads: {
          data: [
            { id: 'l1', status: 'closed', created_at: '2026-01-05', last_sara_interaction: '2026-01-05T01:00:00Z', budget: 1_000_000 },
            { id: 'l2', status: 'contacted', created_at: '2026-01-10', last_sara_interaction: '2026-01-10T00:30:00Z', budget: 500_000 },
          ],
        },
        appointments: {
          data: [{ id: 'a1', status: 'completed' }],
        },
        tasks: {
          data: [
            { id: 't1', status: 'completed' },
            { id: 't2', status: 'pending' },
          ],
        },
      });
      const result = await generateTeamScorecard(sb, '2026-01');
      expect(result.team_totals.leads_assigned).toBeGreaterThanOrEqual(1);
      expect(result.team_totals.revenue).toBeGreaterThanOrEqual(0);
      expect(typeof result.team_totals.conversion_rate).toBe('number');
    });

    it('should handle empty team (no vendedores)', async () => {
      const sb = createMultiTableMock({
        team_members: { data: [] },
        leads: { data: [] },
        appointments: { data: [] },
        tasks: { data: [] },
      });
      const result = await generateTeamScorecard(sb, '2026-01');
      expect(result.agents).toEqual([]);
      expect(result.top_performer.agent_name).toBe('N/A');
      expect(result.top_performer.score).toBe(0);
    });
  });
});
