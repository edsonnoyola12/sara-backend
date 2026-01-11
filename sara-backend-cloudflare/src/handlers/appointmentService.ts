// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MÓDULO: appointmentService - Funciones de gestión de citas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { HORARIOS } from './constants';
import { getMexicoNow, parseFecha, parseFechaISO, parseHoraISO } from './dateParser';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Appointment {
  id?: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  property_name: string;
  location?: string;
  scheduled_date: string;
  scheduled_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  vendedor_id?: string;
  vendedor_name?: string;
  appointment_type?: string;
  duration_minutes?: number;
  google_event_vendedor_id?: string;
  notes?: string;
}

export interface AppointmentValidation {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

export interface ParsedCommand {
  nombreLead: string;
  dia?: string;
  hora?: string;
  ampm?: string;
}

export interface CalendarEventData {
  summary: string;
  description: string;
  location: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: {
    useDefault: boolean;
    overrides: Array<{ method: string; minutes: number }>;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDACIÓN DE HORARIOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Parsear hora del CRM (puede ser "09:00" o número)
export function parseHoraCRM(valor: any, defaultVal: number): number {
  if (!valor) return defaultVal;
  if (typeof valor === 'number') return valor;
  return parseInt(String(valor).split(':')[0]) || defaultVal;
}

// Parsear días laborales del CRM
export function parseDiasCRM(valor: any): number[] {
  if (!valor) return [1, 2, 3, 4, 5, 6]; // L-S por defecto
  if (Array.isArray(valor)) return valor.map(Number);
  if (typeof valor === 'string') {
    return valor.split(',').map(d => parseInt(d.trim())).filter(n => !isNaN(n));
  }
  return [1, 2, 3, 4, 5, 6];
}

// Validar si una hora está dentro del horario laboral
export function validarHorarioLaboral(
  horaNumero: number,
  fecha: Date,
  vendedor?: { work_start?: any; work_end?: any; working_days?: any }
): AppointmentValidation {
  const horaInicioVendedor = parseHoraCRM(vendedor?.work_start, HORARIOS.HORA_INICIO_DEFAULT);
  const horaFinVendedorBase = parseHoraCRM(vendedor?.work_end, HORARIOS.HORA_FIN_DEFAULT);
  const diasLaborales = parseDiasCRM(vendedor?.working_days);

  const diaCita = fecha.getDay(); // 0=domingo, 6=sábado
  const esSabado = diaCita === 6;
  const esDomingo = diaCita === 0;
  const horaFinVendedor = esSabado ? HORARIOS.HORA_FIN_SABADO : horaFinVendedorBase;

  // Verificar día laboral
  if (!diasLaborales.includes(diaCita)) {
    const diasTexto = diasLaborales.map(d => {
      const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      return nombres[d];
    }).join(', ');
    return {
      valid: false,
      error: esDomingo ? 'No trabajamos los domingos' : 'Día no laboral',
      suggestion: `Días disponibles: ${diasTexto}`
    };
  }

  // Verificar horario
  if (horaNumero < horaInicioVendedor || horaNumero >= horaFinVendedor) {
    const horaFinTexto = horaFinVendedor > 12
      ? `${horaFinVendedor - 12}:00 PM`
      : `${horaFinVendedor}:00 AM`;
    const diaTexto = esSabado ? ' los sábados' : '';

    return {
      valid: false,
      error: `La hora ${horaNumero}:00 está fuera del horario de atención${diaTexto}`,
      suggestion: `Horario disponible${diaTexto}: ${horaInicioVendedor}:00 AM a ${horaFinTexto}`
    };
  }

  return { valid: true };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FORMATEO PARA GOOGLE CALENDAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Formatear fecha para Google Calendar API (RFC3339)
export function formatDateForCalendar(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

// Crear datos del evento para Google Calendar
export function crearEventoCalendar(
  desarrollo: string,
  clientName: string,
  cleanPhone: string,
  direccion: string,
  gpsLink: string,
  score: number,
  necesitaCredito: boolean,
  vendedorName: string,
  fechaEvento: Date,
  duracionMinutos: number = 60
): CalendarEventData {
  const temp = score >= 70 ? 'HOT 🔥' : score >= 40 ? 'WARM ⚠️' : 'COLD ❄️';
  const endEvento = new Date(fechaEvento.getTime() + duracionMinutos * 60 * 1000);

  return {
    summary: `🏠 Visita ${desarrollo} - ${clientName}`,
    description: `👤 Cliente: ${clientName}
📱 Teléfono: ${cleanPhone}
🏠 Desarrollo: ${desarrollo}
📍 Dirección: ${direccion}
🗺️ GPS: ${gpsLink}
📊 Score: ${score}/100 ${temp}
💳 Necesita crédito: ${necesitaCredito ? 'SÍ' : 'No especificado'}
👤 Vendedor: ${vendedorName || 'Por asignar'}`,
    location: direccion,
    start: {
      dateTime: formatDateForCalendar(fechaEvento),
      timeZone: 'America/Mexico_City'
    },
    end: {
      dateTime: formatDateForCalendar(endEvento),
      timeZone: 'America/Mexico_City'
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 },  // 1 día antes
        { method: 'email', minutes: 60 },    // 1 hora antes
        { method: 'popup', minutes: 30 }     // 30 min antes
      ]
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARSEO DE COMANDOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Parsear comando de cancelar cita: "cancelar cita con Ana"
export function parseCancelarCitaCommand(body: string): string | null {
  const match = body.match(/cancelar cita (?:con|de)\s+([a-záéíóúñ\s]+)/i);
  return match ? match[1].trim() : null;
}

// Parsear comando de reagendar: "reagendar Ana mañana 4pm"
export function parseReagendarCommand(body: string): ParsedCommand {
  const bodyLower = body.toLowerCase();

  // Extraer día
  const matchDia = bodyLower.match(/(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)/i);
  const dia = matchDia ? matchDia[1] : undefined;

  // Extraer hora
  const matchHora = body.match(/(\d{1,2})\s*(am|pm)/i);
  const hora = matchHora ? matchHora[1] : undefined;
  const ampm = matchHora ? matchHora[2] : undefined;

  // Extraer nombre: todo entre "reagendar" y el día/hora
  let nombreLead = '';
  let textoLimpio = bodyLower.replace(/^(reagendar|re agendar|re-agendar|mover cita|cambiar cita)\s*/i, '');
  textoLimpio = textoLimpio.replace(/^(cita\s+)?(con\s+|de\s+|para\s+)?/i, '');
  textoLimpio = textoLimpio.replace(/(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo).*$/i, '');
  textoLimpio = textoLimpio.replace(/\d{1,2}\s*(am|pm).*$/i, '');
  textoLimpio = textoLimpio.replace(/\s+(para|a)\s*$/i, '');
  nombreLead = textoLimpio.trim();

  return { nombreLead, dia, hora, ampm };
}

// Parsear comando de agendar cita: "cita con Pedro lunes 3pm"
export function parseAgendarCitaCommand(body: string): ParsedCommand {
  const bodyLower = body.toLowerCase();

  // Extraer día
  const matchDia = bodyLower.match(/(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)/i);
  const dia = matchDia ? matchDia[1] : undefined;

  // Extraer hora
  const matchHora = body.match(/(\d{1,2})\s*(am|pm)/i);
  const hora = matchHora ? matchHora[1] : undefined;
  const ampm = matchHora ? matchHora[2] : undefined;

  // Extraer nombre
  let nombreLead = '';
  let textoLimpio = bodyLower.replace(/^(cita|agendar|agenda|programar)\s*/i, '');
  textoLimpio = textoLimpio.replace(/^(con\s+|de\s+|para\s+)?/i, '');
  textoLimpio = textoLimpio.replace(/(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo).*$/i, '');
  textoLimpio = textoLimpio.replace(/\d{1,2}\s*(am|pm).*$/i, '');
  textoLimpio = textoLimpio.replace(/\s+(para|a)\s*$/i, '');
  nombreLead = textoLimpio.trim();

  return { nombreLead, dia, hora, ampm };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEMPLATES DE MENSAJES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Mensaje de notificación de nueva cita al vendedor
export function mensajeNuevaCitaVendedor(
  desarrollo: string,
  fecha: string,
  hora: string,
  clientName: string,
  cleanPhone: string,
  score: number,
  necesitaCredito: boolean,
  direccion: string,
  gpsLink: string
): string {
  const temp = score >= 70 ? 'HOT 🔥' : score >= 40 ? 'WARM ⚠️' : 'COLD ❄️';

  return `👋👋👋 *¡NUEVA CITA!* 👋👋👋
━━━━━━━━━━━━━━━━━━━━

🏠 *${desarrollo}*
📅 *${fecha}* a las *${hora}*

━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone}
📊 *Score:* ${score}/100 ${temp}
💳 *Crédito:* ${necesitaCredito ? '⚠️ SÍ NECESITA' : 'No especificado'}

━━━━━━━━━━━━━━━━━━━━

📍 ${direccion}
🗺️ ${gpsLink}

━━━━━━━━━━━━━━━━━━━━
📅 *Ver en Calendar:*
https://calendar.google.com/calendar/u/1/r

━━━━━━━━━━━━━━━━━━━━
⚠️ *PREPÁRATE PARA RECIBIRLO* ⚠️`;
}

// Mensaje de notificación al asesor hipotecario
export function mensajeNuevaCitaAsesor(
  desarrollo: string,
  fecha: string,
  hora: string,
  clientName: string,
  cleanPhone: string,
  score: number,
  vendedorName: string
): string {
  const temp = score >= 70 ? 'HOT 🔥' : score >= 40 ? 'WARM ⚠️' : 'COLD ❄️';

  return `🔥🔥🔥 *LEAD NECESITA CRÉDITO* 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━

🏠 *${desarrollo}*
📅 *Visita:* ${fecha} a las ${hora}

━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone}
📊 *Score:* ${score}/100 ${temp}
👤 *Vendedor:* ${vendedorName || 'Por asignar'}

━━━━━━━━━━━━━━━━━━━━
💳 *CONTACTAR DESPUÉS DE VISITA*
━━━━━━━━━━━━━━━━━━━━`;
}

// Mensaje de confirmación de cita al cliente
export function mensajeConfirmacionCitaCliente(
  clientName: string,
  desarrollo: string,
  fecha: string,
  hora: string,
  direccion: string,
  gpsLink: string,
  vendedorName: string,
  vendedorPhone: string
): string {
  const nombreCorto = clientName.split(' ')[0];

  return `🎉 *¡${nombreCorto}, tu cita está confirmada!*

📅 *${fecha}*
🕐 *${hora}*
📍 *${desarrollo}*

━━━━━━━━━━━━━━━━━━━━

🗺️ *Dirección:*
${direccion}

📍 *Ubicación GPS:*
${gpsLink}

━━━━━━━━━━━━━━━━━━━━

👤 *Te atiende:* ${vendedorName}
📱 *Contacto:* ${vendedorPhone}

━━━━━━━━━━━━━━━━━━━━

¡Te esperamos! 🏠✨`;
}

// Mensaje de cita cancelada
export function mensajeCitaCancelada(
  leadName: string,
  fechaStr: string,
  horaStr: string
): string {
  return `❌ *Cita cancelada:*

👤 ${leadName}
📅 Era: ${fechaStr}, ${horaStr}

¿Le aviso a ${leadName}?
*1.* Sí, mándale
*2.* No, yo le aviso`;
}

// Mensaje de cita reagendada al cliente
export function mensajeReagendadoCliente(
  clientName: string,
  nuevaFecha: string,
  nuevaHora: string,
  ubicacion: string,
  vendedorName: string,
  vendedorPhone: string
): string {
  return `¡Hola ${clientName}! 👋

Tu cita ha sido reprogramada:

📅 *${nuevaFecha}*
🕐 *${nuevaHora}*
📍 *${ubicacion || 'Por confirmar'}*

👤 Te atiende: *${vendedorName}*
📱 ${vendedorPhone || ''}

¡Te esperamos! 🏠`;
}

// Mensaje para horario fuera de rango
export function mensajeHorarioFueraRango(
  clientName: string,
  horaNumero: number,
  horaInicioVendedor: number,
  horaFinVendedor: number,
  esSabado: boolean
): string {
  const nombreCliente = clientName !== 'Cliente' ? clientName + ', las' : 'Las';
  const horaFinTexto = horaFinVendedor > 12
    ? `${horaFinVendedor - 12}:00 PM`
    : `${horaFinVendedor}:00 AM`;
  const diaTexto = esSabado ? ' los sábados' : '';

  return `⚠️ ${nombreCliente} *${horaNumero}:00* está fuera de nuestro horario de atención${diaTexto}.

📅 *Horario disponible${diaTexto}:* ${horaInicioVendedor}:00 AM a ${horaFinTexto}

¿A qué hora dentro de este horario te gustaría visitarnos? 😊`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILIDADES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Verificar si ya existe una cita reciente (evitar duplicados)
export function citaRecienteThreshold(): Date {
  return new Date(Date.now() - 30 * 60 * 1000); // 30 minutos
}

// Formatear fecha legible
export function formatearFechaLegible(fechaDB: string): string {
  try {
    const fecha = new Date(fechaDB + 'T12:00:00');
    return fecha.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'short'
    });
  } catch {
    return fechaDB;
  }
}

// Formatear hora legible
export function formatearHoraLegible(horaDB: string): string {
  if (!horaDB) return 'Sin hora';

  const partes = horaDB.split(':');
  if (partes.length < 2) return horaDB;

  let hora = parseInt(partes[0]);
  const minutos = partes[1];
  const ampm = hora >= 12 ? 'PM' : 'AM';

  if (hora > 12) hora -= 12;
  if (hora === 0) hora = 12;

  return `${hora}:${minutos} ${ampm}`;
}

// Calcular temperatura del lead
export function calcularTemperatura(score: number): string {
  if (score >= 70) return 'HOT 🔥';
  if (score >= 40) return 'WARM ⚠️';
  return 'COLD ❄️';
}
