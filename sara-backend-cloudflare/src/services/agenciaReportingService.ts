// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MÓDULO: agenciaReportingService - Reportes de Marketing/Agencia
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Centraliza la lógica de reportes de marketing:
// - Campañas activas y métricas
// - CPL por plataforma
// - ROI de marketing
// - Leads por fuente
// - Mejor/peor campaña
// - Segmentación de leads
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { SupabaseService } from './supabase';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number;
  budget_spent: number;
  leads_generated: number;
  leads_count?: number;
  created_at: string;
}

export interface CampaignWithCPL extends Campaign {
  cpl: number;
}

export interface PlatformMetrics {
  platform: string;
  gasto: number;
  leads: number;
  cpl: number;
}

export interface SourceMetrics {
  fuente: string;
  total: number;
  hot: number;
  conversion: number;
}

export interface SegmentCounts {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  nuevos: number;
  visitados: number;
  negociacion: number;
  compradores: number;
  caidos: number;
  desarrollos: Array<{ nombre: string; count: number }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLASE PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class AgenciaReportingService {
  constructor(private supabase: SupabaseService) {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CAMPAÑAS ACTIVAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getCampanasActivas(): Promise<{ campanas: Campaign[]; mensaje: string }> {
    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!campanas || campanas.length === 0) {
      return { campanas: [], mensaje: 'No hay campañas activas en este momento.' };
    }

    let msg = '*CAMPAÑAS ACTIVAS*\n\n';
    for (const c of campanas.slice(0, 10)) {
      const cpl = c.leads_generated > 0 ? Math.round(c.budget_spent / c.leads_generated) : 0;
      msg += `*${c.name}*\n`;
      msg += `   Plataforma: ${c.platform}\n`;
      msg += `   Leads: ${c.leads_generated || 0}\n`;
      msg += `   CPL: $${cpl.toLocaleString()}\n`;
      msg += `   Gasto: $${(c.budget_spent || 0).toLocaleString()}\n\n`;
    }

    return { campanas, mensaje: msg };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CPL POR PLATAFORMA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getCPLPorPlataforma(): Promise<{ metrics: PlatformMetrics[]; cplGlobal: number; mensaje: string }> {
    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!campanas || campanas.length === 0) {
      return { metrics: [], cplGlobal: 0, mensaje: 'No hay datos de campañas.' };
    }

    // Agrupar por plataforma
    const porPlataforma: Record<string, { gasto: number; leads: number }> = {};
    for (const c of campanas) {
      const plat = c.platform || 'Otro';
      if (!porPlataforma[plat]) porPlataforma[plat] = { gasto: 0, leads: 0 };
      porPlataforma[plat].gasto += c.budget_spent || 0;
      porPlataforma[plat].leads += c.leads_generated || 0;
    }

    const sorted = Object.entries(porPlataforma)
      .map(([platform, data]) => ({
        platform,
        gasto: data.gasto,
        leads: data.leads,
        cpl: data.leads > 0 ? Math.round(data.gasto / data.leads) : 0
      }))
      .sort((a, b) => a.cpl - b.cpl);

    const totalGasto = sorted.reduce((s, i) => s + i.gasto, 0);
    const totalLeads = sorted.reduce((s, i) => s + i.leads, 0);
    const cplGlobal = totalLeads > 0 ? Math.round(totalGasto / totalLeads) : 0;

    let msg = '*CPL POR PLATAFORMA*\n\n';
    for (const item of sorted) {
      msg += `*${item.platform}*\n`;
      msg += `   CPL: $${item.cpl} | Leads: ${item.leads}\n`;
    }
    msg += `\n*CPL GLOBAL: $${cplGlobal}*`;

    return { metrics: sorted, cplGlobal, mensaje: msg };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LEADS POR FUENTE (MES)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getLeadsPorFuente(): Promise<{ metrics: SourceMetrics[]; total: number; mensaje: string }> {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('source, status, created_at')
      .gte('created_at', inicioMes.toISOString());

    if (!leads || leads.length === 0) {
      return { metrics: [], total: 0, mensaje: 'No hay leads este mes.' };
    }

    // Agrupar por fuente
    const porFuente: Record<string, { total: number; hot: number }> = {};
    for (const l of leads) {
      const fuente = l.source || 'Directo';
      if (!porFuente[fuente]) porFuente[fuente] = { total: 0, hot: 0 };
      porFuente[fuente].total++;
      if (['negotiation', 'reserved', 'closed'].includes(l.status)) {
        porFuente[fuente].hot++;
      }
    }

    const sorted = Object.entries(porFuente)
      .map(([fuente, data]) => ({
        fuente,
        ...data,
        conversion: data.total > 0 ? Math.round((data.hot / data.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total);

    let msg = '*LEADS POR FUENTE (MES)*\n\n';
    for (const item of sorted) {
      msg += `*${item.fuente}*\n`;
      msg += `   Total: ${item.total} | HOT: ${item.hot} | Conv: ${item.conversion}%\n`;
    }
    msg += `\n*TOTAL: ${leads.length} leads*`;

    return { metrics: sorted, total: leads.length, mensaje: msg };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTRICAS DEL MES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getMetricasMes(): Promise<string> {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const { count: countTotal } = await this.supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioMes.toISOString());

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('status, source')
      .gte('created_at', inicioMes.toISOString());

    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('name, budget, budget_spent, leads_count')
      .eq('status', 'active');

    const leadsArr = leads || [];
    const scheduled = leadsArr.filter(l => l.status === 'scheduled').length;
    const visited = leadsArr.filter(l => l.status === 'visited').length;
    const closed = leadsArr.filter(l => ['closed', 'delivered'].includes(l.status)).length;

    // Métricas por fuente
    const porFuente: Record<string, number> = {};
    leadsArr.forEach(l => {
      const src = l.source || 'Directo';
      porFuente[src] = (porFuente[src] || 0) + 1;
    });

    let msg = `*MÉTRICAS DEL MES*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `*Leads totales:* ${countTotal || 0}\n`;
    msg += `Con cita: ${scheduled}\n`;
    msg += `Visitaron: ${visited}\n`;
    msg += `Cerrados: ${closed}\n\n`;

    // Tasa de conversión
    const tasaCita = countTotal && countTotal > 0 ? Math.round((scheduled / countTotal) * 100) : 0;
    const tasaCierre = countTotal && countTotal > 0 ? Math.round((closed / countTotal) * 100) : 0;
    msg += `*Conversión:*\n`;
    msg += `• Lead→Cita: ${tasaCita}%\n`;
    msg += `• Lead→Cierre: ${tasaCierre}%\n\n`;

    // Por fuente (top 5)
    const fuentesOrdenadas = Object.entries(porFuente).sort((a, b) => b[1] - a[1]).slice(0, 5);
    msg += `*Por fuente:*\n`;
    fuentesOrdenadas.forEach(([fuente, count]) => {
      msg += `• ${fuente}: ${count}\n`;
    });

    // Gasto de campañas
    if (campanas && campanas.length > 0) {
      const totalGastado = campanas.reduce((s, c) => s + (c.budget_spent || 0), 0);
      const totalPresupuesto = campanas.reduce((s, c) => s + (c.budget || 0), 0);
      msg += `\n*Campañas activas:* ${campanas.length}\n`;
      msg += `Gastado: $${totalGastado.toLocaleString()} / $${totalPresupuesto.toLocaleString()}`;
    }

    return msg;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROI MARKETING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getROI(): Promise<string> {
    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*');

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('source, status, properties(price)')
      .in('status', ['closed', 'delivered']);

    const totalGasto = campanas?.reduce((s, c) => s + (c.budget_spent || 0), 0) || 0;

    // Calcular revenue por fuente
    let totalRevenue = 0;
    const revenuePorFuente: Record<string, number> = {};

    for (const l of leads || []) {
      const precio = l.properties?.price || 2000000;
      totalRevenue += precio;
      const fuente = l.source || 'Directo';
      revenuePorFuente[fuente] = (revenuePorFuente[fuente] || 0) + precio;
    }

    const roi = totalGasto > 0 ? Math.round(((totalRevenue - totalGasto) / totalGasto) * 100) : 0;

    let msg = '*ROI MARKETING*\n\n';
    msg += `Invertido: $${totalGasto.toLocaleString()}\n`;
    msg += `Revenue: $${(totalRevenue / 1000000).toFixed(1)}M\n`;
    msg += `ROI: ${roi}%\n\n`;

    msg += '*Por fuente:*\n';
    const topFuentes = Object.entries(revenuePorFuente).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [fuente, rev] of topFuentes) {
      msg += `• ${fuente}: $${(rev / 1000000).toFixed(1)}M\n`;
    }

    return msg;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MEJOR CAMPAÑA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getMejorCampana(): Promise<{ campana: CampaignWithCPL | null; mensaje: string }> {
    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*')
      .gt('leads_generated', 0)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!campanas || campanas.length === 0) {
      return { campana: null, mensaje: 'No hay campañas con leads.' };
    }

    const conCPL = campanas.map(c => ({
      ...c,
      cpl: c.budget_spent / c.leads_generated
    })).sort((a, b) => a.cpl - b.cpl);

    const mejor = conCPL[0];

    const msg =
      `*MEJOR CAMPAÑA*\n\n` +
      `*${mejor.name}*\n\n` +
      `Plataforma: ${mejor.platform}\n` +
      `Leads: ${mejor.leads_generated}\n` +
      `CPL: $${Math.round(mejor.cpl)}\n` +
      `Gasto: $${mejor.budget_spent?.toLocaleString()}\n\n` +
      '*Recomendación:*\n' +
      'Considera escalar esta campaña aumentando presupuesto gradualmente.';

    return { campana: mejor, mensaje: msg };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PEOR CAMPAÑA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getPeorCampana(): Promise<{ campana: CampaignWithCPL | null; mensaje: string }> {
    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!campanas || campanas.length === 0) {
      return { campana: null, mensaje: 'No hay campañas activas.' };
    }

    const conCPL = campanas.map(c => ({
      ...c,
      cpl: c.leads_generated > 0 ? c.budget_spent / c.leads_generated : 999999
    })).sort((a, b) => b.cpl - a.cpl);

    const peor = conCPL[0];

    let recomendacion = '';
    if (peor.leads_generated === 0) {
      recomendacion = 'Sin leads generados. Revisa segmentación y creativos urgente.';
    } else if (peor.cpl > 500) {
      recomendacion = 'CPL muy alto. Considera pausar y optimizar antes de continuar.';
    } else {
      recomendacion = 'Revisa audiencias y prueba nuevos creativos.';
    }

    const msg =
      `*CAMPAÑA A OPTIMIZAR*\n\n` +
      `*${peor.name}*\n\n` +
      `Plataforma: ${peor.platform}\n` +
      `Leads: ${peor.leads_generated || 0}\n` +
      `CPL: ${peor.leads_generated > 0 ? '$' + Math.round(peor.cpl) : 'Sin leads'}\n` +
      `Gasto: $${peor.budget_spent?.toLocaleString()}\n\n` +
      '*Recomendación:*\n' +
      recomendacion;

    return { campana: peor, mensaje: msg };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GASTO VS PRESUPUESTO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getGastoVsPresupuesto(): Promise<string> {
    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*');

    if (!campanas || campanas.length === 0) {
      return 'No hay campañas registradas.';
    }

    const totalPresupuesto = campanas.reduce((s, c) => s + (c.budget || 0), 0);
    const totalGasto = campanas.reduce((s, c) => s + (c.budget_spent || 0), 0);
    const porcentaje = totalPresupuesto > 0 ? Math.round((totalGasto / totalPresupuesto) * 100) : 0;

    // Por plataforma
    const porPlataforma: Record<string, { budget: number; spent: number }> = {};
    for (const c of campanas) {
      const plat = c.platform || 'Otro';
      if (!porPlataforma[plat]) porPlataforma[plat] = { budget: 0, spent: 0 };
      porPlataforma[plat].budget += c.budget || 0;
      porPlataforma[plat].spent += c.budget_spent || 0;
    }

    let msg = '*GASTO VS PRESUPUESTO*\n\n';
    msg += `Presupuesto: $${totalPresupuesto.toLocaleString()}\n`;
    msg += `Gastado: $${totalGasto.toLocaleString()}\n`;
    msg += `Utilizado: ${porcentaje}%\n\n`;

    msg += '*Por plataforma:*\n';
    for (const [plat, data] of Object.entries(porPlataforma)) {
      const pct = data.budget > 0 ? Math.round((data.spent / data.budget) * 100) : 0;
      msg += `• ${plat}: $${data.spent.toLocaleString()} / $${data.budget.toLocaleString()} (${pct}%)\n`;
    }

    return msg;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEGMENTOS DISPONIBLES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getSegmentos(): Promise<{ segments: SegmentCounts; mensaje: string }> {
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, status, lead_score, score, phone, lead_category, property_interest');

    if (!leads) {
      return {
        segments: this.emptySegments(),
        mensaje: 'Error al obtener segmentos.'
      };
    }

    const conTel = leads.filter(l => l.phone);
    const hot = conTel.filter(l => (l.lead_score || l.score || 0) >= 70);
    const warm = conTel.filter(l => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
    const cold = conTel.filter(l => (l.lead_score || l.score || 0) < 40);
    const compradores = conTel.filter(l => ['closed_won', 'delivered'].includes(l.status));
    const caidos = conTel.filter(l => l.status === 'fallen');
    const nuevos = conTel.filter(l => l.status === 'new');
    const visitados = conTel.filter(l => l.status === 'visited');
    const negociacion = conTel.filter(l => ['negotiation', 'reserved'].includes(l.status));

    // Contar por desarrollo
    const porDesarrollo: { [key: string]: number } = {};
    conTel.forEach(l => {
      if (l.property_interest) {
        porDesarrollo[l.property_interest] = (porDesarrollo[l.property_interest] || 0) + 1;
      }
    });
    const desarrollosOrdenados = Object.entries(porDesarrollo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nombre, count]) => ({ nombre, count }));

    const segments: SegmentCounts = {
      total: conTel.length,
      hot: hot.length,
      warm: warm.length,
      cold: cold.length,
      nuevos: nuevos.length,
      visitados: visitados.length,
      negociacion: negociacion.length,
      compradores: compradores.length,
      caidos: caidos.length,
      desarrollos: desarrollosOrdenados
    };

    const msg =
      `*SEGMENTOS DISPONIBLES*\n\n` +
      `*Por temperatura:*\n` +
      `• *hot* - ${segments.hot} leads\n` +
      `• *warm* - ${segments.warm} leads\n` +
      `• *cold* - ${segments.cold} leads\n\n` +
      `*Por status:*\n` +
      `• *nuevos* - ${segments.nuevos} leads\n` +
      `• *visitados* - ${segments.visitados} leads\n` +
      `• *negociacion* - ${segments.negociacion} leads\n` +
      `• *compradores* - ${segments.compradores} leads\n` +
      `• *caidos* - ${segments.caidos} leads\n\n` +
      `*Por desarrollo:*\n` +
      desarrollosOrdenados.map(d => `• *${d.nombre}* - ${d.count} leads`).join('\n') +
      `\n\n*Total:* ${segments.total} leads\n\n` +
      `*Formatos de envío:*\n` +
      `• enviar a hot: mensaje\n` +
      `• enviar a Distrito Falco: mensaje\n` +
      `• enviar a hot de Distrito Falco: mensaje`;

    return { segments, mensaje: msg };
  }

  private emptySegments(): SegmentCounts {
    return {
      total: 0,
      hot: 0,
      warm: 0,
      cold: 0,
      nuevos: 0,
      visitados: 0,
      negociacion: 0,
      compradores: 0,
      caidos: 0,
      desarrollos: []
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MENSAJES DE SEGMENTOS (con emojis para WhatsApp)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getMensajeSegmentos(nombreUsuario: string): Promise<string> {
    const { segments } = await this.getSegmentos();

    return (
      `*SEGMENTOS DISPONIBLES*\n${nombreUsuario}\n\n` +
      `📊 *Por temperatura:*\n` +
      `• *hot* - ${segments.hot} leads 🔥\n` +
      `• *warm* - ${segments.warm} leads ⚠️\n` +
      `• *cold* - ${segments.cold} leads ❄️\n\n` +
      `📊 *Por status:*\n` +
      `• *nuevos* - ${segments.nuevos} leads\n` +
      `• *visitados* - ${segments.visitados} leads\n` +
      `• *negociacion* - ${segments.negociacion} leads\n` +
      `• *compradores* - ${segments.compradores} leads 🏠\n` +
      `• *caidos* - ${segments.caidos} leads\n\n` +
      `🏘️ *Por desarrollo:*\n` +
      segments.desarrollos.map(d => `• *${d.nombre}* - ${d.count} leads`).join('\n') +
      `\n\n📊 *Total:* ${segments.total} leads\n\n` +
      `💡 *Formatos de envío:*\n` +
      `• enviar a hot: mensaje\n` +
      `• enviar a Distrito Falco: mensaje\n` +
      `• enviar a hot de Distrito Falco: mensaje`
    );
  }

  getMensajeAyudaBroadcast(nombreUsuario: string): string {
    return (
      `*ENVÍO MASIVO*\n${nombreUsuario}\n\n` +
      `Para enviar un mensaje masivo:\n\n` +
      `1️⃣ Primero escribe *segmentos* para ver opciones\n\n` +
      `2️⃣ Luego usa el formato:\n` +
      `*enviar a [segmento]: [mensaje]*\n\n` +
      `*Ejemplos:*\n` +
      `• enviar a hot: Hola {nombre}, tenemos una promoción especial!\n` +
      `• enviar a compradores: Felicidades por tu primer año!\n` +
      `• enviar a todos: Este sábado open house!\n\n` +
      `📌 *Variables disponibles:*\n` +
      `• {nombre} - Nombre del lead\n` +
      `• {desarrollo} - Desarrollo de interés\n\n` +
      `⚠️ El envío puede tomar varios minutos según cantidad.`
    );
  }

  getMensajeFormatosEnvio(): string {
    return (
      '*ENVÍO A SEGMENTOS* 📤\n\n' +
      '*Formatos disponibles:*\n\n' +
      '1️⃣ *Por segmento:*\n' +
      '   enviar a hot: Tu mensaje\n\n' +
      '2️⃣ *Por desarrollo:*\n' +
      '   enviar a Distrito Falco: Tu mensaje\n\n' +
      '3️⃣ *Por vendedor:*\n' +
      '   enviar a vendedor Karla: Tu mensaje\n\n' +
      '4️⃣ *Por fecha:*\n' +
      '   enviar a nuevos esta semana: mensaje\n' +
      '   enviar a hot este mes: mensaje\n' +
      '   enviar a todos últimos 7 días: mensaje\n' +
      '   enviar a nuevos desde 2025-01-01: mensaje\n\n' +
      '5️⃣ *Combinados:*\n' +
      '   enviar a hot de Distrito Falco: mensaje\n' +
      '   enviar a hot vendedor Karla: mensaje\n' +
      '   enviar a nuevos esta semana vendedor Karla: mensaje\n\n' +
      '*Segmentos:* hot, warm, cold, nuevos, visitados, negociacion, compradores, caidos, todos\n\n' +
      '*Fechas:* hoy, esta semana, este mes, último mes, últimos N días, desde YYYY-MM-DD\n\n' +
      '*Variables:* {nombre}, {desarrollo}'
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PARSEO DE COMANDO DE ENVÍO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  parseEnvioSegmento(body: string): {
    segmento: string | null;
    desarrollo: string | null;
    vendedorNombre: string | null;
    fechaDesde: Date | null;
    fechaHasta: Date | null;
    fechaDescripcion: string | null;
    mensajeTemplate: string;
  } {
    let segmento: string | null = null;
    let desarrollo: string | null = null;
    let vendedorNombre: string | null = null;
    let fechaDesde: Date | null = null;
    let fechaHasta: Date | null = null;
    let fechaDescripcion: string | null = null;
    let mensajeTemplate: string = '';

    const hoy = new Date();

    // Extraer filtro de fecha
    const fechaPatterns = [
      { regex: /desde\s+(\d{4}-\d{2}-\d{2})/i, handler: (m: RegExpMatchArray) => {
        fechaDesde = new Date(m[1]);
        fechaDescripcion = `desde ${m[1]}`;
      }},
      { regex: /hasta\s+(\d{4}-\d{2}-\d{2})/i, handler: (m: RegExpMatchArray) => {
        fechaHasta = new Date(m[1]);
        fechaHasta.setHours(23, 59, 59);
        fechaDescripcion = fechaDescripcion ? `${fechaDescripcion} hasta ${m[1]}` : `hasta ${m[1]}`;
      }},
      { regex: /esta semana/i, handler: () => {
        const inicioSemana = new Date(hoy);
        inicioSemana.setDate(hoy.getDate() - hoy.getDay());
        inicioSemana.setHours(0, 0, 0, 0);
        fechaDesde = inicioSemana;
        fechaDescripcion = 'esta semana';
      }},
      { regex: /este mes/i, handler: () => {
        fechaDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaDescripcion = 'este mes';
      }},
      { regex: /(?:último|ultimo) mes/i, handler: () => {
        fechaDesde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        fechaHasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);
        fechaDescripcion = 'último mes';
      }},
      { regex: /(?:últimos|ultimos)\s+(\d+)\s+días?/i, handler: (m: RegExpMatchArray) => {
        fechaDesde = new Date(hoy);
        fechaDesde.setDate(hoy.getDate() - parseInt(m[1]));
        fechaDescripcion = `últimos ${m[1]} días`;
      }},
      { regex: /hoy/i, handler: () => {
        fechaDesde = new Date(hoy);
        fechaDesde.setHours(0, 0, 0, 0);
        fechaHasta = new Date(hoy);
        fechaHasta.setHours(23, 59, 59);
        fechaDescripcion = 'hoy';
      }}
    ];

    for (const pattern of fechaPatterns) {
      const match = body.match(pattern.regex);
      if (match) {
        pattern.handler(match);
      }
    }

    // Extraer vendedor
    const vendedorMatch = body.match(/vendedor\s+([^:]+?)(?:\s*:|$)/i);
    if (vendedorMatch) {
      vendedorNombre = vendedorMatch[1].trim();
    }

    // Limpiar body
    const bodyLimpio = body
      .replace(/\s*vendedor\s+[^:]+/i, '')
      .replace(/\s*desde\s+\d{4}-\d{2}-\d{2}/i, '')
      .replace(/\s*hasta\s+\d{4}-\d{2}-\d{2}/i, '')
      .replace(/\s*esta semana/i, '')
      .replace(/\s*este mes/i, '')
      .replace(/\s*(?:último|ultimo) mes/i, '')
      .replace(/\s*(?:últimos|ultimos)\s+\d+\s+días?/i, '')
      .replace(/\s*hoy/i, '');

    // Parsear segmento y desarrollo
    const matchConDesarrollo = bodyLimpio.match(/envi(?:ar|a) a (\w+) de ([^:]+)[:\s]+(.+)/i);
    const matchSimple = bodyLimpio.match(/envi(?:ar|a) a ([^:]+)[:\s]+(.+)/i);

    const segmentosConocidos = ['hot', 'warm', 'cold', 'compradores', 'buyers', 'caidos', 'fallen', 'nuevos', 'new', 'visitados', 'negociacion', 'todos', 'all'];

    if (matchConDesarrollo) {
      const posibleSegmento = matchConDesarrollo[1].toLowerCase().trim();
      if (segmentosConocidos.includes(posibleSegmento)) {
        segmento = posibleSegmento;
        desarrollo = matchConDesarrollo[2].trim();
      }
      mensajeTemplate = matchConDesarrollo[3].trim();
    } else if (matchSimple) {
      const primerParte = matchSimple[1].trim().toLowerCase();
      mensajeTemplate = matchSimple[2].trim();

      if (segmentosConocidos.includes(primerParte)) {
        segmento = primerParte;
      } else if (!vendedorNombre) {
        desarrollo = matchSimple[1].trim();
      }
    }

    // Si solo hay vendedor, extraer mensaje
    if (vendedorNombre && !mensajeTemplate) {
      const msgMatch = body.match(/:\s*(.+)$/);
      if (msgMatch) {
        mensajeTemplate = msgMatch[1].trim();
      }
    }

    return { segmento, desarrollo, vendedorNombre, fechaDesde, fechaHasta, fechaDescripcion, mensajeTemplate };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // OBTENER LEADS FILTRADOS PARA ENVÍO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getLeadsParaEnvio(filtros: {
    segmento: string | null;
    desarrollo: string | null;
    vendedorNombre: string | null;
    fechaDesde: Date | null;
    fechaHasta: Date | null;
  }): Promise<{
    leads: any[];
    error: string | null;
    vendedorEncontrado: string | null;
    filtroDescripcion: string;
  }> {
    const { data: leads, error: leadsError } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, status, lead_score, score, property_interest, assigned_to, created_at, last_interaction');

    if (leadsError) {
      console.error('❌ Error al obtener leads:', leadsError);
      return { leads: [], error: `Error al obtener leads: ${leadsError.message}`, vendedorEncontrado: null, filtroDescripcion: '' };
    }

    const { data: teamMembers } = await this.supabase.client
      .from('team_members')
      .select('id, name');

    if (!leads) {
      console.error('❌ Query de leads retornó null sin error');
      return { leads: [], error: 'Error al obtener leads (null).', vendedorEncontrado: null, filtroDescripcion: '' };
    }

    console.log(`📋 getLeadsParaEnvio: ${leads.length} leads obtenidos`);

    let leadsSegmento = leads.filter(l => l.phone);
    let vendedorEncontrado: string | null = null;

    // Filtrar por vendedor
    if (filtros.vendedorNombre && teamMembers) {
      const vendedorLower = filtros.vendedorNombre.toLowerCase();
      const vendedor = teamMembers.find((tm: any) =>
        tm.name?.toLowerCase().includes(vendedorLower) ||
        vendedorLower.includes(tm.name?.split(' ')[0]?.toLowerCase() || '')
      );

      if (!vendedor) {
        const vendedoresDisponibles = teamMembers.slice(0, 15).map((tm: any) => `• ${tm.name}`).join('\n');
        return {
          leads: [],
          error: `❌ Vendedor "${filtros.vendedorNombre}" no encontrado.\n\n*Vendedores disponibles:*\n${vendedoresDisponibles}`,
          vendedorEncontrado: null,
          filtroDescripcion: ''
        };
      }

      leadsSegmento = leadsSegmento.filter(l => l.assigned_to === vendedor.id);
      vendedorEncontrado = vendedor.name;

      if (leadsSegmento.length === 0) {
        return {
          leads: [],
          error: `❌ ${vendedor.name} no tiene leads asignados con teléfono.`,
          vendedorEncontrado: vendedor.name,
          filtroDescripcion: ''
        };
      }
    }

    // Filtrar por desarrollo
    if (filtros.desarrollo) {
      const desarrolloLower = filtros.desarrollo.toLowerCase();
      leadsSegmento = leadsSegmento.filter(l => {
        const propInterest = (l.property_interest || '').toLowerCase();
        return propInterest.includes(desarrolloLower) || desarrolloLower.includes(propInterest);
      });

      if (leadsSegmento.length === 0) {
        const desarrollosUnicos = [...new Set(leads.map(l => l.property_interest).filter(Boolean))];
        return {
          leads: [],
          error: `❌ No hay leads interesados en "${filtros.desarrollo}".\n\n*Desarrollos disponibles:*\n${desarrollosUnicos.slice(0, 10).map(d => `• ${d}`).join('\n')}`,
          vendedorEncontrado,
          filtroDescripcion: ''
        };
      }
    }

    // Filtrar por fecha
    if (filtros.fechaDesde || filtros.fechaHasta) {
      leadsSegmento = leadsSegmento.filter(l => {
        if (!l.created_at) return false;
        const fechaCreacion = new Date(l.created_at);
        if (filtros.fechaDesde && fechaCreacion < filtros.fechaDesde) return false;
        if (filtros.fechaHasta && fechaCreacion > filtros.fechaHasta) return false;
        return true;
      });

      if (leadsSegmento.length === 0) {
        return {
          leads: [],
          error: `❌ No hay leads creados en el rango de fecha especificado.`,
          vendedorEncontrado,
          filtroDescripcion: ''
        };
      }
    }

    // Filtrar por segmento
    if (filtros.segmento) {
      switch (filtros.segmento) {
        case 'hot':
          leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 70);
          break;
        case 'warm':
          leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
          break;
        case 'cold':
          leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) < 40);
          break;
        case 'compradores':
        case 'buyers':
          leadsSegmento = leadsSegmento.filter(l => ['closed_won', 'delivered'].includes(l.status));
          break;
        case 'caidos':
        case 'fallen':
          leadsSegmento = leadsSegmento.filter(l => l.status === 'fallen');
          break;
        case 'nuevos':
        case 'new':
          leadsSegmento = leadsSegmento.filter(l => l.status === 'new');
          break;
        case 'visitados':
          leadsSegmento = leadsSegmento.filter(l => l.status === 'visited');
          break;
        case 'negociacion':
          leadsSegmento = leadsSegmento.filter(l => ['negotiation', 'reserved'].includes(l.status));
          break;
        case 'todos':
        case 'all':
          break;
        default:
          return {
            leads: [],
            error: `Segmento "${filtros.segmento}" no reconocido.\n\nOpciones: hot, warm, cold, compradores, caidos, nuevos, visitados, negociacion, todos`,
            vendedorEncontrado,
            filtroDescripcion: ''
          };
      }
    }

    // Construir descripción del filtro
    const filtroDesc = [
      filtros.segmento ? `segmento: ${filtros.segmento}` : null,
      filtros.desarrollo ? `desarrollo: ${filtros.desarrollo}` : null,
      vendedorEncontrado ? `vendedor: ${vendedorEncontrado}` : null
    ].filter(Boolean).join(' + ') || 'todos';

    if (leadsSegmento.length === 0) {
      return {
        leads: [],
        error: `No hay leads con filtro: ${filtroDesc}`,
        vendedorEncontrado,
        filtroDescripcion: filtroDesc
      };
    }

    return { leads: leadsSegmento, error: null, vendedorEncontrado, filtroDescripcion: filtroDesc };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EJECUTAR ENVÍO BROADCAST
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async ejecutarEnvioBroadcast(
    leads: any[],
    mensajeTemplate: string,
    filtroDescripcion: string,
    usuarioId: string,
    enviarMensaje: (phone: string, mensaje: string) => Promise<void>,
    sendTemplate?: (phone: string, templateName: string, lang: string, components: any[]) => Promise<any>
  ): Promise<{ enviados: number; errores: number; templateUsados: number }> {
    // Crear campaña en DB
    const { data: campana } = await this.supabase.client
      .from('campaigns')
      .insert({
        name: `Broadcast ${filtroDescripcion} - ${new Date().toLocaleDateString('es-MX')}`,
        message: mensajeTemplate,
        segment_filters: { descripcion: filtroDescripcion },
        status: 'sending',
        total_recipients: leads.length,
        created_by: usuarioId
      })
      .select()
      .single();

    let enviados = 0;
    let errores = 0;
    let templateUsados = 0;
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const lead of leads) {
      try {
        const phone = lead.phone.startsWith('52') ? lead.phone : '52' + lead.phone;
        const nombre = lead.name?.split(' ')[0] || 'amigo';
        const desarrollo = lead.property_interest || 'nuestros desarrollos';

        // Verificar si el lead ha interactuado en las últimas 24h
        const dentroVentana24h = lead.last_message_at && lead.last_message_at > hace24h;

        if (dentroVentana24h) {
          // Dentro de ventana 24h: usar mensaje normal (más flexible)
          const mensaje = mensajeTemplate
            .replace(/{nombre}/gi, nombre)
            .replace(/{desarrollo}/gi, desarrollo);
          await enviarMensaje(phone, mensaje);
        } else if (sendTemplate) {
          // Fuera de ventana 24h: usar template aprobado
          // Usar promo_desarrollo: {{1}}=nombre, {{2}}=desarrollo, {{3}}=mensaje_promo
          const mensajeCorto = mensajeTemplate.substring(0, 200).replace(/{nombre}/gi, '').replace(/{desarrollo}/gi, '').trim();
          await sendTemplate(phone, 'promo_desarrollo', 'es_MX', [
            { type: 'body', parameters: [
              { type: 'text', text: nombre },
              { type: 'text', text: desarrollo },
              { type: 'text', text: mensajeCorto || 'Promoción especial disponible' }
            ]}
          ]);
          templateUsados++;
        } else {
          // Sin template disponible, intentar mensaje normal (puede fallar)
          const mensaje = mensajeTemplate
            .replace(/{nombre}/gi, nombre)
            .replace(/{desarrollo}/gi, desarrollo);
          await enviarMensaje(phone, mensaje);
        }

        // Log en campaign_logs
        if (campana) {
          await this.supabase.client.from('campaign_logs').insert({
            campaign_id: campana.id,
            lead_id: lead.id,
            lead_phone: lead.phone,
            lead_name: lead.name,
            status: 'sent',
            sent_at: new Date().toISOString()
          });
        }

        enviados++;

        // Pequeña pausa para no saturar
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        errores++;
        console.error(`Error enviando a ${lead.phone}:`, e);
      }
    }

    // Actualizar campaña
    if (campana) {
      await this.supabase.client
        .from('campaigns')
        .update({
          status: 'completed',
          sent_count: enviados,
          sent_at: new Date().toISOString()
        })
        .eq('id', campana.id);
    }

    return { enviados, errores, templateUsados };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PREVIEW DE SEGMENTO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async previewSegmento(segmento: string): Promise<{ mensaje: string; error: string | null }> {
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, status, lead_score, score')
      .order('updated_at', { ascending: false });

    if (!leads) {
      return { mensaje: '', error: 'Error al obtener leads.' };
    }

    let leadsSegmento = leads.filter(l => l.phone);

    switch (segmento.toLowerCase()) {
      case 'hot':
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 70);
        break;
      case 'warm':
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
        break;
      case 'cold':
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) < 40);
        break;
      case 'compradores':
        leadsSegmento = leadsSegmento.filter(l => ['closed_won', 'delivered'].includes(l.status));
        break;
      case 'todos':
        break;
      default:
        return { mensaje: '', error: `Segmento "${segmento}" no reconocido.` };
    }

    let msg = `*PREVIEW: ${segmento.toUpperCase()}*\n`;
    msg += `Total: ${leadsSegmento.length} leads\n\n`;
    msg += `*Primeros 10:*\n`;

    for (const lead of leadsSegmento.slice(0, 10)) {
      msg += `• ${lead.name || 'Sin nombre'} - ${lead.phone}\n`;
    }

    if (leadsSegmento.length > 10) {
      msg += `\n... y ${leadsSegmento.length - 10} más`;
    }

    msg += `\n\n💡 Para enviar: *enviar a ${segmento}: Tu mensaje*`;

    return { mensaje: msg, error: null };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESUMEN MARKETING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getResumenMarketing(): Promise<{
    activas: number;
    totalGasto: number;
    cplGlobal: number;
    leadsMesTotal: number;
    leadsHot: number;
    conversionRate: number;
  }> {
    const { data: campanas } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*');

    const inicioMes = new Date();
    inicioMes.setDate(1);

    const { data: leadsMes } = await this.supabase.client
      .from('leads')
      .select('source, status')
      .gte('created_at', inicioMes.toISOString());

    const activas = campanas?.filter(c => c.status === 'active').length || 0;
    const totalGasto = campanas?.reduce((s, c) => s + (c.budget_spent || 0), 0) || 0;
    const totalLeadsCamp = campanas?.reduce((s, c) => s + (c.leads_generated || 0), 0) || 0;
    const cplGlobal = totalLeadsCamp > 0 ? Math.round(totalGasto / totalLeadsCamp) : 0;

    const leadsMesTotal = leadsMes?.length || 0;
    const leadsHot = leadsMes?.filter(l => ['negotiation', 'reserved', 'closed'].includes(l.status)).length || 0;
    const conversionRate = leadsMesTotal > 0 ? Math.round(leadsHot / leadsMesTotal * 100) : 0;

    return { activas, totalGasto, cplGlobal, leadsMesTotal, leadsHot, conversionRate };
  }

  formatResumenMarketing(data: {
    activas: number;
    totalGasto: number;
    cplGlobal: number;
    leadsMesTotal: number;
    leadsHot: number;
    conversionRate: number;
  }, nombre: string): string {
    return '*📌 RESUMEN MARKETING*\n' + nombre + '\n\n' +
      '*Campañas:*\n' +
      `• Activas: ${data.activas}\n` +
      `• Gasto total: $${data.totalGasto.toLocaleString()}\n` +
      `• CPL global: $${data.cplGlobal}\n\n` +
      '*Leads (mes):*\n' +
      `• Generados: ${data.leadsMesTotal}\n` +
      `• HOT: ${data.leadsHot}\n` +
      `• Conversión: ${data.conversionRate}%\n\n` +
      '💡 Escribe *mejor* o *peor* para ver campañas destacadas.';
  }
}
