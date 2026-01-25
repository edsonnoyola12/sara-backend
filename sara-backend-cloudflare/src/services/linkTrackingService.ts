// ═══════════════════════════════════════════════════════════════════════════
// LINK TRACKING SERVICE - Rastreo de clicks en enlaces
// ═══════════════════════════════════════════════════════════════════════════
// Crea enlaces rastreados para medir engagement de leads
// Registra clicks con metadata (timestamp, IP, user-agent)
// ═══════════════════════════════════════════════════════════════════════════

export interface TrackedLink {
  id: string;
  shortCode: string;
  originalUrl: string;
  leadId?: string;
  leadPhone?: string;
  campaignId?: string;
  campaignName?: string;
  tags?: string[];
  createdAt: string;
  expiresAt?: string;
  clickCount: number;
  lastClickAt?: string;
  metadata?: Record<string, any>;
}

export interface LinkClick {
  id: string;
  linkId: string;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  country?: string;
  device?: 'mobile' | 'desktop' | 'tablet';
  browser?: string;
}

export interface LinkStats {
  totalClicks: number;
  uniqueClicks: number;
  clicksByDay: Record<string, number>;
  clicksByDevice: Record<string, number>;
  clicksByCountry: Record<string, number>;
  firstClick?: string;
  lastClick?: string;
}

export interface CampaignStats {
  campaignId: string;
  campaignName: string;
  totalLinks: number;
  totalClicks: number;
  clickRate: number;
  topLinks: Array<{ url: string; clicks: number }>;
}

const LINKS_KEY = 'tracking:links';
const CLICKS_PREFIX = 'tracking:clicks:';
const CAMPAIGN_INDEX = 'tracking:campaigns';

export class LinkTrackingService {
  private kv: KVNamespace | undefined;
  private baseUrl: string;

  constructor(kv?: KVNamespace, baseUrl: string = 'https://sara.gruposantarita.com') {
    this.kv = kv;
    this.baseUrl = baseUrl;
  }

  // ═══════════════════════════════════════════════════════════════
  // CREACIÓN DE ENLACES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Crea un enlace rastreable
   */
  async createLink(options: {
    url: string;
    leadId?: string;
    leadPhone?: string;
    campaignId?: string;
    campaignName?: string;
    tags?: string[];
    expiresInDays?: number;
    metadata?: Record<string, any>;
  }): Promise<TrackedLink> {
    const shortCode = this.generateShortCode();

    const link: TrackedLink = {
      id: `lnk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      shortCode,
      originalUrl: options.url,
      leadId: options.leadId,
      leadPhone: options.leadPhone,
      campaignId: options.campaignId,
      campaignName: options.campaignName,
      tags: options.tags,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      clickCount: 0,
      metadata: options.metadata
    };

    // Guardar enlace
    await this.saveLink(link);

    // Actualizar índice de campañas si aplica
    if (options.campaignId) {
      await this.addToCampaignIndex(options.campaignId, link.id);
    }

    console.log(`🔗 Link creado: ${this.getTrackingUrl(shortCode)}`);

    return link;
  }

  /**
   * Genera URL de tracking
   */
  getTrackingUrl(shortCode: string): string {
    return `${this.baseUrl}/t/${shortCode}`;
  }

  /**
   * Genera shortcode único
   */
  private generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRO DE CLICKS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Registra un click en un enlace
   */
  async recordClick(
    shortCode: string,
    clickData?: {
      ip?: string;
      userAgent?: string;
      referrer?: string;
    }
  ): Promise<{ success: boolean; redirectUrl?: string; error?: string }> {
    const link = await this.getLinkByShortCode(shortCode);

    if (!link) {
      return { success: false, error: 'Enlace no encontrado' };
    }

    // Verificar expiración
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return { success: false, error: 'Enlace expirado' };
    }

    // Crear registro de click
    const click: LinkClick = {
      id: `clk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      linkId: link.id,
      timestamp: new Date().toISOString(),
      ip: clickData?.ip,
      userAgent: clickData?.userAgent,
      referrer: clickData?.referrer,
      device: this.detectDevice(clickData?.userAgent),
      browser: this.detectBrowser(clickData?.userAgent)
    };

    // Guardar click
    await this.saveClick(link.id, click);

    // Actualizar contador del enlace
    link.clickCount++;
    link.lastClickAt = click.timestamp;
    await this.saveLink(link);

    console.log(`📊 Click registrado: ${shortCode} (total: ${link.clickCount})`);

    return {
      success: true,
      redirectUrl: link.originalUrl
    };
  }

