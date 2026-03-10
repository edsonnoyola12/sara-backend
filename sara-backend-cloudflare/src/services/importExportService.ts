import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT/EXPORT SERVICE - CSV import and export for leads
// ═══════════════════════════════════════════════════════════════════════════
// No external dependencies - manual CSV parsing for Cloudflare Workers
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface ImportRow {
  name: string;
  phone: string;
  email?: string;
  status?: string;
  source?: string;
  assigned_to?: string;
  score?: number;
  notes?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface ExportFilters {
  status?: string;
  assigned_to?: string;
  source?: string;
  created_from?: string;
  created_to?: string;
}

const VALID_STATUSES = [
  'new', 'contacted', 'scheduled', 'visited',
  'negotiation', 'reserved', 'closed', 'delivered',
  'lost', 'inactive',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ═══════════════════════════════════════════════════════════════════════════
// CSV PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a CSV string into an array of objects.
 * Handles quoted fields, commas inside quotes, and newlines inside quotes.
 */
export function parseCSV(csvContent: string): { headers: string[]; rows: Record<string, string>[] } {
  const fields: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < csvContent.length) {
    const ch = csvContent[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < csvContent.length && csvContent[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      current.push(field.trim());
      field = '';
      i++;
      continue;
    }

    if (ch === '\n' || (ch === '\r' && i + 1 < csvContent.length && csvContent[i + 1] === '\n')) {
      current.push(field.trim());
      field = '';
      if (current.length > 0 && current.some(f => f !== '')) {
        fields.push(current);
      }
      current = [];
      i += ch === '\r' ? 2 : 1;
      continue;
    }

    if (ch === '\r') {
      current.push(field.trim());
      field = '';
      if (current.length > 0 && current.some(f => f !== '')) {
        fields.push(current);
      }
      current = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Last field
  if (field || current.length > 0) {
    current.push(field.trim());
    if (current.some(f => f !== '')) {
      fields.push(current);
    }
  }

  if (fields.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = fields[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < fields.length; r++) {
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = fields[r][c] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate import data rows.
 * Returns valid rows and per-row field-level errors.
 */
export function validateImportData(rows: Record<string, string>[]): {
  valid: ImportRow[];
  errors: Array<{ row: number; field: string; error: string }>;
} {
  const valid: ImportRow[] = [];
  const errors: Array<{ row: number; field: string; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers, 0-indexed
    let hasError = false;

    // Name - required
    if (!r.name || r.name.trim() === '') {
      errors.push({ row: rowNum, field: 'name', error: 'Name is required' });
      hasError = true;
    }

    // Phone - required, 10-15 digits after stripping non-digits
    const rawPhone = r.phone || '';
    const digits = rawPhone.replace(/\D/g, '');
    if (!rawPhone || digits.length < 10 || digits.length > 15) {
      errors.push({
        row: rowNum,
        field: 'phone',
        error: `Phone must be 10-15 digits (got ${digits.length})`,
      });
      hasError = true;
    }

    // Email - optional but must be valid if present
    const email = (r.email || '').trim();
    if (email && !EMAIL_REGEX.test(email)) {
      errors.push({ row: rowNum, field: 'email', error: 'Invalid email format' });
      hasError = true;
    }

    // Status - must be valid if present
    const status = (r.status || '').trim().toLowerCase();
    if (status && !VALID_STATUSES.includes(status)) {
      errors.push({
        row: rowNum,
        field: 'status',
        error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
      hasError = true;
    }

    if (!hasError) {
      const importRow: ImportRow = {
        name: r.name.trim(),
        phone: digits,
      };
      if (email) importRow.email = email;
      if (status) importRow.status = status;
      if (r.source?.trim()) importRow.source = r.source.trim();
      if (r.assigned_to?.trim()) importRow.assigned_to = r.assigned_to.trim();
      if (r.score?.trim()) {
        const score = parseInt(r.score.trim(), 10);
        if (!isNaN(score)) importRow.score = score;
      }
      if (r.notes?.trim()) importRow.notes = r.notes.trim();

      valid.push(importRow);
    }
  }

  return { valid, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Import validated leads into the database.
 * Checks for duplicates by phone. Returns import results.
 */
export async function importLeads(
  supabase: SupabaseService,
  validRows: ImportRow[],
  options?: {
    assignTo?: string;
    defaultSource?: string;
    skipDuplicates?: boolean;
  },
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const skipDuplicates = options?.skipDuplicates ?? true;

  // Fetch existing phones in one query to check duplicates efficiently
  const phones = validRows.map(r => r.phone);
  const { data: existingLeads } = await supabase.client
    .from('leads')
    .select('phone')
    .in('phone', phones);

  const existingPhones = new Set((existingLeads || []).map((l: any) => l.phone));

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const rowNum = i + 1;

    // Check duplicate
    if (existingPhones.has(row.phone)) {
      if (skipDuplicates) {
        result.skipped++;
        continue;
      }
    }

    try {
      const leadData: Record<string, any> = {
        name: row.name,
        phone: row.phone,
        status: row.status || 'new',
        source: row.source || options?.defaultSource || 'csv_import',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (row.email) leadData.email = row.email;
      if (row.assigned_to || options?.assignTo) {
        leadData.assigned_to = row.assigned_to || options?.assignTo;
      }
      if (row.score !== undefined) leadData.score = row.score;
      if (row.notes) {
        leadData.notes = { import_notes: row.notes, imported_at: new Date().toISOString() };
      }

      const { error } = await supabase.client
        .from('leads')
        .insert([leadData]);

      if (error) {
        result.errors.push({ row: rowNum, error: error.message });
      } else {
        result.imported++;
        existingPhones.add(row.phone); // prevent duplicates within same batch
      }
    } catch (err: any) {
      result.errors.push({ row: rowNum, error: err.message || 'Unknown error' });
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export leads as a CSV string.
 * Joins with team_members for assigned_to_name.
 */
export async function exportLeads(
  supabase: SupabaseService,
  filters?: ExportFilters,
): Promise<string> {
  let query = supabase.client
    .from('leads')
    .select('name, phone, email, status, source, assigned_to, score, created_at, team_members(name)')
    .order('created_at', { ascending: false });

  query = applyFilters(query, filters);

  const { data: leads, error } = await query;
  if (error) {
    console.error('Export leads error:', error.message);
    return '';
  }

  const headers = ['name', 'phone', 'email', 'status', 'source', 'assigned_to_name', 'score', 'created_at'];
  const rows: Record<string, string>[] = (leads || []).map((lead: any) => ({
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    status: lead.status || '',
    source: lead.source || '',
    assigned_to_name: lead.team_members?.name || '',
    score: lead.score != null ? String(lead.score) : '',
    created_at: lead.created_at || '',
  }));

  return generateCSV(headers, rows);
}

/**
 * Export leads with custom field values as additional columns.
 */
export async function exportLeadsWithCustomFields(
  supabase: SupabaseService,
  filters?: ExportFilters,
): Promise<string> {
  // Fetch custom field definitions
  const { data: fieldDefs } = await supabase.client
    .from('custom_fields')
    .select('id, name, field_key')
    .eq('entity_type', 'lead')
    .order('display_order', { ascending: true });

  const customFields = fieldDefs || [];

  // Fetch leads
  let query = supabase.client
    .from('leads')
    .select('id, name, phone, email, status, source, assigned_to, score, created_at, team_members(name)')
    .order('created_at', { ascending: false });

  query = applyFilters(query, filters);

  const { data: leads, error } = await query;
  if (error) {
    console.error('Export leads error:', error.message);
    return '';
  }

  if (!leads || leads.length === 0) {
    const headers = ['name', 'phone', 'email', 'status', 'source', 'assigned_to_name', 'score', 'created_at'];
    return generateCSV(headers, []);
  }

  // Fetch custom field values for these leads
  const leadIds = leads.map((l: any) => l.id);
  const { data: fieldValues } = await supabase.client
    .from('custom_field_values')
    .select('entity_id, field_id, value')
    .eq('entity_type', 'lead')
    .in('entity_id', leadIds);

  // Build lookup: leadId -> fieldId -> value
  const valueLookup: Record<string, Record<string, string>> = {};
  for (const fv of (fieldValues || [])) {
    if (!valueLookup[fv.entity_id]) valueLookup[fv.entity_id] = {};
    valueLookup[fv.entity_id][fv.field_id] = fv.value ?? '';
  }

  // Build headers
  const baseHeaders = ['name', 'phone', 'email', 'status', 'source', 'assigned_to_name', 'score', 'created_at'];
  const customHeaders = customFields.map((f: any) => f.name || f.field_key);
  const headers = [...baseHeaders, ...customHeaders];

  // Build rows
  const rows: Record<string, string>[] = leads.map((lead: any) => {
    const row: Record<string, string> = {
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      status: lead.status || '',
      source: lead.source || '',
      assigned_to_name: lead.team_members?.name || '',
      score: lead.score != null ? String(lead.score) : '',
      created_at: lead.created_at || '',
    };

    // Add custom field values
    for (const cf of customFields) {
      const cfName = cf.name || cf.field_key;
      row[cfName] = valueLookup[lead.id]?.[cf.id] || '';
    }

    return row;
  });

  return generateCSV(headers, rows);
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert headers and rows into a properly escaped CSV string.
 */
export function generateCSV(headers: string[], rows: Record<string, string>[]): string {
  const escapeField = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  };

  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(','));

  for (const row of rows) {
    const values = headers.map(h => escapeField(row[h] ?? ''));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function applyFilters(query: any, filters?: ExportFilters): any {
  if (!filters) return query;

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.assigned_to) {
    query = query.eq('assigned_to', filters.assigned_to);
  }
  if (filters.source) {
    query = query.eq('source', filters.source);
  }
  if (filters.created_from) {
    query = query.gte('created_at', filters.created_from);
  }
  if (filters.created_to) {
    query = query.lte('created_at', filters.created_to);
  }

  return query;
}
