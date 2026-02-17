import { SupabaseService } from '../services/supabase';
import { TwilioService } from '../services/twilio';

export async function handleAutomation(request: Request, env: any) {
  const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const twilio = new TwilioService(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_WHATSAPP_NUMBER);
  
  const results = {
    encuestasEnviadas: 0,
    alertasLeadOlvidado: 0,
    recordatoriosSeguimiento: 0
  };

  const now = new Date();

  // Obtener todos los leads y vendedores
  const [leadsRes, teamRes] = await Promise.all([
    supabase.client.from('leads').select('*'),
    supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true)
  ]);

  const leads = leadsRes.data || [];
  const vendedores = teamRes.data || [];

  for (const lead of leads) {
    const lastUpdate = new Date(lead.updated_at || lead.created_at);
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    const daysSinceUpdate = hoursSinceUpdate / 24;

    // 1. ENCUESTA POST-CITA: 2 horas después de cita agendada
    if (lead.status === 'appointment_completed' && !lead.survey_sent) {
      if (hoursSinceUpdate >= 2 && hoursSinceUpdate < 24) {
        const mensaje = `¡Hola ${lead.name || 'Cliente'}! 👋 Soy SARA de Grupo Santa Rita.\n\n¿Qué te pareció tu visita? Me encantaría conocer tu opinión:\n\n1️⃣ Excelente\n2️⃣ Buena\n3️⃣ Regular\n4️⃣ Necesito más información\n\nTu feedback nos ayuda a mejorar 🙏`;
        
        await twilio.sendWhatsAppMessage('whatsapp:' + lead.phone, mensaje);
        const { error: errSurvey } = await supabase.client.from('leads').update({ survey_sent: true }).eq('id', lead.id);
        if (errSurvey) console.error('⚠️ Error updating survey_sent flag for lead', lead.id, ':', errSurvey);
        results.encuestasEnviadas++;
      }
    }

    // 2. ALERTA LEAD OLVIDADO: 24h sin cambio de estatus (solo leads nuevos o contactados)
    if (['new', 'contacted'].includes(lead.status) && !lead.alerta_enviada_24h) {
      if (hoursSinceUpdate >= 24 && hoursSinceUpdate < 48) {
        // Notificar a vendedores
        for (const v of vendedores) {
          if (v.phone) {
            const alerta = `🚨 ALERTA: Lead olvidado!\n\n👤 ${lead.name || 'Sin nombre'}\n📱 ${lead.phone}\n🏠 Interés: ${lead.property_interest || 'No definido'}\n⏰ Sin actividad: 24+ horas\n\n¡Contactar URGENTE!`;
            await twilio.sendWhatsAppMessage('whatsapp:' + v.phone, alerta);
          }
        }
        const { error: errAlerta24h } = await supabase.client.from('leads').update({ alerta_enviada_24h: true }).eq('id', lead.id);
        if (errAlerta24h) console.error('⚠️ Error updating alerta_enviada_24h flag for lead', lead.id, ':', errAlerta24h);
        results.alertasLeadOlvidado++;
      }
    }

    // 3. RECORDATORIO SEGUIMIENTO: 5 días sin actividad
    if (!['closed_won', 'closed_lost'].includes(lead.status) && !lead.recordatorio_5dias) {
      if (daysSinceUpdate >= 5 && daysSinceUpdate < 7) {
        // Notificar a vendedores
        for (const v of vendedores) {
          if (v.phone) {
            const recordatorio = `⚠️ Cliente enfriándose!\n\n👤 ${lead.name || 'Sin nombre'}\n📱 ${lead.phone}\n🏠 Interés: ${lead.property_interest || 'No definido'}\n📊 Score: ${lead.score || 0}\n⏰ Sin actividad: ${Math.floor(daysSinceUpdate)} días\n\nRecomendación: Llamar o enviar info de promociones`;
            await twilio.sendWhatsAppMessage('whatsapp:' + v.phone, recordatorio);
          }
        }
        const { error: errRecordatorio5d } = await supabase.client.from('leads').update({ recordatorio_5dias: true }).eq('id', lead.id);
        if (errRecordatorio5d) console.error('⚠️ Error updating recordatorio_5dias flag for lead', lead.id, ':', errRecordatorio5d);
        results.recordatoriosSeguimiento++;
      }
    }
  }

  return new Response(JSON.stringify({
    success: true,
    timestamp: now.toISOString(),
    results
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
