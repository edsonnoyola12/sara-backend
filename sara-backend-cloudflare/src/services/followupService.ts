// =====================================================
// FOLLOW-UP SERVICE - Sistema de seguimiento 90 días
// =====================================================

import { SupabaseService } from './supabase';

interface FollowupRule {
  id: string;
  name: string;
  funnel: 'ventas' | 'hipoteca';
  trigger_event: string;
  trigger_status: string | null;
  requires_no_response: boolean;
  delay_hours: number;
  message_template: string;
  is_active: boolean;
  sequence_order: number;
  sequence_group: string;
}

interface ScheduledFollowup {
  id: string;
  lead_id: string;
  rule_id: string;
  lead_phone: string;
  lead_name: string;
  desarrollo: string;
  message: string;
  scheduled_at: string;
  sent: boolean;
  cancelled: boolean;
}

export class FollowupService {
  private supabase: SupabaseService;

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
  }

  // =====================================================
  // PROGRAMAR FOLLOW-UPS PARA UN EVENTO
  // =====================================================
  async programarFollowups(
    leadId: string,
    leadPhone: string,
    leadName: string,
    desarrollo: string,
    triggerEvent: string,
    triggerStatus?: string
  ): Promise<number> {
    try {
      console.log(`📅 Programando follow-ups para lead ${leadName} - evento: ${triggerEvent}`);

      // Obtener reglas activas para este evento
      let query = this.supabase.client
        .from('followup_rules')
        .select('*')
        .eq('is_active', true)
        .eq('trigger_event', triggerEvent);

      if (triggerStatus) {
        query = query.eq('trigger_status', triggerStatus);
      }

      const { data: rules, error } = await query.order('sequence_order', { ascending: true });

      if (error || !rules || rules.length === 0) {
        console.error('⚠️ No hay reglas activas para este evento');
        return 0;
      }

      // Cancelar follow-ups anteriores del mismo sequence_group
      const sequenceGroups = [...new Set(rules.map(r => r.sequence_group))];
      for (const group of sequenceGroups as string[]) {
        await this.cancelarFollowupsPorGrupo(leadId, group, 'nueva_secuencia');
      }

      // Programar nuevos follow-ups
      const now = new Date();
      const followupsToInsert = rules.map(rule => {
        const scheduledAt = new Date(now.getTime() + rule.delay_hours * 60 * 60 * 1000);
        const message = this.renderTemplate(rule.message_template, {
          nombre: leadName,
          desarrollo: desarrollo
        });

        return {
          lead_id: leadId,
          rule_id: rule.id,
          lead_phone: leadPhone.replace(/\D/g, ''),
          lead_name: leadName,
          desarrollo: desarrollo,
          message: message,
          scheduled_at: scheduledAt.toISOString(),
          sent: false,
          cancelled: false
        };
      });

      const { error: insertError } = await this.supabase.client
        .from('scheduled_followups')
        .insert(followupsToInsert);

      if (insertError) {
        console.error('❌ Error programando follow-ups:', insertError);
        return 0;
      }

      console.log(`✅ ${followupsToInsert.length} follow-ups programados para ${leadName}`);
      return followupsToInsert.length;

    } catch (e) {
      console.error('❌ Error en programarFollowups:', e);
      return 0;
    }
  }

  // =====================================================
  // PROCESAR FOLLOW-UPS PENDIENTES (CRON)
  // =====================================================
  async procesarFollowupsPendientes(
    sendMessage: (phone: string, message: string) => Promise<boolean>
  ): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };

    try {
      const now = new Date().toISOString();

      // Obtener follow-ups listos para enviar
      const { data: followups, error } = await this.supabase.client
        .from('scheduled_followups')
        .select(`
          *,
          followup_rules!inner(requires_no_response, sequence_group)
        `)
        .eq('sent', false)
        .eq('cancelled', false)
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(20); // Procesar máximo 20 por ciclo

      if (error || !followups || followups.length === 0) {
        console.log('📭 No hay follow-ups pendientes');
        return results;
      }

      console.log(`📬 Procesando ${followups.length} follow-ups pendientes`);

      for (const followup of followups) {
        try {
          // Verificar si requiere que no haya respuesta
          if (followup.followup_rules?.requires_no_response) {
            const hasResponse = await this.leadHaRespondido(followup.lead_id, followup.created_at);
            if (hasResponse) {
              await this.cancelarFollowup(followup.id, 'lead_respondio');
              console.log(`⏭️ Follow-up cancelado - lead respondió: ${followup.lead_name}`);
              continue;
            }
          }

          // Verificar si lead está marcado como no contactar
          const { data: lead } = await this.supabase.client
            .from('leads')
            .select('do_not_contact')
            .eq('id', followup.lead_id)
            .single();

          if (lead?.do_not_contact) {
            await this.cancelarFollowup(followup.id, 'do_not_contact');
            console.log(`🚫 Follow-up cancelado - DNC: ${followup.lead_name}`);
            continue;
          }

          // Enviar mensaje
          const phoneFormatted = followup.lead_phone.startsWith('52') 
            ? followup.lead_phone 
            : '52' + followup.lead_phone;

          const success = await sendMessage(phoneFormatted, followup.message);

          if (success) {
            await this.supabase.client
              .from('scheduled_followups')
              .update({ sent: true, sent_at: new Date().toISOString() })
              .eq('id', followup.id);

            // Actualizar last_interaction del lead
            await this.supabase.client
              .from('leads')
              .update({ last_interaction: new Date().toISOString() })
              .eq('id', followup.lead_id);

            console.log(`✅ Follow-up enviado a ${followup.lead_name}: "${followup.message.substring(0, 50)}..."`);
            results.sent++;
          } else {
            results.failed++;
            console.error(`❌ Error enviando follow-up a ${followup.lead_name}`);
          }

        } catch (e) {
          console.error(`❌ Error procesando follow-up ${followup.id}:`, e);
          results.failed++;
        }
      }

    } catch (e) {
      console.error('❌ Error en procesarFollowupsPendientes:', e);
    }

    return results;
  }

  // =====================================================
  // CANCELAR FOLLOW-UPS CUANDO LEAD RESPONDE
  // =====================================================
  async cancelarPorRespuesta(leadId: string, leadPhone: string): Promise<number> {
    try {
      const cleanPhone = leadPhone.replace(/\D/g, '');

      // Buscar lead por teléfono si no tenemos ID
      let actualLeadId = leadId;
      if (!actualLeadId) {
        const { data: lead } = await this.supabase.client
          .from('leads')
          .select('id')
          .or(`phone.eq.${cleanPhone},phone.eq.52${cleanPhone},phone.ilike.%${cleanPhone.slice(-10)}`)
          .single();

        if (lead) actualLeadId = lead.id;
      }

      if (!actualLeadId) return 0;

      // ✅ FIX Bug #9: Solo cancelar follow-ups que requieren no respuesta
      // Primero obtener los IDs de follow-ups que deben cancelarse
      const { data: followupsToCancel } = await this.supabase.client
        .from('scheduled_followups')
        .select('id, rule_id, followup_rules!inner(requires_no_response)')
        .eq('lead_id', actualLeadId)
        .eq('sent', false)
        .eq('cancelled', false);

      // Filtrar solo los que requieren no respuesta
      const idsToCancel = (followupsToCancel || [])
        .filter((f: any) => f.followup_rules?.requires_no_response === true)
        .map((f: any) => f.id);

      if (idsToCancel.length === 0) {
        console.log('ℹ️ No hay follow-ups con requires_no_response para cancelar');
        // Aún así actualizar last_response
        await this.supabase.client
          .from('leads')
          .update({
            last_response: new Date().toISOString(),
            last_interaction: new Date().toISOString()
          })
          .eq('id', actualLeadId);
        return 0;
      }

      // Cancelar solo los follow-ups que requieren no respuesta
      const { data: cancelled } = await this.supabase.client
        .from('scheduled_followups')
        .update({
          cancelled: true,
          cancel_reason: 'lead_respondio'
        })
        .in('id', idsToCancel)
        .select('id');

      // Actualizar last_response del lead
      await this.supabase.client
        .from('leads')
        .update({ 
          last_response: new Date().toISOString(),
          last_interaction: new Date().toISOString()
        })
        .eq('id', actualLeadId);

      const count = cancelled?.length || 0;
      if (count > 0) {
        console.log(`🛑 ${count} follow-ups cancelados por respuesta del lead`);
      }

      return count;

    } catch (e) {
      console.error('❌ Error en cancelarPorRespuesta:', e);
      return 0;
    }
  }

  // =====================================================
  // CANCELAR FOLLOW-UPS POR CAMBIO DE STATUS
  // =====================================================
  async cancelarPorCambioStatus(leadId: string, nuevoStatus: string): Promise<number> {
    try {
      const { data: cancelled } = await this.supabase.client
        .from('scheduled_followups')
        .update({ 
          cancelled: true, 
          cancel_reason: `status_cambio_a_${nuevoStatus}` 
        })
        .eq('lead_id', leadId)
        .eq('sent', false)
        .eq('cancelled', false)
        .select('id');

      const count = cancelled?.length || 0;
      if (count > 0) {
        console.log(`🔄 ${count} follow-ups cancelados por cambio de status a ${nuevoStatus}`);
      }

      return count;

    } catch (e) {
      console.error('❌ Error en cancelarPorCambioStatus:', e);
      return 0;
    }
  }

  // =====================================================
  // HELPERS PRIVADOS
  // =====================================================
  private renderTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
    }
    return result;
  }

  private async cancelarFollowup(followupId: string, reason: string): Promise<void> {
    await this.supabase.client
      .from('scheduled_followups')
      .update({ cancelled: true, cancel_reason: reason })
      .eq('id', followupId);
  }

  private async cancelarFollowupsPorGrupo(leadId: string, sequenceGroup: string, reason: string): Promise<void> {
    await this.supabase.client
      .from('scheduled_followups')
      .update({ cancelled: true, cancel_reason: reason })
      .eq('lead_id', leadId)
      .eq('sent', false)
      .eq('cancelled', false);
      // Nota: filtrar por sequence_group requeriría un join, simplificamos cancelando todos los pendientes
  }

  private async leadHaRespondido(leadId: string, desde: string): Promise<boolean> {
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('last_response')
      .eq('id', leadId)
      .single();

    if (!lead?.last_response) return false;

    return new Date(lead.last_response) > new Date(desde);
  }

  // =====================================================
  // OBTENER ESTADÍSTICAS (PARA CRM)
  // =====================================================
  async getEstadisticas(): Promise<{
    pendientes: number;
    enviadosHoy: number;
    canceladosHoy: number;
  }> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { count: pendientes } = await this.supabase.client
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('sent', false)
      .eq('cancelled', false);

    const { count: enviadosHoy } = await this.supabase.client
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('sent', true)
      .gte('sent_at', hoy.toISOString());

    const { count: canceladosHoy } = await this.supabase.client
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('cancelled', true)
      .gte('created_at', hoy.toISOString());

    return {
      pendientes: pendientes || 0,
      enviadosHoy: enviadosHoy || 0,
      canceladosHoy: canceladosHoy || 0
    };
  }
}
