// Competitor Comparison Service
// Detects competitor mentions in conversation and generates comparison data
// vs Grupo Santa Rita developments
//
// ⚠️ IMPORTANTE: Los datos de competidores son PLACEHOLDERS.
// Actualizar con datos reales del mercado de Zacatecas antes de usar en producción.

interface Competitor {
  name: string;
  aliases: string[];       // Alternative names/misspellings people might use
  developments: string[];
  priceRange: string;
  weaknesses: string[];    // vs Grupo Santa Rita advantages
  zone: string;
  yearsInMarket?: number;
}

export class CompetitorService {
  // ⚠️ PLACEHOLDER DATA — Actualizar con competidores reales de Zacatecas
  private readonly competitors: Competitor[] = [
    {
      name: 'Villas del Sol',
      aliases: ['villas sol', 'villas del sol', 'villa del sol'],
      developments: ['Villas del Sol I', 'Villas del Sol II'],
      priceRange: '$1.2M - $2.5M',
      weaknesses: ['Sin vigilancia 24/7', 'Acabados básicos', 'Sin casa club', 'Menor plusvalía histórica'],
      zone: 'Guadalupe',
      yearsInMarket: 10,
    },
    {
      name: 'Casas GEO',
      aliases: ['geo', 'casas geo', 'geo zacatecas'],
      developments: ['GEO Zacatecas', 'GEO Guadalupe'],
      priceRange: '$800K - $1.8M',
      weaknesses: ['Espacios reducidos', 'Acabados económicos', 'Alta densidad', 'Problemas de mantenimiento reportados'],
      zone: 'Varias zonas',
      yearsInMarket: 30,
    },
    {
      name: 'Fraccionamiento La Joya',
      aliases: ['la joya', 'fracc la joya', 'fraccionamiento joya'],
      developments: ['La Joya Residencial'],
      priceRange: '$1.5M - $3.0M',
      weaknesses: ['Sin amenidades completas', 'Accesos limitados', 'Menor trayectoria'],
      zone: 'Zacatecas',
      yearsInMarket: 8,
    },
    {
      name: 'Residencial del Bosque',
      aliases: ['del bosque', 'residencial bosque', 'fracc del bosque'],
      developments: ['Residencial del Bosque I', 'Residencial del Bosque II'],
      priceRange: '$2.0M - $4.0M',
      weaknesses: ['Precios más altos por m²', 'Sin financiamiento directo', 'Pocos modelos disponibles'],
      zone: 'Zacatecas Norte',
      yearsInMarket: 15,
    },
  ];

  // GSR advantages (used in all comparisons)
  private readonly gsrAdvantages: Record<string, string> = {
    trayectoria: '50+ años de experiencia',
    vigilancia: 'Vigilancia 24/7 en todos los desarrollos',
    plusvalia: 'Plusvalía promedio +6% anual',
    acabados: 'Acabados premium incluidos',
    financiamiento: 'Asesoría hipotecaria incluida',
    ubicacion: 'Ubicaciones estratégicas en Zacatecas y Guadalupe',
    amenidades: 'Casa club, áreas verdes, juegos infantiles',
    garantia: 'Garantía estructural',
  };

  /**
   * Detect if text mentions a competitor
   * Returns the matched competitor or null
   */
  detectCompetitor(text: string): Competitor | null {
    const normalized = text.toLowerCase().trim();

    for (const competitor of this.competitors) {
      // Check main name
      if (normalized.includes(competitor.name.toLowerCase())) {
        return competitor;
      }
      // Check aliases
      for (const alias of competitor.aliases) {
        if (normalized.includes(alias)) {
          return competitor;
        }
      }
    }

    return null;
  }

