// ═══════════════════════════════════════════════════════════════════════════
// VISIT PREP BRIEF SERVICE - Brief pre-visita para vendedores
// Genera un resumen WhatsApp-formatted con datos del lead antes de una cita
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';
import { safeJsonParse } from '../utils/safeHelpers';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface LeadInterests {
  developments: string[];
  models: string[];
  budget: string | null;
  financing: string | null;
  objections: string[];
  keyTopics: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPMENT DATA (precios y datos para tips)
// ═══════════════════════════════════════════════════════════════════════════

const DEVELOPMENT_TIPS: Record<string, {
  range: string;
  appreciation: string;
  rentComparison: string;
  highlights: string[];
}> = {
  'monte verde': {
    range: '$1.6M - $2.85M',
    appreciation: '+6%',
    rentComparison: '$8K/mes zona',
    highlights: ['Zona Colinas del Padre', 'Modelos desde Acacia', 'Plusvalía constante'],
  },
  'los encinos': {
    range: '$2.2M - $3.5M',
    appreciation: '+7%',
    rentComparison: '$10K/mes zona',
    highlights: ['Residencial premium', 'Acabados de lujo', 'Zona consolidada'],
  },
  'miravalle': {
    range: '$2.0M - $3.2M',
    appreciation: '+5%',
    rentComparison: '$9K/mes zona',
    highlights: ['Vista panorámica', 'Amenidades completas', 'Seguridad 24/7'],
  },
  'paseo colorines': {
    range: '$2.1M - $3.0M',
    appreciation: '+5%',
    rentComparison: '$9K/mes zona',
    highlights: ['Excelente ubicación', 'Cerca de servicios', 'Zona familiar'],
  },
  'monte real': {
    range: '$1.8M - $2.5M',
    appreciation: '+5%',
    rentComparison: '$8K/mes zona',
    highlights: ['Accesible', 'Zona en crecimiento', 'Buena conectividad'],
  },
  'andes': {
    range: '$1.5M - $2.3M',
    appreciation: '+6%',
    rentComparison: '$7K/mes zona',
    highlights: ['Vialidad Siglo XXI', 'Zona Guadalupe', 'Precio accesible'],
  },
  'distrito falco': {
    range: '$2.5M - $3.8M',
    appreciation: '+7%',
    rentComparison: '$11K/mes zona',
    highlights: ['Calzada Solidaridad', 'Diseño moderno', 'Zona premium Guadalupe'],
  },
  'villa campelo': {
    range: '$800K - $1.5M',
    appreciation: '+8%',
    rentComparison: 'N/A (terrenos)',
    highlights: ['Terrenos en Citadella del Nogal', 'Inversión a largo plazo', 'Libertad de diseño'],
  },
  'villa galiano': {
    range: '$900K - $1.8M',
    appreciation: '+8%',
    rentComparison: 'N/A (terrenos)',
    highlights: ['Terrenos premium', 'Citadella del Nogal', 'Zona en desarrollo'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FINANCING TIPS
// ═══════════════════════════════════════════════════════════════════════════

const FINANCING_TIPS: Record<string, string[]> = {
  infonavit: [
    'Enfocarse en financiamiento INFONAVIT',
    'Mencionar que aceptamos crédito INFONAVIT',
    'Explicar cómo usar subcuenta para enganche',
  ],
  fovissste: [
    'Explicar beneficios FOVISSSTE',
    'Mencionar tasas preferenciales',
    'Asesorar sobre requisitos documentales',
  ],
  bancario: [
    'Comparar opciones de bancos',
    'Mencionar pre-aprobación sin compromiso',
    'Resaltar tasas competitivas actuales',
  ],
  cofinavit: [
    'Explicar esquema Cofinavit (INFONAVIT + banco)',
    'Mayor monto de crédito disponible',
    'Ideal para propiedades de mayor valor',
  ],
  contado: [
    'Ofrecer descuento por pago de contado',
    'Mencionar beneficios fiscales',
    'Proceso más rápido de escrituración',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// OBJECTION RESPONSE TIPS
// ═══════════════════════════════════════════════════════════════════════════

const OBJECTION_TIPS: Record<string, string> = {
  precio: 'Si objeta precio: comparar vs renta mensual de la zona',
  ubicacion: 'Si objeta ubicación: mostrar tiempos de traslado reales',
  tamano: 'Si objeta tamaño: mostrar optimización de espacios en persona',
  credito: 'Si tiene dudas de crédito: ofrecer pre-calificación sin compromiso',
  pareja: 'Si necesita consultar pareja: preparar info digital para compartir',
  tiempo: 'Si no es buen momento: enfatizar plusvalía y costo de esperar',
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class VisitPrepBriefService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Generate a WhatsApp-formatted pre-visit brief for a vendedor
   */
  async generateBrief(leadId: string, appointmentId: string): Promise<string> {
    try {
      // 1. Fetch lead with all data
      const { data: lead, error: leadError } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status, score, assigned_to, notes, conversation_history, property_interest, needs_mortgage, credit_status, created_at, updated_at')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        console.error('❌ VisitPrepBrief: Error fetching lead:', leadError?.message);
        return '❌ No se pudo generar el brief: lead no encontrado.';
      }

      // 2. Fetch appointment details
      const { data: appointment, error: apptError } = await this.supabase.client
        .from('appointments')
        .select('id, scheduled_date, scheduled_time, appointment_type, development, status, notes')
        .eq('id', appointmentId)
        .single();

      if (apptError || !appointment) {
        console.error('❌ VisitPrepBrief: Error fetching appointment:', apptError?.message);
        return '❌ No se pudo generar el brief: cita no encontrada.';
      }

      // 3. Parse notes safely
      const notas = safeJsonParse(lead.notes, {});

      // 4. Extract interests from notes
      const interests = this.extractInterests(notas, lead);

      // 5. Get development info
      const devName = appointment.development || lead.property_interest || interests.developments[0] || null;
      const devInfo = devName ? this.getDevInfo(devName) : null;

      // 6. Get buyer readiness
      const buyerReadiness = notas.buyer_readiness || null;
      const readinessLabel = buyerReadiness?.label || 'sin datos';
      const readinessScore = buyerReadiness?.score ?? null;

      // 7. Format appointment date/time
      const appointmentDateTime = this.formatAppointmentDateTime(appointment.scheduled_date, appointment.scheduled_time);

      // 8. Build conversation summary
      const conversationSummary = this.summarizeConversation(lead.conversation_history, notas);

      // 9. Generate sale tips
      const saleTips = this.generateSaleTips(interests, devName, devInfo, notas);

      // 10. Build the brief
      const phoneDisplay = lead.phone ? lead.phone.replace(/^521/, '').replace(/^52/, '') : 'N/D';
      const scoreDisplay = lead.score != null ? `${lead.score}/100` : 'Sin score';
      const readinessDisplay = readinessScore != null ? `${scoreDisplay} (buyer readiness: ${readinessLabel})` : scoreDisplay;

      let brief = `📋 *BRIEF PRE-VISITA*\n━━━━━━━━━━━━━━━━━\n\n`;

      // Lead info
      brief += `👤 *Lead:* ${lead.name || 'Sin nombre'}\n`;
      brief += `📱 *Tel:* ${phoneDisplay}\n`;
      brief += `🎯 *Score:* ${readinessDisplay}\n`;
      brief += `📊 *Status:* ${lead.status || 'N/D'}\n`;

      // Conversation summary
      if (conversationSummary.length > 0) {
        brief += `\n💬 *Lo que ha preguntado:*\n`;
        for (const topic of conversationSummary) {
          brief += `• ${topic}\n`;
        }
      }

      // Development info
      if (devName) {
        brief += `\n🏠 *Desarrollo a visitar:* ${this.capitalize(devName)}\n`;
        if (devInfo) {
          brief += `💰 *Rango:* ${devInfo.range}\n`;
        }
      }

      // Budget if available
      if (interests.budget) {
        brief += `💵 *Presupuesto lead:* ${interests.budget}\n`;
      }

      // Sale tips
      if (saleTips.length > 0) {
        brief += `\n🎯 *Tips de venta:*\n`;
        for (const tip of saleTips) {
          brief += `• ${tip}\n`;
        }
      }

      // Appointment details
      brief += `\n⏰ *Cita:* ${appointmentDateTime}`;

      // Appointment type if specified
      if (appointment.appointment_type && appointment.appointment_type !== 'visita') {
        brief += `\n📌 *Tipo:* ${appointment.appointment_type}`;
      }

      return brief;
    } catch (error) {
      console.error('❌ VisitPrepBrief: Error generating brief:', error);
      return '❌ Error al generar el brief pre-visita.';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Extract lead interests, objections, budget from notes
   */
  private extractInterests(notas: any, lead: any): LeadInterests {
    const interests: LeadInterests = {
      developments: [],
      models: [],
      budget: null,
      financing: null,
      objections: [],
      keyTopics: [],
    };

    // Property interest from lead field
    if (lead.property_interest) {
      interests.developments.push(lead.property_interest);
    }

    // Intent history
    const intentHistory: any[] = Array.isArray(notas.intent_history) ? notas.intent_history : [];
    for (const intent of intentHistory.slice(-10)) {
      if (intent.intent === 'property_inquiry' || intent.intent === 'schedule_visit') {
        if (intent.development && !interests.developments.includes(intent.development)) {
          interests.developments.push(intent.development);
        }
        if (intent.model && !interests.models.includes(intent.model)) {
          interests.models.push(intent.model);
        }
      }
      if (intent.intent === 'financing_inquiry') {
        interests.financing = intent.type || 'general';
      }
      if (intent.intent === 'price_inquiry') {
        interests.keyTopics.push('Preguntó por precios');
      }
    }

    // Budget from notes
    if (notas.presupuesto || notas.presupuesto_max) {
      const pres = notas.presupuesto_max || notas.presupuesto;
      interests.budget = typeof pres === 'number' ? `~$${(pres / 1000000).toFixed(1)}M` : String(pres);
    }

    // Financing
    if (lead.needs_mortgage || notas.necesita_credito) {
      interests.financing = interests.financing || (lead.credit_status || 'general');
    }
    if (notas.tipo_credito) {
      interests.financing = notas.tipo_credito;
    }

    // Objections from historial_objeciones
    const histObjeciones: any[] = Array.isArray(notas.historial_objeciones) ? notas.historial_objeciones : [];
    for (const obj of histObjeciones.slice(-5)) {
      if (obj.tipos) {
        for (const tipo of (Array.isArray(obj.tipos) ? obj.tipos : [obj.tipos])) {
          if (!interests.objections.includes(tipo)) {
            interests.objections.push(tipo);
          }
        }
      } else if (obj.tipo && !interests.objections.includes(obj.tipo)) {
        interests.objections.push(obj.tipo);
      }
    }

    // Key topics from notes fields
    if (notas.recamaras) interests.keyTopics.push(`Busca ${notas.recamaras} recámaras`);
    if (notas.zona_preferida) interests.keyTopics.push(`Zona preferida: ${notas.zona_preferida}`);
    if (notas.motivo_compra) interests.keyTopics.push(`Motivo: ${notas.motivo_compra}`);
    if (notas.urgencia) interests.keyTopics.push(`Urgencia: ${notas.urgencia}`);

    return interests;
  }

  /**
   * Get development info from static data (fallback if DB not available)
   */
  private getDevInfo(devName: string): typeof DEVELOPMENT_TIPS[string] | null {
    const normalized = devName.toLowerCase().trim();
    // Direct match
    if (DEVELOPMENT_TIPS[normalized]) return DEVELOPMENT_TIPS[normalized];
    // Partial match
    for (const [key, value] of Object.entries(DEVELOPMENT_TIPS)) {
      if (normalized.includes(key) || key.includes(normalized)) return value;
    }
    return null;
  }

  /**
   * Format appointment date/time for display
   */
  private formatAppointmentDateTime(date: string, time: string): string {
    if (!date) return 'Fecha no definida';

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    try {
      const d = new Date(date + 'T12:00:00');
      const dayName = dias[d.getDay()];
      const dayNum = d.getDate();
      const month = meses[d.getMonth()];

      let timeDisplay = '';
      if (time) {
        // Parse time like "10:00" or "10:00:00"
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        timeDisplay = `, ${hour12}:${m || '00'} ${ampm}`;
      }

      return `${dayName} ${dayNum} ${month}${timeDisplay}`;
    } catch {
      return `${date} ${time || ''}`.trim();
    }
  }

  /**
   * Summarize conversation history and notes into bullet points
   */
  private summarizeConversation(conversationHistory: any, notas: any): string[] {
    const topics: string[] = [];

    // From intent_history (most reliable)
    const intentHistory: any[] = Array.isArray(notas?.intent_history) ? notas.intent_history : [];
    const seenIntents = new Set<string>();

    for (const intent of intentHistory.slice(-10)) {
      const key = `${intent.intent}_${intent.development || ''}`;
      if (seenIntents.has(key)) continue;
      seenIntents.add(key);

      switch (intent.intent) {
        case 'property_inquiry':
          topics.push(`Interesado en ${intent.development || 'propiedades'}${intent.model ? ` (${intent.model})` : ''}`);
          break;
        case 'financing_inquiry':
          topics.push(`Preguntó por ${intent.type || 'financiamiento'}`);
          break;
        case 'price_inquiry':
          topics.push(`Preguntó por precios${intent.development ? ` de ${intent.development}` : ''}`);
          break;
        case 'schedule_visit':
          topics.push(`Quiere visitar${intent.development ? ` ${intent.development}` : ''}`);
          break;
        case 'location_inquiry':
          topics.push(`Preguntó por ubicación${intent.development ? ` de ${intent.development}` : ''}`);
          break;
        default:
          if (intent.intent && !intent.intent.startsWith('_')) {
            topics.push(`${intent.intent.replace(/_/g, ' ')}`);
          }
      }
    }

    // Budget
    if (notas?.presupuesto || notas?.presupuesto_max) {
      const pres = notas.presupuesto_max || notas.presupuesto;
      const formatted = typeof pres === 'number' ? `~$${(pres / 1000000).toFixed(1)}M` : String(pres);
      topics.push(`Presupuesto: ${formatted}`);
    }

    // Objections
    const histObjeciones: any[] = Array.isArray(notas?.historial_objeciones) ? notas.historial_objeciones : [];
    if (histObjeciones.length > 0) {
      const lastObj = histObjeciones[histObjeciones.length - 1];
      const tipos = lastObj.tipos || (lastObj.tipo ? [lastObj.tipo] : []);
      if (tipos.length > 0) {
        topics.push(`Objeciones: ${tipos.join(', ')}`);
      }
    }

    // From conversation_history (last resort, summarize key user messages)
    if (topics.length < 2 && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const userMessages = conversationHistory
        .filter((m: any) => m.role === 'user')
        .slice(-5)
        .map((m: any) => m.content || '')
        .filter((c: string) => c.length > 10 && c.length < 200);

      // Extract key phrases from recent messages
      for (const msg of userMessages.slice(-3)) {
        const lower = msg.toLowerCase();
        if (lower.includes('infonavit') && !topics.some(t => t.includes('INFONAVIT'))) {
          topics.push('Preguntó por INFONAVIT');
        }
        if (lower.includes('fovissste') && !topics.some(t => t.includes('FOVISSSTE'))) {
          topics.push('Preguntó por FOVISSSTE');
        }
        if ((lower.includes('precio') || lower.includes('costo') || lower.includes('cuánto')) && !topics.some(t => t.includes('precio'))) {
          topics.push('Preguntó por precios');
        }
        if ((lower.includes('recámara') || lower.includes('cuarto')) && !topics.some(t => t.includes('recámara'))) {
          topics.push('Preguntó por recámaras/distribución');
        }
      }
    }

    // Limit to 6 topics max
    return topics.slice(0, 6);
  }

  /**
   * Generate personalized sale tips based on lead data
   */
  private generateSaleTips(interests: LeadInterests, devName: string | null, devInfo: typeof DEVELOPMENT_TIPS[string] | null, notas: any): string[] {
    const tips: string[] = [];

    // Financing-based tips
    if (interests.financing) {
      const finTips = FINANCING_TIPS[interests.financing.toLowerCase()] || FINANCING_TIPS['bancario'];
      if (finTips && finTips.length > 0) {
        tips.push(finTips[0]);
      }
    }

    // Model/price-based tips
    if (devInfo && interests.budget) {
      // Try to suggest starting with the most affordable model
      tips.push(`Mostrar opciones desde el rango más accesible primero`);
    }

    // Appreciation tip
    if (devInfo) {
      tips.push(`Mencionar plusvalía (${devInfo.appreciation} último año)`);
    }

    // Objection-based tips
    for (const objection of interests.objections.slice(0, 2)) {
      const objTip = OBJECTION_TIPS[objection.toLowerCase()];
      if (objTip) tips.push(objTip);
    }

    // Rent comparison if price objection or no specific objection
    if (devInfo && (interests.objections.includes('precio') || interests.objections.length === 0)) {
      tips.push(`Si objeta precio: comparar vs renta (${devInfo.rentComparison})`);
    }

    // Buyer readiness based tips
    const readiness = notas?.buyer_readiness;
    if (readiness) {
      if (readiness.label === 'ready_to_buy') {
        tips.push('Lead LISTO para comprar — enfocarse en cerrar');
      } else if (readiness.label === 'evaluating') {
        tips.push('Lead evaluando — mostrar diferenciadores vs competencia');
      } else if (readiness.label === 'browsing') {
        tips.push('Lead explorando — no presionar, construir relación');
      }
    }

    // Churn risk based tips
    const churnRisk = notas?.churn_risk;
    if (churnRisk && (churnRisk.label === 'at_risk' || churnRisk.label === 'critical')) {
      tips.push('⚠️ Lead en riesgo de perderse — priorizar atención');
    }

    // Dedupe and limit
    const uniqueTips: string[] = [];
    const seen = new Set<string>();
    for (const tip of tips) {
      if (!seen.has(tip)) {
        seen.add(tip);
        uniqueTips.push(tip);
      }
    }
    return uniqueTips.slice(0, 5);
  }

  /**
   * Capitalize first letter of each word
   */
  private capitalize(str: string): string {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }
}
