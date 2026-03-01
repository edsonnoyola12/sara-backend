import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies BEFORE importing the service
vi.mock('../utils/teamMessaging', () => ({
  enviarMensajeTeamMember: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../crons/healthCheck', () => ({
  enviarAlertaSistema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../handlers/whatsapp-utils', () => ({
  formatPhoneForDisplay: vi.fn((phone: string) => phone),
}));

vi.mock('./ttsService', () => ({
  createTTSService: vi.fn(() => ({
    generateAudio: vi.fn().mockResolvedValue({ success: false }),
  })),
}));

vi.mock('./ttsTrackingService', () => ({
  createTTSTrackingService: vi.fn(() => ({
    logTTSSent: vi.fn().mockResolvedValue(undefined),
  })),
}));

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
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue(response),
              }),
            }),
            in: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(response),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
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

// Mock meta
function createMockMeta() {
  return {
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-123' }] }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-audio-123' }] }),
  };
}

import { NotificationService } from '../services/notificationService';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { enviarAlertaSistema } from '../crons/healthCheck';

describe('NotificationService', () => {
  let service: NotificationService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockMeta: ReturnType<typeof createMockMeta>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase({
      team_members: {
        data: { id: 'v1', name: 'Vendedor Test', phone: '5212224558475', role: 'vendedor', active: true, notes: {} },
        error: null,
      },
    });
    mockMeta = createMockMeta();
    service = new NotificationService(mockSupabase as any, mockMeta as any, 'fake-openai-key');
  });

  // ═══════════════════════════════════════════════════════════════
  // notificarVendedor
  // ═══════════════════════════════════════════════════════════════
  describe('notificarVendedor', () => {
    it('should send notification via enviarMensajeTeamMember', async () => {
      const result = await service.notificarVendedor('v1', 'Test notification');
      expect(result).toBe(true);
      expect(enviarMensajeTeamMember).toHaveBeenCalledOnce();
    });

    it('should return false when vendedor has no phone', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: { id: 'v1', name: 'Sin Phone', phone: null }, error: null },
      });
      const svc = new NotificationService(mockSupa as any, mockMeta as any);
      const result = await svc.notificarVendedor('v1', 'Test');
      expect(result).toBe(false);
    });

    it('should return false when vendedor not found', async () => {
      const mockSupa = createMockSupabase({
        team_members: { data: null, error: null },
      });
      const svc = new NotificationService(mockSupa as any, mockMeta as any);
      const result = await svc.notificarVendedor('v1', 'Test');
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      (enviarMensajeTeamMember as any).mockRejectedValueOnce(new Error('fail'));
      const result = await service.notificarVendedor('v1', 'Test');
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // notificarAdmin
  // ═══════════════════════════════════════════════════════════════
  describe('notificarAdmin', () => {
    it('should send alert via enviarAlertaSistema', async () => {
      const result = await service.notificarAdmin('Admin alert');
      expect(result).toBe(true);
      expect(enviarAlertaSistema).toHaveBeenCalledWith(mockMeta, 'Admin alert', undefined, 'notification');
    });

    it('should return false on error', async () => {
      (enviarAlertaSistema as any).mockRejectedValueOnce(new Error('fail'));
      const result = await service.notificarAdmin('Admin alert');
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarRecordatoriosCitas
  // ═══════════════════════════════════════════════════════════════
  describe('enviarRecordatoriosCitas', () => {
    it('should return { enviados: 0, errores: 0 } when no appointments exist', async () => {
      const mockSupa = createMockSupabase({
        appointments: { data: [], error: null },
      });
      const svc = new NotificationService(mockSupa as any, mockMeta as any);
      const result = await svc.enviarRecordatoriosCitas();
      expect(result.enviados).toBe(0);
      expect(result.errores).toBe(0);
    });

    it('should not crash when appointment query returns null', async () => {
      const mockSupa = createMockSupabase({
        appointments: { data: null, error: null },
      });
      const svc = new NotificationService(mockSupa as any, mockMeta as any);
      const result = await svc.enviarRecordatoriosCitas();
      expect(result).toBeDefined();
      expect(result.enviados).toBeGreaterThanOrEqual(0);
      expect(result.errores).toBeGreaterThanOrEqual(0);
    });

    it('should handle appointment query error gracefully', async () => {
      const mockSupa = createMockSupabase({
        appointments: { data: null, error: { message: 'DB error' } },
      });
      const svc = new NotificationService(mockSupa as any, mockMeta as any);
      const result = await svc.enviarRecordatoriosCitas();
      expect(result).toBeDefined();
    });

    it('should filter out already-sent reminders (reminder_24h_sent=true)', async () => {
      // All appointments have reminder_24h_sent=true so none should be processed
      const mockSupa = createMockSupabase({
        appointments: {
          data: [{
            id: 'apt-1', lead_id: 'l1', lead_name: 'Roberto', lead_phone: '5215610016226',
            scheduled_date: '2026-03-02', scheduled_time: '10:00:00',
            property_name: 'Monte Verde', reminder_24h_sent: true, reminder_vendor_24h_sent: true,
            reminder_2h_sent: true, reminder_vendor_2h_sent: true,
            vendedor_id: 'v1', appointment_type: 'visita',
          }],
          error: null,
        },
      });
      const svc = new NotificationService(mockSupa as any, mockMeta as any);
      const result = await svc.enviarRecordatoriosCitas();
      // No new messages should be sent since all reminders already sent
      expect(result.enviados).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarEncuestasPostCita (stub)
  // ═══════════════════════════════════════════════════════════════
  describe('enviarEncuestasPostCita', () => {
    it('should return { enviados: 0, errores: 0 }', async () => {
      const result = await service.enviarEncuestasPostCita();
      expect(result).toEqual({ enviados: 0, errores: 0 });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // enviarFollowupPostCita (stub)
  // ═══════════════════════════════════════════════════════════════
  describe('enviarFollowupPostCita', () => {
    it('should return { enviados: 0, errores: 0 }', async () => {
      const result = await service.enviarFollowupPostCita();
      expect(result).toEqual({ enviados: 0, errores: 0 });
    });
  });
});
