import { SupabaseService } from './services/supabase';
import { ClaudeService } from './services/claude';

import { MetaWhatsAppService } from './services/meta-whatsapp';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
import { handleTeamRoutes } from './routes/team-routes';
import { handlePromotionRoutes } from './routes/promotions';
import { FollowupService } from './services/followupService';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  GEMINI_API_KEY: string;
}

function corsResponse(body: string | null, status: number = 200, contentType: string = 'application/json'): Response {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': contentType,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Asignación inteligente de vendedores
// ═══════════════════════════════════════════════════════════════════════════
interface TeamMemberAvailability {
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

function getAvailableVendor(vendedores: TeamMemberAvailability[]): TeamMemberAvailability | null {
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentDay = now.getDay(); // 0=Dom, 1=Lun, ... 6=Sab
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  // Filtrar vendedores activos
  const activos = vendedores.filter(v => v.active && v.role === 'vendedor');

  if (activos.length === 0) {
    console.log('⚠️ No hay vendedores activos');
    return null;
  }

  // Función para verificar si está disponible
  const estaDisponible = (v: TeamMemberAvailability): boolean => {
    // 1. Verificar vacaciones
    if (v.vacation_start && v.vacation_end) {
      if (today >= v.vacation_start && today <= v.vacation_end) {
        console.log(`🏖️ ${v.name} está de vacaciones`);
        return false;
      }
    }

    // 2. Verificar día laboral
    const workingDays = v.working_days || [1, 2, 3, 4, 5]; // Default L-V
    if (!workingDays.includes(currentDay)) {
      console.log(`📅 ${v.name} no trabaja hoy (día ${currentDay})`);
      return false;
    }

    // 3. Verificar horario (solo si está definido)
    if (v.work_start && v.work_end) {
      const [startH, startM] = v.work_start.split(':').map(Number);
      const [endH, endM] = v.work_end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentTimeMinutes < startMinutes || currentTimeMinutes > endMinutes) {
        console.log(`⏰ ${v.name} fuera de horario (${v.work_start}-${v.work_end})`);
        return false;
      }
    }

    return true;
  };

  // Separar en disponibles y de guardia
  const disponibles = activos.filter(estaDisponible);
  const deGuardia = disponibles.filter(v => v.is_on_duty);

  console.log(`📊 Asignación: ${activos.length} activos, ${disponibles.length} disponibles, ${deGuardia.length} de guardia`);

  // 1. Priorizar vendedores de guardia
  if (deGuardia.length > 0) {
    // Entre los de guardia, elegir el de menor ventas (round-robin)
    const elegido = deGuardia.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
    console.log(`🔥 Asignando a ${elegido.name} (de guardia, ${elegido.sales_count} ventas)`);
    return elegido;
  }

  // 2. Si hay disponibles, elegir el de menor ventas
  if (disponibles.length > 0) {
    const elegido = disponibles.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
    console.log(`✅ Asignando a ${elegido.name} (disponible, ${elegido.sales_count} ventas)`);
    return elegido;
  }

  // 3. Si nadie está disponible, asignar al de menor ventas de todos los activos (fallback)
  console.log('⚠️ Nadie disponible, usando fallback a activos');
  const fallback = activos.sort((a, b) => (a.sales_count || 0) - (b.sales_count || 0))[0];
  console.log(`⚠️ Fallback: ${fallback.name} (${fallback.sales_count} ventas)`);
  return fallback;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // ═══════════════════════════════════════════════════════════
    // API Routes - Team Members
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/api/team-members')) {
      const response = await handleTeamRoutes(request, env, supabase);
      if (response) return response;
    }


    // API Routes - Promotions
    if (url.pathname.startsWith("/api/promotions")) {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const response = await handlePromotionRoutes(request, url, supabase, meta);
      if (response) return response;
    }
    // ═══════════════════════════════════════════════════════════
    // Test Cron - Forzar verificación de videos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-cron' && request.method === 'GET') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      console.log('🔧 FORZANDO verificación de videos...');
      await verificarVideosPendientes(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Cron ejecutado' }));
    }

    if (url.pathname === "/test-briefing" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { data: yo } = await supabase.client.from("team_members").select("*").eq("phone", "5215610016226").single();
      if (yo) {
        await enviarBriefingMatutino(supabase, meta, yo);
        return corsResponse(JSON.stringify({ ok: true, message: "Briefing enviado a " + yo.name }));
      }
      return corsResponse(JSON.stringify({ ok: false, message: "Usuario no encontrado" }));
    }

    // ═══════════════════════════════════════════════════════════
    // DIAGNÓSTICO CRM - Ver datos para verificar comandos
    // ═══════════════════════════════════════════════════════════
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
        const statusScores: Record<string, number> = {
          'new': 10,
          'contacted': 20,
          'scheduled': 35,
          'visited': 50,
          'negotiation': 70,
          'reserved': 85,
          'closed': 100,
          'delivered': 100,
          'fallen': 0
        };
        newScore = statusScores[body.status] ?? newScore;
        
        // Temperatura basada en ETAPA, no score
        // HOT = negotiation, reserved (los que pueden cerrar pronto)
        // closed/delivered = CLIENTE (ya cerró)
        const etapasHot = ['negotiation', 'reserved'];
        const etapasCliente = ['closed', 'delivered'];
        
        if (etapasCliente.includes(body.status)) {
          body.temperature = 'CLIENTE';
        } else if (etapasHot.includes(body.status)) {
          body.temperature = 'HOT';
        } else if (newScore >= 35) {
          body.temperature = 'WARM';
        } else {
          body.temperature = 'COLD';
        }
        
        body.score = newScore;
        body.lead_score = newScore;
        body.lead_category = body.temperature;
        console.log('📊 Score actualizado:', newScore, 'Temp:', body.temperature);
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
          console.log('⚠️ Error notificando cambio de status:', e);
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
          console.log('⚠️ Error notificando:', e);
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
        console.log('❌ Error creando lead:', error);
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
        gpsLink = 'https://maps.google.com/?q=Grupo+Santa+Rita+Oficinas';
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
          console.log('⚠️ Error notificando vendedor:', e);
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
            console.log('⚠️ Error creando mortgage:', mortgageError);
          } else {
            console.log('📋 Mortgage creado:', mortgage?.id, 'Asesor:', asesorAsignado?.name || 'Sin asignar');
          }
          
          // Notificar al asesor si el usuario lo pidió
          if (body.enviar_a_asesor && asesorAsignado?.phone) {
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
            console.log('⚠️ No se encontró asesor para banco:', body.banco_preferido);
          }
        } catch (e) {
          console.log('⚠️ Error en proceso de crédito:', e);
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
            console.log('⚠️ Error creando appointment:', appointmentError);
          } else {
            console.log('📅 Appointment creado en CRM:', appointment?.id);
          }
          
        } catch (e) {
          console.log('⚠️ Error creando cita:', e);
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
          console.log('⚠️ Error notificando cliente:', e);
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
            console.log('⚠️ Error eliminando de Google Calendar:', calError);
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
          
          // Notificar al cliente
          if (appointment.lead_phone) {
            try {
              const msgCliente = `❌ *CITA CANCELADA*

Hola ${appointment.lead_name || ''} 👋

Tu cita ha sido cancelada:

📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}
📍 *Lugar:* ${appointment.property_name || ''}

Si deseas reagendar, contáctanos. ¡Estamos para servirte! 🏠`;
              
              const phoneCliente = appointment.lead_phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneCliente, msgCliente);
              console.log('📤 Notificación de cancelación enviada a cliente:', appointment.lead_name);
            } catch (e) {
              console.log('⚠️ Error notificando cliente:', e);
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
                const msgVendedor = `❌ *CITA CANCELADA*

👤 *Cliente:* ${appointment.lead_name}
📱 *Tel:* ${appointment.lead_phone}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}
📍 *Lugar:* ${appointment.property_name || ''}

Cancelada por: ${body.cancelled_by || 'CRM'}`;
                
                const phoneVendedor = vendedor.phone.replace(/[^0-9]/g, '');
                await meta.sendWhatsAppMessage(phoneVendedor, msgVendedor);
                console.log('📤 Notificación de cancelación enviada a vendedor:', vendedor.name);
              }
            } catch (e) {
              console.log('⚠️ Error notificando vendedor:', e);
            }
          }
        }
        
        return corsResponse(JSON.stringify(data));
      } catch (e: any) {
        console.log('❌ Error cancelando cita:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
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

            // Preparar variables del template appointment_confirmation_1
            // Template: ¡Hola {{1}}! Tu cita para visita a {{2}} el {{3}} a las {{4}} está confirmada.
            const templateComponents = [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: body.lead_name || 'cliente' },           // {{1}} Nombre
                  { type: 'text', text: body.property_name || 'nuestras oficinas' }, // {{2}} Desarrollo
                  { type: 'text', text: fechaFormateada },                        // {{3}} Fecha
                  { type: 'text', text: citaHora }                                // {{4}} Hora
                ]
              }
            ];

            await meta.sendTemplate(phoneCliente, 'appointment_confirmation_1', 'es', templateComponents);
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
            console.log('⚠️ Error enviando template:', e);
            // Fallback: enviar mensaje normal si falla el template
            try {
              const msgCliente = `📅 *CITA CONFIRMADA*\n\n¡Hola ${body.lead_name || ''}! 👋\n\nTu cita ha sido agendada:\n\n📆 *Fecha:* ${fechaFormateada}\n🕐 *Hora:* ${citaHora}\n📍 *Lugar:* ${body.property_name || 'Por confirmar'}\n${gpsLink ? '🗺️ *Ubicación:* ' + gpsLink : ''}\n👤 *Te atenderá:* ${body.vendedor_name || 'Un asesor'}\n\n¡Te esperamos! 🏠`;
              const phoneCliente = body.lead_phone.replace(/[^0-9]/g, '');
              await meta.sendWhatsAppMessage(phoneCliente, msgCliente);
              confirmationSent = true;
            } catch (e2) {
              console.log('⚠️ Error fallback mensaje:', e2);
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
            console.log('⚠️ Error notificando vendedor:', e);
          }
        }
        
        return corsResponse(JSON.stringify(data), 201);
      } catch (e: any) {
        console.log('❌ Error creando cita:', e);
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
          console.log('❌ Error DB:', error);
          throw error;
        }
        
        // Si hay google_event_id, intentar actualizar en Google Calendar
        if (body.google_event_id && body.scheduled_date && body.scheduled_time) {
          try {
            const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
            
            // Parsear hora - quitar segundos si vienen (18:26:00 -> 18:26)
            let citaHora = body.scheduled_time.substring(0, 5);
            
            // Crear fecha en formato ISO para México
            const dateTimeStr = `${body.scheduled_date}T${citaHora}:00`;
            
            await calendar.updateEvent(body.google_event_id, {
              start: { dateTime: dateTimeStr, timeZone: 'America/Mexico_City' },
              end: { dateTime: `${body.scheduled_date}T${String(parseInt(citaHora.split(':')[0]) + 1).padStart(2, '0')}:${citaHora.split(':')[1]}:00`, timeZone: 'America/Mexico_City' },
              location: body.property_name || ''
            });
            console.log('📅 Google Calendar actualizado:', body.google_event_id, dateTimeStr);
          } catch (calError) {
            console.log('⚠️ Error Google Calendar (ignorado):', calError);
          }
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
              gpsLink = 'https://maps.google.com/?q=Grupo+Santa+Rita+Oficinas';
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
            
            // Notificar al cliente (con datos del vendedor)
            const msgCliente = `📅 *CITA ACTUALIZADA*

Hola ${(body.lead_name || 'estimado cliente').split(' ')[0]} 👋

Tu cita ha sido modificada:

📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}
📍 *Lugar:* ${body.property_name || 'Por confirmar'}
${gpsLink ? '🗺️ *Ubicación:* ' + gpsLink + '\n' : ''}
👤 *Tu asesor:* ${vendedorName || 'Por asignar'}
${vendedorPhoneDisplay ? '📱 *Contacto:* ' + vendedorPhoneDisplay : ''}

¡Te esperamos! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log('📤 Notificación enviada a cliente:', body.lead_name);
            
            // Notificar al vendedor (con datos del lead)
            if (vendedorPhone) {
              // Formatear teléfono del lead para mostrar
              const leadPhoneDisplay = body.lead_phone ? body.lead_phone.replace(/^521/, '').replace(/^52/, '') : '';
              
              const msgVendedor = `📅 *CITA EDITADA*

👤 *Cliente:* ${body.lead_name}
📱 *Tel:* ${leadPhoneDisplay}
📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}
📍 *Lugar:* ${body.property_name || 'Por confirmar'}
${gpsLink ? '🗺️ *Maps:* ' + gpsLink : ''}`;

              await meta.sendWhatsAppMessage(vendedorPhone, msgVendedor);
              console.log('📤 Notificación enviada a vendedor:', vendedorName);
            }
          } catch (notifError) {
            console.log('⚠️ Error enviando notificaciones:', notifError);
          }
        }
        
        console.log('✅ Cita actualizada:', id);
        return corsResponse(JSON.stringify(data));
      } catch (e: any) {
        console.log('❌ Error actualizando cita:', e);
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
        console.log('❌ Error actualizando hipoteca:', error);
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
              const quienMovio = body.changed_by_name || data.assigned_advisor_name || 'Sistema';

              const mensaje = `${emoji} *ACTUALIZACIÓN CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.lead_name || lead.name}
