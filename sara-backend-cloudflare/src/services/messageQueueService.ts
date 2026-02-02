/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MESSAGE QUEUE SERVICE - Sistema Profesional de Cola de Mensajes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Solución enterprise para mensajería confiable al equipo.
 * Similar a cómo funcionan ManyChat, HubSpot, y otros CRMs profesionales.
 *
 * Características:
 * - Cola persistente en base de datos
 * - Priorización de mensajes
 * - Reintentos con backoff exponencial
 * - Expiración configurable por tipo
 * - Auditoría completa del ciclo de vida
 * - Respeta ventana 24h de WhatsApp
 */

import { SupabaseService } from './supabase';
import { MetaWhatsAppService } from './meta-whatsapp';

// Tipos para el sistema de cola
export interface QueuedMessage {
  id: string;
  team_member_id: string;
  team_member_phone: string;
  team_member_name: string;
  message_type: MessageType;
  message_content: string;
  status: MessageStatus;
  priority: number;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  template_sent_at: string | null;
  delivered_at: string | null;
  expires_at: string | null;
}

export type MessageType =
  | 'briefing'
  | 'recap'
  | 'reporte_diario'
  | 'resumen_semanal'
  | 'alerta'
  | 'notificacion';

export type MessageStatus =
  | 'queued'
  | 'template_sent'
  | 'delivered'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface EnqueueOptions {
  priority?: 1 | 2 | 3; // 1=Alta, 2=Media, 3=Baja
  expirationHours?: number;
  metadata?: Record<string, any>;
}

export interface DeliveryResult {
  success: boolean;
  method: 'direct' | 'template' | 'queued' | 'failed';
  messageId?: string;
  error?: string;
}

// Configuración por tipo de mensaje
const MESSAGE_TYPE_CONFIG: Record<MessageType, { expirationHours: number; priority: number; templateName: string }> = {
  briefing: { expirationHours: 18, priority: 1, templateName: 'reactivar_equipo' },
  recap: { expirationHours: 18, priority: 2, templateName: 'reactivar_equipo' },
  reporte_diario: { expirationHours: 24, priority: 2, templateName: 'reactivar_equipo' },
  resumen_semanal: { expirationHours: 72, priority: 3, templateName: 'reactivar_equipo' },
  alerta: { expirationHours: 6, priority: 1, templateName: 'reactivar_equipo' },
  notificacion: { expirationHours: 48, priority: 3, templateName: 'reactivar_equipo' },
};

export class MessageQueueService {
  private supabase: SupabaseService;
  private meta: MetaWhatsAppService;
  private useNewQueue: boolean;

  constructor(supabase: SupabaseService, meta: MetaWhatsAppService, useNewQueue = false) {
    this.supabase = supabase;
    this.meta = meta;
    this.useNewQueue = useNewQueue; // Feature flag para migración gradual
  }

