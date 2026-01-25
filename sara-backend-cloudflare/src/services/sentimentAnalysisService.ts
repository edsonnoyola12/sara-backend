// ═══════════════════════════════════════════════════════════════════════════
// SENTIMENT ANALYSIS SERVICE - Análisis de sentimiento de mensajes
// ═══════════════════════════════════════════════════════════════════════════
// Detecta el mood/emoción del lead basado en sus mensajes
// Se integra con el lead scoring existente
// ═══════════════════════════════════════════════════════════════════════════

export type SentimentType = 'positive' | 'neutral' | 'negative' | 'urgent';

export interface SentimentResult {
  sentiment: SentimentType;
  score: number; // -1 a 1 (-1 muy negativo, 1 muy positivo)
  confidence: number; // 0 a 1
  indicators: string[];
  urgency: boolean;
  frustration: boolean;
  enthusiasm: boolean;
}

// Palabras y patrones para análisis
const POSITIVE_PATTERNS = {
  words: [
    'gracias', 'excelente', 'genial', 'perfecto', 'increíble', 'maravilloso',
    'me encanta', 'me gusta', 'interesado', 'interesada', 'quiero', 'necesito',
    'bueno', 'bien', 'super', 'fantástico', 'ok', 'sale', 'dale', 'va',
    'thanks', 'great', 'excellent', 'perfect', 'amazing', 'wonderful',
    'love it', 'interested', 'want', 'need', 'good', 'nice', 'awesome'
  ],
  emojis: ['😊', '😃', '👍', '❤️', '🙏', '✨', '🎉', '😍', '💪', '👏', '🤩', '💯'],
  phrases: [
    'me interesa mucho', 'quiero saber más', 'cuándo podemos', 'me gustaría ver',
    'estoy listo', 'vamos a hacerlo', 'perfecto gracias', 'muy amable',
    'qué buena opción', 'suena bien', 'me convence'
  ]
};

const NEGATIVE_PATTERNS = {
  words: [
    'no', 'nunca', 'malo', 'mal', 'terrible', 'horrible', 'pésimo',
    'molesto', 'enojado', 'frustrado', 'decepcionado', 'cansado',
    'problema', 'queja', 'reclamo', 'denuncia', 'fraude', 'estafa',
    'never', 'bad', 'terrible', 'horrible', 'angry', 'frustrated',
    'disappointed', 'problem', 'complaint', 'scam'
  ],
  emojis: ['😡', '😤', '😠', '💢', '👎', '😢', '😭', '😞', '😒', '🙄'],
  phrases: [
    'no me interesa', 'dejen de', 'no molesten', 'ya les dije',
    'para qué sirve', 'no funciona', 'pésimo servicio', 'qué mal',
    'estoy harto', 'ya basta', 'no quiero', 'no me llamen'
  ]
};

const URGENT_PATTERNS = {
  words: [
    'urgente', 'emergencia', 'ahora', 'inmediato', 'rápido', 'pronto',
    'hoy', 'ya', 'apúrense', 'necesito ya', 'cuanto antes',
    'urgent', 'emergency', 'now', 'immediately', 'asap', 'quickly'
  ],
  phrases: [
    'lo necesito hoy', 'es urgente', 'no puede esperar', 'tiene que ser hoy',
    'es para hoy', 'lo más pronto posible', 'cuánto se tardan',
    'por qué tardan tanto', 'llevo esperando'
  ]
};

const FRUSTRATION_PATTERNS = {
  words: [
    'otra vez', 'de nuevo', 'siempre', 'nunca', 'jamás', 'imposible',
    'hartos', 'cansados', 'incompetentes', 'inútil', 'ridículo'
  ],
  phrases: [
    'ya les escribí', 'nadie me contesta', 'llevan días', 'no me han',
    'cuántas veces', 'es la tercera vez', 'no es posible',
    'qué les pasa', 'cómo es posible'
  ]
};

