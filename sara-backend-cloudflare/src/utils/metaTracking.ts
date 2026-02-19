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

  return meta;
}