🏦 *Banco:* ${data.bank || 'No especificado'}
📊 *Nuevo status:* ${texto}
${body.previous_status ? `📋 *Anterior:* ${statusText[body.previous_status] || body.previous_status}` : ''}
${body.status_notes ? '📝 *Notas:* ' + body.status_notes : ''}
━━━━━━━━━━━━━━━━━━━━━
👤 *Movido por:* ${quienMovio}`;
              
              await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
              console.log('📤 Notificación de crédito enviada a vendedor:', vendedor.name);
            }
          }
        } catch (e) {
          console.log('⚠️ Error notificando vendedor sobre crédito:', e);
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

    // ═══════════════════════════════════════════════════════════
    // API Routes - Dashboard
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/dashboard/kpis' && request.method === 'GET') {
      const { data: leads } = await supabase.client.from('leads').select('*');
      const kpis = {
        total: leads?.length || 0,
        new: leads?.filter((l: any) => l.status === 'new').length || 0,
        contacted: leads?.filter((l: any) => l.status === 'contacted').length || 0,
        qualified: leads?.filter((l: any) => l.status === 'qualified').length || 0,
        appointment_scheduled: leads?.filter((l: any) => l.status === 'appointment_scheduled').length || 0,
        converted: leads?.filter((l: any) => l.status === 'converted').length || 0
      };
      return corsResponse(JSON.stringify(kpis));
    }

    // ═══════════════════════════════════════════════════════════
    // API Routes - Reportes CEO (Diario, Semanal, Mensual)
    // ═══════════════════════════════════════════════════════════

    // REPORTE DIARIO
    if (url.pathname === '/api/reportes/diario' && request.method === 'GET') {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

      const { data: leadsAyer } = await supabase.client.from('leads').select('*').gte('created_at', inicioAyer).lt('created_at', inicioHoy);
      const { data: leadsHoy } = await supabase.client.from('leads').select('*').gte('created_at', inicioHoy);
      const { data: cierresAyer } = await supabase.client.from('leads').select('*').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy);
      const hoyStr = hoy.toISOString().split('T')[0];
      const { data: citasHoy } = await supabase.client.from('appointments').select('*, leads(name, phone)').eq('scheduled_date', hoyStr);
      const { data: leadsHot } = await supabase.client.from('leads').select('*').in('status', ['negotiation', 'reserved']);
      const limiteFrio = new Date(hoy); limiteFrio.setDate(limiteFrio.getDate() - 1);
      const { data: estancados } = await supabase.client.from('leads').select('*').eq('status', 'new').lt('created_at', limiteFrio.toISOString());

      return corsResponse(JSON.stringify({
        fecha: hoyStr,
        periodo: 'diario',
        ayer: {
          leads_nuevos: leadsAyer?.length || 0,
          cierres: cierresAyer?.length || 0,
          leads: leadsAyer?.map((l: any) => ({ id: l.id, name: l.name, source: l.source, status: l.status })) || []
        },
        hoy: {
          leads_nuevos: leadsHoy?.length || 0,
          citas_agendadas: citasHoy?.filter((c: any) => c.status === 'scheduled').length || 0,
          citas: citasHoy?.map((c: any) => ({
            id: c.id,
            hora: c.scheduled_time,
            lead: c.leads?.name || c.lead_name,
            desarrollo: c.property_interest,
            status: c.status
          })) || []
        },
        pipeline: {
          leads_hot: leadsHot?.length || 0,
          leads_estancados: estancados?.length || 0,
          hot_detalle: leadsHot?.map((l: any) => ({ id: l.id, name: l.name, status: l.status, phone: l.phone })) || [],
          estancados_detalle: estancados?.map((l: any) => ({ id: l.id, name: l.name, created_at: l.created_at, phone: l.phone })) || []
        }
      }));
    }

    // REPORTE SEMANAL
    if (url.pathname === '/api/reportes/semanal' && request.method === 'GET') {
      const hoy = new Date();
      const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7);

      const { data: leadsSemana } = await supabase.client.from('leads').select('*').gte('created_at', inicioSemana.toISOString());
      const { data: cierresSemana } = await supabase.client.from('leads').select('*, properties(price, name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString());
      const { data: citasSemana } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]).lte('scheduled_date', hoy.toISOString().split('T')[0]);
      const { data: vendedores } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true).order('sales_count', { ascending: false });

      let revenue = 0;
      if (cierresSemana) {
        for (const cierre of cierresSemana as any[]) { revenue += cierre.properties?.price || 2000000; }
      }

      const fuenteCount: Record<string, number> = {};
      if (leadsSemana) {
        for (const l of leadsSemana as any[]) { const fuente = l.source || 'Desconocido'; fuenteCount[fuente] = (fuenteCount[fuente] || 0) + 1; }
      }

      const citasCompletadas = citasSemana?.filter((c: any) => c.status === 'completed').length || 0;
      const conversionRate = leadsSemana && leadsSemana.length > 0 ? Math.round((cierresSemana?.length || 0) / leadsSemana.length * 100) : 0;

      return corsResponse(JSON.stringify({
        periodo: 'semanal',
        fecha_inicio: inicioSemana.toISOString().split('T')[0],
        fecha_fin: hoy.toISOString().split('T')[0],
        resumen: {
          leads_nuevos: leadsSemana?.length || 0,
          citas_realizadas: citasCompletadas,
          citas_totales: citasSemana?.length || 0,
          cierres: cierresSemana?.length || 0,
          revenue: revenue,
          revenue_formatted: `$${(revenue/1000000).toFixed(1)}M`
        },
        conversion: {
          lead_a_cierre: conversionRate,
          insight: conversionRate >= 5 ? 'Conversión saludable' : 'Conversión baja - revisar seguimiento'
        },
        ranking_vendedores: vendedores?.slice(0, 5).map((v: any) => ({
          name: v.name,
          ventas: v.sales_count || 0,
          citas: v.appointments_count || 0
        })) || [],
        fuentes: Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).map(([fuente, count]) => ({ fuente, leads: count })),
        cierres_detalle: cierresSemana?.map((c: any) => ({
          lead: c.name,
          propiedad: c.properties?.name,
          precio: c.properties?.price
        })) || []
      }));
    }

    // REPORTE MENSUAL
    if (url.pathname === '/api/reportes/mensual' && request.method === 'GET') {
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
      const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 0);

      const { data: leadsMes } = await supabase.client.from('leads').select('*').gte('created_at', inicioMes.toISOString()).lte('created_at', finMes.toISOString());
      const { data: leadsMesAnterior } = await supabase.client.from('leads').select('*').gte('created_at', mesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString());
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price, name, development)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes.toISOString()).lte('status_changed_at', finMes.toISOString());
      const { data: citasMes } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMes.toISOString().split('T')[0]).lte('scheduled_date', finMes.toISOString().split('T')[0]);
      const { data: vendedores } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true).order('sales_count', { ascending: false });

      let revenue = 0;
      const desarrolloCount: Record<string, { count: number, revenue: number }> = {};
      if (cierresMes) {
        for (const cierre of cierresMes as any[]) {
          const precio = cierre.properties?.price || 2000000;
          revenue += precio;
          const dev = cierre.properties?.development || 'Otro';
          if (!desarrolloCount[dev]) desarrolloCount[dev] = { count: 0, revenue: 0 };
          desarrolloCount[dev].count++;
          desarrolloCount[dev].revenue += precio;
        }
      }

      const fuenteCount: Record<string, number> = {};
      if (leadsMes) {
        for (const l of leadsMes as any[]) { const fuente = l.source || 'Desconocido'; fuenteCount[fuente] = (fuenteCount[fuente] || 0) + 1; }
      }

      const citasCompletadas = citasMes?.filter((c: any) => c.status === 'completed').length || 0;
      const conversionRate = leadsMes && leadsMes.length > 0 ? Math.round((cierresMes?.length || 0) / leadsMes.length * 100) : 0;
      const crecimientoLeads = leadsMesAnterior && leadsMesAnterior.length > 0 ? Math.round(((leadsMes?.length || 0) - leadsMesAnterior.length) / leadsMesAnterior.length * 100) : 0;

      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

      return corsResponse(JSON.stringify({
        periodo: 'mensual',
        mes: meses[inicioMes.getMonth()],
        año: inicioMes.getFullYear(),
        fecha_inicio: inicioMes.toISOString().split('T')[0],
        fecha_fin: finMes.toISOString().split('T')[0],
        resumen: {
          leads_nuevos: leadsMes?.length || 0,
          leads_mes_anterior: leadsMesAnterior?.length || 0,
          crecimiento_leads: crecimientoLeads,
          citas_realizadas: citasCompletadas,
          citas_totales: citasMes?.length || 0,
          cierres: cierresMes?.length || 0,
          revenue: revenue,
          revenue_formatted: `$${(revenue/1000000).toFixed(1)}M`
        },
        conversion: {
          lead_a_cita: citasMes && leadsMes ? Math.round((citasMes.length / leadsMes.length) * 100) : 0,
          cita_a_cierre: citasCompletadas > 0 ? Math.round(((cierresMes?.length || 0) / citasCompletadas) * 100) : 0,
          lead_a_cierre: conversionRate
        },
        ranking_vendedores: vendedores?.slice(0, 10).map((v: any, i: number) => ({
          posicion: i + 1,
          name: v.name,
          ventas: v.sales_count || 0,
          citas: v.appointments_count || 0,
          revenue: (v.sales_count || 0) * 2000000
        })) || [],
        desarrollos: Object.entries(desarrolloCount).sort((a, b) => b[1].revenue - a[1].revenue).map(([dev, data]) => ({
          desarrollo: dev,
          ventas: data.count,
          revenue: data.revenue,
          revenue_formatted: `$${(data.revenue/1000000).toFixed(1)}M`
        })),
        fuentes: Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).map(([fuente, count]) => ({ fuente, leads: count })),
        cierres_detalle: cierresMes?.map((c: any) => ({
          lead: c.name,
          propiedad: c.properties?.name,
          desarrollo: c.properties?.development,
          precio: c.properties?.price,
          precio_formatted: `$${((c.properties?.price || 0)/1000000).toFixed(1)}M`
        })) || []
      }));
    }


    // ═══════════════════════════════════════════════════════════
    // Endpoint de prueba - Enviar TEMPLATE
    // Endpoint para ver templates aprobados de Meta
    if (url.pathname === '/api/templates' && request.method === 'GET') {
      try {
        // Obtener WABA ID desde el phone number
        const wabaUrl = `https://graph.facebook.com/v22.0/${env.META_PHONE_NUMBER_ID}?fields=whatsapp_business_account{id,name,message_template_namespace}`;
        const wabaResp = await fetch(wabaUrl, {
          headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` }
        });
        const wabaData = await wabaResp.json() as any;
        const wabaId = wabaData?.whatsapp_business_account?.id;

        let templatesData = null;
        if (wabaId) {
          // Obtener templates del WABA
          const templatesUrl = `https://graph.facebook.com/v22.0/${wabaId}/message_templates?fields=name,status,language,components`;
          const templatesResp = await fetch(templatesUrl, {
            headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` }
          });
          templatesData = await templatesResp.json();
        }

        return corsResponse(JSON.stringify({
          waba_info: wabaData,
          waba_id: wabaId,
          templates: templatesData
        }, null, 2));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Debug endpoint - probar con diferentes configuraciones de template
    if (url.pathname === '/api/test-send' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const phone = body.phone?.replace(/\D/g, '').slice(-10);

        // Construir payload manualmente para ver exactamente qué enviamos
        const phoneNormalized = phone.startsWith('52') && phone.length === 10 ? '521' + phone :
                               phone.length === 10 ? '521' + phone : phone;

        const url = `https://graph.facebook.com/v22.0/${env.META_PHONE_NUMBER_ID}/messages`;

        // Template tiene 5 parametros segun error de Meta
        // Probablemente: nombre, desarrollo, fecha, hora, direccion/vendedor
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNormalized,
          type: 'template',
          template: {
            name: 'appointment_confirmation_1',
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: body.nombre || 'Cliente' },
                  { type: 'text', text: body.desarrollo || 'Santa Rita' },
                  { type: 'text', text: body.fecha || '10 de enero' },
                  { type: 'text', text: body.hora || '5:00 PM' },
                  { type: 'text', text: body.extra || 'Santa Rita Residencial' }
                ]
              }
            ]
          }
        };

        console.log('📤 DEBUG - Enviando template:', JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('📥 DEBUG - Respuesta Meta:', JSON.stringify(result, null, 2));

        // Si el template se envió correctamente, actualizar el lead
        let leadUpdateResult = null;
        if (response.ok) {
          try {
            const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
            // Buscar lead por teléfono (últimos 10 dígitos)
            const searchPhone = phone.slice(-10);
            console.log('🔍 Buscando lead con phone que contenga:', searchPhone);

            const { data: existingLead, error: searchError } = await supabase.client
              .from('leads')
              .select('*')
              .ilike('phone', `%${searchPhone}%`)
              .single();

            console.log('🔍 Resultado búsqueda:', existingLead?.name || 'No encontrado', searchError?.message || '');

            if (existingLead) {
              // Actualizar lead existente - solo template_sent
              const { error: updateError } = await supabase.client.from('leads').update({
                template_sent: 'appointment_confirmation',
                template_sent_at: new Date().toISOString()
              }).eq('id', existingLead.id);

              leadUpdateResult = updateError ? `Error: ${updateError.message}` : `Lead ${existingLead.name} actualizado`;
              console.log('✅ Lead actualizado con template_sent:', existingLead.name, updateError || '');
            } else {
              // Crear nuevo lead
              const { error: insertError } = await supabase.client.from('leads').insert({
                phone: phoneNormalized,
                name: body.nombre || 'Lead Test',
                source: 'test_template',
                template_sent: 'appointment_confirmation',
                template_sent_at: new Date().toISOString()
              });
              leadUpdateResult = insertError ? `Error: ${insertError.message}` : 'Nuevo lead creado';
              console.log('✅ Nuevo lead creado con template_sent', insertError || '');
            }
          } catch (dbError: any) {
            leadUpdateResult = `DB Error: ${dbError.message}`;
            console.error('❌ Error actualizando lead:', dbError);
          }
        }

        return new Response(JSON.stringify({
          success: response.ok,
          payload_sent: payload,
          result,
          lead_update: leadUpdateResult
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST SARA - Probar respuestas sin enviar WhatsApp
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/test-sara' && request.method === 'POST') {
      try {
        const body = await request.json() as { mensaje: string, telefono?: string, nombre?: string };
        const mensaje = body.mensaje || 'Hola';
        const telefono = body.telefono || '5214921234567';
        const nombre = body.nombre || null;

        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        // Buscar o crear lead de prueba
        const phoneClean = telefono.replace(/\D/g, '').slice(-10);
        let { data: lead } = await supabase.client
          .from('leads')
          .select('*')
          .ilike('phone', `%${phoneClean}%`)
          .single();

        // Si no existe, usar datos simulados
        if (!lead) {
          lead = {
            id: 'test-lead-id',
            name: nombre || 'Lead de Prueba',
            phone: telefono,
            status: 'new',
            conversation_history: [],
            asesor_notificado: false,
            resources_sent: false
          };
        }

        // Obtener propiedades y team members (sin filtrar por active para test)
        const { data: properties } = await supabase.client.from('properties').select('*');
        const { data: teamMembers } = await supabase.client.from('team_members').select('*');

        // Crear handler pero SIN enviar mensajes
        const handler = new WhatsAppHandler(supabase, env);

        // Simular análisis con Claude (usar el método interno)
        const claude = new ClaudeService(env.ANTHROPIC_API_KEY);

        // Construir catálogo simplificado
        let catalogo = '\\n═══ DESARROLLOS DISPONIBLES ═══\\n';
        const devMap = new Map<string, any[]>();
        (properties || []).forEach((p: any) => {
          const dev = p.development || 'Otros';
          if (!devMap.has(dev)) devMap.set(dev, []);
          devMap.get(dev)!.push(p);
        });
        devMap.forEach((props, dev) => {
          const precios = props.filter((p: any) => p.price > 0).map((p: any) => p.price);
          if (precios.length > 0) {
            const min = Math.min(...precios);
            const max = Math.max(...precios);
            catalogo += `• ${dev}: $${(min/1000000).toFixed(1)}M - $${(max/1000000).toFixed(1)}M\\n`;
          }
        });

        // System prompt para test
        const systemPrompt = `Eres SARA, asesora inmobiliaria de Grupo Santa Rita en Zacatecas.
Responde de forma amigable y profesional.

CATÁLOGO:
${catalogo}

ESTÁNDARES MEXICANOS:
- Enganche: 10-20%
- Escrituración: 4-7%
- INFONAVIT: 1080 puntos, 130 semanas
- FOVISSSTE: 18 meses

Responde en JSON:
{
  "intent": "saludo|info_desarrollo|credito|cita|otro",
  "response": "tu respuesta aquí",
  "extracted_data": {}
}`;

        const userContext = `Cliente: ${lead.name || 'No proporcionado'}
Mensaje: ${mensaje}`;

        const aiResponse = await claude.chat([], userContext, systemPrompt);

        let parsed: any = { response: aiResponse, intent: 'unknown' };
        try {
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          parsed = { response: aiResponse, intent: 'parse_error' };
        }

        // Simular acciones que se ejecutarían
        const acciones: string[] = [];
        const intent = parsed.intent || 'unknown';
        const datos = parsed.extracted_data || {};

        // Detectar desarrollo mencionado
        const desarrollos = ['Monte Verde', 'Los Encinos', 'Distrito Falco', 'Miravalle', 'Andes', 'Monte Real'];
        const desarrolloMencionado = desarrollos.find(d =>
          mensaje.toLowerCase().includes(d.toLowerCase()) ||
          (parsed.response || '').toLowerCase().includes(d.toLowerCase())
        );

        // Acciones según intent
        if (intent === 'cita' || mensaje.toLowerCase().includes('visitar') || mensaje.toLowerCase().includes('cita')) {
          acciones.push('📅 AGENDAR CITA - Pediría fecha y hora');
          if (desarrolloMencionado) {
            acciones.push(`🏠 Desarrollo: ${desarrolloMencionado}`);
          }
        }

        if (intent === 'credito' || mensaje.toLowerCase().includes('infonavit') || mensaje.toLowerCase().includes('credito')) {
          acciones.push('💳 FLUJO CRÉDITO - Preguntaría por banco, ingreso, enganche');
          acciones.push('👨‍💼 Podría notificar al ASESOR VIP');
        }

        if (intent === 'info_desarrollo' || desarrolloMencionado) {
          acciones.push('📹 ENVIAR RECURSOS:');
          if (desarrolloMencionado) {
            // Buscar propiedades del desarrollo CON recursos
            const propsDelDev = (properties || []).filter((p: any) =>
              p.development?.toLowerCase().includes(desarrolloMencionado.toLowerCase())
            );
            const propConVideo = propsDelDev.find((p: any) => p.youtube_link);
            const propConMatterport = propsDelDev.find((p: any) => p.matterport_link);

            if (propConVideo?.youtube_link) {
              acciones.push(`  • Video YouTube: ${propConVideo.youtube_link.substring(0, 50)}...`);
            }
            if (propConMatterport?.matterport_link) {
              acciones.push(`  • Matterport 3D: ${propConMatterport.matterport_link.substring(0, 50)}...`);
            }
            if (!propConVideo && !propConMatterport) {
              acciones.push(`  • (No hay recursos en DB para ${desarrolloMencionado})`);
            }
          }
        }

        if (mensaje.toLowerCase().includes('vendedor') || mensaje.toLowerCase().includes('persona real') || mensaje.toLowerCase().includes('llamar')) {
          acciones.push('📞 CONTACTAR VENDEDOR - Notificaría al equipo de ventas');
        }

        if (datos.presupuesto || mensaje.match(/\d+\s*(mil|millon)/i)) {
          acciones.push(`💰 Presupuesto detectado: ${datos.presupuesto || 'Ver mensaje'}`);
        }

        if (datos.recamaras || mensaje.match(/\d+\s*rec/i)) {
          acciones.push(`🛏️ Recámaras: ${datos.recamaras || 'Ver mensaje'}`);
        }

        if (acciones.length === 0) {
          acciones.push('💬 Solo respuesta de texto (sin acciones adicionales)');
        }

        return corsResponse(JSON.stringify({
          success: true,
          test_mode: true,
          mensaje_enviado: mensaje,
          lead_encontrado: !!lead?.id && lead.id !== 'test-lead-id',
          lead_info: {
            nombre: lead.name,
            telefono: lead.phone,
            status: lead.status
          },
          sara_responderia: parsed.response || aiResponse,
          intent_detectado: intent,
          datos_extraidos: datos,
          acciones_que_ejecutaria: acciones,
          nota: '⚠️ Modo TEST - No se envió mensaje real por WhatsApp'
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), 500);
      }
    }

    // Webhook WhatsApp (Meta)
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/meta' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      
      if (mode === 'subscribe' && token === 'sara_verify_token') {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname === '/webhook/meta' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;

        if (messages && messages.length > 0) {
          const message = messages[0];
          const from = message.from;
          const text = message.text?.body || '';

          const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);

          await handler.handleIncomingMessage(`whatsapp:+${from}`, text, env);

          // Cancelar follow-ups cuando el lead responde
          const followupService = new FollowupService(supabase);
          await followupService.cancelarPorRespuesta('', from);
        }

        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Meta Webhook Error:', error);
        return new Response('OK', { status: 200 });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Webhook Facebook Lead Ads - Recibir leads de Meta Ads
    // ═══════════════════════════════════════════════════════════════
    
    if (url.pathname === '/webhook/facebook-leads' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      
      if (mode === 'subscribe' && token === 'sara_fb_leads_token') {
        console.log('✅ Facebook Leads webhook verified');
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname === '/webhook/facebook-leads' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        console.log('🔥 Facebook Lead recibido:', JSON.stringify(body));

        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];

        // Facebook Lead Ads envía el campo "leadgen_id"
        if (changes?.field === 'leadgen' && changes?.value?.leadgen_id) {
          const leadgenId = changes.value.leadgen_id;
          const formId = changes.value.form_id;
          const pageId = changes.value.page_id;
          const createdTime = changes.value.created_time;

          console.log(`🎯 Nuevo lead de Facebook: ${leadgenId}`);

          // Obtener datos reales del lead desde Graph API
          let leadName = `Facebook Lead ${leadgenId.slice(-6)}`;
          let leadPhone = '';
          let leadEmail = '';
          let leadNotes = '';

          try {
            const graphResponse = await fetch(
              `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${env.META_ACCESS_TOKEN}`
            );

            if (graphResponse.ok) {
              const leadData = await graphResponse.json() as any;
              console.log('📋 Datos del lead:', JSON.stringify(leadData));

              // Parsear field_data del formulario
              if (leadData.field_data) {
                for (const field of leadData.field_data) {
                  const fieldName = field.name?.toLowerCase() || '';
                  const fieldValue = field.values?.[0] || '';

                  if (fieldName.includes('name') || fieldName.includes('nombre')) {
                    leadName = fieldValue || leadName;
                  } else if (fieldName.includes('phone') || fieldName.includes('tel') || fieldName.includes('whatsapp') || fieldName.includes('celular')) {
                    leadPhone = fieldValue.replace(/\D/g, ''); // Solo números
                    // Agregar 521 si es número mexicano de 10 dígitos
                    if (leadPhone.length === 10) {
                      leadPhone = '521' + leadPhone;
                    }
                  } else if (fieldName.includes('email') || fieldName.includes('correo')) {
                    leadEmail = fieldValue;
                  } else {
                    // Otros campos van a notas
                    leadNotes += `${field.name}: ${fieldValue}\n`;
                  }
                }
              }
            } else {
              console.error('❌ Error obteniendo datos de Graph API:', await graphResponse.text());
            }
          } catch (graphError) {
            console.error('❌ Error llamando Graph API:', graphError);
          }

          // Verificar si el lead ya existe (por teléfono o leadgen_id)
          let existingLead = null;
          if (leadPhone) {
            const { data: byPhone } = await supabase.client
              .from('leads')
              .select('*')
              .eq('phone', leadPhone)
              .single();
            existingLead = byPhone;
          }

          if (existingLead) {
            console.log(`⚠️ Lead ya existe: ${existingLead.id}`);
            // Actualizar con datos de Facebook si es más reciente
            await supabase.client.from('leads').update({
              source: 'facebook_ads',
              notes: `${existingLead.notes || ''}\n---\nActualizado desde Facebook Lead ${leadgenId} el ${new Date().toLocaleString('es-MX')}`
            }).eq('id', existingLead.id);

            return new Response('OK', { status: 200 });
          }

          // Buscar vendedor usando asignación inteligente
          const { data: todosVendedores } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('active', true);

          const vendedorAsignado = getAvailableVendor(todosVendedores || []);

          // Crear lead con datos reales
          const { data: nuevoLead, error } = await supabase.client
            .from('leads')
            .insert({
              name: leadName,
              phone: leadPhone || null,
              email: leadEmail || null,
              source: 'facebook_ads',
              status: 'new',
              score: 65, // Score alto porque viene de ads pagados
              temperature: 'WARM',
              assigned_to: vendedorAsignado?.id || null,
              notes: `Lead de Facebook Ads\n${leadNotes}\n---\nLeadgen ID: ${leadgenId}\nForm ID: ${formId}\nPage ID: ${pageId}`
            })
            .select()
            .single();

          if (error) {
            console.error('Error creando lead de Facebook:', error);
          } else {
            console.log(`✅ Lead creado: ${nuevoLead.id} - ${leadName}`);

            // Notificar al vendedor asignado
            if (vendedorAsignado?.phone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              await meta.sendWhatsAppMessage(vendedorAsignado.phone,
                `🎯 *NUEVO LEAD DE FACEBOOK*\n\n` +
                `👤 *${leadName}*\n` +
                (leadPhone ? `📱 ${leadPhone}\n` : '') +
                (leadEmail ? `📧 ${leadEmail}\n` : '') +
                `\n⏰ ${new Date(createdTime * 1000).toLocaleString('es-MX')}\n\n` +
                `💡 _Contacta al cliente lo antes posible_`
              );
            }

            // ENVIAR TEMPLATE DE BIENVENIDA AL LEAD (fuera de ventana 24h)
            if (leadPhone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              const primerNombre = leadName.split(' ')[0];

              try {
                // Template: bienvenida_lead_facebook con 1 variable (nombre)
                const templateComponents = [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: primerNombre }
                    ]
                  }
                ];

                await meta.sendTemplate(leadPhone, 'bienvenida_lead_facebook', 'es', templateComponents);
                console.log(`✅ Template bienvenida enviado a lead de Facebook: ${leadPhone}`);

                // Marcar que se envió template (SARA se activa cuando responda)
                await supabase.client.from('leads').update({
                  template_sent: 'bienvenida_lead_facebook',
                  template_sent_at: new Date().toISOString()
                }).eq('id', nuevoLead.id);

              } catch (templateError) {
                console.error('⚠️ Error enviando template de bienvenida:', templateError);
                // Si falla el template, al menos el lead ya está creado y el vendedor notificado
              }
            }
          }
        }

        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Facebook Leads Webhook Error:', error);
        return new Response('OK', { status: 200 });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Webhook Google Calendar - Sincronizar cambios Google → CRM
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/google-calendar' && request.method === 'POST') {
      try {
        const channelId = request.headers.get('X-Goog-Channel-ID');
        const resourceState = request.headers.get('X-Goog-Resource-State');
        
        console.log('📅 Google Calendar Webhook:', resourceState, channelId);
        
        // Solo procesar si hay cambios (no sync inicial)
        if (resourceState === 'exists' || resourceState === 'update') {
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          
          // Obtener eventos de las últimas 24 horas y próximos 30 días
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          
          const events = await calendar.getEvents(yesterday.toISOString(), nextMonth.toISOString());
          const googleEventIds = events.map((e: any) => e.id);
          
          // 1. DETECTAR EVENTOS ELIMINADOS: Buscar citas que tienen google_event_id pero ya no existen en Google
          const { data: citasConGoogle } = await supabase.client
            .from('appointments')
            .select('*')
            .not('google_event_vendedor_id', 'is', null)
            .eq('status', 'scheduled');
          
          if (citasConGoogle) {
            for (const cita of citasConGoogle) {
              if (cita.google_event_vendedor_id && !googleEventIds.includes(cita.google_event_vendedor_id)) {
                // El evento fue eliminado de Google Calendar
                console.log('📅 Evento eliminado de Google, cancelando cita:', cita.id);
                
                await supabase.client
                  .from('appointments')
                  .update({ 
                    status: 'cancelled', 
                    cancelled_by: 'Google Calendar (eliminado)',
                  })
                  .eq('id', cita.id);
                
                // Notificar al LEAD
                if (cita.lead_phone) {
                  try {
                    const fechaStr = new Date(cita.scheduled_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                    const msgLead = `❌ *CITA CANCELADA*\n\nHola ${cita.lead_name?.split(' ')[0] || ''} 👋\n\nTu cita del ${fechaStr} a las ${(cita.scheduled_time || '').substring(0,5)} ha sido cancelada.\n\nSi deseas reagendar, contáctanos. ¡Estamos para servirte! 🏠`;
                    const phoneLead = cita.lead_phone.replace(/[^0-9]/g, '');
                    await meta.sendWhatsAppMessage(phoneLead, msgLead);
                    console.log('📤 Notificación cancelación (Google eliminado→WhatsApp) a lead:', cita.lead_name);
                  } catch (e) {
                    console.log('⚠️ Error notificando lead:', e);
                  }
                }
                
                // Notificar al VENDEDOR
                if (cita.vendedor_id) {
                  try {
                    const { data: vendedor } = await supabase.client
                      .from('team_members')
                      .select('phone, name')
                      .eq('id', cita.vendedor_id)
                      .single();
                    
                    if (vendedor?.phone) {
                      const fechaStr = new Date(cita.scheduled_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                      const msgVendedor = `❌ *CITA CANCELADA (Google Calendar)*\n\n👤 ${cita.lead_name}\n📱 ${cita.lead_phone}\n📆 Era: ${fechaStr}\n🕐 Hora: ${(cita.scheduled_time || '').substring(0,5)}`;
                      const phoneVendedor = vendedor.phone.replace(/[^0-9]/g, '');
                      await meta.sendWhatsAppMessage(phoneVendedor, msgVendedor);
                      console.log('📤 Notificación cancelación (Google eliminado→WhatsApp) a vendedor:', vendedor.name);
                    }
                  } catch (e) {
                    console.log('⚠️ Error notificando vendedor:', e);
                  }
                }
              }
            }
          }
          
          // 2. PROCESAR CAMBIOS EN EVENTOS EXISTENTES
          for (const event of events) {
            // Buscar cita en DB por google_event_id
            const { data: appointment } = await supabase.client
              .from('appointments')
              .select('*')
              .eq('google_event_vendedor_id', event.id)
              .single();
            
            if (appointment) {
              // Verificar si el evento fue cancelado (marcado como cancelled en Google)
              if (event.status === 'cancelled') {
                // Solo procesar si no estaba ya cancelado
                if (appointment.status !== 'cancelled') {
                  await supabase.client
                    .from('appointments')
                    .update({ 
                      status: 'cancelled', 
                      cancelled_by: 'Google Calendar',
                    })
                    .eq('id', appointment.id);
                  console.log('📅 Cita cancelada desde Google:', appointment.id);
                  
                  // Notificar al LEAD por WhatsApp
                  if (appointment.lead_phone) {
                    try {
                      const fechaStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                      const msgLead = `❌ *CITA CANCELADA*\n\nHola ${appointment.lead_name?.split(' ')[0] || ''} 👋\n\nTu cita del ${fechaStr} a las ${(appointment.scheduled_time || '').substring(0,5)} ha sido cancelada.\n\nSi deseas reagendar, contáctanos. ¡Estamos para servirte! 🏠`;
                      const phoneLead = appointment.lead_phone.replace(/[^0-9]/g, '');
                      await meta.sendWhatsAppMessage(phoneLead, msgLead);
                      console.log('📤 Notificación cancelación (Google→WhatsApp) a lead:', appointment.lead_name);
                    } catch (e) {
                      console.log('⚠️ Error notificando lead:', e);
                    }
                  }
                }
              } else {
                // Actualizar fecha/hora si cambió
                const dateTimeStr = event.start?.dateTime || event.start?.date || '';
                const newDate = dateTimeStr.substring(0, 10);
                const newTime = dateTimeStr.substring(11, 16);
                
                if (newDate && newTime && (appointment.scheduled_date !== newDate || (appointment.scheduled_time || '').substring(0,5) !== newTime)) {
                  const oldDate = appointment.scheduled_date;
                  const oldTime = (appointment.scheduled_time || '').substring(0,5);
                  
                  await supabase.client
                    .from('appointments')
                    .update({
                      scheduled_date: newDate,
                      scheduled_time: newTime,
                      property_name: event.location || appointment.property_name,
                    })
                    .eq('id', appointment.id);
                  console.log('📅 Cita reagendada desde Google:', appointment.id, newDate, newTime);
                  
                  // Buscar GPS del desarrollo
                  let gpsLink = '';
                  const lugar = event.location || appointment.property_name || '';
                  if (lugar && lugar !== 'Oficinas Centrales') {
                    const { data: prop } = await supabase.client
                      .from('properties')
                      .select('gps_link')
                      .or(`development.ilike.%${lugar}%,name.ilike.%${lugar}%`)
                      .limit(1)
                      .single();
                    if (prop?.gps_link) gpsLink = prop.gps_link;
                  }
                  
                  // Notificar al LEAD por WhatsApp
                  if (appointment.lead_phone) {
                    try {
                      const fechaNuevaStr = new Date(newDate + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                      const msgLead = `📅 *CITA REAGENDADA*\n\nHola ${appointment.lead_name?.split(' ')[0] || ''} 👋\n\nTu cita ha sido reprogramada:\n\n📆 *Nueva fecha:* ${fechaNuevaStr}\n🕐 *Nueva hora:* ${newTime}\n📍 *Lugar:* ${lugar || 'Por confirmar'}${gpsLink ? '\n🗺️ *Ubicación:* ' + gpsLink : ''}\n\n¡Te esperamos! 🏠`;
                      const phoneLead = appointment.lead_phone.replace(/[^0-9]/g, '');
                      await meta.sendWhatsAppMessage(phoneLead, msgLead);
                      console.log('📤 Notificación reagendado (Google→WhatsApp) a lead:', appointment.lead_name);
                    } catch (e) {
                      console.log('⚠️ Error notificando lead:', e);
                    }
                  }
                  
                  // Notificar al VENDEDOR si existe
                  if (appointment.vendedor_id) {
                    try {
                      const { data: vendedor } = await supabase.client
                        .from('team_members')
                        .select('phone, name')
                        .eq('id', appointment.vendedor_id)
                        .single();
                      
                      if (vendedor?.phone) {
                        const fechaNuevaStr = new Date(newDate + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                        const msgVendedor = `📅 *CITA MOVIDA (Google Calendar)*\n\n👤 ${appointment.lead_name}\n📱 ${appointment.lead_phone}\n📆 Nueva fecha: ${fechaNuevaStr}\n🕐 Nueva hora: ${newTime}\n📍 Lugar: ${lugar || 'Por confirmar'}${gpsLink ? '\n🗺️ Maps: ' + gpsLink : ''}`;
                        const phoneVendedor = vendedor.phone.replace(/[^0-9]/g, '');
                        await meta.sendWhatsAppMessage(phoneVendedor, msgVendedor);
                        console.log('📤 Notificación reagendado (Google→WhatsApp) a vendedor:', vendedor.name);
                      }
                    } catch (e) {
                      console.log('⚠️ Error notificando vendedor:', e);
                    }
                  }
                }
              }
            }
          }
        }
        
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Google Calendar Webhook Error:', error);
        return new Response('OK', { status: 200 });
      }
    }

    // Endpoint para registrar webhook de Google Calendar
    if (url.pathname === '/api/calendar/setup-webhook' && request.method === 'POST') {
      try {
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        
        // Crear canal de notificaciones
        const webhookUrl = 'https://sara-backend.edson-633.workers.dev/webhook/google-calendar';
        const channelId = 'sara-crm-' + Date.now();
        
        const result = await calendar.watchCalendar(channelId, webhookUrl);
        
        console.log('📅 Webhook de Google Calendar configurado:', result);
        return corsResponse(JSON.stringify({ success: true, channel: result }));
      } catch (error: any) {
        console.error('Error configurando webhook:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Verificar videos pendientes
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-videos') {
      console.log('🧪 TEST: Forzando verificación de videos...');
      await verificarVideosPendientes(supabase, new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN), env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Videos verificados' }));
    }

    // ═══════════════════════════════════════════════════════════
    // DEBUG: Ver estado de videos pendientes en Google
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/debug-videos') {
      console.log('🔍 DEBUG: Consultando estado de videos en Google...');

      const { data: pendientes } = await supabase.client
        .from('pending_videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!pendientes || pendientes.length === 0) {
        return corsResponse(JSON.stringify({ message: 'No hay videos en pending_videos' }));
      }

      const resultados = [];
      for (const video of pendientes) {
        const resultado: any = {
          id: video.id,
          lead_name: video.lead_name,
          lead_phone: video.lead_phone,
          desarrollo: video.desarrollo,
          operation_id: video.operation_id,
          sent: video.sent,
          created_at: video.created_at,
          completed_at: video.completed_at,
          video_url: video.video_url,
          google_status: null,
          google_error: null
        };

        // Solo consultar Google si no está marcado como enviado
        if (!video.sent && video.operation_id) {
          try {
            const statusResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/${video.operation_id}`,
              { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } }
            );

            if (statusResponse.ok) {
              const status = await statusResponse.json() as any;
              resultado.google_status = {
                done: status.done,
                has_error: !!status.error,
                error_message: status.error?.message,
                has_response: !!status.response,
                response_keys: status.response ? Object.keys(status.response) : [],
                video_uri: status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
                          status.response?.generatedSamples?.[0]?.video?.uri ||
                          status.result?.videos?.[0]?.uri ||
                          null
              };
            } else {
              resultado.google_error = `HTTP ${statusResponse.status}: ${await statusResponse.text()}`;
            }
          } catch (e: any) {
            resultado.google_error = e.message;
          }
        }

        resultados.push(resultado);
      }

      return corsResponse(JSON.stringify({
        total: pendientes.length,
        api_key_present: !!env.GEMINI_API_KEY,
        videos: resultados
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // REGENERAR VIDEO: Para leads cuyo video falló
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/regenerate-video/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`🔄 Regenerando video para teléfono: ${phone}`);

      // Buscar video fallido
      const { data: failedVideo } = await supabase.client
        .from('pending_videos')
        .select('*')
        .ilike('lead_phone', `%${phone}%`)
        .ilike('video_url', '%ERROR%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!failedVideo) {
        return corsResponse(JSON.stringify({ error: 'No se encontró video fallido para este teléfono' }), 404);
      }

      // Eliminar el registro fallido
      await supabase.client
        .from('pending_videos')
        .delete()
        .eq('id', failedVideo.id);

      // Generar nuevo video
      try {
        const apiKey = env.GEMINI_API_KEY;
        const testFoto = 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg';

        const imgResponse = await fetch(testFoto);
        const imgBuffer = await imgResponse.arrayBuffer();
        const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

        const desarrollo = failedVideo.desarrollo?.split(',')[0]?.trim() || 'Los Encinos';
        const prompt = `Cinematic medium shot of a friendly professional Mexican woman real estate agent standing in front of the luxury house shown in the image. She looks at the camera, smiles warmly and gestures welcome. Audio: A clear female voice speaking in Mexican Spanish saying Hola ${failedVideo.lead_name}, bienvenido a tu nuevo hogar aqui en ${desarrollo}. High quality, photorealistic, 4k resolution, natural lighting.`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 6 }
          })
        });

        const result = await response.json() as any;
        const operationName = result.name;

        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: failedVideo.lead_phone,
          lead_name: failedVideo.lead_name,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video regenerado para ${failedVideo.lead_name}`,
          operation_id: operationName,
          deleted_failed_id: failedVideo.id
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    if (url.pathname === '/test-followups') {
      console.log('🧪 TEST: Forzando verificación de follow-ups...');
      const followupService = new FollowupService(supabase);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const result = await followupService.procesarFollowupsPendientes(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error enviando follow-up:', e);
          return false;
        }
      });
      return corsResponse(JSON.stringify({ ok: true, ...result }));
    }


    // ═══════════════════════════════════════════════════════════
    // TEST: Generar video Veo 3 personalizado
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-veo3') {
      console.log('TEST: Probando generacion de video Veo 3...');
      const testPhone = '5214921234567';
      const testName = 'Test';
      const testDesarrollo = 'Los Encinos';
      const testFoto = 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg';

      try {
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return corsResponse(JSON.stringify({ error: 'Falta GEMINI_API_KEY' }), 500);
        }
        console.log('API Key presente');

        console.log('Descargando imagen:', testFoto);
        const imgResponse = await fetch(testFoto);
        if (!imgResponse.ok) {
          return corsResponse(JSON.stringify({ error: 'Error descargando imagen: ' + imgResponse.status }), 500);
        }
        const imgBuffer = await imgResponse.arrayBuffer();
        const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
        console.log('Imagen descargada:', imgBuffer.byteLength, 'bytes');

        const prompt = 'Cinematic medium shot of a friendly professional Mexican woman real estate agent standing in front of the luxury house shown in the image. She looks at the camera, smiles warmly and gestures welcome. Audio: A clear female voice speaking in Mexican Spanish saying Hola ' + testName + ', bienvenido a tu nuevo hogar aqui en ' + testDesarrollo + '. High quality, photorealistic, 4k resolution, natural lighting.';

        console.log('Llamando Veo 3 API...');
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 6 }
          })
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response body:', responseText.substring(0, 500));

        if (!response.ok) {
          return corsResponse(JSON.stringify({ error: 'Veo 3 API error', status: response.status, body: responseText }), 500);
        }

        const result = JSON.parse(responseText);
        if (result.error) {
          return corsResponse(JSON.stringify({ error: 'Google error', details: result.error }), 500);
        }

        const operationName = result.name;
        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result: result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: testPhone,
          lead_name: testName,
          desarrollo: testDesarrollo
        });

        return corsResponse(JSON.stringify({ ok: true, message: 'Video generandose', operation_id: operationName }));
      } catch (e: any) {
        console.error('Error en test-veo3:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Generar video semanal manualmente
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-video-semanal') {
      console.log('🧪 TEST: Generando video semanal de logros...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await generarVideoSemanalLogros(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Video semanal iniciado. El CRON lo enviará cuando esté listo.' }));
    }


    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-diario') {
      console.log('TEST: Enviando reporte diario CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte diario enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-semanal') {
      console.log('TEST: Enviando reporte semanal CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte semanal enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-mensual') {
      console.log('TEST: Enviando reporte mensual CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte mensual enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // HEALTH CHECK - Estado del sistema
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/health') {
      const health = await getHealthStatus(supabase);
      return corsResponse(JSON.stringify(health));
    }

    // ═══════════════════════════════════════════════════════════════
    // BACKUP - Exportar datos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/backup') {
      console.log('📦 Generando backup...');
      const backup = await exportBackup(supabase);
      return corsResponse(JSON.stringify(backup));
    }

    // ═══════════════════════════════════════════════════════════════
    // A/B TEST RESULTS - Ver resultados
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/ab-results') {
      const testName = url.searchParams.get('test') || 'welcome_message';
      const results = await getABTestResults(supabase, testName);
      return corsResponse(JSON.stringify(results || { error: 'No results found' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Remarketing leads fríos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-remarketing') {
      console.log('TEST: Ejecutando remarketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await remarketingLeadsFrios(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Remarketing ejecutado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Seguimiento hipotecas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-hipotecas') {
      console.log('TEST: Verificando hipotecas estancadas...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await seguimientoHipotecas(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Seguimiento hipotecas ejecutado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alertas proactivas CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-alertas-proactivas') {
      console.log('TEST: Enviando alertas proactivas CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarAlertasProactivasCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Alertas proactivas enviadas' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alerta leads HOT sin seguimiento
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-alerta-hot') {
      console.log('TEST: Enviando alerta leads HOT...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await alertaLeadsHotSinSeguimiento(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Alerta HOT enviada' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Coaching proactivo
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-coaching') {
      console.log('TEST: Enviando coaching proactivo...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { data: vendedores } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);
      if (vendedores) {
        await enviarCoachingProactivo(supabase, meta, vendedores);
      }
      return corsResponse(JSON.stringify({ ok: true, message: 'Coaching enviado', vendedores: vendedores?.length || 0 }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Briefing matutino
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-briefing') {
      console.log('TEST: Enviando briefing matutino...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { data: vendedores } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);
      let enviados = 0;
      for (const v of vendedores || []) {
        if (!v.phone || !v.recibe_briefing) continue;
        await enviarBriefingMatutino(supabase, meta, v);
        enviados++;
      }
      return corsResponse(JSON.stringify({ ok: true, message: 'Briefings enviados', count: enviados }));
    }

    // ═══════════════════════════════════════════════════════════════
    // STATUS: Ver estado de todos los CRONs
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/cron-status') {
      const now = new Date();
      // Usar timezone correcto de México (maneja DST automáticamente)
      const mexicoFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false
      });
      const mexicoParts = mexicoFormatter.formatToParts(now);
      const mexicoHour = parseInt(mexicoParts.find(p => p.type === 'hour')?.value || '0');
      const mexicoMinute = parseInt(mexicoParts.find(p => p.type === 'minute')?.value || '0');
      const mexicoWeekday = mexicoParts.find(p => p.type === 'weekday')?.value || '';
      const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const dayOfWeek = dayMap[mexicoWeekday] ?? now.getUTCDay();
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
      
      const crons = [
        { name: 'Briefing matutino', hora: '8:00', dias: 'L-V' },
        { name: 'Reporte diario CEO', hora: '8:00', dias: 'L-V' },
        { name: 'Reporte semanal CEO', hora: '8:00', dias: 'Lunes' },
        { name: 'Reporte mensual CEO', hora: '8:00', dias: 'Dia 1' },
        { name: 'Felicitaciones cumple', hora: '9:00', dias: 'Diario' },
        { name: 'Alertas estancamiento', hora: '10:00', dias: 'L-V' },
        { name: 'Coaching proactivo', hora: '11:00', dias: 'L-V' },
        { name: 'Alertas proactivas CEO', hora: '14:00', dias: 'L-V' },
        { name: 'Alerta HOT', hora: '17:00', dias: 'L-V' },
        { name: 'Video semanal', hora: '18:00', dias: 'Viernes' },
        { name: 'Recap diario', hora: '19:00', dias: 'L-V' },
        { name: 'Recap semanal', hora: '12:00', dias: 'Sabado' },
        { name: 'Recordatorios citas', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Follow-ups', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Remarketing frios', hora: '10:00', dias: 'Miercoles' },
        { name: 'Seguimiento hipotecas', hora: '10:00', dias: 'Mar/Jue' },
      ];

      return corsResponse(JSON.stringify({
        ok: true,
        hora_mexico: mexicoHour + ':' + mexicoMinute.toString().padStart(2, '0'),
        dia: dayNames[dayOfWeek],
        crons: crons,
        endpoints_test: [
          '/test-reporte-diario',
          '/test-reporte-semanal',
          '/test-reporte-mensual',
          '/test-alertas-proactivas',
          '/test-alerta-hot',
          '/test-coaching',
          '/test-briefing',
          '/test-followups',
          '/test-video-semanal',
          '/test-remarketing',
          '/test-hipotecas',
          '/health',
          '/backup',
          '/ab-results'
        ]
      }));
    }

    return corsResponse(JSON.stringify({ error: 'Not Found' }), 404);
  },

  // ═══════════════════════════════════════════════════════════
  // CRON JOBS - Mensajes automáticos
  // ═══════════════════════════════════════════════════════════
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

    const now = new Date();

    // Usar timezone correcto de México (maneja DST automáticamente)
    const mexicoFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false
    });
    const mexicoParts = mexicoFormatter.formatToParts(now);
    const mexicoHour = parseInt(mexicoParts.find(p => p.type === 'hour')?.value || '0');
    const mexicoMinute = parseInt(mexicoParts.find(p => p.type === 'minute')?.value || '0');
    const mexicoWeekday = mexicoParts.find(p => p.type === 'weekday')?.value || '';

    // Mapear día de la semana (Mon=1, Tue=2, ..., Sun=0)
    const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const dayOfWeek = dayMap[mexicoWeekday] ?? now.getUTCDay();

    // Solo ejecutar tareas horarias en los primeros 2 minutos de la hora
    const isFirstRunOfHour = mexicoMinute < 2;

    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`🕐 CRON EJECUTADO`);
    console.log(`   UTC: ${now.toISOString()}`);
    console.log(`   México: ${mexicoHour}:${mexicoMinute.toString().padStart(2, '0')} (${mexicoWeekday})`);
    console.log(`   Día semana: ${dayOfWeek} (0=Dom, 1=Lun...)`);
    console.log(`   isFirstRunOfHour: ${isFirstRunOfHour}`);
    console.log(`   Cron trigger: ${event.cron}`);
    console.log(`═══════════════════════════════════════════════════════════`);

    // Obtener vendedores activos
    const { data: vendedores, error: vendedoresError } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('active', true);

    console.log(`👥 Vendedores activos: ${vendedores?.length || 0}`);
    if (vendedoresError) {
      console.error(`❌ Error obteniendo vendedores:`, vendedoresError);
    }
    if (vendedores) {
      vendedores.forEach((v: any) => {
        console.log(`   - ${v.name}: phone=${v.phone ? '✅' : '❌'}, recibe_briefing=${v.recibe_briefing ? '✅' : '❌'}, last_briefing=${v.last_briefing_sent || 'nunca'}`);
      });
    }

    // 9am: Felicitaciones de cumpleanos (solo primer ejecucion de la hora)
    if (mexicoHour === 9 && isFirstRunOfHour) {
      console.log('🎂 Enviando felicitaciones...');
      await enviarFelicitaciones(supabase, meta);
    }

    // 8am L-V: Briefing matutino (solo primer ejecucion de la hora)
    console.log(`📋 BRIEFING CHECK: hora=${mexicoHour}===8? ${mexicoHour === 8}, isFirst=${isFirstRunOfHour}, dia=${dayOfWeek} (1-5)? ${dayOfWeek >= 1 && dayOfWeek <= 5}, vendedores=${!!vendedores}`);
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log('✅ CONDICIONES CUMPLIDAS - Enviando briefing matutino...');
      let enviados = 0;
      let saltados = 0;
      for (const v of vendedores) {
        if (!v.phone) {
          console.log(`   ⏭️ ${v.name}: SIN TELÉFONO`);
          saltados++;
          continue;
        }
        if (!v.recibe_briefing) {
          console.log(`   ⏭️ ${v.name}: recibe_briefing=false`);
          saltados++;
          continue;
        }
        console.log(`   📤 Enviando briefing a ${v.name} (${v.phone})...`);
        try {
          await enviarBriefingMatutino(supabase, meta, v);
          enviados++;
        } catch (err) {
          console.error(`   ❌ Error enviando briefing a ${v.name}:`, err);
        }
      }
      console.log(`📊 BRIEFING RESULTADO: ${enviados} enviados, ${saltados} saltados`);
    } else {
      console.log(`⏭️ BRIEFING NO EJECUTADO - condiciones no cumplidas`);
    }

    // 8am L-V: Reporte diario CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reporte diario a CEO...');
      await enviarReporteDiarioCEO(supabase, meta);
    }

    // 8am LUNES: Reporte semanal CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📈 Enviando reporte semanal a CEO...');
      await enviarReporteSemanalCEO(supabase, meta);
    }

    // 8am DÍA 1 DE CADA MES: Reporte mensual CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reporte mensual a CEO...');
      await enviarReporteMensualCEO(supabase, meta);
    }

    // 12:01am DÍA 1 DE CADA MES: Aplicar nuevos precios programados
    if (mexicoHour === 0 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('💰 Aplicando precios programados del mes...');
      await aplicarPreciosProgramados(supabase, meta);
    }

    // 7pm L-V: Recap del dia (solo primer ejecucion de la hora)
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log('Enviando recap del dia...');
      for (const v of vendedores) {
        if (!v.phone || !v.recibe_recap) continue;
        await enviarRecapDiario(supabase, meta, v);
      }
    }

    // Viernes 6pm: Video semanal de logros con Veo 3 (solo primer ejecucion)
    if (mexicoHour === 18 && isFirstRunOfHour && dayOfWeek === 5) {
      console.log('🎬 Generando video semanal de logros...');
      await generarVideoSemanalLogros(supabase, meta, env);
    }

    // Sábado 12pm: Recap semanal
    if (mexicoHour === 12 && isFirstRunOfHour && dayOfWeek === 6 && vendedores) {
      console.log('📊 Enviando recap semanal...');
      for (const v of vendedores) {
        if (!v.phone || !v.recibe_recap) continue;
        await enviarRecapSemanal(supabase, meta, v);
      }
    }

    // RECORDATORIOS DE CITAS - cada ejecución del cron
    console.log('🔔 Verificando recordatorios de citas...');
    await enviarRecordatoriosCitas(supabase, meta);

    // Verificar videos pendientes
    console.log('🎬 Verificando videos pendientes...');
    await verificarVideosPendientes(supabase, meta, env);

    // FOLLOW-UPS AUTOMÁTICOS
    console.log('📬 Procesando follow-ups pendientes...');
    const followupService = new FollowupService(supabase);
    await followupService.procesarFollowupsPendientes(async (phone, message) => {
      try {
        await meta.sendWhatsAppMessage(phone, message);
        return true;
      } catch (e) {
        console.log('Error enviando follow-up:', e);
        return false;
      }
    });

    // 10am L-V: Alertas de estancamiento
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('⚠️ Verificando leads estancados...');
      await verificarLeadsEstancados(supabase, meta);
      console.log('👆 Enviando recordatorios a asesores...');
      await recordatorioAsesores(supabase, meta);
    }

    // 2pm L-V: Alertas proactivas CEO (situaciones críticas)
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🚨 Verificando alertas proactivas CEO...');
      await enviarAlertasProactivasCEO(supabase, meta);
    }

    // 5pm L-V: Alerta leads HOT sin seguimiento hoy
    if (mexicoHour === 17 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🔥 Verificando leads HOT sin seguimiento...');
      await alertaLeadsHotSinSeguimiento(supabase, meta);
    }

    // 11am L-V: Coaching proactivo a vendedores
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log('🎯 Enviando coaching proactivo...');
      await enviarCoachingProactivo(supabase, meta, vendedores);
    }

    // 10am MIÉRCOLES: Remarketing leads fríos
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 3) {
      console.log('📣 Ejecutando remarketing leads fríos...');
      await remarketingLeadsFrios(supabase, meta);
    }

    // 10am MARTES y JUEVES: Seguimiento hipotecas estancadas
    if (mexicoHour === 10 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      console.log('🏦 Verificando hipotecas estancadas...');
      await seguimientoHipotecas(supabase, meta);
    }

    // 9am L-S: Recordatorios de promociones activas
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 6) {
      console.log('🎯 Procesando recordatorios de promociones...');
      await enviarRecordatoriosPromociones(supabase, meta);
    }
  },
};

