/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UTILIDADES PARA ENVÍO DE MENSAJES AL EQUIPO
 * Respeta ventana 24h de WhatsApp con manejo profesional de pending messages
 * SISTEMA HÍBRIDO: Template → Esperar 2h → Llamada con Retell
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { createRetellService, RetellService } from '../services/retellService';
import { createTTSService, TTSService } from '../services/ttsService';

export interface EnviarMensajeTeamResult {
  success: boolean;
  method: 'direct' | 'template' | 'call' | 'failed';
  ventanaAbierta: boolean;
  messageId?: string;
  callId?: string; // ID de llamada Retell si se hizo llamada
}

// Prioridades de mensaje para sistema híbrido
export type MessagePriority = 'critico' | 'normal' | 'bajo';

// Configuración del sistema híbrido de llamadas
export const CALL_CONFIG = {
  // Horas en que se puede llamar (hora México)
  horasPermitidas: { inicio: 9, fin: 20 }, // 9 AM - 8 PM
  // Tiempo de espera antes de llamar (en horas)
  esperaAntesLlamar: 2,
  // Máximo de llamadas por día por persona
  maxLlamadasDia: 2,
  // Tipos de mensaje que permiten llamada
  tiposConLlamada: ['briefing', 'reporte_diario', 'alerta_lead', 'recordatorio_cita'],
};

// Mapeo de tipo de mensaje a pending key
const PENDING_KEY_CONFIG: Record<string, string> = {
  'briefing': 'pending_briefing',
  'reporte_diario': 'pending_reporte_diario',
  'resumen_semanal': 'pending_resumen_semanal',
  'reporte': 'pending_reporte',
  'recap': 'pending_recap',
  'notificacion': 'pending_mensaje',
  'alerta_lead': 'pending_alerta_lead',
  'recordatorio_cita': 'pending_recordatorio_cita',
};

