// src/utils/vendedorParsers.ts
// Funciones de parsing para comandos de vendedor - extraídas para testing

/**
 * Parsea hora en múltiples formatos
 * Soporta: "9am", "9 am", "9:45am", "9:45 am", "945am", "1030pm"
 */
export function parseHora(texto: string): { hora?: string; minutos?: string; ampm?: string } {
  const t = texto.toLowerCase();

  // Formato 1: "9:45am", "9:45 am", "10:30pm"
  let match = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (match) {
    return { hora: match[1], minutos: match[2], ampm: match[3].toLowerCase() };
  }

  // Formato 2: "945am", "1030pm" (sin dos puntos, 3-4 dígitos pegados a am/pm)
  match = t.match(/(\d{1,2})(\d{2})(am|pm)/i);
  if (match) {
    return { hora: match[1], minutos: match[2], ampm: match[3].toLowerCase() };
  }

  // Formato 3: "9am", "10 pm" (solo hora, sin minutos)
  match = t.match(/(\d{1,2})\s*(am|pm)/i);
  if (match) {
    return { hora: match[1], minutos: '00', ampm: match[2].toLowerCase() };
  }

  // Formato 4: "9:45" sin am/pm
  match = t.match(/(\d{1,2}):(\d{2})(?!\d)/);
  if (match) {
    return { hora: match[1], minutos: match[2], ampm: undefined };
  }

  // Formato 5: solo número "9", "10"
  match = t.match(/\b(\d{1,2})\b(?!\d|:)/);
  if (match) {
    // Buscar am/pm después
    const afterMatch = t.slice(t.indexOf(match[0]) + match[0].length).trim();
    let ampm: string | undefined;
    if (afterMatch.startsWith('am')) ampm = 'am';
    else if (afterMatch.startsWith('pm')) ampm = 'pm';
    return { hora: match[1], minutos: '00', ampm };
  }

  return {};
}

/**
 * Normaliza errores comunes de ortografía en días/fechas
 */
export function normalizarTexto(input: string): string {
  let texto = input.toLowerCase().trim();
  // Errores de "mañana"
  texto = texto.replace(/mañnaa|mañaan|manana|mannana|mñana|ma[ñn]a+na/gi, 'mañana');
  // Errores de días
  texto = texto.replace(/lune?s?(?![\w])/gi, 'lunes');
  texto = texto.replace(/marte?s?(?![\w])/gi, 'martes');
  texto = texto.replace(/miercole?s?|miércole?s?/gi, 'miercoles');
  texto = texto.replace(/jueve?s?(?![\w])/gi, 'jueves');
  texto = texto.replace(/vierne?s?(?![\w])/gi, 'viernes');
  texto = texto.replace(/s[aá]bad?o?|sabádo?/gi, 'sabado');
  texto = texto.replace(/doming?o?(?![\w])/gi, 'domingo');
  // Quitar "a las", "a la", "a kas", "alas", etc.
  texto = texto.replace(/\s+a\s*(las?|kas?|l|k)\s+/gi, ' ');
  texto = texto.replace(/\s+alas\s+/gi, ' ');
  // Quitar "para el", "el", "para"
  texto = texto.replace(/\s+(para\s+el|para|el)\s+/gi, ' ');
  // Normalizar espacios múltiples
  return texto.replace(/\s+/g, ' ').trim();
}

/**
 * Parsea parámetros del comando reagendar
 * Ejemplos: "reagendar juan mañana 4pm", "reagendar ana lunes 10am", "reagendar ana lunes 9:45am"
 */
export function parseReagendarParams(body: string): { dia?: string; hora?: string; minutos?: string; ampm?: string } {
  const texto = normalizarTexto(body);

  // Buscar día
  const diasPatterns = [
    'hoy', 'mañana', 'pasado mañana', 'pasado',
    'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'
  ];
  let dia: string | undefined;
  for (const d of diasPatterns) {
    if (texto.includes(d)) {
      dia = d;
      break;
    }
  }

  // Usar parseHora para extraer hora completa
  const { hora, minutos, ampm } = parseHora(texto);

  return { dia, hora, minutos, ampm };
}

/**
 * Parsea parámetros del comando agendar cita
 * Ejemplos: "agendar cita con juan mañana 4pm", "agendar cita pedro lunes 9:45am"
 */
export function parseAgendarParams(body: string): { nombreLead?: string; dia?: string; hora?: string; minutos?: string; ampm?: string } {
  // Normalizar errores de ortografía
  const texto = normalizarTexto(body);

  // Quitar prefijos comunes
  let sinPrefijo = texto
    .replace(/^agendar\s+cita\s+(con\s+)?/i, '')
    .replace(/^agenda\s+cita\s+(con\s+)?/i, '')
    .trim();

  // Buscar día
  const diasPatterns = [
    'hoy', 'mañana', 'pasado mañana', 'pasado',
    'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'
  ];
  let dia: string | undefined;
  let diaIndex = -1;
  for (const d of diasPatterns) {
    const idx = sinPrefijo.indexOf(d);
    if (idx !== -1) {
      dia = d;
      diaIndex = idx;
      break;
    }
  }

  // Extraer nombre (todo antes del día)
  let nombreLead: string | undefined;
  if (diaIndex > 0) {
    nombreLead = sinPrefijo.substring(0, diaIndex).trim();
  }

  // Usar parseHora para extraer hora completa
  const { hora, minutos, ampm } = parseHora(sinPrefijo);

  return { nombreLead, dia, hora, minutos, ampm };
}

/**
 * Convierte hora + minutos + ampm a formato ISO (HH:MM:00)
 */
export function convertirHoraISO(hora: string, ampm?: string, minutos?: string): string {
  let horaNum = parseInt(hora);
  if (isNaN(horaNum)) return '12:00:00';

  const mins = minutos || '00';

  if (ampm === 'pm' && horaNum < 12) {
    horaNum += 12;
  }
  if (ampm === 'am' && horaNum === 12) {
    horaNum = 0;
  }

  return `${String(horaNum).padStart(2, '0')}:${mins}:00`;
}
