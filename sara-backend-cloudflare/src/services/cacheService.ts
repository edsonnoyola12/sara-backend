// ═══════════════════════════════════════════════════════════════════════════
// CACHE SERVICE - Optimización de Cache con Cloudflare KV
// Intelligent caching layer for improved performance
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  staleWhileRevalidate?: number; // Serve stale while fetching fresh data
  tags?: string[]; // For cache invalidation by tag
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  tags: string[];
  version: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: string;
  totalKeys: number;
  lastReset: string;
}

// Default TTLs for different data types
export const CACHE_TTLS = {
  // Frequently accessed, slow to change
  properties: 600, // 10 minutes
  team_members: 300, // 5 minutes
  developments: 600, // 10 minutes
  bank_rates: 3600, // 1 hour

  // Moderate change frequency
  leads_list: 60, // 1 minute
  pipeline_summary: 120, // 2 minutes
  daily_stats: 180, // 3 minutes

  // Fast changing
  lead_detail: 30, // 30 seconds
  active_bridges: 10, // 10 seconds

  // Session/temporary
  pending_messages: 60, // 1 minute
  conversation_context: 300, // 5 minutes

  // Config/static
  webhooks_config: 300, // 5 minutes
  company_goals: 600, // 10 minutes
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CacheService {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private stats = { hits: 0, misses: 0, lastReset: new Date().toISOString() };
  private version = 1;

  constructor(private kv: KVNamespace | null) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);

    // Try memory cache first
    const memoryEntry = this.memoryCache.get(fullKey);
    if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
      this.stats.hits++;
      return memoryEntry.data as T;
    }

    // Try KV cache
    if (this.kv) {
      try {
        const kvData = await this.kv.get(fullKey, 'json');
        if (kvData) {
          const entry = kvData as CacheEntry<T>;
          if (entry.expiresAt > Date.now() && entry.version === this.version) {
            this.stats.hits++;
            this.memoryCache.set(fullKey, entry);
            return entry.data;
          }
        }
      } catch (err) {
        console.error('Cache get error:', err);
      }
    }

    this.stats.misses++;
    return null;
  }

  async set<T>(key: string, data: T, config: CacheConfig): Promise<void> {
    const fullKey = this.getFullKey(key);
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data,
      cachedAt: now,
      expiresAt: now + (config.ttl * 1000),
      tags: config.tags || [],
      version: this.version
    };

    this.memoryCache.set(fullKey, entry);

    if (this.kv) {
      try {
        await this.kv.put(fullKey, JSON.stringify(entry), {
          expirationTtl: config.ttl + (config.staleWhileRevalidate || 0)
        });
      } catch (err) {
        console.error('Cache set error:', err);
      }
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    this.memoryCache.delete(fullKey);
    if (this.kv) {
      try {
        await this.kv.delete(fullKey);
      } catch (err) {
        console.error('Cache delete error:', err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVENIENCE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, config: CacheConfig): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fetcher();
    await this.set(key, data, config);
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  async invalidateByTag(tag: string): Promise<number> {
    let invalidated = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.tags.includes(tag)) {
        this.memoryCache.delete(key);
        invalidated++;
      }
    }
    return invalidated;
  }

  invalidateAll(): void {
    this.memoryCache.clear();
    this.version++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIFIC HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  async getProperties(fetcher: () => Promise<any[]>): Promise<any[]> {
    return this.getOrFetch('properties:all', fetcher, { ttl: CACHE_TTLS.properties, tags: ['properties'] });
  }

  async getTeamMembers(fetcher: () => Promise<any[]>): Promise<any[]> {
    return this.getOrFetch('team_members:all', fetcher, { ttl: CACHE_TTLS.team_members, tags: ['team'] });
  }

  async getPipelineSummary(days: number, fetcher: () => Promise<any>): Promise<any> {
    return this.getOrFetch(`pipeline:summary:${days}`, fetcher, { ttl: CACHE_TTLS.pipeline_summary, tags: ['pipeline'] });
  }

  async getLeadDetail(leadId: string, fetcher: () => Promise<any>): Promise<any> {
    return this.getOrFetch(`lead:${leadId}`, fetcher, { ttl: CACHE_TTLS.lead_detail, tags: ['leads'] });
  }

  async getDailyStats(date: string, fetcher: () => Promise<any>): Promise<any> {
    return this.getOrFetch(`stats:daily:${date}`, fetcher, { ttl: CACHE_TTLS.daily_stats, tags: ['stats'] });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════════

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%',
      totalKeys: this.memoryCache.size,
      lastReset: this.stats.lastReset
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, lastReset: new Date().toISOString() };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private getFullKey(key: string): string {
    return `cache:v${this.version}:${key}`;
  }

  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt < now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  getMemoryUsage(): number {
    let size = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      size += key.length * 2;
      size += JSON.stringify(entry).length * 2;
    }
    return size;
  }

  formatStatsForWhatsApp(): string {
    const stats = this.getStats();
    const memUsageKB = (this.getMemoryUsage() / 1024).toFixed(1);
    let msg = '📊 *ESTADÍSTICAS DE CACHE*\n\n';
    msg += '*Rendimiento:*\n';
    msg += `• Hits: ${stats.hits}\n`;
    msg += `• Misses: ${stats.misses}\n`;
    msg += `• Hit Rate: ${stats.hitRate}\n\n`;
    msg += '*Memoria:*\n';
    msg += `• Keys: ${stats.totalKeys}\n`;
    msg += `• Uso: ${memUsageKB} KB`;
    return msg;
  }
}

// Singleton
let cacheInstance: CacheService | null = null;

export function getCacheService(kv?: KVNamespace): CacheService {
  if (!cacheInstance) cacheInstance = new CacheService(kv || null);
  return cacheInstance;
}

export function resetCacheService(): void {
  cacheInstance = null;
}
