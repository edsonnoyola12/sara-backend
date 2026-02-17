// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK SERVICE - Webhooks Salientes
// Sends notifications to external systems when events occur in SARA
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WebhookEventType =
  // Lead events
  | 'lead.created'
  | 'lead.updated'
  | 'lead.assigned'
  | 'lead.status_changed'
  | 'lead.qualified'
  | 'lead.lost'
  // Appointment events
  | 'appointment.created'
  | 'appointment.confirmed'
  | 'appointment.completed'
  | 'appointment.cancelled'
  | 'appointment.no_show'
  // Sale events
  | 'sale.created'
  | 'sale.reserved'
  | 'sale.closed'
  // Message events
  | 'message.received'
  | 'message.sent'
  // Team events
  | 'team.member_active'
  | 'team.member_inactive';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  headers?: Record<string, string>;
  active: boolean;
  secret?: string;
  retry_count: number;
  created_at: string;
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  webhook_id: string;
  data: any;
  metadata?: {
    lead_id?: string;
    appointment_id?: string;
    team_member_id?: string;
    vendor_id?: string;
    development?: string;
  };
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: WebhookEventType;
  payload: WebhookPayload;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  last_attempt_at: string | null;
  response_status: number | null;
  response_body: string | null;
  error: string | null;
  created_at: string;
}

export interface WebhookStats {
  webhook_id: string;
  total_deliveries: number;
  successful: number;
  failed: number;
  success_rate: string;
  avg_response_time_ms: number;
  last_delivery_at: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class WebhookService {
  private webhooks: WebhookConfig[] = [];
  private deliveryQueue: WebhookDelivery[] = [];

  constructor(
    private supabase: SupabaseService,
    private cache?: KVNamespace
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBHOOK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async loadWebhooks(): Promise<WebhookConfig[]> {
    // Try cache first
    if (this.cache) {
      const cached = await this.cache.get('webhooks_config', 'json');
      if (cached) {
        this.webhooks = cached as WebhookConfig[];
        return this.webhooks;
      }
    }

    // Load from database
    const { data } = await this.supabase.client
      .from('webhooks')
      .select('*')
      .eq('active', true);

    this.webhooks = (data || []).map(w => ({
      id: w.id,
      name: w.name,
      url: w.url,
      events: w.events || [],
      headers: w.headers || {},
      active: w.active,
      secret: w.secret,
      retry_count: w.retry_count || 3,
      created_at: w.created_at
    }));

    // Cache for 5 minutes
    if (this.cache) {
      await this.cache.put('webhooks_config', JSON.stringify(this.webhooks), {
        expirationTtl: 300
      });
    }

    return this.webhooks;
  }

  async createWebhook(config: Omit<WebhookConfig, 'id' | 'created_at'>): Promise<WebhookConfig | null> {
    const { data, error } = await this.supabase.client
      .from('webhooks')
      .insert({
        name: config.name,
        url: config.url,
        events: config.events,
        headers: config.headers || {},
        active: config.active,
        secret: config.secret || this.generateSecret(),
        retry_count: config.retry_count || 3
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating webhook:', error);
      return null;
    }

    // Invalidate cache
    if (this.cache) {
      await this.cache.delete('webhooks_config');
    }

    return data;
  }

  async updateWebhook(id: string, updates: Partial<WebhookConfig>): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('webhooks')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('⚠️ Error updating webhook:', error);
      return false;
    }

    // Invalidate cache
    if (this.cache) {
      await this.cache.delete('webhooks_config');
    }

    return true;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('webhooks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting webhook:', error);
      return false;
    }

    // Invalidate cache
    if (this.cache) {
      await this.cache.delete('webhooks_config');
    }

    return true;
  }

  async getWebhookStats(webhookId: string): Promise<WebhookStats | null> {
    const { data: deliveries } = await this.supabase.client
      .from('webhook_deliveries')
      .select('status, response_time_ms, created_at')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!deliveries || deliveries.length === 0) {
      return null;
    }

    const successful = deliveries.filter(d => d.status === 'success').length;
    const failed = deliveries.filter(d => d.status === 'failed').length;
    const responseTimes = deliveries
      .filter(d => d.response_time_ms)
      .map(d => d.response_time_ms);

