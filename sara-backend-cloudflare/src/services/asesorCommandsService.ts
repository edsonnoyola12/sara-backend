import { SupabaseService } from './supabase';
import { formatPhoneForDisplay } from '../handlers/whatsapp-utils';

interface CommandResult {
  action: 'send_message' | 'call_handler' | 'not_recognized';
  message?: string;
  handlerName?: string;
  handlerParams?: any;
}

interface HandlerResult {
  message?: string;
  error?: string;
  needsExternalHandler?: boolean;
  leadPhone?: string;
  leadMessage?: string;
  vendedorPhone?: string;
  vendedorMessage?: string;
  vendedorDentro24h?: boolean;
}

interface CreditFlowContext {
  state: string;
  banco_preferido?: string;
  ingreso_mensual?: number;
  enganche?: number;
  capacidad_credito?: number;
  modalidad?: string;
  lead_name: string;
  lead_phone: string;
  created_at: string;
  updated_at: string;
}

export class AsesorCommandsService {
  constructor(private supabase: SupabaseService) {}

  // Helper para parsear notes de forma segura (algunos leads tienen texto plano)
  private safeParseNotes(notes: any): any {
    if (!notes) return {};
    if (typeof notes === 'object') return notes;
    try {
      return JSON.parse(notes);
    } catch {
      return {}; // notes no es JSON válido
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SINCRONIZAR CON MORTGAGE_APPLICATIONS (para que aparezca en CRM)
  // ═══════════════════════════════════════════════════════════════════
  private async syncMortgageApplication(lead: any, newStatus: string, asesorId: string, asesorName: string): Promise<void> {
    try {
      // Mapeo de status del lead a status de mortgage_applications
      const statusMap: Record<string, string> = {
        'new': 'pending',
        'credit_qualified': 'pending',
        'contacted': 'in_review',
        'documents_pending': 'in_review',
        'pre_approved': 'sent_to_bank',
        'approved': 'approved',
        'rejected': 'rejected'
      };

      const mortgageStatus = statusMap[newStatus] || 'pending';
      const notes = this.safeParseNotes(lead.notes);
      const ctx = notes?.credit_flow_context;

      // Buscar si ya existe un mortgage_application para este lead
      const { data: existingMortgage } = await this.supabase.client
        .from('mortgage_applications')
        .select('id')
        .eq('lead_id', lead.id)
        .single();

      if (existingMortgage) {
        // Actualizar existente
        await this.supabase.client
          .from('mortgage_applications')
          .update({
            status: mortgageStatus,
            updated_at: new Date().toISOString(),
            ...(mortgageStatus === 'in_review' && { in_review_at: new Date().toISOString() }),
            ...(mortgageStatus === 'sent_to_bank' && { sent_to_bank_at: new Date().toISOString() }),
            ...(mortgageStatus === 'approved' && { decision_at: new Date().toISOString() }),
            ...(mortgageStatus === 'rejected' && { decision_at: new Date().toISOString() })
          })
          .eq('id', existingMortgage.id);
        console.log(`📊 Mortgage ${existingMortgage.id} actualizado a ${mortgageStatus}`);
      } else {
        // Crear nuevo mortgage_application
        const newMortgage = {
          lead_id: lead.id,
          lead_name: lead.name,
          lead_phone: lead.phone,
          property_name: lead.property_interest || ctx?.desarrollo || 'Por definir',
          monthly_income: ctx?.ingreso_mensual || 0,
          down_payment: ctx?.enganche || 0,
          bank: ctx?.banco_preferido || 'Por definir',
          status: mortgageStatus,
          status_notes: 'Creado desde comandos de WhatsApp',
          assigned_advisor_id: asesorId,
          assigned_advisor_name: asesorName,
          pending_at: new Date().toISOString(),
          ...(mortgageStatus === 'in_review' && { in_review_at: new Date().toISOString() }),
          ...(mortgageStatus === 'sent_to_bank' && { sent_to_bank_at: new Date().toISOString() })
        };

        const { data: created, error } = await this.supabase.client
          .from('mortgage_applications')
          .insert(newMortgage)
          .select('id')
          .single();

        if (error) {
          console.error('❌ Error creando mortgage:', error);
        } else {
          console.log(`📊 Mortgage ${created?.id} creado con status ${mortgageStatus}`);
        }
      }
    } catch (e) {
      console.error('❌ Error sincronizando mortgage_application:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DETECCIÓN DE COMANDOS
  // ═══════════════════════════════════════════════════════════════════
  detectCommand(mensaje: string, bodyOriginal: string, nombreAsesor: string): CommandResult {
    const msg = mensaje.toLowerCase().trim();

    // ━━━ AYUDA ━━━
    if (msg === 'ayuda' || msg === 'help' || msg === 'comandos' || msg === '?') {
      return { action: 'send_message', message: this.getMensajeAyuda(nombreAsesor) };
    }

    // ━━━ MIS LEADS ━━━
    if (msg === 'mis leads' || msg === 'leads' || msg === 'mis clientes' || msg === 'clientes') {
      return { action: 'call_handler', handlerName: 'asesorMisLeads' };
    }

    // ━━━ STATUS [lead] ━━━
    const statusMatch = msg.match(/^status\s+(.+)$/i) || msg.match(/^ver\s+(.+)$/i) || msg.match(/^info\s+(.+)$/i);
    if (statusMatch) {
      return { action: 'call_handler', handlerName: 'asesorStatusLead', handlerParams: { query: statusMatch[1] } };
    }

    // ━━━ DOCS PENDIENTES - Ver leads esperando documentos ━━━
    if (msg === 'docs pendientes' || msg === 'documentos pendientes' || msg === 'pendientes' || msg === 'esperando docs' || msg === 'pendientes docs' || msg === 'pendientes documentos') {
      return { action: 'call_handler', handlerName: 'asesorDocsPendientes' };
    }

    // ━━━ DOCS [lead] ━━━
    const docsMatch = msg.match(/^docs?\s+(.+)$/i) || msg.match(/^documentos?\s+(.+)$/i) || msg.match(/^pedir docs?\s+(.+)$/i);
    if (docsMatch) {
      return { action: 'call_handler', handlerName: 'asesorPedirDocs', handlerParams: { query: docsMatch[1] } };
    }

    // ━━━ PREAPROBADO [lead] ━━━
    const preaprobadoMatch = msg.match(/^preaprobado\s+(.+)$/i) || msg.match(/^aprobado\s+(.+)$/i) || msg.match(/^pre-?aprobado\s+(.+)$/i);
    if (preaprobadoMatch) {
      return { action: 'call_handler', handlerName: 'asesorPreaprobado', handlerParams: { query: preaprobadoMatch[1] } };
    }

    // ━━━ RECHAZADO [lead] [motivo] ━━━
    const rechazadoMatch = msg.match(/^rechazado\s+(\S+)(?:\s+(.+))?$/i) || msg.match(/^no aprobado\s+(\S+)(?:\s+(.+))?$/i);
    if (rechazadoMatch) {
      return { action: 'call_handler', handlerName: 'asesorRechazado', handlerParams: { query: rechazadoMatch[1], motivo: rechazadoMatch[2] || 'No especificado' } };
    }

    // ━━━ ADELANTE / AVANZAR [lead] ━━━
    const adelanteMatch = msg.match(/^(?:adelante|avanzar|siguiente|next)\s+(.+)$/i) ||
                          msg.match(/^(.+?)\s+(?:adelante|avanzar|al siguiente)$/i);
    if (adelanteMatch) {
      return { action: 'call_handler', handlerName: 'asesorMoverLead', handlerParams: { query: adelanteMatch[1], direccion: 'next' } };
    }

    // ━━━ ATRAS / REGRESAR [lead] ━━━
    const atrasMatch = msg.match(/^(?:atras|atrás|regresar|anterior|prev)\s+(.+)$/i) ||
                       msg.match(/^(.+?)\s+(?:atras|atrás|regresar|al anterior)$/i);
    if (atrasMatch) {
      return { action: 'call_handler', handlerName: 'asesorMoverLead', handlerParams: { query: atrasMatch[1], direccion: 'prev' } };
    }

    // ━━━ ON / OFF - Disponibilidad ━━━
    if (msg === 'on' || msg === 'disponible' || msg === 'activo') {
      return { action: 'call_handler', handlerName: 'asesorDisponibilidad', handlerParams: { estado: true } };
    }
    if (msg === 'off' || msg === 'no disponible' || msg === 'ocupado' || msg === 'inactivo') {
      return { action: 'call_handler', handlerName: 'asesorDisponibilidad', handlerParams: { estado: false } };
    }

    // ━━━ CONTACTADO [lead] ━━━
    const contactadoMatch = msg.match(/^contactado\s+(.+)$/i) || msg.match(/^contacte\s+a?\s*(.+)$/i);
    if (contactadoMatch) {
      return { action: 'call_handler', handlerName: 'asesorMarcarContactado', handlerParams: { query: contactadoMatch[1] } };
    }

    // ━━━ DILE [lead] [mensaje] ━━━
    const dileMatch = msg.match(/^dile\s+a?\s*(\S+)\s+que\s+(.+)$/i) ||
                      msg.match(/^mensaje\s+a?\s*(\S+)\s+(.+)$/i) ||
                      msg.match(/^enviar\s+a?\s*(\S+)\s+(.+)$/i);
    if (dileMatch) {
      return { action: 'call_handler', handlerName: 'asesorEnviarMensaje', handlerParams: { query: dileMatch[1], mensaje: dileMatch[2] } };
    }

    // ━━━ LLAMAR [lead] ━━━
    const llamarMatch = msg.match(/^llamar\s+(.+)$/i) || msg.match(/^tel(?:efono)?\s+(.+)$/i) || msg.match(/^contacto\s+(.+)$/i);
    if (llamarMatch) {
      return { action: 'call_handler', handlerName: 'asesorTelefonoLead', handlerParams: { query: llamarMatch[1] } };
    }

    // ━━━ ACTUALIZAR [lead] [campo] [valor] ━━━
    const actualizarMatch = msg.match(/^actualizar\s+(\S+)\s+(\S+)\s+(.+)$/i);
    if (actualizarMatch) {
      return { action: 'call_handler', handlerName: 'asesorActualizarLead', handlerParams: {
        query: actualizarMatch[1],
        campo: actualizarMatch[2],
        valor: actualizarMatch[3]
      }};
    }

    // ━━━ NUEVO LEAD ━━━
    if (msg.startsWith('nuevo ') || msg.startsWith('crear ') || msg.startsWith('agregar ')) {
      return { action: 'call_handler', handlerName: 'asesorCrearLeadHipoteca', handlerParams: { body: bodyOriginal } };
    }

    // ━━━ AGENDAR CITA ━━━
    if (msg.startsWith('cita ') || msg.startsWith('agendar ')) {
      return { action: 'call_handler', handlerName: 'asesorAgendarCita', handlerParams: { body: bodyOriginal } };
    }

    // ━━━ CANCELAR CITA ━━━
    if (msg.startsWith('cancelar cita') || msg.startsWith('cancelar ')) {
      return { action: 'call_handler', handlerName: 'vendedorCancelarCita' };
    }

    // ━━━ REAGENDAR CITA ━━━
    if (msg.startsWith('reagendar') || msg.startsWith('mover cita')) {
      return { action: 'call_handler', handlerName: 'vendedorReagendarCita' };
    }

    // ━━━ HOY ━━━
    if (msg === 'hoy' || msg === 'citas hoy' || msg === 'agenda hoy') {
      return { action: 'call_handler', handlerName: 'asesorCitasHoy' };
    }

    // ━━━ MAÑANA ━━━
    if (msg === 'mañana' || msg === 'manana' || msg === 'citas mañana' || msg === 'citas manana' || msg === 'agenda mañana') {
      return { action: 'call_handler', handlerName: 'asesorCitasMañana' };
    }

    // ━━━ SEMANA ━━━
    if (msg === 'semana' || msg === 'esta semana' || msg === 'citas semana') {
      return { action: 'call_handler', handlerName: 'asesorCitasSemana' };
    }

    // ━━━ REPORTE ━━━
    if (msg === 'reporte' || msg === 'mi reporte' || msg === 'stats' || msg === 'estadisticas' || msg === 'reporte semana' || msg === 'reporte semanal' || msg === 'reporte mes' || msg === 'reporte mensual') {
      return { action: 'call_handler', handlerName: 'asesorReporte' };
    }

    // ━━━ BRIDGE / CHAT DIRECTO ━━━
    // Formato: bridge [nombre] "mensaje opcional"
    const bridgeMatchConMensaje = bodyOriginal.match(/^(?:bridge|chat\s*directo|directo)\s+(\w+)\s+[""""](.+)[""""]$/i);
    if (bridgeMatchConMensaje) {
      const nombreLead = bridgeMatchConMensaje[1].trim();
      const mensajeInicial = bridgeMatchConMensaje[2].trim();
      return { action: 'call_handler', handlerName: 'bridgeLead', handlerParams: { nombreLead, mensajeInicial } };
    }

    const bridgeMatch = msg.match(/^(?:bridge|chat\s*directo|directo)\s+(.+)$/i);
    if (bridgeMatch) {
      const nombreLead = bridgeMatch[1].trim();
      return { action: 'call_handler', handlerName: 'bridgeLead', handlerParams: { nombreLead } };
    }

    // ━━━ EXTENDER BRIDGE ━━━
    if (msg === '#mas' || msg === '#más' || msg === '#continuar') {
      return { action: 'call_handler', handlerName: 'extenderBridge' };
    }

    // ━━━ CERRAR BRIDGE ━━━
    if (msg === '#cerrar' || msg === '#fin') {
      return { action: 'call_handler', handlerName: 'cerrarBridge' };
    }

    // No reconocido
    return { action: 'not_recognized', message: this.getMensajeNoReconocido(nombreAsesor) };
  }

  // Helper para detectar si es admin/CEO
  private isAdmin(role: string | undefined): boolean {
    if (!role) return false;
    const r = role.toLowerCase();
    return r.includes('ceo') || r.includes('admin') || r.includes('director') || r.includes('gerente') || r.includes('owner') || r.includes('dueño');
  }

  // ═══════════════════════════════════════════════════════════════════
  // EJECUTAR HANDLERS
  // ═══════════════════════════════════════════════════════════════════
  async executeHandler(handlerName: string, asesor: any, nombreAsesor: string, params: any): Promise<HandlerResult> {
    const esAdmin = this.isAdmin(asesor.role);
    console.log(`🔐 executeHandler: role=${asesor.role}, esAdmin=${esAdmin}`);

    switch (handlerName) {
      case 'asesorMisLeads':
        return await this.getMisLeads(asesor.id, nombreAsesor, esAdmin);

      case 'asesorStatusLead':
        return await this.getStatusLead(asesor.id, params.query, nombreAsesor, esAdmin);

      case 'asesorPedirDocs':
        return await this.pedirDocumentos(asesor.id, params.query, nombreAsesor, esAdmin);

      case 'asesorPreaprobado':
        return await this.notificarPreaprobado(asesor.id, params.query, nombreAsesor, esAdmin);

      case 'asesorRechazado':
        return await this.notificarRechazado(asesor.id, params.query, params.motivo, nombreAsesor, esAdmin);

      case 'asesorEnviarMensaje':
        return await this.enviarMensajeALead(asesor.id, params.query, params.mensaje, nombreAsesor, esAdmin);

      case 'asesorTelefonoLead':
        return await this.getTelefonoLead(asesor.id, params.query, nombreAsesor, esAdmin);

      case 'asesorActualizarLead':
        return await this.actualizarLead(asesor.id, params.query, params.campo, params.valor, nombreAsesor, esAdmin);

      case 'asesorMoverLead':
        return await this.moverLeadEnFunnel(asesor.id, params.query, params.direccion, nombreAsesor, esAdmin);

      case 'asesorDisponibilidad':
        return await this.cambiarDisponibilidad(asesor.id, params.estado, nombreAsesor);

      case 'asesorMarcarContactado':
        return await this.marcarContactado(asesor.id, params.query, nombreAsesor, esAdmin);

      case 'asesorCitasHoy':
        return await this.getCitasHoy(asesor.id, nombreAsesor);

      case 'asesorCitasMañana':
        return await this.getCitasMañana(asesor.id, nombreAsesor);

      case 'asesorCitasSemana':
        return await this.getCitasSemana(asesor.id, nombreAsesor);

      case 'asesorReporte':
        return await this.getReporte(asesor.id, nombreAsesor);

      case 'asesorDocsPendientes':
        return await this.getDocsPendientes(asesor.id, nombreAsesor, esAdmin);

      default:
        return { needsExternalHandler: true };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // MIS LEADS - Ver leads asignados al asesor
  // ═══════════════════════════════════════════════════════════════════
  private async getMisLeads(asesorId: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    try {
      console.log(`🔍 getMisLeads: asesorId=${asesorId}, esAdmin=${esAdmin}`);

      // Buscar leads
      const { data: allLeads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status, created_at, notes, assigned_to, asesor_banco_id')
        .order('created_at', { ascending: false })
        .limit(100);

      let misLeads: any[] = [];
      if (esAdmin) {
        // Admin ve todos los leads
        misLeads = allLeads || [];
      } else {
        // Asesor ve solo sus leads (check multiple fields)
        misLeads = allLeads?.filter(l => {
          // Check direct assignment
          if (l.assigned_to === asesorId) return true;
          // Check asesor_banco_id (set by vendedorPasarACredito)
          if (l.asesor_banco_id === asesorId) return true;
          // Check notes.credit_flow_context.asesor_id
          if (l.notes) {
            try {
              const notes = this.safeParseNotes(l.notes);
              if (notes?.credit_flow_context?.asesor_id === asesorId) return true;
            } catch {
              // ignore parse errors
            }
          }
          return false;
        }) || [];
      }

      console.log(`🔍 getMisLeads: found ${misLeads.length} leads for asesor ${asesorId}`);
      if (misLeads.length > 0) {
        console.log(`🔍 getMisLeads: leads = ${misLeads.map(l => l.name).join(', ')}`);
      }

      if (misLeads.length === 0) {
        return { message: `📋 *Tus Leads, ${nombreAsesor}*\n\nNo tienes leads asignados aún.\n\n💡 Los leads te llegarán cuando Sara conecte clientes interesados en crédito.` };
      }

      return { message: this.formatLeadsList(misLeads, nombreAsesor) };
    } catch (e) {
      console.error('Error getMisLeads:', e);
      return { error: '❌ Error al obtener leads' };
    }
  }

  private formatLeadsList(leads: any[], nombreAsesor: string): string {
    let msg = `📋 *Tus Leads, ${nombreAsesor}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;

    leads.forEach((lead, i) => {
      const status = this.getStatusEmoji(lead.status);
      const notes = this.safeParseNotes(lead.notes);
      const ctx = notes?.credit_flow_context;

      const banco = ctx?.banco_preferido || '—';
      const ingreso = ctx?.ingreso_mensual ? `$${ctx.ingreso_mensual.toLocaleString('es-MX')}` : '—';

      msg += `${i + 1}. ${status} *${lead.name}*\n`;
      msg += `   📱 ${formatPhoneForDisplay(lead.phone)}\n`;
      msg += `   🏦 ${banco} | 💰 ${ingreso}\n\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 Usa *STATUS [nombre]* para ver detalle`;

    return msg;
  }

  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'new': '🆕',
      'credit_qualified': '✅',
      'contacted': '📞',
      'documents_pending': '📄',
      'pre_approved': '🎉',
      'approved': '🏆',
      'rejected': '❌',
      'closed': '🔒'
    };
    return emojis[status] || '📌';
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATUS - Ver estado detallado de un lead
  // ═══════════════════════════════════════════════════════════════════
  private async getStatusLead(asesorId: string, query: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.\n\n💡 Usa *MIS LEADS* para ver tu lista.` };
    }

    const notes = this.safeParseNotes(lead.notes);
    const ctx: CreditFlowContext | undefined = notes?.credit_flow_context;

    let msg = `📊 *STATUS: ${lead.name}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📱 *Teléfono:* ${formatPhoneForDisplay(lead.phone)}\n`;
    msg += `📌 *Estado:* ${this.getStatusText(lead.status)}\n`;
    msg += `📅 *Registrado:* ${this.formatDate(lead.created_at)}\n\n`;

    if (ctx) {
      msg += `💰 *Datos Financieros:*\n`;
      msg += `├ Ingreso: ${ctx.ingreso_mensual ? `$${ctx.ingreso_mensual.toLocaleString('es-MX')}/mes` : 'No proporcionado'}\n`;
      msg += `├ Enganche: ${ctx.enganche ? `$${ctx.enganche.toLocaleString('es-MX')}` : 'No proporcionado'}\n`;
      msg += `├ Capacidad: ${ctx.capacidad_credito ? `$${ctx.capacidad_credito.toLocaleString('es-MX')}` : 'Por calcular'}\n`;
      msg += `└ Banco: ${ctx.banco_preferido || 'Por definir'}\n\n`;
      msg += `📞 *Modalidad:* ${ctx.modalidad || 'Por definir'}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 Comandos:\n`;
    msg += `• *DOCS ${lead.name?.split(' ')[0] || 'Lead'}* - Pedir documentos\n`;
    msg += `• *PREAPROBADO ${lead.name?.split(' ')[0] || 'Lead'}* - Notificar aprobación\n`;
    msg += `• *DILE ${lead.name?.split(' ')[0] || 'Lead'} que [mensaje]*`;

    return { message: msg };
  }

  private getStatusText(status: string): string {
    const texts: Record<string, string> = {
      'new': '🆕 Nuevo',
      'credit_qualified': '✅ Calificado',
      'contacted': '📞 Contactado',
      'documents_pending': '📄 Esperando docs',
      'pre_approved': '🎉 Pre-aprobado',
      'approved': '🏆 Aprobado',
      'rejected': '❌ Rechazado',
      'closed': '🔒 Cerrado'
    };
    return texts[status] || status;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOCS - Pedir documentos al lead
  // ═══════════════════════════════════════════════════════════════════
  private async pedirDocumentos(asesorId: string, query: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    // Actualizar status del lead
    await this.supabase.client
      .from('leads')
      .update({ status: 'documents_pending' })
      .eq('id', lead.id);

    // Sincronizar con mortgage_applications (para CRM)
    await this.syncMortgageApplication(lead, 'documents_pending', asesorId, nombreAsesor);

    const nombreCorto = lead.name?.split(' ')[0] || 'Lead';
    const mensajeParaLead = `¡Hola ${nombreCorto}! 👋

Tu asesor *${nombreAsesor}* está avanzando con tu trámite de crédito 🏠

Para continuar, necesitamos los siguientes documentos:

📄 *Documentos requeridos:*
1️⃣ Identificación oficial (INE vigente)
2️⃣ Comprobante de domicilio (no mayor a 3 meses)
3️⃣ Últimos 3 recibos de nómina
4️⃣ Estados de cuenta bancarios (últimos 3 meses)
5️⃣ Constancia de situación fiscal (SAT)

📸 Puedes enviarlos como *foto* o *PDF* por este chat.

¿Tienes alguna duda sobre los documentos? 🤔`;

    // Buscar vendedor asignado para notificarle (usar assigned_to como fallback)
    const notes = this.safeParseNotes(lead.notes);
    const ctx = notes?.credit_flow_context;
    let vendedorPhone: string | undefined;
    let vendedorMessage: string | undefined;

    const vendedorId = ctx?.vendedor_id || lead.assigned_to;
    if (vendedorId) {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('name, phone')
        .eq('id', vendedorId)
        .single();

      if (vendedor?.phone) {
        vendedorPhone = vendedor.phone;
        vendedorMessage = `📄 *Documentos solicitados*\n\nEl asesor ${nombreAsesor} solicitó documentos a tu cliente *${lead.name}*.\n\n📌 Status: Esperando documentos`;
      }
    }

    return {
      message: `✅ *Solicitud de documentos enviada*\n\n${nombreCorto} recibirá la lista de documentos requeridos.\n\n💡 Cuando envíe los docs, te notificaré.${vendedorPhone ? '\n✅ Vendedor notificado' : ''}`,
      leadPhone: lead.phone,
      leadMessage: mensajeParaLead,
      vendedorPhone,
      vendedorMessage
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PREAPROBADO - Notificar pre-aprobación al lead
  // ═══════════════════════════════════════════════════════════════════
  private async notificarPreaprobado(asesorId: string, query: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    // Actualizar status
    await this.supabase.client
      .from('leads')
      .update({ status: 'pre_approved' })
      .eq('id', lead.id);

    // Sincronizar con mortgage_applications (para CRM)
    await this.syncMortgageApplication(lead, 'pre_approved', asesorId, nombreAsesor);

    const nombreCorto = lead.name?.split(' ')[0] || 'Lead';
    const notes = this.safeParseNotes(lead.notes);
    const ctx = notes?.credit_flow_context;
    const banco = ctx?.banco_preferido || 'el banco';

    const mensajeParaLead = `🎉 *¡EXCELENTES NOTICIAS, ${nombreCorto.toUpperCase()}!* 🎉

¡Tu crédito ha sido *PRE-APROBADO* por ${banco}! 🏦✨

Tu asesor *${nombreAsesor}* se pondrá en contacto contigo para los siguientes pasos.

🏠 ¡Estás cada vez más cerca de tu nuevo hogar!

¿Tienes alguna pregunta? Estoy aquí para ayudarte 😊`;

    // Buscar vendedor asignado para notificarle (usar assigned_to como fallback)
    let vendedorPhone: string | undefined;
    let vendedorMessage: string | undefined;

    const vendedorId = ctx?.vendedor_id || lead.assigned_to;
    if (vendedorId) {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('name, phone')
        .eq('id', vendedorId)
        .single();

      if (vendedor?.phone) {
        vendedorPhone = vendedor.phone;
        vendedorMessage = `🎉 *¡CRÉDITO PRE-APROBADO!*\n\nTu cliente *${lead.name}* fue pre-aprobado para crédito hipotecario.\n\n🏦 Banco: ${banco}\n👤 Asesor: ${nombreAsesor}\n\n¡Felicidades! Prepara la siguiente fase.`;
      }
    }

    return {
      message: `✅ *Pre-aprobación notificada*\n\n${nombreCorto} ha sido informado de su pre-aprobación 🎉\n\nStatus actualizado a: *Pre-aprobado*${vendedorPhone ? '\n✅ Vendedor notificado' : ''}`,
      leadPhone: lead.phone,
      leadMessage: mensajeParaLead,
      vendedorPhone,
      vendedorMessage
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // RECHAZADO - Notificar rechazo al lead
  // ═══════════════════════════════════════════════════════════════════
  private async notificarRechazado(asesorId: string, query: string, motivo: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    // Actualizar status
    await this.supabase.client
      .from('leads')
      .update({ status: 'rejected' })
      .eq('id', lead.id);

    // Sincronizar con mortgage_applications (para CRM)
    await this.syncMortgageApplication(lead, 'rejected', asesorId, nombreAsesor);

    const nombreCorto = lead.name?.split(' ')[0] || 'Lead';

    // Categorizar motivo de rechazo
    const motivoLower = motivo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let rejectionCategory: string;
    if (/buro|buró|historial.?credit|score.?bajo/i.test(motivoLower)) {
      rejectionCategory = 'buro_crediticio';
    } else if (/ingreso|sueldo|capacidad.?pago|no.?alcanza|insuficiente/i.test(motivoLower)) {
      rejectionCategory = 'ingresos_insuficientes';
    } else if (/document|papeles|falta|incompleto|comprobante/i.test(motivoLower)) {
      rejectionCategory = 'documentacion_incompleta';
    } else if (/deuda|endeud|pasivo|adeudo/i.test(motivoLower)) {
      rejectionCategory = 'deuda_excesiva';
    } else {
      rejectionCategory = 'otro';
    }

    // Consejos específicos por categoría
    const consejosPorCategoria: Record<string, string> = {
      buro_crediticio: `Te recomendamos:
• Revisar tu reporte de buró en www.burodecredito.com.mx
• Pagar deudas pendientes pequeñas para mejorar tu score
• Evitar solicitar nuevos créditos por 3-6 meses
• Hay bancos con criterios más flexibles que podemos explorar`,
      ingresos_insuficientes: `Te recomendamos:
• Explorar opciones de co-acreditado (esposo/a, familiar)
• Considerar un modelo de vivienda con precio menor
• Revisar opciones de crédito con enganche mayor
• Algunos bancos aceptan ingresos combinados`,
      documentacion_incompleta: `La buena noticia es que esto tiene solución rápida:
• Reúne los documentos que te pidieron
• Tu asesor puede indicarte exactamente qué falta
• Una vez completa la documentación, se puede re-enviar
• No necesitas esperar, actúa pronto`,
      deuda_excesiva: `Te recomendamos:
• Enfocarte en reducir deudas actuales
• Consolidar deudas si es posible
• Revisar opciones de financiamiento directo con la constructora
• Intentar nuevamente cuando tu nivel de endeudamiento baje`,
      otro: `Te recomendamos:
• Revisar tu historial crediticio
• Mejorar tu capacidad de pago
• Intentar nuevamente en 3-6 meses`
    };

    const consejo = consejosPorCategoria[rejectionCategory] || consejosPorCategoria.otro;

    const mensajeParaLead = `Hola ${nombreCorto} 👋

Tu asesor *${nombreAsesor}* me pidió informarte sobre tu solicitud de crédito.

Lamentablemente, en esta ocasión no fue posible aprobar tu crédito.

📋 *Motivo:* ${motivo}

Esto no significa que no puedas obtener un crédito en el futuro.

${consejo}

Si tienes preguntas, tu asesor está disponible para orientarte.

¡No te desanimes! 💪`;

    // Guardar mortgage_recovery en notas del lead
    const notes = this.safeParseNotes(lead.notes);
    const retryDate = new Date();
    retryDate.setDate(retryDate.getDate() + 30);
    notes.mortgage_recovery = {
      rejected_at: new Date().toISOString(),
      rejection_category: rejectionCategory,
      bank_rejected: motivo,
      recovery_step: 'initial',
      alternatives_sent: false,
      retry_eligible_at: retryDate.toISOString()
    };
    await this.supabase.client
      .from('leads')
      .update({ notes })
      .eq('id', lead.id);

    // Buscar vendedor asignado para notificarle (usar assigned_to como fallback)
    const ctx = notes?.credit_flow_context;
    let vendedorPhone: string | undefined;
    let vendedorMessage: string | undefined;

    const vendedorId = ctx?.vendedor_id || lead.assigned_to;
    if (vendedorId) {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('name, phone')
        .eq('id', vendedorId)
        .single();

      if (vendedor?.phone) {
        vendedorPhone = vendedor.phone;
        vendedorMessage = `❌ *Crédito no aprobado*\n\nTu cliente *${lead.name}* no fue aprobado para crédito.\n\n📋 Motivo: ${motivo}\n👤 Asesor: ${nombreAsesor}\n\nPuedes explorar otras opciones con el cliente.`;
      }
    }

    return {
      message: `✅ *Lead notificado del rechazo*\n\n${nombreCorto} ha sido informado.\nMotivo: ${motivo}\n\nStatus: *Rechazado*${vendedorPhone ? '\n✅ Vendedor notificado' : ''}`,
      leadPhone: lead.phone,
      leadMessage: mensajeParaLead,
      vendedorPhone,
      vendedorMessage
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ENVIAR MENSAJE - Puente asesor → lead
  // ═══════════════════════════════════════════════════════════════════
  private async enviarMensajeALead(asesorId: string, query: string, mensaje: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    const nombreCorto = lead.name?.split(' ')[0] || 'Lead';
    const mensajeParaLead = `💬 *Mensaje de tu asesor ${nombreAsesor}:*\n\n"${mensaje}"\n\n_Puedes responder aquí y le haré llegar tu mensaje._`;

    // Guardar en notas del asesor que hay un mensaje pendiente de respuesta
    const { data: asesorData } = await this.supabase.client
      .from('team_members')
      .select('notes')
      .eq('id', asesorId)
      .single();

    let notes: any = this.safeParseNotes(asesorData?.notes);

    notes.pending_lead_response = {
      lead_id: lead.id,
      lead_name: lead.name,
      lead_phone: lead.phone,
      mensaje_enviado: mensaje,
      timestamp: new Date().toISOString()
    };

    await this.supabase.client
      .from('team_members')
      .update({ notes })
      .eq('id', asesorId);

    return {
      message: `✅ *Mensaje enviado a ${nombreCorto}*\n\n"${mensaje}"\n\n💡 Cuando responda, te notificaré.`,
      leadPhone: lead.phone,
      leadMessage: mensajeParaLead
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TELÉFONO - Obtener teléfono del lead
  // ═══════════════════════════════════════════════════════════════════
  private async getTelefonoLead(asesorId: string, query: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    const phone = formatPhoneForDisplay(lead.phone);
    return {
      message: `📱 *${lead.name}*\n\nTeléfono: ${phone}\n\nwa.me/${formatPhoneForDisplay(lead.phone).replace('+', '')}`
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ACTUALIZAR - Actualizar campo del lead
  // ═══════════════════════════════════════════════════════════════════
  private async actualizarLead(asesorId: string, query: string, campo: string, valor: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    const camposPermitidos: Record<string, string> = {
      'status': 'status',
      'estado': 'status',
      'banco': 'banco_preferido',
      'ingreso': 'ingreso_mensual',
      'enganche': 'enganche'
    };

    const campoReal = camposPermitidos[campo.toLowerCase()];
    if (!campoReal) {
      return { message: `❌ Campo "${campo}" no reconocido.\n\nCampos válidos: status, banco, ingreso, enganche` };
    }

    // Si es campo en notas (credit_flow_context)
    if (['banco_preferido', 'ingreso_mensual', 'enganche'].includes(campoReal)) {
      const notes = this.safeParseNotes(lead.notes);
      if (!notes.credit_flow_context) notes.credit_flow_context = {};

      if (campoReal === 'ingreso_mensual' || campoReal === 'enganche') {
        notes.credit_flow_context[campoReal] = parseInt(valor.replace(/\D/g, ''));
      } else {
        notes.credit_flow_context[campoReal] = valor;
      }

      await this.supabase.client.from('leads').update({ notes }).eq('id', lead.id);
    } else {
      // Campo directo en leads
      await this.supabase.client.from('leads').update({ [campoReal]: valor }).eq('id', lead.id);
    }

    return { message: `✅ *${lead.name}* actualizado\n\n${campo} → ${valor}` };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CITAS HOY
  // ═══════════════════════════════════════════════════════════════════
  private async getCitasHoy(asesorId: string, nombreAsesor: string): Promise<HandlerResult> {
    const hoy = new Date().toISOString().split('T')[0];

    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .eq('team_member_id', asesorId)
      .gte('date', hoy)
      .lt('date', hoy + 'T23:59:59')
      .order('date', { ascending: true });

    if (!citas || citas.length === 0) {
      return { message: `📅 *Citas de hoy, ${nombreAsesor}*\n\nNo tienes citas programadas para hoy.` };
    }

    let msg = `📅 *Citas de hoy, ${nombreAsesor}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    citas.forEach((c, i) => {
      const hora = new Date(c.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      msg += `${i + 1}. ⏰ *${hora}*\n`;
      msg += `   👤 ${c.leads?.name || 'Sin nombre'}\n`;
      msg += `   📍 ${c.location || 'Por definir'}\n\n`;
    });

    return { message: msg };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CITAS MAÑANA
  // ═══════════════════════════════════════════════════════════════════
  private async getCitasMañana(asesorId: string, nombreAsesor: string): Promise<HandlerResult> {
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    const mañanaStr = mañana.toISOString().split('T')[0];

    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .eq('team_member_id', asesorId)
      .gte('date', mañanaStr)
      .lt('date', mañanaStr + 'T23:59:59')
      .order('date', { ascending: true });

    if (!citas || citas.length === 0) {
      return { message: `📅 *Citas de mañana, ${nombreAsesor}*\n\nNo tienes citas programadas para mañana.` };
    }

    let msg = `📅 *Citas de mañana, ${nombreAsesor}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    citas.forEach((c, i) => {
      const hora = new Date(c.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      msg += `${i + 1}. ⏰ *${hora}*\n`;
      msg += `   👤 ${c.leads?.name || 'Sin nombre'}\n`;
      msg += `   📍 ${c.location || 'Por definir'}\n\n`;
    });

    return { message: msg };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CITAS SEMANA
  // ═══════════════════════════════════════════════════════════════════
  private async getCitasSemana(asesorId: string, nombreAsesor: string): Promise<HandlerResult> {
    const hoy = new Date();
    const finSemana = new Date(hoy);
    finSemana.setDate(hoy.getDate() + 7);

    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .eq('team_member_id', asesorId)
      .gte('date', hoy.toISOString())
      .lt('date', finSemana.toISOString())
      .order('date', { ascending: true });

    if (!citas || citas.length === 0) {
      return { message: `📅 *Esta semana, ${nombreAsesor}*\n\nNo tienes citas programadas.` };
    }

    let msg = `📅 *Citas esta semana, ${nombreAsesor}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    citas.forEach((c, i) => {
      const fecha = new Date(c.date);
      const dia = fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
      const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      msg += `${i + 1}. 📆 *${dia}* ${hora}\n`;
      msg += `   👤 ${c.leads?.name || 'Sin nombre'}\n\n`;
    });

    return { message: msg };
  }

  // ═══════════════════════════════════════════════════════════════════
  // REPORTE
  // ═══════════════════════════════════════════════════════════════════
  private async getReporte(asesorId: string, nombreAsesor: string): Promise<HandlerResult> {
    // Contar leads por status
    const { data: allLeads } = await this.supabase.client
      .from('leads')
      .select('id, status, notes')
      .not('notes', 'is', null);

    const misLeads = allLeads?.filter(l => {
      const notes = this.safeParseNotes(l.notes);
      return notes?.credit_flow_context?.asesor_id === asesorId;
    }) || [];

    const stats = {
      total: misLeads.length,
      nuevos: misLeads.filter(l => l.status === 'new' || l.status === 'credit_qualified').length,
      enProceso: misLeads.filter(l => ['contacted', 'documents_pending'].includes(l.status)).length,
      preAprobados: misLeads.filter(l => l.status === 'pre_approved').length,
      aprobados: misLeads.filter(l => l.status === 'approved').length,
      rechazados: misLeads.filter(l => l.status === 'rejected').length
    };

    let msg = `📊 *Tu Reporte, ${nombreAsesor}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `👥 Total leads: *${stats.total}*\n\n`;
    msg += `🆕 Nuevos: ${stats.nuevos}\n`;
    msg += `⏳ En proceso: ${stats.enProceso}\n`;
    msg += `🎉 Pre-aprobados: ${stats.preAprobados}\n`;
    msg += `🏆 Aprobados: ${stats.aprobados}\n`;
    msg += `❌ Rechazados: ${stats.rechazados}\n`;
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📈 Conversión: ${stats.total > 0 ? Math.round((stats.aprobados / stats.total) * 100) : 0}%`;

    return { message: msg };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOCS PENDIENTES - Ver leads esperando documentos
  // ═══════════════════════════════════════════════════════════════════
  private async getDocsPendientes(asesorId: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    try {
      // Buscar mortgage_applications con status docs_requested
      const { data: solicitudes } = await this.supabase.client
        .from('mortgage_applications')
        .select('id, lead_id, lead_name, lead_phone, status, docs_requested_at, documents_received, created_at')
        .eq('status', 'docs_requested')
        .eq(esAdmin ? 'status' : 'asesor_id', esAdmin ? 'docs_requested' : asesorId)
        .order('docs_requested_at', { ascending: true });

      if (!solicitudes || solicitudes.length === 0) {
        return { message: `📄 *Documentos Pendientes, ${nombreAsesor}*\n\nNo hay leads esperando documentos.\n\n💡 Usa *DOCS [nombre]* para solicitar documentos a un lead.` };
      }

      let msg = `📄 *Documentos Pendientes, ${nombreAsesor}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;

      for (const sol of solicitudes) {
        const diasEsperando = sol.docs_requested_at
          ? Math.floor((Date.now() - new Date(sol.docs_requested_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        const docsRecibidos = sol.documents_received || [];
        const docsFaltantes = this.getDocumentosFaltantes(docsRecibidos);

        const emoji = diasEsperando > 3 ? '🔴' : diasEsperando > 1 ? '🟡' : '🟢';

        msg += `${emoji} *${sol.lead_name || 'Sin nombre'}*\n`;
        msg += `   📱 ${formatPhoneForDisplay(sol.lead_phone)}\n`;
        msg += `   ⏱️ Esperando hace ${diasEsperando} día${diasEsperando !== 1 ? 's' : ''}\n`;

        if (docsFaltantes.length > 0) {
          msg += `   📋 Faltan: ${docsFaltantes.slice(0, 3).join(', ')}${docsFaltantes.length > 3 ? '...' : ''}\n`;
        }
        msg += `\n`;
      }

      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📊 Total: ${solicitudes.length} lead${solicitudes.length !== 1 ? 's' : ''} esperando docs\n\n`;
      msg += `💡 *Acciones:*\n`;
      msg += `• *llamar [nombre]* - Ver teléfono\n`;
      msg += `• *dile [nombre] que...* - Enviar recordatorio`;

      return { message: msg };
    } catch (e) {
      console.error('Error getDocsPendientes:', e);
      return { error: '❌ Error al obtener documentos pendientes' };
    }
  }

  private getDocumentosFaltantes(recibidos: string[]): string[] {
    const todosLosDocumentos = [
      'INE/IFE',
      'Comprobante domicilio',
      'Últimos 3 recibos nómina',
      'Estados cuenta (3 meses)',
      'Constancia situación fiscal',
      'CURP',
      'Acta nacimiento'
    ];

    return todosLosDocumentos.filter(doc =>
      !recibidos.some(r => r.toLowerCase().includes(doc.toLowerCase().split('/')[0]))
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // MOVER LEAD EN FUNNEL (adelante/atrás)
  // ═══════════════════════════════════════════════════════════════════
  private async moverLeadEnFunnel(asesorId: string, query: string, direccion: 'next' | 'prev', nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    // Funnel de crédito hipotecario
    const funnel = [
      { key: 'new', label: '🆕 Nuevo' },
      { key: 'credit_qualified', label: '✅ Calificado' },
      { key: 'contacted', label: '📞 Contactado' },
      { key: 'documents_pending', label: '📄 Esperando docs' },
      { key: 'pre_approved', label: '🎉 Pre-aprobado' },
      { key: 'approved', label: '🏆 Aprobado' }
    ];

    let currentIndex = funnel.findIndex(f => f.key === lead.status);

    // Manejar status especiales (rejected puede volver al funnel)
    if (currentIndex === -1) {
      if (lead.status === 'rejected' && direccion === 'prev') {
        // Si está rechazado y quiere ir atrás, lo movemos a "pre_approved" o "documents_pending"
        currentIndex = funnel.findIndex(f => f.key === 'pre_approved');
        if (currentIndex === -1) currentIndex = funnel.length - 1;
      } else {
        return { message: `⚠️ Status actual (${lead.status}) no está en el funnel de crédito.` };
      }
    }

    let newIndex: number;
    if (direccion === 'next') {
      newIndex = Math.min(currentIndex + 1, funnel.length - 1);
      if (newIndex === currentIndex) {
        return { message: `✅ ${lead.name} ya está en el último paso: ${funnel[currentIndex].label}` };
      }
    } else {
      newIndex = Math.max(currentIndex - 1, 0);
      if (newIndex === currentIndex) {
        return { message: `✅ ${lead.name} ya está en el primer paso: ${funnel[currentIndex].label}` };
      }
    }

    const newStatus = funnel[newIndex];

    await this.supabase.client
      .from('leads')
      .update({ status: newStatus.key })
      .eq('id', lead.id);

    // Sincronizar con mortgage_applications (para CRM)
    await this.syncMortgageApplication(lead, newStatus.key, asesorId, nombreAsesor);

    // Buscar vendedor asignado para notificarle
    const notes = this.safeParseNotes(lead.notes);
    const ctx = notes?.credit_flow_context;
    let vendedorPhone: string | undefined;
    let vendedorMessage: string | undefined;

    // Usar vendedor_id de credit_flow_context, o assigned_to del lead
    const vendedorId = ctx?.vendedor_id || lead.assigned_to;
    console.log(`🔍 moverLead: vendedor_id=${vendedorId}, ctx.vendedor_id=${ctx?.vendedor_id}, assigned_to=${lead.assigned_to}`);

    let vendedorDentro24h = false;
    if (vendedorId) {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('name, phone, last_sara_interaction')
        .eq('id', vendedorId)
        .single();

      console.log(`🔍 moverLead: vendedor encontrado = ${vendedor?.name}, phone=${vendedor?.phone}`);

      if (vendedor?.phone) {
        vendedorPhone = vendedor.phone;
        const flecha = direccion === 'next' ? '⬆️' : '⬇️';
        vendedorMessage = `${flecha} *Actualización de crédito*\n\nTu cliente *${lead.name}* cambió de etapa:\n\n📍 *De:* ${funnel[currentIndex].label}\n📍 *A:* ${newStatus.label}\n\n👤 Asesor: ${nombreAsesor}`;

        // Verificar ventana 24h
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        vendedorDentro24h = vendedor.last_sara_interaction && vendedor.last_sara_interaction > hace24h;
        console.log(`🔍 moverLead: last_sara_interaction=${vendedor.last_sara_interaction}, dentro24h=${vendedorDentro24h}`);
      }
    }

    const flecha = direccion === 'next' ? '➡️' : '⬅️';
    return {
      message: `${flecha} *${lead.name}* movido:\n\n📍 *De:* ${funnel[currentIndex].label}\n📍 *A:* ${newStatus.label}${vendedorPhone ? '\n\n✅ Vendedor notificado' : ''}`,
      vendedorPhone,
      vendedorMessage,
      vendedorDentro24h
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ON/OFF - Cambiar disponibilidad del asesor
  // ═══════════════════════════════════════════════════════════════════
  private async cambiarDisponibilidad(asesorId: string, estado: boolean, nombreAsesor: string): Promise<HandlerResult> {
    await this.supabase.client
      .from('team_members')
      .update({ is_on_duty: estado })
      .eq('id', asesorId);

    if (estado) {
      return {
        message: `✅ *Disponibilidad activada*\n\n${nombreAsesor}, ahora recibirás nuevos leads de crédito.\n\n💡 Escribe *OFF* para pausar.`
      };
    } else {
      return {
        message: `⏸️ *Disponibilidad pausada*\n\n${nombreAsesor}, no recibirás nuevos leads por ahora.\n\n💡 Escribe *ON* cuando estés listo.`
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // MARCAR COMO CONTACTADO
  // ═══════════════════════════════════════════════════════════════════
  private async marcarContactado(asesorId: string, query: string, nombreAsesor: string, esAdmin: boolean = false): Promise<HandlerResult> {
    const lead = await this.buscarLeadDeAsesor(asesorId, query, esAdmin);

    if (!lead) {
      return { message: `❌ No encontré a "${query}" en tus leads.` };
    }

    await this.supabase.client
      .from('leads')
      .update({ status: 'contacted' })
      .eq('id', lead.id);

    // Sincronizar con mortgage_applications (para CRM)
    await this.syncMortgageApplication(lead, 'contacted', asesorId, nombreAsesor);

    // Buscar vendedor asignado para notificarle (usar assigned_to como fallback)
    const notes = this.safeParseNotes(lead.notes);
    const ctx = notes?.credit_flow_context;
    let vendedorPhone: string | undefined;
    let vendedorMessage: string | undefined;

    const vendedorId = ctx?.vendedor_id || lead.assigned_to;
    if (vendedorId) {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('name, phone')
        .eq('id', vendedorId)
        .single();

      if (vendedor?.phone) {
        vendedorPhone = vendedor.phone;
        vendedorMessage = `📞 *Cliente contactado*\n\nEl asesor ${nombreAsesor} contactó a tu cliente *${lead.name}*.\n\n📌 Status: Contactado`;
      }
    }

    return {
      message: `📞 *${lead.name}* marcado como *CONTACTADO*\n\n💡 Siguiente: *DOCS ${lead.name?.split(' ')[0] || 'Lead'}* para pedir documentos${vendedorPhone ? '\n✅ Vendedor notificado' : ''}`,
      vendedorPhone,
      vendedorMessage
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════
  private async buscarLeadDeAsesor(asesorId: string, query: string, esAdmin: boolean = false): Promise<any | null> {
    const queryLower = query.toLowerCase().trim();
    const queryDigits = query.replace(/\D/g, '');
    console.log(`🔍 buscarLead: asesorId=${asesorId}, query="${query}", esAdmin=${esAdmin}`);

    // Buscar todos los leads
    const { data: allLeads } = await this.supabase.client
      .from('leads')
      .select('*');

    let misLeads: any[] = [];

    if (esAdmin) {
      // Admin/CEO puede ver TODOS los leads
      misLeads = allLeads || [];
    } else {
      // Asesor solo ve sus leads (check multiple fields)
      misLeads = allLeads?.filter(l => {
        // Check direct assignment
        if (l.assigned_to === asesorId) return true;
        // Check asesor_banco_id (set by vendedorPasarACredito)
        if (l.asesor_banco_id === asesorId) return true;
        // Check notes.credit_flow_context.asesor_id
        const notes = this.safeParseNotes(l.notes);
        if (notes?.credit_flow_context?.asesor_id === asesorId) return true;
        return false;
      }) || [];
    }

    console.log(`🔍 buscarLead: found ${misLeads.length} leads ${esAdmin ? '(admin mode)' : 'for asesor'}`);
    if (misLeads.length > 0 && misLeads.length <= 10) {
      console.log(`🔍 buscarLead: leads = ${misLeads.map(l => l.name).join(', ')}`);
    }

    // Buscar por nombre o teléfono
    const found = misLeads.find(l => {
      const nombreMatch = l.name?.toLowerCase().includes(queryLower);
      const telefonoMatch = queryDigits.length >= 4 && l.phone?.includes(queryDigits);
      return nombreMatch || telefonoMatch;
    }) || null;

    console.log(`🔍 buscarLead: Resultado para "${query}" = ${found ? found.name : 'NO ENCONTRADO'}`);
    return found;
  }

  private formatPhone(phone: string): string {
    if (!phone) return 'No disponible';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    if (digits.length === 12 && digits.startsWith('52')) {
      return `+52 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
    return phone;
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // MENSAJES PREDEFINIDOS
  // ═══════════════════════════════════════════════════════════════════
  getMensajeAyuda(nombre: string): string {
    return `🏦 *Comandos de Asesor, ${nombre}*
━━━━━━━━━━━━━━━━━━━━

📋 *Ver Leads:*
• *MIS LEADS* - Ver todos tus leads
• *STATUS [nombre]* - Ver detalle de un lead
• *LLAMAR [nombre]* - Ver teléfono

💬 *Comunicación:*
• *DILE [nombre] que [msg]* - Enviar mensaje vía Sara
• *DOCS [nombre]* - Pedir documentos
• *PREAPROBADO [nombre]* - Notificar aprobación
• *RECHAZADO [nombre] [motivo]* - Notificar rechazo

🔄 *Mover en Funnel:*
• *ADELANTE [nombre]* - Avanzar al siguiente paso
• *ATRAS [nombre]* - Regresar al paso anterior
• *CONTACTADO [nombre]* - Marcar como contactado

📅 *Agenda:*
• *HOY* - Ver citas de hoy
• *MAÑANA* - Ver citas de mañana
• *SEMANA* - Ver citas de la semana

📊 *Reportes:*
• *REPORTE* - Ver tus estadísticas

⚡ *Disponibilidad:*
• *ON* - Activar para recibir leads
• *OFF* - Pausar nuevos leads

━━━━━━━━━━━━━━━━━━━━
💡 Ejemplo: *ADELANTE Juan*`;
  }

  getMensajeNoReconocido(nombre: string): string {
    return `🤔 No entendí ese comando, ${nombre}.

💡 Escribe *AYUDA* para ver los comandos disponibles.

Comandos rápidos:
• *MIS LEADS*
• *STATUS [nombre]*
• *DOCS [nombre]*`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MÉTODOS LEGACY (para compatibilidad con handler existente)
  // ═══════════════════════════════════════════════════════════════════
  formatVendedorNoEncontrado(nombre: string, teamMembers: any[]): string {
    return `Vendedor ${nombre} no encontrado`;
  }

  async processPendingLeadSelection(asesorId: string, mensaje: string, notes: any): Promise<{ handled: boolean; respuesta?: string }> {
    // Si hay selección pendiente de lead (cuando hay múltiples coincidencias)
    if (notes?.pending_lead_selection) {
      const selection = parseInt(mensaje);
      if (!isNaN(selection) && selection > 0 && selection <= notes.pending_lead_selection.leads.length) {
        const selectedLead = notes.pending_lead_selection.leads[selection - 1];

        // Limpiar selección pendiente
        delete notes.pending_lead_selection;
        await this.supabase.client.from('team_members').update({ notes }).eq('id', asesorId);

        return {
          handled: true,
          respuesta: `✅ Seleccionaste a *${selectedLead.name}*\n\n¿Qué quieres hacer?\n• STATUS ${selectedLead.name?.split(' ')[0] || 'Lead'}\n• DOCS ${selectedLead.name?.split(' ')[0] || 'Lead'}\n• DILE ${selectedLead.name?.split(' ')[0] || 'Lead'} que...`
        };
      }
    }
    return { handled: false };
  }

  async getPendingVendorQuestion(asesorId: string): Promise<any | null> {
    const { data } = await this.supabase.client
      .from('solicitudes_hipoteca')
      .select('*')
      .eq('asesor_id', asesorId)
      .eq('pending_asesor_response', true)
      .limit(1)
      .single();

    if (data) {
      const { data: asesorData } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', asesorId)
        .single();

      return { solicitud: data, notes: asesorData?.notes };
    }
    return null;
  }

  async processPendingVendorQuestion(solicitudId: string, respuesta: string, asesorName: string, leadName: string, status: string): Promise<{ mensajeVendedor: string; confirmacion: string }> {
    await this.supabase.client
      .from('solicitudes_hipoteca')
      .update({
        pending_asesor_response: false,
        asesor_notes: respuesta,
        updated_at: new Date().toISOString()
      })
      .eq('id', solicitudId);

    return {
      mensajeVendedor: `💬 *Respuesta de ${asesorName}* sobre ${leadName}:\n\n"${respuesta}"`,
      confirmacion: `✅ Respuesta enviada al vendedor.`
    };
  }

  parseCrearLeadHipoteca(body: string): { nombre: string; telefono: string; nombreVendedor?: string } | null {
    // nuevo Juan Garcia 5512345678 para Edson
    const match = body.match(/^(?:nuevo|crear|agregar)\s+(.+?)\s+(\d{10,})\s*(?:para\s+(.+))?$/i);
    if (match) {
      return {
        nombre: match[1].trim(),
        telefono: match[2],
        nombreVendedor: match[3]?.trim()
      };
    }
    return null;
  }

  getMensajeAyudaCrearLeadHipoteca(): string {
    return `📝 *Formato para crear lead:*

NUEVO [nombre] [teléfono] para [vendedor]

Ejemplo:
*nuevo Juan Garcia 5512345678 para Edson*

O sin vendedor (se asigna automáticamente):
*nuevo Maria Lopez 5598765432*`;
  }

  async verificarLeadExistente(telefono: string): Promise<{ existe: boolean; lead?: any }> {
    const digits = telefono.replace(/\D/g, '').slice(-10);
    const { data: lead } = await this.supabase.client
      .from('leads')
      .select('*')
      .like('phone', `%${digits}`)
      .single();

    return { existe: !!lead, lead };
  }

  formatLeadYaExiste(lead: any): string {
    return `⚠️ *Lead ya existe*\n\n👤 ${lead.name}\n📱 ${formatPhoneForDisplay(lead.phone)}\n📌 Status: ${lead.status}`;
  }

  async crearLeadHipotecario(
    nombreLead: string,
    telefono: string,
    vendedorId: string,
    vendedorName: string,
    asesorId: string,
    asesorName: string
  ): Promise<{ lead?: any; error?: string }> {
    try {
      const phoneFormatted = telefono.replace(/\D/g, '');
      const { data: lead, error } = await this.supabase.client
        .from('leads')
        .insert({
          name: nombreLead,
          phone: phoneFormatted,
          source: 'asesor_manual',
          status: 'new',
          assigned_to: vendedorId,
          notes: JSON.stringify({ created_by_asesor: asesorId, asesor_name: asesorName, vendedor_name: vendedorName }),
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) return { error: error.message };
      return { lead };
    } catch (e: any) {
      return { error: e.message || 'Error al crear lead' };
    }
  }

  getVendedorRoundRobin(teamMembers: any[]): any {
    const vendedores = teamMembers.filter((tm: any) => tm.role === 'vendedor' && tm.active);
    if (vendedores.length === 0) return null;
    return vendedores[Math.floor(Math.random() * vendedores.length)];
  }

  buscarVendedorPorNombre(teamMembers: any[], nombre: string): any[] {
    const nombreLower = nombre.toLowerCase();
    return teamMembers.filter((tm: any) =>
      tm.role === 'vendedor' && tm.active && tm.name?.toLowerCase().includes(nombreLower)
    );
  }

  formatNotificacionVendedorNuevoLead(nombreLead: string, telefono: string, asesorName: string): string {
    return `📋 *Nuevo lead de crédito*\n\n👤 ${nombreLead}\n📱 ${formatPhoneForDisplay(telefono)}\n🏦 Asignado por: ${asesorName}`;
  }

  formatLeadHipotecaCreado(nombreLead: string, telefono: string, vendedorName: string, roundRobin: boolean): string {
    return `✅ *Lead creado*\n\n👤 ${nombreLead}\n📱 ${formatPhoneForDisplay(telefono)}\n👨‍💼 Vendedor: ${vendedorName}${roundRobin ? ' (asignado automáticamente)' : ''}`;
  }

  parseAgendarCita(body: string): { nombre: string; fecha: string; hora: string; lugar?: string } | null {
    // Formatos soportados:
    // cita Juan Garcia mañana 10am en oficina
    // cita Maria Lopez 25 enero 3pm
    // agendar Pedro Ramirez lunes 11:00

    const msg = body.toLowerCase().trim();

    // Regex para extraer partes
    const match = msg.match(/^(?:cita|agendar)\s+([a-záéíóúñ\s]+?)\s+(hoy|mañana|pasado\s*mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\d{1,2}(?:\s+de)?\s*(?:ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?|\d{1,2}))\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:en\s+(.+))?$/i);

    if (!match) return null;

    const [, nombreRaw, fechaRaw, horaRaw, lugarRaw] = match;

    // Capitalizar nombre
    const nombre = nombreRaw.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Parsear fecha
    const hoy = new Date();
    let fecha: Date;

    const fechaLower = fechaRaw.toLowerCase().trim();
    if (fechaLower === 'hoy') {
      fecha = hoy;
    } else if (fechaLower === 'mañana') {
      fecha = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
    } else if (fechaLower.includes('pasado')) {
      fecha = new Date(hoy.getTime() + 48 * 60 * 60 * 1000);
    } else {
      // Día de la semana o fecha específica
      const dias: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6 };
      if (dias[fechaLower] !== undefined) {
        const targetDay = dias[fechaLower];
        const currentDay = hoy.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        fecha = new Date(hoy.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      } else {
        // Intenta parsear fecha específica
        fecha = new Date(fechaRaw);
        if (isNaN(fecha.getTime())) fecha = hoy;
      }
    }

    // Parsear hora
    let hora = horaRaw.toLowerCase().replace(/\s/g, '');
    const pmMatch = hora.match(/(\d{1,2})(?::(\d{2}))?pm/);
    const amMatch = hora.match(/(\d{1,2})(?::(\d{2}))?am/);

    let hours = 10, minutes = 0;
    if (pmMatch) {
      hours = parseInt(pmMatch[1]);
      if (hours !== 12) hours += 12;
      minutes = pmMatch[2] ? parseInt(pmMatch[2]) : 0;
    } else if (amMatch) {
      hours = parseInt(amMatch[1]);
      if (hours === 12) hours = 0;
      minutes = amMatch[2] ? parseInt(amMatch[2]) : 0;
    } else {
      const numMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
      if (numMatch) {
        hours = parseInt(numMatch[1]);
        minutes = numMatch[2] ? parseInt(numMatch[2]) : 0;
      }
    }

    const horaFormateada = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const fechaFormateada = fecha.toISOString().split('T')[0];

    return {
      nombre,
      fecha: fechaFormateada,
      hora: horaFormateada,
      lugar: lugarRaw?.trim()
    };
  }

  getMensajeAyudaAgendarCita(): string {
    return `📅 *Formato para agendar cita:*

CITA [nombre] [fecha] [hora] en [lugar]

Ejemplo:
*cita Juan Garcia mañana 10am en oficina*`;
  }

  async buscarOCrearLead(nombre: string, telefono: string): Promise<{ leadId: string; leadName: string; leadPhone: string }> {
    const { existe, lead } = await this.verificarLeadExistente(telefono);
    if (existe) {
      return { leadId: lead.id, leadName: lead.name, leadPhone: lead.phone };
    }

    const { data: newLead } = await this.supabase.client
      .from('leads')
      .insert({ name: nombre, phone: telefono, status: 'new', source: 'asesor' })
      .select()
      .single();

    return { leadId: newLead.id, leadName: newLead.name, leadPhone: newLead.phone };
  }

  async crearCitaHipoteca(
    datos: { fecha: string; hora: string; lugar?: string },
    asesorId: string,
    asesorName: string,
    leadId: string,
    leadName: string,
    leadPhone: string
  ): Promise<{ error?: string; appointmentId?: string }> {
    try {
      // Crear la cita
      const { data: appointment, error: aptError } = await this.supabase.client
        .from('appointments')
        .insert({
          lead_id: leadId,
          team_member_id: asesorId,
          scheduled_date: datos.fecha,
          scheduled_time: datos.hora,
          location: datos.lugar || 'Por definir',
          status: 'scheduled',
          appointment_type: 'hipoteca',
          notes: `Cita de crédito hipotecario con ${leadName}`,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (aptError) {
        console.error('Error creando cita hipoteca:', aptError);
        return { error: 'No se pudo crear la cita' };
      }

      // Notificar al lead
      const fechaDisplay = new Date(datos.fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      const mensajeLead = `📅 *Cita agendada*\n\n` +
        `Tu cita de crédito hipotecario ha sido programada:\n\n` +
        `📆 ${fechaDisplay}\n` +
        `🕐 ${datos.hora}\n` +
        `📍 ${datos.lugar || 'Por confirmar'}\n` +
        `👤 Asesor: ${asesorName}\n\n` +
        `¡Te esperamos! 🏠`;

      try {
        await (this as any).meta.sendWhatsAppMessage(leadPhone, mensajeLead);
      } catch (e) {
        console.error('⚠️ No se pudo notificar al lead sobre la cita');
      }

      // Actualizar mortgage_application si existe
      const { data: mortgageApp } = await this.supabase.client
        .from('mortgage_applications')
        .select('id')
        .eq('lead_id', leadId)
        .eq('asesor_id', asesorId)
        .single();

      if (mortgageApp) {
        await this.supabase.client
          .from('mortgage_applications')
          .update({
            status: 'appointment_scheduled',
            updated_at: new Date().toISOString()
          })
          .eq('id', mortgageApp.id);
      }

      console.log(`✅ Cita hipoteca creada: ${appointment.id} para ${leadName}`);
      return { appointmentId: appointment.id };

    } catch (e: any) {
      console.error('Error en crearCitaHipoteca:', e);
      return { error: e.message || 'Error desconocido' };
    }
  }
}
