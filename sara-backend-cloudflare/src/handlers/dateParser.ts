// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MÓDULO: dateParser - Parsing de fechas y horas en español
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ParsedFecha {
  fecha: string;
  hora: string;
  tipo: string;
}

export interface IntencionCita {
  detectado: boolean;
  fecha?: string;
  hora?: string;
  tipo?: string;
  textoOriginal?: string;
}

// Obtener fecha/hora actual en zona horaria de México (DST-aware)
// Uses Intl API which automatically handles DST (UTC-6 winter, UTC-5 summer)
export function getMexicoNow(): Date {
  const now = new Date();
  const mexicoStr = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  return new Date(mexicoStr);
}

// Obtener solo la hora actual en México (DST-aware)
export function getMexicoHour(): number {
  return getMexicoNow().getHours();
}

// Obtener offset UTC actual de México (6 en invierno, 5 en verano/DST)
export function getMexicoUTCOffset(): number {
  const now = new Date();
  const mexicoStr = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const mexicoDate = new Date(mexicoStr);
  return Math.round((now.getTime() - mexicoDate.getTime()) / (60 * 60 * 1000));
}

// Obtener el próximo día de la semana
export function getNextDayOfWeek(dayOfWeek: number): Date {
  const now = getMexicoNow();
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const result = new Date(now);
  result.setDate(result.getDate() + daysUntil);
  return result;
}

