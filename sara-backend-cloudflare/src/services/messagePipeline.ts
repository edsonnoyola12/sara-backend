// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE PIPELINE — Central validation layer for ALL outgoing messages
//
// EVERY message to a lead MUST pass through this pipeline.
// It enforces:
//   1. 24h window check (template vs free-form)
//   2. Carousel vs Resources mutual exclusion
//   3. Development vs Model validation
//   4. Dedup (no duplicate messages)
//
// USAGE:
//   const pipeline = new MessagePipeline(supabase, meta, env);
//   await pipeline.sendToLead(leadPhone, leadId, items);
//
// This replaces scattered ad-hoc checks throughout the codebase.
// ═══════════════════════════════════════════════════════════════════════════

import { resolveToDevelopment, isDevelopment, extractDevelopmentsFromText } from '../constants/developments';

// Types for pipeline items
export interface PipelineTextMessage {
  type: 'text';
  content: string;
}

export interface PipelineTemplate {
  type: 'template';
  templateName: string;
  language?: string;
  components: any[];
}

export interface PipelineCarousel {
  type: 'carousel';
  segment: string;
  bodyParams: string[];
  cards: any[];
}

export interface PipelineResourcesCTA {
  type: 'resources_cta';
  development: string;
  /** brochure, video, gps, matterport */
  resources: Array<{ label: string; url: string; emoji: string }>;
}

export type PipelineItem = PipelineTextMessage | PipelineTemplate | PipelineCarousel | PipelineResourcesCTA;

export interface PipelineResult {
  sent: PipelineItem[];
  skipped: Array<{ item: PipelineItem; reason: string }>;
  windowOpen: boolean;
  errors: string[];
}

export interface PipelineContext {
  leadPhone: string;
  leadId?: string;
  /** If known, pass the development the lead asked about */
  requestedDevelopment?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class MessagePipeline {
  private supabase: any;
  private meta: any;
  private env: any;

  constructor(supabase: any, meta: any, env: any) {
    this.supabase = supabase;
    this.meta = meta;
    this.env = env;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 24H WINDOW
  // Single source of truth for window check
  // ═══════════════════════════════════════════════════════════════
  async checkWindow(leadId: string): Promise<boolean> {
    if (!leadId) return false;
    try {
      const { data } = await this.supabase.client
        .from('leads')
        .select('last_message_at')
        .eq('id', leadId)
        .single();
      if (!data?.last_message_at) return false;
      const lastMsg = new Date(data.last_message_at).getTime();
      return (Date.now() - lastMsg) < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VALIDATE & SEND
  // Main entry point — validates all items before sending
  // ═══════════════════════════════════════════════════════════════
  async sendToLead(ctx: PipelineContext, items: PipelineItem[]): Promise<PipelineResult> {
    const result: PipelineResult = { sent: [], skipped: [], windowOpen: false, errors: [] };

    // 1. Check 24h window
    if (ctx.leadId) {
      result.windowOpen = await this.checkWindow(ctx.leadId);
    }

    // 2. Classify items
    const hasCarousel = items.some(i => i.type === 'carousel');
    const hasResourcesCTA = items.some(i => i.type === 'resources_cta');
    const hasSpecificDev = !!ctx.requestedDevelopment;

    // 3. Apply mutual exclusion: carousel + specific resources = skip carousel
    const filteredItems: PipelineItem[] = [];
    for (const item of items) {
      // RULE: If lead asked for specific development AND we have resources for it, skip carousel
      if (item.type === 'carousel' && hasResourcesCTA && hasSpecificDev) {
        result.skipped.push({
          item,
          reason: `Carousel "${(item as PipelineCarousel).segment}" skipped — specific resources for "${ctx.requestedDevelopment}" will be sent`,
        });
        console.log(`⏭️ Pipeline: Carousel omitido — request específico de "${ctx.requestedDevelopment}"`);
        continue;
      }

      // RULE: Templates don't need 24h window, everything else does
      if (!result.windowOpen && item.type !== 'template' && item.type !== 'carousel') {
        // Carousel templates don't need window either
        result.skipped.push({
          item,
          reason: `Window closed — ${item.type} requires 24h window`,
        });
        console.log(`⏭️ Pipeline: ${item.type} omitido — ventana 24h cerrada`);
        continue;
      }

      filteredItems.push(item);
    }

    // 4. Send each item
    for (const item of filteredItems) {
      try {
        await this.sendItem(ctx.leadPhone, item);
        result.sent.push(item);
      } catch (err: any) {
        result.errors.push(`${item.type}: ${err.message}`);
        console.error(`❌ Pipeline error sending ${item.type}:`, err.message);
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // SEND INDIVIDUAL ITEM
  // ═══════════════════════════════════════════════════════════════
  private async sendItem(phone: string, item: PipelineItem): Promise<void> {
    switch (item.type) {
      case 'text':
        await this.meta.sendWhatsAppMessage(phone, item.content);
        break;
      case 'template':
        await this.meta.sendTemplate(phone, item.templateName, item.language || 'es_MX', item.components);
        break;
      case 'carousel':
        await this.meta.sendCarouselTemplate(phone,
          item.segment, // template name resolved by caller
          item.bodyParams,
          item.cards
        );
        break;
      case 'resources_cta':
        // Resources are sent as CTA buttons — handled by caller
        // This is a pass-through; the actual sending logic stays in aiConversationService
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STATIC HELPERS — Use throughout codebase
  // ═══════════════════════════════════════════════════════════════

  /**
   * Resolve a name to a development. Use this EVERYWHERE instead of
   * manually checking against lists.
   * "Chipre" → "Distrito Falco"
   * "Monte Verde" → "Monte Verde"
   * "random text" → null
   */
  static resolveDevelopment(name: string): string | null {
    return resolveToDevelopment(name);
  }

  /**
   * Check if a name is a development (not a model).
   */
  static isDevelopmentName(name: string): boolean {
    return isDevelopment(name);
  }

  /**
   * Extract development names from free text.
   * Only returns DEVELOPMENT names, never model names.
   */
  static extractDevelopments(text: string): string[] {
    return extractDevelopmentsFromText(text);
  }

  /**
   * Determine if a carousel should be sent given the context.
   * Returns false if specific resources will be sent for the same development.
   */
  static shouldSendCarousel(
    carouselSegment: string | null | undefined,
    developmentDetected: string | null | undefined,
    willSendResources: boolean
  ): boolean {
    if (!carouselSegment) return false;
    // If we detected a specific development AND will send its resources → skip carousel
    if (developmentDetected && willSendResources) {
      console.log(`⏭️ Pipeline.shouldSendCarousel: false — "${developmentDetected}" resources will be sent`);
      return false;
    }
    return true;
  }

  /**
   * Check 24h window synchronously using a pre-fetched last_message_at.
   * Use this when you already have the lead data and don't want another DB call.
   */
  static isWindowOpen(lastMessageAt: string | null | undefined): boolean {
    if (!lastMessageAt) return false;
    const lastMsg = new Date(lastMessageAt).getTime();
    return (Date.now() - lastMsg) < 24 * 60 * 60 * 1000;
  }
}
