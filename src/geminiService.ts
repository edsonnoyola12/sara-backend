import { GoogleGenerativeAI } from '@google/generative-ai';
import { saraPrompt } from './saraPrompt.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const geminiService = {
  async generateResponse(userMessage: string, conversationHistory: any[] = []) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'models/gemini-1.5-flash'
      });

      const chat = model.startChat({
        history: [],
      });

      const context = conversationHistory
        .slice(-5)
        .map((msg: any) => `${msg.sender}: ${msg.content}`)
        .join('\n');

      const fullPrompt = `${saraPrompt}\n\nHistorial:\n${context}\n\nCliente: ${userMessage}`;

      const result = await chat.sendMessage(fullPrompt);
      const text = result.response.text();

      return {
        text: text.trim(),
        success: true
      };
    } catch (error) {
      console.error('Error Gemini:', error);
      return {
        text: '¡Hola! Soy SARA 🏠 Tenemos propiedades increíbles. ¿Qué te interesa?',
        success: false
      };
    }
  }
};
