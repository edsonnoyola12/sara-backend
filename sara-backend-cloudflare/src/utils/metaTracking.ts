import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { SupabaseService } from '../services/supabase';
import { createMessageTrackingService } from '../services/messageTrackingService';
import { enqueueFailedMessage } from '../services/retryQueueService';

export async function createMetaWithTracking(env: any, supabase: SupabaseService): Promise<MetaWhatsAppService> {
  const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

  // Pre-cargar team member phones para auto-detectar recipientType
  const { data: teamMembers } = await supabase.client
    .from('team_members')
    .select('id, name, phone')
    .eq('active', true);

  const tmPhoneMap = new Map<string, { id: string; name: string }>();
  for (const tm of teamMembers || []) {
    if (tm.phone) {
      tmPhoneMap.set(tm.phone.slice(-10), { id: tm.id, name: tm.name });
    }
  }

  // Configurar tracking automático de mensajes con auto-detect recipientType
  const msgTracking = createMessageTrackingService(supabase);
  meta.setTrackingCallback(async (data) => {
    const phoneSuffix = data.recipientPhone.slice(-10);
    const tm = tmPhoneMap.get(phoneSuffix);

    await msgTracking.logMessageSent({
      messageId: data.messageId,
      recipientPhone: data.recipientPhone,
      recipientType: tm ? 'team_member' : 'lead',
      recipientId: tm?.id,
      recipientName: tm?.name,
      messageType: data.messageType,
      categoria: data.categoria,
      contenido: data.contenido
    });
  });

  // Configurar callback para mensajes fallidos → retry queue
  meta.setFailedMessageCallback(async (data) => {
    await enqueueFailedMessage(
      supabase,
      data.recipientPhone,
      data.messageType,
      data.payload,
      data.context,
      data.errorMessage
    );
  });

  // Configurar KV para rate limiting global de Meta API
  if (env.SARA_CACHE) {
    meta.setKVNamespace(env.SARA_CACHE);
  }

  // Configurar teléfono de admin para alertas de sistema
  if (env.DEV_PHONE) {
    meta.setAdminPhone(env.DEV_PHONE);
  }

  // Configurar callback para encolar mensajes cuando se excede el rate limit global
  meta.setRateLimitEnqueueCallback(async (data) => {
    await enqueueFailedMessage(
      supabase,
      data.recipientPhone,
      data.messageType,
      data.payload,
      data.context,
      'RATE_LIMIT: Global Meta API rate limit exceeded (75/min)'
    );
  });

  // Configurar callback para ventana 24h cerrada (131047)
  // Detecta si es team member o lead y envía template apropiado + guarda pending
  meta.setWindowClosedCallback(async ({ recipientPhone, originalMessage, meta: metaSvc }) => {
    const phoneSuffix = recipientPhone.slice(-10);
    const tm = tmPhoneMap.get(phoneSuffix);

    if (tm) {
      // ── TEAM MEMBER → resumen_vendedor template + pending ──
      const nombreCorto = tm.name?.split(' ')[0] || 'Equipo';
      try {
        const result = await metaSvc.sendTemplate(recipientPhone, 'resumen_vendedor', 'es_MX', [{
          type: 'body',
          parameters: [
            { type: 'text', text: nombreCorto },
            { type: 'text', text: '-' },
            { type: 'text', text: '-' },
            { type: 'text', text: '-' },
            { type: 'text', text: '-' },
            { type: 'text', text: 'Responde para ver tu mensaje.' }
          ]
        }], true);
        const msgId = result?.messages?.[0]?.id;

        // Guardar mensaje original como pending
        try {
          const { data: tmData } = await supabase.client
            .from('team_members')
            .select('notes')
            .eq('id', tm.id)
            .single();
          const notes = (tmData?.notes && typeof tmData.notes === 'object') ? { ...tmData.notes } : {};
          notes.pending_mensaje = {
            texto: originalMessage.substring(0, 2000),
            timestamp: new Date().toISOString(),
            expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
          };
          await supabase.client.from('team_members').update({ notes }).eq('id', tm.id);
        } catch (e) { console.error('⚠️ Error guardando pending para team member:', (e as Error).message); }

        console.log(`📱 131047 recovery: template resumen_vendedor → ${tm.name}`);
        return { sent: true, method: 'template_resumen_vendedor', messageId: msgId };
      } catch (templateErr) {
        console.error(`❌ Template resumen_vendedor falló para ${tm.name}:`, (templateErr as Error).message);
        return { sent: false, method: 'failed' };
      }
    } else {
      // ── LEAD → seguimiento_lead template + pending ──
      try {
        // Buscar lead por teléfono para obtener nombre y guardar pending
        const { data: leads } = await supabase.client
          .from('leads')
          .select('id, name, notes, property_interest')
          .like('phone', `%${phoneSuffix}`)
          .limit(1);
        const lead = leads?.[0];
        const nombreCorto = lead?.name?.split(' ')[0] || 'Amigo';
        const desarrollo = lead?.property_interest || 'nuestros desarrollos';

        const result = await metaSvc.sendTemplate(recipientPhone, 'seguimiento_lead', 'es_MX', [{
          type: 'body',
          parameters: [
            { type: 'text', text: nombreCorto },
            { type: 'text', text: desarrollo }
          ]
        }], true);
        const msgId = result?.messages?.[0]?.id;

        // Guardar mensaje original como pending en notes del lead
        if (lead?.id) {
          try {
            const notes = (lead.notes && typeof lead.notes === 'object') ? { ...lead.notes } : {};
            notes.pending_mensaje = {
              texto: originalMessage.substring(0, 2000),
              timestamp: new Date().toISOString(),
              expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
            };
            await supabase.client.from('leads').update({ notes }).eq('id', lead.id);
          } catch (e) { console.error('⚠️ Error guardando pending para lead:', (e as Error).message); }
        }

        console.log(`📱 131047 recovery: template seguimiento_lead → ${nombreCorto} (${phoneSuffix})`);
        return { sent: true, method: 'template_seguimiento_lead', messageId: msgId };
      } catch (templateErr) {
        console.error(`❌ Template seguimiento_lead falló para ${phoneSuffix}:`, (templateErr as Error).message);
        return { sent: false, method: 'failed' };
      }
    }
  });

  return meta;
}
