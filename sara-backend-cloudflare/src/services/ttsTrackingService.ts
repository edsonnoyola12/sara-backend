/**
 * TTS Tracking Service - Seguimiento de audios TTS enviados y escuchados
 */

import { SupabaseService } from './supabase';

export type TTSType = 'respuesta_larga' | 'recordatorio_cita_24h' | 'recordatorio_cita_2h' | 'alerta_lead' | 'briefing' | 'test' | 'manual';
export type RecipientType = 'lead' | 'team_member';

export interface TTSMessageData {
  messageId: string;
  recipientPhone: string;
  recipientType: RecipientType;
  recipientId?: string;
  recipientName?: string;
  ttsType: TTSType;
  textoOriginal?: string;
  audioBytes?: number;
  duracionEstimada?: number;
}

export interface TTSMetrics {
  ttsType: string;
  totalEnviados: number;
  totalEntregados: number;
  totalEscuchados: number;
  totalFallidos: number;
  tasaEscuchaPct: number;
}

export class TTSTrackingService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Registra un mensaje TTS enviado
   */
  async logTTSSent(data: TTSMessageData): Promise<boolean> {
    try {
      const { error } = await this.supabase.client
        .from('tts_messages')
        .insert({
          message_id: data.messageId,
          recipient_phone: data.recipientPhone,
          recipient_type: data.recipientType,
          recipient_id: data.recipientId,
          recipient_name: data.recipientName,
          tts_type: data.ttsType,
          texto_original: data.textoOriginal?.substring(0, 500),
          audio_bytes: data.audioBytes,
          duracion_estimada: data.duracionEstimada,
          status: 'sent',
          sent_at: new Date().toISOString()
        });

      if (error) {
        // Si la tabla no existe, solo logueamos
        if (error.code === '42P01') {
          console.log(`📊 TTS Tracking: tabla no existe, solo log`);
          return false;
        }
        console.error('Error logging TTS sent:', error);
        return false;
      }

      console.log(`📊 TTS registrado: ${data.ttsType} → ${data.recipientName || data.recipientPhone}`);
      return true;
    } catch (e) {
      console.error('Error en logTTSSent:', e);
      return false;
    }
  }

  /**
   * Actualiza el estado de un mensaje TTS (llamado desde el webhook de status)
   */
  async updateTTSStatus(messageId: string, status: 'delivered' | 'read' | 'failed', errorMessage?: string): Promise<boolean> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'delivered') {
        updateData.delivered_at = new Date().toISOString();
      } else if (status === 'read') {
        updateData.played_at = new Date().toISOString();
      } else if (status === 'failed') {
        updateData.failed_at = new Date().toISOString();
        updateData.error_message = errorMessage;
      }

      const { error, data } = await this.supabase.client
        .from('tts_messages')
        .update(updateData)
        .eq('message_id', messageId)
        .select('recipient_name, tts_type');

      if (error) {
        if (error.code === '42P01') return false; // Tabla no existe
        console.error('Error updating TTS status:', error);
        return false;
      }

      if (data && data.length > 0) {
        const emoji = status === 'read' ? '🎧' : status === 'delivered' ? '✓✓' : '❌';
        console.log(`${emoji} TTS ${status}: ${data[0].tts_type} → ${data[0].recipient_name}`);
        return true;
      }

      return false; // No era un mensaje TTS
    } catch (e) {
      console.error('Error en updateTTSStatus:', e);
      return false;
    }
  }

  /**
   * Obtiene métricas de TTS de los últimos N días
   */
  async getMetrics(days: number = 30): Promise<TTSMetrics[]> {
    try {
      const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabase.client
        .from('tts_messages')
        .select('tts_type, status, played_at')
        .gte('sent_at', desde);

      if (error) {
        if (error.code === '42P01') return []; // Tabla no existe
        console.error('Error getting TTS metrics:', error);
        return [];
      }

      // Agrupar por tipo
      const grouped: Record<string, { sent: number; delivered: number; played: number; failed: number }> = {};

      for (const msg of data || []) {
        if (!grouped[msg.tts_type]) {
          grouped[msg.tts_type] = { sent: 0, delivered: 0, played: 0, failed: 0 };
        }

        grouped[msg.tts_type].sent++;

        if (msg.status === 'delivered' || msg.status === 'read') {
          grouped[msg.tts_type].delivered++;
        }

        if (msg.status === 'read' || msg.played_at) {
          grouped[msg.tts_type].played++;
        }

        if (msg.status === 'failed') {
          grouped[msg.tts_type].failed++;
        }
      }

      // Convertir a array con métricas
      return Object.entries(grouped).map(([tipo, stats]) => ({
        ttsType: tipo,
        totalEnviados: stats.sent,
        totalEntregados: stats.delivered,
        totalEscuchados: stats.played,
        totalFallidos: stats.failed,
        tasaEscuchaPct: stats.delivered > 0 ? Math.round(stats.played / stats.delivered * 100) : 0
      }));
    } catch (e) {
      console.error('Error en getMetrics:', e);
      return [];
    }
  }

  /**
   * Obtiene los últimos N mensajes TTS
   */
  async getRecentMessages(limit: number = 20): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.client
        .from('tts_messages')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.code === '42P01') return [];
        console.error('Error getting recent TTS:', error);
        return [];
      }

      return data || [];
    } catch (e) {
      console.error('Error en getRecentMessages:', e);
      return [];
    }
  }
}

/**
 * Factory function para crear el servicio
 */
export function createTTSTrackingService(supabase: SupabaseService): TTSTrackingService {
  return new TTSTrackingService(supabase);
}
