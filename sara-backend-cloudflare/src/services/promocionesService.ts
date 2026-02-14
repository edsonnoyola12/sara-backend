/**
 * PROMOCIONES SERVICE - Gestión de promociones de marketing
 */

import { SupabaseService } from './supabase';

export class PromocionesService {
  constructor(private supabase: SupabaseService) {}

  async getPromocionesActivas(limit = 10): Promise<any[]> {
    try {
      const { data } = await this.supabase.client
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      return data || [];
    } catch (e) {
      console.log('Error obteniendo promociones:', e);
      return [];
    }
  }

  formatPromocionesLista(promos: any[], nombre: string): string {
    if (!promos || promos.length === 0) {
      return `*PROMOCIONES ACTIVAS*\n${nombre}\n\nNo hay promociones activas actualmente.`;
    }

    let msg = `*PROMOCIONES ACTIVAS*\n${nombre}\n\n`;
    promos.forEach((p: any, i: number) => {
      msg += `${i + 1}. *${p.name || p.title || 'Sin nombre'}*\n`;
      if (p.description) msg += `   ${p.description.substring(0, 80)}\n`;
      if (p.segment) msg += `   Segmento: ${p.segment}\n`;
      if (p.start_date) msg += `   Desde: ${p.start_date}\n`;
      msg += '\n';
    });
    return msg.trim();
  }

  parseCrearPromocion(body: string): any | null {
    // Formato: crear promo [nombre] | [descripción] | [segmento]
    const match = body.match(/(?:crear promo|nueva promo)\s+(.+)/i);
    if (!match) return null;

    const partes = match[1].split('|').map((s: string) => s.trim());
    if (partes.length < 1) return null;

    return {
      nombre: partes[0],
      descripcion: partes[1] || '',
      segmento: partes[2] || 'todos',
      mensaje: partes[3] || partes[1] || partes[0]
    };
  }

  getMensajeAyudaCrearPromocion(): string {
    return `*CREAR PROMOCIÓN*\n\nFormato:\n*crear promo [nombre] | [descripción] | [segmento]*\n\nEjemplo:\ncrear promo Descuento Verano | 10% en Monte Verde | hot`;
  }

  async crearPromocion(datos: any, createdBy: string): Promise<{ promo: any; error?: string }> {
    try {
      const { data, error } = await this.supabase.client
        .from('promotions')
        .insert({
          name: datos.nombre,
          title: datos.nombre,
          description: datos.descripcion,
          segment: datos.segmento,
          is_active: true,
          created_by: createdBy,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando promoción:', error);
        return { promo: null, error: 'Error al crear la promoción.' };
      }
      return { promo: data };
    } catch (e) {
      console.error('Error en crearPromocion:', e);
      return { promo: null, error: 'Error al crear la promoción.' };
    }
  }

  async contarLeadsSegmento(segmento: string): Promise<number> {
    try {
      const { count } = await this.supabase.client
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '(lost,inactive)');
      return count || 0;
    } catch (e) {
      return 0;
    }
  }

  formatPromocionCreada(datos: any, leadsCount: number): string {
    return `✅ *Promoción creada*\n\n` +
      `📣 ${datos.nombre}\n` +
      `📝 ${datos.descripcion || 'Sin descripción'}\n` +
      `🎯 Segmento: ${datos.segmento}\n` +
      `👥 Leads elegibles: ${leadsCount}`;
  }

  parseNombrePromocion(body: string, accion: string): string | null {
    const regex = new RegExp(`${accion}\\s+promo\\s+(.+)`, 'i');
    const match = body.match(regex);
    return match ? match[1].trim() : null;
  }

  async pausarPromocion(nombre: string): Promise<{ promo: any; error?: string }> {
    try {
      const { data: promo } = await this.supabase.client
        .from('promotions')
        .select('*')
        .ilike('name', `%${nombre}%`)
        .eq('is_active', true)
        .maybeSingle();

      if (!promo) {
        return { promo: null, error: `No encontré promoción activa "${nombre}".` };
      }

      await this.supabase.client
        .from('promotions')
        .update({ is_active: false })
        .eq('id', promo.id);

      return { promo };
    } catch (e) {
      console.error('Error pausando promoción:', e);
      return { promo: null, error: 'Error al pausar la promoción.' };
    }
  }

  async activarPromocion(nombre: string): Promise<{ promo: any; error?: string }> {
    try {
      const { data: promo } = await this.supabase.client
        .from('promotions')
        .select('*')
        .ilike('name', `%${nombre}%`)
        .eq('is_active', false)
        .maybeSingle();

      if (!promo) {
        return { promo: null, error: `No encontré promoción pausada "${nombre}".` };
      }

      await this.supabase.client
        .from('promotions')
        .update({ is_active: true })
        .eq('id', promo.id);

      return { promo };
    } catch (e) {
      console.error('Error activando promoción:', e);
      return { promo: null, error: 'Error al activar la promoción.' };
    }
  }

  formatPromoPausada(promo: any): string {
    return `⏸️ *Promoción pausada*\n\n` +
      `📣 ${promo.name || promo.title}\n` +
      `Ya no se enviará a nuevos leads.`;
  }

  formatPromoActivada(promo: any): string {
    return `▶️ *Promoción activada*\n\n` +
      `📣 ${promo.name || promo.title}\n` +
      `Se enviará a leads del segmento configurado.`;
  }
}
