/**
 * CRON - Funciones de Reportes Automáticos
 * 
 * Incluye reportes para:
 * - CEO/Admin (diario, semanal, mensual)
 * - Vendedores (diario, semanal, mensual)
 * - Asesores (diario, semanal, mensual)
 * - Marketing (diario, semanal, mensual)
 * - Encuestas post-cita y NPS
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { enviarMensajeTeamMember, EnviarMensajeTeamResult } from '../utils/teamMessaging';
import { parseNotasSafe, formatVendorFeedback } from '../handlers/whatsapp-utils';
import { logErrorToDB, enviarAlertaSistema } from './healthCheck';

// ═══════════════════════════════════════════════════════════════
// REPORTES CEO AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════════

// Función consolidada que combina reporte diario + briefing supervisión en 1 solo mensaje
export async function enviarReporteDiarioConsolidadoCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  // Antes se enviaban 2 mensajes separados (briefing supervisión + reporte diario)
  // Ahora se envía 1 solo mensaje con toda la información importante
  await enviarReporteDiarioCEO(supabase, meta);
  // El briefing de supervisión ya no se envía por separado - su info está en el reporte diario
  console.log('📊 Reporte consolidado CEO enviado (1 mensaje en vez de 2)');
}

export async function enviarReporteDiarioCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  // Obtener CEOs/Admins
  const { data: admins } = await supabase.client
    .from('team_members')
    .select('*')
    .in('role', ['admin', 'coordinador'])
    .eq('active', true);

  if (!admins || admins.length === 0) return;

  // Datos del día
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const fechaFormato = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;

  // Ayer
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

  // Mismo día semana pasada (para comparar)
  const semPasada = new Date(hoy);
  semPasada.setDate(semPasada.getDate() - 7);
  const inicioSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate()).toISOString();
  const finSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate() + 1).toISOString();

  // === QUERIES (parallelized with Promise.all) ===
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

  const [
    { data: leadsAyer },
    { data: leadsSemPasada },
    { data: cierresAyer },
    { data: cierresSemPasada },
    { data: citasAyer },
    { data: citasHoy },
    { data: pipelineDiario },
    { data: estancados },
    { data: perdidosAyer },
    { data: vendedoresDiario },
    { data: cierresMes },
    { data: leadsMes },
    { data: followupsAyer }
  ] = await Promise.all([
    supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioAyer).lt('created_at', inicioHoy),
    supabase.client.from('leads').select('id').gte('created_at', inicioSemPasada).lt('created_at', finSemPasada),
    supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy),
    supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemPasada).lt('status_changed_at', finSemPasada),
    supabase.client.from('appointments').select('*').eq('scheduled_date', ayer.toISOString().split('T')[0]),
    supabase.client.from('appointments').select('*, team_members(name), leads(name, phone)').eq('scheduled_date', hoy.toISOString().split('T')[0]).eq('status', 'scheduled'),
    supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']),
    supabase.client.from('leads').select('id').eq('status', 'new').lt('created_at', inicioAyer),
    supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy),
    supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true),
    supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes),
    supabase.client.from('leads').select('id').gte('created_at', inicioMes),
    supabase.client.from('followup_approvals').select('status').gte('created_at', inicioAyer).lt('created_at', inicioHoy)
  ]);

  // === CÁLCULOS ===
  let revenueAyer = 0, pipelineValueDiario = 0;
  cierresAyer?.forEach(c => revenueAyer += c.properties?.price || 2000000);
  pipelineDiario?.forEach(p => pipelineValueDiario += p.properties?.price || 2000000);

  const leadsAyerCount = leadsAyer?.length || 0;
  const leadsSemPasadaCount = leadsSemPasada?.length || 0;
  const cierresAyerCount = cierresAyer?.length || 0;
  const cierresSemPasadaCount = cierresSemPasada?.length || 0;

  const calcVarDiario = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

  // Citas ayer stats
  const citasAyerCompletadas = citasAyer?.filter(c => c.status === 'completed').length || 0;
  const citasAyerTotal = citasAyer?.length || 0;
  const showRateAyer = citasAyerTotal > 0 ? Math.round((citasAyerCompletadas / citasAyerTotal) * 100) : 0;

  // Pipeline por etapa
  const negociacionDiario = pipelineDiario?.filter(p => p.status === 'negotiation').length || 0;
  const reservadosDiario = pipelineDiario?.filter(p => p.status === 'reserved').length || 0;

  // Cálculos proyección
  let revenueMes = 0;
  cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
  const cierresMesCount = cierresMes?.length || 0;
  const leadsMesCount = leadsMes?.length || 0;
  const diaActual = hoy.getDate();
  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasRestantes = diasEnMes - diaActual;
  const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
  const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

  // Rendimiento vendedores ayer
  const rendimientoAyer: string[] = [];
  vendedoresDiario?.forEach(v => {
    const leadsV = leadsAyer?.filter(l => l.assigned_to === v.id).length || 0;
    const cierresV = cierresAyer?.filter(c => c.assigned_to === v.id).length || 0;
    if (leadsV > 0 || cierresV > 0) {
      rendimientoAyer.push(`• ${v.name?.split(' ')[0] || 'V'}: ${cierresV}c/${leadsV}L`);
    }
  });

  // Citas de hoy detalle
  const citasHoyDetalle: string[] = [];
  citasHoy?.slice(0, 5).forEach(c => {
    const hora = c.scheduled_time || '00:00';
    const vendedor = c.team_members?.name?.split(' ')[0] || 'Sin asignar';
    const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
    citasHoyDetalle.push(`• ${hora} - ${cliente} (${vendedor})`);
  });

  // Follow-ups stats
  const followupsEnviadosAyer = followupsAyer?.filter(f => f.status === 'sent').length || 0;
  const followupsPendientesAyer = followupsAyer?.filter(f => f.status === 'pending').length || 0;

  // Alertas
  const alertasDiarias: string[] = [];
  if (estancados && estancados.length > 0) alertasDiarias.push(`• ${estancados.length} leads sin contactar >24h`);
  if (perdidosAyer && perdidosAyer.length > 0) alertasDiarias.push(`• ${perdidosAyer.length} leads perdidos ayer`);
  if (followupsPendientesAyer > 0) alertasDiarias.push(`• ${followupsPendientesAyer} follow-ups sin aprobar`);

  // === CONSTRUIR MENSAJE ===
  const msg = `☀️ *BUENOS DÍAS CEO*
_${fechaFormato}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE AYER*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsAyerCount}* ${calcVarDiario(leadsAyerCount, leadsSemPasadaCount)}
• Cierres: *${cierresAyerCount}* ${calcVarDiario(cierresAyerCount, cierresSemPasadaCount)}
• Revenue: *$${(revenueAyer/1000000).toFixed(1)}M*
• Citas: ${citasAyerCompletadas}/${citasAyerTotal} (${showRateAyer}% show)
${followupsEnviadosAyer > 0 ? `• Follow-ups enviados: *${followupsEnviadosAyer}*` : ''}

━━━━━━━━━━━━━━━━━━━━━
📅 *AGENDA DE HOY*
━━━━━━━━━━━━━━━━━━━━━
${citasHoy && citasHoy.length > 0 ? `*${citasHoy.length} citas agendadas:*\n${citasHoyDetalle.join('\n')}${citasHoy.length > 5 ? '\n_...y ' + (citasHoy.length - 5) + ' más_' : ''}` : '• Sin citas agendadas'}

━━━━━━━━━━━━━━━━━━━━━
🔥 *PIPELINE HOT*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValueDiario/1000000).toFixed(1)}M*
• En negociación: ${negociacionDiario}
• Reservados: ${reservadosDiario}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*
• Leads mes: ${leadsMesCount}
• Días restantes: ${diasRestantes}
${alertasDiarias.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ *ALERTAS*\n━━━━━━━━━━━━━━━━━━━━━\n${alertasDiarias.join('\n')}` : ''}
${rendimientoAyer.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n👥 *EQUIPO AYER*\n━━━━━━━━━━━━━━━━━━━━━\n${rendimientoAyer.slice(0, 5).join('\n')}` : ''}
${(() => {
    const fbEntries: string[] = [];
    pipelineDiario?.forEach((p: any) => {
      const fb = formatVendorFeedback(p.notes, { compact: true });
      if (fb) fbEntries.push(`• ${p.name?.split(' ')[0] || 'Lead'} ${fb}`);
    });
    return fbEntries.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n📝 *FEEDBACK POST-VISITA*\n━━━━━━━━━━━━━━━━━━━━━\n${fbEntries.slice(0, 5).join('\n')}` : '';
  })()}
_Escribe *resumen* para más detalles_`;

  // Enviar a cada admin (evitar duplicados por teléfono) - EN PARALELO
  const telefonosEnviados = new Set<string>();
  const adminsUnicos = admins.filter(admin => {
    if (!admin.phone) return false;
    const tel = admin.phone.replace(/\D/g, '');
    if (telefonosEnviados.has(tel)) return false;
    telefonosEnviados.add(tel);
    return true;
  });

  await Promise.allSettled(adminsUnicos.map(async (admin) => {
    try {
      await enviarMensajeTeamMember(supabase, meta, admin, msg, {
        tipoMensaje: 'reporte_diario',
        pendingKey: 'pending_reporte_diario'
      });
      console.log(`📊 Reporte diario enviado a ${admin.name}`);
    } catch (e) {
      console.log(`Error enviando reporte a ${admin.name}:`, e);
    }
  }));
}

export async function enviarReporteSemanalCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  const { data: admins } = await supabase.client
    .from('team_members')
    .select('*')
    .in('role', ['admin', 'coordinador'])
    .eq('active', true);

  if (!admins || admins.length === 0) return;

  const hoy = new Date();
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - 7);
  const inicioSemanaAnterior = new Date(inicioSemana);
  inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() - 7);

  // Queries (parallelized with Promise.all)
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

  const [
    { data: leadsSemana },
    { data: cierresSemana },
    { data: citasSemana },
    { data: leadsSemanaAnt },
    { data: cierresSemanaAnt },
    { data: perdidosSemana },
    { data: pipeline },
    { data: vendedores },
    { data: cierresMes },
    { data: leadsMes }
  ] = await Promise.all([
    supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioSemana.toISOString()),
    supabase.client.from('leads').select('*, properties(price), team_members:assigned_to(name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString()),
    supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]),
    supabase.client.from('leads').select('id').gte('created_at', inicioSemanaAnterior.toISOString()).lt('created_at', inicioSemana.toISOString()),
    supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemanaAnterior.toISOString()).lt('status_changed_at', inicioSemana.toISOString()),
    supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioSemana.toISOString()),
    supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']),
    supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true),
    supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes),
    supabase.client.from('leads').select('id').gte('created_at', inicioMes)
  ]);

  // Cálculos básicos
  let revenue = 0, revenueAnt = 0, pipelineValue = 0, revenueMes = 0;
  cierresSemana?.forEach(c => revenue += c.properties?.price || 2000000);
  cierresSemanaAnt?.forEach(c => revenueAnt += (c as any).properties?.price || 2000000);
  pipeline?.forEach(p => pipelineValue += p.properties?.price || 2000000);
  cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);

  const leadsActual = leadsSemana?.length || 0;
  const leadsAnterior = leadsSemanaAnt?.length || 0;
  const cierresActual = cierresSemana?.length || 0;
  const cierresAnterior = cierresSemanaAnt?.length || 0;
  const perdidosCount = perdidosSemana?.length || 0;

  // Citas stats
  const citasTotal = citasSemana?.length || 0;
  const citasCompletadas = citasSemana?.filter(c => c.status === 'completed').length || 0;
  const citasCanceladas = citasSemana?.filter(c => c.status === 'cancelled').length || 0;
  const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;

  // Conversión y métricas
  const conversionRate = leadsActual > 0 ? Math.round(cierresActual / leadsActual * 100) : 0;

  // Tiempo de respuesta promedio
  let tiempoRespuesta = 0, leadsConResp = 0;
  leadsSemana?.forEach(l => {
    if (l.first_contact_at && l.created_at) {
      const diff = (new Date(l.first_contact_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60);
      if (diff > 0 && diff < 24 * 60) { tiempoRespuesta += diff; leadsConResp++; }
    }
  });
  const tiempoRespProm = leadsConResp > 0 ? Math.round(tiempoRespuesta / leadsConResp) : 0;

  // Proyección
  const diaActual = hoy.getDate();
  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const cierresMesCount = cierresMes?.length || 0;
  const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
  const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

  const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

  // Top fuentes
  const fuenteCount: Record<string, number> = {};
  leadsSemana?.forEach(l => { const f = l.source || 'Otro'; fuenteCount[f] = (fuenteCount[f] || 0) + 1; });
  const topFuentes = Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Razones de pérdida
  const razonesCount: Record<string, number> = {};
  perdidosSemana?.forEach(l => { const r = l.lost_reason || 'Sin especificar'; razonesCount[r] = (razonesCount[r] || 0) + 1; });
  const topRazones = Object.entries(razonesCount).sort((a, b) => b[1] - a[1]).slice(0, 2);

  // Rendimiento vendedores
  const rendimiento: { nombre: string; cierres: number; citas: number; leads: number; revenue: number }[] = [];
  vendedores?.forEach(v => {
    const l = leadsSemana?.filter(x => x.assigned_to === v.id).length || 0;
    const c = cierresSemana?.filter(x => x.assigned_to === v.id).length || 0;
    let rev = 0;
    cierresSemana?.filter(x => x.assigned_to === v.id).forEach(x => rev += x.properties?.price || 2000000);
    const ci = citasSemana?.filter(x => x.team_member_id === v.id && x.status === 'completed').length || 0;
    if (l > 0 || c > 0) rendimiento.push({ nombre: v.name?.split(' ')[0] || 'V', cierres: c, citas: ci, leads: l, revenue: rev });
  });
  rendimiento.sort((a, b) => b.cierres - a.cierres || b.revenue - a.revenue);

  // Insights
  const insights: string[] = [];
  if (tiempoRespProm > 0 && tiempoRespProm <= 30) insights.push('✅ Tiempo respuesta excelente');
  else if (tiempoRespProm > 120) insights.push('⚠️ Mejorar tiempo de respuesta');
  if (leadsActual > leadsAnterior * 1.2) insights.push('📈 Semana fuerte en leads (+20%)');
  if (cierresActual > cierresAnterior) insights.push('🎯 Cierres arriba vs semana pasada');
  if (showRate >= 70) insights.push('✅ Buen show rate de citas');
  else if (showRate < 50 && citasTotal > 0) insights.push('⚠️ Show rate bajo, revisar confirmaciones');
  if (insights.length === 0) insights.push('📊 Semana estable');

  const msg = `📈 *REPORTE SEMANAL CEO*
_${inicioSemana.getDate()}/${inicioSemana.getMonth()+1} - ${hoy.getDate()}/${hoy.getMonth()+1} ${meses[hoy.getMonth()]}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE LA SEMANA*
━━━━━━━━━━━━━━━━━━━━━
• Leads: *${leadsActual}* ${calcVar(leadsActual, leadsAnterior)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresAnterior)}
• Revenue: *$${(revenue/1000000).toFixed(1)}M* ${calcVar(revenue, revenueAnt)}
• Perdidos: ${perdidosCount}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Completadas: ${citasCompletadas}/${citasTotal} (*${showRate}%* show)
• Canceladas: ${citasCanceladas}
• Conversión cita→cierre: *${citasCompletadas > 0 ? Math.round(cierresActual/citasCompletadas*100) : 0}%*

━━━━━━━━━━━━━━━━━━━━━
💰 *PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• En negociación: ${pipeline?.filter(p => p.status === 'negotiation').length || 0}
• Reservados: ${pipeline?.filter(p => p.status === 'reserved').length || 0}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*

━━━━━━━━━━━━━━━━━━━━━
⏱️ *VELOCIDAD*
━━━━━━━━━━━━━━━━━━━━━
• Tiempo respuesta: *${tiempoRespProm > 60 ? Math.round(tiempoRespProm/60) + 'h' : tiempoRespProm + 'min'}* ${tiempoRespProm > 0 && tiempoRespProm <= 30 ? '✅' : tiempoRespProm > 120 ? '⚠️' : ''}
• Conversión: *${conversionRate}%*

━━━━━━━━━━━━━━━━━━━━━
👥 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendimiento.slice(0,5).map((v, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${v.nombre}: ${v.cierres}c $${(v.revenue/1000000).toFixed(1)}M`).join('\n') || '• Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📣 *TOP FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${topFuentes.map(f => `• ${f[0]}: ${f[1]} leads`).join('\n') || '• Sin datos'}
${perdidosCount > 0 && topRazones.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n❌ *RAZONES PÉRDIDA*\n━━━━━━━━━━━━━━━━━━━━━\n${topRazones.map(r => `• ${r[0]}: ${r[1]}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insights.join('\n')}

_Escribe *resumen* para más detalles_`;

  // Enviar a cada admin - EN PARALELO
  const telefonosEnviados = new Set<string>();
  const adminsUnicos = admins.filter(admin => {
    if (!admin.phone) return false;
    const tel = admin.phone.replace(/\D/g, '');
    if (telefonosEnviados.has(tel)) return false;
    telefonosEnviados.add(tel);
    return true;
  });

  await Promise.allSettled(adminsUnicos.map(async (admin) => {
    try {
      await enviarMensajeTeamMember(supabase, meta, admin, msg, {
        tipoMensaje: 'resumen_semanal',
        pendingKey: 'pending_resumen_semanal'
      });
      console.log(`📈 Reporte semanal enviado a ${admin.name}`);
    } catch (e) {
      console.log(`Error enviando reporte semanal a ${admin.name}:`, e);
    }
  }));
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL CEO - Día 1 de cada mes 8am
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteMensualCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .in('role', ['admin', 'coordinador'])
      .eq('active', true);

    if (!admins || admins.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    // Mes pasado (el que reportamos)
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;

    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);

    // Mes anterior al reporte (para comparar MoM)
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);

    // Mismo mes año anterior (para comparar YoY)
    const inicioMesYoY = new Date(anioReporte - 1, mesReporte, 1);
    const finMesYoY = new Date(anioReporte - 1, mesReporte + 1, 0, 23, 59, 59);

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    // ═══ DATOS DEL MES REPORTADO (parallelized with Promise.all) ═══

    const [
      { data: leadsMes },
      { data: leadsMesAnterior },
      { data: leadsYoY },
      { data: cierresMes },
      { data: cierresMesAnterior },
      { data: cierresYoY },
      { data: pipeline },
      { data: leadsPerdidos },
      { data: citasMes },
      { data: vendedores }
    ] = await Promise.all([
      // Leads del mes
      supabase.client.from('leads').select('*, team_members:assigned_to(name)')
        .gte('created_at', inicioMesReporte.toISOString())
        .lte('created_at', finMesReporte.toISOString()),
      // Leads mes anterior (MoM)
      supabase.client.from('leads').select('id')
        .gte('created_at', inicioMesAnterior.toISOString())
        .lte('created_at', finMesAnterior.toISOString()),
      // Leads YoY (mismo mes año anterior)
      supabase.client.from('leads').select('id')
        .gte('created_at', inicioMesYoY.toISOString())
        .lte('created_at', finMesYoY.toISOString()),
      // Cierres del mes
      supabase.client.from('leads').select('*, properties(price, name), team_members:assigned_to(name)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioMesReporte.toISOString())
        .lte('status_changed_at', finMesReporte.toISOString()),
      // Cierres mes anterior (MoM)
      supabase.client.from('leads').select('id, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioMesAnterior.toISOString())
        .lte('status_changed_at', finMesAnterior.toISOString()),
      // Cierres YoY
      supabase.client.from('leads').select('id, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioMesYoY.toISOString())
        .lte('status_changed_at', finMesYoY.toISOString()),
      // Pipeline actual (forecast)
      supabase.client.from('leads').select('*, properties(price)')
        .in('status', ['negotiation', 'reserved', 'scheduled', 'visited']),
      // Leads perdidos
      supabase.client.from('leads').select('id, lost_reason')
        .eq('status', 'lost')
        .gte('status_changed_at', inicioMesReporte.toISOString())
        .lte('status_changed_at', finMesReporte.toISOString()),
      // Citas del mes
      supabase.client.from('appointments').select('*')
        .gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0])
        .lte('scheduled_date', finMesReporte.toISOString().split('T')[0]),
      // Vendedores con stats
      supabase.client.from('team_members').select('*')
        .eq('role', 'vendedor').eq('active', true)
        .order('sales_count', { ascending: false })
    ]);

    // ═══ CÁLCULOS ═══

    // Revenue
    let revenueMes = 0;
    for (const c of cierresMes || []) {
      revenueMes += c.properties?.price || 2000000;
    }

    let revenueMesAnterior = 0;
    for (const c of cierresMesAnterior || []) {
      revenueMesAnterior += c.properties?.price || 2000000;
    }

    // YoY Revenue
    let revenueYoY = 0;
    for (const c of cierresYoY || []) {
      revenueYoY += c.properties?.price || 2000000;
    }

    // Pipeline value
    let pipelineValue = 0;
    for (const p of pipeline || []) {
      pipelineValue += p.properties?.price || 2000000;
    }

    // Variaciones
    const leadsActual = leadsMes?.length || 0;
    const leadsPrev = leadsMesAnterior?.length || 0;
    const leadsYoYCount = leadsYoY?.length || 0;
    const cierresActual = cierresMes?.length || 0;
    const cierresPrev = cierresMesAnterior?.length || 0;
    const cierresYoYCount = cierresYoY?.length || 0;
    const perdidosCount = leadsPerdidos?.length || 0;

    // Función para calcular variación con flechas
    const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

    // Conversión lead→cierre
    const conversionMes = leadsActual > 0 ? Math.round((cierresActual / leadsActual) * 100) : 0;

    // Citas stats
    const citasCompletadas = citasMes?.filter(c => c.status === 'completed').length || 0;
    const showRate = citasMes && citasMes.length > 0
      ? Math.round((citasCompletadas / citasMes.length) * 100)
      : 0;

    // Leads por fuente
    const porFuente: Record<string, number> = {};
    for (const l of leadsMes || []) {
      const fuente = l.source || 'Directo';
      porFuente[fuente] = (porFuente[fuente] || 0) + 1;
    }
    const fuentesOrdenadas = Object.entries(porFuente).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Leads perdidos por razón
    const razonesLost: Record<string, number> = {};
    for (const l of leadsPerdidos || []) {
      const razon = l.lost_reason || 'Sin razón';
      razonesLost[razon] = (razonesLost[razon] || 0) + 1;
    }
    const topRazones = Object.entries(razonesLost).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Pipeline por etapa
    const negociacion = pipeline?.filter(p => p.status === 'negotiation').length || 0;
    const reservados = pipeline?.filter(p => p.status === 'reserved').length || 0;

    // Ticket promedio
    const ticketPromedio = cierresActual > 0 ? revenueMes / cierresActual : 0;

    // Conversión cita→cierre
    const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresActual / citasCompletadas) * 100) : 0;

    // Tiempo de respuesta promedio
    let tiemposRespuesta: number[] = [];
    for (const l of leadsMes || []) {
      if (l.first_response_at && l.created_at) {
        const created = new Date(l.created_at).getTime();
        const responded = new Date(l.first_response_at).getTime();
        const diffMin = (responded - created) / 60000;
        if (diffMin > 0 && diffMin < 1440) {
          tiemposRespuesta.push(diffMin);
        }
      }
    }
    const tiempoPromedioMin = tiemposRespuesta.length > 0
      ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
      : 0;
    const tiempoRespuestaStr = tiempoPromedioMin > 60
      ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
      : `${tiempoPromedioMin}min`;

    // Vendedores con revenue
    const vendedoresConCierres = (vendedores || []).map(v => {
      const cierresV = cierresMes?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      for (const c of cierresV) {
        revenueV += c.properties?.price || 2000000;
      }
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.revenueV - a.revenueV);

    const rendVendedoresConRevenue: string[] = [];
    vendedoresConCierres.slice(0, 5).forEach((v, i) => {
      const medallas = ['🥇', '🥈', '🥉', '4.', '5.'];
      const revenueStr = v.revenueV >= 1000000 ? `$${(v.revenueV/1000000).toFixed(1)}M` : `$${Math.round(v.revenueV/1000)}K`;
      rendVendedoresConRevenue.push(`${medallas[i]} ${v.name?.split(' ')[0]}: ${v.cierresCount}c → ${revenueStr}`);
    });

    // ═══ INSIGHTS INTELIGENTES ═══
    const insights: string[] = [];

    if (revenueMes > revenueMesAnterior) {
      const pctCrecimiento = revenueMesAnterior > 0 ? Math.round(((revenueMes - revenueMesAnterior) / revenueMesAnterior) * 100) : 100;
      insights.push(`✅ Revenue creció ${pctCrecimiento}% vs mes anterior`);
    } else if (revenueMes < revenueMesAnterior) {
      const pctBaja = revenueMesAnterior > 0 ? Math.round(((revenueMesAnterior - revenueMes) / revenueMesAnterior) * 100) : 0;
      insights.push(`⚠️ Revenue bajó ${pctBaja}% - revisar pipeline`);
    }

    if (showRate >= 75) {
      insights.push(`✅ Excelente show rate: ${showRate}%`);
    } else if (showRate < 60) {
      insights.push(`⚠️ Show rate bajo (${showRate}%) - mejorar confirmaciones`);
    }

    if (convCitaCierre >= 30) {
      insights.push(`✅ Gran conversión cita→cierre: ${convCitaCierre}%`);
    } else if (convCitaCierre < 15 && citasCompletadas > 5) {
      insights.push(`⚠️ Conversión cita→cierre baja: ${convCitaCierre}%`);
    }

    if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 15) {
      insights.push(`✅ Tiempo respuesta excelente: ${tiempoRespuestaStr}`);
    } else if (tiempoPromedioMin > 60) {
      insights.push(`⚠️ Tiempo respuesta alto: ${tiempoRespuestaStr}`);
    }

    if (perdidosCount > cierresActual && cierresActual > 0) {
      insights.push(`⚠️ Más perdidos (${perdidosCount}) que cierres (${cierresActual})`);
    }

    const insightsText = insights.length > 0 ? insights.join('\n') : '✅ Mes estable';

    // ═══ CONSTRUIR MENSAJE ÚNICO ═══

    const msg = `📊 *REPORTE MENSUAL CEO*
*${nombreMes.toUpperCase()} ${anioReporte}*

━━━━━━━━━━━━━━━━━━━━━
💰 *RESULTADOS DEL MES*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueMes/1000000).toFixed(1)}M* ${calcVar(revenueMes, revenueMesAnterior)}
  YoY: ${calcVar(revenueMes, revenueYoY)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresPrev)}
• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*
• Tiempo respuesta: *${tiempoRespuestaStr}*

━━━━━━━━━━━━━━━━━━━━━
📈 *CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Leads: ${leadsActual} ${calcVar(leadsActual, leadsPrev)}
• Citas: ${citasMes?.length || 0} (show: *${showRate}%*)
• Lead→Cierre: *${conversionMes}%*
• Cita→Cierre: *${convCitaCierre}%*

━━━━━━━━━━━━━━━━━━━━━
📊 *PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• Negociación: ${negociacion} | Reservados: ${reservados}

━━━━━━━━━━━━━━━━━━━━━
🏆 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendVendedoresConRevenue.join('\n') || 'Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📢 *TOP 3 FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${fuentesOrdenadas.map((f, i) => `${i+1}. ${f[0]}: ${f[1]}`).join('\n') || 'Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
❌ *RAZONES DE PÉRDIDA*
━━━━━━━━━━━━━━━━━━━━━
${topRazones.length > 0 ? topRazones.map((r, i) => `${i+1}. ${r[0]}: ${r[1]}`).join('\n') : 'Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_Generado por SARA_`;

    // Enviar a cada admin (mensaje único) - EN PARALELO
    const telefonosEnviados = new Set<string>();
    const adminsUnicos = admins.filter(admin => {
      if (!admin.phone) return false;
      const tel = admin.phone.replace(/\D/g, '');
      if (telefonosEnviados.has(tel)) return false;
      telefonosEnviados.add(tel);
      return true;
    });

    await Promise.allSettled(adminsUnicos.map(async (admin) => {
      try {
        await enviarMensajeTeamMember(supabase, meta, admin, msg, {
          tipoMensaje: 'reporte_diario',
          pendingKey: 'pending_reporte_diario'
        });
        console.log(`📊 Reporte mensual enviado a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando reporte mensual a ${admin.name}:`, e);
      }
    }));
  } catch (e) {
    console.log('Error en reporte mensual:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteMensualCEO', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE SEMANAL INDIVIDUAL VENDEDORES - Lunes 9am
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteSemanalVendedores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener vendedores activos
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) return;

    const hoy = new Date();
    const diaSemana = hoy.getDay();

    // Semana pasada (lunes a domingo)
    const inicioSemPasada = new Date(hoy);
    inicioSemPasada.setDate(hoy.getDate() - diaSemana - 6);
    inicioSemPasada.setHours(0, 0, 0, 0);

    const finSemPasada = new Date(inicioSemPasada);
    finSemPasada.setDate(inicioSemPasada.getDate() + 6);
    finSemPasada.setHours(23, 59, 59, 999);

    // Semana anterior (para comparar)
    const inicioSemAnterior = new Date(inicioSemPasada);
    inicioSemAnterior.setDate(inicioSemPasada.getDate() - 7);
    const finSemAnterior = new Date(finSemPasada);
    finSemAnterior.setDate(finSemPasada.getDate() - 7);

    // Datos globales de la semana (parallelized with Promise.all)
    const [
      { data: todosLeadsSem },
      { data: todosCierresSem },
      { data: todasCitasSem },
      { data: todosLeadsSemAnt },
      { data: todosCierresSemAnt }
    ] = await Promise.all([
      supabase.client.from('leads').select('*, properties(price)')
        .gte('created_at', inicioSemPasada.toISOString()).lte('created_at', finSemPasada.toISOString()),
      supabase.client.from('leads').select('*, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioSemPasada.toISOString()).lte('status_changed_at', finSemPasada.toISOString()),
      supabase.client.from('appointments').select('*')
        .gte('scheduled_date', inicioSemPasada.toISOString().split('T')[0])
        .lte('scheduled_date', finSemPasada.toISOString().split('T')[0]),
      supabase.client.from('leads').select('id, assigned_to')
        .gte('created_at', inicioSemAnterior.toISOString()).lte('created_at', finSemAnterior.toISOString()),
      supabase.client.from('leads').select('id, assigned_to, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioSemAnterior.toISOString()).lte('status_changed_at', finSemAnterior.toISOString())
    ]);

    // Calcular ranking por revenue
    const vendedoresConRevenue = vendedores.map(v => {
      const cierresV = todosCierresSem?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.revenueV - a.revenueV);

    // Función para calcular variación
    const calcVar = (a: number, b: number) => {
      if (b === 0) return a > 0 ? '↑' : '→';
      if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
      if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
      return '→';
    };

    // Enviar reporte a cada vendedor
    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      // Datos individuales del vendedor
      const leadsVendedor = todosLeadsSem?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedor = todosCierresSem?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedor = todasCitasSem?.filter(c => c.vendedor_id === vendedor.id) || [];

      // Datos semana anterior
      const leadsVendedorAnt = todosLeadsSemAnt?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorAnt = todosCierresSemAnt?.filter(c => c.assigned_to === vendedor.id) || [];

      // Cálculos
      const leadsCount = leadsVendedor.length;
      const leadsCountAnt = leadsVendedorAnt.length;
      const cierresCount = cierresVendedor.length;
      const cierresCountAnt = cierresVendedorAnt.length;

      let revenueVendedor = 0;
      cierresVendedor.forEach(c => revenueVendedor += c.properties?.price || 2000000);

      let revenueVendedorAnt = 0;
      cierresVendedorAnt.forEach(c => revenueVendedorAnt += c.properties?.price || 2000000);

      // Citas
      const citasTotal = citasVendedor.length;
      const citasCompletadas = citasVendedor.filter(c => c.status === 'completed').length;
      const citasCanceladas = citasVendedor.filter(c => c.status === 'cancelled').length;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;

      // Conversiones
      const convLeadCierre = leadsCount > 0 ? Math.round((cierresCount / leadsCount) * 100) : 0;
      const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresCount / citasCompletadas) * 100) : 0;

      // Tiempo de respuesta promedio
      let tiemposRespuesta: number[] = [];
      for (const l of leadsVendedor) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) {
            tiemposRespuesta.push(diffMin);
          }
        }
      }
      const tiempoPromedioMin = tiemposRespuesta.length > 0
        ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
        : 0;
      const tiempoRespuestaStr = tiempoPromedioMin > 60
        ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
        : `${tiempoPromedioMin}min`;

      // Posición en ranking
      const posicion = vendedoresConRevenue.findIndex(v => v.id === vendedor.id) + 1;
      const totalVendedores = vendedoresConRevenue.length;
      const medallas = ['🥇', '🥈', '🥉'];
      const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;

      // Revenue total del equipo
      let revenueEquipo = 0;
      todosCierresSem?.forEach(c => revenueEquipo += c.properties?.price || 2000000);
      const porcentajeEquipo = revenueEquipo > 0 ? Math.round((revenueVendedor / revenueEquipo) * 100) : 0;

      // Insights personalizados
      const insights: string[] = [];

      if (cierresCount > cierresCountAnt) {
        insights.push(`✅ Mejoraste en cierres: ${cierresCountAnt}→${cierresCount}`);
      } else if (cierresCount < cierresCountAnt && cierresCountAnt > 0) {
        insights.push(`⚠️ Menos cierres que la semana pasada`);
      }

      if (showRate >= 80) {
        insights.push(`✅ Excelente show rate: ${showRate}%`);
      } else if (showRate < 60 && citasTotal > 0) {
        insights.push(`💡 Tip: Confirma citas 1 día antes`);
      }

      if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 10) {
        insights.push(`✅ Respuesta rápida: ${tiempoRespuestaStr}`);
      } else if (tiempoPromedioMin > 60) {
        insights.push(`💡 Tip: Responde más rápido a leads`);
      }

      if (posicion === 1) {
        insights.push(`🏆 ¡Eres el #1 del equipo esta semana!`);
      } else if (posicion <= 3) {
        insights.push(`🎯 Estás en el Top 3 del equipo`);
      }

      if (convCitaCierre >= 40) {
        insights.push(`✅ Gran cierre en citas: ${convCitaCierre}%`);
      }

      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Sigue así!';

      // Construir mensaje
      const nombreCorto = vendedor.name?.split(' ')[0] || 'Vendedor';
      const fechaSemana = `${inicioSemPasada.getDate()}/${inicioSemPasada.getMonth()+1} - ${finSemPasada.getDate()}/${finSemPasada.getMonth()+1}`;

      const msg = `📊 *TU REPORTE SEMANAL*
Hola *${nombreCorto}* 👋
_Semana: ${fechaSemana}_

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedor/1000000).toFixed(1)}M* ${calcVar(revenueVendedor, revenueVendedorAnt)}
• Cierres: *${cierresCount}* ${calcVar(cierresCount, cierresCountAnt)}
• Leads: *${leadsCount}* ${calcVar(leadsCount, leadsCountAnt)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Agendadas: ${citasTotal}
• Completadas: ${citasCompletadas}
• Show rate: *${showRate}%* ${showRate >= 70 ? '✅' : '⚠️'}

━━━━━━━━━━━━━━━━━━━━━
📈 *TUS CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierre}%*
• Cita→Cierre: *${convCitaCierre}%*
• Tiempo respuesta: *${tiempoRespuestaStr}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStr}* de ${totalVendedores}
• Aportaste: *${porcentajeEquipo}%* del revenue

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_¡Éxito esta semana!_ 🚀`;

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'resumen_semanal',
          pendingKey: 'pending_resumen_semanal'
        });
        console.log(`📊 Reporte semanal enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${vendedor.name}:`, e);
      }

      // Esperar 1s entre mensajes para no saturar
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`✅ Reportes semanales enviados a ${vendedores.length} vendedores`);
  } catch (e) {
    console.log('Error en reporte semanal vendedores:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteSemanalVendedores', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// FLUJO POST-VISITA AUTOMÁTICO
// Pregunta al VENDEDOR: "¿Llegó el lead?" → luego encuesta al lead
// ═══════════════════════════════════════════════════════════════

export async function iniciarFlujosPostVisita(supabase: SupabaseService, meta: MetaWhatsAppService, kv?: KVNamespace): Promise<void> {
  try {
    const ahora = new Date();

    // Timezone México
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const hoyMexico = mexicoFormatter.format(ahora);

    const horaFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const horaMexico = horaFormatter.format(ahora);
    const [horaActual, minActual] = horaMexico.split(':').map(Number);
    const minutosActuales = horaActual * 60 + minActual;

    console.log(`📋 POST-VISITA: Verificando citas ${hoyMexico} ${horaMexico}`);

    // Buscar citas de hoy que aún no están completed/no_show/cancelled
    const { data: citas, error } = await supabase.client
      .from('appointments')
      .select('*, leads!inner(id, name, phone, property_interest, notes), team_members:vendedor_id(id, name, phone, notes)')
      .eq('scheduled_date', hoyMexico)
      .in('status', ['scheduled', 'confirmed']);

    if (error || !citas || citas.length === 0) {
      console.log(`📋 POST-VISITA: No hay citas pendientes hoy`);
      return;
    }

    // Filtrar citas cuya hora ya pasó (hace 30-90 min)
    const citasPasadas = citas.filter(cita => {
      const horaCita = cita.scheduled_time || '12:00';
      const [h, m] = horaCita.split(':').map(Number);
      const minutosCita = (h || 12) * 60 + (m || 0);

      // Asumiendo cita de 1h, debió terminar hace 30-90 min
      const minutosDesdeFinCita = minutosActuales - (minutosCita + 60);
      return minutosDesdeFinCita >= 30 && minutosDesdeFinCita <= 90;
    });

    if (citasPasadas.length === 0) {
      console.log(`📋 POST-VISITA: No hay citas en ventana de 30-90min`);
      return;
    }

    console.log(`📋 POST-VISITA: ${citasPasadas.length} citas para iniciar flujo`);

    const { PostVisitService } = await import('../services/postVisitService');
    const postVisitService = new PostVisitService(supabase, kv);

    for (const cita of citasPasadas) {
      const lead = cita.leads as any;
      const vendedor = cita.team_members as any;

      if (!vendedor?.phone) {
        console.log(`📋 POST-VISITA: Vendedor sin teléfono para cita ${cita.id}`);
        continue;
      }

      // Verificar si ya se inició flujo para esta cita
      // NOTA: notes puede ser string JSON o objeto - hay que parsear ambos
      let vendedorNotas: any = {};
      if (vendedor.notes) {
        if (typeof vendedor.notes === 'string') {
          try { vendedorNotas = JSON.parse(vendedor.notes); } catch { vendedorNotas = {}; }
        } else if (typeof vendedor.notes === 'object') {
          vendedorNotas = vendedor.notes;
        }
      }
      const contextoExistente = vendedorNotas?.post_visit_context;
      if (contextoExistente && contextoExistente.appointment_id === cita.id) {
        console.log(`📋 POST-VISITA: Flujo ya iniciado para ${lead.name}`);
        continue;
      }

      try {
        // MARK-BEFORE-SEND: Cambiar status a 'completed' ANTES de enviar
        // Esto saca la cita de la query .in('status', ['scheduled', 'confirmed'])
        // y previene que el CRON (cada 2 min) la procese otra vez
        const { error: statusError } = await supabase.client
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', cita.id);

        if (statusError) {
          console.error(`📋 POST-VISITA: Error marcando cita ${cita.id} como completed:`, statusError);
          continue; // No enviar si no pudimos marcar (previene duplicados)
        }

        // Iniciar flujo post-visita
        const { mensaje, context } = await postVisitService.iniciarFlujoPostVisita(cita, lead, vendedor);

        // Enviar pregunta al vendedor (24h-safe)
        await enviarMensajeTeamMember(supabase, meta, vendedor, mensaje, {
          tipoMensaje: 'alerta_lead',
          pendingKey: 'pending_alerta_lead'
        });

        console.log(`📋 POST-VISITA: Pregunta enviada a ${vendedor.name} sobre ${lead.name}`);

        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`📋 POST-VISITA: Error con ${lead.name}:`, err);
      }
    }
  } catch (e) {
    console.error('Error en iniciarFlujosPostVisita:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'iniciarFlujosPostVisita', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// ENCUESTAS AUTOMÁTICAS
// ═══════════════════════════════════════════════════════════════

// Enviar encuesta post-cita (2 horas después de cita completada)
// Busca citas completadas cuya hora programada fue hace 2-3 horas
export async function enviarEncuestasPostCita(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();

    // Usar timezone México
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const hoyMexico = mexicoFormatter.format(ahora);

    // Obtener hora actual en México
    const horaFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const horaMexico = horaFormatter.format(ahora);
    const [horaActual, minActual] = horaMexico.split(':').map(Number);
    const minutosActuales = horaActual * 60 + minActual;

    console.log(`📋 Verificando encuestas: ${hoyMexico} ${horaMexico} (${minutosActuales} min desde medianoche)`);

    // Buscar citas completadas de hoy
    const { data: citasCompletadas, error: errorCitas } = await supabase.client
      .from('appointments')
      .select('*, leads(id, name, phone), team_members:vendedor_id(id, name)')
      .eq('status', 'completed')
      .eq('scheduled_date', hoyMexico);

    console.log(`📋 Citas completadas hoy: ${citasCompletadas?.length || 0}, error: ${errorCitas?.message || 'ninguno'}`);

    if (!citasCompletadas || citasCompletadas.length === 0) {
      console.log('📋 No hay citas completadas hoy');
      return;
    }

    // Filtrar citas cuya hora programada fue hace 2-3 horas
    const citasParaEncuesta = citasCompletadas.filter(cita => {
      const horaCita = cita.scheduled_time || '12:00';
      const [h, m] = horaCita.split(':').map(Number);
      const minutosCita = (h || 12) * 60 + (m || 0);

      // La cita debió terminar hace 2-3 horas (asumiendo 1h de duración)
      const minutosDesdeFinCita = minutosActuales - (minutosCita + 60);
      const entreDosTresHoras = minutosDesdeFinCita >= 120 && minutosDesdeFinCita <= 180;

      if (entreDosTresHoras) {
        console.log(`📋 Cita ${cita.id?.slice(0,8)} elegible: ${horaCita} -> terminó hace ${minutosDesdeFinCita} min`);
      }
      return entreDosTresHoras;
    });

    console.log(`📋 Citas elegibles para encuesta: ${citasParaEncuesta.length}`);

    if (citasParaEncuesta.length === 0) {
      console.log('📋 No hay citas en el rango de 2-3h para enviar encuesta');
      return;
    }

    // Batch prefetch: obtener todas las encuestas ya enviadas para las citas de hoy (evita N+1 queries)
    const citaIds = citasCompletadas.map(c => c.id).filter(Boolean);
    const { data: encuestasExistentes } = citaIds.length > 0
      ? await supabase.client
          .from('surveys')
          .select('appointment_id')
          .in('appointment_id', citaIds)
          .eq('survey_type', 'post_cita')
      : { data: [] };
    const encuestaEnviadaSet = new Set((encuestasExistentes || []).map(e => e.appointment_id));

    for (const cita of citasCompletadas) {
      const lead = cita.leads as any;
      const vendedor = cita.team_members as any;
      if (!lead?.phone) continue;

      // Verificar si ya se envió encuesta para esta cita (batch prefetched)
      if (encuestaEnviadaSet.has(cita.id)) continue;

      const nombreCliente = lead.name?.split(' ')[0] || 'Cliente';
      const nombreVendedor = vendedor?.name?.split(' ')[0] || 'nuestro asesor';

      const mensaje = `Hola *${nombreCliente}* 👋

¿Cómo calificas tu cita con *${nombreVendedor}*?

1️⃣ Excelente
2️⃣ Buena
3️⃣ Regular
4️⃣ Mala

_Responde con el número_

Tu opinión nos ayuda a mejorar 🙏`;

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);

        // Registrar encuesta enviada (esto evita duplicados al verificar en surveys)
        await supabase.client.from('surveys').insert({
          lead_id: lead.id,
          lead_phone: lead.phone,
          lead_name: lead.name,
          vendedor_id: vendedor?.id,
          vendedor_name: vendedor?.name,
          appointment_id: cita.id,
          survey_type: 'post_cita',
          status: 'sent',
          expires_at: new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString() // Expira en 24h
        });

        console.log(`📋 Encuesta post-cita enviada a ${lead.name}`);
      } catch (e) {
        console.log(`Error enviando encuesta a ${lead.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.log('Error en encuestas post-cita:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarEncuestasPostCita', stack: (e as Error).stack });
  }
}

// Enviar encuesta NPS post-cierre (7 días después)
export async function enviarEncuestasNPS(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace8Dias = new Date(ahora.getTime() - 8 * 24 * 60 * 60 * 1000);

    // Buscar leads que cerraron hace 7-8 días
    const { data: cierres } = await supabase.client
      .from('leads')
      .select('*, team_members:assigned_to(id, name)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', hace8Dias.toISOString())
      .lte('status_changed_at', hace7Dias.toISOString());

    if (!cierres || cierres.length === 0) return;

    for (const lead of cierres) {
      if (!lead.phone) continue;

      // Verificar si ya se envió encuesta NPS
      const { data: encuestaExistente } = await supabase.client
        .from('surveys')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('survey_type', 'nps')
        .single();

      if (encuestaExistente) continue;

      const nombreCliente = lead.name?.split(' ')[0] || 'Cliente';
      const vendedor = lead.team_members as any;

      const mensaje = `¡Hola *${nombreCliente}*! 🏠

¡Felicidades por tu nueva casa!

Del *0 al 10*, ¿qué tan probable es que nos recomiendes con amigos o familia?

0 = Nada probable
10 = Muy probable

_Responde con un número del 0 al 10_

¡Gracias por confiar en nosotros! 🙏`;

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);

        await supabase.client.from('surveys').insert({
          lead_id: lead.id,
          lead_phone: lead.phone,
          lead_name: lead.name,
          vendedor_id: vendedor?.id,
          vendedor_name: vendedor?.name,
          survey_type: 'nps',
          status: 'sent',
          expires_at: new Date(ahora.getTime() + 72 * 60 * 60 * 1000).toISOString() // Expira en 72h
        });

        console.log(`📋 Encuesta NPS enviada a ${lead.name}`);
      } catch (e) {
        console.log(`Error enviando encuesta NPS a ${lead.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.log('Error en encuestas NPS:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarEncuestasNPS', stack: (e as Error).stack });
  }
}

// Procesar respuesta de encuesta
export async function procesarRespuestaEncuesta(supabase: SupabaseService, phone: string, mensaje: string): Promise<string | null> {
  try {
    // Buscar encuesta pendiente para este teléfono
    const { data: encuesta } = await supabase.client
      .from('surveys')
      .select('*')
      .eq('lead_phone', phone)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (!encuesta) return null;

    const textoLimpio = mensaje.trim();

    // Encuesta post-cita (espera 1-4)
    if (encuesta.survey_type === 'post_cita') {
      const respuesta = parseInt(textoLimpio);
      if (respuesta >= 1 && respuesta <= 4) {
        const ratings: { [key: number]: { rating: number; texto: string } } = {
          1: { rating: 5, texto: 'Excelente' },
          2: { rating: 4, texto: 'Buena' },
          3: { rating: 3, texto: 'Regular' },
          4: { rating: 2, texto: 'Mala' }
        };

        await supabase.client
          .from('surveys')
          .update({
            status: 'answered',
            answered_at: new Date().toISOString(),
            rating: ratings[respuesta].rating,
            feedback: ratings[respuesta].texto
          })
          .eq('id', encuesta.id);

        const respuestas: { [key: number]: string } = {
          1: `¡Gracias *${encuesta.lead_name?.split(' ')[0]}*! 🌟\n\nNos alegra que tu experiencia haya sido excelente. ¡Seguiremos trabajando para ti!`,
          2: `¡Gracias *${encuesta.lead_name?.split(' ')[0]}*! 😊\n\nNos da gusto que hayas tenido una buena experiencia.`,
          3: `Gracias por tu respuesta *${encuesta.lead_name?.split(' ')[0]}*.\n\n¿Hay algo específico que podamos mejorar? Tu opinión es muy valiosa para nosotros.`,
          4: `Lamentamos que tu experiencia no haya sido buena *${encuesta.lead_name?.split(' ')[0]}*.\n\nNos gustaría saber qué pasó para mejorar. Un supervisor se pondrá en contacto contigo.`
        };

        // Si fue mala, notificar al admin
        if (respuesta === 4) {
          const { data: admins } = await supabase.client
            .from('team_members')
            .select('phone')
            .eq('role', 'admin')
            .eq('active', true);

          // Notificación asíncrona - no esperamos
          console.error(`⚠️ Encuesta negativa de ${encuesta.lead_name} sobre ${encuesta.vendedor_name}`);
        }

        return respuestas[respuesta];
      }
    }

    // Encuesta NPS (espera 0-10)
    if (encuesta.survey_type === 'nps') {
      const nps = parseInt(textoLimpio);
      if (nps >= 0 && nps <= 10) {
        await supabase.client
          .from('surveys')
          .update({
            status: 'answered',
            answered_at: new Date().toISOString(),
            nps_score: nps,
            would_recommend: nps >= 7
          })
          .eq('id', encuesta.id);

        if (nps >= 9) {
          return `¡Wow, gracias *${encuesta.lead_name?.split(' ')[0]}*! 🌟\n\nTu recomendación significa mucho para nosotros. ¡Que disfrutes tu nuevo hogar!`;
        } else if (nps >= 7) {
          return `¡Gracias *${encuesta.lead_name?.split(' ')[0]}*! 😊\n\nNos alegra haberte ayudado. ¡Disfruta tu nueva casa!`;
        } else {
          return `Gracias por tu honestidad *${encuesta.lead_name?.split(' ')[0]}*.\n\n¿Hay algo que pudimos haber hecho mejor? Nos encantaría escucharte.`;
        }
      }
    }

    return null;
  } catch (e) {
    console.log('Error procesando respuesta encuesta:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'procesarRespuestaEncuesta', stack: (e as Error).stack });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE DIARIO INDIVIDUAL VENDEDORES - L-V 7pm
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteDiarioVendedores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener vendedores activos
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) return;

    const hoy = new Date();

    // Inicio y fin de hoy
    const inicioHoy = new Date(hoy);
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(hoy);
    finHoy.setHours(23, 59, 59, 999);

    // Ayer para comparar
    const inicioAyer = new Date(inicioHoy);
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    const finAyer = new Date(finHoy);
    finAyer.setDate(finAyer.getDate() - 1);

    // Datos globales (parallelized with Promise.all)
    const manana = new Date(inicioHoy);
    manana.setDate(manana.getDate() + 1);

    const [
      { data: todosLeadsHoy },
      { data: todosCierresHoy },
      { data: todasCitasHoy },
      { data: citasManana },
      { data: todosLeadsAyer },
      { data: todosCierresAyer },
      { data: pipelineActivo },
      { data: followupsHoy }
    ] = await Promise.all([
      supabase.client.from('leads').select('*, properties(price)')
        .gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString()),
      supabase.client.from('leads').select('*, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioHoy.toISOString()).lte('status_changed_at', finHoy.toISOString()),
      supabase.client.from('appointments').select('*')
        .eq('scheduled_date', inicioHoy.toISOString().split('T')[0]),
      supabase.client.from('appointments').select('*, leads(name, phone)')
        .eq('scheduled_date', manana.toISOString().split('T')[0]).eq('status', 'scheduled'),
      supabase.client.from('leads').select('id, assigned_to')
        .gte('created_at', inicioAyer.toISOString()).lte('created_at', finAyer.toISOString()),
      supabase.client.from('leads').select('id, assigned_to, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioAyer.toISOString()).lte('status_changed_at', finAyer.toISOString()),
      supabase.client.from('leads').select('*, properties(price)')
        .in('status', ['new', 'contacted', 'qualified', 'negotiation', 'scheduled', 'visited']),
      supabase.client.from('followup_approvals').select('vendedor_id, status, sent_at')
        .gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString())
    ]);

    // Calcular ranking del día por cierres
    const vendedoresConCierres = vendedores.map(v => {
      const cierresV = todosCierresHoy?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.cierresCount - a.cierresCount || b.revenueV - a.revenueV);

    // Función para calcular variación
    const calcVar = (a: number, b: number) => {
      if (b === 0) return a > 0 ? '↑' : '→';
      if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
      if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
      return '→';
    };

    const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

    // Enviar reporte a cada vendedor
    for (const vendedor of vendedores) {
      try {
      if (!vendedor.phone) continue;

      // Skip vendedores de prueba (no enviar reportes con 0 actividad real)
      const nombreLower = (vendedor.name || '').toLowerCase();
      if (nombreLower.includes('test') || nombreLower.includes('prueba')) {
        console.log(`⏭️ Skip reporte diario para ${vendedor.name} (cuenta de prueba)`);
        continue;
      }

      // Datos individuales del vendedor - HOY
      const leadsVendedorHoy = todosLeadsHoy?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorHoy = todosCierresHoy?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedorHoy = todasCitasHoy?.filter(c => c.vendedor_id === vendedor.id) || [];
      const citasVendedorManana = citasManana?.filter(c => c.vendedor_id === vendedor.id) || [];
      const pipelineVendedor = pipelineActivo?.filter(p => p.assigned_to === vendedor.id) || [];

      // Datos de ayer
      const leadsVendedorAyer = todosLeadsAyer?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorAyer = todosCierresAyer?.filter(c => c.assigned_to === vendedor.id) || [];

      // Cálculos
      const leadsHoyCount = leadsVendedorHoy.length;
      const leadsAyerCount = leadsVendedorAyer.length;
      const cierresHoyCount = cierresVendedorHoy.length;
      const cierresAyerCount = cierresVendedorAyer.length;

      let revenueHoy = 0;
      cierresVendedorHoy.forEach(c => revenueHoy += c.properties?.price || 2000000);

      // Citas de hoy
      const citasHoyTotal = citasVendedorHoy.length;
      const citasCompletadas = citasVendedorHoy.filter(c => c.status === 'completed').length;
      const citasPendientes = citasVendedorHoy.filter(c => c.status === 'scheduled').length;
      const showRateHoy = citasHoyTotal > 0 ? Math.round((citasCompletadas / citasHoyTotal) * 100) : 0;

      // Pipeline value
      let pipelineValue = 0;
      pipelineVendedor.forEach(p => pipelineValue += p.properties?.price || 2000000);

      // Leads por estatus en pipeline
      const leadsNuevos = pipelineVendedor.filter(p => p.status === 'new').length;
      const leadsContactados = pipelineVendedor.filter(p => ['contacted', 'qualified'].includes(p.status)).length;
      const leadsNegociacion = pipelineVendedor.filter(p => ['negotiation', 'scheduled', 'visited'].includes(p.status)).length;

      // Follow-ups del vendedor hoy
      const followupsVendedor = followupsHoy?.filter(f => f.vendedor_id === vendedor.id) || [];
      const followupsEnviados = followupsVendedor.filter(f => f.status === 'sent').length;
      const followupsPendientes = followupsVendedor.filter(f => f.status === 'pending').length;

      // Tiempo de respuesta hoy
      let tiemposRespuesta: number[] = [];
      for (const l of leadsVendedorHoy) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuesta.push(diffMin);
        }
      }
      const tiempoPromedioMin = tiemposRespuesta.length > 0
        ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
        : 0;
      const tiempoRespuestaStr = tiempoPromedioMin > 60
        ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
        : `${tiempoPromedioMin}min`;

      // Posición en ranking del día
      const posicion = vendedoresConCierres.findIndex(v => v.id === vendedor.id) + 1;
      const totalVendedores = vendedoresConCierres.length;

      // Citas de mañana detalle
      const citasMananaDetalle: string[] = [];
      citasVendedorManana.slice(0, 3).forEach(c => {
        const hora = c.scheduled_time?.substring(0, 5) || '00:00';
        const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
        citasMananaDetalle.push(`  • ${hora} - ${cliente}`);
      });

      // Insights del día
      const insights: string[] = [];

      if (cierresHoyCount > 0) {
        insights.push(`🎉 ¡${cierresHoyCount} cierre${cierresHoyCount > 1 ? 's' : ''} hoy! $${(revenueHoy/1000000).toFixed(1)}M`);
      }

      if (leadsHoyCount > leadsAyerCount && leadsHoyCount > 0) {
        insights.push(`📈 Más leads que ayer: ${leadsAyerCount}→${leadsHoyCount}`);
      }

      if (citasPendientes > 0) {
        insights.push(`⚠️ ${citasPendientes} cita${citasPendientes > 1 ? 's' : ''} pendiente${citasPendientes > 1 ? 's' : ''} de hoy`);
      }

      if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 10) {
        insights.push(`✅ Respuesta rápida: ${tiempoRespuestaStr}`);
      } else if (tiempoPromedioMin > 30) {
        insights.push(`💡 Tip: Responde más rápido`);
      }

      if (leadsNuevos > 3) {
        insights.push(`📋 ${leadsNuevos} leads nuevos por contactar`);
      }

      if (citasVendedorManana.length > 0) {
        insights.push(`📅 Mañana: ${citasVendedorManana.length} cita${citasVendedorManana.length > 1 ? 's' : ''}`);
      }

      if (followupsEnviados > 0) {
        insights.push(`📤 ${followupsEnviados} follow-up${followupsEnviados > 1 ? 's' : ''} enviado${followupsEnviados > 1 ? 's' : ''}`);
      }

      if (followupsPendientes > 0) {
        insights.push(`📬 ${followupsPendientes} mensaje${followupsPendientes > 1 ? 's' : ''} pendiente${followupsPendientes > 1 ? 's' : ''} de aprobar`);
      }

      // Feedback post-visita compacto
      const fbCompact: string[] = [];
      pipelineVendedor.forEach((p: any) => {
        const fb = formatVendorFeedback(p.notes, { compact: true });
        if (fb) fbCompact.push(`${p.name?.split(' ')[0] || 'Lead'} ${fb}`);
      });
      if (fbCompact.length > 0) {
        insights.push(`📝 Feedback: ${fbCompact.slice(0, 3).join(', ')}`);
      }

      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen trabajo hoy!';

      // Construir mensaje
      const nombreCorto = vendedor.name?.split(' ')[0] || 'Vendedor';

      const msg = `📊 *TU RESUMEN DEL DÍA*
Hola *${nombreCorto}* 👋
_${fechaHoy}_

━━━━━━━━━━━━━━━━━━━━━
💰 *HOY*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsHoyCount}* ${calcVar(leadsHoyCount, leadsAyerCount)}
• Cierres: *${cierresHoyCount}* ${cierresHoyCount > 0 ? '🎉' : ''}
${cierresHoyCount > 0 ? `• Revenue: *$${(revenueHoy/1000000).toFixed(1)}M*` : ''}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS HOY*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasHoyTotal}
• Completadas: ${citasCompletadas} ${showRateHoy >= 80 ? '✅' : ''}
• Pendientes: ${citasPendientes} ${citasPendientes > 0 ? '⚠️' : '✅'}

━━━━━━━━━━━━━━━━━━━━━
📋 *TU PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• Nuevos: ${leadsNuevos} | Contactados: ${leadsContactados}
• En negociación: ${leadsNegociacion}

${citasVendedorManana.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS MAÑANA*
━━━━━━━━━━━━━━━━━━━━━
${citasMananaDetalle.join('\n')}${citasVendedorManana.length > 3 ? `\n  _+${citasVendedorManana.length - 3} más..._` : ''}

` : ''}━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_¡Descansa y mañana con todo!_ 🚀`;

      // ═══ USAR HELPER QUE RESPETA VENTANA 24H ═══
      const insightPrincipal = insights.length > 0 ? insights[0] : '¡Buen día!';
      const templateParams = [
        nombreCorto,
        `${leadsHoyCount}`,
        `${citasCompletadas}`,
        `${citasHoyTotal}`,
        `$${(pipelineValue/1000000).toFixed(1)}M`,
        insightPrincipal
      ];

      const resultado = await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
        tipoMensaje: 'reporte_diario',
        guardarPending: true,
        pendingKey: 'pending_reporte_diario',
        templateOverride: {
          name: 'reporte_vendedor',
          params: templateParams
        }
      });

      if (resultado.success) {
        console.log(`📊 Reporte diario ${resultado.method === 'direct' ? 'enviado' : 'template+pending'} a ${vendedor.name}`);
      } else {
        console.log(`❌ Error enviando reporte diario a ${vendedor.name}`);
      }

      // Esperar 1s entre mensajes
      await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        console.error(`❌ Error procesando reporte diario vendedor ${vendedor.name || vendedor.id}:`, error);
        continue;
      }
    }

    console.log(`✅ Reportes diarios procesados para ${vendedores.length} vendedores`);
  } catch (e) {
    console.log('Error en reporte diario vendedores:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteDiarioVendedores', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL INDIVIDUAL VENDEDORES - Día 1 de cada mes 9am
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteMensualVendedores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    // Mes pasado (el que reportamos)
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;

    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);

    // Mes anterior para comparar
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    // Datos globales del mes
    // Datos globales del mes (parallelized with Promise.all)
    const [
      { data: todosLeadsMes },
      { data: todosCierresMes },
      { data: todasCitasMes },
      { data: todosLeadsMesAnt },
      { data: todosCierresMesAnt },
      { data: todasCitasMesAnt },
      { data: todasEncuestasMes }
    ] = await Promise.all([
      supabase.client.from('leads').select('*, properties(price)')
        .gte('created_at', inicioMesReporte.toISOString()).lte('created_at', finMesReporte.toISOString()),
      supabase.client.from('leads').select('*, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioMesReporte.toISOString()).lte('status_changed_at', finMesReporte.toISOString()),
      supabase.client.from('appointments').select('*')
        .gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0])
        .lte('scheduled_date', finMesReporte.toISOString().split('T')[0]),
      supabase.client.from('leads').select('id, assigned_to')
        .gte('created_at', inicioMesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString()),
      supabase.client.from('leads').select('id, assigned_to, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioMesAnterior.toISOString()).lte('status_changed_at', finMesAnterior.toISOString()),
      supabase.client.from('appointments').select('id, vendedor_id, status')
        .gte('scheduled_date', inicioMesAnterior.toISOString().split('T')[0])
        .lte('scheduled_date', finMesAnterior.toISOString().split('T')[0]),
      supabase.client.from('surveys').select('*')
        .eq('status', 'answered')
        .gte('answered_at', inicioMesReporte.toISOString()).lte('answered_at', finMesReporte.toISOString())
    ]);

    // Calcular ranking por revenue
    const vendedoresConRevenue = vendedores.map(v => {
      const cierresV = todosCierresMes?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.revenueV - a.revenueV);

    // Revenue total del equipo
    let revenueEquipo = 0;
    todosCierresMes?.forEach(c => revenueEquipo += c.properties?.price || 2000000);

    const calcVar = (a: number, b: number) => {
      if (b === 0) return a > 0 ? '↑' : '→';
      if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
      if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
      return '→';
    };

    // Enviar a cada vendedor
    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      // Datos del mes
      const leadsVendedor = todosLeadsMes?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedor = todosCierresMes?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedor = todasCitasMes?.filter(c => c.vendedor_id === vendedor.id) || [];

      // Datos mes anterior
      const leadsVendedorAnt = todosLeadsMesAnt?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorAnt = todosCierresMesAnt?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedorAnt = todasCitasMesAnt?.filter(c => c.vendedor_id === vendedor.id) || [];

      // Cálculos
      const leadsCount = leadsVendedor.length;
      const leadsCountAnt = leadsVendedorAnt.length;
      const cierresCount = cierresVendedor.length;
      const cierresCountAnt = cierresVendedorAnt.length;

      let revenueVendedor = 0;
      cierresVendedor.forEach(c => revenueVendedor += c.properties?.price || 2000000);

      let revenueVendedorAnt = 0;
      cierresVendedorAnt.forEach(c => revenueVendedorAnt += c.properties?.price || 2000000);

      // Citas
      const citasTotal = citasVendedor.length;
      const citasTotalAnt = citasVendedorAnt.length;
      const citasCompletadas = citasVendedor.filter(c => c.status === 'completed').length;
      const citasCompletadasAnt = citasVendedorAnt.filter(c => c.status === 'completed').length;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;
      const showRateAnt = citasTotalAnt > 0 ? Math.round((citasCompletadasAnt / citasTotalAnt) * 100) : 0;

      // Conversiones
      const convLeadCierre = leadsCount > 0 ? Math.round((cierresCount / leadsCount) * 100) : 0;
      const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresCount / citasCompletadas) * 100) : 0;

      // Ticket promedio
      const ticketPromedio = cierresCount > 0 ? revenueVendedor / cierresCount : 0;

      // Tiempo de respuesta promedio
      let tiemposRespuesta: number[] = [];
      for (const l of leadsVendedor) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuesta.push(diffMin);
        }
      }
      const tiempoPromedioMin = tiemposRespuesta.length > 0
        ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
        : 0;
      const tiempoRespuestaStr = tiempoPromedioMin > 60
        ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
        : `${tiempoPromedioMin}min`;

      // Posición en ranking
      const posicion = vendedoresConRevenue.findIndex(v => v.id === vendedor.id) + 1;
      const totalVendedores = vendedoresConRevenue.length;
      const medallas = ['🥇', '🥈', '🥉'];
      const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;

      // Porcentaje del equipo
      const porcentajeEquipo = revenueEquipo > 0 ? Math.round((revenueVendedor / revenueEquipo) * 100) : 0;

      // Mejor semana del mes (por cierres)
      let mejorSemana = 0;
      let mejorSemanaNum = 1;
      for (let sem = 0; sem < 5; sem++) {
        const inicioSem = new Date(inicioMesReporte);
        inicioSem.setDate(inicioSem.getDate() + (sem * 7));
        const finSem = new Date(inicioSem);
        finSem.setDate(finSem.getDate() + 6);
        if (finSem > finMesReporte) finSem.setTime(finMesReporte.getTime());

        const cierresSem = cierresVendedor.filter(c => {
          const fecha = new Date(c.status_changed_at);
          return fecha >= inicioSem && fecha <= finSem;
        }).length;

        if (cierresSem > mejorSemana) {
          mejorSemana = cierresSem;
          mejorSemanaNum = sem + 1;
        }
      }

      // Insights del mes
      const insights: string[] = [];

      if (revenueVendedor > revenueVendedorAnt && revenueVendedorAnt > 0) {
        const pctCrecimiento = Math.round(((revenueVendedor - revenueVendedorAnt) / revenueVendedorAnt) * 100);
        insights.push(`🚀 Revenue creció ${pctCrecimiento}% vs mes anterior`);
      } else if (revenueVendedor < revenueVendedorAnt && revenueVendedorAnt > 0) {
        insights.push(`📉 Revenue bajó vs mes anterior`);
      }

      if (posicion === 1) {
        insights.push(`🏆 ¡Fuiste el #1 del equipo!`);
      } else if (posicion <= 3) {
        insights.push(`🎯 Top 3 del equipo`);
      }

      if (showRate >= 80) {
        insights.push(`✅ Excelente show rate: ${showRate}%`);
      } else if (showRate < 60 && citasTotal > 5) {
        insights.push(`💡 Mejorar confirmación de citas`);
      }

      if (convCitaCierre >= 35) {
        insights.push(`✅ Gran conversión cita→cierre: ${convCitaCierre}%`);
      }

      if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 15) {
        insights.push(`✅ Respuesta rápida promedio`);
      }

      if (mejorSemana > 0) {
        insights.push(`📅 Mejor semana: S${mejorSemanaNum} (${mejorSemana} cierres)`);
      }

      // ═══════════════════════════════════════════════════════════
      // ENCUESTAS DE SATISFACCIÓN
      // ═══════════════════════════════════════════════════════════
      const encuestasVendedor = todasEncuestasMes?.filter(e => e.vendedor_id === vendedor.id) || [];
      const encuestasPostCita = encuestasVendedor.filter(e => e.survey_type === 'post_cita');
      const encuestasNPS = encuestasVendedor.filter(e => e.survey_type === 'nps');

      // Promedio de calificación post-cita (rating 1-5)
      const ratingsPostCita = encuestasPostCita.filter(e => e.rating).map(e => e.rating);
      const promedioRating = ratingsPostCita.length > 0
        ? (ratingsPostCita.reduce((a: number, b: number) => a + b, 0) / ratingsPostCita.length).toFixed(1)
        : null;

      // NPS Score
      const scoresNPS = encuestasNPS.filter(e => e.nps_score !== null).map(e => e.nps_score);
      const promedioNPS = scoresNPS.length > 0
        ? Math.round(scoresNPS.reduce((a: number, b: number) => a + b, 0) / scoresNPS.length)
        : null;

      // Promotores, Pasivos, Detractores
      const promotores = scoresNPS.filter(s => s >= 9).length;
      const pasivos = scoresNPS.filter(s => s >= 7 && s < 9).length;
      const detractores = scoresNPS.filter(s => s < 7).length;

      // Calcular NPS real (% promotores - % detractores)
      const npsReal = scoresNPS.length > 0
        ? Math.round(((promotores - detractores) / scoresNPS.length) * 100)
        : null;

      // Emojis según calificación
      const getRatingEmoji = (rating: number) => {
        if (rating >= 4.5) return '⭐⭐⭐⭐⭐';
        if (rating >= 3.5) return '⭐⭐⭐⭐';
        if (rating >= 2.5) return '⭐⭐⭐';
        return '⭐⭐';
      };

      // Insights de encuestas
      if (promedioRating && parseFloat(promedioRating) >= 4.5) {
        insights.push(`⭐ Excelente satisfacción: ${promedioRating}/5`);
      } else if (promedioRating && parseFloat(promedioRating) < 3.5) {
        insights.push(`💡 Mejorar satisfacción del cliente`);
      }

      if (npsReal !== null && npsReal >= 50) {
        insights.push(`🌟 NPS excepcional: ${npsReal > 0 ? '+' : ''}${npsReal}`);
      }

      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen mes!';

      const nombreCorto = vendedor.name?.split(' ')[0] || 'Vendedor';

      const msg = `📊 *TU REPORTE MENSUAL*
Hola *${nombreCorto}* 👋
*${nombreMes.toUpperCase()} ${anioReporte}*

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedor/1000000).toFixed(1)}M* ${calcVar(revenueVendedor, revenueVendedorAnt)}
• Cierres: *${cierresCount}* ${calcVar(cierresCount, cierresCountAnt)}
• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*
• Leads: *${leadsCount}* ${calcVar(leadsCount, leadsCountAnt)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasTotal} ${calcVar(citasTotal, citasTotalAnt)}
• Completadas: ${citasCompletadas}
• Show rate: *${showRate}%* ${calcVar(showRate, showRateAnt)}

━━━━━━━━━━━━━━━━━━━━━
📈 *CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierre}%*
• Cita→Cierre: *${convCitaCierre}%*
• Tiempo respuesta: *${tiempoRespuestaStr}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStr}* de ${totalVendedores}
• Aportaste: *${porcentajeEquipo}%* del revenue total
• Revenue equipo: $${(revenueEquipo/1000000).toFixed(1)}M
${encuestasVendedor.length > 0 ? `
━━━━━━━━━━━━━━━━━━━━━
⭐ *SATISFACCIÓN CLIENTES*
━━━━━━━━━━━━━━━━━━━━━
• Encuestas: ${encuestasVendedor.length}${promedioRating ? `\n• Calificación: *${promedioRating}/5* ${getRatingEmoji(parseFloat(promedioRating))}` : ''}${npsReal !== null ? `\n• NPS: *${npsReal > 0 ? '+' : ''}${npsReal}* (${promotores}👍 ${pasivos}😐 ${detractores}👎)` : ''}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN DEL MES*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_¡Éxito en ${meses[mesActual]}!_ 🚀`;

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'reporte_diario',
          pendingKey: 'pending_reporte_diario'
        });
        console.log(`📊 Reporte mensual enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte mensual a ${vendedor.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`✅ Reportes mensuales enviados a ${vendedores.length} vendedores`);
  } catch (e) {
    console.log('Error en reporte mensual vendedores:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteMensualVendedores', stack: (e as Error).stack });
  }
}


// ═══════════════════════════════════════════════════════════════
// REPORTE DIARIO INDIVIDUAL ASESORES HIPOTECARIOS - L-V 7pm
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteDiarioAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: asesores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'asesor')
      .eq('active', true);

    if (!asesores || asesores.length === 0) return;

    const hoy = new Date();
    const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
    const inicioAyer = new Date(inicioHoy); inicioAyer.setDate(inicioAyer.getDate() - 1);
    const finAyer = new Date(finHoy); finAyer.setDate(finAyer.getDate() - 1);

    // Queries (parallelized with Promise.all)
    const [
      { data: hipotecasHoy },
      { data: aprobadasHoy },
      { data: hipotecasAyer },
      { data: pipelineActivo }
    ] = await Promise.all([
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString()),
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioHoy.toISOString()).lte('updated_at', finHoy.toISOString()),
      supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioAyer.toISOString()).lte('created_at', finAyer.toISOString()),
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').in('status', ['pending', 'in_progress', 'sent_to_bank'])
    ]);

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };
    const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

    for (const asesor of asesores) {
      try {
        if (!asesor.phone || asesor.is_active === false) continue;

        const nuevasHoy = hipotecasHoy?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const aprobadasAsesorHoy = aprobadasHoy?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const nuevasAyer = hipotecasAyer?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const pipelineAsesor = pipelineActivo?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const pendientes = pipelineAsesor.filter(h => h.status === 'pending').length;
        const enProceso = pipelineAsesor.filter(h => h.status === 'in_progress').length;
        const enBanco = pipelineAsesor.filter(h => h.status === 'sent_to_bank').length;

        const insights: string[] = [];
        if (aprobadasAsesorHoy.length > 0) insights.push(`🎉 ¡${aprobadasAsesorHoy.length} hipoteca${aprobadasAsesorHoy.length > 1 ? 's' : ''} aprobada${aprobadasAsesorHoy.length > 1 ? 's' : ''} hoy!`);
        if (nuevasHoy.length > nuevasAyer.length && nuevasHoy.length > 0) insights.push(`📈 Más solicitudes que ayer: ${nuevasAyer.length}→${nuevasHoy.length}`);
        if (pendientes > 3) insights.push(`📋 ${pendientes} solicitudes pendientes de revisar`);
        if (enBanco > 0) insights.push(`🏦 ${enBanco} en banco - dar seguimiento`);
        const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen trabajo hoy!';
        const nombreCorto = asesor.name?.split(' ')[0] || 'Asesor';

        const msg = `📊 *TU RESUMEN DEL DÍA*\nHola *${nombreCorto}* 👋\n_${fechaHoy}_\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes nuevas: *${nuevasHoy.length}* ${calcVar(nuevasHoy.length, nuevasAyer.length)}\n• Aprobadas: *${aprobadasAsesorHoy.length}* ${aprobadasAsesorHoy.length > 0 ? '🎉' : ''}\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *TU PIPELINE*\n━━━━━━━━━━━━━━━━━━━━━\n• Pendientes: ${pendientes}\n• En proceso: ${enProceso}\n• En banco: ${enBanco}\n• Total activo: *${pipelineAsesor.length}*\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Descansa y mañana con todo!_ 🚀`;

        // ═══ USAR HELPER QUE RESPETA VENTANA 24H ═══
        const templateParams = [
          nombreCorto,
          `${nuevasHoy.length}`,
          `${aprobadasAsesorHoy.length}`,
          `${pipelineAsesor.length} expedientes`
        ];

        const resultado = await enviarMensajeTeamMember(supabase, meta, asesor, msg, {
          tipoMensaje: 'reporte_diario_asesor',
          guardarPending: true,
          pendingKey: 'pending_reporte_diario',
          templateOverride: {
            name: 'resumen_asesor_v2',
            params: templateParams
          }
        });

        if (resultado.success) {
          console.log(`📊 Reporte diario asesor ${resultado.method === 'direct' ? 'enviado' : 'template+pending'} a ${asesor.name}`);
        } else {
          console.log(`❌ Error enviando reporte diario a ${asesor.name}`);
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        console.error(`❌ Error procesando reporte diario asesor ${asesor.name || asesor.id}:`, error);
        continue;
      }
    }
    console.log(`✅ Reportes diarios procesados para ${asesores.length} asesores`);
  } catch (e) {
    console.log('Error en reporte diario asesores:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteDiarioAsesores', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE SEMANAL INDIVIDUAL ASESORES HIPOTECARIOS - Lunes 9am
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteSemanalAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: asesores } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
    if (!asesores || asesores.length === 0) return;

    const hoy = new Date();
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7); inicioSemana.setHours(0, 0, 0, 0);
    const finSemana = new Date(hoy); finSemana.setHours(23, 59, 59, 999);
    const inicioSemAnt = new Date(inicioSemana); inicioSemAnt.setDate(inicioSemAnt.getDate() - 7);
    const finSemAnt = new Date(inicioSemana); finSemAnt.setDate(finSemAnt.getDate() - 1); finSemAnt.setHours(23, 59, 59, 999);

    // Queries (parallelized with Promise.all)
    const [
      { data: hipotecasSemana },
      { data: aprobadasSemana },
      { data: rechazadasSemana },
      { data: hipotecasSemAnt },
      { data: aprobadasSemAnt },
      { data: pipelineActivo }
    ] = await Promise.all([
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioSemana.toISOString()).lte('created_at', finSemana.toISOString()),
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioSemana.toISOString()).lte('updated_at', finSemana.toISOString()),
      supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'rejected').gte('updated_at', inicioSemana.toISOString()).lte('updated_at', finSemana.toISOString()),
      supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioSemAnt.toISOString()).lte('created_at', finSemAnt.toISOString()),
      supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioSemAnt.toISOString()).lte('updated_at', finSemAnt.toISOString()),
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').in('status', ['pending', 'in_progress', 'sent_to_bank'])
    ]);

    const asesoresConAprobaciones = asesores.map(a => ({ ...a, aprobaciones: (aprobadasSemana?.filter(h => h.assigned_advisor_id === a.id) || []).length })).sort((a, b) => b.aprobaciones - a.aprobaciones);
    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    for (const asesor of asesores) {
      try {
        if (!asesor.phone || asesor.is_active === false) continue;

        const nuevasSem = hipotecasSemana?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const aprobadasAsesor = aprobadasSemana?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const rechazadasAsesor = rechazadasSemana?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const nuevasSemAnt = hipotecasSemAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const aprobadasAnt = aprobadasSemAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const pipelineAsesor = pipelineActivo?.filter(h => h.assigned_advisor_id === asesor.id) || [];
        const tasaAprobacion = (aprobadasAsesor.length + rechazadasAsesor.length) > 0 ? Math.round((aprobadasAsesor.length / (aprobadasAsesor.length + rechazadasAsesor.length)) * 100) : 0;
        const posicion = asesoresConAprobaciones.findIndex(a => a.id === asesor.id) + 1;
        const medallas = ['🥇', '🥈', '🥉'];
        const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;

        const insights: string[] = [];
        if (aprobadasAsesor.length > aprobadasAnt.length && aprobadasAnt.length > 0) insights.push(`🚀 Aprobaciones crecieron ${Math.round(((aprobadasAsesor.length - aprobadasAnt.length) / aprobadasAnt.length) * 100)}% vs semana anterior`);
        if (posicion === 1) insights.push(`🏆 ¡Fuiste el #1 del equipo!`);
        else if (posicion <= 3) insights.push(`🎯 Top 3 del equipo`);
        if (tasaAprobacion >= 70) insights.push(`✅ Excelente tasa de aprobación: ${tasaAprobacion}%`);
        const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buena semana!';
        const nombreCorto = asesor.name?.split(' ')[0] || 'Asesor';

        const msg = `📊 *TU REPORTE SEMANAL*\nHola *${nombreCorto}* 👋\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *ESTA SEMANA*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes nuevas: *${nuevasSem.length}* ${calcVar(nuevasSem.length, nuevasSemAnt.length)}\n• Aprobadas: *${aprobadasAsesor.length}* ${calcVar(aprobadasAsesor.length, aprobadasAnt.length)}\n• Rechazadas: ${rechazadasAsesor.length}\n• Tasa aprobación: *${tasaAprobacion}%*\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *PIPELINE ACTIVO*\n━━━━━━━━━━━━━━━━━━━━━\n• Pendientes: ${pipelineAsesor.filter(h => h.status === 'pending').length}\n• En proceso: ${pipelineAsesor.filter(h => h.status === 'in_progress').length}\n• En banco: ${pipelineAsesor.filter(h => h.status === 'sent_to_bank').length}\n• Total: *${pipelineAsesor.length}*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING EQUIPO*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStr}* de ${asesoresConAprobaciones.length}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito esta semana!_ 🚀`;

        // ═══ USAR HELPER QUE RESPETA VENTANA 24H ═══
        const resultado = await enviarMensajeTeamMember(supabase, meta, asesor, msg, {
          tipoMensaje: 'reporte_semanal_asesor',
          guardarPending: true,
          pendingKey: 'pending_reporte_semanal'
        });

        if (resultado.success) {
          console.log(`📊 Reporte semanal asesor ${resultado.method === 'direct' ? 'enviado' : 'template+pending'} a ${asesor.name}`);
        } else {
          console.log(`❌ Error enviando reporte semanal a ${asesor.name}`);
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        console.error(`❌ Error procesando reporte semanal asesor ${asesor.name || asesor.id}:`, error);
        continue;
      }
    }
    console.log(`✅ Reportes semanales procesados para ${asesores.length} asesores`);
  } catch (e) {
    console.log('Error en reporte semanal asesores:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteSemanalAsesores', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL INDIVIDUAL ASESORES HIPOTECARIOS - Día 1 9am
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteMensualAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: asesores } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
    if (!asesores || asesores.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;
    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    const [
      { data: hipotecasMes },
      { data: aprobadasMes },
      { data: rechazadasMes },
      { data: hipotecasMesAnt },
      { data: aprobadasMesAnt }
    ] = await Promise.all([
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioMesReporte.toISOString()).lte('created_at', finMesReporte.toISOString()),
      supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioMesReporte.toISOString()).lte('updated_at', finMesReporte.toISOString()),
      supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'rejected').gte('updated_at', inicioMesReporte.toISOString()).lte('updated_at', finMesReporte.toISOString()),
      supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioMesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString()),
      supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioMesAnterior.toISOString()).lte('updated_at', finMesAnterior.toISOString())
    ]);

    const asesoresConAprobaciones = asesores.map(a => ({ ...a, aprobaciones: (aprobadasMes?.filter(h => h.assigned_advisor_id === a.id) || []).length })).sort((a, b) => b.aprobaciones - a.aprobaciones);
    const totalAprobacionesEquipo = aprobadasMes?.length || 0;
    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    for (const asesor of asesores) {
      if (!asesor.phone || asesor.is_active === false) continue;

      const nuevasMes = hipotecasMes?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const aprobadasAsesor = aprobadasMes?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const rechazadasAsesor = rechazadasMes?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const nuevasMesAnt = hipotecasMesAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const aprobadasAnt = aprobadasMesAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const tasaAprobacion = (aprobadasAsesor.length + rechazadasAsesor.length) > 0 ? Math.round((aprobadasAsesor.length / (aprobadasAsesor.length + rechazadasAsesor.length)) * 100) : 0;
      const posicion = asesoresConAprobaciones.findIndex(a => a.id === asesor.id) + 1;
      const medallas = ['🥇', '🥈', '🥉'];
      const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;
      const porcentajeEquipo = totalAprobacionesEquipo > 0 ? Math.round((aprobadasAsesor.length / totalAprobacionesEquipo) * 100) : 0;

      const insights: string[] = [];
      if (aprobadasAsesor.length > aprobadasAnt.length && aprobadasAnt.length > 0) insights.push(`🚀 Aprobaciones crecieron ${Math.round(((aprobadasAsesor.length - aprobadasAnt.length) / aprobadasAnt.length) * 100)}% vs mes anterior`);
      else if (aprobadasAsesor.length < aprobadasAnt.length && aprobadasAnt.length > 0) insights.push(`📉 Aprobaciones bajaron vs mes anterior`);
      if (posicion === 1) insights.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicion <= 3) insights.push(`🎯 Top 3 del equipo`);
      if (tasaAprobacion >= 70) insights.push(`✅ Excelente tasa de aprobación: ${tasaAprobacion}%`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen mes!';
      const nombreCorto = asesor.name?.split(' ')[0] || 'Asesor';

      const msg = `📊 *TU REPORTE MENSUAL*\nHola *${nombreCorto}* 👋\n*${nombreMes.toUpperCase()} ${anioReporte}*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *TUS RESULTADOS*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes: *${nuevasMes.length}* ${calcVar(nuevasMes.length, nuevasMesAnt.length)}\n• Aprobadas: *${aprobadasAsesor.length}* ${calcVar(aprobadasAsesor.length, aprobadasAnt.length)}\n• Rechazadas: ${rechazadasAsesor.length}\n• Tasa aprobación: *${tasaAprobacion}%*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING EQUIPO*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStr}* de ${asesoresConAprobaciones.length}\n• Aportaste: *${porcentajeEquipo}%* de aprobaciones\n• Total equipo: ${totalAprobacionesEquipo} aprobadas\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN DEL MES*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito en ${meses[mesActual]}!_ 🚀`;

      try {
        await enviarMensajeTeamMember(supabase, meta, asesor, msg, {
          tipoMensaje: 'reporte_diario',
          pendingKey: 'pending_reporte_diario'
        });
        console.log(`📊 Reporte mensual asesor enviado a ${asesor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte mensual a ${asesor.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes mensuales enviados a ${asesores.length} asesores`);
  } catch (e) {
    console.log('Error en reporte mensual asesores:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteMensualAsesores', stack: (e as Error).stack });
  }
}


// ═══════════════════════════════════════════════════════════════
// REPORTE DIARIO MARKETING - L-V 7pm
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteDiarioMarketing(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: marketing } = await supabase.client.from('team_members').select('*').eq('role', 'marketing').eq('active', true);
    if (!marketing || marketing.length === 0) return;

    const hoy = new Date();
    const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
    const inicioAyer = new Date(inicioHoy); inicioAyer.setDate(inicioAyer.getDate() - 1);
    const finAyer = new Date(finHoy); finAyer.setDate(finAyer.getDate() - 1);

    // Queries (parallelized with Promise.all)
    const [
      { data: leadsHoy },
      { data: leadsAyer },
      { data: citasHoy },
      { data: cierresHoy }
    ] = await Promise.all([
      supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString()),
      supabase.client.from('leads').select('id, source').gte('created_at', inicioAyer.toISOString()).lte('created_at', finAyer.toISOString()),
      supabase.client.from('appointments').select('*').eq('scheduled_date', inicioHoy.toISOString().split('T')[0]),
      supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioHoy.toISOString()).lte('status_changed_at', finHoy.toISOString())
    ]);

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };
    const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

    // Leads por fuente
    const fuenteHoy: Record<string, number> = {};
    const fuenteAyer: Record<string, number> = {};
    leadsHoy?.forEach(l => { const f = l.source || 'Directo'; fuenteHoy[f] = (fuenteHoy[f] || 0) + 1; });
    leadsAyer?.forEach(l => { const f = l.source || 'Directo'; fuenteAyer[f] = (fuenteAyer[f] || 0) + 1; });
    const topFuentes = Object.entries(fuenteHoy).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Citas agendadas hoy
    const citasAgendadas = citasHoy?.filter(c => c.status === 'scheduled').length || 0;
    const citasCompletadas = citasHoy?.filter(c => c.status === 'completed').length || 0;

    // Revenue del día
    let revenueHoy = 0;
    cierresHoy?.forEach(c => revenueHoy += c.properties?.price || 2000000);

    // Conversión leads->cita
    const convLeadCita = (leadsHoy?.length || 0) > 0 ? Math.round((citasAgendadas / (leadsHoy?.length || 1)) * 100) : 0;

    for (const mkt of marketing) {
      if (!mkt.phone) continue;

      const fuentesStr = topFuentes.length > 0 
        ? topFuentes.map(([f, c]) => `  • ${f}: ${c} ${calcVar(c, fuenteAyer[f] || 0)}`).join('\n')
        : '  Sin leads hoy';

      const insights: string[] = [];
      if ((leadsHoy?.length || 0) > (leadsAyer?.length || 0)) insights.push(`📈 +${(leadsHoy?.length || 0) - (leadsAyer?.length || 0)} leads vs ayer`);
      if (cierresHoy && cierresHoy.length > 0) insights.push(`🎉 ${cierresHoy.length} cierre${cierresHoy.length > 1 ? 's' : ''} hoy!`);
      if (convLeadCita >= 30) insights.push(`✅ Buena conversión lead→cita: ${convLeadCita}%`);
      const mejorFuente = topFuentes[0];
      if (mejorFuente && mejorFuente[1] >= 3) insights.push(`🔥 ${mejorFuente[0]} fue la mejor fuente`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen día de marketing!';
      const nombreCorto = mkt.name?.split(' ')[0] || 'Marketing';

      const msg = `📊 *REPORTE DIARIO MARKETING*\nHola *${nombreCorto}* 👋\n_${fechaHoy}_\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *LEADS HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Total: *${leadsHoy?.length || 0}* ${calcVar(leadsHoy?.length || 0, leadsAyer?.length || 0)}\n• Conv. lead→cita: *${convLeadCita}%*\n${cierresHoy && cierresHoy.length > 0 ? `• Revenue: *$${(revenueHoy/1000000).toFixed(1)}M*\n` : ''}\n━━━━━━━━━━━━━━━━━━━━━\n📍 *POR FUENTE*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n📅 *CITAS*\n━━━━━━━━━━━━━━━━━━━━━\n• Agendadas: ${citasAgendadas}\n• Completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Mañana seguimos!_ 🚀`;

      try {
        await enviarMensajeTeamMember(supabase, meta, mkt, msg, {
          tipoMensaje: 'reporte_diario',
          pendingKey: 'pending_reporte_diario'
        });
        console.log(`📊 Reporte diario marketing enviado a ${mkt.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${mkt.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes diarios enviados a ${marketing.length} de marketing`);
  } catch (e) {
    console.log('Error en reporte diario marketing:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteDiarioMarketing', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE SEMANAL MARKETING - Lunes 9am
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteSemanalMarketing(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: marketing } = await supabase.client.from('team_members').select('*').eq('role', 'marketing').eq('active', true);
    if (!marketing || marketing.length === 0) return;

    const hoy = new Date();
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7); inicioSemana.setHours(0, 0, 0, 0);
    const finSemana = new Date(hoy); finSemana.setHours(23, 59, 59, 999);
    const inicioSemAnt = new Date(inicioSemana); inicioSemAnt.setDate(inicioSemAnt.getDate() - 7);
    const finSemAnt = new Date(inicioSemana); finSemAnt.setDate(finSemAnt.getDate() - 1); finSemAnt.setHours(23, 59, 59, 999);

    // Queries (parallelized with Promise.all)
    const [
      { data: leadsSemana },
      { data: leadsSemAnt },
      { data: citasSemana },
      { data: cierresSemana },
      { data: cierresSemAnt }
    ] = await Promise.all([
      supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioSemana.toISOString()).lte('created_at', finSemana.toISOString()),
      supabase.client.from('leads').select('id, source').gte('created_at', inicioSemAnt.toISOString()).lte('created_at', finSemAnt.toISOString()),
      supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]).lte('scheduled_date', finSemana.toISOString().split('T')[0]),
      supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString()).lte('status_changed_at', finSemana.toISOString()),
      supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemAnt.toISOString()).lte('status_changed_at', finSemAnt.toISOString())
    ]);

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    // Leads por fuente
    const fuenteSemana: Record<string, {leads: number, citas: number, cierres: number}> = {};
    leadsSemana?.forEach(l => {
      const f = l.source || 'Directo';
      if (!fuenteSemana[f]) fuenteSemana[f] = {leads: 0, citas: 0, cierres: 0};
      fuenteSemana[f].leads++;
    });

    // Citas por fuente (basado en lead_id)
    const leadIds = new Set(leadsSemana?.map(l => l.id) || []);
    citasSemana?.forEach(c => {
      if (leadIds.has(c.lead_id)) {
        const lead = leadsSemana?.find(l => l.id === c.lead_id);
        const f = lead?.source || 'Directo';
        if (fuenteSemana[f]) fuenteSemana[f].citas++;
      }
    });

    // Cierres por fuente
    cierresSemana?.forEach(c => {
      const f = c.source || 'Directo';
      if (fuenteSemana[f]) fuenteSemana[f].cierres++;
    });

    const topFuentes = Object.entries(fuenteSemana).sort((a, b) => b[1].leads - a[1].leads).slice(0, 5);

    // Revenue
    let revenueSemana = 0;
    let revenueSemAnt = 0;
    cierresSemana?.forEach(c => revenueSemana += c.properties?.price || 2000000);
    cierresSemAnt?.forEach(c => revenueSemAnt += c.properties?.price || 2000000);

    // Conversiones globales
    const citasTotal = citasSemana?.length || 0;
    const citasCompletadas = citasSemana?.filter(c => c.status === 'completed').length || 0;
    const convLeadCita = (leadsSemana?.length || 0) > 0 ? Math.round((citasTotal / (leadsSemana?.length || 1)) * 100) : 0;
    const convCitaCierre = citasCompletadas > 0 ? Math.round(((cierresSemana?.length || 0) / citasCompletadas) * 100) : 0;

    for (const mkt of marketing) {
      if (!mkt.phone) continue;

      const fuentesStr = topFuentes.length > 0
        ? topFuentes.map(([f, data]) => {
            const conv = data.leads > 0 ? Math.round((data.cierres / data.leads) * 100) : 0;
            return `  • ${f}: ${data.leads} leads → ${data.cierres} cierres (${conv}%)`;
          }).join('\n')
        : '  Sin datos';

      const insights: string[] = [];
      if ((leadsSemana?.length || 0) > (leadsSemAnt?.length || 0)) {
        const pct = Math.round((((leadsSemana?.length || 0) - (leadsSemAnt?.length || 0)) / (leadsSemAnt?.length || 1)) * 100);
        insights.push(`📈 Leads crecieron ${pct}% vs semana anterior`);
      }
      if (revenueSemana > revenueSemAnt && revenueSemAnt > 0) insights.push(`💰 Revenue creció vs semana anterior`);
      const mejorFuente = topFuentes.find(([f, d]) => d.cierres > 0);
      if (mejorFuente) insights.push(`🏆 Mejor fuente: ${mejorFuente[0]}`);
      if (convLeadCita >= 25) insights.push(`✅ Buena conversión lead→cita: ${convLeadCita}%`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buena semana!';
      const nombreCorto = mkt.name?.split(' ')[0] || 'Marketing';

      const msg = `📊 *REPORTE SEMANAL MARKETING*\nHola *${nombreCorto}* 👋\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *ESTA SEMANA*\n━━━━━━━━━━━━━━━━━━━━━\n• Leads: *${leadsSemana?.length || 0}* ${calcVar(leadsSemana?.length || 0, leadsSemAnt?.length || 0)}\n• Cierres: *${cierresSemana?.length || 0}* ${calcVar(cierresSemana?.length || 0, cierresSemAnt?.length || 0)}\n• Revenue: *$${(revenueSemana/1000000).toFixed(1)}M* ${calcVar(revenueSemana, revenueSemAnt)}\n\n━━━━━━━━━━━━━━━━━━━━━\n📈 *CONVERSIONES*\n━━━━━━━━━━━━━━━━━━━━━\n• Lead→Cita: *${convLeadCita}%*\n• Cita→Cierre: *${convCitaCierre}%*\n• Citas completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n📍 *PERFORMANCE POR FUENTE*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito esta semana!_ 🚀`;

      try {
        await enviarMensajeTeamMember(supabase, meta, mkt, msg, {
          tipoMensaje: 'resumen_semanal',
          pendingKey: 'pending_resumen_semanal'
        });
        console.log(`📊 Reporte semanal marketing enviado a ${mkt.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${mkt.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes semanales enviados a ${marketing.length} de marketing`);
  } catch (e) {
    console.log('Error en reporte semanal marketing:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteSemanalMarketing', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL MARKETING - Día 1 9am
// ═══════════════════════════════════════════════════════════════

export async function enviarReporteMensualMarketing(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: marketing } = await supabase.client.from('team_members').select('*').eq('role', 'marketing').eq('active', true);
    if (!marketing || marketing.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;
    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    // Queries (parallelized with Promise.all)
    const [
      { data: leadsMes },
      { data: leadsMesAnt },
      { data: citasMes },
      { data: cierresMes },
      { data: cierresMesAnt }
    ] = await Promise.all([
      supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioMesReporte.toISOString()).lte('created_at', finMesReporte.toISOString()),
      supabase.client.from('leads').select('id, source').gte('created_at', inicioMesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString()),
      supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0]).lte('scheduled_date', finMesReporte.toISOString().split('T')[0]),
      supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesReporte.toISOString()).lte('status_changed_at', finMesReporte.toISOString()),
      supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesAnterior.toISOString()).lte('status_changed_at', finMesAnterior.toISOString())
    ]);

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    // Leads por fuente con conversiones
    const fuenteMes: Record<string, {leads: number, cierres: number, revenue: number}> = {};
    leadsMes?.forEach(l => {
      const f = l.source || 'Directo';
      if (!fuenteMes[f]) fuenteMes[f] = {leads: 0, cierres: 0, revenue: 0};
      fuenteMes[f].leads++;
    });
    cierresMes?.forEach(c => {
      const f = c.source || 'Directo';
      if (!fuenteMes[f]) fuenteMes[f] = {leads: 0, cierres: 0, revenue: 0};
      fuenteMes[f].cierres++;
      fuenteMes[f].revenue += c.properties?.price || 2000000;
    });

    const topFuentes = Object.entries(fuenteMes).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);

    // Totales
    let revenueMes = 0;
    let revenueMesAnt = 0;
    cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
    cierresMesAnt?.forEach(c => revenueMesAnt += c.properties?.price || 2000000);

    const citasTotal = citasMes?.length || 0;
    const citasCompletadas = citasMes?.filter(c => c.status === 'completed').length || 0;
    const convLeadCita = (leadsMes?.length || 0) > 0 ? Math.round((citasTotal / (leadsMes?.length || 1)) * 100) : 0;
    const convLeadCierre = (leadsMes?.length || 0) > 0 ? Math.round(((cierresMes?.length || 0) / (leadsMes?.length || 1)) * 100) : 0;
    const ticketPromedio = (cierresMes?.length || 0) > 0 ? revenueMes / (cierresMes?.length || 1) : 0;

    for (const mkt of marketing) {
      if (!mkt.phone) continue;

      const fuentesStr = topFuentes.length > 0
        ? topFuentes.map(([f, data]) => {
            const conv = data.leads > 0 ? Math.round((data.cierres / data.leads) * 100) : 0;
            return `  • ${f}\n    ${data.leads} leads → ${data.cierres} cierres (${conv}%)\n    Revenue: $${(data.revenue/1000000).toFixed(1)}M`;
          }).join('\n')
        : '  Sin datos';

      const insights: string[] = [];
      if ((leadsMes?.length || 0) > (leadsMesAnt?.length || 0) && (leadsMesAnt?.length || 0) > 0) {
        const pct = Math.round((((leadsMes?.length || 0) - (leadsMesAnt?.length || 0)) / (leadsMesAnt?.length || 1)) * 100);
        insights.push(`📈 Leads crecieron ${pct}% vs mes anterior`);
      } else if ((leadsMes?.length || 0) < (leadsMesAnt?.length || 0)) {
        insights.push(`📉 Leads bajaron vs mes anterior`);
      }
      if (revenueMes > revenueMesAnt && revenueMesAnt > 0) {
        const pct = Math.round(((revenueMes - revenueMesAnt) / revenueMesAnt) * 100);
        insights.push(`💰 Revenue creció ${pct}%`);
      }
      const mejorFuente = topFuentes[0];
      if (mejorFuente && mejorFuente[1].revenue > 0) insights.push(`🏆 Mejor ROI: ${mejorFuente[0]}`);
      if (convLeadCierre >= 5) insights.push(`✅ Conversión lead→cierre: ${convLeadCierre}%`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen mes!';
      const nombreCorto = mkt.name?.split(' ')[0] || 'Marketing';

      const msg = `📊 *REPORTE MENSUAL MARKETING*\nHola *${nombreCorto}* 👋\n*${nombreMes.toUpperCase()} ${anioReporte}*\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *RESULTADOS DEL MES*\n━━━━━━━━━━━━━━━━━━━━━\n• Leads: *${leadsMes?.length || 0}* ${calcVar(leadsMes?.length || 0, leadsMesAnt?.length || 0)}\n• Cierres: *${cierresMes?.length || 0}* ${calcVar(cierresMes?.length || 0, cierresMesAnt?.length || 0)}\n• Revenue: *$${(revenueMes/1000000).toFixed(1)}M* ${calcVar(revenueMes, revenueMesAnt)}\n• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*\n\n━━━━━━━━━━━━━━━━━━━━━\n📈 *CONVERSIONES*\n━━━━━━━━━━━━━━━━━━━━━\n• Lead→Cita: *${convLeadCita}%*\n• Lead→Cierre: *${convLeadCierre}%*\n• Citas totales: ${citasTotal}\n• Citas completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n📍 *TOP FUENTES (por revenue)*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito en ${meses[mesActual]}!_ 🚀`;

      try {
        await enviarMensajeTeamMember(supabase, meta, mkt, msg, {
          tipoMensaje: 'reporte_diario',
          pendingKey: 'pending_reporte_diario'
        });
        console.log(`📊 Reporte mensual marketing enviado a ${mkt.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${mkt.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes mensuales enviados a ${marketing.length} de marketing`);
  } catch (e) {
    console.log('Error en reporte mensual marketing:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarReporteMensualMarketing', stack: (e as Error).stack });
  }
}



// ═══════════════════════════════════════════════════════════════════════════
// ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS (día 1 de cada mes a las 12:01 AM)
// Todos los desarrollos suben 0.5% mensual (6% anual)
// ═══════════════════════════════════════════════════════════════════════════
const INCREMENTO_MENSUAL = 0.005; // 0.5% mensual = 6% anual

export async function aplicarPreciosProgramados(supabase: SupabaseService, meta: MetaWhatsAppService, env?: { API_SECRET?: string; SARA_CACHE?: KVNamespace; DEV_PHONE?: string }): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════════
  // ACTUALIZACIÓN MENSUAL DE PRECIOS - Día 1 de cada mes a las 12:00 AM México
  // Incrementa 0.5% mensual (6% anual) TODOS los campos de precio
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const hoy = new Date();
    const mesActual = hoy.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
    const mesKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const idempotencyKey = `precio_aplicado_${mesKey}`;

    // ── IDEMPOTENCY CHECK (KV primary, DB fallback) ──
    // Si ya se aplicó este mes, no volver a aplicar (previene doble incremento si CRON corre 2 veces)
    const kvIdempKey = `price_increase_${mesKey}`;
    if (env?.SARA_CACHE) {
      const kvCheck = await env.SARA_CACHE.get(kvIdempKey);
      if (kvCheck) {
        console.log(`⏭️ Precios ya aplicados para ${mesKey} (KV), saltando`);
        return;
      }
    }
    try {
      const { data: yaAplicado } = await supabase.client
        .from('system_config')
        .select('value')
        .eq('key', idempotencyKey)
        .maybeSingle();
      if (yaAplicado) {
        console.log(`⏭️ Precios ya aplicados para ${mesKey} (DB), saltando`);
        return;
      }
    } catch (_) {
      // system_config table may not exist — KV check above is primary
    }

    // ── MARCAR ANTES DE APLICAR (mark-before-send pattern) ──
    if (env?.SARA_CACHE) {
      await env.SARA_CACHE.put(kvIdempKey, new Date().toISOString(), { expirationTtl: 86400 * 45 }); // 45 days
    }
    try {
      await supabase.client
        .from('system_config')
        .upsert({ key: idempotencyKey, value: new Date().toISOString() }, { onConflict: 'key' });
    } catch (_) {
      // system_config table may not exist — KV is primary
    }

    // Obtener TODAS las propiedades con campos de precio existentes
    const { data: propiedades, error } = await supabase.client
      .from('properties')
      .select('id, name, development, price, price_equipped');

    if (error || !propiedades || propiedades.length === 0) {
      console.error('⚠️ Error obteniendo propiedades:', error?.message);
      // Clear KV idempotency so it can retry next time
      if (env?.SARA_CACHE) await env.SARA_CACHE.delete(kvIdempKey);
      return;
    }

    console.log(`💰 Aplicando aumento del ${INCREMENTO_MENSUAL * 100}% a ${propiedades.length} propiedades...`);

    let aplicados = 0;
    let fallidos = 0;
    const resumen: string[] = [];
    const errores: string[] = [];

    for (const prop of propiedades) {
      try {
        const precioAnterior = Number(prop.price) || 0;
        const precioEquipadoAnterior = Number(prop.price_equipped) || 0;

        // Calcular nuevos precios (redondear a enteros)
        const nuevoPrecio = precioAnterior > 0 ? Math.round(precioAnterior * (1 + INCREMENTO_MENSUAL)) : null;
        const nuevoPrecioEquipado = precioEquipadoAnterior > 0 ? Math.round(precioEquipadoAnterior * (1 + INCREMENTO_MENSUAL)) : null;

        // Actualizar campos de precio en DB
        const updateData: Record<string, any> = {};
        if (nuevoPrecio !== null) updateData.price = nuevoPrecio;
        if (nuevoPrecioEquipado !== null) updateData.price_equipped = nuevoPrecioEquipado;
        if (Object.keys(updateData).length === 0) continue;

        const { error: updateError } = await supabase.client
          .from('properties')
          .update(updateData)
          .eq('id', prop.id);

        if (updateError) {
          fallidos++;
          errores.push(`${prop.name}: ${updateError.message}`);
          console.error(`❌ Error actualizando ${prop.name}:`, updateError.message);
        } else {
          aplicados++;
        }

        // Guardar para resumen (solo primeros 3 por desarrollo)
        const precioMostrar = precioAnterior;
        const nuevoPrecioMostrar = nuevoPrecio;
        if (precioMostrar && !resumen.some(r => r.includes(prop.development))) {
          resumen.push(`• ${prop.development}: ${prop.name} $${(precioMostrar/1000000).toFixed(2)}M → $${(nuevoPrecioMostrar!/1000000).toFixed(2)}M`);
        }
      } catch (e) {
        fallidos++;
        errores.push(`${prop.name}: ${(e as Error).message}`);
        console.error(`❌ Error actualizando ${prop.name}:`, e);
      }
    }

    // Registrar en historial (si existe la tabla)
    try {
      await supabase.client
        .from('price_history')
        .insert({
          fecha: hoy.toISOString().split('T')[0],
          incremento_porcentaje: INCREMENTO_MENSUAL * 100,
          propiedades_actualizadas: aplicados,
          notas: `Aumento automático ${mesActual}${fallidos > 0 ? ` (${fallidos} fallidos)` : ''}`
        });
    } catch (e) {
      // Tabla price_history no existe, ignorar
    }

    // ── ACTUALIZAR RETELL ──
    let retellOk = false;
    if (env?.API_SECRET) {
      try {
        const retellResp = await fetch(
          `https://sara-backend.edson-633.workers.dev/configure-retell-tools?api_key=${env.API_SECRET}`
        );
        if (retellResp.ok) {
          retellOk = true;
          console.log('🤖 Retell actualizado con nuevos precios');
        } else {
          const retellBody = await retellResp.text();
          console.error('⚠️ Error actualizando Retell:', retellResp.status, retellBody);
          // Alertar al dev sobre fallo de Retell
          await enviarAlertaSistema(meta, `⚠️ Retell NO se actualizó después del incremento de precios (HTTP ${retellResp.status}): ${retellBody.slice(0, 200)}`, env, `retell_price_update_fail_${mesKey}`);
        }
      } catch (e) {
        console.error('⚠️ Error actualizando Retell:', e);
        await enviarAlertaSistema(meta, `⚠️ Retell NO se actualizó después del incremento de precios: ${(e as Error).message}`, env, `retell_price_update_fail_${mesKey}`);
      }
    }

    // Alertar si hubo fallos en propiedades
    if (fallidos > 0) {
      await enviarAlertaSistema(meta, `⚠️ Incremento de precios ${mesActual}: ${fallidos}/${propiedades.length} propiedades FALLARON.\n${errores.slice(0, 5).join('\n')}`, env, `price_update_fail_${mesKey}`);
    }

    // Notificar al CEO/Admin con info PRECISA
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('phone')
      .in('role', ['ceo', 'admin'])
      .eq('active', true);

    if (admins && admins.length > 0 && aplicados > 0) {
      const statusRetell = retellOk ? '✅ Retell actualizado' : '⚠️ Retell NO se actualizó';
      const statusFallos = fallidos > 0 ? `\n⚠️ ${fallidos} propiedades fallaron` : '';

      const mensaje = `💰 *AUMENTO DE PRECIOS ${mesActual.toUpperCase()}*

Se aplicó el incremento mensual del ${INCREMENTO_MENSUAL * 100}% a ${aplicados} propiedades.${statusFallos}

*Ejemplos:*
${resumen.slice(0, 5).join('\n')}

${statusRetell}
✅ Brochures dinámicos (siempre actualizados).`;

      for (const admin of admins) {
        try {
          if (admin.phone) {
            await enviarMensajeTeamMember(supabase, meta, admin, mensaje, {
              tipoMensaje: 'notificacion',
              pendingKey: 'pending_mensaje'
            });
          }
        } catch (error) {
          console.error(`❌ Error notificando aumento precios a admin:`, error);
          continue;
        }
      }
    }

    console.log(`💰 Aumento aplicado: ${aplicados}/${propiedades.length} propiedades (+${INCREMENTO_MENSUAL * 100}%)${fallidos > 0 ? `, ${fallidos} fallidos` : ''}`);
  } catch (e) {
    console.error('Error aplicando aumento de precios:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'aplicarPreciosProgramados', stack: (e as Error).stack });
  }
}

