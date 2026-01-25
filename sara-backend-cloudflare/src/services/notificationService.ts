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
      const ahora = new Date();
      const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
      const en2h = new Date(ahora.getTime() + 2 * 60 * 60 * 1000);

      // Usar timezone México para las fechas
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const hoyStr = mexicoFormatter.format(ahora);
      const en24hStr = mexicoFormatter.format(en24h);
      const en2hStr = mexicoFormatter.format(en2h);

      console.log(`📅 DEBUG Recordatorios: hoy=${hoyStr}, en24h=${en24hStr}, en2h=${en2hStr}`);

      // Recordatorios 24h antes - buscar citas para mañana
      // Traer todas y filtrar en JS (porque .or() con filtros previos no funciona bien)
      const { data: allCitas24h, error: error24h } = await this.supabase.client
        .from('appointments')
        .select('id, lead_id, lead_name, lead_phone, scheduled_date, scheduled_time, property_name, reminder_24h_sent')
        .gte('scheduled_date', hoyStr)
        .lte('scheduled_date', en24hStr)
        .eq('status', 'scheduled');

      // Filtrar en JS: solo las que NO tienen reminder_24h_sent = true
      const citas24h = allCitas24h?.filter(c => c.reminder_24h_sent !== true) || [];

      console.log(`📅 DEBUG: Total citas en rango: ${allCitas24h?.length || 0}, sin recordatorio: ${citas24h.length}, error: ${error24h?.message || 'ninguno'}`);
      if (citas24h.length) {
        console.log(`📅 DEBUG citas24h:`, citas24h.map(c => ({ id: c.id?.slice(0,8), lead: c.lead_name, phone: c.lead_phone?.slice(-4), fecha: c.scheduled_date, hora: c.scheduled_time })));
      }

      for (const cita of citas24h || []) {
        if (cita.lead_phone) {
          try {
            const nombreCorto = cita.lead_name?.split(' ')[0] || 'Hola';
            const desarrollo = cita.property_name || 'nuestro desarrollo';
            await this.meta.sendWhatsAppMessage(
              cita.lead_phone,
              `📅 ¡Hola ${nombreCorto}! Te recordamos tu cita mañana a las ${(cita.scheduled_time || '').substring(0, 5)}. 🏠 ${desarrollo}. ¡Te esperamos!`
            );
            await this.supabase.client
              .from('appointments')
              .update({ reminder_24h_sent: true })
              .eq('id', cita.id);
            enviados++;
            console.log(`📅 Recordatorio 24h enviado a ${cita.lead_name}`);
          } catch (e) {
            errores++;
            console.error(`❌ Error enviando recordatorio 24h:`, e);
          }
        } else {
          console.error(`⚠️ Cita ${cita.id?.slice(0,8)} sin teléfono de lead`);
        }
      }

      // Recordatorios 2h antes - buscar citas para hoy
      // Traer todas y filtrar en JS
      const { data: allCitas2h, error: error2h } = await this.supabase.client
        .from('appointments')
        .select('id, lead_id, lead_name, lead_phone, scheduled_date, scheduled_time, property_name, reminder_2h_sent, reminder_vendor_2h_sent, vendedor_id')
        .gte('scheduled_date', hoyStr)
        .lte('scheduled_date', en2hStr)
        .eq('status', 'scheduled');

      // Filtrar en JS: solo las que NO tienen reminder_2h_sent = true
      const citas2h = allCitas2h?.filter(c => c.reminder_2h_sent !== true) || [];

      console.log(`📅 DEBUG: Total citas 2h en rango: ${allCitas2h?.length || 0}, sin recordatorio: ${citas2h.length}, error: ${error2h?.message || 'ninguno'}`);

      for (const cita of citas2h || []) {
        if (cita.lead_phone) {
          try {
            const nombreCorto = cita.lead_name?.split(' ')[0] || 'Hola';
            const desarrollo = cita.property_name || 'nuestro desarrollo';
            await this.meta.sendWhatsAppMessage(
              cita.lead_phone,
              `⏰ ¡${nombreCorto}, tu cita es en 2 horas! 🏠 ${desarrollo} a las ${cita.scheduled_time || ''}. ¡Te esperamos!`
            );
            await this.supabase.client
              .from('appointments')
              .update({ reminder_2h_sent: true })
              .eq('id', cita.id);
            enviados++;
            console.log(`📅 Recordatorio 2h enviado a ${cita.lead_name}`);
          } catch (e) {
            errores++;
            console.error(`❌ Error enviando recordatorio 2h:`, e);
          }
        } else {
          console.error(`⚠️ Cita ${cita.id?.slice(0,8)} sin teléfono de lead`);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RECORDATORIO 2H AL VENDEDOR (NUEVO)
      // ═══════════════════════════════════════════════════════════════════════
      const citasVendedor2h = allCitas2h?.filter(c => c.reminder_vendor_2h_sent !== true && c.vendedor_id) || [];
      console.log(`👔 DEBUG: Citas para recordatorio vendedor: ${citasVendedor2h.length}`);

      for (const cita of citasVendedor2h) {
        try {
          // Obtener datos del vendedor
          const { data: vendedor } = await this.supabase.client
            .from('team_members')
            .select('id, name, phone')
            .eq('id', cita.vendedor_id)
            .single();

          if (vendedor?.phone) {
            const nombreLead = cita.lead_name || 'Cliente';
            const desarrollo = cita.property_name || 'oficina';
            const hora = (cita.scheduled_time || '').substring(0, 5);
            const telefonoLead = cita.lead_phone || 'No disponible';

            const mensaje = `⏰ *RECORDATORIO DE CITA*\n\n` +
              `Tu cita es en ~2 horas:\n\n` +
              `👤 *Lead:* ${nombreLead}\n` +
              `📱 *Tel:* ${telefonoLead}\n` +
              `🏠 *Lugar:* ${desarrollo}\n` +
              `🕐 *Hora:* ${hora}\n\n` +
              `💡 Tip: Confirma que el cliente viene en camino`;

            await this.meta.sendWhatsAppMessage(vendedor.phone, mensaje);

            // Marcar como enviado
            await this.supabase.client
              .from('appointments')
              .update({ reminder_vendor_2h_sent: true })
              .eq('id', cita.id);

            enviados++;
            console.log(`👔 Recordatorio 2h enviado a vendedor ${vendedor.name} para cita con ${nombreLead}`);
          }
        } catch (e) {
          errores++;
          console.error(`❌ Error enviando recordatorio 2h a vendedor:`, e);
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
