import { describe, it, expect, beforeEach } from 'vitest';
import { CEOCommandsService } from '../services/ceoCommandsService';

describe('CEO Commands', () => {
  let ceoService: CEOCommandsService;

  beforeEach(() => {
    ceoService = new CEOCommandsService(null as any);
  });

  describe('detectCommand - Comandos básicos', () => {
    it('debe detectar "ayuda"', () => {
      const result = ceoService.detectCommand('ayuda');
      expect(result.action).toBe('send_message');
      expect(result.message).toContain('COMANDOS CEO');
    });

    it('debe detectar "help"', () => {
      const result = ceoService.detectCommand('help');
      expect(result.action).toBe('send_message');
    });

    it('debe detectar "?"', () => {
      const result = ceoService.detectCommand('?');
      expect(result.action).toBe('send_message');
    });
  });

  describe('detectCommand - Reportes', () => {
    it('debe detectar "leads"', () => {
      const result = ceoService.detectCommand('leads');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('reporteLeads');
    });

    it('debe detectar "equipo"', () => {
      const result = ceoService.detectCommand('equipo');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('reporteEquipo');
    });

    it('debe detectar "ventas"', () => {
      const result = ceoService.detectCommand('ventas');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('reporteVentas');
    });

    it('debe detectar "reporte"', () => {
      const result = ceoService.detectCommand('reporte');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('generarReporte');
    });

    it('debe detectar "hoy"', () => {
      const result = ceoService.detectCommand('hoy');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('resumenHoy');
    });
  });

  describe('detectCommand - Citas', () => {
    it('debe detectar "citas"', () => {
      const result = ceoService.detectCommand('citas');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('vendedorCitasHoy');
    });

    it('debe detectar "citas hoy"', () => {
      const result = ceoService.detectCommand('citas hoy');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('vendedorCitasHoy');
    });
  });

  describe('detectCommand - Bridge', () => {
    it('debe detectar "bridge juan"', () => {
      const result = ceoService.detectCommand('bridge juan');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('bridgeLead');
      expect(result.handlerParams?.nombreLead).toBe('juan');
    });

    it('debe detectar "bridge María García"', () => {
      const result = ceoService.detectCommand('bridge María García');
      expect(result.action).toBe('call_handler');
      expect(result.handlerParams?.nombreLead).toBe('maría garcía');
    });

    it('debe detectar "#cerrar"', () => {
      const result = ceoService.detectCommand('#cerrar');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('cerrarBridge');
    });

    it('debe detectar "#fin"', () => {
      const result = ceoService.detectCommand('#fin');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('cerrarBridge');
    });

    it('debe detectar "#mas" para extender bridge', () => {
      const result = ceoService.detectCommand('#mas');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('extenderBridge');
    });
  });

  describe('detectCommand - Mensaje a lead', () => {
    it('debe detectar "mensaje juan"', () => {
      const result = ceoService.detectCommand('mensaje juan');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('mensajeLead');
    });
  });

  describe('detectCommand - Broadcast', () => {
    it('debe detectar "broadcast"', () => {
      const result = ceoService.detectCommand('broadcast');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('iniciarBroadcast');
    });

    it('debe detectar "segmentos"', () => {
      const result = ceoService.detectCommand('segmentos');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('verSegmentos');
    });
  });

  describe('detectCommand - Eventos', () => {
    it('debe detectar "eventos"', () => {
      const result = ceoService.detectCommand('eventos');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('verEventos');
    });
  });

  describe('detectCommand - Recursos', () => {
    it('debe detectar "brochure monte verde"', () => {
      const result = ceoService.detectCommand('brochure monte verde');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('ceoBrochure');
    });

    it('debe detectar "ubicacion andes"', () => {
      const result = ceoService.detectCommand('ubicacion andes');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('ceoUbicacion');
    });

    it('debe detectar "video los encinos"', () => {
      const result = ceoService.detectCommand('video los encinos');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('ceoVideo');
    });
  });

  describe('detectCommand - Funnel', () => {
    it('debe detectar "adelante juan"', () => {
      const result = ceoService.detectCommand('adelante juan');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('ceoMoverLead');
    });

    it('debe detectar "atras pedro"', () => {
      const result = ceoService.detectCommand('atras pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('ceoMoverLead');
    });

    it('debe detectar "quien es maria"', () => {
      const result = ceoService.detectCommand('quien es maria');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('ceoQuienEs');
    });
  });

  describe('detectCommand - Case insensitive', () => {
    it('debe detectar comandos en mayúsculas', () => {
      const result = ceoService.detectCommand('LEADS');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('reporteLeads');
    });

    it('debe detectar bridge en mayúsculas', () => {
      const result = ceoService.detectCommand('BRIDGE juan');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('bridgeLead');
    });
  });
});
