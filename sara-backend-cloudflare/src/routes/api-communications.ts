// ═══════════════════════════════════════════════════════════════════════════
// API COMMUNICATIONS ROUTES — Email, SMS, Timeline, Templates
// Phase 4: Multi-channel communication
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { sendEmail, sendTemplateEmail, getTemplate, listTemplates, createTemplate, updateTemplate } from '../services/emailService';
import { logCommunication, getTimeline, getRecentCommunications, updateCommunicationStatus, getCommunicationStats } from '../services/communicationService';
import { sendViaBestChannel, getBestChannel, getAvailableChannels } from '../services/channelRouter';
import { sendSMS, formatPhoneForSMS } from '../services/smsService';
import { isAllowedCrmOrigin, parsePagination, paginatedResponse, validateRequired } from './cors';
import type { Env, CorsResponseFn, CheckApiAuthFn } from '../types/env';

function checkAuth(request: Request, env: Env, corsResponse: CorsResponseFn, checkApiAuth: CheckApiAuthFn): Response | null {
  const apiAuthResult = checkApiAuth(request, env);
  if (!apiAuthResult) return null;
  const origin = request.headers.get('Origin');
  if (isAllowedCrmOrigin(origin)) return null;
  return corsResponse(JSON.stringify({ error: 'No autorizado' }), 401);
}

