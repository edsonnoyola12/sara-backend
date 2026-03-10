// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp Gateway — SINGLE point of control for ALL outgoing messages
// Instead of 533 direct calls to meta.sendWhatsAppMessage() across 15 files,
// everything goes through here. Enforces 24h window, carousel mutex, etc.
// ═══════════════════════════════════════════════════════════════════════════

import { MetaWhatsAppService } from './meta-whatsapp';
import { isDevelopment, resolveToDevelopment, extractDevelopmentsFromText } from '../constants/developments';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface GatewayResult {
  success: boolean;
  /** True if the message was actually sent via Meta API */
  sent: boolean;
  /** True if blocked by 24h window (stored as pending instead) */
  windowClosed?: boolean;
  /** True if blocked by carousel mutex */
  carouselMutex?: boolean;
  /** The pending message body if window was closed */
  pendingMessage?: string;
  /** Raw Meta API response when sent */
  response?: any;
  /** Reason if blocked */
  reason?: string;
}

/**
 * Function that checks if a lead's 24h window is open.
 * Returns true if the window is open (last message < 24h ago).
 * Returns null if the phone doesn't belong to a lead (e.g., team member).
 */
export type LeadWindowChecker = (phone: string) => Promise<boolean | null>;

/**
 * Function that stores a pending message for a lead whose window is closed.
 */
export type PendingMessageStore = (phone: string, message: string, messageType: string) => Promise<void>;

// ═══════════════════════════════════════════════════════════════════════════
// Gateway Class
// ═══════════════════════════════════════════════════════════════════════════

export class WhatsAppGateway {
  private meta: MetaWhatsAppService;
  private checkLeadWindow: LeadWindowChecker | null = null;
  private storePending: PendingMessageStore | null = null;

  /** Tracks which developments have had resources/carousel sent per phone in this request lifecycle */
  private resourcesSentFor: Map<string, Set<string>> = new Map();

  constructor(meta: MetaWhatsAppService) {
    this.meta = meta;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────

  setLeadWindowChecker(fn: LeadWindowChecker): void {
    this.checkLeadWindow = fn;
  }

  setPendingMessageStore(fn: PendingMessageStore): void {
    this.storePending = fn;
  }

  /** Clear per-request carousel mutex state (call at start of each request) */
  clearResourceTracking(): void {
    this.resourcesSentFor.clear();
  }

  /** Mark a development as having resources sent for a phone */
  markResourcesSent(phone: string, development: string): void {
    const normalized = this.normalizePhone(phone);
    if (!this.resourcesSentFor.has(normalized)) {
      this.resourcesSentFor.set(normalized, new Set());
    }
    this.resourcesSentFor.get(normalized)!.add(development);
  }

  /** Check if resources/carousel already sent for this development+phone */
  hasResourcesSentFor(phone: string, development: string): boolean {
    const normalized = this.normalizePhone(phone);
    return this.resourcesSentFor.get(normalized)?.has(development) ?? false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core: 24h Window Check
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Checks if we can send a free-form message to this phone.
   * Returns true if:
   *   - No window checker configured (fail-open)
   *   - Phone is a team member (checker returns null)
   *   - Lead's 24h window is open (checker returns true)
   */
  private async canSendFreeForm(phone: string): Promise<boolean> {
    if (!this.checkLeadWindow) return true;
    const result = await this.checkLeadWindow(phone);
    // null = not a lead (team member), true = window open
    return result === null || result === true;
  }

  /**
   * Handle a blocked message: store as pending if store is configured.
   */
  private async handleWindowClosed(phone: string, messageBody: string, messageType: string): Promise<GatewayResult> {
    console.log(`[Gateway] BLOCKED (24h window closed) → ${phone} | type=${messageType} | body=${messageBody?.substring(0, 80)}...`);
    if (this.storePending) {
      await this.storePending(phone, messageBody, messageType);
    }
    return {
      success: false,
      sent: false,
      windowClosed: true,
      pendingMessage: messageBody,
      reason: '24h window closed — stored as pending',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pass-through methods (no 24h check needed)
  // ─────────────────────────────────────────────────────────────────────────

  async markAsRead(messageId: string): Promise<any> {
    return this.meta.markAsRead(messageId);
  }

  async sendReaction(to: string, messageId: string, emoji: string): Promise<any> {
    console.log(`[Gateway] sendReaction → ${to} | emoji=${emoji}`);
    return this.meta.sendReaction(to, messageId, emoji);
  }

  async sendTemplate(to: string, templateName: string, languageCode: string = 'es', components?: any[], bypassRateLimit: boolean = false): Promise<any> {
    console.log(`[Gateway] sendTemplate → ${to} | template=${templateName}`);
    const response = await this.meta.sendTemplate(to, templateName, languageCode, components, bypassRateLimit);
    return response;
  }

  async sendCarouselTemplate(
    to: string,
    templateName: string,
    bodyParams: string[],
    cards: Array<{
      imageUrl: string;
      bodyParams: string[];
      quickReplyPayload: string;
      quickReplyPayload2?: string;
    }>,
    languageCode: string = 'es_MX'
  ): Promise<GatewayResult> {
    // Carousel mutex: check if we already sent resources for any development in this carousel
    const development = resolveToDevelopment(templateName) || templateName;
    if (this.hasResourcesSentFor(to, development)) {
      console.log(`[Gateway] SKIP carousel (mutex) → ${to} | development=${development}`);
      return {
        success: false,
        sent: false,
        carouselMutex: true,
        reason: `Carousel mutex: resources already sent for ${development}`,
      };
    }

    console.log(`[Gateway] sendCarouselTemplate → ${to} | template=${templateName} | cards=${cards.length}`);
    const response = await this.meta.sendCarouselTemplate(to, templateName, bodyParams, cards, languageCode);
    this.markResourcesSent(to, development);
    return { success: true, sent: true, response };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Window-checked methods (check 24h before sending)
  // ─────────────────────────────────────────────────────────────────────────

  async sendWhatsAppMessage(to: string, body: string, bypassRateLimit?: boolean): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, body, 'text');
    }
    console.log(`[Gateway] sendWhatsAppMessage → ${to} | body=${body?.substring(0, 80)}...`);
    const response = await this.meta.sendWhatsAppMessage(to, body, bypassRateLimit);
    return { success: true, sent: true, response };
  }

  async sendWhatsAppImage(to: string, imageUrl: string, caption?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, caption || `[imagen: ${imageUrl}]`, 'image');
    }
    console.log(`[Gateway] sendWhatsAppImage → ${to} | caption=${caption?.substring(0, 60)}`);
    const response = await this.meta.sendWhatsAppImage(to, imageUrl, caption);
    return { success: true, sent: true, response };
  }

