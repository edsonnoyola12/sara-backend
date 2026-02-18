import { SupabaseService } from '../services/supabase';
import { ClaudeService } from '../services/claude';
import { TwilioService } from '../services/twilio';
import { FollowupService } from '../services/followupService';
import { FollowupApprovalService } from '../services/followupApprovalService';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { CalendarService } from '../services/calendar';
import { SurveyService } from '../services/surveyService';
import { AIConversationService } from '../services/aiConversationService';
import { LeadMessageService } from '../services/leadMessageService';
import * as utils from './whatsapp-utils';
import * as asesorHandlers from './whatsapp-asesor';
import * as agenciaHandlers from './whatsapp-agencia';
import * as ceoHandlers from './whatsapp-ceo';
import * as vendorHandlers from './whatsapp-vendor';
import { HandlerContext } from './whatsapp-types';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { enviarAlertaSistema } from '../crons/healthCheck';
import { isLikelySurveyResponse } from '../crons/nurturing';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MÓDULOS REFACTORIZADOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import {
  VIDEO_SERVER_URL,
  HORARIOS,
  DESARROLLOS_CONOCIDOS,
  MODELOS_CONOCIDOS,
  ContextoDecision,
  DatosConversacion,
  AIAnalysis,
  parsearDesarrollosYModelos,
  inferirDesarrollosDesdeModelos,
  formatPhoneMX as formatPhoneMXUtil,
  PATRONES
} from './constants';

import {
  getMexicoNow,
  getNextDayOfWeek,
  parseFechaEspanol,
  detectarIntencionCita,
  parseFecha as parseFechaUtil,
  parseFechaISO,
  parseHoraISO,
  formatearFechaParaUsuario,
  formatearHoraParaUsuario,
  ParsedFecha,
  IntencionCita
} from './dateParser';

