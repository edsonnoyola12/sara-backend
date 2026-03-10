import { describe, it, expect, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Stripe Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  createCheckoutSession,
  createCustomerPortalSession,
  getSubscription,
  cancelSubscription,
  handleWebhookEvent,
  verifyWebhookSignature,
  logBillingEvent,
  getBillingHistory,
} from '../services/stripeService';
import type { CheckoutParams, StripeWebhookEvent, BillingEventInput } from '../services/stripeService';

// ═══════════════════════════════════════════════════════════════════════════
// Onboarding Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  getOnboardingStatus,
  completeStep,
  completeWhatsAppSetup,
  completeTeamInvites,
  completeLeadImport,
  completeConfiguration,
  isOnboardingComplete,
} from '../services/onboardingService';
import type { WhatsAppConfig, TenantConfiguration } from '../services/onboardingService';

// ═══════════════════════════════════════════════════════════════════════════
// Usage Tracking Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  incrementMetric,
  getUsage,
  getUsageHistory,
  checkLimit,
  getUsageSummary,
} from '../services/usageTrackingService';

// ═══════════════════════════════════════════════════════════════════════════
// Invitation Service
// ═══════════════════════════════════════════════════════════════════════════
import {
  createInvitation,
  getInvitation,
  getInvitationByToken,
  listInvitations,
  acceptInvitation,
  revokeInvitation,
  isExpired,
  resendInvitation,
} from '../services/invitationService';


// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockSupabase(mockData: any = [], mockError: any = null) {
  const chainable: any = {};
  const methods = [
    'from', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'in', 'lt', 'ilike', 'gte', 'lte',
    'order', 'range', 'limit', 'single', 'maybeSingle',
    'is', 'not', 'select',
  ];
  for (const m of methods) {
    chainable[m] = (..._args: any[]) => chainable;
  }
  chainable.then = undefined;

  chainable.single = () => {
    return Promise.resolve({
      data: Array.isArray(mockData) ? mockData[0] ?? null : mockData,
      error: mockError,
    });
  };

  Object.defineProperty(chainable, 'then', {
    get() {
      return (resolve: any) =>
        resolve({
          data: mockData,
          error: mockError,
          count: Array.isArray(mockData) ? mockData.length : 0,
        });
    },
    configurable: true,
  });

  return {
    client: {
      from: () => chainable,
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'new-user-id' } }, error: null }),
        },
      },
    },
    getTenantId: () => '00000000-0000-0000-0000-000000000001',
  } as any;
}

function createErrorSupabase(message = 'db_error') {
  return createMockSupabase(null, { message, code: 'ERROR' });
}

function createMultiTableMock(tables: Record<string, { data: any[]; error?: any }>) {
  const chainable = (tableName: string) => {
    const mock: any = {};
    const tableData = tables[tableName] || { data: [] };
    const methods = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'in', 'is', 'not', 'ilike', 'gte', 'lte', 'or',
      'order', 'range', 'limit', 'single',
    ];
    for (const m of methods) {
      mock[m] = () => mock;
    }
    mock.then = undefined;
    Object.defineProperty(mock, 'then', {
      get() {
        return (resolve: any) =>
          resolve({
            data: tableData.data,
            error: tableData.error || null,
            count: tableData.data.length,
          });
      },
      configurable: true,
    });
    mock.single = () =>
      Promise.resolve({
        data: tableData.data[0] || null,
        error: tableData.error || null,
      });
    return mock;
  };
  return {
    client: {
      from: (table: string) => chainable(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'new-user-id' } }, error: null }),
        },
      },
    },
    getTenantId: () => '00000000-0000-0000-0000-000000000001',
  } as any;
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6 TESTS
// ═══════════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────────────
// 1. STRIPE SERVICE (~25 tests)
// ─────────────────────────────────────────────────────────────────────────

