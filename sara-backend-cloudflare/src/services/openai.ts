// src/services/openai.ts

export class OpenAIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.log('🔑 OpenAI Service inicializado, API key:', apiKey ? '✅ presente' : '❌ FALTA');
  }

  async chat(
    history: Array<{ role: string; content: string }>,
    userMessage: string,
    systemPrompt: string
  ): Promise<string> {
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage }
    ];

    console.log('🔄 Llamando a OpenAI...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ OpenAI HTTP Error:', response.status, errorData);
      throw new Error(`OpenAI error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json().catch(() => ({})) as any;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    console.log('✅ OpenAI respondió correctamente');
    return content;
  }

  // Método para texto libre (sin forzar JSON)
  async chatText(
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    console.log('🔄 Llamando a OpenAI (texto)...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ OpenAI HTTP Error:', response.status, errorData);
      throw new Error(`OpenAI error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json().catch(() => ({})) as any;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    console.log('✅ OpenAI respondió (texto)');
    return content;
  }
}
