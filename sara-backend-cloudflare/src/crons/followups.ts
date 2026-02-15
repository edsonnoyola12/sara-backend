/**
 * Follow-up and Nurturing CRON Functions
 * Extracted from index.ts - Phase 3 refactoring
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { BroadcastQueueService } from '../services/broadcastQueueService';
import { logEvento } from './briefings';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { safeJsonParse } from '../utils/safeHelpers';

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
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGUIMIENTO DE HIPOTECAS - Notifica asesores sobre hipotecas estancadas
// ═══════════════════════════════════════════════════════════════════════════
export async function seguimientoHipotecas(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);

    // Hipotecas en banco sin actualización en 7+ días
    const { data: hipotecasEstancadas } = await supabase.client
      .from('mortgage_applications')
      .select('*, leads(name, phone), team_members!mortgage_applications_assigned_advisor_id_fkey(name, phone)')
      .eq('status', 'sent_to_bank')
      .lt('updated_at', hace7dias.toISOString());

    if (!hipotecasEstancadas || hipotecasEstancadas.length === 0) {
      console.log('✅ No hay hipotecas estancadas');
      return;
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

      // Notificar al vendedor original (si existe en notes del lead)
      try {
        const { data: leadFull } = await supabase.client
          .from('leads').select('notes').eq('id', hip.lead_id).single();
        const notas = safeJsonParse(leadFull?.notes);
        const vendedorOrigId = notas.vendedor_original_id;
        if (vendedorOrigId && vendedorOrigId !== asesor.id) {
          const { data: vendedorOrig } = await supabase.client
            .from('team_members').select('*').eq('id', vendedorOrigId).single();
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

      // Obtener leads del segmento
      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, lead_score, score, status, property_interest');

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
          await meta.sendWhatsAppMessage(phone, mensaje);

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
    const vendedorMap = new Map((vendedores || []).map(v => [v.id, v.name]));

    // ═══════════════════════════════════════════════════════════════════
    // 1. LEADS NUEVOS SIN CONTACTAR (+24h)
    // ═══════════════════════════════════════════════════════════════════
    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, created_at')
      .eq('status', 'new')
      .lt('created_at', hace24h)
      .order('created_at', { ascending: true });

    // ═══════════════════════════════════════════════════════════════════
    // 2. CITAS DE HOY SIN CONFIRMAR
    // ═══════════════════════════════════════════════════════════════════
    const { data: citasSinConfirmar } = await supabase.client
      .from('appointments')
      .select('id, lead_name, scheduled_time, vendedor_id, status')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled');

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
      .order('scheduled_for', { ascending: true });

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
    const vendedorMap = new Map((vendedores || []).map(v => [v.id, v.name]));

    // 1. LEADS NUEVOS SIN CONTACTAR (+24h)
    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, created_at')
      .eq('status', 'new')
      .lt('created_at', hace24h)
      .order('created_at', { ascending: true });

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
      .order('updated_at', { ascending: true });

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
        const interes = lead.notes?.interested_in ? `\n   Interés: ${lead.notes.interested_in}` : '';
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

        // Marcar que ya se alertó hoy para estos leads
        const hoyStr = ahora.toISOString().split('T')[0];
        for (const lead of leadsVendedor) {
          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...lead.notes,
                reengagement_alert_sent: hoyStr
              }
            })
            .eq('id', lead.id);
        }

      } catch (err) {
        console.error(`   ❌ Error alertando a ${vendedor.name}:`, err);
      }
    }

    console.log(`🔄 Re-engagement completado`);

  } catch (e) {
    console.error('Error en verificarReengagement:', e);
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
                  `📱 ${lead.phone}\n` +
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
      .select('id, name, phone, notes, updated_at, assigned_to')
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
    const vendedorMap = new Map((vendedores || []).map(v => [v.id, v]));

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

      // Enviar mensaje si corresponde
      if (mensaje) {
        try {
          await meta.sendWhatsAppMessage(cliente.phone, mensaje);
          console.log(`   ✅ Post-venta etapa ${etapaNueva} enviado a ${cliente.name || cliente.phone}`);

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

          // Notificar al vendedor cuando se piden referidos
          if (notificarVendedor) {
            const vendedor = vendedorMap.get(cliente.assigned_to);
            if (vendedor?.phone) {
              const notif = `🎯 *Oportunidad de referidos*\n\n`;
              const notifMsg = notif + `Se envió mensaje pidiendo referidos a *${cliente.name}*.\n\nSi responde con contactos, dale seguimiento rápido.`;
              await meta.sendWhatsAppMessage(vendedor.phone, notifMsg);
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
      .select('id, name, phone, birthday, notes, assigned_to')
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
        // Intentar usar template feliz_cumple
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto }
            ]
          }
        ];

        await meta.sendTemplate(lead.phone, 'feliz_cumple', 'es_MX', templateComponents);
        console.log(`🎂 Felicitación (template) enviada a ${lead.name}`);

        // Marcar como felicitado
        const notasActuales = lead.notes || {};
        const nuevasNotas = typeof notasActuales === 'object'
          ? { ...notasActuales, [`cumple_felicitado_${añoActual}`]: true }
          : { [`cumple_felicitado_${añoActual}`]: true };

        await supabase.client
          .from('leads')
          .update({ notes: nuevasNotas })
          .eq('id', lead.id);

        enviados++;

      } catch (templateErr) {
        console.error(`⚠️ Template feliz_cumple no disponible para ${lead.name}, usando fallback...`);

        // Fallback: mensaje regular (solo si estamos dentro de 24hrs)
        try {
          const mensajeFallback = `🎂 ¡Feliz cumpleaños ${nombreCorto}! 🎉\n\n` +
            `Todo el equipo te desea un día increíble.\n\n` +
            `Gracias por ser parte de nuestra familia. 🏠💙`;

          await meta.sendWhatsAppMessage(lead.phone, mensajeFallback);
          console.log(`🎂 Felicitación (fallback) enviada a ${lead.name}`);

          // Marcar como felicitado
          const notasActuales = lead.notes || {};
          const nuevasNotas = typeof notasActuales === 'object'
            ? { ...notasActuales, [`cumple_felicitado_${añoActual}`]: true }
            : { [`cumple_felicitado_${añoActual}`]: true };

          await supabase.client
            .from('leads')
            .update({ notes: nuevasNotas })
            .eq('id', lead.id);

          enviados++;
        } catch (fallbackErr) {
          console.error(`❌ No se pudo enviar felicitación a ${lead.name}:`, fallbackErr);
        }
      }
    }

    // También felicitar al equipo
    await felicitarEquipoCumple(supabase, meta, fechaHoy, añoActual);

    console.log(`🎂 Felicitaciones completadas: ${enviados} leads felicitados`);

  } catch (e) {
    console.error('Error en enviarFelicitacionesCumple:', e);
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
      .select('id, name, phone, notes, property_interest, updated_at, needs_mortgage')
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
        .single();

      // Si ya tiene solicitud activa, no enviar
      if (solicitud) {
        continue;
      }

      const nombreCorto = lead.name?.split(' ')[0] || '';
      const desarrollo = lead.property_interest || 'tu casa ideal';

      try {
        // Usar template info_credito
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto },
              { type: 'text', text: desarrollo }
            ]
          }
        ];

        await meta.sendTemplate(lead.phone, 'info_credito', 'es_MX', templateComponents);
        console.log(`🏦 Seguimiento crédito (template) enviado a ${lead.name}`);

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
          notes: 'Template info_credito enviado automáticamente',
          created_at: ahora.toISOString()
        }]);

        enviados++;

      } catch (templateErr) {
        console.error(`⚠️ Template info_credito no disponible para ${lead.name}, usando fallback...`);

        // Fallback: mensaje regular (solo funcionará si hay ventana de 24hrs abierta)
        try {
          const mensajeFallback = `🏦 ¡Hola ${nombreCorto}!\n\n` +
            `Te comparto información sobre crédito hipotecario para *${desarrollo}*:\n\n` +
            `✅ Hasta 20 años de plazo\n` +
            `✅ Tasa competitiva\n` +
            `✅ Varios bancos disponibles\n\n` +
            `¿Te gustaría que un asesor te contacte? Responde *Sí*.`;

          await meta.sendWhatsAppMessage(lead.phone, mensajeFallback);
          console.log(`🏦 Seguimiento crédito (fallback) enviado a ${lead.name}`);

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

          enviados++;
        } catch (fallbackErr) {
          console.error(`❌ No se pudo enviar seguimiento crédito a ${lead.name}:`, fallbackErr);
        }
      }
    }

    console.log(`🏦 Seguimiento crédito completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en seguimientoCredito:', e);
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
        console.log('🛑 BROADCASTS DESHABILITADOS - Kill switch activo (config:', config?.value, 'error:', !!error, ')');
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

        // Notificar al vendedor con preview del mensaje
        if (vendedor?.phone) {
          const vendedorPhone = vendedor.phone.replace(/\D/g, '');
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

          await meta.sendWhatsAppMessage(vendedorPhone, notificacion);
          console.log(`📤 Follow-up pendiente creado para ${lead.name}, vendedor ${vendedor.name} notificado`);
        } else {
          // Sin vendedor asignado, enviar directo
          await meta.sendWhatsAppMessage(phoneLimpio, mensaje);
          await registrarMensajeAutomatico(supabase, lead.id);
          console.log(`⏰ Follow-up 24h enviado directo a ${lead.name} (sin vendedor asignado)`);
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
      .select('id, name, phone, notes, property_interest, credit_status, team_members:assigned_to(name, phone)')
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
        await meta.sendWhatsAppMessage(phoneLimpio, mensaje);

        // Actualizar notas
        const notasActualizadas = {
          ...notas,
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

        // Notificar al vendedor
        const vendedor = lead.team_members as any;
        if (vendedor?.phone) {
          const vendedorPhone = vendedor.phone.replace(/\D/g, '');
          await meta.sendWhatsAppMessage(vendedorPhone,
            `📋 *Lead pendiente de documentos*\n\n` +
            `${lead.name} lleva 3+ días sin enviar docs.\n` +
            `Le envié un recordatorio automático.\n\n` +
            `💡 Quizás una llamada ayude a destrabarlo.`
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
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LLAMADAS AUTOMÁTICAS DE SEGUIMIENTO (Retell.ai)
// ═══════════════════════════════════════════════════════════════════════════

interface RetellEnv {
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;
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

    console.log('📞 Iniciando llamadas de seguimiento post-visita...');

    const ahora = new Date();
    const hace1Dia = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const hace2Dias = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);

    const { data: leadsPostVisita } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, interested_in')
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
        const ultimaLlamadaIA = (notes as any).ultima_llamada_ia;
        const hoyStr = ahora.toISOString().split('T')[0];

        if (ultimaLlamadaIA === hoyStr) {
          console.log(`⏭️ ${lead.name} ya recibió llamada IA hoy`);
          continue;
        }

        if (!lead.phone) continue;

        const desarrolloInteres = lead.interested_in || (notes as any).desarrollo_interes || '';

        const result = await retell.initiateCall({
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          vendorId: lead.assigned_to,
          desarrolloInteres: desarrolloInteres,
          motivo: 'seguimiento'
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
              .select('phone, name')
              .eq('id', lead.assigned_to)
              .single();

            if (vendedor?.phone) {
              await meta.sendWhatsAppMessage(vendedor.phone,
                `📞 *LLAMADA IA POST-VISITA*\n\n` +
                `SARA está llamando a *${lead.name}*\n` +
                `Desarrollo: ${desarrolloInteres || 'General'}\n\n` +
                `Te notifico cuando termine.`
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

    console.log('📞 Iniciando llamadas reactivación leads fríos...');

    const ahora = new Date();
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: leadsFrios } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, interested_in')
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
          desarrolloInteres: lead.interested_in || (notes as any).desarrollo_interes || '',
          motivo: 'seguimiento'
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

          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error(`Error en llamada a ${lead.name}:`, err);
      }
    }

    console.log(`📞 Llamadas reactivación: ${llamadasRealizadas} realizadas`);

  } catch (e) {
    console.error('Error en llamadasReactivacionLeadsFrios:', e);
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
          notas: `Cita mañana a las ${cita.scheduled_time}`
        });

        if (result.success) {
          llamadasRealizadas++;
          console.log(`📞 Llamada recordatorio a ${cita.lead_name}`);
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error(`Error en llamada recordatorio a ${cita.lead_name}:`, err);
      }
    }

    console.log(`📞 Llamadas recordatorio: ${llamadasRealizadas} realizadas`);

  } catch (e) {
    console.error('Error en llamadasRecordatorioCita:', e);
  }
}
