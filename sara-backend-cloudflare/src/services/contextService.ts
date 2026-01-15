/**
 * CONTEXT SERVICE - Análisis de contexto de mensajes
 */

import { SupabaseService } from './supabase';

export class ContextService {
  constructor(private supabase: SupabaseService) {}

  determinarContextoYAccion(datos: any): any {
    // Analiza el contexto del mensaje y determina la acción
    return {
      accion: 'continuar_conversacion',
      contexto: datos,
      respuesta: null
    };
  }

  extraerNombreSimple(mensaje: string): string | null {
    // Extrae nombre de mensajes como "soy Juan" o "me llamo María"
    const patterns = [
      /(?:soy|me llamo|mi nombre es)\s+([A-Za-záéíóúñÁÉÍÓÚÑ]+)/i,
      /^([A-Za-záéíóúñÁÉÍÓÚÑ]{2,})\s*$/i
    ];

    for (const pattern of patterns) {
      const match = mensaje.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
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
      'Cofinavit': ['cofinavit']
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
    const patterns = [
      /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:pesos|mxn|mx|\$)/i,
      /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /(\d+(?:\.\d+)?)\s*(?:mil|k)/i,
      /(\d+(?:\.\d+)?)\s*(?:millones?|mdp|m)/i
    ];

    for (const pattern of patterns) {
      const match = mensaje.match(pattern);
      if (match && match[1]) {
        let monto = parseFloat(match[1].replace(/,/g, ''));
        if (mensaje.toLowerCase().includes('mil') || mensaje.toLowerCase().includes('k')) {
          monto *= 1000;
        }
        if (mensaje.toLowerCase().includes('millon') || mensaje.toLowerCase().includes('mdp')) {
          monto *= 1000000;
        }
        return monto;
      }
    }
    return null;
  }
}
