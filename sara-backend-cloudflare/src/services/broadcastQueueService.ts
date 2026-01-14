/**
 * BROADCAST QUEUE SERVICE
 *
 * Maneja broadcasts masivos usando cola en Supabase
 * procesada por el cron cada 2 minutos.
 */

import { SupabaseService } from './supabase';

const BATCH_SIZE = 15; // Leads por lote (dentro del límite de Cloudflare)
const BROADCAST_RESPONSE_WINDOW_HOURS = 48; // Ventana para detectar respuestas

export interface BroadcastJob {
  id: string;
  segment: string;
  desarrollo?: string;
  vendedor_id?: string;
  message_template: string;
  pending_lead_ids: string[];
  sent_lead_ids: string[];
  failed_lead_ids: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_leads: number;
  sent_count: number;
  error_count: number;
  created_by?: string;
  created_by_phone?: string;
  notify_on_complete: boolean;
}

export class BroadcastQueueService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Encola un nuevo broadcast para procesamiento asíncrono
   */
  async queueBroadcast(params: {
    segment: string;
    desarrollo?: string;
    vendedorId?: string;
    messageTemplate: string;
    leadIds: string[];
    createdBy?: string;
    createdByPhone?: string;
  }): Promise<{ success: boolean; jobId?: string; error?: string; totalLeads: number }> {
    try {
      const { data, error } = await this.supabase.client
        .from('broadcast_queue')
        .insert({
          segment: params.segment,
          desarrollo: params.desarrollo,
          vendedor_id: params.vendedorId,
          message_template: params.messageTemplate,
          pending_lead_ids: params.leadIds,
          total_leads: params.leadIds.length,
          created_by: params.createdBy,
          created_by_phone: params.createdByPhone,
          status: 'pending'
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error al encolar broadcast:', error);
        return { success: false, error: error.message, totalLeads: 0 };
      }

      console.log(`📤 QUEUE: Broadcast encolado - ${params.leadIds.length} leads, job ${data.id}`);
      return { success: true, jobId: data.id, totalLeads: params.leadIds.length };
    } catch (e) {
      console.error('Error en queueBroadcast:', e);
      return { success: false, error: 'Error interno', totalLeads: 0 };
    }
  }

  /**
   * Procesa broadcasts pendientes (llamado por cron)
   */
  async processPendingBroadcasts(
    sendTemplate: (phone: string, templateName: string, lang: string, components: any[]) => Promise<any>,
    sendMessage?: (phone: string, message: string) => Promise<any>
  ): Promise<{ processed: number; sent: number; errors: number }> {

    // 🚨 KILL SWITCH - Si no hay config o está en false, NO PROCESAR
    try {
      const { data: config } = await this.supabase.client
        .from('system_config')
        .select('value')
        .eq('key', 'broadcasts_enabled')
        .single();

      if (!config || config.value === 'false' || config.value === false) {
        console.log('🛑 BROADCASTS KILL SWITCH ACTIVO - No procesando');
        return { processed: 0, sent: 0, errors: 0 };
      }
    } catch (e) {
      console.log('🛑 BROADCASTS DETENIDOS - Error/tabla no existe');
      return { processed: 0, sent: 0, errors: 0 };
    }

    let totalProcessed = 0;
    let totalSent = 0;
    let totalErrors = 0;

    // Obtener broadcasts pendientes o en proceso
    const { data: jobs, error } = await this.supabase.client
      .from('broadcast_queue')
      .select('*')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(3); // Procesar máximo 3 jobs por ciclo

    if (error || !jobs || jobs.length === 0) {
      return { processed: 0, sent: 0, errors: 0 };
    }

    console.log(`📤 QUEUE: Procesando ${jobs.length} broadcasts pendientes`);

    for (const job of jobs) {
      const result = await this.processJob(job, sendTemplate, sendMessage);
      totalProcessed++;
      totalSent += result.sent;
      totalErrors += result.errors;
    }

    return { processed: totalProcessed, sent: totalSent, errors: totalErrors };
  }

  /**
   * Procesa un job individual
   */
  private async processJob(
    job: BroadcastJob,
    sendTemplate: (phone: string, templateName: string, lang: string, components: any[]) => Promise<any>,
    sendMessage?: (phone: string, message: string) => Promise<any>
  ): Promise<{ sent: number; errors: number; completed: boolean }> {
    let sent = 0;
    let errors = 0;

    // Marcar como processing si es pending
    if (job.status === 'pending') {
      await this.supabase.client
        .from('broadcast_queue')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', job.id);
    }

    // Obtener batch de leads pendientes
    const pendingIds = job.pending_lead_ids.slice(0, BATCH_SIZE);

    if (pendingIds.length === 0) {
      // No hay más leads, marcar como completado
      await this.markAsCompleted(job, sendMessage);
      return { sent: 0, errors: 0, completed: true };
    }

    // Obtener datos de los leads (incluir assigned_to para notificar vendedores)
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, phone, name, property_interest, assigned_to, notes')
      .in('id', pendingIds);

    if (!leads || leads.length === 0) {
      return { sent: 0, errors: 0, completed: false };
    }

    console.log(`📤 QUEUE: Procesando batch de ${leads.length} leads para job ${job.id}`);

    const sentIds: string[] = [];
    const failedIds: string[] = [];
    const sentLeadsByVendor: Map<string, { name: string; phone: string }[]> = new Map();

    // Enviar a cada lead
    for (const lead of leads) {
      if (!lead.phone) {
        failedIds.push(lead.id);
        errors++;
        continue;
      }

      try {
        // Preparar mensaje personalizado
        const nombre = lead.name || 'Cliente';
        const desarrollo = lead.property_interest || 'nuestros desarrollos';
        // Tercer parámetro: mensaje promocional (limpiar placeholders)
        const mensajePromo = job.message_template
          .replace(/{nombre}/gi, '')
          .replace(/{desarrollo}/gi, '')
          .trim()
          .substring(0, 200) || 'Promoción especial disponible';

        // Usar template de WhatsApp (3 params: nombre, desarrollo, mensaje)
        await sendTemplate(lead.phone, 'promo_desarrollo', 'es_MX', [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombre },
              { type: 'text', text: desarrollo },
              { type: 'text', text: mensajePromo }
            ]
          }
        ]);

        sentIds.push(lead.id);
        sent++;
        console.log(`✅ QUEUE: Template enviado a ${lead.phone}`);

        // Marcar en notes del lead que recibió broadcast
        await this.markLeadWithBroadcast(lead.id, lead.notes, job);

        // Agrupar por vendedor para notificar
        if (lead.assigned_to) {
          if (!sentLeadsByVendor.has(lead.assigned_to)) {
            sentLeadsByVendor.set(lead.assigned_to, []);
          }
          sentLeadsByVendor.get(lead.assigned_to)!.push({
            name: lead.name || 'Sin nombre',
            phone: lead.phone
          });
        }
      } catch (e) {
        console.error(`❌ QUEUE: Error enviando a ${lead.phone}:`, e);
        failedIds.push(lead.id);
        errors++;
      }
    }

    // Notificar a vendedores sobre sus leads que recibieron broadcast
    if (sendMessage && sentLeadsByVendor.size > 0) {
      await this.notifyVendors(sentLeadsByVendor, job, sendMessage);
    }

    // Actualizar el job
    const newPendingIds = job.pending_lead_ids.filter(id => !sentIds.includes(id) && !failedIds.includes(id));
    const newSentIds = [...job.sent_lead_ids, ...sentIds];
    const newFailedIds = [...job.failed_lead_ids, ...failedIds];

    await this.supabase.client
      .from('broadcast_queue')
      .update({
        pending_lead_ids: newPendingIds,
        sent_lead_ids: newSentIds,
        failed_lead_ids: newFailedIds,
        sent_count: newSentIds.length,
        error_count: newFailedIds.length
      })
      .eq('id', job.id);

    // Verificar si completó
    if (newPendingIds.length === 0) {
      await this.markAsCompleted(job, sendMessage);
      return { sent, errors, completed: true };
    }

    return { sent, errors, completed: false };
  }

  /**
   * Marca un lead con info del broadcast recibido
   */
  private async markLeadWithBroadcast(leadId: string, currentNotes: any, job: BroadcastJob): Promise<void> {
    try {
      const notes = typeof currentNotes === 'object' ? currentNotes : {};
      const broadcastInfo = {
        job_id: job.id,
        segment: job.segment,
        message: job.message_template.substring(0, 100),
        sent_at: new Date().toISOString()
      };

      await this.supabase.client
        .from('leads')
        .update({
          notes: {
            ...notes,
            last_broadcast: broadcastInfo
          }
        })
        .eq('id', leadId);
    } catch (e) {
      console.error(`Error marcando lead ${leadId} con broadcast:`, e);
    }
  }

  /**
   * Notifica a vendedores sobre leads que recibieron broadcast
   */
  private async notifyVendors(
    leadsByVendor: Map<string, { name: string; phone: string }[]>,
    job: BroadcastJob,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<void> {
    // Obtener datos de vendedores
    const vendorIds = Array.from(leadsByVendor.keys());
    const { data: vendors } = await this.supabase.client
      .from('team_members')
      .select('id, name, phone')
      .in('id', vendorIds);

    if (!vendors) return;

    const mensajeCorto = job.message_template
      .replace(/{nombre}/gi, '[nombre]')
      .replace(/{desarrollo}/gi, '[desarrollo]')
      .substring(0, 80);

    for (const vendor of vendors) {
      if (!vendor.phone) continue;

      const leads = leadsByVendor.get(vendor.id);
      if (!leads || leads.length === 0) continue;

      const nombresLeads = leads.slice(0, 5).map(l => l.name).join(', ');
      const extra = leads.length > 5 ? ` y ${leads.length - 5} más` : '';

      const mensaje = `📢 *Broadcast enviado a tus leads*\n\n` +
        `Se envió mensaje promocional a ${leads.length} de tus leads:\n` +
        `👥 ${nombresLeads}${extra}\n\n` +
        `📝 Mensaje: "${mensajeCorto}..."\n\n` +
        `⚡ Si responden, te notificaré con el contexto.`;

      try {
        await sendMessage(vendor.phone, mensaje);
        console.log(`📢 QUEUE: Notificación enviada a vendedor ${vendor.name}`);
      } catch (e) {
        console.error(`Error notificando a vendedor ${vendor.name}:`, e);
      }
    }
  }

  /**
   * Marca un job como completado y notifica al usuario
   */
  private async markAsCompleted(
    job: BroadcastJob,
    sendMessage?: (phone: string, message: string) => Promise<any>
  ): Promise<void> {
    // Obtener conteos actualizados
    const { data: updatedJob } = await this.supabase.client
      .from('broadcast_queue')
      .select('sent_count, error_count')
      .eq('id', job.id)
      .single();

    const sentCount = updatedJob?.sent_count || job.sent_count;
    const errorCount = updatedJob?.error_count || job.error_count;

    await this.supabase.client
      .from('broadcast_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    console.log(`✅ QUEUE: Broadcast ${job.id} completado - ${sentCount} enviados, ${errorCount} errores`);
  }

  /**
   * Verifica si un lead tiene un broadcast reciente (para contextualizar respuestas)
   */
  async getRecentBroadcast(leadId: string): Promise<{
    hasBroadcast: boolean;
    message?: string;
    sentAt?: string;
    segment?: string;
  }> {
    try {
      // Primero verificar en notes del lead (método nuevo)
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', leadId)
        .single();

      if (lead?.notes?.last_broadcast) {
        const broadcast = lead.notes.last_broadcast;
        const sentAt = new Date(broadcast.sent_at);
        const now = new Date();
        const hoursDiff = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);

        if (hoursDiff <= BROADCAST_RESPONSE_WINDOW_HOURS) {
          console.log(`📢 Broadcast detectado en notes para lead ${leadId}`);
          return {
            hasBroadcast: true,
            message: broadcast.message,
            sentAt: broadcast.sent_at,
            segment: broadcast.segment
          };
        }
      }

      // Fallback: buscar en broadcast_queue si el lead fue enviado recientemente
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - BROADCAST_RESPONSE_WINDOW_HOURS);

      const { data: recentBroadcasts } = await this.supabase.client
        .from('broadcast_queue')
        .select('id, segment, message_template, completed_at, sent_lead_ids')
        .gte('completed_at', cutoffDate.toISOString())
        .eq('status', 'completed');

      if (recentBroadcasts && recentBroadcasts.length > 0) {
        for (const broadcast of recentBroadcasts) {
          if (broadcast.sent_lead_ids && broadcast.sent_lead_ids.includes(leadId)) {
            console.log(`📢 Broadcast detectado en queue para lead ${leadId}`);
            return {
              hasBroadcast: true,
              message: broadcast.message_template?.substring(0, 100),
              sentAt: broadcast.completed_at,
              segment: broadcast.segment
            };
          }
        }
      }

      return { hasBroadcast: false };
    } catch (e) {
      console.error('Error verificando broadcast reciente:', e);
      return { hasBroadcast: false };
    }
  }

  /**
   * Obtiene el estado de un broadcast
   */
  async getJobStatus(jobId: string): Promise<BroadcastJob | null> {
    const { data } = await this.supabase.client
      .from('broadcast_queue')
      .select('*')
      .eq('id', jobId)
      .single();

    return data;
  }

  /**
   * Obtiene broadcasts completados que necesitan notificación
   */
  async getCompletedJobsToNotify(): Promise<BroadcastJob[]> {
    const { data } = await this.supabase.client
      .from('broadcast_queue')
      .select('*')
      .eq('status', 'completed')
      .eq('notify_on_complete', true)
      .not('created_by_phone', 'is', null);

    return data || [];
  }

  /**
   * Marca un job como notificado
   */
  async markAsNotified(jobId: string): Promise<void> {
    await this.supabase.client
      .from('broadcast_queue')
      .update({ notify_on_complete: false })
      .eq('id', jobId);
  }
}
