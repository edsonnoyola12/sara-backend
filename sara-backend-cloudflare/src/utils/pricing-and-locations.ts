// Precios base de todos los modelos (MXN)
export const PRECIOS_BASE: { [key: string]: number } = {
  // Los Encinos
  'Ceiba': 2799000,
  'Eucalipto': 3099000,
  'Cedro': 3399000,
  
  // Monte Verde
  'Abeto': 2599000,
  'Fresno': 2799000,
  'Roble': 2999000,
  
  // Monte Real
  'Madroño': 2899000,
  'Avellano': 3199000,
  
  // Andes
  'Lavanda': 2699000,
  'Tulipán': 2899000,
  'Azalea': 3099000,
  
  // Miravalle
  'Almendro': 3299000,
  'Olivo': 3499000,
  
  // Villa Galiano
  'Girasol': 2499000,
  'Gardenia': 2699000,
  
  // Distrito Falco
  'Halcón': 3699000,
  'Águila': 3899000,
  
  // Villa Campelo
  'Sauce': 2899000,
  'Nogal': 3099000,
  
  // Alpes
  'Orquídea': 3199000,
  'Dalia': 3399000
};

// Ubicaciones GPS de los desarrollos
export const UBICACIONES_GPS: { [key: string]: { lat: number; lng: number; nombre: string } } = {
  'Los Encinos': { lat: 19.0319, lng: -98.2063, nombre: 'Los Encinos' },
  'Monte Verde': { lat: 19.0325, lng: -98.2070, nombre: 'Monte Verde' },
  'Monte Real': { lat: 19.0330, lng: -98.2075, nombre: 'Monte Real' },
  'Andes': { lat: 19.0315, lng: -98.2055, nombre: 'Andes' },
  'Miravalle': { lat: 19.0340, lng: -98.2080, nombre: 'Miravalle' },
  'Villa Galiano': { lat: 19.0310, lng: -98.2050, nombre: 'Villa Galiano' },
  'Distrito Falco': { lat: 19.0450, lng: -98.1850, nombre: 'Distrito Falco' },
  'Villa Campelo': { lat: 19.0460, lng: -98.1860, nombre: 'Villa Campelo' },
  'Alpes': { lat: 19.0200, lng: -98.2200, nombre: 'Alpes' }
};

// Mapeo de modelos a desarrollos
const MODELO_A_DESARROLLO: { [key: string]: string } = {
  'Ceiba': 'Los Encinos',
  'Eucalipto': 'Los Encinos',
  'Cedro': 'Los Encinos',
  'Abeto': 'Monte Verde',
  'Fresno': 'Monte Verde',
  'Roble': 'Monte Verde',
  'Madroño': 'Monte Real',
  'Avellano': 'Monte Real',
  'Lavanda': 'Andes',
  'Tulipán': 'Andes',
  'Azalea': 'Andes',
  'Almendro': 'Miravalle',
  'Olivo': 'Miravalle',
  'Girasol': 'Villa Galiano',
  'Gardenia': 'Villa Galiano',
  'Halcón': 'Distrito Falco',
  'Águila': 'Distrito Falco',
  'Sauce': 'Villa Campelo',
  'Nogal': 'Villa Campelo',
  'Orquídea': 'Alpes',
  'Dalia': 'Alpes'
};

// Obtener ubicación GPS de una propiedad
export function getUbicacionPropiedad(modelo: string): { lat: number; lng: number; nombre: string } | null {
  const desarrollo = MODELO_A_DESARROLLO[modelo];
  if (!desarrollo) return null;
  
  return UBICACIONES_GPS[desarrollo] || null;
}

// Generar link de Google Maps
export function getGoogleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
