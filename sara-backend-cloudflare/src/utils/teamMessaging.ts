/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UTILIDADES PARA ENVÍO DE MENSAJES AL EQUIPO
 * Respeta ventana 24h de WhatsApp con manejo profesional de pending messages
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';

export interface EnviarMensajeTeamResult {
  success: boolean;
  method: 'direct' | 'template' | 'failed';
  ventanaAbierta: boolean;
  messageId?: string; // ID del mensaje en cola (si usa nuevo sistema)
}

// Mapeo de tipo de mensaje a pending key
const PENDING_KEY_CONFIG: Record<string, string> = {
  'briefing': 'pending_briefing',
  'reporte_diario': 'pending_reporte_diario',
  'resumen_semanal': 'pending_resumen_semanal',
  'reporte': 'pending_reporte',
  'recap': 'pending_recap',
  'notificacion': 'pending_mensaje',
};

// Configuración de expiración por tipo de mensaje (en horas)
const EXPIRATION_CONFIG: Record<string, number> = {
  'briefing': 18,      // Expira antes del siguiente briefing
  'recap': 18,         // Expira antes del siguiente recap
  'reporte_diario': 24,
  'resumen_semanal': 72, // Más tiempo para el semanal
  'reporte': 24,
  'notificacion': 48,
};

// Template único aprobado para reactivar ventana 24h
const REACTIVATION_TEMPLATE = 'reactivar_equipo';

/**
 * Envía mensaje a un team member respetando la ventana de 24h de WhatsApp
 *
 * FLUJO PROFESIONAL:
 * 1. Verificar ventana 24h
 * 2. Si ABIERTA → enviar directo
 * 3. Si CERRADA → enviar template + guardar pending con expiración configurable
 * 4. SIEMPRE guardar pending si falla el envío directo (incluso con ventana abierta)
 */
export async function enviarMensajeTeamMember(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  teamMember: any,
  mensaje: string,
  opciones?: {
    tipoMensaje?: string;
    guardarPending?: boolean;
    pendingKey?: string;
    expirationHours?: number;
  }
): Promise<EnviarMensajeTeamResult> {
  const { tipoMensaje = 'notificacion', guardarPending = true } = opciones || {};
  const pendingKey = opciones?.pendingKey || PENDING_KEY_CONFIG[tipoMensaje] || 'pending_mensaje';
  const expirationHours = opciones?.expirationHours || EXPIRATION_CONFIG[tipoMensaje] || 24;

  try {
    // 1. Obtener notas actuales
    const notasActuales = typeof teamMember.notes === 'string'
      ? JSON.parse(teamMember.notes || '{}')
      : (teamMember.notes || {});

    // 2. Verificar ventana 24h
    const lastInteraction = notasActuales.last_sara_interaction;
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const ventanaAbierta = lastInteraction && lastInteraction > hace24h;

    const nombreCorto = teamMember.name?.split(' ')[0] || 'Hola';

    console.log(`📬 [${tipoMensaje}] ${teamMember.name}: ventana ${ventanaAbierta ? '✅ ABIERTA' : '❌ CERRADA'}`);

    // 3. SI VENTANA ABIERTA → Intentar envío directo
    if (ventanaAbierta) {
      try {
        await meta.sendWhatsAppMessage(teamMember.phone, mensaje);
        console.log(`   ✅ Enviado DIRECTO a ${teamMember.name}`);
        return { success: true, method: 'direct', ventanaAbierta: true };
      } catch (directError: any) {
        console.log(`   ⚠️ Directo falló (${directError?.message}), usando fallback...`);
        // Continuar con template como fallback
      }
    }

    // 4. VENTANA CERRADA o ENVÍO DIRECTO FALLÓ → Enviar template + guardar pending
    console.log(`   📨 Enviando template ${REACTIVATION_TEMPLATE}...`);

    try {
      await meta.sendTemplate(teamMember.phone, REACTIVATION_TEMPLATE, 'es_MX', [
        { type: 'body', parameters: [{ type: 'text', text: nombreCorto }] }
      ]);
      console.log(`   ✅ Template enviado a ${teamMember.name}`);
    } catch (templateError: any) {
      console.error(`   ❌ Template falló: ${templateError?.message}`);

      // CRÍTICO: Guardar como pending aunque template falle
      // Así se puede reintentar cuando la ventana se abra
      if (guardarPending) {
        await guardarMensajePending(supabase, teamMember.id, notasActuales, pendingKey, mensaje, expirationHours);
        console.log(`   💾 Guardado como pending para reintento posterior`);
      }

      return { success: false, method: 'failed', ventanaAbierta: false };
    }

    // 5. Template enviado exitosamente → Guardar mensaje como pending
    if (guardarPending) {
      await guardarMensajePending(supabase, teamMember.id, notasActuales, pendingKey, mensaje, expirationHours);
    }

    return { success: true, method: 'template', ventanaAbierta: false };

  } catch (error) {
    console.error(`❌ Error en enviarMensajeTeamMember para ${teamMember.name}:`, error);
    return { success: false, method: 'failed', ventanaAbierta: false };
  }
}

