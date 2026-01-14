// Meta WhatsApp Cloud API Service

// ═══════════════════════════════════════════════════════════════════════════
// 🚨 RATE LIMITING Y CIRCUIT BREAKER - Protección contra spam
// ═══════════════════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  firstMessageAt: number;
  lastMessageAt: number;
  blocked: boolean;
  blockReason?: string;
}

// Almacenamiento en memoria para rate limiting (se reinicia con deploy)
const messageRateLimit: Map<string, RateLimitEntry> = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MAX_MESSAGES_PER_HOUR = 15; // Máximo 15 mensajes por hora por teléfono
const MAX_MESSAGES_PER_MINUTE = 5; // Máximo 5 mensajes por minuto
const CIRCUIT_BREAKER_THRESHOLD = 50; // Si hay 50+ envíos en 5 min, parar todo
let globalMessageCount = 0;
let globalMessageWindowStart = Date.now();

// Frases que indican que NO quieren ser contactados
const DNC_PHRASES = [
  'no me molest', 'deja de molestar', 'ya basta', 'stop', 'basta ya',
  'no quiero', 'dejen de', 'ya no me', 'no me escribas', 'no me mandes',
  'no contactar', 'unsubscribe', 'cancelar', 'eliminar mi número',
  'bloquear', 'reportar', 'acoso', 'spam'
];

// Admin para alertas críticas
const ADMIN_PHONE = '5212224558475'; // Tu número

// Función para corregir double-encoding UTF-8 (acentos Y emojis)
function sanitizeUTF8(text: string): string {
  if (!text) return text;
  try {
    // Detectar double-encoding: Ã para acentos, ð para emojis
    if (text.includes("Ã") || text.includes("Â") || text.includes("ð") || text.includes("Å")) {
      // Decodificar: interpretar bytes como Latin-1, luego como UTF-8
      const bytes = new Uint8Array([...text].map(c => c.charCodeAt(0) & 0xFF));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      // Si la decodificación produjo algo válido, usarla
      if (decoded && decoded.length > 0) {
        return decoded;
      }
    }
    return text;
  } catch (e) {
    console.log("⚠️ sanitizeUTF8 fallback");
    return text;
  }
}

// Verificar si el mensaje indica que no quieren ser contactados
export function detectDNCPhrase(message: string): boolean {
  const msgLower = message.toLowerCase();
  return DNC_PHRASES.some(phrase => msgLower.includes(phrase));
}

// Limpiar entradas viejas del rate limit
function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [phone, entry] of messageRateLimit.entries()) {
    if (now - entry.lastMessageAt > RATE_LIMIT_WINDOW_MS) {
      messageRateLimit.delete(phone);
    }
  }
}

