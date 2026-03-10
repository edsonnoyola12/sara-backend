// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPMENT FUNNEL SERVICE - Conversion metrics per development
// Tracks: leads → contacted → visited → negotiation → sold per development
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DevelopmentFunnel {
  development: string;
  period_days: number;
  generated_at: string;
  funnel: {
    total: number;
    contacted: number;
    scheduled: number;
    visited: number;
    negotiation: number;
    reserved: number;
    sold: number;
    lost: number;
  };
  conversion_rates: {
    contact_rate: number;     // contacted / total
    visit_rate: number;       // visited / total
    schedule_rate: number;    // scheduled / total
    close_rate: number;       // sold / total
    visit_to_close: number;   // sold / visited
  };
  avg_days_to_close: number | null;
  top_vendors: { name: string; leads: number; visits: number; sales: number }[];
  recent_sales: { lead_name: string; date: string; vendor: string }[];
}

export interface DevelopmentComparison {
  generated_at: string;
  period_days: number;
  developments: {
    name: string;
    leads: number;
    visits: number;
    sales: number;
    close_rate: number;
    avg_days_to_close: number | null;
  }[];
  best_conversion: string;
  most_leads: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class DevelopmentFunnelService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get full conversion funnel for a specific development
   */
  async getFunnel(development: string, days: number = 90): Promise<DevelopmentFunnel> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get all leads for this development
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, status, assigned_to, created_at, updated_at, notes')
      .ilike('property_interest', `%${development}%`)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    const allLeads = leads || [];

    // Count by status
    const statusCount = (statuses: string[]) =>
      allLeads.filter(l => statuses.includes(l.status)).length;

    const funnel = {
      total: allLeads.length,
      contacted: statusCount(['contacted', 'scheduled', 'visited', 'negotiation', 'reserved', 'sold', 'delivered']),
      scheduled: statusCount(['scheduled', 'visited', 'negotiation', 'reserved', 'sold', 'delivered']),
      visited: statusCount(['visited', 'negotiation', 'reserved', 'sold', 'delivered']),
      negotiation: statusCount(['negotiation', 'reserved', 'sold', 'delivered']),
      reserved: statusCount(['reserved', 'sold', 'delivered']),
      sold: statusCount(['sold', 'delivered']),
      lost: statusCount(['lost', 'inactive'])
    };

