// ═══════════════════════════════════════════════════════════════════════════
// FACT VALIDATOR — Surgical correction of incorrect facts in AI responses
// Instead of replacing the entire response with hardcoded text, this module
// finds and fixes ONLY the incorrect facts, preserving Claude's natural tone.
// ═══════════════════════════════════════════════════════════════════════════

import { DEVELOPMENTS, getDevelopmentInfo } from '../constants/developments';

// ─── Types ───────────────────────────────────────────────────────────────

interface ValidationResult {
  response: string;
  corrections: string[];
}

interface FactCorrector {
  name: string;
  check: (response: string, context?: FactContext) => string | null;
}

interface FactContext {
  developmentMentioned?: string;
}

// ─── Individual Fact Correctors ──────────────────────────────────────────

/**
 * ALBERCA: NO development has a pool.
 * If any response claims a development has alberca/pool, correct it.
 */
function correctAlberca(response: string, context?: FactContext): string | null {
  const lower = response.toLowerCase();
  if (!lower.includes('alberca') && !lower.includes('piscina') && !lower.includes('pool')) {
    return null;
  }

  // Check if response already denies alberca
  if (lower.includes('no contamos con alberca') || lower.includes('ninguno de nuestros') || lower.includes('no tiene alberca') || lower.includes('no cuenta con alberca')) {
    return null;
  }

  // If any development is mentioned with alberca as a feature, correct it
  const allDevs = Object.keys(DEVELOPMENTS);
  const sentences = response.split(/(?<=[.!?])\s+/);
  let modified = false;

  const correctedSentences = sentences.map(sentence => {
    const sLower = sentence.toLowerCase();
    const hasPool = sLower.includes('alberca') || sLower.includes('piscina') || sLower.includes('pool');
    if (!hasPool) return sentence;

    // If sentence claims any development has pool, replace
    for (const dev of allDevs) {
      if (sLower.includes(dev.toLowerCase()) && (sLower.includes('tiene alberca') || sLower.includes('con alberca') || sLower.includes('tiene piscina'))) {
        modified = true;
        return 'Por el momento ninguno de nuestros desarrollos cuenta con alberca, pero tenemos excelentes amenidades.';
      }
    }
    return sentence;
  });

  if (modified) {
    return correctedSentences.join(' ');
  }

  return null;
}

/**
 * RENTA: We DON'T rent, only sell.
 * If response offers rental, correct the specific sentence.
 */
function correctRenta(response: string): string | null {
  // Skip if response already denies renta
  const lower = response.toLowerCase();
  if (lower.includes('no manejamos renta') || lower.includes('no rentamos') || lower.includes('solo vend')) {
    return null;
  }

  const rentPatterns = [
    /(?:podemos|puedo|ofrecemos|tenemos|manejamos)\s+(?:opciones?\s+de\s+)?rent(?:ar|a|as)/gi,
    /(?:sí|si)\s*,?\s*(?:también\s+)?rent(?:amos|ar)/gi,
    /opciones?\s+de\s+renta/gi,
    /servicio\s+de\s+renta/gi,
    /(?:casas?|propiedades?)\s+(?:en|para|de)\s+renta/gi,
  ];

  let result = response;
  let corrected = false;

  for (const pattern of rentPatterns) {
    if (pattern.test(result)) {
      corrected = true;
      result = result.replace(pattern, 'solo vendemos, no manejamos rentas');
    }
  }

  return corrected ? result : null;
}

/**
 * MASCOTAS: All developments accept pets EXCEPT Distrito Falco.
 * If response says Falco is pet-friendly, correct it.
 */
function correctMascotas(response: string): string | null {
  const lower = response.toLowerCase();
  const hasPetTopic = lower.includes('mascota') || lower.includes('perro') || lower.includes('gato') || lower.includes('pet');
  if (!hasPetTopic) return null;

  // Check if response says Falco accepts pets
  const falcoPatterns = [
    /(?:distrito\s+)?falco[^.]*(?:acepta|permite|admite|sí|si)[^.]*mascota[^.]*/gi,
    /mascota[^.]*(?:distrito\s+)?falco[^.]*(?:acepta|permite|admite|sí|si)[^.]*/gi,
  ];

  // "Todos aceptan mascotas" without the Falco exception
  const todosPattern = /(?:todos?\s+(?:los\s+)?(?:desarrollos?|fraccionamientos?)\s+(?:aceptan|permiten)\s+mascotas)(?!\s*,?\s*excepto)/gi;

  let result = response;
  let corrected = false;

  for (const pattern of falcoPatterns) {
    if (pattern.test(result)) {
      corrected = true;
      result = result.replace(pattern, 'casi todos nuestros desarrollos aceptan mascotas, excepto Distrito Falco');
    }
  }

  if (todosPattern.test(result)) {
    corrected = true;
    result = result.replace(todosPattern, 'casi todos nuestros desarrollos aceptan mascotas, excepto Distrito Falco');
  }

  return corrected ? result : null;
}

