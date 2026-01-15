/**
 * CONVERSATION CONTEXT SERVICE - Análisis de contexto de conversaciones
 */

export interface ContextoDecision {
  accion: string;
  contexto?: any;
  respuesta?: string | null;
}

export interface DatosConversacion {
  mensaje: string;
  lead?: any;
  historial?: any[];
  [key: string]: any;
}

export class ConversationContextService {
  constructor() {}

  determinarContextoYAccion(datos: DatosConversacion): ContextoDecision {
    // Analiza el contexto del mensaje y determina la acción a tomar
    const mensaje = datos.mensaje?.toLowerCase() || '';

    // Detectar intenciones comunes
    if (mensaje.includes('cancelar') || mensaje.includes('no quiero')) {
      return { accion: 'cancelar', respuesta: null };
    }

    if (mensaje.includes('cita') || mensaje.includes('visita') || mensaje.includes('agendar')) {
      return { accion: 'agendar_cita', respuesta: null };
    }

    if (mensaje.includes('precio') || mensaje.includes('cuanto') || mensaje.includes('costo')) {
      return { accion: 'consultar_precio', respuesta: null };
    }

    if (mensaje.includes('credito') || mensaje.includes('hipoteca') || mensaje.includes('financiamiento')) {
      return { accion: 'consultar_credito', respuesta: null };
    }

    // Por defecto, continuar conversación
    return { accion: 'continuar_conversacion', respuesta: null };
  }

  extraerNombreSimple(mensaje: string): string | null {
    // Extrae nombre de mensajes como "soy Juan" o "me llamo María"
    const patterns = [
      /(?:soy|me llamo|mi nombre es)\s+([A-Za-záéíóúñÁÉÍÓÚÑ]+(?:\s+[A-Za-záéíóúñÁÉÍÓÚÑ]+)?)/i,
      /^([A-Za-záéíóúñÁÉÍÓÚÑ]{2,}(?:\s+[A-Za-záéíóúñÁÉÍÓÚÑ]+)?)\s*$/i
    ];

    for (const pattern of patterns) {
      const match = mensaje.match(pattern);
      if (match && match[1]) {
        const nombre = match[1].trim();
        // Filtrar palabras comunes que no son nombres
        const noNombres = ['si', 'no', 'ok', 'hola', 'gracias', 'buenas', 'buenos', 'dias', 'tardes', 'noches'];
        if (!noNombres.includes(nombre.toLowerCase())) {
          return nombre;
        }
      }
    }
    return null;
  }

  detectarBanco(mensaje: string): string | null {
    const bancos: Record<string, string[]> = {
      'BBVA': ['bbva', 'bancomer'],
      'Santander': ['santander'],
      'Banorte': ['banorte'],
      'HSBC': ['hsbc'],
      'Scotiabank': ['scotiabank', 'scotia'],
      'Infonavit': ['infonavit'],
      'Fovissste': ['fovissste'],
      'Cofinavit': ['cofinavit'],
      'Banamex': ['banamex', 'citibanamex']
    };

    const msgLower = mensaje.toLowerCase();
    for (const [banco, keywords] of Object.entries(bancos)) {
      if (keywords.some(k => msgLower.includes(k))) {
        return banco;
      }
    }
    return null;
  }

  detectarMonto(mensaje: string): number | null {
    // Detecta montos en el mensaje
    const msgLower = mensaje.toLowerCase();

    // Patrones para detectar montos
    const patterns = [
      /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:pesos|mxn|mx|\$)/i,
      /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /(\d+(?:\.\d+)?)\s*(?:mil(?:es)?|k)/i,
      /(\d+(?:\.\d+)?)\s*(?:mill[oó]n(?:es)?|mdp|m(?:dp)?)/i,
      /(\d{4,})/  // Números de 4+ dígitos probablemente son montos
    ];

    for (const pattern of patterns) {
      const match = mensaje.match(pattern);
      if (match && match[1]) {
        let monto = parseFloat(match[1].replace(/,/g, ''));

        // Multiplicadores
        if (msgLower.includes('mil') || msgLower.includes('k')) {
          monto *= 1000;
        }
        if (msgLower.includes('millon') || msgLower.includes('millón') || msgLower.includes('mdp')) {
          monto *= 1000000;
        }

        if (monto > 0) {
          return monto;
        }
      }
    }
    return null;
  }
}