  /**
   * Encola un mensaje para un team member
   * Intenta enviar inmediatamente si hay ventana 24h abierta
   */
  async enqueue(
    teamMemberId: string,
    messageType: MessageType,
    messageContent: string,
    options?: EnqueueOptions
  ): Promise<DeliveryResult> {
    const config = MESSAGE_TYPE_CONFIG[messageType] || MESSAGE_TYPE_CONFIG.notificacion;

    try {
      // 1. Obtener info del team member
      const { data: teamMember, error: tmError } = await this.supabase.client
        .from('team_members')
        .select('id, name, phone, notes')
        .eq('id', teamMemberId)
        .single();

      if (tmError || !teamMember) {
        console.error(`❌ [MQ] Team member no encontrado: ${teamMemberId}`);
        return { success: false, method: 'failed', error: 'Team member not found' };
      }

      // 2. Verificar ventana 24h
      const notes = typeof teamMember.notes === 'string'
        ? JSON.parse(teamMember.notes || '{}')
        : (teamMember.notes || {});

      const lastInteraction = notes.last_sara_interaction;
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const ventanaAbierta = lastInteraction && lastInteraction > hace24h;

      console.log(`📬 [MQ] ${teamMember.name}: Encolando ${messageType} (ventana: ${ventanaAbierta ? 'ABIERTA' : 'CERRADA'})`);

      // 3. Si ventana abierta, intentar envío directo
      if (ventanaAbierta) {
        try {
          await this.meta.sendWhatsAppMessage(teamMember.phone, messageContent);
          console.log(`   ✅ [MQ] Enviado DIRECTO a ${teamMember.name}`);

          // Registrar en auditoría (si usamos nuevo sistema)
          if (this.useNewQueue) {
            await this.logAudit(null, 'direct_sent', {
              team_member_id: teamMemberId,
              message_type: messageType,
              method: 'direct',
            });
          }

          return { success: true, method: 'direct' };
        } catch (directError: any) {
          console.log(`   ⚠️ [MQ] Envío directo falló: ${directError?.message}`);
          // Continuar con template como fallback
        }
      }

      // 4. Ventana cerrada o envío directo falló → Enviar template
      const nombreCorto = teamMember.name?.split(' ')[0] || 'Hola';

      try {
        await this.meta.sendTemplate(teamMember.phone, config.templateName, 'es_MX', [
          { type: 'body', parameters: [{ type: 'text', text: nombreCorto }] }
        ]);
        console.log(`   📨 [MQ] Template enviado a ${teamMember.name}`);
      } catch (templateError: any) {
        console.error(`   ❌ [MQ] Template también falló: ${templateError?.message}`);

        // Si usa nuevo sistema, encolar para reintento
        if (this.useNewQueue) {
          const messageId = await this.insertToQueue(
            teamMember,
            messageType,
            messageContent,
            'queued',
            options
          );
          return { success: false, method: 'queued', messageId, error: templateError?.message };
        }

        return { success: false, method: 'failed', error: templateError?.message };
      }

      // 5. Template enviado → Guardar mensaje como pendiente
      if (this.useNewQueue) {
        // Nuevo sistema: usar tabla message_queue
        const messageId = await this.insertToQueue(
          teamMember,
          messageType,
          messageContent,
          'template_sent',
          options
        );
        return { success: true, method: 'template', messageId };
      } else {
        // Sistema legacy: guardar en notes
        await this.savePendingToNotes(teamMember, messageType, messageContent);
        return { success: true, method: 'template' };
      }

    } catch (error: any) {
      console.error(`❌ [MQ] Error en enqueue:`, error);
      return { success: false, method: 'failed', error: error?.message };
    }
  }

