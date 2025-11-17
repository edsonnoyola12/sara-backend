import { GoogleGenerativeAI } from '@google/generative-ai';
import { saraPrompt } from './saraPrompt.js';
import type { Message, GeminiResponse } from './types.js';

class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  async generateResponse(
    userMessage: string,
    conversationHistory: Message[]
  ): Promise<GeminiResponse> {
    try {
      // Build conversation context
      const historyContext = conversationHistory
        .map(msg => `${msg.sender}: ${msg.content}`)
        .join('\n');

      const fullPrompt = `${saraPrompt}

== HISTORIAL DE CONVERSACIÓN ==
${historyContext}

== MENSAJE ACTUAL DEL USUARIO ==
${userMessage}

Responde como SARA, siguiendo TODAS las directivas del protocolo.`;

      const result = await this.model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();

      // Check for function calls (if you implement them later)
      const functionCalls = this.extractFunctionCalls(text);

      return {
        text: this.cleanResponse(text),
        functionCalls: functionCalls.length > 0 ? functionCalls : undefined
      };
    } catch (error) {
      console.error('Error generating Gemini response:', error);
      return {
        text: 'Disculpa, tuve un problema técnico. ¿Podrías repetir tu mensaje?'
      };
    }
  }

  private extractFunctionCalls(text: string): any[] {
    // Placeholder for function calling logic
    // You can implement this later if you use Gemini's function calling
    return [];
  }

  private cleanResponse(text: string): string {
    // Remove any function call markers or unwanted formatting
    return text.trim();
  }
}

export const geminiService = new GeminiService();
