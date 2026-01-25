// Tests para RetryService
import { describe, it, expect, vi } from 'vitest';
import { retry, isRetryableError, RetryPresets } from '../services/retryService';

describe('RetryService', () => {
  describe('isRetryableError', () => {
    it('debe detectar errores de red como retriables', () => {
      expect(isRetryableError({ message: 'fetch failed' })).toBe(true);
      expect(isRetryableError({ message: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ message: 'socket hang up' })).toBe(true);
      expect(isRetryableError({ message: 'network error' })).toBe(true);
    });

    it('debe detectar status codes retriables', () => {
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 502 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 522 })).toBe(true); // Cloudflare
    });

    it('NO debe reintentar errores del cliente', () => {
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 403 })).toBe(false);
      expect(isRetryableError({ status: 404 })).toBe(false);
    });

    it('debe detectar error 1016 de Cloudflare', () => {
      expect(isRetryableError({ message: 'error code: 1016' })).toBe(true);
    });
  });

  describe('retry()', () => {
    it('debe retornar el resultado si tiene éxito en el primer intento', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('debe reintentar si falla con error retriable', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ message: 'network error' })
        .mockRejectedValueOnce({ message: 'network error' })
        .mockResolvedValue('success');

      const result = await retry(fn, {
        maxRetries: 3,
        baseDelayMs: 10 // Reducir delay para test rápido
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('debe lanzar error después de agotar reintentos', async () => {
      const fn = vi.fn().mockRejectedValue({ message: 'network error' });

      await expect(retry(fn, { maxRetries: 2, baseDelayMs: 10 }))
        .rejects.toMatchObject({ message: 'network error' });

      expect(fn).toHaveBeenCalledTimes(3); // 1 inicial + 2 reintentos
    });

    it('NO debe reintentar errores no retriables', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 404, message: 'Not found' });

      await expect(retry(fn, { maxRetries: 3, baseDelayMs: 10 }))
        .rejects.toMatchObject({ status: 404 });

      expect(fn).toHaveBeenCalledTimes(1); // Solo 1 intento
    });

    it('debe llamar onRetry callback en cada reintento', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce({ message: 'network error' })
        .mockResolvedValue('success');

      await retry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        onRetry
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'network error' }),
        1, // attempt
        expect.any(Number) // delayMs
      );
    });
  });

  describe('RetryPresets', () => {
    it('debe tener presets para cada servicio', () => {
      expect(RetryPresets.supabase).toBeDefined();
      expect(RetryPresets.anthropic).toBeDefined();
      expect(RetryPresets.meta).toBeDefined();
      expect(RetryPresets.google).toBeDefined();
      expect(RetryPresets.veo).toBeDefined();
    });

    it('presets deben tener configuración válida', () => {
      Object.values(RetryPresets).forEach(preset => {
        expect(preset.maxRetries).toBeGreaterThan(0);
        expect(preset.baseDelayMs).toBeGreaterThan(0);
        expect(preset.maxDelayMs).toBeGreaterThan(preset.baseDelayMs!);
      });
    });
  });
});
