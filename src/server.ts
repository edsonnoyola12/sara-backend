import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabaseService } from './supabaseService.js';
import { geminiService } from './geminiService.js';
import { twilioService } from './twilioService.js';
import type { WhatsAppIncomingMessage } from './types.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'SARA Backend'
  });
});

// Main WhatsApp webhook
app.post('/webhook/whatsapp', async (req: Request, res: Response) => {
  try {
    console.log('📱 Incoming WhatsApp message:', req.body);

    const incomingMessage: WhatsAppIncomingMessage = req.body;
    const { From, Body, ProfileName } = incomingMessage;

    // Extract phone number (remove whatsapp: prefix)
    const userPhone = From.replace('whatsapp:', '');
    const messageText = Body.trim();

    // Get or create lead
    let lead = await supabaseService.getLeadByPhone(userPhone);
    
    if (!lead) {
      // Create new lead
      lead = await supabaseService.createLead({
        name: ProfileName || 'Cliente WhatsApp',
        phone: userPhone
      });
    }

    if (!lead) {
      console.error('❌ Failed to create/get lead');
      return res.status(500).send('Error processing lead');
    }

    // Save incoming message
    await supabaseService.saveMessage({
      lead_id: lead.id,
      content: messageText,
      sender: 'client'
    });

    // Get conversation history
    const history = await supabaseService.getConversationHistory(lead.id);

    // Generate AI response
    const aiResponse = await geminiService.generateResponse(messageText, history);

    // Save SARA's response
    await supabaseService.saveMessage({
      lead_id: lead.id,
      content: aiResponse.text,
      sender: 'sara'
    });

    // Send response via WhatsApp
    await twilioService.sendMessage(userPhone, aiResponse.text);

    console.log('✅ Message processed successfully');
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error in webhook:', error);
    res.status(500).send('Internal server error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SARA Backend running on port ${PORT}`);
  console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook/whatsapp`);
});
