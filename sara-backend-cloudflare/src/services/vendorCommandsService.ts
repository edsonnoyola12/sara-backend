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
      const { data: vendedor, error } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      if (error) {
        console.error(`❌ getVendedorNotes ERROR: ${error.message}`);
        return { notes: {}, notasVendedor: {} };
      }

      let notas: any = {};
      if (vendedor?.notes) {
        const notesType = typeof vendedor.notes;
        console.log(`📋 getVendedorNotes: type=${notesType}, preview=${String(vendedor.notes).substring(0, 100)}`);

        if (notesType === 'string') {
          try {
            notas = JSON.parse(vendedor.notes);
            console.log(`📋 getVendedorNotes: parsed keys=[${Object.keys(notas).join(',')}]`);
          } catch (e) {
            console.error(`❌ getVendedorNotes: JSON parse error`);
            notas = {};
          }
        } else if (notesType === 'object') {
          notas = vendedor.notes;
          console.log(`📋 getVendedorNotes: object keys=[${Object.keys(notas).join(',')}]`);
        }
      } else {
        console.log(`📋 getVendedorNotes: notes is empty/null`);
      }

      // SIEMPRE sanitizar notas para prevenir corrupción
      const notasSanitizadas = sanitizeNotes(notas);

      // Si hubo limpieza (diferente tamaño), guardar en BD
      const keysOriginal = Object.keys(notas).length;
      const keysSanitizadas = Object.keys(notasSanitizadas).length;
      if (keysOriginal !== keysSanitizadas) {
        console.error(`⚠️ NOTAS SANITIZADAS para ${vendedorId}: ${keysOriginal} -> ${keysSanitizadas} keys`);
        await this.supabase.client
          .from('team_members')
          .update({ notes: notasSanitizadas })
          .eq('id', vendedorId);
      }

      return { notes: notasSanitizadas, notasVendedor: notasSanitizadas };
    } catch (e) {
      console.error(`❌ getVendedorNotes EXCEPTION: ${e}`);
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

    // ═══ FOLLOW-UP PENDIENTE: OK / CANCELAR / EDITAR ═══
    // Formato: "ok juan", "cancelar juan", "editar juan Hola, soy Pedro..."
    if (/^ok(\s+[a-záéíóúñü]+)?$/i.test(msg)) {
      const match = msg.match(/^ok(?:\s+([a-záéíóúñü]+))?$/i);
      return { matched: true, handlerName: 'vendedorAprobarFollowup', handlerParams: { nombreLead: match?.[1]?.trim() } };
    }

    // Cancelar follow-up (distinto de cancelar cita)
    const matchCancelarFollowup = msg.match(/^cancelar\s+([a-záéíóúñü]+)$/i);
    if (matchCancelarFollowup && !/^cancelar\s+cita/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorCancelarFollowup', handlerParams: { nombreLead: matchCancelarFollowup[1].trim() } };
    }

    // Editar follow-up
    const matchEditarFollowup = msg.match(/^editar\s+([a-záéíóúñü]+)\s+(.+)$/i);
    if (matchEditarFollowup) {
      return {
        matched: true,
        handlerName: 'vendedorEditarFollowup',
        handlerParams: {
          nombreLead: matchEditarFollowup[1].trim(),
          nuevoMensaje: matchEditarFollowup[2].trim()
        }
      };
    }

    // ═══ CITAS HOY ═══
    if (/^(mis\s+)?citas?(\s+hoy)?$/i.test(msg) || msg === 'ver citas') {
      return { matched: true, handlerName: 'vendedorCitasHoy' };
    }

    // ═══ CITAS MAÑANA ═══
    if (/^(mis\s+)?citas?\s+ma[ñn]ana$/i.test(msg)) {
      return { matched: true, handlerName: 'vendedorCitasManana' };
    }

    // ═══ REAGENDAR LLAMADA - Cambiar hora de llamada programada ═══
    // IMPORTANTE: Debe ir ANTES del reagendar genérico
    // Formatos: "reagendar llamada Juan 3pm", "cambiar llamada de Juan mañana 4pm"
    const reagendarLlamadaMatch = body.match(/^(?:reagendar|cambiar|mover)\s+(?:la\s+)?llamada\s+(?:(?:a|de)\s+)?([a-záéíóúñü]+)\s+(.+)$/i);
    if (reagendarLlamadaMatch) {
      return {
        matched: true,
        handlerName: 'vendedorReagendarLlamada',
        handlerParams: { nombreLead: reagendarLlamadaMatch[1].trim(), nuevaFechaHora: reagendarLlamadaMatch[2].trim() }
      };
    }

    // ═══ REAGENDAR CITA (genérico) ═══
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
    // NOTA: "ver" removido de aquí porque conflictuaba con "ver historial"
    const matchVideo = msg.match(/^(?:video|tour)\s+(.+)$/i);
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

    // ═══ CONTACTAR [nombre] - Enviar template a lead fuera de 24h ═══
    // Formato: "contactar Juan", "contactar roberto"
    const contactarMatch = msg.match(/^contactar\s+([a-záéíóúñü\d]+)$/i);
    if (contactarMatch) {
      return {
        matched: true,
        handlerName: 'vendedorContactarLead',
        handlerParams: { nombreLead: contactarMatch[1].trim() }
      };
    }

    // ═══ NOTA / APUNTE - Agregar nota a un lead ═══
    // Formato flexible: "nota rodrigo hablé por tel", "nota Juan: le interesa", "apunte María presupuesto 2M"
    const notaMatch = msg.match(/^(?:nota|apunte|registrar)\s+([a-záéíóúñü]+)[\s:]+(.+)$/i);
    if (notaMatch) {
      return {
        matched: true,
        handlerName: 'vendedorAgregarNota',
        handlerParams: { nombreLead: notaMatch[1].trim(), textoNota: notaMatch[2].trim() }
      };
    }

    // ═══ VER NOTAS - Ver notas de un lead ═══
    const verNotasMatch = msg.match(/^(?:notas\s+(?:de\s+)?|ver\s+notas\s+(?:de\s+)?)([a-záéíóúñü]+)$/i);
    if (verNotasMatch) {
      return {
        matched: true,
        handlerName: 'vendedorVerNotas',
        handlerParams: { nombreLead: verNotasMatch[1].trim() }
      };
    }

    // ═══ COACHING - Consejos para un lead específico ═══
    const coachMatch = msg.match(/^coach(?:ing)?\s+(.+)$/i);
    if (coachMatch) {
      return {
        matched: true,
        handlerName: 'vendedorCoaching',
        handlerParams: { nombre: coachMatch[1].trim() }
      };
    }

    // ═══ VER / HISTORIAL - Ver conversación completa con un lead ═══
    // Formato: "ver Juan", "historial 4921375548", "chat Juan"
    const verMatch = msg.match(/^(?:ver|historial|chat|conversacion|conversación)\s+(.+)$/i);
    if (verMatch) {
      return {
        matched: true,
        handlerName: 'vendedorVerHistorial',
        handlerParams: { identificador: verMatch[1].trim() }
      };
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

    // ═══ RECORDAR LLAMAR - Programar llamada a un lead ═══
    // Formatos: "recordar llamar Juan mañana 10am", "recordarme Juan lunes 3pm", "llamar a María mañana 4"
    const recordarMatch = body.match(/^(?:recordar(?:me)?|acordarme|avisar(?:me)?)\s+(?:llamar\s+(?:a\s+)?)?([a-záéíóúñü]+)\s+(.+)$/i);
    if (recordarMatch) {
      return {
        matched: true,
        handlerName: 'vendedorRecordarLlamar',
        handlerParams: { nombreLead: recordarMatch[1].trim(), fechaHora: recordarMatch[2].trim() }
      };
    }
    // Formato alternativo: "llamar Juan mañana 10am"
    const llamarMatch = body.match(/^llamar\s+(?:a\s+)?([a-záéíóúñü]+)\s+(mañana|hoy|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|\d{1,2}[/-]\d{1,2})\s+(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|hrs?)?$/i);
    if (llamarMatch) {
      return {
        matched: true,
        handlerName: 'vendedorRecordarLlamar',
        handlerParams: {
          nombreLead: llamarMatch[1].trim(),
          fechaHora: `${llamarMatch[2]} ${llamarMatch[3]}${llamarMatch[4] ? ':' + llamarMatch[4] : ''}`
        }
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
    try {
      console.log(`🏦 ASIGNAR ASESOR: Buscando lead "${nombreLead}" para vendedor ${vendedor.name}`);

      // 1. Buscar el lead por nombre o teléfono
      let lead = null;
      if (telefonoLead) {
        const { data } = await this.supabase.client
          .from('leads')
          .select('*')
          .eq('phone', telefonoLead)
          .single();
        lead = data;
      }

      if (!lead) {
        // Buscar por nombre (normalizado)
        const nombreNorm = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const { data: leads } = await this.supabase.client
          .from('leads')
          .select('*')
          .eq('assigned_to', vendedor.id);

        lead = leads?.find((l: any) => {
          const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return leadNombre.includes(nombreNorm) || nombreNorm.includes(leadNombre);
        });
      }

      if (!lead) {
        console.error(`❌ Lead "${nombreLead}" no encontrado`);
        return { success: false, message: `No encontré ningún lead con el nombre "${nombreLead}". Verifica el nombre o usa el teléfono.` };
      }

      console.log(`✅ Lead encontrado: ${lead.name} (${lead.phone})`);

      // 2. Buscar asesor hipotecario disponible
      const asesores = teamMembers.filter((m: any) =>
        m.active &&
        (m.role === 'asesor' || m.role?.includes('hipoteca') || m.role?.includes('credito'))
      );

      if (asesores.length === 0) {
        console.error('❌ No hay asesores hipotecarios activos');
        return { success: false, message: 'No hay asesores hipotecarios disponibles en este momento. Intenta más tarde.' };
      }

      // Round-robin: elegir asesor con menos carga activa
      let asesor = asesores[0];
      if (asesores.length > 1) {
        // Contar mortgage_applications activas por asesor
        const { data: cargaAsesores } = await this.supabase.client
          .from('mortgage_applications')
          .select('asesor_id')
          .in('status', ['assigned', 'pending', 'docs_requested', 'in_review', 'preapproved'])
          .in('asesor_id', asesores.map((a: any) => a.id));

        const conteo: Record<string, number> = {};
        asesores.forEach((a: any) => conteo[a.id] = 0);
        (cargaAsesores || []).forEach((app: any) => {
          if (conteo[app.asesor_id] !== undefined) conteo[app.asesor_id]++;
        });

        // Seleccionar el que tiene menos carga
        let minCarga = Infinity;
        for (const a of asesores) {
          const carga = conteo[a.id] || 0;
          if (carga < minCarga) {
            minCarga = carga;
            asesor = a;
          }
        }
        console.log(`📊 Carga asesores:`, Object.entries(conteo).map(([id, c]) => `${asesores.find((a: any) => a.id === id)?.name}: ${c}`).join(', '));
      }
      console.log(`✅ Asesor seleccionado: ${asesor.name} (${asesor.phone}) - menor carga`);

      // 3. Verificar si ya existe mortgage_application
      const { data: existingApp } = await this.supabase.client
        .from('mortgage_applications')
        .select('id')
        .eq('lead_id', lead.id)
        .single();

      if (!existingApp) {
        // Crear mortgage_application
        const { error: maError } = await this.supabase.client
          .from('mortgage_applications')
          .insert({
            lead_id: lead.id,
            asesor_id: asesor.id,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
            assigned_by: vendedor.id,
            notes: {
              desarrollo_interes: lead.property_interest,
              asignado_por: vendedor.name
            }
          });

        if (maError) {
          console.error('⚠️ Error creando mortgage_application:', maError);
        } else {
          console.log('✅ mortgage_application creada');
        }
      }

      // 4. Actualizar lead con asesor asignado
      const leadNotes = typeof lead.notes === 'string' ? JSON.parse(lead.notes) : (lead.notes || {});
      leadNotes.asesor_id = asesor.id;
      leadNotes.asesor_name = asesor.name;
      leadNotes.asesor_asignado_at = new Date().toISOString();
      leadNotes.asesor_asignado_por = vendedor.name;

      await this.supabase.client
        .from('leads')
        .update({
          credit_status: 'asesor_assigned',
          notes: leadNotes
        })
        .eq('id', lead.id);

      console.log('✅ Lead actualizado con asesor');

      // 5. Preparar datos para respuesta
      const resultado = {
        success: true,
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          property_interest: lead.property_interest
        },
        asesor: {
          id: asesor.id,
          name: asesor.name,
          phone: asesor.phone,
          is_active: asesor.active
        },
        vendedor: {
          id: vendedor.id,
          name: vendedor.name,
          phone: vendedor.phone
        },
        message: `✅ *${lead.name}* asignado al asesor *${asesor.name}*\n\nEl asesor recibirá una notificación para contactar al cliente.`
      };

      console.log('✅ Asignación completada:', resultado);
      return resultado;

    } catch (e) {
      console.error('❌ Error en asignarAsesorHipotecario:', e);
      return { success: false, message: 'Error interno al asignar asesor. Intenta de nuevo.' };
    }
  }

  async preguntarAsesorCredito(nombreLead: string, vendedor: any, teamMembers: any[]): Promise<any> {
    try {
      console.log(`💬 PREGUNTAR ASESOR: Buscando lead "${nombreLead}" para vendedor ${vendedor.name}`);

      // 1. Buscar el lead por nombre
      const nombreNorm = nombreLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id);

      const lead = leads?.find((l: any) => {
        const leadNombre = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return leadNombre.includes(nombreNorm) || nombreNorm.includes(leadNombre);
      });

      if (!lead) {
        return { success: false, error: `❌ No encontré a "${nombreLead}" en tus leads.` };
      }

      // 2. Buscar la mortgage_application del lead
      const { data: solicitud } = await this.supabase.client
        .from('mortgage_applications')
        .select('*, asesor:asesor_id(*)')
        .eq('lead_id', lead.id)
        .single();

      if (!solicitud || !solicitud.asesor_id) {
        return { success: false, error: `❌ ${lead.name} no tiene asesor hipotecario asignado.\n\n💡 Usa: *asignar asesor ${lead.name}*` };
      }

      // 3. Obtener datos del asesor
      const asesor = teamMembers.find((m: any) => m.id === solicitud.asesor_id);
      if (!asesor) {
        return { success: false, error: `❌ El asesor asignado ya no está activo.` };
      }

      return {
        success: true,
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone
        },
        asesor: {
          id: asesor.id,
          name: asesor.name,
          phone: asesor.phone,
          is_active: asesor.active
        },
        solicitud: {
          id: solicitud.id,
          status: solicitud.status,
          assigned_at: solicitud.assigned_at
        },
        vendedor: {
          id: vendedor.id,
          name: vendedor.name
        }
      };

    } catch (e) {
      console.error('❌ Error en preguntarAsesorCredito:', e);
      return { success: false, error: 'Error interno. Intenta de nuevo.' };
    }
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
        appointment_type,
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
      const esLlamada = cita.appointment_type === 'llamada';
      const icono = esLlamada ? '📞' : (cita.status === 'confirmed' ? '✅' : '📋');
      const tipo = esLlamada ? 'Llamada' : 'Cita';
      msg += `${icono} *${hora}* - ${leadName} (${tipo})\n`;
    });

    msg += `\n💡 Para reagendar: *reagendar [nombre] [día] [hora]*`;
    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CITAS MAÑANA
  // ═══════════════════════════════════════════════════════════════════
  async getCitasManana(vendedorId: string, esAdmin: boolean): Promise<any[]> {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const mananaStr = manana.toISOString().split('T')[0];

    let query = this.supabase.client
      .from('appointments')
      .select(`
        id,
        scheduled_date,
        scheduled_time,
        status,
        appointment_type,
        lead_id,
        leads!inner(name, phone)
      `)
      .eq('scheduled_date', mananaStr)
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_time', { ascending: true });

    if (!esAdmin) {
      query = query.eq('vendedor_id', vendedorId);
    }

    const { data, error } = await query;
    if (error) {
      console.log('Error getCitasManana:', error);
      return [];
    }
    return data || [];
  }

  formatCitasManana(citas: any[], nombre: string, esAdmin: boolean): string {
    if (!citas || citas.length === 0) {
      return `📅 *${nombre}, no tienes citas mañana*\n\n¿Quieres agendar una?\nEscribe: *agendar cita con [nombre]*`;
    }

    let msg = `📅 *CITAS DE MAÑANA* (${citas.length})\n\n`;

    citas.forEach((cita, i) => {
      const hora = cita.scheduled_time?.slice(0, 5) || '??:??';
      const leadName = cita.leads?.name || 'Sin nombre';
      const esLlamada = cita.appointment_type === 'llamada';
      const icono = esLlamada ? '📞' : (cita.status === 'confirmed' ? '✅' : '📋');
      const tipo = esLlamada ? 'Llamada' : 'Cita';
      msg += `${icono} *${hora}* - ${leadName} (${tipo})\n`;
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
      .select('id, name, status, phone')
      .eq('assigned_to', vendedorId)
      .not('status', 'in', '("won","lost","dnc","delivered")')
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
      const etapa = l.status || 'new';
      if (!porEtapa[etapa]) porEtapa[etapa] = [];
      porEtapa[etapa].push(l);
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
  // FORMATOS PARA ASESOR HIPOTECARIO
  // ═══════════════════════════════════════════════════════════════════

  formatMensajeAsesorNuevoLead(lead: any, vendedor: any): string {
    const desarrollo = lead.property_interest || 'No especificado';
    return `🏦 *NUEVO LEAD ASIGNADO*\n\n` +
      `👤 *Cliente:* ${lead.name}\n` +
      `📱 *Teléfono:* ${lead.phone}\n` +
      `🏠 *Interés:* ${desarrollo}\n` +
      `👨‍💼 *Asignado por:* ${vendedor.name}\n\n` +
      `📋 Por favor contacta al cliente para iniciar el proceso de crédito.`;
  }

  formatConfirmacionAsesorAsignado(lead: any, asesor: any): string {
    return `✅ *Asesor Asignado*\n\n` +
      `👤 Lead: ${lead.name}\n` +
      `🏦 Asesor: ${asesor.name}\n` +
      `📱 Tel asesor: ${asesor.phone}\n\n` +
      `El asesor ha sido notificado y contactará al cliente.`;
  }

  formatMultipleLeadsAsesor(leads: any[], nombreBuscado: string): string {
    let msg = `⚠️ Encontré ${leads.length} leads con "${nombreBuscado}":\n\n`;
    leads.slice(0, 5).forEach((l, i) => {
      msg += `${i + 1}. ${l.name} - ${l.phone}\n`;
    });
    msg += `\n💡 Usa: *asignar asesor [nombre completo]*`;
    return msg;
  }

  formatMensajeAsesorPregunta(lead: any, solicitud: any, vendedor: any): string {
    return `💬 *CONSULTA DE VENDEDOR*\n\n` +
      `👨‍💼 *De:* ${vendedor.name}\n` +
      `👤 *Sobre lead:* ${lead.name}\n` +
      `📱 *Tel:* ${lead.phone}\n\n` +
      `📋 *Status actual:* ${solicitud?.status || 'Sin solicitud'}\n\n` +
      `Por favor responde con el estado del crédito de este cliente.`;
  }

  formatConfirmacionPreguntaEnviada(asesor: any, lead: any): string {
    return `✅ *Pregunta enviada*\n\n` +
      `Se notificó al asesor ${asesor.name} sobre el lead ${lead.name}.\n` +
      `Te responderá pronto con el status del crédito.`;
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

  // ═══════════════════════════════════════════════════════════════════
  // NOTAS DE LEADS
  // ═══════════════════════════════════════════════════════════════════

  parseAgregarNota(body: string): { nombreLead: string | null; textoNota: string | null } {
    // Formato flexible: "nota rodrigo hablé por tel", "nota Juan: le interesa"
    const match = body.match(/^(?:nota|apunte|registrar)\s+([a-záéíóúñü]+)[\s:]+(.+)$/i);
    if (match) {
      return { nombreLead: match[1].trim(), textoNota: match[2].trim() };
    }
    return { nombreLead: null, textoNota: null };
  }

  parseVerNotas(body: string): string | null {
    const match = body.match(/^(?:notas\s+(?:de\s+)?|ver\s+notas\s+(?:de\s+)?)([a-záéíóúñü]+)$/i);
    return match ? match[1].trim() : null;
  }

  getMensajeAyudaAgregarNota(): string {
    return `📝 *Para agregar una nota escribe:*\n\n` +
      `*nota [nombre] [texto]*\n\n` +
      `*Ejemplos:*\n` +
      `• nota Juan hablé por tel, quiere visita sábado\n` +
      `• nota María le interesa el jardín\n` +
      `• apunte Pedro presupuesto 2M`;
  }

  getMensajeAyudaVerNotas(): string {
    return `📋 *Para ver notas escribe:*\n\n` +
      `*notas [nombre]*\n\n` +
      `Ejemplo: notas Juan`;
  }

  async agregarNotaPorNombre(
    nombreLead: string,
    textoNota: string,
    vendedorId: string,
    vendedorName: string
  ): Promise<{ success: boolean; error?: string; multipleLeads?: any[]; lead?: any; totalNotas?: number }> {
    try {
      // Buscar lead
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, notes, assigned_to')
        .ilike('name', `%${nombreLead}%`)
        .eq('assigned_to', vendedorId)
        .limit(5);

      if (!leads || leads.length === 0) {
        return { success: false, error: `No encontré a "${nombreLead}" en tus leads.` };
      }

      if (leads.length > 1) {
        const exactMatch = leads.find(l => l.name.toLowerCase() === nombreLead.toLowerCase());
        if (!exactMatch) {
          return { success: false, multipleLeads: leads };
        }
        leads.splice(0, leads.length, exactMatch);
      }

      const lead = leads[0];
      const notasLead = typeof lead.notes === 'object' ? lead.notes : {};
      const notasArray = notasLead.notas_vendedor || [];

      // Agregar nueva nota
      notasArray.push({
        texto: textoNota,
        por: vendedorName,
        fecha: new Date().toISOString()
      });

      notasLead.notas_vendedor = notasArray;

      await this.supabase.client
        .from('leads')
        .update({ notes: notasLead, updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      // Guardar en lead_activities para que aparezca en el CRM
      // Usamos 'whatsapp' porque es el único tipo que el CRM muestra bien
      const { error: actError } = await this.supabase.client.from('lead_activities').insert({
        lead_id: lead.id,
        team_member_id: vendedorId,
        activity_type: 'whatsapp',
        notes: `📝 NOTA: ${textoNota}`,
        created_at: new Date().toISOString()
      });

      if (actError) {
        console.error(`⚠️ Error guardando nota en activities:`, actError);
      } else {
        console.log(`📝 Nota agregada a ${lead.name} por ${vendedorName} (+ lead_activities): "${textoNota.substring(0, 50)}..."`);
      }

      return { success: true, lead, totalNotas: notasArray.length };
    } catch (e) {
      console.error('Error agregando nota:', e);
      return { success: false, error: 'Error al agregar nota' };
    }
  }

  async getLeadNotas(nombreLead: string, vendedorId: string): Promise<{ success: boolean; error?: string; lead?: any }> {
    try {
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, notes')
        .ilike('name', `%${nombreLead}%`)
        .eq('assigned_to', vendedorId)
        .limit(1);

      if (!leads || leads.length === 0) {
        return { success: false, error: `No encontré a "${nombreLead}"` };
      }

      return { success: true, lead: leads[0] };
    } catch (e) {
      return { success: false, error: 'Error al buscar notas' };
    }
  }

  async getLlamarLead(nombreLead: string, vendedorId: string): Promise<{ found: boolean; lead?: any; error?: string }> {
    try {
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, property_interest, notes, assigned_to')
        .ilike('name', `%${nombreLead}%`)
        .eq('assigned_to', vendedorId)
        .limit(1);

      if (!leads || leads.length === 0) {
        return { found: false, error: `No encontré a "${nombreLead}"` };
      }

      return { found: true, lead: leads[0] };
    } catch (e) {
      return { found: false, error: 'Error al buscar lead' };
    }
  }

  formatNotaAgregada(nombreLead: string, textoNota: string, totalNotas: number): string {
    return `✅ *Nota guardada para ${nombreLead}*\n\n` +
      `📝 "${textoNota}"\n\n` +
      `_Total: ${totalNotas} nota${totalNotas > 1 ? 's' : ''}_`;
  }

  formatMultipleLeadsNotas(leads: any[]): string {
    let msg = `🔍 Encontré ${leads.length} leads:\n\n`;
    leads.forEach((l, i) => {
      msg += `${i + 1}. ${l.name}\n`;
    });
    msg += `\n💡 Sé más específico con el nombre`;
    return msg;
  }

  formatLeadNotas(lead: any): string {
    const notasLead = typeof lead.notes === 'object' ? lead.notes : {};
    const notasArray = notasLead.notas_vendedor || [];

    if (notasArray.length === 0) {
      return `📋 *${lead.name}* no tiene notas guardadas.\n\n` +
        `💡 Agrega una: *nota ${lead.name.split(' ')[0]} [texto]*`;
    }

    let msg = `📋 *Notas de ${lead.name}* (${notasArray.length}):\n\n`;
    notasArray.slice(-5).forEach((nota: any, i: number) => {
      const fecha = nota.fecha ? new Date(nota.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '';
      msg += `${i + 1}. ${nota.texto}\n   _${nota.por || 'Vendedor'} - ${fecha}_\n\n`;
    });

    return msg;
  }
}
