// STRIPE SERVICE - Billing via Stripe API (fetch-based, no SDK)
import { SupabaseService } from './supabase';

export interface CheckoutParams {
  customer_email?: string;
  customer_id?: string;
  price_id: string;
  success_url: string;
  cancel_url: string;
  mode?: 'subscription' | 'payment';
  metadata?: Record<string, string>;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

export interface BillingEventInput {
  event_type: string;
  stripe_event_id?: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  amount_cents?: number;
  currency?: string;
  metadata?: Record<string, any>;
}

const STRIPE_BASE = 'https://api.stripe.com/v1';

function stripeHeaders(key: string): Record<string, string> {
  return { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' };
}

function toFormBody(params: Record<string, any>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) {
      parts.push(toFormBody(v, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

async function stripeRequest(key: string, path: string, method: string, body?: Record<string, any>): Promise<any> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method, headers: stripeHeaders(key), body: body ? toFormBody(body) : undefined,
  });
  return res.json();
}

export async function createCheckoutSession(
  stripeKey: string, params: CheckoutParams
): Promise<{ url: string | null; session_id: string | null; error?: string }> {
  const body: Record<string, any> = {
    mode: params.mode || 'subscription',
    success_url: params.success_url,
    cancel_url: params.cancel_url,
    'line_items[0][price]': params.price_id,
    'line_items[0][quantity]': '1',
  };
  if (params.customer_email) body.customer_email = params.customer_email;
  if (params.customer_id) body.customer = params.customer_id;
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) body[`metadata[${k}]`] = v;
  }
  const res = await fetch(`${STRIPE_BASE}/checkout/sessions`, {
    method: 'POST', headers: stripeHeaders(stripeKey),
    body: Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&'),
  });
  const data: any = await res.json();
  if (data.error) return { url: null, session_id: null, error: data.error.message };
  return { url: data.url, session_id: data.id };
}

export async function createCustomerPortalSession(
  stripeKey: string, customerId: string, returnUrl: string
): Promise<{ url: string | null; error?: string }> {
  const data = await stripeRequest(stripeKey, '/billing_portal/sessions', 'POST', {
    customer: customerId, return_url: returnUrl,
  });
  if (data.error) return { url: null, error: data.error.message };
  return { url: data.url };
}

export async function getSubscription(stripeKey: string, subscriptionId: string): Promise<Record<string, any> | null> {
  const data = await stripeRequest(stripeKey, `/subscriptions/${subscriptionId}`, 'GET');
  return data.error ? null : data;
}

export async function cancelSubscription(stripeKey: string, subscriptionId: string): Promise<{ success: boolean; error?: string }> {
  const data = await stripeRequest(stripeKey, `/subscriptions/${subscriptionId}`, 'POST', { cancel_at_period_end: 'true' });
  if (data.error) return { success: false, error: data.error.message };
  return { success: true };
}

export async function handleWebhookEvent(supabase: SupabaseService, event: StripeWebhookEvent): Promise<void> {
  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const tenantId = obj.metadata?.tenant_id;
      if (tenantId) {
        await supabase.client.from('tenants').update({
          stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription, active: true,
        }).eq('id', tenantId);
      }
      await logBillingEvent(supabase, {
        event_type: 'checkout.completed', stripe_event_id: event.id,
        stripe_subscription_id: obj.subscription, stripe_customer_id: obj.customer,
        amount_cents: obj.amount_total || 0, currency: obj.currency || 'mxn',
        metadata: { session_id: obj.id, tenant_id: tenantId },
      });
      break;
    }
    case 'invoice.paid': {
      await logBillingEvent(supabase, {
        event_type: 'invoice.paid', stripe_event_id: event.id,
        stripe_subscription_id: obj.subscription, stripe_customer_id: obj.customer,
        amount_cents: obj.amount_paid || 0, currency: obj.currency || 'mxn',
      });
      break;
    }
    case 'invoice.payment_failed': {
      await logBillingEvent(supabase, {
        event_type: 'invoice.failed', stripe_event_id: event.id,
        stripe_subscription_id: obj.subscription, stripe_customer_id: obj.customer,
        amount_cents: obj.amount_due || 0, currency: obj.currency || 'mxn',
      });
      break;
    }
    case 'customer.subscription.deleted': {
      const { data: tenant } = await supabase.client
        .from('tenants').select('id').eq('stripe_customer_id', obj.customer).single();
      if (tenant) {
        await supabase.client.from('tenants').update({
          active: false, plan: 'free', suspended_at: new Date().toISOString(), stripe_subscription_id: null,
        }).eq('id', tenant.id);
      }
      await logBillingEvent(supabase, {
        event_type: 'subscription.cancelled', stripe_event_id: event.id,
        stripe_subscription_id: obj.id, stripe_customer_id: obj.customer,
        metadata: { cancel_reason: obj.cancellation_details?.reason },
      });
      break;
    }
    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }
}

export async function verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts['t'], sig = parts['v1'];
    if (!timestamp || !sig) return false;

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
    const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
    return expected === sig;
  } catch {
    return false;
  }
}

export async function logBillingEvent(supabase: SupabaseService, data: BillingEventInput): Promise<void> {
  const { error } = await supabase.client.from('billing_events').insert({
    event_type: data.event_type,
    stripe_event_id: data.stripe_event_id || null,
    stripe_subscription_id: data.stripe_subscription_id || null,
    stripe_customer_id: data.stripe_customer_id || null,
    amount_cents: data.amount_cents || 0,
    currency: data.currency || 'mxn',
    metadata: data.metadata || {},
  });
  if (error) console.error('[Stripe] Failed to log billing event:', error.message);
}

export async function getBillingHistory(supabase: SupabaseService, limit = 50): Promise<any[]> {
  const { data, error } = await supabase.client
    .from('billing_events').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('[Stripe] Failed to fetch billing history:', error.message); return []; }
  return data || [];
}
