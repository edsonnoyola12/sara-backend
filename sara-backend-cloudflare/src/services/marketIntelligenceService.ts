// ═══════════════════════════════════════════════════════════════════════════
// MARKET INTELLIGENCE SERVICE - Inteligencia de Mercado
// Analyzes market trends, pricing, competition, and demand patterns
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketAnalysis {
  generated_at: string;
  period_days: number;

  // Demand Analysis
  demand: {
    total_inquiries: number;
    by_development: DevelopmentDemand[];
    by_price_range: PriceRangeDemand[];
    by_property_type: PropertyTypeDemand[];
    trending_up: string[];
    trending_down: string[];
  };

  // Pricing Analysis
  pricing: {
    avg_budget: number;
    median_budget: number;
    budget_distribution: BudgetBucket[];
    price_sensitivity: string;
    discount_effectiveness: number;
  };

  // Lead Sources
  sources: {
    by_source: SourceMetric[];
    best_converting: string;
    best_quality: string;
    highest_volume: string;
  };

  // Competitor Mentions
  competition: {
    mentions_count: number;
    competitors: CompetitorMention[];
    lost_to_competition: number;
    win_rate_vs_competition: string;
  };

  // Timing Patterns
  timing: {
    best_day_for_inquiries: string;
    best_hour_for_response: string;
    avg_decision_days: number;
    seasonal_trend: string;
  };

  // Recommendations
  recommendations: string[];
}

export interface DevelopmentDemand {
  development: string;
  inquiries: number;
  visits: number;
  conversions: number;
  conversion_rate: string;
  avg_budget: number;
  trend: 'up' | 'down' | 'stable';
  trend_percent: number;
}

export interface PriceRangeDemand {
  range: string;
  min: number;
  max: number;
  count: number;
  percent: string;
}

export interface PropertyTypeDemand {
  type: string;
  count: number;
  percent: string;
  avg_budget: number;
}

export interface BudgetBucket {
  range: string;
  count: number;
  percent: number;
}

export interface SourceMetric {
  source: string;
  leads: number;
  conversions: number;
  conversion_rate: string;
  avg_score: number;
  avg_response_time_hours: number;
}

export interface CompetitorMention {
  competitor: string;
  mentions: number;
  context: string[];
  outcome: 'won' | 'lost' | 'pending';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPETITOR PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const COMPETITOR_PATTERNS = [
  { name: 'Casas Javer', patterns: ['javer', 'casas javer'] },
  { name: 'Vinte', patterns: ['vinte', 'vinte viviendas'] },
  { name: 'Cadu', patterns: ['cadu', 'cadu residencial'] },
  { name: 'Ara', patterns: ['ara', 'consorcio ara'] },
  { name: 'Sadasi', patterns: ['sadasi', 'grupo sadasi'] },
  { name: 'GEO', patterns: ['geo', 'casas geo', 'corporacion geo'] },
  { name: 'Urbi', patterns: ['urbi', 'urbi desarrollos'] },
  { name: 'Homex', patterns: ['homex', 'desarrolladora homex'] },
  { name: 'Otro desarrollador', patterns: ['otro desarrollo', 'otra inmobiliaria', 'la competencia'] }
];

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class MarketIntelligenceService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  async getMarketAnalysis(days: number = 30): Promise<MarketAnalysis> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get leads in period
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    // Get previous period for comparison
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    const { data: prevLeads } = await this.supabase.client
      .from('leads')
      .select('id, property_interest, status')
      .gte('created_at', prevStartDate.toISOString())
      .lt('created_at', startDate.toISOString());

    // Get appointments
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('*')
      .gte('created_at', startDate.toISOString());

    const allLeads = leads || [];
    const previousLeads = prevLeads || [];
    const allAppointments = appointments || [];

    // Analyze demand by development
    const demandByDev = this.analyzeDemandByDevelopment(allLeads, previousLeads, allAppointments);

    // Analyze by price range
    const demandByPrice = this.analyzeDemandByPriceRange(allLeads);

    // Analyze by property type
    const demandByType = this.analyzeDemandByPropertyType(allLeads);

    // Find trends
    const trendingUp = demandByDev
      .filter(d => d.trend === 'up' && d.trend_percent > 20)
      .map(d => d.development);
    const trendingDown = demandByDev
      .filter(d => d.trend === 'down' && d.trend_percent < -20)
      .map(d => d.development);

    // Analyze pricing
    const pricingAnalysis = this.analyzePricing(allLeads);

    // Analyze sources
    const sourceAnalysis = this.analyzeSources(allLeads);

