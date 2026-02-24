/**
 * CLAUDE SERVICE - Wrapper for Claude API
 */

import { retry, RetryPresets } from './retryService';

export interface ClaudeChatResult {
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export class ClaudeService {
  private apiKey: string;
  public lastResult: ClaudeChatResult | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Chat con Claude API (con retry automático)
   * @param historial - Mensajes previos del historial
   * @param userMessage - Mensaje actual del usuario
   * @param systemPrompt - Prompt del sistema (opcional)
   */
  async chat(historial: any[], userMessage?: string, systemPrompt?: string): Promise<string> {
    try {
      // Construir mensajes: historial + mensaje actual del usuario
      const messages = [...historial];

      // Agregar mensaje del usuario si se proporciona
      if (userMessage) {
        messages.push({ role: 'user', content: userMessage });
      }

      // Si no hay mensajes, retornar vacío
      if (messages.length === 0) {
        console.error('⚠️ Claude: No hay mensajes para procesar');
        return '';
      }

      const requestBody: any = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: messages
      };

      // Agregar system prompt si se proporciona
      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }

      // Fetch con retry automático
      const data = await retry(
        async () => {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody)
          });

          // Si es error 5xx o 429 (overloaded), reintentar
          if (response.status >= 500 || response.status === 429) {
            const error = new Error(`Claude API Error: ${response.status}`);
            (error as any).status = response.status;
            throw error;
          }

          return response.json() as Promise<any>;
        },
        {
          ...RetryPresets.anthropic,
          onRetry: (error, attempt, delayMs) => {
            console.warn(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'warn',
              message: `Claude API retry ${attempt}/3`,
              error: error?.message,
              status: error?.status,
              delayMs,
            }));
          }
        }
      );

      // Log de error si hay
      if (data.error) {
        console.error('❌ Claude API error:', data.error);
        return '';
      }

      const text = data.content?.[0]?.text || '';

      // Store last result for metrics
      this.lastResult = {
        text,
        model: data.model || 'claude-sonnet-4-20250514',
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0
      };

      if (!text) {
        console.error('⚠️ Claude: Respuesta vacía', JSON.stringify(data).substring(0, 200));
      }

      return text;
    } catch (e) {
      console.error('❌ Error en Claude API:', e);
      return '';
    }
  }
}
