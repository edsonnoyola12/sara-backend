import { HandlerContext } from './whatsapp-types';
import { AgenciaCommandsService } from '../services/agenciaCommandsService';
import { AgenciaReportingService } from '../services/agenciaReportingService';
import { EventosService } from '../services/eventosService';
import { PromocionesService } from '../services/promocionesService';
import { BroadcastQueueService } from '../services/broadcastQueueService';

// ═══════════════════════════════════════════════════════════════
// HANDLE AGENCIA MESSAGE (entry point)
// ═══════════════════════════════════════════════════════════════

export async function handleAgenciaMessage(ctx: HandlerContext, handler: any, from: string, body: string, agencia: any, teamMembers: any[]): Promise<void> {
  const mensaje = body.toLowerCase().trim();
  const nombreAgencia = agencia.name?.split(' ')[0] || 'Marketing';
  console.log('Agencia Command:', mensaje);

  const agenciaService = new AgenciaCommandsService(ctx.supabase);
  const result = agenciaService.detectCommand(mensaje, body, nombreAgencia);

  switch (result.action) {
    case 'send_message':
      await ctx.twilio.sendWhatsAppMessage(from, result.message!);
      return;

    case 'call_handler':
      await executeAgenciaHandler(ctx, handler, from, body, agencia, nombreAgencia, result.handlerName!);
      return;

    case 'not_recognized':
      await ctx.twilio.sendWhatsAppMessage(from, result.message!);
      return;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXECUTE AGENCIA HANDLER (Twilio-based)
// ═══════════════════════════════════════════════════════════════

export async function executeAgenciaHandler(ctx: HandlerContext, handler: any, from: string, body: string, agencia: any, nombreAgencia: string, handlerName: string): Promise<void> {
  const agenciaService = new AgenciaCommandsService(ctx.supabase);

  // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
  const handlerResult = await agenciaService.executeHandler(handlerName, nombreAgencia);

  // Si el servicio manejó el comando
  if (handlerResult.message) {
    await ctx.twilio.sendWhatsAppMessage(from, handlerResult.message);
    return;
  }

  // Error sin necesidad de handler externo
  if (handlerResult.error && !handlerResult.needsExternalHandler) {
    await ctx.twilio.sendWhatsAppMessage(from, handlerResult.error);
    return;
  }

  // ━━━ FALLBACK: Handlers que requieren lógica externa ━━━
  switch (handlerName) {
    // ━━━ CITAS ━━━
    case 'vendedorCancelarCita':
      await handler.vendedorCancelarCita(from, body, agencia, nombreAgencia);
      break;
    case 'vendedorReagendarCita':
      await handler.vendedorReagendarCita(from, body, agencia, nombreAgencia);
      break;
    case 'vendedorAgendarCitaCompleta':
      await handler.vendedorAgendarCitaCompleta(from, body, agencia, nombreAgencia);
      break;

    // ━━━ SEGMENTOS / BROADCAST ━━━
    case 'enviarASegmento':
      await enviarASegmento(ctx, from, body, agencia);
      break;
    case 'previewSegmento':
      await previewSegmento(ctx, from, body);
      break;

    // ━━━ EVENTOS ━━━
    case 'verEventos':
      await verEventos(ctx, from, nombreAgencia);
      break;
    case 'crearEvento':
      await crearEvento(ctx, from, body, agencia);
      break;
    case 'invitarEvento':
      await invitarEvento(ctx, from, body, agencia);
      break;
    case 'verRegistrados':
      await verRegistrados(ctx, from, body);
      break;

    // ━━━ PROMOCIONES ━━━
    case 'verPromociones':
      await verPromociones(ctx, from, nombreAgencia);
      break;
    case 'crearPromocion':
      await crearPromocion(ctx, from, body, agencia);
      break;

    default:
      console.log('Handler Agencia no reconocido:', handlerName);
  }
}

// ═══════════════════════════════════════════════════════════════
// EJECUTAR AGENCIA HANDLER FOR CEO (usa meta en vez de twilio)
// ═══════════════════════════════════════════════════════════════

export async function executeAgenciaHandlerForCEO(ctx: HandlerContext, handler: any, from: string, body: string, ceo: any, nombreCEO: string, handlerName: string): Promise<void> {
  const agenciaService = new AgenciaCommandsService(ctx.supabase);
  const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

  // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
  const handlerResult = await agenciaService.executeHandler(handlerName, nombreCEO);

  // Si el servicio manejó el comando
  if (handlerResult.message) {
    await ctx.meta.sendWhatsAppMessage(cleanPhone, handlerResult.message);
    return;
  }

  // Error sin necesidad de handler externo
  if (handlerResult.error && !handlerResult.needsExternalHandler) {
    await ctx.meta.sendWhatsAppMessage(cleanPhone, handlerResult.error);
    return;
  }

  // ━━━ FALLBACK: Handlers que requieren lógica externa ━━━
  switch (handlerName) {
    case 'agenciaCampanas':
      await agenciaCampanasForCEO(ctx, cleanPhone, nombreCEO);
      break;
    case 'agenciaMetricas':
      await agenciaMetricasForCEO(ctx, cleanPhone, nombreCEO);
      break;
    case 'agenciaLeads':
      await agenciaLeadsForCEO(ctx, cleanPhone, nombreCEO);
      break;
    case 'verSegmentos':
      await verSegmentosForCEO(ctx, cleanPhone, nombreCEO);
      break;
    case 'iniciarBroadcast':
      await iniciarBroadcastForCEO(ctx, cleanPhone, nombreCEO);
      break;
    case 'enviarASegmento':
      await enviarASegmentoForCEO(ctx, cleanPhone, body, ceo);
      break;
    default:
      console.log('Handler Agencia (CEO) no reconocido:', handlerName);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, '❓ Comando de marketing no reconocido.');
  }
}

// ═══════════════════════════════════════════════════════════════
// CEO HELPERS (usan Meta en vez de Twilio)
// ═══════════════════════════════════════════════════════════════

export async function agenciaCampanasForCEO(ctx: HandlerContext, phone: string, nombre: string): Promise<void> {
  try {
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const mensaje = await agenciaService.getMensajeCampanas(nombre);
    await ctx.meta.sendWhatsAppMessage(phone, mensaje);
  } catch (e) {
    console.error('Error en agenciaCampanas:', e);
    await ctx.meta.sendWhatsAppMessage(phone, 'Error al obtener campañas.');
  }
}

export async function agenciaMetricasForCEO(ctx: HandlerContext, phone: string, nombre: string): Promise<void> {
  try {
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const mensaje = await agenciaService.getMensajeMetricas(nombre);
    await ctx.meta.sendWhatsAppMessage(phone, mensaje);
  } catch (e) {
    console.error('Error en agenciaMetricas:', e);
    await ctx.meta.sendWhatsAppMessage(phone, 'Error al obtener métricas.');
  }
}

export async function agenciaLeadsForCEO(ctx: HandlerContext, phone: string, nombre: string): Promise<void> {
  try {
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const mensaje = await agenciaService.getMensajeLeadsRecientes(nombre);
    await ctx.meta.sendWhatsAppMessage(phone, mensaje);
  } catch (e) {
    console.error('Error en agenciaLeads:', e);
    await ctx.meta.sendWhatsAppMessage(phone, 'Error al obtener leads.');
  }
}

export async function verSegmentosForCEO(ctx: HandlerContext, phone: string, nombre: string): Promise<void> {
  try {
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const mensaje = await agenciaService.getMensajeSegmentos(nombre);
    await ctx.meta.sendWhatsAppMessage(phone, mensaje);
  } catch (e) {
    console.error('Error en verSegmentos:', e);
    await ctx.meta.sendWhatsAppMessage(phone, 'Error al obtener segmentos.');
  }
}

export async function iniciarBroadcastForCEO(ctx: HandlerContext, phone: string, nombre: string): Promise<void> {
  const agenciaService = new AgenciaReportingService(ctx.supabase);
  const mensaje = agenciaService.getMensajeAyudaBroadcast(nombre);
  await ctx.meta.sendWhatsAppMessage(phone, mensaje);
}

export async function enviarASegmentoForCEO(ctx: HandlerContext, phone: string, body: string, usuario: any): Promise<void> {
  try {
    console.log('📤 BROADCAST (CEO): Iniciando enviarASegmento');
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const queueService = new BroadcastQueueService(ctx.supabase);

    // Parsear el comando
    const parsed = agenciaService.parseEnvioSegmento(body);
    if (!parsed) {
      await ctx.meta.sendWhatsAppMessage(phone,
        `⚠️ Formato incorrecto.\n\nUsa: *enviar a [segmento]: [mensaje]*\n\nEjemplo: enviar a hot: Hola {nombre}, tenemos promoción!`
      );
      return;
    }

    // Obtener leads del segmento
    const leads = await agenciaService.getLeadsBySegment(parsed.segmento);
    if (leads.length === 0) {
      await ctx.meta.sendWhatsAppMessage(phone, `❌ No hay leads en el segmento "${parsed.segmento}".`);
      return;
    }

    // Agregar a cola de broadcast
    await queueService.addToBroadcastQueue(leads, parsed.mensaje, usuario.id, parsed.segmento);

    await ctx.meta.sendWhatsAppMessage(phone,
      `✅ *Broadcast programado*\n\n` +
      `📊 Segmento: ${parsed.segmento}\n` +
      `👥 Destinatarios: ${leads.length}\n` +
      `📝 Mensaje: ${parsed.mensaje.substring(0, 50)}...`
    );
  } catch (e) {
    console.error('Error en enviarASegmento:', e);
    await ctx.meta.sendWhatsAppMessage(phone, '❌ Error al programar broadcast.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIONES DE CAMPAÑAS MASIVAS Y SEGMENTACIÓN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function verSegmentos(ctx: HandlerContext, from: string, nombre: string): Promise<void> {
  try {
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const mensaje = await agenciaService.getMensajeSegmentos(nombre);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.error('Error en verSegmentos:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener segmentos.');
  }
}

export async function iniciarBroadcast(ctx: HandlerContext, from: string, nombre: string): Promise<void> {
  const agenciaService = new AgenciaReportingService(ctx.supabase);
  const mensaje = agenciaService.getMensajeAyudaBroadcast(nombre);
  await ctx.twilio.sendWhatsAppMessage(from, mensaje);
}

export async function enviarASegmento(ctx: HandlerContext, from: string, body: string, usuario: any): Promise<void> {
  try {
    console.log('📤 BROADCAST: Iniciando enviarASegmento');

    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const queueService = new BroadcastQueueService(ctx.supabase);

    // Parsear el comando
    const parsed = agenciaService.parseEnvioSegmento(body);

    // Si no hay mensaje, mostrar ayuda
    if (!parsed.mensajeTemplate) {
      await ctx.twilio.sendWhatsAppMessage(from, agenciaService.getMensajeFormatosEnvio());
      return;
    }

    // Obtener TODOS los leads (sin límite) para decidir si encolar
    const resultado = await agenciaService.getLeadsParaEnvio({
      segmento: parsed.segmento,
      desarrollo: parsed.desarrollo,
      vendedorNombre: parsed.vendedorNombre,
      fechaDesde: parsed.fechaDesde,
      fechaHasta: parsed.fechaHasta,
      noLimit: true // Obtener todos para contar
    });

    if (resultado.error) {
      await ctx.twilio.sendWhatsAppMessage(from, resultado.error);
      return;
    }

    const totalLeads = resultado.leads.length;
    const MAX_IMMEDIATE = 15;

    // Si hay más de 15 leads, usar cola
    if (totalLeads > MAX_IMMEDIATE) {
      console.log(`📤 BROADCAST: ${totalLeads} leads > ${MAX_IMMEDIATE}, usando cola`);

      const leadIds = resultado.leads.map((l: any) => l.id);
      const queueResult = await queueService.queueBroadcast({
        segment: parsed.segmento || 'todos',
        desarrollo: parsed.desarrollo || undefined,
        messageTemplate: parsed.mensajeTemplate,
        leadIds,
        createdBy: usuario.id,
        createdByPhone: from.replace('whatsapp:', '').replace('+', '')
      });

      if (queueResult.success) {
        await ctx.twilio.sendWhatsAppMessage(from,
          `📤 *Broadcast encolado*\n\n` +
          `Filtro: ${resultado.filtroDescripcion}\n` +
          `Total leads: ${totalLeads}\n\n` +
          `⏳ Se procesará automáticamente en lotes de ${MAX_IMMEDIATE}.\n` +
          `📬 Recibirás notificación cuando termine.\n\n` +
          `_Tiempo estimado: ~${Math.ceil(totalLeads / MAX_IMMEDIATE) * 2} minutos_`
        );
      } else {
        await ctx.twilio.sendWhatsAppMessage(from, `❌ Error al encolar: ${queueResult.error}`);
      }
      return;
    }

    // Si hay 15 o menos leads, enviar inmediatamente
    console.log(`📤 BROADCAST: ${totalLeads} leads <= ${MAX_IMMEDIATE}, enviando inmediatamente`);

    await ctx.twilio.sendWhatsAppMessage(from,
      `📤 *Iniciando envío...*\n\n` +
      `Filtro: ${resultado.filtroDescripcion}\n` +
      `Destinatarios: ${totalLeads}\n\n` +
      `⏳ Esto puede tomar unos segundos...`
    );

    // Ejecutar envío inmediato
    const { enviados, errores, templateUsados } = await agenciaService.ejecutarEnvioBroadcast(
      resultado.leads,
      parsed.mensajeTemplate,
      resultado.filtroDescripcion,
      usuario.id,
      async (phone, mensaje) => {
        await ctx.twilio.sendWhatsAppMessage(phone, mensaje);
      },
      async (phone, templateName, lang, components) => {
        return await ctx.meta.sendTemplate(phone, templateName, lang, components);
      }
    );

    await ctx.twilio.sendWhatsAppMessage(from,
      `✅ *Envío completado*\n\n` +
      `📊 Resultados:\n` +
      `• Enviados: ${enviados}\n` +
      `• Templates usados: ${templateUsados}\n` +
      `• Errores: ${errores}\n` +
      `• Total: ${totalLeads}`
    );

  } catch (e) {
    console.error('Error en enviarASegmento:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al enviar mensajes.');
  }
}

export async function previewSegmento(ctx: HandlerContext, from: string, body: string): Promise<void> {
  try {
    const match = body.match(/(?:preview|ver)\s+(\w+)/i);
    if (!match) {
      await ctx.twilio.sendWhatsAppMessage(from, 'Formato: *preview [segmento]*\nEjemplo: preview hot');
      return;
    }

    const segmento = match[1].toLowerCase();
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const { mensaje, error } = await agenciaService.previewSegmento(segmento);

    if (error) {
      await ctx.twilio.sendWhatsAppMessage(from, error);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.error('Error en previewSegmento:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener preview.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIONES DE EVENTOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function verEventos(ctx: HandlerContext, from: string, nombre: string): Promise<void> {
  try {
    const eventosService = new EventosService(ctx.supabase);
    const eventos = await eventosService.getProximosEventos();
    const mensaje = eventosService.formatEventosLista(eventos, nombre);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.error('Error en verEventos:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener eventos.');
  }
}

export async function crearEvento(ctx: HandlerContext, from: string, body: string, usuario: any): Promise<void> {
  try {
    const eventosService = new EventosService(ctx.supabase);
    const datos = eventosService.parseCrearEvento(body);

    if (!datos) {
      await ctx.twilio.sendWhatsAppMessage(from, eventosService.getMensajeAyudaCrearEvento());
      return;
    }

    const { evento, error } = await eventosService.crearEvento(datos, usuario.id);

    if (error || !evento) {
      await ctx.twilio.sendWhatsAppMessage(from, error || 'Error al crear evento.');
      return;
    }

    const mensaje = eventosService.formatEventoCreado(evento, datos.fechaEvento, datos.hora);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.error('Error en crearEvento:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al crear evento.');
  }
}

// INVITAR A EVENTO - Envía invitaciones con filtros avanzados
export async function invitarEvento(ctx: HandlerContext, from: string, body: string, usuario: any): Promise<void> {
  try {
    const eventosService = new EventosService(ctx.supabase);

    // Extraer nombre del evento
    const nombreEvento = eventosService.parseNombreEventoDeComando(body);

    if (!nombreEvento) {
      const ayuda = await eventosService.getMensajeAyudaInvitar();
      await ctx.twilio.sendWhatsAppMessage(from, ayuda);
      return;
    }

    // Buscar el evento
    const evento = await eventosService.buscarEvento(nombreEvento);
    if (!evento) {
      await ctx.twilio.sendWhatsAppMessage(from, `No encontré el evento "${nombreEvento}".`);
      return;
    }

    // Parsear filtros y obtener leads
    const filtros = eventosService.parseFiltrosInvitacion(body);
    const { leads, error, filtroDescripcion } = await eventosService.getLeadsParaInvitacion(filtros);

    if (error) {
      await ctx.twilio.sendWhatsAppMessage(from, error);
      return;
    }

    if (leads.length === 0) {
      await ctx.twilio.sendWhatsAppMessage(from, `No hay leads con filtro: ${filtroDescripcion}`);
      return;
    }

    // Mensaje de inicio
    const mensajeEnviando = eventosService.formatMensajeEnviando(evento, filtroDescripcion, leads.length);
    await ctx.twilio.sendWhatsAppMessage(from, mensajeEnviando);

    // Ejecutar invitaciones
    const resultado = await eventosService.ejecutarInvitaciones(
      leads,
      evento,
      filtroDescripcion,
      async (phone, mensaje) => {
        await ctx.meta.sendWhatsAppMessage(phone, mensaje);
      },
      async (phone, templateName, lang, components) => {
        return await ctx.meta.sendTemplate(phone, templateName, lang, components);
      }
    );

    // Mensaje de resultado
    const mensajeResultado = eventosService.formatResultadoInvitaciones(resultado);
    await ctx.twilio.sendWhatsAppMessage(from, mensajeResultado);

  } catch (e) {
    console.error('Error en invitarEvento:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al enviar invitaciones.');
  }
}

// VER REGISTRADOS EN UN EVENTO
export async function verRegistrados(ctx: HandlerContext, from: string, body: string): Promise<void> {
  try {
    const eventosService = new EventosService(ctx.supabase);
    const match = body.match(/registrados\s+(.+)/i);

    if (!match) {
      // Mostrar todos los eventos con sus registrados
      const eventos = await eventosService.getEventosConRegistrados();
      const mensaje = eventosService.formatListaEventosConRegistrados(eventos);
      await ctx.twilio.sendWhatsAppMessage(from, mensaje);
      return;
    }

    const nombreEvento = match[1].trim();
    const evento = await eventosService.buscarEventoPorNombre(nombreEvento);

    if (!evento) {
      await ctx.twilio.sendWhatsAppMessage(from, `No encontre el evento "${nombreEvento}".`);
      return;
    }

    const registros = await eventosService.getRegistrados(evento.id);
    const mensaje = eventosService.formatRegistrados(evento, registros);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);

  } catch (e) {
    console.error('Error en verRegistrados:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener registrados.');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIONES DE PROMOCIONES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function verPromociones(ctx: HandlerContext, from: string, nombre: string): Promise<void> {
  try {
    const promosService = new PromocionesService(ctx.supabase);
    const promos = await promosService.getPromocionesActivas();
    const mensaje = promosService.formatPromocionesLista(promos, nombre);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);
  } catch (e) {
    console.error('Error en verPromociones:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al obtener promociones.');
  }
}

export async function crearPromocion(ctx: HandlerContext, from: string, body: string, usuario: any): Promise<void> {
  try {
    const promosService = new PromocionesService(ctx.supabase);
    const datos = promosService.parseCrearPromocion(body);

    if (!datos) {
      await ctx.twilio.sendWhatsAppMessage(from, promosService.getMensajeAyudaCrearPromocion());
      return;
    }

    const { promo, error } = await promosService.crearPromocion(datos, usuario.id);

    if (error || !promo) {
      await ctx.twilio.sendWhatsAppMessage(from, error || 'Error al crear promoción.');
      return;
    }

    // Obtener leads del segmento para broadcast automático
    const agenciaService = new AgenciaReportingService(ctx.supabase);
    const queueService = new BroadcastQueueService(ctx.supabase);

    const cleanPhone = from.replace('whatsapp:', '').replace('+', '').replace(/\D/g, '');

    const { leads, totalCount } = await agenciaService.getLeadsParaEnvio({
      segmento: datos.segmento,
      desarrollo: null,
      vendedorNombre: null,
      fechaDesde: null,
      fechaHasta: null,
      noLimit: true
    });

    let broadcastInfo = '';

    if (leads && leads.length > 0) {
      const leadIds = leads.map((l: any) => l.id);

      // Encolar broadcast automáticamente
      const queueResult = await queueService.queueBroadcast({
        segment: datos.segmento,
        messageTemplate: datos.mensaje,
        leadIds,
        createdBy: usuario.id,
        createdByPhone: cleanPhone
      });

      if (queueResult.success) {
        broadcastInfo = `\n\n📤 *Broadcast encolado automáticamente*\n` +
          `👥 ${totalCount || leads.length} leads del segmento "${datos.segmento}"\n` +
          `⏱️ Se enviará en los próximos minutos`;
      }
    }

    const leadsCount = await promosService.contarLeadsSegmento(datos.segmento);
    const mensaje = promosService.formatPromocionCreada(datos, leadsCount) + broadcastInfo;
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);

  } catch (e) {
    console.error('Error en crearPromocion:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al crear promoción.');
  }
}

export async function pausarPromocion(ctx: HandlerContext, from: string, body: string): Promise<void> {
  try {
    const promosService = new PromocionesService(ctx.supabase);
    const nombrePromo = promosService.parseNombrePromocion(body, 'pausar');

    if (!nombrePromo) {
      await ctx.twilio.sendWhatsAppMessage(from, 'Formato: *pausar promo [nombre]*');
      return;
    }

    const { promo, error } = await promosService.pausarPromocion(nombrePromo);

    if (error || !promo) {
      await ctx.twilio.sendWhatsAppMessage(from, error || `No encontré promoción "${nombrePromo}".`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, promosService.formatPromoPausada(promo));
  } catch (e) {
    console.error('Error pausando promo:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al pausar promoción.');
  }
}

export async function activarPromocion(ctx: HandlerContext, from: string, body: string): Promise<void> {
  try {
    const promosService = new PromocionesService(ctx.supabase);
    const nombrePromo = promosService.parseNombrePromocion(body, 'activar');

    if (!nombrePromo) {
      await ctx.twilio.sendWhatsAppMessage(from, 'Formato: *activar promo [nombre]*');
      return;
    }

    const { promo, error } = await promosService.activarPromocion(nombrePromo);

    if (error || !promo) {
      await ctx.twilio.sendWhatsAppMessage(from, error || `No encontré promoción "${nombrePromo}".`);
      return;
    }

    await ctx.twilio.sendWhatsAppMessage(from, promosService.formatPromoActivada(promo));
  } catch (e) {
    console.error('Error activando promo:', e);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al activar promoción.');
  }
}
