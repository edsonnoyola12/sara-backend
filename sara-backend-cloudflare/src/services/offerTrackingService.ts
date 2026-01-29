// ═══════════════════════════════════════════════════════════════════════════
// OFFER TRACKING SERVICE - Tracking de Ofertas y Negociaciones
// Tracks quotes, negotiations, reservations, and offer analytics
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Offer {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  property_id: string | null;
  property_name: string;
  development: string;

  // Pricing
  list_price: number;
  offered_price: number;
  discount_percent: number;
  discount_amount: number;

  // Status tracking
  status: OfferStatus;
  status_history: StatusChange[];

  // Dates
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  responded_at: string | null;
  closed_at: string | null;

  // Assignment
  vendor_id: string | null;
  vendor_name: string | null;

  // Notes
  notes: string | null;
  rejection_reason: string | null;

  // Financing
  financing_type: 'cash' | 'credit' | 'infonavit' | 'fovissste' | 'cofinavit' | null;
  down_payment_percent: number | null;

  // Follow-up
  next_followup: string | null;
  followup_count: number;
}

export type OfferStatus =
  | 'draft'           // Borrador
  | 'sent'            // Enviada al cliente
  | 'viewed'          // Cliente la vio
  | 'negotiating'     // En negociación
  | 'counter_offer'   // Contraoferta del cliente
  | 'accepted'        // Aceptada
  | 'reserved'        // Apartado
  | 'contracted'      // Contrato firmado
  | 'rejected'        // Rechazada
  | 'expired'         // Expirada
  | 'cancelled';      // Cancelada

export interface StatusChange {
  from: OfferStatus;
  to: OfferStatus;
  changed_at: string;
  changed_by: string | null;
  notes: string | null;
}

export interface OfferSummary {
  generated_at: string;
  period_days: number;

  // Counts by status
  total_offers: number;
  by_status: Record<OfferStatus, number>;

  // Conversion metrics
  sent_count: number;
  accepted_count: number;
  reserved_count: number;
  contracted_count: number;
  rejected_count: number;
  expired_count: number;

  // Rates
  acceptance_rate: string;
  reservation_rate: string;
  contract_rate: string;
  rejection_rate: string;

  // Value metrics
  total_offered_value: number;
  total_accepted_value: number;
  total_reserved_value: number;
  avg_discount_percent: number;

  // Time metrics
  avg_response_time_hours: number;
  avg_negotiation_days: number;

  // By development
  by_development: Array<{
    development: string;
    offers: number;
    accepted: number;
    reserved: number;
    total_value: number;
    acceptance_rate: string;
  }>;

  // By vendor
  by_vendor: Array<{
    vendor_id: string;
    vendor_name: string;
    offers: number;
    accepted: number;
    reserved: number;
    acceptance_rate: string;
    avg_discount: number;
  }>;

  // Recent offers
  recent_offers: Offer[];
  pending_followups: Offer[];
  expiring_soon: Offer[];
}

export interface CreateOfferParams {
  lead_id: string;
  property_id?: string;
  property_name: string;
  development: string;
  list_price: number;
  offered_price: number;
  vendor_id?: string;
  financing_type?: 'cash' | 'credit' | 'infonavit' | 'fovissste' | 'cofinavit';
  down_payment_percent?: number;
  expires_days?: number;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class OfferTrackingService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE OFFER
  // ═══════════════════════════════════════════════════════════════════════════

