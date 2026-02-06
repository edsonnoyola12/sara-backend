/**
 * Message Tracking Service - Seguimiento de TODOS los mensajes enviados
 */

import { SupabaseService } from './supabase';

export type MessageType = 'text' | 'audio' | 'image' | 'video' | 'document' | 'template' | 'buttons' | 'list';
export type RecipientType = 'lead' | 'team_member';

export interface MessageData {
  messageId: string;
  recipientPhone: string;
  recipientType: RecipientType;
  recipientId?: string;
  recipientName?: string;
  messageType: MessageType;
  categoria?: string;  // 'respuesta_sara', 'recordatorio', 'alerta', 'broadcast', 'bridge', etc.
  contenido?: string;  // Preview del mensaje (primeros 200 chars)
}

export interface MessageMetrics {
  messageType: string;
  categoria: string;
  totalEnviados: number;
  totalEntregados: number;
  totalLeidos: number;
  totalFallidos: number;
  tasaLecturaPct: number;
}

export class MessageTrackingService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Registra un mensaje enviado
   */
  async logMessageSent(data: MessageData): Promise<boolean> {
    try {
      const { error } = await this.supabase.client
        .from('messages_sent')
        .insert({
          message_id: data.messageId,
          recipient_phone: data.recipientPhone,
          recipient_type: data.recipientType,
          recipient_id: data.recipientId,
          recipient_name: data.recipientName,
          message_type: data.messageType,
          categoria: data.categoria || 'general',
          contenido: data.contenido?.substring(0, 200),
          status: 'sent',
          sent_at: new Date().toISOString()
        });

      if (error) {
        if (error.code === '42P01') {
          console.log(`📊 Message Tracking: tabla no existe, solo log`);
          return false;
        }
        console.error('Error logging message sent:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Error en logMessageSent:', e);
      return false;
    }
  }

  /**
   * Actualiza el estado de un mensaje
   */
  async updateMessageStatus(messageId: string, status: 'delivered' | 'read' | 'failed', errorMessage?: string): Promise<boolean> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'delivered') {
        updateData.delivered_at = new Date().toISOString();
      } else if (status === 'read') {
        updateData.read_at = new Date().toISOString();
      } else if (status === 'failed') {
        updateData.failed_at = new Date().toISOString();
        updateData.error_message = errorMessage;
      }

      const { error } = await this.supabase.client
        .from('messages_sent')
        .update(updateData)
        .eq('message_id', messageId);

      if (error) {
        if (error.code === '42P01') return false;
        console.error('Error updating message status:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Error en updateMessageStatus:', e);
      return false;
    }
  }

  /**
   * Obtiene métricas de mensajes de los últimos N días
   */
  async getMetrics(days: number = 30): Promise<MessageMetrics[]> {
    try {
      const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabase.client
        .from('messages_sent')
        .select('message_type, categoria, status, read_at')
        .gte('sent_at', desde);

      if (error) {
        if (error.code === '42P01') return [];
        console.error('Error getting message metrics:', error);
        return [];
      }

      // Agrupar por tipo y categoría
      const grouped: Record<string, { sent: number; delivered: number; read: number; failed: number }> = {};

      for (const msg of data || []) {
        const key = `${msg.message_type}|${msg.categoria}`;
        if (!grouped[key]) {
          grouped[key] = { sent: 0, delivered: 0, read: 0, failed: 0 };
        }

        grouped[key].sent++;

        if (msg.status === 'delivered' || msg.status === 'read') {
          grouped[key].delivered++;
        }

        if (msg.status === 'read' || msg.read_at) {
          grouped[key].read++;
        }

        if (msg.status === 'failed') {
          grouped[key].failed++;
        }
      }

      return Object.entries(grouped).map(([key, stats]) => {
        const [messageType, categoria] = key.split('|');
        return {
          messageType,
          categoria,
          totalEnviados: stats.sent,
          totalEntregados: stats.delivered,
          totalLeidos: stats.read,
          totalFallidos: stats.failed,
          tasaLecturaPct: stats.delivered > 0 ? Math.round(stats.read / stats.delivered * 100) : 0
        };
      });
    } catch (e) {
      console.error('Error en getMetrics:', e);
      return [];
    }
  }

  /**
   * Obtiene los últimos N mensajes
   */
  async getRecentMessages(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.client
        .from('messages_sent')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.code === '42P01') return [];
        console.error('Error getting recent messages:', error);
        return [];
      }

      return data || [];
    } catch (e) {
      console.error('Error en getRecentMessages:', e);
      return [];
    }
  }

  /**
   * Resumen rápido de las últimas 24 horas
   */
  async get24hSummary(): Promise<{
    enviados: number;
    entregados: number;
    leidos: number;
    fallidos: number;
    tasaEntrega: number;
    tasaLectura: number;
  }> {
    try {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabase.client
        .from('messages_sent')
        .select('status, read_at')
        .gte('sent_at', desde);

      if (error) {
        return { enviados: 0, entregados: 0, leidos: 0, fallidos: 0, tasaEntrega: 0, tasaLectura: 0 };
      }

      const enviados = data?.length || 0;
      const entregados = data?.filter(m => m.status === 'delivered' || m.status === 'read').length || 0;
      const leidos = data?.filter(m => m.status === 'read' || m.read_at).length || 0;
      const fallidos = data?.filter(m => m.status === 'failed').length || 0;

      return {
        enviados,
        entregados,
        leidos,
        fallidos,
        tasaEntrega: enviados > 0 ? Math.round(entregados / enviados * 100) : 0,
        tasaLectura: entregados > 0 ? Math.round(leidos / entregados * 100) : 0
      };
    } catch (e) {
      return { enviados: 0, entregados: 0, leidos: 0, fallidos: 0, tasaEntrega: 0, tasaLectura: 0 };
    }
  }
}

export function createMessageTrackingService(supabase: SupabaseService): MessageTrackingService {
  return new MessageTrackingService(supabase);
}
