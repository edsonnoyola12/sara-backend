// ═══════════════════════════════════════════════════════════════════════════
// CREDIT FLOW SERVICE - Flujo completo de crédito hipotecario
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

export interface CreditFlowContext {
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  state: 'pedir_nombre' | 'esperando_banco' | 'ofrecer_simulacion' | 'esperando_ingreso' | 'esperando_enganche' | 'mostrar_simulacion' | 'esperando_modalidad' | 'esperando_cita_presencial' | 'conectando_asesor' | 'completado';
  banco_preferido?: string;
  ingreso_mensual?: number;
  enganche?: number;
  capacidad_credito?: number;
  modalidad?: string;
  asesor_id?: string;
  asesor_name?: string;
  asesor_phone?: string;
  desarrollo_interes?: string;
  vendedor_original_id?: string;
  created_at: string;
  updated_at: string;
}

export class CreditFlowService {
  constructor(
    private supabase: SupabaseService,
    private openaiKey?: string
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // DETECTAR SI USUARIO YA TIENE CRÉDITO (no necesita simulación)
  // ═══════════════════════════════════════════════════════════════════
  private yaTieneCredito(msgLower: string): boolean {
    const frases = [
      'ya tengo credito', 'ya tengo crédito', 'ya tengo mi credito', 'ya tengo mi crédito',
      'ya tengo el credito', 'ya tengo el crédito', 'ya cuento con credito', 'ya cuento con crédito',
      'ya lo tengo', 'tengo aprobado', 'me aprobaron', 'ya me aprobaron',
      'ya estoy preaprobado', 'ya tengo preaprobacion', 'ya tengo preaprobación',
      'no necesito credito', 'no necesito crédito', 'no ocupo credito', 'no ocupo crédito',
      'ya twngo credito', 'ya t2ngo', // typos comunes
    ];
    return frases.some(f => msgLower.includes(f));
  }

  // ═══════════════════════════════════════════════════════════════════
  // DETECTAR PREGUNTAS NO RELACIONADAS CON EL FLUJO DE CRÉDITO
  // ═══════════════════════════════════════════════════════════════════
  private esPreguntaNoRelacionada(msgLower: string): boolean {
    // Si ya tiene crédito, salir del flujo
    if (this.yaTieneCredito(msgLower)) {
      return true;
    }

    const preguntasNoRelacionadas = [
      'promocion', 'promoción', 'descuento', 'oferta',
      'precio', 'cuanto cuesta', 'cuánto cuesta', 'cuestan',
      'ubicacion', 'ubicación', 'donde queda', 'dónde queda', 'direccion', 'dirección',
      'casa', 'casas', 'desarrollo', 'modelo', 'modelos',
      'recamara', 'recámara', 'habitacion', 'habitación',
      'cita', 'visita', 'conocer', 'quiero ver',
      'horario', 'cuando abren', 'cuándo abren', 'disponible',
      'amenidad', 'alberca', 'gimnasio', 'seguridad',
      'que incluye', 'qué incluye', 'tienen algo', 'hay algo',
      'foto', 'fotos', 'video', 'videos', 'imagen',
      'mapa', 'como llego', 'cómo llego'
    ];

    // Si contiene palabras clave de preguntas no relacionadas
    if (preguntasNoRelacionadas.some(p => msgLower.includes(p))) {
      return true;
    }

    // Si es una pregunta larga (probablemente no es solo selección)
    if (msgLower.includes('?') && msgLower.length > 30) {
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CANCELAR FLUJO DE CRÉDITO (cuando el lead cambia de tema)
  // ═══════════════════════════════════════════════════════════════════
  async cancelarFlujo(leadId: string, razon?: string): Promise<void> {
    try {
      // Obtener notas actuales
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes, status, name, assigned_to')
        .eq('id', leadId)
        .single();

      if (lead) {
        let notas: any = {};
        if (lead.notes) {
          if (typeof lead.notes === 'string') {
            try { notas = JSON.parse(lead.notes); } catch { notas = {}; }
          } else {
            notas = lead.notes;
          }
        }

        // Guardar historial de abandono antes de eliminar contexto
        const contextoAnterior = notas.credit_flow_context;
        if (!notas.credit_flow_abandonos) notas.credit_flow_abandonos = [];
        notas.credit_flow_abandonos.push({
          fecha: new Date().toISOString(),
          estado_abandonado: contextoAnterior?.state || 'desconocido',
          razon: razon || 'cambio_tema',
          banco_preferido: contextoAnterior?.banco_preferido,
          ingreso_mensual: contextoAnterior?.ingreso_mensual
        });

        // Eliminar contexto de flujo de crédito
        delete notas.credit_flow_context;

        // Actualizar lead - quitar status de credit_flow
        const { error: errCancelFlow } = await this.supabase.client
          .from('leads')
          .update({
            notes: notas,
            status: lead.status === 'credit_flow' ? 'contacted' : lead.status
          })
          .eq('id', leadId);
        if (errCancelFlow) console.error('⚠️ Error updating lead cancelar flujo:', errCancelFlow);

        // Registrar en lead_activities
        try {
          await this.supabase.client.from('lead_activities').insert({
            lead_id: leadId,
            activity_type: 'credit_flow_abandoned',
            notes: `Flujo de crédito abandonado en estado: ${contextoAnterior?.state || 'desconocido'}. Razón: ${razon || 'cambio_tema'}`,
            created_at: new Date().toISOString()
          });
        } catch (actErr) {
          console.error('⚠️ Error registrando actividad abandono:', actErr);
        }

        // Notificar al asesor si había uno asignado
        if (contextoAnterior?.asesor_id) {
          try {
            const { data: asesor } = await this.supabase.client
              .from('team_members')
              .select('phone, name')
              .eq('id', contextoAnterior.asesor_id)
              .single();

            if (asesor?.phone) {
              // Se notificará externamente
              console.log(`📤 Asesor ${asesor.name} debería ser notificado del abandono`);
            }
          } catch (asesorErr) {
            console.error('⚠️ Error obteniendo asesor para notificar:', asesorErr);
          }
        }

        console.log(`🏦 Flujo de crédito CANCELADO para lead ${leadId} (razón: ${razon || 'cambio_tema'})`);
      }
    } catch (e) {
      console.error('⚠️ Error cancelando flujo de crédito:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // INICIAR FLUJO DE CRÉDITO
  // ═══════════════════════════════════════════════════════════════════
  async iniciarFlujoCredito(lead: any): Promise<{ mensaje: string; context: CreditFlowContext }> {
    const tieneNombre = lead.name && lead.name !== 'Sin nombre' && lead.name !== 'Cliente' && !lead.name.includes('521');

    const context: CreditFlowContext = {
      lead_id: lead.id,
      lead_name: lead.name || '',
      lead_phone: lead.phone,
      state: tieneNombre ? 'esperando_banco' : 'pedir_nombre',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.guardarContexto(lead.id, context);

    // Marcar lead como en flujo de crédito
    const { error: errIniciarFlujo } = await this.supabase.client
      .from('leads')
      .update({
        needs_mortgage: true,
        status: 'credit_flow'
      })
      .eq('id', lead.id);
    if (errIniciarFlujo) console.error('⚠️ Error updating lead iniciar flujo crédito:', errIniciarFlujo);

    if (!tieneNombre) {
      return {
        mensaje: `¡Hola! 😊 Con gusto te ayudo con tu crédito hipotecario.

Para darte una mejor atención, ¿me compartes tu nombre?`,
        context
      };
    }

    const nombreCorto = lead.name.split(' ')[0];
    return {
      mensaje: `¡Hola ${nombreCorto}! 😊 Con gusto te ayudo con tu crédito hipotecario.

¿Tienes algún banco de preferencia?

🏦 BBVA
🏦 Banorte
🏦 HSBC
🏦 Santander
🏦 Scotiabank
🏦 Banregio
🏦 Infonavit
🏦 Fovissste

Escribe el nombre del banco o "no sé" si quieres que te oriente.`,
      context
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROCESAR RESPUESTA EN FLUJO DE CRÉDITO
  // ═══════════════════════════════════════════════════════════════════
  async procesarRespuesta(
    leadId: string,
    mensaje: string
  ): Promise<{
    respuesta: string;
    context: CreditFlowContext;
    accion?: 'conectar_asesor';
    datos?: any;
  } | null> {
    const context = await this.obtenerContexto(leadId);
    if (!context) return null;

    const msgLimpio = mensaje.trim();
    const msgLower = msgLimpio.toLowerCase();

    switch (context.state) {
      // ─────────────────────────────────────────────────────────────
      // ESTADO: Pedir nombre
      // ─────────────────────────────────────────────────────────────
      case 'pedir_nombre':
        // Extraer nombre del mensaje
        const nombreExtraido = this.extraerNombre(msgLimpio);

        if (nombreExtraido) {
          context.lead_name = nombreExtraido;
          context.state = 'esperando_banco';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          // Actualizar nombre en lead
          const { error: errNombre } = await this.supabase.client
            .from('leads')
            .update({ name: nombreExtraido })
            .eq('id', leadId);
          if (errNombre) console.error('⚠️ Error updating lead name in credit flow:', errNombre);

          return {
            respuesta: `¡Mucho gusto ${nombreExtraido}! 🤝

¿Tienes algún banco de preferencia para tu crédito?

🏦 BBVA
🏦 Banorte
🏦 HSBC
🏦 Santander
🏦 Scotiabank
🏦 Banregio
🏦 Infonavit
🏦 Fovissste

Escribe el nombre del banco o "no sé" si quieres que te oriente.`,
            context
          };
        }

        return {
          respuesta: `¿Me puedes compartir tu nombre para atenderte mejor? 😊`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando selección de banco
      // ─────────────────────────────────────────────────────────────
      case 'esperando_banco':
        const bancoDetectado = this.detectarBanco(msgLower);
        const nombreCorto = context.lead_name.split(' ')[0];

        // Si NO es una respuesta simple (banco o "no sé"), dejar que CLAUDE piense
        const esRespuestaSimple = bancoDetectado ||
                                   msgLower === 'no se' ||
                                   msgLower === 'no sé' ||
                                   msgLower.length < 10;

        if (!esRespuestaSimple) {
          console.log('🏦 CRÉDITO: Mensaje complejo, pasando a CLAUDE para que piense:', mensaje);
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        // Si es pregunta no relacionada, PAUSAR flujo y pasar a IA
        if (this.esPreguntaNoRelacionada(msgLower) && !bancoDetectado) {
          console.log('🏦 CRÉDITO: Pregunta no relacionada, CANCELANDO flujo para IA');
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        if (bancoDetectado) {
          context.banco_preferido = bancoDetectado;
          context.state = 'ofrecer_simulacion';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          // Actualizar lead con banco
          const { error: errBanco } = await this.supabase.client
            .from('leads')
            .update({ banco_preferido: bancoDetectado })
            .eq('id', leadId);
          if (errBanco) console.error('⚠️ Error updating lead banco_preferido:', errBanco);

          const bancoMsg = bancoDetectado === 'Por definir'
            ? '¡Sin problema! Te orientamos con las mejores opciones.'
            : `¡Excelente! *${bancoDetectado}* es muy buena opción 👍`;

          return {
            respuesta: `${bancoMsg}

${nombreCorto}, ¿te gustaría que te haga una *simulación rápida* para ver cuánto te podrían prestar y cuánto pagarías mensualmente? 📊

Solo necesito algunos datos básicos.

Responde *SÍ* para la simulación o *NO* si prefieres hablar directo con un asesor.`,
            context
          };
        }

        return {
          respuesta: `No identifiqué el banco 🤔

Por favor escribe uno de estos:
• BBVA
• Banorte
• HSBC
• Santander
• Infonavit
• Fovissste

O escribe "no sé" para que te oriente.`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Ofrecer simulación
      // ─────────────────────────────────────────────────────────────
      case 'ofrecer_simulacion':
        // Si es pregunta no relacionada, pasar a IA
        if (this.esPreguntaNoRelacionada(msgLower)) {
          console.log('🏦 CRÉDITO: Pregunta no relacionada en ofrecer_simulacion, CANCELANDO flujo');
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        const quiereSimulacion = msgLower.includes('si') || msgLower.includes('sí') ||
                                  msgLower === 's' || msgLower.includes('simulacion') ||
                                  msgLower.includes('simulación') || msgLower.includes('ok') ||
                                  msgLower.includes('dale') || msgLower.includes('va');

        const noQuiereSimulacion = msgLower.includes('no') || msgLower.includes('asesor') ||
                                    msgLower.includes('directo') || msgLower.includes('hablar');

        if (quiereSimulacion) {
          context.state = 'esperando_ingreso';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          return {
            respuesta: `¡Perfecto! 📊 Hagamos tu simulación.

¿Cuánto es tu *ingreso mensual* aproximado?

(Puede ser neto o bruto, por ejemplo: 25000, 40mil, etc.)`,
            context
          };
        }

        if (noQuiereSimulacion) {
          context.state = 'esperando_modalidad';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          return {
            respuesta: `¡Sin problema! Te conecto con un asesor experto.

¿Cómo prefieres que te contacte?

1️⃣ *Llamada telefónica*
2️⃣ *WhatsApp* (te escribe el asesor)
3️⃣ *Presencial* (en oficina)`,
            context
          };
        }

        return {
          respuesta: `¿Te gustaría la simulación? Responde *SÍ* o *NO*`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando ingreso mensual
      // ─────────────────────────────────────────────────────────────
      case 'esperando_ingreso':
        const ingresoDetectado = this.extraerMonto(msgLimpio);

        // Si NO es un monto y el mensaje es largo, dejar que CLAUDE piense
        if (!ingresoDetectado && msgLower.length > 15) {
          console.log('🏦 CRÉDITO: Mensaje complejo en ingreso, pasando a CLAUDE:', mensaje);
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        // Si es pregunta no relacionada, pasar a IA
        if (this.esPreguntaNoRelacionada(msgLower)) {
          console.log('🏦 CRÉDITO: Pregunta no relacionada en esperando_ingreso, CANCELANDO flujo');
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        const ingreso = ingresoDetectado;

        if (ingreso && ingreso >= 5000) {
          context.ingreso_mensual = ingreso;
          context.state = 'esperando_enganche';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          // Guardar en lead
          const { error: errIngreso } = await this.supabase.client
            .from('leads')
            .update({
              ingreso_mensual: ingreso,
              mortgage_data: { ingreso_mensual: ingreso }
            })
            .eq('id', leadId);
          if (errIngreso) console.error('⚠️ Error updating lead ingreso_mensual:', errIngreso);

          return {
            respuesta: `Perfecto, *$${ingreso.toLocaleString('es-MX')}* mensuales 👍

¿Cuánto tienes disponible para el *enganche*?

(Por ejemplo: 100000, 200mil, 500k, etc. o "no tengo" si aún no tienes ahorrado)`,
            context
          };
        }

        return {
          respuesta: `No capté bien el monto 🤔

¿Cuánto ganas al mes aproximadamente?
(Ejemplo: 20000, 35mil, 50k)`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando enganche
      // ─────────────────────────────────────────────────────────────
      case 'esperando_enganche':
        // Si el mensaje es largo y no parece monto, dejar que CLAUDE piense
        const engancheDetectado = this.extraerMonto(msgLimpio);
        const esRespuestaEnganche = engancheDetectado ||
                                     msgLower.includes('no tengo') ||
                                     msgLower.includes('nada') ||
                                     msgLower === '0' ||
                                     msgLower.length < 15;

        if (!esRespuestaEnganche) {
          console.log('🏦 CRÉDITO: Mensaje complejo en enganche, pasando a CLAUDE:', mensaje);
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        // Si es pregunta no relacionada, pasar a IA
        if (this.esPreguntaNoRelacionada(msgLower)) {
          console.log('🏦 CRÉDITO: Pregunta no relacionada en esperando_enganche, CANCELANDO flujo');
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        let enganche = 0;

        if (msgLower.includes('no tengo') || msgLower.includes('nada') || msgLower === '0') {
          enganche = 0;
        } else {
          enganche = engancheDetectado || 0;
        }

        context.enganche = enganche;
        context.state = 'mostrar_simulacion';
        context.updated_at = new Date().toISOString();

        // Calcular capacidad de crédito
        const capacidad = this.calcularCapacidadCredito(context.ingreso_mensual || 0, enganche);
        context.capacidad_credito = capacidad.montoMaximo;

        await this.guardarContexto(leadId, context);

        // Guardar en lead
        const { error: errEnganche } = await this.supabase.client
          .from('leads')
          .update({ enganche_disponible: enganche })
          .eq('id', leadId);
        if (errEnganche) console.error('⚠️ Error updating lead enganche_disponible:', errEnganche);

        // Generar simulación
        const simulacion = this.generarSimulacion(context.ingreso_mensual || 0, enganche, context.banco_preferido);
        const nombreCortoSim = context.lead_name.split(' ')[0];

        // Avanzar al siguiente estado
        context.state = 'esperando_modalidad';
        await this.guardarContexto(leadId, context);

        return {
          respuesta: `📊 *SIMULACIÓN PARA ${nombreCortoSim.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━

💰 Ingreso: *$${(context.ingreso_mensual || 0).toLocaleString('es-MX')}*/mes
💵 Enganche: *$${enganche.toLocaleString('es-MX')}*

${simulacion}

⚠️ _Montos aproximados sujetos a aprobación bancaria_

¿Cómo prefieres que te contacte el asesor para continuar?

1️⃣ *Llamada telefónica*
2️⃣ *WhatsApp* (te escribe)
3️⃣ *Presencial* (en oficina)`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando modalidad de contacto
      // ─────────────────────────────────────────────────────────────
      case 'esperando_modalidad':
        const modalidadDetectada = this.detectarModalidad(msgLower);

        // Si NO es 1/2/3 o palabra clave y mensaje largo, dejar que CLAUDE piense
        const esRespuestaModalidad = modalidadDetectada ||
                                      msgLower === '1' ||
                                      msgLower === '2' ||
                                      msgLower === '3' ||
                                      msgLower.length < 12;

        if (!esRespuestaModalidad) {
          console.log('🏦 CRÉDITO: Mensaje complejo en modalidad, pasando a CLAUDE:', mensaje);
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        // Si es pregunta no relacionada, pasar a IA
        if (this.esPreguntaNoRelacionada(msgLower)) {
          console.log('🏦 CRÉDITO: Pregunta no relacionada en esperando_modalidad, CANCELANDO flujo');
          await this.cancelarFlujo(leadId);
          return { respuesta: null, context, passToAI: true };
        }

        const modalidad = modalidadDetectada;

        if (modalidad) {
          context.modalidad = modalidad;
          context.updated_at = new Date().toISOString();

          // Actualizar lead
          const { error: errModalidad } = await this.supabase.client
            .from('leads')
            .update({ modalidad_asesoria: modalidad })
            .eq('id', leadId);
          if (errModalidad) console.error('⚠️ Error updating lead modalidad_asesoria:', errModalidad);

          // ═══ PRESENCIAL: Mostrar casas y pedir cita ═══
          if (modalidad === 'presencial') {
            console.log('🏠 PRESENCIAL: Mostrando casas dentro del presupuesto y pidiendo cita');
            context.state = 'esperando_cita_presencial';
            await this.guardarContexto(leadId, context);

            const nombreCorto = context.lead_name.split(' ')[0];
            const presupuesto = context.capacidad_credito || 2000000;
            const presupuestoTxt = (presupuesto / 1000000).toFixed(1).replace('.0', '');

            // Mostrar desarrollos que caben en su presupuesto
            const desarrollos = this.obtenerDesarrollosPorPresupuesto(presupuesto);

            return {
              respuesta: `¡Perfecto ${nombreCorto}! 🎉

Con tu capacidad de *$${presupuestoTxt}M*, te recomiendo visitar:

${desarrollos}

📅 *¿Qué día y hora te gustaría visitarnos?*

Atendemos de Lunes a Viernes 9am-6pm y Sábados 9am-2pm 😊`,
              context
            };
          }

          // ═══ LLAMADA/WHATSAPP: Conectar con asesor Y EMPUJAR A CITA ═══
          // Buscar asesor
          const asesor = await this.buscarAsesor(context.banco_preferido);

          if (asesor) {
            context.asesor_id = asesor.id;
            context.asesor_name = asesor.name;
            context.asesor_phone = asesor.phone;
          }

          // Obtener vendedor original ANTES de reasignar
          const { data: leadActual } = await this.supabase.client
            .from('leads')
            .select('assigned_to')
            .eq('id', leadId)
            .single();
          const vendedorOriginalId = leadActual?.assigned_to || null;

          // Marcar lead como calificado Y asignar al asesor
          const updateData: any = {
            status: 'credit_qualified',
            stage: 'qualified',
            updated_at: new Date().toISOString()
          };

          if (asesor?.id) {
            updateData.assigned_to = asesor.id;
            console.log(`✅ Lead asignado a asesor: ${asesor.name} (${asesor.id})`);
          }

          // Guardar vendedor original en notes para mantener visibilidad
          if (vendedorOriginalId && vendedorOriginalId !== asesor?.id) {
            context.vendedor_original_id = vendedorOriginalId;
          }

          const { error: errQualified } = await this.supabase.client
            .from('leads')
            .update(updateData)
            .eq('id', leadId);
          if (errQualified) console.error('⚠️ Error updating lead credit_qualified:', errQualified);

          // Crear mortgage_application
          if (asesor?.id) {
            const { error: mortgageError } = await this.supabase.client
              .from('mortgage_applications')
              .upsert({
                lead_id: leadId,
                lead_name: context.lead_name,
                lead_phone: context.lead_phone,
                assigned_advisor_id: asesor.id,
                monthly_income: context.ingreso_mensual || 0,
                down_payment: context.enganche || 0,
                bank: context.banco_preferido || 'Por definir',
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, { onConflict: 'lead_id' });
            if (mortgageError) {
              // CRÉDITO EN LIMBO FIX: Log error para que no desaparezca silenciosamente
              console.error(`❌ Error creando mortgage_application para lead ${leadId}:`, mortgageError);
              try {
                const { logErrorToDB } = await import('../crons/healthCheck');
                await logErrorToDB(this.supabase, 'mortgage_insert_failed', mortgageError.message, {
                  severity: 'critical', source: 'creditFlowService',
                  context: { leadId, leadPhone: context.lead_phone, asesorId: asesor.id, banco: context.banco_preferido }
                });
              } catch (_) { /* best effort */ }
            } else {
              console.log(`📊 Mortgage application creada para lead ${leadId}`);
            }
          }

          // Guardar vendedor original en notes del lead (para recordatorios y visibilidad)
          if (vendedorOriginalId) {
            try {
              const { data: leadNotes } = await this.supabase.client
                .from('leads').select('notes').eq('id', leadId).single();
              let notas: any = {};
              if (leadNotes?.notes) {
                notas = typeof leadNotes.notes === 'string' ? JSON.parse(leadNotes.notes) : leadNotes.notes;
              }
              notas.vendedor_original_id = vendedorOriginalId;
              const { error: errVendorOriginal } = await this.supabase.client.from('leads').update({ notes: notas }).eq('id', leadId);
              if (errVendorOriginal) console.error('⚠️ Error updating lead vendedor_original notes:', errVendorOriginal);
              console.log(`📝 Vendedor original ${vendedorOriginalId} guardado en notes del lead`);
            } catch (e) {
              console.error('Error guardando vendedor original en notes:', e);
            }
          }

          // IMPORTANTE: Transicionar a esperando cita (NO completado)
          // Porque el mensaje de asesor incluye push para visita
          context.state = 'esperando_cita_presencial';
          await this.guardarContexto(leadId, context);
          console.log('🏠 Flujo crédito: Esperando fecha/hora para cita después de conectar asesor');

          return {
            respuesta: `¡Perfecto! 🎉`,
            context,
            accion: 'conectar_asesor',
            datos: { asesor, vendedorOriginalId }
          };
        }

        return {
          respuesta: `Por favor elige una opción:

1️⃣ *Llamada telefónica*
2️⃣ *WhatsApp*
3️⃣ *Presencial*

Responde 1, 2 o 3.`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Esperando cita presencial (después de elegir opción 3)
      // ─────────────────────────────────────────────────────────────
      case 'esperando_cita_presencial':
        console.log('🏠 CITA PRESENCIAL: Procesando fecha/hora');

        // Si pregunta algo no relacionado, pasar a IA pero mantener contexto
        if (this.esPreguntaNoRelacionada(msgLower)) {
          console.log('🏠 Pregunta no relacionada en cita presencial, pasando a IA');
          return { respuesta: null, context, passToAI: true };
        }

        // Detectar fecha/hora en el mensaje
        const fechaHoraCita = this.extraerFechaHora(msgLower);

        if (fechaHoraCita.fecha && fechaHoraCita.hora) {
          console.log(`🏠 Fecha/hora detectada: ${fechaHoraCita.fecha} ${fechaHoraCita.hora}`);

          // Crear cita directamente
          const fechaReal = this.parsearFechaTexto(fechaHoraCita.fecha);
          const desarrollo = context.desarrollo_interes || 'Por definir en visita';
          const nombreCitaCorto = context.lead_name.split(' ')[0];

          // Validar hora dentro de horario
          const horaNum = parseInt(fechaHoraCita.hora.split(':')[0]);
          const esSabado = fechaReal.getDay() === 6;
          const horaFinAtencion = esSabado ? 14 : 18;

          if (horaNum < 9 || horaNum >= horaFinAtencion) {
            const horaFinTxt = esSabado ? '2pm' : '6pm';
            return {
              respuesta: `⚠️ ${nombreCitaCorto}, las ${horaNum}:00 está fuera de nuestro horario.

📅 Atendemos de 9am a ${horaFinTxt}

¿A qué hora dentro de ese horario te gustaría venir? 😊`,
              context
            };
          }

          // Crear la cita en appointments (con vendedor_id del vendedor original para recordatorios)
          const fechaStr = fechaReal.toISOString().split('T')[0];
          try {
            const citaData: any = {
                lead_id: leadId,
                lead_name: context.lead_name,
                lead_phone: context.lead_phone,
                scheduled_date: fechaStr,
                scheduled_time: fechaHoraCita.hora,
                property_name: desarrollo,
                status: 'scheduled',
                appointment_type: 'mortgage_consultation',
                notes: `Cita post-crédito. Presupuesto: $${((context.capacidad_credito || 0) / 1000000).toFixed(1)}M. Asesor: ${context.asesor_name || 'N/A'}`,
                created_at: new Date().toISOString()
            };
            // Poner vendedor original para que reciba recordatorios
            if (context.vendedor_original_id) {
              citaData.vendedor_id = context.vendedor_original_id;
            }
            await this.supabase.client
              .from('appointments')
              .insert(citaData);
            console.log(`✅ Cita crédito creada: ${fechaStr} ${fechaHoraCita.hora} en ${desarrollo}`);
          } catch (e) {
            console.error('Error creando cita:', e);
          }

          // Marcar flujo como completado
          context.state = 'completado';
          await this.guardarContexto(leadId, context);

          // Formatear fecha para mensaje
          const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
          const diaSemana = diasSemana[fechaReal.getDay()];
          const fechaLegible = `${diaSemana} ${fechaReal.getDate()}/${fechaReal.getMonth() + 1}`;

          return {
            respuesta: `✅ *¡Cita confirmada ${nombreCitaCorto}!*

📅 *${fechaLegible}* a las *${horaNum}:00*
🏠 Visitaremos casas dentro de tu presupuesto

Te esperamos en nuestra oficina. Si tienes algún cambio, avísame 😊

¡Nos vemos pronto! 🎉`,
            context
          };
        }

        // Si menciona un desarrollo específico, guardarlo
        const desarrolloMencionado = this.detectarDesarrollo(msgLower);
        if (desarrolloMencionado) {
          context.desarrollo_interes = desarrolloMencionado;
          await this.guardarContexto(leadId, context);
        }

        // Si solo da hora o solo fecha, pedir lo que falta
        if (fechaHoraCita.hora && !fechaHoraCita.fecha) {
          return {
            respuesta: `¡Perfecto! ¿Y qué día te gustaría venir? 📅`,
            context
          };
        }

        if (fechaHoraCita.fecha && !fechaHoraCita.hora) {
          return {
            respuesta: `¡${fechaHora.fecha} me parece bien! ¿A qué hora te acomoda? ⏰

Atendemos de 9am a 6pm (sábados hasta 2pm)`,
            context
          };
        }

        // No detectó fecha ni hora
        const nombreCortoCita = context.lead_name.split(' ')[0];
        return {
          respuesta: `${nombreCortoCita}, ¿qué día y hora te gustaría visitarnos? 📅

Por ejemplo: "mañana a las 11am" o "el sábado a las 10"`,
          context
        };

      // ─────────────────────────────────────────────────────────────
      // ESTADO: Completado
      // ─────────────────────────────────────────────────────────────
      case 'completado':
      case 'conectando_asesor':
        await this.limpiarContexto(leadId);
        return null;

      default:
        return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GENERAR SIMULACIÓN DE CRÉDITO
  // ═══════════════════════════════════════════════════════════════════
  private generarSimulacion(ingreso: number, enganche: number, bancoPreferido?: string): string {
    // Capacidad de pago mensual (30% del ingreso)
    const capacidadPago = ingreso * 0.30;

    // Tasas aproximadas por banco (2024-2025)
    const bancos = [
      { nombre: 'BBVA', tasa: 10.5, plazoMax: 20 },
      { nombre: 'Banorte', tasa: 10.8, plazoMax: 20 },
      { nombre: 'HSBC', tasa: 11.2, plazoMax: 20 },
      { nombre: 'Santander', tasa: 10.9, plazoMax: 20 },
      { nombre: 'Scotiabank', tasa: 11.0, plazoMax: 20 },
      { nombre: 'Infonavit', tasa: 10.45, plazoMax: 30 },
    ];

    // Si tiene banco preferido, ponerlo primero
    if (bancoPreferido && bancoPreferido !== 'Por definir') {
      const idx = bancos.findIndex(b => b.nombre.toLowerCase() === bancoPreferido.toLowerCase());
      if (idx > 0) {
        const banco = bancos.splice(idx, 1)[0];
        bancos.unshift(banco);
      }
    }

    // Calcular para cada banco
    const resultados = bancos.slice(0, 4).map(banco => {
      // Fórmula simplificada de capacidad de crédito
      const tasaMensual = banco.tasa / 100 / 12;
      const plazoMeses = banco.plazoMax * 12;

      // Monto máximo basado en capacidad de pago
      const montoCredito = capacidadPago * ((1 - Math.pow(1 + tasaMensual, -plazoMeses)) / tasaMensual);
      const montoTotal = montoCredito + enganche;

      // Mensualidad real
      const mensualidad = montoCredito * (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);

      return {
        banco: banco.nombre,
        montoCredito: Math.round(montoCredito / 10000) * 10000,
        montoTotal: Math.round(montoTotal / 10000) * 10000,
        mensualidad: Math.round(mensualidad / 100) * 100,
        plazo: banco.plazoMax,
        tasa: banco.tasa
      };
    });

    // Formatear resultado
    let tabla = `🏦 *OPCIONES DE CRÉDITO:*\n`;

    resultados.forEach((r, i) => {
      const estrella = i === 0 && bancoPreferido && bancoPreferido !== 'Por definir' ? ' ⭐' : '';
      tabla += `\n*${r.banco}*${estrella}\n`;
      tabla += `├ Crédito: $${r.montoCredito.toLocaleString('es-MX')}\n`;
      tabla += `├ Casa hasta: $${r.montoTotal.toLocaleString('es-MX')}\n`;
      tabla += `├ Mensualidad: ~$${r.mensualidad.toLocaleString('es-MX')}\n`;
      tabla += `└ Plazo: ${r.plazo} años | Tasa: ${r.tasa}%\n`;
    });

    return tabla;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CALCULAR CAPACIDAD DE CRÉDITO
  // ═══════════════════════════════════════════════════════════════════
  private calcularCapacidadCredito(ingreso: number, enganche: number): { montoMaximo: number; mensualidadMax: number } {
    const capacidadPago = ingreso * 0.30;
    const tasaPromedio = 0.105 / 12; // 10.5% anual
    const plazoMeses = 240; // 20 años

    const montoCredito = capacidadPago * ((1 - Math.pow(1 + tasaPromedio, -plazoMeses)) / tasaPromedio);

    return {
      montoMaximo: Math.round((montoCredito + enganche) / 10000) * 10000,
      mensualidadMax: Math.round(capacidadPago / 100) * 100
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DETECTAR SI UN LEAD ESTÁ EN FLUJO DE CRÉDITO
  // ═══════════════════════════════════════════════════════════════════
  async estaEnFlujoCredito(leadId: string): Promise<boolean> {
    const context = await this.obtenerContexto(leadId);
    return context !== null && context.state !== 'completado' && context.state !== 'conectando_asesor';
  }

  // ═══════════════════════════════════════════════════════════════════
  // DETECTAR INTENCIÓN DE CRÉDITO EN MENSAJE
  // ═══════════════════════════════════════════════════════════════════
  detectarIntencionCredito(mensaje: string): boolean {
    const msgLower = mensaje.toLowerCase();
    // Normalizar: quitar espacios extras y unir palabras pegadas comunes
    const msgNormalizado = msgLower
      .replace(/\s+/g, ' ')  // múltiples espacios -> uno
      .trim();

    // Frases que indican que el lead YA ESTÁ EN PROCESO (NO iniciar flujo)
    const frasesYaEnProceso = [
      // Esperando aprobación
      'espero aprobacion', 'espero aprobación', 'esperando aprobacion', 'esperando aprobación',
      'espero mi aprobacion', 'espero mi aprobación',
      // Esperando crédito (ya en proceso)
      'espero mi credito', 'espero mi crédito', 'espero el credito', 'espero el crédito',
      'esperando mi credito', 'esperando mi crédito',
      // Ya tramitando
      'ya estoy tramitando', 'ya lo tramite', 'ya lo tramité',
      'ya meti papeles', 'ya metí papeles', 'ya entregue papeles', 'ya entregué papeles',
      // Ya visitó/conoció
      'ya lo conoci', 'ya lo conocí', 'ya conozco', 'ya visite', 'ya visité', 'ya fui',
      // En proceso
      'en proceso', 'mi tramite', 'mi trámite', 'mi solicitud',
      // Solo espero (con variantes)
      'estoy esperando', 'solo espero', 'sólo espero', 'nomas espero', 'nomás espero',
      'nada mas espero', 'nada más espero',
      // Ya aplicó
      'ya aplique', 'ya apliqué', 'ya lo solicite', 'ya lo solicité',
      // Ya tiene/aprobaron
      'ya tengo credito', 'ya tengo crédito', 'ya me aprobaron',
      // En revisión
      'me estan revisando', 'me están revisando', 'en revision', 'en revisión',
      'ya hice el tramite', 'ya hice el trámite'
    ];

    // Si el mensaje indica que YA está en proceso, NO detectar como nueva intención
    if (frasesYaEnProceso.some(frase => msgNormalizado.includes(frase))) {
      console.log('🏦 Crédito: Lead ya en proceso, no iniciar flujo nuevo');
      return false;
    }

    // Detección con regex para typos comunes (palabras pegadas)
    // "solonespero" -> "solo espero", "yaestoy" -> "ya estoy", etc.
    const regexYaEnProceso = [
      /solo?\s*n?e?spero/i,           // "solo espero", "solonespero", "soloespero"
      /espero\s*(mi|el)?\s*cred/i,    // "espero mi credito", "espero credito"
      /ya\s*(lo)?\s*(conoc|visit|fui)/i,  // "ya conocí", "ya visité", "ya fui"
      /en\s*proces/i,                 // "en proceso"
      /esperando\s*(aprob|cred)/i,    // "esperando aprobación", "esperando crédito"
      /ya\s*(me\s*)?(aprob|tramit)/i, // "ya me aprobaron", "ya tramité"
    ];

    if (regexYaEnProceso.some(regex => regex.test(msgNormalizado))) {
      console.log('🏦 Crédito: Lead ya en proceso (regex), no iniciar flujo nuevo');
      return false;
    }

    // Palabras clave que indican NUEVA intención de crédito
    const palabrasClave = [
      'credito', 'crédito', 'hipoteca', 'hipotecario',
      'financiamiento', 'prestamo', 'préstamo',
      'infonavit', 'fovissste',
      'quiero comprar', 'necesito financiar',
      'cuanto me prestan', 'cuánto me prestan',
      'puedo sacar credito', 'puedo sacar crédito',
      'necesito credito', 'necesito crédito',
      'quiero un credito', 'quiero un crédito'
    ];

    return palabrasClave.some(palabra => msgNormalizado.includes(palabra));
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ═══════════════════════════════════════════════════════════════════

  private extraerNombre(mensaje: string): string | null {
    // Limpiar mensaje
    let nombre = mensaje.trim();

    // Remover frases comunes
    nombre = nombre.replace(/^(me llamo|soy|mi nombre es|hola,?\s*)/i, '').trim();
    nombre = nombre.replace(/[.,!?]$/g, '').trim();

    // Validar que parece un nombre
    if (nombre.length >= 2 && nombre.length <= 50 && /^[a-záéíóúüñ\s]+$/i.test(nombre)) {
      // Capitalizar
      return nombre.split(' ')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
    }

    return null;
  }

  private extraerMonto(mensaje: string): number | null {
    const msgLimpio = mensaje.toLowerCase()
      .replace(/,/g, '')
      .replace(/\$/g, '')
      .replace(/pesos/g, '')
      .replace(/mil/g, '000')
      .replace(/k/g, '000')
      .replace(/m/g, '000000')
      .trim();

    // Buscar número
    const match = msgLimpio.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      // Si es muy pequeño, probablemente dijo "25" queriendo decir 25,000
      if (num > 0 && num < 1000) {
        return num * 1000;
      }
      return num;
    }

    return null;
  }

  private detectarBanco(mensaje: string): string | null {
    const bancos: { [key: string]: string } = {
      'bbva': 'BBVA',
      'bancomer': 'BBVA',
      'banorte': 'Banorte',
      'hsbc': 'HSBC',
      'santander': 'Santander',
      'scotiabank': 'Scotiabank',
      'scotia': 'Scotiabank',
      'banregio': 'Banregio',
      'infonavit': 'Infonavit',
      'fovissste': 'Fovissste',
      'no se': 'Por definir',
      'no sé': 'Por definir',
      'cualquier': 'Por definir',
      'recomiend': 'Por definir',
      'no tengo': 'Por definir',
      'ninguno': 'Por definir'
    };

    for (const [key, value] of Object.entries(bancos)) {
      if (mensaje.includes(key)) {
        return value;
      }
    }

    return null;
  }

  private detectarModalidad(mensaje: string): string | null {
    if (mensaje.includes('1') || mensaje.includes('llamada') || mensaje.includes('telefon') || mensaje.includes('marcar')) {
      return 'llamada';
    }
    if (mensaje.includes('2') || mensaje.includes('whatsapp') || mensaje.includes('mensaje') || mensaje.includes('escrib')) {
      return 'whatsapp';
    }
    if (mensaje.includes('3') || mensaje.includes('presencial') || mensaje.includes('oficina') || mensaje.includes('persona')) {
      return 'presencial';
    }
    return null;
  }

  private async buscarAsesor(bancoPreferido?: string): Promise<any | null> {
    try {
      // Si hay banco preferido, buscar asesor de ese banco primero
      if (bancoPreferido && bancoPreferido !== 'Por definir') {
        const { data: asesorBanco } = await this.supabase.client
          .from('team_members')
          .select('*')
          .ilike('banco', `%${bancoPreferido}%`)
          .or('is_active.is.null,is_active.eq.true')
          .limit(1)
          .single();

        if (asesorBanco) {
          return asesorBanco;
        }
      }

      // Si no hay asesor de ese banco, buscar cualquier asesor de crédito
      // Nota: is_active puede ser null o true (excluimos solo false)
      const { data: asesores, error } = await this.supabase.client
        .from('team_members')
        .select('*')
        .or("role.ilike.%asesor%,role.ilike.%hipotec%,role.ilike.%credito%,role.ilike.%crédito%")
        .limit(5);

      console.log('🔍 Asesores encontrados:', asesores?.length, 'Error:', error?.message);

      // Filtrar manualmente para incluir is_active = null o true
      const activos = asesores?.filter(a => a.is_active !== false) || [];
      console.log('🔍 Asesores activos (is_active != false):', activos.length);

      if (activos.length === 0) return null;
      if (activos.length === 1) return activos[0];

      // ═══ ROUND-ROBIN: Asignar al asesor con MENOS leads activos ═══
      const counts: Record<string, number> = {};
      for (const a of activos) {
        const { count } = await this.supabase.client
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', a.id)
          .in('status', ['credit_qualified', 'contacted', 'documents_pending', 'pre_approved']);
        counts[a.id] = count || 0;
        console.log(`📊 Asesor ${a.name}: ${counts[a.id]} leads activos`);
      }

      // Retornar asesor con menos leads (round-robin por carga)
      const asesorMenosLeads = activos.reduce((min, a) =>
        counts[a.id] < counts[min.id] ? a : min
      );
      console.log(`✅ Round-robin: Asignando a ${asesorMenosLeads.name} (${counts[asesorMenosLeads.id]} leads)`);

      return asesorMenosLeads;
    } catch (e) {
      console.error('Error buscando asesor:', e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GESTIÓN DE CONTEXTO (en leads.notes.credit_flow_context)
  // ═══════════════════════════════════════════════════════════════════

  private async guardarContexto(leadId: string, context: CreditFlowContext): Promise<void> {
    try {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', leadId)
        .single();

      let notas: any = {};
      if (lead?.notes) {
        if (typeof lead.notes === 'string') {
          try { notas = JSON.parse(lead.notes); } catch (e) { notas = {}; }
        } else if (typeof lead.notes === 'object') {
          notas = lead.notes;
        }
      }

      notas.credit_flow_context = context;

      const { error: errGuardarCtx } = await this.supabase.client
        .from('leads')
        .update({ notes: notas })
        .eq('id', leadId);
      if (errGuardarCtx) console.error('⚠️ Error updating lead notes (guardarContexto):', errGuardarCtx);
    } catch (e) {
      console.error('Error guardando contexto crédito:', e);
    }
  }

  private async obtenerContexto(leadId: string): Promise<CreditFlowContext | null> {
    try {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', leadId)
        .single();

      if (!lead?.notes) return null;

      let notas: any = {};
      if (typeof lead.notes === 'string') {
        try { notas = JSON.parse(lead.notes); } catch (e) { return null; }
      } else if (typeof lead.notes === 'object') {
        notas = lead.notes;
      }

      return notas.credit_flow_context || null;
    } catch (e) {
      console.error('Error obteniendo contexto crédito:', e);
      return null;
    }
  }

  private async limpiarContexto(leadId: string): Promise<void> {
    try {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes')
        .eq('id', leadId)
        .single();

      if (!lead?.notes) return;

      let notas: any = {};
      if (typeof lead.notes === 'string') {
        try { notas = JSON.parse(lead.notes); } catch (e) { notas = {}; }
      } else if (typeof lead.notes === 'object') {
        notas = lead.notes;
      }

      delete notas.credit_flow_context;

      const { error: errLimpiarCtx } = await this.supabase.client
        .from('leads')
        .update({ notes: notas })
        .eq('id', leadId);
      if (errLimpiarCtx) console.error('⚠️ Error updating lead notes (limpiarContexto):', errLimpiarCtx);
    } catch (e) {
      console.error('Error limpiando contexto crédito:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GENERAR MENSAJE DE CONEXIÓN CON ASESOR
  // ═══════════════════════════════════════════════════════════════════
  generarMensajeAsesor(asesor: any, context: CreditFlowContext): string {
    const nombreCorto = context.lead_name.split(' ')[0];
    const nombreAsesor = asesor.name?.replace(/ - Asesor.*$/i, '').split(' ')[0] || 'Nuestro asesor';
    const telAsesor = asesor.phone || '';

    let msgContacto = 'Te contactará pronto';
    if (context.modalidad === 'llamada') {
      msgContacto = 'Te llamará en breve';
    } else if (context.modalidad === 'whatsapp') {
      msgContacto = 'Te escribirá por WhatsApp';
    }

    // Mostrar casas dentro del presupuesto y empujar a cita
    const presupuesto = context.capacidad_credito || 2000000;
    const presupuestoTxt = (presupuesto / 1000000).toFixed(1).replace('.0', '');
    const desarrollos = this.obtenerDesarrollosPorPresupuesto(presupuesto);

    return `✅ *¡Listo ${nombreCorto}!*

Tu asesor hipotecario es:
👤 *${nombreAsesor}*
📱 ${telAsesor}
${msgContacto} 📞

━━━━━━━━━━━━━━━━━━━━
🏠 *¡AHORA VAMOS A VER TU CASA!*
━━━━━━━━━━━━━━━━━━━━

Con tu capacidad de *$${presupuestoTxt}M*, te recomiendo:

${desarrollos}

📅 *¿Qué día y hora te gustaría visitarnos?*
Atendemos L-V 9am-6pm y Sáb 9am-2pm`;
  }

  // Generar notificación para el asesor
  generarNotificacionAsesor(lead: any, context: CreditFlowContext): string {
    const ingresoTxt = context.ingreso_mensual
      ? `$${context.ingreso_mensual.toLocaleString('es-MX')}/mes`
      : 'No proporcionado';

    const engancheTxt = context.enganche !== undefined
      ? `$${context.enganche.toLocaleString('es-MX')}`
      : 'No proporcionado';

    const capacidadTxt = context.capacidad_credito
      ? `$${context.capacidad_credito.toLocaleString('es-MX')}`
      : 'Por calcular';

    return `🔥 *¡NUEVO LEAD HIPOTECARIO!* 🔥
━━━━━━━━━━━━━━━━━━━━

👤 *${context.lead_name}*
📱 ${lead.phone}

💰 *Datos financieros:*
├ Ingreso: ${ingresoTxt}
├ Enganche: ${engancheTxt}
└ Capacidad estimada: ${capacidadTxt}

🏦 Banco preferido: ${context.banco_preferido || 'Por definir'}
📞 Prefiere: ${context.modalidad || 'Por definir'}
🏠 Interés: ${lead.property_interest || 'Por definir'}

━━━━━━━━━━━━━━━━━━━━
💬 *Para escribirle por WhatsApp:*
Escribe: \`mensaje ${context.lead_name?.split(' ')[0] || 'nombre'}\`

⏰ ¡Contactar pronto!`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // OBTENER DESARROLLOS POR PRESUPUESTO
  // ═══════════════════════════════════════════════════════════════════
  private obtenerDesarrollosPorPresupuesto(presupuesto: number): string {
    // Desarrollos con precios aproximados
    const desarrollos = [
      { nombre: 'Andes', precio: 1500000, desc: 'Excelente ubicación en Guadalupe' },
      { nombre: 'Monte Verde', precio: 1500000, desc: 'Ambiente familiar con áreas verdes' },
      { nombre: 'Los Encinos', precio: 2900000, desc: 'Casas amplias de 3 recámaras' },
      { nombre: 'Miravalle', precio: 2900000, desc: 'Diseño moderno de 3 niveles' },
      { nombre: 'Distrito Falco', precio: 3500000, desc: 'Premium en zona de alta plusvalía' },
    ];

    // Filtrar por presupuesto (con 10% de margen)
    const compatibles = desarrollos.filter(d => d.precio <= presupuesto * 1.1);

    if (compatibles.length === 0) {
      return `🏡 *Andes* - Desde $1.5M
➜ Excelente ubicación en Guadalupe

🏡 *Monte Verde* - Desde $1.5M
➜ Ambiente familiar con áreas verdes`;
    }

    return compatibles
      .slice(0, 3)
      .map(d => `🏡 *${d.nombre}* - Desde $${(d.precio / 1000000).toFixed(1)}M
➜ ${d.desc}`)
      .join('\n\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // PARSEAR TEXTO DE FECHA A DATE
  // ═══════════════════════════════════════════════════════════════════
  private parsearFechaTexto(fechaTexto: string): Date {
    const hoy = new Date();
    // Ajustar a zona horaria México
    hoy.setHours(hoy.getHours() - 6);

    switch (fechaTexto.toLowerCase()) {
      case 'hoy':
        return hoy;
      case 'mañana':
        const manana = new Date(hoy);
        manana.setDate(manana.getDate() + 1);
        return manana;
      case 'lunes':
      case 'martes':
      case 'miércoles':
      case 'jueves':
      case 'viernes':
      case 'sábado':
        const diasMap: { [key: string]: number } = {
          'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3,
          'jueves': 4, 'viernes': 5, 'sábado': 6
        };
        const diaObjetivo = diasMap[fechaTexto.toLowerCase()];
        const diaActual = hoy.getDay();
        let diasHasta = diaObjetivo - diaActual;
        if (diasHasta <= 0) diasHasta += 7; // Próxima semana
        const fechaDia = new Date(hoy);
        fechaDia.setDate(fechaDia.getDate() + diasHasta);
        return fechaDia;
      default:
        return hoy;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // EXTRAER FECHA Y HORA DEL MENSAJE
  // ═══════════════════════════════════════════════════════════════════
  private extraerFechaHora(msg: string): { fecha: string | null; hora: string | null } {
    let fecha: string | null = null;
    let hora: string | null = null;

    // Detectar día
    const hoy = new Date();
    if (msg.includes('hoy')) {
      fecha = 'hoy';
    } else if (msg.includes('mañana') || msg.includes('manana')) {
      fecha = 'mañana';
    } else if (msg.includes('lunes')) {
      fecha = 'lunes';
    } else if (msg.includes('martes')) {
      fecha = 'martes';
    } else if (msg.includes('miercoles') || msg.includes('miércoles')) {
      fecha = 'miércoles';
    } else if (msg.includes('jueves')) {
      fecha = 'jueves';
    } else if (msg.includes('viernes')) {
      fecha = 'viernes';
    } else if (msg.includes('sabado') || msg.includes('sábado')) {
      fecha = 'sábado';
    }

    // Detectar hora
    const horaMatch = msg.match(/(\d{1,2})\s*(am|pm|:00|hrs?)?/i);
    if (horaMatch) {
      let horaNum = parseInt(horaMatch[1]);
      const sufijo = horaMatch[2]?.toLowerCase() || '';

      // Ajustar PM
      if (sufijo === 'pm' && horaNum < 12) {
        horaNum += 12;
      }
      // Asumir PM para horas pequeñas sin sufijo (ej: "a las 3" = 3pm)
      if (!sufijo && horaNum >= 1 && horaNum <= 6) {
        horaNum += 12;
      }

      hora = `${horaNum}:00`;
    }

    return { fecha, hora };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DETECTAR NOMBRE DE DESARROLLO EN EL MENSAJE
  // ═══════════════════════════════════════════════════════════════════
  private detectarDesarrollo(msg: string): string | null {
    const desarrollos = [
      { nombres: ['andes'], valor: 'Andes' },
      { nombres: ['monte verde', 'monteverde'], valor: 'Monte Verde' },
      { nombres: ['encinos', 'los encinos'], valor: 'Los Encinos' },
      { nombres: ['miravalle'], valor: 'Miravalle' },
      { nombres: ['falco', 'distrito falco'], valor: 'Distrito Falco' },
      { nombres: ['portento'], valor: 'Portento' },
      { nombres: ['reserva'], valor: 'Reserva' },
    ];

    for (const d of desarrollos) {
      if (d.nombres.some(n => msg.includes(n))) {
        return d.valor;
      }
    }

    return null;
  }
}
