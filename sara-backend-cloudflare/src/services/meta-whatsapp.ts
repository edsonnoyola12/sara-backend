// Meta WhatsApp Cloud API Service

import { retry, RetryPresets, isRetryableError } from './retryService';

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
// NOTA: 'cancelar' removido porque causa falsos positivos con "cancelar mi cita"
const DNC_PHRASES = [
  'no me molest', 'deja de molestar', 'ya basta', 'stop', 'basta ya',
  'no quiero saber nada', 'dejen de escribirme', 'ya no me escriban', 'no me escribas más', 'no me mandes más',
  'no contactar', 'unsubscribe', 'eliminar mi número', 'elimina mi número',
  'bloquear', 'reportar spam', 'acoso', 'esto es spam', 'dejen de molestar'
];

// Admin para alertas críticas de sistema → Edson (owner)
const DEFAULT_ADMIN_PHONE = '5610016226';

// ═══════════════════════════════════════════════════════════════════════════
// 🧪 MODO PRUEBA - Solo envía a teléfonos autorizados
// ═══════════════════════════════════════════════════════════════════════════
const TEST_MODE = false; // ✅ PRODUCCIÓN - Envía a todos
const TEST_PHONES = [
  '5215610016226',  // Alejandro (asesor)
  '5212224558475',  // CEO Test (vendedor)
  '5610016226',     // Sin prefijo
  '2224558475',     // Sin prefijo
];

function isTestPhoneAllowed(phone: string): boolean {
  if (!TEST_MODE) return true; // Si no está en modo prueba, permitir todo
  const cleanPhone = phone.replace(/\D/g, '');
  const last10 = cleanPhone.slice(-10);
  return TEST_PHONES.some(tp => {
    const tpClean = tp.replace(/\D/g, '');
    const tpLast10 = tpClean.slice(-10);
    return tpLast10 === last10;
  });
}

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

// Tipo para callback de tracking
export type MessageTrackingCallback = (data: {
  messageId: string;
  recipientPhone: string;
  messageType: 'text' | 'audio' | 'image' | 'video' | 'document' | 'template' | 'buttons' | 'list';
  categoria?: string;
  contenido?: string;
}) => Promise<void>;

// Tipo para callback de mensajes fallidos (retry queue)
export type FailedMessageCallback = (data: {
  recipientPhone: string;
  messageType: string;
  payload: Record<string, any>;
  context: string;
  errorMessage: string;
}) => Promise<void>;

// Tipo para callback de rate limit (enqueue cuando se excede)
export type RateLimitEnqueueCallback = (data: {
  recipientPhone: string;
  messageType: string;
  payload: Record<string, any>;
  context: string;
}) => Promise<void>;

