// ═══════════════════════════════════════════════════════════════════════════
// REVENUE ATTRIBUTION SERVICE - Atribución de ingresos por canal/campaña
// ═══════════════════════════════════════════════════════════════════════════
// Atribuye ventas cerradas a su fuente de adquisición, calcula ROAS,
// costo por lead, costo por venta y genera reportes para WhatsApp
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Attribution {
  channel: string;     // 'facebook', 'instagram', 'organic', 'referral', 'direct'
  campaign?: string;
  leads: number;
  closed: number;
  revenue: number;
  roas: number;        // return on ad spend (revenue / spend), -1 if no spend data
  costPerLead: number;
  costPerSale: number;
  avgDaysToClose: number;
}

interface LeadForAttribution {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  notes: any;
}

// Closed statuses for revenue attribution
const CLOSED_STATUSES = ['closed', 'sold', 'delivered', 'reserved'];

// Channel display names
const CHANNEL_DISPLAY: Record<string, { emoji: string; label: string }> = {
  facebook: { emoji: '📱', label: 'Facebook Ads' },
  instagram: { emoji: '📷', label: 'Instagram' },
  google: { emoji: '🔍', label: 'Google Ads' },
  tiktok: { emoji: '🎵', label: 'TikTok' },
  referral: { emoji: '🔗', label: 'Referidos' },
  organic: { emoji: '🌐', label: 'Orgánico' },
  direct: { emoji: '💬', label: 'Directo (WhatsApp)' },
  email: { emoji: '📧', label: 'Email' },
  unknown: { emoji: '❓', label: 'Sin clasificar' },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / msPerDay;
}

function classifyChannel(lead: LeadForAttribution): string {
  const notes = lead.notes || {};

  // 1. UTM source takes priority
  if (notes.utm_source) {
    const src = notes.utm_source.toLowerCase();
    if (src.includes('facebook') || src === 'fb') return 'facebook';
    if (src.includes('instagram') || src === 'ig') return 'instagram';
    if (src.includes('google')) return 'google';
    if (src.includes('tiktok')) return 'tiktok';
    if (src.includes('email') || src.includes('correo')) return 'email';
    if (src.includes('referr') || src.includes('referi')) return 'referral';
    return src;
  }

  // 2. Channel field
  if (notes.channel) {
    const ch = notes.channel.toLowerCase();
    if (ch.includes('facebook') || ch === 'fb') return 'facebook';
    if (ch.includes('instagram') || ch === 'ig') return 'instagram';
    if (ch.includes('google')) return 'google';
    if (ch.includes('referr') || ch.includes('referi')) return 'referral';
    if (ch.includes('organic') || ch.includes('orgánico')) return 'organic';
    return ch;
  }

  // 3. Deal attribution (set by attributeRevenue)
  if (notes.deal_attributed_to) {
    return notes.deal_attributed_to;
  }

  // 4. Check if it was a referral
  if (notes.referred_by || notes.referral_code) {
    return 'referral';
  }

  // 5. Default: direct (came via WhatsApp without tracking)
  return 'direct';
}

function getCampaign(lead: LeadForAttribution): string | undefined {
  const notes = lead.notes || {};
  return notes.utm_campaign || notes.campaign || undefined;
}

