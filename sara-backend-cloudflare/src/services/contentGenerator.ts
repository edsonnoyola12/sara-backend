import { OpenAIService } from './openai';

export class ContentGenerator {
  private ai: OpenAIService;

  constructor(ai: OpenAIService) {
    this.ai = ai;
  }

  async shouldGenerateContent(conversationHistory: any[]): Promise<boolean> {
    const conversationText = conversationHistory
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `Analiza si esta conversacion YA tiene toda la informacion necesaria:

${conversationText}

INFORMACION REQUERIDA:
1. Nombre del cliente
2. Conjunto residencial especifico
3. Modelo/casa especifico
4. Presupuesto
5. Info de credito

Responde SOLO con JSON:
{
  "hasAllInfo": true/false,
  "missingInfo": []
}`;

    try {
      const response = await this.ai.chat([], prompt, 'Verificador.');
      let cleanResponse = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const result = JSON.parse(cleanResponse);
      
      return result.hasAllInfo === true;
    } catch (error) {
      console.error('❌ Error checking content:', error);
      return false;
    }
  }

  async generateBrochure(leadData: any): Promise<string> {
    console.log('📄 Generating brochure for:', leadData);
    return `https://gruposantarita.com/brochures/${leadData.property}-${leadData.name}.pdf`;
  }

  async generatePersonalizedVideo(leadData: any): Promise<string> {
    console.log('🎬 Generating video for:', leadData);
    return `https://gruposantarita.com/videos/${leadData.property}-${leadData.name}.mp4`;
  }
}
