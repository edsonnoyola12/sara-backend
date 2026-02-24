/**
 * Lead Scoring, Hot Lead Detection y Objection Handling
 * Extraído de index.ts en Fase 4 de refactorización
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { createTTSService } from '../services/ttsService';
import { createTTSTrackingService } from '../services/ttsTrackingService';
import { formatPhoneForDisplay } from '../handlers/whatsapp-utils';
import { logErrorToDB } from './healthCheck';

// ═══════════════════════════════════════════════════════════
// DETECCIÓN DE LEADS CALIENTES
// Analiza mensajes para detectar señales de compra y alertar al vendedor
// ═══════════════════════════════════════════════════════════
export interface HotLeadSignal {
  tipo: string;
  intensidad: 'media' | 'alta' | 'muy_alta';
  keywords: string[];
}

export function detectarSeñalesCalientes(mensaje: string): HotLeadSignal[] {
  const msgLower = mensaje.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const señales: HotLeadSignal[] = [];

  // Señales de PRECIO (alta intención)
  const precioPatterns = [
    /cuanto (cuesta|vale|es)/i, /precio/i, /costo/i, /cotiza/i,
    /que precio/i, /cuanto saldria/i, /a cuanto/i, /valor/i
  ];
  if (precioPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'precio', intensidad: 'alta', keywords: ['precio', 'costo', 'cotización'] });
  }

  // Señales de CRÉDITO (alta intención)
  const creditoPatterns = [
    /credito/i, /hipoteca/i, /infonavit/i, /fovissste/i,
    /financiamiento/i, /prestamo/i, /banco/i, /mensualidad/i
  ];
  if (creditoPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'credito', intensidad: 'alta', keywords: ['crédito', 'hipoteca', 'financiamiento'] });
  }

  // Señales de VISITA (muy alta intención)
  const visitaPatterns = [
    /quiero (ver|visitar|conocer)/i, /cuando puedo (ir|visitar)/i,
    /agendar (cita|visita)/i, /recorrido/i, /mostrar/i,
    /quisiera (ver|conocer|visitar)/i, /me gustaria (ver|visitar)/i
  ];
  if (visitaPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'visita', intensidad: 'muy_alta', keywords: ['visita', 'cita', 'recorrido'] });
  }

  // Señales de ENGANCHE/APARTADO (muy alta intención)
  const apartadoPatterns = [
    /enganche/i, /apartado/i, /apartar/i, /reservar/i,
    /cuanto (necesito|ocupo) para/i, /pago inicial/i
  ];
  if (apartadoPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'apartado', intensidad: 'muy_alta', keywords: ['enganche', 'apartado', 'reservar'] });
  }

  // Señales de URGENCIA (muy alta intención)
  const urgenciaPatterns = [
    /urgente/i, /lo mas pronto/i, /cuanto antes/i, /rapido/i,
    /necesito (ya|pronto|hoy)/i, /de inmediato/i, /esta semana/i
  ];
  if (urgenciaPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'urgencia', intensidad: 'muy_alta', keywords: ['urgente', 'pronto', 'inmediato'] });
  }

  // Señales de DECISIÓN (muy alta intención)
  const decisionPatterns = [
    /quiero comprar/i, /voy a comprar/i, /me decid/i, /estoy listo/i,
    /me interesa (mucho|bastante)/i, /es justo lo que busco/i, /perfecto/i,
    /lo quiero/i, /me lo llevo/i
  ];
  if (decisionPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'decision', intensidad: 'muy_alta', keywords: ['comprar', 'decidido', 'listo'] });
  }

  // Señales de DISPONIBILIDAD (media intención)
  const dispPatterns = [
    /disponib/i, /hay (casas|lotes|terrenos)/i, /quedan/i,
    /todavia hay/i, /aun tienen/i
  ];
  if (dispPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'disponibilidad', intensidad: 'media', keywords: ['disponible', 'quedan'] });
  }

  return señales;
}

// ═══════════════════════════════════════════════════════════
// LEAD SCORING AUTOMÁTICO
// Calcula score basado en señales, comportamiento e interacciones
// ═══════════════════════════════════════════════════════════
export interface LeadScoreFactors {
  statusScore: number;
  interactionScore: number;
  hotSignalsScore: number;
  recencyScore: number;
  creditReadyScore: number;
  engagementScore: number;
}

export function calcularLeadScore(lead: any): { score: number; factors: LeadScoreFactors; categoria: string } {
  const notas = typeof lead.notes === 'object' ? lead.notes : {};
  let factors: LeadScoreFactors = {
    statusScore: 0,
    interactionScore: 0,
    hotSignalsScore: 0,
    recencyScore: 0,
    creditReadyScore: 0,
    engagementScore: 0
  };

  // 1. SCORE POR STATUS (0-30 puntos)
  const statusScores: Record<string, number> = {
    'new': 5,
    'contacted': 10,
    'qualified': 15,
    'appointment_scheduled': 20,
    'visited': 25,
    'negotiation': 28,
    'reserved': 30,
    'credit_qualified': 22,
    'pre_approved': 25,
    'approved': 28,
    'sold': 30,
    'closed': 30,
    'delivered': 30,
    'cold': 2,
    'lost': 0,
    'fallen': 0
  };
  factors.statusScore = statusScores[lead.status] || 5;

  // 2. SCORE POR INTERACCIONES (0-20 puntos)
  // Basado en historial de actividades si existe
  const historialCaliente = (notas as any)?.historial_señales_calientes || [];
  const numInteracciones = historialCaliente.length;
  factors.interactionScore = Math.min(numInteracciones * 4, 20);

  // 3. SCORE POR SEÑALES CALIENTES (0-25 puntos)
  if (historialCaliente.length > 0) {
    const ultimaSenal = historialCaliente[historialCaliente.length - 1];
    const intensidadScores: Record<string, number> = {
      'muy_alta': 25,
      'alta': 15,
      'media': 8
    };
    factors.hotSignalsScore = intensidadScores[ultimaSenal?.intensidad] || 0;

    // Bonus por múltiples tipos de señales
    const tiposUnicos = new Set(historialCaliente.flatMap((h: any) => h.señales || []));
    factors.hotSignalsScore = Math.min(factors.hotSignalsScore + tiposUnicos.size * 2, 25);
  }

  // 4. SCORE POR RECENCIA (0-15 puntos)
  const ahora = new Date();
  const ultimaActualizacion = lead.updated_at ? new Date(lead.updated_at) : new Date(lead.created_at);
  const diasSinActividad = Math.floor((ahora.getTime() - ultimaActualizacion.getTime()) / (1000 * 60 * 60 * 24));

  if (diasSinActividad === 0) factors.recencyScore = 15;
  else if (diasSinActividad === 1) factors.recencyScore = 12;
  else if (diasSinActividad <= 3) factors.recencyScore = 10;
  else if (diasSinActividad <= 7) factors.recencyScore = 6;
  else if (diasSinActividad <= 14) factors.recencyScore = 3;
  else factors.recencyScore = 0;

  // 5. SCORE POR PREPARACIÓN DE CRÉDITO (0-10 puntos)
  const creditContext = (notas as any)?.credit_flow_context;
  if (creditContext) {
    if (creditContext.pre_approved || lead.credit_status === 'pre_approved') {
      factors.creditReadyScore = 10;
    } else if (creditContext.capacidad_credito) {
      factors.creditReadyScore = 8;
    } else if (creditContext.step && creditContext.step !== 'asking_employment') {
      factors.creditReadyScore = 5;
    } else {
      factors.creditReadyScore = 3;
    }
  }
  if (lead.needs_mortgage === false) {
    factors.creditReadyScore = 10; // Pago de contado = máximo score
  }

  // 5.5 BONUS/PENALTY POR FEEDBACK POST-VISITA (dentro de hotSignalsScore)
  if ((notas as any)?.vendor_feedback?.rating) {
    const rating = (notas as any).vendor_feedback.rating;
    if (rating === 1) factors.hotSignalsScore = Math.min(factors.hotSignalsScore + 10, 25);
    else if (rating === 2) factors.hotSignalsScore = Math.min(factors.hotSignalsScore + 5, 25);
    else if (rating === 4) factors.hotSignalsScore = Math.max(factors.hotSignalsScore - 5, 0);
  }

  // 6. SCORE POR ENGAGEMENT (0-10 puntos)
  // Respuestas a mensajes, citas agendadas, etc.
  if ((notas as any)?.pending_response_to) factors.engagementScore += 3;
  if ((notas as any)?.appointment_scheduled) factors.engagementScore += 4;
  if ((notas as any)?.active_bridge_to_vendedor) factors.engagementScore += 3;
  if (lead.property_interest) factors.engagementScore += 2;
  factors.engagementScore = Math.min(factors.engagementScore, 10);

  // CALCULAR SCORE TOTAL (0-100)
  const totalScore =
    factors.statusScore +
    factors.interactionScore +
    factors.hotSignalsScore +
    factors.recencyScore +
    factors.creditReadyScore +
    factors.engagementScore;

  // DETERMINAR CATEGORÍA
  let categoria: string;
  if (totalScore >= 80) categoria = 'HOT';
  else if (totalScore >= 60) categoria = 'WARM';
  else if (totalScore >= 40) categoria = 'LUKEWARM';
  else if (totalScore >= 20) categoria = 'COLD';
  else categoria = 'FROZEN';

  return { score: Math.min(totalScore, 100), factors, categoria };
}

export async function alertarLeadCaliente(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string,
  señales: HotLeadSignal[],
  options?: { openaiApiKey?: string }
): Promise<void> {
  try {
    if (señales.length === 0) return;

    // Determinar intensidad máxima
    const intensidadMax = señales.some(s => s.intensidad === 'muy_alta') ? 'muy_alta' :
                          señales.some(s => s.intensidad === 'alta') ? 'alta' : 'media';

    // Solo alertar si es alta o muy_alta
    if (intensidadMax === 'media') return;

    // Buscar vendedor asignado
    const { data: vendedor } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('id', lead.assigned_to)
      .single();

    if (!vendedor?.phone) {
      console.log(`🔥 Lead caliente ${lead.name} pero vendedor sin teléfono`);
      return;
    }

    // Verificar que no se haya enviado alerta en los últimos 30 minutos
    const notas = typeof lead.notes === 'object' ? lead.notes : {};
    const ultimaAlerta = (notas as any)?.ultima_alerta_caliente;
    if (ultimaAlerta) {
      const hace30min = new Date(Date.now() - 30 * 60 * 1000);
      if (new Date(ultimaAlerta) > hace30min) {
        console.log(`🔥 Lead ${lead.name} ya tiene alerta reciente, omitiendo`);
        return;
      }
    }

    // Construir mensaje de alerta
    const tiposDetectados = señales.map(s => s.tipo).join(', ');
    const emoji = intensidadMax === 'muy_alta' ? '🔥🔥🔥' : '🔥🔥';

    const nombreLead = lead.name || 'Sin nombre';
    const nombreCorto = lead.name ? lead.name.split(' ')[0] : 'lead';

    const alertaMsg = `${emoji} *LEAD CALIENTE - ACTÚA YA*

👤 *${nombreLead}*
📱 ${formatPhoneForDisplay(lead.phone)}
🏠 Interés: ${lead.property_interest || 'No especificado'}

💬 Dijo: "${mensaje.substring(0, 100)}${mensaje.length > 100 ? '...' : ''}"

📊 Señales detectadas: *${tiposDetectados}*
⚡ Intensidad: *${intensidadMax.toUpperCase()}*

💡 Acción recomendada:
${señales.some(s => s.tipo === 'visita') ? '→ Agendar visita HOY si es posible\n' : ''}${señales.some(s => s.tipo === 'precio') ? '→ Enviar cotización personalizada\n' : ''}${señales.some(s => s.tipo === 'credito') ? '→ Explicar opciones de crédito\n' : ''}${señales.some(s => s.tipo === 'apartado') ? '→ Explicar proceso de apartado\n' : ''}${señales.some(s => s.tipo === 'urgencia') ? '→ CONTACTAR INMEDIATAMENTE\n' : ''}
📞 Responde: bridge ${nombreCorto}`;

    await meta.sendWhatsAppMessage(vendedor.phone, alertaMsg);
    console.log(`🔥 Alerta enviada a ${vendedor.name} por lead caliente: ${lead.name} (${tiposDetectados})`);

    // ═══ TTS: Enviar audio de alerta urgente ═══
    if (options?.openaiApiKey) {
      try {
        const tts = createTTSService(options.openaiApiKey);
        const desarrollo = lead.property_interest || 'sin desarrollo especificado';
        const textoAudio = intensidadMax === 'muy_alta'
          ? `¡Alerta urgente! Lead muy caliente. ${nombreLead} está interesado en ${desarrollo}. Dijo: ${mensaje.substring(0, 80)}. ¡Contacta inmediatamente!`
          : `Alerta. Lead caliente. ${nombreLead} interesado en ${desarrollo}. Señales: ${tiposDetectados}. Responde bridge ${nombreCorto}.`;

        const audioResult = await tts.generateAudio(textoAudio);
        if (audioResult.success && audioResult.audioBuffer) {
          const sendResult = await meta.sendVoiceMessage(vendedor.phone, audioResult.audioBuffer, audioResult.mimeType || 'audio/ogg');
          console.log(`🔊 Audio alerta lead caliente enviado a ${vendedor.name}`);

          // 🔊 TTS Tracking
          const messageId = sendResult?.messages?.[0]?.id;
          if (messageId) {
            try {
              const ttsTracking = createTTSTrackingService(supabase);
              await ttsTracking.logTTSSent({
                messageId,
                recipientPhone: vendedor.phone,
                recipientType: 'team_member',
                recipientId: vendedor.id,
                recipientName: vendedor.name,
                ttsType: 'alerta_lead',
                textoOriginal: textoAudio,
                audioBytes: audioResult.audioBuffer.byteLength,
                duracionEstimada: audioResult.duration
              });
            } catch (trackErr) {
              // No crítico
            }
          }
        }
      } catch (ttsErr) {
        console.log(`⚠️ TTS alerta lead caliente falló (no crítico):`, ttsErr);
      }
    }

    // Guardar en notas del lead
    const notasActualizadas = {
      ...notas,
      ultima_alerta_caliente: new Date().toISOString(),
      historial_señales_calientes: [
        ...((notas as any)?.historial_señales_calientes || []).slice(-9),
        {
          fecha: new Date().toISOString(),
          señales: señales.map(s => s.tipo),
          intensidad: intensidadMax,
          mensaje: mensaje.substring(0, 200)
        }
      ]
    };

    // Actualizar notas Y recalcular score inmediatamente
    const leadActualizado = { ...lead, notes: notasActualizadas };
    const { score, categoria } = calcularLeadScore(leadActualizado);

    await supabase.client
      .from('leads')
      .update({
        notes: notasActualizadas,
        score: score,
        lead_score: score,
        lead_category: categoria
      })
      .eq('id', lead.id);

    console.log(`📊 Lead ${lead.name} score actualizado: ${score} (${categoria})`);

  } catch (e) {
    console.error('Error en alertarLeadCaliente:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'alertarLeadCaliente', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

export async function actualizarLeadScores(supabase: SupabaseService): Promise<void> {
  try {
    // Obtener leads activos (no cerrados/perdidos) que necesitan actualización
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, status, notes, updated_at, created_at, property_interest, needs_mortgage, credit_status, score, lead_score')
      .not('status', 'in', '("closed","delivered","lost","fallen","paused")')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (!leads || leads.length === 0) {
      console.log('📊 No hay leads para actualizar scores');
      return;
    }

    let actualizados = 0;
    let hotLeads = 0;
    let warmLeads = 0;

    for (const lead of leads) {
      const { score, factors, categoria } = calcularLeadScore(lead);

      // Solo actualizar si el score cambió significativamente (±5 puntos)
      const scoreActual = lead.score || lead.lead_score || 0;
      if (Math.abs(score - scoreActual) >= 5 || !lead.score) {
        await supabase.client
          .from('leads')
          .update({
            score: score,
            lead_score: score,
            lead_category: categoria
          })
          .eq('id', lead.id);

        actualizados++;
      }

      if (categoria === 'HOT') hotLeads++;
      else if (categoria === 'WARM') warmLeads++;
    }

    console.log(`📊 Lead scoring completado: ${actualizados} actualizados, ${hotLeads} HOT, ${warmLeads} WARM`);

  } catch (e) {
    console.error('Error en actualizarLeadScores:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'actualizarLeadScores', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// DETECCIÓN Y MANEJO DE OBJECIONES
// Detecta objeciones comunes y alerta al vendedor con respuestas sugeridas
// ═══════════════════════════════════════════════════════════
export interface Objecion {
  tipo: string;
  patron: RegExp;
  respuestaSugerida: string;
  prioridad: 'alta' | 'media' | 'baja';
}

export const OBJECIONES_COMUNES: Objecion[] = [
  // PRECIO
  {
    tipo: 'precio_alto',
    patron: /muy caro|esta caro|no me alcanza|fuera de (mi )?presupuesto|no tengo (tanto|ese) dinero|es mucho|demasiado caro/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Precio:*
→ "Entiendo tu preocupación. ¿Te gustaría que revisemos opciones de financiamiento? Con crédito, la mensualidad puede ser menor a una renta."
→ "Tenemos diferentes modelos. ¿Cuál es tu presupuesto ideal? Así te muestro opciones que se ajusten."
→ "También tenemos promociones de enganche diferido. ¿Te interesa conocerlas?"`,
    prioridad: 'alta'
  },
  {
    tipo: 'ubicacion',
    patron: /muy lejos|esta lejos|no me gusta la zona|no conozco (esa|la) zona|queda lejos|mal ubicado/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Ubicación:*
→ "La zona está en crecimiento y tiene excelente plusvalía. ¿Te gustaría que te muestre los accesos y servicios cercanos?"
→ "Tenemos desarrollos en diferentes zonas. ¿Cuál ubicación te quedaría mejor?"
→ "Muchos clientes pensaban igual, pero al visitar cambiaron de opinión. ¿Agendamos un recorrido?"`,
    prioridad: 'media'
  },
  {
    tipo: 'timing',
    patron: /no es (buen )?momento|mas adelante|despues|ahorita no|todavia no|en unos meses|el proximo año|cuando tenga|primero tengo que/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Timing:*
→ "Entiendo. ¿Puedo preguntarte qué necesitas resolver primero? Quizá podamos ayudarte."
→ "Los precios suben cada mes. Apartar ahora te garantiza el precio actual con un mínimo de enganche."
→ "¿Te gustaría que te mantenga informado de promociones? Así cuando estés listo tendrás las mejores opciones."`,
    prioridad: 'media'
  },
  {
    tipo: 'desconfianza',
    patron: /no confio|es seguro|de verdad|no se si|sera cierto|me da desconfianza|tienen garantia|estan registrados/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Confianza:*
→ "Grupo Santa Rita tiene más de 15 años entregando casas. Te puedo compartir testimoniales de clientes."
→ "Todas nuestras propiedades tienen escrituras en orden y están registradas. Te muestro la documentación."
→ "¿Te gustaría visitar un desarrollo terminado y platicar con vecinos actuales?"`,
    prioridad: 'alta'
  },
  {
    tipo: 'competencia',
    patron: /vi algo mas barato|en otro lado|otra inmobiliaria|otra constructora|me ofrecieron|cotizando con otros|comparando opciones/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Competencia:*
→ "¡Qué bueno que estás comparando! ¿Puedo saber qué opciones viste? Te ayudo a comparar beneficios."
→ "A veces lo barato sale caro. Nosotros incluimos: escrituración, servicios y garantía. ¿Ellos también?"
→ "¿Qué es lo que más te gustó de la otra opción? Quiero entender qué es importante para ti."`,
    prioridad: 'alta'
  },
  {
    tipo: 'credito_negado',
    patron: /no califico|me rechazaron|no me dan credito|no tengo buro|mal historial|deudas|no paso el credito/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Crédito:*
→ "Trabajamos con múltiples bancos y cada uno tiene criterios diferentes. ¿Te gustaría que revisemos otras opciones?"
→ "También tenemos esquemas de pago directo con la constructora. ¿Te interesa conocerlos?"
→ "A veces el problema no es el buró, sino cómo se presenta la solicitud. Nuestros asesores de crédito pueden ayudarte."`,
    prioridad: 'alta'
  },
  {
    tipo: 'tamaño',
    patron: /muy chica|muy pequeña|necesito mas espacio|es pequeña|no cabe|muy grande|mucho espacio|no necesito tanto/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Tamaño:*
→ "Tenemos diferentes modelos. ¿Cuántas recámaras necesitas idealmente?"
→ "Los metros cuadrados son optimizados. ¿Te gustaría visitar para ver cómo se siente el espacio real?"
→ "Muchos modelos permiten ampliaciones a futuro. Te explico las opciones."`,
    prioridad: 'media'
  },
  {
    tipo: 'indecision',
    patron: /no se|tengo que pensarlo|dejame ver|lo voy a pensar|consultarlo|platicarlo con|mi esposo|mi esposa|mi familia/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Indecisión:*
→ "Claro, es una decisión importante. ¿Hay alguna duda específica que pueda resolver para ayudarte a decidir?"
→ "¿Te gustaría que agende una visita para que tu familia también conozca? Sin compromiso."
→ "Te puedo enviar información detallada para que la revisen juntos. ¿Qué te gustaría saber?"`,
    prioridad: 'baja'
  }
];

export function detectarObjeciones(mensaje: string): Objecion[] {
  const msgNormalizado = mensaje.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return OBJECIONES_COMUNES.filter(obj => obj.patron.test(msgNormalizado));
}

export async function alertarObjecion(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string,
  objeciones: Objecion[]
): Promise<void> {
  try {
    if (objeciones.length === 0) return;

    const notas = typeof lead.notes === 'object' ? lead.notes : {};
    const nombreCortoLead = lead.name ? lead.name.split(' ')[0] : '';

    // ═══════════════════════════════════════════════════════════
    // OBJECIONES DE INDECISIÓN: SARA responde automáticamente
    // No notifica al vendedor, maneja directamente
    // ═══════════════════════════════════════════════════════════
    const soloIndecision = objeciones.every(o => o.tipo === 'indecision');
    const tieneIndecision = objeciones.some(o => o.tipo === 'indecision');

    if (soloIndecision || (tieneIndecision && objeciones.length === 1)) {
      console.log(`🤖 Objeción de INDECISIÓN detectada para ${lead.name} - SARA responde automáticamente`);

      // Respuestas automáticas para indecisión (varían según contexto)
      const msgLower = mensaje.toLowerCase();
      let respuestaAuto = '';

      if (msgLower.includes('espos') || msgLower.includes('familia') || msgLower.includes('pareja')) {
        // Quiere consultar con familia/esposa
        respuestaAuto = `¡Por supuesto${nombreCortoLead ? ` ${nombreCortoLead}` : ''}! Es una decisión importante y es bueno tomarla en familia 👨‍👩‍👧

¿Te gustaría que agendemos una visita para que vengan juntos a conocer? Así pueden ver el espacio real y resolver todas sus dudas. Sin ningún compromiso 😊

¿Qué día les quedaría mejor?`;
      } else if (msgLower.includes('pensar') || msgLower.includes('ver') || msgLower.includes('no se')) {
        // Necesita pensarlo
        respuestaAuto = `Claro${nombreCortoLead ? ` ${nombreCortoLead}` : ''}, es una decisión importante y está bien tomarse el tiempo necesario 😊

Para ayudarte a decidir, ¿hay alguna duda específica que pueda resolver? Por ejemplo sobre precios, financiamiento, o características de las casas.

Estoy aquí para lo que necesites.`;
      } else if (msgLower.includes('consultar') || msgLower.includes('platicar')) {
        // Quiere consultarlo
        respuestaAuto = `¡Perfecto${nombreCortoLead ? ` ${nombreCortoLead}` : ''}! Tómate tu tiempo para platicarlo 😊

Si quieres, te puedo enviar información detallada para que la revisen juntos. También puedo agendar una visita cuando estén listos para que conozcan el lugar en persona.

¿Qué te sería más útil?`;
      } else {
        // Respuesta genérica de indecisión
        respuestaAuto = `Entiendo${nombreCortoLead ? ` ${nombreCortoLead}` : ''}, es una decisión importante 😊

¿Hay algo específico que te gustaría saber o alguna duda que pueda resolver para ayudarte? Estoy aquí para apoyarte en lo que necesites.`;
      }

      // Enviar respuesta automática al lead
      await meta.sendWhatsAppMessage(lead.phone, respuestaAuto);
      console.log(`✅ SARA respondió automáticamente a indecisión de ${lead.name}`);

      // Guardar en notas (sin alertar vendedor)
      const notasActualizadas = {
        ...notas,
        ultima_objecion_auto: new Date().toISOString(),
        historial_objeciones: [
          ...((notas as any)?.historial_objeciones || []).slice(-9),
          {
            fecha: new Date().toISOString(),
            tipos: ['indecision'],
            mensaje: mensaje.substring(0, 200),
            manejado_por: 'SARA_AUTO'
          }
        ]
      };

      await supabase.client
        .from('leads')
        .update({ notes: notasActualizadas })
        .eq('id', lead.id);

      return; // No alertar al vendedor
    }

    // ═══════════════════════════════════════════════════════════
    // OTRAS OBJECIONES: Alertar al vendedor como antes
    // ═══════════════════════════════════════════════════════════

    // Buscar vendedor asignado
    const { data: vendedor } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('id', lead.assigned_to)
      .single();

    if (!vendedor?.phone) {
      console.error(`⚠️ Objeción detectada para ${lead.name} pero vendedor sin teléfono`);
      return;
    }

    // Verificar cooldown (no alertar misma objeción en 2 horas)
    const ultimaObjecion = (notas as any)?.ultima_alerta_objecion;
    if (ultimaObjecion) {
      const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
      if (new Date(ultimaObjecion) > hace2h) {
        console.error(`⚠️ Lead ${lead.name} ya tiene alerta de objeción reciente`);
        return;
      }
    }

    // Filtrar indecisión de las objeciones a alertar (ya se manejó arriba si era solo indecisión)
    const objecionesParaAlertar = objeciones.filter(o => o.tipo !== 'indecision');
    if (objecionesParaAlertar.length === 0) return;

    // Construir mensaje de alerta
    const tiposObjecion = objecionesParaAlertar.map(o => o.tipo).join(', ');
    const prioridadMax = objecionesParaAlertar.some(o => o.prioridad === 'alta') ? 'ALTA' :
                         objecionesParaAlertar.some(o => o.prioridad === 'media') ? 'MEDIA' : 'BAJA';
    const nombreLeadObj = lead.name || 'Sin nombre';
    const nombreCortoObj = lead.name ? lead.name.split(' ')[0] : 'lead';

    let alertaMsg = `⚠️ *OBJECIÓN DETECTADA*

👤 *${nombreLeadObj}*
📱 ${formatPhoneForDisplay(lead.phone)}
🏠 Interés: ${lead.property_interest || 'No especificado'}

💬 Dijo: "${mensaje.substring(0, 150)}${mensaje.length > 150 ? '...' : ''}"

📊 Tipo: *${tiposObjecion}*
⚡ Prioridad: *${prioridadMax}*

`;

    // Agregar respuestas sugeridas (máximo 2)
    objecionesParaAlertar.slice(0, 2).forEach(obj => {
      alertaMsg += `\n${obj.respuestaSugerida}\n`;
    });

    alertaMsg += `\n📞 Responde: bridge ${nombreCortoObj}`;

    await meta.sendWhatsAppMessage(vendedor.phone, alertaMsg);
    console.error(`⚠️ Alerta de objeción enviada a ${vendedor.name}: ${lead.name} (${tiposObjecion})`);

    // Guardar en notas
    const notasActualizadas = {
      ...notas,
      ultima_alerta_objecion: new Date().toISOString(),
      historial_objeciones: [
        ...((notas as any)?.historial_objeciones || []).slice(-9),
        {
          fecha: new Date().toISOString(),
          tipos: objecionesParaAlertar.map(o => o.tipo),
          mensaje: mensaje.substring(0, 200)
        }
      ]
    };

    await supabase.client
      .from('leads')
      .update({ notes: notasActualizadas })
      .eq('id', lead.id);

  } catch (e) {
    console.error('Error en alertarObjecion:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'alertarObjecion', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}