export class MetaWhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion = 'v22.0';
  private trackingCallback?: MessageTrackingCallback;
  private failedMessageCallback?: FailedMessageCallback;
  private rateLimitEnqueueCallback?: RateLimitEnqueueCallback;
  private kvNamespace?: KVNamespace;
  private adminPhone: string = DEFAULT_ADMIN_PHONE;

  // Meta Business API global rate limit: ~80 msgs/min (basic tier)
  // We cap at 75 to leave headroom
  static readonly GLOBAL_RATE_LIMIT = 75;

  constructor(phoneNumberId: string, accessToken: string) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
  }

  setAdminPhone(phone: string): void {
    this.adminPhone = phone;
  }

  /**
   * Configura el KV namespace para rate limiting global
   */
  setKVNamespace(kv: KVNamespace): void {
    this.kvNamespace = kv;
  }

  /**
   * Configura el callback para encolar mensajes cuando se excede el rate limit
   */
  setRateLimitEnqueueCallback(callback: RateLimitEnqueueCallback): void {
    this.rateLimitEnqueueCallback = callback;
  }

  /**
   * Verifica y actualiza el rate limit global usando KV.
   * Retorna true si se puede enviar, false si se debe encolar.
   */
  private async checkGlobalRateLimit(): Promise<boolean> {
    if (!this.kvNamespace) return true; // Sin KV, no limitar

    try {
      const minuteKey = `meta_rate:${Math.floor(Date.now() / 60000)}`;
      const currentStr = await this.kvNamespace.get(minuteKey);
      const current = currentStr ? parseInt(currentStr, 10) : 0;

      if (current >= MetaWhatsAppService.GLOBAL_RATE_LIMIT) {
        console.warn(`🚦 Meta rate limit alcanzado: ${current}/${MetaWhatsAppService.GLOBAL_RATE_LIMIT} en este minuto`);
        return false;
      }

      // Incrementar contador (TTL 120s para cubrir el minuto + margen)
      await this.kvNamespace.put(minuteKey, String(current + 1), { expirationTtl: 120 });
      return true;
    } catch (err) {
      // Si KV falla, permitir envío (fail-open)
      console.warn('⚠️ KV rate limit check failed, allowing send:', (err as Error).message);
      return true;
    }
  }

  /**
   * Configura el callback para tracking de mensajes
   * Llamar después de crear el servicio para habilitar tracking
   */
  setTrackingCallback(callback: MessageTrackingCallback): void {
    this.trackingCallback = callback;
  }

  setFailedMessageCallback(callback: FailedMessageCallback): void {
    this.failedMessageCallback = callback;
  }

  /**
   * Disables all callbacks (tracking, failed, rate limit).
   * Useful for test endpoints to reduce subrequest count.
   */
  disableCallbacks(): void {
    this.trackingCallback = undefined;
    this.failedMessageCallback = undefined;
    this.rateLimitEnqueueCallback = undefined;
  }

  /**
   * Llama al callback de tracking si está configurado
   */
  private async track(data: Parameters<MessageTrackingCallback>[0]): Promise<void> {
    if (this.trackingCallback) {
      try {
        await this.trackingCallback(data);
      } catch (e) {
        // No crítico - solo log
        console.log(`📊 Tracking error: ${(e as Error).message}`);
      }
    }
  }

  private normalizePhone(phone: string): string {
    let clean = phone.replace('whatsapp:', '').replace(/\s/g, '');
    if (clean.startsWith('+')) {
      clean = clean.substring(1);
    }
    // 10 dígitos mexicanos → agregar 521 (código país + móvil)
    if (clean.length === 10 && !clean.startsWith('52')) {
      clean = '521' + clean;
    }
    // 12 dígitos (52 + 10) → insertar 1 para móvil (521 + 10)
    if (clean.startsWith('52') && clean.length === 12) {
      clean = '521' + clean.substring(2);
    }
    return clean;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔄 FETCH CON RETRY - Reintentos automáticos para fallos de red
  // ═══════════════════════════════════════════════════════════════════════════
  private async fetchWithRetry(url: string, options: RequestInit, context: string): Promise<Response> {
    return retry(
      async () => {
        const response = await fetch(url, options);

        // Si es error 5xx o 429, lanzar para reintentar
        if (response.status >= 500 || response.status === 429) {
          const error = new Error(`Meta API Error: ${response.status} ${response.statusText}`);
          (error as any).status = response.status;
          throw error;
        }

        return response;
      },
      {
        ...RetryPresets.meta,
        onRetry: (error, attempt, delayMs) => {
          console.warn(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: `Meta API retry ${attempt}/3`,
            context,
            error: error?.message,
            status: error?.status,
            delayMs,
          }));
        }
      }
    );
  }

  /**
   * Wrapper: fetchWithRetry + failedMessageCallback para retry queue.
   * Usar en TODOS los métodos de envío de mensajes.
   */
  private async _fetchWithCallback(
    url: string,
    options: RequestInit,
    context: string,
    callbackInfo: { recipientPhone: string; messageType: string; payload: any }
  ): Promise<Response> {
    try {
      return await this.fetchWithRetry(url, options, context);
    } catch (retryError: any) {
      if (this.failedMessageCallback) {
        try {
          await this.failedMessageCallback({
            ...callbackInfo,
            context,
            errorMessage: retryError?.message || String(retryError)
          });
        } catch (_) { /* silent */ }
      }
      throw retryError;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📤 ENVIAR MENSAJE DE WHATSAPP
  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORTANTE: bypassRateLimit = true por DEFAULT para conversaciones normales
  // Solo broadcasts/mensajes automatizados deben usar bypassRateLimit = false
  // ═══════════════════════════════════════════════════════════════════════════
  async sendWhatsAppMessage(to: string, body: string, bypassRateLimit = true): Promise<any> {
    const phone = this.normalizePhone(to);
    const now = Date.now();

    // 🧪 MODO PRUEBA - Bloquear envíos a teléfonos no autorizados
    if (!isTestPhoneAllowed(phone)) {
      console.log(`🧪 TEST_MODE: Bloqueado envío a ${phone} (no autorizado)`);
      return { test_mode_blocked: true, phone };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🚨 CIRCUIT BREAKER - Solo para mensajes NO bypass (broadcasts)
    // Las conversaciones normales NUNCA se bloquean
    // ═══════════════════════════════════════════════════════════════════════
    if (!bypassRateLimit) {
      if (now - globalMessageWindowStart > 5 * 60 * 1000) {
        globalMessageCount = 0;
        globalMessageWindowStart = now;
      }
      globalMessageCount++;

      if (globalMessageCount > CIRCUIT_BREAKER_THRESHOLD) {
        console.error(`🚨 CIRCUIT BREAKER (BROADCAST): ${globalMessageCount} mensajes en 5 min`);
        if (globalMessageCount === CIRCUIT_BREAKER_THRESHOLD + 1) {
          await this.sendAlertToAdmin(`🚨 ALERTA: Circuit breaker broadcasts. ${globalMessageCount} msgs en 5 min.`);
        }
        throw new Error('CIRCUIT_BREAKER: Demasiados broadcasts. Sistema pausado.');
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 🚦 RATE LIMITING - Solo para broadcasts
      // ═══════════════════════════════════════════════════════════════════════
      cleanupRateLimits();

      const entry = messageRateLimit.get(phone) || {
        count: 0,
        firstMessageAt: now,
        lastMessageAt: now,
        blocked: false
      };

      if (entry.blocked) {
        console.error(`🚫 BROADCAST bloqueado para ${phone}: ${entry.blockReason}`);
        throw new Error(`RATE_LIMIT: Número bloqueado - ${entry.blockReason}`);
      }

      const hourAgo = now - RATE_LIMIT_WINDOW_MS;
      if (entry.firstMessageAt > hourAgo && entry.count >= MAX_MESSAGES_PER_HOUR) {
        console.error(`🚫 BROADCAST: ${phone} excedió ${MAX_MESSAGES_PER_HOUR} msgs/hora`);
        entry.blocked = true;
        entry.blockReason = 'Excedió límite de broadcasts por hora';
        messageRateLimit.set(phone, entry);
        throw new Error('RATE_LIMIT: Demasiados broadcasts a este número');
      }

      const minuteAgo = now - 60 * 1000;
      if (entry.lastMessageAt > minuteAgo && entry.count >= MAX_MESSAGES_PER_MINUTE) {
        console.warn(`⚠️ BROADCAST: ${phone} - ${MAX_MESSAGES_PER_MINUTE} en 1 min, bloqueando`);
        throw new Error('RATE_LIMIT: Demasiados broadcasts en poco tiempo');
      }

      if (entry.firstMessageAt < hourAgo) {
        entry.count = 1;
        entry.firstMessageAt = now;
      } else {
        entry.count++;
      }
      entry.lastMessageAt = now;
      messageRateLimit.set(phone, entry);

      console.log(`📊 Broadcast rate: ${phone}: ${entry.count}/${MAX_MESSAGES_PER_HOUR}/hora`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📤 ENVIAR MENSAJE
    // ═══════════════════════════════════════════════════════════════════════
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    // Sanitizar UTF-8 antes de enviar
    const cleanBody = sanitizeUTF8(body);

    // Validar largo de mensaje - WhatsApp límite 4096 chars
    if (cleanBody.length > 4000) {
      console.warn(`⚠️ Mensaje largo (${cleanBody.length} chars) a ${phone}, dividiendo...`);
      const chunks: string[] = [];
      let remaining = cleanBody;
      while (remaining.length > 0) {
        if (remaining.length <= 4000) {
          chunks.push(remaining);
          break;
        }
        let splitAt = remaining.lastIndexOf('\n', 4000);
        if (splitAt < 2000) splitAt = remaining.lastIndexOf('. ', 4000);
        if (splitAt < 2000) splitAt = 4000;
        chunks.push(remaining.substring(0, splitAt));
        remaining = remaining.substring(splitAt).trimStart();
      }
      let lastResult: any;
      for (const chunk of chunks) {
        lastResult = await this._sendSingleMessage(phone, chunk, bypassRateLimit);
      }
      return lastResult;
    }

    return this._sendSingleMessage(phone, cleanBody, bypassRateLimit);
  }

  private async _sendSingleMessage(phone: string, body: string, bypassRateLimit: boolean): Promise<any> {
    // 🚦 Global Meta API rate limit check (KV-based)
    const canSend = await this.checkGlobalRateLimit();
    if (!canSend) {
      console.warn(`🚦 Rate limited: enqueuing text message to ${phone}`);
      if (this.rateLimitEnqueueCallback) {
        await this.rateLimitEnqueueCallback({
          recipientPhone: phone,
          messageType: 'text',
          payload: { body },
          context: `rateLimited:text:${phone}`
        });
      }
      return { rate_limited: true, enqueued: true, phone };
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: true, body }
    };

    console.log(`📤 Meta WA enviando a ${phone}: ${body.substring(0, 50)}...`);

    let response: Response;
    try {
      response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, `sendMessage:${phone}`);
    } catch (retryError: any) {
      // All retries exhausted — enqueue for later retry
      if (this.failedMessageCallback) {
        try {
          await this.failedMessageCallback({
            recipientPhone: phone,
            messageType: 'text',
            payload: { body },
            context: `sendMessage:${phone}`,
            errorMessage: retryError?.message || String(retryError)
          });
        } catch (_) { /* silent */ }
      }
      throw retryError;
    }

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Meta WA error:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando mensaje');
    }
    console.log(`✅ Meta WA enviado: ${data.messages?.[0]?.id}`);

    // 📊 Tracking de mensaje enviado
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'text',
        categoria: bypassRateLimit ? 'respuesta_sara' : 'broadcast',
        contenido: body.substring(0, 200)
      });
    }

    return data;
  }

  // Enviar alerta crítica al admin (intenta template primero, fallback texto directo)
  private async sendAlertToAdmin(message: string): Promise<void> {
    try {
      const msgTruncado = message.length > 1000 ? message.substring(0, 997) + '...' : message;
      // Intentar template primero (no requiere ventana 24h)
      try {
        await this.sendTemplate(this.adminPhone, 'alerta_sistema', 'es_MX', [
          { type: 'body', parameters: [{ type: 'text', text: msgTruncado }] }
        ], true);
        console.log(`🚨 Alerta enviada a admin via template: ${message.substring(0, 50)}...`);
        return;
      } catch (_templateErr) {
        // Template no disponible, fallback a texto directo
      }
      // Fallback: texto directo (requiere ventana 24h)
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.adminPhone,
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
      console.log(`🚨 Alerta enviada a admin (fallback directo): ${message.substring(0, 50)}...`);
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

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendImage:${phone}`, {
      recipientPhone: phone, messageType: 'image', payload: { url: imageUrl, caption }
    });
    const data = await response.json() as any;

    // 📊 Tracking de imagen enviada
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'image',
        categoria: 'imagen',
        contenido: caption?.substring(0, 200) || 'Imagen enviada'
      });
    }

    return data;
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

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendVideo:${phone}`, {
      recipientPhone: phone, messageType: 'video', payload: { url: videoUrl, caption }
    });
    const data = await response.json() as any;

    // 📊 Tracking de video enviado
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'video',
        categoria: 'video',
        contenido: caption?.substring(0, 200) || 'Video enviado'
      });
    }

    return data;
  }

  async sendWhatsAppDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'document',
      document: {
        link: documentUrl,
        filename: filename
      }
    };
    if (caption) payload.document.caption = sanitizeUTF8(caption);

    console.log(`📄 Enviando documento ${filename} a ${phone}`);

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendDocument:${phone}`, {
      recipientPhone: phone, messageType: 'document', payload: { url: documentUrl, filename }
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error enviando documento:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando documento');
    }
    console.log(`✅ Documento enviado: ${data.messages?.[0]?.id}`);

    // 📊 Tracking de documento enviado
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'document',
        categoria: 'documento',
        contenido: `Documento: ${filename}`
      });
    }

    return data;
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

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendVideoById:${phone}`, {
      recipientPhone: phone, messageType: 'video', payload: { mediaId, caption }
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error enviando video:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando video');
    }
    console.log(`✅ Video enviado: ${data.messages?.[0]?.id}`);

    // 📊 Tracking de video enviado (por media_id)
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'video',
        categoria: 'video',
        contenido: caption?.substring(0, 200) || 'Video enviado'
      });
    }

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

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error subiendo video:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error subiendo video');
    }
    console.log(`✅ Video subido a Meta: ${data.id}`);
    return data.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔊 MENSAJES DE AUDIO / VOZ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sube un audio a Meta y retorna el media_id
   * Formatos soportados: audio/ogg, audio/opus, audio/mpeg (mp3), audio/aac
   */
  async uploadAudioFromBuffer(audioBuffer: ArrayBuffer, mimeType: string = 'audio/ogg'): Promise<string> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/media`;

    // Determinar extensión basada en mime type
    const extensions: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/opus': 'opus',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/aac': 'aac',
      'audio/m4a': 'm4a'
    };
    const ext = extensions[mimeType] || 'ogg';

    const blob = new Blob([audioBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', blob, `audio.${ext}`);

    console.log(`📤 Subiendo audio a Meta (${audioBuffer.byteLength} bytes, ${mimeType})...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: formData
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error subiendo audio:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error subiendo audio');
    }
    console.log(`✅ Audio subido a Meta: ${data.id}`);
    return data.id;
  }

  /**
   * Envía un mensaje de audio usando URL
   */
  async sendWhatsAppAudio(to: string, audioUrl: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'audio',
      audio: { link: audioUrl }
    };

    console.log(`🔊 Enviando audio por URL a ${phone}`);

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendAudio:${phone}`, {
      recipientPhone: phone, messageType: 'audio', payload: { url: audioUrl }
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error enviando audio:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando audio');
    }
    console.log(`✅ Audio enviado: ${data.messages?.[0]?.id}`);

    // 📊 Tracking de audio enviado (por URL)
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'audio',
        categoria: 'audio',
        contenido: 'Audio enviado'
      });
    }

    return data;
  }

  /**
   * Envía un mensaje de audio usando media_id (para audios subidos)
   */
  async sendWhatsAppAudioById(to: string, mediaId: string): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'audio',
      audio: { id: mediaId }
    };

    console.log(`🔊 Enviando audio por media_id ${mediaId} a ${phone}`);

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendAudioById:${phone}`, {
      recipientPhone: phone, messageType: 'audio', payload: { mediaId }
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error enviando audio:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando audio');
    }
    console.log(`✅ Audio enviado: ${data.messages?.[0]?.id}`);

    // 📊 Tracking de audio enviado
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'audio',
        categoria: 'audio_tts',
        contenido: 'Audio TTS'
      });
    }

    return data;
  }

  /**
   * Genera y envía una nota de voz usando TTS
   * Helper que combina uploadAudioFromBuffer + sendWhatsAppAudioById
   */
  async sendVoiceMessage(to: string, audioBuffer: ArrayBuffer, mimeType: string = 'audio/ogg'): Promise<any> {
    // 1. Subir audio a Meta
    const mediaId = await this.uploadAudioFromBuffer(audioBuffer, mimeType);

    // 2. Enviar como mensaje de audio
    return this.sendWhatsAppAudioById(to, mediaId);
  }

  /**
   * Envía mensaje con botones de respuesta rápida (máximo 3 botones)
   * Ideal para: confirmar/cancelar, elegir opciones, siguiente paso
   */
  async sendQuickReplyButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string
  ): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    // Máximo 3 botones, títulos máx 20 chars
    const validButtons = buttons.slice(0, 3).map(btn => ({
      type: 'reply',
      reply: {
        id: btn.id.substring(0, 256),
        title: btn.title.substring(0, 20)
      }
    }));

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText.substring(0, 1024) },
        action: { buttons: validButtons }
      }
    };

    if (headerText) {
      payload.interactive.header = { type: 'text', text: headerText.substring(0, 60) };
    }
    if (footerText) {
      payload.interactive.footer = { text: footerText.substring(0, 60) };
    }

    console.log(`📱 Enviando botones a ${phone}: ${buttons.map(b => b.title).join(', ')}`);

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendButtons:${phone}`, {
      recipientPhone: phone, messageType: 'buttons', payload: { bodyText, buttons: buttons.map(b => b.title) }
    });
    const data = await response.json() as any;

    // 📊 Tracking de botones enviados
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'buttons',
        categoria: 'botones_interactivos',
        contenido: bodyText.substring(0, 200)
      });
    }

    return data;
  }

  /**
   * Envía lista desplegable con opciones (máximo 10 items)
   * Ideal para: elegir desarrollo, seleccionar horario, menú de opciones
   */
  async sendListMenu(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>
    }>,
    headerText?: string,
    footerText?: string
  ): Promise<any> {
    const phone = this.normalizePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    // Validar y limpiar secciones
    const validSections = sections.map(section => ({
      title: section.title.substring(0, 24),
      rows: section.rows.slice(0, 10).map(row => ({
        id: row.id.substring(0, 200),
        title: row.title.substring(0, 24),
        description: row.description?.substring(0, 72)
      }))
    }));

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText.substring(0, 1024) },
        action: {
          button: buttonText.substring(0, 20),
          sections: validSections
        }
      }
    };

    if (headerText) {
      payload.interactive.header = { type: 'text', text: headerText.substring(0, 60) };
    }
    if (footerText) {
      payload.interactive.footer = { text: footerText.substring(0, 60) };
    }

    console.log(`📋 Enviando lista a ${phone}: ${buttonText}`);

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendList:${phone}`, {
      recipientPhone: phone, messageType: 'list', payload: { bodyText, buttonText }
    });
    const data = await response.json() as any;

    // 📊 Tracking de lista enviada
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'list',
        categoria: 'lista_interactiva',
        contenido: bodyText.substring(0, 200)
      });
    }

    return data;
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

    const response = await this._fetchWithCallback(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, `sendLocation:${phone}`, {
      recipientPhone: phone, messageType: 'location', payload: { latitude, longitude, name }
    });
    const data = await response.json() as any;

    // 📊 Tracking de ubicación enviada
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'text',
        categoria: 'ubicacion',
        contenido: `Ubicación: ${name || ''} (${latitude}, ${longitude})`
      });
    }

    return data;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 📥 OBTENER URL DE MEDIA (para descargar imágenes/documentos recibidos)
  // ═══════════════════════════════════════════════════════════════════════════
  async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${mediaId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        console.error('❌ Error obteniendo media URL:', response.status);
        return null;
      }

      const data = await response.json() as { url?: string };
      return data.url || null;
    } catch (e) {
      console.error('❌ Error en getMediaUrl:', e);
      return null;
    }
  }

  // Descargar contenido de media y retornar como base64
  async downloadMediaAsBase64(mediaUrl: string): Promise<string | null> {
    try {
      const response = await fetch(mediaUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        console.error('❌ Error descargando media:', response.status);
        return null;
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    } catch (e) {
      console.error('❌ Error en downloadMediaAsBase64:', e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📋 ENVIAR TEMPLATE DE WHATSAPP
  // ═══════════════════════════════════════════════════════════════════════════
  // Templates son para broadcasts/mensajes automáticos fuera de ventana 24h
  // Por default aplican rate limiting (bypassRateLimit = false)
  // ═══════════════════════════════════════════════════════════════════════════
  async sendTemplate(to: string, templateName: string, languageCode: string = 'es', components?: any[], bypassRateLimit: boolean = false): Promise<any> {
    const phone = this.normalizePhone(to);
    const now = Date.now();

    // 🧪 MODO PRUEBA - Bloquear envíos a teléfonos no autorizados
    if (!isTestPhoneAllowed(phone)) {
      console.log(`🧪 TEST_MODE: Bloqueado template "${templateName}" a ${phone} (no autorizado)`);
      return { test_mode_blocked: true, phone, template: templateName };
    }

    // 🚦 Global Meta API rate limit check (KV-based)
    const canSend = await this.checkGlobalRateLimit();
    if (!canSend) {
      console.warn(`🚦 Rate limited: enqueuing template "${templateName}" to ${phone}`);
      if (this.rateLimitEnqueueCallback) {
        await this.rateLimitEnqueueCallback({
          recipientPhone: phone,
          messageType: 'template',
          payload: { templateName, languageCode, components },
          context: `rateLimited:template:${phone}`
        });
      }
      return { rate_limited: true, enqueued: true, phone, template: templateName };
    }

    // 🚦 RATE LIMITING PARA TEMPLATES (broadcasts automáticos)
    if (!bypassRateLimit) {
      if (now - globalMessageWindowStart > 5 * 60 * 1000) {
        globalMessageCount = 0;
        globalMessageWindowStart = now;
      }
      globalMessageCount++;

      if (globalMessageCount > CIRCUIT_BREAKER_THRESHOLD) {
        console.error(`🚨 CIRCUIT BREAKER (TEMPLATE): ${globalMessageCount} templates en 5 min`);
        throw new Error('CIRCUIT_BREAKER: Demasiados templates. Sistema pausado.');
      }

      cleanupRateLimits();
      const entry = messageRateLimit.get(phone) || {
        count: 0,
        firstMessageAt: now,
        lastMessageAt: now,
        blocked: false
      };

      if (entry.blocked) {
        console.error(`🚫 TEMPLATE bloqueado para ${phone}: ${entry.blockReason}`);
        throw new Error(`RATE_LIMIT: Número bloqueado para templates`);
      }

      const hourAgo = now - RATE_LIMIT_WINDOW_MS;
      if (entry.firstMessageAt > hourAgo && entry.count >= MAX_MESSAGES_PER_HOUR) {
        console.error(`🚫 TEMPLATE: ${phone} excedió ${MAX_MESSAGES_PER_HOUR} msgs/hora`);
        throw new Error('RATE_LIMIT: Demasiados templates a este número');
      }

      if (entry.firstMessageAt < hourAgo) {
        entry.count = 1;
        entry.firstMessageAt = now;
      } else {
        entry.count++;
      }
      entry.lastMessageAt = now;
      messageRateLimit.set(phone, entry);
      console.log(`📊 Template rate: ${phone}: ${entry.count}/${MAX_MESSAGES_PER_HOUR}/hora`);
    }

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

    if (components && components.length > 0) {
      payload.template.components = components;
    }

    console.log(`📤 Enviando template "${templateName}" a ${phone}`);

    let response: Response;
    try {
      response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, `sendTemplate:${templateName}:${phone}`);
    } catch (retryError: any) {
      if (this.failedMessageCallback) {
        try {
          await this.failedMessageCallback({
            recipientPhone: phone,
            messageType: 'template',
            payload: { templateName, languageCode, components },
            context: `sendTemplate:${templateName}:${phone}`,
            errorMessage: retryError?.message || String(retryError)
          });
        } catch (_) { /* silent */ }
      }
      throw retryError;
    }

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error enviando template:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando template');
    }
    console.log(`✅ Template enviado: ${data.messages?.[0]?.id}`);

    // 📊 Tracking de template enviado
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'template',
        categoria: `template_${templateName}`,
        contenido: `Template: ${templateName}`
      });
    }

    return data;
  }

  /**
   * Envía un template tipo carousel (tarjetas deslizables) via Meta WhatsApp API.
   * Cada card tiene: imagen header, body con params dinámicos, y botones quick_reply.
   * Requiere template aprobado por Meta con componente CAROUSEL.
   */
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
  ): Promise<any> {
    const phone = this.normalizePhone(to);

    if (!isTestPhoneAllowed(phone)) {
      console.log(`🧪 TEST_MODE: Bloqueado carousel "${templateName}" a ${phone}`);
      return { test_mode_blocked: true, phone, template: templateName };
    }

    const canSend = await this.checkGlobalRateLimit();
    if (!canSend) {
      console.warn(`🚦 Rate limited: carousel "${templateName}" to ${phone}`);
      return { rate_limited: true, phone, template: templateName };
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    // Build carousel cards components
    const carouselCards = cards.map((card, index) => {
      const cardComponents: any[] = [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: card.imageUrl } }]
        },
        {
          type: 'body',
          parameters: card.bodyParams.map(p => ({ type: 'text', text: p }))
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: 0,
          parameters: [{ type: 'payload', payload: card.quickReplyPayload }]
        }
      ];

      if (card.quickReplyPayload2) {
        cardComponents.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: 1,
          parameters: [{ type: 'payload', payload: card.quickReplyPayload2 }]
        });
      }

      return { card_index: index, components: cardComponents };
    });

    const components: any[] = [];

    // Body params for the template header text (before cards)
    if (bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParams.map(p => ({ type: 'text', text: p }))
      });
    }

    // Carousel component
    components.push({
      type: 'CAROUSEL',
      cards: carouselCards
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components
      }
    };

    console.log(`📤 Enviando carousel "${templateName}" (${cards.length} cards) a ${phone}`);

    let response: Response;
    try {
      response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, `sendCarousel:${templateName}:${phone}`);
    } catch (retryError: any) {
      if (this.failedMessageCallback) {
        try {
          await this.failedMessageCallback({
            recipientPhone: phone,
            messageType: 'template',
            payload: { templateName, languageCode, components },
            context: `sendCarousel:${templateName}:${phone}`,
            errorMessage: retryError?.message || String(retryError)
          });
        } catch (_) { /* silent */ }
      }
      throw retryError;
    }

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error enviando carousel:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando carousel');
    }
    console.log(`✅ Carousel enviado: ${data.messages?.[0]?.id}`);

    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId,
        recipientPhone: phone,
        messageType: 'template',
        categoria: `carousel_${templateName}`,
        contenido: `Carousel: ${templateName} (${cards.length} cards)`
      });
    }

    return data;
  }

  // ═══ CTA URL BUTTON ═══
  async sendCTAButton(to: string, bodyText: string, buttonText: string, url: string, headerText?: string, footerText?: string): Promise<any> {
    const phone = this.normalizePhone(to);
    if (!isTestPhoneAllowed(phone)) return { messages: [{ id: 'blocked' }] };

    const interactive: any = {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: { display_text: buttonText, url }
      }
    };
    if (headerText) interactive.header = { type: 'text', text: headerText };
    if (footerText) interactive.footer = { text: footerText };

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive
    };

    const response = await this._fetchWithCallback(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, `sendCTA:${phone}`, {
      recipientPhone: phone, messageType: 'cta_button', payload: { bodyText, buttonText, url }
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error CTA button:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando CTA button');
    }

    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      await this.track({
        messageId, recipientPhone: phone, messageType: 'interactive',
        categoria: 'cta_button', contenido: `${buttonText} → ${url.slice(0, 100)}`
      });
    }
    return data;
  }

  // ═══ REACTION ═══
  async sendReaction(to: string, messageId: string, emoji: string): Promise<any> {
    const phone = this.normalizePhone(to);
    if (!isTestPhoneAllowed(phone)) return {};

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'reaction',
      reaction: { message_id: messageId, emoji }
    };

    const response = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error reaction:', JSON.stringify(data));
    }
    // No tracking for reactions (not a real message, just a visual indicator)
    return data;
  }

  // ═══ CONTACT CARD (vCard) ═══
  async sendContactCard(to: string, contact: { name: string; phone: string; company?: string; title?: string }): Promise<any> {
    const phone = this.normalizePhone(to);
    if (!isTestPhoneAllowed(phone)) return { messages: [{ id: 'blocked' }] };

    const nameParts = contact.name.split(' ');
    const firstName = nameParts[0] || contact.name;
    const lastName = nameParts.slice(1).join(' ') || '';

    const contactPhone = contact.phone.replace(/\D/g, '');
    const formattedPhone = contactPhone.startsWith('+') ? contactPhone : `+${contactPhone.startsWith('52') ? '' : '52'}${contactPhone}`;

    const contactPayload: any = {
      name: {
        formatted_name: contact.name,
        first_name: firstName,
        ...(lastName && { last_name: lastName })
      },
      phones: [{ phone: formattedPhone, type: 'WORK' }]
    };
    if (contact.company || contact.title) {
      contactPayload.org = {};
      if (contact.company) contactPayload.org.company = contact.company;
      if (contact.title) contactPayload.org.title = contact.title;
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'contacts',
      contacts: [contactPayload]
    };

    const response = await this._fetchWithCallback(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, `sendContactCard:${phone}`, {
      recipientPhone: phone, messageType: 'contacts', payload: { contact }
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error contact card:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando contact card');
    }

    const msgId = data.messages?.[0]?.id;
    if (msgId) {
      await this.track({
        messageId: msgId, recipientPhone: phone, messageType: 'contacts',
        categoria: 'contacto_vendedor', contenido: contact.name
      });
    }
    return data;
  }

  // ═══ LOCATION REQUEST ═══
  async sendLocationRequest(to: string, bodyText: string): Promise<any> {
    const phone = this.normalizePhone(to);
    if (!isTestPhoneAllowed(phone)) return { messages: [{ id: 'blocked' }] };

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: bodyText },
        action: { name: 'send_location' }
      }
    };

    const response = await this._fetchWithCallback(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, `sendLocationRequest:${phone}`, {
      recipientPhone: phone, messageType: 'location_request', payload: { bodyText }
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('❌ Error location request:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error enviando location request');
    }

    const msgId = data.messages?.[0]?.id;
    if (msgId) {
      await this.track({
        messageId: msgId, recipientPhone: phone, messageType: 'interactive',
        categoria: 'solicitud_ubicacion', contenido: 'Location request button'
      });
    }
    return data;
  }
}
