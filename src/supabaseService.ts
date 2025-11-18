import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export const supabaseService = {
  supabase,

  async createLead(leadData: { name: string; phone: string; property_interest?: string; budget?: number }) {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        name: leadData.name,
        phone: leadData.phone,
        property_interest: leadData.property_interest,
        budget: leadData.budget,
        status: 'New',
        source: 'whatsapp'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating lead:', error);
      return null;
    }

    return data;
  },

  async getLeadByPhone(phone: string) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error) {
      console.log('Lead not found:', phone);
      return null;
    }

    return data;
  },

  async getLeadByName(name: string) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(5);
    
    if (error) throw error;
    return data;
  },

  async updateLeadStatus(leadId: string, status: string) {
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    
    if (error) throw error;
  },

  async updateLeadScore(leadId: string, score: number, category: string) {
    const { error } = await supabase
      .from('leads')
      .update({ 
        lead_score: score,
        lead_category: category,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) throw error;
  },

  async saveMessage(messageData: { lead_id: string; content: string; sender: string }) {
    const { error } = await supabase
      .from('messages')
      .insert(messageData);

    if (error) {
      console.error('Error saving message:', error);
    }
  },

  async getConversationHistory(leadId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }

    return data || [];
  },

  async addNoteToLead(leadId: string, note: string, teamMemberPhone: string) {
    const { data: member } = await supabase
      .from('team_members')
      .select('id')
      .eq('phone', teamMemberPhone)
      .single();

    if (member) {
      const { error } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: leadId,
          team_member_id: member.id,
          note
        });
      
      if (error) throw error;
    }
  }
};
