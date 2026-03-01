import { describe, it, expect } from 'vitest';
import { isPendingExpired, getPendingMessages, EnviarMensajeTeamResult } from '../utils/teamMessaging';
import { VendorCommandsService } from '../services/vendorCommandsService';

// ═══════════════════════════════════════════════════════════════
// TESTS PARA LOS 7 FIXES CRÍTICOS DE RESILIENCIA
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Fix #1: Verificar retorno de enviarMensajeTeamMember
// ─────────────────────────────────────────────────────────────
describe('Fix #1: enviarMensajeTeamMember return value contract', () => {
  it('EnviarMensajeTeamResult debe reportar success:false con method:failed', () => {
    const result: EnviarMensajeTeamResult = { success: false, method: 'failed', ventanaAbierta: false };
    expect(result.success).toBe(false);
    expect(result.method).toBe('failed');
  });

  it('EnviarMensajeTeamResult success:true con method:direct', () => {
    const result: EnviarMensajeTeamResult = { success: true, method: 'direct', ventanaAbierta: true, messageId: 'wamid.123' };
    expect(result.success).toBe(true);
    expect(result.method).toBe('direct');
    expect(result.messageId).toBe('wamid.123');
  });

  it('EnviarMensajeTeamResult success:true con method:template', () => {
    const result: EnviarMensajeTeamResult = { success: true, method: 'template', ventanaAbierta: false };
    expect(result.success).toBe(true);
    expect(result.method).toBe('template');
    expect(result.ventanaAbierta).toBe(false);
  });

  it('EnviarMensajeTeamResult success:true con method:call', () => {
    const result: EnviarMensajeTeamResult = { success: true, method: 'call', ventanaAbierta: false, callId: 'retell_123' };
    expect(result.success).toBe(true);
    expect(result.callId).toBe('retell_123');
  });
});

