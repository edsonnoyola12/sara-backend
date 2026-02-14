// ═══════════════════════════════════════════════════════════════════════════
// API CORE ROUTES - Leads, Appointments, Properties, Mortgages, Events
// Extracted from index.ts for better code organization
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { CalendarService } from '../services/calendar';
import { createLeadDeduplication } from '../services/leadDeduplicationService';
import { getAvailableVendor } from '../services/leadManagementService';
import { logErrorToDB, enviarDigestoErroresDiario } from '../crons/healthCheck';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  API_SECRET?: string;
  SARA_CACHE?: KVNamespace;
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;
  OPENAI_API_KEY?: string;
  VEO_API_KEY?: string;
}

type CorsResponseFn = (body: string | null, status?: number, contentType?: string, request?: Request) => Response;
type CheckApiAuthFn = (request: Request, env: Env) => Response | null;

export async function handleApiCoreRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn
): Promise<Response | null> {

    if (url.pathname === "/api/diagnostico" && request.method === "GET") {
      const ahora = new Date();
      const hoyMexico = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
      const hoyStr = hoyMexico.toISOString().split('T')[0];
      const finSemana = new Date(hoyMexico.getTime() + 7*24*60*60*1000).toISOString().split('T')[0];

      // Team members
      const { data: team } = await supabase.client.from('team_members').select('id,name,role,phone').eq('active', true);

      // Leads
      const { data: leads } = await supabase.client.from('leads').select('id,name,status,lead_category,assigned_to').order('updated_at', { ascending: false }).limit(100);

      // Citas hoy
      const { data: citasHoy } = await supabase.client.from('appointments').select('id,lead_name,scheduled_date,scheduled_time,status,vendedor_id').eq('scheduled_date', hoyStr);

      // Citas semana
      const { data: citasSemana } = await supabase.client.from('appointments').select('id,lead_name,scheduled_date,scheduled_time,status').gte('scheduled_date', hoyStr).lte('scheduled_date', finSemana).eq('status', 'scheduled').order('scheduled_date', { ascending: true });

      // Mortgage
      const { data: mortgages } = await supabase.client.from('mortgage_applications').select('id,lead_name,status,bank').limit(20);

      // Agrupar
      const leadsByStatus: Record<string, number> = {};
      const leadsByCategory: Record<string, number> = {};
      const leadsByVendedor: Record<string, number> = {};
      leads?.forEach((l: any) => {
        leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;
        leadsByCategory[l.lead_category || 'SIN_CAT'] = (leadsByCategory[l.lead_category || 'SIN_CAT'] || 0) + 1;
        leadsByVendedor[l.assigned_to || 'SIN_ASIGNAR'] = (leadsByVendedor[l.assigned_to || 'SIN_ASIGNAR'] || 0) + 1;
      });

      const mortByStatus: Record<string, number> = {};
      mortgages?.forEach((m: any) => { mortByStatus[m.status] = (mortByStatus[m.status] || 0) + 1; });

      return corsResponse(JSON.stringify({
        fecha: hoyStr,
        team: team?.map((t: any) => ({ id: t.id, name: t.name, role: t.role, phone: t.phone?.slice(-4) })),
        leads: {
          total: leads?.length || 0,
          porStatus: leadsByStatus,
          porCategoria: leadsByCategory,
          porVendedor: Object.entries(leadsByVendedor).map(([id, count]) => {
            const v = team?.find((t: any) => t.id === id);
            return { vendedor: v?.name || id, leads: count };
          })
        },
        citasHoy: citasHoy?.map((c: any) => ({ hora: c.scheduled_time, lead: c.lead_name, status: c.status })) || [],
        citasSemana: citasSemana?.map((c: any) => ({ fecha: c.scheduled_date, hora: c.scheduled_time, lead: c.lead_name })) || [],
        mortgages: { total: mortgages?.length || 0, porStatus: mortByStatus }
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // API - Crear Evento
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/events' && request.method === 'POST') {
      const body = await request.json() as any;
      // Solo campos básicos que sabemos que existen
      const insertData: any = {
        name: body.name,
        event_type: body.event_type || 'open_house',
        event_date: body.event_date
      };
      // Agregar campos opcionales si se envían
      if (body.event_time) insertData.event_time = body.event_time;
      if (body.location) insertData.location = body.location;
      if (body.max_capacity) insertData.max_capacity = body.max_capacity;

      const { data, error } = await supabase.client.from('events').insert(insertData).select().single();

      if (error) return corsResponse(JSON.stringify({ error: error.message }), 400);
      return corsResponse(JSON.stringify(data));
    }

    // API - Obtener Eventos
    if (url.pathname === '/api/events' && request.method === 'GET') {
      const { data, error } = await supabase.client.from('events').select('*').order('event_date', { ascending: false });
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 400);
      return corsResponse(JSON.stringify(data));
    }

    // ═══════════════════════════════════════════════════════════
    // API - Enviar Invitaciones a Eventos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/events/invite' && request.method === 'POST') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const body = await request.json() as { event_id: string, segment: string, send_image: boolean, send_video: boolean, send_pdf: boolean };

      // 1. Obtener evento
      const { data: event } = await supabase.client.from('events').select('*').eq('id', body.event_id).single();
      if (!event) {
        return corsResponse(JSON.stringify({ success: false, error: 'Evento no encontrado' }), 404);
      }

      // 2. Obtener leads del segmento
      let query = supabase.client.from('leads').select('id, name, phone, lead_score, score, status, notes');
      const { data: allLeads } = await query;

      let leads = (allLeads || []).filter((l: any) => l.phone);
      const seg = body.segment;

      if (seg === 'hot') {
        leads = leads.filter((l: any) => (l.lead_score || l.score || 0) >= 70);
      } else if (seg === 'warm') {
        leads = leads.filter((l: any) => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
      } else if (seg === 'cold') {
        leads = leads.filter((l: any) => (l.lead_score || l.score || 0) < 40);
      } else if (seg === 'compradores') {
        leads = leads.filter((l: any) => ['closed_won', 'delivered'].includes(l.status));
      }

      // 3. Formatear fecha del evento
      const eventDate = new Date(event.event_date);
      const formattedDate = eventDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      // 4. Generar mensaje de invitacion
      const inviteMessage = event.invitation_message || `Hola! Te invitamos a *${event.name}*

${event.description || ''}

Fecha: ${formattedDate}
${event.event_time ? `Hora: ${event.event_time}` : ''}
${event.location ? `Lugar: ${event.location}` : ''}
${event.location_url ? `Ubicacion: ${event.location_url}` : ''}

Responde *SI* para confirmar tu asistencia.`;

      let sent = 0;
      let errors = 0;

      // 5. Enviar a cada lead
      for (const lead of leads) {
        try {
          const phone = lead.phone.replace(/\D/g, '');
          const formattedPhone = phone.startsWith('521') ? phone : (phone.startsWith('52') ? `521${phone.slice(2)}` : `521${phone}`);

          // Enviar imagen si existe y fue seleccionada
          if (body.send_image && event.image_url) {
            await meta.sendWhatsAppImage(formattedPhone, event.image_url, event.name);
            await new Promise(r => setTimeout(r, 500));
          }

          // Enviar mensaje principal
          await meta.sendWhatsAppMessage(formattedPhone, inviteMessage);
          await new Promise(r => setTimeout(r, 500));

          // Enviar video si existe y fue seleccionado
          if (body.send_video && event.video_url) {
            await meta.sendWhatsAppVideo(formattedPhone, event.video_url, 'Video del evento');
            await new Promise(r => setTimeout(r, 500));
          }

          // Enviar PDF si existe y fue seleccionado
          if (body.send_pdf && event.pdf_url) {
            await meta.sendWhatsAppDocument(formattedPhone, event.pdf_url, `${event.name}.pdf`);
            await new Promise(r => setTimeout(r, 500));
          }

          // 6. Guardar pending_event_registration en notes del lead
          const currentNotes = lead.notes || {};
          await supabase.client.from('leads').update({
            notes: {
              ...currentNotes,
              pending_event_registration: {
                event_id: event.id,
                event_name: event.name,
                invited_at: new Date().toISOString()
              }
            }
          }).eq('id', lead.id);

          sent++;
        } catch (err: any) {
          console.error(`Error enviando a ${lead.phone}:`, err.message);
          errors++;
        }
      }

      return corsResponse(JSON.stringify({
        success: true,
        sent,
        errors,
        total: leads.length,
        event: event.name,
        segment: seg
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Leads
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads' && request.method === 'GET') {
      const { data } = await supabase.client
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      return corsResponse(JSON.stringify(data || []));
    }

    // ═══════════════════════════════════════════════════════════
    // API: Borrar lead y datos asociados (para testing)
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.match(/^\/api\/leads\/[^/]+$/) && request.method === 'DELETE') {
      const leadId = url.pathname.split('/').pop();
      console.log('🗑️ Borrando lead:', leadId);

      try {
        // 1. Buscar citas asociadas para borrar eventos de Calendar
        const { data: appointments } = await supabase.client
          .from('appointments')
          .select('id, google_event_vendedor_id')
          .eq('lead_id', leadId);

        // 2. Borrar eventos de Calendar
        if (appointments && appointments.length > 0) {
          const calendar = new CalendarService(
            env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            env.GOOGLE_PRIVATE_KEY,
            env.GOOGLE_CALENDAR_ID
          );

          for (const apt of appointments) {
            if (apt.google_event_vendedor_id) {
              try {
                await calendar.deleteEvent(apt.google_event_vendedor_id);
                console.log('🗑️ Evento de Calendar borrado:', apt.google_event_vendedor_id);
              } catch (e) {
                console.error('⚠️ No se pudo borrar evento:', apt.google_event_vendedor_id);
              }
            }
          }
        }

        // 3. Borrar citas de la BD
        await supabase.client
          .from('appointments')
          .delete()
          .eq('lead_id', leadId);
        console.log('🗑️ Citas borradas');

        // 4. Borrar mensajes del lead
        await supabase.client
          .from('messages')
          .delete()
          .eq('lead_id', leadId);
        console.log('🗑️ Mensajes borrados');

        // 5. Borrar el lead
        const { error } = await supabase.client
          .from('leads')
          .delete()
          .eq('id', leadId);

        if (error) {
          console.error('❌ Error borrando lead:', error);
          return corsResponse(JSON.stringify({ error: error.message }), 500);
        }

        console.log('✅ Lead y datos asociados borrados:', leadId);
        return corsResponse(JSON.stringify({ success: true, deleted: leadId }));
      } catch (err: any) {
        console.error('❌ Error en delete lead:', err);
        return corsResponse(JSON.stringify({ error: err.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // API: Recalcular scores de todos los leads según su status
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/recalculate-scores' && request.method === 'POST') {
      try {
        // Score base por status del funnel
        const SCORE_BY_STATUS: Record<string, number> = {
          'new': 15,
          'contacted': 35,
          'scheduled': 55,
          'visited': 80,
          'negotiation': 90,
          'negotiating': 90,
          'reserved': 95,
          'closed_won': 100,
          'closed': 100,
          'delivered': 100,
          'fallen': 0
        };

        const { data: leads } = await supabase.client
          .from('leads')
          .select('id, status, name, property_interest, needs_mortgage, enganche_disponible');

        if (!leads) {
          return corsResponse(JSON.stringify({ error: 'No se pudieron obtener leads' }), 500);
        }

        let updated = 0;
        const results: any[] = [];

        for (const lead of leads) {
          const status = lead.status || 'new';
          let baseScore = SCORE_BY_STATUS[status] ?? 15;

          // Bonificaciones menores
          let bonus = 0;
          if (lead.name && lead.name !== 'Sin nombre') bonus += 2;
          if (lead.property_interest) bonus += 2;
          if (lead.needs_mortgage) bonus += 3;
          if (lead.enganche_disponible && lead.enganche_disponible > 0) bonus += 3;

          const finalScore = Math.min(100, baseScore + bonus);

          // Determinar temperatura
          let temperature = 'COLD';
          let lead_category = 'cold';
          if (finalScore >= 70) {
            temperature = 'HOT';
            lead_category = 'hot';
          } else if (finalScore >= 40) {
            temperature = 'WARM';
            lead_category = 'warm';
          }

          // Actualizar
          const { error } = await supabase.client
            .from('leads')
            .update({
              score: finalScore,
              lead_score: finalScore,
              temperature,
              lead_category
            })
            .eq('id', lead.id);

          if (!error) {
            updated++;
            results.push({
              id: lead.id,
              status,
              oldScore: 'N/A',
              newScore: finalScore,
              temperature
            });
          }
        }

        return corsResponse(JSON.stringify({
          success: true,
          total: leads.length,
          updated,
          results
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    if (url.pathname.match(/^\/api\/leads\/[^\/]+$/) && request.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const { data } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    if (url.pathname.match(/^\/api\/leads\/[^\/]+$/) && request.method === 'PUT') {
      const id = url.pathname.split('/').pop();
      const body = await request.json() as any;
      
      // Verificar si cambió el assigned_to para notificar
      const { data: oldLead } = await supabase.client
        .from('leads')
        .select('assigned_to, name, phone, property_interest, notes, score, status')
        .eq('id', id)
        .single();
      
      // Recalcular score basado en datos del lead
      let newScore = oldLead?.score || 0;
      const oldStatus = oldLead?.status;
      
      // Si cambió el status, ajustar score basado en FUNNEL
      if (body.status && body.status !== oldLead?.status) {
        // Scores alineados con umbrales: HOT >= 70, WARM >= 40, COLD < 40
        const statusScores: Record<string, number> = {
          'new': 15,              // COLD
          'contacted': 35,        // COLD
          'scheduled': 55,        // WARM
          'visited': 80,          // HOT
          'negotiation': 90,      // HOT
          'negotiating': 90,      // HOT
          'reserved': 95,         // HOT
          'closed_won': 100,      // HOT
          'closed': 100,          // HOT
          'delivered': 100,       // HOT
          'fallen': 0             // COLD
        };
        newScore = statusScores[body.status] ?? newScore;

        // Temperatura basada en score (umbrales unificados)
        let temperatura = 'COLD';
        if (newScore >= 70) {
          temperatura = 'HOT';
        } else if (newScore >= 40) {
          temperatura = 'WARM';
        }

        body.temperature = temperatura;
        body.score = newScore;
        body.lead_score = newScore;
        body.lead_category = temperatura.toLowerCase();
        console.log('📊 Score actualizado por status:', body.status, '→', newScore, 'Temp:', temperatura);
      }
      
      // Si tiene desarrollo de interés y no tenía, +15
      if (body.property_interest && !oldLead?.property_interest) {
        newScore += 15;
        body.score = newScore;
        body.lead_score = newScore;
      }
      
      const { data } = await supabase.client
        .from('leads')
        .update(body)
        .eq('id', id)
        .select()
        .single();
      
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICAR AL VENDEDOR CUANDO CAMBIA EL STATUS
      // ═══════════════════════════════════════════════════════════════
      if (data && body.status && oldStatus && body.status !== oldStatus) {
        try {
          // Buscar vendedor asignado al lead
          const vendedorId = data.assigned_to || oldLead?.assigned_to;
          if (vendedorId) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('name, phone')
              .eq('id', vendedorId)
              .single();
            
            if (vendedor?.phone) {
              const statusEmojis: Record<string, string> = {
                'new': '🆕 NUEVO',
                'contacted': '📞 CONTACTADO',
                'scheduled': '📅 CITA AGENDADA',
                'visited': '🏠 VISITÓ',
                'negotiation': '💰 NEGOCIACIÓN',
                'reserved': '📍 RESERVADO',
                'closed': '✅ CERRADO',
                'delivered': '🔑 ENTREGADO',
                'fallen': '❌ CAÍDO'
              };
              
              const statusAnterior = statusEmojis[oldStatus] || oldStatus;
              const statusNuevo = statusEmojis[body.status] || body.status;
              
              const mensaje = `📊 *LEAD ACTUALIZADO*
━━━━━━━━━━━━━━━━━━━━

👤 *${data.name}*
📱 ${data.phone}

${statusAnterior} → ${statusNuevo}

🎯 Score: ${newScore}`;
              
              await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
              console.log('📤 Notificación de cambio de status enviada a:', vendedor.name);
            }
          }
        } catch (e) {
          console.error('⚠️ Error notificando cambio de status:', e);
        }
      }
      
      // Si cambió el vendedor asignado, notificar al nuevo
      if (data && body.assigned_to && oldLead?.assigned_to !== body.assigned_to) {
        try {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('name, phone')
            .eq('id', body.assigned_to)
            .single();

          if (vendedor?.phone) {
            const mensaje = `📋 *Lead Reasignado*
━━━━━━━━━━━━━━━━━━
👤 *Nombre:* ${data.name || 'Sin nombre'}
📱 *Tel:* ${data.phone || 'Sin teléfono'}
🏠 *Interés:* ${data.property_interest || 'No especificado'}
📍 *Notas:* ${data.notes || 'Sin notas'}
━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar pronto!*`;

            await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
            console.log('📤 Notificación enviada a', vendedor.name);
          }
        } catch (e) {
          console.error('⚠️ Error notificando:', e);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // NOTIFICAR AL ASESOR HIPOTECARIO CUANDO SE LE ASIGNA UN LEAD
      // ═══════════════════════════════════════════════════════════════
      if (data && body.asesor_banco_id && oldLead?.asesor_banco_id !== body.asesor_banco_id) {
        try {
          const { data: asesor } = await supabase.client
            .from('team_members')
            .select('name, phone')
            .eq('id', body.asesor_banco_id)
            .single();

          // Obtener vendedor para incluir en notificación
          const { data: vendedorLead } = await supabase.client
            .from('team_members')
            .select('name, phone')
            .eq('id', data.assigned_to)
            .single();

          if (asesor?.phone && asesor?.is_active !== false) {
            const mensaje = `🏦 *LEAD ASIGNADO PARA CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name || 'Sin nombre'}
📱 *Tel:* ${data.phone || 'Sin teléfono'}
🏠 *Desarrollo:* ${data.property_interest || 'No especificado'}

${vendedorLead ? `👔 *Vendedor:* ${vendedorLead.name}\n📱 *Tel vendedor:* ${vendedorLead.phone}` : ''}

━━━━━━━━━━━━━━━━━━━━━━
💳 *¡Contactar para iniciar trámite!*`;

            await meta.sendWhatsAppMessage(asesor.phone, mensaje);
            console.log('📤 Notificación enviada a asesor hipotecario:', asesor.name);
          }

          // También notificar al vendedor que su lead fue asignado a un asesor
          if (vendedorLead?.phone && asesor?.name) {
            const msgVendedor = `💳 *TU LEAD CON ASESOR HIPOTECARIO*
━━━━━━━━━━━━━━━━━━━━━━

👤 *${data.name}* ahora está siendo atendido por:
🏦 *Asesor:* ${asesor.name}
${asesor.phone ? `📱 *Tel:* ${asesor.phone}` : ''}

¡Coordina con el asesor para cerrar! 💪`;

            await meta.sendWhatsAppMessage(vendedorLead.phone, msgVendedor);
            console.log('📤 Vendedor notificado de asignación a asesor');
          }
        } catch (e) {
          console.error('⚠️ Error notificando asesor hipotecario:', e);
        }
      }

      return corsResponse(JSON.stringify(data || {}));
    }

    // ═══════════════════════════════════════════════════════════════
    // API: Crear Lead con Round-Robin + Notificaciones Completas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      
      let vendedorAsignado = null;
      const esVendedor = body.creador_role === 'vendedor';

      // Si no tiene assigned_to, usar asignación inteligente
      if (!body.assigned_to) {
        const { data: todosVendedores } = await supabase.client
          .from('team_members')
          .select('*')
          .eq('active', true);

        vendedorAsignado = getAvailableVendor(todosVendedores || []);
        if (vendedorAsignado) {
          body.assigned_to = vendedorAsignado.id;
        } else {
          // 🚨 ALERTA: No hay vendedor disponible - notificar admin
          console.error('🚨 CRÍTICO: Lead creado SIN VENDEDOR - phone:', body.phone);
          // Guardar en notes para tracking
          body.notes = { ...(body.notes || {}), sin_vendedor: true, alerta_enviada: new Date().toISOString() };
        }
      } else {
        const { data: v } = await supabase.client
          .from('team_members')
          .select('*')
          .eq('id', body.assigned_to)
          .single();
        vendedorAsignado = v;
      }
      
      // Crear el lead (solo campos válidos de la tabla)
      // Calcular score inicial basado en datos
      let initialScore = 0;
      if (body.property_interest) initialScore += 15; // Tiene desarrollo de interés
      if (body.tiene_cita) initialScore += 20; // Tiene cita programada
      if (body.necesita_credito === 'si') initialScore += 10; // Necesita crédito
      
      // Determinar temperatura
      let temperature = 'COLD';
      if (initialScore >= 61) temperature = 'HOT';
      else if (initialScore >= 31) temperature = 'WARM';
      
      console.log('📊 Score inicial:', initialScore, 'Temp:', temperature);
      
      const leadData = {
        name: body.name,
        phone: body.phone,
        property_interest: body.property_interest,
        budget: body.budget,
        status: body.status || 'new',
        score: initialScore,
        temperature: temperature,
        assigned_to: body.assigned_to,
        captured_by: body.captured_by,
        source: body.source,
        created_at: body.created_at,
        banco_preferido: body.banco_preferido,
        enganche_disponible: body.enganche_disponible ? parseInt(body.enganche_disponible.replace(/[^0-9]/g, '')) : null,
        notes: {
          modelo: body.modelo,
          recamaras: body.recamaras,
          necesita_credito: body.necesita_credito,
          ingreso_mensual: body.ingreso_mensual,
          cita: body.tiene_cita ? {
            fecha: body.cita_fecha,
            hora: body.cita_hora,
            desarrollo: body.cita_desarrollo
          } : null,
          notas_adicionales: body.notas,
          creado_por: body.creador_name
        }
      };
      
      const { data, error } = await supabase.client
        .from('leads')
        .insert([leadData])
        .select()
        .single();
      
      if (error) {
        console.error('❌ Error creando lead:', error);
        // Mensaje amigable para teléfono duplicado
        if (error.code === '23505' && error.message.includes('phone')) {
          return corsResponse(JSON.stringify({ error: 'Ya existe un lead con este teléfono. Búscalo en la lista de leads.' }), 400);
        }
        return corsResponse(JSON.stringify({ error: error.message }), 400);
      }
      
      console.log('✅ Lead creado:', data.id);
      
      // Buscar propiedad para obtener GPS del desarrollo
      let gpsLink = '';
      const desarrolloCita = body.cita_desarrollo || body.desarrollo || data.property_interest;
      if (desarrolloCita && desarrolloCita !== 'Oficinas Centrales') {
        const { data: prop } = await supabase.client
          .from('properties')
          .select('gps_link, development, name')
          .or(`development.ilike.%${desarrolloCita}%,name.ilike.%${desarrolloCita}%`)
          .limit(1)
          .single();
        
        if (prop?.gps_link) {
          gpsLink = prop.gps_link;
          console.log('📍 GPS encontrado:', gpsLink);
        }
      } else if (desarrolloCita === 'Oficinas Centrales') {
        // Link de oficinas centrales Santa Rita
        gpsLink = 'https://maps.app.goo.gl/hUk6aH8chKef6NRY7';
      }
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICACIÓN 1: Al vendedor (solo si NO es él quien creó)
      // ═══════════════════════════════════════════════════════════════
      if (vendedorAsignado?.phone && !esVendedor) {
        try {
          const citaInfo = body.tiene_cita 
            ? `\n📅 *Cita:* ${body.cita_fecha} a las ${body.cita_hora}\n📍 *Lugar:* ${body.cita_desarrollo}${gpsLink ? '\n🗺️ *Maps:* ' + gpsLink : ''}` 
            : '';
          
          const creditoInfo = body.necesita_credito === 'si'
            ? `\n🏦 *Crédito:* Sí necesita (${body.banco_preferido || 'banco por definir'})`
            : '';
          
          const mensaje = `📋 *NUEVO LEAD ASIGNADO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name}
📱 *Tel:* ${data.phone}
📣 *Fuente:* ${body.source || 'CRM'}

🏠 *Interés:* ${data.property_interest || 'No especificado'}
${body.modelo ? `🏡 *Modelo:* ${body.modelo}` : ''}
💰 *Presupuesto:* ${data.budget || 'No especificado'}
${creditoInfo}${citaInfo}

📍 *Notas:* ${body.notas || 'Sin notas'}

━━━━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar pronto!*
👤 Asignado por: ${body.creador_name || 'CRM'}`;
          
          await meta.sendWhatsAppMessage(vendedorAsignado.phone, mensaje);
          console.log('📤 Notificación enviada a vendedor:', vendedorAsignado.name);
        } catch (e) {
          console.error('⚠️ Error notificando vendedor:', e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CREAR MORTGAGE APPLICATION (siempre que necesite crédito)
      // ═══════════════════════════════════════════════════════════════
      let asesorAsignado: any = null;
      
      if (body.necesita_credito === 'si') {
        try {
          console.log('📍 Buscando asesor para banco:', body.banco_preferido);
          
          const { data: asesores } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('role', 'asesor')
            .eq('active', true);
          
          console.log('📋 Asesores encontrados:', asesores?.length, asesores?.map(a => ({ name: a.name, banco: a.banco })));
          
          // Buscar coincidencia flexible con banco
          if (body.banco_preferido) {
            asesorAsignado = asesores?.find(a => 
              a.banco?.toLowerCase().includes(body.banco_preferido.toLowerCase()) ||
              body.banco_preferido.toLowerCase().includes(a.banco?.toLowerCase())
            );
          }
          
          // Crear registro en mortgage_applications
          const ingresoNum = parseInt(body.ingreso_mensual?.replace(/[^0-9]/g, '') || '0');
          const engancheNum = parseInt(body.enganche_disponible?.replace(/[^0-9]/g, '') || '0');
          const presupuestoNum = parseInt(body.budget?.replace(/[^0-9]/g, '') || '0');
          
          const { data: mortgage, error: mortgageError } = await supabase.client
            .from('mortgage_applications')
            .insert({
              lead_id: data.id,
              lead_name: data.name,
              lead_phone: data.phone,
              property_name: data.property_interest || '',
              monthly_income: ingresoNum,
              down_payment: engancheNum,
              requested_amount: presupuestoNum > engancheNum ? presupuestoNum - engancheNum : presupuestoNum,
              bank: body.banco_preferido || 'Por definir',
              assigned_advisor_id: asesorAsignado?.id || null,
              assigned_advisor_name: asesorAsignado?.name || null,
              status: 'pending',
              pending_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (mortgageError) {
            console.error('⚠️ Error creando mortgage:', mortgageError);
          } else {
            console.log('📋 Mortgage creado:', mortgage?.id, 'Asesor:', asesorAsignado?.name || 'Sin asignar');
          }
          
          // Notificar al asesor si el usuario lo pidió (solo si está activo)
          if (body.enviar_a_asesor && asesorAsignado?.phone && asesorAsignado?.is_active !== false) {
            const msgAsesor = `🏦 *NUEVO LEAD DE CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name}
📱 *Tel:* ${data.phone}

🏦 *Banco:* ${body.banco_preferido}
💵 *Ingreso:* ${body.ingreso_mensual || 'No especificado'}
💰 *Enganche:* ${body.enganche_disponible || 'No especificado'}

🏠 *Interés:* ${data.property_interest || 'No especificado'}
💰 *Presupuesto:* ${data.budget || 'No especificado'}

━━━━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar para pre-calificación!*
👤 Vendedor: ${vendedorAsignado?.name || 'Por asignar'}`;
            
            await meta.sendWhatsAppMessage(asesorAsignado.phone, msgAsesor);
            console.log('📤 Notificación enviada a asesor:', asesorAsignado.name);
          } else if (body.enviar_a_asesor && !asesorAsignado) {
            console.error('⚠️ No se encontró asesor para banco:', body.banco_preferido);
          }
        } catch (e) {
          console.error('⚠️ Error en proceso de crédito:', e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CREAR CITA (si tiene cita agendada)
      // ═══════════════════════════════════════════════════════════════
      if (body.tiene_cita && body.cita_fecha) {
        try {
          // Construir fecha/hora en formato local (no UTC)
          const citaHora = (body.cita_hora || '10:00').substring(0, 5);
          const dateTimeStr = `${body.cita_fecha}T${citaHora}:00`;
          const [hourNum] = citaHora.split(':').map(Number);
          const endHour = String(hourNum + 1).padStart(2, '0');
          const endTimeStr = `${body.cita_fecha}T${endHour}:${citaHora.split(':')[1]}:00`;
          
          // 1. Crear en Google Calendar
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          
          const eventTitle = `🏠 Cita: ${data.name} - ${body.cita_desarrollo || 'Visita'}`;
          const eventDescription = `👤 Cliente: ${data.name}
📱 Tel: ${data.phone}
🏠 Desarrollo: ${body.cita_desarrollo || 'No especificado'}
💰 Presupuesto: ${data.budget || 'No especificado'}
👤 Vendedor: ${vendedorAsignado?.name || 'Por asignar'}
${gpsLink ? '📍 Ubicación: ' + gpsLink : ''}

Creado desde CRM por: ${body.creador_name || 'Sistema'}`;

          const eventData = {
            summary: eventTitle,
            description: eventDescription,
            location: body.cita_desarrollo === 'Oficinas Centrales' ? 'Oficinas Grupo Santa Rita' : body.cita_desarrollo,
            start: {
              dateTime: dateTimeStr,
              timeZone: 'America/Mexico_City'
            },
            end: {
              dateTime: endTimeStr,
              timeZone: 'America/Mexico_City'
            }
          };
          
          const googleEvent = await calendar.createEvent(eventData);
          
          console.log('📅 Evento Google Calendar creado:', googleEvent?.id);
          
          // 2. Crear en tabla appointments del CRM
          const { data: appointment, error: appointmentError } = await supabase.client
            .from('appointments')
            .insert({
              lead_id: data.id,
              lead_name: data.name,
              lead_phone: data.phone,
              property_name: body.cita_desarrollo || data.property_interest || '',
              scheduled_date: body.cita_fecha,
              scheduled_time: citaHora,
              status: 'scheduled',
              appointment_type: 'visita',
              duration_minutes: 60,
              vendedor_id: vendedorAsignado?.id || null,
              vendedor_name: vendedorAsignado?.name || null,
              google_event_vendedor_id: googleEvent?.id || null,
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (appointmentError) {
            console.error('⚠️ Error creando appointment:', appointmentError);
          } else {
            console.log('📅 Appointment creado en CRM:', appointment?.id);
          }
          
        } catch (e) {
          console.error('⚠️ Error creando cita:', e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICACIÓN 3: Al cliente (confirmación)
      // ═══════════════════════════════════════════════════════════════
      if (data.phone) {
        try {
          let msgCliente = `¡Hola ${data.name?.split(' ')[0] || ''}! 👋

Gracias por tu interés en *Grupo Santa Rita*. 🏡

Tu asesor *${vendedorAsignado?.name || 'asignado'}* te contactará muy pronto.
📱 Tel: ${vendedorAsignado?.phone || 'Por confirmar'}`;

          if (body.tiene_cita) {
            msgCliente += `

📅 *Tu cita está confirmada:*
• Fecha: ${body.cita_fecha}
• Hora: ${body.cita_hora || 'Por confirmar'}
• Lugar: ${body.cita_desarrollo}
${gpsLink ? '📍 Ubicación: ' + gpsLink : ''}

¡Te esperamos! 🎉`;
          } else {
            msgCliente += `

¿Hay algo más en lo que pueda ayudarte? 😊`;
          }
          
          await meta.sendWhatsAppMessage(data.phone, msgCliente);
          console.log('📤 Confirmación enviada a cliente:', data.name);
        } catch (e) {
          console.error('⚠️ Error notificando cliente:', e);
        }
      }
      
      return corsResponse(JSON.stringify(data), 201);
    }

    // ═══════════════════════════════════════════════════════════════
    // API Routes - Appointments
    // ═══════════════════════════════════════════════════════════════
    
    // Cancelar cita (y eliminar de Google Calendar)
    if (url.pathname.match(/^\/api\/appointments\/[^/]+\/cancel$/) && request.method === 'POST') {
      const id = url.pathname.split('/')[3];
      const body = await request.json() as any;
      
      try {
        // Obtener la cita para tener el google_event_id
        const { data: appointment } = await supabase.client
          .from('appointments')
          .select('*')
          .eq('id', id)
          .single();
        
        if (!appointment) {
          return corsResponse(JSON.stringify({ error: 'Cita no encontrada' }), 404);
        }
        
        // Eliminar de Google Calendar si existe
        const googleEventId = body.google_event_id || appointment.google_event_vendedor_id;
        if (googleEventId) {
          try {
            const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
            await calendar.deleteEvent(googleEventId);
            console.log('📅 Evento eliminado de Google Calendar:', googleEventId);
          } catch (calError) {
            console.error('⚠️ Error eliminando de Google Calendar:', calError);
          }
        }
        
        // Actualizar en DB
        const { data, error } = await supabase.client
          .from('appointments')
          .update({ 
            status: 'cancelled',
            cancelled_by: body.cancelled_by || 'CRM',
          })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        
        console.log('✅ Cita cancelada:', id);
        
        // ═══ ENVIAR NOTIFICACIONES DE CANCELACIÓN ═══
        if (body.notificar !== false) { // Por defecto notificar
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

          // Formatear fecha
          const fechaObj = new Date(appointment.scheduled_date + 'T12:00:00');
          const fechaFormateada = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
          const horaFormateada = (appointment.scheduled_time || '').substring(0, 5);

          // Detectar si es llamada o cita presencial
          const esLlamada = appointment.appointment_type === 'llamada';
          const tipoTitulo = esLlamada ? 'LLAMADA CANCELADA' : 'CITA CANCELADA';
          const tipoTexto = esLlamada ? 'llamada' : 'cita';

          // Notificar al cliente
          if (appointment.lead_phone) {
            try {
              let msgCliente = `❌ *${tipoTitulo}*

Hola ${appointment.lead_name || ''} 👋

Tu ${tipoTexto} ha sido cancelada:

📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

              // Solo mostrar ubicación para citas presenciales
              if (!esLlamada && appointment.property_name) {
                msgCliente += `
📍 *Lugar:* ${appointment.property_name}`;
              }

              msgCliente += `

Si deseas reagendar, contáctanos. ¡Estamos para servirte! ${esLlamada ? '📞' : '🏠'}`;

              const phoneCliente = appointment.lead_phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneCliente, msgCliente);
              console.log('📤 Notificación de cancelación enviada a cliente:', appointment.lead_name);
            } catch (e) {
              console.error('⚠️ Error notificando cliente:', e);
            }
          }

          // Notificar al vendedor
          if (appointment.vendedor_id) {
            try {
              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .eq('id', appointment.vendedor_id)
                .single();

              if (vendedor?.phone) {
                let msgVendedor = `❌ *${tipoTitulo}*

👤 *Cliente:* ${appointment.lead_name}
📱 *Tel:* ${appointment.lead_phone}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

                // Solo mostrar ubicación para citas presenciales
                if (!esLlamada && appointment.property_name) {
                  msgVendedor += `
📍 *Lugar:* ${appointment.property_name}`;
                }

                msgVendedor += `

Cancelada por: ${body.cancelled_by || 'CRM'}`;

                const phoneVendedor = vendedor.phone.replace(/[^0-9]/g, '');
                await meta.sendWhatsAppMessage(phoneVendedor, msgVendedor);
                console.log('📤 Notificación de cancelación enviada a vendedor:', vendedor.name);
              }
            } catch (e) {
              console.error('⚠️ Error notificando vendedor:', e);
            }
          }
        }
        
        return corsResponse(JSON.stringify(data));
      } catch (e: any) {
        console.error('❌ Error cancelando cita:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Notificar cambio/cancelación de cita (usado por coordinadores)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/appointments/notify-change' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      console.log('📋 Notificación de cita:', body.action, body.lead_name);

      try {
        const esCambio = body.action === 'cambio';
        const fechaVieja = body.old_date ? new Date(body.old_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }) : '';
        const fechaNueva = body.new_date ? new Date(body.new_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }) : '';

        if (esCambio) {
          // ═══ NOTIFICAR CAMBIO DE CITA ═══

          // Al vendedor
          if (body.vendedor_phone) {
            const msgVendedor = `📅 *CITA REPROGRAMADA*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
🏠 *Lugar:* ${body.property}

❌ *Antes:* ${fechaVieja} a las ${body.old_time?.slice(0, 5)}
✅ *Ahora:* ${fechaNueva} a las ${body.new_time?.slice(0, 5)}

📝 *Motivo:* ${body.nota || 'Sin especificar'}

━━━━━━━━━━━━━━━━━━━━━
👤 Coordinador: ${body.coordinador_name}`;

            await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
            console.log('📤 Notificación de cambio enviada a vendedor:', body.vendedor_name);
          }

          // Al cliente
          if (body.lead_phone) {
            const msgCliente = `📅 *TU CITA HA SIDO REPROGRAMADA*

Hola ${body.lead_name?.split(' ')[0] || ''} 👋

Tu cita ha sido actualizada:

✅ *Nueva fecha:* ${fechaNueva}
🕐 *Nueva hora:* ${body.new_time?.slice(0, 5)}
📍 *Lugar:* ${body.property}

${body.nota ? `📝 *Nota:* ${body.nota}` : ''}

¡Te esperamos! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log('📤 Notificación de cambio enviada a cliente:', body.lead_name);
          }

        } else {
          // ═══ NOTIFICAR CANCELACIÓN ═══

          // Al vendedor
          if (body.vendedor_phone) {
            const msgVendedor = `❌ *CITA CANCELADA*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
🏠 *Lugar:* ${body.property}

📆 *Fecha:* ${fechaVieja} a las ${body.old_time?.slice(0, 5)}

📝 *Motivo:* ${body.nota || 'Sin especificar'}

━━━━━━━━━━━━━━━━━━━━━
👤 Cancelada por: ${body.coordinador_name}`;

            await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
            console.log('📤 Notificación de cancelación enviada a vendedor:', body.vendedor_name);
          }

          // Al cliente
          if (body.lead_phone) {
            const msgCliente = `❌ *TU CITA HA SIDO CANCELADA*

Hola ${body.lead_name?.split(' ')[0] || ''} 👋

Lamentamos informarte que tu cita ha sido cancelada:

📆 *Fecha:* ${fechaVieja}
🕐 *Hora:* ${body.old_time?.slice(0, 5)}
📍 *Lugar:* ${body.property}

${body.nota ? `📝 *Motivo:* ${body.nota}` : ''}

Para reagendar, contáctanos. ¡Estamos para servirte! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log('📤 Notificación de cancelación enviada a cliente:', body.lead_name);
          }
        }

        return corsResponse(JSON.stringify({ success: true, action: body.action }));
      } catch (e: any) {
        console.error('❌ Error enviando notificación:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Notificar nota de coordinador al vendedor
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads/notify-note' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      console.log('📝 Nota de coordinador para:', body.lead_name);

      try {
        if (body.vendedor_phone) {
          const msgVendedor = `📝 *NOTA DEL COORDINADOR*
━━━━━━━━━━━━━━━━━━━━━

👤 *Lead:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}

💬 *Nota:*
${body.nota}

━━━━━━━━━━━━━━━━━━━━━
👤 De: ${body.coordinador_name}`;

          await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
          console.log('📤 Nota enviada a vendedor:', body.vendedor_name);
        }

        return corsResponse(JSON.stringify({ success: true }));
      } catch (e: any) {
        console.error('❌ Error enviando nota:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Notificar reasignación de lead al nuevo vendedor
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads/notify-reassign' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      console.log('🔄 Lead reasignado a:', body.vendedor_name);

      try {
        if (body.vendedor_phone) {
          const msgVendedor = `🔄 *LEAD REASIGNADO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
🏠 *Interés:* ${body.property_interest || 'No especificado'}

💬 *Nota:*
${body.nota || 'Sin nota'}

━━━━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar pronto!*
👤 Reasignado por: ${body.coordinador_name}`;

          await meta.sendWhatsAppMessage(body.vendedor_phone, msgVendedor);
          console.log('📤 Notificación de reasignación enviada a:', body.vendedor_name);
        }

        // Notificar al CLIENTE sobre su nuevo asesor (solo si ha interactuado antes)
        if (body.lead_phone && body.lead_has_interacted !== false) {
          try {
            const msgCliente = `¡Hola ${body.lead_name?.split(' ')[0] || ''}! A partir de ahora tu asesor será *${body.vendedor_name}*.\n\nCualquier duda, él/ella te atenderá con gusto. 😊`;
            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log('📤 Notificación de reasignación enviada al cliente:', body.lead_name);
          } catch (clientErr) {
            console.error('Error notificando cliente de reasignación:', clientErr);
          }
        }

        return corsResponse(JSON.stringify({ success: true }));
      } catch (e: any) {
        console.error('❌ Error notificando reasignación:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // Listar citas (para el CRM)
    if (url.pathname === '/api/appointments' && request.method === 'GET') {
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');
      const vendorId = url.searchParams.get('vendor_id');

      let query = supabase.client
        .from('appointments')
        .select('*, leads(name, phone)')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (startDate) {
        query = query.gte('scheduled_date', startDate);
      }
      if (endDate) {
        query = query.lte('scheduled_date', endDate);
      }
      if (vendorId) {
        query = query.eq('vendedor_id', vendorId);
      }

      const { data, error } = await query;

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify(data || []));
    }

    // Crear nueva cita
    if (url.pathname === '/api/appointments' && request.method === 'POST') {
      const body = await request.json() as any;
      
      try {
        // Construir fecha/hora en formato local (no UTC)
        const citaHora = (body.scheduled_time || '10:00').substring(0, 5);
        const dateTimeStr = `${body.scheduled_date}T${citaHora}:00`;
        const [hourNum] = citaHora.split(':').map(Number);
        const endHour = String(hourNum + 1).padStart(2, '0');
        const endTimeStr = `${body.scheduled_date}T${endHour}:${citaHora.split(':')[1]}:00`;
        
        // Crear en Google Calendar
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        
        const eventData = {
          summary: `🏠 Cita: ${body.lead_name} - ${body.property_name || 'Visita'}`,
          description: `👤 Cliente: ${body.lead_name}\n📱 Tel: ${body.lead_phone}\n🏠 Desarrollo: ${body.property_name}\n👤 Vendedor: ${body.vendedor_name || 'Por asignar'}\n\nCreado desde CRM`,
          location: body.property_name,
          start: { dateTime: dateTimeStr, timeZone: 'America/Mexico_City' },
          end: { dateTime: endTimeStr, timeZone: 'America/Mexico_City' }
        };
        
        const googleEvent = await calendar.createEvent(eventData);
        console.log('📅 Evento Google Calendar creado:', googleEvent?.id);
        
        // Crear en DB
        const { data, error } = await supabase.client
          .from('appointments')
          .insert({
            lead_id: body.lead_id,
            lead_name: body.lead_name,
            lead_phone: body.lead_phone,
            property_name: body.property_name,
            scheduled_date: body.scheduled_date,
            scheduled_time: body.scheduled_time,
            status: 'scheduled',
            appointment_type: body.appointment_type || 'visita',
            duration_minutes: 60,
            vendedor_id: body.vendedor_id,
            vendedor_name: body.vendedor_name,
            google_event_vendedor_id: googleEvent?.id || null,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (error) throw error;
        
        console.log('✅ Cita creada:', data.id);
        
        // ═══ ENVIAR NOTIFICACIONES ═══
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        
        // Formatear fecha bonita
        const fechaObj = new Date(body.scheduled_date + 'T12:00:00');
        const fechaFormateada = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
        
        // Buscar GPS del desarrollo
        let gpsLink = '';
        if (body.property_name) {
          const { data: prop } = await supabase.client
            .from('properties')
            .select('gps_link')
            .or(`development.eq.${body.property_name},name.eq.${body.property_name}`)
            .limit(1)
            .single();
          gpsLink = prop?.gps_link || '';
        }
        
        // 1. Enviar TEMPLATE de confirmación al CLIENTE
        let confirmationSent = false;
        if (body.lead_phone) {
          try {
            const phoneCliente = body.lead_phone.replace(/[^0-9]/g, '');

            // Preparar variables del template appointment_confirmation_v2
            // Template Meta: ¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.
            // Botón dinámico: https://maps.app.goo.gl/{{1}}
            const gpsCode = gpsLink ? gpsLink.replace(/^https?:\/\/maps\.app\.goo\.gl\//, '') : '';
            const templateComponents: any[] = [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: body.lead_name || 'cliente' },                          // {{1}} Nombre
                  { type: 'text', text: 'Grupo Santa Rita' },                                   // {{2}} Empresa
                  { type: 'text', text: `visita a ${body.property_name || 'nuestras oficinas'}` }, // {{3}} Visita → "visita a Distrito Falco"
                  { type: 'text', text: fechaFormateada },                                      // {{4}} Fecha
                  { type: 'text', text: citaHora }                                              // {{5}} Hora
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  { type: 'text', text: gpsCode || 'qR8vK3xYz9M' }                              // {{1}} Sufijo GPS
                ]
              }
            ];

            await meta.sendTemplate(phoneCliente, 'appointment_confirmation_v2', 'es', templateComponents);
            confirmationSent = true;
            console.log('📤 Template appointment_confirmation enviado a:', body.lead_name);

            // Marcar en el lead que se envió template (para activar SARA cuando responda)
            if (body.lead_id) {
              await supabase.client.from('leads').update({
                template_sent: 'appointment_confirmation',
                template_sent_at: new Date().toISOString(),
                sara_activated: false // Se activará cuando responda
              }).eq('id', body.lead_id);
            }
          } catch (e) {
            console.error('⚠️ Error enviando template:', e);
            // Fallback: enviar mensaje normal si falla el template
            try {
              const msgCliente = `📅 *CITA CONFIRMADA*\n\n¡Hola ${body.lead_name || ''}! 👋\n\nTu cita ha sido agendada:\n\n📆 *Fecha:* ${fechaFormateada}\n🕐 *Hora:* ${citaHora}\n📍 *Lugar:* ${body.property_name || 'Por confirmar'}\n${gpsLink ? '🗺️ *Ubicación:* ' + gpsLink : ''}\n👤 *Te atenderá:* ${body.vendedor_name || 'Un asesor'}\n\n¡Te esperamos! 🏠`;
              const phoneCliente = body.lead_phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneCliente, msgCliente);
              confirmationSent = true;
            } catch (e2) {
              console.error('⚠️ Error fallback mensaje:', e2);
            }
          }
        }

        // Actualizar cita con estado de confirmación
        if (confirmationSent) {
          await supabase.client.from('appointments').update({
            confirmation_sent: true,
            confirmation_sent_at: new Date().toISOString()
          }).eq('id', data.id);
        }
        
        // 2. Notificar al VENDEDOR
        if (body.vendedor_id) {
          try {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('phone, name')
              .eq('id', body.vendedor_id)
              .single();
            
            if (vendedor?.phone) {
              const msgVendedor = `📅 *NUEVA CITA AGENDADA*

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${body.lead_phone}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${citaHora}
📍 *Lugar:* ${body.property_name || 'Por confirmar'}
${gpsLink ? '🗺️ *Maps:* ' + gpsLink : ''}

Creada desde CRM`;
              
              const phoneVendedor = vendedor.phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneVendedor, msgVendedor);
              console.log('📤 Notificación enviada a vendedor:', vendedor.name);
            }
          } catch (e) {
            console.error('⚠️ Error notificando vendedor:', e);
          }
        }
        
        return corsResponse(JSON.stringify(data), 201);
      } catch (e: any) {
        console.error('❌ Error creando cita:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // Actualizar/Reagendar cita
    if (url.pathname.match(/^\/api\/appointments\/[^/]+$/) && request.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      const body = await request.json() as any;
      
      console.log('📅 Reagendando cita:', id, body);
      
      try {
        // Actualizar en DB primero
        const updateData: any = {};
        if (body.scheduled_date) updateData.scheduled_date = body.scheduled_date;
        if (body.scheduled_time) updateData.scheduled_time = body.scheduled_time;
        if (body.property_name) updateData.property_name = body.property_name;
        
        const { data, error } = await supabase.client
          .from('appointments')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Error DB:', error);
          throw error;
        }
        
        // ✅ FIX 14-ENE-2026: SIEMPRE sincronizar con Google Calendar si existe evento
        // Usar google_event_vendedor_id de la BD si no viene en el request
        const googleEventId = body.google_event_id || data.google_event_vendedor_id;
        const fechaActualizar = body.scheduled_date || data.scheduled_date;
        const horaActualizar = body.scheduled_time || data.scheduled_time;

        if (googleEventId && fechaActualizar && horaActualizar) {
          try {
            const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);

            // Parsear hora - quitar segundos si vienen (18:26:00 -> 18:26)
            let citaHora = horaActualizar.substring(0, 5);

            // Crear fecha en formato ISO para México
            const dateTimeStr = `${fechaActualizar}T${citaHora}:00`;

            await calendar.updateEvent(googleEventId, {
              start: { dateTime: dateTimeStr, timeZone: 'America/Mexico_City' },
              end: { dateTime: `${fechaActualizar}T${String(parseInt(citaHora.split(':')[0]) + 1).padStart(2, '0')}:${citaHora.split(':')[1]}:00`, timeZone: 'America/Mexico_City' },
              location: body.property_name || data.property_name || ''
            });
            console.log('📅 Google Calendar actualizado:', googleEventId, dateTimeStr);
          } catch (calError) {
            console.error('⚠️ Error Google Calendar (ignorado):', calError);
          }
        } else {
          console.error('⚠️ Cita sin google_event_vendedor_id, no se puede sincronizar con Google Calendar');
        }
        
        // Enviar notificaciones por WhatsApp si se solicitó
        if (body.notificar && body.lead_phone) {
          try {
            const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
            
            // Buscar GPS del desarrollo
            let gpsLink = '';
            if (body.property_name && body.property_name !== 'Oficinas Centrales') {
              const { data: prop } = await supabase.client
                .from('properties')
                .select('gps_link')
                .or(`development.ilike.%${body.property_name}%,name.ilike.%${body.property_name}%`)
                .limit(1)
                .single();
              if (prop?.gps_link) gpsLink = prop.gps_link;
            } else if (body.property_name === 'Oficinas Centrales') {
              gpsLink = 'https://maps.app.goo.gl/hUk6aH8chKef6NRY7';
            }
            
            // Formatear fecha bonita
            const fechaObj = new Date(body.scheduled_date + 'T12:00:00');
            const fechaFormateada = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            const horaFormateada = body.scheduled_time.substring(0, 5);
            
            // Obtener datos del vendedor para incluir en notificación al lead
            let vendedorPhone = '';
            let vendedorName = body.vendedor_name || '';
            if (body.vendedor_id) {
              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .eq('id', body.vendedor_id)
                .single();
              if (vendedor) {
                vendedorPhone = vendedor.phone || '';
                vendedorName = vendedor.name || vendedorName;
              }
            }
            
            // Formatear teléfono del vendedor para mostrar
            const vendedorPhoneDisplay = vendedorPhone ? vendedorPhone.replace(/^521/, '').replace(/^52/, '') : '';

            // Detectar si es llamada o cita presencial
            const esLlamada = body.appointment_type === 'llamada' || data.appointment_type === 'llamada';
            const tipoTitulo = esLlamada ? 'LLAMADA ACTUALIZADA' : 'CITA ACTUALIZADA';
            const tipoTexto = esLlamada ? 'llamada' : 'cita';

            // Notificar al cliente (con datos del vendedor)
            let msgCliente = `📞 *${tipoTitulo}*

Hola ${(body.lead_name || 'estimado cliente').split(' ')[0]} 👋

Tu ${tipoTexto} ha sido modificada:

📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

            // Solo mostrar ubicación para citas presenciales
            if (!esLlamada) {
              msgCliente += `
📍 *Lugar:* ${body.property_name || 'Por confirmar'}`;
              if (gpsLink) {
                msgCliente += `
🗺️ *Ubicación:* ${gpsLink}`;
              }
            }

            msgCliente += `
👤 *Tu asesor:* ${vendedorName || 'Por asignar'}`;
            if (vendedorPhoneDisplay) {
              msgCliente += `
📱 *Contacto:* ${vendedorPhoneDisplay}`;
            }

            msgCliente += esLlamada
              ? `\n\n¡Te contactaremos! 📞`
              : `\n\n¡Te esperamos! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log(`📤 Notificación de ${tipoTexto} enviada a cliente:`, body.lead_name);

            // Notificar al vendedor (con datos del lead)
            if (vendedorPhone) {
              // Formatear teléfono del lead para mostrar
              const leadPhoneDisplay = body.lead_phone ? body.lead_phone.replace(/^521/, '').replace(/^52/, '') : '';

              let msgVendedor = `📞 *${tipoTitulo.replace('ACTUALIZADA', 'EDITADA')}*

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${leadPhoneDisplay}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}`;

              if (!esLlamada) {
                msgVendedor += `
📍 *Lugar:* ${body.property_name || 'Por confirmar'}`;
                if (gpsLink) {
                  msgVendedor += `
🗺️ *Maps:* ${gpsLink}`;
                }
              }

              await meta.sendWhatsAppMessage(vendedorPhone, msgVendedor);
              console.log(`📤 Notificación de ${tipoTexto} enviada a vendedor:`, vendedorName);
            }
          } catch (notifError) {
            console.error('⚠️ Error enviando notificaciones:', notifError);
          }
        }
        
        console.log('✅ Cita actualizada:', id);
        return corsResponse(JSON.stringify(data));
      } catch (e: any) {
        console.error('❌ Error actualizando cita:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // API Routes - Mortgage Applications (Hipotecas)
    // ═══════════════════════════════════════════════════════════════
    if ((url.pathname === '/api/mortgages' || url.pathname === '/api/mortgage_applications') && request.method === 'GET') {
      const { data } = await supabase.client
        .from('mortgage_applications')
        .select('*')
        .order('created_at', { ascending: false });
      return corsResponse(JSON.stringify(data || []));
    }

    if ((url.pathname.match(/^\/api\/mortgages\/[^\/]+$/) || url.pathname.match(/^\/api\/mortgage_applications\/[^\/]+$/)) && request.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const { data } = await supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('id', id)
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    if ((url.pathname.match(/^\/api\/mortgages\/[^\/]+$/) || url.pathname.match(/^\/api\/mortgage_applications\/[^\/]+$/)) && request.method === 'PUT') {
      const id = url.pathname.split('/').pop();
      const body = await request.json() as any;

      console.log('🏦 Actualizando hipoteca:', id, body);

      // Extraer campos que NO van a la DB (solo para notificaciones)
      const changed_by_id = body.changed_by_id;
      const changed_by_name = body.changed_by_name;
      const previous_status = body.previous_status;
      delete body.changed_by_id;
      delete body.changed_by_name;
      delete body.previous_status;

      // Obtener datos anteriores para comparar
      const { data: oldMortgage } = await supabase.client
        .from('mortgage_applications')
        .select('*, lead_id')
        .eq('id', id)
        .single();

      // Actualizar registro
      body.updated_at = new Date().toISOString();
      const { data, error } = await supabase.client
        .from('mortgage_applications')
        .update(body)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('❌ Error actualizando hipoteca:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 400);
      }
      
      console.log('✅ Hipoteca actualizada:', data?.id, 'Status:', body.status);
      
      // Si cambió el status, notificar al vendedor del lead
      if (data && body.status && oldMortgage?.status !== body.status) {
        try {
          console.log('📤 Status cambió de', oldMortgage?.status, 'a', body.status);
          
          // Buscar el lead para obtener el vendedor
          const { data: lead } = await supabase.client
            .from('leads')
            .select('assigned_to, name')
            .eq('id', oldMortgage?.lead_id || data.lead_id)
            .single();
          
          console.log('👤 Lead encontrado:', lead?.name, 'Vendedor:', lead?.assigned_to);
          
          if (lead?.assigned_to) {
            const { data: vendedor } = await supabase.client
              .from('team_members')
              .select('name, phone')
              .eq('id', lead.assigned_to)
              .single();
            
            console.log('💬 Vendedor:', vendedor?.name, vendedor?.phone);
            
            if (vendedor?.phone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              
              const statusEmoji: Record<string, string> = {
                'pending': '⏳',
                'in_review': '📋',
                'sent_to_bank': '🏦',
                'approved': '✅',
                'rejected': '❌',
                'documents': '📄',
                'submitted': '📤',
                'funded': '💰'
              };

              const statusText: Record<string, string> = {
                'pending': 'Pendiente',
                'in_review': 'En revisión',
                'sent_to_bank': 'Enviado al banco',
                'approved': '¡APROBADO!',
                'rejected': 'Rechazado',
                'documents': 'Esperando documentos',
                'submitted': 'Enviado al banco',
                'funded': '¡Fondeado!'
              };
              
              const emoji = statusEmoji[body.status] || '📋';
              const texto = statusText[body.status] || body.status;

              // Usar changed_by_name si viene del CRM, si no usar assigned_advisor_name
              const quienMovio = changed_by_name || data.assigned_advisor_name || 'Sistema';

              const mensaje = `${emoji} *ACTUALIZACIÓN CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.lead_name || lead.name}
🏦 *Banco:* ${data.bank || 'No especificado'}
📊 *Nuevo status:* ${texto}
${previous_status ? `📋 *Anterior:* ${statusText[previous_status] || previous_status}` : ''}
${body.status_notes ? '📝 *Notas:* ' + body.status_notes : ''}
━━━━━━━━━━━━━━━━━━━━━
👤 *Movido por:* ${quienMovio}`;
              
              await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
              console.log('📤 Notificación de crédito enviada a vendedor:', vendedor.name);
            }
          }
        } catch (e) {
          console.error('⚠️ Error notificando vendedor sobre crédito:', e);
        }
      }
      
      return corsResponse(JSON.stringify(data || {}));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Properties
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/properties' && request.method === 'GET') {
      const { data } = await supabase.client
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });
      return corsResponse(JSON.stringify(data || []));
    }

    if (url.pathname.startsWith('/api/properties/') && request.method === 'GET') {
      const id = url.pathname.split('/')[3];
      const { data } = await supabase.client
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    if (url.pathname === '/api/properties' && request.method === 'POST') {
      const body = await request.json() as any;
      const { data } = await supabase.client
        .from('properties')
        .insert([body])
        .select()
        .single();
      return corsResponse(JSON.stringify(data), 201);
    }

    if (url.pathname.startsWith('/api/properties/') && request.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      const body = await request.json() as any;
      const { data } = await supabase.client
        .from('properties')
        .update(body)
        .eq('id', id)
        .select()
        .single();
      return corsResponse(JSON.stringify(data || {}));
    }

    // Endpoint para aplicar incremento mensual de precios (0.5%)
    if (url.pathname === '/api/properties/apply-monthly-increase' && request.method === 'POST') {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const { data: properties } = await supabase.client
        .from('properties')
        .select('id, name, price, development');

      if (!properties || properties.length === 0) {
        return corsResponse(JSON.stringify({ error: 'No properties found' }), 404);
      }

      const updates = [];
      const INCREASE_RATE = 1.005; // 0.5% mensual

      for (const prop of properties) {
        const oldPrice = prop.price;
        const newPrice = Math.round(oldPrice * INCREASE_RATE);

        await supabase.client
          .from('properties')
          .update({ price: newPrice })
          .eq('id', prop.id);

        updates.push({
          id: prop.id,
          name: prop.name,
          development: prop.development,
          oldPrice,
          newPrice,
          increase: newPrice - oldPrice
        });
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Precios actualizados: ${updates.length} propiedades (+0.5%)`,
        timestamp: new Date().toISOString(),
        updates
      }));
    }

    if (url.pathname === '/api/leads/deduplicate' || url.pathname.startsWith('/api/leads/deduplicate/')) {
      const authError = checkApiAuth(request, env);
      if (authError) return authError;

      const dedup = createLeadDeduplication();

      // POST /api/leads/deduplicate/check - Verificar si un lead es duplicado
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/check') {
        try {
          const body = await request.json() as any;

          if (!body.lead || !body.existingLeads) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "lead" y "existingLeads"'
            }), 400, 'application/json', request);
          }

          const match = dedup.checkForDuplicate(body.lead, body.existingLeads);

          return corsResponse(JSON.stringify({
            success: true,
            isDuplicate: !!match,
            match: match || null
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/find - Encontrar todos los duplicados
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/find') {
        try {
          const body = await request.json() as any;

          if (!body.leads || !Array.isArray(body.leads)) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "leads" como array'
            }), 400, 'application/json', request);
          }

          const duplicates = dedup.findDuplicates(body.leads);

          return corsResponse(JSON.stringify({
            success: true,
            count: duplicates.length,
            duplicates
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/stats - Estadísticas de duplicados
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/stats') {
        try {
          const body = await request.json() as any;

          if (!body.leads || !Array.isArray(body.leads)) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requiere el campo "leads" como array'
            }), 400, 'application/json', request);
          }

          const stats = dedup.getStats(body.leads);

          return corsResponse(JSON.stringify({
            success: true,
            stats
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/merge - Fusionar dos leads
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/merge') {
        try {
          const body = await request.json() as any;

          if (!body.primary || !body.secondary) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "primary" y "secondary" (objetos lead)'
            }), 400, 'application/json', request);
          }

          const result = dedup.mergeLeads(body.primary, body.secondary);

          return corsResponse(JSON.stringify({
            success: result.success,
            result
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }

      // POST /api/leads/deduplicate/sql - Generar SQL para fusionar
      if (request.method === 'POST' && url.pathname === '/api/leads/deduplicate/sql') {
        try {
          const body = await request.json() as any;

          if (!body.primaryId || !body.secondaryId) {
            return corsResponse(JSON.stringify({
              success: false,
              error: 'Se requieren los campos "primaryId" y "secondaryId"'
            }), 400, 'application/json', request);
          }

          const queries = dedup.generateMergeSQL(body.primaryId, body.secondaryId);

          return corsResponse(JSON.stringify({
            success: true,
            queries,
            warning: 'Revisar y ejecutar estas queries manualmente en Supabase'
          }, null, 2), 200, 'application/json', request);
        } catch (e) {
          return corsResponse(JSON.stringify({
            success: false,
            error: 'JSON inválido'
          }), 400, 'application/json', request);
        }
      }
    }

  // ═══════════════════════════════════════════════════════════
  // ERROR LOGS - View and manage system error logs
  // ═══════════════════════════════════════════════════════════

  // Test endpoint: write a test error and read it back
  if (url.pathname === '/api/test-error-log' && request.method === 'GET') {
    const authError = checkApiAuth(request, env);
    if (authError) return authError;

    const testId = `test-${Date.now()}`;
    await logErrorToDB(supabase, 'test_error', `Test error monitoring (${testId})`, {
      severity: 'warning',
      source: 'test:manual',
      stack: 'No stack - manual test',
      context: { test_id: testId, triggered_by: 'api' }
    });

    // Read back to verify
    const { data: errors, error } = await supabase.client
      .from('error_logs')
      .select('*')
      .eq('error_type', 'test_error')
      .order('created_at', { ascending: false })
      .limit(5);

    return corsResponse(JSON.stringify({
      success: !error,
      test_id: testId,
      written: !error,
      read_back: errors?.length || 0,
      latest: errors?.[0] || null,
      error: error?.message || null
    }), 200, 'application/json', request);
  }

  // Trigger error digest manually (sends WhatsApp to dev)
  if (url.pathname === '/api/test-error-digest' && request.method === 'GET') {
    const authError = checkApiAuth(request, env);
    if (authError) return authError;

    const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
    await enviarDigestoErroresDiario(supabase, meta);
    return corsResponse(JSON.stringify({ success: true, message: 'Digest triggered - check WhatsApp' }), 200, 'application/json', request);
  }

  if (url.pathname === '/api/error-logs' && request.method === 'GET') {
    const authError = checkApiAuth(request, env);
    if (authError) return authError;

    const days = parseInt(url.searchParams.get('days') || '7');
    const type = url.searchParams.get('type');
    const severity = url.searchParams.get('severity');
    const resolved = url.searchParams.get('resolved');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase.client
      .from('error_logs')
      .select('*')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) query = query.eq('error_type', type);
    if (severity) query = query.eq('severity', severity);
    if (resolved === 'true') query = query.eq('resolved', true);
    if (resolved === 'false') query = query.eq('resolved', false);

    const { data: errors, error } = await query;

    if (error) {
      return corsResponse(JSON.stringify({ error: error.message }), 500, 'application/json', request);
    }

    const stats = {
      total: errors?.length || 0,
      critical: errors?.filter((e: any) => e.severity === 'critical').length || 0,
      unresolved: errors?.filter((e: any) => !e.resolved).length || 0,
      by_type: {} as Record<string, number>
    };
    for (const err of (errors || [])) {
      stats.by_type[err.error_type] = (stats.by_type[err.error_type] || 0) + 1;
    }

    return corsResponse(JSON.stringify({ stats, errors }), 200, 'application/json', request);
  }

  // Mark error as resolved
  if (url.pathname.match(/^\/api\/error-logs\/[^/]+\/resolve$/) && request.method === 'POST') {
    const authError = checkApiAuth(request, env);
    if (authError) return authError;

    const errorId = url.pathname.split('/')[3];
    const { error } = await supabase.client
      .from('error_logs')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: 'admin' })
      .eq('id', errorId);

    if (error) {
      return corsResponse(JSON.stringify({ error: error.message }), 500, 'application/json', request);
    }

    return corsResponse(JSON.stringify({ success: true }), 200, 'application/json', request);
  }

  return null;
}
