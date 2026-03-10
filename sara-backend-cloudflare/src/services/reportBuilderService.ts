// REPORT BUILDER SERVICE - Dynamic report generation from configuration
// Queries leads, appointments, tasks, and communications tables

import { SupabaseService } from './supabase';

// --- TYPES ---

export interface ReportConfig {
  entity: 'leads' | 'appointments' | 'tasks' | 'communications';
  metrics: ReportMetric[];
  dimensions?: string[];
  filters?: Record<string, any>;
  date_range?: { from?: string; to?: string };
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
}

export type ReportMetric = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface ReportResult {
  rows: Record<string, any>[];
  totals: Record<string, number>;
  row_count: number;
  generated_at: string;
}

export interface SavedReport {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  report_type: string;
  config: ReportConfig;
  schedule?: ReportSchedule;
  is_default: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  recipients: string[];
  active: boolean;
}

export interface ReportSnapshot {
  id: string;
  report_id: string;
  data: ReportResult;
  row_count: number;
  generated_at: string;
}

const NUMERIC_FIELDS: Record<string, string[]> = {
  leads: ['score', 'budget_min', 'budget_max'],
  appointments: ['duration_minutes'],
  tasks: ['priority_order'],
  communications: ['message_count'],
};

// --- BUILD REPORT ---

