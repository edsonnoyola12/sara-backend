// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER VALUE SERVICE - CLV (Customer Lifetime Value)
// Calculates customer value, referral tracking, and retention metrics
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;

  // Purchase history
  purchase_date: string | null;
  property_purchased: string | null;
  purchase_value: number;

  // CLV metrics
  lifetime_value: number;
  potential_value: number;
  referral_value: number;

  // Referral info
  referred_by: string | null;
  referrals_made: number;
  referral_conversions: number;

  // Engagement
  last_contact: string | null;
  total_interactions: number;
  satisfaction_score: number | null;

  // Segmentation
  segment: 'vip' | 'high_value' | 'medium_value' | 'new' | 'at_risk' | 'churned';
  tags: string[];
}

export interface ReferralChain {
  customer_id: string;
  customer_name: string;
  referred_by_id: string | null;
  referred_by_name: string | null;
  referrals: Array<{
    id: string;
    name: string;
    status: string;
    value: number;
    converted: boolean;
  }>;
  total_referral_value: number;
  conversion_rate: string;
}

export interface CLVAnalysis {
  generated_at: string;

  // Overall metrics
  total_customers: number;
  total_clv: number;
  avg_clv: number;
  avg_purchase_value: number;

  // Segmentation
  by_segment: {
    vip: number;
    high_value: number;
    medium_value: number;
    new: number;
    at_risk: number;
    churned: number;
  };

  // Referral program
  referrals: {
    total_referrals: number;
    converted_referrals: number;
    conversion_rate: string;
    referral_revenue: number;
    avg_referrals_per_customer: number;
    top_referrers: Array<{
      name: string;
      referrals: number;
      conversions: number;
      value_generated: number;
    }>;
  };

  // Retention
  retention: {
    repeat_purchase_rate: string;
    avg_time_to_repeat: number;
    churn_risk_count: number;
  };

  // Top customers
  top_customers: CustomerProfile[];

  // Recommendations
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CustomerValueService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET CUSTOMER PROFILE
  // ═══════════════════════════════════════════════════════════════════════════

  async getCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('id', customerId)
      .single();

    if (!lead) return null;

    // Get referrals made by this customer
    const { data: referrals } = await this.supabase.client
      .from('leads')
      .select('id, name, status, budget')
      .eq('referred_by', customerId);

    const referralsMade = referrals?.length || 0;
    const referralConversions = referrals?.filter(r =>
      ['sold', 'reserved', 'delivered'].includes(r.status)
    ).length || 0;

    const referralValue = referrals
      ?.filter(r => ['sold', 'reserved', 'delivered'].includes(r.status))
      .reduce((sum, r) => sum + (Number(r.budget) || 0), 0) || 0;

    // Get who referred this customer
    let referredByName: string | null = null;
    if (lead.referred_by) {
      const { data: referrer } = await this.supabase.client
        .from('leads')
        .select('name')
        .eq('id', lead.referred_by)
        .single();
      referredByName = referrer?.name || null;
    }

    // Calculate lifetime value
    const purchaseValue = Number(lead.budget) || 0;
    const lifetimeValue = purchaseValue + referralValue;
    const potentialValue = this.calculatePotentialValue(lead, referralsMade);

    // Get interaction count
    const { count: interactions } = await this.supabase.client
      .from('conversation_history')
      .select('id', { count: 'exact' })
      .eq('lead_id', customerId);

    // Determine segment
    const segment = this.determineSegment(lead, lifetimeValue, referralsMade);

    // Generate tags
    const tags = this.generateTags(lead, referralsMade, lifetimeValue);

