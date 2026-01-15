/**
 * FOLLOWUP APPROVAL SERVICE - Aprobación de follow-ups
 */

import { SupabaseService } from './supabase';

export class FollowupApprovalService {
  constructor(private supabase: SupabaseService) {}

  async getPendingApprovals(): Promise<any[]> {
    try {
      const { data } = await this.supabase.client
        .from('followup_approvals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      return data || [];
    } catch (e) {
      console.log('Error obteniendo aprobaciones pendientes:', e);
      return [];
    }
  }

  async aprobar(approvalId: string): Promise<boolean> {
    try {
      await this.supabase.client
        .from('followup_approvals')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', approvalId);
      return true;
    } catch (e) {
      console.error('Error aprobando followup:', e);
      return false;
    }
  }

  async rechazar(approvalId: string, razon: string): Promise<boolean> {
    try {
      await this.supabase.client
        .from('followup_approvals')
        .update({ status: 'rejected', rejection_reason: razon })
        .eq('id', approvalId);
      return true;
    } catch (e) {
      console.error('Error rechazando followup:', e);
      return false;
    }
  }
}
