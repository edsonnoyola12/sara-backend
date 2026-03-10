// Location-Based Suggestions Service
// Recommends nearest Grupo Santa Rita developments based on user's GPS coordinates

interface DevelopmentDistance {
  name: string;
  development: string;
  distanceKm: number;
  estimatedMinutes: number;
  priceFrom: string;
}

interface Coordinates {
  lat: number;
  lng: number;
}

export class LocationService {
  // Development coordinates in Zacatecas (approximate)
  private readonly coordinates: Record<string, Coordinates> = {
    'Monte Verde': { lat: 22.7494, lng: -102.5587 },
    'Los Encinos': { lat: 22.7520, lng: -102.5550 },
    'Miravalle': { lat: 22.7510, lng: -102.5560 },
    'Paseo Colorines': { lat: 22.7505, lng: -102.5575 },
    'Monte Real': { lat: 22.7498, lng: -102.5580 },
    'Andes': { lat: 22.7350, lng: -102.4890 },
    'Distrito Falco': { lat: 22.7380, lng: -102.4850 },
    'Villa Campelo': { lat: 22.7400, lng: -102.4900 },
    'Villa Galiano': { lat: 22.7405, lng: -102.4905 },
  };

  /**
   * Haversine formula: calculates distance between two GPS points in km
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10; // 1 decimal
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Get nearest developments sorted by distance
   * @param lat User latitude
   * @param lng User longitude
   * @param properties Array of properties from DB (used to get real prices)
   * @param limit Max results (default 3)
   */
  getNearestDevelopments(lat: number, lng: number, properties: any[], limit: number = 3): DevelopmentDistance[] {
    const results: DevelopmentDistance[] = [];

    for (const [devName, coords] of Object.entries(this.coordinates)) {
      const distanceKm = this.calculateDistance(lat, lng, coords.lat, coords.lng);
      // Urban driving in Zacatecas ~20km/h average with traffic → 3 min/km
      const estimatedMinutes = Math.round(distanceKm * 3);

      // Find min price from properties DB for this development
      const devProperties = properties.filter((p: any) =>
        p.development?.toLowerCase() === devName.toLowerCase() ||
        p.name?.toLowerCase().includes(devName.toLowerCase())
      );

      let priceFrom = 'Consultar';
      if (devProperties.length > 0) {
        const minPrice = Math.min(
          ...devProperties
            .map((p: any) => p.price_min || p.price || 0)
            .filter((p: number) => p > 0)
        );
        if (minPrice > 0) {
          priceFrom = this.formatPrice(minPrice);
        }
      }

      results.push({
        name: devName,
        development: devName,
        distanceKm,
        estimatedMinutes: Math.max(estimatedMinutes, 1), // min 1 minute
        priceFrom,
      });
    }

    return results
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  /**
   * Format price for display: 1600000 → "$1.6M"
   */
  private formatPrice(price: number): string {
    if (price >= 1_000_000) {
      const millions = price / 1_000_000;
      // Show 1 decimal if not whole
      const formatted = millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1);
      return `$${formatted}M`;
    }
    if (price >= 1_000) {
      return `$${Math.round(price / 1_000)}K`;
    }
    return `$${price}`;
  }

  /**
   * Format WhatsApp-friendly response with nearest developments
   */
  formatLocationResponse(nearest: DevelopmentDistance[]): string {
    if (nearest.length === 0) {
      return 'No encontré desarrollos cercanos. ¿Te gustaría ver todas nuestras opciones?';
    }

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

    let response = '📍 *Desarrollos cerca de ti:*\n';

    nearest.forEach((dev, i) => {
      const emoji = numberEmojis[i] || `${i + 1}.`;
      const tipo = (dev.name === 'Villa Campelo' || dev.name === 'Villa Galiano')
        ? 'Terrenos'
        : 'Casas';
      response += `\n${emoji} *${dev.name}* — ${dev.distanceKm} km (~${dev.estimatedMinutes} min)`;
      response += `\n   ${tipo} desde ${dev.priceFrom}`;
      response += '\n';
    });

    response += '\n¿Te gustaría visitar alguno hoy? 🏠';

    return response;
  }

  /**
   * Check if coordinates are within reasonable Zacatecas metro area
   */
  isInZacatecasArea(lat: number, lng: number): boolean {
    // Roughly: Zacatecas metro is around 22.7°N, -102.5°W
    // Accept ~50km radius
    const centerLat = 22.77;
    const centerLng = -102.56;
    const distance = this.calculateDistance(lat, lng, centerLat, centerLng);
    return distance <= 50;
  }
}
