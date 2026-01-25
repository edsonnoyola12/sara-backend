/**
 * CacheService - Servicio de cache usando Cloudflare KV
 *
 * Reduce llamadas a Supabase cacheando datos que cambian poco:
 * - team_members: TTL 5 min (rara vez cambian)
 * - properties: TTL 10 min (catálogo)
 * - developments: TTL 10 min (catálogo)
 * - lead:{id}: TTL 1 min (datos calientes)
 */

// TTL en segundos
const TTL = {
  TEAM_MEMBERS: 300,      // 5 minutos
  PROPERTIES: 600,        // 10 minutos
  DEVELOPMENTS: 600,      // 10 minutos
  LEAD: 60,               // 1 minuto
  LEAD_BY_PHONE: 60,      // 1 minuto
};

// Keys
const KEYS = {
  TEAM_MEMBERS: 'team_members_all',
  TEAM_MEMBERS_ACTIVE: 'team_members_active',
  PROPERTIES: 'properties_all',
  DEVELOPMENTS: 'developments_all',
  LEAD: (id: string) => `lead:${id}`,
  LEAD_BY_PHONE: (phone: string) => `lead_phone:${phone.replace(/\D/g, '').slice(-10)}`,
  TEAM_MEMBER_BY_PHONE: (phone: string) => `team_phone:${phone.replace(/\D/g, '').slice(-10)}`,
};

export class CacheService {
  private kv: KVNamespace | null;
  private stats = { hits: 0, misses: 0 };

  constructor(kv?: KVNamespace) {
    this.kv = kv || null;
  }

  /**
   * Verifica si el cache está disponible
   */
  isAvailable(): boolean {
    return this.kv !== null;
  }

  /**
   * Obtiene estadísticas del cache
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Obtiene un valor del cache
   */
  private async get<T>(key: string): Promise<T | null> {
    if (!this.kv) return null;

    try {
      const value = await this.kv.get(key, 'json');
      if (value) {
        this.stats.hits++;
        return value as T;
      }
      this.stats.misses++;
      return null;
    } catch (e) {
      console.error('⚠️ Cache get error:', e);
      return null;
    }
  }

