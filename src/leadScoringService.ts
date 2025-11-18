export const leadScoringService = {
  calculateScore(lead: any, conversationHistory: any[]): number {
    let score = 0;
    
    const allText = conversationHistory
      .map(m => m.content.toLowerCase())
      .join(' ');

    // 🏦 CRÉDITO HIPOTECARIO (40 puntos max)
    if (allText.includes('pre-aprobado') || allText.includes('preaprobado') || 
        allText.includes('ya tengo credito') || allText.includes('ya tengo crédito')) {
      score += 40;
    } else if (allText.includes('en tramite') || allText.includes('en trámite') || 
               allText.includes('solicitando') || allText.includes('banco')) {
      score += 25;
    } else if (allText.includes('infonavit') || allText.includes('fovissste')) {
      score += 20;
    }

    // ⚡ URGENCIA (30 puntos max)
    if (allText.includes('urgente') || allText.includes('ya') || 
        allText.includes('inmediato') || allText.includes('este mes')) {
      score += 30;
    } else if (allText.includes('pronto') || allText.includes('1 mes') || 
               allText.includes('2 meses') || allText.includes('3 meses')) {
      score += 20;
    } else if (allText.includes('6 meses') || allText.includes('año')) {
      score += 5;
    }

    // 💰 PRESUPUESTO (20 puntos max)
    if (lead.budget && lead.budget >= 1800000) {
      score += 20;
    } else if (allText.includes('presupuesto') || allText.includes('puedo pagar')) {
      score += 10;
    }

    // 💵 ENGANCHE (10 puntos)
    if (allText.includes('enganche') || allText.includes('ya tengo') || 
        allText.includes('ahorro')) {
      score += 10;
    }

    // 🏠 INTERÉS EN PROPIEDAD ESPECÍFICA (20 puntos)
    if (lead.property_interest && lead.property_interest !== 'Por definir') {
      score += 15;
    }
    if (allText.includes('quiero ver') || allText.includes('visitarla')) {
      score += 5;
    }

    // 📞 ENGAGEMENT (15 puntos)
    const messageCount = conversationHistory.length;
    if (messageCount > 10) score += 15;
    else if (messageCount > 5) score += 10;
    else if (messageCount > 2) score += 5;

    // 🎯 CALIDAD DE PREGUNTAS (10 puntos)
    const qualityKeywords = ['cuanto', 'cuando', 'donde', 'como', 'requisitos', 'documentos'];
    const qualityQuestions = qualityKeywords.filter(k => allText.includes(k)).length;
    score += Math.min(qualityQuestions * 3, 10);

    return Math.min(Math.max(score, 1), 100);
  },

  getLeadCategory(score: number): { 
    category: string; 
    color: string; 
    emoji: string;
    action: string;
  } {
    if (score >= 80) {
      return {
        category: 'HOT',
        color: '🔴',
        emoji: '🔥',
        action: 'LLAMAR INMEDIATAMENTE'
      };
    } else if (score >= 50) {
      return {
        category: 'WARM',
        color: '🟠',
        emoji: '⚡',
        action: 'Seguimiento en 24hrs'
      };
    } else {
      return {
        category: 'COLD',
        color: '🔵',
        emoji: '❄️',
        action: 'Asignar asesor hipotecario'
      };
    }
  },

  shouldNotifyTeam(oldScore: number, newScore: number): boolean {
    // Notificar cuando cruza umbrales importantes
    return (
      (oldScore < 50 && newScore >= 50) || // Cold → Warm
      (oldScore < 80 && newScore >= 80) || // Warm → Hot
      (newScore >= 90) // Super hot
    );
  }
};
