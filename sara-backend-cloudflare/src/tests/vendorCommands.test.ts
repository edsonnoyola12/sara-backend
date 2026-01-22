import { describe, it, expect, beforeEach } from 'vitest';
import { VendorCommandsService, sanitizeNotes } from '../services/vendorCommandsService';

describe('Vendor Commands', () => {
  let vendorService: VendorCommandsService;

  beforeEach(() => {
    vendorService = new VendorCommandsService(null as any);
  });

  describe('sanitizeNotes', () => {
    it('debe eliminar keys numéricos', () => {
      const corrupted = { '0': 'bad', '1': 'data', 'valid': 'good' };
      const result = sanitizeNotes(corrupted);
      expect(result).toEqual({ 'valid': 'good' });
    });

    it('debe retornar objeto vacío si es null', () => {
      expect(sanitizeNotes(null)).toEqual({});
    });

    it('debe retornar objeto vacío si es array', () => {
      expect(sanitizeNotes(['bad', 'data'])).toEqual({});
    });

    it('debe mantener keys válidos', () => {
      const valid = { active_bridge: {}, pending: true };
      const result = sanitizeNotes(valid);
      expect(result).toEqual(valid);
    });
  });

  describe('detectRouteCommand - Citas', () => {
    it('debe detectar "citas"', () => {
      const result = vendorService.detectRouteCommand('citas', 'citas');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorCitasHoy');
    });

    it('debe detectar "mis citas"', () => {
      const result = vendorService.detectRouteCommand('mis citas', 'mis citas');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorCitasHoy');
    });

    it('debe detectar "citas hoy"', () => {
      const result = vendorService.detectRouteCommand('citas hoy', 'citas hoy');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorCitasHoy');
    });
  });

  describe('detectRouteCommand - Leads', () => {
    it('debe detectar "leads"', () => {
      const result = vendorService.detectRouteCommand('leads', 'leads');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorResumenLeads');
    });

    it('debe detectar "mis leads"', () => {
      const result = vendorService.detectRouteCommand('mis leads', 'mis leads');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorResumenLeads');
    });
  });

  describe('detectRouteCommand - Resumen', () => {
    it('debe detectar "hoy"', () => {
      const result = vendorService.detectRouteCommand('hoy', 'hoy');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorResumenHoy');
    });

    it('debe detectar "resumen"', () => {
      const result = vendorService.detectRouteCommand('resumen', 'resumen');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorResumenHoy');
    });
  });

  describe('detectRouteCommand - Ayuda', () => {
    it('debe detectar "ayuda"', () => {
      const result = vendorService.detectRouteCommand('ayuda', 'ayuda');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAyuda');
    });

    it('debe detectar "help"', () => {
      const result = vendorService.detectRouteCommand('help', 'help');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAyuda');
    });

    it('debe detectar "?"', () => {
      const result = vendorService.detectRouteCommand('?', '?');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAyuda');
    });
  });

  describe('detectRouteCommand - Agendar cita', () => {
    it('debe detectar "agendar cita con juan"', () => {
      const result = vendorService.detectRouteCommand('agendar cita con juan mañana 4pm', 'agendar cita con juan mañana 4pm');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAgendarCitaCompleta');
    });

    it('debe detectar "cita con pedro"', () => {
      const result = vendorService.detectRouteCommand('cita con pedro', 'cita con pedro');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAgendarCitaCompleta');
    });
  });

  describe('detectRouteCommand - Reagendar', () => {
    it('debe detectar "reagendar juan mañana 10am"', () => {
      const result = vendorService.detectRouteCommand('reagendar juan mañana 10am', 'reagendar juan mañana 10am');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorReagendarCita');
    });
  });

  describe('detectRouteCommand - Cancelar', () => {
    it('debe detectar "cancelar cita con juan"', () => {
      const result = vendorService.detectRouteCommand('cancelar cita con juan', 'cancelar cita con juan');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorCancelarCita');
    });
  });

  describe('detectRouteCommand - Recursos', () => {
    it('debe detectar "brochure monte verde"', () => {
      const result = vendorService.detectRouteCommand('brochure monte verde', 'brochure monte verde');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorBrochure');
      expect(result.handlerParams?.desarrollo).toBe('monte verde');
    });

    it('debe detectar "ubicacion andes"', () => {
      const result = vendorService.detectRouteCommand('ubicacion andes', 'ubicacion andes');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorUbicacion');
      expect(result.handlerParams?.desarrollo).toBe('andes');
    });

    it('debe detectar "video los encinos"', () => {
      const result = vendorService.detectRouteCommand('video los encinos', 'video los encinos');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorVideo');
      expect(result.handlerParams?.desarrollo).toBe('los encinos');
    });
  });

  describe('detectRouteCommand - Meta', () => {
    it('debe detectar "meta"', () => {
      const result = vendorService.detectRouteCommand('meta', 'meta');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorMetaAvance');
    });

    it('debe detectar "mi meta"', () => {
      const result = vendorService.detectRouteCommand('mi meta', 'mi meta');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorMetaAvance');
    });
  });

  describe('detectRouteCommand - Mover etapa', () => {
    it('debe detectar "juan adelante"', () => {
      const result = vendorService.detectRouteCommand('juan adelante', 'juan adelante');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorMoverEtapa');
    });

    it('debe detectar "pedro atrás"', () => {
      const result = vendorService.detectRouteCommand('pedro atrás', 'pedro atrás');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorMoverEtapa');
    });

    it('debe detectar "maria pasó a negociación"', () => {
      const result = vendorService.detectRouteCommand('maria pasó a negociación', 'maria pasó a negociación');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorMoverEtapa');
    });
  });

  describe('detectRouteCommand - Quien es', () => {
    it('debe detectar "quien es juan"', () => {
      const result = vendorService.detectRouteCommand('quien es juan', 'quien es juan');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorQuienEs');
      expect(result.handlerParams?.nombre).toBe('juan');
    });

    it('debe detectar "quién es maría"', () => {
      const result = vendorService.detectRouteCommand('quién es maría', 'quién es maría');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorQuienEs');
    });
  });

  describe('detectRouteCommand - Briefing', () => {
    it('debe detectar "briefing"', () => {
      const result = vendorService.detectRouteCommand('briefing', 'briefing');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorBriefing');
    });
  });

  describe('detectRouteCommand - Case insensitive', () => {
    it('debe detectar comandos en mayúsculas', () => {
      const result = vendorService.detectRouteCommand('CITAS', 'CITAS');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorCitasHoy');
    });
  });
});
