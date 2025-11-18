import { saraPrompt } from './saraPrompt.js';

export const geminiService = {
  async generateResponse(userMessage: string, conversationHistory: any[] = []) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const url = 'https://api.openai.com/v1/chat/completions';

      const messages = [
        { role: 'system', content: saraPrompt },
        ...conversationHistory.slice(-5).map((msg: any) => ({
          role: msg.sender === 'client' ? 'user' : 'assistant',
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.7,
          max_tokens: 500
        })
      });

      const data: any = await response.json();
      
      if (data?.choices?.[0]?.message?.content) {
        return {
          text: data.choices[0].message.content.trim(),
          success: true
        };
      }

      console.error('OpenAI error:', data);
      throw new Error('Invalid response');
    } catch (error) {
      console.error('Error OpenAI:', error);
      return {
        text: '¡Hola! Soy SARA 🏠 ¿En qué te puedo ayudar?',
        success: false
      };
    }
  }
};
