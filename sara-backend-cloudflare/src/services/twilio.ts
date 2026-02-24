export class TwilioService {
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;

  constructor(accountSid: string, authToken: string, phoneNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.phoneNumber = phoneNumber;
  }

  // Formatear número para WhatsApp
  private formatWhatsAppNumber(phone: string): string {
    // Si ya tiene prefijo whatsapp:, devolverlo tal cual
    if (phone.startsWith('whatsapp:')) {
      return phone;
    }
    
    // Limpiar y formatear
    let digits = phone.replace(/\D/g, '');
    
    // Si tiene 10 dígitos, agregar 521
    if (digits.length === 10) {
      digits = '521' + digits;
    }
    // Si tiene 12 y empieza con 52, agregar 1
    else if (digits.length === 12 && digits.startsWith('52')) {
      digits = '521' + digits.slice(2);
    }
    // Si tiene 13 y empieza con 521, está bien
    else if (digits.length === 13 && digits.startsWith('521')) {
      // OK
    }
    // Cualquier otro caso, intentar normalizar
    else {
      digits = '521' + digits.slice(-10);
    }
    
    return `whatsapp:+${digits}`;
  }

  async sendWhatsAppMessage(to: string, message: string) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    
    // Formatear número destino
    const toFormatted = this.formatWhatsAppNumber(to);
    console.log('📤 Meta WA enviando a', to.replace('whatsapp:+', ''), ':', message.slice(0, 50) + '...');
    
    const formData = new URLSearchParams({
      From: `whatsapp:${this.phoneNumber}`,
      To: toFormatted,
      Body: message
    });

    const auth = btoa(`${this.accountSid}:${this.authToken}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const result = await res.json() as any;

    if (!res.ok) {
      console.error('❌ Twilio error:', result);
    } else {
      console.log('✅ Meta WA enviado:', result.sid);
    }

    return result;
  }

  async sendWhatsAppWithMedia(to: string, message: string, mediaUrl: string) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    
    // Formatear número destino
    const toFormatted = this.formatWhatsAppNumber(to);
    
    const formData = new URLSearchParams({
      From: `whatsapp:${this.phoneNumber}`,
      To: toFormatted,
      Body: message,
      MediaUrl: mediaUrl
    });

    const auth = btoa(`${this.accountSid}:${this.authToken}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const result = await res.json() as any;

    if (!res.ok) {
      console.error('❌ Twilio error:', result);
    } else {
      console.log('✅ Message with media sent:', result.sid);
    }

    return result;
  }

  parseIncomingMessage(body: any) {
    return {
      from: body.From?.replace('whatsapp:', ''),
      to: body.To?.replace('whatsapp:', ''),
      message: body.Body || '',
      messageId: body.MessageSid
    };
  }
}