  async sendWhatsAppVideo(to: string, videoUrl: string, caption?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, caption || `[video: ${videoUrl}]`, 'video');
    }
    console.log(`[Gateway] sendWhatsAppVideo → ${to} | caption=${caption?.substring(0, 60)}`);
    const response = await this.meta.sendWhatsAppVideo(to, videoUrl, caption);
    return { success: true, sent: true, response };
  }

  async sendWhatsAppDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, caption || `[documento: ${filename}]`, 'document');
    }
    console.log(`[Gateway] sendWhatsAppDocument → ${to} | filename=${filename}`);
    const response = await this.meta.sendWhatsAppDocument(to, documentUrl, filename, caption);
    return { success: true, sent: true, response };
  }

  async sendWhatsAppAudio(to: string, audioUrl: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, `[audio: ${audioUrl}]`, 'audio');
    }
    console.log(`[Gateway] sendWhatsAppAudio → ${to}`);
    const response = await this.meta.sendWhatsAppAudio(to, audioUrl);
    return { success: true, sent: true, response };
  }

  async sendVoiceMessage(to: string, audioBuffer: ArrayBuffer, mimeType: string = 'audio/ogg'): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, '[voice message]', 'voice');
    }
    console.log(`[Gateway] sendVoiceMessage → ${to} | mimeType=${mimeType}`);
    const response = await this.meta.sendVoiceMessage(to, audioBuffer, mimeType);
    return { success: true, sent: true, response };
  }

  async sendCTAButton(to: string, bodyText: string, buttonText: string, url: string, headerText?: string, footerText?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, bodyText, 'cta_button');
    }
    console.log(`[Gateway] sendCTAButton → ${to} | button=${buttonText} | url=${url}`);
    const response = await this.meta.sendCTAButton(to, bodyText, buttonText, url, headerText, footerText);
    return { success: true, sent: true, response };
  }

  async sendQuickReplyButtons(to: string, bodyText: string, buttons: Array<{id: string; title: string}>, headerText?: string, footerText?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, bodyText, 'quick_reply');
    }
    console.log(`[Gateway] sendQuickReplyButtons → ${to} | buttons=${buttons.length}`);
    const response = await this.meta.sendQuickReplyButtons(to, bodyText, buttons, headerText, footerText);
    return { success: true, sent: true, response };
  }

  async sendImageWithButtons(to: string, imageUrl: string, bodyText: string, buttons: Array<{id: string; title: string}>, footerText?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, bodyText, 'image_buttons');
    }
    console.log(`[Gateway] sendImageWithButtons → ${to} | buttons=${buttons.length}`);
    const response = await this.meta.sendImageWithButtons(to, imageUrl, bodyText, buttons, footerText);
    return { success: true, sent: true, response };
  }

  async sendListMenu(to: string, bodyText: string, buttonText: string, sections: any[], headerText?: string, footerText?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, bodyText, 'list_menu');
    }
    console.log(`[Gateway] sendListMenu → ${to} | sections=${sections.length}`);
    const response = await this.meta.sendListMenu(to, bodyText, buttonText, sections, headerText, footerText);
    return { success: true, sent: true, response };
  }

  async sendWhatsAppLocation(to: string, latitude: number, longitude: number, name?: string, address?: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, `[ubicación: ${name || `${latitude},${longitude}`}]`, 'location');
    }
    console.log(`[Gateway] sendWhatsAppLocation → ${to} | name=${name}`);
    const response = await this.meta.sendWhatsAppLocation(to, latitude, longitude, name, address);
    return { success: true, sent: true, response };
  }

  async sendContactCard(to: string, contact: any): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, `[contacto: ${contact?.name || 'unknown'}]`, 'contact_card');
    }
    console.log(`[Gateway] sendContactCard → ${to} | contact=${contact?.name}`);
    const response = await this.meta.sendContactCard(to, contact);
    return { success: true, sent: true, response };
  }

  async sendLocationRequest(to: string, bodyText: string): Promise<GatewayResult> {
    if (!await this.canSendFreeForm(to)) {
      return this.handleWindowClosed(to, bodyText, 'location_request');
    }
    console.log(`[Gateway] sendLocationRequest → ${to}`);
    const response = await this.meta.sendLocationRequest(to, bodyText);
    return { success: true, sent: true, response };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────

  /** Access the underlying MetaWhatsAppService for edge cases during migration */
  get raw(): MetaWhatsAppService {
    return this.meta;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10);
  }
}
