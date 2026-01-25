import { SupabaseService } from '../services/supabase';
import { ClaudeService } from '../services/claude';
import { TwilioService } from '../services/twilio';
import { parseReagendarParams as parseReagendarParamsUtil } from '../utils/vendedorParsers';
import { FollowupService } from '../services/followupService';
import { FollowupApprovalService } from '../services/followupApprovalService';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { scoringService, LeadStatus } from '../services/leadScoring';
import { resourceService } from '../services/resourceService';
import { CalendarService } from '../services/calendar';
import { ReportsService } from '../services/reportsService';
import { BridgeService } from '../services/bridgeService';
import { VendorCommandsService, VendorRouteResult, sanitizeNotes } from '../services/vendorCommandsService';
import { AppointmentSchedulingService } from '../services/appointmentSchedulingService';
import { MortgageService, CrearActualizarMortgageResult, MortgageData } from '../services/mortgageService';
import { AgenciaReportingService } from '../services/agenciaReportingService';
import { EventosService } from '../services/eventosService';
import { PromocionesService } from '../services/promocionesService';
import { EncuestasService } from '../services/encuestasService';
import { AsesorCommandsService, AsesorCommandResult } from '../services/asesorCommandsService';
import { IACoachingService } from '../services/iaCoachingService';
import { VentasService } from '../services/ventasService';
import { SurveyService } from '../services/surveyService';
import { LeadManagementService, DetectarReferidoResult, ActualizarLeadResult, RegistrarActividadResult } from '../services/leadManagementService';
import { AIConversationService } from '../services/aiConversationService';
import { AppointmentService, CrearCitaParams, CrearCitaResult } from '../services/appointmentService';
import { PropertyService } from '../services/propertyService';
// Nota: parseFechaEspanol y ParsedFecha se importan desde ./dateParser abajo
import { ConversationContextService } from '../services/conversationContextService';
import { CEOCommandsService } from '../services/ceoCommandsService';
import { AgenciaCommandsService } from '../services/agenciaCommandsService';
import { LeadMessageService, LeadMessageResult } from '../services/leadMessageService';
import { BroadcastQueueService } from '../services/broadcastQueueService';

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
  // Normaliza telefono mexicano a formato Twilio: +521XXXXXXXXXX
  private formatPhoneMX(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return 'whatsapp:+521' + digits;
    } else if (digits.length === 12 && digits.startsWith('52')) {
      return 'whatsapp:+521' + digits.slice(2);
    } else if (digits.length === 13 && digits.startsWith('521')) {
      return 'whatsapp:+' + digits;
    } else {
      return 'whatsapp:+521' + digits.slice(-10);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📅 PARSEO DE FECHAS EN ESPAÑOL (delegado a utils/dateParser)
  // ═══════════════════════════════════════════════════════════════════════════
  private parseFechaEspanol(texto: string): ParsedFecha | null {
    return parseFechaEspanol(texto);
  }

  // Detectar intención de agendar algo en un mensaje del chat
  private detectarIntencionCita(mensaje: string): { detectado: boolean; fecha?: string; hora?: string; tipo?: string; textoOriginal?: string } {
    const msgLower = mensaje.toLowerCase();

    // Patrones que indican acuerdo de fecha/hora
    const patronesAcuerdo = [
      /(?:nos\s+)?(?:vemos|marcamos|hablamos|llamamos|quedamos)\s+(?:el\s+)?(.+)/i,
      /(?:te\s+)?(?:marco|llamo|veo)\s+(?:el\s+)?(.+)/i,
      /(?:nos\s+)?(?:vemos|reunimos)\s+(?:el\s+)?(.+)/i,
      /(?:quedamos\s+)?(?:para\s+)?(?:el\s+)?(.+)\s+(?:a\s+las?\s+)?(\d)/i,
      /(?:el\s+)?(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|mañana|manana)\s+(?:a\s+las?\s+)?(\d+)/i,
      /(?:cita|visita|llamada)\s+(?:para\s+)?(?:el\s+)?(.+)/i
    ];

    for (const patron of patronesAcuerdo) {
      if (patron.test(msgLower)) {
        const parsed = this.parseFechaEspanol(mensaje);
        if (parsed) {
          return {
            detectado: true,
            fecha: parsed.fecha,
            hora: parsed.hora,
            tipo: parsed.tipo,
            textoOriginal: mensaje
          };
        }
      }
    }

    // También detectar si simplemente menciona día + hora
    const tienesDiaHora = /(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|mañana|manana|hoy)\s+(?:a\s+las?\s+)?(\d+)/i.test(msgLower);
    if (tienesDiaHora) {
      const parsed = this.parseFechaEspanol(mensaje);
      if (parsed) {
        return {
          detectado: true,
          fecha: parsed.fecha,
          hora: parsed.hora,
          tipo: parsed.tipo,
          textoOriginal: mensaje
        };
      }
    }

    return { detectado: false };
  }


  // Almacenar env para acceder a variables de entorno en todos los métodos
  private env: any = null;

  constructor(
    private supabase: SupabaseService,
    private claude: ClaudeService,
    private twilio: TwilioService,
    private calendar: any,
    private meta: MetaWhatsAppService
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 CONTEXTO INTELIGENTE - PUNTO ÚNICO DE DECISIÓN (delegado a ConversationContextService)
  // ═══════════════════════════════════════════════════════════════════════════

  private determinarContextoYAccion(datos: DatosConversacion): ContextoDecision {
    const contextService = new ConversationContextService();
    return contextService.determinarContextoYAccion(datos);
  }

  private extraerNombreSimple(mensaje: string): string | null {
    const contextService = new ConversationContextService();
    return contextService.extraerNombreSimple(mensaje);
  }

  private detectarBanco(mensaje: string): string | null {
    const contextService = new ConversationContextService();
    return contextService.detectarBanco(mensaje);
  }

  private detectarMonto(mensaje: string): number | null {
    const contextService = new ConversationContextService();
    return contextService.detectarMonto(mensaje);
  }

  private async finalizarFlujoCredito(lead: any, from: string, teamMembers: any[]): Promise<void> {
    console.log('🏦 Finalizando flujo de crédito...');

    try {
      const mortgageService = new MortgageService(this.supabase);
      const result = await mortgageService.finalizeCreditFlow(lead, teamMembers);

      if (!result.success || !result.asesor) {
        console.error('⚠️ No hay asesor disponible');
        return;
      }

      // Obtener lead fresco para la notificación
      const { data: leadActual } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('id', lead.id)
        .single();

      const leadData = leadActual || lead;

      // Notificar al asesor (solo si está activo)
      if (result.asesor.phone && result.asesor.is_active !== false) {
        const notif = `🔥 *LEAD COMPLETÓ FLUJO DE CRÉDITO*\n\n` +
          `👤 *${leadData.name || 'Sin nombre'}*\n` +
          `📱 ${leadData.phone}\n` +
          `🏠 ${leadData.property_interest || 'Por definir'}\n` +
          `🏦 ${leadData.banco_preferido || 'Por definir'}\n` +
          `💰 Ingreso: $${(leadData.ingreso_mensual || 0).toLocaleString('es-MX')}/mes\n` +
          `💵 Enganche: $${(leadData.enganche_disponible || 0).toLocaleString('es-MX')}\n\n` +
          `⏰ ¡Contactar pronto!`;

        await this.twilio.sendWhatsAppMessage(
          'whatsapp:+52' + result.asesor.phone.replace(/\D/g, '').slice(-10),
          notif
        );
        console.log('📤 Asesor notificado:', result.asesor.name);
      }

      // Enviar datos del asesor al cliente
      await this.twilio.sendWhatsAppMessage(from, mortgageService.formatAsesorInfo(result.asesor));
      console.log('✅ Datos del asesor enviados al cliente');

    } catch (e) {
      console.error('⚠️ Error finalizando flujo crédito:', e);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SCORING BASADO EN FUNNEL - Usa scoringService centralizado
  // ═══════════════════════════════════════════════════════════════════════════
  private async actualizarScoreInteligente(leadId: string, flujo: string | null | undefined, datos: any): Promise<void> {
    try {
      // Obtener lead completo
      const { data: leadActual } = await this.supabase.client
        .from('leads')
        .select('lead_score, score, status, name, property_interest, needs_mortgage, enganche_disponible, mortgage_data')
        .eq('id', leadId)
        .single();

      if (!leadActual) return;

      // Verificar si tiene cita activa
      const { data: citasActivas } = await this.supabase.client
        .from('appointments')
        .select('id')
        .eq('lead_id', leadId)
        .in('status', ['scheduled', 'confirmed', 'pending'])
        .limit(1);
      const tieneCita = citasActivas && citasActivas.length > 0;

      // Usar scoringService centralizado
      const resultado = scoringService.calculateFunnelScore(
        {
          status: leadActual.status,
          name: leadActual.name,
          property_interest: leadActual.property_interest,
          needs_mortgage: leadActual.needs_mortgage,
          enganche_disponible: datos?.enganche || leadActual.enganche_disponible,
          mortgage_data: { ingreso_mensual: datos?.ingreso || leadActual.mortgage_data?.ingreso_mensual }
        },
        tieneCita || flujo === 'cita',
        flujo === 'cita' ? 'confirmar_cita' : undefined
      );

      // Actualizar en base de datos
      const updateData: any = {
        lead_score: resultado.score,
        score: resultado.score,
        temperature: resultado.temperature,
        lead_category: resultado.temperature.toLowerCase()
      };

      if (resultado.statusChanged) {
        updateData.status = resultado.status;
        updateData.status_changed_at = new Date().toISOString();
      }

      await this.supabase.client
        .from('leads')
        .update(updateData)
        .eq('id', leadId);

      console.log(`📊 Score Funnel: ${resultado.status} → ${resultado.score} (${resultado.temperature})`);
      resultado.breakdown.details.forEach(d => console.log(`   ${d}`));
    } catch (e) {
      console.error('⚠️ Error actualizando score:', e);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROPIEDADES POR DESARROLLO (delegado a PropertyService)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private getPropsParaDesarrollos(desarrollos: string[], properties: any[]): any[] {
    const propertyService = new PropertyService(this.supabase);
    return propertyService.getPropsParaDesarrollos(desarrollos, properties);
  }

  private getPropsParaModelos(modelos: string[], properties: any[]): any[] {
    const propertyService = new PropertyService(this.supabase);
    return propertyService.getPropsParaModelos(modelos, properties);
  }

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

      // Obtener datos
      const [leadResult, properties, teamMembers] = await Promise.all([
        this.getOrCreateLead(cleanPhone),
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

      const lead = esTeamMember ? null : leadResult.lead;  // Si es team member, no tratar como lead
      const isNewLead = esTeamMember ? false : leadResult.isNew;

      if (isNewLead) {
        console.log('🆕 LEAD NUEVO detectado - se generará video de bienvenida cuando tenga nombre + desarrollo');
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
      // ACTUALIZAR ÚLTIMA ACTIVIDAD DEL LEAD
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lead?.id) {
        await this.supabase.client.from('leads')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', lead.id);
      }

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
          await this.meta.sendWhatsAppMessage('5212224558475',
            `🚫 *DNC DETECTADO*\n\n` +
            `📱 ${cleanPhone}\n` +
            `👤 ${lead.name || 'Sin nombre'}\n` +
            `💬 "${trimmedBody}"\n\n` +
            `Lead marcado como DO NOT CONTACT`,
            true // bypass rate limit para alertas
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
      // VERIFICAR SI ES RESPUESTA A ENCUESTA
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      try {
        const respuestaEncuesta = await this.procesarRespuestaEncuesta(cleanPhone, trimmedBody);
        if (respuestaEncuesta) {
          console.log(`📋 Respuesta de encuesta procesada para ${cleanPhone}`);
          await this.meta.sendWhatsAppMessage(cleanPhone, respuestaEncuesta);
          return; // No procesar más, ya respondimos a la encuesta
        }
      } catch (e) {
        console.error('⚠️ Error procesando respuesta de encuesta:', e);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VERIFICAR SI ES RESPUESTA DE VENDEDOR A POST-VISITA
      // (Busca por vendedor_phone en el contexto, no solo por team_member)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log(`📋 POST-VISITA CHECK: Buscando contexto para phone ${cleanPhone}`);
      try {
        const postVisitResult = await this.buscarYProcesarPostVisitaPorPhone(cleanPhone, trimmedBody);
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

        // Verificar si está en flujo de crédito activo (SOLO si NO es team_member)
        const enFlujoCredito = !esTeamMemberCredito && lead?.id ? await creditService.estaEnFlujoCredito(lead.id) : false;

        if (enFlujoCredito) {
          console.log(`🏦 Lead ${lead.id} en flujo de crédito - procesando respuesta`);
          const resultado = await creditService.procesarRespuesta(lead.id, trimmedBody);
          console.log(`🏦 Resultado:`, JSON.stringify(resultado, null, 2));

          // Si el flujo indica pasar a IA (pregunta no relacionada)
          if (resultado?.passToAI) {
            console.log(`🏦 Pregunta no relacionada con crédito - pasando a IA`);
            // NO hacer return, continuar al flujo normal de IA
          } else if (resultado && resultado.respuesta) {
            await this.meta.sendWhatsAppMessage(cleanPhone, resultado.respuesta);

            // Si hay acción de conectar asesor
            console.log(`🏦 Accion: ${resultado.accion}, Asesor: ${resultado.datos?.asesor?.name || 'NULL'}`);

            if (resultado.accion === 'conectar_asesor') {
              const asesor = resultado.datos?.asesor;

              if (asesor && resultado.context) {
                // Enviar mensaje al cliente con datos del asesor
                const msgCliente = creditService.generarMensajeAsesor(asesor, resultado.context);
                console.log(`🏦 Enviando datos asesor al lead: ${msgCliente.substring(0, 50)}...`);
                await this.meta.sendWhatsAppMessage(cleanPhone, msgCliente);

                // Notificar al asesor (solo si está activo)
                if (asesor.phone && asesor.is_active !== false) {
                  const msgAsesor = creditService.generarNotificacionAsesor(lead, resultado.context);
                  console.log(`🏦 Notificando asesor ${asesor.name} en ${asesor.phone}`);
                  await this.meta.sendWhatsAppMessage(asesor.phone, msgAsesor);
                  console.log(`📤 Asesor ${asesor.name} notificado exitosamente`);
                } else {
                  console.error(`⚠️ Asesor sin teléfono o inactivo (is_active=${asesor.is_active})`);
                }
              } else {
                console.error(`⚠️ No se encontró asesor o contexto - enviando mensaje genérico`);
                await this.meta.sendWhatsAppMessage(cleanPhone,
                  `Te contactaremos pronto con un asesor especializado.\n\n¡Gracias por tu interés! 🏠`);
              }
            }
            console.log(`🏦 Flujo crédito completado - return`);
            return;
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
      console.log('🔍 DEBUG Lead:', lead?.name || 'NULL', '| template_sent:', lead?.template_sent || 'N/A');

      if (lead?.template_sent) {
        console.log('🔓 Cliente respondió a template:', lead.name, '- Mensaje:', body);
        const templateType = lead.template_sent;

        // Limpiar template_sent para que no vuelva a detectar
        await this.supabase.client.from('leads').update({
          template_sent: null,
          template_sent_at: null
        }).eq('id', lead.id);

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
          const nombreCliente = lead.name?.split(' ')[0] || '';
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
      // ║  CRÍTICO: ACTUALIZAR last_message_at SIEMPRE QUE UN LEAD ESCRIBE       ║
      // ║  Esto es fundamental para detectar la ventana de 24h de WhatsApp       ║
      // ╚════════════════════════════════════════════════════════════════════════╝
      try {
        await this.supabase.client
          .from('leads')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', lead.id);
        console.log(`✅ last_message_at actualizado para lead ${lead.id}`);
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

        // Enviar respuesta al lead
        if (leadMsgResult.response) {
          if (leadMsgResult.sendVia === 'meta') {
            await this.meta.sendWhatsAppMessage(cleanPhone, leadMsgResult.response);
          } else {
            await this.twilio.sendWhatsAppMessage(from, leadMsgResult.response);
          }
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
    const mensaje = body.toLowerCase().trim();
    const nombreCEO = ceo.name?.split(' ')[0] || 'Jefe';
    console.log('CEO Command:', mensaje);

    // Obtener teléfono limpio para Meta WhatsApp
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

    // ═══════════════════════════════════════════════════════════
    // RESPUESTA A FELICITACIÓN DE CUMPLEAÑOS (CEOs también reciben)
    // ═══════════════════════════════════════════════════════════
    let notasCEO: any = {};
    if (ceo.notes) {
      if (typeof ceo.notes === 'string') {
        try { notasCEO = JSON.parse(ceo.notes); } catch { notasCEO = {}; }
      } else if (typeof ceo.notes === 'object') {
        notasCEO = ceo.notes;
      }
    }

    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║  CRÍTICO - NO MODIFICAR SIN CORRER TESTS: npm test                      ║
    // ║  Test file: src/tests/conversationLogic.test.ts                         ║
    // ║  Lógica: src/utils/conversationLogic.ts → shouldForwardToLead()         ║
    // ║                                                                         ║
    // ║  Bridge = Chat directo CEO/Vendedor ↔ Lead (6 min)                     ║
    // ║  - NO reenviar comandos (#cerrar, bridge X, etc)                        ║
    // ║  - SÍ reenviar mensajes normales                                        ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    // ═══════════════════════════════════════════════════════════
    // BRIDGE ACTIVO - Reenviar mensaje directo al lead
    // Esto debe ir PRIMERO antes de cualquier otro procesamiento
    // ═══════════════════════════════════════════════════════════
    const activeBridge = notasCEO?.active_bridge;
    if (activeBridge && activeBridge.expires_at && new Date(activeBridge.expires_at) > new Date()) {
      // Si es comando cerrar, procesarlo (solo con #)
      if (mensaje === '#cerrar' || mensaje === '#fin') {
        // Continuar al handler de cerrar más abajo
      } else {
        // Reenviar mensaje al lead CON formato (simétrico)
        console.log('🔗 BRIDGE CEO activo, reenviando mensaje a:', activeBridge.lead_name);

        const leadPhone = activeBridge.lead_phone;
        if (leadPhone) {
          // Enviar mensaje con formato igual que cuando el lead responde
          const msgFormateado = `💬 *${nombreCEO}:*\n${body}`;
          await this.meta.sendWhatsAppMessage(leadPhone, msgFormateado);

          // Actualizar last_activity (NO extender automáticamente)
          notasCEO.active_bridge.last_activity = new Date().toISOString();
          await this.supabase.client
            .from('team_members')
            .update({ notes: notasCEO })
            .eq('id', ceo.id);

          // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
          if (activeBridge.lead_id) {
            await this.supabase.client.from('lead_activities').insert({
              lead_id: activeBridge.lead_id,
              team_member_id: ceo.id,
              activity_type: 'whatsapp',
              notes: `Mensaje bridge a ${activeBridge.lead_name}: "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"`,
              created_at: new Date().toISOString()
            });
          }

          console.log(`✅ Mensaje bridge reenviado a ${activeBridge.lead_name}`);
        }
        return;
      }
    }

    const pendingBirthdayResponse = notasCEO?.pending_birthday_response;
    if (pendingBirthdayResponse && pendingBirthdayResponse.type === 'cumpleanos_equipo') {
      const sentAt = pendingBirthdayResponse.sent_at ? new Date(pendingBirthdayResponse.sent_at) : null;
      const horasTranscurridas = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60 * 60) : 999;

      if (horasTranscurridas <= 48) {
        console.log(`🎂 CEO ${nombreCEO} respondiendo a felicitación de cumpleaños`);

        const respuestaCumple = `¡Gracias ${nombreCEO}! 🎉\n\n` +
          `Nos alegra mucho tu respuesta. ¡Esperamos que la pases increíble en tu día especial!\n\n` +
          `Todo el equipo te manda un abrazo. 🤗`;

        await this.meta.sendWhatsAppMessage(cleanPhone, respuestaCumple);

        // Limpiar pending_birthday_response
        const { pending_birthday_response, ...notasSinPending } = notasCEO;
        await this.supabase.client.from('team_members').update({
          notes: {
            ...notasSinPending,
            birthday_response_received: {
              at: new Date().toISOString(),
              message: body.substring(0, 200)
            }
          }
        }).eq('id', ceo.id);

        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PRIMERO: Verificar pending_show_confirmation (pregunta ¿LLEGÓ?)
    // Los CEOs también pueden recibir estas preguntas si son vendedores
    // ═══════════════════════════════════════════════════════════
    const showConfirmResult = await this.procesarRespuestaShowConfirmation(ceo.id, mensaje);
    if (showConfirmResult.handled) {
      await this.meta.sendWhatsAppMessage(cleanPhone, showConfirmResult.mensajeVendedor!);

      // Si el lead SÍ llegó, enviar encuesta de satisfacción
      if (showConfirmResult.siLlego && showConfirmResult.leadPhone) {
        await this.enviarEncuestaSatisfaccion(showConfirmResult.leadPhone, showConfirmResult.leadName, showConfirmResult.property);
      }

      // Si NO llegó, ofrecer reagendar y guardar contexto para seguimiento
      console.log(`👻 NO-SHOW DEBUG: noLlego=${showConfirmResult.noLlego}, leadPhone=${showConfirmResult.leadPhone}, leadName=${showConfirmResult.leadName}`);
      if (showConfirmResult.noLlego && showConfirmResult.leadPhone) {
        const nombreCliente = showConfirmResult.leadName?.split(' ')[0] || 'Hola';
        console.log(`📅 Enviando mensaje de reagenda a ${showConfirmResult.leadPhone}...`);
        try {
          // Enviar mensaje al lead
          await this.meta.sendWhatsAppMessage(showConfirmResult.leadPhone,
            `Hola ${nombreCliente}, notamos que no pudiste asistir a tu cita. 😊\n\n` +
            `¿Te gustaría reagendar para otro día?\n` +
            `Escríbenos cuando gustes y con gusto te ayudamos.`
          );
          console.log(`✅ Mensaje de reagenda enviado exitosamente a ${showConfirmResult.leadName} (${showConfirmResult.leadPhone})`);

          // Guardar contexto en el lead para seguimiento de respuesta
          const phoneSuffix = showConfirmResult.leadPhone.replace(/\D/g, '').slice(-10);
          const { data: leadData } = await this.supabase.client
            .from('leads')
            .select('id, notes, assigned_to')
            .or(`phone.ilike.%${phoneSuffix},whatsapp_phone.ilike.%${phoneSuffix}`)
            .single();

          if (leadData) {
            const notasLead = typeof leadData.notes === 'object' ? leadData.notes : {};
            await this.supabase.client
              .from('leads')
              .update({
                status: 'no_show',
                notes: {
                  ...notasLead,
                  pending_noshow_response: {
                    vendedor_id: vendedor.id,
                    vendedor_name: nombreVendedor,
                    vendedor_phone: from,
                    property: showConfirmResult.property,
                    asked_at: new Date().toISOString()
                  }
                }
              })
              .eq('id', leadData.id);
            console.log(`📋 Contexto no-show guardado en lead ${leadData.id}`);
          }
        } catch (err) {
          console.error('❌ Error enviando mensaje reagenda:', err);
        }
      } else {
        console.error(`⚠️ NO se envió mensaje de reagenda: noLlego=${showConfirmResult.noLlego}, leadPhone=${showConfirmResult.leadPhone || 'NULL'}`);
      }

      return;
    }

    // ═══════════════════════════════════════════════════════════
    // SELECCIÓN DE LEAD PENDIENTE (cuando hay múltiples)
    // ═══════════════════════════════════════════════════════════
    const pendingSelection = notasCEO?.pending_lead_selection;
    if (pendingSelection && pendingSelection.leads) {
      const sentAt = pendingSelection.timestamp ? new Date(pendingSelection.timestamp) : null;
      const minutosTranscurridos = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60) : 999;

      if (minutosTranscurridos <= 10) {
        const num = parseInt(mensaje);
        if (!isNaN(num) && num >= 1 && num <= pendingSelection.leads.length) {
          const selectedLead = pendingSelection.leads[num - 1];
          const actionType = pendingSelection.action_type || 'mensaje'; // mensaje o bridge
          console.log(`✅ CEO seleccionó lead #${num}: ${selectedLead.name} para ${actionType}`);

          // Limpiar selección
          delete notasCEO.pending_lead_selection;

          if (actionType === 'bridge') {
            // ═══ ACTIVAR BRIDGE ═══
            await this.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);
            await this.ceoBridgeLeadDirect(cleanPhone, selectedLead, ceo, nombreCEO);
          } else {
            // ═══ MENSAJE INTERMEDIADO ═══
            const leadPhone = selectedLead.phone?.replace(/\D/g, '');
            notasCEO.pending_message_to_lead = {
              lead_id: selectedLead.id,
              lead_name: selectedLead.name,
              lead_phone: leadPhone?.startsWith('521') ? leadPhone : '521' + leadPhone?.slice(-10),
              timestamp: new Date().toISOString()
            };
            await this.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);

            await this.meta.sendWhatsAppMessage(cleanPhone,
              `💬 ¿Qué le quieres decir a *${selectedLead.name}*?\n\n_Escribe tu mensaje y se lo enviaré._`
            );
          }
          return;
        }
      } else {
        // Expirado, limpiar
        delete notasCEO.pending_lead_selection;
        await this.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // MENSAJE PENDIENTE A LEAD (Sara como intermediario)
    // ═══════════════════════════════════════════════════════════
    const pendingMsgToLead = notasCEO?.pending_message_to_lead;
    if (pendingMsgToLead && pendingMsgToLead.lead_phone) {
      const sentAt = pendingMsgToLead.timestamp ? new Date(pendingMsgToLead.timestamp) : null;
      const minutosTranscurridos = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60) : 999;

      // Solo válido por 30 minutos
      if (minutosTranscurridos <= 30) {
        console.log(`💬 CEO ${nombreCEO} enviando mensaje (intermediario) a ${pendingMsgToLead.lead_name}`);

        // Enviar mensaje al lead CON FORMATO DE INTERMEDIARIO
        const mensajeParaLead = `💬 *Mensaje de ${ceo.name}:*\n\n"${body}"\n\n_Puedes responder aquí y le haré llegar tu mensaje._`;
        await this.meta.sendWhatsAppMessage(pendingMsgToLead.lead_phone, mensajeParaLead);

        // Guardar contexto para que cuando el lead responda, se reenvíe al CEO
        const { data: leadData } = await this.supabase.client
          .from('leads')
          .select('notes')
          .eq('id', pendingMsgToLead.lead_id)
          .single();

        let leadNotes: any = {};
        if (leadData?.notes) {
          leadNotes = typeof leadData.notes === 'string' ? JSON.parse(leadData.notes) : leadData.notes;
        }
        leadNotes.pending_response_to = {
          team_member_id: ceo.id,
          team_member_name: ceo.name,
          team_member_phone: cleanPhone,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
        };
        await this.supabase.client.from('leads').update({ notes: leadNotes }).eq('id', pendingMsgToLead.lead_id);

        // Limpiar pending y confirmar al CEO
        delete notasCEO.pending_message_to_lead;
        await this.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);

        await this.meta.sendWhatsAppMessage(cleanPhone,
          `✅ *Mensaje enviado a ${pendingMsgToLead.lead_name}*\n\n` +
          `"${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"\n\n` +
          `_Cuando responda, te haré llegar su mensaje._`
        );

        return;
      } else {
        // Expirado, limpiar
        delete notasCEO.pending_message_to_lead;
        await this.supabase.client.from('team_members').update({ notes: notasCEO }).eq('id', ceo.id);
      }
    }

    const ceoService = new CEOCommandsService(this.supabase);
    const result = ceoService.detectCommand(mensaje, body, nombreCEO);
    console.log(`📤 CEO Action: ${result.action}, Phone: ${cleanPhone}`);

    switch (result.action) {
      case 'send_message':
        console.log('📤 CEO: Enviando mensaje directo');
        await this.meta.sendWhatsAppMessage(cleanPhone, result.message!);
        return;

      case 'call_handler':
        console.log('📤 CEO: Ejecutando handler:', result.handlerName);
        await this.executeCEOHandler(from, body, ceo, nombreCEO, teamMembers, result.handlerName!, result.handlerParams);
        return;

      case 'not_recognized':
        console.log('📤 CEO: Comando no reconocido');
        await this.meta.sendWhatsAppMessage(cleanPhone, result.message!);
        return;
    }
  }

  private async executeCEOHandler(from: string, body: string, ceo: any, nombreCEO: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
    const ceoService = new CEOCommandsService(this.supabase);
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

    // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
    const handlerResult = await ceoService.executeHandler(
      handlerName,
      nombreCEO,
      params || {}
    );

    // Si el servicio manejó el comando
    if (handlerResult.message) {
      console.log(`📤 CEO Handler ${handlerName}: Enviando respuesta`);
      await this.meta.sendWhatsAppMessage(cleanPhone, handlerResult.message);
      return;
    }

    // Error sin necesidad de handler externo
    if (handlerResult.error && !handlerResult.needsExternalHandler) {
      await this.meta.sendWhatsAppMessage(cleanPhone, handlerResult.error);
      return;
    }

    // ━━━ FALLBACK: Handlers que requieren lógica externa ━━━
    switch (handlerName) {
      // ━━━ CITAS ━━━
      case 'vendedorCancelarCita':
        await this.vendedorCancelarCita(from, body, ceo, nombreCEO);
        break;
      case 'vendedorReagendarCita':
        await this.vendedorReagendarCita(from, body, ceo, nombreCEO);
        break;
      case 'vendedorAgendarCitaCompleta':
        await this.vendedorAgendarCitaCompleta(from, body, ceo, nombreCEO);
        break;

      // ━━━ SEGMENTOS / BROADCAST ━━━
      case 'verSegmentos':
        await this.verSegmentos(from, nombreCEO);
        break;
      case 'iniciarBroadcast':
        await this.iniciarBroadcast(from, nombreCEO);
        break;
      case 'enviarASegmento':
        await this.enviarASegmento(from, body, ceo);
        break;
      case 'previewSegmento':
        await this.previewSegmento(from, body);
        break;

      // ━━━ EVENTOS ━━━
      case 'verEventos':
        await this.verEventos(from, nombreCEO);
        break;
      case 'crearEvento':
        await this.crearEvento(from, body, ceo);
        break;
      case 'invitarEvento':
        await this.invitarEvento(from, body, ceo);
        break;
      case 'verRegistrados':
        await this.verRegistrados(from, body);
        break;

      // ━━━ PROMOCIONES ━━━
      case 'verPromociones':
        await this.verPromociones(from, nombreCEO);
        break;
      case 'crearPromocion':
        await this.crearPromocion(from, body, ceo);
        break;
      case 'pausarPromocion':
        await this.pausarPromocion(from, body);
        break;
      case 'activarPromocion':
        await this.activarPromocion(from, body);
        break;

      // ━━━ MENSAJE A LEAD (Sara intermediario) ━━━
      case 'mensajeLead':
        await this.ceoMensajeLead(from, params?.nombreLead, ceo, nombreCEO);
        break;

      // ━━━ BRIDGE / CHAT DIRECTO ━━━
      case 'bridgeLead':
        await this.ceoBridgeLead(from, params?.nombreLead, ceo, nombreCEO, params?.mensajeInicial);
        break;

      // ━━━ NUEVO LEAD ━━━
      case 'ceoNuevoLead':
        await this.ceoNuevoLead(from, params?.nombre, params?.telefono, params?.desarrollo, ceo);
        break;

      // ━━━ EXTENDER BRIDGE ━━━
      case 'extenderBridge':
        await this.ceoExtenderBridge(from, ceo, nombreCEO);
        break;

      // ━━━ CERRAR BRIDGE ━━━
      case 'cerrarBridge':
        await this.ceoCerrarBridge(from, ceo, nombreCEO);
        break;

      // ━━━ VER ACTIVIDAD / BITÁCORA ━━━
      case 'verActividad':
        await this.mostrarActividadesHoy(from, ceo);
        break;

      // ━━━ MOVER LEAD EN FUNNEL ━━━
      case 'ceoMoverLead':
        await this.ceoMoverLead(from, params?.nombreLead, params?.direccion, ceo);
        break;

      // ━━━ QUIEN ES - BUSCAR LEAD ━━━
      case 'ceoQuienEs':
        await this.ceoQuienEs(from, params?.nombreLead);
        break;

      // ━━━ BROCHURE ━━━
      case 'ceoBrochure':
        await this.ceoBrochure(from, params?.desarrollo);
        break;

      // ━━━ UBICACION ━━━
      case 'ceoUbicacion':
        await this.ceoUbicacion(from, params?.desarrollo);
        break;

      // ━━━ VIDEO ━━━
      case 'ceoVideo':
        await this.ceoVideo(from, params?.desarrollo);
        break;

      default:
        console.log('Handler CEO no reconocido:', handlerName);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO MENSAJE A LEAD - Buscar lead y preparar bridge
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoMensajeLead(from: string, nombreLead: string, ceo: any, nombreCEO: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`💬 CEO ${nombreCEO} quiere enviar mensaje a: ${nombreLead}`);

    try {
      // Buscar lead por nombre
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      if (!leads || leads.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré ningún lead con nombre "${nombreLead}"`);
        return;
      }

      if (leads.length > 1) {
        // Guardar selección pendiente
        let notes: any = {};
        if (ceo.notes) {
          notes = typeof ceo.notes === 'string' ? JSON.parse(ceo.notes) : ceo.notes;
        }
        notes.pending_lead_selection = {
          leads: leads.map((l: any) => ({ id: l.id, name: l.name, phone: l.phone })),
          action: 'mensaje',
          timestamp: new Date().toISOString()
        };
        await this.supabase.client.from('team_members').update({ notes }).eq('id', ceo.id);

        let msg = `📋 Encontré ${leads.length} leads:\n\n`;
        leads.forEach((l: any, i: number) => {
          msg += `${i + 1}. *${l.name}* - ${l.phone?.slice(-10) || 'sin tel'}\n`;
        });
        msg += `\n💡 Responde con el número (1, 2, etc.)`;
        await this.meta.sendWhatsAppMessage(cleanPhone, msg);
        return;
      }

      const lead = leads[0];
      const leadPhone = lead.phone?.replace(/\D/g, '');

      if (!leadPhone) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ ${lead.name} no tiene teléfono registrado.`);
        return;
      }

      // Guardar pending para esperar el mensaje
      let notes: any = {};
      if (ceo.notes) {
        notes = typeof ceo.notes === 'string' ? JSON.parse(ceo.notes) : ceo.notes;
      }
      notes.pending_message_to_lead = {
        lead_id: lead.id,
        lead_name: lead.name,
        lead_phone: leadPhone.startsWith('521') ? leadPhone : '521' + leadPhone.slice(-10),
        timestamp: new Date().toISOString()
      };

      await this.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', ceo.id);

      await this.meta.sendWhatsAppMessage(cleanPhone,
        `💬 ¿Qué le quieres decir a *${lead.name}*?\n\n_Escribe tu mensaje y se lo enviaré._`
      );
      console.log(`💬 CEO esperando mensaje para ${lead.name}`);

    } catch (e) {
      console.error('❌ Error en ceoMensajeLead:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error. Intenta de nuevo.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO BRIDGE - Activar chat directo con lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoBridgeLead(from: string, nombreLead: string, ceo: any, nombreCEO: string, mensajeInicial?: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔗 CEO ${nombreCEO} quiere bridge con: ${nombreLead}`);

    try {
      // Buscar lead por nombre
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      if (!leads || leads.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré ningún lead con nombre "${nombreLead}"`);
        return;
      }

      if (leads.length > 1) {
        // Guardar selección pendiente para bridge
        const { data: ceoData } = await this.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', ceo.id)
          .single();

        const notes = ceoData?.notes ?
          (typeof ceoData.notes === 'string' ? JSON.parse(ceoData.notes) : ceoData.notes) : {};

        notes.pending_lead_selection = {
          leads: leads.map(l => ({ id: l.id, name: l.name, phone: l.phone })),
          action_type: 'bridge',
          timestamp: new Date().toISOString()
        };

        await this.supabase.client.from('team_members').update({ notes }).eq('id', ceo.id);

        let msg = `📋 Encontré ${leads.length} leads:\n\n`;
        leads.forEach((l: any, i: number) => {
          msg += `${i + 1}. *${l.name}* - ${l.phone?.slice(-10) || 'sin tel'}\n`;
        });
        msg += `\n💡 Responde con el *número* para activar bridge.`;
        await this.meta.sendWhatsAppMessage(cleanPhone, msg);
        return;
      }

      const lead = leads[0];
      const leadPhone = lead.phone?.replace(/\D/g, '');

      if (!leadPhone) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ ${lead.name} no tiene teléfono registrado.`);
        return;
      }

      const leadPhoneFormatted = leadPhone.startsWith('521') ? leadPhone : '521' + leadPhone.slice(-10);

      // Activar bridge usando el servicio
      const bridgeService = new BridgeService(this.supabase);
      const bridgeResult = await bridgeService.activarBridge(
        ceo.id,
        ceo.name,
        from,
        lead.id,
        lead.name,
        leadPhoneFormatted
      );

      if (!bridgeResult.success) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error activando bridge: ${bridgeResult.error}`);
        return;
      }

      // Notificar al lead
      await this.meta.sendWhatsAppMessage(leadPhoneFormatted,
        `🔗 *Chat directo activado*\n\n` +
        `*${ceo.name}* quiere hablar contigo directamente.\n\n` +
        `Los próximos mensajes irán directo a él por *6 minutos*.\n\n` +
        `_Escribe tu mensaje:_`
      );

      // Notificar al CEO y enviar mensaje inicial si existe
      if (mensajeInicial) {
        // Si hay mensaje inicial, enviarlo directamente al lead
        await this.meta.sendWhatsAppMessage(leadPhoneFormatted, mensajeInicial);

        await this.meta.sendWhatsAppMessage(cleanPhone,
          `🔗 *Bridge activado con ${lead.name}*\n\n` +
          `✅ Tu mensaje ya fue enviado.\n\n` +
          `El bridge estará activo por *6 minutos*.\n` +
          `_Puedes seguir escribiendo mensajes._`
        );
      } else {
        await this.meta.sendWhatsAppMessage(cleanPhone,
          `🔗 *Bridge activado con ${lead.name}*\n\n` +
          `Tus mensajes irán directo a ${lead.name} por *6 minutos*.\n\n` +
          `_Escribe tu mensaje:_`
        );
      }

      // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
      const { error: activityError } = await this.supabase.client.from('lead_activities').insert({
        lead_id: lead.id,
        team_member_id: ceo.id,
        activity_type: 'whatsapp',
        notes: mensajeInicial ? `Bridge iniciado con ${lead.name} (6 min) + mensaje inicial` : `Bridge iniciado con ${lead.name} (6 min)`,
        created_at: new Date().toISOString()
      });
      if (activityError) {
        console.error('❌ Error registrando actividad bridge_start:', activityError);
      } else {
        console.log('📝 Actividad bridge_start registrada para', ceo.name, 'lead:', lead.id);
      }

      console.log(`🔗 Bridge activado: ${ceo.name} ↔ ${lead.name}`);

    } catch (e) {
      console.error('❌ Error en ceoBridgeLead:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error. Intenta de nuevo.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO BRIDGE DIRECTO - Activar bridge con lead ya seleccionado
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoBridgeLeadDirect(cleanPhone: string, lead: any, ceo: any, nombreCEO: string): Promise<void> {
    try {
      const leadPhone = lead.phone?.replace(/\D/g, '');
      if (!leadPhone) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ ${lead.name} no tiene teléfono registrado.`);
        return;
      }

      const leadPhoneFormatted = leadPhone.startsWith('521') ? leadPhone : '521' + leadPhone.slice(-10);

      // Activar bridge usando el servicio
      const bridgeService = new BridgeService(this.supabase);
      const bridgeResult = await bridgeService.activarBridge(
        ceo.id,
        ceo.name,
        cleanPhone,
        lead.id,
        lead.name,
        leadPhoneFormatted
      );

      if (!bridgeResult.success) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error activando bridge: ${bridgeResult.error}`);
        return;
      }

      // Notificar al lead
      await this.meta.sendWhatsAppMessage(leadPhoneFormatted,
        `🔗 *Chat directo activado*\n\n` +
        `*${ceo.name}* quiere hablar contigo directamente.\n\n` +
        `Los próximos mensajes irán directo a él por *6 minutos*.\n\n` +
        `_Escribe tu mensaje:_`
      );

      // Notificar al CEO
      await this.meta.sendWhatsAppMessage(cleanPhone,
        `🔗 *Bridge activado con ${lead.name}*\n\n` +
        `Tus mensajes irán directo a ${lead.name} por *6 minutos*.\n\n` +
        `_Escribe tu mensaje:_`
      );

      // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
      console.log('📝 Intentando registrar actividad bridge_start para lead:', lead.id, 'team_member:', ceo.id);
      const { error: activityError2 } = await this.supabase.client.from('lead_activities').insert({
        lead_id: lead.id,
        team_member_id: ceo.id,
        activity_type: 'whatsapp',
        notes: `Bridge iniciado con ${lead.name} (6 min)`,
        created_at: new Date().toISOString()
      });
      if (activityError2) {
        console.error('❌ Error registrando actividad bridge_start:', JSON.stringify(activityError2));
      } else {
        console.log('✅ Actividad bridge_start registrada OK');
      }

      console.log(`🔗 Bridge activado (directo): ${ceo.name} ↔ ${lead.name}`);

    } catch (e) {
      console.error('❌ Error en ceoBridgeLeadDirect:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error activando bridge.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO EXTENDER BRIDGE - Agregar 6 minutos más
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoExtenderBridge(from: string, ceo: any, nombreCEO: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`⏰ CEO ${nombreCEO} quiere extender bridge`);

    try {
      const { data: ceoData } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', ceo.id)
        .single();

      let notes: any = {};
      try {
        notes = ceoData?.notes ?
          (typeof ceoData.notes === 'string' ? JSON.parse(ceoData.notes) : ceoData.notes) : {};
      } catch { notes = {}; }

      if (!notes.active_bridge) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No tienes un bridge activo para extender.`);
        return;
      }

      // Extender 6 minutos desde ahora
      const nuevoExpira = new Date(Date.now() + 6 * 60 * 1000).toISOString();
      notes.active_bridge.expires_at = nuevoExpira;
      notes.active_bridge.warning_sent = false; // Resetear warning

      await this.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', ceo.id);

      // También extender del lado del lead
      if (notes.active_bridge.lead_id) {
        const { data: leadData } = await this.supabase.client
          .from('leads')
          .select('notes')
          .eq('id', notes.active_bridge.lead_id)
          .single();

        if (leadData) {
          let leadNotes: any = {};
          try {
            leadNotes = leadData.notes ?
              (typeof leadData.notes === 'string' ? JSON.parse(leadData.notes) : leadData.notes) : {};
          } catch { leadNotes = {}; }

          if (leadNotes.active_bridge_to_vendedor) {
            leadNotes.active_bridge_to_vendedor.expires_at = nuevoExpira;
            await this.supabase.client
              .from('leads')
              .update({ notes: leadNotes })
              .eq('id', notes.active_bridge.lead_id);
          }
        }
      }

      const leadName = notes.active_bridge.lead_name || 'el lead';
      await this.meta.sendWhatsAppMessage(cleanPhone,
        `✅ *Bridge extendido 6 minutos más*\n\nContinúa tu conversación con ${leadName}.`
      );

      // Notificar al lead
      if (notes.active_bridge.lead_phone) {
        await this.meta.sendWhatsAppMessage(notes.active_bridge.lead_phone,
          `✅ *Chat directo extendido 6 min más*\n\nContinúa la conversación.`
        );
      }

      console.log(`✅ Bridge extendido: ${nombreCEO} ↔ ${leadName}`);

    } catch (e) {
      console.error('❌ Error extendiendo bridge:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error extendiendo bridge.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO CERRAR BRIDGE - Terminar chat directo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoCerrarBridge(from: string, ceo: any, nombreCEO: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔒 CEO ${nombreCEO} quiere cerrar conexiones`);

    try {
      // Obtener notas del CEO
      const { data: ceoData } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', ceo.id)
        .single();

      const notes = ceoData?.notes ?
        (typeof ceoData.notes === 'string' ? JSON.parse(ceoData.notes) : ceoData.notes) : {};

      let cerradoAlgo = false;
      let leadsAfectados: string[] = [];

      // ═══ 1. CERRAR BRIDGE ACTIVO ═══
      if (notes.active_bridge) {
        const bridgeInfo = notes.active_bridge;
        delete notes.active_bridge;

        // Limpiar bridge del lead
        const { data: leadData } = await this.supabase.client
          .from('leads')
          .select('id, name, notes')
          .eq('id', bridgeInfo.lead_id)
          .single();

        if (leadData) {
          const leadNotes = leadData.notes ?
            (typeof leadData.notes === 'string' ? JSON.parse(leadData.notes) : leadData.notes) : {};
          delete leadNotes.active_bridge_to_vendedor;
          await this.supabase.client
            .from('leads')
            .update({ notes: leadNotes })
            .eq('id', leadData.id);

          leadsAfectados.push(bridgeInfo.lead_name || 'lead');

          // Notificar al lead (mensaje simple, sin tecnicismos)
          const leadPhone = bridgeInfo.lead_phone?.replace(/\D/g, '');
          if (leadPhone) {
            await this.meta.sendWhatsAppMessage(leadPhone,
              `Listo, si necesitas algo más aquí estoy para ayudarte. 🏠`
            );
          }
        }

        // ═══ REGISTRAR ACTIVIDAD EN BITÁCORA ═══
        if (bridgeInfo.lead_id) {
          await this.supabase.client.from('lead_activities').insert({
            lead_id: bridgeInfo.lead_id,
            team_member_id: ceo.id,
            activity_type: 'whatsapp',
            notes: `Bridge cerrado con ${bridgeInfo.lead_name}`,
            created_at: new Date().toISOString()
          });
        }

        cerradoAlgo = true;
        console.log(`🔒 Bridge cerrado: ${ceo.name} ↔ ${bridgeInfo.lead_name}`);
      }

      // ═══ 2. CERRAR MENSAJE PENDIENTE (pending_message_to_lead) ═══
      if (notes.pending_message_to_lead) {
        const pendingInfo = notes.pending_message_to_lead;
        delete notes.pending_message_to_lead;
        leadsAfectados.push(pendingInfo.lead_name || 'lead');
        cerradoAlgo = true;
        console.log(`🔒 Mensaje pendiente cancelado para: ${pendingInfo.lead_name}`);
      }

      // ═══ 3. LIMPIAR pending_response_to DE LEADS ═══
      // Buscar leads que tienen pending_response_to apuntando a este CEO
      const { data: leadsConPending } = await this.supabase.client
        .from('leads')
        .select('id, name, notes')
        .not('notes', 'is', null);

      for (const lead of leadsConPending || []) {
        let leadNotes: any = {};
        try {
          leadNotes = lead.notes ?
            (typeof lead.notes === 'string' ? JSON.parse(lead.notes) : lead.notes) : {};
        } catch (e) {
          console.error(`⚠️ Error parseando notas de ${lead.name}, saltando`);
          continue;
        }

        if (leadNotes.pending_response_to?.team_member_id === ceo.id) {
          delete leadNotes.pending_response_to;
          await this.supabase.client
            .from('leads')
            .update({ notes: leadNotes })
            .eq('id', lead.id);

          if (!leadsAfectados.includes(lead.name)) {
            leadsAfectados.push(lead.name);
          }
          cerradoAlgo = true;
          console.log(`🔒 pending_response_to limpiado de: ${lead.name}`);
        }
      }

      // Guardar notas actualizadas del CEO
      await this.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', ceo.id);

      // Confirmar al CEO
      if (cerradoAlgo) {
        await this.meta.sendWhatsAppMessage(cleanPhone,
          `✅ Listo, cerrado.\n\n` +
          `Para reconectar: *bridge ${leadsAfectados[0] || 'nombre'}*`
        );
      } else {
        await this.meta.sendWhatsAppMessage(cleanPhone,
          `ℹ️ No tienes conexiones activas.`
        );
      }

    } catch (e) {
      console.error('❌ Error en ceoCerrarBridge:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al cerrar conexiones.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO MOVER LEAD - Mover lead en funnel (adelante/atrás)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoMoverLead(from: string, nombreLead: string, direccion: 'next' | 'prev', ceo: any): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`📌 CEO mover lead: "${nombreLead}" ${direccion}`);

    // Normalizar texto (remover acentos para búsqueda tolerante)
    const normalizar = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreNormalizado = normalizar(nombreLead);
    console.log(`📌 Nombre normalizado: "${nombreNormalizado}"`);

    try {
      // CEO puede ver TODOS los leads - buscar con ilike primero
      let { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      console.log(`📌 Búsqueda ilike: ${leads?.length || 0} resultados`);

      // Si no encuentra, buscar todos y filtrar manualmente (más tolerante a acentos)
      if (!leads || leads.length === 0) {
        const { data: allLeads, error: allErr } = await this.supabase.client
          .from('leads')
          .select('*')
          .limit(100);

        console.log(`📌 Total leads en BD: ${allLeads?.length || 0}, error: ${allErr?.message || 'ninguno'}`);
        if (allLeads && allLeads.length > 0) {
          console.log(`📌 Primeros 5 leads: ${allLeads.slice(0, 5).map(l => l.name).join(', ')}`);
        }

        leads = allLeads?.filter(l => normalizar(l.name || '').includes(nombreNormalizado)) || [];
        console.log(`📌 Búsqueda manual: ${leads.length} resultados`);
      }

      const FUNNEL_STAGES = ['new', 'contacted', 'qualified', 'visit_scheduled', 'visited', 'negotiating', 'reserved', 'sold', 'delivered'];
      const stageLabels: Record<string, string> = {
        'new': '🆕 Nuevo',
        'contacted': '📞 Contactado',
        'qualified': '✅ Calificado',
        'visit_scheduled': '📅 Cita Agendada',
        'visited': '🏠 Visitado',
        'negotiating': '💰 Negociando',
        'reserved': '📝 Reservado',
        'sold': '✅ Vendido',
        'delivered': '🏠 Entregado'
      };

      if (!leads || leads.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré a "${nombreLead}"`);
        return;
      }

      if (leads.length > 1) {
        // Buscar match exacto o parcial más cercano
        const exactMatch = leads.find(l => normalizar(l.name || '') === nombreNormalizado);
        if (exactMatch) {
          leads = [exactMatch];
        } else {
          // Si todos tienen el mismo nombre (duplicados), usar el primero
          const nombresUnicos = new Set(leads.map(l => normalizar(l.name || '')));
          if (nombresUnicos.size === 1) {
            console.log(`📌 Duplicados detectados, usando el primero`);
            leads = [leads[0]];
          } else {
            const lista = leads.map((l, i) => `${i + 1}. ${l.name}`).join('\n');
            await this.meta.sendWhatsAppMessage(cleanPhone,
              `🔍 Encontré ${leads.length} leads:\n${lista}\n\n_Sé más específico._`
            );
            return;
          }
        }
      }

      const lead = leads[0] as any;
      console.log(`📌 Lead keys: ${Object.keys(lead).join(', ')}`);
      console.log(`📌 Lead status fields: funnel_status=${lead.funnel_status}, stage=${lead.stage}, status=${lead.status}`);
      const currentStatus = lead.funnel_status || lead.stage || lead.status || 'new';
      const currentIndex = FUNNEL_STAGES.indexOf(currentStatus);
      let newIndex = direccion === 'next' ? currentIndex + 1 : currentIndex - 1;

      if (newIndex < 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `⚠️ ${lead.name} ya está en la primera etapa (${stageLabels[currentStatus] || currentStatus})`);
        return;
      }
      if (newIndex >= FUNNEL_STAGES.length) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `⚠️ ${lead.name} ya está en la última etapa (${stageLabels[currentStatus] || currentStatus})`);
        return;
      }

      const newStage = FUNNEL_STAGES[newIndex];
      // Usar la columna que exista (funnel_status o status)
      const updateCol = lead.funnel_status !== undefined ? 'funnel_status' : (lead.stage !== undefined ? 'stage' : 'status');
      console.log(`📌 Actualizando columna: ${updateCol} = ${newStage}`);
      await this.supabase.client.from('leads').update({ [updateCol]: newStage }).eq('id', lead.id);

      await this.meta.sendWhatsAppMessage(cleanPhone,
        `✅ *${lead.name}* movido:\n${stageLabels[currentStatus] || currentStatus} → ${stageLabels[newStage] || newStage}`
      );

    } catch (e) {
      console.error('❌ Error en ceoMoverLead:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al mover lead.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO QUIEN ES - Buscar información de un lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoQuienEs(from: string, nombreLead: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔍 CEO busca: "${nombreLead}"`);

    const normalizar = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreNormalizado = normalizar(nombreLead);

    try {
      let { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, stage, status, created_at, notes, assigned_to')
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      // Búsqueda tolerante a acentos si no encuentra
      if (!leads || leads.length === 0) {
        const { data: allLeads } = await this.supabase.client
          .from('leads')
          .select('id, name, phone, stage, status, created_at, notes, assigned_to')
          .limit(100);
        leads = allLeads?.filter(l => normalizar(l.name || '').includes(nombreNormalizado)) || [];
      }

      if (!leads || leads.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré a "${nombreLead}"`);
        return;
      }

      if (leads.length === 1) {
        const l = leads[0];
        const { data: vendedor } = l.assigned_to ?
          await this.supabase.client.from('team_members').select('name').eq('id', l.assigned_to).single() : { data: null };

        const stageLabels: Record<string, string> = {
          'nuevo': '🆕 Nuevo', 'contactado': '📞 Contactado', 'interesado': '💡 Interesado',
          'cita_agendada': '📅 Cita Agendada', 'visitado': '🏠 Visitado', 'negociacion': '💰 Negociación',
          'apartado': '✍️ Apartado', 'escrituracion': '📝 Escrituración', 'ganado': '🎉 Ganado'
        };

        await this.meta.sendWhatsAppMessage(cleanPhone,
          `📋 *${l.name}*\n\n` +
          `📱 ${l.phone || 'Sin teléfono'}\n` +
          `📊 ${stageLabels[l.stage || 'nuevo'] || l.stage || 'Sin etapa'}\n` +
          `👤 ${vendedor?.name || 'Sin asignar'}\n` +
          `📅 Registrado: ${new Date(l.created_at).toLocaleDateString('es-MX')}`
        );
      } else {
        const lista = leads.map((l, i) => `${i + 1}. *${l.name}* - ${l.stage || 'nuevo'}`).join('\n');
        await this.meta.sendWhatsAppMessage(cleanPhone,
          `🔍 Encontré ${leads.length} leads:\n\n${lista}\n\n_Escribe "quien es [nombre completo]" para más detalles._`
        );
      }
    } catch (e) {
      console.error('❌ Error en ceoQuienEs:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al buscar lead.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO NUEVO LEAD - Crear lead con round-robin
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoNuevoLead(from: string, nombre: string, telefono: string, desarrollo: string | null, ceo: any): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`➕ CEO crea lead: ${nombre} ${telefono} ${desarrollo || ''}`);

    try {
      // Normalizar teléfono
      let phoneNormalized = telefono.replace(/\D/g, '');
      if (phoneNormalized.length === 10) {
        phoneNormalized = '521' + phoneNormalized;
      } else if (phoneNormalized.length === 12 && phoneNormalized.startsWith('52')) {
        phoneNormalized = '521' + phoneNormalized.slice(2);
      }

      // Verificar si ya existe
      const { data: existente } = await this.supabase.client
        .from('leads')
        .select('id, name, assigned_to')
        .eq('phone', phoneNormalized)
        .limit(1);

      if (existente && existente.length > 0) {
        const { data: vendedor } = existente[0].assigned_to ?
          await this.supabase.client.from('team_members').select('name').eq('id', existente[0].assigned_to).single() : { data: null };

        await this.meta.sendWhatsAppMessage(cleanPhone,
          `⚠️ Este teléfono ya existe:\n\n` +
          `👤 ${existente[0].name}\n` +
          `📱 ${phoneNormalized}\n` +
          `👨‍💼 Asignado a: ${vendedor?.name || 'Sin asignar'}`
        );
        return;
      }

      // Obtener vendedor por round-robin simple
      const { data: vendedores } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('active', true);

      // Buscar vendedor activo (priorizar role='vendedor')
      const vendedoresActivos = (vendedores || []).filter((v: any) => v.role === 'vendedor');
      const vendedor = vendedoresActivos.length > 0
        ? vendedoresActivos[Math.floor(Math.random() * vendedoresActivos.length)]
        : (vendedores || [])[0] || null;

      // Crear lead
      const { data: nuevoLead, error } = await this.supabase.client
        .from('leads')
        .insert({
          name: nombre,
          phone: phoneNormalized,
          property_interest: desarrollo || null,
          assigned_to: vendedor?.id || ceo.id,
          captured_by: ceo.id,
          created_by: ceo.id,
          source: 'ceo_directo',
          status: 'new',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al crear lead: ${error.message}`);
        return;
      }

      const asignadoA = vendedor?.name || 'Ti (sin vendedores disponibles)';

      await this.meta.sendWhatsAppMessage(cleanPhone,
        `✅ *Lead creado*\n\n` +
        `👤 ${nombre}\n` +
        `📱 ${phoneNormalized}\n` +
        (desarrollo ? `🏠 Interés: ${desarrollo}\n` : '') +
        `👨‍💼 Asignado a: ${asignadoA}`
      );

      // Notificar al vendedor si no es el CEO
      if (vendedor && vendedor.id !== ceo.id && vendedor.phone) {
        try {
          await this.twilio.sendWhatsAppMessage(`whatsapp:+${vendedor.phone}`,
            `🆕 *NUEVO LEAD ASIGNADO*\n\n` +
            `👤 ${nombre}\n` +
            `📱 ${phoneNormalized}\n` +
            (desarrollo ? `🏠 Interés: ${desarrollo}\n` : '') +
            `\n¡Contáctalo pronto!`
          );
        } catch (e) {
          console.error('⚠️ No se pudo notificar al vendedor');
        }
      }

    } catch (e) {
      console.error('❌ Error en ceoNuevoLead:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al crear lead.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO BROCHURE - Enviar brochure de desarrollo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoBrochure(from: string, desarrollo: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`📄 CEO pide brochure: "${desarrollo}"`);

    try {
      const { data: props } = await this.supabase.client
        .from('properties')
        .select('development, brochure_urls')
        .ilike('development', `%${desarrollo}%`)
        .not('brochure_urls', 'is', null)
        .limit(1);

      if (!props || props.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré brochure para "${desarrollo}"`);
        return;
      }

      const prop = props[0];
      let urls: string[] = [];
      if (typeof prop.brochure_urls === 'string') {
        urls = prop.brochure_urls.split(',').map(u => u.trim()).filter(u => u);
      } else if (Array.isArray(prop.brochure_urls)) {
        urls = prop.brochure_urls;
      }

      if (urls.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ ${prop.development} no tiene brochure configurado.`);
        return;
      }

      await this.meta.sendWhatsAppMessage(cleanPhone, `📄 *Brochure ${prop.development}*\n\n${urls[0]}`);
    } catch (e) {
      console.error('❌ Error en ceoBrochure:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al obtener brochure.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO UBICACION - Enviar ubicación de desarrollo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoUbicacion(from: string, desarrollo: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`📍 CEO pide ubicación: "${desarrollo}"`);

    try {
      // Buscar por desarrollo O por nombre del modelo
      let foundByName = false;
      let { data: props } = await this.supabase.client
        .from('properties')
        .select('name, development, gps_link, address')
        .ilike('development', `%${desarrollo}%`)
        .limit(1);

      // Si no encuentra por desarrollo, buscar por nombre del modelo
      if (!props || props.length === 0) {
        const { data: byName } = await this.supabase.client
          .from('properties')
          .select('name, development, gps_link, address')
          .ilike('name', `%${desarrollo}%`)
          .limit(1);
        props = byName;
        foundByName = true;
      }

      if (!props || props.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré ubicación para "${desarrollo}"`);
        return;
      }

      const prop = props[0];
      if (!prop.gps_link && !prop.address) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ ${prop.development} no tiene ubicación configurada.`);
        return;
      }

      // Solo mostrar nombre del modelo si buscaron por modelo
      const titulo = foundByName && prop.name && prop.name !== prop.development
        ? `${prop.name} (${prop.development})`
        : prop.development;
      let msg = `📍 *Ubicación ${titulo}*\n\n`;
      if (prop.address) msg += `${prop.address}\n\n`;
      if (prop.gps_link) msg += `${prop.gps_link}`;

      await this.meta.sendWhatsAppMessage(cleanPhone, msg);
    } catch (e) {
      console.error('❌ Error en ceoUbicacion:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al obtener ubicación.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO VIDEO - Enviar video de desarrollo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async ceoVideo(from: string, desarrollo: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🎬 CEO pide video: "${desarrollo}"`);

    try {
      // Buscar por desarrollo O por nombre del modelo
      let foundByName = false;
      let { data: props } = await this.supabase.client
        .from('properties')
        .select('name, development, video_url, youtube_link')
        .ilike('development', `%${desarrollo}%`)
        .limit(1);

      // Si no encuentra por desarrollo, buscar por nombre del modelo
      if (!props || props.length === 0) {
        const { data: byName } = await this.supabase.client
          .from('properties')
          .select('name, development, video_url, youtube_link')
          .ilike('name', `%${desarrollo}%`)
          .limit(1);
        props = byName;
        foundByName = true;
      }

      if (!props || props.length === 0) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ No encontré video para "${desarrollo}"`);
        return;
      }

      const prop = props[0];
      const videoUrl = prop.video_url || prop.youtube_link;

      if (!videoUrl) {
        await this.meta.sendWhatsAppMessage(cleanPhone, `❌ ${prop.development} no tiene video configurado.`);
        return;
      }

      // Solo mostrar nombre del modelo si buscaron por modelo
      const titulo = foundByName && prop.name && prop.name !== prop.development
        ? `${prop.name} (${prop.development})`
        : prop.development;
      await this.meta.sendWhatsAppMessage(cleanPhone, `🎬 *Video ${titulo}*\n\n${videoUrl}`);
    } catch (e) {
      console.error('❌ Error en ceoVideo:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al obtener video.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HANDLER AGENCIA - Marketing Commands
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async handleAgenciaMessage(from: string, body: string, agencia: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreAgencia = agencia.name?.split(' ')[0] || 'Marketing';
    console.log('Agencia Command:', mensaje);

    const agenciaService = new AgenciaCommandsService(this.supabase);
    const result = agenciaService.detectCommand(mensaje, body, nombreAgencia);

    switch (result.action) {
      case 'send_message':
        await this.twilio.sendWhatsAppMessage(from, result.message!);
        return;

      case 'call_handler':
        await this.executeAgenciaHandler(from, body, agencia, nombreAgencia, result.handlerName!);
        return;

      case 'not_recognized':
        await this.twilio.sendWhatsAppMessage(from, result.message!);
        return;
    }
  }

  private async executeAgenciaHandler(from: string, body: string, agencia: any, nombreAgencia: string, handlerName: string): Promise<void> {
    const agenciaService = new AgenciaCommandsService(this.supabase);

    // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
    const handlerResult = await agenciaService.executeHandler(handlerName, nombreAgencia);

    // Si el servicio manejó el comando
    if (handlerResult.message) {
      await this.twilio.sendWhatsAppMessage(from, handlerResult.message);
      return;
    }

    // Error sin necesidad de handler externo
    if (handlerResult.error && !handlerResult.needsExternalHandler) {
      await this.twilio.sendWhatsAppMessage(from, handlerResult.error);
      return;
    }

    // ━━━ FALLBACK: Handlers que requieren lógica externa ━━━
    switch (handlerName) {
      // ━━━ CITAS ━━━
      case 'vendedorCancelarCita':
        await this.vendedorCancelarCita(from, body, agencia, nombreAgencia);
        break;
      case 'vendedorReagendarCita':
        await this.vendedorReagendarCita(from, body, agencia, nombreAgencia);
        break;
      case 'vendedorAgendarCitaCompleta':
        await this.vendedorAgendarCitaCompleta(from, body, agencia, nombreAgencia);
        break;

      // ━━━ SEGMENTOS / BROADCAST ━━━
      case 'enviarASegmento':
        await this.enviarASegmento(from, body, agencia);
        break;
      case 'previewSegmento':
        await this.previewSegmento(from, body);
        break;

      // ━━━ EVENTOS ━━━
      case 'verEventos':
        await this.verEventos(from, nombreAgencia);
        break;
      case 'crearEvento':
        await this.crearEvento(from, body, agencia);
        break;
      case 'invitarEvento':
        await this.invitarEvento(from, body, agencia);
        break;
      case 'verRegistrados':
        await this.verRegistrados(from, body);
        break;

      // ━━━ PROMOCIONES ━━━
      case 'verPromociones':
        await this.verPromociones(from, nombreAgencia);
        break;
      case 'crearPromocion':
        await this.crearPromocion(from, body, agencia);
        break;

      default:
        console.log('Handler Agencia no reconocido:', handlerName);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DE CAMPAÑAS MASIVAS Y SEGMENTACIÓN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async verSegmentos(from: string, nombre: string): Promise<void> {
    try {
      const agenciaService = new AgenciaReportingService(this.supabase);
      const mensaje = await agenciaService.getMensajeSegmentos(nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.error('Error en verSegmentos:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener segmentos.');
    }
  }

  private async iniciarBroadcast(from: string, nombre: string): Promise<void> {
    const agenciaService = new AgenciaReportingService(this.supabase);
    const mensaje = agenciaService.getMensajeAyudaBroadcast(nombre);
    await this.twilio.sendWhatsAppMessage(from, mensaje);
  }

  private async enviarASegmento(from: string, body: string, usuario: any): Promise<void> {
    try {
      console.log('📤 BROADCAST: Iniciando enviarASegmento');

      const agenciaService = new AgenciaReportingService(this.supabase);
      const queueService = new BroadcastQueueService(this.supabase);

      // Parsear el comando
      const parsed = agenciaService.parseEnvioSegmento(body);

      // Si no hay mensaje, mostrar ayuda
      if (!parsed.mensajeTemplate) {
        await this.twilio.sendWhatsAppMessage(from, agenciaService.getMensajeFormatosEnvio());
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
        await this.twilio.sendWhatsAppMessage(from, resultado.error);
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
          await this.twilio.sendWhatsAppMessage(from,
            `📤 *Broadcast encolado*\n\n` +
            `Filtro: ${resultado.filtroDescripcion}\n` +
            `Total leads: ${totalLeads}\n\n` +
            `⏳ Se procesará automáticamente en lotes de ${MAX_IMMEDIATE}.\n` +
            `📬 Recibirás notificación cuando termine.\n\n` +
            `_Tiempo estimado: ~${Math.ceil(totalLeads / MAX_IMMEDIATE) * 2} minutos_`
          );
        } else {
          await this.twilio.sendWhatsAppMessage(from, `❌ Error al encolar: ${queueResult.error}`);
        }
        return;
      }

      // Si hay 15 o menos leads, enviar inmediatamente
      console.log(`📤 BROADCAST: ${totalLeads} leads <= ${MAX_IMMEDIATE}, enviando inmediatamente`);

      await this.twilio.sendWhatsAppMessage(from,
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
          await this.twilio.sendWhatsAppMessage(phone, mensaje);
        },
        async (phone, templateName, lang, components) => {
          return await this.meta.sendTemplate(phone, templateName, lang, components);
        }
      );

      await this.twilio.sendWhatsAppMessage(from,
        `✅ *Envío completado*\n\n` +
        `📊 Resultados:\n` +
        `• Enviados: ${enviados}\n` +
        `• Templates usados: ${templateUsados}\n` +
        `• Errores: ${errores}\n` +
        `• Total: ${totalLeads}`
      );

    } catch (e) {
      console.error('Error en enviarASegmento:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al enviar mensajes.');
    }
  }

  private async previewSegmento(from: string, body: string): Promise<void> {
    try {
      const match = body.match(/(?:preview|ver)\s+(\w+)/i);
      if (!match) {
        await this.twilio.sendWhatsAppMessage(from, 'Formato: *preview [segmento]*\nEjemplo: preview hot');
        return;
      }

      const segmento = match[1].toLowerCase();
      const agenciaService = new AgenciaReportingService(this.supabase);
      const { mensaje, error } = await agenciaService.previewSegmento(segmento);

      if (error) {
        await this.twilio.sendWhatsAppMessage(from, error);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.error('Error en previewSegmento:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener preview.');
    }
  }

  private async verEventos(from: string, nombre: string): Promise<void> {
    try {
      const eventosService = new EventosService(this.supabase);
      const eventos = await eventosService.getProximosEventos();
      const mensaje = eventosService.formatEventosLista(eventos, nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.error('Error en verEventos:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener eventos.');
    }
  }

  private async crearEvento(from: string, body: string, usuario: any): Promise<void> {
    try {
      const eventosService = new EventosService(this.supabase);
      const datos = eventosService.parseCrearEvento(body);

      if (!datos) {
        await this.twilio.sendWhatsAppMessage(from, eventosService.getMensajeAyudaCrearEvento());
        return;
      }

      const { evento, error } = await eventosService.crearEvento(datos, usuario.id);

      if (error || !evento) {
        await this.twilio.sendWhatsAppMessage(from, error || 'Error al crear evento.');
        return;
      }

      const mensaje = eventosService.formatEventoCreado(evento, datos.fechaEvento, datos.hora);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.error('Error en crearEvento:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al crear evento.');
    }
  }

  // INVITAR A EVENTO - Envía invitaciones con filtros avanzados
  private async invitarEvento(from: string, body: string, usuario: any): Promise<void> {
    try {
      const eventosService = new EventosService(this.supabase);

      // Extraer nombre del evento
      const nombreEvento = eventosService.parseNombreEventoDeComando(body);

      if (!nombreEvento) {
        const ayuda = await eventosService.getMensajeAyudaInvitar();
        await this.twilio.sendWhatsAppMessage(from, ayuda);
        return;
      }

      // Buscar el evento
      const evento = await eventosService.buscarEvento(nombreEvento);
      if (!evento) {
        await this.twilio.sendWhatsAppMessage(from, `No encontré el evento "${nombreEvento}".`);
        return;
      }

      // Parsear filtros y obtener leads
      const filtros = eventosService.parseFiltrosInvitacion(body);
      const { leads, error, filtroDescripcion } = await eventosService.getLeadsParaInvitacion(filtros);

      if (error) {
        await this.twilio.sendWhatsAppMessage(from, error);
        return;
      }

      if (leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `No hay leads con filtro: ${filtroDescripcion}`);
        return;
      }

      // Mensaje de inicio
      const mensajeEnviando = eventosService.formatMensajeEnviando(evento, filtroDescripcion, leads.length);
      await this.twilio.sendWhatsAppMessage(from, mensajeEnviando);

      // Ejecutar invitaciones
      const resultado = await eventosService.ejecutarInvitaciones(
        leads,
        evento,
        filtroDescripcion,
        async (phone, mensaje) => {
          await this.meta.sendWhatsAppMessage(phone, mensaje);
        },
        async (phone, templateName, lang, components) => {
          return await this.meta.sendTemplate(phone, templateName, lang, components);
        }
      );

      // Mensaje de resultado
      const mensajeResultado = eventosService.formatResultadoInvitaciones(resultado);
      await this.twilio.sendWhatsAppMessage(from, mensajeResultado);

    } catch (e) {
      console.error('Error en invitarEvento:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al enviar invitaciones.');
    }
  }

  // VER REGISTRADOS EN UN EVENTO
  private async verRegistrados(from: string, body: string): Promise<void> {
    try {
      const eventosService = new EventosService(this.supabase);
      const match = body.match(/registrados\s+(.+)/i);

      if (!match) {
        // Mostrar todos los eventos con sus registrados
        const eventos = await eventosService.getEventosConRegistrados();
        const mensaje = eventosService.formatListaEventosConRegistrados(eventos);
        await this.twilio.sendWhatsAppMessage(from, mensaje);
        return;
      }

      const nombreEvento = match[1].trim();
      const evento = await eventosService.buscarEventoPorNombre(nombreEvento);

      if (!evento) {
        await this.twilio.sendWhatsAppMessage(from, `No encontre el evento "${nombreEvento}".`);
        return;
      }

      const registros = await eventosService.getRegistrados(evento.id);
      const mensaje = eventosService.formatRegistrados(evento, registros);
      await this.twilio.sendWhatsAppMessage(from, mensaje);

    } catch (e) {
      console.error('Error en verRegistrados:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener registrados.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DE PROMOCIONES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async verPromociones(from: string, nombre: string): Promise<void> {
    try {
      const promosService = new PromocionesService(this.supabase);
      const promos = await promosService.getPromocionesActivas();
      const mensaje = promosService.formatPromocionesLista(promos, nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.error('Error en verPromociones:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener promociones.');
    }
  }

  private async crearPromocion(from: string, body: string, usuario: any): Promise<void> {
    try {
      const promosService = new PromocionesService(this.supabase);
      const datos = promosService.parseCrearPromocion(body);

      if (!datos) {
        await this.twilio.sendWhatsAppMessage(from, promosService.getMensajeAyudaCrearPromocion());
        return;
      }

      const { promo, error } = await promosService.crearPromocion(datos, usuario.id);

      if (error || !promo) {
        await this.twilio.sendWhatsAppMessage(from, error || 'Error al crear promoción.');
        return;
      }

      // Obtener leads del segmento para broadcast automático
      const agenciaService = new AgenciaReportingService(this.supabase);
      const queueService = new BroadcastQueueService(this.supabase);

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
      await this.twilio.sendWhatsAppMessage(from, mensaje);

    } catch (e) {
      console.error('Error en crearPromocion:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al crear promoción.');
    }
  }

  private async pausarPromocion(from: string, body: string): Promise<void> {
    try {
      const promosService = new PromocionesService(this.supabase);
      const nombrePromo = promosService.parseNombrePromocion(body, 'pausar');

      if (!nombrePromo) {
        await this.twilio.sendWhatsAppMessage(from, 'Formato: *pausar promo [nombre]*');
        return;
      }

      const { promo, error } = await promosService.pausarPromocion(nombrePromo);

      if (error || !promo) {
        await this.twilio.sendWhatsAppMessage(from, error || `No encontré promoción "${nombrePromo}".`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, promosService.formatPromoPausada(promo));
    } catch (e) {
      console.error('Error pausando promo:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al pausar promoción.');
    }
  }

  private async activarPromocion(from: string, body: string): Promise<void> {
    try {
      const promosService = new PromocionesService(this.supabase);
      const nombrePromo = promosService.parseNombrePromocion(body, 'activar');

      if (!nombrePromo) {
        await this.twilio.sendWhatsAppMessage(from, 'Formato: *activar promo [nombre]*');
        return;
      }

      const { promo, error } = await promosService.activarPromocion(nombrePromo);

      if (error || !promo) {
        await this.twilio.sendWhatsAppMessage(from, error || `No encontré promoción "${nombrePromo}".`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, promosService.formatPromoActivada(promo));
    } catch (e) {
      console.error('Error activando promo:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al activar promoción.');
    }
  }

  private async handleVendedorMessage(from: string, body: string, vendedor: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreVendedor = vendedor.name?.split(' ')[0] || 'crack';
    const vendorService = new VendorCommandsService(this.supabase);

    console.log('🔍 VENDEDOR HANDLER - mensaje:', mensaje);

    // ═══════════════════════════════════════════════════════════
    // 0. VERIFICAR SI HAY FLUJO POST-VISITA EN CURSO
    // ═══════════════════════════════════════════════════════════
    const postVisitResult = await this.procesarPostVisitaVendedor(vendedor.id, body);
    if (postVisitResult) {
      console.log('📋 POST-VISITA: Procesando respuesta de vendedor');
      await this.meta.sendWhatsAppMessage(from, postVisitResult.respuesta);

      // Ejecutar acciones adicionales si hay
      if (postVisitResult.accion) {
        await this.ejecutarAccionPostVisita(postVisitResult);
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 1. OBTENER NOTAS Y PROCESAR ESTADOS PENDIENTES
    // ═══════════════════════════════════════════════════════════
    const { notes, notasVendedor } = await vendorService.getVendedorNotes(vendedor.id);

    // ═══════════════════════════════════════════════════════════
    // SELECCIÓN DE TEMPLATE PENDIENTE (lead fuera de 24h)
    // ═══════════════════════════════════════════════════════════
    const pendingTemplateSelection = notasVendedor?.pending_template_selection;
    if (pendingTemplateSelection && /^[1-5]$/.test(mensaje.trim())) {
      const opcion = parseInt(mensaje.trim());
      const leadPhone = pendingTemplateSelection.lead_phone;
      const leadName = pendingTemplateSelection.lead_name?.split(' ')[0] || 'Hola';
      const leadFullName = pendingTemplateSelection.lead_name || 'Lead';
      const leadId = pendingTemplateSelection.lead_id;

      // Formatear teléfono para mostrar
      const telLimpio = leadPhone.replace(/\D/g, '').slice(-10);
      const telFormateado = `${telLimpio.slice(0,3)}-${telLimpio.slice(3,6)}-${telLimpio.slice(6)}`;

      // Opción 5: Cancelar
      if (opcion === 5) {
        delete notasVendedor.pending_template_selection;
        await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);
        await this.meta.sendWhatsAppMessage(from, `✅ Cancelado. No se envió nada a ${leadFullName}.`);
        return;
      }

      // Opción 4: Contacto directo (llamar/WhatsApp desde su cel)
      if (opcion === 4) {
        // Guardar estado para registrar interacción después
        notasVendedor.pending_direct_contact = {
          lead_id: leadId,
          lead_name: leadFullName,
          lead_phone: leadPhone,
          timestamp: new Date().toISOString()
        };
        delete notasVendedor.pending_template_selection;
        await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);

        await this.meta.sendWhatsAppMessage(from,
          `📞 *Contacto directo con ${leadFullName}*\n\n` +
          `📱 *Teléfono:* ${telFormateado}\n` +
          `📲 *WhatsApp:* wa.me/52${telLimpio}\n` +
          `📞 *Llamar:* tel:+52${telLimpio}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ *IMPORTANTE*: Después de contactarlo, registra qué pasó:\n\n` +
          `Escribe: *nota ${leadName} [lo que pasó]*\n\n` +
          `Ejemplo:\n` +
          `_nota ${leadName} hablé por tel, quiere visita el sábado_`
        );
        console.log(`📞 Vendedor ${vendedor.name} solicitó contacto directo con ${leadFullName}`);
        return;
      }

      // Opciones 1-3: Enviar template
      delete notasVendedor.pending_template_selection;
      await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);

      try {
        let templateName = '';
        let templateParams: any[] = [];

        switch (opcion) {
          case 1: // Reactivación
            templateName = 'reactivacion_lead';
            templateParams = [{ type: 'body', parameters: [{ type: 'text', text: leadName }] }];
            break;
          case 2: // Seguimiento
            templateName = 'seguimiento_lead';
            templateParams = [{ type: 'body', parameters: [{ type: 'text', text: leadName }] }];
            break;
          case 3: // Info crédito
            templateName = 'info_credito';
            templateParams = [{ type: 'body', parameters: [{ type: 'text', text: leadName }] }];
            break;
        }

        await this.meta.sendTemplate(leadPhone, templateName, 'es_MX', templateParams);

        await this.meta.sendWhatsAppMessage(from,
          `✅ *Template enviado a ${leadFullName}*\n\n` +
          `Cuando responda, podrás escribirle directamente.\n\n` +
          `💡 Usa *bridge ${leadName}* cuando responda.`
        );
        console.log(`📤 Template ${templateName} enviado a ${leadPhone}`);
      } catch (err) {
        console.error('Error enviando template seleccionado:', err);
        await this.meta.sendWhatsAppMessage(from,
          `❌ Error al enviar template. Intenta de nuevo o llama directamente:\n\n` +
          `📱 ${telFormateado}`
        );
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // MENSAJE PENDIENTE A LEAD (después de comando "ver")
    // ═══════════════════════════════════════════════════════════
    const pendingMsgToLead = notasVendedor?.pending_message_to_lead;
    if (pendingMsgToLead && pendingMsgToLead.lead_phone) {
      const sentAt = pendingMsgToLead.timestamp ? new Date(pendingMsgToLead.timestamp) : null;
      const minutosTranscurridos = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60) : 999;

      // Solo válido por 10 minutos
      if (minutosTranscurridos <= 10) {
        // Verificar ventana de 24h del lead
        const { data: leadData } = await this.supabase.client
          .from('leads')
          .select('last_message_at, name')
          .eq('id', pendingMsgToLead.lead_id)
          .single();

        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const dentroVentana24h = leadData?.last_message_at && leadData.last_message_at > hace24h;
        console.log(`📊 Verificación 24h: last_message_at=${leadData?.last_message_at}, hace24h=${hace24h}, dentroVentana=${dentroVentana24h}`);

        const leadPhone = pendingMsgToLead.lead_phone.startsWith('521')
          ? pendingMsgToLead.lead_phone
          : '521' + pendingMsgToLead.lead_phone.replace(/\D/g, '').slice(-10);

        // Si está fuera de la ventana de 24h, preguntar qué template enviar
        if (!dentroVentana24h) {
          console.error(`⚠️ Lead ${pendingMsgToLead.lead_name} fuera de ventana 24h, preguntando template`);

          // Guardar contexto para selección de template
          notasVendedor.pending_template_selection = {
            lead_id: pendingMsgToLead.lead_id,
            lead_name: pendingMsgToLead.lead_name,
            lead_phone: leadPhone,
            mensaje_original: body,
            timestamp: new Date().toISOString()
          };
          delete notasVendedor.pending_message_to_lead;
          await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);

          // Formatear teléfono para mostrar
          const telLimpio = leadPhone.replace(/\D/g, '').slice(-10);
          const telFormateado = `${telLimpio.slice(0,3)}-${telLimpio.slice(3,6)}-${telLimpio.slice(6)}`;

          await this.meta.sendWhatsAppMessage(from,
            `⚠️ *${pendingMsgToLead.lead_name} no ha escrito en 24h*\n\n` +
            `WhatsApp no permite mensajes directos.\n\n` +
            `*¿Qué quieres hacer?*\n\n` +
            `*1.* 📩 Template reactivación\n` +
            `*2.* 📩 Template seguimiento\n` +
            `*3.* 📩 Template info crédito\n` +
            `*4.* 📞 Contactar directo (te doy su cel)\n` +
            `*5.* ❌ Cancelar\n\n` +
            `_Responde con el número_`
          );
          return;
        }

        try {
          console.log(`📤 Enviando mensaje pendiente a: ${leadPhone} (dentro de 24h)`);
          await this.meta.sendWhatsAppMessage(leadPhone,
            `💬 *Mensaje de ${vendedor.name?.split(' ')[0] || 'tu asesor'}:*\n\n${body}`
          );

          // Limpiar pending y confirmar
          delete notasVendedor.pending_message_to_lead;
          await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);

          await this.meta.sendWhatsAppMessage(from,
            `✅ *Mensaje enviado a ${pendingMsgToLead.lead_name}*\n\n` +
            `"${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"\n\n` +
            `💡 Para hablar directo: *bridge ${pendingMsgToLead.lead_name?.split(' ')[0] || 'lead'}*`
          );
          console.log(`✅ Mensaje pendiente enviado exitosamente a ${leadPhone}`);
          return;
        } catch (err: any) {
          console.error('❌ Error enviando mensaje pendiente:', err);
          // Notificar al vendedor del error
          await this.meta.sendWhatsAppMessage(from,
            `❌ *Error al enviar mensaje a ${pendingMsgToLead.lead_name}*\n\n` +
            `El mensaje no pudo ser entregado. Intenta con *bridge ${pendingMsgToLead.lead_name?.split(' ')[0]}*`
          );
          // Limpiar pending
          delete notasVendedor.pending_message_to_lead;
          await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);
          return;
        }
      } else {
        // Expirado, limpiar
        delete notasVendedor.pending_message_to_lead;
        await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PRIMERO: Verificar pending_show_confirmation (pregunta ¿LLEGÓ?)
    // Esto debe procesarse ANTES del onboarding para no perder respuestas
    // ═══════════════════════════════════════════════════════════
    const showConfirmResult = await this.procesarRespuestaShowConfirmation(vendedor.id, mensaje);
    if (showConfirmResult.handled) {
      await this.meta.sendWhatsAppMessage(from, showConfirmResult.mensajeVendedor!);

      // Si el lead SÍ llegó, enviar encuesta de satisfacción
      if (showConfirmResult.siLlego && showConfirmResult.leadPhone) {
        await this.enviarEncuestaSatisfaccion(showConfirmResult.leadPhone, showConfirmResult.leadName, showConfirmResult.property);
      }

      // Si NO llegó, ofrecer reagendar
      if (showConfirmResult.noLlego && showConfirmResult.leadPhone) {
        const nombreCliente = showConfirmResult.leadName?.split(' ')[0] || 'Hola';
        try {
          await this.meta.sendWhatsAppMessage(showConfirmResult.leadPhone,
            `Hola ${nombreCliente}, notamos que no pudiste asistir a tu cita. 😊\n\n` +
            `¿Te gustaría reagendar para otro día?\n` +
            `Escríbenos cuando gustes y con gusto te ayudamos.`
          );
        } catch (err) {
          console.error('Error enviando mensaje reagenda:', err);
        }
      }

      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 🎓 ONBOARDING - Tutorial para vendedores nuevos
    // Solo mostrar si NO es un comando conocido y NO hay bridge/pending activo
    // ═══════════════════════════════════════════════════════════
    const esComandoConocido = /^(ver|bridge|citas?|leads?|hoy|ayuda|help|resumen|briefing|meta|brochure|ubicacion|video|coach|quien|info|hot|pendientes|credito|nuevo|reagendar|cancelar|agendar|#)/i.test(mensaje);
    const tieneBridgeActivo = notasVendedor?.active_bridge && notasVendedor.active_bridge.expires_at && new Date(notasVendedor.active_bridge.expires_at) > new Date();
    const tienePendingMessage = notasVendedor?.pending_message_to_lead;

    if (!notasVendedor?.onboarding_completed && !esComandoConocido && !tieneBridgeActivo && !tienePendingMessage) {
      console.log(`🎓 ONBOARDING: ${nombreVendedor} es nuevo, enviando tutorial`);

      // Mensaje de bienvenida y tutorial
      const mensajeOnboarding = `¡Hola ${nombreVendedor}! 👋\n\n` +
        `Soy *SARA*, tu asistente de ventas. Te ayudo a:\n\n` +
        `📱 *Comunicarte con leads*\n` +
        `→ Escribe *bridge Juan* para hablar directo\n\n` +
        `📅 *Agendar citas*\n` +
        `→ Escribe *cita María mañana 10am*\n\n` +
        `📊 *Ver tus pendientes*\n` +
        `→ Escribe *mis leads* o *resumen*\n\n` +
        `📍 *Enviar recursos*\n` +
        `→ Escribe *enviar video a Pedro*\n\n` +
        `💡 *Tip:* Escribe *#ayuda* para ver todos los comandos.\n\n` +
        `¿Listo para empezar? Responde *sí* o pregúntame lo que necesites.`;

      await this.meta.sendWhatsAppMessage(from, mensajeOnboarding);

      // Marcar onboarding como completado
      const notasActualizadas = {
        ...notasVendedor,
        onboarding_completed: true,
        onboarding_date: new Date().toISOString()
      };

      await this.supabase.client.from('team_members').update({
        notes: notasActualizadas
      }).eq('id', vendedor.id);

      // Si respondieron "sí" o similar, continuar normalmente
      if (['si', 'sí', 'ok', 'listo', 'va', 'dale'].includes(mensaje)) {
        const confirmacion = `¡Perfecto! 🚀\n\nYa estás listo. Cada mañana a las 8am te enviaré tu briefing con pendientes.\n\n¿En qué te ayudo?`;
        await this.meta.sendWhatsAppMessage(from, confirmacion);
      }

      return;
    }

    // ═══════════════════════════════════════════════════════════
    // RESPUESTA A FELICITACIÓN DE CUMPLEAÑOS DEL EQUIPO (ANTES de comandos)
    // ═══════════════════════════════════════════════════════════
    const pendingBirthdayResponse = notasVendedor?.pending_birthday_response;
    if (pendingBirthdayResponse && pendingBirthdayResponse.type === 'cumpleanos_equipo') {
      const sentAt = pendingBirthdayResponse.sent_at ? new Date(pendingBirthdayResponse.sent_at) : null;
      const horasTranscurridas = sentAt ? (Date.now() - sentAt.getTime()) / (1000 * 60 * 60) : 999;

      // Solo si fue enviado en las últimas 48 horas
      if (horasTranscurridas <= 48) {
        console.log(`🎂 Respuesta a felicitación de cumpleaños de ${nombreVendedor}`);

        // Responder con cariño
        const respuestaCumple = `¡Gracias ${nombreVendedor}! 🎉\n\n` +
          `Nos alegra mucho tu respuesta. ¡Esperamos que la pases increíble en tu día especial!\n\n` +
          `Todo el equipo te manda un abrazo. 🤗`;

        await this.meta.sendWhatsAppMessage(from, respuestaCumple);

        // Limpiar pending_birthday_response
        const { pending_birthday_response, ...notasSinPending } = notasVendedor;
        await this.supabase.client.from('team_members').update({
          notes: {
            ...notasSinPending,
            birthday_response_received: {
              at: new Date().toISOString(),
              message: body.substring(0, 200)
            }
          }
        }).eq('id', vendedor.id);

        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ENVIAR BRIEFING/RECAP PENDIENTE (cuando responden al template)
    // ═══════════════════════════════════════════════════════════
    const pendingBriefing = notasVendedor?.pending_briefing;
    const pendingRecap = notasVendedor?.pending_recap;

    // Verificar si hay briefing pendiente (últimas 12 horas)
    if (pendingBriefing?.sent_at && pendingBriefing?.mensaje_completo) {
      const horasDesde = (Date.now() - new Date(pendingBriefing.sent_at).getTime()) / (1000 * 60 * 60);
      if (horasDesde <= 12) {
        console.log(`📋 Vendedor ${nombreVendedor} respondió - enviando briefing completo`);

        // Enviar briefing completo
        await this.meta.sendWhatsAppMessage(from, pendingBriefing.mensaje_completo);

        // Limpiar pending_briefing, guardar como last_briefing_context
        const { pending_briefing, ...notasSinPending } = notasVendedor;
        await this.supabase.client.from('team_members').update({
          notes: {
            ...notasSinPending,
            last_briefing_context: {
              sent_at: new Date().toISOString(),
              citas: pendingBriefing.citas || 0,
              delivered: true
            }
          }
        }).eq('id', vendedor.id);
        return;
      }
    }

    // Verificar si hay recap pendiente (últimas 12 horas)
    if (pendingRecap?.sent_at && pendingRecap?.mensaje_completo) {
      const horasDesde = (Date.now() - new Date(pendingRecap.sent_at).getTime()) / (1000 * 60 * 60);
      if (horasDesde <= 12) {
        console.log(`📋 Vendedor ${nombreVendedor} respondió - enviando recap completo`);

        // Enviar recap completo
        await this.meta.sendWhatsAppMessage(from, pendingRecap.mensaje_completo);

        // Limpiar pending_recap
        const { pending_recap, ...notasSinPending } = notasVendedor;
        await this.supabase.client.from('team_members').update({
          notes: {
            ...notasSinPending,
            last_recap_context: {
              sent_at: new Date().toISOString(),
              tipo: pendingRecap.tipo,
              delivered: true
            }
          }
        }).eq('id', vendedor.id);
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESPUESTA A BRIEFING/RECAP YA ENTREGADO (feedback simple)
    // ═══════════════════════════════════════════════════════════
    const briefingContext = notasVendedor?.last_briefing_context;
    const recapContext = notasVendedor?.last_recap_context;

    // Detectar si es una respuesta simple tipo "ok", "gracias", "sí", "va", "perfecto", etc.
    const esRespuestaSimple = /^(ok|okey|okay|va|sí|si|gracias|grax|perfecto|listo|entendido|claro|sale|de acuerdo|recibido|👍|✅|💪|🙏)$/i.test(mensaje);

    if (esRespuestaSimple) {
      // Verificar si hay contexto de briefing reciente YA ENTREGADO (últimas 4 horas)
      if (briefingContext?.sent_at && briefingContext?.delivered) {
        const horasDesde = (Date.now() - new Date(briefingContext.sent_at).getTime()) / (1000 * 60 * 60);
        if (horasDesde <= 4) {
          console.log(`📋 Respuesta a briefing de ${nombreVendedor}: "${body}"`);
          const respuestasBriefing = [
            `¡Éxito hoy ${nombreVendedor}! 💪 Si necesitas algo, escríbeme.`,
            `¡A darle ${nombreVendedor}! 🎯 Recuerda que puedes escribir "citas" o "leads" para más info.`,
            `¡Vamos por esas ${briefingContext.citas || 0} citas! 💪 Estoy aquí si me necesitas.`
          ];
          await this.meta.sendWhatsAppMessage(from, respuestasBriefing[Math.floor(Math.random() * respuestasBriefing.length)]);

          // Limpiar contexto
          const { last_briefing_context, ...notasSinBriefing } = notasVendedor;
          await this.supabase.client.from('team_members').update({ notes: notasSinBriefing }).eq('id', vendedor.id);
          return;
        }
      }

      // Verificar si hay contexto de recap reciente YA ENTREGADO (últimas 4 horas)
      if (recapContext?.sent_at && recapContext?.delivered) {
        const horasDesde = (Date.now() - new Date(recapContext.sent_at).getTime()) / (1000 * 60 * 60);
        if (horasDesde <= 4) {
          console.log(`📋 Respuesta a recap de ${nombreVendedor}: "${body}"`);
          const respuestasRecap = [
            `¡Descansa bien ${nombreVendedor}! 🌙 Mañana con todo.`,
            `¡Buen trabajo hoy! 🎉 Nos vemos mañana.`,
            `¡Gracias por tu esfuerzo ${nombreVendedor}! 💪 Recarga energías.`
          ];
          await this.meta.sendWhatsAppMessage(from, respuestasRecap[Math.floor(Math.random() * respuestasRecap.length)]);

          // Limpiar contexto
          const { last_recap_context, ...notasSinRecap } = notasVendedor;
          await this.supabase.client.from('team_members').update({ notes: notasSinRecap }).eq('id', vendedor.id);
          return;
        }
      }
    }

    const ctx: import('../services/vendorCommandsService').VendorMessageContext = {
      from,
      body,
      mensaje,
      vendedor,
      nombreVendedor,
      teamMembers,
      notes,
      notasVendedor
    };

    // Procesar estados pendientes (birthday, acknowledgment, bridge, pending selections)
    const initialResult = await vendorService.processVendorMessageInitial(ctx);

    if (await this.executeVendorResult(from, initialResult, vendedor, nombreVendedor, teamMembers)) {
      return;
    }

    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║  CRÍTICO - NO MODIFICAR SIN CORRER TESTS: npm test                      ║
    // ║  Test file: src/tests/conversationLogic.test.ts                         ║
    // ║  Lógica: src/utils/conversationLogic.ts → shouldForwardToLead()         ║
    // ║                                                                         ║
    // ║  Bridge Vendedor = Chat directo Vendedor ↔ Lead (6 min)                ║
    // ║  - NO reenviar comandos (bridge X, cerrar, #mas, etc)                   ║
    // ║  - SÍ reenviar mensajes normales al lead                                ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    // ═══════════════════════════════════════════════════════════
    // 1.5. BRIDGE ACTIVO - Reenviar mensaje al lead
    // ═══════════════════════════════════════════════════════════
    const activeBridge = notasVendedor?.active_bridge;
    if (activeBridge && activeBridge.expires_at && new Date(activeBridge.expires_at) > new Date()) {
      // Si es comando de bridge o cerrar, procesarlo más abajo (no reenviar)
      const esBridgeCmd = /^(?:bridge|chat\s*directo|directo)\s+/i.test(mensaje);
      const esCerrarCmd = mensaje === 'cerrar' || mensaje === 'fin' || mensaje === '#cerrar' || mensaje === '#fin' || mensaje === 'salir';
      const esExtenderCmd = mensaje === '#mas' || mensaje === '#más' || mensaje === '#continuar';

      if (esBridgeCmd || esCerrarCmd || esExtenderCmd) {
        // Continuar al handler de comandos
      } else {
        // Reenviar mensaje al lead
        console.log('🔗 BRIDGE VENDEDOR activo, reenviando mensaje a:', activeBridge.lead_name);

        const leadPhone = activeBridge.lead_phone;
        if (leadPhone) {
          // Verificar ventana de 24h del lead
          const { data: leadData } = await this.supabase.client
            .from('leads')
            .select('last_message_at')
            .eq('id', activeBridge.lead_id)
            .single();

          const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const dentroVentana24h = leadData?.last_message_at && leadData.last_message_at > hace24h;
          console.log(`📊 Bridge 24h check: last_message_at=${leadData?.last_message_at}, dentroVentana=${dentroVentana24h}`);

          if (!dentroVentana24h) {
            // Fuera de ventana - preguntar qué hacer
            console.error(`⚠️ Bridge: Lead ${activeBridge.lead_name} fuera de ventana 24h`);

            // Formatear teléfono para mostrar
            const telLimpio = leadPhone.replace(/\D/g, '').slice(-10);

            // Guardar contexto para selección de template
            notasVendedor.pending_template_selection = {
              lead_id: activeBridge.lead_id,
              lead_name: activeBridge.lead_name,
              lead_phone: leadPhone,
              mensaje_original: body,
              from_bridge: true,
              timestamp: new Date().toISOString()
            };
            await this.supabase.client.from('team_members').update({ notes: notasVendedor }).eq('id', vendedor.id);

            await this.meta.sendWhatsAppMessage(from,
              `⚠️ *${activeBridge.lead_name} no ha escrito en 24h*\n\n` +
              `WhatsApp no permite mensajes directos.\n\n` +
              `*¿Qué quieres hacer?*\n\n` +
              `*1.* 📩 Template reactivación\n` +
              `*2.* 📩 Template seguimiento\n` +
              `*3.* 📩 Template info crédito\n` +
              `*4.* 📞 Contactar directo (te doy su cel)\n` +
              `*5.* ❌ Cancelar\n\n` +
              `_Responde con el número_`
            );
            return;
          }

          const msgFormateado = `💬 *${nombreVendedor}:*\n${body}`;
          await this.meta.sendWhatsAppMessage(leadPhone, msgFormateado);

          // Actualizar last_activity
          notasVendedor.active_bridge.last_activity = new Date().toISOString();
          await this.supabase.client
            .from('team_members')
            .update({ notes: notasVendedor })
            .eq('id', vendedor.id);

          // Registrar actividad
          if (activeBridge.lead_id) {
            await this.supabase.client.from('lead_activities').insert({
              lead_id: activeBridge.lead_id,
              team_member_id: vendedor.id,
              activity_type: 'whatsapp',
              notes: `Bridge: ${nombreVendedor} → ${activeBridge.lead_name}`,
              created_at: new Date().toISOString()
            });
          }

          // Confirmar al vendedor (mensaje corto)
          await this.meta.sendWhatsAppMessage(from, `✓ Enviado a ${activeBridge.lead_name}`);
          return;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. INTERCEPCIÓN TEMPRANA DE COMANDOS CRÍTICOS
    // ═══════════════════════════════════════════════════════════

    // CERRAR BRIDGE - Vendedor termina chat directo
    if (mensaje === 'cerrar' || mensaje === 'fin' || mensaje === '#cerrar' || mensaje === '#fin' || mensaje === 'salir') {
      await this.vendedorCerrarBridge(from, vendedor, nombreVendedor);
      return;
    }

    const earlyCmd = vendorService.detectEarlyCommand(mensaje, body);
    if (earlyCmd) {
      switch (earlyCmd.command) {
        case 'reagendar':
          await this.vendedorReagendarCita(from, body, vendedor, nombreVendedor);
          return;
        case 'cancelar_cita':
          await this.vendedorCancelarCita(from, body, vendedor, nombreVendedor);
          return;
        case 'crear_lead':
          await this.vendedorCrearLead(from, body, vendedor, nombreVendedor);
          return;
        case 'asignar_hipoteca':
          await this.vendedorAsignarHipoteca(from, body, vendedor, nombreVendedor, teamMembers);
          return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. SELECCIÓN PENDIENTE DE REAGENDAR (respuestas "1", "2", etc.)
    // ═══════════════════════════════════════════════════════════
    if (/^[1-9]$/.test(mensaje.trim()) && notasVendedor?.pending_reagendar_selection) {
      const selection = notasVendedor.pending_reagendar_selection;
      console.log('📅 PENDING REAGENDAR SELECTION:', JSON.stringify(selection));
      const idx = parseInt(mensaje.trim()) - 1;

      if (idx >= 0 && idx < selection.leads.length) {
        const selectedLead = selection.leads[idx];
        console.log('📅 Lead seleccionado para reagendar:', selectedLead?.name);
        // Limpiar la selección pendiente
        const { pending_reagendar_selection, ...restNotes } = notasVendedor;
        await this.supabase.client
          .from('team_members')
          .update({ notes: restNotes })
          .eq('id', vendedor.id);

        // Ejecutar reagendar con el lead seleccionado
        const schedulingService = new AppointmentSchedulingService(this.supabase, this.calendar);

        // Buscar cita activa del lead
        const { data: appointment } = await this.supabase.client
          .from('appointments')
          .select('*')
          .eq('lead_id', selectedLead.id)
          .in('status', ['scheduled', 'confirmed'])
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .single();

        if (!appointment) {
          await this.twilio.sendWhatsAppMessage(from, `⚠️ ${selectedLead.name} no tiene citas pendientes para reagendar.`);
          return;
        }

        // Parsear fecha/hora del comando original
        const originalBody = selection.original_body || '';
        const parsed = this.parseReagendarParams(originalBody);

        if (!parsed.dia || !parsed.hora) {
          await this.twilio.sendWhatsAppMessage(from,
            `📅 *Reagendar cita de ${selectedLead.name}*\n\n` +
            `¿Para cuándo la movemos?\n\n` +
            `*Escribe:*\n` +
            `reagendar ${selectedLead.name} [día] [hora]\n\n` +
            `*Ejemplo:*\n` +
            `reagendar ${selectedLead.name} mañana 4pm`
          );
          return;
        }

        // Ejecutar reagendar con el lead ya seleccionado
        console.log('📅 Llamando reagendarCitaConSeleccion con:', selectedLead.name, parsed.dia, parsed.hora, parsed.minutos, parsed.ampm);
        const result = await schedulingService.reagendarCitaConSeleccion(
          selectedLead,
          parsed.dia,
          parsed.hora,
          parsed.ampm || 'pm',
          vendedor,
          parsed.minutos
        );
        console.log('📅 Resultado reagendarCitaConSeleccion:', JSON.stringify(result));

        if (result.success) {
          await this.twilio.sendWhatsAppMessage(from, schedulingService.formatReagendarCitaExito(result));

          // Guardar estado para notificación al lead (si tiene teléfono)
          if (selectedLead.phone) {
            const notesToSave = sanitizeNotes(restNotes);
            notesToSave.pending_reagendar_notify = {
              lead_id: selectedLead.id,
              lead_name: selectedLead.name,
              lead_phone: selectedLead.phone,
              fecha: result.nuevaFecha,
              hora: result.nuevaHora,
              timestamp: Date.now()
            };
            await this.supabase.client
              .from('team_members')
              .update({ notes: notesToSave })
              .eq('id', vendedor.id);
          }
        } else {
          await this.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error || 'Error al reagendar'}`);
        }
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3.5. SELECCIÓN PENDIENTE DE CANCELAR CITA
    // ═══════════════════════════════════════════════════════════
    if (/^[1-9]$/.test(mensaje.trim()) && notasVendedor?.pending_cita_action) {
      const pendingAction = notasVendedor.pending_cita_action;
      const idx = parseInt(mensaje.trim()) - 1;

      if (idx >= 0 && idx < pendingAction.leads.length) {
        const selectedLead = pendingAction.leads[idx];
        // Limpiar pending_cita_action
        const { pending_cita_action, ...restNotes } = notasVendedor;
        await this.supabase.client
          .from('team_members')
          .update({ notes: restNotes })
          .eq('id', vendedor.id);

        if (pendingAction.action === 'cancelar') {
          // Cancelar cita del lead seleccionado
          const schedulingService = new AppointmentSchedulingService(this.supabase, this.calendar);
          const result = await schedulingService.cancelarCitaPorId(selectedLead.id, selectedLead.name, vendedor);

          if (result.success) {
            await this.twilio.sendWhatsAppMessage(from, schedulingService.formatCancelarCitaExito(result));

            // Preguntar si desea notificar al lead (si tiene teléfono)
            if (result.leadPhone) {
              const notesToUpdate = restNotes || {};
              notesToUpdate.pending_cancelar_notify = {
                lead_id: result.leadId,
                lead_name: result.leadName,
                lead_phone: result.leadPhone,
                fecha: result.fechaStr,
                hora: result.horaStr,
                timestamp: Date.now()
              };
              await this.supabase.client
                .from('team_members')
                .update({ notes: notesToUpdate })
                .eq('id', vendedor.id);

              await this.twilio.sendWhatsAppMessage(from,
                `📱 *¿Deseas notificar a ${result.leadName} de la cancelación?*\n\n` +
                `1️⃣ Sí, enviar mensaje\n` +
                `2️⃣ No, yo le aviso`
              );
            }
          } else {
            await this.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error || 'Error al cancelar'}`);
          }
        }
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3.6. SELECCIÓN PENDIENTE DE AGENDAR CITA
    // ═══════════════════════════════════════════════════════════
    if (/^[1-9]$/.test(mensaje.trim()) && notasVendedor?.pending_agendar_cita) {
      const pendingAgendar = notasVendedor.pending_agendar_cita;
      console.log('📅 PENDING AGENDAR:', JSON.stringify(pendingAgendar));
      const idx = parseInt(mensaje.trim()) - 1;

      if (idx >= 0 && idx < pendingAgendar.leads.length) {
        const selectedLead = pendingAgendar.leads[idx];
        console.log('📅 Lead seleccionado:', selectedLead?.name, 'dia:', pendingAgendar.dia, 'hora:', pendingAgendar.hora, 'minutos:', pendingAgendar.minutos, 'ampm:', pendingAgendar.ampm);
        // Limpiar pending_agendar_cita
        const { pending_agendar_cita, ...restNotes } = notasVendedor;
        await this.supabase.client
          .from('team_members')
          .update({ notes: restNotes })
          .eq('id', vendedor.id);

        // Crear cita con el lead seleccionado
        const calendarLocal = new CalendarService(
          this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          this.env.GOOGLE_PRIVATE_KEY,
          this.env.GOOGLE_CALENDAR_ID
        );
        const schedulingService = new AppointmentSchedulingService(this.supabase, calendarLocal);

        if (!pendingAgendar.dia || !pendingAgendar.hora) {
          // Si no hay día/hora, pedir que complete
          await this.twilio.sendWhatsAppMessage(from,
            `✅ Seleccionaste a *${selectedLead.name}*\n\n` +
            `¿Cuándo quieres agendar la cita?\n\n` +
            `Escribe: *agendar ${selectedLead.name} mañana 4pm*`
          );
          return;
        }

        const result = await schedulingService.agendarCitaConSeleccion(
          selectedLead,
          pendingAgendar.dia,
          pendingAgendar.hora,
          pendingAgendar.ampm || 'pm',
          vendedor,
          pendingAgendar.minutos,
          pendingAgendar.desarrollo
        );

        if (result.success) {
          await this.twilio.sendWhatsAppMessage(from, schedulingService.formatAgendarCitaExito(result));

          // Guardar estado para notificación al lead (si tiene teléfono)
          console.log('📱 DEBUG: selectedLead.phone =', selectedLead.phone);
          if (selectedLead.phone) {
            const notesToSave = sanitizeNotes(restNotes);
            notesToSave.pending_agendar_notify = {
              lead_id: selectedLead.id,
              lead_name: selectedLead.name,
              lead_phone: selectedLead.phone,
              fecha: result.fecha,
              hora: result.hora,
              ubicacion: result.ubicacion,
              gpsLink: result.gpsLink,
              timestamp: Date.now()
            };
            console.log('📱 DEBUG: Guardando pending_agendar_notify:', JSON.stringify(notesToSave));
            const { error } = await this.supabase.client
              .from('team_members')
              .update({ notes: notesToSave })
              .eq('id', vendedor.id);
            if (error) console.log('📱 DEBUG: Error guardando notes:', error);
            else console.log('📱 DEBUG: Notes guardadas OK');
          } else {
            console.log('📱 DEBUG: Lead sin teléfono, no se guarda pending_agendar_notify');
          }
        } else {
          await this.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error || 'Error al agendar'}`);
        }
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3.7. RESPUESTA A NOTIFICACIÓN DE AGENDAR
    // ═══════════════════════════════════════════════════════════
    if (/^[12]$/.test(mensaje.trim()) && notasVendedor?.pending_agendar_notify) {
      const pendingNotify = notasVendedor.pending_agendar_notify;
      console.log('📱 PENDING AGENDAR NOTIFY:', JSON.stringify(pendingNotify));

      // Limpiar pending_agendar_notify
      const { pending_agendar_notify, ...restNotesAgendar } = notasVendedor;
      const cleanNotes = sanitizeNotes(restNotesAgendar);
      await this.supabase.client
        .from('team_members')
        .update({ notes: cleanNotes })
        .eq('id', vendedor.id);

      if (mensaje.trim() === '1') {
        // Enviar notificación al lead
        const leadPhone = pendingNotify.lead_phone.startsWith('521')
          ? pendingNotify.lead_phone
          : `521${pendingNotify.lead_phone.replace(/\D/g, '').slice(-10)}`;

        // Formatear teléfono del vendedor para el lead
        const vendedorPhone = vendedor.phone?.replace(/\D/g, '').slice(-10) || '';
        const vendedorPhoneFormatted = vendedorPhone ? `52${vendedorPhone}` : '';

        let mensajeLead = `¡Hola ${pendingNotify.lead_name.split(' ')[0]}! 👋\n\n` +
          `Te confirmamos tu cita:\n` +
          `📅 ${pendingNotify.fecha}\n` +
          `🕐 ${pendingNotify.hora}`;

        // Agregar ubicación si existe
        if (pendingNotify.ubicacion && pendingNotify.ubicacion !== 'Por confirmar') {
          mensajeLead += `\n📍 ${pendingNotify.ubicacion}`;
        }
        if (pendingNotify.gpsLink) {
          mensajeLead += `\n🗺️ ${pendingNotify.gpsLink}`;
        }

        // Agregar info del asesor
        mensajeLead += `\n\n👤 Te atenderá: *${nombreVendedor}*`;
        if (vendedorPhoneFormatted) {
          mensajeLead += `\n📱 ${vendedorPhoneFormatted}`;
        }

        mensajeLead += `\n\n¡Te esperamos!`;

        await this.meta.sendWhatsAppMessage(leadPhone, mensajeLead);
        await this.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${pendingNotify.lead_name}*`);

        // Registrar actividad
        await this.supabase.client
          .from('lead_activities')
          .insert({
            lead_id: pendingNotify.lead_id,
            type: 'whatsapp',
            notes: `Lead notificado de cita por ${nombreVendedor}`,
            created_by: vendedor.id
          });
      } else {
        await this.twilio.sendWhatsAppMessage(from, `✅ Entendido, tú le avisarás a ${pendingNotify.lead_name}.`);
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 3.8. RESPUESTA A NOTIFICACIÓN DE CANCELACIÓN
    // ═══════════════════════════════════════════════════════════
    if (/^[12]$/.test(mensaje.trim()) && notasVendedor?.pending_cancelar_notify) {
      const pendingNotify = notasVendedor.pending_cancelar_notify;
      console.log('📱 PENDING CANCELAR NOTIFY:', JSON.stringify(pendingNotify));

      // Limpiar pending_cancelar_notify (sanitizar para evitar corrupción)
      const { pending_cancelar_notify, ...restNotesCancelar } = notasVendedor;
      const cleanNotesCancelar = sanitizeNotes(restNotesCancelar);
      await this.supabase.client
        .from('team_members')
        .update({ notes: cleanNotesCancelar })
        .eq('id', vendedor.id);

      if (mensaje.trim() === '1') {
        // Enviar notificación al lead
        const leadPhone = pendingNotify.lead_phone.startsWith('521')
          ? pendingNotify.lead_phone
          : `521${pendingNotify.lead_phone.replace(/\D/g, '').slice(-10)}`;

        const mensajeLead = `Hola ${pendingNotify.lead_name.split(' ')[0]}, te informamos que tu cita programada para el ${pendingNotify.fecha} a las ${pendingNotify.hora} ha sido cancelada.\n\n` +
          `Si deseas reagendar, por favor contacta a tu asesor.\n\n` +
          `Disculpa las molestias.`;

        await this.meta.sendWhatsAppMessage(leadPhone, mensajeLead);
        await this.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${pendingNotify.lead_name}*`);

        // Registrar actividad
        await this.supabase.client
          .from('lead_activities')
          .insert({
            lead_id: pendingNotify.lead_id,
            type: 'whatsapp',
            notes: `Lead notificado de cancelación por ${nombreVendedor}`,
            created_by: vendedor.id
          });
      } else {
        await this.twilio.sendWhatsAppMessage(from, `✅ Entendido, tú le avisarás a ${pendingNotify.lead_name}.`);
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 3.9. RESPUESTA A NOTIFICACIÓN DE REAGENDAR
    // ═══════════════════════════════════════════════════════════
    if (/^[12]$/.test(mensaje.trim()) && notasVendedor?.pending_reagendar_notify) {
      const pendingNotify = notasVendedor.pending_reagendar_notify;
      console.log('📱 PENDING REAGENDAR NOTIFY:', JSON.stringify(pendingNotify));

      // Limpiar pending_reagendar_notify
      const { pending_reagendar_notify, ...restNotesReagendar } = notasVendedor;
      const cleanNotesReagendar = sanitizeNotes(restNotesReagendar);
      await this.supabase.client
        .from('team_members')
        .update({ notes: cleanNotesReagendar })
        .eq('id', vendedor.id);

      if (mensaje.trim() === '1') {
        // Enviar notificación al lead
        const leadPhone = pendingNotify.lead_phone.startsWith('521')
          ? pendingNotify.lead_phone
          : `521${pendingNotify.lead_phone.replace(/\D/g, '').slice(-10)}`;

        // Formatear teléfono del vendedor para el lead
        const vendedorPhone = vendedor.phone?.replace(/\D/g, '').slice(-10) || '';
        const vendedorPhoneFormatted = vendedorPhone ? `52${vendedorPhone}` : '';

        let mensajeLead = `¡Hola ${pendingNotify.lead_name.split(' ')[0]}! 👋\n\n` +
          `Tu cita ha sido *reagendada*:\n` +
          `📅 ${pendingNotify.fecha}\n` +
          `🕐 ${pendingNotify.hora}`;

        // Agregar info del asesor
        mensajeLead += `\n\n👤 Te atenderá: *${nombreVendedor}*`;
        if (vendedorPhoneFormatted) {
          mensajeLead += `\n📱 ${vendedorPhoneFormatted}`;
        }

        mensajeLead += `\n\n¡Te esperamos!`;

        await this.meta.sendWhatsAppMessage(leadPhone, mensajeLead);
        await this.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${pendingNotify.lead_name}*`);

        // Registrar actividad
        await this.supabase.client
          .from('lead_activities')
          .insert({
            lead_id: pendingNotify.lead_id,
            type: 'whatsapp',
            notes: `Lead notificado de reagenda por ${nombreVendedor}`,
            created_by: vendedor.id
          });
      } else {
        await this.twilio.sendWhatsAppMessage(from, `✅ Entendido, tú le avisarás a ${pendingNotify.lead_name}.`);
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 3b. CONFIRMACIONES PENDIENTES (respuestas "1", "2", "si", "no")
    // ═══════════════════════════════════════════════════════════
    if (await this.handlePendingConfirmations(from, mensaje, vendedor, nombreVendedor)) {
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 4. MOTIVO DE CAÍDA
    // ═══════════════════════════════════════════════════════════
    if (['1', '2', '3', '4'].includes(mensaje.trim())) {
      await this.vendedorMotivoRespuesta(from, mensaje.trim(), vendedor);
      return;
    }

    // Motivo personalizado (después de elegir 4)
    const { data: leadPendiente } = await this.supabase.client
      .from('leads')
      .select('id, notes')
      .eq('assigned_to', vendedor.id)
      .eq('status', 'fallen')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (leadPendiente?.notes?.pending_custom_reason) {
      await this.vendedorMotivoCustom(from, body, vendedor);
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 5. COMANDOS COORDINADOR (solo si es coordinador o admin)
    // ═══════════════════════════════════════════════════════════
    if (vendedor.role === 'coordinador' || vendedor.role === 'admin') {
      if (await this.routeCoordinadorCommand(from, body, mensaje, vendedor, nombreVendedor, teamMembers)) {
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. DETECTAR Y EJECUTAR COMANDOS VENDEDOR
    // ═══════════════════════════════════════════════════════════
    if (await this.routeVendorCommand(from, body, mensaje, vendedor, nombreVendedor, teamMembers)) {
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // 6. DEFAULT: IA PARA CLASIFICAR
    // ═══════════════════════════════════════════════════════════
    await this.vendedorIntentIA(from, body, vendedor, nombreVendedor);
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
    if (result.action === 'continue') {
      return false;
    }

    switch (result.action) {
      case 'send_twilio':
        if (result.twilioMessage) {
          await this.twilio.sendWhatsAppMessage(from, result.twilioMessage);
        }
        return true;

      case 'send_meta':
        if (result.metaMessage && result.metaPhone) {
          await this.meta.sendWhatsAppMessage(result.metaPhone, result.metaMessage);
        }
        return true;

      case 'send_both':
        if (result.twilioMessage) {
          await this.twilio.sendWhatsAppMessage(from, result.twilioMessage);
        }
        if (result.metaMessage && result.metaPhone) {
          await this.meta.sendWhatsAppMessage(result.metaPhone, result.metaMessage);
        }
        return true;

      case 'call_handler':
        return await this.executeSubHandler(from, result, vendedor, nombreVendedor, teamMembers);

      case 'handled':
        return true;

      case 'use_ai':
        return false; // Continue to AI fallback
    }

    return false;
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
    const params = result.handlerParams || {};

    switch (result.handlerName) {
      case 'enviarMensajePendienteLead':
        await this.enviarMensajePendienteLead(from, params.body || '', vendedor, params.pendingData);
        return true;

      case 'asignarHipotecaALead':
        await this.asignarHipotecaALead(from, params.leadSeleccionado, vendedor, teamMembers);
        return true;

      case 'processShowConfirmationResult':
        await this.processShowConfirmationResult(from, params.showResult, params.confirmacion);
        return true;

      case 'forwardBridgeMessage':
        await this.meta.sendWhatsAppMessage(params.leadPhone, params.mensaje);
        const vendorService = new VendorCommandsService(this.supabase);
        await this.meta.sendWhatsAppMessage(params.vendedorFrom, vendorService.formatBridgeConfirmation(params.leadName));
        // Detectar intención de cita
        const intencion = this.detectarIntencionCita(params.mensaje);
        if (intencion.detectado && intencion.fecha && intencion.hora) {
          const { notes } = await vendorService.getVendedorNotes(vendedor.id);
          if (notes?.active_bridge) {
            await vendorService.savePendingBridgeAppointment(vendedor.id, notes, intencion);
            setTimeout(async () => {
              await this.meta.sendWhatsAppMessage(params.vendedorFrom,
                vendorService.formatBridgeAppointmentSuggestion(intencion.tipo, notes.active_bridge.lead_name, intencion.fecha!, intencion.hora!)
              );
            }, 1000);
          }
        }
        return true;
    }

    return false;
  }

  /**
   * Maneja confirmaciones pendientes (reagendar, citas)
   */
  private async handlePendingConfirmations(from: string, mensaje: string, vendedor: any, nombreVendedor: string): Promise<boolean> {
    // ═══════════════════════════════════════════════════════════
    // PRIMERO: Verificar pending_show_confirmation (pregunta ¿LLEGÓ?)
    // ═══════════════════════════════════════════════════════════
    const showConfirmResult = await this.procesarRespuestaShowConfirmation(vendedor.id, mensaje);
    if (showConfirmResult.handled) {
      await this.meta.sendWhatsAppMessage(from, showConfirmResult.mensajeVendedor!);

      // Si el lead SÍ llegó, enviar encuesta de satisfacción
      if (showConfirmResult.siLlego && showConfirmResult.leadPhone) {
        await this.enviarEncuestaSatisfaccion(showConfirmResult.leadPhone, showConfirmResult.leadName, showConfirmResult.property);
      }

      // Si NO llegó, ofrecer reagendar y guardar contexto para seguimiento
      console.log(`👻 NO-SHOW DEBUG: noLlego=${showConfirmResult.noLlego}, leadPhone=${showConfirmResult.leadPhone}, leadName=${showConfirmResult.leadName}`);
      if (showConfirmResult.noLlego && showConfirmResult.leadPhone) {
        const nombreCliente = showConfirmResult.leadName?.split(' ')[0] || 'Hola';
        console.log(`📅 Enviando mensaje de reagenda a ${showConfirmResult.leadPhone}...`);
        try {
          // Enviar mensaje al lead
          await this.meta.sendWhatsAppMessage(showConfirmResult.leadPhone,
            `Hola ${nombreCliente}, notamos que no pudiste asistir a tu cita. 😊\n\n` +
            `¿Te gustaría reagendar para otro día?\n` +
            `Escríbenos cuando gustes y con gusto te ayudamos.`
          );
          console.log(`✅ Mensaje de reagenda enviado exitosamente a ${showConfirmResult.leadName} (${showConfirmResult.leadPhone})`);

          // Guardar contexto en el lead para seguimiento de respuesta
          const phoneSuffix = showConfirmResult.leadPhone.replace(/\D/g, '').slice(-10);
          const { data: leadData } = await this.supabase.client
            .from('leads')
            .select('id, notes, assigned_to')
            .or(`phone.ilike.%${phoneSuffix},whatsapp_phone.ilike.%${phoneSuffix}`)
            .single();

          if (leadData) {
            const notasLead = typeof leadData.notes === 'object' ? leadData.notes : {};
            await this.supabase.client
              .from('leads')
              .update({
                status: 'no_show',
                notes: {
                  ...notasLead,
                  pending_noshow_response: {
                    vendedor_id: vendedor.id,
                    vendedor_name: nombreVendedor,
                    vendedor_phone: from,
                    property: showConfirmResult.property,
                    asked_at: new Date().toISOString()
                  }
                }
              })
              .eq('id', leadData.id);
            console.log(`📋 Contexto no-show guardado en lead ${leadData.id}`);
          }
        } catch (err) {
          console.error('❌ Error enviando mensaje reagenda:', err);
        }
      } else {
        console.error(`⚠️ NO se envió mensaje de reagenda: noLlego=${showConfirmResult.noLlego}, leadPhone=${showConfirmResult.leadPhone || 'NULL'}`);
      }

      return true;
    }

    // ═══════════════════════════════════════════════════════════
    // SEGUNDO: Otras confirmaciones pendientes
    // ═══════════════════════════════════════════════════════════
    // Respuestas afirmativas
    if (mensaje === '1' || mensaje === 'si' || mensaje === 'sí' || mensaje.includes('si manda') || mensaje.includes('sí manda')) {
      if (await this.hayReagendarPendiente(vendedor.id)) {
        await this.enviarNotificacionReagendar(from, vendedor);
        return true;
      }
      if (await this.hayConfirmacionPendiente(vendedor.id)) {
        await this.enviarConfirmacionAlLead(from, vendedor, nombreVendedor);
        return true;
      }
    }

    // Respuestas negativas
    if (mensaje === '2' || mensaje === 'no' || mensaje.includes('yo le aviso')) {
      if (await this.hayReagendarPendiente(vendedor.id)) {
        await this.cancelarNotificacionReagendar(from, vendedor);
        return true;
      }
      if (await this.hayConfirmacionPendiente(vendedor.id)) {
        await this.cancelarConfirmacionPendiente(from, vendedor, nombreVendedor);
        return true;
      }
    }

    return false;
  }

  /**
   * Procesa respuesta a la pregunta "¿LLEGÓ [LEAD]?"
   */
  private async procesarRespuestaShowConfirmation(vendedorId: string, mensaje: string): Promise<{
    handled: boolean;
    mensajeVendedor?: string;
    siLlego?: boolean;
    noLlego?: boolean;
    leadPhone?: string;
    leadName?: string;
    property?: string;
  }> {
    // Obtener notas del vendedor
    const { data: vendedor } = await this.supabase.client
      .from('team_members')
      .select('notes, name')
      .eq('id', vendedorId)
      .single();

    if (!vendedor) return { handled: false };

    let notes: any = {};
    try {
      if (vendedor.notes) {
        notes = typeof vendedor.notes === 'string' ? JSON.parse(vendedor.notes) : vendedor.notes;
      }
    } catch (e) {
      return { handled: false };
    }

    const confirmacion = notes?.pending_show_confirmation;
    if (!confirmacion) return { handled: false };

    const msg = mensaje.toLowerCase().trim();

    // Verificar si es respuesta "1" (sí llegó) o "2" (no llegó)
    // Normalizar acentos para comparación
    const msgNorm = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar acentos
    const siLlego = msg === '1' || msg === 'si' || msg === 'sí' ||
                    msg.startsWith('si ') || msg.startsWith('sí ') ||
                    msgNorm.includes('si llego') || msg.includes('llegó') || msg.includes('llego');
    const noLlego = msg === '2' || msg === 'no' ||
                    msgNorm.includes('no llego') || msg.includes('no llegó') || msg.includes('no llego') ||
                    msg.includes('no vino') || msg.includes('no asistio') || msg.includes('faltó');

    if (!siLlego && !noLlego) return { handled: false };

    const leadName = confirmacion.lead_name || 'el cliente';
    const property = confirmacion.property || 'la propiedad';

    if (siLlego) {
      // Marcar cita como completada
      if (confirmacion.appointment_id) {
        await this.supabase.client
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', confirmacion.appointment_id);
      }

      // Limpiar pending_show_confirmation
      delete notes.pending_show_confirmation;
      await this.supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notes) })
        .eq('id', vendedorId);

      console.log(`✅ Cita ${confirmacion.appointment_id} marcada como completed por ${vendedor.name}`);

      return {
        handled: true,
        mensajeVendedor: `✅ Perfecto, registré que *${leadName}* SÍ llegó a su cita.\n\nLe enviaré una encuesta de satisfacción. ¡Gracias!`,
        siLlego: true,
        leadPhone: confirmacion.lead_phone,
        leadName: confirmacion.lead_name,
        property
      };
    }

    if (noLlego) {
      // Marcar cita como no_show
      if (confirmacion.appointment_id) {
        await this.supabase.client
          .from('appointments')
          .update({ status: 'no_show' })
          .eq('id', confirmacion.appointment_id);
      }

      // Limpiar pending_show_confirmation
      delete notes.pending_show_confirmation;
      await this.supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notes) })
        .eq('id', vendedorId);

      console.log(`👻 Cita ${confirmacion.appointment_id} marcada como no_show por ${vendedor.name}`);

      return {
        handled: true,
        mensajeVendedor: `👻 Registré que *${leadName}* NO llegó a su cita.\n\nLe enviaré un mensaje para ofrecerle reagendar.`,
        noLlego: true,
        leadPhone: confirmacion.lead_phone,
        leadName: confirmacion.lead_name,
        property
      };
    }

    return { handled: false };
  }

  /**
   * Envía encuesta de satisfacción al lead y guarda el estado pendiente
   */
  private async enviarEncuestaSatisfaccion(leadPhone: string, leadName?: string, property?: string): Promise<void> {
    const nombreCliente = leadName?.split(' ')[0] || 'Cliente';
    const propiedad = property || 'la propiedad';

    try {
      // Guardar en lead.notes que está esperando respuesta de encuesta
      const cleanLeadPhone = leadPhone.replace(/\D/g, '');
      const { data: leadData } = await this.supabase.client
        .from('leads')
        .select('id, notes')
        .or(`phone.eq.${cleanLeadPhone},phone.like.%${cleanLeadPhone.slice(-10)}`)
        .single();

      if (leadData) {
        let notasLead: any = {};
        try {
          notasLead = typeof leadData.notes === 'object' && leadData.notes ? leadData.notes : {};
        } catch (e) { notasLead = {}; }

        notasLead.pending_satisfaction_survey = {
          property: propiedad,
          asked_at: new Date().toISOString()
        };

        await this.supabase.client
          .from('leads')
          .update({ notes: notasLead })
          .eq('id', leadData.id);

        console.log(`📝 Guardado pending_satisfaction_survey para lead ${leadData.id}`);
      }

      await this.meta.sendWhatsAppMessage(leadPhone,
        `¡Hola ${nombreCliente}! 👋\n\n` +
        `Gracias por visitarnos en *${propiedad}*. 🏠\n\n` +
        `¿Cómo fue tu experiencia?\n` +
        `1️⃣ Excelente\n` +
        `2️⃣ Buena\n` +
        `3️⃣ Regular\n` +
        `4️⃣ Mala\n\n` +
        `_Responde con el número_ 🙏`
      );
      console.log(`📋 Encuesta post-visita enviada a ${leadName}`);
    } catch (err) {
      console.error('Error enviando encuesta post-visita:', err);
    }
  }

  /**
   * Busca un lead que tenga pending_noshow_response (esperando respuesta a mensaje de reagendar)
   */
  private async buscarLeadConNoShowPendiente(phone: string): Promise<any | null> {
    try {
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);

      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, notes, assigned_to')
        .or(`phone.ilike.%${phoneSuffix},whatsapp_phone.ilike.%${phoneSuffix}`);

      if (!leads || leads.length === 0) return null;

      // Buscar el que tenga pending_noshow_response
      for (const lead of leads) {
        const notas = typeof lead.notes === 'object' ? lead.notes : {};
        if (notas.pending_noshow_response) {
          console.log(`📋 Encontrado lead con no-show pendiente: ${lead.name}`);
          return lead;
        }
      }

      return null;
    } catch (err) {
      console.error('Error buscando lead con no-show pendiente:', err);
      return null;
    }
  }

  /**
   * Procesa el resultado de confirmación de asistencia
   */
  private async processShowConfirmationResult(from: string, showResult: any, confirmacion: any): Promise<void> {
    await this.meta.sendWhatsAppMessage(from, showResult.mensajeVendedor);

    if (showResult.tipo === 'si_llego' && showResult.needsClientSurvey && showResult.leadPhone && showResult.leadId) {
      const nombreCliente = showResult.leadName?.split(' ')[0] || '';
      const propiedad = showResult.property || 'la propiedad';
      const vendorService = new VendorCommandsService(this.supabase);
      try {
        const templateComponents = [{
          type: 'body',
          parameters: [
            { type: 'text', text: nombreCliente },
            { type: 'text', text: propiedad }
          ]
        }];
        await this.meta.sendTemplate(showResult.leadPhone, 'encuesta_post_visita', 'es_MX', templateComponents);
      } catch (templateErr) {
        await this.meta.sendWhatsAppMessage(showResult.leadPhone,
          `¡Hola ${nombreCliente}! 👋\n\nGracias por visitarnos en *${propiedad}*. 🏠\n\n¿Qué te pareció? Responde:\n1️⃣ Me encantó\n2️⃣ Quiero ver más opciones\n3️⃣ Tengo dudas`
        );
      }
      await vendorService.saveClientSurveyPending(showResult.leadId, propiedad, showResult.vendedorId!, showResult.vendedorName!);
    }

    if (showResult.tipo === 'no_llego' && showResult.needsReagendarMessage && showResult.leadPhone) {
      const nombreCliente = showResult.leadName?.split(' ')[0] || 'Hola';
      const propiedad = showResult.property || 'la propiedad';
      try {
        const templateComponents = [{
          type: 'body',
          parameters: [
            { type: 'text', text: nombreCliente },
            { type: 'text', text: propiedad }
          ]
        }];
        await this.meta.sendTemplate(showResult.leadPhone, 'reagendar_noshow', 'es_MX', templateComponents);
      } catch (templateErr) {
        await this.meta.sendWhatsAppMessage(showResult.leadPhone,
          `👋 Hola ${nombreCliente},\n\nNotamos que no pudiste llegar a tu cita en *${propiedad}*.\n\n¡No te preocupes! 😊 ¿Te gustaría reagendar?`
        );
      }
    }
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
    const vendorService = new VendorCommandsService(this.supabase);
    const result = vendorService.detectCoordinadorCommand(mensaje, body);

    if (!result.matched) {
      return false;
    }

    console.log('📋 COORDINADOR Command:', result.command);

    try {
      switch (result.command) {
        case 'guardia': {
          const data = await vendorService.getGuardiaHoy();
          await this.twilio.sendWhatsAppMessage(from, vendorService.formatGuardiaHoy(data));
          return true;
        }

        case 'disponibilidad': {
          const data = await vendorService.getDisponibilidadEquipo();
          await this.twilio.sendWhatsAppMessage(from, vendorService.formatDisponibilidadEquipo(data));
          return true;
        }

        case 'sin_asignar': {
          const data = await vendorService.getLeadsSinAsignar();
          await this.twilio.sendWhatsAppMessage(from, vendorService.formatLeadsSinAsignar(data));
          return true;
        }

        case 'citas_equipo': {
          const data = await vendorService.getCitasEquipoHoy();
          await this.twilio.sendWhatsAppMessage(from, vendorService.formatCitasEquipoHoy(data));
          return true;
        }

        case 'equipo_hoy': {
          const data = await vendorService.getEquipoHoy();
          await this.twilio.sendWhatsAppMessage(from, vendorService.formatEquipoHoy(data));
          return true;
        }

        case 'asignar':
        case 'reasignar': {
          const { nombreLead, nombreVendedor: targetVendedor } = result.params;
          const asignacion = await vendorService.asignarLeadAVendedor(nombreLead, targetVendedor);
          if (asignacion.success) {
            await this.twilio.sendWhatsAppMessage(from, vendorService.formatAsignacionExitosa(asignacion.lead, asignacion.vendedor));
          } else {
            await this.twilio.sendWhatsAppMessage(from, `❌ ${asignacion.error}`);
          }
          return true;
        }

        case 'agendar_con': {
          const { nombreLead, nombreVendedor: targetVendedor, fecha } = result.params;
          const cita = await vendorService.agendarCitaConVendedor(nombreLead, targetVendedor, fecha);
          if (cita.success) {
            await this.twilio.sendWhatsAppMessage(from, vendorService.formatCitaAgendadaConVendedor(cita.lead, cita.vendedor, fecha));
          } else {
            await this.twilio.sendWhatsAppMessage(from, `❌ ${cita.error}`);
          }
          return true;
        }

        case 'nuevo': {
          const { nombre, telefono } = result.params;
          const crear = await vendorService.crearLeadCoordinador(nombre, telefono);
          if (crear.success) {
            await this.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreado(crear.lead));
          } else {
            await this.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
          }
          return true;
        }

        case 'nuevo_para': {
          const { nombre, telefono, nombreVendedor: targetVendedor } = result.params;
          const crear = await vendorService.crearYAsignarLead(nombre, telefono, targetVendedor);
          if (crear.success) {
            await this.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreadoYAsignado(crear.lead, crear.vendedor));
            // Notificar al vendedor
            if (crear.vendedor?.phone) {
              const vendedorPhone = crear.vendedor.phone.replace(/[^0-9]/g, '');
              const notif = `🆕 *NUEVO LEAD ASIGNADO*\n\n👤 *${crear.lead.name}*\n📱 ${crear.lead.phone}\n\n¡Contáctalo pronto!`;
              await this.meta.sendWhatsAppMessage(vendedorPhone, notif);
            }
          } else {
            await this.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
          }
          return true;
        }

        case 'nuevo_completo': {
          const { nombre, telefono, desarrollo, nombreVendedor: targetVendedor } = result.params;
          const crear = await vendorService.crearYAsignarLead(nombre, telefono, targetVendedor, desarrollo);
          if (crear.success) {
            await this.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreadoYAsignado(crear.lead, crear.vendedor));
            // Notificar al vendedor con el desarrollo de interés
            if (crear.vendedor?.phone) {
              const vendedorPhone = crear.vendedor.phone.replace(/[^0-9]/g, '');
              const notif = `🆕 *NUEVO LEAD ASIGNADO*\n\n👤 *${crear.lead.name}*\n📱 ${crear.lead.phone}\n🏠 Interés: *${desarrollo}*\n\n¡Contáctalo pronto!`;
              await this.meta.sendWhatsAppMessage(vendedorPhone, notif);
            }
          } else {
            await this.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
          }
          return true;
        }

        case 'nuevo_interes': {
          const { nombre, telefono, desarrollo } = result.params;
          const crear = await vendorService.crearLeadConInteres(nombre, telefono, desarrollo);
          if (crear.success) {
            await this.twilio.sendWhatsAppMessage(from, vendorService.formatLeadCreadoConInteres(crear.lead));
          } else {
            await this.twilio.sendWhatsAppMessage(from, `❌ ${crear.error}`);
          }
          return true;
        }

        default:
          return false;
      }
    } catch (error) {
      console.error('❌ Error en comando coordinador:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al procesar comando. Intenta de nuevo.');
      return true;
    }
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
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🆕 APROBAR SUGERENCIA: Si vendedor responde "ok" a una alerta
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const mensajeLimpio = body.trim().toLowerCase();
    if (['ok', 'si', 'sí', 'enviar', 'dale', 'va'].includes(mensajeLimpio)) {
      // Buscar si hay un lead con sugerencia pendiente para este vendedor
      const { data: leadConSugerencia } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .eq('notes->>alerta_vendedor_id', vendedor.id)
        .not('notes->>sugerencia_pendiente', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (leadConSugerencia?.notes?.sugerencia_pendiente) {
        const sugerencia = leadConSugerencia.notes.sugerencia_pendiente;
        const notasActuales = leadConSugerencia.notes || {};

        // Enviar el mensaje sugerido al lead
        await this.meta.sendWhatsAppMessage(leadConSugerencia.phone, sugerencia);

        // Limpiar la sugerencia pendiente
        delete notasActuales.sugerencia_pendiente;
        delete notasActuales.alerta_vendedor_id;
        await this.supabase.client.from('leads')
          .update({ notes: notasActuales })
          .eq('id', leadConSugerencia.id);

        // Registrar actividad del vendedor
        await this.supabase.client.from('lead_activities').insert({
          lead_id: leadConSugerencia.id,
          team_member_id: vendedor.id,
          activity_type: 'message_sent',
          description: `Mensaje de seguimiento enviado (sugerencia aprobada)`,
          metadata: { mensaje: sugerencia.substring(0, 100) }
        });

        // Confirmar al vendedor
        const nombreLead = leadConSugerencia.name || 'lead';
        await this.twilio.sendWhatsAppMessage(from,
          `✅ *Mensaje enviado a ${nombreLead}*\n\n` +
          `"${sugerencia.substring(0, 80)}..."\n\n` +
          `💡 Usa *bridge ${nombreLead.split(' ')[0]}* si responde y quieres continuar la conversación.`
        );

        console.log(`✅ Vendedor ${nombreVendedor} aprobó sugerencia para lead ${leadConSugerencia.phone}`);
        return true;
      }
    }

    // Si el vendedor escribe un mensaje personalizado (no es comando conocido),
    // verificar si hay sugerencia pendiente y usarlo como mensaje
    const { data: leadPendiente } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .eq('notes->>alerta_vendedor_id', vendedor.id)
      .not('notes->>sugerencia_pendiente', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    const vendorService = new VendorCommandsService(this.supabase);
    const result = vendorService.detectRouteCommand(body, mensaje);

    // Si hay sugerencia pendiente y el mensaje NO es un comando conocido,
    // tratarlo como mensaje personalizado para enviar al lead
    if (leadPendiente?.notes?.sugerencia_pendiente && !result.matched) {
      const notasActuales = leadPendiente.notes || {};

      // Enviar el mensaje personalizado del vendedor al lead
      await this.meta.sendWhatsAppMessage(leadPendiente.phone, body);

      // Limpiar la sugerencia pendiente
      delete notasActuales.sugerencia_pendiente;
      delete notasActuales.alerta_vendedor_id;
      await this.supabase.client.from('leads')
        .update({ notes: notasActuales })
        .eq('id', leadPendiente.id);

      // Registrar actividad del vendedor
      await this.supabase.client.from('lead_activities').insert({
        lead_id: leadPendiente.id,
        team_member_id: vendedor.id,
        activity_type: 'message_sent',
        description: `Mensaje personalizado de seguimiento`,
        metadata: { mensaje: body.substring(0, 100) }
      });

      // Confirmar al vendedor
      const nombreLead = leadPendiente.name || 'lead';
      await this.twilio.sendWhatsAppMessage(from,
        `✅ *Tu mensaje fue enviado a ${nombreLead}*\n\n` +
        `💡 Usa *bridge ${nombreLead.split(' ')[0]}* para continuar la conversación.`
      );

      console.log(`✅ Vendedor ${nombreVendedor} envió mensaje personalizado a lead ${leadPendiente.phone}`);
      return true;
    }

    if (!result.matched) {
      return false;
    }

    const params = result.handlerParams || {};

    // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
    const handlerResult = await vendorService.executeHandler(
      result.handlerName!,
      vendedor,
      nombreVendedor,
      params
    );

    // Si el servicio manejó el comando exitosamente, enviar mensaje
    if (handlerResult.message) {
      await this.twilio.sendWhatsAppMessage(from, handlerResult.message);
      return true;
    }

    // Si hay error pero no necesita handler externo, mostrar error
    if (handlerResult.error && !handlerResult.needsExternalHandler) {
      await this.twilio.sendWhatsAppMessage(from, handlerResult.error);
      return true;
    }

    // ━━━ FALLBACK: Handlers que requieren lógica externa (múltiples envíos, media, etc.) ━━━
    switch (result.handlerName) {
      // ━━━ VENTAS Y ETAPAS (envían a múltiples destinos) ━━━
      case 'vendedorRegistrarApartado':
        await this.vendedorRegistrarApartado(from, body, vendedor, params.match);
        break;
      case 'vendedorCambiarEtapa':
        await this.vendedorCambiarEtapa(from, body, vendedor, params.etapa, params.texto);
        break;
      case 'vendedorCerrarVenta':
        await this.vendedorCerrarVenta(from, body, vendedor, nombreVendedor);
        break;
      case 'vendedorMoverEtapa':
        await this.vendedorMoverEtapa(from, body, mensaje, vendedor, nombreVendedor);
        break;
      case 'vendedorCancelarLead':
        await this.vendedorCancelarLead(from, body, vendedor, nombreVendedor);
        break;

      // ━━━ HIPOTECA Y ASESORES (interactúan con externos) ━━━
      case 'vendedorEnviarABanco':
        await this.vendedorEnviarABanco(from, body, vendedor);
        break;
      case 'vendedorConfirmarEnvioABanco':
        await this.vendedorConfirmarEnvioABanco(from, body, vendedor);
        break;
      case 'vendedorConsultarCredito':
        await this.vendedorConsultarCredito(from, params.nombre || body, vendedor);
        break;
      case 'vendedorPreguntarAsesor':
        await this.vendedorPreguntarAsesor(from, params.nombre, vendedor, teamMembers);
        break;
      case 'vendedorAsignarAsesor':
        await this.vendedorAsignarAsesor(from, params.nombre, vendedor, teamMembers, params.telefono);
        break;

      // ━━━ CITAS (flujos complejos) ━━━
      case 'vendedorAgendarCitaCompleta':
        await this.vendedorAgendarCitaCompleta(from, body, vendedor, nombreVendedor);
        break;
      case 'vendedorAgendarCita':
        await this.vendedorAgendarCita(from, body, vendedor, nombreVendedor);
        break;
      case 'vendedorCancelarCita':
        await this.vendedorCancelarCita(from, body, vendedor, nombreVendedor);
        break;
      case 'vendedorReagendarCita':
        await this.vendedorReagendarCita(from, body, vendedor, nombreVendedor);
        break;

      // ━━━ LEADS (crean/actualizan entidades) ━━━
      case 'vendedorCrearLead':
        await this.vendedorCrearLead(from, body, vendedor, nombreVendedor);
        break;
      case 'crearLeadDesdeWhatsApp':
        await this.crearLeadDesdeWhatsApp(from, params.nombre, params.telefono, vendedor);
        break;
      case 'vendedorGuardarCumple':
        await this.vendedorGuardarCumple(from, params.match, vendedor);
        break;
      case 'vendedorGuardarEmail':
        await this.vendedorGuardarEmail(from, params.match, vendedor);
        break;
      case 'vendedorRegistrarReferido':
        await this.vendedorRegistrarReferido(from, params.match, vendedor);
        break;

      // ━━━ NOTAS Y ACTIVIDADES ━━━
      case 'vendedorAgregarNota':
        await this.vendedorAgregarNotaConParams(from, params.nombreLead, params.textoNota, vendedor, nombreVendedor);
        break;
      case 'vendedorVerNotas':
        await this.vendedorVerNotasConParams(from, params.nombreLead, vendedor, nombreVendedor);
        break;

      // ━━━ FOLLOW-UP PENDIENTE: APROBAR / CANCELAR / EDITAR ━━━
      case 'vendedorAprobarFollowup':
        await this.vendedorAprobarFollowup(from, params.nombreLead, vendedor, nombreVendedor);
        break;
      case 'vendedorCancelarFollowup':
        await this.vendedorCancelarFollowup(from, params.nombreLead, vendedor, nombreVendedor);
        break;
      case 'vendedorEditarFollowup':
        await this.vendedorEditarFollowup(from, params.nombreLead, params.nuevoMensaje, vendedor, nombreVendedor);
        break;

      case 'registrarActividad':
        await this.registrarActividad(from, params.nombre, params.tipo, vendedor, params.monto);
        break;
      case 'mostrarActividadesHoy':
        await this.mostrarActividadesHoy(from, vendedor);
        break;
      case 'mostrarHistorialLead':
        await this.mostrarHistorialLead(from, params.nombre, vendedor);
        break;

      // ━━━ LLAMADAS Y RECORDATORIOS ━━━
      case 'vendedorLlamar':
        await this.vendedorLlamar(from, params.nombre, vendedor, nombreVendedor);
        break;
      case 'vendedorProgramarLlamada':
        await this.vendedorProgramarLlamada(from, params.nombre, params.cuando, vendedor, nombreVendedor);
        break;
      case 'vendedorLlamadasPendientes':
        await this.vendedorLlamadasPendientes(from, vendedor, nombreVendedor);
        break;
      case 'vendedorCrearRecordatorio':
        await this.vendedorCrearRecordatorio(from, params.texto, vendedor, nombreVendedor);
        break;

      // ━━━ BRIDGE Y MENSAJES ━━━
      case 'enviarMensajeLead':
        await this.enviarMensajeLead(from, params.nombre, vendedor);
        break;
      case 'bridgeLead':
        await this.ceoBridgeLead(from, params.nombreLead, vendedor, nombreVendedor, params.mensajeInicial);
        break;
      case 'extenderBridge':
        await this.ceoExtenderBridge(from, vendedor, nombreVendedor);
        break;
      case 'cerrarBridge':
        await this.ceoCerrarBridge(from, vendedor, nombreVendedor);
        break;

      // ━━━ MATERIAL Y MEDIA ━━━
      case 'vendedorEnviarMaterial':
        await this.vendedorEnviarMaterial(from, params.desarrollo, body, vendedor);
        break;
      case 'vendedorEnviarInfoALead':
        await this.vendedorEnviarInfoALead(from, params.desarrollo, params.leadNombre, vendedor, nombreVendedor);
        break;
      case 'vendedorPropiedades':
        await this.vendedorPropiedades(from, vendedor);
        break;

      // ━━━ IA Y COACHING ━━━
      case 'vendedorAyudaContextual':
        await this.vendedorAyudaContextual(from, body, nombreVendedor);
        break;
      case 'vendedorCoaching':
        await this.vendedorCoaching(from, params.nombre, vendedor, nombreVendedor);
        break;
      case 'vendedorVerHistorial':
        await this.vendedorVerHistorial(from, params.identificador, vendedor);
        break;

      // ━━━ CONSULTAS ESPECIALES (no en servicio aún) ━━━
      case 'vendedorMisHot':
        await this.vendedorMisHot(from, vendedor, nombreVendedor);
        break;
      case 'vendedorDisponibilidad':
        await this.vendedorDisponibilidad(from, vendedor, nombreVendedor);
        break;
      case 'vendedorBuscarPorTelefono':
        await this.vendedorBuscarPorTelefono(from, params.telefono, vendedor);
        break;

      // ━━━ REPORTES Y CONSULTAS BÁSICAS ━━━
      case 'vendedorCitasHoy':
        await this.vendedorCitasHoy(from, vendedor, nombreVendedor);
        break;
      case 'vendedorResumenLeads':
        await this.vendedorResumenLeads(from, vendedor, nombreVendedor);
        break;
      case 'vendedorResumenHoy':
        await this.vendedorBriefing(from, vendedor, nombreVendedor);
        break;
      case 'vendedorAyuda':
        await this.vendedorAyuda(from, nombreVendedor);
        break;
      case 'vendedorBriefing':
        await this.vendedorBriefing(from, vendedor, nombreVendedor);
        break;
      case 'vendedorMetaAvance':
        await this.vendedorMetaAvance(from, vendedor, nombreVendedor);
        break;
      case 'vendedorQuienEs':
        await this.vendedorQuienEs(from, params.nombre, vendedor);
        break;
      case 'vendedorBrochure':
        await this.vendedorEnviarBrochure(from, params.desarrollo, vendedor);
        break;
      case 'vendedorUbicacion':
        await this.vendedorEnviarUbicacion(from, params.desarrollo, vendedor);
        break;
      case 'vendedorVideo':
        await this.vendedorEnviarVideo(from, params.desarrollo, vendedor);
        break;
      case 'vendedorPasarACredito':
        await this.vendedorPasarACredito(from, params.nombreLead, vendedor);
        break;
      case 'vendedorNuevoLead':
        await this.vendedorNuevoLead(from, params.nombre, params.telefono, params.desarrollo, vendedor);
        break;
      case 'vendedorLeadsHot':
        await this.vendedorLeadsHot(from, vendedor, nombreVendedor);
        break;
      case 'vendedorLeadsPendientes':
        await this.vendedorLeadsPendientes(from, vendedor, nombreVendedor);
        break;

      default:
        console.log('Handler vendedor no reconocido (fallback):', result.handlerName);
        return false;
    }

    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VENDEDOR CERRAR BRIDGE - Terminar chat directo y mensajes pendientes
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async vendedorCerrarBridge(from: string, vendedor: any, nombreVendedor: string): Promise<void> {
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');
    console.log(`🔒 Vendedor ${nombreVendedor} quiere cerrar conexiones`);

    try {
      // Obtener notas del vendedor
      const { data: vendedorData } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .single();

      const notes = vendedorData?.notes ?
        (typeof vendedorData.notes === 'string' ? JSON.parse(vendedorData.notes) : vendedorData.notes) : {};

      let cerradoAlgo = false;
      let leadsAfectados: string[] = [];

      // ═══ 1. CERRAR BRIDGE ACTIVO ═══
      if (notes.active_bridge) {
        const bridgeInfo = notes.active_bridge;
        delete notes.active_bridge;

        const { data: leadData } = await this.supabase.client
          .from('leads')
          .select('id, name, notes')
          .eq('id', bridgeInfo.lead_id)
          .single();

        if (leadData) {
          const leadNotes = leadData.notes ?
            (typeof leadData.notes === 'string' ? JSON.parse(leadData.notes) : leadData.notes) : {};
          delete leadNotes.active_bridge_to_vendedor;
          await this.supabase.client
            .from('leads')
            .update({ notes: leadNotes })
            .eq('id', leadData.id);

          leadsAfectados.push(bridgeInfo.lead_name || 'lead');

          const leadPhone = bridgeInfo.lead_phone?.replace(/\D/g, '');
          if (leadPhone) {
            await this.meta.sendWhatsAppMessage(leadPhone,
              `Listo, si necesitas algo más aquí estoy para ayudarte. 🏠`
            );
          }
        }
        cerradoAlgo = true;
        console.log(`🔒 Bridge cerrado: ${vendedor.name} ↔ ${bridgeInfo.lead_name}`);
      }

      // ═══ 2. LIMPIAR pending_response_to DE LEADS ═══
      const { data: leadsConPending } = await this.supabase.client
        .from('leads')
        .select('id, name, notes')
        .not('notes', 'is', null);

      for (const lead of leadsConPending || []) {
        let leadNotes: any = {};
        try {
          leadNotes = lead.notes ?
            (typeof lead.notes === 'string' ? JSON.parse(lead.notes) : lead.notes) : {};
        } catch (e) {
          console.error(`⚠️ Error parseando notas de ${lead.name}, saltando`);
          continue;
        }

        if (leadNotes.pending_response_to?.team_member_id === vendedor.id) {
          delete leadNotes.pending_response_to;
          await this.supabase.client
            .from('leads')
            .update({ notes: leadNotes })
            .eq('id', lead.id);

          if (!leadsAfectados.includes(lead.name)) {
            leadsAfectados.push(lead.name);
          }
          cerradoAlgo = true;
          console.log(`🔒 pending_response_to limpiado de: ${lead.name}`);
        }
      }

      // Guardar notas del vendedor
      await this.supabase.client
        .from('team_members')
        .update({ notes })
        .eq('id', vendedor.id);

      if (cerradoAlgo) {
        await this.meta.sendWhatsAppMessage(cleanPhone,
          `✅ Listo, cerrado.\n\n` +
          `Para reconectar: *bridge ${leadsAfectados[0] || 'nombre'}*`
        );
      } else {
        await this.meta.sendWhatsAppMessage(cleanPhone,
          `ℹ️ No tienes conexiones activas.`
        );
      }

    } catch (e) {
      console.error('❌ Error en vendedorCerrarBridge:', e);
      await this.meta.sendWhatsAppMessage(cleanPhone, `❌ Error al cerrar conexiones.`);
    }
  }

  /**
   * Guarda cumpleaños de cliente entregado
   */
  private async vendedorGuardarCumple(from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
    const nombreCliente = match[1].trim();
    const dia = match[2].padStart(2, '0');
    const mes = match[3].padStart(2, '0');
    
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .eq('status', 'delivered')
      .ilike('name', '%' + nombreCliente + '%')
      .single();
    
    if (!lead) {
      await this.twilio.sendWhatsAppMessage(from, '❌ No encontré cliente entregado "' + nombreCliente + '"');
      return;
    }
    
    await this.supabase.client.from('leads').update({ birthday: '2000-' + mes + '-' + dia }).eq('id', lead.id);
    await this.twilio.sendWhatsAppMessage(from, '🎂 Cumpleaños de *' + lead.name + '* guardado: *' + dia + '/' + mes + '*');
  }

  /**
   * Guarda email de cliente entregado
   */
  private async vendedorGuardarEmail(from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
    const nombreCliente = match[1].trim();
    const correo = match[2].toLowerCase();
    
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .eq('status', 'delivered')
      .ilike('name', '%' + nombreCliente + '%')
      .single();
    
    if (!lead) {
      await this.twilio.sendWhatsAppMessage(from, '❌ No encontré cliente entregado "' + nombreCliente + '"');
      return;
    }
    
    await this.supabase.client.from('leads').update({ email: correo }).eq('id', lead.id);
    await this.twilio.sendWhatsAppMessage(from, '📧 Email de *' + lead.name + '* guardado: *' + correo + '*');
  }

  /**
   * Registra un referido por vendedor
   */
  private async vendedorRegistrarReferido(from: string, match: RegExpMatchArray, vendedor: any): Promise<void> {
    const nombreReferido = match[1].trim();
    const telReferido = match[2];
    const nombreReferidor = match[3].trim();
    
    const { data: referidor } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('status', 'delivered')
      .ilike('name', '%' + nombreReferidor + '%')
      .single();
    
    await this.supabase.client
      .from('leads')
      .insert({
        name: nombreReferido,
        phone: '52' + telReferido.slice(-10),
        source: 'referido',
        referrer_id: referidor?.id || null,
        assigned_to: vendedor.id,
        status: 'new',
        score: 80,
        notes: { referido_por: nombreReferidor, fecha_referido: new Date().toISOString() }
      });
    
    await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(telReferido),
      '👋 ¡Hola *' + nombreReferido.split(' ')[0] + '*!\n\n' +
      'Tu amigo *' + nombreReferidor.split(' ')[0] + '* te recomendó con nosotros para ayudarte a encontrar tu casa ideal. 🏠\n\n' +
      'Tenemos opciones increíbles para ti.\n\n' +
      'Pronto te contactará uno de nuestros asesores. ¿Mientras tanto, te gustaría ver información de nuestras propiedades?\n\n' +
      'Responde *SÍ* para conocer más.');
    
    await this.twilio.sendWhatsAppMessage(from,
      '✅ *Referido registrado*\n\n' +
      '*' + nombreReferido + '* - ' + telReferido + '\n' +
      '👤 Por: ' + nombreReferidor + '\n\n' +
      'Ya le enviamos mensaje de bienvenida.');
  }

  /**
   * Mueve lead en el funnel (siguiente/anterior/específico)
   */
  private async vendedorMoverEtapa(from: string, body: string, mensaje: string, vendedor: any, nombreVendedor: string): Promise<void> {
    const vendorService = new VendorCommandsService(this.supabase);
    let nombreLead: string | null = null;
    let direccion: 'next' | 'prev' | null = null;

    // Formato 1: "[nombre] adelante/al siguiente"
    let match = body.match(/^([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:al?\s+)?(?:siguiente|proximo|próximo|avanzar|adelante)$/i);
    if (match) {
      nombreLead = match[1].trim();
      direccion = 'next';
    }

    // Formato 2: "adelante/avanzar [nombre]"
    if (!nombreLead) {
      match = body.match(/^(?:adelante|avanzar|siguiente|proximo|próximo)\s+(.+)$/i);
      if (match) {
        nombreLead = match[1].trim();
        direccion = 'next';
      }
    }

    // Formato 3: "[nombre] atrás/anterior"
    if (!nombreLead) {
      match = body.match(/^([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:para\s+)?(?:atras|atrás|regresar|anterior)$/i);
      if (match) {
        nombreLead = match[1].trim();
        direccion = 'prev';
      }
    }

    // Formato 4: "atrás/regresar [nombre]"
    if (!nombreLead) {
      match = body.match(/^(?:atras|atrás|regresar|anterior)\s+(.+)$/i);
      if (match) {
        nombreLead = match[1].trim();
        direccion = 'prev';
      }
    }

    if (nombreLead && direccion) {
      console.log(`📌 Mover lead: "${nombreLead}" ${direccion}`);
      const result = await vendorService.moveFunnelStep(nombreLead, vendedor.id, vendedor.role, direccion);
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || 'Error al mover lead');
        return;
      }
      if (result.multipleLeads) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeads(result.multipleLeads));
        return;
      }
      // Enviar confirmación directamente
      const etapaLabel = vendorService.getFunnelStageLabel(result.newStatus!);
      await this.twilio.sendWhatsAppMessage(from,
        `✅ *${result.lead!.name}* movido a ${etapaLabel}`
      );
      return;
    }

    // Formato: "Hilda atrás" - formato legacy
    const matchAtras = body.match(/(?:regresar\s+(?:a\s+)?)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:para\s+)?(?:atras|atrás|regresar|anterior)/i);
    if (matchAtras) {
      const result = await vendorService.moveFunnelStep(matchAtras[1].trim(), vendedor.id, vendedor.role, 'prev');
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || 'Error al mover lead');
        return;
      }
      if (result.multipleLeads) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeads(result.multipleLeads));
        return;
      }
      const etapaLabel = vendorService.getFunnelStageLabel(result.newStatus!);
      await this.twilio.sendWhatsAppMessage(from,
        `✅ *${result.lead!.name}* movido a ${etapaLabel}`
      );
      return;
    }

    // Formato: "Hilda pasó a negociación"
    let matchEtapa = body.match(/^([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s*(?:pasó a|paso a|pasa a)\s*(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
    if (!matchEtapa) {
      matchEtapa = body.match(/(?:mover|mueve)\s+a?\s*([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:de\s+\w+\s+)?a\s+(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
    }
    
    if (matchEtapa) {
      const nombreLead = matchEtapa[1].trim();
      const etapaRaw = matchEtapa[2].toLowerCase();
      const etapaMap: Record<string, {key: string, label: string}> = {
        'contactado': {key: 'contacted', label: '📌 CONTACTADO'},
        'cita': {key: 'scheduled', label: '📅 CITA'},
        'scheduled': {key: 'scheduled', label: '📅 CITA'},
        'visitó': {key: 'visited', label: '🏠 VISITÓ'},
        'visito': {key: 'visited', label: '🏠 VISITÓ'},
        'negociación': {key: 'negotiation', label: '💰 NEGOCIACIÓN'},
        'negociacion': {key: 'negotiation', label: '💰 NEGOCIACIÓN'},
        'reservado': {key: 'reserved', label: '📝 RESERVADO'},
        'cerrado': {key: 'closed', label: '✅ CERRADO'},
        'entregado': {key: 'delivered', label: '🏠 ENTREGADO'},
        'nuevo': {key: 'new', label: '📌 NUEVO'},
        'new': {key: 'new', label: '📌 NUEVO'}
      };
      const etapa = etapaMap[etapaRaw];
      if (etapa) {
        await this.vendedorCambiarEtapaConNombre(from, nombreLead, vendedor, etapa.key, etapa.label);
        return;
      }
    }

    await this.twilio.sendWhatsAppMessage(from, 
      `📌 *Para cambiar etapa escribe:*\n\n"[nombre] pasó a [etapa]"\n\n*Etapas:* contactado, cita, visitó, negociación, reservado, cerrado, entregado\n\n*Ejemplo:*\n• "Juan pasó a negociación"\n• "Mover María a reservado"\n• "Hilda al siguiente"`
    );
  }


  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DEL ASISTENTE VENDEDOR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VER LEADS POR TIPO - compradores, caídos, inactivos, todos, archivados
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async verLeadsPorTipo(from: string, vendedor: any, tipo: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
      const result = await vendorService.getLeadsPorTipo(vendedor.id, esAdmin, tipo);
      const mensaje = vendorService.formatLeadsPorTipo(result);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error en verLeadsPorTipo:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads. Intenta de nuevo.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ARCHIVAR/DESARCHIVAR LEAD - Para spam, números erróneos, etc
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async archivarDesarchivarLead(from: string, nombreLead: string, vendedor: any, archivar: boolean): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
      const result = await vendorService.archivarDesarchivarLead(nombreLead, vendedor.id, esAdmin, archivar);

      if (!result.success) {
        if (result.multipleLeads) {
          const msg = vendorService.formatMultipleLeadsArchivar(result.multipleLeads);
          await this.twilio.sendWhatsAppMessage(from, msg);
        } else {
          await this.twilio.sendWhatsAppMessage(from, result.error || '❌ Error.');
        }
        return;
      }

      const mensaje = vendorService.formatArchivarExito(result.lead, archivar);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error en archivarDesarchivarLead:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error. Intenta de nuevo.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REACTIVAR LEAD - Cambiar de fallen a new
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async reactivarLead(from: string, nombreLead: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
      const result = await vendorService.reactivarLead(nombreLead, vendedor.id, esAdmin);

      if (!result.success) {
        if (result.multipleLeads) {
          const msg = vendorService.formatMultipleLeadsReactivar(result.multipleLeads);
          await this.twilio.sendWhatsAppMessage(from, msg);
        } else {
          await this.twilio.sendWhatsAppMessage(from, result.error || '❌ Error.');
        }
        return;
      }

      const mensaje = vendorService.formatReactivarExito(result.lead);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error en reactivarLead:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error. Intenta de nuevo.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ENVIAR MATERIAL DE VENTAS - Brochure, video, ubicación
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async vendedorEnviarMaterial(from: string, desarrollo: string, mensaje: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.buscarMaterialDesarrollo(desarrollo);

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || '❌ Error buscando desarrollo.');
        return;
      }

      const material = vendorService.getMaterialDisponible(result.property, mensaje);
      let materialesEnviados = 0;

      if (material.pideBrochure) {
        const brochureUrl = this.getBrochureUrl(material.nombreDesarrollo);
        if (brochureUrl) {
          await this.twilio.sendWhatsAppMessage(from, `📌 *Brochure ${material.nombreDesarrollo}:*\n${brochureUrl}`);
          materialesEnviados++;
        }
      }

      if (material.pideVideo && material.youtubeLink) {
        await this.twilio.sendWhatsAppMessage(from, `📌 *Video ${material.nombreDesarrollo}:*\n${material.youtubeLink}`);
        materialesEnviados++;
      }

      if (material.pideUbicacion && material.gpsLink) {
        await this.twilio.sendWhatsAppMessage(from, `📌 *Ubicación ${material.nombreDesarrollo}:*\n${material.gpsLink}`);
        materialesEnviados++;
      }

      if (material.pideRecorrido && material.matterportLink) {
        await this.twilio.sendWhatsAppMessage(from, `🏠 *Recorrido 3D ${material.nombreDesarrollo}:*\n${material.matterportLink}`);
        materialesEnviados++;
      }

      if (materialesEnviados === 0) {
        const pidio = mensaje.toLowerCase().includes('video') ? 'video registrado' :
                      mensaje.toLowerCase().includes('ubicaci') ? 'ubicación GPS registrada' :
                      mensaje.toLowerCase().includes('recorrido') ? 'recorrido 3D registrado' : 'ese material';
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMaterialNoDisponible(material, pidio));
      }
    } catch (error) {
      console.error('Error en vendedorEnviarMaterial:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error al buscar material.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MODO ASISTENTE ASESOR HIPOTECARIO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async handleAsesorMessage(from: string, body: string, asesor: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreAsesor = asesor.name?.split(' ')[0] || 'crack';
    console.log('🏦 Asesor Command:', mensaje);

    const asesorService = new AsesorCommandsService(this.supabase);

    // Verificar notas del asesor para pendientes
    const { data: asesorActualizado } = await this.supabase.client
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
          await this.meta.sendWhatsAppMessage(from, selectionResult.respuesta!);
          return;
        }

        if (notes?.pending_message_to_lead) {
          console.log('📤 Asesor enviando mensaje pendiente a lead:', notes.pending_message_to_lead.lead_name);
          await this.enviarMensajePendienteLead(from, body, asesor, notes.pending_message_to_lead);
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
            await this.supabase.client
              .from('team_members')
              .update({ notes })
              .eq('id', asesor.id);

            if (action === 'cancelar') {
              // Ejecutar cancelación con el lead seleccionado por ID
              const schedulingService = new AppointmentSchedulingService(this.supabase, this.calendar);
              const result = await schedulingService.cancelarCitaPorId(selectedLead.id, selectedLead.name, asesor);

              if (!result.success) {
                await this.meta.sendWhatsAppMessage(from, `⚠️ ${result.error || 'No se pudo cancelar la cita'}`);
              } else {
                // Confirmar cancelación
                await this.meta.sendWhatsAppMessage(from, schedulingService.formatCancelarCitaExito(result));

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
                  await this.supabase.client
                    .from('team_members')
                    .update({ notes: currentNotes })
                    .eq('id', asesor.id);

                  await this.meta.sendWhatsAppMessage(from,
                    `📱 *¿Deseas notificar a ${result.leadName} de la cancelación?*\n\n` +
                    `1️⃣ Sí, enviar mensaje\n` +
                    `2️⃣ No, yo le aviso`
                  );
                }
              }
              return;
            } else if (action === 'reagendar') {
              // Pedir fecha/hora para reagendar
              await this.meta.sendWhatsAppMessage(from,
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
      await this.twilio.sendWhatsAppMessage(pendingQuestion.notes.from_vendedor_phone, result.mensajeVendedor);
      await this.twilio.sendWhatsAppMessage(from, result.confirmacion);
      return;
    }

    // Detectar comando usando el servicio
    const result = asesorService.detectCommand(mensaje, body, nombreAsesor);

    switch (result.action) {
      case 'send_message':
        await this.twilio.sendWhatsAppMessage(from, result.message!);
        return;

      case 'call_handler':
        await this.executeAsesorHandler(from, body, asesor, nombreAsesor, teamMembers, result.handlerName!, result.handlerParams);
        return;
    }
  }

  private async executeAsesorHandler(from: string, body: string, asesor: any, nombreAsesor: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
    const asesorService = new AsesorCommandsService(this.supabase);

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
        await this.meta.sendWhatsAppMessage(
          handlerResult.leadPhone.replace(/\D/g, ''),
          handlerResult.leadMessage
        );
        console.log(`📤 Mensaje enviado a lead ${handlerResult.leadPhone}`);
      }

      // Notificar vendedor si es necesario
      if (handlerResult.vendedorPhone && handlerResult.vendedorMessage) {
        const vendedorPhoneClean = handlerResult.vendedorPhone.replace(/\D/g, '');
        const phoneSuffix = vendedorPhoneClean.slice(-10);

        // Si el handler ya verificó la ventana 24h, usar ese valor
        // Si no, hacer el lookup
        let dentroVentana24h = handlerResult.vendedorDentro24h;
        let nombreVendedor = 'Equipo';
        let vendedorId: string | undefined;

        if (dentroVentana24h === undefined) {
          // Buscar vendedor por teléfono para verificar ventana 24h
          const { data: vendedorData } = await this.supabase.client
            .from('team_members')
            .select('id, name, last_sara_interaction')
            .like('phone', `%${phoneSuffix}`)
            .single();

          vendedorId = vendedorData?.id;
          nombreVendedor = vendedorData?.name?.split(' ')[0] || 'Equipo';
          const lastInteraction = vendedorData?.last_sara_interaction;
          const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          dentroVentana24h = lastInteraction && lastInteraction > hace24h;
          console.log(`🔍 Vendedor ${nombreVendedor}: last_interaction=${lastInteraction}, dentro24h=${dentroVentana24h}`);
        } else {
          console.log(`🔍 Vendedor: usando ventana24h del handler = ${dentroVentana24h}`);
          // Obtener ID para guardar pending_notification si es necesario
          const { data: vendedorData } = await this.supabase.client
            .from('team_members')
            .select('id, name')
            .like('phone', `%${phoneSuffix}`)
            .single();
          vendedorId = vendedorData?.id;
          nombreVendedor = vendedorData?.name?.split(' ')[0] || 'Equipo';
        }

        if (dentroVentana24h) {
          // Dentro de ventana 24h: enviar mensaje normal
          await this.meta.sendWhatsAppMessage(vendedorPhoneClean, handlerResult.vendedorMessage);
          console.log(`📤 Mensaje enviado a vendedor ${handlerResult.vendedorPhone}`);
        } else {
          // Fuera de ventana 24h: guardar notificación pendiente y enviar template de reactivación
          console.error(`⚠️ Vendedor ${vendedorPhoneClean} fuera de ventana 24h, guardando notificación pendiente`);
          try {
            // Guardar la notificación pendiente en notes del vendedor
            if (vendedorId) {
              const { data: vendedorFull } = await this.supabase.client
                .from('team_members')
                .select('notes')
                .eq('id', vendedorId)
                .single();

              if (vendedorFull) {
                const currentNotes = typeof vendedorFull.notes === 'object' ? vendedorFull.notes : {};
                await this.supabase.client
                  .from('team_members')
                  .update({
                    notes: {
                      ...currentNotes,
                      pending_notification: {
                        message: handlerResult.vendedorMessage,
                        created_at: new Date().toISOString()
                      }
                    }
                  })
                  .eq('id', vendedorId);
                console.log(`📝 Notificación pendiente guardada para ${nombreVendedor}`);
              }
            }

            // Enviar template de reactivación
            await this.meta.sendTemplate(vendedorPhoneClean, 'reactivar_equipo', 'es_MX', [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: nombreVendedor }
                ]
              }
            ], true); // bypassRateLimit=true para notificaciones
            console.log(`📤 Template reactivar_equipo enviado a vendedor ${vendedorPhoneClean}`);
          } catch (templateErr) {
            console.error('❌ Error enviando template a vendedor:', templateErr);
          }
        }
      }

      // Responder al asesor
      await this.meta.sendWhatsAppMessage(from.replace('whatsapp:', '').replace('+', ''), handlerResult.message);
      return;
    }

    // Error sin necesidad de handler externo
    if (handlerResult.error && !handlerResult.needsExternalHandler) {
      await this.twilio.sendWhatsAppMessage(from, handlerResult.error);
      return;
    }

    // ━━━ FALLBACK: Handlers que requieren lógica externa ━━━
    switch (handlerName) {
      // ━━━ CITAS ━━━
      case 'asesorAgendarCita':
        await this.asesorAgendarCita(from, body, asesor, nombreAsesor);
        break;
      case 'vendedorCancelarCita':
        await this.vendedorCancelarCita(from, body, asesor, nombreAsesor);
        break;
      case 'vendedorReagendarCita':
        await this.vendedorReagendarCita(from, body, asesor, nombreAsesor);
        break;
      case 'vendedorAgendarCitaCompleta':
        await this.vendedorAgendarCitaCompleta(from, body, asesor, nombreAsesor);
        break;

      // ━━━ CREAR LEAD ━━━
      case 'asesorCrearLeadHipoteca':
        await this.asesorCrearLeadHipoteca(from, body, asesor, nombreAsesor, teamMembers);
        break;

      // ━━━ TELÉFONO / MENSAJE ━━━
      case 'mostrarTelefonoLead':
        await this.mostrarTelefonoLead(from, params.nombreLead, asesor);
        break;
      case 'enviarMensajeLead':
        await this.enviarMensajeLead(from, params.nombreLead, asesor);
        break;

      default:
        console.log('Handler Asesor no reconocido:', handlerName);
        await this.asesorAyuda(from, nombreAsesor);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ASESOR CREAR LEAD HIPOTECA
  // Formato: "nuevo Juan Garcia 5512345678 para Edson" o "nuevo Juan Garcia 5512345678"
  // ═══════════════════════════════════════════════════════════════
  private async asesorCrearLeadHipoteca(from: string, body: string, asesor: any, nombre: string, teamMembers: any[]): Promise<void> {
    try {
      const asesorService = new AsesorCommandsService(this.supabase);

      // Parsear el comando
      const parsed = asesorService.parseCrearLeadHipoteca(body);
      if (!parsed) {
        await this.twilio.sendWhatsAppMessage(from, asesorService.getMensajeAyudaCrearLeadHipoteca());
        return;
      }

      // Verificar si ya existe
      const { existe, lead: leadExistente } = await asesorService.verificarLeadExistente(parsed.telefono);
      if (existe) {
        await this.twilio.sendWhatsAppMessage(from, asesorService.formatLeadYaExiste(leadExistente));
        return;
      }

      // Buscar vendedor
      let vendedorAsignado: any = null;
      let asignadoPorRoundRobin = false;

      if (parsed.nombreVendedor) {
        const vendedores = asesorService.buscarVendedorPorNombre(teamMembers, parsed.nombreVendedor);
        if (vendedores.length === 0) {
          await this.twilio.sendWhatsAppMessage(from, asesorService.formatVendedorNoEncontrado(parsed.nombreVendedor, teamMembers));
          return;
        }
        vendedorAsignado = vendedores[0];
      } else {
        vendedorAsignado = await asesorService.getVendedorRoundRobin(teamMembers);
        asignadoPorRoundRobin = true;
      }

      if (!vendedorAsignado) {
        await this.twilio.sendWhatsAppMessage(from, '❌ No hay vendedores activos disponibles.');
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
        await this.twilio.sendWhatsAppMessage(from, `❌ Error: ${error || 'No se pudo crear el lead'}`);
        return;
      }

      // Notificar al vendedor
      if (vendedorAsignado.phone) {
        const vendedorPhone = vendedorAsignado.phone.replace(/\D/g, '');
        const msgVendedor = asesorService.formatNotificacionVendedorNuevoLead(parsed.nombreLead, parsed.telefono, asesor.name);
        await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(vendedorPhone), msgVendedor);
      }

      // Confirmar al asesor
      const mensaje = asesorService.formatLeadHipotecaCreado(parsed.nombreLead, parsed.telefono, vendedorAsignado.name, asignadoPorRoundRobin);
      await this.twilio.sendWhatsAppMessage(from, mensaje);

    } catch (error) {
      console.error('Error en asesorCrearLeadHipoteca:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error al crear lead.');
    }
  }

  private async asesorAyuda(from: string, nombre: string): Promise<void> {
    const asesorService = new AsesorCommandsService(this.supabase);
    const mensaje = asesorService.getMensajeAyuda(nombre);
    await this.twilio.sendWhatsAppMessage(from, mensaje);
  }

  private async asesorAgendarCita(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    const asesorService = new AsesorCommandsService(this.supabase);
    const datosCita = asesorService.parseAgendarCita(body);

    if (!datosCita) {
      await this.twilio.sendWhatsAppMessage(from, asesorService.getMensajeAyudaAgendarCita());
      return;
    }

    // Buscar o crear lead
    const { leadId, leadName, leadPhone } = await asesorService.buscarOCrearLead(datosCita.nombreLead, datosCita.telefono);

    // Crear cita
    const { error } = await asesorService.crearCitaHipoteca(datosCita, asesor.id, asesor.name, leadId, leadName, leadPhone);

    if (error) {
      await this.twilio.sendWhatsAppMessage(from, `❌ Error: ${error}`);
      return;
    }

    // Google Calendar
    try {
      const calData = asesorService.getEventoCalendarData(datosCita.fecha, leadName, leadPhone, datosCita.lugar);
      const formatDate = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
      };

      await this.calendar.createEvent({
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
    await this.twilio.sendWhatsAppMessage(from, mensaje);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MOTIVO DE CAÍDA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorMotivoRespuesta(from: string, opcion: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.procesarMotivoRespuesta(opcion, vendedor.id);

      if (!result.success) {
        if (result.error) {
          await this.twilio.sendWhatsAppMessage(from, result.error);
        }
        return;
      }

      if (result.needsCustomReason) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatPedirMotivoCustom());
        return;
      }

      const mensaje = vendorService.formatMotivoGuardado(result.lead.name, result.motivo!, result.rechazadoCredito);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error en vendedorMotivoRespuesta:', error);
    }
  }

  private async vendedorMotivoCustom(from: string, motivo: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.procesarMotivoCustom(motivo, vendedor.id);

      if (!result.success) return;

      const mensaje = vendorService.formatMotivoGuardado(result.lead.name, result.motivo!);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error en vendedorMotivoCustom:', error);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNNEL VENDEDOR - CAMBIO DE ETAPAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Función auxiliar para cambiar etapa por nombre
  private async vendedorCambiarEtapaConNombre(from: string, nombreLead: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
      const result = await vendorService.cambiarEtapa(nombreLead, nuevaEtapa, vendedor.id, esAdmin);

      if (result.error) {
        await this.twilio.sendWhatsAppMessage(from, result.error);
        return;
      }

      if (result.multipleLeads) {
        let msg = `📌 Encontré ${result.multipleLeads.length} leads:\n`;
        result.multipleLeads.forEach((l: any, i: number) => {
          msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4)}) - ${l.status}\n`;
        });
        msg += `\nEscribe el nombre completo.`;
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }

      if (!result.success || !result.lead) return;

      const lead = result.lead;
      console.log('✅ Lead actualizado:', lead.name, '- Score:', result.newScore, 'Temp:', result.nuevaCategoria);

      // NOTIFICAR AL VENDEDOR ASIGNADO (si existe y no es quien hizo el cambio)
      if (lead.assigned_to && lead.assigned_to !== vendedor.id) {
        try {
          const vendedorAsignado = await vendorService.getVendedorAsignado(lead.assigned_to);
          if (vendedorAsignado?.phone) {
            const notificacion = vendorService.formatNotificacionCambio(lead, result.oldStatus!, nuevaEtapa, result.newScore!, vendedor.name);
            await this.twilio.sendWhatsAppMessage(vendedorAsignado.phone, notificacion);
            console.log('📌 Notificación enviada al vendedor:', vendedorAsignado.name);
          }
        } catch (e) {
          console.error('⚠️ Error notificando vendedor:', e);
        }
      }

      // PROGRAMAR FOLLOW-UPS automáticos según nuevo status
      try {
        const followupService = new FollowupService(this.supabase);
        await followupService.programarFollowups(lead.id, lead.phone || '', lead.name, 'Por definir', 'status_change', nuevaEtapa);
        console.log(`📌 Follow-ups programados para ${lead.name} (${nuevaEtapa})`);
      } catch (e) {
        console.error('⚠️ Error programando follow-ups:', e);
      }

      const mensaje = vendorService.formatCambioEtapa(lead.name, etapaTexto);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error cambiando etapa:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al cambiar etapa. Intenta de nuevo.');
    }
  }

  private async vendedorCambiarEtapa(from: string, body: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const nombreLead = vendorService.parseNombreLeadCambioEtapa(body);

      if (!nombreLead) {
        await this.twilio.sendWhatsAppMessage(from, `📝 Escribe el nombre: *"Juan reservó"* o *"Reservó Juan"*`);
        return;
      }

      const result = await vendorService.cambiarEtapa(nombreLead, nuevaEtapa, vendedor.id, false);

      if (result.error) {
        await this.twilio.sendWhatsAppMessage(from, result.error);
        return;
      }

      if (result.multipleLeads) {
        let msg = `🤝 Encontré ${result.multipleLeads.length} leads:\n`;
        result.multipleLeads.forEach((l: any, i: number) => {
          msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4)}) - ${l.status}\n`;
        });
        msg += `\nEscribe el nombre completo.`;
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }

      if (!result.success || !result.lead) return;
      const lead = result.lead;

      // PROGRAMAR FOLLOW-UPS
      try {
        const followupService = new FollowupService(this.supabase);
        await followupService.programarFollowups(lead.id, lead.phone || '', lead.name, 'Por definir', 'status_change', nuevaEtapa);
      } catch (e) { console.error('⚠️ Error follow-ups:', e); }

      let respuesta = vendorService.formatCambioEtapa(lead.name, etapaTexto);

      // Si es entregado - VENTA REAL (delegado a servicio)
      if (nuevaEtapa === 'delivered' && lead.phone) {
        const entregaResult = await vendorService.procesarEntregaVenta(lead.id);
        if (entregaResult.leadPhone) {
          await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(entregaResult.leadPhone), vendorService.formatMensajeEntregaCliente(entregaResult.leadNombre));
        }
        respuesta = vendorService.formatConfirmacionVentaCerrada(lead.name);
      }

      // Si se cayó (delegado a servicio)
      if (nuevaEtapa === 'fallen') {
        respuesta = vendorService.formatMensajeCaidoVendedor(lead.name);
        const caidoResult = await vendorService.procesarLeadCaido(lead.id, lead.notes);
        if (caidoResult.leadPhone) {
          await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(caidoResult.leadPhone), vendorService.formatMensajeCaidoCliente(caidoResult.leadNombre));
          respuesta += '\n\n📤 Ya le envié encuesta al cliente.';
        }
      }

      await this.twilio.sendWhatsAppMessage(from, respuesta);
    } catch (error) {
      console.error('Error cambiando etapa:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al cambiar etapa.');
    }
  }


  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HIPOTECA - ENVIAR A BANCO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorEnviarABanco(from: string, body: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const parsed = vendorService.parseEnvioABanco(body);

      if (!parsed.nombre || !parsed.banco) {
        await this.twilio.sendWhatsAppMessage(from, `📝 Escribe:\n• *"Manda a Juan a BBVA"*\n• *"Envía a Juan a Infonavit"*\n\nBancos: BBVA, Santander, Banorte, HSBC, Infonavit, Fovissste`);
        return;
      }

      const result = await vendorService.enviarABanco(parsed.nombre, parsed.banco, vendedor.id, vendedor.name);

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || 'Error al enviar a banco');
        return;
      }

      // Notificar al asesor si existe y está activo
      if (result.asesor?.phone && result.asesor?.is_active !== false) {
        const asesorPhone = result.asesor.phone.replace(/\D/g, '');
        const notificacion = vendorService.formatNotificacionAsesor(result.lead, result.banco!, vendedor.name);
        await this.twilio.sendWhatsAppMessage(asesorPhone, notificacion);
      }

      const mensaje = vendorService.formatEnvioABanco(result.lead, result.banco!, result.asesor, result.bancosPrevios);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error enviando a banco:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al procesar solicitud de crédito.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HIPOTECA - CONFIRMAR ENVÍO (ya tiene solicitud en otro banco)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorConfirmarEnvioABanco(from: string, body: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const parsed = vendorService.parseConfirmarEnvio(body);

      if (!parsed.nombre || !parsed.banco) {
        await this.twilio.sendWhatsAppMessage(from, `📝 Escribe:\n*"Confirmar envio Juan Test BBVA"*`);
        return;
      }

      const result = await vendorService.enviarABancoForzado(parsed.nombre, parsed.banco, vendedor.id, vendedor.name);

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || 'Error al enviar a banco');
        return;
      }

      // Notificar al asesor si existe y está activo
      if (result.asesor?.phone && result.asesor?.is_active !== false) {
        const asesorPhone = result.asesor.phone.replace(/\D/g, '');
        const notificacion = vendorService.formatNotificacionAsesor(result.lead, result.banco!, vendedor.name);
        await this.twilio.sendWhatsAppMessage(asesorPhone, notificacion);
      }

      const mensaje = `✅ *Confirmado*\n\n${vendorService.formatEnvioABanco(result.lead, result.banco!, result.asesor)}`;
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error confirmando envío a banco:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al procesar confirmación.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HIPOTECA - CONSULTAR ESTADO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorConsultarCredito(from: string, body: string, vendedor: any): Promise<void> {
    try {
      const mortgageService = new MortgageService(this.supabase);

      // Extraer nombre
      const matchNombre = body.match(/(?:cómo va|como va|estatus|status).*?(?:de\s+)?([a-záéíóúñ\s]+?)(?:\?|$)/i) ||
                          body.match(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9 ]+).*?(?:cómo va|como va|crédit|hipoteca)/i);

      let nombreLead = '';
      if (matchNombre) {
        nombreLead = matchNombre[1].replace(/(?:el\s+)?(?:crédit|credit|hipoteca|banco).*$/i, '').trim();
      }

      // Si no hay nombre, mostrar los créditos de MIS leads
      if (!nombreLead || nombreLead.length < 2) {
        const result = await mortgageService.getCreditsForVendor(vendedor.id);

        if (result.isEmpty) {
          await this.twilio.sendWhatsAppMessage(from, `📋 No tienes leads con crédito en proceso.\n\n💡 Para asignar un lead al asesor: *"asesor para [nombre]"*`);
          return;
        }

        const resp = mortgageService.formatCreditList(result.credits);
        await this.twilio.sendWhatsAppMessage(from, resp);
        return;
      }

      // Buscar créditos del lead específico
      const result = await mortgageService.getCreditStatusByName(nombreLead);

      if (!result.found) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré solicitudes de crédito para *${nombreLead}*`);
        return;
      }

      let resp = mortgageService.formatCreditStatus(result.credits!);

      // Preguntar al asesor si hay solicitud activa
      if (result.hasPendingInquiry) {
        resp += `\n¿Quieres que le pregunte al asesor?\n*1.* Sí, pregúntale\n*2.* No, está bien`;

        // Guardar estado para siguiente mensaje
        const { data: lead } = await this.supabase.client
          .from('leads')
          .select('id, notes')
          .ilike('name', '%' + nombreLead + '%')
          .single();

        if (lead) {
          await this.supabase.client
            .from('leads')
            .update({
              notes: {
                ...(lead.notes || {}),
                pending_credit_inquiry: result.pendingInquiryId
              }
            })
            .eq('id', lead.id);
        }
      }

      await this.twilio.sendWhatsAppMessage(from, resp);
    } catch (error) {
      console.error('Error consultando crédito:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al consultar créditos.');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VENDEDOR: Asignar lead a asesor hipotecario
  // Comando: "asesor para Juan", "asesor para Juan 5512345678", "crédito para Pedro"
  // ═══════════════════════════════════════════════════════════════
  private async vendedorAsignarAsesor(from: string, nombreLead: string, vendedor: any, teamMembers: any[], telefonoLead?: string | null): Promise<void> {
    try {
      console.log(`🏦 Vendedor ${vendedor.name} asignando "${nombreLead}" a asesor hipotecario...`);
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.asignarAsesorHipotecario(nombreLead, vendedor, teamMembers, telefonoLead);

      if (!result.success) {
        if (result.multipleLeads) {
          await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsAsesor(result.multipleLeads, result.nombreBuscado!));
        } else {
          await this.twilio.sendWhatsAppMessage(from, result.error!);
        }
        return;
      }

      // Notificar al asesor (solo si está activo)
      if (result.asesor.is_active !== false) {
        await this.twilio.sendWhatsAppMessage(result.asesor.phone, vendorService.formatMensajeAsesorNuevoLead(result.lead, result.vendedor));
      }
      // Confirmar al vendedor
      await this.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionAsesorAsignado(result.lead, result.asesor));
      console.log(`✅ Lead ${result.lead.name} asignado a asesor ${result.asesor.name} (notif=${result.asesor.is_active !== false})`);
    } catch (e) {
      console.error('❌ Error asignando asesor:', e);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error al asignar. Intenta de nuevo.');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VENDEDOR: Preguntar al asesor cómo va un lead (comunicación en vivo)
  // Comando: "preguntar asesor vanessa"
  // ═══════════════════════════════════════════════════════════════
  private async vendedorPreguntarAsesor(from: string, nombreLead: string, vendedor: any, teamMembers: any[]): Promise<void> {
    try {
      console.log(`💬 Vendedor ${vendedor.name} preguntando al asesor por "${nombreLead}"...`);
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.preguntarAsesorCredito(nombreLead, vendedor, teamMembers);

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error!);
        return;
      }

      // Enviar mensaje al asesor (solo si está activo)
      if (result.asesor.is_active !== false) {
        await this.twilio.sendWhatsAppMessage(result.asesor.phone, vendorService.formatMensajeAsesorPregunta(result.lead, result.solicitud, result.vendedor));
      }
      // Confirmar al vendedor
      await this.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionPreguntaEnviada(result.asesor, result.lead));
      console.log(`✅ Pregunta a asesor ${result.asesor.name} sobre ${result.lead.name} (notif=${result.asesor.is_active !== false})`);
    } catch (e) {
      console.error('❌ Error preguntando a asesor:', e);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error. Intenta de nuevo.');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // LLAMAR [nombre] - Mostrar teléfono clickeable para marcar
  // ═══════════════════════════════════════════════════════════════
  private async mostrarTelefonoLead(from: string, nombreLead: string, usuario: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.buscarLeadTelefono(nombreLead, usuario);

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || '❌ Error buscando lead.');
        return;
      }

      const msg = vendorService.formatTelefonoLead(result.lead, result.telFormateado!);
      await this.twilio.sendWhatsAppMessage(from, msg);
      console.log(`📞 Teléfono mostrado: ${result.lead.name} -> ${usuario.name}`);
    } catch (e) {
      console.error('❌ Error mostrando teléfono:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error. Intenta de nuevo.`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MENSAJE [nombre] - Enviar WhatsApp al lead (pregunta qué mensaje)
  // ═══════════════════════════════════════════════════════════════
  private async enviarMensajeLead(from: string, nombreLead: string, usuario: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.buscarLeadMensaje(nombreLead, usuario);

      if (!result.success) {
        // Si hay múltiples leads, guardar opciones y mostrar lista
        if (result.multipleLeads && result.pendingSelection) {
          await vendorService.guardarPendingLeadSelection(usuario.id, result.pendingSelection);
          const msg = vendorService.formatMultipleLeadsMensaje(result.multipleLeads);
          await this.twilio.sendWhatsAppMessage(from, msg);
          return;
        }
        // Error simple
        await this.twilio.sendWhatsAppMessage(from, result.error || '❌ Error buscando lead.');
        return;
      }

      // Guardar pending para esperar el mensaje
      await vendorService.guardarPendingMessageToLead(usuario.id, result.lead, result.telefono!);

      // Preguntar qué mensaje enviar
      const pregunta = vendorService.formatPreguntaMensaje(result.lead.name);
      await this.twilio.sendWhatsAppMessage(from, pregunta);
      console.log(`💬 Esperando mensaje para ${result.lead.name} de ${usuario.name}`);
    } catch (e) {
      console.error('❌ Error preparando mensaje:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error. Intenta de nuevo.`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Enviar mensaje pendiente al lead (cuando el usuario escribe el contenido)
  // Activa un "bridge" temporal de 10 minutos para chat directo
  // ═══════════════════════════════════════════════════════════════
  private async enviarMensajePendienteLead(from: string, mensaje: string, usuario: any, pendingData: any): Promise<void> {
    try {
      const { lead_id, lead_name, lead_phone } = pendingData;
      const bridgeService = new BridgeService(this.supabase);

      // Enviar mensaje al lead
      await this.meta.sendWhatsAppMessage(lead_phone, mensaje);

      // Activar bridge usando el servicio
      const result = await bridgeService.activarBridge(
        usuario.id,
        usuario.name,
        from,
        lead_id,
        lead_name,
        lead_phone
      );

      if (result.success) {
        // Confirmar al usuario
        const confirmacion = bridgeService.formatMensajeBridgeActivado(lead_name, mensaje);
        await this.meta.sendWhatsAppMessage(from, confirmacion);

        // Registrar actividad
        await this.supabase.client.from('lead_activities').insert({
          lead_id: lead_id,
          team_member_id: usuario.id,
          activity_type: 'whatsapp',
          notes: `Mensaje enviado: "${mensaje.substring(0, 100)}"`,
          created_at: new Date().toISOString()
        });

        console.log(`💬 Mensaje enviado a ${lead_name} por ${usuario.name} - Bridge activo`);
      } else {
        await this.meta.sendWhatsAppMessage(from, `❌ Error activando chat directo. Intenta de nuevo.`);
      }
    } catch (e) {
      console.error('❌ Error enviando mensaje pendiente:', e);
      await this.meta.sendWhatsAppMessage(from, `❌ Error enviando mensaje. Intenta de nuevo.`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FUNCIONES DE ACTUALIZACIÓN DEL VENDEDOR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ═══════════════════════════════════════════════════════════════
  // APARTADO COMPLETO - Con enganche y fecha de pago
  // Formato: "apartar Juan en Distrito Falco 50000 para el 20 enero"
  // ═══════════════════════════════════════════════════════════════
  private async vendedorRegistrarApartado(from: string, body: string, vendedor: any, match: RegExpMatchArray): Promise<void> {
    try {
      const ventasService = new VentasService(this.supabase);
      const datos = ventasService.parseApartado(body, match);
      console.log('📝 APARTADO - nombre:', datos.nombreLead, 'propiedad:', datos.propiedad, 'enganche:', datos.enganche);

      const result = await ventasService.registrarApartado(datos, vendedor);

      if (result.multipleLeads) {
        await this.twilio.sendWhatsAppMessage(from, ventasService.formatMultipleLeadsApartado(result.multipleLeads));
        return;
      }

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
        return;
      }

      // Enviar confirmación al vendedor
      await this.twilio.sendWhatsAppMessage(from, ventasService.formatApartadoExito(result));

      // Enviar felicitación al cliente
      if (result.lead?.phone) {
        const clientePhone = result.lead.phone.replace(/[^0-9]/g, '');
        const clienteFormatted = clientePhone.startsWith('52') ? clientePhone : '52' + clientePhone.slice(-10);
        const mensajeCliente = ventasService.formatMensajeClienteApartado(result.lead, datos.propiedad, vendedor);
        await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(clienteFormatted), mensajeCliente);
        console.log('📤 Mensaje de felicitación enviado a cliente:', result.lead.name);
      }
    } catch (e) {
      console.error('❌ Error en vendedorRegistrarApartado:', e);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error registrando apartado. Intenta de nuevo.');
    }
  }

  private async vendedorCerrarVenta(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    const ventasService = new VentasService(this.supabase);

    const nombreLead = ventasService.parseCerrarVenta(body);
    if (!nombreLead) {
      await this.twilio.sendWhatsAppMessage(from, ventasService.getMensajeAyudaCerrarVenta());
      return;
    }

    const result = await ventasService.cerrarVenta(nombreLead, vendedor);

    if (!result.success) {
      await this.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    await this.twilio.sendWhatsAppMessage(from, ventasService.formatCerrarVentaExito(result.lead!, nombre));
  }

  private async vendedorCancelarLead(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    const ventasService = new VentasService(this.supabase);

    const nombreLead = ventasService.parseCancelarLead(body);
    if (!nombreLead) {
      await this.twilio.sendWhatsAppMessage(from, ventasService.getMensajeAyudaCancelarLead());
      return;
    }

    const result = await ventasService.cancelarLead(nombreLead, vendedor);

    if (result.multipleLeads) {
      await this.twilio.sendWhatsAppMessage(from, ventasService.formatMultipleLeadsCancelar(result.multipleLeads));
      return;
    }

    if (!result.success) {
      await this.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
      return;
    }

    await this.twilio.sendWhatsAppMessage(from, ventasService.formatCancelarLeadExito(result.lead!));
  }

  private async vendedorAgendarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Extraer: agendar cita con [nombre] [fecha/día] [hora]
    const match = body.match(/agendar?.*(?:con|a)\s+([a-záéíóúñ\s]+?)(?:\s+(?:para\s+)?(?:el\s+)?)?(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|sábado|domingo)?/i);

    if (!match) {
      await this.twilio.sendWhatsAppMessage(from,
        `🤝 No entendí.

Escribe así:
*"Agendar cita con Juan García mañana 10am"*`
      );
      return;
    }

    const nombreLead = match[1].trim();

    // Buscar lead
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .ilike('name', `%${nombreLead}%`)
      .limit(1);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌’ No encontré a *${nombreLead}* en tus leads.`
      );
      return;
    }

    const lead = leads[0];
    
    // Por ahora solo confirmar - después agregaremos fecha/hora parsing
    await this.twilio.sendWhatsAppMessage(from,
      `📅 ¿Para cuándo quieres la cita con *${lead.name}*?

Responde con fecha y hora:
*"Mañana 10am"*
*"Viernes 3pm"*`
    );
  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NOTAS POR LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAgregarNota(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const parsed = vendorService.parseAgregarNota(body);

      if (!parsed.nombreLead || !parsed.textoNota) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.getMensajeAyudaAgregarNota());
        return;
      }

      const result = await vendorService.agregarNotaPorNombre(parsed.nombreLead, parsed.textoNota, vendedor.id, vendedor.name || nombre);

      if (result.error) {
        await this.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
        return;
      }

      if (result.multipleLeads) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsNotas(result.multipleLeads));
        return;
      }

      if (result.success && result.lead) {
        const mensaje = vendorService.formatNotaAgregada(result.lead.name, parsed.textoNota, result.totalNotas!);
        await this.twilio.sendWhatsAppMessage(from, mensaje);
      }
    } catch (error) {
      console.error('Error agregando nota:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al agregar nota. Intenta de nuevo.');
    }
  }

  private async vendedorVerNotas(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const nombreLead = vendorService.parseVerNotas(body);

      if (!nombreLead) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.getMensajeAyudaVerNotas());
        return;
      }

      const result = await vendorService.getLeadNotas(nombreLead, vendedor.id);

      if (result.error) {
        await this.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
        return;
      }

      if (result.multipleLeads) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsNotas(result.multipleLeads));
        return;
      }

      if (result.lead) {
        const mensaje = vendorService.formatLeadNotas(result.lead);
        await this.twilio.sendWhatsAppMessage(from, mensaje);
      }
    } catch (error) {
      console.error('Error viendo notas:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener notas. Intenta de nuevo.');
    }
  }

  // Versión con params ya parseados
  private async vendedorAgregarNotaConParams(from: string, nombreLead: string, textoNota: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);

      if (!nombreLead || !textoNota) {
        await this.meta.sendWhatsAppMessage(from, vendorService.getMensajeAyudaAgregarNota());
        return;
      }

      const result = await vendorService.agregarNotaPorNombre(nombreLead, textoNota, vendedor.id, vendedor.name || nombre);

      if (result.error) {
        await this.meta.sendWhatsAppMessage(from, `❌ ${result.error}`);
        return;
      }

      if (result.multipleLeads) {
        await this.meta.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsNotas(result.multipleLeads));
        return;
      }

      if (result.success && result.lead) {
        const mensaje = vendorService.formatNotaAgregada(result.lead.name, textoNota, result.totalNotas!);
        await this.meta.sendWhatsAppMessage(from, mensaje);
      }
    } catch (error) {
      console.error('Error agregando nota:', error);
      await this.meta.sendWhatsAppMessage(from, 'Error al agregar nota. Intenta de nuevo.');
    }
  }

  private async vendedorVerNotasConParams(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);

      if (!nombreLead) {
        await this.meta.sendWhatsAppMessage(from, vendorService.getMensajeAyudaVerNotas());
        return;
      }

      const result = await vendorService.getLeadNotas(nombreLead, vendedor.id);

      if (result.error) {
        await this.meta.sendWhatsAppMessage(from, `❌ ${result.error}`);
        return;
      }

      if (result.lead) {
        const mensaje = vendorService.formatLeadNotas(result.lead);
        await this.meta.sendWhatsAppMessage(from, mensaje);
      }
    } catch (error) {
      console.error('Error viendo notas:', error);
      await this.meta.sendWhatsAppMessage(from, 'Error al obtener notas. Intenta de nuevo.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FOLLOW-UP PENDIENTE: APROBAR / CANCELAR / EDITAR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAprobarFollowup(from: string, nombreLead: string | undefined, vendedor: any, nombre: string): Promise<void> {
    try {
      console.log(`🔍 vendedorAprobarFollowup: vendedor.id=${vendedor.id}, nombreLead=${nombreLead}`);

      // Buscar TODOS los leads del vendedor y filtrar en código
      // (la query JSONB de Supabase no siempre funciona bien)
      const { data: allLeads, error } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .eq('assigned_to', vendedor.id);

      if (error) {
        console.error('Error buscando leads:', error);
        await this.meta.sendWhatsAppMessage(from, `❌ Error BD: ${error.message}`);
        return;
      }

      console.log(`🔍 Leads encontrados para vendedor ${vendedor.id}: ${allLeads?.length || 0}`);

      // Filtrar leads que tienen pending_followup con status pending
      const leads = (allLeads || []).filter(l => {
        const notas = typeof l.notes === 'object' ? l.notes : {};
        const hasPending = notas.pending_followup && notas.pending_followup.status === 'pending';
        if (hasPending) {
          console.log(`✓ Lead ${l.name} tiene pending_followup pendiente`);
        }
        return hasPending;
      });

      console.log(`🔍 Leads con pending_followup: ${leads.length} de ${allLeads?.length || 0}`);

      if (!leads || leads.length === 0) {
        // DEBUG: mostrar por qué no hay leads
        const debugInfo = `vendedor.id=${vendedor.id}, total_leads=${allLeads?.length || 0}`;
        console.log(`📭 No hay follow-ups pendientes. Debug: ${debugInfo}`);
        await this.meta.sendWhatsAppMessage(from, `📭 No tienes follow-ups pendientes.\n\n_Debug: ${debugInfo}_`);
        return;
      }

      // Si se especificó nombre, filtrar
      let leadTarget = leads[0];
      if (nombreLead) {
        const normalizado = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        leadTarget = leads.find(l => {
          const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return leadNombre.includes(normalizado) || normalizado.includes(leadNombre.split(' ')[0]);
        }) || leads[0];
      }

      const notas = typeof leadTarget.notes === 'object' ? leadTarget.notes : {};
      const pending = notas.pending_followup;

      console.log(`🔍 leadTarget: ${leadTarget.name} (${leadTarget.id}), pending: ${JSON.stringify(pending)?.substring(0, 200)}`);

      // Nombre del lead (preferir pending, fallback a leadTarget)
      const leadName = pending?.lead_name || leadTarget.name || 'lead';

      if (!pending || pending.status !== 'pending') {
        // DEBUG: mostrar qué falló
        const debugStatus = `pending=${!!pending}, status=${pending?.status}`;
        console.log(`📭 No hay follow-up pendiente para ${leadName}. Debug: ${debugStatus}`);
        await this.meta.sendWhatsAppMessage(from, `📭 No hay follow-up pendiente para ${leadName}.\n\n_Debug: ${debugStatus}_`);
        return;
      }

      // Teléfono del lead (preferir pending, fallback a leadTarget.phone)
      const leadPhone = (pending.lead_phone || leadTarget.phone || '').replace(/\D/g, '');

      if (!leadPhone) {
        await this.meta.sendWhatsAppMessage(from, `❌ Error: ${leadName} no tiene teléfono registrado.`);
        console.error(`❌ Lead ${leadTarget.id} sin teléfono`);
        return;
      }

      // Enviar mensaje al lead
      console.log(`📤 Enviando follow-up a ${leadName} (${leadPhone})...`);
      try {
        const sendResult = await this.meta.sendWhatsAppMessage(leadPhone, pending.mensaje);
        console.log(`📤 Resultado envío a ${leadPhone}:`, JSON.stringify(sendResult));
      } catch (sendError: any) {
        console.error(`❌ Error enviando a ${leadPhone}:`, sendError?.message || sendError);
        // Intentar con template si falla (fuera de ventana 24h)
        await this.meta.sendWhatsAppMessage(from, `⚠️ No pude enviar a ${leadName} - puede estar fuera de ventana 24h.\n\nEl lead debe escribir primero para poder enviarle mensajes.`);
        return;
      }

      // Actualizar status
      notas.pending_followup = { ...pending, status: 'approved', approved_at: new Date().toISOString() };
      await this.supabase.client.from('leads').update({ notes: notas }).eq('id', leadTarget.id);

      await this.meta.sendWhatsAppMessage(from, `✅ Follow-up enviado a *${leadName}* (${leadPhone})\n\n"${pending.mensaje.substring(0, 100)}..."`);
      console.log(`✅ Follow-up aprobado por ${nombre} para ${leadName} (${leadPhone})`);

    } catch (error) {
      console.error('Error aprobando follow-up:', error);
      await this.meta.sendWhatsAppMessage(from, 'Error al aprobar. Intenta de nuevo.');
    }
  }

  private async vendedorCancelarFollowup(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar lead por nombre
      const normalizado = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, notes')
        .eq('assigned_to', vendedor.id)
        .not('notes->pending_followup', 'is', null);

      if (!leads || leads.length === 0) {
        await this.meta.sendWhatsAppMessage(from, `📭 No tienes follow-ups pendientes.`);
        return;
      }

      const leadTarget = leads.find(l => {
        const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return leadNombre.includes(normalizado) || normalizado.includes(leadNombre.split(' ')[0]);
      });

      if (!leadTarget) {
        await this.meta.sendWhatsAppMessage(from, `❌ No encontré follow-up pendiente para "${nombreLead}".`);
        return;
      }

      const notas = typeof leadTarget.notes === 'object' ? leadTarget.notes : {};
      notas.pending_followup = { ...notas.pending_followup, status: 'cancelled', cancelled_at: new Date().toISOString() };
      await this.supabase.client.from('leads').update({ notes: notas }).eq('id', leadTarget.id);

      await this.meta.sendWhatsAppMessage(from, `🚫 Follow-up cancelado para *${leadTarget.name}*.\nNo se enviará mensaje.`);
      console.log(`🚫 Follow-up cancelado por ${nombre} para ${leadTarget.name}`);

    } catch (error) {
      console.error('Error cancelando follow-up:', error);
      await this.meta.sendWhatsAppMessage(from, 'Error al cancelar. Intenta de nuevo.');
    }
  }

  private async vendedorEditarFollowup(from: string, nombreLead: string, nuevoMensaje: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar lead por nombre
      const normalizado = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .eq('assigned_to', vendedor.id)
        .not('notes->pending_followup', 'is', null);

      if (!leads || leads.length === 0) {
        await this.meta.sendWhatsAppMessage(from, `📭 No tienes follow-ups pendientes.`);
        return;
      }

      const leadTarget = leads.find(l => {
        const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return leadNombre.includes(normalizado) || normalizado.includes(leadNombre.split(' ')[0]);
      });

      if (!leadTarget) {
        await this.meta.sendWhatsAppMessage(from, `❌ No encontré follow-up pendiente para "${nombreLead}".`);
        return;
      }

      const notas = typeof leadTarget.notes === 'object' ? leadTarget.notes : {};
      const pending = notas.pending_followup;

      // Enviar mensaje personalizado del vendedor
      const phoneLimpio = (leadTarget.phone || '').replace(/\D/g, '');
      await this.meta.sendWhatsAppMessage(phoneLimpio, nuevoMensaje);

      // Actualizar status
      notas.pending_followup = {
        ...pending,
        status: 'edited',
        mensaje_original: pending.mensaje,
        mensaje_enviado: nuevoMensaje,
        edited_at: new Date().toISOString()
      };
      await this.supabase.client.from('leads').update({ notes: notas }).eq('id', leadTarget.id);

      await this.meta.sendWhatsAppMessage(from, `✅ Mensaje editado enviado a *${leadTarget.name}*\n\n"${nuevoMensaje.substring(0, 100)}..."`);
      console.log(`✏️ Follow-up editado por ${nombre} para ${leadTarget.name}`);

    } catch (error) {
      console.error('Error editando follow-up:', error);
      await this.meta.sendWhatsAppMessage(from, 'Error al editar. Intenta de nuevo.');
    }
  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AYUDA CONTEXTUAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAyudaContextual(from: string, body: string, nombre: string): Promise<void> {
    const msg = body.toLowerCase();
    
    if (msg.includes('cita') && (msg.includes('agend') || msg.includes('crear') || msg.includes('hago'))) {
      await this.twilio.sendWhatsAppMessage(from,
        `📅 *Para agendar cita escribe:*\n\n"Cita con [nombre] [día] [hora] en [desarrollo]"\n\n*Ejemplos:*\n• "Cita con Ana mañana 10am en Distrito Falco"\n• "Agendar Juan viernes 3pm en Los Encinos"\n\n*Si el lead es nuevo:*\n• "Crear Ana García 5512345678"`
      );
      return;
    }
    
    if (msg.includes('cancel')) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌’ *Para cancelar cita escribe:*\n\n"Cancelar cita con [nombre]"\n\n*Ejemplo:*\n• "Cancelar cita con Ana"`
      );
      return;
    }
    
    if (msg.includes('reagend') || msg.includes('mover') || msg.includes('cambiar')) {
      await this.twilio.sendWhatsAppMessage(from,
        `👋ž *Para reagendar cita escribe:*\n\n"Reagendar [nombre] para [día] [hora]"\n\n*Ejemplo:*\n• "Reagendar Ana para lunes 3pm"`
      );
      return;
    }
    
    if (msg.includes('nota') || msg.includes('apunte')) {
      await this.twilio.sendWhatsAppMessage(from,
        `📝 *Para agregar nota escribe:*\n\n"Nota [nombre]: [texto]"\n\n*Ejemplos:*\n• "Nota Juan: le interesa jardín"\n• "Apunte María: presupuesto 2M"\n\n*Para ver notas:*\n• "Notas de Juan"`
      );
      return;
    }
    
    if (msg.includes('cerr') || msg.includes('venta') || msg.includes('vend')) {
      await this.twilio.sendWhatsAppMessage(from,
        `🎉 *Para cerrar venta escribe:*\n\n"Cerré venta con [nombre]"\n\n*Ejemplo:*\n• "Cerré venta con Juan García"`
      );
      return;
    }
    
    if (msg.includes('etapa') || msg.includes('avanz') || msg.includes('mover lead')) {
      await this.twilio.sendWhatsAppMessage(from,
        `📊 *Para cambiar etapa escribe:*\n\n"[nombre] pasó a [etapa]"\n\n*Etapas:* contactado, cita agendada, visitó, negociación, cierre\n\n*Ejemplo:*\n• "Juan pasó a negociación"`
      );
      return;
    }
    
    if (msg.includes('lead') && msg.includes('crear')) {
      await this.twilio.sendWhatsAppMessage(from,
        `👤 *Para crear lead nuevo escribe:*\n\n"Crear [nombre] [teléfono]"\n\n*Ejemplo:*\n• "Crear Ana García 5512345678"`
      );
      return;
    }
    
    // Default: mostrar todo
    await this.twilio.sendWhatsAppMessage(from,
      `🤝 ¿Qué necesitas saber ${nombre}?\n\n• ¿Cómo agendo cita?\n• ¿Cómo cancelo cita?\n• ¿Cómo agrego nota?\n• ¿Cómo cierro venta?\n• ¿Cómo cambio etapa?\n• ¿Cómo creo lead?\n\nPregúntame cualquiera 👨 `
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CREAR LEAD NUEVO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorCrearLead(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const parsed = vendorService.parseCrearLead(body);

      if (!parsed) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatCrearLeadAyuda());
        return;
      }

      const result = await vendorService.crearLead(parsed.nombre, parsed.telefono, parsed.interes, vendedor.id);

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || '❌ Error al crear lead.');
        return;
      }

      const mensaje = vendorService.formatCrearLeadExito(parsed.nombre, parsed.telefono, parsed.interes);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error en vendedorCrearLead:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error al crear lead. Intenta de nuevo.');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VENDEDOR ASIGNAR HIPOTECA A LEAD EXISTENTE
  // Formato: "hipoteca Juan" - busca lead existente y le asigna asesor
  // ═══════════════════════════════════════════════════════════════
  private async vendedorAsignarHipoteca(from: string, body: string, vendedor: any, nombre: string, teamMembers: any[]): Promise<void> {
    console.log('🏦 vendedorAsignarHipoteca llamado con:', body);

    // Extraer nombre del lead: "hipoteca Juan García"
    const match = body.match(/hipoteca\s+(.+)/i);
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from,
        `🏦 *Asignar hipoteca a lead:*\n\n` +
        `📝 *"hipoteca Juan García"*\n\n` +
        `Se asigna asesor automáticamente.`
      );
      return;
    }

    const nombreBusqueda = match[1].trim();

    // Buscar lead existente del vendedor
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, needs_mortgage')
      .eq('assigned_to', vendedor.id)
      .ilike('name', `%${nombreBusqueda}%`)
      .limit(5);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌ No encontré ningún lead tuyo con el nombre *"${nombreBusqueda}"*`
      );
      return;
    }

    // Si hay múltiples leads, mostrar opciones
    if (leads.length > 1) {
      const notesData = JSON.stringify({
        pending_hipoteca_selection: {
          leads: leads.map((l: any) => ({ id: l.id, name: l.name, phone: l.phone })),
          asked_at: new Date().toISOString()
        }
      });

      await this.supabase.client
        .from('team_members')
        .update({ notes: notesData })
        .eq('id', vendedor.id);

      let msg = `📋 Encontré *${leads.length} leads* con ese nombre:\n\n`;
      leads.forEach((l: any, i: number) => {
        const tel = l.phone?.replace(/\D/g, '').slice(-10) || 'sin tel';
        msg += `${i + 1}️⃣ *${l.name}* - ${tel}\n`;
      });
      msg += `\n💡 Responde con el número (1, 2, etc.)`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    // Un solo lead encontrado - asignar hipoteca
    const leadEncontrado = leads[0];
    await this.asignarHipotecaALead(from, leadEncontrado, vendedor, teamMembers);
  }

  // Función auxiliar para asignar hipoteca a un lead (usa MortgageService)
  private async asignarHipotecaALead(from: string, lead: any, vendedor: any, teamMembers: any[]): Promise<void> {
    const mortgageService = new MortgageService(this.supabase);
    const result = await mortgageService.assignMortgageToLead(lead, teamMembers);

    // Si ya tiene hipoteca asignada
    if (result.alreadyAssigned && result.existingApp) {
      await this.twilio.sendWhatsAppMessage(from,
        `⚠️ *${lead.name}* ya tiene hipoteca asignada.\n` +
        `🏦 Asesor: ${result.existingApp.team_members?.name || 'Sin asesor'}\n` +
        `📊 Estado: ${result.existingApp.status}`
      );
      return;
    }

    // Notificar al asesor si fue asignado y está activo
    if (result.asesor?.phone && result.asesor?.is_active !== false) {
      const aPhone = result.asesor.phone.replace(/[^0-9]/g, '');
      const aFormatted = aPhone.startsWith('52') ? aPhone : '52' + aPhone.slice(-10);
      await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(aFormatted),
        `🏦 *NUEVO LEAD HIPOTECARIO*\n\n` +
        `👤 *${lead.name}*\n` +
        `📱 ${lead.phone?.slice(-10) || 'Sin tel'}\n` +
        `👔 Vendedor: ${vendedor.name}\n\n` +
        `💡 El vendedor ${vendedor.name} te asignó este lead para crédito hipotecario.`
      );
      console.log('📤 Asesor notificado:', result.asesor.name);
    }

    // Confirmar al vendedor
    const msg = mortgageService.formatAssignmentConfirmation(lead, result.asesor);
    await this.twilio.sendWhatsAppMessage(from, `✅ ${msg}`);
    console.log('✅ Hipoteca asignada a lead:', lead.name, result.asesor ? `→ asesor ${result.asesor.name}` : '');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AGENDAR CITA COMPLETA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAgendarCitaCompleta(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const calendarLocal = new CalendarService(
        this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        this.env.GOOGLE_PRIVATE_KEY,
        this.env.GOOGLE_CALENDAR_ID
      );
      const schedulingService = new AppointmentSchedulingService(this.supabase, calendarLocal);

      const result = await schedulingService.agendarCitaCompleto(body, vendedor);

      if (result.needsHelp) {
        await this.twilio.sendWhatsAppMessage(from, schedulingService.getMensajeAyudaAgendar());
        return;
      }
      if (result.needsPhone) {
        await this.twilio.sendWhatsAppMessage(from, schedulingService.formatAgendarCitaNeedsPhone(result.nombreLead!));
        return;
      }
      if (result.multipleLeads) {
        // Guardar estado pendiente para selección
        const { data: vendedorActual } = await this.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', vendedor.id)
          .single();

        // SIEMPRE sanitizar notas antes de spread para evitar corrupción
        const notasActuales = sanitizeNotes(vendedorActual?.notes);
        await this.supabase.client
          .from('team_members')
          .update({
            notes: {
              ...notasActuales,
              pending_agendar_cita: {
                leads: result.multipleLeads,
                dia: result.dia,
                hora: result.hora,
                minutos: result.minutos,
                ampm: result.ampm,
                desarrollo: result.desarrollo
              }
            }
          })
          .eq('id', vendedor.id);

        await this.twilio.sendWhatsAppMessage(from, schedulingService.formatMultipleLeadsCita(result.multipleLeads));
        return;
      }
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, schedulingService.formatAgendarCitaExito(result));

      // Guardar estado para notificación al lead (si tiene teléfono)
      if (result.leadPhone) {
        const { data: vendedorActualNotify } = await this.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', vendedor.id)
          .single();

        const notesToSave = sanitizeNotes(vendedorActualNotify?.notes);
        notesToSave.pending_agendar_notify = {
          lead_id: result.appointmentId,  // En este caso no tenemos lead_id directo
          lead_name: result.leadName,
          lead_phone: result.leadPhone,
          fecha: result.fecha,
          hora: result.hora,
          ubicacion: result.ubicacion,
          gpsLink: result.gpsLink,
          timestamp: Date.now()
        };
        await this.supabase.client
          .from('team_members')
          .update({ notes: notesToSave })
          .eq('id', vendedor.id);
      }
    } catch (error) {
      console.error('Error en agendarCitaCompleta:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al agendar cita. Intenta de nuevo.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CANCELAR CITA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorCancelarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const schedulingService = new AppointmentSchedulingService(this.supabase, this.calendar);

      const nombreLead = schedulingService.parseCancelarCita(body);
      if (!nombreLead) {
        await this.twilio.sendWhatsAppMessage(from, schedulingService.getMensajeAyudaCancelar());
        return;
      }

      const result = await schedulingService.cancelarCitaCompleto(nombreLead, vendedor);

      if (result.multipleLeads) {
        // Guardar estado para selección numérica (sanitizar para evitar corrupción)
        let rawNotes = vendedor.notes;
        if (typeof rawNotes === 'string') {
          try { rawNotes = JSON.parse(rawNotes); } catch (e) { rawNotes = {}; }
        }
        const notes = sanitizeNotes(rawNotes);
        notes.pending_cita_action = {
          action: 'cancelar',
          leads: result.multipleLeads,
          timestamp: new Date().toISOString()
        };
        await this.supabase.client
          .from('team_members')
          .update({ notes })
          .eq('id', vendedor.id);

        let msg = `🤝 Encontré ${result.multipleLeads.length} leads:\n\n`;
        result.multipleLeads.forEach((l: any, i: number) => {
          msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
        });
        msg += `\nResponde con el *número* para cancelar.`;
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error}`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, schedulingService.formatCancelarCitaExito(result));
    } catch (error) {
      console.error('Error cancelando cita:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al cancelar cita.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // REAGENDAR CITA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorReagendarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const schedulingService = new AppointmentSchedulingService(this.supabase, this.calendar);

      const result = await schedulingService.reagendarCitaCompleto(body, vendedor);

      if (result.needsHelp) {
        await this.twilio.sendWhatsAppMessage(from, schedulingService.getMensajeAyudaReagendar());
        return;
      }
      if (result.needsDateTime) {
        await this.twilio.sendWhatsAppMessage(from, schedulingService.formatReagendarNeedsDateTime(result.nombreLead!));
        return;
      }
      if (result.multipleLeads) {
        let msg = `🤝 Encontré ${result.multipleLeads.length} leads:\n\n`;
        result.multipleLeads.forEach((l: any, i: number) => {
          msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
        });
        // Guardar contexto para procesar la selección (sanitizar para evitar corrupción)
        const { data: vendedorData } = await this.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', vendedor.id)
          .single();
        const currentNotes = sanitizeNotes(vendedorData?.notes);
        await this.supabase.client
          .from('team_members')
          .update({
            notes: {
              ...currentNotes,
              pending_reagendar_selection: {
                leads: result.multipleLeads.map((l: any) => ({ id: l.id, name: l.name })),
                original_body: body,
                created_at: new Date().toISOString()
              }
            }
          })
          .eq('id', vendedor.id);
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error}`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, schedulingService.formatReagendarCitaExito(result));

      // Guardar estado para notificación al lead (si tiene teléfono)
      if (result.leadPhone) {
        const { data: vendedorData } = await this.supabase.client
          .from('team_members')
          .select('notes')
          .eq('id', vendedor.id)
          .single();
        const currentNotes = sanitizeNotes(vendedorData?.notes);
        await this.supabase.client
          .from('team_members')
          .update({
            notes: {
              ...currentNotes,
              pending_reagendar_notify: {
                lead_id: result.leadId,
                lead_name: result.leadName,
                lead_phone: result.leadPhone,
                fecha: result.nuevaFecha,
                hora: result.nuevaHora,
                timestamp: Date.now()
              }
            }
          })
          .eq('id', vendedor.id);
      }
    } catch (error) {
      console.error('Error reagendando cita:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al reagendar cita.');
    }
  }

  // Enviar notificación de reagendado al lead
  private async enviarNotificacionReagendar(from: string, vendedor: any): Promise<void> {
    const appointmentService = new AppointmentService(this.supabase, this.calendar, this.twilio);
    const result = await appointmentService.getLeadWithPendingReagendar(vendedor.id);

    if (!result) {
      await this.twilio.sendWhatsAppMessage(from, '⚠️ No hay citas reagendadas pendientes de notificar.');
      return;
    }

    const { lead, reagendar } = result;
    if (!lead.phone) {
      await this.twilio.sendWhatsAppMessage(from, '⚠️ El lead no tiene teléfono registrado.');
      return;
    }

    try {
      const leadPhone = this.formatPhoneMX(lead.phone);
      const msgLead = appointmentService.formatRescheduleMessage(lead, reagendar);
      await this.twilio.sendWhatsAppMessage(leadPhone, msgLead);
      await appointmentService.updateLeadAfterRescheduleNotification(lead.id, lead.notes);
      await this.twilio.sendWhatsAppMessage(from, `✅ *Notificación enviada a ${lead.name}*\n\n📱 ${lead.phone}`);
    } catch (error) {
      console.error('❌ Error enviando notificación:', error);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error enviando notificación: ${error}`);
    }
  }

  // Cancelar notificación de reagendado pendiente
  private async cancelarNotificacionReagendar(from: string, vendedor: any): Promise<void> {
    const appointmentService = new AppointmentService(this.supabase, this.calendar, this.twilio);
    const result = await appointmentService.cancelPendingReagendar(vendedor.id);
    if (result) {
      await this.twilio.sendWhatsAppMessage(from, `👍 No se notificó a ${result.lead.name}.`);
    } else {
      await this.twilio.sendWhatsAppMessage(from, '👍 Entendido.');
    }
  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IA HÍÍBRIDA - Clasificar intent cuando no matchea palabras
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorIntentIA(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    console.log(`🧠 [IA-INTENT] Vendedor ${nombre} escribió: "${body.substring(0, 50)}..."`);

    try {
      // Ir directo a respuesta inteligente - Claude entenderá el intent y sugerirá el comando correcto
      console.log(`🧠 [IA-INTENT] Llamando a generateSmartResponse...`);
      await this.vendedorRespuestaInteligente(from, body, vendedor, nombre);
    } catch (error) {
      console.error('❌ [IA-INTENT] Error:', error);
      await this.vendedorAyuda(from, nombre);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESPUESTA INTELIGENTE CON CLAUDE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async vendedorRespuestaInteligente(from: string, mensaje: string, vendedor: any, nombre: string): Promise<void> {
    console.log(`🤖 [SMART-RESPONSE] Iniciando para ${nombre}, mensaje: "${mensaje.substring(0, 50)}..."`);
    console.log(`🤖 [SMART-RESPONSE] Claude disponible: ${!!this.claude}`);

    try {
      const iaService = new IACoachingService(this.supabase, this.claude);
      console.log(`🤖 [SMART-RESPONSE] IACoachingService creado, llamando generateSmartResponse...`);
      const respuesta = await iaService.generateSmartResponse(mensaje, vendedor, nombre);
      console.log(`🤖 [SMART-RESPONSE] Respuesta obtenida (${respuesta?.length || 0} chars): "${respuesta?.substring(0, 100)}..."`);
      await this.twilio.sendWhatsAppMessage(from, respuesta);
      console.log(`🤖 [SMART-RESPONSE] ✅ Mensaje enviado`);
    } catch (error) {
      console.error('❌ [SMART-RESPONSE] Error:', error);
      await this.vendedorAyuda(from, nombre);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COACHING IA - Análisis y sugerencias por lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorCoaching(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const iaService = new IACoachingService(this.supabase, this.claude);
      const result = await iaService.getCoaching(nombreLead, vendedor);

      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || iaService.getMensajeAyudaCoaching());
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, result.mensaje!);
    } catch (error) {
      console.error('❌ Error en coaching:', error);
      await this.twilio.sendWhatsAppMessage(from,
        `❌ Error al analizar el lead. Intenta de nuevo.\n\nUso: *coach [nombre del lead]*`
      );
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VER HISTORIAL - Muestra conversación completa con un lead
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorVerHistorial(from: string, identificador: string, vendedor: any): Promise<void> {
    try {
      // Buscar lead por nombre o teléfono
      const idLimpio = identificador.replace(/[-\s]/g, '');
      const esTelefono = /^\d{10,15}$/.test(idLimpio);

      console.log(`🔍 VER HISTORIAL: idLimpio="${idLimpio}" esTelefono=${esTelefono} vendedor.id="${vendedor.id}"`);

      let leads: any[] = [];

      // Variable para debug
      let queryDebug = '';

      if (esTelefono) {
        queryDebug += `esTel=true, idLimpio=${idLimpio}`;

        // Buscar por teléfono
        const { data: foundLeads, error: err1 } = await this.supabase.client
          .from('leads')
          .select('id, name, phone, property_interest, lead_score, status, conversation_history, created_at, notes, assigned_to')
          .ilike('phone', `%${idLimpio}%`)
          .limit(1);

        queryDebug += `, Q1=${foundLeads?.length || 0}/${err1?.message || 'ok'}`;

        if (foundLeads && foundLeads.length > 0) {
          leads = foundLeads;
        }
      } else {
        queryDebug += `esTel=false`;
        // Buscar por nombre
        const { data } = await this.supabase.client
          .from('leads')
          .select('id, name, phone, property_interest, lead_score, status, conversation_history, created_at, notes, assigned_to')
          .ilike('name', `%${identificador}%`)
          .eq('assigned_to', vendedor.id)
          .limit(1);

        leads = data || [];
      }

      console.log(`🔍 VER HISTORIAL FINAL: encontrados=${leads?.length || 0}`);

      if (!leads || leads.length === 0) {
        // DEBUG: Enviar info de diagnóstico
        const { data: debugLeads } = await this.supabase.client
          .from('leads')
          .select('id, phone, assigned_to')
          .ilike('phone', `%${idLimpio}%`)
          .limit(1);

        const debugInfo = debugLeads?.[0]
          ? `\n\n🔧 DEBUG: ${queryDebug}\n📍 Lead existe: phone=${debugLeads[0].phone}`
          : `\n\n🔧 DEBUG: ${queryDebug}\n📍 No existe lead`;

        await this.twilio.sendWhatsAppMessage(from,
          `❌ No encontré un lead con "${identificador}".${debugInfo}`
        );
        return;
      }

      const lead = leads[0];
      const historial = Array.isArray(lead.conversation_history) ? lead.conversation_history : [];

      // Formatear teléfono para mostrar
      const telefonoCorto = lead.phone.replace(/^521/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
      const scoreEmoji = lead.lead_score >= 70 ? '🔥' : lead.lead_score >= 40 ? '🟡' : '🔵';

      // Construir mensaje de historial
      let msg = `📋 *Historial con ${lead.name || 'Lead'}*\n`;
      msg += `📱 ${telefonoCorto} | ${scoreEmoji} Score: ${lead.lead_score || 0}\n`;
      msg += `🏠 ${lead.property_interest || 'Sin desarrollo'} | ${lead.status || 'new'}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (historial.length === 0) {
        msg += `_No hay mensajes registrados aún._\n\n`;
      } else {
        // Mostrar últimos 10 mensajes (para no exceder límite de WhatsApp)
        const ultimosMensajes = historial.slice(-10);

        for (const m of ultimosMensajes) {
          const esLead = m.role === 'user' || m.from === 'lead' || m.from === 'user';
          const contenido = (m.content || m.message || '').substring(0, 150);
          const hora = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';

          if (esLead) {
            msg += `💬 *Lead* ${hora ? `(${hora})` : ''}:\n"${contenido}${contenido.length >= 150 ? '...' : ''}"\n\n`;
          } else {
            msg += `🤖 *SARA* ${hora ? `(${hora})` : ''}:\n"${contenido}${contenido.length >= 150 ? '...' : ''}"\n\n`;
          }
        }

        if (historial.length > 10) {
          msg += `_...y ${historial.length - 10} mensajes anteriores_\n\n`;
        }
      }

      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📝 *Responde aquí* para enviarle mensaje\n`;
      msg += `→ *bridge ${lead.name?.split(' ')[0] || 'lead'}* para chat directo`;

      // Guardar pending_message_to_lead en el vendedor para que el siguiente mensaje se envíe al lead
      const vendedorNotes = typeof vendedor.notes === 'object' ? vendedor.notes : {};
      await this.supabase.client.from('team_members')
        .update({
          notes: {
            ...vendedorNotes,
            pending_message_to_lead: {
              lead_id: lead.id,
              lead_name: lead.name || 'Lead',
              lead_phone: lead.phone,
              timestamp: new Date().toISOString(),
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutos
            }
          }
        })
        .eq('id', vendedor.id);

      await this.twilio.sendWhatsAppMessage(from, msg);
      console.log(`📋 Historial mostrado a ${vendedor.name} para lead ${lead.phone} - pending_message activado`);

    } catch (error) {
      console.error('❌ Error en verHistorial:', error);
      await this.twilio.sendWhatsAppMessage(from,
        `❌ Error al buscar historial. Intenta de nuevo.\n\nUso: *ver [nombre o teléfono]*`
      );
    }
  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CONFIRMACIÓN DE CITA AL LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async hayReagendarPendiente(vendedorId: string): Promise<boolean> {
    // Buscar leads con pending_reagendar del vendedor actual
    // Usar filtro JSON para buscar específicamente leads con pending_reagendar
    const { data, error } = await this.supabase.client
      .from('leads')
      .select('id, name, notes')
      .not('notes->pending_reagendar', 'is', null)
      .limit(100);

    console.log('🔍 hayReagendarPendiente - buscando para vendedor:', vendedorId);
    console.log('🔍 hayReagendarPendiente - leads con pending_reagendar:', data?.length, 'error:', error?.message || 'ninguno');

    if (data?.length) {
      data.forEach((l: any) => {
        console.log('🔍 Lead con pending_reagendar:', l.name, 'vendedor_id:', l.notes?.pending_reagendar?.vendedor_id);
      });
    }

    const conReagendar = data?.filter((l: any) => {
      return l.notes?.pending_reagendar?.vendedor_id === vendedorId;
    });

    console.log('🔍 hayReagendarPendiente - encontrados para este vendedor:', conReagendar?.length);
    return conReagendar && conReagendar.length > 0;
  }

  private async hayConfirmacionPendiente(vendedorId: string): Promise<boolean> {
    // Buscar leads con pending_confirmation del vendedor actual
    const { data } = await this.supabase.client
      .from('leads')
      .select('id, notes')
      .not('notes->pending_confirmation', 'is', null)
      .limit(10);

    // Filtrar por vendedor_id en el JSON
    const conConfirmacion = data?.filter((l: any) =>
      l.notes?.pending_confirmation?.vendedor_id === vendedorId
    );

    return conConfirmacion && conConfirmacion.length > 0;
  }

  private async enviarConfirmacionAlLead(from: string, vendedor: any, nombre: string): Promise<void> {
    const appointmentService = new AppointmentService(this.supabase, this.calendar, this.twilio);

    // Buscar lead con confirmación pendiente
    const result = await appointmentService.getLeadWithPendingConfirmation(vendedor.id);
    if (!result) {
      await this.twilio.sendWhatsAppMessage(from, '⚠️ No encontré cita pendiente de confirmar.');
      return;
    }

    const { lead, conf } = result;
    if (!lead.phone) {
      await this.twilio.sendWhatsAppMessage(from, '⚠️ El lead no tiene teléfono registrado.');
      return;
    }

    const leadPhone = lead.phone.replace(/\D/g, '').slice(-10);
    const leadActivo = appointmentService.isLeadActiveRecently(lead);
    console.log('📱 Lead activo recientemente:', leadActivo);

    try {
      if (leadActivo) {
        // Mensaje normal (lead activo en 24h)
        console.log('📤 Enviando mensaje NORMAL');
        const msgLead = appointmentService.formatConfirmationMessage(lead, conf);
        await this.meta.sendWhatsAppMessage(leadPhone, msgLead);
        await appointmentService.updateLeadAfterConfirmation(lead.id, true, lead.notes);
        await this.twilio.sendWhatsAppMessage(from, appointmentService.formatConfirmationSentToVendor(lead.name, lead.phone, false) + `\n\n¡Listo ${nombre}!`);
      } else {
        // Template (lead inactivo)
        console.log('📤 Enviando TEMPLATE');
        const templateComponents = appointmentService.buildTemplateComponents(lead, conf);
        await this.meta.sendTemplate(leadPhone, 'appointment_confirmation_v2', 'es', templateComponents);

        const extraDetails = appointmentService.formatExtraDetails(conf);
        if (extraDetails) await this.meta.sendWhatsAppMessage(leadPhone, extraDetails);

        await appointmentService.updateLeadAfterConfirmation(lead.id, false, lead.notes);
        await this.twilio.sendWhatsAppMessage(from, appointmentService.formatConfirmationSentToVendor(lead.name, lead.phone, true) + `\n\n¡Listo ${nombre}!`);
      }

      if (conf.lead_id) await appointmentService.markAppointmentConfirmationSent(conf.lead_id);

    } catch (error: any) {
      console.error('Error enviando confirmación:', error);
      // Fallback: mensaje normal
      try {
        const msgLead = appointmentService.formatConfirmationMessage(lead, conf);
        await this.twilio.sendWhatsAppMessage(leadPhone, msgLead);
        await appointmentService.updateLeadAfterConfirmation(lead.id, true, lead.notes);
        await this.twilio.sendWhatsAppMessage(from, `✅ *Confirmación enviada a ${lead.name}* (mensaje normal)\n\n📱 ${lead.phone}`);
      } catch (e2) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No pude enviar a ${lead.name}. Verifica el número: ${lead.phone}`);
      }
    }
  }

  private async cancelarConfirmacionPendiente(from: string, vendedor: any, nombre: string): Promise<void> {
    const appointmentService = new AppointmentService(this.supabase, this.calendar, this.twilio);
    const result = await appointmentService.cancelPendingConfirmation(vendedor.id);
    if (result) {
      await this.twilio.sendWhatsAppMessage(from, `📌 Ok ${nombre}, tú le avisas a ${result.lead.name}.`);
    }
  }

  private async vendedorPropiedades(from: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const props = await vendorService.getPropiedadesDisponibles();
      const mensaje = vendorService.formatPropiedadesDisponibles(props);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error en propiedades:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener propiedades.');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTODOS VENDEDOR - AYUDA, CITAS, BRIEFING, META, RESUMEN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorAyuda(from: string, nombre: string): Promise<void> {
    const mensaje = `*📋 COMANDOS DISPONIBLES*\n\n` +
      `*📊 REPORTES*\n` +
      `• *hoy* - Tu resumen del día\n` +
      `• *citas* - Tus citas de hoy\n` +
      `• *leads* - Resumen de leads\n` +
      `• *pendientes* - Leads sin seguimiento\n` +
      `• *hot* - Leads calientes\n` +
      `• *meta* - Avance de tu meta\n\n` +
      `*🔄 GESTIÓN*\n` +
      `• *mover [lead] a [etapa]* - Cambiar etapa\n` +
      `• *adelante/atrás [lead]* - Mover en funnel\n` +
      `• *nota [lead]: [texto]* - Agregar nota\n` +
      `• *notas [lead]* - Ver notas\n\n` +
      `*📅 CITAS*\n` +
      `• *agendar [lead] [fecha]* - Nueva cita\n` +
      `• *cancelar [lead]* - Cancelar cita\n\n` +
      `*🔍 BÚSQUEDA*\n` +
      `• *quién es [lead]* - Info del lead\n` +
      `• *buscar [teléfono]* - Buscar por tel\n\n` +
      `Escribe cualquier pregunta y te ayudo, ${nombre} 👋`;
    await this.twilio.sendWhatsAppMessage(from, mensaje);
  }

  private async vendedorCitasHoy(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
      const citas = await vendorService.getCitasHoy(vendedor.id, esAdmin);
      const mensaje = vendorService.formatCitasHoy(citas, nombre, esAdmin);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error en citas hoy:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener citas.');
    }
  }

  private async vendedorBriefing(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const data = await vendorService.getBriefing(vendedor.id);
      const mensaje = vendorService.formatBriefing(data, nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error en briefing:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener briefing.');
    }
  }

  private async vendedorMetaAvance(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);

      // Meta configurable: 1) del vendedor, 2) de system_config, 3) default 5
      let metaMensual = 5;
      if (vendedor.meta_mensual && vendedor.meta_mensual > 0) {
        metaMensual = vendedor.meta_mensual;
      } else {
        // Intentar obtener de system_config
        const { data: config } = await this.supabase.client
          .from('system_config')
          .select('value')
          .eq('key', 'meta_mensual_default')
          .single();
        if (config?.value) {
          metaMensual = parseInt(config.value) || 5;
        }
      }

      const data = await vendorService.getMetaAvance(vendedor.id, metaMensual);
      const mensaje = vendorService.formatMetaAvance(data, nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error en meta avance:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener meta.');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: QUIEN ES [nombre] - Buscar info de lead
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorQuienEs(from: string, nombreLead: string, vendedor: any): Promise<void> {
    try {
      const esAdmin = ['admin', 'coordinador', 'ceo', 'director'].includes(vendedor.role?.toLowerCase() || '');

      let query = this.supabase.client
        .from('leads')
        .select('id, name, phone, stage, status, created_at, notes')
        .ilike('name', `%${nombreLead}%`);

      if (!esAdmin) {
        query = query.eq('assigned_to', vendedor.id);
      }

      const { data: leads } = await query.limit(5);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a "${nombreLead}" en tus leads.`);
        return;
      }

      if (leads.length === 1) {
        const l = leads[0];
        const msg = `👤 *${l.name}*\n\n` +
          `📱 Tel: ${l.phone || 'No disponible'}\n` +
          `📌 Etapa: ${l.stage || l.status || 'Sin etapa'}\n` +
          `📅 Registrado: ${new Date(l.created_at).toLocaleDateString('es-MX')}`;
        await this.twilio.sendWhatsAppMessage(from, msg);
      } else {
        let msg = `🔍 Encontré ${leads.length} leads:\n\n`;
        leads.forEach((l, i) => {
          msg += `*${i + 1}.* ${l.name} (${l.stage || l.status || 'Sin etapa'})\n`;
        });
        await this.twilio.sendWhatsAppMessage(from, msg);
      }
    } catch (e) {
      console.log('Error en quien es:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error al buscar "${nombreLead}".`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: BROCHURE [desarrollo] - Enviar brochure de desarrollo
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorEnviarBrochure(from: string, desarrollo: string, vendedor: any): Promise<void> {
    try {
      // Buscar por desarrollo O por nombre del modelo
      let { data: props } = await this.supabase.client
        .from('properties')
        .select('name, development, brochure_urls')
        .ilike('development', `%${desarrollo}%`)
        .not('brochure_urls', 'is', null)
        .limit(1);

      // Si no encuentra por desarrollo, buscar por nombre del modelo
      if (!props || props.length === 0) {
        const { data: byName } = await this.supabase.client
          .from('properties')
          .select('name, development, brochure_urls')
          .ilike('name', `%${desarrollo}%`)
          .not('brochure_urls', 'is', null)
          .limit(1);
        props = byName;
      }

      if (!props || props.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré brochure para "${desarrollo}".`);
        return;
      }

      const brochureRaw = props[0].brochure_urls;
      const brochureUrl = Array.isArray(brochureRaw) ? brochureRaw[0] : brochureRaw;

      if (!brochureUrl) {
        await this.twilio.sendWhatsAppMessage(from, `❌ "${desarrollo}" no tiene brochure configurado.`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, `📄 *Brochure ${props[0].development}:*\n${brochureUrl}`);
    } catch (e) {
      console.log('Error en brochure:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error al obtener brochure.`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: UBICACION [desarrollo] - Enviar GPS del desarrollo
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorEnviarUbicacion(from: string, desarrollo: string, vendedor: any): Promise<void> {
    try {
      // Buscar por desarrollo O por nombre del modelo
      let { data: props } = await this.supabase.client
        .from('properties')
        .select('name, development, gps_link, address')
        .ilike('development', `%${desarrollo}%`)
        .not('gps_link', 'is', null)
        .limit(1);

      // Si no encuentra por desarrollo, buscar por nombre del modelo
      if (!props || props.length === 0) {
        const { data: byName } = await this.supabase.client
          .from('properties')
          .select('name, development, gps_link, address')
          .ilike('name', `%${desarrollo}%`)
          .not('gps_link', 'is', null)
          .limit(1);
        props = byName;
      }

      if (!props || props.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré ubicación para "${desarrollo}".`);
        return;
      }

      const prop = props[0];
      let msg = `📍 *Ubicación ${prop.development}:*\n`;
      if (prop.address) msg += `${prop.address}\n`;
      msg += `\n🗺️ ${prop.gps_link}`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en ubicacion:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error al obtener ubicación.`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: VIDEO [desarrollo] - Enviar video del desarrollo
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorEnviarVideo(from: string, desarrollo: string, vendedor: any): Promise<void> {
    try {
      // Buscar por desarrollo O por nombre del modelo
      let { data: props } = await this.supabase.client
        .from('properties')
        .select('name, development, youtube_link')
        .ilike('development', `%${desarrollo}%`)
        .not('youtube_link', 'is', null)
        .limit(1);

      // Si no encuentra por desarrollo, buscar por nombre del modelo
      if (!props || props.length === 0) {
        const { data: byName } = await this.supabase.client
          .from('properties')
          .select('name, development, youtube_link')
          .ilike('name', `%${desarrollo}%`)
          .not('youtube_link', 'is', null)
          .limit(1);
        props = byName;
      }

      if (!props || props.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré video para "${desarrollo}".`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, `🎬 *Video ${props[0].development}:*\n${props[0].youtube_link}`);
    } catch (e) {
      console.log('Error en video:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error al obtener video.`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: PASAR LEAD A CREDITO/ASESOR HIPOTECARIO
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorPasarACredito(from: string, nombreLead: string, vendedor: any): Promise<void> {
    console.log(`🏦 Vendedor ${vendedor.name} pasa "${nombreLead}" a crédito`);

    try {
      // Buscar el lead
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, email, property_interest, budget')
        .eq('assigned_to', vendedor.id)
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré lead "${nombreLead}" en tus leads asignados.`);
        return;
      }

      // Si hay múltiples, usar el primero (o podrías pedir selección)
      const lead = leads[0];

      // Buscar asesor hipotecario disponible
      const { data: asesores } = await this.supabase.client
        .from('team_members')
        .select('id, name, phone, role')
        .or('role.ilike.%asesor%,role.ilike.%hipoteca%,role.ilike.%credito%,role.ilike.%crédito%')
        .limit(10);

      if (asesores.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No hay asesores hipotecarios disponibles.`);
        return;
      }

      // Usar el primer asesor disponible (puedes agregar round robin después)
      const asesor = asesores[0];

      // Actualizar lead con needs_mortgage y asesor_banco_id
      await this.supabase.client
        .from('leads')
        .update({
          needs_mortgage: true,
          asesor_banco_id: asesor.id,
          credit_status: 'pending_contact'
        })
        .eq('id', lead.id);

      // Notificar al vendedor
      await this.twilio.sendWhatsAppMessage(from,
        `✅ *Lead pasado a crédito*\n\n` +
        `👤 ${lead.name}\n` +
        `🏦 Asesor asignado: ${asesor.name}\n\n` +
        `El lead quedó marcado para seguimiento de crédito.`
      );

      // Notificar al asesor hipotecario
      const asesorPhone = asesor.phone?.replace(/\D/g, '');
      if (asesorPhone) {
        try {
          await this.twilio.sendWhatsAppMessage(asesorPhone,
            `🏦 *NUEVO LEAD PARA CRÉDITO*\n\n` +
            `👤 *${lead.name}*\n` +
            `📱 ${lead.phone}\n` +
            `🏠 Interés: ${lead.property_interest || 'No especificado'}\n` +
            `👔 Vendedor: ${vendedor.name}\n\n` +
            `⏰ Contáctalo pronto.\n\n` +
            `💡 Escribe *leads* para ver tu lista completa.`
          );
          console.log(`📤 Notificación enviada a asesor: ${asesor.name}`);
        } catch (notifError) {
          console.error(`⚠️ Error notificando a asesor ${asesor.name}:`, notifError);
        }
      }

    } catch (e) {
      console.log('Error en pasarACredito:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error al pasar lead a crédito.`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // VENDEDOR: NUEVO LEAD (se queda con el vendedor, no round robin)
  // ═══════════════════════════════════════════════════════════════════
  private async vendedorNuevoLead(from: string, nombre: string, telefono: string, desarrollo: string | null, vendedor: any): Promise<void> {
    console.log(`➕ Vendedor ${vendedor.name} agrega lead: ${nombre} ${telefono} ${desarrollo || ''}`);

    try {
      // Normalizar teléfono (agregar 521 si es necesario)
      let phoneNormalized = telefono.replace(/\D/g, '');
      if (phoneNormalized.length === 10) {
        phoneNormalized = '521' + phoneNormalized;
      } else if (phoneNormalized.length === 12 && phoneNormalized.startsWith('52')) {
        phoneNormalized = '521' + phoneNormalized.slice(2);
      }

      // Verificar si ya existe un lead con ese teléfono
      const { data: existente } = await this.supabase.client
        .from('leads')
        .select('id, name, assigned_to')
        .eq('phone', phoneNormalized)
        .limit(1);

      if (existente && existente.length > 0) {
        const leadExistente = existente[0];
        // Verificar si ya es del vendedor
        if (leadExistente.assigned_to === vendedor.id) {
          await this.twilio.sendWhatsAppMessage(from,
            `⚠️ Este lead ya existe y es tuyo:\n\n` +
            `👤 ${leadExistente.name}\n` +
            `📱 ${phoneNormalized}`
          );
        } else {
          await this.twilio.sendWhatsAppMessage(from,
            `⚠️ Este teléfono ya está registrado con otro lead:\n\n` +
            `👤 ${leadExistente.name}\n\n` +
            `Contacta a tu coordinador si necesitas reasignación.`
          );
        }
        return;
      }

      // Crear el lead asignado al vendedor
      const { data: nuevoLead, error } = await this.supabase.client
        .from('leads')
        .insert({
          name: nombre,
          phone: phoneNormalized,
          property_interest: desarrollo || null,
          assigned_to: vendedor.id,
          captured_by: vendedor.id,
          created_by: vendedor.id,
          source: 'vendedor_directo',
          status: 'new',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.log('Error creando lead:', error);
        await this.twilio.sendWhatsAppMessage(from, `❌ Error al crear lead: ${error.message}`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from,
        `✅ *Lead registrado*\n\n` +
        `👤 ${nombre}\n` +
        `📱 ${phoneNormalized}\n` +
        (desarrollo ? `🏠 Interés: ${desarrollo}\n` : '') +
        `\n📌 El lead está asignado a ti.`
      );

    } catch (e) {
      console.log('Error en nuevoLead:', e);
      await this.twilio.sendWhatsAppMessage(from, `❌ Error al registrar lead.`);
    }
  }

  private async vendedorResumenLeads(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const data = await vendorService.getResumenLeads(vendedor.id);
      const mensaje = vendorService.formatResumenLeads(data, nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error en resumen leads:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener resumen.');
    }
  }

  // HOT: Leads calientes
  private async vendedorLeadsHot(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar leads con score >= 70 (calientes)
      const { data: leads, error } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status, score, last_activity_at')
        .eq('assigned_to', vendedor.id)
        .gte('score', 70)
        .not('status', 'in', '("won","lost","dnc")')
        .order('score', { ascending: false })
        .limit(10);

      if (error) {
        console.log('Error obteniendo leads hot:', error);
        await this.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads calientes.');
        return;
      }

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from,
          `🔥 *${nombre}, no tienes leads calientes*\n\n` +
          `Los leads HOT tienen score ≥70.\n` +
          `Sigue dando seguimiento para calentar tus leads! 💪`
        );
        return;
      }

      let msg = `🔥 *LEADS CALIENTES* (${leads.length})\n`;
      msg += `_Score ≥70 - Listos para cerrar_\n\n`;

      leads.forEach((lead: any, i: number) => {
        msg += `${i + 1}. *${lead.name || 'Sin nombre'}* (${lead.score}🔥)\n`;
        msg += `   📱 ${lead.phone || 'Sin tel'}\n`;
        msg += `   📊 Status: ${lead.status || 'new'}\n\n`;
      });

      msg += `_Escribe "contactar [nombre]" para dar seguimiento_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en leads hot:', e);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads calientes.');
    }
  }

  // PENDIENTES: Leads sin seguimiento reciente
  private async vendedorLeadsPendientes(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar leads asignados sin actividad en los últimos 3 días
      const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const { data: leads, error } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status, last_activity_at, score')
        .eq('assigned_to', vendedor.id)
        .not('status', 'in', '("won","lost","dnc")')
        .or(`last_activity_at.is.null,last_activity_at.lt.${hace3Dias}`)
        .order('last_activity_at', { ascending: true, nullsFirst: true })
        .limit(10);

      if (error) {
        console.log('Error obteniendo pendientes:', error);
        await this.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads pendientes.');
        return;
      }

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from,
          `✅ *${nombre}, no tienes leads pendientes!*\n\n` +
          `Todos tus leads tienen seguimiento reciente. ¡Buen trabajo! 🎯`
        );
        return;
      }

      let msg = `⏰ *LEADS PENDIENTES DE SEGUIMIENTO*\n`;
      msg += `_${leads.length} lead(s) sin actividad en 3+ días_\n\n`;

      leads.forEach((lead: any, i: number) => {
        const diasSinActividad = lead.last_activity_at
          ? Math.floor((Date.now() - new Date(lead.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))
          : '∞';
        const temp = lead.score >= 70 ? '🔥' : lead.score >= 40 ? '🟡' : '🔵';
        msg += `${i + 1}. ${temp} *${lead.name || 'Sin nombre'}*\n`;
        msg += `   📱 ${lead.phone || 'Sin tel'}\n`;
        msg += `   ⏱️ ${diasSinActividad} días sin actividad\n\n`;
      });

      msg += `_Escribe "contactar [nombre]" para iniciar seguimiento_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en leads pendientes:', e);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error al obtener leads pendientes.');
    }
  }

  private async vendedorBuscarPorTelefono(from: string, telefono: string, vendedor: any): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.getBusquedaTelefono(telefono);
      const mensaje = vendorService.formatBusquedaTelefono(result, telefono);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error buscando por telefono:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al buscar lead.');
    }
  }

  private async vendedorCrearRecordatorio(from: string, texto: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const scheduledFor = await vendorService.crearRecordatorio(texto);
      const mensaje = vendorService.formatRecordatorioCreado(texto, scheduledFor);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error creando recordatorio:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al crear recordatorio.');
    }
  }

  // MIS HOT: Leads calientes asignados
  private async vendedorMisHot(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const leads = await vendorService.getLeadsHot(vendedor.id);
      const mensaje = vendorService.formatLeadsHot(leads, nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (error) {
      console.error('Error en vendedorMisHot:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error obteniendo leads HOT');
    }
  }

  // DISPONIBILIDAD: Huecos en agenda
  private async vendedorDisponibilidad(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Próximos 3 días
      const hoy = new Date();
      const hoyStr = hoy.toISOString().split('T')[0];
      const en3Dias = new Date(hoy.getTime() + 3 * 24 * 60 * 60 * 1000);
      const en3DiasStr = en3Dias.toISOString().split('T')[0];

      const { data: citas, error } = await this.supabase.client
        .from('appointments')
        .select('scheduled_date, scheduled_time, lead_name')
        .eq('vendedor_id', vendedor.id)
        .gte('scheduled_date', hoyStr)
        .lte('scheduled_date', en3DiasStr)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true });

      console.log('📅 Citas para disponibilidad:', citas?.length || 0, 'vendedor:', vendedor.id);

      // Guardar hora + nombre del lead
      const citasPorDia: Record<string, Array<{hora: string, lead: string}>> = {};
      
      if (citas) {
        citas.forEach((c: any) => {
          const diaKey = c.scheduled_date;
          const hora = c.scheduled_time ? parseInt(c.scheduled_time.split(':')[0]) : 0;
          if (!citasPorDia[diaKey]) citasPorDia[diaKey] = [];
          citasPorDia[diaKey].push({
            hora: `${hora}:00`,
            lead: c.lead_name || 'Sin nombre'
          });
        });
      }
      
      console.log('📅 Citas por día:', JSON.stringify(citasPorDia));

      let msg = `📌 *TU DISPONIBILIDAD*\n`;
      msg += `━━━━━━━━━━━━━━━\n\n`;

      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      
      for (let i = 0; i < 3; i++) {
        const dia = new Date(hoy.getTime() + i * 24 * 60 * 60 * 1000);
        const diaKey = dia.toISOString().split('T')[0];
        const nombreDia = i === 0 ? 'HOY' : i === 1 ? 'MAÑANA' : diasSemana[dia.getDay()].toUpperCase();
        
        const citasDelDia = citasPorDia[diaKey] || [];
        const horasOcupadas = citasDelDia.map(c => c.hora);
        const libres: string[] = [];
        
        // Horarios disponibles (9am - 6pm, cada 2 horas)
        for (let h = 9; h <= 18; h += 2) {
          if (!horasOcupadas.includes(`${h}:00`)) {
            libres.push(`${h}:00`);
          }
        }

        msg += `*${nombreDia}* (${dia.getDate()}/${dia.getMonth() + 1})\n`;
        
        if (citasDelDia.length === 0) {
          // Sin citas = disponible todo el día
          msg += `✅ Disponible todo el día\n`;
        } else {
          // Hay citas - mostrar libres y ocupadas
          if (libres.length > 0) {
            msg += `✅ Libre: ${libres.join(', ')}\n`;
          } else {
            msg += `❌ Sin disponibilidad\n`;
          }
          // Mostrar citas con nombre
          citasDelDia.forEach(cita => {
            msg += `📌 ${cita.hora} - ${cita.lead}\n`;
          });
        }
        msg += `\n`;
      }

      msg += `_Para agendar: "Cita mañana 3pm con Juan"_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en vendedorDisponibilidad:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error obteniendo disponibilidad');
    }
  }

  // ENVIAR INFO A LEAD: Manda info de desarrollo a un lead
  private async vendedorEnviarInfoALead(from: string, desarrollo: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);

      // Buscar lead
      const leadResult = await vendorService.getLeadParaEnviarInfo(nombreLead, vendedor.id, vendedor.role);
      if (!leadResult.found) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
        return;
      }
      if (leadResult.multiple) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeadsEnviarInfo(leadResult.multiple));
        return;
      }

      // Buscar desarrollo
      const prop = await vendorService.getDesarrolloInfo(desarrollo);
      if (!prop) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré el desarrollo *${desarrollo}*\n\n_Escribe "propiedades" para ver disponibles_`);
        return;
      }

      const lead = leadResult.lead!;
      const desarrolloNombre = prop.development || prop.name;

      // Enviar info al lead
      const msgLead = vendorService.formatMensajeInfoLead(lead.name, vendedor.name, prop);
      await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(lead.phone), msgLead);

      // Registrar envío
      await vendorService.registrarEnvioInfo(lead.id, vendedor.id, desarrolloNombre);

      // Confirmar al vendedor
      await this.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionEnvioInfo(lead.name, desarrolloNombre, lead.phone));
    } catch (error) {
      console.error('Error en vendedorEnviarInfoALead:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error enviando info');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VOICE AI - Funciones de llamadas
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async vendedorLlamar(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.getLlamarLead(nombreLead, vendedor.id);

      // Si encontró uno solo, registrar la llamada
      if (result.found && result.lead && !result.multiple) {
        await vendorService.registrarLlamada(result.lead.id, vendedor.id);
      }

      const mensaje = vendorService.formatLlamarLead(result, nombreLead);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error en llamar:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al procesar llamada.');
    }
  }

  private async vendedorProgramarLlamada(from: string, nombreLead: string, cuando: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.getLlamarLead(nombreLead, vendedor.id);

      if (!result.found || !result.lead) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
        return;
      }

      const lead = result.lead;
      const scheduledFor = await vendorService.programarLlamada(lead.id, lead.name, lead.phone, cuando);
      const mensaje = vendorService.formatLlamadaProgramada(lead.name, scheduledFor);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error programando llamada:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al programar llamada.');
    }
  }

  private async vendedorLlamadasPendientes(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const hace3dias = new Date();
      hace3dias.setDate(hace3dias.getDate() - 3);

      // Leads que necesitan llamada (new sin contactar, scheduled sin confirmar)
      const { data: porLlamar } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['new', 'contacted', 'scheduled'])
        .lt('updated_at', hace3dias.toISOString())
        .order('score', { ascending: false })
        .limit(5);

      // Leads HOT que necesitan seguimiento
      const { data: hotPendientes } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['visited', 'negotiation', 'reserved'])
        .order('score', { ascending: false })
        .limit(3);

      let msg = `📌 *LLAMADAS PENDIENTES*\n${nombre}\n\n`;

      if (hotPendientes && hotPendientes.length > 0) {
        msg += `*📌 URGENTES (HOT):*\n`;
        for (const l of hotPendientes) {
          const tel = l.phone?.slice(-10) || '';
          msg += `• *${l.name}* - ${l.status}\n`;
          msg += `  tel:+52${tel}\n`;
        }
        msg += '\n';
      }

      if (porLlamar && porLlamar.length > 0) {
        msg += `*⏳ SIN CONTACTAR (+3 días):*\n`;
        for (const l of porLlamar) {
          const tel = l.phone?.slice(-10) || '';
          msg += `• *${l.name}* - ${l.status}\n`;
          msg += `  tel:+52${tel}\n`;
        }
      }

      if ((!porLlamar || porLlamar.length === 0) && (!hotPendientes || hotPendientes.length === 0)) {
        msg = `✅ *${nombre}*, no tienes llamadas pendientes urgentes!\n\n_Buen trabajo manteniéndote al día_ 📌`;
      } else {
        msg += '\n_Toca el número para llamar_';
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en llamadas pendientes:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener llamadas pendientes.');
    }
  }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // OBTENER O CREAR LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async getOrCreateLead(phone: string): Promise<{ lead: any; isNew: boolean }> {
    const leadService = new LeadManagementService(this.supabase);
    return leadService.getOrCreateLead(phone);
  }

  private async getVendedorMenosCarga(): Promise<any> {
    const leadService = new LeadManagementService(this.supabase);
    return leadService.getVendedorMenosCarga();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPER: Buscar vendedor por nombre (para asignación específica)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async buscarVendedorPorNombre(nombreBuscado: string): Promise<any | null> {
    if (!nombreBuscado) return null;

    const nombreLower = nombreBuscado.toLowerCase().trim();
    console.log('🔍 Buscando vendedor por nombre:', nombreBuscado);

    const { data: vendedores } = await this.supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores?.length) {
      console.error('⚠️ No hay vendedores activos');
      return null;
    }

    // Buscar coincidencia por nombre (puede ser nombre o apellido)
    const encontrado = vendedores.find(v => {
      const nombreCompleto = v.name?.toLowerCase() || '';
      const partes = nombreCompleto.split(' ');
      // Coincidencia exacta con primer nombre o cualquier parte del nombre
      return partes.some(parte => parte === nombreLower) ||
             nombreCompleto.includes(nombreLower);
    });

    if (encontrado) {
      console.log('✅ Vendedor preferido encontrado:', encontrado.name);
      return encontrado;
    }

    console.error('⚠️ No se encontró vendedor con nombre:', nombreBuscado);
    return null;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPER: Obtener URL del brochure - Usa resourceService centralizado
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private getBrochureUrl(desarrollo: string, modelo?: string): string {
    return resourceService.getBrochureUrl(desarrollo, modelo) || '';
  }

  private async getAllProperties(): Promise<any[]> {
    const CACHE_KEY = 'properties_all';
    const CACHE_TTL = 600; // 10 minutos

    try {
      // 1. Intentar leer del cache KV
      const kv = this.env?.SARA_CACHE;
      if (kv) {
        try {
          const cached = await kv.get(CACHE_KEY, 'json');
          if (cached) {
            console.log('📦 Cache HIT: properties');
            return cached as any[];
          }
          console.log('🔍 Cache MISS: properties - fetching from DB');
        } catch (cacheErr) {
          console.error('⚠️ Error leyendo cache properties:', cacheErr);
        }
      }

      // 2. Fetch de la DB
      const propertyService = new PropertyService(this.supabase);
      const data = await propertyService.getAllProperties();

      // 3. Guardar en cache
      if (kv && data?.length) {
        try {
          await kv.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL });
          console.log('💾 Cache SET: properties (TTL: 10min)');
        } catch (cacheErr) {
          console.error('⚠️ Error guardando properties en cache:', cacheErr);
        }
      }

      return data;
    } catch (e) {
      console.error('❌ Excepción en getAllProperties:', e);
      return [];
    }
  }

  private findPropertyByDevelopment(properties: any[], desarrollo: string): any | null {
    const propertyService = new PropertyService(this.supabase);
    return propertyService.findPropertyByDevelopment(properties, desarrollo);
  }

  // ✅ FIX 07-ENE-2026: Búsqueda robusta de miembro del equipo
  private findTeamMemberByRole(teamMembers: any[], role: string, banco?: string): any | null {
    if (!teamMembers?.length) {
      console.error('⚠️ findTeamMemberByRole: Sin miembros del equipo');
      return null;
    }

    const roleLower = role.toLowerCase();

    // 1. Si hay banco preferido, buscar asesor de ese banco
    if (banco) {
      const bancoLower = banco.toLowerCase();
      const asesorBanco = teamMembers.find(m =>
        (m.role?.toLowerCase().includes(roleLower) ||
         m.role?.toLowerCase().includes('asesor') ||
         m.role?.toLowerCase().includes('hipotec')) &&
        m.banco?.toLowerCase().includes(bancoLower)
      );
      if (asesorBanco) {
        console.log(`✅ ${role} encontrado para banco ${banco}: ${asesorBanco.name}`);
        return asesorBanco;
      }
    }

    // 2. Buscar por rol exacto
    let found = teamMembers.find(m =>
      m.role?.toLowerCase().includes(roleLower)
    );
    if (found) {
      console.log(`✅ ${role} encontrado: ${found.name}`);
      return found;
    }

    // 3. Fallback para asesores (múltiples nombres de rol)
    if (roleLower.includes('asesor') || roleLower.includes('credito') || roleLower.includes('hipotec')) {
      found = teamMembers.find(m =>
        m.role?.toLowerCase().includes('asesor') ||
        m.role?.toLowerCase().includes('hipotec') ||
        m.role?.toLowerCase().includes('credito') ||
        m.role?.toLowerCase().includes('crédito')
      );
      if (found) {
        console.log(`✅ Asesor encontrado (fallback): ${found.name}`);
        return found;
      }
    }

    // 4. Fallback para vendedores
    if (roleLower.includes('vendedor')) {
      found = teamMembers.find(m =>
        m.role?.toLowerCase().includes('vendedor') ||
        m.role?.toLowerCase().includes('ventas')
      );
      if (found) {
        console.log(`✅ Vendedor encontrado (fallback): ${found.name}`);
        return found;
      }
    }

    console.error(`⚠️ No se encontró ${role} en el equipo`);
    return null;
  }

  private async getAllTeamMembers(): Promise<any[]> {
    const CACHE_KEY = 'team_members_active';
    const CACHE_TTL = 300; // 5 minutos

    try {
      // 1. Intentar leer del cache KV
      const kv = this.env?.SARA_CACHE;
      if (kv) {
        try {
          const cached = await kv.get(CACHE_KEY, 'json');
          if (cached) {
            console.log('📦 Cache HIT: team_members');
            return cached as any[];
          }
          console.log('🔍 Cache MISS: team_members - fetching from DB');
        } catch (cacheErr) {
          console.error('⚠️ Error leyendo cache:', cacheErr);
        }
      }

      // 2. Fetch de la DB
      const { data, error } = await this.supabase.client
        .from('team_members')
        .select("*")
        .eq('active', true);

      if (error) {
        console.error('❌ Error cargando team_members:', error);
        // Intentar sin filtro de active como fallback
        const { data: fallback } = await this.supabase.client
          .from('team_members')
          .select("*");
        console.error('⚠️ Usando fallback sin filtro active:', fallback?.length || 0, 'miembros');
        return fallback || [];
      }

      console.log(`👥 Team members cargados: ${data?.length || 0} activos`);

      // 3. Guardar en cache
      if (kv && data) {
        try {
          await kv.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL });
          console.log('💾 Cache SET: team_members (TTL: 5min)');
        } catch (cacheErr) {
          console.error('⚠️ Error guardando en cache:', cacheErr);
        }
      }

      // ✅ FIX 07-ENE-2026: Validar que hay al menos 1 vendedor y 1 asesor
      const vendedores = (data || []).filter((m: any) => m.role?.toLowerCase().includes('vendedor'));
      const asesores = (data || []).filter((m: any) =>
        m.role?.toLowerCase().includes('asesor') ||
        m.role?.toLowerCase().includes('hipotec') ||
        m.role?.toLowerCase().includes('credito')
      );

      if (vendedores.length === 0) {
        console.warn('⚠️ ALERTA: No hay vendedores activos en el sistema');
      }
      if (asesores.length === 0) {
        console.warn('⚠️ ALERTA: No hay asesores de crédito activos en el sistema');
      }

      return data || [];
    } catch (e) {
      console.error('❌ Excepción en getAllTeamMembers:', e);
      return [];
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ANÁLISIS CON IA - DELEGADO A aiConversationService.ts
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async generarVideoBienvenida(
    leadPhone: string, 
    nombreCliente: string, 
    desarrollo: string, 
    photoUrl: string, 
    env: any
  ): Promise<string | null> {
    try {
      // Extraer solo el primer nombre (Ej: "Luis Jimenez" -> "Luis")
      const primerNombre = nombreCliente.trim().split(/\s+/)[0];
      console.log(`🎬 Iniciando proceso Veo 3 para: ${primerNombre} (Full: ${nombreCliente})`);

      const apiKey = env?.GEMINI_API_KEY;
      if (!apiKey) {
        console.error('❌ ERROR: Falta GEMINI_API_KEY.');
        return null;
      }

      if (!photoUrl) {
        console.error('⚠️ No hay foto disponible');
        return null;
      }
      
      console.log('📸 Foto a usar:', photoUrl);
      
      const imgResponse = await fetch(photoUrl);
      if (!imgResponse.ok) {
        console.error('⚠️ Error descargando imagen');
        return null;
      }
      const imgBuffer = await imgResponse.arrayBuffer();
      const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
      
      // PROMPT ORIGINAL - avatar + foto + voz
      const prompt = `Cinematic medium shot of a friendly professional Mexican woman real estate agent standing in front of the luxury house shown in the image. She looks at the camera, smiles warmly and gestures welcome. Audio: A clear female voice speaking in Mexican Spanish saying "Hola ${primerNombre}, bienvenido a tu nuevo hogar aquí en ${desarrollo}". High quality, photorealistic, 4k resolution, natural lighting.`;

      console.log('🎬 Prompt:', prompt);

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          instances: [{
            prompt: prompt,
            image: {
              bytesBase64Encoded: imgBase64,
              mimeType: "image/jpeg"
            }
          }],
          parameters: {
            aspectRatio: "9:16",
            durationSeconds: 6
            // Sin personGeneration según instrucciones
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`⚠️ Veo 3 Error API (${response.status}):`, errorText);
        return null;
      }

      const result = await response.json();
      
      if (result.error) {
         console.error('❌ Google rechazó:', JSON.stringify(result.error));
         return null;
      }

      const operationName = result.name;
      if (!operationName) return null;

      console.log('🎬 Veo 3 operación iniciada:', operationName);

      await this.supabase.client
        .from('pending_videos')
        .insert({
          operation_id: operationName,
          lead_phone: leadPhone.replace(/\D/g, ''),
          lead_name: nombreCliente,
          desarrollo: desarrollo
        });
      
      console.log('📝 Video encolado en DB');
      return operationName;
      
    } catch (e) {
      console.error('❌ Excepción en generarVideoBienvenida:', e);
      return null;
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CREAR CITA COMPLETA - Wrapper que usa AppointmentService
  // Migrado a servicio el 11-ENE-2026
  // ═══════════════════════════════════════════════════════════════════════════
  private async crearCitaCompleta(
    from: string,
    cleanPhone: string,
    lead: any,
    desarrollo: string,
    fecha: string,
    hora: string,
    teamMembers: any[],
    analysis: AIAnalysis,
    properties: any[],
    env: any,
    isReschedule: boolean = false,  // ← Para reagendamientos
    fechaAnterior?: string,  // ← Fecha anterior (para mensaje de reagendamiento)
    horaAnterior?: string    // ← Hora anterior (para mensaje de reagendamiento)
  ): Promise<void> {
    try {
      // Crear servicio con dependencias
      const calendar = new CalendarService(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        env.GOOGLE_PRIVATE_KEY,
        env.GOOGLE_CALENDAR_ID
      );
      const appointmentService = new AppointmentService(this.supabase, calendar, this.twilio);

      // Llamar al servicio
      const params: CrearCitaParams = {
        from, cleanPhone, lead, desarrollo, fecha, hora,
        teamMembers, analysis, properties, env, isReschedule
      };
      const result = await appointmentService.crearCitaCompleta(params);

      // Manejar errores
      if (!result.success) {
        if (result.errorType === 'duplicate') {
          console.error('⚠️ Cita duplicada detectada, no se crea nueva');
          return;
        }
        if (result.errorType === 'out_of_hours') {
          const msg = appointmentService.formatMensajeHoraInvalida(result);
          await this.twilio.sendWhatsAppMessage(from, msg);
          return;
        }
        if (result.errorType === 'db_error') {
          console.error('❌ Error DB creando cita:', result.error);
          return;
        }
        return;
      }

      // ═══ ENVIAR MENSAJES ═══
      const { vendedor, asesorHipotecario, necesitaCredito, clientName, needsBirthdayQuestion } = result;

      // Agregar cleanPhone al result para los formatters
      (result as any).cleanPhone = cleanPhone;

      // 1. Notificar al VENDEDOR
      if (vendedor?.phone) {
        // ═══ FIX: Usar mensaje correcto según si es reagendamiento o nueva ═══
        const msgVendedor = isReschedule
          ? appointmentService.formatMensajeVendedorReagendamiento(result, desarrollo, fecha, hora, fechaAnterior, horaAnterior)
          : appointmentService.formatMensajeVendedorNuevaCita(result, desarrollo, fecha, hora);
        await this.twilio.sendWhatsAppMessage(vendedor.phone, msgVendedor);
        console.log(isReschedule ? '📤 Notificación de REAGENDAMIENTO enviada a vendedor' : '📤 Notificación enviada a vendedor');
      }

      // 2. Notificar al ASESOR HIPOTECARIO (si necesita crédito y está activo)
      if (necesitaCredito && asesorHipotecario?.phone && asesorHipotecario?.is_active !== false) {
        const msgAsesor = appointmentService.formatMensajeAsesorNuevaCita(result, desarrollo, fecha, hora);
        await this.twilio.sendWhatsAppMessage(asesorHipotecario.phone, msgAsesor);
        console.log('📤 Notificación enviada a asesor hipotecario');
      }

      // 3. Enviar confirmación al CLIENTE
      const confirmacion = appointmentService.formatMensajeConfirmacionCliente(result, desarrollo, fecha, hora);
      await this.twilio.sendWhatsAppMessage(from, confirmacion);
      console.log('✅ Confirmación de cita enviada');

      // 4. Preguntar cumpleaños si no tiene
      if (needsBirthdayQuestion && clientName) {
        await new Promise(r => setTimeout(r, 1500));
        const msgCumple = appointmentService.formatMensajeCumpleanos(clientName);
        await this.twilio.sendWhatsAppMessage(from, msgCumple);
        console.log('🎂 Pregunta de cumpleaños enviada');
      }

      // 5. Video de bienvenida (si aplica)
      await this.generarVideoBienvenidaSiAplica(from, lead, desarrollo, cleanPhone, properties, env);

      console.log('✅ CITA COMPLETA CREADA');
    } catch (error) {
      console.error('❌ Error en crearCitaCompleta:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER: Generar video de bienvenida si aplica
  // ═══════════════════════════════════════════════════════════════════════════
  private async generarVideoBienvenidaSiAplica(
    from: string,
    lead: any,
    desarrollo: string,
    cleanPhone: string,
    properties: any[],
    env: any
  ): Promise<void> {
    try {
      const propertiesArray = Array.isArray(properties) ? properties : [];

      // Verificar si ya se envió video para ESTE desarrollo
      const { data: videosEnviados } = await this.supabase.client
        .from('pending_videos')
        .select('id')
        .eq('lead_phone', cleanPhone.replace(/\D/g, ''))
        .ilike('desarrollo', `%${desarrollo}%`)
        .limit(1);

      const yaEnvioVideoParaEsteDesarrollo = videosEnviados && videosEnviados.length > 0;
      console.log('🎬 ¿Ya envió video para', desarrollo, '?', yaEnvioVideoParaEsteDesarrollo);

      // Fotos conocidas de cada desarrollo
      const fotosDesarrollos: Record<string, string> = {
        'encinos': 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg',
        'los encinos': 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg',
        'monte verde': 'https://img.youtube.com/vi/49rVtCtBnHg/maxresdefault.jpg',
        'monteverde': 'https://img.youtube.com/vi/49rVtCtBnHg/maxresdefault.jpg',
        'falco': 'https://img.youtube.com/vi/reig3OGmBn4/maxresdefault.jpg',
        'distrito falco': 'https://img.youtube.com/vi/reig3OGmBn4/maxresdefault.jpg',
        'andes': 'https://img.youtube.com/vi/gXWVb_kzkgM/maxresdefault.jpg',
        'miravalle': 'https://img.youtube.com/vi/49rVtCtBnHg/maxresdefault.jpg'
      };

      const propsDelDesarrollo = propertiesArray.filter(
        (p: any) => p.development?.toLowerCase().includes(desarrollo.toLowerCase())
      );

      let fotoDesarrollo = '';
      const desarrolloLower = desarrollo.toLowerCase();

      // 1. Usar mapa de fotos conocidas (YouTube thumbnails)
      if (fotosDesarrollos[desarrolloLower]) {
        fotoDesarrollo = fotosDesarrollos[desarrolloLower];
      } else {
        // 2. Match parcial
        for (const [key, url] of Object.entries(fotosDesarrollos)) {
          if (desarrolloLower.includes(key) || key.includes(desarrolloLower)) {
            fotoDesarrollo = url;
            break;
          }
        }
      }
      // 3. Extraer de YouTube link de la propiedad
      if (!fotoDesarrollo) {
        const propConYoutube = propsDelDesarrollo.find((p: any) => p.youtube_link);
        if (propConYoutube?.youtube_link) {
          const ytMatch = propConYoutube.youtube_link.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
          if (ytMatch && ytMatch[1]) {
            fotoDesarrollo = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
          }
        }
      }

      if (!yaEnvioVideoParaEsteDesarrollo && fotoDesarrollo) {
        console.log('🎬 GENERANDO VIDEO VEO 3 para', desarrollo);
        this.generarVideoBienvenida(from, lead.name || "Cliente", desarrollo, fotoDesarrollo, env)
          .catch(err => console.log('Error iniciando video:', err));
      } else {
        console.log('ℹ️ No genera video:', yaEnvioVideoParaEsteDesarrollo ? 'Ya se envió' : 'No hay foto');
      }
    } catch (videoErr) {
      console.error('⚠️ Error en video bienvenida:', videoErr);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTA: Código de Calendar migrado a AppointmentService.crearCitaCompleta()
  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODO: Crear o Actualizar mortgage_applications + Notificar asesor
  // Migrado a MortgageService el 12-ENE-2026
  // ═══════════════════════════════════════════════════════════════════════════
  private async crearOActualizarMortgageApplication(
    lead: any,
    teamMembers: any[],
    datos: {
      desarrollo?: string;
      banco?: string;
      ingreso?: number;
      enganche?: number;
      modalidad?: string;
      trigger: string;
    }
  ): Promise<void> {
    try {
      // Crear servicio
      const mortgageService = new MortgageService(this.supabase);

      // Llamar al servicio
      const result = await mortgageService.crearOActualizarConNotificacion(
        lead,
        teamMembers,
        datos as MortgageData
      );

      if (!result.success) {
        console.error('❌ Error en mortgage:', result.error);
        return;
      }

      // ═══ ENVIAR NOTIFICACIONES SEGÚN LA ACCIÓN (solo si asesor activo) ═══
      const { asesor, action, cambios } = result;

      if (action === 'created' && asesor?.phone && asesor?.is_active !== false) {
        // Nuevo lead hipotecario - notificar asesor
        const msg = mortgageService.formatMensajeNuevoLead(result);
        await this.twilio.sendWhatsAppMessage(asesor.phone, msg);
        console.log('📤 Asesor notificado de NUEVO lead:', asesor.name);
      } else if (action === 'updated' && cambios.length > 0 && asesor?.phone && asesor?.is_active !== false) {
        // Actualización de info - notificar asesor
        const msg = mortgageService.formatMensajeActualizacion(result);
        await this.twilio.sendWhatsAppMessage(asesor.phone, msg);
        console.log('📤 Asesor notificado de actualización:', asesor.name);
      } else if (action === 'waiting_name') {
        console.log('⏸️ Esperando nombre real del cliente para crear mortgage');
      } else if (action === 'no_change') {
        console.log('ℹ️ mortgage_application ya existe sin cambios nuevos');
      }

    } catch (e) {
      console.error('❌ Error en crearOActualizarMortgageApplication:', e);
    }
  }

  // [CÓDIGO VIEJO ELIMINADO - ~200 líneas migradas a MortgageService]
  // La lógica de crear/actualizar y formatear mensajes ahora está en:
  // - MortgageService.crearOActualizarConNotificacion()
  // - MortgageService.formatMensajeNuevoLead()
  // - MortgageService.formatMensajeActualizacion()

  // ✅ Helper para obtener fecha actual en zona horaria de México
  private getMexicoNow(): Date {
    // Obtener fecha UTC
    const now = new Date();
    // México está en UTC-6 (sin horario de verano) o UTC-5 (con horario de verano)
    // Usar offset fijo de -6 horas para Zacatecas
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const mexicoOffset = -6 * 60 * 60000; // UTC-6
    return new Date(utc + mexicoOffset);
  }

  private parseFecha(fecha: string, hora: string): Date {
    const now = this.getMexicoNow(); // ✅ Usar hora México, no UTC
    const fechaLower = fecha.toLowerCase();
    
    let targetDate = new Date(now);

    if (fechaLower.includes('hoy')) {
      // Hoy
    } else if (fechaLower.includes('mañana')) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (fechaLower.includes('lunes')) {
      targetDate = this.getNextDayOfWeek(1);
    } else if (fechaLower.includes('martes')) {
      targetDate = this.getNextDayOfWeek(2);
    } else if (fechaLower.includes('miércoles') || fechaLower.includes('miercoles')) {
      targetDate = this.getNextDayOfWeek(3);
    } else if (fechaLower.includes('jueves')) {
      targetDate = this.getNextDayOfWeek(4);
    } else if (fechaLower.includes('viernes')) {
      targetDate = this.getNextDayOfWeek(5);
    } else if (fechaLower.includes('sábado') || fechaLower.includes('sabado')) {
      targetDate = this.getNextDayOfWeek(6);
    } else if (fechaLower.includes('domingo')) {
      targetDate = this.getNextDayOfWeek(0);
    }

    // Parsear hora
    const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
    if (horaMatch) {
      let hours = parseInt(horaMatch[1]);
      const minutes = parseInt(horaMatch[2] || '0');
      
      if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
      if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;
      
      targetDate.setHours(hours, minutes, 0, 0);
    }

    return targetDate;
  }

  private getNextDayOfWeek(dayOfWeek: number): Date {
    const now = this.getMexicoNow(); // ✅ Usar hora México, no UTC
    const currentDay = now.getDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    
    const result = new Date(now);
    result.setDate(result.getDate() + daysUntil);
    return result;
  }

  // Parsear fecha a formato ISO (YYYY-MM-DD) para Supabase
  // ✅ IMPORTANTE: Usar fecha LOCAL de México, no UTC (evita +1 día por zona horaria)
  private parseFechaISO(fecha: string): string {
    const targetDate = this.parseFecha(fecha, '12:00');
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Parsear hora a formato TIME (HH:MM:SS) para Supabase
  private parseHoraISO(hora: string): string {
    const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
    if (horaMatch) {
      let hours = parseInt(horaMatch[1]);
      const minutes = horaMatch[2] || '00';

      if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
      if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;

      return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
    }
    return '12:00:00';
  }

  // Parsear parámetros de reagendar (día y hora) del comando original
  // NOTA: Usa función extraída en utils/vendedorParsers.ts para facilitar testing
  private parseReagendarParams(body: string): { dia?: string; hora?: string; minutos?: string; ampm?: string } {
    return parseReagendarParamsUtil(body);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ACTUALIZAR LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async actualizarLead(lead: any, analysis: AIAnalysis, originalMessage: string): Promise<void> {
    const leadManagementService = new LeadManagementService(this.supabase);
    const result = await leadManagementService.actualizarLead(lead, analysis, originalMessage);

    // Si hubo reasignación de vendedor, notificar
    if (result.vendedorReasignado?.phone && result.leadInfo) {
      await this.twilio.sendWhatsAppMessage(
        result.vendedorReasignado.phone,
        leadManagementService.formatMensajeVendedorReasignado(
          result.leadInfo.name,
          result.leadInfo.phone,
          result.leadInfo.property_interest
        )
      );
    }
  }

  // =====================================================
  // FUNCIONES DE ACTIVIDADES
  // =====================================================

  private async registrarActividad(
    from: string,
    nombreLead: string,
    tipo: string,
    vendedor: any,
    monto?: number | null
  ): Promise<void> {
    const leadManagementService = new LeadManagementService(this.supabase);
    const result = await leadManagementService.registrarActividad(nombreLead, tipo, vendedor, monto);

    switch (result.action) {
      case 'not_found':
        await this.twilio.sendWhatsAppMessage(
          from,
          leadManagementService.formatMensajeActividadNoEncontrado(result.error || nombreLead)
        );
        break;

      case 'multiple_found':
        await this.twilio.sendWhatsAppMessage(
          from,
          leadManagementService.formatMensajeActividadMultiples(result.leadsEncontrados || [])
        );
        break;

      case 'registered':
        const statusCambio = tipo === 'visit' && result.lead?.status === 'scheduled';
        await this.twilio.sendWhatsAppMessage(
          from,
          leadManagementService.formatMensajeActividadRegistrada(
            result.tipoActividad || tipo,
            result.lead?.name || nombreLead,
            result.nuevoStatus || 'new',
            result.nuevaCategoria || 'COLD',
            result.monto,
            statusCambio
          )
        );
        break;
    }
  }

  private async mostrarActividadesHoy(from: string, vendedor: any, useMeta: boolean = false): Promise<void> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Determinar si usar Meta o Twilio basado en el formato del from
    const useMetaService = useMeta || !from.includes('whatsapp:');
    const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

    const { data: actividades } = await this.supabase.client
      .from('lead_activities')
      .select('activity_type, amount, created_at, leads:lead_id (name)')
      .eq('team_member_id', vendedor.id)
      .gte('created_at', hoy.toISOString())
      .order('created_at', { ascending: false });

    if (!actividades || actividades.length === 0) {
      const noActivityMsg = 'No registraste actividad hoy.\n\nRegistra con:\n- "Llame a Juan"\n- "Visite a Maria"\n- "Cotizacion a Pedro 850k"';
      if (useMetaService) {
        await this.meta.sendWhatsAppMessage(cleanPhone, noActivityMsg);
      } else {
        await this.twilio.sendWhatsAppMessage(from, noActivityMsg);
      }
      return;
    }

    // Agrupar por tipo
    const resumen: Record<string, string[]> = {
      'call': [],
      'visit': [],
      'quote': [],
      'whatsapp': [],
      'email': [],
      'bridge_start': [],
      'bridge_message': [],
      'bridge_end': []
    };

    let montoTotal = 0;
    actividades.forEach((a: any) => {
      const nombre = a.leads?.name || 'Desconocido';
      if (resumen[a.activity_type]) {
        resumen[a.activity_type].push(nombre);
      }
      if (a.amount) montoTotal += a.amount;
    });

    let msg = 'Tu actividad hoy:\n\n';
    
    if (resumen.call.length > 0) {
      msg += 'Llamadas: ' + resumen.call.length + '\n';
      msg += '  ' + resumen.call.slice(0, 5).join(', ') + '\n\n';
    }
    if (resumen.visit.length > 0) {
      msg += 'Visitas: ' + resumen.visit.length + '\n';
      msg += '  ' + resumen.visit.join(', ') + '\n\n';
    }
    if (resumen.quote.length > 0) {
      msg += 'Cotizaciones: ' + resumen.quote.length;
      if (montoTotal > 0) msg += ' ($' + montoTotal.toLocaleString() + ')';
      msg += '\n  ' + resumen.quote.join(', ') + '\n\n';
    }
    if (resumen.whatsapp.length > 0) {
      msg += 'WhatsApps: ' + resumen.whatsapp.length + '\n';
    }
    if (resumen.email.length > 0) {
      msg += 'Emails: ' + resumen.email.length + '\n';
    }

    // Bridge activities (chat directo)
    const bridgeActivities = resumen.bridge_start.length + resumen.bridge_message.length + resumen.bridge_end.length;
    if (bridgeActivities > 0) {
      msg += '\n🔗 Chats directos:\n';
      if (resumen.bridge_start.length > 0) {
        msg += '  Iniciados: ' + resumen.bridge_start.length + ' (' + [...new Set(resumen.bridge_start)].join(', ') + ')\n';
      }
      if (resumen.bridge_message.length > 0) {
        msg += '  Mensajes: ' + resumen.bridge_message.length + '\n';
      }
    }

    msg += '\nTotal: ' + actividades.length + ' actividades';

    if (useMetaService) {
      await this.meta.sendWhatsAppMessage(cleanPhone, msg);
    } else {
      await this.twilio.sendWhatsAppMessage(from, msg);
    }
  }

  private async mostrarHistorialLead(from: string, nombreLead: string, vendedor: any): Promise<void> {
    // Buscar lead
    let query = this.supabase.client
      .from('leads')
      .select('id, name, phone, status, score, property_interest, quote_amount, source, created_at')
      .ilike('name', '%' + nombreLead + '%')
      .order('updated_at', { ascending: false });
    
    if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
      query = query.eq('assigned_to', vendedor.id);
    }

    const { data: leads } = await query.limit(5);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 'No encontre a "' + nombreLead + '"');
      return;
    }

    if (leads.length > 1) {
      let msg = 'Encontre ' + leads.length + ' leads:\n';
      leads.forEach((l: any, i: number) => {
        msg += (i+1) + '. ' + l.name + ' (' + l.status + ') ' + l.phone + '\n';
      });
      msg += '\nSe mas especifico o usa el telefono.';
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Buscar actividades
    const { data: actividades } = await this.supabase.client
      .from('lead_activities')
      .select('activity_type, amount, notes, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(10);

    let msg = lead.name + '\n';
    msg += 'Tel: ' + lead.phone + '\n';
    msg += 'Etapa: ' + lead.status;
    // HOT = negotiation y reserved
    // CLIENTE = closed y delivered
    const hotStages = ['negotiation', 'reserved'];
    const clientStages = ['closed', 'delivered'];
    if (clientStages.includes(lead.status)) msg += ' CLIENTE';
    else if (hotStages.includes(lead.status)) msg += ' HOT';
    msg += '\n';
    if (lead.property_interest) msg += 'Desarrollo: ' + lead.property_interest + '\n';
    if (lead.quote_amount) msg += 'Cotizacion: $' + lead.quote_amount.toLocaleString() + '\n';
    if (lead.source) msg += 'Origen: ' + lead.source + '\n';

    msg += '\nHISTORIAL:\n';

    if (actividades && actividades.length > 0) {
      const tipoEmoji: Record<string, string> = {
        'call': 'Tel',
        'visit': 'Visita',
        'quote': 'Cotiz',
        'whatsapp': 'WA',
        'email': 'Email',
        'created': 'Creado',
        'status_change': 'Movio'
      };

      actividades.forEach((a: any) => {
        const fecha = new Date(a.created_at);
        const fechaStr = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        msg += fechaStr + ' - ' + (tipoEmoji[a.activity_type] || a.activity_type);
        if (a.amount) msg += ' $' + a.amount.toLocaleString();
        msg += '\n';
      });
    } else {
      msg += 'Sin actividades registradas\n';
    }

    // Fecha creacion
    const creado = new Date(lead.created_at);
    msg += '\nCreado: ' + creado.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  private async crearLeadDesdeWhatsApp(from: string, nombre: string, telefono: string, vendedor: any): Promise<void> {
    // Normalizar telefono
    const digits = telefono.replace(/\D/g, '').slice(-10);
    const normalizedPhone = '521' + digits;

    // Verificar si ya existe
    const { data: existente } = await this.supabase.client
      .from('leads')
      .select('id, name, status')
      .like('phone', '%' + digits)
      .limit(1);

    if (existente && existente.length > 0) {
      await this.twilio.sendWhatsAppMessage(from, 
        'Ya existe: ' + existente[0].name + ' (' + existente[0].status + ')\n\nTel: ' + digits);
      return;
    }

    // Crear lead
    const { data: nuevoLead, error } = await this.supabase.client
      .from('leads')
      .insert({
        name: nombre,
        phone: normalizedPhone,
        status: 'new',
        score: 10,
        assigned_to: vendedor.id,
        created_by: vendedor.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando lead:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al crear lead. Intenta de nuevo.');
      return;
    }

    // Registrar actividad de creacion
    await this.supabase.client.from('lead_activities').insert({
      lead_id: nuevoLead.id,
      team_member_id: vendedor.id,
      activity_type: 'created'
    });

    // Guardar estado pendiente para desarrollo y origen
    await this.supabase.client.from('leads').update({
      notes: { pending_setup: true }
    }).eq('id', nuevoLead.id);

    // Obtener desarrollos
    const { data: props } = await this.supabase.client
      .from('properties')
      .select('id, name')
      .eq('active', true);

    let msg = 'Lead creado: ' + nombre + '\n';
    msg += 'Tel: ' + normalizedPhone + '\n\n';
    msg += 'Desarrollo?\n';
    
    if (props && props.length > 0) {
      props.slice(0, 6).forEach((p: any, i: number) => {
        msg += (i+1) + '. ' + p.name + '\n';
      });
      msg += '\nResponde con el numero o nombre.';
    } else {
      msg += 'Escribe el nombre del desarrollo.';
    }

    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROCESAR RESPUESTA DE ENCUESTA (con comentarios)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async procesarRespuestaEncuesta(phone: string, mensaje: string): Promise<string | null> {
    try {
      const encuestasService = new EncuestasService(this.supabase);
      const last10 = phone.slice(-10);

      // ═══════════════════════════════════════════════════════════
      // PRIMERO: Verificar si hay encuesta post-visita en notas del lead
      // ═══════════════════════════════════════════════════════════
      console.log(`📋 ENCUESTA POST-VISITA: Buscando lead con phone like %${last10}`);

      const leadConEncuesta = await encuestasService.buscarLeadConEncuestaPostVisita(phone);

      if (leadConEncuesta) {
        const notas = typeof leadConEncuesta.notes === 'object' ? leadConEncuesta.notes : {};
        const survey = notas.pending_client_survey;

        console.log(`📋 ENCUESTA POST-VISITA: Lead ${leadConEncuesta.name} tiene encuesta pendiente`);

        const respuesta = encuestasService.procesarRespuestaPostVisita(mensaje, leadConEncuesta.name || '', survey);

        console.log(`✅ Encuesta post-visita procesada: ${respuesta.tipo}`);
        console.log(`📤 Respuesta para lead: ${respuesta.respuestaCliente.substring(0, 100)}...`);

        // PRIMERO: Preparar la respuesta al lead (no puede fallar)
        const respuestaParaLead = respuesta.respuestaCliente;

        // SEGUNDO: Intentar notificar al vendedor (no debe bloquear respuesta al lead)
        try {
          // Usar vendedor_phone de la survey si existe, sino buscar en DB
          let vendedorPhone = survey.vendedor_phone;
          if (!vendedorPhone && survey.vendedor_id) {
            console.log(`📋 Buscando teléfono de vendedor ${survey.vendedor_name} (${survey.vendedor_id})`);
            vendedorPhone = await encuestasService.obtenerTelefonoVendedor(survey.vendedor_id);
          }

          if (vendedorPhone) {
            await this.meta.sendWhatsAppMessage(vendedorPhone, respuesta.notificarVendedor);
            console.log(`📤 Notificación enviada a vendedor ${survey.vendedor_name} (${vendedorPhone})`);
          } else {
            console.error(`⚠️ Vendedor ${survey.vendedor_name} no tiene teléfono - no se puede notificar`);
          }
        } catch (vendorError) {
          console.error(`⚠️ Error notificando a vendedor (no afecta respuesta al lead):`, vendorError);
        }

        // TERCERO: Guardar feedback en el lead (después de preparar respuesta)
        try {
          await encuestasService.guardarRespuestaPostVisita(leadConEncuesta.id, notas, respuesta.tipo, mensaje);
          console.log(`💾 Feedback guardado en lead ${leadConEncuesta.id}`);
        } catch (saveError) {
          console.error(`⚠️ Error guardando feedback (respuesta igual se envía):`, saveError);
        }

        // SIEMPRE retornar la respuesta al lead
        return respuestaParaLead;
      }

      // ═══════════════════════════════════════════════════════════
      // CHECK: Respuesta a mensaje de NO-SHOW (reagendar)
      // ═══════════════════════════════════════════════════════════
      const leadConNoShow = await this.buscarLeadConNoShowPendiente(phone);
      if (leadConNoShow) {
        const notas = typeof leadConNoShow.notes === 'object' ? leadConNoShow.notes : {};
        const noShowContext = notas.pending_noshow_response;

        console.log(`📋 NO-SHOW RESPONSE: Lead ${leadConNoShow.name} respondió a mensaje de reagendar`);

        // Notificar al vendedor
        if (noShowContext?.vendedor_phone) {
          const nombreLead = leadConNoShow.name?.split(' ')[0] || 'El cliente';
          await this.meta.sendWhatsAppMessage(noShowContext.vendedor_phone,
            `📬 *${nombreLead}* respondió a tu mensaje de reagendar:\n\n` +
            `"${mensaje}"\n\n` +
            `📱 ${leadConNoShow.phone}\n` +
            `🏠 ${noShowContext.property || 'Sin propiedad'}`
          );
          console.log(`✅ Vendedor ${noShowContext.vendedor_name} notificado de respuesta no-show`);
        }

        // Guardar respuesta en el lead y limpiar contexto
        const { pending_noshow_response, ...restNotas } = notas;
        await this.supabase.client
          .from('leads')
          .update({
            status: 'contacted',
            notes: {
              ...restNotas,
              noshow_response: {
                mensaje: mensaje,
                responded_at: new Date().toISOString(),
                original_context: noShowContext
              }
            }
          })
          .eq('id', leadConNoShow.id);

        console.log(`💾 Respuesta no-show guardada en lead ${leadConNoShow.id}`);

        // Responder al lead
        const nombreCorto = leadConNoShow.name?.split(' ')[0] || 'Hola';
        return `¡Gracias ${nombreCorto}! 😊\n\nTu asesor ${noShowContext?.vendedor_name || ''} te contactará pronto para coordinar una nueva fecha.\n\n¿Hay algún día u horario que te funcione mejor?`;
      }

      // ═══════════════════════════════════════════════════════════
      // SEGUNDO: Buscar en tabla surveys
      // ═══════════════════════════════════════════════════════════
      console.log(`📋 ENCUESTA: Buscando para ${phone}`);

      const encuesta = await encuestasService.buscarEncuestaPendiente(phone);

      if (!encuesta) {
        console.log(`📋 ENCUESTA: Sin encuesta activa para ${phone}`);
        return null;
      }

      console.log(`📋 Encuesta encontrada: ${encuesta.id} tipo=${encuesta.survey_type} status=${encuesta.status}`);

      // PASO 2: Recibir comentario después de la calificación
      if (encuesta.status === 'awaiting_feedback') {
        const respuestaCliente = await encuestasService.procesarComentario(encuesta, mensaje);
        await this.notificarResultadoEncuesta(encuesta, mensaje.trim());
        return respuestaCliente;
      }

      // PASO 1: Recibir calificación inicial
      const textoLimpio = mensaje.trim();

      // Encuesta post-cita (espera 1-4)
      if (encuesta.survey_type === 'post_cita') {
        const respuesta = parseInt(textoLimpio);
        const resultado = await encuestasService.procesarCalificacionPostCita(encuesta, respuesta);
        if (resultado) return resultado;
      }

      // Encuesta NPS (espera 0-10)
      if (encuesta.survey_type === 'nps') {
        const nps = parseInt(textoLimpio);
        const resultado = await encuestasService.procesarCalificacionNPS(encuesta, nps);
        if (resultado) return resultado;
      }

      // Encuestas flexibles (custom, satisfaction, rescate, post_cierre)
      const tiposFlexibles = ['custom', 'satisfaction', 'rescate', 'post_cierre'];
      if (tiposFlexibles.includes(encuesta.survey_type)) {
        const resultado = await encuestasService.procesarEncuestaFlexible(encuesta, mensaje);
        if (resultado) return resultado;
      }

      return null;
    } catch (e) {
      console.log('Error procesando respuesta encuesta:', e);
      return null;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NOTIFICAR RESULTADO DE ENCUESTA A VENDEDOR Y ADMIN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async notificarResultadoEncuesta(encuesta: any, comentario: string): Promise<void> {
    try {
      const encuestasService = new EncuestasService(this.supabase);
      const mensaje = encuestasService.formatMensajeResultado(encuesta, comentario);

      // Notificar al vendedor si tiene teléfono
      if (encuesta.vendedor_id) {
        const vendedorPhone = await encuestasService.obtenerTelefonoVendedor(encuesta.vendedor_id);
        if (vendedorPhone) {
          await this.meta.sendWhatsAppMessage(vendedorPhone, mensaje);
          console.log(`📋 Encuesta notificada a vendedor ${encuesta.vendedor_name}`);
        }
      }

      // Notificar a admins si calificación es baja
      if (encuestasService.esCalificacionBaja(encuesta)) {
        const admins = await encuestasService.obtenerAdmins();
        for (const admin of admins) {
          await this.meta.sendWhatsAppMessage(admin.phone, `🚨 *ALERTA ENCUESTA BAJA*\n\n${mensaje}`);
          console.log(`🚨 Alerta de encuesta enviada a admin ${admin.name}`);
        }
      }
    } catch (e) {
      console.log('Error notificando resultado de encuesta:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETECCIÓN Y CREACIÓN DE REFERIDOS
  // ═══════════════════════════════════════════════════════════════════════════
  private async detectarYCrearReferido(
    clienteReferidor: any,
    mensaje: string,
    clientePhone: string,
    from: string
  ): Promise<boolean> {
    const leadManagementService = new LeadManagementService(this.supabase);
    const result = await leadManagementService.detectarYCrearReferido(
      clienteReferidor,
      mensaje,
      clientePhone
    );

    if (!result.detected) {
      return false;
    }

    // Enviar mensajes según el resultado
    switch (result.action) {
      case 'already_exists':
        await this.meta.sendWhatsAppMessage(
          from,
          leadManagementService.formatMensajeReferidoYaExiste(result.existenteNombre || 'esta persona')
        );
        return true;

      case 'error':
        await this.meta.sendWhatsAppMessage(
          from,
          leadManagementService.formatMensajeReferidoError()
        );
        return true;

      case 'own_number':
      case 'no_phone':
        return false;

      case 'created':
        // 1. Agradecer al referidor
        await this.meta.sendWhatsAppMessage(
          from,
          leadManagementService.formatMensajeAgradecimientoReferidor(result.referido!.nombre)
        );

        // 2. Notificar al vendedor asignado
        if (result.vendedorAsignado?.phone) {
          await this.meta.sendWhatsAppMessage(
            result.vendedorAsignado.phone,
            leadManagementService.formatMensajeNotificacionVendedor(
              result.referido!.nombre,
              result.referido!.telefono,
              result.referidorNombre!
            )
          );
        }

        // 3. Enviar mensaje de bienvenida al referido
        try {
          await this.meta.sendWhatsAppMessage(
            result.referido!.telefono,
            leadManagementService.formatMensajeBienvenidaReferido(
              result.referido!.nombre,
              result.referidorNombre!
            )
          );
        } catch (e) {
          console.error('⚠️ No se pudo enviar mensaje al referido:', e);
        }
        return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLUJO POST-VISITA - Procesar respuestas del vendedor
  // ═══════════════════════════════════════════════════════════════════════════
  private async procesarPostVisitaVendedor(vendedorId: string, mensaje: string): Promise<any | null> {
    try {
      const postVisitService = new (await import('../services/postVisitService')).PostVisitService(this.supabase);
      const result = await postVisitService.procesarRespuestaVendedor(vendedorId, mensaje);
      return result;
    } catch (e) {
      console.error('⚠️ Error procesando post-visita:', e);
      return null;
    }
  }

  // Buscar por teléfono (para cuando el vendedor usa un teléfono override)
  private async buscarYProcesarPostVisitaPorPhone(phone: string, mensaje: string): Promise<any | null> {
    try {
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      console.log(`📋 POST-VISITA SEARCH: Buscando phoneSuffix=${phoneSuffix}`);

      const postVisitService = new (await import('../services/postVisitService')).PostVisitService(this.supabase);

      // Buscar todos los team_members y ver si alguno tiene post_visit_context con este teléfono
      const { data: teamMembers, error } = await this.supabase.client
        .from('team_members')
        .select('id, name, notes');

      console.log(`📋 POST-VISITA SEARCH: team_members encontrados=${teamMembers?.length || 0}, error=${error?.message || 'ninguno'}`);

      if (!teamMembers) return null;

      let foundAnyContext = false;
      for (const tm of teamMembers) {
        // IMPORTANTE: notes puede ser string (JSON) u objeto
        let notas: any = {};
        if (tm.notes) {
          if (typeof tm.notes === 'string') {
            try {
              notas = JSON.parse(tm.notes);
            } catch (e) {
              notas = {};
            }
          } else if (typeof tm.notes === 'object') {
            notas = tm.notes;
          }
        }
        const context = notas.post_visit_context;

        // Log si tiene ALGÚN contenido en notas
        const notasKeys = Object.keys(notas);
        if (notasKeys.length > 0) {
          console.log(`📋 POST-VISITA SEARCH: ${tm.name} tiene notas con keys=[${notasKeys.join(',')}]`);
        }

        if (context) {
          foundAnyContext = true;
          // Verificar si el teléfono coincide con vendedor_phone del contexto
          const contextPhone = context.vendedor_phone?.replace(/\D/g, '').slice(-10);
          console.log(`📋 POST-VISITA SEARCH: ${tm.name} tiene post_visit_context con vendedor_phone=${contextPhone}`);
          if (contextPhone === phoneSuffix) {
            console.log(`📋 POST-VISITA: ¡MATCH! Encontrado contexto para ${tm.name}`);
            const result = await postVisitService.procesarRespuestaVendedor(tm.id, mensaje);
            return result;
          }
        }
      }

      if (!foundAnyContext) {
        console.log(`📋 POST-VISITA SEARCH: NINGÚN team_member tiene post_visit_context`);
      }

      console.log(`📋 POST-VISITA SEARCH: No se encontró contexto con phone=${phoneSuffix}`);
      return null;
    } catch (e) {
      console.error('⚠️ Error buscando post-visita por phone:', e);
      return null;
    }
  }

  private async ejecutarAccionPostVisita(result: any): Promise<void> {
    const postVisitService = new (await import('../services/postVisitService')).PostVisitService(this.supabase);

    try {
      switch (result.accion) {
        case 'enviar_encuesta_lead':
          // Enviar encuesta al lead
          if (result.datos?.lead_phone) {
            const mensajeEncuesta = postVisitService.generarMensajeEncuestaLead(
              result.datos.lead_name,
              result.datos.property
            );
            await this.meta.sendWhatsAppMessage(result.datos.lead_phone, mensajeEncuesta);
            console.log(`📋 Encuesta enviada a lead ${result.datos.lead_name}`);
          }
          break;

        case 'crear_followup':
          // Enviar follow-up al lead por no-show
          if (result.datos?.lead_phone) {
            const mensajeFollowup = postVisitService.generarMensajeNoShowFollowup(
              result.datos.lead_name,
              result.datos.property
            );
            await this.meta.sendWhatsAppMessage(result.datos.lead_phone, mensajeFollowup);
            console.log(`📱 Follow-up no-show enviado a ${result.datos.lead_name}`);
          }
          break;

        case 'reagendar':
          // Crear nueva cita
          if (result.datos) {
            const { lead_id, lead_phone, lead_name, property, fecha, vendedor_id } = result.datos;

            // Crear cita en la base de datos
            await this.supabase.client.from('appointments').insert({
              lead_id,
              team_member_id: vendedor_id,
              scheduled_date: fecha.toISOString(),
              status: 'scheduled',
              property,
              notes: 'Reagendada desde post-visita',
              created_at: new Date().toISOString()
            });

            // Notificar al lead
            const fechaFormateada = fecha.toLocaleDateString('es-MX', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit'
            });
            const nombreCorto = lead_name.split(' ')[0];

            // Obtener link de Google Maps si existe para la ubicación
            const mapsLink = this.getLocationMapsLink(property);
            const ubicacionText = mapsLink
              ? `🏠 ${property}\n📍 ${mapsLink}`
              : `🏠 ${property}`;

            await this.meta.sendWhatsAppMessage(
              lead_phone,
              `¡Hola ${nombreCorto}! 📅\n\n` +
              `Tu cita ha sido reagendada para:\n\n` +
              `📆 *${fechaFormateada}*\n` +
              `${ubicacionText}\n\n` +
              `¡Te esperamos! 😊`
            );
            console.log(`📅 Cita reagendada para ${lead_name}: ${fechaFormateada}`);
          }
          break;

        case 'marcar_lost':
          // Ya se marcó en el service, solo log
          console.error(`❌ Lead ${result.datos?.lead_id} marcado como lost: ${result.datos?.razon}`);
          break;
      }
    } catch (e) {
      console.error('⚠️ Error ejecutando acción post-visita:', e);
    }
  }

  // Mapeo de ubicaciones conocidas a sus links de Google Maps
  private getLocationMapsLink(location: string): string | null {
    const locationLower = location.toLowerCase();

    // Mapeo de ubicaciones a Google Maps links
    const locationMaps: { [key: string]: string } = {
      // Oficinas
      'oficinas de santarita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
      'oficinas santarita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
      'santarita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
      'santa rita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
      // Agregar más ubicaciones aquí según sea necesario
    };

    // Buscar coincidencia
    for (const [key, link] of Object.entries(locationMaps)) {
      if (locationLower.includes(key)) {
        return link;
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INICIAR FLUJO POST-VISITA (llamado desde cron o endpoint)
  // ═══════════════════════════════════════════════════════════════════════════
  async iniciarPostVisita(appointment: any, lead: any, vendedor: any): Promise<string | null> {
    try {
      const postVisitService = new (await import('../services/postVisitService')).PostVisitService(this.supabase);
      const { mensaje, context } = await postVisitService.iniciarFlujoPostVisita(appointment, lead, vendedor);

      // Enviar mensaje al vendedor
      await this.meta.sendWhatsAppMessage(vendedor.phone, mensaje);
      console.log(`📋 Post-visita iniciada para ${lead.name} → vendedor ${vendedor.name}`);

      return mensaje;
    } catch (e) {
      console.error('⚠️ Error iniciando post-visita:', e);
      return null;
    }
  }
}
