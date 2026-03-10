/**
 * Follow-up and Nurturing CRON Functions
 * Extracted from index.ts - Phase 3 refactoring
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { BroadcastQueueService } from '../services/broadcastQueueService';
import { logEvento } from './briefings';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { enviarMensajeLead } from '../utils/leadMessaging';
import { safeJsonParse } from '../utils/safeHelpers';
import { formatPhoneForDisplay } from '../handlers/whatsapp-utils';
import { logErrorToDB } from './healthCheck';

// ═══════════════════════════════════════════════════════════════════════════
// LÍMITE DE MENSAJES AUTOMÁTICOS POR DÍA
// ═══════════════════════════════════════════════════════════════════════════
const MAX_MENSAJES_AUTOMATICOS_POR_DIA = 2;

export async function puedeEnviarMensajeAutomatico(supabase: SupabaseService, leadId: string): Promise<boolean> {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    // Obtener lead y verificar contador de mensajes hoy
    const { data: lead } = await supabase.client
      .from('leads')
      .select('notes')
      .eq('id', leadId)
      .single();

    if (!lead) return false;

    const notes = safeJsonParse(lead.notes);
    const mensajesHoy = notes.mensajes_automaticos_hoy || { fecha: '', count: 0 };

    // Si es un nuevo día, resetear contador
    if (mensajesHoy.fecha !== hoy) {
      return true; // Primer mensaje del día
    }

    // Verificar límite
    if (mensajesHoy.count >= MAX_MENSAJES_AUTOMATICOS_POR_DIA) {
      console.log(`⏭️ Lead ${leadId} ya recibió ${mensajesHoy.count} mensajes automáticos hoy (límite: ${MAX_MENSAJES_AUTOMATICOS_POR_DIA})`);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error verificando límite mensajes:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'puedeEnviarMensajeAutomatico', stack: (e as Error).stack }).catch(() => {});
    return true; // En caso de error, permitir envío
  }
}

export async function registrarMensajeAutomatico(supabase: SupabaseService, leadId: string): Promise<void> {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const { data: lead } = await supabase.client
      .from('leads')
      .select('notes')
      .eq('id', leadId)
      .single();

    if (!lead) return;

    const notes = safeJsonParse(lead.notes);
    const mensajesHoy = notes.mensajes_automaticos_hoy || { fecha: '', count: 0 };

    // Si es un nuevo día, resetear
    if (mensajesHoy.fecha !== hoy) {
      notes.mensajes_automaticos_hoy = { fecha: hoy, count: 1 };
    } else {
      notes.mensajes_automaticos_hoy = { fecha: hoy, count: mensajesHoy.count + 1 };
    }

    await supabase.client
      .from('leads')
      .update({ notes })
      .eq('id', leadId);

  } catch (e) {
    console.error('Error registrando mensaje automático:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'registrarMensajeAutomatico', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGUIMIENTO DE HIPOTECAS - Notifica asesores sobre hipotecas estancadas
// ═══════════════════════════════════════════════════════════════════════════
export async function seguimientoHipotecas(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);

    // Hipotecas en banco sin actualización en 7+ días (include lead notes to avoid N+1)
    const { data: hipotecasEstancadas } = await supabase.client
      .from('mortgage_applications')
      .select('*, leads(name, phone, notes), team_members!mortgage_applications_assigned_advisor_id_fkey(id, name, phone)')
      .eq('status', 'sent_to_bank')
      .lt('updated_at', hace7dias.toISOString());

    if (!hipotecasEstancadas || hipotecasEstancadas.length === 0) {
      console.log('✅ No hay hipotecas estancadas');
      return;
    }

    // Batch-fetch all vendedor_original_ids to avoid N+1 queries in loop
    const vendorOrigIds = new Set<string>();
    for (const hip of hipotecasEstancadas) {
      const notas = safeJsonParse((hip as any).leads?.notes);
      if (notas.vendedor_original_id) vendorOrigIds.add(notas.vendedor_original_id);
    }
    let vendorOrigMap = new Map<string, any>();
    if (vendorOrigIds.size > 0) {
      const { data: vendorsOrig } = await supabase.client
        .from('team_members').select('*').in('id', Array.from(vendorOrigIds));
      vendorOrigMap = new Map((vendorsOrig || []).map((v: any) => [v.id, v]));
    }

    // Notificar a asesores Y vendedores originales
    for (const hip of hipotecasEstancadas) {
      const asesor = hip.team_members;
      const lead = hip.leads;

      if (!asesor?.phone || asesor?.is_active === false) continue;

      const diasEnBanco = Math.floor((Date.now() - new Date(hip.updated_at).getTime()) / (1000 * 60 * 60 * 24));

      const msg = `⚠️ *HIPOTECA ESTANCADA*\n\n` +
        `Cliente: *${lead?.name || 'Sin nombre'}*\n` +
        `Banco: *${hip.bank || 'No especificado'}*\n` +
        `Días en banco: *${diasEnBanco}*\n\n` +
        `_Por favor da seguimiento y actualiza el estatus_`;

      try {
        await enviarMensajeTeamMember(supabase, meta, asesor, msg, {
          tipoMensaje: 'notificacion',
          guardarPending: true
        });
        console.log(`📢 Alerta hipoteca enviada a ${asesor.name} (via enviarMensajeTeamMember)`);
      } catch (e) {
        console.log(`Error notificando asesor:`, e);
      }

      // Notificar al vendedor original (using pre-fetched map, no N+1)
      try {
        const notas = safeJsonParse(lead?.notes);
        const vendedorOrigId = notas.vendedor_original_id;
        if (vendedorOrigId && vendedorOrigId !== asesor.id) {
          const vendedorOrig = vendorOrigMap.get(vendedorOrigId);
          if (vendedorOrig?.phone) {
            const msgVendedor = `🏦 *ACTUALIZACIÓN CRÉDITO*\n\n` +
              `Tu lead *${lead?.name || 'Sin nombre'}* tiene una hipoteca estancada en *${hip.bank || 'banco'}* (${diasEnBanco} días).\n\n` +
              `El asesor hipotecario ya fue notificado. Si puedes, coordina con el cliente.`;
            await enviarMensajeTeamMember(supabase, meta, vendedorOrig, msgVendedor, {
              tipoMensaje: 'notificacion',
              guardarPending: true
            });
            console.log(`📢 Alerta hipoteca también enviada a vendedor ${vendedorOrig.name}`);
          }
        }
      } catch (e) {
        console.log(`Error notificando vendedor original de hipoteca estancada:`, e);
      }
    }

    // Enviar resumen a admins (no CEOs)
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .in('role', ['admin', 'coordinador'])
      .eq('active', true);

    if (admins && admins.length > 0 && hipotecasEstancadas.length > 0) {
      let resumenAdmin = `📊 *RESUMEN HIPOTECAS ESTANCADAS*\n\n`;
      resumenAdmin += `Total: ${hipotecasEstancadas.length} hipotecas en banco +7 días\n\n`;

      for (const hip of hipotecasEstancadas.slice(0, 5)) {
        const lead = hip.leads;
        const asesor = hip.team_members;
        const diasEnBanco = Math.floor((Date.now() - new Date(hip.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        resumenAdmin += `• *${lead?.name || 'Sin nombre'}*\n`;
        resumenAdmin += `  ${hip.bank || 'Sin banco'} | ${diasEnBanco} días | Asesor: ${asesor?.name || 'N/A'}\n`;
      }

      if (hipotecasEstancadas.length > 5) {
        resumenAdmin += `\n...y ${hipotecasEstancadas.length - 5} más`;
      }

      const telefonosEnviados = new Set<string>();
      for (const admin of admins) {
        if (!admin.phone) continue;
        const tel = admin.phone.replace(/\D/g, '');
        if (telefonosEnviados.has(tel)) continue;
        telefonosEnviados.add(tel);

        try {
          await enviarMensajeTeamMember(supabase, meta, admin, resumenAdmin, {
            tipoMensaje: 'notificacion',
            guardarPending: true
          });
          console.log(`📊 Resumen hipotecas enviado a admin ${admin.name} (via enviarMensajeTeamMember)`);
        } catch (e) {
          console.log(`Error enviando resumen a admin:`, e);
        }
      }
    }
  } catch (e) {
    console.log('Error en seguimiento hipotecas:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'seguimientoHipotecas', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RECUPERACIÓN DE HIPOTECAS RECHAZADAS
// Día 7: Alternativas, Día 30: Reintento elegible
// ═══════════════════════════════════════════════════════════════════════════
export async function recuperacionHipotecasRechazadas(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🏦 Iniciando recuperación hipotecas rechazadas...');

    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, assigned_to, property_interest')
      .eq('status', 'rejected')
      .not('phone', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(50);

    if (!leads || leads.length === 0) {
      console.log('✅ Sin leads rechazados para recovery');
      return;
    }

    const ahora = new Date();
    let enviados = 0;

    for (const lead of leads) {
      if (enviados >= 5) break;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const recovery = (notas as any)?.mortgage_recovery;
      if (!recovery) continue;

      const rejectedAt = new Date(recovery.rejected_at);
      const diasDesdeRechazo = Math.floor((ahora.getTime() - rejectedAt.getTime()) / (1000 * 60 * 60 * 24));
      const nombreCorto = (lead.name || '').split(' ')[0] || 'cliente';
      const desarrollo = lead.property_interest || 'nuestros desarrollos';

      // DÍA 7+: Enviar alternativas (si no se han enviado)
      if (diasDesdeRechazo >= 7 && !recovery.alternatives_sent) {
        const puedeEnviar = await puedeEnviarMensajeAutomatico(supabase, lead.id);
        if (!puedeEnviar) continue;

        // Mark-before-send
        const updatedRecovery = { ...recovery, alternatives_sent: true, alternatives_sent_at: ahora.toISOString() };
        await supabase.client.from('leads')
          .update({
            notes: {
              ...notas,
              mortgage_recovery: updatedRecovery,
              pending_auto_response: { type: 'seguimiento_credito', sent_at: ahora.toISOString() }
            }
          })
          .eq('id', lead.id);

        // Mensaje personalizado por categoría
        const mensajesPorCategoria: Record<string, string> = {
          buro_crediticio: `Hola ${nombreCorto} 👋\n\nSé que tu solicitud de crédito no fue aprobada, pero quiero que sepas que *hay otras opciones*.\n\n🏦 Trabajamos con varios bancos y cada uno tiene criterios diferentes. También contamos con *financiamiento directo* con la constructora.\n\n¿Te gustaría que exploremos alternativas? Estoy aquí para ayudarte.`,
          ingresos_insuficientes: `Hola ${nombreCorto} 👋\n\nQuiero contarte sobre opciones que pueden funcionar para ti:\n\n👥 *Co-acreditado:* Con un familiar pueden sumar ingresos\n🏠 *Modelos accesibles:* Tenemos opciones desde precios menores\n💰 *Enganche mayor:* Reduce la mensualidad requerida\n\n¿Te interesa explorar alguna de estas opciones?`,
          documentacion_incompleta: `Hola ${nombreCorto} 👋\n\n¡Buenas noticias! El rechazo por documentación *tiene solución*.\n\n📋 Solo necesitas completar los documentos que faltaron y podemos re-enviar tu solicitud.\n\n¿Necesitas ayuda para saber qué documentos te faltan?`,
          deuda_excesiva: `Hola ${nombreCorto} 👋\n\nEntiendo que la situación de deudas puede ser complicada, pero hay caminos:\n\n📊 *Financiamiento directo:* La constructora tiene esquemas propios\n🤝 *Plan de ahorro:* Puedes ir apartando mientras reduces deudas\n\n¿Te gustaría que te explique estas opciones?`,
          otro: `Hola ${nombreCorto} 👋\n\nSé que la noticia del crédito no fue la esperada, pero hay más opciones disponibles.\n\n🏦 Trabajamos con múltiples instituciones y esquemas de financiamiento. ¿Te gustaría explorar alternativas?\n\nEstoy aquí para ayudarte a encontrar la mejor opción.`
        };

        const mensaje = mensajesPorCategoria[recovery.rejection_category] || mensajesPorCategoria.otro;

        try {
          const templateComponents = [
            { type: 'body', parameters: [
              { type: 'text', text: nombreCorto },
              { type: 'text', text: desarrollo }
            ]}
          ];
          await meta.sendTemplate(lead.phone, 'seguimiento_lead', 'es_MX', templateComponents);
          await registrarMensajeAutomatico(supabase, lead.id);
          enviados++;
          console.log(`🏦 Alternativas enviadas a ${lead.name} (${recovery.rejection_category})`);
        } catch (err) {
          console.error(`Error enviando alternativas a ${lead.name}:`, err);
        }
        continue;
      }

      // DÍA 30+: Reintento elegible
      if (diasDesdeRechazo >= 30 && recovery.recovery_step !== 'retry_eligible') {
        const puedeEnviar = await puedeEnviarMensajeAutomatico(supabase, lead.id);
        if (!puedeEnviar) continue;

        // Mark-before-send
        const updatedRecovery = { ...recovery, recovery_step: 'retry_eligible', retry_notified_at: ahora.toISOString() };
        await supabase.client.from('leads')
          .update({ notes: { ...notas, mortgage_recovery: updatedRecovery } })
          .eq('id', lead.id);

        try {
          const templateComponents = [
            { type: 'body', parameters: [
              { type: 'text', text: nombreCorto },
              { type: 'text', text: desarrollo }
            ]}
          ];
          await meta.sendTemplate(lead.phone, 'seguimiento_lead', 'es_MX', templateComponents);
          await registrarMensajeAutomatico(supabase, lead.id);
          enviados++;
          console.log(`🏦 Reintento elegible notificado a ${lead.name}`);
        } catch (err) {
          console.error(`Error notificando reintento a ${lead.name}:`, err);
        }

        // Notificar asesor y vendedor
        try {
          const vendedorId = (notas as any)?.credit_flow_context?.vendedor_id || lead.assigned_to;
          if (vendedorId) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('id, name, phone')
              .eq('id', vendedorId)
              .single();
            if (vendedor?.phone) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `🏦 *REINTENTO CRÉDITO DISPONIBLE*\n\n${lead.name} fue rechazado hace 30+ días y ya puede reintentar.\n📋 Motivo original: ${recovery.bank_rejected}\n\n💡 Contacta al cliente para explorar nuevas opciones.`,
                { tipoMensaje: 'notificacion', pendingKey: 'pending_alerta_lead' }
              );
            }
          }
        } catch (notifErr) {
          console.error(`Error notificando equipo sobre reintento ${lead.name}:`, notifErr);
        }
      }
    }

    console.log(`🏦 Recuperación hipotecas completada: ${enviados} mensajes enviados`);
  } catch (e) {
    console.error('Error en recuperacionHipotecasRechazadas:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'recuperacionHipotecasRechazadas', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// PROMOCIONES - Recordatorios automáticos
// ═══════════════════════════════════════════════════════════════
export async function enviarRecordatoriosPromociones(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const dayOfWeek = hoy.getDay(); // 0=Dom, 1=Lun, etc.

    // Obtener promociones activas (dentro del rango de fechas y no pausadas)
    const { data: promos } = await supabase.client
      .from('promotions')
      .select('*')
      .lte('start_date', hoyStr)
      .gte('end_date', hoyStr)
      .neq('status', 'paused')
      .neq('status', 'cancelled')
      .neq('status', 'completed');

    if (!promos || promos.length === 0) {
      console.log('📭 No hay promociones activas para enviar');
      return;
    }

    console.log(`🎯 Procesando ${promos.length} promociones activas`);

    for (const promo of promos) {
      // Verificar si toca enviar recordatorio hoy
      const startDate = new Date(promo.start_date);
      const endDate = new Date(promo.end_date);
      const diasTranscurridos = Math.floor((hoy.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const diasRestantes = Math.floor((endDate.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      const lastSent = promo.last_reminder_sent ? new Date(promo.last_reminder_sent) : null;
      const diasDesdeUltimo = lastSent ? Math.floor((hoy.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24)) : 999;

      let debeEnviar = false;
      let tipoMensaje = 'reminder';

      // Día 1: Mensaje inicial
      if (diasTranscurridos === 0) {
        debeEnviar = true;
        tipoMensaje = 'initial';
      }
      // Último día: Mensaje urgente
      else if (diasRestantes === 0) {
        debeEnviar = true;
        tipoMensaje = 'final';
      }
      // Recordatorios según frecuencia
      else if (promo.reminder_frequency === 'daily' && diasDesdeUltimo >= 1) {
        debeEnviar = true;
      }
      else if (promo.reminder_frequency === 'weekly' && diasDesdeUltimo >= 7) {
        debeEnviar = true;
      }
      // Mitad de la promo (para promos largas)
      else if (diasRestantes === Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) / 2)) {
        debeEnviar = true;
        tipoMensaje = 'midpoint';
      }

      if (!debeEnviar) {
        console.log(`⏭️ ${promo.name}: No toca enviar hoy`);
        continue;
      }

      console.log(`📤 ${promo.name}: Enviando ${tipoMensaje}...`);

      // Obtener leads del segmento (LIMIT 500 para evitar timeout en CRON)
      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, lead_score, score, status, property_interest, last_message_at, notes')
        .limit(500);

      if (!leads) continue;

      let leadsSegmento = leads.filter(l => l.phone);

      // Filtrar por segmento
      const seg = promo.target_segment || 'todos';
      if (seg === 'hot') {
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 70);
      } else if (seg === 'warm') {
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
      } else if (seg === 'cold') {
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) < 40);
      } else if (seg === 'compradores') {
        leadsSegmento = leadsSegmento.filter(l => ['closed_won', 'delivered'].includes(l.status));
      } else if (seg === 'caidos') {
        leadsSegmento = leadsSegmento.filter(l => l.status === 'fallen');
      }

      // Preparar mensaje según tipo
      let mensajeBase = promo.message;
      if (tipoMensaje === 'final') {
        mensajeBase = `⚡ *ULTIMO DIA* ⚡\n\n${promo.message}\n\n_¡Hoy termina la promoción!_`;
      } else if (tipoMensaje === 'midpoint') {
        mensajeBase = `📢 *RECORDATORIO*\n\n${promo.message}\n\n_Quedan ${diasRestantes} días_`;
      } else if (tipoMensaje === 'initial') {
        mensajeBase = `🎉 *${promo.name}*\n\n${promo.message}`;
      }

      let enviados = 0;
      for (const lead of leadsSegmento) {
        try {
          const mensaje = mensajeBase
            .replace(/{nombre}/gi, lead.name || '')
            .replace(/{desarrollo}/gi, lead.property_interest || 'nuestros desarrollos');

          const phone = lead.phone.startsWith('52') ? lead.phone : '52' + lead.phone;
          const resultado = await enviarMensajeLead(supabase, meta, {
            id: lead.id, phone, name: lead.name, notes: lead.notes, last_message_at: lead.last_message_at
          }, mensaje, {
            pendingContext: { tipo: 'remarketing' }
          });

          if (resultado.method === 'skipped') continue;

          // Log
          await supabase.client.from('promotion_logs').insert({
            promotion_id: promo.id,
            lead_id: lead.id,
            lead_phone: lead.phone,
            lead_name: lead.name,
            message_type: tipoMensaje,
            status: 'sent'
          });

          enviados++;

          // Pausa para no saturar
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          console.error(`Error enviando a ${lead.phone}:`, e);
        }
      }

      // Actualizar promo
      await supabase.client
        .from('promotions')
        .update({
          status: 'active',
          last_reminder_sent: hoyStr,
          reminders_sent_count: (promo.reminders_sent_count || 0) + 1,
          total_reached: (promo.total_reached || 0) + enviados,
          updated_at: new Date().toISOString()
        })
        .eq('id', promo.id);

      console.log(`✅ ${promo.name}: ${enviados} mensajes enviados`);

      // Si es el último día, marcar como completada
      if (tipoMensaje === 'final') {
        await supabase.client
          .from('promotions')
          .update({ status: 'completed' })
          .eq('id', promo.id);
      }
    }

  } catch (e) {
    console.error('Error en recordatorios de promociones:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarRecordatoriosPromociones', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BRIEFING DE SUPERVISIÓN - Para admins, resumen de todo el funnel
// ═══════════════════════════════════════════════════════════════════════════
export async function enviarBriefingSupervision(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener admins activos
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'admin')
      .eq('active', true);

    if (!admins || admins.length === 0) {
      console.log('⏭️ No hay admins activos para enviar briefing de supervisión');
      return;
    }

    // Fechas
    const ahora = new Date();
    const hoyMexico = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
    const hoyStr = hoyMexico.toISOString().split('T')[0];
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const finSemana = new Date(hoyMexico.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Obtener vendedores para mapear nombres
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name')
      .eq('role', 'vendedor')
      .eq('active', true);
    const vendedorMap = new Map<string, string>((vendedores || []).map(v => [v.id as string, v.name as string]));

    // ═══════════════════════════════════════════════════════════════════
    // 1. LEADS NUEVOS SIN CONTACTAR (+24h)
    // ═══════════════════════════════════════════════════════════════════
    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, created_at')
      .eq('status', 'new')
      .lt('created_at', hace24h)
      .order('created_at', { ascending: true })
      .limit(100);

    // ═══════════════════════════════════════════════════════════════════
    // 2. CITAS DE HOY SIN CONFIRMAR
    // ═══════════════════════════════════════════════════════════════════
    const { data: citasSinConfirmar } = await supabase.client
      .from('appointments')
      .select('id, lead_name, scheduled_time, vendedor_id, status')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled')
      .limit(100);

    // ═══════════════════════════════════════════════════════════════════
    // 3. PAGOS DE APARTADO PRÓXIMOS (esta semana)
    // ═══════════════════════════════════════════════════════════════════
    const { data: leadsApartado } = await supabase.client
      .from('leads')
      .select('id, name, notes, assigned_to')
      .eq('status', 'reserved');

    const pagosPendientes: any[] = [];
    const pagosVencidos: any[] = [];

    if (leadsApartado) {
      for (const lead of leadsApartado) {
        const apartado = lead.notes?.apartado;
        if (apartado?.fecha_pago) {
          const fechaPago = apartado.fecha_pago;
          const diffDays = Math.ceil((new Date(fechaPago).getTime() - hoyMexico.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            pagosVencidos.push({ ...lead, diasVencido: Math.abs(diffDays) });
          } else if (diffDays <= 7) {
            pagosPendientes.push({ ...lead, diasRestantes: diffDays });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. LEADS ESTANCADOS POR ETAPA
    // ═══════════════════════════════════════════════════════════════════
    // Contacted > 48h sin avanzar
    const { data: leadsContactedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'contacted')
      .lt('updated_at', hace48h);

    // Qualified > 7 días sin cita
    const { data: leadsQualifiedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'qualified')
      .lt('updated_at', hace7d);

    // ═══════════════════════════════════════════════════════════════════
    // 5. FOLLOW-UPS PENDIENTES
    // ═══════════════════════════════════════════════════════════════════
    const { data: followupsPendientes } = await supabase.client
      .from('follow_ups')
      .select('id, lead_id, vendedor_id, scheduled_for, notes')
      .eq('status', 'pending')
      .lte('scheduled_for', ahora.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(100);

    // ═══════════════════════════════════════════════════════════════════
    // 6. NO-SHOWS DE AYER
    // ═══════════════════════════════════════════════════════════════════
    const ayerStr = new Date(hoyMexico.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: noShowsAyer } = await supabase.client
      .from('appointments')
      .select('id, lead_name, vendedor_id')
      .eq('scheduled_date', ayerStr)
      .eq('status', 'no-show');

    // ═══════════════════════════════════════════════════════════════════
    // 7. RESUMEN DEL PIPELINE
    // ═══════════════════════════════════════════════════════════════════
    const { data: pipelineCounts } = await supabase.client
      .from('leads')
      .select('status');

    const pipeline: Record<string, number> = {};
    if (pipelineCounts) {
      for (const lead of pipelineCounts) {
        pipeline[lead.status] = (pipeline[lead.status] || 0) + 1;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUIR MENSAJE
    // ═══════════════════════════════════════════════════════════════════
    let mensaje = `👁️ *BRIEFING DE SUPERVISIÓN*\n`;
    mensaje += `📅 ${hoyStr}\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Alertas críticas primero
    let hayAlertas = false;

    if (pagosVencidos.length > 0) {
      hayAlertas = true;
      mensaje += `🚨 *PAGOS VENCIDOS (${pagosVencidos.length})*\n`;
      for (const p of pagosVencidos.slice(0, 5)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `   • ${p.name} - ${p.diasVencido} días (${vendedor})\n`;
      }
      if (pagosVencidos.length > 5) {
        mensaje += `   _... y ${pagosVencidos.length - 5} más_\n`;
      }
      mensaje += `\n`;
    }

    if ((leadsSinContactar?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `⚠️ *LEADS SIN CONTACTAR +24h (${leadsSinContactar!.length})*\n`;
      for (const l of leadsSinContactar!.slice(0, 5)) {
        const vendedor = vendedorMap.get(l.assigned_to) || '?';
        const horasTranscurridas = Math.floor((ahora.getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60));
        const nombreLead = l.name || l.phone || 'Sin nombre';
        mensaje += `   • ${nombreLead} - ${horasTranscurridas}h (${vendedor})\n`;
      }
      if (leadsSinContactar!.length > 5) {
        mensaje += `   _... y ${leadsSinContactar!.length - 5} más_\n`;
      }
      mensaje += `\n`;
    }

    if ((noShowsAyer?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `👻 *NO-SHOWS AYER (${noShowsAyer!.length})*\n`;
      for (const ns of noShowsAyer!.slice(0, 5)) {
        const vendedor = vendedorMap.get(ns.vendedor_id) || '?';
        mensaje += `   • ${ns.lead_name} (${vendedor})\n`;
      }
      if (noShowsAyer!.length > 5) {
        mensaje += `   _... y ${noShowsAyer!.length - 5} más_\n`;
      }
      mensaje += `\n`;
    }

    // Atención requerida
    mensaje += `📋 *ATENCIÓN HOY*\n`;

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `   📅 Citas sin confirmar: ${citasSinConfirmar!.length}\n`;
      for (const c of citasSinConfirmar!.slice(0, 3)) {
        const vendedor = vendedorMap.get(c.vendedor_id) || '?';
        mensaje += `      • ${c.lead_name} ${c.scheduled_time?.slice(0, 5)} (${vendedor})\n`;
      }
    } else {
      mensaje += `   📅 Citas: ✅ Todas confirmadas\n`;
    }

    if (pagosPendientes.length > 0) {
      mensaje += `   💰 Pagos esta semana: ${pagosPendientes.length}\n`;
      for (const p of pagosPendientes.slice(0, 3)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `      • ${p.name} en ${p.diasRestantes}d (${vendedor})\n`;
      }
    }

    if ((followupsPendientes?.length || 0) > 0) {
      mensaje += `   📞 Follow-ups vencidos: ${followupsPendientes!.length}\n`;
    }

    mensaje += `\n`;

    // Leads estancados
    const totalEstancados = (leadsContactedEstancados?.length || 0) + (leadsQualifiedEstancados?.length || 0);
    if (totalEstancados > 0) {
      mensaje += `⏳ *LEADS ESTANCADOS (${totalEstancados})*\n`;
      if ((leadsContactedEstancados?.length || 0) > 0) {
        mensaje += `   • Contacted +48h: ${leadsContactedEstancados!.length}\n`;
      }
      if ((leadsQualifiedEstancados?.length || 0) > 0) {
        mensaje += `   • Qualified +7d: ${leadsQualifiedEstancados!.length}\n`;
      }
      mensaje += `\n`;
    }

    // Resumen pipeline
    mensaje += `📊 *PIPELINE ACTUAL*\n`;
    mensaje += `   New: ${pipeline['new'] || 0} | Contacted: ${pipeline['contacted'] || 0}\n`;
    mensaje += `   Qualified: ${pipeline['qualified'] || 0} | Visited: ${pipeline['visited'] || 0}\n`;
    mensaje += `   Reserved: ${pipeline['reserved'] || 0} | Sold: ${pipeline['sold'] || 0}\n`;
    mensaje += `\n`;

    // Análisis por vendedor - quién necesita atención
    const vendedorStats: Record<string, { sinContactar: number; estancados: number; citasPendientes: number }> = {};

    // Inicializar todos los vendedores
    for (const [id, name] of vendedorMap) {
      vendedorStats[name] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
    }

    // Contar leads sin contactar por vendedor
    if (leadsSinContactar) {
      for (const l of leadsSinContactar) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].sinContactar++;
      }
    }

    // Contar estancados por vendedor
    if (leadsContactedEstancados) {
      for (const l of leadsContactedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }
    if (leadsQualifiedEstancados) {
      for (const l of leadsQualifiedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }

    // Contar citas pendientes por vendedor
    if (citasSinConfirmar) {
      for (const c of citasSinConfirmar) {
        const v = vendedorMap.get(c.vendedor_id) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].citasPendientes++;
      }
    }

    // Vendedores que necesitan atención (tienen pendientes)
    const vendedoresConProblemas = Object.entries(vendedorStats)
      .filter(([_, stats]) => stats.sinContactar > 0 || stats.estancados > 0 || stats.citasPendientes > 0)
      .sort((a, b) => (b[1].sinContactar + b[1].estancados) - (a[1].sinContactar + a[1].estancados))
      .slice(0, 5);

    // ═══════════════════════════════════════════════════════════════════
    // ANÁLISIS INTELIGENTE - Detectar situación crítica
    // ═══════════════════════════════════════════════════════════════════
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    const totalSinContactar = leadsSinContactar?.length || 0;
    const pipelineParado = (pipeline['contacted'] || 0) === 0 && (pipeline['qualified'] || 0) === 0;
    const leadMasViejo = leadsSinContactar?.[0];
    const horasMasViejo = leadMasViejo ? Math.floor((ahora.getTime() - new Date(leadMasViejo.created_at).getTime()) / (1000 * 60 * 60)) : 0;

    // Determinar nivel de criticidad
    const esCritico = totalSinContactar >= 10 || horasMasViejo > 48 || pipelineParado;
    const esPreocupante = totalSinContactar >= 5 || horasMasViejo > 24;

    if (esCritico) {
      mensaje += `🚨 *SITUACIÓN CRÍTICA*\n\n`;

      if (pipelineParado && totalSinContactar > 0) {
        mensaje += `⛔ El pipeline está PARADO:\n`;
        mensaje += `   • ${pipeline['new'] || 0} leads en "new"\n`;
        mensaje += `   • 0 avanzando a siguiente etapa\n`;
        mensaje += `   • Los leads se van a enfriar\n\n`;
      }

      if (totalSinContactar >= 10) {
        mensaje += `⚠️ ${totalSinContactar} leads sin primer contacto\n`;
        mensaje += `   • El más viejo: ${horasMasViejo}h (${Math.floor(horasMasViejo/24)} días)\n`;
        mensaje += `   • Probabilidad de conversión cayendo\n\n`;
      }

      mensaje += `📢 *ACCIÓN INMEDIATA REQUERIDA*\n`;
      mensaje += `1. Junta urgente con vendedores\n`;
      mensaje += `2. Cada uno debe contactar sus leads HOY\n`;
      mensaje += `3. Meta: 0 leads +24h para mañana\n\n`;

    } else if (esPreocupante) {
      mensaje += `⚠️ *ATENCIÓN REQUERIDA*\n\n`;
      mensaje += `${totalSinContactar} leads esperando contacto\n`;
      mensaje += `Lead más viejo: ${horasMasViejo}h\n\n`;
    }

    // Mostrar vendedores con problemas
    if (vendedoresConProblemas.length > 0) {
      mensaje += `👥 *VENDEDORES CON PENDIENTES*\n`;
      for (const [nombre, stats] of vendedoresConProblemas) {
        const problemas: string[] = [];
        if (stats.sinContactar > 0) problemas.push(`${stats.sinContactar} sin contactar`);
        if (stats.estancados > 0) problemas.push(`${stats.estancados} estancados`);
        if (stats.citasPendientes > 0) problemas.push(`${stats.citasPendientes} citas`);
        mensaje += `• ${nombre}: ${problemas.join(', ')}\n`;
      }
      mensaje += `\n`;
    }

    // Acciones concretas del día
    mensaje += `📌 *CHECKLIST DE HOY*\n`;

    if (esCritico) {
      mensaje += `☐ Llamar a cada vendedor para revisar leads\n`;
      if (totalSinContactar > 0) {
        mensaje += `☐ Asegurar contacto de ${Math.min(totalSinContactar, 10)} leads\n`;
      }
    }

    if (pagosVencidos.length > 0) {
      mensaje += `☐ Cobrar ${pagosVencidos.length} pago(s) vencido(s)\n`;
    }

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `☐ Confirmar ${citasSinConfirmar!.length} cita(s) de hoy\n`;
    }

    if (pagosPendientes.length > 0) {
      const proximo = pagosPendientes.sort((a, b) => a.diasRestantes - b.diasRestantes)[0];
      mensaje += `☐ Recordar pago: ${proximo.name} (${proximo.diasRestantes}d)\n`;
    }

    if (!esCritico && !esPreocupante && pagosVencidos.length === 0 && (citasSinConfirmar?.length || 0) === 0) {
      mensaje += `✅ Todo en orden - buen trabajo!\n`;
    }

    // Enviar a cada admin (respetando ventana 24h)
    for (const admin of admins) {
      if (!admin.phone) continue;
      try {
        await enviarMensajeTeamMember(supabase, meta, admin, mensaje, {
          tipoMensaje: 'notificacion',
          guardarPending: true
        });
        console.log(`✅ Briefing supervisión enviado a ${admin.name} (via enviarMensajeTeamMember)`);
      } catch (err) {
        console.error(`❌ Error enviando briefing a ${admin.name}:`, err);
      }
    }

  } catch (e) {
    console.error('Error en briefing de supervisión:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarBriefingSupervision', stack: (e as Error).stack }).catch(() => {});
  }
}

// Versión test para enviar a un número específico
export async function enviarBriefingSupervisionTest(supabase: SupabaseService, meta: MetaWhatsAppService, testPhone: string): Promise<void> {
  try {
    // Fechas
    const ahora = new Date();
    const hoyMexico = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
    const hoyStr = hoyMexico.toISOString().split('T')[0];
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Obtener vendedores para mapear nombres
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name')
      .eq('role', 'vendedor')
      .eq('active', true);
    const vendedorMap = new Map<string, string>((vendedores || []).map(v => [v.id as string, v.name as string]));

    // 1. LEADS NUEVOS SIN CONTACTAR (+24h)
    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, created_at')
      .eq('status', 'new')
      .lt('created_at', hace24h)
      .order('created_at', { ascending: true })
      .limit(100);

    // 2. CITAS DE HOY SIN CONFIRMAR
    const { data: citasSinConfirmar } = await supabase.client
      .from('appointments')
      .select('id, lead_name, scheduled_time, vendedor_id, status')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled');

    // 3. PAGOS DE APARTADO
    const { data: leadsApartado } = await supabase.client
      .from('leads')
      .select('id, name, notes, assigned_to')
      .eq('status', 'reserved');

    const pagosPendientes: any[] = [];
    const pagosVencidos: any[] = [];

    if (leadsApartado) {
      for (const lead of leadsApartado) {
        const apartado = lead.notes?.apartado;
        if (apartado?.fecha_pago) {
          const fechaPago = apartado.fecha_pago;
          const diffDays = Math.ceil((new Date(fechaPago).getTime() - hoyMexico.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            pagosVencidos.push({ ...lead, diasVencido: Math.abs(diffDays) });
          } else if (diffDays <= 7) {
            pagosPendientes.push({ ...lead, diasRestantes: diffDays });
          }
        }
      }
    }

    // 4. LEADS ESTANCADOS
    const { data: leadsContactedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'contacted')
      .lt('updated_at', hace48h);

    const { data: leadsQualifiedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'qualified')
      .lt('updated_at', hace7d);

    // 5. FOLLOW-UPS PENDIENTES
    const { data: followupsPendientes } = await supabase.client
      .from('follow_ups')
      .select('id, lead_id, vendedor_id, scheduled_for, notes')
      .eq('status', 'pending')
      .lte('scheduled_for', ahora.toISOString());

    // 6. NO-SHOWS DE AYER
    const ayerStr = new Date(hoyMexico.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: noShowsAyer } = await supabase.client
      .from('appointments')
      .select('id, lead_name, vendedor_id')
      .eq('scheduled_date', ayerStr)
      .eq('status', 'no-show');

    // 7. PIPELINE
    const { data: pipelineCounts } = await supabase.client.from('leads').select('status');
    const pipeline: Record<string, number> = {};
    if (pipelineCounts) {
      for (const lead of pipelineCounts) {
        pipeline[lead.status] = (pipeline[lead.status] || 0) + 1;
      }
    }

    // CONSTRUIR MENSAJE
    let mensaje = `👁️ *BRIEFING DE SUPERVISIÓN*\n`;
    mensaje += `📅 ${hoyStr}\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    let hayAlertas = false;

    if (pagosVencidos.length > 0) {
      hayAlertas = true;
      mensaje += `🚨 *PAGOS VENCIDOS (${pagosVencidos.length})*\n`;
      for (const p of pagosVencidos.slice(0, 5)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `   • ${p.name} - ${p.diasVencido} días (${vendedor})\n`;
      }
      mensaje += `\n`;
    }

    if ((leadsSinContactar?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `⚠️ *LEADS SIN CONTACTAR +24h (${leadsSinContactar!.length})*\n`;
      for (const l of leadsSinContactar!.slice(0, 5)) {
        const vendedor = vendedorMap.get(l.assigned_to) || '?';
        const horasTranscurridas = Math.floor((ahora.getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60));
        const nombreLead = l.name || l.phone || 'Sin nombre';
        mensaje += `   • ${nombreLead} - ${horasTranscurridas}h (${vendedor})\n`;
      }
      mensaje += `\n`;
    }

    if ((noShowsAyer?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `👻 *NO-SHOWS AYER (${noShowsAyer!.length})*\n`;
      for (const ns of noShowsAyer!.slice(0, 5)) {
        const vendedor = vendedorMap.get(ns.vendedor_id) || '?';
        mensaje += `   • ${ns.lead_name} (${vendedor})\n`;
      }
      mensaje += `\n`;
    }

    mensaje += `📋 *ATENCIÓN HOY*\n`;

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `   📅 Citas sin confirmar: ${citasSinConfirmar!.length}\n`;
      for (const c of citasSinConfirmar!.slice(0, 3)) {
        const vendedor = vendedorMap.get(c.vendedor_id) || '?';
        mensaje += `      • ${c.lead_name} ${c.scheduled_time?.slice(0, 5)} (${vendedor})\n`;
      }
    } else {
      mensaje += `   📅 Citas: ✅ Todas confirmadas\n`;
    }

    if (pagosPendientes.length > 0) {
      mensaje += `   💰 Pagos esta semana: ${pagosPendientes.length}\n`;
      for (const p of pagosPendientes.slice(0, 3)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `      • ${p.name} en ${p.diasRestantes}d (${vendedor})\n`;
      }
    }

    if ((followupsPendientes?.length || 0) > 0) {
      mensaje += `   📞 Follow-ups vencidos: ${followupsPendientes!.length}\n`;
    }

    mensaje += `\n`;

    const totalEstancados = (leadsContactedEstancados?.length || 0) + (leadsQualifiedEstancados?.length || 0);
    if (totalEstancados > 0) {
      mensaje += `⏳ *LEADS ESTANCADOS (${totalEstancados})*\n`;
      if ((leadsContactedEstancados?.length || 0) > 0) {
        mensaje += `   • Contacted +48h: ${leadsContactedEstancados!.length}\n`;
      }
      if ((leadsQualifiedEstancados?.length || 0) > 0) {
        mensaje += `   • Qualified +7d: ${leadsQualifiedEstancados!.length}\n`;
      }
      mensaje += `\n`;
    }

    mensaje += `📊 *PIPELINE ACTUAL*\n`;
    mensaje += `   New: ${pipeline['new'] || 0} | Contacted: ${pipeline['contacted'] || 0}\n`;
    mensaje += `   Qualified: ${pipeline['qualified'] || 0} | Visited: ${pipeline['visited'] || 0}\n`;
    mensaje += `   Reserved: ${pipeline['reserved'] || 0} | Sold: ${pipeline['sold'] || 0}\n`;
    mensaje += `\n`;

    // Análisis por vendedor
    const vendedorStats: Record<string, { sinContactar: number; estancados: number; citasPendientes: number }> = {};

    for (const [id, name] of vendedorMap) {
      vendedorStats[name] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
    }

    if (leadsSinContactar) {
      for (const l of leadsSinContactar) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].sinContactar++;
      }
    }

    if (leadsContactedEstancados) {
      for (const l of leadsContactedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }
    if (leadsQualifiedEstancados) {
      for (const l of leadsQualifiedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }

    if (citasSinConfirmar) {
      for (const c of citasSinConfirmar) {
        const v = vendedorMap.get(c.vendedor_id) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].citasPendientes++;
      }
    }

    const vendedoresConProblemas = Object.entries(vendedorStats)
      .filter(([_, stats]) => stats.sinContactar > 0 || stats.estancados > 0 || stats.citasPendientes > 0)
      .sort((a, b) => (b[1].sinContactar + b[1].estancados) - (a[1].sinContactar + a[1].estancados))
      .slice(0, 5);

    // Análisis inteligente
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    const totalSinContactar = leadsSinContactar?.length || 0;
    const pipelineParado = (pipeline['contacted'] || 0) === 0 && (pipeline['qualified'] || 0) === 0;
    const leadMasViejo = leadsSinContactar?.[0];
    const horasMasViejo = leadMasViejo ? Math.floor((ahora.getTime() - new Date(leadMasViejo.created_at).getTime()) / (1000 * 60 * 60)) : 0;

    const esCritico = totalSinContactar >= 10 || horasMasViejo > 48 || pipelineParado;
    const esPreocupante = totalSinContactar >= 5 || horasMasViejo > 24;

    if (esCritico) {
      mensaje += `🚨 *SITUACIÓN CRÍTICA*\n\n`;

      if (pipelineParado && totalSinContactar > 0) {
        mensaje += `⛔ El pipeline está PARADO:\n`;
        mensaje += `   • ${pipeline['new'] || 0} leads en "new"\n`;
        mensaje += `   • 0 avanzando a siguiente etapa\n`;
        mensaje += `   • Los leads se van a enfriar\n\n`;
      }

      if (totalSinContactar >= 10) {
        mensaje += `⚠️ ${totalSinContactar} leads sin primer contacto\n`;
        mensaje += `   • El más viejo: ${horasMasViejo}h (${Math.floor(horasMasViejo/24)} días)\n`;
        mensaje += `   • Probabilidad de conversión cayendo\n\n`;
      }

      mensaje += `📢 *ACCIÓN INMEDIATA REQUERIDA*\n`;
      mensaje += `1. Junta urgente con vendedores\n`;
      mensaje += `2. Cada uno debe contactar sus leads HOY\n`;
      mensaje += `3. Meta: 0 leads +24h para mañana\n\n`;

    } else if (esPreocupante) {
      mensaje += `⚠️ *ATENCIÓN REQUERIDA*\n\n`;
      mensaje += `${totalSinContactar} leads esperando contacto\n`;
      mensaje += `Lead más viejo: ${horasMasViejo}h\n\n`;
    }

    if (vendedoresConProblemas.length > 0) {
      mensaje += `👥 *VENDEDORES CON PENDIENTES*\n`;
      for (const [nombre, stats] of vendedoresConProblemas) {
        const problemas: string[] = [];
        if (stats.sinContactar > 0) problemas.push(`${stats.sinContactar} sin contactar`);
        if (stats.estancados > 0) problemas.push(`${stats.estancados} estancados`);
        if (stats.citasPendientes > 0) problemas.push(`${stats.citasPendientes} citas`);
        mensaje += `• ${nombre}: ${problemas.join(', ')}\n`;
      }
      mensaje += `\n`;
    }

    mensaje += `📌 *CHECKLIST DE HOY*\n`;

    if (esCritico) {
      mensaje += `☐ Llamar a cada vendedor para revisar leads\n`;
      if (totalSinContactar > 0) {
        mensaje += `☐ Asegurar contacto de ${Math.min(totalSinContactar, 10)} leads\n`;
      }
    }

    if (pagosVencidos.length > 0) {
      mensaje += `☐ Cobrar ${pagosVencidos.length} pago(s) vencido(s)\n`;
    }

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `☐ Confirmar ${citasSinConfirmar!.length} cita(s) de hoy\n`;
    }

    if (pagosPendientes.length > 0) {
      const proximo = pagosPendientes.sort((a, b) => a.diasRestantes - b.diasRestantes)[0];
      mensaje += `☐ Recordar pago: ${proximo.name} (${proximo.diasRestantes}d)\n`;
    }

    if (!esCritico && !esPreocupante && pagosVencidos.length === 0 && (citasSinConfirmar?.length || 0) === 0) {
      mensaje += `✅ Todo en orden - buen trabajo!\n`;
    }

    await meta.sendWhatsAppMessage(testPhone, mensaje);
    console.log(`✅ Briefing supervisión TEST enviado a ${testPhone}`);

  } catch (e) {
    console.error('Error en briefing de supervisión test:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarBriefingSupervisionTest', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RE-ENGAGEMENT - Alerta a vendedores sobre leads sin respuesta
// ═══════════════════════════════════════════════════════════════════════════
export async function verificarReengagement(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // Buscar leads que necesitan atención:
    // - Status: new o contacted
    // - No han sido actualizados en 48h
    const { data: leads, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, updated_at, assigned_to, lead_category')
      .in('status', ['new', 'contacted'])
      .lt('updated_at', hace48h)
      .not('phone', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(100);

    if (error || !leads || leads.length === 0) {
      console.log('📭 Sin leads para re-engagement');
      return;
    }

    console.log(`🔄 Re-engagement: ${leads.length} leads sin respuesta 48h+`);

    // Obtener vendedores
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores) return;

    // Agrupar leads por vendedor
    const leadsPorVendedor: Record<string, { vendedor: any; leads: any[] }> = {};

    for (const v of vendedores) {
      leadsPorVendedor[v.id] = { vendedor: v, leads: [] };
    }

    for (const lead of leads) {
      if (lead.assigned_to && leadsPorVendedor[lead.assigned_to]) {
        // Solo incluir si no le hemos alertado hoy
        const alertaHoy = lead.notes?.reengagement_alert_sent;
        const hoyStr = ahora.toISOString().split('T')[0];

        if (alertaHoy !== hoyStr) {
          leadsPorVendedor[lead.assigned_to].leads.push(lead);
        }
      }
    }

    // Enviar alerta a cada vendedor que tenga leads pendientes
    for (const vendedorId of Object.keys(leadsPorVendedor)) {
      const { vendedor, leads: leadsVendedor } = leadsPorVendedor[vendedorId];

      if (leadsVendedor.length === 0 || !vendedor.phone) continue;

      // Calcular horas sin respuesta
      const leadsConHoras = leadsVendedor.map(l => ({
        ...l,
        horasSinRespuesta: Math.floor((ahora.getTime() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60))
      })).slice(0, 5); // Máximo 5 por mensaje

      let mensaje = `🔔 *LEADS SIN RESPUESTA*\n\n`;
      mensaje += `Tienes ${leadsVendedor.length} lead(s) que no han respondido en 48h+:\n\n`;

      for (const lead of leadsConHoras) {
        const nombre = lead.name || lead.phone;
        const categoria = lead.lead_category ? ` (${lead.lead_category})` : '';
        const interes = (lead.property_interest || lead.notes?.desarrollo_interes) ? `\n   Interés: ${lead.property_interest || lead.notes?.desarrollo_interes}` : '';
        mensaje += `• *${nombre}*${categoria}\n   ⏰ ${lead.horasSinRespuesta}h sin respuesta${interes}\n\n`;
      }

      if (leadsVendedor.length > 5) {
        mensaje += `_...y ${leadsVendedor.length - 5} más_\n\n`;
      }

      mensaje += `💡 *¿Qué hacer?*\n`;
      mensaje += `Revisa cada lead y decide si:\n`;
      mensaje += `• Enviarles un mensaje personalizado\n`;
      mensaje += `• Llamarles directamente\n`;
      mensaje += `• Marcarlos como "no interesado"\n`;

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, mensaje, {
          tipoMensaje: 'alerta_lead',
          guardarPending: true,
          pendingKey: 'pending_alerta_lead'
        });
        console.log(`   ✅ Alerta enviada a ${vendedor.name}: ${leadsVendedor.length} leads (via enviarMensajeTeamMember)`);

        // Marcar que ya se alertó hoy para estos leads (FRESH read to avoid JSONB race condition)
        const hoyStr = ahora.toISOString().split('T')[0];
        for (const lead of leadsVendedor) {
          try {
            // Re-read notes fresh to avoid overwriting concurrent changes
            const { data: freshLead } = await supabase.client
              .from('leads')
              .select('notes')
              .eq('id', lead.id)
              .maybeSingle();
            const freshNotes = typeof freshLead?.notes === 'object' ? freshLead.notes : {};
            await supabase.client
              .from('leads')
              .update({
                notes: {
                  ...freshNotes,
                  reengagement_alert_sent: hoyStr
                }
              })
              .eq('id', lead.id);
          } catch (noteErr) {
            console.error(`⚠️ Failed to update reengagement flag for ${lead.id}:`, noteErr);
          }
        }

      } catch (err) {
        console.error(`   ❌ Error alertando a ${vendedor.name}:`, err);
      }
    }

    console.log(`🔄 Re-engagement completado`);

  } catch (e) {
    console.error('Error en verificarReengagement:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'verificarReengagement', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADS FRÍOS - Secuencia de re-engagement directo al lead
// Día 3: Recordatorio amigable
// Día 7: Propuesta de valor / oferta
// Día 14: Último intento antes de marcar como frío
// ═══════════════════════════════════════════════════════════════════════════
export async function reengagementDirectoLeads(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();

    // Fechas límite para cada etapa
    const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace14dias = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
    const hace21dias = new Date(ahora.getTime() - 21 * 24 * 60 * 60 * 1000);

    // Buscar leads potenciales para re-engagement
    // Status: new, contacted, qualified (no scheduled, visited, negotiation, etc.)
    const { data: leads, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, updated_at, assigned_to, property_interest, lead_category')
      .in('status', ['new', 'contacted', 'qualified'])
      .lt('updated_at', hace3dias.toISOString())
      .not('phone', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(50);

    console.log(`❄️ DEBUG: Buscando leads con updated_at < ${hace3dias.toISOString()}`);
    console.log(`❄️ DEBUG: Query result - error: ${error?.message || 'ninguno'}, leads: ${leads?.length || 0}`);

    if (error || !leads || leads.length === 0) {
      console.log('❄️ Sin leads fríos para re-engagement');
      return;
    }

    console.log(`❄️ Leads fríos encontrados: ${leads.length}`);

    let mensajesEnviados = 0;
    const hoyStr = ahora.toISOString().split('T')[0];

    for (const lead of leads) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const ultimaActualizacion = new Date(lead.updated_at);
      const diasSinRespuesta = Math.floor((ahora.getTime() - ultimaActualizacion.getTime()) / (1000 * 60 * 60 * 24));

      // Verificar qué mensajes ya se enviaron
      const reengagement = notas?.reengagement || {};
      const paso1Enviado = reengagement.paso1_sent;
      const paso2Enviado = reengagement.paso2_sent;
      const paso3Enviado = reengagement.paso3_sent;
      const ultimoEnvio = reengagement.last_sent;

      // No enviar si ya enviamos hoy
      if (ultimoEnvio === hoyStr) {
        continue;
      }

      // No enviar si ya completamos la secuencia
      if (paso3Enviado) {
        // Escalación churn: notificar vendedor antes de marcar frío
        const churnRisk = notas?.churn_risk;
        if (churnRisk?.label === 'critical' && !notas?.churn_escalation_sent && lead.assigned_to) {
          try {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('id, name, phone')
              .eq('id', lead.assigned_to)
              .single();
            if (vendedor?.phone) {
              const escalMsg = `🚨 *ÚLTIMA OPORTUNIDAD: ${lead.name || 'Lead'}*\n\nEste lead completó re-engagement sin responder y está en riesgo CRÍTICO.\n📋 ${Array.isArray(churnRisk.reasons) ? churnRisk.reasons.join(', ') : ''}\n\n⚡ *Contacta HOY* o será marcado como frío.\n📞 bridge ${(lead.name || '').split(' ')[0]}`;
              await enviarMensajeTeamMember(supabase, meta, vendedor, escalMsg, {
                tipoMensaje: 'alerta_lead',
                pendingKey: 'pending_alerta_lead'
              });
              await supabase.client.from('leads')
                .update({ notes: { ...notas, churn_escalation_sent: ahora.toISOString() } })
                .eq('id', lead.id);
              console.log(`🚨 Escalación churn enviada a ${vendedor.name} por ${lead.name}`);
            }
          } catch (escErr) {
            console.error(`Error escalación churn ${lead.name}:`, escErr);
          }
        }

        // Si pasaron 21+ días sin respuesta después del paso 3, marcar como frío
        if (diasSinRespuesta >= 21 && !notas?.marked_cold) {
          await supabase.client
            .from('leads')
            .update({
              status: 'cold',
              notes: { ...notas, marked_cold: true, marked_cold_at: ahora.toISOString() }
            })
            .eq('id', lead.id);
          console.log(`🥶 Lead ${lead.name} marcado como FRÍO (21+ días sin respuesta)`);
        }
        continue;
      }

      const nombreCorto = lead.name?.split(' ')[0] || '';
      const desarrollo = lead.property_interest || 'nuestros desarrollos';
      let pasoActual = '';

      // Determinar qué paso enviar
      // PASO 1: Día 3-6 - Recordatorio amigable
      if (!paso1Enviado && diasSinRespuesta >= 3 && diasSinRespuesta < 7) {
        pasoActual = 'paso1';
      }
      // PASO 2: Día 7-13 - Segundo intento
      else if (paso1Enviado && !paso2Enviado && diasSinRespuesta >= 7 && diasSinRespuesta < 14) {
        pasoActual = 'paso2';
      }
      // PASO 3: Día 14+ - Último intento
      else if (paso1Enviado && paso2Enviado && !paso3Enviado && diasSinRespuesta >= 14) {
        pasoActual = 'paso3';
      }

      // Enviar template si corresponde
      if (pasoActual) {
        // LÍMITE DE MENSAJES: Verificar si puede recibir más mensajes hoy
        const puedeEnviar = await puedeEnviarMensajeAutomatico(supabase, lead.id);
        if (!puedeEnviar) {
          console.log(`⏭️ Re-engagement ${pasoActual} saltado para ${lead.name} (límite diario alcanzado)`);
          continue;
        }

        try {
          // Usar template aprobado "seguimiento_lead" con variables
          // Template: ¡Hola {{1}}! 👋 Hace unos días platicamos sobre *{{2}}*...
          const templateComponents = [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: nombreCorto },
                { type: 'text', text: desarrollo }
              ]
            }
          ];

          await meta.sendTemplate(lead.phone, 'seguimiento_lead', 'es_MX', templateComponents);

          // Registrar mensaje automático enviado
          await registrarMensajeAutomatico(supabase, lead.id);

          console.log(`❄️ Re-engagement ${pasoActual} (template) enviado a ${lead.name} (${diasSinRespuesta} días)`);

          // Actualizar tracking + guardar contexto para respuesta
          const nuevoReengagement = {
            ...reengagement,
            [`${pasoActual}_sent`]: hoyStr,
            last_sent: hoyStr,
            last_step: pasoActual
          };

          // Guardar pending_auto_response para que el sistema sepa responder si el lead contesta
          const pendingAutoResponse = {
            type: 'lead_frio',
            sent_at: ahora.toISOString(),
            vendedor_id: lead.assigned_to,
            step: pasoActual
          };

          await supabase.client
            .from('leads')
            .update({
              notes: { ...notas, reengagement: nuevoReengagement, pending_auto_response: pendingAutoResponse }
            })
            .eq('id', lead.id);

          // Registrar actividad
          await supabase.client.from('lead_activities').insert({
            lead_id: lead.id,
            team_member_id: lead.assigned_to,
            activity_type: 'reengagement',
            notes: `Re-engagement automático ${pasoActual}: ${diasSinRespuesta} días sin respuesta`,
            created_at: ahora.toISOString()
          });

          // Notificar al vendedor que su lead está siendo reactivado
          if (lead.assigned_to) {
            try {
              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('*')
                .eq('id', lead.assigned_to)
                .single();
              if (vendedor?.phone) {
                const alertaVendedor = `⚠️ *LEAD FRÍO - RE-ENGAGEMENT*\n\n` +
                  `👤 *${lead.name || 'Sin nombre'}*\n` +
                  `📱 ${formatPhoneForDisplay(lead.phone)}\n` +
                  `🏠 ${desarrollo}\n` +
                  `📅 ${diasSinRespuesta} días sin respuesta\n\n` +
                  `SARA le envió seguimiento automático (${pasoActual}).\n` +
                  `💡 Si responde, dale atención inmediata.`;
                await enviarMensajeTeamMember(supabase, meta, vendedor, alertaVendedor, {
                  tipoMensaje: 'alerta_lead',
                  guardarPending: true,
                  pendingKey: 'pending_alerta_lead'
                });
              }
            } catch (e) {
              console.error(`Error notificando vendedor de re-engagement:`, e);
            }
          }

          mensajesEnviados++;

          // Limitar a 10 mensajes por ejecución para no saturar
          if (mensajesEnviados >= 10) {
            console.log('❄️ Límite de 10 mensajes alcanzado, continuará en próxima ejecución');
            break;
          }

        } catch (err) {
          console.error(`❄️ Error enviando re-engagement a ${lead.name}:`, err);
        }
      }
    }

    console.log(`❄️ Re-engagement directo completado: ${mensajesEnviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en reengagementDirectoLeads:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'reengagementDirectoLeads', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGUIMIENTO POST-VENTA - Pedir referidos después de la venta
// ═══════════════════════════════════════════════════════════════════════════
export async function seguimientoPostVenta(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();

    // Buscar leads con status 'sold'
    const { data: clientes, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, updated_at, assigned_to, last_message_at')
      .eq('status', 'sold')
      .not('phone', 'is', null);

    if (error || !clientes || clientes.length === 0) {
      console.log('📭 Sin clientes para seguimiento post-venta');
      return;
    }

    console.log(`🎉 Post-venta: ${clientes.length} clientes vendidos`);

    // Obtener vendedores
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('role', 'vendedor')
      .eq('active', true);
    const vendedorMap = new Map<string, any>((vendedores || []).map(v => [v.id as string, v]));

    let enviados = 0;

    for (const cliente of clientes) {
      // Calcular días desde la venta
      const fechaVenta = cliente.notes?.fecha_venta || cliente.updated_at;
      const diasDesdeVenta = Math.floor((ahora.getTime() - new Date(fechaVenta).getTime()) / (1000 * 60 * 60 * 24));

      // Obtener estado de seguimiento
      const postVenta = cliente.notes?.post_venta || { etapa: 0, ultimo_contacto: null };
      const nombreCliente = cliente.name?.split(' ')[0] || 'vecino';

      // Determinar qué mensaje enviar
      let mensaje: string | null = null;
      let etapaNueva = postVenta.etapa;
      let notificarVendedor = false;

      // Etapa 0 → 1: A los 30 días, preguntar cómo está
      if (postVenta.etapa === 0 && diasDesdeVenta >= 30) {
        mensaje = `¡Hola ${nombreCliente}! 🏡\n\n`;
        mensaje += `Han pasado unas semanas desde que te entregamos tu nuevo hogar y queríamos saber cómo te ha ido.\n\n`;
        mensaje += `¿Todo bien con la propiedad? ¿Hay algo en lo que podamos ayudarte?\n\n`;
        mensaje += `Nos da mucho gusto que seas parte de nuestra comunidad. 😊`;
        etapaNueva = 1;

      // Etapa 1 → 2: A los 60 días, pedir referidos (usando TEMPLATE)
      } else if (postVenta.etapa === 1 && diasDesdeVenta >= 60) {
        // Usar template referidos_postventa
        const desarrollo = cliente.notes?.property_interest || cliente.notes?.desarrollo || 'tu desarrollo';
        try {
          const templateComponents = [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: nombreCliente },
                { type: 'text', text: desarrollo }
              ]
            }
          ];
          await meta.sendTemplate(cliente.phone, 'referidos_postventa', 'es_MX', templateComponents);
          console.log(`   ✅ Post-venta etapa 2 (template referidos) enviado a ${cliente.name}`);

          // Actualizar notas + guardar contexto para respuesta
          const nuevasNotas = {
            ...cliente.notes,
            post_venta: {
              etapa: 2,
              ultimo_contacto: ahora.toISOString(),
              historial: [...(postVenta.historial || []), { etapa: 2, fecha: ahora.toISOString() }]
            },
            pending_auto_response: {
              type: 'postventa',
              sent_at: ahora.toISOString(),
              vendedor_id: cliente.assigned_to,
              etapa: 2
            }
          };
          await supabase.client.from('leads').update({ notes: nuevasNotas }).eq('id', cliente.id);
          enviados++;

          // Notificar al vendedor (respetando ventana 24h)
          if (cliente.assigned_to) {
            try {
              const { data: vendedorRef } = await supabase.client
                .from('team_members')
                .select('*')
                .eq('id', cliente.assigned_to)
                .single();
              if (vendedorRef?.phone) {
                await enviarMensajeTeamMember(supabase, meta, vendedorRef,
                  `🎯 *Oportunidad de referidos*\n\nSe envió mensaje pidiendo referidos a *${cliente.name}*.\n\nSi responde con contactos, dale seguimiento rápido.`,
                  { tipoMensaje: 'notificacion', guardarPending: true }
                );
              }
            } catch (e) {
              console.error('Error notificando vendedor de referidos:', e);
            }
          }
        } catch (templateErr) {
          console.error(`⚠️ Template referidos falló para ${cliente.name}:`, templateErr);
        }
        continue; // Ya procesamos este cliente

      // Etapa 2 → 3: A los 90 días, último recordatorio de referidos
      } else if (postVenta.etapa === 2 && diasDesdeVenta >= 90) {
        mensaje = `¡Hola ${nombreCliente}! 🌟\n\n`;
        mensaje += `¿Cómo va todo con tu casa? Esperamos que de maravilla.\n\n`;
        mensaje += `Te recordamos que si recomiendas a alguien que compre con nosotros, tienes un *bono de agradecimiento* esperándote.\n\n`;
        mensaje += `¿Tienes a alguien en mente? Solo mándanos su contacto. 📲\n\n`;
        mensaje += `¡Gracias por ser parte de nuestra familia! 🏠❤️`;
        etapaNueva = 3;
      }

      // Enviar mensaje si corresponde (post-venta leads have closed 24h window — use enviarMensajeLead wrapper)
      if (mensaje) {
        try {
          const templateComponents = [
            { type: 'body', parameters: [{ type: 'text', text: nombreCliente }] }
          ];
          const resultado = await enviarMensajeLead(supabase, meta, {
            id: cliente.id, phone: cliente.phone, name: cliente.name, notes: cliente.notes, last_message_at: cliente.last_message_at
          }, mensaje, {
            templateComponents,
            pendingContext: { tipo: 'postventa' }
          });

          if (resultado.method === 'skipped') continue;
          console.log(`   ✅ Post-venta etapa ${etapaNueva} enviado a ${cliente.name || cliente.phone} (method: ${resultado.method})`);

          // Actualizar notas del cliente + guardar contexto para respuesta
          const nuevasNotas = {
            ...cliente.notes,
            post_venta: {
              etapa: etapaNueva,
              ultimo_contacto: ahora.toISOString(),
              historial: [
                ...(postVenta.historial || []),
                { etapa: etapaNueva, fecha: ahora.toISOString() }
              ]
            },
            pending_auto_response: {
              type: 'postventa',
              sent_at: ahora.toISOString(),
              vendedor_id: cliente.assigned_to,
              etapa: etapaNueva
            }
          };

          await supabase.client
            .from('leads')
            .update({ notes: nuevasNotas })
            .eq('id', cliente.id);

          // Notificar al vendedor cuando se piden referidos (24h-safe)
          if (notificarVendedor) {
            const vendedor = vendedorMap.get(cliente.assigned_to);
            if (vendedor?.id) {
              const notifMsg = `🎯 *Oportunidad de referidos*\n\n` +
                `Se envió mensaje pidiendo referidos a *${cliente.name}*.\n\nSi responde con contactos, dale seguimiento rápido.`;
              await enviarMensajeTeamMember(supabase, meta, vendedor, notifMsg, {
                tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
              });
            }
          }

          enviados++;

        } catch (err) {
          console.error(`   ❌ Error enviando post-venta a ${cliente.phone}:`, err);
        }
      }
    }

    console.log(`🎉 Post-venta completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en seguimientoPostVenta:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'seguimientoPostVenta', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE CUMPLEAÑOS - USA TEMPLATE feliz_cumple
// ═══════════════════════════════════════════════════════════════
export async function enviarFelicitacionesCumple(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🎂 Verificando cumpleaños del día...');

    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${mes}-${dia}`;
    const añoActual = hoy.getFullYear();

    // Buscar leads cuyo cumpleaños sea hoy (formato: YYYY-MM-DD o MM-DD)
    const { data: leadsCumple } = await supabase.client
      .from('leads')
      .select('id, name, phone, birthday, notes, assigned_to, last_message_at')
      .or(`birthday.ilike.%-${fechaHoy},birthday.ilike.${fechaHoy}%`)
      .not('phone', 'is', null)
      .not('status', 'in', '("lost","fallen")');

    if (!leadsCumple || leadsCumple.length === 0) {
      console.log('🎂 No hay leads cumpliendo años hoy');
      return;
    }

    console.log(`🎂 Encontrados ${leadsCumple.length} leads cumpliendo años hoy`);

    let enviados = 0;

    for (const lead of leadsCumple) {
      if (!lead.phone) continue;

      // Verificar si ya lo felicitamos este año
      const notesStr = typeof lead.notes === 'string' ? lead.notes : JSON.stringify(lead.notes || '');
      if (notesStr.includes(`cumple_felicitado_${añoActual}`)) {
        console.log(`⏭️ Ya felicitamos a ${lead.name} este año`);
        continue;
      }

      const nombreCorto = lead.name?.split(' ')[0] || '';

      try {
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto }
            ]
          }
        ];

        const mensajeCumple = `🎂 ¡Feliz cumpleaños ${nombreCorto}! 🎉\n\n` +
          `Todo el equipo te desea un día increíble.\n\n` +
          `Gracias por ser parte de nuestra familia. 🏠💙`;

        const resultado = await enviarMensajeLead(supabase, meta, {
          id: lead.id, phone: lead.phone, name: lead.name, notes: lead.notes, last_message_at: lead.last_message_at
        }, mensajeCumple, {
          templateName: 'feliz_cumple',
          templateComponents,
          pendingContext: { tipo: 'cumpleanos' }
        });

        if (resultado.method === 'skipped') continue;

        console.log(`🎂 Felicitación enviada a ${lead.name} (method: ${resultado.method})`);

        // Marcar como felicitado
        const notasActuales = lead.notes || {};
        const nuevasNotas = typeof notasActuales === 'object'
          ? {
              ...notasActuales,
              [`cumple_felicitado_${añoActual}`]: true
            }
          : {
              [`cumple_felicitado_${añoActual}`]: true
            };

        await supabase.client
          .from('leads')
          .update({ notes: nuevasNotas })
          .eq('id', lead.id);

        enviados++;

      } catch (err) {
        console.error(`❌ No se pudo enviar felicitación a ${lead.name}:`, err);
      }
    }

    // También felicitar al equipo
    await felicitarEquipoCumple(supabase, meta, fechaHoy, añoActual);

    console.log(`🎂 Felicitaciones completadas: ${enviados} leads felicitados`);

  } catch (e) {
    console.error('Error en enviarFelicitacionesCumple:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarFelicitacionesCumple', stack: (e as Error).stack }).catch(() => {});
  }
}

// Felicitar a miembros del equipo que cumplen años
export async function felicitarEquipoCumple(supabase: SupabaseService, meta: MetaWhatsAppService, fechaHoy: string, añoActual: number): Promise<void> {
  try {
    const { data: equipo } = await supabase.client
      .from('team_members')
      .select('id, name, phone, birthday, notes')
      .or(`birthday.ilike.%-${fechaHoy},birthday.ilike.${fechaHoy}%`)
      .eq('active', true)
      .not('phone', 'is', null);

    if (!equipo || equipo.length === 0) {
      console.log('🎂 No hay miembros del equipo cumpliendo años hoy');
      return;
    }

    console.log(`🎂 ${equipo.length} miembro(s) del equipo cumplen años hoy`);

    for (const miembro of equipo) {
      if (!miembro.phone) continue;

      const notesStr = typeof miembro.notes === 'string' ? miembro.notes : JSON.stringify(miembro.notes || '');
      if (notesStr.includes(`cumple_felicitado_${añoActual}`)) {
        console.log(`⏭️ Ya felicitamos a ${miembro.name} (equipo) este año`);
        continue;
      }

      const nombreCorto = miembro.name?.split(' ')[0] || 'colega';

      try {
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto }
            ]
          }
        ];

        await meta.sendTemplate(miembro.phone, 'feliz_cumple', 'es_MX', templateComponents);
        console.log(`🎂 Felicitación (template) enviada a ${miembro.name} (equipo)`);

        // Marcar como felicitado
        const notasActuales = miembro.notes || {};
        const nuevasNotas = typeof notasActuales === 'object'
          ? { ...notasActuales, [`cumple_felicitado_${añoActual}`]: true }
          : { [`cumple_felicitado_${añoActual}`]: true };

        await supabase.client
          .from('team_members')
          .update({ notes: nuevasNotas })
          .eq('id', miembro.id);

      } catch (err) {
        console.error(`⚠️ Error felicitando a ${miembro.name} (equipo):`, err);
      }
    }

  } catch (e) {
    console.error('Error felicitando equipo:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'felicitarEquipoCumple', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// SEGUIMIENTO DE CRÉDITO HIPOTECARIO - USA TEMPLATE info_credito
// Para leads que necesitan crédito pero no han avanzado
// ═══════════════════════════════════════════════════════════════
export async function seguimientoCredito(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🏦 Verificando leads con crédito pendiente...');

    const ahora = new Date();
    const hace5dias = new Date(ahora.getTime() - 5 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que:
    // 1. Necesitan crédito (needs_mortgage = true)
    // 2. No tienen solicitud de hipoteca activa (o está estancada)
    // 3. No han tenido actividad en 5+ días
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, property_interest, updated_at, needs_mortgage, last_message_at, assigned_to')
      .eq('needs_mortgage', true)
      .not('status', 'in', '("lost","fallen","cold","closed","paused")')
      .lt('updated_at', hace5dias.toISOString())
      .not('phone', 'is', null)
      .limit(20);

    if (!leads || leads.length === 0) {
      console.log('🏦 No hay leads con crédito pendiente para seguimiento');
      return;
    }

    console.log(`🏦 Leads con crédito pendiente encontrados: ${leads.length}`);

    let enviados = 0;

    for (const lead of leads) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};

      // No enviar si ya enviamos seguimiento de crédito hoy
      if (notas?.credito_seguimiento_sent === hoyStr) {
        continue;
      }

      // No enviar si ya enviamos en los últimos 7 días
      const ultimoEnvioCredito = notas?.ultimo_seguimiento_credito;
      if (ultimoEnvioCredito) {
        const ultimaFecha = new Date(ultimoEnvioCredito);
        const diasDesdeUltimo = Math.floor((ahora.getTime() - ultimaFecha.getTime()) / (1000 * 60 * 60 * 24));
        if (diasDesdeUltimo < 7) {
          continue;
        }
      }

      // Verificar si ya tiene solicitud de hipoteca activa
      const { data: solicitud } = await supabase.client
        .from('mortgage_applications')
        .select('id, status')
        .eq('lead_id', lead.id)
        .neq('status', 'cancelled')
        .limit(1)
        .maybeSingle();

      // Si ya tiene solicitud activa, no enviar
      if (solicitud) {
        continue;
      }

      const nombreCorto = lead.name?.split(' ')[0] || '';
      const desarrollo = lead.property_interest || 'tu casa ideal';

      try {
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto },
              { type: 'text', text: desarrollo }
            ]
          }
        ];

        const mensajeCredito = `🏦 ¡Hola ${nombreCorto}!\n\n` +
          `Te comparto información sobre crédito hipotecario para *${desarrollo}*:\n\n` +
          `✅ Hasta 20 años de plazo\n` +
          `✅ Tasa competitiva\n` +
          `✅ Varios bancos disponibles\n\n` +
          `¿Te gustaría que un asesor te contacte? Responde *Sí*.`;

        const resultado = await enviarMensajeLead(supabase, meta, {
          id: lead.id, phone: lead.phone, name: lead.name, notes: notas, last_message_at: lead.last_message_at
        }, mensajeCredito, {
          templateName: 'info_credito',
          templateComponents,
          pendingContext: { tipo: 'seguimiento_credito' }
        });

        if (resultado.method === 'skipped') continue;

        console.log(`🏦 Seguimiento crédito enviado a ${lead.name} (method: ${resultado.method})`);

        // Marcar como enviado
        await supabase.client
          .from('leads')
          .update({
            notes: {
              ...notas,
              credito_seguimiento_sent: hoyStr,
              ultimo_seguimiento_credito: ahora.toISOString()
            }
          })
          .eq('id', lead.id);

        // Registrar actividad
        await supabase.client.from('activities').insert([{
          type: 'system',
          lead_id: lead.id,
          activity_type: 'seguimiento_credito',
          notes: `Seguimiento crédito enviado (${resultado.method})`,
          created_at: ahora.toISOString()
        }]);

        enviados++;

      } catch (err) {
        console.error(`❌ Error enviando seguimiento crédito a ${lead.name}:`, err);
      }
    }

    console.log(`🏦 Seguimiento crédito completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en seguimientoCredito:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'seguimientoCredito', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// BROADCAST QUEUE - Procesa broadcasts encolados
// ═══════════════════════════════════════════════════════════════
export async function procesarBroadcastQueue(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // 🚨 KILL SWITCH - Verificar si broadcasts están habilitados
    // Por seguridad, si no existe el config o hay error, NO procesar
    try {
      const { data: config, error } = await supabase.client
        .from('system_config')
        .select('value')
        .eq('key', 'broadcasts_enabled')
        .single();

      // SEGURO POR DEFECTO: Si no hay config, error, o está en false -> NO procesar
      if (error || !config || config.value === 'false' || config.value === false) {
        // Solo loguear en primera ejecución de la hora para no spamear logs
        const now = new Date();
        if (now.getMinutes() < 2) {
          console.log('🛑 Broadcasts: kill switch activo (habilitar en CRM o vía /api/broadcasts-enable)');
        }
        return;
      }
    } catch (e) {
      console.log('🛑 BROADCASTS DESHABILITADOS - Error verificando config');
      return;
    }

    const queueService = new BroadcastQueueService(supabase);

    // Procesar broadcasts pendientes
    const result = await queueService.processPendingBroadcasts(
      async (phone: string, templateName: string, lang: string, components: any[]) => {
        return meta.sendTemplate(phone, templateName, lang, components);
      },
      async (phone: string, message: string) => {
        // ⚠️ BROADCASTS usan rate limiting (bypassRateLimit = false)
        return meta.sendWhatsAppMessage(phone, message, false);
      }
    );

    if (result.processed > 0) {
      console.log(`📤 QUEUE: Procesados ${result.processed} jobs, ${result.sent} enviados, ${result.errors} errores`);
    }

    // Notificar broadcasts completados
    const completedJobs = await queueService.getCompletedJobsToNotify();

    for (const job of completedJobs) {
      if (job.created_by_phone) {
        try {
          const mensaje = `✅ *Broadcast completado*\n\n` +
            `📊 Segmento: ${job.segment}\n` +
            `📤 Enviados: ${job.sent_count}/${job.total_leads}\n` +
            `❌ Errores: ${job.error_count}\n\n` +
            `El envío masivo ha finalizado.`;

          await meta.sendWhatsAppMessage(job.created_by_phone, mensaje);
          await queueService.markAsNotified(job.id);
          console.log(`📤 QUEUE: Notificación enviada a ${job.created_by_phone}`);
        } catch (notifyErr) {
          console.error(`Error notificando broadcast completado:`, notifyErr);
        }
      }
    }

  } catch (e) {
    console.error('Error en procesarBroadcastQueue:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'procesarBroadcastQueue', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// FOLLOW-UP 24H LEADS NUEVOS
// Envía mensaje a leads status='new' que no respondieron en 24h
// Usa campo alerta_enviada_24h para no duplicar
// ═══════════════════════════════════════════════════════════
export async function followUp24hLeadsNuevos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads nuevos sin respuesta en 24h que NO tengan alerta ya enviada
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, property_interest, alerta_enviada_24h, assigned_to, notes, team_members:assigned_to(name, phone)')
      .eq('status', 'new')
      .lt('created_at', hace24h.toISOString())
      .is('alerta_enviada_24h', null)
      .not('phone', 'is', null)
      .limit(20);

    if (!leads || leads.length === 0) {
      console.log('⏰ No hay leads nuevos pendientes de follow-up 24h');
      return;
    }

    console.log(`⏰ Leads nuevos sin respuesta 24h: ${leads.length}`);

    let enviados = 0;
    const mensajes = [
      '¡Hola {nombre}! 👋 Soy Sara de Grupo Santa Rita. Vi que nos contactaste ayer interesado en nuestras casas. ¿Te gustaría que te cuente más sobre lo que tenemos disponible?',
      'Hola {nombre}, ¿cómo estás? 🏡 Quedé pendiente de platicarte sobre las opciones que tenemos para ti. ¿Tienes un momento?',
      '¡Hey {nombre}! 👋 No quiero ser insistente pero vi que no pudimos conectar ayer. ¿Hay algo en particular que busques? Me encantaría ayudarte.'
    ];

    for (const lead of leads) {
      if (!lead.phone) continue;

      // LÍMITE DE MENSAJES: Verificar si puede recibir más mensajes hoy
      const puedeEnviar = await puedeEnviarMensajeAutomatico(supabase, lead.id);
      if (!puedeEnviar) {
        console.log(`⏭️ Follow-up 24h saltado para ${lead.name} (límite diario alcanzado)`);
        continue;
      }

      const phoneLimpio = lead.phone.replace(/\D/g, '');
      const nombre = lead.name?.split(' ')[0] || 'amigo';

      // Seleccionar mensaje aleatorio
      const mensajeTemplate = mensajes[Math.floor(Math.random() * mensajes.length)];
      const mensaje = mensajeTemplate.replace('{nombre}', nombre);

      try {
        // ═══════════════════════════════════════════════════════════
        // SISTEMA DE APROBACIÓN: Guardar pendiente y notificar vendedor
        // El vendedor tiene 30 min para aprobar, editar o cancelar
        // ═══════════════════════════════════════════════════════════
        const vendedor = lead.team_members as any;
        const ahora = new Date();
        const expiraEn = new Date(ahora.getTime() + 30 * 60 * 1000); // 30 minutos

        // Guardar follow-up pendiente en notes del lead
        const notasActuales = typeof lead.notes === 'object' ? lead.notes : {};
        const pendingFollowup = {
          tipo: 'followup_24h',
          mensaje: mensaje,
          lead_phone: phoneLimpio,
          lead_name: lead.name,
          vendedor_id: lead.assigned_to,
          created_at: ahora.toISOString(),
          expires_at: expiraEn.toISOString(),
          status: 'pending' // pending, approved, cancelled, sent
        };

        await supabase.client
          .from('leads')
          .update({
            notes: { ...notasActuales, pending_followup: pendingFollowup },
            alerta_enviada_24h: hoyStr // Marcar para no volver a procesar
          })
          .eq('id', lead.id);

        // Notificar al vendedor con preview del mensaje (24h-safe)
        if (vendedor) {
          const notificacion = `📤 *FOLLOW-UP PENDIENTE*\n\n` +
            `Lead: *${lead.name}*\n` +
            `En 30 min enviaré:\n\n` +
            `"${mensaje}"\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *ok ${nombre.toLowerCase()}* → enviar ahora\n` +
            `• *cancelar ${nombre.toLowerCase()}* → no enviar\n` +
            `• *editar ${nombre.toLowerCase()} [mensaje]* → tu versión\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `_Si no respondes, se envía automático_`;

          await enviarMensajeTeamMember(supabase, meta, vendedor, notificacion, {
            tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
          });
          console.log(`📤 Follow-up pendiente creado para ${lead.name}, vendedor ${vendedor.name} notificado`);
        } else {
          // Sin vendedor asignado, enviar via wrapper
          const resultado = await enviarMensajeLead(supabase, meta, {
            id: lead.id, phone: phoneLimpio, name: lead.name, notes: notasActuales, last_message_at: (lead as any).last_message_at
          }, mensaje, {
            pendingContext: { tipo: 'followup_inactivo' }
          });
          if (resultado.method !== 'skipped') {
            await registrarMensajeAutomatico(supabase, lead.id);
          }
          console.log(`⏰ Follow-up 24h enviado a ${lead.name} (sin vendedor, method: ${resultado.method})`);
        }

        enviados++;

        // Pequeña pausa entre mensajes
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`Error creando follow-up pendiente para ${lead.name}:`, err);
      }
    }

    console.log(`⏰ Follow-up 24h completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en followUp24hLeadsNuevos:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'followUp24hLeadsNuevos', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// REMINDER DOCUMENTOS CRÉDITO
// Recuerda a leads con credit_status='docs_requested' por 3+ días
// ═══════════════════════════════════════════════════════════
export async function reminderDocumentosCredito(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que llevan 3+ días con documentos solicitados
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, property_interest, credit_status, last_message_at, team_members:assigned_to(name, phone)')
      .eq('credit_status', 'docs_requested')
      .lt('updated_at', hace3dias.toISOString())
      .not('phone', 'is', null)
      .limit(15);

    if (!leads || leads.length === 0) {
      console.log('📄 No hay leads pendientes de documentos para recordar');
      return;
    }

    console.log(`📄 Leads pendientes de docs por 3+ días: ${leads.length}`);

    let enviados = 0;

    for (const lead of leads) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};

      // No enviar si ya recordamos hoy
      if ((notas as any)?.docs_reminder_sent === hoyStr) continue;

      // No enviar si ya enviamos en los últimos 5 días
      const ultimoReminder = (notas as any)?.ultimo_docs_reminder;
      if (ultimoReminder) {
        const ultimaFecha = new Date(ultimoReminder);
        const diasDesdeUltimo = Math.floor((ahora.getTime() - ultimaFecha.getTime()) / (1000 * 60 * 60 * 24));
        if (diasDesdeUltimo < 5) continue;
      }

      const phoneLimpio = lead.phone.replace(/\D/g, '');
      const nombre = lead.name?.split(' ')[0] || 'Hola';

      const mensaje = `¡Hola ${nombre}! 📋\n\n` +
        `Te recuerdo que estamos esperando tus documentos para continuar con tu trámite de crédito hipotecario.\n\n` +
        `📄 Los documentos que necesitamos son:\n` +
        `• INE (frente y vuelta)\n` +
        `• Comprobante de ingresos\n` +
        `• Comprobante de domicilio\n\n` +
        `¿Necesitas ayuda con algo? Estoy aquí para apoyarte. 🏡`;

      try {
        const resultado = await enviarMensajeLead(supabase, meta, {
          id: lead.id, phone: phoneLimpio, name: lead.name, notes: notas, last_message_at: lead.last_message_at
        }, mensaje, {
          pendingContext: { tipo: 'seguimiento_credito' }
        });

        if (resultado.method === 'skipped') continue;
        console.log(`📋 Docs reminder enviado a ${lead.name} (method: ${resultado.method})`);

        // Actualizar notas (fresh read to avoid JSONB race)
        const { data: freshLead } = await supabase.client
          .from('leads')
          .select('notes')
          .eq('id', lead.id)
          .maybeSingle();
        const freshNotes = typeof freshLead?.notes === 'object' ? freshLead.notes : {};
        const notasActualizadas = {
          ...freshNotes,
          docs_reminder_sent: hoyStr,
          ultimo_docs_reminder: ahora.toISOString()
        };

        await supabase.client
          .from('leads')
          .update({
            notes: notasActualizadas,
            updated_at: new Date().toISOString()
          })
          .eq('id', lead.id);

        enviados++;
        console.log(`📄 Reminder docs enviado a: ${lead.name}`);

        // Notificar al vendedor (24h-safe)
        const vendedor = lead.team_members as any;
        if (vendedor?.id) {
          await enviarMensajeTeamMember(supabase, meta, vendedor,
            `📋 *Lead pendiente de documentos*\n\n` +
            `${lead.name} lleva 3+ días sin enviar docs.\n` +
            `Le envié un recordatorio automático.\n\n` +
            `💡 Quizás una llamada ayude a destrabarlo.`,
            { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
          );
        }

        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`Error enviando reminder docs a ${lead.name}:`, err);
      }
    }

    console.log(`📄 Reminder docs completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en reminderDocumentosCredito:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'reminderDocumentosCredito', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LLAMADAS AUTOMÁTICAS DE SEGUIMIENTO (Retell.ai)
// ═══════════════════════════════════════════════════════════════════════════

interface RetellEnv {
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;
  SARA_CACHE?: KVNamespace;
}

async function isRetellEnabled(env: RetellEnv): Promise<boolean> {
  const { createFeatureFlags } = await import('../services/featureFlagsService');
  const flags = createFeatureFlags(env.SARA_CACHE);
  return flags.isEnabled('retell_enabled');
}

/**
 * Llamadas automáticas de seguimiento post-visita
 * Se ejecuta diario a las 11am - llama a leads que visitaron hace 1 día
 */