    // Analyze competition
    const competitionAnalysis = await this.analyzeCompetition(allLeads);

    // Analyze timing
    const timingAnalysis = this.analyzeTiming(allLeads, allAppointments);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      demandByDev, pricingAnalysis, sourceAnalysis, competitionAnalysis, timingAnalysis
    );

    return {
      generated_at: new Date().toISOString(),
      period_days: days,
      demand: {
        total_inquiries: allLeads.length,
        by_development: demandByDev,
        by_price_range: demandByPrice,
        by_property_type: demandByType,
        trending_up: trendingUp,
        trending_down: trendingDown
      },
      pricing: pricingAnalysis,
      sources: sourceAnalysis,
      competition: competitionAnalysis,
      timing: timingAnalysis,
      recommendations
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMAND ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  private analyzeDemandByDevelopment(
    leads: any[],
    prevLeads: any[],
    appointments: any[]
  ): DevelopmentDemand[] {
    const devStats: Record<string, {
      inquiries: number;
      prevInquiries: number;
      visits: number;
      conversions: number;
      budgets: number[];
    }> = {};

    // Current period
    for (const lead of leads) {
      const dev = this.normalizeDevelopmentName(lead.property_interest || 'Sin especificar');
      if (!devStats[dev]) {
        devStats[dev] = { inquiries: 0, prevInquiries: 0, visits: 0, conversions: 0, budgets: [] };
      }
      devStats[dev].inquiries++;
      if (lead.budget && Number(lead.budget) > 0) {
        devStats[dev].budgets.push(Number(lead.budget));
      }
      if (['sold', 'reserved', 'delivered'].includes(lead.status)) {
        devStats[dev].conversions++;
      }
    }

    // Previous period
    for (const lead of prevLeads) {
      const dev = this.normalizeDevelopmentName(lead.property_interest || 'Sin especificar');
      if (!devStats[dev]) {
        devStats[dev] = { inquiries: 0, prevInquiries: 0, visits: 0, conversions: 0, budgets: [] };
      }
      devStats[dev].prevInquiries++;
    }

    // Visits
    for (const apt of appointments) {
      if (apt.status === 'completed') {
        const dev = this.normalizeDevelopmentName(apt.development || apt.property_interest || 'Sin especificar');
        if (devStats[dev]) {
          devStats[dev].visits++;
        }
      }
    }

    return Object.entries(devStats)
      .map(([development, stats]) => {
        const change = stats.prevInquiries > 0
          ? ((stats.inquiries - stats.prevInquiries) / stats.prevInquiries) * 100
          : stats.inquiries > 0 ? 100 : 0;

        const avgBudget = stats.budgets.length > 0
          ? Math.round(stats.budgets.reduce((a, b) => a + b, 0) / stats.budgets.length)
          : 0;

        return {
          development,
          inquiries: stats.inquiries,
          visits: stats.visits,
          conversions: stats.conversions,
          conversion_rate: stats.inquiries > 0
            ? ((stats.conversions / stats.inquiries) * 100).toFixed(1) + '%'
            : '0%',
          avg_budget: avgBudget,
          trend: change > 10 ? 'up' as const : change < -10 ? 'down' as const : 'stable' as const,
          trend_percent: Math.round(change)
        };
      })
      .sort((a, b) => b.inquiries - a.inquiries);
  }

  private analyzeDemandByPriceRange(leads: any[]): PriceRangeDemand[] {
    const ranges = [
      { label: 'Menos de $1.5M', min: 0, max: 1500000 },
      { label: '$1.5M - $2.5M', min: 1500000, max: 2500000 },
      { label: '$2.5M - $3.5M', min: 2500000, max: 3500000 },
      { label: '$3.5M - $5M', min: 3500000, max: 5000000 },
      { label: 'Más de $5M', min: 5000000, max: Infinity }
    ];

    const counts = ranges.map(r => ({
      ...r,
      count: leads.filter(l => {
        const budget = Number(l.budget) || 0;
        return budget >= r.min && budget < r.max;
      }).length
    }));

    const total = leads.length || 1;

    return counts.map(c => ({
      range: c.label,
      min: c.min,
      max: c.max === Infinity ? 99999999 : c.max,
      count: c.count,
      percent: ((c.count / total) * 100).toFixed(1) + '%'
    }));
  }

  private analyzeDemandByPropertyType(leads: any[]): PropertyTypeDemand[] {
    const types: Record<string, { count: number; budgets: number[] }> = {};

    for (const lead of leads) {
      const interest = (lead.property_interest || '').toLowerCase();
      let type = 'otro';

      if (interest.includes('casa') || interest.includes('villa')) type = 'Casa';
      else if (interest.includes('depto') || interest.includes('departamento')) type = 'Departamento';
      else if (interest.includes('terreno') || interest.includes('lote')) type = 'Terreno';
      else if (interest.includes('local') || interest.includes('comercial')) type = 'Comercial';

      if (!types[type]) types[type] = { count: 0, budgets: [] };
      types[type].count++;
      if (lead.budget && Number(lead.budget) > 0) {
        types[type].budgets.push(Number(lead.budget));
      }
    }

    const total = leads.length || 1;

    return Object.entries(types)
      .map(([type, data]) => ({
        type,
        count: data.count,
        percent: ((data.count / total) * 100).toFixed(1) + '%',
        avg_budget: data.budgets.length > 0
          ? Math.round(data.budgets.reduce((a, b) => a + b, 0) / data.budgets.length)
          : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICING ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  private analyzePricing(leads: any[]): MarketAnalysis['pricing'] {
    const budgets = leads
      .map(l => Number(l.budget))
      .filter(b => b > 0)
      .sort((a, b) => a - b);

    const avgBudget = budgets.length > 0
      ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length)
      : 0;

    const medianBudget = budgets.length > 0
      ? budgets[Math.floor(budgets.length / 2)]
      : 0;

    // Budget distribution
    const buckets = [
      { range: '< $2M', min: 0, max: 2000000 },
      { range: '$2M - $3M', min: 2000000, max: 3000000 },
      { range: '$3M - $4M', min: 3000000, max: 4000000 },
      { range: '> $4M', min: 4000000, max: Infinity }
    ];

    const distribution = buckets.map(bucket => {
      const count = budgets.filter(b => b >= bucket.min && b < bucket.max).length;
      return {
        range: bucket.range,
        count,
        percent: budgets.length > 0 ? Math.round((count / budgets.length) * 100) : 0
      };
    });

    // Price sensitivity - based on leads asking about discounts or promotions
    const priceSensitive = leads.filter(l => {
      const notes = JSON.stringify(l.notes || '').toLowerCase();
      return notes.includes('descuento') || notes.includes('promocion') ||
             notes.includes('oferta') || notes.includes('barato');
    }).length;

    const sensitivity = leads.length > 0
      ? priceSensitive / leads.length
      : 0;

    const sensitivityLevel = sensitivity > 0.3 ? 'Alta' :
                            sensitivity > 0.15 ? 'Media' : 'Baja';

    return {
      avg_budget: avgBudget,
      median_budget: medianBudget,
      budget_distribution: distribution,
      price_sensitivity: sensitivityLevel,
      discount_effectiveness: 0 // Would need offer data
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  private analyzeSources(leads: any[]): MarketAnalysis['sources'] {
    const sources: Record<string, {
      leads: number;
      conversions: number;
      scores: number[];
      responseTimes: number[];
    }> = {};

    for (const lead of leads) {
      const source = lead.source || 'Directo';
      if (!sources[source]) {
        sources[source] = { leads: 0, conversions: 0, scores: [], responseTimes: [] };
      }
      sources[source].leads++;
      if (['sold', 'reserved'].includes(lead.status)) {
        sources[source].conversions++;
      }
      if (lead.score) sources[source].scores.push(Number(lead.score));
    }

    const sourceMetrics = Object.entries(sources)
      .map(([source, data]) => ({
        source,
        leads: data.leads,
        conversions: data.conversions,
        conversion_rate: data.leads > 0
          ? ((data.conversions / data.leads) * 100).toFixed(1) + '%'
          : '0%',
        avg_score: data.scores.length > 0
          ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
          : 0,
        avg_response_time_hours: 0
      }))
      .sort((a, b) => b.leads - a.leads);

    const bestConverting = [...sourceMetrics]
      .filter(s => s.leads >= 5)
      .sort((a, b) => parseFloat(b.conversion_rate) - parseFloat(a.conversion_rate))[0]?.source || 'N/A';

    const bestQuality = [...sourceMetrics]
      .filter(s => s.leads >= 5)
      .sort((a, b) => b.avg_score - a.avg_score)[0]?.source || 'N/A';

    const highestVolume = sourceMetrics[0]?.source || 'N/A';

    return {
      by_source: sourceMetrics,
      best_converting: bestConverting,
      best_quality: bestQuality,
      highest_volume: highestVolume
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPETITION ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  private async analyzeCompetition(leads: any[]): Promise<MarketAnalysis['competition']> {
    const competitorMentions: Record<string, { count: number; contexts: string[]; outcomes: string[] }> = {};
    let lostToCompetition = 0;

    for (const lead of leads) {
      const notes = JSON.stringify(lead.notes || '').toLowerCase();
      const interest = (lead.property_interest || '').toLowerCase();

      for (const competitor of COMPETITOR_PATTERNS) {
        for (const pattern of competitor.patterns) {
          if (notes.includes(pattern) || interest.includes(pattern)) {
            if (!competitorMentions[competitor.name]) {
              competitorMentions[competitor.name] = { count: 0, contexts: [], outcomes: [] };
            }
            competitorMentions[competitor.name].count++;

            // Determine outcome
            if (lead.status === 'lost') {
              competitorMentions[competitor.name].outcomes.push('lost');
              lostToCompetition++;
            } else if (['sold', 'reserved'].includes(lead.status)) {
              competitorMentions[competitor.name].outcomes.push('won');
            } else {
              competitorMentions[competitor.name].outcomes.push('pending');
            }

            break;
          }
        }
      }
    }

    const totalMentions = Object.values(competitorMentions).reduce((sum, c) => sum + c.count, 0);
    const winsVsCompetition = Object.values(competitorMentions)
      .reduce((sum, c) => sum + c.outcomes.filter(o => o === 'won').length, 0);

    const winRate = totalMentions > 0
      ? ((winsVsCompetition / totalMentions) * 100).toFixed(1) + '%'
      : 'N/A';

    return {
      mentions_count: totalMentions,
      competitors: Object.entries(competitorMentions)
        .map(([competitor, data]) => {
          const wonCount = data.outcomes.filter(o => o === 'won').length;
          const lostCount = data.outcomes.filter(o => o === 'lost').length;
          return {
            competitor,
            mentions: data.count,
            context: data.contexts.slice(0, 3),
            outcome: wonCount > lostCount ? 'won' as const :
                    lostCount > wonCount ? 'lost' as const : 'pending' as const
          };
        })
        .sort((a, b) => b.mentions - a.mentions),
      lost_to_competition: lostToCompetition,
      win_rate_vs_competition: winRate
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMING ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  private analyzeTiming(leads: any[], appointments: any[]): MarketAnalysis['timing'] {
    // Best day for inquiries
    const dayCount: Record<string, number> = {};
    for (const lead of leads) {
      const day = new Date(lead.created_at).toLocaleDateString('es-MX', { weekday: 'long' });
      dayCount[day] = (dayCount[day] || 0) + 1;
    }
    const bestDay = Object.entries(dayCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Best hour for response (based on conversions)
    const hourCount: Record<number, number> = {};
    const convertedLeads = leads.filter(l => ['sold', 'reserved'].includes(l.status));
    for (const lead of convertedLeads) {
      const hour = new Date(lead.created_at).getHours();
      hourCount[hour] = (hourCount[hour] || 0) + 1;
    }
    const bestHour = Object.entries(hourCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '10';

    // Average decision days
    const decisionDays = leads
      .filter(l => ['sold', 'reserved'].includes(l.status))
      .map(l => {
        const created = new Date(l.created_at).getTime();
        const updated = new Date(l.updated_at).getTime();
        return Math.floor((updated - created) / (24 * 60 * 60 * 1000));
      });

    const avgDecisionDays = decisionDays.length > 0
      ? Math.round(decisionDays.reduce((a, b) => a + b, 0) / decisionDays.length)
      : 0;

    // Seasonal trend
    const now = new Date();
    const month = now.getMonth();
    const seasonalTrend = month >= 2 && month <= 5 ? 'Primavera - Alta demanda' :
                         month >= 6 && month <= 8 ? 'Verano - Demanda moderada' :
                         month >= 9 && month <= 10 ? 'Otoño - Cierre de año' :
                         'Invierno - Planificación';

    return {
      best_day_for_inquiries: bestDay,
      best_hour_for_response: `${bestHour}:00`,
      avg_decision_days: avgDecisionDays,
      seasonal_trend: seasonalTrend
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private generateRecommendations(
    demandByDev: DevelopmentDemand[],
    pricing: MarketAnalysis['pricing'],
    sources: MarketAnalysis['sources'],
    competition: MarketAnalysis['competition'],
    timing: MarketAnalysis['timing']
  ): string[] {
    const recommendations: string[] = [];

    // Development recommendations
    const topDev = demandByDev[0];
    if (topDev && topDev.inquiries > 10) {
      recommendations.push(`📈 ${topDev.development} tiene alta demanda. Asegurar inventario disponible.`);
    }

    const risingDev = demandByDev.find(d => d.trend === 'up' && d.trend_percent > 30);
    if (risingDev) {
      recommendations.push(`🚀 ${risingDev.development} creció ${risingDev.trend_percent}%. Aumentar promoción.`);
    }

    // Pricing recommendations
    if (pricing.price_sensitivity === 'Alta') {
      recommendations.push(`💰 Alta sensibilidad al precio. Considerar promociones o facilidades de pago.`);
    }

    // Source recommendations
    if (sources.best_converting !== sources.highest_volume) {
      recommendations.push(`📊 ${sources.best_converting} tiene mejor conversión. Aumentar inversión en este canal.`);
    }

    // Competition recommendations
    if (competition.lost_to_competition > 5) {
      recommendations.push(`⚔️ ${competition.lost_to_competition} leads perdidos vs competencia. Revisar propuesta de valor.`);
    }

    // Timing recommendations
    recommendations.push(`⏰ Mejores días para contactar: ${timing.best_day_for_inquiries} a las ${timing.best_hour_for_response}`);

    if (timing.avg_decision_days > 30) {
      recommendations.push(`📅 Ciclo de decisión largo (${timing.avg_decision_days} días). Implementar nurturing.`);
    }

    return recommendations.slice(0, 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatForWhatsApp(analysis: MarketAnalysis): string {
    let msg = `📊 *INTELIGENCIA DE MERCADO*\n`;
    msg += `📅 Últimos ${analysis.period_days} días\n\n`;

    msg += `*Demanda:*\n`;
    msg += `• Total consultas: ${analysis.demand.total_inquiries}\n`;
    for (const dev of analysis.demand.by_development.slice(0, 5)) {
      const trendEmoji = dev.trend === 'up' ? '📈' : dev.trend === 'down' ? '📉' : '➡️';
      msg += `• ${dev.development}: ${dev.inquiries} (${dev.conversion_rate}) ${trendEmoji}\n`;
    }
    msg += `\n`;

    if (analysis.demand.trending_up.length > 0) {
      msg += `🔥 *Tendencia al alza:* ${analysis.demand.trending_up.join(', ')}\n\n`;
    }

    msg += `*Precios:*\n`;
    msg += `• Presupuesto promedio: $${this.formatNumber(analysis.pricing.avg_budget)}\n`;
    msg += `• Sensibilidad: ${analysis.pricing.price_sensitivity}\n\n`;

    msg += `*Fuentes:*\n`;
    msg += `• Mejor conversión: ${analysis.sources.best_converting}\n`;
    msg += `• Mayor volumen: ${analysis.sources.highest_volume}\n\n`;

    if (analysis.competition.mentions_count > 0) {
      msg += `*Competencia:*\n`;
      msg += `• Menciones: ${analysis.competition.mentions_count}\n`;
      msg += `• Win rate: ${analysis.competition.win_rate_vs_competition}\n\n`;
    }

    msg += `*Timing:*\n`;
    msg += `• Mejor día: ${analysis.timing.best_day_for_inquiries}\n`;
    msg += `• Decisión promedio: ${analysis.timing.avg_decision_days} días\n\n`;

    if (analysis.recommendations.length > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💡 *RECOMENDACIONES:*\n\n`;
      for (const rec of analysis.recommendations) {
        msg += `${rec}\n`;
      }
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private normalizeDevelopmentName(name: string): string {
    const normalized = name.toLowerCase().trim();

    const mappings: Record<string, string> = {
      'monteverde': 'Monte Verde',
      'monte verde': 'Monte Verde',
      'falco': 'Distrito Falco',
      'distrito falco': 'Distrito Falco',
      'encinos': 'Los Encinos',
      'los encinos': 'Los Encinos',
      'miravalle': 'Miravalle',
      'campelo': 'Villa Campelo',
      'villa campelo': 'Villa Campelo',
      'galiano': 'Villa Galiano',
      'villa galiano': 'Villa Galiano',
      'citadella': 'Citadella del Nogal',
      'nogal': 'Citadella del Nogal',
      'colinas': 'Colinas del Padre',
      'andes': 'Los Andes'
    };

    for (const [pattern, canonical] of Object.entries(mappings)) {
      if (normalized.includes(pattern)) {
        return canonical;
      }
    }

    return name || 'Sin especificar';
  }

  private formatNumber(num: number): string {
    return num.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }
}
