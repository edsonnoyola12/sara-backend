// ═══════════════════════════════════════════════════════════════════════════
// API SAAS ROUTES — Signup, Onboarding, Billing, Admin, Invitations
// Phase 6: SaaS Launch Ready
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { createCheckoutSession, createCustomerPortalSession, handleWebhookEvent, verifyWebhookSignature, getBillingHistory } from '../services/stripeService';
import { getOnboardingStatus, completeWhatsAppSetup, completeTeamInvites, completeLeadImport, completeConfiguration, isOnboardingComplete } from '../services/onboardingService';
import { getUsage, getUsageSummary, checkLimit } from '../services/usageTrackingService';
import { createInvitation, getInvitationByToken, listInvitations, acceptInvitation, revokeInvitation, resendInvitation } from '../services/invitationService';
import { hashPassword, authenticateRequest, getJWTSecret, createJWT, createRefreshToken } from '../middleware/auth';
import { isAllowedCrmOrigin, validateRequired } from './cors';
import type { Env, CorsResponseFn, CheckApiAuthFn } from '../types/env';

async function checkAuthWithJWT(request: Request, env: Env, supabase: SupabaseService, corsResponse: CorsResponseFn, checkApiAuth: CheckApiAuthFn): Promise<Response | null> {
  // 1. API_SECRET auth (admin/backend)
  const apiAuthResult = checkApiAuth(request, env);
  if (!apiAuthResult) return null;

  // 2. CRM origin auth
  const origin = request.headers.get('Origin');
  if (isAllowedCrmOrigin(origin)) return null;

  // 3. JWT auth (SaaS users)
  const jwtSecret = getJWTSecret(env.API_SECRET);
  const payload = await authenticateRequest(request, jwtSecret);
  if (payload) {
    // Set tenant context from JWT
    await supabase.setTenant(payload.tenantId);

    // Verify tenant is active and trial not expired
    const { data: tenant } = await supabase.client
      .from('tenants').select('active, trial_ends_at, plan, stripe_subscription_id').eq('id', payload.tenantId).single();
    if (tenant && !tenant.active) {
      return corsResponse(JSON.stringify({ error: 'Cuenta suspendida', code: 'SUSPENDED' }), 403);
    }
    if (tenant && tenant.trial_ends_at && tenant.plan === 'free' && !tenant.stripe_subscription_id) {
      if (new Date(tenant.trial_ends_at).getTime() < Date.now()) {
        // Allow billing endpoints so they can upgrade
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/api/billing') && !url.pathname.startsWith('/api/plans')) {
          return corsResponse(JSON.stringify({ error: 'Periodo de prueba expirado. Actualiza tu plan.', code: 'TRIAL_EXPIRED' }), 403);
        }
      }
    }

    return null;
  }

  return corsResponse(JSON.stringify({ error: 'No autorizado' }), 401);
}

