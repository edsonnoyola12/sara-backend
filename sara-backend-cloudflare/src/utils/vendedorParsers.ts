// src/utils/vendedorParsers.ts
// Funciones de parsing para comandos de vendedor - extraídas para testing

/**
 * Parsea parámetros del comando reagendar
 * Ejemplos: "reagendar juan mañana 4pm", "reagendar ana lunes 10am", "reagendar ana lunes 10 am"
 */
export function parseReagendarParams(body: string): { dia?: string; hora?: string; ampm?: string } {
  const texto = body.toLowerCase().trim();

  // Buscar día
  const diasPatterns = [
    'hoy', 'mañana', 'pasado mañana',
    'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'
  ];
  let dia: string | undefined;
  for (const d of diasPatterns) {
    if (texto.includes(d)) {
      dia = d;
      break;
    }
  }

  // Buscar hora y am/pm
  const horaMatch = texto.match(/(\d{1,2})\s*(am|pm)?/i);
  let hora: string | undefined;
  let ampm: string | undefined;

  if (horaMatch) {
    hora = horaMatch[1]; // Solo el número
    ampm = horaMatch[2]?.toLowerCase(); // am o pm si existe

    // Si no encontró am/pm en el match, buscar después del número
    if (!ampm) {
      const afterNumber = texto.slice(texto.indexOf(horaMatch[0]) + horaMatch[0].length).trim();
      if (afterNumber.startsWith('am')) ampm = 'am';
      else if (afterNumber.startsWith('pm')) ampm = 'pm';
    }
  }

  return { dia, hora, ampm };
}

/**
 * Parsea parámetros del comando agendar cita
 * Ejemplos: "agendar cita con juan mañana 4pm", "agendar cita pedro lunes 10am"
 */
export function parseAgendarParams(body: string): { nombreLead?: string; dia?: string; hora?: string; ampm?: string } {
  const texto = body.toLowerCase().trim();

  // Quitar prefijos comunes
  let sinPrefijo = texto
    .replace(/^agendar\s+cita\s+(con\s+)?/i, '')
    .replace(/^agenda\s+cita\s+(con\s+)?/i, '')
    .trim();

  // Buscar día
  const diasPatterns = [
    'hoy', 'mañana', 'pasado mañana',
    'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'
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
    // Quitar "a la", "a las" del final del nombre
    nombreLead = nombreLead.replace(/\s+(a\s+la|a\s+las?|para)\s*$/i, '').trim();
  }

  // Buscar hora y am/pm
  const horaMatch = sinPrefijo.match(/(\d{1,2})\s*(am|pm)?/i);
  let hora: string | undefined;
  let ampm: string | undefined;

  if (horaMatch) {
    hora = horaMatch[1];
    ampm = horaMatch[2]?.toLowerCase();

    if (!ampm) {
      const afterNumber = sinPrefijo.slice(sinPrefijo.indexOf(horaMatch[0]) + horaMatch[0].length).trim();
      if (afterNumber.startsWith('am')) ampm = 'am';
      else if (afterNumber.startsWith('pm')) ampm = 'pm';
    }
  }

  return { nombreLead, dia, hora, ampm };
}

/**
 * Convierte hora + ampm a formato ISO (HH:00:00)
 */
export function convertirHoraISO(hora: string, ampm?: string): string {
  let horaNum = parseInt(hora);
  if (isNaN(horaNum)) return '12:00:00';

  if (ampm === 'pm' && horaNum < 12) {
    horaNum += 12;
  }
  if (ampm === 'am' && horaNum === 12) {
    horaNum = 0;
  }

  return `${String(horaNum).padStart(2, '0')}:00:00`;
}
