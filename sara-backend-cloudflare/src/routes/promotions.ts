// Ruta para enviar promociones
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { SupabaseService } from '../services/supabase';

interface SendPromoBody {
  promotion_id: string;
  segment: string;
  segment_type?: 'basic' | 'status' | 'source' | 'property' | 'vendedor';
  lead_ids?: string[];
  send_image: boolean;
  send_video: boolean;
  send_pdf: boolean;
}

function corsResponse(body: string | null, status: number = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    },
  });
}

export async function handlePromotionRoutes(
  request: Request,
  url: URL,
  supabase: SupabaseService,
  meta: MetaWhatsAppService
): Promise<Response | null> {

  if (url.pathname === '/api/promotions/send' && request.method === 'POST') {
    const body = await request.json() as SendPromoBody;

    // 1. Obtener promocion
    const { data: promo } = await supabase.client.from('promotions').select('*').eq('id', body.promotion_id).single();
    if (!promo) return corsResponse(JSON.stringify({ success: false, error: 'Promocion no encontrada' }), 404);

    // 2. Obtener leads con campos adicionales para segmentación avanzada
    let leads: any[] = [];
    if (body.lead_ids && body.lead_ids.length > 0) {
      const { data } = await supabase.client.from('leads').select('id, name, phone, lead_score, score, status, source, property_interest, assigned_to').in('id', body.lead_ids);
      leads = (data || []).filter((l: any) => l.phone);
    } else {
      const { data: allLeads } = await supabase.client.from('leads').select('id, name, phone, lead_score, score, status, source, property_interest, assigned_to');
      leads = (allLeads || []).filter((l: any) => l.phone);

      const seg = body.segment;
      const segType = body.segment_type || 'basic';

      // Excluir leads perdidos por defecto (excepto en compradores)
      if (seg !== 'compradores') {
        leads = leads.filter((l: any) => !['lost', 'fallen'].includes(l.status));
      }

      // Filtrado por tipo de segmentación
      if (seg !== 'todos') {
        if (segType === 'basic') {
          // Segmentación básica por score
          if (seg === 'hot') leads = leads.filter((l: any) => (l.lead_score || l.score || 0) >= 7);
          else if (seg === 'warm') leads = leads.filter((l: any) => (l.lead_score || l.score || 0) >= 4 && (l.lead_score || l.score || 0) < 7);
          else if (seg === 'cold') leads = leads.filter((l: any) => (l.lead_score || l.score || 0) < 4);
          else if (seg === 'compradores') leads = leads.filter((l: any) => ['closed', 'delivered', 'sold', 'closed_won'].includes(l.status));
          else if (seg === 'new') leads = leads.filter((l: any) => l.status === 'new');
        } else if (segType === 'status') {
          // Segmentación por etapa del funnel
          leads = leads.filter((l: any) => l.status === seg);
        } else if (segType === 'source') {
          // Segmentación por fuente de adquisición
          leads = leads.filter((l: any) => l.source === seg);
        } else if (segType === 'property') {
          // Segmentación por desarrollo de interés
          leads = leads.filter((l: any) => l.property_interest === seg);
        } else if (segType === 'vendedor') {
          // Segmentación por vendedor asignado
          leads = leads.filter((l: any) => l.assigned_to === seg);
        }
      }
    }

    if (leads.length === 0) return corsResponse(JSON.stringify({ success: false, error: 'No hay leads' }), 400);

    let sent = 0, errors = 0;

    // 3. Enviar a cada lead
    for (const lead of leads) {
      try {
        const phone = lead.phone.replace(/\D/g, '');
        const formattedPhone = phone.startsWith('521') ? phone : (phone.startsWith('52') ? '521' + phone.slice(2) : '521' + phone);
        const personalizedMsg = promo.message.replace('{nombre}', lead.name || 'amigo');

        // Enviar imagen
        if (body.send_image && promo.image_url) {
          await meta.sendWhatsAppImage(formattedPhone, promo.image_url, promo.name);
          await new Promise(r => setTimeout(r, 500));
        }

        // Enviar mensaje
        await meta.sendWhatsAppMessage(formattedPhone, personalizedMsg);
        await new Promise(r => setTimeout(r, 500));

        // Guardar mensaje en conversation_history del lead para que SARA tenga contexto
        try {
          const { data: leadData } = await supabase.client
            .from('leads')
            .select('conversation_history')
            .eq('id', lead.id)
            .single();

          const historial = leadData?.conversation_history || [];
          historial.push({
            role: 'assistant',
            content: personalizedMsg,
            timestamp: new Date().toISOString(),
            type: 'promo'
          });

          await supabase.client
            .from('leads')
            .update({ conversation_history: historial.slice(-30) })
            .eq('id', lead.id);
        } catch (e) {
          console.log('Error guardando historial promo:', e);
        }

        // Enviar video
        if (body.send_video && promo.video_url) {
          if (promo.video_url.includes('youtube') || promo.video_url.includes('youtu.be')) {
            await meta.sendWhatsAppMessage(formattedPhone, promo.video_url);
          } else {
            await meta.sendWhatsAppVideo(formattedPhone, promo.video_url, 'Video');
          }
          await new Promise(r => setTimeout(r, 500));
        }

        // Enviar PDF/brochure
        if (body.send_pdf && promo.pdf_url) {
          if (promo.pdf_url.endsWith('.html')) {
            await meta.sendWhatsAppMessage(formattedPhone, promo.pdf_url);
          } else {
            await meta.sendWhatsAppDocument(formattedPhone, promo.pdf_url, promo.name + '.pdf');
          }
          await new Promise(r => setTimeout(r, 500));
        }

        sent++;
      } catch (err: any) {
        console.error('Error promo ' + lead.phone + ':', err.message);
        errors++;
      }
    }

    // 4. Actualizar contadores
    await supabase.client.from('promotions').update({
      total_reached: (promo.total_reached || 0) + sent,
      updated_at: new Date().toISOString()
    }).eq('id', promo.id);

    return corsResponse(JSON.stringify({
      success: true,
      sent,
      errors,
      total: leads.length,
      promotion: promo.name,
      segment: body.segment || 'individual',
      segment_type: body.segment_type || 'basic'
    }));
  }

  return null;
}
