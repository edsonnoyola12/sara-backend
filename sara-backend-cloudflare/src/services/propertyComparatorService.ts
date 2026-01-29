// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY COMPARATOR SERVICE - Comparador de Propiedades
// Compares properties side-by-side with key metrics and recommendations
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PropertySummary {
  id: string;
  name: string;
  development: string;
  type: string;                 // casa, depto, villa, terreno
  price: number;
  price_per_m2: number;
  bedrooms: number;
  bathrooms: number;
  construction_m2: number;
  land_m2: number;
  amenities: string[];
  location: string;
  gps_url: string | null;
  brochure_url: string | null;
  video_url: string | null;
  availability: string;
  delivery_date: string | null;
  highlights: string[];
  score: number;                // 0-100 based on value metrics
}

export interface ComparisonResult {
  generated_at: string;
  properties: PropertySummary[];
  comparison: {
    cheapest: string;
    best_value_per_m2: string;
    most_space: string;
    recommended: string;
    recommendation_reason: string;
  };
  differences: {
    metric: string;
    values: Record<string, string | number>;
    winner: string;
  }[];
}

export interface SearchFilters {
  min_price?: number;
  max_price?: number;
  min_bedrooms?: number;
  type?: string;
  development?: string;
  location?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PropertyComparatorService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET PROPERTIES FOR COMPARISON
  // ═══════════════════════════════════════════════════════════════════════════

  async getPropertiesByIds(ids: string[]): Promise<PropertySummary[]> {
    const { data: properties } = await this.supabase.client
      .from('properties')
      .select('*')
      .in('id', ids);

    if (!properties || properties.length === 0) return [];

    return properties.map(p => this.mapToSummary(p));
  }

  async getPropertiesByDevelopment(development: string): Promise<PropertySummary[]> {
    const { data: properties } = await this.supabase.client
      .from('properties')
      .select('*')
      .ilike('development', `%${development}%`)
      .order('price', { ascending: true })
      .limit(10);

    if (!properties || properties.length === 0) return [];

    return properties.map(p => this.mapToSummary(p));
  }

