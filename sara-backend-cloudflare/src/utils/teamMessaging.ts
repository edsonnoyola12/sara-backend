/**
 * Utilidades para envío de mensajes al equipo respetando ventana 24h de WhatsApp
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';

export interface EnviarMensajeTeamResult {
  success: boolean;
  method: 'direct' | 'template' | 'failed';
  ventanaAbierta: boolean;
}

/**
 * Envía mensaje a un team member respetando la ventana de 24h de WhatsApp
 *
 * Si la ventana está abierta → envía mensaje directo
 * Si la ventana está cerrada → envía template + guarda mensaje como pending
 *
 * @param supabase - Servicio de Supabase
 * @param meta - Servicio de WhatsApp
 * @param teamMember - Miembro del equipo (con id, name, phone, notes)
 * @param mensaje - Mensaje a enviar
 * @param opciones - Opciones adicionales
 */
export async function enviarMensajeTeamMember(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  teamMember: any,
  mensaje: string,
  opciones?: {
    tipoMensaje?: string;  // 'reporte', 'alerta', 'notificacion', etc.
    guardarPending?: boolean;  // Guardar mensaje en pending si no hay ventana
    pendingKey?: string;  // Key para guardar en notes (ej: 'pending_reporte')
  }
): Promise<EnviarMensajeTeamResult> {
  const { tipoMensaje = 'notificacion', guardarPending = true, pendingKey = 'pending_mensaje' } = opciones || {};

  try {
    // Obtener notas actuales
    const notasActuales = typeof teamMember.notes === 'string'
      ? JSON.parse(teamMember.notes || '{}')
      : (teamMember.notes || {});

    // Verificar ventana 24h
    const lastInteraction = notasActuales.last_sara_interaction;
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const ventanaAbierta = lastInteraction && lastInteraction > hace24h;

    const nombreCorto = teamMember.name?.split(' ')[0] || 'Hola';

    console.log(`📤 [${tipoMensaje}] ${teamMember.name}: Enviando mensaje DIRECTO (sin template)`);

    // ═══ SIEMPRE ENVIAR MENSAJE DIRECTO ═══
    // Ya no usamos templates de reactivación - enviamos directo al equipo
    try {
      await meta.sendWhatsAppMessage(teamMember.phone, mensaje);
      console.log(`   ✅ Mensaje enviado DIRECTO a ${teamMember.name}`);
      return { success: true, method: 'direct', ventanaAbierta };
    } catch (sendError) {
      console.error(`   ❌ Error enviando mensaje a ${teamMember.name}:`, sendError);
      return { success: false, method: 'failed', ventanaAbierta: false };
    }
  } catch (error) {
    console.error(`❌ Error en enviarMensajeTeamMember para ${teamMember.name}:`, error);
    return { success: false, method: 'failed', ventanaAbierta: false };
  }
}
