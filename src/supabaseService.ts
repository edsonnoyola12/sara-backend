import { createClient } from '@supabase/supabase-js';
import type { Lead, Message } from './types.js';

class SupabaseService {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_KEY!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // ===== LEADS =====
  async getLeadByPhone(phone: string): Promise<Lead | null> {
    const { data, error } = await this.supabase
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error) {
      console.log('Lead not found:', phone);
      return null;
    }
    return data;
  }

  async createLead(leadData: Partial<Lead>): Promise<Lead | null> {
    const { data, error } = await this.supabase
      .from('leads')
      .insert({
        ...leadData,
        status: 'New',
        urgency: 'medium',
        source: 'whatsapp',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating lead:', error);
      return null;
    }
    return data;
  }

  async updateLeadStatus(leadId: string, status: Lead['status']): Promise<boolean> {
    const { error } = await this.supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (error) {
      console.error('Error updating lead status:', error);
      return false;
    }
    return true;
  }

  // ===== MESSAGES =====
  async saveMessage(messageData: Partial<Message>): Promise<Message | null> {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        ...messageData,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving message:', error);
      return null;
    }
    return data;
  }

  async getConversationHistory(leadId: string, limit: number = 20): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching conversation:', error);
      return [];
    }
    return data.reverse();
  }
}

export const supabaseService = new SupabaseService();