// Prioridad por defecto de cada tipo de mensaje
const PRIORITY_CONFIG: Record<string, MessagePriority> = {
  'alerta_lead': 'critico',           // Lead caliente - llamar inmediatamente
  'recordatorio_cita': 'critico',     // Cita próxima - llamar inmediatamente
  'briefing': 'normal',               // Esperar 2h antes de llamar
  'reporte_diario': 'normal',         // Esperar 2h antes de llamar
  'recap': 'normal',                  // Esperar 2h antes de llamar
  'resumen_semanal': 'bajo',          // Nunca llamar
  'reporte': 'bajo',                  // Nunca llamar
  'notificacion': 'bajo',             // Nunca llamar
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
 * FLUJO HÍBRIDO:
 * 1. Verificar ventana 24h
 * 2. Si ABIERTA → enviar directo
 * 3. Si CERRADA:
 *    - CRÍTICO (alerta_lead, recordatorio_cita) → LLAMAR inmediatamente
 *    - NORMAL (briefing, reporte) → Template + pending, llamar después de 2h
 *    - BAJO (resumen semanal) → Solo template, nunca llamar
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
    prioridad?: MessagePriority;
    // Retell config (solo si hay llamadas habilitadas)
    retellConfig?: {
      apiKey: string;
      agentId: string;
      phoneNumber: string;
    };
    mensajeParaLlamada?: string; // Resumen corto para que SARA diga por teléfono
    // TTS config - enviar también como nota de voz
    ttsConfig?: {
      enabled: boolean;
      openaiApiKey: string;
    };
  }
): Promise<EnviarMensajeTeamResult> {
  const { tipoMensaje = 'notificacion', guardarPending = true } = opciones || {};
  const pendingKey = opciones?.pendingKey || PENDING_KEY_CONFIG[tipoMensaje] || 'pending_mensaje';
  const expirationHours = opciones?.expirationHours || EXPIRATION_CONFIG[tipoMensaje] || 24;
  const prioridad = opciones?.prioridad || PRIORITY_CONFIG[tipoMensaje] || 'bajo';

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

    console.log(`📬 [${tipoMensaje}] ${teamMember.name}: ventana ${ventanaAbierta ? '✅ ABIERTA' : '❌ CERRADA'}, prioridad: ${prioridad}`);

    // 3. SI VENTANA ABIERTA → Intentar envío directo
    if (ventanaAbierta) {
      try {
        await meta.sendWhatsAppMessage(teamMember.phone, mensaje);
        console.log(`   ✅ Enviado DIRECTO a ${teamMember.name}`);

        // TTS: Si está habilitado, también enviar como nota de voz
        if (opciones?.ttsConfig?.enabled && opciones.ttsConfig.openaiApiKey) {
          try {
            const tts = createTTSService(opciones.ttsConfig.openaiApiKey);
            // Solo generar audio si el mensaje es razonablemente largo
            if (mensaje.length >= 50 && mensaje.length <= 3000) {
              console.log(`   🔊 TTS: Generando audio para briefing...`);
              const audioResult = await tts.generateAudio(mensaje);
              if (audioResult.success && audioResult.audioBuffer) {
                await meta.sendVoiceMessage(teamMember.phone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
                console.log(`   ✅ TTS: Nota de voz enviada (${audioResult.audioBuffer.byteLength} bytes)`);
              }
            }
          } catch (ttsErr) {
            console.log(`   ⚠️ TTS falló (no crítico):`, ttsErr);
            // No fallar el envío si TTS falla
          }
        }

        return { success: true, method: 'direct', ventanaAbierta: true };
      } catch (directError: any) {
        console.log(`   ⚠️ Directo falló (${directError?.message}), usando fallback...`);
        // Continuar con template como fallback
      }
    }

    // 3.5 VENTANA CERRADA + PRIORIDAD CRÍTICA → LLAMAR INMEDIATAMENTE
    if (!ventanaAbierta && prioridad === 'critico' && opciones?.retellConfig) {
      const callResult = await llamarTeamMemberConRetell(
        supabase,
        teamMember,
        opciones.mensajeParaLlamada || mensaje.substring(0, 200),
        opciones.retellConfig
      );

      if (callResult.success) {
        console.log(`   📞 Llamada realizada a ${teamMember.name} (${callResult.callId})`);
        return { success: true, method: 'call', ventanaAbierta: false, callId: callResult.callId };
      } else {
        console.log(`   ⚠️ Llamada falló: ${callResult.error}, usando template como fallback`);
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SISTEMA HÍBRIDO DE LLAMADAS CON RETELL
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Llama a un team member usando Retell cuando la ventana 24h está cerrada
 */
export async function llamarTeamMemberConRetell(
  supabase: SupabaseService,
  teamMember: any,
  mensajeResumen: string,
  retellConfig: { apiKey: string; agentId: string; phoneNumber: string }
): Promise<{ success: boolean; callId?: string; error?: string }> {
  const nombreCorto = teamMember.name?.split(' ')[0] || 'Hola';

  // Verificar horario permitido (hora México = UTC-6)
  const horaMexico = new Date().getUTCHours() - 6;
  const horaAjustada = horaMexico < 0 ? horaMexico + 24 : horaMexico;

  if (horaAjustada < CALL_CONFIG.horasPermitidas.inicio || horaAjustada >= CALL_CONFIG.horasPermitidas.fin) {
    console.log(`   ⏰ Fuera de horario para llamar (${horaAjustada}h México)`);
    return { success: false, error: 'Fuera de horario permitido para llamadas' };
  }

  // Verificar límite de llamadas por día
  const notasActuales = typeof teamMember.notes === 'string'
    ? JSON.parse(teamMember.notes || '{}')
    : (teamMember.notes || {});

  const hoy = new Date().toISOString().split('T')[0];
  const llamadasHoy = notasActuales.llamadas_retell_hoy || { fecha: '', count: 0 };

  if (llamadasHoy.fecha === hoy && llamadasHoy.count >= CALL_CONFIG.maxLlamadasDia) {
    console.log(`   📞 Límite de llamadas alcanzado (${llamadasHoy.count}/${CALL_CONFIG.maxLlamadasDia})`);
    return { success: false, error: `Límite de ${CALL_CONFIG.maxLlamadasDia} llamadas/día alcanzado` };
  }

  try {
    const retell = createRetellService(
      retellConfig.apiKey,
      retellConfig.agentId,
      retellConfig.phoneNumber
    );

    if (!retell.isAvailable()) {
      return { success: false, error: 'Retell no está configurado' };
    }

    console.log(`   📞 Llamando a ${teamMember.name} (${teamMember.phone})...`);

    const result = await retell.initiateCall({
      leadId: teamMember.id,
      leadName: teamMember.name,
      leadPhone: teamMember.phone,
      motivo: 'seguimiento',
      notas: `MENSAJE PARA ${nombreCorto}: ${mensajeResumen}`
    });

    if (result.success) {
      // Actualizar contador de llamadas
      const nuevasNotas = {
        ...notasActuales,
        llamadas_retell_hoy: {
          fecha: hoy,
          count: llamadasHoy.fecha === hoy ? llamadasHoy.count + 1 : 1
        },
        ultima_llamada_retell: new Date().toISOString()
      };

      await supabase.client
        .from('team_members')
        .update({ notes: nuevasNotas })
        .eq('id', teamMember.id);

      return { success: true, callId: result.callId };
    } else {
      return { success: false, error: result.error };
    }
  } catch (e) {
    console.error(`   ❌ Error llamando a ${teamMember.name}:`, e);
    return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

/**
 * Verifica pending messages que llevan más de 2h sin respuesta y los llama
 * Ejecutar en CRON cada 30 minutos
 */
export async function verificarPendingParaLlamar(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  retellConfig: { apiKey: string; agentId: string; phoneNumber: string }
): Promise<{ llamadas: number; errores: number; detalles: any[] }> {
  console.log('📞 Verificando pending messages para llamar...');

  let llamadas = 0;
  let errores = 0;
  const detalles: any[] = [];

  // Obtener team members con pending messages
  const { data: teamMembers, error } = await supabase.client
    .from('team_members')
    .select('*')
    .eq('active', true)
    .in('role', ['vendedor', 'admin']); // Solo vendedores y admin

  if (error || !teamMembers) {
    console.error('❌ Error obteniendo team members:', error);
    return { llamadas: 0, errores: 1 };
  }

  const ahora = Date.now();
  const dosHorasMs = CALL_CONFIG.esperaAntesLlamar * 60 * 60 * 1000;

  for (const tm of teamMembers) {
    const notas = typeof tm.notes === 'string' ? JSON.parse(tm.notes || '{}') : (tm.notes || {});

    // Buscar pending messages de tipos que permiten llamada
    for (const tipo of CALL_CONFIG.tiposConLlamada) {
      const pendingKey = PENDING_KEY_CONFIG[tipo];
      const pending = notas[pendingKey];

      if (!pending?.mensaje_completo) continue;

      // Verificar si ya pasaron 2 horas
      const sentAt = new Date(pending.sent_at).getTime();
      const tiempoEspera = ahora - sentAt;

      if (tiempoEspera < dosHorasMs) {
        console.log(`   ⏳ ${tm.name} - ${tipo}: esperando (${Math.round(tiempoEspera / 60000)}min de ${CALL_CONFIG.esperaAntesLlamar * 60}min)`);
        continue;
      }

      // Verificar que no haya expirado
      if (isPendingExpired(pending, tipo)) {
        console.log(`   ⏰ ${tm.name} - ${tipo}: expirado, limpiando`);
        delete notas[pendingKey];
        await supabase.client.from('team_members').update({ notes: notas }).eq('id', tm.id);
        continue;
      }

      // Verificar si ya se intentó llamar para este pending
      if (pending.llamada_intentada) {
        console.log(`   📞 ${tm.name} - ${tipo}: ya se intentó llamar`);
        continue;
      }

      console.log(`   📞 ${tm.name} - ${tipo}: pasaron ${Math.round(tiempoEspera / 60000)}min, llamando...`);

      // Marcar que se va a intentar llamar
      notas[pendingKey].llamada_intentada = true;
      await supabase.client.from('team_members').update({ notes: notas }).eq('id', tm.id);

      // Hacer la llamada
      const callResult = await llamarTeamMemberConRetell(
        supabase,
        tm,
        pending.mensaje_completo.substring(0, 200),
        retellConfig
      );

      if (callResult.success) {
        llamadas++;
        // Limpiar el pending después de llamar exitosamente
        delete notas[pendingKey];
        await supabase.client.from('team_members').update({ notes: notas }).eq('id', tm.id);
        console.log(`   ✅ Llamada realizada a ${tm.name}`);
        detalles.push({
          nombre: tm.name,
          telefono: tm.phone,
          tipo,
          resultado: 'success',
          callId: callResult.callId
        });
      } else {
        errores++;
        console.log(`   ❌ Llamada falló: ${callResult.error}`);
        // Guardar el error en el pending para debugging
        notas[pendingKey].ultimo_error_llamada = callResult.error;
        await supabase.client.from('team_members').update({ notes: notas }).eq('id', tm.id);
        detalles.push({
          nombre: tm.name,
          telefono: tm.phone,
          tipo,
          resultado: 'error',
          error: callResult.error
        });
      }
    }
  }

  console.log(`📞 Verificación completada: ${llamadas} llamadas, ${errores} errores`);
  return { llamadas, errores, detalles };
}

/**
 * Verifica si es horario permitido para llamar
 */
export function esHorarioParaLlamar(): boolean {
  const horaMexico = new Date().getUTCHours() - 6;
  const horaAjustada = horaMexico < 0 ? horaMexico + 24 : horaMexico;
  return horaAjustada >= CALL_CONFIG.horasPermitidas.inicio && horaAjustada < CALL_CONFIG.horasPermitidas.fin;
}
