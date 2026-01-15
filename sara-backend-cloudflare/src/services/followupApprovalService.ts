/**
 * FOLLOWUP APPROVAL SERVICE - Aprobación de follow-ups
 */

import { SupabaseService } from './supabase';

export class FollowupApprovalService {
  constructor(private supabase: SupabaseService) {}

  async getPendingApprovals(): Promise<any[]> {
    try {
      const { data } = await this.supabase.client
        .from('followup_approvals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      return data || [];
    } catch (e) {
      console.log('Error obteniendo aprobaciones pendientes:', e);
      return [];
    }
  }

  async aprobar(approvalId: string): Promise<boolean> {
    try {
      await this.supabase.client
        .from('followup_approvals')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', approvalId);
      return true;
    } catch (e) {
      console.error('Error aprobando followup:', e);
      return false;
    }
  }

  async rechazar(approvalId: string, razon: string): Promise<boolean> {
    try {
      await this.supabase.client
        .from('followup_approvals')
        .update({ status: 'rejected', rejection_reason: razon })
        .eq('id', approvalId);
      return true;
    } catch (e) {
      console.error('Error rechazando followup:', e);
      return false;
    }
  }

  async procesarRespuestaVendedor(
    vendedorPhone: string,
    mensaje: string,
    sendToClient: (phone: string, message: string) => Promise<boolean>,
    sendToVendor: (phone: string, message: string) => Promise<boolean>
  ): Promise<{ handled: boolean; action?: string; error?: string }> {
    try {
      // Buscar aprobaciones pendientes para este vendedor
      const phoneSuffix = vendedorPhone.replace(/\D/g, '').slice(-10);

      const { data: pendingApprovals } = await this.supabase.client
        .from('followup_approvals')
        .select('*')
        .eq('status', 'pending')
        .ilike('vendedor_phone', `%${phoneSuffix}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!pendingApprovals || pendingApprovals.length === 0) {
        // No hay aprobaciones pendientes, no manejar
        return { handled: false };
      }

      const approval = pendingApprovals[0];
      const msgLower = mensaje.toLowerCase().trim();

      // Detectar aprobación
      if (['si', 'sí', 'ok', 'va', 'dale', 'listo', 'sale', 'enviar', 'aprobar'].includes(msgLower)) {
        await this.aprobar(approval.id);

        // Enviar mensaje al cliente si hay uno pendiente
        if (approval.mensaje_propuesto && approval.lead_phone) {
          await sendToClient(approval.lead_phone, approval.mensaje_propuesto);
        }

        return { handled: true, action: 'approved' };
      }

      // Detectar rechazo
      if (['no', 'nel', 'nop', 'cancelar', 'rechazar'].includes(msgLower)) {
        await this.rechazar(approval.id, 'Rechazado por vendedor');
        return { handled: true, action: 'rejected' };
      }

      // Si el mensaje es largo, podría ser una edición del mensaje
      if (mensaje.length > 10 && !mensaje.includes('?')) {
        // Actualizar mensaje y aprobar
        await this.supabase.client
          .from('followup_approvals')
          .update({
            mensaje_propuesto: mensaje,
            status: 'approved',
            approved_at: new Date().toISOString()
          })
          .eq('id', approval.id);

        // Enviar mensaje editado al cliente
        if (approval.lead_phone) {
          await sendToClient(approval.lead_phone, mensaje);
        }

        return { handled: true, action: 'edited_and_approved' };
      }

      return { handled: false };
    } catch (e: any) {
      console.error('Error procesando respuesta vendedor:', e);
      return { handled: false, error: e.message };
    }
  }

  async procesarRespuestaStatus(
    vendedorPhone: string,
    mensaje: string
  ): Promise<{ handled: boolean; leadName?: string }> {
    // Procesa mensajes tipo "status Juan Pérez: interesado en visitar"
    try {
      const match = mensaje.match(/^status\s+(.+?):\s*(.+)$/i);
      if (!match) return { handled: false };

      const leadName = match[1].trim();
      const statusUpdate = match[2].trim();

      // Buscar lead por nombre
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name')
        .ilike('name', `%${leadName}%`)
        .limit(1);

      if (!leads || leads.length === 0) {
        return { handled: false };
      }

      // Actualizar notas del lead
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', leads[0].id)
        .single();

      const notes = typeof lead?.notes === 'object' ? lead.notes : {};
      const statusHistory = Array.isArray(notes.status_updates) ? notes.status_updates : [];
      statusHistory.push({
        update: statusUpdate,
        by_phone: vendedorPhone,
        at: new Date().toISOString()
      });

      await this.supabase.client
        .from('leads')
        .update({
          notes: { ...notes, status_updates: statusHistory, last_status_update: statusUpdate }
        })
        .eq('id', leads[0].id);

      return { handled: true, leadName: leads[0].name };
    } catch (e) {
      console.error('Error procesando status:', e);
      return { handled: false };
    }
  }

  async enviarPropuestasPendientes(
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<number> {
    try {
      const { data: proposals } = await this.supabase.client
        .from('followup_approvals')
        .select('*')
        .eq('status', 'pending')
        .eq('notified', false)
        .limit(10);

      if (!proposals || proposals.length === 0) return 0;

      let enviadas = 0;
      for (const proposal of proposals) {
        try {
          if (!proposal.vendedor_phone) continue;

          const mensaje = `📋 *Propuesta de follow-up*\n\n` +
            `Lead: ${proposal.lead_name || 'Sin nombre'}\n` +
            `Mensaje: "${proposal.mensaje_propuesto}"\n\n` +
            `Responde *SI* para aprobar, *NO* para rechazar, o escribe tu versión del mensaje.`;

          await sendMessage(proposal.vendedor_phone, mensaje);

          await this.supabase.client
            .from('followup_approvals')
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

  async expirarAprobacionesViejas(): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - 24);

      const { data } = await this.supabase.client
        .from('followup_approvals')
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

  async pedirStatusLeadsEstancados(
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<number> {
    // Por ahora retorna 0 - implementar si es necesario
    return 0;
  }
}
