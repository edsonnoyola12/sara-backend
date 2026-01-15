import { SupabaseService } from './supabase';
export class LeadManagementService {
  constructor(private supabase: SupabaseService) {}
  async getOrCreateLead(phone: string): Promise<any> {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const { data } = await this.supabase.client
      .from('leads')
      .select('*')
      .like('phone', '%' + digits)
      .limit(1);
    if (data && data.length > 0) return data[0];
    const { data: newLead } = await this.supabase.client
      .from('leads')
      .insert({ phone, status: 'new', score: 0 })
      .select()
      .single();
    return newLead;
  }
}
