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
import { safeJsonParse } from './safeHelpers';
import { enviarAlertaSistema } from '../crons/healthCheck';

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

// Template UTILITY para reactivar ventana 24h (resumen_vendedor es UTILITY, reactivar_equipo es MARKETING → bloqueado por Meta 131049)
const REACTIVATION_TEMPLATE = 'resumen_vendedor';

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
    // Template override - usar template específico con datos en vez de reactivar_equipo genérico
    templateOverride?: {
      name: string;
      params: string[];
    };
  }
): Promise<EnviarMensajeTeamResult> {
  const { tipoMensaje = 'notificacion', guardarPending = true } = opciones || {};
  const pendingKey = opciones?.pendingKey || PENDING_KEY_CONFIG[tipoMensaje] || 'pending_mensaje';
  const expirationHours = opciones?.expirationHours || EXPIRATION_CONFIG[tipoMensaje] || 24;
  const prioridad = opciones?.prioridad || PRIORITY_CONFIG[tipoMensaje] || 'bajo';

  try {
    // 1. Obtener notas actuales
    const notasActuales = safeJsonParse(teamMember.notes);

    // 2. Verificar ventana 24h
    const lastInteraction = notasActuales.last_sara_interaction;
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const ventanaAbierta = lastInteraction && lastInteraction > hace24h;

    const nombreCorto = teamMember.name?.split(' ')[0] || 'Hola';

    console.log(`📬 [${tipoMensaje}] ${teamMember.name}: ventana ${ventanaAbierta ? '✅ ABIERTA' : '❌ CERRADA'}, prioridad: ${prioridad}`);

    // 3. SI VENTANA ABIERTA → Intentar envío directo
    if (ventanaAbierta) {
      try {
        const sendResult = await meta.sendWhatsAppMessage(teamMember.phone, mensaje);
        const wamid = sendResult?.messages?.[0]?.id;
        console.log(`   ✅ Enviado DIRECTO a ${teamMember.name} (wamid: ${wamid?.substring(0, 20)}...)`);

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

        // Guardar wamid en notes para tracking de delivery
        if (wamid) {
          notasActuales.last_team_message_wamids = [
            ...(notasActuales.last_team_message_wamids || []).slice(-4),
            { wamid, sent_at: new Date().toISOString(), tipo: tipoMensaje }
          ];
          const { error: wamidError } = await supabase.client.from('team_members').update({
            notes: JSON.stringify(notasActuales)
          }).eq('id', teamMember.id);
          if (wamidError) {
            console.error(`   ⚠️ Error guardando wamid en notes:`, wamidError);
          } else {
            console.log(`   📝 Wamid ${wamid.substring(0, 15)}... guardado en notes (${notasActuales.last_team_message_wamids.length} total)`);
          }
        }

        return { success: true, method: 'direct', ventanaAbierta: true, messageId: wamid };
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
    // FIX DEFINITIVO: Usar notificacion_cita_vendedor con datos extraídos del mensaje
    // en vez de resumen_vendedor con datos vacíos ('-')
    let templateName: string;
    let templateComponents: any[];

    if (opciones?.templateOverride) {
      templateName = opciones.templateOverride.name;
      templateComponents = [{ type: 'body', parameters: opciones.templateOverride.params.map(p => ({ type: 'text', text: p })) }];
    } else {
      // Extraer info útil del mensaje para el template
      const msgPreview = mensaje.substring(0, 60).replace(/\n/g, ' ');
      const tipoLabel = tipoMensaje === 'alerta_lead' ? '📲 Alerta de lead'
        : tipoMensaje === 'recordatorio_cita' ? '📅 Recordatorio'
        : tipoMensaje === 'briefing' ? '📋 Briefing'
        : '📬 Mensaje pendiente';

      templateName = 'notificacion_cita_vendedor';
      templateComponents = [{ type: 'body', parameters: [
        { type: 'text', text: tipoLabel },
        { type: 'text', text: nombreCorto },
        { type: 'text', text: 'Responde para ver detalles' },
        { type: 'text', text: msgPreview || 'Tienes un mensaje pendiente' },
        { type: 'text', text: 'Responde cualquier cosa para ver el mensaje completo' }
      ] }];
    }

    console.log(`   📨 Enviando template ${templateName}...`);

    let templateWamid: string | undefined;
    try {
      const templateResult = await meta.sendTemplate(teamMember.phone, templateName, 'es_MX', templateComponents);
      templateWamid = templateResult?.messages?.[0]?.id;
      console.log(`   ✅ Template ${templateName} enviado a ${teamMember.name} (wamid: ${templateWamid?.substring(0, 20)}...)`);
    } catch (templateError: any) {
      console.error(`   ❌ Template ${templateName} falló: ${templateError?.message}`);

      // Si falló, intentar el template resumen_vendedor como fallback
      if (templateName !== REACTIVATION_TEMPLATE) {
        console.log(`   🔄 Intentando fallback con template genérico ${REACTIVATION_TEMPLATE}...`);
        try {
          const fallbackComponents = [{ type: 'body', parameters: [
            { type: 'text', text: nombreCorto },
            { type: 'text', text: '-' },
            { type: 'text', text: '-' },
            { type: 'text', text: '-' },
            { type: 'text', text: '-' },
            { type: 'text', text: 'Responde para ver tu mensaje pendiente.' }
          ] }];
          const fallbackResult = await meta.sendTemplate(teamMember.phone, REACTIVATION_TEMPLATE, 'es_MX', fallbackComponents);
          templateWamid = fallbackResult?.messages?.[0]?.id;
          console.log(`   ✅ Fallback ${REACTIVATION_TEMPLATE} enviado a ${teamMember.name} (wamid: ${templateWamid?.substring(0, 20)}...)`);
        } catch (fallbackError: any) {
          console.error(`   ❌ Fallback también falló: ${fallbackError?.message}`);
          // Guardar como pending para reintento cuando la ventana se abra
          if (guardarPending) {
            try {
              await guardarMensajePending(supabase, teamMember.id, notasActuales, pendingKey, mensaje, expirationHours);
              console.log(`   💾 Guardado como pending para reintento posterior`);
            } catch (pendingSaveErr) {
              console.error(`   ❌ CRITICAL: Pending TAMPOCO se guardó — mensaje PERDIDO:`, pendingSaveErr);
            }
          }
          // VENDEDOR CIEGO FIX: Log critical error — TODOS los paths fallaron
          try {
            const { logErrorToDB } = await import('../crons/healthCheck');
            await logErrorToDB(supabase, 'team_notification_all_failed', `Todos los paths de notificación fallaron para ${teamMember.name} (${teamMember.phone}). templateOverride + fallback ambos fallaron.`, {
              severity: 'critical', source: 'enviarMensajeTeamMember:templateOverride+fallback',
              context: { teamMemberId: teamMember.id, teamMemberName: teamMember.name, tipoMensaje, pendingKey, mensajePreview: mensaje.substring(0, 100) }
            });
          } catch (logErr) { console.error('⚠️ logErrorToDB failed (templateOverride+fallback):', logErr); }
          return { success: false, method: 'failed', ventanaAbierta: false };
        }
      } else {
        // Template genérico también falló — guardar como pending
        if (guardarPending) {
          try {
            await guardarMensajePending(supabase, teamMember.id, notasActuales, pendingKey, mensaje, expirationHours);
            console.log(`   💾 Guardado como pending para reintento posterior`);
          } catch (pendingSaveErr) {
            console.error(`   ❌ CRITICAL: Pending TAMPOCO se guardó — mensaje PERDIDO:`, pendingSaveErr);
          }
        }
        // VENDEDOR CIEGO FIX: Log critical error — template genérico falló
        try {
          const { logErrorToDB } = await import('../crons/healthCheck');
          await logErrorToDB(supabase, 'team_notification_all_failed', `Template genérico falló para ${teamMember.name} (${teamMember.phone}). Mensaje guardado como pending pero vendedor NO fue notificado.`, {
            severity: 'critical', source: 'enviarMensajeTeamMember:genericTemplateFailed',
            context: { teamMemberId: teamMember.id, teamMemberName: teamMember.name, tipoMensaje, pendingKey, mensajePreview: mensaje.substring(0, 100) }
          });
        } catch (logErr) { console.error('⚠️ logErrorToDB failed (genericTemplateFailed):', logErr); }
        return { success: false, method: 'failed', ventanaAbierta: false };
      }
    }

    // 5. Template enviado exitosamente → Guardar mensaje como pending
    if (guardarPending) {
      try {
        await guardarMensajePending(supabase, teamMember.id, notasActuales, pendingKey, mensaje, expirationHours, templateWamid, tipoMensaje);
      } catch (pendingSaveErr) {
        console.error(`   ⚠️ Template enviado pero pending NO se guardó:`, pendingSaveErr);
        // Template ya se envió, no es crítico pero el mensaje no se entregará cuando respondan
      }
    }

    return { success: true, method: 'template', ventanaAbierta: false, messageId: templateWamid };

  } catch (error) {
    console.error(`❌ Error en enviarMensajeTeamMember para ${teamMember.name}:`, error);
    // VENDEDOR CIEGO FIX: Log critical error — excepción inesperada
    try {
      const { logErrorToDB } = await import('../crons/healthCheck');
      await logErrorToDB(supabase, 'team_notification_crashed', `enviarMensajeTeamMember crasheó para ${teamMember.name}: ${error instanceof Error ? error.message : String(error)}`, {
        severity: 'critical', source: 'enviarMensajeTeamMember:outerCatch',
        stack: error instanceof Error ? error.stack : undefined,
        context: { teamMemberId: teamMember.id, teamMemberName: teamMember.name, tipoMensaje, pendingKey }
      });
    } catch (logErr) { console.error('⚠️ logErrorToDB failed (outerCatch):', logErr); }
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
  expirationHours: number,
  wamid?: string | null,
  tipoMensaje?: string
): Promise<void> {
  const ahora = new Date();
  const expiresAt = new Date(ahora.getTime() + expirationHours * 60 * 60 * 1000);

  const nuevasNotas = {
    ...notasActuales,
    [pendingKey]: {
      sent_at: ahora.toISOString(),
      mensaje_completo: mensaje,
      expires_at: expiresAt.toISOString(),
      wamid: wamid || null
    }
  };

  // Guardar wamid en tracking array para verificación de delivery
  if (wamid) {
    nuevasNotas.last_team_message_wamids = [
      ...(notasActuales.last_team_message_wamids || []).slice(-4),
      { wamid, sent_at: ahora.toISOString(), tipo: tipoMensaje || 'notificacion' }
    ];
  }

  const { error: pendingError } = await supabase.client
    .from('team_members')
    .update({ notes: JSON.stringify(nuevasNotas) })
    .eq('id', teamMemberId);

  if (pendingError) {
    console.error(`   ⚠️ Error guardando pending:`, pendingError);
    try {
      const { logErrorToDB } = await import('../crons/healthCheck');
      await logErrorToDB(supabase, 'pending_message_save_failed', `Error guardando ${pendingKey} para team member ${teamMemberId}: ${pendingError.message || JSON.stringify(pendingError)}`, {
        severity: 'error',
        source: 'teamMessaging.guardarMensajePending',
        context: { teamMemberId, pendingKey, tipoMensaje, dbError: pendingError.code || pendingError.message }
      });
    } catch (logErr) { console.error('⚠️ logErrorToDB failed (guardarMensajePending):', logErr); }
    // Propagar error para que el caller sepa que el pending NO se guardó
    throw new Error(`Failed to save pending ${pendingKey}: ${pendingError.message || pendingError.code}`);
  } else {
    console.log(`   💾 Mensaje guardado como ${pendingKey} (expira en ${expirationHours}h)${wamid ? `, wamid: ${wamid.substring(0, 15)}...` : ''}`);
  }
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
    { key: 'pending_alerta_lead', type: 'alerta_lead', priority: 1 },
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

  // Verificar horario permitido (DST-aware)
  const horaAjustada = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).getHours();

  if (horaAjustada < CALL_CONFIG.horasPermitidas.inicio || horaAjustada >= CALL_CONFIG.horasPermitidas.fin) {
    console.log(`   ⏰ Fuera de horario para llamar (${horaAjustada}h México)`);
    return { success: false, error: 'Fuera de horario permitido para llamadas' };
  }

  // Verificar límite de llamadas por día
  const notasActuales = safeJsonParse(teamMember.notes);

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
    return { llamadas: 0, errores: 1, detalles: [] };
  }

  const ahora = Date.now();
  const dosHorasMs = CALL_CONFIG.esperaAntesLlamar * 60 * 60 * 1000;

  for (const tm of teamMembers) {
    const notas = safeJsonParse(tm.notes);

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
  // DST-aware: uses Intl API via getMexicoNow()
  const now = new Date();
  const mexicoStr = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const horaAjustada = new Date(mexicoStr).getHours();
  return horaAjustada >= CALL_CONFIG.horasPermitidas.inicio && horaAjustada < CALL_CONFIG.horasPermitidas.fin;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICACIÓN DE DELIVERY DE MENSAJES AL EQUIPO
 * Detecta mensajes aceptados por Meta pero nunca entregados (ej: número bloqueado)
 * Ejecutar cada 10 minutos desde CRON
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function verificarDeliveryTeamMessages(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  adminPhone: string,
  env?: { SARA_CACHE?: any }
): Promise<{ checked: number; delivered: number; undelivered: number; detalles: any[] }> {
  console.log('📬 Verificando delivery de mensajes al equipo...');

  let checked = 0;
  let delivered = 0;
  let undelivered = 0;
  const detalles: any[] = [];

  try {
    // 1. Obtener todos los team members activos
    const { data: teamMembers, error } = await supabase.client
      .from('team_members')
      .select('id, name, phone, notes')
      .eq('active', true);

    if (error || !teamMembers) {
      console.error('❌ Error obteniendo team members para delivery check:', error);
      return { checked: 0, delivered: 0, undelivered: 0, detalles: [] };
    }

    const ahora = Date.now();
    const TREINTA_MIN = 30 * 60 * 1000;
    const VEINTICUATRO_H = 24 * 60 * 60 * 1000;

    for (const tm of teamMembers) {
      const notas = safeJsonParse(tm.notes);

      // 2. Recopilar wamids de: last_team_message_wamids + pending keys con wamid
      const wamidsToCheck: Array<{ wamid: string; sent_at: string; tipo: string; source: string }> = [];

      // De last_team_message_wamids
      if (Array.isArray(notas.last_team_message_wamids)) {
        for (const entry of notas.last_team_message_wamids) {
          if (entry?.wamid) {
            wamidsToCheck.push({ ...entry, source: 'direct' });
          }
        }
      }

      // De pending keys
      for (const key of Object.keys(PENDING_KEY_CONFIG)) {
        const pendingKey = PENDING_KEY_CONFIG[key];
        const pending = notas[pendingKey];
        if (pending?.wamid && pending?.sent_at) {
          wamidsToCheck.push({
            wamid: pending.wamid,
            sent_at: pending.sent_at,
            tipo: key,
            source: 'pending'
          });
        }
      }

      if (wamidsToCheck.length === 0) continue;

      // 3. Filtrar: solo wamids con >30 min y <24h de antigüedad
      const wamidsFiltrados = wamidsToCheck.filter(w => {
        const sentAt = new Date(w.sent_at).getTime();
        const edad = ahora - sentAt;
        return edad > TREINTA_MIN && edad < VEINTICUATRO_H;
      });

      if (wamidsFiltrados.length === 0) continue;

      // 4. Consultar message_delivery_status por cada wamid
      const wamidIds = wamidsFiltrados.map(w => w.wamid);
      const { data: statusRows } = await supabase.client
        .from('message_delivery_status')
        .select('message_id, status, error_code')
        .in('message_id', wamidIds);

      const statusMap = new Map<string, string>();
      const errorCodeMap = new Map<string, string>();
      if (statusRows) {
        for (const row of statusRows) {
          statusMap.set(row.message_id, row.status);
          if (row.error_code) errorCodeMap.set(row.message_id, row.error_code);
        }
      }

      // 5. Clasificar cada wamid
      let tmUndelivered = 0;
      const cleanWamids: string[] = []; // wamids delivered/read para limpiar

      for (const w of wamidsFiltrados) {
        checked++;
        const status = statusMap.get(w.wamid);
        const errorCode = errorCodeMap.get(w.wamid);

        if (status === 'delivered' || status === 'read') {
          delivered++;
          cleanWamids.push(w.wamid);
        } else if (status === 'failed' && errorCode === '131049') {
          // 131049 = Meta frequency capping (MARKETING templates bloqueados)
          // No es un fallo real — el mensaje pending se entregará cuando respondan
          // Limpiar wamid del tracking para no seguir reportando
          cleanWamids.push(w.wamid);
          console.log(`   ⚠️ [131049] Frequency capping: ${tm.name} (${w.tipo}) — pending entregará al responder`);
        } else {
          // sent, failed (otro error), o no existe en la tabla → no entregado
          undelivered++;
          tmUndelivered++;
          detalles.push({
            nombre: tm.name,
            telefono: tm.phone,
            wamid: w.wamid,
            tipo: w.tipo,
            status: status || 'no_callback',
            sent_at: w.sent_at,
            edad_min: Math.round((ahora - new Date(w.sent_at).getTime()) / 60000)
          });
        }
      }

      // 6. Limpiar wamids entregados del tracking
      if (cleanWamids.length > 0 && Array.isArray(notas.last_team_message_wamids)) {
        notas.last_team_message_wamids = notas.last_team_message_wamids.filter(
          (w: any) => !cleanWamids.includes(w?.wamid)
        );
      }

      // 7. Guardar delivery_issues si hay problemas
      if (tmUndelivered > 0) {
        notas.delivery_issues = {
          count: tmUndelivered,
          last_checked: new Date().toISOString(),
          detalles: detalles.filter(d => d.telefono === tm.phone).slice(-3)
        };
      } else {
        // Limpiar issues previos si ya se resolvieron
        delete notas.delivery_issues;
      }

      // Actualizar notes
      await supabase.client.from('team_members').update({ notes: notas }).eq('id', tm.id);
    }

    // 8. Si hay undelivered → enviar alerta al admin (agrupada por persona)
    if (undelivered > 0) {
      // Agrupar por persona para evitar entradas duplicadas
      const porPersona = new Map<string, { tipos: string[]; status: string; edad_max: number }>();
      for (const d of detalles) {
        const existing = porPersona.get(d.nombre);
        if (existing) {
          if (!existing.tipos.includes(d.tipo)) existing.tipos.push(d.tipo);
          existing.edad_max = Math.max(existing.edad_max, d.edad_min);
        } else {
          porPersona.set(d.nombre, { tipos: [d.tipo], status: d.status, edad_max: d.edad_min });
        }
      }

      const resumen = Array.from(porPersona.entries()).map(([nombre, info]) =>
        `- ${nombre}: ${info.tipos.join(', ')} (${info.status}, hace ${info.edad_max}min)`
      ).join('\n');

      const personas = porPersona.size;
      const alerta = `⚠️ *ALERTA: ${undelivered} msg sin entregar a ${personas} persona(s)*\n\n` +
        `${resumen}\n\n` +
        `Causas: bloqueó SARA / sin internet / error Meta\n` +
        `✅ ${delivered} entregados | ❌ ${undelivered} sin entregar`;

      try {
        await enviarAlertaSistema(meta, alerta, env, 'delivery_undelivered');
        console.log(`📬 Alerta de delivery enviada al admin (${undelivered} sin entregar a ${personas} personas)`);
      } catch (alertError) {
        console.error('❌ Error enviando alerta de delivery al admin:', alertError);
      }
    }

    console.log(`📬 Delivery check completado: ${checked} verificados, ${delivered} entregados, ${undelivered} sin entregar`);
  } catch (err) {
    console.error('❌ Error en verificarDeliveryTeamMessages:', err);
  }

  return { checked, delivered, undelivered, detalles };
}
