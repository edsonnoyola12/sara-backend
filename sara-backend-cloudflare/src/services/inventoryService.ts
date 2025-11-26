import { SupabaseService } from './supabase';

export class InventoryService {
  private supabase: SupabaseService;

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
  }

  async getAvailableProperties(development?: string, maxPrice?: number): Promise<any[]> {
    let query = this.supabase.client
      .from('properties')
      .select('*')
      .eq('status', 'available');

    if (development) {
      query = query.ilike('development', `%${development}%`);
    }

    if (maxPrice) {
      query = query.lte('price', maxPrice);
    }

    const { data, error } = await query.order('price', { ascending: true });

    if (error) {
      console.error('❌ Error fetching properties:', error);
      return [];
    }

    return data || [];
  }

  async getPropertyByModel(development: string, model: string): Promise<any> {
    const { data } = await this.supabase.client
      .from('properties')
      .select('*')
      .ilike('development', `%${development}%`)
      .ilike('model', `%${model}%`)
      .eq('status', 'available')
      .limit(1)
      .single();

    return data;
  }

  formatPropertyInfo(property: any): string {
    return `🏠 *${property.name}*
📍 ${property.development} - Modelo ${property.model}
🛏️ ${property.bedrooms} recámaras | 🚿 ${property.bathrooms} baños
📐 ${property.size_m2}m²
💰 $${(property.price / 1000000).toFixed(1)}M`;
  }
}