export async function buildReport(supabase: SupabaseService, config: ReportConfig): Promise<ReportResult> {
  const { entity, metrics, dimensions, filters, date_range, sort, limit } = config;

  let query = supabase.client.from(entity).select('*').eq('tenant_id', supabase.getTenantId());

  if (filters) {
    for (const [field, value] of Object.entries(filters)) {
      if (value === null) query = query.is(field, null);
      else if (Array.isArray(value)) query = query.in(field, value);
      else query = query.eq(field, value);
    }
  }
  if (date_range?.from) query = query.gte('created_at', date_range.from);
  if (date_range?.to) query = query.lte('created_at', date_range.to);

  const { data: rows, error } = await query;
  if (error) {
    console.error('reportBuilder: query error', error.message);
    return { rows: [], totals: {}, row_count: 0, generated_at: new Date().toISOString() };
  }

  const allRows = rows || [];
  let resultRows: Record<string, any>[];
  const totals: Record<string, number> = {};
  const numFields = NUMERIC_FIELDS[entity] || [];

  if (dimensions && dimensions.length > 0) {
    const groups = new Map<string, any[]>();
    for (const row of allRows) {
      const key = dimensions.map(d => String(row[d] ?? 'null')).join('||');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    resultRows = [];
    for (const [, groupRows] of groups) {
      const agg: Record<string, any> = {};
      for (const dim of dimensions) agg[dim] = groupRows[0][dim];
      computeMetrics(agg, groupRows, metrics, numFields);
      resultRows.push(agg);
    }
  } else {
    const agg: Record<string, any> = {};
    computeMetrics(agg, allRows, metrics, numFields);
    resultRows = [agg];
  }

  // Accumulate totals across all rows
  for (const metric of metrics) {
    if (metric === 'count') {
      totals.count = allRows.length;
    } else {
      for (const f of numFields) {
        const vals = allRows.map(r => Number(r[f])).filter(v => !isNaN(v));
        totals[`${metric}_${f}`] = calcMetric(metric, vals);
      }
    }
  }

  if (sort && resultRows.length > 1) {
    const dir = sort.direction === 'desc' ? -1 : 1;
    resultRows.sort((a, b) => {
      const va = a[sort.field] ?? 0, vb = b[sort.field] ?? 0;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }
  if (limit && limit > 0) resultRows = resultRows.slice(0, limit);

  return { rows: resultRows, totals, row_count: resultRows.length, generated_at: new Date().toISOString() };
}

// --- HELPERS ---

function computeMetrics(target: Record<string, any>, rows: any[], metrics: ReportMetric[], numFields: string[]): void {
  for (const metric of metrics) {
    if (metric === 'count') {
      target.count = rows.length;
    } else {
      for (const f of numFields) {
        const vals = rows.map(r => Number(r[f])).filter(v => !isNaN(v));
        target[`${metric}_${f}`] = calcMetric(metric, vals);
      }
    }
  }
}

function calcMetric(metric: ReportMetric, values: number[]): number {
  if (values.length === 0) return 0;
  switch (metric) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    default: return 0;
  }
}

// --- SAVED REPORTS CRUD ---

export async function saveReport(
  supabase: SupabaseService,
  data: { name: string; description?: string; report_type?: string; config: ReportConfig; schedule?: ReportSchedule; created_by?: string; is_default?: boolean }
): Promise<SavedReport | null> {
  const { data: report, error } = await supabase.client
    .from('saved_reports')
    .insert({
      tenant_id: supabase.getTenantId(), name: data.name, description: data.description || null,
      report_type: data.report_type || 'custom', config: data.config,
      schedule: data.schedule || null, is_default: data.is_default ?? false, created_by: data.created_by || null,
    })
    .select().single();
  if (error) { console.error('reportBuilder: saveReport error', error.message); return null; }
  return report;
}

export async function getReport(supabase: SupabaseService, reportId: string): Promise<SavedReport | null> {
  const { data, error } = await supabase.client
    .from('saved_reports').select('*').eq('id', reportId).eq('tenant_id', supabase.getTenantId()).single();
  if (error) return null;
  return data;
}

export async function listReports(
  supabase: SupabaseService,
  filters?: { report_type?: string; created_by?: string }
): Promise<SavedReport[]> {
  let query = supabase.client.from('saved_reports').select('*')
    .eq('tenant_id', supabase.getTenantId()).order('created_at', { ascending: false });
  if (filters?.report_type) query = query.eq('report_type', filters.report_type);
  if (filters?.created_by) query = query.eq('created_by', filters.created_by);
  const { data, error } = await query;
  if (error) { console.error('reportBuilder: listReports error', error.message); return []; }
  return data || [];
}

export async function updateReport(
  supabase: SupabaseService, reportId: string,
  updates: Partial<Pick<SavedReport, 'name' | 'description' | 'report_type' | 'config' | 'schedule' | 'is_default'>>
): Promise<SavedReport | null> {
  const { data, error } = await supabase.client
    .from('saved_reports').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', reportId).eq('tenant_id', supabase.getTenantId()).select().single();
  if (error) { console.error('reportBuilder: updateReport error', error.message); return null; }
  return data;
}

export async function deleteReport(supabase: SupabaseService, reportId: string): Promise<boolean> {
  const { error } = await supabase.client.from('saved_reports').delete()
    .eq('id', reportId).eq('tenant_id', supabase.getTenantId());
  if (error) { console.error('reportBuilder: deleteReport error', error.message); return false; }
  return true;
}

// --- SNAPSHOTS ---

export async function saveSnapshot(supabase: SupabaseService, reportId: string, data: ReportResult): Promise<ReportSnapshot | null> {
  const { data: snapshot, error } = await supabase.client
    .from('report_snapshots')
    .insert({ report_id: reportId, data, row_count: data.row_count, generated_at: data.generated_at })
    .select().single();
  if (error) { console.error('reportBuilder: saveSnapshot error', error.message); return null; }
  return snapshot;
}

export async function getSnapshots(supabase: SupabaseService, reportId: string, limit: number = 10): Promise<ReportSnapshot[]> {
  const { data, error } = await supabase.client
    .from('report_snapshots').select('*').eq('report_id', reportId)
    .order('generated_at', { ascending: false }).limit(limit);
  if (error) { console.error('reportBuilder: getSnapshots error', error.message); return []; }
  return data || [];
}

// --- CSV EXPORT ---

export function exportReportToCSV(result: ReportResult): string {
  if (result.rows.length === 0) return '';
  const headers = Object.keys(result.rows[0]);
  const esc = (val: any): string => {
    const s = val === null || val === undefined ? '' : String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [headers.map(esc).join(',')];
  for (const row of result.rows) lines.push(headers.map(h => esc(row[h])).join(','));
  return lines.join('\n');
}