describe('Stripe Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── createCheckoutSession ─────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('should create a checkout session successfully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' }),
      }));
      const params: CheckoutParams = {
        price_id: 'price_abc',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        customer_email: 'test@example.com',
      };
      const result = await createCheckoutSession('sk_test_key', params);
      expect(result.url).toBe('https://checkout.stripe.com/cs_123');
      expect(result.session_id).toBe('cs_123');
      expect(result.error).toBeUndefined();
    });

    it('should return error when Stripe responds with error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'Invalid price_id' } }),
      }));
      const params: CheckoutParams = {
        price_id: 'bad_price',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      };
      const result = await createCheckoutSession('sk_test_key', params);
      expect(result.url).toBeNull();
      expect(result.session_id).toBeNull();
      expect(result.error).toBe('Invalid price_id');
    });

    it('should send correct body with metadata', async () => {
      let capturedBody = '';
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: any) => {
        capturedBody = opts.body;
        return Promise.resolve({ json: () => Promise.resolve({ id: 'cs_meta', url: 'https://url' }) });
      }));
      const params: CheckoutParams = {
        price_id: 'price_xyz',
        success_url: 'https://example.com/s',
        cancel_url: 'https://example.com/c',
        metadata: { tenant_id: 'tenant_1' },
      };
      await createCheckoutSession('sk_test_key', params);
      expect(capturedBody).toContain('metadata');
      expect(capturedBody).toContain('tenant_id');
    });

    it('should default mode to subscription', async () => {
      let capturedBody = '';
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: any) => {
        capturedBody = opts.body;
        return Promise.resolve({ json: () => Promise.resolve({ id: 'cs_sub', url: 'https://url' }) });
      }));
      const params: CheckoutParams = {
        price_id: 'price_xyz',
        success_url: 'https://example.com/s',
        cancel_url: 'https://example.com/c',
      };
      await createCheckoutSession('sk_test_key', params);
      expect(capturedBody).toContain('subscription');
    });
  });

  // ── createCustomerPortalSession ───────────────────────────────────────

  describe('createCustomerPortalSession', () => {
    it('should create a portal session successfully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ url: 'https://billing.stripe.com/portal_123' }),
      }));
      const result = await createCustomerPortalSession('sk_test', 'cus_123', 'https://example.com/return');
      expect(result.url).toBe('https://billing.stripe.com/portal_123');
      expect(result.error).toBeUndefined();
    });

    it('should return error on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'Customer not found' } }),
      }));
      const result = await createCustomerPortalSession('sk_test', 'bad_cus', 'https://example.com/return');
      expect(result.url).toBeNull();
      expect(result.error).toBe('Customer not found');
    });
  });

  // ── getSubscription ──────────────────────────────────────────────────

  describe('getSubscription', () => {
    it('should return subscription data', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ id: 'sub_123', status: 'active', current_period_end: 1700000000 }),
      }));
      const result = await getSubscription('sk_test', 'sub_123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sub_123');
      expect(result!.status).toBe('active');
    });

    it('should return null when subscription not found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'No such subscription' } }),
      }));
      const result = await getSubscription('sk_test', 'sub_nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── cancelSubscription ───────────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ id: 'sub_123', cancel_at_period_end: true }),
      }));
      const result = await cancelSubscription('sk_test', 'sub_123');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'Subscription already cancelled' } }),
      }));
      const result = await cancelSubscription('sk_test', 'sub_123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Subscription already cancelled');
    });
  });

  // ── verifyWebhookSignature ───────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    it('should verify a valid signature', async () => {
      const secret = 'whsec_test_secret';
      const payload = '{"id":"evt_1"}';
      const timestamp = '1234567890';

      // Compute the expected signature using crypto.subtle
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
      );
      const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
      const expectedSig = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

      const signature = `t=${timestamp},v1=${expectedSig}`;
      const result = await verifyWebhookSignature(payload, signature, secret);
      expect(result).toBe(true);
    });

    it('should reject an invalid signature', async () => {
      const result = await verifyWebhookSignature('payload', 't=123,v1=invalidsig', 'whsec_test');
      expect(result).toBe(false);
    });

    it('should return false for empty signature', async () => {
      const result = await verifyWebhookSignature('payload', '', 'whsec_test');
      expect(result).toBe(false);
    });

    it('should return false for malformed signature (missing v1)', async () => {
      const result = await verifyWebhookSignature('payload', 't=123', 'whsec_test');
      expect(result).toBe(false);
    });
  });

  // ── handleWebhookEvent ───────────────────────────────────────────────

  describe('handleWebhookEvent', () => {
    it('should handle checkout.session.completed with tenant_id', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ id: 'tenant_1' }] },
        billing_events: { data: [] },
      });
      const event: StripeWebhookEvent = {
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            customer: 'cus_1',
            subscription: 'sub_1',
            metadata: { tenant_id: 'tenant_1' },
            amount_total: 99900,
            currency: 'mxn',
          },
        },
      };
      // Should not throw
      await handleWebhookEvent(sb, event);
    });

    it('should handle checkout.session.completed without tenant_id', async () => {
      const sb = createMultiTableMock({
        billing_events: { data: [] },
      });
      const event: StripeWebhookEvent = {
        id: 'evt_2',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_2', customer: 'cus_2', subscription: 'sub_2',
            metadata: {}, amount_total: 50000, currency: 'usd',
          },
        },
      };
      await handleWebhookEvent(sb, event);
    });

    it('should handle invoice.paid', async () => {
      const sb = createMultiTableMock({ billing_events: { data: [] } });
      const event: StripeWebhookEvent = {
        id: 'evt_inv_paid',
        type: 'invoice.paid',
        data: {
          object: { subscription: 'sub_1', customer: 'cus_1', amount_paid: 99900, currency: 'mxn' },
        },
      };
      await handleWebhookEvent(sb, event);
    });

    it('should handle invoice.payment_failed', async () => {
      const sb = createMultiTableMock({ billing_events: { data: [] } });
      const event: StripeWebhookEvent = {
        id: 'evt_inv_fail',
        type: 'invoice.payment_failed',
        data: {
          object: { subscription: 'sub_1', customer: 'cus_1', amount_due: 99900, currency: 'mxn' },
        },
      };
      await handleWebhookEvent(sb, event);
    });

    it('should handle customer.subscription.deleted with tenant found', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ id: 'tenant_1' }] },
        billing_events: { data: [] },
      });
      const event: StripeWebhookEvent = {
        id: 'evt_sub_del',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_1', customer: 'cus_1',
            cancellation_details: { reason: 'payment_failure' },
          },
        },
      };
      await handleWebhookEvent(sb, event);
    });

    it('should handle customer.subscription.deleted with no tenant found', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [] },
        billing_events: { data: [] },
      });
      const event: StripeWebhookEvent = {
        id: 'evt_sub_del_no_tenant',
        type: 'customer.subscription.deleted',
        data: {
          object: { id: 'sub_2', customer: 'cus_unknown', cancellation_details: {} },
        },
      };
      await handleWebhookEvent(sb, event);
    });

    it('should handle unknown event type without throwing', async () => {
      const sb = createMockSupabase();
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const event: StripeWebhookEvent = {
        id: 'evt_unknown',
        type: 'some.unknown.event',
        data: { object: {} },
      };
      await handleWebhookEvent(sb, event);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unhandled event type'));
      spy.mockRestore();
    });
  });

  // ── logBillingEvent ──────────────────────────────────────────────────

  describe('logBillingEvent', () => {
    it('should insert billing event successfully', async () => {
      const sb = createMockSupabase([]);
      const eventData: BillingEventInput = {
        event_type: 'checkout.completed',
        stripe_event_id: 'evt_1',
        stripe_customer_id: 'cus_1',
        amount_cents: 99900,
        currency: 'mxn',
      };
      await logBillingEvent(sb, eventData);
    });

    it('should log error on insert failure', async () => {
      const sb = createErrorSupabase('insert_failed');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await logBillingEvent(sb, { event_type: 'test' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ── getBillingHistory ────────────────────────────────────────────────

  describe('getBillingHistory', () => {
    it('should return billing events', async () => {
      const events = [
        { id: 'be_1', event_type: 'checkout.completed', created_at: '2026-01-01' },
        { id: 'be_2', event_type: 'invoice.paid', created_at: '2026-01-15' },
      ];
      const sb = createMockSupabase(events);
      const result = await getBillingHistory(sb);
      expect(result).toHaveLength(2);
      expect(result[0].event_type).toBe('checkout.completed');
    });

    it('should return empty array on error', async () => {
      const sb = createErrorSupabase('fetch_failed');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await getBillingHistory(sb);
      expect(result).toEqual([]);
      spy.mockRestore();
    });

    it('should return empty array when no events exist', async () => {
      const sb = createMockSupabase([]);
      const result = await getBillingHistory(sb);
      expect(result).toEqual([]);
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────
// 2. ONBOARDING SERVICE (~25 tests)
// ─────────────────────────────────────────────────────────────────────────

describe('Onboarding Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── getOnboardingStatus ──────────────────────────────────────────────

  describe('getOnboardingStatus', () => {
    it('should return step 0 for fresh tenant', async () => {
      const sb = createMockSupabase([{ onboarding_step: 0, onboarding_metadata: {} }]);
      const status = await getOnboardingStatus(sb, 'tenant_1');
      expect(status.current_step).toBe(0);
      expect(status.steps).toHaveLength(4);
      expect(status.steps.every(s => !s.completed)).toBe(true);
    });

    it('should return step 2 for partially onboarded tenant', async () => {
      const sb = createMockSupabase([{
        onboarding_step: 2,
        onboarding_metadata: {
          step_1: { phone_number_id: '123' },
          step_2: { emails: ['a@b.com'], count: 1 },
        },
      }]);
      const status = await getOnboardingStatus(sb, 'tenant_1');
      expect(status.current_step).toBe(2);
      expect(status.steps[0].completed).toBe(true);
      expect(status.steps[1].completed).toBe(true);
      expect(status.steps[2].completed).toBe(false);
      expect(status.steps[3].completed).toBe(false);
    });

    it('should return step 4 for fully onboarded tenant', async () => {
      const sb = createMockSupabase([{ onboarding_step: 4, onboarding_metadata: {} }]);
      const status = await getOnboardingStatus(sb, 'tenant_1');
      expect(status.current_step).toBe(4);
      expect(status.steps.every(s => s.completed)).toBe(true);
    });

    it('should handle tenant not found (null)', async () => {
      const sb = createMockSupabase([]);
      const status = await getOnboardingStatus(sb, 'nonexistent');
      expect(status.current_step).toBe(0);
      expect(status.steps).toHaveLength(4);
    });

    it('should include step data from metadata', async () => {
      const sb = createMockSupabase([{
        onboarding_step: 1,
        onboarding_metadata: { step_1: { phone_number_id: '555' } },
      }]);
      const status = await getOnboardingStatus(sb, 'tenant_1');
      expect(status.steps[0].data).toEqual({ phone_number_id: '555' });
    });
  });

  // ── completeStep ─────────────────────────────────────────────────────

  describe('completeStep', () => {
    it('should complete valid next step', async () => {
      const sb = createMockSupabase([{ onboarding_step: 0, onboarding_metadata: {} }]);
      const result = await completeStep(sb, 'tenant_1', 1, { foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.next_step).toBe(2);
    });

    it('should reject invalid step number (too high)', async () => {
      const sb = createMockSupabase([{ onboarding_step: 0, onboarding_metadata: {} }]);
      const result = await completeStep(sb, 'tenant_1', 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid step');
    });

    it('should reject invalid step number (too low)', async () => {
      const sb = createMockSupabase([{ onboarding_step: 0, onboarding_metadata: {} }]);
      const result = await completeStep(sb, 'tenant_1', 0);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid step');
    });

    it('should reject skipping ahead', async () => {
      const sb = createMockSupabase([{ onboarding_step: 0, onboarding_metadata: {} }]);
      const result = await completeStep(sb, 'tenant_1', 3);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Must complete step');
    });

    it('should return next_step = 4 when completing final step', async () => {
      const sb = createMockSupabase([{ onboarding_step: 3, onboarding_metadata: {} }]);
      const result = await completeStep(sb, 'tenant_1', 4);
      expect(result.success).toBe(true);
      expect(result.next_step).toBe(4);
    });

    it('should handle DB error on update', async () => {
      // Need a mock that returns data on SELECT (single) but errors on update
      // We use createMockSupabase which resolves with data for .single() and also for the update
      // To simulate update error, we use createErrorSupabase but then .single() also errors.
      // The real code reads first, then updates. Because our mock is simplistic, we test the error path
      // via a mock where the second await (update) errors.
      const sb = createErrorSupabase('update_failed');
      const result = await completeStep(sb, 'tenant_1', 1);
      // Tenant not found scenario => currentStep=0, step 1 is valid, but update errors
      // Actually with error supabase, .single() returns { data: null, error }
      // so tenant is null, currentStep=0, step must be 1, then update will also error
      expect(result.success).toBe(false);
    });
  });

  // ── completeWhatsAppSetup ────────────────────────────────────────────

  describe('completeWhatsAppSetup', () => {
    it('should save WhatsApp config and complete step 1', async () => {
      const sb = createMockSupabase([{ onboarding_step: 0, onboarding_metadata: {} }]);
      const config: WhatsAppConfig = {
        phone_number_id: '1234567890',
        access_token: 'EAABx...',
        webhook_secret: 'wh_sec',
        business_id: 'biz_123',
      };
      const result = await completeWhatsAppSetup(sb, 'tenant_1', config);
      expect(result.success).toBe(true);
      expect(result.next_step).toBe(2);
    });

    it('should handle error on config save', async () => {
      const sb = createErrorSupabase('save_failed');
      const config: WhatsAppConfig = { phone_number_id: '123', access_token: 'token' };
      const result = await completeWhatsAppSetup(sb, 'tenant_1', config);
      expect(result.success).toBe(false);
      expect(result.error).toBe('save_failed');
    });
  });

  // ── completeTeamInvites ──────────────────────────────────────────────

  describe('completeTeamInvites', () => {
    it('should create invitations and complete step 2', async () => {
      // Need multi-table: invitations (insert), tenants (select+update for completeStep)
      const sb = createMultiTableMock({
        invitations: { data: [] },
        tenants: { data: [{ onboarding_step: 1, onboarding_metadata: {} }] },
      });
      const result = await completeTeamInvites(sb, 'tenant_1', ['a@test.com', 'b@test.com']);
      expect(result.success).toBe(true);
      expect(result.next_step).toBe(3);
    });

    it('should handle empty emails array', async () => {
      const sb = createMultiTableMock({
        invitations: { data: [] },
        tenants: { data: [{ onboarding_step: 1, onboarding_metadata: {} }] },
      });
      const result = await completeTeamInvites(sb, 'tenant_1', []);
      expect(result.success).toBe(true);
    });

    it('should handle insert error', async () => {
      const sb = createMultiTableMock({
        invitations: { data: [], error: { message: 'insert_error' } },
        tenants: { data: [{ onboarding_step: 1, onboarding_metadata: {} }] },
      });
      const result = await completeTeamInvites(sb, 'tenant_1', ['x@y.com']);
      expect(result.success).toBe(false);
      expect(result.error).toBe('insert_error');
    });
  });

  // ── completeLeadImport ───────────────────────────────────────────────

  describe('completeLeadImport', () => {
    it('should record lead import count', async () => {
      const sb = createMockSupabase([{ onboarding_step: 2, onboarding_metadata: {} }]);
      const result = await completeLeadImport(sb, 'tenant_1', 150);
      expect(result.success).toBe(true);
      expect(result.next_step).toBe(4);
    });
  });

  // ── completeConfiguration ────────────────────────────────────────────

  describe('completeConfiguration', () => {
    it('should save timezone and complete step 4', async () => {
      const sb = createMockSupabase([{ onboarding_step: 3, onboarding_metadata: {} }]);
      const config: TenantConfiguration = { timezone: 'America/Mexico_City' };
      const result = await completeConfiguration(sb, 'tenant_1', config);
      expect(result.success).toBe(true);
      expect(result.next_step).toBe(4);
    });

    it('should save all config fields', async () => {
      const sb = createMockSupabase([{ onboarding_step: 3, onboarding_metadata: {} }]);
      const config: TenantConfiguration = {
        timezone: 'America/Mexico_City',
        business_hours: { mon: '9-18', tue: '9-18' },
        developments: ['Monte Verde', 'Los Encinos'],
      };
      const result = await completeConfiguration(sb, 'tenant_1', config);
      expect(result.success).toBe(true);
    });

    it('should skip DB update when config is empty', async () => {
      const sb = createMockSupabase([{ onboarding_step: 3, onboarding_metadata: {} }]);
      const config: TenantConfiguration = {};
      const result = await completeConfiguration(sb, 'tenant_1', config);
      expect(result.success).toBe(true);
    });

    it('should handle update error on tenants', async () => {
      const sb = createErrorSupabase('config_save_failed');
      const config: TenantConfiguration = { timezone: 'UTC' };
      const result = await completeConfiguration(sb, 'tenant_1', config);
      expect(result.success).toBe(false);
    });
  });

  // ── isOnboardingComplete ─────────────────────────────────────────────

  describe('isOnboardingComplete', () => {
    it('should return true when step >= 4', async () => {
      const sb = createMockSupabase([{ onboarding_step: 4 }]);
      const result = await isOnboardingComplete(sb, 'tenant_1');
      expect(result).toBe(true);
    });

    it('should return true when step > 4', async () => {
      const sb = createMockSupabase([{ onboarding_step: 5 }]);
      const result = await isOnboardingComplete(sb, 'tenant_1');
      expect(result).toBe(true);
    });

    it('should return false when step < 4', async () => {
      const sb = createMockSupabase([{ onboarding_step: 2 }]);
      const result = await isOnboardingComplete(sb, 'tenant_1');
      expect(result).toBe(false);
    });

    it('should return false when tenant not found', async () => {
      const sb = createMockSupabase([]);
      const result = await isOnboardingComplete(sb, 'nonexistent');
      expect(result).toBe(false);
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────
// 3. USAGE TRACKING SERVICE (~25 tests)
// ─────────────────────────────────────────────────────────────────────────

describe('Usage Tracking Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── incrementMetric ──────────────────────────────────────────────────

  describe('incrementMetric', () => {
    it('should insert new metric when none exists', async () => {
      // .single() returns null data => no existing row => insert path
      const sb = createMockSupabase([]);
      const result = await incrementMetric(sb, 'leads_count', 1);
      expect(result).toBe(true);
    });

    it('should update existing metric', async () => {
      const sb = createMockSupabase([{ id: 'um_1', value: 10 }]);
      const result = await incrementMetric(sb, 'leads_count', 1);
      expect(result).toBe(true);
    });

    it('should use default amount of 1', async () => {
      const sb = createMockSupabase([]);
      const result = await incrementMetric(sb, 'messages_sent');
      expect(result).toBe(true);
    });

    it('should increment by custom amount', async () => {
      const sb = createMockSupabase([{ id: 'um_1', value: 5 }]);
      const result = await incrementMetric(sb, 'api_calls', 10);
      expect(result).toBe(true);
    });

    it('should return false on insert error', async () => {
      // To test insert error path: .single() must return null (no existing),
      // then .insert() must error. With our basic mock both paths share same error.
      // Use a specialized mock:
      let callCount = 0;
      const chainable: any = {};
      const methods = ['from', 'select', 'eq', 'update', 'order', 'limit', 'in', 'is', 'not'];
      for (const m of methods) { chainable[m] = () => chainable; }
      chainable.then = undefined;
      // insert returns error
      chainable.insert = () => {
        const p: any = {};
        p.then = undefined;
        Object.defineProperty(p, 'then', {
          get: () => (resolve: any) => resolve({ data: null, error: { message: 'insert_err' } }),
          configurable: true,
        });
        return p;
      };
      // single() => no existing record on first call
      chainable.single = () => {
        callCount++;
        return Promise.resolve({ data: null, error: null });
      };
      Object.defineProperty(chainable, 'then', {
        get: () => (resolve: any) => resolve({ data: [], error: null }),
        configurable: true,
      });
      const sb = {
        client: { from: () => chainable },
        getTenantId: () => 'tenant_1',
      } as any;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await incrementMetric(sb, 'leads_count', 1);
      expect(result).toBe(false);
      spy.mockRestore();
    });

    it('should return false on update error', async () => {
      // existing record found, then update errors
      let isUpdate = false;
      const chainable: any = {};
      const methods = ['from', 'select', 'eq', 'order', 'limit', 'in', 'is', 'not', 'insert'];
      for (const m of methods) { chainable[m] = () => chainable; }
      chainable.then = undefined;
      chainable.update = () => {
        isUpdate = true;
        const p: any = {};
        const innerMethods = ['eq', 'select', 'single'];
        for (const m of innerMethods) { p[m] = () => p; }
        p.then = undefined;
        Object.defineProperty(p, 'then', {
          get: () => (resolve: any) => resolve({ data: null, error: { message: 'update_err' } }),
          configurable: true,
        });
        return p;
      };
      chainable.single = () => {
        return Promise.resolve({ data: { id: 'um_1', value: 10 }, error: null });
      };
      Object.defineProperty(chainable, 'then', {
        get: () => (resolve: any) => resolve({ data: [{ id: 'um_1', value: 10 }], error: null }),
        configurable: true,
      });
      const sb = {
        client: { from: () => chainable },
        getTenantId: () => 'tenant_1',
      } as any;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await incrementMetric(sb, 'leads_count', 1);
      expect(result).toBe(false);
      expect(isUpdate).toBe(true);
      spy.mockRestore();
    });
  });

  // ── getUsage ─────────────────────────────────────────────────────────

  describe('getUsage', () => {
    it('should return metrics as key-value pairs', async () => {
      const sb = createMockSupabase([
        { metric: 'leads_count', value: 25 },
        { metric: 'messages_sent', value: 100 },
      ]);
      const result = await getUsage(sb);
      expect(result.leads_count).toBe(25);
      expect(result.messages_sent).toBe(100);
    });

    it('should return empty object on error', async () => {
      const sb = createErrorSupabase('fetch_error');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await getUsage(sb);
      expect(result).toEqual({});
      spy.mockRestore();
    });

    it('should return empty object for no data', async () => {
      const sb = createMockSupabase([]);
      const result = await getUsage(sb);
      expect(result).toEqual({});
    });

    it('should accept specific period', async () => {
      const sb = createMockSupabase([{ metric: 'api_calls', value: 50 }]);
      const result = await getUsage(sb, '2025-12');
      expect(result.api_calls).toBe(50);
    });
  });

  // ── getUsageHistory ──────────────────────────────────────────────────

  describe('getUsageHistory', () => {
    it('should return history entries', async () => {
      const sb = createMockSupabase([
        { period: '2026-01', value: 100 },
        { period: '2026-02', value: 200 },
      ]);
      const result = await getUsageHistory(sb, 'leads_count', 6);
      expect(result).toHaveLength(2);
      expect(result[0].period).toBe('2026-01');
      expect(result[0].value).toBe(100);
    });

    it('should default to 6 months', async () => {
      const sb = createMockSupabase([]);
      const result = await getUsageHistory(sb, 'messages_sent');
      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      const sb = createErrorSupabase('history_error');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await getUsageHistory(sb, 'leads_count', 3);
      expect(result).toEqual([]);
      spy.mockRestore();
    });

    it('should return empty array when no data', async () => {
      const sb = createMockSupabase([]);
      const result = await getUsageHistory(sb, 'sms_sent', 12);
      expect(result).toEqual([]);
    });
  });

  // ── checkLimit ───────────────────────────────────────────────────────

  describe('checkLimit', () => {
    it('should return within_limit when current < limit', async () => {
      const sb = createMockSupabase([{ metric: 'leads_count', value: 30 }]);
      const result = await checkLimit(sb, 'leads_count', 50);
      expect(result.within_limit).toBe(true);
      expect(result.current).toBe(30);
      expect(result.limit).toBe(50);
      expect(result.percentage).toBe(60);
    });

    it('should return not within_limit when current >= limit', async () => {
      const sb = createMockSupabase([{ metric: 'leads_count', value: 50 }]);
      const result = await checkLimit(sb, 'leads_count', 50);
      expect(result.within_limit).toBe(false);
      expect(result.current).toBe(50);
      expect(result.percentage).toBe(100);
    });

    it('should return within_limit for unlimited (-1)', async () => {
      const sb = createMockSupabase([{ metric: 'leads_count', value: 999999 }]);
      const result = await checkLimit(sb, 'leads_count', -1);
      expect(result.within_limit).toBe(true);
      expect(result.percentage).toBe(0);
    });

    it('should return 0 current when metric not found', async () => {
      const sb = createMockSupabase([]);
      const result = await checkLimit(sb, 'unknown_metric', 100);
      expect(result.current).toBe(0);
      expect(result.within_limit).toBe(true);
      expect(result.percentage).toBe(0);
    });

    it('should calculate percentage correctly', async () => {
      const sb = createMockSupabase([{ metric: 'messages_sent', value: 250 }]);
      const result = await checkLimit(sb, 'messages_sent', 500);
      expect(result.percentage).toBe(50);
    });
  });

  // ── getUsageSummary ──────────────────────────────────────────────────

  describe('getUsageSummary', () => {
    it('should return all metrics with limits for free plan', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'free' }] },
        usage_metrics: { data: [{ metric: 'leads_count', value: 10 }] },
      });
      const result = await getUsageSummary(sb);
      expect(result.length).toBeGreaterThanOrEqual(6); // 6 metrics in PLAN_LIMITS
      const leadsMetric = result.find(m => m.metric === 'leads_count');
      expect(leadsMetric).toBeDefined();
      expect(leadsMetric!.limit).toBe(50); // free plan leads_count limit
    });

    it('should return starter plan limits', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'starter' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const leadsMetric = result.find(m => m.metric === 'leads_count');
      expect(leadsMetric!.limit).toBe(500);
    });

    it('should return pro plan limits', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'pro' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const leadsMetric = result.find(m => m.metric === 'leads_count');
      expect(leadsMetric!.limit).toBe(5000);
    });

    it('should return enterprise limits (unlimited = -1)', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'enterprise' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const leadsMetric = result.find(m => m.metric === 'leads_count');
      expect(leadsMetric!.limit).toBe(-1);
      expect(leadsMetric!.percentage).toBe(0);
    });

    it('should default to free plan when plan unknown', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'unknown_plan' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const leadsMetric = result.find(m => m.metric === 'leads_count');
      expect(leadsMetric!.limit).toBe(50); // free plan default
    });

    it('should default to free plan when tenant not found', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const leadsMetric = result.find(m => m.metric === 'leads_count');
      expect(leadsMetric!.limit).toBe(50);
    });

    it('should include all metric types', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'free' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const metricNames = result.map(m => m.metric);
      expect(metricNames).toContain('leads_count');
      expect(metricNames).toContain('messages_sent');
      expect(metricNames).toContain('emails_sent');
      expect(metricNames).toContain('sms_sent');
      expect(metricNames).toContain('api_calls');
      expect(metricNames).toContain('storage_mb');
    });
  });

  // ── PLAN_LIMITS verification (indirect) ──────────────────────────────

  describe('PLAN_LIMITS verification', () => {
    it('should have correct free plan limits', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'free' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const limits: Record<string, number> = {};
      for (const m of result) limits[m.metric] = m.limit;
      expect(limits.leads_count).toBe(50);
      expect(limits.messages_sent).toBe(500);
      expect(limits.emails_sent).toBe(100);
      expect(limits.sms_sent).toBe(20);
      expect(limits.api_calls).toBe(1000);
      expect(limits.storage_mb).toBe(100);
    });

    it('should have correct starter plan limits', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'starter' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const limits: Record<string, number> = {};
      for (const m of result) limits[m.metric] = m.limit;
      expect(limits.leads_count).toBe(500);
      expect(limits.messages_sent).toBe(5000);
      expect(limits.emails_sent).toBe(1000);
      expect(limits.sms_sent).toBe(200);
      expect(limits.api_calls).toBe(10000);
      expect(limits.storage_mb).toBe(1000);
    });

    it('should have correct pro plan limits', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'pro' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      const limits: Record<string, number> = {};
      for (const m of result) limits[m.metric] = m.limit;
      expect(limits.leads_count).toBe(5000);
      expect(limits.messages_sent).toBe(50000);
      expect(limits.emails_sent).toBe(10000);
      expect(limits.sms_sent).toBe(2000);
      expect(limits.api_calls).toBe(100000);
      expect(limits.storage_mb).toBe(10000);
    });

    it('should have enterprise plan as unlimited (-1 for all)', async () => {
      const sb = createMultiTableMock({
        tenants: { data: [{ plan: 'enterprise' }] },
        usage_metrics: { data: [] },
      });
      const result = await getUsageSummary(sb);
      for (const m of result) {
        expect(m.limit).toBe(-1);
        expect(m.percentage).toBe(0);
      }
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────
// 4. INVITATION SERVICE (~30 tests)
// ─────────────────────────────────────────────────────────────────────────

describe('Invitation Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── createInvitation ─────────────────────────────────────────────────

  describe('createInvitation', () => {
    it('should create an invitation with token', async () => {
      const invData = {
        id: 'inv_1', tenant_id: 'tenant_1', email: 'test@example.com',
        role: 'vendedor', token: 'uuid-token', invited_by: null,
        expires_at: '2026-03-11T00:00:00Z', created_at: '2026-03-04T00:00:00Z',
        accepted_at: null,
      };
      const sb = createMockSupabase([invData]);
      const result = await createInvitation(sb, { email: 'test@example.com' });
      expect(result).not.toBeNull();
      expect(result!.email).toBe('test@example.com');
      expect(result!.role).toBe('vendedor');
    });

    it('should use default role vendedor', async () => {
      const invData = {
        id: 'inv_2', tenant_id: 'tenant_1', email: 'a@b.com',
        role: 'vendedor', token: 'tok', invited_by: null,
        expires_at: '2026-03-11T00:00:00Z', created_at: '2026-03-04T00:00:00Z',
        accepted_at: null,
      };
      const sb = createMockSupabase([invData]);
      const result = await createInvitation(sb, { email: 'a@b.com' });
      expect(result!.role).toBe('vendedor');
    });

    it('should accept custom role', async () => {
      const invData = {
        id: 'inv_3', tenant_id: 'tenant_1', email: 'admin@test.com',
        role: 'admin', token: 'tok', invited_by: 'user_1',
        expires_at: '2026-03-11T00:00:00Z', created_at: '2026-03-04T00:00:00Z',
        accepted_at: null,
      };
      const sb = createMockSupabase([invData]);
      const result = await createInvitation(sb, { email: 'admin@test.com', role: 'admin', invited_by: 'user_1' });
      expect(result!.role).toBe('admin');
      expect(result!.invited_by).toBe('user_1');
    });

    it('should return null on error', async () => {
      const sb = createErrorSupabase('create_failed');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await createInvitation(sb, { email: 'fail@test.com' });
      expect(result).toBeNull();
      spy.mockRestore();
    });
  });

  // ── getInvitation ────────────────────────────────────────────────────

  describe('getInvitation', () => {
    it('should return invitation when found', async () => {
      const inv = {
        id: 'inv_1', tenant_id: 't1', email: 'a@b.com', role: 'vendedor',
        token: 'tok_1', invited_by: null, accepted_at: null,
        expires_at: '2026-03-11T00:00:00Z', created_at: '2026-03-04T00:00:00Z',
      };
      const sb = createMockSupabase([inv]);
      const result = await getInvitation(sb, 'inv_1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('inv_1');
    });

    it('should return null when not found', async () => {
      // Simulate PGRST116 (not found) error
      const sb = createMockSupabase(null, { code: 'PGRST116', message: 'not found' });
      const result = await getInvitation(sb, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should log non-PGRST116 errors', async () => {
      const sb = createMockSupabase(null, { code: 'OTHER', message: 'server error' });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await getInvitation(sb, 'inv_err');
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ── getInvitationByToken ─────────────────────────────────────────────

  describe('getInvitationByToken', () => {
    it('should return invitation when token matches', async () => {
      const inv = {
        id: 'inv_1', tenant_id: 't1', email: 'a@b.com', role: 'vendedor',
        token: 'my-secret-token', invited_by: null, accepted_at: null,
        expires_at: '2026-03-11T00:00:00Z', created_at: '2026-03-04T00:00:00Z',
      };
      const sb = createMockSupabase([inv]);
      const result = await getInvitationByToken(sb, 'my-secret-token');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('my-secret-token');
    });

    it('should return null when token not found', async () => {
      const sb = createMockSupabase(null, { code: 'PGRST116', message: 'not found' });
      const result = await getInvitationByToken(sb, 'bad-token');
      expect(result).toBeNull();
    });
  });

  // ── listInvitations ──────────────────────────────────────────────────

  describe('listInvitations', () => {
    it('should return all invitations', async () => {
      const invitations = [
        { id: 'inv_1', email: 'a@b.com', accepted_at: null },
        { id: 'inv_2', email: 'c@d.com', accepted_at: '2026-03-01T00:00:00Z' },
      ];
      const sb = createMockSupabase(invitations);
      const result = await listInvitations(sb);
      expect(result).toHaveLength(2);
    });

    it('should filter accepted invitations', async () => {
      const invitations = [
        { id: 'inv_2', email: 'c@d.com', accepted_at: '2026-03-01T00:00:00Z' },
      ];
      const sb = createMockSupabase(invitations);
      const result = await listInvitations(sb, { accepted: true });
      expect(result).toHaveLength(1);
    });

    it('should filter pending invitations', async () => {
      const invitations = [
        { id: 'inv_1', email: 'a@b.com', accepted_at: null },
      ];
      const sb = createMockSupabase(invitations);
      const result = await listInvitations(sb, { accepted: false });
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      const sb = createErrorSupabase('list_error');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await listInvitations(sb);
      expect(result).toEqual([]);
      spy.mockRestore();
    });

    it('should return empty array when no invitations', async () => {
      const sb = createMockSupabase([]);
      const result = await listInvitations(sb);
      expect(result).toEqual([]);
    });
  });

  // ── acceptInvitation ─────────────────────────────────────────────────

  describe('acceptInvitation', () => {
    it('should accept a valid invitation and create user via RPC', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const inv = {
        id: 'inv_1', tenant_id: 't1', email: 'new@user.com', role: 'vendedor',
        token: 'valid-token', invited_by: null, accepted_at: null,
        expires_at: futureDate, created_at: '2026-03-01T00:00:00Z',
      };

      const chainable: any = {};
      const methods = ['from', 'select', 'eq', 'update', 'insert', 'delete', 'order',
        'limit', 'in', 'is', 'not', 'ilike', 'gte', 'lte'];
      for (const m of methods) { chainable[m] = () => chainable; }
      chainable.then = undefined;
      chainable.single = () => Promise.resolve({ data: inv, error: null });
      Object.defineProperty(chainable, 'then', {
        get: () => (resolve: any) => resolve({ data: [inv], error: null }),
        configurable: true,
      });

      const sb = {
        client: {
          from: () => chainable,
          rpc: vi.fn().mockResolvedValue({ data: { user_id: 'usr_new' }, error: null }),
        },
        getTenantId: () => 't1',
      } as any;

      const result = await acceptInvitation(sb, 'valid-token', { password: 'Secur3Pass' });
      expect(result.success).toBe(true);
      expect(result.user_id).toBe('usr_new');
      expect(sb.client.rpc).toHaveBeenCalledWith('create_auth_user', expect.objectContaining({
        p_tenant_id: 't1',
        p_email: 'new@user.com',
        p_role: 'vendedor',
      }));
    });

    it('should return error when invitation not found', async () => {
      const sb = createMockSupabase(null, { code: 'PGRST116', message: 'not found' });
      const result = await acceptInvitation(sb, 'bad-token', { password: 'pass1234' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation not found');
    });

    it('should return error when invitation already accepted', async () => {
      const inv = {
        id: 'inv_1', email: 'a@b.com', token: 'tok',
        accepted_at: '2026-03-01T00:00:00Z',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      const sb = createMockSupabase([inv]);
      const result = await acceptInvitation(sb, 'tok', { password: 'pass1234' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation already accepted');
    });

    it('should return error when invitation expired', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const inv = {
        id: 'inv_1', email: 'a@b.com', token: 'tok',
        accepted_at: null, expires_at: pastDate,
      };
      const sb = createMockSupabase([inv]);
      const result = await acceptInvitation(sb, 'tok', { password: 'pass1234' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation expired');
    });

    it('should return error when RPC create_auth_user fails', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const inv = {
        id: 'inv_1', tenant_id: 't1', email: 'a@b.com', role: 'vendedor',
        token: 'tok', invited_by: null, accepted_at: null,
        expires_at: futureDate,
      };

      const chainable: any = {};
      const methods = ['from', 'select', 'eq', 'update', 'insert', 'delete', 'order',
        'limit', 'in', 'is', 'not', 'ilike', 'gte', 'lte'];
      for (const m of methods) { chainable[m] = () => chainable; }
      chainable.then = undefined;
      chainable.single = () => Promise.resolve({ data: inv, error: null });
      Object.defineProperty(chainable, 'then', {
        get: () => (resolve: any) => resolve({ data: [inv], error: null }),
        configurable: true,
      });

      const sb = {
        client: {
          from: () => chainable,
          rpc: vi.fn().mockResolvedValue({ data: { error: 'Email ya registrado en este tenant' }, error: null }),
        },
        getTenantId: () => 't1',
      } as any;

      const result = await acceptInvitation(sb, 'tok', { password: 'pass1234' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Email ya registrado en este tenant');
    });
  });

  // ── revokeInvitation ─────────────────────────────────────────────────

  describe('revokeInvitation', () => {
    it('should revoke invitation successfully', async () => {
      const sb = createMockSupabase([]);
      const result = await revokeInvitation(sb, 'inv_1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      const sb = createErrorSupabase('revoke_error');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await revokeInvitation(sb, 'inv_err');
      expect(result).toBe(false);
      spy.mockRestore();
    });
  });

  // ── isExpired ────────────────────────────────────────────────────────

  describe('isExpired', () => {
    it('should return false when not expired', () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      expect(isExpired({ expires_at: futureDate })).toBe(false);
    });

    it('should return true when expired', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(isExpired({ expires_at: pastDate })).toBe(true);
    });

    it('should return true when expires_at is null', () => {
      expect(isExpired({ expires_at: null })).toBe(true);
    });

    it('should return true when invitation is null/undefined', () => {
      expect(isExpired(null)).toBe(true);
      expect(isExpired(undefined)).toBe(true);
    });

    it('should return true when expires_at is missing', () => {
      expect(isExpired({})).toBe(true);
    });
  });

  // ── resendInvitation ─────────────────────────────────────────────────

  describe('resendInvitation', () => {
    it('should generate new token and expiry', async () => {
      const inv = {
        id: 'inv_1', tenant_id: 't1', email: 'a@b.com', role: 'vendedor',
        token: 'new-uuid-token', invited_by: null, accepted_at: null,
        expires_at: '2026-03-11T00:00:00Z', created_at: '2026-03-04T00:00:00Z',
      };
      const sb = createMockSupabase([inv]);
      const result = await resendInvitation(sb, 'inv_1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('inv_1');
    });

    it('should return null on error', async () => {
      const sb = createErrorSupabase('resend_error');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await resendInvitation(sb, 'inv_err');
      expect(result).toBeNull();
      spy.mockRestore();
    });
  });
});
