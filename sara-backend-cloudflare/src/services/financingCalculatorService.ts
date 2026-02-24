// ═══════════════════════════════════════════════════════════════════════════
// FINANCING CALCULATOR SERVICE - Calculadora de Financiamiento Hipotecario
// Calculates mortgage payments, qualification, and bank comparison
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MortgageParams {
  property_price: number;       // Precio de la propiedad
  down_payment_percent: number; // Porcentaje de enganche (10-50%)
  term_years: number;           // Plazo en años (5, 10, 15, 20, 25, 30)
  annual_rate?: number;         // Tasa anual (opcional, usa default del banco)
  income?: number;              // Ingreso mensual (para calificación)
  infonavit_credit?: number;    // Crédito INFONAVIT disponible (opcional)
  fovissste_credit?: number;    // Crédito FOVISSSTE disponible (opcional)
}

export interface MortgageResult {
  bank: string;
  property_price: number;
  down_payment: number;
  loan_amount: number;
  term_years: number;
  annual_rate: number;
  monthly_payment: number;
  total_payment: number;
  total_interest: number;
  cat: number;                  // Costo Anual Total
  qualifies: boolean;
  required_income: number;
  debt_to_income_ratio: number;
  opening_commission: number;
  monthly_insurance: number;
  appraisal_cost: number;
  notes: string[];
}

