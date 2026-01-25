// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS SERVICE - Control de funcionalidades sin deploy
// ═══════════════════════════════════════════════════════════════════════════
// Usa Cloudflare KV para almacenar flags que pueden cambiar en tiempo real
// Sin necesidad de re-deploy para activar/desactivar funciones
// ═══════════════════════════════════════════════════════════════════════════

export interface FeatureFlags {
  // Funcionalidades de IA
  ai_responses_enabled: boolean;        // Respuestas automáticas de IA
  ai_credit_flow_enabled: boolean;      // Flujo de crédito hipotecario
  ai_multilang_enabled: boolean;        // Soporte multi-idioma

  // Notificaciones
  slack_notifications_enabled: boolean; // Alertas a Slack
  email_reports_enabled: boolean;       // Reportes por email
  sentry_enabled: boolean;              // Error tracking

  // Features de WhatsApp
  audio_transcription_enabled: boolean; // Transcripción de audios
  auto_followups_enabled: boolean;      // Follow-ups automáticos
  broadcast_enabled: boolean;           // Mensajes masivos

  // Operaciones
  outside_hours_responses: boolean;     // Respuestas fuera de horario
  smart_caching_enabled: boolean;       // Caché inteligente
  audit_log_enabled: boolean;           // Bitácora de acciones

  // A/B Testing
  ab_test_greeting: 'A' | 'B' | 'off';  // Prueba de saludo
  ab_test_cta: 'A' | 'B' | 'off';       // Prueba de call-to-action

  // Límites
  rate_limit_per_minute: number;        // Requests por minuto
  max_ai_tokens: number;                // Tokens máximos para IA
}

// Valores por defecto (si no hay nada en KV)
const DEFAULT_FLAGS: FeatureFlags = {
  ai_responses_enabled: true,
  ai_credit_flow_enabled: true,
  ai_multilang_enabled: true,

  slack_notifications_enabled: true,
  email_reports_enabled: false,
  sentry_enabled: true,

  audio_transcription_enabled: false,
  auto_followups_enabled: true,
  broadcast_enabled: true,

  outside_hours_responses: true,
  smart_caching_enabled: true,
  audit_log_enabled: true,

  ab_test_greeting: 'off',
  ab_test_cta: 'off',

  rate_limit_per_minute: 100,
  max_ai_tokens: 2000
};

const FLAGS_KEY = 'feature_flags';
const FLAGS_CACHE_TTL = 60; // Cache local de 60 segundos

export class FeatureFlagsService {
  private kv: KVNamespace | undefined;
  private cachedFlags: FeatureFlags | null = null;
  private cacheTime: number = 0;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Obtiene todos los feature flags
   */
  async getFlags(): Promise<FeatureFlags> {
    // Usar cache local si es reciente
    const now = Date.now();
    if (this.cachedFlags && (now - this.cacheTime) < FLAGS_CACHE_TTL * 1000) {
      return this.cachedFlags;
    }

    if (!this.kv) {
      console.warn('⚠️ KV no disponible, usando flags por defecto');
      return DEFAULT_FLAGS;
    }

    try {
      const stored = await this.kv.get(FLAGS_KEY, 'json');
      if (stored) {
        // Merge con defaults para nuevos flags
        this.cachedFlags = { ...DEFAULT_FLAGS, ...(stored as Partial<FeatureFlags>) };
        this.cacheTime = now;
        return this.cachedFlags;
      }
    } catch (e) {
      console.error('Error leyendo feature flags:', e);
    }

    return DEFAULT_FLAGS;
  }

  /**
   * Verifica si una feature está habilitada
   */
  async isEnabled(flag: keyof FeatureFlags): Promise<boolean> {
    const flags = await this.getFlags();
    const value = flags[flag];

    // Para flags booleanos
    if (typeof value === 'boolean') {
      return value;
    }

    // Para A/B tests, 'off' significa deshabilitado
    if (value === 'off') {
      return false;
    }

    // Para números, > 0 significa habilitado
    if (typeof value === 'number') {
      return value > 0;
    }

    return true;
  }

  /**
   * Obtiene el valor de un flag específico
   */
  async getFlag<K extends keyof FeatureFlags>(flag: K): Promise<FeatureFlags[K]> {
    const flags = await this.getFlags();
    return flags[flag];
  }

  /**
   * Actualiza un flag específico
   */
  async setFlag<K extends keyof FeatureFlags>(flag: K, value: FeatureFlags[K]): Promise<void> {
    if (!this.kv) {
      console.error('❌ KV no disponible, no se puede guardar flag');
      return;
    }

    const flags = await this.getFlags();
    flags[flag] = value;

    await this.kv.put(FLAGS_KEY, JSON.stringify(flags));
    this.cachedFlags = flags;
    this.cacheTime = Date.now();

    console.log(`🚩 Flag actualizado: ${flag} = ${value}`);
  }

  /**
   * Actualiza múltiples flags a la vez
   */
  async setFlags(updates: Partial<FeatureFlags>): Promise<void> {
    if (!this.kv) {
      console.error('❌ KV no disponible, no se pueden guardar flags');
      return;
    }

    const flags = await this.getFlags();
    const newFlags = { ...flags, ...updates };

    await this.kv.put(FLAGS_KEY, JSON.stringify(newFlags));
    this.cachedFlags = newFlags;
    this.cacheTime = Date.now();

    console.log(`🚩 Flags actualizados:`, Object.keys(updates));
  }

  /**
   * Resetea todos los flags a valores por defecto
   */
  async resetToDefaults(): Promise<void> {
    if (!this.kv) {
      console.error('❌ KV no disponible');
      return;
    }

    await this.kv.put(FLAGS_KEY, JSON.stringify(DEFAULT_FLAGS));
    this.cachedFlags = DEFAULT_FLAGS;
    this.cacheTime = Date.now();

    console.log('🚩 Flags reseteados a valores por defecto');
  }

  /**
   * Obtiene variante de A/B test para un usuario
   * Usa hash del teléfono para asignación consistente
   */
  async getABVariant(testName: 'ab_test_greeting' | 'ab_test_cta', phone: string): Promise<'A' | 'B' | null> {
    const flags = await this.getFlags();
    const testValue = flags[testName];

    if (testValue === 'off') {
      return null;
    }

    // Si está forzado a una variante
    if (testValue === 'A' || testValue === 'B') {
      return testValue;
    }

    // Asignar variante basada en hash del teléfono (50/50)
    const hash = this.simpleHash(phone);
    return hash % 2 === 0 ? 'A' : 'B';
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createFeatureFlags(kv?: KVNamespace): FeatureFlagsService {
  return new FeatureFlagsService(kv);
}
