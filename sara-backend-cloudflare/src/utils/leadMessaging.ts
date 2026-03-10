/**
 * ===============================================================================
 * UTILIDADES PARA ENVIO DE MENSAJES A LEADS
 * Respeta ventana 24h de WhatsApp: directo si abierta, template si cerrada
 * Guarda pending_auto_response para entrega contextual cuando el lead responda
 * ===============================================================================
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { safeJsonParse } from './safeHelpers';

// ===============================================================================
// TIPOS
// ===============================================================================

export interface EnviarMensajeLeadResult {
  sent: boolean;
  method: 'direct' | 'template' | 'pending' | 'skipped';
  messageId?: string;
  error?: string;
}

export interface LeadForMessaging {
  id: string;
  phone: string;
  name?: string | null;
  notes?: any;
  last_message_at?: string | null;
}

export interface EnviarMensajeLeadOptions {
  templateName?: string;        // Template to use if outside 24h window (default: 'seguimiento_lead')
  templateLang?: string;        // Template language (default: 'es_MX')
  templateComponents?: any[];   // Template components
  pendingKey?: string;          // Key to save in notes for when lead responds (default: 'pending_auto_response')
  pendingContext?: any;         // Context to save with the pending (e.g. { tipo: 'nps', mensaje: '...' })
  skipIfOutsideWindow?: boolean; // If true, don't send template, just skip (default: false)
}

// ===============================================================================
// HELPERS
// ===============================================================================

/**
 * Checks if a lead's last message is within the WhatsApp 24h window.
 * Returns true if the lead messaged within the last 24 hours.
 */
export function isWithin24hWindow(lastMessageAt: string | null | undefined): boolean {
  if (!lastMessageAt) return false;

  try {
    const lastMsg = new Date(lastMessageAt).getTime();
    if (isNaN(lastMsg)) return false;

    const hace24h = Date.now() - 24 * 60 * 60 * 1000;
    return lastMsg > hace24h;
  } catch {
    return false;
  }
}

// ===============================================================================
// FUNCION PRINCIPAL
// ===============================================================================

/**
 * Envia mensaje a un lead respetando la ventana de 24h de WhatsApp.
 *
 * FLUJO:
 * 1. Si la ventana esta abierta (lead escribio en <24h) -> envio directo
 * 2. Si la ventana esta cerrada y skipIfOutsideWindow=true -> skip
 * 3. Si la ventana esta cerrada y hay template -> enviar template + guardar pending
 * 4. Si la ventana esta cerrada y NO hay template -> solo guardar pending
 *
 * SIEMPRE hace fresh read de notes antes de escribir (prevencion race condition JSONB).
 */