    return {
      id: lead.id,
      name: lead.name || 'Sin nombre',
      phone: lead.phone,
      email: lead.email || null,
      purchase_date: lead.status === 'sold' ? lead.updated_at : null,
      property_purchased: lead.property_interest || null,
      purchase_value: purchaseValue,
      lifetime_value: lifetimeValue,
      potential_value: potentialValue,
      referral_value: referralValue,
      referred_by: referredByName,
      referrals_made: referralsMade,
      referral_conversions: referralConversions,
      last_contact: lead.last_activity_at || lead.updated_at,
      total_interactions: interactions || 0,
      satisfaction_score: lead.nps_score || null,
      segment,
      tags
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET REFERRAL CHAIN
  // ═══════════════════════════════════════════════════════════════════════════

  async getReferralChain(customerId: string): Promise<ReferralChain | null> {
    const { data: customer } = await this.supabase.client
      .from('leads')
      .select('id, name, referred_by')
      .eq('id', customerId)
      .single();

    if (!customer) return null;

    // Get referrer info
    let referredByName: string | null = null;
    if (customer.referred_by) {
      const { data: referrer } = await this.supabase.client
        .from('leads')
        .select('name')
        .eq('id', customer.referred_by)
        .single();
      referredByName = referrer?.name || null;
    }

    // Get referrals
    const { data: referrals } = await this.supabase.client
      .from('leads')
      .select('id, name, status, budget')
      .eq('referred_by', customerId);

    const referralList = (referrals || []).map(r => ({
      id: r.id,
      name: r.name || 'Sin nombre',
      status: r.status,
      value: Number(r.budget) || 0,
      converted: ['sold', 'reserved', 'delivered'].includes(r.status)
    }));

    const converted = referralList.filter(r => r.converted);
    const totalValue = converted.reduce((sum, r) => sum + r.value, 0);

    return {
      customer_id: customer.id,
      customer_name: customer.name || 'Sin nombre',
      referred_by_id: customer.referred_by,
      referred_by_name: referredByName,
      referrals: referralList,
      total_referral_value: totalValue,
      conversion_rate: referralList.length > 0
        ? ((converted.length / referralList.length) * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLV ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  async getCLVAnalysis(): Promise<CLVAnalysis> {
    // Get all customers (sold/delivered)
    const { data: customers } = await this.supabase.client
      .from('leads')
      .select('*')
      .in('status', ['sold', 'reserved', 'delivered'])
      .order('updated_at', { ascending: false });

    const allCustomers = customers || [];

    // Get all referrals
    const { data: allLeads } = await this.supabase.client
      .from('leads')
      .select('id, name, status, budget, referred_by')
      .not('referred_by', 'is', null);

    const referralLeads = allLeads || [];

    // Calculate metrics
    const totalCLV = allCustomers.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
    const avgCLV = allCustomers.length > 0 ? Math.round(totalCLV / allCustomers.length) : 0;
    const avgPurchaseValue = avgCLV;

    // Segment customers
    const segments = { vip: 0, high_value: 0, medium_value: 0, new: 0, at_risk: 0, churned: 0 };
    const customerProfiles: CustomerProfile[] = [];

    for (const customer of allCustomers.slice(0, 20)) {
      const profile = await this.getCustomerProfile(customer.id);
      if (profile) {
        customerProfiles.push(profile);
        segments[profile.segment]++;
      }
    }

    // Referral analysis
    const referralsByCustomer: Record<string, { referrals: number; conversions: number; value: number; name: string }> = {};

    for (const lead of referralLeads) {
      const referrerId = lead.referred_by;
      if (!referralsByCustomer[referrerId]) {
        const { data: referrer } = await this.supabase.client
          .from('leads')
          .select('name')
          .eq('id', referrerId)
          .single();
        referralsByCustomer[referrerId] = {
          referrals: 0,
          conversions: 0,
          value: 0,
          name: referrer?.name || 'Desconocido'
        };
      }
      referralsByCustomer[referrerId].referrals++;
      if (['sold', 'reserved', 'delivered'].includes(lead.status)) {
        referralsByCustomer[referrerId].conversions++;
        referralsByCustomer[referrerId].value += Number(lead.budget) || 0;
      }
    }

    const totalReferrals = referralLeads.length;
    const convertedReferrals = referralLeads.filter(l =>
      ['sold', 'reserved', 'delivered'].includes(l.status)
    ).length;
    const referralRevenue = referralLeads
      .filter(l => ['sold', 'reserved', 'delivered'].includes(l.status))
      .reduce((sum, l) => sum + (Number(l.budget) || 0), 0);

    const topReferrers = Object.values(referralsByCustomer)
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 5)
      .map(r => ({
        name: r.name,
        referrals: r.referrals,
        conversions: r.conversions,
        value_generated: r.value
      }));

    // Retention metrics (simplified)
    const churnRiskCount = customerProfiles.filter(c => c.segment === 'at_risk').length;

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      allCustomers.length,
      avgCLV,
      totalReferrals,
      convertedReferrals,
      churnRiskCount
    );

    return {
      generated_at: new Date().toISOString(),
      total_customers: allCustomers.length,
      total_clv: totalCLV,
      avg_clv: avgCLV,
      avg_purchase_value: avgPurchaseValue,
      by_segment: segments,
      referrals: {
        total_referrals: totalReferrals,
        converted_referrals: convertedReferrals,
        conversion_rate: totalReferrals > 0
          ? ((convertedReferrals / totalReferrals) * 100).toFixed(1) + '%'
          : '0%',
        referral_revenue: referralRevenue,
        avg_referrals_per_customer: allCustomers.length > 0
          ? Math.round((totalReferrals / allCustomers.length) * 10) / 10
          : 0,
        top_referrers: topReferrers
      },
      retention: {
        repeat_purchase_rate: '0%', // Would need more data
        avg_time_to_repeat: 0,
        churn_risk_count: churnRiskCount
      },
      top_customers: customerProfiles
        .sort((a, b) => b.lifetime_value - a.lifetime_value)
        .slice(0, 10),
      recommendations
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatAnalysisForWhatsApp(analysis: CLVAnalysis): string {
    let msg = `👥 *VALOR DEL CLIENTE (CLV)*\n\n`;

    msg += `*Resumen:*\n`;
    msg += `• Total clientes: ${analysis.total_customers}\n`;
    msg += `• CLV total: $${this.formatNumber(analysis.total_clv)}\n`;
    msg += `• CLV promedio: $${this.formatNumber(analysis.avg_clv)}\n\n`;

    msg += `*Segmentación:*\n`;
    msg += `• 👑 VIP: ${analysis.by_segment.vip}\n`;
    msg += `• 💎 Alto valor: ${analysis.by_segment.high_value}\n`;
    msg += `• 💰 Medio valor: ${analysis.by_segment.medium_value}\n`;
    msg += `• 🆕 Nuevos: ${analysis.by_segment.new}\n`;
    msg += `• ⚠️ En riesgo: ${analysis.by_segment.at_risk}\n\n`;

    msg += `*Programa de Referidos:*\n`;
    msg += `• Total referidos: ${analysis.referrals.total_referrals}\n`;
    msg += `• Convertidos: ${analysis.referrals.converted_referrals}\n`;
    msg += `• Tasa conversión: ${analysis.referrals.conversion_rate}\n`;
    msg += `• Ingresos: $${this.formatNumber(analysis.referrals.referral_revenue)}\n\n`;

    if (analysis.referrals.top_referrers.length > 0) {
      msg += `🏆 *Top Referidores:*\n`;
      for (const referrer of analysis.referrals.top_referrers.slice(0, 3)) {
        msg += `• ${referrer.name}: ${referrer.conversions} ventas ($${this.formatNumber(referrer.value_generated)})\n`;
      }
      msg += `\n`;
    }

    if (analysis.recommendations.length > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💡 *RECOMENDACIONES:*\n\n`;
      for (const rec of analysis.recommendations.slice(0, 4)) {
        msg += `${rec}\n`;
      }
    }

    return msg;
  }

  formatCustomerForWhatsApp(customer: CustomerProfile): string {
    const segmentEmoji: Record<string, string> = {
      vip: '👑',
      high_value: '💎',
      medium_value: '💰',
      new: '🆕',
      at_risk: '⚠️',
      churned: '❌'
    };

    let msg = `${segmentEmoji[customer.segment]} *PERFIL DE CLIENTE*\n\n`;
    msg += `👤 *${customer.name}*\n`;
    msg += `📱 ${customer.phone}\n`;
    if (customer.email) msg += `📧 ${customer.email}\n`;
    msg += `\n`;

    if (customer.purchase_date) {
      msg += `🏠 *Compra:* ${customer.property_purchased}\n`;
      msg += `💰 *Valor:* $${this.formatNumber(customer.purchase_value)}\n\n`;
    }

    msg += `📊 *Valor de vida:* $${this.formatNumber(customer.lifetime_value)}\n`;
    msg += `🎯 *Potencial:* $${this.formatNumber(customer.potential_value)}\n\n`;

    msg += `*Referidos:*\n`;
    msg += `• Enviados: ${customer.referrals_made}\n`;
    msg += `• Convertidos: ${customer.referral_conversions}\n`;
    msg += `• Valor generado: $${this.formatNumber(customer.referral_value)}\n\n`;

    if (customer.referred_by) {
      msg += `👤 *Referido por:* ${customer.referred_by}\n\n`;
    }

    if (customer.tags.length > 0) {
      msg += `🏷️ *Tags:* ${customer.tags.join(', ')}`;
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculatePotentialValue(lead: any, referralsMade: number): number {
    const baseValue = Number(lead.budget) || 2500000;

    // Referral potential: avg 1.5 referrals per satisfied customer
    const expectedReferrals = Math.max(0, 1.5 - referralsMade);
    const referralPotential = expectedReferrals * baseValue * 0.1; // 10% of value

    // Upsell potential for high-value customers
    const upsellPotential = baseValue > 3000000 ? baseValue * 0.05 : 0;

    return Math.round(referralPotential + upsellPotential);
  }

  private determineSegment(
    lead: any,
    lifetimeValue: number,
    referralsMade: number
  ): CustomerProfile['segment'] {
    const isSold = ['sold', 'delivered'].includes(lead.status);
    const daysSincePurchase = isSold
      ? Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    // VIP: high value + referrals
    if (lifetimeValue > 5000000 || referralsMade >= 3) {
      return 'vip';
    }

    // High value
    if (lifetimeValue > 3500000) {
      return 'high_value';
    }

    // Churned: no activity in 6 months
    if (isSold && daysSincePurchase > 180) {
      return 'churned';
    }

    // At risk: no activity in 3 months
    if (isSold && daysSincePurchase > 90) {
      return 'at_risk';
    }

    // New: purchased in last 30 days
    if (isSold && daysSincePurchase < 30) {
      return 'new';
    }

    return 'medium_value';
  }

  private generateTags(lead: any, referralsMade: number, lifetimeValue: number): string[] {
    const tags: string[] = [];

    if (referralsMade > 0) tags.push('Referidor');
    if (referralsMade >= 3) tags.push('Super Referidor');
    if (lifetimeValue > 5000000) tags.push('Alto Valor');
    if (lead.nps_score && lead.nps_score >= 9) tags.push('Promotor');
    if (lead.nps_score && lead.nps_score <= 6) tags.push('Detractor');
    if (lead.source === 'referral') tags.push('Fue Referido');
    if (lead.financing_type === 'cash') tags.push('Contado');

    return tags;
  }

  private generateRecommendations(
    totalCustomers: number,
    avgCLV: number,
    totalReferrals: number,
    convertedReferrals: number,
    churnRiskCount: number
  ): string[] {
    const recommendations: string[] = [];

    // Referral program
    const referralRate = totalCustomers > 0 ? totalReferrals / totalCustomers : 0;
    if (referralRate < 0.5) {
      recommendations.push('📢 Impulsar programa de referidos. Tasa actual baja.');
    }

    const referralConversionRate = totalReferrals > 0
      ? convertedReferrals / totalReferrals
      : 0;
    if (referralConversionRate < 0.2) {
      recommendations.push('🎯 Mejorar seguimiento a leads referidos. Conversión baja.');
    }

    // Churn prevention
    if (churnRiskCount > 3) {
      recommendations.push(`⚠️ ${churnRiskCount} clientes en riesgo. Activar retención.`);
    }

    // CLV optimization
    if (avgCLV < 3000000) {
      recommendations.push('💎 Enfocarse en clientes de mayor valor para subir CLV.');
    }

    // General
    recommendations.push('👥 Contactar clientes satisfechos para pedir referidos.');
    recommendations.push('📧 Implementar encuesta NPS post-venta.');

    return recommendations.slice(0, 5);
  }

  private formatNumber(num: number): string {
    return num.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }
}
