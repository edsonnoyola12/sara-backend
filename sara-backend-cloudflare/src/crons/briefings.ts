/**
 * BRIEFINGS Y RECAPS - Mensajes programados al equipo
 *
 * Funciones:
 * - enviarFelicitaciones: Cumpleaños del equipo
 * - logEvento: Logger a Supabase
 * - ejecutarTareaOneTime: Ejecutar tareas sin duplicados
 * - enviarBriefingMatutino: Briefing 8 AM
 * - enviarRecapDiario: Recap 7 PM
 * - enviarRecapSemanal: Recap viernes
 * - enviarRecordatoriosCitas: Recordatorios 24h y 2h
 * - recordatorioAsesores: Recordatorio a asesores
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { createTTSService } from '../services/ttsService';
import { safeJsonParse } from '../utils/safeHelpers';
import { parseNotasSafe, formatVendorFeedback } from '../handlers/whatsapp-utils';

// ═══════════════════════════════════════════════════════════
// FELICITACIONES DE CUMPLEAÑOS - TEAM MEMBERS
// ═══════════════════════════════════════════════════════════
export async function enviarFelicitaciones(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  const fechaHoy = `${mes}-${dia}`;

  const { data: cumples } = await supabase.client
    .from('team_members')
    .select('*')
    .like('birthday', `%-${fechaHoy}`);

  for (const persona of cumples || []) {
    if (!persona.phone) continue;
    const mensaje = `🎂 *¡Feliz Cumpleaños ${persona.name}!* 🎉\n\nTodo el equipo de Santa Rita te desea un día increíble. ¡Que se cumplan todos tus sueños! 🌟`;
    await enviarMensajeTeamMember(supabase, meta, persona, mensaje, {
      tipoMensaje: 'notificacion',
      pendingKey: 'pending_mensaje'
    });
    await logEvento(supabase, 'cumpleanos', `Felicitación enviada a ${persona.name}`, { phone: persona.phone });
  }
}

// ═══════════════════════════════════════════════════════════
// Helper: Loggear eventos importantes a Supabase
// ═══════════════════════════════════════════════════════════
export async function logEvento(
  supabase: SupabaseService,
  tipo: string,
  mensaje: string,
  datos?: any
): Promise<void> {
  try {
    await supabase.client.from('sara_logs').insert({
      tipo,
      mensaje,
      datos: datos || {},
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Error logging evento:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// Helper: Ejecutar tarea one-time sin duplicados
// Usa system_config para trackear si ya se ejecutó
// ═══════════════════════════════════════════════════════════
export async function ejecutarTareaOneTime(
  supabase: SupabaseService,
  taskId: string,
  tarea: () => Promise<void>
): Promise<boolean> {
  const key = `onetime_${taskId}_done`;

  // Verificar si ya se ejecutó
  const { data: yaEjecutado } = await supabase.client
    .from('system_config')
    .select('value')
    .eq('key', key)
    .single();

  if (yaEjecutado) {
    console.log(`⏭️ Tarea one-time "${taskId}" ya fue ejecutada, saltando...`);
    return false;
  }

  // Marcar como ejecutada ANTES de ejecutar (evita race condition con CRON cada 2 min)
  await supabase.client.from('system_config').upsert({
    key: key,
    value: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Ejecutar la tarea
  console.log(`🚀 Ejecutando tarea one-time: ${taskId}`);
  await tarea();
  console.log(`✅ Tarea one-time "${taskId}" completada`);

  return true;
}

// ═══════════════════════════════════════════════════════════
// PREFETCH: Cargar datos en batch para todos los vendedores
// Evita N queries por vendedor (45+ → 6 queries totales)
// ═══════════════════════════════════════════════════════════
export interface BriefingPrefetchData {
  allCitasHoy: any[];
  allLeadsNew: any[];
  allLeadsEstancados: any[];
  allHipotecasEstancadas: any[];
  allCumpleaneros: any[];
  promos: any[];
}

export async function prefetchBriefingData(supabase: SupabaseService): Promise<BriefingPrefetchData> {
  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];
  const hace3dias = new Date();
  hace3dias.setDate(hace3dias.getDate() - 3);
  const hace7dias = new Date();
  hace7dias.setDate(hace7dias.getDate() - 7);
  const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
  const diaActual = String(hoy.getDate()).padStart(2, '0');

  // 6 queries en paralelo en vez de 5-6 POR vendedor
  const [citasRes, leadsNewRes, leadsStaleRes, hipsRes, cumplesRes, promosRes] = await Promise.all([
    supabase.client
      .from('appointments')
      .select('*, leads(name, phone, notes)')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled')
      .order('scheduled_time', { ascending: true }),
    supabase.client
      .from('leads')
      .select('name, phone, created_at, assigned_to')
      .eq('status', 'new'),
    supabase.client
      .from('leads')
      .select('name, phone, status, updated_at, assigned_to')
      .in('status', ['contacted', 'appointment_scheduled'])
      .lt('updated_at', hace3dias.toISOString()),
    supabase.client
      .from('mortgage_applications')
      .select('lead_name, bank, status, updated_at, assigned_advisor_id')
      .in('status', ['pending', 'in_review', 'documents', 'sent_to_bank'])
      .lt('updated_at', hace7dias.toISOString()),
    supabase.client
      .from('leads')
      .select('name, phone, assigned_to')
      .ilike('birthday', `%-${mesActual}-${diaActual}`),
    supabase.client
      .from('promotions')
      .select('name, development, discount_percent, end_date')
      .lte('start_date', hoyStr)
      .gte('end_date', hoyStr)
      .eq('status', 'active')
      .limit(3),
  ]);

  return {
    allCitasHoy: citasRes.data || [],
    allLeadsNew: leadsNewRes.data || [],
    allLeadsEstancados: leadsStaleRes.data || [],
    allHipotecasEstancadas: hipsRes.data || [],
    allCumpleaneros: cumplesRes.data || [],
    promos: promosRes.data || [],
  };
}

// ═══════════════════════════════════════════════════════════
// BRIEFING MATUTINO - 8 AM L-V
// ═══════════════════════════════════════════════════════════
export async function enviarBriefingMatutino(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any, options?: { openaiApiKey?: string; prefetchedData?: BriefingPrefetchData }): Promise<void> {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`📋 BRIEFING MATUTINO - Iniciando para: ${vendedor.name}`);
  console.log(`   📱 Teléfono: ${vendedor.phone}`);
  console.log(`   👤 Rol: ${vendedor.role}`);
  console.log(`   🆔 ID: ${vendedor.id}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaFormato = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;
  console.log(`   📅 Fecha: ${fechaFormato} (${hoyStr})`);

  // Tips de uso de SARA para el briefing
  const TIPS_SARA = [
    '💡 *Tip:* Escribe *bridge Juan* para chatear directo con tu lead sin que SARA intervenga.',
    '💡 *Tip:* Escribe *mis leads* para ver todos tus prospectos y su estado actual.',
    '💡 *Tip:* Escribe *cita María mañana 4pm* para agendar una visita rápidamente.',
    '💡 *Tip:* Escribe *enviar video a Pedro* para mandarle el video del desarrollo.',
    '💡 *Tip:* Escribe *resumen* para ver un reporte rápido de tu día.',
    '💡 *Tip:* Escribe *#ayuda* para ver todos los comandos disponibles.',
    '💡 *Tip:* Usa *confirmar cita* cuando tu lead confirme asistencia.',
    '💡 *Tip:* Escribe *status Juan compró* para actualizar el estado de tu lead.',
    '💡 *Tip:* SARA te avisa 2h antes de cada cita. ¡No olvides confirmar!',
    '💡 *Tip:* Responde rápido a leads nuevos - cada minuto cuenta para la conversión.',
    '💡 *Tip:* Escribe *enviar GPS a María* para compartir la ubicación del desarrollo.',
    '💡 *Tip:* Si un lead no responde, escribe *seguimiento Juan* para reactivarlo.',
  ];
  const tipDelDia = TIPS_SARA[hoy.getDate() % TIPS_SARA.length]; // Tip diferente cada día

  // PROTECCIÓN ANTI-DUPLICADOS
  console.log(`   🔍 Verificando duplicados - last_briefing_sent: ${vendedor.last_briefing_sent || 'nunca'}`);
  if (vendedor.last_briefing_sent === hoyStr) {
    console.log(`⏭️ SKIP: Briefing ya enviado hoy a ${vendedor.name}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);
    return;
  }
  console.log(`   ✅ No hay duplicado, continuando...`);

  // ═══════════════════════════════════════════════════════════
  // DATOS: Usar prefetch si disponible, sino queries individuales
  // ═══════════════════════════════════════════════════════════
  console.log(`\n   📊 ${options?.prefetchedData ? 'USANDO DATOS PRE-CARGADOS' : 'CONSULTANDO DATOS'}...`);

  let citasHoy: any[];
  let leadsSinContactar: any[];
  let leadsEstancados: any[];
  let hipotecasEstancadas: any[];
  let cumpleaneros: any[];
  let promos: any[];

  if (options?.prefetchedData) {
    // Filtrar datos pre-cargados por vendedor (0 queries)
    const pf = options.prefetchedData;
    citasHoy = pf.allCitasHoy.filter((c: any) => c.team_member_id === vendedor.id);
    leadsSinContactar = pf.allLeadsNew.filter((l: any) => l.assigned_to === vendedor.id);
    leadsEstancados = pf.allLeadsEstancados.filter((l: any) => l.assigned_to === vendedor.id);
    hipotecasEstancadas = vendedor.role === 'asesor'
      ? pf.allHipotecasEstancadas.filter((h: any) => h.assigned_advisor_id === vendedor.id)
      : [];
    cumpleaneros = pf.allCumpleaneros.filter((c: any) => c.assigned_to === vendedor.id);
    promos = pf.promos;
  } else {
    // Fallback: queries individuales (para /test-briefing endpoint)
    const { data: c } = await supabase.client
      .from('appointments').select('*, leads(name, phone, notes)')
      .eq('team_member_id', vendedor.id).eq('scheduled_date', hoyStr).eq('status', 'scheduled')
      .order('scheduled_time', { ascending: true });
    citasHoy = c || [];

    const { data: ln } = await supabase.client
      .from('leads').select('name, phone, created_at')
      .eq('assigned_to', vendedor.id).eq('status', 'new');
    leadsSinContactar = ln || [];

    const hace3dias = new Date();
    hace3dias.setDate(hace3dias.getDate() - 3);
    const { data: le } = await supabase.client
      .from('leads').select('name, phone, status, updated_at')
      .eq('assigned_to', vendedor.id).in('status', ['contacted', 'appointment_scheduled'])
      .lt('updated_at', hace3dias.toISOString());
    leadsEstancados = le || [];

    hipotecasEstancadas = [];
    if (vendedor.role === 'asesor') {
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);
      const { data: hips } = await supabase.client
        .from('mortgage_applications').select('lead_name, bank, status, updated_at')
        .eq('assigned_advisor_id', vendedor.id).in('status', ['pending', 'in_review', 'documents', 'sent_to_bank'])
        .lt('updated_at', hace7dias.toISOString());
      hipotecasEstancadas = hips || [];
    }

    const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
    const diaActual = String(hoy.getDate()).padStart(2, '0');
    const { data: cu } = await supabase.client
      .from('leads').select('name, phone')
      .eq('assigned_to', vendedor.id).ilike('birthday', `%-${mesActual}-${diaActual}`);
    cumpleaneros = cu || [];

    const { data: pr } = await supabase.client
      .from('promotions').select('name, development, discount_percent, end_date')
      .lte('start_date', hoyStr).gte('end_date', hoyStr).eq('status', 'active').limit(3);
    promos = pr || [];
  }

  console.log(`   🗓️ Citas hoy: ${citasHoy.length}`);
  console.log(`   🆕 Leads sin contactar: ${leadsSinContactar.length}`);
  console.log(`   ⏳ Leads estancados: ${leadsEstancados.length}`);

  // ═══════════════════════════════════════════════════════════
  // CONSTRUIR MENSAJE CONSOLIDADO
  // ═══════════════════════════════════════════════════════════
  let mensaje = `📋 *BRIEFING DIARIO*\n`;
  mensaje += `${fechaFormato}\n\n`;

  // Citas
  mensaje += `🗓️ *CITAS HOY*`;
  if (citasHoy && citasHoy.length > 0) {
    mensaje += ` (${citasHoy.length}):\n`;
    citasHoy.forEach((c: any) => {
      mensaje += `  • ${(c.scheduled_time || '').substring(0,5)} - ${c.leads?.name || 'Cliente'}\n`;
    });
  } else {
    mensaje += `: Sin citas\n`;
  }

  // Feedback post-visita de leads con cita hoy
  const feedbackEntries: string[] = [];
  if (citasHoy && citasHoy.length > 0) {
    citasHoy.forEach((c: any) => {
      const fb = formatVendorFeedback(c.leads?.notes);
      if (fb) feedbackEntries.push(`  • ${c.leads?.name || 'Cliente'}: ${fb}`);
    });
  }
  if (feedbackEntries.length > 0) {
    mensaje += `\n📝 *FEEDBACK POST-VISITA*:\n`;
    feedbackEntries.slice(0, 3).forEach(e => { mensaje += e + '\n'; });
  }

  // Acciones requeridas
  const totalAcciones = (leadsSinContactar?.length || 0) + (leadsEstancados?.length || 0) + hipotecasEstancadas.length;
  if (totalAcciones > 0) {
    mensaje += `\n⚠️ *REQUIEREN ACCIÓN* (${totalAcciones}):\n`;

    if (leadsSinContactar && leadsSinContactar.length > 0) {
      leadsSinContactar.slice(0, 3).forEach((l: any) => {
        mensaje += `  • ${l.name || 'Sin nombre'} - sin contactar\n`;
      });
      if (leadsSinContactar.length > 3) {
        mensaje += `  _...y ${leadsSinContactar.length - 3} más_\n`;
      }
    }

    if (leadsEstancados && leadsEstancados.length > 0) {
      leadsEstancados.slice(0, 3).forEach((l: any) => {
        const diasSinMover = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / (1000*60*60*24));
        mensaje += `  • ${l.name || 'Sin nombre'} - ${diasSinMover}d sin actividad\n`;
      });
      if (leadsEstancados.length > 3) {
        mensaje += `  _...y ${leadsEstancados.length - 3} más_\n`;
      }
    }

    if (hipotecasEstancadas.length > 0) {
      hipotecasEstancadas.slice(0, 2).forEach((h: any) => {
        mensaje += `  • 🏦 ${h.lead_name} - hipoteca estancada\n`;
      });
    }
  } else {
    mensaje += `\n✅ *Sin acciones pendientes urgentes*\n`;
  }

  // Cumpleaños
  if (cumpleaneros && cumpleaneros.length > 0) {
    mensaje += `\n🎂 *CUMPLEAÑOS*:\n`;
    cumpleaneros.forEach((c: any) => {
      mensaje += `  • ${c.name}\n`;
    });
  }

  // Promociones
  if (promos && promos.length > 0) {
    mensaje += `\n💰 *PROMOS ACTIVAS*:\n`;
    promos.forEach((p: any) => {
      const diasRestantes = Math.ceil((new Date(p.end_date).getTime() - hoy.getTime()) / (1000*60*60*24));
      mensaje += `  • ${p.name} (${diasRestantes}d restantes)\n`;
    });
  }

  // Tip del día
  mensaje += `\n${tipDelDia}\n`;
  mensaje += `\n_¡Éxito hoy!_ 💪`;

  // ═══════════════════════════════════════════════════════════
  // ENVIAR BRIEFING - Estrategia inteligente:
  // - Si tiene ventana 24h abierta → enviar directo
  // - Si NO tiene ventana → enviar template + guardar pending
  // ═══════════════════════════════════════════════════════════
  console.log(`\n   📤 PREPARANDO ENVÍO...`);
  try {
    const nombreCorto = vendedor.name?.split(' ')[0] || 'Hola';
    const notasActuales = safeJsonParse(vendedor.notes);

    // Verificar si tiene ventana 24h abierta
    const lastInteraction = notasActuales.last_sara_interaction;
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const tieneVentanaAbierta = lastInteraction && lastInteraction > hace24h;

    console.log(`   🕐 Última interacción con SARA: ${lastInteraction || 'NUNCA'}`);
    console.log(`   🕐 Hace 24h sería: ${hace24h}`);
    console.log(`   🔓 ¿Ventana 24h abierta?: ${tieneVentanaAbierta ? 'SÍ ✅' : 'NO ❌'}`);
    console.log(`   📝 Mensaje tiene ${mensaje.length} caracteres`);

    // ═══ USAR HELPER QUE RESPETA VENTANA 24H ═══
    const templateParams = [
      nombreCorto,
      `${citasHoy?.length || 0} citas`,
      `${totalAcciones} leads`,
      tipDelDia
    ];

    const resultado = await enviarMensajeTeamMember(supabase, meta, vendedor, mensaje, {
      tipoMensaje: 'briefing',
      guardarPending: true,
      pendingKey: 'pending_briefing',
      templateOverride: {
        name: 'briefing_matutino',
        params: templateParams
      },
      // TTS: Enviar briefing también como nota de voz si hay API key
      ttsConfig: options?.openaiApiKey ? {
        enabled: true,
        openaiApiKey: options.openaiApiKey
      } : undefined
    });

    if (resultado.success) {
      // Re-leer notes de BD para no sobreescribir wamid guardado por enviarMensajeTeamMember
      const { data: freshMember } = await supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .maybeSingle();
      const freshNotas = freshMember?.notes ? safeJsonParse(freshMember.notes) : notasActuales;

      // Actualizar notas con contexto del briefing
      freshNotas.last_briefing_context = {
        sent_at: new Date().toISOString(),
        citas: citasHoy?.length || 0,
        delivered: resultado.method === 'direct',
        method: resultado.method
      };
      if (resultado.method === 'direct') {
        delete freshNotas.pending_briefing; // Limpiar si se envió directo
      }

      await supabase.client.from('team_members').update({
        last_briefing_sent: hoyStr,
        notes: JSON.stringify(freshNotas)
      }).eq('id', vendedor.id);

      console.log(`   ✅ Briefing ${resultado.method === 'direct' ? 'enviado DIRECTO' : 'template+pending'} a ${vendedor.name}`);
    } else {
      console.log(`   ❌ Error enviando briefing a ${vendedor.name}`);
    }
  } catch (error) {
    console.error(`\n   ❌ ERROR EN BRIEFING para ${vendedor.name}:`, error);
    console.error(`   ❌ Stack:`, error instanceof Error ? error.stack : 'No stack');
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`✅ BRIEFING COMPLETADO para ${vendedor.name}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

// ═══════════════════════════════════════════════════════════
// RECAP DIARIO - 7 PM L-V (solo si no usó SARA)
// ═══════════════════════════════════════════════════════════
export async function enviarRecapDiario(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

  // PROTECCIÓN ANTI-DUPLICADOS: Verificar si ya se envió hoy
  if (vendedor.last_recap_sent === hoy) {
    console.log(`⏭️ Recap ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // SOLO ENVIAR SI NO USÓ SARA HOY
  // Si ya interactuó con SARA, no necesita el recap
  // ═══════════════════════════════════════════════════════════
  const notasVendedor = safeJsonParse(vendedor.notes);
  const lastInteraction = notasVendedor.last_sara_interaction;

  if (lastInteraction) {
    const fechaInteraccion = lastInteraction.split('T')[0];
    if (fechaInteraccion === hoy) {
      console.log(`⏭️ ${vendedor.name} ya usó SARA hoy (${lastInteraction}), no necesita recap`);
      // Marcar como enviado para no volver a intentar
      await supabase.client.from('team_members').update({ last_recap_sent: hoy }).eq('id', vendedor.id);
      return;
    }
  }

  console.log(`📋 ${vendedor.name} NO usó SARA hoy, enviando recap...`);

  const nombreCorto = vendedor.name?.split(' ')[0] || 'Hola';
  const mensaje = `👋 *${nombreCorto}, ¿cómo te fue hoy?*\n\n` +
    `No te vi por aquí. Cuéntame qué pasó con tus leads:\n\n` +
    `📝 Escribe: *nota [nombre] [qué pasó]*\n` +
    `📋 O solo cuéntame y lo registro por ti.\n\n` +
    `_Ej: "Hablé con Juan, quiere visita el lunes"_`;

  // ═══ USAR HELPER QUE RESPETA VENTANA 24H ═══
  const resultado = await enviarMensajeTeamMember(supabase, meta, vendedor, mensaje, {
    tipoMensaje: 'reporte', // Usa pending_reporte
    guardarPending: true,
    pendingKey: 'pending_recap'
  });

  if (resultado.success) {
    await supabase.client.from('team_members').update({ last_recap_sent: hoy }).eq('id', vendedor.id);
    console.log(`📋 Recap ${resultado.method === 'direct' ? 'enviado DIRECTO' : 'template+pending'} a ${vendedor.name}`);
  } else {
    console.error(`❌ Error enviando recap a ${vendedor.name}`);
  }
}

// ═══════════════════════════════════════════════════════════
// RECAP SEMANAL - Viernes 7 PM
// ═══════════════════════════════════════════════════════════
export async function enviarRecapSemanal(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

  // PROTECCIÓN ANTI-DUPLICADOS: Verificar si ya se envió esta semana
  if (vendedor.last_recap_semanal_sent === hoy) {
    console.log(`⏭️ Recap semanal ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  const mensaje = `*Resumen semanal, ${vendedor.name}*\n\n` +
    `Esta semana trabajaste duro. Revisa tus metricas en el CRM.\n\n` +
    `Disfruta tu fin de semana!`;

  // ═══ USAR HELPER QUE RESPETA VENTANA 24H ═══
  const resultado = await enviarMensajeTeamMember(supabase, meta, vendedor, mensaje, {
    tipoMensaje: 'resumen_semanal',
    guardarPending: true,
    pendingKey: 'pending_resumen_semanal'
  });

  if (resultado.success) {
    await supabase.client.from('team_members').update({ last_recap_semanal_sent: hoy }).eq('id', vendedor.id);
    console.log(`📋 Recap semanal ${resultado.method === 'direct' ? 'enviado DIRECTO' : 'template+pending'} a ${vendedor.name}`);
  } else {
    console.error(`❌ Error enviando recap semanal a ${vendedor.name}`);
  }
}

// ═══════════════════════════════════════════════════════════
// RECORDATORIOS DE CITAS - 24h y 2h antes (CON TTS)
// ═══════════════════════════════════════════════════════════
export async function enviarRecordatoriosCitas(supabase: SupabaseService, meta: MetaWhatsAppService, options?: { openaiApiKey?: string }): Promise<void> {
  const ahora = new Date();
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const en2h = new Date(ahora.getTime() + 2 * 60 * 60 * 1000);

  // Recordatorio 24h antes
  const { data: citas24h } = await supabase.client
    .from('appointments')
    .select('*, leads(name, phone, last_message_at), team_members(name, phone)')
    .eq('status', 'scheduled')
    .eq('reminder_24h_sent', false)
    .gte('scheduled_date', ahora.toISOString().split('T')[0])
    .lte('scheduled_date', en24h.toISOString().split('T')[0]);

  for (const cita of citas24h || []) {
    const lead = cita.leads;
    if (!lead?.phone) continue;

    const nombreCorto = lead.name?.split(' ')[0] || 'Hola';
    const desarrollo = cita.property_interest || 'Santa Rita';
    const ubicacion = cita.location || desarrollo;
    const hora = cita.scheduled_time || '10:00 AM';
    const horaFormateada = hora.substring(0, 5);

    // Verificar ventana de 24h del lead
    const lastMsg = lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0;
    const hace24h = Date.now() - 24 * 60 * 60 * 1000;
    const ventanaAbierta = lastMsg > hace24h;

    try {
      if (ventanaAbierta && options?.openaiApiKey) {
        // ═══ VENTANA ABIERTA: Mensaje directo + TTS ═══
        const mensajePersonalizado = `¡Hola ${nombreCorto}! 📅\n\nTe recordamos tu cita de mañana:\n\n🏠 *${desarrollo}*\n📍 ${ubicacion}\n⏰ ${horaFormateada}\n\n¿Nos confirmas tu asistencia? ¡Te esperamos! 🙌`;

        // Enviar texto
        await meta.sendWhatsAppMessage(lead.phone, mensajePersonalizado);
        console.log(`📅 Recordatorio 24h (directo) enviado a ${lead.name}`);

        // Generar y enviar audio TTS
        try {
          const tts = createTTSService(options.openaiApiKey);
          const textoAudio = `Hola ${nombreCorto}. Te recordamos tu cita de mañana en ${desarrollo}, a las ${horaFormateada}. ¿Nos confirmas tu asistencia? Te esperamos.`;
          const audioResult = await tts.generateAudio(textoAudio);

          if (audioResult.success && audioResult.audioBuffer) {
            await meta.sendVoiceMessage(lead.phone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
            console.log(`🔊 Audio recordatorio enviado a ${lead.name}`);
          }
        } catch (ttsErr) {
          console.log(`⚠️ TTS recordatorio falló (no crítico):`, ttsErr);
        }
      } else {
        // ═══ VENTANA CERRADA: Template (sin audio) ═══
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto },
              { type: 'text', text: desarrollo },
              { type: 'text', text: ubicacion },
              { type: 'text', text: hora }
            ]
          }
        ];

        await meta.sendTemplate(lead.phone, 'recordatorio_cita_24h', 'es_MX', templateComponents);
        console.log(`📅 Recordatorio 24h (template) enviado a ${lead.name}`);
      }

      await supabase.client
        .from('appointments')
        .update({ reminder_24h_sent: true })
        .eq('id', cita.id);
    } catch (err) {
      console.error(`❌ Error enviando recordatorio 24h a ${lead.name}:`, err);
    }
  }

  // Recordatorio 2h antes
  const { data: citas2h } = await supabase.client
    .from('appointments')
    .select('*, leads(name, phone, last_message_at), team_members(name, phone)')
    .eq('status', 'scheduled')
    .eq('reminder_2h_sent', false)
    .gte('scheduled_date', ahora.toISOString().split('T')[0])
    .lte('scheduled_date', en2h.toISOString().split('T')[0]);

  for (const cita of citas2h || []) {
    const lead = cita.leads;
    if (!lead?.phone) continue;

    const nombreCorto = lead.name?.split(' ')[0] || 'Hola';
    const desarrollo = cita.property_interest || 'Santa Rita';
    const ubicacion = cita.location || desarrollo;
    const hora = cita.scheduled_time || '10:00';
    const horaFormateada = hora.substring(0, 5);

    // Verificar ventana de 24h del lead
    const lastMsg = lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0;
    const hace24h = Date.now() - 24 * 60 * 60 * 1000;
    const ventanaAbierta = lastMsg > hace24h;

    try {
      if (ventanaAbierta && options?.openaiApiKey) {
        // ═══ VENTANA ABIERTA: Mensaje directo + TTS ═══
        const mensajePersonalizado = `⏰ ¡${nombreCorto}, tu cita es en 2 horas!\n\n🏠 *${desarrollo}*\n📍 ${ubicacion}\n\n¡Te esperamos! 🙌`;

        // Enviar texto
        await meta.sendWhatsAppMessage(lead.phone, mensajePersonalizado);
        console.log(`⏰ Recordatorio 2h (directo) enviado a ${lead.name}`);

        // Generar y enviar audio TTS
        try {
          const tts = createTTSService(options.openaiApiKey);
          const textoAudio = `${nombreCorto}, tu cita es en 2 horas en ${desarrollo}. ¡Te esperamos!`;
          const audioResult = await tts.generateAudio(textoAudio);

          if (audioResult.success && audioResult.audioBuffer) {
            await meta.sendVoiceMessage(lead.phone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
            console.log(`🔊 Audio recordatorio 2h enviado a ${lead.name}`);
          }
        } catch (ttsErr) {
          console.log(`⚠️ TTS recordatorio 2h falló (no crítico):`, ttsErr);
        }
      } else {
        // ═══ VENTANA CERRADA: Template (sin audio) ═══
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto },
              { type: 'text', text: desarrollo },
              { type: 'text', text: ubicacion }
            ]
          }
        ];

        await meta.sendTemplate(lead.phone, 'recordatorio_cita_2h', 'es_MX', templateComponents);
        console.log(`⏰ Recordatorio 2h (template) enviado a ${lead.name}`);
      }

      await supabase.client
        .from('appointments')
        .update({ reminder_2h_sent: true })
        .eq('id', cita.id);
    } catch (err) {
      console.error(`❌ Error enviando recordatorio 2h a ${lead.name}:`, err);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// RECORDATORIO A VENDEDORES Y ASESORES
// ═══════════════════════════════════════════════════════════
export async function recordatorioAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  // 1. Recordatorio a VENDEDORES sobre leads sin contactar
  const { data: vendedores } = await supabase.client
    .from('team_members')
    .select('*')
    .eq('role', 'vendedor')
    .eq('active', true);

  for (const v of vendedores || []) {
    if (!v.phone || !v.recibe_briefing) continue;

    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', v.id)
      .eq('status', 'new');

    if (leadsSinContactar && leadsSinContactar.length > 0) {
      const mensaje = `💬 *Recordatorio de seguimiento*

${v.name}, tienes ${leadsSinContactar.length} lead(s) nuevos sin contactar.

Revísalos en el CRM y márcalos como contactados.`;

      await enviarMensajeTeamMember(supabase, meta, v, mensaje, {
        tipoMensaje: 'notificacion',
        pendingKey: 'pending_mensaje'
      });
    }
  }

  // 2. Recordatorio a ASESORES HIPOTECARIOS sobre hipotecas sin movimiento
  const { data: asesores } = await supabase.client
    .from('team_members')
    .select('*')
    .eq('role', 'asesor')
    .eq('active', true);

  // Buscar hipotecas sin movimiento en los últimos 3 días (configurable)
  const diasSinMovimiento = 3;
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasSinMovimiento);

  for (const asesor of asesores || []) {
    if (!asesor.phone || asesor.is_active === false) continue;

    const { data: hipotecasSinMover } = await supabase.client
      .from('mortgage_applications')
      .select('*')
      .eq('assigned_advisor_id', asesor.id)
      .in('status', ['pending', 'in_review', 'documents'])
      .lt('updated_at', fechaLimite.toISOString());

    if (hipotecasSinMover && hipotecasSinMover.length > 0) {
      let mensaje = `🏦 *Recordatorio de Créditos*

${asesor.name}, tienes ${hipotecasSinMover.length} solicitud(es) sin actualizar en ${diasSinMovimiento}+ días:

`;

      hipotecasSinMover.slice(0, 5).forEach((h: any, i: number) => {
        mensaje += `${i + 1}. ${h.lead_name} - ${h.bank || 'Banco por definir'}
`;
      });

      if (hipotecasSinMover.length > 5) {
        mensaje += `\n...y ${hipotecasSinMover.length - 5} más`;
      }

      mensaje += `
⚡ Actualiza el status en el CRM`;

      await enviarMensajeTeamMember(supabase, meta, asesor, mensaje, {
        tipoMensaje: 'notificacion',
        pendingKey: 'pending_mensaje'
      });
      console.log('📤 Recordatorio enviado a asesor:', asesor.name, '-', hipotecasSinMover.length, 'hipotecas');
    }
  }
}
