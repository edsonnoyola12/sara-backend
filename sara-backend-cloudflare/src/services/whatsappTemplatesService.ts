// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP TEMPLATES SERVICE - Gestión de templates de WhatsApp Business
// ═══════════════════════════════════════════════════════════════════════════
// Permite crear, listar y enviar templates aprobados por Meta
// Incluye soporte para variables dinámicas y diferentes tipos de templates
// ═══════════════════════════════════════════════════════════════════════════

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED';
export type ComponentType = 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string; // Para URL buttons
  phoneNumber?: string; // Para PHONE_NUMBER buttons
}

export interface TemplateComponent {
  type: ComponentType;
  format?: HeaderFormat; // Solo para HEADER
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[]; // Para media
  };
  buttons?: TemplateButton[];
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  components: TemplateComponent[];
  createdAt: string;
  updatedAt: string;
  // Campos internos de SARA
  description?: string; // Descripción interna de para qué se usa
  tags?: string[]; // Tags para organizar (e.g., "followup", "promo", "appointment")
  usageCount?: number;
  lastUsedAt?: string;
}

export interface TemplateSendOptions {
  to: string; // Número del destinatario
  templateName: string;
  language?: string; // Default: es_MX
  headerParams?: string[]; // Variables del header
  bodyParams?: string[]; // Variables del body
  headerMediaUrl?: string; // URL de media para header
  headerMediaType?: 'image' | 'video' | 'document';
  buttonParams?: Array<{
    type: 'url' | 'quick_reply';
    index: number;
    value: string;
  }>;
}

export interface TemplateMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const TEMPLATES_KEY = 'whatsapp:templates';

export class WhatsAppTemplatesService {
  private kv: KVNamespace | undefined;
  private phoneNumberId: string;
  private accessToken: string;

  constructor(kv?: KVNamespace, phoneNumberId?: string, accessToken?: string) {
    this.kv = kv;
    this.phoneNumberId = phoneNumberId || '';
    this.accessToken = accessToken || '';
  }

  // ═══════════════════════════════════════════════════════════════
  // GESTIÓN DE TEMPLATES LOCALES (Cache de templates aprobados)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Sincroniza templates desde la API de Meta
   */
  async syncFromMeta(): Promise<WhatsAppTemplate[]> {
    if (!this.phoneNumberId || !this.accessToken) {
      console.warn('⚠️ Meta credentials not configured');
      return [];
    }

    try {
      // Obtener business_id del phone number
      const phoneUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}?fields=verified_name,display_phone_number&access_token=${this.accessToken}`;
      const phoneResponse = await fetch(phoneUrl);

      if (!phoneResponse.ok) {
        console.error('Error fetching phone info:', await phoneResponse.text());
        return [];
      }

      // Obtener templates del WABA
      const wabaUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/message_templates?access_token=${this.accessToken}`;
      const response = await fetch(wabaUrl);

      if (!response.ok) {
        console.error('Error fetching templates:', await response.text());
        return [];
      }

      const data = await response.json() as any;
      const templates: WhatsAppTemplate[] = (data.data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Guardar en cache
      await this.saveTemplates(templates);
      console.log(`📋 Sincronizados ${templates.length} templates de WhatsApp`);

      return templates;
    } catch (error) {
      console.error('Error syncing templates:', error);
      return [];
    }
  }

  /**
   * Obtiene todos los templates
   */
  async getTemplates(): Promise<WhatsAppTemplate[]> {
    if (!this.kv) return [];

    try {
      const data = await this.kv.get(TEMPLATES_KEY, 'json');
      return (data as WhatsAppTemplate[]) || [];
    } catch (e) {
      console.error('Error obteniendo templates:', e);
      return [];
    }
  }

  /**
   * Obtiene un template por nombre
   */
  async getTemplate(name: string, language: string = 'es_MX'): Promise<WhatsAppTemplate | null> {
    const templates = await this.getTemplates();
    return templates.find(t => t.name === name && t.language === language) || null;
  }

  /**
   * Busca templates por tags
   */
  async getTemplatesByTag(tag: string): Promise<WhatsAppTemplate[]> {
    const templates = await this.getTemplates();
    return templates.filter(t => t.tags?.includes(tag));
  }

  /**
   * Obtiene templates aprobados
   */
  async getApprovedTemplates(): Promise<WhatsAppTemplate[]> {
    const templates = await this.getTemplates();
    return templates.filter(t => t.status === 'APPROVED');
  }

  /**
   * Actualiza metadata de un template (descripción, tags)
   */
  async updateTemplateMetadata(
    name: string,
    metadata: { description?: string; tags?: string[] }
  ): Promise<WhatsAppTemplate | null> {
    const templates = await this.getTemplates();
    const index = templates.findIndex(t => t.name === name);

    if (index === -1) return null;

    templates[index] = {
      ...templates[index],
      ...metadata,
      updatedAt: new Date().toISOString()
    };

    await this.saveTemplates(templates);
    return templates[index];
  }

