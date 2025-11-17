import { GoogleGenerativeAI } from '@google/generative-ai';
import { saraPrompt } from './saraPrompt.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const geminiService = {
  async generateResponse(userMessage: string, conversationHistory: any[] = []) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      const context = conversationHistory
        .slice(-5)
        .map((msg: any) => `${msg.sender}: ${msg.content}`)
        .join('\n');

      const fullPrompt = `${saraPrompt}\n\nHistorial reciente:\n${context}\n\nCliente: ${userMessage}\n\nSARA:`;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      return {
        text: text.trim(),
        success: true
      };
    } catch (error) {
      console.error('Error generating Gemini response:', error);
      return {
        text: 'Disculpa, tuve un problema técnico. ¿Podrías repetir tu mensaje?',
        success: false
      };
    }
  }
};
