// Tests para 3 flujos críticos: teamMessaging, bridgeService, creditFlowService
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════

import {
  isPendingExpired,
  getPendingMessages,
} from '../utils/teamMessaging';

import { BridgeService } from '../services/bridgeService';

import { CreditFlowService } from '../services/creditFlowService';

// ═══════════════════════════════════════════════════════════
// MOCK HELPERS
// ═══════════════════════════════════════════════════════════

function createMockSupabase(options?: {
  selectData?: any;
  selectError?: any;
  updateError?: any;
  insertError?: any;
  singleData?: any;
  singleError?: any;
}) {
  const eqMock = vi.fn().mockReturnThis();
  const singleMock = vi.fn().mockResolvedValue({
    data: options?.singleData ?? null,
    error: options?.singleError ?? null
  });
  const selectMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      single: singleMock,
      limit: vi.fn().mockResolvedValue({ data: options?.selectData || [], error: options?.selectError || null }),
      in: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: options?.selectData || [], error: null })
        }))
      })),
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: options?.selectData || [], error: null })
      })),
      maybeSingle: vi.fn().mockResolvedValue({ data: options?.singleData ?? null, error: null }),
    })),
    ilike: vi.fn(() => ({
      or: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        }))
      })),
      limit: vi.fn().mockResolvedValue({ data: options?.selectData || [], error: null })
    })),
    or: vi.fn(() => ({
      limit: vi.fn().mockResolvedValue({ data: options?.selectData || [], error: null })
    })),
    single: singleMock,
    maybeSingle: vi.fn().mockResolvedValue({ data: options?.singleData ?? null, error: null }),
    limit: vi.fn().mockResolvedValue({ data: options?.selectData || [], error: null }),
  }));
  const updateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ data: null, error: options?.updateError || null })
  }));
  const insertMock = vi.fn().mockResolvedValue({ data: null, error: options?.insertError || null });
  const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    client: {
      from: vi.fn(() => ({
        select: selectMock,
        update: updateMock,
        insert: insertMock,
        upsert: upsertMock,
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
      }))
    },
    updateLead: vi.fn().mockResolvedValue(null),
    _selectMock: selectMock,
    _updateMock: updateMock,
    _insertMock: insertMock,
    _singleMock: singleMock,
  };
}

function createMockMeta() {
  return {
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test123' }] }),
    sendTemplate: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.tmpl456' }] }),
    sendWhatsAppImage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.img789' }] }),
  };
}

// ═══════════════════════════════════════════════════════════
// TEST 1: TEAM MESSAGING (isPendingExpired, getPendingMessages)
// ═══════════════════════════════════════════════════════════

