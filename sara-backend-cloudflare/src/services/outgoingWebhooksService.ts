// ═══════════════════════════════════════════════════════════════════════════
// OUTGOING WEBHOOKS SERVICE - Enviar eventos a sistemas externos
// ═══════════════════════════════════════════════════════════════════════════
// Permite integrar SARA con Zapier, Make, CRMs externos, etc.
// Incluye reintentos automáticos y cola de eventos
// ═══════════════════════════════════════════════════════════════════════════

export type WebhookEventType =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.qualified'
  | 'lead.converted'
  | 'lead.lost'
  | 'appointment.scheduled'
  | 'appointment.completed'
  | 'appointment.canceled'
  | 'message.received'
  | 'message.sent'
  | 'sale.completed';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  secret?: string; // Para firmar payloads
  active: boolean;
  headers?: Record<string, string>;
  createdAt: string;
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, any>;
  webhookId: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEventType;
  payload: WebhookPayload;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttempt?: string;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
}

const WEBHOOKS_KEY = 'webhooks:config';
const WEBHOOK_QUEUE_KEY = 'webhooks:queue';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

export class OutgoingWebhooksService {
  private kv: KVNamespace | undefined;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURACIÓN DE WEBHOOKS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene todos los webhooks configurados
   */
  async getWebhooks(): Promise<WebhookConfig[]> {
    if (!this.kv) return [];

    try {
      const data = await this.kv.get(WEBHOOKS_KEY, 'json');
      return (data as WebhookConfig[]) || [];
    } catch (e) {
      console.error('Error obteniendo webhooks:', e);
      return [];
    }
  }

  /**
   * Obtiene un webhook por ID
   */
  async getWebhook(id: string): Promise<WebhookConfig | null> {
    const webhooks = await this.getWebhooks();
    return webhooks.find(w => w.id === id) || null;
  }

  /**
   * Crea un nuevo webhook
   */
  async createWebhook(config: Omit<WebhookConfig, 'id' | 'createdAt'>): Promise<WebhookConfig> {
    const webhooks = await this.getWebhooks();

    const newWebhook: WebhookConfig = {
      ...config,
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString()
    };

    webhooks.push(newWebhook);
    await this.saveWebhooks(webhooks);

    console.log(`🔗 Webhook creado: ${newWebhook.name} (${newWebhook.id})`);
    return newWebhook;
  }

  /**
   * Actualiza un webhook
   */
  async updateWebhook(id: string, updates: Partial<WebhookConfig>): Promise<WebhookConfig | null> {
    const webhooks = await this.getWebhooks();
    const index = webhooks.findIndex(w => w.id === id);

    if (index === -1) return null;

    webhooks[index] = { ...webhooks[index], ...updates };
    await this.saveWebhooks(webhooks);

    return webhooks[index];
  }

  /**
   * Elimina un webhook
   */
  async deleteWebhook(id: string): Promise<boolean> {
    const webhooks = await this.getWebhooks();
    const filtered = webhooks.filter(w => w.id !== id);

    if (filtered.length === webhooks.length) return false;

    await this.saveWebhooks(filtered);
    console.log(`🗑️ Webhook eliminado: ${id}`);
    return true;
  }