    return {
      webhook_id: webhookId,
      total_deliveries: deliveries.length,
      successful,
      failed,
      success_rate: ((successful / deliveries.length) * 100).toFixed(1) + '%',
      avg_response_time_ms: responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0,
      last_delivery_at: deliveries[0]?.created_at || null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT DISPATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  async dispatch(event: WebhookEventType, data: any, metadata?: WebhookPayload['metadata']): Promise<void> {
    // Load webhooks if not loaded
    if (this.webhooks.length === 0) {
      await this.loadWebhooks();
    }

    // Find matching webhooks
    const matchingWebhooks = this.webhooks.filter(w =>
      w.active && w.events.includes(event)
    );

    if (matchingWebhooks.length === 0) {
      return;
    }

    // Create payloads and dispatch
    const promises = matchingWebhooks.map(webhook => {
      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        webhook_id: webhook.id,
        data,
        metadata
      };

      return this.sendWebhook(webhook, payload);
    });

    // Fire and forget (don't block the main flow)
    Promise.allSettled(promises).catch(err => {
      console.error('Error dispatching webhooks:', err);
    });
  }

  private async sendWebhook(webhook: WebhookConfig, payload: WebhookPayload): Promise<boolean> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: string | null = null;
    let responseStatus: number | null = null;
    let responseBody: string | null = null;

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'SARA-CRM-Webhook/1.0',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
      ...webhook.headers
    };

    // Add signature if secret is set
    if (webhook.secret) {
      const signature = await this.generateSignature(payload, webhook.secret);
      headers['X-Webhook-Signature'] = signature;
    }

    // Retry loop
    while (attempts < webhook.retry_count) {
      attempts++;

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        responseStatus = response.status;
        responseBody = await response.text().catch(() => '');

        if (response.ok) {
          // Log successful delivery
          await this.logDelivery(webhook.id, payload, 'success', attempts, responseStatus, responseBody, null, Date.now() - startTime);
          return true;
        }

        // Non-retryable status codes
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          lastError = `HTTP ${response.status}: ${responseBody}`;
          break;
        }

        lastError = `HTTP ${response.status}`;
      } catch (err: any) {
        lastError = err.message || 'Unknown error';
      }

      // Wait before retry (exponential backoff)
      if (attempts < webhook.retry_count) {
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempts), 10000)));
      }
    }

    // Log failed delivery
    await this.logDelivery(webhook.id, payload, 'failed', attempts, responseStatus, responseBody, lastError, Date.now() - startTime);
    return false;
  }

  private async logDelivery(
    webhookId: string,
    payload: WebhookPayload,
    status: 'success' | 'failed',
    attempts: number,
    responseStatus: number | null,
    responseBody: string | null,
    error: string | null,
    responseTimeMs: number
  ): Promise<void> {
    try {
      await this.supabase.client
        .from('webhook_deliveries')
        .insert({
          webhook_id: webhookId,
          event: payload.event,
          payload: JSON.stringify(payload),
          status,
          attempts,
          response_status: responseStatus,
          response_body: responseBody?.slice(0, 1000), // Limit size
          error,
          response_time_ms: responseTimeMs
        });
    } catch (err) {
      console.error('Error logging webhook delivery:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVENIENCE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Lead Events
  async onLeadCreated(lead: any): Promise<void> {
    await this.dispatch('lead.created', {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      property_interest: lead.property_interest,
      budget: lead.budget,
      created_at: lead.created_at
    }, {
      lead_id: lead.id,
      development: lead.property_interest
    });
  }

  async onLeadUpdated(lead: any, changes: Record<string, any>): Promise<void> {
    await this.dispatch('lead.updated', {
      id: lead.id,
      name: lead.name,
      changes,
      updated_at: new Date().toISOString()
    }, {
      lead_id: lead.id
    });
  }

  async onLeadAssigned(lead: any, vendorId: string, vendorName: string): Promise<void> {
    await this.dispatch('lead.assigned', {
      lead_id: lead.id,
      lead_name: lead.name,
      vendor_id: vendorId,
      vendor_name: vendorName,
      assigned_at: new Date().toISOString()
    }, {
      lead_id: lead.id,
      vendor_id: vendorId
    });
  }

  async onLeadStatusChanged(lead: any, oldStatus: string, newStatus: string): Promise<void> {
    await this.dispatch('lead.status_changed', {
      lead_id: lead.id,
      lead_name: lead.name,
      old_status: oldStatus,
      new_status: newStatus,
      changed_at: new Date().toISOString()
    }, {
      lead_id: lead.id
    });

    // Also dispatch specific events
    if (['qualified', 'visit_scheduled'].includes(newStatus)) {
      await this.dispatch('lead.qualified', {
        lead_id: lead.id,
        lead_name: lead.name,
        status: newStatus
      }, { lead_id: lead.id });
    }

    if (newStatus === 'lost') {
      await this.dispatch('lead.lost', {
        lead_id: lead.id,
        lead_name: lead.name,
        lost_reason: lead.lost_reason
      }, { lead_id: lead.id });
    }
  }

  // Appointment Events
  async onAppointmentCreated(appointment: any, lead: any): Promise<void> {
    await this.dispatch('appointment.created', {
      id: appointment.id,
      lead_id: lead.id,
      lead_name: lead.name,
      lead_phone: lead.phone,
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time,
      development: appointment.development || appointment.property_interest,
      vendor_id: appointment.vendor_id,
      created_at: appointment.created_at
    }, {
      lead_id: lead.id,
      appointment_id: appointment.id,
      vendor_id: appointment.vendor_id,
      development: appointment.development
    });
  }

  async onAppointmentCompleted(appointment: any, lead: any): Promise<void> {
    await this.dispatch('appointment.completed', {
      id: appointment.id,
      lead_id: lead.id,
      lead_name: lead.name,
      scheduled_date: appointment.scheduled_date,
      development: appointment.development,
      completed_at: new Date().toISOString()
    }, {
      lead_id: lead.id,
      appointment_id: appointment.id,
      development: appointment.development
    });
  }

  async onAppointmentNoShow(appointment: any, lead: any): Promise<void> {
    await this.dispatch('appointment.no_show', {
      id: appointment.id,
      lead_id: lead.id,
      lead_name: lead.name,
      scheduled_date: appointment.scheduled_date,
      development: appointment.development
    }, {
      lead_id: lead.id,
      appointment_id: appointment.id
    });
  }

  // Sale Events
  async onSaleCreated(lead: any, saleData: any): Promise<void> {
    await this.dispatch('sale.created', {
      lead_id: lead.id,
      lead_name: lead.name,
      property: saleData.property || lead.property_interest,
      price: saleData.price || lead.budget,
      vendor_id: lead.assigned_to,
      created_at: new Date().toISOString()
    }, {
      lead_id: lead.id,
      vendor_id: lead.assigned_to,
      development: saleData.property || lead.property_interest
    });
  }

  async onSaleClosed(lead: any, saleData: any): Promise<void> {
    await this.dispatch('sale.closed', {
      lead_id: lead.id,
      lead_name: lead.name,
      property: saleData.property || lead.property_interest,
      price: saleData.price || lead.budget,
      vendor_id: lead.assigned_to,
      closed_at: new Date().toISOString()
    }, {
      lead_id: lead.id,
      vendor_id: lead.assigned_to,
      development: saleData.property
    });
  }

  // Message Events
  async onMessageReceived(leadId: string, message: string, from: string): Promise<void> {
    await this.dispatch('message.received', {
      lead_id: leadId,
      from,
      message: message.slice(0, 500), // Limit message size
      received_at: new Date().toISOString()
    }, {
      lead_id: leadId
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private generateSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'whsec_';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async generateSignature(payload: WebhookPayload, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const keyData = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return `sha256=${hashHex}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatWebhooksListForWhatsApp(webhooks: WebhookConfig[]): string {
    if (webhooks.length === 0) {
      return `🔗 *WEBHOOKS*\n\nNo hay webhooks configurados.`;
    }

    let msg = `🔗 *WEBHOOKS CONFIGURADOS*\n\n`;

    for (const webhook of webhooks) {
      const status = webhook.active ? '✅' : '❌';
      msg += `${status} *${webhook.name}*\n`;
      msg += `   URL: ${webhook.url.slice(0, 50)}...\n`;
      msg += `   Eventos: ${webhook.events.length}\n\n`;
    }

    return msg;
  }

  formatStatsForWhatsApp(stats: WebhookStats): string {
    let msg = `📊 *ESTADÍSTICAS WEBHOOK*\n\n`;
    msg += `Total entregas: ${stats.total_deliveries}\n`;
    msg += `✅ Exitosas: ${stats.successful}\n`;
    msg += `❌ Fallidas: ${stats.failed}\n`;
    msg += `📈 Tasa éxito: ${stats.success_rate}\n`;
    msg += `⏱️ Tiempo resp: ${stats.avg_response_time_ms}ms\n`;

    if (stats.last_delivery_at) {
      msg += `\nÚltima entrega: ${new Date(stats.last_delivery_at).toLocaleString('es-MX')}`;
    }

    return msg;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SQL FOR WEBHOOKS TABLES
// Run this in Supabase to create the required tables
// ═══════════════════════════════════════════════════════════════════════════
/*
-- Webhooks configuration table
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  headers JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  secret VARCHAR(255),
  retry_count INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook deliveries log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
*/
