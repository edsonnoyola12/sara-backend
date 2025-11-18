import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabaseService } from './supabaseService.js';
import { geminiService } from './geminiService.js';
import { twilioService } from './twilioService.js';
import { notificationService } from './notificationService.js';
import type { WhatsAppIncomingMessage } from './types.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'SARA Backend'
  });
});

app.post('/webhook/whatsapp', async (req: Request, res: Response) => {
  try {
    console.log('📱 Incoming WhatsApp message:', req.body);

    const incomingMessage: WhatsAppIncomingMessage = req.body;
    const { From, Body, ProfileName } = incomingMessage;

    const userPhone = From.replace('whatsapp:', '');
    const messageText = Body.trim();

    let lead = await supabaseService.getLeadByPhone(userPhone);
    let isNewLead = false;
    
    if (!lead) {
      lead = await supabaseService.createLead({
        name: ProfileName || 'Cliente WhatsApp',
        phone: userPhone
      });
      isNewLead = true;
    }

    if (!lead) {
      console.error('❌ Failed to create/get lead');
      return res.status(500).send('Error processing lead');
    }

    // 🚨 NOTIFICAR NUEVO LEAD INMEDIATAMENTE
    if (isNewLead) {
      await notificationService.notifyNewLead(lead);
    }

    await supabaseService.saveMessage({
      lead_id: lead.id,
      content: messageText,
      sender: 'client'
    });

    const history = await supabaseService.getConversationHistory(lead.id);
    const aiResponse = await geminiService.generateResponse(messageText, history);

    await supabaseService.saveMessage({
      lead_id: lead.id,
      content: aiResponse.text,
      sender: 'sara'
    });

    await twilioService.sendMessage(userPhone, aiResponse.text);

    // 🎯 DETECTAR LEAD CALIFICADO (tiene nombre real + presupuesto/propiedad)
    const msgs = await supabaseService.getConversationHistory(lead.id);
    const allText = msgs.map((m: any) => m.content).join(' ').toLowerCase();
    
    const hasRealName = lead.name !== 'Cliente WhatsApp' && lead.name.length > 2;
    const hasBudget = allText.includes('presupuesto') || allText.includes('millones') || allText.includes('$');
    const hasProperty = allText.includes('andes') || allText.includes('vista') || allText.includes('hacienda');
    
    if (hasRealName && (hasBudget || hasProperty) && msgs.length > 3) {
      await notificationService.notifyQualifiedLead(lead);
    }

    console.log('✅ Message processed successfully');
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error in webhook:', error);
    res.status(500).send('Internal server error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SARA Backend running on port ${PORT}`);
  console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook/whatsapp`);
});
