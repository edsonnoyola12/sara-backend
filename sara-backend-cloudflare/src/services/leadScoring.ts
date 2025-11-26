import { OpenAIService } from './openai';

export type LeadScore = 'hot' | 'warm' | 'cold';

export interface ScoringResult {
  score: LeadScore;
  points: number;
  confidence: number;
  reasoning: string;
  nextActions: string[];
}

export class LeadScoringService {
  private ai: OpenAIService;

  constructor(ai: OpenAIService) {
    this.ai = ai;
  }

  // Sistema de puntos por accion
  private calculatePoints(leadData: any, conversationHistory: any[]): number {
    let points = 0;

    // +10 puntos - Informacion basica
    if (leadData.name) points += 10;
    if (leadData.phone) points += 5;
    if (leadData.email) points += 10;

    // +20 puntos - Calificacion
    if (leadData.property_interest) points += 20;
    if (leadData.budget) points += 20;

    // +30 puntos - Financiamiento
    const hasCredit = this.detectCreditInConversation(conversationHistory);
    if (hasCredit) points += 30;

    // +40 puntos - Acciones
    if (leadData.status === 'contacted') points += 10;
    if (leadData.status === 'qualified') points += 20;
    if (leadData.status === 'appointment_scheduled') points += 40;

    // +50 puntos - Engagement
    const messageCount = conversationHistory.length;
    if (messageCount >= 4) points += 10;
    if (messageCount >= 8) points += 20;

    return points;
  }

  private detectCreditInConversation(history: any[]): boolean {
    const text = history.map(m => m.content).join(' ').toLowerCase();
    return text.includes('credito') || 
           text.includes('hipoteca') || 
           text.includes('pre-aprobado') ||
           text.includes('preaprobado') ||
           text.includes('banco');
  }

  private pointsToScore(points: number): LeadScore {
    if (points >= 80) return 'hot';    // 80+ puntos = HOT 🔥
    if (points >= 40) return 'warm';   // 40-79 puntos = WARM 🌡️
    return 'cold';                     // 0-39 puntos = COLD ❄️
  }

  private getNextActions(points: number, leadData: any, hasCredit: boolean): string[] {
    const actions: string[] = [];

    if (!leadData.name) actions.push('Obtener nombre completo');
    if (!leadData.email) actions.push('Solicitar email');
    if (!leadData.budget) actions.push('Calificar presupuesto');
    if (!leadData.property_interest) actions.push('Identificar propiedad de interes');
    if (!hasCredit && leadData.budget) actions.push('Conectar con asesor hipotecario');
    if (points >= 60 && leadData.status !== 'appointment_scheduled') {
      actions.push('AGENDAR VISITA URGENTE');
    }

    return actions;
  }

  async scoreLeadFromConversation(conversationHistory: any[], leadData: any): Promise<ScoringResult> {
    // Calcular puntos
    const points = this.calculatePoints(leadData, conversationHistory);
    const score = this.pointsToScore(points);
    const hasCredit = this.detectCreditInConversation(conversationHistory);
    const nextActions = this.getNextActions(points, leadData, hasCredit);

    // Usar AI para generar reasoning
    const conversationText = conversationHistory
      .slice(-4)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `Resume en UNA linea por que este lead tiene ${points} puntos:

Datos:
- Nombre: ${leadData.name || 'No'}
- Presupuesto: ${leadData.budget || 'No'}
- Propiedad: ${leadData.property_interest || 'No'}
- Credito: ${hasCredit ? 'Si' : 'No'}
- Status: ${leadData.status}

Ultimos mensajes:
${conversationText}

Responde en 1 linea corta (max 60 caracteres).`;

    let reasoning = '';
    try {
      reasoning = await this.ai.chat([], prompt, 'Resume en 1 linea.');
      reasoning = reasoning.trim().replace(/['"]/g, '');
    } catch (error) {
      reasoning = `${points} puntos acumulados`;
    }

    const confidence = Math.min(Math.round((points / 100) * 100), 100);

    console.log(`🎯 Scoring: ${score.toUpperCase()} (${points} pts, ${confidence}%)`);
    console.log(`📋 Reasoning: ${reasoning}`);
    console.log(`📌 Next actions:`, nextActions);

    return {
      score,
      points,
      confidence,
      reasoning,
      nextActions
    };
  }
}
