/**
 * EventosService - Servicio para gestión de eventos
 *
 * Maneja:
 * - Listar eventos próximos
 * - Crear eventos
 * - Invitar leads a eventos
 * - Ver registrados en eventos
 */

import { SupabaseService } from './supabase';

interface Evento {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  event_time?: string;
  location?: string;
  status: string;
  max_capacity?: number;
  registered_count?: number;
  created_by?: string;
}

interface Lead {
  id: string;
  name?: string;
  phone: string;
  status?: string;
  lead_score?: number;
  score?: number;
  property_interest?: string;
  assigned_to?: string;
  created_at?: string;
  notes?: any;
  last_message_at?: string;
}

interface FiltrosInvitacion {
  segmento: string | null;
  desarrollo: string | null;
  vendedorNombre: string | null;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  fechaDescripcion: string | null;
}

interface ResultadoInvitacion {
  enviados: number;
  errores: number;
  evento: Evento;
  filtroDescripcion: string;
}

interface Registro {
  id: string;
  lead_id: string;
  event_id: string;
  status: string;
  registered_at: string;
  leads?: {
    name?: string;
    phone?: string;
  };
}

export class EventosService {
  constructor(private supabase: SupabaseService) {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VER EVENTOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getProximosEventos(limite: number = 10): Promise<Evento[]> {
    const hoy = new Date().toISOString().split('T')[0];
    const { data: eventos } = await this.supabase.client
      .from('events')
      .select('*')
      .gte('event_date', hoy)
      .order('event_date', { ascending: true })
      .limit(limite);

    return eventos || [];
  }

  formatEventosLista(eventos: Evento[], nombre: string): string {
    if (!eventos || eventos.length === 0) {
      return `*EVENTOS*\n${nombre}\n\n` +
        `No hay eventos programados.\n\n` +
        `💡 Para crear uno:\n` +
        `*evento Seminario Crédito 20-ene-2026 10:00*`;
    }

    let msg = `*PRÓXIMOS EVENTOS*\n${nombre}\n\n`;

    for (const ev of eventos) {
      const fecha = new Date(ev.event_date).toLocaleDateString('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
      msg += `📅 *${ev.name}*\n`;
      msg += `   ${fecha} ${ev.event_time || ''}\n`;
      msg += `   ${ev.location || 'Ubicación por definir'}\n`;
      msg += `   Registrados: ${ev.registered_count || 0}${ev.max_capacity ? '/' + ev.max_capacity : ''}\n\n`;
    }

    msg += `💡 Para invitar leads: *invitar a [evento] segmento [hot/warm/todos]*`;

    return msg;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CREAR EVENTO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  getMensajeAyudaCrearEvento(): string {
    return `*CREAR EVENTO*\n\n` +
      `Formato:\n` +
      `*evento [nombre] [fecha] [hora]*\n\n` +
      `Ejemplos:\n` +
      `• evento Seminario Crédito 20-ene-2026 10:00\n` +
      `• evento Open House Santa Rita 25-ene-2026 11:00\n` +
      `• seminario Inversión Inmobiliaria 30-ene-2026 18:00`;
  }

  parseCrearEvento(body: string): { nombre: string; fechaEvento: Date; hora: string; eventType: string } | null {
    const match = body.match(/(?:evento|seminario|crear evento)\s+(.+?)\s+(\d{1,2}[-\/]\w{3}[-\/]?\d{2,4})\s*(\d{1,2}:\d{2})?/i);

    if (!match) return null;

    const nombre = match[1].trim();
    const fechaStr = match[2];
    const hora = match[3] || '10:00';

    // Parsear fecha
    const meses: Record<string, number> = {
      'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
    };

    const partesFecha = fechaStr.match(/(\d{1,2})[-\/](\w{3})[-\/]?(\d{2,4})?/i);
    if (!partesFecha) return null;

    const dia = parseInt(partesFecha[1]);
    const mes = meses[partesFecha[2].toLowerCase()] ?? 0;
    const anio = partesFecha[3]
      ? (partesFecha[3].length === 2 ? 2000 + parseInt(partesFecha[3]) : parseInt(partesFecha[3]))
      : new Date().getFullYear();

    const fechaEvento = new Date(anio, mes, dia);

    // Determinar tipo de evento
    let eventType = 'seminar';
    if (nombre.toLowerCase().includes('open house')) eventType = 'open_house';
    if (nombre.toLowerCase().includes('fiesta') || nombre.toLowerCase().includes('party')) eventType = 'party';
    if (nombre.toLowerCase().includes('webinar')) eventType = 'webinar';

    return { nombre, fechaEvento, hora, eventType };
  }

  async crearEvento(datos: { nombre: string; fechaEvento: Date; hora: string; eventType: string }, usuarioId: string): Promise<{ evento: Evento | null; error: string | null }> {
    const { data: evento, error } = await this.supabase.client
      .from('events')
      .insert({
        name: datos.nombre,
        event_type: datos.eventType,
        event_date: datos.fechaEvento.toISOString().split('T')[0],
        event_time: datos.hora,
        status: 'upcoming',
        created_by: usuarioId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando evento:', error);
      return { evento: null, error: 'Error al crear evento. Verifica que la tabla events exista.' };
    }

    return { evento, error: null };
  }

  formatEventoCreado(evento: Evento, fechaEvento: Date, hora: string): string {
    return `✅ *Evento creado*\n\n` +
      `📅 *${evento.name}*\n` +
      `Fecha: ${fechaEvento.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n` +
      `Hora: ${hora}\n` +
      `Tipo: ${evento.event_type}\n\n` +
      `💡 Para invitar leads:\n` +
      `*invitar a ${evento.name} segmento hot*`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // INVITAR A EVENTO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getMensajeAyudaInvitar(): Promise<string> {
    const { data: eventos } = await this.supabase.client
      .from('events')
      .select('*')
      .eq('status', 'upcoming')
      .order('event_date', { ascending: true })
      .limit(5);

    let lista = '*INVITAR A EVENTO* 📨\n\n';
    if (eventos && eventos.length > 0) {
      lista += '*Eventos disponibles:*\n';
      eventos.forEach((e, i) => {
        lista += `${i + 1}. ${e.name} - ${new Date(e.event_date).toLocaleDateString('es-MX')}\n`;
      });
      lista += '\n*Formatos:*\n';
      lista += '• invitar evento Open House a hot\n';
      lista += '• invitar evento Open House a hot de Distrito Falco\n';
      lista += '• invitar evento Open House a vendedor Karla\n';
      lista += '• invitar evento Open House a nuevos esta semana\n';
      lista += '• invitar evento Open House a todos últimos 30 días\n\n';
      lista += '*Segmentos:* hot, warm, cold, nuevos, visitados, todos\n';
      lista += '*Fechas:* hoy, esta semana, este mes, últimos N días';
    } else {
      lista += 'No hay eventos próximos.\n\nCrea uno con: *evento [nombre] [fecha]*';
    }
    return lista;
  }

  async buscarEvento(nombreEvento: string): Promise<Evento | null> {
    const { data: evento } = await this.supabase.client
      .from('events')
      .select('*')
      .ilike('name', '%' + nombreEvento + '%')
      .eq('status', 'upcoming')
      .single();

    return evento;
  }

  parseNombreEventoDeComando(body: string): string | null {
    const eventoMatch = body.match(/invitar (?:a )?evento[:\s]+([^a]+?)(?:\s+a\s+|$)/i);
    return eventoMatch ? eventoMatch[1].trim() : null;
  }

  parseFiltrosInvitacion(body: string): FiltrosInvitacion {
    const restoMatch = body.match(/invitar (?:a )?evento[:\s]+.+?\s+a\s+(.+)/i);
    const resto = restoMatch ? restoMatch[1] : '';

    let segmento: string | null = null;
    let desarrollo: string | null = null;
    let vendedorNombre: string | null = null;
    let fechaDesde: Date | null = null;
    let fechaHasta: Date | null = null;
    let fechaDescripcion: string | null = null;

    const hoy = new Date();

    // Extraer fecha
    const fechaPatterns = [
      { regex: /desde\s+(\d{4}-\d{2}-\d{2})/i, handler: (m: RegExpMatchArray) => {
        fechaDesde = new Date(m[1]);
        fechaDescripcion = `desde ${m[1]}`;
      }},
      { regex: /esta semana/i, handler: () => {
        const inicioSemana = new Date(hoy);
        inicioSemana.setDate(hoy.getDate() - hoy.getDay());
        inicioSemana.setHours(0, 0, 0, 0);
        fechaDesde = inicioSemana;
        fechaDescripcion = 'esta semana';
      }},
      { regex: /este mes/i, handler: () => {
        fechaDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaDescripcion = 'este mes';
      }},
      { regex: /(?:últimos|ultimos)\s+(\d+)\s+días?/i, handler: (m: RegExpMatchArray) => {
        fechaDesde = new Date(hoy);
        fechaDesde.setDate(hoy.getDate() - parseInt(m[1]));
        fechaDescripcion = `últimos ${m[1]} días`;
      }},
      { regex: /hoy/i, handler: () => {
        fechaDesde = new Date(hoy);
        fechaDesde.setHours(0, 0, 0, 0);
        fechaHasta = new Date(hoy);
        fechaHasta.setHours(23, 59, 59);
        fechaDescripcion = 'hoy';
      }}
    ];

    for (const pattern of fechaPatterns) {
      const match = resto.match(pattern.regex);
      if (match) {
        pattern.handler(match);
      }
    }

    // Extraer vendedor
    const vendedorMatch = resto.match(/vendedor\s+([^\s]+)/i);
    if (vendedorMatch) {
      vendedorNombre = vendedorMatch[1].trim();
    }

    // Extraer desarrollo
    const desarrolloMatch = resto.match(/de\s+([^v][^\s]+(?:\s+[^v][^\s]+)?)/i);
    if (desarrolloMatch && !desarrolloMatch[1].match(/vendedor/i)) {
      desarrollo = desarrolloMatch[1].trim();
    }

    // Extraer segmento
    const segmentosConocidos = ['hot', 'warm', 'cold', 'nuevos', 'new', 'visitados', 'negociacion', 'compradores', 'caidos', 'todos', 'all'];
    for (const seg of segmentosConocidos) {
      if (resto.toLowerCase().includes(seg)) {
        segmento = seg;
        break;
      }
    }

    return { segmento, desarrollo, vendedorNombre, fechaDesde, fechaHasta, fechaDescripcion };
  }

  async getLeadsParaInvitacion(
    filtros: FiltrosInvitacion
  ): Promise<{ leads: Lead[]; error: string | null; vendedorEncontrado: string | null; filtroDescripcion: string }> {
    // Obtener leads y team members
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, status, lead_score, score, property_interest, assigned_to, created_at, notes, last_message_at');

    const { data: teamMembers } = await this.supabase.client
      .from('team_members')
      .select('id, name');

    if (!leads) {
      return { leads: [], error: 'Error al obtener leads.', vendedorEncontrado: null, filtroDescripcion: '' };
    }

    let leadsSegmento = leads.filter((l: Lead) => l.phone);
    let vendedorEncontrado: string | null = null;

    // Filtrar por vendedor
    if (filtros.vendedorNombre && teamMembers) {
      const vendedorLower = filtros.vendedorNombre.toLowerCase();
      const vendedor = teamMembers.find((tm: any) =>
        tm.name?.toLowerCase().includes(vendedorLower) ||
        vendedorLower.includes(tm.name?.split(' ')[0]?.toLowerCase() || '')
      );

      if (!vendedor) {
        const listaVendedores = teamMembers.slice(0, 10).map((tm: any) => `• ${tm.name}`).join('\n');
        return {
          leads: [],
          error: `❌ Vendedor "${filtros.vendedorNombre}" no encontrado.\n\n*Vendedores:*\n${listaVendedores}`,
          vendedorEncontrado: null,
          filtroDescripcion: ''
        };
      }

      leadsSegmento = leadsSegmento.filter((l: Lead) => l.assigned_to === vendedor.id);
      vendedorEncontrado = vendedor.name;
    }

    // Filtrar por desarrollo
    if (filtros.desarrollo) {
      const desarrolloLower = filtros.desarrollo.toLowerCase();
      leadsSegmento = leadsSegmento.filter((l: Lead) => {
        const propInterest = (l.property_interest || '').toLowerCase();
        return propInterest.includes(desarrolloLower) || desarrolloLower.includes(propInterest);
      });
    }

    // Filtrar por fecha
    if (filtros.fechaDesde || filtros.fechaHasta) {
      leadsSegmento = leadsSegmento.filter((l: Lead) => {
        if (!l.created_at) return false;
        const fechaCreacion = new Date(l.created_at);
        if (filtros.fechaDesde && fechaCreacion < filtros.fechaDesde) return false;
        if (filtros.fechaHasta && fechaCreacion > filtros.fechaHasta) return false;
        return true;
      });
    }

    // Filtrar por segmento
    if (filtros.segmento) {
      switch (filtros.segmento) {
        case 'hot':
          leadsSegmento = leadsSegmento.filter((l: Lead) => (l.lead_score || l.score || 0) >= 70);
          break;
        case 'warm':
          leadsSegmento = leadsSegmento.filter((l: Lead) => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
          break;
        case 'cold':
          leadsSegmento = leadsSegmento.filter((l: Lead) => (l.lead_score || l.score || 0) < 40);
          break;
        case 'nuevos':
        case 'new':
          leadsSegmento = leadsSegmento.filter((l: Lead) => l.status === 'new');
          break;
        case 'visitados':
          leadsSegmento = leadsSegmento.filter((l: Lead) => l.status === 'visited');
          break;
        case 'negociacion':
          leadsSegmento = leadsSegmento.filter((l: Lead) => ['negotiation', 'reserved'].includes(l.status || ''));
          break;
        case 'compradores':
          leadsSegmento = leadsSegmento.filter((l: Lead) => ['closed_won', 'delivered'].includes(l.status || ''));
          break;
        case 'caidos':
          leadsSegmento = leadsSegmento.filter((l: Lead) => l.status === 'fallen');
          break;
        case 'todos':
        case 'all':
          break;
      }
    }

    // Construir descripción del filtro
    const filtroDescripcion = [
      filtros.segmento ? filtros.segmento : null,
      filtros.desarrollo ? `de ${filtros.desarrollo}` : null,
      vendedorEncontrado ? `vendedor ${vendedorEncontrado}` : null,
      filtros.fechaDescripcion || null
    ].filter(Boolean).join(' + ') || 'todos';

    return { leads: leadsSegmento, error: null, vendedorEncontrado, filtroDescripcion };
  }

  formatMensajeInvitacion(evento: Evento, nombreLead: string): string {
    const fechaEvento = new Date(evento.event_date).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    return `Hola ${nombreLead}! 🎉\n\n` +
      `Te invitamos a:\n` +
      `📌 *${evento.name}*\n` +
      `📅 ${fechaEvento}${evento.event_time ? ' a las ' + evento.event_time : ''}\n` +
      `${evento.location ? '📍 ' + evento.location : ''}\n\n` +
      `*¿Te gustaría asistir?*\n` +
      `Responde *SI* para reservar tu lugar.`;
  }

  async ejecutarInvitaciones(
    leads: Lead[],
    evento: Evento,
    filtroDescripcion: string,
    enviarMensaje: (phone: string, mensaje: string) => Promise<void>,
    sendTemplate?: (phone: string, templateName: string, lang: string, components: any[]) => Promise<any>
  ): Promise<ResultadoInvitacion & { templateUsados: number }> {
    let enviados = 0;
    let errores = 0;
    let templateUsados = 0;
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Formatear fecha del evento para template
    const fechaEvento = new Date(evento.event_date).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    const fechaCompleta = evento.event_time ? `${fechaEvento} a las ${evento.event_time}` : fechaEvento;

    for (const lead of leads) {
      try {
        const phone = lead.phone.startsWith('52') ? lead.phone : '52' + lead.phone;
        const nombre = lead.name?.split(' ')[0] || 'amigo';

        // Verificar si el lead ha interactuado en las últimas 24h
        const dentroVentana24h = lead.last_message_at && lead.last_message_at > hace24h;

        if (dentroVentana24h) {
          // Dentro de ventana 24h: usar mensaje normal (más personalizado)
          const mensaje = this.formatMensajeInvitacion(evento, nombre);
          await enviarMensaje(phone, mensaje);
        } else if (sendTemplate) {
          // Fuera de ventana 24h: usar template aprobado
          // invitacion_evento: {{1}}=nombre, {{2}}=nombre_evento, {{3}}=fecha, {{4}}=ubicacion
          await sendTemplate(phone, 'invitacion_evento', 'es_MX', [
            { type: 'body', parameters: [
              { type: 'text', text: nombre },
              { type: 'text', text: evento.name },
              { type: 'text', text: fechaCompleta },
              { type: 'text', text: evento.location || 'Por confirmar' }
            ]}
          ]);
          templateUsados++;
        } else {
          // Sin template disponible, intentar mensaje normal (puede fallar)
          const mensaje = this.formatMensajeInvitacion(evento, nombre);
          await enviarMensaje(phone, mensaje);
        }

        // Guardar pending_event_registration en notes del lead
        const notasActuales = (lead as any).notes || {};
        notasActuales.pending_event_registration = {
          event_id: evento.id,
          event_name: evento.name,
          invited_at: new Date().toISOString()
        };
        await this.supabase.client.from('leads')
          .update({ notes: notasActuales })
          .eq('id', lead.id);

        enviados++;
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        errores++;
        console.error(`Error enviando a ${lead.phone}:`, e);
      }
    }

    return { enviados, errores, evento, filtroDescripcion, templateUsados };
  }

  formatMensajeEnviando(evento: Evento, filtroDescripcion: string, totalLeads: number): string {
    return `📤 *Enviando invitaciones...*\n\n` +
      `Evento: ${evento.name}\n` +
      `Filtro: ${filtroDescripcion}\n` +
      `Destinatarios: ${totalLeads}\n\n` +
      `⏳ Esto puede tomar unos minutos...`;
  }

  formatResultadoInvitaciones(resultado: ResultadoInvitacion & { templateUsados?: number }): string {
    const templateInfo = resultado.templateUsados ? `• Templates usados: ${resultado.templateUsados}\n` : '';
    return `✅ *Invitaciones enviadas*\n\n` +
      `📊 Resultados:\n` +
      `• Evento: ${resultado.evento.name}\n` +
      `• Filtro: ${resultado.filtroDescripcion}\n` +
      `• Enviados: ${resultado.enviados}\n` +
      templateInfo +
      `• Errores: ${resultado.errores}\n\n` +
      `Los leads pueden responder *SI* o *Confirmo* para registrarse.\n\n` +
      `Ver registrados: *registrados ${resultado.evento.name}*`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VER REGISTRADOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getEventosConRegistrados(limite: number = 10): Promise<Evento[]> {
    const { data: eventos } = await this.supabase.client
      .from('events')
      .select('*, event_registrations(count)')
      .order('event_date', { ascending: true })
      .limit(limite);

    return eventos || [];
  }

  formatListaEventosConRegistrados(eventos: Evento[]): string {
    let lista = '*EVENTOS Y REGISTRADOS*\n\n';
    if (eventos && eventos.length > 0) {
      for (const e of eventos) {
        const registrados = e.registered_count || 0;
        const capacidad = e.max_capacity ? `/${e.max_capacity}` : '';
        lista += `📅 *${e.name}*\n`;
        lista += `   👥 ${registrados}${capacidad} registrados\n`;
        lista += `   📆 ${new Date(e.event_date).toLocaleDateString('es-MX')}\n\n`;
      }
      lista += 'Para ver detalle: *registrados [nombre evento]*';
    } else {
      lista += 'No hay eventos.';
    }
    return lista;
  }

  async buscarEventoPorNombre(nombreEvento: string): Promise<Evento | null> {
    const { data: evento } = await this.supabase.client
      .from('events')
      .select('*')
      .ilike('name', '%' + nombreEvento + '%')
      .single();

    return evento;
  }

  async getRegistrados(eventoId: string): Promise<Registro[]> {
    const { data: registros } = await this.supabase.client
      .from('event_registrations')
      .select('*, leads(name, phone)')
      .eq('event_id', eventoId)
      .order('registered_at', { ascending: false });

    return registros || [];
  }

  formatRegistrados(evento: Evento, registros: Registro[]): string {
    let respuesta = `*REGISTRADOS: ${evento.name}*\n\n`;
    respuesta += `📅 ${new Date(evento.event_date).toLocaleDateString('es-MX')}\n`;
    if (evento.max_capacity) {
      respuesta += `👥 ${registros?.length || 0}/${evento.max_capacity} lugares\n`;
    }
    respuesta += '\n';

    if (registros && registros.length > 0) {
      registros.forEach((r, i) => {
        const lead = r.leads as any;
        const estado = r.status === 'confirmed' ? '✅' : r.status === 'attended' ? '🎉' : '📝';
        respuesta += `${i + 1}. ${estado} ${lead?.name || 'Sin nombre'}\n`;
        respuesta += `   📱 ${lead?.phone || 'Sin tel'}\n`;
      });
    } else {
      respuesta += 'No hay registrados aun.\n\nInvita con: *invitar evento ' + evento.name + ' a hot*';
    }

    return respuesta;
  }
}
