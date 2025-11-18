import { twilioService } from './twilioService.js';
import { leadScoringService } from './leadScoringService.js';

export const notificationService = {
  async notifyLeadScoreUpdate(lead: any, score: number, history: any[]) {
    const leadInfo = leadScoringService.getLeadCategory(score);
    const teamNumbers = [process.env.TEAM_LEAD_PHONE].filter(Boolean);

    const message = `
${leadInfo.color} *${leadInfo.category} LEAD - ${score} pts* ${leadInfo.emoji}

👤 ${lead.name}
📱 ${lead.phone}
🏠 ${lead.property_interest || 'Por definir'}
💰 ${lead.budget ? '$' + lead.budget.toLocaleString() : 'Por definir'}

📊 Score: ${score}/100
🎯 ${leadInfo.action}

💬 Conversación: ${history.length} mensajes
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