function periodStartDate(period: 'month' | 'quarter' | 'year'): Date {
  const now = new Date();
  switch (period) {
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'quarter':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

function periodLabel(period: 'month' | 'quarter' | 'year'): string {
  const now = new Date();
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  switch (period) {
    case 'month':
      return `${months[now.getMonth()]} ${now.getFullYear()}`;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) + 1;
      return `Q${q} ${now.getFullYear()}`;
    }
    case 'year':
      return `${now.getFullYear()}`;
  }
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return `$${Math.round(amount)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class RevenueAttributionService {
  constructor(private supabase: SupabaseService) {}

  // ─────────────────────────────────────────────────────────────────────
  // Attribute a closed deal to its source
  // ─────────────────────────────────────────────────────────────────────
  async attributeRevenue(leadId: string, dealAmount: number): Promise<void> {
    try {
      // Fresh read to avoid JSONB race condition
      const lead = await this.supabase.getLeadById(leadId);
      if (!lead) {
        console.error(`⚠️ RevenueAttribution: lead ${leadId} not found`);
        return;
      }

      const notes = lead.notes || {};
      const channel = classifyChannel(lead as LeadForAttribution);
      const campaign = getCampaign(lead as LeadForAttribution);

      const updatedNotes = {
        ...notes,
        deal_amount: dealAmount,
        deal_attributed_to: channel,
        deal_campaign: campaign || notes.deal_campaign,
        deal_closed_at: new Date().toISOString(),
      };

      await this.supabase.updateLead(leadId, { notes: updatedNotes });

      console.log(`💰 Revenue attributed: ${formatMoney(dealAmount)} → ${channel}${campaign ? ` (${campaign})` : ''} for lead ${leadId}`);
    } catch (err: any) {
      console.error('⚠️ RevenueAttribution attributeRevenue error:', err?.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Get attribution report for a period
  // ─────────────────────────────────────────────────────────────────────
  async getAttributionReport(period: 'month' | 'quarter' | 'year'): Promise<Attribution[]> {
    const startDate = periodStartDate(period);

    // Fetch all leads in period
    const { data: leads, error } = await this.supabase.client
      .from('leads')
      .select('id, name, status, created_at, updated_at, assigned_to, notes')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('⚠️ RevenueAttribution query error:', error.message);
    }

    const allLeads = (leads || []) as LeadForAttribution[];

    // Group by channel
    const channelData: Record<string, {
      leads: number;
      closed: number;
      revenue: number;
      closeDays: number[];
      campaigns: Set<string>;
      spend: number;
    }> = {};

    for (const lead of allLeads) {
      const channel = classifyChannel(lead);

      if (!channelData[channel]) {
        channelData[channel] = {
          leads: 0,
          closed: 0,
          revenue: 0,
          closeDays: [],
          campaigns: new Set(),
          spend: 0,
        };
      }

      channelData[channel].leads++;

      const campaign = getCampaign(lead);
      if (campaign) channelData[channel].campaigns.add(campaign);

      // Check if closed
      if (CLOSED_STATUSES.includes(lead.status)) {
        channelData[channel].closed++;

        // Revenue from notes
        const dealAmount = lead.notes?.deal_amount || lead.notes?.budget || 0;
        channelData[channel].revenue += dealAmount;

        // Days to close
        const closedAt = lead.notes?.deal_closed_at || lead.updated_at;
        channelData[channel].closeDays.push(daysBetween(lead.created_at, closedAt));
      }

      // Ad spend from notes (if recorded per-lead)
      if (lead.notes?.ad_spend) {
        channelData[channel].spend += lead.notes.ad_spend;
      }
    }

    // Build attribution array
    const attributions: Attribution[] = Object.entries(channelData)
      .map(([channel, data]) => {
        const avgClose = data.closeDays.length > 0
          ? Math.round((data.closeDays.reduce((a, b) => a + b, 0) / data.closeDays.length) * 10) / 10
          : 0;

        return {
          channel,
          campaign: data.campaigns.size > 0 ? [...data.campaigns].join(', ') : undefined,
          leads: data.leads,
          closed: data.closed,
          revenue: data.revenue,
          roas: data.spend > 0 ? Math.round((data.revenue / data.spend) * 10) / 10 : -1,
          costPerLead: data.spend > 0 ? Math.round(data.spend / data.leads) : 0,
          costPerSale: data.spend > 0 && data.closed > 0 ? Math.round(data.spend / data.closed) : 0,
          avgDaysToClose: avgClose,
        };
      })
      .sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending

    return attributions;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Format attribution report for WhatsApp
  // ─────────────────────────────────────────────────────────────────────
  formatAttributionReport(data: Attribution[], period: 'month' | 'quarter' | 'year' = 'month'): string {
    const lines: string[] = [];

    lines.push('📊 *ATRIBUCIÓN DE INGRESOS*');
    lines.push(`Período: ${periodLabel(period)}`);
    lines.push('━━━━━━━━━━━━━━━━━');
    lines.push('');

    if (data.length === 0) {
      lines.push('No hay datos de atribución para este período.');
      return lines.join('\n');
    }

    let totalRevenue = 0;
    let totalClosed = 0;
    let bestChannel: { name: string; convRate: number } | null = null;

    for (const attr of data) {
      const display = CHANNEL_DISPLAY[attr.channel] || CHANNEL_DISPLAY['unknown'];
      const convRate = attr.leads > 0 ? Math.round((attr.closed / attr.leads) * 1000) / 10 : 0;

      lines.push(`${display.emoji} *${display.label}*`);
      lines.push(`   Leads: ${attr.leads} | Cerrados: ${attr.closed} | Ingresos: ${formatMoney(attr.revenue)}`);

      const costLine = attr.costPerLead > 0
        ? `Conv: ${convRate}% | Costo/lead: ${formatMoney(attr.costPerLead)}`
        : `Conv: ${convRate}% | Costo/lead: $0`;
      lines.push(`   ${costLine}`);

      if (attr.roas > 0) {
        lines.push(`   ROAS: ${attr.roas}x`);
      }

      lines.push('');

      totalRevenue += attr.revenue;
      totalClosed += attr.closed;

      if (attr.closed > 0 && (!bestChannel || convRate > bestChannel.convRate)) {
        bestChannel = { name: display.label, convRate };
      }
    }

    // Summary
    if (bestChannel) {
      lines.push(`💡 *Mejor canal:* ${bestChannel.name} (${bestChannel.convRate}% conversión)`);
    }
    lines.push(`💰 *Total:* ${formatMoney(totalRevenue)} en ${totalClosed} ventas`);

    return lines.join('\n');
  }
}