/**
 * TASAS DE INTERÉS: NEVER mention specific rates.
 * Remove any specific percentage for interest rates.
 */
function correctTasas(response: string): string | null {
  const lower = response.toLowerCase();
  if (!lower.includes('tasa') && !lower.includes('interés') && !lower.includes('interes') && !lower.includes('%')) {
    return null;
  }

  // Match patterns like "tasa de X%", "X% de interés", "tasas desde X%", "tasa del X%"
  const tasaPatterns = [
    /tasas?\s+(?:de\s+)?(?:interés|interes)\s+(?:del?\s+)?[\d.,]+\s*%/gi,
    /tasas?\s+(?:desde|entre|del?|aproximada\s+del?)\s+[\d.,]+\s*%(?:\s*(?:a|al?|hasta|y)\s+[\d.,]+\s*%)?/gi,
    /[\d.,]+\s*%\s+(?:de\s+)?(?:interés|interes)/gi,
    /(?:interés|interes)\s+(?:del?\s+)?[\d.,]+\s*%/gi,
  ];

  let result = response;
  let corrected = false;

  for (const pattern of tasaPatterns) {
    if (pattern.test(result)) {
      corrected = true;
      result = result.replace(pattern, 'las tasas varían según el banco y tu perfil crediticio');
    }
  }

  return corrected ? result : null;
}

/**
 * LOCALES COMERCIALES: We DON'T sell commercial spaces.
 * If response offers locales comerciales, correct it.
 */
function correctLocalesComerciales(response: string): string | null {
  const patterns = [
    /(?:sí|si)\s*,?\s*(?:tenemos|manejamos|vendemos)\s+locales?\s+comercial/gi,
    /(?:ofrecemos|contamos\s+con)\s+locales?\s+comercial/gi,
    /locales?\s+comerciales?\s+(?:disponibles?|en\s+venta)/gi,
  ];

  let result = response;
  let corrected = false;

  for (const pattern of patterns) {
    if (pattern.test(result)) {
      corrected = true;
      result = result.replace(pattern, 'nos especializamos en casas habitación, no manejamos locales comerciales');
    }
  }

  return corrected ? result : null;
}

/**
 * EL NOGAL / CITADELLA: We DO have this development.
 * If response says we don't have it, correct it.
 */
function correctNogalCitadella(response: string): string | null {
  const lower = response.toLowerCase();
  const hasNogal = lower.includes('nogal') || lower.includes('citadella');
  if (!hasNogal) return null;

  const denyPatterns = [
    /no\s+(?:tenemos|contamos\s+con|manejamos)\s+(?:el\s+)?(?:nogal|citadella)/gi,
    /(?:nogal|citadella)\s+no\s+(?:es|está|existe|forma\s+parte)/gi,
    /no\s+(?:conozco|tengo\s+información\s+(?:de|sobre))\s+(?:el\s+)?(?:nogal|citadella)/gi,
  ];

  let result = response;
  let corrected = false;

  for (const pattern of denyPatterns) {
    if (pattern.test(result)) {
      corrected = true;
      result = result.replace(pattern,
        'sí tenemos Citadella del Nogal, es nuestro desarrollo de terrenos en Guadalupe con Villa Campelo y Villa Galiano'
      );
    }
  }

  return corrected ? result : null;
}

/**
 * HORARIOS: Mon-Fri 9am-7pm, Sat-Sun 10am-6pm.
 * If response has wrong hours, correct them.
 */