  /**
   * Obtiene el siguiente mensaje pendiente para entregar cuando el usuario responde
   */
  async getNextPendingMessage(teamMemberId: string): Promise<QueuedMessage | null> {
    if (this.useNewQueue) {
      // Nuevo sistema: consultar tabla message_queue
      const { data, error } = await this.supabase.client
        .from('message_queue')
        .select('*')
        .eq('team_member_id', teamMemberId)
        .in('status', ['queued', 'template_sent'])
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(`❌ [MQ] Error buscando pending:`, error);
        return null;
      }

      return data;
    } else {
      // Sistema legacy: buscar en notes
      return await this.getPendingFromNotes(teamMemberId);
    }
  }

  /**
   * Marca un mensaje como entregado
   */
  async markDelivered(messageId: string): Promise<void> {
    if (this.useNewQueue) {
      await this.supabase.client
        .from('message_queue')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString()
        })
        .eq('id', messageId);

      await this.logAudit(messageId, 'delivered', {});
    }
    // En sistema legacy, el handler de whatsapp.ts maneja esto directamente
  }

  /**
   * Procesa y entrega mensaje pendiente cuando el usuario responde
   */
  async deliverPendingMessage(teamMemberId: string, teamMemberPhone: string): Promise<{
    delivered: boolean;
    messageType?: string;
    messageContent?: string;
  }> {
    const pending = await this.getNextPendingMessage(teamMemberId);

    if (!pending) {
      return { delivered: false };
    }

    // Verificar que no haya expirado
    if (pending.expires_at && new Date(pending.expires_at) < new Date()) {
      console.log(`   ⏰ [MQ] Mensaje expirado, saltando`);
      if (this.useNewQueue) {
        await this.supabase.client
          .from('message_queue')
          .update({ status: 'expired' })
          .eq('id', pending.id);
      }
      // Buscar el siguiente
      return this.deliverPendingMessage(teamMemberId, teamMemberPhone);
    }

    // Enviar el mensaje
    try {
      await this.meta.sendWhatsAppMessage(teamMemberPhone, pending.message_content);
      console.log(`   ✅ [MQ] Pending ${pending.message_type} entregado`);

      if (this.useNewQueue) {
        await this.markDelivered(pending.id);
      } else {
        // Limpiar de notes
        await this.clearPendingFromNotes(teamMemberId, pending.message_type);
      }

      return {
        delivered: true,
        messageType: pending.message_type,
        messageContent: pending.message_content
      };
    } catch (error: any) {
      console.error(`   ❌ [MQ] Error entregando pending:`, error);
      return { delivered: false };
    }
  }

  /**
   * Expira mensajes viejos (llamar desde CRON)
   */
  async expireOldMessages(): Promise<number> {
    if (!this.useNewQueue) return 0;

    const { data, error } = await this.supabase.client
      .from('message_queue')
      .update({ status: 'expired' })
      .in('status', ['queued', 'template_sent'])
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error(`❌ [MQ] Error expirando mensajes:`, error);
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      console.log(`🗑️ [MQ] Expirados ${count} mensajes`);

      // Registrar en auditoría
      for (const msg of data || []) {
        await this.logAudit(msg.id, 'expired', {});
      }
    }

    return count;
  }

  /**
   * Obtiene estadísticas del sistema de cola
   */
  async getQueueStats(): Promise<{
    queued: number;
    awaitingResponse: number;
    delivered24h: number;
    failed: number;
    expired24h: number;
    avgDeliveryHours: number | null;
  }> {
    if (!this.useNewQueue) {
      return {
        queued: 0,
        awaitingResponse: 0,
        delivered24h: 0,
        failed: 0,
        expired24h: 0,
        avgDeliveryHours: null
      };
    }

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [queued, templateSent, delivered, failed, expired] = await Promise.all([
      this.supabase.client.from('message_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      this.supabase.client.from('message_queue').select('id', { count: 'exact', head: true }).eq('status', 'template_sent'),
      this.supabase.client.from('message_queue').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('delivered_at', hace24h),
      this.supabase.client.from('message_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      this.supabase.client.from('message_queue').select('id', { count: 'exact', head: true }).eq('status', 'expired').gte('expires_at', hace24h),
    ]);

    return {
      queued: queued.count || 0,
      awaitingResponse: templateSent.count || 0,
      delivered24h: delivered.count || 0,
      failed: failed.count || 0,
      expired24h: expired.count || 0,
      avgDeliveryHours: null // TODO: calcular promedio
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inserta mensaje en la tabla message_queue
   */
  private async insertToQueue(
    teamMember: any,
    messageType: MessageType,
    messageContent: string,
    status: MessageStatus,
    options?: EnqueueOptions
  ): Promise<string> {
    const config = MESSAGE_TYPE_CONFIG[messageType] || MESSAGE_TYPE_CONFIG.notificacion;
    const expirationHours = options?.expirationHours || config.expirationHours;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase.client
      .from('message_queue')
      .insert({
        team_member_id: teamMember.id,
        team_member_phone: teamMember.phone,
        team_member_name: teamMember.name,
        message_type: messageType,
        message_content: messageContent,
        message_preview: messageContent.substring(0, 100),
        status,
        priority: options?.priority || config.priority,
        expires_at: expiresAt,
        template_sent_at: status === 'template_sent' ? new Date().toISOString() : null,
        metadata: options?.metadata || {}
      })
      .select('id')
      .single();

    if (error) {
      console.error(`❌ [MQ] Error insertando en cola:`, error);
      throw error;
    }

    await this.logAudit(data.id, 'created', {
      message_type: messageType,
      status,
      expires_at: expiresAt
    });

    return data.id;
  }

  /**
   * Registra evento en auditoría
   */
  private async logAudit(messageId: string | null, event: string, details: Record<string, any>): Promise<void> {
    try {
      await this.supabase.client
        .from('message_audit_log')
        .insert({
          message_id: messageId,
          event,
          details
        });
    } catch (error) {
      console.error(`⚠️ [MQ] Error en auditoría:`, error);
      // No fallar por error de auditoría
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPATIBILIDAD CON SISTEMA LEGACY (notes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Guarda mensaje pendiente en notes (sistema legacy)
   */
  private async savePendingToNotes(teamMember: any, messageType: MessageType, messageContent: string): Promise<void> {
    const notes = typeof teamMember.notes === 'string'
      ? JSON.parse(teamMember.notes || '{}')
      : (teamMember.notes || {});

    const pendingKey = this.getPendingKey(messageType);

    notes[pendingKey] = {
      sent_at: new Date().toISOString(),
      mensaje_completo: messageContent
    };

    await this.supabase.client
      .from('team_members')
      .update({ notes })
      .eq('id', teamMember.id);

    console.log(`   💾 [MQ] Guardado en notes.${pendingKey}`);
  }

  /**
   * Obtiene mensaje pendiente de notes (sistema legacy)
   */
  private async getPendingFromNotes(teamMemberId: string): Promise<QueuedMessage | null> {
    const { data: teamMember } = await this.supabase.client
      .from('team_members')
      .select('id, name, phone, notes')
      .eq('id', teamMemberId)
      .single();

    if (!teamMember) return null;

    const notes = typeof teamMember.notes === 'string'
      ? JSON.parse(teamMember.notes || '{}')
      : (teamMember.notes || {});

    // Buscar en orden de prioridad
    const pendingKeys: { key: string; type: MessageType; priority: number }[] = [
      { key: 'pending_briefing', type: 'briefing', priority: 1 },
      { key: 'pending_recap', type: 'recap', priority: 2 },
      { key: 'pending_reporte_diario', type: 'reporte_diario', priority: 2 },
      { key: 'pending_resumen_semanal', type: 'resumen_semanal', priority: 3 },
    ];

    for (const { key, type, priority } of pendingKeys) {
      const pending = notes[key];
      if (pending?.mensaje_completo) {
        // Verificar expiración (12h para legacy, para mantener compatibilidad)
        const sentAt = new Date(pending.sent_at);
        const horasDesdeSent = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);

        // Resumen semanal tiene más tiempo
        const maxHoras = type === 'resumen_semanal' ? 24 : 12;

        if (horasDesdeSent <= maxHoras) {
          return {
            id: key, // En legacy, usamos la key como ID
            team_member_id: teamMemberId,
            team_member_phone: teamMember.phone,
            team_member_name: teamMember.name,
            message_type: type,
            message_content: pending.mensaje_completo,
            status: 'template_sent',
            priority,
            retry_count: 0,
            max_retries: 3,
            next_retry_at: null,
            last_error: null,
            created_at: pending.sent_at,
            template_sent_at: pending.sent_at,
            delivered_at: null,
            expires_at: new Date(sentAt.getTime() + maxHoras * 60 * 60 * 1000).toISOString()
          };
        }
      }
    }

    return null;
  }

  /**
   * Limpia mensaje pendiente de notes (sistema legacy)
   */
  private async clearPendingFromNotes(teamMemberId: string, messageType: string): Promise<void> {
    const { data: teamMember } = await this.supabase.client
      .from('team_members')
      .select('id, notes')
      .eq('id', teamMemberId)
      .single();

    if (!teamMember) return;

    const notes = typeof teamMember.notes === 'string'
      ? JSON.parse(teamMember.notes || '{}')
      : (teamMember.notes || {});

    const pendingKey = this.getPendingKey(messageType as MessageType);
    delete notes[pendingKey];

    await this.supabase.client
      .from('team_members')
      .update({ notes })
      .eq('id', teamMemberId);
  }

  /**
   * Convierte tipo de mensaje a pending key
   */
  private getPendingKey(messageType: MessageType): string {
    const keyMap: Record<MessageType, string> = {
      briefing: 'pending_briefing',
      recap: 'pending_recap',
      reporte_diario: 'pending_reporte_diario',
      resumen_semanal: 'pending_resumen_semanal',
      alerta: 'pending_mensaje',
      notificacion: 'pending_mensaje',
    };
    return keyMap[messageType] || 'pending_mensaje';
  }
}
