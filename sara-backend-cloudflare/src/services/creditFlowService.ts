// ═══════════════════════════════════════════════════════════════════════════
// CREDIT FLOW SERVICE - Flujo completo de crédito hipotecario
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

export interface CreditFlowContext {
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  state: 'pedir_nombre' | 'esperando_banco' | 'ofrecer_simulacion' | 'esperando_ingreso' | 'esperando_enganche' | 'mostrar_simulacion' | 'esperando_modalidad' | 'conectando_asesor' | 'completado';
  banco_preferido?: string;
  ingreso_mensual?: number;
  enganche?: number;
  capacidad_credito?: number;
  modalidad?: string;
  asesor_id?: string;
  asesor_name?: string;
  asesor_phone?: string;
  created_at: string;
  updated_at: string;
}

export class CreditFlowService {
  constructor(
    private supabase: SupabaseService,
    private openaiKey?: string
  ) {}

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
    await this.supabase.client
      .from('leads')
      .update({
        needs_mortgage: true,
        status: 'credit_flow'
      })
      .eq('id', lead.id);

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
          await this.supabase.client
            .from('leads')
            .update({ name: nombreExtraido })
            .eq('id', leadId);

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

        if (bancoDetectado) {
          context.banco_preferido = bancoDetectado;
          context.state = 'ofrecer_simulacion';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          // Actualizar lead con banco
          await this.supabase.client
            .from('leads')
            .update({ banco_preferido: bancoDetectado })
            .eq('id', leadId);

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
        const ingreso = this.extraerMonto(msgLimpio);

        if (ingreso && ingreso >= 5000) {
          context.ingreso_mensual = ingreso;
          context.state = 'esperando_enganche';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          // Guardar en lead
          await this.supabase.client
            .from('leads')
            .update({
              ingreso_mensual: ingreso,
              mortgage_data: { ingreso_mensual: ingreso }
            })
            .eq('id', leadId);

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
        let enganche = 0;

        if (msgLower.includes('no tengo') || msgLower.includes('nada') || msgLower === '0') {
          enganche = 0;
        } else {
          enganche = this.extraerMonto(msgLimpio) || 0;
        }

        context.enganche = enganche;
        context.state = 'mostrar_simulacion';
        context.updated_at = new Date().toISOString();

        // Calcular capacidad de crédito
        const capacidad = this.calcularCapacidadCredito(context.ingreso_mensual || 0, enganche);
        context.capacidad_credito = capacidad.montoMaximo;

        await this.guardarContexto(leadId, context);

        // Guardar en lead
        await this.supabase.client
          .from('leads')
          .update({ enganche_disponible: enganche })
          .eq('id', leadId);

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
        const modalidad = this.detectarModalidad(msgLower);

        if (modalidad) {
          context.modalidad = modalidad;
          context.state = 'conectando_asesor';
          context.updated_at = new Date().toISOString();
          await this.guardarContexto(leadId, context);

          // Actualizar lead
          await this.supabase.client
            .from('leads')
            .update({ modalidad_asesoria: modalidad })
            .eq('id', leadId);

          // Buscar asesor
          const asesor = await this.buscarAsesor(context.banco_preferido);

          if (asesor) {
            context.asesor_id = asesor.id;
            context.asesor_name = asesor.name;
            context.asesor_phone = asesor.phone;
          }

          context.state = 'completado';
          await this.guardarContexto(leadId, context);

          // Marcar lead como completado
          await this.supabase.client
            .from('leads')
            .update({ status: 'credit_qualified' })
            .eq('id', leadId);

          return {
            respuesta: `¡Perfecto! 🎉`,
            context,
            accion: 'conectar_asesor',
            datos: { asesor }
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

    return palabrasClave.some(palabra => msgLower.includes(palabra));
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

      return activos[0] || null;
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

      await this.supabase.client
        .from('leads')
        .update({ notes: notas })
        .eq('id', leadId);
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

      await this.supabase.client
        .from('leads')
        .update({ notes: notas })
        .eq('id', leadId);
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
    } else if (context.modalidad === 'presencial') {
      msgContacto = 'Te esperamos en oficina para atenderte';
    }

    return `✅ *¡Listo ${nombreCorto}!*

Tu asesor hipotecario es:

👤 *${nombreAsesor}*
📱 ${telAsesor}

${msgContacto} 📞

¡Mucho éxito con tu crédito! 🏠`;
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

⏰ ¡Contactar pronto!`;
  }
}
