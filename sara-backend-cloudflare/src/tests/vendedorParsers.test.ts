// src/tests/vendedorParsers.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseReagendarParams,
  parseAgendarParams,
  convertirHoraISO
} from '../utils/vendedorParsers';

describe('vendedorParsers', () => {

  // ═══════════════════════════════════════════════════════════════
  // parseReagendarParams - CRÍTICO: Bug #17 AM/PM parsing
  // ═══════════════════════════════════════════════════════════════
  describe('parseReagendarParams', () => {

    // Casos básicos
    it('debe parsear "reagendar juan mañana 4pm"', () => {
      const result = parseReagendarParams('reagendar juan mañana 4pm');
      expect(result.dia).toBe('mañana');
      expect(result.hora).toBe('4');
      expect(result.ampm).toBe('pm');
    });

    it('debe parsear "reagendar ana lunes 10am"', () => {
      const result = parseReagendarParams('reagendar ana lunes 10am');
      expect(result.dia).toBe('lunes');
      expect(result.hora).toBe('10');
      expect(result.ampm).toBe('am');
    });

    // Bug #17: AM/PM con espacio
    it('debe parsear "reagendar cita con cumpleañero mañana a la 10 am" (espacio entre número y am)', () => {
      const result = parseReagendarParams('reagendar cita con cumpleañero mañana a la 10 am');
      expect(result.dia).toBe('mañana');
      expect(result.hora).toBe('10');
      expect(result.ampm).toBe('am'); // CRÍTICO: antes fallaba, devolvía undefined
    });

    it('debe parsear "reagendar cita con cumpleañero mañana a la 10 pm" (espacio entre número y pm)', () => {
      const result = parseReagendarParams('reagendar cita con cumpleañero mañana a la 10 pm');
      expect(result.dia).toBe('mañana');
      expect(result.hora).toBe('10');
      expect(result.ampm).toBe('pm');
    });

    // Más casos con espacio
    it('debe parsear "mañana 3 pm"', () => {
      const result = parseReagendarParams('mañana 3 pm');
      expect(result.dia).toBe('mañana');
      expect(result.hora).toBe('3');
      expect(result.ampm).toBe('pm');
    });

    it('debe parsear "viernes 9 am"', () => {
      const result = parseReagendarParams('viernes 9 am');
      expect(result.dia).toBe('viernes');
      expect(result.hora).toBe('9');
      expect(result.ampm).toBe('am');
    });

    // Días de la semana
    it('debe parsear todos los días de la semana', () => {
      const dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
      for (const dia of dias) {
        const result = parseReagendarParams(`${dia} 10am`);
        expect(result.dia).toBe(dia);
      }
    });

    // Sin am/pm (debe ser undefined, handler usa default)
    it('debe devolver ampm undefined si no se especifica', () => {
      const result = parseReagendarParams('mañana 10');
      expect(result.dia).toBe('mañana');
      expect(result.hora).toBe('10');
      expect(result.ampm).toBeUndefined();
    });

    // Mayúsculas/minúsculas
    it('debe manejar AM/PM en mayúsculas', () => {
      const result = parseReagendarParams('mañana 10AM');
      expect(result.ampm).toBe('am');
    });

    it('debe manejar PM en mayúsculas', () => {
      const result = parseReagendarParams('mañana 10PM');
      expect(result.ampm).toBe('pm');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // convertirHoraISO - CRÍTICO: Bug #19 timezone
  // ═══════════════════════════════════════════════════════════════
  describe('convertirHoraISO', () => {

    // AM
    it('debe convertir 10 am a 10:00:00', () => {
      expect(convertirHoraISO('10', 'am')).toBe('10:00:00');
    });

    it('debe convertir 9 am a 09:00:00', () => {
      expect(convertirHoraISO('9', 'am')).toBe('09:00:00');
    });

    it('debe convertir 12 am a 00:00:00 (medianoche)', () => {
      expect(convertirHoraISO('12', 'am')).toBe('00:00:00');
    });

    // PM
    it('debe convertir 4 pm a 16:00:00', () => {
      expect(convertirHoraISO('4', 'pm')).toBe('16:00:00');
    });

    it('debe convertir 10 pm a 22:00:00', () => {
      expect(convertirHoraISO('10', 'pm')).toBe('22:00:00');
    });

    it('debe convertir 12 pm a 12:00:00 (mediodía)', () => {
      expect(convertirHoraISO('12', 'pm')).toBe('12:00:00');
    });

    // Bug #17 específico: 10 am NO debe ser 22:00
    it('CRÍTICO: 10 am debe ser 10:00:00, NO 22:00:00', () => {
      const result = convertirHoraISO('10', 'am');
      expect(result).toBe('10:00:00');
      expect(result).not.toBe('22:00:00'); // Este era el bug
    });

    // Sin am/pm (undefined)
    it('debe mantener la hora si no hay am/pm', () => {
      expect(convertirHoraISO('10', undefined)).toBe('10:00:00');
      expect(convertirHoraISO('14', undefined)).toBe('14:00:00');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // parseAgendarParams
  // ═══════════════════════════════════════════════════════════════
  describe('parseAgendarParams', () => {

    it('debe parsear "agendar cita con juan mañana 4pm"', () => {
      const result = parseAgendarParams('agendar cita con juan mañana 4pm');
      expect(result.nombreLead).toBe('juan');
      expect(result.dia).toBe('mañana');
      expect(result.hora).toBe('4');
      expect(result.ampm).toBe('pm');
    });

    it('debe parsear "agendar cita pedro lunes 10am"', () => {
      const result = parseAgendarParams('agendar cita pedro lunes 10am');
      expect(result.nombreLead).toBe('pedro');
      expect(result.dia).toBe('lunes');
      expect(result.hora).toBe('10');
      expect(result.ampm).toBe('am');
    });

    it('debe parsear "agendar cita con maría garcía mañana a las 3 pm"', () => {
      const result = parseAgendarParams('agendar cita con maría garcía mañana a las 3 pm');
      expect(result.nombreLead).toBe('maría garcía');
      expect(result.dia).toBe('mañana');
      expect(result.hora).toBe('3');
      expect(result.ampm).toBe('pm');
    });

    // Bug #17 también aplica aquí
    it('debe manejar espacio entre número y am/pm', () => {
      const result = parseAgendarParams('agendar cita con juan mañana 10 am');
      expect(result.ampm).toBe('am');
    });
  });
});
