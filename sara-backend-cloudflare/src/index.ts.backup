import { SupabaseService } from './services/supabase';
import { OpenAIService } from './services/openai';
import { TwilioService } from './services/twilio';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
import { handleCalendarRoutes } from './routes/calendar-routes';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const openai = new OpenAIService(env.OPENAI_API_KEY);
    const twilio = new TwilioService(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_WHATSAPP_NUMBER);
    const calendar = new CalendarService(
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.GOOGLE_PRIVATE_KEY,
      env.GOOGLE_CALENDAR_ID
    );
    const whatsappHandler = new WhatsAppHandler(supabase, openai, twilio);

    // Calendar routes
    const calendarResponse = await handleCalendarRoutes(request, env, calendar);
    if (calendarResponse) return calendarResponse;

    // Webhook WhatsApp
    if (url.pathname === '/webhook/whatsapp' && request.method === 'POST') {
      const formData = await request.formData();
      const from = formData.get('From') as string;
      const body = formData.get('Body') as string;

      await whatsappHandler.handleIncomingMessage(from, body);

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      });
    }

    // Automatizaciones
    if (url.pathname === '/api/automation' && request.method === 'POST') {
      try {
        console.log('🤖 Ejecutando automatizaciones...');

        const [leadsRes, teamRes] = await Promise.all([
          supabase.client.from('leads').select('*'),
          supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true)
        ]);

        const leads = leadsRes.data || [];
        const vendedores = teamRes.data || [];

        let encuestasEnviadas = 0;
        let alertasLeadOlvidado = 0;
        let recordatoriosSeguimiento = 0;

        for (const lead of leads) {
          const now = new Date();
          const updatedAt = new Date(lead.updated_at || lead.created_at);
          const horasSinActividad = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

          if (lead.status === 'appointment_completed' && !lead.survey_sent && horasSinActividad >= 2) {
            await twilio.sendWhatsAppMessage('whatsapp:' + lead.phone, '¡Hola! ¿Qué te pareció tu cita con nuestro asesor? Tu opinión es muy importante 😊');
            await supabase.client.from('leads').update({ survey_sent: true }).eq('id', lead.id);
            encuestasEnviadas++;
          }

          if (['new', 'contacted'].includes(lead.status) && !lead.alerta_enviada_24h && horasSinActividad >= 24) {
            for (const v of vendedores) {
              if (v.phone) {
                await twilio.sendWhatsAppMessage('whatsapp:' + v.phone, `🚨 URGENTE: Lead sin atención por 24h\n👤 ${lead.name || 'Sin nombre'}\n📱 ${lead.phone}\n🏠 Interés: ${lead.property_interest || 'Sin definir'}`);
              }
            }
            await supabase.client.from('leads').update({ alerta_enviada_24h: true }).eq('id', lead.id);
            alertasLeadOlvidado++;
          }

          if (!lead.recordatorio_5dias && horasSinActividad >= 120) {
            for (const v of vendedores) {
              if (v.phone) {
                await twilio.sendWhatsAppMessage('whatsapp:' + v.phone, `⏰ Recordatorio: Cliente sin contacto por 5 días\n👤 ${lead.name || 'Sin nombre'}\n📱 ${lead.phone}\n💡 Considera hacer seguimiento`);
              }
            }
            await supabase.client.from('leads').update({ recordatorio_5dias: true }).eq('id', lead.id);
            recordatoriosSeguimiento++;
          }
        }

        return new Response(JSON.stringify({
          success: true,
          timestamp: new Date().toISOString(),
          results: { encuestasEnviadas, alertasLeadOlvidado, recordatoriosSeguimiento }
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        console.error('❌ Error:', error);
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Alertas de marketing
    if (url.pathname === '/api/marketing-alerts' && request.method === 'POST') {
      try {
        console.log('🔔 Ejecutando alertas de marketing...');

        const [campaignsRes, teamRes] = await Promise.all([
          supabase.client.from('marketing_campaigns').select('*').eq('status', 'active'),
          supabase.client.from('team_members').select('*').eq('role', 'agencia').eq('active', true)
        ]);

        const campaigns = campaignsRes.data || [];
        const marketingTeam = teamRes.data || [];

        if (marketingTeam.length === 0) {
          return new Response(JSON.stringify({ success: false, message: 'No hay personal de marketing' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const alerts: string[] = [];

        for (const campaign of campaigns) {
          const cpl = campaign.leads_generated > 0 ? campaign.spent / campaign.leads_generated : 0;
          const roi = campaign.spent > 0 ? ((campaign.revenue_generated - campaign.spent) / campaign.spent * 100) : 0;
          const budgetUsed = campaign.budget > 0 ? (campaign.spent / campaign.budget * 100) : 0;

          if (cpl > 1000 && campaign.leads_generated > 5) {
            alerts.push(`⚠️ ALERTA: Campaña "${campaign.name}"\n📊 CPL: $${cpl.toFixed(0)} (muy alto)\n💡 Revisar segmentación`);
          }

          if (roi < -10 && campaign.spent > 10000) {
            alerts.push(`📉 ALERTA: Campaña "${campaign.name}"\n💰 ROI: ${roi.toFixed(0)}% (negativo)\n💸 Invertido: $${campaign.spent.toLocaleString()}`);
          }

          if (budgetUsed > 90 && budgetUsed < 100) {
            alerts.push(`⚠️ Campaña "${campaign.name}"\n💰 Presupuesto al ${budgetUsed.toFixed(0)}%`);
          }

          if (campaign.impressions > 1000 && campaign.leads_generated === 0) {
            alerts.push(`🚨 URGENTE: Campaña "${campaign.name}"\n📊 ${campaign.impressions} impresiones pero 0 leads`);
          }
        }

        for (const person of marketingTeam) {
          if (person.phone && alerts.length > 0) {
            const message = `📊 REPORTE DE MARKETING\n\n${alerts.join('\n\n---\n\n')}`;
            await twilio.sendWhatsAppMessage('whatsapp:' + person.phone, message);
            console.log('✅ Alertas enviadas a:', person.name);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          alertasSent: alerts.length,
          recipients: marketingTeam.length
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        console.error('❌ Error:', error);
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    return new Response('SARA Backend', { headers: corsHeaders });
  },

  async scheduled(event: any, env: any, ctx: any) {
    console.log('⏰ Cron ejecutado:', new Date().toISOString());

    await fetch('https://sara-backend.edson-633.workers.dev/api/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const hour = new Date().getHours();
    if (hour === 9) {
      await fetch('https://sara-backend.edson-633.workers.dev/api/marketing-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('📊 Alertas de marketing enviadas');
    }
  },
};
