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
  motivo?: string;
  notas?: string;
}

/**
 * Genera instrucciones específicas según el motivo de la llamada.
 * Esto permite que SARA adapte su tono y objetivo en cada llamada.
 */
export function getMotivoInstrucciones(motivo: string): string {
  const instrucciones: Record<string, string> = {
    // Pre-venta
    'seguimiento': 'Llamada de seguimiento. Objetivo: saber si el cliente tiene dudas y agendar visita. Tono amigable y consultivo.',
    'calificacion': 'Llamada de calificación. Objetivo: entender necesidades (zona, recámaras, presupuesto) y recomendar desarrollo. Tono profesional.',
    'recordatorio_cita': 'Recordatorio de cita. Objetivo: confirmar que asistirá a su cita. Sé breve: "Solo te llamo para confirmar tu cita de mañana a las X. ¿Todo bien?" Si cancela, ofrece reagendar.',
    'encuesta': 'Encuesta de satisfacción. Objetivo: preguntar qué tal su experiencia. Tono cálido y agradecido.',

    // Post-venta (escalamiento desde WhatsApp sin respuesta)
    'seguimiento_entrega': 'Seguimiento post-entrega. El cliente recibió su casa hace pocos días. Pregunta si todo está bien: llaves, escrituras, servicios (agua, luz, gas). Si reporta algún problema, dile que lo registras y que su asesor le da seguimiento.',
    'satisfaccion': 'Encuesta de satisfacción de casa. Pregunta: "Del 1 al 4, ¿cómo calificarías tu experiencia con tu nueva casa? 1 excelente, 2 buena, 3 regular, 4 mala." Si dice 3 o 4, pregunta qué se puede mejorar.',
    'encuesta_nps': 'Encuesta NPS. Pregunta: "Del 0 al 10, ¿qué tan probable es que nos recomiendes con un familiar o amigo?" Agradece su respuesta. Si dice 9 o 10, pregunta si conoce a alguien que busque casa.',
    'referidos': 'Solicitud de referidos. El cliente compró hace 1-3 meses. Tono: "Esperamos que estés disfrutando tu nueva casa. ¿Conoces a algún familiar o amigo que busque casa? Con gusto lo atendemos."',
    'checkin_postventa': 'Check-in 2 meses post-compra. Tono cálido: "Solo llamo para saber cómo va todo con tu casa. ¿Todo en orden? ¿Necesitas algo?" Breve y amigable.',
    'mantenimiento': 'Recordatorio de mantenimiento preventivo. Ya pasó ~1 año desde la entrega. "Te llamo para recordarte que es buen momento para revisar impermeabilización, pintura exterior y servicios. ¿Necesitas apoyo con algo?"',

    // Otros
    'timeout_30min': 'Seguimiento de bridge expirado. El chat directo con el vendedor terminó. Pregunta si quedó alguna duda pendiente.',
  };
  return instrucciones[motivo] || instrucciones['seguimiento'];
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
            call_direction: 'outbound',
            lead_name: context.leadName || '',
            is_new_lead: (!context.leadName || context.leadName === 'Cliente' || context.leadName === 'Cliente Test') ? 'true' : 'false',
            greeting: this.buildGreeting(context),
            desarrollo: context.desarrolloInteres || 'nuestros desarrollos',
            desarrollo_interes: context.desarrolloInteres || '',
            precio_desde: context.precioDesde || '',
            vendedor_nombre: context.vendorName || 'un asesor',
            notas_adicionales: context.notas || '',
            source: context.notas || 'WhatsApp',
            motivo: context.motivo || 'seguimiento',
            motivo_instrucciones: getMotivoInstrucciones(context.motivo || 'seguimiento')
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
   * Retell requiere formato E.164: +52XXXXXXXXXX (12 dígitos para México)
   *
   * IMPORTANTE: Números mexicanos NO deben tener el prefijo "1" para móviles
   * - Incorrecto: +5214921226111 (13 dígitos)
   * - Correcto: +524921226111 (12 dígitos)
   */
  private normalizePhoneForCall(phone: string): string | null {
    // Limpiar caracteres no numéricos excepto +
    let clean = phone.replace(/[^\d+]/g, '');

    // Quitar el + inicial si existe para procesar
    if (clean.startsWith('+')) {
      clean = clean.substring(1);
    }

    // Si empieza con 521 (código México + prefijo móvil antiguo), quitar el 1
    // Ejemplo: 5214921226111 → 524921226111
    if (clean.startsWith('521') && clean.length === 13) {
      clean = '52' + clean.substring(3); // Quitar el "1" después de "52"
    }

    // Si es número mexicano de 10 dígitos (sin código de país), agregar 52
    if (clean.length === 10) {
      clean = '52' + clean;
    }

    // Si empieza con 52 y tiene 12 dígitos, está bien
    // Si no empieza con 52, verificar si es otro formato válido
    if (!clean.startsWith('52')) {
      // Podría ser otro país, asumir que está bien si tiene al menos 10 dígitos
      if (clean.length < 10) {
        return null;
      }
    }

    // Agregar el + al inicio
    clean = '+' + clean;

    // Validar longitud: mínimo +52XXXXXXXXXX (12 dígitos sin +)
    if (clean.length < 12) {
      return null;
    }

    console.log(`   📱 Número normalizado: ${phone} → ${clean}`);
    return clean;
  }

  /**
   * Genera el saludo inicial personalizado para la llamada
   * Si conocemos al lead → confirma nombre y menciona desarrollo
   * Si NO conocemos al lead → pide el nombre primero
   */
  private buildGreeting(context: CallContext): string {
    const nombre = context.leadName;
    const esNuevo = !nombre || nombre === 'Cliente' || nombre === 'Cliente Test';

    if (esNuevo) {
      // Lead desconocido → presentarse con valor + pedir nombre
      return '¡Hola! Soy Sara de Grupo Santa Rita. Te llamo para apoyarte en tu búsqueda de casa. ¿Con quién tengo el gusto?';
    }

    // Lead conocido → confirmar nombre + explicar propósito
    const primerNombre = nombre.split(' ')[0];
    if (context.desarrolloInteres) {
      return `¡Hola! ¿Hablo con ${primerNombre}? Soy Sara de Grupo Santa Rita. Te llamo para apoyarte con tu interés en ${context.desarrolloInteres} y resolver cualquier duda que tengas. ¿Tienes un minutito?`;
    }
    return `¡Hola! ¿Hablo con ${primerNombre}? Soy Sara de Grupo Santa Rita. Te llamo para apoyarte en tu búsqueda de casa — ya sea con información, crédito o agendar una visita. ¿Tienes un minutito?`;
  }

  /**
   * Lista los números de teléfono configurados en Retell
   */
  async listPhoneNumbers(): Promise<any[]> {
    if (!this.apiKey) {
      console.error('❌ RETELL_API_KEY no configurado');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/list-phone-numbers`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (!response.ok) {
        console.error('❌ Retell error listando teléfonos:', response.status);
        return [];
      }

      return await response.json() as any[];
    } catch (e) {
      console.error('❌ Retell error:', e);
      return [];
    }
  }

  /**
   * Obtiene detalles de un número de teléfono
   * @param phoneNumber - E.164 format: +524923860066
   */
  async getPhoneNumber(phoneNumber: string): Promise<any> {
    if (!this.apiKey) return null;

    try {
      const encoded = encodeURIComponent(phoneNumber);
      const response = await fetch(`${this.baseUrl}/get-phone-number/${encoded}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      console.error('❌ Retell error:', e);
      return null;
    }
  }

  /**
   * Configura un número de teléfono para recibir llamadas entrantes
   * @param phoneNumber - E.164 format: +524923860066
   */
  async configureInbound(phoneNumber: string, agentId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'RETELL_API_KEY no configurado' };
    }

    try {
      const encoded = encodeURIComponent(phoneNumber);
      const response = await fetch(`${this.baseUrl}/update-phone-number/${encoded}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inbound_agent_id: agentId || this.agentId,
          inbound_webhook_url: 'https://sara-backend.edson-633.workers.dev/webhook/retell/lookup',
        })
      });

      const data = await response.json() as any;

      if (!response.ok) {
        console.error('❌ Retell error configurando inbound:', JSON.stringify(data));
        return { success: false, error: data.error?.message || data.message || `Error: ${response.status}` };
      }

      console.log(`✅ Retell: Inbound configurado para ${phoneNumber} con agente ${agentId || this.agentId}`);
      return { success: true, data };
    } catch (e) {
      console.error('❌ Retell error:', e);
      return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
  }

  /**
   * Actualiza configuración del agente (begin_message, voice, etc.)
   */
  async updateAgent(agentId: string, updates: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'RETELL_API_KEY no configurado' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/update-agent/${agentId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json() as any;
      if (!response.ok) {
        console.error('❌ Retell error actualizando agente:', JSON.stringify(data));
        return { success: false, error: data.error?.message || data.message || `Error: ${response.status}` };
      }
      console.log(`✅ Retell: Agente ${agentId} actualizado`);
      return { success: true, data };
    } catch (e) {
      console.error('❌ Retell error:', e);
      return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
  }

  /**
   * Obtiene detalles de un agente (incluye llm_id)
   */
  async getAgent(agentId?: string): Promise<any> {
    if (!this.apiKey) return null;
    try {
      const id = agentId || this.agentId;
      const response = await fetch(`${this.baseUrl}/get-agent/${id}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!response.ok) {
        console.error('❌ Retell error obteniendo agente:', response.status);
        return null;
      }
      return await response.json();
    } catch (e) {
      console.error('❌ Retell error:', e);
      return null;
    }
  }

  /**
   * Obtiene detalles de un LLM (incluye general_tools)
   */
  async getLlm(llmId: string): Promise<any> {
    if (!this.apiKey) return null;
    try {
      const response = await fetch(`${this.baseUrl}/get-retell-llm/${llmId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!response.ok) {
        console.error('❌ Retell error obteniendo LLM:', response.status);
        return null;
      }
      return await response.json();
    } catch (e) {
      console.error('❌ Retell error:', e);
      return null;
    }
  }

  /**
   * Actualiza un LLM (tools, prompt, etc.)
   * IMPORTANTE: Cada campo enviado reemplaza el existente
   */
  async updateLlm(llmId: string, updates: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'RETELL_API_KEY no configurado' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/update-retell-llm/${llmId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json() as any;
      if (!response.ok) {
        console.error('❌ Retell error actualizando LLM:', JSON.stringify(data));
        return { success: false, error: data.error?.message || data.message || `Error: ${response.status}` };
      }
      console.log(`✅ Retell: LLM ${llmId} actualizado`);
      return { success: true, data };
    } catch (e) {
      console.error('❌ Retell error:', e);
      return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
  }

  /**
   * Actualiza las tools de un LLM
   * IMPORTANTE: Reemplaza todo el array general_tools
   */
  async updateLlmTools(llmId: string, tools: any[]): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'RETELL_API_KEY no configurado' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/update-retell-llm/${llmId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ general_tools: tools })
      });
      const data = await response.json() as any;
      if (!response.ok) {
        console.error('❌ Retell error actualizando LLM tools:', JSON.stringify(data));
        return { success: false, error: data.error?.message || data.message || `Error: ${response.status}` };
      }
      console.log(`✅ Retell: LLM ${llmId} actualizado con ${tools.length} tools`);
      return { success: true, data };
    } catch (e) {
      console.error('❌ Retell error:', e);
      return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
  }

  /**
   * Obtiene info de concurrencia de la cuenta (límites de llamadas simultáneas)
   */
  async getConcurrency(): Promise<any> {
    if (!this.apiKey) return null;
    try {
      const response = await fetch(`${this.baseUrl}/get-concurrency`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!response.ok) return { error: `HTTP ${response.status}` };
      return await response.json();
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error' };
    }
  }

  /**
   * Publica la versión draft del agente (la hace inmutable y crea nueva draft)
   */
  async publishAgent(agentId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.apiKey) return { success: false, error: 'No API key' };
    try {
      const id = agentId || this.agentId;
      const response = await fetch(`${this.baseUrl}/publish-agent/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!response.ok) {
        const data = await response.json() as any;
        return { success: false, error: data.message || `HTTP ${response.status}` };
      }
      const data = await response.json() as any;
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }

  /**
   * Lista las voces disponibles en Retell (filtra por idioma si se especifica)
   */
  async listVoices(): Promise<any[]> {
    if (!this.apiKey) return [];
    try {
      const response = await fetch(`${this.baseUrl}/list-voices`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!response.ok) {
        console.error('❌ Retell error listando voces:', response.status);
        return [];
      }
      return await response.json() as any[];
    } catch (e) {
      console.error('❌ Retell error:', e);
      return [];
    }
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