// ═══════════════════════════════════════════════════════════
// FUNCIONES DE MENSAJES AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════

async function verificarLeadsEstancados(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  const prioridadStatus: Record<string, number> = {
    'scheduled': 1,
    'contacted': 2,
    'new': 3
  };
  const accionStatus: Record<string, string> = {
    'scheduled': 'pendiente confirmar visita',
    'contacted': 'en espera de respuesta',
    'new': 'sin contactar'
  };

  for (const [status, dias] of Object.entries({ 'scheduled': 2, 'contacted': 3, 'new': 1 })) {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);

    const { data: leads } = await supabase.client
      .from('leads')
      .select('*, team_members!leads_assigned_to_fkey(name, phone)')
      .eq('status', status)
      .lt('updated_at', fechaLimite.toISOString());

    if (!leads || leads.length === 0) continue;

    const porVendedor: Record<string, any[]> = {};
    for (const lead of leads) {
      const vendedor = lead.team_members;
      if (!vendedor?.phone) continue;
      if (!porVendedor[vendedor.phone]) porVendedor[vendedor.phone] = [];
      porVendedor[vendedor.phone].push(lead);
    }

    for (const [phone, leadsVendedor] of Object.entries(porVendedor)) {
      const mensaje = `⚠️ *ALERTA: ${leadsVendedor.length} lead(s) estancado(s)*\n\n` +
        leadsVendedor.slice(0, 5).map((l: any) => 
          `• ${l.name || 'Sin nombre'} - ${accionStatus[status]}`
        ).join('\n') +
        (leadsVendedor.length > 5 ? `\n...y ${leadsVendedor.length - 5} más` : '') +
        `\n\n👆 Actualiza su status en el CRM`;

      await meta.sendWhatsAppMessage(phone, mensaje);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTES CEO AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════════

async function enviarReporteDiarioCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  // Obtener CEOs/Admins
  const { data: admins } = await supabase.client
    .from('team_members')
    .select('*')
    .in('role', ['admin', 'coordinador'])
    .eq('active', true);

  if (!admins || admins.length === 0) return;

  // Datos del día
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaFormato = `${dias[hoy.getDay()]}, ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;

  // Leads de ayer
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

  const { data: leadsAyer } = await supabase.client
    .from('leads')
    .select('*')
    .gte('created_at', inicioAyer)
    .lt('created_at', inicioHoy);

  const { data: cierresAyer } = await supabase.client
    .from('leads')
    .select('*')
    .in('status', ['closed', 'delivered'])
    .gte('status_changed_at', inicioAyer)
    .lt('status_changed_at', inicioHoy);

  // Citas de hoy
  const hoyStr = hoy.toISOString().split('T')[0];
  const { data: citasHoy } = await supabase.client
    .from('appointments')
    .select('*')
    .eq('scheduled_date', hoyStr)
    .eq('status', 'scheduled');

  // Leads HOT
  const { data: leadsHot } = await supabase.client
    .from('leads')
    .select('*')
    .in('status', ['negotiation', 'reserved']);

  // Leads estancados (new > 1 día)
  const limiteFrio = new Date(hoy);
  limiteFrio.setDate(limiteFrio.getDate() - 1);
  const { data: estancados } = await supabase.client
    .from('leads')
    .select('*')
    .eq('status', 'new')
    .lt('created_at', limiteFrio.toISOString());

  // Construir mensaje
  const msg = `☀️ *BUENOS DÍAS*
${fechaFormato}

📊 *AYER:*
• Leads nuevos: ${leadsAyer?.length || 0}
• Cierres: ${cierresAyer?.length || 0}

📅 *HOY:*
• Citas agendadas: ${citasHoy?.length || 0}

🔥 *PIPELINE:*
• Leads HOT: ${leadsHot?.length || 0}
${estancados && estancados.length > 0 ? `\n⚠️ *ALERTA:* ${estancados.length} leads sin contactar` : ''}

Escribe *resumen* para más detalles.`;

  // Enviar a cada admin (evitar duplicados por teléfono)
  const telefonosEnviados = new Set<string>();
  for (const admin of admins) {
    if (!admin.phone) continue;
    const tel = admin.phone.replace(/\D/g, '');
    if (telefonosEnviados.has(tel)) continue;
    telefonosEnviados.add(tel);
    
    try {
      await meta.sendWhatsAppMessage(admin.phone, msg);
      console.log(`📊 Reporte diario enviado a ${admin.name}`);
    } catch (e) {
      console.log(`Error enviando reporte a ${admin.name}:`, e);
    }
  }
}

async function enviarReporteSemanalCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  // Obtener CEOs/Admins
  const { data: admins } = await supabase.client
    .from('team_members')
    .select('*')
    .in('role', ['admin', 'coordinador'])
    .eq('active', true);

  if (!admins || admins.length === 0) return;

  // Calcular semana pasada
  const hoy = new Date();
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - 7);
  const inicioSemanaStr = inicioSemana.toISOString();

  // Datos de la semana
  const { data: leadsSemana } = await supabase.client
    .from('leads')
    .select('*')
    .gte('created_at', inicioSemanaStr);

  const { data: cierresSemana } = await supabase.client
    .from('leads')
    .select('*, properties(price)')
    .in('status', ['closed', 'delivered'])
    .gte('status_changed_at', inicioSemanaStr);

  const { data: citasSemana } = await supabase.client
    .from('appointments')
    .select('*')
    .gte('scheduled_date', inicioSemana.toISOString().split('T')[0])
    .lte('scheduled_date', hoy.toISOString().split('T')[0]);

  // Calcular revenue estimado
  let revenue = 0;
  if (cierresSemana) {
    for (const cierre of cierresSemana) {
      revenue += cierre.properties?.price || 2000000;
    }
  }

  // Top vendedor
  const { data: vendedores } = await supabase.client
    .from('team_members')
    .select('*')
    .eq('role', 'vendedor')
    .eq('active', true)
    .order('sales_count', { ascending: false })
    .limit(1);

  const topVendedor = vendedores?.[0];

  // Leads por fuente
  const fuenteCount: Record<string, number> = {};
  if (leadsSemana) {
    for (const l of leadsSemana) {
      const fuente = l.source || 'Desconocido';
      fuenteCount[fuente] = (fuenteCount[fuente] || 0) + 1;
    }
  }
  const topFuente = Object.entries(fuenteCount).sort((a, b) => b[1] - a[1])[0];

  // Conversión
  const citasCompletadas = citasSemana?.filter(c => c.status === 'completed').length || 0;
  const conversionRate = leadsSemana && leadsSemana.length > 0 
    ? Math.round((cierresSemana?.length || 0) / leadsSemana.length * 100) 
    : 0;

  // Construir mensaje
  const msg = `📈 *REPORTE SEMANAL*
Semana del ${inicioSemana.getDate()}/${inicioSemana.getMonth()+1} al ${hoy.getDate()}/${hoy.getMonth()+1}

📊 *RESUMEN:*
• Leads nuevos: ${leadsSemana?.length || 0}
• Citas realizadas: ${citasCompletadas}
• Cierres: ${cierresSemana?.length || 0}
• Revenue: $${(revenue/1000000).toFixed(1)}M

📈 *CONVERSIÓN:*
• Lead → Cierre: ${conversionRate}%

🏆 *TOP VENDEDOR:*
${topVendedor ? `• ${topVendedor.name}: ${topVendedor.sales_count} cierres` : '• Sin datos'}

📣 *MEJOR FUENTE:*
${topFuente ? `• ${topFuente[0]}: ${topFuente[1]} leads` : '• Sin datos'}

💡 *INSIGHT:*
${conversionRate >= 5 ? '✅ Conversión saludable. ¡Sigue así!' : '⚠️ Conversión baja. Revisar seguimiento.'}

¡Excelente semana! 🚀`;

  // Enviar a cada admin
  const telefonosEnviados = new Set<string>();
  for (const admin of admins) {
    if (!admin.phone) continue;
    const tel = admin.phone.replace(/\D/g, '');
    if (telefonosEnviados.has(tel)) continue;
    telefonosEnviados.add(tel);
    
    try {
      await meta.sendWhatsAppMessage(admin.phone, msg);
      console.log(`📈 Reporte semanal enviado a ${admin.name}`);
    } catch (e) {
      console.log(`Error enviando reporte semanal a ${admin.name}:`, e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL CEO - Día 1 de cada mes 8am
// ═══════════════════════════════════════════════════════════════

async function enviarReporteMensualCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .in('role', ['admin', 'coordinador'])
      .eq('active', true);

    if (!admins || admins.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    
    // Mes pasado (el que reportamos)
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;
    
    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);
    
    // Mes anterior al reporte (para comparar)
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    // ═══ DATOS DEL MES REPORTADO ═══
    
    // Leads del mes
    const { data: leadsMes } = await supabase.client
      .from('leads')
      .select('*, team_members!leads_assigned_to_fkey(name)')
      .gte('created_at', inicioMesReporte.toISOString())
      .lte('created_at', finMesReporte.toISOString());

    // Leads mes anterior (comparar)
    const { data: leadsMesAnterior } = await supabase.client
      .from('leads')
      .select('*')
      .gte('created_at', inicioMesAnterior.toISOString())
      .lte('created_at', finMesAnterior.toISOString());

    // Cierres del mes
    const { data: cierresMes } = await supabase.client
      .from('leads')
      .select('*, properties(price, name), team_members!leads_assigned_to_fkey(name)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioMesReporte.toISOString())
      .lte('status_changed_at', finMesReporte.toISOString());

    // Cierres mes anterior
    const { data: cierresMesAnterior } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioMesAnterior.toISOString())
      .lte('status_changed_at', finMesAnterior.toISOString());

    // Citas del mes
    const { data: citasMes } = await supabase.client
      .from('appointments')
      .select('*')
      .gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0])
      .lte('scheduled_date', finMesReporte.toISOString().split('T')[0]);

    // Vendedores con stats
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true)
      .order('sales_count', { ascending: false });

    // Hipotecas
    const { data: hipotecas } = await supabase.client
      .from('mortgage_applications')
      .select('*')
      .gte('created_at', inicioMesReporte.toISOString())
      .lte('created_at', finMesReporte.toISOString());

    // ═══ CÁLCULOS ═══

    // Revenue
    let revenueMes = 0;
    for (const c of cierresMes || []) {
      revenueMes += c.properties?.price || 2000000;
    }

    let revenueMesAnterior = 0;
    for (const c of cierresMesAnterior || []) {
      revenueMesAnterior += c.properties?.price || 2000000;
    }

    // Variaciones
    const leadsActual = leadsMes?.length || 0;
    const leadsPrev = leadsMesAnterior?.length || 1;
    const varLeads = Math.round(((leadsActual - leadsPrev) / leadsPrev) * 100);

    const cierresActual = cierresMes?.length || 0;
    const cierresPrev = cierresMesAnterior?.length || 1;
    const varCierres = Math.round(((cierresActual - cierresPrev) / cierresPrev) * 100);

    const varRevenue = revenueMesAnterior > 0 
      ? Math.round(((revenueMes - revenueMesAnterior) / revenueMesAnterior) * 100) 
      : 0;

    // Conversión
    const conversionMes = leadsActual > 0 ? Math.round((cierresActual / leadsActual) * 100) : 0;

    // Citas stats
    const citasCompletadas = citasMes?.filter(c => c.status === 'completed').length || 0;
    const citasCanceladas = citasMes?.filter(c => c.status === 'cancelled').length || 0;
    const showRate = citasMes && citasMes.length > 0 
      ? Math.round((citasCompletadas / citasMes.length) * 100) 
      : 0;

    // Leads por fuente
    const porFuente: Record<string, number> = {};
    for (const l of leadsMes || []) {
      const fuente = l.source || 'Directo';
      porFuente[fuente] = (porFuente[fuente] || 0) + 1;
    }
    const fuentesOrdenadas = Object.entries(porFuente).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Hipotecas stats
    const hipotecasAprobadas = hipotecas?.filter(h => h.status === 'approved').length || 0;
    const hipotecasRechazadas = hipotecas?.filter(h => h.status === 'rejected').length || 0;
    const hipotecasEnProceso = hipotecas?.filter(h => !['approved', 'rejected'].includes(h.status)).length || 0;

    // Ranking vendedores (top 3)
    const rankingVendedores = vendedores?.slice(0, 3) || [];

    // Ticket promedio
    const ticketPromedio = cierresActual > 0 ? revenueMes / cierresActual : 0;

    // Emojis para variación
    const emojiVar = (v: number) => v > 0 ? '📈' : v < 0 ? '📉' : '➡️';
    const signVar = (v: number) => v > 0 ? '+' : '';

    // ═══ CONSTRUIR MENSAJE ═══

    const msg1 = `📊 *REPORTE MENSUAL*
*${nombreMes} ${anioReporte}*

━━━━━━━━━━━━━━━━━━━━━

💰 *RESULTADOS*

• Revenue: *$${(revenueMes/1000000).toFixed(1)}M* ${emojiVar(varRevenue)} ${signVar(varRevenue)}${varRevenue}%
• Cierres: *${cierresActual}* ${emojiVar(varCierres)} ${signVar(varCierres)}${varCierres}%
• Ticket promedio: $${(ticketPromedio/1000000).toFixed(2)}M

━━━━━━━━━━━━━━━━━━━━━

📈 *PIPELINE*

• Leads nuevos: ${leadsActual} ${emojiVar(varLeads)} ${signVar(varLeads)}${varLeads}%
• Citas agendadas: ${citasMes?.length || 0}
• Citas completadas: ${citasCompletadas}
• Show rate: ${showRate}%
• Conversión L→C: ${conversionMes}%

━━━━━━━━━━━━━━━━━━━━━

📣 *CANALES*
${fuentesOrdenadas.map((f, i) => `${i+1}. ${f[0]}: ${f[1]} leads`).join('\n') || 'Sin datos'}`;

    const msg2 = `🏆 *RANKING VENDEDORES*
${rankingVendedores.map((v, i) => {
  const medallas = ['🥇', '🥈', '🥉'];
  return `${medallas[i]} ${v.name}: ${v.sales_count || 0} cierres`;
}).join('\n') || 'Sin datos'}

━━━━━━━━━━━━━━━━━━━━━

🏦 *HIPOTECAS*

• En proceso: ${hipotecasEnProceso}
• Aprobadas: ${hipotecasAprobadas}
• Rechazadas: ${hipotecasRechazadas}
• Tasa aprobación: ${hipotecas && hipotecas.length > 0 ? Math.round((hipotecasAprobadas / hipotecas.length) * 100) : 0}%

━━━━━━━━━━━━━━━━━━━━━

💡 *INSIGHTS*

${conversionMes >= 5 ? '✅ Conversión saludable' : '⚠️ Revisar seguimiento de leads'}
${showRate >= 70 ? '✅ Buen show rate' : '⚠️ Muchas citas canceladas'}
${varRevenue > 0 ? '✅ Crecimiento vs mes anterior' : '⚠️ Revenue menor al mes pasado'}

━━━━━━━━━━━━━━━━━━━━━

_Reporte generado automáticamente_
_${new Date().toLocaleDateString('es-MX')}_`;

    // Enviar a cada admin (2 mensajes)
    const telefonosEnviados = new Set<string>();
    for (const admin of admins) {
      if (!admin.phone) continue;
      const tel = admin.phone.replace(/\D/g, '');
      if (telefonosEnviados.has(tel)) continue;
      telefonosEnviados.add(tel);
      
      try {
        await meta.sendWhatsAppMessage(admin.phone, msg1);
        await new Promise(r => setTimeout(r, 1000)); // Esperar 1s entre mensajes
        await meta.sendWhatsAppMessage(admin.phone, msg2);
        console.log(`📊 Reporte mensual enviado a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando reporte mensual a ${admin.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en reporte mensual:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS (día 1 de cada mes a las 12:01 AM)
// Todos los desarrollos suben 0.5% mensual (6% anual)
// ═══════════════════════════════════════════════════════════════════════════
const INCREMENTO_MENSUAL = 0.005; // 0.5% mensual = 6% anual

async function aplicarPreciosProgramados(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const hoy = new Date();
    const mesActual = hoy.toLocaleString('es-MX', { month: 'long', year: 'numeric' });

    // Obtener TODAS las propiedades
    const { data: propiedades, error } = await supabase.client
      .from('properties')
      .select('id, name, development, price, price_equipped');

    if (error || !propiedades || propiedades.length === 0) {
      console.log('⚠️ Error obteniendo propiedades:', error?.message);
      return;
    }

    console.log(`💰 Aplicando aumento del ${INCREMENTO_MENSUAL * 100}% a ${propiedades.length} propiedades...`);

    let aplicados = 0;
    const resumen: string[] = [];

    for (const prop of propiedades) {
      try {
        const precioAnterior = Number(prop.price) || 0;
        const precioEquipadoAnterior = Number(prop.price_equipped) || 0;

        // Calcular nuevos precios (redondear a enteros)
        const nuevoPrecio = Math.round(precioAnterior * (1 + INCREMENTO_MENSUAL));
        const nuevoPrecioEquipado = precioEquipadoAnterior > 0
          ? Math.round(precioEquipadoAnterior * (1 + INCREMENTO_MENSUAL))
          : null;

        // Actualizar en DB
        await supabase.client
          .from('properties')
          .update({
            price: nuevoPrecio,
            price_equipped: nuevoPrecioEquipado,
            updated_at: new Date().toISOString()
          })
          .eq('id', prop.id);

        aplicados++;

        // Guardar para resumen (solo primeros 3 por desarrollo)
        if (!resumen.some(r => r.includes(prop.development))) {
          resumen.push(`• ${prop.development}: ${prop.name} $${(precioAnterior/1000000).toFixed(2)}M → $${(nuevoPrecio/1000000).toFixed(2)}M`);
        }
      } catch (e) {
        console.log(`❌ Error actualizando ${prop.name}:`, e);
      }
    }

    // Registrar en historial (si existe la tabla)
    try {
      await supabase.client
        .from('price_history')
        .insert({
          fecha: hoy.toISOString().split('T')[0],
          incremento_porcentaje: INCREMENTO_MENSUAL * 100,
          propiedades_actualizadas: aplicados,
          notas: `Aumento automático ${mesActual}`
        });
    } catch (e) {
      // Tabla price_history no existe, ignorar
    }

    // Notificar al CEO/Admin
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('phone')
      .in('role', ['ceo', 'admin'])
      .eq('active', true);

    if (admins && admins.length > 0 && aplicados > 0) {
      const mensaje = `💰 *AUMENTO DE PRECIOS ${mesActual.toUpperCase()}*

Se aplicó el incremento mensual del ${INCREMENTO_MENSUAL * 100}% a ${aplicados} propiedades.

*Ejemplos:*
${resumen.slice(0, 5).join('\n')}

✅ Brochures y catálogos actualizados automáticamente.`;

      for (const admin of admins) {
        if (admin.phone) {
          await meta.sendWhatsAppMessage(admin.phone, mensaje);
        }
      }
    }

    console.log(`💰 Aumento aplicado: ${aplicados}/${propiedades.length} propiedades (+${INCREMENTO_MENSUAL * 100}%)`);
  } catch (e) {
    console.log('Error aplicando aumento de precios:', e);
  }
}

async function enviarFelicitaciones(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  const fechaHoy = `${mes}-${dia}`;

  const { data: cumples } = await supabase.client
    .from('team_members')
    .select('*')
    .like('birthday', `%-${fechaHoy}`);

  for (const persona of cumples || []) {
    if (!persona.phone) continue;
    const mensaje = `🎂 *¡Feliz Cumpleaños ${persona.name}!* 🎉\n\nTodo el equipo de Santa Rita te desea un día increíble. ¡Que se cumplan todos tus sueños! 🌟`;
    await meta.sendWhatsAppMessage(persona.phone, mensaje);
  }
}

async function enviarBriefingMatutino(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

  // PROTECCIÓN ANTI-DUPLICADOS: Verificar si ya se envió hoy
  if (vendedor.last_briefing_sent === hoy) {
    console.log(`⏭️ Briefing ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  const { data: citasHoy } = await supabase.client
    .from('appointments')
    .select('*, leads(name, phone)')
    .eq('team_member_id', vendedor.id)
    .eq('scheduled_date', hoy)
    .eq('status', 'scheduled');

  const { data: leadsAsignados } = await supabase.client
    .from('leads')
    .select('*')
    .eq('assigned_to', vendedor.id)
    .in('status', ['new', 'contacted']);

  let mensaje = `☀️ *Buenos días ${vendedor.name}!*\n\n`;
  mensaje += `📅 *Tu agenda de hoy:*\n`;

  if (citasHoy && citasHoy.length > 0) {
    mensaje += citasHoy.map((c: any) =>
      `• ${c.scheduled_time} - ${c.leads?.name || 'Cliente'} en ${c.property_interest || 'Por definir'}`
    ).join('\n');
  } else {
    mensaje += `Sin citas programadas`;
  }

  mensaje += `\n\n*Leads pendientes:* ${leadsAsignados?.length || 0}`;
  mensaje += `\n\nExito hoy!`;

  await meta.sendWhatsAppMessage(vendedor.phone, mensaje);

  // Marcar como enviado para evitar duplicados
  await supabase.client
    .from('team_members')
    .update({ last_briefing_sent: hoy })
    .eq('id', vendedor.id);
  console.log(`✅ Briefing enviado a ${vendedor.name}`);
}

async function enviarRecapDiario(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

  // PROTECCIÓN ANTI-DUPLICADOS: Verificar si ya se envió hoy
  if (vendedor.last_recap_sent === hoy) {
    console.log(`⏭️ Recap ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  const mensaje = `*Resumen del dia, ${vendedor.name}*\n\n` +
    `Gracias por tu esfuerzo hoy. Recuerda actualizar el status de tus leads en el CRM.\n\n` +
    `Descansa y manana con todo!`;

  await meta.sendWhatsAppMessage(vendedor.phone, mensaje);

  // Marcar como enviado para evitar duplicados
  await supabase.client
    .from('team_members')
    .update({ last_recap_sent: hoy })
    .eq('id', vendedor.id);
  console.log(`✅ Recap diario enviado a ${vendedor.name}`);
}

async function enviarRecapSemanal(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

  // PROTECCIÓN ANTI-DUPLICADOS: Verificar si ya se envió esta semana
  if (vendedor.last_recap_semanal_sent === hoy) {
    console.log(`⏭️ Recap semanal ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  const mensaje = `*Resumen semanal, ${vendedor.name}*\n\n` +
    `Esta semana trabajaste duro. Revisa tus metricas en el CRM.\n\n` +
    `Disfruta tu fin de semana!`;

  await meta.sendWhatsAppMessage(vendedor.phone, mensaje);

  // Marcar como enviado para evitar duplicados
  await supabase.client
    .from('team_members')
    .update({ last_recap_semanal_sent: hoy })
    .eq('id', vendedor.id);
  console.log(`✅ Recap semanal enviado a ${vendedor.name}`);
}

async function enviarRecordatoriosCitas(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  const ahora = new Date();
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const en2h = new Date(ahora.getTime() + 2 * 60 * 60 * 1000);

  // Recordatorio 24h antes
  const { data: citas24h } = await supabase.client
    .from('appointments')
    .select('*, leads(name, phone), team_members(name, phone)')
    .eq('status', 'scheduled')
    .eq('reminder_24h_sent', false)
    .gte('scheduled_date', ahora.toISOString().split('T')[0])
    .lte('scheduled_date', en24h.toISOString().split('T')[0]);

  for (const cita of citas24h || []) {
    const lead = cita.leads;
    if (!lead?.phone) continue;

    const fecha = cita.scheduled_date;
    const hora = cita.scheduled_time || '12:00';

    const mensaje = `📅 *Recordatorio de tu cita mañana*\n\n` +
      `Hola ${lead.name}, te recordamos tu cita:\n` +
      `📍 ${cita.property_interest || 'Santa Rita'}\n` +
      `📍 ${fecha} a las ${hora}\n\n` +
      `¡Te esperamos! 🏠`;

    await meta.sendWhatsAppMessage(lead.phone, mensaje);
    await supabase.client
      .from('appointments')
      .update({ reminder_24h_sent: true })
      .eq('id', cita.id);
  }

  // Recordatorio 2h antes
  const { data: citas2h } = await supabase.client
    .from('appointments')
    .select('*, leads(name, phone), team_members(name, phone)')
    .eq('status', 'scheduled')
    .eq('reminder_2h_sent', false)
    .gte('scheduled_date', ahora.toISOString().split('T')[0])
    .lte('scheduled_date', en2h.toISOString().split('T')[0]);

  for (const cita of citas2h || []) {
    const lead = cita.leads;
    if (!lead?.phone) continue;

    const mensaje = `⏰ *Tu cita es en 2 horas*\n\n` +
      `${lead.name}, te esperamos en ${cita.property_interest || 'Santa Rita'}.\n\n` +
      `¿Necesitas indicaciones? Responde a este mensaje. 📍`;

    await meta.sendWhatsAppMessage(lead.phone, mensaje);
    await supabase.client
      .from('appointments')
      .update({ reminder_2h_sent: true })
      .eq('id', cita.id);
  }
}

async function recordatorioAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  // 1. Recordatorio a VENDEDORES sobre leads sin contactar
  const { data: vendedores } = await supabase.client
    .from('team_members')
    .select('*')
    .eq('role', 'vendedor')
    .eq('active', true);

  for (const v of vendedores || []) {
    if (!v.phone || !v.recibe_briefing) continue;

    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', v.id)
      .eq('status', 'new');

    if (leadsSinContactar && leadsSinContactar.length > 0) {
      const mensaje = `💬 *Recordatorio de seguimiento*

${v.name}, tienes ${leadsSinContactar.length} lead(s) nuevos sin contactar.

Revísalos en el CRM y márcalos como contactados.`;

      await meta.sendWhatsAppMessage(v.phone, mensaje);
    }
  }
  
  // 2. Recordatorio a ASESORES HIPOTECARIOS sobre hipotecas sin movimiento
  const { data: asesores } = await supabase.client
    .from('team_members')
    .select('*')
    .eq('role', 'asesor')
    .eq('active', true);
  
  // Buscar hipotecas sin movimiento en los últimos 3 días (configurable)
  const diasSinMovimiento = 3;
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasSinMovimiento);
  
  for (const asesor of asesores || []) {
    if (!asesor.phone) continue;
    
    const { data: hipotecasSinMover } = await supabase.client
      .from('mortgage_applications')
      .select('*')
      .eq('assigned_advisor_id', asesor.id)
      .in('status', ['pending', 'in_review', 'documents'])
      .lt('updated_at', fechaLimite.toISOString());
    
    if (hipotecasSinMover && hipotecasSinMover.length > 0) {
      let mensaje = `🏦 *Recordatorio de Créditos*

${asesor.name}, tienes ${hipotecasSinMover.length} solicitud(es) sin actualizar en ${diasSinMovimiento}+ días:

`;
      
      hipotecasSinMover.slice(0, 5).forEach((h: any, i: number) => {
        mensaje += `${i + 1}. ${h.lead_name} - ${h.bank || 'Banco por definir'}
`;
      });
      
      if (hipotecasSinMover.length > 5) {
        mensaje += `\n...y ${hipotecasSinMover.length - 5} más`;
      }
      
      mensaje += `
⚡ Actualiza el status en el CRM`;
      
      await meta.sendWhatsAppMessage(asesor.phone, mensaje);
      console.log('📤 Recordatorio enviado a asesor:', asesor.name, '-', hipotecasSinMover.length, 'hipotecas');
    }
  }
}

async function verificarVideosPendientes(supabase: SupabaseService, meta: MetaWhatsAppService, env: any): Promise<void> {
  const { data: pendientes } = await supabase.client
    .from('pending_videos')
    .select('*')
    .eq('sent', false)
    .limit(5);

  if (!pendientes || pendientes.length === 0) {
    console.log('📭 No hay videos pendientes');
    return;
  }

  console.log(`🎬 Procesando ${pendientes.length} videos pendientes`);

  for (const video of pendientes) {
    console.log(`🔍 Verificando video: ${video.id} - ${video.lead_name}`);
    try {
      // Verificar estado de la operación en Google
      console.log(`📡 Consultando Google: ${video.operation_id}`);
      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${video.operation_id}`,
        {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        }
      );

      console.log(`📡 Google response status: ${statusResponse.status}`);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.log(`⚠️ Error verificando video ${video.id}: ${errorText}`);
        continue;
      }

      const status = await statusResponse.json() as any;
      console.log(`📡 Video done: ${status.done}`);
      console.log(`📦 Respuesta Google:`, JSON.stringify(status).substring(0, 500));

      if (status.done) {
        // Intentar múltiples rutas para encontrar el URI del video
        const videoUri = 
          status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
          status.response?.generatedSamples?.[0]?.video?.uri ||
          status.result?.videos?.[0]?.uri ||
          status.videos?.[0]?.uri;
        
        console.log(`🔍 URI encontrado: ${videoUri ? 'Sí' : 'NO'}`);
        
        if (videoUri) {
          console.log(`📥 Video URI: ${videoUri.substring(0, 80)}...`);
          
          // ⚠️ MARCAR COMO ENVIADO ANTES para evitar spam si el cron corre múltiples veces
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: videoUri })
            .eq('id', video.id);
          
          try {
            // 1. Descargar video de Google (requiere API key)
            console.log(`📥 Descargando video de Google...`);
            const videoResponse = await fetch(videoUri, {
              headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
            });
            
            if (!videoResponse.ok) {
              console.log(`❌ Error descargando video: ${videoResponse.status}`);
              return;
            }
            
            const videoBuffer = await videoResponse.arrayBuffer();
            console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);
            
            // 2. Subir a Meta
            const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
            console.log(`✅ Video subido a Meta: ${mediaId}`);
            
            // 3. Enviar por WhatsApp
            if (video.lead_phone === 'TEAM_WEEKLY') {
              console.log('📤 Enviando video semanal a todo el equipo...');
              
              const { data: equipo } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .in('role', ['vendedor', 'admin'])
                .eq('active', true);

              for (const miembro of equipo || []) {
                if (!miembro.phone) continue;
                try {
                  await meta.sendWhatsAppVideoById(miembro.phone, mediaId, 
                    `🎬 *¡Video de la semana!*\n\n🏠 ${video.desarrollo}\n\n¡Excelente trabajo equipo! 👪🔥`);
                  console.log(`✅ Video semanal enviado a ${miembro.name}`);
                } catch (e: any) {
                  console.log(`⚠️ Error enviando video a ${miembro.name}: ${e.message}`);
                }
              }
            } else {
              // Video individual (bienvenida)
              await meta.sendWhatsAppVideoById(video.lead_phone, mediaId, 
                `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);
              console.log(`✅ Video enviado a ${video.lead_name}`);
            }
          } catch (downloadError: any) {
            console.log(`❌ Error en flujo de video: ${downloadError.message}`);
          }

        } else if (status.error) {
          console.log(`❌ Video fallido: ${status.error.message}`);
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR: ${status.error.message}` })
            .eq('id', video.id);
        } else {
          console.log(`⚠️ Video completado pero sin URI`);
          console.log(`📦 Estructura completa:`, JSON.stringify(status));
          // Marcar como enviado para evitar reintentos infinitos
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: 'ERROR: No URI found' })
            .eq('id', video.id);
        }
      } else {
        console.log(`⏳ Video ${video.id} aún procesando...`);
      }
    } catch (e: any) {
      console.log(`❌ Error procesando video ${video.id}: ${e.message}`);
      // Marcar como enviado para evitar reintentos infinitos
      await supabase.client
        .from('pending_videos')
        .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR: ${e.message}` })
        .eq('id', video.id);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// VIDEO SEMANAL DE LOGROS - Viernes 6pm
// ═══════════════════════════════════════════════════════════

async function generarVideoSemanalLogros(supabase: SupabaseService, meta: MetaWhatsAppService, env: any): Promise<void> {
  try {
    // Calcular fechas de la semana (lunes a viernes)
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1); // Lunes
    inicioSemana.setHours(0, 0, 0, 0);
    
    const finSemana = new Date(hoy);
    finSemana.setHours(23, 59, 59, 999);

    // Obtener métricas de la semana
    const { data: leadsNuevos } = await supabase.client
      .from('leads')
      .select('id', { count: 'exact' })
      .gte('created_at', inicioSemana.toISOString())
      .lte('created_at', finSemana.toISOString());

    const { data: citasAgendadas } = await supabase.client
      .from('appointments')
      .select('id', { count: 'exact' })
      .gte('created_at', inicioSemana.toISOString())
      .lte('created_at', finSemana.toISOString());

    const { data: cierres } = await supabase.client
      .from('leads')
      .select('id, assigned_to', { count: 'exact' })
      .eq('status', 'closed')
      .gte('status_changed_at', inicioSemana.toISOString())
      .lte('status_changed_at', finSemana.toISOString());

    // Calcular top performer
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('role', 'vendedor')
      .eq('active', true);

    let topPerformer = { name: 'El equipo', cierres: 0 };
    if (vendedores && cierres) {
      const cierresPorVendedor: Record<string, number> = {};
      for (const c of cierres) {
        if (c.assigned_to) {
          cierresPorVendedor[c.assigned_to] = (cierresPorVendedor[c.assigned_to] || 0) + 1;
        }
      }
      
      let maxCierres = 0;
      for (const [vendedorId, count] of Object.entries(cierresPorVendedor)) {
        if (count > maxCierres) {
          maxCierres = count;
          const vendedor = vendedores.find(v => v.id === vendedorId);
          if (vendedor) {
            topPerformer = { name: vendedor.name.split(' ')[0], cierres: count };
          }
        }
      }
    }

    const numLeads = leadsNuevos?.length || 0;
    const numCitas = citasAgendadas?.length || 0;
    const numCierres = cierres?.length || 0;

    console.log(`📊 Métricas semana: ${numLeads} leads, ${numCitas} citas, ${numCierres} cierres`);

    // Primero enviar mensaje de texto con métricas
    const mensajeTexto = `🏠 *¡RESUMEN SEMANAL EQUIPO SANTA RITA!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 *Esta semana logramos:*\n\n` +
      `👥 *${numLeads}* leads nuevos\n` +
      `📅 *${numCitas}* citas agendadas\n` +
      `✅ *${numCierres}* cierres\n\n` +
      `🥇 *Top performer:* ${topPerformer.name}${topPerformer.cierres > 0 ? ` (${topPerformer.cierres} cierres)` : ''}\n\n` +
      `¡Excelente trabajo equipo! 🔥\n` +
      `El video motivacional viene en camino... 🎬`;

    // Enviar a todos los vendedores y admins
    const { data: equipo } = await supabase.client
      .from('team_members')
      .select('phone, name')
      .in('role', ['vendedor', 'admin'])
      .eq('active', true);

    for (const miembro of equipo || []) {
      if (!miembro.phone) continue;
      try {
        await meta.sendWhatsAppMessage(miembro.phone, mensajeTexto);
        console.log(`✅ Resumen enviado a ${miembro.name}`);
      } catch (e) {
        console.log(`⚠️ Error enviando a ${miembro.name}`);
      }
    }

    // Generar video con Veo 3
    const promptVideo = `Celebratory office scene with Mexican real estate team. 
Text overlay appears: "SEMANA EXITOSA" then "${numLeads} LEADS | ${numCitas} CITAS | ${numCierres} CIERRES".
Then "TOP: ${topPerformer.name}" with trophy emoji.
Team clapping and celebrating. Professional, modern office background.
Upbeat motivational feeling. 8 seconds. No audio needed.`;

    console.log('🎬 Generando video semanal con Veo 3...');

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        instances: [{
          prompt: promptVideo
        }],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds: 8
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('⚠️ Veo 3 error:', errorText);
      return;
    }

    const result = await response.json();
    const operationName = result.name;
    
    if (!operationName) {
      console.log('⚠️ No operation name para video semanal');
      return;
    }

    console.log('🎬 Video semanal en proceso:', operationName);

    // Guardar para que el CRON lo procese y envíe
    // Usamos un teléfono especial "TEAM_WEEKLY" para identificar que es video grupal
    await supabase.client
      .from('pending_videos')
      .insert({
        operation_id: operationName,
        lead_phone: 'TEAM_WEEKLY',
        lead_name: 'Equipo Santa Rita',
        desarrollo: `Semana: ${numLeads}L/${numCitas}C/${numCierres}V`,
        sent: false
      });

    console.log('✅ Video semanal programado para envío');

  } catch (error) {
    console.error('❌ Error generando video semanal:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTAS PROACTIVAS CEO
// ═══════════════════════════════════════════════════════════════

async function enviarAlertasProactivasCEO(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
        await meta.sendWhatsAppMessage(admin.phone, msg);
        console.log(`🚨 Alerta enviada a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando alerta a ${admin.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en alertas proactivas:', e);
  }
}

