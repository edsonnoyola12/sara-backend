import { SupabaseService } from './supabase';
import { safeJsonParse } from '../utils/safeHelpers';

export class BridgeService {
  constructor(private supabase: SupabaseService) {}

  async activarBridge(
    teamMemberId: string,
    teamMemberName: string,
    teamMemberPhone: string,
    leadId: string,
    leadName: string,
    leadPhone: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Obtener notas actuales del team member
      const { data: member } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', teamMemberId)
        .single();

      let notes: any = safeJsonParse(member?.notes);

      // Configurar bridge activo (6 minutos)
      const expiresAt = new Date(Date.now() + 6 * 60 * 1000).toISOString();
      notes.active_bridge = {
        lead_id: leadId,
        lead_name: leadName,
        lead_phone: leadPhone,
        expires_at: expiresAt,
        started_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };

      // Guardar en notas del team member
      const { error: bridgeTmErr } = await this.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', teamMemberId);
      if (bridgeTmErr) console.error('❌ Bridge: Error guardando notes team_member:', bridgeTmErr.message);

      // También guardar en notas del lead para que sus respuestas se redirijan
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', leadId)
        .single();

      let leadNotes: any = safeJsonParse(lead?.notes);

      leadNotes.active_bridge_to_vendedor = {
        vendedor_id: teamMemberId,
        vendedor_name: teamMemberName,
        vendedor_phone: teamMemberPhone.replace('whatsapp:', '').replace('+', ''),
        expires_at: expiresAt
      };

      const { error: bridgeLeadErr } = await this.supabase.client
        .from('leads')
        .update({ notes: leadNotes })
        .eq('id', leadId);
      if (bridgeLeadErr) console.error('❌ Bridge: Error guardando notes lead:', bridgeLeadErr.message);

      console.log(`🔗 Bridge activado: ${teamMemberName} ↔ ${leadName} (expira: ${expiresAt})`);
      return { success: true };
    } catch (e: any) {
      console.error('Error activando bridge:', e);
      return { success: false, error: e.message };
    }
  }

  formatMensajeBridgeActivado(leadName: string, mensaje: string): string {
    const preview = mensaje.length > 100 ? mensaje.substring(0, 100) + '...' : mensaje;
    return `✅ *Mensaje enviado a ${leadName}*\n\n` +
      `"${preview}"\n\n` +
      `💬 _Chat directo activo por 6 min. Sus respuestas te llegarán aquí._`;
  }
}
