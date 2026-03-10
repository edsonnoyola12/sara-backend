// ═══════════════════════════════════════════════════════════════════════════
// PRICE ANCHORING SERVICE - Reframing de precios para conversaciones de IA
// Genera contexto de inversión inteligente para inyectar en prompts de SARA
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PriceAnchoring {
  monthlyPayment: string;        // "$12,500/mes"
  downPayment: string;           // "$160,000 de enganche (10%)"
  rentalComparison: string;      // "Solo $2,000 más que rentar en la zona"
  priceAppreciation: string;     // "Este desarrollo ha subido 6% en los últimos 12 meses"
  investmentValue: string;       // "En 3 años tu casa podría valer $1.9M"
  urgencyMessage: string;        // "Los precios suben 0.5% cada mes"
  formattedBlock: string;        // Full formatted text block for WhatsApp
}

interface PropertyInput {
  name: string;
  development: string;
  price: number;
  price_equipped?: number;
}

interface AnchoringOptions {
  includeRental?: boolean;
  includeAppreciation?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Mexican mortgage rates (2026)
const INFONAVIT_RATE = 10.45;   // % anual
const INFONAVIT_TERM = 30;      // años
const BANK_AVG_RATE = 11.50;    // % anual (Scotiabank-level, conservative)
const BANK_TERM = 20;           // años
const DEFAULT_DOWN_PERCENT = 10; // 10% enganche

// Monthly appreciation applied by SARA's CRON
const MONTHLY_APPRECIATION = 0.5; // %

// Average rents by zone in Zacatecas (MXN/mes)
const ZONE_RENTS: Record<string, { min: number; max: number; avg: number }> = {
  'colinas del padre': { min: 8000, max: 12000, avg: 10000 },
  'guadalupe':         { min: 6000, max: 9000,  avg: 7500 },
  'centro':            { min: 5000, max: 8000,  avg: 6500 },
  'default':           { min: 6000, max: 10000, avg: 8000 },
};

// Map developments to their zone for rental comparison
const DEVELOPMENT_ZONES: Record<string, string> = {
  'monte verde':       'colinas del padre',
  'los encinos':       'colinas del padre',
  'miravalle':         'colinas del padre',
  'paseo colorines':   'colinas del padre',
  'monte real':        'colinas del padre',
  'andes':             'guadalupe',
  'distrito falco':    'guadalupe',
  'villa campelo':     'guadalupe',
  'villa galiano':     'guadalupe',
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PriceAnchoringService {

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN: Generate anchoring for a specific property
  // ═══════════════════════════════════════════════════════════════════════

  generateAnchoring(
    property: PropertyInput,
    options: AnchoringOptions = {}
  ): PriceAnchoring {
    const {
      includeRental = true,
      includeAppreciation = true,
    } = options;

    const price = property.price;
    const downAmount = Math.round(price * (DEFAULT_DOWN_PERCENT / 100));
    const loanAmount = price - downAmount;

    // Calculate monthly payments
    const infonavitMonthly = this.calculateMonthlyPayment(loanAmount, INFONAVIT_RATE, INFONAVIT_TERM);
    const bankMonthly = this.calculateMonthlyPayment(loanAmount, BANK_AVG_RATE, BANK_TERM);

    const monthlyPayment = `Desde ${this.fmt(infonavitMonthly)}/mes con INFONAVIT hasta ${this.fmt(bankMonthly)}/mes con banco`;
    const downPayment = `${this.fmt(downAmount)} de enganche (${DEFAULT_DOWN_PERCENT}%)`;

    // Rental comparison
    const zone = this.getZone(property.development);
    const zoneRent = ZONE_RENTS[zone] || ZONE_RENTS['default'];
    const rentDiff = infonavitMonthly - zoneRent.avg;
    let rentalComparison: string;
    if (rentDiff <= 0) {
      rentalComparison = `Tu mensualidad sería ${this.fmt(infonavitMonthly)} — ¡menos que rentar en la zona (${this.fmt(zoneRent.avg)}/mes)!`;
    } else {
      rentalComparison = `Tu mensualidad sería ${this.fmt(infonavitMonthly)} — solo ${this.fmt(rentDiff)} más que rentar en la zona`;
    }

    // Price appreciation (0.5%/month = ~6.17% annual compound)
    const annualAppreciation = Math.round((Math.pow(1 + MONTHLY_APPRECIATION / 100, 12) - 1) * 100 * 10) / 10;
    const priceAppreciation = `Los precios han subido ~${annualAppreciation}% en los últimos 12 meses`;

    // 3-year projection
    const threeYearFactor = Math.pow(1 + MONTHLY_APPRECIATION / 100, 36);
    const futureValue = Math.round(price * threeYearFactor);
    const investmentValue = `En 3 años, una propiedad de ${this.fmt(price)} podría valer ~${this.fmt(futureValue)}`;

    const urgencyMessage = 'Los precios suben 0.5% cada mes. Apartando hoy aseguras el precio actual.';

    // Build WhatsApp formatted block
    const lines: string[] = [
      '💰 *Inversión inteligente*',
      `📊 Mensualidad desde *${this.fmt(infonavitMonthly)}/mes* (INFONAVIT ${INFONAVIT_TERM} años)`,
      `🏠 Enganche: *${this.fmt(downAmount)}* (${DEFAULT_DOWN_PERCENT}%)`,
    ];

    if (includeAppreciation) {
      lines.push(`📈 Plusvalía: +${annualAppreciation}% último año`);
    }

    if (includeRental) {
      if (rentDiff <= 0) {
        lines.push(`💡 ¡*Más barato* que rentar en la zona!`);
      } else {
        lines.push(`💡 Solo *${this.fmt(rentDiff)} más* que rentar en la zona`);
      }
    }

    lines.push('⏰ Precios suben 0.5% mensual — aparta hoy');

    const formattedBlock = lines.join('\n');

    return {
      monthlyPayment,
      downPayment,
      rentalComparison,
      priceAppreciation,
      investmentValue,
      urgencyMessage,
      formattedBlock,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Generate anchoring context text for AI system prompt injection
  // ═══════════════════════════════════════════════════════════════════════

  getAnchoringContext(developments: any[]): string {
    if (!developments || developments.length === 0) {
      return '';
    }

    const sections: string[] = [
      '=== DATOS DE INVERSIÓN Y FINANCIAMIENTO (úsalos cuando el lead pregunte por precio, costo, o dude por el precio) ===',
      '',
    ];

    // General financing facts
    sections.push('FINANCIAMIENTO EN MÉXICO:');
    sections.push(`- INFONAVIT: tasa ${INFONAVIT_RATE}% anual, hasta ${INFONAVIT_TERM} años, enganche desde 0% (con puntos)`);
    sections.push(`- Bancos (BBVA, Banorte, HSBC): tasa ~10.5-11.5% anual, hasta 20 años, enganche mínimo 10%`);
    sections.push(`- Cofinavit: combina INFONAVIT + banco, tasa ~10.2%, mayor monto`);
    sections.push('');

    // Appreciation facts
    const annualPct = Math.round((Math.pow(1 + MONTHLY_APPRECIATION / 100, 12) - 1) * 100 * 10) / 10;
    sections.push('PLUSVALÍA:');
    sections.push(`- Los precios de Grupo Santa Rita suben +${MONTHLY_APPRECIATION}% mensual (~${annualPct}% anual)`);
    sections.push('- En 3 años una propiedad gana ~19.7% de valor');
    sections.push('- Comprar hoy = asegurar el precio más bajo disponible');
    sections.push('');

    // Rental comparison data
    sections.push('RENTAS PROMEDIO EN ZACATECAS (para comparar con mensualidad):');
    for (const [zone, rent] of Object.entries(ZONE_RENTS)) {
      if (zone === 'default') continue;
      const zoneName = zone.charAt(0).toUpperCase() + zone.slice(1);
      sections.push(`- ${zoneName}: $${rent.min.toLocaleString('es-MX')}-$${rent.max.toLocaleString('es-MX')}/mes (promedio $${rent.avg.toLocaleString('es-MX')})`);
    }
    sections.push('');

    // Per-development quick numbers
    sections.push('MENSUALIDADES ESTIMADAS POR DESARROLLO (enganche 10%, INFONAVIT 30 años):');
    for (const dev of developments) {
      // developments may have different shapes; handle both property-level and development-level
      const name = dev.development || dev.name || 'Desconocido';
      const price = dev.price || dev.price_min || dev.price_max || 0;
      if (price <= 0) continue;

      const downAmount = Math.round(price * (DEFAULT_DOWN_PERCENT / 100));
      const loan = price - downAmount;
      const monthly = this.calculateMonthlyPayment(loan, INFONAVIT_RATE, INFONAVIT_TERM);
      const zone = this.getZone(name);
      const zoneRent = ZONE_RENTS[zone] || ZONE_RENTS['default'];
      const diff = monthly - zoneRent.avg;

      let comparison = '';
      if (diff <= 0) {
        comparison = ` (¡más barato que rentar!)`;
      } else if (diff < 5000) {
        comparison = ` (solo $${diff.toLocaleString('es-MX')} más que rentar)`;
      }

      sections.push(`- ${name}: precio ${this.fmt(price)} → mensualidad ~${this.fmt(monthly)}/mes${comparison}`);
    }
    sections.push('');

    sections.push('INSTRUCCIONES DE USO:');
    sections.push('- Cuando el lead diga que es caro, reframea en mensualidad y compara con renta');
    sections.push('- Menciona la plusvalía como inversión, no como gasto');
    sections.push('- Usa urgencia sutil: "los precios suben cada mes"');
    sections.push('- Siempre ofrece calcular un plan de financiamiento personalizado');
    sections.push('=== FIN DATOS DE INVERSIÓN ===');

    return sections.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Standard amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
   */
  private calculateMonthlyPayment(principal: number, annualRate: number, termYears: number): number {
    const r = annualRate / 100 / 12;
    const n = termYears * 12;

    if (r === 0) return Math.round(principal / n);

    const factor = Math.pow(1 + r, n);
    const payment = principal * (r * factor) / (factor - 1);
    return Math.round(payment);
  }

  /**
   * Get zone key for a development name
   */
  private getZone(developmentName: string): string {
    const key = developmentName.toLowerCase().trim();
    return DEVELOPMENT_ZONES[key] || 'default';
  }

  /**
   * Format number as Mexican currency
   */
  private fmt(amount: number): string {
    return '$' + amount.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }
}
