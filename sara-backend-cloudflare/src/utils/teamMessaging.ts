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

// Mapeo de tipo de mensaje a pending key (todos usan reactivar_equipo que está aprobado)
const PENDING_KEY_CONFIG: Record<string, string> = {
  'briefing': 'pending_briefing',
  'reporte_diario': 'pending_reporte_diario',
  'resumen_semanal': 'pending_resumen_semanal',
  'reporte': 'pending_reporte',
  'notificacion': 'pending_mensaje',
};

// Template único aprobado para reactivar ventana 24h
const REACTIVATION_TEMPLATE = 'reactivar_equipo';

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
    tipoMensaje?: string;  // 'briefing', 'reporte_diario', 'resumen_semanal', 'reporte', 'notificacion'
    guardarPending?: boolean;  // Guardar mensaje en pending si no hay ventana
    pendingKey?: string;  // Key para guardar en notes (ej: 'pending_reporte')
  }
): Promise<EnviarMensajeTeamResult> {
  const { tipoMensaje = 'notificacion', guardarPending = true } = opciones || {};
  const pendingKey = opciones?.pendingKey || PENDING_KEY_CONFIG[tipoMensaje] || 'pending_mensaje';

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

    if (ventanaAbierta) {
      // ═══ VENTANA ABIERTA: ENVIAR DIRECTO ═══
      console.log(`📤 [${tipoMensaje}] ${teamMember.name}: Ventana ABIERTA - enviando DIRECTO`);
      try {
        await meta.sendWhatsAppMessage(teamMember.phone, mensaje);
        console.log(`   ✅ Mensaje enviado DIRECTO a ${teamMember.name}`);
        return { success: true, method: 'direct', ventanaAbierta: true };
      } catch (sendError) {
        console.error(`   ❌ Error enviando mensaje directo a ${teamMember.name}:`, sendError);
        return { success: false, method: 'failed', ventanaAbierta: true };
      }
    } else {
      // ═══ VENTANA CERRADA: ENVIAR TEMPLATE + GUARDAR PENDING ═══
      console.log(`📤 [${tipoMensaje}] ${teamMember.name}: Ventana CERRADA - enviando template ${REACTIVATION_TEMPLATE}`);

      try {
        // Enviar template reactivar_equipo (formato: phone, templateName, languageCode, components)
        await meta.sendTemplate(teamMember.phone, REACTIVATION_TEMPLATE, 'es_MX', [
          { type: 'body', parameters: [{ type: 'text', text: nombreCorto }] }
        ]);
        console.log(`   📨 Template ${REACTIVATION_TEMPLATE} enviado a ${teamMember.name}`);

        // Guardar mensaje como pending si está habilitado
        // Formato: { sent_at, mensaje_completo } - compatible con handlers de whatsapp.ts
        if (guardarPending) {
          const nuevasNotas = {
            ...notasActuales,
            [pendingKey]: {
              sent_at: new Date().toISOString(),
              mensaje_completo: mensaje
            }
          };

          await supabase.client
            .from('team_members')
            .update({ notes: nuevasNotas })
            .eq('id', teamMember.id);

          console.log(`   💾 Mensaje guardado como ${pendingKey} para ${teamMember.name}`);
        }

        return { success: true, method: 'template', ventanaAbierta: false };
      } catch (templateError) {
        console.error(`   ❌ Error enviando template a ${teamMember.name}:`, templateError);

        // Fallback: intentar enviar directo de todos modos
        try {
          console.log(`   🔄 Intentando fallback directo...`);
          await meta.sendWhatsAppMessage(teamMember.phone, mensaje);
          console.log(`   ✅ Fallback directo exitoso a ${teamMember.name}`);
          return { success: true, method: 'direct', ventanaAbierta: false };
        } catch (fallbackError) {
          console.error(`   ❌ Fallback también falló para ${teamMember.name}:`, fallbackError);
          return { success: false, method: 'failed', ventanaAbierta: false };
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error en enviarMensajeTeamMember para ${teamMember.name}:`, error);
    return { success: false, method: 'failed', ventanaAbierta: false };
  }
}
