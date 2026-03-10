import { SupabaseService } from './supabase';

// ── Interfaces ──────────────────────────────────────────────

export interface LeadContact {
  phone: string;
  email?: string | null;
  preferred_channel?: string;
  last_message_at?: string | null;
}

export interface SendParams {
  lead: LeadContact;
  content: string;
  subject?: string;
  sendWhatsApp: (phone: string, msg: string) => Promise<string | null>;
  sendEmail: (to: string, subject: string, html: string) => Promise<string | null>;
  sendSMS: (to: string, body: string) => Promise<string | null>;
}

export interface SendResult {
  channel_used: string;
  success: boolean;
  external_id?: string;
  error?: string;
}

type Channel = 'whatsapp' | 'email' | 'sms' | 'none';

// ── Pure functions ──────────────────────────────────────────

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWhatsAppWindowOpen(lastMessageAt: string | null): boolean {
  if (!lastMessageAt) return false;
  const elapsed = Date.now() - new Date(lastMessageAt).getTime();
  return elapsed < WHATSAPP_WINDOW_MS;
}

export function getAvailableChannels(lead: LeadContact): Channel[] {
  const channels: Channel[] = [];
  if (lead.phone) channels.push('whatsapp', 'sms');
  if (lead.email) channels.push('email');
  return channels;
}

export function getBestChannel(lead: LeadContact): Channel {
  const available = getAvailableChannels(lead);
  if (available.length === 0) return 'none';

  // Preferred channel wins if available
  if (lead.preferred_channel && available.includes(lead.preferred_channel as Channel)) {
    return lead.preferred_channel as Channel;
  }

  // WhatsApp if window is open
  if (available.includes('whatsapp') && isWhatsAppWindowOpen(lead.last_message_at ?? null)) {
    return 'whatsapp';
  }

  // Email as fallback
  if (available.includes('email')) return 'email';

  // SMS last resort
  if (available.includes('sms')) return 'sms';

  return 'none';
}

// ── Orchestrator ────────────────────────────────────────────

export async function sendViaBestChannel(params: SendParams): Promise<SendResult> {
  const { lead, content, subject, sendWhatsApp, sendEmail, sendSMS } = params;

  // Build ordered attempt list: best channel first, then fallbacks
  const attempts: { channel: Channel; fn: () => Promise<string | null> }[] = [];

  if (lead.phone && isWhatsAppWindowOpen(lead.last_message_at ?? null)) {
    attempts.push({ channel: 'whatsapp', fn: () => sendWhatsApp(lead.phone, content) });
  }

  if (lead.email) {
    attempts.push({
      channel: 'email',
      fn: () => sendEmail(lead.email!, subject ?? 'Mensaje de Grupo Santa Rita', content),
    });
  }

  if (lead.phone) {
    attempts.push({ channel: 'sms', fn: () => sendSMS(lead.phone, content) });
  }

  // Try each channel in order — first success wins
  for (const attempt of attempts) {
    try {
      const externalId = await attempt.fn();
      if (externalId) {
        return { channel_used: attempt.channel, success: true, external_id: externalId };
      }
    } catch (err: any) {
      console.error(`[channelRouter] ${attempt.channel} failed:`, err.message ?? err);
      // Continue to next channel
    }
  }

  return {
    channel_used: 'none',
    success: false,
    error: 'All channels exhausted or no contact info available',
  };
}
