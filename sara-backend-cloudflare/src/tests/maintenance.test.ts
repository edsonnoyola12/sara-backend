import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies BEFORE importing the module
vi.mock('../utils/teamMessaging', () => ({
  enviarMensajeTeamMember: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../crons/healthCheck', () => ({
  logErrorToDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../handlers/whatsapp-utils', () => ({
  formatPhoneForDisplay: vi.fn((phone: string) => phone),
}));

vi.mock('../crons/followups', () => ({
  registrarMensajeAutomatico: vi.fn().mockResolvedValue(undefined),
}));

// ═══════════════════════════════════════════════════════════
// Mock Supabase Factory
// ═══════════════════════════════════════════════════════════

/**
 * Creates a chainable + thenable object that mirrors Supabase PostgREST builder.
 * All chain methods return the SAME object reference (no recursion).
 * When awaited, resolves to `response`.
 */
function createChainable(response: any) {
  const obj: any = {};

  // Make it thenable (awaitable)
  obj.then = (resolve: any, reject?: any) => Promise.resolve(response).then(resolve, reject);
  obj.catch = (reject: any) => Promise.resolve(response).catch(reject);

  // Terminal methods that return a plain promise
  obj.single = vi.fn().mockResolvedValue(response);
  obj.maybeSingle = vi.fn().mockResolvedValue(response);

  // Chain methods — all return the same object
  const chainMethods = [
    'select', 'eq', 'neq', 'not', 'lt', 'gt', 'lte', 'gte',
    'in', 'like', 'ilike', 'order', 'limit', 'range',
  ];
  for (const method of chainMethods) {
    obj[method] = vi.fn().mockReturnValue(obj);
  }

  return obj;
}

function createMockSupabase(responses: Record<string, any> = {}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    client: {
      from: vi.fn((table: string) => {
        const response = responses[table] || { data: null, error: null };
        const chain = createChainable(response);
        chain.update = updateMock;
        chain.insert = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
          }),
        });
        return chain;
      }),
    },
    _updateMock: updateMock,
  };
}

// ═══════════════════════════════════════════════════════════
// Mock Meta Factory
// ═══════════════════════════════════════════════════════════
function createMockMeta() {
  return {
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-123' }] }),
    sendTemplate: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-tmpl-123' }] }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-audio-123' }] }),
  };
}

// Now import the module under test
import {
  verificarBridgesPorExpirar,
  procesarFollowupsPendientes,
  archivarConversationHistory,
  verificarLeadsEstancados,
  felicitarAniversarioCompra,
} from '../crons/maintenance';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { logErrorToDB } from '../crons/healthCheck';
import { registrarMensajeAutomatico } from '../crons/followups';

