// Meta WhatsApp Cloud API Service

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
    
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: true, body: body }
    };

    console.log(`📤 Meta WA enviando a ${phone}: ${body.substring(0, 50)}...`);

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
    if (caption) payload.image.caption = caption;

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
    if (caption) payload.video.caption = caption;

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
    if (caption) payload.video.caption = caption;

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
    if (caption) payload.document.caption = caption;

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
}