    // Conversion rates
    const safeDiv = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) / 100 : 0;
    const conversion_rates = {
      contact_rate: safeDiv(funnel.contacted, funnel.total),
      visit_rate: safeDiv(funnel.visited, funnel.total),
      schedule_rate: safeDiv(funnel.scheduled, funnel.total),
      close_rate: safeDiv(funnel.sold, funnel.total),
      visit_to_close: safeDiv(funnel.sold, funnel.visited)
    };

    // Average days to close
    const soldLeads = allLeads.filter(l => ['sold', 'delivered'].includes(l.status));
    let avg_days_to_close: number | null = null;
    if (soldLeads.length > 0) {
      const totalDays = soldLeads.reduce((sum, l) => {
        const created = new Date(l.created_at).getTime();
        const updated = new Date(l.updated_at).getTime();
        return sum + Math.round((updated - created) / (1000 * 60 * 60 * 24));
      }, 0);
      avg_days_to_close = Math.round(totalDays / soldLeads.length);
    }

    // Top vendors for this development
    const vendorMap = new Map<string, { leads: number; visits: number; sales: number }>();
    for (const lead of allLeads) {
      if (!lead.assigned_to) continue;
      const vendorId = lead.assigned_to;
      const entry = vendorMap.get(vendorId) || { leads: 0, visits: 0, sales: 0 };
      entry.leads++;
      if (['visited', 'negotiation', 'reserved', 'sold', 'delivered'].includes(lead.status)) entry.visits++;
      if (['sold', 'delivered'].includes(lead.status)) entry.sales++;
      vendorMap.set(vendorId, entry);
    }

    // Resolve vendor names
    const vendorIds = Array.from(vendorMap.keys());
    let vendorNames: Record<string, string> = {};
    if (vendorIds.length > 0) {
      const { data: vendors } = await this.supabase.client
        .from('team_members')
        .select('id, name')
        .in('id', vendorIds);
      if (vendors) {
        vendorNames = Object.fromEntries(vendors.map((v: any) => [v.id, v.name]));
      }
    }

    const top_vendors = Array.from(vendorMap.entries())
      .map(([id, stats]) => ({
        name: vendorNames[id] || 'Desconocido',
        ...stats
      }))
      .sort((a, b) => b.sales - a.sales || b.visits - a.visits)
      .slice(0, 5);

    // Recent sales
    const recent_sales = soldLeads
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5)
      .map(l => ({
        lead_name: l.name || 'Sin nombre',
        date: new Date(l.updated_at).toLocaleDateString('es-MX'),
        vendor: vendorNames[l.assigned_to] || 'Sin vendedor'
      }));

    return {
      development,
      period_days: days,
      generated_at: new Date().toISOString(),
      funnel,
      conversion_rates,
      avg_days_to_close,
      top_vendors,
      recent_sales
    };
  }

  /**
   * Compare all developments side by side
   */
  async compareAll(days: number = 90): Promise<DevelopmentComparison> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get all properties to know development names
    const { data: properties } = await this.supabase.client
      .from('properties')
      .select('name, development')
      .not('name', 'is', null);

    // Get all leads with property_interest
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('status, property_interest, created_at, updated_at')
      .not('property_interest', 'is', null)
      .gte('created_at', since);

    const allLeads = leads || [];

    // Group by development
    const devMap = new Map<string, { leads: number; visits: number; sales: number; daysTotals: number[] }>();

    for (const lead of allLeads) {
      const dev = lead.property_interest;
      if (!dev) continue;

      const entry = devMap.get(dev) || { leads: 0, visits: 0, sales: 0, daysTotals: [] };
      entry.leads++;
      if (['visited', 'negotiation', 'reserved', 'sold', 'delivered'].includes(lead.status)) entry.visits++;
      if (['sold', 'delivered'].includes(lead.status)) {
        entry.sales++;
        const daysToClose = Math.round(
          (new Date(lead.updated_at).getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        entry.daysTotals.push(daysToClose);
      }
      devMap.set(dev, entry);
    }

    const developments = Array.from(devMap.entries())
      .map(([name, stats]) => ({
        name,
        leads: stats.leads,
        visits: stats.visits,
        sales: stats.sales,
        close_rate: stats.leads > 0 ? Math.round((stats.sales / stats.leads) * 100) / 100 : 0,
        avg_days_to_close: stats.daysTotals.length > 0
          ? Math.round(stats.daysTotals.reduce((a, b) => a + b, 0) / stats.daysTotals.length)
          : null
      }))
      .sort((a, b) => b.leads - a.leads);

    const bestConv = developments.filter(d => d.leads >= 3).sort((a, b) => b.close_rate - a.close_rate);

    return {
      generated_at: new Date().toISOString(),
      period_days: days,
      developments,
      best_conversion: bestConv[0]?.name || 'N/A',
      most_leads: developments[0]?.name || 'N/A'
    };
  }

  /**
   * Format funnel for WhatsApp (CEO command)
   */
  formatFunnelForWhatsApp(funnel: DevelopmentFunnel): string {
    const f = funnel.funnel;
    const cr = funnel.conversion_rates;

    let msg = `📊 *FUNNEL: ${funnel.development.toUpperCase()}*\n`;
    msg += `_Últimos ${funnel.period_days} días_\n\n`;

    // Visual funnel
    const bar = (count: number, max: number) => {
      const width = max > 0 ? Math.round((count / max) * 10) : 0;
      return '█'.repeat(width) + '░'.repeat(10 - width);
    };

    msg += `Total:       ${bar(f.total, f.total)} ${f.total}\n`;
    msg += `Contactados: ${bar(f.contacted, f.total)} ${f.contacted}\n`;
    msg += `Citados:     ${bar(f.scheduled, f.total)} ${f.scheduled}\n`;
    msg += `Visitaron:   ${bar(f.visited, f.total)} ${f.visited}\n`;
    msg += `Negociación: ${bar(f.negotiation, f.total)} ${f.negotiation}\n`;
    msg += `Apartados:   ${bar(f.reserved, f.total)} ${f.reserved}\n`;
    msg += `Vendidos:    ${bar(f.sold, f.total)} ${f.sold}\n`;

    msg += `\n*Conversión:*\n`;
    msg += `• Contacto: ${Math.round(cr.contact_rate * 100)}%\n`;
    msg += `• Visita: ${Math.round(cr.visit_rate * 100)}%\n`;
    msg += `• Cierre: ${Math.round(cr.close_rate * 100)}%\n`;
    if (cr.visit_to_close > 0) msg += `• Visita→Cierre: ${Math.round(cr.visit_to_close * 100)}%\n`;

    if (funnel.avg_days_to_close !== null) {
      msg += `\n⏱️ Promedio para cerrar: ${funnel.avg_days_to_close} días\n`;
    }

    if (funnel.top_vendors.length > 0) {
      msg += `\n*Top vendedores:*\n`;
      for (const v of funnel.top_vendors.slice(0, 3)) {
        msg += `• ${v.name}: ${v.leads} leads, ${v.visits} visitas, ${v.sales} ventas\n`;
      }
    }

    if (funnel.recent_sales.length > 0) {
      msg += `\n*Ventas recientes:*\n`;
      for (const s of funnel.recent_sales.slice(0, 3)) {
        msg += `• ${s.lead_name} (${s.date}) - ${s.vendor}\n`;
      }
    }

    return msg;
  }

  /**
   * Format comparison for WhatsApp
   */
  formatComparisonForWhatsApp(comparison: DevelopmentComparison): string {
    let msg = `📊 *COMPARATIVO DE DESARROLLOS*\n`;
    msg += `_Últimos ${comparison.period_days} días_\n\n`;

    for (const dev of comparison.developments.slice(0, 8)) {
      const closeStr = dev.close_rate > 0 ? `${Math.round(dev.close_rate * 100)}%` : '0%';
      msg += `*${dev.name}*\n`;
      msg += `  ${dev.leads} leads → ${dev.visits} visitas → ${dev.sales} ventas (${closeStr})\n`;
      if (dev.avg_days_to_close !== null) msg += `  ⏱️ ${dev.avg_days_to_close} días promedio\n`;
      msg += `\n`;
    }

    msg += `🏆 Mayor conversión: *${comparison.best_conversion}*\n`;
    msg += `📈 Más leads: *${comparison.most_leads}*`;

    return msg;
  }
}
