// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS HOURS SERVICE - Manejo de horario laboral
// ═══════════════════════════════════════════════════════════════════════════
// Detecta si estamos fuera de horario y genera respuestas automáticas
// Configurable por día de la semana
// ═══════════════════════════════════════════════════════════════════════════

export interface BusinessHours {
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, etc.
  openTime: string;  // "09:00"
  closeTime: string; // "19:00"
  isOpen: boolean;   // Si ese día está abierto
}

export interface BusinessHoursConfig {
  timezone: string;
  schedule: BusinessHours[];
  holidayDates?: string[]; // ["2024-12-25", "2024-01-01"]
  customMessages?: {
    outsideHours?: string;
    weekend?: string;
    holiday?: string;
  };
}

// Configuración por defecto para México
const DEFAULT_CONFIG: BusinessHoursConfig = {
  timezone: 'America/Mexico_City',
  schedule: [
    { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', isOpen: false }, // Domingo cerrado
    { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00', isOpen: true },  // Lunes
    { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00', isOpen: true },  // Martes
    { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00', isOpen: true },  // Miércoles
    { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00', isOpen: true },  // Jueves
    { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00', isOpen: true },  // Viernes
    { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00', isOpen: true },  // Sábado medio día
  ],
  customMessages: {
    outsideHours: `¡Hola! Gracias por escribirnos.

Nuestro horario de atención es:
📅 Lunes a Viernes: 9:00 AM - 7:00 PM
📅 Sábados: 9:00 AM - 2:00 PM

Tu mensaje es importante para nosotros. Un asesor te contactará en cuanto abramos.

Mientras tanto, puedes explorar nuestros desarrollos en: gruposantarita.com`,

    weekend: `¡Hola! Gracias por tu mensaje.

Actualmente estamos fuera de horario. Nuestro equipo te atenderá el próximo día hábil.

📞 Si es urgente, puedes llamar al: (492) 924 77 78

¡Que tengas un excelente fin de semana!`,

    holiday: `¡Hola! Gracias por contactarnos.

Hoy es día festivo y nuestras oficinas están cerradas. Te responderemos el siguiente día hábil.

¡Felices fiestas! 🎉`
  }
};

export class BusinessHoursService {
  private config: BusinessHoursConfig;

  constructor(config?: Partial<BusinessHoursConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Obtiene la hora actual en la zona horaria configurada
   */
  private getCurrentTime(): { hour: number; minute: number; dayOfWeek: number; dateStr: string } {
    const now = new Date();

    // Formatear en la zona horaria de México
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.config.timezone,
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';

    const dayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };

    return {
      hour,
      minute,
      dayOfWeek: dayMap[weekdayStr] ?? 0,
      dateStr: `${year}-${month}-${day}`
    };
  }

  /**
   * Convierte hora en formato "HH:MM" a minutos desde medianoche
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Verifica si es día festivo
   */
  isHoliday(): boolean {
    if (!this.config.holidayDates || this.config.holidayDates.length === 0) {
      return false;
    }

    const { dateStr } = this.getCurrentTime();
    return this.config.holidayDates.includes(dateStr);
  }

  /**
   * Verifica si estamos dentro del horario laboral
   */
  isWithinBusinessHours(): boolean {
    // Primero verificar si es día festivo
    if (this.isHoliday()) {
      return false;
    }

    const { hour, minute, dayOfWeek } = this.getCurrentTime();
    const currentMinutes = hour * 60 + minute;

    // Buscar el horario del día actual
    const todaySchedule = this.config.schedule.find(s => s.dayOfWeek === dayOfWeek);

    if (!todaySchedule || !todaySchedule.isOpen) {
      return false;
    }

    const openMinutes = this.timeToMinutes(todaySchedule.openTime);
    const closeMinutes = this.timeToMinutes(todaySchedule.closeTime);

    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }

  /**
   * Obtiene el tipo de período fuera de horario
   */
  getOutsideHoursType(): 'business_hours' | 'outside_hours' | 'weekend' | 'holiday' {
    if (this.isHoliday()) {
      return 'holiday';
    }

    const { dayOfWeek } = this.getCurrentTime();
    const todaySchedule = this.config.schedule.find(s => s.dayOfWeek === dayOfWeek);

    // Si es domingo o el día no está abierto
    if (!todaySchedule?.isOpen) {
      return 'weekend';
    }

    if (this.isWithinBusinessHours()) {
      return 'business_hours';
    }

    return 'outside_hours';
  }

  /**
   * Obtiene el mensaje apropiado para fuera de horario
   */
  getOutsideHoursMessage(language: 'es' | 'en' = 'es'): string | null {
    const type = this.getOutsideHoursType();

    if (type === 'business_hours') {
      return null; // No necesita mensaje, estamos en horario
    }

    const messages = this.config.customMessages;

    if (language === 'en') {
      // Mensajes en inglés
      switch (type) {
        case 'holiday':
          return `Hello! Thank you for contacting us.

Today is a holiday and our offices are closed. We will respond on the next business day.

Happy holidays! 🎉`;
        case 'weekend':
          return `Hello! Thank you for your message.

We are currently outside business hours. Our team will assist you on the next business day.

📞 If urgent, you can call: (492) 924 77 78

Have a great weekend!`;
        case 'outside_hours':
          return `Hello! Thank you for reaching out.

Our business hours are:
📅 Monday to Friday: 9:00 AM - 7:00 PM
📅 Saturdays: 9:00 AM - 2:00 PM

Your message is important to us. An advisor will contact you as soon as we open.

In the meantime, explore our developments at: gruposantarita.com`;
      }
    }

    // Mensajes en español (default)
    switch (type) {
      case 'holiday':
        return messages?.holiday || DEFAULT_CONFIG.customMessages?.holiday || '';
      case 'weekend':
        return messages?.weekend || DEFAULT_CONFIG.customMessages?.weekend || '';
      case 'outside_hours':
        return messages?.outsideHours || DEFAULT_CONFIG.customMessages?.outsideHours || '';
    }

    return null;
  }

  /**
   * Obtiene información del horario para mostrar
   */
  getScheduleInfo(): {
    isOpen: boolean;
    currentType: string;
    currentTime: string;
    todaySchedule: BusinessHours | null;
    nextOpenTime: string | null;
  } {
    const { hour, minute, dayOfWeek } = this.getCurrentTime();
    const isOpen = this.isWithinBusinessHours();
    const currentType = this.getOutsideHoursType();
    const todaySchedule = this.config.schedule.find(s => s.dayOfWeek === dayOfWeek) || null;

    // Calcular próxima apertura
    let nextOpenTime: string | null = null;
    if (!isOpen) {
      // Buscar el próximo día que abre
      for (let i = 1; i <= 7; i++) {
        const nextDay = (dayOfWeek + i) % 7;
        const nextSchedule = this.config.schedule.find(s => s.dayOfWeek === nextDay);
        if (nextSchedule?.isOpen) {
          const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
          nextOpenTime = `${dayNames[nextDay]} a las ${nextSchedule.openTime}`;
          break;
        }
      }
    }

    return {
      isOpen,
      currentType,
      currentTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      todaySchedule,
      nextOpenTime
    };
  }

  /**
   * Actualiza la configuración
   */
  updateConfig(config: Partial<BusinessHoursConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Agrega una fecha festiva
   */
  addHoliday(date: string): void {
    if (!this.config.holidayDates) {
      this.config.holidayDates = [];
    }
    if (!this.config.holidayDates.includes(date)) {
      this.config.holidayDates.push(date);
    }
  }

  /**
   * Obtiene la configuración actual
   */
  getConfig(): BusinessHoursConfig {
    return this.config;
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createBusinessHours(config?: Partial<BusinessHoursConfig>): BusinessHoursService {
  return new BusinessHoursService(config);
}

/**
 * Helper rápido para verificar si estamos en horario
 */
export function isBusinessOpen(): boolean {
  const service = new BusinessHoursService();
  return service.isWithinBusinessHours();
}