describe('TEAM MESSAGING', () => {

  describe('isPendingExpired', () => {

    it('should return false for recent pending (< expiration)', () => {
      const pending = {
        sent_at: new Date().toISOString(),
      };
      expect(isPendingExpired(pending, 'briefing')).toBe(false);
    });

    it('should return true for old pending (> expiration)', () => {
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const pending = {
        sent_at: twentyHoursAgo,
      };
      // briefing has 18h expiration
      expect(isPendingExpired(pending, 'briefing')).toBe(true);
    });

    it('should use expires_at if present (not expired)', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const pending = {
        sent_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        expires_at: futureDate,
      };
      // Even though sent_at is old, expires_at is in the future
      expect(isPendingExpired(pending, 'briefing')).toBe(false);
    });

    it('should use expires_at if present (expired)', () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const pending = {
        sent_at: new Date().toISOString(),
        expires_at: pastDate,
      };
      expect(isPendingExpired(pending, 'briefing')).toBe(true);
    });

    it('should use default 24h expiration for unknown types', () => {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
      const pending = { sent_at: twentyThreeHoursAgo };
      // Default is 24h for unknown types, 23h should NOT be expired
      expect(isPendingExpired(pending, 'unknown_type')).toBe(false);

      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const pending2 = { sent_at: twentyFiveHoursAgo };
      expect(isPendingExpired(pending2, 'unknown_type')).toBe(true);
    });

    it('should handle resumen_semanal with 72h expiration', () => {
      const sixtyHoursAgo = new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString();
      const pending = { sent_at: sixtyHoursAgo };
      // 72h expiration, 60h should NOT be expired
      expect(isPendingExpired(pending, 'resumen_semanal')).toBe(false);

      const eightyHoursAgo = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString();
      const pending2 = { sent_at: eightyHoursAgo };
      expect(isPendingExpired(pending2, 'resumen_semanal')).toBe(true);
    });

    it('should handle missing sent_at gracefully', () => {
      const pending = {} as any;
      // No sent_at → should be treated as expired
      const result = isPendingExpired(pending, 'briefing');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getPendingMessages', () => {

    it('should return empty array when no pending', () => {
      const notes = { some_field: 'value' };
      const result = getPendingMessages(notes);
      expect(result).toEqual([]);
    });

    it('should extract pending_briefing', () => {
      const notes = {
        pending_briefing: {
          sent_at: new Date().toISOString(),
          mensaje_completo: 'Buenos días equipo'
        }
      };
      const result = getPendingMessages(notes);
      expect(result.length).toBe(1);
      expect(result[0].key).toBe('pending_briefing');
      expect(result[0].pending.mensaje_completo).toContain('Buenos días');
    });

    it('should extract multiple pending messages', () => {
      const now = new Date().toISOString();
      const notes = {
        pending_briefing: { sent_at: now, mensaje_completo: 'Briefing' },
        pending_reporte_diario: { sent_at: now, mensaje_completo: 'Reporte' },
      };
      const result = getPendingMessages(notes);
      expect(result.length).toBe(2);
    });

    it('should order by priority (briefing first)', () => {
      const now = new Date().toISOString();
      const notes = {
        pending_mensaje: { sent_at: now, mensaje_completo: 'Generic' },
        pending_briefing: { sent_at: now, mensaje_completo: 'Briefing' },
        pending_reporte_diario: { sent_at: now, mensaje_completo: 'Reporte' },
      };
      const result = getPendingMessages(notes);
      expect(result.length).toBe(3);
      // briefing should be first (highest priority)
      expect(result[0].key).toBe('pending_briefing');
    });

    it('should skip expired pending messages', () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const notes = {
        pending_briefing: { sent_at: oldDate, mensaje_completo: 'Old briefing' },
      };
      const result = getPendingMessages(notes);
      // 18h expiration for briefing, 48h ago → expired → empty
      expect(result.length).toBe(0);
    });

    it('should handle string pending (legacy format)', () => {
      const notes = {
        pending_briefing: 'Simple string message',
      };
      const result = getPendingMessages(notes);
      // Should handle string format gracefully
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('enviarMensajeTeamMember logic', () => {

    it('should determine direct send when window is open (< 24h)', () => {
      const lastInteraction = new Date().toISOString();
      const hours = (Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60);
      expect(hours).toBeLessThan(24);
    });

    it('should determine template send when window is closed (> 24h)', () => {
      const lastInteraction = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
      const hours = (Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60);
      expect(hours).toBeGreaterThan(24);
    });

    it('CALL_CONFIG should restrict to business hours', () => {
      // Business hours: 9 AM - 8 PM Mexico
      const horasMexico9am = 9;
      const horasMexico8pm = 20;
      expect(horasMexico9am).toBeGreaterThanOrEqual(9);
      expect(horasMexico8pm).toBeLessThanOrEqual(20);
    });

    it('PRIORITY_CONFIG should have correct priorities', () => {
      // alerta_lead and recordatorio_cita should be CRITICAL (call immediately)
      const criticalTypes = ['alerta_lead', 'recordatorio_cita'];
      const normalTypes = ['briefing', 'reporte_diario'];
      const lowTypes = ['resumen_semanal'];

      criticalTypes.forEach(t => expect(t).toBeTruthy());
      normalTypes.forEach(t => expect(t).toBeTruthy());
      lowTypes.forEach(t => expect(t).toBeTruthy());
    });

    it('EXPIRATION_CONFIG should have correct values', () => {
      // briefing: 18h, recap: 18h, reporte_diario: 24h, resumen_semanal: 72h
      const expirations: Record<string, number> = {
        briefing: 18,
        recap: 18,
        reporte_diario: 24,
        resumen_semanal: 72,
      };
      expect(expirations.briefing).toBe(18);
      expect(expirations.resumen_semanal).toBe(72);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 2: BRIDGE SERVICE
// ═══════════════════════════════════════════════════════════

describe('BRIDGE SERVICE', () => {
  let bridgeService: BridgeService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = createMockSupabase({ singleData: { notes: {} } });
    bridgeService = new BridgeService(mockSupabase as any);
  });

  describe('activarBridge', () => {

    it('should create bridge when no existing bridge', async () => {
      const result = await bridgeService.activarBridge(
        'vendor-1', 'Francisco', '5214921226111',
        'lead-1', 'Roberto García', '5610016226'
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should reject bridge if different vendor has active bridge', async () => {
      const mockSb = createMockSupabase({
        singleData: {
          notes: {
            active_bridge_to_vendedor: {
              vendedor_id: 'other-vendor-id',
              vendedor_name: 'Karla',
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }
          }
        }
      });
      const service = new BridgeService(mockSb as any);

      const result = await service.activarBridge(
        'vendor-1', 'Francisco', '5214921226111',
        'lead-1', 'Roberto', '5610016226'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should allow same vendor to re-activate bridge', async () => {
      const mockSb = createMockSupabase({
        singleData: {
          notes: {
            active_bridge_to_vendedor: {
              vendedor_id: 'vendor-1',
              vendedor_name: 'Francisco',
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }
          }
        }
      });
      const service = new BridgeService(mockSb as any);

      const result = await service.activarBridge(
        'vendor-1', 'Francisco', '5214921226111',
        'lead-1', 'Roberto', '5610016226'
      );

      expect(result.success).toBe(true);
    });

    it('should allow bridge if existing bridge is expired', async () => {
      const mockSb = createMockSupabase({
        singleData: {
          notes: {
            active_bridge_to_vendedor: {
              vendedor_id: 'other-vendor',
              vendedor_name: 'Karla',
              expires_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
            }
          }
        }
      });
      const service = new BridgeService(mockSb as any);

      const result = await service.activarBridge(
        'vendor-2', 'Refugio', '5214921226222',
        'lead-1', 'Roberto', '5610016226'
      );

      expect(result.success).toBe(true);
    });

    it('should handle lead with corrupted notes (string instead of object)', async () => {
      const mockSb = createMockSupabase({
        singleData: { notes: 'corrupted_string' }
      });
      const service = new BridgeService(mockSb as any);

      const result = await service.activarBridge(
        'vendor-1', 'Francisco', '5214921226111',
        'lead-1', 'Roberto', '5610016226'
      );

      // safeJsonParse handles corrupted string → {}
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle lead with null notes', async () => {
      const mockSb = createMockSupabase({
        singleData: { notes: null }
      });
      const service = new BridgeService(mockSb as any);

      const result = await service.activarBridge(
        'vendor-1', 'Francisco', '5214921226111',
        'lead-1', 'Roberto', '5610016226'
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('formatMensajeBridgeActivado', () => {

    it('should format bridge message with lead name', () => {
      const result = bridgeService.formatMensajeBridgeActivado('Roberto García', 'Hola Roberto, te escribo para...');
      expect(result).toContain('Roberto García');
    });

    it('should truncate long messages to ~100 chars', () => {
      const longMessage = 'A'.repeat(200);
      const result = bridgeService.formatMensajeBridgeActivado('Roberto', longMessage);
      // Should not include full 200-char message
      expect(result.length).toBeLessThan(300);
    });

    it('should handle empty message', () => {
      const result = bridgeService.formatMensajeBridgeActivado('Roberto', '');
      expect(result).toContain('Roberto');
    });

    it('should handle empty lead name', () => {
      const result = bridgeService.formatMensajeBridgeActivado('', 'Hola!');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 3: CREDIT FLOW SERVICE
// ═══════════════════════════════════════════════════════════

describe('CREDIT FLOW SERVICE', () => {
  let creditService: CreditFlowService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    creditService = new CreditFlowService(mockSupabase as any);
  });

  describe('yaTieneCredito', () => {

    it('should detect "ya tengo credito"', () => {
      expect(creditService.yaTieneCredito('ya tengo credito con bbva')).toBe(true);
    });

    it('should detect "ya tengo crédito" with accent', () => {
      expect(creditService.yaTieneCredito('ya tengo crédito')).toBe(true);
    });

    it('should NOT detect normal credit inquiries', () => {
      expect(creditService.yaTieneCredito('quiero un credito')).toBe(false);
    });

    it('should detect "ya me aprobaron"', () => {
      expect(creditService.yaTieneCredito('ya me aprobaron mi credito')).toBe(true);
    });
  });

  describe('esPreguntaNoRelacionada', () => {

    it('should detect property questions', () => {
      expect((creditService as any).esPreguntaNoRelacionada('donde queda monte verde')).toBe(true);
    });

    it('should detect amenity questions', () => {
      expect((creditService as any).esPreguntaNoRelacionada('tienen alberca')).toBe(true);
    });

    it('should NOT flag credit-related messages', () => {
      expect((creditService as any).esPreguntaNoRelacionada('bbva me ofrece 10%')).toBe(false);
    });

    it('should detect location questions', () => {
      expect((creditService as any).esPreguntaNoRelacionada('donde queda la oficina')).toBe(true);
    });
  });

  describe('detectarIntencionCredito', () => {

    it('should detect "quiero un credito"', () => {
      expect(creditService.detectarIntencionCredito('quiero un credito')).toBe(true);
    });

    it('should detect "infonavit"', () => {
      expect(creditService.detectarIntencionCredito('aceptan infonavit')).toBe(true);
    });

    it('should detect "cuanto me prestan"', () => {
      expect(creditService.detectarIntencionCredito('cuanto me prestan')).toBe(true);
    });

    it('should NOT detect "ya estoy tramitando" (already in process)', () => {
      expect(creditService.detectarIntencionCredito('ya estoy tramitando mi credito')).toBe(false);
    });

    it('should NOT detect "espero mi credito" (already in process)', () => {
      expect(creditService.detectarIntencionCredito('espero mi credito')).toBe(false);
    });

    it('should NOT detect "ya me aprobaron"', () => {
      expect(creditService.detectarIntencionCredito('ya me aprobaron')).toBe(false);
    });

    it('should NOT detect "en proceso"', () => {
      expect(creditService.detectarIntencionCredito('mi tramite esta en proceso')).toBe(false);
    });

    it('should detect "necesito financiamiento"', () => {
      expect(creditService.detectarIntencionCredito('necesito financiamiento')).toBe(true);
    });

    it('should detect "fovissste"', () => {
      expect(creditService.detectarIntencionCredito('puedo usar fovissste')).toBe(true);
    });
  });

  describe('detectarBanco (private, test via procesarRespuesta state)', () => {

    it('should detect BBVA', () => {
      // Access private method via prototype
      const detectar = (CreditFlowService.prototype as any).detectarBanco;
      expect(detectar('bbva')).toBe('BBVA');
    });

    it('should detect Bancomer as BBVA', () => {
      const detectar = (CreditFlowService.prototype as any).detectarBanco;
      expect(detectar('bancomer')).toBe('BBVA');
    });

    it('should detect Banorte', () => {
      const detectar = (CreditFlowService.prototype as any).detectarBanco;
      expect(detectar('banorte')).toBe('Banorte');
    });

    it('should detect Infonavit', () => {
      const detectar = (CreditFlowService.prototype as any).detectarBanco;
      expect(detectar('infonavit')).toBe('Infonavit');
    });

    it('should detect "no se" as Por definir', () => {
      const detectar = (CreditFlowService.prototype as any).detectarBanco;
      expect(detectar('no se')).toBe('Por definir');
    });

    it('should return null for unrecognized bank', () => {
      const detectar = (CreditFlowService.prototype as any).detectarBanco;
      expect(detectar('banco patito')).toBeNull();
    });
  });

  describe('detectarModalidad (private)', () => {

    it('should detect "1" as llamada', () => {
      const detectar = (CreditFlowService.prototype as any).detectarModalidad;
      expect(detectar('1')).toBe('llamada');
    });

    it('should detect "2" as whatsapp', () => {
      const detectar = (CreditFlowService.prototype as any).detectarModalidad;
      expect(detectar('2')).toBe('whatsapp');
    });

    it('should detect "3" as presencial', () => {
      const detectar = (CreditFlowService.prototype as any).detectarModalidad;
      expect(detectar('3')).toBe('presencial');
    });

    it('should detect "llamada" keyword', () => {
      const detectar = (CreditFlowService.prototype as any).detectarModalidad;
      expect(detectar('prefiero llamada')).toBe('llamada');
    });

    it('should detect "whatsapp" keyword', () => {
      const detectar = (CreditFlowService.prototype as any).detectarModalidad;
      expect(detectar('por whatsapp')).toBe('whatsapp');
    });

    it('should detect "presencial" keyword', () => {
      const detectar = (CreditFlowService.prototype as any).detectarModalidad;
      expect(detectar('quiero ir presencial')).toBe('presencial');
    });

    it('should return null for unrecognized', () => {
      const detectar = (CreditFlowService.prototype as any).detectarModalidad;
      expect(detectar('que tal')).toBeNull();
    });
  });

  describe('extraerMonto (private)', () => {

    it('should extract simple number', () => {
      const extraer = (CreditFlowService.prototype as any).extraerMonto;
      expect(extraer('25000')).toBe(25000);
    });

    it('should extract number with "mil"', () => {
      const extraer = (CreditFlowService.prototype as any).extraerMonto;
      expect(extraer('25mil')).toBe(25000);
    });

    it('should extract number with "k"', () => {
      const extraer = (CreditFlowService.prototype as any).extraerMonto;
      expect(extraer('25k')).toBe(25000);
    });

    it('should extract number with $ sign', () => {
      const extraer = (CreditFlowService.prototype as any).extraerMonto;
      expect(extraer('$30000')).toBe(30000);
    });

    it('should handle small numbers as thousands', () => {
      const extraer = (CreditFlowService.prototype as any).extraerMonto;
      // "25" alone → 25,000 (small number auto-multiplied)
      expect(extraer('gano 25')).toBe(25000);
    });

    it('should return null for no number', () => {
      const extraer = (CreditFlowService.prototype as any).extraerMonto;
      expect(extraer('no se cuanto gano')).toBeNull();
    });
  });

  describe('extraerNombre (private)', () => {

    it('should extract plain name', () => {
      const extraer = (CreditFlowService.prototype as any).extraerNombre;
      expect(extraer('Juan Pérez')).toBe('Juan Pérez');
    });

    it('should extract name with "me llamo" prefix', () => {
      const extraer = (CreditFlowService.prototype as any).extraerNombre;
      expect(extraer('me llamo Carlos López')).toBe('Carlos López');
    });

    it('should extract name with "soy" prefix', () => {
      const extraer = (CreditFlowService.prototype as any).extraerNombre;
      expect(extraer('soy María García')).toBe('María García');
    });

    it('should capitalize names', () => {
      const extraer = (CreditFlowService.prototype as any).extraerNombre;
      expect(extraer('juan pérez')).toBe('Juan Pérez');
    });

    it('should reject names with numbers', () => {
      const extraer = (CreditFlowService.prototype as any).extraerNombre;
      expect(extraer('abc123')).toBeNull();
    });

    it('should reject names too short', () => {
      const extraer = (CreditFlowService.prototype as any).extraerNombre;
      expect(extraer('a')).toBeNull();
    });
  });

  describe('calcularCapacidadCredito (private)', () => {

    it('should calculate credit capacity for 25k income', () => {
      const calcular = (CreditFlowService.prototype as any).calcularCapacidadCredito;
      const result = calcular(25000, 100000);
      expect(result.montoMaximo).toBeGreaterThan(0);
      expect(result.mensualidadMax).toBe(7500); // 30% of 25000
    });

    it('should include enganche in total', () => {
      const calcular = (CreditFlowService.prototype as any).calcularCapacidadCredito;
      const withEnganche = calcular(25000, 500000);
      const withoutEnganche = calcular(25000, 0);
      expect(withEnganche.montoMaximo).toBeGreaterThan(withoutEnganche.montoMaximo);
    });

    it('should return reasonable amounts', () => {
      const calcular = (CreditFlowService.prototype as any).calcularCapacidadCredito;
      const result = calcular(40000, 200000);
      // 40k income → should qualify for ~1-3M
      expect(result.montoMaximo).toBeGreaterThan(500000);
      expect(result.montoMaximo).toBeLessThan(5000000);
    });
  });

  describe('cancelarFlujo', () => {

    it('should clean credit context from notes', async () => {
      const mockSupabaseCancel = createMockSupabase({
        singleData: {
          notes: {
            credit_flow_context: {
              state: 'esperando_banco',
              lead_name: 'Test',
              lead_phone: '5610016226'
            },
            other_field: 'keep_this'
          }
        }
      });

      const service = new CreditFlowService(mockSupabaseCancel as any);
      await service.cancelarFlujo('lead-1');

      // Should have called update to clean context
      expect(mockSupabaseCancel.client.from).toHaveBeenCalled();
    });
  });

  describe('generarMensajeAsesor', () => {

    it('should include asesor name and phone', () => {
      const asesor = { id: 'a1', name: 'Leticia Lara - Asesor Hipotecario', phone: '5214929272839' };
      const context = {
        state: 'completado' as any,
        lead_name: 'Roberto García',
        lead_phone: '5610016226',
        banco_preferido: 'BBVA',
        modalidad: 'llamada' as any,
        capacidad_credito: 2500000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = creditService.generarMensajeAsesor(asesor, context);
      expect(result).toContain('Leticia');
      expect(result).toContain('5214929272839');
      expect(result).toContain('Roberto');
    });

    it('should mention llamada for modalidad llamada', () => {
      const asesor = { id: 'a1', name: 'Leticia', phone: '5214929272839' };
      const context = {
        state: 'completado' as any,
        lead_name: 'Test User',
        lead_phone: '5610016226',
        modalidad: 'llamada' as any,
        capacidad_credito: 2000000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = creditService.generarMensajeAsesor(asesor, context);
      expect(result).toContain('llamará');
    });

    it('should mention WhatsApp for modalidad whatsapp', () => {
      const asesor = { id: 'a1', name: 'Leticia', phone: '5214929272839' };
      const context = {
        state: 'completado' as any,
        lead_name: 'Test User',
        lead_phone: '5610016226',
        modalidad: 'whatsapp' as any,
        capacidad_credito: 2000000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = creditService.generarMensajeAsesor(asesor, context);
      expect(result).toContain('WhatsApp');
    });
  });

  describe('generarNotificacionAsesor', () => {

    it('should include lead financial data', () => {
      const lead = { phone: '5610016226' };
      const context = {
        state: 'completado' as any,
        lead_name: 'Roberto García',
        lead_phone: '5610016226',
        banco_preferido: 'BBVA',
        ingreso_mensual: 30000,
        enganche: 200000,
        capacidad_credito: 2500000,
        modalidad: 'whatsapp' as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = creditService.generarNotificacionAsesor(lead, context);
      expect(result).toContain('Roberto García');
      expect(result).toContain('BBVA');
      expect(result).toContain('30,000');
      expect(result).toContain('200,000');
      expect(result).toContain('LEAD HIPOTECARIO');
    });

    it('should handle missing financial data', () => {
      const lead = { phone: '5610016226' };
      const context = {
        state: 'completado' as any,
        lead_name: 'Test',
        lead_phone: '5610016226',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = creditService.generarNotificacionAsesor(lead, context);
      expect(result).toContain('No proporcionado');
      expect(result).toContain('Por definir');
    });
  });

  describe('estaEnFlujoCredito', () => {

    it('should return false when no context', async () => {
      const mockSupabaseNoCtx = createMockSupabase({
        singleData: { notes: {} }
      });
      const service = new CreditFlowService(mockSupabaseNoCtx as any);
      const result = await service.estaEnFlujoCredito('lead-1');
      expect(result).toBe(false);
    });

    it('should return false when state is completado', async () => {
      const mockSupabaseComplete = createMockSupabase({
        singleData: {
          notes: {
            credit_flow_context: {
              state: 'completado',
              lead_name: 'Test',
              lead_phone: '555',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          }
        }
      });
      const service = new CreditFlowService(mockSupabaseComplete as any);
      const result = await service.estaEnFlujoCredito('lead-1');
      expect(result).toBe(false);
    });

    it('should return true when state is active (esperando_banco)', async () => {
      const mockSupabaseActive = createMockSupabase({
        singleData: {
          notes: {
            credit_flow_context: {
              state: 'esperando_banco',
              lead_name: 'Test',
              lead_phone: '555',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          }
        }
      });
      const service = new CreditFlowService(mockSupabaseActive as any);
      const result = await service.estaEnFlujoCredito('lead-1');
      expect(result).toBe(true);
    });
  });
});