export async function llamadasSeguimientoPostVisita(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
      console.log('⏭️ Llamadas IA desactivadas - Retell no configurado');
      return;
    }
    if (!(await isRetellEnabled(env))) {
      console.log('⏭️ Llamadas IA desactivadas - feature flag retell_enabled=false');
      return;
    }

    console.log('📞 Iniciando llamadas de seguimiento post-visita...');

    const ahora = new Date();
    const hace1Dia = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const hace2Dias = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);

    const { data: leadsPostVisita } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, property_interest')
      .eq('status', 'visited')
      .lt('updated_at', hace1Dia.toISOString())
      .gt('updated_at', hace2Dias.toISOString())
      .limit(5);

    if (!leadsPostVisita || leadsPostVisita.length === 0) {
      console.log('📞 No hay leads post-visita para llamar');
      return;
    }

    const { createRetellService } = await import('../services/retellService');
    const retell = createRetellService(
      env.RETELL_API_KEY,
      env.RETELL_AGENT_ID,
      env.RETELL_PHONE_NUMBER
    );

    let llamadasRealizadas = 0;

    for (const lead of leadsPostVisita) {
      try {
        const notes = typeof lead.notes === 'object' ? lead.notes : {};

        // Skip si tiene cadencia activa (la cadencia se encarga)
        if ((notes as any).cadencia?.activa) {
          console.log(`⏭️ ${lead.name} tiene cadencia activa, skip post-visita`);
          continue;
        }

        const ultimaLlamadaIA = (notes as any).ultima_llamada_ia;
        const hoyStr = ahora.toISOString().split('T')[0];

        if (ultimaLlamadaIA === hoyStr) {
          console.log(`⏭️ ${lead.name} ya recibió llamada IA hoy`);
          continue;
        }

        if (!lead.phone) continue;

        const desarrolloInteres = lead.property_interest || (notes as any).desarrollo_interes || '';

        const result = await retell.initiateCall({
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          vendorId: lead.assigned_to,
          desarrolloInteres: desarrolloInteres,
          motivo: 'seguimiento',
          kvCache: env.SARA_CACHE
        });

        if (result.success) {
          llamadasRealizadas++;
          console.log(`📞 Llamada iniciada a ${lead.name} (post-visita)`);

          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notes,
                ultima_llamada_ia: hoyStr,
                llamadas_ia_count: ((notes as any).llamadas_ia_count || 0) + 1
              }
            })
            .eq('id', lead.id);

          if (lead.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('id', lead.assigned_to)
              .single();

            if (vendedor) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `📞 *LLAMADA IA POST-VISITA*\n\n` +
                `SARA está llamando a *${lead.name}*\n` +
                `Desarrollo: ${desarrolloInteres || 'General'}\n\n` +
                `Te notifico cuando termine.`,
                { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
              );
            }
          }

          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error(`Error en llamada a ${lead.name}:`, err);
      }
    }

    console.log(`📞 Llamadas post-visita: ${llamadasRealizadas} realizadas`);

  } catch (e) {
    console.error('Error en llamadasSeguimientoPostVisita:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'llamadasSeguimientoPostVisita', stack: (e as Error).stack }).catch(() => {});
  }
}

