/**
 * PROMOCIONES SERVICE - Stub para evitar errores de build
 */

import { SupabaseService } from './supabase';

export class PromocionesService {
  constructor(private supabase: SupabaseService) {}

  async getPromocionesActivas(limit = 10): Promise<any[]> {
    try {
      const { data } = await this.supabase.client
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      return data || [];
    } catch (e) {
      console.log('Error obteniendo promociones:', e);
      return [];
    }
  }
}
