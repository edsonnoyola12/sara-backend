/**
 * NOTIFICATION SERVICE - Servicio de notificaciones
 */

import { SupabaseService } from './supabase';
import { MetaWhatsAppService } from './meta-whatsapp';

export class NotificationService {
  constructor(
    private supabase: SupabaseService,
    private meta: MetaWhatsAppService
  ) {}

  async notificarVendedor(vendedorId: string, mensaje: string): Promise<boolean> {
    try {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('phone, name')
        .eq('id', vendedorId)
        .single();

      if (vendedor?.phone) {
        await this.meta.sendWhatsAppMessage(vendedor.phone, mensaje);
        console.log(`📤 Notificación enviada a ${vendedor.name}`);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Error notificando vendedor:', e);
      return false;
    }
  }

  async notificarAdmin(mensaje: string): Promise<boolean> {
    try {
      await this.meta.sendWhatsAppMessage('5212224558475', mensaje, true);
      return true;
    } catch (e) {
      console.error('Error notificando admin:', e);
      return false;
    }
  }
}