  async searchProperties(filters: SearchFilters): Promise<PropertySummary[]> {
    let query = this.supabase.client.from('properties').select('*');

    if (filters.min_price) {
      query = query.gte('price', filters.min_price);
    }
    if (filters.max_price) {
      query = query.lte('price', filters.max_price);
    }
    if (filters.min_bedrooms) {
      query = query.gte('bedrooms', filters.min_bedrooms);
    }
    if (filters.type) {
      query = query.ilike('type', `%${filters.type}%`);
    }
    if (filters.development) {
      query = query.ilike('development', `%${filters.development}%`);
    }
    if (filters.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }

    const { data: properties } = await query
      .order('price', { ascending: true })
      .limit(10);

    if (!properties || properties.length === 0) return [];

    return properties.map(p => this.mapToSummary(p));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARE PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  async compare(propertyIds: string[]): Promise<ComparisonResult | null> {
    if (propertyIds.length < 2) return null;

    const properties = await this.getPropertiesByIds(propertyIds.slice(0, 4));
    if (properties.length < 2) return null;

    // Calculate comparison metrics
    const cheapest = properties.reduce((min, p) =>
      p.price < min.price ? p : min
    );

    const bestValuePerM2 = properties.reduce((min, p) =>
      p.price_per_m2 < min.price_per_m2 ? p : min
    );

    const mostSpace = properties.reduce((max, p) =>
      p.construction_m2 > max.construction_m2 ? p : max
    );

    // Calculate recommendation (highest score)
    const recommended = properties.reduce((best, p) =>
      p.score > best.score ? p : best
    );

    // Build differences
    const differences = this.buildDifferences(properties);

    // Generate recommendation reason
    const reasons: string[] = [];
    if (recommended.id === cheapest.id) reasons.push('precio más bajo');
    if (recommended.id === bestValuePerM2.id) reasons.push('mejor valor por m²');
    if (recommended.id === mostSpace.id) reasons.push('mayor espacio');
    if (recommended.score >= 80) reasons.push('excelente puntuación general');

    const recommendationReason = reasons.length > 0
      ? `Recomendado por: ${reasons.join(', ')}`
      : 'Mejor balance de características';

    return {
      generated_at: new Date().toISOString(),
      properties,
      comparison: {
        cheapest: cheapest.name,
        best_value_per_m2: bestValuePerM2.name,
        most_space: mostSpace.name,
        recommended: recommended.name,
        recommendation_reason: recommendationReason
      },
      differences
    };
  }

  async compareByDevelopments(developments: string[]): Promise<ComparisonResult | null> {
    const allProperties: PropertySummary[] = [];

    for (const dev of developments.slice(0, 4)) {
      const props = await this.getPropertiesByDevelopment(dev);
      if (props.length > 0) {
        // Get the most representative property (median price)
        const sorted = [...props].sort((a, b) => a.price - b.price);
        const median = sorted[Math.floor(sorted.length / 2)];
        allProperties.push(median);
      }
    }

    if (allProperties.length < 2) return null;

    return this.compareProperties(allProperties);
  }

  private compareProperties(properties: PropertySummary[]): ComparisonResult {
    const cheapest = properties.reduce((min, p) =>
      p.price < min.price ? p : min
    );

    const bestValuePerM2 = properties.reduce((min, p) =>
      p.price_per_m2 < min.price_per_m2 ? p : min
    );

    const mostSpace = properties.reduce((max, p) =>
      p.construction_m2 > max.construction_m2 ? p : max
    );

    const recommended = properties.reduce((best, p) =>
      p.score > best.score ? p : best
    );

    const differences = this.buildDifferences(properties);

    const reasons: string[] = [];
    if (recommended.id === cheapest.id) reasons.push('precio más bajo');
    if (recommended.id === bestValuePerM2.id) reasons.push('mejor valor por m²');
    if (recommended.id === mostSpace.id) reasons.push('mayor espacio');

    return {
      generated_at: new Date().toISOString(),
      properties,
      comparison: {
        cheapest: cheapest.name,
        best_value_per_m2: bestValuePerM2.name,
        most_space: mostSpace.name,
        recommended: recommended.name,
        recommendation_reason: reasons.length > 0
          ? `Recomendado por: ${reasons.join(', ')}`
          : 'Mejor balance general'
      },
      differences
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUICK COMPARISON (for conversational use)
  // ═══════════════════════════════════════════════════════════════════════════

  async quickCompare(query: string): Promise<string> {
    // Parse development names from query
    const developmentKeywords = [
      'monte verde', 'monteverde',
      'distrito falco', 'falco',
      'los encinos', 'encinos',
      'miravalle',
      'villa campelo', 'campelo',
      'villa galiano', 'galiano',
      'citadella', 'nogal',
      'colinas', 'andes'
    ];

    const foundDevelopments: string[] = [];
    const lowerQuery = query.toLowerCase();

    for (const dev of developmentKeywords) {
      if (lowerQuery.includes(dev)) {
        // Map aliases to canonical names
        let canonical = dev;
        if (dev === 'monteverde') canonical = 'monte verde';
        if (dev === 'falco') canonical = 'distrito falco';
        if (dev === 'encinos') canonical = 'los encinos';
        if (dev === 'campelo') canonical = 'villa campelo';
        if (dev === 'galiano') canonical = 'villa galiano';
        if (dev === 'citadella' || dev === 'nogal') canonical = 'villa campelo';

        if (!foundDevelopments.includes(canonical)) {
          foundDevelopments.push(canonical);
        }
      }
    }

    if (foundDevelopments.length < 2) {
      return `Para comparar propiedades, menciona al menos 2 desarrollos.\n\n` +
        `Ejemplo: "Compara Monte Verde vs Distrito Falco"\n\n` +
        `Desarrollos disponibles:\n` +
        `• Monte Verde\n• Distrito Falco\n• Los Encinos\n• Miravalle\n` +
        `• Villa Campelo\n• Villa Galiano\n• Colinas del Padre`;
    }

    const comparison = await this.compareByDevelopments(foundDevelopments);
    if (!comparison) {
      return 'No encontré propiedades para comparar. ¿Podrías verificar los nombres?';
    }

    return this.formatComparisonForWhatsApp(comparison);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatComparisonForWhatsApp(comparison: ComparisonResult): string {
    const { properties, comparison: comp } = comparison;

    let msg = `🏠 *COMPARATIVA DE PROPIEDADES*\n\n`;

    // Show each property
    for (let i = 0; i < properties.length; i++) {
      const p = properties[i];
      const emoji = i === 0 ? '1️⃣' : i === 1 ? '2️⃣' : i === 2 ? '3️⃣' : '4️⃣';

      msg += `${emoji} *${p.name}*\n`;
      msg += `   📍 ${p.development}\n`;
      msg += `   💰 $${this.formatNumber(p.price)}\n`;
      msg += `   📐 ${p.construction_m2} m² (${this.formatNumber(p.price_per_m2)}/m²)\n`;
      msg += `   🛏️ ${p.bedrooms} rec | 🚿 ${p.bathrooms} baños\n`;
      if (p.highlights.length > 0) {
        msg += `   ✨ ${p.highlights.slice(0, 2).join(', ')}\n`;
      }
      msg += `\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 *ANÁLISIS:*\n\n`;
    msg += `💰 Más económico: *${comp.cheapest}*\n`;
    msg += `📐 Mayor espacio: *${comp.most_space}*\n`;
    msg += `⭐ Mejor valor/m²: *${comp.best_value_per_m2}*\n\n`;

    msg += `💡 *RECOMENDACIÓN:*\n`;
    msg += `*${comp.recommended}*\n`;
    msg += `_${comp.recommendation_reason}_\n\n`;

    msg += `¿Te gustaría agendar una visita a alguno de estos desarrollos?`;

    return msg;
  }

  formatPropertyForWhatsApp(property: PropertySummary): string {
    let msg = `🏠 *${property.name.toUpperCase()}*\n`;
    msg += `📍 ${property.development}\n\n`;

    msg += `💰 *Precio:* $${this.formatNumber(property.price)}\n`;
    msg += `📐 *Construcción:* ${property.construction_m2} m²\n`;
    if (property.land_m2 > 0) {
      msg += `🌳 *Terreno:* ${property.land_m2} m²\n`;
    }
    msg += `📊 *Precio/m²:* $${this.formatNumber(property.price_per_m2)}\n\n`;

    msg += `🛏️ *Recámaras:* ${property.bedrooms}\n`;
    msg += `🚿 *Baños:* ${property.bathrooms}\n\n`;

    if (property.amenities.length > 0) {
      msg += `✨ *Amenidades:*\n`;
      for (const amenity of property.amenities.slice(0, 5)) {
        msg += `• ${amenity}\n`;
      }
      msg += `\n`;
    }

    if (property.delivery_date) {
      msg += `📅 *Entrega:* ${property.delivery_date}\n`;
    }

    msg += `\n_${property.availability}_`;

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private mapToSummary(property: any): PropertySummary {
    const price = Number(property.price) || 0;
    const constructionM2 = Number(property.construction_m2) || Number(property.area_m2) || 100;
    const pricePerM2 = constructionM2 > 0 ? Math.round(price / constructionM2) : 0;

    // Calculate score based on value metrics
    const score = this.calculateScore(property, pricePerM2);

    // Extract amenities from various fields
    const amenities = this.extractAmenities(property);

    // Extract highlights
    const highlights = this.extractHighlights(property);

    return {
      id: property.id,
      name: property.name || property.modelo || 'Sin nombre',
      development: property.development || property.desarrollo || '',
      type: property.type || property.tipo || 'casa',
      price,
      price_per_m2: pricePerM2,
      bedrooms: Number(property.bedrooms) || Number(property.recamaras) || 0,
      bathrooms: Number(property.bathrooms) || Number(property.banos) || 0,
      construction_m2: constructionM2,
      land_m2: Number(property.land_m2) || Number(property.terreno_m2) || 0,
      amenities,
      location: property.location || property.ubicacion || '',
      gps_url: property.gps_url || null,
      brochure_url: property.brochure_url || property.pdf_url || null,
      video_url: property.video_url || null,
      availability: property.availability || 'Disponible',
      delivery_date: property.delivery_date || property.fecha_entrega || null,
      highlights,
      score
    };
  }

  private calculateScore(property: any, pricePerM2: number): number {
    let score = 50; // Base score

    // Price per m2 factor (lower is better for Puebla market)
    // Average in Puebla: ~$25,000/m2
    if (pricePerM2 < 20000) score += 15;
    else if (pricePerM2 < 25000) score += 10;
    else if (pricePerM2 < 30000) score += 5;
    else if (pricePerM2 > 40000) score -= 10;

    // Bedrooms factor
    const bedrooms = Number(property.bedrooms) || 0;
    if (bedrooms >= 3) score += 10;
    else if (bedrooms >= 2) score += 5;

    // Bathrooms factor
    const bathrooms = Number(property.bathrooms) || 0;
    if (bathrooms >= 2) score += 5;

    // Development prestige (based on name recognition)
    const dev = (property.development || '').toLowerCase();
    if (dev.includes('monte verde') || dev.includes('distrito falco')) score += 10;
    if (dev.includes('miravalle') || dev.includes('encinos')) score += 8;

    // Amenities factor
    const amenities = property.amenities || property.amenidades || '';
    if (typeof amenities === 'string' && amenities.length > 50) score += 5;
    if (Array.isArray(amenities) && amenities.length >= 5) score += 5;

    // Has GPS/brochure/video
    if (property.gps_url) score += 2;
    if (property.brochure_url || property.pdf_url) score += 2;
    if (property.video_url) score += 2;

    return Math.min(100, Math.max(0, score));
  }

  private extractAmenities(property: any): string[] {
    const amenities: string[] = [];

    // From amenities field
    if (property.amenities) {
      if (Array.isArray(property.amenities)) {
        amenities.push(...property.amenities);
      } else if (typeof property.amenities === 'string') {
        amenities.push(...property.amenities.split(/[,;]/));
      }
    }

    // From amenidades field
    if (property.amenidades) {
      if (Array.isArray(property.amenidades)) {
        amenities.push(...property.amenidades);
      } else if (typeof property.amenidades === 'string') {
        amenities.push(...property.amenidades.split(/[,;]/));
      }
    }

    // From description
    const desc = (property.description || property.descripcion || '').toLowerCase();
    const commonAmenities = [
      'alberca', 'piscina', 'gimnasio', 'gym', 'jardín', 'terraza',
      'estacionamiento', 'cochera', 'seguridad 24', 'vigilancia',
      'área verde', 'casa club', 'roof garden', 'palapa'
    ];

    for (const amenity of commonAmenities) {
      if (desc.includes(amenity) && !amenities.some(a => a.toLowerCase().includes(amenity))) {
        amenities.push(amenity.charAt(0).toUpperCase() + amenity.slice(1));
      }
    }

    return [...new Set(amenities.map(a => a.trim()).filter(a => a.length > 0))].slice(0, 10);
  }

  private extractHighlights(property: any): string[] {
    const highlights: string[] = [];

    // Check for special features
    if (property.is_new || property.nuevo) {
      highlights.push('Nuevo');
    }
    if (property.furnished || property.amueblado) {
      highlights.push('Amueblado');
    }
    if (property.pool || property.alberca) {
      highlights.push('Alberca privada');
    }
    if (property.garden || property.jardin) {
      highlights.push('Jardín privado');
    }
    if (property.garage && Number(property.garage) >= 2) {
      highlights.push(`${property.garage} estacionamientos`);
    }

    // From notes or highlights field
    if (property.highlights) {
      if (Array.isArray(property.highlights)) {
        highlights.push(...property.highlights);
      }
    }

    return highlights.slice(0, 5);
  }

  private buildDifferences(properties: PropertySummary[]): ComparisonResult['differences'] {
    const differences: ComparisonResult['differences'] = [];

    // Price comparison
    const priceValues: Record<string, number> = {};
    let cheapestPrice = Infinity;
    let cheapestName = '';
    for (const p of properties) {
      priceValues[p.name] = p.price;
      if (p.price < cheapestPrice) {
        cheapestPrice = p.price;
        cheapestName = p.name;
      }
    }
    differences.push({
      metric: 'Precio',
      values: priceValues,
      winner: cheapestName
    });

    // Construction area
    const areaValues: Record<string, number> = {};
    let maxArea = 0;
    let maxAreaName = '';
    for (const p of properties) {
      areaValues[p.name] = p.construction_m2;
      if (p.construction_m2 > maxArea) {
        maxArea = p.construction_m2;
        maxAreaName = p.name;
      }
    }
    differences.push({
      metric: 'Construcción (m²)',
      values: areaValues,
      winner: maxAreaName
    });

    // Price per m2
    const ppm2Values: Record<string, number> = {};
    let cheapestPPM2 = Infinity;
    let cheapestPPM2Name = '';
    for (const p of properties) {
      ppm2Values[p.name] = p.price_per_m2;
      if (p.price_per_m2 < cheapestPPM2) {
        cheapestPPM2 = p.price_per_m2;
        cheapestPPM2Name = p.name;
      }
    }
    differences.push({
      metric: 'Precio/m²',
      values: ppm2Values,
      winner: cheapestPPM2Name
    });

    // Bedrooms
    const bedroomValues: Record<string, number> = {};
    let maxBedrooms = 0;
    let maxBedroomsName = '';
    for (const p of properties) {
      bedroomValues[p.name] = p.bedrooms;
      if (p.bedrooms > maxBedrooms) {
        maxBedrooms = p.bedrooms;
        maxBedroomsName = p.name;
      }
    }
    differences.push({
      metric: 'Recámaras',
      values: bedroomValues,
      winner: maxBedroomsName
    });

    return differences;
  }

  private formatNumber(num: number): string {
    return num.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function parseCompareRequest(text: string): string[] | null {
  const lowerText = text.toLowerCase();

  // Check if it's a comparison request
  const compareKeywords = ['comparar', 'compara', 'vs', 'versus', 'diferencia', 'cual es mejor', 'cuál es mejor'];
  const isCompareRequest = compareKeywords.some(kw => lowerText.includes(kw));
  if (!isCompareRequest) return null;

  // Extract development names
  const developmentPatterns = [
    'monte verde', 'monteverde', 'distrito falco', 'falco',
    'los encinos', 'encinos', 'miravalle', 'villa campelo', 'campelo',
    'villa galiano', 'galiano', 'citadella', 'nogal', 'colinas', 'andes'
  ];

  const found: string[] = [];
  for (const pattern of developmentPatterns) {
    if (lowerText.includes(pattern)) {
      // Normalize to canonical name
      let canonical = pattern;
      if (pattern === 'monteverde') canonical = 'monte verde';
      if (pattern === 'falco') canonical = 'distrito falco';
      if (pattern === 'encinos') canonical = 'los encinos';
      if (pattern === 'campelo') canonical = 'villa campelo';
      if (pattern === 'galiano') canonical = 'villa galiano';
      if (pattern === 'citadella' || pattern === 'nogal') canonical = 'villa campelo';

      if (!found.includes(canonical)) {
        found.push(canonical);
      }
    }
  }

  return found.length >= 2 ? found : null;
}
