import { describe, it, expect, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Email Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  sendEmail,
  renderTemplate,
  getTemplate,
  listTemplates,
  createTemplate,
  updateTemplate,
  sendTemplateEmail,
} from '../services/emailService';

// ═══════════════════════════════════════════════════════════════════════════
// SMS Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  formatPhoneForSMS,
  sendSMS,
} from '../services/smsService';
import type { TwilioConfig } from '../services/smsService';

// ═══════════════════════════════════════════════════════════════════════════
// Communication Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  logCommunication,
  getTimeline,
  getRecentCommunications,
  updateCommunicationStatus,
  getCommunicationStats,
} from '../services/communicationService';

// ═══════════════════════════════════════════════════════════════════════════
// Channel Router
// ═══════════════════════════════════════════════════════════════════════════
import {
  isWhatsAppWindowOpen,
  getAvailableChannels,
  getBestChannel,
  sendViaBestChannel,
} from '../services/channelRouter';
import type { LeadContact, SendParams } from '../services/channelRouter';


// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE HELPER
// ═══════════════════════════════════════════════════════════════════════════

function createMockSupabase(mockData: any = [], mockError: any = null, mockCount: number | null = null) {
  const chainable: any = {};
  const methods = [
    'from', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'in', 'lt', 'ilike', 'gte', 'lte',
    'order', 'range', 'limit', 'single', 'maybeSingle',
  ];
  for (const m of methods) {
    chainable[m] = (..._args: any[]) => chainable;
  }
  // Prevent automatic Promise detection
  chainable.then = undefined;

  // select needs special handling for count option
  chainable.select = (..._args: any[]) => {
    return chainable;
  };

  // Terminal: .single() resolves to first element of array or the data itself
  chainable.single = () => {
    return Promise.resolve({
      data: Array.isArray(mockData) ? mockData[0] ?? null : mockData,
      error: mockError,
    });
  };

  // Default resolution for awaiting the chain directly
  Object.defineProperty(chainable, 'then', {
    get() {
      return (resolve: any) =>
        resolve({
          data: mockData,
          error: mockError,
          count: mockCount ?? (Array.isArray(mockData) ? mockData.length : 0),
        });
    },
    configurable: true,
  });

  return {
    client: {
      from: () => chainable,
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
    getTenantId: () => '00000000-0000-0000-0000-000000000001',
  } as any;
}

// Convenience: mock that always errors
function createErrorSupabase(message = 'db_error') {
  return createMockSupabase(null, { message, code: 'ERROR' });
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// 1. EMAIL SERVICE
// ─────────────────────────────────────────────────────────────────────────

describe('Email Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── renderTemplate ──────────────────────────────────────────────────

  describe('renderTemplate', () => {
    it('replaces a single variable', () => {
      const html = '<p>Hola {{nombre}}</p>';
      const result = renderTemplate(html, { nombre: 'Juan' });
      expect(result).toBe('<p>Hola Juan</p>');
    });

    it('replaces multiple variables', () => {
      const html = '<p>{{saludo}} {{nombre}}, tu cita es el {{fecha}}</p>';
      const result = renderTemplate(html, {
        saludo: 'Hola',
        nombre: 'María',
        fecha: '15 de marzo',
      });
      expect(result).toBe('<p>Hola María, tu cita es el 15 de marzo</p>');
    });

    it('leaves missing variables as-is', () => {
      const html = '<p>Hola {{nombre}}, tu código es {{codigo}}</p>';
      const result = renderTemplate(html, { nombre: 'Pedro' });
      expect(result).toBe('<p>Hola Pedro, tu código es {{codigo}}</p>');
    });

    it('handles empty variables object', () => {
      const html = '<p>{{foo}} {{bar}}</p>';
      const result = renderTemplate(html, {});
      expect(result).toBe('<p>{{foo}} {{bar}}</p>');
    });

    it('replaces all occurrences of the same variable', () => {
      const html = '<p>{{x}} y {{x}}</p>';
      const result = renderTemplate(html, { x: 'ABC' });
      expect(result).toBe('<p>ABC y ABC</p>');
    });

    it('handles empty html string', () => {
      const result = renderTemplate('', { nombre: 'Test' });
      expect(result).toBe('');
    });

    it('handles html with no placeholders', () => {
      const html = '<p>Sin variables</p>';
      const result = renderTemplate(html, { nombre: 'Test' });
      expect(result).toBe('<p>Sin variables</p>');
    });
  });

  // ── sendEmail ───────────────────────────────────────────────────────

  describe('sendEmail', () => {
    it('returns error when API key is empty', async () => {
      const result = await sendEmail('', {
        from: 'test@test.com',
        to: 'dest@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });
      expect(result.id).toBeNull();
      expect(result.error).toContain('RESEND_API_KEY not configured');
    });

    it('sends email successfully via fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-123' }), { status: 200 })
      );
      globalThis.fetch = mockFetch;

      const result = await sendEmail('re_test_key', {
        from: 'SARA <no-reply@gruposantarita.com>',
        to: 'user@example.com',
        subject: 'Bienvenido',
        html: '<p>Hola</p>',
      });

      expect(result.id).toBe('email-123');
      expect(result.error).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles Resend API error response with JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 403 })
      );
      globalThis.fetch = mockFetch;

      const result = await sendEmail('bad_key', {
        from: 'test@test.com',
        to: 'dest@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });

      expect(result.id).toBeNull();
      expect(result.error).toBe('Invalid API key');
    });

    it('handles Resend API error response with non-JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('Server Error', { status: 500, statusText: 'Internal Server Error' })
      );
      globalThis.fetch = mockFetch;

      const result = await sendEmail('re_test_key', {
        from: 'test@test.com',
        to: 'dest@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });

      expect(result.id).toBeNull();
      expect(result.error).toContain('500');
    });

    it('handles network error (fetch throws)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
      globalThis.fetch = mockFetch;

      const result = await sendEmail('re_test_key', {
        from: 'test@test.com',
        to: 'dest@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });

      expect(result.id).toBeNull();
      expect(result.error).toBe('Network failure');
    });

    it('sends to array of recipients', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-multi' }), { status: 200 })
      );
      globalThis.fetch = mockFetch;

      const result = await sendEmail('re_test_key', {
        from: 'test@test.com',
        to: ['a@test.com', 'b@test.com'],
        subject: 'Multi',
        html: '<p>Multi</p>',
      });

      expect(result.id).toBe('email-multi');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.to).toEqual(['a@test.com', 'b@test.com']);
    });

    it('includes reply_to when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-rt' }), { status: 200 })
      );
      globalThis.fetch = mockFetch;

      await sendEmail('re_test_key', {
        from: 'test@test.com',
        to: 'dest@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        reply_to: 'reply@test.com',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reply_to).toBe('reply@test.com');
    });

    it('includes tags when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-tags' }), { status: 200 })
      );
      globalThis.fetch = mockFetch;

      await sendEmail('re_test_key', {
        from: 'test@test.com',
        to: 'dest@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        tags: [{ name: 'campaign', value: 'promo' }],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tags).toEqual([{ name: 'campaign', value: 'promo' }]);
    });
  });

  // ── getTemplate ─────────────────────────────────────────────────────

  describe('getTemplate', () => {
    it('returns template when found', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        slug: 'bienvenida',
        name: 'Bienvenida',
        subject: 'Hola {{nombre}}',
        html_body: '<p>Bienvenido {{nombre}}</p>',
        variables: ['nombre'],
        category: 'onboarding',
        active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };
      const supabase = createMockSupabase(mockTemplate);
      const result = await getTemplate(supabase, 'bienvenida');
      expect(result).toEqual(mockTemplate);
    });

    it('returns null when template not found', async () => {
      const supabase = createMockSupabase(null, { message: 'not found', code: 'PGRST116' });
      const result = await getTemplate(supabase, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null and logs on unexpected error', async () => {
      const supabase = createErrorSupabase('connection_error');
      const result = await getTemplate(supabase, 'broken');
      expect(result).toBeNull();
    });
  });

  // ── listTemplates ───────────────────────────────────────────────────

  describe('listTemplates', () => {
    it('lists all active templates', async () => {
      const templates = [
        { id: '1', slug: 'a', name: 'A', category: 'general' },
        { id: '2', slug: 'b', name: 'B', category: 'sales' },
      ];
      const supabase = createMockSupabase(templates);
      const result = await listTemplates(supabase);
      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe('a');
    });

    it('filters by category', async () => {
      const templates = [{ id: '1', slug: 'promo', category: 'marketing' }];
      const supabase = createMockSupabase(templates);
      const result = await listTemplates(supabase, 'marketing');
      expect(result).toHaveLength(1);
    });

    it('returns empty array on error', async () => {
      const supabase = createErrorSupabase();
      const result = await listTemplates(supabase);
      expect(result).toEqual([]);
    });

    it('returns empty array when no data', async () => {
      const supabase = createMockSupabase(null, null);
      const result = await listTemplates(supabase);
      expect(result).toEqual([]);
    });
  });

  // ── createTemplate ──────────────────────────────────────────────────

  describe('createTemplate', () => {
    it('creates template with defaults', async () => {
      const created = {
        id: 'new-1',
        slug: 'welcome',
        name: 'Welcome',
        subject: 'Welcome!',
        html_body: '<p>Hi</p>',
        variables: [],
        category: 'general',
        active: true,
        created_at: '2026-03-01',
        updated_at: '2026-03-01',
      };
      const supabase = createMockSupabase(created);
      const result = await createTemplate(supabase, {
        slug: 'welcome',
        name: 'Welcome',
        subject: 'Welcome!',
        html_body: '<p>Hi</p>',
      });
      expect(result).toEqual(created);
    });

    it('creates template with explicit variables and category', async () => {
      const created = {
        id: 'new-2',
        slug: 'promo',
        name: 'Promo',
        subject: '{{discount}}% Off',
        html_body: '<p>{{discount}}% descuento</p>',
        variables: ['discount'],
        category: 'marketing',
        active: true,
      };
      const supabase = createMockSupabase(created);
      const result = await createTemplate(supabase, {
        slug: 'promo',
        name: 'Promo',
        subject: '{{discount}}% Off',
        html_body: '<p>{{discount}}% descuento</p>',
        variables: ['discount'],
        category: 'marketing',
      });
      expect(result).not.toBeNull();
      expect(result!.category).toBe('marketing');
    });

    it('returns null on error', async () => {
      const supabase = createErrorSupabase('duplicate slug');
      const result = await createTemplate(supabase, {
        slug: 'dup',
        name: 'Dup',
        subject: 'Dup',
        html_body: '<p></p>',
      });
      expect(result).toBeNull();
    });
  });

  // ── updateTemplate ──────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('updates template fields', async () => {
      const updated = {
        id: 'tpl-1',
        slug: 'bienvenida',
        name: 'Bienvenida v2',
        subject: 'Updated Subject',
        html_body: '<p>Updated</p>',
        active: true,
      };
      const supabase = createMockSupabase(updated);
      const result = await updateTemplate(supabase, 'tpl-1', {
        name: 'Bienvenida v2',
        subject: 'Updated Subject',
      });
      expect(result).toEqual(updated);
    });

    it('returns null on error', async () => {
      const supabase = createErrorSupabase('not found');
      const result = await updateTemplate(supabase, 'bad-id', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  // ── sendTemplateEmail ───────────────────────────────────────────────

  describe('sendTemplateEmail', () => {
    it('fetches template, renders, and sends email', async () => {
      const template = {
        id: 'tpl-1',
        slug: 'bienvenida',
        name: 'Bienvenida',
        subject: 'Hola {{nombre}}',
        html_body: '<p>Bienvenido {{nombre}} a {{desarrollo}}</p>',
        variables: ['nombre', 'desarrollo'],
        category: 'onboarding',
        active: true,
      };
      const supabase = createMockSupabase(template);

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'sent-1' }), { status: 200 })
      );
      globalThis.fetch = mockFetch;

      const result = await sendTemplateEmail(
        supabase,
        're_test_key',
        'bienvenida',
        'user@example.com',
        { nombre: 'Carlos', desarrollo: 'Monte Verde' }
      );

      expect(result.id).toBe('sent-1');
      expect(result.error).toBeUndefined();

      // Verify rendered content was sent
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.subject).toBe('Hola Carlos');
      expect(body.html).toContain('Bienvenido Carlos a Monte Verde');
    });

    it('returns error when template not found', async () => {
      const supabase = createMockSupabase(null, { message: 'not found', code: 'PGRST116' });

      const result = await sendTemplateEmail(
        supabase,
        're_test_key',
        'nonexistent',
        'user@example.com',
        { nombre: 'X' }
      );

      expect(result.id).toBeNull();
      expect(result.error).toContain('Template not found');
    });

    it('uses custom from address when provided', async () => {
      const template = {
        id: 'tpl-2',
        slug: 'custom-from',
        subject: 'Test',
        html_body: '<p>Test</p>',
        variables: [],
        active: true,
      };
      const supabase = createMockSupabase(template);

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'sent-cf' }), { status: 200 })
      );
      globalThis.fetch = mockFetch;

      await sendTemplateEmail(
        supabase,
        're_test_key',
        'custom-from',
        'user@example.com',
        {},
        'Custom <custom@example.com>'
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.from).toBe('Custom <custom@example.com>');
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────
// 2. SMS SERVICE
// ─────────────────────────────────────────────────────────────────────────

