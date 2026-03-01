// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL SERVICE - Programa de Referidos
// Tracks referral chains, incentive tiers, conversion metrics, and rewards
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ReferralStats {
  periodo: string;
  dias: number;
  total_referidos: number;
  referidos_convertidos: number;
  referidos_en_proceso: number;
  referidos_perdidos: number;
  tasa_conversion: number;
  ingreso_generado: number;
  top_referidores: TopReferrer[];
  por_desarrollo: DevReferralStats[];
  por_vendedor: VendorReferralStats[];
  incentivos_estimados: number;
}

export interface TopReferrer {
  id: string;
  name: string;
  phone: string;
  referidos_totales: number;
  referidos_convertidos: number;
  ingreso_generado: number;
  tier: 'bronce' | 'plata' | 'oro' | 'diamante';
  incentivo_estimado: number;
}

export interface DevReferralStats {
  desarrollo: string;
  referidos: number;
  convertidos: number;
  tasa: number;
}

export interface VendorReferralStats {
  vendor_id: string;
  vendor_name: string;
  referidos_recibidos: number;
  convertidos: number;
  tasa: number;
}

export interface ReferralRecord {
  id: string;
  referrer_id: string;
  referrer_name: string;
  referred_id: string;
  referred_name: string;
  referred_phone: string;
  status: string;
  property_interest: string | null;
  created_at: string;
  converted_at: string | null;
  ingreso: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// INCENTIVE TIERS
// ═══════════════════════════════════════════════════════════════════════════

const INCENTIVE_TIERS = [
  { tier: 'bronce' as const, min: 1, max: 2, label: '🥉 Bronce', reward_pct: 0.3 },
  { tier: 'plata' as const, min: 3, max: 5, label: '🥈 Plata', reward_pct: 0.5 },
  { tier: 'oro' as const, min: 6, max: 9, label: '🥇 Oro', reward_pct: 0.7 },
  { tier: 'diamante' as const, min: 10, max: Infinity, label: '💎 Diamante', reward_pct: 1.0 },
];

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class ReferralService {
  constructor(private supabase: SupabaseService) {}

  // ─── GET TIER ─────────────────────────────────────────────────────────
  getTier(conversions: number): typeof INCENTIVE_TIERS[number] {
    return INCENTIVE_TIERS.find(t => conversions >= t.min && conversions <= t.max)
      || INCENTIVE_TIERS[0];
  }

  // ─── GENERATE REFERRAL CODE ──────────────────────────────────────────
  generateReferralCode(name: string): string {
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${slug}-${suffix}`;
  }

  // ─── REGISTER REFERRAL ────────────────────────────────────────────────
  async registerReferral(params: {
    referrerName: string;
    referredName: string;
    referredPhone: string;
    vendorId: string;
    propertyInterest?: string;
  }): Promise<{ success: boolean; referredLead?: any; referrer?: any; error?: string }> {
    // Find referrer
    const { data: referrers } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .ilike('name', `%${params.referrerName}%`)
      .in('status', ['sold', 'closed', 'delivered', 'reserved'])
      .limit(3);

    const referrer = referrers?.[0] || null;

    // Check if referred phone already exists
    const cleanPhone = params.referredPhone.replace(/\D/g, '');
    const last10 = cleanPhone.slice(-10);
    const { data: existing } = await this.supabase.client
      .from('leads')
      .select('id, name')
      .like('phone', `%${last10}`)
      .maybeSingle();

    if (existing) {
      // Link existing lead to referrer
      if (referrer) {
        const existingNotes = typeof existing.notes === 'string'
          ? JSON.parse(existing.notes || '{}') : (existing.notes || {});
        await this.supabase.client.from('leads').update({
          referred_by: referrer.id,
          source: 'referido',
          notes: JSON.stringify({
            ...existingNotes,
            referido_por: referrer.name,
            referido_por_id: referrer.id,
            fecha_referido: new Date().toISOString()
          })
        }).eq('id', existing.id);
      }
      return { success: true, referredLead: existing, referrer };
    }

    // Create new referred lead
    const phoneFormatted = last10.length === 10 ? `521${last10}` : cleanPhone;
    const { data: newLead, error } = await this.supabase.client
      .from('leads')
      .insert({
        name: params.referredName,
        phone: phoneFormatted,
        source: 'referido',
        referred_by: referrer?.id || null,
        assigned_to: params.vendorId,
        status: 'new',
        score: 80,
        property_interest: params.propertyInterest || null,
        notes: JSON.stringify({
          referido_por: params.referrerName,
          referido_por_id: referrer?.id || null,
          fecha_referido: new Date().toISOString(),
          referral_code: referrer ? this.generateReferralCode(referrer.name) : null
        })
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Update referrer's notes with referral count
    if (referrer) {
      await this.updateReferrerStats(referrer);
    }

    return { success: true, referredLead: newLead, referrer };
  }

  // ─── UPDATE REFERRER STATS ────────────────────────────────────────────
  async updateReferrerStats(referrer: any): Promise<void> {
    const { data: referrals } = await this.supabase.client
      .from('leads')
      .select('id, status')
      .eq('referred_by', referrer.id);

    const total = referrals?.length || 0;
    const converted = referrals?.filter(r =>
      ['sold', 'closed', 'delivered', 'reserved'].includes(r.status)
    ).length || 0;

    const tier = this.getTier(converted);
    const notes = typeof referrer.notes === 'string'
      ? JSON.parse(referrer.notes || '{}') : (referrer.notes || {});

    await this.supabase.client.from('leads').update({
      notes: JSON.stringify({
        ...notes,
        referral_stats: {
          total_referidos: total,
          convertidos: converted,
          tier: tier.tier,
          updated_at: new Date().toISOString()
        }
      })
    }).eq('id', referrer.id);
  }

  // ─── GET REFERRAL STATS ───────────────────────────────────────────────
  async getReferralStats(days: number = 90): Promise<ReferralStats> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    // Get all referred leads
    const { data: allReferred } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, status, referred_by, property_interest, assigned_to, notes, created_at, budget')
      .not('referred_by', 'is', null);

    const referred = allReferred || [];
    const recentReferred = referred.filter(r => r.created_at >= sinceStr);

    // Classify
    const convertedStatuses = ['sold', 'closed', 'delivered', 'reserved'];
    const lostStatuses = ['lost', 'fallen', 'inactive'];
    const converted = recentReferred.filter(r => convertedStatuses.includes(r.status));
    const lost = recentReferred.filter(r => lostStatuses.includes(r.status));
    const inProcess = recentReferred.filter(r =>
      !convertedStatuses.includes(r.status) && !lostStatuses.includes(r.status)
    );

    // Revenue
    const ingreso = converted.reduce((sum, r) => sum + (r.budget || 0), 0);

    // Top referrers
    const referrerMap = new Map<string, { id: string; referidos: any[] }>();
    for (const r of referred) {
      if (!r.referred_by) continue;
      if (!referrerMap.has(r.referred_by)) {
        referrerMap.set(r.referred_by, { id: r.referred_by, referidos: [] });
      }
      referrerMap.get(r.referred_by)!.referidos.push(r);
    }

    // Get referrer names
    const referrerIds = Array.from(referrerMap.keys());
    let referrerNames: Record<string, string> = {};
    let referrerPhones: Record<string, string> = {};
    if (referrerIds.length > 0) {
      const { data: names } = await this.supabase.client
        .from('leads')
        .select('id, name, phone')
        .in('id', referrerIds);
      for (const n of names || []) {
        referrerNames[n.id] = n.name;
        referrerPhones[n.id] = n.phone;
      }
    }

    const topReferrers: TopReferrer[] = Array.from(referrerMap.entries())
      .map(([id, data]) => {
        const conversions = data.referidos.filter(r => convertedStatuses.includes(r.status)).length;
        const rev = data.referidos
          .filter(r => convertedStatuses.includes(r.status))
          .reduce((s, r) => s + (r.budget || 0), 0);
        const tier = this.getTier(conversions);
        return {
          id,
          name: referrerNames[id] || 'Desconocido',
          phone: referrerPhones[id] || '',
          referidos_totales: data.referidos.length,
          referidos_convertidos: conversions,
          ingreso_generado: rev,
          tier: tier.tier,
          incentivo_estimado: Math.round(rev * (tier.reward_pct / 100))
        };
      })
      .sort((a, b) => b.referidos_convertidos - a.referidos_convertidos || b.referidos_totales - a.referidos_totales)
      .slice(0, 10);

    // By development
    const devMap = new Map<string, { total: number; converted: number }>();
    for (const r of recentReferred) {
      const dev = r.property_interest || 'Sin especificar';
      if (!devMap.has(dev)) devMap.set(dev, { total: 0, converted: 0 });
      devMap.get(dev)!.total++;
      if (convertedStatuses.includes(r.status)) devMap.get(dev)!.converted++;
    }
    const porDesarrollo: DevReferralStats[] = Array.from(devMap.entries())
      .map(([dev, d]) => ({
        desarrollo: dev,
        referidos: d.total,
        convertidos: d.converted,
        tasa: d.total > 0 ? Math.round((d.converted / d.total) * 100) : 0
      }))
      .sort((a, b) => b.referidos - a.referidos);

    // By vendor
    const { data: teamMembers } = await this.supabase.client
      .from('team_members')
      .select('id, name');
    const tmNames: Record<string, string> = {};
    for (const tm of teamMembers || []) tmNames[tm.id] = tm.name;

    const vendorMap = new Map<string, { total: number; converted: number }>();
    for (const r of recentReferred) {
      const vid = r.assigned_to || 'sin_asignar';
      if (!vendorMap.has(vid)) vendorMap.set(vid, { total: 0, converted: 0 });
      vendorMap.get(vid)!.total++;
      if (convertedStatuses.includes(r.status)) vendorMap.get(vid)!.converted++;
    }
    const porVendedor: VendorReferralStats[] = Array.from(vendorMap.entries())
      .map(([vid, d]) => ({
        vendor_id: vid,
        vendor_name: tmNames[vid] || 'Sin asignar',
        referidos_recibidos: d.total,
        convertidos: d.converted,
        tasa: d.total > 0 ? Math.round((d.converted / d.total) * 100) : 0
      }))
      .sort((a, b) => b.convertidos - a.convertidos);

    // Incentive estimate
    const totalIncentivos = topReferrers.reduce((s, r) => s + r.incentivo_estimado, 0);

    const tasaConversion = recentReferred.length > 0
      ? Math.round((converted.length / recentReferred.length) * 100) : 0;

    return {
      periodo: `Últimos ${days} días`,
      dias: days,
      total_referidos: recentReferred.length,
      referidos_convertidos: converted.length,
      referidos_en_proceso: inProcess.length,
      referidos_perdidos: lost.length,
      tasa_conversion: tasaConversion,
      ingreso_generado: ingreso,
      top_referidores: topReferrers,
      por_desarrollo: porDesarrollo,
      por_vendedor: porVendedor,
      incentivos_estimados: totalIncentivos
    };
  }

  // ─── GET REFERRAL RECORDS (for API) ───────────────────────────────────
  async getReferralRecords(days: number = 90): Promise<ReferralRecord[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: referred } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, status, referred_by, property_interest, notes, created_at, budget')
      .not('referred_by', 'is', null)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (!referred?.length) return [];

    // Get referrer names
    const referrerIds = [...new Set(referred.map(r => r.referred_by).filter(Boolean))];
    const { data: referrers } = await this.supabase.client
      .from('leads')
      .select('id, name')
      .in('id', referrerIds);

    const nameMap: Record<string, string> = {};
    for (const r of referrers || []) nameMap[r.id] = r.name;

    const convertedStatuses = ['sold', 'closed', 'delivered', 'reserved'];
    return referred.map(r => {
      const notes = typeof r.notes === 'string' ? JSON.parse(r.notes || '{}') : (r.notes || {});
      return {
        id: r.id,
        referrer_id: r.referred_by,
        referrer_name: nameMap[r.referred_by] || notes.referido_por || 'Desconocido',
        referred_id: r.id,
        referred_name: r.name,
        referred_phone: r.phone,
        status: r.status,
        property_interest: r.property_interest,
        created_at: r.created_at,
        converted_at: convertedStatuses.includes(r.status) ? r.created_at : null,
        ingreso: convertedStatuses.includes(r.status) ? (r.budget || 0) : 0
      };
    });
  }

  // ─── NOTIFY REFERRER ON CONVERSION ─────────────────────────────────────
  async checkAndNotifyReferrerConversion(leadId: string): Promise<{
    referrerId: string;
    referrerName: string;
    referrerPhone: string;
    message: string;
  } | null> {
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('id, name, referred_by, status, property_interest, budget')
      .eq('id', leadId)
      .maybeSingle();

    if (!lead?.referred_by) return null;
    if (!['sold', 'closed', 'reserved'].includes(lead.status)) return null;

    const { data: referrer } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .eq('id', lead.referred_by)
      .maybeSingle();

    if (!referrer) return null;

    // Update referrer stats
    await this.updateReferrerStats(referrer);

    const nombre = referrer.name?.split(' ')[0] || 'amigo';
    const referidoNombre = lead.name?.split(' ')[0] || 'tu referido';
    const mensaje = `🎉 *¡Excelente noticia, ${nombre}!*\n\n` +
      `Tu referido *${referidoNombre}* acaba de ${lead.status === 'reserved' ? 'apartar' : 'cerrar'} su casa` +
      (lead.property_interest ? ` en *${lead.property_interest}*` : '') + `.\n\n` +
      `¡Gracias por recomendarnos! Tu confianza significa mucho para nosotros. 🙏\n\n` +
      `Si conoces a alguien más que busque casa, no dudes en recomendarnos. 🏠`;

    return {
      referrerId: referrer.id,
      referrerName: referrer.name,
      referrerPhone: referrer.phone,
      message: mensaje
    };
  }

  // ─── FORMAT FOR WHATSAPP ──────────────────────────────────────────────
  formatStatsForWhatsApp(stats: ReferralStats): string {
    let msg = `📊 *PROGRAMA DE REFERIDOS*\n${stats.periodo}\n\n`;

    // Summary
    msg += `📈 *Resumen*\n`;
    msg += `• Total referidos: *${stats.total_referidos}*\n`;
    msg += `• Convertidos: *${stats.referidos_convertidos}* `;
    msg += `(${stats.tasa_conversion}%)\n`;
    msg += `• En proceso: *${stats.referidos_en_proceso}*\n`;
    msg += `• Perdidos: *${stats.referidos_perdidos}*\n`;
    if (stats.ingreso_generado > 0) {
      msg += `• Ingreso generado: *$${(stats.ingreso_generado / 1000000).toFixed(1)}M*\n`;
    }
    msg += `\n`;

    // Top referrers
    if (stats.top_referidores.length > 0) {
      msg += `🏆 *Top Referidores*\n`;
      for (const r of stats.top_referidores.slice(0, 5)) {
        const tierIcon = r.tier === 'diamante' ? '💎' :
          r.tier === 'oro' ? '🥇' : r.tier === 'plata' ? '🥈' : '🥉';
        msg += `${tierIcon} *${r.name}*: ${r.referidos_totales} ref`;
        if (r.referidos_convertidos > 0) {
          msg += ` (${r.referidos_convertidos} conv)`;
        }
        msg += `\n`;
      }
      msg += `\n`;
    }

    // By development
    if (stats.por_desarrollo.length > 0) {
      msg += `🏠 *Por Desarrollo*\n`;
      for (const d of stats.por_desarrollo.slice(0, 5)) {
        msg += `• ${d.desarrollo}: ${d.referidos} ref`;
        if (d.convertidos > 0) msg += ` → ${d.convertidos} conv (${d.tasa}%)`;
        msg += `\n`;
      }
      msg += `\n`;
    }

    // By vendor
    if (stats.por_vendedor.length > 0 && stats.por_vendedor.some(v => v.convertidos > 0)) {
      msg += `👥 *Por Vendedor*\n`;
      for (const v of stats.por_vendedor.slice(0, 5)) {
        if (v.referidos_recibidos === 0) continue;
        msg += `• ${v.vendor_name}: ${v.referidos_recibidos} ref`;
        if (v.convertidos > 0) msg += ` → ${v.convertidos} conv`;
        msg += `\n`;
      }
      msg += `\n`;
    }

    // Tier legend
    msg += `📋 *Niveles de Referidor*\n`;
    msg += `🥉 Bronce (1-2 conv) | 🥈 Plata (3-5)\n`;
    msg += `🥇 Oro (6-9) | 💎 Diamante (10+)`;

    return msg;
  }
}
