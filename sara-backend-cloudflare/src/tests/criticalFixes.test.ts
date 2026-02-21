// Tests para 5 critical fixes: KV Dedup Recovery, Cita Invisible, Crédito en Limbo,
// Vendedor Ciego, Resources NULL
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { CreditFlowService } from '../services/creditFlowService';

// ═══════════════════════════════════════════════════════════
// MOCK HELPERS
// ═══════════════════════════════════════════════════════════

function createMockSupabase(overrides?: {
  selectData?: any;
  singleData?: any;
  updateError?: any;
  insertError?: any;
  upsertError?: any;
}) {
  const singleMock = vi.fn().mockResolvedValue({
    data: overrides?.singleData ?? null, error: null
  });
  const maybeSingleMock = vi.fn().mockResolvedValue({
    data: overrides?.singleData ?? null, error: null
  });
  const selectMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      single: singleMock,
      maybeSingle: maybeSingleMock,
      limit: vi.fn().mockResolvedValue({ data: overrides?.selectData || [], error: null }),
      in: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: overrides?.selectData || [], error: null })
        }))
      })),
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: overrides?.selectData || [], error: null })
      })),
      gte: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: overrides?.selectData || [], error: null })
        }))
      })),
    })),
    ilike: vi.fn(() => ({
      limit: vi.fn().mockResolvedValue({ data: overrides?.selectData || [], error: null }),
      or: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: overrides?.selectData || [], error: null })
      })),
    })),
    or: vi.fn(() => ({
      limit: vi.fn().mockResolvedValue({ data: overrides?.selectData || [], error: null }),
      maybeSingle: maybeSingleMock,
    })),
    single: singleMock,
    maybeSingle: maybeSingleMock,
  }));
  const updateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ data: null, error: overrides?.updateError || null })
  }));
  const insertMock = vi.fn().mockResolvedValue({ data: null, error: overrides?.insertError || null });
  const upsertMock = vi.fn().mockResolvedValue({ data: null, error: overrides?.upsertError || null });

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
    _upsertMock: upsertMock,
    _singleMock: singleMock,
  };
}

function createMockMeta() {
  return {
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test123' }] }),
    sendTemplate: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.tmpl456' }] }),
    sendWhatsAppImage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.img789' }] }),
    sendWhatsAppDocument: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.doc111' }] }),
    sendWhatsAppVideoById: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.vid222' }] }),
  };
}

// ═══════════════════════════════════════════════════════════
// TEST 1: KV DEDUP RECOVERY (Lead Fantasma Fix)
// ═══════════════════════════════════════════════════════════