  /**
   * Detecta tipo de dispositivo
   */
  private detectDevice(userAgent?: string): 'mobile' | 'desktop' | 'tablet' {
    if (!userAgent) return 'desktop';

    const ua = userAgent.toLowerCase();

    if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';

    return 'desktop';
  }

  /**
   * Detecta navegador
   */
  private detectBrowser(userAgent?: string): string {
    if (!userAgent) return 'unknown';

    const ua = userAgent.toLowerCase();

    if (ua.includes('chrome') && !ua.includes('edge')) return 'Chrome';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('edge')) return 'Edge';
    if (ua.includes('opera') || ua.includes('opr')) return 'Opera';

    return 'other';
  }

  // ═══════════════════════════════════════════════════════════════
  // CONSULTA DE ENLACES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene enlace por shortcode
   */
  async getLinkByShortCode(shortCode: string): Promise<TrackedLink | null> {
    const links = await this.getAllLinks();
    return links.find(l => l.shortCode === shortCode) || null;
  }

  /**
   * Obtiene enlace por ID
   */
  async getLink(id: string): Promise<TrackedLink | null> {
    const links = await this.getAllLinks();
    return links.find(l => l.id === id) || null;
  }

  /**
   * Obtiene todos los enlaces
   */
  async getAllLinks(): Promise<TrackedLink[]> {
    if (!this.kv) return [];

    try {
      const data = await this.kv.get(LINKS_KEY, 'json');
      return (data as TrackedLink[]) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Obtiene enlaces de un lead
   */
  async getLinksByLead(leadId: string): Promise<TrackedLink[]> {
    const links = await this.getAllLinks();
    return links.filter(l => l.leadId === leadId);
  }

  /**
   * Obtiene enlaces de una campaña
   */
  async getLinksByCampaign(campaignId: string): Promise<TrackedLink[]> {
    const links = await this.getAllLinks();
    return links.filter(l => l.campaignId === campaignId);
  }

  // ═══════════════════════════════════════════════════════════════
  // ESTADÍSTICAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene estadísticas de un enlace
   */
  async getLinkStats(linkId: string): Promise<LinkStats | null> {
    const clicks = await this.getClicks(linkId);

    if (clicks.length === 0) {
      return {
        totalClicks: 0,
        uniqueClicks: 0,
        clicksByDay: {},
        clicksByDevice: {},
        clicksByCountry: {}
      };
    }

    // Calcular estadísticas
    const uniqueIps = new Set(clicks.filter(c => c.ip).map(c => c.ip));
    const byDay: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    const byCountry: Record<string, number> = {};

    for (const click of clicks) {
      // Por día
      const day = click.timestamp.split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;

      // Por dispositivo
      const device = click.device || 'unknown';
      byDevice[device] = (byDevice[device] || 0) + 1;

      // Por país (si está disponible)
      if (click.country) {
        byCountry[click.country] = (byCountry[click.country] || 0) + 1;
      }
    }

    return {
      totalClicks: clicks.length,
      uniqueClicks: uniqueIps.size,
      clicksByDay: byDay,
      clicksByDevice: byDevice,
      clicksByCountry: byCountry,
      firstClick: clicks[0]?.timestamp,
      lastClick: clicks[clicks.length - 1]?.timestamp
    };
  }

  /**
   * Obtiene estadísticas de una campaña
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    const links = await this.getLinksByCampaign(campaignId);

    if (links.length === 0) {
      return null;
    }

    const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);
    const topLinks = links
      .sort((a, b) => b.clickCount - a.clickCount)
      .slice(0, 5)
      .map(l => ({ url: l.originalUrl, clicks: l.clickCount }));

    return {
      campaignId,
      campaignName: links[0].campaignName || campaignId,
      totalLinks: links.length,
      totalClicks,
      clickRate: totalClicks / links.length,
      topLinks
    };
  }

  /**
   * Obtiene resumen general de tracking
   */
  async getSummary(): Promise<{
    totalLinks: number;
    totalClicks: number;
    activeLinks: number;
    topCampaigns: Array<{ name: string; clicks: number }>;
    recentClicks: LinkClick[];
  }> {
    const links = await this.getAllLinks();
    const now = new Date();

    const activeLinks = links.filter(
      l => !l.expiresAt || new Date(l.expiresAt) > now
    ).length;

    const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);

    // Agrupar por campaña
    const campaignClicks: Record<string, { name: string; clicks: number }> = {};
    for (const link of links) {
      if (link.campaignId) {
        if (!campaignClicks[link.campaignId]) {
          campaignClicks[link.campaignId] = {
            name: link.campaignName || link.campaignId,
            clicks: 0
          };
        }
        campaignClicks[link.campaignId].clicks += link.clickCount;
      }
    }

    const topCampaigns = Object.values(campaignClicks)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5);

    // Obtener clicks recientes
    const recentClicks: LinkClick[] = [];
    for (const link of links.slice(0, 10)) {
      const clicks = await this.getClicks(link.id);
      recentClicks.push(...clicks.slice(-2));
    }
    recentClicks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      totalLinks: links.length,
      totalClicks,
      activeLinks,
      topCampaigns,
      recentClicks: recentClicks.slice(0, 10)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ═══════════════════════════════════════════════════════════════

  private async saveLink(link: TrackedLink): Promise<void> {
    if (!this.kv) return;

    const links = await this.getAllLinks();
    const index = links.findIndex(l => l.id === link.id);

    if (index >= 0) {
      links[index] = link;
    } else {
      links.push(link);
    }

    await this.kv.put(LINKS_KEY, JSON.stringify(links));
  }

  private async saveClick(linkId: string, click: LinkClick): Promise<void> {
    if (!this.kv) return;

    const clicks = await this.getClicks(linkId);
    clicks.push(click);

    // Mantener solo los últimos 1000 clicks por enlace
    const trimmed = clicks.slice(-1000);
    await this.kv.put(`${CLICKS_PREFIX}${linkId}`, JSON.stringify(trimmed));
  }

  private async getClicks(linkId: string): Promise<LinkClick[]> {
    if (!this.kv) return [];

    try {
      const data = await this.kv.get(`${CLICKS_PREFIX}${linkId}`, 'json');
      return (data as LinkClick[]) || [];
    } catch (e) {
      return [];
    }
  }

  private async addToCampaignIndex(campaignId: string, linkId: string): Promise<void> {
    if (!this.kv) return;

    try {
      const index = await this.kv.get(CAMPAIGN_INDEX, 'json') as Record<string, string[]> || {};
      if (!index[campaignId]) {
        index[campaignId] = [];
      }
      if (!index[campaignId].includes(linkId)) {
        index[campaignId].push(linkId);
      }
      await this.kv.put(CAMPAIGN_INDEX, JSON.stringify(index));
    } catch (e) {
      console.error('Error actualizando índice de campañas:', e);
    }
  }

  /**
   * Elimina un enlace
   */
  async deleteLink(id: string): Promise<boolean> {
    const links = await this.getAllLinks();
    const filtered = links.filter(l => l.id !== id);

    if (filtered.length === links.length) return false;

    if (this.kv) {
      await this.kv.put(LINKS_KEY, JSON.stringify(filtered));
      // También eliminar clicks asociados
      await this.kv.delete(`${CLICKS_PREFIX}${id}`);
    }

    return true;
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createLinkTracking(kv?: KVNamespace, baseUrl?: string): LinkTrackingService {
  return new LinkTrackingService(kv, baseUrl);
}
