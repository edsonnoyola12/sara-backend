/**
 * SCORING SERVICE - Sistema basado en Funnel de Ventas
 *
 * El movimiento en el funnel es lo más importante,
 * las acciones individuales son bonificaciones menores.
 *
 * Actualizado: 7 Enero 2026
 */

export type LeadTemperature = 'HOT' | 'WARM' | 'COLD';
export type LeadStatus = 'new' | 'contacted' | 'scheduled' | 'visited' | 'negotiating' | 'closed' | 'fallen';

export interface FunnelScoreResult {
  score: number;
  temperature: LeadTemperature;
  status: LeadStatus;
  statusChanged: boolean;
  breakdown: {
    base: number;
    bonuses: number;
    details: string[];
  };
}

// Score base por etapa del funnel
const SCORE_FUNNEL: Record<LeadStatus, { min: number; max: number }> = {
  'new': { min: 10, max: 20 },
  'contacted': { min: 25, max: 40 },
  'scheduled': { min: 50, max: 70 },
  'visited': { min: 75, max: 85 },
  'negotiating': { min: 85, max: 95 },
  'closed': { min: 100, max: 100 },
  'fallen': { min: 0, max: 0 }
};

export class LeadScoringService {

  /**
   * Calcula el score de un lead basado en su posición en el funnel
   */
  calculateFunnelScore(
    lead: {
      status?: string;
      name?: string;
      property_interest?: string;
      needs_mortgage?: boolean;
      enganche_disponible?: number;
      mortgage_data?: { ingreso_mensual?: number };
    },
    hasActiveAppointment: boolean = false,
    intent?: string
  ): FunnelScoreResult {

    const details: string[] = [];

    // 1. Determinar etapa actual del funnel
    let currentStatus = (lead.status || 'new') as LeadStatus;
    let effectiveStatus = currentStatus;
    let statusChanged = false;

    // Promover a scheduled si tiene cita activa
    if (hasActiveAppointment && !['scheduled', 'visited', 'negotiating', 'closed'].includes(currentStatus)) {
      effectiveStatus = 'scheduled';
      statusChanged = true;
      details.push('Promovido a SCHEDULED por cita activa');
    }

    // Promover si está confirmando cita
    if (intent === 'confirmar_cita' && !['scheduled', 'visited', 'negotiating', 'closed'].includes(currentStatus)) {
      effectiveStatus = 'scheduled';
      statusChanged = true;
      details.push('Promovido a SCHEDULED por confirmar cita');
    }

    // 2. Obtener rango de score para la etapa
    const range = SCORE_FUNNEL[effectiveStatus] || SCORE_FUNNEL['new'];
    const baseScore = range.min;
    details.push(`Base ${effectiveStatus.toUpperCase()}: ${baseScore}`);

    // 3. Calcular bonificaciones
    let bonuses = 0;

    // Tiene nombre real: +3
    if (lead.name && lead.name !== 'Sin nombre' && lead.name.length > 2) {
      bonuses += 3;
      details.push('+3 tiene nombre');
    }

    // Tiene desarrollo de interés: +3
    if (lead.property_interest) {
      bonuses += 3;
      details.push('+3 desarrollo interés');
    }

    // Múltiples desarrollos: +2
    if (lead.property_interest?.includes(',')) {
      bonuses += 2;
      details.push('+2 múltiples desarrollos');
    }

    // Interés en crédito: +5
    if (lead.needs_mortgage) {
      bonuses += 5;
      details.push('+5 interés crédito');
    }

    // Proporcionó ingreso: +3
    if (lead.mortgage_data?.ingreso_mensual && lead.mortgage_data.ingreso_mensual > 0) {
      bonuses += 3;
      details.push('+3 proporcionó ingreso');
    }

    // Proporcionó enganche: +3
    if (lead.enganche_disponible && lead.enganche_disponible > 0) {
      bonuses += 3;
      details.push('+3 proporcionó enganche');
    }

    // 4. Calcular score final (no exceder máximo del rango)
    const finalScore = Math.min(range.max, baseScore + bonuses);

    // 5. Determinar temperatura
    let temperature: LeadTemperature = 'COLD';
    if (finalScore >= 75) temperature = 'HOT';
    else if (finalScore >= 50) temperature = 'WARM';

    return {
      score: finalScore,
      temperature,
      status: statusChanged ? effectiveStatus : currentStatus,
      statusChanged,
      breakdown: {
        base: baseScore,
        bonuses,
        details
      }
    };
  }

  /**
   * Obtiene el rango de score para una etapa del funnel
   */
  getScoreRange(status: LeadStatus): { min: number; max: number } {
    return SCORE_FUNNEL[status] || SCORE_FUNNEL['new'];
  }

  /**
   * Determina la temperatura basada en el score
   */
  getTemperature(score: number): LeadTemperature {
    if (score >= 75) return 'HOT';
    if (score >= 50) return 'WARM';
    return 'COLD';
  }

  /**
   * Verifica si un lead debería ser promovido en el funnel
   */
  shouldPromote(
    currentStatus: LeadStatus,
    hasActiveAppointment: boolean,
    hasVisited: boolean = false
  ): LeadStatus | null {

    if (hasVisited && !['visited', 'negotiating', 'closed'].includes(currentStatus)) {
      return 'visited';
    }

    if (hasActiveAppointment && !['scheduled', 'visited', 'negotiating', 'closed'].includes(currentStatus)) {
      return 'scheduled';
    }

    return null;
  }
}

// Exportar instancia singleton
export const scoringService = new LeadScoringService();