// Parsear texto en español para extraer fecha, hora y tipo de evento
export function parseFechaEspanol(texto: string): ParsedFecha | null {
  // Usar getMexicoNow() para obtener fecha/hora correcta en México
  const mexicoNow = getMexicoNow();

  const textoLower = texto.toLowerCase();
  let fechaTarget: Date | null = null;
  let hora = '10:00'; // Default
  let tipo = 'llamada'; // Default

  // Detectar tipo de evento
  if (textoLower.includes('cita') || textoLower.includes('visita') || textoLower.includes('ver casa')) {
    tipo = 'cita';
  } else if (textoLower.includes('recordatorio') || textoLower.includes('recordar')) {
    tipo = 'recordatorio';
  } else if (textoLower.includes('llamada') || textoLower.includes('llamar') || textoLower.includes('marcar') || textoLower.includes('telefonear')) {
    tipo = 'llamada';
  }

  // Mapa de números en texto a dígitos
  const numerosTexto: { [key: string]: number } = {
    'una': 1, 'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
    'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
    'once': 11, 'doce': 12
  };

  // Parsear hora en texto: "las cuatro de la tarde", "a las tres de la mañana"
  const horaTextoMatch = textoLower.match(/(?:las?\s+)(una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s*(?:de\s+la\s+)?(tarde|mañana|manana|noche)?/i);
  if (horaTextoMatch) {
    let horas = numerosTexto[horaTextoMatch[1]] || 0;
    const periodo = horaTextoMatch[2]?.toLowerCase();
    if ((periodo === 'tarde' || periodo === 'noche') && horas < 12) horas += 12;
    if ((periodo === 'mañana' || periodo === 'manana') && horas === 12) horas = 0;
    // Si no dice tarde/mañana y la hora es <= 7, asumir PM (nadie agenda llamadas a las 4am)
    if (!periodo && horas >= 1 && horas <= 7) horas += 12;
    hora = `${horas.toString().padStart(2, '0')}:00`;
  }

  // Parsear hora numérica (10am, 10:00, 10 am, 2pm, 14:00, etc)
  if (!horaTextoMatch) {
    const horaMatch = textoLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?)?/i);
    if (horaMatch) {
      let horas = parseInt(horaMatch[1]);
      const minutos = horaMatch[2] || '00';
      const ampm = horaMatch[3]?.toLowerCase();

      if (ampm === 'pm' && horas < 12) horas += 12;
      if (ampm === 'am' && horas === 12) horas = 0;
      // Si no dice am/pm y la hora es <= 7, asumir PM
      if (!ampm && horas >= 1 && horas <= 7) horas += 12;

      hora = `${horas.toString().padStart(2, '0')}:${minutos}`;
    }
  }

  // Días de la semana
  const diasSemana: { [key: string]: number } = {
    'domingo': 0, 'lunes': 1, 'martes': 2, 'miercoles': 3, 'miércoles': 3,
    'jueves': 4, 'viernes': 5, 'sabado': 6, 'sábado': 6
  };

  // Parsear fecha relativa
  if (textoLower.includes('hoy')) {
    fechaTarget = new Date(mexicoNow);
  } else if (textoLower.includes('mañana') || textoLower.includes('manana')) {
    fechaTarget = new Date(mexicoNow);
    fechaTarget.setDate(fechaTarget.getDate() + 1);
  } else if (textoLower.includes('pasado mañana') || textoLower.includes('pasado manana')) {
    fechaTarget = new Date(mexicoNow);
    fechaTarget.setDate(fechaTarget.getDate() + 2);
  } else {
    // Buscar día de la semana
    for (const [dia, num] of Object.entries(diasSemana)) {
      if (textoLower.includes(dia)) {
        fechaTarget = new Date(mexicoNow);
        const diaActual = fechaTarget.getDay();
        let diasHasta = num - diaActual;
        if (diasHasta <= 0) diasHasta += 7;
        fechaTarget.setDate(fechaTarget.getDate() + diasHasta);
        break;
      }
    }
  }

  // Parsear fecha específica (15 enero, 15/01, enero 15)
  if (!fechaTarget) {
    const meses: { [key: string]: number } = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
      'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };

    // Formato: 15 de enero, enero 15, 15 enero
    for (const [mes, num] of Object.entries(meses)) {
      const regexMes = new RegExp(`(\\d{1,2})\\s*(?:de\\s*)?${mes}|${mes}\\s*(\\d{1,2})`, 'i');
      const match = textoLower.match(regexMes);
      if (match) {
        const dia = parseInt(match[1] || match[2]);
        fechaTarget = new Date(mexicoNow.getFullYear(), num, dia);
        if (fechaTarget < mexicoNow) {
          fechaTarget.setFullYear(fechaTarget.getFullYear() + 1);
        }
        break;
      }
    }

    // Formato: 15/01, 15-01
    const fechaNumMatch = textoLower.match(/(\d{1,2})[\/\-](\d{1,2})/);
    if (fechaNumMatch && !fechaTarget) {
      const dia = parseInt(fechaNumMatch[1]);
      const mes = parseInt(fechaNumMatch[2]) - 1;
      fechaTarget = new Date(mexicoNow.getFullYear(), mes, dia);
      if (fechaTarget < mexicoNow) {
        fechaTarget.setFullYear(fechaTarget.getFullYear() + 1);
      }
    }
  }

  if (!fechaTarget) return null;

  // Formatear fecha como YYYY-MM-DD
  const fecha = `${fechaTarget.getFullYear()}-${(fechaTarget.getMonth() + 1).toString().padStart(2, '0')}-${fechaTarget.getDate().toString().padStart(2, '0')}`;

  return { fecha, hora, tipo };
}

