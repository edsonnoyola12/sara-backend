// ═══════════════════════════════════════════════════════════════════════════
// NOTE SERVICE - CRUD de notas por lead
// ═══════════════════════════════════════════════════════════════════════════
// Tabla: lead_notes
// Tipos: manual, system, whatsapp, call, email, visit
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type NoteType = 'manual' | 'system' | 'whatsapp' | 'call' | 'email' | 'visit';

export interface CreateNoteInput {
  lead_id: string;
  content: string;
  author_id?: string;
  note_type?: NoteType;
  pinned?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateNoteInput {
  content?: string;
  pinned?: boolean;
  metadata?: Record<string, any>;
}

export interface ListNotesFilters {
  note_type?: NoteType;
  pinned?: boolean;
  page?: number;
  limit?: number;
}

export interface LeadNote {
  id: string;
  tenant_id: string;
  lead_id: string;
  author_id: string | null;
  content: string;
  note_type: NoteType;
  pinned: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function createNote(
  supabase: SupabaseService,
  data: CreateNoteInput
): Promise<LeadNote | null> {
  const { data: note, error } = await supabase.client
    .from('lead_notes')
    .insert({
      lead_id: data.lead_id,
      content: data.content,
      author_id: data.author_id ?? null,
      note_type: data.note_type ?? 'manual',
      pinned: data.pinned ?? false,
      metadata: data.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating note:', error.message);
    return null;
  }
  return note;
}

export async function getNote(
  supabase: SupabaseService,
  noteId: string
): Promise<LeadNote | null> {
  const { data: note, error } = await supabase.client
    .from('lead_notes')
    .select('*')
    .eq('id', noteId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('Error getting note:', error.message);
    return null;
  }
  return note;
}

export async function listNotes(
  supabase: SupabaseService,
  leadId: string,
  filters?: ListNotesFilters
): Promise<{ data: LeadNote[]; total: number }> {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.client
    .from('lead_notes')
    .select('*', { count: 'exact' })
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters?.note_type) {
    query = query.eq('note_type', filters.note_type);
  }
  if (filters?.pinned !== undefined) {
    query = query.eq('pinned', filters.pinned);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Error listing notes:', error.message);
    return { data: [], total: 0 };
  }
  return { data: data ?? [], total: count ?? 0 };
}

export async function updateNote(
  supabase: SupabaseService,
  noteId: string,
  updates: UpdateNoteInput
): Promise<LeadNote | null> {
  const { data: note, error } = await supabase.client
    .from('lead_notes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select()
    .single();

  if (error) {
    console.error('Error updating note:', error.message);
    return null;
  }
  return note;
}

export async function deleteNote(
  supabase: SupabaseService,
  noteId: string
): Promise<boolean> {
  const { error } = await supabase.client
    .from('lead_notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    console.error('Error deleting note:', error.message);
    return false;
  }
  return true;
}

export async function pinNote(
  supabase: SupabaseService,
  noteId: string
): Promise<LeadNote | null> {
  return updateNote(supabase, noteId, { pinned: true });
}

export async function unpinNote(
  supabase: SupabaseService,
  noteId: string
): Promise<LeadNote | null> {
  return updateNote(supabase, noteId, { pinned: false });
}

export async function getPinnedNotes(
  supabase: SupabaseService,
  leadId: string
): Promise<LeadNote[]> {
  const { data, error } = await supabase.client
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .eq('pinned', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting pinned notes:', error.message);
    return [];
  }
  return data ?? [];
}

export async function searchNotes(
  supabase: SupabaseService,
  query: string,
  leadId?: string
): Promise<LeadNote[]> {
  let q = supabase.client
    .from('lead_notes')
    .select('*')
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (leadId) {
    q = q.eq('lead_id', leadId);
  }

  const { data, error } = await q;

  if (error) {
    console.error('Error searching notes:', error.message);
    return [];
  }
  return data ?? [];
}
