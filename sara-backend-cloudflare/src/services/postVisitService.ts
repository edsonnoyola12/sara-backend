import { SupabaseService } from './supabase';

/**
 * PostVisitService - Maneja el flujo completo post-visita
 *
 * FLUJO:
 * 1. Cita pasa → Pregunta a vendedor: ¿Llegó el lead?
 * 2. Si llegó → Pregunta: ¿Qué te pareció?
 * 3. Guarda feedback vendedor → Envía encuesta a lead
 * 4. Si no llegó → Pregunta: ¿Ya contactaste para reagendar?
 * 5. Maneja reagendamiento / no-show / lost
 */

// Estados posibles en el flujo post-visita
export type PostVisitState =
  | 'pending_arrival_check'      // Esperando: ¿Llegó?
  | 'pending_vendor_feedback'    // Esperando: ¿Qué te pareció? (si llegó)
  | 'pending_noshow_action'      // Esperando: ¿Ya contactaste? (si no llegó)
  | 'pending_reschedule_date'    // Esperando: ¿Para cuándo? (si reagendó)
  | 'pending_lost_reason'        // Esperando: ¿Por qué no le interesa?
  | 'pending_client_survey'      // Esperando respuesta del lead
  | 'completed';                 // Flujo terminado

export interface PostVisitContext {
  state: PostVisitState;
  sent_at: string;
  appointment_id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  vendedor_id: string;
  vendedor_name: string;
  vendedor_phone: string;
  property: string;
  // Datos adicionales según el estado
  arrived?: boolean;
  vendor_rating?: number;
  vendor_rating_text?: string;
  noshow_action?: string;
}

