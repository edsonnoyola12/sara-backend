import { SupabaseService } from './supabase';

export class EncuestasService {
  constructor(private supabase: SupabaseService) {}

  async buscarLeadConEncuestaPostVisita(phone: string): Promise<any | null> {
    try {
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);

      // Buscar lead con encuesta pendiente en notas
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .ilike('phone', `%${phoneSuffix}`);

      if (!leads) return null;

      // Buscar uno que tenga pending_client_survey en notas
      for (const lead of leads) {
        const notas = typeof lead.notes === 'object' ? lead.notes : {};
        if (notas.pending_client_survey) {
          return lead;
        }
      }

      return null;
    } catch (e) {
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
    const msgLower = mensaje.toLowerCase();

    // Detectar sentimiento
    const positivas = ['bien', 'excelente', 'genial', 'perfecto', 'gracias', 'muy bien', 'contento', 'feliz', 'me gustó', 'encantó'];
    const negativas = ['mal', 'pésimo', 'horrible', 'no me gustó', 'molesto', 'decepcionado', 'terrible'];

    let tipo: 'positivo' | 'negativo' | 'neutral' = 'neutral';
    if (positivas.some(p => msgLower.includes(p))) {
      tipo = 'positivo';
    } else if (negativas.some(n => msgLower.includes(n))) {
      tipo = 'negativo';
    }

    const respuestas = {
      positivo: `¡Qué gusto que te haya ido bien, ${nombreLead}! 🎉 Cualquier duda que tengas, aquí estamos para ayudarte.`,
      negativo: `Lamento escuchar eso, ${nombreLead}. Tu feedback es muy importante para nosotros. Voy a notificar a tu asesor para que te contacte.`,
      neutral: `Gracias por tu respuesta, ${nombreLead}. ¿Hay algo más en lo que pueda ayudarte?`
    };

    const notificaciones = {
      positivo: `✅ *Feedback positivo de ${nombreLead}*\n\nRespuesta: "${mensaje.substring(0, 200)}"`,
      negativo: `⚠️ *Feedback negativo de ${nombreLead}*\n\nRespuesta: "${mensaje.substring(0, 200)}"\n\n*Se recomienda dar seguimiento*`,
      neutral: `📋 *Feedback de ${nombreLead}*\n\nRespuesta: "${mensaje.substring(0, 200)}"`
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
