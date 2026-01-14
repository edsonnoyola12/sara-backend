import { SupabaseService } from '../services/supabase';
import { ClaudeService } from '../services/claude';
import { TwilioService } from '../services/twilio';
import { FollowupService } from '../services/followupService';
import { FollowupApprovalService } from '../services/followupApprovalService';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { scoringService, LeadStatus } from '../services/leadScoring';
import { resourceService } from '../services/resourceService';
import { CalendarService } from '../services/calendar';
import { ReportsService } from '../services/reportsService';
import { BridgeService } from '../services/bridgeService';
import { VendorCommandsService, VendorRouteResult } from '../services/vendorCommandsService';
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
import { parseFechaEspanol, ParsedFecha } from '../utils/dateParser';
import { ConversationContextService } from '../services/conversationContextService';
import { CEOCommandsService } from '../services/ceoCommandsService';
import { AgenciaCommandsService } from '../services/agenciaCommandsService';
import { LeadMessageService, LeadMessageResult } from '../services/leadMessageService';

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
        console.log('⚠️ No hay asesor disponible');
        return;
      }

      // Obtener lead fresco para la notificación
      const { data: leadActual } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('id', lead.id)
        .single();

      const leadData = leadActual || lead;

      // Notificar al asesor
      if (result.asesor.phone) {
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
      console.log('⚠️ Error finalizando flujo crédito:', e);
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
      console.log('⚠️ Error actualizando score:', e);
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
        console.log('⚠️ Ignorando status callback');
        return;
      }
      
      // Filtrar mensajes vacíos o status
      const ignoredMessages = ['OK', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'QUEUED'];
      if (!trimmedBody || ignoredMessages.includes(trimmedBody.toUpperCase())) {
        console.log('⚠️ Ignorando:', trimmedBody);
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
            console.log('⚠️ RESET rechazado - Lead tiene más de 24h:', leadTest.name);
          }
        }
      }

      // Obtener datos
      const [lead, properties, teamMembers] = await Promise.all([
        this.getOrCreateLead(cleanPhone),
        this.getAllProperties(),
        this.getAllTeamMembers()
      ]);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ACTUALIZAR ÚLTIMA ACTIVIDAD DEL LEAD
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lead?.id) {
        await this.supabase.client.from('leads')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', lead.id);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CANCELAR FOLLOW-UPS PENDIENTES (el lead respondió)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      try {
        const followupService = new FollowupService(this.supabase);
        const cancelados = await followupService.cancelarPorRespuesta(lead.id, cleanPhone);
        if (cancelados > 0) {
          console.log(`📭 ${cancelados} follow-ups cancelados - lead respondió`);
        }
      } catch (e) {
        console.log('⚠️ Error cancelando follow-ups:', e);
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
        console.log('⚠️ Error procesando respuesta de encuesta:', e);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DETECTAR RESPUESTA A TEMPLATE (activar SARA)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log('🔍 DEBUG Lead:', lead.name, '| template_sent:', lead.template_sent);

      if (lead.template_sent) {
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
            console.log('❌ Lead quiere cancelar/cambiar cita:', body);
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
      if (lead.status === 'sold') {
        const referidoResult = await this.detectarYCrearReferido(lead, body, cleanPhone, from);
        if (referidoResult) {
          return; // Ya se procesó el referido
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DETECTAR SI ES VENDEDOR/ASESOR
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const vendedor = teamMembers.find((tm: any) => {
        if (!tm.phone) return false;
        const tmPhone = tm.phone.replace(/\D/g, '').slice(-10);
        const msgPhone = cleanPhone.replace(/\D/g, '').slice(-10);
        return tmPhone === msgPhone;
      });

      if (vendedor) {
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
                console.log('❌ Error enviando a cliente:', e);
                return false;
              }
            },
            async (phone, message) => {
              try {
                // Enviar al vendedor
                await this.meta.sendWhatsAppMessage(phone, message);
                return true;
              } catch (e) {
                console.log('❌ Error enviando a vendedor:', e);
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

        // ═══ Actualizar última interacción con SARA (para templates de reactivación) ═══
        try {
          await this.supabase.client
            .from('team_members')
            .update({ last_sara_interaction: new Date().toISOString() })
            .eq('id', vendedor.id);
        } catch (e) {
          console.log('⚠️ Error actualizando last_sara_interaction:', e);
        }

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
      // PROCESAR MENSAJE DE LEAD (delegado a LeadMessageService)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const leadMessageService = new LeadMessageService(this.supabase);
      const leadResult = await leadMessageService.processLeadMessage(lead, body, cleanPhone);

      // Ejecutar resultado del servicio
      if (leadResult.action === 'handled') {
        // Handler especial para encuestas
        if (leadResult.response === '__SURVEY__') {
          console.log('📋 Lead en encuesta, step:', lead.survey_step);
          await this.handleSurveyResponse(from, body, lead);
          return;
        }

        // Actualizar lead si es necesario
        if (leadResult.updateLead) {
          await this.supabase.client.from('leads').update(leadResult.updateLead).eq('id', lead.id);
        }

        // Enviar respuesta al lead
        if (leadResult.response) {
          if (leadResult.sendVia === 'meta') {
            await this.meta.sendWhatsAppMessage(cleanPhone, leadResult.response);
          } else {
            await this.twilio.sendWhatsAppMessage(from, leadResult.response);
          }
        }

        // Notificar al vendedor si es necesario
        if (leadResult.notifyVendor) {
          await this.meta.sendWhatsAppMessage(leadResult.notifyVendor.phone, leadResult.notifyVendor.message);
        }

        return;
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

    const ceoService = new CEOCommandsService(this.supabase);
    const result = ceoService.detectCommand(mensaje, body, nombreCEO);

    switch (result.action) {
      case 'send_message':
        await this.twilio.sendWhatsAppMessage(from, result.message!);
        return;

      case 'call_handler':
        await this.executeCEOHandler(from, body, ceo, nombreCEO, teamMembers, result.handlerName!, result.handlerParams);
        return;

      case 'not_recognized':
        await this.twilio.sendWhatsAppMessage(from, result.message!);
        return;
    }
  }

  private async executeCEOHandler(from: string, body: string, ceo: any, nombreCEO: string, teamMembers: any[], handlerName: string, params?: any): Promise<void> {
    const ceoService = new CEOCommandsService(this.supabase);

    // ━━━ PRIMERO: Intentar ejecutar via servicio centralizado ━━━
    const handlerResult = await ceoService.executeHandler(
      handlerName,
      nombreCEO,
      params || {}
    );

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

      default:
        console.log('Handler CEO no reconocido:', handlerName);
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
      console.log('📤 BROADCAST: body =', body);
      console.log('📤 BROADCAST: supabase client =', this.supabase ? 'OK' : 'NULL');

      const agenciaService = new AgenciaReportingService(this.supabase);

      // Parsear el comando
      const parsed = agenciaService.parseEnvioSegmento(body);
      console.log('📤 BROADCAST: parsed =', JSON.stringify(parsed));

      // Si no hay mensaje, mostrar ayuda
      if (!parsed.mensajeTemplate) {
        console.log('📤 BROADCAST: No hay mensaje template, mostrando ayuda');
        await this.twilio.sendWhatsAppMessage(from, agenciaService.getMensajeFormatosEnvio());
        return;
      }

      // Obtener leads filtrados
      console.log('📤 BROADCAST: Llamando getLeadsParaEnvio con filtros:', JSON.stringify({
        segmento: parsed.segmento,
        desarrollo: parsed.desarrollo,
        vendedorNombre: parsed.vendedorNombre
      }));

      const resultado = await agenciaService.getLeadsParaEnvio({
        segmento: parsed.segmento,
        desarrollo: parsed.desarrollo,
        vendedorNombre: parsed.vendedorNombre,
        fechaDesde: parsed.fechaDesde,
        fechaHasta: parsed.fechaHasta
      });

      console.log('📤 BROADCAST: Resultado getLeadsParaEnvio - error:', resultado.error, 'leads:', resultado.leads?.length);

      // Si hay error, mostrarlo
      if (resultado.error) {
        await this.twilio.sendWhatsAppMessage(from, resultado.error);
        return;
      }

      // Notificar inicio
      await this.twilio.sendWhatsAppMessage(from,
        `📤 *Iniciando envío...*\n\n` +
        `Filtro: ${resultado.filtroDescripcion}\n` +
        `Destinatarios: ${resultado.leads.length}\n\n` +
        `⏳ Esto puede tomar unos minutos...`
      );

      // Ejecutar envío
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

      // Notificar resultado
      await this.twilio.sendWhatsAppMessage(from,
        `✅ *Envío completado*\n\n` +
        `📊 Resultados:\n` +
        `• Enviados: ${enviados}\n` +
        `• Templates usados: ${templateUsados}\n` +
        `• Errores: ${errores}\n` +
        `• Total: ${resultado.leads.length}`
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

      const leadsCount = await promosService.contarLeadsSegmento(datos.segmento);
      const mensaje = promosService.formatPromocionCreada(datos, leadsCount);
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
    // 1. OBTENER NOTAS Y PROCESAR ESTADOS PENDIENTES
    // ═══════════════════════════════════════════════════════════
    const { notes, notasVendedor } = await vendorService.getVendedorNotes(vendedor.id);
    
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

    // ═══════════════════════════════════════════════════════════
    // 2. INTERCEPCIÓN TEMPRANA DE COMANDOS CRÍTICOS
    // ═══════════════════════════════════════════════════════════
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
    // 3. CONFIRMACIONES PENDIENTES (respuestas "1", "2", "si", "no")
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
   * Procesa el resultado de confirmación de asistencia
   */
  private async processShowConfirmationResult(from: string, showResult: any, confirmacion: any): Promise<void> {
    await this.meta.sendWhatsAppMessage(from, showResult.mensajeVendedor);

    if (showResult.tipo === 'si_llego' && showResult.needsClientSurvey && showResult.leadPhone && showResult.leadId) {
      const nombreCliente = showResult.leadName?.split(' ')[0] || 'amigo';
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
    const vendorService = new VendorCommandsService(this.supabase);
    const result = vendorService.detectRouteCommand(body, mensaje);

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
        await this.vendedorAgregarNota(from, body, vendedor, nombreVendedor);
        break;
      case 'vendedorVerNotas':
        await this.vendedorVerNotas(from, body, vendedor, nombreVendedor);
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

      default:
        console.log('Handler vendedor no reconocido (fallback):', result.handlerName);
        return false;
    }

    return true;
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
    // Formato: "Hilda al siguiente"
    const matchSiguiente = body.match(/(?:mover\s+(?:a\s+)?)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:al?\s+)?(?:siguiente|proximo|próximo|avanzar|adelante)/i);
    if (matchSiguiente) {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.moveFunnelStep(matchSiguiente[1].trim(), vendedor.id, vendedor.role, 'next');
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || 'Error al mover lead');
        return;
      }
      if (result.multipleLeads) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeads(result.multipleLeads));
        return;
      }
      await this.vendedorCambiarEtapaConNombre(from, result.lead!.name, vendedor, result.newStatus!, vendorService.getFunnelStageLabel(result.newStatus!));
      return;
    }

    // Formato: "Hilda atrás"
    const matchAtras = body.match(/(?:regresar\s+(?:a\s+)?)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:para\s+)?(?:atras|atrás|regresar|anterior)/i);
    if (matchAtras) {
      const vendorService = new VendorCommandsService(this.supabase);
      const result = await vendorService.moveFunnelStep(matchAtras[1].trim(), vendedor.id, vendedor.role, 'prev');
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, result.error || 'Error al mover lead');
        return;
      }
      if (result.multipleLeads) {
        await this.twilio.sendWhatsAppMessage(from, vendorService.formatMultipleLeads(result.multipleLeads));
        return;
      }
      await this.vendedorCambiarEtapaConNombre(from, result.lead!.name, vendedor, result.newStatus!, vendorService.getFunnelStageLabel(result.newStatus!));
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
      // Notificar vendedor si es necesario
      if (handlerResult.vendedorPhone && handlerResult.vendedorMessage) {
        await this.twilio.sendWhatsAppMessage(
          this.formatPhoneMX(handlerResult.vendedorPhone),
          handlerResult.vendedorMessage
        );
      }
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
          console.log('⚠️ Error notificando vendedor:', e);
        }
      }

      // PROGRAMAR FOLLOW-UPS automáticos según nuevo status
      try {
        const followupService = new FollowupService(this.supabase);
        await followupService.programarFollowups(lead.id, lead.phone || '', lead.name, 'Por definir', 'status_change', nuevaEtapa);
        console.log(`📌 Follow-ups programados para ${lead.name} (${nuevaEtapa})`);
      } catch (e) {
        console.log('⚠️ Error programando follow-ups:', e);
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
      } catch (e) { console.log('⚠️ Error follow-ups:', e); }

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

      // Notificar al asesor si existe
      if (result.asesor?.phone) {
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

      // Notificar al asesor si existe
      if (result.asesor?.phone) {
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

      // Notificar al asesor
      await this.twilio.sendWhatsAppMessage(result.asesor.phone, vendorService.formatMensajeAsesorNuevoLead(result.lead, result.vendedor));
      // Confirmar al vendedor
      await this.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionAsesorAsignado(result.lead, result.asesor));
      console.log(`✅ Lead ${result.lead.name} asignado a asesor ${result.asesor.name}`);
    } catch (e) {
      console.log('❌ Error asignando asesor:', e);
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

      // Enviar mensaje al asesor
      await this.twilio.sendWhatsAppMessage(result.asesor.phone, vendorService.formatMensajeAsesorPregunta(result.lead, result.solicitud, result.vendedor));
      // Confirmar al vendedor
      await this.twilio.sendWhatsAppMessage(from, vendorService.formatConfirmacionPreguntaEnviada(result.asesor, result.lead));
      console.log(`✅ Pregunta enviada a asesor ${result.asesor.name} sobre ${result.lead.name}`);
    } catch (e) {
      console.log('❌ Error preguntando a asesor:', e);
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
      console.log('❌ Error mostrando teléfono:', e);
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
      console.log('❌ Error preparando mensaje:', e);
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
      console.log('❌ Error enviando mensaje pendiente:', e);
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
      console.log('❌ Error en vendedorRegistrarApartado:', e);
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

    // Notificar al asesor si fue asignado
    if (result.asesor?.phone) {
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
        await this.twilio.sendWhatsAppMessage(from, schedulingService.formatMultipleLeadsCita(result.multipleLeads));
        return;
      }
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, `❌ ${result.error}`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, schedulingService.formatAgendarCitaExito(result));
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
        let msg = `🤝 Encontré ${result.multipleLeads.length} leads:\n\n`;
        result.multipleLeads.forEach((l: any, i: number) => {
          msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
        });
        msg += `\nEscribe nombre completo.`;
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
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }
      if (!result.success) {
        await this.twilio.sendWhatsAppMessage(from, `⚠️ ${result.error}`);
        return;
      }

      await this.twilio.sendWhatsAppMessage(from, schedulingService.formatReagendarCitaExito(result));
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
    try {
      const iaService = new IACoachingService(this.supabase, this.claude);
      const { intent } = await iaService.classifyIntent(body);

      // Ejecutar según intent
      switch (intent) {
        case 'pregunta_propiedades':
        case 'pregunta_ventas':
        case 'ayuda_citas':
        case 'ayuda_notas':
        case 'ayuda_ventas':
        case 'ayuda_general':
          await this.vendedorRespuestaInteligente(from, body, vendedor, nombre);
          break;
        case 'briefing':
          await this.vendedorBriefing(from, vendedor, nombre);
          break;
        case 'ver_citas':
          await this.vendedorCitasHoy(from, vendedor, nombre);
          break;
        case 'ver_meta':
          await this.vendedorMetaAvance(from, vendedor, nombre);
          break;
        case 'ver_leads':
          await this.vendedorResumenLeads(from, vendedor, nombre);
          break;
        case 'agendar_cita':
          await this.vendedorAgendarCitaCompleta(from, body, vendedor, nombre);
          break;
        case 'cancelar_cita':
          await this.vendedorCancelarCita(from, body, vendedor, nombre);
          break;
        case 'reagendar_cita':
          await this.vendedorReagendarCita(from, body, vendedor, nombre);
          break;
        case 'cerrar_venta':
          await this.vendedorCerrarVenta(from, body, vendedor, nombre);
          break;
        case 'cambiar_etapa':
          await this.vendedorCambiarEtapa(from, body, vendedor, nombre);
          break;
        case 'agregar_nota':
          await this.vendedorAgregarNota(from, body, vendedor, nombre);
          break;
        case 'ver_notas':
          await this.vendedorVerNotas(from, body, vendedor, nombre);
          break;
        case 'crear_lead':
          await this.vendedorCrearLead(from, body, vendedor, nombre);
          break;
        default:
          await this.vendedorRespuestaInteligente(from, body, vendedor, nombre);
      }
    } catch (error) {
      console.error('❌ Error en IA Intent:', error);
      await this.vendedorAyuda(from, nombre);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RESPUESTA INTELIGENTE CON CLAUDE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async vendedorRespuestaInteligente(from: string, mensaje: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const iaService = new IACoachingService(this.supabase, this.claude);
      const respuesta = await iaService.generateSmartResponse(mensaje, vendedor, nombre);
      await this.twilio.sendWhatsAppMessage(from, respuesta);
    } catch (error) {
      console.error('❌ Error en respuesta inteligente:', error);
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
  // CONFIRMACIÓN DE CITA AL LEAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async hayReagendarPendiente(vendedorId: string): Promise<boolean> {
    // Buscar leads con pending_reagendar del vendedor actual
    const { data, error } = await this.supabase.client
      .from('leads')
      .select('id, name, notes')
      .not('notes', 'is', null)
      .limit(50);

    console.log('🔍 hayReagendarPendiente - buscando para vendedor:', vendedorId);
    console.log('🔍 hayReagendarPendiente - leads con notes:', data?.length);

    const conReagendar = data?.filter((l: any) => {
      const tiene = l.notes?.pending_reagendar?.vendedor_id === vendedorId;
      if (l.notes?.pending_reagendar) {
        console.log('🔍 Lead con pending_reagendar:', l.name, l.notes.pending_reagendar);
      }
      return tiene;
    });

    console.log('🔍 hayReagendarPendiente - encontrados:', conReagendar?.length);
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
      const metaMensual = 5; // Meta default por vendedor
      const data = await vendorService.getMetaAvance(vendedor.id, metaMensual);
      const mensaje = vendorService.formatMetaAvance(data, nombre);
      await this.twilio.sendWhatsAppMessage(from, mensaje);
    } catch (e) {
      console.log('Error en meta avance:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener meta.');
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

  private async getOrCreateLead(phone: string): Promise<any> {
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
      console.log('⚠️ No hay vendedores activos');
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

    console.log('⚠️ No se encontró vendedor con nombre:', nombreBuscado);
    return null;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPER: Obtener URL del brochure - Usa resourceService centralizado
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private getBrochureUrl(desarrollo: string, modelo?: string): string {
    return resourceService.getBrochureUrl(desarrollo, modelo) || '';
  }

  private async getAllProperties(): Promise<any[]> {
    const propertyService = new PropertyService(this.supabase);
    return propertyService.getAllProperties();
  }

  private findPropertyByDevelopment(properties: any[], desarrollo: string): any | null {
    const propertyService = new PropertyService(this.supabase);
    return propertyService.findPropertyByDevelopment(properties, desarrollo);
  }

  // ✅ FIX 07-ENE-2026: Búsqueda robusta de miembro del equipo
  private findTeamMemberByRole(teamMembers: any[], role: string, banco?: string): any | null {
    if (!teamMembers?.length) {
      console.log('⚠️ findTeamMemberByRole: Sin miembros del equipo');
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

    console.log(`⚠️ No se encontró ${role} en el equipo`);
    return null;
  }

  private async getAllTeamMembers(): Promise<any[]> {
    try {
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
        console.log('⚠️ Usando fallback sin filtro active:', fallback?.length || 0, 'miembros');
        return fallback || [];
      }

      console.log(`👥 Team members cargados: ${data?.length || 0} activos`);

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
        console.log('⚠️ No hay foto disponible');
        return null;
      }
      
      console.log('📸 Foto a usar:', photoUrl);
      
      const imgResponse = await fetch(photoUrl);
      if (!imgResponse.ok) {
        console.log('⚠️ Error descargando imagen');
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
        console.log(`⚠️ Veo 3 Error API (${response.status}):`, errorText);
        return null;
      }

      const result = await response.json();
      
      if (result.error) {
         console.log('❌ Google rechazó:', JSON.stringify(result.error));
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
      console.log('❌ Excepción en generarVideoBienvenida:', e);
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
    env: any
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
        teamMembers, analysis, properties, env
      };
      const result = await appointmentService.crearCitaCompleta(params);

      // Manejar errores
      if (!result.success) {
        if (result.errorType === 'duplicate') {
          console.log('⚠️ Cita duplicada detectada, no se crea nueva');
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
        const msgVendedor = appointmentService.formatMensajeVendedorNuevaCita(result, desarrollo, fecha, hora);
        await this.twilio.sendWhatsAppMessage(vendedor.phone, msgVendedor);
        console.log('📤 Notificación enviada a vendedor');
      }

      // 2. Notificar al ASESOR HIPOTECARIO (si necesita crédito)
      if (necesitaCredito && asesorHipotecario?.phone) {
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
      console.log('⚠️ Error en video bienvenida:', videoErr);
    }
  }

  // [CÓDIGO MIGRADO A AppointmentService - 11-ENE-2026]
  // Todo el manejo de Calendar, mensajes a vendedor/asesor/cliente, cumpleaños y video
  // ahora se hace vía AppointmentService.crearCitaCompleta()

  // [FIN CÓDIGO MIGRADO - Las ~380 líneas de código viejo fueron eliminadas]
  // Ahora AppointmentService maneja: DB, Calendar, mensajes vendedor/asesor/cliente, score

  // TODO: Eliminar este bloque en limpieza posterior
  // El código viejo de Calendar (~380 líneas) fue eliminado
  // Ahora se maneja en AppointmentService.crearCitaCompleta()

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
        console.log('❌ Error en mortgage:', result.error);
        return;
      }

      // ═══ ENVIAR NOTIFICACIONES SEGÚN LA ACCIÓN ═══
      const { asesor, action, cambios } = result;

      if (action === 'created' && asesor?.phone) {
        // Nuevo lead hipotecario - notificar asesor
        const msg = mortgageService.formatMensajeNuevoLead(result);
        await this.twilio.sendWhatsAppMessage(asesor.phone, msg);
        console.log('📤 Asesor notificado de NUEVO lead:', asesor.name);
      } else if (action === 'updated' && cambios.length > 0 && asesor?.phone) {
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
      console.log('❌ Error en crearOActualizarMortgageApplication:', e);
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

  private async mostrarActividadesHoy(from: string, vendedor: any): Promise<void> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data: actividades } = await this.supabase.client
      .from('lead_activities')
      .select('activity_type, amount, created_at, leads:lead_id (name)')
      .eq('team_member_id', vendedor.id)
      .gte('created_at', hoy.toISOString())
      .order('created_at', { ascending: false });

    if (!actividades || actividades.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 
        'No registraste actividad hoy.\n\nRegistra con:\n- "Llame a Juan"\n- "Visite a Maria"\n- "Cotizacion a Pedro 850k"');
      return;
    }

    // Agrupar por tipo
    const resumen: Record<string, string[]> = {
      'call': [],
      'visit': [],
      'quote': [],
      'whatsapp': [],
      'email': []
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

    msg += '\nTotal: ' + actividades.length + ' actividades';

    await this.twilio.sendWhatsAppMessage(from, msg);
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

        // Guardar feedback en el lead
        await encuestasService.guardarRespuestaPostVisita(leadConEncuesta.id, notas, respuesta.tipo, mensaje);

        // Notificar al vendedor
        if (survey.vendedor_id) {
          const vendedorPhone = await encuestasService.obtenerTelefonoVendedor(survey.vendedor_id);
          if (vendedorPhone) {
            await this.twilio.sendWhatsAppMessage(vendedorPhone, respuesta.notificarVendedor);
            console.log(`📤 Notificación enviada a vendedor ${survey.vendedor_name}`);
          }
        }

        console.log(`✅ Encuesta post-visita procesada: ${respuesta.tipo}`);
        return respuesta.feedbackCliente;
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
          console.log('⚠️ No se pudo enviar mensaje al referido:', e);
        }
        return true;
    }

    return false;
  }
}