export class PostVisitService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════
  // PASO 1: Iniciar flujo - Preguntar al vendedor si llegó el lead
  // ═══════════════════════════════════════════════════════════════════
  async iniciarFlujoPostVisita(
    appointment: any,
    lead: any,
    vendedor: any
  ): Promise<{ mensaje: string; context: PostVisitContext }> {
    const nombreCorto = lead.name?.split(' ')[0] || 'el cliente';

    const context: PostVisitContext = {
      state: 'pending_arrival_check',
      sent_at: new Date().toISOString(),
      appointment_id: appointment.id,
      lead_id: lead.id,
      lead_name: lead.name || 'Cliente',
      lead_phone: lead.phone,
      vendedor_id: vendedor.id,
      vendedor_name: vendedor.name,
      vendedor_phone: vendedor.phone,
      property: lead.property_interest || appointment.property_name || appointment.property || 'la propiedad'
    };

    // Guardar contexto en las notas del vendedor (team_member)
    await this.guardarContextoVendedor(vendedor.id, context);

    const mensaje = `📋 *POST-VISITA: ${lead.name?.toUpperCase()}*\n\n` +
      `¿Llegó ${nombreCorto} a la cita de hoy en *${context.property}*?\n\n` +
      `1️⃣ Sí, llegó\n` +
      `2️⃣ No llegó`;

    return { mensaje, context };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROCESAR RESPUESTAS DEL VENDEDOR
  // ═══════════════════════════════════════════════════════════════════
  async procesarRespuestaVendedor(
    vendedorId: string,
    mensaje: string
  ): Promise<{
    respuesta: string;
    context: PostVisitContext;
    accion?: 'enviar_encuesta_lead' | 'crear_followup' | 'reagendar' | 'marcar_lost';
    datos?: any;
  } | null> {
    // Obtener contexto actual
    const context = await this.obtenerContextoVendedor(vendedorId);
    if (!context) return null;

    const msgLimpio = mensaje.trim().toLowerCase();
    const nombreCorto = context.lead_name.split(' ')[0];

    switch (context.state) {
      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando si llegó o no
      // ─────────────────────────────────────────────────────────────
      case 'pending_arrival_check':
        if (msgLimpio === '1' || msgLimpio.includes('sí') || msgLimpio.includes('si') || msgLimpio.includes('llegó')) {
          // SÍ LLEGÓ → Preguntar qué tal
          context.state = 'pending_vendor_feedback';
          context.arrived = true;
          await this.guardarContextoVendedor(vendedorId, context);

          return {
            respuesta: `👍 Perfecto. ¿Cómo ves a *${nombreCorto}*?\n\n` +
              `1️⃣ Muy interesado, quiere avanzar 🔥\n` +
              `2️⃣ Interesado, quiere ver más opciones\n` +
              `3️⃣ Tibio, tiene dudas\n` +
              `4️⃣ No le convenció`,
            context
          };
        } else if (msgLimpio === '2' || msgLimpio.includes('no llegó') || msgLimpio.includes('no llego')) {
          // NO LLEGÓ → Preguntar si ya contactó
          context.state = 'pending_noshow_action';
          context.arrived = false;
          await this.guardarContextoVendedor(vendedorId, context);

          // Actualizar cita como no-show
          await this.supabase.client
            .from('appointments')
            .update({ status: 'no_show' })
            .eq('id', context.appointment_id);

          return {
            respuesta: `😔 Entendido. ¿Ya contactaste a *${nombreCorto}* para reagendar?\n\n` +
              `1️⃣ Sí, ya reagendamos para otra fecha\n` +
              `2️⃣ No contesta / no he podido\n` +
              `3️⃣ Ya no le interesa`,
            context
          };
        }
        return {
          respuesta: `Por favor responde:\n1️⃣ Sí, llegó\n2️⃣ No llegó`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando feedback del vendedor (si llegó)
      // ─────────────────────────────────────────────────────────────
      case 'pending_vendor_feedback':
        const ratingMap: { [key: string]: { rating: number; text: string; status: string } } = {
          '1': { rating: 1, text: 'Muy interesado', status: 'hot' },
          '2': { rating: 2, text: 'Interesado', status: 'warm' },
          '3': { rating: 3, text: 'Tibio', status: 'warm' },
          '4': { rating: 4, text: 'No le convenció', status: 'cold' }
        };

        const ratingInfo = ratingMap[msgLimpio] || ratingMap['2']; // Default a interesado
        context.vendor_rating = ratingInfo.rating;
        context.vendor_rating_text = ratingInfo.text;
        context.state = 'pending_client_survey';

        // Guardar feedback en el lead
        await this.guardarFeedbackVendedor(context, ratingInfo);

        // Preparar encuesta para el lead
        await this.prepararEncuestaLead(context);

        // Limpiar contexto del vendedor
        await this.limpiarContextoVendedor(vendedorId);

        const emoji = ratingInfo.rating === 1 ? '🔥' : ratingInfo.rating === 4 ? '❄️' : '👍';

        return {
          respuesta: `${emoji} Guardado: *${ratingInfo.text}*\n\n` +
            `Le enviaré una encuesta a ${nombreCorto} para conocer su opinión.\n` +
            `Te avisaré cuando responda.`,
          context,
          accion: 'enviar_encuesta_lead',
          datos: {
            lead_phone: context.lead_phone,
            lead_name: context.lead_name,
            property: context.property
          }
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando acción por no-show
      // ─────────────────────────────────────────────────────────────
      case 'pending_noshow_action':
        if (msgLimpio === '1' || msgLimpio.includes('reagend')) {
          // Ya reagendaron → Pedir fecha
          context.state = 'pending_reschedule_date';
          context.noshow_action = 'rescheduled';
          await this.guardarContextoVendedor(vendedorId, context);

          return {
            respuesta: `📅 ¿Para cuándo quedaron?\n\n` +
              `Puedes decirme:\n` +
              `• "Mañana a las 10"\n` +
              `• "Lunes 3pm"\n` +
              `• "20 de enero 11am"`,
            context
          };
        } else if (msgLimpio === '2' || msgLimpio.includes('no contesta')) {
          // No contesta → Crear follow-up automático
          context.noshow_action = 'no_answer';
          await this.limpiarContextoVendedor(vendedorId);

          // Marcar lead para follow-up
          await this.crearFollowupNoShow(context);

          return {
            respuesta: `📱 Entendido. Le enviaré un mensaje a *${nombreCorto}* preguntando si quiere reagendar.\n\n` +
              `Si responde, te aviso para que lo atiendas.`,
            context,
            accion: 'crear_followup',
            datos: {
              lead_phone: context.lead_phone,
              lead_name: context.lead_name,
              property: context.property,
              tipo: 'no_show_followup'
            }
          };
        } else if (msgLimpio === '3' || msgLimpio.includes('no le interesa') || msgLimpio.includes('ya no')) {
          // Ya no le interesa → Pedir razón opcional
          context.state = 'pending_lost_reason';
          context.noshow_action = 'lost';
          await this.guardarContextoVendedor(vendedorId, context);

          return {
            respuesta: `😔 Qué lástima. ¿Sabes por qué ya no le interesa?\n\n` +
              `(Puedes escribir la razón o "no sé")`,
            context
          };
        }
        return {
          respuesta: `Por favor responde:\n1️⃣ Ya reagendamos\n2️⃣ No contesta\n3️⃣ Ya no le interesa`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando fecha de reagendamiento
      // ─────────────────────────────────────────────────────────────
      case 'pending_reschedule_date':
        // Parsear la fecha del mensaje
        const fechaParseada = this.parsearFechaColoquial(msgLimpio);

        if (fechaParseada) {
          await this.limpiarContextoVendedor(vendedorId);

          // Extraer ubicación si el vendedor la mencionó (ej: "en las oficinas de santarita")
          const ubicacionNueva = this.extraerUbicacion(mensaje);
          const ubicacionFinal = ubicacionNueva || context.property;

          return {
            respuesta: `✅ Perfecto, agendaré la cita para:\n\n` +
              `📅 *${this.formatearFecha(fechaParseada)}*\n` +
              `🏠 ${ubicacionFinal}\n` +
              `👤 ${context.lead_name}\n\n` +
              `Le enviaré confirmación a ${nombreCorto}.`,
            context,
            accion: 'reagendar',
            datos: {
              lead_id: context.lead_id,
              lead_phone: context.lead_phone,
              lead_name: context.lead_name,
              property: ubicacionFinal,
              fecha: fechaParseada,
              vendedor_id: context.vendedor_id
            }
          };
        } else {
          return {
            respuesta: `No entendí la fecha. Por favor escríbela así:\n` +
              `• "Mañana a las 10"\n` +
              `• "Lunes 3pm"\n` +
              `• "20 de enero 11am"`,
            context
          };
        }

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando razón de pérdida
      // ─────────────────────────────────────────────────────────────
      case 'pending_lost_reason':
        const razon = mensaje.trim() || 'No especificada';
        await this.limpiarContextoVendedor(vendedorId);

        // Marcar lead como lost
        await this.marcarLeadLost(context, razon);

        return {
          respuesta: `📝 Guardado. Marcaré a *${nombreCorto}* como no interesado.\n\n` +
            `Razón: ${razon}\n\n` +
            `En 30 días le enviaré un mensaje de rescate por si cambia de opinión.`,
          context,
          accion: 'marcar_lost',
          datos: {
            lead_id: context.lead_id,
            razon
          }
        };

      default:
        return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private async guardarContextoVendedor(vendedorId: string, context: PostVisitContext): Promise<void> {
    try {
      console.log(`📋 GUARDANDO CONTEXTO: vendedorId=${vendedorId}, state=${context.state}`);

      const { data: vendedor, error: selectError } = await this.supabase.client
        .from('team_members')
        .select('id, name, notes')
        .eq('id', vendedorId)
        .single();

      if (selectError) {
        console.log(`📋 GUARDANDO CONTEXTO: Error select: ${selectError.message}`);
        return;
      }

      console.log(`📋 GUARDANDO CONTEXTO: vendedor encontrado = ${vendedor?.name || 'N/A'}`);
      console.log(`📋 GUARDANDO CONTEXTO: notas type = ${typeof vendedor?.notes}`);

      // IMPORTANTE: notes puede ser string (JSON) u objeto
      let notas: any = {};
      if (vendedor?.notes) {
        if (typeof vendedor.notes === 'string') {
          try {
            notas = JSON.parse(vendedor.notes);
          } catch (e) {
            notas = {};
          }
        } else if (typeof vendedor.notes === 'object') {
          notas = { ...vendedor.notes };
        }
      }
      notas.post_visit_context = context;

      console.log(`📋 GUARDANDO CONTEXTO: nuevas notas = ${JSON.stringify(notas).substring(0, 300)}`);

      const { data: updateResult, error: updateError } = await this.supabase.client
        .from('team_members')
        .update({ notes: notas })
        .eq('id', vendedorId)
        .select('id, notes');

      if (updateError) {
        console.log(`📋 GUARDANDO CONTEXTO: Error update: ${updateError.message}`);
      } else {
        console.log(`📋 GUARDANDO CONTEXTO: updateResult = ${JSON.stringify(updateResult)?.substring(0, 200)}`);

        // Verificar inmediatamente que se guardó
        const { data: verify } = await this.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', vendedorId)
          .single();

        const hasContext = verify?.notes?.post_visit_context ? 'SÍ' : 'NO';
        console.log(`📋 GUARDANDO CONTEXTO: VERIFICACIÓN - tiene post_visit_context? ${hasContext}`);
        console.log(`📋 GUARDANDO CONTEXTO: OK - vendedor_phone=${context.vendedor_phone}`);
      }
    } catch (e) {
      console.error('Error guardando contexto vendedor:', e);
    }
  }

  async obtenerContextoVendedor(vendedorId: string): Promise<PostVisitContext | null> {
    try {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      // IMPORTANTE: notes puede ser string (JSON) u objeto
      let notas: any = {};
      if (vendedor?.notes) {
        if (typeof vendedor.notes === 'string') {
          try {
            notas = JSON.parse(vendedor.notes);
          } catch (e) {
            notas = {};
          }
        } else if (typeof vendedor.notes === 'object') {
          notas = vendedor.notes;
        }
      }
      return notas.post_visit_context || null;
    } catch (e) {
      return null;
    }
  }

  async buscarVendedorConContexto(phone: string): Promise<{ vendedor: any; context: PostVisitContext } | null> {
    try {
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);

      const { data: vendedores } = await this.supabase.client
        .from('team_members')
        .select('*')
        .ilike('phone', `%${phoneSuffix}`);

      if (!vendedores) return null;

      for (const vendedor of vendedores) {
        // IMPORTANTE: notes puede ser string (JSON) u objeto
        let notas: any = {};
        if (vendedor.notes) {
          if (typeof vendedor.notes === 'string') {
            try { notas = JSON.parse(vendedor.notes); } catch (e) { notas = {}; }
          } else if (typeof vendedor.notes === 'object') {
            notas = vendedor.notes;
          }
        }
        if (notas.post_visit_context) {
          return { vendedor, context: notas.post_visit_context };
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  private async limpiarContextoVendedor(vendedorId: string): Promise<void> {
    try {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      // IMPORTANTE: notes puede ser string (JSON) u objeto
      let notas: any = {};
      if (vendedor?.notes) {
        if (typeof vendedor.notes === 'string') {
          try { notas = JSON.parse(vendedor.notes); } catch (e) { notas = {}; }
        } else if (typeof vendedor.notes === 'object') {
          notas = { ...vendedor.notes };
        }
      }
      delete notas.post_visit_context;

      await this.supabase.client
        .from('team_members')
        .update({ notes: notas })
        .eq('id', vendedorId);
    } catch (e) {
      console.error('Error limpiando contexto vendedor:', e);
    }
  }

  private async guardarFeedbackVendedor(context: PostVisitContext, ratingInfo: any): Promise<void> {
    try {
      // Actualizar lead
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', context.lead_id)
        .single();

      const notas = typeof lead?.notes === 'object' ? lead.notes : {};
      notas.vendor_feedback = {
        rating: ratingInfo.rating,
        rating_text: ratingInfo.text,
        vendedor_id: context.vendedor_id,
        vendedor_name: context.vendedor_name,
        fecha: new Date().toISOString()
      };

      await this.supabase.client
        .from('leads')
        .update({
          notes: notas,
          status: ratingInfo.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', context.lead_id);

      // Actualizar cita
      await this.supabase.client
        .from('appointments')
        .update({
          status: 'completed',
          notes: `Feedback vendedor: ${ratingInfo.text}`
        })
        .eq('id', context.appointment_id);

      // Registrar actividad
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: context.lead_id,
          team_member_id: context.vendedor_id,
          activity_type: 'visit_completed',
          notes: `Visita completada - Vendedor: ${ratingInfo.text}`,
          created_at: new Date().toISOString()
        });

    } catch (e) {
      console.error('Error guardando feedback vendedor:', e);
    }
  }

  private async prepararEncuestaLead(context: PostVisitContext): Promise<void> {
    try {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', context.lead_id)
        .single();

      const notas = typeof lead?.notes === 'object' ? lead.notes : {};
      notas.pending_client_survey = {
        sent_at: new Date().toISOString(),
        property: context.property,
        vendedor_id: context.vendedor_id,
        vendedor_name: context.vendedor_name,
        vendedor_phone: context.vendedor_phone,
        vendor_rating: context.vendor_rating,
        vendor_rating_text: context.vendor_rating_text
      };

      await this.supabase.client
        .from('leads')
        .update({ notes: notas })
        .eq('id', context.lead_id);

    } catch (e) {
      console.error('Error preparando encuesta lead:', e);
    }
  }

  private async crearFollowupNoShow(context: PostVisitContext): Promise<void> {
    try {
      // Marcar cita como no_show
      await this.supabase.client
        .from('appointments')
        .update({
          status: 'no_show',
          notes: 'Cliente no llegó - Follow-up programado'
        })
        .eq('id', context.appointment_id);

      // Actualizar lead
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', context.lead_id)
        .single();

      const notas = typeof lead?.notes === 'object' ? lead.notes : {};
      notas.pending_noshow_followup = {
        sent_at: new Date().toISOString(),
        property: context.property,
        vendedor_id: context.vendedor_id,
        vendedor_name: context.vendedor_name,
        vendedor_phone: context.vendedor_phone,
        original_appointment_id: context.appointment_id
      };

      await this.supabase.client
        .from('leads')
        .update({
          notes: notas,
          status: 'no_show',
          updated_at: new Date().toISOString()
        })
        .eq('id', context.lead_id);

    } catch (e) {
      console.error('Error creando followup no-show:', e);
    }
  }

  private async marcarLeadLost(context: PostVisitContext, razon: string): Promise<void> {
    try {
      await this.supabase.client
        .from('appointments')
        .update({
          status: 'cancelled',
          notes: `Lead no interesado: ${razon}`
        })
        .eq('id', context.appointment_id);

      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', context.lead_id)
        .single();

      const notas = typeof lead?.notes === 'object' ? lead.notes : {};
      notas.lost_reason = {
        razon,
        fecha: new Date().toISOString(),
        reportado_por: context.vendedor_name
      };

      await this.supabase.client
        .from('leads')
        .update({
          notes: notas,
          status: 'lost',
          updated_at: new Date().toISOString()
        })
        .eq('id', context.lead_id);

      // Programar rescate en 30 días (crear en scheduled_messages si existe)
      // Por ahora solo registrar actividad
      await this.supabase.client
        .from('lead_activities')
        .insert({
          lead_id: context.lead_id,
          team_member_id: context.vendedor_id,
          activity_type: 'lost',
          notes: `Marcado como perdido: ${razon}`,
          created_at: new Date().toISOString()
        });

    } catch (e) {
      console.error('Error marcando lead lost:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PARSEO DE FECHAS COLOQUIALES
  // ═══════════════════════════════════════════════════════════════════
  private parsearFechaColoquial(texto: string): Date | null {
    const ahora = new Date();
    const textoLower = texto.toLowerCase();

    // Extraer hora si existe
    let hora = 10; // Default 10am
    let minutos = 0;

    const horaMatch = textoLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?)?/);
    if (horaMatch) {
      hora = parseInt(horaMatch[1]);
      minutos = horaMatch[2] ? parseInt(horaMatch[2]) : 0;
      if (horaMatch[3]?.includes('pm') && hora < 12) hora += 12;
      if (horaMatch[3]?.includes('am') && hora === 12) hora = 0;
    }

    // Detectar día
    if (textoLower.includes('mañana')) {
      const fecha = new Date(ahora);
      fecha.setDate(fecha.getDate() + 1);
      fecha.setHours(hora, minutos, 0, 0);
      return fecha;
    }

    if (textoLower.includes('pasado mañana')) {
      const fecha = new Date(ahora);
      fecha.setDate(fecha.getDate() + 2);
      fecha.setHours(hora, minutos, 0, 0);
      return fecha;
    }

    // Días de la semana
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado'];
    for (let i = 0; i < dias.length; i++) {
      if (textoLower.includes(dias[i])) {
        const diaTarget = i <= 6 ? i : i - 1; // Ajustar miercoles/sabado
        const fecha = new Date(ahora);
        const diaActual = fecha.getDay();
        let diasHasta = diaTarget - diaActual;
        if (diasHasta <= 0) diasHasta += 7;
        fecha.setDate(fecha.getDate() + diasHasta);
        fecha.setHours(hora, minutos, 0, 0);
        return fecha;
      }
    }

    // Fecha específica (ej: "20 de enero")
    const fechaMatch = textoLower.match(/(\d{1,2})\s*(?:de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
    if (fechaMatch) {
      const meses: { [key: string]: number } = {
        'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
        'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
      };
      const fecha = new Date(ahora.getFullYear(), meses[fechaMatch[2]], parseInt(fechaMatch[1]), hora, minutos);
      if (fecha < ahora) fecha.setFullYear(fecha.getFullYear() + 1);
      return fecha;
    }

    return null;
  }

  private formatearFecha(fecha: Date): string {
    const opciones: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    };
    return fecha.toLocaleDateString('es-MX', opciones);
  }

  // Extraer ubicación del mensaje (ej: "mañana a las 6 en las oficinas de santarita")
  private extraerUbicacion(texto: string): string | null {
    // Patrones para detectar ubicación
    // Soporta: "en las oficinas de X", "en las oficinas X", "en el desarrollo X"
    // La ubicación puede estar al final del mensaje (después de la hora)
    const patrones = [
      // "en las oficinas de santarita" (al final del mensaje)
      /en\s+las?\s+oficinas?\s+(?:de\s+)?([a-záéíóúñ\s]+)$/i,
      // "en las oficinas matriz de santarita"
      /en\s+las?\s+oficinas?\s+matriz\s+(?:de\s+)?([a-záéíóúñ\s]+)$/i,
      // "en el desarrollo X" (al final)
      /en\s+el\s+desarrollo\s+([a-záéíóúñ\s]+)$/i,
      // "en santarita" (solo nombre al final)
      /en\s+([a-záéíóúñ]+)$/i,
      // Fallback: ubicación antes de "a las X" (orden inverso)
      /en\s+las?\s+oficinas?\s+(?:de\s+)?(.+?)(?:\s+a\s+las)/i,
      /en\s+el\s+desarrollo\s+(.+?)(?:\s+a\s+las)/i
    ];

    for (const patron of patrones) {
      const match = texto.match(patron);
      if (match && match[1]) {
        // Limpiar y capitalizar
        let ubicacion = match[1].trim();
        // Remover números al final (parte de la hora si quedó)
        ubicacion = ubicacion.replace(/\s+\d+.*$/, '').trim();
        if (ubicacion.length > 2) {
          // Capitalizar primera letra de cada palabra
          return ubicacion.split(' ')
            .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
            .join(' ');
        }
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // GENERAR MENSAJE DE ENCUESTA PARA EL LEAD
  // ═══════════════════════════════════════════════════════════════════
  generarMensajeEncuestaLead(leadName: string, property: string): string {
    const nombreCorto = leadName.split(' ')[0];
    return `¡Hola ${nombreCorto}! 👋\n\n` +
      `Gracias por visitarnos en *${property}*. 🏠\n\n` +
      `¿Qué te pareció? Responde:\n\n` +
      `1️⃣ Me encantó, quiero avanzar\n` +
      `2️⃣ Quiero ver más opciones\n` +
      `3️⃣ Tengo dudas\n\n` +
      `Estoy aquí para ayudarte. 😊`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // GENERAR MENSAJE DE FOLLOW-UP PARA NO-SHOW
  // ═══════════════════════════════════════════════════════════════════
  generarMensajeNoShowFollowup(leadName: string, property: string): string {
    const nombreCorto = leadName.split(' ')[0];
    return `Hola ${nombreCorto} 👋\n\n` +
      `Ayer no pudimos verte en *${property}*. Esperamos que todo esté bien.\n\n` +
      `¿Te gustaría reagendar tu visita? Responde *SÍ* y te ayudo a encontrar un nuevo horario. 📅`;
  }
}
