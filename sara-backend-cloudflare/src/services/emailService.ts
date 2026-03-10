// ═══════════════════════════════════════════════════════════════════════════
// EMAIL SERVICE - Envio de emails via Resend API
// ═══════════════════════════════════════════════════════════════════════════
// Servicio generico para enviar emails y gestionar templates.
// Compatible con Cloudflare Workers (usa fetch, no modulos Node.js).
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ─── Interfaces ──────────────────────────────────────────────────────────

export interface SendEmailParams {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  id: string | null;
  error?: string;
}

export interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  subject: string;
  html_body: string;
  variables: string[];
  category: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  slug: string;
  name: string;
  subject: string;
  html_body: string;
  variables?: string[];
  category?: string;
  active?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'SARA <no-reply@gruposantarita.com>';

// ─── Core Email Sending ─────────────────────────────────────────────────

/**
 * Send an email via the Resend API.
 */
export async function sendEmail(
  apiKey: string,
  params: SendEmailParams
): Promise<SendEmailResult> {
  if (!apiKey) {
    return { id: null, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from || DEFAULT_FROM,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        ...(params.reply_to && { reply_to: params.reply_to }),
        ...(params.tags && { tags: params.tags }),
      }),
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json() as { message?: string };
        errorMessage = errorBody.message || `Resend API error: ${response.status}`;
      } catch {
        errorMessage = `Resend API error: ${response.status} ${response.statusText}`;
      }
      console.error('[emailService] sendEmail failed:', errorMessage);
      return { id: null, error: errorMessage };
    }

    const result = await response.json() as { id: string };
    return { id: result.id };
  } catch (err: any) {
    const errorMessage = err?.message || 'Unknown error sending email';
    console.error('[emailService] sendEmail exception:', errorMessage);
    return { id: null, error: errorMessage };
  }
}

// ─── Template Rendering ─────────────────────────────────────────────────

/**
 * Replace all {{key}} placeholders in an HTML string with the provided values.
 */
export function renderTemplate(
  html: string,
  variables: Record<string, string>
): string {
  let rendered = html;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return rendered;
}

// ─── Template CRUD ──────────────────────────────────────────────────────

/**
 * Fetch a single template by slug from the email_templates table.
 */
export async function getTemplate(
  supabase: SupabaseService,
  slug: string
): Promise<EmailTemplate | null> {
  const { data, error } = await supabase.client
    .from('email_templates')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[emailService] getTemplate error:', error.message);
    }
    return null;
  }

  return data as EmailTemplate;
}

/**
 * List active templates, optionally filtered by category.
 */
export async function listTemplates(
  supabase: SupabaseService,
  category?: string
): Promise<EmailTemplate[]> {
  let query = supabase.client
    .from('email_templates')
    .select('*')
    .eq('active', true)
    .order('category')
    .order('name');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[emailService] listTemplates error:', error.message);
    return [];
  }

  return (data || []) as EmailTemplate[];
}

/**
 * Create a new email template.
 */
export async function createTemplate(
  supabase: SupabaseService,
  data: CreateTemplateInput
): Promise<EmailTemplate | null> {
  const { data: created, error } = await supabase.client
    .from('email_templates')
    .insert([{
      slug: data.slug,
      name: data.name,
      subject: data.subject,
      html_body: data.html_body,
      variables: data.variables || [],
      category: data.category || 'general',
      active: data.active !== undefined ? data.active : true,
    }])
    .select()
    .single();

  if (error) {
    console.error('[emailService] createTemplate error:', error.message);
    return null;
  }

  return created as EmailTemplate;
}

/**
 * Update an existing email template by ID.
 */
export async function updateTemplate(
  supabase: SupabaseService,
  templateId: string,
  updates: Partial<Omit<EmailTemplate, 'id' | 'created_at'>>
): Promise<EmailTemplate | null> {
  const { data: updated, error } = await supabase.client
    .from('email_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    console.error('[emailService] updateTemplate error:', error.message);
    return null;
  }

  return updated as EmailTemplate;
}

// ─── Template Email Sending ─────────────────────────────────────────────

/**
 * Look up a template by slug, render it with variables, and send.
 */
export async function sendTemplateEmail(
  supabase: SupabaseService,
  apiKey: string,
  templateSlug: string,
  to: string,
  variables: Record<string, string>,
  from?: string
): Promise<SendEmailResult> {
  const template = await getTemplate(supabase, templateSlug);
  if (!template) {
    return { id: null, error: `Template not found: ${templateSlug}` };
  }

  const renderedHtml = renderTemplate(template.html_body, variables);
  const renderedSubject = renderTemplate(template.subject, variables);

  return sendEmail(apiKey, {
    from: from || DEFAULT_FROM,
    to,
    subject: renderedSubject,
    html: renderedHtml,
  });
}
