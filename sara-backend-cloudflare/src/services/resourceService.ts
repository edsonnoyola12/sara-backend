import { SupabaseService } from './supabase';

// URLs estáticas de brochures por desarrollo
const BROCHURE_URLS: Record<string, string> = {
  'monte verde': 'https://gruposantarita.com/brochures/monte-verde.pdf',
  'los encinos': 'https://gruposantarita.com/brochures/los-encinos.pdf',
  'miravalle': 'https://gruposantarita.com/brochures/miravalle.pdf',
  'andes': 'https://gruposantarita.com/brochures/andes.pdf',
  'distrito falco': 'https://gruposantarita.com/brochures/distrito-falco.pdf',
};

class ResourceServiceClass {
  constructor(private supabase: SupabaseService) {}

  async enviarRecursosDesarrollo(desarrollo: string, phone: string): Promise<void> {
    console.log(`📤 Enviando recursos de ${desarrollo} a ${phone}`);
  }

  getBrochureUrl(desarrollo: string, modelo?: string): string | null {
    const devLower = desarrollo.toLowerCase().trim();

    // Buscar coincidencia exacta o parcial
    for (const [key, url] of Object.entries(BROCHURE_URLS)) {
      if (devLower.includes(key) || key.includes(devLower)) {
        return url;
      }
    }

    return null;
  }
}

export const resourceService = new ResourceServiceClass(null as any);