  private async saveTemplates(templates: WhatsAppTemplate[]): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(TEMPLATES_KEY, JSON.stringify(templates));
  }

  // ═══════════════════════════════════════════════════════════════
  // ENVÍO DE TEMPLATES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Envía un mensaje usando un template
   */
  async sendTemplate(options: TemplateSendOptions): Promise<TemplateMessageResult> {
    if (!this.phoneNumberId || !this.accessToken) {
      return { success: false, error: 'Meta credentials not configured' };
    }

    // Verificar que el template existe y está aprobado
    const template = await this.getTemplate(options.templateName, options.language || 'es_MX');
    if (!template) {
      return { success: false, error: `Template "${options.templateName}" no encontrado` };
    }

    if (template.status !== 'APPROVED') {
      return { success: false, error: `Template "${options.templateName}" no está aprobado (status: ${template.status})` };
    }

    // Construir el payload del mensaje
    const components: any[] = [];

    // Header con parámetros
    if (options.headerParams && options.headerParams.length > 0) {
      components.push({
        type: 'header',
        parameters: options.headerParams.map(p => ({ type: 'text', text: p }))
      });
    }

    // Header con media
    if (options.headerMediaUrl) {
      const mediaType = options.headerMediaType || 'image';
      components.push({
        type: 'header',
        parameters: [{
          type: mediaType,
          [mediaType]: { link: options.headerMediaUrl }
        }]
      });
    }

    // Body con parámetros
    if (options.bodyParams && options.bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: options.bodyParams.map(p => ({ type: 'text', text: p }))
      });
    }

    // Buttons con parámetros
    if (options.buttonParams && options.buttonParams.length > 0) {
      for (const btn of options.buttonParams) {
        if (btn.type === 'url') {
          components.push({
            type: 'button',
            sub_type: 'url',
            index: btn.index,
            parameters: [{ type: 'text', text: btn.value }]
          });
        }
      }
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: options.to.replace(/\D/g, ''), // Solo números
      type: 'template',
      template: {
        name: options.templateName,
        language: { code: options.language || 'es_MX' },
        components: components.length > 0 ? components : undefined
      }
    };

    try {
      const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json() as any;

      if (response.ok) {
        // Actualizar contador de uso
        await this.incrementUsage(options.templateName);

        return {
          success: true,
          messageId: result.messages?.[0]?.id
        };
      }

      return {
        success: false,
        error: result.error?.message || 'Error desconocido'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error de red'
      };
    }
  }

  /**
   * Incrementa el contador de uso de un template
   */
  private async incrementUsage(templateName: string): Promise<void> {
    const templates = await this.getTemplates();
    const index = templates.findIndex(t => t.name === templateName);

    if (index !== -1) {
      templates[index].usageCount = (templates[index].usageCount || 0) + 1;
      templates[index].lastUsedAt = new Date().toISOString();
      await this.saveTemplates(templates);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATES PREDEFINIDOS COMUNES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Envía template de bienvenida
   */
  async sendWelcome(to: string, leadName: string): Promise<TemplateMessageResult> {
    return this.sendTemplate({
      to,
      templateName: 'bienvenida_sara',
      bodyParams: [leadName]
    });
  }

  /**
   * Envía template de confirmación de cita
   */
  async sendAppointmentConfirmation(
    to: string,
    leadName: string,
    date: string,
    time: string,
    property: string
  ): Promise<TemplateMessageResult> {
    return this.sendTemplate({
      to,
      templateName: 'confirmacion_cita',
      bodyParams: [leadName, date, time, property]
    });
  }

  /**
   * Envía template de recordatorio de cita
   */
  async sendAppointmentReminder(
    to: string,
    leadName: string,
    date: string,
    time: string
  ): Promise<TemplateMessageResult> {
    return this.sendTemplate({
      to,
      templateName: 'recordatorio_cita',
      bodyParams: [leadName, date, time]
    });
  }

  /**
   * Envía template de seguimiento
   */
  async sendFollowUp(to: string, leadName: string, property: string): Promise<TemplateMessageResult> {
    return this.sendTemplate({
      to,
      templateName: 'seguimiento_general',
      bodyParams: [leadName, property]
    });
  }

  /**
   * Envía template promocional
   */
  async sendPromotion(
    to: string,
    leadName: string,
    promoText: string,
    imageUrl?: string
  ): Promise<TemplateMessageResult> {
    return this.sendTemplate({
      to,
      templateName: 'promocion_general',
      bodyParams: [leadName, promoText],
      headerMediaUrl: imageUrl,
      headerMediaType: 'image'
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ESTADÍSTICAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene estadísticas de uso de templates
   */
  async getUsageStats(): Promise<{
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    mostUsed: Array<{ name: string; count: number }>;
  }> {
    const templates = await this.getTemplates();

    const stats = {
      total: templates.length,
      approved: templates.filter(t => t.status === 'APPROVED').length,
      pending: templates.filter(t => t.status === 'PENDING').length,
      rejected: templates.filter(t => t.status === 'REJECTED').length,
      mostUsed: templates
        .filter(t => t.usageCount && t.usageCount > 0)
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 10)
        .map(t => ({ name: t.name, count: t.usageCount || 0 }))
    };

    return stats;
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createWhatsAppTemplates(
  kv?: KVNamespace,
  phoneNumberId?: string,
  accessToken?: string
): WhatsAppTemplatesService {
  return new WhatsAppTemplatesService(kv, phoneNumberId, accessToken);
}
