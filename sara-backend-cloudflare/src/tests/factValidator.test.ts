// ═══════════════════════════════════════════════════════════════════════════
// FACT VALIDATOR TESTS — Surgical corrections, not full replacements
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { validateFacts } from '../services/factValidator';

describe('FactValidator', () => {
  describe('Alberca (no development has pool)', () => {
    it('should correct when any development claims to have alberca', () => {
      const input = 'Monte Verde tiene alberca y áreas verdes.';
      const { corrections } = validateFacts(input);
      expect(corrections).toContain('alberca');
    });

    it('should correct when Andes claims to have alberca', () => {
      const input = '¡Sí! Priv. Andes tiene alberca para todos los residentes.';
      const { corrections } = validateFacts(input);
      expect(corrections).toContain('alberca');
    });

    it('should NOT modify when response already denies alberca', () => {
      const input = 'Por el momento ninguno de nuestros desarrollos cuenta con alberca.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).not.toContain('alberca');
      expect(response).toBe(input);
    });

    it('should leave response alone if no pool mention', () => {
      const input = 'Monte Verde es un desarrollo con áreas verdes.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toHaveLength(0);
      expect(response).toBe(input);
    });
  });

  describe('Renta (we only sell)', () => {
    it('should correct "sí rentamos"', () => {
      const input = 'Sí, también rentamos casas en Zacatecas.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('renta');
      expect(response).toContain('solo vendemos');
      expect(response).not.toMatch(/rentamos/i);
    });

    it('should correct "tenemos opciones de renta"', () => {
      const input = 'Tenemos opciones de renta y venta.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('renta');
    });

    it('should correct "casas en renta"', () => {
      const input = '¡Claro! Tenemos casas en renta desde $5,000.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('renta');
    });

    it('should NOT modify when response correctly denies renta', () => {
      const input = 'No manejamos rentas, solo venta de casas.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).not.toContain('renta');
      expect(response).toBe(input);
    });
  });

  describe('Mascotas (disabled — handled by aiConversationService override)', () => {
    it('should NOT trigger mascotas corrector (disabled)', () => {
      const input = 'Todos los desarrollos aceptan mascotas.';
      const { corrections } = validateFacts(input);
      expect(corrections).not.toContain('mascotas');
    });
  });

  describe('Tasas de interés (never specify rates)', () => {
    it('should remove specific rate percentages', () => {
      const input = 'Las tasas de interés del 8.5% son muy competitivas.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('tasas_interes');
      expect(response).not.toMatch(/8\.5%/);
      expect(response).toContain('varían según el banco');
    });

    it('should remove range rates', () => {
      const input = 'Las tasas desde 7% hasta 12% dependen de tu perfil.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('tasas_interes');
    });

    it('should NOT modify when no rates mentioned', () => {
      const input = 'El crédito Infonavit es una excelente opción.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).not.toContain('tasas_interes');
    });
  });

  describe('Locales comerciales (we only sell houses)', () => {
    it('should correct "sí tenemos locales comerciales"', () => {
      const input = 'Sí, tenemos locales comerciales disponibles.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('locales_comerciales');
      expect(response).toContain('casas habitación');
    });

    it('should NOT modify when correctly denying locales', () => {
      const input = 'No manejamos locales comerciales.';
      const { corrections } = validateFacts(input);
      expect(corrections).not.toContain('locales_comerciales');
    });
  });

  describe('Nogal/Citadella (we DO have it)', () => {
    it('should correct denial of Nogal/Citadella', () => {
      const input = 'No tenemos el Nogal en nuestro catálogo.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('nogal_citadella');
      expect(response).toContain('sí tenemos Citadella del Nogal');
    });

    it('should correct "no conozco Citadella"', () => {
      const input = 'No tengo información de Citadella, pero tenemos otros desarrollos.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('nogal_citadella');
    });

    it('should NOT modify when Nogal is correctly described', () => {
      const input = 'Citadella del Nogal tiene terrenos en Villa Campelo y Villa Galiano.';
      const { corrections } = validateFacts(input);
      expect(corrections).not.toContain('nogal_citadella');
    });
  });

  describe('Identity (SARA is AI)', () => {
    it('should correct "soy una persona real"', () => {
      const input = 'Soy una persona real, no un robot.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('identidad');
      expect(response).toContain('SARA');
    });

    it('should correct "soy un asesor"', () => {
      const input = 'Soy un asesor de Grupo Santa Rita.';
      const { response, corrections } = validateFacts(input);
      expect(corrections).toContain('identidad');
    });

    it('should NOT modify correct identity', () => {
      const input = 'Soy SARA, tu asistente virtual.';
      const { corrections } = validateFacts(input);
      expect(corrections).not.toContain('identidad');
    });
  });

  describe('Multiple corrections', () => {
    it('should apply multiple corrections in one pass', () => {
      const input = 'Sí, rentamos casas. La tasa de interés del 9% es competitiva.';
      const { corrections } = validateFacts(input);
      expect(corrections.length).toBeGreaterThanOrEqual(2);
    });

    it('should not crash on empty response', () => {
      const { response, corrections } = validateFacts('');
      expect(response).toBe('');
      expect(corrections).toHaveLength(0);
    });

    it('should preserve response when no facts are wrong', () => {
      const input = '¡Hola! Me da gusto saludarte. ¿En qué te puedo ayudar hoy?';
      const { response, corrections } = validateFacts(input);
      expect(response).toBe(input);
      expect(corrections).toHaveLength(0);
    });
  });
});