export async function handleApiSaasRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn
): Promise<Response | null> {

  // ═══════════════════════════════════════════════════════════════
  // SIGNUP (public - no auth required)
  // ═══════════════════════════════════════════════════════════════

  // POST /api/signup — Create new tenant + admin user (atomic via RPC)
  // Returns JWT tokens for auto-login after signup
  if (url.pathname === '/api/signup' && request.method === 'POST') {
    const body = await request.json() as any;
    const err = validateRequired(body, ['name', 'email', 'password']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);

    // Auto-generate slug from name if not provided
    const slug = (body.slug || body.name)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    const email = body.email.toLowerCase().trim();

    if (body.password.length < 8) {
      return corsResponse(JSON.stringify({ error: 'Password mínimo 8 caracteres' }), 400);
    }

    const passwordHash = await hashPassword(body.password);

    // Atomic signup via SECURITY DEFINER function (bypasses RLS)
    const { data, error: rpcErr } = await supabase.client.rpc('signup_tenant', {
      p_name: body.name,
      p_slug: slug,
      p_email: email,
      p_password_hash: passwordHash,
    });

    if (rpcErr) return corsResponse(JSON.stringify({ error: rpcErr.message }), 500);
    if (data?.error) return corsResponse(JSON.stringify({ error: data.error }), 409);

    // Auto-login: generate JWT tokens
    const jwtSecret = getJWTSecret(env.API_SECRET);
    const tokenPayload = {
      sub: data.user_id,
      email,
      role: 'admin',
      tenantId: data.tenant_id,
    };
    const access_token = await createJWT(tokenPayload, jwtSecret);
    const refresh_token = await createRefreshToken(tokenPayload, jwtSecret);

    return corsResponse(JSON.stringify({
      data,
      access_token,
      refresh_token,
      user: { id: data.user_id, email, role: 'admin' },
      tenant: { id: data.tenant_id, slug, name: body.name, timezone: 'America/Mexico_City', plan: 'free' },
    }), 201);
  }

  // ═══════════════════════════════════════════════════════════════
  // ONBOARDING
  // ═══════════════════════════════════════════════════════════════

  // GET /api/onboarding — Get onboarding status
  if (url.pathname === '/api/onboarding' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const status = await getOnboardingStatus(supabase, supabase.getTenantId());
    return corsResponse(JSON.stringify({ data: status }));
  }

  // POST /api/onboarding/whatsapp/verify — Validate WhatsApp credentials before saving
  if (url.pathname === '/api/onboarding/whatsapp/verify' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['phone_number_id', 'access_token']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);

    try {
      // Test the credentials by calling Meta's phone number endpoint
      const metaResp = await fetch(
        `https://graph.facebook.com/v21.0/${body.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${body.access_token}` } }
      );
      const metaData = await metaResp.json() as any;

      if (!metaResp.ok || metaData.error) {
        return corsResponse(JSON.stringify({
          valid: false,
          error: metaData.error?.message || 'Credenciales de WhatsApp inválidas',
          hint: 'Verifica tu Phone Number ID y Access Token en Meta Business Manager'
        }), 400);
      }

      return corsResponse(JSON.stringify({
        valid: true,
        phone_number: metaData.display_phone_number,
        business_name: metaData.verified_name,
        quality: metaData.quality_rating,
      }));
    } catch (e: any) {
      return corsResponse(JSON.stringify({ valid: false, error: e.message }), 500);
    }
  }

  // POST /api/onboarding/whatsapp — Step 1
  if (url.pathname === '/api/onboarding/whatsapp' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['phone_number_id', 'access_token']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const result = await completeWhatsAppSetup(supabase, supabase.getTenantId(), body);
    return corsResponse(JSON.stringify(result));
  }

  // POST /api/onboarding/team — Step 2
  if (url.pathname === '/api/onboarding/team' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['emails']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const result = await completeTeamInvites(supabase, supabase.getTenantId(), body.emails);
    return corsResponse(JSON.stringify(result));
  }

  // POST /api/onboarding/leads — Step 3
  if (url.pathname === '/api/onboarding/leads' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const result = await completeLeadImport(supabase, supabase.getTenantId(), body.count || 0);
    return corsResponse(JSON.stringify(result));
  }

  // POST /api/onboarding/config — Step 4
  if (url.pathname === '/api/onboarding/config' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const result = await completeConfiguration(supabase, supabase.getTenantId(), body);
    return corsResponse(JSON.stringify(result));
  }

  // GET /api/onboarding/complete — Check if onboarding is done
  if (url.pathname === '/api/onboarding/complete' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const complete = await isOnboardingComplete(supabase, supabase.getTenantId());
    return corsResponse(JSON.stringify({ complete }));
  }

  // ═══════════════════════════════════════════════════════════════
  // BILLING
  // ═══════════════════════════════════════════════════════════════

  // POST /api/billing/checkout — Create Stripe checkout session
  if (url.pathname === '/api/billing/checkout' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['price_id']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);

    const stripeKey = env.STRIPE_SECRET_KEY;
    if (!stripeKey) return corsResponse(JSON.stringify({ error: 'Stripe no configurado' }), 500);

    const result = await createCheckoutSession(stripeKey, {
      price_id: body.price_id,
      success_url: body.success_url || 'https://sara-crm-new.vercel.app/billing/success',
      cancel_url: body.cancel_url || 'https://sara-crm-new.vercel.app/billing/cancel',
      customer_email: body.email,
      metadata: { tenant_id: supabase.getTenantId() },
    });

    if (result.error) return corsResponse(JSON.stringify({ error: result.error }), 500);
    return corsResponse(JSON.stringify({ data: result }));
  }

  // POST /api/billing/portal — Stripe customer portal
  if (url.pathname === '/api/billing/portal' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;

    const { data: tenant } = await supabase.client.from('tenants').select('stripe_customer_id').eq('id', supabase.getTenantId()).single();
    if (!tenant?.stripe_customer_id) return corsResponse(JSON.stringify({ error: 'No hay cliente de Stripe' }), 400);

    const stripeKey = env.STRIPE_SECRET_KEY;
    if (!stripeKey) return corsResponse(JSON.stringify({ error: 'Stripe no configurado' }), 500);

    const result = await createCustomerPortalSession(stripeKey, tenant.stripe_customer_id, 'https://sara-crm-new.vercel.app/billing');
    if (result.error) return corsResponse(JSON.stringify({ error: result.error }), 500);
    return corsResponse(JSON.stringify({ data: result }));
  }

  // POST /api/billing/webhook — Stripe webhook
  if (url.pathname === '/api/billing/webhook' && request.method === 'POST') {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature') || '';
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';

    if (webhookSecret && !(await verifyWebhookSignature(rawBody, signature, webhookSecret))) {
      return corsResponse(JSON.stringify({ error: 'Invalid signature' }), 400);
    }

    try {
      const event = JSON.parse(rawBody);
      await handleWebhookEvent(supabase, event);
      return corsResponse(JSON.stringify({ received: true }));
    } catch (e: any) {
      return corsResponse(JSON.stringify({ error: e.message }), 400);
    }
  }

  // GET /api/billing/history
  if (url.pathname === '/api/billing/history' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const history = await getBillingHistory(supabase);
    return corsResponse(JSON.stringify({ data: history }));
  }

  // ═══════════════════════════════════════════════════════════════
  // USAGE
  // ═══════════════════════════════════════════════════════════════

  // GET /api/usage — Current month usage
  if (url.pathname === '/api/usage' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const period = url.searchParams.get('period') || undefined;
    const usage = await getUsage(supabase, period);
    return corsResponse(JSON.stringify({ data: usage }));
  }

  // GET /api/usage/summary — Usage with limits
  if (url.pathname === '/api/usage/summary' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const summary = await getUsageSummary(supabase);
    return corsResponse(JSON.stringify({ data: summary }));
  }

  // ═══════════════════════════════════════════════════════════════
  // INVITATIONS
  // ═══════════════════════════════════════════════════════════════

  // GET /api/invitations
  if (url.pathname === '/api/invitations' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const accepted = url.searchParams.get('accepted');
    const filters: any = {};
    if (accepted !== null) filters.accepted = accepted === 'true';
    const invitations = await listInvitations(supabase, filters);
    return corsResponse(JSON.stringify({ data: invitations }));
  }

  // POST /api/invitations
  if (url.pathname === '/api/invitations' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['email']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const invitation = await createInvitation(supabase, body);
    if (!invitation) return corsResponse(JSON.stringify({ error: 'Error creando invitacion' }), 500);
    return corsResponse(JSON.stringify({ data: invitation }), 201);
  }

  // POST /api/invitations/accept — Accept invitation (public - no auth)
  if (url.pathname === '/api/invitations/accept' && request.method === 'POST') {
    const body = await request.json() as any;
    const err = validateRequired(body, ['token', 'password']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const result = await acceptInvitation(supabase, body.token, { password: body.password, name: body.name, phone: body.phone });
    if (!result.success) return corsResponse(JSON.stringify({ error: result.error }), 400);
    return corsResponse(JSON.stringify({ data: result }));
  }

  // DELETE /api/invitations/:id
  const invitationDeleteMatch = url.pathname.match(/^\/api\/invitations\/([0-9a-f-]{36})$/);
  if (invitationDeleteMatch && request.method === 'DELETE') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await revokeInvitation(supabase, invitationDeleteMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // POST /api/invitations/:id/resend
  const invitationResendMatch = url.pathname.match(/^\/api\/invitations\/([0-9a-f-]{36})\/resend$/);
  if (invitationResendMatch && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const updated = await resendInvitation(supabase, invitationResendMatch[1]);
    if (!updated) return corsResponse(JSON.stringify({ error: 'Invitacion no encontrada' }), 404);
    return corsResponse(JSON.stringify({ data: updated }));
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN — Tenant management
  // ═══════════════════════════════════════════════════════════════

  // GET /api/admin/tenant — Current tenant info
  if (url.pathname === '/api/admin/tenant' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const { data: tenant } = await supabase.client.from('tenants').select('*').eq('id', supabase.getTenantId()).single();
    return corsResponse(JSON.stringify({ data: tenant }));
  }

  // PUT /api/admin/tenant — Update tenant settings
  if (url.pathname === '/api/admin/tenant' && request.method === 'PUT') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const allowedFields = ['name', 'timezone', 'logo_url', 'primary_color', 'secondary_color'];
    const updates: any = {};
    for (const f of allowedFields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    const { data: tenant, error } = await supabase.client
      .from('tenants')
      .update(updates)
      .eq('id', supabase.getTenantId())
      .select()
      .single();
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data: tenant }));
  }

  // GET /api/admin/users — List auth users for current tenant
  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const { data: users } = await supabase.client
      .from('auth_users')
      .select('id, email, role, active, last_login, created_at')
      .eq('tenant_id', supabase.getTenantId())
      .order('created_at');
    return corsResponse(JSON.stringify({ data: users || [] }));
  }

  // PUT /api/admin/users/:id — Update user role/active
  const userUpdateMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/);
  if (userUpdateMatch && request.method === 'PUT') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const allowedFields = ['role', 'active'];
    const updates: any = {};
    for (const f of allowedFields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    const { data: user, error } = await supabase.client
      .from('auth_users')
      .update(updates)
      .eq('id', userUpdateMatch[1])
      .eq('tenant_id', supabase.getTenantId())
      .select()
      .single();
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data: user }));
  }

  // ═══════════════════════════════════════════════════════════════
  // PLANS — Public pricing info
  // ═══════════════════════════════════════════════════════════════

  // GET /api/plans — Get available plans
  if (url.pathname === '/api/plans' && request.method === 'GET') {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price_mxn: 0,
        max_leads: 50,
        max_team_members: 2,
        max_messages_per_day: 100,
        features: ['WhatsApp básico', 'CRM básico', '1 desarrollo'],
      },
      {
        id: 'starter',
        name: 'Starter',
        price_mxn: 1499,
        stripe_price_id: 'price_1T9Eif0ikaK8tETEjfQnnM89',
        max_leads: 500,
        max_team_members: 5,
        max_messages_per_day: 1000,
        features: ['Todo en Free', 'IA conversacional', 'Reportes', 'Hasta 5 desarrollos'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price_mxn: 3999,
        stripe_price_id: 'price_1T9Eig0ikaK8tETEqmT2TyQ3',
        max_leads: 5000,
        max_team_members: 20,
        max_messages_per_day: 5000,
        features: ['Todo en Starter', 'Llamadas IA (Retell)', 'Calendario', 'Videos personalizados', 'Desarrollos ilimitados'],
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price_mxn: null,
        max_leads: -1,
        max_team_members: -1,
        max_messages_per_day: -1,
        features: ['Todo en Pro', 'Multi-línea WhatsApp', 'API dedicada', 'Soporte prioritario', 'Personalización'],
      },
    ];
    return corsResponse(JSON.stringify({ data: plans }));
  }

  // ═══════════════════════════════════════════════════════════════
  // SETUP — Populate tenant config from env vars (admin only)
  // ═══════════════════════════════════════════════════════════════

  // POST /api/admin/setup-from-env — Copy env vars to tenant config
  if (url.pathname === '/api/admin/setup-from-env' && request.method === 'POST') {
    const authErr = await checkAuthWithJWT(request, env, supabase, corsResponse, checkApiAuth);
    if (authErr) return authErr;

    const tenantId = supabase.getTenantId();
    const updates: any = {};

    // Only set if env var exists and tenant field is null
    const { data: current } = await supabase.client.from('tenants').select('*').eq('id', tenantId).single();
    if (!current) return corsResponse(JSON.stringify({ error: 'Tenant not found' }), 404);

    if (!current.whatsapp_phone_number_id && env.META_PHONE_NUMBER_ID) updates.whatsapp_phone_number_id = env.META_PHONE_NUMBER_ID;
    if (!current.whatsapp_access_token && env.META_ACCESS_TOKEN) updates.whatsapp_access_token = env.META_ACCESS_TOKEN;
    if (!current.whatsapp_webhook_secret && env.META_WEBHOOK_SECRET) updates.whatsapp_webhook_secret = env.META_WEBHOOK_SECRET;
    if (!current.whatsapp_business_id && env.META_WHATSAPP_BUSINESS_ID) updates.whatsapp_business_id = env.META_WHATSAPP_BUSINESS_ID;
    if (!current.google_calendar_id && env.GOOGLE_CALENDAR_ID) updates.google_calendar_id = env.GOOGLE_CALENDAR_ID;
    if (!current.google_service_account_email && env.GOOGLE_SERVICE_ACCOUNT_EMAIL) updates.google_service_account_email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (!current.google_private_key && env.GOOGLE_PRIVATE_KEY) updates.google_private_key = env.GOOGLE_PRIVATE_KEY;
    if (!current.retell_api_key && env.RETELL_API_KEY) updates.retell_api_key = env.RETELL_API_KEY;
    if (!current.retell_agent_id && env.RETELL_AGENT_ID) updates.retell_agent_id = env.RETELL_AGENT_ID;
    if (!current.retell_phone_number && env.RETELL_PHONE_NUMBER) updates.retell_phone_number = env.RETELL_PHONE_NUMBER;

    if (Object.keys(updates).length === 0) {
      return corsResponse(JSON.stringify({ message: 'No fields to update (all already set or no env vars)' }));
    }

    const { data: updated, error } = await supabase.client
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select('id, slug, whatsapp_phone_number_id, google_calendar_id, retell_agent_id')
      .single();

    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({
      data: updated,
      fields_updated: Object.keys(updates),
    }));
  }

  return null;
}
