// ═══════════════════════════════════════════════════════════════════════════
// API BI ROUTES - Dashboard, Metrics, Reports, Templates, Calendar, Docs,
// Flags, Audit, Cache, Pipeline, Financing, Compare, Probability, Visits,
// Offers, Alerts, Market, CLV, Webhooks, Team, Tracking, SLA, Assignment,
// Attribution, HeyGen Videos, Status, Analytics, Backup
// Extracted from index.ts for better code organization
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { CalendarService } from '../services/calendar';
import { CacheService } from '../services/cacheService';
import { PipelineService, formatPipelineForWhatsApp } from '../services/pipelineService';
import { FinancingCalculatorService } from '../services/financingCalculatorService';
import { PropertyComparatorService } from '../services/propertyComparatorService';
import { CloseProbabilityService } from '../services/closeProbabilityService';
import { VisitManagementService } from '../services/visitManagementService';
import { OfferTrackingService } from '../services/offerTrackingService';
import { SmartAlertsService } from '../services/smartAlertsService';
import { createLinkTracking } from '../services/linkTrackingService';
import { createSLAMonitoring } from '../services/slaMonitoringService';
import { createAutoAssignment } from '../services/autoAssignmentService';
import { createLeadAttribution } from '../services/leadAttributionService';
import { createTTSTrackingService } from '../services/ttsTrackingService';
import { createMessageTrackingService } from '../services/messageTrackingService';
import { createAuditLog } from '../services/auditLogService';
import { createMetrics } from '../services/metricsService';
import { createBusinessHours } from '../services/businessHoursService';
import { createSentimentAnalysis } from '../services/sentimentAnalysisService';
import { createWhatsAppTemplates } from '../services/whatsappTemplatesService';
import { createOutgoingWebhooks } from '../services/outgoingWebhooksService';
import { createTeamDashboard } from '../services/teamDashboardService';
import { createEmailReports } from '../services/emailReportsService';
import { createFeatureFlags } from '../services/featureFlagsService';
import { generateOpenAPISpec, generateSwaggerUI, generateReDocUI } from '../services/apiDocsService';
import { getSystemStatus, getAnalyticsDashboard, renderStatusPage, renderAnalyticsPage, exportBackup } from '../crons/dashboard';
import { getObservabilityDashboard } from '../services/observabilityService';
import { buildCotizacionFromOffer, generateCotizacionHTML } from '../services/cotizacionService';
import { DevelopmentFunnelService } from '../services/developmentFunnelService';
import { ReferralService } from '../services/referralService';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  API_SECRET?: string;
  SARA_CACHE?: KVNamespace;
  RESEND_API_KEY?: string;
  REPORT_TO_EMAILS?: string;
  OPENAI_API_KEY?: string;
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;
  VEO_API_KEY?: string;
  GEMINI_API_KEY?: string;
  HEYGEN_API_KEY?: string;
  META_WHATSAPP_BUSINESS_ID?: string;
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
}

type CorsResponseFn = (body: string | null, status?: number, contentType?: string, request?: Request) => Response;
type CheckApiAuthFn = (request: Request, env: Env) => Response | null;

