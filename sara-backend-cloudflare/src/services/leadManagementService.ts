import { SupabaseService } from './supabase';
import { checkDuplicate } from './leadDeduplicationService';

// Fallback ID si no hay vendedores disponibles
const FALLBACK_VENDEDOR_ID = '7bb05214-826c-4d1b-a418-228b8d77bd64'; // Vendedor Test

// ═══════════════════════════════════════════════════════════════════════════
// Asignación inteligente de vendedores (round-robin por ventas)
// ═══════════════════════════════════════════════════════════════════════════
export interface TeamMemberAvailability {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
  sales_count: number;
  vacation_start?: string;
  vacation_end?: string;
  is_on_duty?: boolean;
  work_start?: string;
  work_end?: string;
  working_days?: number[];
}

export function getAvailableVendor(vendedores: TeamMemberAvailability[]): TeamMemberAvailability | null {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentDay = now.getDay();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  const activos = vendedores.filter(v => v.active && v.role === 'vendedor');

  if (activos.length === 0) {
    // FALLBACK 1: Coordinadores o admins
    const coordinadores = vendedores.filter(v =>
      v.active && (v.role === 'coordinador' || v.role === 'admin' || v.role === 'ceo' || v.role === 'director')
    );
    if (coordinadores.length > 0) {
      console.log(`🔄 FALLBACK: Asignando a coordinador/admin ${coordinadores[0].name}`);
      return coordinadores[0];
    }
    // FALLBACK 2: Cualquier activo
    const cualquiera = vendedores.filter(v => v.active);
    if (cualquiera.length > 0) {
      console.log(`🚨 FALLBACK: Asignando a ${cualquiera[0].name} (${cualquiera[0].role})`);
      return cualquiera[0];
    }
    console.error('🚨 CRÍTICO: NO HAY NINGÚN TEAM MEMBER ACTIVO');
    return null;
  }

  const estaDisponible = (v: TeamMemberAvailability): boolean => {
    if (v.vacation_start && v.vacation_end) {
      if (today >= v.vacation_start && today <= v.vacation_end) return false;
    }
    const workingDays = v.working_days || [1, 2, 3, 4, 5];
    if (!workingDays.includes(currentDay)) return false;
    if (v.work_start && v.work_end) {
      const [startH, startM] = v.work_start.split(':').map(Number);
      const [endH, endM] = v.work_end.split(':').map(Number);
      if (currentTimeMinutes < startH * 60 + startM || currentTimeMinutes > endH * 60 + endM) return false;
    }
    return true;
  };

  const disponibles = activos.filter(estaDisponible);
  const deGuardia = disponibles.filter(v => v.is_on_duty);

  // 1. Priorizar de guardia
  if (deGuardia.length > 0) {
    const elegido = deGuardia.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
    console.log(`🔥 Asignando a ${elegido.name} (guardia, ${elegido.sales_count} ventas)`);
    return elegido;
  }

  // 2. Disponibles por menor ventas
  if (disponibles.length > 0) {
    const elegido = disponibles.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
    console.log(`✅ Asignando a ${elegido.name} (disponible, ${elegido.sales_count} ventas)`);
    return elegido;
  }

  // 3. Fallback: cualquier activo
  const fallback = activos.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
  console.log(`⚠️ Fallback: ${fallback.name} (nadie disponible ahora)`);
  return fallback;
}

