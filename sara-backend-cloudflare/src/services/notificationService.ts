/**
 * NOTIFICATION SERVICE - Servicio de notificaciones
 */

import { SupabaseService } from './supabase';
import { MetaWhatsAppService } from './meta-whatsapp';
import { createTTSService } from './ttsService';
import { createTTSTrackingService } from './ttsTrackingService';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';

export class NotificationService {
  private openaiApiKey?: string;

  constructor(
    private supabase: SupabaseService,
    private meta: MetaWhatsAppService,
    openaiApiKey?: string
  ) {
    this.openaiApiKey = openaiApiKey;
  }

  async notificarVendedor(vendedorId: string, mensaje: string): Promise<boolean> {
    try {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('id', vendedorId)
        .single();

      if (vendedor?.phone) {
        await enviarMensajeTeamMember(this.supabase, this.meta, vendedor, mensaje, {
          tipoMensaje: 'notificacion',
          guardarPending: true
        });
        console.log(`📤 Notificación enviada a ${vendedor.name} (via enviarMensajeTeamMember)`);
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
      await this.meta.sendWhatsAppMessage('5610016226', mensaje, true);
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
        .select('id, lead_id, lead_name, lead_phone, scheduled_date, scheduled_time, property_name, reminder_24h_sent, reminder_vendor_24h_sent, vendedor_id, appointment_type')
        .gte('scheduled_date', hoyStr)
        .lte('scheduled_date', en24hStr)
        .eq('status', 'scheduled');

      // Hora actual en México
      const ahoraMexico24h = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));

      // Filtrar en JS:
      // 1. NO tiene reminder_24h_sent
      // 2. La cita está en el FUTURO
      // 3. La cita está entre 20h y 28h desde ahora (ventana amplia para 24h)
      const citas24h = (allCitas24h || []).filter(c => {
        if (c.reminder_24h_sent === true) return false;

        // Construir fecha+hora de la cita
        const citaDateTime = new Date(`${c.scheduled_date}T${c.scheduled_time || '12:00:00'}`);

        // Verificar que la cita está en el futuro
        if (citaDateTime <= ahoraMexico24h) {
          console.log(`⏭️ Cita 24h ${c.lead_name} ${c.scheduled_date} ya pasó - ignorando`);
          return false;
        }

        // Verificar que está entre 20h y 28h desde ahora
        const en20h = new Date(ahoraMexico24h.getTime() + 20 * 60 * 60 * 1000);
        const en28h = new Date(ahoraMexico24h.getTime() + 28 * 60 * 60 * 1000);
        const dentroDeVentana = citaDateTime >= en20h && citaDateTime <= en28h;

        return dentroDeVentana;
      });

      console.log(`📅 DEBUG: Total citas en rango: ${allCitas24h?.length || 0}, en ventana 24h: ${citas24h.length}, error: ${error24h?.message || 'ninguno'}`);
      if (citas24h.length) {
        console.log(`📅 DEBUG citas24h:`, citas24h.map(c => ({ id: c.id?.slice(0,8), lead: c.lead_name, phone: c.lead_phone?.slice(-4), fecha: c.scheduled_date, hora: c.scheduled_time })));
      }

      for (const cita of citas24h || []) {
        if (cita.lead_phone) {
          try {
            // ⚡ MARK-BEFORE-SEND: Marcar ANTES de enviar para evitar duplicados por race condition del CRON cada 2 min
            await this.supabase.client
              .from('appointments')
              .update({ reminder_24h_sent: true })
              .eq('id', cita.id);

            const nombreCorto = cita.lead_name?.split(' ')[0] || 'Hola';
            const desarrollo = cita.property_name || 'nuestro desarrollo';
            const horaFormateada = (cita.scheduled_time || '').substring(0, 5);
            const esLlamada = (cita as any).appointment_type === 'llamada';
            const mensaje = esLlamada
              ? `📞 ¡Hola ${nombreCorto}! Te recordamos tu llamada mañana a las ${horaFormateada}. Te contactaremos para platicar sobre ${desarrollo}. 🏠`
              : `📅 ¡Hola ${nombreCorto}! Te recordamos tu cita mañana a las ${horaFormateada}. 🏠 ${desarrollo}. ¡Te esperamos!`;
            await this.meta.sendWhatsAppMessage(
              cita.lead_phone,
              mensaje
            );

            // ═══ TTS: Enviar audio del recordatorio ═══
            if (this.openaiApiKey) {
              try {
                const tts = createTTSService(this.openaiApiKey);
                const textoAudio = esLlamada
                  ? `Hola ${nombreCorto}. Te recordamos tu llamada mañana a las ${horaFormateada}. Te contactaremos para platicar sobre ${desarrollo}.`
                  : `Hola ${nombreCorto}. Te recordamos tu cita mañana a las ${horaFormateada} en ${desarrollo}. ¡Te esperamos!`;
                const audioResult = await tts.generateAudio(textoAudio);
                if (audioResult.success && audioResult.audioBuffer) {
                  const sendResult = await this.meta.sendVoiceMessage(cita.lead_phone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
                  console.log(`🔊 Audio recordatorio 24h enviado a ${cita.lead_name}`);

                  // 🔊 TTS Tracking
                  const messageId = sendResult?.messages?.[0]?.id;
                  if (messageId) {
                    try {
                      const ttsTracking = createTTSTrackingService(this.supabase);
                      await ttsTracking.logTTSSent({
                        messageId,
                        recipientPhone: cita.lead_phone,
                        recipientType: 'lead',
                        recipientId: cita.lead_id,
                        recipientName: cita.lead_name,
                        ttsType: 'recordatorio_cita_24h',
                        textoOriginal: textoAudio,
                        audioBytes: audioResult.audioBuffer.byteLength,
                        duracionEstimada: audioResult.duration
                      });
                    } catch (trackErr) {
                      // No crítico
                    }
                  }
                }
              } catch (ttsErr) {
                console.log(`⚠️ TTS recordatorio 24h falló (no crítico):`, ttsErr);
              }
            }

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

      // ═══════════════════════════════════════════════════════════════════════
      // RECORDATORIO 24H AL VENDEDOR
      // ═══════════════════════════════════════════════════════════════════════
      const citasVendedor24h = (allCitas24h || []).filter(c => {
        if (c.reminder_vendor_24h_sent === true) return false;
        if (!(c as any).vendedor_id) return false;
        // Misma ventana temporal que el lead (20h-28h)
        const citaDateTime = new Date(`${c.scheduled_date}T${c.scheduled_time || '12:00:00'}`);
        if (citaDateTime <= ahoraMexico24h) return false;
        const en20h = new Date(ahoraMexico24h.getTime() + 20 * 60 * 60 * 1000);
        const en28h = new Date(ahoraMexico24h.getTime() + 28 * 60 * 60 * 1000);
        return citaDateTime >= en20h && citaDateTime <= en28h;
      });

      for (const cita of citasVendedor24h) {
        try {
          const { data: vendedor } = await this.supabase.client
            .from('team_members')
            .select('*')
            .eq('id', (cita as any).vendedor_id)
            .single();

          if (vendedor?.phone) {
            // ⚡ MARK-BEFORE-SEND: Evitar duplicados por race condition
            await this.supabase.client
              .from('appointments')
              .update({ reminder_vendor_24h_sent: true })
              .eq('id', cita.id);

            const nombreLead = cita.lead_name || 'Cliente';
            const desarrollo = cita.property_name || 'oficina';
            const hora = (cita.scheduled_time || '').substring(0, 5);
            const telefonoLead = cita.lead_phone || 'No disponible';
            const esLlamada = (cita as any).appointment_type === 'llamada';

            const mensaje = esLlamada
              ? `📞 *RECORDATORIO - LLAMADA MAÑANA*\n\n` +
                `👤 *Lead:* ${nombreLead}\n` +
                `📱 *Tel:* ${telefonoLead}\n` +
                `🏠 *Tema:* ${desarrollo}\n` +
                `🕐 *Hora:* ${hora}\n\n` +
                `💡 Prepara la info del desarrollo para la llamada.`
              : `📅 *RECORDATORIO - CITA MAÑANA*\n\n` +
                `👤 *Lead:* ${nombreLead}\n` +
                `📱 *Tel:* ${telefonoLead}\n` +
                `🏠 *Lugar:* ${desarrollo}\n` +
                `🕐 *Hora:* ${hora}\n\n` +
                `💡 Confirma con el cliente que asistirá.`;

            await enviarMensajeTeamMember(this.supabase, this.meta, vendedor, mensaje, {
              tipoMensaje: 'recordatorio_cita',
              guardarPending: true,
              pendingKey: 'pending_mensaje'
            });

            enviados++;
            console.log(`👔 Recordatorio 24h enviado a vendedor ${vendedor.name} para cita con ${nombreLead}`);
          }
        } catch (e) {
          errores++;
          console.error(`❌ Error enviando recordatorio 24h a vendedor:`, e);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RECORDATORIO 24H AL ASESOR HIPOTECARIO (para citas de crédito)
      // ═══════════════════════════════════════════════════════════════════════
      const citasCredito24h = (allCitas24h || []).filter(c => {
        if (c.reminder_vendor_24h_sent === true) return false; // reusa flag para no duplicar
        if ((c as any).appointment_type !== 'mortgage_consultation') return false;
        const citaDateTime = new Date(`${c.scheduled_date}T${c.scheduled_time || '12:00:00'}`);
        if (citaDateTime <= ahoraMexico24h) return false;
        const en20h = new Date(ahoraMexico24h.getTime() + 20 * 60 * 60 * 1000);
        const en28h = new Date(ahoraMexico24h.getTime() + 28 * 60 * 60 * 1000);
        return citaDateTime >= en20h && citaDateTime <= en28h;
      });

      for (const cita of citasCredito24h) {
        try {
          // Buscar el asesor asignado al lead (assigned_to apunta al asesor en crédito)
          const { data: leadCredito } = await this.supabase.client
            .from('leads').select('assigned_to').eq('id', cita.lead_id).single();
          if (leadCredito?.assigned_to && leadCredito.assigned_to !== (cita as any).vendedor_id) {
            const { data: asesorHip } = await this.supabase.client
              .from('team_members').select('*').eq('id', leadCredito.assigned_to).single();
            if (asesorHip?.phone) {
              const nombreLead = cita.lead_name || 'Cliente';
              const hora = (cita.scheduled_time || '').substring(0, 5);
              const mensaje = `🏦 *RECORDATORIO - CITA CRÉDITO MAÑANA*\n\n` +
                `👤 *Lead:* ${nombreLead}\n` +
                `📱 *Tel:* ${cita.lead_phone || 'No disponible'}\n` +
                `🏠 *Lugar:* ${cita.property_name || 'oficina'}\n` +
                `🕐 *Hora:* ${hora}\n\n` +
                `💡 Coordina con el vendedor asignado para la visita.`;
              await enviarMensajeTeamMember(this.supabase, this.meta, asesorHip, mensaje, {
                tipoMensaje: 'recordatorio_cita',
                guardarPending: true,
                pendingKey: 'pending_mensaje'
              });
              enviados++;
              console.log(`🏦 Recordatorio 24h enviado a asesor ${asesorHip.name} para cita crédito con ${nombreLead}`);
            }
          }
        } catch (e) {
          errores++;
          console.error(`❌ Error enviando recordatorio 24h a asesor:`, e);
        }
      }

      // Recordatorios 2h antes - buscar citas para hoy y mañana
      // Traer todas y filtrar en JS por hora exacta
      const { data: allCitas2h, error: error2h } = await this.supabase.client
        .from('appointments')
        .select('id, lead_id, lead_name, lead_phone, scheduled_date, scheduled_time, property_name, reminder_2h_sent, reminder_vendor_2h_sent, vendedor_id, appointment_type')
        .gte('scheduled_date', hoyStr)
        .lte('scheduled_date', en2hStr)
        .eq('status', 'scheduled');

      // Hora actual en México para comparar con hora de cita
      const ahoraMexico = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const en2hMexico = new Date(ahoraMexico.getTime() + 2 * 60 * 60 * 1000);
      const en2h30Mexico = new Date(ahoraMexico.getTime() + 2.5 * 60 * 60 * 1000); // Ventana de 30 min

      // Filtrar en JS:
      // 1. NO tiene reminder_2h_sent
      // 2. La cita está en el FUTURO (no pasada)
      // 3. La cita está entre 1.5h y 2.5h desde ahora (ventana de 1 hora para el recordatorio)
      const citas2h = (allCitas2h || []).filter(c => {
        if (c.reminder_2h_sent === true) return false;

        // Construir fecha+hora de la cita
        const citaDateTime = new Date(`${c.scheduled_date}T${c.scheduled_time || '00:00:00'}`);

        // Verificar que la cita está en el futuro
        if (citaDateTime <= ahoraMexico) {
          console.log(`⏭️ Cita ${c.lead_name} ${c.scheduled_time} ya pasó - ignorando`);
          return false;
        }

        // Verificar que está entre 1.5h y 2.5h desde ahora
        const en1h30Mexico = new Date(ahoraMexico.getTime() + 1.5 * 60 * 60 * 1000);
        const dentroDeVentana = citaDateTime >= en1h30Mexico && citaDateTime <= en2h30Mexico;

        if (!dentroDeVentana) {
          console.log(`⏭️ Cita ${c.lead_name} ${c.scheduled_time} fuera de ventana 2h - ignorando`);
        }

        return dentroDeVentana;
      });

      console.log(`📅 DEBUG: Total citas 2h en rango: ${allCitas2h?.length || 0}, en ventana 2h: ${citas2h.length}, error: ${error2h?.message || 'ninguno'}`);

      for (const cita of citas2h || []) {
        if (cita.lead_phone) {
          try {
            // ⚡ MARK-BEFORE-SEND: Evitar duplicados por race condition
            await this.supabase.client
              .from('appointments')
              .update({ reminder_2h_sent: true })
              .eq('id', cita.id);

            const nombreCorto = cita.lead_name?.split(' ')[0] || 'Hola';
            const desarrollo = cita.property_name || 'nuestro desarrollo';
            const horaFormateada = (cita.scheduled_time || '').substring(0, 5);
            const esLlamada = (cita as any).appointment_type === 'llamada';
            const mensaje2h = esLlamada
              ? `📞 ¡${nombreCorto}, tu llamada es en 2 horas! Te contactaremos a las ${horaFormateada} para platicar sobre ${desarrollo}. 🏠`
              : `⏰ ¡${nombreCorto}, tu cita es en 2 horas! 🏠 ${desarrollo} a las ${horaFormateada}. ¡Te esperamos!`;
            await this.meta.sendWhatsAppMessage(
              cita.lead_phone,
              mensaje2h
            );

            // ═══ TTS: Enviar audio del recordatorio 2h ═══
            if (this.openaiApiKey) {
              try {
                const tts = createTTSService(this.openaiApiKey);
                const textoAudio = esLlamada
                  ? `${nombreCorto}, tu llamada es en 2 horas. Te contactaremos a las ${horaFormateada} para platicar sobre ${desarrollo}.`
                  : `${nombreCorto}, tu cita es en 2 horas en ${desarrollo}. ¡Te esperamos!`;
                const audioResult = await tts.generateAudio(textoAudio);
                if (audioResult.success && audioResult.audioBuffer) {
                  const sendResult = await this.meta.sendVoiceMessage(cita.lead_phone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
                  console.log(`🔊 Audio recordatorio 2h enviado a ${cita.lead_name}`);

                  // 🔊 TTS Tracking
                  const messageId = sendResult?.messages?.[0]?.id;
                  if (messageId) {
                    try {
                      const ttsTracking = createTTSTrackingService(this.supabase);
                      await ttsTracking.logTTSSent({
                        messageId,
                        recipientPhone: cita.lead_phone,
                        recipientType: 'lead',
                        recipientId: cita.lead_id,
                        recipientName: cita.lead_name,
                        ttsType: 'recordatorio_cita_2h',
                        textoOriginal: textoAudio,
                        audioBytes: audioResult.audioBuffer.byteLength,
                        duracionEstimada: audioResult.duration
                      });
                    } catch (trackErr) {
                      // No crítico
                    }
                  }
                }
              } catch (ttsErr) {
                console.log(`⚠️ TTS recordatorio 2h falló (no crítico):`, ttsErr);
              }
            }

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
      // Filtrar con misma ventana temporal que el lead (1.5h-2.5h)
      const citasVendedor2h = (allCitas2h || []).filter(c => {
        if (c.reminder_vendor_2h_sent === true) return false;
        if (!c.vendedor_id) return false;
        const citaDateTime = new Date(`${c.scheduled_date}T${c.scheduled_time || '00:00:00'}`);
        if (citaDateTime <= ahoraMexico) return false;
        const en1h30 = new Date(ahoraMexico.getTime() + 1.5 * 60 * 60 * 1000);
        return citaDateTime >= en1h30 && citaDateTime <= en2h30Mexico;
      });
      console.log(`👔 DEBUG: Citas para recordatorio vendedor 2h: ${citasVendedor2h.length}`);

      for (const cita of citasVendedor2h) {
        try {
          // Obtener datos del vendedor (select * para enviarMensajeTeamMember)
          const { data: vendedor } = await this.supabase.client
            .from('team_members')
            .select('*')
            .eq('id', cita.vendedor_id)
            .single();

          if (vendedor?.phone) {
            // ⚡ MARK-BEFORE-SEND: Evitar duplicados por race condition
            await this.supabase.client
              .from('appointments')
              .update({ reminder_vendor_2h_sent: true })
              .eq('id', cita.id);

            const nombreLead = cita.lead_name || 'Cliente';
            const desarrollo = cita.property_name || 'oficina';
            const hora = (cita.scheduled_time || '').substring(0, 5);
            const telefonoLead = cita.lead_phone || 'No disponible';
            const esLlamada = (cita as any).appointment_type === 'llamada';

            const mensaje = esLlamada
              ? `📞 *RECORDATORIO DE LLAMADA*\n\n` +
                `Tu llamada es en ~2 horas:\n\n` +
                `👤 *Lead:* ${nombreLead}\n` +
                `📱 *Tel:* ${telefonoLead}\n` +
                `🏠 *Tema:* ${desarrollo}\n` +
                `🕐 *Hora:* ${hora}\n\n` +
                `💡 Tip: Ten a la mano la info del desarrollo`
              : `⏰ *RECORDATORIO DE CITA*\n\n` +
                `Tu cita es en ~2 horas:\n\n` +
                `👤 *Lead:* ${nombreLead}\n` +
                `📱 *Tel:* ${telefonoLead}\n` +
                `🏠 *Lugar:* ${desarrollo}\n` +
                `🕐 *Hora:* ${hora}\n\n` +
                `💡 Tip: Confirma que el cliente viene en camino`;

            await enviarMensajeTeamMember(this.supabase, this.meta, vendedor, mensaje, {
              tipoMensaje: 'recordatorio_cita',
              guardarPending: true,
              pendingKey: 'pending_mensaje'
            });

            enviados++;
            console.log(`👔 Recordatorio 2h enviado a vendedor ${vendedor.name} para cita con ${nombreLead}`);
          }
        } catch (e) {
          errores++;
          console.error(`❌ Error enviando recordatorio 2h a vendedor:`, e);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RECORDATORIO 2H AL ASESOR HIPOTECARIO (para citas de crédito)
      // ═══════════════════════════════════════════════════════════════════════
      const citasCredito2h = (allCitas2h || []).filter(c => {
        if (c.reminder_vendor_2h_sent === true) return false;
        if (c.appointment_type !== 'mortgage_consultation') return false;
        const citaDateTime = new Date(`${c.scheduled_date}T${c.scheduled_time || '00:00:00'}`);
        if (citaDateTime <= ahoraMexico) return false;
        const en1h30 = new Date(ahoraMexico.getTime() + 1.5 * 60 * 60 * 1000);
        return citaDateTime >= en1h30 && citaDateTime <= en2h30Mexico;
      });

      for (const cita of citasCredito2h) {
        try {
          const { data: leadCredito } = await this.supabase.client
            .from('leads').select('assigned_to').eq('id', cita.lead_id).single();
          if (leadCredito?.assigned_to && leadCredito.assigned_to !== cita.vendedor_id) {
            const { data: asesorHip } = await this.supabase.client
              .from('team_members').select('*').eq('id', leadCredito.assigned_to).single();
            if (asesorHip?.phone) {
              const nombreLead = cita.lead_name || 'Cliente';
              const hora = (cita.scheduled_time || '').substring(0, 5);
              const mensaje = `🏦 *RECORDATORIO CITA CRÉDITO - 2 HORAS*\n\n` +
                `Tu cita es en ~2 horas:\n\n` +
                `👤 *Lead:* ${nombreLead}\n` +
                `📱 *Tel:* ${cita.lead_phone || 'No disponible'}\n` +
                `🏠 *Lugar:* ${cita.property_name || 'oficina'}\n` +
                `🕐 *Hora:* ${hora}\n\n` +
                `💡 Confirma con el cliente que asistirá.`;
              await enviarMensajeTeamMember(this.supabase, this.meta, asesorHip, mensaje, {
                tipoMensaje: 'recordatorio_cita',
                guardarPending: true,
                pendingKey: 'pending_mensaje'
              });
              enviados++;
              console.log(`🏦 Recordatorio 2h enviado a asesor ${asesorHip.name} para cita crédito con ${nombreLead}`);
            }
          }
        } catch (e) {
          errores++;
          console.error(`❌ Error enviando recordatorio 2h a asesor:`, e);
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
