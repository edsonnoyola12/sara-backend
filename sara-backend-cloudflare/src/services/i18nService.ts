// ═══════════════════════════════════════════════════════════════════════════
// I18N SERVICE - Soporte Multi-idioma para SARA
// ═══════════════════════════════════════════════════════════════════════════
// Soporta: Español (es), Inglés (en)
// Detección automática basada en el mensaje del usuario
// ═══════════════════════════════════════════════════════════════════════════

export type SupportedLanguage = 'es' | 'en';

// Traducciones de mensajes del sistema
const translations: Record<string, Record<SupportedLanguage, string>> = {
  // Saludos
  greeting: {
    es: 'Hola! Soy SARA, tu asistente virtual de Grupo Santa Rita.',
    en: 'Hello! I am SARA, your virtual assistant from Grupo Santa Rita.'
  },
  greeting_returning: {
    es: 'Hola de nuevo! Que gusto verte.',
    en: 'Hello again! Great to see you.'
  },

  // Información de propiedades
  property_info: {
    es: 'Te comparto informacion sobre esta propiedad:',
    en: 'Here is information about this property:'
  },
  price_label: {
    es: 'Precio',
    en: 'Price'
  },
  location_label: {
    es: 'Ubicacion',
    en: 'Location'
  },
  bedrooms_label: {
    es: 'Recamaras',
    en: 'Bedrooms'
  },
  bathrooms_label: {
    es: 'Banos',
    en: 'Bathrooms'
  },
  area_label: {
    es: 'Area',
    en: 'Area'
  },

  // Recursos
  sending_video: {
    es: 'Te envio un video de la propiedad:',
    en: 'Here is a video of the property:'
  },
  sending_brochure: {
    es: 'Te comparto el brochure con mas detalles:',
    en: 'Here is the brochure with more details:'
  },
  sending_location: {
    es: 'Aqui esta la ubicacion:',
    en: 'Here is the location:'
  },
  sending_tour: {
    es: 'Te comparto el tour virtual:',
    en: 'Here is the virtual tour:'
  },

  // Citas
  schedule_prompt: {
    es: 'Cuando te gustaria agendar una cita para visitar la propiedad?',
    en: 'When would you like to schedule a visit to the property?'
  },
  appointment_confirmed: {
    es: 'Excelente! Tu cita ha sido confirmada para',
    en: 'Excellent! Your appointment has been confirmed for'
  },
  appointment_reminder: {
    es: 'Recordatorio: Tienes una cita programada para',
    en: 'Reminder: You have an appointment scheduled for'
  },

  // Credito/Financiamiento
  credit_intro: {
    es: 'Con gusto te ayudo con informacion sobre credito hipotecario.',
    en: 'I would be happy to help you with mortgage information.'
  },
  credit_income_question: {
    es: 'Cual es tu ingreso mensual aproximado?',
    en: 'What is your approximate monthly income?'
  },
  credit_employment_question: {
    es: 'Actualmente estas empleado o eres independiente?',
    en: 'Are you currently employed or self-employed?'
  },

  // Transferencia a vendedor
  transfer_to_agent: {
    es: 'Te conecto con uno de nuestros asesores especializados que te ayudara personalmente.',
    en: 'I am connecting you with one of our specialized agents who will help you personally.'
  },
  agent_will_contact: {
    es: 'Un asesor se pondra en contacto contigo en breve.',
    en: 'An agent will contact you shortly.'
  },

  // Errores y espera
  please_wait: {
    es: 'Un momento por favor...',
    en: 'One moment please...'
  },
  error_occurred: {
    es: 'Ocurrio un error. Por favor intenta de nuevo.',
    en: 'An error occurred. Please try again.'
  },
  not_understood: {
    es: 'No entendi tu mensaje. Podrias reformularlo?',
    en: 'I did not understand your message. Could you rephrase it?'
  },

  // Horarios
  outside_hours: {
    es: 'Nuestro horario de atencion es de lunes a viernes de 9am a 7pm y sabados de 9am a 2pm. Te responderemos pronto!',
    en: 'Our business hours are Monday to Friday 9am to 7pm and Saturdays 9am to 2pm. We will respond soon!'
  },
  weekend_message: {
    es: 'Gracias por tu mensaje. Nuestro equipo te atendera el proximo dia habil.',
    en: 'Thank you for your message. Our team will assist you on the next business day.'
  },

  // Follow-ups
  followup_interest: {
    es: 'Hola! Queria saber si aun estas interesado en las propiedades que vimos.',
    en: 'Hello! I wanted to know if you are still interested in the properties we looked at.'
  },
  followup_visit: {
    es: 'Te gustaria programar una visita?',
    en: 'Would you like to schedule a visit?'
  },

  // Despedidas
  goodbye: {
    es: 'Gracias por contactarnos! Que tengas un excelente dia.',
    en: 'Thank you for contacting us! Have a great day.'
  },
  help_available: {
    es: 'Estoy aqui si necesitas algo mas.',
    en: 'I am here if you need anything else.'
  },

  // Promociones
  special_offer: {
    es: 'Tenemos una promocion especial para ti!',
    en: 'We have a special promotion for you!'
  },
  limited_time: {
    es: 'Por tiempo limitado',
    en: 'For a limited time'
  },

  // NPS
  nps_question: {
    es: 'Del 0 al 10, que tan probable es que nos recomiendes con un amigo o familiar?',
    en: 'On a scale of 0 to 10, how likely are you to recommend us to a friend or family member?'
  },
  nps_thanks: {
    es: 'Gracias por tu retroalimentacion!',
    en: 'Thank you for your feedback!'
  }
};

