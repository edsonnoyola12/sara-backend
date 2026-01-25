// ═══════════════════════════════════════════════════════════════════════════
// RETRY SERVICE - Reintentos automáticos con exponential backoff
// ═══════════════════════════════════════════════════════════════════════════
// Uso:
//   const result = await retry(() => fetchData(), { maxRetries: 3 });
//   const result = await retryFetch(url, options);
// ═══════════════════════════════════════════════════════════════════════════

export interface RetryOptions {
  maxRetries?: number;        // Número máximo de reintentos (default: 3)
  baseDelayMs?: number;       // Delay base en ms (default: 1000)
  maxDelayMs?: number;        // Delay máximo en ms (default: 10000)
  backoffMultiplier?: number; // Multiplicador exponential (default: 2)
  retryOn?: (error: any, attempt: number) => boolean; // Función para decidir si reintentar
  onRetry?: (error: any, attempt: number, delayMs: number) => void; // Callback en cada reintento
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryOn' | 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// Errores que SÍ deben reintentarse (problemas de red/temporales)
const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'socket hang up',
  'network error',
  'fetch failed',
  'Failed to fetch',
];

// Status codes que SÍ deben reintentarse
const RETRYABLE_STATUS_CODES = [
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
  522, // Connection Timed Out (Cloudflare)
  524, // A Timeout Occurred (Cloudflare)
];

// Status codes que NO deben reintentarse (errores del cliente)
const NON_RETRYABLE_STATUS_CODES = [
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  422, // Unprocessable Entity
];

/**
 * Determina si un error es retriable
 */
export function isRetryableError(error: any): boolean {
  // Error de red
  if (error?.cause?.code && RETRYABLE_ERRORS.some(e => error.cause.code.includes(e))) {
    return true;
  }

  // Mensaje de error
  const errorMessage = error?.message?.toLowerCase() || '';
  if (RETRYABLE_ERRORS.some(e => errorMessage.includes(e.toLowerCase()))) {
    return true;
  }

  // Response con status code retriable
  if (error?.status && RETRYABLE_STATUS_CODES.includes(error.status)) {
    return true;
  }

  // Response object
  if (error?.response?.status && RETRYABLE_STATUS_CODES.includes(error.response.status)) {
    return true;
  }

  // Error code 1016 de Cloudflare (origin DNS error - temporal)
  if (errorMessage.includes('1016') || errorMessage.includes('origin dns')) {
    return true;
  }

  return false;
}

/**
 * Calcula el delay con exponential backoff + jitter
 */
function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'retryOn' | 'onRetry'>>): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  // Agregar jitter (±25%) para evitar thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ejecuta una función con reintentos automáticos
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Si es el último intento, lanzar el error
      if (attempt > opts.maxRetries) {
        throw error;
      }

      // Verificar si debemos reintentar
      const shouldRetry = opts.retryOn
        ? opts.retryOn(error, attempt)
        : isRetryableError(error);

      if (!shouldRetry) {
        throw error;
      }

      // Calcular delay y esperar
      const delayMs = calculateDelay(attempt, opts);

      // Callback de retry (para logging)
      if (opts.onRetry) {
        opts.onRetry(error, attempt, delayMs);
      } else {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: `Retry attempt ${attempt}/${opts.maxRetries}`,
          error: error?.message || String(error),
          delayMs,
        }));
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Wrapper de fetch con retry automático
 */
export async function retryFetch(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const maxRetries = retryOptions.maxRetries || 3;

  return retry(async () => {
    const response = await fetch(url, options);

    // Si el status code indica error retriable, lanzar para reintentar
    if (RETRYABLE_STATUS_CODES.includes(response.status)) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      (error as any).response = response;
      throw error;
    }

    return response;
  }, {
    ...retryOptions,
    onRetry: (error, attempt, delayMs) => {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `Fetch retry ${attempt}/${maxRetries}`,
        url: url.substring(0, 100), // Truncar URL para logs
        error: error?.message || String(error),
        status: error?.status,
        delayMs,
      }));
    }
  });
}

/**
 * Helpers específicos para cada servicio externo
 */
export const RetryPresets = {
  // Supabase: reintentos rápidos
  supabase: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  } as RetryOptions,

  // Claude/Anthropic: más paciencia (API puede estar ocupada)
  anthropic: {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
  } as RetryOptions,

  // Meta/WhatsApp: reintentos moderados
  meta: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  } as RetryOptions,

  // Google Calendar: similar a Supabase
  google: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
  } as RetryOptions,

  // Veo API: más paciencia (generación de video)
  veo: {
    maxRetries: 2,
    baseDelayMs: 3000,
    maxDelayMs: 20000,
    backoffMultiplier: 2,
  } as RetryOptions,
};

export default { retry, retryFetch, isRetryableError, RetryPresets };
