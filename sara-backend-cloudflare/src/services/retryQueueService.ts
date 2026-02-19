import { SupabaseService } from './supabase';
import { MetaWhatsAppService } from './meta-whatsapp';
import { isRetryableError } from './retryService';

export interface RetryQueueEntry {
  id: string;
  recipient_phone: string;
  message_type: string;
  payload: Record<string, any>;
  context: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  status: string;
}

/**
 * Enqueue a failed Meta API message for later retry.
 * Only enqueues retryable errors (5xx, 429, network). Skips 400/401/403/404.
 * Must never throw — wrapped in try-catch.
 */
export async function enqueueFailedMessage(
  supabase: SupabaseService,
  recipientPhone: string,
  messageType: string,
  payload: Record<string, any>,
  context: string,
  errorMessage: string
): Promise<void> {
  try {
    // Build a synthetic error to check retryability
    const syntheticError: any = new Error(errorMessage);
    const statusMatch = errorMessage.match(/(\d{3})/);
    if (statusMatch) {
      syntheticError.status = parseInt(statusMatch[1]);
    }

    if (!isRetryableError(syntheticError)) {
      console.log(`⏭️ Retry queue: skipping non-retryable error (${errorMessage.substring(0, 80)})`);
      return;
    }

    await supabase.client.from('retry_queue').insert({
      recipient_phone: recipientPhone,
      message_type: messageType,
      payload,
      context: context?.substring(0, 200),
      last_error: errorMessage?.substring(0, 500),
      status: 'pending',
      attempts: 0,
      max_attempts: 3
    });

    console.log(`📥 Retry queue: enqueued ${messageType} to ${recipientPhone}`);
  } catch (err) {
    console.error('❌ Retry queue enqueue failed (silent):', (err as Error).message);
  }
}

/**
 * Process pending items in retry_queue.
 * Called from CRON every ~4 minutes.
 */
export async function processRetryQueue(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  devPhone: string
): Promise<{ processed: number; delivered: number; failedPermanent: number }> {
  const result = { processed: 0, delivered: 0, failedPermanent: 0 };

  const { data: pending, error } = await supabase.client
    .from('retry_queue')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', 3)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error || !pending || pending.length === 0) {
    return result;
  }

  for (const entry of pending) {
    result.processed++;
    const newAttempts = (entry.attempts || 0) + 1;

    try {
      // Re-send based on message_type
      switch (entry.message_type) {
        case 'text':
          await meta.sendWhatsAppMessage(entry.recipient_phone, entry.payload.body);
          break;
        case 'template':
          await meta.sendTemplate(
            entry.recipient_phone,
            entry.payload.templateName,
            entry.payload.languageCode || 'es_MX',
            entry.payload.components,
            true
          );
          break;
        case 'image':
          await meta.sendWhatsAppImage(entry.recipient_phone, entry.payload.imageUrl, entry.payload.caption);
          break;
        default:
          console.warn(`⚠️ Retry queue: unsupported message_type "${entry.message_type}"`);
          continue;
      }

      // Success
      await supabase.client
        .from('retry_queue')
        .update({ status: 'delivered', resolved_at: new Date().toISOString(), attempts: newAttempts, last_attempt_at: new Date().toISOString() })
        .eq('id', entry.id);
      result.delivered++;
      console.log(`✅ Retry queue: delivered ${entry.message_type} to ${entry.recipient_phone} (attempt ${newAttempts})`);

    } catch (sendError: any) {
      const errMsg = sendError?.message || String(sendError);

      if (newAttempts >= entry.max_attempts) {
        // Permanent failure
        await supabase.client
          .from('retry_queue')
          .update({ status: 'failed_permanent', resolved_at: new Date().toISOString(), attempts: newAttempts, last_attempt_at: new Date().toISOString(), last_error: errMsg.substring(0, 500) })
          .eq('id', entry.id);
        result.failedPermanent++;

        // Alert dev
        try {
          await meta.sendWhatsAppMessage(devPhone,
            `🚨 RETRY QUEUE: Mensaje falló permanentemente\n\n` +
            `📱 Destino: ${entry.recipient_phone}\n` +
            `📝 Tipo: ${entry.message_type}\n` +
            `❌ Error: ${errMsg.substring(0, 200)}\n` +
            `🔄 Intentos: ${newAttempts}/${entry.max_attempts}`
          );
        } catch (_) { /* silent */ }

        console.error(`❌ Retry queue: permanent failure for ${entry.recipient_phone} after ${newAttempts} attempts`);
      } else {
        // Update attempts, keep pending
        await supabase.client
          .from('retry_queue')
          .update({ attempts: newAttempts, last_attempt_at: new Date().toISOString(), last_error: errMsg.substring(0, 500) })
          .eq('id', entry.id);
      }
    }
  }

  if (result.processed > 0) {
    console.log(`📬 Retry queue: ${result.delivered} delivered, ${result.failedPermanent} failed of ${result.processed} processed`);
  }

  return result;
}
