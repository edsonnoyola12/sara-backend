/**
 * BROADCAST QUEUE SERVICE
 *
 * Maneja broadcasts masivos usando cola en Supabase
 * procesada por el cron cada 2 minutos.
 */

import { SupabaseService } from './supabase';

const BATCH_SIZE = 15; // Leads por lote (dentro del límite de Cloudflare)

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
    sendTemplate: (phone: string, templateName: string, lang: string, components: any[]) => Promise<any>
  ): Promise<{ processed: number; sent: number; errors: number }> {
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
      const result = await this.processJob(job, sendTemplate);
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
    sendTemplate: (phone: string, templateName: string, lang: string, components: any[]) => Promise<any>
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
      await this.markAsCompleted(job);
      return { sent: 0, errors: 0, completed: true };
    }

    // Obtener datos de los leads
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, phone, name, property_interest')
      .in('id', pendingIds);

    if (!leads || leads.length === 0) {
      return { sent: 0, errors: 0, completed: false };
    }

    console.log(`📤 QUEUE: Procesando batch de ${leads.length} leads para job ${job.id}`);

    const sentIds: string[] = [];
    const failedIds: string[] = [];

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
      } catch (e) {
        console.error(`❌ QUEUE: Error enviando a ${lead.phone}:`, e);
        failedIds.push(lead.id);
        errors++;
      }
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
      await this.markAsCompleted(job);
      return { sent, errors, completed: true };
    }

    return { sent, errors, completed: false };
  }

  /**
   * Marca un job como completado y notifica al usuario
   */
  private async markAsCompleted(job: BroadcastJob): Promise<void> {
    await this.supabase.client
      .from('broadcast_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    console.log(`✅ QUEUE: Broadcast ${job.id} completado - ${job.sent_count} enviados, ${job.error_count} errores`);
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
