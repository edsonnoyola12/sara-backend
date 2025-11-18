export const leadScoringService = {
  calculateScore(lead: any, history: any[]): number {
    let score = 0;
    const allText = history.map(m => m.content.toLowerCase()).join(' ');

    // Crédito pre-aprobado (40 pts)
    if (allText.includes('pre-aprobado') || allText.includes('ya tengo credito')) {
      score += 40;
    } else if (allText.includes('tramite') || allText.includes('banco')) {
      score += 25;
    }

    // Urgencia (30 pts)
    if (allText.includes('urgente') || allText.includes('ya') || allText.includes('inmediato')) {
      score += 30;
    } else if (allText.includes('pronto') || allText.includes('mes')) {
      score += 20;
    }

    // Presupuesto (20 pts)
    if (lead.budget && lead.budget >= 1800000) score += 20;

    // Propiedad específica (15 pts)
    if (lead.property_interest) score += 15;

    // Engagement (15 pts)
    if (history.length > 10) score += 15;
    else if (history.length > 5) score += 10;

    return Math.min(score, 100);
  },

  getCategory(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 80) return 'hot';
    if (score >= 50) return 'warm';
    return 'cold';
  }
};
