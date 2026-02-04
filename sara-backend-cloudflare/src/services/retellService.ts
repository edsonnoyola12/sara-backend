// ═══════════════════════════════════════════════════════════════════════════
// RETELL.AI SERVICE - Llamadas Telefónicas con IA
// ═══════════════════════════════════════════════════════════════════════════
// Integración con Retell.ai para llamadas telefónicas automatizadas con IA
// SARA puede llamar a leads para seguimiento, calificación o recordatorios
// ═══════════════════════════════════════════════════════════════════════════

export interface CallContext {
  leadId: string;
  leadName: string;
  leadPhone: string;
  vendorId?: string;
  vendorName?: string;
  desarrolloInteres?: string;
  precioDesde?: string;
  motivo?: 'seguimiento' | 'calificacion' | 'recordatorio_cita' | 'encuesta';
  notas?: string;
}

export interface CallResult {
  success: boolean;
  callId?: string;
  status?: CallStatus;
  error?: string;
}

export type CallStatus =
  | 'registered'    // Llamada registrada
  | 'ongoing'       // En curso
  | 'ended'         // Finalizada
  | 'error';        // Error

export interface CallDetails {
  call_id: string;
  call_status: CallStatus;
  from_number: string;
  to_number: string;
  agent_id: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: TranscriptEntry[];
  call_analysis?: CallAnalysis;
  metadata?: Record<string, any>;
}

export interface TranscriptEntry {
  role: 'agent' | 'user';
  content: string;
  words?: { word: string; start: number; end: number }[];
}

export interface CallAnalysis {
  summary?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  user_sentiment?: string;
  call_successful?: boolean;
  custom_analysis?: Record<string, any>;
}

export interface RetellWebhookEvent {
  event: 'call_started' | 'call_ended' | 'call_analyzed';
  call: CallDetails;
}

export class RetellService {
  private apiKey: string;
  private agentId: string;
  private fromNumber: string;
  private baseUrl = 'https://api.retellai.com';

  constructor(apiKey: string, agentId: string, fromNumber: string) {
    this.apiKey = apiKey;
    this.agentId = agentId;
    this.fromNumber = fromNumber;
  }

