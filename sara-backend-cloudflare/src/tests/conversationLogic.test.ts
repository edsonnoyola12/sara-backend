import { describe, it, expect } from 'vitest';
import {
  shouldSendOnlyGPS,
  decideResourceAction,
  shouldIncludeGPSInResources,
  generateGPSMessage,
  isBridgeActive,
  isBridgeCommand,
  shouldForwardToLead,
  AIAnalysis,
  BridgeState
} from '../utils/conversationLogic';

// ============================================================
// GPS TESTS - Crítico: Lead pide ubicación → SOLO GPS
// ============================================================
describe('GPS Logic', () => {
  describe('shouldSendOnlyGPS', () => {
    it('debe retornar TRUE cuando pide GPS sin video', () => {
      const analysis: AIAnalysis = {
        send_gps: true,
        send_video_desarrollo: false
      };
      expect(shouldSendOnlyGPS(analysis)).toBe(true);
    });

    it('debe retornar TRUE cuando pide GPS y video es undefined', () => {
      const analysis: AIAnalysis = {
        send_gps: true
        // send_video_desarrollo no definido
      };
      expect(shouldSendOnlyGPS(analysis)).toBe(true);
    });

    it('debe retornar FALSE cuando pide GPS Y video', () => {
      const analysis: AIAnalysis = {
        send_gps: true,
        send_video_desarrollo: true
      };
      expect(shouldSendOnlyGPS(analysis)).toBe(false);
    });

    it('debe retornar FALSE cuando NO pide GPS', () => {
      const analysis: AIAnalysis = {
        send_gps: false,
        send_video_desarrollo: true
      };
      expect(shouldSendOnlyGPS(analysis)).toBe(false);
    });

    it('debe retornar FALSE cuando todo es undefined', () => {
      const analysis: AIAnalysis = {};
      expect(shouldSendOnlyGPS(analysis)).toBe(false);
    });
  });

  describe('generateGPSMessage', () => {
    it('debe incluir recordatorio de cita cuando tiene cita', () => {
      const msg = generateGPSMessage(
        'Monte Verde',
        'https://maps.app.goo.gl/xxx',
        'Juan',
        true,
        '25/01/2026',
        '10:00'
      );

      expect(msg).toContain('Monte Verde');
      expect(msg).toContain('maps.app.goo.gl');
      expect(msg).toContain('Juan, recuerda');
      expect(msg).toContain('25/01/2026');
      expect(msg).toContain('10:00');
    });

    it('debe ofrecer agendar visita cuando NO tiene cita', () => {
      const msg = generateGPSMessage(
        'Los Encinos',
        'https://maps.google.com/xxx',
        'María',
        false
      );

      expect(msg).toContain('Los Encinos');
      expect(msg).toContain('María, ¿te');
      expect(msg).toContain('agendar una visita');
      expect(msg).not.toContain('recuerda');
    });

    it('debe funcionar sin nombre del lead', () => {
      const msg = generateGPSMessage(
        'Andes',
        'https://maps.app.goo.gl/yyy',
        '',
        false
      );

      expect(msg).toContain('Andes');
      expect(msg).toContain('¿Te gustaría');
      expect(msg).not.toContain(', ¿te');
    });
  });
});

