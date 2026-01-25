// ═══════════════════════════════════════════════════════════════════════════
// LEAD ATTRIBUTION SERVICE - Rastreo de origen de leads con UTM
// ═══════════════════════════════════════════════════════════════════════════
// Rastrea la fuente de leads usando parámetros UTM
// Proporciona estadísticas por canal, campaña y costo por lead
// ═══════════════════════════════════════════════════════════════════════════

export interface UTMParams {
  utm_source?: string;    // facebook, google, tiktok, instagram, organic
  utm_medium?: string;    // cpc, social, email, referral
  utm_campaign?: string;  // nombre de la campaña
  utm_term?: string;      // keyword (para Google Ads)
  utm_content?: string;   // variante del anuncio
  referrer?: string;      // URL de referencia
  landing_page?: string;  // Página donde llegó
}

export interface LeadAttribution {
  id: string;
  leadId: string;
  leadPhone: string;
  leadName?: string;
  // UTM params
  source: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrer?: string;
  landingPage?: string;
  // Metadata
  createdAt: string;
  convertedAt?: string;
  conversionValue?: number;
  // Calculados
  channelGroup: string; // Paid Social, Paid Search, Organic, Direct, Referral
}

export interface ChannelStats {
  channel: string;
  channelGroup: string;
  leads: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  costPerLead?: number;
  roas?: number; // Return on Ad Spend
}

export interface CampaignStats {
  campaign: string;
  source: string;
  medium?: string;
  leads: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  topLandingPages: Array<{ page: string; leads: number }>;
}

export interface AttributionSummary {
  period: string;
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  overallConversionRate: number;
  byChannel: ChannelStats[];
  byCampaign: CampaignStats[];
  bySource: Array<{ source: string; leads: number; percentage: number }>;
  trends: {
    leadsVsPrevPeriod: number; // % change
    conversionsVsPrevPeriod: number;
  };
}

export interface AdSpend {
  id: string;
  source: string;
  campaign?: string;
  date: string;
  amount: number;
  currency: string;
  createdAt: string;
}

const ATTRIBUTIONS_KEY = 'attribution:leads';
const AD_SPEND_KEY = 'attribution:spend';

// Mapeo de fuentes a grupos de canales
const CHANNEL_GROUPS: Record<string, string> = {
  'facebook': 'Paid Social',
  'instagram': 'Paid Social',
  'tiktok': 'Paid Social',
  'linkedin': 'Paid Social',
  'twitter': 'Paid Social',
  'google': 'Paid Search',
  'bing': 'Paid Search',
  'youtube': 'Paid Video',
  'email': 'Email',
  'whatsapp': 'Direct',
  'organic': 'Organic Search',
  'direct': 'Direct',
  'referral': 'Referral',
  '(direct)': 'Direct',
  '(none)': 'Direct'
};

export class LeadAttributionService {
  private kv: KVNamespace | undefined;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRO DE ATRIBUCIÓN
  // ═══════════════════════════════════════════════════════════════

  /**
   * Registra la atribución de un nuevo lead
   */
  async trackLead(leadId: string, leadPhone: string, params: UTMParams, leadName?: string): Promise<LeadAttribution> {
    const source = this.normalizeSource(params.utm_source || params.referrer || 'direct');

    const attribution: LeadAttribution = {
      id: `attr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      leadId,
      leadPhone,
      leadName,
      source,
      medium: params.utm_medium,
      campaign: params.utm_campaign,
      term: params.utm_term,
      content: params.utm_content,
      referrer: params.referrer,
      landingPage: params.landing_page,
      createdAt: new Date().toISOString(),
      channelGroup: this.getChannelGroup(source, params.utm_medium)
    };

    await this.saveAttribution(attribution);
    console.log(`📊 Attribution registrada: ${leadPhone} desde ${source}`);

    return attribution;
  }

  /**
   * Marca un lead como convertido
   */
  async trackConversion(leadId: string, conversionValue?: number): Promise<LeadAttribution | null> {
    const attributions = await this.getAttributions();
    const index = attributions.findIndex(a => a.leadId === leadId);

    if (index === -1) return null;

    attributions[index].convertedAt = new Date().toISOString();
    attributions[index].conversionValue = conversionValue;

    await this.saveAllAttributions(attributions);
    console.log(`✅ Conversión registrada para lead ${leadId}`);

    return attributions[index];
  }

  /**
   * Obtiene atribución de un lead
   */
  async getLeadAttribution(leadId: string): Promise<LeadAttribution | null> {
    const attributions = await this.getAttributions();
    return attributions.find(a => a.leadId === leadId) || null;
  }

  // ═══════════════════════════════════════════════════════════════
  // GASTO EN PUBLICIDAD
  // ═══════════════════════════════════════════════════════════════

  /**
   * Registra gasto en publicidad
   */
  async recordAdSpend(spend: Omit<AdSpend, 'id' | 'createdAt'>): Promise<AdSpend> {
    const record: AdSpend = {
      ...spend,
      id: `spend_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString()
    };

    const allSpend = await this.getAdSpend();
    allSpend.push(record);

    if (this.kv) {
      await this.kv.put(AD_SPEND_KEY, JSON.stringify(allSpend));
    }

    console.log(`💰 Ad spend registrado: ${spend.source} - $${spend.amount}`);
    return record;
  }