/**
 * Llamadas automáticas para leads fríos (7 días sin respuesta)
 * Se ejecuta Martes y Jueves a las 10am
 */
export async function llamadasReactivacionLeadsFrios(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
      console.log('⏭️ Llamadas IA desactivadas - Retell no configurado');
      return;
    }
    if (!(await isRetellEnabled(env))) {
      console.log('⏭️ Llamadas IA desactivadas - feature flag retell_enabled=false');
      return;
    }

    console.log('📞 Iniciando llamadas reactivación leads fríos...');

    const ahora = new Date();
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: leadsFrios } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, property_interest')
      .in('status', ['contacted', 'qualified'])
      .lt('last_message_at', hace7Dias.toISOString())
      .gt('last_message_at', hace30Dias.toISOString())
      .limit(3);

    if (!leadsFrios || leadsFrios.length === 0) {
      console.log('📞 No hay leads fríos para llamar');
      return;
    }

    const { createRetellService } = await import('../services/retellService');
    const retell = createRetellService(
      env.RETELL_API_KEY,
      env.RETELL_AGENT_ID,
      env.RETELL_PHONE_NUMBER
    );

    let llamadasRealizadas = 0;
    const hoyStr = ahora.toISOString().split('T')[0];

    for (const lead of leadsFrios) {
      try {
        const notes = typeof lead.notes === 'object' ? lead.notes : {};

        // Skip si tiene cadencia activa
        if ((notes as any).cadencia?.activa) {
          console.log(`⏭️ ${lead.name} tiene cadencia activa, skip reactivación`);
          continue;
        }

        const ultimaLlamadaIA = (notes as any).ultima_llamada_ia;

        if (ultimaLlamadaIA) {
          const diasDesdeUltimaLlamada = Math.floor(
            (ahora.getTime() - new Date(ultimaLlamadaIA).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diasDesdeUltimaLlamada < 7) {
            continue;
          }
        }

        if (!lead.phone) continue;

        const result = await retell.initiateCall({
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          vendorId: lead.assigned_to,
          desarrolloInteres: lead.property_interest || (notes as any).desarrollo_interes || '',
          motivo: 'seguimiento',
          kvCache: env.SARA_CACHE
        });

        if (result.success) {
          llamadasRealizadas++;
          console.log(`📞 Llamada iniciada a ${lead.name} (reactivación)`);

          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notes,
                ultima_llamada_ia: hoyStr,
                llamadas_ia_count: ((notes as any).llamadas_ia_count || 0) + 1
              }
            })
            .eq('id', lead.id);

          // Notificar al vendedor (24h-safe)
          if (lead.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('id', lead.assigned_to)
              .single();

            if (vendedor) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `📞 *LLAMADA IA REACTIVACIÓN*\n\n` +
                `SARA está llamando a *${lead.name}* (lead frío)\n` +
                `Desarrollo: ${lead.property_interest || (notes as any).desarrollo_interes || 'General'}\n\n` +
                `Si responde, te aviso.`,
                { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
              );
            }
          }

          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error(`Error en llamada a ${lead.name}:`, err);
      }
    }

    console.log(`📞 Llamadas reactivación: ${llamadasRealizadas} realizadas`);

  } catch (e) {
    console.error('Error en llamadasReactivacionLeadsFrios:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'llamadasReactivacionLeadsFrios', stack: (e as Error).stack }).catch(() => {});
  }
}

