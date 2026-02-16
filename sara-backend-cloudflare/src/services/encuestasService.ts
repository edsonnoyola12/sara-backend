import { SupabaseService } from './supabase';

export class EncuestasService {
  constructor(private supabase: SupabaseService) {}

  async buscarLeadConEncuestaPostVisita(phone: string): Promise<any | null> {
    try {
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      console.log(`📋 ENCUESTA: Buscando lead con phone suffix: ${phoneSuffix} (original: ${phone})`);

      // Buscar lead con encuesta pendiente en notas
      const { data: leads, error } = await this.supabase.client
        .from('leads')
        .select('*')
        .ilike('phone', `%${phoneSuffix}`);

      if (error) {
        console.error(`📋 ENCUESTA: Error buscando leads:`, error.message);
        return null;
      }

      console.log(`📋 ENCUESTA: Encontrados ${leads?.length || 0} leads con ese teléfono`);

      if (!leads || leads.length === 0) return null;

      // Buscar uno que tenga pending_client_survey en notas
      for (const lead of leads) {
        const notas = typeof lead.notes === 'object' ? lead.notes : {};
        const tienePendiente = !!notas.pending_client_survey;
        console.log(`📋 ENCUESTA: Lead ${lead.name} (${lead.id}) - pending_client_survey: ${tienePendiente}`);
        if (tienePendiente) {
          console.log(`📋 ENCUESTA: ¡ENCONTRADO! Lead ${lead.name} tiene encuesta pendiente`);
          return lead;
        }
      }

      console.log(`📋 ENCUESTA: Ningún lead tiene pending_client_survey`);
      return null;
    } catch (e: any) {
      console.error(`📋 ENCUESTA: Error inesperado:`, e.message || e);
      return null;
    }
  }

  async buscarEncuestaPendiente(phone: string): Promise<any | null> {
    // Alias de buscarLeadConEncuestaPostVisita para compatibilidad
    return this.buscarLeadConEncuestaPostVisita(phone);
  }

  procesarRespuestaPostVisita(mensaje: string, nombreLead: string, survey: any): {
    tipo: 'positivo' | 'negativo' | 'neutral';
    respuestaCliente: string;
    notificarVendedor: string;
  } {
    const msgLower = mensaje.toLowerCase().trim();
    const nombreCorto = (nombreLead || 'amigo').split(' ')[0] || 'amigo';

    // PRIMERO: Detectar respuestas numéricas (1, 2, 3)
    // 1️⃣ Me encantó, quiero avanzar → positivo
    // 2️⃣ Quiero ver más opciones → neutral
    // 3️⃣ Tengo dudas → neutral (requiere seguimiento)
    let tipo: 'positivo' | 'negativo' | 'neutral' = 'neutral';
    let respuestaEspecifica = '';

    if (msgLower === '1' || msgLower.includes('me encantó') || msgLower.includes('quiero avanzar')) {
      tipo = 'positivo';
      respuestaEspecifica = `¡Excelente ${nombreCorto}! 🎉 Me da mucho gusto que te haya encantado. Tu asesor te contactará pronto para continuar con el proceso. ¡Estamos muy emocionados de ayudarte a conseguir tu casa!`;
    } else if (msgLower === '2' || msgLower.includes('más opciones') || msgLower.includes('ver otras')) {
      tipo = 'neutral';
      respuestaEspecifica = `Perfecto ${nombreCorto} 👍 Con gusto te mostramos más opciones. Tu asesor te contactará para coordinar otra visita. ¿Hay algún desarrollo en particular que te interese conocer?`;
    } else if (msgLower === '3' || msgLower.includes('dudas') || msgLower.includes('preguntas')) {
      tipo = 'neutral';
      respuestaEspecifica = `Entendido ${nombreCorto} 🤝 Tu asesor se pondrá en contacto contigo para resolver todas tus dudas. ¿Hay algo específico que te gustaría aclarar?`;
    }

    // SEGUNDO: Si no es número, detectar por palabras clave
    if (!respuestaEspecifica) {
      const positivas = ['bien', 'excelente', 'genial', 'perfecto', 'gracias', 'muy bien', 'contento', 'feliz', 'me gustó', 'encantó', 'increíble', 'padre'];
      const negativas = ['mal', 'pésimo', 'horrible', 'no me gustó', 'molesto', 'decepcionado', 'terrible', 'feo', 'caro'];

      if (positivas.some(p => msgLower.includes(p))) {
        tipo = 'positivo';
      } else if (negativas.some(n => msgLower.includes(n))) {
        tipo = 'negativo';
      }
    }

    // Respuestas por defecto si no hay específica
    const respuestas = {
      positivo: respuestaEspecifica || `¡Qué gusto ${nombreCorto}! 🎉 Tu asesor te contactará para continuar con el proceso.`,
      negativo: `Lamento escuchar eso ${nombreCorto}. Tu feedback es muy importante. Tu asesor te contactará para resolver cualquier inquietud.`,
      neutral: respuestaEspecifica || `Gracias por tu respuesta ${nombreCorto}. Tu asesor se pondrá en contacto contigo pronto.`
    };

    const notificaciones = {
      positivo: `✅ *MUY INTERESADO - ${nombreLead}*\n\n🔥 Respondió: "${mensaje}"\n\n*¡Dar seguimiento prioritario!*`,
      negativo: `⚠️ *Feedback negativo de ${nombreLead}*\n\nRespuesta: "${mensaje}"\n\n*Se recomienda llamar para entender qué pasó*`,
      neutral: `📋 *Feedback de ${nombreLead}*\n\nRespuesta: "${mensaje}"`
    };

    return {
      tipo,
      respuestaCliente: respuestas[tipo],
      notificarVendedor: notificaciones[tipo]
    };
  }

