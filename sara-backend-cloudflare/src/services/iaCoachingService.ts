import { SupabaseService } from './supabase';
import { MetaWhatsAppService } from './meta-whatsapp';

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
        .select('id, status, created_at, updated_at')
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
        tiempoPromedioRespuesta: 0, // TODO: calcular desde conversaciones
        diasSinCerrar,
        mensajesEnviados: 0, // TODO: calcular desde conversations
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
      console.log('⚠️ MetaWhatsAppService no configurado para coaching');
      return false;
    }

    const metrics = await this.obtenerMetricasVendedor(vendedorId, 14); // últimas 2 semanas
    if (!metrics || !metrics.phone) {
      console.log(`⚠️ No se pudieron obtener métricas para vendedor ${vendedorId}`);
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
      await this.meta.sendWhatsAppMessage(metrics.phone, mensaje);
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

        const notasActuales = typeof vendedorActual?.notes === 'string'
          ? JSON.parse(vendedorActual.notes || '{}')
          : (vendedorActual?.notes || {});

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
          const notas = typeof vendedor.notes === 'string'
            ? JSON.parse(vendedor.notes || '{}')
            : (vendedor.notes || {});
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
}