async function alertaLeadsHotSinSeguimiento(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener CEOs/Admins
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .in('role', ['admin', 'coordinador'])
      .eq('active', true);

    if (!admins || admins.length === 0) return;

    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

    // Leads HOT que no han sido actualizados hoy
    const { data: hotSinSeguimiento } = await supabase.client
      .from('leads')
      .select('*, team_members!leads_assigned_to_fkey(name)')
      .in('status', ['negotiation', 'reserved'])
      .lt('updated_at', inicioHoy);

    if (!hotSinSeguimiento || hotSinSeguimiento.length === 0) {
      console.log('✅ Todos los leads HOT tienen seguimiento hoy');
      return;
    }

    // Construir mensaje
    let msg = `🔥 *LEADS HOT SIN SEGUIMIENTO HOY*\n\n`;
    msg += `Total: ${hotSinSeguimiento.length} leads\n\n`;

    for (const lead of hotSinSeguimiento.slice(0, 5)) {
      const vendedor = lead.team_members?.name || 'Sin asignar';
      msg += `• *${lead.name || 'Sin nombre'}*\n`;
      msg += `  ${lead.status} | Vendedor: ${vendedor}\n`;
    }

    if (hotSinSeguimiento.length > 5) {
      msg += `\n...y ${hotSinSeguimiento.length - 5} más`;
    }

    msg += '\n\n⚡ _Estos leads están listos para cerrar. Dar seguimiento urgente._';

    // Enviar a cada admin (evitar duplicados)
    const telefonosEnviados = new Set<string>();
    for (const admin of admins) {
      if (!admin.phone) continue;
      const tel = admin.phone.replace(/\D/g, '');
      if (telefonosEnviados.has(tel)) continue;
      telefonosEnviados.add(tel);
      
      try {
        await meta.sendWhatsAppMessage(admin.phone, msg);
        console.log(`🔥 Alerta HOT enviada a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando alerta HOT a ${admin.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en alerta leads HOT:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// COACHING PROACTIVO - 11am L-V
// ═══════════════════════════════════════════════════════════════

async function enviarCoachingProactivo(supabase: SupabaseService, meta: MetaWhatsAppService, vendedores: any[]): Promise<void> {
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
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
        console.log(`🎯 Coaching enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando coaching a ${vendedor.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en coaching proactivo:', e);
  }
}

function calcularDiasEnEtapa(lead: any): number {
  const statusChangedAt = lead.status_changed_at ? new Date(lead.status_changed_at) : new Date(lead.created_at);
  return Math.floor((Date.now() - statusChangedAt.getTime()) / (1000 * 60 * 60 * 24));
}

// ═══════════════════════════════════════════════════════════════
// A/B TESTING - Sistema de pruebas de mensajes
// ═══════════════════════════════════════════════════════════════

async function getABVariant(supabase: SupabaseService, testName: string, leadId: string): Promise<'A' | 'B'> {
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
    return 'A'; // Default a variante A si hay error
  }
}

async function trackABConversion(supabase: SupabaseService, testName: string, leadId: string): Promise<void> {
  try {
    await supabase.client
      .from('ab_test_assignments')
      .update({ converted: true, converted_at: new Date().toISOString() })
      .eq('test_name', testName)
      .eq('lead_id', leadId);
  } catch (e) {
    console.log('Error tracking AB conversion:', e);
  }
}

async function getABTestResults(supabase: SupabaseService, testName: string): Promise<any> {
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
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// REMARKETING LEADS FRÍOS - Reactivación automática
// ═══════════════════════════════════════════════════════════════

async function remarketingLeadsFrios(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
      .not('status', 'in', '("closed","lost","delivered")')
      .is('remarketing_sent', null)
      .limit(10); // Máximo 10 por ejecución

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
        .replace('{nombre}', lead.name?.split(' ')[0] || 'amigo');

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);
        
        // Marcar como enviado
        await supabase.client
          .from('leads')
          .update({ 
            remarketing_sent: new Date().toISOString(),
            updated_at: new Date().toISOString()
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
  }
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK / MONITOREO
// ═══════════════════════════════════════════════════════════════

async function getHealthStatus(supabase: SupabaseService): Promise<any> {
  const checks: any = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {}
  };

  try {
    // Check Supabase
    const { count: leadsCount } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true });
    checks.checks.supabase = { status: 'ok', leads_count: leadsCount };
  } catch (e) {
    checks.checks.supabase = { status: 'error', error: String(e) };
    checks.status = 'degraded';
  }

  try {
    // Check follow-ups pendientes
    const { count: followupsCount } = await supabase.client
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    checks.checks.followups = { status: 'ok', pending: followupsCount };
  } catch (e) {
    checks.checks.followups = { status: 'error' };
  }

  try {
    // Check videos pendientes
    const { count: videosCount } = await supabase.client
      .from('pending_videos')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    checks.checks.videos = { status: 'ok', pending: videosCount };
  } catch (e) {
    checks.checks.videos = { status: 'error' };
  }

  // Métricas del día
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

  try {
    const { count: leadsHoy } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioHoy);

    const { count: citasHoy } = await supabase.client
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('scheduled_date', hoy.toISOString().split('T')[0]);

    checks.metrics = {
      leads_today: leadsHoy || 0,
      appointments_today: citasHoy || 0
    };
  } catch (e) {
    checks.metrics = { error: 'Failed to fetch' };
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════
// BACKUP - Exportar datos críticos
// ═══════════════════════════════════════════════════════════════

async function exportBackup(supabase: SupabaseService): Promise<any> {
  const backup: any = {
    generated_at: new Date().toISOString(),
    tables: {}
  };

  try {
    // Leads (últimos 90 días)
    const hace90dias = new Date();
    hace90dias.setDate(hace90dias.getDate() - 90);
    
    const { data: leads } = await supabase.client
      .from('leads')
      .select('*')
      .gte('created_at', hace90dias.toISOString());
    backup.tables.leads = { count: leads?.length || 0, data: leads };

    // Appointments (últimos 90 días)
    const { data: appointments } = await supabase.client
      .from('appointments')
      .select('*')
      .gte('created_at', hace90dias.toISOString());
    backup.tables.appointments = { count: appointments?.length || 0, data: appointments };

    // Team members
    const { data: team } = await supabase.client
      .from('team_members')
      .select('*');
    backup.tables.team_members = { count: team?.length || 0, data: team };

    // Followup rules
    const { data: rules } = await supabase.client
      .from('followup_rules')
      .select('*');
    backup.tables.followup_rules = { count: rules?.length || 0, data: rules };

    // Properties
    const { data: properties } = await supabase.client
      .from('properties')
      .select('*');
    backup.tables.properties = { count: properties?.length || 0, data: properties };

    backup.status = 'success';
  } catch (e) {
    backup.status = 'error';
    backup.error = String(e);
  }

  return backup;
}

// ═══════════════════════════════════════════════════════════════
// FLUJO CRÉDITO MEJORADO - Seguimiento automático hipotecas
// ═══════════════════════════════════════════════════════════════

async function seguimientoHipotecas(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);

    // Hipotecas en banco sin actualización en 7+ días
    const { data: hipotecasEstancadas } = await supabase.client
      .from('mortgage_applications')
      .select('*, leads(name, phone), team_members!mortgage_applications_assigned_advisor_id_fkey(name, phone)')
      .eq('status', 'sent_to_bank')
      .lt('updated_at', hace7dias.toISOString());

    if (!hipotecasEstancadas || hipotecasEstancadas.length === 0) {
      console.log('✅ No hay hipotecas estancadas');
      return;
    }

    // Notificar a asesores
    for (const hip of hipotecasEstancadas) {
      const asesor = hip.team_members;
      const lead = hip.leads;
      
      if (!asesor?.phone) continue;

      const diasEnBanco = Math.floor((Date.now() - new Date(hip.updated_at).getTime()) / (1000 * 60 * 60 * 24));

      const msg = `⚠️ *HIPOTECA ESTANCADA*\n\n` +
        `Cliente: *${lead?.name || 'Sin nombre'}*\n` +
        `Banco: *${hip.bank || 'No especificado'}*\n` +
        `Días en banco: *${diasEnBanco}*\n\n` +
        `_Por favor da seguimiento y actualiza el estatus_`;

      try {
        await meta.sendWhatsAppMessage(asesor.phone, msg);
        console.log(`📢 Alerta hipoteca enviada a ${asesor.name}`);
      } catch (e) {
        console.log(`Error notificando asesor:`, e);
      }
    }
  } catch (e) {
    console.log('Error en seguimiento hipotecas:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROMOCIONES - Recordatorios automáticos
// ═══════════════════════════════════════════════════════════════

async function enviarRecordatoriosPromociones(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const dayOfWeek = hoy.getDay(); // 0=Dom, 1=Lun, etc.

    // Obtener promociones activas (dentro del rango de fechas y no pausadas)
    const { data: promos } = await supabase.client
      .from('promotions')
      .select('*')
      .lte('start_date', hoyStr)
      .gte('end_date', hoyStr)
      .neq('status', 'paused')
      .neq('status', 'cancelled')
      .neq('status', 'completed');

    if (!promos || promos.length === 0) {
      console.log('📭 No hay promociones activas para enviar');
      return;
    }

    console.log(`🎯 Procesando ${promos.length} promociones activas`);

    for (const promo of promos) {
      // Verificar si toca enviar recordatorio hoy
      const startDate = new Date(promo.start_date);
      const endDate = new Date(promo.end_date);
      const diasTranscurridos = Math.floor((hoy.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const diasRestantes = Math.floor((endDate.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      const lastSent = promo.last_reminder_sent ? new Date(promo.last_reminder_sent) : null;
      const diasDesdeUltimo = lastSent ? Math.floor((hoy.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24)) : 999;

      let debeEnviar = false;
      let tipoMensaje = 'reminder';

      // Día 1: Mensaje inicial
      if (diasTranscurridos === 0) {
        debeEnviar = true;
        tipoMensaje = 'initial';
      }
      // Último día: Mensaje urgente
      else if (diasRestantes === 0) {
        debeEnviar = true;
        tipoMensaje = 'final';
      }
      // Recordatorios según frecuencia
      else if (promo.reminder_frequency === 'daily' && diasDesdeUltimo >= 1) {
        debeEnviar = true;
      }
      else if (promo.reminder_frequency === 'weekly' && diasDesdeUltimo >= 7) {
        debeEnviar = true;
      }
      // Mitad de la promo (para promos largas)
      else if (diasRestantes === Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) / 2)) {
        debeEnviar = true;
        tipoMensaje = 'midpoint';
      }

      if (!debeEnviar) {
        console.log(`⏭️ ${promo.name}: No toca enviar hoy`);
        continue;
      }

      console.log(`📤 ${promo.name}: Enviando ${tipoMensaje}...`);

      // Obtener leads del segmento
      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, lead_score, score, status, property_interest');

      if (!leads) continue;

      let leadsSegmento = leads.filter(l => l.phone);

      // Filtrar por segmento
      const seg = promo.target_segment || 'todos';
      if (seg === 'hot') {
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 70);
      } else if (seg === 'warm') {
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) >= 40 && (l.lead_score || l.score || 0) < 70);
      } else if (seg === 'cold') {
        leadsSegmento = leadsSegmento.filter(l => (l.lead_score || l.score || 0) < 40);
      } else if (seg === 'compradores') {
        leadsSegmento = leadsSegmento.filter(l => ['closed_won', 'delivered'].includes(l.status));
      } else if (seg === 'caidos') {
        leadsSegmento = leadsSegmento.filter(l => l.status === 'fallen');
      }

      // Preparar mensaje según tipo
      let mensajeBase = promo.message;
      if (tipoMensaje === 'final') {
        mensajeBase = `⚡ *ULTIMO DIA* ⚡\n\n${promo.message}\n\n_¡Hoy termina la promoción!_`;
      } else if (tipoMensaje === 'midpoint') {
        mensajeBase = `📢 *RECORDATORIO*\n\n${promo.message}\n\n_Quedan ${diasRestantes} días_`;
      } else if (tipoMensaje === 'initial') {
        mensajeBase = `🎉 *${promo.name}*\n\n${promo.message}`;
      }

      let enviados = 0;
      for (const lead of leadsSegmento) {
        try {
          const mensaje = mensajeBase
            .replace(/{nombre}/gi, lead.name || 'amigo')
            .replace(/{desarrollo}/gi, lead.property_interest || 'nuestros desarrollos');

          const phone = lead.phone.startsWith('52') ? lead.phone : '52' + lead.phone;
          await meta.sendWhatsAppMessage(phone, mensaje);

          // Log
          await supabase.client.from('promotion_logs').insert({
            promotion_id: promo.id,
            lead_id: lead.id,
            lead_phone: lead.phone,
            lead_name: lead.name,
            message_type: tipoMensaje,
            status: 'sent'
          });

          enviados++;

          // Pausa para no saturar
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          console.error(`Error enviando a ${lead.phone}:`, e);
        }
      }

      // Actualizar promo
      await supabase.client
        .from('promotions')
        .update({
          status: 'active',
          last_reminder_sent: hoyStr,
          reminders_sent_count: (promo.reminders_sent_count || 0) + 1,
          total_reached: (promo.total_reached || 0) + enviados,
          updated_at: new Date().toISOString()
        })
        .eq('id', promo.id);

      console.log(`✅ ${promo.name}: ${enviados} mensajes enviados`);

      // Si es el último día, marcar como completada
      if (tipoMensaje === 'final') {
        await supabase.client
          .from('promotions')
          .update({ status: 'completed' })
          .eq('id', promo.id);
      }
    }

  } catch (e) {
    console.error('Error en recordatorios de promociones:', e);
  }
}
