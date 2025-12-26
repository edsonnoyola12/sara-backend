import { SupabaseService } from './services/supabase';
import { OpenAIService } from './services/openai';

import { MetaWhatsAppService } from './services/meta-whatsapp';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
import { handleTeamRoutes } from './routes/team-routes';
import { FollowupService } from './services/followupService';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_API_KEY: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // API Routes - Team Members
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (url.pathname.startsWith('/api/team-members')) {
      const response = await handleTeamRoutes(request, env, supabase);
      if (response) return response;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // Test Cron - Forzar verificaciÃ³n de videos
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (url.pathname === '/test-cron' && request.method === 'GET') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      console.log('ðŸ”§ FORZANDO verificaciÃ³n de videos...');
      await verificarVideosPendientes(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Cron ejecutado' }));
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // API Routes - Leads
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICAR AL VENDEDOR CUANDO CAMBIA EL STATUS
      // ═══════════════════════════════════════════════════════════════
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
                'reserved': '📝 RESERVADO',
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
📝 *Notas:* ${data.notes || 'Sin notas'}
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

    // ═══════════════════════════════════════════════════════════════
    // API: Crear Lead con Round-Robin + Notificaciones Completas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/leads' && request.method === 'POST') {
      const body = await request.json() as any;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      
      let vendedorAsignado = null;
      const esVendedor = body.creador_role === 'vendedor';
      
      // Si no tiene assigned_to, usar round-robin
      if (!body.assigned_to) {
        // Round-robin: obtener vendedor con menos leads activos
        const { data: vendedores } = await supabase.client
          .from('team_members')
          .select('*')
          .eq('role', 'vendedor')
          .eq('active', true);
        
        if (vendedores && vendedores.length > 0) {
          // Contar leads por vendedor
          const vendedoresConCarga = await Promise.all(
            vendedores.map(async (v) => {
              const { count } = await supabase.client
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('assigned_to', v.id)
                .in('status', ['new', 'contacted', 'scheduled']);
              return { ...v, carga: count || 0 };
            })
          );
          
          // Ordenar por menor carga
          vendedoresConCarga.sort((a, b) => a.carga - b.carga);
          vendedorAsignado = vendedoresConCarga[0];
          body.assigned_to = vendedorAsignado.id;
          console.log('🔄 Round-robin asignó a:', vendedorAsignado.name, 'con', vendedorAsignado.carga, 'leads');
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
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICACIÓN 1: Al vendedor (solo si NO es él quien creó)
      // ═══════════════════════════════════════════════════════════════
      if (vendedorAsignado?.phone && !esVendedor) {
        try {
          const citaInfo = body.tiene_cita 
            ? `\n📅 *Cita:* ${body.cita_fecha} a las ${body.cita_hora}\n📍 *Lugar:* ${body.cita_desarrollo}${gpsLink ? '\n🗺️ *Maps:* ' + gpsLink : ''}` 
            : '';
          
          const creditoInfo = body.necesita_credito === 'si'
            ? `\n🏦 *Crédito:* Sí necesita (${body.banco_preferido || 'banco por definir'})`
            : '';
          
          const mensaje = `📋 *NUEVO LEAD ASIGNADO*
━━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name}
📱 *Tel:* ${data.phone}
📣 *Fuente:* ${body.source || 'CRM'}

🏠 *Interés:* ${data.property_interest || 'No especificado'}
${body.modelo ? `🏡 *Modelo:* ${body.modelo}` : ''}
💰 *Presupuesto:* ${data.budget || 'No especificado'}
${creditoInfo}${citaInfo}

📝 *Notas:* ${body.notas || 'Sin notas'}

━━━━━━━━━━━━━━━━━━━━━━
⚡ *¡Contactar pronto!*
👤 Asignado por: ${body.creador_name || 'CRM'}`;
          
          await meta.sendWhatsAppMessage(vendedorAsignado.phone, mensaje);
          console.log('📤 Notificación enviada a vendedor:', vendedorAsignado.name);
        } catch (e) {
          console.log('⚠️ Error notificando vendedor:', e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CREAR MORTGAGE APPLICATION (siempre que necesite crédito)
      // ═══════════════════════════════════════════════════════════════
      let asesorAsignado: any = null;
      
      if (body.necesita_credito === 'si') {
        try {
          console.log('🔍 Buscando asesor para banco:', body.banco_preferido);
          
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
━━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.name}
📱 *Tel:* ${data.phone}

🏦 *Banco:* ${body.banco_preferido}
💵 *Ingreso:* ${body.ingreso_mensual || 'No especificado'}
💰 *Enganche:* ${body.enganche_disponible || 'No especificado'}

🏠 *Interés:* ${data.property_interest || 'No especificado'}
💰 *Presupuesto:* ${data.budget || 'No especificado'}

━━━━━━━━━━━━━━━━━━━━━━
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
      
      // ═══════════════════════════════════════════════════════════════
      // CREAR CITA (si tiene cita agendada)
      // ═══════════════════════════════════════════════════════════════
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
      
      // ═══════════════════════════════════════════════════════════════
      // NOTIFICACIÓN 3: Al cliente (confirmación)
      // ═══════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    // API Routes - Appointments
    // ═══════════════════════════════════════════════════════════════
    
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
        
        // ═══ ENVIAR NOTIFICACIONES ═══
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
        
        // 1. Notificar al CLIENTE
        if (body.lead_phone) {
          try {
            const msgCliente = `📅 *CITA CONFIRMADA*

¡Hola ${body.lead_name || ''}! 👋

Tu cita ha sido agendada:

📆 *Fecha:* ${fechaFormateada}
🕐 *Hora:* ${citaHora}
📍 *Lugar:* ${body.property_name || 'Por confirmar'}
${gpsLink ? '🗺️ *Ubicación:* ' + gpsLink : ''}
👤 *Te atenderá:* ${body.vendedor_name || 'Un asesor'}

¡Te esperamos! 🏠`;
            
            const phoneCliente = body.lead_phone.replace(/[^0-9]/g, '');
            await meta.sendWhatsAppMessage(phoneCliente, msgCliente);
            console.log('📤 Notificación enviada a cliente:', body.lead_name);
          } catch (e) {
            console.log('⚠️ Error notificando cliente:', e);
          }
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
            
            // Notificar al cliente
            const msgCliente = `📅 *CITA REAGENDADA*

Hola ${body.lead_name || 'estimado cliente'} 👋

Tu cita ha sido reprogramada:

📆 *Nueva fecha:* ${fechaFormateada}
🕐 *Hora:* ${horaFormateada}
📍 *Lugar:* ${body.property_name || 'Por confirmar'}
${gpsLink ? '🗺️ *Ubicación:* ' + gpsLink : ''}

¡Te esperamos! 🏠`;

            await meta.sendWhatsAppMessage(body.lead_phone, msgCliente);
            console.log('📤 Notificación enviada a cliente:', body.lead_name);
            
            // Notificar al vendedor si existe
            if (body.vendedor_id) {
              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('phone')
                .eq('id', body.vendedor_id)
                .single();
              
              if (vendedor?.phone) {
                const msgVendedor = `📅 *CITA REAGENDADA*

👤 Cliente: ${body.lead_name}
📱 Tel: ${body.lead_phone}
📆 Nueva fecha: ${fechaFormateada}
🕐 Hora: ${horaFormateada}
📍 Lugar: ${body.property_name || 'Por confirmar'}
${gpsLink ? '🗺️ Maps: ' + gpsLink : ''}`;

                await meta.sendWhatsAppMessage(vendedor.phone, msgVendedor);
                console.log('📤 Notificación enviada a vendedor:', body.vendedor_name);
              }
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


    // ═══════════════════════════════════════════════════════════════
    // API Routes - Mortgage Applications (Hipotecas)
    // ═══════════════════════════════════════════════════════════════
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
            
            console.log('👔 Vendedor:', vendedor?.name, vendedor?.phone);
            
            if (vendedor?.phone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              
              const statusEmoji: Record<string, string> = {
                'pending': '⏳',
                'in_review': '📋',
                'documents': '📄',
                'submitted': '📤',
                'approved': '✅',
                'rejected': '❌',
                'funded': '💰'
              };
              
              const statusText: Record<string, string> = {
                'pending': 'Pendiente',
                'in_review': 'En revisión',
                'documents': 'Esperando documentos',
                'submitted': 'Enviado al banco',
                'approved': '¡APROBADO!',
                'rejected': 'Rechazado',
                'funded': '¡Fondeado!'
              };
              
              const emoji = statusEmoji[body.status] || '📋';
              const texto = statusText[body.status] || body.status;
              
              const mensaje = `${emoji} *ACTUALIZACIÓN CRÉDITO*
━━━━━━━━━━━━━━━━━━━━━━

👤 *Cliente:* ${data.lead_name || lead.name}
🏦 *Banco:* ${data.bank || 'No especificado'}
📊 *Nuevo status:* ${texto}

${body.notes ? '📝 *Notas:* ' + body.notes : ''}
━━━━━━━━━━━━━━━━━━━━━━
👤 Asesor: ${data.assigned_advisor_name || 'Sin asignar'}`;
              
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // API Routes - Properties
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // API Routes - Dashboard
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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


    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // Webhook WhatsApp (Meta)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

          const openai = new OpenAIService(env.OPENAI_API_KEY);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const handler = new WhatsAppHandler(supabase, openai, meta as any, calendar);

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

    // ═══════════════════════════════════════════════════════════════
    // Webhook Facebook Lead Ads - Recibir leads de Meta Ads
    // ═══════════════════════════════════════════════════════════════
    
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
        console.log('📥 Facebook Lead recibido:', JSON.stringify(body));
        
        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        
        // Facebook Lead Ads envía el campo "leadgen_id"
        if (changes?.field === 'leadgen' && changes?.value?.leadgen_id) {
          const leadgenId = changes.value.leadgen_id;
          const formId = changes.value.form_id;
          const pageId = changes.value.page_id;
          const createdTime = changes.value.created_time;
          
          console.log(`🎯 Nuevo lead de Facebook: ${leadgenId}`);
          
          // En una implementación completa, aquí harías una llamada a la Graph API
          // para obtener los datos del lead usando el leadgen_id:
          // GET /{leadgen_id}?access_token={page_access_token}
          // 
          // Por ahora, registramos el evento y el lead se puede procesar manualmente
          // o con un proceso batch que obtenga los datos de la Graph API
          
          // Buscar vendedor para asignar (round-robin)
          const { data: vendedores } = await supabase.client
            .from('team_members')
            .select('*')
            .eq('role', 'vendedor')
            .eq('active', true)
            .order('sales_count', { ascending: true })
            .limit(1);
          
          const vendedorAsignado = vendedores?.[0];
          
          // Crear lead placeholder
          const { data: nuevoLead, error } = await supabase.client
            .from('leads')
            .insert({
              name: `Facebook Lead ${leadgenId.slice(-6)}`,
              source: 'facebook_ads',
              status: 'new',
              score: 60,
              assigned_to: vendedorAsignado?.id || null,
              notes: {
                facebook_leadgen_id: leadgenId,
                facebook_form_id: formId,
                facebook_page_id: pageId,
                facebook_created: createdTime,
                pending_data_fetch: true
              }
            })
            .select()
            .single();
          
          if (error) {
            console.error('Error creando lead de Facebook:', error);
          } else {
            console.log(`✅ Lead creado: ${nuevoLead.id}`);
            
            // Notificar al vendedor asignado
            if (vendedorAsignado?.phone) {
              const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              await meta.sendWhatsAppMessage(vendedorAsignado.phone,
                `🎯 *NUEVO LEAD DE FACEBOOK*\n\n` +
                `Llegó un lead desde tus anuncios de Facebook.\n\n` +
                `📋 ID: ${leadgenId.slice(-6)}\n` +
                `⏰ ${new Date(createdTime * 1000).toLocaleString('es-MX')}\n\n` +
                `⚠️ _Revisa el CRM para ver los datos completos_`
              );
            }
          }
        }
        
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Facebook Leads Webhook Error:', error);
        return new Response('OK', { status: 200 });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Webhook Google Calendar - Sincronizar cambios Google → CRM
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/google-calendar' && request.method === 'POST') {
      try {
        const channelId = request.headers.get('X-Goog-Channel-ID');
        const resourceState = request.headers.get('X-Goog-Resource-State');
        
        console.log('📅 Google Calendar Webhook:', resourceState, channelId);
        
        // Solo procesar si hay cambios (no sync inicial)
        if (resourceState === 'exists' || resourceState === 'update') {
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          
          // Obtener eventos de las últimas 24 horas y próximos 30 días
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          
          const events = await calendar.getEvents(yesterday.toISOString(), nextMonth.toISOString());
          
          for (const event of events) {
            // Buscar cita en DB por google_event_id
            const { data: appointment } = await supabase.client
              .from('appointments')
              .select('*')
              .eq('google_event_vendedor_id', event.id)
              .single();
            
            if (appointment) {
              // Verificar si el evento fue cancelado
              if (event.status === 'cancelled') {
                await supabase.client
                  .from('appointments')
                  .update({ 
                    status: 'cancelled', 
                    cancelled_by: 'Google Calendar',
                  })
                  .eq('id', appointment.id);
                console.log('📅 Cita cancelada desde Google:', appointment.id);
              } else {
                // Actualizar fecha/hora si cambió
                // Extraer fecha/hora directamente del string (no usar Date que convierte a UTC)
                const dateTimeStr = event.start?.dateTime || event.start?.date || '';
                // dateTimeStr puede ser "2025-12-26T18:26:00-06:00" o "2025-12-26T18:26:00"
                const newDate = dateTimeStr.substring(0, 10); // "2025-12-26"
                const newTime = dateTimeStr.substring(11, 16); // "18:26"
                
                if (newDate && newTime && (appointment.scheduled_date !== newDate || appointment.scheduled_time.substring(0,5) !== newTime)) {
                  await supabase.client
                    .from('appointments')
                    .update({
                      scheduled_date: newDate,
                      scheduled_time: newTime,
                      property_name: event.location || appointment.property_name,
                    })
                    .eq('id', appointment.id);
                  console.log('📅 Cita reagendada desde Google:', appointment.id, newDate, newTime);
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // TEST: Verificar videos pendientes
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (url.pathname === '/test-videos') {
      console.log('ðŸ§ª TEST: Forzando verificaciÃ³n de videos...');
      await verificarVideosPendientes(supabase, new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN), env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Videos verificados' }));
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // TEST: Verificar follow-ups pendientes
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (url.pathname === '/test-followups') {
      console.log('ðŸ§ª TEST: Forzando verificaciÃ³n de follow-ups...');
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // TEST: Generar video semanal manualmente
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (url.pathname === '/test-video-semanal') {
      console.log('ðŸ§ª TEST: Generando video semanal de logros...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await generarVideoSemanalLogros(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Video semanal iniciado. El CRON lo enviarÃ¡ cuando estÃ© listo.' }));
    }


    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-diario') {
      console.log('TEST: Enviando reporte diario CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte diario enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-semanal') {
      console.log('TEST: Enviando reporte semanal CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte semanal enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-mensual') {
      console.log('TEST: Enviando reporte mensual CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte mensual enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // HEALTH CHECK - Estado del sistema
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/health') {
      const health = await getHealthStatus(supabase);
      return corsResponse(JSON.stringify(health));
    }

    // ═══════════════════════════════════════════════════════════════
    // BACKUP - Exportar datos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/backup') {
      console.log('📦 Generando backup...');
      const backup = await exportBackup(supabase);
      return corsResponse(JSON.stringify(backup));
    }

    // ═══════════════════════════════════════════════════════════════
    // A/B TEST RESULTS - Ver resultados
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/ab-results') {
      const testName = url.searchParams.get('test') || 'welcome_message';
      const results = await getABTestResults(supabase, testName);
      return corsResponse(JSON.stringify(results || { error: 'No results found' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Remarketing leads fríos
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-remarketing') {
      console.log('TEST: Ejecutando remarketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await remarketingLeadsFrios(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Remarketing ejecutado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Seguimiento hipotecas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-hipotecas') {
      console.log('TEST: Verificando hipotecas estancadas...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await seguimientoHipotecas(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Seguimiento hipotecas ejecutado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alertas proactivas CEO
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-alertas-proactivas') {
      console.log('TEST: Enviando alertas proactivas CEO...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarAlertasProactivasCEO(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Alertas proactivas enviadas' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alerta leads HOT sin seguimiento
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-alerta-hot') {
      console.log('TEST: Enviando alerta leads HOT...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await alertaLeadsHotSinSeguimiento(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Alerta HOT enviada' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Coaching proactivo
    // ═══════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    // TEST: Briefing matutino
    // ═══════════════════════════════════════════════════════════════
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
        if (!v.phone) continue;
        await enviarBriefingMatutino(supabase, meta, v);
        enviados++;
      }
      return corsResponse(JSON.stringify({ ok: true, message: 'Briefings enviados', count: enviados }));
    }

    // ═══════════════════════════════════════════════════════════════
    // STATUS: Ver estado de todos los CRONs
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/cron-status') {
      const now = new Date();
      const mexicoHour = (now.getUTCHours() - 6 + 24) % 24;
      const mexicoMinute = now.getUTCMinutes();
      const dayOfWeek = now.getUTCDay();
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CRON JOBS - Mensajes automÃ¡ticos
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

    const now = new Date();
    const mexicoHour = (now.getUTCHours() - 6 + 24) % 24;
    const mexicoMinute = now.getUTCMinutes();
    const dayOfWeek = now.getUTCDay();
    
    // Solo ejecutar tareas horarias en los primeros 2 minutos de la hora
    const isFirstRunOfHour = mexicoMinute < 2;

    console.log(`Cron ejecutado: ${mexicoHour}:${mexicoMinute.toString().padStart(2, '0')} Mexico, dia ${dayOfWeek}`);

    // Obtener vendedores activos
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    // 9am: Felicitaciones de cumpleanos (solo primer ejecucion de la hora)
    if (mexicoHour === 9 && isFirstRunOfHour) {
      console.log('Enviando felicitaciones...');
      await enviarFelicitaciones(supabase, meta);
    }

    // 8am L-V: Briefing matutino (solo primer ejecucion de la hora)
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log('Enviando briefing matutino...');
      for (const v of vendedores) {
        if (!v.phone) continue;
        await enviarBriefingMatutino(supabase, meta, v);
      }
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

    // 7pm L-V: Recap del dia (solo primer ejecucion de la hora)
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log('Enviando recap del dia...');
      for (const v of vendedores) {
        if (!v.phone) continue;
        await enviarRecapDiario(meta, v);
      }
    }

    // Viernes 6pm: Video semanal de logros con Veo 3 (solo primer ejecucion)
    if (mexicoHour === 18 && isFirstRunOfHour && dayOfWeek === 5) {
      console.log('ðŸŽ¬ Generando video semanal de logros...');
      await generarVideoSemanalLogros(supabase, meta, env);
    }

    // SÃ¡bado 12pm: Recap semanal
    if (mexicoHour === 12 && isFirstRunOfHour && dayOfWeek === 6 && vendedores) {
      console.log('ðŸ“Š Enviando recap semanal...');
      for (const v of vendedores) {
        if (!v.phone) continue;
        await enviarRecapSemanal(supabase, meta, v);
      }
    }

    // RECORDATORIOS DE CITAS - cada ejecuciÃ³n del cron
    console.log('ðŸ”” Verificando recordatorios de citas...');
    await enviarRecordatoriosCitas(supabase, meta);

    // Verificar videos pendientes
    console.log('ðŸŽ¬ Verificando videos pendientes...');
    await verificarVideosPendientes(supabase, meta, env);

    // FOLLOW-UPS AUTOMÃTICOS
    console.log('ðŸ“¬ Procesando follow-ups pendientes...');
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
      console.log('âš ï¸ Verificando leads estancados...');
      await verificarLeadsEstancados(supabase, meta);
      console.log('ðŸ‘” Enviando recordatorios a asesores...');
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
  },
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FUNCIONES DE MENSAJES AUTOMÃTICOS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
      const mensaje = `âš ï¸ *ALERTA: ${leadsVendedor.length} lead(s) estancado(s)*\n\n` +
        leadsVendedor.slice(0, 5).map((l: any) => 
          `â€¢ ${l.name || 'Sin nombre'} - ${accionStatus[status]}`
        ).join('\n') +
        (leadsVendedor.length > 5 ? `\n...y ${leadsVendedor.length - 5} mÃ¡s` : '') +
        `\n\nðŸ‘‰ Actualiza su status en el CRM`;

      await meta.sendWhatsAppMessage(phone, mensaje);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTES CEO AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL CEO - Día 1 de cada mes 8am
// ═══════════════════════════════════════════════════════════════

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

    // ═══ DATOS DEL MES REPORTADO ═══
    
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

    // ═══ CÁLCULOS ═══

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

    // ═══ CONSTRUIR MENSAJE ═══

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
    const mensaje = `ðŸŽ‚ *Â¡Feliz CumpleaÃ±os ${persona.name}!* ðŸŽ‰\n\nTodo el equipo de Santa Rita te desea un dÃ­a increÃ­ble. Â¡Que se cumplan todos tus sueÃ±os! ðŸŒŸ`;
    await meta.sendWhatsAppMessage(persona.phone, mensaje);
  }
}

async function enviarBriefingMatutino(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

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

  let mensaje = `â˜€ï¸ *Buenos dÃ­as ${vendedor.name}!*\n\n`;
  mensaje += `ðŸ“… *Tu agenda de hoy:*\n`;

  if (citasHoy && citasHoy.length > 0) {
    mensaje += citasHoy.map((c: any) => 
      `â€¢ ${c.scheduled_time} - ${c.leads?.name || 'Cliente'} en ${c.property_interest || 'Por definir'}`
    ).join('\n');
  } else {
    mensaje += `Sin citas programadas`;
  }

  mensaje += `\n\n*Leads pendientes:* ${leadsAsignados?.length || 0}`;
  mensaje += `\n\nExito hoy!`;

  await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
}

async function enviarRecapDiario(meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const mensaje = `*Resumen del dia, ${vendedor.name}*\n\n` +
    `Gracias por tu esfuerzo hoy. Recuerda actualizar el status de tus leads en el CRM.\n\n` +
    `Descansa y manana con todo!`;

  await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
}

async function enviarRecapSemanal(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const mensaje = `*Resumen semanal, ${vendedor.name}*\n\n` +
    `Esta semana trabajaste duro. Revisa tus metricas en el CRM.\n\n` +
    `Disfruta tu fin de semana!`;

  await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
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

    const mensaje = `ðŸ“… *Recordatorio de tu cita maÃ±ana*\n\n` +
      `Hola ${lead.name}, te recordamos tu cita:\n` +
      `ðŸ“ ${cita.property_interest || 'Santa Rita'}\n` +
      `ðŸ—“ï¸ ${fecha} a las ${hora}\n\n` +
      `Â¡Te esperamos! ðŸ `;

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

    const mensaje = `â° *Tu cita es en 2 horas*\n\n` +
      `${lead.name}, te esperamos en ${cita.property_interest || 'Santa Rita'}.\n\n` +
      `Â¿Necesitas indicaciones? Responde a este mensaje. ðŸ“`;

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
    if (!v.phone) continue;

    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', v.id)
      .eq('status', 'new');

    if (leadsSinContactar && leadsSinContactar.length > 0) {
      const mensaje = `💔 *Recordatorio de seguimiento*

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
    console.log('ðŸ“­ No hay videos pendientes');
    return;
  }

  console.log(`ðŸŽ¬ Procesando ${pendientes.length} videos pendientes`);

  for (const video of pendientes) {
    console.log(`ðŸ” Verificando video: ${video.id} - ${video.lead_name}`);
    try {
      // Verificar estado de la operaciÃ³n en Google
      console.log(`ðŸ“¡ Consultando Google: ${video.operation_id}`);
      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${video.operation_id}`,
        {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        }
      );

      console.log(`ðŸ“¡ Google response status: ${statusResponse.status}`);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.log(`âš ï¸ Error verificando video ${video.id}: ${errorText}`);
        continue;
      }

      const status = await statusResponse.json() as any;
      console.log(`ðŸ“¡ Video done: ${status.done}`);
      console.log(`ðŸ“¦ Respuesta Google:`, JSON.stringify(status).substring(0, 500));

      if (status.done) {
        // Intentar mÃºltiples rutas para encontrar el URI del video
        const videoUri = 
          status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
          status.response?.generatedSamples?.[0]?.video?.uri ||
          status.result?.videos?.[0]?.uri ||
          status.videos?.[0]?.uri;
        
        console.log(`ðŸ” URI encontrado: ${videoUri ? 'SÃ' : 'NO'}`);
        
        if (videoUri) {
          console.log(`ðŸ“¥ Video URI: ${videoUri.substring(0, 80)}...`);
          
          // âš ï¸ MARCAR COMO ENVIADO ANTES para evitar spam si el cron corre mÃºltiples veces
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: videoUri })
            .eq('id', video.id);
          
          try {
            // 1. Descargar video de Google (requiere API key)
            console.log(`ðŸ“¥ Descargando video de Google...`);
            const videoResponse = await fetch(videoUri, {
              headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
            });
            
            if (!videoResponse.ok) {
              console.log(`âŒ Error descargando video: ${videoResponse.status}`);
              return;
            }
            
            const videoBuffer = await videoResponse.arrayBuffer();
            console.log(`âœ… Video descargado: ${videoBuffer.byteLength} bytes`);
            
            // 2. Subir a Meta
            const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
            console.log(`âœ… Video subido a Meta: ${mediaId}`);
            
            // 3. Enviar por WhatsApp
            if (video.lead_phone === 'TEAM_WEEKLY') {
              console.log('ðŸ“¤ Enviando video semanal a todo el equipo...');
              
              const { data: equipo } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .in('role', ['vendedor', 'admin'])
                .eq('active', true);

              for (const miembro of equipo || []) {
                if (!miembro.phone) continue;
                try {
                  await meta.sendWhatsAppVideoById(miembro.phone, mediaId, 
                    `ðŸŽ¬ *Â¡Video de la semana!*\n\nðŸ† ${video.desarrollo}\n\nÂ¡Excelente trabajo equipo! ðŸ’ªðŸ”¥`);
                  console.log(`âœ… Video semanal enviado a ${miembro.name}`);
                } catch (e: any) {
                  console.log(`âš ï¸ Error enviando video a ${miembro.name}: ${e.message}`);
                }
              }
            } else {
              // Video individual (bienvenida)
              await meta.sendWhatsAppVideoById(video.lead_phone, mediaId, 
                `ðŸŽ¬ *Â¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);
              console.log(`âœ… Video enviado a ${video.lead_name}`);
            }
          } catch (downloadError: any) {
            console.log(`âŒ Error en flujo de video: ${downloadError.message}`);
          }

        } else if (status.error) {
          console.log(`âŒ Video fallido: ${status.error.message}`);
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR: ${status.error.message}` })
            .eq('id', video.id);
        } else {
          console.log(`âš ï¸ Video completado pero sin URI`);
          console.log(`ðŸ“¦ Estructura completa:`, JSON.stringify(status));
          // Marcar como enviado para evitar reintentos infinitos
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: 'ERROR: No URI found' })
            .eq('id', video.id);
        }
      } else {
        console.log(`â³ Video ${video.id} aÃºn procesando...`);
      }
    } catch (e: any) {
      console.log(`âŒ Error procesando video ${video.id}: ${e.message}`);
      // Marcar como enviado para evitar reintentos infinitos
      await supabase.client
        .from('pending_videos')
        .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR: ${e.message}` })
        .eq('id', video.id);
    }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// VIDEO SEMANAL DE LOGROS - Viernes 6pm
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function generarVideoSemanalLogros(supabase: SupabaseService, meta: MetaWhatsAppService, env: any): Promise<void> {
  try {
    // Calcular fechas de la semana (lunes a viernes)
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1); // Lunes
    inicioSemana.setHours(0, 0, 0, 0);
    
    const finSemana = new Date(hoy);
    finSemana.setHours(23, 59, 59, 999);

    // Obtener mÃ©tricas de la semana
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

    console.log(`ðŸ“Š MÃ©tricas semana: ${numLeads} leads, ${numCitas} citas, ${numCierres} cierres`);

    // Primero enviar mensaje de texto con mÃ©tricas
    const mensajeTexto = `ðŸ† *Â¡RESUMEN SEMANAL EQUIPO SANTA RITA!*\n` +
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n\n` +
      `ðŸ“Š *Esta semana logramos:*\n\n` +
      `ðŸ‘¥ *${numLeads}* leads nuevos\n` +
      `ðŸ“… *${numCitas}* citas agendadas\n` +
      `âœ… *${numCierres}* cierres\n\n` +
      `ðŸ¥‡ *Top performer:* ${topPerformer.name}${topPerformer.cierres > 0 ? ` (${topPerformer.cierres} cierres)` : ''}\n\n` +
      `Â¡Excelente trabajo equipo! ðŸ”¥\n` +
      `El video motivacional viene en camino... ðŸŽ¬`;

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
        console.log(`âœ… Resumen enviado a ${miembro.name}`);
      } catch (e) {
        console.log(`âš ï¸ Error enviando a ${miembro.name}`);
      }
    }

    // Generar video con Veo 3
    const promptVideo = `Celebratory office scene with Mexican real estate team. 
Text overlay appears: "SEMANA EXITOSA" then "${numLeads} LEADS | ${numCitas} CITAS | ${numCierres} CIERRES".
Then "TOP: ${topPerformer.name}" with trophy emoji.
Team clapping and celebrating. Professional, modern office background.
Upbeat motivational feeling. 8 seconds. No audio needed.`;

    console.log('ðŸŽ¬ Generando video semanal con Veo 3...');

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
      console.log('âš ï¸ Veo 3 error:', errorText);
      return;
    }

    const result = await response.json();
    const operationName = result.name;
    
    if (!operationName) {
      console.log('âš ï¸ No operation name para video semanal');
      return;
    }

    console.log('ðŸŽ¬ Video semanal en proceso:', operationName);

    // Guardar para que el CRON lo procese y envÃ­e
    // Usamos un telÃ©fono especial "TEAM_WEEKLY" para identificar que es video grupal
    await supabase.client
      .from('pending_videos')
      .insert({
        operation_id: operationName,
        lead_phone: 'TEAM_WEEKLY',
        lead_name: 'Equipo Santa Rita',
        desarrollo: `Semana: ${numLeads}L/${numCitas}C/${numCierres}V`,
        sent: false
      });

    console.log('âœ… Video semanal programado para envÃ­o');

  } catch (error) {
    console.error('âŒ Error generando video semanal:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTAS PROACTIVAS CEO
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// COACHING PROACTIVO - 11am L-V
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// A/B TESTING - Sistema de pruebas de mensajes
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// REMARKETING LEADS FRÍOS - Reactivación automática
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK / MONITOREO
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// BACKUP - Exportar datos críticos
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// FLUJO CRÉDITO MEJORADO - Seguimiento automático hipotecas
// ═══════════════════════════════════════════════════════════════

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
