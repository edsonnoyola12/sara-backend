// ═══════════════════════════════════════════════════════════════════════════
// COMMUNICATION SERVICE - Unified communication log
// ═══════════════════════════════════════════════════════════════════════════
// Tabla: communications
// Canales: whatsapp, email, sms, call, retell
// Timeline unificado por lead
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type CommunicationChannel = 'whatsapp' | 'email' | 'sms' | 'call' | 'retell';
export type CommunicationDirection = 'inbound' | 'outbound';
export type CommunicationStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';

export interface LogCommunicationInput {
  lead_id: string;
  team_member_id?: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  content: string;
  subject?: string;
  status?: CommunicationStatus;
  external_id?: string;
  template_id?: string;
  metadata?: Record<string, any>;
  error_message?: string;
}

export interface TimelineFilters {
  channel?: CommunicationChannel;
  direction?: CommunicationDirection;
  page?: number;
  limit?: number;
}

export interface CommunicationEntry {
  id: string;
  tenant_id: string;
  lead_id: string;
  team_member_id: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  content: string;
  subject: string | null;
  status: CommunicationStatus;
  error_message: string | null;
  external_id: string | null;
  template_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface CommunicationStats {
  channel: string;
  direction: string;
  status: string;
  count: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert a communication record into the communications table.
 */
export async function logCommunication(
  supabase: SupabaseService,
  data: LogCommunicationInput
): Promise<CommunicationEntry | null> {
  const { data: comm, error } = await supabase.client
    .from('communications')
    .insert({
      lead_id: data.lead_id,
      team_member_id: data.team_member_id ?? null,
      channel: data.channel,
      direction: data.direction,
      content: data.content,
      subject: data.subject ?? null,
      status: data.status ?? 'sent',
      external_id: data.external_id ?? null,
      template_id: data.template_id ?? null,
      metadata: data.metadata ?? {},
      error_message: data.error_message ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging communication:', error.message);
    return null;
  }
  return comm;
}

/**
 * Get all communications for a lead, sorted newest first.
 * Supports filtering by channel, direction, and pagination.
 */
export async function getTimeline(
  supabase: SupabaseService,
  leadId: string,
  filters?: TimelineFilters
): Promise<{ data: CommunicationEntry[]; total: number }> {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.client
    .from('communications')
    .select('*', { count: 'exact' })
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters?.channel) {
    query = query.eq('channel', filters.channel);
  }
  if (filters?.direction) {
    query = query.eq('direction', filters.direction);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Error getting timeline:', error.message);
    return { data: [], total: 0 };
  }
  return { data: data ?? [], total: count ?? 0 };
}

/**
 * Quick access to recent communications for a lead.
 * Defaults to 10 most recent entries.
 */
export async function getRecentCommunications(
  supabase: SupabaseService,
  leadId: string,
  channel?: CommunicationChannel,
  limit: number = 10
): Promise<CommunicationEntry[]> {
  let query = supabase.client
    .from('communications')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (channel) {
    query = query.eq('channel', channel);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error getting recent communications:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Update the status of a communication (e.g., delivered, read, bounced).
 */
export async function updateCommunicationStatus(
  supabase: SupabaseService,
  commId: string,
  status: CommunicationStatus,
  errorMessage?: string
): Promise<CommunicationEntry | null> {
  const updateData: Record<string, any> = { status };

  if (errorMessage) {
    updateData.error_message = errorMessage;
  }

  const { data: comm, error } = await supabase.client
    .from('communications')
    .update(updateData)
    .eq('id', commId)
    .select()
    .single();

  if (error) {
    console.error('Error updating communication status:', error.message);
    return null;
  }
  return comm;
}

/**
 * Get communication counts grouped by channel, direction, and status.
 * Supports filtering by lead_id, channel, and date range.
 */
export async function getCommunicationStats(
  supabase: SupabaseService,
  filters?: {
    lead_id?: string;
    channel?: CommunicationChannel;
    from_date?: string;
    to_date?: string;
  }
): Promise<CommunicationStats[]> {
  // Build a filtered query and aggregate in-memory since Supabase JS
  // client does not support GROUP BY natively
  let query = supabase.client
    .from('communications')
    .select('channel, direction, status');

  if (filters?.lead_id) {
    query = query.eq('lead_id', filters.lead_id);
  }
  if (filters?.channel) {
    query = query.eq('channel', filters.channel);
  }
  if (filters?.from_date) {
    query = query.gte('created_at', filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte('created_at', filters.to_date);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error getting communication stats:', error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Aggregate counts by channel + direction + status
  const counts = new Map<string, CommunicationStats>();

  for (const row of data) {
    const key = `${row.channel}|${row.direction}|${row.status}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        channel: row.channel,
        direction: row.direction,
        status: row.status,
        count: 1,
      });
    }
  }

  return Array.from(counts.values());
}
