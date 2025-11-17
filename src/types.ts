// TypeScript interfaces for SARA backend
export interface Lead {
  id: string;
  name: string;
  phone: string;
  property_interest?: string;
  budget?: number;
  status: 'New' | 'Contacted' | 'Follow-up' | 'Appointment Scheduled' | 'Negotiation' | 'Closed' | 'Lost';
  urgency: 'high' | 'medium' | 'low';
  assigned_salesperson?: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  content: string;
  sender: 'client' | 'sara' | 'salesperson';
  timestamp: string;
}

export interface WhatsAppIncomingMessage {
  From: string;
  To: string;
  Body: string;
  ProfileName?: string;
  MessageSid: string;
}

export interface GeminiResponse {
  text: string;
  functionCalls?: FunctionCall[];
}

export interface FunctionCall {
  name: string;
  args: Record<string, any>;
}
