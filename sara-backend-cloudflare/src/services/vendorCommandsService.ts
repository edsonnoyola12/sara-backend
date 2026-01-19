import { SupabaseService } from './supabase';
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
      return { notes: notas, notasVendedor: notas };
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
}
