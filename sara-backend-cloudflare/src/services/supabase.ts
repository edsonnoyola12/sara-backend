import { createClient } from '@supabase/supabase-js';
import { SANTA_RITA_TENANT_ID } from '../middleware/tenant';

export class SupabaseService {
  public client: any;
  private tenantId: string;
  private tenantSet: boolean = false;

  constructor(url: string, key: string, tenantId?: string) {
    this.client = createClient(url, key);
    this.tenantId = tenantId || SANTA_RITA_TENANT_ID;
  }

  /**
   * Set the tenant context via Postgres session variable.
   * Must be called once per request before any queries.
   * RLS policies use current_setting('app.current_tenant') to filter rows.
   */
  async setTenant(tenantId?: string): Promise<void> {
    if (tenantId) {
      this.tenantId = tenantId;
    }
    try {
      await this.client.rpc('set_tenant', { tid: this.tenantId });
      this.tenantSet = true;
    } catch (err: any) {
      // If set_tenant RPC doesn't exist yet (pre-migration), log and continue
      // This ensures backward compatibility during rollout
      console.warn('⚠️ set_tenant RPC not available (pre-migration?), continuing without RLS:', err?.message);
      this.tenantSet = false;
    }
  }

  getTenantId(): string {
    return this.tenantId;
  }

  async getLeadByPhone(phone: string) {
    const { data, error } = await this.client.from('leads').select('*').eq('phone', phone).single();
    if (error && error.code !== 'PGRST116') console.error('⚠️ getLeadByPhone error:', error.message);
    return data;
  }

  async createLead(lead: any) {
    console.log('📝 Creando lead:', lead);
    const { data, error } = await this.client.from('leads').insert([lead]).select().single();

    if (error) {
      console.error('❌ Error creando lead:', error);
      return null;
    }

    console.log('✅ Lead creado:', data);
    return data;
  }

  async updateLead(id: string, updates: any) {
    const { data: rows, error } = await this.client.from('leads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select();
    if (error) console.error('⚠️ Error updating lead:', error);
    return rows?.[0] || null;
  }

  async addConversationMessage(leadId: string, msg: any) {
    const lead = await this.getLeadById(leadId);
    if (!lead) return null;
    const history = lead.conversation_history || [];
    history.push({ ...msg, timestamp: new Date().toISOString() });
    return this.updateLead(leadId, { conversation_history: history });
  }

  async getLeadById(id: string) {
    const { data, error } = await this.client.from('leads').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') console.error('⚠️ getLeadById error:', error.message);
    return data;
  }

  async getTeamMemberByPhone(phone: string) {
    const { data, error } = await this.client.from('team_members').select('*').eq('phone', phone).single();
    if (error && error.code !== 'PGRST116') console.error('⚠️ getTeamMemberByPhone error:', error.message);
    return data;
  }
}
