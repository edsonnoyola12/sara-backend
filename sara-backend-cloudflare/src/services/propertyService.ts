import { SupabaseService } from './supabase';

export class PropertyService {
  constructor(private supabase: SupabaseService) {}

  async getAllProperties(): Promise<any[]> {
    try {
      const { data } = await this.supabase.client
        .from('properties')
        .select('*')
        .eq('active', true)
        .order('name');
      return data || [];
    } catch (e) {
      console.error('Error getting properties:', e);
      return [];
    }
  }

  async getPropertyByName(name: string): Promise<any | null> {
    try {
      const { data } = await this.supabase.client
        .from('properties')
        .select('*')
        .ilike('name', `%${name}%`)
        .eq('active', true)
        .limit(1)
        .single();
      return data;
    } catch (e) {
      return null;
    }
  }

  async getPropertyById(id: string): Promise<any | null> {
    try {
      const { data } = await this.supabase.client
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();
      return data;
    } catch (e) {
      return null;
    }
  }
}