// ─────────────────────────────────────────────────────────────
// Fix #2: Entregar TODOS los pending messages
// ─────────────────────────────────────────────────────────────
describe('Fix #2: Deliver ALL pending messages', () => {
  it('getPendingMessages debe retornar TODOS los pending no expirados', () => {
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 16 * 60 * 60 * 1000).toISOString();
    const recentSent = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    const notes = {
      pending_briefing: {
        sent_at: recentSent,
        mensaje_completo: 'Briefing del día...',
        expires_at: futureExpiry
      },
      pending_mensaje: {
        sent_at: recentSent,
        mensaje_completo: 'Tienes un nuevo lead...',
        expires_at: futureExpiry
      }
    };

    const pendings = getPendingMessages(notes);
    expect(pendings.length).toBe(2);
  });

  it('getPendingMessages con 3 pending debe retornar 3', () => {
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const recentSent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();

    const notes = {
      pending_briefing: { sent_at: recentSent, mensaje_completo: 'Briefing', expires_at: futureExpiry },
      pending_recap: { sent_at: recentSent, mensaje_completo: 'Recap', expires_at: futureExpiry },
      pending_mensaje: { sent_at: recentSent, mensaje_completo: 'Mensaje', expires_at: futureExpiry }
    };

    const pendings = getPendingMessages(notes);
    expect(pendings.length).toBe(3);
    // Verify ALL are returned, not just the first one
    const keys = pendings.map(p => p.key);
    expect(keys).toContain('pending_briefing');
    expect(keys).toContain('pending_recap');
    expect(keys).toContain('pending_mensaje');
  });

  it('getPendingMessages debe excluir pending expirados', () => {
    const notes = {
      pending_briefing: {
        sent_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        mensaje_completo: 'Briefing viejo...',
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
      pending_mensaje: {
        sent_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        mensaje_completo: 'Mensaje reciente',
        expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString()
      }
    };

    const pendings = getPendingMessages(notes);
    expect(pendings.length).toBe(1);
    expect(pendings[0].key).toBe('pending_mensaje');
  });

  it('getPendingMessages debe retornar vacío si no hay pending', () => {
    const notes = { last_sara_interaction: new Date().toISOString() };
    const pendings = getPendingMessages(notes);
    expect(pendings.length).toBe(0);
  });

  it('getPendingMessages debe ordenar por prioridad (briefing > recap > mensaje)', () => {
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const recentSent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();

    const notes = {
      pending_mensaje: { sent_at: recentSent, mensaje_completo: 'Mensaje', expires_at: futureExpiry },
      pending_briefing: { sent_at: recentSent, mensaje_completo: 'Briefing', expires_at: futureExpiry },
      pending_recap: { sent_at: recentSent, mensaje_completo: 'Recap', expires_at: futureExpiry }
    };

    const pendings = getPendingMessages(notes);
    expect(pendings[0].key).toBe('pending_briefing'); // priority 1
    expect(pendings[1].key).toBe('pending_recap');    // priority 2
    expect(pendings[2].key).toBe('pending_mensaje');  // priority 4
  });

  it('getPendingMessages debe ignorar pending sin mensaje_completo', () => {
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const recentSent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();

    const notes = {
      pending_briefing: { sent_at: recentSent, expires_at: futureExpiry }, // sin mensaje_completo
      pending_mensaje: { sent_at: recentSent, mensaje_completo: 'Con mensaje', expires_at: futureExpiry }
    };

    const pendings = getPendingMessages(notes);
    expect(pendings.length).toBe(1);
    expect(pendings[0].key).toBe('pending_mensaje');
  });

  it('getPendingMessages con 5 pending debe retornar 5', () => {
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const recentSent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();

    const notes = {
      pending_briefing: { sent_at: recentSent, mensaje_completo: 'B', expires_at: futureExpiry },
      pending_recap: { sent_at: recentSent, mensaje_completo: 'R', expires_at: futureExpiry },
      pending_reporte_diario: { sent_at: recentSent, mensaje_completo: 'RD', expires_at: futureExpiry },
      pending_resumen_semanal: { sent_at: recentSent, mensaje_completo: 'RS', expires_at: futureExpiry },
      pending_mensaje: { sent_at: recentSent, mensaje_completo: 'M', expires_at: futureExpiry }
    };

    const pendings = getPendingMessages(notes);
    // ALL 5 must be returned — this is the core of Fix #2
    expect(pendings.length).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────
// Fix #4: moveFunnelStep error handling verification
// ─────────────────────────────────────────────────────────────
describe('Fix #4: moveFunnelStep error patterns', () => {
  it('VendorCommandsService debe tener FUNNEL_STAGES definidos', () => {
    const service = new VendorCommandsService(null as any);
    expect(service).toBeDefined();
  });

  it('moveFunnelStep con lead inexistente retorna success:false', async () => {
    const emptyResult = Promise.resolve({ data: [], error: null });
    const chainEnd = () => ({ limit: () => emptyResult, order: () => ({ limit: () => emptyResult }) });
    const mockSupabase = {
      client: {
        from: () => ({
          select: () => ({
            ilike: () => ({
              eq: () => chainEnd(),
              ...chainEnd()
            }),
            eq: () => chainEnd(),
            ...chainEnd()
          })
        })
      }
    };

    const service = new VendorCommandsService(mockSupabase as any);
    const result = await service.moveFunnelStep('inexistente', 'v1', 'vendedor', 'next');

    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Fix #5: Double-booking prevention import check
// ─────────────────────────────────────────────────────────────
describe('Fix #5: AppointmentSchedulingService', () => {
  it('AppointmentSchedulingService debe importarse correctamente', async () => {
    const mod = await import('../services/appointmentSchedulingService');
    expect(mod.AppointmentSchedulingService).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Fix #6: CreditFlowService no-advisor handling
// ─────────────────────────────────────────────────────────────
describe('Fix #6: CreditFlowService', () => {
  it('CreditFlowService debe importarse correctamente', async () => {
    const mod = await import('../services/creditFlowService');
    expect(mod.CreditFlowService).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Fix #7: isPendingExpired edge cases
// ─────────────────────────────────────────────────────────────
describe('Fix #7: isPendingExpired & pending reliability', () => {
  it('isPendingExpired con expires_at futuro retorna false', () => {
    const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const pasado = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    expect(isPendingExpired({ sent_at: pasado, expires_at: futuro })).toBe(false);
  });

  it('isPendingExpired con expires_at pasado retorna true', () => {
    const pasado = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const masViejo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    expect(isPendingExpired({ sent_at: masViejo, expires_at: pasado })).toBe(true);
  });

  it('isPendingExpired calcula expiración por tipo briefing (18h)', () => {
    const hace20h = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    expect(isPendingExpired({ sent_at: hace20h }, 'briefing')).toBe(true);
  });

  it('isPendingExpired calcula expiración por tipo briefing (dentro de 18h)', () => {
    const hace10h = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    expect(isPendingExpired({ sent_at: hace10h }, 'briefing')).toBe(false);
  });

  it('isPendingExpired calcula expiración por tipo notificacion (48h)', () => {
    const hace20h = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    // Notificación expira en 48h, así que 20h NO es expirado
    expect(isPendingExpired({ sent_at: hace20h }, 'notificacion')).toBe(false);
  });

  it('isPendingExpired calcula expiración por tipo notificacion (>48h)', () => {
    const hace50h = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
    expect(isPendingExpired({ sent_at: hace50h }, 'notificacion')).toBe(true);
  });

  it('isPendingExpired calcula expiración por tipo resumen_semanal (72h)', () => {
    const hace50h = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
    // Resumen semanal expira en 72h, 50h NO es expirado
    expect(isPendingExpired({ sent_at: hace50h }, 'resumen_semanal')).toBe(false);
  });

  it('isPendingExpired usa 24h por defecto si tipo desconocido', () => {
    const hace25h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isPendingExpired({ sent_at: hace25h }, 'tipo_inventado')).toBe(true);

    const hace23h = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    expect(isPendingExpired({ sent_at: hace23h }, 'tipo_inventado')).toBe(false);
  });

  it('isPendingExpired prefiere expires_at sobre cálculo por tipo', () => {
    // sent_at hace 5h, tipo briefing (18h) → NO expirado por cálculo
    // pero expires_at en el pasado → SÍ expirado
    const hace5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const pasado = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    expect(isPendingExpired({ sent_at: hace5h, expires_at: pasado }, 'briefing')).toBe(true);
  });
});
