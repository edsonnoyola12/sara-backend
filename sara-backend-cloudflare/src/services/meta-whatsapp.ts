// Meta WhatsApp Cloud API Service

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

  async sendWhatsAppMessage(to: string, body: string): Promise<any> {
    const phone = this.normalizePhone(to);
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