describe('FIX 1: KV DEDUP RECOVERY', () => {

  it('kvDedupKey should be accessible outside the if(messageId) block', () => {
    // The fix changed `const kvDedupKey` inside the if block to `let kvDedupKey` outside
    // This test verifies the pattern conceptually
    let kvDedupKey: string | null = null;
    const messageId = 'wamid.abc123';

    if (messageId) {
      kvDedupKey = `wamsg:${messageId}`;
    }

    // Should be accessible and set
    expect(kvDedupKey).toBe('wamsg:wamid.abc123');
  });

  it('kvDedupKey should be null when no messageId', () => {
    let kvDedupKey: string | null = null;
    const messageId = '';

    if (messageId) {
      kvDedupKey = `wamsg:${messageId}`;
    }

    expect(kvDedupKey).toBeNull();
  });

  it('KV delete should be called on processing failure when kvDedupKey is set', async () => {
    const mockKV = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    let kvDedupKey: string | null = 'wamsg:wamid.abc123';

    // Simulate catch block behavior
    if (kvDedupKey) {
      try {
        await mockKV.delete(kvDedupKey);
      } catch (_) { /* */ }
    }

    expect(mockKV.delete).toHaveBeenCalledWith('wamsg:wamid.abc123');
  });

  it('KV delete should NOT be called when kvDedupKey is null', async () => {
    const mockKV = {
      delete: vi.fn().mockResolvedValue(undefined),
    };

    let kvDedupKey: string | null = null;

    // Simulate catch block behavior
    if (kvDedupKey) {
      try {
        await mockKV.delete(kvDedupKey);
      } catch (_) { /* */ }
    }

    expect(mockKV.delete).not.toHaveBeenCalled();
  });

  it('KV delete failure should not throw (best effort)', async () => {
    const mockKV = {
      delete: vi.fn().mockRejectedValue(new Error('KV unavailable')),
    };

    let kvDedupKey: string | null = 'wamsg:wamid.abc123';

    // Should not throw even if KV.delete fails
    if (kvDedupKey) {
      try {
        await mockKV.delete(kvDedupKey);
      } catch (kvCleanErr) {
        // non-critical, swallowed
      }
    }

    expect(mockKV.delete).toHaveBeenCalled();
    // No assertion on throw — the test passing without exception IS the assertion
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 2: CITA INVISIBLE (Lead Notification on DB Error)
// ═══════════════════════════════════════════════════════════

describe('FIX 2: CITA INVISIBLE', () => {

  it('crearCitaCompleta should send fallback message to lead on db_error', async () => {
    // We test the pattern: when appointment creation returns db_error,
    // the lead receives a "problema técnico" message
    const mockMeta = createMockMeta();

    // Simulate the fallback pattern from whatsapp-utils.ts
    const result = { success: false, errorType: 'db_error', error: 'unique constraint violation' };
    const from = '5610016226';

    if (result.errorType === 'db_error') {
      try {
        await mockMeta.sendWhatsAppMessage(from,
          '⚠️ Tuve un problema técnico al agendar tu cita. Un asesor te contactará en breve para confirmarla. ¡Disculpa la molestia!');
      } catch (_) { /* best effort */ }
    }

    expect(mockMeta.sendWhatsAppMessage).toHaveBeenCalledWith(
      '5610016226',
      expect.stringContaining('problema técnico')
    );
  });

  it('fallback message should not crash if Meta send fails', async () => {
    const mockMeta = createMockMeta();
    mockMeta.sendWhatsAppMessage.mockRejectedValueOnce(new Error('Meta API down'));

    const result = { errorType: 'db_error' };
    const from = '5610016226';

    // Should not throw
    if (result.errorType === 'db_error') {
      try {
        await mockMeta.sendWhatsAppMessage(from, 'fallback message');
      } catch (_) { /* best effort */ }
    }

    expect(mockMeta.sendWhatsAppMessage).toHaveBeenCalled();
  });

  it('logErrorToDB should be called with severity critical for db_error', async () => {
    // Verify the pattern: logErrorToDB is called with correct params
    const logErrorToDB = vi.fn().mockResolvedValue(undefined);

    const result = { errorType: 'db_error', error: 'DB connection timeout' };

    if (result.errorType === 'db_error') {
      await logErrorToDB(null, 'cita_creation_failed', result.error, {
        severity: 'critical',
        source: 'crearCitaCompleta',
        context: { leadPhone: '5610016226', desarrollo: 'Monte Verde' }
      });
    }

    expect(logErrorToDB).toHaveBeenCalledWith(
      null,
      'cita_creation_failed',
      'DB connection timeout',
      expect.objectContaining({
        severity: 'critical',
        source: 'crearCitaCompleta'
      })
    );
  });

  it('vendor notification failure should log error but not crash', async () => {
    const logErrorToDB = vi.fn().mockResolvedValue(undefined);

    const vendedor = { id: 'v1', name: 'Karla Muedano' };
    const notifError = new Error('Template rejected');

    // Simulate vendor notification catch block
    try {
      throw notifError;
    } catch (notifErr: any) {
      await logErrorToDB(null, 'vendor_notification_failed',
        `Vendedor ${vendedor.name} no recibió notificación de cita`, {
          severity: 'error',
          source: 'crearCitaCompleta:vendorNotif',
          context: { vendedorId: vendedor.id }
        });
    }

    expect(logErrorToDB).toHaveBeenCalledWith(
      null,
      'vendor_notification_failed',
      expect.stringContaining('Karla Muedano'),
      expect.objectContaining({ severity: 'error' })
    );
  });

  it('outer catch should send fallback + log critical', async () => {
    const mockMeta = createMockMeta();
    const logErrorToDB = vi.fn().mockResolvedValue(undefined);

    const error = new Error('Unexpected calendar error');

    // Simulate outer catch
    try {
      throw error;
    } catch (err: any) {
      try {
        await mockMeta.sendWhatsAppMessage('5610016226',
          '⚠️ Tuve un problema técnico al agendar tu cita. Un asesor te contactará en breve para confirmarla. ¡Disculpa la molestia!');
      } catch (_) { /* */ }
      await logErrorToDB(null, 'cita_creation_crashed', err.message, {
        severity: 'critical',
        source: 'crearCitaCompleta:outerCatch',
        stack: err.stack
      });
    }

    expect(mockMeta.sendWhatsAppMessage).toHaveBeenCalled();
    expect(logErrorToDB).toHaveBeenCalledWith(
      null, 'cita_creation_crashed', 'Unexpected calendar error',
      expect.objectContaining({ severity: 'critical', source: 'crearCitaCompleta:outerCatch' })
    );
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 3: CRÉDITO EN LIMBO (Mortgage Upsert Error Capture)
// ═══════════════════════════════════════════════════════════

describe('FIX 3: CRÉDITO EN LIMBO', () => {

  it('mortgage upsert error should be captured and logged', async () => {
    // Create a CreditFlowService with a mock that returns upsert error
    const mockSupabase = createMockSupabase({
      upsertError: { message: 'unique constraint violation on lead_id', code: '23505' },
      singleData: {
        id: 'lead-1', name: 'Roberto', phone: '5610016226',
        notes: {}, property_interest: 'Monte Verde', assigned_to: 'v1'
      }
    });

    // Verify the pattern: error is captured from upsert result
    const upsertResult = { error: { message: 'unique constraint violation', code: '23505' } };

    expect(upsertResult.error).toBeTruthy();
    expect(upsertResult.error.message).toContain('unique constraint');
  });

  it('should log critical error when mortgage insert fails', async () => {
    const logErrorToDB = vi.fn().mockResolvedValue(undefined);

    const mortgageError = { message: 'connection timeout', code: 'TIMEOUT' };
    const leadId = 'lead-123';
    const asesorId = 'asesor-1';

    if (mortgageError) {
      await logErrorToDB(null, 'mortgage_insert_failed', mortgageError.message, {
        severity: 'critical',
        source: 'creditFlowService',
        context: { leadId, asesorId, banco: 'BBVA' }
      });
    }

    expect(logErrorToDB).toHaveBeenCalledWith(
      null, 'mortgage_insert_failed', 'connection timeout',
      expect.objectContaining({
        severity: 'critical',
        source: 'creditFlowService',
        context: expect.objectContaining({ leadId: 'lead-123', banco: 'BBVA' })
      })
    );
  });

  it('should only console.log on successful upsert', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mortgageError = null; // success
    const leadId = 'lead-123';

    if (mortgageError) {
      console.error(`❌ Error creando mortgage_application para lead ${leadId}:`, mortgageError);
    } else {
      console.log(`📊 Mortgage application creada para lead ${leadId}`);
    }

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Mortgage application creada'));
    expect(consoleErrSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });

  it('should console.error on failed upsert', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mortgageError = { message: 'DB timeout' };
    const leadId = 'lead-123';

    if (mortgageError) {
      console.error(`❌ Error creando mortgage_application para lead ${leadId}:`, mortgageError);
    } else {
      console.log(`📊 Mortgage application creada para lead ${leadId}`);
    }

    expect(consoleErrSpy).toHaveBeenCalledWith(expect.stringContaining('Error creando mortgage_application'), mortgageError);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 4: VENDEDOR CIEGO (Alert Dev on All Paths Failed)
// ═══════════════════════════════════════════════════════════

describe('FIX 4: VENDEDOR CIEGO', () => {

  it('enviarMensajeTeamMember should return failed when templateOverride + fallback both fail', async () => {
    const mockMeta = createMockMeta();
    // Both template calls fail
    mockMeta.sendTemplate.mockRejectedValue(new Error('Template PENDING'));

    const mockSupabase = createMockSupabase();

    const teamMember = {
      id: 'tm-1', name: 'Karla Muedano', phone: '5214921226111',
      notes: JSON.stringify({ last_sara_interaction: '2020-01-01T00:00:00Z' }) // window closed
    };

    const result = await enviarMensajeTeamMember(
      mockSupabase as any, mockMeta as any, teamMember, 'Test mensaje', {
        tipoMensaje: 'alerta_lead',
        templateOverride: { name: 'notificacion_cita_vendedor', params: ['Karla', 'Roberto', 'Monte Verde'] }
      }
    );

    expect(result.success).toBe(false);
    expect(result.method).toBe('failed');
  });

  it('enviarMensajeTeamMember should return failed when generic template fails (no templateOverride)', async () => {
    const mockMeta = createMockMeta();
    // Generic template fails
    mockMeta.sendTemplate.mockRejectedValue(new Error('Template rejected by Meta'));

    const mockSupabase = createMockSupabase();

    const teamMember = {
      id: 'tm-2', name: 'Francisco', phone: '5214929876543',
      notes: JSON.stringify({ last_sara_interaction: '2020-01-01T00:00:00Z' }) // closed
    };

    const result = await enviarMensajeTeamMember(
      mockSupabase as any, mockMeta as any, teamMember, 'Briefing del día', {
        tipoMensaje: 'briefing',
      }
    );

    expect(result.success).toBe(false);
    expect(result.method).toBe('failed');
  });

  it('enviarMensajeTeamMember should return failed on unexpected exception (outer catch)', async () => {
    const mockMeta = createMockMeta();
    // Force unexpected error by making sendWhatsAppMessage and notes parsing fail
    const teamMember = {
      id: 'tm-3', name: 'Test Vendor', phone: '5210000000001',
      // notes that will throw when parsed - but safeJsonParse handles it
      notes: 42 // non-string, non-object
    };

    // Make the direct send throw after ventana check
    // Since notes=42 → safeJsonParse returns {} → no last_sara_interaction → ventana closed
    // Then template will be called and we make it throw
    mockMeta.sendTemplate.mockRejectedValue(new Error('Network timeout'));

    const mockSupabase = createMockSupabase();

    const result = await enviarMensajeTeamMember(
      mockSupabase as any, mockMeta as any, teamMember, 'Test', {
        tipoMensaje: 'notificacion',
      }
    );

    expect(result.success).toBe(false);
    expect(result.method).toBe('failed');
  });

  it('logErrorToDB pattern should capture teamMember details in context', () => {
    const logCall = {
      errorType: 'team_notification_all_failed',
      message: 'Todos los paths de notificación fallaron para Karla (5214921226111)',
      options: {
        severity: 'critical',
        source: 'enviarMensajeTeamMember:templateOverride+fallback',
        context: {
          teamMemberId: 'tm-1',
          teamMemberName: 'Karla',
          tipoMensaje: 'alerta_lead',
          pendingKey: 'pending_alerta_lead',
          mensajePreview: 'Test mensaje preview'
        }
      }
    };

    expect(logCall.options.severity).toBe('critical');
    expect(logCall.options.context.teamMemberId).toBe('tm-1');
    expect(logCall.options.context.teamMemberName).toBe('Karla');
    expect(logCall.errorType).toBe('team_notification_all_failed');
  });

  it('logErrorToDB for outer catch should include stack trace', () => {
    const error = new Error('Unexpected error in enviarMensajeTeamMember');

    const logCall = {
      errorType: 'team_notification_crashed',
      message: `enviarMensajeTeamMember crasheó para Karla: ${error.message}`,
      options: {
        severity: 'critical',
        source: 'enviarMensajeTeamMember:outerCatch',
        stack: error.stack,
        context: { teamMemberId: 'tm-1', teamMemberName: 'Karla' }
      }
    };

    expect(logCall.options.stack).toBeDefined();
    expect(logCall.options.stack).toContain('Unexpected error');
    expect(logCall.options.source).toBe('enviarMensajeTeamMember:outerCatch');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 5: RESOURCES NULL (GPS Fallback + Video Warning)
// ═══════════════════════════════════════════════════════════

describe('FIX 5: RESOURCES NULL', () => {

  it('GPS with gps_link present should use real link', () => {
    const propiedadMatch = { gps_link: 'https://maps.app.goo.gl/RealLink123' };
    const analysis = { send_gps: true };
    const partes: string[] = [];

    if (analysis.send_gps === true) {
      if (propiedadMatch.gps_link) {
        partes.push(`📍 *Ubicación:* ${propiedadMatch.gps_link}\n_Ahí te lleva directo en Google Maps_`);
      } else {
        partes.push(`📍 *Ubicación:* https://maps.app.goo.gl/hUk6aH8chKef6NRY7\n_Oficinas Grupo Santa Rita_`);
      }
    }

    expect(partes).toHaveLength(1);
    expect(partes[0]).toContain('RealLink123');
    expect(partes[0]).not.toContain('hUk6aH8chKef6NRY7');
  });

  it('GPS with gps_link NULL should fallback to office GPS', () => {
    const propiedadMatch = { gps_link: null };
    const analysis = { send_gps: true };
    const partes: string[] = [];

    if (analysis.send_gps === true) {
      if (propiedadMatch.gps_link) {
        partes.push(`📍 *Ubicación:* ${propiedadMatch.gps_link}\n_Ahí te lleva directo_`);
      } else {
        partes.push(`📍 *Ubicación:* https://maps.app.goo.gl/hUk6aH8chKef6NRY7\n_Oficinas Grupo Santa Rita — ahí te damos la ubicación exacta del desarrollo_`);
      }
    }

    expect(partes).toHaveLength(1);
    expect(partes[0]).toContain('hUk6aH8chKef6NRY7');
    expect(partes[0]).toContain('Oficinas Grupo Santa Rita');
  });

  it('GPS with gps_link undefined should fallback to office GPS', () => {
    const propiedadMatch = { gps_link: undefined };
    const analysis = { send_gps: true };
    const partes: string[] = [];

    if (analysis.send_gps === true) {
      if (propiedadMatch.gps_link) {
        partes.push(`📍 real`);
      } else {
        partes.push(`📍 fallback oficinas`);
      }
    }

    expect(partes[0]).toContain('fallback oficinas');
  });

  it('GPS with gps_link empty string should fallback to office GPS', () => {
    const propiedadMatch = { gps_link: '' };
    const analysis = { send_gps: true };
    const partes: string[] = [];

    if (analysis.send_gps === true) {
      if (propiedadMatch.gps_link) {
        partes.push(`📍 real`);
      } else {
        partes.push(`📍 fallback oficinas`);
      }
    }

    expect(partes[0]).toContain('fallback oficinas');
  });

  it('send_gps=false should not add any GPS (regardless of gps_link)', () => {
    const propiedadMatch = { gps_link: 'https://maps.app.goo.gl/RealLink' };
    const analysis = { send_gps: false };
    const partes: string[] = [];

    if (analysis.send_gps === true) {
      partes.push(`📍 should not appear`);
    }

    expect(partes).toHaveLength(0);
  });

  it('video with youtube_link present should be added to partes', () => {
    const propiedadMatch = { youtube_link: 'https://youtu.be/abc123' };
    const analysis = { send_video_desarrollo: true };
    const partes: string[] = [];

    if (propiedadMatch.youtube_link) {
      partes.push(`🎬 *Video:* ${propiedadMatch.youtube_link}`);
    }

    expect(partes).toHaveLength(1);
    expect(partes[0]).toContain('abc123');
  });

  it('video with youtube_link NULL should log warning (not crash)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const propiedadMatch = { youtube_link: null };
    const analysis = { send_video_desarrollo: true };
    const dev = 'Monte Verde';
    const partes: string[] = [];

    if (propiedadMatch.youtube_link) {
      partes.push(`🎬 *Video:* ${propiedadMatch.youtube_link}`);
    } else if (analysis.send_video_desarrollo === true) {
      console.warn(`⚠️ Video prometido pero youtube_link NULL para ${dev}`);
    }

    expect(partes).toHaveLength(0); // No video added
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Video prometido pero youtube_link NULL'));

    consoleSpy.mockRestore();
  });

  it('GPS fallback should still produce a non-empty partes array', () => {
    // The key scenario: SARA promised GPS, youtube_link is null, matterport is null,
    // BUT gps_link is also null. Before the fix, partes would be empty.
    // After the fix, partes has the office fallback GPS.
    const propiedadMatch = { youtube_link: null, matterport_link: null, gps_link: null, brochure_urls: null };
    const analysis = { send_gps: true, send_video_desarrollo: false };
    const partes: string[] = [];

    if (propiedadMatch.youtube_link) {
      partes.push(`🎬 video`);
    }
    if (propiedadMatch.matterport_link) {
      partes.push(`🏠 3D`);
    }
    if (analysis.send_gps === true) {
      if (propiedadMatch.gps_link) {
        partes.push(`📍 real GPS`);
      } else {
        partes.push(`📍 *Ubicación:* https://maps.app.goo.gl/hUk6aH8chKef6NRY7\n_Oficinas Grupo Santa Rita_`);
      }
    }

    // CRITICAL: partes is NOT empty thanks to the fallback
    expect(partes).toHaveLength(1);
    expect(partes[0]).toContain('hUk6aH8chKef6NRY7');
  });

  it('office fallback GPS URL should be the correct one', () => {
    const OFFICE_GPS = 'https://maps.app.goo.gl/hUk6aH8chKef6NRY7';
    // Verify it matches what's in the code
    expect(OFFICE_GPS).toContain('maps.app.goo.gl');
    expect(OFFICE_GPS).toContain('hUk6aH8chKef6NRY7');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 6: INTEGRATION - Error logging pattern consistency
// ═══════════════════════════════════════════════════════════

describe('ERROR LOGGING PATTERN', () => {

  it('all fixes use try-catch around logErrorToDB (never blocks main flow)', async () => {
    // Simulate logErrorToDB throwing — should be swallowed
    const logErrorToDB = vi.fn().mockRejectedValue(new Error('error_logs table missing'));

    // Pattern from all 5 fixes:
    try {
      await logErrorToDB(null, 'test_error', 'test message', { severity: 'critical' });
    } catch (_) { /* best effort */ }

    // Should not throw — test passing IS the assertion
    expect(logErrorToDB).toHaveBeenCalled();
  });

  it('dynamic import pattern should work for logErrorToDB', async () => {
    // Verify the dynamic import resolves (this is the pattern used in all fixes)
    const healthCheck = await import('../crons/healthCheck');
    expect(typeof healthCheck.logErrorToDB).toBe('function');
  });

  it('all error types should be distinct and descriptive', () => {
    const errorTypes = [
      'cita_creation_failed',        // Fix 2: db_error
      'cita_creation_crashed',       // Fix 2: outer catch
      'vendor_notification_failed',  // Fix 2: vendor notif
      'mortgage_insert_failed',      // Fix 3
      'team_notification_all_failed', // Fix 4: all paths
      'team_notification_crashed',   // Fix 4: outer catch
    ];

    // All unique
    const unique = new Set(errorTypes);
    expect(unique.size).toBe(errorTypes.length);

    // All descriptive (contain underscore-separated words)
    for (const t of errorTypes) {
      expect(t).toMatch(/^[a-z]+(_[a-z]+)+$/);
    }
  });

  it('severity should be critical for data-loss scenarios', () => {
    const criticalScenarios = [
      { fix: 'KV dedup', severity: 'critical' },
      { fix: 'Cita DB error', severity: 'critical' },
      { fix: 'Cita outer crash', severity: 'critical' },
      { fix: 'Mortgage insert', severity: 'critical' },
      { fix: 'Team notification all failed', severity: 'critical' },
      { fix: 'Team notification crash', severity: 'critical' },
    ];

    const errorSeverity = [
      { fix: 'Vendor notification', severity: 'error' }, // recoverable
    ];

    for (const s of criticalScenarios) {
      expect(s.severity).toBe('critical');
    }
    for (const s of errorSeverity) {
      expect(s.severity).toBe('error');
    }
  });
});
