import { Router } from 'itty-router';
import { SupabaseService } from '../services/supabase';
import { TwilioService } from '../services/twilio';

export function createMarketingAlertsRouter(
  supabase: SupabaseService,
  twilio: TwilioService
) {
  const router = Router({ base: '/api/marketing-alerts' });

  router.post('/', async () => {
    try {
      console.log('🔔 Ejecutando alertas de marketing...');

      // Obtener campañas activas y personal de marketing
      const [campaignsRes, teamRes] = await Promise.all([
        supabase.client.from('marketing_campaigns').select('*').eq('status', 'active'),
        supabase.client.from('team_members').select('*').eq('role', 'agencia').eq('active', true)
      ]);

      const campaigns = campaignsRes.data || [];
      const marketingTeam = teamRes.data || [];

      if (marketingTeam.length === 0) {
        console.error('⚠️ No hay personal de marketing activo');
        return new Response(JSON.stringify({ success: false, message: 'No hay personal de marketing' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const alerts: string[] = [];

      for (const campaign of campaigns) {
        const cpl = campaign.leads_generated > 0 ? campaign.spent / campaign.leads_generated : 0;
        const roi = campaign.spent > 0 ? ((campaign.revenue_generated - campaign.spent) / campaign.spent * 100) : 0;
        const budgetUsed = campaign.budget > 0 ? (campaign.spent / campaign.budget * 100) : 0;

        // Alerta 1: CPL muy alto (>$1000)
        if (cpl > 1000 && campaign.leads_generated > 5) {
          alerts.push(`⚠️ ALERTA: Campaña "${campaign.name}"\n📊 CPL: $${cpl.toFixed(0)} (muy alto)\n💡 Revisar segmentación y creativos`);
        }

        // Alerta 2: ROI negativo con inversión significativa
        if (roi < -10 && campaign.spent > 10000) {
          alerts.push(`📉 ALERTA: Campaña "${campaign.name}"\n💰 ROI: ${roi.toFixed(0)}% (negativo)\n💸 Invertido: $${campaign.spent.toLocaleString()}\n💡 Considerar pausar o ajustar`);
        }

        // Alerta 3: Presupuesto casi agotado
        if (budgetUsed > 90 && budgetUsed < 100) {
          alerts.push(`⚠️ Campaña "${campaign.name}"\n💰 Presupuesto al ${budgetUsed.toFixed(0)}%\n💡 Renovar o ajustar presupuesto`);
        }

        // Alerta 4: Sin leads en últimos 7 días (simplificado: si tiene impresiones pero 0 leads)
        if (campaign.impressions > 1000 && campaign.leads_generated === 0) {
          alerts.push(`🚨 URGENTE: Campaña "${campaign.name}"\n📊 ${campaign.impressions} impresiones pero 0 leads\n💡 Revisar landing page y call to action`);
        }
      }

      // Enviar alertas al equipo de marketing
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
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('❌ Error en alertas de marketing:', error);
      return new Response(JSON.stringify({ success: false, error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  return router;
}
