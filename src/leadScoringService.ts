export const leadScoringService = {
  calculateScore(lead: any, history: any[]): number {
    let score = 0;
    const allText = history.map(m => m.content.toLowerCase()).join(' ');

    console.log('📊 Calculating score for text:', allText.substring(0, 200));

    // Crédito (40 pts)
    if (allText.includes('pre-aprobado') || allText.includes('preaprobado') || 
        allText.includes('tengo credito') || allText.includes('tengo crédito') ||
        allText.includes('ya tengo credito')) {
      score += 40;
      console.log('✅ +40 pts: Tiene crédito');
    }

    // Urgencia (30 pts)
    if (allText.includes('este mes') || allText.includes('urgente') || 
        allText.includes('ya') || allText.includes('inmediato')) {
      score += 30;
      console.log('✅ +30 pts: Urgencia alta');
    }

    // Propiedad específica (15 pts)
    if (allText.includes('andes') || allText.includes('vista real') || 
        allText.includes('hacienda') || lead.property_interest) {
      score += 15;
      console.log('✅ +15 pts: Propiedad específica');
    }

    // Engagement (15 pts)
    if (history.length > 5) score += 15;

    console.log(`🎯 SCORE FINAL: ${score}/100`);
    return Math.min(score, 100);
  },

  getCategory(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 80) return 'hot';
    if (score >= 50) return 'warm';
    return 'cold';
  }
};
