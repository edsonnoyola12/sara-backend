import { SupabaseService } from './supabase';

/**
 * Sanitiza notas para evitar corrupción.
 * Elimina keys numéricos y asegura que sea un objeto válido.
 */
export function sanitizeNotes(notes: any): Record<string, any> {
  // Si no es objeto o es null/undefined, retornar objeto vacío
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
    return {};
  }

  // Filtrar keys numéricos (señal de corrupción)
  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(notes)) {
    if (!/^\d+$/.test(key)) {
      sanitized[key] = notes[key];
    }
  }
  return sanitized;
}

export class VendorCommandsService {
  constructor(private supabase: SupabaseService) {}

  async getVendedorNotes(vendedorId: string): Promise<{ notes: any; notasVendedor: any }> {
    try {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      let notas: any = {};
      if (vendedor?.notes) {
        if (typeof vendedor.notes === 'string') {
          try { notas = JSON.parse(vendedor.notes); } catch (e) { notas = {}; }
        } else if (typeof vendedor.notes === 'object') {
          notas = vendedor.notes;
        }
      }

      // SIEMPRE sanitizar notas para prevenir corrupción
      const notasSanitizadas = sanitizeNotes(notas);

      // Si hubo limpieza (diferente tamaño), guardar en BD
      const keysOriginal = Object.keys(notas).length;
      const keysSanitizadas = Object.keys(notasSanitizadas).length;
      if (keysOriginal !== keysSanitizadas) {
        console.log(`⚠️ NOTAS SANITIZADAS para ${vendedorId}: ${keysOriginal} -> ${keysSanitizadas} keys`);
        await this.supabase.client
          .from('team_members')
          .update({ notes: notasSanitizadas })
          .eq('id', vendedorId);
      }

      return { notes: notasSanitizadas, notasVendedor: notasSanitizadas };
    } catch (e) {
      return { notes: {}, notasVendedor: {} };
    }
  }

  async processVendorMessageInitial(ctx: any): Promise<any> {
    return { handled: false };
  }

  detectEarlyCommand(mensaje: string, body: string): any {
    return null;
  }

  detectCoordinadorCommand(mensaje: string, body: string): { matched: boolean; command?: string; params?: any } {
    // Por ahora, no detectar comandos de coordinador - dejar que continúe al handler de vendedor
    return { matched: false };
  }

