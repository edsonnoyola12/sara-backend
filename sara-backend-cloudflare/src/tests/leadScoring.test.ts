import { describe, it, expect } from 'vitest';
import { LeadScoringService } from '../services/leadScoring';

describe('LeadScoringService', () => {
  const scoring = new LeadScoringService();

  describe('calculateFunnelScore', () => {
    it('lead nuevo debe ser COLD (score 15-25)', () => {
      const result = scoring.calculateFunnelScore({ status: 'new' });
      expect(result.temperature).toBe('COLD');
      expect(result.score).toBeGreaterThanOrEqual(15);
      expect(result.score).toBeLessThanOrEqual(25);
    });

    it('lead con cita (scheduled) debe ser WARM (score 50-65)', () => {
      const result = scoring.calculateFunnelScore({ status: 'scheduled' });
      expect(result.temperature).toBe('WARM');
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThanOrEqual(65);
    });

    it('lead que visitó debe ser HOT (score 75-85)', () => {
      const result = scoring.calculateFunnelScore({ status: 'visited' });
      expect(result.temperature).toBe('HOT');
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.score).toBeLessThanOrEqual(85);
    });

    it('lead cerrado debe tener score 100', () => {
      const result = scoring.calculateFunnelScore({ status: 'closed' });
      expect(result.score).toBe(100);
      expect(result.temperature).toBe('HOT');
    });

    it('debe dar bonus por tener nombre', () => {
      const sinNombre = scoring.calculateFunnelScore({ status: 'new' });
      const conNombre = scoring.calculateFunnelScore({ status: 'new', name: 'Juan Pérez' });
      expect(conNombre.score).toBeGreaterThan(sinNombre.score);
    });

    it('debe dar bonus por interés en desarrollo', () => {
      const sinInteres = scoring.calculateFunnelScore({ status: 'new' });
      const conInteres = scoring.calculateFunnelScore({ status: 'new', property_interest: 'Los Encinos' });
      expect(conInteres.score).toBeGreaterThan(sinInteres.score);
    });

    it('debe dar bonus por necesitar crédito', () => {
      const sinCredito = scoring.calculateFunnelScore({ status: 'new' });
      const conCredito = scoring.calculateFunnelScore({ status: 'new', needs_mortgage: true });
      expect(conCredito.score).toBeGreaterThan(sinCredito.score);
    });

    it('debe promover a scheduled si tiene cita activa', () => {
      const result = scoring.calculateFunnelScore(
        { status: 'contacted' },
        true // hasActiveAppointment
      );
      expect(result.status).toBe('scheduled');
      expect(result.statusChanged).toBe(true);
    });
  });

  describe('getTemperature', () => {
    it('score >= 70 debe ser HOT', () => {
      expect(scoring.getTemperature(70)).toBe('HOT');
      expect(scoring.getTemperature(85)).toBe('HOT');
      expect(scoring.getTemperature(100)).toBe('HOT');
    });

    it('score 40-69 debe ser WARM', () => {
      expect(scoring.getTemperature(40)).toBe('WARM');
      expect(scoring.getTemperature(55)).toBe('WARM');
      expect(scoring.getTemperature(69)).toBe('WARM');
    });

    it('score < 40 debe ser COLD', () => {
      expect(scoring.getTemperature(0)).toBe('COLD');
      expect(scoring.getTemperature(20)).toBe('COLD');
      expect(scoring.getTemperature(39)).toBe('COLD');
    });
  });
});