  async guardarRespuestaPostVisita(leadId: string, notasActuales: any, tipo: string, mensaje: string): Promise<void> {
    try {
      const notas = typeof notasActuales === 'object' ? { ...notasActuales } : {};

      // Guardar respuesta y limpiar encuesta pendiente
      notas.survey_response = {
        tipo,
        mensaje: mensaje.substring(0, 500),
        fecha: new Date().toISOString()
      };
      delete notas.pending_client_survey;

      await this.supabase.client
        .from('leads')
        .update({ notes: notas })
        .eq('id', leadId);
    } catch (e) {
      console.error('Error guardando respuesta encuesta:', e);
    }
  }

  async obtenerTelefonoVendedor(vendedorId: string): Promise<string | null> {
    try {
      const { data } = await this.supabase.client
        .from('team_members')
        .select('phone')
        .eq('id', vendedorId)
        .single();

      return data?.phone || null;
    } catch (e) {
      return null;
    }
  }

  formatMensajeResultado(encuesta: any, comentario?: string): string {
    const resultado = encuesta.resultado || 'pendiente';
    const fecha = encuesta.fecha ? new Date(encuesta.fecha).toLocaleDateString('es-MX') : 'N/A';

    let mensaje = `📋 *Resultado de encuesta*\n\n`;
    mensaje += `Fecha: ${fecha}\n`;
    mensaje += `Resultado: ${resultado}\n`;

    if (comentario) {
      mensaje += `\nComentario: ${comentario}`;
    }

    return mensaje;
  }

  async procesarRespuestaEncuesta(leadId: string, respuesta: string): Promise<{ success: boolean; mensaje?: string }> {
    try {
      await this.supabase.client
        .from('leads')
        .update({
          encuesta_post_visita_pendiente: false,
          encuesta_post_visita_respuesta: respuesta,
          encuesta_post_visita_fecha: new Date().toISOString()
        })
        .eq('id', leadId);

      return { success: true, mensaje: 'Gracias por tu respuesta' };
    } catch (e) {
      return { success: false };
    }
  }
}
