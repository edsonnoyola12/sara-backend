import { OpenAIService } from './openai';

export class DateParser {
  private openai: OpenAIService;

  constructor(openai: OpenAIService) {
    this.openai = openai;
  }

  async parseDateTime(text: string): Promise<{ date: string; time: string } | null> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.toLocaleDateString('es-MX', { weekday: 'long' });
    
    console.log(`📅 Hoy es: ${dayOfWeek} ${todayStr}`);

    const prompt = `Hoy es ${dayOfWeek} ${todayStr}.

Extrae la fecha y hora de esta frase: "${text}"

Reglas ESTRICTAS:
- "mañana" = día siguiente a hoy
- "lunes", "martes", etc = PRÓXIMO día que corresponda (puede ser la semana siguiente)
- "hoy" = ${todayStr}
- Formato fecha: YYYY-MM-DD
- Formato hora: HH:MM (24hrs)
- Si dice "3pm" = "15:00"
- Si dice "10am" = "10:00"

IMPORTANTE: Verifica que el día de la semana COINCIDA con la fecha. Por ejemplo, si dices "lunes 2025-11-24", verifica que el 24 de noviembre de 2025 SÍ sea lunes.

Responde SOLO JSON:
{"date":"YYYY-MM-DD","time":"HH:MM"}

Si no entiendes la fecha/hora, responde:
{"date":null,"time":null}`;

    try {
      const response = await this.openai.chat([], prompt, 'Responde solo JSON válido, nada más.');
      
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\n?/g, '');
      cleaned = cleaned.replace(/```\n?/g, '');
      cleaned = cleaned.replace(/^[^{]*/g, '');
      cleaned = cleaned.replace(/[^}]*$/g, '');
      
      const parsed = JSON.parse(cleaned);
      
      if (parsed.date && parsed.time) {
        // VALIDAR que el día de la semana coincida
        const parsedDate = new Date(parsed.date + 'T00:00:00');
        const calculatedDay = parsedDate.toLocaleDateString('es-MX', { weekday: 'long' });
        
        console.log(`✅ Fecha parseada: ${calculatedDay} ${parsed.date} a las ${parsed.time}`);
        
        return { date: parsed.date, time: parsed.time };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error parsing date:', error);
      return null;
    }
  }

  // Método auxiliar para calcular próximo día de la semana
  getNextDayOfWeek(dayName: string): string {
    const days: { [key: string]: number } = {
      'domingo': 0,
      'lunes': 1,
      'martes': 2,
      'miércoles': 3,
      'miercoles': 3,
      'jueves': 4,
      'viernes': 5,
      'sábado': 6,
      'sabado': 6
    };

    const targetDay = days[dayName.toLowerCase()];
    if (targetDay === undefined) return '';

    const today = new Date();
    const currentDay = today.getDay();
    
    // Calcular días hasta el próximo día objetivo
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7; // Siguiente semana si ya pasó

    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    
    return nextDate.toISOString().split('T')[0];
  }

  parseTimeToHours(timeStr: string): string {
    const text = timeStr.toLowerCase();
    
    // Detectar formato AM/PM
    if (text.includes('pm') || text.includes('p.m.')) {
      const hour = parseInt(text.match(/\d+/)?.[0] || '0');
      if (hour < 12) {
        return `${hour + 12}:00`;
      }
      return `${hour}:00`;
    }
    
    if (text.includes('am') || text.includes('a.m.')) {
      const hour = parseInt(text.match(/\d+/)?.[0] || '0');
      return `${hour.toString().padStart(2, '0')}:00`;
    }
    
    // Formato 24hrs
    const match = text.match(/(\d+):?(\d{2})?/);
    if (match) {
      const hour = match[1].padStart(2, '0');
      const minute = match[2] || '00';
      return `${hour}:${minute}`;
    }
    
    return '10:00'; // Default
  }
}
