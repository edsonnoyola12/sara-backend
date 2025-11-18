import { twilioService } from './twilioService.js';

export const notificationService = {
  async notifyNewLead(lead: any) {
    const teamNumbers = [
      process.env.TEAM_LEAD_PHONE, // Tu número
      // Agrega más números del equipo aquí
    ].filter(Boolean);

    const message = `
🚨 *NUEVO LEAD*

👤 Nombre: ${lead.name}
📱 Teléfono: ${lead.phone}
🏠 Interés: ${lead.property_interest || 'Por definir'}
💰 Presupuesto: ${lead.budget ? '$' + lead.budget.toLocaleString() : 'Por definir'}
⚡ Urgencia: ${lead.urgency || 'Media'}
📍 Fuente: WhatsApp

🔥 *Responde rápido para cerrar!*
    `.trim();

    for (const phone of teamNumbers) {
      try {
        await twilioService.sendMessage(phone as string, message);
      } catch (error) {
        console.error(`Error notifying ${phone}:`, error);
      }
    }
  },

  async notifyQualifiedLead(lead: any) {
    const teamNumbers = [process.env.TEAM_LEAD_PHONE].filter(Boolean);

    const message = `
✅ *LEAD CALIFICADO*

👤 ${lead.name}
📱 ${lead.phone}
🏠 ${lead.property_interest}
💰 ${lead.budget ? '$' + lead.budget.toLocaleString() : 'A definir'}
⏰ Compra: ${lead.urgency}

🎯 *LISTO PARA AGENDAR VISITA*
    `.trim();

    for (const phone of teamNumbers) {
      try {
        await twilioService.sendMessage(phone as string, message);
      } catch (error) {
        console.error(`Error notifying ${phone}:`, error);
      }
    }
  }
};
