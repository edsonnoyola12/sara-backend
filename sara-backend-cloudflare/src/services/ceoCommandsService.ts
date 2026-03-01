import { SupabaseService } from './supabase';
import { PipelineService, formatPipelineForWhatsApp } from './pipelineService';
import { FinancingCalculatorService } from './financingCalculatorService';
import { PropertyComparatorService } from './propertyComparatorService';
import { CloseProbabilityService } from './closeProbabilityService';
import { VisitManagementService } from './visitManagementService';
import { OfferTrackingService } from './offerTrackingService';
import { SmartAlertsService } from './smartAlertsService';
import { MarketIntelligenceService } from './marketIntelligenceService';
import { CustomerValueService } from './customerValueService';
import { PDFReportService } from './pdfReportService';
import { getLastHealthCheck, getLastAIResponses } from '../crons/healthCheck';
import { getBackupLog } from '../crons/dashboard';
import { getObservabilityDashboard, formatObservabilityForWhatsApp } from './observabilityService';
import { DevelopmentFunnelService } from './developmentFunnelService';
import { ReferralService } from './referralService';

export interface CEOCommandResult {
  handled: boolean;
  response?: string;
  action?: string;
  data?: any;
  metadata?: any;
}

export class CEOCommandsService {
  constructor(private supabase: SupabaseService) {}

