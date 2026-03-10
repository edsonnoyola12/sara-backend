import { SupabaseService } from './supabase';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EntityType = 'lead' | 'property' | 'task' | 'team_member';
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'url' | 'email' | 'phone';

export interface CreateFieldData {
  tenant_id: string;
  entity_type: EntityType;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  options?: string[];
  required?: boolean;
  sort_order?: number;
  default_value?: string;
}

export interface UpdateFieldData {
  field_label?: string;
  field_type?: FieldType;
  options?: string[];
  required?: boolean;
  sort_order?: number;
  default_value?: string | null;
  active?: boolean;
}

export interface FieldValueInput {
  field_id: string;
  value: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface CustomFieldDef {
  id: string;
  tenant_id: string;
  entity_type: EntityType;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  options?: string[];
  required: boolean;
  sort_order: number;
  active: boolean;
  default_value?: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIELD DEFINITIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Create a new custom field definition. */
export async function createField(supabase: SupabaseService, data: CreateFieldData) {
  const { data: field, error } = await supabase.client
    .from('custom_fields')
    .insert([data])
    .select()
    .single();

  if (error) {
    console.error('Error creating custom field:', error.message);
    return { data: null, error };
  }
  return { data: field, error: null };
}

/** Get a single custom field definition by ID. */
export async function getField(supabase: SupabaseService, fieldId: string) {
  const { data, error } = await supabase.client
    .from('custom_fields')
    .select('*')
    .eq('id', fieldId)
    .single();

  if (error) {
    console.error('Error getting custom field:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/** List active custom fields for an entity type, sorted by sort_order. */
export async function listFields(supabase: SupabaseService, entityType: string) {
  const { data, error } = await supabase.client
    .from('custom_fields')
    .select('*')
    .eq('entity_type', entityType)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error listing custom fields:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

/** Update a custom field definition. */
export async function updateField(supabase: SupabaseService, fieldId: string, updates: UpdateFieldData) {
  const { data, error } = await supabase.client
    .from('custom_fields')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', fieldId)
    .select()
    .single();

  if (error) {
    console.error('Error updating custom field:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/** Soft-delete a custom field by setting active=false. */
export async function deleteField(supabase: SupabaseService, fieldId: string) {
  return updateField(supabase, fieldId, { active: false });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIELD VALUES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Upsert a single custom field value for an entity. */
export async function setFieldValue(supabase: SupabaseService, fieldId: string, entityId: string, value: string) {
  // Get the field definition to obtain tenant_id
  const { data: fieldDef, error: fieldError } = await supabase.client
    .from('custom_fields')
    .select('tenant_id')
    .eq('id', fieldId)
    .single();

  if (fieldError || !fieldDef) {
    console.error('Error getting field for setValue:', fieldError?.message);
    return { data: null, error: fieldError || { message: 'Field not found' } };
  }

  const { data, error } = await supabase.client
    .from('custom_field_values')
    .upsert(
      {
        custom_field_id: fieldId,
        entity_id: entityId,
        tenant_id: fieldDef.tenant_id,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'custom_field_id,entity_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error setting custom field value:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/** Get all custom field values for an entity, joined with field definitions. */
export async function getFieldValues(supabase: SupabaseService, entityId: string, entityType: string) {
  const { data, error } = await supabase.client
    .from('custom_field_values')
    .select('*, field:custom_fields!custom_field_id(*)')
    .eq('entity_id', entityId)
    .eq('field.entity_type', entityType)
    .eq('field.active', true)
    .order('field(sort_order)', { ascending: true });

  if (error) {
    console.error('Error getting custom field values:', error.message);
    return { data: [], error };
  }

  // Filter out rows where the join didn't match (field is null due to entity_type/active filter)
  const filtered = (data || []).filter((row: any) => row.field !== null);
  return { data: filtered, error: null };
}

/** Set multiple field values at once for an entity. */
export async function bulkSetFieldValues(
  supabase: SupabaseService,
  entityId: string,
  values: FieldValueInput[]
) {
  if (!values.length) {
    return { data: [], error: null };
  }

  // Get tenant_ids for all fields in one query
  const fieldIds = values.map((v) => v.field_id);
  const { data: fields, error: fieldsError } = await supabase.client
    .from('custom_fields')
    .select('id, tenant_id')
    .in('id', fieldIds);

  if (fieldsError || !fields?.length) {
    console.error('Error getting fields for bulk set:', fieldsError?.message);
    return { data: null, error: fieldsError || { message: 'Fields not found' } };
  }

  const tenantMap = new Map<string, string>();
  for (const f of fields) {
    tenantMap.set(f.id, f.tenant_id);
  }

  const rows = values.map((v) => ({
    custom_field_id: v.field_id,
    entity_id: entityId,
    tenant_id: tenantMap.get(v.field_id),
    value: v.value,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.client
    .from('custom_field_values')
    .upsert(rows, { onConflict: 'custom_field_id,entity_id' })
    .select();

  if (error) {
    console.error('Error bulk setting custom field values:', error.message);
    return { data: null, error };
  }
  return { data: data || [], error: null };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDATION (pure function, no supabase)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** Validate a value against a custom field definition. Pure function. */
export function validateFieldValue(fieldDef: CustomFieldDef, value: string | null | undefined): ValidationResult {
  // Required check
  if (fieldDef.required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: `${fieldDef.field_label} is required` };
  }

  // Empty non-required values are always valid
  if (value === null || value === undefined || value === '') {
    return { valid: true };
  }

  switch (fieldDef.field_type) {
    case 'number': {
      if (isNaN(Number(value))) {
        return { valid: false, error: `${fieldDef.field_label} must be a valid number` };
      }
      break;
    }

    case 'boolean': {
      if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
        return { valid: false, error: `${fieldDef.field_label} must be true or false` };
      }
      break;
    }

    case 'date': {
      if (!DATE_RE.test(value) || isNaN(Date.parse(value))) {
        return { valid: false, error: `${fieldDef.field_label} must be a valid date (YYYY-MM-DD)` };
      }
      break;
    }

    case 'email': {
      if (!EMAIL_RE.test(value)) {
        return { valid: false, error: `${fieldDef.field_label} must be a valid email` };
      }
      break;
    }

    case 'url': {
      if (!URL_RE.test(value)) {
        return { valid: false, error: `${fieldDef.field_label} must be a valid URL (http/https)` };
      }
      break;
    }

    case 'phone': {
      if (!PHONE_RE.test(value)) {
        return { valid: false, error: `${fieldDef.field_label} must be a valid phone number` };
      }
      break;
    }

    case 'select': {
      const opts = fieldDef.options || [];
      if (opts.length && !opts.includes(value)) {
        return { valid: false, error: `${fieldDef.field_label} must be one of: ${opts.join(', ')}` };
      }
      break;
    }

    case 'multiselect': {
      const opts = fieldDef.options || [];
      if (opts.length) {
        const selected = value.split(',').map((s) => s.trim());
        const invalid = selected.filter((s) => !opts.includes(s));
        if (invalid.length) {
          return { valid: false, error: `${fieldDef.field_label} has invalid options: ${invalid.join(', ')}` };
        }
      }
      break;
    }

    case 'text':
    default:
      // No extra validation for text
      break;
  }

  return { valid: true };
}