  /**
   * Inicia una llamada telefónica a un lead
   */
  async initiateCall(context: CallContext): Promise<CallResult> {
    if (!this.apiKey || !this.agentId) {
      return {
        success: false,
        error: 'RETELL_API_KEY o RETELL_AGENT_ID no configurados'
      };
    }

    // Normalizar número de teléfono (formato internacional)
    const toNumber = this.normalizePhoneForCall(context.leadPhone);
    if (!toNumber) {
      return {
        success: false,
        error: 'Número de teléfono inválido'
      };
    }

    try {
      console.log(`📞 Retell: Iniciando llamada a ${toNumber} (lead: ${context.leadName})`);

      const response = await fetch(`${this.baseUrl}/v2/create-phone-call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_number: this.fromNumber,
          to_number: toNumber,
          agent_id: this.agentId,
          metadata: {
            lead_id: context.leadId,
            lead_name: context.leadName,
            vendor_id: context.vendorId,
            vendor_name: context.vendorName,
            desarrollo_interes: context.desarrolloInteres,
            motivo: context.motivo || 'seguimiento'
          },
          // Variables dinámicas para el agente
          retell_llm_dynamic_variables: {
            lead_name: context.leadName,
            desarrollo: context.desarrolloInteres || 'nuestros desarrollos',
            precio_desde: context.precioDesde || '$1.5 millones',
            vendedor_nombre: context.vendorName || 'un asesor',
            notas_adicionales: context.notas || ''
          }
        })
      });

      const data = await response.json() as any;

      if (!response.ok) {
        console.error('❌ Retell API error:', JSON.stringify(data));
        return {
          success: false,
          error: data.error?.message || data.message || `Error: ${response.status}`
        };
      }

      console.log(`✅ Retell: Llamada iniciada con ID ${data.call_id}`);

      return {
        success: true,
        callId: data.call_id,
        status: 'registered'
      };
    } catch (e) {
      console.error('❌ Retell error:', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Error desconocido'
      };
    }
  }

  /**
   * Obtiene los detalles de una llamada
   */
  async getCallDetails(callId: string): Promise<CallDetails | null> {
    if (!this.apiKey) {
      console.error('❌ RETELL_API_KEY no configurado');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/get-call/${callId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        console.error('❌ Retell error obteniendo llamada:', response.status);
        return null;
      }

      return await response.json() as CallDetails;
    } catch (e) {
      console.error('❌ Retell error:', e);
      return null;
    }
  }

  /**
   * Obtiene la transcripción de una llamada
   */
  async getCallTranscript(callId: string): Promise<TranscriptEntry[] | null> {
    const details = await this.getCallDetails(callId);
    return details?.transcript || null;
  }

  /**
   * Obtiene el resumen/análisis de una llamada
   */
  async getCallAnalysis(callId: string): Promise<CallAnalysis | null> {
    const details = await this.getCallDetails(callId);
    return details?.call_analysis || null;
  }

  /**
   * Lista llamadas recientes (últimas 24 horas)
   */
  async listRecentCalls(limit: number = 20): Promise<CallDetails[]> {
    if (!this.apiKey) {
      console.error('❌ RETELL_API_KEY no configurado');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/list-calls?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        console.error('❌ Retell error listando llamadas:', response.status);
        return [];
      }

      const data = await response.json() as CallDetails[];
      return data;
    } catch (e) {
      console.error('❌ Retell error:', e);
      return [];
    }
  }

  /**
   * Procesa un webhook de Retell
   * Retorna datos estructurados para guardar en la base de datos
   */
  processWebhookEvent(event: RetellWebhookEvent): {
    eventType: string;
    callId: string;
    leadPhone: string;
    duration?: number;
    transcript?: string;
    summary?: string;
    sentiment?: string;
    metadata?: Record<string, any>;
  } | null {
    const { call } = event;

    if (!call || !call.call_id) {
      console.error('❌ Retell webhook: evento inválido');
      return null;
    }

    // Formatear transcripción como texto
    let transcriptText = '';
    if (call.transcript && call.transcript.length > 0) {
      transcriptText = call.transcript
        .map(entry => `${entry.role === 'agent' ? 'SARA' : 'Cliente'}: ${entry.content}`)
        .join('\n');
    }

    return {
      eventType: event.event,
      callId: call.call_id,
      leadPhone: call.to_number,
      duration: call.duration_ms ? Math.round(call.duration_ms / 1000) : undefined,
      transcript: transcriptText || undefined,
      summary: call.call_analysis?.summary,
      sentiment: call.call_analysis?.sentiment,
      metadata: call.metadata
    };
  }

  /**
   * Normaliza número de teléfono para formato de llamada
   * Retell requiere formato E.164: +521234567890
   */
  private normalizePhoneForCall(phone: string): string | null {
    // Limpiar caracteres no numéricos excepto +
    let clean = phone.replace(/[^\d+]/g, '');

    // Si no tiene prefijo +, agregar
    if (!clean.startsWith('+')) {
      // Si es número mexicano (10 dígitos), agregar +52
      if (clean.length === 10) {
        clean = '+52' + clean;
      }
      // Si tiene 521 o 52 al inicio
      else if (clean.startsWith('521') || clean.startsWith('52')) {
        clean = '+' + clean;
      }
      // Asumir que ya tiene código de país
      else if (clean.length >= 11) {
        clean = '+' + clean;
      }
      else {
        return null;  // Número inválido
      }
    }

    // Validar longitud mínima
    if (clean.length < 11) {
      return null;
    }

    return clean;
  }

  /**
   * Verifica si el servicio está disponible
   */
  isAvailable(): boolean {
    return !!this.apiKey && !!this.agentId && !!this.fromNumber;
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createRetellService(
  apiKey: string,
  agentId: string,
  fromNumber: string
): RetellService {
  return new RetellService(apiKey, agentId, fromNumber);
}

/**
 * Genera un resumen corto para agregar como nota al lead
 */
export function generateCallNote(
  duration: number,
  summary?: string,
  sentiment?: string
): string {
  const durationMin = Math.round(duration / 60);
  let note = `📞 Llamada IA (${durationMin}min)`;

  if (sentiment) {
    const sentimentEmoji = {
      positive: '😊',
      negative: '😟',
      neutral: '😐'
    }[sentiment] || '';
    note += ` ${sentimentEmoji}`;
  }

  if (summary) {
    note += `: ${summary.substring(0, 200)}`;
    if (summary.length > 200) note += '...';
  }

  return note;
}