export class I18nService {
  private defaultLang: SupportedLanguage = 'es';
  private currentLang: SupportedLanguage = 'es';

  constructor(lang?: SupportedLanguage) {
    if (lang) {
      this.currentLang = lang;
    }
  }

  /**
   * Detecta el idioma basado en el texto del mensaje
   */
  detectLanguage(text: string): SupportedLanguage {
    const lowerText = text.toLowerCase();

    // Palabras clave en ingles
    const englishIndicators = [
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
      'how are you', 'thank you', 'thanks', 'please', 'yes', 'no', 'ok', 'okay',
      'i want', 'i need', 'i am', "i'm", 'looking for', 'interested in',
      'house', 'apartment', 'property', 'price', 'cost', 'bedroom', 'bathroom',
      'location', 'where', 'when', 'what', 'how much', 'schedule', 'visit',
      'credit', 'mortgage', 'loan', 'financing', 'english', 'speak english'
    ];

    // Palabras clave en espanol
    const spanishIndicators = [
      'hola', 'buenos dias', 'buenas tardes', 'buenas noches',
      'como estas', 'gracias', 'por favor', 'si', 'no',
      'quiero', 'necesito', 'busco', 'interesado', 'interesada',
      'casa', 'departamento', 'propiedad', 'precio', 'costo', 'recamara', 'bano',
      'ubicacion', 'donde', 'cuando', 'que', 'cuanto', 'agendar', 'cita', 'visita',
      'credito', 'hipoteca', 'prestamo', 'financiamiento', 'espanol'
    ];

    let englishScore = 0;
    let spanishScore = 0;

    // Contar coincidencias
    for (const word of englishIndicators) {
      if (lowerText.includes(word)) {
        englishScore++;
      }
    }

    for (const word of spanishIndicators) {
      if (lowerText.includes(word)) {
        spanishScore++;
      }
    }

    // Detectar caracteres especiales del espanol
    if (/[ñáéíóúü¿¡]/.test(lowerText)) {
      spanishScore += 3;
    }

    // Si el usuario explicitamente pide ingles/espanol
    if (lowerText.includes('speak english') || lowerText.includes('in english')) {
      return 'en';
    }
    if (lowerText.includes('en espanol') || lowerText.includes('habla espanol')) {
      return 'es';
    }

    // Determinar idioma basado en puntaje
    if (englishScore > spanishScore && englishScore >= 2) {
      return 'en';
    }

    // Por defecto, espanol (mercado mexicano)
    return 'es';
  }

  /**
   * Obtiene una traduccion por clave
   */
  t(key: string, lang?: SupportedLanguage): string {
    const language = lang || this.currentLang;
    const translation = translations[key];

    if (!translation) {
      console.warn(`I18n: Missing translation for key "${key}"`);
      return key;
    }

    return translation[language] || translation[this.defaultLang] || key;
  }

  /**
   * Establece el idioma actual
   */
  setLanguage(lang: SupportedLanguage): void {
    this.currentLang = lang;
  }

  /**
   * Obtiene el idioma actual
   */
  getLanguage(): SupportedLanguage {
    return this.currentLang;
  }

  /**
   * Obtiene instrucciones para Claude sobre el idioma
   */
  getLanguageInstructions(lang: SupportedLanguage): string {
    if (lang === 'en') {
      return `IMPORTANT: The user is communicating in English. Respond in English.
- Use clear, professional English
- Be helpful and friendly
- Maintain a professional real estate tone
- Convert prices to show both MXN and USD when relevant`;
    }

    return `IMPORTANTE: El usuario se comunica en espanol. Responde en espanol.
- Usa espanol claro y profesional de Mexico
- Se amable y servicial
- Mantén un tono profesional de bienes raíces
- Usa el formato de precios mexicano (MXN)`;
  }

  /**
   * Formatea un precio segun el idioma
   */
  formatPrice(amount: number, lang?: SupportedLanguage): string {
    const language = lang || this.currentLang;

    if (language === 'en') {
      // Mostrar en USD con conversion aproximada (1 USD = 17 MXN)
      const usd = Math.round(amount / 17);
      return `$${amount.toLocaleString('es-MX')} MXN (~$${usd.toLocaleString('en-US')} USD)`;
    }

    return `$${amount.toLocaleString('es-MX')} MXN`;
  }

  /**
   * Formatea una fecha segun el idioma
   */
  formatDate(date: Date, lang?: SupportedLanguage): string {
    const language = lang || this.currentLang;

    if (language === 'en') {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  /**
   * Obtiene todas las traducciones para un idioma
   */
  getAllTranslations(lang?: SupportedLanguage): Record<string, string> {
    const language = lang || this.currentLang;
    const result: Record<string, string> = {};

    for (const key of Object.keys(translations)) {
      result[key] = translations[key][language] || translations[key][this.defaultLang];
    }

    return result;
  }
}

/**
 * Helper para crear instancia con deteccion automatica
 */
export function createI18n(messageText?: string): I18nService {
  const service = new I18nService();

  if (messageText) {
    const detectedLang = service.detectLanguage(messageText);
    service.setLanguage(detectedLang);
  }

  return service;
}

/**
 * Helper rapido para traducir
 */
export function translate(key: string, lang: SupportedLanguage = 'es'): string {
  const service = new I18nService(lang);
  return service.t(key);
}
