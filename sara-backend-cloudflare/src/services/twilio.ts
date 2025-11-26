export class TwilioService {
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;

  constructor(accountSid: string, authToken: string, phoneNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.phoneNumber = phoneNumber;
  }

  async sendWhatsAppMessage(to: string, message: string) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    
    // 'to' ya viene con formato 'whatsapp:+521...' desde el webhook
    const formData = new URLSearchParams({
      From: `whatsapp:${this.phoneNumber}`,
      To: to,  // NO agregar 'whatsapp:' de nuevo
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

    const result = await res.json();
    
    if (!res.ok) {
      console.error('❌ Twilio error:', result);
    } else {
      console.log('✅ Message sent:', result.sid);
    }

    return result;
  }

  async sendWhatsAppWithMedia(to: string, message: string, mediaUrl: string) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    
    const formData = new URLSearchParams({
      From: `whatsapp:${this.phoneNumber}`,
      To: to,
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

    const result = await res.json();
    
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
