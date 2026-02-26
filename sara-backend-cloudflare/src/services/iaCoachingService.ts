import { SupabaseService } from './supabase';
import { MetaWhatsAppService } from './meta-whatsapp';
import { ClaudeService } from './claude';
import { safeJsonParse } from '../utils/safeHelpers';
import { findLeadByName } from '../handlers/whatsapp-utils';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';

interface VendorMetrics {
  id: string;
  name: string;
  phone: string;
  // Métricas de leads
  leadsAsignados: number;
  leadsConvertidos: number;
  leadsContactados: number;
  // Métricas de citas
  citasAgendadas: number;
  citasCompletadas: number;
  citasCanceladas: number;
  // Métricas de tiempo
  tiempoPromedioRespuesta: number; // minutos
  diasSinCerrar: number;
  // Métricas de actividad
  mensajesEnviados: number;
  seguimientosHechos: number;
}

interface CoachingTip {
  area: 'conversion' | 'seguimiento' | 'citas' | 'cierre' | 'respuesta' | 'general';
  prioridad: number; // 1-5
  mensaje: string;
  accion?: string;
}

const COACHING_TIPS: Record<string, CoachingTip[]> = {
  // Tips para baja conversión
  baja_conversion: [
    { area: 'conversion', prioridad: 5, mensaje: '💡 *Tip de Conversión:*\n\nLos leads se enfrían rápido. Intenta contactarlos en los primeros 5 minutos después de que lleguen.', accion: 'Configura alertas para leads nuevos' },
    { area: 'conversion', prioridad: 4, mensaje: '💡 *Tip de Conversión:*\n\nPregunta por sus necesidades antes de hablar de propiedades. "¿Qué buscas en tu próximo hogar?" funciona mejor que empezar con precios.' },
    { area: 'conversion', prioridad: 3, mensaje: '💡 *Tip de Conversión:*\n\nUsa el nombre del cliente al menos 2 veces en la conversación. Crea conexión y aumenta la confianza.' },
  ],
  // Tips para bajo seguimiento
  bajo_seguimiento: [
    { area: 'seguimiento', prioridad: 5, mensaje: '📝 *Tip de Seguimiento:*\n\nEl 80% de las ventas ocurren entre el 5to y 12vo contacto. No te rindas después del 2do mensaje.' },
    { area: 'seguimiento', prioridad: 4, mensaje: '📝 *Tip de Seguimiento:*\n\nVaría el contenido: un día envía info, otro una pregunta, otro un video. La variedad mantiene el interés.' },
    { area: 'seguimiento', prioridad: 3, mensaje: '📝 *Tip de Seguimiento:*\n\nEl mejor horario para seguimiento: 10-11am y 4-5pm. Evita lunes temprano y viernes tarde.' },
  ],
  // Tips para citas canceladas
  citas_canceladas: [
    { area: 'citas', prioridad: 5, mensaje: '📅 *Tip de Citas:*\n\nConfirma 24h Y 2h antes. El recordatorio cercano reduce no-shows hasta 40%.' },
    { area: 'citas', prioridad: 4, mensaje: '📅 *Tip de Citas:*\n\nCuando agendes, pregunta "¿Hay algo que podría impedirte asistir?". Resolver objeciones ANTES evita cancelaciones.' },
    { area: 'citas', prioridad: 3, mensaje: '📅 *Tip de Citas:*\n\nOfrece 2 opciones específicas: "¿Te funciona mejor martes 10am o jueves 4pm?". Las opciones cerradas convierten mejor.' },
  ],
  // Tips para cierre lento
  cierre_lento: [
    { area: 'cierre', prioridad: 5, mensaje: '🎯 *Tip de Cierre:*\n\nCrea urgencia real: "Esta unidad es la última con ese precio" o "El apartado vence el viernes".' },
    { area: 'cierre', prioridad: 4, mensaje: '🎯 *Tip de Cierre:*\n\nPregunta "¿Qué necesitas para tomar una decisión esta semana?". Identifica la objeción real y resuélvela.' },
    { area: 'cierre', prioridad: 3, mensaje: '🎯 *Tip de Cierre:*\n\nUsa testimonios de otros clientes. "La familia Martínez también tenía esa duda..." humaniza el proceso.' },
  ],
  // Tips para respuesta lenta
  respuesta_lenta: [
    { area: 'respuesta', prioridad: 5, mensaje: '⚡ *Tip de Velocidad:*\n\nCada minuto que tardas reduce 7% la probabilidad de conversión. Responde en <5 min cuando sea posible.' },
    { area: 'respuesta', prioridad: 4, mensaje: '⚡ *Tip de Velocidad:*\n\nSi no puedes responder completo, envía un "¡Hola! Vi tu mensaje, te respondo en unos minutos". Mantiene al lead enganchado.' },
    { area: 'respuesta', prioridad: 3, mensaje: '⚡ *Tip de Velocidad:*\n\nUsa SARA para las preguntas básicas. Tú enfócate en cerrar citas y negociar.' },
  ],
  // Tips generales/motivacionales
  general: [
    { area: 'general', prioridad: 2, mensaje: '🌟 *Motivación:*\n\nCada NO te acerca a un SÍ. Los mejores vendedores escuchan 100 nos antes de cerrar.' },
    { area: 'general', prioridad: 2, mensaje: '🌟 *Motivación:*\n\nHoy es un buen día para cerrar. Revisa tus leads calientes y haz al menos 3 llamadas de seguimiento.' },
    { area: 'general', prioridad: 2, mensaje: '💪 *Recordatorio:*\n\nCada cliente que compra una casa cambia su vida. Eres parte de ese momento especial.' },
  ],
};

