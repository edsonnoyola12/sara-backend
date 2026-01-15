/**
 * APPROVAL SERVICE - Manejo de aprobaciones de vendedores para follow-ups
 */

import { SupabaseService } from './supabase';

export class ApprovalService {
  constructor(private supabase: SupabaseService) {}

  async procesarRespuestaVendedor(
    vendedorPhone: string,
    mensaje: string,
    leadPhone?: string
  ): Promise<{ handled: boolean; response?: string; error?: string }> {
    // Procesa respuestas de vendedores a propuestas de follow-up
    // Por ahora retorna que no fue manejado para que siga el flujo normal
    return { handled: false };
  }

  async procesarRespuestaStatus(
    vendedorPhone: string,
    mensaje: string
  ): Promise<{ handled: boolean; response?: string }> {
    // Procesa respuestas de status de leads
    return { handled: false };
  }

  async proponerFollowup(params: {
    leadId: string;
    leadName: string;
    vendedorId: string;
    vendedorPhone: string;
    tipo: string;
    mensaje: string;
  }): Promise<{ success: boolean; proposalId?: string; error?: string }> {
    try {
      const { data, error } = await this.supabase.client
        .from('followup_proposals')
        .insert({
          lead_id: params.leadId,
          lead_name: params.leadName,
          vendedor_id: params.vendedorId,
          vendedor_phone: params.vendedorPhone,
          tipo: params.tipo,
          mensaje_propuesto: params.mensaje,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creando propuesta:', error);
        return { success: false, error: error.message };
      }

      return { success: true, proposalId: data.id };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async enviarPropuestasPendientes(
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<number> {
    try {
      const { data: proposals } = await this.supabase.client
        .from('followup_proposals')
        .select('*')
        .eq('status', 'pending')
        .eq('notified', false)
        .limit(10);

      if (!proposals || proposals.length === 0) return 0;

      let enviadas = 0;
      for (const proposal of proposals) {
        try {
          const mensaje = `📋 *Propuesta de follow-up*\n\n` +
            `Lead: ${proposal.lead_name}\n` +
            `Mensaje: "${proposal.mensaje_propuesto}"\n\n` +
            `Responde *SI* para aprobar o *NO* para rechazar`;

          await sendMessage(proposal.vendedor_phone, mensaje);

          await this.supabase.client
            .from('followup_proposals')
            .update({ notified: true, notified_at: new Date().toISOString() })
            .eq('id', proposal.id);

          enviadas++;
        } catch (e) {
          console.error('Error enviando propuesta:', e);
        }
      }

      return enviadas;
    } catch (e) {
      console.error('Error en enviarPropuestasPendientes:', e);
      return 0;
    }
  }

  async pedirStatusLeadsEstancados(
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<number> {
    // Pide actualización de status a vendedores sobre leads estancados
    // Por ahora retorna 0 para no enviar nada
    return 0;
  }

  async expirarAprobacionesViejas(): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - 24);

      const { data } = await this.supabase.client
        .from('followup_proposals')
        .update({ status: 'expired' })
        .eq('status', 'pending')
        .lt('created_at', cutoff.toISOString())
        .select('id');

      return data?.length || 0;
    } catch (e) {
      console.error('Error expirando aprobaciones:', e);
      return 0;
    }
  }
}
