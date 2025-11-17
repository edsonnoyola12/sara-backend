import twilio from 'twilio';

class TwilioService {
  private client;
  private fromNumber: string;

  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  }

  async sendMessage(to: string, body: string): Promise<boolean> {
    try {
      // Ensure proper WhatsApp format
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      const fromNumber = this.fromNumber.startsWith('whatsapp:') 
        ? this.fromNumber 
        : `whatsapp:${this.fromNumber}`;

      const message = await this.client.messages.create({
        from: fromNumber,
        to: toNumber,
        body: body
      });

      console.log(`Message sent successfully. SID: ${message.sid}`);
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      return false;
    }
  }
}

export const twilioService = new TwilioService();
