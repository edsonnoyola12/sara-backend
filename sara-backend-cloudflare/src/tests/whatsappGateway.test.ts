// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP GATEWAY TESTS — Single send point enforcement
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppGateway } from '../services/whatsappGateway';

// Mock MetaWhatsAppService
function createMockMeta() {
  return {
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendWhatsAppImage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendWhatsAppVideo: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendWhatsAppDocument: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendWhatsAppAudio: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendTemplate: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendCarouselTemplate: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendCTAButton: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendQuickReplyButtons: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendReaction: vi.fn().mockResolvedValue({}),
    markAsRead: vi.fn().mockResolvedValue({}),
    sendVoiceMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendImageWithButtons: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendListMenu: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendWhatsAppLocation: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendContactCard: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    sendLocationRequest: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
  };
}

describe('WhatsAppGateway', () => {
  let meta: ReturnType<typeof createMockMeta>;
  let gw: WhatsAppGateway;

  beforeEach(() => {
    meta = createMockMeta();
    gw = new WhatsAppGateway(meta as any);
  });

  // ═══════════════════════════════════════════════════════════════
  // 24H WINDOW ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════
  describe('24h Window Enforcement', () => {
    it('should send message when no window checker configured (fail-open)', async () => {
      const result = await gw.sendWhatsAppMessage('5215610016226', 'Hola!');
      expect(result.sent).toBe(true);
      expect(meta.sendWhatsAppMessage).toHaveBeenCalledOnce();
    });

    it('should BLOCK message when 24h window is closed', async () => {
      gw.setLeadWindowChecker(async () => false); // window closed
      const result = await gw.sendWhatsAppMessage('5215610016226', 'Hola!');
      expect(result.sent).toBe(false);
      expect(result.windowClosed).toBe(true);
      expect(meta.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('should ALLOW message when 24h window is open', async () => {
      gw.setLeadWindowChecker(async () => true); // window open
      const result = await gw.sendWhatsAppMessage('5215610016226', 'Hola!');
      expect(result.sent).toBe(true);
      expect(meta.sendWhatsAppMessage).toHaveBeenCalledOnce();
    });

    it('should ALLOW message for team members (checker returns null)', async () => {
      gw.setLeadWindowChecker(async () => null); // not a lead
      const result = await gw.sendWhatsAppMessage('5215610016226', 'Hola!');
      expect(result.sent).toBe(true);
    });

    it('should store pending message when window closed and store configured', async () => {
      const storeFn = vi.fn().mockResolvedValue(undefined);
      gw.setLeadWindowChecker(async () => false);
      gw.setPendingMessageStore(storeFn);

      await gw.sendWhatsAppMessage('5215610016226', 'Mensaje pendiente');
      expect(storeFn).toHaveBeenCalledWith('5215610016226', 'Mensaje pendiente', 'text');
    });

    it('should block images when window is closed', async () => {
      gw.setLeadWindowChecker(async () => false);
      const result = await gw.sendWhatsAppImage('5215610016226', 'https://example.com/img.jpg', 'Foto');
      expect(result.sent).toBe(false);
      expect(meta.sendWhatsAppImage).not.toHaveBeenCalled();
    });

    it('should block videos when window is closed', async () => {
      gw.setLeadWindowChecker(async () => false);
      const result = await gw.sendWhatsAppVideo('5215610016226', 'https://example.com/vid.mp4', 'Video');
      expect(result.sent).toBe(false);
    });

    it('should block documents when window is closed', async () => {
      gw.setLeadWindowChecker(async () => false);
      const result = await gw.sendWhatsAppDocument('5215610016226', 'https://example.com/doc.pdf', 'brochure.pdf');
      expect(result.sent).toBe(false);
    });

    it('should block CTA buttons when window is closed', async () => {
      gw.setLeadWindowChecker(async () => false);
      const result = await gw.sendCTAButton('5215610016226', 'Ver ubicación', 'GPS', 'https://maps.google.com');
      expect(result.sent).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATES (bypass 24h window)
  // ═══════════════════════════════════════════════════════════════
  describe('Templates (bypass window)', () => {
    it('should ALWAYS send templates regardless of window', async () => {
      gw.setLeadWindowChecker(async () => false); // window closed
      await gw.sendTemplate('5215610016226', 'briefing_matutino', 'es_MX', []);
      expect(meta.sendTemplate).toHaveBeenCalledOnce();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CAROUSEL MUTEX
  // ═══════════════════════════════════════════════════════════════
  describe('Carousel Mutex', () => {
    it('should send carousel when no resources sent for the development', async () => {
      const result = await gw.sendCarouselTemplate(
        '5215610016226', 'casas_premium', ['Juan'], [
          { imageUrl: 'https://img.com/1.jpg', bodyParams: ['Falco'], quickReplyPayload: 'falco' }
        ]
      );
      expect(result.sent).toBe(true);
      expect(meta.sendCarouselTemplate).toHaveBeenCalledOnce();
    });

    it('should BLOCK carousel when resources already sent for same development', async () => {
      gw.markResourcesSent('5215610016226', 'casas_premium');
      const result = await gw.sendCarouselTemplate(
        '5215610016226', 'casas_premium', ['Juan'], [
          { imageUrl: 'https://img.com/1.jpg', bodyParams: ['Falco'], quickReplyPayload: 'falco' }
        ]
      );
      expect(result.sent).toBe(false);
      expect(result.carouselMutex).toBe(true);
      expect(meta.sendCarouselTemplate).not.toHaveBeenCalled();
    });

    it('should track resources per phone independently', async () => {
      gw.markResourcesSent('5215610016226', 'casas_premium');
      // Different phone should NOT be blocked
      const result = await gw.sendCarouselTemplate(
        '5212224558475', 'casas_premium', ['Oscar'], [
          { imageUrl: 'https://img.com/1.jpg', bodyParams: ['Falco'], quickReplyPayload: 'falco' }
        ]
      );
      expect(result.sent).toBe(true);
    });

    it('should clear resource tracking between requests', async () => {
      gw.markResourcesSent('5215610016226', 'casas_premium');
      gw.clearResourceTracking();
      const result = await gw.sendCarouselTemplate(
        '5215610016226', 'casas_premium', ['Juan'], [
          { imageUrl: 'https://img.com/1.jpg', bodyParams: ['Falco'], quickReplyPayload: 'falco' }
        ]
      );
      expect(result.sent).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RAW ACCESS (for migration)
  // ═══════════════════════════════════════════════════════════════
  describe('Raw access', () => {
    it('should expose underlying MetaWhatsAppService', () => {
      expect(gw.raw).toBe(meta);
    });
  });
});
