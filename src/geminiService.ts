import { saraPrompt } from './saraPrompt.js';

export const geminiService = {
  async generateResponse(userMessage: string, conversationHistory: any[] = []) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

      const context = conversationHistory
        .slice(-5)
        .map((msg: any) => `${msg.sender}: ${msg.content}`)
        .join('\n');

      const fullPrompt = `${saraPrompt}\n\nHistorial:\n${context}\n\nCliente: ${userMessage}\n\nSARA:`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }]
        })
      });

      const data: any = await response.json();
      
      console.log('Gemini response:', JSON.stringify(data, null, 2));
      
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return {
          text: data.candidates[0].content.parts[0].text.trim(),
          success: true
        };
      }

      console.error('Invalid Gemini structure:', data);
      throw new Error('Invalid response');
    } catch (error) {
      console.error('Error Gemini:', error);
      return {
        text: '¡Hola! Soy SARA 🏠 ¿En qué te puedo ayudar?',
        success: false
      };
    }
  }
};