describe('maintenance.ts', () => {
  let mockMeta: ReturnType<typeof createMockMeta>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMeta = createMockMeta();
  });

  // ═══════════════════════════════════════════════════════════
  // verificarBridgesPorExpirar
  // ═══════════════════════════════════════════════════════════
  describe('verificarBridgesPorExpirar', () => {
    it('should do nothing when no team members are returned', async () => {
      const mockSupabase = createMockSupabase({
        team_members: { data: null, error: null },
      });

      await verificarBridgesPorExpirar(mockSupabase as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should skip members without notes or phone', async () => {
      const mockSupabase = createMockSupabase({
        team_members: {
          data: [
            { id: 'tm1', name: 'Sin Notas', phone: '5212224558475', notes: null },
            { id: 'tm2', name: 'Sin Phone', phone: null, notes: '{}' },
          ],
          error: null,
        },
      });

      await verificarBridgesPorExpirar(mockSupabase as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should send warning when bridge is about to expire (0.5 < minutes <= 2)', async () => {
      const expiresInOneMinute = new Date(Date.now() + 1 * 60 * 1000).toISOString();

      const mockSupabase = createMockSupabase({
        team_members: {
          data: [
            {
              id: 'tm1',
              name: 'Vendedor Test',
              phone: '5212224558475',
              notes: {
                active_bridge: {
                  expires_at: expiresInOneMinute,
                  lead_name: 'Roberto Garcia',
                  lead_phone: '5610016226',
                  warning_sent: false,
                },
              },
            },
          ],
          error: null,
        },
      });

      await verificarBridgesPorExpirar(mockSupabase as any, mockMeta as any);

      // Should send warning to vendor
      expect(enviarMensajeTeamMember).toHaveBeenCalledOnce();
      expect(enviarMensajeTeamMember).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ id: 'tm1' }),
        expect.stringContaining('Roberto Garcia'),
        expect.objectContaining({ tipoMensaje: 'alerta_lead' })
      );

      // Should send message to lead
      expect(mockMeta.sendWhatsAppMessage).toHaveBeenCalledWith(
        '5610016226',
        expect.stringContaining('ayudarte')
      );
    });

    it('should not warn if bridge already has warning_sent=true', async () => {
      const expiresInOneMinute = new Date(Date.now() + 1 * 60 * 1000).toISOString();

      const mockSupabase = createMockSupabase({
        team_members: {
          data: [
            {
              id: 'tm1',
              name: 'Vendedor Test',
              phone: '5212224558475',
              notes: {
                active_bridge: {
                  expires_at: expiresInOneMinute,
                  lead_name: 'Roberto',
                  lead_phone: '5610016226',
                  warning_sent: true, // Already warned
                },
              },
            },
          ],
          error: null,
        },
      });

      await verificarBridgesPorExpirar(mockSupabase as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should process multiple bridges and warn only eligible ones', async () => {
      const expiresInOneMinute = new Date(Date.now() + 1 * 60 * 1000).toISOString();
      const expiresInTenMinutes = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const mockSupabase = createMockSupabase({
        team_members: {
          data: [
            {
              id: 'tm1',
              name: 'Vendedor 1',
              phone: '5212224558475',
              notes: {
                active_bridge: {
                  expires_at: expiresInOneMinute,
                  lead_name: 'Lead 1',
                  lead_phone: '521111',
                  warning_sent: false,
                },
              },
            },
            {
              id: 'tm2',
              name: 'Vendedor 2',
              phone: '5212224558476',
              notes: {
                active_bridge: {
                  expires_at: expiresInTenMinutes, // Not about to expire
                  lead_name: 'Lead 2',
                  lead_phone: '522222',
                  warning_sent: false,
                },
              },
            },
          ],
          error: null,
        },
      });

      await verificarBridgesPorExpirar(mockSupabase as any, mockMeta as any);

      // Only the first bridge should trigger warning (1 min left is in 0.5-2 range)
      expect(enviarMensajeTeamMember).toHaveBeenCalledOnce();
    });

    it('should log error to DB when an exception occurs', async () => {
      const mockSupabase = createMockSupabase();
      // Force an error by making client.from throw
      mockSupabase.client.from = vi.fn().mockImplementation(() => {
        throw new Error('DB connection failed');
      });

      await verificarBridgesPorExpirar(mockSupabase as any, mockMeta as any);

      expect(logErrorToDB).toHaveBeenCalledWith(
        expect.anything(),
        'cron_error',
        'DB connection failed',
        expect.objectContaining({ source: 'verificarBridgesPorExpirar' })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // procesarFollowupsPendientes
  // ═══════════════════════════════════════════════════════════
  describe('procesarFollowupsPendientes', () => {
    it('should do nothing when no pending followups exist', async () => {
      const mockSupabase = createMockSupabase({
        leads: { data: [], error: null },
      });

      await procesarFollowupsPendientes(mockSupabase as any, mockMeta as any);

      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should do nothing when leads data is null', async () => {
      const mockSupabase = createMockSupabase({
        leads: { data: null, error: null },
      });

      await procesarFollowupsPendientes(mockSupabase as any, mockMeta as any);

      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should send followup automatically when 30 min timeout expired', async () => {
      const expiredAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago

      const leadsResponse = {
        data: [
          {
            id: 'lead-1',
            name: 'Roberto',
            phone: '5610016226',
            assigned_to: 'v1',
            team_members: { name: 'Vendedor Test' },
            notes: {
              pending_followup: {
                status: 'pending',
                expires_at: expiredAt,
                mensaje: 'Hola Roberto, seguimiento',
                lead_phone: '5610016226',
              },
            },
            last_message_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago (within 24h window)
          },
        ],
        error: null,
      };

      const teamMemberResponse = {
        data: { phone: '5212224558475', name: 'Vendedor Test' },
        error: null,
      };

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          const chain = createChainable(leadsResponse);
          chain.update = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          });
          return chain;
        }
        if (table === 'team_members') {
          return createChainable(teamMemberResponse);
        }
        const defaultChain = createChainable({ data: null, error: null });
        defaultChain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
        return defaultChain;
      });

      const mockSupabase = { client: { from: fromMock } };

      await procesarFollowupsPendientes(mockSupabase as any, mockMeta as any);

      // Should send followup message to lead
      expect(mockMeta.sendWhatsAppMessage).toHaveBeenCalledWith(
        '5610016226',
        'Hola Roberto, seguimiento'
      );

      // Should register auto message
      expect(registrarMensajeAutomatico).toHaveBeenCalledWith(
        expect.anything(),
        'lead-1'
      );
    });

    it('should skip followup that has not expired yet', async () => {
      const expiresLater = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 min from now

      const mockSupabase = createMockSupabase({
        leads: {
          data: [
            {
              id: 'lead-1',
              name: 'Roberto',
              phone: '5610016226',
              assigned_to: 'v1',
              notes: {
                pending_followup: {
                  status: 'pending',
                  expires_at: expiresLater,
                  mensaje: 'Test',
                },
              },
            },
          ],
          error: null,
        },
      });

      await procesarFollowupsPendientes(mockSupabase as any, mockMeta as any);

      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should skip followup with status other than pending', async () => {
      const expired = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const mockSupabase = createMockSupabase({
        leads: {
          data: [
            {
              id: 'lead-1',
              name: 'Roberto',
              phone: '5610016226',
              assigned_to: 'v1',
              notes: {
                pending_followup: {
                  status: 'sent_auto', // Already sent
                  expires_at: expired,
                  mensaje: 'Test',
                },
              },
            },
          ],
          error: null,
        },
      });

      await procesarFollowupsPendientes(mockSupabase as any, mockMeta as any);

      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // archivarConversationHistory
  // ═══════════════════════════════════════════════════════════
  describe('archivarConversationHistory', () => {
    it('should do nothing when no leads have conversation_history', async () => {
      const mockSupabase = createMockSupabase({
        leads: { data: [], error: null },
      });

      await archivarConversationHistory(mockSupabase as any);

      // Should not call update
      expect(mockSupabase.client.from).toHaveBeenCalledWith('leads');
    });

    it('should do nothing when leads data is null', async () => {
      const mockSupabase = createMockSupabase({
        leads: { data: null, error: null },
      });

      await archivarConversationHistory(mockSupabase as any);
      // No crash, no updates
    });

    it('should skip leads with less than 30 entries', async () => {
      const smallHistory = Array.from({ length: 25 }, (_, i) => ({
        timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // All old
        content: `msg-${i}`,
      }));

      const mockSupabase = createMockSupabase({
        leads: {
          data: [{ id: 'lead-1', name: 'Test Lead', conversation_history: smallHistory }],
          error: null,
        },
      });

      await archivarConversationHistory(mockSupabase as any);

      // Update should NOT be called because <= MIN_KEEP
      expect(mockSupabase._updateMock).not.toHaveBeenCalled();
    });

    it('should trim entries older than 90 days while keeping at least 30', async () => {
      const hace100dias = new Date();
      hace100dias.setDate(hace100dias.getDate() - 100);

      const hace10dias = new Date();
      hace10dias.setDate(hace10dias.getDate() - 10);

      // 40 old entries + 20 recent = 60 total
      const oldEntries = Array.from({ length: 40 }, (_, i) => ({
        timestamp: new Date(hace100dias.getTime() + i * 1000).toISOString(),
        content: `old-${i}`,
      }));
      const recentEntries = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(hace10dias.getTime() + i * 1000).toISOString(),
        content: `recent-${i}`,
      }));
      const fullHistory = [...oldEntries, ...recentEntries];

      // We need a more precise mock for the archival function
      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          const chain = createChainable({
            data: [{ id: 'lead-1', name: 'Active Lead', conversation_history: fullHistory }],
            error: null,
          });
          chain.update = updateMock;
          return chain;
        }
        return createChainable({ data: null, error: null });
      });

      const mockSupabase = { client: { from: fromMock } };

      await archivarConversationHistory(mockSupabase as any);

      // Should have called update to trim
      expect(updateMock).toHaveBeenCalled();
      const updateCall = updateMock.mock.calls[0][0];
      const trimmedHistory = updateCall.conversation_history;

      // Should keep at least 30 entries
      expect(trimmedHistory.length).toBeGreaterThanOrEqual(30);
      // Should have fewer entries than original
      expect(trimmedHistory.length).toBeLessThan(fullHistory.length);
    });

    it('should not trim if all entries would be kept', async () => {
      const hace10dias = new Date();
      hace10dias.setDate(hace10dias.getDate() - 10);

      // 35 recent entries (all within 90 days)
      const recentHistory = Array.from({ length: 35 }, (_, i) => ({
        timestamp: new Date(hace10dias.getTime() + i * 1000).toISOString(),
        content: `recent-${i}`,
      }));

      const updateMock = vi.fn();
      const fromMock = vi.fn().mockImplementation((table: string) => {
        const chain = createChainable({
          data: [{ id: 'lead-1', name: 'Recent Lead', conversation_history: recentHistory }],
          error: null,
        });
        chain.update = updateMock;
        return chain;
      });

      const mockSupabase = { client: { from: fromMock } };

      await archivarConversationHistory(mockSupabase as any);

      // Should NOT call update since no old entries
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // verificarLeadsEstancados
  // ═══════════════════════════════════════════════════════════
  describe('verificarLeadsEstancados', () => {
    it('should do nothing when no stagnant leads exist', async () => {
      const mockSupabase = createMockSupabase({
        leads: { data: [], error: null },
      });

      await verificarLeadsEstancados(mockSupabase as any, mockMeta as any);

      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });

    it('should send alert for lead stagnant >72h without activity', async () => {
      const hace4dias = new Date();
      hace4dias.setDate(hace4dias.getDate() - 4);

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          return createChainable({
            data: [
              {
                id: 'lead-1',
                name: 'Lead Estancado',
                status: 'contacted',
                updated_at: hace4dias.toISOString(),
                team_members: { name: 'Vendedor 1', phone: '5212224558475' },
              },
            ],
            error: null,
          });
        }
        return createChainable({ data: null, error: null });
      });

      const mockSupabase = { client: { from: fromMock } };

      await verificarLeadsEstancados(mockSupabase as any, mockMeta as any);

      // Should alert the vendor
      expect(enviarMensajeTeamMember).toHaveBeenCalled();
      const callArgs = (enviarMensajeTeamMember as any).mock.calls[0];
      expect(callArgs[3]).toContain('ALERTA');
      expect(callArgs[3]).toContain('Lead Estancado');
    });

    it('should group alerts by vendor', async () => {
      const hace4dias = new Date();
      hace4dias.setDate(hace4dias.getDate() - 4);

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          return createChainable({
            data: [
              {
                id: 'lead-1',
                name: 'Lead 1',
                status: 'contacted',
                updated_at: hace4dias.toISOString(),
                team_members: { name: 'Vendedor 1', phone: '521111' },
              },
              {
                id: 'lead-2',
                name: 'Lead 2',
                status: 'contacted',
                updated_at: hace4dias.toISOString(),
                team_members: { name: 'Vendedor 1', phone: '521111' },
              },
              {
                id: 'lead-3',
                name: 'Lead 3',
                status: 'contacted',
                updated_at: hace4dias.toISOString(),
                team_members: { name: 'Vendedor 2', phone: '522222' },
              },
            ],
            error: null,
          });
        }
        return createChainable({ data: null, error: null });
      });

      const mockSupabase = { client: { from: fromMock } };

      await verificarLeadsEstancados(mockSupabase as any, mockMeta as any);

      // Find calls for status 'contacted' (dias=3) - the mock returns data for all statuses
      // Since mock returns same data for all 3 status iterations, we check the cumulative calls
      const totalCalls = (enviarMensajeTeamMember as any).mock.calls.length;
      // Should have grouped by vendor phone (2 vendors per status iteration)
      expect(totalCalls).toBeGreaterThanOrEqual(2);
    });

    it('should limit displayed leads to 5 per vendor with overflow message', async () => {
      const hace4dias = new Date();
      hace4dias.setDate(hace4dias.getDate() - 4);

      const sevenLeads = Array.from({ length: 7 }, (_, i) => ({
        id: `lead-${i}`,
        name: `Lead ${i}`,
        status: 'contacted',
        updated_at: hace4dias.toISOString(),
        team_members: { name: 'Vendedor 1', phone: '521111' },
      }));

      const fromMock = vi.fn().mockImplementation((table: string) => {
        return createChainable({
          data: sevenLeads,
          error: null,
        });
      });

      const mockSupabase = { client: { from: fromMock } };

      await verificarLeadsEstancados(mockSupabase as any, mockMeta as any);

      // Find a call that includes the overflow message
      const calls = (enviarMensajeTeamMember as any).mock.calls;
      const hasOverflow = calls.some((call: any[]) =>
        call[3].includes('...y 2 m')
      );
      expect(hasOverflow).toBe(true);
    });

    it('should skip leads without vendor phone', async () => {
      const hace4dias = new Date();
      hace4dias.setDate(hace4dias.getDate() - 4);

      const fromMock = vi.fn().mockImplementation((table: string) => {
        return createChainable({
          data: [
            {
              id: 'lead-1',
              name: 'Lead Sin Vendedor',
              status: 'contacted',
              updated_at: hace4dias.toISOString(),
              team_members: null, // No vendor assigned
            },
          ],
          error: null,
        });
      });

      const mockSupabase = { client: { from: fromMock } };

      await verificarLeadsEstancados(mockSupabase as any, mockMeta as any);

      // Should NOT send any messages since vendor has no phone
      // (the function iterates 3 status types, so it processes leads 3 times)
      // For each iteration, the lead has no team_members?.phone so it skips
      expect(enviarMensajeTeamMember).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // felicitarAniversarioCompra
  // ═══════════════════════════════════════════════════════════
  describe('felicitarAniversarioCompra', () => {
    it('should do nothing when no clients with delivered status exist', async () => {
      const fromMock = vi.fn().mockImplementation((table: string) => {
        return createChainable({
          data: [],
          error: null,
        });
      });

      const mockSupabase = { client: { from: fromMock } };

      await felicitarAniversarioCompra(mockSupabase as any, mockMeta as any);

      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should send first anniversary greeting for client who bought exactly 1 year ago', async () => {
      // Create a date exactly 1 year ago today (in Mexico timezone)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const clienteDelivered = {
        id: 'client-1',
        name: 'Maria Lopez',
        phone: '5610016226',
        status: 'delivered',
        status_changed_at: oneYearAgo.toISOString(),
        property_interest: 'Monte Verde',
        notes: {},
        assigned_to: 'v1',
        last_message_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago (within 24h window)
      };

      let fromCallCount = 0;
      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          fromCallCount++;
          if (fromCallCount === 1) {
            // First call: fetch delivered clients
            const chain = createChainable({
              data: [clienteDelivered],
              error: null,
            });
            chain.update = vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            });
            return chain;
          }
          // Subsequent calls: update lead
          const chain = createChainable({ data: [], error: null });
          chain.update = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          });
          return chain;
        }
        if (table === 'team_members') {
          return createChainable({
            data: [{ id: 'v1', name: 'Vendedor Test', phone: '5212224558475' }],
            error: null,
          });
        }
        return createChainable({ data: null, error: null });
      });

      const mockSupabase = { client: { from: fromMock } };

      await felicitarAniversarioCompra(mockSupabase as any, mockMeta as any);

      // Should send anniversary message to client
      expect(mockMeta.sendWhatsAppMessage).toHaveBeenCalled();
      const msgCall = (mockMeta.sendWhatsAppMessage as any).mock.calls[0];
      expect(msgCall[0]).toBe('5610016226');
      expect(msgCall[1]).toContain('aniversario');
    });

    it('should skip client already congratulated this year', async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const currentYear = new Date().getFullYear();

      const clienteYaFelicitado = {
        id: 'client-1',
        name: 'Roberto',
        phone: '5610016226',
        status: 'delivered',
        status_changed_at: oneYearAgo.toISOString(),
        property_interest: 'Monte Verde',
        notes: { [`Aniversario ${currentYear}`]: true }, // Already congratulated
        assigned_to: 'v1',
      };

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          const chain = createChainable({
            data: [clienteYaFelicitado],
            error: null,
          });
          chain.update = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          });
          return chain;
        }
        if (table === 'team_members') {
          return createChainable({
            data: [{ id: 'v1', name: 'Vendedor', phone: '521222' }],
            error: null,
          });
        }
        return createChainable({ data: null, error: null });
      });

      const mockSupabase = { client: { from: fromMock } };

      await felicitarAniversarioCompra(mockSupabase as any, mockMeta as any);

      // Should NOT send message because already congratulated
      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should not send for purchases less than 1 year ago', async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const clienteReciente = {
        id: 'client-1',
        name: 'Carlos',
        phone: '5610016226',
        status: 'delivered',
        status_changed_at: sixMonthsAgo.toISOString(),
        property_interest: 'Monte Verde',
        notes: {},
        assigned_to: 'v1',
      };

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          return createChainable({
            data: [clienteReciente],
            error: null,
          });
        }
        if (table === 'team_members') {
          return createChainable({
            data: [],
            error: null,
          });
        }
        return createChainable({ data: null, error: null });
      });

      const mockSupabase = { client: { from: fromMock } };

      await felicitarAniversarioCompra(mockSupabase as any, mockMeta as any);

      // Should NOT send — not an anniversary yet (only 6 months)
      expect(mockMeta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should log error to DB when exception occurs', async () => {
      const fromMock = vi.fn().mockImplementation(() => {
        throw new Error('Unexpected DB error');
      });

      const mockSupabase = { client: { from: fromMock } };

      await felicitarAniversarioCompra(mockSupabase as any, mockMeta as any);

      expect(logErrorToDB).toHaveBeenCalledWith(
        expect.anything(),
        'cron_error',
        'Unexpected DB error',
        expect.objectContaining({ source: 'felicitarAniversarioCompra' })
      );
    });
  });
});
