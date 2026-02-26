// ═══════════════════════════════════════════════════════════════════════════
// AUDIO TRANSCRIPTION SERVICE - Transcripción de notas de voz
// ═══════════════════════════════════════════════════════════════════════════
// Usa OpenAI Whisper API para transcribir audios de WhatsApp
// Permite que SARA entienda mensajes de voz, no solo texto
// ═══════════════════════════════════════════════════════════════════════════

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  duration?: number;
  language?: string;
  error?: string;
}

export interface AudioMessage {
  mediaId: string;
  mimeType: string;
  duration?: number;
}

export class AudioTranscriptionService {
  private openaiApiKey: string;
  private metaAccessToken: string;

  constructor(openaiApiKey: string, metaAccessToken: string) {
    this.openaiApiKey = openaiApiKey;
    this.metaAccessToken = metaAccessToken;
  }

  /**
   * Descarga el audio desde WhatsApp
   */
  async downloadAudio(mediaId: string): Promise<ArrayBuffer | null> {
    try {
      // 1. Obtener URL del media
      const mediaCtrl = new AbortController();
      const mediaTimer = setTimeout(() => mediaCtrl.abort(), 10_000);
      const mediaResponse = await fetch(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.metaAccessToken}`
          },
          signal: mediaCtrl.signal,
        }
      );
      clearTimeout(mediaTimer);

      if (!mediaResponse.ok) {
        console.error('Error obteniendo URL del media:', await mediaResponse.text());
        return null;
      }

      const mediaData = await mediaResponse.json() as { url: string };

      // 2. Descargar el archivo de audio
      const dlCtrl = new AbortController();
      const dlTimer = setTimeout(() => dlCtrl.abort(), 15_000);
      const audioResponse = await fetch(mediaData.url, {
        headers: {
          'Authorization': `Bearer ${this.metaAccessToken}`
        },
        signal: dlCtrl.signal,
      });
      clearTimeout(dlTimer);

      if (!audioResponse.ok) {
        console.error('Error descargando audio:', await audioResponse.text());
        return null;
      }

      return await audioResponse.arrayBuffer();
    } catch (e) {
      console.error('Error en downloadAudio:', e);
      return null;
    }
  }

  /**
   * Transcribe un audio usando OpenAI Whisper
   */
  async transcribe(audioBuffer: ArrayBuffer, mimeType: string = 'audio/ogg'): Promise<TranscriptionResult> {
    if (!this.openaiApiKey) {
      return {
        success: false,
        error: 'OPENAI_API_KEY no configurado'
      };
    }

    try {
      // Crear FormData con el archivo de audio
      const formData = new FormData();

      // Determinar extensión basada en mime type
      const extensions: Record<string, string> = {
        'audio/ogg': 'ogg',
        'audio/opus': 'opus',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/wav': 'wav',
        'audio/webm': 'webm'
      };
      const ext = extensions[mimeType] || 'ogg';

      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', audioBlob, `audio.${ext}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'es'); // Principalmente español
      formData.append('response_format', 'verbose_json');

      const whisperCtrl = new AbortController();
      const whisperTimer = setTimeout(() => whisperCtrl.abort(), 30_000);
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: formData,
        signal: whisperCtrl.signal,
      });
      clearTimeout(whisperTimer);

      if (!response.ok) {
        const error = await response.text();
        console.error('Error en Whisper API:', error);
        return {
          success: false,
          error: `Whisper API error: ${response.status}`
        };
      }

      const result = await response.json() as {
        text: string;
        language?: string;
        duration?: number;
      };

      return {
        success: true,
        text: result.text,
        language: result.language,
        duration: result.duration
      };
    } catch (e) {
      console.error('Error en transcribe:', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Error desconocido'
      };
    }
  }

  /**
   * Procesa un mensaje de audio de WhatsApp
   * Descarga y transcribe automáticamente
   */
  async processWhatsAppAudio(audio: AudioMessage): Promise<TranscriptionResult> {
    console.log(`🎤 Procesando audio: ${audio.mediaId} (${audio.mimeType})`);

    // 1. Descargar el audio
    const audioBuffer = await this.downloadAudio(audio.mediaId);
    if (!audioBuffer) {
      return {
        success: false,
        error: 'No se pudo descargar el audio'
      };
    }

    console.log(`📥 Audio descargado: ${audioBuffer.byteLength} bytes`);

    // 2. Transcribir
    const result = await this.transcribe(audioBuffer, audio.mimeType);

    if (result.success) {
      console.log(`✅ Transcripción exitosa: "${result.text?.substring(0, 100)}..."`);
    } else {
      console.error(`❌ Error en transcripción: ${result.error}`);
    }

    return result;
  }

  /**
   * Verifica si el servicio está disponible
   */
  isAvailable(): boolean {
    return !!this.openaiApiKey && !!this.metaAccessToken;
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createAudioTranscription(
  openaiApiKey: string,
  metaAccessToken: string
): AudioTranscriptionService {
  return new AudioTranscriptionService(openaiApiKey, metaAccessToken);
}

/**
 * Detecta si un mensaje de WhatsApp contiene audio
 */
export function isAudioMessage(message: any): boolean {
  return message?.type === 'audio' && message?.audio?.id;
}

/**
 * Extrae información del audio de un mensaje WhatsApp
 */
export function extractAudioInfo(message: any): AudioMessage | null {
  if (!isAudioMessage(message)) {
    return null;
  }

  return {
    mediaId: message.audio.id,
    mimeType: message.audio.mime_type || 'audio/ogg',
    duration: message.audio.duration
  };
}