  private async saveWebhooks(webhooks: WebhookConfig[]): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(WEBHOOKS_KEY, JSON.stringify(webhooks));
  }

  // ═══════════════════════════════════════════════════════════════
  // ENVÍO DE EVENTOS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Dispara un evento a todos los webhooks suscritos
   */
  async trigger(event: WebhookEventType, data: Record<string, any>): Promise<void> {
    const webhooks = await this.getWebhooks();
    const activeWebhooks = webhooks.filter(w => w.active && w.events.includes(event));

    if (activeWebhooks.length === 0) {
      return;
    }

    console.log(`📤 Disparando evento ${event} a ${activeWebhooks.length} webhook(s)`);

    // Enviar a todos los webhooks en paralelo
    await Promise.all(
      activeWebhooks.map(webhook => this.sendToWebhook(webhook, event, data))
    );
  }

  /**
   * Envía un evento a un webhook específico
   */
  private async sendToWebhook(
    webhook: WebhookConfig,
    event: WebhookEventType,
    data: Record<string, any>
  ): Promise<void> {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
      webhookId: webhook.id
    };

    const delivery: WebhookDelivery = {
      id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
      attempts: 0
    };

    // Intentar enviar con reintentos
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      delivery.attempts++;
      delivery.lastAttempt = new Date().toISOString();

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'SARA-Webhooks/1.0',
          'X-Webhook-Event': event,
          'X-Webhook-Delivery': delivery.id,
          ...webhook.headers
        };

        // Agregar firma si hay secret
        if (webhook.secret) {
          const signature = await this.signPayload(JSON.stringify(payload), webhook.secret);
          headers['X-Webhook-Signature'] = signature;
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        delivery.responseStatus = response.status;

        if (response.ok) {
          delivery.status = 'success';
          console.log(`✅ Webhook entregado: ${webhook.name} (${event})`);
          return;
        }

        delivery.responseBody = await response.text().catch(() => '');
        console.warn(`⚠️ Webhook falló (${response.status}): ${webhook.name}`);

      } catch (e) {
        delivery.error = e instanceof Error ? e.message : String(e);
        console.error(`❌ Error webhook ${webhook.name}:`, e);
      }

      // Esperar antes del siguiente reintento
      if (attempt < MAX_RETRIES - 1) {
        await this.delay(RETRY_DELAYS[attempt]);
      }
    }

    // Todos los reintentos fallaron
    delivery.status = 'failed';
    await this.logFailedDelivery(delivery);
  }

  /**
   * Firma un payload con HMAC-SHA256
   */
  private async signPayload(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(signature));
    return 'sha256=' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async logFailedDelivery(delivery: WebhookDelivery): Promise<void> {
    console.error(`🚨 Webhook falló después de ${delivery.attempts} intentos:`, {
      webhookId: delivery.webhookId,
      event: delivery.event,
      error: delivery.error
    });

    // Guardar en cola de fallidos para revisión
    if (this.kv) {
      try {
        const queue = await this.kv.get(WEBHOOK_QUEUE_KEY, 'json') as WebhookDelivery[] || [];
        queue.push(delivery);
        // Mantener solo las últimas 100 entregas fallidas
        const trimmed = queue.slice(-100);
        await this.kv.put(WEBHOOK_QUEUE_KEY, JSON.stringify(trimmed));
      } catch (e) {
        console.error('Error guardando delivery fallido:', e);
      }
    }
  }

  /**
   * Obtiene entregas fallidas
   */
  async getFailedDeliveries(): Promise<WebhookDelivery[]> {
    if (!this.kv) return [];

    try {
      return await this.kv.get(WEBHOOK_QUEUE_KEY, 'json') as WebhookDelivery[] || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Reintenta una entrega fallida
   */
  async retryDelivery(deliveryId: string): Promise<boolean> {
    const deliveries = await this.getFailedDeliveries();
    const delivery = deliveries.find(d => d.id === deliveryId);

    if (!delivery) return false;

    const webhook = await this.getWebhook(delivery.webhookId);
    if (!webhook) return false;

    // Reintentar
    await this.sendToWebhook(webhook, delivery.event, delivery.payload.data);

    // Remover de la cola de fallidos
    const filtered = deliveries.filter(d => d.id !== deliveryId);
    if (this.kv) {
      await this.kv.put(WEBHOOK_QUEUE_KEY, JSON.stringify(filtered));
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS PARA EVENTOS COMUNES
  // ═══════════════════════════════════════════════════════════════

  async onLeadCreated(lead: any): Promise<void> {
    await this.trigger('lead.created', {
      lead_id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      property_interest: lead.property_interest,
      created_at: lead.created_at
    });
  }

  async onLeadQualified(lead: any, score: number): Promise<void> {
    await this.trigger('lead.qualified', {
      lead_id: lead.id,
      name: lead.name,
      phone: lead.phone,
      score,
      status: lead.status
    });
  }

  async onAppointmentScheduled(appointment: any, lead: any): Promise<void> {
    await this.trigger('appointment.scheduled', {
      appointment_id: appointment.id,
      lead_id: lead.id,
      lead_name: lead.name,
      lead_phone: lead.phone,
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time,
      property: appointment.property_name
    });
  }

  async onSaleCompleted(lead: any, amount?: number): Promise<void> {
    await this.trigger('sale.completed', {
      lead_id: lead.id,
      name: lead.name,
      phone: lead.phone,
      property: lead.property_interest,
      amount,
      completed_at: new Date().toISOString()
    });
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createOutgoingWebhooks(kv?: KVNamespace): OutgoingWebhooksService {
  return new OutgoingWebhooksService(kv);
}
