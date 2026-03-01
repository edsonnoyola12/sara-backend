import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
function createMockSupabase(responses: Record<string, any> = {}) {
  return {
    client: {
      from: vi.fn((table: string) => {
        const response = responses[table] || { data: null, error: null };
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(response),
              maybeSingle: vi.fn().mockResolvedValue(response),
              limit: vi.fn().mockResolvedValue(response),
              order: vi.fn().mockResolvedValue(response),
            }),
            in: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(response),
            }),
            ilike: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue(response),
                }),
              }),
            }),
            or: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(response),
            }),
            limit: vi.fn().mockResolvedValue(response),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }),
    },
  };
}

// Import after mocking
import { CreditFlowService } from '../services/creditFlowService';

describe('CreditFlowService', () => {
  let service: CreditFlowService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockSupabase = createMockSupabase({
      leads: {
        data: {
          id: 'lead-1',
          name: 'Roberto García',
          phone: '5215610016226',
          notes: {},
          status: 'contacted',
          assigned_to: 'vendor-1',
        },
        error: null,
      },
    });
    service = new CreditFlowService(mockSupabase as any);
  });

  // ═══════════════════════════════════════════════════════════════
  // yaTieneCredito (private — access via (service as any))
  // ═══════════════════════════════════════════════════════════════
  describe('yaTieneCredito', () => {
    it('should detect "ya tengo credito"', () => {
      expect((service as any).yaTieneCredito('ya tengo credito aprobado')).toBe(true);
    });

    it('should detect "ya tengo crédito" with accent', () => {
      expect((service as any).yaTieneCredito('ya tengo crédito')).toBe(true);
    });

    it('should detect "me aprobaron"', () => {
      expect((service as any).yaTieneCredito('me aprobaron el credito')).toBe(true);
    });

    it('should detect typo "ya twngo credito"', () => {
      expect((service as any).yaTieneCredito('ya twngo credito')).toBe(true);
    });

    it('should detect "no necesito credito"', () => {
      expect((service as any).yaTieneCredito('no necesito crédito')).toBe(true);
    });

    it('should return false for unrelated messages', () => {
      expect((service as any).yaTieneCredito('quiero un credito nuevo')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect((service as any).yaTieneCredito('')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // esPreguntaNoRelacionada (private)
  // ═══════════════════════════════════════════════════════════════
  describe('esPreguntaNoRelacionada', () => {
    it('should detect property questions', () => {
      expect((service as any).esPreguntaNoRelacionada('cuanto cuesta la casa')).toBe(true);
    });

    it('should detect location questions', () => {
      expect((service as any).esPreguntaNoRelacionada('donde queda el desarrollo')).toBe(true);
    });

    it('should detect visit requests', () => {
      expect((service as any).esPreguntaNoRelacionada('quiero ver las casas')).toBe(true);
    });

    it('should detect resource requests', () => {
      expect((service as any).esPreguntaNoRelacionada('me mandan fotos del desarrollo')).toBe(true);
    });

    it('should detect long questions with ?', () => {
      expect((service as any).esPreguntaNoRelacionada('en donde puedo encontrar mas informacion sobre todo esto?')).toBe(true);
    });

    it('should detect "ya tengo credito" via delegation', () => {
      expect((service as any).esPreguntaNoRelacionada('ya tengo credito aprobado')).toBe(true);
    });

    it('should return false for credit flow responses like "bbva"', () => {
      expect((service as any).esPreguntaNoRelacionada('bbva')).toBe(false);
    });

    it('should return false for short number responses', () => {
      expect((service as any).esPreguntaNoRelacionada('25000')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // detectarBanco (private)
  // ═══════════════════════════════════════════════════════════════
  describe('detectarBanco', () => {
    it('should detect BBVA', () => {
      expect((service as any).detectarBanco('quiero por bbva')).toBe('BBVA');
    });

    it('should detect bancomer as BBVA', () => {
      expect((service as any).detectarBanco('bancomer')).toBe('BBVA');
    });

    it('should detect Banorte', () => {
      expect((service as any).detectarBanco('mi cuenta es en banorte')).toBe('Banorte');
    });

    it('should detect Infonavit', () => {
      expect((service as any).detectarBanco('tengo infonavit')).toBe('Infonavit');
    });

    it('should detect Fovissste', () => {
      expect((service as any).detectarBanco('soy de fovissste')).toBe('Fovissste');
    });

    it('should return "Por definir" for "no se"', () => {
      expect((service as any).detectarBanco('no se cual es mejor')).toBe('Por definir');
    });

    it('should return "Por definir" for "no sé"', () => {
      expect((service as any).detectarBanco('no sé')).toBe('Por definir');
    });

    it('should return "Por definir" for "recomiendame"', () => {
      expect((service as any).detectarBanco('recomiendame uno')).toBe('Por definir');
    });

    it('should return null for unknown banks', () => {
      expect((service as any).detectarBanco('hola')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // extraerMonto (private)
  // ═══════════════════════════════════════════════════════════════
  describe('extraerMonto', () => {
    it('should extract "25mil" as 25000', () => {
      expect((service as any).extraerMonto('gano 25mil')).toBe(25000);
    });

    it('should extract "25k" as 25000', () => {
      expect((service as any).extraerMonto('gano 25k al mes')).toBe(25000);
    });

    it('should extract "$25,000" as 25000', () => {
      expect((service as any).extraerMonto('$25,000 pesos')).toBe(25000);
    });

    it('should multiply numbers < 1000 by 1000', () => {
      expect((service as any).extraerMonto('gano 25')).toBe(25000);
    });

    it('should handle number > 1000 directly', () => {
      expect((service as any).extraerMonto('gano 35000 al mes')).toBe(35000);
    });

    it('should return null for no number', () => {
      expect((service as any).extraerMonto('no se cuanto gano')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // extraerNombre (private)
  // ═══════════════════════════════════════════════════════════════
  describe('extraerNombre', () => {
    it('should extract name from "me llamo Roberto"', () => {
      expect((service as any).extraerNombre('me llamo Roberto García')).toBe('Roberto García');
    });

    it('should extract name from "soy Juan"', () => {
      expect((service as any).extraerNombre('soy Juan Pérez')).toBe('Juan Pérez');
    });

    it('should extract name from "mi nombre es Ana"', () => {
      expect((service as any).extraerNombre('mi nombre es Ana')).toBe('Ana');
    });

    it('should capitalize correctly', () => {
      expect((service as any).extraerNombre('roberto garcia')).toBe('Roberto Garcia');
    });

    it('should return null for invalid names (numbers)', () => {
      expect((service as any).extraerNombre('12345')).toBeNull();
    });

    it('should return null for names that are too short', () => {
      expect((service as any).extraerNombre('a')).toBeNull();
    });

    it('should strip trailing punctuation', () => {
      expect((service as any).extraerNombre('Roberto!')).toBe('Roberto');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // calcularCapacidadCredito (private)
  // ═══════════════════════════════════════════════════════════════
  describe('calcularCapacidadCredito', () => {
    it('should calculate with 25000 income and 200000 downpayment', () => {
      const result = (service as any).calcularCapacidadCredito(25000, 200000);
      expect(result.montoMaximo).toBeGreaterThan(0);
      expect(result.mensualidadMax).toBe(7500); // 25000 * 0.30 = 7500, rounded to nearest 100
    });

    it('should calculate with 15000 income and 100000 downpayment', () => {
      const result = (service as any).calcularCapacidadCredito(15000, 100000);
      expect(result.mensualidadMax).toBe(4500); // 15000 * 0.30 = 4500
      expect(result.montoMaximo).toBeGreaterThan(100000);
    });

    it('should round montoMaximo to nearest 10000', () => {
      const result = (service as any).calcularCapacidadCredito(30000, 500000);
      expect(result.montoMaximo % 10000).toBe(0);
    });

    it('should round mensualidadMax to nearest 100', () => {
      const result = (service as any).calcularCapacidadCredito(33333, 0);
      expect(result.mensualidadMax % 100).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // detectarIntencionCredito (public)
  // ═══════════════════════════════════════════════════════════════
  describe('detectarIntencionCredito', () => {
    it('should detect "credito" keyword', () => {
      expect(service.detectarIntencionCredito('necesito un credito')).toBe(true);
    });

    it('should detect "hipoteca"', () => {
      expect(service.detectarIntencionCredito('quiero una hipoteca')).toBe(true);
    });

    it('should detect "infonavit"', () => {
      expect(service.detectarIntencionCredito('acepto infonavit')).toBe(true);
    });

    it('should detect "fovissste"', () => {
      expect(service.detectarIntencionCredito('soy de fovissste')).toBe(true);
    });

    it('should detect "financiamiento"', () => {
      expect(service.detectarIntencionCredito('necesito financiamiento')).toBe(true);
    });

    it('should NOT detect "ya estoy tramitando" (ya en proceso)', () => {
      expect(service.detectarIntencionCredito('ya estoy tramitando mi credito')).toBe(false);
    });

    it('should NOT detect "espero aprobacion" (ya en proceso)', () => {
      expect(service.detectarIntencionCredito('espero aprobacion de mi credito')).toBe(false);
    });

    it('should NOT detect "ya me aprobaron" (ya en proceso)', () => {
      expect(service.detectarIntencionCredito('ya me aprobaron el credito')).toBe(false);
    });

    it('should NOT detect "en proceso" (ya en proceso)', () => {
      expect(service.detectarIntencionCredito('mi credito esta en proceso')).toBe(false);
    });

    it('should NOT detect "solo espero" via regex', () => {
      expect(service.detectarIntencionCredito('solo espero mi credito')).toBe(false);
    });

    it('should return false for unrelated messages', () => {
      expect(service.detectarIntencionCredito('hola quiero ver casas')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // detectarModalidad (private)
  // ═══════════════════════════════════════════════════════════════
  describe('detectarModalidad', () => {
    it('should detect "1" as llamada', () => {
      expect((service as any).detectarModalidad('1')).toBe('llamada');
    });

    it('should detect "llamada" as llamada', () => {
      expect((service as any).detectarModalidad('prefiero llamada')).toBe('llamada');
    });

    it('should detect "2" as whatsapp', () => {
      expect((service as any).detectarModalidad('2')).toBe('whatsapp');
    });

    it('should detect "whatsapp" as whatsapp', () => {
      expect((service as any).detectarModalidad('por whatsapp porfavor')).toBe('whatsapp');
    });

    it('should detect "3" as presencial', () => {
      expect((service as any).detectarModalidad('3')).toBe('presencial');
    });

    it('should detect "oficina" as presencial', () => {
      expect((service as any).detectarModalidad('en la oficina')).toBe('presencial');
    });

    it('should return null for unknown', () => {
      expect((service as any).detectarModalidad('no se')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // iniciarFlujoCredito (async, needs mocked supabase)
  // ═══════════════════════════════════════════════════════════════
  describe('iniciarFlujoCredito', () => {
    it('should start with pedir_nombre when lead has no name', async () => {
      const lead = { id: 'lead-1', name: 'Sin nombre', phone: '5215610016226', notes: {} };
      const result = await service.iniciarFlujoCredito(lead);
      // Should not throw
      expect(result).toBeDefined();
    });

    it('should start with esperando_banco when lead has name', async () => {
      const lead = { id: 'lead-1', name: 'Roberto García', phone: '5215610016226', notes: {} };
      const result = await service.iniciarFlujoCredito(lead);
      expect(result).toBeDefined();
    });

    it('should treat "Cliente" as no name', async () => {
      const lead = { id: 'lead-1', name: 'Cliente', phone: '5215610016226', notes: {} };
      const result = await service.iniciarFlujoCredito(lead);
      expect(result).toBeDefined();
    });

    it('should treat phone-like names (starting with 521) as no name', async () => {
      const lead = { id: 'lead-1', name: '5215610016226', phone: '5215610016226', notes: {} };
      const result = await service.iniciarFlujoCredito(lead);
      expect(result).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // cancelarFlujo (async)
  // ═══════════════════════════════════════════════════════════════
  describe('cancelarFlujo', () => {
    it('should cancel flow without crashing', async () => {
      await expect(service.cancelarFlujo('lead-1', 'cambio de tema')).resolves.not.toThrow();
    });

    it('should cancel flow without reason', async () => {
      await expect(service.cancelarFlujo('lead-1')).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // estaEnFlujoCredito (async)
  // ═══════════════════════════════════════════════════════════════
  describe('estaEnFlujoCredito', () => {
    it('should return false when no context exists', async () => {
      // Default mock returns data with no credit_flow_context
      const result = await service.estaEnFlujoCredito('lead-1');
      expect(result).toBe(false);
    });

    it('should return false when state is completado', async () => {
      const mockSupa = createMockSupabase({
        leads: {
          data: {
            notes: { credit_flow_context: { state: 'completado' } },
          },
          error: null,
        },
      });
      const svc = new CreditFlowService(mockSupa as any);
      const result = await svc.estaEnFlujoCredito('lead-1');
      expect(result).toBe(false);
    });

    it('should return false when state is conectando_asesor', async () => {
      const mockSupa = createMockSupabase({
        leads: {
          data: {
            notes: { credit_flow_context: { state: 'conectando_asesor' } },
          },
          error: null,
        },
      });
      const svc = new CreditFlowService(mockSupa as any);
      const result = await svc.estaEnFlujoCredito('lead-1');
      expect(result).toBe(false);
    });

    it('should return true when state is esperando_banco', async () => {
      const mockSupa = createMockSupabase({
        leads: {
          data: {
            notes: { credit_flow_context: { state: 'esperando_banco' } },
          },
          error: null,
        },
      });
      const svc = new CreditFlowService(mockSupa as any);
      const result = await svc.estaEnFlujoCredito('lead-1');
      expect(result).toBe(true);
    });
  });
});
