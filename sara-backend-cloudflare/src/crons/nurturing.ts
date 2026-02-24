/**
 * Nurturing, Follow-ups Post-Visita, Referidos y NPS
 * Extraído de index.ts en Fase 4 de refactorización
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { puedeEnviarMensajeAutomatico, registrarMensajeAutomatico } from './followups';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { formatPhoneForDisplay } from '../handlers/whatsapp-utils';
import { logErrorToDB } from './healthCheck';

// ═══════════════════════════════════════════════════════════
// HELPER: Validar si un mensaje parece respuesta a encuesta
// Evita que mensajes normales (ej: "el sábado a las 10 am")
// sean interceptados como respuestas de encuesta
// ═══════════════════════════════════════════════════════════
export function isLikelySurveyResponse(mensaje: string, maxWords: number = 6, maxChars: number = 40): boolean {
  const trimmed = mensaje.trim();
  // Survey responses are SHORT
  if (trimmed.split(/\s+/).length > maxWords || trimmed.length > maxChars) return false;
  // If contains scheduling words → NOT a survey response
  const schedulingWords = /\b(sábado|sabado|domingo|lunes|martes|miércoles|miercoles|jueves|viernes|hora|am|pm|mañana|manana|tarde|noche|cita|visita|agendar|agenda)\b/i;
  if (schedulingWords.test(trimmed)) return false;
  // If contains property/house words → NOT a survey response
  const propertyWords = /\b(casas?|recámaras?|recamaras?|desarrollos?|créditos?|creditos?|terrenos?|precios?|infonavit|presupuesto|ubicación|ubicacion)\b/i;
  if (propertyWords.test(trimmed)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════
// RECUPERACIÓN DE ABANDONOS EN PROCESO DE CRÉDITO
// Re-engagement para leads que empezaron crédito pero no continuaron
// ═══════════════════════════════════════════════════════════
export async function recuperarAbandonosCredito(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que:
    // 1. Tienen credit_flow_context en notes (empezaron proceso de crédito)
    // 2. No están en status avanzados de crédito
    // 3. No han tenido actividad en 7+ días
    // 4. No han recibido recuperación en los últimos 14 días
    const { data: allLeads } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, updated_at, assigned_to')
      .not('notes', 'is', null)
      .not('phone', 'is', null)
      .not('status', 'in', '("credit_qualified","pre_approved","approved","sold","closed","delivered","lost","fallen","paused")')
      .lt('updated_at', hace7dias.toISOString())
      .gt('updated_at', hace30dias.toISOString())
      .limit(20);

    if (!allLeads || allLeads.length === 0) {
      console.log('🏦 No hay leads para recuperación de crédito');
      return;
    }

    // Filtrar los que tienen credit_flow_context y no han sido recuperados recientemente
    const hace14dias = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
    const leadsAbandonados = allLeads.filter(lead => {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      if (!(notas as any)?.credit_flow_context) return false;

      // Verificar si ya se envió recuperación en los últimos 14 días
      const ultimaRecuperacion = (notas as any)?.ultimo_intento_recuperacion_credito;
      if (ultimaRecuperacion && new Date(ultimaRecuperacion) > hace14dias) {
        return false;
      }
      return true;
    });

    if (leadsAbandonados.length === 0) {
      console.log('🏦 No hay abandonos de crédito elegibles para recuperación');
      return;
    }

    console.log(`🏦 Leads con proceso de crédito abandonado: ${leadsAbandonados.length}`);

    let enviados = 0;
    const maxEnvios = 5; // Limitar a 5 por ejecución

    for (const lead of leadsAbandonados) {
      if (enviados >= maxEnvios) break;
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const creditContext = (notas as any)?.credit_flow_context || {};
      const nombre = lead.name?.split(' ')[0] || 'amigo';
      const desarrollo = lead.property_interest || 'tu casa ideal';

      // Determinar en qué etapa quedó
      const etapa = creditContext.step || 'unknown';
      let mensajePersonalizado = '';

      if (etapa === 'asking_employment' || etapa === 'asking_income') {
        mensajePersonalizado = `¡Hola ${nombre}! 👋

Vi que empezaste a cotizar un crédito para ${desarrollo} pero no terminamos. ¿Te surgió alguna duda?

Puedo ayudarte a:
✅ Calcular tu capacidad de crédito en 2 minutos
✅ Ver opciones con diferentes bancos
✅ Resolver cualquier duda que tengas

Solo responde "continuar crédito" y retomamos donde lo dejamos 🏡`;
      } else if (etapa === 'asking_downpayment' || etapa === 'asking_bank') {
        mensajePersonalizado = `¡Hola ${nombre}! 👋

Ya casi terminabas tu pre-calificación de crédito para ${desarrollo}. Solo nos faltan un par de datos más.

Con lo que ya me compartiste, estás muy cerca de conocer tu capacidad de crédito real.

¿Continuamos? Responde "continuar crédito" 🏠`;
      } else {
        mensajePersonalizado = `¡Hola ${nombre}! 👋

Me quedé pensando en ti. Hace unos días mostraste interés en financiar tu casa en ${desarrollo}.

Te recuerdo que:
🏦 Trabajamos con los mejores bancos
📊 El trámite es muy sencillo
💰 Puedo calcular tu crédito en minutos

Si te interesa retomar, solo responde "quiero crédito" 🏡`;
      }

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensajePersonalizado);
        enviados++;
        console.log(`🏦 Recuperación crédito enviada a: ${lead.name} (etapa: ${etapa})`);

        // Actualizar notas
        const notasActualizadas = {
          ...notas,
          ultimo_intento_recuperacion_credito: hoyStr,
          historial_recuperacion_credito: [
            ...((notas as any)?.historial_recuperacion_credito || []).slice(-4),
            { fecha: hoyStr, etapa: etapa }
          ]
        };

        await supabase.client
          .from('leads')
          .update({
            notes: notasActualizadas,
            updated_at: new Date().toISOString()
          })
          .eq('id', lead.id);

        // Notificar al vendedor/asesor
        if (lead.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('id, name, phone')
            .eq('id', lead.assigned_to)
            .single();

          if (vendedor?.phone) {
            const notifVendedor = `📬 *Recuperación de crédito enviada*

Lead: ${lead.name}
Interés: ${desarrollo}
Etapa abandonada: ${etapa}

💡 Si responde, podrás continuar con: bridge ${nombre}`;

            await enviarMensajeTeamMember(supabase, meta, vendedor, notifVendedor, {
              tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
            });
          }
        }

        // Pausa entre mensajes
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando recuperación a ${lead.name}:`, err);
      }
    }

    console.log(`🏦 Recuperación de crédito completada: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en recuperarAbandonosCredito:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'recuperarAbandonosCredito', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// FOLLOW-UP POST-VISITA
// Re-engagement para leads que visitaron pero no avanzaron
// ═══════════════════════════════════════════════════════════
export async function followUpPostVisita(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace2dias = new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000);
    const hace14dias = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que:
    // 1. Tienen status 'visited'
    // 2. Visitaron hace 2-14 días
    // 3. No han avanzado a negotiation/reserved/sold
    // 4. No han recibido follow-up post-visita recientemente
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, updated_at, assigned_to')
      .eq('status', 'visited')
      .lt('updated_at', hace2dias.toISOString())
      .gt('updated_at', hace14dias.toISOString())
      .not('phone', 'is', null)
      .limit(10);

    if (!leads || leads.length === 0) {
      console.log('📍 No hay leads post-visita para follow-up');
      return;
    }

    // Filtrar los que no han recibido follow-up reciente
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const leadsElegibles = leads.filter(lead => {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const ultimoFollowup = (notas as any)?.ultimo_followup_postvisita;
      if (ultimoFollowup && new Date(ultimoFollowup) > hace7dias) {
        return false;
      }
      return true;
    });

    if (leadsElegibles.length === 0) {
      console.log('📍 Todos los leads post-visita ya tienen follow-up reciente');
      return;
    }

    console.log(`📍 Leads post-visita para follow-up: ${leadsElegibles.length}`);

    let enviados = 0;
    const maxEnvios = 5;

    for (const lead of leadsElegibles) {
      if (enviados >= maxEnvios) break;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const nombre = lead.name?.split(' ')[0] || 'amigo';
      const desarrollo = lead.property_interest || 'nuestros desarrollos';

      // Calcular días desde visita
      const diasDesdeVisita = Math.floor((ahora.getTime() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));

      // Mensaje personalizado según tiempo transcurrido
      let mensaje = '';
      if (diasDesdeVisita <= 3) {
        mensaje = `¡Hola ${nombre}! 👋

¿Qué te pareció tu visita a ${desarrollo}? Me encantaría saber tu opinión.

Si tienes alguna duda sobre:
🏠 Las casas que viste
💰 Precios o formas de pago
📋 El proceso de compra

¡Estoy aquí para ayudarte! 🙂`;
      } else if (diasDesdeVisita <= 7) {
        mensaje = `¡Hola ${nombre}! 👋

Han pasado unos días desde que visitaste ${desarrollo} y quería saber cómo va tu decisión.

¿Hay algo que te gustaría aclarar? Puedo ayudarte con:
✅ Segunda visita para ver otros modelos
✅ Cotización detallada
✅ Opciones de financiamiento

Solo responde y con gusto te atiendo 🏡`;
      } else {
        mensaje = `¡Hola ${nombre}! 👋

Te escribo porque recuerdo que visitaste ${desarrollo} y me quedé pensando si encontraste lo que buscabas.

Si aún estás buscando casa, me encantaría:
🔑 Mostrarte nuevas opciones
💡 Compartirte promociones actuales
📊 Revisar tu presupuesto juntos

¿Te interesa? Solo responde "sí" y te contacto 🏠`;
      }

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);
        enviados++;
        console.log(`📍 Follow-up post-visita enviado a: ${lead.name} (${diasDesdeVisita} días desde visita)`);

        // Actualizar notas
        const notasActualizadas = {
          ...notas,
          ultimo_followup_postvisita: hoyStr,
          historial_followup_postvisita: [
            ...((notas as any)?.historial_followup_postvisita || []).slice(-4),
            { fecha: hoyStr, dias_desde_visita: diasDesdeVisita }
          ]
        };

        await supabase.client
          .from('leads')
          .update({
            notes: notasActualizadas,
            updated_at: new Date().toISOString()
          })
          .eq('id', lead.id);

        // Notificar al vendedor
        if (lead.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('id, name, phone')
            .eq('id', lead.assigned_to)
            .single();

          if (vendedor?.phone) {
            const notifVendedor = `📍 *Follow-up post-visita enviado*

Lead: ${lead.name}
Visitó: ${desarrollo}
Hace: ${diasDesdeVisita} días

💡 Si responde: bridge ${nombre}`;

            await enviarMensajeTeamMember(supabase, meta, vendedor, notifVendedor, {
              tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
            });
          }
        }

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando follow-up post-visita a ${lead.name}:`, err);
      }
    }

    console.log(`📍 Follow-up post-visita completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en followUpPostVisita:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'followUpPostVisita', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// NURTURING EDUCATIVO
// Envía contenido educativo sobre compra de casa y crédito
// ═══════════════════════════════════════════════════════════
export const CONTENIDO_EDUCATIVO = [
  {
    id: 'tip_credito_1',
    tema: 'crédito',
    titulo: '💡 Tip de Crédito #1',
    mensaje: `¿Sabías que puedes mejorar tu capacidad de crédito?

Aquí te van 3 tips:

1️⃣ *Paga tus deudas a tiempo* - El historial crediticio es clave
2️⃣ *No uses más del 30%* de tu límite de tarjeta
3️⃣ *Mantén cuentas antiguas* - La antigüedad suma puntos

Si quieres saber cuánto te prestan los bancos, escríbeme "quiero crédito" y te ayudo a calcularlo 🏠`
  },
  {
    id: 'tip_credito_2',
    tema: 'crédito',
    titulo: '💡 Tip de Crédito #2',
    mensaje: `¿Infonavit, Fovissste o Banco? 🤔

Te explico las diferencias:

🏛️ *Infonavit/Fovissste*
- Tasa fija en VSM
- Menor enganche (5-10%)
- Proceso más largo

🏦 *Banco*
- Tasa fija en pesos
- Mayor flexibilidad
- Proceso más rápido

💡 *Cofinanciamiento*
- Combina ambos
- Mayor monto
- Mejor de los dos mundos

¿Quieres saber cuál te conviene? Responde "opciones de crédito" 📊`
  },
  {
    id: 'tip_compra_1',
    tema: 'compra',
    titulo: '🏡 Guía del Comprador #1',
    mensaje: `¿Primera vez comprando casa? Aquí está el proceso:

1️⃣ *Define tu presupuesto*
   - Enganche (10-20% del valor)
   - Gastos de escrituración (5-8%)
   - Mensualidad cómoda

2️⃣ *Pre-califícate*
   - Conoce cuánto te prestan
   - Compara opciones

3️⃣ *Visita opciones*
   - Ubicación, tamaño, amenidades

4️⃣ *Aparta y firma*
   - Contrato, escrituras

¿Quieres que te ayude con el paso 1? Escríbeme "calcular presupuesto" 💰`
  },
  {
    id: 'tip_compra_2',
    tema: 'compra',
    titulo: '🏡 Guía del Comprador #2',
    mensaje: `5 cosas que DEBES revisar antes de comprar:

✅ *Escrituras en orden*
   - Que estén a nombre del vendedor
   - Sin gravámenes ni adeudos

✅ *Uso de suelo*
   - Que sea habitacional

✅ *Servicios*
   - Agua, luz, drenaje

✅ *Accesos*
   - Calles pavimentadas
   - Transporte cercano

✅ *Plusvalía*
   - Desarrollo de la zona
   - Proyectos futuros

En Grupo Santa Rita todos nuestros desarrollos cumplen con esto ✨

¿Te gustaría conocerlos? Responde "ver desarrollos" 🏘️`
  },
  {
    id: 'tip_enganche_1',
    tema: 'enganche',
    titulo: '💰 Cómo juntar tu enganche',
    mensaje: `El enganche es el primer paso. Aquí te ayudo:

📊 *¿Cuánto necesitas?*
- Casa de $1.5M → enganche ~$150,000
- Casa de $2M → enganche ~$200,000
- Casa de $3M → enganche ~$300,000

💡 *Estrategias para juntarlo:*
1. Ahorro automático (10-15% de tu sueldo)
2. Aguinaldo + bonos
3. Vender algo que no uses
4. Préstamo familiar (sin intereses)
5. Caja de ahorro del trabajo

🎁 *Promociones*
A veces tenemos promociones con enganche diferido o descuentos

¿Quieres saber las promociones actuales? Escribe "promociones" 🎉`
  },
  {
    id: 'testimonial_1',
    tema: 'testimonial',
    titulo: '⭐ Historia de Éxito',
    mensaje: `*"Nunca pensé que podría tener mi casa propia"*

María y Juan buscaban casa hace 2 años. Pensaban que no calificaban para crédito.

Con nuestra ayuda:
✅ Descubrieron que SÍ calificaban
✅ Encontraron la casa perfecta en Monte Verde
✅ Hoy ya tienen las llaves de su hogar

💬 _"El proceso fue más fácil de lo que pensamos. Sara nos guió en cada paso."_

¿Quieres ser nuestra próxima historia de éxito? 🏡
Escríbeme "quiero mi casa" y empezamos`
  }
];

export async function nurturingEducativo(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace60dias = new Date(ahora.getTime() - 60 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Obtener teléfonos de team_members para excluirlos del nurturing
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('phone');
    const telefonosEquipo = new Set((teamMembers || []).map(t => t.phone).filter(Boolean));

    // Buscar leads que:
    // 1. Están en etapas tempranas (new, contacted, qualified)
    // 2. Tienen actividad en los últimos 60 días
    // 3. No han recibido nurturing en los últimos 7 días
    // 4. NO son team_members
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, needs_mortgage, updated_at')
      .in('status', ['new', 'contacted', 'qualified', 'appointment_scheduled'])
      .gt('updated_at', hace60dias.toISOString())
      .not('phone', 'is', null)
      .limit(20);

    if (!leads || leads.length === 0) {
      console.log('📚 No hay leads para nurturing educativo');
      return;
    }

    // Filtrar los que no han recibido nurturing recientemente Y no son del equipo
    const leadsElegibles = leads.filter(lead => {
      // Excluir team_members
      if (telefonosEquipo.has(lead.phone)) {
        console.log(`📚 Excluido (es team_member): ${lead.phone}`);
        return false;
      }

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const ultimoNurturing = (notas as any)?.ultimo_nurturing;
      if (ultimoNurturing && new Date(ultimoNurturing) > hace7dias) {
        return false;
      }
      return true;
    });

    if (leadsElegibles.length === 0) {
      console.log('📚 Todos los leads ya tienen nurturing reciente');
      return;
    }

    console.log(`📚 Leads para nurturing educativo: ${leadsElegibles.length}`);

    let enviados = 0;
    const maxEnvios = 10;

    for (const lead of leadsElegibles) {
      if (enviados >= maxEnvios) break;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const contenidosEnviados = (notas as any)?.nurturing_enviados || [];

      // Seleccionar contenido que no se haya enviado antes
      // Priorizar según interés del lead
      let contenidoSeleccionado = null;

      // Si necesita crédito, priorizar tips de crédito
      if (lead.needs_mortgage === true || lead.needs_mortgage === null) {
        contenidoSeleccionado = CONTENIDO_EDUCATIVO.find(c =>
          c.tema === 'crédito' && !contenidosEnviados.includes(c.id)
        );
      }

      // Si no, buscar cualquier contenido no enviado
      if (!contenidoSeleccionado) {
        contenidoSeleccionado = CONTENIDO_EDUCATIVO.find(c =>
          !contenidosEnviados.includes(c.id)
        );
      }

      // Si ya se enviaron todos, reiniciar con el primero
      if (!contenidoSeleccionado) {
        contenidoSeleccionado = CONTENIDO_EDUCATIVO[0];
      }

      const nombre = lead.name?.split(' ')[0] || 'amigo';
      const desarrollo = lead.property_interest || 'nuestras casas';

      // LÍMITE DE MENSAJES: Verificar si puede recibir más mensajes hoy
      const puedeEnviar = await puedeEnviarMensajeAutomatico(supabase, lead.id);
      if (!puedeEnviar) {
        console.log(`⏭️ Nurturing saltado para ${lead.name} (límite diario alcanzado)`);
        continue;
      }

      try {
        // Usar template para que llegue aunque no hayan escrito en 24h
        // Template seguimiento_lead: "¡Hola {{1}}! 👋 Hace unos días platicamos sobre *{{2}}*..."
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombre },
              { type: 'text', text: desarrollo }
            ]
          }
        ];

        await meta.sendTemplate(lead.phone, 'seguimiento_lead', 'es_MX', templateComponents);

        // Registrar mensaje automático enviado
        await registrarMensajeAutomatico(supabase, lead.id);

        enviados++;
        console.log(`📚 Nurturing (template) enviado a ${lead.name}: ${contenidoSeleccionado.id}`);

        // Actualizar notas
        const notasActualizadas = {
          ...notas,
          ultimo_nurturing: hoyStr,
          nurturing_enviados: [
            ...contenidosEnviados.slice(-9),
            contenidoSeleccionado.id
          ]
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', lead.id);

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando nurturing a ${lead.name}:`, err);
      }
    }

    console.log(`📚 Nurturing educativo completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en nurturingEducativo:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'nurturingEducativo', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// PROGRAMA DE REFERIDOS
// Pide referidos a clientes satisfechos post-venta
// ═══════════════════════════════════════════════════════════
export async function solicitarReferidos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hace90dias = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar clientes que:
    // 1. Compraron hace 30-90 días (tiempo suficiente para estar satisfechos)
    // 2. Status: sold, closed o delivered
    // 3. No se les ha pedido referidos recientemente
    const { data: clientes } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, status_changed_at, assigned_to')
      .in('status', ['sold', 'closed', 'delivered'])
      .lt('status_changed_at', hace30dias.toISOString())
      .gt('status_changed_at', hace90dias.toISOString())
      .not('phone', 'is', null)
      .limit(10);

    if (!clientes || clientes.length === 0) {
      console.log('🤝 No hay clientes para solicitar referidos');
      return;
    }

    // Filtrar los que no se les ha pedido referidos en los últimos 60 días
    const hace60dias = new Date(ahora.getTime() - 60 * 24 * 60 * 60 * 1000);
    const clientesElegibles = clientes.filter(cliente => {
      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      const ultimaSolicitud = (notas as any)?.ultimo_pedido_referidos;
      if (ultimaSolicitud && new Date(ultimaSolicitud) > hace60dias) {
        return false;
      }
      return true;
    });

    if (clientesElegibles.length === 0) {
      console.log('🤝 Todos los clientes ya tienen solicitud de referidos reciente');
      return;
    }

    console.log(`🤝 Clientes para solicitar referidos: ${clientesElegibles.length}`);

    let enviados = 0;
    const maxEnvios = 5;

    for (const cliente of clientesElegibles) {
      if (enviados >= maxEnvios) break;

      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      const nombre = cliente.name?.split(' ')[0] || 'amigo';
      const desarrollo = cliente.property_interest || 'Grupo Santa Rita';

      // Calcular días desde compra
      const diasDesdeCompra = Math.floor(
        (ahora.getTime() - new Date(cliente.status_changed_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      const mensaje = `¡Hola ${nombre}! 🏡

Espero que estés disfrutando tu nuevo hogar en ${desarrollo}.

Quería preguntarte: ¿Conoces a alguien que también esté buscando casa?

👨‍👩‍👧‍👦 Familiares
👫 Amigos
💼 Compañeros de trabajo

Si nos recomiendas y tu referido compra, *ambos reciben un regalo especial* de nuestra parte 🎁

Solo responde con el nombre y teléfono de quien creas que le interese, y yo me encargo del resto.

¡Gracias por confiar en nosotros! ⭐`;

      try {
        await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        enviados++;
        console.log(`🤝 Solicitud de referidos enviada a: ${cliente.name} (${diasDesdeCompra} días desde compra)`);

        // Actualizar notas
        const notasActualizadas = {
          ...notas,
          ultimo_pedido_referidos: hoyStr,
          historial_pedidos_referidos: [
            ...((notas as any)?.historial_pedidos_referidos || []).slice(-4),
            { fecha: hoyStr, dias_desde_compra: diasDesdeCompra }
          ],
          pending_auto_response: {
            type: 'referidos',
            sent_at: new Date().toISOString(),
            vendedor_id: cliente.assigned_to
          }
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', cliente.id);

        // Notificar al vendedor
        if (cliente.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('id, name, phone')
            .eq('id', cliente.assigned_to)
            .single();

          if (vendedor?.phone) {
            const notifVendedor = `🤝 *Solicitud de referidos enviada*

Cliente: ${cliente.name}
Compró: ${desarrollo}
Hace: ${diasDesdeCompra} días

💡 Si responde con un referido, agrégalo al CRM con fuente "referido"`;

            await enviarMensajeTeamMember(supabase, meta, vendedor, notifVendedor, {
              tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
            });
          }
        }

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando solicitud de referidos a ${cliente.name}:`, err);
      }
    }

    console.log(`🤝 Solicitud de referidos completada: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en solicitarReferidos:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'solicitarReferidos', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// ENCUESTAS NPS (Net Promoter Score)
// Mide satisfacción en puntos clave del journey
// ═══════════════════════════════════════════════════════════
export async function enviarEncuestaNPS(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<{ elegibles: number, enviados: number, detalles: string[] }> {
  const resultado = { elegibles: 0, enviados: 0, detalles: [] as string[] };
  try {
    const ahora = new Date();
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar clientes para encuesta:
    // 1. Status: visited (post-visita), sold/closed (post-venta)
    // 2. Status cambió hace 7-30 días
    // 3. No han recibido encuesta NPS
    const { data: clientes } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, status_changed_at')
      .in('status', ['visited', 'sold', 'closed', 'delivered'])
      .lt('status_changed_at', hace7dias.toISOString())
      .gt('status_changed_at', hace30dias.toISOString())
      .not('phone', 'is', null)
      .limit(10);

    if (!clientes || clientes.length === 0) {
      console.log('📊 No hay clientes para encuesta NPS');
      resultado.detalles.push('No hay clientes con status visited/sold/closed/delivered en ventana 7-30 días');
      return resultado;
    }

    // Filtrar los que no han recibido encuesta
    const clientesElegibles = clientes.filter(cliente => {
      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      return !(notas as any)?.encuesta_nps_enviada;
    });

    if (clientesElegibles.length === 0) {
      console.log('📊 Todos los clientes ya tienen encuesta NPS');
      resultado.detalles.push(`${clientes.length} clientes encontrados pero todos ya tienen encuesta NPS`);
      return resultado;
    }

    resultado.elegibles = clientesElegibles.length;
    console.log(`📊 Clientes para encuesta NPS: ${clientesElegibles.length}`);

    let enviados = 0;
    const maxEnvios = 5;

    for (const cliente of clientesElegibles) {
      if (enviados >= maxEnvios) break;

      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      const nombre = cliente.name?.split(' ')[0] || 'amigo';

      // Mensaje según status
      let contexto = '';
      let pregunta = '';

      if (cliente.status === 'visited') {
        contexto = 'tu visita a nuestros desarrollos';
        pregunta = '¿Qué tan probable es que nos recomiendes a un amigo o familiar?';
      } else {
        contexto = 'tu experiencia de compra';
        pregunta = '¿Qué tan probable es que nos recomiendes a un amigo o familiar que busque casa?';
      }

      const mensaje = `¡Hola ${nombre}! 👋

Tu opinión es muy importante para nosotros.

Sobre ${contexto}:

${pregunta}

Responde con un número del *0 al 10*:
0️⃣ = Nada probable
5️⃣ = Neutral
🔟 = Muy probable

Tu respuesta nos ayuda a mejorar 🙏`;

      try {
        // MARK BEFORE SEND (previene duplicados por CRON race condition)
        const ahora = new Date().toISOString();
        const notasActualizadas = {
          ...notas,
          encuesta_nps_enviada: hoyStr,
          encuesta_nps_status: cliente.status,
          esperando_respuesta_nps: true,
          esperando_respuesta_nps_at: ahora,
          surveys_sent: [
            ...((notas.surveys_sent || []).slice(-9)),
            { type: 'nps', sent_at: ahora }
          ],
          pending_auto_response: {
            type: 'nps',
            sent_at: ahora,
            vendedor_id: (cliente as any).assigned_to
          }
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', cliente.id);

        // Ahora sí enviar
        const resultado_envio = await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        const wamid = resultado_envio?.messages?.[0]?.id;

        // Guardar wamid si se obtuvo
        if (wamid) {
          const notasConWamid = { ...notasActualizadas, survey_wamid: wamid };
          notasConWamid.surveys_sent[notasConWamid.surveys_sent.length - 1].wamid = wamid;
          await supabase.client.from('leads').update({ notes: notasConWamid }).eq('id', cliente.id);
        }

        enviados++;
        resultado.enviados = enviados;
        resultado.detalles.push(`✅ Enviado a ${cliente.name} (${cliente.phone}) - ${cliente.status}${wamid ? ` wamid:${wamid.slice(-8)}` : ''}`);
        console.log(`📊 Encuesta NPS enviada a: ${cliente.name} (${cliente.status})${wamid ? ` wamid:${wamid.slice(-8)}` : ''}`);

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando encuesta NPS a ${cliente.name}:`, err);
        resultado.detalles.push(`❌ Error enviando a ${cliente.name} (${cliente.phone}): ${err}`);
      }
    }

    console.log(`📊 Encuestas NPS enviadas: ${enviados}`);
    return resultado;

  } catch (e) {
    console.error('Error en enviarEncuestaNPS:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'enviarEncuestaNPS', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
    resultado.detalles.push(`❌ Error general: ${e}`);
    return resultado;
  }
}

// Procesar respuesta NPS
export async function procesarRespuestaNPS(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string
): Promise<boolean> {
  const notas = typeof lead.notes === 'object' ? lead.notes : {};

  // Verificar si estamos esperando respuesta NPS
  if (!(notas as any)?.esperando_respuesta_nps) {
    return false;
  }

  // TTL check: si la bandera tiene más de 48h, auto-limpiar
  const flagSetAt = (notas as any)?.esperando_respuesta_nps_at;
  if (flagSetAt) {
    const horasDesde = (Date.now() - new Date(flagSetAt).getTime()) / (1000 * 60 * 60);
    if (horasDesde > 48) {
      await supabase.client.from('leads').update({
        notes: { ...notas, esperando_respuesta_nps: false }
      }).eq('id', lead.id);
      return false;
    }
  }

  // Validar que parece respuesta a encuesta (corto, sin palabras de agenda/propiedad)
  if (!isLikelySurveyResponse(mensaje)) return false;

  // Extraer número del mensaje - solo si es el contenido principal
  const match = mensaje.trim().match(/^\s*(\d{1,2})\s*$/);
  if (!match || parseInt(match[1]) > 10) {
    return false; // No es una respuesta NPS válida
  }

  const score = parseInt(match[1]);
  const nombre = lead.name?.split(' ')[0] || 'amigo';

  // Determinar categoría NPS
  let categoria: string;
  let respuesta: string;

  if (score >= 9) {
    categoria = 'promotor';
    respuesta = `¡Muchas gracias ${nombre}! 🎉

Nos alegra mucho saber que tuviste una gran experiencia.

Si conoces a alguien que busque casa, ¡con gusto lo atendemos! Solo compártenos su nombre y teléfono.

¡Gracias por confiar en Grupo Santa Rita! ⭐`;
  } else if (score >= 7) {
    categoria = 'pasivo';
    respuesta = `¡Gracias por tu respuesta ${nombre}! 😊

Nos da gusto que tu experiencia haya sido buena.

¿Hay algo que podamos mejorar para la próxima vez? Tu opinión nos ayuda mucho.`;
  } else {
    categoria = 'detractor';
    respuesta = `Gracias por tu honestidad ${nombre}.

Lamentamos que tu experiencia no haya sido la mejor. 😔

¿Podrías contarnos qué pasó? Queremos mejorar y, si hay algo que podamos resolver, lo haremos.

Un asesor te contactará pronto.`;

    // Alertar al vendedor sobre detractor (via enviarMensajeTeamMember para respetar ventana 24h)
    if (lead.assigned_to) {
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('id', lead.assigned_to)
        .single();

      if (vendedor) {
        await enviarMensajeTeamMember(supabase, meta, vendedor,
          `🚨 *ALERTA NPS BAJO*\n\nCliente: ${lead.name}\nScore: ${score}/10 (${categoria})\nStatus: ${lead.status}\n\n⚠️ Requiere atención inmediata. Contacta al cliente para resolver su experiencia.\n\n📞 bridge ${nombre}`,
          { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
        );
      }
    }
  }

  // Enviar respuesta al cliente
  await meta.sendWhatsAppMessage(lead.phone, respuesta);

  // Guardar en notas — set feedback flag para capturar mensaje de seguimiento
  const notasActualizadas = {
    ...notas,
    esperando_respuesta_nps: false,
    esperando_feedback_nps: true,
    esperando_feedback_nps_at: new Date().toISOString(),
    nps_score: score,
    nps_categoria: categoria,
    nps_respondido: new Date().toISOString()
  };

  await supabase.client
    .from('leads')
    .update({ notes: notasActualizadas })
    .eq('id', lead.id);

  console.log(`📊 NPS procesado: ${lead.name} = ${score} (${categoria})`);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// SEGUIMIENTO POST-ENTREGA
// Verifica que todo esté bien después de recibir las llaves
// ═══════════════════════════════════════════════════════════════
export async function seguimientoPostEntrega(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar clientes que:
    // 1. Recibieron su casa hace 3-7 días (status: delivered)
    // 2. No han recibido seguimiento post-entrega
    const { data: clientes } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, status_changed_at, assigned_to')
      .eq('status', 'delivered')
      .lt('status_changed_at', hace3dias.toISOString())
      .gt('status_changed_at', hace7dias.toISOString())
      .not('phone', 'is', null)
      .limit(10);

    if (!clientes || clientes.length === 0) {
      console.log('🔑 No hay clientes para seguimiento post-entrega');
      return;
    }

    // Filtrar los que no han recibido seguimiento
    const clientesElegibles = clientes.filter(cliente => {
      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      return !(notas as any)?.seguimiento_entrega_enviado;
    });

    if (clientesElegibles.length === 0) {
      console.log('🔑 Todos los clientes ya tienen seguimiento post-entrega');
      return;
    }

    console.log(`🔑 Clientes para seguimiento post-entrega: ${clientesElegibles.length}`);

    let enviados = 0;
    const maxEnvios = 5;

    for (const cliente of clientesElegibles) {
      if (enviados >= maxEnvios) break;

      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      const nombre = cliente.name?.split(' ')[0] || 'vecino';
      const desarrollo = cliente.property_interest || 'tu nuevo hogar';

      const mensaje = `¡Hola ${nombre}! 🏠🔑

¡Felicidades por tu nueva casa en ${desarrollo}!

Queremos asegurarnos de que todo esté perfecto. Por favor, confirma:

1️⃣ ¿Recibiste todas las llaves correctamente?
2️⃣ ¿Las escrituras están en orden?
3️⃣ ¿Todos los servicios (agua, luz, gas) funcionan bien?

Si hay algo pendiente o algún detalle por resolver, responde y te ayudamos de inmediato.

¡Bienvenido a la familia Santa Rita! 🎉`;

      try {
        // MARK BEFORE SEND (previene duplicados por CRON race condition)
        const ahora = new Date().toISOString();
        const notasActualizadas = {
          ...notas,
          seguimiento_entrega_enviado: hoyStr,
          esperando_respuesta_entrega: true,
          esperando_respuesta_entrega_at: ahora,
          surveys_sent: [
            ...((notas.surveys_sent || []).slice(-9)),
            { type: 'post_entrega', sent_at: ahora }
          ],
          pending_auto_response: {
            type: 'post_entrega',
            sent_at: ahora,
            vendedor_id: cliente.assigned_to
          }
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', cliente.id);

        // Ahora sí enviar
        const resultado_envio = await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        const wamid = resultado_envio?.messages?.[0]?.id;

        if (wamid) {
          const notasConWamid = { ...notasActualizadas, survey_wamid: wamid };
          notasConWamid.surveys_sent[notasConWamid.surveys_sent.length - 1].wamid = wamid;
          await supabase.client.from('leads').update({ notes: notasConWamid }).eq('id', cliente.id);
        }

        enviados++;
        console.log(`🔑 Seguimiento post-entrega enviado a: ${cliente.name}${wamid ? ` wamid:${wamid.slice(-8)}` : ''}`);

        // Notificar al vendedor (via enviarMensajeTeamMember para respetar ventana 24h)
        if (cliente.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('id', cliente.assigned_to)
            .single();

          if (vendedor) {
            await enviarMensajeTeamMember(supabase, meta, vendedor,
              `🔑 *Seguimiento post-entrega enviado*\n\nCliente: ${cliente.name}\nCasa: ${desarrollo}\n\n💡 Si responde con algún problema, atiéndelo de inmediato.`,
              { tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje' }
            );
          }
        }

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando seguimiento post-entrega a ${cliente.name}:`, err);
      }
    }

    console.log(`🔑 Seguimiento post-entrega completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en seguimientoPostEntrega:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'seguimientoPostEntrega', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// Procesar respuesta de seguimiento post-entrega
export async function procesarRespuestaEntrega(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string
): Promise<boolean> {
  const notas = typeof lead.notes === 'object' ? lead.notes : {};

  // Verificar si estamos esperando respuesta de entrega
  if (!(notas as any)?.esperando_respuesta_entrega) {
    return false;
  }

  // TTL check: si la bandera tiene más de 48h, auto-limpiar
  const flagSetAt = (notas as any)?.esperando_respuesta_entrega_at;
  if (flagSetAt) {
    const horasDesde = (Date.now() - new Date(flagSetAt).getTime()) / (1000 * 60 * 60);
    if (horasDesde > 48) {
      await supabase.client.from('leads').update({
        notes: { ...notas, esperando_respuesta_entrega: false }
      }).eq('id', lead.id);
      return false;
    }
  }

  // Validar que parece respuesta a encuesta (allow longer for entrega since can be descriptive)
  if (!isLikelySurveyResponse(mensaje, 15, 120)) return false;

  const nombre = lead.name?.split(' ')[0] || 'vecino';
  const mensajeLower = mensaje.toLowerCase();

  // Detectar si hay problemas
  const palabrasProblema = ['no', 'falta', 'problema', 'pendiente', 'mal', 'error', 'todavía', 'aún', 'ayuda', 'revisar'];
  const palabrasBien = ['sí', 'si', 'todo bien', 'perfecto', 'excelente', 'ok', 'listo', 'correcto', 'gracias'];

  const hayProblema = palabrasProblema.some(p => mensajeLower.includes(p));
  const todoBien = palabrasBien.some(p => mensajeLower.includes(p));

  let respuesta: string;
  let requiereAtencion = false;

  if (hayProblema && !todoBien) {
    respuesta = `Gracias por avisarnos, ${nombre}.

Lamento que haya algún pendiente. Un asesor te contactará hoy mismo para resolverlo.

¿Puedes darnos más detalles de qué necesitas? 📝`;
    requiereAtencion = true;
  } else {
    respuesta = `¡Excelente, ${nombre}! 🎉

Nos da mucho gusto que todo esté en orden.

Recuerda que estamos aquí si necesitas algo. ¡Disfruta tu nuevo hogar! 🏠✨`;
  }

  await meta.sendWhatsAppMessage(lead.phone, respuesta);

  // Actualizar notas — set feedback flag para capturar mensaje de seguimiento
  const notasActualizadas = {
    ...notas,
    esperando_respuesta_entrega: false,
    esperando_feedback_entrega: true,
    esperando_feedback_entrega_at: new Date().toISOString(),
    respuesta_entrega: mensaje,
    entrega_problema: requiereAtencion,
    entrega_respondido: new Date().toISOString()
  };

  await supabase.client
    .from('leads')
    .update({ notes: notasActualizadas })
    .eq('id', lead.id);

  // Si hay problema, alertar al vendedor (via enviarMensajeTeamMember para respetar ventana 24h)
  if (requiereAtencion && lead.assigned_to) {
    const { data: vendedor } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('id', lead.assigned_to)
      .single();

    if (vendedor) {
      await enviarMensajeTeamMember(supabase, meta, vendedor,
        `🚨 *PROBLEMA POST-ENTREGA*\n\nCliente: ${lead.name}\n📱 ${formatPhoneForDisplay(lead.phone)}\n\nMensaje: "${mensaje}"\n\n⚠️ Requiere atención inmediata.\n📞 bridge ${nombre}`,
        { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
      );
    }
  }

  console.log(`🔑 Respuesta entrega procesada: ${lead.name} - ${requiereAtencion ? 'CON PROBLEMA' : 'OK'}`);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// ENCUESTA DE SATISFACCIÓN CON LA CASA
// Pregunta cómo les va 3-6 meses después de la entrega
// ═══════════════════════════════════════════════════════════════
export async function encuestaSatisfaccionCasa(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace3meses = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000);
    const hace6meses = new Date(ahora.getTime() - 180 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar clientes que:
    // 1. Recibieron su casa hace 3-6 meses (status: delivered)
    // 2. No han recibido encuesta de satisfacción
    const { data: clientes } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, status_changed_at, assigned_to')
      .eq('status', 'delivered')
      .lt('status_changed_at', hace3meses.toISOString())
      .gt('status_changed_at', hace6meses.toISOString())
      .not('phone', 'is', null)
      .limit(10);

    if (!clientes || clientes.length === 0) {
      console.log('🏡 No hay clientes para encuesta de satisfacción con la casa');
      return;
    }

    // Filtrar los que no han recibido encuesta
    const clientesElegibles = clientes.filter(cliente => {
      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      return !(notas as any)?.encuesta_satisfaccion_casa_enviada;
    });

    if (clientesElegibles.length === 0) {
      console.log('🏡 Todos los clientes ya tienen encuesta de satisfacción');
      return;
    }

    console.log(`🏡 Clientes para encuesta de satisfacción: ${clientesElegibles.length}`);

    let enviados = 0;
    const maxEnvios = 5;

    for (const cliente of clientesElegibles) {
      if (enviados >= maxEnvios) break;

      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      const nombre = cliente.name?.split(' ')[0] || 'vecino';
      const desarrollo = cliente.property_interest || 'tu casa';

      // Calcular meses desde entrega
      const mesesDesdeEntrega = Math.floor(
        (ahora.getTime() - new Date(cliente.status_changed_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      const mensaje = `¡Hola ${nombre}! 🏠

Ya llevas ${mesesDesdeEntrega} meses disfrutando tu casa en ${desarrollo}. ¡Qué rápido pasa el tiempo!

Queremos saber cómo te ha ido:

*¿Cómo calificarías tu satisfacción con tu casa?*

1️⃣ Excelente - ¡Me encanta!
2️⃣ Buena - Estoy contento
3️⃣ Regular - Algunas cosas por mejorar
4️⃣ Mala - Tengo problemas

Tu opinión nos ayuda a mejorar 🙏`;

      try {
        // MARK BEFORE SEND (previene duplicados por CRON race condition)
        const ahora = new Date().toISOString();
        const notasActualizadas = {
          ...notas,
          encuesta_satisfaccion_casa_enviada: hoyStr,
          meses_en_casa: mesesDesdeEntrega,
          esperando_respuesta_satisfaccion_casa: true,
          esperando_respuesta_satisfaccion_casa_at: ahora,
          surveys_sent: [
            ...((notas.surveys_sent || []).slice(-9)),
            { type: 'satisfaccion_casa', sent_at: ahora }
          ],
          pending_auto_response: {
            type: 'satisfaccion_casa',
            sent_at: ahora,
            vendedor_id: cliente.assigned_to
          }
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', cliente.id);

        // Ahora sí enviar
        const resultado_envio = await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        const wamid = resultado_envio?.messages?.[0]?.id;

        if (wamid) {
          const notasConWamid = { ...notasActualizadas, survey_wamid: wamid };
          notasConWamid.surveys_sent[notasConWamid.surveys_sent.length - 1].wamid = wamid;
          await supabase.client.from('leads').update({ notes: notasConWamid }).eq('id', cliente.id);
        }

        enviados++;
        console.log(`🏡 Encuesta de satisfacción enviada a: ${cliente.name} (${mesesDesdeEntrega} meses)${wamid ? ` wamid:${wamid.slice(-8)}` : ''}`);

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando encuesta de satisfacción a ${cliente.name}:`, err);
      }
    }

    console.log(`🏡 Encuestas de satisfacción enviadas: ${enviados}`);

  } catch (e) {
    console.error('Error en encuestaSatisfaccionCasa:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'encuestaSatisfaccionCasa', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// Procesar respuesta de encuesta de satisfacción con la casa
export async function procesarRespuestaSatisfaccionCasa(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string
): Promise<boolean> {
  const notas = typeof lead.notes === 'object' ? lead.notes : {};

  // Verificar si estamos esperando respuesta
  if (!(notas as any)?.esperando_respuesta_satisfaccion_casa) {
    return false;
  }

  // TTL check: si la bandera tiene más de 48h, auto-limpiar
  const flagSetAt = (notas as any)?.esperando_respuesta_satisfaccion_casa_at;
  if (flagSetAt) {
    const horasDesde = (Date.now() - new Date(flagSetAt).getTime()) / (1000 * 60 * 60);
    if (horasDesde > 48) {
      await supabase.client.from('leads').update({
        notes: { ...notas, esperando_respuesta_satisfaccion_casa: false }
      }).eq('id', lead.id);
      return false;
    }
  }

  // Validar que parece respuesta a encuesta
  if (!isLikelySurveyResponse(mensaje)) return false;

  const nombre = lead.name?.split(' ')[0] || 'vecino';
  const mensajeLower = mensaje.toLowerCase();
  const trimmed = mensaje.trim();

  // Detectar calificación - números SOLO si son el mensaje completo
  let calificacion: number | null = null;
  let categoria = '';

  const matchNum = trimmed.match(/^\s*([1-4])\s*$/);
  if (matchNum) {
    const num = parseInt(matchNum[1]);
    if (num === 1) { calificacion = 1; categoria = 'excelente'; }
    else if (num === 2) { calificacion = 2; categoria = 'buena'; }
    else if (num === 3) { calificacion = 3; categoria = 'regular'; }
    else if (num === 4) { calificacion = 4; categoria = 'mala'; }
  } else if (mensajeLower.includes('excelente') || mensajeLower.includes('encanta')) {
    calificacion = 1;
    categoria = 'excelente';
  } else if (mensajeLower.includes('buena') || mensajeLower.includes('contento')) {
    calificacion = 2;
    categoria = 'buena';
  } else if (mensajeLower.includes('regular') || mensajeLower.includes('mejorar')) {
    calificacion = 3;
    categoria = 'regular';
  } else if (mensajeLower.includes('mala') || mensajeLower.includes('problema')) {
    calificacion = 4;
    categoria = 'mala';
  }

  if (!calificacion) {
    return false; // No es una respuesta válida
  }

  let respuesta: string;
  let requiereAtencion = false;

  switch (calificacion) {
    case 1:
      respuesta = `¡Nos alegra muchísimo, ${nombre}! 🎉

Es un placer saber que amas tu casa. Gracias por confiar en nosotros.

¿Conoces a alguien que también busque su hogar ideal? ¡Con gusto lo atendemos! 🏠`;
      break;
    case 2:
      respuesta = `¡Qué bueno saberlo, ${nombre}! 😊

Nos da gusto que estés contento. Si hay algo que podamos mejorar, no dudes en decirnos.

¡Gracias por ser parte de nuestra comunidad! 🏡`;
      break;
    case 3:
      respuesta = `Gracias por tu honestidad, ${nombre}.

Queremos que estés 100% satisfecho. ¿Podrías contarnos qué aspectos podemos mejorar?

Un asesor te contactará para ayudarte. 🤝`;
      requiereAtencion = true;
      break;
    case 4:
      respuesta = `Lamentamos mucho escuchar eso, ${nombre}. 😔

Tu satisfacción es nuestra prioridad. Por favor, cuéntanos qué ha pasado y un asesor te contactará HOY para resolver cualquier problema.

Estamos para ayudarte. 🤝`;
      requiereAtencion = true;
      break;
    default:
      respuesta = `Gracias por tu respuesta, ${nombre}. Un asesor te contactará pronto.`;
  }

  await meta.sendWhatsAppMessage(lead.phone, respuesta);

  // Actualizar notas — set feedback flag para capturar mensaje de seguimiento
  const notasActualizadas = {
    ...notas,
    esperando_respuesta_satisfaccion_casa: false,
    esperando_feedback_satisfaccion: true,
    esperando_feedback_satisfaccion_at: new Date().toISOString(),
    satisfaccion_casa_calificacion: calificacion,
    satisfaccion_casa_categoria: categoria,
    satisfaccion_casa_respondido: new Date().toISOString(),
    satisfaccion_casa_requiere_atencion: requiereAtencion
  };

  await supabase.client
    .from('leads')
    .update({ notes: notasActualizadas })
    .eq('id', lead.id);

  // Si requiere atención, alertar al vendedor (via enviarMensajeTeamMember para respetar ventana 24h)
  if (requiereAtencion && lead.assigned_to) {
    const { data: vendedor } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('id', lead.assigned_to)
      .single();

    if (vendedor) {
      await enviarMensajeTeamMember(supabase, meta, vendedor,
        `⚠️ *CLIENTE INSATISFECHO*\n\nCliente: ${lead.name}\nCalificación: ${calificacion}/4 (${categoria})\n📱 ${formatPhoneForDisplay(lead.phone)}\n\nMensaje: "${mensaje}"\n\n🚨 Requiere seguimiento inmediato.\n📞 bridge ${nombre}`,
        { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
      );
    }
  }

  console.log(`🏡 Satisfacción casa procesada: ${lead.name} = ${calificacion} (${categoria})`);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// CHECK-IN DE MANTENIMIENTO
// Recordatorio anual de mantenimiento preventivo
// ═══════════════════════════════════════════════════════════════
export async function checkInMantenimiento(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace11meses = new Date(ahora.getTime() - 330 * 24 * 60 * 60 * 1000);
    const hace13meses = new Date(ahora.getTime() - 390 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];
    const añoActual = ahora.getFullYear();

    // Buscar clientes que:
    // 1. Recibieron su casa hace ~1 año (11-13 meses)
    // 2. No han recibido check-in de mantenimiento este año
    const { data: clientes } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, status_changed_at, assigned_to')
      .eq('status', 'delivered')
      .lt('status_changed_at', hace11meses.toISOString())
      .gt('status_changed_at', hace13meses.toISOString())
      .not('phone', 'is', null)
      .limit(10);

    if (!clientes || clientes.length === 0) {
      console.log('🔧 No hay clientes para check-in de mantenimiento');
      return;
    }

    // Filtrar los que no han recibido check-in este año
    const clientesElegibles = clientes.filter(cliente => {
      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      const ultimoCheckin = (notas as any)?.ultimo_checkin_mantenimiento;
      if (ultimoCheckin && ultimoCheckin.startsWith(String(añoActual))) {
        return false;
      }
      return true;
    });

    if (clientesElegibles.length === 0) {
      console.log('🔧 Todos los clientes ya tienen check-in de mantenimiento');
      return;
    }

    console.log(`🔧 Clientes para check-in de mantenimiento: ${clientesElegibles.length}`);

    let enviados = 0;
    const maxEnvios = 5;

    for (const cliente of clientesElegibles) {
      if (enviados >= maxEnvios) break;

      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      const nombre = cliente.name?.split(' ')[0] || 'vecino';
      const desarrollo = cliente.property_interest || 'tu casa';

      // Calcular años desde entrega
      const añosDesdeEntrega = Math.floor(
        (ahora.getTime() - new Date(cliente.status_changed_at).getTime()) / (1000 * 60 * 60 * 24 * 365)
      );

      const mensaje = `¡Hola ${nombre}! 🏠🔧

Ya cumples *${añosDesdeEntrega} año${añosDesdeEntrega > 1 ? 's' : ''}* en tu casa de ${desarrollo}. ¡Felicidades!

Es buen momento para revisar el mantenimiento preventivo:

✅ *Checklist recomendado:*
• Impermeabilización del techo
• Revisión de instalaciones eléctricas
• Limpieza de cisternas y tinacos
• Revisión de gas y calentador
• Pintura exterior (si es necesaria)

¿Todo bien con tu casa o necesitas alguna recomendación de proveedores de confianza?

Responde *SÍ* si todo está bien o *AYUDA* si necesitas contactos de proveedores. 🤝`;

      try {
        // MARK BEFORE SEND (previene duplicados por CRON race condition)
        const ahora = new Date().toISOString();
        const notasActualizadas = {
          ...notas,
          ultimo_checkin_mantenimiento: hoyStr,
          años_en_casa: añosDesdeEntrega,
          esperando_respuesta_mantenimiento: true,
          esperando_respuesta_mantenimiento_at: ahora,
          surveys_sent: [
            ...((notas.surveys_sent || []).slice(-9)),
            { type: 'mantenimiento', sent_at: ahora }
          ],
          pending_auto_response: {
            type: 'mantenimiento',
            sent_at: ahora,
            vendedor_id: cliente.assigned_to
          }
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', cliente.id);

        // Ahora sí enviar
        const resultado_envio = await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        const wamid = resultado_envio?.messages?.[0]?.id;

        if (wamid) {
          const notasConWamid = { ...notasActualizadas, survey_wamid: wamid };
          notasConWamid.surveys_sent[notasConWamid.surveys_sent.length - 1].wamid = wamid;
          await supabase.client.from('leads').update({ notes: notasConWamid }).eq('id', cliente.id);
        }

        enviados++;
        console.log(`🔧 Check-in de mantenimiento enviado a: ${cliente.name} (${añosDesdeEntrega} años)${wamid ? ` wamid:${wamid.slice(-8)}` : ''}`);

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando check-in de mantenimiento a ${cliente.name}:`, err);
      }
    }

    console.log(`🔧 Check-in de mantenimiento completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en checkInMantenimiento:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'checkInMantenimiento', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// Procesar respuesta de check-in de mantenimiento
export async function procesarRespuestaMantenimiento(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string
): Promise<boolean> {
  const notas = typeof lead.notes === 'object' ? lead.notes : {};

  // Verificar si estamos esperando respuesta
  if (!(notas as any)?.esperando_respuesta_mantenimiento) {
    return false;
  }

  // TTL check: si la bandera tiene más de 48h, auto-limpiar
  const flagSetAt = (notas as any)?.esperando_respuesta_mantenimiento_at;
  if (flagSetAt) {
    const horasDesde = (Date.now() - new Date(flagSetAt).getTime()) / (1000 * 60 * 60);
    if (horasDesde > 48) {
      await supabase.client.from('leads').update({
        notes: { ...notas, esperando_respuesta_mantenimiento: false }
      }).eq('id', lead.id);
      return false;
    }
  }

  // Validar que parece respuesta a encuesta
  if (!isLikelySurveyResponse(mensaje, 15, 120)) return false;

  const nombre = lead.name?.split(' ')[0] || 'vecino';
  const mensajeLower = mensaje.toLowerCase();

  let respuesta: string;
  let necesitaProveedores = false;

  if (mensajeLower.includes('ayuda') || mensajeLower.includes('proveedor') || mensajeLower.includes('contacto') || mensajeLower.includes('recomend')) {
    necesitaProveedores = true;
    respuesta = `¡Claro ${nombre}! 🤝

Aquí te comparto proveedores de confianza que trabajan con nosotros:

🔨 *Mantenimiento general:*
Te enviaremos por WhatsApp una lista de proveedores verificados de tu zona.

Un asesor te contactará en breve con las recomendaciones específicas para lo que necesitas.

¿Qué tipo de servicio requieres? (impermeabilización, plomería, electricidad, pintura, etc.)`;
  } else if (mensajeLower.includes('sí') || mensajeLower.includes('si') || mensajeLower.includes('bien') || mensajeLower.includes('todo ok')) {
    respuesta = `¡Excelente ${nombre}! 🏠✨

Nos da gusto saber que todo está en orden.

Recuerda que el mantenimiento preventivo alarga la vida de tu inversión.

¡Aquí estamos si necesitas algo! Saludos 👋`;
  } else {
    // Respuesta genérica
    respuesta = `Gracias por tu respuesta, ${nombre}.

¿Necesitas recomendación de algún proveedor para mantenimiento? Solo dinos qué servicio requieres y te ayudamos. 🔧`;
    necesitaProveedores = true;
  }

  await meta.sendWhatsAppMessage(lead.phone, respuesta);

  // Actualizar notas — set feedback flag para capturar mensaje de seguimiento
  const notasActualizadas = {
    ...notas,
    esperando_respuesta_mantenimiento: false,
    esperando_feedback_mantenimiento: true,
    esperando_feedback_mantenimiento_at: new Date().toISOString(),
    respuesta_mantenimiento: mensaje,
    necesita_proveedores: necesitaProveedores,
    mantenimiento_respondido: new Date().toISOString()
  };

  await supabase.client
    .from('leads')
    .update({ notes: notasActualizadas })
    .eq('id', lead.id);

  // Si necesita proveedores, notificar al vendedor (via enviarMensajeTeamMember para respetar ventana 24h)
  if (necesitaProveedores && lead.assigned_to) {
    const { data: vendedor } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('id', lead.assigned_to)
      .single();

    if (vendedor) {
      await enviarMensajeTeamMember(supabase, meta, vendedor,
        `🔧 *CLIENTE NECESITA PROVEEDORES*\n\nCliente: ${lead.name}\n📱 ${formatPhoneForDisplay(lead.phone)}\nMensaje: "${mensaje}"\n\n💡 Envíale lista de proveedores recomendados.\n📞 bridge ${nombre}`,
        { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
      );
    }
  }

  console.log(`🔧 Respuesta mantenimiento procesada: ${lead.name} - ${necesitaProveedores ? 'NECESITA PROVEEDORES' : 'OK'}`);
  return true;
}

// ═══════════════════════════════════════════════════════════
// CHECK-IN 60 DÍAS POST-VENTA
// ═══════════════════════════════════════════════════════════

export async function checkIn60Dias(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace55dias = new Date(ahora.getTime() - 55 * 24 * 60 * 60 * 1000);
    const hace65dias = new Date(ahora.getTime() - 65 * 24 * 60 * 60 * 1000);

    // Leads con purchase_date entre 55-65 días atrás
    const { data: clientes } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, purchase_date, assigned_to')
      .eq('status', 'sold')
      .not('phone', 'is', null)
      .not('purchase_date', 'is', null)
      .lte('purchase_date', hace55dias.toISOString().split('T')[0])
      .gte('purchase_date', hace65dias.toISOString().split('T')[0])
      .limit(10);

    if (!clientes || clientes.length === 0) {
      console.log('📅 No hay clientes para check-in 60 días');
      return;
    }

    // Filtrar los que ya recibieron el check-in
    const elegibles = clientes.filter(c => {
      const notas = typeof c.notes === 'object' ? c.notes : {};
      return !(notas as any)?.checkin_60d_sent;
    });

    if (elegibles.length === 0) {
      console.log('📅 Todos los clientes de 60 días ya tienen check-in');
      return;
    }

    console.log(`📅 Clientes para check-in 60 días: ${elegibles.length}`);
    let enviados = 0;

    for (const cliente of elegibles) {
      if (enviados >= 5) break;

      const nombre = cliente.name?.split(' ')[0] || 'amigo';
      const desarrollo = cliente.property_interest || 'Grupo Santa Rita';

      const mensaje = `¡Hola ${nombre}! 🏡

Han pasado 2 meses desde tu compra en *${desarrollo}* y queríamos saber cómo va todo.

¿Cómo te has sentido con tu nuevo hogar? ¿Necesitas algo de nuestra parte?

Estamos aquí para lo que necesites 😊`;

      try {
        if (puedeEnviarMensajeAutomatico(supabase, cliente.id)) {
          await meta.sendWhatsAppMessage(cliente.phone!, mensaje);
          registrarMensajeAutomatico(supabase, cliente.id);
          enviados++;

          // Marcar como enviado
          const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notas,
                checkin_60d_sent: true,
                checkin_60d_date: ahora.toISOString(),
                pending_auto_response: {
                  type: 'checkin_60d',
                  sent_at: ahora.toISOString(),
                  vendedor_id: cliente.assigned_to
                }
              }
            })
            .eq('id', cliente.id);

          console.log(`📅 Check-in 60 días enviado a: ${cliente.name}`);
        }
      } catch (e) {
        console.error(`Error enviando check-in 60d a ${cliente.name}:`, e);
      }
    }

    console.log(`📅 Check-in 60 días completado: ${enviados} enviados`);
  } catch (e) {
    console.error('Error en checkIn60Dias:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'checkIn60Dias', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// LLAMADAS DE ESCALAMIENTO POST-VENTA
// Si el lead NO respondió al WhatsApp en 48h → llamar con Retell
// NUNCA se manda WhatsApp + llamada al mismo tiempo
// ═══════════════════════════════════════════════════════════

interface RetellEnv {
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;
}

// Tipos de post-venta que escalan a llamada si no responden
const TIPOS_ESCALABLES_LLAMADA: Record<string, { flag: string; flagAt: string; motivo: string; mensaje: string }> = {
  'post_entrega': {
    flag: 'esperando_respuesta_entrega',
    flagAt: 'esperando_respuesta_entrega_at',
    motivo: 'seguimiento_entrega',
    mensaje: 'Verificar que todo esté bien con su casa nueva: llaves, escrituras, servicios'
  },
  'satisfaccion_casa': {
    flag: 'esperando_respuesta_satisfaccion_casa',
    flagAt: 'esperando_respuesta_satisfaccion_casa_at',
    motivo: 'satisfaccion',
    mensaje: 'Preguntar cómo se siente con su nueva casa y si hay algo por mejorar'
  },
  'nps': {
    flag: 'esperando_respuesta_nps',
    flagAt: 'esperando_respuesta_nps_at',
    motivo: 'encuesta_nps',
    mensaje: 'Preguntar del 0 al 10 qué tan probable es que nos recomiende'
  },
  'referidos': {
    flag: 'solicitando_referidos',
    flagAt: 'solicitando_referidos_at',
    motivo: 'referidos',
    mensaje: 'Preguntar si conoce a alguien que busque casa'
  },
  'checkin_60d': {
    flag: 'checkin_60d_sent',
    flagAt: 'checkin_60d_date',
    motivo: 'checkin_postventa',
    mensaje: 'Check-in: cómo va todo con su casa después de 2 meses'
  },
  'mantenimiento': {
    flag: 'esperando_respuesta_mantenimiento',
    flagAt: 'esperando_respuesta_mantenimiento_at',
    motivo: 'mantenimiento',
    mensaje: 'Recordatorio anual de mantenimiento preventivo de su casa'
  },
};

export async function llamadasEscalamientoPostVenta(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: RetellEnv
): Promise<void> {
  try {
    if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID || !env.RETELL_PHONE_NUMBER) {
      console.log('⏭️ Llamadas post-venta desactivadas - Retell no configurado');
      return;
    }

    console.log('📞 Buscando leads post-venta que NO respondieron WhatsApp (48h+)...');

    const ahora = new Date();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads post-venta con pending_auto_response activo
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, property_interest, assigned_to')
      .in('status', ['sold', 'closed', 'delivered'])
      .not('phone', 'is', null)
      .not('phone', 'like', '%000000%')
      .limit(50);

    if (!leads || leads.length === 0) {
      console.log('📞 No hay leads post-venta para verificar');
      return;
    }

    const { createRetellService } = await import('../services/retellService');
    const retell = createRetellService(
      env.RETELL_API_KEY,
      env.RETELL_AGENT_ID,
      env.RETELL_PHONE_NUMBER
    );

    let llamadasRealizadas = 0;
    const maxLlamadas = 5;

    for (const lead of leads) {
      if (llamadasRealizadas >= maxLlamadas) break;

      const notas = typeof lead.notes === 'object' ? (lead.notes || {}) : {};
      const pendingAuto = (notas as any).pending_auto_response;

      // Debe tener pending_auto_response con tipo escalable
      if (!pendingAuto?.type || !TIPOS_ESCALABLES_LLAMADA[pendingAuto.type]) continue;

      const config = TIPOS_ESCALABLES_LLAMADA[pendingAuto.type];

      // Verificar que el flag de espera siga activo (= NO respondió)
      if (!(notas as any)[config.flag]) continue;

      // Verificar que pasaron 48h+ desde el envío del WhatsApp
      const sentAt = pendingAuto.sent_at || (notas as any)[config.flagAt];
      if (!sentAt) continue;

      const sentDate = new Date(sentAt);
      if (sentDate > hace48h) continue; // Menos de 48h, aún puede responder por WA
      if (sentDate < hace7dias) continue; // Más de 7 días, ya es muy viejo

      // Verificar que no le hayamos llamado ya por este motivo
      const llamadaKey = `llamada_escalamiento_${pendingAuto.type}`;
      if ((notas as any)[llamadaKey]) continue;

      // Verificar que no recibió llamada IA hoy
      if ((notas as any).ultima_llamada_ia === hoyStr) continue;

      // NO tiene flag no_contactar
      if ((notas as any).no_contactar) continue;

      console.log(`📞 Escalando a llamada: ${lead.name} (${pendingAuto.type}, WhatsApp enviado ${sentAt})`);

      try {
        const result = await retell.initiateCall({
          leadId: lead.id,
          leadName: lead.name || 'Cliente',
          leadPhone: lead.phone,
          vendorId: lead.assigned_to,
          desarrolloInteres: lead.property_interest || '',
          motivo: config.motivo
        });

        if (result.success) {
          llamadasRealizadas++;

          // Marcar para no repetir
          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notas,
                ultima_llamada_ia: hoyStr,
                [llamadaKey]: hoyStr,
                llamadas_ia_count: ((notas as any).llamadas_ia_count || 0) + 1,
              }
            })
            .eq('id', lead.id);

          console.log(`📞 Llamada ${pendingAuto.type} iniciada a ${lead.name} (callId: ${result.callId})`);

          // Notificar al vendedor
          if (lead.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('*')
              .eq('id', lead.assigned_to)
              .single();

            if (vendedor) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `📞 *Llamada IA de escalamiento*\n\nCliente: ${lead.name}\nMotivo: ${config.mensaje}\n\n⚠️ No respondió WhatsApp en 48h, SARA le está llamando.`,
                { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
              );
            }
          }

          await new Promise(r => setTimeout(r, 3000)); // Espacio entre llamadas
        }
      } catch (err) {
        console.error(`Error llamando a ${lead.name} (${pendingAuto.type}):`, err);
      }
    }

    console.log(`📞 Escalamiento post-venta completado: ${llamadasRealizadas} llamadas`);
  } catch (e) {
    console.error('Error en llamadasEscalamientoPostVenta:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'llamadasEscalamientoPostVenta', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// LIMPIEZA DE FLAGS DE ENCUESTAS EXPIRADOS
// Corre 1x/día en CRON nocturno (0 1 * * * = 7 PM México)
// Limpia flags esperando_respuesta_* con más de 72h
// ═══════════════════════════════════════════════════════════
export async function limpiarFlagsEncuestasExpirados(
  supabase: SupabaseService
): Promise<{ limpiados: number; leadsAfectados: number }> {
  try {
    console.log('🧹 Iniciando limpieza de flags de encuestas expirados...');

    const flagsALimpiar = [
      { flag: 'esperando_respuesta_nps', at: 'esperando_respuesta_nps_at' },
      { flag: 'esperando_respuesta_entrega', at: 'esperando_respuesta_entrega_at' },
      { flag: 'esperando_respuesta_satisfaccion_casa', at: 'esperando_respuesta_satisfaccion_casa_at' },
      { flag: 'esperando_respuesta_mantenimiento', at: 'esperando_respuesta_mantenimiento_at' },
      { flag: 'esperando_feedback_nps', at: 'esperando_feedback_nps_at' },
      { flag: 'esperando_feedback_entrega', at: 'esperando_feedback_entrega_at' },
      { flag: 'esperando_feedback_satisfaccion', at: 'esperando_feedback_satisfaccion_at' },
      { flag: 'esperando_feedback_mantenimiento', at: 'esperando_feedback_mantenimiento_at' },
      { flag: 'esperando_feedback_satisfaction_survey', at: 'esperando_feedback_satisfaction_survey_at' },
      { flag: 'pending_noshow_reagendar', at: '' },
      { flag: 'pending_client_survey', at: '' },
      { flag: 'pending_satisfaction_survey', at: '' },
    ];

    // Buscar leads con cualquier flag de encuesta pendiente
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, notes')
      .not('notes', 'is', null);

    if (!leads || leads.length === 0) {
      console.log('🧹 No hay leads con notes para verificar');
      return { limpiados: 0, leadsAfectados: 0 };
    }

    let totalLimpiados = 0;
    let leadsAfectados = 0;
    const ahora = Date.now();
    const HORAS_EXPIRACION = 72;

    for (const lead of leads) {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      let modificado = false;
      let flagsLimpiados = 0;

      for (const { flag, at } of flagsALimpiar) {
        if (!notas[flag]) continue;

        // Determinar timestamp: del campo _at, o de sent_at dentro del objeto
        let timestamp: string | null = null;
        if (at && notas[at]) {
          timestamp = notas[at];
        } else if (typeof notas[flag] === 'object' && notas[flag].sent_at) {
          timestamp = notas[flag].sent_at;
        }

        if (!timestamp) {
          // Sin timestamp → flag huérfano, limpiar
          delete notas[flag];
          if (at) delete notas[at];
          modificado = true;
          flagsLimpiados++;
          continue;
        }

        const horasDesde = (ahora - new Date(timestamp).getTime()) / (1000 * 60 * 60);
        if (horasDesde > HORAS_EXPIRACION) {
          console.log(`🧹 Limpiando ${flag} de ${lead.name || lead.id} (${Math.round(horasDesde)}h)`);
          delete notas[flag];
          if (at) delete notas[at];
          modificado = true;
          flagsLimpiados++;
        }
      }

      if (modificado) {
        await supabase.client
          .from('leads')
          .update({ notes: notas })
          .eq('id', lead.id);
        totalLimpiados += flagsLimpiados;
        leadsAfectados++;
      }
    }

    console.log(`🧹 Limpieza completada: ${totalLimpiados} flags de ${leadsAfectados} leads`);
    return { limpiados: totalLimpiados, leadsAfectados };
  } catch (e) {
    console.error('Error en limpiarFlagsEncuestasExpirados:', e);
    logErrorToDB(supabase, 'cron_error', 'error', 'limpiarFlagsEncuestasExpirados', (e as Error).message || String(e), (e as Error).stack).catch(() => {});
    return { limpiados: 0, leadsAfectados: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
// PROCESAR FEEDBACK POST-ENCUESTA
// Captura el mensaje de seguimiento después de que el lead
// respondió a una encuesta (NPS, satisfacción, entrega, mantenimiento).
// Sin esto, el mensaje caía al flujo normal de IA.
// ═══════════════════════════════════════════════════════════
export async function procesarFeedbackEncuesta(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string
): Promise<boolean> {
  const notas = typeof lead.notes === 'object' ? lead.notes : {};

  // Check all feedback flags (4 CRON surveys + 1 post-visit satisfaction)
  const feedbackFlags = [
    { flag: 'esperando_feedback_nps', at: 'esperando_feedback_nps_at', tipo: 'nps', noteKey: 'nps_feedback' },
    { flag: 'esperando_feedback_entrega', at: 'esperando_feedback_entrega_at', tipo: 'entrega', noteKey: 'entrega_feedback' },
    { flag: 'esperando_feedback_satisfaccion', at: 'esperando_feedback_satisfaccion_at', tipo: 'satisfaccion', noteKey: 'satisfaccion_casa_feedback' },
    { flag: 'esperando_feedback_mantenimiento', at: 'esperando_feedback_mantenimiento_at', tipo: 'mantenimiento', noteKey: 'mantenimiento_feedback' },
    { flag: 'esperando_feedback_satisfaction_survey', at: 'esperando_feedback_satisfaction_survey_at', tipo: 'satisfaction_survey', noteKey: 'satisfaction_survey_feedback' },
  ];

  for (const { flag, at, tipo, noteKey } of feedbackFlags) {
    if (!(notas as any)?.[flag]) continue;

    // TTL check: if flag is older than 48h, auto-clean and skip
    const flagSetAt = (notas as any)?.[at];
    if (flagSetAt) {
      const horasDesde = (Date.now() - new Date(flagSetAt).getTime()) / (1000 * 60 * 60);
      if (horasDesde > 48) {
        const cleanNotas = { ...notas };
        delete (cleanNotas as any)[flag];
        delete (cleanNotas as any)[at];
        await supabase.client.from('leads').update({ notes: cleanNotas }).eq('id', lead.id);
        continue;
      }
    }

    // We have an active feedback flag — capture the message
    const nombre = lead.name?.split(' ')[0] || 'amigo';
    await meta.sendWhatsAppMessage(lead.phone, `¡Gracias por tu comentario, ${nombre}! Lo tomaremos muy en cuenta. 🙏`);

    // Clear the feedback flag and save the feedback
    const notasActualizadas = { ...notas };
    delete (notasActualizadas as any)[flag];
    delete (notasActualizadas as any)[at];
    (notasActualizadas as any)[noteKey] = mensaje;
    (notasActualizadas as any)[`${noteKey}_at`] = new Date().toISOString();

    await supabase.client.from('leads').update({ notes: notasActualizadas }).eq('id', lead.id);

    console.log(`💬 Feedback ${tipo} capturado para ${lead.name}: "${mensaje.substring(0, 60)}"`);
    return true;
  }

  return false;
}
