// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPMENTS REGISTRY — Single Source of Truth
// CRÍTICO: Todo el código que necesite saber si algo es desarrollo o modelo
// DEBE consultar este archivo. NO hardcodear listas en otros archivos.
// ═══════════════════════════════════════════════════════════════════════════

export interface DevelopmentInfo {
  name: string;
  zone: 'colinas_del_padre' | 'guadalupe' | 'citadella';
  type: 'casas' | 'terrenos' | 'departamentos';
  /** Model/prototype names within this development */
  models: string[];
  /** Amenities keywords */
  amenities: string[];
  /** Carousel segment this belongs to */
  carouselSegment: 'economico' | 'premium';
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER REGISTRY — Actualizar aquí cuando se agreguen desarrollos/modelos
// ═══════════════════════════════════════════════════════════════════════════
export const DEVELOPMENTS: Record<string, DevelopmentInfo> = {
  'Monte Verde': {
    name: 'Monte Verde',
    zone: 'colinas_del_padre',
    type: 'casas',
    models: ['Acacia', 'Eucalipto', 'Fresno', 'Fresno 2', 'Olivo'],
    amenities: ['área de juegos', 'áreas verdes', 'CCTV', 'vigilancia 24/7', 'acceso controlado', 'pet-friendly'],
    carouselSegment: 'economico',
  },
  'Los Encinos': {
    name: 'Los Encinos',
    zone: 'colinas_del_padre',
    type: 'casas',
    models: ['Encino Blanco', 'Encino Dorado', 'Encino Verde', 'Maple', 'Roble'],
    amenities: ['casa club', 'área de juegos', 'áreas verdes', 'CCTV', 'vigilancia 24/7', 'acceso controlado', 'pet-friendly'],
    carouselSegment: 'premium',
  },
  'Miravalle': {
    name: 'Miravalle',
    zone: 'colinas_del_padre',
    type: 'casas',
    models: ['Vizcaya', 'Bilbao 7M', 'Casa Habitación 6m', 'Casa Habitación 7m', 'Departamento 6m', 'Departamento 7m'],
    amenities: ['áreas verdes', 'CCTV', 'vigilancia 24/7', 'acceso controlado', 'pet-friendly'],
    carouselSegment: 'premium',
  },
  'Paseo Colorines': {
    name: 'Paseo Colorines',
    zone: 'colinas_del_padre',
    type: 'casas',
    models: ['Prototipo 6M', 'Prototipo 7M'],
    amenities: ['áreas verdes', 'CCTV', 'vigilancia 24/7', 'acceso controlado'],
    carouselSegment: 'premium',
  },
  'Andes': {
    name: 'Andes',
    zone: 'guadalupe',
    type: 'casas',
    models: ['Laurel', 'Dalia', 'Gardenia', 'Lavanda'],
    amenities: ['alberca', 'área de juegos', 'áreas verdes', 'CCTV', 'vigilancia 24/7', 'acceso controlado', 'pet-friendly'],
    carouselSegment: 'economico',
  },
  'Alpes': {
    name: 'Alpes',
    zone: 'guadalupe',
    type: 'casas',
    models: ['Dalia Alpes'],
    amenities: ['áreas verdes', 'CCTV', 'vigilancia 24/7', 'acceso controlado'],
    carouselSegment: 'economico',
  },
  'Distrito Falco': {
    name: 'Distrito Falco',
    zone: 'guadalupe',
    type: 'casas',
    models: ['Proyecto Especial', 'Chipre Light', 'Colibrí Light', 'Colibrí', 'Chipre', 'Mirlo', 'Calandria'],
    amenities: ['área de juegos', 'áreas verdes', 'CCTV', 'vigilancia 24/7', 'acceso controlado'],
    carouselSegment: 'premium',
  },
  'Villa Campelo': {
    name: 'Villa Campelo',
    zone: 'citadella',
    type: 'terrenos',
    models: ['Terreno Villa Campelo'],
    amenities: ['caseta de acceso', 'CCTV'],
    carouselSegment: 'economico',
  },
  'Villa Galiano': {
    name: 'Villa Galiano',
    zone: 'citadella',
    type: 'terrenos',
    models: ['Terreno Villa Galiano'],
    amenities: ['caseta de acceso', 'CCTV'],
    carouselSegment: 'economico',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP HELPERS — Usar estas funciones, NO iterar manualmente
// ═══════════════════════════════════════════════════════════════════════════

/** All development names (lowercase for matching) */
const _devNamesLower = Object.keys(DEVELOPMENTS).map(d => d.toLowerCase());

/** All model names mapped to their parent development */
const _modelToDevMap = new Map<string, string>();
for (const [devName, info] of Object.entries(DEVELOPMENTS)) {
  for (const model of info.models) {
    _modelToDevMap.set(model.toLowerCase(), devName);
  }
}

/** All known names (developments + models) lowercase */
const _allNamesLower = [..._devNamesLower, ...[..._modelToDevMap.keys()]];

/**
 * Check if a string is a DEVELOPMENT name (not a model).
 * Case-insensitive, supports partial matching.
 */
export function isDevelopment(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return _devNamesLower.some(d => d === lower || d.includes(lower) || lower.includes(d));
}

/**
 * Check if a string is a MODEL name (not a development).
 */
export function isModel(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return _modelToDevMap.has(lower);
}

/**
 * Get the parent development name for a model.
 * Returns null if not a known model.
 */
export function getModelDevelopment(modelName: string): string | null {
  return _modelToDevMap.get(modelName.toLowerCase().trim()) || null;
}

/**
 * Resolve any name (development or model) to its development.
 * - "Distrito Falco" → "Distrito Falco" (already a development)
 * - "Chipre" → "Distrito Falco" (model → parent development)
 * - "unknown" → null
 */
export function resolveToDevelopment(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (!lower || lower.length < 3) return null; // Too short to match anything meaningful

  // Check if it's a development name
  for (const devName of Object.keys(DEVELOPMENTS)) {
    if (devName.toLowerCase() === lower || devName.toLowerCase().includes(lower) || lower.includes(devName.toLowerCase())) {
      return devName;
    }
  }

  // Check if it's a model name
  const parentDev = _modelToDevMap.get(lower);
  if (parentDev) return parentDev;

  return null;
}

/**
 * Extract ONLY development names from text (transcript, message, etc.)
 * Does NOT match model names — use resolveToDevelopment() for that.
 */
export function extractDevelopmentsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const [devName] of Object.entries(DEVELOPMENTS)) {
    if (lower.includes(devName.toLowerCase())) {
      found.add(devName);
    }
  }

  // Also check common aliases
  if (lower.includes('nogal') || lower.includes('citadella')) {
    found.add('Villa Campelo');
    found.add('Villa Galiano');
  }
  if (lower.includes('priv. andes') || lower.includes('privada andes')) {
    found.add('Andes');
  }

  return Array.from(found);
}

/**
 * Get development info by name. Case-insensitive.
 */
export function getDevelopmentInfo(name: string): DevelopmentInfo | null {
  const lower = name.toLowerCase().trim();
  for (const [devName, info] of Object.entries(DEVELOPMENTS)) {
    if (devName.toLowerCase() === lower || devName.toLowerCase().includes(lower) || lower.includes(devName.toLowerCase())) {
      return info;
    }
  }
  return null;
}

/**
 * Get all development names as array.
 */
export function getAllDevelopmentNames(): string[] {
  return Object.keys(DEVELOPMENTS);
}

/**
 * Get all model names as array.
 */
export function getAllModelNames(): string[] {
  return [..._modelToDevMap.keys()].map(m =>
    m.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );
}
