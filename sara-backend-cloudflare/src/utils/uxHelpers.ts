/**
 * UX Helpers - Mejoras de experiencia de usuario
 * - Saludos por hora del día (zona México)
 * - Recordar preferencias del lead
 * - Contexto personalizado para SARA
 */

/**
 * Obtiene el saludo apropiado según la hora en México (DST-aware)
 */
export function getSaludoPorHora(): string {
  // DST-aware: uses Intl API (UTC-6 winter, UTC-5 summer)
  const mexicoHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).getHours();

  if (mexicoHour >= 5 && mexicoHour < 12) {
    return '¡Buenos días';
  } else if (mexicoHour >= 12 && mexicoHour < 19) {
    return '¡Buenas tardes';
  } else {
    return '¡Buenas noches';
  }
}

/**
 * Obtiene emoji según la hora del día
 */
export function getEmojiPorHora(): string {
  // DST-aware
  const mexicoHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).getHours();

  if (mexicoHour >= 5 && mexicoHour < 12) {
    return '☀️';
  } else if (mexicoHour >= 12 && mexicoHour < 19) {
    return '🌤️';
  } else {
    return '🌙';
  }
}

/**
 * Interface para preferencias del lead
 */
export interface LeadPreferences {
  recamaras?: number | string;
  presupuesto_min?: number;
  presupuesto_max?: number;
  zona_preferida?: string;
  desarrollo_interes?: string;
  tipo_credito?: string;
  tiene_hijos?: boolean;
  tiene_mascotas?: boolean;
  urgencia?: string; // 'alta', 'media', 'baja'
  ultima_visita?: string;
}

/**
 * Extrae preferencias guardadas del lead
 */
export function extractLeadPreferences(lead: any): LeadPreferences {
  const notes = typeof lead.notes === 'object' ? lead.notes : {};

  return {
    recamaras: notes.recamaras || lead.property_interest?.match(/(\d+)\s*rec/i)?.[1],
    presupuesto_min: notes.presupuesto_min || notes.presupuesto,
    presupuesto_max: notes.presupuesto_max,
    zona_preferida: notes.zona_preferida || notes.zona,
    desarrollo_interes: lead.property_interest || notes.desarrollo_interes,
    tipo_credito: notes.tipo_credito || lead.credit_type,
    tiene_hijos: notes.tiene_hijos,
    tiene_mascotas: notes.tiene_mascotas,
    urgencia: notes.urgencia,
    ultima_visita: notes.ultima_visita
  };
}

/**
 * Genera contexto personalizado para el prompt de SARA
 */
export function generarContextoPersonalizado(lead: any): string {
  const prefs = extractLeadPreferences(lead);
  const nombre = lead.name?.split(' ')[0];
  const saludo = getSaludoPorHora();

  let contexto = '';

  // Saludo personalizado
  if (nombre) {
    contexto += `${saludo} ${nombre}! `;
  }

  // Preferencias conocidas
  const preferencias: string[] = [];

  if (prefs.recamaras) {
    preferencias.push(`busca ${prefs.recamaras} recámaras`);
  }

  if (prefs.presupuesto_max) {
    const presupuestoStr = prefs.presupuesto_max >= 1000000
      ? `$${(prefs.presupuesto_max / 1000000).toFixed(1)}M`
      : `$${prefs.presupuesto_max.toLocaleString()}`;
    preferencias.push(`presupuesto hasta ${presupuestoStr}`);
  }

  if (prefs.zona_preferida) {
    preferencias.push(`zona: ${prefs.zona_preferida}`);
  }

  if (prefs.desarrollo_interes) {
    preferencias.push(`interesado en ${prefs.desarrollo_interes}`);
  }

  if (prefs.tipo_credito) {
    preferencias.push(`crédito: ${prefs.tipo_credito}`);
  }

  if (prefs.tiene_mascotas) {
    preferencias.push('tiene mascotas');
  }

  if (preferencias.length > 0) {
    contexto += `\n[Preferencias conocidas: ${preferencias.join(', ')}]`;
  }

  // Historial relevante
  if (prefs.ultima_visita) {
    contexto += `\n[Última visita: ${prefs.ultima_visita}]`;
  }

  return contexto;
}

/**
 * Determina qué opciones mostrar según el contexto
 * Retorna 4 opciones para usar con lista desplegable de WhatsApp
 */