import {
  validarHorarioLaboral,
  parseHoraCRM,
  parseDiasCRM,
  formatDateForCalendar,
  crearEventoCalendar,
  parseCancelarCitaCommand,
  parseReagendarCommand,
  parseAgendarCitaCommand,
  mensajeNuevaCitaVendedor,
  mensajeNuevaCitaAsesor,
  mensajeConfirmacionCitaCliente,
  mensajeCitaCancelada,
  mensajeReagendadoCliente,
  mensajeHorarioFueraRango,
  formatearFechaLegible,
  formatearHoraLegible,
  calcularTemperatura,
  citaRecienteThreshold,
  Appointment,
  AppointmentValidation,
  ParsedCommand,
  CalendarEventData
} from './appointmentService';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES LOCALES (las que no se exportaron a módulos)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Nota: ContextoDecision, DatosConversacion y AIAnalysis ahora vienen de constants.ts

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLASE PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class WhatsAppHandler {
  private formatPhoneMX(phone: string): string { return utils.formatPhoneMX(phone); }
  private parseFechaEspanol(texto: string): ParsedFecha | null { return utils.parseFechaEspanolWrapper(texto); }
  private detectarIntencionCita(mensaje: string) { return utils.detectarIntencionCita(mensaje); }

  // Almacenar env para acceder a variables de entorno en todos los métodos
  private env: any = null;

  constructor(
    private supabase: SupabaseService,
    private claude: ClaudeService,
    private twilio: TwilioService,
    private calendar: any,
    private meta: MetaWhatsAppService
  ) {}

  get ctx(): HandlerContext {
    return { supabase: this.supabase, claude: this.claude, twilio: this.twilio, calendar: this.calendar, meta: this.meta, env: this.env };
  }

  private determinarContextoYAccion(datos: DatosConversacion): ContextoDecision { return utils.determinarContextoYAccion(datos); }
  private extraerNombreSimple(mensaje: string): string | null { return utils.extraerNombreSimple(mensaje); }
  private detectarBanco(mensaje: string): string | null { return utils.detectarBanco(mensaje); }
  private detectarMonto(mensaje: string): number | null { return utils.detectarMonto(mensaje); }
  private async finalizarFlujoCredito(lead: any, from: string, teamMembers: any[]): Promise<void> { return utils.finalizarFlujoCredito(this.ctx, lead, from, teamMembers); }
  private async actualizarScoreInteligente(leadId: string, flujo: string | null | undefined, datos: any): Promise<void> { return utils.actualizarScoreInteligente(this.ctx, leadId, flujo, datos); }
  private getPropsParaDesarrollos(desarrollos: string[], properties: any[]): any[] { return utils.getPropsParaDesarrollos(this.ctx, desarrollos, properties); }
  private getPropsParaModelos(modelos: string[], properties: any[]): any[] { return utils.getPropsParaModelos(this.ctx, modelos, properties); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTODO PRINCIPAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async handleIncomingMessage(from: string, body: string, env?: any, rawRequest?: any): Promise<void> {
    try {
      // Almacenar env para acceder en todos los métodos de la clase
      if (env) this.env = env;

      const trimmedBody = (body || '').trim();
      
      // Filtrar status callbacks de Twilio
      if (rawRequest?.SmsStatus || rawRequest?.MessageStatus || rawRequest?.EventType) {
        console.error('⚠️ Ignorando status callback');
        return;
      }
      
      // Filtrar mensajes vacíos o status
      const ignoredMessages = ['OK', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'QUEUED'];
      if (!trimmedBody || ignoredMessages.includes(trimmedBody.toUpperCase())) {
        console.error('⚠️ Ignorando:', trimmedBody);
        return;
      }

      console.log('📱 Mensaje de:', from, '-', body);
      const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

      // ═══════════════════════════════════════════════════════════════
      // COMANDO RESET PARA TESTING (solo leads recientes de números autorizados)
      // ═══════════════════════════════════════════════════════════════
      const digits = cleanPhone.replace(/\D/g, '').slice(-10);

      // Solo permite RESET si: mensaje es RESET y el lead existe con menos de 24h
      if (body.toUpperCase().trim() === 'RESET') {
        const { data: leadTest } = await this.supabase.client
          .from('leads')
          .select('id, created_at, name')
          .like('phone', '%' + digits)
          .single();

        if (leadTest) {
          const horasDesdeCreacion = (Date.now() - new Date(leadTest.created_at).getTime()) / (1000 * 60 * 60);
          // Solo borrar si tiene menos de 24 horas (lead de prueba reciente)
          if (horasDesdeCreacion < 24) {
            console.log('🧪 RESET TEST - Borrando lead reciente:', leadTest.name);
            await this.supabase.client.from('leads').delete().eq('id', leadTest.id);
            await this.twilio.sendWhatsAppMessage(from, '🧪 *MODO TEST*\n\nLead borrado. Escribe cualquier cosa para empezar como cliente nuevo.');
            return;
          } else {
            console.error('⚠️ RESET rechazado - Lead tiene más de 24h:', leadTest.name);
          }
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // COMANDO REACTIVAR - Para leads que quieren volver a recibir mensajes
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (body.toUpperCase().trim() === 'REACTIVAR') {
        const { data: leadDNC } = await this.supabase.client
          .from('leads')
          .select('id, name, do_not_contact')
          .like('phone', '%' + digits)
          .single();

        if (leadDNC?.do_not_contact) {
          await this.supabase.client.from('leads')
            .update({
              do_not_contact: false,
              dnc_reason: null,
              dnc_at: null
            })
            .eq('id', leadDNC.id);

          await this.twilio.sendWhatsAppMessage(from,
            '✅ ¡Bienvenido de vuelta! Tu cuenta ha sido reactivada.\n\n' +
            '¿En qué te puedo ayudar hoy? 🏠'
          );
          console.log(`✅ Lead ${leadDNC.name} reactivado (era DNC)`);
          return;
        }
      }

      // Obtener datos (skipTeamCheck=true: team check done below with cached teamMembers)
      const [leadResult, properties, teamMembers] = await Promise.all([
        this.getOrCreateLead(cleanPhone, true),
        this.getAllProperties(),
        this.getAllTeamMembers()
      ]);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🛡️ PRIORIDAD TEAM MEMBER: Si el teléfono es de un vendedor/admin,
      // NO procesar como lead - saltar directo a lógica de vendedor
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const phoneCleanForTeamCheck = cleanPhone.replace(/\D/g, '').slice(-10);
      const esTeamMember = teamMembers.some((tm: any) => {
        if (!tm.phone) return false;
        const tmPhone = tm.phone.replace(/\D/g, '').slice(-10);
        return tmPhone === phoneCleanForTeamCheck;
      });

      if (esTeamMember) {
        console.log(`🛡️ TEAM MEMBER DETECTADO TEMPRANO: ${cleanPhone} - saltando procesamiento de lead`);
        // Saltar todo el procesamiento de lead y ir directo a la sección de vendedor (línea ~860)
        // El código de vendedor está más abajo, así que continuamos pero marcamos que NO es lead
      }

      // Si es team member PERO tiene encuesta pendiente como lead, procesar encuesta PRIMERO
      if (esTeamMember && leadResult.lead) {
        const surveyNotes = typeof leadResult.lead.notes === 'object' ? leadResult.lead.notes : {};
        if (surveyNotes.pending_satisfaction_survey) {
          const respuesta = trimmedBody.trim();
          const surveyRatings: Record<string, { label: string; emoji: string }> = {
            '1': { label: 'Excelente', emoji: '🌟' },
            '2': { label: 'Buena', emoji: '👍' },
            '3': { label: 'Regular', emoji: '😐' },
            '4': { label: 'Mala', emoji: '😔' }
          };
          const rating = surveyRatings[respuesta];
          if (rating) {
            console.log(`📋 Team member respondiendo a encuesta de satisfacción como lead: ${respuesta}`);
            const nombreCliente = leadResult.lead.name?.split(' ')[0] || '';
            const propiedad = surveyNotes.pending_satisfaction_survey.property || 'la propiedad';
            try {
              await this.supabase.client.from('surveys').insert({
                lead_id: leadResult.lead.id,
                survey_type: 'satisfaction',
                rating: parseInt(respuesta),
                rating_label: rating.label,
                property: propiedad,
                created_at: new Date().toISOString()
              });
            } catch (err) { console.error('⚠️ Error guardando encuesta:', err); }
            delete surveyNotes.pending_satisfaction_survey;
            await this.supabase.client.from('leads').update({ notes: surveyNotes }).eq('id', leadResult.lead.id);
            const msg = (respuesta === '1' || respuesta === '2')
              ? `¡Gracias por tu feedback, ${nombreCliente}! ${rating.emoji}\n\nNos alegra que hayas tenido una experiencia *${rating.label.toLowerCase()}*.\n\nSi tienes alguna pregunta sobre *${propiedad}*, ¡aquí estamos! 🏠`
              : `Gracias por tu feedback, ${nombreCliente}. ${rating.emoji}\n\nLamentamos que tu experiencia no haya sido la mejor.\n¿Hay algo específico que podamos hacer para mejorar? 🙏`;
            await this.meta.sendWhatsAppMessage(cleanPhone, msg);
            return;
          }
        }
        // Check CRON survey flags (NPS, entrega, satisfacción casa, mantenimiento)
        const hasCronSurvey = surveyNotes.esperando_respuesta_nps || surveyNotes.esperando_respuesta_entrega ||
          surveyNotes.esperando_respuesta_satisfaccion_casa || surveyNotes.esperando_respuesta_mantenimiento;
        if (hasCronSurvey) {
          // Let index.ts survey handlers process this (they run before handleIncomingMessage)
          // If we're here, they didn't match - continue as team member
          console.log('📋 Team member tiene flag de encuesta CRON pero no matcheó - continuando como team member');
        }
      }
      const lead = esTeamMember ? null : leadResult.lead;  // Si es team member, no tratar como lead
      const isNewLead = esTeamMember ? false : leadResult.isNew;

      if (isNewLead) {
        console.log('🆕 LEAD NUEVO detectado - se generará video de bienvenida cuando tenga nombre + desarrollo');

        // Notificar al vendedor asignado sobre el nuevo lead
        if (leadResult.assignedVendedorId) {
          const vendedorAsignado = teamMembers.find((tm: any) => tm.id === leadResult.assignedVendedorId);
          if (vendedorAsignado) {
            const notifMsg = `🆕 *NUEVO LEAD ASIGNADO*\n\n` +
              `📱 ${cleanPhone}\n` +
              `💬 "${trimmedBody.substring(0, 100)}"\n\n` +
              `Este lead te fue asignado automáticamente. ¡Responde pronto!\n\n` +
              `Escribe *mis leads* para ver tu lista.`;
            try {
              await enviarMensajeTeamMember(this.supabase, this.meta, vendedorAsignado, notifMsg, {
                tipoMensaje: 'alerta_lead',
                guardarPending: true,
                pendingKey: 'pending_alerta_lead',
                templateOverride: {
                  name: 'notificacion_cita_vendedor',
                  params: [
                    '🆕 Nuevo lead asignado',
                    cleanPhone,
                    `wa.me/${cleanPhone}`,
                    trimmedBody.substring(0, 50) || 'Mensaje nuevo',
                    'Escribe "mis leads" para verlo'
                  ]
                }
              });
              console.log(`📤 Vendedor ${vendedorAsignado.name} notificado del nuevo lead`);
            } catch (e) {
              console.error('Error notificando vendedor de nuevo lead:', e);
            }
          }
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🚫 VERIFICAR SI LEAD ESTÁ MARCADO COMO DO NOT CONTACT
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lead?.do_not_contact) {
        console.log(`🚫 Lead ${cleanPhone} está marcado como DNC - ignorando mensaje`);
        // Solo responder si pide reactivar
        if (trimmedBody.toUpperCase() !== 'REACTIVAR') {
          return; // No procesar
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // NOTA: last_activity_at se actualiza junto con last_message_at
      // más abajo (~línea 1062) para ahorrar 1 subrequest
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🚨 DETECCIÓN DE "NO ME MOLESTES" (DNC - Do Not Contact)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const { detectDNCPhrase } = await import('../services/meta-whatsapp');
      if (detectDNCPhrase(trimmedBody) && lead?.id) {
        console.log(`🚫 DNC DETECTADO de ${cleanPhone}: "${trimmedBody}"`);

        // Marcar lead como do_not_contact
        await this.supabase.client.from('leads')
          .update({
            do_not_contact: true,
            dnc_reason: `Solicitó no ser contactado: "${trimmedBody.substring(0, 100)}"`,
            dnc_at: new Date().toISOString()
          })
          .eq('id', lead.id);

        // Bloquear en rate limiter
        this.meta.markAsBlocked(cleanPhone, 'DNC - Solicitó no ser contactado');

        // Responder confirmando que no se le molestará más
        await this.twilio.sendWhatsAppMessage(from,
          '✅ Entendido. Hemos registrado tu solicitud y no te enviaremos más mensajes.\n\n' +
          'Si en el futuro deseas información sobre nuestros desarrollos, escríbenos "REACTIVAR".\n\n' +
          'Disculpa las molestias. 🙏'
        );

        // Alertar al admin
        try {
          await enviarAlertaSistema(this.meta,
            `🚫 DNC DETECTADO\n\n📱 ${cleanPhone}\n👤 ${lead.name || 'Sin nombre'}\n💬 "${trimmedBody}"\n\nLead marcado como DO NOT CONTACT`,
            undefined, 'dnc'
          );
        } catch (e) {
          console.error('⚠️ No se pudo alertar admin sobre DNC');
        }

        return; // No procesar más este mensaje
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CANCELAR FOLLOW-UPS PENDIENTES (el lead respondió)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lead?.id) {
        try {
          const followupService = new FollowupService(this.supabase);
          const cancelados = await followupService.cancelarPorRespuesta(lead.id, cleanPhone);
          if (cancelados > 0) {
            console.log(`📭 ${cancelados} follow-ups cancelados - lead respondió`);
          }
        } catch (e) {
          console.error('⚠️ Error cancelando follow-ups:', e);
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 📲 NOTIFICACIÓN EN TIEMPO REAL AL VENDEDOR (lead respondió)
      // Solo si: tiene vendedor asignado, no es mensaje corto/automatizado
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lead?.assigned_to && trimmedBody.length >= 3) {
        // No notificar si es respuesta corta tipo "ok", "si", números solos
        const esRespuestaCorta = /^(ok|si|sí|no|1|2|3|4|5|hola|gracias)$/i.test(trimmedBody);
        const leadNotes = typeof lead.notes === 'object' ? lead.notes : {};
        const tieneContextoActivo = leadNotes.active_bridge_to_vendedor || leadNotes.pending_response_to;

        // Solo notificar si NO hay bridge/contexto activo (evita duplicados)
        if (!esRespuestaCorta && !tieneContextoActivo) {
          try {
            const { data: vendedorAsignado } = await this.supabase.client
              .from('team_members')
              .select('id, name, phone, notes')
              .eq('id', lead.assigned_to)
              .single();

            if (vendedorAsignado?.phone) {
              // Verificar si vendedor tiene activadas las notificaciones en tiempo real
              const vendedorNotes = typeof vendedorAsignado.notes === 'object' ? vendedorAsignado.notes : {};
              const notificacionesActivas = vendedorNotes.notificaciones_lead_responde !== false; // default: true

              if (notificacionesActivas) {
                // Verificar que no hayamos notificado hace menos de 5 minutos (anti-spam)
                const ultimaNotif = vendedorNotes.ultima_notif_lead_responde;
                const hace5min = Date.now() - 5 * 60 * 1000;
                const puedeNotificar = !ultimaNotif || new Date(ultimaNotif).getTime() < hace5min;

                if (puedeNotificar) {
                  const scoreTemp = lead.lead_score >= 70 ? '🔥' : lead.lead_score >= 40 ? '🟡' : '🔵';
                  await this.meta.sendWhatsAppMessage(vendedorAsignado.phone,
                    `📲 *${lead.name || 'Lead'} respondió*\n\n` +
                    `💬 "${trimmedBody.substring(0, 80)}${trimmedBody.length > 80 ? '...' : ''}"\n\n` +
                    `${scoreTemp} Score: ${lead.lead_score || 0} | 🏠 ${lead.property_interest || 'Sin desarrollo'}\n\n` +
                    `💡 *bridge ${lead.name?.split(' ')[0] || 'lead'}* para chat directo`
                  );
                  console.log(`📲 Notificación en tiempo real enviada a ${vendedorAsignado.name}`);

                  // Actualizar timestamp de última notificación
                  await this.supabase.client.from('team_members')
                    .update({ notes: { ...vendedorNotes, ultima_notif_lead_responde: new Date().toISOString() } })
                    .eq('id', vendedorAsignado.id);
                }
              }
            }
          } catch (notifErr) {
            console.error('⚠️ Error notificando vendedor:', notifErr);
          }
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VERIFICAR SI ES RESPUESTA A ENCUESTA (CRÍTICO - ANTES DE IA)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log(`📋 ENCUESTA CHECK: phone=${cleanPhone}, msg="${trimmedBody}"`);
      try {
        const respuestaEncuesta = await this.procesarRespuestaEncuesta(cleanPhone, trimmedBody);
        console.log(`📋 ENCUESTA CHECK: resultado=${respuestaEncuesta ? 'PROCESADA' : 'NO HAY ENCUESTA'}`);
        if (respuestaEncuesta) {
          console.log(`📋 Respuesta de encuesta procesada para ${cleanPhone}`);
          await this.meta.sendWhatsAppMessage(cleanPhone, respuestaEncuesta);
          return; // No procesar más, ya respondimos a la encuesta
        }
      } catch (e: any) {
        console.error('⚠️ Error procesando respuesta de encuesta:', e.message || e);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VERIFICAR SI ES RESPUESTA DE VENDEDOR A POST-VISITA
      // (Busca por vendedor_phone en el contexto, no solo por team_member)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log(`📋 POST-VISITA CHECK: Buscando contexto para phone ${cleanPhone}`);
      try {
        const postVisitResult = await this.buscarYProcesarPostVisitaPorPhone(cleanPhone, trimmedBody, teamMembers);
        console.log(`📋 POST-VISITA CHECK: Resultado = ${postVisitResult ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
        if (postVisitResult) {
          console.log(`📋 POST-VISITA: Respuesta procesada de vendedor ${cleanPhone}`);
          await this.meta.sendWhatsAppMessage(cleanPhone, postVisitResult.respuesta);

          // Ejecutar acciones adicionales (enviar encuesta a lead, etc.)
          if (postVisitResult.accion) {
            await this.ejecutarAccionPostVisita(postVisitResult);
          }
          return;
        }
      } catch (e) {
        console.error('⚠️ Error procesando post-visita:', e);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VERIFICAR SI ES RESPUESTA A BROADCAST/PROMOCIÓN
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      try {
        const notes = typeof lead?.notes === 'object' ? lead.notes : {};
        const lastBroadcast = notes.last_broadcast;

        if (lastBroadcast?.sent_at) {
          const sentAt = new Date(lastBroadcast.sent_at);
          const hoursAgo = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);

          // Si el broadcast fue hace menos de 48 horas y responde afirmativamente
          const respuestaAfirmativa = /^(si|sí|ok|dale|claro|me interesa|quiero|información|info)$/i.test(trimmedBody.toLowerCase());

          if (hoursAgo < 48 && respuestaAfirmativa) {
            console.log(`📡 BROADCAST RESPONSE: Lead ${lead.name} respondió "${trimmedBody}" a broadcast de hace ${hoursAgo.toFixed(1)}h`);

            // Obtener información de propiedades para dar contexto
            const { data: properties } = await this.supabase.client
              .from('properties')
              .select('name, location, price_from, price_to, amenities')
              .eq('active', true)
              .limit(5);

            let respuestaBroadcast = `¡Excelente ${lead.name || ''}! 🎉\n\n`;
            respuestaBroadcast += `Me da gusto que te interese. Te cuento sobre nuestras opciones:\n\n`;

            if (properties && properties.length > 0) {
              respuestaBroadcast += `🏠 *Desarrollos disponibles:*\n`;
              for (const prop of properties.slice(0, 4)) {
                const priceRange = prop.price_from && prop.price_to
                  ? `$${(prop.price_from/1000000).toFixed(1)}M - $${(prop.price_to/1000000).toFixed(1)}M`
                  : 'Consultar precio';
                respuestaBroadcast += `• *${prop.name}*: ${priceRange}\n`;
              }
              respuestaBroadcast += `\n¿Cuál te llama más la atención? O si prefieres, puedo agendar una visita para que los conozcas en persona 🏡`;
            } else {
              respuestaBroadcast += `Tenemos casas increíbles en privadas con seguridad y amenidades.\n\n`;
              respuestaBroadcast += `¿Te gustaría que te cuente más sobre algún desarrollo en particular, o prefieres agendar una visita? 🏡`;
            }

            await this.meta.sendWhatsAppMessage(cleanPhone, respuestaBroadcast);

            // Limpiar el marcador de broadcast para que no se vuelva a activar
            delete notes.last_broadcast;
            await this.supabase.client
              .from('leads')
              .update({ notes })
              .eq('id', lead.id);

            console.log(`📡 BROADCAST RESPONSE: Información enviada y marcador limpiado`);
            return; // No procesar más
          }
        }
      } catch (e) {
        console.error('⚠️ Error procesando respuesta a broadcast:', e);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VERIFICAR SI LEAD ESTÁ EN FLUJO DE CRÉDITO
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // IMPORTANTE: Saltar si el teléfono es de un vendedor/team_member
      const msgPhoneForCreditCheck = cleanPhone.replace(/\D/g, '').slice(-10);
      const esTeamMemberCredito = teamMembers.some((tm: any) => {
        if (!tm.phone) return false;
        return tm.phone.replace(/\D/g, '').slice(-10) === msgPhoneForCreditCheck;
      });

      if (esTeamMemberCredito) {
        console.log('⏭️ FLUJO CRÉDITO: Saltando - teléfono es de team_member');
      }

      try {
        const { CreditFlowService } = await import('../services/creditFlowService');
        const creditService = new CreditFlowService(this.supabase, this.env?.OPENAI_API_KEY);

        // DESACTIVADO (Sesión 29): El flujo de crédito autónomo está deshabilitado.
        // Razón: Vendemos CASAS, no créditos. El crédito es una herramienta para cerrar la venta.
        // Las preguntas de crédito ahora las maneja SARA/Claude con instrucciones de redirigir a VISITA.
        // Si el lead estaba en credit_flow, limpiar ese status para que vuelva al flujo normal.
        if (!esTeamMemberCredito && lead?.id) {
          const enFlujoCredito = await creditService.estaEnFlujoCredito(lead.id);
          if (enFlujoCredito) {
            console.log(`🏦 Lead ${lead.id} estaba en credit_flow - limpiando para flujo normal`);
            await this.supabase.client.from('leads').update({ status: 'contacted' }).eq('id', lead.id).eq('status', 'credit_flow');
          }
        }

        // DESACTIVADO: Ya no auto-iniciamos flujo de crédito
        // Claude decidirá qué hacer cuando mencionen crédito
        // Si Claude detecta que realmente quiere simulación, pondrá intent='solicitar_credito'
        // y el handler de solicitar_credito iniciará el flujo
        if (!esTeamMemberCredito && lead?.id && creditService.detectarIntencionCredito(trimmedBody)) {
          if (!enFlujoCredito) {
            // En vez de iniciar automáticamente, dejamos que Claude piense
            console.log(`🧠 Usuario menciona crédito - dejando que CLAUDE decida qué hacer`);
            // NO return - continúa a Claude para que piense
          }
        }
      } catch (creditErr) {
        console.error('⚠️ Error en flujo de crédito:', creditErr);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DETECTAR RESPUESTA A TEMPLATE (activar SARA)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Leer template_sent desde notes (JSONB)
      const templateNotes = typeof lead?.notes === 'object' ? (lead.notes || {}) : {};
      const templateSentFromNotes = templateNotes?.template_sent || null;
      console.log('🔍 DEBUG Lead:', lead?.name || 'NULL', '| template_sent:', templateSentFromNotes || 'N/A');

      if (templateSentFromNotes) {
        console.log('🔓 Cliente respondió a template:', lead.name, '- Mensaje:', body);
        const templateType = templateSentFromNotes;

        // NO limpiar template_sent para info_credito hasta que se agende la llamada
        if (templateType !== 'info_credito') {
          delete templateNotes.template_sent;
          delete templateNotes.template_sent_at;
          await this.supabase.client.from('leads').update({
            notes: templateNotes
          }).eq('id', lead.id);
        }

        // Marcar en las citas que el cliente respondió
        await this.supabase.client.from('appointments').update({
          client_responded: true,
          client_responded_at: new Date().toISOString()
        }).eq('lead_phone', cleanPhone).eq('confirmation_sent', true).is('client_responded', null);

        // ✅ FIX 08-ENE-2026: Si es respuesta a template de confirmación de cita
        if (templateType === 'appointment_confirmation') {
          const bodyLower = body.toLowerCase().trim();
          const esAfirmativo = /^(s[ií]|ok|okey|claro|perfecto|listo|de acuerdo|confirmo|confirmado|va|vale|genial|excelente|por supuesto|correcto)$/i.test(bodyLower) ||
                              bodyLower.includes('confirmo') || bodyLower.includes('ahí estaré') || bodyLower.includes('ahi estare');
          const esNegativo = /^(no|cancel|cambiar|reprogramar|otro día|otra hora)/i.test(bodyLower);

          if (esAfirmativo) {
            console.log('✅ Lead CONFIRMA cita con:', body);
            // Buscar la cita para dar detalles
            const { data: citaConfirmada } = await this.supabase.client
              .from('appointments')
              .select('*')
              .eq('lead_phone', cleanPhone)
              .eq('confirmation_sent', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            let msgConfirmacion = `¡Excelente ${lead.name?.split(' ')[0] || ''}! 🎉 Tu cita está confirmada.`;
            if (citaConfirmada) {
              const fechaCita = citaConfirmada.scheduled_date ? new Date(citaConfirmada.scheduled_date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }) : '';
              const horaCita = citaConfirmada.scheduled_time || '';
              msgConfirmacion += `\n\n📅 ${fechaCita} a las ${horaCita}`;
              if (citaConfirmada.development) {
                msgConfirmacion += `\n📍 ${citaConfirmada.development}`;
              }
            }
            msgConfirmacion += `\n\n¡Te esperamos! Si tienes cualquier duda, aquí estoy para ayudarte. 😊`;

            await this.twilio.sendWhatsAppMessage(from, msgConfirmacion);
            return; // No continuar a SARA
          } else if (esNegativo) {
            console.error('❌ Lead quiere cancelar/cambiar cita:', body);
            await this.twilio.sendWhatsAppMessage(from, `Entendido, sin problema. ¿Te gustaría reprogramar para otro día u hora? Estoy aquí para ayudarte. 😊`);
            return; // No continuar a SARA
          }
          // Si no es claro, continuar a SARA para que interprete
          console.log('🤔 Respuesta no clara a confirmación, pasando a SARA...');
        }

        // DESACTIVADO (Sesión 29): Respuestas a info_credito ahora pasan a SARA/Claude
        // Razón: No agendamos citas con asesor de crédito directamente. Primero la VISITA.
        if (templateType === 'info_credito') {
          console.log('🏦 Respuesta a info_credito - pasando a SARA para redirigir a VISITA');
          // Limpiar template_sent para que no siga interceptando
          delete templateNotes.template_sent;
          delete templateNotes.template_sent_at;
          templateNotes.needs_credit = true;
          await this.supabase.client.from('leads').update({ notes: templateNotes }).eq('id', lead.id);
          // NO return - continúa a SARA/Claude que redirigirá a agendar visita
        }

        // ✅ FIX: Si es respuesta a template de seguimiento o reactivación
        if (templateType === 'seguimiento_lead' || templateType === 'reactivacion_lead') {
          console.log(`📌 Lead respondió a ${templateType}, continuando conversación normal...`);
          // Continuar a SARA para manejar la conversación
        }

        console.log('📌 Continuando al procesamiento normal de SARA...');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DETECTAR REFERIDOS DE CLIENTES QUE YA COMPRARON
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lead?.status === 'sold') {
        const referidoResult = await this.detectarYCrearReferido(lead, body, cleanPhone, from);
        if (referidoResult) {
          return; // Ya se procesó el referido
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // IMPORTANTE: Verificar si el LEAD tiene una encuesta pendiente ANTES de routing
      // Esto evita que leads con teléfonos similares a team_members sean mal-ruteados
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const notasLead = typeof lead?.notes === 'object' && lead?.notes ? lead.notes : {};
      if (notasLead.pending_satisfaction_survey) {
        // TTL check: si tiene más de 48h, auto-limpiar y continuar al flujo normal
        const surveySetAt = notasLead.pending_satisfaction_survey.sent_at;
        if (surveySetAt) {
          const horasDesde = (Date.now() - new Date(surveySetAt).getTime()) / (1000 * 60 * 60);
          if (horasDesde > 48) {
            console.log(`📋 pending_satisfaction_survey expirada (${Math.round(horasDesde)}h) - limpiando`);
            delete notasLead.pending_satisfaction_survey;
            await this.supabase.client.from('leads').update({ notes: notasLead }).eq('id', lead.id);
            // Continuar al flujo normal (no return)
          }
        }

        // Solo procesar si aún existe el flag (no expiró) y parece respuesta a encuesta
        if (notasLead.pending_satisfaction_survey && isLikelySurveyResponse(trimmedBody.trim())) {
          const respuesta = trimmedBody.trim();
          const ratings: { [key: string]: { label: string; emoji: string } } = {
            '1': { label: 'Excelente', emoji: '🌟' },
            '2': { label: 'Buena', emoji: '👍' },
            '3': { label: 'Regular', emoji: '😐' },
            '4': { label: 'Mala', emoji: '😔' }
          };

          const rating = ratings[respuesta];
          if (rating) {
            console.log(`📋 Procesando respuesta a encuesta de satisfacción: ${respuesta}`);
            const nombreCliente = lead.name?.split(' ')[0] || 'amigo';
            const propiedad = notasLead.pending_satisfaction_survey.property || 'la propiedad';

            // Guardar la respuesta en surveys
            try {
              await this.supabase.client.from('surveys').insert({
                lead_id: lead.id,
                survey_type: 'satisfaction',
                rating: parseInt(respuesta),
                rating_label: rating.label,
                property: propiedad,
                created_at: new Date().toISOString()
              });
            } catch (err) {
              console.error('⚠️ Error guardando encuesta:', err);
            }

            // Limpiar pending_satisfaction_survey
            delete notasLead.pending_satisfaction_survey;
            await this.supabase.client
              .from('leads')
              .update({ notes: notasLead })
              .eq('id', lead.id);

            let respuestaCliente = '';
            if (respuesta === '1' || respuesta === '2') {
              respuestaCliente = `¡Gracias por tu feedback, ${nombreCliente}! ${rating.emoji}\n\n` +
                `Nos alegra que hayas tenido una experiencia *${rating.label.toLowerCase()}*.\n\n` +
                `Si tienes alguna pregunta sobre *${propiedad}*, ¡aquí estamos para ayudarte! 🏠`;
            } else {
              respuestaCliente = `Gracias por tu feedback, ${nombreCliente}. ${rating.emoji}\n\n` +
                `Lamentamos que tu experiencia no haya sido la mejor.\n` +
                `Tomaremos en cuenta tus comentarios para mejorar.\n\n` +
                `¿Hay algo específico que podamos hacer para ayudarte? 🙏`;
            }

            await this.meta.sendWhatsAppMessage(cleanPhone, respuestaCliente);
            console.log(`✅ Encuesta de satisfacción procesada para ${lead.name}`);
            return;
          }
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DETECTAR SI ES VENDEDOR/ASESOR
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const msgPhoneClean = cleanPhone.replace(/\D/g, '').slice(-10);
      console.log(`🔍 VENDEDOR CHECK: Buscando ${msgPhoneClean} en ${teamMembers.length} team_members`);

      const vendedor = teamMembers.find((tm: any) => {
        if (!tm.phone) return false;
        const tmPhone = tm.phone.replace(/\D/g, '').slice(-10);
        const match = tmPhone === msgPhoneClean;
        if (match) {
          console.log(`✅ MATCH ENCONTRADO: ${tm.name} (${tm.phone}) rol=${tm.role}`);
        }
        return match;
      });

      console.log(`🔍 VENDEDOR RESULT: ${vendedor ? vendedor.name + ' (' + vendedor.role + ')' : 'NO ENCONTRADO'}`);

      if (vendedor) {
        // ═══ ACTUALIZAR última interacción PRIMERO (antes de cualquier return) ═══
        // Guardamos en notes.last_sara_interaction para trackear la ventana de 24h de WhatsApp
        // ⚠️ FIX 25-ENE-2026: Obtener notas FRESCAS de BD (no del cache) para no borrar active_bridge
        try {
          const now = new Date().toISOString();
          // Obtener notas FRESCAS de la BD (el cache puede tener datos viejos sin active_bridge)
          const { data: freshVendedor } = await this.supabase.client
            .from('team_members')
            .select('notes')
            .eq('id', vendedor.id)
            .single();

          let vendedorNotes: any = {};
          if (freshVendedor?.notes) {
            if (typeof freshVendedor.notes === 'string') {
              try { vendedorNotes = JSON.parse(freshVendedor.notes); } catch { vendedorNotes = {}; }
            } else if (typeof freshVendedor.notes === 'object') {
              vendedorNotes = freshVendedor.notes;
            }
          }
          const updatedNotes = { ...vendedorNotes, last_sara_interaction: now };
          await this.supabase.client
            .from('team_members')
            .update({ notes: updatedNotes })
            .eq('id', vendedor.id);
          console.log(`✅ last_sara_interaction actualizado para ${vendedor.name}: ${now}`);
        } catch (e) {
          console.error('⚠️ Error actualizando last_sara_interaction:', e);
        }

        // ═══ VERIFICAR SI HAY NOTIFICACIÓN PENDIENTE ═══
        // ⚠️ FIX 25-ENE-2026: Obtener notas FRESCAS de BD (no del cache) para no borrar active_bridge
        try {
          const { data: freshVendedorNotif } = await this.supabase.client
            .from('team_members')
            .select('notes')
            .eq('id', vendedor.id)
            .single();

          let vendedorNotes: any = {};
          if (freshVendedorNotif?.notes) {
            if (typeof freshVendedorNotif.notes === 'string') {
              try { vendedorNotes = JSON.parse(freshVendedorNotif.notes); } catch { vendedorNotes = {}; }
            } else if (typeof freshVendedorNotif.notes === 'object') {
              vendedorNotes = freshVendedorNotif.notes;
            }
          }
          if (vendedorNotes?.pending_notification?.message) {
            console.log(`📬 Enviando notificación pendiente a ${vendedor.name}`);
            await this.meta.sendWhatsAppMessage(cleanPhone, vendedorNotes.pending_notification.message);

            // Limpiar la notificación pendiente
            const { pending_notification, ...restNotes } = vendedorNotes;
            await this.supabase.client
              .from('team_members')
              .update({ notes: restNotes })
              .eq('id', vendedor.id);
            console.log(`✅ Notificación pendiente enviada y limpiada`);
          }
        } catch (e) {
          console.error('⚠️ Error procesando notificación pendiente:', e);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PRIMERO: DETECTAR RESPUESTAS A APROBACIÓN DE FOLLOW-UPS
        // Respuestas simples: ok, si, no, o mensaje directo
        // O con número: 1 ok, 2 no, etc.
        // O: status [nombre] [actualización]
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const approvalService = new FollowupApprovalService(this.supabase);

        // Verificar si podría ser respuesta a aprobación
        // Ser más agresivo: cualquier mensaje corto o mensaje que parezca un follow-up
        const esRespuestaSimple = /^(ok|si|sí|no|va|dale|nel|nop|listo|sale|enviar|aprobar|cancelar|rechazar|\d+\s|editar\s)/i.test(trimmedBody);
        const esCodigo = trimmedBody.match(/^[A-Z0-9]{6}\s/i);
        const esMensajeLargo = trimmedBody.length > 10 && !trimmedBody.includes('?') && !trimmedBody.toLowerCase().startsWith('cita ');
        const puedeSerAprobacion = esRespuestaSimple || esCodigo || esMensajeLargo;

        if (puedeSerAprobacion) {
          console.log('📋 Posible respuesta a aprobación detectada');
          const approvalResult = await approvalService.procesarRespuestaVendedor(
            cleanPhone,
            trimmedBody,
            async (phone, message) => {
              try {
                // Enviar al cliente
                const phoneFormatted = phone.startsWith('52') ? phone : '52' + phone;
                await this.meta.sendWhatsAppMessage(phoneFormatted, message);
                return true;
              } catch (e) {
                console.error('❌ Error enviando a cliente:', e);
                return false;
              }
            },
            async (phone, message) => {
              try {
                // Enviar al vendedor
                await this.meta.sendWhatsAppMessage(phone, message);
                return true;
              } catch (e) {
                console.error('❌ Error enviando a vendedor:', e);
                return false;
              }
            }
          );

          if (approvalResult.handled) {
            console.log(`✅ Respuesta de aprobación procesada: ${approvalResult.action}`);
            return;
          }
        }

        // Verificar si es respuesta de status: "status [nombre] [actualización]"
        if (trimmedBody.toLowerCase().startsWith('status ')) {
          const statusResult = await approvalService.procesarRespuestaStatus(cleanPhone, trimmedBody);
          if (statusResult.handled) {
            await this.meta.sendWhatsAppMessage(cleanPhone,
              `✅ *Status actualizado para ${statusResult.leadName}*\n\n` +
              `Gracias por la actualización. El CRM ya tiene la info.`);
            return;
          }
        }

        // Detectar rol específico
        const rol = vendedor.role?.toLowerCase() || 'vendedor';

        // CEO / Admin / Director / Gerente
        if (rol.includes('ceo') || rol.includes('admin') || rol.includes('director') || rol.includes('gerente') || rol.includes('dueño') || rol.includes('owner')) {
          console.log('📌 MODO CEO/ADMIN detectado:', vendedor.name);
          await this.handleCEOMessage(from, body, vendedor, teamMembers);
          return;
        }
        
        if (rol.includes('asesor') || rol.includes('hipoteca') || rol.includes('credito')) {
          console.log('🏦 MODO ASESOR HIPOTECARIO detectado:', vendedor.name);
          await this.handleAsesorMessage(from, body, vendedor, teamMembers);
          return;
        }
        
        // Agencia / Marketing / Coordinador Marketing
        if (rol.includes('agencia') || rol.includes('marketing') || rol.includes('mkt')) {
          console.log('📌 MODO AGENCIA detectado:', vendedor.name);
          await this.handleAgenciaMessage(from, body, vendedor, teamMembers);
          return;
        }

        console.log('👨 MODO VENDEDOR detectado:', vendedor.name);
        await this.handleVendedorMessage(from, body, vendedor, teamMembers);
        return;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CHECK BRIDGE / CONTACTO / RESPUESTA PENDIENTE
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      let leadNotes: any = {};
      try {
        leadNotes = lead.notes ? (typeof lead.notes === 'string' ? JSON.parse(lead.notes) : lead.notes) : {};
      } catch (e) {
        console.error('⚠️ Error parseando notas del lead, continuando sin notas');
      }

      const msgLower = body.toLowerCase();

      // ╔════════════════════════════════════════════════════════════════════════╗
      // ║  CRÍTICO: ACTUALIZAR last_message_at + last_activity_at EN 1 QUERY     ║
      // ║  Esto es fundamental para detectar la ventana de 24h de WhatsApp       ║
      // ╚════════════════════════════════════════════════════════════════════════╝
      try {
        const ahora = new Date().toISOString();
        await this.supabase.client
          .from('leads')
          .update({ last_message_at: ahora, last_activity_at: ahora })
          .eq('id', lead.id);
        console.log(`✅ last_message_at + last_activity_at actualizado para lead ${lead.id}`);
      } catch (e) {
        console.error('⚠️ Error actualizando last_message_at:', e);
      }

      // ═══ PRIMERO: DETECTAR SI LEAD QUIERE CONTACTAR ASESOR/VENDEDOR ═══
      const quiereContacto = msgLower.includes('hablar con') ||
        msgLower.includes('contactar') ||
        msgLower.includes('comunicarme con') ||
        msgLower.includes('necesito hablar') ||
        msgLower.includes('quiero hablar') ||
        msgLower.includes('pasame con') ||
        msgLower.includes('conectame con') ||
        (msgLower.includes('asesor') && (msgLower.includes('donde') || msgLower.includes('quien') || msgLower.includes('como') || msgLower.includes('mi '))) ||
        (msgLower.includes('vendedor') && (msgLower.includes('donde') || msgLower.includes('quien') || msgLower.includes('como') || msgLower.includes('mi ')));

      if (quiereContacto && lead.assigned_to) {
        console.log('📞 Lead quiere contactar a su vendedor/asesor');

        // Buscar vendedor asignado
        const { data: vendedorAsignado } = await this.supabase.client
          .from('team_members')
          .select('id, name, phone, role')
          .eq('id', lead.assigned_to)
          .single();

        if (vendedorAsignado?.phone) {
          const vendedorPhone = vendedorAsignado.phone.replace(/\D/g, '');
          const vendedorNombre = vendedorAsignado.name || 'Tu asesor';
          const rol = vendedorAsignado.role?.includes('asesor') ? 'asesor' : 'vendedor';

          // Notificar al vendedor
          await this.meta.sendWhatsAppMessage(vendedorPhone,
            `📞 *${lead.name} quiere hablar contigo*\n\n` +
            `Mensaje: "${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"\n\n` +
            `💡 Responde con:\n` +
            `• *mensaje ${lead.name.split(' ')[0]}* - Enviar mensaje vía Sara\n` +
            `• *bridge ${lead.name.split(' ')[0]}* - Chat directo 10 min`
          );

          // Dar al lead los links para contactar directo
          await this.meta.sendWhatsAppMessage(cleanPhone,
            `👤 *${vendedorNombre}* es tu ${rol}.\n\n` +
            `📱 *WhatsApp:*\nwa.me/${vendedorPhone}\n\n` +
            `📞 *Llamar:*\ntel:+${vendedorPhone}\n\n` +
            `_También le avisé que quieres hablar._`
          );

          // Limpiar pending_response_to si existe (ya no aplica)
          if (leadNotes.pending_response_to) {
            delete leadNotes.pending_response_to;
            try {
              await this.supabase.client.from('leads').update({ notes: leadNotes }).eq('id', lead.id);
            } catch (e) {
              console.error('⚠️ Error limpiando pending_response_to:', e);
            }
          }

          console.log(`📞 Lead ${lead.name} recibió contacto de ${vendedorAsignado.name}`);
          return;
        }
      }

      // ═══ BRIDGE ACTIVO - Mensaje directo al vendedor/asesor ═══
      const activeBridge = leadNotes?.active_bridge_to_vendedor;
      if (activeBridge && activeBridge.expires_at && new Date(activeBridge.expires_at) > new Date()) {
        console.log('🔗 BRIDGE activo detectado, reenviando mensaje directo a:', activeBridge.vendedor_name);
        const msgDirecto = `💬 *${lead.name}:*\n${body}`;
        await this.meta.sendWhatsAppMessage(activeBridge.vendedor_phone, msgDirecto);

        // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA (cuenta para el vendedor) ═══
        if (activeBridge.vendedor_id) {
          try {
            await this.supabase.client.from('lead_activities').insert({
              lead_id: lead.id,
              team_member_id: activeBridge.vendedor_id,
              activity_type: 'whatsapp',
              notes: `Mensaje recibido de ${lead.name}: "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"`,
              created_at: new Date().toISOString()
            });
          } catch (e) {
            console.error('⚠️ Error registrando actividad bridge:', e);
          }
        }

        return;
      }

      // ═══ RESPUESTA PENDIENTE (Sara intermediaria) ═══
      const pendingResponse = leadNotes?.pending_response_to;
      if (pendingResponse && pendingResponse.expires_at && new Date(pendingResponse.expires_at) > new Date()) {
        console.log('📨 Lead respondiendo a mensaje intermediado de:', pendingResponse.team_member_name);
        const msgForTeamMember = `💬 *Respuesta de ${lead.name}:*\n\n"${body}"\n\n_Usa "mensaje ${lead.name.split(' ')[0]}" para responder._`;
        await this.meta.sendWhatsAppMessage(pendingResponse.team_member_phone, msgForTeamMember);

        // Confirmar al lead
        await this.meta.sendWhatsAppMessage(cleanPhone, `✅ Tu mensaje fue enviado a ${pendingResponse.team_member_name}.`);
        return;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PROCESAR MENSAJE DE LEAD (delegado a LeadMessageService)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const leadMessageService = new LeadMessageService(this.supabase);
      const leadMsgResult = await leadMessageService.processLeadMessage(lead, body, cleanPhone);

      // Ejecutar resultado del servicio
      if (leadMsgResult.action === 'handled') {
        // Handler especial para encuestas
        if (leadMsgResult.response === '__SURVEY__') {
          console.log('📋 Lead en encuesta, step:', lead.survey_step);
          await this.handleSurveyResponse(from, body, lead);
          return;
        }

        // Actualizar lead si es necesario
        if (leadMsgResult.updateLead) {
          await this.supabase.client.from('leads').update(leadMsgResult.updateLead).eq('id', lead.id);
        }

        // Enviar respuesta al lead (validar que no esté vacía)
        const responseText = leadMsgResult.response?.trim();
        if (responseText) {
          if (leadMsgResult.sendVia === 'meta') {
            await this.meta.sendWhatsAppMessage(cleanPhone, responseText);
          } else {
            await this.twilio.sendWhatsAppMessage(from, responseText);
          }
        } else if (leadMsgResult.response !== undefined) {
          console.warn(`⚠️ Respuesta IA vacía para lead ${lead.name} (${cleanPhone}), enviando fallback`);
          const fallback = `Hola${lead.name ? ' ' + lead.name.split(' ')[0] : ''}, estoy aquí para ayudarte. ¿En qué puedo asistirte?`;
          await this.meta.sendWhatsAppMessage(cleanPhone, fallback);
        }

        // Notificar al vendedor si es necesario
        if (leadMsgResult.notifyVendor) {
          await this.meta.sendWhatsAppMessage(leadMsgResult.notifyVendor.phone, leadMsgResult.notifyVendor.message);
        }

        // Borrar evento de Google Calendar si es necesario (cancelación)
        if (leadMsgResult.deleteCalendarEvent) {
          try {
            await this.calendar.deleteEvent(leadMsgResult.deleteCalendarEvent);
            console.log('🗑️ Evento de Calendar borrado:', leadMsgResult.deleteCalendarEvent);
          } catch (calErr) {
            console.error('⚠️ Error borrando evento de Calendar:', calErr);
          }
        }

        return;
      }

      // Si hay notificación de vendedor pendiente (ej: respuesta a broadcast), enviarla
      if (leadMsgResult.notifyVendor) {
        await this.meta.sendWhatsAppMessage(leadMsgResult.notifyVendor.phone, leadMsgResult.notifyVendor.message);
        console.log('📢 Notificación de broadcast enviada a vendedor');
      }

      // Si hay contexto de broadcast, pasarlo a la IA
      if (leadMsgResult.broadcastContext) {
        lead.broadcast_context = leadMsgResult.broadcastContext;
        console.log('📢 Contexto de broadcast pasado a IA:', leadMsgResult.broadcastContext.message?.substring(0, 50));
      }

      // Si hay recursos Retell pending, enviarlos ahora que el lead respondió
      if (leadMsgResult.sendRetellResources) {
        const res = leadMsgResult.sendRetellResources;
        console.log(`📞 Enviando recursos Retell para ${res.desarrollo}...`);

        try {
          // Video
          if (res.video_url) {
            await this.meta.sendWhatsAppMessage(
              cleanPhone,
              `🎬 Te comparto el video de ${res.desarrollo}:\n${res.video_url}`
            );
            await new Promise(resolve => setTimeout(resolve, 1500));
          }

          // Brochure
          if (res.brochure_url) {
            await this.meta.sendWhatsAppDocument(
              cleanPhone,
              res.brochure_url,
              `📄 Catálogo ${res.desarrollo}`
            );
            await new Promise(resolve => setTimeout(resolve, 1500));
          }

          // GPS
          if (res.gps_url) {
            await this.meta.sendWhatsAppMessage(
              cleanPhone,
              `📍 Ubicación de ${res.desarrollo}:\n${res.gps_url}`
            );
          }

          console.log(`✅ Recursos Retell enviados para ${res.desarrollo}`);
        } catch (retellErr) {
          console.error('⚠️ Error enviando recursos Retell:', retellErr);
        }
      }

      // Actualizar lead si hay datos pending (ej: limpiar recursos Retell)
      if (leadMsgResult.updateLead && leadMsgResult.action === 'continue_to_ai') {
        await this.supabase.client.from('leads').update(leadMsgResult.updateLead).eq('id', lead.id);
      }

      // Si llegamos aquí, continuar a análisis con IA (delegado a aiConversationService)
      const aiService = new AIConversationService(this.supabase, this.twilio, this.meta, this.calendar, this.claude, env);
      aiService.setHandler(this);
      const analysis = await aiService.analyzeWithAI(body, lead, properties);
      console.log('📌 §  AI Analysis:', JSON.stringify(analysis, null, 2));

      // Si la IA detectó nombre, actualizar en memoria Y en DB
      // CORRECCIÓN: También actualizar si el usuario CORRIGE su nombre explícitamente
      const nombreExtraido = analysis.extracted_data?.nombre;
      const msgLowerNombre = body.toLowerCase();
      const usuarioCorrigeNombre = msgLowerNombre.includes('me llamo') ||
                                    msgLowerNombre.includes('mi nombre es') ||
                                    msgLowerNombre.includes('soy ') ||
                                    msgLowerNombre.match(/^(soy|me llamo)\s+/i);
      const nombreActualEsPlaceholder = !lead.name ||
                                         lead.name === 'Sin nombre' ||
                                         lead.name === 'Cliente' ||
                                         lead.name.toLowerCase() === 'amigo';

      // Actualizar nombre si: (1) no tiene nombre válido, O (2) usuario corrige explícitamente
      if (nombreExtraido && (nombreActualEsPlaceholder || usuarioCorrigeNombre)) {
        const nombreAnterior = lead.name;
        lead.name = nombreExtraido;
        console.log('✅ Nombre actualizado en memoria:', lead.name, nombreAnterior ? `(antes: ${nombreAnterior})` : '');

        // GUARDAR EN DB TAMBIÉN
        await this.supabase.client
          .from('leads')
          .update({ name: lead.name })
          .eq('id', lead.id);
        console.log('✅ Nombre guardado en DB:', lead.name);

        // ═══════════════════════════════════════════════════════════════
        // SI TIENE needs_mortgage PERO NO TENÍA SOLICITUD → CREARLA AHORA
        // ═══════════════════════════════════════════════════════════════
        if (lead.needs_mortgage) {
          const { data: existeMortgage } = await this.supabase.client
            .from('mortgage_applications')
            .select('id')
            .eq('lead_id', lead.id)
            .limit(1);

          if (!existeMortgage || existeMortgage.length === 0) {
            console.log('📋 Ahora tenemos nombre - Creando mortgage_application pendiente...');
            await this.crearOActualizarMortgageApplication(lead, teamMembers, {
              desarrollo: lead.property_interest,
              banco: lead.banco_preferido,
              ingreso: lead.ingreso_mensual,
              enganche: lead.enganche_disponible,
              trigger: 'nombre_obtenido_postpuesto'
            });
          }
        }

        // Actualizar nombre en mortgage_applications existentes (si tienen "Sin nombre" o "amigo")
        await this.supabase.client
          .from('mortgage_applications')
          .update({ lead_name: lead.name })
          .eq('lead_id', lead.id)
          .or('lead_name.eq.Sin nombre,lead_name.ilike.amigo');
      }

      // Ejecutar (delegado a aiConversationService)
      await aiService.executeAIDecision(analysis, from, cleanPhone, lead, properties, teamMembers, body, env);

      // ═══════════════════════════════════════════════════════════════
      // 🎬 VIDEO VEO 3 DE BIENVENIDA - PRIMER CONTACTO
      // Disparar si: tiene nombre + desarrollo de interés + no ha recibido video aún
      // La función generarVideoBienvenidaSiAplica verifica si ya se envió video
      // ═══════════════════════════════════════════════════════════════
      const tieneNombreReal = lead.name &&
                              lead.name !== 'Sin nombre' &&
                              lead.name !== 'Cliente' &&
                              lead.name.toLowerCase() !== 'amigo';

      const desarrolloInteres = analysis.extracted_data?.desarrollo ||
                                lead.property_interest ||
                                '';

      // Generar video de bienvenida si tenemos nombre + desarrollo
      // La función ya verifica internamente si ya se envió video antes
      if (tieneNombreReal && desarrolloInteres) {
        console.log(`🎬 Verificando video Veo 3 para ${lead.name} - ${desarrolloInteres}`);
        await this.generarVideoBienvenidaSiAplica(from, lead, desarrolloInteres, cleanPhone, properties, env);
      }

    } catch (error) {
      console.error('❌ Error:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje? 🙏');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MODO ASISTENTE VENDEDOR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ENCUESTA DE SATISFACCIÓN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  private async handleSurveyResponse(from: string, body: string, lead: any): Promise<void> {
    const surveyService = new SurveyService(this.supabase);
    const step = lead.survey_step;

    const result = surveyService.processStep(step, body, lead);
    if (!result) return;

    // Actualizar lead
    if (Object.keys(result.updates).length > 0) {
      await surveyService.updateLead(lead.id, result.updates);
    }

    // Si hay referido, crearlo y enviarle mensaje
    if (result.referido) {
      await surveyService.createReferido(
        { nombre: result.referido.nombre, telefono: result.referido.telefono },
        lead
      );
      await this.twilio.sendWhatsAppMessage(
        this.formatPhoneMX(result.referido.telefono),
        result.referido.mensajeReferido
      );
    }

    // Enviar mensaje al lead
    await this.twilio.sendWhatsAppMessage(from, result.mensaje);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HANDLER CEO / ADMIN / DIRECTOR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async handleCEOMessage(from: string, body: string, ceo: any, teamMembers: any[]): Promise<void> {
    return ceoHandlers.handleCEOMessage(this.ctx, this, from, body, ceo, teamMembers);
  }

  private async executeCEOHandler(from: string, body: string, ceo: any, nombreCEO: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
    return ceoHandlers.executeCEOHandler(this.ctx, this, from, body, ceo, nombreCEO, teamMembers, handlerName, params);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO MENSAJE A LEAD - Buscar lead y preparar bridge
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoMensajeLead(from: string, nombreLead: string, ceo: any, nombreCEO: string): Promise<void> {
    return ceoHandlers.ceoMensajeLead(this.ctx, this, from, nombreLead, ceo, nombreCEO);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO BRIDGE - Activar chat directo con lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoBridgeLead(from: string, nombreLead: string, ceo: any, nombreCEO: string, mensajeInicial?: string): Promise<void> {
    return ceoHandlers.ceoBridgeLead(this.ctx, this, from, nombreLead, ceo, nombreCEO, mensajeInicial);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO BRIDGE DIRECTO - Activar bridge con lead ya seleccionado
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoBridgeLeadDirect(cleanPhone: string, lead: any, ceo: any, nombreCEO: string): Promise<void> {
    return ceoHandlers.ceoBridgeLeadDirect(this.ctx, this, cleanPhone, lead, ceo, nombreCEO);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO EXTENDER BRIDGE - Agregar 6 minutos más
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoExtenderBridge(from: string, ceo: any, nombreCEO: string): Promise<void> {
    return ceoHandlers.ceoExtenderBridge(this.ctx, this, from, ceo, nombreCEO);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO CERRAR BRIDGE - Terminar chat directo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoCerrarBridge(from: string, ceo: any, nombreCEO: string): Promise<void> {
    return ceoHandlers.ceoCerrarBridge(this.ctx, this, from, ceo, nombreCEO);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO MOVER LEAD - Mover lead en funnel (adelante/atrás)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoMoverLead(from: string, nombreLead: string, direccion: 'next' | 'prev', ceo: any): Promise<void> {
    return ceoHandlers.ceoMoverLead(this.ctx, this, from, nombreLead, direccion, ceo);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO QUIEN ES - Buscar información de un lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoQuienEs(from: string, nombreLead: string): Promise<void> {
    return ceoHandlers.ceoQuienEs(this.ctx, this, from, nombreLead);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO NUEVO LEAD - Crear lead con round-robin
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoNuevoLead(from: string, nombre: string, telefono: string, desarrollo: string | null, ceo: any): Promise<void> {
    return ceoHandlers.ceoNuevoLead(this.ctx, this, from, nombre, telefono, desarrollo, ceo);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO BROCHURE - Enviar brochure de desarrollo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoBrochure(from: string, desarrollo: string): Promise<void> {
    return ceoHandlers.ceoBrochure(this.ctx, this, from, desarrollo);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO UBICACION - Enviar ubicación de desarrollo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoUbicacion(from: string, desarrollo: string): Promise<void> {
    return ceoHandlers.ceoUbicacion(this.ctx, this, from, desarrollo);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO VIDEO - Enviar video de desarrollo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoVideo(from: string, desarrollo: string): Promise<void> {
    return ceoHandlers.ceoVideo(this.ctx, this, from, desarrollo);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO TRACKING OFERTAS - Ver métricas de ofertas por vendedor
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoTrackingOfertas(from: string, nombreCEO: string): Promise<void> {
    return ceoHandlers.ceoTrackingOfertas(this.ctx, this, from, nombreCEO);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO VER LEAD - Ver info y historial de un lead (por teléfono o nombre)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoVerLead(from: string, identificador: string): Promise<void> {
    return ceoHandlers.ceoVerLead(this.ctx, this, from, identificador);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HANDLER AGENCIA - Marketing Commands
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async handleAgenciaMessage(from: string, body: string, agencia: any, teamMembers: any[]): Promise<void> {
    return agenciaHandlers.handleAgenciaMessage(this.ctx, this, from, body, agencia, teamMembers);
  }

  private async executeAgenciaHandler(from: string, body: string, agencia: any, nombreAgencia: string, handlerName: string): Promise<void> {
    return agenciaHandlers.executeAgenciaHandler(this.ctx, this, from, body, agencia, nombreAgencia, handlerName);
  }

  // ═══════════════════════════════════════════════════════════════
  // EJECUTAR AGENCIA HANDLER FOR CEO (usa meta en vez de twilio)
  // ═══════════════════════════════════════════════════════════════
  private async executeAgenciaHandlerForCEO(from: string, body: string, ceo: any, nombreCEO: string, handlerName: string): Promise<void> {
    return agenciaHandlers.executeAgenciaHandlerForCEO(this.ctx, this, from, body, ceo, nombreCEO, handlerName);
  }

  // Helpers para CEO usando Meta en vez de Twilio
  private async agenciaCampanasForCEO(phone: string, nombre: string): Promise<void> {
    return agenciaHandlers.agenciaCampanasForCEO(this.ctx, phone, nombre);
  }

  private async agenciaMetricasForCEO(phone: string, nombre: string): Promise<void> {
    return agenciaHandlers.agenciaMetricasForCEO(this.ctx, phone, nombre);
  }

  private async agenciaLeadsForCEO(phone: string, nombre: string): Promise<void> {
    return agenciaHandlers.agenciaLeadsForCEO(this.ctx, phone, nombre);
  }

  private async verSegmentosForCEO(phone: string, nombre: string): Promise<void> {
    return agenciaHandlers.verSegmentosForCEO(this.ctx, phone, nombre);
  }

  private async iniciarBroadcastForCEO(phone: string, nombre: string): Promise<void> {
    return agenciaHandlers.iniciarBroadcastForCEO(this.ctx, phone, nombre);
  }

  private async enviarASegmentoForCEO(phone: string, body: string, usuario: any): Promise<void> {
    return agenciaHandlers.enviarASegmentoForCEO(this.ctx, phone, body, usuario);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DE CAMPAÑAS MASIVAS Y SEGMENTACIÓN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async verSegmentos(from: string, nombre: string): Promise<void> {
    return agenciaHandlers.verSegmentos(this.ctx, from, nombre);
  }

  private async iniciarBroadcast(from: string, nombre: string): Promise<void> {
    return agenciaHandlers.iniciarBroadcast(this.ctx, from, nombre);
  }

  private async enviarASegmento(from: string, body: string, usuario: any): Promise<void> {
    return agenciaHandlers.enviarASegmento(this.ctx, from, body, usuario);
  }

  private async previewSegmento(from: string, body: string): Promise<void> {
    return agenciaHandlers.previewSegmento(this.ctx, from, body);
  }

  private async verEventos(from: string, nombre: string): Promise<void> {
    return agenciaHandlers.verEventos(this.ctx, from, nombre);
  }

  private async crearEvento(from: string, body: string, usuario: any): Promise<void> {
    return agenciaHandlers.crearEvento(this.ctx, from, body, usuario);
  }

  // INVITAR A EVENTO - Envía invitaciones con filtros avanzados
  private async invitarEvento(from: string, body: string, usuario: any): Promise<void> {
    return agenciaHandlers.invitarEvento(this.ctx, from, body, usuario);
  }

  // VER REGISTRADOS EN UN EVENTO
  private async verRegistrados(from: string, body: string): Promise<void> {
    return agenciaHandlers.verRegistrados(this.ctx, from, body);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DE PROMOCIONES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async verPromociones(from: string, nombre: string): Promise<void> {
    return agenciaHandlers.verPromociones(this.ctx, from, nombre);
  }

  private async crearPromocion(from: string, body: string, usuario: any): Promise<void> {
    return agenciaHandlers.crearPromocion(this.ctx, from, body, usuario);
  }

  private async pausarPromocion(from: string, body: string): Promise<void> {
    return agenciaHandlers.pausarPromocion(this.ctx, from, body);
  }

  private async activarPromocion(from: string, body: string): Promise<void> {
    return agenciaHandlers.activarPromocion(this.ctx, from, body);
  }

  private async handleVendedorMessage(from: string, body: string, vendedor: any, teamMembers: any[]): Promise<void> {
    return vendorHandlers.handleVendedorMessage(this.ctx, this, from, body, vendedor, teamMembers);

  }

  /**
   * Ejecuta el resultado del procesamiento de mensaje de vendedor
   */
  private async executeVendorResult(
    from: string,
    result: import('../services/vendorCommandsService').VendorMessageResult,
    vendedor: any,
    nombreVendedor: string,
    teamMembers: any[]
  ): Promise<boolean> {
    return vendorHandlers.executeVendorResult(this.ctx, this, from, result, vendedor, nombreVendedor, teamMembers);

  }

  /**
   * Ejecuta sub-handlers específicos
   */
  private async executeSubHandler(
    from: string,
    result: import('../services/vendorCommandsService').VendorMessageResult,
    vendedor: any,
    nombreVendedor: string,
    teamMembers: any[]
  ): Promise<boolean> {
    return vendorHandlers.executeSubHandler(this.ctx, this, from, result, vendedor, nombreVendedor, teamMembers);

  }

  /**
   * Maneja confirmaciones pendientes (reagendar, citas)
   */
  private async handlePendingConfirmations(from: string, mensaje: string, vendedor: any, nombreVendedor: string): Promise<boolean> {
    return vendorHandlers.handlePendingConfirmations(this.ctx, this, from, mensaje, vendedor, nombreVendedor);

  }

  private async procesarRespuestaShowConfirmation(vendedorId: string, mensaje: string): Promise<any> {
    return vendorHandlers.procesarRespuestaShowConfirmation(this.ctx, this, vendedorId, mensaje);
  }

  /**
   * Envía encuesta de satisfacción al lead y guarda el estado pendiente
   */
  private async enviarEncuestaSatisfaccion(leadPhone: string, leadName?: string, property?: string): Promise<void> {
    return vendorHandlers.enviarEncuestaSatisfaccion(this.ctx, this, leadPhone, leadName, property);

  }

  /**
   * Busca un lead que tenga pending_noshow_response (esperando respuesta a mensaje de reagendar)
   */
  private async buscarLeadConNoShowPendiente(phone: string): Promise<any | null> {
    return vendorHandlers.buscarLeadConNoShowPendiente(this.ctx, this, phone);

  }

  /**
   * Procesa el resultado de confirmación de asistencia
   */
  private async processShowConfirmationResult(from: string, showResult: any, confirmacion: any): Promise<void> {
    return vendorHandlers.processShowConfirmationResult(this.ctx, this, from, showResult, confirmacion);

  }

  /**
   * Rutea comandos específicos de coordinador
   */
  private async routeCoordinadorCommand(
    from: string,
    body: string,
    mensaje: string,
    vendedor: any,
    nombreVendedor: string,
    teamMembers: any[]
  ): Promise<boolean> {
    return vendorHandlers.routeCoordinadorCommand(this.ctx, this, from, body, mensaje, vendedor, nombreVendedor, teamMembers);

  }

  /**
   * Rutea comandos de vendedor a los handlers apropiados
   */
  private async routeVendorCommand(
    from: string,
    body: string,
    mensaje: string,
    vendedor: any,
    nombreVendedor: string,
    teamMembers: any[]
  ): Promise<boolean> {
    return vendorHandlers.routeVendorCommand(this.ctx, this, from, body, mensaje, vendedor, nombreVendedor, teamMembers);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VENDEDOR CERRAR BRIDGE - Terminar chat directo y mensajes pendientes
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async vendedorCerrarBridge(from: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorCerrarBridge(this.ctx, this, from, vendedor, nombreVendedor);

  }

  /**
   * Guarda cumpleaños de cliente entregado
   */
  private async vendedorGuardarCumple(from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorGuardarCumple(this.ctx, this, from, match, vendedor);

  }

  /**
   * Guarda email de cliente entregado
   */
  private async vendedorGuardarEmail(from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorGuardarEmail(this.ctx, this, from, match, vendedor);

  }

  /**
   * Registra un referido por vendedor
   */
  private async vendedorRegistrarReferido(from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorRegistrarReferido(this.ctx, this, from, match, vendedor);

  }

  /**
   * Mueve lead en el funnel (siguiente/anterior/específico)
   */
  private async vendedorMoverEtapa(from: string, body: string, mensaje: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorMoverEtapa(this.ctx, this, from, body, mensaje, vendedor, nombreVendedor);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DEL ASISTENTE VENDEDOR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VER LEADS POR TIPO - compradores, caídos, inactivos, todos, archivados
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async verLeadsPorTipo(from: string, vendedor: any, tipo: string): Promise<void> {
    return vendorHandlers.verLeadsPorTipo(this.ctx, this, from, vendedor, tipo);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ARCHIVAR/DESARCHIVAR LEAD - Para spam, números erróneos, etc
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async archivarDesarchivarLead(from: string, nombreLead: string, vendedor: any, archivar: boolean): Promise<void> {
    return vendorHandlers.archivarDesarchivarLead(this.ctx, this, from, nombreLead, vendedor, archivar);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REACTIVAR LEAD - Cambiar de fallen a new
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async reactivarLead(from: string, nombreLead: string, vendedor: any): Promise<void> {
    return vendorHandlers.reactivarLead(this.ctx, this, from, nombreLead, vendedor);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ENVIAR MATERIAL DE VENTAS - Brochure, video, ubicación
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async vendedorEnviarMaterial(from: string, desarrollo: string, mensaje: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorEnviarMaterial(this.ctx, this, from, desarrollo, mensaje, vendedor);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MODO ASISTENTE ASESOR HIPOTECARIO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async handleAsesorMessage(from: string, body: string, asesor: any, teamMembers: any[]): Promise<void> {
    return asesorHandlers.handleAsesorMessage(this.ctx, this, from, body, asesor, teamMembers);
  }

  private async executeAsesorHandler(from: string, body: string, asesor: any, nombreAsesor: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
    return asesorHandlers.executeAsesorHandler(this.ctx, this, from, body, asesor, nombreAsesor, teamMembers, handlerName, params);
  }

  // ═══════════════════════════════════════════════════════════════
  // EJECUTAR VENDEDOR HANDLER (para CEO usando comandos de vendedor)
  // ═══════════════════════════════════════════════════════════════
  private async executeVendedorHandler(from: string, body: string, ceo: any, nombreCEO: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
    return asesorHandlers.executeVendedorHandler(this.ctx, this, from, body, ceo, nombreCEO, teamMembers, handlerName, params);
  }

  // ═══════════════════════════════════════════════════════════════
  // ASESOR CREAR LEAD HIPOTECA
  // Formato: "nuevo Juan Garcia 5512345678 para Edson" o "nuevo Juan Garcia 5512345678"
  // ═══════════════════════════════════════════════════════════════
  private async asesorCrearLeadHipoteca(from: string, body: string, asesor: any, nombre: string, teamMembers: any[]): Promise<void> {
    return asesorHandlers.asesorCrearLeadHipoteca(this.ctx, this, from, body, asesor, nombre, teamMembers);
  }

  private async asesorAyuda(from: string, nombre: string): Promise<void> {
    return asesorHandlers.asesorAyuda(this.ctx, this, from, nombre);
  }

  private async asesorAgendarCita(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    return asesorHandlers.asesorAgendarCita(this.ctx, this, from, body, asesor, nombre);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MOTIVO DE CAÍDA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorMotivoRespuesta(from: string, opcion: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorMotivoRespuesta(this.ctx, this, from, opcion, vendedor);

  }

  private async vendedorMotivoCustom(from: string, motivo: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorMotivoCustom(this.ctx, this, from, motivo, vendedor);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNNEL VENDEDOR - CAMBIO DE ETAPAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Función auxiliar para cambiar etapa por nombre
  private async vendedorCambiarEtapaConNombre(from: string, nombreLead: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
    return vendorHandlers.vendedorCambiarEtapaConNombre(this.ctx, this, from, nombreLead, vendedor, nuevaEtapa, etapaTexto);

  }

  private async vendedorCambiarEtapa(from: string, body: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
    return vendorHandlers.vendedorCambiarEtapa(this.ctx, this, from, body, vendedor, nuevaEtapa, etapaTexto);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HIPOTECA - ENVIAR A BANCO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorEnviarABanco(from: string, body: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorEnviarABanco(this.ctx, this, from, body, vendedor);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HIPOTECA - CONFIRMAR ENVÍO (ya tiene solicitud en otro banco)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorConfirmarEnvioABanco(from: string, body: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorConfirmarEnvioABanco(this.ctx, this, from, body, vendedor);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HIPOTECA - CONSULTAR ESTADO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorConsultarCredito(from: string, body: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorConsultarCredito(this.ctx, this, from, body, vendedor);

  }

  // ═══════════════════════════════════════════════════════════════
  // VENDEDOR: Asignar lead a asesor hipotecario
  // Comando: "asesor para Juan", "asesor para Juan 5512345678", "crédito para Pedro"
  // ═══════════════════════════════════════════════════════════════
  private async vendedorAsignarAsesor(from: string, nombreLead: string, vendedor: any, teamMembers: any[], telefonoLead?: string | null): Promise<void> {
    return vendorHandlers.vendedorAsignarAsesor(this.ctx, this, from, nombreLead, vendedor, teamMembers, telefonoLead);

  }

  // ═══════════════════════════════════════════════════════════════
  // VENDEDOR: Preguntar al asesor cómo va un lead (comunicación en vivo)
  // Comando: "preguntar asesor vanessa"
  // ═══════════════════════════════════════════════════════════════
  private async vendedorPreguntarAsesor(from: string, nombreLead: string, vendedor: any, teamMembers: any[]): Promise<void> {
    return vendorHandlers.vendedorPreguntarAsesor(this.ctx, this, from, nombreLead, vendedor, teamMembers);

  }

  // ═══════════════════════════════════════════════════════════════
  // LLAMAR [nombre] - Mostrar teléfono clickeable para marcar
  // ═══════════════════════════════════════════════════════════════
  private async mostrarTelefonoLead(from: string, nombreLead: string, usuario: any): Promise<void> {
    return vendorHandlers.mostrarTelefonoLead(this.ctx, this, from, nombreLead, usuario);

  }

  // ═══════════════════════════════════════════════════════════════
  // MENSAJE [nombre] - Enviar WhatsApp al lead (pregunta qué mensaje)
  // ═══════════════════════════════════════════════════════════════
  private async enviarMensajeLead(from: string, nombreLead: string, usuario: any): Promise<void> {
    return vendorHandlers.enviarMensajeLead(this.ctx, this, from, nombreLead, usuario);

  }

  // ═══════════════════════════════════════════════════════════════
  // Enviar mensaje pendiente al lead (cuando el usuario escribe el contenido)
  // Activa un "bridge" temporal de 10 minutos para chat directo
  // ═══════════════════════════════════════════════════════════════
  private async enviarMensajePendienteLead(from: string, mensaje: string, usuario: any, pendingData: any): Promise<void> {
    return vendorHandlers.enviarMensajePendienteLead(this.ctx, this, from, mensaje, usuario, pendingData);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DE ACTUALIZACIÓN DEL VENDEDOR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ═══════════════════════════════════════════════════════════════
  // APARTADO COMPLETO - Con enganche y fecha de pago
  // Formato: "apartar Juan en Distrito Falco 50000 para el 20 enero"
  // ═══════════════════════════════════════════════════════════════
  private async vendedorRegistrarApartado(from: string, body: string, vendedor: any, match: RegExpMatchArray): Promise<void> {
    return vendorHandlers.vendedorRegistrarApartado(this.ctx, this, from, body, vendedor, match);

  }

  private async vendedorCerrarVenta(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCerrarVenta(this.ctx, this, from, body, vendedor, nombre);

  }

  private async vendedorCancelarLead(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCancelarLead(this.ctx, this, from, body, vendedor, nombre);

  }

  // Versión con params ya parseados (para rutas desde vendorCommandsService)
  private async vendedorCancelarLeadConParams(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCancelarLeadConParams(this.ctx, this, from, nombreLead, vendedor, nombre);

  }

  private async vendedorAgendarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorAgendarCita(this.ctx, this, from, body, vendedor, nombre);

  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NOTAS POR LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAgregarNota(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorAgregarNota(this.ctx, this, from, body, vendedor, nombre);

  }

  private async vendedorVerNotas(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorVerNotas(this.ctx, this, from, body, vendedor, nombre);

  }

  // Versión con params ya parseados
  private async vendedorAgregarNotaConParams(from: string, nombreLead: string, textoNota: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorAgregarNotaConParams(this.ctx, this, from, nombreLead, textoNota, vendedor, nombre);

  }

  private async vendedorVerNotasConParams(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorVerNotasConParams(this.ctx, this, from, nombreLead, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FOLLOW-UP PENDIENTE: APROBAR / CANCELAR / EDITAR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAprobarFollowup(from: string, nombreLead: string | undefined, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorAprobarFollowup(this.ctx, this, from, nombreLead, vendedor, nombre);

  }

  private async vendedorCancelarFollowup(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCancelarFollowup(this.ctx, this, from, nombreLead, vendedor, nombre);

  }

  private async vendedorEditarFollowup(from: string, nombreLead: string, nuevoMensaje: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorEditarFollowup(this.ctx, this, from, nombreLead, nuevoMensaje, vendedor, nombre);

  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AYUDA CONTEXTUAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAyudaContextual(from: string, body: string, nombre: string): Promise<void> {
    return vendorHandlers.vendedorAyudaContextual(this.ctx, this, from, body, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CREAR LEAD NUEVO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorCrearLead(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCrearLead(this.ctx, this, from, body, vendedor, nombre);

  }

  // ═══════════════════════════════════════════════════════════════
  // VENDEDOR ASIGNAR HIPOTECA A LEAD EXISTENTE
  // Formato: "hipoteca Juan" - busca lead existente y le asigna asesor
  // ═══════════════════════════════════════════════════════════════
  private async vendedorAsignarHipoteca(from: string, body: string, vendedor: any, nombre: string, teamMembers: any[]): Promise<void> {
    return vendorHandlers.vendedorAsignarHipoteca(this.ctx, this, from, body, vendedor, nombre, teamMembers);

  }

  // Función auxiliar para asignar hipoteca a un lead (usa MortgageService)
  private async asignarHipotecaALead(from: string, lead: any, vendedor: any, teamMembers: any[]): Promise<void> {
    return vendorHandlers.asignarHipotecaALead(this.ctx, this, from, lead, vendedor, teamMembers);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AGENDAR CITA COMPLETA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAgendarCitaCompleta(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorAgendarCitaCompleta(this.ctx, this, from, body, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CANCELAR CITA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorCancelarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCancelarCita(this.ctx, this, from, body, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REAGENDAR CITA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorReagendarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorReagendarCita(this.ctx, this, from, body, vendedor, nombre);

  }

  // Enviar notificación de reagendado al lead
  private async enviarNotificacionReagendar(from: string, vendedor: any): Promise<void> {
    return vendorHandlers.enviarNotificacionReagendar(this.ctx, this, from, vendedor);

  }

  // Cancelar notificación de reagendado pendiente
  private async cancelarNotificacionReagendar(from: string, vendedor: any): Promise<void> {
    return vendorHandlers.cancelarNotificacionReagendar(this.ctx, this, from, vendedor);

  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IA HÍÍBRIDA - Clasificar intent cuando no matchea palabras
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorIntentIA(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorIntentIA(this.ctx, this, from, body, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESPUESTA INTELIGENTE CON CLAUDE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async vendedorRespuestaInteligente(from: string, mensaje: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorRespuestaInteligente(this.ctx, this, from, mensaje, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COACHING IA - Análisis y sugerencias por lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorCoaching(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCoaching(this.ctx, this, from, nombreLead, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VER HISTORIAL - Muestra conversación completa con un lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorVerHistorial(from: string, identificador: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorVerHistorial(this.ctx, this, from, identificador, vendedor);

  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CONFIRMACIÓN DE CITA AL LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async hayReagendarPendiente(vendedorId: string): Promise<boolean> {
    return vendorHandlers.hayReagendarPendiente(this.ctx, this, vendedorId);

  }

  private async hayConfirmacionPendiente(vendedorId: string): Promise<boolean> {
    return vendorHandlers.hayConfirmacionPendiente(this.ctx, this, vendedorId);

  }

  private async enviarConfirmacionAlLead(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.enviarConfirmacionAlLead(this.ctx, this, from, vendedor, nombre);

  }

  private async cancelarConfirmacionPendiente(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.cancelarConfirmacionPendiente(this.ctx, this, from, vendedor, nombre);

  }

  private async vendedorPropiedades(from: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorPropiedades(this.ctx, this, from, vendedor);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTODOS VENDEDOR - AYUDA, CITAS, BRIEFING, META, RESUMEN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAyuda(from: string, nombre: string): Promise<void> {
    return vendorHandlers.vendedorAyuda(this.ctx, this, from, nombre);

  }

  private async vendedorCitasHoy(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCitasHoy(this.ctx, this, from, vendedor, nombre);

  }

  private async vendedorCitasManana(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCitasManana(this.ctx, this, from, vendedor, nombre);

  }

  private async vendedorBriefing(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorBriefing(this.ctx, this, from, vendedor, nombre);

  }

  private async vendedorMetaAvance(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorMetaAvance(this.ctx, this, from, vendedor, nombre);

  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: QUIEN ES [nombre] - Buscar info de lead
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorQuienEs(from: string, nombreLead: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorQuienEs(this.ctx, this, from, nombreLead, vendedor);

  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: BROCHURE [desarrollo] - Enviar brochure de desarrollo
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorEnviarBrochure(from: string, desarrollo: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorEnviarBrochure(this.ctx, this, from, desarrollo, vendedor);

  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: UBICACION [desarrollo] - Enviar GPS del desarrollo
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorEnviarUbicacion(from: string, desarrollo: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorEnviarUbicacion(this.ctx, this, from, desarrollo, vendedor);

  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: VIDEO [desarrollo] - Enviar video del desarrollo
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorEnviarVideo(from: string, desarrollo: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorEnviarVideo(this.ctx, this, from, desarrollo, vendedor);

  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: PASAR LEAD A CREDITO/ASESOR HIPOTECARIO
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorPasarACredito(from: string, nombreLead: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorPasarACredito(this.ctx, this, from, nombreLead, vendedor);

  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: NUEVO LEAD (se queda con el vendedor, no round robin)
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorNuevoLead(from: string, nombre: string, telefono: string, desarrollo: string | null, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorNuevoLead(this.ctx, this, from, nombre, telefono, desarrollo, vendedor);

  }

  private async vendedorResumenLeads(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorResumenLeads(this.ctx, this, from, vendedor, nombre);

  }

  // HOT: Leads calientes
  private async vendedorLeadsHot(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorLeadsHot(this.ctx, this, from, vendedor, nombre);

  }

  // PENDIENTES: Leads sin seguimiento reciente
  private async vendedorLeadsPendientes(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorLeadsPendientes(this.ctx, this, from, vendedor, nombre);

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OFERTAS / COTIZACIONES - Handlers de vendedor
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Crear oferta rápida para un lead
   * Comando: cotizar [nombre] [precio]
   */
  private async vendedorCotizar(from: string, nombreLead: string, precio: number, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorCotizar(this.ctx, this, from, nombreLead, precio, vendedor, nombreVendedor);

  }

  /**
   * Ver ofertas activas del vendedor
   * Comando: ofertas / mis ofertas
   */
  private async vendedorMisOfertas(from: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorMisOfertas(this.ctx, this, from, vendedor, nombreVendedor);

  }

  /**
   * Ver detalle de oferta de un lead
   * Comando: oferta [nombre]
   */
  private async vendedorVerOferta(from: string, nombreLead: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorVerOferta(this.ctx, this, from, nombreLead, vendedor);

  }

  /**
   * Enviar oferta al cliente
   * Comando: enviar oferta [nombre]
   */
  private async vendedorEnviarOferta(from: string, nombreLead: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorEnviarOferta(this.ctx, this, from, nombreLead, vendedor, nombreVendedor);

  }

  /**
   * Marcar oferta como aceptada
   * Comando: oferta aceptada [nombre]
   */
  private async vendedorOfertaAceptada(from: string, nombreLead: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorOfertaAceptada(this.ctx, this, from, nombreLead, vendedor);

  }

  /**
   * Marcar oferta como rechazada
   * Comando: oferta rechazada [nombre] [razón]
   */
  private async vendedorOfertaRechazada(from: string, nombreLead: string, razon: string | null, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorOfertaRechazada(this.ctx, this, from, nombreLead, razon, vendedor);

  }

  // CONTACTAR: Iniciar contacto con un lead (template si fuera de 24h, bridge si dentro)
  private async vendedorContactarLead(from: string, nombreLead: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorContactarLead(this.ctx, this, from, nombreLead, vendedor, nombreVendedor);

  }

  private async vendedorBuscarPorTelefono(from: string, telefono: string, vendedor: any): Promise<void> {
    return vendorHandlers.vendedorBuscarPorTelefono(this.ctx, this, from, telefono, vendedor);

  }

  private async vendedorCrearRecordatorio(from: string, texto: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorCrearRecordatorio(this.ctx, this, from, texto, vendedor, nombre);

  }

  // MIS HOT: Leads calientes asignados
  private async vendedorMisHot(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorMisHot(this.ctx, this, from, vendedor, nombre);

  }

  // DISPONIBILIDAD: Huecos en agenda
  private async vendedorDisponibilidad(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorDisponibilidad(this.ctx, this, from, vendedor, nombre);

  }

  // ENVIAR INFO A LEAD: Manda info de desarrollo a un lead
  private async vendedorEnviarInfoALead(from: string, desarrollo: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorEnviarInfoALead(this.ctx, this, from, desarrollo, nombreLead, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VOICE AI - Funciones de llamadas
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorLlamar(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorLlamar(this.ctx, this, from, nombreLead, vendedor, nombre);

  }

  /**
   * Inicia una llamada telefónica con IA usando Retell.ai
   * Comando: "llamar ia [nombre]"
   */
  private async vendedorLlamarIA(from: string, nombreLead: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorLlamarIA(this.ctx, this, from, nombreLead, vendedor, nombreVendedor);

  }

  private async vendedorProgramarLlamada(from: string, nombreLead: string, cuando: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorProgramarLlamada(this.ctx, this, from, nombreLead, cuando, vendedor, nombre);

  }

  private async vendedorRecordarLlamar(from: string, nombreLead: string, fechaHora: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorRecordarLlamar(this.ctx, this, from, nombreLead, fechaHora, vendedor, nombreVendedor);

  }

  private async vendedorReagendarLlamada(from: string, nombreLead: string, nuevaFechaHora: string, vendedor: any, nombreVendedor: string): Promise<void> {
    return vendorHandlers.vendedorReagendarLlamada(this.ctx, this, from, nombreLead, nuevaFechaHora, vendedor, nombreVendedor);

  }

  private async vendedorLlamadasPendientes(from: string, vendedor: any, nombre: string): Promise<void> {
    return vendorHandlers.vendedorLlamadasPendientes(this.ctx, this, from, vendedor, nombre);

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UTILITY WRAPPERS (delegados a whatsapp-utils.ts)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async getOrCreateLead(phone: string, skipTeamCheck = false) { return utils.getOrCreateLead(this.ctx, phone, skipTeamCheck); }
  private async getVendedorMenosCarga() { return utils.getVendedorMenosCarga(this.ctx); }

  private async buscarVendedorPorNombre(nombreBuscado: string) { return utils.buscarVendedorPorNombre(this.ctx, nombreBuscado); }
  private getBrochureUrl(desarrollo: string, modelo?: string): string { return utils.getBrochureUrl(desarrollo, modelo); }

  private async getAllProperties(): Promise<any[]> { return utils.getAllProperties(this.ctx); }
  private findPropertyByDevelopment(properties: any[], desarrollo: string) { return utils.findPropertyByDevelopment(this.ctx, properties, desarrollo); }
  private findTeamMemberByRole(teamMembers: any[], role: string, banco?: string) { return utils.findTeamMemberByRole(teamMembers, role, banco); }
  private async getAllTeamMembers(): Promise<any[]> { return utils.getAllTeamMembers(this.ctx); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ANÁLISIS CON IA - DELEGADO A aiConversationService.ts
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Delegated to whatsapp-utils.ts
  private async generarVideoBienvenida(leadPhone: string, nombreCliente: string, desarrollo: string, photoUrl: string, env: any): Promise<string | null> { return utils.generarVideoBienvenida(this.ctx, leadPhone, nombreCliente, desarrollo, photoUrl, env); }
  private async crearCitaCompleta(from: string, cleanPhone: string, lead: any, desarrollo: string, fecha: string, hora: string, teamMembers: any[], analysis: any, properties: any[], env: any, isReschedule = false, fechaAnterior?: string, horaAnterior?: string): Promise<void> { return utils.crearCitaCompleta(this.ctx, from, cleanPhone, lead, desarrollo, fecha, hora, teamMembers, analysis, properties, env, isReschedule, fechaAnterior, horaAnterior); }
  private async generarVideoBienvenidaSiAplica(from: string, lead: any, desarrollo: string, cleanPhone: string, properties: any[], env: any): Promise<void> { return utils.generarVideoBienvenidaSiAplica(this.ctx, from, lead, desarrollo, cleanPhone, properties, env); }
  private async crearOActualizarMortgageApplication(lead: any, teamMembers: any[], datos: { desarrollo?: string; banco?: string; ingreso?: number; enganche?: number; modalidad?: string; trigger: string }): Promise<void> { return utils.crearOActualizarMortgageApplication(this.ctx, lead, teamMembers, datos); }
  private getMexicoNow(): Date { return utils.getMexicoNow(); }
  private parseFecha(fecha: string, hora: string): Date { return utils.parseFecha(fecha, hora); }
  private getNextDayOfWeek(dayOfWeek: number): Date { return utils.getNextDayOfWeek(dayOfWeek); }
  private parseFechaISO(fecha: string): string { return utils.parseFechaISO(fecha); }
  private parseHoraISO(hora: string): string { return utils.parseHoraISO(hora); }
  private parseReagendarParams(body: string) { return utils.parseReagendarParams(body); }
  private async actualizarLead(lead: any, analysis: any, originalMessage: string): Promise<void> { return utils.actualizarLead(this.ctx, lead, analysis, originalMessage); }
  private async registrarActividad(from: string, nombreLead: string, tipo: string, vendedor: any, monto?: number | null): Promise<void> { return utils.registrarActividad(this.ctx, from, nombreLead, tipo, vendedor, monto); }
  private async mostrarActividadesHoy(from: string, vendedor: any, useMeta = false): Promise<void> { return utils.mostrarActividadesHoy(this.ctx, from, vendedor, useMeta); }
  private async mostrarHistorialLead(from: string, nombreLead: string, vendedor: any): Promise<void> { return utils.mostrarHistorialLead(this.ctx, from, nombreLead, vendedor); }
  private async crearLeadDesdeWhatsApp(from: string, nombre: string, telefono: string, vendedor: any): Promise<void> { return utils.crearLeadDesdeWhatsApp(this.ctx, from, nombre, telefono, vendedor); }
  private async procesarRespuestaEncuesta(phone: string, mensaje: string): Promise<string | null> { return utils.procesarRespuestaEncuesta(this.ctx, phone, mensaje); }
  private async notificarResultadoEncuesta(encuesta: any, comentario: string): Promise<void> { return utils.notificarResultadoEncuesta(this.ctx, encuesta, comentario); }
  private async detectarYCrearReferido(clienteReferidor: any, mensaje: string, clientePhone: string, from: string): Promise<boolean> { return utils.detectarYCrearReferido(this.ctx, clienteReferidor, mensaje, clientePhone, from); }
  private async procesarPostVisitaVendedor(vendedorId: string, mensaje: string) { return utils.procesarPostVisitaVendedor(this.ctx, vendedorId, mensaje); }
  private async buscarYProcesarPostVisitaPorPhone(phone: string, mensaje: string, cachedTeamMembers?: any[]) { return utils.buscarYProcesarPostVisitaPorPhone(this.ctx, phone, mensaje, cachedTeamMembers); }
  private async ejecutarAccionPostVisita(result: any): Promise<void> { return utils.ejecutarAccionPostVisita(this.ctx, result); }
  private getLocationMapsLink(location: string): string | null { return utils.getLocationMapsLink(location); }
  async iniciarPostVisita(appointment: any, lead: any, vendedor: any): Promise<string | null> { return utils.iniciarPostVisita(this.ctx, appointment, lead, vendedor); }
}