export async function handleApiBiRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  cache: CacheService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn
): Promise<Response | null> {

    // ═══════════════════════════════════════════════════════════
    // API Routes - Dashboard
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/dashboard/kpis' && request.method === 'GET') {
      // OPTIMIZADO: Solo seleccionar campo 'status' en lugar de '*'
      const { data: leads } = await supabase.client.from('leads').select('status');
      const kpis = {
        total: leads?.length || 0,
        new: leads?.filter((l: any) => l.status === 'new').length || 0,
        contacted: leads?.filter((l: any) => l.status === 'contacted').length || 0,
        qualified: leads?.filter((l: any) => l.status === 'qualified').length || 0,
        appointment_scheduled: leads?.filter((l: any) => l.status === 'appointment_scheduled').length || 0,
        converted: leads?.filter((l: any) => l.status === 'converted').length || 0
      };
      return corsResponse(JSON.stringify(kpis));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Métricas de Conversación
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/metrics/conversation' && request.method === 'GET') {
      const dias = parseInt(url.searchParams.get('days') || '7');
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);

      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, status, score, created_at, conversation_history, property_interest, source')
        .gte('created_at', fechaInicio.toISOString());

      const { data: appointments } = await supabase.client
        .from('appointments')
        .select('id, lead_id, status, scheduled_date')
        .gte('created_at', fechaInicio.toISOString());

      // Calcular métricas
      const leadsConHistorial = (leads || []).filter((l: any) => l.conversation_history?.length > 0);
      const totalMensajes = leadsConHistorial.reduce((sum: number, l: any) => sum + (l.conversation_history?.length || 0), 0);
      const mensajesUsuario = leadsConHistorial.reduce((sum: number, l: any) =>
        sum + (l.conversation_history?.filter((m: any) => m.role === 'user').length || 0), 0);
      const mensajesSara = leadsConHistorial.reduce((sum: number, l: any) =>
        sum + (l.conversation_history?.filter((m: any) => m.role === 'assistant').length || 0), 0);

      // Detectar intenciones en mensajes
      const intenciones: Record<string, number> = {
        saludo: 0,
        precio: 0,
        ubicacion: 0,
        cita: 0,
        credito: 0,
        objecion: 0,
        otro: 0
      };

      // Detectar objeciones
      const objeciones: Record<string, number> = {
        'muy caro': 0,
        'no me interesa': 0,
        'lo voy a pensar': 0,
        'ya compré': 0,
        'no me alcanza': 0
      };

      leadsConHistorial.forEach((lead: any) => {
        (lead.conversation_history || []).forEach((msg: any) => {
          if (msg.role === 'user') {
            const content = (msg.content || '').toLowerCase();

            // Detectar intención
            if (content.match(/hola|buenos|buenas|hi|hello/)) intenciones.saludo++;
            else if (content.match(/precio|costo|cuanto|cuánto|presupuesto/)) intenciones.precio++;
            else if (content.match(/donde|ubicación|ubicacion|gps|dirección/)) intenciones.ubicacion++;
            else if (content.match(/cita|visita|ver|conocer|agendar/)) intenciones.cita++;
            else if (content.match(/crédito|credito|infonavit|fovissste|banco|financ/)) intenciones.credito++;
            else if (content.match(/caro|no me interesa|pensar|no gracias|no puedo/)) intenciones.objecion++;
            else intenciones.otro++;

            // Detectar objeciones específicas
            if (content.includes('muy caro') || content.includes('caro')) objeciones['muy caro']++;
            if (content.includes('no me interesa') || content.includes('no gracias')) objeciones['no me interesa']++;
            if (content.includes('pensar') || content.includes('después')) objeciones['lo voy a pensar']++;
            if (content.includes('ya compré') || content.includes('ya tengo casa')) objeciones['ya compré']++;
            if (content.includes('no me alcanza') || content.includes('no tengo')) objeciones['no me alcanza']++;
          }
        });
      });

      // Calcular conversiones
      const statusCounts: Record<string, number> = {};
      (leads || []).forEach((l: any) => {
        statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
      });

      // Fuentes de leads
      const sourcesCounts: Record<string, number> = {};
      (leads || []).forEach((l: any) => {
        const source = l.source || 'desconocido';
        sourcesCounts[source] = (sourcesCounts[source] || 0) + 1;
      });

      // Desarrollos más consultados
      const desarrollosCounts: Record<string, number> = {};
      (leads || []).forEach((l: any) => {
        if (l.property_interest) {
          desarrollosCounts[l.property_interest] = (desarrollosCounts[l.property_interest] || 0) + 1;
        }
      });

      // Citas completadas vs no-shows
      const citasCompletadas = (appointments || []).filter((a: any) => a.status === 'completed').length;
      const citasNoShow = (appointments || []).filter((a: any) => a.status === 'no_show').length;
      const citasCanceladas = (appointments || []).filter((a: any) => a.status === 'cancelled').length;

      const metrics = {
        periodo: `últimos ${dias} días`,
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: new Date().toISOString().split('T')[0],

        leads: {
          total: leads?.length || 0,
          con_conversacion: leadsConHistorial.length,
          sin_conversacion: (leads?.length || 0) - leadsConHistorial.length,
          por_status: statusCounts,
          por_fuente: sourcesCounts
        },

        conversaciones: {
          total_mensajes: totalMensajes,
          mensajes_usuario: mensajesUsuario,
          mensajes_sara: mensajesSara,
          promedio_por_lead: leadsConHistorial.length > 0 ? Math.round(totalMensajes / leadsConHistorial.length) : 0
        },

        intenciones: intenciones,
        objeciones: objeciones,

        desarrollos_populares: Object.entries(desarrollosCounts)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([nombre, count]) => ({ nombre, count })),

        citas: {
          total: appointments?.length || 0,
          completadas: citasCompletadas,
          no_show: citasNoShow,
          canceladas: citasCanceladas,
          tasa_completacion: appointments?.length ? Math.round((citasCompletadas / appointments.length) * 100) : 0
        },

        conversion: {
          lead_a_cita: leads?.length ? Math.round((appointments?.length || 0) / leads.length * 100) : 0,
          lead_a_visita: leads?.length ? Math.round((statusCounts['visited'] || 0) / leads.length * 100) : 0,
          lead_a_venta: leads?.length ? Math.round(((statusCounts['sold'] || 0) + (statusCounts['delivered'] || 0)) / leads.length * 100) : 0
        }
      };

      return corsResponse(JSON.stringify(metrics, null, 2));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /api/metrics/quality - Reporte de calidad de respuestas SARA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.pathname === '/api/metrics/quality' && request.method === 'GET') {
      const dias = parseInt(url.searchParams.get('days') || '7');
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);

      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, conversation_history, updated_at')
        .gte('updated_at', fechaInicio.toISOString());

      // Analizar calidad de respuestas
      const problemas: any[] = [];
      let totalRespuestas = 0;
      let respuestasOk = 0;

      // Patrones de problemas
      const nombresHallucinated = ['Salma', 'María', 'Maria', 'Juan', 'Pedro', 'Ana', 'Luis', 'Carlos', 'Carmen'];
      const frasesProhibidas = [
        'Le aviso a',
        'Sin problema',
        'no lo tenemos disponible',
        'Citadella del Nogal no',
        'El Nogal no es',
        'sí tenemos rentas',
        'tenemos casas en renta'
      ];

      (leads || []).forEach((lead: any) => {
        const history = lead.conversation_history || [];
        history.forEach((msg: any, idx: number) => {
          if (msg.role !== 'assistant') return;
          totalRespuestas++;

          const content = (msg.content || '').trim();
          let tieneProblema = false;
          const problemasMsg: string[] = [];

          // 1. Respuesta truncada (termina en coma o muy corta)
          if (content.endsWith(',') || (content.length > 0 && content.length < 20)) {
            problemasMsg.push('truncada');
            tieneProblema = true;
          }

          // 2. Nombre alucinado (cuando lead no tiene nombre)
          if (!lead.name) {
            for (const nombre of nombresHallucinated) {
              if (content.includes(nombre)) {
                problemasMsg.push(`nombre_hallucinated:${nombre}`);
                tieneProblema = true;
                break;
              }
            }
          }

          // 3. Frases prohibidas
          for (const frase of frasesProhibidas) {
            if (content.toLowerCase().includes(frase.toLowerCase())) {
              problemasMsg.push(`frase_prohibida:${frase.slice(0, 20)}`);
              tieneProblema = true;
            }
          }

          // 4. Respuesta genérica sin valor
          if (content.match(/^(ok|entendido|perfecto|listo)\.?$/i)) {
            problemasMsg.push('respuesta_generica');
            tieneProblema = true;
          }

          if (tieneProblema) {
            problemas.push({
              lead_id: lead.id,
              lead_name: lead.name || 'Sin nombre',
              phone_last4: (lead.phone || '').slice(-4),
              msg_index: idx,
              timestamp: msg.timestamp,
              problemas: problemasMsg,
              preview: content.slice(0, 100)
            });
          } else {
            respuestasOk++;
          }
        });
      });

      // Agrupar por tipo de problema
      const problemasAgrupados: Record<string, number> = {};
      problemas.forEach(p => {
        p.problemas.forEach((prob: string) => {
          const tipo = prob.split(':')[0];
          problemasAgrupados[tipo] = (problemasAgrupados[tipo] || 0) + 1;
        });
      });

      const quality = {
        periodo: `últimos ${dias} días`,
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: new Date().toISOString().split('T')[0],

        resumen: {
          leads_analizados: leads?.length || 0,
          total_respuestas_sara: totalRespuestas,
          respuestas_ok: respuestasOk,
          respuestas_con_problemas: problemas.length,
          tasa_calidad: totalRespuestas > 0 ? Math.round((respuestasOk / totalRespuestas) * 100) : 100
        },

        problemas_por_tipo: problemasAgrupados,

        ultimos_problemas: problemas.slice(-10).reverse(),

        recomendaciones: [
          problemas.filter(p => p.problemas.includes('truncada')).length > 0 && 'Revisar respuestas truncadas',
          problemasAgrupados['nombre_hallucinated'] > 0 && 'Reforzar eliminación de nombres inventados',
          problemasAgrupados['frase_prohibida'] > 0 && 'Revisar post-procesamiento de frases prohibidas',
          problemasAgrupados['respuesta_generica'] > 0 && 'Mejorar respuestas genéricas'
        ].filter(Boolean)
      };

      return corsResponse(JSON.stringify(quality, null, 2));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /api/tts-metrics - Métricas de audios TTS enviados y escuchados
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.pathname === '/api/tts-metrics' && request.method === 'GET') {
      try {
        const dias = parseInt(url.searchParams.get('days') || '30');
        const ttsTracking = createTTSTrackingService(supabase);

        // Obtener métricas agregadas
        const metrics = await ttsTracking.getMetrics(dias);

        // Obtener mensajes recientes
        const recentMessages = await ttsTracking.getRecentMessages(20);

        // Calcular totales
        const totals = metrics.reduce((acc, m) => ({
          enviados: acc.enviados + m.totalEnviados,
          entregados: acc.entregados + m.totalEntregados,
          escuchados: acc.escuchados + m.totalEscuchados,
          fallidos: acc.fallidos + m.totalFallidos
        }), { enviados: 0, entregados: 0, escuchados: 0, fallidos: 0 });

        const tasaEscuchaGlobal = totals.entregados > 0
          ? Math.round(totals.escuchados / totals.entregados * 100)
          : 0;

        return corsResponse(JSON.stringify({
          periodo: `últimos ${dias} días`,
          resumen: {
            total_enviados: totals.enviados,
            total_entregados: totals.entregados,
            total_escuchados: totals.escuchados,
            total_fallidos: totals.fallidos,
            tasa_escucha_global: `${tasaEscuchaGlobal}%`
          },
          por_tipo: metrics.map(m => ({
            tipo: m.ttsType,
            enviados: m.totalEnviados,
            entregados: m.totalEntregados,
            escuchados: m.totalEscuchados,
            fallidos: m.totalFallidos,
            tasa_escucha: `${m.tasaEscuchaPct}%`
          })),
          ultimos_mensajes: recentMessages.map((msg: any) => ({
            tipo: msg.tts_type,
            destinatario: msg.recipient_name || msg.recipient_phone?.slice(-4),
            status: msg.status,
            enviado: msg.sent_at,
            escuchado: msg.played_at || null
          }))
        }, null, 2));
      } catch (e: any) {
        // Si la tabla no existe, retornar instrucciones
        if (e.message?.includes('42P01') || e.code === '42P01') {
          return corsResponse(JSON.stringify({
            error: 'Tabla tts_messages no existe',
            instrucciones: 'Ejecutar sql/tts_tracking.sql en Supabase Dashboard',
            sql_file: '/sql/tts_tracking.sql'
          }), 200);
        }
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /api/message-metrics - Métricas de TODOS los mensajes enviados
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.pathname === '/api/message-metrics' && request.method === 'GET') {
      try {
        const dias = parseInt(url.searchParams.get('days') || '7');
        const msgTracking = createMessageTrackingService(supabase);

        // Obtener métricas agregadas
        const metrics = await msgTracking.getMetrics(dias);

        // Obtener resumen 24h
        const resumen24h = await msgTracking.get24hSummary();

        // Obtener mensajes recientes
        const recentMessages = await msgTracking.getRecentMessages(30);

        // Calcular totales
        const totals = metrics.reduce((acc, m) => ({
          enviados: acc.enviados + m.totalEnviados,
          entregados: acc.entregados + m.totalEntregados,
          leidos: acc.leidos + m.totalLeidos,
          fallidos: acc.fallidos + m.totalFallidos
        }), { enviados: 0, entregados: 0, leidos: 0, fallidos: 0 });

        const tasaLecturaGlobal = totals.entregados > 0
          ? Math.round(totals.leidos / totals.entregados * 100)
          : 0;

        return corsResponse(JSON.stringify({
          periodo: `últimos ${dias} días`,
          resumen_24h: resumen24h,
          resumen_periodo: {
            total_enviados: totals.enviados,
            total_entregados: totals.entregados,
            total_leidos: totals.leidos,
            total_fallidos: totals.fallidos,
            tasa_lectura_global: `${tasaLecturaGlobal}%`
          },
          por_tipo_y_categoria: metrics.map(m => ({
            tipo: m.messageType,
            categoria: m.categoria,
            enviados: m.totalEnviados,
            entregados: m.totalEntregados,
            leidos: m.totalLeidos,
            fallidos: m.totalFallidos,
            tasa_lectura: `${m.tasaLecturaPct}%`
          })),
          ultimos_mensajes: recentMessages.slice(0, 20).map((msg: any) => ({
            tipo: msg.message_type,
            categoria: msg.categoria,
            destinatario: msg.recipient_name || msg.recipient_phone?.slice(-4),
            contenido: msg.contenido?.substring(0, 50),
            status: msg.status,
            enviado: msg.sent_at,
            leido: msg.read_at || null
          }))
        }, null, 2));
      } catch (e: any) {
        if (e.message?.includes('42P01') || e.code === '42P01') {
          return corsResponse(JSON.stringify({
            error: 'Tabla messages_sent no existe',
            instrucciones: 'Ejecutar sql/message_tracking.sql en Supabase Dashboard'
          }), 200);
        }
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /api/message-audit - Auditoría de mensajes enviados a un destinatario
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.pathname === '/api/message-audit' && request.method === 'GET') {
      try {
        const phone = url.searchParams.get('phone');
        const days = parseInt(url.searchParams.get('days') || '7');

        if (!phone) {
          return corsResponse(JSON.stringify({ error: 'Parámetro phone requerido' }), 400);
        }

        const phoneSuffix = phone.slice(-10);
        const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data: mensajes, error } = await supabase.client
          .from('messages_sent')
          .select('*')
          .like('recipient_phone', `%${phoneSuffix}`)
          .gte('sent_at', desde)
          .order('sent_at', { ascending: false });

        if (error) {
          if (error.code === '42P01') {
            return corsResponse(JSON.stringify({
              error: 'Tabla messages_sent no existe',
              instrucciones: 'Ejecutar sql/message_tracking.sql en Supabase Dashboard'
            }), 200);
          }
          return corsResponse(JSON.stringify({ error: error.message }), 500);
        }

        const msgs = mensajes || [];
        const enviados = msgs.length;
        const entregados = msgs.filter(m => m.status === 'delivered' || m.status === 'read').length;
        const leidos = msgs.filter(m => m.status === 'read' || m.read_at).length;
        const fallidos = msgs.filter(m => m.status === 'failed').length;

        return corsResponse(JSON.stringify({
          phone: phoneSuffix,
          periodo: `últimos ${days} días`,
          resumen: {
            enviados,
            entregados,
            leidos,
            fallidos,
            tasaEntrega: enviados > 0 ? Math.round(entregados / enviados * 100) : 0,
            tasaLectura: entregados > 0 ? Math.round(leidos / entregados * 100) : 0
          },
          mensajes: msgs.map(m => ({
            message_id: m.message_id,
            message_type: m.message_type,
            categoria: m.categoria,
            recipient_type: m.recipient_type,
            contenido: m.contenido,
            status: m.status,
            sent_at: m.sent_at,
            delivered_at: m.delivered_at,
            read_at: m.read_at,
            failed_at: m.failed_at,
            error_message: m.error_message
          }))
        }, null, 2));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Reportes CEO (Diario, Semanal, Mensual)
    // ═══════════════════════════════════════════════════════════

    // REPORTE DIARIO
    if (url.pathname === '/api/reportes/diario' && request.method === 'GET') {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

      // OPTIMIZADO: Seleccionar solo campos necesarios
      const { data: leadsAyer } = await supabase.client.from('leads').select('id, name, source, status').gte('created_at', inicioAyer).lt('created_at', inicioHoy);
      const { data: leadsHoy } = await supabase.client.from('leads').select('id').gte('created_at', inicioHoy);
      const { data: cierresAyer } = await supabase.client.from('leads').select('id').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy);
      const hoyStr = hoy.toISOString().split('T')[0];
      const { data: citasHoy } = await supabase.client.from('appointments').select('id, scheduled_time, status, property_interest, lead_name, leads(name, phone)').eq('scheduled_date', hoyStr);
      const { data: leadsHot } = await supabase.client.from('leads').select('id, name, status, phone').in('status', ['negotiation', 'reserved']);
      const limiteFrio = new Date(hoy); limiteFrio.setDate(limiteFrio.getDate() - 1);
      const { data: estancados } = await supabase.client.from('leads').select('id, name, created_at, phone').eq('status', 'new').lt('created_at', limiteFrio.toISOString());

      return corsResponse(JSON.stringify({
        fecha: hoyStr,
        periodo: 'diario',
        ayer: {
          leads_nuevos: leadsAyer?.length || 0,
          cierres: cierresAyer?.length || 0,
          leads: leadsAyer?.map((l: any) => ({ id: l.id, name: l.name, source: l.source, status: l.status })) || []
        },
        hoy: {
          leads_nuevos: leadsHoy?.length || 0,
          citas_agendadas: citasHoy?.filter((c: any) => c.status === 'scheduled').length || 0,
          citas: citasHoy?.map((c: any) => ({
            id: c.id,
            hora: c.scheduled_time,
            lead: c.leads?.name || c.lead_name,
            desarrollo: c.property_interest,
            status: c.status
          })) || []
        },
        pipeline: {
          leads_hot: leadsHot?.length || 0,
          leads_estancados: estancados?.length || 0,
          hot_detalle: leadsHot?.map((l: any) => ({ id: l.id, name: l.name, status: l.status, phone: l.phone })) || [],
          estancados_detalle: estancados?.map((l: any) => ({ id: l.id, name: l.name, created_at: l.created_at, phone: l.phone })) || []
        }
      }));
    }

    // REPORTE SEMANAL
    if (url.pathname === '/api/reportes/semanal' && request.method === 'GET') {
      const hoy = new Date();
      const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7);

      const { data: leadsSemana } = await supabase.client.from('leads').select('*').gte('created_at', inicioSemana.toISOString());
      const { data: cierresSemana } = await supabase.client.from('leads').select('*, properties(price, name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString());
      const { data: citasSemana } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]).lte('scheduled_date', hoy.toISOString().split('T')[0]);
      const { data: vendedores } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true).order('sales_count', { ascending: false });

      let revenue = 0;
      if (cierresSemana) {
        for (const cierre of cierresSemana as any[]) { revenue += cierre.properties?.price || 2000000; }
      }

      const fuenteCount: Record<string, number> = {};
      if (leadsSemana) {
        for (const l of leadsSemana as any[]) { const fuente = l.source || 'Desconocido'; fuenteCount[fuente] = (fuenteCount[fuente] || 0) + 1; }
      }

      const citasCompletadas = citasSemana?.filter((c: any) => c.status === 'completed').length || 0;
      const conversionRate = leadsSemana && leadsSemana.length > 0 ? Math.round((cierresSemana?.length || 0) / leadsSemana.length * 100) : 0;

      return corsResponse(JSON.stringify({
        periodo: 'semanal',
        fecha_inicio: inicioSemana.toISOString().split('T')[0],
        fecha_fin: hoy.toISOString().split('T')[0],
        resumen: {
          leads_nuevos: leadsSemana?.length || 0,
          citas_realizadas: citasCompletadas,
          citas_totales: citasSemana?.length || 0,
          cierres: cierresSemana?.length || 0,
          revenue: revenue,
          revenue_formatted: `$${(revenue/1000000).toFixed(1)}M`
        },
        conversion: {
          lead_a_cierre: conversionRate,
          insight: conversionRate >= 5 ? 'Conversión saludable' : 'Conversión baja - revisar seguimiento'
        },
        ranking_vendedores: vendedores?.slice(0, 5).map((v: any) => ({
          name: v.name,
          ventas: v.sales_count || 0,
          citas: v.appointments_count || 0
        })) || [],
        fuentes: Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).map(([fuente, count]) => ({ fuente, leads: count })),
        cierres_detalle: cierresSemana?.map((c: any) => ({
          lead: c.name,
          propiedad: c.properties?.name,
          precio: c.properties?.price
        })) || []
      }));
    }

    // REPORTE MENSUAL
    if (url.pathname === '/api/reportes/mensual' && request.method === 'GET') {
      const hoy = new Date();

      // Permitir seleccionar mes específico con ?mes=1&año=2026
      const mesParam = url.searchParams.get('mes');
      const añoParam = url.searchParams.get('año') || url.searchParams.get('ano');

      let mesSeleccionado = hoy.getMonth(); // Mes actual (0-11)
      let añoSeleccionado = hoy.getFullYear();

      if (mesParam) {
        mesSeleccionado = parseInt(mesParam) - 1; // Convertir 1-12 a 0-11
      }
      if (añoParam) {
        añoSeleccionado = parseInt(añoParam);
      }

      // Inicio y fin del mes seleccionado
      const inicioMes = new Date(añoSeleccionado, mesSeleccionado, 1);
      const finMes = new Date(añoSeleccionado, mesSeleccionado + 1, 0); // Último día del mes

      // Mes anterior para comparación
      const mesAnterior = new Date(añoSeleccionado, mesSeleccionado - 1, 1);
      const finMesAnterior = new Date(añoSeleccionado, mesSeleccionado, 0);

      const { data: leadsMes } = await supabase.client.from('leads').select('*').gte('created_at', inicioMes.toISOString()).lte('created_at', finMes.toISOString());
      const { data: leadsMesAnterior } = await supabase.client.from('leads').select('*').gte('created_at', mesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString());
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price, name, development)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes.toISOString()).lte('status_changed_at', finMes.toISOString());
      const { data: citasMes } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMes.toISOString().split('T')[0]).lte('scheduled_date', finMes.toISOString().split('T')[0]);
      const { data: vendedores } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true).order('sales_count', { ascending: false });

      let revenue = 0;
      const desarrolloCount: Record<string, { count: number, revenue: number }> = {};
      if (cierresMes) {
        for (const cierre of cierresMes as any[]) {
          const precio = cierre.properties?.price || 2000000;
          revenue += precio;
          const dev = cierre.properties?.development || 'Otro';
          if (!desarrolloCount[dev]) desarrolloCount[dev] = { count: 0, revenue: 0 };
          desarrolloCount[dev].count++;
          desarrolloCount[dev].revenue += precio;
        }
      }

      const fuenteCount: Record<string, number> = {};
      if (leadsMes) {
        for (const l of leadsMes as any[]) { const fuente = l.source || 'Desconocido'; fuenteCount[fuente] = (fuenteCount[fuente] || 0) + 1; }
      }

      const citasCompletadas = citasMes?.filter((c: any) => c.status === 'completed').length || 0;
      const conversionRate = leadsMes && leadsMes.length > 0 ? Math.round((cierresMes?.length || 0) / leadsMes.length * 100) : 0;
      const crecimientoLeads = leadsMesAnterior && leadsMesAnterior.length > 0 ? Math.round(((leadsMes?.length || 0) - leadsMesAnterior.length) / leadsMesAnterior.length * 100) : 0;

      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

      return corsResponse(JSON.stringify({
        periodo: 'mensual',
        mes: meses[inicioMes.getMonth()],
        año: inicioMes.getFullYear(),
        fecha_inicio: inicioMes.toISOString().split('T')[0],
        fecha_fin: finMes.toISOString().split('T')[0],
        resumen: {
          leads_nuevos: leadsMes?.length || 0,
          leads_mes_anterior: leadsMesAnterior?.length || 0,
          crecimiento_leads: crecimientoLeads,
          citas_realizadas: citasCompletadas,
          citas_totales: citasMes?.length || 0,
          cierres: cierresMes?.length || 0,
          revenue: revenue,
          revenue_formatted: `$${(revenue/1000000).toFixed(1)}M`
        },
        conversion: {
          lead_a_cita: citasMes && leadsMes ? Math.round((citasMes.length / leadsMes.length) * 100) : 0,
          cita_a_cierre: citasCompletadas > 0 ? Math.round(((cierresMes?.length || 0) / citasCompletadas) * 100) : 0,
          lead_a_cierre: conversionRate
        },
        ranking_vendedores: vendedores?.slice(0, 10).map((v: any, i: number) => ({
          posicion: i + 1,
          name: v.name,
          ventas: v.sales_count || 0,
          citas: v.appointments_count || 0,
          revenue: (v.sales_count || 0) * 2000000
        })) || [],
        desarrollos: Object.entries(desarrolloCount).sort((a, b) => b[1].revenue - a[1].revenue).map(([dev, data]) => ({
          desarrollo: dev,
          ventas: data.count,
          revenue: data.revenue,
          revenue_formatted: `$${(data.revenue/1000000).toFixed(1)}M`
        })),
        fuentes: Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).map(([fuente, count]) => ({ fuente, leads: count })),
        cierres_detalle: cierresMes?.map((c: any) => ({
          lead: c.name,
          propiedad: c.properties?.name,
          desarrollo: c.properties?.development,
          precio: c.properties?.price,
          precio_formatted: `$${((c.properties?.price || 0)/1000000).toFixed(1)}M`
        })) || []
      }));
    }


    // ═══════════════════════════════════════════════════════════
    // CHAT IA PARA REPORTES - Preguntas sobre datos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/reportes/ask' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { pregunta, contexto } = body;

        if (!pregunta) {
          return corsResponse(JSON.stringify({ error: 'Falta pregunta' }), 400);
        }

        // Preparar resumen de datos para Claude
        let resumenDatos = 'DATOS DE REPORTES CEO:\n\n';
        resumenDatos += '📅 REPORTE DIARIO (' + (contexto?.diario?.fecha || 'hoy') + '):\n';
        resumenDatos += '- Leads nuevos ayer: ' + (contexto?.diario?.ayer?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Cierres ayer: ' + (contexto?.diario?.ayer?.cierres || 0) + '\n';
        resumenDatos += '- Citas hoy: ' + (contexto?.diario?.hoy?.citas_agendadas || 0) + '\n';
        resumenDatos += '- Leads HOT: ' + (contexto?.diario?.pipeline?.leads_hot || 0) + '\n';
        resumenDatos += '- Leads sin contactar: ' + (contexto?.diario?.pipeline?.leads_estancados || 0) + '\n\n';

        resumenDatos += '📈 REPORTE SEMANAL (' + (contexto?.semanal?.fecha_inicio || 'N/A') + ' al ' + (contexto?.semanal?.fecha_fin || 'N/A') + '):\n';
        resumenDatos += '- Leads nuevos: ' + (contexto?.semanal?.resumen?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Citas totales: ' + (contexto?.semanal?.resumen?.citas_totales || 0) + '\n';
        resumenDatos += '- Cierres: ' + (contexto?.semanal?.resumen?.cierres || 0) + '\n';
        resumenDatos += '- Revenue: ' + (contexto?.semanal?.resumen?.revenue_formatted || '$0') + '\n';
        resumenDatos += '- Conversión lead a cierre: ' + (contexto?.semanal?.conversion?.lead_a_cierre || 0) + '%\n\n';

        resumenDatos += '📉 REPORTE MENSUAL (' + (contexto?.mensual?.mes || 'N/A') + ' ' + (contexto?.mensual?.año || 'N/A') + '):\n';
        resumenDatos += '- Leads nuevos: ' + (contexto?.mensual?.resumen?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Crecimiento vs mes anterior: ' + (contexto?.mensual?.resumen?.crecimiento_leads || 0) + '%\n';
        resumenDatos += '- Citas totales: ' + (contexto?.mensual?.resumen?.citas_totales || 0) + '\n';
        resumenDatos += '- Cierres: ' + (contexto?.mensual?.resumen?.cierres || 0) + '\n';
        resumenDatos += '- Revenue: ' + (contexto?.mensual?.resumen?.revenue_formatted || '$0') + '\n';
        resumenDatos += '- Conversión lead a cierre: ' + (contexto?.mensual?.conversion?.lead_a_cierre || 0) + '%\n\n';

        resumenDatos += '🏆 RANKING VENDEDORES (mensual):\n';
        if (contexto?.mensual?.ranking_vendedores) {
          for (const v of contexto.mensual.ranking_vendedores) {
            resumenDatos += v.posicion + '. ' + v.name + ': ' + v.ventas + ' ventas, ' + v.citas + ' citas, $' + (v.revenue/1000000).toFixed(1) + 'M\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n🏘️ VENTAS POR DESARROLLO:\n';
        if (contexto?.mensual?.desarrollos) {
          for (const d of contexto.mensual.desarrollos) {
            resumenDatos += '- ' + d.desarrollo + ': ' + d.ventas + ' ventas, ' + d.revenue_formatted + '\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n📣 FUENTES DE LEADS:\n';
        if (contexto?.mensual?.fuentes) {
          for (const f of contexto.mensual.fuentes) {
            resumenDatos += '- ' + f.fuente + ': ' + f.leads + ' leads\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        // Llamar a Claude para responder
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 500,
            messages: [
              {
                role: 'user',
                content: 'Eres un asistente de análisis de datos para Santa Rita Residencial. Responde preguntas sobre los reportes de ventas de forma clara y concisa.\n\n' + resumenDatos + '\n\nPREGUNTA DEL CEO: ' + pregunta + '\n\nResponde de forma directa y útil. Si necesitas hacer cálculos, hazlos. Usa emojis para hacer la respuesta más visual.'
              }
            ]
          })
        });

        const claudeData = await claudeResponse.json() as any;
        const respuesta = claudeData?.content?.[0]?.text || 'No pude procesar la pregunta.';

        return corsResponse(JSON.stringify({ respuesta }));

      } catch (err) {
        console.error('Error en chat IA reportes:', err);
        return corsResponse(JSON.stringify({ error: 'Error procesando pregunta', respuesta: 'Hubo un error al procesar tu pregunta. Por favor intenta de nuevo.' }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════
    // CHAT IA PARA DASHBOARD - Preguntas sobre métricas generales
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/dashboard/ask' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { pregunta, contexto } = body;

        if (!pregunta) {
          return corsResponse(JSON.stringify({ error: 'Falta pregunta' }), 400);
        }

        // Preparar resumen de datos del dashboard para Claude
        let resumenDatos = 'DATOS DEL DASHBOARD DE VENTAS:\n\n';

        resumenDatos += '📊 MÉTRICAS GENERALES:\n';
        resumenDatos += '- Total leads: ' + (contexto?.totalLeads || 0) + '\n';
        resumenDatos += '- Pipeline value: $' + ((contexto?.pipelineValue || 0) / 1000000).toFixed(1) + 'M\n';
        resumenDatos += '- Cierres este mes: ' + (contexto?.cierresMes || 0) + '\n';
        resumenDatos += '- Cambio vs mes anterior: ' + (contexto?.cambioVsMesAnterior || 0) + '%\n';
        resumenDatos += '- Leads HOT (negociación/reservado): ' + (contexto?.leadsHot || 0) + '\n';
        resumenDatos += '- Tiempo promedio respuesta: ' + (contexto?.tiempoRespuesta || 0) + ' min\n\n';

        resumenDatos += '🔥 DISTRIBUCIÓN FUNNEL:\n';
        resumenDatos += '- Nuevos: ' + (contexto?.funnel?.new || 0) + '\n';
        resumenDatos += '- Contactados: ' + (contexto?.funnel?.contacted || 0) + '\n';
        resumenDatos += '- Cita agendada: ' + (contexto?.funnel?.scheduled || 0) + '\n';
        resumenDatos += '- Visitaron: ' + (contexto?.funnel?.visited || 0) + '\n';
        resumenDatos += '- Negociación: ' + (contexto?.funnel?.negotiation || 0) + '\n';
        resumenDatos += '- Reservado: ' + (contexto?.funnel?.reserved || 0) + '\n';
        resumenDatos += '- Cerrado: ' + (contexto?.funnel?.closed || 0) + '\n\n';

        resumenDatos += '📈 CONVERSIONES:\n';
        resumenDatos += '- Lead a venta: ' + (contexto?.conversiones?.leadToSale || 0) + '%\n';
        resumenDatos += '- Lead a cita: ' + (contexto?.conversiones?.leadToCita || 0) + '%\n';
        resumenDatos += '- Visita a cierre: ' + (contexto?.conversiones?.visitaToClose || 0) + '%\n';
        resumenDatos += '- Leads por venta (ratio): ' + (contexto?.conversiones?.ratioLeadsPorVenta || 0) + ':1\n\n';

        resumenDatos += '🏆 TOP VENDEDORES:\n';
        if (contexto?.topVendedores) {
          for (const v of contexto.topVendedores) {
            resumenDatos += '- ' + v.name + ': ' + v.ventas + ' ventas, ' + v.leads + ' leads, ' + v.conversion + '% conv\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n🏘️ TOP DESARROLLOS:\n';
        if (contexto?.topDesarrollos) {
          for (const d of contexto.topDesarrollos) {
            resumenDatos += '- ' + d.name + ': ' + d.ventas + ' ventas, $' + (d.revenue / 1000000).toFixed(1) + 'M revenue\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n📣 LEADS POR FUENTE:\n';
        if (contexto?.fuentesLeads) {
          for (const f of contexto.fuentesLeads) {
            resumenDatos += '- ' + f.source + ': ' + f.count + ' leads, ' + f.closed + ' cerrados\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        // Llamar a Claude para responder
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 600,
            messages: [
              {
                role: 'user',
                content: 'Eres un asistente de análisis de datos para Santa Rita Residencial. Responde preguntas sobre el dashboard y métricas de ventas de forma clara, concisa y accionable.\n\n' + resumenDatos + '\n\nPREGUNTA DEL USUARIO: ' + pregunta + '\n\nResponde de forma directa y útil. Da recomendaciones específicas cuando sea apropiado. Usa emojis para hacer la respuesta más visual. Máximo 3-4 párrafos.'
              }
            ]
          })
        });

        const claudeData = await claudeResponse.json() as any;
        const respuesta = claudeData?.content?.[0]?.text || 'No pude procesar la pregunta.';

        return corsResponse(JSON.stringify({ respuesta }));

      } catch (err) {
        console.error('Error en chat IA dashboard:', err);
        return corsResponse(JSON.stringify({ error: 'Error procesando pregunta', respuesta: 'Hubo un error al procesar tu pregunta. Por favor intenta de nuevo.' }), 500);
      }
    }
    // ═══════════════════════════════════════════════════════════
    // Endpoint de prueba - Enviar TEMPLATE
    // Endpoint para ver templates aprobados de Meta
    if (url.pathname === '/api/templates' && request.method === 'GET') {
      try {
        const WABA_ID = '1227849769248437';

        // Obtener templates del WABA directamente
        const templatesUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?fields=name,status,language&limit=50`;
        const templatesResp = await fetch(templatesUrl, {
          headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` }
        });
        const templatesData = await templatesResp.json() as any;

        // Formatear respuesta
        const templates = templatesData?.data?.map((t: any) => ({
          name: t.name,
          status: t.status,
          language: t.language
        })) || [];

        return corsResponse(JSON.stringify({
          waba_id: WABA_ID,
          total: templates.length,
          templates: templates
        }, null, 2));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear TODOS los templates del funnel
    if (url.pathname === '/api/create-all-templates' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';
        const results: any[] = [];

        const templates = [
          {
            name: 'recordatorio_cita_24h',
            category: 'UTILITY',
            text: '📅 ¡Hola {{1}}! Te recordamos tu cita mañana.\n\n🏠 {{2}}\n📍 {{3}}\n⏰ {{4}}\n\n¿Nos confirmas tu asistencia? Responde *Sí* o *No*.\n\n¡Te esperamos! 🙌',
            example: [['María', 'Monte Verde', 'Av. Principal 123', '10:00 AM']]
          },
          {
            name: 'recordatorio_cita_2h',
            category: 'UTILITY',
            text: '⏰ ¡{{1}}, tu cita es en 2 horas!\n\n🏠 {{2}}\n📍 {{3}}\n\n¡Te esperamos! 🏡',
            example: [['María', 'Monte Verde', 'Av. Principal 123']]
          },
          {
            name: 'encuesta_post_visita',
            category: 'MARKETING',
            text: '¡Hola {{1}}! 👋\n\nGracias por visitarnos hoy en *{{2}}*. 🏠\n\n¿Qué te pareció? Responde:\n1️⃣ Me encantó\n2️⃣ Quiero ver más opciones\n3️⃣ Tengo dudas\n\nEstoy aquí para ayudarte 😊',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'reagendar_noshow',
            category: 'UTILITY',
            text: '👋 Hola {{1}},\n\nNotamos que no pudiste llegar a tu cita en *{{2}}*.\n\n¡No te preocupes! 😊 ¿Te gustaría reagendar?\n\nSolo dime qué día y hora te funcionan mejor. 📅',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'info_credito',
            category: 'MARKETING',
            text: '🏦 ¡Hola {{1}}!\n\nTe comparto información sobre crédito hipotecario para *{{2}}*:\n\n✅ Hasta 20 años de plazo\n✅ Tasa competitiva\n✅ Varios bancos disponibles\n\n¿Te gustaría que un asesor te contacte? Responde *Sí*.',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'referidos_postventa',
            category: 'MARKETING',
            text: '🎉 ¡Hola {{1}}!\n\nYa pasó un mes desde que elegiste tu nuevo hogar en *{{2}}*. ¡Esperamos que lo estés disfrutando!\n\n🎁 *Programa de Referidos*\nSi conoces a alguien buscando casa, envíanos:\n*Referido Nombre Teléfono*\n\n¡Y ganas premios! 🏆',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'feliz_cumple',
            category: 'MARKETING',
            text: '🎂 ¡Feliz cumpleaños {{1}}! 🎉\n\nTodo el equipo te desea un día increíble.\n\nGracias por ser parte de nuestra familia. 🏠💙',
            example: [['María']]
          },
          {
            name: 'reactivacion_lead',
            category: 'MARKETING',
            text: '👋 ¡Hola {{1}}!\n\nHace tiempo no platicamos. ¿Sigues buscando casa en Zacatecas? 🏠\n\nTenemos nuevas opciones que podrían interesarte.\n\nResponde *Sí* y te cuento las novedades. 😊',
            example: [['María']]
          },
          {
            name: 'promo_desarrollo',
            category: 'MARKETING',
            text: '🎉 ¡Hola {{1}}!\n\n*PROMOCIÓN ESPECIAL* en {{2}}:\n\n{{3}}\n\n⏰ Válido por tiempo limitado.\n\n¿Te interesa? Responde *Sí* para más información.',
            example: [['María', 'Monte Verde', '10% de descuento en enganche']]
          },
          {
            name: 'invitacion_evento',
            category: 'MARKETING',
            text: '🏠 ¡Hola {{1}}!\n\nTe invitamos a *{{2}}*\n\n📅 {{3}}\n📍 {{4}}\n\n¡No te lo pierdas! Responde *Confirmo* para apartar tu lugar. 🎉',
            example: [['María', 'Feria de la Vivienda', 'Sábado 25 de enero, 10am', 'Monte Verde']]
          },
          {
            name: 'reactivar_equipo',
            category: 'UTILITY',
            text: '👋 ¡Hola {{1}}!\n\nSoy SARA, tu asistente de Grupo Santa Rita. 🏠\n\nResponde cualquier mensaje para activar nuestra conversación y poder enviarte reportes, alertas y notificaciones.\n\nEscribe *ayuda* para ver comandos disponibles. 💪',
            example: [['Oscar']]
          },
          {
            name: 'appointment_confirmation_v2',
            category: 'UTILITY',
            text: '¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.',
            example: [['María', 'Grupo Santa Rita', 'visita a Monte Verde', 'sábado 25 de enero', '10:00 AM']],
            hasButton: true,
            buttonText: 'Ver ubicación 📍',
            buttonUrl: 'https://maps.app.goo.gl/{{1}}',
            buttonExample: ['qR8vK3xYz9M']
          },
          {
            name: 'briefing_matutino',
            category: 'UTILITY',
            text: '📋 *Briefing* - Buenos días {{1}}!\n\n🗓️ Citas hoy: {{2}}\n⚠️ Leads pendientes: {{3}}\n\n{{4}}\n\nResponde *briefing* para ver detalles completos. 💪',
            example: [['Oscar', '3 citas', '5 leads', '💡 Tip: Escribe mis leads para ver tus prospectos']]
          },
          {
            name: 'reporte_vendedor',
            category: 'UTILITY',
            text: '📊 *Reporte del día* {{1}}\n\n📈 Leads nuevos: {{2}}\n🗓️ Citas: {{3}} completadas de {{4}}\n💰 Pipeline: {{5}}\n\n{{6}}\n\nResponde *reporte* para detalles. 📋',
            example: [['Oscar', '4', '2', '3', '$5.2M', '🔥 Tienes 2 citas mañana']]
          },
          {
            name: 'reporte_asesor',
            category: 'UTILITY',
            text: '📊 *Reporte del día* {{1}}\n\n📋 Solicitudes nuevas: {{2}}\n✅ Aprobadas hoy: {{3}}\n📁 Pipeline activo: {{4}}\n\nResponde para ver detalles completos. 📋',
            example: [['Leticia', '2', '1', '5 expedientes']]
          }
        ];

        for (const tmpl of templates) {
          const components: any[] = [
            {
              type: 'BODY',
              text: tmpl.text,
              example: { body_text: tmpl.example }
            }
          ];

          // Add button component if template has a button
          if ((tmpl as any).hasButton) {
            components.push({
              type: 'BUTTONS',
              buttons: [
                {
                  type: 'URL',
                  text: (tmpl as any).buttonText,
                  url: (tmpl as any).buttonUrl,
                  example: (tmpl as any).buttonExample
                }
              ]
            });
          }

          const payload = {
            name: tmpl.name,
            language: tmpl.name === 'appointment_confirmation_v2' ? 'es' : 'es_MX',
            category: tmpl.category,
            components
          };

          const response = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();
          results.push({
            name: tmpl.name,
            success: response.ok,
            status: response.status,
            result
          });
        }

        return corsResponse(JSON.stringify({ templates_created: results }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear template info_desarrollo (para enviar info post-llamada Retell cuando ventana 24h cerrada)
    if (url.pathname === '/api/create-info-template' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';

        const templatePayload = {
          name: 'info_desarrollo',
          language: 'es_MX',
          category: 'UTILITY',
          components: [
            {
              type: 'BODY',
              text: '¡Hola {{1}}! 🏠\n\nSoy Sara de Grupo Santa Rita. Gracias por tu interés en *{{2}}*.\n\n💰 Casas desde {{3}}\n\nTe comparto la información para que la revises. ¿Te gustaría agendar una visita? Responde *Sí* y con gusto te agendo. 😊',
              example: {
                body_text: [['María', 'Monte Verde', '$1.6M equipada']]
              }
            },
            {
              type: 'BUTTONS',
              buttons: [
                {
                  type: 'URL',
                  text: 'Ver brochure',
                  url: 'https://sara-backend.edson-633.workers.dev/brochure/{{1}}',
                  example: ['monte-verde']
                },
                {
                  type: 'URL',
                  text: 'Ver ubicacion',
                  url: 'https://maps.app.goo.gl/{{1}}',
                  example: ['qR8vK3xYz9M']
                }
              ]
            }
          ]
        };

        const createUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`;
        const response = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templatePayload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          status: response.status,
          template_name: 'info_desarrollo',
          result
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear template notificacion_cita_vendedor (para notificar al vendedor cuando ventana cerrada)
    if (url.pathname === '/api/create-vendor-appointment-template' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';

        const templatePayload = {
          name: 'notificacion_cita_vendedor',
          language: 'es_MX',
          category: 'UTILITY',
          components: [
            {
              type: 'BODY',
              text: '📅 *{{1}}*\n\n👤 Lead: {{2}}\n📱 Tel: {{3}}\n🏠 Desarrollo: {{4}}\n📅 Fecha: {{5}}\n\nLa cita ya está registrada. Responde para ver más detalles.',
              example: {
                body_text: [['VISITA PRESENCIAL AGENDADA', 'Roberto García', 'wa.me/5610016226', 'Monte Verde', 'domingo 15 de febrero a las 10:00 AM']]
              }
            }
          ]
        };

        const createUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`;
        const response = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templatePayload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          status: response.status,
          template_name: 'notificacion_cita_vendedor',
          result
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear template individual (legacy)
    if (url.pathname === '/api/create-reengagement-template' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';

        const templatePayload = {
          name: 'seguimiento_lead',
          language: 'es_MX',
          category: 'MARKETING',
          components: [
            {
              type: 'BODY',
              text: '¡Hola {{1}}! 👋\n\nHace unos días platicamos sobre *{{2}}* y quería saber si aún te interesa conocer más.\n\n¿Tienes alguna duda que pueda resolver? Responde *Sí* y con gusto te ayudo. 🏠',
              example: {
                body_text: [['Juan', 'Monte Verde']]
              }
            }
          ]
        };

        const createUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`;
        const response = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templatePayload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          status: response.status,
          template_name: 'seguimiento_lead',
          result
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }


    // Endpoint genérico para enviar cualquier template
    if (url.pathname === '/api/send-template' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { phone, template, params } = body;

        if (!phone || !template) {
          return corsResponse(JSON.stringify({ error: 'phone y template son requeridos' }), 400);
        }

        // Normalizar teléfono
        const digits = phone.replace(/\D/g, '');
        const phoneNormalized = digits.length === 10 ? '521' + digits :
                               digits.startsWith('52') && digits.length === 12 ? '521' + digits.slice(2) : digits;

        // Construir componentes del template
        const components: any[] = [];
        if (params && params.length > 0) {
          components.push({
            type: 'body',
            parameters: params.map((p: string) => ({ type: 'text', text: p }))
          });
        }

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNormalized,
          type: 'template',
          template: {
            name: template,
            language: { code: 'es_MX' },
            components
          }
        };

        console.log('📤 Enviando template:', template, 'a', phoneNormalized);

        const response = await fetch(`https://graph.facebook.com/v22.0/${env.META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          template,
          phone: phoneNormalized,
          result
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }
    // ═══════════════════════════════════════════════════════════════
    // ENDPOINT: Limpiar eventos huérfanos de Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/calendar/cleanup' && request.method === 'POST') {
      try {
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);

        // 1. Obtener eventos de Calendar
        const now = new Date();
        const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const events = await calendar.getEvents(now.toISOString(), nextMonth.toISOString());

        // 2. Obtener IDs de eventos válidos de la BD
        const { data: citasValidas } = await supabase.client
          .from('appointments')
          .select('google_event_vendedor_id, google_event_id, lead_name, scheduled_date, scheduled_time, status')
          .not('status', 'eq', 'cancelled'); // Todas las citas excepto canceladas

        const idsValidos = new Set<string>();
        citasValidas?.forEach(c => {
          if (c.google_event_vendedor_id) idsValidos.add(c.google_event_vendedor_id);
          if (c.google_event_id) idsValidos.add(c.google_event_id);
        });

        console.log('📅 Eventos en Calendar:', events.length);
        console.log('📅 IDs válidos en BD:', idsValidos.size);

        // 3. Identificar eventos huérfanos (no están en BD)
        const huerfanos: any[] = [];
        const validos: any[] = [];

        for (const event of events) {
          if (idsValidos.has(event.id)) {
            validos.push({ id: event.id, summary: event.summary, start: event.start?.dateTime });
          } else {
            huerfanos.push({ id: event.id, summary: event.summary, start: event.start?.dateTime });
          }
        }

        // 4. Borrar eventos huérfanos
        const borrados: string[] = [];
        for (const huerfano of huerfanos) {
          try {
            await calendar.deleteEvent(huerfano.id);
            borrados.push(huerfano.summary || huerfano.id);
            console.log('🗑️ Evento huérfano borrado:', huerfano.summary);
          } catch (e) {
            console.error('⚠️ Error borrando evento:', huerfano.id, e);
          }
        }

        return corsResponse(JSON.stringify({
          eventos_en_calendar: events.length,
          citas_validas_bd: citasValidas?.length || 0,
          huerfanos_encontrados: huerfanos.length,
          huerfanos_borrados: borrados,
          eventos_validos: validos
        }, null, 2));

      } catch (error: any) {
        console.error('Error en cleanup:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Endpoint para registrar webhook de Google Calendar
    if (url.pathname === '/api/calendar/setup-webhook' && request.method === 'POST') {
      try {
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        
        // Crear canal de notificaciones
        const webhookUrl = 'https://sara-backend.edson-633.workers.dev/webhook/google-calendar';
        const channelId = 'sara-crm-' + Date.now();
        
        const result = await calendar.watchCalendar(channelId, webhookUrl);
        
        console.log('📅 Webhook de Google Calendar configurado:', result);
        return corsResponse(JSON.stringify({ success: true, channel: result }));
      } catch (error: any) {
        console.error('Error configurando webhook:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════
    // REENVIAR VIDEO: Para videos que tienen URL pero no se enviaron
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/retry-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reintentando envío de video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      if (!video.video_url || video.video_url.startsWith('ERROR')) {
        return corsResponse(JSON.stringify({ error: 'Video no tiene URL válida', video_url: video.video_url }), 400);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video de Google
        console.log(`📥 Descargando video de Google...`);
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({
            error: 'Error descargando video',
            status: videoResponse.status,
            details: await videoResponse.text()
          }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Video subido a Meta: ${mediaId}`);

        // Enviar por WhatsApp
        await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
          `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

        // Actualizar registro como realmente enviado
        await supabase.client
          .from('pending_videos')
          .update({ sent: true, completed_at: new Date().toISOString(), video_url: video.video_url + ' (ENVIADO)' })
          .eq('id', video.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video enviado exitosamente a ${video.lead_name} (${video.lead_phone})`,
          media_id: mediaId
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESET VIDEO: Marcar video como no enviado para reintento
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/reset-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reseteando video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      // Resetear para que el cron lo procese de nuevo
      await supabase.client
        .from('pending_videos')
        .update({ sent: false, completed_at: null })
        .eq('id', videoId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Video ${videoId} reseteado. Se procesará en el próximo cron.`
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // GENERAR VIDEO DE PRUEBA: Para cualquier teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-video-personalizado/')) {
      const phone = url.pathname.split('/').pop();
      const phoneFormatted = phone?.startsWith('52') ? phone : `52${phone}`;
      const nombre = url.searchParams.get('nombre') || 'Amigo';
      const desarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';

      console.log(`🎬 Generando video de prueba para ${phoneFormatted}...`);

      try {
        const apiKey = env.GEMINI_API_KEY;

        // Fotos de fachadas por desarrollo
        const fotosDesarrollo: Record<string, string> = {
          'Monte Verde': 'https://gruposantarita.com.mx/wp-content/uploads/2024/11/MONTE-VERDE-FACHADA-DESARROLLO-EDIT-scaled.jpg',
          'Los Encinos': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/Encinos-Amenidades-1.jpg',
          'Andes': 'https://gruposantarita.com.mx/wp-content/uploads/2022/09/Dalia_act.jpg',
          'Miravalle': 'https://gruposantarita.com.mx/wp-content/uploads/2025/02/FACHADA-MIRAVALLE-DESARROLLO-edit-scaled-e1740672689199.jpg',
          'Distrito Falco': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/img01-5.jpg',
          'Acacia': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/ACACIA-1-scaled.jpg'
        };

        const testFoto = fotosDesarrollo[desarrollo] || fotosDesarrollo['Monte Verde'];

        const imgResponse = await fetch(testFoto);
        const imgBuffer = await imgResponse.arrayBuffer();
        // Convertir a base64 sin overflow (chunked)
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const imgBase64 = btoa(binary);

        // Detectar género por nombre (nombres terminados en 'a' = femenino, excepto algunos)
        const nombreLower = nombre.toLowerCase();
        const excepcionesMasculinas = ['joshua', 'ezra', 'garcia', 'peña', 'borja', 'mejia'];
        const esFemenino = nombreLower.endsWith('a') && !excepcionesMasculinas.some(e => nombreLower.includes(e));
        const bienvenida = esFemenino ? 'bienvenida' : 'bienvenido';

        // PROMPT: Fachada de la imagen EXACTA, sin generar otras casas
        const prompt = `IMPORTANT: Use ONLY the exact house facade shown in the input image. Do NOT generate or show any other houses, buildings, or locations.

Slow cinematic zoom towards the exact house facade in the image. The camera slowly approaches the front of this specific house, showing its real architectural details. Gentle camera movement, golden hour lighting. The house facade remains the main focus throughout the entire video.

At the end, a female real estate agent appears briefly in front of this same house and says in Spanish: "Hola ${nombre}, ${bienvenida} a tu nuevo hogar en ${desarrollo}".

8 seconds, 4K quality. No text overlays, no subtitles, no captions. Keep focus on the REAL house from the input image only.`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 8 }
          })
        });

        const result = await response.json() as any;
        const operationName = result.name;

        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: phoneFormatted,
          lead_name: nombre,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video generándose para ${nombre} (${phoneFormatted})`,
          operation_id: operationName,
          nota: 'El video tardará ~2 minutos. Se enviará automáticamente.'
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST HEYGEN: Probar video con HeyGen API
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-heygen/')) {
      const phone = url.pathname.split('/').pop();
      const phoneFormatted = phone?.startsWith('52') ? phone : `52${phone}`;
      const nombre = url.searchParams.get('nombre') || 'Amigo';
      const desarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';
      const fotoUrl = url.searchParams.get('foto') || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800';

      console.log(`🎬 [HeyGen] Generando video para ${phoneFormatted}...`);

      try {
        const heygenKey = env.HEYGEN_API_KEY;
        if (!heygenKey) {
          return corsResponse(JSON.stringify({ error: 'Falta HEYGEN_API_KEY' }), 500);
        }

        // Crear video con HeyGen
        const response = await fetch('https://api.heygen.com/v2/video/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': heygenKey
          },
          body: JSON.stringify({
            video_inputs: [{
              character: {
                type: 'avatar',
                avatar_id: 'Abigail_expressive_2024112501',
                avatar_style: 'normal'
              },
              voice: {
                type: 'text',
                input_text: `Hola ${nombre}, bienvenido a tu nuevo hogar aquí en ${desarrollo}. Estoy aquí para ayudarte a encontrar la casa de tus sueños. ¡Contáctanos hoy!`,
                voice_id: '6ce26db0cb6f4e7881b85452619f7f19'  // Camila Vega - Spanish female
              },
              background: {
                type: 'image',
                url: fotoUrl
              }
            }],
            dimension: {
              width: 720,
              height: 1280
            }
          })
        });

        const result = await response.json() as any;
        console.log('HeyGen response:', JSON.stringify(result));

        if (result.error) {
          return corsResponse(JSON.stringify({ error: result.error }), 500);
        }

        // Guardar en pending_videos con prefijo HEYGEN
        await supabase.client.from('pending_videos').insert({
          operation_id: `HEYGEN_${result.data?.video_id || 'unknown'}`,
          lead_phone: phoneFormatted,
          lead_name: nombre,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video HeyGen generándose para ${nombre}`,
          video_id: result.data?.video_id,
          status: result.data?.status,
          nota: 'El video tardará ~1 minuto. Se enviará automáticamente.'
        }));
      } catch (e: any) {
        console.error('Error HeyGen:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Listar avatares disponibles
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/heygen-avatars') {
      try {
        const response = await fetch('https://api.heygen.com/v2/avatars', {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Listar voces disponibles
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/heygen-voices') {
      try {
        const response = await fetch('https://api.heygen.com/v2/voices', {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Ver estado de video
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/heygen-status/')) {
      const videoId = url.pathname.split('/').pop();
      try {
        const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Enviar video completado a WhatsApp
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/heygen-send/')) {
      const videoId = url.pathname.split('/').pop();
      const phone = url.searchParams.get('phone') || '525610016226';

      try {
        // Obtener estado del video
        const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const status = await statusRes.json() as any;

        if (status.data?.status !== 'completed') {
          return corsResponse(JSON.stringify({ error: 'Video no completado', status: status.data?.status }), 400);
        }

        const videoUrl = status.data.video_url;
        if (!videoUrl) {
          return corsResponse(JSON.stringify({ error: 'No video URL' }), 400);
        }

        // Descargar video
        console.log('📥 Descargando video de HeyGen...');
        const videoRes = await fetch(videoUrl);
        const videoBuffer = await videoRes.arrayBuffer();
        console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta y enviar
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Video subido a Meta: ${mediaId}`);

        await meta.sendWhatsAppVideoById(phone, mediaId, '🎬 *¡Video personalizado para ti!*');
        console.log(`✅ Video enviado a ${phone}`);

        return corsResponse(JSON.stringify({ ok: true, message: `Video HeyGen enviado a ${phone}` }));
      } catch (e: any) {
        console.error('Error enviando video HeyGen:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // REGENERAR VIDEO: Para leads cuyo video falló
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/regenerate-video/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`🔄 Regenerando video para teléfono: ${phone}`);

      // Buscar video fallido
      const { data: failedVideo } = await supabase.client
        .from('pending_videos')
        .select('*')
        .ilike('lead_phone', `%${phone}%`)
        .ilike('video_url', '%ERROR%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!failedVideo) {
        return corsResponse(JSON.stringify({ error: 'No se encontró video fallido para este teléfono' }), 404);
      }

      // Eliminar el registro fallido
      await supabase.client
        .from('pending_videos')
        .delete()
        .eq('id', failedVideo.id);

      // Generar nuevo video
      try {
        const apiKey = env.GEMINI_API_KEY;
        const testFoto = 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg';

        const imgResponse = await fetch(testFoto);
        const imgBuffer = await imgResponse.arrayBuffer();
        const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

        const desarrollo = failedVideo.desarrollo?.split(',')[0]?.trim() || 'Los Encinos';
        // Prompt: SOLO la fachada de la imagen, sin generar otras casas
        const prompt = `IMPORTANT: Use ONLY the exact house facade from the input image. Do NOT generate any other buildings.

Slow cinematic camera movement towards this specific house facade. Show only the real architectural details from the image. Golden hour lighting, professional real estate style. Keep the camera focused on this exact house throughout. 6 seconds, 4K. No text overlays.`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 6 }
          })
        });

        const result = await response.json() as any;
        const operationName = result.name;

        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: failedVideo.lead_phone,
          lead_name: failedVideo.lead_name,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video regenerado para ${failedVideo.lead_name}`,
          operation_id: operationName,
          deleted_failed_id: failedVideo.id
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // DEBUG: Ver respuesta completa de Google para una operación
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/check-google-operation/')) {
      const opId = url.pathname.replace('/check-google-operation/', '');
      console.log(`🔍 Verificando operación Google: ${opId}`);

      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${opId}`,
        { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } }
      );

      const responseText = await statusResponse.text();
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }

      return corsResponse(JSON.stringify({
        status_code: statusResponse.status,
        raw_response: responseText.substring(0, 2000),
        parsed: parsed,
        possible_uri_paths: parsed ? {
          path1: parsed?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
          path2: parsed?.response?.generatedSamples?.[0]?.video?.uri,
          path3: parsed?.result?.videos?.[0]?.uri,
          path4: parsed?.videos?.[0]?.uri,
          path5: parsed?.response?.video?.uri,
          path6: parsed?.metadata?.videos?.[0]?.uri
        } : null
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // ADMIN: Eliminar lead por ID o teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/admin/delete-lead/')) {
      const identifier = url.pathname.split('/').pop();
      console.log(`🗑️ Eliminando lead: ${identifier}`);

      // Buscar por ID (UUID) o por teléfono
      const isUUID = identifier?.includes('-') && identifier.length > 30;

      let query = supabase.client.from('leads').delete();
      if (isUUID) {
        query = query.eq('id', identifier);
      } else {
        query = query.ilike('phone', `%${identifier}%`);
      }

      const { error, count } = await query.select('id');

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead eliminado`,
        identifier
      }));
    }


    // ═══════════════════════════════════════════════════════════
    // VER VIDEOS PENDIENTES
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/pending-videos') {
      const { data } = await supabase.client
        .from('pending_videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      return corsResponse(JSON.stringify(data || []));
    }

    // ═══════════════════════════════════════════════════════════
    // REENVIAR VIDEO POR ID
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/resend-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reenviando video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      if (!video.video_url || video.video_url.startsWith('ERROR')) {
        return corsResponse(JSON.stringify({ error: 'Video no tiene URL válido', video_url: video.video_url }), 400);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video
        console.log('📥 Descargando video...');
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({ error: `Error descargando: ${videoResponse.status}` }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        console.log('📤 Subiendo a Meta...');
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Media ID: ${mediaId}`);

        // Enviar por WhatsApp
        console.log(`📱 Enviando a ${video.lead_phone}...`);
        await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
          `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

        // Marcar como enviado
        await supabase.client
          .from('pending_videos')
          .update({ video_url: video.video_url + ' (ENVIADO)', completed_at: new Date().toISOString() })
          .eq('id', video.id);

        return corsResponse(JSON.stringify({ ok: true, message: `Video reenviado a ${video.lead_phone}` }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ENVIAR VIDEO SEMANAL A ROLES ESPECÍFICOS
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/send-video-to-role') {
      const videoId = url.searchParams.get('video_id') || '5db9803f-a8e0-4bde-a2e4-e44ac2b236d2';
      const role = url.searchParams.get('role') || 'coordinador';

      console.log(`📤 Enviando video ${videoId} a rol: ${role}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video || !video.video_url) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado o sin URL' }), 404);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video
        console.log('📥 Descargando video...');
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({ error: `Error descargando: ${videoResponse.status}` }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        console.log('📤 Subiendo a Meta...');
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Media ID: ${mediaId}`);

        // Obtener miembros del rol
        const { data: equipo } = await supabase.client
          .from('team_members')
          .select('phone, name')
          .eq('role', role)
          .eq('active', true);

        const enviados: string[] = [];
        const errores: string[] = [];

        for (const miembro of equipo || []) {
          if (!miembro.phone) continue;
          try {
            await meta.sendWhatsAppVideoById(miembro.phone, mediaId,
              `🎬 *¡Video de la semana!*\n\n🏠 ${video.desarrollo}\n\n¡Excelente trabajo equipo! 👪🔥`);
            console.log(`✅ Video enviado a ${miembro.name}`);
            enviados.push(miembro.name);
          } catch (e: any) {
            console.error(`❌ Error enviando a ${miembro.name}: ${e.message}`);
            errores.push(`${miembro.name}: ${e.message}`);
          }
        }

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video enviado a ${enviados.length} ${role}s`,
          enviados,
          errores
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ENVIAR VIDEO A TELÉFONOS ESPECÍFICOS
    // /send-video-to-phones?video_id=XXX&phones=521...,521...,521...
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/send-video-to-phones') {
      const videoId = url.searchParams.get('video_id');
      const phonesParam = url.searchParams.get('phones');

      if (!videoId || !phonesParam) {
        return corsResponse(JSON.stringify({ error: 'Faltan video_id o phones' }), 400);
      }

      const phones = phonesParam.split(',').map(p => p.trim());
      console.log(`📤 Enviando video ${videoId} a ${phones.length} teléfonos`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video || !video.video_url) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado o sin URL' }), 404);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video
        console.log('📥 Descargando video...');
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({ error: `Error descargando: ${videoResponse.status}` }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        console.log('📤 Subiendo a Meta...');
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Media ID: ${mediaId}`);

        // Parsear stats para caption
        let caption = '🎬 *¡RESUMEN SEMANAL!*\n\n¡Excelente trabajo equipo! 🔥';
        try {
          const stats = JSON.parse(video.desarrollo);
          caption = `🎬 *¡RESUMEN SEMANAL!*\n\n` +
            `📊 *Resultados del equipo:*\n` +
            `   📥 ${stats.leads} leads nuevos\n` +
            `   📅 ${stats.citas} citas agendadas\n` +
            `   🏆 ${stats.cierres} cierres\n\n` +
            `¡Vamos por más! 💪🔥`;
        } catch (e) {
          console.log('⚠️ No se pudo parsear stats, usando caption default');
        }

        // Enviar a cada teléfono
        const enviados: string[] = [];
        const errores: string[] = [];

        for (const phone of phones) {
          try {
            const phoneFormatted = phone.startsWith('52') ? phone : '52' + phone;
            await meta.sendWhatsAppVideoById(phoneFormatted, mediaId, caption);
            console.log(`✅ Video enviado a ${phoneFormatted}`);
            enviados.push(phoneFormatted);
          } catch (e: any) {
            console.error(`❌ Error enviando a ${phone}: ${e.message}`);
            errores.push(`${phone}: ${e.message}`);
          }
        }

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video enviado a ${enviados.length}/${phones.length} teléfonos`,
          enviados,
          errores
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Generar video Veo 3 personalizado
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // CONSULTAR ESTADOS DE ENTREGA DE MENSAJES
    // /message-status?phone=521... o /message-status?hours=24
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/message-status') {
      const phone = url.searchParams.get('phone');
      const hours = parseInt(url.searchParams.get('hours') || '24');

      try {
        let query = supabase.client
          .from('message_delivery_status')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(100);

        if (phone) {
          const phoneClean = phone.replace(/\D/g, '');
          query = query.like('recipient_phone', `%${phoneClean.slice(-10)}`);
        } else {
          const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
          query = query.gte('updated_at', since);
        }

        const { data, error } = await query;

        if (error) {
          // Si la tabla no existe, mostrar mensaje amigable
          if (error.message.includes('does not exist')) {
            return corsResponse(JSON.stringify({
              error: 'Tabla message_delivery_status no existe',
              hint: 'Ejecuta el SQL para crearla o espera a que lleguen los primeros webhooks de estado',
              sql: `CREATE TABLE message_delivery_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  recipient_phone TEXT NOT NULL,
  status TEXT NOT NULL,
  timestamp TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mds_phone ON message_delivery_status(recipient_phone);
CREATE INDEX idx_mds_status ON message_delivery_status(status);
CREATE INDEX idx_mds_updated ON message_delivery_status(updated_at);`
            }));
          }
          throw error;
        }

        // Agrupar por estado
        const resumen = {
          sent: data?.filter(d => d.status === 'sent').length || 0,
          delivered: data?.filter(d => d.status === 'delivered').length || 0,
          read: data?.filter(d => d.status === 'read').length || 0,
          failed: data?.filter(d => d.status === 'failed').length || 0
        };

        return corsResponse(JSON.stringify({
          query: phone ? `phone: ${phone}` : `últimas ${hours} horas`,
          resumen,
          total: data?.length || 0,
          mensajes: data?.slice(0, 50) // Limitar a 50 para no sobrecargar
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // API DOCS - Documentación OpenAPI/Swagger
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/docs' || url.pathname === '/api/docs') {
      const baseUrl = `https://${url.host}`;
      const specUrl = `${baseUrl}/api/openapi.json`;
      return new Response(generateSwaggerUI(specUrl), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/docs/redoc') {
      const baseUrl = `https://${url.host}`;
      const specUrl = `${baseUrl}/api/openapi.json`;
      return new Response(generateReDocUI(specUrl), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/openapi.json' || url.pathname === '/openapi.json') {
      const baseUrl = `https://${url.host}`;
      const spec = generateOpenAPISpec(baseUrl);
      return corsResponse(JSON.stringify(spec, null, 2), 200, 'application/json', request);
    }


    // ═══════════════════════════════════════════════════════════════
    // STATUS DASHBOARD - Vista completa del sistema
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/status') {
      const status = await getSystemStatus(supabase, env, cache);

      // Si piden HTML, devolver página bonita
      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(renderStatusPage(status), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(status, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // BACKUP - Exportar datos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/backup') {
      console.log('📦 Generando backup...');
      const backup = await exportBackup(supabase);
      return corsResponse(JSON.stringify(backup));
    }

    // ═══════════════════════════════════════════════════════════════
    // ANALYTICS DASHBOARD - Métricas de conversión y ventas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/analytics') {
      const period = url.searchParams.get('period') || '30';
      const analytics = await getAnalyticsDashboard(supabase, parseInt(period));

      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(renderAnalyticsPage(analytics), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(analytics, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // OBSERVABILITY DASHBOARD - CRONs, errors, health, business metrics
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/observability') {
      const authErr = checkApiAuth(request, env);
      if (authErr) {
        const origin = request.headers.get('Origin');
        if (!isAllowedCrmOrigin(origin)) return authErr;
      }
      try {
        const dashboard = await getObservabilityDashboard(supabase);
        return corsResponse(JSON.stringify(dashboard, null, 2), 200, 'application/json', request);
      } catch (e) {
        return corsResponse(JSON.stringify({ error: 'Error generating observability dashboard' }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // DEVELOPMENT FUNNEL - Per-development conversion metrics
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/development-funnel') {
      const authErr = checkApiAuth(request, env);
      if (authErr) {
        const origin = request.headers.get('Origin');
        if (!isAllowedCrmOrigin(origin)) return authErr;
      }

      const development = url.searchParams.get('development');
      const days = parseInt(url.searchParams.get('days') || '90');
      const funnelService = new DevelopmentFunnelService(supabase);

      try {
        if (development) {
          const funnel = await funnelService.getFunnel(development, days);
          return corsResponse(JSON.stringify(funnel, null, 2), 200, 'application/json', request);
        } else {
          const comparison = await funnelService.compareAll(days);
          return corsResponse(JSON.stringify(comparison, null, 2), 200, 'application/json', request);
        }
      } catch (e) {
        return corsResponse(JSON.stringify({ error: 'Error generating funnel data' }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // COTIZACIÓN HTML - Professional quote page (public, accessed via link)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/cotizacion/')) {
      const offerId = url.pathname.split('/')[2];
      if (!offerId) return corsResponse(JSON.stringify({ error: 'Missing offer ID' }), 400);

      try {
        const cotizacion = await buildCotizacionFromOffer(supabase, offerId);
        if (!cotizacion) {
          return new Response('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h1>Cotización no encontrada</h1><p>Esta cotización ya no está disponible o ha expirado.</p></body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
        const html = generateCotizacionHTML(cotizacion);
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
        });
      } catch (e) {
        console.error('Error generating cotización:', e);
        return new Response('<html><body><h1>Error</h1></body></html>', {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // QUALITY DASHBOARD - Calidad de respuestas SARA
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/quality') {
      const dias = parseInt(url.searchParams.get('days') || '7');
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);

      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, conversation_history, updated_at')
        .gte('updated_at', fechaInicio.toISOString());

      // Análisis de calidad
      const nombresHallucinated = ['Salma', 'María', 'Maria', 'Juan', 'Pedro', 'Ana', 'Luis', 'Carlos'];
      const frasesProhibidas = ['Le aviso a', 'Sin problema', 'no lo tenemos disponible', 'Citadella del Nogal no'];

      let totalRespuestas = 0;
      let respuestasOk = 0;
      const problemasPorTipo: Record<string, number> = {};
      const problemasRecientes: any[] = [];

      (leads || []).forEach((lead: any) => {
        (lead.conversation_history || []).forEach((msg: any, idx: number) => {
          if (msg.role !== 'assistant') return;
          totalRespuestas++;
          const content = (msg.content || '').trim();
          let tieneProblema = false;

          if (content.endsWith(',') || (content.length > 0 && content.length < 20)) {
            problemasPorTipo['truncada'] = (problemasPorTipo['truncada'] || 0) + 1;
            tieneProblema = true;
          }
          if (!lead.name) {
            for (const n of nombresHallucinated) {
              if (content.includes(n)) { problemasPorTipo['nombre_inventado'] = (problemasPorTipo['nombre_inventado'] || 0) + 1; tieneProblema = true; break; }
            }
          }
          for (const f of frasesProhibidas) {
            if (content.toLowerCase().includes(f.toLowerCase())) { problemasPorTipo['frase_prohibida'] = (problemasPorTipo['frase_prohibida'] || 0) + 1; tieneProblema = true; break; }
          }

          if (tieneProblema) {
            problemasRecientes.push({ lead: lead.name || '???', preview: content.slice(0, 60), timestamp: msg.timestamp });
          } else {
            respuestasOk++;
          }
        });
      });

      const tasaCalidad = totalRespuestas > 0 ? Math.round((respuestasOk / totalRespuestas) * 100) : 100;

      // Renderizar HTML
      const html = `<!DOCTYPE html>
<html><head><title>SARA - Calidad</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:20px;background:#1a1a2e;color:#eee}
.container{max-width:900px;margin:0 auto}
h1{color:#00d4ff;margin-bottom:5px}
.subtitle{color:#888;margin-bottom:30px}
.card{background:#16213e;border-radius:12px;padding:20px;margin-bottom:20px}
.metric{display:inline-block;margin-right:40px;text-align:center}
.metric .value{font-size:48px;font-weight:bold}
.metric .label{font-size:14px;color:#888}
.ok{color:#00ff88}.warn{color:#ffaa00}.bad{color:#ff4444}
.bar{height:8px;background:#333;border-radius:4px;margin:10px 0}
.bar-fill{height:100%;border-radius:4px;transition:width 0.5s}
table{width:100%;border-collapse:collapse;margin-top:15px}
th,td{padding:10px;text-align:left;border-bottom:1px solid #333}
th{color:#00d4ff}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:5px}
.tag-truncada{background:#ff444433;color:#ff4444}
.tag-nombre{background:#ffaa0033;color:#ffaa00}
.tag-frase{background:#ff880033;color:#ff8800}
</style></head>
<body><div class="container">
<h1>📊 Dashboard de Calidad SARA</h1>
<p class="subtitle">Últimos ${dias} días • Actualizado: ${new Date().toLocaleString('es-MX')}</p>

<div class="card">
<div class="metric"><div class="value ${tasaCalidad >= 95 ? 'ok' : tasaCalidad >= 85 ? 'warn' : 'bad'}">${tasaCalidad}%</div><div class="label">Calidad</div></div>
<div class="metric"><div class="value">${totalRespuestas}</div><div class="label">Respuestas</div></div>
<div class="metric"><div class="value ok">${respuestasOk}</div><div class="label">OK</div></div>
<div class="metric"><div class="value ${totalRespuestas - respuestasOk > 0 ? 'warn' : 'ok'}">${totalRespuestas - respuestasOk}</div><div class="label">Con problemas</div></div>
</div>

<div class="card">
<h3>Problemas por Tipo</h3>
${Object.entries(problemasPorTipo).map(([tipo, count]) => `
<div style="margin:10px 0">
  <span>${tipo}: <strong>${count}</strong></span>
  <div class="bar"><div class="bar-fill" style="width:${Math.min((count as number / totalRespuestas) * 100 * 10, 100)}%;background:${tipo === 'truncada' ? '#ff4444' : tipo === 'nombre_inventado' ? '#ffaa00' : '#ff8800'}"></div></div>
</div>`).join('') || '<p style="color:#888">Sin problemas detectados ✅</p>'}
</div>

<div class="card">
<h3>Últimos Problemas</h3>
${problemasRecientes.length > 0 ? `<table>
<tr><th>Lead</th><th>Preview</th><th>Fecha</th></tr>
${problemasRecientes.slice(-10).reverse().map(p => `<tr><td>${p.lead}</td><td style="font-size:12px;color:#aaa">${p.preview}...</td><td style="font-size:12px">${new Date(p.timestamp).toLocaleString('es-MX')}</td></tr>`).join('')}
</table>` : '<p style="color:#00ff88">✅ Sin problemas recientes</p>'}
</div>

<p style="text-align:center;color:#666;margin-top:30px">SARA CRM v2.0 • <a href="/status" style="color:#00d4ff">Status</a> • <a href="/analytics" style="color:#00d4ff">Analytics</a></p>
</div></body></html>`;

      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // ═══════════════════════════════════════════════════════════════
    // FEATURE FLAGS - Control de funcionalidades sin deploy
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/flags' || url.pathname === '/flags') {
      const featureFlags = createFeatureFlags(env.SARA_CACHE);

      // GET - Obtener todos los flags
      if (request.method === 'GET') {
        const flags = await featureFlags.getFlags();
        return corsResponse(JSON.stringify({
          success: true,
          flags,
          updated_at: new Date().toISOString()
        }, null, 2), 200, 'application/json', request);
      }

      // PUT/POST - Actualizar flags (requiere auth)
      if (request.method === 'PUT' || request.method === 'POST') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        try {
          const rawBody = await request.json() as Record<string, any>;
          const ALLOWED_FLAG_FIELDS = ['ai_responses_enabled', 'ai_credit_flow_enabled', 'ai_multilang_enabled', 'slack_notifications_enabled', 'email_reports_enabled', 'sentry_enabled', 'audio_transcription_enabled', 'auto_followups_enabled', 'broadcast_enabled', 'tts_enabled', 'voice_messages_enabled', 'retell_enabled', 'cadencia_inteligente', 'outside_hours_responses', 'smart_caching_enabled', 'audit_log_enabled', 'ab_test_greeting', 'ab_test_cta', 'rate_limit_per_minute', 'max_ai_tokens'];
          const body = Object.fromEntries(
            Object.entries(rawBody).filter(([k]) => ALLOWED_FLAG_FIELDS.includes(k))
          );
          await featureFlags.setFlags(body);
          const updatedFlags = await featureFlags.getFlags();
          return corsResponse(JSON.stringify({
            success: true,
            message: 'Flags actualizados',
            flags: updatedFlags
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // DELETE - Resetear a defaults (requiere auth)
      if (request.method === 'DELETE') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        await featureFlags.resetToDefaults();
        const flags = await featureFlags.getFlags();
        return corsResponse(JSON.stringify({
          success: true,
          message: 'Flags reseteados a valores por defecto',
          flags
        }, null, 2), 200, 'application/json', request);
      }
    }



    // ═══════════════════════════════════════════════════════════════
    // EMAIL REPORTS - Enviar reportes por correo
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/reports/send' || url.pathname === '/send-report') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const period = url.searchParams.get('period') || 'weekly';
      const emailReports = createEmailReports(supabase, env);

      let success = false;
      if (period === 'daily') {
        success = await emailReports.sendDailyReport();
      } else if (period === 'monthly') {
        success = await emailReports.sendMonthlyReport();
      } else {
        success = await emailReports.sendWeeklyReport();
      }

      return corsResponse(JSON.stringify({
        success,
        message: success ? `Reporte ${period} enviado` : 'Error enviando reporte (verificar RESEND_API_KEY)',
        period
      }), success ? 200 : 500, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // EMAIL REPORTS - Preview del reporte (sin enviar)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/reports/preview' || url.pathname === '/report-preview') {
      const days = parseInt(url.searchParams.get('days') || '7');
      const emailReports = createEmailReports(supabase, env);
      const data = await emailReports.generateReportData(days);

      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(emailReports.generateReportHTML(data), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(data, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // AUDIT LOG - Bitácora de acciones
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/audit' || url.pathname === '/audit') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const auditLog = createAuditLog(env.SARA_CACHE);

      // GET - Consultar logs
      if (request.method === 'GET') {
        const action = url.searchParams.get('action') || undefined;
        const actorType = url.searchParams.get('actor_type') || undefined;
        const targetId = url.searchParams.get('target_id') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const hours = parseInt(url.searchParams.get('hours') || '24');

        // Si piden summary
        if (url.searchParams.get('summary') === 'true') {
          const summary = await auditLog.getSummary(hours);
          return corsResponse(JSON.stringify({
            success: true,
            period_hours: hours,
            summary
          }, null, 2), 200, 'application/json', request);
        }

        const entries = await auditLog.query({
          action: action as any,
          actorType,
          targetId,
          limit
        });

        return corsResponse(JSON.stringify({
          success: true,
          count: entries.length,
          entries
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CACHE MANAGEMENT - Administrar caché inteligente
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/cache' || url.pathname === '/cache') {
      // GET - Ver stats del cache
      if (request.method === 'GET') {
        const info = (cache as any).getCacheInfo();
        return corsResponse(JSON.stringify({
          success: true,
          ...info
        }, null, 2), 200, 'application/json', request);
      }

      // POST - Warmup del cache
      if (request.method === 'POST') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        const result = await (cache as any).warmup(supabase);
        return corsResponse(JSON.stringify({
          success: result.success,
          message: result.success ? 'Cache precalentado' : 'Error en warmup',
          cached: result.cached
        }, null, 2), result.success ? 200 : 500, 'application/json', request);
      }

      // DELETE - Invalidar todo el cache
      if (request.method === 'DELETE') {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        await cache.invalidateAll();
        return corsResponse(JSON.stringify({
          success: true,
          message: 'Cache invalidado completamente'
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // METRICS - Dashboard de rendimiento y latencia
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/metrics' || url.pathname === '/api/metrics') {
      const metrics = createMetrics(env.SARA_CACHE);
      const hours = parseInt(url.searchParams.get('hours') || '1');
      const summary = await metrics.getSummary(hours);

      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(metrics.generateDashboardHTML(summary), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return corsResponse(JSON.stringify(summary, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // BUSINESS HOURS - Estado del horario laboral
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/business-hours' || url.pathname === '/business-hours') {
      const businessHours = createBusinessHours();
      const info = businessHours.getScheduleInfo();
      const config = businessHours.getConfig();

      return corsResponse(JSON.stringify({
        success: true,
        ...info,
        schedule: config.schedule.map(s => ({
          ...s,
          dayName: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][s.dayOfWeek]
        })),
        holidays: config.holidayDates || []
      }, null, 2), 200, 'application/json', request);
    }

    // ═══════════════════════════════════════════════════════════════
    // SENTIMENT ANALYSIS - Análisis de sentimiento de mensajes
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/sentiment' || url.pathname === '/api/sentiment/analyze') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const sentiment = createSentimentAnalysis();

      // POST /api/sentiment - Analizar un mensaje
      if (request.method === 'POST' && url.pathname === '/api/sentiment') {
        try {
          const body = await request.json() as any;

          if (!body.message || typeof body.message !== 'string') {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "message"'
            }), 400, 'application/json', request);
          }

          const result = sentiment.analyze(body.message);
          const alertInfo = sentiment.shouldAlert(result);

          return corsResponse(JSON.stringify({
            success: true,
            message: body.message.substring(0, 100) + (body.message.length > 100 ? '...' : ''),
            analysis: result,
            alert: alertInfo
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/sentiment/analyze - Analizar conversación completa
      if (request.method === 'POST' && url.pathname === '/api/sentiment/analyze') {
        try {
          const body = await request.json() as any;

          if (!body.messages || !Array.isArray(body.messages)) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "messages" como array'
            }), 400, 'application/json', request);
          }

          const result = sentiment.analyzeConversation(body.messages);

          return corsResponse(JSON.stringify({
            success: true,
            conversation: {
              overall: result.overall,
              trend: result.trend,
              avgScore: result.avgScore,
              messageCount: result.leadMessages.length
            },
            details: result.leadMessages
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WHATSAPP TEMPLATES - Gestión de templates de WhatsApp Business
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/templates' || url.pathname.startsWith('/api/templates/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const templates = createWhatsAppTemplates(
        env.SARA_CACHE,
        env.META_PHONE_NUMBER_ID,
        env.META_ACCESS_TOKEN
      );

      // GET /api/templates - Listar todos los templates
      if (request.method === 'GET' && url.pathname === '/api/templates') {
        const list = await templates.getTemplates();
        return corsResponse(JSON.stringify({
          success: true,
          count: list.length,
          templates: list
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/templates/approved - Solo templates aprobados
      if (request.method === 'GET' && url.pathname === '/api/templates/approved') {
        const list = await templates.getApprovedTemplates();
        return corsResponse(JSON.stringify({
          success: true,
          count: list.length,
          templates: list
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/templates/stats - Estadísticas de uso
      if (request.method === 'GET' && url.pathname === '/api/templates/stats') {
        const stats = await templates.getUsageStats();
        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/templates/sync - Sincronizar desde Meta
      if (request.method === 'POST' && url.pathname === '/api/templates/sync') {
        const synced = await templates.syncFromMeta();
        return corsResponse(JSON.stringify({
          success: true,
          message: `Sincronizados ${synced.length} templates`,
          templates: synced
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/templates/create - Crear un template en Meta
      if (request.method === 'POST' && url.pathname === '/api/templates/create') {
        try {
          const body = await request.json() as any;
          const WABA_ID = '1227849769248437';

          if (!body.name || !body.components) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "name" y "components"'
            }), 400, 'application/json', request);
          }

          const payload = {
            name: body.name,
            language: body.language || 'es',
            category: body.category || 'UTILITY',
            components: body.components
          };

          const response = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json() as any;

          if (result.error) {
            return corsResponse(JSON.stringify({
              success: false,
              error: result.error.message,
              details: result.error
            }), 400, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            id: result.id,
            name: body.name,
            status: 'PENDING'
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e instanceof Error ? e.message : 'Error desconocido'
          }), 500, 'application/json', request);
        }
      }

      // POST /api/templates/send - Enviar un template
      if (request.method === 'POST' && url.pathname === '/api/templates/send') {
        try {
          const body = await request.json() as any;

          if (!body.to || !body.templateName) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "to" y "templateName"'
            }), 400, 'application/json', request);
          }

          const result = await templates.sendTemplate({
            to: body.to,
            templateName: body.templateName,
            language: body.language,
            headerParams: body.headerParams,
            bodyParams: body.bodyParams,
            headerMediaUrl: body.headerMediaUrl,
            headerMediaType: body.headerMediaType,
            buttonParams: body.buttonParams
          });

          return corsResponse(JSON.stringify({
            success: result.success,
            messageId: result.messageId,
            error: result.error
          }, null, 2), result.success ? 200 : 400, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // PUT /api/templates/:name - Actualizar metadata de un template
      const updateMatch = url.pathname.match(/^\/api\/templates\/([^\/]+)$/);
      if (request.method === 'PUT' && updateMatch) {
        try {
          const body = await request.json() as any;
          const updated = await templates.updateTemplateMetadata(updateMatch[1], {
            description: body.description,
            tags: body.tags
          });

          return corsResponse(JSON.stringify({
            success: !!updated,
            template: updated
          }), updated ? 200 : 404, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/templates/tag/:tag - Buscar por tag
      const tagMatch = url.pathname.match(/^\/api\/templates\/tag\/([^\/]+)$/);
      if (request.method === 'GET' && tagMatch) {
        const list = await templates.getTemplatesByTag(decodeURIComponent(tagMatch[1]));
        return corsResponse(JSON.stringify({
          success: true,
          tag: tagMatch[1],
          count: list.length,
          templates: list
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PIPELINE - Sales Pipeline Intelligence
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/pipeline' || url.pathname.startsWith('/api/pipeline/')) {
      // Auth removed - CRM accesses these endpoints directly
      const pipelineService = new PipelineService(supabase);

      // GET /api/pipeline - Full pipeline summary
      if (request.method === 'GET' && url.pathname === '/api/pipeline') {
        const timeframe = parseInt(url.searchParams.get('timeframe') || '90');
        const summary = await pipelineService.getPipelineSummary(timeframe);
        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/stages - Pipeline by stage
      if (request.method === 'GET' && url.pathname === '/api/pipeline/stages') {
        const stages = await pipelineService.getPipelineByStage();
        return corsResponse(JSON.stringify({
          success: true,
          stages
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/at-risk - At-risk leads
      if (request.method === 'GET' && url.pathname === '/api/pipeline/at-risk') {
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const atRisk = await pipelineService.getAtRiskLeads(limit);
        return corsResponse(JSON.stringify({
          success: true,
          count: atRisk.length,
          at_risk_leads: atRisk
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/forecast - Monthly forecast
      if (request.method === 'GET' && url.pathname === '/api/pipeline/forecast') {
        const forecast = await pipelineService.getMonthlyForecast();
        return corsResponse(JSON.stringify({
          success: true,
          ...forecast
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/pipeline/whatsapp - Pipeline formatted for WhatsApp
      if (request.method === 'GET' && url.pathname === '/api/pipeline/whatsapp') {
        const timeframe = parseInt(url.searchParams.get('timeframe') || '30');
        const summary = await pipelineService.getPipelineSummary(timeframe);
        const formatted = formatPipelineForWhatsApp(summary);
        return corsResponse(JSON.stringify({
          success: true,
          message: formatted
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // FINANCING CALCULATOR - Calculadora de crédito hipotecario
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/financing' || url.pathname.startsWith('/api/financing/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const financingService = new FinancingCalculatorService(supabase);

      // POST /api/financing/calculate - Calculate mortgage for single bank
      if (request.method === 'POST' && url.pathname === '/api/financing/calculate') {
        const body = await request.json() as any;
        const bank = body.bank || 'BBVA';
        const result = financingService.calculateMortgage({
          property_price: body.property_price || 0,
          down_payment_percent: body.down_payment_percent || 20,
          term_years: body.term_years || 20,
          annual_rate: body.annual_rate,
          income: body.income
        }, bank);

        if (!result) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No se pudo calcular. Verifica los parámetros.'
          }), 400, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          result
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/financing/compare - Compare all banks
      if (request.method === 'POST' && url.pathname === '/api/financing/compare') {
        const body = await request.json() as any;
        const comparison = financingService.compareBanks({
          property_price: body.property_price || 0,
          down_payment_percent: body.down_payment_percent || 20,
          term_years: body.term_years || 20,
          income: body.income,
          infonavit_credit: body.infonavit_credit,
          fovissste_credit: body.fovissste_credit
        });

        return corsResponse(JSON.stringify({
          success: true,
          ...comparison
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/financing/quick - Quick estimate
      if (request.method === 'GET' && url.pathname === '/api/financing/quick') {
        const price = parseFloat(url.searchParams.get('price') || '0');
        const downPayment = parseFloat(url.searchParams.get('down_payment') || '20');
        const term = parseInt(url.searchParams.get('term') || '20');

        if (price <= 0) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requiere el parámetro price (precio de la propiedad)'
          }), 400, 'application/json', request);
        }

        const estimate = financingService.quickEstimate(price, downPayment, term);
        return corsResponse(JSON.stringify({
          success: true,
          message: estimate
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/financing/banks - List available banks
      if (request.method === 'GET' && url.pathname === '/api/financing/banks') {
        const banks = financingService.getAvailableBanks();
        return corsResponse(JSON.stringify({
          success: true,
          banks
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/financing/qualify - Check qualification
      if (request.method === 'POST' && url.pathname === '/api/financing/qualify') {
        const body = await request.json() as any;
        const result = financingService.checkQualification(
          body.income || 0,
          body.property_price || 0,
          body.down_payment_percent || 20
        );

        return corsResponse(JSON.stringify({
          success: true,
          ...result
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PROPERTY COMPARATOR - Comparador de propiedades
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/compare' || url.pathname.startsWith('/api/compare/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const comparatorService = new PropertyComparatorService(supabase);

      // POST /api/compare - Compare properties by IDs
      if (request.method === 'POST' && url.pathname === '/api/compare') {
        const body = await request.json() as any;
        const ids = body.property_ids || [];

        if (ids.length < 2) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requieren al menos 2 property_ids para comparar'
          }), 400, 'application/json', request);
        }

        const comparison = await comparatorService.compare(ids);
        if (!comparison) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No se encontraron propiedades para comparar'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          ...comparison
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/compare/developments - Compare by development names
      if (request.method === 'POST' && url.pathname === '/api/compare/developments') {
        const body = await request.json() as any;
        const developments = body.developments || [];

        if (developments.length < 2) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requieren al menos 2 desarrollos para comparar'
          }), 400, 'application/json', request);
        }

        const comparison = await comparatorService.compareByDevelopments(developments);
        if (!comparison) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No se encontraron propiedades en estos desarrollos'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          ...comparison
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/compare/search - Search properties with filters
      if (request.method === 'GET' && url.pathname === '/api/compare/search') {
        const filters = {
          min_price: url.searchParams.get('min_price') ? parseInt(url.searchParams.get('min_price')!) : undefined,
          max_price: url.searchParams.get('max_price') ? parseInt(url.searchParams.get('max_price')!) : undefined,
          min_bedrooms: url.searchParams.get('min_bedrooms') ? parseInt(url.searchParams.get('min_bedrooms')!) : undefined,
          type: url.searchParams.get('type') || undefined,
          development: url.searchParams.get('development') || undefined
        };

        const properties = await comparatorService.searchProperties(filters);

        return corsResponse(JSON.stringify({
          success: true,
          count: properties.length,
          properties
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/compare/quick - Quick comparison via text query
      if (request.method === 'GET' && url.pathname === '/api/compare/quick') {
        const query = url.searchParams.get('q') || '';

        if (!query) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requiere el parámetro q con los desarrollos a comparar'
          }), 400, 'application/json', request);
        }

        const message = await comparatorService.quickCompare(query);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CLOSE PROBABILITY - Probabilidad de cierre
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/probability' || url.pathname.startsWith('/api/probability/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const probService = new CloseProbabilityService(supabase);

      // GET /api/probability - All leads probability summary
      if (request.method === 'GET' && url.pathname === '/api/probability') {
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const data = await probService.calculateForAllLeads(limit);

        return corsResponse(JSON.stringify({
          success: true,
          ...data
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/lead/:id - Single lead probability
      if (request.method === 'GET' && url.pathname.startsWith('/api/probability/lead/')) {
        const leadId = url.pathname.split('/').pop() || '';
        const result = await probService.calculateForLead(leadId);

        if (!result) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Lead no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          ...result
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/high - High probability leads
      if (request.method === 'GET' && url.pathname === '/api/probability/high') {
        const threshold = parseInt(url.searchParams.get('threshold') || '70');
        const leads = await probService.getHighProbabilityLeads(threshold);

        return corsResponse(JSON.stringify({
          success: true,
          count: leads.length,
          threshold,
          leads
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/at-risk - At-risk leads
      if (request.method === 'GET' && url.pathname === '/api/probability/at-risk') {
        const leads = await probService.getAtRiskLeads();

        return corsResponse(JSON.stringify({
          success: true,
          count: leads.length,
          leads
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/probability/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/probability/whatsapp') {
        const data = await probService.calculateForAllLeads(50);
        const message = probService.formatForWhatsApp(data);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // VISIT MANAGEMENT - Gestión de visitas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/visits' || url.pathname.startsWith('/api/visits/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const visitService = new VisitManagementService(supabase);

      // GET /api/visits - Visit summary
      if (request.method === 'GET' && url.pathname === '/api/visits') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const summary = await visitService.getVisitSummary(days);

        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/today - Today's visits
      if (request.method === 'GET' && url.pathname === '/api/visits/today') {
        const visits = await visitService.getTodayVisits();

        return corsResponse(JSON.stringify({
          success: true,
          count: visits.length,
          visits
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/tomorrow - Tomorrow's visits
      if (request.method === 'GET' && url.pathname === '/api/visits/tomorrow') {
        const visits = await visitService.getTomorrowVisits();

        return corsResponse(JSON.stringify({
          success: true,
          count: visits.length,
          visits
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/week - This week's visits
      if (request.method === 'GET' && url.pathname === '/api/visits/week') {
        const visits = await visitService.getWeekVisits();

        return corsResponse(JSON.stringify({
          success: true,
          count: visits.length,
          visits
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/visits/whatsapp - WhatsApp formatted summary
      if (request.method === 'GET' && url.pathname === '/api/visits/whatsapp') {
        const summary = await visitService.getVisitSummary(30);
        const message = visitService.formatSummaryForWhatsApp(summary);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/visits/:id/status - Update visit status
      if (request.method === 'POST' && url.pathname.match(/^\/api\/visits\/[^\/]+\/status$/)) {
        const visitId = url.pathname.split('/')[3];
        const body = await request.json() as any;

        const success = await visitService.updateVisitStatus(
          visitId,
          body.status,
          body.feedback,
          body.rating
        );

        return corsResponse(JSON.stringify({
          success,
          message: success ? 'Visita actualizada' : 'Error actualizando visita'
        }), success ? 200 : 500, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // OFFER TRACKING - Tracking de ofertas y negociaciones
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/offers' || url.pathname.startsWith('/api/offers/')) {
      // Auth removed - CRM accesses these endpoints directly
      const offerService = new OfferTrackingService(supabase);

      // GET /api/offers - Offer summary
      if (request.method === 'GET' && url.pathname === '/api/offers') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const summary = await offerService.getOfferSummary(days);

        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/active - Active offers
      if (request.method === 'GET' && url.pathname === '/api/offers/active') {
        const offers = await offerService.getActiveOffers();

        return corsResponse(JSON.stringify({
          success: true,
          count: offers.length,
          offers
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/expiring - Expiring soon
      if (request.method === 'GET' && url.pathname === '/api/offers/expiring') {
        const days = parseInt(url.searchParams.get('days') || '3');
        const offers = await offerService.getExpiringSoon(days);

        return corsResponse(JSON.stringify({
          success: true,
          count: offers.length,
          offers
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/lead/:id - Offers for a lead
      if (request.method === 'GET' && url.pathname.match(/^\/api\/offers\/lead\/[^\/]+$/)) {
        const leadId = url.pathname.split('/').pop() || '';
        const offers = await offerService.getOffersByLead(leadId);

        return corsResponse(JSON.stringify({
          success: true,
          count: offers.length,
          offers
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/offers/whatsapp - WhatsApp formatted summary
      if (request.method === 'GET' && url.pathname === '/api/offers/whatsapp') {
        const summary = await offerService.getOfferSummary(30);
        const message = offerService.formatSummaryForWhatsApp(summary);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/offers/:id/status - Update offer status
      if (request.method === 'POST' && url.pathname.match(/^\/api\/offers\/[^\/]+\/status$/)) {
        const offerId = url.pathname.split('/')[3];
        const body = await request.json() as any;

        const success = await offerService.updateOfferStatus(
          offerId,
          body.status,
          body.notes,
          body.changed_by
        );

        return corsResponse(JSON.stringify({
          success,
          message: success ? 'Oferta actualizada' : 'Error actualizando oferta'
        }), success ? 200 : 500, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SMART ALERTS - Alertas inteligentes
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/alerts' || url.pathname.startsWith('/api/alerts/')) {
      // Auth removed - CRM accesses these endpoints directly
      const alertsService = new SmartAlertsService(supabase);

      // GET /api/alerts - All alerts summary
      if (request.method === 'GET' && url.pathname === '/api/alerts') {
        const summary = await alertsService.getAlertsSummary();

        return corsResponse(JSON.stringify({
          success: true,
          ...summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/alerts/scan - Force scan for new alerts
      if (request.method === 'GET' && url.pathname === '/api/alerts/scan') {
        const alerts = await alertsService.scanForAlerts();

        return corsResponse(JSON.stringify({
          success: true,
          count: alerts.length,
          alerts
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/alerts/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/alerts/whatsapp') {
        const summary = await alertsService.getAlertsSummary();
        const message = alertsService.formatSummaryForWhatsApp(summary);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MARKET INTELLIGENCE - Inteligencia de mercado
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/market' || url.pathname.startsWith('/api/market/')) {
      // Auth removed - CRM accesses these endpoints directly
      const { MarketIntelligenceService } = await import('../services/marketIntelligenceService');
      const marketService = new MarketIntelligenceService(supabase);

      // GET /api/market - Full market analysis
      if (request.method === 'GET' && url.pathname === '/api/market') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const analysis = await marketService.getMarketAnalysis(days);

        return corsResponse(JSON.stringify({
          success: true,
          analysis
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/market/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/market/whatsapp') {
        const days = parseInt(url.searchParams.get('days') || '30');
        const analysis = await marketService.getMarketAnalysis(days);
        const message = marketService.formatForWhatsApp(analysis);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CUSTOMER VALUE (CLV) - Valor del cliente y referidos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/clv' || url.pathname.startsWith('/api/clv/')) {
      // Auth removed - CRM accesses these endpoints directly
      const { CustomerValueService } = await import('../services/customerValueService');
      const clvService = new CustomerValueService(supabase);

      // GET /api/clv - Full CLV analysis
      if (request.method === 'GET' && url.pathname === '/api/clv') {
        const analysis = await clvService.getCLVAnalysis();

        return corsResponse(JSON.stringify({
          success: true,
          analysis
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/clv/customer/:id - Customer profile
      const customerMatch = url.pathname.match(/^\/api\/clv\/customer\/([^\/]+)$/);
      if (request.method === 'GET' && customerMatch) {
        const customerId = customerMatch[1];
        const profile = await clvService.getCustomerProfile(customerId);

        if (!profile) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Cliente no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          customer: profile
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/clv/referrals/:id - Customer referral chain
      const referralMatch = url.pathname.match(/^\/api\/clv\/referrals\/([^\/]+)$/);
      if (request.method === 'GET' && referralMatch) {
        const customerId = referralMatch[1];
        const chain = await clvService.getReferralChain(customerId);

        if (!chain) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Cliente no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          referrals: chain
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/clv/whatsapp - WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/clv/whatsapp') {
        const analysis = await clvService.getCLVAnalysis();
        const message = clvService.formatAnalysisForWhatsApp(analysis);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PDF REPORTS - Reportes PDF
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/reports' || url.pathname.startsWith('/api/reports/')) {
      // Auth removed - CRM accesses these endpoints directly
      const { PDFReportService } = await import('../services/pdfReportService');
      const reportService = new PDFReportService(supabase);

      // GET /api/reports/weekly - Weekly report
      if (request.method === 'GET' && url.pathname === '/api/reports/weekly') {
        const config = reportService.getWeeklyReportConfig();
        const data = await reportService.generateReportData(config);

        return corsResponse(JSON.stringify({
          success: true,
          report: data
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/reports/monthly - Monthly report
      if (request.method === 'GET' && url.pathname === '/api/reports/monthly') {
        const config = reportService.getMonthlyReportConfig();
        const data = await reportService.generateReportData(config);

        return corsResponse(JSON.stringify({
          success: true,
          report: data
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/reports/weekly/html - Weekly report as HTML
      if (request.method === 'GET' && url.pathname === '/api/reports/weekly/html') {
        const config = reportService.getWeeklyReportConfig();
        const data = await reportService.generateReportData(config);
        const html = reportService.generateHTML(data);

        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // GET /api/reports/monthly/html - Monthly report as HTML
      if (request.method === 'GET' && url.pathname === '/api/reports/monthly/html') {
        const config = reportService.getMonthlyReportConfig();
        const data = await reportService.generateReportData(config);
        const html = reportService.generateHTML(data);

        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // GET /api/reports/weekly/whatsapp - Weekly WhatsApp formatted
      if (request.method === 'GET' && url.pathname === '/api/reports/weekly/whatsapp') {
        const config = reportService.getWeeklyReportConfig();
        const data = await reportService.generateReportData(config);
        const message = reportService.formatForWhatsApp(data);

        return corsResponse(JSON.stringify({
          success: true,
          message
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/reports/vendor/:id - Vendor personal report
      const vendorReportMatch = url.pathname.match(/^\/api\/reports\/vendor\/([^\/]+)$/);
      if (request.method === 'GET' && vendorReportMatch) {
        const vendorId = vendorReportMatch[1];

        // Get vendor info
        const { data: vendor } = await supabase.client
          .from('team_members')
          .select('id, name')
          .eq('id', vendorId)
          .single();

        if (!vendor) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Vendedor no encontrado'
          }), 404, 'application/json', request);
        }

        const config = reportService.getVendorReportConfig(vendorId, vendor.name);
        const data = await reportService.generateReportData(config);

        return corsResponse(JSON.stringify({
          success: true,
          report: data
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/reports/custom - Custom report
      if (request.method === 'POST' && url.pathname === '/api/reports/custom') {
        try {
          const config = await request.json() as any;

          if (!config.start_date || !config.end_date) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren start_date y end_date'
            }), 400, 'application/json', request);
          }

          const data = await reportService.generateReportData({
            type: 'custom',
            title: config.title || 'Reporte Personalizado',
            start_date: config.start_date,
            end_date: config.end_date,
            include_sections: config.include_sections || [
              'executive_summary',
              'leads_overview',
              'sales_metrics',
              'recommendations'
            ],
            recipient_name: config.recipient_name,
            recipient_role: config.recipient_role,
            vendor_id: config.vendor_id
          });

          const format = url.searchParams.get('format');
          if (format === 'html') {
            const html = reportService.generateHTML(data);
            return new Response(html, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }

          if (format === 'whatsapp') {
            const message = reportService.formatForWhatsApp(data);
            return corsResponse(JSON.stringify({
              success: true,
              message
            }, null, 2), 200, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            report: data
          }, null, 2), 200, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WEBHOOKS - Configuración y gestión de webhooks
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/webhooks' || url.pathname.startsWith('/api/webhooks/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const { WebhookService } = await import('../services/webhookService');
      const webhookService = new WebhookService(supabase, env.SARA_CACHE);

      // GET /api/webhooks - List all webhooks
      if (request.method === 'GET' && url.pathname === '/api/webhooks') {
        const webhooks = await webhookService.loadWebhooks();

        return corsResponse(JSON.stringify({
          success: true,
          count: webhooks.length,
          webhooks
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks - Create webhook
      if (request.method === 'POST' && url.pathname === '/api/webhooks') {
        try {
          const body = await request.json() as any;

          if (!body.name || !body.url || !body.events) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren name, url y events'
            }), 400, 'application/json', request);
          }

          const webhook = await webhookService.createWebhook({
            name: body.name,
            url: body.url,
            events: body.events,
            headers: body.headers || {},
            active: body.active !== false,
            retry_count: body.retry_count || 3
          });

          if (!webhook) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Error al crear webhook'
            }), 500, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            webhook
          }, null, 2), 201, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }

      // GET /api/webhooks/:id/stats - Webhook stats
      const statsMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)\/stats$/);
      if (request.method === 'GET' && statsMatch) {
        const webhookId = statsMatch[1];
        const stats = await webhookService.getWebhookStats(webhookId);

        if (!stats) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'No hay estadísticas disponibles'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }

      // PUT /api/webhooks/:id - Update webhook
      const updateMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'PUT' && updateMatch) {
        const webhookId = updateMatch[1];

        try {
          const rawBody = await request.json() as any;
          const ALLOWED_WEBHOOK_FIELDS = ['name', 'url', 'events', 'secret', 'active', 'headers', 'retry_count'];
          const body = Object.fromEntries(
            Object.entries(rawBody).filter(([k]) => ALLOWED_WEBHOOK_FIELDS.includes(k))
          );
          const updated = await webhookService.updateWebhook(webhookId, body);

          if (!updated) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Error al actualizar webhook'
            }), 500, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            message: 'Webhook actualizado'
          }, null, 2), 200, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }

      // DELETE /api/webhooks/:id - Delete webhook
      const deleteMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        const webhookId = deleteMatch[1];
        const deleted = await webhookService.deleteWebhook(webhookId);

        if (!deleted) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Error al eliminar webhook'
          }), 500, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          message: 'Webhook eliminado'
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks/test - Test webhook delivery
      if (request.method === 'POST' && url.pathname === '/api/webhooks/test') {
        try {
          const body = await request.json() as any;

          if (!body.url) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere url'
            }), 400, 'application/json', request);
          }

          // Send test payload
          const testPayload = {
            event: 'test',
            timestamp: new Date().toISOString(),
            webhook_id: 'test',
            data: { message: 'Test webhook from SARA CRM' }
          };

          const response = await fetch(body.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'SARA-CRM-Webhook/1.0'
            },
            body: JSON.stringify(testPayload)
          });

          return corsResponse(JSON.stringify({
            success: response.ok,
            status: response.status,
            message: response.ok ? 'Test exitoso' : 'Test fallido'
          }, null, 2), 200, 'application/json', request);

        } catch (e: any) {
          return corsResponse(JSON.stringify({
            success: false,
            error: e.message
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TEAM DASHBOARD - Métricas y estadísticas del equipo
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/team' || url.pathname.startsWith('/api/team/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const dashboard = createTeamDashboard(env.SARA_CACHE);
      const period = url.searchParams.get('period') || undefined;

      // GET /api/team - Resumen del equipo
      if (request.method === 'GET' && url.pathname === '/api/team') {
        const summary = await dashboard.getTeamSummary(period);
        return corsResponse(JSON.stringify({
          success: true,
          summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/vendors - Métricas de todos los vendedores
      if (request.method === 'GET' && url.pathname === '/api/team/vendors') {
        const metrics = await dashboard.getAllVendorMetrics(period);
        return corsResponse(JSON.stringify({
          success: true,
          count: metrics.length,
          vendors: metrics
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/leaderboard - Ranking de vendedores
      if (request.method === 'GET' && url.pathname === '/api/team/leaderboard') {
        const metric = (url.searchParams.get('metric') as 'conversions' | 'revenue' | 'response_time' | 'score') || 'score';
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const leaderboard = await dashboard.getLeaderboard(metric, period, limit);
        return corsResponse(JSON.stringify({
          success: true,
          metric,
          leaderboard
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/vendor/:id - Métricas de un vendedor específico
      const vendorMatch = url.pathname.match(/^\/api\/team\/vendor\/([^\/]+)$/);
      if (request.method === 'GET' && vendorMatch) {
        const vendorId = vendorMatch[1];
        const metrics = await dashboard.getVendorMetrics(vendorId, period);
        return corsResponse(JSON.stringify({
          success: true,
          vendor: metrics
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/team/compare - Comparar dos vendedores
      if (request.method === 'GET' && url.pathname === '/api/team/compare') {
        const vendor1 = url.searchParams.get('vendor1');
        const vendor2 = url.searchParams.get('vendor2');

        if (!vendor1 || !vendor2) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Se requieren los parámetros vendor1 y vendor2'
          }), 400, 'application/json', request);
        }

        const comparison = await dashboard.compareVendors(vendor1, vendor2, period);
        return corsResponse(JSON.stringify({
          success: true,
          comparison
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/team/event - Registrar evento de vendedor
      if (request.method === 'POST' && url.pathname === '/api/team/event') {
        try {
          const body = await request.json() as any;

          if (!body.vendorId || !body.event) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "vendorId" y "event"'
            }), 400, 'application/json', request);
          }

          switch (body.event) {
            case 'lead_assigned':
              await dashboard.recordLeadAssigned(body.vendorId, body.vendorName || '', body.vendorPhone || '');
              break;
            case 'lead_contacted':
              await dashboard.recordLeadContacted(body.vendorId, body.responseTimeMinutes);
              break;
            case 'lead_qualified':
              await dashboard.recordLeadQualified(body.vendorId);
              break;
            case 'conversion':
              await dashboard.recordConversion(body.vendorId, body.saleValue, body.daysToConvert);
              break;
            case 'lead_lost':
              await dashboard.recordLeadLost(body.vendorId);
              break;
            case 'message':
              await dashboard.recordMessage(body.vendorId, body.direction || 'sent');
              break;
            case 'appointment':
              await dashboard.recordAppointment(body.vendorId, body.status || 'scheduled');
              break;
            default:
              return corsResponse(JSON.stringify({
                success: false,
                error: `Evento desconocido: ${body.event}`
              }), 400, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            message: `Evento ${body.event} registrado`
          }), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }
    // ═══════════════════════════════════════════════════════════════
    // LINK TRACKING - Rastreo de clicks en enlaces
    // ═══════════════════════════════════════════════════════════════

    // GET /t/:shortCode - Redirect con tracking (público, sin auth)
    const trackingMatch = url.pathname.match(/^\/t\/([a-zA-Z0-9]+)$/);
    if (request.method === 'GET' && trackingMatch) {
      const tracking = createLinkTracking(env.SARA_CACHE);
      const shortCode = trackingMatch[1];

      const result = await tracking.recordClick(shortCode, {
        ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || undefined,
        userAgent: request.headers.get('User-Agent') || undefined,
        referrer: request.headers.get('Referer') || undefined
      });

      if (result.success && result.redirectUrl) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': result.redirectUrl }
        });
      }

      // Enlace no válido - redirigir a home
      return new Response(null, {
        status: 302,
        headers: { 'Location': 'https://gruposantarita.com' }
      });
    }

    // API endpoints de link tracking (requieren auth)
    if (url.pathname === '/api/tracking' || url.pathname.startsWith('/api/tracking/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const tracking = createLinkTracking(env.SARA_CACHE);

      // GET /api/tracking - Resumen general
      if (request.method === 'GET' && url.pathname === '/api/tracking') {
        const summary = await tracking.getSummary();
        return corsResponse(JSON.stringify({
          success: true,
          summary
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/tracking/links - Listar todos los enlaces
      if (request.method === 'GET' && url.pathname === '/api/tracking/links') {
        const links = await tracking.getAllLinks();
        return corsResponse(JSON.stringify({
          success: true,
          count: links.length,
          links
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/tracking/links - Crear enlace rastreable
      if (request.method === 'POST' && url.pathname === '/api/tracking/links') {
        try {
          const body = await request.json() as any;

          if (!body.url) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "url"'
            }), 400, 'application/json', request);
          }

          const link = await tracking.createLink({
            url: body.url,
            leadId: body.leadId,
            leadPhone: body.leadPhone,
            campaignId: body.campaignId,
            campaignName: body.campaignName,
            tags: body.tags,
            expiresInDays: body.expiresInDays,
            metadata: body.metadata
          });

          return corsResponse(JSON.stringify({
            success: true,
            link,
            trackingUrl: tracking.getTrackingUrl(link.shortCode)
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/tracking/links/:id - Obtener enlace específico
      const linkMatch = url.pathname.match(/^\/api\/tracking\/links\/([^\/]+)$/);
      if (request.method === 'GET' && linkMatch) {
        const link = await tracking.getLink(linkMatch[1]);

        if (!link) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Enlace no encontrado'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          link,
          trackingUrl: tracking.getTrackingUrl(link.shortCode)
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/tracking/links/:id/stats - Estadísticas de un enlace
      const statsMatch = url.pathname.match(/^\/api\/tracking\/links\/([^\/]+)\/stats$/);
      if (request.method === 'GET' && statsMatch) {
        const stats = await tracking.getLinkStats(statsMatch[1]);

        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }

      // DELETE /api/tracking/links/:id - Eliminar enlace
      const deleteMatch = url.pathname.match(/^\/api\/tracking\/links\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        const deleted = await tracking.deleteLink(deleteMatch[1]);

        return corsResponse(JSON.stringify({
          success: deleted,
          message: deleted ? 'Enlace eliminado' : 'Enlace no encontrado'
        }), deleted ? 200 : 404, 'application/json', request);
      }

      // GET /api/tracking/lead/:leadId - Enlaces de un lead
      const leadMatch = url.pathname.match(/^\/api\/tracking\/lead\/([^\/]+)$/);
      if (request.method === 'GET' && leadMatch) {
        const links = await tracking.getLinksByLead(leadMatch[1]);

        return corsResponse(JSON.stringify({
          success: true,
          count: links.length,
          links
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/tracking/campaign/:campaignId - Estadísticas de campaña
      const campaignMatch = url.pathname.match(/^\/api\/tracking\/campaign\/([^\/]+)$/);
      if (request.method === 'GET' && campaignMatch) {
        const stats = await tracking.getCampaignStats(campaignMatch[1]);

        if (!stats) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Campaña no encontrada'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          campaign: stats
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SLA MONITORING - Monitoreo de tiempos de respuesta
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/sla' || url.pathname.startsWith('/api/sla/')) {
      // Auth removed - CRM accesses these endpoints via crmPublicPatterns
      const sla = createSLAMonitoring(env.SARA_CACHE);

      // GET /api/sla - Obtener configuración actual
      if (request.method === 'GET' && url.pathname === '/api/sla') {
        const config = await sla.getConfig();
        return corsResponse(JSON.stringify({
          success: true,
          config
        }, null, 2), 200, 'application/json', request);
      }

      // PUT /api/sla - Actualizar configuración
      if (request.method === 'PUT' && url.pathname === '/api/sla') {
        try {
          const rawBody = await request.json() as any;
          const ALLOWED_SLA_FIELDS = ['name', 'description', 'firstResponseTime', 'followUpTime', 'escalationTime', 'alertChannels', 'escalationContacts', 'applyDuringBusinessHours', 'businessHoursStart', 'businessHoursEnd', 'businessDays'];
          const body = Object.fromEntries(
            Object.entries(rawBody).filter(([k]) => ALLOWED_SLA_FIELDS.includes(k))
          );
          const updated = await sla.updateConfig(body);
          return corsResponse(JSON.stringify({
            success: true,
            config: updated
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/sla/pending - Ver respuestas pendientes
      if (request.method === 'GET' && url.pathname === '/api/sla/pending') {
        const result = await sla.checkPendingResponses();
        return corsResponse(JSON.stringify({
          success: true,
          pending: {
            warnings: result.warnings,
            breaches: result.breaches,
            escalations: result.escalations,
            total: result.warnings.length + result.breaches.length + result.escalations.length
          }
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/sla/violations - Ver violaciones
      if (request.method === 'GET' && url.pathname === '/api/sla/violations') {
        const vendorId = url.searchParams.get('vendorId') || undefined;
        const status = url.searchParams.get('status') as 'open' | 'resolved' | 'escalated' | undefined;
        const fromDate = url.searchParams.get('from') || undefined;
        const toDate = url.searchParams.get('to') || undefined;

        const violations = await sla.getViolations({ vendorId, status, fromDate, toDate });
        return corsResponse(JSON.stringify({
          success: true,
          count: violations.length,
          violations
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/sla/metrics - Métricas SLA
      if (request.method === 'GET' && url.pathname === '/api/sla/metrics') {
        const from = url.searchParams.get('from') || undefined;
        const to = url.searchParams.get('to') || undefined;
        const period = from && to ? { from, to } : undefined;

        const metrics = await sla.getMetrics(period);
        return corsResponse(JSON.stringify({
          success: true,
          metrics
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/sla/track - Registrar mensaje entrante (para testing)
      if (request.method === 'POST' && url.pathname === '/api/sla/track') {
        try {
          const body = await request.json() as any;

          if (!body.leadId || !body.vendorId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren leadId y vendorId'
            }), 400, 'application/json', request);
          }

          await sla.trackIncomingMessage({
            id: body.leadId,
            name: body.leadName || 'Lead',
            phone: body.leadPhone || '',
            vendorId: body.vendorId,
            vendorName: body.vendorName || 'Vendedor',
            vendorPhone: body.vendorPhone || '',
            isFirstMessage: body.isFirstMessage || false
          });

          return corsResponse(JSON.stringify({
            success: true,
            message: 'Tracking SLA iniciado'
          }), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/sla/resolve - Marcar respuesta del vendedor
      if (request.method === 'POST' && url.pathname === '/api/sla/resolve') {
        try {
          const body = await request.json() as any;

          if (!body.leadId || !body.vendorId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren leadId y vendorId'
            }), 400, 'application/json', request);
          }

          const result = await sla.trackVendorResponse(body.leadId, body.vendorId);

          if (!result) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'No hay tracking pendiente para este lead'
            }), 404, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            withinSLA: result.withinSLA,
            responseMinutes: result.responseMinutes,
            slaLimit: result.slaLimit
          }), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // AUTO-ASSIGNMENT - Motor de reglas para asignación de leads
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/assignment' || url.pathname.startsWith('/api/assignment/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const assignment = createAutoAssignment(env.SARA_CACHE);

      // GET /api/assignment/rules - Listar todas las reglas
      if (request.method === 'GET' && url.pathname === '/api/assignment/rules') {
        const rules = await assignment.getRules();
        return corsResponse(JSON.stringify({
          success: true,
          count: rules.length,
          rules
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/assignment/rules - Crear nueva regla
      if (request.method === 'POST' && url.pathname === '/api/assignment/rules') {
        try {
          const body = await request.json() as any;

          if (!body.name || !body.assignTo) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "name" y "assignTo"'
            }), 400, 'application/json', request);
          }

          const rule = await assignment.createRule({
            name: body.name,
            description: body.description,
            priority: body.priority || 100,
            conditions: body.conditions || [],
            conditionLogic: body.conditionLogic || 'AND',
            assignTo: body.assignTo,
            schedule: body.schedule,
            active: body.active !== false
          });

          return corsResponse(JSON.stringify({
            success: true,
            rule
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/assignment/rules/:id - Obtener regla específica
      const ruleMatch = url.pathname.match(/^\/api\/assignment\/rules\/([^\/]+)$/);
      if (request.method === 'GET' && ruleMatch) {
        const rule = await assignment.getRule(ruleMatch[1]);

        if (!rule) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Regla no encontrada'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          rule
        }, null, 2), 200, 'application/json', request);
      }

      // PUT /api/assignment/rules/:id - Actualizar regla
      const updateRuleMatch = url.pathname.match(/^\/api\/assignment\/rules\/([^\/]+)$/);
      if (request.method === 'PUT' && updateRuleMatch) {
        try {
          const rawBody = await request.json() as any;
          const ALLOWED_RULE_FIELDS = ['name', 'description', 'priority', 'conditions', 'conditionLogic', 'assignTo', 'schedule', 'active'];
          const body = Object.fromEntries(
            Object.entries(rawBody).filter(([k]) => ALLOWED_RULE_FIELDS.includes(k))
          );
          const updated = await assignment.updateRule(updateRuleMatch[1], body);

          if (!updated) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Regla no encontrada'
            }), 404, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            rule: updated
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // DELETE /api/assignment/rules/:id - Eliminar regla
      const deleteRuleMatch = url.pathname.match(/^\/api\/assignment\/rules\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteRuleMatch) {
        const deleted = await assignment.deleteRule(deleteRuleMatch[1]);

        return corsResponse(JSON.stringify({
          success: deleted,
          message: deleted ? 'Regla eliminada' : 'Regla no encontrada'
        }), deleted ? 200 : 404, 'application/json', request);
      }

      // POST /api/assignment/assign - Asignar lead usando reglas
      if (request.method === 'POST' && url.pathname === '/api/assignment/assign') {
        try {
          const body = await request.json() as any;

          if (!body.lead || !body.vendors) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "lead" y "vendors"'
            }), 400, 'application/json', request);
          }

          const result = await assignment.assignLead(body.lead, body.vendors);

          return corsResponse(JSON.stringify({
            success: result.success,
            assignment: result
          }, null, 2), result.success ? 200 : 400, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/assignment/stats - Estadísticas de uso
      if (request.method === 'GET' && url.pathname === '/api/assignment/stats') {
        const stats = await assignment.getStats();
        return corsResponse(JSON.stringify({
          success: true,
          stats
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // LEAD ATTRIBUTION - Rastreo de origen de leads (UTM)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/attribution' || url.pathname.startsWith('/api/attribution/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const attribution = createLeadAttribution(env.SARA_CACHE);

      // GET /api/attribution - Resumen de atribución
      if (request.method === 'GET' && url.pathname === '/api/attribution') {
        const from = url.searchParams.get('from') || undefined;
        const to = url.searchParams.get('to') || undefined;
        const period = from && to ? { from, to } : undefined;

        const summary = await attribution.getSummary(period);
        return corsResponse(JSON.stringify({
          success: true,
          summary
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/attribution/track - Registrar atribución de lead
      if (request.method === 'POST' && url.pathname === '/api/attribution/track') {
        try {
          const body = await request.json() as any;

          if (!body.leadId || !body.leadPhone) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "leadId" y "leadPhone"'
            }), 400, 'application/json', request);
          }

          const result = await attribution.trackLead(
            body.leadId,
            body.leadPhone,
            {
              utm_source: body.utm_source,
              utm_medium: body.utm_medium,
              utm_campaign: body.utm_campaign,
              utm_term: body.utm_term,
              utm_content: body.utm_content,
              referrer: body.referrer,
              landing_page: body.landing_page
            },
            body.leadName
          );

          return corsResponse(JSON.stringify({
            success: true,
            attribution: result
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/attribution/conversion - Registrar conversión
      if (request.method === 'POST' && url.pathname === '/api/attribution/conversion') {
        try {
          const body = await request.json() as any;

          if (!body.leadId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "leadId"'
            }), 400, 'application/json', request);
          }

          const result = await attribution.trackConversion(body.leadId, body.value);

          if (!result) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Lead no encontrado en atribución'
            }), 404, 'application/json', request);
          }

          return corsResponse(JSON.stringify({
            success: true,
            attribution: result
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/attribution/lead/:id - Obtener atribución de un lead
      const leadMatch = url.pathname.match(/^\/api\/attribution\/lead\/([^\/]+)$/);
      if (request.method === 'GET' && leadMatch) {
        const result = await attribution.getLeadAttribution(leadMatch[1]);

        if (!result) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Atribución no encontrada'
          }), 404, 'application/json', request);
        }

        return corsResponse(JSON.stringify({
          success: true,
          attribution: result
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/attribution/spend - Registrar gasto en publicidad
      if (request.method === 'POST' && url.pathname === '/api/attribution/spend') {
        try {
          const body = await request.json() as any;

          if (!body.source || !body.date || body.amount === undefined) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "source", "date" y "amount"'
            }), 400, 'application/json', request);
          }

          const result = await attribution.recordAdSpend({
            source: body.source,
            campaign: body.campaign,
            date: body.date,
            amount: body.amount,
            currency: body.currency || 'MXN'
          });

          return corsResponse(JSON.stringify({
            success: true,
            spend: result
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/attribution/spend - Obtener gastos
      if (request.method === 'GET' && url.pathname === '/api/attribution/spend') {
        const source = url.searchParams.get('source') || undefined;
        const campaign = url.searchParams.get('campaign') || undefined;
        const from = url.searchParams.get('from') || undefined;
        const to = url.searchParams.get('to') || undefined;

        const spend = await attribution.getAdSpend({
          source,
          campaign,
          fromDate: from,
          toDate: to
        });

        const total = spend.reduce((sum, s) => sum + s.amount, 0);

        return corsResponse(JSON.stringify({
          success: true,
          count: spend.length,
          total,
          spend
        }, null, 2), 200, 'application/json', request);
      }

      // GET /api/attribution/best-channel - Mejor canal de conversión
      if (request.method === 'GET' && url.pathname === '/api/attribution/best-channel') {
        const best = await attribution.getBestPerformingChannel();

        return corsResponse(JSON.stringify({
          success: true,
          bestChannel: best
        }, null, 2), 200, 'application/json', request);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // OUTGOING WEBHOOKS - Gestión de webhooks salientes
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/webhooks' || url.pathname.startsWith('/api/webhooks/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const webhooks = createOutgoingWebhooks(env.SARA_CACHE);

      // GET /api/webhooks - Listar todos
      if (request.method === 'GET' && url.pathname === '/api/webhooks') {
        const list = await webhooks.getWebhooks();
        return corsResponse(JSON.stringify({
          success: true,
          webhooks: list
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks - Crear nuevo
      if (request.method === 'POST' && url.pathname === '/api/webhooks') {
        try {
          const body = await request.json() as any;
          const created = await webhooks.createWebhook({
            name: body.name,
            url: body.url,
            events: body.events || [],
            secret: body.secret,
            active: body.active !== false,
            headers: body.headers
          });
          return corsResponse(JSON.stringify({
            success: true,
            webhook: created
          }, null, 2), 201, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // GET /api/webhooks/failed - Ver entregas fallidas
      if (request.method === 'GET' && url.pathname === '/api/webhooks/failed') {
        const failed = await webhooks.getFailedDeliveries();
        return corsResponse(JSON.stringify({
          success: true,
          count: failed.length,
          deliveries: failed
        }, null, 2), 200, 'application/json', request);
      }

      // POST /api/webhooks/test - Probar un webhook
      if (request.method === 'POST' && url.pathname === '/api/webhooks/test') {
        const webhookId = url.searchParams.get('id');
        if (!webhookId) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Falta parámetro id'
          }), 400, 'application/json', request);
        }

        const webhook = await webhooks.getWebhook(webhookId);
        if (!webhook) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'Webhook no encontrado'
          }), 404, 'application/json', request);
        }

        // Enviar evento de prueba
        await webhooks.trigger('lead.created', {
          test: true,
          message: 'Este es un evento de prueba desde SARA',
          timestamp: new Date().toISOString()
        });

        return corsResponse(JSON.stringify({
          success: true,
          message: 'Evento de prueba enviado'
        }), 200, 'application/json', request);
      }

      // DELETE /api/webhooks/:id - Eliminar
      const deleteMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        const deleted = await webhooks.deleteWebhook(deleteMatch[1]);
        return corsResponse(JSON.stringify({
          success: deleted,
          message: deleted ? 'Webhook eliminado' : 'Webhook no encontrado'
        }), deleted ? 200 : 404, 'application/json', request);
      }

      // PUT /api/webhooks/:id - Actualizar
      const updateMatch = url.pathname.match(/^\/api\/webhooks\/([^\/]+)$/);
      if (request.method === 'PUT' && updateMatch) {
        try {
          const rawBody = await request.json() as any;
          const ALLOWED_OUTGOING_WEBHOOK_FIELDS = ['name', 'url', 'events', 'secret', 'active', 'headers'];
          const body = Object.fromEntries(
            Object.entries(rawBody).filter(([k]) => ALLOWED_OUTGOING_WEBHOOK_FIELDS.includes(k))
          );
          const updated = await webhooks.updateWebhook(updateMatch[1], body);
          return corsResponse(JSON.stringify({
            success: !!updated,
            webhook: updated
          }), updated ? 200 : 404, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Referrals
    // ═══════════════════════════════════════════════════════════

    if (url.pathname === '/api/referrals' && request.method === 'GET') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const days = parseInt(url.searchParams.get('days') || '90');
      const refService = new ReferralService(supabase);
      const stats = await refService.getReferralStats(days);
      const records = await refService.getReferralRecords(days);

      return corsResponse(JSON.stringify({
        success: true,
        stats,
        records
      }), 200, 'application/json', request);
    }

    if (url.pathname === '/api/referrals/stats' && request.method === 'GET') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const days = parseInt(url.searchParams.get('days') || '90');
      const refService = new ReferralService(supabase);
      const stats = await refService.getReferralStats(days);

      return corsResponse(JSON.stringify({
        success: true,
        stats
      }), 200, 'application/json', request);
    }

  return null;
}