  detectRouteCommand(body: string, mensaje: string): { matched: boolean; handlerName?: string; handlerParams?: any } {
    const msg = mensaje.toLowerCase().trim();

    // ═══ CITAS ═══
    if (/^(mis\s+)?citas?(\s+hoy)?$/i.test(msg) || msg === 'ver citas') {
      return { matched: true, handlerName: 'vendedorCitasHoy' };
    }

    // ═══ REAGENDAR ═══
    if (/^reagendar/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorReagendarCita', handlerParams: { texto: body } };
    }

    // ═══ CANCELAR CITA ═══
    if (/^cancelar\s+cita/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorCancelarCita', handlerParams: { texto: body } };
    }

    // ═══ MIS LEADS ═══
    if (/^(mis\s+)?leads?$/i.test(msg) || msg === 'ver leads') {
      return { matched: true, handlerName: 'vendedorResumenLeads' };
    }

    // ═══ HOY / RESUMEN ═══
    if (/^(hoy|resumen)$/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorResumenHoy' };
    }

    // ═══ AYUDA ═══
    if (/^(ayuda|help|\?)$/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorAyuda' };
    }

    // ═══ AGENDAR CITA ═══
    if (/^(agendar|cita\s+con)/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorAgendarCitaCompleta', handlerParams: { texto: body } };
    }

    // ═══ BRIEFING ═══
    if (/^briefing$/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorBriefing' };
    }

    // ═══ META ═══
    if (/^(mi\s+)?meta$/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorMetaAvance' };
    }

    // ═══ MOVER ETAPA (adelante/atrás/pasó a) ═══
    // Formato: "Juan adelante", "Juan al siguiente", "Juan atrás", "Juan pasó a negociación"
    if (/\b(siguiente|adelante|avanzar|proximo|próximo|atras|atrás|regresar|anterior|pasó\s+a|paso\s+a|pasa\s+a)\b/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorMoverEtapa', handlerParams: { texto: body } };
    }

    // ═══ QUIEN ES [nombre] ═══
    const matchQuienEs = msg.match(/^(?:quien\s+es|quién\s+es|buscar|info\s+de?)\s+(.+)$/i);
    if (matchQuienEs) {
      return { matched: true, handlerName: 'vendedorQuienEs', handlerParams: { nombre: matchQuienEs[1].trim() } };
    }

    // ═══ BROCHURE [desarrollo] ═══
    const matchBrochure = msg.match(/^(?:brochure|brouchure|folleto|catalogo|catálogo)\s+(.+)$/i);
    if (matchBrochure) {
      return { matched: true, handlerName: 'vendedorBrochure', handlerParams: { desarrollo: matchBrochure[1].trim() } };
    }

    // ═══ UBICACION [desarrollo] ═══
    const matchUbicacion = msg.match(/^(?:ubicacion|ubicación|donde\s+(?:queda|esta|está)|gps|mapa)\s+(.+)$/i);
    if (matchUbicacion) {
      return { matched: true, handlerName: 'vendedorUbicacion', handlerParams: { desarrollo: matchUbicacion[1].trim() } };
    }

    // ═══ VIDEO [desarrollo] ═══
    const matchVideo = msg.match(/^(?:video|ver|tour)\s+(.+)$/i);
    if (matchVideo) {
      return { matched: true, handlerName: 'vendedorVideo', handlerParams: { desarrollo: matchVideo[1].trim() } };
    }

    // ═══ PASAR A CREDITO / ASESOR ═══
    // Formato: "credito Juan", "credito a Juan", "pasar Juan a credito", "hipoteca Juan", "asesor Juan"
    const matchCredito = msg.match(/^(?:credito|crédito|hipoteca|pasar\s+a\s+credito|pasar\s+a\s+asesor)\s+(?:a\s+)?(.+)$/i);
    if (matchCredito) {
      return { matched: true, handlerName: 'vendedorPasarACredito', handlerParams: { nombreLead: matchCredito[1].trim() } };
    }
    const matchPasarCredito = msg.match(/^pasar\s+(.+?)\s+a\s+(?:credito|crédito|hipoteca|asesor)$/i);
    if (matchPasarCredito) {
      return { matched: true, handlerName: 'vendedorPasarACredito', handlerParams: { nombreLead: matchPasarCredito[1].trim() } };
    }

    // ═══ NUEVO LEAD / AGREGAR LEAD ═══
    // Formato: "nuevo lead Juan 5551234567", "agregar Juan 5551234567 Monte Verde"
    const matchNuevoLead = msg.match(/^(?:nuevo\s+lead|agregar|registrar|capturar)\s+([a-záéíóúñü\s]+?)\s+(\d{10,15})(?:\s+(.+))?$/i);
    if (matchNuevoLead) {
      return {
        matched: true,
        handlerName: 'vendedorNuevoLead',
        handlerParams: {
          nombre: matchNuevoLead[1].trim(),
          telefono: matchNuevoLead[2].trim(),
          desarrollo: matchNuevoLead[3]?.trim() || null
        }
      };
    }

    // ═══ HOT - Leads calientes ═══
    if (/^hot$/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorLeadsHot' };
    }

    // ═══ PENDIENTES - Leads sin seguimiento ═══
    if (/^pendientes$/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorLeadsPendientes' };
    }

    // ═══ BRIDGE / CHAT DIRECTO ═══
    // Formato: bridge [nombre] "mensaje opcional"
    const bridgeMatchConMensaje = body.match(/^(?:bridge|chat\s*directo|directo)\s+(\w+)\s+[""""](.+)[""""]$/i);
    if (bridgeMatchConMensaje) {
      return {
        matched: true,
        handlerName: 'bridgeLead',
        handlerParams: {
          nombreLead: bridgeMatchConMensaje[1].trim(),
          mensajeInicial: bridgeMatchConMensaje[2].trim()
        }
      };
    }

    const bridgeMatch = msg.match(/^(?:bridge|chat\s*directo|directo)\s+(.+)$/i);
    if (bridgeMatch) {
      return {
        matched: true,
        handlerName: 'bridgeLead',
        handlerParams: { nombreLead: bridgeMatch[1].trim() }
      };
    }

    // ═══ EXTENDER BRIDGE ═══
    if (msg === '#mas' || msg === '#más' || msg === '#continuar') {
      return { matched: true, handlerName: 'extenderBridge' };
    }

    // ═══ CERRAR BRIDGE ═══
    if (msg === '#cerrar' || msg === '#fin') {
      return { matched: true, handlerName: 'cerrarBridge' };
    }

    return { matched: false };
  }

  async executeHandler(handlerName: string, vendedor: any, nombreVendedor: string, params: any): Promise<{ message?: string; error?: string; needsExternalHandler?: boolean }> {
    // Stub - retorna que necesita handler externo
    return { needsExternalHandler: true };
  }

  formatBridgeConfirmation(leadName: string): string {
    return `Confirmado para ${leadName}`;
  }

  async savePendingBridgeAppointment(vendedorId: string, notes: any, intencion: any): Promise<void> {
    // Stub
  }

  formatBridgeAppointmentSuggestion(tipo: string, leadName: string, fecha: string, hora: string): string {
    return `Cita sugerida: ${tipo} con ${leadName} el ${fecha} a las ${hora}`;
  }

  async asignarAsesorHipotecario(nombreLead: string, vendedor: any, teamMembers: any[], telefonoLead?: string | null): Promise<any> {
    return { success: false };
  }
  async asignarLeadAVendedor(nombreLead: string, targetVendedor: string): Promise<any> {
    return { success: false };
  }
  async crearYAsignarLead(nombre: string, telefono: string, targetVendedor: string, desarrollo?: string): Promise<any> {
    return { success: false };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CITAS HOY
  // ═══════════════════════════════════════════════════════════════════
  async getCitasHoy(vendedorId: string, esAdmin: boolean): Promise<any[]> {
    const hoy = new Date().toISOString().split('T')[0];

    let query = this.supabase.client
      .from('appointments')
      .select(`
        id,
        scheduled_date,
        scheduled_time,
        status,
        lead_id,
        leads!inner(name, phone)
      `)
      .eq('scheduled_date', hoy)
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_time', { ascending: true });

    if (!esAdmin) {
      query = query.eq('vendedor_id', vendedorId);
    }

    const { data, error } = await query;
    if (error) {
      console.log('Error getCitasHoy:', error);
      return [];
    }
    return data || [];
  }

  formatCitasHoy(citas: any[], nombre: string, esAdmin: boolean): string {
    if (!citas || citas.length === 0) {
      return `📅 *${nombre}, no tienes citas hoy*\n\n¿Quieres agendar una?\nEscribe: *agendar cita con [nombre]*`;
    }

    let msg = `📅 *CITAS DE HOY* (${citas.length})\n\n`;

    citas.forEach((cita, i) => {
      const hora = cita.scheduled_time?.slice(0, 5) || '??:??';
      const leadName = cita.leads?.name || 'Sin nombre';
      const status = cita.status === 'confirmed' ? '✅' : '📋';
      msg += `${status} *${hora}* - ${leadName}\n`;
    });

    msg += `\n💡 Para reagendar: *reagendar [nombre] [día] [hora]*`;
    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRIEFING
  // ═══════════════════════════════════════════════════════════════════
  async getBriefing(vendedorId: string): Promise<any> {
    const hoy = new Date().toISOString().split('T')[0];

    // Citas de hoy
    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('id, scheduled_time, leads(name)')
      .eq('vendedor_id', vendedorId)
      .eq('scheduled_date', hoy)
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_time');

    // Leads activos
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, stage')
      .eq('assigned_to', vendedorId)
      .in('stage', ['new', 'contacted', 'qualified', 'visit_scheduled', 'visited'])
      .limit(10);

    return { citas: citas || [], leads: leads || [] };
  }

  formatBriefing(data: any, nombre: string): string {
    let msg = `☀️ *Buenos días, ${nombre}!*\n\n`;

    if (data.citas.length > 0) {
      msg += `📅 *CITAS HOY* (${data.citas.length}):\n`;
      data.citas.forEach((c: any) => {
        const hora = c.scheduled_time?.slice(0, 5) || '??:??';
        msg += `  • ${hora} - ${c.leads?.name || 'Lead'}\n`;
      });
      msg += '\n';
    } else {
      msg += `📅 Sin citas hoy\n\n`;
    }

    if (data.leads.length > 0) {
      msg += `👥 *LEADS ACTIVOS* (${data.leads.length}):\n`;
      data.leads.slice(0, 5).forEach((l: any) => {
        msg += `  • ${l.name} (${l.stage})\n`;
      });
    }

    msg += `\n💡 Escribe *ayuda* para ver comandos`;
    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // META AVANCE
  // ═══════════════════════════════════════════════════════════════════
  async getMetaAvance(vendedorId: string, metaMensual: number): Promise<any> {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const inicioMesStr = inicioMes.toISOString().split('T')[0];

    const { data: ventas, count } = await this.supabase.client
      .from('leads')
      .select('id', { count: 'exact' })
      .eq('assigned_to', vendedorId)
      .eq('stage', 'sold')
      .gte('updated_at', inicioMesStr);

    return {
      ventas: count || 0,
      meta: metaMensual,
      porcentaje: Math.round(((count || 0) / metaMensual) * 100)
    };
  }

  formatMetaAvance(data: any, nombre: string): string {
    const progreso = '█'.repeat(Math.min(10, Math.floor(data.porcentaje / 10))) +
                     '░'.repeat(10 - Math.min(10, Math.floor(data.porcentaje / 10)));

    return `🎯 *META DEL MES - ${nombre}*\n\n` +
           `${progreso} ${data.porcentaje}%\n\n` +
           `✅ Ventas: ${data.ventas} / ${data.meta}\n\n` +
           `${data.porcentaje >= 100 ? '🏆 ¡Meta cumplida!' : '💪 ¡Tú puedes!'}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RESUMEN LEADS
  // ═══════════════════════════════════════════════════════════════════
  async getResumenLeads(vendedorId: string): Promise<any> {
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, stage, phone')
      .eq('assigned_to', vendedorId)
      .in('stage', ['new', 'contacted', 'qualified', 'visit_scheduled', 'visited', 'negotiating'])
      .order('updated_at', { ascending: false })
      .limit(15);

    return leads || [];
  }

  formatResumenLeads(leads: any[], nombre: string): string {
    if (!leads || leads.length === 0) {
      return `👥 *${nombre}, no tienes leads activos*\n\nLos nuevos leads se asignan automáticamente.`;
    }

    let msg = `👥 *TUS LEADS* (${leads.length})\n\n`;

    const porEtapa: { [key: string]: any[] } = {};
    leads.forEach(l => {
      if (!porEtapa[l.stage]) porEtapa[l.stage] = [];
      porEtapa[l.stage].push(l);
    });

    const etapas: { [key: string]: string } = {
      'new': '🆕 Nuevos',
      'contacted': '📞 Contactados',
      'qualified': '✅ Calificados',
      'visit_scheduled': '📅 Cita agendada',
      'visited': '🏠 Visitados',
      'negotiating': '💰 Negociando'
    };

    Object.entries(etapas).forEach(([key, label]) => {
      if (porEtapa[key]?.length) {
        msg += `*${label}* (${porEtapa[key].length}):\n`;
        porEtapa[key].slice(0, 3).forEach(l => {
          msg += `  • ${l.name}\n`;
        });
        msg += '\n';
      }
    });

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MOVER FUNNEL (adelante/atrás)
  // ═══════════════════════════════════════════════════════════════════

  private readonly FUNNEL_STAGES = [
    'new',
    'contacted',
    'qualified',
    'visit_scheduled',
    'visited',
    'negotiating',
    'reserved',
    'sold',
    'delivered'
  ];

  private readonly STAGE_LABELS: Record<string, string> = {
    'new': '🆕 NUEVO',
    'contacted': '📞 CONTACTADO',
    'qualified': '✅ CALIFICADO',
    'visit_scheduled': '📅 CITA AGENDADA',
    'visited': '🏠 VISITÓ',
    'negotiating': '💰 NEGOCIANDO',
    'reserved': '📝 RESERVADO',
    'sold': '✅ VENDIDO',
    'delivered': '🏠 ENTREGADO'
  };

  getFunnelStageLabel(stage: string): string {
    return this.STAGE_LABELS[stage] || stage;
  }

  formatMultipleLeads(leads: any[]): string {
    let msg = `🔍 Encontré ${leads.length} leads:\n\n`;
    leads.forEach((l, i) => {
      msg += `*${i + 1}.* ${l.name} (${this.STAGE_LABELS[l.status] || l.status})\n`;
    });
    msg += `\n💡 Sé más específico con el nombre`;
    return msg;
  }

  async moveFunnelStep(
    nombreLead: string,
    vendedorId: string,
    role: string,
    direction: 'next' | 'prev'
  ): Promise<{
    success: boolean;
    error?: string;
    multipleLeads?: any[];
    lead?: any;
    newStatus?: string;
  }> {
    try {
      const esAdmin = ['admin', 'coordinador', 'ceo', 'director'].includes(role?.toLowerCase() || '');
      console.log(`🔍 moveFunnelStep: buscando "${nombreLead}", vendedorId=${vendedorId}, role=${role}, esAdmin=${esAdmin}`);

      // Buscar leads por nombre
      let query = this.supabase.client
        .from('leads')
        .select('id, name, status, assigned_to')
        .ilike('name', `%${nombreLead}%`);

      if (!esAdmin) {
        query = query.eq('assigned_to', vendedorId);
      }

      const { data: leads, error } = await query.limit(10);
      console.log(`🔍 moveFunnelStep: encontrados=${leads?.length || 0}, error=${error?.message || 'ninguno'}`);

      if (error || !leads || leads.length === 0) {
        return { success: false, error: `❌ No encontré a "${nombreLead}"` };
      }

      if (leads.length > 1) {
        // Si hay match exacto, usarlo
        const exactMatch = leads.find(l => l.name.toLowerCase() === nombreLead.toLowerCase());
        if (!exactMatch) {
          return { success: false, multipleLeads: leads };
        }
        leads.splice(0, leads.length, exactMatch);
      }

      const lead = leads[0];
      const currentIndex = this.FUNNEL_STAGES.indexOf(lead.status);

      if (currentIndex === -1) {
        // Status no está en el funnel estándar, moverlo a contacted
        const newStatus = direction === 'next' ? 'contacted' : 'new';
        await this.supabase.client
          .from('leads')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', lead.id);
        return { success: true, lead, newStatus };
      }

      let newIndex: number;
      if (direction === 'next') {
        newIndex = Math.min(currentIndex + 1, this.FUNNEL_STAGES.length - 1);
      } else {
        newIndex = Math.max(currentIndex - 1, 0);
      }

      if (newIndex === currentIndex) {
        const msg = direction === 'next'
          ? `⚠️ ${lead.name} ya está en la última etapa (${this.STAGE_LABELS[lead.status]})`
          : `⚠️ ${lead.name} ya está en la primera etapa (${this.STAGE_LABELS[lead.status]})`;
        return { success: false, error: msg };
      }

      const newStatus = this.FUNNEL_STAGES[newIndex];

      await this.supabase.client
        .from('leads')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      console.log(`✅ Lead ${lead.name} movido de ${lead.status} a ${newStatus}`);

      return { success: true, lead, newStatus };
    } catch (e) {
      console.error('Error en moveFunnelStep:', e);
      return { success: false, error: '❌ Error al mover lead' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // VER LEADS POR TIPO
  // ═══════════════════════════════════════════════════════════════════
  async getLeadsPorTipo(vendedorId: string, esAdmin: boolean, tipo: string): Promise<any[]> {
    let query = this.supabase.client
      .from('leads')
      .select('id, name, stage, phone, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!esAdmin) {
      query = query.eq('assigned_to', vendedorId);
    }

    switch (tipo) {
      case 'compradores':
        query = query.in('stage', ['reserved', 'sold', 'delivered']);
        break;
      case 'caidos':
        query = query.eq('stage', 'lost');
        break;
      case 'inactivos':
        const hace30dias = new Date();
        hace30dias.setDate(hace30dias.getDate() - 30);
        query = query.lt('updated_at', hace30dias.toISOString());
        break;
      case 'archivados':
        query = query.eq('stage', 'archived');
        break;
      default:
        // todos activos
        query = query.in('stage', ['new', 'contacted', 'qualified', 'visit_scheduled', 'visited', 'negotiating']);
    }

    const { data } = await query;
    return data || [];
  }

  formatLeadsPorTipo(leads: any[]): string {
    if (!leads || leads.length === 0) {
      return `📭 No hay leads en esta categoría`;
    }

    let msg = `👥 *LEADS* (${leads.length})\n\n`;
    leads.slice(0, 15).forEach(l => {
      msg += `• ${l.name} (${this.STAGE_LABELS[l.stage] || l.stage})\n`;
    });

    if (leads.length > 15) {
      msg += `\n... y ${leads.length - 15} más`;
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ARCHIVAR/DESARCHIVAR LEAD
  // ═══════════════════════════════════════════════════════════════════
  async archivarDesarchivarLead(
    nombreLead: string,
    vendedorId: string,
    esAdmin: boolean,
    archivar: boolean
  ): Promise<{ success: boolean; error?: string; lead?: any }> {
    try {
      let query = this.supabase.client
        .from('leads')
        .select('id, name, stage')
        .ilike('name', `%${nombreLead}%`);

      if (!esAdmin) {
        query = query.eq('assigned_to', vendedorId);
      }

      const { data: leads } = await query.limit(1);

      if (!leads || leads.length === 0) {
        return { success: false, error: `❌ No encontré a "${nombreLead}"` };
      }

      const lead = leads[0];
      const newStage = archivar ? 'archived' : 'new';

      await this.supabase.client
        .from('leads')
        .update({ stage: newStage, updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      return { success: true, lead };
    } catch (e) {
      return { success: false, error: '❌ Error al actualizar lead' };
    }
  }
}