export class IACoachingService {
  constructor(
    private supabase: SupabaseService,
    private claude?: ClaudeService,
    private meta?: MetaWhatsAppService
  ) {}

  /**
   * Obtiene métricas de un vendedor para los últimos N días
   */
  async obtenerMetricasVendedor(vendedorId: string, dias: number = 30): Promise<VendorMetrics | null> {
    try {
      // Obtener datos del vendedor
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('id', vendedorId)
        .single();

      if (!vendedor) return null;

      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);
      const fechaInicioStr = fechaInicio.toISOString();

      // Leads asignados en el período
      const { data: leadsAsignados } = await this.supabase.client
        .from('leads')
        .select('id, status, created_at, updated_at, first_contacted_at, assigned_at')
        .eq('assigned_to', vendedorId)
        .gte('created_at', fechaInicioStr);

      // Leads convertidos (sold)
      const leadsConvertidos = leadsAsignados?.filter(l => l.status === 'sold').length || 0;

      // Leads contactados (cualquier status excepto 'new')
      const leadsContactados = leadsAsignados?.filter(l => l.status !== 'new').length || 0;

      // Citas del período
      const { data: citas } = await this.supabase.client
        .from('appointments')
        .select('id, status')
        .eq('vendedor_id', vendedorId)
        .gte('created_at', fechaInicioStr);

      const citasAgendadas = citas?.length || 0;
      const citasCompletadas = citas?.filter(c => c.status === 'completed').length || 0;
      const citasCanceladas = citas?.filter(c => c.status === 'cancelled' || c.status === 'no_show').length || 0;

      // Calcular días sin cerrar (último lead con status='sold')
      const { data: ultimaVenta } = await this.supabase.client
        .from('leads')
        .select('updated_at')
        .eq('assigned_to', vendedorId)
        .eq('status', 'sold')
        .order('updated_at', { ascending: false })
        .limit(1);

      let diasSinCerrar = 0;
      if (ultimaVenta && ultimaVenta.length > 0) {
        const ultimaFecha = new Date(ultimaVenta[0].updated_at);
        diasSinCerrar = Math.floor((Date.now() - ultimaFecha.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        diasSinCerrar = dias; // Si nunca ha vendido, usar el período completo
      }

      // Calcular mensajes enviados (actividades tipo whatsapp)
      const { data: actividades } = await this.supabase.client
        .from('lead_activities')
        .select('id')
        .eq('team_member_id', vendedorId)
        .eq('activity_type', 'whatsapp')
        .gte('created_at', fechaInicioStr);

      const mensajesEnviados = actividades?.length || 0;

      // Calcular tiempo promedio de respuesta (minutos desde asignación hasta primer contacto)
      let tiempoPromedioRespuesta = 0;
      const leadsConPrimerContacto = leadsAsignados?.filter(l => l.first_contacted_at && l.assigned_at) || [];
      if (leadsConPrimerContacto.length > 0) {
        const tiempos = leadsConPrimerContacto.map(l => {
          const asignado = new Date(l.assigned_at).getTime();
          const contactado = new Date(l.first_contacted_at).getTime();
          return Math.max(0, (contactado - asignado) / (1000 * 60)); // minutos
        });
        tiempoPromedioRespuesta = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
      }

      return {
        id: vendedor.id,
        name: vendedor.name || 'Sin nombre',
        phone: vendedor.phone || '',
        leadsAsignados: leadsAsignados?.length || 0,
        leadsConvertidos,
        leadsContactados,
        citasAgendadas,
        citasCompletadas,
        citasCanceladas,
        tiempoPromedioRespuesta,
        diasSinCerrar,
        mensajesEnviados,
        seguimientosHechos: leadsContactados,
      };
    } catch (e) {
      console.error('Error obteniendo métricas:', e);
      return null;
    }
  }

  /**
   * Analiza métricas y genera tips personalizados
   */
  generarTipsPersonalizados(metrics: VendorMetrics): CoachingTip[] {
    const tips: CoachingTip[] = [];

    // 1. Analizar conversión (leads convertidos / leads asignados)
    if (metrics.leadsAsignados > 0) {
      const tasaConversion = metrics.leadsConvertidos / metrics.leadsAsignados;
      if (tasaConversion < 0.1) {
        // Menos del 10% de conversión
        tips.push(...COACHING_TIPS.baja_conversion.slice(0, 2));
      }
    }

    // 2. Analizar seguimiento (leads contactados / leads asignados)
    if (metrics.leadsAsignados > 3) {
      const tasaSeguimiento = metrics.leadsContactados / metrics.leadsAsignados;
      if (tasaSeguimiento < 0.5) {
        // Menos del 50% contactados
        tips.push(...COACHING_TIPS.bajo_seguimiento.slice(0, 2));
      }
    }

    // 3. Analizar citas (canceladas / agendadas)
    if (metrics.citasAgendadas > 2) {
      const tasaCancelacion = metrics.citasCanceladas / metrics.citasAgendadas;
      if (tasaCancelacion > 0.3) {
        // Más del 30% canceladas
        tips.push(...COACHING_TIPS.citas_canceladas.slice(0, 2));
      }
    }

    // 4. Analizar cierre (días sin cerrar)
    if (metrics.diasSinCerrar > 14) {
      tips.push(...COACHING_TIPS.cierre_lento.slice(0, 1));
    }

    // 5. Si no hay problemas específicos, dar tip general motivacional
    if (tips.length === 0) {
      const randomTip = COACHING_TIPS.general[Math.floor(Math.random() * COACHING_TIPS.general.length)];
      tips.push(randomTip);
    }

    // Ordenar por prioridad (mayor primero) y limitar a 2 tips
    return tips.sort((a, b) => b.prioridad - a.prioridad).slice(0, 2);
  }

  /**
   * Envía coaching personalizado a un vendedor
   */
  async enviarCoachingPersonalizado(vendedorId: string): Promise<boolean> {
    if (!this.meta) {
      console.error('⚠️ MetaWhatsAppService no configurado para coaching');
      return false;
    }

    const metrics = await this.obtenerMetricasVendedor(vendedorId, 14); // últimas 2 semanas
    if (!metrics || !metrics.phone) {
      console.error(`⚠️ No se pudieron obtener métricas para vendedor ${vendedorId}`);
      return false;
    }

    const tips = this.generarTipsPersonalizados(metrics);
    if (tips.length === 0) return false;

    // Construir mensaje
    const primerTip = tips[0];
    let mensaje = `👋 Hola ${metrics.name.split(' ')[0]}!\n\n${primerTip.mensaje}`;

    if (primerTip.accion) {
      mensaje += `\n\n✅ *Acción:* ${primerTip.accion}`;
    }

    // Mini resumen de métricas si hay margen de mejora
    if (metrics.leadsAsignados > 0) {
      const conversion = Math.round((metrics.leadsConvertidos / metrics.leadsAsignados) * 100);
      mensaje += `\n\n📊 _Tu conversión esta semana: ${conversion}%_`;
    }

    try {
      const teamMember = { id: metrics.id, name: metrics.name, phone: metrics.phone };
      await enviarMensajeTeamMember(this.supabase, this.meta, teamMember as any, mensaje, {
        tipoMensaje: 'notificacion',
        pendingKey: 'pending_mensaje'
      });
      console.log(`🎓 Coaching enviado a ${metrics.name}`);

      // Guardar en notas que se envió coaching
      // Intentar actualizar last_coaching_sent (si la columna existe)
      try {
        await this.supabase.client
          .from('team_members')
          .update({ last_coaching_sent: new Date().toISOString() })
          .eq('id', vendedorId);
      } catch {
        // Si la columna no existe, guardar en notes
        const { data: vendedorActual } = await this.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', vendedorId)
          .single();

        const notasActuales = safeJsonParse(vendedorActual?.notes);

        notasActuales.last_coaching_sent = new Date().toISOString();

        await this.supabase.client
          .from('team_members')
          .update({ notes: notasActuales })
          .eq('id', vendedorId);
      }

      return true;
    } catch (e) {
      console.error(`Error enviando coaching a ${metrics.name}:`, e);
      return false;
    }
  }

  /**
   * Envía coaching a todos los vendedores que no han recibido en N días
   */
  async enviarCoachingEquipo(diasDesdeUltimo: number = 7): Promise<{ enviados: number; errores: number }> {
    if (!this.meta) {
      return { enviados: 0, errores: 0 };
    }

    let enviados = 0;
    let errores = 0;

    try {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - diasDesdeUltimo);

      // Obtener vendedores activos que no han recibido coaching recientemente
      // Nota: usamos select('*') porque last_coaching_sent podría no existir
      const { data: vendedores } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);

      if (!vendedores) return { enviados: 0, errores: 0 };

      for (const vendedor of vendedores) {
        // Verificar si ya recibió coaching recientemente
        // Buscar en campo directo O en notes (fallback)
        let lastCoachingDate = vendedor.last_coaching_sent;
        if (!lastCoachingDate && vendedor.notes) {
          const notas = safeJsonParse(vendedor.notes);
          lastCoachingDate = notas.last_coaching_sent;
        }

        if (lastCoachingDate) {
          const lastCoaching = new Date(lastCoachingDate);
          if (lastCoaching > fechaLimite) {
            console.log(`⏭️ ${vendedor.name} ya recibió coaching el ${lastCoaching.toLocaleDateString()}`);
            continue;
          }
        }

        // Enviar coaching
        const success = await this.enviarCoachingPersonalizado(vendedor.id);
        if (success) {
          enviados++;
        } else {
          errores++;
        }

        // Pequeña pausa para no saturar
        await new Promise(r => setTimeout(r, 500));
      }

      console.log(`🎓 COACHING EQUIPO: ${enviados} enviados, ${errores} errores`);
    } catch (e) {
      console.error('Error en enviarCoachingEquipo:', e);
    }