  detectCommand(mensaje: string, _body?: string, nombreCEO?: string): { action: string; message?: string; handlerName?: string; handlerParams?: any } {
    const msgLower = mensaje.toLowerCase().trim();

    // ═══ AYUDA ═══
    if (msgLower === 'ayuda' || msgLower === 'help' || msgLower === '?') {
      return {
        action: 'send_message',
        message: `📋 *COMANDOS CEO - ${nombreCEO || 'Jefe'}*\n\n` +
          `*📊 REPORTES*\n` +
          `• *reporte/semanal/mensual*\n` +
          `• *equipo* - Equipo activo\n` +
          `• *conexiones* - Actividad hoy\n` +
          `• *leads* / *ventas* / *pipeline*\n\n` +
          `*📈 ANÁLISIS*\n` +
          `• *llamadas* - Dashboard llamadas IA\n` +
          `• *probabilidad* - Cierre\n` +
          `• *visitas* / *alertas* / *mercado*\n` +
          `• *clv* - Valor cliente\n` +
          `• *programa referidos* - Referral program\n\n` +
          `*💰 OFERTAS*\n` +
          `• *cotizar [lead] [precio]*\n` +
          `• *enviar oferta [lead]*\n` +
          `• *ofertas* - Tracking\n\n` +
          `*📅 CITAS*\n` +
          `• *citas* / *citas semana*\n` +
          `• *agendar cita [lead] [fecha]*\n\n` +
          `*🔄 GESTIÓN LEADS*\n` +
          `• *adelante/atrás [lead]*\n` +
          `• *nota [lead]: [texto]*\n` +
          `• *nuevo lead [nombre] [tel]*\n` +
          `• *crédito [lead]* - A asesor\n\n` +
          `*💬 COMUNICACIÓN*\n` +
          `• *bridge [lead]* - Chat directo\n` +
          `• *#cerrar* / *#mas*\n` +
          `• *llamar [lead]* - Teléfono\n\n` +
          `*📡 BROADCASTS*\n` +
          `• *broadcast* / *segmentos*\n\n` +
          `*🏠 RECURSOS*\n` +
          `• *brochure/ubicación/video [dev]*\n` +
          `• *calcular [precio]* / *bancos*\n` +
          `• *comparar [A] vs [B]*\n\n` +
          `*🎯 EVENTOS*\n` +
          `• *eventos* / *crear evento*\n\n` +
          `¿En qué te puedo ayudar? 🏠`
      };
    }

    // ═══ CITAS HOY ═══
    if (msgLower === 'citas' || msgLower === 'citas hoy' || msgLower === 'mis citas' || msgLower === 'mis citas hoy' || msgLower === 'ver citas') {
      return { action: 'call_handler', handlerName: 'vendedorCitasHoy' };
    }

    // ═══ CITAS MAÑANA ═══
    if (msgLower === 'citas mañana' || msgLower === 'mis citas mañana' || msgLower === 'citas manana' || msgLower === 'mis citas manana') {
      return { action: 'call_handler', handlerName: 'vendedorCitasManana' };
    }

    // ═══ REPORTES ESPECÍFICOS (antes del genérico startsWith) ═══
    if (msgLower === 'reporte semanal' || msgLower === 'reporte semana' ||
        msgLower === 'weekly report') {
      return { action: 'call_handler', handlerName: 'reporteSemanal' };
    }
    if (msgLower === 'reporte mensual' || msgLower === 'reporte mes' ||
        msgLower === 'monthly report') {
      return { action: 'call_handler', handlerName: 'reporteMensual' };
    }

    // ═══ REPORTE GENÉRICO ═══
    if (msgLower.startsWith('reporte') || msgLower.startsWith('report') || msgLower === 'stats') {
      return { action: 'call_handler', handlerName: 'generarReporte', handlerParams: { tipo: msgLower.replace(/^reporte\s*|^report\s*/, '') } };
    }

    // ═══ EQUIPO ═══
    if (msgLower === 'equipo' || msgLower === 'team' || msgLower === 'vendedores') {
      return { action: 'call_handler', handlerName: 'reporteEquipo' };
    }

    // ═══ LEADS ═══
    if (msgLower === 'leads' || msgLower === 'clientes') {
      return { action: 'call_handler', handlerName: 'reporteLeads' };
    }

    // ═══ MIS LEADS (resumen del vendedor/CEO) ═══
    if (msgLower === 'mis leads' || msgLower === 'mis clientes' || msgLower === 'mi cartera') {
      return { action: 'call_handler', handlerName: 'vendedorResumenLeads' };
    }

    // ═══ HOT - Leads calientes ═══
    if (msgLower === 'hot' || msgLower === 'calientes' || msgLower === 'leads hot' || msgLower === 'leads calientes') {
      return { action: 'call_handler', handlerName: 'vendedorLeadsHot' };
    }

    // ═══ NOTA - Agregar nota a lead ═══
    // Formato: "nota Juan llamé y no contestó" o "nota 4921234567 interesado en Encinos"
    const matchNota = mensaje.match(/^nota\s+([a-záéíóúñü\d]+):?\s+(.+)$/i);
    if (matchNota) {
      return {
        action: 'call_handler',
        handlerName: 'vendedorAgregarNota',
        handlerParams: { nombreLead: matchNota[1].trim(), nota: matchNota[2].trim() }
      };
    }

    // ═══ VER NOTAS de un lead ═══
    const matchVerNotas = msgLower.match(/^(?:notas|ver notas|notas de)\s+(.+)$/i);
    if (matchVerNotas) {
      return { action: 'call_handler', handlerName: 'vendedorVerNotas', handlerParams: { nombreLead: matchVerNotas[1].trim() } };
    }

    // ═══ COACHING - Tips de ventas ═══
    if (msgLower === 'coaching' || msgLower === 'tips' || msgLower === 'tip' || msgLower === 'consejo') {
      return { action: 'call_handler', handlerName: 'vendedorCoaching' };
    }

    // ═══ VENTAS ═══
    if (msgLower.startsWith('ventas') || msgLower.startsWith('sales')) {
      return { action: 'call_handler', handlerName: 'reporteVentas' };
    }

    // ═══ PIPELINE ═══
    if (msgLower === 'pipeline' || msgLower === 'funnel' || msgLower === 'embudo') {
      return { action: 'call_handler', handlerName: 'reportePipeline' };
    }

    // ═══ CALCULADORA DE FINANCIAMIENTO ═══
    // Matches: "calcular 2.5m", "financiamiento 3 millones", "credito hipotecario"
    const financingMatch = msgLower.match(/^(?:calcular|financiamiento|credito|crédito|hipoteca)\s*(.*)$/);
    if (financingMatch || msgLower === 'bancos' || msgLower === 'tasas') {
      const amount = financingMatch?.[1]?.trim() || '';
      return {
        action: 'call_handler',
        handlerName: 'calculadoraFinanciamiento',
        handlerParams: { amount }
      };
    }

    // ═══ COMPARADOR DE PROPIEDADES ═══
    // Matches: "comparar monte verde vs distrito falco", "vs miravalle encinos"
    // Excludes: "comparar desarrollos", "comparativo" → those go to developmentComparison
    const compareMatch = msgLower.match(/^(?:comparar|compara|vs)\s+(.+)$/);
    const isDevelopmentComparison = msgLower === 'comparar' || msgLower === 'comparar desarrollos' || msgLower === 'comparativo' || msgLower === 'desarrollos';
    if ((compareMatch || msgLower.includes(' vs ')) && !isDevelopmentComparison) {
      const query = compareMatch?.[1] || msgLower;
      return {
        action: 'call_handler',
        handlerName: 'compararPropiedades',
        handlerParams: { query }
      };
    }

    // ═══ PROBABILIDAD DE CIERRE ═══
    if (msgLower === 'probabilidad' || msgLower === 'probabilidades' ||
        msgLower === 'prob cierre' || msgLower === 'pronostico' || msgLower === 'pronóstico') {
      return { action: 'call_handler', handlerName: 'probabilidadCierre' };
    }

    // ═══ GESTIÓN DE VISITAS ═══
    if (msgLower === 'visitas' || msgLower === 'visitas hoy' ||
        msgLower === 'recorridos' || msgLower === 'gestion visitas' || msgLower === 'gestión visitas') {
      return { action: 'call_handler', handlerName: 'gestionVisitas' };
    }

    // ═══ TRACKING DE OFERTAS ═══
    if (msgLower === 'ofertas' || msgLower === 'cotizaciones' ||
        msgLower === 'negociaciones' || msgLower === 'apartados') {
      return { action: 'call_handler', handlerName: 'trackingOfertas' };
    }

    // ═══ ALERTAS INTELIGENTES ═══
    if (msgLower === 'alertas' || msgLower === 'warnings' ||
        msgLower === 'riesgos' || msgLower === 'pendientes urgentes') {
      return { action: 'call_handler', handlerName: 'alertasInteligentes' };
    }

    // ═══ INTELIGENCIA DE MERCADO ═══
    if (msgLower === 'mercado' || msgLower === 'inteligencia' ||
        msgLower === 'competencia' || msgLower === 'tendencias' ||
        msgLower === 'analisis mercado' || msgLower === 'análisis mercado') {
      return { action: 'call_handler', handlerName: 'inteligenciaMercado' };
    }

    // ═══ VALOR DEL CLIENTE (CLV) ═══
    // Note: 'programa referidos' routes to referralProgram handler, NOT here
    if (msgLower === 'clv' || msgLower === 'valor cliente' ||
        msgLower === 'referidos' ||
        msgLower === 'clientes vip' || msgLower === 'top clientes') {
      return { action: 'call_handler', handlerName: 'valorCliente' };
    }

    // ═══ BACKUPS ═══
    if (msgLower === 'backups' || msgLower === 'backup' || msgLower === 'respaldos') {
      return { action: 'call_handler', handlerName: 'verBackups' };
    }

    // ═══ HOY (resumen del día) ═══
    if (msgLower === 'hoy' || msgLower === 'resumen') {
      return { action: 'call_handler', handlerName: 'resumenHoy' };
    }

    // ═══ CONEXIONES DEL EQUIPO ═══
    if (msgLower === 'conexiones' || msgLower === 'quien se conecto' || msgLower === 'quien se conectó' ||
        msgLower === 'quién se conectó' || msgLower === 'conectados' || msgLower === 'actividad equipo') {
      return { action: 'call_handler', handlerName: 'reporteConexiones' };
    }

    // ═══ META ═══
    if (msgLower === 'meta' || msgLower === 'objetivo') {
      return { action: 'call_handler', handlerName: 'verMeta' };
    }

    // ═══ PENDIENTES ═══
    if (msgLower === 'pendientes' || msgLower === 'pending') {
      return { action: 'call_handler', handlerName: 'verPendientes' };
    }

    // ═══ NUEVO LEAD ═══
    // Formato: "nuevo lead Juan Pérez 5551234567 Los Encinos"
    // Regex usa lookahead para separar nombre de teléfono cuando hay nombres con espacios
    const matchNuevoLead = msgLower.match(/^(?:nuevo\s+lead|agregar\s+lead|crear\s+lead)\s+(.+?)\s+(\d{10,15})(?:\s+(.+))?$/i);
    if (matchNuevoLead) {
      return {
        action: 'call_handler',
        handlerName: 'ceoNuevoLead',
        handlerParams: {
          nombre: matchNuevoLead[1].trim(),
          telefono: matchNuevoLead[2].trim(),
          desarrollo: matchNuevoLead[3]?.trim() || null
        }
      };
    }

    // ═══ BROADCAST ═══
    if (msgLower.startsWith('broadcast') || msgLower.startsWith('enviar')) {
      return { action: 'call_handler', handlerName: 'iniciarBroadcast' };
    }

    // ═══ SEGMENTOS ═══
    if (msgLower === 'segmentos' || msgLower === 'segments') {
      return { action: 'call_handler', handlerName: 'verSegmentos' };
    }

    // ═══ EVENTOS ═══
    if (msgLower === 'eventos' || msgLower === 'events') {
      return { action: 'call_handler', handlerName: 'verEventos' };
    }

    // ═══ MENSAJE A LEAD (Sara intermediario) ═══
    const mensajeMatch = msgLower.match(/^mensaje\s+(.+)$/i);
    if (mensajeMatch) {
      const nombreLead = mensajeMatch[1].trim();
      return { action: 'call_handler', handlerName: 'mensajeLead', handlerParams: { nombreLead } };
    }

    // ═══ BRIDGE / CHAT DIRECTO ═══
    // Formato: bridge [nombre] "mensaje opcional"
    const bridgeMatchConMensaje = msgLower.match(/^(?:bridge|chat\s*directo|directo)\s+(\w+)\s+[""""](.+)[""""]$/i);
    if (bridgeMatchConMensaje) {
      const nombreLead = bridgeMatchConMensaje[1].trim();
      const mensajeInicial = bridgeMatchConMensaje[2].trim();
      return { action: 'call_handler', handlerName: 'bridgeLead', handlerParams: { nombreLead, mensajeInicial } };
    }

    const bridgeMatch = msgLower.match(/^(?:bridge|chat\s*directo|directo)\s+(.+)$/i);
    if (bridgeMatch) {
      const nombreLead = bridgeMatch[1].trim();
      return { action: 'call_handler', handlerName: 'bridgeLead', handlerParams: { nombreLead } };
    }

    // ═══ EXTENDER BRIDGE ═══
    if (msgLower === '#mas' || msgLower === '#más' || msgLower === '#continuar') {
      return { action: 'call_handler', handlerName: 'extenderBridge' };
    }

    // ═══ CERRAR BRIDGE ═══
    // Solo con # para no confundir con conversación normal ("vamos a cerrar el trato")
    if (msgLower === '#cerrar' || msgLower === '#fin') {
      return { action: 'call_handler', handlerName: 'cerrarBridge' };
    }

    // ═══ MI ACTIVIDAD / BITÁCORA ═══
    if (msgLower === 'actividad' || msgLower === 'mi actividad' || msgLower === 'bitacora' || msgLower === 'bitácora') {
      return { action: 'call_handler', handlerName: 'verActividad' };
    }

    // ═══ MOVER LEAD EN FUNNEL (adelante/atrás) ═══
    // Formato: "adelante [nombre]" o "[nombre] adelante"
    let matchMover = msgLower.match(/^(?:adelante|avanzar|siguiente|proximo|próximo)\s+(.+)$/i);
    if (matchMover) {
      return { action: 'call_handler', handlerName: 'ceoMoverLead', handlerParams: { nombreLead: matchMover[1].trim(), direccion: 'next' } };
    }
    matchMover = msgLower.match(/^(.+?)\s+(?:adelante|al\s+siguiente|avanzar)$/i);
    if (matchMover) {
      return { action: 'call_handler', handlerName: 'ceoMoverLead', handlerParams: { nombreLead: matchMover[1].trim(), direccion: 'next' } };
    }
    matchMover = msgLower.match(/^(?:atras|atrás|regresar|anterior)\s+(.+)$/i);
    if (matchMover) {
      return { action: 'call_handler', handlerName: 'ceoMoverLead', handlerParams: { nombreLead: matchMover[1].trim(), direccion: 'prev' } };
    }
    matchMover = msgLower.match(/^(.+?)\s+(?:atras|atrás|al\s+anterior|regresar)$/i);
    if (matchMover) {
      return { action: 'call_handler', handlerName: 'ceoMoverLead', handlerParams: { nombreLead: matchMover[1].trim(), direccion: 'prev' } };
    }

    // ═══ QUIEN ES [nombre] - Buscar lead ═══
    const matchQuienEs = msgLower.match(/^(?:quien\s+es|quién\s+es|buscar|info\s+de?)\s+(.+)$/i);
    if (matchQuienEs) {
      return { action: 'call_handler', handlerName: 'ceoQuienEs', handlerParams: { nombreLead: matchQuienEs[1].trim() } };
    }

    // ═══ BROCHURE [desarrollo] ═══
    const matchBrochure = msgLower.match(/^(?:brochure|brouchure|folleto|catalogo|catálogo)\s+(.+)$/i);
    if (matchBrochure) {
      return { action: 'call_handler', handlerName: 'ceoBrochure', handlerParams: { desarrollo: matchBrochure[1].trim() } };
    }

    // ═══ UBICACION [desarrollo] ═══
    const matchUbicacion = msgLower.match(/^(?:ubicacion|ubicación|donde\s+(?:queda|esta|está)|gps|mapa)\s+(.+)$/i);
    if (matchUbicacion) {
      return { action: 'call_handler', handlerName: 'ceoUbicacion', handlerParams: { desarrollo: matchUbicacion[1].trim() } };
    }

    // ═══ VER/HISTORIAL LEAD (por teléfono o nombre) ═══
    // IMPORTANTE: Debe ir ANTES de video para que "ver 5214921052522" se detecte como lead, no video
    const matchVerLead = msgLower.match(/^(?:ver|historial|chat|conversacion|conversación)\s+(.+)$/i);
    if (matchVerLead) {
      const identificador = matchVerLead[1].trim();
      // Si parece teléfono (tiene 10+ dígitos) o es un nombre corto (no desarrollo)
      const soloDigitos = identificador.replace(/\D/g, '');
      const esDesarrolloConocido = ['monte verde', 'monte real', 'los encinos', 'miravalle', 'distrito falco', 'andes'].some(d => identificador.toLowerCase().includes(d));

      if (soloDigitos.length >= 10 || (!esDesarrolloConocido && !identificador.includes(' '))) {
        // Es teléfono o nombre de lead - redirigir a handler de historial
        return { action: 'call_handler', handlerName: 'ceoVerLead', handlerParams: { identificador } };
      }
    }

    // ═══ VIDEO [desarrollo] ═══
    const matchVideo = msgLower.match(/^(?:video|tour)\s+(.+)$/i);
    if (matchVideo) {
      return { action: 'call_handler', handlerName: 'ceoVideo', handlerParams: { desarrollo: matchVideo[1].trim() } };
    }

    // ═══ FUNNEL DE DESARROLLO ═══
    const matchFunnel = msgLower.match(/^(?:funnel|embudo|conversión|conversion)\s+(.+)$/i);
    if (matchFunnel) {
      return { action: 'call_handler', handlerName: 'developmentFunnel', handlerParams: { desarrollo: matchFunnel[1].trim() } };
    }

    // ═══ COMPARAR DESARROLLOS ═══
    if (msgLower === 'comparar' || msgLower === 'comparar desarrollos' || msgLower === 'comparativo' || msgLower === 'desarrollos') {
      return { action: 'call_handler', handlerName: 'developmentComparison' };
    }

    // ═══ PROGRAMA REFERIDOS ═══
    if (msgLower === 'programa referidos' || msgLower === 'referidos programa' || msgLower === 'programa de referidos' || msgLower === 'referral' || msgLower === 'referrals') {
      return { action: 'call_handler', handlerName: 'referralProgram' };
    }

    // ═══ STATUS DEL SISTEMA ═══
    if (msgLower === 'status' || msgLower === 'estado' || msgLower === 'salud' || msgLower === 'health') {
      return { action: 'call_handler', handlerName: 'healthStatus' };
    }

    // ═══ ÚLTIMAS RESPUESTAS DE IA ═══
    if (msgLower === 'respuestas' || msgLower === 'respuestas ia' || msgLower === 'respuestas ai' || msgLower === 'ai log' || msgLower === 'log ia') {
      return { action: 'call_handler', handlerName: 'ultimasRespuestasAI' };
    }

    // ═══ DASHBOARD LLAMADAS IA ═══
    if (msgLower === 'llamadas' || msgLower === 'llamadas ia' || msgLower === 'calls' || msgLower === 'llamadas ai') {
      return { action: 'call_handler', handlerName: 'reporteLlamadas' };
    }

    // ═══ OBSERVABILIDAD ═══
    if (msgLower === 'observabilidad' || msgLower === 'observability' || msgLower === 'obs' || msgLower === 'crons' || msgLower === 'metricas') {
      return { action: 'call_handler', handlerName: 'observabilidad' };
    }

    // ═══ HANDOFFS (leads con IA desactivada) ═══
    if (msgLower === 'handoffs' || msgLower === 'handoff' || msgLower === 'humanos' || msgLower === 'sin ia' || msgLower === 'sin bot') {
      return { action: 'call_handler', handlerName: 'handoffs' };
    }

    // ═══ NO RECONOCIDO ═══
    return {
      action: 'not_recognized',
      message: `No entendí "${mensaje}".\n\nEscribe *ayuda* para ver los comandos disponibles.`
    };
  }

  async processCommand(
    comando: string,
    args: string,
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    try {
      switch (comando.toLowerCase()) {
        case 'reporte':
        case 'report':
        case 'stats':
        case 'estadisticas':
          return await this.generarReporte(args, ceoPhone, sendMessage);

        case 'ventas':
        case 'sales':
          return await this.reporteVentas(args, ceoPhone, sendMessage);

        case 'equipo':
        case 'team':
          return await this.reporteEquipo(ceoPhone, sendMessage);

        default:
          return { handled: false };
      }
    } catch (e: any) {
      console.error('Error procesando comando CEO:', e);
      return { handled: false, response: `Error: ${e.message}` };
    }
  }

  private async generarReporte(
    tipo: string,
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    // Reporte general
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, status, funnel_status, created_at')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const totalLeads = leads?.length || 0;
    const nuevos = leads?.filter(l => l.funnel_status === 'new').length || 0;
    const contactados = leads?.filter(l => l.funnel_status === 'contacted').length || 0;
    const citados = leads?.filter(l => l.funnel_status === 'scheduled').length || 0;

    const mensaje = `📊 *Reporte Semanal*\n\n` +
      `Total leads: ${totalLeads}\n` +
      `• Nuevos: ${nuevos}\n` +
      `• Contactados: ${contactados}\n` +
      `• Con cita: ${citados}`;

    await sendMessage(ceoPhone, mensaje);
    return { handled: true, action: 'reporte_enviado' };
  }

  private async reporteVentas(
    periodo: string,
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    try {
      const ahora = new Date();
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const inicioMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const finMesPasado = new Date(ahora.getFullYear(), ahora.getMonth(), 0);

      // Ventas este mes
      const { data: ventasMes, count: countMes } = await this.supabase.client
        .from('leads')
        .select('id, name, assigned_to, updated_at', { count: 'exact' })
        .eq('status', 'sold')
        .gte('updated_at', inicioMes.toISOString());

      // Ventas mes pasado
      const { count: countMesPasado } = await this.supabase.client
        .from('leads')
        .select('id', { count: 'exact' })
        .eq('status', 'sold')
        .gte('updated_at', inicioMesPasado.toISOString())
        .lte('updated_at', finMesPasado.toISOString());

      // Total leads este mes (para conversión)
      const { count: totalLeadsMes } = await this.supabase.client
        .from('leads')
        .select('id', { count: 'exact' })
        .gte('created_at', inicioMes.toISOString());

      // Ventas por vendedor
      const { data: vendedores } = await this.supabase.client
        .from('team_members')
        .select('id, name')
        .eq('active', true)
        .eq('role', 'vendedor');

      // Contar ventas por vendedor
      const ventasPorVendedor: { nombre: string; ventas: number }[] = [];
      for (const v of vendedores || []) {
        const count = (ventasMes || []).filter((l: any) => l.assigned_to === v.id).length;
        if (count > 0) {
          ventasPorVendedor.push({ nombre: v.name, ventas: count });
        }
      }
      ventasPorVendedor.sort((a, b) => b.ventas - a.ventas);

      // Calcular métricas
      const ventasActual = countMes || 0;
      const ventasPasado = countMesPasado || 0;
      const diferencia = ventasActual - ventasPasado;
      const porcentajeCambio = ventasPasado > 0 ? Math.round((diferencia / ventasPasado) * 100) : 0;
      const conversion = totalLeadsMes && totalLeadsMes > 0
        ? Math.round((ventasActual / totalLeadsMes) * 100)
        : 0;

      // Emoji de tendencia
      const tendencia = diferencia > 0 ? '📈' : diferencia < 0 ? '📉' : '➡️';
      const signo = diferencia > 0 ? '+' : '';

      // Construir mensaje
      let mensaje = `📊 *REPORTE DE VENTAS*\n\n`;
      mensaje += `*Este mes:* ${ventasActual} ventas ${tendencia}\n`;
      mensaje += `*Mes pasado:* ${ventasPasado} ventas\n`;
      mensaje += `*Cambio:* ${signo}${diferencia} (${signo}${porcentajeCambio}%)\n\n`;
      mensaje += `📈 *Conversión:* ${conversion}% (${ventasActual}/${totalLeadsMes || 0} leads)\n\n`;

      if (ventasPorVendedor.length > 0) {
        mensaje += `🏆 *Top Vendedores:*\n`;
        ventasPorVendedor.slice(0, 5).forEach((v, i) => {
          const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
          mensaje += `${medalla} ${v.nombre}: ${v.ventas}\n`;
        });
      } else {
        mensaje += `_Sin ventas registradas este mes_`;
      }

      await sendMessage(ceoPhone, mensaje);
      return { handled: true, action: 'reporte_ventas' };
    } catch (e: any) {
      console.error('Error en reporteVentas:', e);
      await sendMessage(ceoPhone, `❌ Error al obtener reporte de ventas.`);
      return { handled: true, action: 'reporte_ventas_error' };
    }
  }

  private async reporteEquipo(
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    // Get team members
    const { data: team } = await this.supabase.client
      .from('team_members')
      .select('id, name, role, is_active')
      .eq('is_active', true)
      .order('name');

    if (!team || team.length === 0) {
      await sendMessage(ceoPhone, '👥 No hay miembros activos en el equipo.');
      return { handled: true, action: 'reporte_equipo' };
    }

    // Get vendedores only for metrics
    const vendedores = team.filter((m: any) => m.role === 'vendedor');
    const vendedorIds = vendedores.map((v: any) => v.id);

    // Parallel queries for metrics
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];

    const [leadsRes, citasRes, cerradosRes] = await Promise.all([
      this.supabase.client.from('leads').select('id, assigned_to').in('assigned_to', vendedorIds).not('status', 'in', '("lost","inactive","fallen")'),
      this.supabase.client.from('appointments').select('id, team_member_id, scheduled_date').in('team_member_id', vendedorIds).gte('scheduled_date', primerDiaMes).lte('scheduled_date', hoyStr),
      this.supabase.client.from('leads').select('id, assigned_to').in('assigned_to', vendedorIds).in('status', ['closed', 'reserved', 'delivered'])
    ]);

    const leads = leadsRes.data || [];
    const citas = citasRes.data || [];
    const cerrados = cerradosRes.data || [];

    // Build scorecard
    const medalEmojis = ['🥇', '🥈', '🥉'];
    const scorecards = vendedores.map((v: any) => {
      const vLeads = leads.filter((l: any) => l.assigned_to === v.id).length;
      const vCitas = citas.filter((c: any) => c.team_member_id === v.id).length;
      const vCerrados = cerrados.filter((c: any) => c.assigned_to === v.id).length;
      return { ...v, leads: vLeads, citas: vCitas, cerrados: vCerrados };
    }).sort((a: any, b: any) => b.cerrados - a.cerrados || b.leads - a.leads);

    let mensaje = `👥 *EQUIPO ACTIVO* (${team.length})\n\n`;

    // Vendedores with scorecard
    if (scorecards.length > 0) {
      mensaje += `🏆 *Vendedores*\n`;
      scorecards.forEach((v: any, i: number) => {
        const medal = i < 3 ? medalEmojis[i] : `${i + 1}.`;
        mensaje += `${medal} *${v.name}*\n`;
        mensaje += `   📊 ${v.leads} leads • ${v.citas} citas • ${v.cerrados} cierres\n`;
      });
    }

    // Non-vendedores
    const otros = team.filter((m: any) => m.role !== 'vendedor');
    if (otros.length > 0) {
      mensaje += `\n👔 *Otros roles*\n`;
      for (const m of otros) {
        mensaje += `• ${m.name} (${m.role})\n`;
      }
    }

    await sendMessage(ceoPhone, mensaje);

    // Return metadata with vendedores for list menu (calling code will send it)
    return {
      handled: true,
      action: 'reporte_equipo',
      metadata: {
        vendedores: scorecards.map((v: any) => ({
          id: v.id,
          name: v.name,
          leads: v.leads
        }))
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTE HANDLER - Procesa handlers llamados por detectCommand
  // ═══════════════════════════════════════════════════════════════════════════
  async executeHandler(
    handlerName: string,
    nombreCEO: string,
    params?: any
  ): Promise<{ message?: string; error?: string; needsExternalHandler?: boolean; metadata?: any }> {
    try {
      switch (handlerName) {
        case 'generarReporte': {
          const { data: leads } = await this.supabase.client
            .from('leads')
            .select('id, funnel_status, created_at')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

          const total = leads?.length || 0;
          const nuevos = leads?.filter(l => l.funnel_status === 'new').length || 0;
          const contactados = leads?.filter(l => l.funnel_status === 'contacted').length || 0;
          const citados = leads?.filter(l => l.funnel_status === 'scheduled').length || 0;

          return {
            message: `📊 *Reporte Semanal - ${nombreCEO}*\n\n` +
              `Total leads (7 días): ${total}\n` +
              `• Nuevos: ${nuevos}\n` +
              `• Contactados: ${contactados}\n` +
              `• Con cita: ${citados}`
          };
        }

        case 'reporteEquipo': {
          const { data: team } = await this.supabase.client
            .from('team_members')
            .select('id, name, role, active')
            .eq('active', true)
            .order('name');

          if (!team || team.length === 0) {
            return { message: '👥 No hay miembros activos en el equipo.' };
          }

          const vendedoresEH = team.filter((m: any) => m.role === 'vendedor');
          const vendedorIdsEH = vendedoresEH.map((v: any) => v.id);

          const hoyEH = new Date();
          const primerDiaMesEH = new Date(hoyEH.getFullYear(), hoyEH.getMonth(), 1).toISOString().split('T')[0];
          const hoyStrEH = hoyEH.toISOString().split('T')[0];

          const [leadsEH, citasEH, cerradosEH] = await Promise.all([
            this.supabase.client.from('leads').select('id, assigned_to').in('assigned_to', vendedorIdsEH).not('status', 'in', '("lost","inactive","fallen")'),
            this.supabase.client.from('appointments').select('id, team_member_id').in('team_member_id', vendedorIdsEH).gte('scheduled_date', primerDiaMesEH).lte('scheduled_date', hoyStrEH),
            this.supabase.client.from('leads').select('id, assigned_to').in('assigned_to', vendedorIdsEH).in('status', ['closed', 'reserved', 'delivered'])
          ]);

          const medalEmojisEH = ['🥇', '🥈', '🥉'];
          const scorecardsEH = vendedoresEH.map((v: any) => {
            const vL = (leadsEH.data || []).filter((l: any) => l.assigned_to === v.id).length;
            const vC = (citasEH.data || []).filter((c: any) => c.team_member_id === v.id).length;
            const vCr = (cerradosEH.data || []).filter((c: any) => c.assigned_to === v.id).length;
            return { ...v, leads: vL, citas: vC, cerrados: vCr };
          }).sort((a: any, b: any) => b.cerrados - a.cerrados || b.leads - a.leads);

          let msg = `👥 *EQUIPO ACTIVO* (${team.length})\n\n`;

          if (scorecardsEH.length > 0) {
            msg += `🏆 *Vendedores*\n`;
            scorecardsEH.forEach((v: any, i: number) => {
              const medal = i < 3 ? medalEmojisEH[i] : `${i + 1}.`;
              msg += `${medal} *${v.name}*\n`;
              msg += `   📊 ${v.leads} leads • ${v.citas} citas • ${v.cerrados} cierres\n`;
            });
          }

          const otrosEH = team.filter((m: any) => m.role !== 'vendedor');
          if (otrosEH.length > 0) {
            msg += `\n👔 *Otros roles*\n`;
            for (const m of otrosEH) {
              msg += `• ${m.name} (${m.role})\n`;
            }
          }

          return {
            message: msg,
            metadata: {
              vendedores: scorecardsEH.map((v: any) => ({
                id: v.id,
                name: v.name,
                leads: v.leads
              }))
            }
          };
        }

        case 'reporteLeads': {
          const { data: leads } = await this.supabase.client
            .from('leads')
            .select('id, funnel_status, temperature')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

          const hot = leads?.filter(l => l.temperature === 'HOT').length || 0;
          const warm = leads?.filter(l => l.temperature === 'WARM').length || 0;
          const cold = leads?.filter(l => l.temperature === 'COLD').length || 0;

          return {
            message: `📊 *Estado de Leads (30 días)*\n\n` +
              `Total: ${leads?.length || 0}\n\n` +
              `🔥 Hot: ${hot}\n` +
              `🌡️ Warm: ${warm}\n` +
              `❄️ Cold: ${cold}`
          };
        }

        case 'reporteVentas': {
          const ahora = new Date();
          const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
          const inicioMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
          const finMesPasado = new Date(ahora.getFullYear(), ahora.getMonth(), 0);

          // Ventas este mes
          const { data: ventasMesData, count: countMes } = await this.supabase.client
            .from('leads')
            .select('id, name, assigned_to, updated_at', { count: 'exact' })
            .eq('status', 'sold')
            .gte('updated_at', inicioMes.toISOString());

          // Ventas mes pasado
          const { count: countMesPasado } = await this.supabase.client
            .from('leads')
            .select('id', { count: 'exact' })
            .eq('status', 'sold')
            .gte('updated_at', inicioMesPasado.toISOString())
            .lte('updated_at', finMesPasado.toISOString());

          // Total leads este mes
          const { count: totalLeadsMes } = await this.supabase.client
            .from('leads')
            .select('id', { count: 'exact' })
            .gte('created_at', inicioMes.toISOString());

          // Ventas por vendedor
          const { data: vendedoresData } = await this.supabase.client
            .from('team_members')
            .select('id, name')
            .eq('active', true)
            .eq('role', 'vendedor');

          const ventasPorVendedor: { nombre: string; ventas: number }[] = [];
          for (const v of vendedoresData || []) {
            const cnt = (ventasMesData || []).filter((l: any) => l.assigned_to === v.id).length;
            if (cnt > 0) {
              ventasPorVendedor.push({ nombre: v.name, ventas: cnt });
            }
          }
          ventasPorVendedor.sort((a, b) => b.ventas - a.ventas);

          const ventasActual = countMes || 0;
          const ventasPasado = countMesPasado || 0;
          const diferencia = ventasActual - ventasPasado;
          const porcentajeCambio = ventasPasado > 0 ? Math.round((diferencia / ventasPasado) * 100) : 0;
          const conversion = totalLeadsMes && totalLeadsMes > 0
            ? Math.round((ventasActual / totalLeadsMes) * 100)
            : 0;

          const tendencia = diferencia > 0 ? '📈' : diferencia < 0 ? '📉' : '➡️';
          const signo = diferencia > 0 ? '+' : '';

          let msgVentas = `📊 *REPORTE DE VENTAS*\n\n`;
          msgVentas += `*Este mes:* ${ventasActual} ventas ${tendencia}\n`;
          msgVentas += `*Mes pasado:* ${ventasPasado} ventas\n`;
          msgVentas += `*Cambio:* ${signo}${diferencia} (${signo}${porcentajeCambio}%)\n\n`;
          msgVentas += `📈 *Conversión:* ${conversion}% (${ventasActual}/${totalLeadsMes || 0} leads)\n\n`;

          if (ventasPorVendedor.length > 0) {
            msgVentas += `🏆 *Top Vendedores:*\n`;
            ventasPorVendedor.slice(0, 5).forEach((v, i) => {
              const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
              msgVentas += `${medalla} ${v.nombre}: ${v.ventas}\n`;
            });
          } else {
            msgVentas += `_Sin ventas registradas este mes_`;
          }

          return { message: msgVentas };
        }

        case 'resumenHoy': {
          const hoy = new Date();
          hoy.setHours(0, 0, 0, 0);

          const { data: leadsHoy } = await this.supabase.client
            .from('leads')
            .select('id')
            .gte('created_at', hoy.toISOString());

          const { data: citasHoy } = await this.supabase.client
            .from('appointments')
            .select('id, status')
            .gte('scheduled_date', hoy.toISOString())
            .lt('scheduled_date', new Date(hoy.getTime() + 24 * 60 * 60 * 1000).toISOString());

          return {
            message: `📅 *Resumen de Hoy - ${nombreCEO}*\n\n` +
              `🆕 Leads nuevos: ${leadsHoy?.length || 0}\n` +
              `📅 Citas programadas: ${citasHoy?.length || 0}\n` +
              `✅ Citas completadas: ${citasHoy?.filter(c => c.status === 'completed').length || 0}`
          };
        }

        case 'verMeta': {
          return {
            message: `🎯 *Meta del Mes*\n\n` +
              `Funcionalidad en desarrollo.\n` +
              `Pronto podrás ver el avance de metas aquí.`
          };
        }

        case 'verPendientes': {
          const { data: pendientes } = await this.supabase.client
            .from('leads')
            .select('name, phone, funnel_status, last_activity_at')
            .in('funnel_status', ['new', 'contacted'])
            .order('last_activity_at', { ascending: true })
            .limit(10);

          let msg = `⏳ *Leads Pendientes de Seguimiento*\n\n`;
          if (!pendientes || pendientes.length === 0) {
            msg += `¡Todo al día! No hay pendientes urgentes. ✅`;
          } else {
            for (const p of pendientes) {
              const dias = p.last_activity_at
                ? Math.floor((Date.now() - new Date(p.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))
                : '?';
              msg += `• ${p.name || 'Sin nombre'} - ${dias} días sin actividad\n`;
            }
          }
          return { message: msg };
        }

        // ═══ REPORTE DE CONEXIONES DEL EQUIPO ═══
        case 'reporteConexiones': {
          const { data: team } = await this.supabase.client
            .from('team_members')
            .select('name, role, oficina, notes, active')
            .eq('active', true)
            .order('role');

          const hoy = new Date();
          const hoyStr = hoy.toISOString().split('T')[0]; // "2026-01-26"

          const conectadosHoy: { name: string; role: string; hora: string }[] = [];
          const noConectadosCoord: { name: string; oficina: string }[] = [];
          const noConectadosVend: { name: string; ultima: string }[] = [];

          for (const m of team || []) {
            let lastInteraction: string | null = null;

            // Extraer last_sara_interaction del campo notes (puede ser string JSON o objeto)
            if (m.notes) {
              try {
                const notesObj = typeof m.notes === 'string' ? JSON.parse(m.notes) : m.notes;
                lastInteraction = notesObj?.last_sara_interaction || null;
              } catch {
                // Si no es JSON válido, ignorar
              }
            }

            if (lastInteraction && lastInteraction.startsWith(hoyStr)) {
              // Se conectó hoy
              const hora = new Date(lastInteraction).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Mexico_City'
              });
              conectadosHoy.push({ name: m.name, role: m.role, hora });
            } else {
              // No se conectó hoy
              if (m.role === 'coordinador') {
                noConectadosCoord.push({ name: m.name, oficina: m.oficina || '-' });
              } else if (m.role === 'vendedor') {
                let ultimaStr = 'Sin registro';
                if (lastInteraction) {
                  const fecha = new Date(lastInteraction);
                  ultimaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
                }
                noConectadosVend.push({ name: m.name, ultima: ultimaStr });
              }
            }
          }

          // Construir mensaje
          let msg = `📊 *REPORTE DE CONEXIONES*\n_${hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}_\n\n`;

          // Conectados hoy
          if (conectadosHoy.length > 0) {
            msg += `✅ *SE CONECTARON HOY:*\n`;
            for (const c of conectadosHoy) {
              msg += `• ${c.name} (${c.role}) - ${c.hora}\n`;
            }
            msg += `\n`;
          }

          // Coordinadores sin conexión
          if (noConectadosCoord.length > 0) {
            msg += `❌ *COORDINADORES SIN CONEXIÓN:*\n`;
            for (const c of noConectadosCoord) {
              msg += `• ${c.name} (${c.oficina})\n`;
            }
            msg += `\n`;
          }

          // Vendedores sin conexión
          if (noConectadosVend.length > 0) {
            msg += `❌ *VENDEDORES SIN CONEXIÓN HOY:*\n`;
            for (const v of noConectadosVend) {
              msg += `• ${v.name} - última: ${v.ultima}\n`;
            }
            msg += `\n`;
          }

          // Resumen
          const totalActivos = (team || []).length;
          const totalConectados = conectadosHoy.length;
          const pctConectados = totalActivos > 0 ? Math.round((totalConectados / totalActivos) * 100) : 0;

          msg += `📈 *RESUMEN:*\n`;
          msg += `• Conectados: ${totalConectados} de ${totalActivos} (${pctConectados}%)\n`;
          msg += `• Coordinadores: ${conectadosHoy.filter(c => c.role === 'coordinador').length} de ${noConectadosCoord.length + conectadosHoy.filter(c => c.role === 'coordinador').length}\n`;
          msg += `• Vendedores: ${conectadosHoy.filter(c => c.role === 'vendedor').length} de ${noConectadosVend.length + conectadosHoy.filter(c => c.role === 'vendedor').length}\n`;

          if (noConectadosCoord.length === (team || []).filter(t => t.role === 'coordinador').length && noConectadosCoord.length > 0) {
            msg += `\n⚠️ _Ningún coordinador se conectó hoy_`;
          }

          return { message: msg };
        }

        // ═══ REPORTE PIPELINE ═══
        case 'reportePipeline': {
          const pipelineService = new PipelineService(this.supabase);
          const summary = await pipelineService.getPipelineSummary(90);
          const msgPipeline = formatPipelineForWhatsApp(summary);
          return { message: msgPipeline };
        }

        // ═══ CALCULADORA DE FINANCIAMIENTO ═══
        case 'calculadoraFinanciamiento': {
          const financingService = new FinancingCalculatorService(this.supabase);
          const amountText = params?.amount || '';

          // If amount provided, do a quick estimate
          if (amountText) {
            const amount = financingService.parseAmount(amountText);
            if (amount && amount > 0) {
              const estimate = financingService.quickEstimate(amount, 20, 20);
              return { message: estimate };
            }
          }

          // Otherwise show help menu for financing
          const banks = financingService.getAvailableBanks();
          const banksMsg = banks.slice(0, 6).map(b => `• ${b.name}: ${b.rate}%`).join('\n');

          const msg = `🏦 *CALCULADORA DE FINANCIAMIENTO*\n\n` +
            `*Uso:*\n` +
            `• _calcular 2.5 millones_ - Estimado rápido\n` +
            `• _financiamiento 3m_ - Comparar bancos\n` +
            `• _credito_ - Ver opciones\n\n` +
            `*Tasas Actuales:*\n${banksMsg}\n\n` +
            `_Escribe el precio de la propiedad para comenzar_`;

          return { message: msg };
        }

        // ═══ COMPARADOR DE PROPIEDADES ═══
        case 'compararPropiedades': {
          const comparatorService = new PropertyComparatorService(this.supabase);
          const query = params?.query || '';

          if (!query) {
            const msg = `🏠 *COMPARADOR DE PROPIEDADES*\n\n` +
              `*Uso:*\n` +
              `• _comparar Monte Verde vs Distrito Falco_\n` +
              `• _vs Miravalle Los Encinos_\n\n` +
              `*Desarrollos disponibles:*\n` +
              `CASAS: Monte Verde, Monte Real, Los Encinos, Miravalle, Distrito Falco, Andes, Alpes\n` +
              `TERRENOS: Villa Campelo, Villa Galiano (Citadella del Nogal)\n\n` +
              `_Escribe los desarrollos que quieres comparar_`;
            return { message: msg };
          }

          const result = await comparatorService.quickCompare(query);
          return { message: result };
        }

        // ═══ PROBABILIDAD DE CIERRE ═══
        case 'probabilidadCierre': {
          const probService = new CloseProbabilityService(this.supabase);
          const data = await probService.calculateForAllLeads(50);
          const message = probService.formatForWhatsApp(data);
          return { message };
        }

        // ═══ GESTIÓN DE VISITAS ═══
        case 'gestionVisitas': {
          const visitService = new VisitManagementService(this.supabase);
          const summary = await visitService.getVisitSummary(30);
          const message = visitService.formatSummaryForWhatsApp(summary);
          return { message };
        }

        // ═══ TRACKING DE OFERTAS ═══
        case 'trackingOfertas': {
          const offerService = new OfferTrackingService(this.supabase);
          const summary = await offerService.getOfferSummary(30);
          const message = offerService.formatSummaryForWhatsApp(summary);
          return { message };
        }

        // ═══ ALERTAS INTELIGENTES ═══
        case 'alertasInteligentes': {
          const alertsService = new SmartAlertsService(this.supabase);
          const summary = await alertsService.getAlertsSummary();
          const message = alertsService.formatSummaryForWhatsApp(summary);
          return { message };
        }

        // ═══ INTELIGENCIA DE MERCADO ═══
        case 'inteligenciaMercado': {
          const marketService = new MarketIntelligenceService(this.supabase);
          const analysis = await marketService.getMarketAnalysis(30);
          const message = marketService.formatForWhatsApp(analysis);
          return { message };
        }

        // ═══ VALOR DEL CLIENTE (CLV) ═══
        case 'valorCliente': {
          const clvService = new CustomerValueService(this.supabase);
          const analysis = await clvService.getCLVAnalysis();
          const message = clvService.formatAnalysisForWhatsApp(analysis);
          return { message };
        }

        // ═══ VER BACKUPS ═══
        case 'verBackups': {
          const logs = await getBackupLog(this.supabase);
          if (!logs || logs.length === 0) {
            return { message: '💾 No hay backups registrados aún.' };
          }
          // Agrupar por fecha
          const byFecha: Record<string, any[]> = {};
          for (const log of logs) {
            if (!byFecha[log.fecha]) byFecha[log.fecha] = [];
            byFecha[log.fecha].push(log);
          }
          const fechas = Object.keys(byFecha).slice(0, 5);
          const lines = fechas.map(f => {
            const items = byFecha[f];
            const totalRows = items.reduce((s: number, i: any) => s + (i.row_count || 0), 0);
            const totalBytes = items.reduce((s: number, i: any) => s + (i.size_bytes || 0), 0);
            const tipos = items.map((i: any) => i.tipo).join(', ');
            return `📅 ${f}\n   ${tipos} — ${totalRows} registros, ${Math.round(totalBytes/1024)}KB`;
          });
          return { message: `💾 *Últimos Backups R2*\n\n${lines.join('\n\n')}` };
        }

        // ═══ REPORTE SEMANAL ═══
        case 'reporteSemanal': {
          const reportService = new PDFReportService(this.supabase);
          const config = reportService.getWeeklyReportConfig(nombreCEO);
          const data = await reportService.generateReportData(config);
          const message = reportService.formatForWhatsApp(data);
          return { message };
        }

        // ═══ REPORTE MENSUAL ═══
        case 'reporteMensual': {
          const reportService = new PDFReportService(this.supabase);
          const config = reportService.getMonthlyReportConfig(nombreCEO);
          const data = await reportService.generateReportData(config);
          const message = reportService.formatForWhatsApp(data);
          return { message };
        }

        // ═══ DASHBOARD LLAMADAS IA ═══
        case 'reporteLlamadas': {
          const ahora = new Date();
          const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
          const inicioMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString();
          const finMesPasado = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59).toISOString();

          const [callsMesRes, callsMesPasadoRes, vendedoresRes] = await Promise.all([
            this.supabase.client.from('call_logs').select('*').gte('created_at', inicioMes),
            this.supabase.client.from('call_logs').select('id, outcome').gte('created_at', inicioMesPasado).lte('created_at', finMesPasado),
            this.supabase.client.from('team_members').select('id, name').eq('active', true).eq('role', 'vendedor')
          ]);

          const callsMes = callsMesRes.data || [];
          const callsMesPasado = callsMesPasadoRes.data || [];
          const vendedores = vendedoresRes.data || [];

          const totalMes = callsMes.length;
          const totalMesPasado = callsMesPasado.length;
          const diff = totalMes - totalMesPasado;
          const tendencia = diff > 0 ? `📈 (+${diff} vs mes ant.)` : diff < 0 ? `📉 (${diff} vs mes ant.)` : '➡️ (igual que mes ant.)';

          // Por outcome
          const exitosas = callsMes.filter((c: any) => c.outcome === 'successful').length;
          const sinRespuesta = callsMes.filter((c: any) => c.outcome === 'no_answer').length;
          const buzon = callsMes.filter((c: any) => c.outcome === 'voicemail').length;
          const ocupado = callsMes.filter((c: any) => c.outcome === 'busy').length;
          const noInteresado = callsMes.filter((c: any) => c.outcome === 'not_interested').length;
          const sinClasificar = callsMes.filter((c: any) => !c.outcome || c.outcome === 'unknown').length;

          // Duración promedio (solo llamadas con duración)
          const conDuracion = callsMes.filter((c: any) => c.duration_seconds && c.duration_seconds > 0);
          let duracionPromedio = '—';
          if (conDuracion.length > 0) {
            const totalSeg = conDuracion.reduce((s: number, c: any) => s + c.duration_seconds, 0);
            const promSeg = Math.round(totalSeg / conDuracion.length);
            duracionPromedio = `${Math.floor(promSeg / 60)}m ${promSeg % 60}s`;
          }

          // Sentimiento
          const positivo = callsMes.filter((c: any) => c.sentiment?.toLowerCase() === 'positive').length;
          const neutral = callsMes.filter((c: any) => c.sentiment?.toLowerCase() === 'neutral').length;
          const negativo = callsMes.filter((c: any) => c.sentiment?.toLowerCase() === 'negative').length;

          // Conversión: citas de llamadas exitosas
          const callLeadIds = [...new Set(callsMes.filter((c: any) => c.outcome === 'successful' && c.lead_id).map((c: any) => c.lead_id))];
          let citasDeExitosas = 0;
          if (callLeadIds.length > 0) {
            const { count } = await this.supabase.client
              .from('appointments')
              .select('id', { count: 'exact' })
              .in('lead_id', callLeadIds)
              .gte('created_at', inicioMes);
            citasDeExitosas = count || 0;
          }
          const pctConversion = exitosas > 0 ? Math.round((citasDeExitosas / exitosas) * 100) : 0;

          // Top vendedores por llamadas
          const vendedorCallCount: Record<string, number> = {};
          for (const c of callsMes) {
            if (c.vendor_id) {
              vendedorCallCount[c.vendor_id] = (vendedorCallCount[c.vendor_id] || 0) + 1;
            }
          }
          const topVendedores = Object.entries(vendedorCallCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([vid, cnt]) => {
              const v = vendedores.find((vd: any) => vd.id === vid);
              return { nombre: v?.name || 'Sin asignar', llamadas: cnt };
            });

          const medallas = ['🥇', '🥈', '🥉'];
          const mesNombre = ahora.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

          let msg = `📞 *DASHBOARD LLAMADAS IA*\n${mesNombre}\n\n`;
          msg += `📊 *Resumen del Mes*\n`;
          msg += `Total: ${totalMes} llamadas ${tendencia}\n`;
          msg += `⏱️ Duración promedio: ${duracionPromedio}\n\n`;
          msg += `📋 *Por Resultado*\n`;
          msg += `✅ Exitosas: ${exitosas}\n`;
          if (noInteresado > 0) msg += `❌ No interesado: ${noInteresado}\n`;
          msg += `📵 Sin respuesta: ${sinRespuesta}\n`;
          msg += `📭 Buzón: ${buzon}\n`;
          if (ocupado > 0) msg += `📵 Ocupado: ${ocupado}\n`;
          if (sinClasificar > 0) msg += `❓ Sin clasificar: ${sinClasificar}\n`;
          msg += `\n`;

          if (positivo > 0 || neutral > 0 || negativo > 0) {
            msg += `💭 *Sentimiento*\n`;
            msg += `😊 Positivo: ${positivo} | 😐 Neutral: ${neutral} | 😟 Negativo: ${negativo}\n\n`;
          }

          msg += `📅 *Conversión*\n`;
          msg += `${citasDeExitosas} citas de ${exitosas} exitosas = ${pctConversion}%\n\n`;

          if (topVendedores.length > 0) {
            msg += `🏆 *Top Vendedores*\n`;
            topVendedores.forEach((v, i) => {
              msg += `${medallas[i]} ${v.nombre}: ${v.llamadas} llamadas\n`;
            });
          }

          return { message: msg };
        }

        // Handlers que requieren lógica externa (en whatsapp.ts)
        case 'vendedorCitasHoy':
        case 'iniciarBroadcast':
        case 'verSegmentos':
        case 'verEventos':
          return { needsExternalHandler: true };

        // ━━━ MENSAJE A LEAD (Sara intermediario) ━━━
        case 'mensajeLead':
          return { needsExternalHandler: true };

        // ━━━ BRIDGE / CHAT DIRECTO ━━━
        case 'bridgeLead':
          return { needsExternalHandler: true };

        // ━━━ CERRAR BRIDGE ━━━
        case 'cerrarBridge':
          return { needsExternalHandler: true };

        // ━━━ VER ACTIVIDAD / BITÁCORA ━━━
        case 'verActividad':
          return { needsExternalHandler: true };

        // ━━━ MOVER LEAD EN FUNNEL ━━━
        case 'ceoMoverLead':
          return { needsExternalHandler: true };

        // ━━━ QUIEN ES - BUSCAR LEAD ━━━
        case 'ceoQuienEs':
          return { needsExternalHandler: true };

        // ━━━ BROCHURE ━━━
        case 'ceoBrochure':
          return { needsExternalHandler: true };

        // ━━━ UBICACION ━━━
        case 'ceoUbicacion':
          return { needsExternalHandler: true };

        // ━━━ VIDEO ━━━
        case 'ceoVideo':
          return { needsExternalHandler: true };

        // ━━━ VER LEAD (historial/info) ━━━
        case 'ceoVerLead':
          return { needsExternalHandler: true };

        // ━━━ COMANDOS DE VENDEDOR PARA CEO ━━━
        case 'vendedorResumenLeads':
        case 'vendedorLeadsHot':
        case 'vendedorAgregarNota':
        case 'vendedorVerNotas':
        case 'vendedorCoaching':
          return { needsExternalHandler: true };

        // ━━━ CEO NUEVO LEAD (creación en whatsapp.ts) ━━━
        case 'ceoNuevoLead':
          return { needsExternalHandler: true };

        // ═══ HEALTH STATUS ═══
        case 'healthStatus': {
          const statusMsg = await getLastHealthCheck(this.supabase);
          return { message: statusMsg };
        }

        // ═══ ÚLTIMAS RESPUESTAS DE IA ═══
        case 'ultimasRespuestasAI': {
          const respMsg = await getLastAIResponses(this.supabase);
          return { message: respMsg };
        }

        // ═══ OBSERVABILIDAD ═══
        case 'observabilidad': {
          const obsDashboard = await getObservabilityDashboard(this.supabase);
          return { message: formatObservabilityForWhatsApp(obsDashboard) };
        }

        // ═══ FUNNEL POR DESARROLLO ═══
        case 'developmentFunnel': {
          const funnelService = new DevelopmentFunnelService(this.supabase);
          const desarrollo = handlerParams?.desarrollo || '';
          const funnelData = await funnelService.getFunnel(desarrollo);
          return { message: funnelService.formatFunnelForWhatsApp(funnelData) };
        }

        // ═══ COMPARATIVO DE DESARROLLOS ═══
        case 'developmentComparison': {
          const compService = new DevelopmentFunnelService(this.supabase);
          const comparison = await compService.compareAll();
          return { message: compService.formatComparisonForWhatsApp(comparison) };
        }

        // ═══ PROGRAMA REFERIDOS ═══
        case 'referralProgram': {
          const refService = new ReferralService(this.supabase);
          const stats = await refService.getReferralStats(90);
          return { message: refService.formatStatsForWhatsApp(stats) };
        }

        // ═══ HANDOFFS (leads con IA desactivada) ═══
        case 'handoffs': {
          const { data: leadsHandoff } = await this.supabase.client
            .from('leads')
            .select('name, phone, status, notes, assigned_to, team_members!leads_assigned_to_fkey(name)')
            .not('notes', 'is', null)
            .order('updated_at', { ascending: false });

          const handoffLeads = (leadsHandoff || []).filter((l: any) => {
            const n = typeof l.notes === 'object' ? l.notes : {};
            return n.ai_enabled === false;
          });

          if (handoffLeads.length === 0) {
            return { message: '✅ Todos los leads tienen SARA activada. No hay handoffs activos.' };
          }

          let msg = `🧑 *Leads con IA desactivada (${handoffLeads.length}):*\n\n`;
          for (const l of handoffLeads.slice(0, 15)) {
            const vendedor = (l as any).team_members?.name || 'Sin asignar';
            const desde = l.notes?.handoff_at ? new Date(l.notes.handoff_at).toLocaleDateString('es-MX') : '?';
            msg += `• *${l.name}* (${l.status}) — Vendedor: ${vendedor} — Desde: ${desde}\n`;
          }
          if (handoffLeads.length > 15) {
            msg += `\n_...y ${handoffLeads.length - 15} más_`;
          }
          msg += `\n\nUsa *bot [nombre]* para reactivar SARA en un lead.`;
          return { message: msg };
        }

        default:
          return { error: `Handler no implementado: ${handlerName}` };
      }
    } catch (e: any) {
      console.error(`Error en handler ${handlerName}:`, e);
      return { error: `Error: ${e.message}` };
    }
  }
}