  /**
   * Generate a WhatsApp-formatted comparison between a GSR development and a competitor
   * @param competitor The detected competitor
   * @param gsrDevelopment Optional specific GSR development to compare against
   * @param gsrProperties Optional properties from DB for real price data
   */
  generateComparison(competitor: Competitor, gsrDevelopment?: string, gsrProperties?: any[]): string {
    const gsrName = gsrDevelopment || 'Grupo Santa Rita';

    // Get GSR price range from properties if available
    let gsrPriceRange = 'Desde $1.6M';
    if (gsrProperties && gsrProperties.length > 0) {
      const devProps = gsrDevelopment
        ? gsrProperties.filter((p: any) =>
            p.development?.toLowerCase() === gsrDevelopment.toLowerCase() ||
            p.name?.toLowerCase().includes(gsrDevelopment.toLowerCase())
          )
        : gsrProperties;

      if (devProps.length > 0) {
        const prices = devProps
          .map((p: any) => p.price_min || p.price || 0)
          .filter((p: number) => p > 0);
        if (prices.length > 0) {
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          gsrPriceRange = `${this.formatPrice(min)} - ${this.formatPrice(max)}`;
        }
      }
    }

    let response = `📊 *Comparación: ${gsrName} vs ${competitor.name}*\n\n`;

    // Feature comparison table (WhatsApp doesn't render tables, so use aligned format)
    const rows: [string, string, string][] = [
      ['Precio', gsrPriceRange, competitor.priceRange],
      ['Vigilancia 24/7', '✅', this.hasWeakness(competitor, 'vigilancia') ? '❌' : '✅'],
      ['Casa club', '✅', this.hasWeakness(competitor, 'casa club') ? '❌' : '✅'],
      ['Acabados', 'Premium', this.hasWeakness(competitor, 'acabados') ? 'Básicos' : 'Estándar'],
      ['Trayectoria', '50+ años', competitor.yearsInMarket ? `${competitor.yearsInMarket} años` : 'N/D'],
      ['Plusvalía est.', '+6% anual', this.hasWeakness(competitor, 'plusvalía') ? '~3% anual' : '~4% anual'],
      ['Asesoría hipotecaria', '✅ Incluida', this.hasWeakness(competitor, 'financiamiento') ? '❌' : '✅'],
    ];

    for (const [feature, gsr, comp] of rows) {
      response += `▪️ *${feature}*\n`;
      response += `   Santa Rita: ${gsr}\n`;
      response += `   ${competitor.name}: ${comp}\n\n`;
    }

    // Key differentiator
    const keyDiff = this.getKeyDifferentiator(competitor);
    response += `💡 *Ventaja Santa Rita:* ${keyDiff}`;

    return response;
  }

  /**
   * Check if competitor has a specific weakness (case-insensitive partial match)
   */
  private hasWeakness(competitor: Competitor, keyword: string): boolean {
    return competitor.weaknesses.some(w => w.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * Get the most impactful differentiator vs this competitor
   */
  private getKeyDifferentiator(competitor: Competitor): string {
    if (this.hasWeakness(competitor, 'vigilancia')) {
      return 'Todos nuestros desarrollos cuentan con vigilancia 24/7 y acceso controlado para tu tranquilidad.';
    }
    if (this.hasWeakness(competitor, 'acabados')) {
      return 'Nuestras casas incluyen acabados premium de serie — no necesitas gastar extra en remodelaciones.';
    }
    if (this.hasWeakness(competitor, 'plusvalía')) {
      return 'Nuestros desarrollos tienen plusvalía histórica superior al 6% anual, protegiendo tu inversión.';
    }
    if (this.hasWeakness(competitor, 'espacios') || this.hasWeakness(competitor, 'reducidos')) {
      return 'Nuestros diseños priorizan espacios amplios y funcionales para toda la familia.';
    }
    if (this.hasWeakness(competitor, 'financiamiento')) {
      return 'Incluimos asesoría hipotecaria personalizada sin costo — te acompañamos en todo el proceso.';
    }
    // Default
    return 'Más de 50 años de experiencia respaldan cada casa que construimos. Tu inversión está en buenas manos.';
  }

  /**
   * Format price for display
   */
  private formatPrice(price: number): string {
    if (price >= 1_000_000) {
      const m = price / 1_000_000;
      return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
    }
    if (price >= 1_000) {
      return `$${Math.round(price / 1_000)}K`;
    }
    return `$${price}`;
  }

  /**
   * Get competitor context string for injection into AI prompt
   * Gives Claude knowledge about competitors to handle mentions naturally
   */
  getCompetitorContext(): string {
    let context = 'COMPETIDORES CONOCIDOS EN ZACATECAS:\n';

    for (const c of this.competitors) {
      context += `- ${c.name} (${c.zone}): ${c.priceRange}. `;
      context += `Debilidades vs GSR: ${c.weaknesses.join(', ')}.\n`;
    }

    context += '\nVENTAJAS GRUPO SANTA RITA:\n';
    for (const [key, value] of Object.entries(this.gsrAdvantages)) {
      context += `- ${key}: ${value}\n`;
    }

    context += '\nREGLA: Nunca hablar mal directamente del competidor. ';
    context += 'Enfocarse en las ventajas de Grupo Santa Rita de forma positiva. ';
    context += 'Si el lead menciona un competidor, reconocer que es una opción válida ';
    context += 'y luego destacar lo que nos diferencia.\n';

    return context;
  }

  /**
   * Get all competitor names and aliases for intent detection
   */
  getAllCompetitorTerms(): string[] {
    const terms: string[] = [];
    for (const c of this.competitors) {
      terms.push(c.name.toLowerCase());
      terms.push(...c.aliases);
    }
    return terms;
  }

  /**
   * Add a new competitor at runtime (e.g., from KV config)
   */
  addCompetitor(competitor: Competitor): void {
    this.competitors.push(competitor);
  }
}
