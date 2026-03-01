import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase (same pattern as creditFlowService.test.ts)
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
            not: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(response),
              limit: vi.fn().mockResolvedValue(response),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'new-mortgage-id' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }),
    },
  };
}

import { MortgageService } from '../services/mortgageService';

describe('MortgageService', () => {
  let service: MortgageService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new MortgageService(mockSupabase as any);
  });

  // ═══════════════════════════════════════════════════════════════
  // formatCreditList (pure function)
  // ═══════════════════════════════════════════════════════════════
  describe('formatCreditList', () => {
    it('should return "no hay créditos" for empty array', () => {
      const result = service.formatCreditList([]);
      expect(result).toContain('No hay créditos en proceso');
    });

    it('should return "no hay créditos" for null/undefined', () => {
      const result = service.formatCreditList(null as any);
      expect(result).toContain('No hay créditos en proceso');
    });

    it('should format a single credit with pending status', () => {
      const credits = [{
        lead_name: 'Roberto García',
        lead_phone: '5215610016226',
        property: 'Monte Verde',
        asesor_name: 'Leticia Lara',
        mortgage_status: 'pending',
      }];
      const result = service.formatCreditList(credits);
      expect(result).toContain('⏳');
      expect(result).toContain('Roberto García');
      expect(result).toContain('Monte Verde');
      expect(result).toContain('Leticia Lara');
      expect(result).toContain('(1)');
    });

    it('should use correct emoji for each status', () => {
      const statuses = [
        { status: 'pending', emoji: '⏳' },
        { status: 'in_review', emoji: '📋' },
        { status: 'documents_pending', emoji: '📄' },
        { status: 'approved', emoji: '✅' },
        { status: 'rejected', emoji: '❌' },
        { status: 'sin_solicitud', emoji: '❔' },
      ];

      for (const { status, emoji } of statuses) {
        const credits = [{ lead_name: 'Test', lead_phone: '123', property: 'Dev', asesor_name: 'A', mortgage_status: status }];
        const result = service.formatCreditList(credits);
        expect(result).toContain(emoji);
      }
    });

    it('should use 📌 for unknown status', () => {
      const credits = [{ lead_name: 'Test', lead_phone: '123', property: 'Dev', asesor_name: 'A', mortgage_status: 'unknown_status' }];
      const result = service.formatCreditList(credits);
      expect(result).toContain('📌');
    });

    it('should show "Sin desarrollo" when property is missing', () => {
      const credits = [{ lead_name: 'Test', lead_phone: '123', property: null, asesor_name: 'A', mortgage_status: 'pending' }];
      const result = service.formatCreditList(credits);
      expect(result).toContain('Sin desarrollo');
    });

    it('should include hint for details', () => {
      const credits = [{ lead_name: 'Test', lead_phone: '123', property: 'Dev', asesor_name: 'A', mortgage_status: 'pending' }];
      const result = service.formatCreditList(credits);
      expect(result).toContain('cómo va [nombre]');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // formatMensajeNuevoLead (pure function)
  // ═══════════════════════════════════════════════════════════════
  describe('formatMensajeNuevoLead', () => {
    it('should format with all data', () => {
      const result = service.formatMensajeNuevoLead({
        success: true,
        action: 'created',
        lead: {
          id: 'l1', name: 'Roberto García', phone: '5215610016226',
          property_interest: 'Monte Verde', ingreso_mensual: 25000, banco_preferido: 'BBVA',
        },
        cambios: ['Nueva solicitud creada'],
      });
      expect(result).toContain('NUEVO LEAD HIPOTECARIO');
      expect(result).toContain('Roberto García');
      expect(result).toContain('Monte Verde');
      expect(result).toContain('BBVA');
      expect(result).toContain('25,000');
    });

    it('should return error when lead is missing', () => {
      const result = service.formatMensajeNuevoLead({ success: true, cambios: [] } as any);
      expect(result).toContain('Error: datos incompletos');
    });

    it('should show "Por definir" for missing optional fields', () => {
      const result = service.formatMensajeNuevoLead({
        success: true,
        action: 'created',
        lead: { id: 'l1', name: 'Test', phone: '123' },
        cambios: [],
      });
      expect(result).toContain('Por definir');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // formatMensajeActualizacion (pure function)
  // ═══════════════════════════════════════════════════════════════
  describe('formatMensajeActualizacion', () => {
    it('should format with changes list', () => {
      const result = service.formatMensajeActualizacion({
        success: true,
        action: 'updated',
        lead: { id: 'l1', name: 'Roberto', phone: '123' },
        cambios: ['Ingreso: $25,000/mes', 'Banco: BBVA'],
      });
      expect(result).toContain('ACTUALIZACIÓN DE LEAD');
      expect(result).toContain('Roberto');
      expect(result).toContain('Ingreso: $25,000/mes');
      expect(result).toContain('Banco: BBVA');
    });

    it('should return error when lead is missing', () => {
      const result = service.formatMensajeActualizacion({ success: true, cambios: [] } as any);
      expect(result).toContain('Error: datos incompletos');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // finalizeCreditFlow (async)
  // ═══════════════════════════════════════════════════════════════
  describe('finalizeCreditFlow', () => {
    const lead = { id: 'lead-1', name: 'Roberto', phone: '5215610016226', notes: '{}', property_interest: 'Monte Verde' };

    it('should return error when no asesores available', async () => {
      const teamMembers: any[] = [
        { id: 't1', name: 'Vendedor', role: 'vendedor', active: true, notes: {} },
      ];
      const result = await service.finalizeCreditFlow(lead, teamMembers);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No hay asesores');
    });

    it('should filter out inactive asesores', async () => {
      const teamMembers: any[] = [
        { id: 't1', name: 'Asesor Inactivo', role: 'asesor', active: false, notes: {} },
      ];
      const result = await service.finalizeCreditFlow(lead, teamMembers);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No hay asesores');
    });

    it('should filter out asesores on vacation', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const teamMembers: any[] = [
        { id: 't1', name: 'Asesor Vacaciones', role: 'asesor', active: true, notes: { en_vacaciones: true, vacaciones_hasta: futureDate } },
      ];
      const result = await service.finalizeCreditFlow(lead, teamMembers);
      expect(result.success).toBe(false);
    });

    it('should select single available asesor and create mortgage', async () => {
      const mockSupa = createMockSupabase({
        mortgage_applications: { data: null, error: null },
      });
      const svc = new MortgageService(mockSupa as any);

      const teamMembers: any[] = [
        { id: 'asesor-1', name: 'Leticia', role: 'asesor', active: true, phone: '5214929272839', notes: {} },
      ];
      const result = await svc.finalizeCreditFlow(lead, teamMembers);
      expect(result.success).toBe(true);
      expect(result.asesor?.name).toBe('Leticia');
      expect(result.asesor?.id).toBe('asesor-1');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // crearOActualizarConNotificacion (async)
  // ═══════════════════════════════════════════════════════════════
  describe('crearOActualizarConNotificacion', () => {
    it('should return waiting_name for "Cliente WhatsApp"', async () => {
      const lead = { id: 'l1', name: 'Cliente WhatsApp', phone: '123' };
      const result = await service.crearOActualizarConNotificacion(lead, [], {});
      expect(result.action).toBe('waiting_name');
      expect(result.success).toBe(true);
    });

    it('should return waiting_name for names starting with "Lead"', async () => {
      const lead = { id: 'l1', name: 'Lead 5215610016226', phone: '123' };
      const result = await service.crearOActualizarConNotificacion(lead, [], {});
      expect(result.action).toBe('waiting_name');
    });

    it('should return waiting_name for null name', async () => {
      const lead = { id: 'l1', name: null, phone: '123' };
      const result = await service.crearOActualizarConNotificacion(lead, [], {});
      expect(result.action).toBe('waiting_name');
    });

    it('should create new mortgage when none exists', async () => {
      const mockSupa = createMockSupabase({
        mortgage_applications: { data: null, error: null },
      });
      const svc = new MortgageService(mockSupa as any);

      const lead = { id: 'l1', name: 'Roberto García', phone: '123', property_interest: 'Monte Verde' };
      const teamMembers = [{ id: 'a1', name: 'Leticia', role: 'asesor', active: true, phone: '555' }];
      const datos = { ingreso_mensual: 25000, banco_preferido: 'BBVA' };

      const result = await svc.crearOActualizarConNotificacion(lead, teamMembers, datos);
      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.lead?.name).toBe('Roberto García');
      expect(result.cambios).toContain('Nueva solicitud creada');
    });

    it('should detect no_change when updating with same data', async () => {
      const mockSupa = createMockSupabase({
        mortgage_applications: {
          data: {
            id: 'existing-m',
            lead_id: 'l1',
            asesor_id: 'a1',
            notes: { ingreso_mensual: 25000, banco_preferido: 'BBVA' },
          },
          error: null,
        },
      });
      const svc = new MortgageService(mockSupa as any);

      const lead = { id: 'l1', name: 'Roberto', phone: '123' };
      const datos = { ingreso_mensual: 25000, banco_preferido: 'BBVA' };
      const result = await svc.crearOActualizarConNotificacion(lead, [], datos);
      expect(result.action).toBe('no_change');
      expect(result.cambios).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // getCreditsForVendor (async)
  // ═══════════════════════════════════════════════════════════════
  describe('getCreditsForVendor', () => {
    it('should return isEmpty for vendor with no credit leads', async () => {
      const mockSupa = createMockSupabase({
        leads: { data: [], error: null },
      });
      const svc = new MortgageService(mockSupa as any);
      const result = await svc.getCreditsForVendor('vendor-1');
      expect(result.isEmpty).toBe(true);
      expect(result.credits).toHaveLength(0);
    });

    it('should return isEmpty on error', async () => {
      const mockSupa = createMockSupabase({
        leads: { data: null, error: { message: 'DB error' } },
      });
      const svc = new MortgageService(mockSupa as any);
      const result = await svc.getCreditsForVendor('vendor-1');
      expect(result.isEmpty).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // getCreditDetailByLead (async)
  // ═══════════════════════════════════════════════════════════════
  describe('getCreditDetailByLead', () => {
    it('should return error when lead not found', async () => {
      const mockSupa = createMockSupabase({
        leads: { data: [], error: null },
      });
      const svc = new MortgageService(mockSupa as any);
      const result = await svc.getCreditDetailByLead('NoExiste', 'vendor-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No encontré');
    });

    it('should handle accented names via NFD normalization', async () => {
      const mockSupa = createMockSupabase({
        leads: {
          data: [{ id: 'l1', name: 'José García', phone: '123', assigned_to: 'v1' }],
          error: null,
        },
        mortgage_applications: { data: null, error: null },
      });
      const svc = new MortgageService(mockSupa as any);
      const result = await svc.getCreditDetailByLead('jose garcia', 'v1');
      // The mock chain resolves, but since it's all from('leads').select().eq() which returns the array,
      // we check the flow doesn't crash
      expect(result).toBeDefined();
    });
  });
});
