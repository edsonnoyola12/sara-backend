import { SupabaseService } from './supabase';

// Tipos exportados
export interface MortgageData {
  ingreso_mensual?: number;
  banco_preferido?: string;
  property_interest?: string;
  tipo_empleo?: string;
  antiguedad_empleo?: string;
  infonavit_puntos?: number;
  es_credito_conyugal?: boolean;
}

export interface CrearActualizarMortgageResult {
  success: boolean;
  error?: string;
  action?: 'created' | 'updated' | 'waiting_name' | 'no_change';
  asesor?: {
    id: string;
    name: string;
    phone: string;
    is_active: boolean;
  };
  lead?: {
    id: string;
    name: string;
    phone: string;
    property_interest?: string;
    ingreso_mensual?: number;
    banco_preferido?: string;
  };
  cambios: string[];
  mortgage_id?: string;
}

export class MortgageService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════
  // FINALIZAR FLUJO DE CRÉDITO - Asigna asesor y crea mortgage_application
  // ═══════════════════════════════════════════════════════════════════
  async finalizeCreditFlow(lead: any, teamMembers: any[]): Promise<{
    success: boolean;
    asesor?: { id: string; name: string; phone: string; is_active: boolean };
    mortgage_id?: string;
    error?: string;
  }> {
    try {
      console.log(`🏦 Finalizando flujo crédito para ${lead.name || lead.phone}...`);

      // 1. Buscar asesor hipotecario disponible (activo, no en vacaciones, en horario)
      const ahora = new Date();
      const horaActual = ahora.getHours();
      const diaActual = ahora.getDay(); // 0=Dom, 1=Lun...
      const esHorarioLaboral = horaActual >= 9 && horaActual < 19 && diaActual >= 1 && diaActual <= 5;

      const asesores = teamMembers.filter((m: any) => {
        if (!m.active) return false;
        if (!(m.role === 'asesor' || m.role?.includes('hipoteca') || m.role?.includes('credito'))) return false;

        // Verificar vacaciones
        const notas = typeof m.notes === 'object' ? m.notes : {};
        if (notas.en_vacaciones || notas.on_vacation) {
          const finVacaciones = notas.vacaciones_hasta || notas.vacation_until;
          if (finVacaciones && new Date(finVacaciones) > ahora) {
            console.log(`⏸️ Asesor ${m.name} en vacaciones hasta ${finVacaciones}`);
            return false;
          }
        }

        // Verificar horario personalizado (si existe)
        if (notas.horario_inicio && notas.horario_fin) {
          const horaInicio = parseInt(notas.horario_inicio);
          const horaFin = parseInt(notas.horario_fin);
          if (horaActual < horaInicio || horaActual >= horaFin) {
            console.log(`⏰ Asesor ${m.name} fuera de horario (${notas.horario_inicio}-${notas.horario_fin})`);
            return false;
          }
        }

        return true;
      });

      if (asesores.length === 0) {
        console.error('⚠️ No hay asesores hipotecarios activos');
        return { success: false, error: 'No hay asesores disponibles' };
      }

      // Round-robin inteligente: elegir asesor con menos leads activos
      let asesor = asesores[0];
      if (asesores.length > 1) {
        // Contar mortgage_applications activas por asesor
        const { data: counts } = await this.supabase.client
          .from('mortgage_applications')
          .select('asesor_id')
          .in('status', ['pending', 'docs_requested', 'in_review', 'preapproved']);

        const countByAsesor: Record<string, number> = {};
        asesores.forEach((a: any) => countByAsesor[a.id] = 0);
        (counts || []).forEach((c: any) => {
          if (countByAsesor[c.asesor_id] !== undefined) {
            countByAsesor[c.asesor_id]++;
          }
        });

        // Elegir el que tiene menos carga
        let minCount = Infinity;
        for (const a of asesores) {
          const count = countByAsesor[a.id] || 0;
          if (count < minCount) {
            minCount = count;
            asesor = a;
          }
        }
        console.log(`📊 Carga asesores:`, Object.entries(countByAsesor).map(([id, c]) =>
          `${asesores.find((a: any) => a.id === id)?.name || id}: ${c}`
        ).join(', '));
      }
      console.log(`✅ Asesor seleccionado: ${asesor.name} (menor carga)`);

      // 2. Verificar si ya existe mortgage_application
      const { data: existingMortgage } = await this.supabase.client
        .from('mortgage_applications')
        .select('id, asesor_id')
        .eq('lead_id', lead.id)
        .single();

      let mortgageId = existingMortgage?.id;

      if (!existingMortgage) {
        // Crear nueva mortgage_application
        const { data: newMortgage, error } = await this.supabase.client
          .from('mortgage_applications')
          .insert({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: lead.phone,
            asesor_id: asesor.id,
            status: 'pending',
            property_name: lead.property_interest || 'Por definir',
            pending_at: new Date().toISOString(),
            notes: {
              ingreso_mensual: lead.ingreso_mensual,
              banco_preferido: lead.banco_preferido,
              flujo_completado: true,
              flujo_completado_at: new Date().toISOString()
            }
          })
          .select('id')
          .single();

        if (error) {
          console.error('❌ Error creando mortgage_application:', error);
          return { success: false, error: 'Error al crear solicitud' };
        }

        mortgageId = newMortgage?.id;
        console.log('✅ mortgage_application creada:', mortgageId);
      } else {
        // Actualizar existente
        await this.supabase.client
          .from('mortgage_applications')
          .update({
            asesor_id: asesor.id,
            status: 'pending',
            notes: {
              ingreso_mensual: lead.ingreso_mensual,
              banco_preferido: lead.banco_preferido,
              flujo_completado: true,
              flujo_completado_at: new Date().toISOString()
            }
          })
          .eq('id', existingMortgage.id);

        console.log('✅ mortgage_application actualizada');
      }

      // 3. Actualizar lead con asesor asignado
      const leadNotes = typeof lead.notes === 'string' ? JSON.parse(lead.notes) : (lead.notes || {});
      leadNotes.asesor_id = asesor.id;
      leadNotes.asesor_name = asesor.name;
      leadNotes.flujo_credito_completado = true;
      leadNotes.flujo_credito_completado_at = new Date().toISOString();

      await this.supabase.client
        .from('leads')
        .update({
          credit_status: 'asesor_assigned',
          notes: leadNotes
        })
        .eq('id', lead.id);

      return {
        success: true,
        asesor: {
          id: asesor.id,
          name: asesor.name,
          phone: asesor.phone,
          is_active: asesor.active
        },
        mortgage_id: mortgageId
      };

    } catch (e) {
      console.error('❌ Error en finalizeCreditFlow:', e);
      return { success: false, error: 'Error interno' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // OBTENER CRÉDITOS DE UN VENDEDOR
  // ═══════════════════════════════════════════════════════════════════
  async getCreditsForVendor(vendorId: string): Promise<{
    isEmpty: boolean;
    credits: any[];
  }> {
    try {
      // Obtener leads del vendedor con crédito
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, property_interest, credit_status')
        .eq('assigned_to', vendorId)
        .not('credit_status', 'is', null);

      if (!leads || leads.length === 0) {
        return { isEmpty: true, credits: [] };
      }

      const leadIds = leads.map(l => l.id);

      // Obtener mortgage_applications
      const { data: mortgages } = await this.supabase.client
        .from('mortgage_applications')
        .select('*, asesor:asesor_id(name, phone)')
        .in('lead_id', leadIds);

      // Combinar info
      const credits = leads.map(lead => {
        const mortgage = mortgages?.find(m => m.lead_id === lead.id);
        return {
          lead_id: lead.id,
          lead_name: lead.name,
          lead_phone: lead.phone,
          property: lead.property_interest,
          credit_status: lead.credit_status,
          mortgage_status: mortgage?.status || 'sin_solicitud',
          asesor_name: mortgage?.asesor?.name || 'Sin asesor',
          assigned_at: mortgage?.assigned_at
        };
      });

      return { isEmpty: false, credits };

    } catch (e) {
      console.error('❌ Error en getCreditsForVendor:', e);
      return { isEmpty: true, credits: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORMATEAR LISTA DE CRÉDITOS
  // ═══════════════════════════════════════════════════════════════════
  formatCreditList(credits: any[]): string {
    if (!credits || credits.length === 0) {
      return '📋 No hay créditos en proceso.';
    }

    const STATUS_EMOJI: Record<string, string> = {
      'pending': '⏳',
      'in_review': '📋',
      'documents_pending': '📄',
      'approved': '✅',
      'rejected': '❌',
      'sin_solicitud': '❔'
    };

    let msg = `🏦 *CRÉDITOS EN PROCESO* (${credits.length})\n\n`;

    credits.forEach((c, i) => {
      const emoji = STATUS_EMOJI[c.mortgage_status] || '📌';
      msg += `${i + 1}. ${emoji} *${c.lead_name}*\n`;
      msg += `   📱 ${c.lead_phone}\n`;
      msg += `   🏠 ${c.property || 'Sin desarrollo'}\n`;
      msg += `   👤 Asesor: ${c.asesor_name}\n`;
      msg += `   📊 Status: ${c.mortgage_status}\n\n`;
    });

    msg += `💡 Para ver detalles: *"cómo va [nombre]"*`;
    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CREAR O ACTUALIZAR MORTGAGE CON NOTIFICACIÓN
  // ═══════════════════════════════════════════════════════════════════
  async crearOActualizarConNotificacion(
    lead: any,
    teamMembers: any[],
    datos: MortgageData
  ): Promise<CrearActualizarMortgageResult> {
    try {
      console.log(`🏦 crearOActualizarConNotificacion para ${lead.name || lead.phone}...`);

      // Verificar que tenemos nombre real (no placeholder)
      if (!lead.name || lead.name === 'Cliente WhatsApp' || lead.name.startsWith('Lead')) {
        console.log('⏸️ Esperando nombre real del cliente');
        return {
          success: true,
          action: 'waiting_name',
          cambios: []
        };
      }

      // Buscar asesor hipotecario
      const asesores = teamMembers.filter((m: any) =>
        m.active &&
        (m.role === 'asesor' || m.role?.includes('hipoteca') || m.role?.includes('credito'))
      );

      // Round-robin: elegir asesor con menos carga
      let asesor = asesores[0] || null;
      if (asesores.length > 1) {
        const { data: counts } = await this.supabase.client
          .from('mortgage_applications')
          .select('asesor_id')
          .in('status', ['pending', 'docs_requested', 'in_review', 'preapproved']);

        const countByAsesor: Record<string, number> = {};
        asesores.forEach((a: any) => countByAsesor[a.id] = 0);
        (counts || []).forEach((c: any) => {
          if (countByAsesor[c.asesor_id] !== undefined) {
            countByAsesor[c.asesor_id]++;
          }
        });

        let minCount = Infinity;
        for (const a of asesores) {
          const count = countByAsesor[a.id] || 0;
          if (count < minCount) {
            minCount = count;
            asesor = a;
          }
        }
      }

      // Verificar si ya existe mortgage_application
      const { data: existingMortgage } = await this.supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('lead_id', lead.id)
        .single();

      const cambios: string[] = [];

      if (!existingMortgage) {
        // CREAR NUEVA
        const mortgageData = {
          lead_id: lead.id,
          lead_name: lead.name,
          lead_phone: lead.phone,
          asesor_id: asesor?.id || null,
          status: 'pending',
          property_name: datos.property_interest || lead.property_interest || 'Por definir',
          pending_at: new Date().toISOString(),
          notes: {
            ingreso_mensual: datos.ingreso_mensual,
            banco_preferido: datos.banco_preferido,
            tipo_empleo: datos.tipo_empleo,
            antiguedad_empleo: datos.antiguedad_empleo,
            infonavit_puntos: datos.infonavit_puntos,
            es_credito_conyugal: datos.es_credito_conyugal
          }
        };

        const { data: newMortgage, error } = await this.supabase.client
          .from('mortgage_applications')
          .insert(mortgageData)
          .select('id')
          .single();

        if (error) {
          console.error('❌ Error creando mortgage:', error);
          return { success: false, error: error.message, cambios: [] };
        }

        console.log('✅ Nueva mortgage_application creada');

        return {
          success: true,
          action: 'created',
          asesor: asesor ? {
            id: asesor.id,
            name: asesor.name,
            phone: asesor.phone,
            is_active: asesor.active
          } : undefined,
          lead: {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            property_interest: datos.property_interest || lead.property_interest,
            ingreso_mensual: datos.ingreso_mensual,
            banco_preferido: datos.banco_preferido
          },
          mortgage_id: newMortgage?.id,
          cambios: ['Nueva solicitud creada']
        };

      } else {
        // ACTUALIZAR EXISTENTE - Detectar cambios
        const currentNotes = existingMortgage.notes || {};

        if (datos.ingreso_mensual && datos.ingreso_mensual !== currentNotes.ingreso_mensual) {
          cambios.push(`Ingreso: $${datos.ingreso_mensual.toLocaleString('es-MX')}/mes`);
        }
        if (datos.banco_preferido && datos.banco_preferido !== currentNotes.banco_preferido) {
          cambios.push(`Banco: ${datos.banco_preferido}`);
        }
        if (datos.tipo_empleo && datos.tipo_empleo !== currentNotes.tipo_empleo) {
          cambios.push(`Empleo: ${datos.tipo_empleo}`);
        }
        if (datos.infonavit_puntos && datos.infonavit_puntos !== currentNotes.infonavit_puntos) {
          cambios.push(`Infonavit: ${datos.infonavit_puntos} puntos`);
        }

        if (cambios.length === 0) {
          return {
            success: true,
            action: 'no_change',
            cambios: []
          };
        }

        // Aplicar actualizaciones
        const newNotes = {
          ...currentNotes,
          ...datos,
          ultima_actualizacion: new Date().toISOString()
        };

        await this.supabase.client
          .from('mortgage_applications')
          .update({ notes: newNotes })
          .eq('id', existingMortgage.id);

        // Obtener asesor actual
        const asesorActual = teamMembers.find(m => m.id === existingMortgage.asesor_id);

        return {
          success: true,
          action: 'updated',
          asesor: asesorActual ? {
            id: asesorActual.id,
            name: asesorActual.name,
            phone: asesorActual.phone,
            is_active: asesorActual.active
          } : undefined,
          lead: {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            property_interest: datos.property_interest || lead.property_interest,
            ingreso_mensual: datos.ingreso_mensual,
            banco_preferido: datos.banco_preferido
          },
          mortgage_id: existingMortgage.id,
          cambios
        };
      }

    } catch (e) {
      console.error('❌ Error en crearOActualizarConNotificacion:', e);
      return { success: false, error: 'Error interno', cambios: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORMATEAR MENSAJE NUEVO LEAD
  // ═══════════════════════════════════════════════════════════════════
  formatMensajeNuevoLead(result: CrearActualizarMortgageResult): string {
    const lead = result.lead;
    if (!lead) return '⚠️ Error: datos incompletos';

    return `🔥 *NUEVO LEAD HIPOTECARIO*\n\n` +
      `👤 *${lead.name}*\n` +
      `📱 ${lead.phone}\n` +
      `🏠 ${lead.property_interest || 'Por definir'}\n` +
      `🏦 Banco: ${lead.banco_preferido || 'Por definir'}\n` +
      `💰 Ingreso: $${(lead.ingreso_mensual || 0).toLocaleString('es-MX')}/mes\n\n` +
      `📋 Por favor contacta al cliente para iniciar el proceso.`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORMATEAR MENSAJE ACTUALIZACIÓN
  // ═══════════════════════════════════════════════════════════════════
  formatMensajeActualizacion(result: CrearActualizarMortgageResult): string {
    const lead = result.lead;
    if (!lead) return '⚠️ Error: datos incompletos';

    let msg = `📝 *ACTUALIZACIÓN DE LEAD*\n\n`;
    msg += `👤 *${lead.name}*\n`;
    msg += `📱 ${lead.phone}\n\n`;
    msg += `*Cambios:*\n`;

    result.cambios.forEach(c => {
      msg += `• ${c}\n`;
    });

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // OBTENER DETALLE DE CRÉDITO POR LEAD
  // ═══════════════════════════════════════════════════════════════════
  async getCreditDetailByLead(leadName: string, vendorId: string): Promise<{
    success: boolean;
    error?: string;
    lead?: any;
    mortgage?: any;
    asesor?: any;
  }> {
    try {
      // Buscar lead por nombre
      const nombreNorm = leadName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendorId);

      const lead = leads?.find((l: any) => {
        const n = (l.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return n.includes(nombreNorm) || nombreNorm.includes(n);
      });

      if (!lead) {
        return { success: false, error: `No encontré a "${leadName}" en tus leads.` };
      }

      // Buscar mortgage
      const { data: mortgage } = await this.supabase.client
        .from('mortgage_applications')
        .select('*, asesor:asesor_id(*)')
        .eq('lead_id', lead.id)
        .single();

      return {
        success: true,
        lead,
        mortgage,
        asesor: mortgage?.asesor
      };

    } catch (e) {
      console.error('❌ Error en getCreditDetailByLead:', e);
      return { success: false, error: 'Error interno' };
    }
  }
}
