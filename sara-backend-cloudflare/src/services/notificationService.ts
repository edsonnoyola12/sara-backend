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

  async enviarRecordatoriosCitas(): Promise<{ enviados: number; errores: number }> {
    let enviados = 0;
    let errores = 0;

    try {
      const now = new Date();
      const mexicoOffset = -6 * 60 * 60 * 1000;
      const mexicoNow = new Date(now.getTime() + mexicoOffset);

      // Recordatorios 24h antes
      const in24h = new Date(mexicoNow.getTime() + 24 * 60 * 60 * 1000);
      const in24hStart = new Date(in24h);
      in24hStart.setMinutes(in24hStart.getMinutes() - 30);
      const in24hEnd = new Date(in24h);
      in24hEnd.setMinutes(in24hEnd.getMinutes() + 30);

      const { data: citas24h } = await this.supabase.client
        .from('appointments')
        .select('*, leads(name, phone)')
        .gte('date', in24hStart.toISOString())
        .lte('date', in24hEnd.toISOString())
        .eq('status', 'scheduled')
        .eq('reminder_24h_sent', false);

      for (const cita of citas24h || []) {
        if (cita.leads?.phone) {
          try {
            await this.meta.sendWhatsAppMessage(
              cita.leads.phone,
              `📅 Hola ${cita.leads.name || ''}, te recordamos tu cita mañana. ¡Te esperamos!`
            );
            await this.supabase.client
              .from('appointments')
              .update({ reminder_24h_sent: true })
              .eq('id', cita.id);
            enviados++;
          } catch (e) {
            errores++;
          }
        }
      }

      // Recordatorios 2h antes
      const in2h = new Date(mexicoNow.getTime() + 2 * 60 * 60 * 1000);
      const in2hStart = new Date(in2h);
      in2hStart.setMinutes(in2hStart.getMinutes() - 15);
      const in2hEnd = new Date(in2h);
      in2hEnd.setMinutes(in2hEnd.getMinutes() + 15);

      const { data: citas2h } = await this.supabase.client
        .from('appointments')
        .select('*, leads(name, phone)')
        .gte('date', in2hStart.toISOString())
        .lte('date', in2hEnd.toISOString())
        .eq('status', 'scheduled')
        .eq('reminder_2h_sent', false);

      for (const cita of citas2h || []) {
        if (cita.leads?.phone) {
          try {
            await this.meta.sendWhatsAppMessage(
              cita.leads.phone,
              `⏰ ${cita.leads.name || ''}, tu cita es en 2 horas. ¡Te esperamos!`
            );
            await this.supabase.client
              .from('appointments')
              .update({ reminder_2h_sent: true })
              .eq('id', cita.id);
            enviados++;
          } catch (e) {
            errores++;
          }
        }
      }

      console.log(`📅 Recordatorios: ${enviados} enviados, ${errores} errores`);
    } catch (e) {
      console.error('Error en enviarRecordatoriosCitas:', e);
    }

    return { enviados, errores };
  }

  async enviarEncuestasPostCita(): Promise<{ enviados: number; errores: number }> {
    // Stub - las encuestas se manejan en otra parte del código
    return { enviados: 0, errores: 0 };
  }

  async enviarFollowupPostCita(): Promise<{ enviados: number; errores: number }> {
    // Stub - los followups se manejan en otra parte del código
    return { enviados: 0, errores: 0 };
  }
}
