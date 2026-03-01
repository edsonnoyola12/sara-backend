import { SupabaseService } from './supabase';

export class InventoryService {
  private supabase: SupabaseService;

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
  }

  async getAvailableProperties(development?: string, maxPrice?: number): Promise<any[]> {
    let query = this.supabase.client
      .from('properties')
      .select('*');

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
      .limit(1)
      .single();

    return data;
  }

  formatPropertyInfo(property: any): string {
    const nombre = property.name || property.model || 'Casa';
    const dev = property.development || property.development_name || '';
    const precio = property.price_equipped || property.price || 0;
    const precioStr = precio > 0 ? `$${(precio / 1000000).toFixed(2)}M equipada` : '';
    const rec = property.bedrooms ? `${property.bedrooms} recámaras` : '';
    const banos = property.bathrooms ? `${property.bathrooms} baños` : '';
    const area = property.area_m2 || property.construction_size || 0;
    const areaStr = area ? `${area}m²` : '';
    const specs = [rec, banos, areaStr].filter(Boolean).join(' | ');
    return `🏠 *${nombre}*${dev ? `\n📍 ${dev}` : ''}${specs ? `\n${specs}` : ''}${precioStr ? `\n💰 ${precioStr}` : ''}`;
  }

  static formatPropertyCard(property: any): string {
    const nombre = property.name || property.model || 'Casa';
    const dev = property.development || property.development_name || '';
    const precio = property.price_equipped || property.price || 0;
    const precioStr = precio > 0 ? `$${(precio / 1000000).toFixed(2)}M equipada` : '';
    const rec = property.bedrooms ? `${property.bedrooms} recámaras` : '';
    const banos = property.bathrooms ? `${property.bathrooms} baños` : '';
    const area = property.area_m2 || property.construction_size || 0;
    const areaStr = area ? `${area}m²` : '';
    const specs = [rec, banos, areaStr].filter(Boolean).join(' | ');
    return `🏠 *${nombre}*${dev ? `\n📍 ${dev}` : ''}${specs ? `\n${specs}` : ''}${precioStr ? `\n💰 ${precioStr}` : ''}`;
  }
}