/**
 * Llamadas de recordatorio de cita (1 día antes)
 * Se ejecuta diario a las 5pm
 */
export async function llamadasRecordatorioCita(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
      console.log('⏭️ Llamadas IA desactivadas - Retell no configurado');
      return;
    }
    if (!(await isRetellEnabled(env))) {
      console.log('⏭️ Llamadas IA desactivadas - feature flag retell_enabled=false');
      return;
    }

    console.log('📞 Iniciando llamadas recordatorio de cita...');

    const ahora = new Date();
    const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
    const mananaStr = manana.toISOString().split('T')[0];

    const { data: citasManana } = await supabase.client
      .from('appointments')
      .select('id, lead_id, lead_name, lead_phone, scheduled_time, property_name, vendedor_id')
      .eq('scheduled_date', mananaStr)
      .in('status', ['scheduled', 'confirmed'])
      .limit(5);

    if (!citasManana || citasManana.length === 0) {
      console.log('📞 No hay citas mañana para recordar');
      return;
    }

    const { createRetellService } = await import('../services/retellService');
    const retell = createRetellService(
      env.RETELL_API_KEY,
      env.RETELL_AGENT_ID,
      env.RETELL_PHONE_NUMBER
    );

    let llamadasRealizadas = 0;

    for (const cita of citasManana) {
      try {
        if (!cita.lead_phone) continue;

        const result = await retell.initiateCall({
          leadId: cita.lead_id,
          leadName: cita.lead_name,
          leadPhone: cita.lead_phone,
          vendorId: cita.vendedor_id,
          desarrolloInteres: cita.property_name || '',
          motivo: 'recordatorio_cita',
          notas: `Cita mañana a las ${cita.scheduled_time}`,
          kvCache: env.SARA_CACHE
        });

        if (result.success) {
          llamadasRealizadas++;
          console.log(`📞 Llamada recordatorio a ${cita.lead_name}`);

          // Notificar al vendedor (24h-safe)
          if (cita.vendedor_id) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('id', cita.vendedor_id)
              .single();

            if (vendedor) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `📞 *LLAMADA IA RECORDATORIO*\n\n` +
                `SARA llamó a *${cita.lead_name}* para recordar su cita de mañana a las ${cita.scheduled_time}\n` +
                `Desarrollo: ${cita.property_name || 'General'}`,
                { tipoMensaje: 'recordatorio_cita', pendingKey: 'pending_mensaje' }
              );
            }
          }

          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error(`Error en llamada recordatorio a ${cita.lead_name}:`, err);
      }
    }

    console.log(`📞 Llamadas recordatorio: ${llamadasRealizadas} realizadas`);

  } catch (e) {
    console.error('Error en llamadasRecordatorioCita:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'llamadasRecordatorioCita', stack: (e as Error).stack }).catch(() => {});
  }
}

