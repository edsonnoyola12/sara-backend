// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHATSAPP HANDLER - ASESOR MODULE
// Extraído de whatsapp.ts para modularización
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { HandlerContext } from './whatsapp-types';
import * as utils from './whatsapp-utils';
import { AsesorCommandsService } from '../services/asesorCommandsService';
import { AppointmentSchedulingService } from '../services/appointmentSchedulingService';
import { VendorCommandsService } from '../services/vendorCommandsService';
import { sanitizeNotes } from '../services/vendorCommandsService';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';

// ═══════════════════════════════════════════════════════════════
// HANDLE ASESOR MESSAGE
// ═══════════════════════════════════════════════════════════════

export async function handleAsesorMessage(ctx: HandlerContext, handler: any, from: string, body: string, asesor: any, teamMembers: any[]): Promise<void> {
  const mensaje = body.toLowerCase().trim();
  const nombreAsesor = asesor.name?.split(' ')[0] || 'crack';
  console.log('🏦 Asesor Command:', mensaje);

  const asesorService = new AsesorCommandsService(ctx.supabase);

  // Verificar notas del asesor para pendientes
  const { data: asesorActualizado } = await ctx.supabase.client
    .from('team_members')
    .select('notes')
    .eq('id', asesor.id)
    .single();

  if (asesorActualizado?.notes) {
    try {
      const notes = typeof asesorActualizado.notes === 'string' ? JSON.parse(asesorActualizado.notes) : asesorActualizado.notes;

      // Detectar selección de lead con número
      const selectionResult = await asesorService.processPendingLeadSelection(asesor.id, mensaje, notes);
      if (selectionResult.handled) {
        await ctx.meta.sendWhatsAppMessage(from, selectionResult.respuesta!);
        return;
      }

      if (notes?.pending_message_to_lead) {
        console.log('📤 Asesor enviando mensaje pendiente a lead:', notes.pending_message_to_lead.lead_name);
        await handler.enviarMensajePendienteLead(from, body, asesor, notes.pending_message_to_lead);
        return;
      }

      // Verificar si hay pending_cita_action (cancelar/reagendar con múltiples leads)
      if (notes?.pending_cita_action) {
        const selNum = parseInt(mensaje);
        if (!isNaN(selNum) && selNum > 0 && selNum <= notes.pending_cita_action.leads.length) {
          const selectedLead = notes.pending_cita_action.leads[selNum - 1];
          const action = notes.pending_cita_action.action;

          // Limpiar pending_cita_action
          delete notes.pending_cita_action;
          await ctx.supabase.client
            .from('team_members')
            .update({ notes })
            .eq('id', asesor.id);

          if (action === 'cancelar') {
            // Ejecutar cancelación con el lead seleccionado por ID
            const schedulingService = new AppointmentSchedulingService(ctx.supabase, ctx.calendar);
            const result = await schedulingService.cancelarCitaPorId(selectedLead.id, selectedLead.name, asesor);

            if (!result.success) {
              await ctx.meta.sendWhatsAppMessage(from, `⚠️ ${result.error || 'No se pudo cancelar la cita'}`);
            } else {
              // Confirmar cancelación
              await ctx.meta.sendWhatsAppMessage(from, schedulingService.formatCancelarCitaExito(result));

              // Preguntar si desea notificar al lead (si tiene teléfono)
              if (result.leadPhone) {
                // Guardar estado pendiente de notificación (sanitizar para evitar corrupción)
                const currentNotes = sanitizeNotes(asesor.notes);
                currentNotes.pending_cancelar_notify = {
                  lead_id: result.leadId,
                  lead_name: result.leadName,
                  lead_phone: result.leadPhone,
                  fecha: result.fechaStr,
                  hora: result.horaStr,
                  timestamp: Date.now()
                };
                await ctx.supabase.client
                  .from('team_members')
                  .update({ notes: currentNotes })
                  .eq('id', asesor.id);

                await ctx.meta.sendWhatsAppMessage(from,
                  `📱 *¿Deseas notificar a ${result.leadName} de la cancelación?*\n\n` +
                  `1️⃣ Sí, enviar mensaje\n` +
                  `2️⃣ No, yo le aviso`
                );
              }
            }
            return;
          } else if (action === 'reagendar') {
            // Pedir fecha/hora para reagendar
            await ctx.meta.sendWhatsAppMessage(from,
              `📅 *Reagendar cita de ${selectedLead.name}*\n\n` +
              `Escribe: reagendar ${selectedLead.name.split(' ')[0]} [día] [hora]\n\n` +
              `Ejemplo: reagendar ${selectedLead.name.split(' ')[0]} mañana 4pm`
            );
            return;
          }
        }
      }
    } catch (e) {
      // notes no es JSON válido
    }
  }

  // Verificar pregunta pendiente de vendedor
  const pendingQuestion = await asesorService.getPendingVendorQuestion(asesor.id);
  if (pendingQuestion) {
    console.log(`💬 Asesor ${asesor.name} respondió a pregunta de vendedor sobre ${pendingQuestion.solicitud.lead_name}`);
    const result = await asesorService.processPendingVendorQuestion(
      pendingQuestion.solicitud.id,
      body,
      asesor.name,
      pendingQuestion.solicitud.lead_name,
      pendingQuestion.solicitud.status
    );
    await ctx.twilio.sendWhatsAppMessage(pendingQuestion.notes.from_vendedor_phone, result.mensajeVendedor);
    await ctx.twilio.sendWhatsAppMessage(from, result.confirmacion);
    return;
  }

  // Detectar comando usando el servicio
  const result = asesorService.detectCommand(mensaje, body, nombreAsesor);

  switch (result.action) {
    case 'send_message':
      await ctx.twilio.sendWhatsAppMessage(from, result.message!);
      return;

    case 'call_handler':
      await executeAsesorHandler(ctx, handler, from, body, asesor, nombreAsesor, teamMembers, result.handlerName!, result.handlerParams);
      return;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXECUTE ASESOR HANDLER
// ═══════════════════════════════════════════════════════════════

export async function executeAsesorHandler(ctx: HandlerContext, handler: any, from: string, body: string, asesor: any, nombreAsesor: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
  const asesorService = new AsesorCommandsService(ctx.supabase);

  // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
  const handlerResult = await asesorService.executeHandler(
    handlerName,
    asesor,
    nombreAsesor,
    { body, match: params?.match, ...params }
  );

  // Si el servicio manejó el comando
  if (handlerResult.message) {
    // Enviar mensaje al lead si es necesario (puente asesor → lead)
    if (handlerResult.leadPhone && handlerResult.leadMessage) {
      await ctx.meta.sendWhatsAppMessage(
        handlerResult.leadPhone.replace(/\D/g, ''),
        handlerResult.leadMessage
      );
      console.log(`📤 Mensaje enviado a lead ${handlerResult.leadPhone}`);
    }

    // Notificar vendedor si es necesario (usa enviarMensajeTeamMember para respetar 24h + pending correcto)
    if (handlerResult.vendedorPhone && handlerResult.vendedorMessage) {
      const vendedorPhoneClean = handlerResult.vendedorPhone.replace(/\D/g, '');
      const phoneSuffix = vendedorPhoneClean.slice(-10);

      // Buscar vendedor completo para enviarMensajeTeamMember
      const { data: vendedorData } = await ctx.supabase.client
        .from('team_members')
        .select('*')
        .like('phone', `%${phoneSuffix}`)
        .single();

      if (vendedorData) {
        try {
          await enviarMensajeTeamMember(ctx.supabase, ctx.meta, vendedorData, handlerResult.vendedorMessage, {
            tipoMensaje: 'alerta_lead',
            pendingKey: 'pending_alerta_lead'
          });
          console.log(`📤 Notificación enviada a vendedor ${vendedorData.name} via enviarMensajeTeamMember`);
        } catch (notifErr) {
          console.error('❌ Error notificando vendedor:', notifErr);
        }
      } else {
        console.error(`⚠️ No se encontró vendedor con teléfono ${vendedorPhoneClean}`);
      }
    }

    // Responder al asesor
    await ctx.meta.sendWhatsAppMessage(from.replace('whatsapp:', '').replace('+', ''), handlerResult.message);
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
    case 'asesorAgendarCita':
      await asesorAgendarCita(ctx, handler, from, body, asesor, nombreAsesor);
      break;
    case 'vendedorCancelarCita':
      await handler.vendedorCancelarCita(from, body, asesor, nombreAsesor);
      break;
    case 'vendedorReagendarCita':
      await handler.vendedorReagendarCita(from, body, asesor, nombreAsesor);
      break;
    case 'vendedorAgendarCitaCompleta':
      await handler.vendedorAgendarCitaCompleta(from, body, asesor, nombreAsesor);
      break;

    // ━━━ CREAR LEAD ━━━
    case 'asesorCrearLeadHipoteca':
      await asesorCrearLeadHipoteca(ctx, handler, from, body, asesor, nombreAsesor, teamMembers);
      break;

    // ━━━ TELÉFONO / MENSAJE ━━━
    case 'mostrarTelefonoLead':
      await handler.mostrarTelefonoLead(from, params.nombreLead, asesor);
      break;
    case 'enviarMensajeLead':
      await handler.enviarMensajeLead(from, params.nombreLead, asesor);
      break;

    default:
      console.log('Handler Asesor no reconocido:', handlerName);
      await asesorAyuda(ctx, handler, from, nombreAsesor);
  }
}

// ═══════════════════════════════════════════════════════════════
// EJECUTAR VENDEDOR HANDLER (para CEO usando comandos de vendedor)
// ═══════════════════════════════════════════════════════════════

export async function executeVendedorHandler(ctx: HandlerContext, handler: any, from: string, body: string, ceo: any, nombreCEO: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
  const vendorService = new VendorCommandsService(ctx.supabase);
  const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

  // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
  const handlerResult = await vendorService.executeHandler(
    handlerName,
    ceo,
    nombreCEO,
    params || {}
  );

  // Si el servicio manejó el comando exitosamente, enviar mensaje
  if (handlerResult.message) {
    await ctx.meta.sendWhatsAppMessage(cleanPhone, handlerResult.message);
    return;
  }

  // Si hay error pero no necesita handler externo, mostrar error
  if (handlerResult.error && !handlerResult.needsExternalHandler) {
    await ctx.meta.sendWhatsAppMessage(cleanPhone, handlerResult.error);
    return;
  }

  // ━━━ FALLBACK: Handlers que requieren lógica externa ━━━
  switch (handlerName) {
    // ━━━ CITAS ━━━
    case 'vendedorCitasHoy':
      await handler.vendedorCitasHoy(from, ceo, nombreCEO);
      break;
    case 'vendedorCitasManana':
      await handler.vendedorCitasManana(from, ceo, nombreCEO);
      break;
    case 'vendedorCancelarCita':
      await handler.vendedorCancelarCita(from, body, ceo, nombreCEO);
      break;
    case 'vendedorReagendarCita':
      await handler.vendedorReagendarCita(from, body, ceo, nombreCEO);
      break;
    case 'vendedorAgendarCitaCompleta':
      await handler.vendedorAgendarCitaCompleta(from, body, ceo, nombreCEO);
      break;
    case 'vendedorAgendarCita':
      await handler.vendedorAgendarCita(from, body, ceo, nombreCEO);
      break;

    // ━━━ LEADS ━━━
    case 'vendedorResumenLeads':
      await handler.vendedorResumenLeads(from, ceo, nombreCEO);
      break;
    case 'vendedorLeadsHot':
      await handler.vendedorLeadsHot(from, ceo, nombreCEO);
      break;
    case 'vendedorAgregarNota':
      await handler.vendedorAgregarNotaConParams(from, params?.nombreLead, params?.textoNota, ceo, nombreCEO);
      break;
    case 'vendedorVerNotas':
      await handler.vendedorVerNotasConParams(from, params?.nombreLead, ceo, nombreCEO);
      break;
    case 'vendedorCrearLead':
      await handler.vendedorCrearLead(from, body, ceo, nombreCEO);
      break;

    // ━━━ MATERIALES ━━━
    case 'vendedorEnviarMaterial':
      await handler.vendedorEnviarMaterial(from, body, ceo, nombreCEO, params?.tipo, params?.nombreLead);
      break;
    case 'vendedorEnviarInfoALead':
      await handler.vendedorEnviarInfoALead(from, body, ceo, nombreCEO);
      break;

    // ━━━ COACHING ━━━
    case 'vendedorCoaching':
      await handler.vendedorCoaching(from, params?.tema || body, ceo, nombreCEO);
      break;

    // ━━━ LLAMADAS ━━━
    case 'vendedorLlamar':
      await handler.vendedorLlamar(from, params?.nombreLead, ceo, nombreCEO);
      break;
    case 'vendedorLlamarIA':
      await handler.vendedorLlamarIA(from, params?.nombre, ceo, nombreCEO);
      break;
    case 'vendedorProgramarLlamada':
      await handler.vendedorProgramarLlamada(from, body, ceo, nombreCEO);
      break;
    case 'vendedorRecordarLlamar':
      await handler.vendedorRecordarLlamar(from, params?.nombreLead, params?.cuando, ceo, nombreCEO);
      break;
    case 'vendedorLlamadasPendientes':
      await handler.vendedorLlamadasPendientes(from, ceo, nombreCEO);
      break;

    // ━━━ HISTORIAL ━━━
    case 'vendedorVerHistorial':
      await handler.vendedorVerHistorial(from, params?.nombreLead, ceo, nombreCEO);
      break;

    // ━━━ BRIDGE ━━━
    case 'activateBridge':
      await handler.activateBridge(from, params?.nombreLead, ceo, nombreCEO, teamMembers);
      break;

    // ━━━ HIPOTECA ━━━
    case 'vendedorEnviarABanco':
      await handler.vendedorEnviarABanco(from, body, ceo);
      break;
    case 'vendedorConsultarCredito':
      await handler.vendedorConsultarCredito(from, params?.nombre || body, ceo);
      break;

    default:
      console.log('Handler Vendedor (CEO) no reconocido:', handlerName);
      await ctx.meta.sendWhatsAppMessage(cleanPhone, '❓ Comando no reconocido. Escribe *ayuda* para ver opciones.');
  }
}

// ═══════════════════════════════════════════════════════════════
// ASESOR CREAR LEAD HIPOTECA
// Formato: "nuevo Juan Garcia 5512345678 para Edson" o "nuevo Juan Garcia 5512345678"
// ═══════════════════════════════════════════════════════════════

export async function asesorCrearLeadHipoteca(ctx: HandlerContext, handler: any, from: string, body: string, asesor: any, nombre: string, teamMembers: any[]): Promise<void> {
  try {
    const asesorService = new AsesorCommandsService(ctx.supabase);

    // Parsear el comando
    const parsed = asesorService.parseCrearLeadHipoteca(body);
    if (!parsed) {
      await ctx.twilio.sendWhatsAppMessage(from, asesorService.getMensajeAyudaCrearLeadHipoteca());
      return;
    }

    // Verificar si ya existe
    const { existe, lead: leadExistente } = await asesorService.verificarLeadExistente(parsed.telefono);
    if (existe) {
      await ctx.twilio.sendWhatsAppMessage(from, asesorService.formatLeadYaExiste(leadExistente));
      return;
    }

    // Buscar vendedor
    let vendedorAsignado: any = null;
    let asignadoPorRoundRobin = false;

    if (parsed.nombreVendedor) {
      const vendedores = asesorService.buscarVendedorPorNombre(teamMembers, parsed.nombreVendedor);
      if (vendedores.length === 0) {
        await ctx.twilio.sendWhatsAppMessage(from, asesorService.formatVendedorNoEncontrado(parsed.nombreVendedor, teamMembers));
        return;
      }
      vendedorAsignado = vendedores[0];
    } else {
      vendedorAsignado = await asesorService.getVendedorRoundRobin(teamMembers);
      asignadoPorRoundRobin = true;
    }

    if (!vendedorAsignado) {
      await ctx.twilio.sendWhatsAppMessage(from, '❌ No hay vendedores activos disponibles.');
      return;
    }

    // Crear el lead
    const { lead, error } = await asesorService.crearLeadHipotecario(
      parsed.nombreLead,
      parsed.telefono,
      vendedorAsignado.id,
      vendedorAsignado.name,
      asesor.id,
      asesor.name
    );

    if (error || !lead) {
      await ctx.twilio.sendWhatsAppMessage(from, `❌ Error: ${error || 'No se pudo crear el lead'}`);
      return;
    }

    // Notificar al vendedor
    if (vendedorAsignado.phone) {
      const vendedorPhone = vendedorAsignado.phone.replace(/\D/g, '');
      const msgVendedor = asesorService.formatNotificacionVendedorNuevoLead(parsed.nombreLead, parsed.telefono, asesor.name);
      await ctx.twilio.sendWhatsAppMessage(utils.formatPhoneMX(vendedorPhone), msgVendedor);
    }

    // Confirmar al asesor
    const mensaje = asesorService.formatLeadHipotecaCreado(parsed.nombreLead, parsed.telefono, vendedorAsignado.name, asignadoPorRoundRobin);
    await ctx.twilio.sendWhatsAppMessage(from, mensaje);

  } catch (error) {
    console.error('Error en asesorCrearLeadHipoteca:', error);
    await ctx.twilio.sendWhatsAppMessage(from, '❌ Error al crear lead.');
  }
}

// ═══════════════════════════════════════════════════════════════
// ASESOR AYUDA
// ═══════════════════════════════════════════════════════════════

export async function asesorAyuda(ctx: HandlerContext, handler: any, from: string, nombre: string): Promise<void> {
  const asesorService = new AsesorCommandsService(ctx.supabase);
  const mensaje = asesorService.getMensajeAyuda(nombre);
  await ctx.twilio.sendWhatsAppMessage(from, mensaje);
}

// ═══════════════════════════════════════════════════════════════
// ASESOR AGENDAR CITA
// ═══════════════════════════════════════════════════════════════

export async function asesorAgendarCita(ctx: HandlerContext, handler: any, from: string, body: string, asesor: any, nombre: string): Promise<void> {
  const asesorService = new AsesorCommandsService(ctx.supabase);
  const datosCita = asesorService.parseAgendarCita(body);

  if (!datosCita) {
    await ctx.twilio.sendWhatsAppMessage(from, asesorService.getMensajeAyudaAgendarCita());
    return;
  }

  // Buscar o crear lead
  const { leadId, leadName, leadPhone } = await asesorService.buscarOCrearLead(datosCita.nombreLead, datosCita.telefono);

  // Crear cita
  const { error } = await asesorService.crearCitaHipoteca(datosCita, asesor.id, asesor.name, leadId, leadName, leadPhone);

  if (error) {
    await ctx.twilio.sendWhatsAppMessage(from, `❌ Error: ${error}`);
    return;
  }

  // Google Calendar
  try {
    const calData = asesorService.getEventoCalendarData(datosCita.fecha, leadName, leadPhone, datosCita.lugar);
    const formatDate = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
    };

    await ctx.calendar.createEvent({
      summary: calData.summary,
      description: calData.description,
      location: calData.location,
      start: { dateTime: formatDate(calData.start), timeZone: 'America/Mexico_City' },
      end: { dateTime: formatDate(calData.end), timeZone: 'America/Mexico_City' }
    });
  } catch (e) {
    console.error('Error GCal:', e);
  }

  const mensaje = asesorService.formatCitaCreada(datosCita.fecha, leadName, datosCita.lugar);
  await ctx.twilio.sendWhatsAppMessage(from, mensaje);
}