  async createOffer(params: CreateOfferParams): Promise<Offer | null> {
    // Get lead info
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to')
      .eq('id', params.lead_id)
      .single();

    if (!lead) return null;

    const now = new Date();
    const expiresAt = params.expires_days
      ? new Date(now.getTime() + params.expires_days * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

    const discountAmount = params.list_price - params.offered_price;
    const discountPercent = params.list_price > 0
      ? Math.round((discountAmount / params.list_price) * 100 * 10) / 10
      : 0;

    const offerData = {
      lead_id: params.lead_id,
      property_id: params.property_id || null,
      property_name: params.property_name,
      development: params.development,
      list_price: params.list_price,
      offered_price: params.offered_price,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      status: 'draft' as OfferStatus,
      status_history: JSON.stringify([{
        from: null,
        to: 'draft',
        changed_at: now.toISOString(),
        changed_by: params.vendor_id || null,
        notes: 'Oferta creada'
      }]),
      vendor_id: params.vendor_id || lead.assigned_to,
      financing_type: params.financing_type || null,
      down_payment_percent: params.down_payment_percent || null,
      expires_at: expiresAt.toISOString(),
      notes: params.notes || null,
      followup_count: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const { data: offer, error } = await this.supabase.client
      .from('offers')
      .insert(offerData)
      .select()
      .single();

    if (error) {
      console.error('Error creating offer:', error);
      // If table doesn't exist, we'll handle it gracefully
      return null;
    }

    return this.mapToOffer(offer, lead.name, lead.phone, null);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE OFFER STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  async updateOfferStatus(
    offerId: string,
    newStatus: OfferStatus,
    notes?: string,
    changedBy?: string
  ): Promise<boolean> {
    // Get current offer
    const { data: offer } = await this.supabase.client
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (!offer) return false;

    const now = new Date().toISOString();
    const currentHistory = this.parseStatusHistory(offer.status_history);

    currentHistory.push({
      from: offer.status,
      to: newStatus,
      changed_at: now,
      changed_by: changedBy || null,
      notes: notes || null
    });

    const updateData: any = {
      status: newStatus,
      status_history: JSON.stringify(currentHistory),
      updated_at: now
    };

    // Set specific timestamps based on status
    if (newStatus === 'sent' && !offer.sent_at) {
      updateData.sent_at = now;
    }
    if (['accepted', 'rejected', 'counter_offer'].includes(newStatus) && !offer.responded_at) {
      updateData.responded_at = now;
    }
    if (['contracted', 'rejected', 'expired', 'cancelled'].includes(newStatus)) {
      updateData.closed_at = now;
    }
    if (newStatus === 'rejected' && notes) {
      updateData.rejection_reason = notes;
    }

    const { error } = await this.supabase.client
      .from('offers')
      .update(updateData)
      .eq('id', offerId);

    if (error) {
      console.error('Error updating offer status:', error);
      return false;
    }

    // Update lead status if offer is accepted/reserved
    if (['accepted', 'reserved'].includes(newStatus)) {
      await this.supabase.client
        .from('leads')
        .update({
          status: newStatus === 'reserved' ? 'reserved' : 'negotiating',
          funnel_status: newStatus === 'reserved' ? 'reserved' : 'negotiating',
          updated_at: now
        })
        .eq('id', offer.lead_id);
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET OFFERS
  // ═══════════════════════════════════════════════════════════════════════════

  async getOfferById(offerId: string): Promise<Offer | null> {
    const { data: offer } = await this.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .eq('id', offerId)
      .single();

    if (!offer) return null;

    const vendorName = await this.getVendorName(offer.vendor_id);
    return this.mapToOffer(offer, offer.leads?.name, offer.leads?.phone, vendorName);
  }

  async getOffersByLead(leadId: string): Promise<Offer[]> {
    const { data: offers } = await this.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (!offers || offers.length === 0) return [];

    const vendorMap = await this.getVendorMap(offers.map(o => o.vendor_id).filter(Boolean));

    return offers.map(o => this.mapToOffer(
      o,
      o.leads?.name,
      o.leads?.phone,
      vendorMap.get(o.vendor_id)
    ));
  }

  async getOffersByStatus(status: OfferStatus | OfferStatus[]): Promise<Offer[]> {
    const statuses = Array.isArray(status) ? status : [status];

    const { data: offers } = await this.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!offers || offers.length === 0) return [];

    const vendorMap = await this.getVendorMap(offers.map(o => o.vendor_id).filter(Boolean));

    return offers.map(o => this.mapToOffer(
      o,
      o.leads?.name,
      o.leads?.phone,
      vendorMap.get(o.vendor_id)
    ));
  }

  async getActiveOffers(): Promise<Offer[]> {
    return this.getOffersByStatus(['sent', 'viewed', 'negotiating', 'counter_offer']);
  }

  async getPendingFollowups(): Promise<Offer[]> {
    const now = new Date().toISOString();

    const { data: offers } = await this.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .in('status', ['sent', 'viewed', 'negotiating', 'counter_offer'])
      .lte('next_followup', now)
      .order('next_followup', { ascending: true })
      .limit(20);

    if (!offers || offers.length === 0) return [];

    const vendorMap = await this.getVendorMap(offers.map(o => o.vendor_id).filter(Boolean));

    return offers.map(o => this.mapToOffer(
      o,
      o.leads?.name,
      o.leads?.phone,
      vendorMap.get(o.vendor_id)
    ));
  }

  async getExpiringSoon(days: number = 3): Promise<Offer[]> {
    const now = new Date();
    const deadline = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { data: offers } = await this.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .in('status', ['sent', 'viewed', 'negotiating', 'counter_offer'])
      .gte('expires_at', now.toISOString())
      .lte('expires_at', deadline.toISOString())
      .order('expires_at', { ascending: true });

    if (!offers || offers.length === 0) return [];

    const vendorMap = await this.getVendorMap(offers.map(o => o.vendor_id).filter(Boolean));

    return offers.map(o => this.mapToOffer(
      o,
      o.leads?.name,
      o.leads?.phone,
      vendorMap.get(o.vendor_id)
    ));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OFFER SUMMARY / ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getOfferSummary(days: number = 30): Promise<OfferSummary> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: offers } = await this.supabase.client
      .from('offers')
      .select('*, leads(name, phone)')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    const allOffers = offers || [];
    const vendorMap = await this.getVendorMap(allOffers.map(o => o.vendor_id).filter(Boolean));

    // Count by status
    const byStatus: Record<OfferStatus, number> = {
      draft: 0, sent: 0, viewed: 0, negotiating: 0, counter_offer: 0,
      accepted: 0, reserved: 0, contracted: 0, rejected: 0, expired: 0, cancelled: 0
    };

    for (const offer of allOffers) {
      if (byStatus[offer.status as OfferStatus] !== undefined) {
        byStatus[offer.status as OfferStatus]++;
      }
    }

    const sentCount = allOffers.filter(o => o.sent_at).length;
    const acceptedCount = byStatus.accepted + byStatus.reserved + byStatus.contracted;
    const reservedCount = byStatus.reserved + byStatus.contracted;
    const contractedCount = byStatus.contracted;
    const rejectedCount = byStatus.rejected;
    const expiredCount = byStatus.expired;

    // Rates
    const acceptanceRate = sentCount > 0
      ? ((acceptedCount / sentCount) * 100).toFixed(1) + '%'
      : '0%';
    const reservationRate = sentCount > 0
      ? ((reservedCount / sentCount) * 100).toFixed(1) + '%'
      : '0%';
    const contractRate = sentCount > 0
      ? ((contractedCount / sentCount) * 100).toFixed(1) + '%'
      : '0%';
    const rejectionRate = sentCount > 0
      ? ((rejectedCount / sentCount) * 100).toFixed(1) + '%'
      : '0%';

    // Value metrics
    const totalOfferedValue = allOffers.reduce((sum, o) => sum + (Number(o.offered_price) || 0), 0);
    const acceptedOffers = allOffers.filter(o =>
      ['accepted', 'reserved', 'contracted'].includes(o.status)
    );
    const totalAcceptedValue = acceptedOffers.reduce((sum, o) => sum + (Number(o.offered_price) || 0), 0);
    const reservedOffers = allOffers.filter(o =>
      ['reserved', 'contracted'].includes(o.status)
    );
    const totalReservedValue = reservedOffers.reduce((sum, o) => sum + (Number(o.offered_price) || 0), 0);

    const discounts = allOffers.filter(o => o.discount_percent > 0).map(o => Number(o.discount_percent));
    const avgDiscountPercent = discounts.length > 0
      ? Math.round((discounts.reduce((a, b) => a + b, 0) / discounts.length) * 10) / 10
      : 0;

    // Time metrics
    const responseTimes = allOffers
      .filter(o => o.sent_at && o.responded_at)
      .map(o => {
        const sent = new Date(o.sent_at).getTime();
        const responded = new Date(o.responded_at).getTime();
        return (responded - sent) / (1000 * 60 * 60); // hours
      });
    const avgResponseTimeHours = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    const negotiationDays = allOffers
      .filter(o => o.sent_at && o.closed_at && ['accepted', 'reserved', 'contracted'].includes(o.status))
      .map(o => {
        const sent = new Date(o.sent_at).getTime();
        const closed = new Date(o.closed_at).getTime();
        return (closed - sent) / (1000 * 60 * 60 * 24); // days
      });
    const avgNegotiationDays = negotiationDays.length > 0
      ? Math.round(negotiationDays.reduce((a, b) => a + b, 0) / negotiationDays.length)
      : 0;

    // By development
    const devStats: Record<string, { offers: number; accepted: number; reserved: number; value: number }> = {};
    for (const o of allOffers) {
      const dev = o.development || 'Otro';
      if (!devStats[dev]) {
        devStats[dev] = { offers: 0, accepted: 0, reserved: 0, value: 0 };
      }
      devStats[dev].offers++;
      devStats[dev].value += Number(o.offered_price) || 0;
      if (['accepted', 'reserved', 'contracted'].includes(o.status)) {
        devStats[dev].accepted++;
      }
      if (['reserved', 'contracted'].includes(o.status)) {
        devStats[dev].reserved++;
      }
    }
    const byDevelopment = Object.entries(devStats)
      .map(([development, stats]) => ({
        development,
        offers: stats.offers,
        accepted: stats.accepted,
        reserved: stats.reserved,
        total_value: stats.value,
        acceptance_rate: stats.offers > 0
          ? ((stats.accepted / stats.offers) * 100).toFixed(1) + '%'
          : '0%'
      }))
      .sort((a, b) => b.offers - a.offers);

    // By vendor
    const vendorStats: Record<string, {
      offers: number; accepted: number; reserved: number; discounts: number[]
    }> = {};
    for (const o of allOffers) {
      if (!o.vendor_id) continue;
      if (!vendorStats[o.vendor_id]) {
        vendorStats[o.vendor_id] = { offers: 0, accepted: 0, reserved: 0, discounts: [] };
      }
      vendorStats[o.vendor_id].offers++;
      if (o.discount_percent > 0) {
        vendorStats[o.vendor_id].discounts.push(Number(o.discount_percent));
      }
      if (['accepted', 'reserved', 'contracted'].includes(o.status)) {
        vendorStats[o.vendor_id].accepted++;
      }
      if (['reserved', 'contracted'].includes(o.status)) {
        vendorStats[o.vendor_id].reserved++;
      }
    }
    const byVendor = Object.entries(vendorStats)
      .map(([vendorId, stats]) => ({
        vendor_id: vendorId,
        vendor_name: vendorMap.get(vendorId) || 'Desconocido',
        offers: stats.offers,
        accepted: stats.accepted,
        reserved: stats.reserved,
        acceptance_rate: stats.offers > 0
          ? ((stats.accepted / stats.offers) * 100).toFixed(1) + '%'
          : '0%',
        avg_discount: stats.discounts.length > 0
          ? Math.round((stats.discounts.reduce((a, b) => a + b, 0) / stats.discounts.length) * 10) / 10
          : 0
      }))
      .sort((a, b) => b.offers - a.offers);

    // Recent, pending, expiring
    const recentOffers = allOffers.slice(0, 10).map(o =>
      this.mapToOffer(o, o.leads?.name, o.leads?.phone, vendorMap.get(o.vendor_id))
    );

    const pendingFollowups = await this.getPendingFollowups();
    const expiringSoon = await this.getExpiringSoon(3);

    return {
      generated_at: new Date().toISOString(),
      period_days: days,
      total_offers: allOffers.length,
      by_status: byStatus,
      sent_count: sentCount,
      accepted_count: acceptedCount,
      reserved_count: reservedCount,
      contracted_count: contractedCount,
      rejected_count: rejectedCount,
      expired_count: expiredCount,
      acceptance_rate: acceptanceRate,
      reservation_rate: reservationRate,
      contract_rate: contractRate,
      rejection_rate: rejectionRate,
      total_offered_value: totalOfferedValue,
      total_accepted_value: totalAcceptedValue,
      total_reserved_value: totalReservedValue,
      avg_discount_percent: avgDiscountPercent,
      avg_response_time_hours: avgResponseTimeHours,
      avg_negotiation_days: avgNegotiationDays,
      by_development: byDevelopment,
      by_vendor: byVendor,
      recent_offers: recentOffers,
      pending_followups: pendingFollowups,
      expiring_soon: expiringSoon
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatSummaryForWhatsApp(summary: OfferSummary): string {
    let msg = `📋 *TRACKING DE OFERTAS*\n`;
    msg += `📊 Últimos ${summary.period_days} días\n\n`;

    msg += `*Resumen:*\n`;
    msg += `• Total ofertas: ${summary.total_offers}\n`;
    msg += `• 📤 Enviadas: ${summary.sent_count}\n`;
    msg += `• ✅ Aceptadas: ${summary.accepted_count}\n`;
    msg += `• 🏠 Apartados: ${summary.reserved_count}\n`;
    msg += `• 📝 Contratos: ${summary.contracted_count}\n`;
    msg += `• ❌ Rechazadas: ${summary.rejected_count}\n\n`;

    msg += `*Métricas:*\n`;
    msg += `• Tasa aceptación: ${summary.acceptance_rate}\n`;
    msg += `• Tasa apartado: ${summary.reservation_rate}\n`;
    msg += `• Descuento promedio: ${summary.avg_discount_percent}%\n`;
    msg += `• Tiempo respuesta: ${summary.avg_response_time_hours}h\n\n`;

    msg += `*Valores:*\n`;
    msg += `• Ofertado: $${this.formatNumber(summary.total_offered_value)}\n`;
    msg += `• Aceptado: $${this.formatNumber(summary.total_accepted_value)}\n`;
    msg += `• Apartado: $${this.formatNumber(summary.total_reserved_value)}\n\n`;

    if (summary.expiring_soon.length > 0) {
      msg += `⚠️ *Por vencer (${summary.expiring_soon.length}):*\n`;
      for (const o of summary.expiring_soon.slice(0, 3)) {
        msg += `• ${o.lead_name} - ${o.development}\n`;
      }
      msg += `\n`;
    }

    if (summary.pending_followups.length > 0) {
      msg += `📞 *Seguimiento pendiente (${summary.pending_followups.length}):*\n`;
      for (const o of summary.pending_followups.slice(0, 3)) {
        msg += `• ${o.lead_name} - ${o.status}\n`;
      }
    }

    return msg;
  }

  formatOfferForWhatsApp(offer: Offer): string {
    const statusEmoji: Record<OfferStatus, string> = {
      draft: '📝', sent: '📤', viewed: '👁️', negotiating: '🤝',
      counter_offer: '↩️', accepted: '✅', reserved: '🏠',
      contracted: '📄', rejected: '❌', expired: '⏰', cancelled: '🚫'
    };

    const statusName: Record<OfferStatus, string> = {
      draft: 'Borrador', sent: 'Enviada', viewed: 'Vista', negotiating: 'Negociando',
      counter_offer: 'Contraoferta', accepted: 'Aceptada', reserved: 'Apartado',
      contracted: 'Contrato', rejected: 'Rechazada', expired: 'Expirada', cancelled: 'Cancelada'
    };

    let msg = `${statusEmoji[offer.status]} *OFERTA - ${statusName[offer.status].toUpperCase()}*\n\n`;

    msg += `👤 *Cliente:* ${offer.lead_name}\n`;
    msg += `📱 ${offer.lead_phone}\n\n`;

    msg += `🏠 *Propiedad:* ${offer.property_name}\n`;
    msg += `📍 ${offer.development}\n\n`;

    msg += `💰 *Precio lista:* $${this.formatNumber(offer.list_price)}\n`;
    msg += `🏷️ *Precio ofertado:* $${this.formatNumber(offer.offered_price)}\n`;
    if (offer.discount_percent > 0) {
      msg += `📉 *Descuento:* ${offer.discount_percent}% (-$${this.formatNumber(offer.discount_amount)})\n`;
    }
    msg += `\n`;

    if (offer.financing_type) {
      const financingNames: Record<string, string> = {
        cash: 'Contado', credit: 'Crédito Bancario', infonavit: 'INFONAVIT',
        fovissste: 'FOVISSSTE', cofinavit: 'Cofinavit'
      };
      msg += `🏦 *Financiamiento:* ${financingNames[offer.financing_type]}\n`;
      if (offer.down_payment_percent) {
        msg += `💵 *Enganche:* ${offer.down_payment_percent}%\n`;
      }
      msg += `\n`;
    }

    if (offer.expires_at) {
      const expires = new Date(offer.expires_at);
      const now = new Date();
      const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (daysLeft > 0) {
        msg += `⏰ *Vence en:* ${daysLeft} día(s)\n`;
      } else {
        msg += `⏰ *Vencida*\n`;
      }
    }

    if (offer.vendor_name) {
      msg += `👤 *Vendedor:* ${offer.vendor_name}\n`;
    }

    if (offer.notes) {
      msg += `\n📝 *Notas:* ${offer.notes}\n`;
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async getVendorName(vendorId: string | null): Promise<string | null> {
    if (!vendorId) return null;
    const { data } = await this.supabase.client
      .from('team_members')
      .select('name')
      .eq('id', vendorId)
      .single();
    return data?.name || null;
  }

  private async getVendorMap(vendorIds: string[]): Promise<Map<string, string>> {
    if (vendorIds.length === 0) return new Map();

    const uniqueIds = [...new Set(vendorIds)];
    const { data } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .in('id', uniqueIds);

    return new Map(data?.map(v => [v.id, v.name]) || []);
  }

  private parseStatusHistory(history: any): StatusChange[] {
    if (!history) return [];
    if (typeof history === 'string') {
      try {
        return JSON.parse(history);
      } catch {
        return [];
      }
    }
    return Array.isArray(history) ? history : [];
  }

  private mapToOffer(
    data: any,
    leadName: string | null,
    leadPhone: string | null,
    vendorName: string | null
  ): Offer {
    return {
      id: data.id,
      lead_id: data.lead_id,
      lead_name: leadName || 'Sin nombre',
      lead_phone: leadPhone || '',
      property_id: data.property_id,
      property_name: data.property_name || 'Sin especificar',
      development: data.development || 'Sin especificar',
      list_price: Number(data.list_price) || 0,
      offered_price: Number(data.offered_price) || 0,
      discount_percent: Number(data.discount_percent) || 0,
      discount_amount: Number(data.discount_amount) || 0,
      status: data.status || 'draft',
      status_history: this.parseStatusHistory(data.status_history),
      created_at: data.created_at,
      sent_at: data.sent_at,
      expires_at: data.expires_at,
      responded_at: data.responded_at,
      closed_at: data.closed_at,
      vendor_id: data.vendor_id,
      vendor_name: vendorName,
      notes: data.notes,
      rejection_reason: data.rejection_reason,
      financing_type: data.financing_type,
      down_payment_percent: data.down_payment_percent,
      next_followup: data.next_followup,
      followup_count: data.followup_count || 0
    };
  }

  private formatNumber(num: number): string {
    return num.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getOfferStatusEmoji(status: OfferStatus): string {
  const emojis: Record<OfferStatus, string> = {
    draft: '📝', sent: '📤', viewed: '👁️', negotiating: '🤝',
    counter_offer: '↩️', accepted: '✅', reserved: '🏠',
    contracted: '📄', rejected: '❌', expired: '⏰', cancelled: '🚫'
  };
  return emojis[status] || '❓';
}
