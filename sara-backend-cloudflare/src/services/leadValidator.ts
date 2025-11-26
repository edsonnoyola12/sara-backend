export class LeadValidator {
  
  validateCompleteData(lead: any): { isComplete: boolean; missing: string[] } {
    const missing: string[] = [];
    
    if (!lead.name) missing.push('Nombre completo');
    if (!lead.property_interest) missing.push('Propiedad de interes');
    if (!lead.budget) missing.push('Presupuesto');
    
    const warnings: string[] = [];
    if (!lead.email) warnings.push('Email');
    if (!lead.bedrooms) warnings.push('Numero de recamaras');
    
    return {
      isComplete: missing.length === 0,
      missing: [...missing, ...warnings]
    };
  }

  generateMissingDataPrompt(missing: string[]): string {
    const prompts: any = {
      'Nombre completo': 'Para agendar necesito tu nombre completo.',
      'Propiedad de interes': 'Que tipo de propiedad buscas?',
      'Presupuesto': 'Cual es tu presupuesto aproximado?',
      'Email': 'Me das tu email para enviarte informacion?',
      'Numero de recamaras': 'Cuantas recamaras necesitas?'
    };

    const firstMissing = missing[0];
    return prompts[firstMissing] || `Para continuar necesito: ${missing.join(', ')}`;
  }
}
