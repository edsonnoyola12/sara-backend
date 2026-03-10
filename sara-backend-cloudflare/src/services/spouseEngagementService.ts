// Spouse Engagement Service
// Detects "need to consult spouse" intent and generates info packages
// to share with the lead's partner, reducing friction in purchase decisions

export class SpouseEngagementService {
  // Keywords/phrases that signal spouse consultation intent
  private readonly spouseKeywords: string[] = [
    'esposa', 'esposo', 'pareja', 'marido', 'mujer',
    'mi señora', 'mi vieja', 'mi viejo', 'mi novia', 'mi novio',
    'media naranja', 'mi compañera', 'mi compañero',
  ];

  private readonly consultKeywords: string[] = [
    'consultar', 'preguntar', 'platicar', 'comentar', 'hablar con',
    'decidir juntos', 'decidimos juntos', 'ver con', 'checar con',
    'preguntarle', 'consultarle', 'decirle', 'platicarlo',
    'tengo que ver', 'lo voy a pensar', 'lo tenemos que platicar',
    'no decido solo', 'no decido sola', 'necesito hablarlo',
    'mi familia', 'en familia', 'con mi pareja',
  ];

  /**
   * Detect if text contains "need to consult spouse" intent
   * Looks for spouse mention + consultation verb, or direct phrases
   */
  detectSpouseIntent(text: string): boolean {
    const normalized = text.toLowerCase().trim();

    // Direct phrases that strongly indicate spouse consultation
    const directPhrases = [
      'decidir juntos', 'decidimos juntos', 'lo tenemos que platicar',
      'no decido solo', 'no decido sola', 'necesito hablarlo',
      'preguntarle a mi', 'consultarlo con mi', 'platicarlo con mi',
      'ver con mi esposa', 'ver con mi esposo', 'ver con mi pareja',
      'hablar con mi esposa', 'hablar con mi esposo', 'hablar con mi pareja',
      'checar con mi esposa', 'checar con mi esposo', 'checar con mi pareja',
      'le voy a decir a mi', 'le voy a comentar a mi',
      'mi esposa decide', 'mi esposo decide',
    ];

    for (const phrase of directPhrases) {
      if (normalized.includes(phrase)) return true;
    }

    // Check for spouse keyword + consult keyword combination
    const hasSpouse = this.spouseKeywords.some(k => normalized.includes(k));
    const hasConsult = this.consultKeywords.some(k => normalized.includes(k));

    return hasSpouse && hasConsult;
  }

  /**
   * Generate an info package message to send to the spouse
   * Designed to be friendly, concise, and WhatsApp-formatted
   */
  generateSpousePackage(params: {
    leadName: string;
    spouseName?: string;
    development: string;
    priceRange: string;
    brochureUrl?: string;
    videoUrl?: string;
    gpsUrl?: string;
  }): string {
    const greeting = params.spouseName
      ? `Hola ${params.spouseName}! 👋`
      : 'Hola! 👋';

    let message = `${greeting} Soy SARA de Grupo Santa Rita.\n\n`;
    message += `${params.leadName} estuvo viendo casas con nosotros y me pidió que te compartiera la información de *${params.development}*:\n\n`;
    message += `🏠 Casas desde ${params.priceRange}\n`;

    if (params.brochureUrl) {
      message += `📄 Brochure: ${params.brochureUrl}\n`;
    }
    if (params.videoUrl) {
      message += `🎥 Video: ${params.videoUrl}\n`;
    }
    if (params.gpsUrl) {
      message += `📍 Ubicación: ${params.gpsUrl}\n`;
    }

    message += '\nSi tienen alguna duda, estoy aquí para ayudarles. ';
    message += 'También pueden agendar una visita juntos — ¡los esperamos! 😊';

    return message;
  }

  /**
   * Generate the message asking the lead for their spouse's phone number
   */
  getAskSpousePhoneMessage(leadName: string): string {
    return (
      `¡Claro que sí, ${leadName}! Tomar una decisión así en pareja es lo mejor. 💪\n\n` +
      `Si quieres, puedo enviarle la información directamente a tu pareja por WhatsApp ` +
      `para que puedan revisarla juntos.\n\n` +
      `¿Me compartes su número? 📱`
    );
  }

  /**
   * Generate follow-up message for the original lead after sending spouse package
   */
  getLeadConfirmationMessage(leadName: string, spouseName?: string): string {
    const recipient = spouseName || 'tu pareja';
    return (
      `Listo, ${leadName}! 👍 Ya le envié toda la información a ${recipient}.\n\n` +
      `Cuando quieran, pueden agendar una visita juntos. ` +
      `¿Les gustaría ir este fin de semana? 🏡`
    );
  }

  /**
   * Get a gentle nudge message to send after a few days if no response from spouse
   */
  getSpouseFollowUpMessage(leadName: string, development: string): string {
    return (
      `Hola ${leadName}! 👋 ¿Ya pudieron platicar sobre *${development}*?\n\n` +
      `Si tienen cualquier duda o quieren agendar una visita juntos, aquí estoy para apoyarles. 🏠`
    );
  }
}
