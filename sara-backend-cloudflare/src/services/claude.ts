/**
 * CLAUDE SERVICE - Wrapper for Claude API
 */

export class ClaudeService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Chat con Claude API
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
        console.log('⚠️ Claude: No hay mensajes para procesar');
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

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });

      const data: any = await response.json();

      // Log de error si hay
      if (data.error) {
        console.error('❌ Claude API error:', data.error);
        return '';
      }

      const text = data.content?.[0]?.text || '';

      if (!text) {
        console.log('⚠️ Claude: Respuesta vacía', JSON.stringify(data).substring(0, 200));
      }

      return text;
    } catch (e) {
      console.error('❌ Error en Claude API:', e);
      return '';
    }
  }
}
