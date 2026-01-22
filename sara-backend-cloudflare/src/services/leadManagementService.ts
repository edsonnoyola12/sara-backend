import { SupabaseService } from './supabase';

// ID del vendedor por defecto para nuevos leads (CEO Test para simulaciones)
const DEFAULT_VENDEDOR_ID = '7bb05214-826c-4d1b-a418-228b8d77bd64'; // CEO Test

export class LeadManagementService {
  constructor(private supabase: SupabaseService) {}

  async getOrCreateLead(phone: string): Promise<{ lead: any; isNew: boolean }> {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const { data } = await this.supabase.client
      .from('leads')
      .select('*')
      .like('phone', '%' + digits)
      .limit(1);
    if (data && data.length > 0) return { lead: data[0], isNew: false };

    // Crear nuevo lead asignado al vendedor por defecto
    console.log('📝 Creando nuevo lead asignado a CEO Test');
    const { data: newLead } = await this.supabase.client
      .from('leads')
      .insert({
        phone,
        status: 'new',
        score: 0,
        assigned_to: DEFAULT_VENDEDOR_ID
      })
      .select()
      .single();
    return { lead: newLead, isNew: true };
  }

  // ═══════════════════════════════════════════════════════════
  // SISTEMA DE REFERIDOS
  // ═══════════════════════════════════════════════════════════
  async detectarYCrearReferido(
    clienteReferidor: any,
    mensaje: string,
    clientePhone: string
  ): Promise<{
    detected: boolean;
    action?: 'created' | 'already_exists' | 'error' | 'own_number' | 'no_phone';
    referido?: { nombre: string; telefono: string };
    existenteNombre?: string;
    vendedorAsignado?: any;
  }> {
    // Detectar patrón de referido: "mi amigo Juan 4921234567" o "refiero a María 492..."
    const msgLower = mensaje.toLowerCase();
    const patronReferido = /(?:refiero|recomiendo|mi\s+(?:amigo|amiga|hermano|hermana|primo|prima|compadre|comadre|vecino|vecina|conocido|conocida))\s+([a-záéíóúñ]+)[\s,]+(\d{10,})/i;
    const match = mensaje.match(patronReferido);

    if (!match) {
      return { detected: false };
    }

    const nombreReferido = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    let telefonoReferido = match[2].replace(/\D/g, '');

    // Normalizar teléfono
    if (telefonoReferido.length === 10) {
      telefonoReferido = '521' + telefonoReferido;
    }

    // Verificar que no sea su propio número
    const clienteDigits = clientePhone.replace(/\D/g, '').slice(-10);
    const referidoDigits = telefonoReferido.slice(-10);
    if (clienteDigits === referidoDigits) {
      return { detected: true, action: 'own_number' };
    }

    // Verificar si ya existe
    const { data: existente } = await this.supabase.client
      .from('leads')
      .select('id, name')
      .like('phone', '%' + referidoDigits)
      .limit(1);

    if (existente && existente.length > 0) {
      return { detected: true, action: 'already_exists', existenteNombre: existente[0].name };
    }

    // Crear nuevo lead referido
    try {
      const { data: nuevoLead, error } = await this.supabase.client
        .from('leads')
        .insert({
          name: nombreReferido,
          phone: telefonoReferido,
          status: 'new',
          score: 20, // Score inicial alto por ser referido
          source: 'referido',
          assigned_to: clienteReferidor.assigned_to || DEFAULT_VENDEDOR_ID,
          notes: {
            referido_por: clienteReferidor.name || 'Cliente',
            referido_por_phone: clientePhone,
            referido_fecha: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando referido:', error);
        return { detected: true, action: 'error' };
      }

      // Obtener vendedor asignado
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('id', nuevoLead.assigned_to)
        .single();

      return {
        detected: true,
        action: 'created',
        referido: { nombre: nombreReferido, telefono: telefonoReferido },
        vendedorAsignado: vendedor
      };
    } catch (e) {
      console.error('Error en detectarYCrearReferido:', e);
      return { detected: true, action: 'error' };
    }
  }

  formatMensajeReferidoYaExiste(nombre: string): string {
    return `¡Gracias por pensar en nosotros! 😊 ${nombre} ya está en contacto con nuestro equipo. ¡Apreciamos mucho tu confianza!`;
  }

  formatMensajeReferidoError(): string {
    return `¡Gracias por la recomendación! 🙏 Hubo un pequeño problema, pero no te preocupes. Puedes compartirle nuestro número directamente.`;
  }

  formatMensajeAgradecimientoReferidor(nombreReferido: string): string {
    return `🎉 *¡Muchas gracias por tu recomendación!*\n\nYa registré a ${nombreReferido} en nuestro sistema. Un asesor lo contactará pronto.\n\n¡Tu confianza significa mucho para nosotros! 🏠`;
  }

  formatMensajeNotificacionVendedor(
    nombreReferido: string,
    telefonoReferido: string,
    nombreReferidor: string
  ): string {
    return `🆕 *NUEVO LEAD REFERIDO*\n\n👤 *${nombreReferido}*\n📱 ${telefonoReferido}\n\n📣 Referido por: ${nombreReferidor}\n\n¡Contacta pronto, los referidos tienen alta conversión!`;
  }
}