/**
 * Llamadas a leads nuevos que no responden en 48h
 * Se ejecuta diario a las 12pm L-V
 *
 * Flujo híbrido: WhatsApp (0-24h) → Follow-up WA (24h) → LLAMADA (48h)
 * Este es el escalamiento más efectivo: leads que no responden WhatsApp
 * tienen 3x más probabilidad de responder una llamada.
 *
 * Reglas:
 * - Solo leads con status 'new' o 'contacted' (no qualified+)
 * - Que tengan al menos 1 mensaje de SARA sin respuesta
 * - No hayan recibido llamada IA en los últimos 7 días
 * - Máximo 5 llamadas por ejecución
 * - Solo 9am-8pm México
 */
export async function llamadasEscalamiento48h(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
      console.log('⏭️ Llamadas IA desactivadas - Retell no configurado');
      return;
    }
    if (!(await isRetellEnabled(env))) {
      console.log('⏭️ Llamadas IA desactivadas - feature flag retell_enabled=false');
      return;
    }

    console.log('📞 Iniciando llamadas escalamiento 48h (leads sin responder)...');

    const ahora = new Date();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
    const hace72h = new Date(ahora.getTime() - 72 * 60 * 60 * 1000);

    // Leads nuevos/contactados que SARA les escribió hace 48-72h y no respondieron
    const { data: leadsSinRespuesta } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, property_interest, last_message_at, last_activity_at, score')
      .in('status', ['new', 'contacted'])
      .lt('last_activity_at', hace48h.toISOString())   // Última actividad hace +48h
      .gt('last_activity_at', hace72h.toISOString())    // Pero no más de 72h (evita leads muy viejos)
      .not('phone', 'like', '%000000%')                 // Excluir teléfonos de prueba
      .order('score', { ascending: false })              // Priorizar leads con mayor score
      .limit(10);

    if (!leadsSinRespuesta || leadsSinRespuesta.length === 0) {
      console.log('📞 No hay leads 48h sin responder para llamar');
      return;
    }

    const { createRetellService } = await import('../services/retellService');
    const retell = createRetellService(
      env.RETELL_API_KEY,
      env.RETELL_AGENT_ID,
      env.RETELL_PHONE_NUMBER
    );

    let llamadasRealizadas = 0;
    const maxLlamadas = 5;
    const hoyStr = ahora.toISOString().split('T')[0];

    for (const lead of leadsSinRespuesta) {
      if (llamadasRealizadas >= maxLlamadas) break;

      try {
        const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};

        // Skip si tiene cadencia activa
        if ((notes as any).cadencia?.activa) {
          console.log(`⏭️ ${lead.name} tiene cadencia activa, skip escalamiento 48h`);
          continue;
        }

        const ultimaLlamadaIA = (notes as any).ultima_llamada_ia;

        // No llamar si ya recibió llamada IA en últimos 7 días
        if (ultimaLlamadaIA) {
          const diasDesdeUltimaLlamada = Math.floor(
            (ahora.getTime() - new Date(ultimaLlamadaIA).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diasDesdeUltimaLlamada < 7) {
            console.log(`⏭️ ${lead.name} ya recibió llamada IA hace ${diasDesdeUltimaLlamada} días`);
            continue;
          }
        }

        // No llamar si lead pidió no contacto
        if ((notes as any).no_contactar || (notes as any).do_not_call) {
          console.log(`⏭️ ${lead.name} tiene flag de no contactar`);
          continue;
        }

        if (!lead.phone) continue;

        const desarrolloInteres = lead.property_interest || (notes as any).desarrollo_interes || '';

        const result = await retell.initiateCall({
          leadId: lead.id,
          leadName: lead.name || 'Cliente',
          leadPhone: lead.phone,
          vendorId: lead.assigned_to,
          desarrolloInteres: desarrolloInteres,
          motivo: 'seguimiento',
          notas: 'Escalamiento 48h - lead no respondió WhatsApp',
          kvCache: env.SARA_CACHE
        });

        if (result.success) {
          llamadasRealizadas++;
          console.log(`📞 Llamada 48h iniciada a ${lead.name} (score: ${lead.score})`);

          // Actualizar notes del lead
          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notes,
                ultima_llamada_ia: hoyStr,
                llamadas_ia_count: ((notes as any).llamadas_ia_count || 0) + 1,
                llamada_48h_escalamiento: true
              }
            })
            .eq('id', lead.id);

          // Notificar al vendedor (24h-safe)
          if (lead.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('id', lead.assigned_to)
              .single();

            if (vendedor) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `📞 *LLAMADA IA - ESCALAMIENTO 48h*\n\n` +
                `*${lead.name || 'Lead'}* no respondió WhatsApp en 48h.\n` +
                `SARA le está llamando ahora.\n` +
                `Desarrollo: ${desarrolloInteres || 'General'}\n` +
                `Score: ${lead.score || 0}\n\n` +
                `Te aviso si responde.`,
                { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
              );
            }
          }

          // Delay entre llamadas
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error(`Error en llamada 48h a ${lead.name}:`, err);
      }
    }

    console.log(`📞 Llamadas escalamiento 48h: ${llamadasRealizadas} realizadas de ${leadsSinRespuesta.length} candidatos`);

  } catch (e) {
    console.error('Error en llamadasEscalamiento48h:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'llamadasEscalamiento48h', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REINTENTAR LLAMADAS SIN RESPUESTA
// Busca leads con pending_retry_call y retry_after <= ahora, los llama de nuevo
// Max 5 por ciclo, 5s delay. Mark-before-send para evitar duplicados.
// ═══════════════════════════════════════════════════════════════════════════
export async function reintentarLlamadasSinRespuesta(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
      console.log('⏭️ Retry llamadas desactivado - Retell no configurado');
      return;
    }
    if (!(await isRetellEnabled(env))) {
      console.log('⏭️ Retry llamadas desactivado - feature flag retell_enabled=false');
      return;
    }

    console.log('🔄 Buscando llamadas pendientes de reintento...');

    const ahora = new Date().toISOString();

    // Buscar leads con pending_retry_call cuyo retry_after ya pasó
    const { data: allLeads } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, property_interest')
      .not('notes->pending_retry_call', 'is', null);

    if (!allLeads || allLeads.length === 0) {
      console.log('🔄 No hay llamadas pendientes de reintento');
      return;
    }

    // Filtrar manualmente: retry_after <= ahora
    const leadsParaRetry = allLeads.filter(lead => {
      const notes = typeof lead.notes === 'object' ? lead.notes : {};
      const retry = (notes as any).pending_retry_call;
      return retry && retry.retry_after && retry.retry_after <= ahora;
    }).slice(0, 5); // Max 5 por ciclo

    if (leadsParaRetry.length === 0) {
      console.log('🔄 No hay retries listos aún');
      return;
    }

    const { createRetellService } = await import('../services/retellService');
    const retell = createRetellService(
      env.RETELL_API_KEY,
      env.RETELL_AGENT_ID,
      env.RETELL_PHONE_NUMBER
    );

    let reintentos = 0;

    for (const lead of leadsParaRetry) {
      try {
        if (!lead.phone) continue;

        const notes = typeof lead.notes === 'object' ? lead.notes : {};
        const retry = (notes as any).pending_retry_call;
        if (!retry) continue;

        const motivo = retry.motivo || 'seguimiento';
        const attempt = retry.attempt || 1;
        const desarrolloInteres = lead.property_interest || (notes as any).desarrollo_interes || '';

        // Mark-before-send: limpiar pending_retry_call ANTES de llamar
        const notesLimpio = { ...notes };
        delete (notesLimpio as any).pending_retry_call;
        (notesLimpio as any).ultima_llamada_ia = new Date().toISOString().split('T')[0];
        (notesLimpio as any).llamadas_ia_count = ((notes as any).llamadas_ia_count || 0) + 1;
        await supabase.client.from('leads').update({ notes: notesLimpio }).eq('id', lead.id);

        const result = await retell.initiateCall({
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          vendorId: lead.assigned_to,
          desarrolloInteres,
          motivo,
          kvCache: env.SARA_CACHE
        });

        if (result.success) {
          reintentos++;
          console.log(`🔄 Reintento ${attempt} exitoso para ${lead.name} (${motivo})`);
        } else {
          console.log(`⚠️ Reintento ${attempt} falló para ${lead.name}: ${result.error || 'unknown'}`);

          // Si es intento 2+ y Retell falla, notificar vendedor "llama manual"
          if (attempt >= 2 && lead.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('id', lead.assigned_to)
              .single();

            if (vendedor) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `📵 *NO PUDIMOS CONTACTAR*\n\n` +
                `Lead: *${lead.name}*\n` +
                `Intentos IA: ${attempt}\n` +
                `Razón: ${retry.reason || 'sin respuesta'}\n\n` +
                `💡 *Por favor llama manualmente* para dar seguimiento.`,
                { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
              );
            }
          }
        }

        // Notificar vendedor del reintento
        if (result.success && lead.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('id', lead.assigned_to)
            .single();

          if (vendedor) {
            await enviarMensajeTeamMember(supabase, meta, vendedor,
              `🔄 *REINTENTO LLAMADA IA* (intento ${attempt})\n\n` +
              `SARA está reintentando llamar a *${lead.name}*\n` +
              `Razón anterior: ${retry.reason === 'no_answer' ? 'no contestó' : retry.reason === 'busy' ? 'ocupado' : retry.reason === 'voicemail' ? 'buzón' : retry.reason || 'sin respuesta'}\n` +
              `Desarrollo: ${desarrolloInteres || 'General'}`,
              { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
            );
          }
        }

        await new Promise(r => setTimeout(r, 5000));
      } catch (err) {
        console.error(`Error en reintento para ${lead.name}:`, err);
      }
    }

    console.log(`🔄 Reintentos completados: ${reintentos} de ${leadsParaRetry.length}`);

  } catch (e) {
    console.error('Error en reintentarLlamadasSinRespuesta:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'reintentarLlamadasSinRespuesta', stack: (e as Error).stack }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CADENCIA INTELIGENTE - Secuencia multi-paso WhatsApp + Llamada IA
// ═══════════════════════════════════════════════════════════════════════════

type TipoCadencia = 'lead_nuevo' | 'lead_frio' | 'post_visita' | 'no_show' | 'negociacion_estancada' | 'apartado_sin_cierre';

interface PasoCadencia {
  dia: number;        // días desde inicio de cadencia
  hora: number;       // hora MX (24h)
  accion: 'whatsapp' | 'llamada';
  motivo?: string;    // motivo Retell para llamadas
  plantilla: string;  // texto WhatsApp o motivo descripción
}

interface CadenciaState {
  activa: boolean;
  tipo: TipoCadencia;
  paso_actual: number;     // 0-indexed
  inicio: string;          // ISO date
  proxima_accion: string;  // ISO datetime
  motivo_fin?: string;
}

const CADENCIAS: Record<TipoCadencia, PasoCadencia[]> = {
  lead_nuevo: [
    { dia: 1, hora: 10, accion: 'whatsapp', plantilla: '¡Hola {nombre}! 👋 Soy SARA de Grupo Santa Rita. ¿Pudiste ver la información que te compartimos? Estoy para resolver cualquier duda.' },
    { dia: 2, hora: 10, accion: 'llamada', motivo: 'calificacion', plantilla: 'Llamada de calificación' },
    { dia: 3, hora: 16, accion: 'whatsapp', plantilla: '¡Hola {nombre}! ¿Te quedó alguna duda sobre nuestros desarrollos? Me encantaría ayudarte a encontrar tu casa ideal. 🏡' },
    { dia: 5, hora: 10, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada de seguimiento' },
    { dia: 7, hora: 16, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Solo quería saber si sigues interesado en conocer nuestros desarrollos. Si prefieres que no te contacte, solo dímelo. ¡Que tengas excelente día! 🙂' },
  ],
  lead_frio: [
    { dia: 0, hora: 10, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Hace tiempo platicamos sobre casas en Zacatecas. Tenemos novedades que te podrían interesar. ¿Te gustaría saber más? 🏠' },
    { dia: 2, hora: 16, accion: 'llamada', motivo: 'reactivacion', plantilla: 'Llamada de reactivación' },
    { dia: 5, hora: 10, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Tenemos nuevas opciones de financiamiento y desarrollos que podrían ajustarse a lo que buscas. ¿Te interesa una cotización actualizada? 📋' },
    { dia: 7, hora: 16, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada de seguimiento' },
  ],
  post_visita: [
    { dia: 1, hora: 10, accion: 'whatsapp', plantilla: '¡Hola {nombre}! ¿Qué te pareció tu visita al desarrollo? Me encantaría conocer tu opinión. 🏡' },
    { dia: 3, hora: 10, accion: 'llamada', motivo: 'encuesta', plantilla: 'Llamada de encuesta post-visita' },
    { dia: 5, hora: 16, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Si te interesa, puedo prepararte una cotización personalizada con las mejores opciones de financiamiento. ¿Te gustaría? 📊' },
    { dia: 7, hora: 10, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada de seguimiento' },
  ],
  no_show: [
    { dia: 0, hora: 16, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Notamos que no pudiste asistir a tu cita. ¿Todo bien? Si quieres, podemos reagendar para otro día que te funcione mejor. 📅' },
    { dia: 1, hora: 10, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada de seguimiento por no-show' },
    { dia: 3, hora: 16, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Las casas que ibas a conocer siguen disponibles. ¿Te gustaría reagendar tu visita? Estamos a tus tiempos. 🏡' },
  ],
  negociacion_estancada: [
    { dia: 0, hora: 10, accion: 'whatsapp', plantilla: '¡Hola {nombre}! ¿Cómo vas con tu decisión? Si tienes alguna duda sobre financiamiento, precios o el proceso, con gusto te apoyo. 🏠' },
    { dia: 2, hora: 10, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada de seguimiento negociación' },
    { dia: 5, hora: 16, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Te comento que los precios pueden ajustarse pronto. Si necesitas que te prepare una cotización actualizada o quieres platicar con tu asesor, avísame. 📋' },
    { dia: 7, hora: 10, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada de cierre negociación' },
  ],
  apartado_sin_cierre: [
    { dia: 0, hora: 10, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Ya tienes tu casa apartada — ¡excelente decisión! 🎉 ¿Necesitas apoyo con el proceso de crédito o documentación para avanzar al cierre?' },
    { dia: 3, hora: 10, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada seguimiento apartado' },
    { dia: 7, hora: 16, accion: 'whatsapp', plantilla: '¡Hola {nombre}! Tu apartado sigue vigente. Si tienes dudas sobre los siguientes pasos o el crédito, estoy para ayudarte. ¿En qué te puedo apoyar? 📝' },
    { dia: 10, hora: 10, accion: 'llamada', motivo: 'seguimiento', plantilla: 'Llamada urgente cierre apartado' },
  ],
};

/**
 * Calcula la hora óptima para contactar al lead basado en su historial de actividad.
 * Usa la mediana de horas_actividad clamped a business hours (8-19 MX).
 * Si no hay datos, usa el default del paso.
 */
function getHoraOptima(horasActividad: number[] | undefined, defaultHora: number): number {
  if (!horasActividad || horasActividad.length < 3) return defaultHora; // need min 3 data points
  const sorted = [...horasActividad].sort((a, b) => a - b);
  const mediana = sorted[Math.floor(sorted.length / 2)];
  // Clamp to business hours: 8am - 7pm MX
  return Math.max(8, Math.min(19, mediana));
}

function computeProximaAccion(tipo: TipoCadencia, pasoActual: number, inicioISO: string, horasActividad?: number[]): string | null {
  const pasos = CADENCIAS[tipo];
  if (pasoActual >= pasos.length) return null; // Cadencia completada

  const paso = pasos[pasoActual];
  const inicio = new Date(inicioISO);
  const target = new Date(inicio);
  target.setDate(target.getDate() + paso.dia);

  // Smart scheduling: usar hora de actividad del lead para llamadas, default para WA
  const hora = paso.accion === 'llamada'
    ? getHoraOptima(horasActividad, paso.hora)
    : paso.hora;

  // Hora MX = UTC-6 → target UTC hour = hora + 6
  target.setUTCHours(hora + 6, 0, 0, 0);

  return target.toISOString();
}

async function isCadenciaEnabled(env: RetellEnv): Promise<boolean> {
  const { createFeatureFlags } = await import('../services/featureFlagsService');
  const flags = createFeatureFlags(env.SARA_CACHE);
  return flags.isEnabled('cadencia_inteligente');
}

/**
 * ACTIVAR CADENCIAS AUTOMÁTICAS
 * Diario 9am MX - Detecta leads que califican para cada tipo de cadencia
 * Max 10 por tipo por ejecución
 */
export async function activarCadenciasAutomaticas(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!(await isCadenciaEnabled(env))) {
      console.log('⏭️ Cadencia inteligente desactivada - feature flag cadencia_inteligente=false');
      return;
    }

    console.log('🎯 Activando cadencias automáticas...');
    const ahora = new Date();
    let activadas = 0;

    // ── LEAD NUEVO: new/contacted, sin respuesta 24h+ ──
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: leadsNuevos } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, status')
      .in('status', ['new', 'contacted'])
      .lt('last_message_at', hace24h.toISOString())
      .gt('created_at', hace7d.toISOString())
      .limit(30);

    for (const lead of (leadsNuevos || []).slice(0, 10)) {
      const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      if ((notes as any).cadencia?.activa) continue;
      if ((notes as any).do_not_contact || (notes as any).no_contactar) continue;

      const inicioISO = ahora.toISOString();
      const proxima = computeProximaAccion('lead_nuevo', 0, inicioISO, (notes as any).horas_actividad);
      if (!proxima) continue;

      (notes as any).cadencia = {
        activa: true,
        tipo: 'lead_nuevo',
        paso_actual: 0,
        inicio: inicioISO,
        proxima_accion: proxima
      } as CadenciaState;

      await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
      activadas++;
      console.log(`🎯 Cadencia lead_nuevo activada para ${lead.name}`);
    }

    // ── LEAD FRÍO: contacted/qualified, 7+ días sin respuesta ──
    const hace30d = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: leadsFrios } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, status')
      .in('status', ['contacted', 'qualified'])
      .lt('last_message_at', hace7d.toISOString())
      .gt('last_message_at', hace30d.toISOString())
      .limit(30);

    for (const lead of (leadsFrios || []).slice(0, 10)) {
      const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      if ((notes as any).cadencia?.activa) continue;
      if ((notes as any).do_not_contact || (notes as any).no_contactar) continue;

      const inicioISO = ahora.toISOString();
      const proxima = computeProximaAccion('lead_frio', 0, inicioISO, (notes as any).horas_actividad);
      if (!proxima) continue;

      (notes as any).cadencia = {
        activa: true,
        tipo: 'lead_frio',
        paso_actual: 0,
        inicio: inicioISO,
        proxima_accion: proxima
      } as CadenciaState;

      await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
      activadas++;
      console.log(`🎯 Cadencia lead_frio activada para ${lead.name}`);
    }

    // ── POST VISITA: visited, 3+ días sin decisión ──
    const hace3d = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);

    const { data: leadsPostVisita } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, status')
      .eq('status', 'visited')
      .lt('updated_at', hace3d.toISOString())
      .gt('updated_at', hace30d.toISOString())
      .limit(30);

    for (const lead of (leadsPostVisita || []).slice(0, 10)) {
      const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      if ((notes as any).cadencia?.activa) continue;
      if ((notes as any).do_not_contact || (notes as any).no_contactar) continue;

      const inicioISO = ahora.toISOString();
      const proxima = computeProximaAccion('post_visita', 0, inicioISO, (notes as any).horas_actividad);
      if (!proxima) continue;

      (notes as any).cadencia = {
        activa: true,
        tipo: 'post_visita',
        paso_actual: 0,
        inicio: inicioISO,
        proxima_accion: proxima
      } as CadenciaState;

      await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
      activadas++;
      console.log(`🎯 Cadencia post_visita activada para ${lead.name}`);
    }

    // ── NO SHOW: scheduled con cita pasada no completada ──
    const hace1d = new Date(ahora.getTime() - 1 * 24 * 60 * 60 * 1000);
    const hace14d = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);

    const { data: leadsScheduled } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, status')
      .eq('status', 'scheduled')
      .lt('updated_at', hace1d.toISOString())
      .gt('updated_at', hace14d.toISOString())
      .limit(30);

    for (const lead of (leadsScheduled || []).slice(0, 10)) {
      const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      if ((notes as any).cadencia?.activa) continue;
      if ((notes as any).do_not_contact || (notes as any).no_contactar) continue;
      // Verificar que tiene cita pasada (no futura)
      const { data: citasPasadas } = await supabase.client
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .lt('scheduled_date', ahora.toISOString().split('T')[0])
        .in('status', ['scheduled', 'confirmed', 'no_show'])
        .limit(1);
      if (!citasPasadas || citasPasadas.length === 0) continue;

      const inicioISO = ahora.toISOString();
      const proxima = computeProximaAccion('no_show', 0, inicioISO, (notes as any).horas_actividad);
      if (!proxima) continue;

      (notes as any).cadencia = {
        activa: true, tipo: 'no_show', paso_actual: 0,
        inicio: inicioISO, proxima_accion: proxima
      } as CadenciaState;

      await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
      activadas++;
      console.log(`🎯 Cadencia no_show activada para ${lead.name}`);
    }

    // ── NEGOCIACIÓN ESTANCADA: negotiation, 5+ días sin update ──
    const hace5d = new Date(ahora.getTime() - 5 * 24 * 60 * 60 * 1000);

    const { data: leadsNegociacion } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, status')
      .eq('status', 'negotiation')
      .lt('updated_at', hace5d.toISOString())
      .gt('updated_at', hace30d.toISOString())
      .limit(30);

    for (const lead of (leadsNegociacion || []).slice(0, 10)) {
      const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      if ((notes as any).cadencia?.activa) continue;
      if ((notes as any).do_not_contact || (notes as any).no_contactar) continue;

      const inicioISO = ahora.toISOString();
      const proxima = computeProximaAccion('negociacion_estancada', 0, inicioISO, (notes as any).horas_actividad);
      if (!proxima) continue;

      (notes as any).cadencia = {
        activa: true, tipo: 'negociacion_estancada', paso_actual: 0,
        inicio: inicioISO, proxima_accion: proxima
      } as CadenciaState;

      await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
      activadas++;
      console.log(`🎯 Cadencia negociacion_estancada activada para ${lead.name}`);
    }

    // ── APARTADO SIN CIERRE: reserved, 7+ días sin avance ──
    const { data: leadsApartado } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, status')
      .eq('status', 'reserved')
      .lt('updated_at', hace7d.toISOString())
      .gt('updated_at', hace30d.toISOString())
      .limit(30);

    for (const lead of (leadsApartado || []).slice(0, 10)) {
      const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      if ((notes as any).cadencia?.activa) continue;
      if ((notes as any).do_not_contact || (notes as any).no_contactar) continue;

      const inicioISO = ahora.toISOString();
      const proxima = computeProximaAccion('apartado_sin_cierre', 0, inicioISO, (notes as any).horas_actividad);
      if (!proxima) continue;

      (notes as any).cadencia = {
        activa: true, tipo: 'apartado_sin_cierre', paso_actual: 0,
        inicio: inicioISO, proxima_accion: proxima
      } as CadenciaState;

      await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
      activadas++;
      console.log(`🎯 Cadencia apartado_sin_cierre activada para ${lead.name}`);
    }

    console.log(`🎯 Cadencias activadas: ${activadas} total`);

  } catch (e) {
    console.error('Error en activarCadenciasAutomaticas:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'activarCadenciasAutomaticas', stack: (e as Error).stack }).catch(() => {});
  }
}

/**
 * EJECUTAR CADENCIAS INTELIGENTES
 * Cada 2h en horas pares L-S 8am-8pm MX
 * Ejecuta el paso actual de leads con cadencia activa y proxima_accion <= ahora
 */
export async function ejecutarCadenciasInteligentes(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!(await isCadenciaEnabled(env))) {
      console.log('⏭️ Cadencia inteligente desactivada - feature flag');
      return;
    }

    console.log('🎵 Ejecutando cadencias inteligentes...');

    const ahora = new Date();
    const ahoraISO = ahora.toISOString();

    // Buscar leads con cadencia activa
    const { data: allLeads } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, property_interest, status, last_message_at')
      .not('notes->cadencia', 'is', null);

    if (!allLeads || allLeads.length === 0) {
      console.log('🎵 No hay leads con cadencia activa');
      return;
    }

    // Filtrar: cadencia.activa=true y proxima_accion <= ahora
    const leadsListos = allLeads.filter(lead => {
      const notes = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      const cadencia = (notes as any).cadencia;
      return cadencia && cadencia.activa && cadencia.proxima_accion && cadencia.proxima_accion <= ahoraISO;
    });

    if (leadsListos.length === 0) {
      console.log('🎵 No hay cadencias listas para ejecutar');
      return;
    }

    console.log(`🎵 ${leadsListos.length} leads con cadencia lista`);

    let retellService: any = null;
    const retellConfigured = env.RETELL_API_KEY && env.RETELL_AGENT_ID && env.RETELL_PHONE_NUMBER;
    const retellEnabled = retellConfigured ? await isRetellEnabled(env) : false;

    let ejecutados = 0;

    for (const lead of leadsListos) {
      try {
        if (!lead.phone) continue;

        // Re-leer notes frescas (evitar JSONB stale)
        const { data: freshLead } = await supabase.client
          .from('leads')
          .select('notes')
          .eq('id', lead.id)
          .single();

        if (!freshLead) continue;
        const notes = typeof freshLead.notes === 'object' ? (freshLead.notes || {}) : {};
        const cadencia = (notes as any).cadencia as CadenciaState;
        if (!cadencia || !cadencia.activa) continue;

        const tipo = cadencia.tipo;
        const pasoIdx = cadencia.paso_actual;
        const pasos = CADENCIAS[tipo];

        if (!pasos || pasoIdx >= pasos.length) {
          // Cadencia completada
          (notes as any).cadencia = {
            ...cadencia,
            activa: false,
            motivo_fin: 'completada'
          };
          await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
          console.log(`✅ Cadencia ${tipo} completada para ${lead.name}`);

          // Notificar vendedor
          if (lead.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members').select('*').eq('id', lead.assigned_to).single();
            if (vendedor) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `📋 *CADENCIA COMPLETADA*\n\n` +
                `Lead: *${lead.name}*\n` +
                `Tipo: ${tipo}\n` +
                `Pasos ejecutados: ${pasos.length}\n\n` +
                `_El lead no respondió a la cadencia automática. Considera contactar manualmente._`,
                { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
              );
            }
          }
          continue;
        }

        const paso = pasos[pasoIdx];

        // Mark-before-send: avanzar paso_actual ANTES de ejecutar
        const nextPasoIdx = pasoIdx + 1;
        const horasActividad = (notes as any).horas_actividad as number[] | undefined;
        const proximaAccion = computeProximaAccion(tipo, nextPasoIdx, cadencia.inicio, horasActividad);

        (notes as any).cadencia = {
          ...cadencia,
          paso_actual: nextPasoIdx,
          proxima_accion: proximaAccion || ahoraISO, // si null, se desactivará en próximo ciclo
          activa: nextPasoIdx < pasos.length
        };
        if (nextPasoIdx >= pasos.length) {
          (notes as any).cadencia.motivo_fin = 'completada';
        }

        await supabase.client.from('leads').update({ notes }).eq('id', lead.id);

        // Ejecutar acción
        if (paso.accion === 'whatsapp') {
          // Verificar límite de mensajes automáticos
          if (!(await puedeEnviarMensajeAutomatico(supabase, lead.id))) {
            console.log(`⏭️ ${lead.name} alcanzó límite de mensajes automáticos`);
            continue;
          }

          const mensaje = paso.plantilla.replace(/\{nombre\}/g, lead.name?.split(' ')[0] || 'Hola');
          const resultado = await enviarMensajeLead(supabase, meta, {
            id: lead.id, phone: lead.phone, name: lead.name, notes, last_message_at: lead.last_message_at
          }, mensaje, {
            pendingContext: { tipo: `cadencia_${tipo}`, paso: pasoIdx + 1, context: paso.plantilla.substring(0, 100) }
          });

          if (resultado.method === 'skipped') continue;
          await registrarMensajeAutomatico(supabase, lead.id);

          ejecutados++;
          console.log(`🎵 Cadencia ${tipo} paso ${pasoIdx + 1}: WhatsApp a ${lead.name} (method: ${resultado.method})`);

        } else if (paso.accion === 'llamada') {
          if (!retellEnabled || !retellConfigured) {
            console.log(`⏭️ Paso llamada skip para ${lead.name} - Retell no disponible`);
            continue;
          }

          if (!retellService) {
            const { createRetellService } = await import('../services/retellService');
            retellService = createRetellService(
              env.RETELL_API_KEY!,
              env.RETELL_AGENT_ID!,
              env.RETELL_PHONE_NUMBER!
            );
          }

          const desarrolloInteres = lead.property_interest || (notes as any).desarrollo_interes || '';
          const result = await retellService.initiateCall({
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            vendorId: lead.assigned_to,
            desarrolloInteres,
            motivo: paso.motivo || 'seguimiento',
            kvCache: env.SARA_CACHE
          });

          if (result.success) {
            ejecutados++;
            console.log(`🎵 Cadencia ${tipo} paso ${pasoIdx + 1}: Llamada a ${lead.name}`);
          } else {
            console.log(`⚠️ Cadencia llamada falló para ${lead.name}: ${result.error}`);
          }
        }

        // Notificar vendedor del paso
        if (lead.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members').select('*').eq('id', lead.assigned_to).single();
          if (vendedor) {
            const accionStr = paso.accion === 'whatsapp' ? '💬 WhatsApp' : '📞 Llamada IA';
            await enviarMensajeTeamMember(supabase, meta, vendedor,
              `🎵 *CADENCIA ${tipo.toUpperCase()}* (${pasoIdx + 1}/${pasos.length})\n\n` +
              `Lead: *${lead.name}*\n` +
              `Acción: ${accionStr}\n` +
              `${paso.accion === 'llamada' ? `Motivo: ${paso.motivo}\n` : ''}` +
              `${nextPasoIdx < pasos.length ? `Próximo paso: día ${pasos[nextPasoIdx].dia}` : '✅ Último paso'}`,
              { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
            );
          }
        }

        await new Promise(r => setTimeout(r, 3000));

      } catch (err) {
        console.error(`Error ejecutando cadencia para ${lead.name}:`, err);
      }
    }

    console.log(`🎵 Cadencias ejecutadas: ${ejecutados}`);

  } catch (e) {
    console.error('Error en ejecutarCadenciasInteligentes:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'ejecutarCadenciasInteligentes', stack: (e as Error).stack }).catch(() => {});
  }
}
