import { describe, it, expect } from 'vitest';
import {
  parseFechaEspanol,
  parseFechaISO,
  parseHoraISO,
  formatearFechaParaUsuario,
  formatearHoraParaUsuario
} from '../handlers/dateParser';

describe('dateParser', () => {
  describe('parseFechaEspanol', () => {
    it('debe parsear "mañana a las 10am"', () => {
      const result = parseFechaEspanol('mañana a las 10am');
      expect(result).not.toBeNull();
      expect(result?.hora).toBe('10:00');
    });

    it('debe parsear "hoy a las 3pm"', () => {
      const result = parseFechaEspanol('hoy a las 3pm');
      expect(result).not.toBeNull();
      expect(result?.hora).toBe('15:00');
    });

    it('debe detectar tipo cita cuando menciona "visita"', () => {
      const result = parseFechaEspanol('visita mañana a las 10');
      expect(result).not.toBeNull();
      expect(result?.tipo).toBe('cita');
    });

    it('debe detectar tipo llamada cuando menciona "llamar"', () => {
      const result = parseFechaEspanol('llamar mañana a las 10');
      expect(result).not.toBeNull();
      expect(result?.tipo).toBe('llamada');
    });
  });

  describe('parseHoraISO', () => {
    it('debe convertir "10am" a formato ISO', () => {
      const result = parseHoraISO('10am');
      expect(result).toBe('10:00:00');
    });

    it('debe convertir "3pm" a formato ISO', () => {
      const result = parseHoraISO('3pm');
      expect(result).toBe('15:00:00');
    });

    it('debe convertir "14:30" a formato ISO', () => {
      const result = parseHoraISO('14:30');
      expect(result).toBe('14:30:00');
    });
  });

  describe('formatearHoraParaUsuario', () => {
    it('debe formatear hora militar a 12h', () => {
      expect(formatearHoraParaUsuario('14:00')).toBe('2:00 PM');
      expect(formatearHoraParaUsuario('09:30')).toBe('9:30 AM');
      expect(formatearHoraParaUsuario('12:00')).toBe('12:00 PM');
    });
  });
});
