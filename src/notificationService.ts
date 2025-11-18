import { twilioService } from './twilioService.js';

export const notificationService = {
  async notifyNewLead(lead: any) {
    const teamPhone = process.env.TEAM_LEAD_PHONE;
    if (!teamPhone) return;

    const message = `
🚨 *NUEVO LEAD*

👤 ${lead.name}
📱 ${lead.phone}
🏠 ${lead.property_interest || 'Por definir'}

🔥 Responde rápido!
    `.trim();

    try {
      await twilioService.sendMessage(teamPhone, message);
    } catch (error) {
      console.error('Error notifying team:', error);
    }
  }
};
