import { SupabaseService } from './supabase';
import { findLeadByName } from '../handlers/whatsapp-utils';

interface DatosApartado {
  nombreLead: string;
  propiedad: string;
  enganche: number;
  fechaPago?: string;
}

interface ResultadoOperacion {
  success: boolean;
  error?: string;
  lead?: any;
  multipleLeads?: any[];
}

export class VentasService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════
  // APARTADO - Registrar apartado de propiedad
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parsea el mensaje de apartado
   * Formato: "apartar Juan en Distrito Falco 50000 para el 20 enero"
   */
  parseApartado(body: string, match: RegExpMatchArray): DatosApartado {
    // El match ya tiene grupos capturados del regex en whatsapp.ts
    // Ejemplo regex: /apartar\s+([a-záéíóúñ\s]+)\s+(?:en\s+)?([a-záéíóúñ\s]+)\s+(\d+)/i
    const nombreLead = match[1]?.trim() || '';
    const propiedad = match[2]?.trim() || '';
    const enganche = parseInt(match[3] || '0', 10);

    // Buscar fecha opcional
    const fechaMatch = body.match(/para\s+(?:el\s+)?(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)/i);
    let fechaPago: string | undefined;
    if (fechaMatch) {
      const dia = fechaMatch[1];
      const mes = fechaMatch[2];
      fechaPago = `${dia} de ${mes}`;
    }

    return { nombreLead, propiedad, enganche, fechaPago };
  }

  /**
   * Registra el apartado en la base de datos
   */
  async registrarApartado(datos: DatosApartado, vendedor: any): Promise<ResultadoOperacion> {
    try {
      // Buscar lead por nombre (con fallback accent-tolerant)
      const leads = await findLeadByName(this.supabase, datos.nombreLead, {
        vendedorId: vendedor.id
      });

      if (!leads || leads.length === 0) {
        return { success: false, error: `No encontré a "${datos.nombreLead}" en tus leads` };
      }

      if (leads.length > 1) {
        return { success: false, multipleLeads: leads };
      }

      const lead = leads[0];

      // Actualizar lead a status reserved
      const { error: updateError } = await this.supabase.client
        .from('leads')
        .update({
          status: 'reserved',
          property_interest: datos.propiedad,
          notes: {
            ...((typeof lead.notes === 'object' && lead.notes) || {}),
            apartado: {
              enganche: datos.enganche,
              fecha_pago: datos.fechaPago,
              fecha_registro: new Date().toISOString(),
              registrado_por: vendedor.name
            }
          }
        })
        .eq('id', lead.id);

      if (updateError) {
        return { success: false, error: 'Error actualizando lead' };
      }

      return {
        success: true,
        lead: { ...lead, property_interest: datos.propiedad }
      };
    } catch (e) {
      console.error('❌ Error en registrarApartado:', e);
      return { success: false, error: 'Error interno' };
    }
  }

  /**
   * Formato cuando hay múltiples leads con el mismo nombre
   */
  formatMultipleLeadsApartado(leads: any[]): string {
    const lista = leads.map((l, i) =>
      `${i + 1}. ${l.name} - ${l.phone?.slice(-4) || 'sin tel'} - ${l.status}`
    ).join('\n');

    return `🔍 Encontré varios leads con ese nombre:\n\n${lista}\n\n` +
           `Escribe el nombre completo o usa el teléfono para identificarlo.`;
  }

  /**
   * Mensaje de éxito al vendedor
   */
  formatApartadoExito(result: ResultadoOperacion): string {
    const lead = result.lead;
    const notas = lead?.notes?.apartado || {};

    return `✅ *APARTADO REGISTRADO*\n\n` +
           `👤 Cliente: ${lead?.name || 'N/A'}\n` +
           `🏠 Propiedad: ${lead?.property_interest || 'N/A'}\n` +
           `💰 Enganche: $${notas.enganche?.toLocaleString() || 0}\n` +
           (notas.fecha_pago ? `📅 Fecha pago: ${notas.fecha_pago}\n` : '') +
           `\n¡Felicidades por el apartado! 🎉`;
  }

  /**
   * Mensaje de felicitación al cliente
   */
  formatMensajeClienteApartado(lead: any, propiedad: string, vendedor: any): string {
    return `🎉 *¡Felicidades ${lead.name || ''}!*\n\n` +
           `Tu apartado en *${propiedad}* ha sido registrado exitosamente.\n\n` +
           `Tu asesor *${vendedor.name}* te dará seguimiento con los próximos pasos.\n\n` +
           `¡Bienvenido a la familia Grupo Santa Rita! 🏡`;
  }

  // ═══════════════════════════════════════════════════════════════
  // CERRAR VENTA - Marcar lead como venta cerrada
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parsea el nombre del lead del mensaje
   * Formato: "cerrar venta Juan García" o "venta cerrada Juan"
   */
  parseCerrarVenta(body: string): string | null {
    const match = body.match(/(?:cerrar\s+venta|venta\s+cerrada|cerrar)\s+(?:de\s+|con\s+)?([a-záéíóúñ\s]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Mensaje de ayuda cuando no se proporciona nombre
   */
  getMensajeAyudaCerrarVenta(): string {
    return `📝 *¿Cómo cerrar una venta?*\n\n` +
           `Escribe:\n` +
           `*"Cerrar venta Juan García"*\n\n` +
           `Esto cambiará el status del lead a "Venta Cerrada" 🎉`;
  }

  /**
   * Cierra la venta de un lead
   */
  async cerrarVenta(nombreLead: string, vendedor: any): Promise<ResultadoOperacion> {
    try {
      const leads = await findLeadByName(this.supabase, nombreLead, {
        vendedorId: vendedor.id
      });

      if (!leads || leads.length === 0) {
        return { success: false, error: `No encontré a "${nombreLead}" en tus leads` };
      }

      if (leads.length > 1) {
        return { success: false, multipleLeads: leads };
      }

      const lead = leads[0];

      const fechaVenta = new Date().toISOString();
      const { error: updateError } = await this.supabase.client
        .from('leads')
        .update({
          status: 'sold',
          status_changed_at: fechaVenta,
          purchase_date: fechaVenta.split('T')[0], // Solo fecha YYYY-MM-DD
          notes: {
            ...((typeof lead.notes === 'object' && lead.notes) || {}),
            venta_cerrada: {
              fecha: fechaVenta,
              cerrada_por: vendedor.name
            }
          }
        })
        .eq('id', lead.id);

      if (updateError) {
        return { success: false, error: 'Error actualizando lead' };
      }

      return { success: true, lead };
    } catch (e) {
      console.error('❌ Error en cerrarVenta:', e);
      return { success: false, error: 'Error interno' };
    }
  }

  /**
   * Mensaje de éxito al cerrar venta
   */
  formatCerrarVentaExito(lead: any, vendedorNombre: string): string {
    return `🎉 *¡VENTA CERRADA!*\n\n` +
           `👤 Cliente: ${lead.name || 'N/A'}\n` +
           `🏠 Propiedad: ${lead.property_interest || 'N/A'}\n` +
           `📅 Fecha: ${new Date().toLocaleDateString('es-MX')}\n\n` +
           `¡Felicidades ${vendedorNombre}! 🏆`;
  }

  // ═══════════════════════════════════════════════════════════════
  // CANCELAR LEAD - Marcar lead como caído
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parsea el nombre del lead a cancelar
   * Formato: "cancelar Juan" o "lead caido Juan García"
   */
  parseCancelarLead(body: string): string | null {
    const match = body.match(/(?:cancelar|caido|caído|descartar)\s+(?:lead\s+)?(?:de\s+|a\s+)?([a-záéíóúñ\s]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Mensaje de ayuda cuando no se proporciona nombre
   */
  getMensajeAyudaCancelarLead(): string {
    return `📝 *¿Cómo cancelar un lead?*\n\n` +
           `Escribe:\n` +
           `*"Cancelar Juan García"*\n` +
           `*"Lead caído María López"*\n\n` +
           `Esto marcará al lead como "Caído" en el sistema.`;
  }

  /**
   * Cancela un lead (marca como fallen)
   */
  async cancelarLead(nombreLead: string, vendedor: any): Promise<ResultadoOperacion> {
    try {
      const leads = await findLeadByName(this.supabase, nombreLead, {
        vendedorId: vendedor.id
      });

      if (!leads || leads.length === 0) {
        return { success: false, error: `No encontré a "${nombreLead}" en tus leads` };
      }

      if (leads.length > 1) {
        return { success: false, multipleLeads: leads };
      }

      const lead = leads[0];

      const { error: updateError } = await this.supabase.client
        .from('leads')
        .update({
          status: 'fallen',
          status_changed_at: new Date().toISOString(),
          fallen_reason: 'Cancelado por vendedor',
          notes: {
            ...((typeof lead.notes === 'object' && lead.notes) || {}),
            cancelacion: {
              fecha: new Date().toISOString(),
              cancelado_por: vendedor.name
            }
          }
        })
        .eq('id', lead.id);

      if (updateError) {
        return { success: false, error: 'Error actualizando lead' };
      }

      return { success: true, lead };
    } catch (e) {
      console.error('❌ Error en cancelarLead:', e);
      return { success: false, error: 'Error interno' };
    }
  }

  /**
   * Formato cuando hay múltiples leads para cancelar
   */
  formatMultipleLeadsCancelar(leads: any[]): string {
    const lista = leads.map((l, i) =>
      `${i + 1}. ${l.name} - ${l.phone?.slice(-4) || 'sin tel'} - ${l.status}`
    ).join('\n');

    return `🔍 Encontré varios leads con ese nombre:\n\n${lista}\n\n` +
           `Escribe el nombre completo para cancelar el correcto.`;
  }

  /**
   * Mensaje de éxito al cancelar lead
   */
  formatCancelarLeadExito(lead: any): string {
    return `✅ Lead cancelado\n\n` +
           `👤 ${lead.name || 'N/A'}\n` +
           `📱 ${lead.phone || 'N/A'}\n\n` +
           `Status: Caído ❌`;
  }
}