export async function enviarMensajeLead(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: LeadForMessaging,
  mensaje: string,
  options?: EnviarMensajeLeadOptions
): Promise<EnviarMensajeLeadResult> {
  const {
    templateName = 'seguimiento_lead',
    templateLang = 'es_MX',
    templateComponents,
    pendingKey = 'pending_auto_response',
    pendingContext,
    skipIfOutsideWindow = false,
  } = options || {};

  const leadLabel = `${lead.name || 'Sin nombre'} (${lead.phone})`;

  try {
    // 1. Verificar ventana 24h
    const ventanaAbierta = isWithin24hWindow(lead.last_message_at);

    console.log(`📬 [leadMsg] ${leadLabel}: ventana ${ventanaAbierta ? '✅ ABIERTA' : '❌ CERRADA'}`);

    // ─── VENTANA ABIERTA: envio directo ───
    if (ventanaAbierta) {
      try {
        const sendResult = await meta.sendWhatsAppMessage(lead.phone, mensaje);
        const wamid = sendResult?.messages?.[0]?.id;

        console.log(`   ✅ Enviado DIRECTO a ${leadLabel} (wamid: ${wamid?.substring(0, 20) || 'n/a'})`);

        return { sent: true, method: 'direct', messageId: wamid };
      } catch (directError: any) {
        console.log(`   ⚠️ Envio directo fallo para ${leadLabel}: ${directError?.message}`);
        // Directo fallo — tratarlo como ventana cerrada y usar template como fallback
      }
    }

    // ─── VENTANA CERRADA (o directo fallo) ───

    // 2. Si skipIfOutsideWindow, no enviar nada
    if (skipIfOutsideWindow) {
      console.log(`   ⏭️ Skip: ${leadLabel} fuera de ventana 24h (skipIfOutsideWindow=true)`);
      return { sent: false, method: 'skipped' };
    }

    // 3. Intentar enviar template si hay uno disponible
    let templateSent = false;
    let templateWamid: string | undefined;

    try {
      const components = templateComponents || [];
      const templateResult = await meta.sendTemplate(lead.phone, templateName, templateLang, components);
      templateWamid = templateResult?.messages?.[0]?.id;
      templateSent = true;

      console.log(`   📨 Template '${templateName}' enviado a ${leadLabel} (wamid: ${templateWamid?.substring(0, 20) || 'n/a'})`);
    } catch (templateError: any) {
      console.log(`   ⚠️ Template '${templateName}' fallo para ${leadLabel}: ${templateError?.message}`);
      // Template fallo — guardar como pending de todas formas
    }

    // 4. Guardar mensaje como pending en notes (fresh read para evitar JSONB race condition)
    try {
      await guardarPendingLead(supabase, lead.id, pendingKey, mensaje, pendingContext, templateWamid);
    } catch (pendingError: any) {
      console.error(`   ❌ Error guardando pending para ${leadLabel}: ${pendingError?.message}`);
      // Si ni el template ni el pending se guardaron, reportar fallo
      if (!templateSent) {
        return { sent: false, method: 'pending', error: `Template y pending fallaron: ${pendingError?.message}` };
      }
    }

    if (templateSent) {
      return { sent: true, method: 'template', messageId: templateWamid };
    }

    // Template fallo pero pending se guardo — el lead recibira el mensaje cuando escriba
    console.log(`   💾 ${leadLabel}: mensaje guardado como pending (se entregara cuando responda)`);
    return { sent: false, method: 'pending' };

  } catch (error: any) {
    console.error(`❌ Error en enviarMensajeLead para ${leadLabel}:`, error);
    return { sent: false, method: 'skipped', error: error?.message || 'Error desconocido' };
  }
}

// ===============================================================================
// HELPER INTERNO: Guardar pending en notes del lead
// ===============================================================================

/**
 * Guarda un mensaje como pending_auto_response en las notes del lead.
 * SIEMPRE re-lee notes de la DB antes de escribir para evitar JSONB race conditions.
 */
async function guardarPendingLead(
  supabase: SupabaseService,
  leadId: string,
  pendingKey: string,
  mensaje: string,
  pendingContext?: any,
  wamid?: string
): Promise<void> {
  // FRESH READ: Siempre re-leer notes de DB para evitar race condition
  const { data: freshLead, error: readError } = await supabase.client
    .from('leads')
    .select('notes')
    .eq('id', leadId)
    .single();

  if (readError) {
    console.error(`   ⚠️ Error leyendo notes frescas del lead ${leadId}:`, readError.message);
  }

  const notasActuales = safeJsonParse(freshLead?.notes);

  const ahora = new Date();

  const nuevasNotas = {
    ...notasActuales,
    [pendingKey]: {
      sent_at: ahora.toISOString(),
      mensaje,
      wamid: wamid || null,
      ...(pendingContext ? { context: pendingContext } : {}),
    }
  };

  const { error: writeError } = await supabase.client
    .from('leads')
    .update({ notes: nuevasNotas })
    .eq('id', leadId);

  if (writeError) {
    console.error(`   ⚠️ Error escribiendo pending en notes del lead ${leadId}:`, writeError.message);
    throw new Error(`Failed to save ${pendingKey}: ${writeError.message}`);
  }

  console.log(`   💾 Pending '${pendingKey}' guardado para lead ${leadId}${pendingContext?.tipo ? ` (tipo: ${pendingContext.tipo})` : ''}${wamid ? `, wamid: ${wamid.substring(0, 15)}...` : ''}`);
}