// Detectar intención de agendar algo en un mensaje del chat
export function detectarIntencionCita(mensaje: string): IntencionCita {
  const msgLower = mensaje.toLowerCase();

  // Patrones que indican acuerdo de fecha/hora
  const patronesAcuerdo = [
    /(?:nos\s+)?(?:vemos|marcamos|hablamos|llamamos|quedamos)\s+(?:el\s+)?(.+)/i,
    /(?:te\s+)?(?:marco|llamo|veo)\s+(?:el\s+)?(.+)/i,
    /(?:nos\s+)?(?:vemos|reunimos)\s+(?:el\s+)?(.+)/i,
    /(?:quedamos\s+)?(?:para\s+)?(?:el\s+)?(.+)\s+(?:a\s+las?\s+)?(\d)/i,
    /(?:el\s+)?(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|mañana|manana)\s+(?:a\s+las?\s+)?(\d+)/i,
    /(?:cita|visita|llamada)\s+(?:para\s+)?(?:el\s+)?(.+)/i
  ];

  for (const patron of patronesAcuerdo) {
    if (patron.test(msgLower)) {
      const parsed = parseFechaEspanol(mensaje);
      if (parsed) {
        return {
          detectado: true,
          fecha: parsed.fecha,
          hora: parsed.hora,
          tipo: parsed.tipo,
          textoOriginal: mensaje
        };
      }
    }
  }

  // También detectar si simplemente menciona día + hora
  const tienesDiaHora = /(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|mañana|manana|hoy)\s+(?:a\s+las?\s+)?(\d+)/i.test(msgLower);
  if (tienesDiaHora) {
    const parsed = parseFechaEspanol(mensaje);
    if (parsed) {
      return {
        detectado: true,
        fecha: parsed.fecha,
        hora: parsed.hora,
        tipo: parsed.tipo,
        textoOriginal: mensaje
      };
    }
  }

  return { detectado: false };
}

// Parsear fecha relativa y hora a objeto Date
export function parseFecha(fecha: string, hora: string): Date {
  const now = getMexicoNow();
  const fechaLower = fecha.toLowerCase();

  let targetDate = new Date(now);

  if (fechaLower.includes('hoy')) {
    // Hoy
  } else if (fechaLower.includes('mañana')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (fechaLower.includes('lunes')) {
    targetDate = getNextDayOfWeek(1);
  } else if (fechaLower.includes('martes')) {
    targetDate = getNextDayOfWeek(2);
  } else if (fechaLower.includes('miércoles') || fechaLower.includes('miercoles')) {
    targetDate = getNextDayOfWeek(3);
  } else if (fechaLower.includes('jueves')) {
    targetDate = getNextDayOfWeek(4);
  } else if (fechaLower.includes('viernes')) {
    targetDate = getNextDayOfWeek(5);
  } else if (fechaLower.includes('sábado') || fechaLower.includes('sabado')) {
    targetDate = getNextDayOfWeek(6);
  } else if (fechaLower.includes('domingo')) {
    targetDate = getNextDayOfWeek(0);
  }

  // Parsear hora
  const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
  if (horaMatch) {
    let hours = parseInt(horaMatch[1]);
    const minutes = parseInt(horaMatch[2] || '0');

    if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
    if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;

    targetDate.setHours(hours, minutes, 0, 0);
  }

  return targetDate;
}

// Parsear fecha a formato ISO (YYYY-MM-DD) para Supabase
export function parseFechaISO(fecha: string): string {
  // Si ya está en formato YYYY-MM-DD, retornar tal cual
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return fecha;
  }

  const targetDate = parseFecha(fecha, '12:00');
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parsear hora a formato TIME (HH:MM:SS) para Supabase
export function parseHoraISO(hora: string): string {
  const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
  if (horaMatch) {
    let hours = parseInt(horaMatch[1]);
    const minutes = horaMatch[2] || '00';

    if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
    if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  }
  return '12:00:00';
}

// Formatear fecha para mostrar al usuario
export function formatearFechaParaUsuario(fecha: Date): string {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const diaSemana = dias[fecha.getDay()];
  const diaMes = fecha.getDate();
  const mes = meses[fecha.getMonth()];

  return `${diaSemana} ${diaMes} de ${mes}`;
}

// Formatear hora para mostrar al usuario (12h con AM/PM)
export function formatearHoraParaUsuario(hora: string): string {
  const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!horaMatch) return hora;

  let hours = parseInt(horaMatch[1]);
  const minutes = horaMatch[2] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';

  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${ampm}`;
}