export async function handleApiCommunicationsRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn
): Promise<Response | null> {

  // ═══════════════════════════════════════════════════════════════
  // TIMELINE
  // ═══════════════════════════════════════════════════════════════

  // GET /api/leads/:id/timeline
  const timelineMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/timeline$/);
  if (timelineMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const { page, limit } = parsePagination(url);
    const filters: any = { page, limit };
    if (url.searchParams.get('channel')) filters.channel = url.searchParams.get('channel');
    if (url.searchParams.get('direction')) filters.direction = url.searchParams.get('direction');
    const { data, total } = await getTimeline(supabase, timelineMatch[1], filters);
    return corsResponse(JSON.stringify(paginatedResponse(data, total, page, limit)));
  }

  // GET /api/leads/:id/channels
  const channelsMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/channels$/);
  if (channelsMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const { data: lead } = await supabase.client.from('leads').select('phone, email, preferred_channel, last_message_at').eq('id', channelsMatch[1]).single();
    if (!lead) return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
    const available = getAvailableChannels(lead);
    const best = getBestChannel(lead);
    return corsResponse(JSON.stringify({ available, best, preferred: lead.preferred_channel }));
  }

  // POST /api/leads/:id/send — Send message via best channel
  const sendMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/send$/);
  if (sendMatch && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['content']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);

    const { data: lead } = await supabase.client.from('leads').select('phone, email, preferred_channel, last_message_at').eq('id', sendMatch[1]).single();
    if (!lead) return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);

    const result = await sendViaBestChannel({
      lead,
      content: body.content,
      subject: body.subject,
      sendWhatsApp: async (_phone, _msg) => null, // TODO: wire to MetaWhatsAppService
      sendEmail: async (to, subject, html) => {
        if (!env.RESEND_API_KEY) return null;
        const r = await sendEmail(env.RESEND_API_KEY, { from: 'SARA <no-reply@gruposantarita.com>', to, subject, html });
        return r.id;
      },
      sendSMS: async (to, smsBody) => {
        if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
        const r = await sendSMS(
          { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, phoneNumber: env.TWILIO_PHONE_NUMBER },
          formatPhoneForSMS(to), smsBody
        );
        return r.sid;
      },
    });

    if (result.success) {
      await logCommunication(supabase, {
        lead_id: sendMatch[1],
        channel: result.channel_used as any,
        direction: 'outbound',
        content: body.content,
        subject: body.subject,
        status: 'sent',
        external_id: result.external_id,
      });
    }

    return corsResponse(JSON.stringify(result));
  }

  // GET /api/communications/stats
  if (url.pathname === '/api/communications/stats' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const filters: any = {};
    if (url.searchParams.get('lead_id')) filters.lead_id = url.searchParams.get('lead_id');
    if (url.searchParams.get('channel')) filters.channel = url.searchParams.get('channel');
    if (url.searchParams.get('from_date')) filters.from_date = url.searchParams.get('from_date');
    if (url.searchParams.get('to_date')) filters.to_date = url.searchParams.get('to_date');
    const stats = await getCommunicationStats(supabase, filters);
    return corsResponse(JSON.stringify({ data: stats }));
  }

  // PUT /api/communications/:id/status
  const commStatusMatch = url.pathname.match(/^\/api\/communications\/([0-9a-f-]{36})\/status$/);
  if (commStatusMatch && request.method === 'PUT') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['status']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const updated = await updateCommunicationStatus(supabase, commStatusMatch[1], body.status, body.error_message);
    if (!updated) return corsResponse(JSON.stringify({ error: 'Comunicacion no encontrada' }), 404);
    return corsResponse(JSON.stringify({ data: updated }));
  }

  // ═══════════════════════════════════════════════════════════════
  // EMAIL TEMPLATES
  // ═══════════════════════════════════════════════════════════════

  // GET /api/email-templates
  if (url.pathname === '/api/email-templates' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const category = url.searchParams.get('category') || undefined;
    const templates = await listTemplates(supabase, category);
    return corsResponse(JSON.stringify({ data: templates }));
  }

  // POST /api/email-templates
  if (url.pathname === '/api/email-templates' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['slug', 'name', 'subject', 'html_body']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const template = await createTemplate(supabase, body);
    if (!template) return corsResponse(JSON.stringify({ error: 'Error creando template' }), 500);
    return corsResponse(JSON.stringify({ data: template }), 201);
  }

  // GET /api/email-templates/:slug
  const templateMatch = url.pathname.match(/^\/api\/email-templates\/([a-z0-9_-]+)$/);
  if (templateMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const template = await getTemplate(supabase, templateMatch[1]);
    if (!template) return corsResponse(JSON.stringify({ error: 'Template no encontrado' }), 404);
    return corsResponse(JSON.stringify({ data: template }));
  }

  // PUT /api/email-templates/:id
  const templateUpdateMatch = url.pathname.match(/^\/api\/email-templates\/([0-9a-f-]{36})$/);
  if (templateUpdateMatch && request.method === 'PUT') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const updated = await updateTemplate(supabase, templateUpdateMatch[1], body);
    if (!updated) return corsResponse(JSON.stringify({ error: 'Error actualizando template' }), 500);
    return corsResponse(JSON.stringify({ data: updated }));
  }

  // POST /api/email/send
  if (url.pathname === '/api/email/send' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;

    if (!env.RESEND_API_KEY) {
      return corsResponse(JSON.stringify({ error: 'RESEND_API_KEY no configurado' }), 500);
    }

    if (body.template_slug) {
      const err = validateRequired(body, ['to', 'template_slug']);
      if (err) return corsResponse(JSON.stringify({ error: err }), 400);
      const result = await sendTemplateEmail(supabase, env.RESEND_API_KEY, body.template_slug, body.to, body.variables || {}, body.from);
      if (result.error) return corsResponse(JSON.stringify({ error: result.error }), 500);

      if (body.lead_id) {
        await logCommunication(supabase, {
          lead_id: body.lead_id,
          channel: 'email',
          direction: 'outbound',
          content: body.variables ? JSON.stringify(body.variables) : '',
          subject: body.template_slug,
          status: 'sent',
          external_id: result.id || undefined,
        });
      }

      return corsResponse(JSON.stringify({ data: result }));
    }

    const err = validateRequired(body, ['to', 'subject', 'html']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const result = await sendEmail(env.RESEND_API_KEY, {
      from: body.from || 'SARA <no-reply@gruposantarita.com>',
      to: body.to,
      subject: body.subject,
      html: body.html,
    });
    if (result.error) return corsResponse(JSON.stringify({ error: result.error }), 500);

    if (body.lead_id) {
      await logCommunication(supabase, {
        lead_id: body.lead_id,
        channel: 'email',
        direction: 'outbound',
        content: body.html,
        subject: body.subject,
        status: 'sent',
        external_id: result.id || undefined,
      });
    }

    return corsResponse(JSON.stringify({ data: result }));
  }

  // POST /api/sms/send
  if (url.pathname === '/api/sms/send' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['to', 'body']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);

    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      return corsResponse(JSON.stringify({ error: 'Twilio no configurado' }), 500);
    }

    const result = await sendSMS(
      { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, phoneNumber: env.TWILIO_PHONE_NUMBER },
      formatPhoneForSMS(body.to),
      body.body
    );

    if (result.error) return corsResponse(JSON.stringify({ error: result.error }), 500);

    if (body.lead_id) {
      await logCommunication(supabase, {
        lead_id: body.lead_id,
        channel: 'sms',
        direction: 'outbound',
        content: body.body,
        status: 'sent',
        external_id: result.sid || undefined,
      });
    }

    return corsResponse(JSON.stringify({ data: result }));
  }

  return null;
}
