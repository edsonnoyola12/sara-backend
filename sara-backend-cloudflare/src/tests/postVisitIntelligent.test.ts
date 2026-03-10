import { describe, it, expect } from 'vitest';
import { generarMensajePostVisita } from '../crons/nurturing';

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP POST-VISITA INTELIGENTE - Tests
// Verifica que los mensajes se personalizan según vendor rating + tiempo
// ═══════════════════════════════════════════════════════════════════════════

describe('generarMensajePostVisita', () => {
  const nombre = 'Juan';
  const desarrollo = 'Monte Verde';

  // ─────────────────────────────────────────────────────────────
  // HOT (rating 1) - Muy interesado
  // ─────────────────────────────────────────────────────────────
  describe('HOT leads (rating 1)', () => {
    it('should use urgency language for hot leads within 3 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 2, 1);
      expect(msg).toContain('🔥');
      expect(msg).toContain('encantó');
      expect(msg).toContain('Cotización personalizada');
      expect(msg).toContain(nombre);
      expect(msg).toContain(desarrollo);
    });

    it('should push financing for hot leads at 4-7 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 5, 1);
      expect(msg).toContain('financiamiento');
      expect(msg).toContain('cotización');
    });

    it('should create scarcity for hot leads at 8+ days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 10, 1);
      expect(msg).toContain('disponibles');
      expect(msg).toContain('agendo');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // INTERESTED (rating 2) - Interesado
  // ─────────────────────────────────────────────────────────────
  describe('INTERESTED leads (rating 2)', () => {
    it('should offer info materials within 3 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 2, 2);
      expect(msg).toContain('Fichas técnicas');
      expect(msg).toContain('precios');
    });

    it('should offer comparison at 4-7 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 6, 2);
      expect(msg).toContain('decisión');
      expect(msg).toContain('Comparar');
    });

    it('should suggest alternatives at 8+ days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 12, 2);
      expect(msg).toContain('otros desarrollos');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // LUKEWARM (rating 3) - Tibio
  // ─────────────────────────────────────────────────────────────
  describe('LUKEWARM leads (rating 3)', () => {
    it('should address doubts within 5 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 3, 3);
      expect(msg).toContain('dudas');
      expect(msg).toContain('normal');
    });

    it('should offer alternatives at 6+ days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 8, 3);
      expect(msg).toContain('cotización');
      expect(msg).toContain('otro modelo');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // COLD (rating 4) - No le convenció
  // ─────────────────────────────────────────────────────────────
  describe('COLD leads (rating 4)', () => {
    it('should ask what they want within 5 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 3, 4);
      expect(msg).toContain('lo que buscabas');
      expect(msg).toContain('importante para ti');
    });

    it('should suggest other developments at 6+ days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 10, 4);
      expect(msg).toContain('otros desarrollos');
      expect(msg).toContain('presupuesto');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // NO RATING (0) - Sin feedback del vendedor
  // ─────────────────────────────────────────────────────────────
  describe('NO RATING leads (rating 0)', () => {
    it('should use generic message within 3 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 2, 0);
      expect(msg).toContain('¿Qué te pareció');
      expect(msg).toContain('Las casas que viste');
    });

    it('should use generic message at 4-7 days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 5, 0);
      expect(msg).toContain('decisión');
      expect(msg).toContain('Segunda visita');
    });

    it('should use generic message at 8+ days', () => {
      const msg = generarMensajePostVisita(nombre, desarrollo, 10, 0);
      expect(msg).toContain('encontraste lo que buscabas');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // ALL MESSAGES INCLUDE NAME AND DEVELOPMENT
  // ─────────────────────────────────────────────────────────────
  describe('all messages include key info', () => {
    const ratings = [0, 1, 2, 3, 4];
    const days = [2, 5, 10];

    for (const rating of ratings) {
      for (const day of days) {
        it(`should include name and development (rating=${rating}, days=${day})`, () => {
          const msg = generarMensajePostVisita('María', 'Los Olivos', day, rating);
          expect(msg).toContain('María');
          expect(msg).toContain('Los Olivos');
          expect(msg.length).toBeGreaterThan(50);
          expect(msg.length).toBeLessThan(600); // WhatsApp message length limit
        });
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  // DIFFERENT RATINGS PRODUCE DIFFERENT MESSAGES
  // ─────────────────────────────────────────────────────────────
  describe('differentiation', () => {
    it('should produce different messages for hot vs cold at same time', () => {
      const hot = generarMensajePostVisita(nombre, desarrollo, 3, 1);
      const cold = generarMensajePostVisita(nombre, desarrollo, 3, 4);
      expect(hot).not.toBe(cold);
    });

    it('should produce different messages for same rating at different times', () => {
      const early = generarMensajePostVisita(nombre, desarrollo, 2, 2);
      const late = generarMensajePostVisita(nombre, desarrollo, 10, 2);
      expect(early).not.toBe(late);
    });
  });
});
