import { SupabaseService } from './services/supabase';
import { OpenAIService } from './services/openai';
import { TwilioService } from './services/twilio';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
import { handleTeamRoutes } from './routes/team-routes';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    
    // API Routes - Team Members
    if (url.pathname.startsWith('/api/team-members')) {
      const response = await handleTeamRoutes(request, env, supabase);
      if (response) return response;
    }

    // Webhook WhatsApp
    if (url.pathname === '/webhook/whatsapp' && request.method === 'POST') {
      const formData = await request.formData();
      const from = formData.get('From') as string;
      const body = formData.get('Body') as string;

      if (!from || !body) {
        return new Response('Missing required fields', { status: 400 });
      }

      const openai = new OpenAIService(env.OPENAI_API_KEY);
      const twilio = new TwilioService(
        env.TWILIO_ACCOUNT_SID,
        env.TWILIO_AUTH_TOKEN,
        env.TWILIO_PHONE_NUMBER
      );
      const calendar = new CalendarService(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        env.GOOGLE_PRIVATE_KEY,
        env.GOOGLE_CALENDAR_ID
      );
      const handler = new WhatsAppHandler(supabase, openai, twilio, calendar);

      await handler.handleIncomingMessage(from, body);

      return new Response('OK', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  },
};
