import { createClient } from '@supabase/supabase-js';

export class SupabaseService {
  public client: any;

  constructor(url: string, key: string) {
    this.client = createClient(url, key);
  }

  async getLeadByPhone(phone: string) {
    const { data } = await this.client.from('leads').select('*').eq('phone', phone).single();
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
    const { data } = await this.client.from('leads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    return data;
  }

  async addConversationMessage(leadId: string, msg: any) {
    const lead = await this.getLeadById(leadId);
    if (!lead) return null;
    const history = lead.conversation_history || [];
    history.push({ ...msg, timestamp: new Date().toISOString() });
    return this.updateLead(leadId, { conversation_history: history });
  }

  async getLeadById(id: string) {
    const { data } = await this.client.from('leads').select('*').eq('id', id).single();
    return data;
  }

  async getTeamMemberByPhone(phone: string) {
    const { data } = await this.client.from('team_members').select('*').eq('phone', phone).single();
    return data;
  }
}
