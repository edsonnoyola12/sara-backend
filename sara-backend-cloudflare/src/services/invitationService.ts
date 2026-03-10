// ═══════════════════════════════════════════════════════════════════════════
// INVITATION SERVICE - Team invitation management
// Create, accept, revoke, and resend invitations with token-based flow
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';
import { hashPassword } from '../middleware/auth';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CreateInvitationInput {
  email: string;
  role?: string;
  invited_by?: string;
}

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const EXPIRY_DAYS = 7;

function expiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + EXPIRY_DAYS);
  return d.toISOString();
}

export function isExpired(invitation: any): boolean {
  if (!invitation?.expires_at) return true;
  return new Date(invitation.expires_at).getTime() < Date.now();
}

// ── Functions ─────────────────────────────────────────────────────────────

export async function createInvitation(
  supabase: SupabaseService,
  data: CreateInvitationInput
): Promise<Invitation | null> {
  const { data: inv, error } = await supabase.client
    .from('invitations')
    .insert({
      tenant_id: supabase.getTenantId(),
      email: data.email,
      role: data.role ?? 'vendedor',
      token: crypto.randomUUID(),
      invited_by: data.invited_by ?? null,
      expires_at: expiresAt(),
    })
    .select()
    .single();
  if (error) { console.error('Error creating invitation:', error.message); return null; }
  return inv;
}

export async function getInvitation(supabase: SupabaseService, invitationId: string): Promise<Invitation | null> {
  const { data: inv, error } = await supabase.client
    .from('invitations').select('*').eq('id', invitationId).single();
  if (error) {
    if (error.code !== 'PGRST116') console.error('Error getting invitation:', error.message);
    return null;
  }
  return inv;
}

export async function getInvitationByToken(supabase: SupabaseService, token: string): Promise<Invitation | null> {
  const { data: inv, error } = await supabase.client
    .from('invitations').select('*').eq('token', token).single();
  if (error) {
    if (error.code !== 'PGRST116') console.error('Error getting invitation by token:', error.message);
    return null;
  }
  return inv;
}

export async function listInvitations(
  supabase: SupabaseService,
  filters?: { accepted?: boolean }
): Promise<Invitation[]> {
  let query = supabase.client.from('invitations').select('*').order('created_at', { ascending: false });
  if (filters?.accepted === true) query = query.not('accepted_at', 'is', null);
  else if (filters?.accepted === false) query = query.is('accepted_at', null);

  const { data, error } = await query;
  if (error) { console.error('Error listing invitations:', error.message); return []; }
  return data ?? [];
}

export async function acceptInvitation(
  supabase: SupabaseService,
  token: string,
  userData: { password: string; name?: string; phone?: string }
): Promise<{ success: boolean; user_id?: string; error?: string }> {
  const inv = await getInvitationByToken(supabase, token);
  if (!inv) return { success: false, error: 'Invitation not found' };
  if (inv.accepted_at) return { success: false, error: 'Invitation already accepted' };
  if (isExpired(inv)) return { success: false, error: 'Invitation expired' };

  // Create auth_user via SECURITY DEFINER function (bypasses RLS)
  const passwordHash = await hashPassword(userData.password);
  const { data: result, error: rpcErr } = await supabase.client.rpc('create_auth_user', {
    p_tenant_id: inv.tenant_id,
    p_email: inv.email,
    p_password_hash: passwordHash,
    p_role: inv.role || 'vendedor',
  });

  if (rpcErr) return { success: false, error: rpcErr.message };
  if (result?.error) return { success: false, error: result.error };

  // Create team_member so user appears in CRM (assignments, notifications, etc.)
  const memberName = userData.name || inv.email.split('@')[0];
  const memberPhone = userData.phone || '';
  const { error: tmErr } = await supabase.client
    .from('team_members')
    .insert({
      tenant_id: inv.tenant_id,
      name: memberName,
      phone: memberPhone,
      role: inv.role || 'vendedor',
      active: true,
    });
  if (tmErr) console.error('Error creating team_member on invitation accept:', tmErr.message);

  const { error: updateErr } = await supabase.client
    .from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
  if (updateErr) console.error('Error marking invitation accepted:', updateErr.message);

  return { success: true, user_id: result.user_id };
}

export async function revokeInvitation(supabase: SupabaseService, invitationId: string): Promise<boolean> {
  const { error } = await supabase.client.from('invitations').delete().eq('id', invitationId);
  if (error) { console.error('Error revoking invitation:', error.message); return false; }
  return true;
}

export async function resendInvitation(supabase: SupabaseService, invitationId: string): Promise<Invitation | null> {
  const { data: inv, error } = await supabase.client
    .from('invitations')
    .update({ token: crypto.randomUUID(), expires_at: expiresAt() })
    .eq('id', invitationId)
    .select()
    .single();
  if (error) { console.error('Error resending invitation:', error.message); return null; }
  return inv;
}
