/**
 * CLAUDE SERVICE - Wrapper for Claude API
 */

export class ClaudeService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: any[], options: any = {}): Promise<string> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: options.model || 'claude-sonnet-4-20250514',
          max_tokens: options.max_tokens || 1024,
          messages: messages
        })
      });

      const data: any = await response.json();
      return data.content?.[0]?.text || '';
    } catch (e) {
      console.error('Error en Claude API:', e);
      return '';
    }
  }
}
