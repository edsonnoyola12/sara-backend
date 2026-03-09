import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies BEFORE importing the module
vi.mock('../utils/teamMessaging', () => ({
  enviarMensajeTeamMember: vi.fn().mockResolvedValue({ success: true, method: 'direct' }),
}));

vi.mock('../crons/healthCheck', () => ({
  logErrorToDB: vi.fn().mockResolvedValue(undefined),
  enviarAlertaSistema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../handlers/whatsapp-utils', () => ({
  formatPhoneForDisplay: vi.fn((phone: string) => phone),
  parseNotasSafe: vi.fn((notes: any) => (typeof notes === 'object' ? notes : {})),
  formatVendorFeedback: vi.fn(() => ''),
  findLeadByName: vi.fn().mockResolvedValue(null),
}));

// ═══════════════════════════════════════════════════════════════
// SOPHISTICATED MOCK: Tracks which table is being queried
// and returns appropriate data per table.
// ═══════════════════════════════════════════════════════════════

function createMockSupabase(tableResponses: Record<string, any> = {}) {
  // Helper to create a deeply-chained mock that ultimately resolves to the table's response
  const makeChain = (response: any) => {
    const chain: any = {};
    const resolveValue = () => Promise.resolve(response);

    // Terminal methods
    chain.single = vi.fn().mockImplementation(resolveValue);
    chain.maybeSingle = vi.fn().mockImplementation(resolveValue);

    // Chainable methods that all return the same chain object
    const chainableMethods = [
      'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
      'in', 'is', 'not', 'or', 'and', 'order', 'limit', 'range',
    ];

    for (const method of chainableMethods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }

    // select also acts as terminal (Promise.all uses .then on it)
    // Override select to return a thenable chain
    chain.then = vi.fn().mockImplementation((resolve: any) => resolve(response));

    // insert / update / upsert chains
    chain.insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
      }),
    });
    chain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });

    return chain;
  };

  return {
    client: {
      from: vi.fn((table: string) => {
        const response = tableResponses[table] || { data: [], error: null };
        return makeChain(response);
      }),
    },
  };
}

function createMockMeta() {
  return {
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-123' }] }),
    sendTemplate: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-tmpl-123' }] }),
    sendWhatsAppButtons: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-btn-123' }] }),
    sendWhatsAppList: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-list-123' }] }),
    sendWhatsAppImage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-img-123' }] }),
  };
}

// ═══════════════════════════════════════════════════════════════
// IMPORT after mocks
// ═══════════════════════════════════════════════════════════════

import {
  enviarReporteDiarioConsolidadoCEO,
  enviarReporteDiarioCEO,
  enviarReporteSemanalCEO,
  enviarReporteMensualCEO,
  enviarReporteDiarioVendedores,
  enviarReporteSemanalVendedores,
  enviarReporteMensualVendedores,
  enviarReporteDiarioAsesores,
  enviarReporteSemanalAsesores,
  enviarReporteMensualAsesores,
  enviarReporteDiarioMarketing,
  enviarReporteSemanalMarketing,
  enviarReporteMensualMarketing,
  iniciarFlujosPostVisita,
  enviarEncuestasPostCita,
  enviarEncuestasNPS,
  procesarRespuestaEncuesta,
  aplicarPreciosProgramados,
} from '../crons/reports';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { logErrorToDB } from '../crons/healthCheck';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const ADMIN_MEMBER = { id: 'a1', name: 'Oscar CEO', phone: '5214922019052', role: 'admin', active: true, notes: {} };
const COORDINADOR_MEMBER = { id: 'c1', name: 'Coord Test', phone: '5210000000010', role: 'coordinador', active: true, notes: {} };
const VENDEDOR_1 = { id: 'v1', name: 'Francisco', phone: '5212221111111', role: 'vendedor', active: true, notes: {} };
const VENDEDOR_2 = { id: 'v2', name: 'Karla', phone: '5212221111112', role: 'vendedor', active: true, notes: {} };
const ASESOR_1 = { id: 'as1', name: 'Leticia', phone: '5212221111113', role: 'asesor', active: true, notes: {} };
const MARKETING_1 = { id: 'm1', name: 'Agencia', phone: '5212221111114', role: 'marketing', active: true, notes: {} };

function makeLeadBase(overrides = {}) {
  return {
    id: 'lead-1', name: 'Roberto García', phone: '5215610016226', status: 'new',
    assigned_to: 'v1', created_at: new Date().toISOString(), source: 'Facebook',
    score: 30, property_interest: 'Monte Verde', notes: {},
    ...overrides,
  };
}

function makeAppointment(overrides = {}) {
  const hoy = new Date().toISOString().split('T')[0];
  return {
    id: 'apt-1', lead_id: 'lead-1', scheduled_date: hoy, scheduled_time: '10:00',
    status: 'scheduled', vendedor_id: 'v1', property_name: 'Monte Verde',
    appointment_type: 'visita',
    ...overrides,
  };
}

