/**
 * ALERTAS Y NOTIFICACIONES - Sistema de alertas automáticas
 *
 * Funciones principales:
 * - enviarAlertasLeadsFrios: Leads sin actividad
 * - enviarAlertasProactivasCEO: Alertas al CEO
 * - alertaInactividadVendedor: Vendedores inactivos
 * - alertaLeadsHotSinSeguimiento: Leads HOT sin seguimiento
 * - alertaLeadsHotUrgentes: Alerta 2pm urgente
 * - recordatorioFinalDia: Resumen 5pm
 * - detectarNoShows: Verificar asistencia a citas
 * - verificarVideosPendientes: Procesar videos Veo3
 * - remarketingLeadsFrios: Reactivación automática
 * - followUpLeadsInactivos: Follow-up 3+ días
 * - recordatoriosPagoApartado: Recordatorios de pago
 * - reactivarLeadsPerdidos: Leads perdidos 30+ días
 * - felicitarCumpleañosLeads: Cumpleaños de leads
 * - felicitarCumpleañosEquipo: Cumpleaños del equipo
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { formatPhoneForDisplay } from '../handlers/whatsapp-utils';
import { CalendarService } from '../services/calendar';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { logErrorToDB } from './healthCheck';

// ═══════════════════════════════════════════════════════════════
// ALERTAS DE LEADS FRÍOS - Diario 10am L-V
// ═══════════════════════════════════════════════════════════════
export async function enviarAlertasLeadsFrios(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🥶 Iniciando verificación de leads fríos...');

    const ahora = new Date();
    const hace2Dias = new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000);
    const hace3Dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hace5Dias = new Date(ahora.getTime() - 5 * 24 * 60 * 60 * 1000);
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Obtener leads activos (no cerrados ni caídos) - máx 500 para evitar queries enormes
    const { data: leadsActivos } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, assigned_to, score, updated_at, created_at, notes, team_members:assigned_to(id, name, phone, role)')
      .not('status', 'in', '("closed","delivered","fallen","paused","lost")')
      .order('updated_at', { ascending: true })
      .limit(500);

    if (!leadsActivos || leadsActivos.length === 0) {
      console.log('✅ No hay leads activos para revisar');
      return;
    }

    // Categorizar leads fríos
    const vendedoresMap = new Map<string, any>();
    const leadsPorVendedor = new Map<string, { lead: any; razon: string; diasSinContacto: number }[]>();

    for (const lead of leadsActivos) {
      const vendedor = lead.team_members;
      if (!vendedor?.id) continue;

      const ultimaActividad = new Date(lead.updated_at || lead.created_at);
      const diasSinContacto = Math.floor((ahora.getTime() - ultimaActividad.getTime()) / (1000 * 60 * 60 * 24));

      let razon = '';
      let esFrio = false;

      // Reglas de lead frío
      if (lead.status === 'new' && ultimaActividad < hace2Dias) {
        razon = '🆕 Lead NUEVO sin atender';
        esFrio = true;
      } else if (lead.status === 'contacted' && ultimaActividad < hace3Dias) {
        razon = '📞 Contactado pero sin avance';
        esFrio = true;
      } else if (lead.status === 'scheduled' && ultimaActividad < hace3Dias) {
        razon = '📅 Cita sin seguimiento';
        esFrio = true;
      } else if (lead.status === 'visited' && ultimaActividad < hace5Dias) {
        razon = '🏠 Visitó pero sin avance';
        esFrio = true;
      } else if ((lead.status === 'negotiation' || lead.status === 'reserved') && ultimaActividad < hace7Dias) {
        razon = '💰 Negociación ESTANCADA';
        esFrio = true;
      }

      if (esFrio) {
        if (!vendedoresMap.has(vendedor.id)) {
          vendedoresMap.set(vendedor.id, vendedor);
          leadsPorVendedor.set(vendedor.id, []);
        }
        leadsPorVendedor.get(vendedor.id)!.push({ lead, razon, diasSinContacto });
      }
    }

    // Enviar alertas a cada vendedor
    let alertasEnviadas = 0;
    for (const [vendedorId, vendedor] of vendedoresMap) {
      try {
        const leadsDelVendedor = leadsPorVendedor.get(vendedorId) || [];
        if (leadsDelVendedor.length === 0 || !vendedor.phone) continue;

        // Ordenar por días sin contacto (más críticos primero)
        leadsDelVendedor.sort((a, b) => b.diasSinContacto - a.diasSinContacto);

        // Tomar máximo 5 leads para no saturar
        const top5 = leadsDelVendedor.slice(0, 5);

        let mensaje = `🥶 *ALERTA: ${leadsDelVendedor.length} LEAD(S) ENFRIÁNDOSE*\n`;
        mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (const { lead, razon, diasSinContacto } of top5) {
          mensaje += `${razon}\n`;
          mensaje += `👤 *${lead.name || 'Sin nombre'}*\n`;
          mensaje += `📱 ${formatPhoneForDisplay(lead.phone)}\n`;
          mensaje += `⏰ ${diasSinContacto} días sin contacto\n`;
          if (lead.property_interest) mensaje += `🏠 ${lead.property_interest}\n`;
          mensaje += `\n`;
        }

        if (leadsDelVendedor.length > 5) {
          mensaje += `_...y ${leadsDelVendedor.length - 5} más_\n\n`;
        }

        mensaje += `⚡ *¡Contacta hoy para no perderlos!*`;

        await enviarMensajeTeamMember(supabase, meta, vendedor, mensaje, {
          tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
        });
        alertasEnviadas++;
        console.log(`📤 Alerta enviada a ${vendedor.name}: ${leadsDelVendedor.length} leads fríos`);
      } catch (error) {
        console.error(`❌ Error enviando alerta leads fríos a vendedor ${vendedor.name || vendedorId}:`, error);
        continue;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ALERTA A ASESORES HIPOTECARIOS
    // ═══════════════════════════════════════════════════════════
    const { data: hipotecasFrias } = await supabase.client
      .from('mortgage_applications')
      .select('*, leads(name, phone, property_interest), team_members!mortgage_applications_assigned_advisor_id_fkey(id, name, phone)')
      .not('status', 'in', '("approved","rejected","cancelled")')
      .lt('updated_at', hace5Dias.toISOString());

    if (hipotecasFrias && hipotecasFrias.length > 0) {
      // Agrupar por asesor
      const hipotecasPorAsesor = new Map<string, any[]>();
      const asesoresMap = new Map<string, any>();

      for (const hip of hipotecasFrias) {
        const asesor = hip.team_members;
        if (!asesor?.id || !asesor?.phone || asesor?.is_active === false) continue;
        if (!asesoresMap.has(asesor.id)) {
          asesoresMap.set(asesor.id, asesor);
          hipotecasPorAsesor.set(asesor.id, []);
        }
        hipotecasPorAsesor.get(asesor.id)!.push(hip);
      }

      for (const [asesorId, asesor] of asesoresMap) {
        try {
          const hipotecas = hipotecasPorAsesor.get(asesorId) || [];
          if (hipotecas.length === 0) continue;

          let mensaje = `🥶 *ALERTA: ${hipotecas.length} CRÉDITO(S) SIN MOVIMIENTO*\n`;
          mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`;

          for (const hip of hipotecas.slice(0, 5)) {
            const diasSinMov = Math.floor((ahora.getTime() - new Date(hip.updated_at).getTime()) / (1000 * 60 * 60 * 24));
            mensaje += `👤 *${hip.leads?.name || 'Sin nombre'}*\n`;
            mensaje += `📱 ${hip.leads?.phone ? formatPhoneForDisplay(hip.leads.phone) : 'N/A'}\n`;
            mensaje += `⏰ ${diasSinMov} días sin movimiento\n`;
            mensaje += `📊 Status: ${hip.status}\n\n`;
          }

          if (hipotecas.length > 5) {
            mensaje += `_...y ${hipotecas.length - 5} más_\n\n`;
          }

          mensaje += `⚡ *¡Dar seguimiento para no perder la venta!*`;

          await enviarMensajeTeamMember(supabase, meta, asesor, mensaje, {
            tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
          });
          alertasEnviadas++;
          console.log(`📤 Alerta créditos enviada a ${asesor.name}: ${hipotecas.length} créditos fríos`);
        } catch (error) {
          console.error(`❌ Error enviando alerta créditos a asesor ${asesor.name || asesorId}:`, error);
          continue;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ALERTA A CEO/ADMIN - Resumen de leads críticos
    // ═══════════════════════════════════════════════════════════
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .in('role', ['admin', 'ceo', 'coordinador'])
      .eq('active', true);

    if (admins && admins.length > 0) {
      // Contar totales por categoría
      let totalNuevosSinAtender = 0;
      let totalNegociacionEstancada = 0;
      let totalCreditosSinMover = 0;

      for (const [, leads] of leadsPorVendedor) {
        for (const { razon } of leads) {
          if (razon.includes('NUEVO')) totalNuevosSinAtender++;
          if (razon.includes('ESTANCADA')) totalNegociacionEstancada++;
        }
      }
      totalCreditosSinMover = hipotecasFrias?.length || 0;

      const hayAlertasCriticas = totalNuevosSinAtender > 0 || totalNegociacionEstancada > 0 || totalCreditosSinMover > 2;

      if (hayAlertasCriticas) {
        let mensaje = `📊 *REPORTE LEADS FRÍOS*\n`;
        mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (totalNuevosSinAtender > 0) {
          mensaje += `🚨 *${totalNuevosSinAtender}* leads NUEVOS sin atender (+2 días)\n`;
        }
        if (totalNegociacionEstancada > 0) {
          mensaje += `💰 *${totalNegociacionEstancada}* negociaciones ESTANCADAS (+7 días)\n`;
        }
        if (totalCreditosSinMover > 0) {
          mensaje += `🏦 *${totalCreditosSinMover}* créditos sin movimiento (+5 días)\n`;
        }

        mensaje += `\n_Ya se notificó a los vendedores y asesores._`;

        for (const admin of admins) {
          try {
            if (admin.phone) {
              await enviarMensajeTeamMember(supabase, meta, admin, mensaje, {
                tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
              });
              alertasEnviadas++;
              console.log(`📤 Resumen enviado a ${admin.name} (${admin.role})`);
            }
          } catch (error) {
            console.error(`❌ Error enviando resumen leads fríos a admin ${admin.name || admin.id}:`, error);
            continue;
          }
        }
      }
    }

    console.log(`✅ Alertas de leads fríos completadas: ${alertasEnviadas} mensajes enviados`);

  } catch (error) {
    console.error('❌ Error en alertas de leads fríos:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'enviarAlertasLeadsFrios', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// VERIFICACIÓN DE CONSISTENCIA GOOGLE CALENDAR
// ═══════════════════════════════════════════════════════════════
export async function verificarConsistenciaCalendario(
  supabase: SupabaseService,
  env: any,
  meta?: any
): Promise<{ canceladas: number; verificadas: number }> {
  const resultado = { canceladas: 0, verificadas: 0 };

  try {
    console.log('🔄 Verificando consistencia Google Calendar <-> Supabase...');

    // Obtener citas activas con google_event_vendedor_id
    const ahora = new Date();
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const en30Dias = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: citasConGoogle } = await supabase.client
      .from('appointments')
      .select('id, lead_name, lead_phone, scheduled_date, scheduled_time, property_name, status, google_event_vendedor_id, vendedor_id')
      .not('google_event_vendedor_id', 'is', null)
      .in('status', ['scheduled', 'completed'])
      .gte('scheduled_date', hace7Dias.toISOString().split('T')[0])
      .lte('scheduled_date', en30Dias.toISOString().split('T')[0]);

    if (!citasConGoogle || citasConGoogle.length === 0) {
      console.log('✅ No hay citas con Google Calendar para verificar');
      return resultado;
    }

    // Obtener eventos de Google Calendar
    const calendar = new CalendarService(
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.GOOGLE_PRIVATE_KEY,
      env.GOOGLE_CALENDAR_ID
    );

    const events = await calendar.getEvents(
      hace7Dias.toISOString(),
      en30Dias.toISOString()
    );
    const googleEventIds = new Set(events.map((e: any) => e.id));

    // Verificar cada cita
    for (const cita of citasConGoogle) {
      resultado.verificadas++;

      // Si el evento NO existe en Google Calendar
      if (!googleEventIds.has(cita.google_event_vendedor_id)) {
        console.error(`⚠️ Cita ${cita.id} (${cita.lead_name}) - evento NO existe en Google Calendar`);

        // Marcar como cancelled
        await supabase.client
          .from('appointments')
          .update({
            status: 'cancelled',
            cancelled_by: 'Sistema (evento eliminado de Google Calendar)',
            updated_at: new Date().toISOString()
          })
          .eq('id', cita.id);

        resultado.canceladas++;
        console.error(`❌ Cita ${cita.id} marcada como cancelled (evento borrado de Google)`);

        // Notificar al vendedor
        if (meta && cita.vendedor_id) {
          try {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('id, name, phone')
              .eq('id', cita.vendedor_id)
              .single();
            if (vendedor?.phone) {
              await enviarMensajeTeamMember(supabase, meta, vendedor,
                `⚠️ *Cita cancelada automáticamente*\n\nLead: ${cita.lead_name}\nFecha: ${cita.scheduled_date} ${cita.scheduled_time || ''}\n\nMotivo: El evento fue eliminado de Google Calendar. Si fue un error, reagenda con: agendar cita ${cita.lead_name?.split(' ')[0]}`,
                { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
              );
            }
          } catch (notifErr) {
            console.error(`⚠️ No se pudo notificar vendedor sobre cita cancelada:`, notifErr);
          }
        }
      }
    }

    if (resultado.canceladas > 0) {
      console.log(`🔄 Consistencia: ${resultado.verificadas} verificadas, ${resultado.canceladas} canceladas por inconsistencia`);
    } else {
      console.log(`✅ Consistencia OK: ${resultado.verificadas} citas verificadas`);
    }

  } catch (error) {
    console.error('Error verificando consistencia calendario:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'verificarConsistenciaCalendario', stack: (error as Error).stack });
  }

  return resultado;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Verificar si vendedor tiene interacción pendiente
// ═══════════════════════════════════════════════════════════════
export function tieneInteraccionPendiente(notas: any): { tiene: boolean; tipo: string | null } {
  if (!notas) return { tiene: false, tipo: null };

  // Lista de TODOS los tipos de interacciones pendientes
  const tiposPendientes = [
    'pending_show_confirmation',      // ¿Llegó el cliente?
    'pending_post_visit_feedback',    // Feedback post-visita
    'pending_client_survey',          // Encuesta de satisfacción
    'pending_noshow_followup',        // Seguimiento no-show
    'pending_reschedule',             // Esperando reagendar
    'pending_bridge_appointment',     // Bridge pendiente
    'pending_event_registration',     // Registro evento pendiente
    'pending_lead_response',          // Esperando respuesta de lead
  ];

  for (const tipo of tiposPendientes) {
    if (notas[tipo]) {
      return { tiene: true, tipo };
    }
  }

  return { tiene: false, tipo: null };
}

// ═══════════════════════════════════════════════════════════════
// NO-SHOW DETECTION & RESCHEDULE
// ═══════════════════════════════════════════════════════════════
export async function detectarNoShows(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('👻 Verificando citas para confirmar asistencia...');

    const ahora = new Date();

    // Usar timezone México para la fecha de hoy
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const hoyStr = mexicoFormatter.format(ahora);

    console.log(`📅 Fecha hoy (México): ${hoyStr}`);

    // Buscar citas de hoy que estén en status 'scheduled'
    const { data: citasPotenciales, error: errorCitas } = await supabase.client
      .from('appointments')
      .select('*')
      .eq('status', 'scheduled')
      .eq('scheduled_date', hoyStr);

    console.log(`📋 Citas encontradas: ${citasPotenciales?.length || 0}, error: ${errorCitas?.message || 'ninguno'}`);

    if (!citasPotenciales || citasPotenciales.length === 0) {
      console.log('✅ No hay citas pendientes de confirmar');
      return;
    }

    let preguntasEnviadas = 0;

    for (const cita of citasPotenciales) {
      try {
      console.log(`🔍 Evaluando cita ${cita.id}: ${cita.lead_name} a las ${cita.scheduled_time}`);

      // Parsear fecha y hora de la cita
      const horaCita = cita.scheduled_time || '12:00';

      // Crear fecha/hora completa de la cita
      const [horas, minutos] = horaCita.split(':').map(Number);
      const fechaHoraCita = new Date(hoyStr + 'T00:00:00Z'); // Forzar UTC
      fechaHoraCita.setUTCHours(horas || 12, minutos || 0, 0, 0);

      // La hora de la cita está en tiempo México — convertir a UTC (DST-aware)
      const mexicoNowForOffset = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const mexicoUTCOffset = Math.round((new Date().getTime() - mexicoNowForOffset.getTime()) / (60 * 60 * 1000));
      const fechaHoraCitaUTC = new Date(fechaHoraCita.getTime() + mexicoUTCOffset * 60 * 60 * 1000);

      // Buffer de 1 HORA después de la hora de la cita para preguntar
      const tiempoParaPreguntar = new Date(fechaHoraCitaUTC.getTime() + 60 * 60 * 1000);

      console.log(`⏰ Hora cita México: ${horas}:${minutos}, UTC: ${fechaHoraCitaUTC.toISOString()}, Preguntar después de: ${tiempoParaPreguntar.toISOString()}, Ahora: ${ahora.toISOString()}`);

      // Si aún no ha pasado el tiempo, no preguntar todavía
      if (ahora < tiempoParaPreguntar) {
        console.log(`⏭️ Aún no es momento de preguntar (faltan ${Math.round((tiempoParaPreguntar.getTime() - ahora.getTime()) / 60000)} min)`);
        continue;
      }

      // Buscar el vendedor manualmente
      let vendedor: any = null;
      if (cita.vendedor_id) {
        const { data: vendedorData } = await supabase.client
          .from('team_members')
          .select('id, name, phone')
          .eq('id', cita.vendedor_id)
          .single();
        vendedor = vendedorData;
      }

      // Buscar el lead manualmente si existe
      let lead: any = null;
      if (cita.lead_id) {
        const { data: leadData } = await supabase.client
          .from('leads')
          .select('id, name, phone, property_interest')
          .eq('id', cita.lead_id)
          .single();
        lead = leadData;
      }

      if (!vendedor?.phone) {
        console.error(`⚠️ Cita ${cita.id} sin vendedor o sin teléfono, saltando`);
        continue;
      }

      // Verificar si ya preguntamos sobre esta cita (revisar notes del vendedor)
      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedor.id)
        .single();

      let notasActuales: any = {};
      try {
        if (vendedorData?.notes) {
          notasActuales = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
        }
      } catch (e) {
        console.error(`⚠️ Error parseando notas de ${vendedor.name}:`, e);
        notasActuales = {};
      }

      // Si ya tiene CUALQUIER interacción pendiente, saltar
      const pendiente = tieneInteraccionPendiente(notasActuales);
      if (pendiente.tiene) {
        console.log(`⏭️ Vendedor ${vendedor.name} ya tiene ${pendiente.tipo} pendiente, saltando cita ${cita.id}`);
        continue;
      }

      // Verificar si ya preguntamos sobre ESTA cita específica
      const citasPreguntadas = notasActuales?.citas_preguntadas || [];
      if (citasPreguntadas.includes(cita.id)) {
        console.log(`⏭️ Ya se preguntó sobre cita ${cita.id}, saltando`);
        continue;
      }

      // Formatear hora bonita
      const ampm = horas >= 12 ? 'pm' : 'am';
      const hora12 = horas > 12 ? horas - 12 : (horas === 0 ? 12 : horas);
      const horaFormateada = `${hora12}:${String(minutos || 0).padStart(2, '0')} ${ampm}`;

      // Mensaje al vendedor preguntando si llegó el cliente
      const leadName = lead?.name || cita.lead_name || 'el cliente';
      const esLlamada = cita.appointment_type === 'llamada';

      let mensajeVendedor: string;
      if (esLlamada) {
        mensajeVendedor = `📋 *¿CONTESTÓ ${leadName.toUpperCase()}?*

📞 Llamada de las ${horaFormateada}

Responde para *${leadName}*:
1️⃣ Sí contestó
2️⃣ No contestó`;
      } else {
        mensajeVendedor = `📋 *¿LLEGÓ ${leadName.toUpperCase()}?*

Cita de las ${horaFormateada}
🏠 ${cita.property_interest || cita.property_name || cita.location || 'la propiedad'}

Responde para *${leadName}*:
1️⃣ Sí llegó
2️⃣ No llegó`;
      }

      await enviarMensajeTeamMember(supabase, meta, vendedor, mensajeVendedor, {
        tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
      });
      console.log(`📤 Pregunta de asistencia enviada a ${vendedor.name} para cita ${cita.id}`);

      // Guardar en team_member_notes que estamos esperando confirmación
      const propertyName = cita.property_interest || cita.property_name || cita.location || 'la propiedad';
      notasActuales.pending_show_confirmation = {
        appointment_id: cita.id,
        lead_id: lead?.id || null,
        lead_name: lead?.name || cita.lead_name,
        lead_phone: lead?.phone || cita.lead_phone,
        property: propertyName,
        hora: horaFormateada,
        asked_at: ahora.toISOString()
      };

      // Agregar esta cita a la lista de citas preguntadas
      if (!notasActuales.citas_preguntadas) {
        notasActuales.citas_preguntadas = [];
      }
      notasActuales.citas_preguntadas.push(cita.id);

      await supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notasActuales) })
        .eq('id', vendedor.id);

      preguntasEnviadas++;
      } catch (error) {
        console.error(`❌ Error procesando cita ${cita.id} (${cita.lead_name}):`, error);
        continue;
      }
    }

    console.log(`✅ Preguntas de asistencia enviadas: ${preguntasEnviadas}`);

  } catch (error) {
    console.error('❌ Error verificando asistencia:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'detectarNoShows', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// TIMEOUT DE CONFIRMACIONES - 2h sin respuesta
// ═══════════════════════════════════════════════════════════════
export async function verificarTimeoutConfirmaciones(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('⏰ Verificando confirmaciones expiradas...');

    const ahora = new Date();
    const dosHorasAtras = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);

    // Buscar vendedores con confirmaciones pendientes
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone, notes')
      .eq('role', 'vendedor');

    if (!vendedores || vendedores.length === 0) return;

    let timeoutsEncontrados = 0;

    for (const vendedor of vendedores) {
      try {
        let notes: any = {};
        try {
          if (vendedor.notes) {
            notes = typeof vendedor.notes === 'string'
              ? JSON.parse(vendedor.notes)
              : vendedor.notes;
          }
        } catch (e) {
          continue;
        }

        // Verificar si tiene confirmación pendiente
        const confirmacion = notes?.pending_show_confirmation;
        if (!confirmacion?.asked_at) continue;

        // Si ya enviamos recordatorio, no enviar otro
        if (confirmacion.reminder_sent) {
          console.log(`⏭️ Ya se envió recordatorio a ${vendedor.name} sobre ${confirmacion.lead_name}, saltando`);
          continue;
        }

        const preguntadoEn = new Date(confirmacion.asked_at);

        // Si ya pasaron 2 horas sin respuesta
        if (preguntadoEn < dosHorasAtras) {
          console.log(`⏰ TIMEOUT: Vendedor ${vendedor.name} no respondió sobre ${confirmacion.lead_name}`);
          timeoutsEncontrados++;

          // NO enviamos encuesta automáticamente - solo recordamos al vendedor
          if (vendedor.phone) {
            await enviarMensajeTeamMember(supabase, meta, vendedor,
              `⏰ *Recordatorio pendiente*\n\n` +
              `No respondiste sobre la cita con *${confirmacion.lead_name}*.\n\n` +
              `¿Llegó a la visita?\n` +
              `1️⃣ Sí llegó\n` +
              `2️⃣ No llegó\n\n` +
              `_Responde para que pueda dar seguimiento adecuado._`,
              { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
            );
            console.log(`📤 Recordatorio enviado a ${vendedor.name} sobre ${confirmacion.lead_name}`);
          }

          // Marcar que ya enviamos recordatorio
          const notasActualizadas = { ...notes };
          notasActualizadas.pending_show_confirmation = {
            ...confirmacion,
            reminder_sent: true,
            reminder_sent_at: new Date().toISOString()
          };

          await supabase.client
            .from('team_members')
            .update({ notes: JSON.stringify(notasActualizadas) })
            .eq('id', vendedor.id);
        }
      } catch (error) {
        console.error(`❌ Error procesando timeout confirmación vendedor ${vendedor.name || vendedor.id}:`, error);
        continue;
      }
    }

    console.log(`⏰ Timeouts procesados: ${timeoutsEncontrados}`);

  } catch (error) {
    console.error('❌ Error verificando timeouts:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'verificarTimeoutConfirmaciones', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTAS PROACTIVAS CEO
// ═══════════════════════════════════════════════════════════════
export async function enviarAlertasProactivasCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener CEOs/Admins
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .in('role', ['admin', 'coordinador'])
      .eq('active', true);

    if (!admins || admins.length === 0) return;

    const alertas: string[] = [];
    const hoy = new Date();

    // 1. Leads nuevos sin contactar > 24h
    const limite24h = new Date(hoy);
    limite24h.setHours(limite24h.getHours() - 24);
    const { data: sinContactar } = await supabase.client
      .from('leads')
      .select('*')
      .eq('status', 'new')
      .lt('created_at', limite24h.toISOString());

    if (sinContactar && sinContactar.length >= 3) {
      alertas.push(`⚠️ *${sinContactar.length} leads sin contactar* (+24h)`);
    }

    // 2. Citas de hoy sin confirmar
    const hoyStr = hoy.toISOString().split('T')[0];
    const { data: citasSinConfirmar } = await supabase.client
      .from('appointments')
      .select('*')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled');

    if (citasSinConfirmar && citasSinConfirmar.length > 0 && hoy.getHours() >= 10) {
      alertas.push(`📅 *${citasSinConfirmar.length} citas hoy* pendientes`);
    }

    // 3. Leads HOT sin actividad > 48h
    const limite48h = new Date(hoy);
    limite48h.setHours(limite48h.getHours() - 48);
    const { data: hotInactivos } = await supabase.client
      .from('leads')
      .select('*')
      .in('status', ['negotiation', 'reserved'])
      .lt('updated_at', limite48h.toISOString());

    if (hotInactivos && hotInactivos.length > 0) {
      alertas.push(`🔥 *${hotInactivos.length} leads HOT* sin movimiento (+48h)`);
    }

    // 4. Pipeline en riesgo (muchos leads fríos)
    const { data: allLeads } = await supabase.client
      .from('leads')
      .select('status');

    if (allLeads && allLeads.length >= 10) {
      const frios = allLeads.filter(l => ['new', 'contacted'].includes(l.status)).length;
      const ratio = frios / allLeads.length;
      if (ratio > 0.7) {
        alertas.push(`❄️ *Pipeline frío:* ${Math.round(ratio * 100)}% leads sin avanzar`);
      }
    }

    // Si no hay alertas, no enviar nada
    if (alertas.length === 0) {
      console.log('✅ Sin alertas críticas');
      return;
    }

    // Construir mensaje
    const msg = `🚨 *ALERTAS - ${hoy.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}*\n\n` +
      alertas.join('\n\n') +
      '\n\n_Escribe *resumen* para más detalles_';

    // Enviar a cada admin (evitar duplicados)
    const telefonosEnviados = new Set<string>();
    for (const admin of admins) {
      if (!admin.phone) continue;
      const tel = admin.phone.replace(/\D/g, '');
      if (telefonosEnviados.has(tel)) continue;
      telefonosEnviados.add(tel);

      try {
        await enviarMensajeTeamMember(supabase, meta, admin, msg, {
          tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
        });
        console.log(`🚨 Alerta enviada a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando alerta a ${admin.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en alertas proactivas:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarAlertasProactivasCEO', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERTA INACTIVIDAD VENDEDOR
// ═══════════════════════════════════════════════════════════════════════════
export async function alertaInactividadVendedor(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener admins para notificar
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .in('role', ['admin', 'coordinador', 'ceo', 'director'])
      .eq('active', true);

    if (!admins || admins.length === 0) {
      console.error('⚠️ No hay admins para notificar');
      return;
    }

    // Obtener vendedores activos
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone, last_sara_interaction')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) {
      console.error('⚠️ No hay vendedores activos');
      return;
    }

    const ahora = new Date();
    const hace4h = new Date(ahora.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const hoyStr = ahora.toISOString().split('T')[0];

    const vendedoresInactivos: Array<{ nombre: string; motivo: string; leadsAfectados: number }> = [];

    for (const vendedor of vendedores) {
      const motivos: string[] = [];
      let leadsAfectados = 0;

      // 1. Verificar si tiene leads asignados sin actualizar en 4h+
      const { data: leadsEstancados } = await supabase.client
        .from('leads')
        .select('id, name, status')
        .eq('assigned_to', vendedor.id)
        .in('status', ['new', 'contacted', 'scheduled'])
        .lt('updated_at', hace4h);

      if (leadsEstancados && leadsEstancados.length >= 2) {
        motivos.push(`${leadsEstancados.length} leads sin actualizar (+4h)`);
        leadsAfectados += leadsEstancados.length;
      }

      // 2. Verificar si tiene citas de hoy sin confirmar
      const { data: citasSinConfirmar } = await supabase.client
        .from('appointments')
        .select('id, lead_name')
        .eq('vendedor_id', vendedor.id)
        .eq('scheduled_date', hoyStr)
        .eq('status', 'scheduled');

      if (citasSinConfirmar && citasSinConfirmar.length > 0 && ahora.getHours() >= 10) {
        motivos.push(`${citasSinConfirmar.length} cita(s) hoy sin confirmar`);
      }

      // 3. Verificar última interacción con SARA
      if (vendedor.last_sara_interaction) {
        const ultimaInteraccion = new Date(vendedor.last_sara_interaction);
        const horasSinInteraccion = (ahora.getTime() - ultimaInteraccion.getTime()) / (1000 * 60 * 60);
        if (horasSinInteraccion > 24) {
          motivos.push(`Sin contactar SARA en ${Math.floor(horasSinInteraccion)}h`);
        }
      } else {
        motivos.push('Nunca ha interactuado con SARA');
      }

      // Si hay 2+ motivos de inactividad, agregar a la lista
      if (motivos.length >= 2) {
        vendedoresInactivos.push({
          nombre: vendedor.name || 'Sin nombre',
          motivo: motivos.join(', '),
          leadsAfectados
        });
      }
    }

    // Si no hay vendedores inactivos, no enviar nada
    if (vendedoresInactivos.length === 0) {
      console.log('✅ Todos los vendedores están activos');
      return;
    }

    // Construir mensaje de alerta
    let msg = `👔 *ALERTA: VENDEDORES INACTIVOS*\n\n`;
    msg += `Se detectaron ${vendedoresInactivos.length} vendedor(es) con baja actividad:\n\n`;

    for (const v of vendedoresInactivos.slice(0, 5)) {
      msg += `• *${v.nombre}*\n`;
      msg += `  ${v.motivo}\n`;
      if (v.leadsAfectados > 0) {
        msg += `  📊 ${v.leadsAfectados} leads afectados\n`;
      }
      msg += '\n';
    }

    if (vendedoresInactivos.length > 5) {
      msg += `...y ${vendedoresInactivos.length - 5} más\n\n`;
    }

    msg += '💡 _Considera contactarlos para verificar su disponibilidad_';

    // Enviar a admins (evitar duplicados)
    const telefonosEnviados = new Set<string>();
    for (const admin of admins) {
      if (!admin.phone) continue;
      const tel = admin.phone.replace(/\D/g, '');
      if (telefonosEnviados.has(tel)) continue;
      telefonosEnviados.add(tel);

      try {
        await enviarMensajeTeamMember(supabase, meta, admin, msg, {
          tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
        });
        console.log(`👔 Alerta inactividad enviada a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando alerta inactividad a ${admin.name}:`, e);
      }
    }

    console.log(`👔 ALERTA INACTIVIDAD: ${vendedoresInactivos.length} vendedores reportados`);
  } catch (e) {
    console.error('Error en alertaInactividadVendedor:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'alertaInactividadVendedor', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTA LEADS HOT SIN SEGUIMIENTO
// ═══════════════════════════════════════════════════════════════
export async function alertaLeadsHotSinSeguimiento(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener CEOs/Admins
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .in('role', ['admin', 'coordinador', 'ceo', 'director'])
      .eq('active', true);

    if (!admins || admins.length === 0) return;

    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

    // Leads HOT que no han sido actualizados hoy
    const { data: hotSinSeguimiento } = await supabase.client
      .from('leads')
      .select('*, team_members:assigned_to(name)')
      .in('status', ['negotiation', 'reserved'])
      .lt('updated_at', inicioHoy);

    if (!hotSinSeguimiento || hotSinSeguimiento.length === 0) {
      console.log('✅ Todos los leads HOT tienen seguimiento hoy');
      return;
    }

    // Construir mensaje con formato enriquecido
    let msg = `🔥 *LEADS HOT SIN SEGUIMIENTO HOY*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 Total: *${hotSinSeguimiento.length}* leads\n\n`;

    for (const lead of hotSinSeguimiento.slice(0, 8)) {
      const vendedor = lead.team_members?.name || 'Sin asignar';
      const diasSinUpdate = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      const statusEmoji = lead.status === 'reserved' ? '🏠' : '🤝';
      msg += `${statusEmoji} *${lead.name || 'Sin nombre'}*\n`;
      msg += `   👤 ${vendedor} • ⏰ ${diasSinUpdate}d sin actualizar\n`;
      msg += `   💡 _Escribir: bridge ${(lead.name || '').split(' ')[0]}_\n\n`;
    }

    if (hotSinSeguimiento.length > 8) {
      msg += `\n_...y ${hotSinSeguimiento.length - 8} leads más_\n`;
    }

    msg += `\n⚡ *Acción:* Escribir *bridge [nombre]* para contactar directo`;

    // Enviar a cada admin (evitar duplicados, respetando ventana 24h)
    const telefonosEnviados = new Set<string>();
    for (const admin of admins) {
      if (!admin.phone) continue;
      const tel = admin.phone.replace(/\D/g, '');
      if (telefonosEnviados.has(tel)) continue;
      telefonosEnviados.add(tel);

      try {
        await enviarMensajeTeamMember(supabase, meta, admin, msg, {
          tipoMensaje: 'alerta_lead',
          pendingKey: 'pending_alerta_lead'
        });
        console.log(`🔥 Alerta HOT enviada a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando alerta HOT a ${admin.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en alerta leads HOT:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'alertaLeadsHotSinSeguimiento', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTA 2PM - LEADS HOT URGENTES
// ═══════════════════════════════════════════════════════════════
export async function alertaLeadsHotUrgentes(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🔥 [2pm] Verificando leads HOT sin contactar hoy...');

    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('is_active', true);

    if (!vendedores || vendedores.length === 0) return;

    const mexicoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const hoyInicio = new Date(mexicoNow);
    hoyInicio.setHours(0, 0, 0, 0);

    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      const { data: leadsUrgentes } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, score, last_interaction')
        .eq('assigned_to', vendedor.id)
        .in('status', ['new', 'contacted', 'scheduled', 'negotiation'])
        .gte('score', 70)
        .or(`last_interaction.is.null,last_interaction.lt.${hoyInicio.toISOString()}`);

      const hace4Horas = new Date(mexicoNow.getTime() - 4 * 60 * 60 * 1000);
      const { data: leadsNuevosViejos } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, score')
        .eq('assigned_to', vendedor.id)
        .eq('status', 'new')
        .lt('created_at', hace4Horas.toISOString());

      const todosUrgentes = [
        ...(leadsUrgentes || []),
        ...(leadsNuevosViejos || []).filter(l => !leadsUrgentes?.find(u => u.id === l.id))
      ];

      if (todosUrgentes.length === 0) continue;

      const nombre = vendedor.name?.split(' ')[0] || 'Hola';
      let msg = `⚡ *${nombre}, ALERTA 2PM*\n\n`;
      msg += `Tienes *${todosUrgentes.length} leads* que necesitan atención URGENTE:\n\n`;

      for (const lead of todosUrgentes.slice(0, 5)) {
        const leadNombre = lead.name?.split(' ')[0] || 'Sin nombre';
        const esNuevo = lead.status === 'new';
        msg += `${esNuevo ? '🆕' : '🔥'} *${leadNombre}* - ${esNuevo ? 'Sin contactar' : lead.status}\n`;
      }

      if (todosUrgentes.length > 5) {
        msg += `\n...y ${todosUrgentes.length - 5} más\n`;
      }

      msg += '\n💡 _Los leads contactados rápido tienen 9x más probabilidad de cerrar_';

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
        });
        console.log(`⚡ Alerta 2pm enviada a ${vendedor.name} (${todosUrgentes.length} leads)`);
      } catch (e) {
        console.log(`Error enviando alerta 2pm a ${vendedor.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en alertaLeadsHotUrgentes:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'alertaLeadsHotUrgentes', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// RECORDATORIO 5PM - FIN DEL DÍA
// ═══════════════════════════════════════════════════════════════
export async function recordatorioFinalDia(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('⏰ [5pm] Enviando recordatorio final del día...');

    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('is_active', true);

    if (!vendedores || vendedores.length === 0) return;

    const mexicoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const hoyInicio = new Date(mexicoNow);
    hoyInicio.setHours(0, 0, 0, 0);

    let totalSinContactar = 0;
    const vendedoresSinContactar: string[] = [];

    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      const { data: leadsPendientes } = await supabase.client
        .from('leads')
        .select('id, name, status, score')
        .eq('assigned_to', vendedor.id)
        .in('status', ['new', 'contacted', 'scheduled', 'negotiation'])
        .or(`last_interaction.is.null,last_interaction.lt.${hoyInicio.toISOString()}`);

      const mañana = new Date(mexicoNow);
      mañana.setDate(mañana.getDate() + 1);
      mañana.setHours(0, 0, 0, 0);
      const mañanaFin = new Date(mañana);
      mañanaFin.setHours(23, 59, 59, 999);

      const { data: citasMañana } = await supabase.client
        .from('appointments')
        .select('id, lead_id')
        .eq('team_member_id', vendedor.id)
        .eq('status', 'scheduled')
        .gte('date', mañana.toISOString())
        .lt('date', mañanaFin.toISOString());

      const pendientes = leadsPendientes?.length || 0;
      const citas = citasMañana?.length || 0;

      if (pendientes === 0 && citas === 0) continue;

      totalSinContactar += pendientes;
      if (pendientes > 2) {
        vendedoresSinContactar.push(`${vendedor.name}: ${pendientes}`);
      }

      const nombre = vendedor.name?.split(' ')[0] || 'Hola';
      let msg = `🌅 *${nombre}, Resumen del día*\n\n`;

      if (pendientes > 0) {
        const leadsMasUrgentes = leadsPendientes?.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
        msg += `📋 *${pendientes} leads* pendientes de contactar:\n`;
        for (const lead of leadsMasUrgentes || []) {
          msg += `  • ${lead.name?.split(' ')[0] || 'Lead'} (${lead.status})\n`;
        }
        msg += '\n';
      }

      if (citas > 0) {
        msg += `📅 *${citas} citas* programadas para mañana\n\n`;
      }

      msg += pendientes > 3
        ? '⚠️ _Aún tienes tiempo de hacer llamadas antes de cerrar el día_'
        : '✨ _¡Buen trabajo hoy! Descansa bien_';

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
        });
        console.log(`🌅 Recordatorio 5pm enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando recordatorio 5pm a ${vendedor.name}:`, e);
      }
    }

    if (totalSinContactar > 5) {
      const { data: admins } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'admin')
        .eq('is_active', true);

      if (admins && admins.length > 0) {
        let adminMsg = `⚠️ *ALERTA ADMIN - Fin del día*\n\n`;
        adminMsg += `Hay *${totalSinContactar} leads* sin contactar hoy.\n\n`;
        if (vendedoresSinContactar.length > 0) {
          adminMsg += `Por vendedor:\n`;
          for (const v of vendedoresSinContactar) {
            adminMsg += `• ${v}\n`;
          }
        }
        adminMsg += '\n_Considera revisar carga de trabajo del equipo_';

        for (const admin of admins) {
          if (!admin.phone) continue;
          try {
            await enviarMensajeTeamMember(supabase, meta, admin, adminMsg, {
              tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
            });
            console.log(`⚠️ Alerta admin 5pm enviada a ${admin.name}`);
          } catch (e) {
            console.log(`Error enviando alerta admin 5pm:`, e);
          }
        }
      }
    }
  } catch (e) {
    console.log('Error en recordatorioFinalDia:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'recordatorioFinalDia', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// COACHING PROACTIVO - 11am L-V
// ═══════════════════════════════════════════════════════════════
export async function enviarCoachingProactivo(supabase: SupabaseService, meta: MetaWhatsAppService, vendedores: any[]): Promise<void> {
  try {
    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      // Buscar el mejor lead de este vendedor para dar coaching
      const { data: leads } = await supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['contacted', 'scheduled', 'visited', 'negotiation'])
        .order('score', { ascending: false })
        .limit(1);

      if (!leads || leads.length === 0) continue;

      const lead = leads[0];
      const nombre = vendedor.name?.split(' ')[0] || 'crack';
      const leadNombre = lead.name?.split(' ')[0] || 'tu lead';

      // Generar tip basado en la etapa
      let tip = '';
      let emoji = '💡';

      switch (lead.status) {
        case 'contacted':
          tip = `*${leadNombre}* lleva ${calcularDiasEnEtapa(lead)} días en contactado. ¡Agenda una cita hoy! Pregúntale qué horario le funciona mejor.`;
          emoji = '📞';
          break;
        case 'scheduled':
          tip = `Tienes cita con *${leadNombre}*. Prepárate: revisa qué busca, ten el brochure listo y piensa en 3 propiedades que le puedan gustar.`;
          emoji = '📅';
          break;
        case 'visited':
          tip = `*${leadNombre}* ya visitó. Es momento de cerrar: llámale para resolver dudas y pregunta "¿cuándo podemos apartar?"`;
          emoji = '🏠';
          break;
        case 'negotiation':
          tip = `*${leadNombre}* está en negociación. ¡No lo dejes enfriar! Llama HOY para cerrar. Pregunta: "¿Qué necesitas para tomar la decisión hoy?"`;
          emoji = '🔥';
          break;
      }

      if (!tip) continue;

      const msg = `${emoji} *TIP DEL DÍA*\n${nombre}\n\n${tip}\n\n_Escribe *coach ${leadNombre}* para más estrategias_`;

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
        });
        console.log(`🎯 Coaching enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando coaching a ${vendedor.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en coaching proactivo:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'enviarCoachingProactivo', stack: (e as Error).stack });
  }
}

export function calcularDiasEnEtapa(lead: any): number {
  const statusChangedAt = lead.status_changed_at ? new Date(lead.status_changed_at) : new Date(lead.created_at);
  return Math.floor((Date.now() - statusChangedAt.getTime()) / (1000 * 60 * 60 * 24));
}

// ═══════════════════════════════════════════════════════════════
// A/B TESTING
// ═══════════════════════════════════════════════════════════════
export async function getABVariant(supabase: SupabaseService, testName: string, leadId: string): Promise<'A' | 'B'> {
  try {
    // Verificar si el lead ya tiene variante asignada
    const { data: existing } = await supabase.client
      .from('ab_test_assignments')
      .select('variant')
      .eq('test_name', testName)
      .eq('lead_id', leadId)
      .single();

    if (existing) return existing.variant;

    // Asignar variante aleatoria (50/50)
    const variant = Math.random() < 0.5 ? 'A' : 'B';

    // Guardar asignación
    await supabase.client.from('ab_test_assignments').insert({
      test_name: testName,
      lead_id: leadId,
      variant,
      created_at: new Date().toISOString()
    });

    return variant;
  } catch (e) {
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'getABVariant', stack: (e as Error).stack });
    return 'A'; // Default a variante A si hay error
  }
}

export async function trackABConversion(supabase: SupabaseService, testName: string, leadId: string): Promise<void> {
  try {
    await supabase.client
      .from('ab_test_assignments')
      .update({ converted: true, converted_at: new Date().toISOString() })
      .eq('test_name', testName)
      .eq('lead_id', leadId);
  } catch (e) {
    console.log('Error tracking AB conversion:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'trackABConversion', stack: (e as Error).stack });
  }
}

export async function getABTestResults(supabase: SupabaseService, testName: string): Promise<any> {
  try {
    const { data: assignments } = await supabase.client
      .from('ab_test_assignments')
      .select('*')
      .eq('test_name', testName);

    if (!assignments) return null;

    const variantA = assignments.filter(a => a.variant === 'A');
    const variantB = assignments.filter(a => a.variant === 'B');

    const conversionsA = variantA.filter(a => a.converted).length;
    const conversionsB = variantB.filter(a => a.converted).length;

    return {
      test_name: testName,
      variant_a: {
        total: variantA.length,
        conversions: conversionsA,
        rate: variantA.length > 0 ? Math.round((conversionsA / variantA.length) * 100) : 0
      },
      variant_b: {
        total: variantB.length,
        conversions: conversionsB,
        rate: variantB.length > 0 ? Math.round((conversionsB / variantB.length) * 100) : 0
      },
      winner: conversionsA / (variantA.length || 1) > conversionsB / (variantB.length || 1) ? 'A' : 'B'
    };
  } catch (e) {
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'getABTestResults', stack: (e as Error).stack });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// REMARKETING LEADS FRÍOS
// ═══════════════════════════════════════════════════════════════
export async function remarketingLeadsFrios(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const hace30dias = new Date();
    hace30dias.setDate(hace30dias.getDate() - 30);

    const hace90dias = new Date();
    hace90dias.setDate(hace90dias.getDate() - 90);

    // Leads fríos: sin actividad 30-90 días, no cerrados/perdidos
    const { data: leadsFrios } = await supabase.client
      .from('leads')
      .select('*')
      .lt('updated_at', hace30dias.toISOString())
      .gt('updated_at', hace90dias.toISOString())
      .not('status', 'in', '("closed","lost","delivered","paused","fallen")')
      .is('remarketing_sent', null)
      .limit(10);

    if (!leadsFrios || leadsFrios.length === 0) {
      console.log('📭 No hay leads para remarketing');
      return;
    }

    const mensajes = [
      '¡Hola {nombre}! 👋 Hace tiempo platicamos sobre tu interés en una casa. ¿Sigues buscando? Tenemos nuevas opciones que podrían interesarte. 🏠',
      '¡Hola {nombre}! 🏡 ¿Aún estás considerando comprar casa? Tenemos promociones especiales este mes. ¿Te gustaría conocerlas?',
      '¡Hola {nombre}! ✨ Nos acordamos de ti. Si sigues buscando tu hogar ideal, tenemos desarrollos con excelentes precios. ¿Platicamos?'
    ];

    for (const lead of leadsFrios) {
      if (!lead.phone) continue;

      // Seleccionar mensaje aleatorio
      const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)]
        .replace('{nombre}', lead.name?.split(' ')[0] || '');

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);

        // Marcar como enviado + pending_auto_response
        const notesActuales = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
        await supabase.client
          .from('leads')
          .update({
            remarketing_sent: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            notes: {
              ...notesActuales,
              pending_auto_response: {
                type: 'remarketing',
                sent_at: new Date().toISOString(),
                vendedor_id: lead.assigned_to
              }
            }
          })
          .eq('id', lead.id);

        console.log(`📣 Remarketing enviado a ${lead.name}`);
      } catch (e) {
        console.log(`Error remarketing ${lead.name}:`, e);
      }

      // Esperar entre mensajes
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.log('Error en remarketing:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'remarketingLeadsFrios', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// FOLLOW-UP LEADS INACTIVOS (3+ días)
// ═══════════════════════════════════════════════════════════════
export async function followUpLeadsInactivos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('📬 Iniciando follow-up de leads inactivos...');

    const ahora = new Date();
    const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Usar timezone de México
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const hoy = mexicoFormatter.format(ahora);

    // Buscar leads contactados pero sin respuesta en 3-30 días
    const { data: leadsInactivos, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, assigned_to, updated_at')
      .in('status', ['new', 'contacted', 'appointment_scheduled'])
      .lt('updated_at', hace3dias.toISOString())
      .gt('updated_at', hace30dias.toISOString())
      .not('phone', 'is', null)
      .or('archived.is.null,archived.eq.false')
      .limit(50);

    if (error) {
      console.error('❌ Error buscando leads inactivos:', error);
      return;
    }

    if (!leadsInactivos || leadsInactivos.length === 0) {
      console.log('📭 No hay leads inactivos para follow-up');
      return;
    }

    // Filtrar leads que ya recibieron follow-up recientemente
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const leadsParaFollowup = leadsInactivos.filter(lead => {
      const notes = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
      if (notes.last_auto_followup) {
        const ultimoFollowup = new Date(notes.last_auto_followup);
        if (ultimoFollowup > hace7dias) {
          return false;
        }
      }
      return true;
    }).slice(0, 10);

    if (leadsParaFollowup.length === 0) {
      console.log('📭 Todos los leads inactivos ya tienen follow-up reciente');
      return;
    }

    console.log(`📋 Enviando follow-up a ${leadsParaFollowup.length} leads inactivos`);

    const mensajesFollowup = [
      `¡Hola {nombre}! 👋\n\n¿Todo bien? Te escribo de *Santa Rita Residencial* para saber si aún te interesa conocer nuestras casas.\n\nSi tienes alguna duda o quieres agendar una visita, con gusto te ayudo. 🏠`,
      `¡Hola {nombre}! 🏡\n\n¿Sigues buscando casa? Quedamos pendientes de platicar y me encantaría ayudarte.\n\n¿Tienes 5 minutos para que te cuente las opciones que tenemos? 😊`,
      `¡Hola {nombre}! ✨\n\nSoy de Santa Rita. Vi que quedamos pendientes y no quería dejarte sin seguimiento.\n\n¿Hay algo en lo que pueda ayudarte? ¿Quizá agendar una visita? 🏠`
    ];

    let enviados = 0;
    const notificacionesVendedor = new Map<string, string[]>();

    for (const lead of leadsParaFollowup) {
      if (!lead.phone) continue;

      const nombre = lead.name?.split(' ')[0] || '';
      const mensaje = mensajesFollowup[Math.floor(Math.random() * mensajesFollowup.length)]
        .replace('{nombre}', nombre);

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);

        // Marcar en notes
        const notesActuales = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
        await supabase.client
          .from('leads')
          .update({
            notes: {
              ...notesActuales,
              last_auto_followup: ahora.toISOString(),
              pending_auto_response: {
                type: 'followup_inactivo',
                sent_at: ahora.toISOString(),
                vendedor_id: lead.assigned_to
              }
            },
            last_interaction: ahora.toISOString()
          })
          .eq('id', lead.id);

        console.log(`✅ Follow-up enviado a ${lead.name} (${lead.phone})`);
        enviados++;

        // Agrupar para notificar al vendedor
        if (lead.assigned_to) {
          const vendedorId = lead.assigned_to;
          if (!notificacionesVendedor.has(vendedorId)) {
            notificacionesVendedor.set(vendedorId, []);
          }
          notificacionesVendedor.get(vendedorId)?.push(lead.name || 'Sin nombre');
        }

      } catch (e) {
        console.error(`❌ Error enviando follow-up a ${lead.name}:`, e);
      }
    }

    // Notificar a vendedores
    if (notificacionesVendedor.size > 0) {
      const vendedorIds = Array.from(notificacionesVendedor.keys());
      const { data: vendedores } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .in('id', vendedorIds);

      for (const [vendedorId, leadNames] of notificacionesVendedor) {
        const vendedor = vendedores?.find(v => v.id === vendedorId);
        if (vendedor?.phone) {
          const msg = `📬 *Follow-up automático enviado*\n\nSARA contactó a ${leadNames.length} lead(s) inactivos que tienes asignados:\n\n${leadNames.map(n => `• ${n}`).join('\n')}\n\n💡 Si responden, te avisaré para que les des seguimiento.`;
          await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
            tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
          });
        }
      }
    }

    console.log(`✅ Follow-up completado: ${enviados} mensajes enviados`);

  } catch (error) {
    console.error('❌ Error en followUpLeadsInactivos:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'followUpLeadsInactivos', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// RECORDATORIOS DE PAGO DE APARTADOS
// ═══════════════════════════════════════════════════════════════
export async function recordatoriosPagoApartado(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('💰 Verificando recordatorios de pago de apartados...');

    // Usar timezone de México
    const ahora = new Date();
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const hoyStr = mexicoFormatter.format(ahora);

    // Calcular fechas para recordatorios
    const en5dias = mexicoFormatter.format(new Date(ahora.getTime() + 5 * 24 * 60 * 60 * 1000));
    const en1dia = mexicoFormatter.format(new Date(ahora.getTime() + 1 * 24 * 60 * 60 * 1000));

    console.log(`📅 Fechas México: hoy=${hoyStr}, en1dia=${en1dia}, en5dias=${en5dias}`);

    // Buscar leads en status "reserved" con datos de apartado
    const { data: leadsReservados, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, assigned_to')
      .eq('status', 'reserved')
      .not('notes', 'is', null);

    if (error) {
      console.error('❌ Error buscando leads reservados:', error);
      return;
    }

    if (!leadsReservados || leadsReservados.length === 0) {
      console.log('📭 No hay leads con apartado pendiente');
      return;
    }

    // Obtener vendedores asignados
    const vendedorIds = [...new Set(leadsReservados.filter(l => l.assigned_to).map(l => l.assigned_to))];
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .in('id', vendedorIds);
    const vendedorMap = new Map<string, any>(vendedores?.map(v => [v.id as string, v]) || []);

    console.log(`📋 Verificando ${leadsReservados.length} leads reservados...`);

    let recordatoriosEnviados = 0;

    for (const lead of leadsReservados) {
      const notes = lead.notes || {};
      const apartado = notes.apartado;

      if (!apartado || !apartado.fecha_pago) {
        continue;
      }

      const fechaPago = apartado.fecha_pago;
      const recordatoriosYaEnviados = apartado.recordatorios_enviados || 0;
      console.log(`🔍 Lead ${lead.name}: fechaPago=${fechaPago}, en5dias=${en5dias}, en1dia=${en1dia}, hoy=${hoyStr}, recordatorios=${recordatoriosYaEnviados}`);
      const vendedor = lead.assigned_to ? vendedorMap.get(lead.assigned_to) : null;

      let tipoRecordatorio: '5dias' | '1dia' | 'hoy' | 'vencido' | null = null;
      let mensajeCliente = '';
      let mensajeVendedor = '';

      // Calcular días para pago
      const fechaPagoDate = new Date(fechaPago + 'T12:00:00');
      const hoyDate = new Date(hoyStr + 'T12:00:00');
      const diasParaPago = Math.round((fechaPagoDate.getTime() - hoyDate.getTime()) / (24 * 60 * 60 * 1000));
      const engancheFormato = apartado.enganche?.toLocaleString('es-MX') || '0';
      const primerNombre = lead.name?.split(' ')[0] || 'Cliente';
      const fechaFormateada = fechaPagoDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });

      // Determinar tipo de recordatorio
      if (fechaPago === en5dias && recordatoriosYaEnviados < 1) {
        tipoRecordatorio = '5dias';
        mensajeCliente = `👋 Hola ${primerNombre}!\n\n` +
          `Te recordamos que tu *pago de enganche* está programado para el *${fechaFormateada}*.\n\n` +
          `💰 *Monto:* $${engancheFormato}\n` +
          `🏠 *Propiedad:* ${apartado.propiedad || 'Tu nueva casa'}\n\n` +
          `Si tienes alguna duda sobre la forma de pago, tu asesor ${vendedor?.name?.split(' ')[0] || ''} puede ayudarte.\n\n` +
          `¡Gracias por confiar en nosotros! 🏡`;
        mensajeVendedor = `⏰ *RECORDATORIO 5 DÍAS*\n\n` +
          `El pago de *${lead.name}* está programado para el ${fechaFormateada}.\n\n` +
          `💰 Enganche: $${engancheFormato}\n` +
          `🏠 Propiedad: ${apartado.propiedad || 'Por definir'}\n\n` +
          `📤 Ya le envié recordatorio al cliente.`;
      } else if (fechaPago === en1dia && recordatoriosYaEnviados < 2) {
        tipoRecordatorio = '1dia';
        mensajeCliente = `👋 Hola ${primerNombre}!\n\n` +
          `¡Tu pago de enganche es *mañana*! 📅\n\n` +
          `💰 *Monto:* $${engancheFormato}\n` +
          `🏠 *Propiedad:* ${apartado.propiedad || 'Tu nueva casa'}\n\n` +
          `Si necesitas hacer el pago hoy o tienes dudas, contáctanos.\n\n` +
          `¡Ya casi es tuya! 🎉`;
        mensajeVendedor = `⚠️ *PAGO MAÑANA*\n\n` +
          `*${lead.name}* debe pagar mañana.\n\n` +
          `💰 Enganche: $${engancheFormato}\n` +
          `🏠 Propiedad: ${apartado.propiedad || 'Por definir'}\n\n` +
          `📤 Ya le envié recordatorio.`;
      } else if (fechaPago === hoyStr && recordatoriosYaEnviados < 3) {
        tipoRecordatorio = 'hoy';
        mensajeCliente = `🔔 ¡Hola ${primerNombre}!\n\n` +
          `*¡Hoy es el día de tu pago de enganche!*\n\n` +
          `💰 *Monto:* $${engancheFormato}\n` +
          `🏠 *Propiedad:* ${apartado.propiedad || 'Tu nueva casa'}\n\n` +
          `Una vez realizado el pago, envíanos tu comprobante para confirmarlo.\n\n` +
          `¿Tienes dudas? Estamos para ayudarte 😊`;
        mensajeVendedor = `🔴 *PAGO HOY*\n\n` +
          `*${lead.name}* debe pagar HOY.\n\n` +
          `💰 Enganche: $${engancheFormato}\n` +
          `🏠 Propiedad: ${apartado.propiedad || 'Por definir'}\n\n` +
          `📤 Recordatorio enviado. Confirma cuando recibas el pago.`;
      } else if (diasParaPago < 0 && diasParaPago >= -3 && recordatoriosYaEnviados < 4) {
        tipoRecordatorio = 'vencido';
        const diasVencido = Math.abs(diasParaPago);
        mensajeCliente = `👋 Hola ${primerNombre}\n\n` +
          `Notamos que tu pago de enganche estaba programado hace ${diasVencido} día(s).\n\n` +
          `💰 *Monto pendiente:* $${engancheFormato}\n\n` +
          `Si ya realizaste el pago, por favor envíanos el comprobante.\n` +
          `Si necesitas más tiempo o tienes algún inconveniente, platícanos para buscar opciones.\n\n` +
          `Estamos para ayudarte 🤝`;
        mensajeVendedor = `⚠️ *PAGO VENCIDO (${diasVencido} días)*\n\n` +
          `*${lead.name}* no ha completado su pago.\n\n` +
          `💰 Enganche: $${engancheFormato}\n` +
          `📅 Fecha límite: ${fechaFormateada}\n\n` +
          `Contacta al cliente para dar seguimiento.`;
      }

      if (tipoRecordatorio) {
        try {
          // Enviar al cliente
          if (lead.phone && mensajeCliente) {
            await meta.sendWhatsAppMessage(lead.phone, mensajeCliente);
            console.log(`📤 Recordatorio ${tipoRecordatorio} enviado a ${lead.name}`);
          }

          // Enviar al vendedor
          if (vendedor?.phone && mensajeVendedor) {
            await enviarMensajeTeamMember(supabase, meta, vendedor, mensajeVendedor, {
              tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead'
            });
          }

          // Actualizar contador de recordatorios
          const nuevoContador = tipoRecordatorio === '5dias' ? 1 :
                               tipoRecordatorio === '1dia' ? 2 :
                               tipoRecordatorio === 'hoy' ? 3 : 4;

          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notes,
                apartado: {
                  ...apartado,
                  recordatorios_enviados: nuevoContador,
                  ultimo_recordatorio: hoyStr
                },
                pending_auto_response: {
                  type: 'recordatorio_pago',
                  sent_at: ahora.toISOString(),
                  vendedor_id: lead.assigned_to,
                  tipo_recordatorio: tipoRecordatorio
                }
              }
            })
            .eq('id', lead.id);

          recordatoriosEnviados++;
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`❌ Error enviando recordatorio a ${lead.name}:`, e);
        }
      }
    }

    console.log(`✅ Recordatorios de pago: ${recordatoriosEnviados} enviados`);

  } catch (error) {
    console.error('❌ Error en recordatoriosPagoApartado:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'recordatoriosPagoApartado', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// REACTIVACIÓN DE LEADS PERDIDOS (30+ días)
// ═══════════════════════════════════════════════════════════════
export async function reactivarLeadsPerdidos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🔄 Iniciando reactivación de leads perdidos...');

    const ahora = new Date();
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hace180dias = new Date(ahora.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Buscar leads perdidos hace 30-180 días
    const { data: leadsPerdidos, error } = await supabase.client
      .from('leads')
      .select('*')
      .in('status', ['lost', 'fallen'])
      .lt('status_changed_at', hace30dias.toISOString())
      .gt('status_changed_at', hace180dias.toISOString())
      .not('phone', 'is', null)
      .limit(50);

    if (error) {
      console.error('❌ Error buscando leads perdidos:', error);
      return;
    }

    if (!leadsPerdidos || leadsPerdidos.length === 0) {
      console.log('📭 No hay leads perdidos para reactivar');
      return;
    }

    // Filtrar leads que ya recibieron reactivación
    const leadsParaReactivar = leadsPerdidos.filter(lead => {
      const notes = lead.notes || '';
      return !notes.includes('Reactivación automática enviada');
    }).slice(0, 15);

    if (leadsParaReactivar.length === 0) {
      console.log('📭 Todos los leads perdidos ya fueron reactivados anteriormente');
      return;
    }

    console.log(`📋 Encontrados ${leadsParaReactivar.length} leads para reactivar (de ${leadsPerdidos.length} perdidos)`);

    // Cargar vendedores
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('active', true);

    const mensajesReactivacion = [
      `¡Hola {nombre}! 👋\n\nSoy de Santa Rita Residencial. Hace tiempo platicamos sobre tu búsqueda de casa.\n\nEntendemos que en ese momento no era el tiempo adecuado, pero quería contarte que *tenemos nuevas opciones y promociones* que podrían interesarte.\n\n¿Te gustaría que te platique las novedades? 🏠`,
      `¡Hola {nombre}! 🏡\n\nTe escribo de Santa Rita. Sé que hace un tiempo las cosas no se dieron, pero las circunstancias cambian.\n\n*Tenemos casas con facilidades de pago* y me encantaría ayudarte si sigues buscando.\n\n¿Platicamos? Sin compromiso 😊`,
      `¡Hola {nombre}! ✨\n\n¿Sigues pensando en comprar casa? Te escribo porque tenemos *promociones especiales este mes* que no queríamos que te perdieras.\n\nSi tu situación ha cambiado y te interesa retomar la búsqueda, aquí estamos para ayudarte.\n\n¿Qué dices? 🏠`
    ];

    let reactivados = 0;
    const leadsPorVendedor = new Map<string, any[]>();

    for (const lead of leadsParaReactivar) {
      if (!lead.phone) continue;

      const mensajeBase = mensajesReactivacion[Math.floor(Math.random() * mensajesReactivacion.length)];
      const nombre = lead.name?.split(' ')[0] || '';
      const mensaje = mensajeBase.replace('{nombre}', nombre);

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);

        const notasObj = safeJsonParse(lead.notes);
        notasObj.ultima_reactivacion = ahora.toISOString().split('T')[0];
        notasObj.reactivaciones_count = (notasObj.reactivaciones_count || 0) + 1;

        await supabase.client
          .from('leads')
          .update({
            status: 'contacted',
            updated_at: ahora.toISOString(),
            notes: notasObj
          })
          .eq('id', lead.id);

        console.log(`📤 Reactivación enviada a ${lead.name} (${lead.phone})`);
        reactivados++;

        // Buscar vendedor asignado
        const vendedor = teamMembers?.find(tm => tm.id === lead.assigned_to);
        if (vendedor?.id) {
          if (!leadsPorVendedor.has(vendedor.id)) {
            leadsPorVendedor.set(vendedor.id, []);
          }
          leadsPorVendedor.get(vendedor.id)!.push({ lead, vendedor });
        }
      } catch (e) {
        console.error(`❌ Error reactivando ${lead.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    // Notificar a vendedores
    for (const [vendedorId, leads] of leadsPorVendedor) {
      try {
        const vendedor = leads[0].vendedor;
        if (!vendedor?.phone) continue;

        let msg = `🔄 *LEADS REACTIVADOS*\n\nSe enviaron mensajes a ${leads.length} lead(s) que habías dado por perdidos:\n\n`;
        for (const { lead } of leads.slice(0, 5)) {
          msg += `• *${lead.name}* - ${formatPhoneForDisplay(lead.phone)}\n`;
          if (lead.lost_reason) msg += `  _Razón: ${lead.lost_reason}_\n`;
        }
        if (leads.length > 5) msg += `\n_...y ${leads.length - 5} más_\n`;
        msg += `\n💡 *Si responden, ya están en tu pipeline como "contactados".*`;

        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
        });
      } catch (error) {
        console.error(`❌ Error notificando reactivación a vendedor ${vendedorId}:`, error);
        continue;
      }
    }

    console.log(`✅ Reactivación completada: ${reactivados} leads contactados`);
  } catch (error) {
    console.error('❌ Error en reactivación:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'reactivarLeadsPerdidos', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE CUMPLEAÑOS A LEADS
// ═══════════════════════════════════════════════════════════════
export async function felicitarCumpleañosLeads(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🎂 Verificando cumpleaños de leads...');

    // Usar timezone de México
    const ahora = new Date();
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const fechaMexico = mexicoFormatter.format(ahora);
    const [añoActual, mes, dia] = fechaMexico.split('-');
    const fechaHoy = `${mes}-${dia}`;
    console.log(`🎂 Buscando cumpleaños para fecha: ${fechaHoy} (México)`);

    // Buscar leads con birthday
    const { data: leadsConBirthday, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, birthday, status, assigned_to, birthday_message_sent_year')
      .not('birthday', 'is', null)
      .not('phone', 'is', null)
      .not('status', 'in', '("lost","fallen")');

    if (error) {
      console.error('🎂 Error en query:', error);
      return;
    }

    // Filtrar leads cuyo cumpleaños sea hoy
    const leadsCumple = leadsConBirthday?.filter(l => {
      if (!l.birthday) return false;
      const bday = l.birthday.toString();
      return bday.endsWith(`-${fechaHoy}`);
    });

    console.log(`🎂 Leads con birthday: ${leadsConBirthday?.length || 0}, cumpliendo hoy: ${leadsCumple?.length || 0}`);

    if (!leadsCumple || leadsCumple.length === 0) {
      console.log('🎂 No hay leads cumpliendo años hoy');
      return;
    }

    // Cargar vendedores
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('active', true);

    await procesarCumpleañosLeads(supabase, meta, leadsCumple, teamMembers, fechaHoy);

  } catch (error) {
    console.error('❌ Error en felicitaciones de cumpleaños:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'felicitarCumpleañosLeads', stack: (error as Error).stack });
  }
}

export async function procesarCumpleañosLeads(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  leads: any[],
  teamMembers: any[] | null,
  fechaHoy: string
): Promise<void> {
  console.log(`🎂 Encontrados ${leads.length} leads cumpliendo años hoy`);

  const mensajesCumple = [
    `🎂 *¡Feliz Cumpleaños {nombre}!* 🎉\n\nDesde Santa Rita Residencial te deseamos un día lleno de alegría y que todos tus sueños se hagan realidad.\n\n¡Que este nuevo año de vida te traiga muchas bendiciones! 🌟`,
    `🎊 *¡Muchísimas felicidades {nombre}!* 🎂\n\nHoy es tu día especial y queremos desearte lo mejor.\n\nQue este año venga cargado de éxitos, salud y mucha felicidad. ¡Disfruta tu día! 🥳`,
    `✨ *¡Feliz Cumpleaños {nombre}!* 🎁\n\nEn Santa Rita te enviamos un cálido abrazo en tu día.\n\nQue la vida te siga llenando de momentos increíbles. ¡Pásala increíble! 🎈`
  ];

  let felicitados = 0;
  const cumplesPorVendedor = new Map<string, any[]>();

  for (const lead of leads) {
    if (!lead.phone) continue;

    // Verificar si ya lo felicitamos este año
    const notes = lead.notes || '';
    if (notes.includes(`Cumpleaños ${fechaHoy}`)) {
      console.log(`⏭️ Ya felicitamos a ${lead.name} este año`);
      continue;
    }

    const nombre = lead.name?.split(' ')[0] || '';
    const mensaje = mensajesCumple[Math.floor(Math.random() * mensajesCumple.length)]
      .replace('{nombre}', nombre);

    try {
      await meta.sendWhatsAppMessage(lead.phone, mensaje);

      // Marcar en notes
      const notesObj = typeof notes === 'object' ? notes : {};
      const pendingAutoResponse = {
        type: 'cumpleanos',
        sent_at: new Date().toISOString(),
        vendedor_id: lead.assigned_to
      };
      await supabase.client
        .from('leads')
        .update({
          notes: typeof notes === 'object'
            ? { ...notesObj, [`cumpleanos_${fechaHoy}`]: true, pending_auto_response: pendingAutoResponse }
            : notes + `\n[Cumpleaños ${fechaHoy}] Felicitación enviada`
        })
        .eq('id', lead.id);

      console.log(`🎂 Felicitación enviada a ${lead.name} (${lead.phone})`);
      felicitados++;

      // Agrupar por vendedor
      const vendedorId = lead.assigned_to;
      const vendedor = lead.team_members || teamMembers?.find(tm => tm.id === vendedorId);
      if (vendedor?.id) {
        if (!cumplesPorVendedor.has(vendedor.id)) {
          cumplesPorVendedor.set(vendedor.id, []);
        }
        cumplesPorVendedor.get(vendedor.id)!.push({ lead, vendedor });
      }

    } catch (e) {
      console.error(`❌ Error felicitando a ${lead.name}:`, e);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  // Notificar a vendedores
  for (const [vendedorId, cumples] of cumplesPorVendedor) {
    const vendedor = cumples[0].vendedor;
    if (!vendedor?.phone) continue;

    let msg = `🎂 *CUMPLEAÑOS DE TUS CLIENTES*\n\n`;
    msg += `Hoy cumplen años ${cumples.length} de tus leads:\n\n`;

    for (const { lead } of cumples) {
      msg += `• *${lead.name}*\n`;
      msg += `  📱 ${formatPhoneForDisplay(lead.phone)}\n`;
      if (lead.property_interest) msg += `  🏠 Interés: ${lead.property_interest}\n`;
      msg += `\n`;
    }

    msg += `💡 *Ya les enviamos felicitación automática.*\n`;
    msg += `_Es buen momento para dar seguimiento personalizado._`;

    try {
      await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
        tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
      });
      console.log(`📤 Notificación de cumpleaños enviada a vendedor ${vendedor.name}`);
    } catch (e) {
      console.log(`Error notificando a vendedor:`, e);
    }
  }

  console.log(`✅ Felicitaciones de cumpleaños completadas: ${felicitados} leads`);
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE CUMPLEAÑOS AL EQUIPO
// ═══════════════════════════════════════════════════════════════
export async function felicitarCumpleañosEquipo(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🎂 Verificando cumpleaños del equipo...');

    // Usar timezone de México
    const ahora = new Date();
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const fechaMexico = mexicoFormatter.format(ahora);
    const [añoActual, mes, dia] = fechaMexico.split('-');
    const fechaHoy = `${mes}-${dia}`;

    // Buscar team members con cumpleaños hoy
    const { data: cumpleaneros } = await supabase.client
      .from('team_members')
      .select('*')
      .like('birthday', `%-${fechaHoy}`)
      .eq('active', true);

    if (!cumpleaneros || cumpleaneros.length === 0) {
      console.log('🎂 No hay miembros del equipo cumpliendo años hoy');
      return;
    }

    console.log(`🎂 Encontrados ${cumpleaneros.length} miembros cumpliendo años`);

    // Obtener todos los demás miembros para notificar
    const { data: todosLosMembers } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('active', true);

    for (const persona of cumpleaneros) {
      try {
        if (!persona.phone) continue;

        // Mensaje al cumpleañero
        const mensajeCumpleanero = `🎂 *¡Feliz Cumpleaños ${persona.name}!* 🎉\n\n` +
          `Todo el equipo de Santa Rita te desea un día increíble lleno de alegría.\n\n` +
          `¡Que se cumplan todos tus sueños este nuevo año de vida! 🌟\n\n` +
          `_Con cariño, tu equipo SARA_ 💝`;

        await enviarMensajeTeamMember(supabase, meta, persona, mensajeCumpleanero, {
          tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
        });
        console.log(`🎂 Felicitación enviada a ${persona.name}`);

        // Notificar al resto del equipo
        for (const member of todosLosMembers || []) {
          if (member.id === persona.id || !member.phone) continue;

          const notificacion = `🎂 ¡Hoy es cumpleaños de *${persona.name}*!\n\n` +
            `No olvides felicitarlo(a) 🎉`;

          try {
            await enviarMensajeTeamMember(supabase, meta, member, notificacion, {
              tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
            });
          } catch (e) {
            // Silent fail para notificaciones secundarias
          }
        }
      } catch (error) {
        console.error(`❌ Error enviando felicitación cumpleaños equipo a ${persona.name || persona.id}:`, error);
        continue;
      }
    }

  } catch (error) {
    console.error('❌ Error en felicitaciones de cumpleaños equipo:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'felicitarCumpleañosEquipo', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTA DE CALIDAD DE RESPUESTAS - Diario 9am
// ═══════════════════════════════════════════════════════════════
export async function alertaCalidadRespuestas(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  ceoPhone: string
): Promise<void> {
  try {
    console.log('📊 Verificando calidad de respuestas SARA...');

    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);

    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, conversation_history, updated_at')
      .gte('updated_at', ayer.toISOString());

    // Analizar calidad
    const nombresHallucinated = ['Salma', 'María', 'Maria', 'Juan', 'Pedro', 'Ana', 'Luis', 'Carlos', 'Carmen'];
    const frasesProhibidas = [
      'Le aviso a',
      'Sin problema',
      'no lo tenemos disponible',
      'Citadella del Nogal no',
      'El Nogal no es',
      'sí tenemos rentas'
    ];

    let totalRespuestas = 0;
    let problemas: any[] = [];

    (leads || []).forEach((lead: any) => {
      const history = lead.conversation_history || [];
      history.forEach((msg: any, idx: number) => {
        if (msg.role !== 'assistant') return;

        // Solo mensajes de ayer
        const msgDate = new Date(msg.timestamp || '');
        if (msgDate < ayer) return;

        totalRespuestas++;
        const content = (msg.content || '').trim();
        const problemasMsg: string[] = [];

        // Truncada
        if (content.endsWith(',') || (content.length > 0 && content.length < 20)) {
          problemasMsg.push('truncada');
        }

        // Nombre alucinado
        if (!lead.name) {
          for (const nombre of nombresHallucinated) {
            if (content.includes(nombre)) {
              problemasMsg.push(`nombre:${nombre}`);
              break;
            }
          }
        }

        // Frases prohibidas
        for (const frase of frasesProhibidas) {
          if (content.toLowerCase().includes(frase.toLowerCase())) {
            problemasMsg.push('frase_prohibida');
            break;
          }
        }

        if (problemasMsg.length > 0) {
          problemas.push({
            lead: lead.name || lead.phone?.slice(-4),
            problemas: problemasMsg
          });
        }
      });
    });

    // Solo alertar si hay problemas significativos (>5% o >3 absolutos)
    const tasaProblemas = totalRespuestas > 0 ? (problemas.length / totalRespuestas) * 100 : 0;

    if (problemas.length >= 3 || tasaProblemas > 5) {
      const mensaje = `⚠️ *ALERTA CALIDAD SARA*\n\n` +
        `📊 Últimas 24h:\n` +
        `• Respuestas: ${totalRespuestas}\n` +
        `• Con problemas: ${problemas.length}\n` +
        `• Tasa calidad: ${(100 - tasaProblemas).toFixed(1)}%\n\n` +
        `🔍 Problemas detectados:\n` +
        problemas.slice(0, 5).map(p => `• ${p.lead}: ${p.problemas.join(', ')}`).join('\n') +
        (problemas.length > 5 ? `\n...y ${problemas.length - 5} más` : '') +
        `\n\n💡 Revisar: /api/metrics/quality`;

      // Buscar team member por teléfono para enviar 24h-safe
      const cleanCeoPhone = ceoPhone.replace(/\D/g, '');
      const { data: ceoMember } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .or(`phone.eq.${cleanCeoPhone},phone.like.%${cleanCeoPhone.slice(-10)}`)
        .maybeSingle();

      if (ceoMember) {
        await enviarMensajeTeamMember(supabase, meta, ceoMember, mensaje, {
          tipoMensaje: 'notificacion', pendingKey: 'pending_mensaje'
        });
      } else {
        await meta.sendWhatsAppMessage(ceoPhone, mensaje);
      }
      console.log(`⚠️ Alerta de calidad enviada: ${problemas.length} problemas`);
    } else {
      console.log(`✅ Calidad OK: ${totalRespuestas} respuestas, ${problemas.length} problemas (${tasaProblemas.toFixed(1)}%)`);
    }

  } catch (error) {
    console.error('❌ Error en alerta de calidad:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'alertaCalidadRespuestas', stack: (error as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════
// ALERTA: LEAD NO CONFIRMA CITA DESPUÉS DE RECORDATORIO
// ═══════════════════════════════════════════════════════════

export async function alertaCitaNoConfirmada(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const mañanaStr = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar citas de mañana que YA tienen recordatorio 24h enviado
    const { data: citas } = await supabase.client
      .from('appointments')
      .select('id, lead_id, lead_name, lead_phone, scheduled_date, scheduled_time, property_name, vendedor_id, reminder_24h_sent')
      .in('scheduled_date', [hoyStr, mañanaStr])
      .eq('status', 'scheduled')
      .eq('reminder_24h_sent', true);

    if (!citas || citas.length === 0) return;

    // Buscar leads de estas citas para ver last_message_at
    const leadIds = [...new Set(citas.map(c => c.lead_id).filter(Boolean))];
    if (leadIds.length === 0) return;

    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, last_message_at, notes')
      .in('id', leadIds);

    if (!leads) return;

    const leadsMap = new Map<string, any>(leads.map(l => [l.id as string, l]));

    // Buscar vendedores
    const vendedorIds = [...new Set(citas.map(c => c.vendedor_id).filter(Boolean))];
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, phone, name')
      .in('id', vendedorIds);

    const vendedoresMap = new Map<string, any>((vendedores || []).map(v => [v.id as string, v]));

    let alertas = 0;

    for (const cita of citas) {
      const lead = leadsMap.get(cita.lead_id);
      if (!lead) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      // Ya se envió esta alerta?
      if ((notas as any)?.no_confirm_alert_sent) continue;

      // Verificar si el lead NO ha respondido después del recordatorio (8+ horas)
      const lastMsg = lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0;
      const hace8h = ahora.getTime() - 8 * 60 * 60 * 1000;

      // Si el lead respondió en las últimas 8h, ya confirmó implícitamente
      if (lastMsg > hace8h) continue;

      // Enviar alerta al vendedor
      const vendedor = vendedoresMap.get(cita.vendedor_id);
      if (!vendedor?.phone) continue;

      const hora = cita.scheduled_time?.slice(0, 5) || '??:??';
      const msg = `⚠️ *${cita.lead_name || 'Lead'}* no ha confirmado su cita de ${cita.scheduled_date === hoyStr ? 'hoy' : 'mañana'} a las ${hora}.\n\nConsidera llamarle para confirmar.\n📞 ${cita.lead_phone || 'Sin teléfono'}`;

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'alerta_lead',
          pendingKey: 'pending_alerta_lead'
        });
        alertas++;

        // Marcar como enviada
        await supabase.client
          .from('leads')
          .update({ notes: { ...notas, no_confirm_alert_sent: true } })
          .eq('id', lead.id);

        console.log(`⚠️ Alerta no-confirmación enviada a ${vendedor.name} por ${cita.lead_name}`);
      } catch (e) {
        console.error(`Error enviando alerta no-confirmación:`, e);
      }
    }

    if (alertas > 0) {
      console.log(`⚠️ Alertas de no-confirmación enviadas: ${alertas}`);
    }
  } catch (e) {
    console.error('Error en alertaCitaNoConfirmada:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'alertaCitaNoConfirmada', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// STALE LEAD CRON - Diario 9am: leads >72h sin contacto
// Alerta al vendedor asignado, máximo 10 por vendedor/día
// ═══════════════════════════════════════════════════════════════
export async function alertarLeadsEstancados(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('⏰ Iniciando verificación de leads estancados (>72h)...');

    const hace72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    // Leads activos con >72h sin actividad - máx 200
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, assigned_to, last_message_at, updated_at, created_at')
      .not('status', 'in', '("closed","delivered","fallen","paused","lost","inactive")')
      .lt('last_message_at', hace72h)
      .not('assigned_to', 'is', null)
      .order('last_message_at', { ascending: true })
      .limit(200);

    if (!leads || leads.length === 0) {
      console.log('✅ No hay leads estancados (>72h)');
      return;
    }

    // Get team members
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, name, phone, role')
      .eq('active', true);

    if (!teamMembers) return;
    const tmMap = new Map<string, any>(teamMembers.map(tm => [tm.id as string, tm]));

    // Group by vendor, max 10 per vendor
    const porVendedor = new Map<string, typeof leads>();
    for (const lead of leads) {
      if (!lead.assigned_to) continue;
      const arr = porVendedor.get(lead.assigned_to) || [];
      if (arr.length < 10) arr.push(lead);
      porVendedor.set(lead.assigned_to, arr);
    }

    let totalAlertas = 0;
    for (const [vendedorId, vendorLeads] of porVendedor) {
      const vendedor = tmMap.get(vendedorId);
      if (!vendedor?.phone) continue;

      let msg = `⏰ *LEADS SIN CONTACTO (+72h)*\n\n`;
      for (const lead of vendorLeads) {
        const lastActivity = new Date(lead.last_message_at || lead.updated_at || lead.created_at);
        const diasSin = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        msg += `⚠️ *${lead.name || 'Sin nombre'}* — ${diasSin} días sin contacto\n`;
        msg += `   Status: ${lead.status} | Tel: ...${(lead.phone || '').slice(-4)}\n\n`;
      }
      msg += `_Total: ${vendorLeads.length} leads necesitan seguimiento_`;

      try {
        await enviarMensajeTeamMember(supabase, meta, vendedor, msg, {
          tipoMensaje: 'alerta_lead',
          pendingKey: 'pending_alerta_lead'
        });
        totalAlertas += vendorLeads.length;
      } catch (e) {
        console.error(`Error enviando alerta estancados a ${vendedor.name}:`, e);
      }
    }

    console.log(`⏰ Alertas de leads estancados enviadas: ${totalAlertas} leads a ${porVendedor.size} vendedores`);
  } catch (e) {
    console.error('Error en alertarLeadsEstancados:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'alertarLeadsEstancados', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTA CHURN CRÍTICO - Notifica vendedores de leads en riesgo de pérdida
// Ejecuta cada 2h pares (8-20), L-S
// ═══════════════════════════════════════════════════════════════
export async function alertarChurnCritico(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('⚠️ Iniciando alerta de churn crítico...');

    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, assigned_to, updated_at')
      .not('status', 'in', '("closed","delivered","lost","fallen","paused","cold")')
      .order('updated_at', { ascending: true })
      .limit(200);

    if (!leads || leads.length === 0) {
      console.log('✅ Sin leads para churn check');
      return;
    }

    const ahora = new Date();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();
    let alertasEnviadas = 0;

    for (const lead of leads) {
      if (alertasEnviadas >= 5) break;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const churnRisk = (notas as any)?.churn_risk;

      if (!churnRisk || (churnRisk.label !== 'critical' && churnRisk.label !== 'at_risk')) continue;

      // No alertar si ya se alertó en últimas 48h
      const ultimaAlerta = (notas as any)?.churn_alert_sent;
      if (ultimaAlerta && ultimaAlerta > hace48h) continue;

      if (!lead.assigned_to) continue;

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('id', lead.assigned_to)
        .single();

      if (!vendedor?.phone) continue;

      const nombreLead = lead.name || 'Sin nombre';
      const razones = Array.isArray(churnRisk.reasons) ? churnRisk.reasons.join(', ') : '';
      const emoji = churnRisk.label === 'critical' ? '🚨' : '⚠️';

      const alertaMsg = `${emoji} *LEAD EN RIESGO: ${nombreLead}*

📊 Riesgo: *${churnRisk.label.toUpperCase()}* (${churnRisk.score}/100)
📋 Razones: ${razones}

💡 Contacta hoy para evitar perder este lead.
📞 Responde: bridge ${nombreLead.split(' ')[0]}`;

      await enviarMensajeTeamMember(supabase, meta, vendedor, alertaMsg, {
        tipoMensaje: 'alerta_lead',
        pendingKey: 'pending_alerta_lead'
      });

      // Mark alert sent
      await supabase.client
        .from('leads')
        .update({ notes: { ...notas, churn_alert_sent: ahora.toISOString() } })
        .eq('id', lead.id);

      alertasEnviadas++;
      console.log(`${emoji} Alerta churn enviada a ${vendedor.name} por ${nombreLead} (${churnRisk.label})`);
    }

    console.log(`⚠️ Alertas churn completadas: ${alertasEnviadas} enviadas`);
  } catch (e) {
    console.error('Error en alertarChurnCritico:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'alertarChurnCritico', stack: (e as Error).stack });
  }
}