export function getBotonesContextuales(
  intent: string,
  leadStatus: string,
  hasAppointment: boolean
): Array<{ id: string; title: string; description?: string }> {

  // Después de dar info de desarrollo
  if (intent === 'solicitar_informacion' || intent === 'preguntar_precios' || intent === 'interes_desarrollo') {
    return [
      { id: 'btn_ver_casas', title: '🏠 Ver casas', description: 'Conoce nuestros desarrollos' },
      { id: 'btn_precios', title: '💰 Precios', description: 'Desde $1.6M con financiamiento' },
      { id: 'btn_credito', title: '🏦 Asesoría hipotecaria', description: 'INFONAVIT, bancario, cofinavit' },
      { id: 'btn_agendar', title: '📅 Agendar visita', description: 'Visita el desarrollo que te guste' }
    ];
  }

  // Lead nuevo o sin cita
  if (leadStatus === 'new' && !hasAppointment) {
    return [
      { id: 'btn_ver_casas', title: '🏠 Ver casas', description: 'Conoce nuestros desarrollos' },
      { id: 'btn_precios', title: '💰 Precios', description: 'Desde $1.6M con financiamiento' },
      { id: 'btn_credito', title: '🏦 Asesoría hipotecaria', description: 'INFONAVIT, bancario, cofinavit' },
      { id: 'btn_agendar', title: '📅 Agendar cita', description: 'Agenda una visita presencial' }
    ];
  }

  // Lead con cita agendada
  if (hasAppointment) {
    return [
      { id: 'btn_confirmar', title: '✅ Confirmar cita', description: 'Confirma tu visita' },
      { id: 'btn_reagendar', title: '📅 Cambiar fecha', description: 'Reagenda tu cita' },
      { id: 'btn_precios', title: '💰 Ver precios', description: 'Consulta precios y modelos' },
      { id: 'btn_credito', title: '🏦 Asesoría hipotecaria', description: 'Opciones de financiamiento' }
    ];
  }

  // Lead en negociación
  if (leadStatus === 'negotiating' || leadStatus === 'negotiation' || leadStatus === 'visited') {
    return [
      { id: 'btn_cotizar', title: '💰 Cotización', description: 'Solicita cotización formal' },
      { id: 'btn_credito', title: '🏦 Crédito', description: 'Asesoría hipotecaria' },
      { id: 'btn_precios', title: '💰 Precios', description: 'Consulta precios actualizados' },
      { id: 'btn_otra_visita', title: '📅 Otra visita', description: 'Agenda otra visita' }
    ];
  }

  // Fallback: siempre ofrecer 4 opciones útiles
  return [
    { id: 'btn_ver_casas', title: '🏠 Ver casas', description: 'Conoce nuestros desarrollos' },
    { id: 'btn_precios', title: '💰 Precios', description: 'Desde $1.6M con financiamiento' },
    { id: 'btn_credito', title: '🏦 Asesoría hipotecaria', description: 'INFONAVIT, bancario, cofinavit' },
    { id: 'btn_agendar', title: '📅 Agendar cita', description: 'Agenda una visita presencial' }
  ];
}

/**
 * Genera lista de desarrollos para menú
 */
export function getDesarrollosParaLista(): Array<{
  title: string;
  rows: Array<{ id: string; title: string; description: string }>
}> {
  return [
    {
      title: '💰 Económicos (desde $1.5M)',
      rows: [
        { id: 'dev_monteverde', title: 'Monte Verde', description: 'Colinas del Padre • 2-3 rec' },
        { id: 'dev_andes', title: 'Priv. Andes', description: 'Guadalupe • 2-3 rec' }
      ]
    },
    {
      title: '🏡 Residenciales (desde $3M)',
      rows: [
        { id: 'dev_encinos', title: 'Los Encinos', description: 'Colinas del Padre • 3 rec' },
        { id: 'dev_miravalle', title: 'Miravalle', description: 'Colinas del Padre • 2-3 rec' },
        { id: 'dev_colorines', title: 'Paseo Colorines', description: 'Colinas del Padre • NUEVO' }
      ]
    },
    {
      title: '✨ Premium (desde $3.7M)',
      rows: [
        { id: 'dev_falco', title: 'Distrito Falco', description: 'Guadalupe • Lujo • 3 rec' }
      ]
    },
    {
      title: '🏞️ Terrenos',
      rows: [
        { id: 'dev_campelo', title: 'Villa Campelo', description: 'Citadella • $8,500-9,500/m²' },
        { id: 'dev_galiano', title: 'Villa Galiano', description: 'Citadella • $6,400/m²' }
      ]
    }
  ];
}