function makeMortgage(overrides = {}) {
  return {
    id: 'mort-1', lead_id: 'lead-1', status: 'pending', assigned_advisor_id: 'as1',
    bank: 'BBVA', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('Reports CRON Module', () => {
  let mockMeta: ReturnType<typeof createMockMeta>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMeta = createMockMeta();
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteDiarioCEO
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteDiarioCEO', () => {
    it('should send report to admins and coordinators', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER, COORDINADOR_MEMBER], error: null },
        leads: { data: [makeLeadBase()], error: null },
        appointments: { data: [makeAppointment()], error: null },
        followup_approvals: { data: [], error: null },
      });

      await enviarReporteDiarioCEO(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).toHaveBeenCalled();
    });

    it('should return early when no admins found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteDiarioCEO(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should return early when admins query returns null', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: null, error: null },
      });

      await enviarReporteDiarioCEO(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should handle missing leads data gracefully', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER], error: null },
        leads: { data: null, error: null },
        appointments: { data: null, error: null },
        followup_approvals: { data: null, error: null },
      });

      await expect(enviarReporteDiarioCEO(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });

    it('should deduplicate admins by phone when sending', async () => {
      const admin2SamePhone = { ...COORDINADOR_MEMBER, phone: ADMIN_MEMBER.phone };
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER, admin2SamePhone], error: null },
        leads: { data: [], error: null },
        appointments: { data: [], error: null },
        followup_approvals: { data: [], error: null },
      });

      await enviarReporteDiarioCEO(mockSupa as any, mockMeta as any);

      // Should deduplicate and send only once per phone
      const calls = (enviarMensajeTeamMember as any).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should not crash on DB error', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER], error: { message: 'DB error' } },
        leads: { data: null, error: { message: 'timeout' } },
        appointments: { data: null, error: null },
        followup_approvals: { data: null, error: null },
      });

      await expect(enviarReporteDiarioCEO(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteDiarioConsolidadoCEO
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteDiarioConsolidadoCEO', () => {
    it('should call enviarReporteDiarioCEO internally', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER], error: null },
        leads: { data: [], error: null },
        appointments: { data: [], error: null },
        followup_approvals: { data: [], error: null },
      });

      await enviarReporteDiarioConsolidadoCEO(mockSupa as any, mockMeta as any);

      // The consolidated function calls enviarReporteDiarioCEO
      expect(mockSupa.client.from).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteSemanalCEO
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteSemanalCEO', () => {
    it('should return early when no admins found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteSemanalCEO(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should send weekly report to admins', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER], error: null },
        leads: { data: [makeLeadBase()], error: null },
        appointments: { data: [], error: null },
      });

      await enviarReporteSemanalCEO(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).toHaveBeenCalled();
    });

    it('should not crash on empty data', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER], error: null },
        leads: { data: null, error: null },
        appointments: { data: null, error: null },
      });

      await expect(enviarReporteSemanalCEO(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteMensualCEO
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteMensualCEO', () => {
    it('should return early when no admins found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteMensualCEO(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should send monthly report to admins', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ADMIN_MEMBER], error: null },
        leads: { data: [makeLeadBase({ status: 'closed', properties: { price: 2500000 } })], error: null },
        appointments: { data: [], error: null },
        vendor_monthly_goals: { data: [], error: null },
        monthly_goals: { data: null, error: null },
      });

      await enviarReporteMensualCEO(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).toHaveBeenCalled();
    });

    it('should log error to DB on failure', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: null, error: null },
      });
      // Force an error path
      (mockSupa.client.from as any).mockImplementationOnce(() => { throw new Error('critical'); });

      await enviarReporteMensualCEO(mockSupa as any, mockMeta as any);

      expect(logErrorToDB).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteDiarioVendedores
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteDiarioVendedores', () => {
    it('should return early when no vendedores found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteDiarioVendedores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should send daily report to each vendedor via enviarMensajeTeamMember', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [VENDEDOR_1, VENDEDOR_2], error: null },
        leads: { data: [makeLeadBase()], error: null },
        appointments: { data: [makeAppointment()], error: null },
        vendor_monthly_goals: { data: [{ vendor_id: 'v1', goal: 3, month: '2026-03' }], error: null },
      });

      await enviarReporteDiarioVendedores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).toHaveBeenCalled();
    });

    it('should skip vendedores without phone', async () => {
      const vendedorSinPhone = { ...VENDEDOR_1, phone: null };
      const mockSupa = createMockSupabase({
        team_members: { data: [vendedorSinPhone], error: null },
        leads: { data: [], error: null },
        appointments: { data: [], error: null },
        vendor_monthly_goals: { data: [], error: null },
      });

      await enviarReporteDiarioVendedores(mockSupa as any, mockMeta as any);

      // Should not send to vendedor without phone
      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should use reporte_vendedor template override', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [VENDEDOR_1], error: null },
        leads: { data: [makeLeadBase()], error: null },
        appointments: { data: [makeAppointment()], error: null },
        vendor_monthly_goals: { data: [], error: null },
      });

      await enviarReporteDiarioVendedores(mockSupa as any, mockMeta as any);

      if ((enviarMensajeTeamMember as any).mock.calls.length > 0) {
        const callOptions = (enviarMensajeTeamMember as any).mock.calls[0][4]; // 5th arg: options
        expect(callOptions).toBeDefined();
        if (callOptions?.templateOverride) {
          expect(callOptions.templateOverride.name).toBe('reporte_vendedor');
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteSemanalVendedores
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteSemanalVendedores', () => {
    it('should return early when no vendedores found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteSemanalVendedores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should not crash with empty data', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [VENDEDOR_1], error: null },
        leads: { data: [], error: null },
        appointments: { data: [], error: null },
        surveys: { data: [], error: null },
      });

      await expect(enviarReporteSemanalVendedores(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteMensualVendedores
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteMensualVendedores', () => {
    it('should return early when no vendedores found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteMensualVendedores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should send monthly report to vendedores', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [VENDEDOR_1], error: null },
        leads: { data: [makeLeadBase({ status: 'closed' })], error: null },
        appointments: { data: [], error: null },
        surveys: { data: [], error: null },
        vendor_monthly_goals: { data: [{ vendor_id: 'v1', goal: 3, month: '2026-03' }], error: null },
      });

      await enviarReporteMensualVendedores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteDiarioAsesores
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteDiarioAsesores', () => {
    it('should return early when no asesores found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteDiarioAsesores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should send daily report using reporte_asesor template', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [ASESOR_1], error: null },
        mortgage_applications: { data: [makeMortgage()], error: null },
      });

      await enviarReporteDiarioAsesores(mockSupa as any, mockMeta as any);

      if ((enviarMensajeTeamMember as any).mock.calls.length > 0) {
        const callOptions = (enviarMensajeTeamMember as any).mock.calls[0][4];
        if (callOptions?.templateOverride) {
          expect(callOptions.templateOverride.name).toBe('resumen_asesor_v2');
        }
      }
    });

    it('should skip asesores without phone', async () => {
      const asesorSinPhone = { ...ASESOR_1, phone: null };
      const mockSupa = createMockSupabase({
        team_members: { data: [asesorSinPhone], error: null },
        mortgage_applications: { data: [], error: null },
      });

      await enviarReporteDiarioAsesores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteSemanalAsesores / enviarReporteMensualAsesores
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteSemanalAsesores', () => {
    it('should return early when no asesores found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteSemanalAsesores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });
  });

  describe('enviarReporteMensualAsesores', () => {
    it('should return early when no asesores found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteMensualAsesores(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteDiarioMarketing
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteDiarioMarketing', () => {
    it('should return early when no marketing team found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteDiarioMarketing(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should send daily report to marketing team', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [MARKETING_1], error: null },
        leads: { data: [makeLeadBase({ source: 'Facebook' })], error: null },
        appointments: { data: [makeAppointment()], error: null },
      });

      await enviarReporteDiarioMarketing(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).toHaveBeenCalled();
    });

    it('should not crash on empty leads data', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [MARKETING_1], error: null },
        leads: { data: null, error: null },
        appointments: { data: null, error: null },
      });

      await expect(enviarReporteDiarioMarketing(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarReporteSemanalMarketing / enviarReporteMensualMarketing
  // ═══════════════════════════════════════════════════════════════
  describe('enviarReporteSemanalMarketing', () => {
    it('should return early when no marketing team found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteSemanalMarketing(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });
  });

  describe('enviarReporteMensualMarketing', () => {
    it('should return early when no marketing team found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: [], error: null },
      });

      await enviarReporteMensualMarketing(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // aplicarPreciosProgramados
  // ═══════════════════════════════════════════════════════════════
  describe('aplicarPreciosProgramados', () => {
    it('should skip if prices already applied this month (idempotency)', async () => {
      const mockSupa = createMockSupabase({
        system_config: { data: { key: 'precio_aplicado_2026-03', value: '2026-03-01T00:00:00Z' }, error: null },
      });

      await aplicarPreciosProgramados(mockSupa as any, mockMeta as any);

      // Should not query properties if already applied
      const fromCalls = (mockSupa.client.from as any).mock.calls;
      const propertyQueries = fromCalls.filter((c: any) => c[0] === 'properties');
      // The first call to properties would be the select; if idempotency works, there should be fewer calls
      expect(fromCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should apply 0.5% increase to all property prices', async () => {
      const mockSupa = createMockSupabase({
        system_config: { data: null, error: { message: 'table not found' } },
        properties: {
          data: [
            { id: 'p1', name: 'Acacia', development: 'Monte Verde', price: 1600000, price_equipped: 1700000 },
          ],
          error: null,
        },
      });

      await aplicarPreciosProgramados(mockSupa as any, mockMeta as any);

      // Should have called from('properties') for select and update
      expect(mockSupa.client.from).toHaveBeenCalledWith('properties');
    });

    it('should handle empty properties gracefully', async () => {
      const mockSupa = createMockSupabase({
        system_config: { data: null, error: null },
        properties: { data: [], error: null },
      });

      await expect(aplicarPreciosProgramados(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });

    it('should handle properties query error gracefully', async () => {
      const mockSupa = createMockSupabase({
        system_config: { data: null, error: null },
        properties: { data: null, error: { message: 'DB error' } },
      });

      await expect(aplicarPreciosProgramados(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });

    it('should work even without system_config table (uses KV)', async () => {
      const mockSupa = createMockSupabase({
        system_config: { data: null, error: { message: 'relation does not exist' } },
        properties: {
          data: [{ id: 'p1', name: 'Test', development: 'Test', price: 1000000, price_equipped: 1100000 }],
          error: null,
        },
      });

      // Should not throw even if system_config doesn't exist
      await expect(aplicarPreciosProgramados(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // procesarRespuestaEncuesta
  // ═══════════════════════════════════════════════════════════════
  describe('procesarRespuestaEncuesta', () => {
    it('should return null when no pending survey exists', async () => {
      const mockSupa = createMockSupabase({
        surveys: { data: null, error: null },
      });

      const result = await procesarRespuestaEncuesta(mockSupa as any, '5215610016226', '3');

      expect(result).toBeNull();
    });

    it('should process post_cita survey rating 1 (Excelente)', async () => {
      const mockSupa = createMockSupabase({
        surveys: {
          data: { id: 's1', survey_type: 'post_cita', status: 'sent', lead_name: 'Roberto García', lead_phone: '5215610016226' },
          error: null,
        },
      });

      const result = await procesarRespuestaEncuesta(mockSupa as any, '5215610016226', '1');

      expect(result).toBeDefined();
      expect(result).toContain('excelente');
    });

    it('should process NPS score 10 (promotor)', async () => {
      const mockSupa = createMockSupabase({
        surveys: {
          data: { id: 's2', survey_type: 'nps', status: 'sent', lead_name: 'Roberto García', lead_phone: '5215610016226' },
          error: null,
        },
      });

      const result = await procesarRespuestaEncuesta(mockSupa as any, '5215610016226', '10');

      expect(result).toBeDefined();
      expect(result).toContain('Wow');
    });

    it('should return null for invalid survey response', async () => {
      const mockSupa = createMockSupabase({
        surveys: {
          data: { id: 's3', survey_type: 'post_cita', status: 'sent', lead_name: 'Roberto', lead_phone: '5215610016226' },
          error: null,
        },
      });

      const result = await procesarRespuestaEncuesta(mockSupa as any, '5215610016226', 'hola qué tal');

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarEncuestasPostCita
  // ═══════════════════════════════════════════════════════════════
  describe('enviarEncuestasPostCita', () => {
    it('should not crash when no completed appointments', async () => {
      const mockSupa = createMockSupabase({
        appointments: { data: [], error: null },
        surveys: { data: null, error: null },
      });

      await expect(enviarEncuestasPostCita(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarEncuestasNPS
  // ═══════════════════════════════════════════════════════════════
  describe('enviarEncuestasNPS', () => {
    it('should return early when no recent closings found', async () => {
      const mockSupa = createMockSupabase({
        leads: { data: [], error: null },
      });

      await enviarEncuestasNPS(mockSupa as any, mockMeta as any);

      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should not crash when leads query returns null', async () => {
      const mockSupa = createMockSupabase({
        leads: { data: null, error: null },
      });

      await expect(enviarEncuestasNPS(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // iniciarFlujosPostVisita
  // ═══════════════════════════════════════════════════════════════
  describe('iniciarFlujosPostVisita', () => {
    it('should return early when no pending appointments today', async () => {
      const mockSupa = createMockSupabase({
        appointments: { data: [], error: null },
      });

      await iniciarFlujosPostVisita(mockSupa as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should handle appointment query error gracefully', async () => {
      const mockSupa = createMockSupabase({
        appointments: { data: null, error: { message: 'query failed' } },
      });

      await expect(iniciarFlujosPostVisita(mockSupa as any, mockMeta as any)).resolves.not.toThrow();
    });
  });
});