export interface BankComparison {
  calculated_at: string;
  params: {
    property_price: number;
    down_payment_percent: number;
    loan_amount: number;
    term_years: number;
  };
  banks: MortgageResult[];
  recommendation: string;
  cheapest_monthly: string;
  cheapest_total: string;
  fastest_approval: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BANK CONFIGURATIONS (2026 rates for Mexico)
// ═══════════════════════════════════════════════════════════════════════════

interface BankConfig {
  name: string;
  annual_rate: number;          // Tasa anual fija
  cat: number;                  // CAT sin IVA
  min_down_payment: number;     // Enganche mínimo %
  max_term: number;             // Plazo máximo años
  opening_commission: number;   // Comisión por apertura %
  insurance_rate: number;       // Seguro mensual % del saldo
  appraisal_cost: number;       // Costo de avalúo
  min_income_ratio: number;     // Ingreso mínimo = pago * ratio
  processing_days: number;      // Días para aprobación
  special_notes: string[];
}

const BANK_CONFIGS: Record<string, BankConfig> = {
  'BBVA': {
    name: 'BBVA México',
    annual_rate: 10.50,
    cat: 12.8,
    min_down_payment: 10,
    max_term: 20,
    opening_commission: 0,      // Sin comisión de apertura
    insurance_rate: 0.0035,     // 0.35% mensual
    appraisal_cost: 7500,
    min_income_ratio: 3.0,      // Ingreso >= 3x pago mensual
    processing_days: 10,
    special_notes: ['Sin comisión por apertura', 'Proceso 100% digital']
  },
  'Banorte': {
    name: 'Banorte',
    annual_rate: 10.80,
    cat: 13.2,
    min_down_payment: 10,
    max_term: 20,
    opening_commission: 1.0,
    insurance_rate: 0.0032,
    appraisal_cost: 6500,
    min_income_ratio: 3.0,
    processing_days: 12,
    special_notes: ['Hipoteca perfiles (mejores tasas con más productos)', 'Incluye seguro de vida']
  },
  'Santander': {
    name: 'Santander',
    annual_rate: 11.20,
    cat: 13.8,
    min_down_payment: 15,
    max_term: 20,
    opening_commission: 1.5,
    insurance_rate: 0.0038,
    appraisal_cost: 8000,
    min_income_ratio: 3.2,
    processing_days: 15,
    special_notes: ['Opción de pagos fijos', 'Acepta coinversión']
  },
  'HSBC': {
    name: 'HSBC',
    annual_rate: 10.90,
    cat: 13.0,
    min_down_payment: 10,
    max_term: 20,
    opening_commission: 1.0,
    insurance_rate: 0.0033,
    appraisal_cost: 7000,
    min_income_ratio: 3.0,
    processing_days: 14,
    special_notes: ['Hipoteca verde (mejor tasa para inmuebles sustentables)', 'Sin penalización por prepago']
  },
  'Scotiabank': {
    name: 'Scotiabank',
    annual_rate: 11.50,
    cat: 14.0,
    min_down_payment: 10,
    max_term: 20,
    opening_commission: 1.0,
    insurance_rate: 0.0036,
    appraisal_cost: 7500,
    min_income_ratio: 3.0,
    processing_days: 12,
    special_notes: ['Crédito puente disponible', 'Acepta comprobantes alternativos']
  },
  'INFONAVIT': {
    name: 'INFONAVIT',
    annual_rate: 10.45,
    cat: 11.5,
    min_down_payment: 0,        // Puede ser 0% con puntos
    max_term: 30,
    opening_commission: 0,
    insurance_rate: 0.0025,
    appraisal_cost: 0,          // Incluido
    min_income_ratio: 2.5,
    processing_days: 30,
    special_notes: ['Requiere puntos mínimos (116)', 'Tasa en VSM', 'Gastos de escrituración incluidos']
  },
  'FOVISSSTE': {
    name: 'FOVISSSTE',
    annual_rate: 9.80,
    cat: 10.8,
    min_down_payment: 0,
    max_term: 30,
    opening_commission: 0,
    insurance_rate: 0.0020,
    appraisal_cost: 0,
    min_income_ratio: 2.0,
    processing_days: 45,
    special_notes: ['Solo trabajadores del Estado', 'Sorteo para asignación', 'Sin gastos de escrituración']
  },
  'Cofinavit': {
    name: 'Cofinavit (INFONAVIT + Banco)',
    annual_rate: 10.20,
    cat: 12.0,
    min_down_payment: 5,
    max_term: 20,
    opening_commission: 0.5,
    insurance_rate: 0.0030,
    appraisal_cost: 5000,
    min_income_ratio: 2.8,
    processing_days: 25,
    special_notes: ['Combina subcuenta + crédito bancario', 'Mayor monto de crédito', 'Requiere puntos INFONAVIT']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class FinancingCalculatorService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN CALCULATOR
  // ═══════════════════════════════════════════════════════════════════════════

  calculateMortgage(params: MortgageParams, bankKey: string): MortgageResult | null {
    const bank = BANK_CONFIGS[bankKey];
    if (!bank) return null;

    const {
      property_price,
      down_payment_percent,
      term_years,
      annual_rate,
      income = 0
    } = params;

    // Validate inputs
    if (property_price <= 0 || down_payment_percent < 0 || term_years <= 0) {
      return null;
    }

    // Check minimum down payment
    const effectiveDownPayment = Math.max(down_payment_percent, bank.min_down_payment);
    const downPayment = property_price * (effectiveDownPayment / 100);
    const loanAmount = property_price - downPayment;

    // Check max term
    const effectiveTerm = Math.min(term_years, bank.max_term);

    // Use provided rate or bank default
    const rate = annual_rate || bank.annual_rate;
    const monthlyRate = rate / 100 / 12;
    const totalPayments = effectiveTerm * 12;

    // Calculate monthly payment using amortization formula
    // M = P * [r(1+r)^n] / [(1+r)^n - 1]
    let monthlyPayment: number;
    if (monthlyRate === 0) {
      monthlyPayment = loanAmount / totalPayments;
    } else {
      const factor = Math.pow(1 + monthlyRate, totalPayments);
      monthlyPayment = loanAmount * (monthlyRate * factor) / (factor - 1);
    }

    // Add insurance
    const monthlyInsurance = loanAmount * bank.insurance_rate;
    const totalMonthlyPayment = monthlyPayment + monthlyInsurance;

    // Calculate totals
    const totalPayment = totalMonthlyPayment * totalPayments;
    const totalInterest = totalPayment - loanAmount;

    // Calculate opening commission
    const openingCommission = loanAmount * (bank.opening_commission / 100);

    // Check qualification
    const requiredIncome = totalMonthlyPayment * bank.min_income_ratio;
    const qualifies = income > 0 ? income >= requiredIncome : true;
    const debtToIncomeRatio = income > 0 ? (totalMonthlyPayment / income) * 100 : 0;

    // Build notes
    const notes: string[] = [...bank.special_notes];
    if (effectiveDownPayment > down_payment_percent) {
      notes.unshift(`⚠️ Enganche mínimo ajustado a ${effectiveDownPayment}%`);
    }
    if (effectiveTerm < term_years) {
      notes.unshift(`⚠️ Plazo máximo ajustado a ${effectiveTerm} años`);
    }
    if (income > 0 && !qualifies) {
      notes.unshift(`❌ Ingreso insuficiente (requiere $${this.formatNumber(requiredIncome)})`);
    }

    return {
      bank: bank.name,
      property_price,
      down_payment: downPayment,
      loan_amount: loanAmount,
      term_years: effectiveTerm,
      annual_rate: rate,
      monthly_payment: Math.round(totalMonthlyPayment),
      total_payment: Math.round(totalPayment),
      total_interest: Math.round(totalInterest),
      cat: bank.cat,
      qualifies,
      required_income: Math.round(requiredIncome),
      debt_to_income_ratio: Math.round(debtToIncomeRatio * 10) / 10,
      opening_commission: Math.round(openingCommission),
      monthly_insurance: Math.round(monthlyInsurance),
      appraisal_cost: bank.appraisal_cost,
      notes
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARE ALL BANKS
  // ═══════════════════════════════════════════════════════════════════════════

  compareBanks(params: MortgageParams): BankComparison {
    const results: MortgageResult[] = [];

    // Calculate for each bank (except special ones unless applicable)
    const banksToCompare = ['BBVA', 'Banorte', 'Santander', 'HSBC', 'Scotiabank'];

    // Add INFONAVIT if applicable
    if (params.infonavit_credit && params.infonavit_credit > 0) {
      banksToCompare.push('INFONAVIT');
      banksToCompare.push('Cofinavit');
    }

    // Add FOVISSSTE if applicable
    if (params.fovissste_credit && params.fovissste_credit > 0) {
      banksToCompare.push('FOVISSSTE');
    }

    for (const bankKey of banksToCompare) {
      const result = this.calculateMortgage(params, bankKey);
      if (result) {
        results.push(result);
      }
    }

    // Sort by monthly payment
    results.sort((a, b) => a.monthly_payment - b.monthly_payment);

    // Find recommendations
    const cheapestMonthly = results[0]?.bank || 'N/A';
    const cheapestTotal = [...results].sort((a, b) => a.total_payment - b.total_payment)[0]?.bank || 'N/A';
    const fastestApproval = [...results].sort((a, b) => {
      const aBank = Object.values(BANK_CONFIGS).find((b: any) => b.name === a.bank);
      const bBank = Object.values(BANK_CONFIGS).find((b: any) => b.name === b.bank);
      return (aBank?.processing_days || 99) - (bBank?.processing_days || 99);
    })[0]?.bank || 'N/A';

    // Build recommendation
    let recommendation = '';
    if (results.length > 0) {
      const best = results[0];
      if (best.qualifies) {
        recommendation = `Recomendamos ${best.bank} con mensualidad de $${this.formatNumber(best.monthly_payment)}`;
      } else {
        const qualifying = results.find(r => r.qualifies);
        if (qualifying) {
          recommendation = `Con tu ingreso actual, calificas para ${qualifying.bank} ($${this.formatNumber(qualifying.monthly_payment)}/mes)`;
        } else {
          recommendation = `Considera aumentar el enganche o plazo para reducir la mensualidad requerida`;
        }
      }
    }

    return {
      calculated_at: new Date().toISOString(),
      params: {
        property_price: params.property_price,
        down_payment_percent: params.down_payment_percent,
        loan_amount: params.property_price * (1 - params.down_payment_percent / 100),
        term_years: params.term_years
      },
      banks: results,
      recommendation,
      cheapest_monthly: cheapestMonthly,
      cheapest_total: cheapestTotal,
      fastest_approval: fastestApproval
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUICK ESTIMATE (for conversational use)
  // ═══════════════════════════════════════════════════════════════════════════

  quickEstimate(propertyPrice: number, downPaymentPercent: number = 20, termYears: number = 20): string {
    const params: MortgageParams = {
      property_price: propertyPrice,
      down_payment_percent: downPaymentPercent,
      term_years: termYears
    };

    const bbva = this.calculateMortgage(params, 'BBVA');
    const banorte = this.calculateMortgage(params, 'Banorte');

    if (!bbva || !banorte) {
      return 'No se pudo calcular la cotización.';
    }

    const avgPayment = Math.round((bbva.monthly_payment + banorte.monthly_payment) / 2);
    const downPayment = propertyPrice * (downPaymentPercent / 100);

    return `💰 *Estimado de Financiamiento*\n\n` +
      `🏠 Precio: $${this.formatNumber(propertyPrice)}\n` +
      `💵 Enganche (${downPaymentPercent}%): $${this.formatNumber(downPayment)}\n` +
      `📅 Plazo: ${termYears} años\n\n` +
      `📊 *Mensualidad estimada:*\n` +
      `$${this.formatNumber(avgPayment - 5000)} - $${this.formatNumber(avgPayment + 5000)}\n\n` +
      `_Tasa aproximada: 10.5% - 11.5% anual_\n\n` +
      `¿Te gustaría una cotización detallada con comparativa de bancos?`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALIFICATION CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  checkQualification(income: number, propertyPrice: number, downPaymentPercent: number = 20): {
    qualifies: boolean;
    max_property_price: number;
    recommended_banks: string[];
    message: string;
  } {
    const params: MortgageParams = {
      property_price: propertyPrice,
      down_payment_percent: downPaymentPercent,
      term_years: 20,
      income
    };

    const comparison = this.compareBanks(params);
    const qualifyingBanks = comparison.banks.filter(b => b.qualifies);

    // Calculate max property price based on income
    // Rule: monthly payment should be <= income / 3
    const maxMonthlyPayment = income / 3;
    // Estimate: monthly payment ≈ loan * 0.01 (rough approximation)
    const maxLoan = maxMonthlyPayment / 0.01;
    const maxPropertyPrice = maxLoan / (1 - downPaymentPercent / 100);

    let message: string;
    if (qualifyingBanks.length === 0) {
      message = `❌ *No calificas actualmente*\n\n` +
        `Con ingreso de $${this.formatNumber(income)}/mes:\n` +
        `• Precio máximo recomendado: $${this.formatNumber(maxPropertyPrice)}\n` +
        `• Considera aumentar el enganche\n` +
        `• O buscar una propiedad de menor precio\n\n` +
        `¿Te ayudo a explorar opciones?`;
    } else {
      message = `✅ *¡Sí calificas!*\n\n` +
        `Con ingreso de $${this.formatNumber(income)}/mes:\n` +
        `• Calificas en ${qualifyingBanks.length} banco(s)\n` +
        `• Mejor opción: ${qualifyingBanks[0].bank}\n` +
        `• Mensualidad: $${this.formatNumber(qualifyingBanks[0].monthly_payment)}\n\n` +
        `¿Quieres que te conecte con un asesor hipotecario?`;
    }

    return {
      qualifies: qualifyingBanks.length > 0,
      max_property_price: Math.round(maxPropertyPrice),
      recommended_banks: qualifyingBanks.map(b => b.bank),
      message
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTED OUTPUT
  // ═══════════════════════════════════════════════════════════════════════════

  formatComparisonForWhatsApp(comparison: BankComparison): string {
    const { params, banks, recommendation } = comparison;

    let msg = `🏦 *COMPARATIVA DE CRÉDITOS*\n\n`;
    msg += `🏠 Precio: $${this.formatNumber(params.property_price)}\n`;
    msg += `💵 Enganche: ${params.down_payment_percent}% ($${this.formatNumber(params.property_price * params.down_payment_percent / 100)})\n`;
    msg += `💳 Monto a financiar: $${this.formatNumber(params.loan_amount)}\n`;
    msg += `📅 Plazo: ${params.term_years} años\n\n`;

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 *OPCIONES:*\n\n`;

    // Show top 5 banks
    for (const bank of banks.slice(0, 5)) {
      const emoji = bank.qualifies ? '✅' : '❌';
      msg += `${emoji} *${bank.bank}*\n`;
      msg += `   Mensualidad: $${this.formatNumber(bank.monthly_payment)}\n`;
      msg += `   Tasa: ${bank.annual_rate}% | CAT: ${bank.cat}%\n`;
      if (!bank.qualifies) {
        msg += `   _Requiere: $${this.formatNumber(bank.required_income)}/mes_\n`;
      }
      msg += `\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 *RECOMENDACIÓN:*\n${recommendation}\n\n`;

    msg += `_¿Quieres que te conecte con un asesor de algún banco específico?_`;

    return msg;
  }

  formatSingleBankForWhatsApp(result: MortgageResult): string {
    const emoji = result.qualifies ? '✅' : '⚠️';

    let msg = `${emoji} *COTIZACIÓN ${result.bank.toUpperCase()}*\n\n`;
    msg += `🏠 Precio: $${this.formatNumber(result.property_price)}\n`;
    msg += `💵 Enganche: $${this.formatNumber(result.down_payment)}\n`;
    msg += `💳 Crédito: $${this.formatNumber(result.loan_amount)}\n`;
    msg += `📅 Plazo: ${result.term_years} años\n\n`;

    msg += `📊 *MENSUALIDAD:* $${this.formatNumber(result.monthly_payment)}\n\n`;

    msg += `*Desglose:*\n`;
    msg += `• Tasa anual: ${result.annual_rate}%\n`;
    msg += `• CAT: ${result.cat}%\n`;
    msg += `• Seguro mensual: $${this.formatNumber(result.monthly_insurance)}\n`;
    msg += `• Comisión apertura: $${this.formatNumber(result.opening_commission)}\n`;
    msg += `• Avalúo: $${this.formatNumber(result.appraisal_cost)}\n\n`;

    msg += `💰 *Totales:*\n`;
    msg += `• Pago total: $${this.formatNumber(result.total_payment)}\n`;
    msg += `• Intereses: $${this.formatNumber(result.total_interest)}\n\n`;

    if (result.required_income > 0) {
      msg += `📋 *Requisitos:*\n`;
      msg += `• Ingreso mínimo: $${this.formatNumber(result.required_income)}/mes\n`;
      if (result.debt_to_income_ratio > 0) {
        msg += `• Tu ratio deuda/ingreso: ${result.debt_to_income_ratio}%\n`;
      }
      msg += `\n`;
    }

    if (result.notes.length > 0) {
      msg += `📝 *Notas:*\n`;
      for (const note of result.notes.slice(0, 3)) {
        msg += `• ${note}\n`;
      }
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private formatNumber(num: number): string {
    return num.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }

  // Get available banks list
  getAvailableBanks(): Array<{ key: string; name: string; rate: number }> {
    return Object.entries(BANK_CONFIGS).map(([key, config]) => ({
      key,
      name: config.name,
      rate: config.annual_rate
    }));
  }

  // Parse amount from text (handles "2 millones", "2.5m", "$2,500,000")
  parseAmount(text: string): number | null {
    const cleaned = text.toLowerCase().replace(/[$,\s]/g, '');

    // Handle millions
    const millionMatch = cleaned.match(/(\d+\.?\d*)\s*(millones?|mill?|m)/);
    if (millionMatch) {
      return parseFloat(millionMatch[1]) * 1_000_000;
    }

    // Handle thousands
    const thousandMatch = cleaned.match(/(\d+\.?\d*)\s*(mil|k)/);
    if (thousandMatch) {
      return parseFloat(thousandMatch[1]) * 1_000;
    }

    // Handle plain numbers
    const plainMatch = cleaned.match(/(\d+\.?\d*)/);
    if (plainMatch) {
      const num = parseFloat(plainMatch[1]);
      // If it looks like millions (under 100), assume millions
      if (num < 100) {
        return num * 1_000_000;
      }
      return num;
    }

    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (exported)
// ═══════════════════════════════════════════════════════════════════════════

export function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

export function parseFinancingRequest(text: string): Partial<MortgageParams> | null {
  const lowerText = text.toLowerCase();

  // Check if it's a financing request
  const financingKeywords = [
    'credito', 'crédito', 'hipoteca', 'hipotecario', 'financiamiento',
    'financiar', 'mensualidad', 'cuanto quedaria', 'cuánto quedaría',
    'pago mensual', 'cuotas', 'banco'
  ];

  const isFinancingRequest = financingKeywords.some(kw => lowerText.includes(kw));
  if (!isFinancingRequest) return null;

  const params: Partial<MortgageParams> = {};

  // Try to extract property price
  const pricePatterns = [
    /(?:precio|propiedad|casa|depto|departamento)[:\s]+\$?(\d[\d,\.]*)/i,
    /(?:de|por)\s+\$?(\d[\d,\.]*)\s*(?:pesos|mxn|mill|millones)?/i,
    /\$(\d[\d,\.]*)/,
  ];

  for (const pattern of pricePatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      let num = parseFloat(numStr);
      if (num < 100) num *= 1_000_000; // Assume millions
      params.property_price = num;
      break;
    }
  }

  // Try to extract down payment
  const downPaymentMatch = lowerText.match(/(?:enganche|entrada)[:\s]+(\d+)\s*%?/i);
  if (downPaymentMatch) {
    params.down_payment_percent = parseInt(downPaymentMatch[1]);
  }

  // Try to extract term
  const termMatch = lowerText.match(/(?:plazo|años)[:\s]+(\d+)/i);
  if (termMatch) {
    params.term_years = parseInt(termMatch[1]);
  }

  // Try to extract income
  const incomeMatch = lowerText.match(/(?:ingreso|gano|sueldo)[:\s]+\$?(\d[\d,\.]*)/i);
  if (incomeMatch) {
    const numStr = incomeMatch[1].replace(/,/g, '');
    params.income = parseFloat(numStr);
  }

  return Object.keys(params).length > 0 ? params : null;
}
