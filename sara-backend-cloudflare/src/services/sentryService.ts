// ═══════════════════════════════════════════════════════════════════════════
// SENTRY SERVICE - Error tracking para Cloudflare Workers
// ═══════════════════════════════════════════════════════════════════════════
// Usa toucan-js, un cliente Sentry ligero optimizado para Workers
// Docs: https://github.com/robertcepa/toucan-js
// ═══════════════════════════════════════════════════════════════════════════

import { Toucan } from 'toucan-js';

export interface SentryEnv {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
}

export class SentryService {
  private sentry: Toucan | null = null;
  private enabled: boolean = false;

  constructor(
    request: Request,
    env: SentryEnv,
    ctx: ExecutionContext
  ) {
    if (env.SENTRY_DSN) {
      this.sentry = new Toucan({
        dsn: env.SENTRY_DSN,
        context: ctx,
        request: request,
        environment: env.ENVIRONMENT || 'production',
        release: 'sara-backend@2.0.0',
        // Configuración adicional
        beforeSend: (event) => {
          // No enviar errores en desarrollo
          if (env.ENVIRONMENT === 'development') {
            return null;
          }
          return event;
        },
      });
      this.enabled = true;
    }
  }

  /**
   * Captura una excepción y la envía a Sentry
   */
  captureException(error: Error | unknown, context?: Record<string, any>): void {
    if (!this.sentry || !this.enabled) {
      console.error('Sentry not enabled, error:', error);
      return;
    }

    if (context) {
      this.sentry.setExtras(context);
    }

    if (error instanceof Error) {
      this.sentry.captureException(error);
    } else {
      this.sentry.captureException(new Error(String(error)));
    }
  }

  /**
   * Captura un mensaje informativo
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.sentry || !this.enabled) {
      console.log(`Sentry message (${level}):`, message);
      return;
    }

    this.sentry.captureMessage(message, level);
  }

  /**
   * Establece información del usuario (lead o team member)
   */
  setUser(user: { id?: string; phone?: string; name?: string; type?: 'lead' | 'team_member' | 'unknown' }): void {
    if (!this.sentry) return;
    this.sentry.setUser(user);
  }

  /**
   * Agrega contexto adicional (ej: lead_id, property, etc.)
   */
  setContext(name: string, context: Record<string, any>): void {
    if (!this.sentry) return;
    this.sentry.setExtra(name, context);
  }

  /**
   * Agrega un tag para filtrar en Sentry
   */
  setTag(key: string, value: string): void {
    if (!this.sentry) return;
    this.sentry.setTag(key, value);
  }

  /**
   * Agrega un breadcrumb (rastro de navegación/acciones)
   */
  addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: 'debug' | 'info' | 'warning' | 'error';
    data?: Record<string, any>;
  }): void {
    if (!this.sentry) return;
    this.sentry.addBreadcrumb({
      message: breadcrumb.message,
      category: breadcrumb.category || 'custom',
      level: breadcrumb.level || 'info',
      data: breadcrumb.data,
      timestamp: Date.now() / 1000,
    });
  }

  /**
   * Wrapper para ejecutar código con manejo de errores automático
   */
  async wrapAsync<T>(
    fn: () => Promise<T>,
    context?: { operation: string; [key: string]: any }
  ): Promise<T> {
    try {
      if (context?.operation) {
        this.addBreadcrumb({
          message: `Starting: ${context.operation}`,
          category: 'operation',
          level: 'info',
        });
      }
      return await fn();
    } catch (error) {
      this.captureException(error, context);
      throw error;
    }
  }

  /**
   * Verifica si Sentry está habilitado
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Helper para crear una instancia de Sentry en el handler
 */
export function initSentry(
  request: Request,
  env: SentryEnv,
  ctx: ExecutionContext
): SentryService {
  return new SentryService(request, env, ctx);
}