/**
 * Guarda mensaje como pending con timestamp de expiración
 */
async function guardarMensajePending(
  supabase: SupabaseService,
  teamMemberId: string,
  notasActuales: any,
  pendingKey: string,
  mensaje: string,
  expirationHours: number
): Promise<void> {
  const ahora = new Date();
  const expiresAt = new Date(ahora.getTime() + expirationHours * 60 * 60 * 1000);

  const nuevasNotas = {
    ...notasActuales,
    [pendingKey]: {
      sent_at: ahora.toISOString(),
      mensaje_completo: mensaje,
      expires_at: expiresAt.toISOString() // Nuevo: expiración explícita
    }
  };

  await supabase.client
    .from('team_members')
    .update({ notes: nuevasNotas })
    .eq('id', teamMemberId);

  console.log(`   💾 Mensaje guardado como ${pendingKey} (expira en ${expirationHours}h)`);
}

/**
 * Verifica si un pending message ha expirado
 */
export function isPendingExpired(pending: { sent_at: string; expires_at?: string }, tipoMensaje?: string): boolean {
  // Si tiene expires_at explícito, usar ese
  if (pending.expires_at) {
    return new Date(pending.expires_at) < new Date();
  }

  // Fallback: calcular basado en sent_at + config
  const sentAt = new Date(pending.sent_at);
  const maxHoras = EXPIRATION_CONFIG[tipoMensaje || 'notificacion'] || 24;
  const expiresAt = new Date(sentAt.getTime() + maxHoras * 60 * 60 * 1000);

  return expiresAt < new Date();
}

/**
 * Obtiene todos los pending messages de un team member ordenados por prioridad
 */
export function getPendingMessages(notes: any): Array<{
  key: string;
  type: string;
  pending: { sent_at: string; mensaje_completo: string; expires_at?: string };
  priority: number;
}> {
  const pendingKeys = [
    { key: 'pending_briefing', type: 'briefing', priority: 1 },
    { key: 'pending_recap', type: 'recap', priority: 2 },
    { key: 'pending_reporte_diario', type: 'reporte_diario', priority: 2 },
    { key: 'pending_resumen_semanal', type: 'resumen_semanal', priority: 3 },
    { key: 'pending_mensaje', type: 'notificacion', priority: 4 },
  ];

  const result: Array<{
    key: string;
    type: string;
    pending: { sent_at: string; mensaje_completo: string; expires_at?: string };
    priority: number;
  }> = [];

  for (const { key, type, priority } of pendingKeys) {
    const pending = notes[key];
    if (pending?.mensaje_completo && !isPendingExpired(pending, type)) {
      result.push({ key, type, pending, priority });
    }
  }

  // Ordenar por prioridad
  return result.sort((a, b) => a.priority - b.priority);
}
