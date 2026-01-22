import { describe, it, expect, beforeEach } from 'vitest';
import { AsesorCommandsService } from '../services/asesorCommandsService';

describe('Asesor Commands', () => {
  let asesorService: AsesorCommandsService;

  beforeEach(() => {
    asesorService = new AsesorCommandsService(null as any);
  });

  describe('detectCommand - Ayuda', () => {
    it('debe detectar "ayuda"', () => {
      const result = asesorService.detectCommand('ayuda', 'ayuda', 'Pedro');
      expect(result.action).toBe('send_message');
      expect(result.message).toBeTruthy();
    });

    it('debe detectar "help"', () => {
      const result = asesorService.detectCommand('help', 'help', 'Pedro');
      expect(result.action).toBe('send_message');
    });

    it('debe detectar "?"', () => {
      const result = asesorService.detectCommand('?', '?', 'Pedro');
      expect(result.action).toBe('send_message');
    });

    it('debe detectar "comandos"', () => {
      const result = asesorService.detectCommand('comandos', 'comandos', 'Pedro');
      expect(result.action).toBe('send_message');
    });
  });

  describe('detectCommand - Leads', () => {
    it('debe detectar "leads"', () => {
      const result = asesorService.detectCommand('leads', 'leads', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorMisLeads');
    });

    it('debe detectar "mis leads"', () => {
      const result = asesorService.detectCommand('mis leads', 'mis leads', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorMisLeads');
    });

    it('debe detectar "clientes"', () => {
      const result = asesorService.detectCommand('clientes', 'clientes', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorMisLeads');
    });
  });

  describe('detectCommand - Status', () => {
    it('debe detectar "status juan"', () => {
      const result = asesorService.detectCommand('status juan', 'status juan', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorStatusLead');
      expect(result.handlerParams?.query).toBe('juan');
    });

    it('debe detectar "ver maria"', () => {
      const result = asesorService.detectCommand('ver maria', 'ver maria', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorStatusLead');
    });

    it('debe detectar "info pedro"', () => {
      const result = asesorService.detectCommand('info pedro', 'info pedro', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorStatusLead');
    });
  });

  describe('detectCommand - Documentos', () => {
    it('debe detectar "docs juan"', () => {
      const result = asesorService.detectCommand('docs juan', 'docs juan', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorPedirDocs');
      expect(result.handlerParams?.query).toBe('juan');
    });

    it('debe detectar "documentos maria"', () => {
      const result = asesorService.detectCommand('documentos maria', 'documentos maria', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorPedirDocs');
    });

    it('debe detectar "pedir docs pedro"', () => {
      const result = asesorService.detectCommand('pedir docs pedro', 'pedir docs pedro', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorPedirDocs');
    });
  });

  describe('detectCommand - Preaprobado', () => {
    it('debe detectar "preaprobado juan"', () => {
      const result = asesorService.detectCommand('preaprobado juan', 'preaprobado juan', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorPreaprobado');
    });

    it('debe detectar "aprobado maria"', () => {
      const result = asesorService.detectCommand('aprobado maria', 'aprobado maria', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorPreaprobado');
    });
  });

  describe('detectCommand - Rechazado', () => {
    it('debe detectar "rechazado juan historial crediticio"', () => {
      const result = asesorService.detectCommand('rechazado juan historial crediticio', 'rechazado juan historial crediticio', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorRechazado');
    });
  });

  describe('detectCommand - Enviar mensaje', () => {
    it('debe detectar "dile juan que necesito sus documentos"', () => {
      const result = asesorService.detectCommand('dile juan que necesito sus documentos', 'dile juan que necesito sus documentos', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorEnviarMensaje');
    });

    it('debe detectar "mensaje juan por favor envía tus docs"', () => {
      const result = asesorService.detectCommand('mensaje juan por favor envía tus docs', 'mensaje juan por favor envía tus docs', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorEnviarMensaje');
    });
  });

  describe('detectCommand - Teléfono', () => {
    it('debe detectar "llamar juan"', () => {
      const result = asesorService.detectCommand('llamar juan', 'llamar juan', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorTelefonoLead');
    });

    it('debe detectar "telefono maria"', () => {
      const result = asesorService.detectCommand('telefono maria', 'telefono maria', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorTelefonoLead');
    });

    it('debe detectar "tel pedro"', () => {
      const result = asesorService.detectCommand('tel pedro', 'tel pedro', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorTelefonoLead');
    });
  });

  describe('detectCommand - Mover etapa', () => {
    it('debe detectar "adelante juan"', () => {
      const result = asesorService.detectCommand('adelante juan', 'adelante juan', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorMoverLead');
    });

    it('debe detectar "atras maria"', () => {
      const result = asesorService.detectCommand('atras maria', 'atras maria', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorMoverLead');
    });

    it('debe detectar "contactado pedro"', () => {
      const result = asesorService.detectCommand('contactado pedro', 'contactado pedro', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorMarcarContactado');
    });
  });

  describe('detectCommand - Citas', () => {
    it('debe detectar "hoy"', () => {
      const result = asesorService.detectCommand('hoy', 'hoy', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorCitasHoy');
    });

    it('debe detectar "semana"', () => {
      const result = asesorService.detectCommand('semana', 'semana', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorCitasSemana');
    });
  });

  describe('detectCommand - Reporte', () => {
    it('debe detectar "reporte"', () => {
      const result = asesorService.detectCommand('reporte', 'reporte', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorReporte');
    });

    it('debe detectar "estadisticas"', () => {
      const result = asesorService.detectCommand('estadisticas', 'estadisticas', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorReporte');
    });
  });

  describe('detectCommand - Disponibilidad', () => {
    it('debe detectar "on"', () => {
      const result = asesorService.detectCommand('on', 'on', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorDisponibilidad');
    });

    it('debe detectar "off"', () => {
      const result = asesorService.detectCommand('off', 'off', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorDisponibilidad');
    });
  });

  describe('detectCommand - Case insensitive', () => {
    it('debe detectar comandos en mayúsculas', () => {
      const result = asesorService.detectCommand('LEADS', 'LEADS', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorMisLeads');
    });

    it('debe detectar comandos mixtos', () => {
      const result = asesorService.detectCommand('DoCs JuAn', 'DoCs JuAn', 'Pedro');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('asesorPedirDocs');
    });
  });
});