  /**
   * Obtiene gasto en publicidad
   */
  async getAdSpend(filters?: {
    source?: string;
    campaign?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<AdSpend[]> {
    if (!this.kv) return [];

    try {
      let spend = await this.kv.get(AD_SPEND_KEY, 'json') as AdSpend[] || [];

      if (filters) {
        if (filters.source) {
          spend = spend.filter(s => s.source.toLowerCase() === filters.source!.toLowerCase());
        }
        if (filters.campaign) {
          spend = spend.filter(s => s.campaign === filters.campaign);
        }
        if (filters.fromDate) {
          spend = spend.filter(s => s.date >= filters.fromDate!);
        }
        if (filters.toDate) {
          spend = spend.filter(s => s.date <= filters.toDate!);
        }
      }

      return spend;
    } catch (e) {
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ESTADÍSTICAS Y ANALYTICS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene resumen de atribución
   */
  async getSummary(period?: { from: string; to: string }): Promise<AttributionSummary> {
    const fromDate = period?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = period?.to || new Date().toISOString();

    let attributions = await this.getAttributions();
    attributions = attributions.filter(a =>
      a.createdAt >= fromDate && a.createdAt <= toDate
    );

    const totalLeads = attributions.length;
    const conversions = attributions.filter(a => a.convertedAt);
    const totalConversions = conversions.length;
    const totalRevenue = conversions.reduce((sum, a) => sum + (a.conversionValue || 0), 0);

    // Por canal
    const byChannel = await this.getChannelStats(attributions);

    // Por campaña
    const byCampaign = this.getCampaignStats(attributions);

    // Por fuente
    const sourceMap = new Map<string, number>();
    for (const a of attributions) {
      sourceMap.set(a.source, (sourceMap.get(a.source) || 0) + 1);
    }
    const bySource = Array.from(sourceMap.entries())
      .map(([source, leads]) => ({
        source,
        leads,
        percentage: totalLeads > 0 ? Math.round((leads / totalLeads) * 100) : 0
      }))
      .sort((a, b) => b.leads - a.leads);

    // Trends vs período anterior
    const periodDays = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000));
    const prevFromDate = new Date(new Date(fromDate).getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString();
    const prevToDate = fromDate;

    let prevAttributions = await this.getAttributions();
    prevAttributions = prevAttributions.filter(a =>
      a.createdAt >= prevFromDate && a.createdAt < prevToDate
    );

    const prevLeads = prevAttributions.length;
    const prevConversions = prevAttributions.filter(a => a.convertedAt).length;

    const leadsChange = prevLeads > 0 ? Math.round(((totalLeads - prevLeads) / prevLeads) * 100) : 0;
    const conversionsChange = prevConversions > 0
      ? Math.round(((totalConversions - prevConversions) / prevConversions) * 100)
      : 0;

    return {
      period: `${fromDate.split('T')[0]} - ${toDate.split('T')[0]}`,
      totalLeads,
      totalConversions,
      totalRevenue,
      overallConversionRate: totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0,
      byChannel,
      byCampaign,
      bySource,
      trends: {
        leadsVsPrevPeriod: leadsChange,
        conversionsVsPrevPeriod: conversionsChange
      }
    };
  }

  /**
   * Obtiene estadísticas por canal
   */
  private async getChannelStats(attributions: LeadAttribution[]): Promise<ChannelStats[]> {
    const channelMap = new Map<string, {
      channel: string;
      channelGroup: string;
      leads: LeadAttribution[];
    }>();

    for (const a of attributions) {
      const key = a.source;
      if (!channelMap.has(key)) {
        channelMap.set(key, {
          channel: a.source,
          channelGroup: a.channelGroup,
          leads: []
        });
      }
      channelMap.get(key)!.leads.push(a);
    }

    // Obtener gasto por canal
    const spend = await this.getAdSpend();
    const spendBySource = new Map<string, number>();
    for (const s of spend) {
      const key = s.source.toLowerCase();
      spendBySource.set(key, (spendBySource.get(key) || 0) + s.amount);
    }

    const stats: ChannelStats[] = [];

    for (const [, data] of channelMap) {
      const conversions = data.leads.filter(l => l.convertedAt);
      const revenue = conversions.reduce((sum, l) => sum + (l.conversionValue || 0), 0);
      const totalSpend = spendBySource.get(data.channel.toLowerCase()) || 0;

      stats.push({
        channel: data.channel,
        channelGroup: data.channelGroup,
        leads: data.leads.length,
        conversions: conversions.length,
        conversionRate: data.leads.length > 0
          ? Math.round((conversions.length / data.leads.length) * 100)
          : 0,
        revenue,
        costPerLead: data.leads.length > 0 && totalSpend > 0
          ? Math.round(totalSpend / data.leads.length)
          : undefined,
        roas: totalSpend > 0 && revenue > 0
          ? Math.round((revenue / totalSpend) * 100) / 100
          : undefined
      });
    }

    return stats.sort((a, b) => b.leads - a.leads);
  }

  /**
   * Obtiene estadísticas por campaña
   */
  private getCampaignStats(attributions: LeadAttribution[]): CampaignStats[] {
    const campaignMap = new Map<string, {
      campaign: string;
      source: string;
      medium?: string;
      leads: LeadAttribution[];
    }>();

    for (const a of attributions) {
      if (!a.campaign) continue;

      const key = `${a.source}:${a.campaign}`;
      if (!campaignMap.has(key)) {
        campaignMap.set(key, {
          campaign: a.campaign,
          source: a.source,
          medium: a.medium,
          leads: []
        });
      }
      campaignMap.get(key)!.leads.push(a);
    }

    const stats: CampaignStats[] = [];

    for (const [, data] of campaignMap) {
      const conversions = data.leads.filter(l => l.convertedAt);
      const revenue = conversions.reduce((sum, l) => sum + (l.conversionValue || 0), 0);

      // Top landing pages
      const pageMap = new Map<string, number>();
      for (const l of data.leads) {
        if (l.landingPage) {
          pageMap.set(l.landingPage, (pageMap.get(l.landingPage) || 0) + 1);
        }
      }
      const topLandingPages = Array.from(pageMap.entries())
        .map(([page, leads]) => ({ page, leads }))
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 3);

      stats.push({
        campaign: data.campaign,
        source: data.source,
        medium: data.medium,
        leads: data.leads.length,
        conversions: conversions.length,
        conversionRate: data.leads.length > 0
          ? Math.round((conversions.length / data.leads.length) * 100)
          : 0,
        revenue,
        topLandingPages
      });
    }

    return stats.sort((a, b) => b.leads - a.leads);
  }

  /**
   * Obtiene el mejor canal de conversión
   */
  async getBestPerformingChannel(): Promise<{ channel: string; conversionRate: number } | null> {
    const summary = await this.getSummary();

    if (summary.byChannel.length === 0) return null;

    // Filtrar canales con al menos 5 leads para significancia estadística
    const significant = summary.byChannel.filter(c => c.leads >= 5);

    if (significant.length === 0) {
      return {
        channel: summary.byChannel[0].channel,
        conversionRate: summary.byChannel[0].conversionRate
      };
    }

    const best = significant.reduce((a, b) =>
      a.conversionRate > b.conversionRate ? a : b
    );

    return {
      channel: best.channel,
      conversionRate: best.conversionRate
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  private normalizeSource(source: string): string {
    const lower = source.toLowerCase().trim();

    // Detectar fuentes comunes de referrer
    if (lower.includes('facebook') || lower.includes('fb.')) return 'facebook';
    if (lower.includes('instagram')) return 'instagram';
    if (lower.includes('google')) return 'google';
    if (lower.includes('tiktok')) return 'tiktok';
    if (lower.includes('youtube')) return 'youtube';
    if (lower.includes('linkedin')) return 'linkedin';
    if (lower.includes('twitter') || lower.includes('x.com')) return 'twitter';

    return lower || 'direct';
  }

  private getChannelGroup(source: string, medium?: string): string {
    const lower = source.toLowerCase();

    // Si tiene medium de pago
    if (medium && ['cpc', 'ppc', 'paid', 'ad', 'ads'].includes(medium.toLowerCase())) {
      if (['facebook', 'instagram', 'tiktok', 'linkedin', 'twitter'].includes(lower)) {
        return 'Paid Social';
      }
      if (['google', 'bing'].includes(lower)) {
        return 'Paid Search';
      }
    }

    return CHANNEL_GROUPS[lower] || 'Other';
  }

  private async getAttributions(): Promise<LeadAttribution[]> {
    if (!this.kv) return [];

    try {
      return await this.kv.get(ATTRIBUTIONS_KEY, 'json') as LeadAttribution[] || [];
    } catch (e) {
      return [];
    }
  }

  private async saveAttribution(attribution: LeadAttribution): Promise<void> {
    const attributions = await this.getAttributions();
    attributions.push(attribution);

    // Mantener últimos 10,000 registros
    const trimmed = attributions.slice(-10000);
    await this.saveAllAttributions(trimmed);
  }

  private async saveAllAttributions(attributions: LeadAttribution[]): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(ATTRIBUTIONS_KEY, JSON.stringify(attributions));
  }

  /**
   * Parsea UTM params de una URL
   */
  static parseUTMFromURL(urlString: string): UTMParams {
    try {
      const url = new URL(urlString);
      return {
        utm_source: url.searchParams.get('utm_source') || undefined,
        utm_medium: url.searchParams.get('utm_medium') || undefined,
        utm_campaign: url.searchParams.get('utm_campaign') || undefined,
        utm_term: url.searchParams.get('utm_term') || undefined,
        utm_content: url.searchParams.get('utm_content') || undefined,
        landing_page: url.pathname
      };
    } catch (e) {
      return {};
    }
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createLeadAttribution(kv?: KVNamespace): LeadAttributionService {
  return new LeadAttributionService(kv);
}
