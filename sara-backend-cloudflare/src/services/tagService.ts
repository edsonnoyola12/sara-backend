// ═══════════════════════════════════════════════════════════════════════════
// TAG SERVICE - Tag Management for Leads
// Create, assign, and query tags across leads with bulk operations
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateTagInput {
  name: string;
  color?: string;
  category?: string;
  description?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
  category?: string;
  description?: string;
}

export interface TagFilters {
  category?: string;
}

export interface Tag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  category: string;
  description: string | null;
  created_at: string;
}

export interface LeadTag {
  id: string;
  tenant_id: string;
  lead_id: string;
  tag_id: string;
  created_at: string;
  created_by: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAG CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function createTag(
  supabase: SupabaseService,
  data: CreateTagInput
): Promise<Tag | null> {
  const { data: tag, error } = await supabase.client
    .from('tags')
    .insert({
      tenant_id: supabase.getTenantId(),
      name: data.name,
      color: data.color || '#6B7280',
      category: data.category || 'general',
      description: data.description || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating tag:', error.message);
    return null;
  }
  return tag;
}

export async function getTag(
  supabase: SupabaseService,
  tagId: string
): Promise<Tag | null> {
  const { data: tag, error } = await supabase.client
    .from('tags')
    .select('*')
    .eq('id', tagId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('Error getting tag:', error.message);
    return null;
  }
  return tag;
}

export async function listTags(
  supabase: SupabaseService,
  filters?: TagFilters
): Promise<Tag[]> {
  let query = supabase.client
    .from('tags')
    .select('*')
    .order('name', { ascending: true });

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  const { data: tags, error } = await query;

  if (error) {
    console.error('Error listing tags:', error.message);
    return [];
  }
  return tags || [];
}

export async function updateTag(
  supabase: SupabaseService,
  tagId: string,
  updates: UpdateTagInput
): Promise<Tag | null> {
  const { data: tag, error } = await supabase.client
    .from('tags')
    .update(updates)
    .eq('id', tagId)
    .select()
    .single();

  if (error) {
    console.error('Error updating tag:', error.message);
    return null;
  }
  return tag;
}

export async function deleteTag(
  supabase: SupabaseService,
  tagId: string
): Promise<boolean> {
  // Delete lead_tags first (cascade manually for safety)
  await supabase.client
    .from('lead_tags')
    .delete()
    .eq('tag_id', tagId);

  const { error } = await supabase.client
    .from('tags')
    .delete()
    .eq('id', tagId);

  if (error) {
    console.error('Error deleting tag:', error.message);
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAD-TAG ASSOCIATIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function addTagToLead(
  supabase: SupabaseService,
  leadId: string,
  tagId: string,
  createdBy?: string
): Promise<LeadTag | null> {
  const { data: leadTag, error } = await supabase.client
    .from('lead_tags')
    .upsert(
      {
        tenant_id: supabase.getTenantId(),
        lead_id: leadId,
        tag_id: tagId,
        created_by: createdBy || null,
      },
      { onConflict: 'lead_id,tag_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error adding tag to lead:', error.message);
    return null;
  }
  return leadTag;
}

export async function removeTagFromLead(
  supabase: SupabaseService,
  leadId: string,
  tagId: string
): Promise<boolean> {
  const { error } = await supabase.client
    .from('lead_tags')
    .delete()
    .eq('lead_id', leadId)
    .eq('tag_id', tagId);

  if (error) {
    console.error('Error removing tag from lead:', error.message);
    return false;
  }
  return true;
}

export async function getLeadTags(
  supabase: SupabaseService,
  leadId: string
): Promise<Tag[]> {
  const { data, error } = await supabase.client
    .from('lead_tags')
    .select('tag_id, tags(id, tenant_id, name, color, category, description, created_at)')
    .eq('lead_id', leadId);

  if (error) {
    console.error('Error getting lead tags:', error.message);
    return [];
  }

  return (data || []).map((row: any) => row.tags).filter(Boolean);
}

export async function getLeadsByTag(
  supabase: SupabaseService,
  tagId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ leads: any[]; total: number }> {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase.client
    .from('lead_tags')
    .select('lead_id, leads(id, name, phone, status, assigned_to, score, created_at, updated_at)', { count: 'exact' })
    .eq('tag_id', tagId)
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error getting leads by tag:', error.message);
    return { leads: [], total: 0 };
  }

  const leads = (data || []).map((row: any) => row.leads).filter(Boolean);
  return { leads, total: count || 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function bulkTagLeads(
  supabase: SupabaseService,
  leadIds: string[],
  tagId: string,
  createdBy?: string
): Promise<{ success: number; failed: number }> {
  const rows = leadIds.map((leadId) => ({
    tenant_id: supabase.getTenantId(),
    lead_id: leadId,
    tag_id: tagId,
    created_by: createdBy || null,
  }));

  const { data, error } = await supabase.client
    .from('lead_tags')
    .upsert(rows, { onConflict: 'lead_id,tag_id' })
    .select();

  if (error) {
    console.error('Error bulk tagging leads:', error.message);
    return { success: 0, failed: leadIds.length };
  }

  const success = data?.length || 0;
  return { success, failed: leadIds.length - success };
}