export class LeadManagementService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Obtiene vendedores para asignación round-robin.
   * Si se pasan cachedTeamMembers, los usa (ahorra 1 subrequest).
   */
  private async getVendedorRoundRobin(cachedTeamMembers?: any[]): Promise<string> {
    let vendedores = cachedTeamMembers;
    if (!vendedores) {
      const { data } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('active', true);
      vendedores = data || [];
    }

    const elegido = getAvailableVendor(vendedores as TeamMemberAvailability[]);
    return elegido?.id || FALLBACK_VENDEDOR_ID;
  }

  async getOrCreateLead(phone: string, skipTeamCheck = false, cachedTeamMembers?: any[]): Promise<{ lead: any; isNew: boolean; isTeamMember?: boolean; assignedVendedorId?: string }> {
    const digits = phone.replace(/\D/g, '').slice(-10);

    if (!skipTeamCheck) {
      const { data: teamMember } = await this.supabase.client
        .from('team_members')
        .select('id, name, phone')
        .like('phone', '%' + digits)
        .limit(1);

      if (teamMember && teamMember.length > 0) {
        console.log(`⚠️ Teléfono ${phone} es de team member ${teamMember[0].name}, NO se crea lead`);
        return { lead: null, isNew: false, isTeamMember: true };
      }
    }

    const { data } = await this.supabase.client
      .from('leads')
      .select('*')
      .like('phone', '%' + digits)
      .limit(1);
    if (data && data.length > 0) return { lead: data[0], isNew: false };

    // Asignar vendedor con round-robin
    const vendedorId = await this.getVendedorRoundRobin(cachedTeamMembers);
    console.log(`📝 Nuevo lead → vendedor ${vendedorId} (round-robin)`);

    const { data: newLead, error: insertError } = await this.supabase.client
      .from('leads')
      .insert({
        phone,
        status: 'new',
        score: 0,
        assigned_to: vendedorId
      })
      .select()
      .single();

    if (insertError || !newLead) {
      console.error(`🚨 CRITICAL: Lead insert FAILED for ${phone}:`, insertError?.message);
      // Retry once with minimal data
      const { data: retryLead, error: retryError } = await this.supabase.client
        .from('leads')
        .insert({ phone, status: 'new', score: 0 })
        .select()
        .single();
      if (retryError || !retryLead) {
        console.error(`🚨 CRITICAL: Lead insert RETRY FAILED for ${phone}:`, retryError?.message);
        // Return a minimal lead object so the message still gets processed
        // The lead will be created on next message via getOrCreateLead
        return { lead: { id: 'temp-' + Date.now(), phone, status: 'new', score: 0, name: null, notes: {} } as any, isNew: true, assignedVendedorId: vendedorId };
      }
      return { lead: retryLead, isNew: true, assignedVendedorId: vendedorId };
    }

    // ═══ DEDUP CHECK: Flag potential duplicates (non-blocking) ═══
    if (newLead) {
      try {
        const { data: recentLeads } = await this.supabase.client
          .from('leads')
          .select('id, phone, name, email, status, created_at, assigned_to')
          .neq('id', newLead.id)
          .order('created_at', { ascending: false })
          .limit(200);
        if (recentLeads && recentLeads.length > 0) {
          const match = checkDuplicate(newLead, recentLeads);
          if (match && match.confidence >= 0.5) {
            const existingId = match.lead2?.id || match.lead1?.id;
            await this.supabase.client.from('leads').update({
              notes: {
                ...(typeof newLead.notes === 'object' ? newLead.notes : {}),
                potential_duplicate: { matchId: existingId, confidence: match.confidence, reasons: match.reasons, action: match.suggestedAction }
              }
            }).eq('id', newLead.id);
            console.log(`⚠️ Potential duplicate detected: ${newLead.id} ↔ ${existingId} (${Math.round(match.confidence * 100)}%)`);
          }
        }
      } catch (dedupErr) {
        console.error('⚠️ Dedup check error (non-blocking):', dedupErr);
      }
    }

    return { lead: newLead, isNew: true, assignedVendedorId: vendedorId };
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
    const patronReferido = /(?:refiero|recomiendo|mi\s+(?:amigo|amiga|hermano|hermana|primo|prima|compadre|comadre|vecino|vecina|conocido|conocida))\s+([a-záéíóúñ]+)[\s,]+(\d{10,})/i;
    const match = mensaje.match(patronReferido);

    if (!match) return { detected: false };

    const nombreReferido = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    let telefonoReferido = match[2].replace(/\D/g, '');
    if (telefonoReferido.length === 10) telefonoReferido = '521' + telefonoReferido;

    const clienteDigits = clientePhone.replace(/\D/g, '').slice(-10);
    const referidoDigits = telefonoReferido.slice(-10);
    if (clienteDigits === referidoDigits) return { detected: true, action: 'own_number' };

    const { data: existente } = await this.supabase.client
      .from('leads')
      .select('id, name')
      .like('phone', '%' + referidoDigits)
      .limit(1);

    if (existente && existente.length > 0) {
      return { detected: true, action: 'already_exists', existenteNombre: existente[0].name };
    }

    try {
      // Referidos se asignan al mismo vendedor del referidor
      const vendedorId = clienteReferidor.assigned_to || await this.getVendedorRoundRobin();

      const { data: nuevoLead, error } = await this.supabase.client
        .from('leads')
        .insert({
          name: nombreReferido,
          phone: telefonoReferido,
          status: 'new',
          score: 20,
          source: 'referido',
          assigned_to: vendedorId,
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
