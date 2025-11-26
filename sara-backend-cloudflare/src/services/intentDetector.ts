import { OpenAIService } from './openai';

export class IntentDetector {
  private ai: OpenAIService;

  constructor(ai: OpenAIService) {
    this.ai = ai;
  }

  async detectSchedulingIntent(conversationHistory: any[], latestMessage: string): Promise<{
    wantsToSchedule: boolean;
    suggestedDate?: string;
    confidence: number;
  }> {
    const conversationText = conversationHistory
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `Analiza si el cliente esta CONFIRMANDO una cita que YA LE OFRECIERON.

Conversacion:
${conversationText}
Ultimo mensaje: ${latestMessage}

SOLO detecta intent si:
1. SARA ya le ofrecio horarios especificos
2. El cliente esta respondiendo con una confirmacion: "si", "dale", "perfecto", "a las X", "el dia X"

NO detectes intent si:
- Es el primer mensaje del cliente
- Solo esta preguntando por propiedades
- Esta dando informacion (presupuesto, necesidades)
- No hay oferta previa de horarios en la conversacion

Responde SOLO con JSON:
{
  "wantsToSchedule": true/false,
  "suggestedDate": "YYYY-MM-DD" (solo si menciono fecha) o null,
  "confidence": 0-100
}`;

    try {
      const response = await this.ai.chat([], prompt, 'Detective solo confirmaciones explicitas.');
      
      let cleanResponse = response.trim();
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const parsed = JSON.parse(cleanResponse);
      
      return {
        wantsToSchedule: parsed.wantsToSchedule || false,
        suggestedDate: parsed.suggestedDate || undefined,
        confidence: parsed.confidence || 0
      };
    } catch (error) {
      console.error('❌ Intent detection error:', error);
      return { wantsToSchedule: false, confidence: 0 };
    }
  }
}