describe('SMS Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const twilioConfig: TwilioConfig = {
    accountSid: 'ACtest123',
    authToken: 'test_token',
    phoneNumber: '+15551234567',
  };

  // ── formatPhoneForSMS ───────────────────────────────────────────────

  describe('formatPhoneForSMS', () => {
    it('converts 10 digits to +52 prefix', () => {
      expect(formatPhoneForSMS('4921234567')).toBe('+524921234567');
    });

    it('converts 12 digits starting with 52 to + prefix', () => {
      expect(formatPhoneForSMS('524921234567')).toBe('+524921234567');
    });

    it('strips mobile 1 from 13 digits starting with 521', () => {
      expect(formatPhoneForSMS('5214921234567')).toBe('+524921234567');
    });

    it('keeps phone unchanged if already has + prefix', () => {
      expect(formatPhoneForSMS('+524921234567')).toBe('+524921234567');
    });

    it('adds + to other digit formats', () => {
      expect(formatPhoneForSMS('1234567890123456')).toBe('+1234567890123456');
    });

    it('strips non-digit characters before processing', () => {
      expect(formatPhoneForSMS('(492) 123-4567')).toBe('+524921234567');
    });

    it('handles 11 digit number (not matching any special case)', () => {
      const result = formatPhoneForSMS('12345678901');
      expect(result).toBe('+12345678901');
    });

    it('handles number with spaces', () => {
      expect(formatPhoneForSMS('492 123 4567')).toBe('+524921234567');
    });

    it('handles + with 12 digits starting with 52', () => {
      // Already has +, starts with +52...
      expect(formatPhoneForSMS('+524921234567')).toBe('+524921234567');
    });

    it('handles number with dashes and dots', () => {
      expect(formatPhoneForSMS('492.123.4567')).toBe('+524921234567');
    });
  });

  // ── sendSMS ─────────────────────────────────────────────────────────

  describe('sendSMS', () => {
    it('sends SMS successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sid: 'SM123abc' }), { status: 201 })
      );
      globalThis.fetch = mockFetch;

      const result = await sendSMS(twilioConfig, '4921234567', 'Hola desde SARA');

      expect(result.sid).toBe('SM123abc');
      expect(result.error).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify Twilio URL
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('ACtest123');
    });

    it('handles Twilio error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid phone number' }), { status: 400 })
      );
      globalThis.fetch = mockFetch;

      const result = await sendSMS(twilioConfig, '0000', 'Test');

      expect(result.sid).toBeNull();
      expect(result.error).toBe('Invalid phone number');
    });

    it('handles network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      globalThis.fetch = mockFetch;

      const result = await sendSMS(twilioConfig, '4921234567', 'Test');

      expect(result.sid).toBeNull();
      expect(result.error).toBe('Connection refused');
    });

    it('sends with basic auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sid: 'SM456' }), { status: 201 })
      );
      globalThis.fetch = mockFetch;

      await sendSMS(twilioConfig, '4921234567', 'Test');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toContain('Basic ');
    });

    it('formats phone number before sending', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sid: 'SM789' }), { status: 201 })
      );
      globalThis.fetch = mockFetch;

      await sendSMS(twilioConfig, '4921234567', 'Test');

      const body = mockFetch.mock.calls[0][1].body;
      expect(body).toContain(encodeURIComponent('+524921234567'));
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────
// 3. COMMUNICATION SERVICE
// ─────────────────────────────────────────────────────────────────────────

