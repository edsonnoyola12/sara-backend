// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MÓDULO: constants - Configuración y constantes globales
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// URL del servidor de videos
export const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';

// Configuración de horarios de atención
export const HORARIOS = {
  HORA_FIN_SABADO: 14,        // 2:00 PM - Hora de cierre sábados
  HORA_INICIO_DEFAULT: 9,     // 9:00 AM - Hora inicio por defecto
  HORA_FIN_DEFAULT: 18,       // 6:00 PM - Hora fin por defecto L-V
};

// Desarrollos inmobiliarios conocidos
export const DESARROLLOS_CONOCIDOS = [
  'Monte Verde', 'Monte Real', 'Los Encinos', 'Miravalle', 'Andes', 'Distrito Falco',
  'Alpes', 'Paseo Colorines', 'Villa Campelo', 'Villa Galiano'
];

// Modelos de casas conocidos por desarrollo
export const MODELOS_CONOCIDOS = [
  // Los Encinos
  'Encino Blanco', 'Encino Verde', 'Encino Dorado', 'Roble', 'Maple', 'Nogal', 'Sabino',
  // Andes
  'Gardenia', 'Dalia', 'Lavanda', 'Laurel',
  // Distrito Falco
  'Calandria', 'Colibrí', 'Colibri', 'Chipre', 'Mirlo', 'Chipre Light', 'Colibrí Light', 'Proyecto Especial',
  // Monte Verde
  'Acacia', 'Eucalipto', 'Olivo', 'Fresno', 'Fresno 2',
  // Miravalle
  'Bilbao', 'Vizcaya', 'Casa Habitacion', 'Departamento',
  // Alpes
  'Dalia Alpes',
  // Paseo Colorines
  'Prototipo 6M', 'Prototipo 7M'
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES COMPARTIDAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Contexto de decisión del motor inteligente
export interface ContextoDecision {
  accion: 'continuar_flujo' | 'respuesta_directa' | 'usar_openai';
  respuesta?: string;
  siguientePregunta?: string;
  flujoActivo?: 'cita' | 'credito' | null;
  datos?: {
    nombre?: string;
    fecha?: string;
    hora?: string;
    banco?: string;
    ingreso?: number;
    enganche?: number;
  };
}

// Datos de conversación para el motor de contexto
export interface DatosConversacion {
  mensaje: string;
  historial: Array<{ role: string; content: string; timestamp?: string }>;
  lead: any;
  datosExtraidos: any;
  citaActiva?: any;
}

// Análisis de IA (OpenAI/Claude)
export interface AIAnalysis {
  intent: string;
  extracted_data: {
    nombre?: string;
    fecha?: string;
    hora?: string;
    desarrollo?: string;
    desarrollos?: string[];
    modelos?: string[];
    num_recamaras?: number;
    necesita_credito?: boolean;
    banco_preferido?: string;
    ingreso_mensual?: number;
    enganche_disponible?: number;
    modalidad_contacto?: string;
    quiere_asesor?: boolean;
    how_found_us?: string;
    family_size?: number;
    current_housing?: string;
    urgency?: string;
    occupation?: string;
    age_range?: string;
    vendedor_preferido?: string;
  };
  response: string;
  send_gps?: boolean;
  send_video_desarrollo?: boolean;
  send_contactos?: boolean;
  contactar_vendedor?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIONES UTILITARIAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Parsear múltiples desarrollos y modelos de un texto
export function parsearDesarrollosYModelos(texto: string): { desarrollos: string[], modelos: string[] } {
  const textoLower = texto.toLowerCase();
  const desarrollos: string[] = [];
  const modelos: string[] = [];

  // Buscar desarrollos mencionados
  for (const dev of DESARROLLOS_CONOCIDOS) {
    if (textoLower.includes(dev.toLowerCase())) {
      desarrollos.push(dev);
    }
  }

  // Buscar modelos/casas específicas mencionadas
  for (const modelo of MODELOS_CONOCIDOS) {
    if (textoLower.includes(modelo.toLowerCase())) {
      modelos.push(modelo);
    }
  }

  return { desarrollos, modelos };
}

// Inferir desarrollos desde modelos mencionados
export function inferirDesarrollosDesdeModelos(modelos: string[], properties: any[]): string[] {
  const desarrollosInferidos: string[] = [];

  for (const modelo of modelos) {
    // Buscar en las propiedades de la DB qué desarrollo tiene ese modelo
    const prop = properties.find(p =>
      p.name?.toLowerCase().includes(modelo.toLowerCase()) ||
      modelo.toLowerCase().includes(p.name?.toLowerCase() || '')
    );
    if (prop?.development && !desarrollosInferidos.includes(prop.development)) {
      desarrollosInferidos.push(prop.development);
    }
  }

  return desarrollosInferidos;
}

// Normalizar teléfono mexicano a formato Twilio: +521XXXXXXXXXX
export function formatPhoneMX(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+521${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+${digits}`;
  }
  if (digits.length === 13 && digits.startsWith('521')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

// Patrones de detección de respuestas
export const PATRONES = {
  // Respuestas afirmativas
  AFIRMATIVO: /^(s[ií]|si|ok|va|sale|dale|claro|por\s*supuesto|exacto|correcto|afirmativo|eso|as[ií]|aja|ajá|okey|okay|bien|perfecto|excelente|genial|me\s*parece|de\s*acuerdo|está\s*bien|esta\s*bien|simon|simón|nel|arre|va\s*que\s*va|rale|órale|orale|yep|yes|yeah|yup|sip|sep|sí\s*por\s*favor|claro\s*que\s*s[ií])$/i,

  // Respuestas negativas
  NEGATIVO: /^(no|nel|nope|nop|negativo|para\s*nada|en\s*absoluto|ni\s*madres|nimodo|ni\s*modo|todavía\s*no|aún\s*no|aun\s*no|mejor\s*no|no\s*gracias|nah|nope|nah|nanay)$/i,

  // Detectar hora en texto
  HORA: /(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?)?/i,

  // Detectar banco
  BANCO: /(scotiabank|banamex|bbva|bancomer|hsbc|santander|banorte|infonavit|fovissste|cofinavit)/i,

  // Detectar cantidad de dinero
  DINERO: /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:mil|m|k)?/i,
};