    return { enviados, errores };
  }

  /**
   * Obtiene coaching para un lead específico (comando: coach [nombre])
   */
  async getCoaching(nombreLead: string, vendedor: any): Promise<{ success: boolean; mensaje?: string; error?: string }> {
    try {
      // 1. Buscar el lead (con fallback accent-tolerant)
      const leads = await findLeadByName(this.supabase, nombreLead, {
        vendedorId: vendedor.id,
        limit: 5
      });

      if (!leads || leads.length === 0) {
        return { success: false, error: `No encontré a "${nombreLead}" en tus leads.\n\n💡 Escribe *leads* para ver tu lista.` };
      }

      const lead = leads[0];

      // 2. Analizar el lead y dar consejos
      let mensaje = `🎯 *COACHING: ${lead.name}*\n\n`;

      // Información del lead
      mensaje += `📊 *Estado actual:*\n`;
      mensaje += `• Status: ${lead.status || 'nuevo'}\n`;
      mensaje += `• Interés: ${lead.property_interest || 'No definido'}\n`;
      mensaje += `• Score: ${lead.score || 0}/100\n\n`;

      // Calcular días desde última actividad
      const diasInactivo = lead.updated_at
        ? Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // 3. Generar consejos basados en status y comportamiento
      mensaje += `💡 *Recomendaciones:*\n\n`;

      if (lead.status === 'new') {
        mensaje += `1️⃣ *Contacto inicial:* Este lead es NUEVO.\n`;
        mensaje += `   → Llámalo en los próximos 5 minutos\n`;
        mensaje += `   → Pregunta: "¿Qué buscas en tu próximo hogar?"\n`;
        mensaje += `   → Meta: Agendar visita HOY\n\n`;
      } else if (lead.status === 'contacted' && diasInactivo > 3) {
        mensaje += `1️⃣ *Re-engagement:* ${diasInactivo} días sin contacto.\n`;
        mensaje += `   → Envía info nueva (video, promo)\n`;
        mensaje += `   → Pregunta: "¿Sigues buscando casa?"\n`;
        mensaje += `   → Ofrece incentivo: "Tengo algo especial para ti"\n\n`;
      } else if (lead.status === 'qualified') {
        mensaje += `1️⃣ *Cierre:* Este lead está CALIFICADO.\n`;
        mensaje += `   → Es momento de agendar visita\n`;
        mensaje += `   → Crea urgencia: "Solo quedan 2 unidades"\n`;
        mensaje += `   → Pregunta directa: "¿Cuándo visitamos?"\n\n`;
      } else if (lead.status === 'visited') {
        mensaje += `1️⃣ *Post-visita:* Ya visitó la propiedad.\n`;
        mensaje += `   → Pregunta: "¿Qué te pareció?"\n`;
        mensaje += `   → Resuelve dudas de financiamiento\n`;
        mensaje += `   → Ofrece separar: "Con $X lo apartamos"\n\n`;
      }

      // Consejo según score
      if (lead.score && lead.score >= 80) {
        mensaje += `2️⃣ *Lead CALIENTE 🔥* - Score ${lead.score}\n`;
        mensaje += `   → Prioridad MÁXIMA - Actúa HOY\n`;
        mensaje += `   → Escribe: *bridge ${lead.name.split(' ')[0]}*\n\n`;
      } else if (lead.score && lead.score < 40) {
        mensaje += `2️⃣ *Lead FRÍO ❄️* - Score ${lead.score}\n`;
        mensaje += `   → Necesita nurturing antes de vender\n`;
        mensaje += `   → Envía contenido educativo\n`;
        mensaje += `   → No presiones, construye confianza\n\n`;
      }

      // Acción inmediata
      mensaje += `✅ *Acción ahora:*\n`;
      if (diasInactivo > 7) {
        mensaje += `Escribe: *bridge ${lead.name.split(' ')[0]}* para reconectar`;
      } else if (lead.status === 'new') {
        mensaje += `Escribe: *bridge ${lead.name.split(' ')[0]}* para presentarte`;
      } else {
        mensaje += `Escribe: *bridge ${lead.name.split(' ')[0]}* para dar seguimiento`;
      }

      return { success: true, mensaje };

    } catch (e) {
      console.error('Error en getCoaching:', e);
      return { success: false, error: 'Error al analizar el lead. Intenta de nuevo.' };
    }
  }

  /**
   * Mensaje de ayuda para el comando coaching
   */
  getMensajeAyudaCoaching(): string {
    return `🎯 *COACHING DE VENTAS*\n\n` +
      `Analizo un lead y te doy consejos personalizados.\n\n` +
      `*Uso:* coach [nombre del lead]\n\n` +
      `*Ejemplos:*\n` +
      `• coach Juan\n` +
      `• coach María López\n\n` +
      `💡 Escribe *leads* para ver tu lista de leads.`;
  }

  /**
   * Genera reporte de coaching para admin/CEO
   */
  async generarReporteCoaching(): Promise<string> {
    try {
      const { data: vendedores } = await this.supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true);

      if (!vendedores || vendedores.length === 0) {
        return 'No hay vendedores activos para analizar.';
      }

      let reporte = `🎓 *REPORTE DE COACHING*\n\n`;
      reporte += `Análisis de ${vendedores.length} vendedores:\n\n`;

      const metricsPromises = vendedores.map(v => this.obtenerMetricasVendedor(v.id, 14));
      const allMetrics = await Promise.all(metricsPromises);

      const vendedoresConMetricas = allMetrics.filter(m => m !== null) as VendorMetrics[];

      // Ordenar por conversión (mejor a peor)
      vendedoresConMetricas.sort((a, b) => {
        const convA = a.leadsAsignados > 0 ? a.leadsConvertidos / a.leadsAsignados : 0;
        const convB = b.leadsAsignados > 0 ? b.leadsConvertidos / b.leadsAsignados : 0;
        return convB - convA;
      });

      for (const m of vendedoresConMetricas.slice(0, 5)) {
        const conversion = m.leadsAsignados > 0 ? Math.round((m.leadsConvertidos / m.leadsAsignados) * 100) : 0;
        const completadas = m.citasAgendadas > 0 ? Math.round((m.citasCompletadas / m.citasAgendadas) * 100) : 0;

        reporte += `*${m.name}*\n`;
        reporte += `├ Conversión: ${conversion}%\n`;
        reporte += `├ Citas completadas: ${completadas}%\n`;
        reporte += `└ Días sin cerrar: ${m.diasSinCerrar}\n\n`;
      }

      if (vendedoresConMetricas.length > 5) {
        reporte += `_...y ${vendedoresConMetricas.length - 5} vendedores más_\n`;
      }

      return reporte;
    } catch (e) {
      console.error('Error generando reporte coaching:', e);
      return 'Error generando reporte.';
    }
  }

  /**
   * Genera una respuesta inteligente cuando no se reconoce el comando
   * Usa Claude para entender la intención y sugerir el comando correcto
   */
  async generateSmartResponse(mensaje: string, vendedor: any, nombre: string): Promise<string> {
    console.log(`🧠 [generateSmartResponse] Iniciando para ${nombre}`);
    console.log(`🧠 [generateSmartResponse] Mensaje: "${mensaje.substring(0, 50)}..."`);
    console.log(`🧠 [generateSmartResponse] Claude disponible: ${!!this.claude}`);

    try {
      if (!this.claude) {
        console.log(`🧠 [generateSmartResponse] ⚠️ Claude NO disponible, usando fallback`);
        return this.getFallbackResponse(mensaje, nombre);
      }

      console.log(`🧠 [generateSmartResponse] ✅ Claude disponible, preparando prompt...`);

      const systemPrompt = `Eres SARA, asistente de ventas inmobiliarias. Un vendedor escribió un mensaje que no coincide con ningún comando.

Tu trabajo es:
1. Entender qué quiere hacer el vendedor
2. Sugerirle el comando correcto de forma amigable

COMANDOS DISPONIBLES:
- "hoy" o "resumen" → Ver resumen del día
- "citas" → Ver citas de hoy
- "leads" → Ver resumen de leads
- "hot" → Ver leads calientes
- "pendientes" → Ver leads sin seguimiento
- "meta" → Ver avance de meta de ventas
- "ver [nombre]" o "historial [nombre]" → Ver conversación con un lead
- "bridge [nombre]" → Chat directo con lead por 6 min
- "nota [nombre] [texto]" → Agregar nota a un lead
- "notas [nombre]" → Ver notas de un lead
- "quien es [nombre]" → Info de un lead
- "agendar [nombre] [fecha]" → Agendar cita
- "cancelar [nombre]" → Cancelar cita
- "coaching [nombre]" → Tips para cerrar un lead
- "mover [nombre] a [etapa]" → Cambiar etapa del lead
- "adelante [nombre]" / "atrás [nombre]" → Mover en funnel

REGLAS:
- Responde en máximo 3 líneas
- Sé amigable pero directo
- Sugiere UN comando específico
- Usa el nombre del vendedor: ${nombre}
- Si no entiendes, pregunta qué quiere hacer`;

      console.log(`🧠 [generateSmartResponse] Llamando a claude.chat()...`);
      const response = await this.claude.chat([], mensaje, systemPrompt);
      console.log(`🧠 [generateSmartResponse] Respuesta de Claude (${response?.length || 0} chars): "${response?.substring(0, 100)}..."`);

      if (response && response.length > 10) {
        console.log(`🧠 [generateSmartResponse] ✅ Usando respuesta de Claude`);
        return response;
      }

      console.log(`🧠 [generateSmartResponse] ⚠️ Respuesta de Claude muy corta, usando fallback`);
      return this.getFallbackResponse(mensaje, nombre);
    } catch (e) {
      console.error('❌ [generateSmartResponse] Error:', e);
      return this.getFallbackResponse(mensaje, nombre);
    }
  }

  private getFallbackResponse(mensaje: string, nombre: string): string {
    // Intentar detectar intención básica sin IA
    const msg = mensaje.toLowerCase();

    if (msg.includes('nota') && !msg.includes(' ')) {
      return `${nombre}, para agregar una nota escribe:\n*nota [nombre del lead] [tu nota]*\n\nEjemplo: nota Juan hablé por tel`;
    }

    if (msg.includes('notas') && !msg.includes(' ')) {
      return `${nombre}, para ver notas escribe:\n*notas [nombre del lead]*\n\nEjemplo: notas Juan`;
    }

    if (msg.includes('ver') && !msg.includes(' ')) {
      return `${nombre}, para ver el historial escribe:\n*ver [nombre del lead]*\n\nEjemplo: ver Juan`;
    }

    if (msg.includes('bridge') && !msg.includes(' ')) {
      return `${nombre}, para chat directo escribe:\n*bridge [nombre del lead]*\n\nEjemplo: bridge Juan`;
    }

    if (msg.includes('cita') || msg.includes('agendar')) {
      return `${nombre}, para agendar cita escribe:\n*agendar [nombre] [fecha]*\n\nEjemplo: agendar Juan mañana 10am`;
    }

    // Respuesta genérica amigable
    return `${nombre}, no entendí "${mensaje.substring(0, 30)}${mensaje.length > 30 ? '...' : ''}".\n\n¿Qué quieres hacer? Puedo ayudarte con:\n• *ver [lead]* - historial\n• *nota [lead] [texto]* - agregar nota\n• *citas* - ver citas de hoy`;
  }
}