describe('Communication Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── logCommunication ────────────────────────────────────────────────

  describe('logCommunication', () => {
    it('logs communication with all fields', async () => {
      const comm = {
        id: 'comm-1',
        lead_id: 'lead-1',
        team_member_id: 'tm-1',
        channel: 'whatsapp',
        direction: 'outbound',
        content: 'Hola lead',
        subject: null,
        status: 'sent',
        external_id: 'wamid.123',
        template_id: null,
        metadata: { source: 'auto' },
        error_message: null,
        created_at: '2026-03-01',
      };
      const supabase = createMockSupabase(comm);

      const result = await logCommunication(supabase, {
        lead_id: 'lead-1',
        team_member_id: 'tm-1',
        channel: 'whatsapp',
        direction: 'outbound',
        content: 'Hola lead',
        status: 'sent',
        external_id: 'wamid.123',
        metadata: { source: 'auto' },
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('comm-1');
      expect(result!.channel).toBe('whatsapp');
    });

    it('logs communication with default values', async () => {
      const comm = {
        id: 'comm-2',
        lead_id: 'lead-2',
        team_member_id: null,
        channel: 'email',
        direction: 'inbound',
        content: 'Quiero info',
        subject: null,
        status: 'sent',
        external_id: null,
        template_id: null,
        metadata: {},
        error_message: null,
        created_at: '2026-03-01',
      };
      const supabase = createMockSupabase(comm);

      const result = await logCommunication(supabase, {
        lead_id: 'lead-2',
        channel: 'email',
        direction: 'inbound',
        content: 'Quiero info',
      });

      expect(result).not.toBeNull();
      expect(result!.team_member_id).toBeNull();
      expect(result!.status).toBe('sent');
    });

    it('returns null on error', async () => {
      const supabase = createErrorSupabase('insert failed');
      const result = await logCommunication(supabase, {
        lead_id: 'lead-x',
        channel: 'sms',
        direction: 'outbound',
        content: 'Test',
      });
      expect(result).toBeNull();
    });

    it('logs communication with error_message field', async () => {
      const comm = {
        id: 'comm-3',
        lead_id: 'lead-3',
        channel: 'sms',
        direction: 'outbound',
        content: 'Failed msg',
        status: 'failed',
        error_message: 'Invalid number',
      };
      const supabase = createMockSupabase(comm);

      const result = await logCommunication(supabase, {
        lead_id: 'lead-3',
        channel: 'sms',
        direction: 'outbound',
        content: 'Failed msg',
        status: 'failed',
        error_message: 'Invalid number',
      });

      expect(result).not.toBeNull();
      expect(result!.error_message).toBe('Invalid number');
    });
  });

  // ── getTimeline ─────────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('returns paginated timeline', async () => {
      const comms = [
        { id: 'c1', channel: 'whatsapp', created_at: '2026-03-01T12:00:00Z' },
        { id: 'c2', channel: 'email', created_at: '2026-03-01T11:00:00Z' },
      ];
      const supabase = createMockSupabase(comms, null, 5);

      const result = await getTimeline(supabase, 'lead-1', { page: 1, limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('filters by channel', async () => {
      const comms = [{ id: 'c1', channel: 'email' }];
      const supabase = createMockSupabase(comms, null, 1);

      const result = await getTimeline(supabase, 'lead-1', { channel: 'email' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].channel).toBe('email');
    });

    it('filters by direction', async () => {
      const comms = [{ id: 'c1', direction: 'inbound' }];
      const supabase = createMockSupabase(comms, null, 1);

      const result = await getTimeline(supabase, 'lead-1', { direction: 'inbound' });

      expect(result.data).toHaveLength(1);
    });

    it('returns empty on error', async () => {
      const supabase = createErrorSupabase();

      const result = await getTimeline(supabase, 'lead-x');

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('uses default pagination (page 1, limit 20)', async () => {
      const comms = [{ id: 'c1' }];
      const supabase = createMockSupabase(comms, null, 1);

      const result = await getTimeline(supabase, 'lead-1');

      expect(result.data).toHaveLength(1);
    });

    it('handles page 2 correctly', async () => {
      const comms = [{ id: 'c21' }];
      const supabase = createMockSupabase(comms, null, 25);

      const result = await getTimeline(supabase, 'lead-1', { page: 2, limit: 20 });

      expect(result.total).toBe(25);
    });
  });

  // ── getRecentCommunications ─────────────────────────────────────────

  describe('getRecentCommunications', () => {
    it('returns recent communications', async () => {
      const comms = [
        { id: 'r1', channel: 'whatsapp' },
        { id: 'r2', channel: 'email' },
      ];
      const supabase = createMockSupabase(comms);

      const result = await getRecentCommunications(supabase, 'lead-1');

      expect(result).toHaveLength(2);
    });

    it('filters by channel', async () => {
      const comms = [{ id: 'r1', channel: 'sms' }];
      const supabase = createMockSupabase(comms);

      const result = await getRecentCommunications(supabase, 'lead-1', 'sms');

      expect(result).toHaveLength(1);
    });

    it('returns empty array on error', async () => {
      const supabase = createErrorSupabase();

      const result = await getRecentCommunications(supabase, 'lead-x');

      expect(result).toEqual([]);
    });

    it('respects custom limit', async () => {
      const comms = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
      const supabase = createMockSupabase(comms);

      const result = await getRecentCommunications(supabase, 'lead-1', undefined, 3);

      expect(result).toHaveLength(3);
    });

    it('returns empty array when no data', async () => {
      const supabase = createMockSupabase(null, null);

      const result = await getRecentCommunications(supabase, 'lead-empty');

      expect(result).toEqual([]);
    });
  });

  // ── updateCommunicationStatus ───────────────────────────────────────

  describe('updateCommunicationStatus', () => {
    it('updates status successfully', async () => {
      const updated = { id: 'comm-1', status: 'delivered' };
      const supabase = createMockSupabase(updated);

      const result = await updateCommunicationStatus(supabase, 'comm-1', 'delivered');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('delivered');
    });

    it('updates status with error_message', async () => {
      const updated = { id: 'comm-2', status: 'failed', error_message: 'Bounce' };
      const supabase = createMockSupabase(updated);

      const result = await updateCommunicationStatus(supabase, 'comm-2', 'failed', 'Bounce');

      expect(result).not.toBeNull();
      expect(result!.error_message).toBe('Bounce');
    });

    it('returns null on error (not found)', async () => {
      const supabase = createErrorSupabase('not found');

      const result = await updateCommunicationStatus(supabase, 'bad-id', 'delivered');

      expect(result).toBeNull();
    });

    it('updates to read status', async () => {
      const updated = { id: 'comm-3', status: 'read' };
      const supabase = createMockSupabase(updated);

      const result = await updateCommunicationStatus(supabase, 'comm-3', 'read');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('read');
    });
  });

  // ── getCommunicationStats ───────────────────────────────────────────

  describe('getCommunicationStats', () => {
    it('counts correctly by channel/direction/status', async () => {
      const rows = [
        { channel: 'whatsapp', direction: 'outbound', status: 'sent' },
        { channel: 'whatsapp', direction: 'outbound', status: 'sent' },
        { channel: 'whatsapp', direction: 'outbound', status: 'delivered' },
        { channel: 'email', direction: 'outbound', status: 'sent' },
        { channel: 'sms', direction: 'inbound', status: 'delivered' },
      ];
      const supabase = createMockSupabase(rows);

      const result = await getCommunicationStats(supabase);

      expect(result.length).toBeGreaterThanOrEqual(4);
      const waSent = result.find(
        (r) => r.channel === 'whatsapp' && r.direction === 'outbound' && r.status === 'sent'
      );
      expect(waSent).toBeDefined();
      expect(waSent!.count).toBe(2);
    });

    it('returns empty array on error', async () => {
      const supabase = createErrorSupabase();
      const result = await getCommunicationStats(supabase);
      expect(result).toEqual([]);
    });

    it('returns empty array when no data', async () => {
      const supabase = createMockSupabase([]);
      const result = await getCommunicationStats(supabase);
      expect(result).toEqual([]);
    });

    it('applies lead_id filter', async () => {
      const rows = [
        { channel: 'whatsapp', direction: 'outbound', status: 'sent' },
      ];
      const supabase = createMockSupabase(rows);

      const result = await getCommunicationStats(supabase, { lead_id: 'lead-1' });

      expect(result).toHaveLength(1);
    });

    it('applies channel filter', async () => {
      const rows = [
        { channel: 'email', direction: 'outbound', status: 'delivered' },
      ];
      const supabase = createMockSupabase(rows);

      const result = await getCommunicationStats(supabase, { channel: 'email' });

      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe('email');
    });

    it('applies date range filters', async () => {
      const rows = [
        { channel: 'sms', direction: 'outbound', status: 'sent' },
      ];
      const supabase = createMockSupabase(rows);

      const result = await getCommunicationStats(supabase, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result).toHaveLength(1);
    });

    it('handles null data from DB', async () => {
      const supabase = createMockSupabase(null, null);
      const result = await getCommunicationStats(supabase);
      expect(result).toEqual([]);
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────
// 4. CHANNEL ROUTER
// ─────────────────────────────────────────────────────────────────────────

describe('Channel Router', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── isWhatsAppWindowOpen ────────────────────────────────────────────

  describe('isWhatsAppWindowOpen', () => {
    it('returns true when last message is within 24h', () => {
      const recent = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
      expect(isWhatsAppWindowOpen(recent)).toBe(true);
    });

    it('returns false when last message is beyond 24h', () => {
      const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(); // 25 hours ago
      expect(isWhatsAppWindowOpen(old)).toBe(false);
    });

    it('returns false when lastMessageAt is null', () => {
      expect(isWhatsAppWindowOpen(null)).toBe(false);
    });

    it('returns false when exactly at 24h boundary', () => {
      const exact24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(isWhatsAppWindowOpen(exact24h)).toBe(false);
    });

    it('returns true for very recent message (1 minute ago)', () => {
      const veryRecent = new Date(Date.now() - 60 * 1000).toISOString();
      expect(isWhatsAppWindowOpen(veryRecent)).toBe(true);
    });

    it('returns true for message 23h59m ago', () => {
      const almost24h = new Date(Date.now() - (24 * 60 * 60 * 1000 - 60000)).toISOString();
      expect(isWhatsAppWindowOpen(almost24h)).toBe(true);
    });
  });

  // ── getAvailableChannels ────────────────────────────────────────────

  describe('getAvailableChannels', () => {
    it('returns [whatsapp, sms] for phone only', () => {
      const lead: LeadContact = { phone: '4921234567' };
      const channels = getAvailableChannels(lead);
      expect(channels).toContain('whatsapp');
      expect(channels).toContain('sms');
      expect(channels).not.toContain('email');
    });

    it('returns [whatsapp, sms, email] for phone + email', () => {
      const lead: LeadContact = { phone: '4921234567', email: 'test@test.com' };
      const channels = getAvailableChannels(lead);
      expect(channels).toContain('whatsapp');
      expect(channels).toContain('sms');
      expect(channels).toContain('email');
    });

    it('returns empty array when no contact info', () => {
      const lead: LeadContact = { phone: '' };
      const channels = getAvailableChannels(lead);
      expect(channels).toEqual([]);
    });

    it('returns [email] for email only (no phone)', () => {
      const lead: LeadContact = { phone: '', email: 'user@example.com' };
      const channels = getAvailableChannels(lead);
      expect(channels).toEqual(['email']);
    });

    it('does not include email when email is null', () => {
      const lead: LeadContact = { phone: '4921234567', email: null };
      const channels = getAvailableChannels(lead);
      expect(channels).not.toContain('email');
    });
  });

  // ── getBestChannel ──────────────────────────────────────────────────

  describe('getBestChannel', () => {
    it('returns preferred channel when set and available', () => {
      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        preferred_channel: 'email',
      };
      expect(getBestChannel(lead)).toBe('email');
    });

    it('returns whatsapp when window is open', () => {
      const lead: LeadContact = {
        phone: '4921234567',
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      };
      expect(getBestChannel(lead)).toBe('whatsapp');
    });

    it('returns email when whatsapp window is closed and email available', () => {
      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      };
      expect(getBestChannel(lead)).toBe('email');
    });

    it('returns sms as last resort', () => {
      const lead: LeadContact = {
        phone: '4921234567',
        last_message_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      };
      expect(getBestChannel(lead)).toBe('sms');
    });

    it('returns none when no channels available', () => {
      const lead: LeadContact = { phone: '' };
      expect(getBestChannel(lead)).toBe('none');
    });

    it('ignores preferred channel if not available', () => {
      const lead: LeadContact = {
        phone: '4921234567',
        preferred_channel: 'email', // no email set
      };
      // WA window closed, no email → sms
      expect(getBestChannel(lead)).toBe('sms');
    });

    it('returns preferred sms when preferred and available', () => {
      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        preferred_channel: 'sms',
      };
      expect(getBestChannel(lead)).toBe('sms');
    });
  });

  // ── sendViaBestChannel ──────────────────────────────────────────────

  describe('sendViaBestChannel', () => {
    const mockSendWA = vi.fn();
    const mockSendEmail = vi.fn();
    const mockSendSMS = vi.fn();

    beforeEach(() => {
      mockSendWA.mockReset();
      mockSendEmail.mockReset();
      mockSendSMS.mockReset();
    });

    it('sends via WhatsApp when window is open', async () => {
      mockSendWA.mockResolvedValue('wamid.123');

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Hola!',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('whatsapp');
      expect(result.success).toBe(true);
      expect(result.external_id).toBe('wamid.123');
      expect(mockSendWA).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('falls back to email when WhatsApp fails', async () => {
      mockSendWA.mockResolvedValue(null);
      mockSendEmail.mockResolvedValue('email-id-456');

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Hola!',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('email');
      expect(result.success).toBe(true);
      expect(result.external_id).toBe('email-id-456');
    });

    it('falls back to email when WhatsApp throws', async () => {
      mockSendWA.mockRejectedValue(new Error('WA error'));
      mockSendEmail.mockResolvedValue('email-fallback');

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Hola!',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('email');
      expect(result.success).toBe(true);
    });

    it('falls back to SMS when WA and email both fail', async () => {
      mockSendWA.mockResolvedValue(null);
      mockSendEmail.mockResolvedValue(null);
      mockSendSMS.mockResolvedValue('SM789');

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Hola!',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('sms');
      expect(result.success).toBe(true);
      expect(result.external_id).toBe('SM789');
    });

    it('returns failure when all channels fail', async () => {
      mockSendWA.mockResolvedValue(null);
      mockSendEmail.mockResolvedValue(null);
      mockSendSMS.mockResolvedValue(null);

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Hola!',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('none');
      expect(result.success).toBe(false);
      expect(result.error).toContain('All channels exhausted');
    });

    it('sends email directly when WA window is closed', async () => {
      mockSendEmail.mockResolvedValue('email-direct');

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Info',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('email');
      expect(result.success).toBe(true);
      expect(mockSendWA).not.toHaveBeenCalled();
    });

    it('sends SMS as last resort when no email', async () => {
      mockSendSMS.mockResolvedValue('SM-last');

      const lead: LeadContact = {
        phone: '4921234567',
        last_message_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Aviso',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('sms');
      expect(result.success).toBe(true);
    });

    it('returns failure when lead has no contact info', async () => {
      const lead: LeadContact = { phone: '' };

      const result = await sendViaBestChannel({
        lead,
        content: 'Hola',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.success).toBe(false);
      expect(result.channel_used).toBe('none');
    });

    it('uses subject for email when provided', async () => {
      mockSendEmail.mockResolvedValue('email-subj');

      const lead: LeadContact = {
        phone: '',
        email: 'test@test.com',
      };

      const result = await sendViaBestChannel({
        lead,
        content: '<p>Hello</p>',
        subject: 'Custom Subject',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('email');
      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith('test@test.com', 'Custom Subject', '<p>Hello</p>');
    });

    it('uses default subject for email when none provided', async () => {
      mockSendEmail.mockResolvedValue('email-def-subj');

      const lead: LeadContact = {
        phone: '',
        email: 'test@test.com',
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Info',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        'test@test.com',
        'Mensaje de Grupo Santa Rita',
        'Info'
      );
    });

    it('handles all channels throwing exceptions', async () => {
      mockSendWA.mockRejectedValue(new Error('WA down'));
      mockSendEmail.mockRejectedValue(new Error('Email down'));
      mockSendSMS.mockRejectedValue(new Error('SMS down'));

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Emergency',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.success).toBe(false);
      expect(result.channel_used).toBe('none');
    });

    it('skips WhatsApp attempt when window is closed even with phone', async () => {
      mockSendEmail.mockResolvedValue('email-skip-wa');

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: null,
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Info',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('email');
      expect(mockSendWA).not.toHaveBeenCalled();
    });

    it('tries SMS after email fails when WA window is closed', async () => {
      mockSendEmail.mockResolvedValue(null);
      mockSendSMS.mockResolvedValue('SM-after-email');

      const lead: LeadContact = {
        phone: '4921234567',
        email: 'test@test.com',
        last_message_at: null,
      };

      const result = await sendViaBestChannel({
        lead,
        content: 'Info',
        sendWhatsApp: mockSendWA,
        sendEmail: mockSendEmail,
        sendSMS: mockSendSMS,
      });

      expect(result.channel_used).toBe('sms');
      expect(result.success).toBe(true);
    });
  });
});
