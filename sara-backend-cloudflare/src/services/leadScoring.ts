/**
 * SCORING SERVICE - Sistema basado en Funnel de Ventas
 *
 * El movimiento en el funnel es lo más importante,
 * las acciones individuales son bonificaciones menores.
 *
 * Actualizado: 22 Enero 2026
 * - Agregado: Decay temporal (leads inactivos pierden puntos)
 * - Agregado: Velocity bonus (leads que avanzan rápido ganan puntos)
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
    decay: number;
    velocity: number;
    details: string[];
  };
}

// Score base por etapa del funnel (alineado con umbrales HOT>=70, WARM>=40)
const SCORE_FUNNEL: Record<LeadStatus, { min: number; max: number }> = {
  'new': { min: 15, max: 25 },           // COLD
  'contacted': { min: 30, max: 39 },     // COLD
  'scheduled': { min: 50, max: 65 },     // WARM
  'visited': { min: 75, max: 85 },       // HOT
  'negotiating': { min: 85, max: 95 },   // HOT
  'closed': { min: 100, max: 100 },      // HOT
  'fallen': { min: 0, max: 0 }           // COLD
};

export class LeadScoringService {

  /**
   * Calcula el decay (penalización) por inactividad
   * -2 puntos por cada 7 días sin actividad, máximo -15
   */
  private calculateDecay(lastActivityDate?: string | Date): { decay: number; detail: string | null } {
    if (!lastActivityDate) return { decay: 0, detail: null };

    const lastActivity = typeof lastActivityDate === 'string' ? new Date(lastActivityDate) : lastActivityDate;
    const daysSinceActivity = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceActivity <= 3) {
      return { decay: 0, detail: null }; // Sin penalización si actividad reciente
    }

    // -2 puntos por cada 7 días, máximo -15
    const decay = Math.min(15, Math.floor(daysSinceActivity / 7) * 2);

    if (decay > 0) {
      return { decay: -decay, detail: `-${decay} inactivo ${daysSinceActivity}d` };
    }

    return { decay: 0, detail: null };
  }

  /**
   * Calcula el bonus por velocidad de avance en el funnel
   * Leads que avanzan rápido son más valiosos
   */
  private calculateVelocityBonus(
    createdAt?: string | Date,
    statusChangedAt?: string | Date,
    currentStatus?: string
  ): { velocity: number; detail: string | null } {
    // Solo aplica si el lead ha avanzado del status inicial
    if (!createdAt || !statusChangedAt || currentStatus === 'new') {
      return { velocity: 0, detail: null };
    }

    const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    const changed = typeof statusChangedAt === 'string' ? new Date(statusChangedAt) : statusChangedAt;
    const daysToAdvance = Math.floor((changed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

    // Bonus por avance rápido
    if (daysToAdvance <= 1) {
      return { velocity: 10, detail: '+10 avanzó en 1 día' };
    } else if (daysToAdvance <= 3) {
      return { velocity: 7, detail: '+7 avanzó en 3 días' };
    } else if (daysToAdvance <= 7) {
      return { velocity: 4, detail: '+4 avanzó en 1 semana' };
    } else if (daysToAdvance <= 14) {
      return { velocity: 2, detail: '+2 avanzó en 2 semanas' };
    }

    return { velocity: 0, detail: null };
  }

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
      updated_at?: string | Date;
      created_at?: string | Date;
      status_changed_at?: string | Date;
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

    // Promover NEW → CONTACTED cuando SARA responde a un lead (cualquier intent real)
    if (currentStatus === 'new' && !statusChanged && intent &&
        !['despedida', 'otro'].includes(intent)) {
      effectiveStatus = 'contacted';
      statusChanged = true;
      details.push('Promovido a CONTACTED por respuesta SARA');
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

    // 4. Calcular decay por inactividad
    const { decay, detail: decayDetail } = this.calculateDecay(lead.updated_at);
    if (decayDetail) details.push(decayDetail);

    // 5. Calcular bonus por velocidad de avance
    const { velocity, detail: velocityDetail } = this.calculateVelocityBonus(
      lead.created_at,
      lead.status_changed_at,
      effectiveStatus
    );
    if (velocityDetail) details.push(velocityDetail);

    // 6. Calcular score final (no exceder máximo del rango, mínimo 0)
    const rawScore = baseScore + bonuses + decay + velocity;
    const finalScore = Math.max(0, Math.min(range.max + velocity, rawScore)); // velocity puede exceder rango

    // 7. Determinar temperatura (umbrales unificados)
    let temperature: LeadTemperature = 'COLD';
    if (finalScore >= 70) temperature = 'HOT';
    else if (finalScore >= 40) temperature = 'WARM';

    return {
      score: finalScore,
      temperature,
      status: statusChanged ? effectiveStatus : currentStatus,
      statusChanged,
      breakdown: {
        base: baseScore,
        bonuses,
        decay,
        velocity,
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
   * Determina la temperatura basada en el score (umbrales unificados)
   */
  getTemperature(score: number): LeadTemperature {
    if (score >= 70) return 'HOT';
    if (score >= 40) return 'WARM';
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
