import { SupabaseService } from './supabase';

// ID del vendedor por defecto para nuevos leads (CEO Test para simulaciones)
const DEFAULT_VENDEDOR_ID = '7bb05214-826c-4d1b-a418-228b8d77bd64'; // CEO Test

export class LeadManagementService {
  constructor(private supabase: SupabaseService) {}

  async getOrCreateLead(phone: string): Promise<{ lead: any; isNew: boolean }> {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const { data } = await this.supabase.client
      .from('leads')
      .select('*')
      .like('phone', '%' + digits)
      .limit(1);
    if (data && data.length > 0) return { lead: data[0], isNew: false };

    // Crear nuevo lead asignado al vendedor por defecto
    console.log('📝 Creando nuevo lead asignado a CEO Test');
    const { data: newLead } = await this.supabase.client
      .from('leads')
      .insert({
        phone,
        status: 'new',
        score: 0,
        assigned_to: DEFAULT_VENDEDOR_ID
      })
      .select()
      .single();
    return { lead: newLead, isNew: true };
  }
}