function correctHorarios(response: string): string | null {
  const lower = response.toLowerCase();
  if (!lower.includes('horario') && !lower.includes('hora') && !lower.includes('abierto') && !lower.includes('atención')) {
    return null;
  }

  // Check for incorrect weekday hours (should be 9am-7pm)
  const wrongWeekday = /(?:lunes\s+a\s+viernes|l(?:un)?-v(?:ie)?|entre\s+semana)[^.]*?(\d{1,2})\s*(?:am|:00)?\s*(?:a|hasta|-)\s*(\d{1,2})\s*(?:pm|:00)?/gi;
  // Check for incorrect weekend hours (should be 10am-6pm)
  const wrongWeekend = /(?:sábado|sabado|domingo|fin\s+de\s+semana|s[aá]b(?:ado)?(?:\s+y\s+dom(?:ingo)?))[^.]*?(\d{1,2})\s*(?:am|:00)?\s*(?:a|hasta|-)\s*(\d{1,2})\s*(?:pm|:00)?/gi;

  let result = response;
  let corrected = false;

  let match;
  // Check weekday hours
  while ((match = wrongWeekday.exec(result)) !== null) {
    const openHour = parseInt(match[1]);
    const closeHour = parseInt(match[2]);
    if (openHour !== 9 || closeHour !== 7) {
      corrected = true;
      // Replace just the time portion
      result = result.slice(0, match.index) +
        match[0].replace(/(\d{1,2})\s*(?:am|:00)?\s*(?:a|hasta|-)\s*(\d{1,2})\s*(?:pm|:00)?/, '9am a 7pm') +
        result.slice(match.index + match[0].length);
    }
  }

  while ((match = wrongWeekend.exec(result)) !== null) {
    const openHour = parseInt(match[1]);
    const closeHour = parseInt(match[2]);
    if (openHour !== 10 || closeHour !== 6) {
      corrected = true;
      result = result.slice(0, match.index) +
        match[0].replace(/(\d{1,2})\s*(?:am|:00)?\s*(?:a|hasta|-)\s*(\d{1,2})\s*(?:pm|:00)?/, '10am a 6pm') +
        result.slice(match.index + match[0].length);
    }
  }

  return corrected ? result : null;
}

/**
 * IDENTITY: SARA is an AI assistant, never a human.
 */
function correctIdentity(response: string): string | null {
  const humanClaims = [
    /soy\s+(?:una\s+)?persona\s+real/gi,
    /soy\s+(?:un|una)\s+(?:asesor(?:a)?|vendedor(?:a)?|humano|persona)\b/gi,
    /no\s+soy\s+(?:un\s+)?(?:robot|bot|ia|inteligencia\s+artificial)/gi,
  ];

  let result = response;
  let corrected = false;

  for (const pattern of humanClaims) {
    if (pattern.test(result)) {
      corrected = true;
      result = result.replace(pattern, 'soy SARA, asistente virtual de Grupo Santa Rita');
    }
  }

  return corrected ? result : null;
}

// ─── Utility ─────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Corrector Registry ──────────────────────────────────────────────────

const CORRECTORS: FactCorrector[] = [
  {
    name: 'alberca',
    check: (r, ctx) => correctAlberca(r, ctx),
  },
  {
    name: 'renta',
    check: (r) => correctRenta(r),
  },
  // mascotas: disabled — handled by aiConversationService full-replacement override
  // (regex replacement mid-sentence creates garbled text; full-replacement is more reliable)
  // {
  //   name: 'mascotas',
  //   check: (r) => correctMascotas(r),
  // },
  {
    name: 'tasas_interes',
    check: (r) => correctTasas(r),
  },
  {
    name: 'locales_comerciales',
    check: (r) => correctLocalesComerciales(r),
  },
  {
    name: 'nogal_citadella',
    check: (r) => correctNogalCitadella(r),
  },
  {
    name: 'horarios',
    check: (r) => correctHorarios(r),
  },
  {
    name: 'identidad',
    check: (r) => correctIdentity(r),
  },
];

// ─── Main Export ─────────────────────────────────────────────────────────

/**
 * Validates and corrects factual errors in an AI response.
 * Only fixes incorrect facts — never replaces the entire response.
 *
 * @param response - The AI-generated response string
 * @param context  - Optional context (e.g., which development was mentioned)
 * @returns The corrected response + list of corrections applied
 */
export function validateFacts(
  response: string,
  context?: { developmentMentioned?: string }
): ValidationResult {
  const corrections: string[] = [];
  let current = response;

  for (const corrector of CORRECTORS) {
    try {
      const result = corrector.check(current, context);
      if (result !== null) {
        corrections.push(corrector.name);
        current = result;
        console.log(`[FactValidator] Corrected: ${corrector.name}`);
      }
    } catch (err) {
      // Never let a validator crash the response pipeline
      console.error(`[FactValidator] Error in ${corrector.name}:`, err);
    }
  }

  if (corrections.length > 0) {
    console.log(`[FactValidator] ${corrections.length} correction(s): ${corrections.join(', ')}`);
  }

  return { response: current, corrections };
}