// ============================================================
// RESOURCES TESTS - Crítico: Cuándo enviar recursos completos
// ============================================================
describe('Resource Logic', () => {
  describe('decideResourceAction', () => {
    it('debe enviar SOLO GPS cuando pide ubicación sin video', () => {
      const analysis: AIAnalysis = { send_gps: true };
      const result = decideResourceAction(
        analysis,
        false, // resourcesAlreadySent
        null,  // resourcesSentForDev
        'Monte Verde', // currentDev
        false, // pidioRecursosExplicito
        false  // enFlujoCreditoIncompleto
      );

      expect(result.sendOnlyGPS).toBe(true);
      expect(result.sendAllResources).toBe(false);
      expect(result.skipResources).toBe(true);
    });

    it('debe enviar TODOS los recursos cuando pide video', () => {
      const analysis: AIAnalysis = { send_video_desarrollo: true };
      const result = decideResourceAction(
        analysis,
        false,
        null,
        'Los Encinos',
        false,
        false
      );

      expect(result.sendOnlyGPS).toBe(false);
      expect(result.sendAllResources).toBe(true);
      expect(result.skipResources).toBe(false);
    });

    it('debe enviar recursos cuando pidió explícitamente', () => {
      const analysis: AIAnalysis = {};
      const result = decideResourceAction(
        analysis,
        true, // ya se enviaron antes
        'Los Encinos',
        'Los Encinos',
        true, // pidió explícitamente
        false
      );

      expect(result.sendAllResources).toBe(true);
    });

    it('NO debe enviar recursos si ya se enviaron para mismo desarrollo', () => {
      const analysis: AIAnalysis = { send_video_desarrollo: true };
      const result = decideResourceAction(
        analysis,
        true,
        'Monte Verde',
        'Monte Verde',
        false, // no pidió explícitamente
        false
      );

      expect(result.sendAllResources).toBe(false);
      expect(result.skipResources).toBe(true);
      expect(result.reason).toContain('ya enviados');
    });

    it('NO debe enviar recursos en flujo de crédito incompleto', () => {
      const analysis: AIAnalysis = { send_video_desarrollo: true };
      const result = decideResourceAction(
        analysis,
        false,
        null,
        'Andes',
        false,
        true // en flujo de crédito
      );

      expect(result.sendAllResources).toBe(false);
      expect(result.skipResources).toBe(true);
    });

    it('debe enviar recursos en flujo crédito SI pidió explícitamente', () => {
      const analysis: AIAnalysis = {};
      const result = decideResourceAction(
        analysis,
        false,
        null,
        'Andes',
        true, // pidió explícitamente
        true  // en flujo de crédito
      );

      // Primero verifica GPS solo
      expect(result.sendOnlyGPS).toBe(false);
      // Como pidió explícitamente, debe enviar
      expect(result.sendAllResources).toBe(true);
    });
  });

  describe('shouldIncludeGPSInResources', () => {
    it('debe incluir GPS cuando send_gps es true', () => {
      expect(shouldIncludeGPSInResources({ send_gps: true })).toBe(true);
    });

    it('NO debe incluir GPS cuando send_gps es false', () => {
      expect(shouldIncludeGPSInResources({ send_gps: false })).toBe(false);
    });

    it('NO debe incluir GPS cuando send_gps no está definido', () => {
      expect(shouldIncludeGPSInResources({})).toBe(false);
    });
  });
});

// ============================================================
// BRIDGE TESTS - Crítico: Vendedor ↔ Lead chat directo
// ============================================================
describe('Bridge Logic', () => {
  describe('isBridgeActive', () => {
    it('debe retornar FALSE cuando bridge es null', () => {
      expect(isBridgeActive(null)).toBe(false);
    });

    it('debe retornar FALSE cuando isActive es false', () => {
      const bridge: BridgeState = {
        isActive: false,
        expiresAt: new Date(Date.now() + 60000).toISOString()
      };
      expect(isBridgeActive(bridge)).toBe(false);
    });

    it('debe retornar FALSE cuando está expirado', () => {
      const bridge: BridgeState = {
        isActive: true,
        expiresAt: new Date(Date.now() - 60000).toISOString() // pasado
      };
      expect(isBridgeActive(bridge)).toBe(false);
    });

    it('debe retornar TRUE cuando está activo y no expirado', () => {
      const bridge: BridgeState = {
        isActive: true,
        expiresAt: new Date(Date.now() + 300000).toISOString() // 5 min futuro
      };
      expect(isBridgeActive(bridge)).toBe(true);
    });
  });

  describe('isBridgeCommand', () => {
    it('debe detectar "bridge juan" como comando', () => {
      expect(isBridgeCommand('bridge juan')).toBe(true);
    });

    it('debe detectar "chat con lead" como comando', () => {
      expect(isBridgeCommand('chat con lead')).toBe(true);
    });

    it('debe detectar "terminar" como comando', () => {
      expect(isBridgeCommand('terminar')).toBe(true);
    });

    it('debe detectar "cerrar chat" como comando', () => {
      expect(isBridgeCommand('cerrar chat')).toBe(true);
    });

    it('NO debe detectar mensaje normal como comando', () => {
      expect(isBridgeCommand('Hola, buen día')).toBe(false);
    });

    it('NO debe detectar pregunta normal como comando', () => {
      expect(isBridgeCommand('¿A qué hora puede venir?')).toBe(false);
    });
  });

  describe('shouldForwardToLead', () => {
    it('debe reenviar mensaje normal con bridge activo', () => {
      const result = shouldForwardToLead('Hola, ¿sigue interesado?', true);
      expect(result.forward).toBe(true);
    });

    it('NO debe reenviar si bridge no está activo', () => {
      const result = shouldForwardToLead('Hola', false);
      expect(result.forward).toBe(false);
      expect(result.reason).toContain('no activo');
    });

    it('NO debe reenviar comandos de bridge', () => {
      const result = shouldForwardToLead('bridge otro lead', true);
      expect(result.forward).toBe(false);
      expect(result.reason).toContain('comando');
    });

    it('NO debe reenviar "terminar" como mensaje', () => {
      const result = shouldForwardToLead('terminar', true);
      expect(result.forward).toBe(false);
    });
  });
});