export class MetaWhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion = 'v22.0';

  constructor(phoneNumberId: string, accessToken: string) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
  }

  private normalizePhone(phone: string): string {
    let clean = phone.replace('whatsapp:', '').replace(/\s/g, '');
    if (clean.startsWith('+')) {
      clean = clean.substring(1);
    }
    if (clean.startsWith('52') && clean.length === 12) {
      clean = '521' + clean.substring(2);
    }
    return clean;
  }

  async sendWhatsAppMessage(to: string, body: string, bypassRateLimit = false): Promise<any> {
    const phone = this.normalizePhone(to);

    // ═══════════════════════════════════════════════════════════════════════
    // 🚨 CIRCUIT BREAKER GLOBAL - Detener si hay demasiados envíos
    // ═══════════════════════════════════════════════════════════════════════
    const now = Date.now();
    if (now - globalMessageWindowStart > 5 * 60 * 1000) {
      // Resetear ventana cada 5 minutos
      globalMessageCount = 0;
      globalMessageWindowStart = now;
    }
    globalMessageCount++;

    if (globalMessageCount > CIRCUIT_BREAKER_THRESHOLD && !bypassRateLimit) {
      console.error(`🚨 CIRCUIT BREAKER ACTIVADO: ${globalMessageCount} mensajes en 5 min - DETENIENDO ENVÍOS`);
      // Alertar admin (solo una vez)
      if (globalMessageCount === CIRCUIT_BREAKER_THRESHOLD + 1) {
        await this.sendAlertToAdmin(`🚨 ALERTA CRÍTICA: Circuit breaker activado. ${globalMessageCount} mensajes en 5 min. Revisa el sistema.`);
      }
      throw new Error('CIRCUIT_BREAKER: Demasiados mensajes enviados. Sistema pausado.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🚦 RATE LIMITING POR TELÉFONO
    // ═══════════════════════════════════════════════════════════════════════
    if (!bypassRateLimit) {
      cleanupRateLimits();

      const entry = messageRateLimit.get(phone) || {
        count: 0,
        firstMessageAt: now,
        lastMessageAt: now,
        blocked: false
      };

      // Verificar si está bloqueado
      if (entry.blocked) {
        console.error(`🚫 RATE LIMIT: ${phone} está bloqueado - ${entry.blockReason}`);
        throw new Error(`RATE_LIMIT: Número bloqueado - ${entry.blockReason}`);
      }

      // Verificar límite por hora
      const hourAgo = now - RATE_LIMIT_WINDOW_MS;
      if (entry.firstMessageAt > hourAgo && entry.count >= MAX_MESSAGES_PER_HOUR) {
        console.error(`🚫 RATE LIMIT: ${phone} excedió ${MAX_MESSAGES_PER_HOUR} msgs/hora`);
        entry.blocked = true;
        entry.blockReason = 'Excedió límite de mensajes por hora';
        messageRateLimit.set(phone, entry);
        await this.sendAlertToAdmin(`⚠️ Rate limit: ${phone} bloqueado por exceder ${MAX_MESSAGES_PER_HOUR} msgs/hora`);
        throw new Error('RATE_LIMIT: Demasiados mensajes a este número');
      }

      // Verificar límite por minuto (anti-spam rápido)
      const minuteAgo = now - 60 * 1000;
      if (entry.lastMessageAt > minuteAgo && entry.count >= MAX_MESSAGES_PER_MINUTE) {
        console.warn(`⚠️ RATE LIMIT: ${phone} - ${MAX_MESSAGES_PER_MINUTE} msgs en 1 min, esperando...`);
        throw new Error('RATE_LIMIT: Demasiados mensajes en poco tiempo');
      }

      // Actualizar contador
      if (entry.firstMessageAt < hourAgo) {
        // Reiniciar conteo si pasó la hora
        entry.count = 1;
        entry.firstMessageAt = now;
      } else {
        entry.count++;
      }
      entry.lastMessageAt = now;
      messageRateLimit.set(phone, entry);

      console.log(`📊 Rate limit ${phone}: ${entry.count}/${MAX_MESSAGES_PER_HOUR} msgs/hora`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📤 ENVIAR MENSAJE
    // ═══════════════════════════════════════════════════════════════════════
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    // Sanitizar UTF-8 antes de enviar
    const cleanBody = sanitizeUTF8(body);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: true, body: cleanBody }
    };

    console.log(`📤 Meta WA enviando a ${phone}: ${cleanBody.substring(0, 50)}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ Meta WA error:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando mensaje');
    }
    console.log(`✅ Meta WA enviado: ${data.messages?.[0]?.id}`);
    return data;
  }

  // Enviar alerta crítica al admin
  private async sendAlertToAdmin(message: string): Promise<void> {
    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: ADMIN_PHONE,
        type: 'text',
        text: { body: message }
      };
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log(`🚨 Alerta enviada a admin: ${message.substring(0, 50)}...`);
    } catch (e) {
      console.error('❌ Error enviando alerta a admin:', e);
    }
  }

  // Marcar un teléfono como bloqueado (DNC)
  markAsBlocked(phone: string, reason: string): void {
    const normalizedPhone = this.normalizePhone(phone);
    const entry = messageRateLimit.get(normalizedPhone) || {
      count: 0,
      firstMessageAt: Date.now(),
      lastMessageAt: Date.now(),
      blocked: false
    };
    entry.blocked = true;
    entry.blockReason = reason;
    messageRateLimit.set(normalizedPhone, entry);
    console.log(`🚫 Teléfono ${normalizedPhone} bloqueado: ${reason}`);
  }

  // Obtener estadísticas de rate limiting
  getRateLimitStats(): { totalTracked: number; blocked: number; globalCount: number } {
    let blocked = 0;
    for (const entry of messageRateLimit.values()) {
      if (entry.blocked) blocked++;
    }
    return {
      totalTracked: messageRateLimit.size,
      blocked,
      globalCount: globalMessageCount
    };
  }

  async sendWhatsAppImage(to: string, imageUrl: string, caption?: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'image',
      image: { link: imageUrl }
    };
    if (caption) payload.image.caption = sanitizeUTF8(caption);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  async sendWhatsAppVideo(to: string, videoUrl: string, caption?: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'video',
      video: { link: videoUrl }
    };
    if (caption) payload.video.caption = sanitizeUTF8(caption);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  async sendWhatsAppVideoById(to: string, mediaId: string, caption?: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'video',
      video: { id: mediaId }
    };
    if (caption) payload.video.caption = sanitizeUTF8(caption);

    console.log(`📤 Enviando video por media_id ${mediaId} a ${phone}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ Error enviando video:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando video');
    }
    console.log(`✅ Video enviado: ${data.messages?.[0]?.id}`);
    return data;
  }

  async uploadVideoFromBuffer(videoBuffer: ArrayBuffer): Promise<string> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/media`;
    
    const blob = new Blob([videoBuffer], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'video/mp4');
    formData.append('file', blob, 'video.mp4');

    console.log(`📤 Subiendo video a Meta (${videoBuffer.byteLength} bytes)...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ Error subiendo video:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error subiendo video');
    }
    console.log(`✅ Video subido a Meta: ${data.id}`);
    return data.id;
  }

  async sendWhatsAppDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'document',
      document: { link: documentUrl, filename: filename }
    };
    if (caption) payload.document.caption = sanitizeUTF8(caption);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  async sendWhatsAppLocation(to: string, latitude: number, longitude: number, name?: string, address?: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'location',
      location: { latitude, longitude, name: name || '', address: address || '' }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  async markAsRead(messageId: string): Promise<any> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      })
    });
    return response.json();
  }

  // Enviar template de WhatsApp (para iniciar conversaciones fuera de la ventana de 24h)
  async sendTemplate(to: string, templateName: string, languageCode: string = 'es', components?: any[]): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode }
      }
    };

    // Agregar components si existen (para variables del template)
    if (components && components.length > 0) {
      payload.template.components = components;
    }

    console.log(`📤 Enviando template "${templateName}" a ${phone}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ Error enviando template:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando template');
    }
    console.log(`✅ Template enviado: ${data.messages?.[0]?.id}`);
    return data;
  }
}
