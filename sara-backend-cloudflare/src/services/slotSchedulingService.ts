// src/services/slotSchedulingService.ts
// Servicio de slots para agendar visitas via WhatsApp interactive list

import { CalendarService } from './calendar';

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface TimeSlot {
  id: string;          // e.g. "slot_2026-03-11_10:00"
  date: string;        // "2026-03-11"
  time: string;        // "10:00"
  displayDate: string; // "Martes 11 de Marzo"
  displayTime: string; // "10:00 AM"
  endTime: string;     // "11:00"
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════

const MEXICO_TZ = 'America/Mexico_City';
const MAX_SLOTS = 10; // WhatsApp interactive list limit
const MIN_HOURS_AHEAD = 2; // No ofrecer slots a menos de 2h

const DIAS_SEMANA: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

const MESES: Record<number, string> = {
  0: 'Enero',
  1: 'Febrero',
  2: 'Marzo',
  3: 'Abril',
  4: 'Mayo',
  5: 'Junio',
  6: 'Julio',
  7: 'Agosto',
  8: 'Septiembre',
  9: 'Octubre',
  10: 'Noviembre',
  11: 'Diciembre',
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get current date/time in Mexico timezone as components.
 * Works in Cloudflare Workers (no Node.js APIs).
 */
function getMexicoNow(): Date {
  // Create a formatter that outputs ISO-like parts in Mexico timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MEXICO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';

  // Build a Date object that represents Mexico local time
  // We use UTC methods on this object, treating it as "Mexico time in UTC wrapper"
  return new Date(
    Date.UTC(
      parseInt(get('year')),
      parseInt(get('month')) - 1,
      parseInt(get('day')),
      parseInt(get('hour')),
      parseInt(get('minute')),
      parseInt(get('second'))
    )
  );
}

/**
 * Format hour (0-23) as "10:00 AM" style string.
 */
function formatHourDisplay(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

/**
 * Format a date string as "Martes 11 de Marzo".
 */
function formatDateDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Use UTC to avoid timezone shifts
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay();
  return `${DIAS_SEMANA[dayOfWeek]} ${day} de ${MESES[month - 1]}`;
}

/**
 * Add N days to a YYYY-MM-DD string, return new YYYY-MM-DD.
 */
function addDays(dateStr: string, n: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return d.toISOString().split('T')[0];
}

/**
 * Get day of week (0=Sun) for a YYYY-MM-DD string.
 */
function getDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// ═══════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════

export class SlotSchedulingService {

  // ─────────────────────────────────────────────────────────────
  // GET AVAILABLE SLOTS
  // ─────────────────────────────────────────────────────────────
  async getAvailableSlots(
    calendar: CalendarService,
    daysAhead: number = 3,
    slotDurationMinutes: number = 60
  ): Promise<TimeSlot[]> {
    const now = getMexicoNow();
    const todayStr = now.toISOString().split('T')[0];
    const nowHour = now.getUTCHours();
    const nowMinute = now.getUTCMinutes();

    const slots: TimeSlot[] = [];

    for (let d = 0; d <= daysAhead && slots.length < MAX_SLOTS; d++) {
      const dateStr = addDays(todayStr, d);
      const dayOfWeek = getDayOfWeek(dateStr);

      // Skip Sundays
      if (dayOfWeek === 0) continue;

      // Business hours: Mon-Fri 9-18, Sat 9-14
      const startHour = 9;
      const endHour = dayOfWeek === 6 ? 14 : 18;

      // Query Google Calendar for busy times on this day
      const dayStart = `${dateStr}T00:00:00-06:00`;
      const dayEnd = `${dateStr}T23:59:59-06:00`;

      let busyIntervals: Array<{ start: number; end: number }> = [];
      try {
        const events = await calendar.getEvents(dayStart, dayEnd, 50);
        busyIntervals = events
          .filter((ev: any) => ev.start?.dateTime || ev.start?.date)
          .map((ev: any) => {
            // Parse event start/end to Mexico hour
            const evStart = ev.start?.dateTime
              ? this.toMexicoHourDecimal(ev.start.dateTime)
              : 0;
            const evEnd = ev.end?.dateTime
              ? this.toMexicoHourDecimal(ev.end.dateTime)
              : 24;
            return { start: evStart, end: evEnd };
          });
      } catch (e) {
        console.error(`SlotScheduling: Error fetching events for ${dateStr}:`, e);
        // If we can't reach calendar, still offer slots (optimistic)
      }

      // Generate hourly slots
      for (let hour = startHour; hour < endHour && slots.length < MAX_SLOTS; hour++) {
        const slotStart = hour;
        const slotEnd = hour + (slotDurationMinutes / 60);

        // Skip if slot is in the past or less than 2 hours from now (for today)
        if (d === 0) {
          const currentTimeDecimal = nowHour + (nowMinute / 60);
          if (slotStart < currentTimeDecimal + MIN_HOURS_AHEAD) continue;
        }

        // Check if slot overlaps with any busy interval
        const overlaps = busyIntervals.some(
          busy => slotStart < busy.end && slotEnd > busy.start
        );
        if (overlaps) continue;

        const timeStr = `${String(hour).padStart(2, '0')}:00`;
        const endTimeStr = `${String(hour + 1).padStart(2, '0')}:00`;

        slots.push({
          id: `slot_${dateStr}_${timeStr}`,
          date: dateStr,
          time: timeStr,
          displayDate: formatDateDisplay(dateStr),
          displayTime: formatHourDisplay(hour),
          endTime: endTimeStr,
        });
      }
    }

    return slots;
  }

  // ─────────────────────────────────────────────────────────────
  // FORMAT SLOTS FOR WHATSAPP INTERACTIVE LIST
  // ─────────────────────────────────────────────────────────────
  formatSlotsForWhatsAppList(slots: TimeSlot[]): {
    headerText: string;
    bodyText: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description: string }>;
    }>;
  } {
    if (slots.length === 0) {
      return {
        headerText: 'Sin disponibilidad',
        bodyText: 'No hay horarios disponibles en los próximos días. Por favor contacta a tu asesor directamente.',
        buttonText: 'Ver horarios',
        sections: [],
      };
    }

    // Group slots by date
    const grouped = new Map<string, TimeSlot[]>();
    for (const slot of slots) {
      const existing = grouped.get(slot.date) || [];
      existing.push(slot);
      grouped.set(slot.date, existing);
    }

    const sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description: string }>;
    }> = [];

    for (const [_date, daySlots] of Array.from(grouped.entries())) {
      // Use the displayDate from the first slot of this day
      const sectionTitle = daySlots[0].displayDate;

      const rows = daySlots.map(slot => ({
        id: slot.id,
        title: slot.displayTime,
        description: '1 hora de recorrido',
      }));

      sections.push({
        title: sectionTitle,
        rows,
      });
    }

    return {
      headerText: 'Horarios disponibles',
      bodyText: 'Elige el horario que mejor te quede para visitar:',
      buttonText: 'Ver horarios',
      sections,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PARSE SLOT ID
  // ─────────────────────────────────────────────────────────────
  parseSlotId(slotId: string): { date: string; time: string } | null {
    // Expected format: "slot_2026-03-11_10:00"
    const match = slotId.match(/^slot_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/);
    if (!match) return null;

    return {
      date: match[1],
      time: match[2],
    };
  }

  // ─────────────────────────────────────────────────────────────
  // HELPER: Convert ISO datetime to Mexico timezone decimal hour
  // e.g. "2026-03-11T10:30:00-06:00" → 10.5
  // ─────────────────────────────────────────────────────────────
  private toMexicoHourDecimal(isoDatetime: string): number {
    const date = new Date(isoDatetime);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: MEXICO_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    return hour + (minute / 60);
  }
}
