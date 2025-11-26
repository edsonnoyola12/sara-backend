export class OpenAIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(conversationHistory: any[]) {
    const systemPrompt = `Eres SARA, asistente de Grupo Santa Rita. 
- Ayudas a clientes interesados en propiedades
- Eres amigable y profesional
- Haces preguntas para calificar leads: nombre, presupuesto, zona de interés
- Ofreces agendar citas para ver propiedades`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 300
        })
      });

      const data = await res.json();
      
      if (!res.ok || data.error) {
        console.error('OpenAI Error:', data.error);
        return 'Hola! Soy SARA de Grupo Santa Rita. ¿En qué puedo ayudarte hoy? 🏠';
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI Fetch Error:', error);
      return 'Hola! Soy SARA de Grupo Santa Rita. ¿En qué puedo ayudarte hoy? 🏠';
    }
  }

  async chat(history: any[], userMsg: string, systemPrompt: string) {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMsg }
    ];

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 300
        })
      });

      const data = await res.json();
      
      if (!res.ok || data.error) {
        console.error('OpenAI Error:', data.error);
        return 'Hola! Soy SARA de Grupo Santa Rita. ¿En qué puedo ayudarte hoy? 🏠';
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI Fetch Error:', error);
      return 'Hola! Soy SARA de Grupo Santa Rita. ¿En qué puedo ayudarte hoy? 🏠';
    }
  }
}
