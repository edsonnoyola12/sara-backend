// ═══════════════════════════════════════════════════════════════════════════
// OBJECTION PLAYBOOK SERVICE - Secuencias de seguimiento por tipo de objeción
// Activa playbooks multi-día para leads con objeciones específicas
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';
import { safeJsonParse } from '../utils/safeHelpers';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PlaybookStep {
  day: number;
  message: string;
  tipo: string;  // for pending_auto_response
}

export interface ObjectionPlaybook {
  type: string;
  steps: PlaybookStep[];
}

export interface PlaybookState {
  type: string;
  activated_at: string;
  current_step: number;
  next_step_at: string;
  vendedor_id: string;
  development: string;
  completed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYBOOK DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const PLAYBOOKS: Record<string, PlaybookStep[]> = {
  precio: [
    {
      day: 1,
      tipo: 'objection_precio_d1',
      message: `Hola {leadName} 👋

Entiendo que es una inversión importante. ¿Sabías que con INFONAVIT la mensualidad de {development} puede ser desde $8,500/mes?

Muchos de nuestros compradores pagan menos de mensualidad que lo que pagarían de renta en la misma zona.

¿Te gustaría que calculemos tu mensualidad exacta sin compromiso?`,
    },
    {
      day: 3,
      tipo: 'objection_precio_d3',
      message: `Hola {leadName}, te comparto algo interesante 📊

Muchos de nuestros compradores en {development} también tenían esa duda sobre el precio. Hoy están felices porque su casa ya subió de valor — la plusvalía en la zona ha sido de +6% anual.

Es decir, su patrimonio crece mientras viven en su casa. Eso no pasa con la renta 😉`,
    },
    {
      day: 5,
      tipo: 'objection_precio_d5',
      message: `{leadName}, quería contarte que también tenemos opciones más accesibles 🏡

En Monte Verde hay modelos desde $1.6M, y los precios suben aproximadamente 0.5% cada mes.

¿Te gustaría conocer las opciones antes del próximo ajuste de precios? Puedo agendarte una visita sin compromiso este fin de semana.`,
    },
  ],

  ubicacion: [
    {
      day: 1,
      tipo: 'objection_ubicacion_d1',
      message: `Hola {leadName} 👋

Entiendo tu preocupación por la ubicación. {development} tiene ventajas que no son evidentes hasta que conoces la zona:

🏪 Supermercados a 5 min
🏫 Escuelas a 10 min
🏥 Hospital a 15 min
🛣️ Acceso rápido a vialidades principales

La zona está creciendo rápido y eso se refleja en la plusvalía.`,
    },
    {
      day: 3,
      tipo: 'objection_ubicacion_d3',
      message: `{leadName}, te comparto datos reales de distancia desde {development} 📍

🏢 Centro de Zacatecas: ~15-20 min
🛒 Plaza comercial más cercana: ~8 min
🏫 Zona escolar: ~10 min

Varios compradores nos dicen que una vez que conocen la ruta diaria, se dan cuenta de que es más cerca de lo que pensaban.`,
    },
    {
      day: 5,
      tipo: 'objection_ubicacion_d5',
      message: `{leadName}, la mejor forma de evaluar la ubicación es vivirla por un momento 🚗

¿Qué te parece si agendamos una visita para que recorras la zona, veas los accesos y te formes tu propia opinión?

Te puedo dar un recorrido completo del desarrollo y alrededores. Sin compromiso. ¿Te funciona este sábado?`,
    },
  ],

  pareja: [
    {
      day: 1,
      tipo: 'objection_pareja_d1',
      message: `Hola {leadName} 👋

Totalmente entendible que quieras platicarlo con tu pareja. Es una decisión importante que se toma en equipo 💑

Te preparo un resumen con toda la info del desarrollo, precios, planos y opciones de financiamiento para que puedan revisarlo juntos con calma.

¿A qué correo te lo envío?`,
    },
    {
      day: 3,
      tipo: 'objection_pareja_d3',
      message: `{leadName}, te comparto algo que les puede servir para platicar en casa 🏡

Aquí puedes ver un recorrido virtual de {development} para que tu pareja también conozca el desarrollo sin salir de casa.

Muchas parejas nos dicen que después de ver el recorrido juntos, se animan a ir a conocer en persona.`,
    },
    {
      day: 5,
      tipo: 'objection_pareja_d5',
      message: `{leadName} 👋

¿Qué tal si agendamos una visita para que vengan los dos? Así pueden ver el desarrollo juntos, resolver dudas en persona y tomar una decisión informada.

Tenemos horarios flexibles: entre semana por la tarde o sábado por la mañana. ¿Cuál les funciona mejor?`,
    },
  ],

  credito: [
    {
      day: 1,
      tipo: 'objection_credito_d1',
      message: `Hola {leadName} 👋

Entiendo la preocupación sobre el crédito. La buena noticia es que hay muchas opciones disponibles:

✅ INFONAVIT / FOVISSSTE
✅ Crédito bancario (varios bancos)
✅ Cofinavit (combinado)
✅ Esquemas de enganche diferido

Nuestro asesor hipotecario puede revisar tu caso sin compromiso y darte opciones reales. ¿Te interesa?`,
    },
    {
      day: 3,
      tipo: 'objection_credito_d3',
      message: `{leadName}, te cuento el caso de un comprador reciente 📖

Pensaba que no le iba a alcanzar el crédito, pero con asesoría encontramos un esquema Cofinavit que le permitió comprar su casa en {development} con una mensualidad cómoda.

Cada caso es diferente — por eso vale la pena revisar las opciones. No cuesta nada y no compromete.`,
    },
    {
      day: 5,
      tipo: 'objection_credito_d5',
      message: `{leadName}, ¿te gustaría hacer una pre-calificación rápida? 📋

Es 100% gratuita, sin compromiso, y en 15 minutos sabes exactamente cuánto te prestan y a qué tasa.

Así tienes claridad y puedes tomar una decisión informada. ¿Le entramos?`,
    },
  ],

  tiempo: [
    {
      day: 1,
      tipo: 'objection_tiempo_d1',
      message: `Hola {leadName} 👋

Entiendo que quizás no es el momento ideal. Solo quería compartirte un dato:

📈 Los precios de vivienda en Zacatecas han subido ~6% al año. Cada mes que pasa, la misma casa cuesta más.

No hay presión, pero tener la información a tiempo te puede ahorrar dinero. Te mantengo al tanto de novedades.`,
    },
    {
      day: 3,
      tipo: 'objection_tiempo_d3',
      message: `{leadName}, dato rápido 📊

Si una casa cuesta $2M hoy y la plusvalía sigue al ritmo actual, en 6 meses costaría ~$2.06M y en un año ~$2.12M.

Eso sin contar que los mejores lotes/ubicaciones se van primero. Solo para que lo tengas en mente para cuando sea el momento 😉`,
    },
    {
      day: 7,
      tipo: 'objection_tiempo_d7',
      message: `{leadName}, espero que estés bien 👋

Solo quería hacer un check-in rápido. ¿Ha cambiado algo en tus planes de vivienda?

Si en algún momento quieres retomar la plática, aquí estoy. Sin presión, con toda la info actualizada. ¡Que tengas excelente semana!`,
    },
  ],

  tamano: [
    {
      day: 1,
      tipo: 'objection_tamano_d1',
      message: `Hola {leadName} 👋

Entiendo tu preocupación sobre el espacio. Tenemos varias opciones que podrían funcionar mejor:

En {development} hay modelos con diferente distribución y metros cuadrados. Algunos optimizan muy bien el espacio.

¿Te gustaría que te envíe los planos de los modelos más amplios?`,
    },
    {
      day: 3,
      tipo: 'objection_tamano_d3',
      message: `{leadName}, te comparto los planos del modelo más amplio en {development} 📐

Los espacios se ven muy diferentes en persona vs en papel. Muchos compradores se sorprenden de lo bien distribuidos que están cuando los visitan.

¿Te gustaría ver el recorrido virtual?`,
    },
    {
      day: 5,
      tipo: 'objection_tamano_d5',
      message: `{leadName} 👋

La mejor forma de evaluar el espacio es verlo en persona. Las fotos y planos no le hacen justicia.

¿Qué te parece si agendamos una visita rápida? 30 minutos son suficientes para que veas los espacios reales y decidas si te funcionan.

¿Te queda bien este fin de semana?`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class ObjectionPlaybookService {

  /**
   * Get playbook for an objection type with placeholders filled in
   */
  getPlaybook(objectionType: string, leadName: string, development: string, price: string): ObjectionPlaybook {
    const type = objectionType.toLowerCase().trim();
    const steps = PLAYBOOKS[type];

    if (!steps) {
      console.warn(`⚠️ ObjectionPlaybook: No playbook found for type "${objectionType}"`);
      return { type, steps: [] };
    }

    // Fill placeholders in messages
    const filledSteps: PlaybookStep[] = steps.map(step => ({
      ...step,
      message: step.message
        .replace(/\{leadName\}/g, leadName)
        .replace(/\{development\}/g, development)
        .replace(/\{price\}/g, price),
    }));

    return { type, steps: filledSteps };
  }

  /**
   * Activate a playbook for a lead — stores state in leads.notes.objection_playbook
   * Uses mark-before-send pattern: writes state BEFORE any action
   */
  async activatePlaybook(
    supabase: SupabaseService,
    leadId: string,
    objectionType: string,
    vendedorId: string
  ): Promise<void> {
    const type = objectionType.toLowerCase().trim();

    if (!PLAYBOOKS[type]) {
      console.error(`❌ ObjectionPlaybook: Invalid type "${objectionType}"`);
      return;
    }

    try {
      // Fresh read of lead (avoid stale data — critical per MEMORY.md)
      const { data: lead, error } = await supabase.client
        .from('leads')
        .select('id, name, notes, property_interest')
        .eq('id', leadId)
        .single();

      if (error || !lead) {
        console.error('❌ ObjectionPlaybook: Lead not found:', leadId, error?.message);
        return;
      }

      const notas = safeJsonParse(lead.notes, {});
      const development = lead.property_interest || notas.ultimo_desarrollo || 'el desarrollo';

      // Calculate next step time: tomorrow at 10:00 AM Mexico time (UTC-6)
      const now = new Date();
      const firstStep = PLAYBOOKS[type][0];
      const nextStepDate = new Date(now.getTime() + firstStep.day * 24 * 60 * 60 * 1000);
      nextStepDate.setUTCHours(16, 0, 0, 0); // 16:00 UTC = 10:00 AM Mexico

      const playbookState: PlaybookState = {
        type,
        activated_at: now.toISOString().split('T')[0],
        current_step: 0,
        next_step_at: nextStepDate.toISOString(),
        vendedor_id: vendedorId,
        development,
        completed: false,
      };

      // Write state to notes (mark-before-send pattern)
      const updatedNotes = {
        ...notas,
        objection_playbook: playbookState,
      };

      const { error: updateError } = await supabase.client
        .from('leads')
        .update({
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (updateError) {
        console.error('❌ ObjectionPlaybook: Failed to activate:', updateError.message);
        return;
      }

      console.log(`✅ ObjectionPlaybook: Activated "${type}" for lead ${lead.name} (${leadId}), next step at ${nextStepDate.toISOString()}`);
    } catch (err) {
      console.error('❌ ObjectionPlaybook: Error activating:', err);
    }
  }

  /**
   * Get next pending step for a lead (called by CRON every 2 min)
   * Returns the lead + step if it's time to send, null otherwise
   */
  async getNextStep(
    supabase: SupabaseService,
    leadId: string
  ): Promise<{ lead: any; step: PlaybookStep } | null> {
    try {
      // Fresh read
      const { data: lead, error } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes, property_interest, status')
        .eq('id', leadId)
        .single();

      if (error || !lead) return null;

      const notas = safeJsonParse(lead.notes, {});
      const playbook: PlaybookState | undefined = notas.objection_playbook;

      if (!playbook || playbook.completed) return null;

      // Check if it's time for the next step
      const now = new Date();
      const nextStepTime = new Date(playbook.next_step_at);

      if (now < nextStepTime) return null; // Not yet time

      // Check if lead status has moved forward (auto-complete playbook)
      const advancedStatuses = ['visited', 'negotiation', 'reserved', 'closed', 'delivered', 'lost'];
      if (advancedStatuses.includes(lead.status)) {
        // Lead has progressed — mark playbook as completed
        await this.completePlaybook(supabase, leadId, notas, 'lead_advanced');
        return null;
      }

      // Get the playbook steps
      const steps = PLAYBOOKS[playbook.type];
      if (!steps || playbook.current_step >= steps.length) {
        // Playbook complete or invalid
        await this.completePlaybook(supabase, leadId, notas, 'all_steps_sent');
        return null;
      }

      const currentStep = steps[playbook.current_step];

      // Fill placeholders
      const development = playbook.development || lead.property_interest || 'el desarrollo';
      const presupuesto = notas.presupuesto || notas.presupuesto_max || '';
      const price = typeof presupuesto === 'number' ? `$${(presupuesto / 1000000).toFixed(1)}M` : String(presupuesto || '');

      const filledStep: PlaybookStep = {
        ...currentStep,
        message: currentStep.message
          .replace(/\{leadName\}/g, lead.name || '')
          .replace(/\{development\}/g, development)
          .replace(/\{price\}/g, price),
      };

      return { lead, step: filledStep };
    } catch (err) {
      console.error('❌ ObjectionPlaybook: Error getting next step for lead', leadId, err);
      return null;
    }
  }

  /**
   * Advance to the next step after sending a message
   * Called after successfully sending the current step's message
   */
  async advanceStep(supabase: SupabaseService, leadId: string): Promise<void> {
    try {
      // Fresh read (critical — never use stale data per MEMORY.md)
      const { data: lead, error } = await supabase.client
        .from('leads')
        .select('id, notes')
        .eq('id', leadId)
        .single();

      if (error || !lead) return;

      const notas = safeJsonParse(lead.notes, {});
      const playbook: PlaybookState | undefined = notas.objection_playbook;

      if (!playbook || playbook.completed) return;

      const steps = PLAYBOOKS[playbook.type];
      if (!steps) return;

      const nextStepIndex = playbook.current_step + 1;

      if (nextStepIndex >= steps.length) {
        // All steps sent — mark complete
        await this.completePlaybook(supabase, leadId, notas, 'all_steps_sent');
        return;
      }

      // Calculate next step time
      const currentDay = steps[playbook.current_step].day;
      const nextDay = steps[nextStepIndex].day;
      const daysUntilNext = nextDay - currentDay;

      const nextStepDate = new Date();
      nextStepDate.setDate(nextStepDate.getDate() + daysUntilNext);
      nextStepDate.setUTCHours(16, 0, 0, 0); // 10:00 AM Mexico

      const updatedPlaybook: PlaybookState = {
        ...playbook,
        current_step: nextStepIndex,
        next_step_at: nextStepDate.toISOString(),
      };

      const updatedNotes = {
        ...notas,
        objection_playbook: updatedPlaybook,
      };

      const { error: updateError } = await supabase.client
        .from('leads')
        .update({
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (updateError) {
        console.error('❌ ObjectionPlaybook: Failed to advance step:', updateError.message);
      } else {
        console.log(`✅ ObjectionPlaybook: Advanced lead ${leadId} to step ${nextStepIndex}/${steps.length}, next at ${nextStepDate.toISOString()}`);
      }
    } catch (err) {
      console.error('❌ ObjectionPlaybook: Error advancing step:', err);
    }
  }

  /**
   * Mark a playbook as completed
   */
  private async completePlaybook(
    supabase: SupabaseService,
    leadId: string,
    notas: any,
    reason: string
  ): Promise<void> {
    const playbook = notas.objection_playbook;
    if (!playbook) return;

    const updatedPlaybook: PlaybookState = {
      ...playbook,
      completed: true,
    };

    const updatedNotes = {
      ...notas,
      objection_playbook: updatedPlaybook,
      objection_playbook_history: [
        ...((notas.objection_playbook_history || []) as any[]).slice(-4),
        {
          type: playbook.type,
          activated_at: playbook.activated_at,
          completed_at: new Date().toISOString().split('T')[0],
          steps_sent: playbook.current_step + 1,
          reason,
        },
      ],
    };

    const { error } = await supabase.client
      .from('leads')
      .update({
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('❌ ObjectionPlaybook: Failed to complete:', error.message);
    } else {
      console.log(`✅ ObjectionPlaybook: Completed "${playbook.type}" for lead ${leadId} (reason: ${reason})`);
    }
  }

  /**
   * Get all leads with active (non-completed) playbooks that have pending steps
   * Used by CRON to process playbooks in batch
   */
  async getLeadsWithPendingSteps(supabase: SupabaseService): Promise<string[]> {
    try {
      // Query leads that have an objection_playbook with completed=false
      const { data: leads, error } = await supabase.client
        .from('leads')
        .select('id, notes')
        .not('status', 'in', '("closed","delivered","lost")')
        .not('notes', 'is', null)
        .limit(200);

      if (error || !leads) {
        console.error('❌ ObjectionPlaybook: Error fetching leads with playbooks:', error?.message);
        return [];
      }

      const pendingLeadIds: string[] = [];

      for (const lead of leads) {
        const notas = safeJsonParse(lead.notes, {});
        const playbook = notas.objection_playbook;

        if (playbook && !playbook.completed && playbook.next_step_at) {
          const nextTime = new Date(playbook.next_step_at);
          if (new Date() >= nextTime) {
            pendingLeadIds.push(lead.id);
          }
        }
      }

      return pendingLeadIds;
    } catch (err) {
      console.error('❌ ObjectionPlaybook: Error scanning for pending steps:', err);
      return [];
    }
  }

  /**
   * Get list of supported objection types
   */
  getSupportedTypes(): string[] {
    return Object.keys(PLAYBOOKS);
  }
}
