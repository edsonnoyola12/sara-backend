import { SupabaseService } from './supabase';

export interface CEOCommandResult {
  handled: boolean;
  response?: string;
  action?: string;
  data?: any;
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
          `• *reporte* - Resumen semanal\n` +
          `• *equipo* - Ver equipo activo\n` +
          `• *leads* - Estado de leads\n` +
          `• *ventas* - Métricas de ventas\n\n` +
          `*📡 BROADCASTS*\n` +
          `• *broadcast* - Enviar mensaje masivo\n` +
          `• *segmentos* - Ver segmentos disponibles\n\n` +
          `*📅 CITAS*\n` +
          `• *citas* - Citas de hoy\n` +
          `• *citas semana* - Citas de la semana\n\n` +
          `*🎯 EVENTOS*\n` +
          `• *eventos* - Ver eventos activos\n` +
          `• *crear evento [nombre]* - Nuevo evento\n\n` +
          `*💬 COMUNICACIÓN*\n` +
          `• *mensaje [nombre]* - Escribir a un lead (Sara intermedia)\n` +
          `• *bridge [nombre]* - Chat directo 10 min\n` +
          `• *#cerrar* - Terminar chat directo\n\n` +
          `¿En qué te puedo ayudar? 🏠`
      };
    }

    // ═══ CITAS HOY ═══
    if (msgLower === 'citas' || msgLower === 'citas hoy') {
      return { action: 'call_handler', handlerName: 'vendedorCitasHoy' };
    }

    // ═══ REPORTE ═══
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

    // ═══ VENTAS ═══
    if (msgLower.startsWith('ventas') || msgLower.startsWith('sales')) {
      return { action: 'call_handler', handlerName: 'reporteVentas' };
    }

    // ═══ HOY (resumen del día) ═══
    if (msgLower === 'hoy' || msgLower === 'resumen') {
      return { action: 'call_handler', handlerName: 'resumenHoy' };
    }

    // ═══ META ═══
    if (msgLower === 'meta' || msgLower === 'objetivo') {
      return { action: 'call_handler', handlerName: 'verMeta' };
    }

    // ═══ PENDIENTES ═══
    if (msgLower === 'pendientes' || msgLower === 'pending') {
      return { action: 'call_handler', handlerName: 'verPendientes' };
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
    const mensaje = `📈 *Reporte de Ventas*\n\n` +
      `Funcionalidad en desarrollo.\n` +
      `Pronto podrás ver métricas de ventas aquí.`;

    await sendMessage(ceoPhone, mensaje);
    return { handled: true, action: 'reporte_ventas' };
  }

  private async reporteEquipo(
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    const { data: team } = await this.supabase.client
      .from('team_members')
      .select('name, role, is_active')
      .eq('is_active', true)
      .order('name');

    let mensaje = `👥 *Equipo Activo*\n\n`;
    for (const member of team || []) {
      mensaje += `• ${member.name} (${member.role || 'vendedor'})\n`;
    }

    await sendMessage(ceoPhone, mensaje);
    return { handled: true, action: 'reporte_equipo' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTE HANDLER - Procesa handlers llamados por detectCommand
  // ═══════════════════════════════════════════════════════════════════════════
  async executeHandler(
    handlerName: string,
    nombreCEO: string,
    params?: any
  ): Promise<{ message?: string; error?: string; needsExternalHandler?: boolean }> {
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
            .select('name, role, active')
            .eq('active', true)
            .order('name');

          let msg = `👥 *Equipo Activo*\n\n`;
          for (const m of team || []) {
            msg += `• ${m.name} (${m.role || 'vendedor'})\n`;
          }
          return { message: msg };
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
          return {
            message: `📈 *Reporte de Ventas*\n\n` +
              `Funcionalidad en desarrollo.\n` +
              `Pronto disponible.`
          };
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

        default:
          return { error: `Handler no implementado: ${handlerName}` };
      }
    } catch (e: any) {
      console.error(`Error en handler ${handlerName}:`, e);
      return { error: `Error: ${e.message}` };
    }
  }
}
