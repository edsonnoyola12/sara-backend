// ═══════════════════════════════════════════════════════════════════════════
// TEXT-TO-SPEECH SERVICE - SARA Responde con Audio
// ═══════════════════════════════════════════════════════════════════════════
// Usa OpenAI TTS API para convertir respuestas de texto a audio
// Permite que SARA envíe notas de voz además de texto
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch with AbortController timeout — prevents Worker from hanging if OpenAI TTS API is unresponsive.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`TTS API timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';
export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface TTSOptions {
  voice?: TTSVoice;
  model?: TTSModel;
  speed?: number;  // 0.25 to 4.0
  format?: TTSFormat;
}

export interface TTSResult {
  success: boolean;
  audioBuffer?: ArrayBuffer;
  duration?: number;
  mimeType?: string;
  error?: string;
}

// Mapeo de formatos a MIME types
const FORMAT_MIME_TYPES: Record<TTSFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pcm: 'audio/pcm'
};

export class TTSService {
  private openaiApiKey: string;
  private defaultVoice: TTSVoice = 'nova';  // Voz femenina natural para SARA
  private defaultModel: TTSModel = 'tts-1';
  private defaultFormat: TTSFormat = 'opus';  // Formato nativo de WhatsApp

  constructor(openaiApiKey: string) {
    this.openaiApiKey = openaiApiKey;
  }

  /**
   * Genera audio a partir de texto usando OpenAI TTS
   */
  async generateAudio(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    if (!this.openaiApiKey) {
      return {
        success: false,
        error: 'OPENAI_API_KEY no configurado'
      };
    }

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'Texto vacío'
      };
    }

    // Limpiar texto para TTS (remover emojis excesivos, formateo markdown, etc.)
    const cleanText = this.cleanTextForTTS(text);

    // Limitar longitud (máximo ~4096 caracteres para TTS)
    const truncatedText = cleanText.length > 4000
      ? cleanText.substring(0, 3997) + '...'
      : cleanText;

    const voice = options.voice || this.defaultVoice;
    const model = options.model || this.defaultModel;
    const format = options.format || this.defaultFormat;
    const speed = options.speed || 1.0;

    try {
      console.log(`🔊 TTS: Generando audio (${truncatedText.length} chars, voice=${voice}, format=${format})`);

      const response = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          voice,
          input: truncatedText,
          response_format: format,
          speed
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ TTS API error:', error);
        return {
          success: false,
          error: `TTS API error: ${response.status}`
        };
      }

      const audioBuffer = await response.arrayBuffer();
      const mimeType = FORMAT_MIME_TYPES[format];

      // Estimar duración (aprox 150 palabras por minuto a velocidad 1.0)
      const wordCount = truncatedText.split(/\s+/).length;
      const estimatedDuration = Math.ceil((wordCount / 150) * 60 / speed);

      console.log(`✅ TTS: Audio generado (${audioBuffer.byteLength} bytes, ~${estimatedDuration}s)`);

      return {
        success: true,
        audioBuffer,
        duration: estimatedDuration,
        mimeType
      };
    } catch (e) {
      console.error('❌ TTS error:', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Error desconocido'
      };
    }
  }

  /**
   * Limpia el texto para mejor pronunciación TTS
   */
  private cleanTextForTTS(text: string): string {
    let clean = text;

    // Remover múltiples emojis consecutivos (mantener máximo 1)
    clean = clean.replace(/([\u{1F300}-\u{1F9FF}])\1+/gu, '$1');

    // Remover formateo markdown
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1');  // **bold**
    clean = clean.replace(/\*(.*?)\*/g, '$1');      // *italic*
    clean = clean.replace(/```[\s\S]*?```/g, '');   // code blocks
    clean = clean.replace(/`(.*?)`/g, '$1');        // inline code

    // Remover URLs (no se pronuncian bien)
    clean = clean.replace(/https?:\/\/[^\s]+/g, 'enlace');

    // Remover bullets y numeración
    clean = clean.replace(/^[\s]*[-•]\s*/gm, '');
    clean = clean.replace(/^[\s]*\d+\.\s*/gm, '');

    // Mejorar pronunciación de abreviaciones comunes en español
    clean = clean.replace(/\bm²\b/g, 'metros cuadrados');
    clean = clean.replace(/\bMXN\b/gi, 'pesos mexicanos');
    clean = clean.replace(/\bUSD\b/gi, 'dólares');
    clean = clean.replace(/\brec\b/gi, 'recámaras');

    // Convertir precios a texto legible (millones, miles)
    // Orden importa: patrones más específicos primero

    // "$1.5 millones", "$2 millones" → palabras
    clean = clean.replace(/\$\s*([\d,]+(?:\.\d+)?)\s*millones?\b/gi, (_, num) => {
      const millones = parseFloat(num.replace(/,/g, ''));
      return this.numeroAPalabras(millones * 1000000) + ' pesos';
    });
    // "$1.5M", "$2M" → palabras
    clean = clean.replace(/\$\s*([\d,]+(?:\.\d+)?)\s*M\b/gi, (_, num) => {
      const millones = parseFloat(num.replace(/,/g, ''));
      return this.numeroAPalabras(millones * 1000000) + ' pesos';
    });
    // "$45 mil", "$200 mil" → palabras (common Spanish format)
    clean = clean.replace(/\$\s*([\d,]+(?:\.\d+)?)\s*mil\b/gi, (_, num) => {
      const miles = parseFloat(num.replace(/,/g, ''));
      return this.numeroAPalabras(miles * 1000) + ' pesos';
    });
    // "$45K", "$200K" → palabras
    clean = clean.replace(/\$\s*([\d,]+(?:\.\d+)?)\s*K\b/gi, (_, num) => {
      const miles = parseFloat(num.replace(/,/g, ''));
      return this.numeroAPalabras(miles * 1000) + ' pesos';
    });
    // Generic: "$1,500,000", "$45,000" → palabras
    clean = clean.replace(/\$\s*([\d,]+)/g, (_, num) => {
      const valor = parseInt(num.replace(/,/g, ''), 10);
      return this.numeroAPalabras(valor) + ' pesos';
    });

    // Normalizar Unicode (NFC) para evitar que TTS tartamudee con acentos descompuestos
    clean = clean.normalize('NFC');

    // Normalizar espacios
    clean = clean.replace(/\s+/g, ' ').trim();

    return clean;
  }

  /**
   * Convierte un número a palabras en español (simplificado para precios)
   */
  private numeroAPalabras(num: number): string {
    if (num === 0) return 'cero';

    const millones = Math.floor(num / 1000000);
    const miles = Math.floor((num % 1000000) / 1000);
    const resto = num % 1000;

    let resultado = '';

    if (millones > 0) {
      if (millones === 1) {
        resultado += 'un millón';
      } else {
        resultado += this.centenaAPalabras(millones) + ' millones';
      }
    }

    if (miles > 0) {
      if (resultado) resultado += ' ';
      if (miles === 1) {
        resultado += 'mil';
      } else {
        resultado += this.centenaAPalabras(miles) + ' mil';
      }
    }

    if (resto > 0 && millones === 0 && miles === 0) {
      resultado += this.centenaAPalabras(resto);
    }

    return resultado || 'cero';
  }

  /**
   * Convierte centenas a palabras (1-999)
   */
  private centenaAPalabras(num: number): string {
    const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
    const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

    if (num === 100) return 'cien';

    let resultado = '';
    const c = Math.floor(num / 100);
    const d = Math.floor((num % 100) / 10);
    const u = num % 10;

    if (c > 0) resultado += centenas[c] + ' ';

    if (d === 1) {
      resultado += especiales[u];
    } else if (d === 2 && u > 0) {
      resultado += 'veinti' + unidades[u];
    } else {
      if (d > 0) resultado += decenas[d];
      if (u > 0) resultado += (d > 0 ? ' y ' : '') + unidades[u];
    }

    return resultado.trim();
  }

  /**
   * Verifica si el servicio está disponible
   */
  isAvailable(): boolean {
    return !!this.openaiApiKey;
  }

  /**
   * Obtiene el MIME type para un formato dado
   */
  getMimeType(format: TTSFormat = this.defaultFormat): string {
    return FORMAT_MIME_TYPES[format];
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createTTSService(openaiApiKey: string): TTSService {
  return new TTSService(openaiApiKey);
}

/**
 * Determina si un mensaje debe enviarse como audio
 * Basado en la longitud del texto y el contexto
 */
export function shouldSendAsAudio(
  text: string,
  leadPrefersAudio: boolean = false,
  wasAudioMessage: boolean = false,
  minLength: number = 100
): boolean {
  // Si el lead prefiere audio, siempre enviar audio
  if (leadPrefersAudio) return true;

  // Si el mensaje original fue audio, responder con audio
  if (wasAudioMessage) return true;

  // Para mensajes largos, considerar enviar audio
  if (text.length > minLength * 2) return true;

  return false;
}