// ============================================================
// INTEGRATION SCENARIOS - Casos reales que fallaron antes
// ============================================================
describe('Escenarios Reales (Regresiones)', () => {
  describe('Caso: Lead pide solo ubicación de Miravalle', () => {
    it('debe enviar SOLO GPS, no video ni brochure', () => {
      // Escenario: Lead dice "Dame la ubicación de Miravalle"
      // IA responde con send_gps: true, send_video_desarrollo: false/undefined
      const analysis: AIAnalysis = {
        send_gps: true,
        send_video_desarrollo: false,
        extracted_data: { desarrollo: 'Miravalle' }
      };

      const soloGPS = shouldSendOnlyGPS(analysis);
      expect(soloGPS).toBe(true);

      const decision = decideResourceAction(
        analysis,
        false, null, 'Miravalle', false, false
      );
      expect(decision.sendOnlyGPS).toBe(true);
      expect(decision.sendAllResources).toBe(false);
    });
  });

  describe('Caso: Lead ya recibió recursos, pide ubicación', () => {
    it('debe enviar GPS aunque ya tenga recursos', () => {
      // Escenario: Lead ya tiene video de Monte Verde
      // Ahora pregunta "¿Dónde queda exactamente?"
      const analysis: AIAnalysis = {
        send_gps: true
      };

      // Aunque resources_sent = true, GPS debe enviarse
      const soloGPS = shouldSendOnlyGPS(analysis);
      expect(soloGPS).toBe(true);
    });
  });

  describe('Caso: Vendedor en bridge escribe comando', () => {
    it('NO debe reenviar "bridge otro" al lead actual', () => {
      // Escenario: Vendedor está en bridge con Lead A
      // Escribe "bridge lead B" para cambiar
      // Este mensaje NO debe llegar a Lead A
      const result = shouldForwardToLead('bridge maria garcia', true);
      expect(result.forward).toBe(false);
    });
  });

  describe('Caso: Lead pide info completa de desarrollo', () => {
    it('debe enviar video, brochure, matterport Y GPS si lo pidió', () => {
      // Escenario: "Quiero información de Los Encinos"
      const analysis: AIAnalysis = {
        send_video_desarrollo: true,
        send_gps: true,
        send_brochure: true
      };

      const soloGPS = shouldSendOnlyGPS(analysis);
      expect(soloGPS).toBe(false); // NO es solo GPS

      const decision = decideResourceAction(
        analysis,
        false, null, 'Los Encinos', false, false
      );
      expect(decision.sendAllResources).toBe(true);

      // GPS debe incluirse en los recursos
      expect(shouldIncludeGPSInResources(analysis)).toBe(true);
    });
  });
});