  /**
   * Guarda un valor en el cache
   */
  private async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.kv) return;

    try {
      await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
    } catch (e) {
      console.error('⚠️ Cache set error:', e);
    }
  }

  /**
   * Invalida una key del cache
   */
  async invalidate(key: string): Promise<void> {
    if (!this.kv) return;

    try {
      await this.kv.delete(key);
    } catch (e) {
      console.error('⚠️ Cache invalidate error:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEAM MEMBERS
  // ═══════════════════════════════════════════════════════════════

  async getTeamMembers(fetchFn: () => Promise<any[]>): Promise<any[]> {
    const cached = await this.get<any[]>(KEYS.TEAM_MEMBERS);
    if (cached) {
      console.log('📦 Cache HIT: team_members');
      return cached;
    }

    console.log('🔍 Cache MISS: team_members - fetching from DB');
    const data = await fetchFn();
    await this.set(KEYS.TEAM_MEMBERS, data, TTL.TEAM_MEMBERS);
    return data;
  }

  async getActiveTeamMembers(fetchFn: () => Promise<any[]>): Promise<any[]> {
    const cached = await this.get<any[]>(KEYS.TEAM_MEMBERS_ACTIVE);
    if (cached) {
      console.log('📦 Cache HIT: team_members_active');
      return cached;
    }

    console.log('🔍 Cache MISS: team_members_active - fetching from DB');
    const data = await fetchFn();
    await this.set(KEYS.TEAM_MEMBERS_ACTIVE, data, TTL.TEAM_MEMBERS);
    return data;
  }

  async getTeamMemberByPhone(phone: string, fetchFn: () => Promise<any | null>): Promise<any | null> {
    const key = KEYS.TEAM_MEMBER_BY_PHONE(phone);
    const cached = await this.get<any>(key);
    if (cached) {
      console.log('📦 Cache HIT: team_member_phone');
      return cached;
    }

    console.log('🔍 Cache MISS: team_member_phone - fetching from DB');
    const data = await fetchFn();
    if (data) {
      await this.set(key, data, TTL.TEAM_MEMBERS);
    }
    return data;
  }

  async invalidateTeamMembers(): Promise<void> {
    await this.invalidate(KEYS.TEAM_MEMBERS);
    await this.invalidate(KEYS.TEAM_MEMBERS_ACTIVE);
    console.log('🗑️ Cache invalidated: team_members');
  }

  // ═══════════════════════════════════════════════════════════════
  // PROPERTIES & DEVELOPMENTS
  // ═══════════════════════════════════════════════════════════════

  async getProperties(fetchFn: () => Promise<any[]>): Promise<any[]> {
    const cached = await this.get<any[]>(KEYS.PROPERTIES);
    if (cached) {
      console.log('📦 Cache HIT: properties');
      return cached;
    }

    console.log('🔍 Cache MISS: properties - fetching from DB');
    const data = await fetchFn();
    await this.set(KEYS.PROPERTIES, data, TTL.PROPERTIES);
    return data;
  }

  async getDevelopments(fetchFn: () => Promise<any[]>): Promise<any[]> {
    const cached = await this.get<any[]>(KEYS.DEVELOPMENTS);
    if (cached) {
      console.log('📦 Cache HIT: developments');
      return cached;
    }

    console.log('🔍 Cache MISS: developments - fetching from DB');
    const data = await fetchFn();
    await this.set(KEYS.DEVELOPMENTS, data, TTL.DEVELOPMENTS);
    return data;
  }

  async invalidateProperties(): Promise<void> {
    await this.invalidate(KEYS.PROPERTIES);
    await this.invalidate(KEYS.DEVELOPMENTS);
    console.log('🗑️ Cache invalidated: properties & developments');
  }

  // ═══════════════════════════════════════════════════════════════
  // LEADS
  // ═══════════════════════════════════════════════════════════════

  async getLead(id: string, fetchFn: () => Promise<any | null>): Promise<any | null> {
    const key = KEYS.LEAD(id);
    const cached = await this.get<any>(key);
    if (cached) {
      console.log('📦 Cache HIT: lead', id.slice(0, 8));
      return cached;
    }

    console.log('🔍 Cache MISS: lead - fetching from DB');
    const data = await fetchFn();
    if (data) {
      await this.set(key, data, TTL.LEAD);
    }
    return data;
  }

  async getLeadByPhone(phone: string, fetchFn: () => Promise<any | null>): Promise<any | null> {
    const key = KEYS.LEAD_BY_PHONE(phone);
    const cached = await this.get<any>(key);
    if (cached) {
      console.log('📦 Cache HIT: lead_phone');
      return cached;
    }

    console.log('🔍 Cache MISS: lead_phone - fetching from DB');
    const data = await fetchFn();
    if (data) {
      await this.set(key, data, TTL.LEAD);
      // También cachear por ID
      if (data.id) {
        await this.set(KEYS.LEAD(data.id), data, TTL.LEAD);
      }
    }
    return data;
  }

  async invalidateLead(id: string, phone?: string): Promise<void> {
    await this.invalidate(KEYS.LEAD(id));
    if (phone) {
      await this.invalidate(KEYS.LEAD_BY_PHONE(phone));
    }
    console.log('🗑️ Cache invalidated: lead', id.slice(0, 8));
  }

  /**
   * Actualiza el lead en cache después de un update
   */
  async updateLeadCache(lead: any): Promise<void> {
    if (!lead?.id) return;

    await this.set(KEYS.LEAD(lead.id), lead, TTL.LEAD);
    if (lead.phone) {
      await this.set(KEYS.LEAD_BY_PHONE(lead.phone), lead, TTL.LEAD);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SMART CACHING - Funciones avanzadas
  // ═══════════════════════════════════════════════════════════════

  /**
   * Precalienta el cache con datos frecuentemente usados
   */
  async warmup(supabase: any): Promise<{ success: boolean; cached: string[] }> {
    const cached: string[] = [];

    try {
      // 1. Team members
      const { data: teamMembers } = await supabase.client
        .from('team_members')
        .select('*');
      if (teamMembers) {
        await this.set(KEYS.TEAM_MEMBERS, teamMembers, TTL.TEAM_MEMBERS);
        cached.push('team_members');

        const active = teamMembers.filter((m: any) => m.active);
        await this.set(KEYS.TEAM_MEMBERS_ACTIVE, active, TTL.TEAM_MEMBERS);
        cached.push('team_members_active');
      }

      // 2. Properties
      const { data: properties } = await supabase.client
        .from('properties')
        .select('*')
        .eq('available', true);
      if (properties) {
        await this.set(KEYS.PROPERTIES, properties, TTL.PROPERTIES);
        cached.push('properties');
      }

      // 3. Developments
      const { data: developments } = await supabase.client
        .from('developments')
        .select('*')
        .eq('active', true);
      if (developments) {
        await this.set(KEYS.DEVELOPMENTS, developments, TTL.DEVELOPMENTS);
        cached.push('developments');
      }

      console.log(`🔥 Cache warmup completo: ${cached.join(', ')}`);
      return { success: true, cached };
    } catch (e) {
      console.error('Error en cache warmup:', e);
      return { success: false, cached };
    }
  }

  /**
   * Wrapper genérico para cachear cualquier query
   */
  async wrap<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetchFn();
    if (data !== null && data !== undefined) {
      await this.set(key, data, ttlSeconds);
    }
    return data;
  }

  /**
   * Obtiene múltiples keys en paralelo
   */
  async getMultiple<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();

    await Promise.all(
      keys.map(async (key) => {
        const value = await this.get<T>(key);
        results.set(key, value);
      })
    );

    return results;
  }

  /**
   * Invalida todas las keys que coinciden con un patrón
   * Nota: KV no soporta patrones, pero podemos invalidar keys conocidas
   */
  async invalidateAll(): Promise<void> {
    await Promise.all([
      this.invalidate(KEYS.TEAM_MEMBERS),
      this.invalidate(KEYS.TEAM_MEMBERS_ACTIVE),
      this.invalidate(KEYS.PROPERTIES),
      this.invalidate(KEYS.DEVELOPMENTS)
    ]);
    console.log('🗑️ Cache completamente invalidado');
  }

  /**
   * Obtiene información de uso del cache
   */
  getCacheInfo(): {
    stats: { hits: number; misses: number; hitRate: string };
    ttl: typeof TTL;
    available: boolean;
  } {
    return {
      stats: this.getStats(),
      ttl: TTL,
      available: this.isAvailable()
    };
  }
}

// Export singleton para uso global
export const cacheKeys = KEYS;
export const cacheTTL = TTL;