export class SentimentAnalysisService {
  /**
   * Analiza el sentimiento de un mensaje
   */
  analyze(message: string): SentimentResult {
    const lowerMessage = message.toLowerCase();
    const indicators: string[] = [];

    // Contadores
    let positiveScore = 0;
    let negativeScore = 0;
    let urgencyScore = 0;
    let frustrationScore = 0;

    // Analizar patrones positivos
    for (const word of POSITIVE_PATTERNS.words) {
      if (lowerMessage.includes(word)) {
        positiveScore += 1;
        indicators.push(`+word:${word}`);
      }
    }
    for (const emoji of POSITIVE_PATTERNS.emojis) {
      if (message.includes(emoji)) {
        positiveScore += 1.5;
        indicators.push(`+emoji:${emoji}`);
      }
    }
    for (const phrase of POSITIVE_PATTERNS.phrases) {
      if (lowerMessage.includes(phrase)) {
        positiveScore += 2;
        indicators.push(`+phrase:${phrase}`);
      }
    }

    // Analizar patrones negativos
    for (const word of NEGATIVE_PATTERNS.words) {
      if (lowerMessage.includes(word)) {
        negativeScore += 1;
        indicators.push(`-word:${word}`);
      }
    }
    for (const emoji of NEGATIVE_PATTERNS.emojis) {
      if (message.includes(emoji)) {
        negativeScore += 1.5;
        indicators.push(`-emoji:${emoji}`);
      }
    }
    for (const phrase of NEGATIVE_PATTERNS.phrases) {
      if (lowerMessage.includes(phrase)) {
        negativeScore += 2;
        indicators.push(`-phrase:${phrase}`);
      }
    }

    // Analizar urgencia
    for (const word of URGENT_PATTERNS.words) {
      if (lowerMessage.includes(word)) {
        urgencyScore += 1;
        indicators.push(`!urgent:${word}`);
      }
    }
    for (const phrase of URGENT_PATTERNS.phrases) {
      if (lowerMessage.includes(phrase)) {
        urgencyScore += 2;
        indicators.push(`!urgent:${phrase}`);
      }
    }

    // Analizar frustración
    for (const word of FRUSTRATION_PATTERNS.words) {
      if (lowerMessage.includes(word)) {
        frustrationScore += 1;
        negativeScore += 0.5;
        indicators.push(`!frustration:${word}`);
      }
    }
    for (const phrase of FRUSTRATION_PATTERNS.phrases) {
      if (lowerMessage.includes(phrase)) {
        frustrationScore += 2;
        negativeScore += 1;
        indicators.push(`!frustration:${phrase}`);
      }
    }

    // Detectar exclamaciones múltiples (puede ser entusiasmo o enojo)
    const exclamationCount = (message.match(/!/g) || []).length;
    if (exclamationCount >= 3) {
      if (positiveScore > negativeScore) {
        positiveScore += 1;
        indicators.push('+exclamation');
      } else {
        negativeScore += 1;
        indicators.push('-exclamation');
      }
    }

    // Detectar mayúsculas excesivas (GRITOS)
    const upperRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (upperRatio > 0.5 && message.length > 10) {
      negativeScore += 1;
      frustrationScore += 1;
      indicators.push('-uppercase');
    }

    // Detectar signos de interrogación múltiples (posible frustración)
    const questionCount = (message.match(/\?/g) || []).length;
    if (questionCount >= 3) {
      frustrationScore += 1;
      indicators.push('?multiple');
    }

    // Calcular score final (-1 a 1)
    const totalScore = positiveScore - negativeScore;
    const maxPossible = Math.max(positiveScore + negativeScore, 1);
    const normalizedScore = Math.max(-1, Math.min(1, totalScore / maxPossible));

    // Determinar sentimiento
    let sentiment: SentimentType;
    if (urgencyScore >= 2) {
      sentiment = 'urgent';
    } else if (normalizedScore > 0.3) {
      sentiment = 'positive';
    } else if (normalizedScore < -0.3) {
      sentiment = 'negative';
    } else {
      sentiment = 'neutral';
    }

    // Calcular confianza basada en cantidad de indicadores
    const confidence = Math.min(1, indicators.length / 5);

    return {
      sentiment,
      score: Math.round(normalizedScore * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      indicators: indicators.slice(0, 10), // Máximo 10 indicadores
      urgency: urgencyScore >= 2,
      frustration: frustrationScore >= 2,
      enthusiasm: positiveScore >= 4
    };
  }

  /**
   * Analiza el sentimiento de una conversación completa
   */
  analyzeConversation(messages: Array<{ role: string; content: string }>): {
    overall: SentimentType;
    trend: 'improving' | 'stable' | 'declining';
    avgScore: number;
    leadMessages: SentimentResult[];
  } {
    // Filtrar solo mensajes del lead (user)
    const leadMessages = messages
      .filter(m => m.role === 'user')
      .slice(-10) // Últimos 10 mensajes
      .map(m => this.analyze(m.content));

    if (leadMessages.length === 0) {
      return {
        overall: 'neutral',
        trend: 'stable',
        avgScore: 0,
        leadMessages: []
      };
    }

    // Calcular promedio
    const avgScore = leadMessages.reduce((sum, r) => sum + r.score, 0) / leadMessages.length;

    // Determinar tendencia
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (leadMessages.length >= 3) {
      const firstHalf = leadMessages.slice(0, Math.floor(leadMessages.length / 2));
      const secondHalf = leadMessages.slice(Math.floor(leadMessages.length / 2));

      const firstAvg = firstHalf.reduce((sum, r) => sum + r.score, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, r) => sum + r.score, 0) / secondHalf.length;

      if (secondAvg - firstAvg > 0.2) trend = 'improving';
      else if (secondAvg - firstAvg < -0.2) trend = 'declining';
    }

    // Determinar sentimiento general
    let overall: SentimentType;
    if (leadMessages.some(m => m.sentiment === 'urgent')) {
      overall = 'urgent';
    } else if (avgScore > 0.3) {
      overall = 'positive';
    } else if (avgScore < -0.3) {
      overall = 'negative';
    } else {
      overall = 'neutral';
    }

    return {
      overall,
      trend,
      avgScore: Math.round(avgScore * 100) / 100,
      leadMessages
    };
  }

  /**
   * Determina si se debe alertar sobre este lead
   */
  shouldAlert(result: SentimentResult): { alert: boolean; reason?: string; priority: 'low' | 'medium' | 'high' } {
    if (result.frustration && result.sentiment === 'negative') {
      return {
        alert: true,
        reason: 'Lead frustrado con sentimiento negativo',
        priority: 'high'
      };
    }

    if (result.sentiment === 'urgent') {
      return {
        alert: true,
        reason: 'Lead con urgencia detectada',
        priority: 'high'
      };
    }

    if (result.sentiment === 'negative' && result.confidence > 0.6) {
      return {
        alert: true,
        reason: 'Sentimiento negativo con alta confianza',
        priority: 'medium'
      };
    }

    if (result.enthusiasm) {
      return {
        alert: true,
        reason: 'Lead muy entusiasmado - oportunidad caliente',
        priority: 'medium'
      };
    }

    return { alert: false, priority: 'low' };
  }
}

/**
 * Helper para crear instancia
 */
export function createSentimentAnalysis(): SentimentAnalysisService {
  return new SentimentAnalysisService();
}

/**
 * Helper rápido para analizar un mensaje
 */
export function analyzeSentiment(message: string): SentimentResult {
  return new SentimentAnalysisService().analyze(message);
}
