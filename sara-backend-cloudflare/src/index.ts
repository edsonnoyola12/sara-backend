import { SupabaseService } from './services/supabase';
import { ClaudeService } from './services/claude';

import { MetaWhatsAppService } from './services/meta-whatsapp';
import { CalendarService } from './services/calendar';
import { WhatsAppHandler } from './handlers/whatsapp';
import { handleTeamRoutes } from './routes/team-routes';
import { handlePromotionRoutes } from './routes/promotions';
import { FollowupService } from './services/followupService';
import { FollowupApprovalService } from './services/followupApprovalService';
import { NotificationService } from './services/notificationService';
import { BroadcastQueueService } from './services/broadcastQueueService';
import { IACoachingService } from './services/iaCoachingService';
import { CEOCommandsService } from './services/ceoCommandsService';
import { VendorCommandsService } from './services/vendorCommandsService';

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
    console.log('⚠️ No hay vendedores activos, buscando fallback...');

    // FALLBACK 1: Buscar coordinadores o admins activos
    const coordinadores = vendedores.filter(v =>
      v.active && (v.role === 'coordinador' || v.role === 'admin' || v.role === 'ceo' || v.role === 'director')
    );
    if (coordinadores.length > 0) {
      const elegido = coordinadores[0];
      console.log(`🔄 FALLBACK: Asignando a coordinador/admin ${elegido.name} (no hay vendedores)`);
      return elegido;
    }

    // FALLBACK 2: Cualquier team member activo
    const cualquiera = vendedores.filter(v => v.active);
    if (cualquiera.length > 0) {
      const elegido = cualquiera[0];
      console.log(`🚨 FALLBACK CRÍTICO: Asignando a ${elegido.name} (${elegido.role}) - NO HAY VENDEDORES`);
      return elegido;
    }

    // FALLBACK 3: NADIE disponible - LOG CRÍTICO
    console.error('🚨🚨🚨 CRÍTICO: NO HAY NINGÚN TEAM MEMBER ACTIVO - LEAD SE PERDERÁ');
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
    if (url.pathname.startsWith('/api/team-members') || url.pathname.startsWith('/api/admin/')) {
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

    // ═══════════════════════════════════════════════════════════════════════
    // TEST COMANDO CEO - Probar comandos sin enviar WhatsApp
    // USO: /test-comando-ceo?cmd=ventas
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-comando-ceo" && request.method === "GET") {
      const cmd = url.searchParams.get('cmd') || 'ayuda';
      const ceoService = new CEOCommandsService(supabase);

      // Detectar comando
      const detected = ceoService.detectCommand(cmd);
      if (!detected.action || detected.action === 'unknown') {
        return corsResponse(JSON.stringify({
          ok: false,
          comando: cmd,
          error: 'Comando no reconocido',
          detected
        }));
      }

      // Si requiere handler externo, mostrar info
      if (detected.action === 'call_handler' && detected.handlerName) {
        try {
          const result = await ceoService.executeHandler(detected.handlerName, 'Test CEO', detected.handlerParams);
          return corsResponse(JSON.stringify({
            ok: true,
            comando: cmd,
            handlerName: detected.handlerName,
            resultado: result.message || result
          }));
        } catch (e: any) {
          return corsResponse(JSON.stringify({
            ok: false,
            comando: cmd,
            error: e.message
          }));
        }
      }

      return corsResponse(JSON.stringify({
        ok: true,
        comando: cmd,
        detected
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST COMANDO VENDEDOR - Probar comandos de vendedor
    // USO: /test-comando-vendedor?cmd=coach%20Juan
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/test-comando-vendedor" && request.method === "GET") {
      const cmd = url.searchParams.get('cmd') || 'ayuda';
      const vendorService = new VendorCommandsService(supabase);

      // Detectar comando (body y mensaje son iguales para el test)
      const detected = vendorService.detectRouteCommand(cmd, cmd);
      if (!detected.matched) {
        return corsResponse(JSON.stringify({
          ok: false,
          comando: cmd,
          error: 'Comando no reconocido',
          detected
        }));
      }

      return corsResponse(JSON.stringify({
        ok: true,
        comando: cmd,
        handlerName: detected.handlerName,
        params: detected.handlerParams,
        nota: 'Para ejecutar completamente, usa WhatsApp'
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🚨 EMERGENCY STOP - Detener TODOS los broadcasts inmediatamente
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/api/emergency-stop" && request.method === "POST") {
      console.log('🚨 EMERGENCY STOP ACTIVADO');

      // 1. Desactivar broadcasts en system_config
      await supabase.client
        .from('system_config')
        .upsert({ key: 'broadcasts_enabled', value: 'false', updated_at: new Date().toISOString() });

      // 2. Cancelar TODOS los jobs pendientes en la cola
      const { data: cancelled } = await supabase.client
        .from('broadcast_jobs')
        .update({ status: 'cancelled', error_message: 'EMERGENCY STOP activado' })
        .in('status', ['pending', 'processing'])
        .select('id');

      // 3. Cancelar follow-ups pendientes
      const { data: followupsCancelled } = await supabase.client
        .from('scheduled_followups')
        .update({ cancelled: true, cancel_reason: 'EMERGENCY STOP' })
        .eq('sent', false)
        .eq('cancelled', false)
        .select('id');

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await meta.sendWhatsAppMessage('5212224558475',
        `🚨 *EMERGENCY STOP ACTIVADO*\n\n` +
        `✅ Broadcasts deshabilitados\n` +
        `✅ ${cancelled?.length || 0} jobs cancelados\n` +
        `✅ ${followupsCancelled?.length || 0} follow-ups cancelados\n\n` +
        `Para reactivar: POST /api/broadcasts-enable`,
        true
      );

      return corsResponse(JSON.stringify({
        success: true,
        message: 'EMERGENCY STOP activado',
        cancelled_jobs: cancelled?.length || 0,
        cancelled_followups: followupsCancelled?.length || 0
      }));
    }

    // Reactivar broadcasts después de emergency stop
    if (url.pathname === "/api/broadcasts-enable" && request.method === "POST") {
      await supabase.client
        .from('system_config')
        .upsert({ key: 'broadcasts_enabled', value: 'true', updated_at: new Date().toISOString() });

      return corsResponse(JSON.stringify({ success: true, message: 'Broadcasts reactivados' }));
    }

    // Ver estado del sistema
    if (url.pathname === "/api/system-status" && request.method === "GET") {
      const { data: config } = await supabase.client
        .from('system_config')
        .select('*')
        .eq('key', 'broadcasts_enabled')
        .single();

      const { data: pendingJobs } = await supabase.client
        .from('broadcast_jobs')
        .select('id, status')
        .in('status', ['pending', 'processing']);

      const { data: pendingFollowups } = await supabase.client
        .from('scheduled_followups')
        .select('id')
        .eq('sent', false)
        .eq('cancelled', false);

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const rateLimitStats = meta.getRateLimitStats();

      return corsResponse(JSON.stringify({
        broadcasts_enabled: config?.value !== 'false',
        pending_broadcast_jobs: pendingJobs?.length || 0,
        pending_followups: pendingFollowups?.length || 0,
        rate_limit_stats: rateLimitStats
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 RESET BROADCAST MARKER - Para poder re-probar
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/api/test-reset-broadcast" && request.method === "POST") {
      // Solo resetear los 2 teléfonos de prueba
      const { data: testLeads } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.ilike.%2224558475,phone.ilike.%610016226`);

      if (!testLeads) return corsResponse(JSON.stringify({ error: 'No leads found' }), 404);

      for (const lead of testLeads) {
        const notes = typeof lead.notes === 'object' ? lead.notes : {};
        delete notes.last_broadcast;
        await supabase.client
          .from('leads')
          .update({ notes })
          .eq('id', lead.id);
      }

      return corsResponse(JSON.stringify({
        message: 'Broadcast markers cleared',
        leads_reset: testLeads.map(l => ({ name: l.name, phone: l.phone }))
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧪 TEST BROADCAST - Solo para los 2 teléfonos de prueba
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === "/api/test-broadcast-safe" && request.method === "POST") {
      const ALLOWED_PHONES = ['5212224558475', '5215610016226', '521561001622'];
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar leads con esos teléfonos
      const { data: testLeads } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.ilike.%2224558475,phone.ilike.%610016226`);

      if (!testLeads || testLeads.length === 0) {
        return corsResponse(JSON.stringify({
          error: 'No se encontraron leads con esos teléfonos',
          searched: ALLOWED_PHONES
        }), 404);
      }

      const results: any[] = [];

      for (const lead of testLeads) {
        // Verificar que el teléfono sea uno de los permitidos
        const phoneClean = lead.phone?.replace(/\D/g, '') || '';
        const isAllowed = ALLOWED_PHONES.some(p => phoneClean.includes(p.slice(-10)));

        if (!isAllowed) {
          results.push({ phone: lead.phone, status: 'BLOCKED - not in allowed list' });
          continue;
        }

        // Verificar si ya recibió broadcast reciente (la nueva verificación)
        const notes = typeof lead.notes === 'object' ? lead.notes : {};
        if (notes.last_broadcast?.sent_at) {
          const lastSentAt = new Date(notes.last_broadcast.sent_at);
          const hoursSince = (Date.now() - lastSentAt.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            results.push({
              phone: lead.phone,
              name: lead.name,
              status: `SKIP - Ya recibió broadcast hace ${hoursSince.toFixed(1)}h`,
              last_broadcast: notes.last_broadcast
            });
            continue;
          }
        }

        // Enviar template de prueba
        try {
          await meta.sendTemplate(lead.phone, 'promo_desarrollo', 'es_MX', [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: lead.name || 'Cliente' },
                { type: 'text', text: 'TEST' },
                { type: 'text', text: '🧪 Esto es una prueba del sistema de broadcasts' }
              ]
            }
          ]);

          // Marcar como enviado
          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notes,
                last_broadcast: {
                  job_id: 'TEST',
                  segment: 'test',
                  message: 'Prueba del sistema',
                  sent_at: new Date().toISOString()
                }
              }
            })
            .eq('id', lead.id);

          results.push({
            phone: lead.phone,
            name: lead.name,
            status: 'SENT ✅',
            timestamp: new Date().toISOString()
          });
        } catch (e: any) {
          results.push({
            phone: lead.phone,
            name: lead.name,
            status: `ERROR: ${e.message}`
          });
        }
      }

      return corsResponse(JSON.stringify({
        message: 'Test broadcast ejecutado',
        leads_found: testLeads.length,
        results
      }));
    }

    // Test briefing de supervisión (coordinadores)
    if (url.pathname === "/test-supervision" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      // Para test, enviarlo a mi número
      const testPhone = "5215610016226";
      await enviarBriefingSupervisionTest(supabase, meta, testPhone);
      return corsResponse(JSON.stringify({ ok: true, message: "Briefing supervisión enviado a " + testPhone }));
    }

    // Test re-engagement automático
    if (url.pathname === "/test-reengagement" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await verificarReengagement(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: "Re-engagement ejecutado - revisa logs" }));
    }

    // Test crear cliente para post-venta (venta hace X días)
    if (url.pathname === "/test-crear-postventa") {
      const testPhone = url.searchParams.get('phone') || '5212224558475';
      const dias = parseInt(url.searchParams.get('dias') || '30'); // 30, 60, o 90 días

      // Borrar leads de prueba existentes
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

      const fechaVenta = new Date();
      fechaVenta.setDate(fechaVenta.getDate() - dias);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Cliente Venta Prueba',
          phone: testPhone,
          status: 'sold',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Monte Verde',
          notes: {
            fecha_venta: fechaVenta.toISOString().split('T')[0],
            desarrollo: 'Santa Rita',
            post_venta: { etapa: 0, ultimo_contacto: null }
          },
          updated_at: fechaVenta.toISOString()
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      // Ejecutar post-venta
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await seguimientoPostVenta(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead creado con venta hace ${dias} días y post-venta ejecutado`,
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          status: 'sold',
          fecha_venta: fechaVenta.toISOString().split('T')[0]
        }
      }));
    }

    // Test seguimiento post-venta
    if (url.pathname === "/test-postventa" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await seguimientoPostVenta(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: "Post-venta ejecutado - revisa logs" }));
    }

    // Test crear lead frío para re-engagement
    // USO: /test-crear-lead-frio?lead=5215610016226&vendedor=5212224558475&dias=4
    if (url.pathname === "/test-crear-lead-frio") {
      const leadPhone = url.searchParams.get('lead') || url.searchParams.get('phone') || '5215610016226';
      const vendedorPhone = url.searchParams.get('vendedor') || '5212224558475';
      const dias = parseInt(url.searchParams.get('dias') || '4');

      const fechaUpdate = new Date();
      fechaUpdate.setDate(fechaUpdate.getDate() - dias);

      // Buscar vendedor por teléfono
      const { data: allTeam } = await supabase.client.from('team_members').select('id, name, phone').eq('active', true);
      const vendedor = allTeam?.find(t => t.phone?.replace(/\D/g, '').slice(-10) === vendedorPhone.replace(/\D/g, '').slice(-10));

      // Primero buscar todos los leads y ver si alguno coincide con este teléfono
      const phoneSuffix = leadPhone.replace(/\D/g, '').slice(-10);
      console.log(`🧪 Buscando leads con sufijo: ${phoneSuffix}`);

      // Buscar TODOS los leads con teléfono
      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('id, phone')
        .not('phone', 'is', null);

      // Filtrar manualmente por sufijo
      const matchingLeads = (allLeads || []).filter(l =>
        l.phone?.replace(/\D/g, '').slice(-10) === phoneSuffix
      );

      console.log(`🧪 Leads encontrados con sufijo ${phoneSuffix}: ${matchingLeads.length}`);
      if (matchingLeads.length > 0) {
        console.log(`🧪 Phones encontrados: ${matchingLeads.map(l => l.phone).join(', ')}`);
      }

      // Eliminar todos los que coinciden (primero todas las dependencias)
      for (const lead of matchingLeads) {
        console.log(`🧪 Eliminando dependencias del lead ${lead.id}...`);
        // Eliminar citas
        await supabase.client.from('appointments').delete().eq('lead_id', lead.id);
        // Eliminar mortgage applications
        await supabase.client.from('mortgage_applications').delete().eq('lead_id', lead.id);
        // Eliminar messages
        await supabase.client.from('messages').delete().eq('lead_id', lead.id);
        // Eliminar reservations si existe
        await supabase.client.from('reservations').delete().eq('lead_id', lead.id);
        // Eliminar cualquier otra tabla relacionada (intentar, no falla si no existe)
        try { await supabase.client.from('follow_ups').delete().eq('lead_id', lead.id); } catch {}
        try { await supabase.client.from('activities').delete().eq('lead_id', lead.id); } catch {}

        // Ahora eliminar el lead
        const { error: deleteError } = await supabase.client.from('leads').delete().eq('id', lead.id);
        console.log(`🧪 Lead ${lead.id} eliminado (error: ${deleteError?.message || 'ninguno'})`);
      }

      // Verificar que ya no hay leads con ese teléfono
      const { data: checkAfter } = await supabase.client
        .from('leads')
        .select('id, phone')
        .not('phone', 'is', null);
      const stillMatching = (checkAfter || []).filter(l =>
        l.phone?.replace(/\D/g, '').slice(-10) === phoneSuffix
      );
      console.log(`🧪 Leads que aún coinciden después del delete: ${stillMatching.length}`);

      // Insertar nuevo lead con updated_at ya establecido
      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Lead Frío Prueba',
          phone: leadPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Monte Verde',
          notes: { reengagement: {} },
          created_at: fechaUpdate.toISOString(),
          updated_at: fechaUpdate.toISOString()
        })
        .select().single();

      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);

      // Verificar que se insertó correctamente
      const { data: leadCheck } = await supabase.client
        .from('leads')
        .select('id, phone, status, updated_at, assigned_to')
        .eq('id', newLead.id)
        .single();

      console.log(`🧪 TEST Lead Frío: id=${newLead.id}, updated_at=${leadCheck?.updated_at}, vendedor=${vendedor?.name}`);

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await reengagementDirectoLeads(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead frío creado (${dias} días sin actividad) y re-engagement ejecutado`,
        lead: { id: newLead.id, name: newLead.name, phone: leadPhone, dias_inactivo: dias },
        vendedor_asignado: { name: vendedor?.name, phone: vendedor?.phone },
        debug: { updated_at_esperado: fechaUpdate.toISOString(), updated_at_actual: leadCheck?.updated_at }
      }));
    }

    // Test crear cliente para aniversario de compra (hace 1 año hoy)
    // USO: /test-crear-aniversario?lead=5215610016226&vendedor=5212224558475
    if (url.pathname === "/test-crear-aniversario") {
      const leadPhone = url.searchParams.get('lead') || url.searchParams.get('phone') || '5215610016226';
      const vendedorPhone = url.searchParams.get('vendedor') || '5212224558475';

      // Hace exactamente 1 año
      const fechaCompra = new Date();
      fechaCompra.setFullYear(fechaCompra.getFullYear() - 1);

      // Buscar vendedor por teléfono
      const { data: allTeam } = await supabase.client.from('team_members').select('id, name, phone').eq('active', true);
      const vendedor = allTeam?.find(t => t.phone?.replace(/\D/g, '').slice(-10) === vendedorPhone.replace(/\D/g, '').slice(-10));

      // Upsert: actualizar si existe, crear si no
      const { data: newLead, error } = await supabase.client
        .from('leads')
        .upsert({
          name: 'Cliente Aniversario Prueba',
          phone: leadPhone,
          status: 'delivered',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Santa Rita',
          status_changed_at: fechaCompra.toISOString()
        }, { onConflict: 'phone' })
        .select().single();

      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarAniversarioCompra(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cliente creado con aniversario HOY (compró hace 1 año) y felicitación ejecutada`,
        lead: { id: newLead.id, name: newLead.name, phone: leadPhone, fecha_compra: fechaCompra.toISOString().split('T')[0] },
        vendedor_asignado: { name: vendedor?.name, phone: vendedor?.phone }
      }));
    }

    // Test leads fríos / re-engagement directo
    if (url.pathname === "/test-leads-frios" && request.method === "GET") {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await reengagementDirectoLeads(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: "Leads fríos ejecutado - revisa logs" }));
    }

    // TEST: Desactivar team member por teléfono (para pruebas)
    if (url.pathname === "/test-disable-team-member") {
      const phone = url.searchParams.get('phone');
      if (!phone) return corsResponse(JSON.stringify({ error: "Falta phone" }), 400);
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      const { data: member, error: findErr } = await supabase.client
        .from('team_members')
        .select('id, name, phone, active')
        .ilike('phone', `%${phoneSuffix}`)
        .single();
      if (findErr || !member) return corsResponse(JSON.stringify({ error: "No encontrado", phoneSuffix }), 404);
      const { error } = await supabase.client.from('team_members').update({ active: false }).eq('id', member.id);
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
      return corsResponse(JSON.stringify({ ok: true, message: `${member.name} desactivado`, member }));
    }

    // TEST: Actualizar status de lead (para pruebas)
    if (url.pathname === "/test-update-lead" && request.method === "POST") {
      const body = await request.json() as any;
      const { lead_id, status } = body;
      if (!lead_id || !status) {
        return corsResponse(JSON.stringify({ error: "Falta lead_id o status" }), 400);
      }
      const { error } = await supabase.client.from('leads').update({ status, status_changed_at: new Date().toISOString() }).eq('id', lead_id);
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, message: `Lead ${lead_id} actualizado a ${status}` }));
    }

    // TEST: Actualizar nombre de lead por teléfono
    if (url.pathname === "/test-update-name" && request.method === "POST") {
      const body = await request.json() as any;
      const { phone, name } = body;
      if (!phone || !name) {
        return corsResponse(JSON.stringify({ error: "Falta phone o name" }), 400);
      }
      const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
      const { data, error } = await supabase.client
        .from('leads')
        .update({ name })
        .ilike('phone', `%${phoneSuffix}`)
        .select('id, name, phone');
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, updated: data }));
    }

    // TEST: Enviar video directamente a un teléfono
    if (url.pathname === "/test-force-video" && request.method === "POST") {
      const body = await request.json() as any;
      const { phone, desarrollo } = body;

      if (!phone) {
        return corsResponse(JSON.stringify({ error: "Falta phone" }), 400);
      }

      // Formatear teléfono (últimos 10 dígitos + 521)
      const phoneDigits = phone.replace(/\D/g, '').slice(-10);
      const phoneFormatted = '521' + phoneDigits;

      // Buscar video del desarrollo
      const dev = desarrollo || 'monte verde';
      const { data: props } = await supabase.client
        .from('properties')
        .select('youtube_link, development')
        .ilike('development', `%${dev}%`)
        .not('youtube_link', 'is', null)
        .limit(1);

      if (!props || props.length === 0 || !props[0].youtube_link) {
        return corsResponse(JSON.stringify({ error: "Video no encontrado para " + dev }), 404);
      }

      const videoUrl = props[0].youtube_link;
      const devName = props[0].development;

      // Enviar video directamente
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await meta.sendWhatsAppMessage(phoneFormatted, `🎬 Mira cómo es *${devName}* por dentro:\n${videoUrl}`);

      return corsResponse(JSON.stringify({
        ok: true,
        phone: phoneFormatted,
        video_enviado: videoUrl,
        desarrollo: devName
      }));
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
                console.log('⚠️ No se pudo borrar evento:', apt.google_event_vendedor_id);
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
          console.log('⚠️ Error notificando asesor hipotecario:', e);
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
        console.log('❌ Error enviando notificación:', e);
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
        console.log('❌ Error enviando nota:', e);
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

        return corsResponse(JSON.stringify({ success: true }));
      } catch (e: any) {
        console.log('❌ Error notificando reasignación:', e);
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
            console.log('⚠️ Error Google Calendar (ignorado):', calError);
          }
        } else {
          console.log('⚠️ Cita sin google_event_vendedor_id, no se puede sincronizar con Google Calendar');
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

      // Permitir seleccionar mes específico con ?mes=1&año=2026
      const mesParam = url.searchParams.get('mes');
      const añoParam = url.searchParams.get('año') || url.searchParams.get('ano');

      let mesSeleccionado = hoy.getMonth(); // Mes actual (0-11)
      let añoSeleccionado = hoy.getFullYear();

      if (mesParam) {
        mesSeleccionado = parseInt(mesParam) - 1; // Convertir 1-12 a 0-11
      }
      if (añoParam) {
        añoSeleccionado = parseInt(añoParam);
      }

      // Inicio y fin del mes seleccionado
      const inicioMes = new Date(añoSeleccionado, mesSeleccionado, 1);
      const finMes = new Date(añoSeleccionado, mesSeleccionado + 1, 0); // Último día del mes

      // Mes anterior para comparación
      const mesAnterior = new Date(añoSeleccionado, mesSeleccionado - 1, 1);
      const finMesAnterior = new Date(añoSeleccionado, mesSeleccionado, 0);

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


    // ═══════════════════════════════════════════════════════════
    // CHAT IA PARA REPORTES - Preguntas sobre datos
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/reportes/ask' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { pregunta, contexto } = body;

        if (!pregunta) {
          return corsResponse(JSON.stringify({ error: 'Falta pregunta' }), 400);
        }

        // Preparar resumen de datos para Claude
        let resumenDatos = 'DATOS DE REPORTES CEO:\n\n';
        resumenDatos += '📅 REPORTE DIARIO (' + (contexto?.diario?.fecha || 'hoy') + '):\n';
        resumenDatos += '- Leads nuevos ayer: ' + (contexto?.diario?.ayer?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Cierres ayer: ' + (contexto?.diario?.ayer?.cierres || 0) + '\n';
        resumenDatos += '- Citas hoy: ' + (contexto?.diario?.hoy?.citas_agendadas || 0) + '\n';
        resumenDatos += '- Leads HOT: ' + (contexto?.diario?.pipeline?.leads_hot || 0) + '\n';
        resumenDatos += '- Leads sin contactar: ' + (contexto?.diario?.pipeline?.leads_estancados || 0) + '\n\n';

        resumenDatos += '📈 REPORTE SEMANAL (' + (contexto?.semanal?.fecha_inicio || 'N/A') + ' al ' + (contexto?.semanal?.fecha_fin || 'N/A') + '):\n';
        resumenDatos += '- Leads nuevos: ' + (contexto?.semanal?.resumen?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Citas totales: ' + (contexto?.semanal?.resumen?.citas_totales || 0) + '\n';
        resumenDatos += '- Cierres: ' + (contexto?.semanal?.resumen?.cierres || 0) + '\n';
        resumenDatos += '- Revenue: ' + (contexto?.semanal?.resumen?.revenue_formatted || '$0') + '\n';
        resumenDatos += '- Conversión lead a cierre: ' + (contexto?.semanal?.conversion?.lead_a_cierre || 0) + '%\n\n';

        resumenDatos += '📉 REPORTE MENSUAL (' + (contexto?.mensual?.mes || 'N/A') + ' ' + (contexto?.mensual?.año || 'N/A') + '):\n';
        resumenDatos += '- Leads nuevos: ' + (contexto?.mensual?.resumen?.leads_nuevos || 0) + '\n';
        resumenDatos += '- Crecimiento vs mes anterior: ' + (contexto?.mensual?.resumen?.crecimiento_leads || 0) + '%\n';
        resumenDatos += '- Citas totales: ' + (contexto?.mensual?.resumen?.citas_totales || 0) + '\n';
        resumenDatos += '- Cierres: ' + (contexto?.mensual?.resumen?.cierres || 0) + '\n';
        resumenDatos += '- Revenue: ' + (contexto?.mensual?.resumen?.revenue_formatted || '$0') + '\n';
        resumenDatos += '- Conversión lead a cierre: ' + (contexto?.mensual?.conversion?.lead_a_cierre || 0) + '%\n\n';

        resumenDatos += '🏆 RANKING VENDEDORES (mensual):\n';
        if (contexto?.mensual?.ranking_vendedores) {
          for (const v of contexto.mensual.ranking_vendedores) {
            resumenDatos += v.posicion + '. ' + v.name + ': ' + v.ventas + ' ventas, ' + v.citas + ' citas, $' + (v.revenue/1000000).toFixed(1) + 'M\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n🏘️ VENTAS POR DESARROLLO:\n';
        if (contexto?.mensual?.desarrollos) {
          for (const d of contexto.mensual.desarrollos) {
            resumenDatos += '- ' + d.desarrollo + ': ' + d.ventas + ' ventas, ' + d.revenue_formatted + '\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n📣 FUENTES DE LEADS:\n';
        if (contexto?.mensual?.fuentes) {
          for (const f of contexto.mensual.fuentes) {
            resumenDatos += '- ' + f.fuente + ': ' + f.leads + ' leads\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        // Llamar a Claude para responder
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 500,
            messages: [
              {
                role: 'user',
                content: 'Eres un asistente de análisis de datos para Santa Rita Residencial. Responde preguntas sobre los reportes de ventas de forma clara y concisa.\n\n' + resumenDatos + '\n\nPREGUNTA DEL CEO: ' + pregunta + '\n\nResponde de forma directa y útil. Si necesitas hacer cálculos, hazlos. Usa emojis para hacer la respuesta más visual.'
              }
            ]
          })
        });

        const claudeData = await claudeResponse.json() as any;
        const respuesta = claudeData?.content?.[0]?.text || 'No pude procesar la pregunta.';

        return corsResponse(JSON.stringify({ respuesta }));

      } catch (err) {
        console.error('Error en chat IA reportes:', err);
        return corsResponse(JSON.stringify({ error: 'Error procesando pregunta', respuesta: 'Hubo un error al procesar tu pregunta. Por favor intenta de nuevo.' }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════
    // CHAT IA PARA DASHBOARD - Preguntas sobre métricas generales
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/dashboard/ask' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { pregunta, contexto } = body;

        if (!pregunta) {
          return corsResponse(JSON.stringify({ error: 'Falta pregunta' }), 400);
        }

        // Preparar resumen de datos del dashboard para Claude
        let resumenDatos = 'DATOS DEL DASHBOARD DE VENTAS:\n\n';

        resumenDatos += '📊 MÉTRICAS GENERALES:\n';
        resumenDatos += '- Total leads: ' + (contexto?.totalLeads || 0) + '\n';
        resumenDatos += '- Pipeline value: $' + ((contexto?.pipelineValue || 0) / 1000000).toFixed(1) + 'M\n';
        resumenDatos += '- Cierres este mes: ' + (contexto?.cierresMes || 0) + '\n';
        resumenDatos += '- Cambio vs mes anterior: ' + (contexto?.cambioVsMesAnterior || 0) + '%\n';
        resumenDatos += '- Leads HOT (negociación/reservado): ' + (contexto?.leadsHot || 0) + '\n';
        resumenDatos += '- Tiempo promedio respuesta: ' + (contexto?.tiempoRespuesta || 0) + ' min\n\n';

        resumenDatos += '🔥 DISTRIBUCIÓN FUNNEL:\n';
        resumenDatos += '- Nuevos: ' + (contexto?.funnel?.new || 0) + '\n';
        resumenDatos += '- Contactados: ' + (contexto?.funnel?.contacted || 0) + '\n';
        resumenDatos += '- Cita agendada: ' + (contexto?.funnel?.scheduled || 0) + '\n';
        resumenDatos += '- Visitaron: ' + (contexto?.funnel?.visited || 0) + '\n';
        resumenDatos += '- Negociación: ' + (contexto?.funnel?.negotiation || 0) + '\n';
        resumenDatos += '- Reservado: ' + (contexto?.funnel?.reserved || 0) + '\n';
        resumenDatos += '- Cerrado: ' + (contexto?.funnel?.closed || 0) + '\n\n';

        resumenDatos += '📈 CONVERSIONES:\n';
        resumenDatos += '- Lead a venta: ' + (contexto?.conversiones?.leadToSale || 0) + '%\n';
        resumenDatos += '- Lead a cita: ' + (contexto?.conversiones?.leadToCita || 0) + '%\n';
        resumenDatos += '- Visita a cierre: ' + (contexto?.conversiones?.visitaToClose || 0) + '%\n';
        resumenDatos += '- Leads por venta (ratio): ' + (contexto?.conversiones?.ratioLeadsPorVenta || 0) + ':1\n\n';

        resumenDatos += '🏆 TOP VENDEDORES:\n';
        if (contexto?.topVendedores) {
          for (const v of contexto.topVendedores) {
            resumenDatos += '- ' + v.name + ': ' + v.ventas + ' ventas, ' + v.leads + ' leads, ' + v.conversion + '% conv\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n🏘️ TOP DESARROLLOS:\n';
        if (contexto?.topDesarrollos) {
          for (const d of contexto.topDesarrollos) {
            resumenDatos += '- ' + d.name + ': ' + d.ventas + ' ventas, $' + (d.revenue / 1000000).toFixed(1) + 'M revenue\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        resumenDatos += '\n📣 LEADS POR FUENTE:\n';
        if (contexto?.fuentesLeads) {
          for (const f of contexto.fuentesLeads) {
            resumenDatos += '- ' + f.source + ': ' + f.count + ' leads, ' + f.closed + ' cerrados\n';
          }
        } else {
          resumenDatos += 'Sin datos\n';
        }

        // Llamar a Claude para responder
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 600,
            messages: [
              {
                role: 'user',
                content: 'Eres un asistente de análisis de datos para Santa Rita Residencial. Responde preguntas sobre el dashboard y métricas de ventas de forma clara, concisa y accionable.\n\n' + resumenDatos + '\n\nPREGUNTA DEL USUARIO: ' + pregunta + '\n\nResponde de forma directa y útil. Da recomendaciones específicas cuando sea apropiado. Usa emojis para hacer la respuesta más visual. Máximo 3-4 párrafos.'
              }
            ]
          })
        });

        const claudeData = await claudeResponse.json() as any;
        const respuesta = claudeData?.content?.[0]?.text || 'No pude procesar la pregunta.';

        return corsResponse(JSON.stringify({ respuesta }));

      } catch (err) {
        console.error('Error en chat IA dashboard:', err);
        return corsResponse(JSON.stringify({ error: 'Error procesando pregunta', respuesta: 'Hubo un error al procesar tu pregunta. Por favor intenta de nuevo.' }), 500);
      }
    }
    // ═══════════════════════════════════════════════════════════
    // Endpoint de prueba - Enviar TEMPLATE
    // Endpoint para ver templates aprobados de Meta
    if (url.pathname === '/api/templates' && request.method === 'GET') {
      try {
        const WABA_ID = '1227849769248437';

        // Obtener templates del WABA directamente
        const templatesUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?fields=name,status,language&limit=50`;
        const templatesResp = await fetch(templatesUrl, {
          headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` }
        });
        const templatesData = await templatesResp.json() as any;

        // Formatear respuesta
        const templates = templatesData?.data?.map((t: any) => ({
          name: t.name,
          status: t.status,
          language: t.language
        })) || [];

        return corsResponse(JSON.stringify({
          waba_id: WABA_ID,
          total: templates.length,
          templates: templates
        }, null, 2));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear TODOS los templates del funnel
    if (url.pathname === '/api/create-all-templates' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';
        const results: any[] = [];

        const templates = [
          {
            name: 'recordatorio_cita_24h',
            category: 'UTILITY',
            text: '📅 ¡Hola {{1}}! Te recordamos tu cita mañana.\n\n🏠 {{2}}\n📍 {{3}}\n⏰ {{4}}\n\n¿Nos confirmas tu asistencia? Responde *Sí* o *No*.\n\n¡Te esperamos! 🙌',
            example: [['María', 'Monte Verde', 'Av. Principal 123', '10:00 AM']]
          },
          {
            name: 'recordatorio_cita_2h',
            category: 'UTILITY',
            text: '⏰ ¡{{1}}, tu cita es en 2 horas!\n\n🏠 {{2}}\n📍 {{3}}\n\n¡Te esperamos! 🏡',
            example: [['María', 'Monte Verde', 'Av. Principal 123']]
          },
          {
            name: 'encuesta_post_visita',
            category: 'MARKETING',
            text: '¡Hola {{1}}! 👋\n\nGracias por visitarnos hoy en *{{2}}*. 🏠\n\n¿Qué te pareció? Responde:\n1️⃣ Me encantó\n2️⃣ Quiero ver más opciones\n3️⃣ Tengo dudas\n\nEstoy aquí para ayudarte 😊',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'reagendar_noshow',
            category: 'UTILITY',
            text: '👋 Hola {{1}},\n\nNotamos que no pudiste llegar a tu cita en *{{2}}*.\n\n¡No te preocupes! 😊 ¿Te gustaría reagendar?\n\nSolo dime qué día y hora te funcionan mejor. 📅',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'info_credito',
            category: 'MARKETING',
            text: '🏦 ¡Hola {{1}}!\n\nTe comparto información sobre crédito hipotecario para *{{2}}*:\n\n✅ Hasta 20 años de plazo\n✅ Tasa competitiva\n✅ Varios bancos disponibles\n\n¿Te gustaría que un asesor te contacte? Responde *Sí*.',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'referidos_postventa',
            category: 'MARKETING',
            text: '🎉 ¡Hola {{1}}!\n\nYa pasó un mes desde que elegiste tu nuevo hogar en *{{2}}*. ¡Esperamos que lo estés disfrutando!\n\n🎁 *Programa de Referidos*\nSi conoces a alguien buscando casa, envíanos:\n*Referido Nombre Teléfono*\n\n¡Y ganas premios! 🏆',
            example: [['María', 'Monte Verde']]
          },
          {
            name: 'feliz_cumple',
            category: 'MARKETING',
            text: '🎂 ¡Feliz cumpleaños {{1}}! 🎉\n\nTodo el equipo te desea un día increíble.\n\nGracias por ser parte de nuestra familia. 🏠💙',
            example: [['María']]
          },
          {
            name: 'reactivacion_lead',
            category: 'MARKETING',
            text: '👋 ¡Hola {{1}}!\n\nHace tiempo no platicamos. ¿Sigues buscando casa en Zacatecas? 🏠\n\nTenemos nuevas opciones que podrían interesarte.\n\nResponde *Sí* y te cuento las novedades. 😊',
            example: [['María']]
          },
          {
            name: 'promo_desarrollo',
            category: 'MARKETING',
            text: '🎉 ¡Hola {{1}}!\n\n*PROMOCIÓN ESPECIAL* en {{2}}:\n\n{{3}}\n\n⏰ Válido por tiempo limitado.\n\n¿Te interesa? Responde *Sí* para más información.',
            example: [['María', 'Monte Verde', '10% de descuento en enganche']]
          },
          {
            name: 'invitacion_evento',
            category: 'MARKETING',
            text: '🏠 ¡Hola {{1}}!\n\nTe invitamos a *{{2}}*\n\n📅 {{3}}\n📍 {{4}}\n\n¡No te lo pierdas! Responde *Confirmo* para apartar tu lugar. 🎉',
            example: [['María', 'Feria de la Vivienda', 'Sábado 25 de enero, 10am', 'Monte Verde']]
          },
          {
            name: 'reactivar_equipo',
            category: 'UTILITY',
            text: '👋 ¡Hola {{1}}!\n\nSoy SARA, tu asistente de Grupo Santa Rita. 🏠\n\nResponde cualquier mensaje para activar nuestra conversación y poder enviarte reportes, alertas y notificaciones.\n\nEscribe *ayuda* para ver comandos disponibles. 💪',
            example: [['Oscar']]
          }
        ];

        for (const tmpl of templates) {
          const payload = {
            name: tmpl.name,
            language: 'es_MX',
            category: tmpl.category,
            components: [
              {
                type: 'BODY',
                text: tmpl.text,
                example: { body_text: tmpl.example }
              }
            ]
          };

          const response = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();
          results.push({
            name: tmpl.name,
            success: response.ok,
            status: response.status,
            result
          });
        }

        return corsResponse(JSON.stringify({ templates_created: results }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Crear template individual (legacy)
    if (url.pathname === '/api/create-reengagement-template' && request.method === 'POST') {
      try {
        const WABA_ID = '1227849769248437';

        const templatePayload = {
          name: 'seguimiento_lead',
          language: 'es_MX',
          category: 'MARKETING',
          components: [
            {
              type: 'BODY',
              text: '¡Hola {{1}}! 👋\n\nHace unos días platicamos sobre *{{2}}* y quería saber si aún te interesa conocer más.\n\n¿Tienes alguna duda que pueda resolver? Responde *Sí* y con gusto te ayudo. 🏠',
              example: {
                body_text: [['Juan', 'Monte Verde']]
              }
            }
          ]
        };

        const createUrl = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`;
        const response = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templatePayload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          status: response.status,
          template_name: 'seguimiento_lead',
          result
        }, null, 2));

      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // Endpoint genérico para enviar cualquier template
    if (url.pathname === '/api/send-template' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { phone, template, params } = body;

        if (!phone || !template) {
          return corsResponse(JSON.stringify({ error: 'phone y template son requeridos' }), 400);
        }

        // Normalizar teléfono
        const digits = phone.replace(/\D/g, '');
        const phoneNormalized = digits.length === 10 ? '521' + digits :
                               digits.startsWith('52') && digits.length === 12 ? '521' + digits.slice(2) : digits;

        // Construir componentes del template
        const components: any[] = [];
        if (params && params.length > 0) {
          components.push({
            type: 'body',
            parameters: params.map((p: string) => ({ type: 'text', text: p }))
          });
        }

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNormalized,
          type: 'template',
          template: {
            name: template,
            language: { code: 'es_MX' },
            components
          }
        };

        console.log('📤 Enviando template:', template, 'a', phoneNormalized);

        const response = await fetch(`https://graph.facebook.com/v22.0/${env.META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        return corsResponse(JSON.stringify({
          success: response.ok,
          template,
          phone: phoneNormalized,
          result
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

        // Template Meta appointment_confirmation_v2: ¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.
        // Botón dinámico: https://maps.app.goo.gl/{{1}}
        const gpsCode = body.gps_link ? body.gps_link.replace(/^https?:\/\/maps\.app\.goo\.gl\//, '') : (body.gps_code || 'qR8vK3xYz9M');
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNormalized,
          type: 'template',
          template: {
            name: 'appointment_confirmation_v2',
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: body.nombre || 'Cliente' },                              // {{1}} Nombre
                  { type: 'text', text: 'Grupo Santa Rita' },                                    // {{2}} Empresa
                  { type: 'text', text: `visita a ${body.desarrollo || 'nuestras oficinas'}` },  // {{3}} Visita
                  { type: 'text', text: body.fecha || '10 de enero' },                           // {{4}} Fecha
                  { type: 'text', text: body.hora || '5:00 PM' }                                 // {{5}} Hora
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  { type: 'text', text: gpsCode }                                                // {{1}} Sufijo GPS
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
    // CLEANUP TEST LEAD - Borrar lead y citas para simulación
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/test-cleanup' && request.method === 'POST') {
      try {
        const body = await request.json() as { telefono: string };
        const telefono = body.telefono;
        if (!telefono) {
          return corsResponse(JSON.stringify({ error: 'telefono requerido' }), 400);
        }

        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        const phoneClean = telefono.replace(/\D/g, '').slice(-10);

        // Buscar TODOS los leads con ese número (puede haber duplicados)
        const { data: leads, error: searchError } = await supabase.client
          .from('leads')
          .select('id, name, phone')
          .ilike('phone', `%${phoneClean}%`);

        if (searchError) {
          return corsResponse(JSON.stringify({ error: 'Error buscando leads: ' + searchError.message }), 500);
        }

        if (!leads || leads.length === 0) {
          return corsResponse(JSON.stringify({ message: 'No se encontraron leads', telefono }));
        }

        console.log(`🧹 CLEANUP: Encontrados ${leads.length} leads con ${phoneClean}`);
        leads.forEach(l => console.log(`   - ${l.id}: ${l.name} (${l.phone})`));

        let totalCitasBorradas = 0;
        const leadsBorrados: string[] = [];

        // Borrar cada lead y sus citas
        for (const lead of leads) {
          // Borrar citas del lead
          const { data: citasBorradas, error: citasError } = await supabase.client
            .from('appointments')
            .delete()
            .eq('lead_id', lead.id)
            .select('id');

          if (citasError) {
            console.log(`⚠️ Error borrando citas de ${lead.name}: ${citasError.message}`);
          }
          totalCitasBorradas += citasBorradas?.length || 0;

          // Borrar aplicaciones de hipoteca
          const { error: mortgageError } = await supabase.client
            .from('mortgage_applications')
            .delete()
            .eq('lead_id', lead.id);

          if (mortgageError) {
            console.log(`⚠️ Error borrando mortgage_applications de ${lead.name}: ${mortgageError.message}`);
          } else {
            console.log(`✅ Mortgage applications borradas para ${lead.name}`);
          }

          // Borrar lead
          const { error: deleteError } = await supabase.client
            .from('leads')
            .delete()
            .eq('id', lead.id);

          if (deleteError) {
            console.log(`❌ Error borrando lead ${lead.name}: ${deleteError.message}`);
          } else {
            console.log(`✅ Lead ${lead.name} borrado exitosamente`);
            leadsBorrados.push(lead.name || lead.id);
          }
        }

        return corsResponse(JSON.stringify({
          success: true,
          leads_encontrados: leads.length,
          leads_borrados: leadsBorrados,
          citas_borradas: totalCitasBorradas
        }));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CANCEL APPOINTMENT BY PHONE - Cancelar cita de un lead por teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/cancel-appointment' && request.method === 'POST') {
      try {
        const body = await request.json() as { telefono: string };
        const telefono = body.telefono;
        if (!telefono) {
          return corsResponse(JSON.stringify({ error: 'telefono requerido' }), 400);
        }

        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        const phoneClean = telefono.replace(/\D/g, '').slice(-10);

        // Buscar lead
        const { data: leads } = await supabase.client.from('leads').select('*').ilike('phone', `%${phoneClean}%`);
        if (!leads || leads.length === 0) {
          return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
        }

        const lead = leads[0];
        console.log(`🗑️ Cancelando citas para lead ${lead.id} (${lead.name})`);

        // Buscar y cancelar citas
        const { data: appointments } = await supabase.client.from('appointments').select('*').eq('lead_id', lead.id).neq('status', 'cancelled');

        if (!appointments || appointments.length === 0) {
          return corsResponse(JSON.stringify({ message: 'No hay citas activas para este lead', lead_id: lead.id }));
        }

        let citasCanceladas = 0;
        for (const apt of appointments) {
          await supabase.client.from('appointments').update({
            status: 'cancelled',
            cancellation_reason: 'Cancelado para prueba E2E',
            cancelled_by: 'admin'
          }).eq('id', apt.id);
          citasCanceladas++;
          console.log(`✅ Cita ${apt.id} cancelada`);
        }

        // Actualizar status del lead a contacted
        await supabase.client.from('leads').update({
          status: 'contacted',
          property_interest: null
        }).eq('id', lead.id);

        return corsResponse(JSON.stringify({
          success: true,
          lead_id: lead.id,
          lead_name: lead.name,
          citas_canceladas: citasCanceladas
        }));
      } catch (error: any) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
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
        console.log('📥 WEBHOOK META: Recibiendo mensaje...');
        const body = await request.json() as any;
        console.log('📥 Body recibido:', JSON.stringify(body).substring(0, 500));

        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;

        console.log('📥 Messages encontrados:', messages?.length || 0);

        if (messages && messages.length > 0) {
          const message = messages[0];
          const from = message.from;
          const text = message.text?.body || '';
          const messageId = message.id; // WhatsApp message ID para dedup
          const messageType = message.type; // text, image, document, etc.

          console.log(`📥 Procesando mensaje de ${from}: tipo=${messageType}, texto="${text.substring(0, 50)}..."`);

          // ═══ DEDUPLICACIÓN: Evitar procesar mensajes rápidos duplicados ═══
          const cleanPhone = from.replace(/\D/g, '');
          const { data: recentMsg } = await supabase.client
            .from('leads')
            .select('notes')
            .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
            .single();

          const lastMsgId = recentMsg?.notes?.last_processed_msg_id;
          const lastMsgTime = recentMsg?.notes?.last_processed_msg_time;
          const now = Date.now();

          // Si el mismo mensaje ID ya fue procesado, saltar
          if (lastMsgId === messageId) {
            console.log('⏭️ Mensaje ya procesado (mismo ID), saltando');
            return new Response('OK', { status: 200 });
          }

          // Si hubo un mensaje procesado hace menos de 3 segundos, esperar y combinar
          if (lastMsgTime && (now - lastMsgTime) < 3000) {
            console.log('⏳ Mensaje muy rápido, esperando 2s para combinar...');
            await new Promise(r => setTimeout(r, 2000));
          }

          // Marcar este mensaje como en proceso
          if (recentMsg) {
            await supabase.client
              .from('leads')
              .update({
                notes: {
                  ...(recentMsg.notes || {}),
                  last_processed_msg_id: messageId,
                  last_processed_msg_time: now
                }
              })
              .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`);
          }
          // ═══ FIN DEDUPLICACIÓN ═══

          const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const handler = new WhatsAppHandler(supabase, claude, meta as any, calendar, meta);

          // ═══ MANEJO DE IMÁGENES PARA FLUJO DE CRÉDITO ═══
          if (messageType === 'image' || messageType === 'document') {
            console.log(`📸 Mensaje de tipo ${messageType} recibido`);

            // Obtener el media_id
            const mediaId = message.image?.id || message.document?.id;
            const caption = message.image?.caption || message.document?.caption || '';

            if (mediaId) {
              try {
                // Obtener URL del media
                const mediaUrl = await meta.getMediaUrl(mediaId);
                console.log(`📸 Media URL obtenida: ${mediaUrl ? 'OK' : 'ERROR'}`);

                if (mediaUrl) {
                  // Verificar si el lead está en flujo de crédito
                  const { CreditFlowService } = await import('./services/creditFlowService');
                  const creditService = new CreditFlowService(supabase, env.OPENAI_API_KEY);

                  // Buscar lead
                  const { data: lead } = await supabase.client
                    .from('leads')
                    .select('*')
                    .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
                    .single();

                  if (lead) {
                    const enFlujoCredito = await creditService.estaEnFlujoCredito(lead.id);

                    if (enFlujoCredito) {
                      console.log(`🏦 Lead ${lead.id} en flujo de crédito - procesando documento`);

                      const resultado = await creditService.procesarRespuesta(lead.id, caption, mediaUrl);

                      if (resultado) {
                        await meta.sendWhatsAppMessage(from, resultado.respuesta);

                        // Si hay acción de conectar asesor
                        if (resultado.accion === 'conectar_asesor' && resultado.datos?.asesor) {
                          const asesor = resultado.datos.asesor;

                          // Enviar mensaje al cliente con datos del asesor
                          const msgCliente = creditService.generarMensajeAsesor(
                            asesor,
                            resultado.context.lead_name.split(' ')[0],
                            resultado.context.modalidad
                          );
                          await meta.sendWhatsAppMessage(from, msgCliente);

                          // Notificar al asesor (solo si está activo)
                          if (asesor.phone && asesor.is_active !== false) {
                            const msgAsesor = creditService.generarNotificacionAsesor(lead, resultado.context);
                            await meta.sendWhatsAppMessage(asesor.phone, msgAsesor);
                            console.log(`📤 Asesor ${asesor.name} notificado`);
                          }
                        }
                      }

                      console.log('✅ Documento de crédito procesado');
                      return new Response('OK', { status: 200 });
                    }
                  }
                }
              } catch (imgErr) {
                console.error('❌ Error procesando imagen:', imgErr);
              }
            }

            // Si no está en flujo de crédito, ignorar imagen o responder genérico
            if (!text && !message.image?.caption) {
              await meta.sendWhatsAppMessage(from,
                '📷 Recibí tu imagen. Si necesitas ayuda con un crédito hipotecario, escríbeme "quiero crédito" y te guío paso a paso.');
              return new Response('OK', { status: 200 });
            }
          }
          // ═══ FIN MANEJO DE IMÁGENES ═══

          // ═══ DETECCIÓN DE LEADS CALIENTES Y OBJECIONES ═══
          // Detectar señales de compra y objeciones ANTES de procesar el mensaje
          if (text && text.length > 3) {
            try {
              const cleanPhoneHot = from.replace(/\D/g, '');
              const { data: leadHot } = await supabase.client
                .from('leads')
                .select('id, name, phone, assigned_to, property_interest, notes, status')
                .or(`phone.eq.${cleanPhoneHot},phone.like.%${cleanPhoneHot.slice(-10)}`)
                .single();

              if (leadHot && leadHot.assigned_to) {
                // Detectar señales calientes
                const señalesCalientes = detectarSeñalesCalientes(text);
                if (señalesCalientes.length > 0) {
                  console.log(`🔥 Señales calientes detectadas para ${leadHot.name}: ${señalesCalientes.map(s => s.tipo).join(', ')}`);
                  await alertarLeadCaliente(supabase, meta, leadHot, text, señalesCalientes);
                }

                // Detectar objeciones
                const objeciones = detectarObjeciones(text);
                if (objeciones.length > 0) {
                  console.log(`⚠️ Objeciones detectadas para ${leadHot.name}: ${objeciones.map(o => o.tipo).join(', ')}`);
                  await alertarObjecion(supabase, meta, leadHot, text, objeciones);
                }

                // Procesar respuesta NPS si aplica
                const npsProcessed = await procesarRespuestaNPS(supabase, meta, leadHot, text);
                if (npsProcessed) {
                  console.log(`📊 Respuesta NPS procesada para ${leadHot.name}`);
                }
              }
            } catch (hotErr) {
              console.error('Error en detección de leads calientes/objeciones:', hotErr);
            }
          }
          // ═══ FIN DETECCIÓN DE LEADS CALIENTES Y OBJECIONES ═══

          await handler.handleIncomingMessage(`whatsapp:+${from}`, text, env);

          console.log('✅ Mensaje procesado correctamente');

          // Cancelar follow-ups cuando el lead responde
          const followupService = new FollowupService(supabase);
          await followupService.cancelarPorRespuesta('', from);
        } else {
          console.log('⚠️ No hay mensajes en el webhook (puede ser status update)');
        }

        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('❌ Meta Webhook Error:', error);
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
          console.log('📅 Procesando cambios de Google Calendar...');
          const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
          const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
          
          // Obtener eventos de las últimas 24 horas y próximos 30 días
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          
          const events = await calendar.getEvents(yesterday.toISOString(), nextMonth.toISOString());
          const googleEventIds = events.map((e: any) => e.id);
          console.log(`📅 Eventos en Google Calendar: ${events.length}, IDs: ${googleEventIds.slice(0, 5).join(', ')}...`);

          // 1. DETECTAR EVENTOS ELIMINADOS: Buscar citas que tienen google_event_id pero ya no existen en Google
          // IMPORTANTE: Solo verificar citas dentro del rango de fechas que consultamos a Google
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          const nextMonthStr = nextMonth.toISOString().split('T')[0];

          // ✅ FIX 14-ENE-2026: También detectar citas completadas que fueron borradas del calendario
          // ✅ FIX 15-ENE-2026: Incluir canceladas para poder verificar si Sara ya canceló
          const { data: citasConGoogle } = await supabase.client
            .from('appointments')
            .select('*')
            .not('google_event_vendedor_id', 'is', null)
            .in('status', ['scheduled', 'completed', 'cancelled']) // Incluir canceladas para verificar
            .gte('scheduled_date', yesterdayStr)  // Solo citas desde ayer
            .lte('scheduled_date', nextMonthStr); // Hasta próximo mes
          
          console.log(`📅 Citas con google_event_vendedor_id en BD: ${citasConGoogle?.length || 0}`);
          if (citasConGoogle && citasConGoogle.length > 0) {
            console.log(`📅 IDs de eventos en citas: ${citasConGoogle.map(c => c.google_event_vendedor_id?.substring(0,15)).join(', ')}`);
          }

          if (citasConGoogle) {
            for (const cita of citasConGoogle) {
              if (cita.google_event_vendedor_id && !googleEventIds.includes(cita.google_event_vendedor_id)) {
                // El evento fue eliminado de Google Calendar

                // ═══ FIX: Ignorar citas ya procesadas por Sara ═══
                if (cita.status === 'rescheduled') {
                  console.log(`📅 Evento eliminado pero cita ya reagendada, ignorando: ${cita.id}`);
                  continue;
                }
                if (cita.status === 'cancelled') {
                  console.log(`📅 Evento eliminado pero cita ya cancelada por Sara, ignorando: ${cita.id}`);
                  continue;
                }

                // Solo actualizar BD - NO enviar notificaciones (Sara se encarga de eso)
                const eraCompletada = cita.status === 'completed';
                console.log(`📅 Evento eliminado de Google, actualizando BD: ${cita.id} (era: ${cita.status})`);

                await supabase.client
                  .from('appointments')
                  .update({
                    status: 'cancelled',
                    cancelled_by: eraCompletada ? 'Google Calendar (eliminado post-visita)' : 'Google Calendar (eliminado)',
                  })
                  .eq('id', cita.id);

                console.log(`📅 Cita ${cita.id} marcada como cancelada (sin notificaciones - Sara se encarga)`);
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

                  // ═══ VERIFICAR SI SARA YA REAGENDÓ (evitar duplicados) ═══
                  // Verificar si las notas indican que Sara ya reagendó a esta fecha/hora
                  const notes = appointment.notes || '';
                  if (notes.includes('Reagendada') && notes.includes('→')) {
                    // Formato: "Reagendada de 2026-01-16 10:00 → 2026-01-16 11:15"
                    const partes = notes.split('→');
                    if (partes.length >= 2) {
                      const destino = partes[1].trim(); // "2026-01-16 11:15"
                      if (destino.includes(newDate) && destino.includes(newTime)) {
                        console.log('📅 Webhook Calendar: Ignorando - Sara ya reagendó a', destino);
                        continue; // Saltar notificaciones, Sara ya las envió
                      }
                    }
                  }

                  // Solo actualizar BD - NO enviar notificaciones (Sara ya las envía)
                  await supabase.client
                    .from('appointments')
                    .update({
                      scheduled_date: newDate,
                      scheduled_time: newTime,
                      property_name: event.location || appointment.property_name,
                    })
                    .eq('id', appointment.id);
                  console.log('📅 Cita sincronizada desde Google Calendar:', appointment.id, newDate, newTime);
                  console.log('📅 (Sin notificaciones - Sara ya las envió)');
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

    // ═══════════════════════════════════════════════════════════════
    // ENDPOINT: Limpiar eventos huérfanos de Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/calendar/cleanup' && request.method === 'POST') {
      try {
        const calendar = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);

        // 1. Obtener eventos de Calendar
        const now = new Date();
        const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const events = await calendar.getEvents(now.toISOString(), nextMonth.toISOString());

        // 2. Obtener IDs de eventos válidos de la BD
        const { data: citasValidas } = await supabase.client
          .from('appointments')
          .select('google_event_vendedor_id, google_event_id, lead_name, scheduled_date, scheduled_time, status')
          .not('status', 'eq', 'cancelled'); // Todas las citas excepto canceladas

        const idsValidos = new Set<string>();
        citasValidas?.forEach(c => {
          if (c.google_event_vendedor_id) idsValidos.add(c.google_event_vendedor_id);
          if (c.google_event_id) idsValidos.add(c.google_event_id);
        });

        console.log('📅 Eventos en Calendar:', events.length);
        console.log('📅 IDs válidos en BD:', idsValidos.size);

        // 3. Identificar eventos huérfanos (no están en BD)
        const huerfanos: any[] = [];
        const validos: any[] = [];

        for (const event of events) {
          if (idsValidos.has(event.id)) {
            validos.push({ id: event.id, summary: event.summary, start: event.start?.dateTime });
          } else {
            huerfanos.push({ id: event.id, summary: event.summary, start: event.start?.dateTime });
          }
        }

        // 4. Borrar eventos huérfanos
        const borrados: string[] = [];
        for (const huerfano of huerfanos) {
          try {
            await calendar.deleteEvent(huerfano.id);
            borrados.push(huerfano.summary || huerfano.id);
            console.log('🗑️ Evento huérfano borrado:', huerfano.summary);
          } catch (e) {
            console.log('⚠️ Error borrando evento:', huerfano.id, e);
          }
        }

        return corsResponse(JSON.stringify({
          eventos_en_calendar: events.length,
          citas_validas_bd: citasValidas?.length || 0,
          huerfanos_encontrados: huerfanos.length,
          huerfanos_borrados: borrados,
          eventos_validos: validos
        }, null, 2));

      } catch (error: any) {
        console.error('Error en cleanup:', error);
        return corsResponse(JSON.stringify({ error: error.message }), 500);
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
    // TEST FOLLOW-UPS: Verificar qué leads cumplen criterios
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-followups') {
      console.log('🔍 TEST: Verificando criterios de follow-ups...');

      const ahora = new Date();
      const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
      const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
      const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

      const resultados: any = {};

      // 1. Follow-up 24h leads nuevos
      const { data: leads24h } = await supabase.client
        .from('leads')
        .select('id, name, phone, created_at, alerta_enviada_24h')
        .eq('status', 'new')
        .lt('created_at', hace24h.toISOString())
        .is('alerta_enviada_24h', null)
        .not('phone', 'is', null)
        .limit(10);

      resultados.followUp24h = {
        criterio: 'status=new, created_at < 24h, alerta_enviada_24h IS NULL',
        encontrados: leads24h?.length || 0,
        leads: leads24h?.map(l => ({ name: l.name, phone: l.phone, created: l.created_at })) || []
      };

      // 2. Reminder docs crédito
      const { data: leadsDocs } = await supabase.client
        .from('leads')
        .select('id, name, phone, credit_status, updated_at')
        .eq('credit_status', 'docs_requested')
        .lt('updated_at', hace3dias.toISOString())
        .not('phone', 'is', null)
        .limit(10);

      resultados.reminderDocs = {
        criterio: 'credit_status=docs_requested, updated_at < 3 días',
        encontrados: leadsDocs?.length || 0,
        leads: leadsDocs?.map(l => ({ name: l.name, phone: l.phone })) || []
      };

      // 3. Video felicitación post-venta
      const { data: leadsSold } = await supabase.client
        .from('leads')
        .select('id, name, phone, property_interest, notes, updated_at')
        .eq('status', 'sold')
        .gt('updated_at', hace7dias.toISOString())
        .not('phone', 'is', null)
        .limit(10);

      const leadsSinVideo = leadsSold?.filter(l => {
        const notas = typeof l.notes === 'object' ? l.notes : {};
        return !(notas as any)?.video_felicitacion_generado;
      }) || [];

      resultados.videoPostVenta = {
        criterio: 'status=sold, updated_at > 7 días, sin video_felicitacion_generado',
        encontrados: leadsSinVideo.length,
        leads: leadsSinVideo.map(l => ({ name: l.name, property_interest: l.property_interest }))
      };

      // Distribución de status
      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('status')
        .limit(2000);

      const statusCount: Record<string, number> = {};
      allLeads?.forEach(l => {
        statusCount[l.status || 'null'] = (statusCount[l.status || 'null'] || 0) + 1;
      });
      resultados.distribucionStatus = statusCount;

      // Credit status distribution
      const { data: creditLeads } = await supabase.client
        .from('leads')
        .select('credit_status')
        .limit(1000);

      const creditCount: Record<string, number> = {};
      creditLeads?.forEach(l => {
        creditCount[l.credit_status || 'null'] = (creditCount[l.credit_status || 'null'] || 0) + 1;
      });
      resultados.distribucionCreditStatus = creditCount;

      return corsResponse(JSON.stringify(resultados, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Listar leads y actualizar status
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/list-leads') {
      const { data: leads } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, property_interest')
        .limit(20);
      return corsResponse(JSON.stringify(leads, null, 2));
    }

    if (url.pathname.startsWith('/set-sold/')) {
      const leadId = url.pathname.split('/').pop();
      const { data: lead, error } = await supabase.client
        .from('leads')
        .update({
          status: 'sold',
          updated_at: new Date().toISOString(),
          notes: { video_felicitacion_generado: null } // Reset para probar
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 400);
      }
      return corsResponse(JSON.stringify({
        message: 'Lead actualizado a sold',
        lead: { id: lead.id, name: lead.name, status: lead.status, property_interest: lead.property_interest }
      }, null, 2));
    }

    // Forzar ejecución de video post-venta
    if (url.pathname === '/run-video-postventa') {
      console.log('🎬 Forzando ejecución de video post-venta...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await videoFelicitacionPostVenta(supabase, meta, env);
      return corsResponse(JSON.stringify({ message: 'Video post-venta ejecutado. Revisa /debug-videos para ver el estado.' }));
    }

    if (url.pathname === '/run-video-bienvenida') {
      console.log('🎬 Forzando ejecución de video bienvenida...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await videoBienvenidaLeadNuevo(supabase, meta, env);
      return corsResponse(JSON.stringify({ message: 'Video bienvenida ejecutado. Revisa /debug-videos para ver el estado.' }));
    }

    // Debug GPS links de propiedades
    if (url.pathname === '/debug-gps') {
      const { data: props, error } = await supabase.client
        .from('properties')
        .select('development, gps_link')
        .order('development');

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      const devs: Record<string, string> = {};
      props?.forEach((p: any) => {
        if (p.development && !devs[p.development]) {
          devs[p.development] = p.gps_link || 'NO TIENE';
        }
      });

      return corsResponse(JSON.stringify(devs, null, 2));
    }

    // Reset recursos para un lead (para reenviar videos)
    if (url.pathname === '/reset-lead-resources') {
      const body = await request.json() as any;
      const phone = body.phone;
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Se requiere phone' }), 400);
      }

      const digits = phone.replace(/\D/g, '').slice(-10);
      const { data: lead, error } = await supabase.client
        .from('leads')
        .select('id, name, resources_sent, resources_sent_for')
        .like('phone', '%' + digits)
        .single();

      if (error || !lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', phone }), 404);
      }

      // Resetear las columnas resources_sent
      await supabase.client
        .from('leads')
        .update({
          resources_sent: false,
          resources_sent_for: null
        })
        .eq('id', lead.id);

      return corsResponse(JSON.stringify({
        success: true,
        message: `Recursos reseteados para ${lead.name}`,
        lead_id: lead.id,
        antes: { resources_sent: lead.resources_sent, resources_sent_for: lead.resources_sent_for }
      }));
    }

    if (url.pathname === '/run-lead-scoring') {
      console.log('📊 Forzando actualización de lead scores...');
      await actualizarLeadScores(supabase);

      // Mostrar resumen de scores
      const { data: leads } = await supabase.client
        .from('leads')
        .select('name, score, lead_category, status')
        .not('status', 'in', '("closed","delivered","lost","fallen")')
        .order('score', { ascending: false })
        .limit(20);

      return corsResponse(JSON.stringify({
        message: 'Lead scoring ejecutado',
        top_leads: leads?.map(l => ({
          nombre: l.name,
          score: l.score,
          categoria: l.lead_category,
          status: l.status
        }))
      }, null, 2));
    }

    if (url.pathname === '/run-followup-postvisita') {
      console.log('📍 Forzando follow-up post-visita...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await followUpPostVisita(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Follow-up post-visita ejecutado.' }));
    }

    if (url.pathname === '/run-nurturing') {
      console.log('📚 Forzando nurturing educativo...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await nurturingEducativo(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Nurturing educativo ejecutado.' }));
    }

    if (url.pathname === '/run-referidos') {
      console.log('🤝 Forzando solicitud de referidos...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await solicitarReferidos(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Solicitud de referidos ejecutada.' }));
    }

    if (url.pathname === '/run-nps') {
      console.log('📊 Forzando envío de encuestas NPS...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarEncuestaNPS(supabase, meta);
      return corsResponse(JSON.stringify({ message: 'Encuestas NPS enviadas.' }));
    }

    if (url.pathname === '/test-objecion') {
      // Endpoint para probar detección de objeciones
      const testMsg = url.searchParams.get('msg') || 'está muy caro, no me alcanza';
      const objeciones = detectarObjeciones(testMsg);
      return corsResponse(JSON.stringify({
        mensaje: testMsg,
        objeciones_detectadas: objeciones.map(o => ({
          tipo: o.tipo,
          prioridad: o.prioridad
        }))
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // REENVIAR VIDEO: Para videos que tienen URL pero no se enviaron
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/retry-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reintentando envío de video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      if (!video.video_url || video.video_url.startsWith('ERROR')) {
        return corsResponse(JSON.stringify({ error: 'Video no tiene URL válida', video_url: video.video_url }), 400);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video de Google
        console.log(`📥 Descargando video de Google...`);
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({
            error: 'Error descargando video',
            status: videoResponse.status,
            details: await videoResponse.text()
          }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Video subido a Meta: ${mediaId}`);

        // Enviar por WhatsApp
        await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
          `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

        // Actualizar registro como realmente enviado
        await supabase.client
          .from('pending_videos')
          .update({ sent: true, completed_at: new Date().toISOString(), video_url: video.video_url + ' (ENVIADO)' })
          .eq('id', video.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video enviado exitosamente a ${video.lead_name} (${video.lead_phone})`,
          media_id: mediaId
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESET VIDEO: Marcar video como no enviado para reintento
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/reset-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reseteando video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      // Resetear para que el cron lo procese de nuevo
      await supabase.client
        .from('pending_videos')
        .update({ sent: false, completed_at: null })
        .eq('id', videoId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Video ${videoId} reseteado. Se procesará en el próximo cron.`
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // GENERAR VIDEO DE PRUEBA: Para cualquier teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-video-personalizado/')) {
      const phone = url.pathname.split('/').pop();
      const phoneFormatted = phone?.startsWith('52') ? phone : `52${phone}`;
      const nombre = url.searchParams.get('nombre') || 'Amigo';
      const desarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';

      console.log(`🎬 Generando video de prueba para ${phoneFormatted}...`);

      try {
        const apiKey = env.GEMINI_API_KEY;

        // Fotos de fachadas por desarrollo
        const fotosDesarrollo: Record<string, string> = {
          'Monte Verde': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/EUCALIPTO-0-scaled.jpg',
          'Los Encinos': 'https://gruposantarita.com.mx/wp-content/uploads/2021/07/M4215335.jpg',
          'Andes': 'https://gruposantarita.com.mx/wp-content/uploads/2022/09/Dalia_act.jpg',
          'Miravalle': 'https://gruposantarita.com.mx/wp-content/uploads/2025/02/FACHADA-MIRAVALLE-DESARROLLO-edit-min-scaled-e1740520053367.jpg',
          'Distrito Falco': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/img03-7.jpg',
          'Acacia': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/ACACIA-1-scaled.jpg'
        };

        const testFoto = fotosDesarrollo[desarrollo] || fotosDesarrollo['Monte Verde'];

        const imgResponse = await fetch(testFoto);
        const imgBuffer = await imgResponse.arrayBuffer();
        // Convertir a base64 sin overflow (chunked)
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const imgBase64 = btoa(binary);

        // Detectar género por nombre (nombres terminados en 'a' = femenino, excepto algunos)
        const nombreLower = nombre.toLowerCase();
        const excepcionesMasculinas = ['joshua', 'ezra', 'garcia', 'peña', 'borja', 'mejia'];
        const esFemenino = nombreLower.endsWith('a') && !excepcionesMasculinas.some(e => nombreLower.includes(e));
        const bienvenida = esFemenino ? 'bienvenida' : 'bienvenido';

        // PROMPT: Avatar DENTRO de la propiedad, SIN subtítulos ni texto
        const prompt = `A friendly female real estate agent standing inside the property shown in the image. She is positioned naturally in the space, at a comfortable distance from camera. The room and house surroundings are visible around her. She smiles and speaks welcomingly in Spanish: "Hola ${nombre}, ${bienvenida} a ti y a tu familia a tu nuevo hogar aquí en ${desarrollo}". Wide shot showing both agent and interior, cinematic lighting, 4k. No text, no subtitles, no captions, no overlays, clean video only.`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            instances: [{ prompt: prompt, image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' } }],
            parameters: { aspectRatio: '9:16', durationSeconds: 8 }
          })
        });

        const result = await response.json() as any;
        const operationName = result.name;

        if (!operationName) {
          return corsResponse(JSON.stringify({ error: 'No operation name', result }), 500);
        }

        await supabase.client.from('pending_videos').insert({
          operation_id: operationName,
          lead_phone: phoneFormatted,
          lead_name: nombre,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video generándose para ${nombre} (${phoneFormatted})`,
          operation_id: operationName,
          nota: 'El video tardará ~2 minutos. Se enviará automáticamente.'
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TEST HEYGEN: Probar video con HeyGen API
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-heygen/')) {
      const phone = url.pathname.split('/').pop();
      const phoneFormatted = phone?.startsWith('52') ? phone : `52${phone}`;
      const nombre = url.searchParams.get('nombre') || 'Amigo';
      const desarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';
      const fotoUrl = url.searchParams.get('foto') || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800';

      console.log(`🎬 [HeyGen] Generando video para ${phoneFormatted}...`);

      try {
        const heygenKey = env.HEYGEN_API_KEY;
        if (!heygenKey) {
          return corsResponse(JSON.stringify({ error: 'Falta HEYGEN_API_KEY' }), 500);
        }

        // Crear video con HeyGen
        const response = await fetch('https://api.heygen.com/v2/video/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': heygenKey
          },
          body: JSON.stringify({
            video_inputs: [{
              character: {
                type: 'avatar',
                avatar_id: 'Abigail_expressive_2024112501',
                avatar_style: 'normal'
              },
              voice: {
                type: 'text',
                input_text: `Hola ${nombre}, bienvenido a tu nuevo hogar aquí en ${desarrollo}. Estoy aquí para ayudarte a encontrar la casa de tus sueños. ¡Contáctanos hoy!`,
                voice_id: '6ce26db0cb6f4e7881b85452619f7f19'  // Camila Vega - Spanish female
              },
              background: {
                type: 'image',
                url: fotoUrl
              }
            }],
            dimension: {
              width: 720,
              height: 1280
            }
          })
        });

        const result = await response.json() as any;
        console.log('HeyGen response:', JSON.stringify(result));

        if (result.error) {
          return corsResponse(JSON.stringify({ error: result.error }), 500);
        }

        // Guardar en pending_videos con prefijo HEYGEN
        await supabase.client.from('pending_videos').insert({
          operation_id: `HEYGEN_${result.data?.video_id || 'unknown'}`,
          lead_phone: phoneFormatted,
          lead_name: nombre,
          desarrollo: desarrollo
        });

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Video HeyGen generándose para ${nombre}`,
          video_id: result.data?.video_id,
          status: result.data?.status,
          nota: 'El video tardará ~1 minuto. Se enviará automáticamente.'
        }));
      } catch (e: any) {
        console.error('Error HeyGen:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Listar avatares disponibles
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/heygen-avatars') {
      try {
        const response = await fetch('https://api.heygen.com/v2/avatars', {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Listar voces disponibles
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/heygen-voices') {
      try {
        const response = await fetch('https://api.heygen.com/v2/voices', {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Ver estado de video
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/heygen-status/')) {
      const videoId = url.pathname.split('/').pop();
      try {
        const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const result = await response.json();
        return corsResponse(JSON.stringify(result));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // HEYGEN: Enviar video completado a WhatsApp
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/heygen-send/')) {
      const videoId = url.pathname.split('/').pop();
      const phone = url.searchParams.get('phone') || '525610016226';

      try {
        // Obtener estado del video
        const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { 'X-Api-Key': env.HEYGEN_API_KEY }
        });
        const status = await statusRes.json() as any;

        if (status.data?.status !== 'completed') {
          return corsResponse(JSON.stringify({ error: 'Video no completado', status: status.data?.status }), 400);
        }

        const videoUrl = status.data.video_url;
        if (!videoUrl) {
          return corsResponse(JSON.stringify({ error: 'No video URL' }), 400);
        }

        // Descargar video
        console.log('📥 Descargando video de HeyGen...');
        const videoRes = await fetch(videoUrl);
        const videoBuffer = await videoRes.arrayBuffer();
        console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta y enviar
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Video subido a Meta: ${mediaId}`);

        await meta.sendWhatsAppVideoById(phone, mediaId, '🎬 *¡Video personalizado para ti!*');
        console.log(`✅ Video enviado a ${phone}`);

        return corsResponse(JSON.stringify({ ok: true, message: `Video HeyGen enviado a ${phone}` }));
      } catch (e: any) {
        console.error('Error enviando video HeyGen:', e);
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
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
        // Prompt optimizado para evitar filtros de seguridad de Google
        const prompt = `A welcoming real estate video tour. Cinematic drone shot slowly approaching the beautiful house in the image. Smooth camera movement reveals the home's exterior details. Warm golden hour lighting. Professional real estate marketing video style. Text overlay appears: "Bienvenido ${failedVideo.lead_name} - ${desarrollo}". High quality, 4K resolution.`;

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

    // ═══════════════════════════════════════════════════════════
    // DEBUG: Ver respuesta completa de Google para una operación
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/check-google-operation/')) {
      const opId = url.pathname.replace('/check-google-operation/', '');
      console.log(`🔍 Verificando operación Google: ${opId}`);

      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${opId}`,
        { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } }
      );

      const responseText = await statusResponse.text();
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }

      return corsResponse(JSON.stringify({
        status_code: statusResponse.status,
        raw_response: responseText.substring(0, 2000),
        parsed: parsed,
        possible_uri_paths: parsed ? {
          path1: parsed?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
          path2: parsed?.response?.generatedSamples?.[0]?.video?.uri,
          path3: parsed?.result?.videos?.[0]?.uri,
          path4: parsed?.videos?.[0]?.uri,
          path5: parsed?.response?.video?.uri,
          path6: parsed?.metadata?.videos?.[0]?.uri
        } : null
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // ADMIN: Eliminar lead por ID o teléfono
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/admin/delete-lead/')) {
      const identifier = url.pathname.split('/').pop();
      console.log(`🗑️ Eliminando lead: ${identifier}`);

      // Buscar por ID (UUID) o por teléfono
      const isUUID = identifier?.includes('-') && identifier.length > 30;

      let query = supabase.client.from('leads').delete();
      if (isUUID) {
        query = query.eq('id', identifier);
      } else {
        query = query.ilike('phone', `%${identifier}%`);
      }

      const { error, count } = await query.select('id');

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead eliminado`,
        identifier
      }));
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
    // Test: Sistema de Aprobación de Follow-ups
    // ═══════════════════════════════════════════════════════════

    // Crear propuesta de follow-up para un lead
    if (url.pathname === '/test-proponer-followup') {
      const leadId = url.searchParams.get('lead_id');
      const categoria = url.searchParams.get('categoria') || 'inactivo_3dias';
      const razon = url.searchParams.get('razon') || 'Lead sin actividad - prueba manual';

      if (!leadId) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_id' }), 400);
      }

      // Obtener lead
      const { data: lead, error: leadError } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      if (!lead.assigned_to) {
        return corsResponse(JSON.stringify({ error: 'Lead sin vendedor asignado', leadName: lead.name }), 400);
      }

      // Obtener vendedor
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('id', lead.assigned_to)
        .single();

      if (!vendedor?.phone) {
        return corsResponse(JSON.stringify({
          error: 'Vendedor sin teléfono',
          leadName: lead.name,
          vendedorName: vendedor?.name || 'desconocido',
          vendedorId: lead.assigned_to
        }), 400);
      }

      const approvalService = new FollowupApprovalService(supabase);
      const result = await approvalService.proponerFollowup(
        leadId,
        lead.assigned_to,
        categoria,
        razon,
        lead.property_interest || 'Santa Rita'
      );

      return corsResponse(JSON.stringify({
        ok: result.success,
        approvalId: result.approvalId,
        leadName: lead.name,
        vendedorName: lead.team_members?.name,
        categoria,
        message: result.success
          ? `Propuesta creada. El vendedor recibirá un mensaje en el próximo ciclo del CRON.`
          : 'Error creando propuesta'
      }));
    }

    // Enviar propuestas pendientes a vendedores (manual)
    if (url.pathname === '/test-enviar-propuestas') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const approvalService = new FollowupApprovalService(supabase);
      const enviadas = await approvalService.enviarPropuestasPendientes(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error enviando propuesta:', e);
          return false;
        }
      });
      return corsResponse(JSON.stringify({ ok: true, propuestasEnviadas: enviadas }));
    }

    // Pedir status a vendedores sobre leads estancados (manual)
    if (url.pathname === '/test-pedir-status') {
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const approvalService = new FollowupApprovalService(supabase);
      const enviados = await approvalService.pedirStatusLeadsEstancados(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error pidiendo status:', e);
          return false;
        }
      });
      return corsResponse(JSON.stringify({ ok: true, solicitudesEnviadas: enviados }));
    }

    // Ver aprobaciones pendientes
    if (url.pathname === '/api/followup-approvals') {
      const vendedorPhone = url.searchParams.get('vendedor_phone');
      const vendedorId = url.searchParams.get('vendedor_id');
      const leadId = url.searchParams.get('lead_id');
      const status = url.searchParams.get('status'); // null = todos
      const desde = url.searchParams.get('desde'); // fecha ISO
      const hasta = url.searchParams.get('hasta'); // fecha ISO

      let query = supabase.client
        .from('followup_approvals')
        .select('*, team_members:vendedor_id(name, phone)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (status) {
        query = query.eq('status', status);
      }
      if (vendedorId) {
        query = query.eq('vendedor_id', vendedorId);
      }
      if (leadId) {
        query = query.eq('lead_id', leadId);
      }
      if (vendedorPhone) {
        const cleanPhone = vendedorPhone.replace(/\D/g, '');
        query = query.like('vendedor_phone', `%${cleanPhone.slice(-10)}`);
      }
      if (desde) {
        query = query.gte('created_at', desde);
      }
      if (hasta) {
        query = query.lte('created_at', hasta);
      }

      const { data, error } = await query;
      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
      return corsResponse(JSON.stringify({ ok: true, approvals: data, count: data?.length || 0 }));
    }

    // Estadísticas de follow-ups (para dashboard CRM)
    if (url.pathname === '/api/followup-stats') {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const hace30Dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Stats de hoy
      const { data: hoyData } = await supabase.client
        .from('followup_approvals')
        .select('status')
        .gte('created_at', inicioHoy);

      // Stats últimos 7 días
      const { data: semanaData } = await supabase.client
        .from('followup_approvals')
        .select('status')
        .gte('created_at', hace7Dias);

      // Stats últimos 30 días
      const { data: mesData } = await supabase.client
        .from('followup_approvals')
        .select('status, vendedor_id')
        .gte('created_at', hace30Dias);

      // Pendientes actuales
      const { data: pendientesData } = await supabase.client
        .from('followup_approvals')
        .select('vendedor_id, lead_name, created_at')
        .eq('status', 'pending');

      const calcStats = (data: any[]) => ({
        total: data?.length || 0,
        enviados: data?.filter(d => d.status === 'sent').length || 0,
        aprobados: data?.filter(d => d.status === 'approved').length || 0,
        editados: data?.filter(d => d.status === 'edited').length || 0,
        rechazados: data?.filter(d => d.status === 'rejected').length || 0,
        pendientes: data?.filter(d => d.status === 'pending').length || 0,
        expirados: data?.filter(d => d.status === 'expired').length || 0
      });

      // Ranking por vendedor (últimos 30 días)
      const porVendedor: Record<string, {enviados: number, rechazados: number}> = {};
      mesData?.forEach(d => {
        if (!porVendedor[d.vendedor_id]) {
          porVendedor[d.vendedor_id] = { enviados: 0, rechazados: 0 };
        }
        if (d.status === 'sent') porVendedor[d.vendedor_id].enviados++;
        if (d.status === 'rejected') porVendedor[d.vendedor_id].rechazados++;
      });

      return corsResponse(JSON.stringify({
        ok: true,
        hoy: calcStats(hoyData || []),
        semana: calcStats(semanaData || []),
        mes: calcStats(mesData || []),
        pendientes_actuales: pendientesData?.length || 0,
        pendientes_detalle: pendientesData?.slice(0, 10) || [],
        por_vendedor: porVendedor
      }));
    }

    // Test crear lead inactivo para pruebas
    if (url.pathname === '/test-crear-lead-inactivo') {
      const hace5dias = new Date();
      hace5dias.setDate(hace5dias.getDate() - 5);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const testPhone = url.searchParams.get('phone') || '5212224558475';

      // Borrar leads de prueba existentes con este teléfono
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Lead Inactivo Prueba',
          phone: testPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Distrito Falco',
          created_at: hace5dias.toISOString(),
          updated_at: hace5dias.toISOString()
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Lead inactivo creado',
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          status: newLead.status,
          updated_at: newLead.updated_at,
          assigned_to: vendedor?.name || 'Sin asignar'
        }
      }));
    }

    // Test follow-up de leads inactivos
    if (url.pathname === '/test-followup-inactivos') {
      console.log('🧪 TEST: Ejecutando follow-up de leads inactivos...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Debug info
      const ahora = new Date();
      const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
      const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

      const { data: leadsInactivos } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, updated_at, archived')
        .in('status', ['new', 'contacted', 'appointment_scheduled'])
        .lt('updated_at', hace3dias.toISOString())
        .gt('updated_at', hace30dias.toISOString())
        .not('phone', 'is', null)
        .or('archived.is.null,archived.eq.false')
        .limit(10);

      await followUpLeadsInactivos(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Follow-up de leads inactivos ejecutado',
        debug: {
          rango: `${hace3dias.toISOString().split('T')[0]} a ${hace30dias.toISOString().split('T')[0]}`,
          leads_inactivos_encontrados: leadsInactivos?.length || 0,
          muestra: leadsInactivos?.map(l => ({
            name: l.name,
            phone: l.phone,
            status: l.status,
            updated_at: l.updated_at
          })) || []
        }
      }));
    }

    // Test crear lead con apartado para probar recordatorios
    if (url.pathname === '/test-crear-apartado') {
      const testPhone = url.searchParams.get('phone') || '5212224558475';
      const diasParaPago = parseInt(url.searchParams.get('dias') || '5'); // 5, 1, o 0 para hoy

      // Borrar leads de prueba existentes con este teléfono
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

      // Calcular fecha de pago
      const ahora = new Date();
      const fechaPago = new Date(ahora.getTime() + diasParaPago * 24 * 60 * 60 * 1000);
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const fechaPagoStr = mexicoFormatter.format(fechaPago);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Cliente Apartado Prueba',
          phone: testPhone,
          status: 'reserved',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Distrito Falco',
          notes: {
            apartado: {
              fecha_pago: fechaPagoStr,
              enganche: 50000,
              propiedad: 'Casa Modelo Encino - Lote 42',
              recordatorios_enviados: 0
            }
          }
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead con apartado creado (pago en ${diasParaPago} días)`,
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          status: newLead.status,
          fecha_pago: fechaPagoStr,
          assigned_to: vendedor?.name || 'Sin asignar'
        }
      }));
    }

    // Test recordatorios de pago de apartados
    if (url.pathname === '/test-recordatorios-apartado') {
      console.log('🧪 TEST: Ejecutando recordatorios de pago de apartados...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await recordatoriosPagoApartado(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Recordatorios de apartado ejecutados' }));
    }

    // Simular cron a una hora específica
    if (url.pathname === '/test-simular-cron') {
      const horaSimulada = parseInt(url.searchParams.get('hora') || '10');
      const minutoSimulado = parseInt(url.searchParams.get('minuto') || '0');
      const diaSimulado = parseInt(url.searchParams.get('dia') || '5'); // 1=Lun, 5=Vie

      const isFirstRunOfHour = minutoSimulado === 0;
      const isWeekday = diaSimulado >= 1 && diaSimulado <= 5;

      const resultados: string[] = [];
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      resultados.push(`🕐 Simulando cron a las ${horaSimulada}:${minutoSimulado.toString().padStart(2, '0')} (día ${diaSimulado})`);
      resultados.push(`   isFirstRunOfHour: ${isFirstRunOfHour}`);
      resultados.push(`   isWeekday: ${isWeekday}`);

      // 8am L-V: Briefing matutino
      if (horaSimulada === 8 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Briefing matutino (8am L-V)');
      }

      // 9am Diario: Cumpleaños
      if (horaSimulada === 9 && isFirstRunOfHour) {
        resultados.push('✅ SE EJECUTARÍA: Cumpleaños leads+equipo (9am diario)');
      }

      // 10am L-V: Alertas leads fríos
      if (horaSimulada === 10 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Alertas leads fríos (10am L-V)');
      }

      // 10am Diario: Recordatorios de apartado
      if (horaSimulada === 10 && isFirstRunOfHour) {
        resultados.push('✅ SE EJECUTARÍA: Recordatorios de apartado (10am diario)');
        resultados.push('   → Ejecutando recordatoriosPagoApartado()...');
        await recordatoriosPagoApartado(supabase, meta);
        resultados.push('   → ¡Completado!');
      }

      // 11am L-V: Follow-up inactivos
      if (horaSimulada === 11 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Follow-up leads inactivos (11am L-V)');
      }

      // 14 (2pm) L-V: Leads HOT urgentes
      if (horaSimulada === 14 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Alertas leads HOT (2pm L-V)');
      }

      // 19 (7pm) L-V: Recap del día
      if (horaSimulada === 19 && isFirstRunOfHour && isWeekday) {
        resultados.push('✅ SE EJECUTARÍA: Recap del día (7pm L-V)');
      }

      return corsResponse(JSON.stringify({
        simulacion: {
          hora: horaSimulada,
          minuto: minutoSimulado,
          dia_semana: diaSimulado,
          isFirstRunOfHour,
          isWeekday
        },
        resultados
      }, null, 2));
    }

    // Debug: Ver estado actual del cron y qué se ejecutaría
    if (url.pathname === '/debug-cron-status') {
      const now = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const mexicoParts = mexicoFormatter.formatToParts(now);
      const mexicoHour = parseInt(mexicoParts.find(p => p.type === 'hour')?.value || '0');
      const mexicoMinute = parseInt(mexicoParts.find(p => p.type === 'minute')?.value || '0');
      const mexicoWeekday = mexicoParts.find(p => p.type === 'weekday')?.value || '';
      const mexicoDate = `${mexicoParts.find(p => p.type === 'year')?.value}-${mexicoParts.find(p => p.type === 'month')?.value}-${mexicoParts.find(p => p.type === 'day')?.value}`;

      const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const dayOfWeek = dayMap[mexicoWeekday] ?? 0;
      const isFirstRunOfHour = mexicoMinute === 0;
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      // Calcular fechas para recordatorios de apartado
      const mexicoDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hoyStr = mexicoDateFormatter.format(now);
      const en1dia = mexicoDateFormatter.format(new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000));
      const en5dias = mexicoDateFormatter.format(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));

      // Tareas programadas y si se ejecutarían ahora
      const tareas = [
        { nombre: 'Briefing matutino', hora: 8, dias: 'L-V', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && isWeekday },
        { nombre: 'Briefing supervisión', hora: 8, dias: 'L-V', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && isWeekday },
        { nombre: 'Reporte diario CEO', hora: 8, dias: 'L-V', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && isWeekday },
        { nombre: 'Reporte semanal CEO', hora: 8, dias: 'Lunes', ejecutaria: mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 1 },
        { nombre: 'Reactivar equipo (24h)', hora: 9, dias: 'L-V', ejecutaria: mexicoHour === 9 && isFirstRunOfHour && isWeekday },
        { nombre: 'Cumpleaños leads+equipo', hora: 9, dias: 'Diario', ejecutaria: mexicoHour === 9 && isFirstRunOfHour },
        { nombre: 'Alertas leads fríos', hora: 10, dias: 'L-V', ejecutaria: mexicoHour === 10 && isFirstRunOfHour && isWeekday },
        { nombre: 'Recordatorios apartado', hora: 10, dias: 'Diario', ejecutaria: mexicoHour === 10 && isFirstRunOfHour },
        { nombre: 'Follow-up inactivos', hora: 11, dias: 'L-V', ejecutaria: mexicoHour === 11 && isFirstRunOfHour && isWeekday },
        { nombre: 'Leads HOT urgentes', hora: 14, dias: 'L-V', ejecutaria: mexicoHour === 14 && isFirstRunOfHour && isWeekday },
        { nombre: 'Recap del día', hora: 19, dias: 'L-V', ejecutaria: mexicoHour === 19 && isFirstRunOfHour && isWeekday },
        { nombre: 'Recordatorios citas', hora: 'cada 2min', dias: 'Siempre', ejecutaria: true },
        { nombre: 'Encuestas post-cita', hora: 'cada 2min', dias: 'Siempre', ejecutaria: true },
      ];

      return corsResponse(JSON.stringify({
        tiempo_actual: {
          utc: now.toISOString(),
          mexico: `${mexicoDate} ${mexicoHour}:${mexicoMinute.toString().padStart(2, '0')} (${mexicoWeekday})`,
          dia_semana: dayOfWeek,
          es_dia_laboral: isWeekday,
          es_inicio_hora: isFirstRunOfHour
        },
        fechas_recordatorios: {
          hoy: hoyStr,
          en_1_dia: en1dia,
          en_5_dias: en5dias
        },
        tareas_programadas: tareas,
        cron_triggers: ['*/2 * * * * (cada 2 min)', '0 14 * * 1-5 (2pm L-V)', '0 1 * * 1-5 (1am L-V)']
      }, null, 2));
    }

    // Setup: Crear lead de prueba con apartado para probar recordatorios
    if (url.pathname === '/test-setup-apartado') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const diasParaPago = parseInt(url.searchParams.get('dias') || '5'); // 5, 1, 0, -1 para probar diferentes recordatorios

      // Usar timezone de México para calcular la fecha de pago
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const fechaPagoStr = mexicoFormatter.format(new Date(ahora.getTime() + diasParaPago * 24 * 60 * 60 * 1000));

      // Buscar o crear lead
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      let { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .or(`phone.eq.${phone},phone.like.%${cleanPhone}`)
        .single();

      if (!lead) {
        const { data: newLead } = await supabase.client
          .from('leads')
          .insert({ phone, name: 'Test Apartado', status: 'reserved' })
          .select()
          .single();
        lead = newLead;
      }

      if (lead) {
        const notesActuales = typeof lead.notes === 'object' ? lead.notes : {};
        await supabase.client
          .from('leads')
          .update({
            status: 'reserved',
            notes: {
              ...notesActuales,
              apartado: {
                propiedad: 'Casa Modelo Eucalipto - Monte Verde',
                enganche: 150000,
                fecha_pago: fechaPagoStr,
                recordatorios_enviados: 0
              }
            }
          })
          .eq('id', lead.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Lead ${lead.name} configurado con apartado`,
          fecha_pago: fechaPagoStr,
          dias_para_pago: diasParaPago,
          tipo_recordatorio: diasParaPago === 5 ? '5dias' : diasParaPago === 1 ? '1dia' : diasParaPago === 0 ? 'hoy' : 'vencido'
        }));
      }

      return corsResponse(JSON.stringify({ error: 'No se pudo crear el lead' }));
    }

    // Test post-visita: simula que SARA preguntó si llegó el cliente
    if (url.pathname === '/test-post-visita-setup') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';
      const leadName = url.searchParams.get('lead_name') || 'María García Test';
      const leadPhone = url.searchParams.get('lead_phone') || '5215510001234';
      const property = url.searchParams.get('property') || 'Distrito Falco';

      // Simular que hay una confirmación pendiente
      const notesTest = JSON.stringify({
        pending_show_confirmation: {
          appointment_id: 'test-apt-' + Date.now(),
          lead_id: 'test-lead-' + Date.now(),
          lead_name: leadName,
          lead_phone: leadPhone,
          property: property,
          hora: '3:00 pm',
          asked_at: new Date().toISOString()
        }
      });

      await supabase.client
        .from('team_members')
        .update({ notes: notesTest })
        .eq('id', vendedorId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Setup completado. Ahora el vendedor puede responder "sí llegó" o "1" para probar el flujo post-visita.`,
        vendedor_id: vendedorId,
        lead_name: leadName,
        instructions: 'Envía "1" o "sí llegó" desde el WhatsApp del vendedor para activar el flujo post-visita'
      }));
    }

    // Debug: Ver notas actuales del vendedor
    if (url.pathname === '/debug-vendor-notes') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      const { data: vendedorData, error } = await supabase.client
        .from('team_members')
        .select('id, name, notes')
        .eq('id', vendedorId)
        .single();

      return corsResponse(JSON.stringify({
        vendedor_id: vendedorId,
        vendedor_name: vendedorData?.name,
        notes: vendedorData?.notes,
        notes_type: typeof vendedorData?.notes,
        has_post_visit_context: !!vendedorData?.notes?.post_visit_context,
        post_visit_context: vendedorData?.notes?.post_visit_context || null,
        error: error?.message
      }, null, 2));
    }

    // Test: Establecer teléfono de un asesor para pruebas
    if (url.pathname === '/test-set-asesor-phone') {
      const phone = url.searchParams.get('phone') || '5215610016226';
      const asesorId = url.searchParams.get('id') || '48e64bac-0750-4822-882e-94f475ccfe5b'; // Alejandro Palmas

      await supabase.client
        .from('team_members')
        .update({ phone: phone })
        .eq('id', asesorId);

      return corsResponse(JSON.stringify({
        success: true,
        message: `Asesor ${asesorId} actualizado con phone ${phone}`
      }));
    }

    // Test: Quitar teléfono de un team_member para pruebas
    if (url.pathname === '/test-clear-team-phone') {
      const teamId = url.searchParams.get('id');
      if (!teamId) {
        return corsResponse(JSON.stringify({ error: 'Falta id' }));
      }
      await supabase.client
        .from('team_members')
        .update({ phone: '', active: false })
        .eq('id', teamId);
      return corsResponse(JSON.stringify({ success: true, message: 'Phone cleared' }));
    }

    // Test: Limpiar contexto de crédito de un lead
    if (url.pathname === '/test-clear-credit-context') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);

      // Buscar lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }));
      }

      // Limpiar contexto de crédito
      let notas: any = {};
      if (lead.notes) {
        if (typeof lead.notes === 'string') {
          try { notas = JSON.parse(lead.notes); } catch (e) { notas = {}; }
        } else {
          notas = lead.notes;
        }
      }
      delete notas.credit_flow_context;

      await supabase.client
        .from('leads')
        .update({ notes: notas, status: 'new' })
        .eq('id', lead.id);

      return corsResponse(JSON.stringify({
        success: true,
        lead_id: lead.id,
        lead_name: lead.name,
        message: 'Contexto de crédito limpiado'
      }, null, 2));
    }

    // Test: Probar flujo de crédito directamente
    if (url.pathname === '/test-credit-flow') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const mensaje = url.searchParams.get('msg') || 'quiero crédito';
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);

      // Buscar lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }));
      }

      const { CreditFlowService } = await import('./services/creditFlowService');
      const creditService = new CreditFlowService(supabase, env.OPENAI_API_KEY);

      // Verificar estado actual
      const enFlujo = await creditService.estaEnFlujoCredito(lead.id);
      const detectaIntencion = creditService.detectarIntencionCredito(mensaje);

      const resultado: any = {
        lead_id: lead.id,
        lead_name: lead.name,
        mensaje,
        en_flujo_actual: enFlujo,
        detecta_intencion: detectaIntencion,
        accion: null,
        respuesta: null
      };

      // Si está en flujo, procesar respuesta
      if (enFlujo) {
        const resp = await creditService.procesarRespuesta(lead.id, mensaje);
        resultado.accion = 'procesar_respuesta';
        resultado.respuesta = resp;
      } else if (detectaIntencion) {
        // Iniciar flujo
        const { mensaje: msg } = await creditService.iniciarFlujoCredito(lead);
        resultado.accion = 'iniciar_flujo';
        resultado.respuesta = msg;
      }

      return corsResponse(JSON.stringify(resultado, null, 2));
    }

    // Test: Limpiar notas de vendedor (preservando citas_preguntadas)
    if (url.pathname === '/test-clear-vendor-notes') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      // Obtener notas actuales para preservar citas_preguntadas
      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      let citasPreguntadas: string[] = [];
      try {
        if (vendedorData?.notes) {
          const notasActuales = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
          citasPreguntadas = notasActuales?.citas_preguntadas || [];
        }
      } catch (e) {
        console.log('Error parseando notas:', e);
      }

      // Preservar solo citas_preguntadas, limpiar todo lo demás
      const notasLimpias = citasPreguntadas.length > 0
        ? JSON.stringify({ citas_preguntadas: citasPreguntadas })
        : null;

      await supabase.client
        .from('team_members')
        .update({ notes: notasLimpias })
        .eq('id', vendedorId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Notas de vendedor limpiadas (preservando ${citasPreguntadas.length} citas en historial)`,
        vendedor_id: vendedorId,
        citas_preguntadas_preservadas: citasPreguntadas.length
      }));
    }

    // Test: Agregar cita a citas_preguntadas (para evitar que se vuelva a preguntar)
    if (url.pathname === '/test-add-cita-preguntada') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';
      const citaId = url.searchParams.get('cita_id');

      if (!citaId) {
        return corsResponse(JSON.stringify({ error: 'Falta cita_id' }), 400);
      }

      // Obtener notas actuales
      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes, name')
        .eq('id', vendedorId)
        .single();

      let notasActuales: any = {};
      try {
        if (vendedorData?.notes) {
          notasActuales = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
        }
      } catch (e) {
        notasActuales = {};
      }

      // Agregar cita a la lista
      if (!notasActuales.citas_preguntadas) {
        notasActuales.citas_preguntadas = [];
      }
      if (!notasActuales.citas_preguntadas.includes(citaId)) {
        notasActuales.citas_preguntadas.push(citaId);
      }

      // Limpiar pending_show_confirmation si existe
      delete notasActuales.pending_show_confirmation;

      await supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notasActuales) })
        .eq('id', vendedorId);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cita ${citaId} agregada a historial de ${vendedorData?.name}`,
        citas_preguntadas: notasActuales.citas_preguntadas
      }));
    }

    // Test: Ver notas de vendedor (debug)
    if (url.pathname === '/test-vendor-notes') {
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      const { data: vendedorData } = await supabase.client
        .from('team_members')
        .select('notes, name, phone')
        .eq('id', vendedorId)
        .single();

      let notasParsed: any = null;
      try {
        if (vendedorData?.notes) {
          notasParsed = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
        }
      } catch (e) {
        notasParsed = { error: 'No se pudo parsear', raw: vendedorData?.notes };
      }

      return corsResponse(JSON.stringify({
        vendedor: vendedorData?.name,
        phone: vendedorData?.phone,
        notes_raw: vendedorData?.notes,
        notes_parsed: notasParsed
      }));
    }

    // Test: Enviar encuesta post-visita a un teléfono específico
    if (url.pathname === '/test-send-client-survey') {
      const phone = url.searchParams.get('phone') || '522224558475';
      const leadName = url.searchParams.get('lead_name') || 'Cliente Test';
      const property = url.searchParams.get('property') || 'Distrito Falco';
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Obtener vendedor
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('name')
        .eq('id', vendedorId)
        .single();

      // Buscar o crear lead
      let lead;
      const { data: existingLead } = await supabase.client
        .from('leads')
        .select('id, name, notes')
        .like('phone', `%${phone.slice(-10)}`)
        .single();

      if (existingLead) {
        lead = existingLead;
      } else {
        const { data: newLead } = await supabase.client
          .from('leads')
          .insert({
            name: leadName,
            phone: phone,
            status: 'visited',
            assigned_to: vendedorId
          })
          .select()
          .single();
        lead = newLead;
      }

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'No se pudo crear/encontrar lead' }), 500);
      }

      const nombreCorto = lead.name?.split(' ')[0] || leadName.split(' ')[0];

      // Guardar pending_client_survey en el lead
      const notasExistentes = typeof lead.notes === 'object' ? lead.notes : {};
      await supabase.client
        .from('leads')
        .update({
          notes: {
            ...notasExistentes,
            pending_client_survey: {
              sent_at: new Date().toISOString(),
              property: property,
              vendedor_id: vendedorId,
              vendedor_name: vendedor?.name || 'Tu asesor'
            }
          }
        })
        .eq('id', lead.id);

      // Enviar encuesta
      const mensajeEncuesta = `¡Hola ${nombreCorto}! 👋

Gracias por visitarnos hoy en *${property}*. 🏠

¿Qué te pareció? Responde con el número:

1️⃣ Me encantó, quiero avanzar
2️⃣ Me gustó pero quiero ver más opciones
3️⃣ Tengo dudas que me gustaría resolver

Estoy aquí para ayudarte. 😊`;

      await meta.sendWhatsAppMessage(phone, mensajeEncuesta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Encuesta enviada a ${phone}`,
        lead_id: lead.id,
        lead_name: lead.name || leadName,
        instructions: 'El cliente puede responder 1, 2, 3 o texto libre'
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Simular flujo completo de confirmación de cita
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // TEST: Iniciar flujo post-visita completo
    // Envía pregunta al vendedor: "¿Llegó el lead?"
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-post-visita' || url.pathname === '/test-full-confirmation-flow') {
      const leadId = url.searchParams.get('lead_id') || '5c2d12bf-d1d1-4e09-ab9e-d93f5f38f701';
      const vendedorId = url.searchParams.get('vendedor_id') || '1de138a5-288f-46ee-a42d-733cf36e1bd6';
      const vendedorPhoneOverride = url.searchParams.get('vendedor_phone');

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const { PostVisitService } = await import('./services/postVisitService');
      const postVisitService = new PostVisitService(supabase);

      // 1. Obtener lead
      const { data: lead, error: leadError } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', details: leadError }), 400);
      }

      // 2. Obtener vendedor
      const { data: vendedor, error: vendedorError } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('id', vendedorId)
        .single();

      if (vendedorError || !vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado', details: vendedorError }), 400);
      }

      // Override phone si se proporciona
      const vendedorConPhone = {
        ...vendedor,
        phone: vendedorPhoneOverride || vendedor.phone
      };

      if (!vendedorConPhone.phone) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no tiene teléfono. Usa ?vendedor_phone=521...' }), 400);
      }

      // 3. Buscar o crear cita
      let { data: cita } = await supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', leadId)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: false })
        .limit(1)
        .single();

      if (!cita) {
        // Crear cita de prueba
        const { data: nuevaCita, error: citaError } = await supabase.client
          .from('appointments')
          .insert({
            lead_id: leadId,
            vendedor_id: vendedorId,
            lead_phone: lead.phone,
            lead_name: lead.name,
            scheduled_date: new Date().toISOString(),
            status: 'scheduled',
            property_name: lead.property_interest || 'Desarrollo Test',
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (citaError || !nuevaCita) {
          return corsResponse(JSON.stringify({
            error: 'No se pudo crear cita de prueba',
            details: citaError?.message || 'Insert returned null'
          }), 400);
        }
        cita = nuevaCita;
      }

      // 4. Iniciar flujo post-visita
      const { mensaje, context } = await postVisitService.iniciarFlujoPostVisita(
        cita,
        lead,
        vendedorConPhone
      );

      // 5. Enviar mensaje al vendedor
      await meta.sendWhatsAppMessage(vendedorConPhone.phone, mensaje);

      return corsResponse(JSON.stringify({
        ok: true,
        flujo: 'post-visita iniciado',
        instrucciones: [
          `1. El vendedor (${vendedorConPhone.phone}) recibió: "¿Llegó ${lead.name}?"`,
          `2. El vendedor responde "1" (sí llegó) o "2" (no llegó)`,
          `3. Si llegó: Se pregunta "¿Qué te pareció?" → luego encuesta al lead`,
          `4. Si no llegó: Se pregunta "¿Ya contactaste para reagendar?"`,
          `5. Todo el flujo es conversacional via WhatsApp`
        ],
        datos: {
          lead: { id: lead.id, name: lead.name, phone: lead.phone },
          vendedor: { id: vendedor.id, name: vendedor.name, phone: vendedorConPhone.phone },
          cita: { id: cita?.id, property: cita?.property },
          context_guardado: context
        },
        mensaje_enviado: mensaje
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Reasignar lead a otro vendedor
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-reassign-lead') {
      const leadId = url.searchParams.get('lead_id');
      const vendedorId = url.searchParams.get('vendedor_id');

      if (!leadId || !vendedorId) {
        return corsResponse(JSON.stringify({ error: 'Faltan lead_id o vendedor_id' }), 400);
      }

      const { error } = await supabase.client
        .from('leads')
        .update({ assigned_to: vendedorId })
        .eq('id', leadId);

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead ${leadId} reasignado a vendedor ${vendedorId}`
      }));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: ENCUESTAS
    // ═══════════════════════════════════════════════════════════

    // Test encuesta post-cita manual a un teléfono específico
    if (url.pathname.startsWith('/test-encuesta-postcita/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando encuesta post-cita a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar una cita completada reciente para este teléfono
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .eq('phone', phoneFormatted)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const nombreCorto = lead.name?.split(' ')[0] || 'Cliente';

      // Crear encuesta en BD
      await supabase.client.from('surveys').insert({
        lead_id: lead.id,
        lead_phone: phoneFormatted,
        lead_name: lead.name,
        survey_type: 'post_cita',
        status: 'sent',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      // Enviar encuesta
      const msgEncuesta = `📋 *¡Hola ${nombreCorto}!*

¿Cómo fue tu experiencia en tu visita reciente?

Por favor califica del *1 al 4*:
1️⃣ Excelente
2️⃣ Buena
3️⃣ Regular
4️⃣ Mala

_Solo responde con el número_ 🙏`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgEncuesta);
      return corsResponse(JSON.stringify({ ok: true, message: `Encuesta post-cita enviada a ${phoneFormatted}` }));
    }

    // Test encuesta NPS manual a un teléfono específico
    if (url.pathname.startsWith('/test-encuesta-nps/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando encuesta NPS a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .eq('phone', phoneFormatted)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const nombreCorto = lead.name?.split(' ')[0] || 'Cliente';

      // Crear encuesta NPS en BD
      await supabase.client.from('surveys').insert({
        lead_id: lead.id,
        lead_phone: phoneFormatted,
        lead_name: lead.name,
        survey_type: 'nps',
        status: 'sent',
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      });

      const msgNPS = `🌟 *¡Felicidades por tu nuevo hogar, ${nombreCorto}!*

Tu opinión es muy importante para nosotros.

Del *0 al 10*, ¿qué tan probable es que nos recomiendes con un amigo o familiar?

0️⃣ = Nada probable
🔟 = Muy probable

_Solo responde con el número_ 🙏`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgNPS);
      return corsResponse(JSON.stringify({ ok: true, message: `Encuesta NPS enviada a ${phoneFormatted}` }));
    }

    // Ver todas las encuestas
    if (url.pathname === '/surveys') {
      const { data } = await supabase.client
        .from('surveys')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return corsResponse(JSON.stringify(data || []));
    }

    // Setup: Marcar cita como completada para probar encuesta post-cita
    // La encuesta busca citas actualizadas hace 2-3 horas, así que primero actualizo y luego esperas o usamos test directo
    if (url.pathname === '/test-setup-encuesta-postcita') {
      const phone = url.searchParams.get('phone') || '5212224558475';

      // Buscar lead
      const cleanPhone = phone.replace(/\D/g, '');
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, assigned_to')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Buscar cita scheduled de este lead
      const { data: citaExistente } = await supabase.client
        .from('appointments')
        .select('id, status, vendedor_id, vendedor_name')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: false })
        .limit(1)
        .single();

      if (!citaExistente) {
        return corsResponse(JSON.stringify({
          error: 'No hay cita scheduled para este lead',
          sugerencia: 'Primero crea una cita con /test-setup-cita'
        }), 404);
      }

      // Marcar como completada - el updated_at se actualiza automáticamente
      const { error: updateError } = await supabase.client
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', citaExistente.id);

      if (updateError) {
        return corsResponse(JSON.stringify({
          error: 'Error actualizando cita',
          details: updateError.message
        }), 500);
      }

      // Eliminar encuestas previas de esta cita para permitir re-test
      await supabase.client
        .from('surveys')
        .delete()
        .eq('appointment_id', citaExistente.id);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Cita marcada como completada. Para probar encuesta usa /test-encuesta-postcita/{phone} o espera 2h',
        lead: lead.name,
        cita_id: citaExistente.id,
        nota: 'La encuesta automática se envía 2-3h después. Para test inmediato usa /test-encuesta-postcita/' + cleanPhone
      }));
    }

    // Forzar procesamiento de encuestas post-cita
    if (url.pathname === '/test-encuestas-postcita') {
      console.log('🧪 TEST: Forzando verificación de encuestas post-cita...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarEncuestasPostCita(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Encuestas post-cita procesadas' }));
    }

    // Forzar procesamiento de encuestas NPS
    if (url.pathname === '/test-encuestas-nps') {
      console.log('🧪 TEST: Forzando verificación de encuestas NPS...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarEncuestasNPS(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Encuestas NPS procesadas' }));
    }

    // ═══════════════════════════════════════════════════════════
    // ENVIAR ENCUESTAS DESDE CRM (con plantillas personalizadas)
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/send-surveys' && request.method === 'POST') {
      try {
        const body = await request.json() as {
          template: {
            id: string
            name: string
            type: string
            greeting: string
            questions: { text: string; type: string }[]
            closing: string
          }
          leads: { id: string; phone: string; name: string }[]
          message?: string
          targetType?: 'leads' | 'vendedores' | 'manual'
        };

        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
        const { template, leads, message, targetType } = body;
        const isVendedores = targetType === 'vendedores';

        console.log(`📋 Enviando encuesta "${template.name}" a ${leads.length} ${isVendedores ? 'vendedores' : 'leads'}...`);

        let enviados = 0;
        let errores = 0;

        for (const lead of leads) {
          try {
            if (!lead.phone) {
              console.log(`⚠️ ${lead.name} sin teléfono, saltando...`);
              continue;
            }

            // Personalizar mensaje con nombre
            const nombreCliente = lead.name?.split(' ')[0] || 'Cliente';
            const saludo = template.greeting.replace('{nombre}', nombreCliente);

            // NUEVO: Enviar solo la PRIMERA pregunta (flujo secuencial)
            const primeraQ = template.questions[0];
            let mensajeEncuesta = `${saludo}\n\n`;

            if (primeraQ) {
              if (primeraQ.type === 'rating') {
                mensajeEncuesta += `${primeraQ.text}\n_Responde del 1 al 5_`;
              } else if (primeraQ.type === 'yesno') {
                mensajeEncuesta += `${primeraQ.text}\n_Responde SI o NO_`;
              } else {
                mensajeEncuesta += `${primeraQ.text}`;
              }
            }

            // Agregar mensaje adicional si existe
            if (message) {
              mensajeEncuesta = `${message}\n\n${mensajeEncuesta}`;
            }

            // Enviar por WhatsApp
            console.log(`📤 Enviando encuesta a ${lead.name} (${lead.phone})...`);
            await meta.sendWhatsAppMessage(lead.phone, mensajeEncuesta);

            // Registrar en base de datos
            const validSurveyTypes = ['nps', 'post_cita'];
            const surveyType = validSurveyTypes.includes(template.type) ? template.type : 'nps';

            // Preparar datos - NO usar lead_id para evitar foreign key errors
            // Solo usamos lead_phone para matching de respuestas
            const surveyData: any = {
              lead_phone: lead.phone,
              lead_name: lead.name,
              survey_type: surveyType,
              status: 'sent',
              sent_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };

            if (isVendedores) {
              // Para vendedores: usar vendedor_id y vendedor_name
              surveyData.vendedor_id = lead.id;
              surveyData.vendedor_name = lead.name;
            }
            // NO agregamos lead_id - evita foreign key constraint errors
            // El matching de respuestas usa lead_phone, no necesitamos lead_id

            console.log(`💾 Guardando encuesta en DB para ${lead.phone} (tipo: ${surveyType}, isVendedor: ${isVendedores})...`);
            const { error: insertError } = await supabase.client.from('surveys').insert(surveyData);

            if (insertError) {
              console.log(`❌ Error guardando encuesta en DB:`, insertError);
            } else {
              console.log(`✅ Encuesta guardada en DB para ${lead.phone}`);
            }

            console.log(`✅ Encuesta enviada a ${lead.name}`);
            enviados++;

            // Rate limiting
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) {
            console.log(`❌ Error enviando a ${lead.name}:`, e);
            errores++;
          }
        }

        console.log(`📊 Encuestas: ${enviados} enviadas, ${errores} errores`);

        return corsResponse(JSON.stringify({
          ok: true,
          enviados,
          errores,
          message: `Encuesta "${template.name}" enviada a ${enviados} leads`
        }));
      } catch (e) {
        console.error('Error en /api/send-surveys:', e);
        return corsResponse(JSON.stringify({ ok: false, error: 'Error procesando encuestas' }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FORZAR ENVÍO DE VIDEOS PENDIENTES
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/force-send-videos') {
      console.log('🎬 Forzando envío de videos pendientes...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await verificarVideosPendientes(supabase, meta, env);
      return corsResponse(JSON.stringify({ ok: true, message: 'Videos pendientes procesados' }));
    }

    // ═══════════════════════════════════════════════════════════
    // API: OBTENER ENCUESTAS
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/api/surveys' || url.pathname === '/pending-surveys') {
      const status = url.searchParams.get('status'); // all, sent, answered, awaiting_feedback
      const limit = parseInt(url.searchParams.get('limit') || '50');

      let query = supabase.client
        .from('surveys')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data } = await query;

      // Calcular métricas
      const allSurveys = data || [];
      const answered = allSurveys.filter(s => s.status === 'answered');
      const npsScores = answered.filter(s => s.nps_score !== null).map(s => s.nps_score);

      const metrics = {
        total: allSurveys.length,
        sent: allSurveys.filter(s => s.status === 'sent').length,
        awaiting_feedback: allSurveys.filter(s => s.status === 'awaiting_feedback').length,
        answered: answered.length,
        avg_nps: npsScores.length > 0 ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1) : null,
        promoters: npsScores.filter(s => s >= 9).length,
        passives: npsScores.filter(s => s >= 7 && s < 9).length,
        detractors: npsScores.filter(s => s < 7).length
      };

      return corsResponse(JSON.stringify({ surveys: allSurveys, metrics }));
    }

    // ═══════════════════════════════════════════════════════════
    // VER VIDEOS PENDIENTES
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/pending-videos') {
      const { data } = await supabase.client
        .from('pending_videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      return corsResponse(JSON.stringify(data || []));
    }

    // ═══════════════════════════════════════════════════════════
    // REENVIAR VIDEO POR ID
    // ═══════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/resend-video/')) {
      const videoId = url.pathname.split('/').pop();
      console.log(`🔄 Reenviando video: ${videoId}`);

      const { data: video } = await supabase.client
        .from('pending_videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (!video) {
        return corsResponse(JSON.stringify({ error: 'Video no encontrado' }), 404);
      }

      if (!video.video_url || video.video_url.startsWith('ERROR')) {
        return corsResponse(JSON.stringify({ error: 'Video no tiene URL válido', video_url: video.video_url }), 400);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      try {
        // Descargar video
        console.log('📥 Descargando video...');
        const videoResponse = await fetch(video.video_url, {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        });

        if (!videoResponse.ok) {
          return corsResponse(JSON.stringify({ error: `Error descargando: ${videoResponse.status}` }), 500);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`✅ Descargado: ${videoBuffer.byteLength} bytes`);

        // Subir a Meta
        console.log('📤 Subiendo a Meta...');
        const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
        console.log(`✅ Media ID: ${mediaId}`);

        // Enviar por WhatsApp
        console.log(`📱 Enviando a ${video.lead_phone}...`);
        await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
          `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

        // Marcar como enviado
        await supabase.client
          .from('pending_videos')
          .update({ video_url: video.video_url + ' (ENVIADO)', completed_at: new Date().toISOString() })
          .eq('id', video.id);

        return corsResponse(JSON.stringify({ ok: true, message: `Video reenviado a ${video.lead_phone}` }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }


    // ═══════════════════════════════════════════════════════════
    // TEST: Generar video Veo 3 personalizado
    // ═══════════════════════════════════════════════════════════
    if (url.pathname === '/test-veo3') {
      console.log('TEST: Probando generacion de video Veo 3...');
      const testPhone = url.searchParams.get('phone') || '5212224558475';
      const testName = url.searchParams.get('name') || 'Jefe';
      const testDesarrollo = url.searchParams.get('desarrollo') || 'Los Encinos';
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
        // Convertir a base64 de forma eficiente (evita stack overflow en imágenes grandes)
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const imgBase64 = btoa(binary);
        console.log('Imagen descargada:', imgBuffer.byteLength, 'bytes');

        const prompt = `A friendly female real estate agent standing in front of the house facade shown in the image. The beautiful house exterior is clearly visible behind her. She smiles warmly and speaks congratulating in Spanish: "¡Felicidades ${testName}! Ya eres parte de la familia ${testDesarrollo}. Gracias por confiar en Grupo Santa Rita". Wide shot showing agent and house facade, golden hour lighting, 4k. No text, no subtitles, no captions, no overlays, clean video only.`;

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
    // Crear tabla sara_logs
    if (url.pathname === '/create-logs-table') {
      const sql = `CREATE TABLE IF NOT EXISTS sara_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tipo text NOT NULL, mensaje text NOT NULL, datos jsonb DEFAULT '{}', created_at timestamptz DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_sara_logs_created_at ON sara_logs(created_at DESC); CREATE INDEX IF NOT EXISTS idx_sara_logs_tipo ON sara_logs(tipo);`;
      return corsResponse(JSON.stringify({
        instruccion: 'Copia y pega este SQL en Supabase Dashboard > SQL Editor > New Query > Run',
        sql: sql,
        url_supabase: 'https://supabase.com/dashboard/project/_/sql/new'
      }));
    }

    // Ver logs de SARA
    if (url.pathname === '/logs') {
      const horas = parseInt(url.searchParams.get('horas') || '24');
      const tipo = url.searchParams.get('tipo');
      const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
      let query = supabase.client.from('sara_logs').select('*').gte('created_at', desde).order('created_at', { ascending: false }).limit(100);
      if (tipo) query = query.eq('tipo', tipo);
      const { data: logs, error } = await query;
      if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
      return corsResponse(JSON.stringify({ total: logs?.length || 0, desde, logs: logs || [] }));
    }

    // Enviar TEMPLATE a un teléfono (para fuera de ventana 24h)
    if (url.pathname === '/send-template') {
      const phone = url.searchParams.get('phone');
      const template = url.searchParams.get('template') || 'reactivar_equipo';
      const nombre = url.searchParams.get('nombre') || 'amigo';
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Falta phone' }), 400);
      }
      try {
        const response = await fetch(`https://graph.facebook.com/v18.0/${env.META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: template,
              language: { code: 'es_MX' },
              components: [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }]
            }
          })
        });
        const result = await response.json();
        return corsResponse(JSON.stringify({ ok: response.ok, status: response.status, phone, template, meta_response: result }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message, phone }), 500);
      }
    }

    // Enviar mensaje directo a un teléfono (con debug)
    if (url.pathname === '/send-message') {
      const phone = url.searchParams.get('phone');
      const msg = url.searchParams.get('msg');
      if (!phone || !msg) {
        return corsResponse(JSON.stringify({ error: 'Falta phone o msg' }), 400);
      }
      try {
        // Llamar directamente a Meta API para ver respuesta completa
        const response = await fetch(`https://graph.facebook.com/v18.0/${env.META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: msg }
          })
        });
        const result = await response.json();
        return corsResponse(JSON.stringify({ ok: response.ok, status: response.status, phone, meta_response: result }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message, phone }), 500);
      }
    }

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
    // TEST: Reporte diario mejorado a número específico
    if (url.pathname.startsWith('/test-reporte-diario/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando reporte diario mejorado a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const fechaFormato = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;

      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

      const semPasada = new Date(hoy);
      semPasada.setDate(semPasada.getDate() - 7);
      const inicioSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate()).toISOString();
      const finSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate() + 1).toISOString();

      const { data: leadsAyer } = await supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioAyer).lt('created_at', inicioHoy);
      const { data: leadsSemPasada } = await supabase.client.from('leads').select('id').gte('created_at', inicioSemPasada).lt('created_at', finSemPasada);
      const { data: cierresAyer } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy);
      const { data: cierresSemPasada } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemPasada).lt('status_changed_at', finSemPasada);
      const { data: citasAyer } = await supabase.client.from('appointments').select('*').eq('scheduled_date', ayer.toISOString().split('T')[0]);
      const { data: citasHoy } = await supabase.client.from('appointments').select('*, team_members(name), leads(name, phone)').eq('scheduled_date', hoy.toISOString().split('T')[0]).eq('status', 'scheduled');
      const { data: pipelineD } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);
      const { data: estancados } = await supabase.client.from('leads').select('id').eq('status', 'new').lt('created_at', inicioAyer);
      const { data: perdidosAyer } = await supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioAyer).lt('status_changed_at', inicioHoy);
      const { data: vendedoresD } = await supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true);

      // Proyección del mes
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes);
      const { data: leadsMes } = await supabase.client.from('leads').select('id').gte('created_at', inicioMes);

      let revenueAyer = 0, revenueSemPasada = 0, pipelineValueD = 0;
      cierresAyer?.forEach(c => revenueAyer += c.properties?.price || 2000000);
      cierresSemPasada?.forEach(c => revenueSemPasada += c.properties?.price || 2000000);
      pipelineD?.forEach(p => pipelineValueD += p.properties?.price || 2000000);

      const leadsAyerCount = leadsAyer?.length || 0;
      const leadsSemPasadaCount = leadsSemPasada?.length || 0;
      const cierresAyerCount = cierresAyer?.length || 0;
      const cierresSemPasadaCount = cierresSemPasada?.length || 0;

      const calcVarD = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

      const citasAyerCompletadas = citasAyer?.filter(c => c.status === 'completed').length || 0;
      const citasAyerTotal = citasAyer?.length || 0;
      const showRateAyer = citasAyerTotal > 0 ? Math.round((citasAyerCompletadas / citasAyerTotal) * 100) : 0;

      const negociacionD = pipelineD?.filter(p => p.status === 'negotiation').length || 0;
      const reservadosD = pipelineD?.filter(p => p.status === 'reserved').length || 0;

      // Cálculos proyección
      let revenueMes = 0;
      cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
      const cierresMesCount = cierresMes?.length || 0;
      const leadsMesCount = leadsMes?.length || 0;
      const diaActual = hoy.getDate();
      const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const diasRestantes = diasEnMes - diaActual;
      const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
      const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

      const rendAyer: string[] = [];
      vendedoresD?.forEach(v => {
        const leadsV = leadsAyer?.filter(l => l.assigned_to === v.id).length || 0;
        const cierresV = cierresAyer?.filter(c => c.assigned_to === v.id).length || 0;
        if (leadsV > 0 || cierresV > 0) rendAyer.push('• ' + (v.name?.split(' ')[0] || 'V') + ': ' + cierresV + 'c/' + leadsV + 'L');
      });

      const citasHoyList: string[] = [];
      citasHoy?.slice(0, 5).forEach(c => {
        const hora = c.scheduled_time || '00:00';
        const vendedor = c.team_members?.name?.split(' ')[0] || 'Sin asignar';
        const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
        citasHoyList.push('• ' + hora + ' - ' + cliente + ' (' + vendedor + ')');
      });

      const alertas: string[] = [];
      if (estancados && estancados.length > 0) alertas.push('• ' + estancados.length + ' leads sin contactar >24h');
      if (perdidosAyer && perdidosAyer.length > 0) alertas.push('• ' + perdidosAyer.length + ' leads perdidos ayer');

      const msg = `☀️ *BUENOS DÍAS CEO*
_${fechaFormato}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE AYER*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsAyerCount}* ${calcVarD(leadsAyerCount, leadsSemPasadaCount)}
• Cierres: *${cierresAyerCount}* ${calcVarD(cierresAyerCount, cierresSemPasadaCount)}
• Revenue: *$${(revenueAyer/1000000).toFixed(1)}M*
• Citas: ${citasAyerCompletadas}/${citasAyerTotal} (${showRateAyer}% show)

━━━━━━━━━━━━━━━━━━━━━
📅 *AGENDA DE HOY*
━━━━━━━━━━━━━━━━━━━━━
${citasHoy && citasHoy.length > 0 ? '*' + citasHoy.length + ' citas agendadas:*\n' + citasHoyList.join('\n') + (citasHoy.length > 5 ? '\n_...y ' + (citasHoy.length - 5) + ' más_' : '') : '• Sin citas agendadas'}

━━━━━━━━━━━━━━━━━━━━━
🔥 *PIPELINE HOT*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValueD/1000000).toFixed(1)}M*
• En negociación: ${negociacionD}
• Reservados: ${reservadosD}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*
• Leads mes: ${leadsMesCount}
• Días restantes: ${diasRestantes}
${alertas.length > 0 ? '\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ *ALERTAS*\n━━━━━━━━━━━━━━━━━━━━━\n' + alertas.join('\n') : ''}
${rendAyer.length > 0 ? '\n━━━━━━━━━━━━━━━━━━━━━\n👥 *EQUIPO AYER*\n━━━━━━━━━━━━━━━━━━━━━\n' + rendAyer.slice(0,5).join('\n') : ''}

_Escribe *resumen* para más detalles_`;

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte diario mejorado enviado a ${phoneFormatted}` }));
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

    // TEST: Reporte semanal a número específico
    if (url.pathname.startsWith('/test-reporte-semanal/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando reporte semanal mejorado a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const hoy = new Date();
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - 7);
      const inicioSemanaAnterior = new Date(inicioSemana);
      inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() - 7);

      // Queries
      const { data: leadsSemana } = await supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioSemana.toISOString());
      const { data: cierresSemana } = await supabase.client.from('leads').select('*, properties(price), team_members:assigned_to(name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString());
      const { data: citasSemana } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]);
      const { data: leadsSemanaAnt } = await supabase.client.from('leads').select('id').gte('created_at', inicioSemanaAnterior.toISOString()).lt('created_at', inicioSemana.toISOString());
      const { data: cierresSemanaAnt } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemanaAnterior.toISOString()).lt('status_changed_at', inicioSemana.toISOString());
      const { data: perdidosSemana } = await supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioSemana.toISOString());
      const { data: pipeline } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);
      const { data: vendedores } = await supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true);

      // Proyección del mes
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes);
      const { data: leadsMes } = await supabase.client.from('leads').select('id').gte('created_at', inicioMes);

      // Cálculos básicos
      let revenue = 0, revenueAnt = 0, pipelineValue = 0, revenueMes = 0;
      cierresSemana?.forEach(c => revenue += c.properties?.price || 2000000);
      cierresSemanaAnt?.forEach(c => revenueAnt += (c as any).properties?.price || 2000000);
      pipeline?.forEach(p => pipelineValue += p.properties?.price || 2000000);
      cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);

      const leadsActual = leadsSemana?.length || 0;
      const leadsAnterior = leadsSemanaAnt?.length || 0;
      const cierresActual = cierresSemana?.length || 0;
      const cierresAnterior = cierresSemanaAnt?.length || 0;
      const perdidosCount = perdidosSemana?.length || 0;

      // Citas stats
      const citasTotal = citasSemana?.length || 0;
      const citasCompletadas = citasSemana?.filter(c => c.status === 'completed').length || 0;
      const citasCanceladas = citasSemana?.filter(c => c.status === 'cancelled').length || 0;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;

      // Conversión y métricas
      const conversionRate = leadsActual > 0 ? Math.round(cierresActual / leadsActual * 100) : 0;

      // Tiempo de respuesta promedio
      let tiempoRespuesta = 0, leadsConResp = 0;
      leadsSemana?.forEach(l => {
        if (l.first_contact_at && l.created_at) {
          const diff = (new Date(l.first_contact_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60);
          if (diff > 0 && diff < 24 * 60) { tiempoRespuesta += diff; leadsConResp++; }
        }
      });
      const tiempoRespProm = leadsConResp > 0 ? Math.round(tiempoRespuesta / leadsConResp) : 0;

      // Proyección
      const diaActual = hoy.getDate();
      const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const cierresMesCount = cierresMes?.length || 0;
      const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
      const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

      const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

      // Top fuentes
      const fuenteCount: Record<string, number> = {};
      leadsSemana?.forEach(l => { const f = l.source || 'Otro'; fuenteCount[f] = (fuenteCount[f] || 0) + 1; });
      const topFuentes = Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Razones de pérdida
      const razonesCount: Record<string, number> = {};
      perdidosSemana?.forEach(l => { const r = l.lost_reason || 'Sin especificar'; razonesCount[r] = (razonesCount[r] || 0) + 1; });
      const topRazones = Object.entries(razonesCount).sort((a, b) => b[1] - a[1]).slice(0, 2);

      // Rendimiento vendedores
      const rendimiento: { nombre: string; cierres: number; citas: number; leads: number; revenue: number }[] = [];
      vendedores?.forEach(v => {
        const l = leadsSemana?.filter(x => x.assigned_to === v.id).length || 0;
        const c = cierresSemana?.filter(x => x.assigned_to === v.id).length || 0;
        let rev = 0;
        cierresSemana?.filter(x => x.assigned_to === v.id).forEach(x => rev += x.properties?.price || 2000000);
        const ci = citasSemana?.filter(x => x.team_member_id === v.id && x.status === 'completed').length || 0;
        if (l > 0 || c > 0) rendimiento.push({ nombre: v.name?.split(' ')[0] || 'V', cierres: c, citas: ci, leads: l, revenue: rev });
      });
      rendimiento.sort((a, b) => b.cierres - a.cierres || b.revenue - a.revenue);

      // Insights
      const insights: string[] = [];
      if (tiempoRespProm > 0 && tiempoRespProm <= 30) insights.push('✅ Tiempo respuesta excelente');
      else if (tiempoRespProm > 120) insights.push('⚠️ Mejorar tiempo de respuesta');
      if (leadsActual > leadsAnterior * 1.2) insights.push('📈 Semana fuerte en leads (+20%)');
      if (cierresActual > cierresAnterior) insights.push('🎯 Cierres arriba vs semana pasada');
      if (showRate >= 70) insights.push('✅ Buen show rate de citas');
      else if (showRate < 50 && citasTotal > 0) insights.push('⚠️ Show rate bajo, revisar confirmaciones');
      if (insights.length === 0) insights.push('📊 Semana estable');

      const msg = `📈 *REPORTE SEMANAL CEO*
_${inicioSemana.getDate()}/${inicioSemana.getMonth()+1} - ${hoy.getDate()}/${hoy.getMonth()+1} ${meses[hoy.getMonth()]}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE LA SEMANA*
━━━━━━━━━━━━━━━━━━━━━
• Leads: *${leadsActual}* ${calcVar(leadsActual, leadsAnterior)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresAnterior)}
• Revenue: *$${(revenue/1000000).toFixed(1)}M* ${calcVar(revenue, revenueAnt)}
• Perdidos: ${perdidosCount}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Completadas: ${citasCompletadas}/${citasTotal} (*${showRate}%* show)
• Canceladas: ${citasCanceladas}
• Conversión cita→cierre: *${citasCompletadas > 0 ? Math.round(cierresActual/citasCompletadas*100) : 0}%*

━━━━━━━━━━━━━━━━━━━━━
💰 *PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• En negociación: ${pipeline?.filter(p => p.status === 'negotiation').length || 0}
• Reservados: ${pipeline?.filter(p => p.status === 'reserved').length || 0}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*

━━━━━━━━━━━━━━━━━━━━━
⏱️ *VELOCIDAD*
━━━━━━━━━━━━━━━━━━━━━
• Tiempo respuesta: *${tiempoRespProm > 60 ? Math.round(tiempoRespProm/60) + 'h' : tiempoRespProm + 'min'}* ${tiempoRespProm > 0 && tiempoRespProm <= 30 ? '✅' : tiempoRespProm > 120 ? '⚠️' : ''}
• Conversión: *${conversionRate}%*

━━━━━━━━━━━━━━━━━━━━━
👥 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendimiento.slice(0,5).map((v, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${v.nombre}: ${v.cierres}c $${(v.revenue/1000000).toFixed(1)}M`).join('\n') || '• Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📣 *TOP FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${topFuentes.map(f => `• ${f[0]}: ${f[1]} leads`).join('\n') || '• Sin datos'}
${perdidosCount > 0 && topRazones.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n❌ *RAZONES PÉRDIDA*\n━━━━━━━━━━━━━━━━━━━━━\n${topRazones.map(r => `• ${r[0]}: ${r[1]}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insights.join('\n')}

_Escribe *resumen* para más detalles_`;

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte semanal mejorado enviado a ${phoneFormatted}` }));
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
    // TEST: Reporte mensual mejorado a número específico
    if (url.pathname.startsWith('/test-reporte-mensual/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando reporte mensual mejorado a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const hoy = new Date();
      const mesActual = hoy.getMonth();
      const anioActual = hoy.getFullYear();
      const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
      const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;
      const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
      const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);
      const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
      const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
      const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
      const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);
      const inicioMesYoY = new Date(anioReporte - 1, mesReporte, 1);
      const finMesYoY = new Date(anioReporte - 1, mesReporte + 1, 0, 23, 59, 59);
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const nombreMes = meses[mesReporte];

      // Queries
      const { data: leadsMes } = await supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioMesReporte.toISOString()).lte('created_at', finMesReporte.toISOString());
      const { data: leadsMesAnterior } = await supabase.client.from('leads').select('id').gte('created_at', inicioMesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString());
      const { data: leadsYoY } = await supabase.client.from('leads').select('id').gte('created_at', inicioMesYoY.toISOString()).lte('created_at', finMesYoY.toISOString());
      const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price, name), team_members:assigned_to(name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesReporte.toISOString()).lte('status_changed_at', finMesReporte.toISOString());
      const { data: cierresMesAnterior } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesAnterior.toISOString()).lte('status_changed_at', finMesAnterior.toISOString());
      const { data: cierresYoY } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesYoY.toISOString()).lte('status_changed_at', finMesYoY.toISOString());
      const { data: pipelineMensual } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);
      const { data: leadsPerdidos } = await supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioMesReporte.toISOString()).lte('status_changed_at', finMesReporte.toISOString());
      const { data: citasMes } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0]).lte('scheduled_date', finMesReporte.toISOString().split('T')[0]);
      const { data: vendedoresMes } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true);

      // Cálculos de revenue
      let revenueMes = 0, revenueMesAnt = 0, revenueYoY = 0, pipelineValue = 0;
      cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
      cierresMesAnterior?.forEach(c => revenueMesAnt += c.properties?.price || 2000000);
      cierresYoY?.forEach(c => revenueYoY += c.properties?.price || 2000000);
      pipelineMensual?.forEach(p => pipelineValue += p.properties?.price || 2000000);

      // Conteos básicos
      const leadsActual = leadsMes?.length || 0;
      const leadsPrev = leadsMesAnterior?.length || 0;
      const leadsYoYCount = leadsYoY?.length || 0;
      const cierresActual = cierresMes?.length || 0;
      const cierresPrev = cierresMesAnterior?.length || 0;
      const cierresYoYCount = cierresYoY?.length || 0;
      const perdidosCount = leadsPerdidos?.length || 0;

      // Citas stats
      const citasTotal = citasMes?.length || 0;
      const citasCompletadas = citasMes?.filter(c => c.status === 'completed').length || 0;
      const citasCanceladas = citasMes?.filter(c => c.status === 'cancelled').length || 0;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;
      const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresActual / citasCompletadas) * 100) : 0;

      // Métricas
      const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';
      const conversionMes = leadsActual > 0 ? Math.round((cierresActual / leadsActual) * 100) : 0;
      const ticketPromedio = cierresActual > 0 ? revenueMes / cierresActual : 0;

      // Tiempo de respuesta promedio
      let tiempoResp = 0, leadsConResp = 0;
      leadsMes?.forEach(l => {
        if (l.first_contact_at && l.created_at) {
          const diff = (new Date(l.first_contact_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60);
          if (diff > 0 && diff < 24 * 60) { tiempoResp += diff; leadsConResp++; }
        }
      });
      const tiempoRespProm = leadsConResp > 0 ? Math.round(tiempoResp / leadsConResp) : 0;

      // Top fuentes
      const porFuente: Record<string, number> = {};
      leadsMes?.forEach(l => { const f = l.source || 'Directo'; porFuente[f] = (porFuente[f] || 0) + 1; });
      const fuentesTop = Object.entries(porFuente).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Razones de pérdida
      const razonesLost: Record<string, number> = {};
      leadsPerdidos?.forEach(l => { const r = l.lost_reason || 'Sin especificar'; razonesLost[r] = (razonesLost[r] || 0) + 1; });
      const topRazones = Object.entries(razonesLost).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Rendimiento vendedores con revenue
      const rendimiento: { nombre: string; cierres: number; leads: number; revenue: number }[] = [];
      vendedoresMes?.forEach(v => {
        const c = cierresMes?.filter(x => x.assigned_to === v.id).length || 0;
        const l = leadsMes?.filter(x => x.assigned_to === v.id).length || 0;
        let rev = 0;
        cierresMes?.filter(x => x.assigned_to === v.id).forEach(x => rev += x.properties?.price || 2000000);
        if (c > 0 || l > 0) rendimiento.push({ nombre: v.name?.split(' ')[0] || 'V', cierres: c, leads: l, revenue: rev });
      });
      rendimiento.sort((a, b) => b.revenue - a.revenue || b.cierres - a.cierres);

      // Pipeline por etapa
      const negociacion = pipelineMensual?.filter(p => p.status === 'negotiation').length || 0;
      const reservados = pipelineMensual?.filter(p => p.status === 'reserved').length || 0;

      // Insights inteligentes
      const insights: string[] = [];
      if (cierresActual > cierresPrev) insights.push('✅ Crecimiento MoM en cierres');
      else if (cierresActual < cierresPrev) insights.push('⚠️ Cierres abajo vs mes anterior');
      if (revenueMes > revenueMesAnt) insights.push('✅ Revenue arriba vs mes anterior');
      if (conversionMes >= 5) insights.push('✅ Conversión saludable');
      else insights.push('⚠️ Revisar seguimiento de leads');
      if (showRate >= 70) insights.push('✅ Buen show rate de citas');
      else if (citasTotal > 0) insights.push('⚠️ Mejorar confirmación de citas');
      if (tiempoRespProm > 0 && tiempoRespProm <= 30) insights.push('✅ Tiempo respuesta excelente');
      else if (tiempoRespProm > 120) insights.push('⚠️ Reducir tiempo de respuesta');
      if (pipelineValue > revenueMes * 2) insights.push('💰 Pipeline saludable');

      const msg = `📊 *REPORTE MENSUAL CEO*
*${nombreMes.toUpperCase()} ${anioReporte}*

━━━━━━━━━━━━━━━━━━━━━
💰 *RESULTADOS DEL MES*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueMes/1000000).toFixed(1)}M* ${calcVar(revenueMes, revenueMesAnt)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresPrev)}
• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*
• vs año anterior: ${calcVar(revenueMes, revenueYoY)} revenue

━━━━━━━━━━━━━━━━━━━━━
📥 *GENERACIÓN DE LEADS*
━━━━━━━━━━━━━━━━━━━━━
• Leads: *${leadsActual}* ${calcVar(leadsActual, leadsPrev)}
• Conversión: *${conversionMes}%*
• Perdidos: ${perdidosCount}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Completadas: ${citasCompletadas}/${citasTotal} (*${showRate}%* show)
• Canceladas: ${citasCanceladas}
• Cita→Cierre: *${convCitaCierre}%*

━━━━━━━━━━━━━━━━━━━━━
💰 *PIPELINE ACTUAL*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• En negociación: ${negociacion}
• Reservados: ${reservados}

━━━━━━━━━━━━━━━━━━━━━
⏱️ *VELOCIDAD*
━━━━━━━━━━━━━━━━━━━━━
• Tiempo respuesta: *${tiempoRespProm > 60 ? Math.round(tiempoRespProm/60) + 'h' : tiempoRespProm + 'min'}*

━━━━━━━━━━━━━━━━━━━━━
👥 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendimiento.slice(0,5).map((v, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${v.nombre}: ${v.cierres}c $${(v.revenue/1000000).toFixed(1)}M`).join('\n') || '• Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📣 *TOP FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${fuentesTop.map(f => `• ${f[0]}: ${f[1]} leads`).join('\n') || '• Sin datos'}
${perdidosCount > 0 && topRazones.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n❌ *RAZONES PÉRDIDA*\n━━━━━━━━━━━━━━━━━━━━━\n${topRazones.map(r => `• ${r[0]}: ${r[1]}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insights.slice(0, 4).join('\n')}

_Cierre ${nombreMes} ${anioReporte}_`;

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte mensual mejorado enviado a ${phoneFormatted}` }));
    }



    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal vendedor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-vendedor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      }
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte semanal vendedor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar vendedor por teléfono o usar datos de prueba
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', phoneFormatted)
        .single();

      const hoy = new Date();
      const diaSemana = hoy.getDay();

      // Semana pasada (lunes a domingo)
      const inicioSemPasada = new Date(hoy);
      inicioSemPasada.setDate(hoy.getDate() - diaSemana - 6);
      inicioSemPasada.setHours(0, 0, 0, 0);

      const finSemPasada = new Date(inicioSemPasada);
      finSemPasada.setDate(inicioSemPasada.getDate() + 6);
      finSemPasada.setHours(23, 59, 59, 999);

      // Semana anterior
      const inicioSemAnterior = new Date(inicioSemPasada);
      inicioSemAnterior.setDate(inicioSemPasada.getDate() - 7);
      const finSemAnterior = new Date(finSemPasada);
      finSemAnterior.setDate(finSemPasada.getDate() - 7);

      // Obtener todos los vendedores para ranking
      const { data: vendedoresRank } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'vendedor')
        .eq('active', true);

      // Datos globales de la semana
      const { data: todosLeadsSemV } = await supabase.client
        .from('leads')
        .select('*, properties(price)')
        .gte('created_at', inicioSemPasada.toISOString())
        .lte('created_at', finSemPasada.toISOString());

      const { data: todosCierresSemV } = await supabase.client
        .from('leads')
        .select('*, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioSemPasada.toISOString())
        .lte('status_changed_at', finSemPasada.toISOString());

      const { data: todasCitasSemV } = await supabase.client
        .from('appointments')
        .select('*')
        .gte('scheduled_date', inicioSemPasada.toISOString().split('T')[0])
        .lte('scheduled_date', finSemPasada.toISOString().split('T')[0]);

      // Datos semana anterior
      const { data: todosLeadsSemAntV } = await supabase.client
        .from('leads')
        .select('id, assigned_to')
        .gte('created_at', inicioSemAnterior.toISOString())
        .lte('created_at', finSemAnterior.toISOString());

      const { data: todosCierresSemAntV } = await supabase.client
        .from('leads')
        .select('id, assigned_to, properties(price)')
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioSemAnterior.toISOString())
        .lte('status_changed_at', finSemAnterior.toISOString());

      // Calcular ranking por revenue
      const vendedoresConRevenueV = (vendedoresRank || []).map(v => {
        const cierresV = todosCierresSemV?.filter(c => c.assigned_to === v.id) || [];
        let revenueV = 0;
        cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
        return { ...v, cierresCount: cierresV.length, revenueV };
      }).sort((a, b) => b.revenueV - a.revenueV);

      const calcVarV = (a: number, b: number) => {
        if (b === 0) return a > 0 ? '↑' : '→';
        if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
        if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
        return '→';
      };

      // Si encontramos vendedor, usar sus datos reales
      const vendedorId = vendedor?.id || vendedoresRank?.[0]?.id || null;
      const nombreVendedor = vendedor?.name?.split(' ')[0] || 'Vendedor';

      const leadsVendedorV = todosLeadsSemV?.filter(l => l.assigned_to === vendedorId) || [];
      const cierresVendedorV = todosCierresSemV?.filter(c => c.assigned_to === vendedorId) || [];
      const citasVendedorV = todasCitasSemV?.filter(c => c.vendedor_id === vendedorId) || [];

      const leadsVendedorAntV = todosLeadsSemAntV?.filter(l => l.assigned_to === vendedorId) || [];
      const cierresVendedorAntV = todosCierresSemAntV?.filter(c => c.assigned_to === vendedorId) || [];

      const leadsCountV = leadsVendedorV.length;
      const leadsCountAntV = leadsVendedorAntV.length;
      const cierresCountV = cierresVendedorV.length;
      const cierresCountAntV = cierresVendedorAntV.length;

      let revenueVendedorV = 0;
      cierresVendedorV.forEach(c => revenueVendedorV += c.properties?.price || 2000000);

      let revenueVendedorAntV = 0;
      cierresVendedorAntV.forEach(c => revenueVendedorAntV += c.properties?.price || 2000000);

      const citasTotalV = citasVendedorV.length;
      const citasCompletadasV = citasVendedorV.filter(c => c.status === 'completed').length;
      const showRateV = citasTotalV > 0 ? Math.round((citasCompletadasV / citasTotalV) * 100) : 0;

      const convLeadCierreV = leadsCountV > 0 ? Math.round((cierresCountV / leadsCountV) * 100) : 0;
      const convCitaCierreV = citasCompletadasV > 0 ? Math.round((cierresCountV / citasCompletadasV) * 100) : 0;

      // Tiempo de respuesta
      let tiemposRespuestaV: number[] = [];
      for (const l of leadsVendedorV) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuestaV.push(diffMin);
        }
      }
      const tiempoPromedioMinV = tiemposRespuestaV.length > 0
        ? Math.round(tiemposRespuestaV.reduce((a, b) => a + b, 0) / tiemposRespuestaV.length)
        : 0;
      const tiempoRespuestaStrV = tiempoPromedioMinV > 60
        ? `${Math.floor(tiempoPromedioMinV/60)}h ${tiempoPromedioMinV%60}m`
        : `${tiempoPromedioMinV}min`;

      // Ranking
      const posicionV = vendedoresConRevenueV.findIndex(v => v.id === vendedorId) + 1 || vendedoresConRevenueV.length;
      const totalVendedoresV = vendedoresConRevenueV.length || 1;
      const medallasV = ['🥇', '🥈', '🥉'];
      const posicionStrV = posicionV <= 3 ? medallasV[posicionV - 1] : `#${posicionV}`;

      let revenueEquipoV = 0;
      todosCierresSemV?.forEach(c => revenueEquipoV += c.properties?.price || 2000000);
      const porcentajeEquipoV = revenueEquipoV > 0 ? Math.round((revenueVendedorV / revenueEquipoV) * 100) : 0;

      // Insights
      const insightsV: string[] = [];
      if (cierresCountV > cierresCountAntV) insightsV.push(`✅ Mejoraste en cierres: ${cierresCountAntV}→${cierresCountV}`);
      else if (cierresCountV < cierresCountAntV && cierresCountAntV > 0) insightsV.push(`⚠️ Menos cierres que la semana pasada`);
      if (showRateV >= 80) insightsV.push(`✅ Excelente show rate: ${showRateV}%`);
      else if (showRateV < 60 && citasTotalV > 0) insightsV.push(`💡 Tip: Confirma citas 1 día antes`);
      if (tiempoPromedioMinV > 0 && tiempoPromedioMinV <= 10) insightsV.push(`✅ Respuesta rápida: ${tiempoRespuestaStrV}`);
      else if (tiempoPromedioMinV > 60) insightsV.push(`💡 Tip: Responde más rápido a leads`);
      if (posicionV === 1) insightsV.push(`🏆 ¡Eres el #1 del equipo esta semana!`);
      else if (posicionV <= 3) insightsV.push(`🎯 Estás en el Top 3 del equipo`);
      if (convCitaCierreV >= 40) insightsV.push(`✅ Gran cierre en citas: ${convCitaCierreV}%`);
      const insightsTextV = insightsV.length > 0 ? insightsV.join('\n') : '💪 ¡Sigue así!';

      const fechaSemanaV = `${inicioSemPasada.getDate()}/${inicioSemPasada.getMonth()+1} - ${finSemPasada.getDate()}/${finSemPasada.getMonth()+1}`;

      const msgV = `📊 *TU REPORTE SEMANAL*
Hola *${nombreVendedor}* 👋
_Semana: ${fechaSemanaV}_

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedorV/1000000).toFixed(1)}M* ${calcVarV(revenueVendedorV, revenueVendedorAntV)}
• Cierres: *${cierresCountV}* ${calcVarV(cierresCountV, cierresCountAntV)}
• Leads: *${leadsCountV}* ${calcVarV(leadsCountV, leadsCountAntV)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Agendadas: ${citasTotalV}
• Completadas: ${citasCompletadasV}
• Show rate: *${showRateV}%* ${showRateV >= 70 ? '✅' : '⚠️'}

━━━━━━━━━━━━━━━━━━━━━
📈 *TUS CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierreV}%*
• Cita→Cierre: *${convCitaCierreV}%*
• Tiempo respuesta: *${tiempoRespuestaStrV}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStrV}* de ${totalVendedoresV}
• Aportaste: *${porcentajeEquipoV}%* del revenue

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insightsTextV}

_¡Éxito esta semana!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgV);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte semanal vendedor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes a todos los vendedores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-vendedores') {
      console.log('TEST: Enviando reportes semanales a todos los vendedores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalVendedores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes semanales enviados a todos los vendedores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario vendedor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-diario-vendedor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) {
        return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      }
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte diario vendedor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: vendedorD } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', phoneFormatted)
        .single();

      const hoyD = new Date();
      const inicioHoyD = new Date(hoyD); inicioHoyD.setHours(0, 0, 0, 0);
      const finHoyD = new Date(hoyD); finHoyD.setHours(23, 59, 59, 999);
      const inicioAyerD = new Date(inicioHoyD); inicioAyerD.setDate(inicioAyerD.getDate() - 1);
      const finAyerD = new Date(finHoyD); finAyerD.setDate(finAyerD.getDate() - 1);
      const mananaD = new Date(inicioHoyD); mananaD.setDate(mananaD.getDate() + 1);

      const { data: vendedoresD } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true);
      const { data: todosLeadsHoyD } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioHoyD.toISOString()).lte('created_at', finHoyD.toISOString());
      const { data: todosCierresHoyD } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioHoyD.toISOString()).lte('status_changed_at', finHoyD.toISOString());
      const { data: todasCitasHoyD } = await supabase.client.from('appointments').select('*').eq('scheduled_date', inicioHoyD.toISOString().split('T')[0]);
      const { data: citasMananaD } = await supabase.client.from('appointments').select('*, leads(name, phone)').eq('scheduled_date', mananaD.toISOString().split('T')[0]).eq('status', 'scheduled');
      const { data: todosLeadsAyerD } = await supabase.client.from('leads').select('id, assigned_to').gte('created_at', inicioAyerD.toISOString()).lte('created_at', finAyerD.toISOString());
      const { data: todosCierresAyerD } = await supabase.client.from('leads').select('id, assigned_to, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioAyerD.toISOString()).lte('status_changed_at', finAyerD.toISOString());
      const { data: pipelineActivoD } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['new', 'contacted', 'qualified', 'negotiation', 'scheduled', 'visited']);

      const vendedorIdD = vendedorD?.id || vendedoresD?.[0]?.id || null;
      const nombreVendedorD = vendedorD?.name?.split(' ')[0] || 'Vendedor';

      const calcVarD = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const leadsVendedorHoyD = todosLeadsHoyD?.filter(l => l.assigned_to === vendedorIdD) || [];
      const cierresVendedorHoyD = todosCierresHoyD?.filter(c => c.assigned_to === vendedorIdD) || [];
      const citasVendedorHoyD = todasCitasHoyD?.filter(c => c.vendedor_id === vendedorIdD) || [];
      const citasVendedorMananaD = citasMananaD?.filter(c => c.vendedor_id === vendedorIdD) || [];
      const pipelineVendedorD = pipelineActivoD?.filter(p => p.assigned_to === vendedorIdD) || [];
      const leadsVendedorAyerD = todosLeadsAyerD?.filter(l => l.assigned_to === vendedorIdD) || [];
      const cierresVendedorAyerD = todosCierresAyerD?.filter(c => c.assigned_to === vendedorIdD) || [];

      const leadsHoyCountD = leadsVendedorHoyD.length;
      const leadsAyerCountD = leadsVendedorAyerD.length;
      const cierresHoyCountD = cierresVendedorHoyD.length;

      let revenueHoyD = 0;
      cierresVendedorHoyD.forEach(c => revenueHoyD += c.properties?.price || 2000000);

      const citasHoyTotalD = citasVendedorHoyD.length;
      const citasCompletadasD = citasVendedorHoyD.filter(c => c.status === 'completed').length;
      const citasPendientesD = citasVendedorHoyD.filter(c => c.status === 'scheduled').length;
      const showRateHoyD = citasHoyTotalD > 0 ? Math.round((citasCompletadasD / citasHoyTotalD) * 100) : 0;

      let pipelineValueD = 0;
      pipelineVendedorD.forEach(p => pipelineValueD += p.properties?.price || 2000000);
      const leadsNuevosD = pipelineVendedorD.filter(p => p.status === 'new').length;
      const leadsContactadosD = pipelineVendedorD.filter(p => ['contacted', 'qualified'].includes(p.status)).length;
      const leadsNegociacionD = pipelineVendedorD.filter(p => ['negotiation', 'scheduled', 'visited'].includes(p.status)).length;

      let tiemposRespuestaD: number[] = [];
      for (const l of leadsVendedorHoyD) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuestaD.push(diffMin);
        }
      }
      const tiempoPromedioMinD = tiemposRespuestaD.length > 0 ? Math.round(tiemposRespuestaD.reduce((a, b) => a + b, 0) / tiemposRespuestaD.length) : 0;
      const tiempoRespuestaStrD = tiempoPromedioMinD > 60 ? `${Math.floor(tiempoPromedioMinD/60)}h ${tiempoPromedioMinD%60}m` : `${tiempoPromedioMinD}min`;

      const citasMananaDetalleD: string[] = [];
      citasVendedorMananaD.slice(0, 3).forEach(c => {
        const hora = c.scheduled_time?.substring(0, 5) || '00:00';
        const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
        citasMananaDetalleD.push(`  • ${hora} - ${cliente}`);
      });

      const insightsD: string[] = [];
      if (cierresHoyCountD > 0) insightsD.push(`🎉 ¡${cierresHoyCountD} cierre${cierresHoyCountD > 1 ? 's' : ''} hoy! $${(revenueHoyD/1000000).toFixed(1)}M`);
      if (leadsHoyCountD > leadsAyerCountD && leadsHoyCountD > 0) insightsD.push(`📈 Más leads que ayer: ${leadsAyerCountD}→${leadsHoyCountD}`);
      if (citasPendientesD > 0) insightsD.push(`⚠️ ${citasPendientesD} cita${citasPendientesD > 1 ? 's' : ''} pendiente${citasPendientesD > 1 ? 's' : ''} de hoy`);
      if (tiempoPromedioMinD > 0 && tiempoPromedioMinD <= 10) insightsD.push(`✅ Respuesta rápida: ${tiempoRespuestaStrD}`);
      else if (tiempoPromedioMinD > 30) insightsD.push(`💡 Tip: Responde más rápido`);
      if (leadsNuevosD > 3) insightsD.push(`📋 ${leadsNuevosD} leads nuevos por contactar`);
      if (citasVendedorMananaD.length > 0) insightsD.push(`📅 Mañana: ${citasVendedorMananaD.length} cita${citasVendedorMananaD.length > 1 ? 's' : ''}`);
      const insightsTextD = insightsD.length > 0 ? insightsD.join('\n') : '💪 ¡Buen trabajo hoy!';

      const fechaHoyD = `${hoyD.getDate()}/${hoyD.getMonth()+1}/${hoyD.getFullYear()}`;

      const msgD = `📊 *TU RESUMEN DEL DÍA*
Hola *${nombreVendedorD}* 👋
_${fechaHoyD}_

━━━━━━━━━━━━━━━━━━━━━
💰 *HOY*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsHoyCountD}* ${calcVarD(leadsHoyCountD, leadsAyerCountD)}
• Cierres: *${cierresHoyCountD}* ${cierresHoyCountD > 0 ? '🎉' : ''}
${cierresHoyCountD > 0 ? `• Revenue: *$${(revenueHoyD/1000000).toFixed(1)}M*` : ''}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS HOY*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasHoyTotalD}
• Completadas: ${citasCompletadasD} ${showRateHoyD >= 80 ? '✅' : ''}
• Pendientes: ${citasPendientesD} ${citasPendientesD > 0 ? '⚠️' : '✅'}

━━━━━━━━━━━━━━━━━━━━━
📋 *TU PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValueD/1000000).toFixed(1)}M*
• Nuevos: ${leadsNuevosD} | Contactados: ${leadsContactadosD}
• En negociación: ${leadsNegociacionD}

${citasVendedorMananaD.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS MAÑANA*
━━━━━━━━━━━━━━━━━━━━━
${citasMananaDetalleD.join('\n')}${citasVendedorMananaD.length > 3 ? `\n  _+${citasVendedorMananaD.length - 3} más..._` : ''}

` : ''}━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN*
━━━━━━━━━━━━━━━━━━━━━
${insightsTextD}

_¡Descansa y mañana con todo!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgD);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte diario vendedor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes diarios a todos los vendedores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-diarios-vendedores') {
      console.log('TEST: Enviando reportes diarios a todos los vendedores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioVendedores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes diarios enviados a todos los vendedores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual vendedor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-mensual-vendedor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte mensual vendedor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: vendedorM } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();

      const hoyM = new Date();
      const mesActualM = hoyM.getMonth();
      const anioActualM = hoyM.getFullYear();
      const mesReporteM = mesActualM === 0 ? 11 : mesActualM - 1;
      const anioReporteM = mesActualM === 0 ? anioActualM - 1 : anioActualM;
      const inicioMesReporteM = new Date(anioReporteM, mesReporteM, 1);
      const finMesReporteM = new Date(anioReporteM, mesReporteM + 1, 0, 23, 59, 59);
      const mesAnteriorM = mesReporteM === 0 ? 11 : mesReporteM - 1;
      const anioAnteriorM = mesReporteM === 0 ? anioReporteM - 1 : anioReporteM;
      const inicioMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM, 1);
      const finMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM + 1, 0, 23, 59, 59);

      const mesesM = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const nombreMesM = mesesM[mesReporteM];

      const { data: vendedoresM } = await supabase.client.from('team_members').select('*').eq('role', 'vendedor').eq('active', true);
      const { data: todosLeadsMesM } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioMesReporteM.toISOString()).lte('created_at', finMesReporteM.toISOString());
      const { data: todosCierresMesM } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesReporteM.toISOString()).lte('status_changed_at', finMesReporteM.toISOString());
      const { data: todasCitasMesM } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMesReporteM.toISOString().split('T')[0]).lte('scheduled_date', finMesReporteM.toISOString().split('T')[0]);
      const { data: todosLeadsMesAntM } = await supabase.client.from('leads').select('id, assigned_to').gte('created_at', inicioMesAnteriorM.toISOString()).lte('created_at', finMesAnteriorM.toISOString());
      const { data: todosCierresMesAntM } = await supabase.client.from('leads').select('id, assigned_to, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesAnteriorM.toISOString()).lte('status_changed_at', finMesAnteriorM.toISOString());
      const { data: todasCitasMesAntM } = await supabase.client.from('appointments').select('id, vendedor_id, status').gte('scheduled_date', inicioMesAnteriorM.toISOString().split('T')[0]).lte('scheduled_date', finMesAnteriorM.toISOString().split('T')[0]);

      const vendedorIdM = vendedorM?.id || vendedoresM?.[0]?.id || null;
      const nombreVendedorM = vendedorM?.name?.split(' ')[0] || 'Vendedor';

      const vendedoresConRevenueM = (vendedoresM || []).map(v => {
        const cierresV = todosCierresMesM?.filter(c => c.assigned_to === v.id) || [];
        let revenueV = 0; cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
        return { ...v, cierresCount: cierresV.length, revenueV };
      }).sort((a, b) => b.revenueV - a.revenueV);

      let revenueEquipoM = 0;
      todosCierresMesM?.forEach(c => revenueEquipoM += c.properties?.price || 2000000);

      const calcVarM = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const leadsVendedorM = todosLeadsMesM?.filter(l => l.assigned_to === vendedorIdM) || [];
      const cierresVendedorM = todosCierresMesM?.filter(c => c.assigned_to === vendedorIdM) || [];
      const citasVendedorM = todasCitasMesM?.filter(c => c.vendedor_id === vendedorIdM) || [];
      const leadsVendedorAntM = todosLeadsMesAntM?.filter(l => l.assigned_to === vendedorIdM) || [];
      const cierresVendedorAntM = todosCierresMesAntM?.filter(c => c.assigned_to === vendedorIdM) || [];
      const citasVendedorAntM = todasCitasMesAntM?.filter(c => c.vendedor_id === vendedorIdM) || [];

      const leadsCountM = leadsVendedorM.length;
      const leadsCountAntM = leadsVendedorAntM.length;
      const cierresCountM = cierresVendedorM.length;
      const cierresCountAntM = cierresVendedorAntM.length;

      let revenueVendedorM = 0; cierresVendedorM.forEach(c => revenueVendedorM += c.properties?.price || 2000000);
      let revenueVendedorAntM = 0; cierresVendedorAntM.forEach(c => revenueVendedorAntM += c.properties?.price || 2000000);

      const citasTotalM = citasVendedorM.length;
      const citasTotalAntM = citasVendedorAntM.length;
      const citasCompletadasM = citasVendedorM.filter(c => c.status === 'completed').length;
      const citasCompletadasAntM = citasVendedorAntM.filter(c => c.status === 'completed').length;
      const showRateM = citasTotalM > 0 ? Math.round((citasCompletadasM / citasTotalM) * 100) : 0;
      const showRateAntM = citasTotalAntM > 0 ? Math.round((citasCompletadasAntM / citasTotalAntM) * 100) : 0;

      const convLeadCierreM = leadsCountM > 0 ? Math.round((cierresCountM / leadsCountM) * 100) : 0;
      const convCitaCierreM = citasCompletadasM > 0 ? Math.round((cierresCountM / citasCompletadasM) * 100) : 0;
      const ticketPromedioM = cierresCountM > 0 ? revenueVendedorM / cierresCountM : 0;

      let tiemposRespuestaM: number[] = [];
      for (const l of leadsVendedorM) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuestaM.push(diffMin);
        }
      }
      const tiempoPromedioMinM = tiemposRespuestaM.length > 0 ? Math.round(tiemposRespuestaM.reduce((a, b) => a + b, 0) / tiemposRespuestaM.length) : 0;
      const tiempoRespuestaStrM = tiempoPromedioMinM > 60 ? `${Math.floor(tiempoPromedioMinM/60)}h ${tiempoPromedioMinM%60}m` : `${tiempoPromedioMinM}min`;

      const posicionM = vendedoresConRevenueM.findIndex(v => v.id === vendedorIdM) + 1 || vendedoresConRevenueM.length;
      const totalVendedoresM = vendedoresConRevenueM.length || 1;
      const medallasM = ['🥇', '🥈', '🥉'];
      const posicionStrM = posicionM <= 3 ? medallasM[posicionM - 1] : `#${posicionM}`;
      const porcentajeEquipoM = revenueEquipoM > 0 ? Math.round((revenueVendedorM / revenueEquipoM) * 100) : 0;

      const insightsM: string[] = [];
      if (revenueVendedorM > revenueVendedorAntM && revenueVendedorAntM > 0) {
        const pct = Math.round(((revenueVendedorM - revenueVendedorAntM) / revenueVendedorAntM) * 100);
        insightsM.push(`🚀 Revenue creció ${pct}% vs mes anterior`);
      } else if (revenueVendedorM < revenueVendedorAntM && revenueVendedorAntM > 0) {
        insightsM.push(`📉 Revenue bajó vs mes anterior`);
      }
      if (posicionM === 1) insightsM.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicionM <= 3) insightsM.push(`🎯 Top 3 del equipo`);
      if (showRateM >= 80) insightsM.push(`✅ Excelente show rate: ${showRateM}%`);
      if (convCitaCierreM >= 35) insightsM.push(`✅ Gran conversión cita→cierre: ${convCitaCierreM}%`);
      if (tiempoPromedioMinM > 0 && tiempoPromedioMinM <= 15) insightsM.push(`✅ Respuesta rápida promedio`);
      const insightsTextM = insightsM.length > 0 ? insightsM.join('\n') : '💪 ¡Buen mes!';

      const msgM = `📊 *TU REPORTE MENSUAL*
Hola *${nombreVendedorM}* 👋
*${nombreMesM.toUpperCase()} ${anioReporteM}*

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedorM/1000000).toFixed(1)}M* ${calcVarM(revenueVendedorM, revenueVendedorAntM)}
• Cierres: *${cierresCountM}* ${calcVarM(cierresCountM, cierresCountAntM)}
• Ticket promedio: *$${(ticketPromedioM/1000000).toFixed(2)}M*
• Leads: *${leadsCountM}* ${calcVarM(leadsCountM, leadsCountAntM)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasTotalM} ${calcVarM(citasTotalM, citasTotalAntM)}
• Completadas: ${citasCompletadasM}
• Show rate: *${showRateM}%* ${calcVarM(showRateM, showRateAntM)}

━━━━━━━━━━━━━━━━━━━━━
📈 *CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierreM}%*
• Cita→Cierre: *${convCitaCierreM}%*
• Tiempo respuesta: *${tiempoRespuestaStrM}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStrM}* de ${totalVendedoresM}
• Aportaste: *${porcentajeEquipoM}%* del revenue total
• Revenue equipo: $${(revenueEquipoM/1000000).toFixed(1)}M

━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN DEL MES*
━━━━━━━━━━━━━━━━━━━━━
${insightsTextM}

_¡Éxito en ${mesesM[mesActualM]}!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgM);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte mensual vendedor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes mensuales a todos los vendedores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-mensuales-vendedores') {
      console.log('TEST: Enviando reportes mensuales a todos los vendedores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualVendedores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes mensuales enviados a todos los vendedores' }));
    }



    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario asesor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-diario-asesor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte diario asesor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: asesorD } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();
      const hoyD = new Date();
      const inicioHoyD = new Date(hoyD); inicioHoyD.setHours(0, 0, 0, 0);
      const finHoyD = new Date(hoyD); finHoyD.setHours(23, 59, 59, 999);
      const inicioAyerD = new Date(inicioHoyD); inicioAyerD.setDate(inicioAyerD.getDate() - 1);
      const finAyerD = new Date(finHoyD); finAyerD.setDate(finAyerD.getDate() - 1);

      const { data: asesoresD } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
      const { data: hipotecasHoyD } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioHoyD.toISOString()).lte('created_at', finHoyD.toISOString());
      const { data: aprobadasHoyD } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioHoyD.toISOString()).lte('updated_at', finHoyD.toISOString());
      const { data: hipotecasAyerD } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioAyerD.toISOString()).lte('created_at', finAyerD.toISOString());
      const { data: pipelineActivoD } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').in('status', ['pending', 'in_progress', 'sent_to_bank']);

      const asesorIdD = asesorD?.id || asesoresD?.[0]?.id || null;
      const nombreAsesorD = asesorD?.name?.split(' ')[0] || 'Asesor';
      const calcVarD = (a, b) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const nuevasHoyD = hipotecasHoyD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const aprobadasAsesorHoyD = aprobadasHoyD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const nuevasAyerD = hipotecasAyerD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const pipelineAsesorD = pipelineActivoD?.filter(h => h.assigned_advisor_id === asesorIdD) || [];
      const pendientesD = pipelineAsesorD.filter(h => h.status === 'pending').length;
      const enProcesoD = pipelineAsesorD.filter(h => h.status === 'in_progress').length;
      const enBancoD = pipelineAsesorD.filter(h => h.status === 'sent_to_bank').length;

      const insightsD = [];
      if (aprobadasAsesorHoyD.length > 0) insightsD.push(`🎉 ¡${aprobadasAsesorHoyD.length} hipoteca${aprobadasAsesorHoyD.length > 1 ? 's' : ''} aprobada${aprobadasAsesorHoyD.length > 1 ? 's' : ''} hoy!`);
      if (nuevasHoyD.length > nuevasAyerD.length && nuevasHoyD.length > 0) insightsD.push(`📈 Más solicitudes que ayer: ${nuevasAyerD.length}→${nuevasHoyD.length}`);
      if (pendientesD > 3) insightsD.push(`📋 ${pendientesD} solicitudes pendientes de revisar`);
      if (enBancoD > 0) insightsD.push(`🏦 ${enBancoD} en banco - dar seguimiento`);
      const insightsTextD = insightsD.length > 0 ? insightsD.join('\n') : '💪 ¡Buen trabajo hoy!';
      const fechaHoyD = `${hoyD.getDate()}/${hoyD.getMonth()+1}/${hoyD.getFullYear()}`;

      const msgD = `📊 *TU RESUMEN DEL DÍA*\nHola *${nombreAsesorD}* 👋\n_${fechaHoyD}_\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes nuevas: *${nuevasHoyD.length}* ${calcVarD(nuevasHoyD.length, nuevasAyerD.length)}\n• Aprobadas: *${aprobadasAsesorHoyD.length}* ${aprobadasAsesorHoyD.length > 0 ? '🎉' : ''}\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *TU PIPELINE*\n━━━━━━━━━━━━━━━━━━━━━\n• Pendientes: ${pendientesD}\n• En proceso: ${enProcesoD}\n• En banco: ${enBancoD}\n• Total activo: *${pipelineAsesorD.length}*\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsTextD}\n\n_¡Descansa y mañana con todo!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgD);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte diario asesor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes diarios a todos los asesores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-diarios-asesores') {
      console.log('TEST: Enviando reportes diarios a todos los asesores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioAsesores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes diarios enviados a todos los asesores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal asesor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-semanal-asesor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte semanal asesor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: asesorS } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();
      const hoyS = new Date();
      const inicioSemanaS = new Date(hoyS); inicioSemanaS.setDate(hoyS.getDate() - hoyS.getDay() - 6); inicioSemanaS.setHours(0, 0, 0, 0);
      const finSemanaS = new Date(inicioSemanaS); finSemanaS.setDate(inicioSemanaS.getDate() + 6); finSemanaS.setHours(23, 59, 59, 999);
      const inicioSemAntS = new Date(inicioSemanaS); inicioSemAntS.setDate(inicioSemAntS.getDate() - 7);
      const finSemAntS = new Date(finSemanaS); finSemAntS.setDate(finSemAntS.getDate() - 7);

      const { data: asesoresS } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
      const { data: hipotecasSemS } = await supabase.client.from('mortgage_applications').select('*').gte('created_at', inicioSemanaS.toISOString()).lte('created_at', finSemanaS.toISOString());
      const { data: aprobadasSemS } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'approved').gte('updated_at', inicioSemanaS.toISOString()).lte('updated_at', finSemanaS.toISOString());
      const { data: rechazadasSemS } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'rejected').gte('updated_at', inicioSemanaS.toISOString()).lte('updated_at', finSemanaS.toISOString());
      const { data: hipotecasSemAntS } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioSemAntS.toISOString()).lte('created_at', finSemAntS.toISOString());
      const { data: aprobadasSemAntS } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioSemAntS.toISOString()).lte('updated_at', finSemAntS.toISOString());

      const asesorIdS = asesorS?.id || asesoresS?.[0]?.id || null;
      const nombreAsesorS = asesorS?.name?.split(' ')[0] || 'Asesor';
      const calcVarS = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const nuevasSemS = hipotecasSemS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const aprobadasAsesorS = aprobadasSemS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const rechazadasAsesorS = rechazadasSemS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const nuevasSemAntS = hipotecasSemAntS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];
      const aprobadasSemAntAsesorS = aprobadasSemAntS?.filter(h => h.assigned_advisor_id === asesorIdS) || [];

      const totalProcesadasS = aprobadasAsesorS.length + rechazadasAsesorS.length;
      const tasaAprobacionS = totalProcesadasS > 0 ? Math.round((aprobadasAsesorS.length / totalProcesadasS) * 100) : 0;

      const asesoresConAprobacionesS = (asesoresS || []).map(a => {
        const aprobadas = aprobadasSemS?.filter(h => h.assigned_advisor_id === a.id) || [];
        return { ...a, aprobadas: aprobadas.length };
      }).sort((a, b) => b.aprobadas - a.aprobadas);
      const posicionS = asesoresConAprobacionesS.findIndex(a => a.id === asesorIdS) + 1 || asesoresConAprobacionesS.length;
      const medallasS = ['🥇', '🥈', '🥉'];
      const posicionStrS = posicionS <= 3 ? medallasS[posicionS - 1] : `#${posicionS}`;

      const insightsS: string[] = [];
      if (aprobadasAsesorS.length > aprobadasSemAntAsesorS.length && aprobadasSemAntAsesorS.length > 0) insightsS.push(`🚀 Más aprobaciones que semana pasada`);
      if (posicionS === 1) insightsS.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicionS <= 3) insightsS.push(`🎯 Top 3 del equipo`);
      if (tasaAprobacionS >= 70) insightsS.push(`✅ Excelente tasa de aprobación: ${tasaAprobacionS}%`);
      const insightsTextS = insightsS.length > 0 ? insightsS.join('\n') : '💪 ¡Buena semana!';

      const msgS = `📊 *TU REPORTE SEMANAL*\nHola *${nombreAsesorS}* 👋\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *HIPOTECAS*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes: *${nuevasSemS.length}* ${calcVarS(nuevasSemS.length, nuevasSemAntS.length)}\n• Aprobadas: *${aprobadasAsesorS.length}* ${calcVarS(aprobadasAsesorS.length, aprobadasSemAntAsesorS.length)}\n• Rechazadas: ${rechazadasAsesorS.length}\n• Tasa aprobación: *${tasaAprobacionS}%*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStrS}* de ${asesoresConAprobacionesS.length}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsTextS}\n\n_¡Éxito esta semana!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgS);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte semanal asesor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes semanales a todos los asesores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-semanales-asesores') {
      console.log('TEST: Enviando reportes semanales a todos los asesores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalAsesores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes semanales enviados a todos los asesores' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual asesor individual
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-mensual-asesor/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte mensual asesor a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const { data: asesorM } = await supabase.client.from('team_members').select('*').eq('phone', phoneFormatted).single();
      const hoyM = new Date();
      const mesActualM = hoyM.getMonth();
      const anioActualM = hoyM.getFullYear();
      const mesReporteM = mesActualM === 0 ? 11 : mesActualM - 1;
      const anioReporteM = mesActualM === 0 ? anioActualM - 1 : anioActualM;
      const inicioMesReporteM = new Date(anioReporteM, mesReporteM, 1);
      const finMesReporteM = new Date(anioReporteM, mesReporteM + 1, 0, 23, 59, 59);
      const mesAnteriorM = mesReporteM === 0 ? 11 : mesReporteM - 1;
      const anioAnteriorM = mesReporteM === 0 ? anioReporteM - 1 : anioReporteM;
      const inicioMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM, 1);
      const finMesAnteriorM = new Date(anioAnteriorM, mesAnteriorM + 1, 0, 23, 59, 59);
      const mesesM = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const nombreMesM = mesesM[mesReporteM];

      const { data: asesoresM } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
      const { data: hipotecasMesM } = await supabase.client.from('mortgage_applications').select('*').gte('created_at', inicioMesReporteM.toISOString()).lte('created_at', finMesReporteM.toISOString());
      const { data: aprobadasMesM } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'approved').gte('updated_at', inicioMesReporteM.toISOString()).lte('updated_at', finMesReporteM.toISOString());
      const { data: rechazadasMesM } = await supabase.client.from('mortgage_applications').select('*').eq('status', 'rejected').gte('updated_at', inicioMesReporteM.toISOString()).lte('updated_at', finMesReporteM.toISOString());
      const { data: hipotecasMesAntM } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioMesAnteriorM.toISOString()).lte('created_at', finMesAnteriorM.toISOString());
      const { data: aprobadasMesAntM } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioMesAnteriorM.toISOString()).lte('updated_at', finMesAnteriorM.toISOString());

      const asesorIdM = asesorM?.id || asesoresM?.[0]?.id || null;
      const nombreAsesorM = asesorM?.name?.split(' ')[0] || 'Asesor';
      const calcVarM = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

      const nuevasMesM = hipotecasMesM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const aprobadasAsesorM = aprobadasMesM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const rechazadasAsesorM = rechazadasMesM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const nuevasMesAntM = hipotecasMesAntM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];
      const aprobadasMesAntAsesorM = aprobadasMesAntM?.filter(h => h.assigned_advisor_id === asesorIdM) || [];

      const totalProcesadasM = aprobadasAsesorM.length + rechazadasAsesorM.length;
      const tasaAprobacionM = totalProcesadasM > 0 ? Math.round((aprobadasAsesorM.length / totalProcesadasM) * 100) : 0;
      const tasaAprobacionAntM = aprobadasMesAntAsesorM.length > 0 ? Math.round((aprobadasMesAntAsesorM.length / (aprobadasMesAntAsesorM.length + rechazadasAsesorM.length)) * 100) : 0;

      const asesoresConAprobacionesM = (asesoresM || []).map(a => {
        const aprobadas = aprobadasMesM?.filter(h => h.assigned_advisor_id === a.id) || [];
        return { ...a, aprobadas: aprobadas.length };
      }).sort((a, b) => b.aprobadas - a.aprobadas);
      const posicionM = asesoresConAprobacionesM.findIndex(a => a.id === asesorIdM) + 1 || asesoresConAprobacionesM.length;
      const medallasM = ['🥇', '🥈', '🥉'];
      const posicionStrM = posicionM <= 3 ? medallasM[posicionM - 1] : `#${posicionM}`;
      const totalAprobacionesEquipoM = aprobadasMesM?.length || 0;
      const porcentajeEquipoM = totalAprobacionesEquipoM > 0 ? Math.round((aprobadasAsesorM.length / totalAprobacionesEquipoM) * 100) : 0;

      const insightsM: string[] = [];
      if (aprobadasAsesorM.length > aprobadasMesAntAsesorM.length && aprobadasMesAntAsesorM.length > 0) {
        const pct = Math.round(((aprobadasAsesorM.length - aprobadasMesAntAsesorM.length) / aprobadasMesAntAsesorM.length) * 100);
        insightsM.push(`🚀 Aprobaciones crecieron ${pct}% vs mes anterior`);
      }
      if (posicionM === 1) insightsM.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicionM <= 3) insightsM.push(`🎯 Top 3 del equipo`);
      if (tasaAprobacionM >= 70) insightsM.push(`✅ Excelente tasa de aprobación: ${tasaAprobacionM}%`);
      const insightsTextM = insightsM.length > 0 ? insightsM.join('\n') : '💪 ¡Buen mes!';

      const msgM = `📊 *TU REPORTE MENSUAL*\nHola *${nombreAsesorM}* 👋\n*${nombreMesM.toUpperCase()} ${anioReporteM}*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *TUS RESULTADOS*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes: *${nuevasMesM.length}* ${calcVarM(nuevasMesM.length, nuevasMesAntM.length)}\n• Aprobadas: *${aprobadasAsesorM.length}* ${calcVarM(aprobadasAsesorM.length, aprobadasMesAntAsesorM.length)}\n• Rechazadas: ${rechazadasAsesorM.length}\n• Tasa aprobación: *${tasaAprobacionM}%* ${calcVarM(tasaAprobacionM, tasaAprobacionAntM)}\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING EQUIPO*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStrM}* de ${asesoresConAprobacionesM.length}\n• Aportaste: *${porcentajeEquipoM}%* de aprobaciones\n• Total equipo: ${totalAprobacionesEquipoM} aprobadas\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN DEL MES*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsTextM}\n\n_¡Éxito en ${mesesM[mesActualM]}!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msgM);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte mensual asesor enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Enviar reportes mensuales a todos los asesores
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reportes-mensuales-asesores') {
      console.log('TEST: Enviando reportes mensuales a todos los asesores...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualAsesores(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reportes mensuales enviados a todos los asesores' }));
    }


    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte marketing individual por teléfono
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.startsWith('/test-reporte-marketing/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;
      console.log(`TEST: Enviando reporte marketing a ${phoneFormatted}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      const hoy = new Date();
      const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
      const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
      const inicioAyer = new Date(inicioHoy); inicioAyer.setDate(inicioAyer.getDate() - 1);
      const finAyer = new Date(finHoy); finAyer.setDate(finAyer.getDate() - 1);

      const { data: leadsHoy } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString());
      const { data: leadsAyer } = await supabase.client.from('leads').select('id, source').gte('created_at', inicioAyer.toISOString()).lte('created_at', finAyer.toISOString());
      const { data: citasHoy } = await supabase.client.from('appointments').select('*').eq('scheduled_date', inicioHoy.toISOString().split('T')[0]);
      const { data: cierresHoy } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioHoy.toISOString()).lte('status_changed_at', finHoy.toISOString());

      const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };
      const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

      const fuenteHoy: Record<string, number> = {};
      const fuenteAyer: Record<string, number> = {};
      leadsHoy?.forEach(l => { const f = l.source || 'Directo'; fuenteHoy[f] = (fuenteHoy[f] || 0) + 1; });
      leadsAyer?.forEach(l => { const f = l.source || 'Directo'; fuenteAyer[f] = (fuenteAyer[f] || 0) + 1; });
      const topFuentes = Object.entries(fuenteHoy).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const citasAgendadas = citasHoy?.filter(c => c.status === 'scheduled').length || 0;
      const citasCompletadas = citasHoy?.filter(c => c.status === 'completed').length || 0;
      let revenueHoy = 0;
      cierresHoy?.forEach(c => revenueHoy += c.properties?.price || 2000000);
      const convLeadCita = (leadsHoy?.length || 0) > 0 ? Math.round((citasAgendadas / (leadsHoy?.length || 1)) * 100) : 0;

      const fuentesStr = topFuentes.length > 0
        ? topFuentes.map(([f, c]) => `  • ${f}: ${c} ${calcVar(c, fuenteAyer[f] || 0)}`).join('\n')
        : '  Sin leads hoy';

      const insights: string[] = [];
      if ((leadsHoy?.length || 0) > (leadsAyer?.length || 0)) insights.push(`📈 +${(leadsHoy?.length || 0) - (leadsAyer?.length || 0)} leads vs ayer`);
      if (cierresHoy && cierresHoy.length > 0) insights.push(`🎉 ${cierresHoy.length} cierre${cierresHoy.length > 1 ? 's' : ''} hoy!`);
      if (convLeadCita >= 30) insights.push(`✅ Buena conversión lead→cita: ${convLeadCita}%`);
      const mejorFuente = topFuentes[0];
      if (mejorFuente && mejorFuente[1] >= 3) insights.push(`🔥 ${mejorFuente[0]} fue la mejor fuente`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen día de marketing!';

      const msg = `📊 *REPORTE DIARIO MARKETING*\nHola 👋\n_${fechaHoy}_\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *LEADS HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Total: *${leadsHoy?.length || 0}* ${calcVar(leadsHoy?.length || 0, leadsAyer?.length || 0)}\n• Conv. lead→cita: *${convLeadCita}%*\n${cierresHoy && cierresHoy.length > 0 ? `• Revenue: *$${(revenueHoy/1000000).toFixed(1)}M*\n` : ''}\n━━━━━━━━━━━━━━━━━━━━━\n📍 *POR FUENTE*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n📅 *CITAS*\n━━━━━━━━━━━━━━━━━━━━━\n• Agendadas: ${citasAgendadas}\n• Completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Mañana seguimos!_ 🚀`;

      await meta.sendWhatsAppMessage(phoneFormatted, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Reporte marketing enviado a ${phoneFormatted}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte diario marketing
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-diario-marketing') {
      console.log('TEST: Enviando reporte diario marketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteDiarioMarketing(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte diario marketing enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte semanal marketing
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-semanal-marketing') {
      console.log('TEST: Enviando reporte semanal marketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteSemanalMarketing(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte semanal marketing enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Reporte mensual marketing
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-reporte-mensual-marketing') {
      console.log('TEST: Enviando reporte mensual marketing...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await enviarReporteMensualMarketing(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reporte mensual marketing enviado' }));
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
    if (url.pathname === '/test-reactivacion') {
      console.log('TEST: Ejecutando reactivación de leads perdidos...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await reactivarLeadsPerdidos(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Reactivación de leads perdidos ejecutada' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Configurar captura de cumpleaños (lead o equipo)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-cumple-setup') {
      const phone = url.searchParams.get('phone') || '5215610016226';
      const phoneClean = phone.replace(/\D/g, '');
      const phoneFormatted = phoneClean.startsWith('52') ? phoneClean : `52${phoneClean}`;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Primero buscar si es miembro del equipo (usar misma lógica que webhook)
      const phone10 = phoneClean.slice(-10); // últimos 10 dígitos

      // Obtener todos los team members y hacer match manual (como el webhook)
      const { data: allTeamMembers, error: tmError } = await supabase.client
        .from('team_members')
        .select('id, name, phone, notes')
        .eq('active', true);

      if (tmError) console.log('❌ Error cargando team_members:', tmError);

      const teamMember = allTeamMembers?.find((tm: any) => {
        if (!tm.phone) return false;
        const tmPhone = tm.phone.replace(/\D/g, '').slice(-10);
        return tmPhone === phone10;
      });

      console.log(`🔍 Buscando equipo: phone10=${phone10} -> ${teamMember?.name || 'NO ENCONTRADO'}`);

      if (teamMember) {
        // Es miembro del equipo
        const notasActuales = typeof teamMember.notes === 'object' ? teamMember.notes : {};
        await supabase.client
          .from('team_members')
          .update({
            birthday: null,
            notes: { ...notasActuales, pending_birthday_response: true }
          })
          .eq('id', teamMember.id);

        const nombre = teamMember.name?.split(' ')[0] || '';
        await meta.sendWhatsAppMessage(
          phoneFormatted,
          `¡Hola ${nombre}! 👋\n\n¿Cuándo es tu cumpleaños? 🎂\nPara tenerte una sorpresa ese día 🎁\n\n_(ej: 15 marzo)_`
        );

        return corsResponse(JSON.stringify({
          ok: true,
          tipo: 'equipo',
          message: 'Miembro del equipo configurado para captura de cumpleaños',
          persona: { id: teamMember.id, name: teamMember.name, phone: teamMember.phone },
          instrucciones: 'Responde al WhatsApp con tu fecha (ej: "15 marzo" o "5/3")'
        }));
      }

      // Si no es equipo, buscar como lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, birthday, notes')
        .or(`phone.eq.${phoneFormatted},phone.eq.${phoneClean}`)
        .limit(1)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'No encontrado (ni equipo ni lead)', phone: phoneFormatted }), 404);
      }

      // Configurar lead para captura de cumpleaños
      const notasActuales = typeof lead.notes === 'object' ? lead.notes : {};
      await supabase.client
        .from('leads')
        .update({
          birthday: null,
          notes: { ...notasActuales, pending_birthday_response: true }
        })
        .eq('id', lead.id);

      const nombre = lead.name?.split(' ')[0] || '';
      await meta.sendWhatsAppMessage(
        phoneFormatted,
        `Por cierto ${nombre}, ¿cuándo es tu cumpleaños? 🎂\nPor si hay algo especial para ti 🎁\n\n_(ej: 15 marzo)_`
      );

      return corsResponse(JSON.stringify({
        ok: true,
        tipo: 'lead',
        message: 'Lead configurado para captura de cumpleaños',
        persona: { id: lead.id, name: lead.name, phone: lead.phone },
        instrucciones: 'Responde al WhatsApp con tu fecha (ej: "15 marzo" o "5/3")'
      }));
    }

    // DEBUG: Query de cumpleaños
    if (url.pathname === '/debug-birthday-query') {
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        month: '2-digit',
        day: '2-digit'
      });
      const fechaMexico = mexicoFormatter.format(ahora);
      const [mes, dia] = fechaMexico.split('-');

      // Query usando RPC o comparación de texto del birthday (cast implícito)
      // El campo birthday es tipo DATE, así que comparamos directamente mes y día
      const { data: leads, error } = await supabase.client
        .from('leads')
        .select('id, name, phone, birthday, status')
        .not('birthday', 'is', null)
        .not('phone', 'is', null);

      // Filtrar en JS porque Supabase no permite extraer mes/día de date fácilmente
      const leadsCumple = leads?.filter(l => {
        if (!l.birthday) return false;
        const bday = l.birthday.toString(); // YYYY-MM-DD
        return bday.endsWith(`-${mes}-${dia}`);
      });

      return corsResponse(JSON.stringify({
        fecha_busqueda: `${mes}-${dia}`,
        leads_con_birthday: leads?.length || 0,
        leads_cumple_hoy: leadsCumple?.length || 0,
        leads: leadsCumple?.map(l => ({ name: l.name, birthday: l.birthday, status: l.status })),
        error: error?.message
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Crear lead con cumpleaños HOY para probar felicitación
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-crear-cumple-hoy') {
      const testPhone = url.searchParams.get('phone') || '5212224558475';

      // Borrar leads de prueba existentes
      await supabase.client
        .from('leads')
        .delete()
        .eq('phone', testPhone)
        .eq('source', 'test');

      // Fecha de hoy en formato YYYY-MM-DD (con año ficticio para el cumpleaños)
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hoyFull = mexicoFormatter.format(ahora); // "2026-01-17"
      const [_, mes, dia] = hoyFull.split('-');
      const birthdayDate = `1990-${mes}-${dia}`; // Usar año ficticio

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Cumpleañero Prueba',
          phone: testPhone,
          status: 'contacted',
          source: 'test',
          assigned_to: vendedor?.id || null,
          birthday: birthdayDate
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      // Ejecutar felicitaciones
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarCumpleañosLeads(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead creado con cumpleaños HOY (${mes}-${dia}) y felicitación enviada`,
        lead: {
          id: newLead.id,
          name: newLead.name,
          phone: newLead.phone,
          birthday: birthdayDate
        }
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Felicitaciones de cumpleaños a leads
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-cumpleanos') {
      console.log('TEST: Ejecutando felicitaciones de cumpleaños...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarCumpleañosLeads(supabase, meta);
      await felicitarCumpleañosEquipo(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Felicitaciones de cumpleaños ejecutadas (leads + equipo)' }));
    }

    // TEST: Enviar mensaje de cumpleaños a un miembro del equipo específico
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-cumpleanos-equipo') {
      const testPhone = url.searchParams.get('phone') || '5212224558475';

      // Buscar el miembro del equipo
      const { data: miembro, error: memberError } = await supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', testPhone)
        .single();

      if (memberError || !miembro) {
        return corsResponse(JSON.stringify({ error: `No se encontró miembro del equipo con teléfono ${testPhone}` }), 404);
      }

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const nombre = miembro.name?.split(' ')[0] || 'compañero';

      const mensaje = `🎂 *¡Feliz Cumpleaños ${nombre}!* 🎉\n\nTodo el equipo de Santa Rita te desea un día increíble lleno de alegría.\n\n¡Que este nuevo año de vida te traiga muchos éxitos! 🌟`;

      try {
        await meta.sendWhatsAppMessage(testPhone, mensaje);

        // Guardar contexto para respuesta
        const notes = typeof miembro.notes === 'object' ? miembro.notes : {};
        const pendingBirthdayResponse = {
          type: 'cumpleanos_equipo',
          sent_at: new Date().toISOString(),
          member_id: miembro.id,
          member_name: miembro.name
        };

        await supabase.client.from('team_members').update({
          notes: {
            ...notes,
            pending_birthday_response: pendingBirthdayResponse
          }
        }).eq('id', miembro.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Mensaje de cumpleaños enviado a ${miembro.name}`,
          member: { id: miembro.id, name: miembro.name, phone: testPhone },
          pending_context: pendingBirthdayResponse
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: `Error enviando mensaje: ${e.message}` }), 500);
      }
    }

    // TEST: Aniversario de compra de casa
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-aniversario') {
      console.log('TEST: Ejecutando felicitaciones de aniversario de compra...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await felicitarAniversarioCompra(supabase, meta);
      return corsResponse(JSON.stringify({ ok: true, message: 'Felicitaciones de aniversario de compra ejecutadas' }));
    }

    // TEST: Recordatorios de citas
    // ═══════════════════════════════════════════════════════════════
    // Debug query para recordatorios
    if (url.pathname === '/debug-recordatorios-query') {
      const ahora = new Date();
      const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hoyStr = mexicoFormatter.format(ahora);
      const en24hStr = mexicoFormatter.format(en24h);

      // Query sin filtros
      const { data: todasCitas, error: err1 } = await supabase.client
        .from('appointments')
        .select('id, lead_name, lead_phone, scheduled_date, scheduled_time, status, reminder_24h_sent, reminder_2h_sent')
        .order('scheduled_date', { ascending: false })
        .limit(10);

      // Query con filtros
      const { data: citasFiltered, error: err2 } = await supabase.client
        .from('appointments')
        .select('id, lead_name, lead_phone, scheduled_date, scheduled_time, status, reminder_24h_sent')
        .gte('scheduled_date', hoyStr)
        .lte('scheduled_date', en24hStr)
        .eq('status', 'scheduled');

      return corsResponse(JSON.stringify({
        fechas: { hoy: hoyStr, en24h: en24hStr },
        todasCitas: {
          total: todasCitas?.length || 0,
          error: err1?.message,
          data: todasCitas?.map(c => ({
            id: c.id?.slice(0,8),
            lead: c.lead_name,
            phone: c.lead_phone?.slice(-4),
            fecha: c.scheduled_date,
            hora: c.scheduled_time,
            status: c.status,
            r24h: c.reminder_24h_sent,
            r2h: c.reminder_2h_sent
          }))
        },
        citasFiltradas: {
          total: citasFiltered?.length || 0,
          error: err2?.message,
          data: citasFiltered?.map(c => ({
            id: c.id?.slice(0,8),
            lead: c.lead_name,
            phone: c.lead_phone?.slice(-4),
            fecha: c.scheduled_date,
            hora: c.scheduled_time,
            r24h: c.reminder_24h_sent
          }))
        }
      }, null, 2));
    }

    if (url.pathname === '/test-recordatorios-citas') {
      console.log('🧪 TEST: Ejecutando recordatorios de citas...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const notificationService = new NotificationService(supabase, meta);
      const result = await notificationService.enviarRecordatoriosCitas();
      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Recordatorios de citas ejecutados',
        enviados: result.enviados,
        errores: result.errores
      }));
    }

    // Setup: Crear cita de prueba para recordatorios
    if (url.pathname === '/test-setup-cita') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const horasAntes = parseInt(url.searchParams.get('horas') || '24'); // 24 o 2
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar lead
      const cleanPhone = phone.replace(/\D/g, '');
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Calcular fecha/hora de la cita (en X horas)
      const ahora = new Date();
      const fechaCita = new Date(ahora.getTime() + horasAntes * 60 * 60 * 1000);

      // Usar timezone México para la fecha
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const scheduled_date = mexicoFormatter.format(fechaCita);

      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const scheduled_time = timeFormatter.format(fechaCita);

      // Crear o actualizar cita
      const { data: existingCita } = await supabase.client
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .single();

      let citaId;
      if (existingCita) {
        const { error: updateError } = await supabase.client
          .from('appointments')
          .update({
            scheduled_date,
            scheduled_time,
            reminder_24h_sent: false,
            reminder_2h_sent: false,
            property_name: 'Distrito Falco'
          })
          .eq('id', existingCita.id);

        if (updateError) {
          console.error('Error updating cita:', updateError);
          return corsResponse(JSON.stringify({
            error: 'Error actualizando cita',
            details: updateError.message
          }), 500);
        }
        citaId = existingCita.id;
        console.log(`📅 Cita actualizada: ${citaId}, reminder flags reset`);
      } else {
        const { data: newCita, error: insertError } = await supabase.client
          .from('appointments')
          .insert({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: lead.phone,
            scheduled_date,
            scheduled_time,
            status: 'scheduled',
            reminder_24h_sent: false,
            reminder_2h_sent: false,
            property_name: 'Distrito Falco',
            appointment_type: 'property_viewing',
            duration_minutes: 60
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting cita:', insertError);
          return corsResponse(JSON.stringify({
            error: 'Error creando cita',
            details: insertError.message,
            code: insertError.code
          }), 500);
        }
        citaId = newCita?.id;
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cita configurada para ${horasAntes}h desde ahora`,
        lead: lead.name,
        lead_id: lead.id,
        scheduled_date,
        scheduled_time,
        cita_id: citaId,
        recordatorio_tipo: horasAntes === 24 ? '24h' : horasAntes === 2 ? '2h' : 'otro'
      }));
    }

    // Debug: Ver citas programadas
    if (url.pathname === '/debug-citas') {
      const { data: citas, error: citasError } = await supabase.client
        .from('appointments')
        .select('id, lead_name, lead_id, scheduled_date, scheduled_time, status, reminder_24h_sent, reminder_2h_sent, property_name')
        .order('scheduled_date', { ascending: false })
        .limit(20);

      console.log('DEBUG citas: encontradas', citas?.length, 'error:', citasError?.message);

      return corsResponse(JSON.stringify({
        total: citas?.length || 0,
        citas: citas?.map(c => ({
          id: c.id,
          lead: c.lead_name,
          lead_id: c.lead_id,
          fecha: c.scheduled_date,
          hora: c.scheduled_time,
          desarrollo: c.property_name,
          status: c.status,
          reminder_24h: c.reminder_24h_sent,
          reminder_2h: c.reminder_2h_sent
        }))
      }, null, 2));
    }

    // TEST: Ver notas de vendedor (solo lectura)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-ver-notas') {
      const vendedorPhone = url.searchParams.get('phone') || '5212224558475';
      const cleanPhone = vendedorPhone.replace(/\D/g, '');

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado' }), 404);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        vendedor: vendedor.name,
        notas: vendedor.notes
      }));
    }

    // TEST: Ver notas de LEAD (solo lectura)
    if (url.pathname === '/test-ver-lead') {
      const leadPhone = url.searchParams.get('phone') || '522224558475';
      const cleanPhone = leadPhone.replace(/\D/g, '');

      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        lead: lead.name,
        phone: lead.phone,
        notas: lead.notes
      }));
    }

    // TEST: Configurar encuesta de satisfacción pendiente en lead
    if (url.pathname === '/test-setup-encuesta-lead') {
      const leadPhone = url.searchParams.get('phone') || '522224558475';
      const cleanPhone = leadPhone.replace(/\D/g, '');

      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      let notasLead: any = {};
      try {
        notasLead = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
      } catch (e) { notasLead = {}; }

      notasLead.pending_satisfaction_survey = {
        property: 'Distrito Falco',
        asked_at: new Date().toISOString()
      };

      await supabase.client
        .from('leads')
        .update({ notes: notasLead })
        .eq('id', lead.id);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Encuesta de satisfacción configurada',
        lead: lead.name,
        notas: notasLead
      }));
    }

    // TEST: Limpiar notas de vendedor para pruebas
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-limpiar-vendedor') {
      const vendedorPhone = url.searchParams.get('phone') || '5212224558475';
      const cleanPhone = vendedorPhone.replace(/\D/g, '');

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, notes')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado' }), 404);
      }

      // Limpiar todas las notas pendientes
      await supabase.client
        .from('team_members')
        .update({ notes: '{}' })
        .eq('id', vendedor.id);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Notas del vendedor limpiadas',
        vendedor: vendedor.name,
        notas_anteriores: vendedor.notes
      }));
    }

    // TEST: Ejecutar detección de no-shows
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-noshow') {
      console.log('🧪 TEST: Ejecutando detección de no-shows...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await detectarNoShows(supabase, meta);
      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Detección de no-shows ejecutada'
      }));
    }

    // TEST: Configurar cita en el pasado para probar no-shows
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-setup-noshow') {
      const phone = url.searchParams.get('phone') || '5212224558475';
      const horasAtras = parseInt(url.searchParams.get('horas') || '2'); // Horas en el pasado
      const vendedorPhone = url.searchParams.get('vendedor') || '5212224558475'; // Teléfono vendedor

      // Buscar lead
      const cleanPhone = phone.replace(/\D/g, '');
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .or(`phone.eq.${cleanPhone},phone.like.%${cleanPhone.slice(-10)}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Buscar vendedor
      const cleanVendedorPhone = vendedorPhone.replace(/\D/g, '');
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .or(`phone.eq.${cleanVendedorPhone},phone.like.%${cleanVendedorPhone.slice(-10)}`)
        .single();

      if (!vendedor) {
        return corsResponse(JSON.stringify({ error: 'Vendedor no encontrado' }), 404);
      }

      // Calcular fecha/hora en el pasado (hace X horas)
      const ahora = new Date();
      const fechaCita = new Date(ahora.getTime() - horasAtras * 60 * 60 * 1000);

      // Usar timezone México para la fecha
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const scheduled_date = mexicoFormatter.format(fechaCita);

      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const scheduled_time = timeFormatter.format(fechaCita);

      // Limpiar notas del vendedor para evitar "ya preguntamos"
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
        notasActuales = {};
      }

      // Limpiar pending_show_confirmation y citas_preguntadas
      delete notasActuales.pending_show_confirmation;
      notasActuales.citas_preguntadas = [];

      await supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notasActuales) })
        .eq('id', vendedor.id);

      // Crear cita con la hora en el pasado
      const { data: newCita, error: insertError } = await supabase.client
        .from('appointments')
        .insert({
          lead_id: lead.id,
          lead_name: lead.name,
          lead_phone: lead.phone,
          vendedor_id: vendedor.id,
          vendedor_name: vendedor.name,
          scheduled_date,
          scheduled_time,
          status: 'scheduled',
          property_name: 'Distrito Falco',
          appointment_type: 'property_viewing',
          duration_minutes: 60
        })
        .select()
        .single();

      if (insertError) {
        return corsResponse(JSON.stringify({
          error: 'Error creando cita',
          details: insertError.message
        }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Cita configurada hace ${horasAtras}h para probar no-show`,
        lead: lead.name,
        vendedor: vendedor.name,
        vendedor_phone: vendedor.phone,
        scheduled_date,
        scheduled_time,
        cita_id: newCita?.id
      }));
    }

    // TEST: Configurar lead para probar aniversario
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-aniversario-setup') {
      const phone = url.searchParams.get('phone') || '5215610016226';
      const años = parseInt(url.searchParams.get('años') || '1');
      const phoneClean = phone.replace(/\D/g, '');
      const phoneFormatted = phoneClean.startsWith('52') ? phoneClean : `52${phoneClean}`;
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Buscar lead por teléfono
      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .or(`phone.eq.${phoneFormatted},phone.eq.${phoneClean}`)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado', phone: phoneFormatted }), 404);
      }

      // Calcular fecha de hace X años (mismo día/mes en timezone México)
      const ahora = new Date();
      const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const [añoMx, mesMx, diaMx] = mexicoFormatter.format(ahora).split('-');
      const fechaAniversario = new Date(parseInt(añoMx) - años, parseInt(mesMx) - 1, parseInt(diaMx), 12, 0, 0);

      // Actualizar lead a status delivered con fecha de hace X años
      const { error: updateError } = await supabase.client
        .from('leads')
        .update({
          status: 'delivered',
          status_changed_at: fechaAniversario.toISOString(),
          notes: {} // Limpiar notas para que no tenga marca de ya felicitado
        })
        .eq('id', lead.id);

      if (updateError) {
        return corsResponse(JSON.stringify({ error: 'Error actualizando lead', details: updateError }), 500);
      }

      // Verificar que el update funcionó
      const { data: leadVerify } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, status_changed_at')
        .eq('id', lead.id)
        .single();

      console.log(`✅ Lead configurado: ${JSON.stringify(leadVerify)}`);
      console.log(`📅 Fecha aniversario: ${fechaAniversario.toISOString()}, años=${años}`);

      // Ahora ejecutar la función de aniversario
      await felicitarAniversarioCompra(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: `Lead configurado y aniversario ejecutado`,
        lead: lead.name,
        phone: phoneFormatted,
        años: años,
        status_changed_at: fechaAniversario.toISOString()
      }));
    }

    if (url.pathname.startsWith('/test-lead/')) {
      const phone = url.pathname.split('/')[2];
      if (!phone) return corsResponse(JSON.stringify({ error: 'Falta teléfono' }), 400);
      const phoneFormatted = phone.startsWith('52') ? phone : `52${phone}`;

      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .eq('phone', phoneFormatted)
        .single();

      if (!lead) return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);

      return corsResponse(JSON.stringify({
        phone: lead.phone,
        name: lead.name,
        lead_score: lead.lead_score,
        lead_category: lead.lead_category,
        property_interest: lead.property_interest,
        needs_mortgage: lead.needs_mortgage,
        how_found_us: lead.how_found_us,
        family_size: lead.family_size,
        current_housing: lead.current_housing,
        num_bedrooms_wanted: lead.num_bedrooms_wanted,
        occupation: lead.occupation,
        urgency: lead.urgency,
        age_range: lead.age_range,
        created_at: lead.created_at,
        updated_at: lead.updated_at
      }, null, 2));
    }

    if (url.pathname === '/test-hipotecas') {
      console.log('TEST: Verificando hipotecas estancadas...');
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Debug info
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);

      const { data: hipotecasEstancadas } = await supabase.client
        .from('mortgage_applications')
        .select('*, leads(name, phone), team_members!mortgage_applications_assigned_advisor_id_fkey(name, phone)')
        .eq('status', 'sent_to_bank')
        .lt('updated_at', hace7dias.toISOString());

      const { data: todasHipotecas } = await supabase.client
        .from('mortgage_applications')
        .select('id, lead_name, status, bank, updated_at')
        .limit(10);

      await seguimientoHipotecas(supabase, meta);

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Seguimiento hipotecas ejecutado',
        debug: {
          hipotecas_estancadas: hipotecasEstancadas?.length || 0,
          detalle_estancadas: hipotecasEstancadas?.slice(0, 5) || [],
          todas_hipotecas: todasHipotecas?.length || 0,
          muestra: todasHipotecas || []
        }
      }));
    }

    // TEST: Crear hipoteca de prueba estancada
    if (url.pathname === '/test-crear-hipoteca') {
      const hace10dias = new Date();
      hace10dias.setDate(hace10dias.getDate() - 10);

      // Buscar un lead y asesor para la prueba
      const { data: lead } = await supabase.client
        .from('leads')
        .select('id, name, phone')
        .limit(1)
        .single();

      const { data: asesor } = await supabase.client
        .from('team_members')
        .select('id, name, phone')
        .eq('role', 'asesor')
        .eq('active', true)
        .not('phone', 'is', null)
        .limit(1)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'No se encontró lead para prueba' }), 404);
      }

      const { data: newMortgage, error } = await supabase.client
        .from('mortgage_applications')
        .insert({
          lead_id: lead.id,
          lead_name: lead.name,
          status: 'sent_to_bank',
          bank: 'Banco Prueba',
          assigned_advisor_id: asesor?.id || null,
          created_at: hace10dias.toISOString(),
          updated_at: hace10dias.toISOString()
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Hipoteca de prueba creada',
        hipoteca: {
          id: newMortgage.id,
          lead: lead.name,
          asesor: asesor?.name || 'Sin asignar',
          status: newMortgage.status,
          updated_at: newMortgage.updated_at
        }
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // API ASESOR: Endpoints para panel de asesores hipotecarios
    // ═══════════════════════════════════════════════════════════════

    // GET /api/asesor/leads?asesor_id=xxx - Ver leads del asesor
    if (url.pathname === '/api/asesor/leads' && request.method === 'GET') {
      const asesorId = url.searchParams.get('asesor_id');
      if (!asesorId) {
        return corsResponse(JSON.stringify({ error: 'Falta asesor_id' }), 400);
      }

      // Buscar leads asignados al asesor
      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('id, name, phone, status, created_at, notes, property_interest')
        .not('notes', 'is', null)
        .order('created_at', { ascending: false });

      const misLeads = allLeads?.filter(l => {
        if (!l.notes) return false;
        const notes = typeof l.notes === 'string' ? JSON.parse(l.notes) : l.notes;
        return notes?.credit_flow_context?.asesor_id === asesorId;
      }).map(l => {
        const notes = typeof l.notes === 'string' ? JSON.parse(l.notes) : l.notes;
        const ctx = notes?.credit_flow_context || {};
        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          status: l.status,
          created_at: l.created_at,
          property_interest: l.property_interest,
          banco_preferido: ctx.banco_preferido,
          ingreso_mensual: ctx.ingreso_mensual,
          enganche: ctx.enganche,
          capacidad_credito: ctx.capacidad_credito,
          modalidad: ctx.modalidad
        };
      }) || [];

      return corsResponse(JSON.stringify({ leads: misLeads, total: misLeads.length }));
    }

    // GET /api/asesor/lead/:id - Ver detalle de un lead
    if (url.pathname.startsWith('/api/asesor/lead/') && request.method === 'GET') {
      const leadId = url.pathname.split('/')[4];
      if (!leadId) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_id' }), 400);
      }

      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const notes = typeof lead.notes === 'string' ? JSON.parse(lead.notes || '{}') : (lead.notes || {});
      const ctx = notes?.credit_flow_context || {};

      return corsResponse(JSON.stringify({
        ...lead,
        credit_context: ctx
      }));
    }

    // PUT /api/asesor/lead/:id - Actualizar lead
    if (url.pathname.startsWith('/api/asesor/lead/') && request.method === 'PUT') {
      const leadId = url.pathname.split('/')[4];
      if (!leadId) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_id' }), 400);
      }

      const body = await request.json() as any;
      const { status, banco_preferido, ingreso_mensual, enganche, notas_asesor } = body;

      // Obtener lead actual
      const { data: lead } = await supabase.client
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      // Actualizar campos
      const updates: any = {};
      if (status) updates.status = status;

      // Actualizar notas si hay campos de crédito
      if (banco_preferido || ingreso_mensual || enganche || notas_asesor) {
        const notes = typeof lead.notes === 'string' ? JSON.parse(lead.notes || '{}') : (lead.notes || {});
        if (!notes.credit_flow_context) notes.credit_flow_context = {};

        if (banco_preferido) notes.credit_flow_context.banco_preferido = banco_preferido;
        if (ingreso_mensual) notes.credit_flow_context.ingreso_mensual = ingreso_mensual;
        if (enganche) notes.credit_flow_context.enganche = enganche;
        if (notas_asesor) notes.credit_flow_context.notas_asesor = notas_asesor;

        updates.notes = notes;
      }

      const { error } = await supabase.client
        .from('leads')
        .update(updates)
        .eq('id', leadId);

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({ ok: true, message: 'Lead actualizado' }));
    }

    // GET /api/asesor/stats?asesor_id=xxx - Estadísticas del asesor
    if (url.pathname === '/api/asesor/stats' && request.method === 'GET') {
      const asesorId = url.searchParams.get('asesor_id');
      if (!asesorId) {
        return corsResponse(JSON.stringify({ error: 'Falta asesor_id' }), 400);
      }

      const { data: allLeads } = await supabase.client
        .from('leads')
        .select('id, status, notes, created_at')
        .not('notes', 'is', null);

      const misLeads = allLeads?.filter(l => {
        const notes = typeof l.notes === 'string' ? JSON.parse(l.notes) : l.notes;
        return notes?.credit_flow_context?.asesor_id === asesorId;
      }) || [];

      const stats = {
        total: misLeads.length,
        por_status: {
          new: misLeads.filter(l => l.status === 'new').length,
          credit_qualified: misLeads.filter(l => l.status === 'credit_qualified').length,
          contacted: misLeads.filter(l => l.status === 'contacted').length,
          documents_pending: misLeads.filter(l => l.status === 'documents_pending').length,
          pre_approved: misLeads.filter(l => l.status === 'pre_approved').length,
          approved: misLeads.filter(l => l.status === 'approved').length,
          rejected: misLeads.filter(l => l.status === 'rejected').length
        },
        conversion_rate: misLeads.length > 0
          ? Math.round((misLeads.filter(l => l.status === 'approved').length / misLeads.length) * 100)
          : 0,
        este_mes: misLeads.filter(l => {
          const created = new Date(l.created_at);
          const now = new Date();
          return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }).length
      };

      return corsResponse(JSON.stringify(stats));
    }

    // POST /api/asesor/mensaje - Enviar mensaje a lead vía Sara
    if (url.pathname === '/api/asesor/mensaje' && request.method === 'POST') {
      const body = await request.json() as any;
      const { asesor_id, lead_id, mensaje } = body;

      if (!asesor_id || !lead_id || !mensaje) {
        return corsResponse(JSON.stringify({ error: 'Faltan campos: asesor_id, lead_id, mensaje' }), 400);
      }

      // Obtener asesor
      const { data: asesor } = await supabase.client
        .from('team_members')
        .select('name')
        .eq('id', asesor_id)
        .single();

      // Obtener lead
      const { data: lead } = await supabase.client
        .from('leads')
        .select('name, phone')
        .eq('id', lead_id)
        .single();

      if (!lead) {
        return corsResponse(JSON.stringify({ error: 'Lead no encontrado' }), 404);
      }

      const nombreAsesor = asesor?.name?.split(' ')[0] || 'Tu asesor';
      const mensajeParaLead = `💬 *Mensaje de tu asesor ${nombreAsesor}:*\n\n"${mensaje}"\n\n_Puedes responder aquí y le haré llegar tu mensaje._`;

      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      await meta.sendWhatsAppMessage(lead.phone.replace(/\D/g, ''), mensajeParaLead);

      return corsResponse(JSON.stringify({ ok: true, message: 'Mensaje enviado' }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Ver citas recientes con estado de Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-citas-recientes') {
      const { data: citas, error: citasError } = await supabase.client
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (citasError) {
        return corsResponse(JSON.stringify({ error: citasError.message }, null, 2), 500);
      }

      return corsResponse(JSON.stringify({
        total: citas?.length || 0,
        citas: citas?.map(c => ({
          lead_name: c.lead_name,
          fecha: c.scheduled_date,
          hora: c.scheduled_time,
          status: c.status,
          google_event: c.google_event_vendedor_id || 'NULL',
          notes: c.notes || 'NULL',
          created_at: c.created_at
        }))
      }, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════
    // FIX: Agregar cita existente a Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/fix-cita-calendar') {
      const leadName = url.searchParams.get('lead_name');
      if (!leadName) {
        return corsResponse(JSON.stringify({ error: 'Falta lead_name' }), 400);
      }

      // Buscar la cita
      const { data: cita, error: citaError } = await supabase.client
        .from('appointments')
        .select('*, leads(name, phone)')
        .eq('lead_name', leadName)
        .is('google_event_vendedor_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (citaError || !cita) {
        return corsResponse(JSON.stringify({ error: 'Cita no encontrada', details: citaError?.message }), 404);
      }

      // Crear evento en Google Calendar
      const fechaEvento = new Date(`${cita.scheduled_date}T${cita.scheduled_time}`);
      const endEvento = new Date(fechaEvento.getTime() + 60 * 60 * 1000);

      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:00`;
      };

      try {
        // Crear instancia local de CalendarService
        const calendarLocal = new CalendarService(
          env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          env.GOOGLE_PRIVATE_KEY,
          env.GOOGLE_CALENDAR_ID
        );

        const eventData = {
          summary: `🏠 Visita - ${cita.lead_name} (${cita.property_name || 'Desarrollo'})`,
          description: `👤 Cliente: ${cita.lead_name}\n📱 Tel: ${cita.lead_phone || 'N/A'}\n🏠 Desarrollo: ${cita.property_name || 'Por definir'}`,
          location: cita.location || cita.property_name || '',
          start: { dateTime: formatDate(fechaEvento), timeZone: 'America/Mexico_City' },
          end: { dateTime: formatDate(endEvento), timeZone: 'America/Mexico_City' }
        };

        const eventResult = await calendarLocal.createEvent(eventData);

        // Actualizar la cita con el google_event_vendedor_id
        await supabase.client
          .from('appointments')
          .update({ google_event_vendedor_id: eventResult.id })
          .eq('id', cita.id);

        return corsResponse(JSON.stringify({
          ok: true,
          message: `Cita de ${cita.lead_name} agregada a Google Calendar`,
          google_event_id: eventResult.id,
          cita_id: cita.id
        }));
      } catch (calError: any) {
        return corsResponse(JSON.stringify({ error: 'Error creando evento', details: calError?.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Diagnóstico de Google Calendar
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/test-calendar') {
      console.log('TEST: Diagnóstico de Google Calendar...');

      const diagnostico: any = {
        timestamp: new Date().toISOString(),
        env_vars: {
          GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'SET (' + env.GOOGLE_SERVICE_ACCOUNT_EMAIL.substring(0, 20) + '...)' : 'NOT SET',
          GOOGLE_PRIVATE_KEY: env.GOOGLE_PRIVATE_KEY ? 'SET (length: ' + env.GOOGLE_PRIVATE_KEY.length + ')' : 'NOT SET',
          GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID ? 'SET (' + env.GOOGLE_CALENDAR_ID + ')' : 'NOT SET'
        }
      };

      if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_CALENDAR_ID) {
        diagnostico.error = 'Faltan variables de entorno de Google Calendar';
        return corsResponse(JSON.stringify(diagnostico, null, 2), 500);
      }

      try {
        const calendar = new CalendarService(
          env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          env.GOOGLE_PRIVATE_KEY,
          env.GOOGLE_CALENDAR_ID
        );

        // Intentar crear un evento de prueba
        const ahora = new Date();
        const enUnaHora = new Date(ahora.getTime() + 60 * 60 * 1000);

        const testEvent = {
          summary: '🧪 TEST - Eliminar este evento',
          description: 'Evento de prueba creado por diagnóstico de SARA',
          start: {
            dateTime: ahora.toISOString(),
            timeZone: 'America/Mexico_City'
          },
          end: {
            dateTime: enUnaHora.toISOString(),
            timeZone: 'America/Mexico_City'
          }
        };

        console.log('📅 Intentando crear evento de prueba...');
        const result = await calendar.createEvent(testEvent);

        diagnostico.success = true;
        diagnostico.event_created = {
          id: result?.id,
          htmlLink: result?.htmlLink,
          status: result?.status
        };

        // Eliminar el evento de prueba
        if (result?.id) {
          try {
            await calendar.deleteEvent(result.id);
            diagnostico.event_deleted = true;
          } catch (delErr) {
            diagnostico.event_deleted = false;
            diagnostico.delete_error = String(delErr);
          }
        }

        return corsResponse(JSON.stringify(diagnostico, null, 2));
      } catch (calError: any) {
        diagnostico.success = false;
        diagnostico.error = String(calError);
        diagnostico.error_message = calError?.message || 'Unknown error';
        console.error('❌ Error Calendar:', calError);
        return corsResponse(JSON.stringify(diagnostico, null, 2), 500);
      }
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

      // Debug info
      const { data: admins } = await supabase.client
        .from('team_members')
        .select('name, phone, role')
        .in('role', ['admin', 'coordinador', 'ceo', 'director'])
        .eq('active', true);

      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

      const { data: hotSinSeguimiento } = await supabase.client
        .from('leads')
        .select('id, name, status, updated_at')
        .in('status', ['negotiation', 'reserved'])
        .lt('updated_at', inicioHoy);

      // Enviar manualmente para debug
      let enviados: string[] = [];
      let errores: string[] = [];

      if (hotSinSeguimiento && hotSinSeguimiento.length > 0) {
        let msg = `🔥 *LEADS HOT SIN SEGUIMIENTO HOY*\n\n`;
        msg += `Total: ${hotSinSeguimiento.length} leads\n\n`;
        for (const lead of hotSinSeguimiento.slice(0, 5)) {
          msg += `• *${lead.name || 'Sin nombre'}* (${lead.status})\n`;
        }
        msg += '\n⚡ _Dar seguimiento urgente._';

        for (const admin of (admins || [])) {
          if (!admin.phone) continue;
          try {
            await meta.sendWhatsAppMessage(admin.phone, msg);
            enviados.push(`${admin.name} (${admin.phone})`);
          } catch (e: any) {
            errores.push(`${admin.name}: ${e.message || e}`);
          }
        }
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Alerta HOT enviada',
        debug: {
          admins_encontrados: admins?.length || 0,
          admins: admins?.map(a => ({ name: a.name, phone: a.phone, role: a.role })) || [],
          leads_hot_sin_seguimiento: hotSinSeguimiento?.length || 0,
          leads: hotSinSeguimiento?.slice(0, 5) || [],
          enviados,
          errores
        }
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Crear lead HOT de prueba
    if (url.pathname === '/test-crear-lead-hot') {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);

      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('id, name')
        .eq('role', 'vendedor')
        .eq('active', true)
        .limit(1)
        .single();

      const { data: newLead, error } = await supabase.client
        .from('leads')
        .insert({
          name: 'Lead HOT Prueba',
          phone: '521999' + Math.floor(Math.random() * 9000000 + 1000000),
          status: 'negotiation',
          source: 'test',
          assigned_to: vendedor?.id || null,
          property_interest: 'Distrito Falco',
          lead_score: 85,
          created_at: ayer.toISOString(),
          updated_at: ayer.toISOString()
        })
        .select()
        .single();

      if (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }

      return corsResponse(JSON.stringify({
        ok: true,
        message: 'Lead HOT creado',
        lead: {
          id: newLead.id,
          name: newLead.name,
          status: newLead.status,
          updated_at: newLead.updated_at,
          assigned_to: vendedor?.name || 'Sin asignar'
        }
      }));
    }

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

    // TEST: Enviar briefing a número específico
    if (url.pathname.startsWith('/test-briefing/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando briefing a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

      // Crear vendedor virtual para el test
      const vendedorTest = {
        id: 'test',
        name: 'Usuario',
        phone: phone?.startsWith('52') ? phone : '52' + phone,
        role: 'vendedor',
        recibe_briefing: true,
        last_briefing_sent: null
      };

      await enviarBriefingMatutino(supabase, meta, vendedorTest);
      return corsResponse(JSON.stringify({ ok: true, message: `Briefing enviado a ${vendedorTest.phone}` }));
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST: Alerta 2pm a número específico
    if (url.pathname.startsWith('/test-alerta-2pm/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando alerta 2pm a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const mexicoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const hoyInicio = new Date(mexicoNow);
      hoyInicio.setHours(0, 0, 0, 0);

      const { data: leadsUrgentes } = await supabase.client
        .from('leads')
        .select('id, name, status, score')
        .in('status', ['new', 'contacted', 'scheduled', 'negotiation'])
        .or(`last_interaction.is.null,last_interaction.lt.${hoyInicio.toISOString()}`)
        .order('score', { ascending: false })
        .limit(10);

      let msg = `⚡ *ALERTA 2PM - TEST*\n\n`;

      if (!leadsUrgentes || leadsUrgentes.length === 0) {
        msg += `✅ No hay leads urgentes pendientes.\n\nTodos los leads han sido contactados hoy.`;
      } else {
        msg += `Hay *${leadsUrgentes.length} leads* que necesitan atención:\n\n`;
        for (const lead of leadsUrgentes.slice(0, 5)) {
          const leadNombre = lead.name?.split(' ')[0] || 'Sin nombre';
          const esNuevo = lead.status === 'new';
          msg += `${esNuevo ? '🆕' : '🔥'} *${leadNombre}* - ${esNuevo ? 'Sin contactar' : lead.status}\n`;
        }
        if (leadsUrgentes.length > 5) {
          msg += `\n...y ${leadsUrgentes.length - 5} más\n`;
        }
        msg += '\n💡 _Los leads contactados rápido tienen 9x más probabilidad de cerrar_';
      }

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Alerta 2pm enviada a ${phoneFormatted}`, leads: leadsUrgentes?.length || 0 }));
    }

    // TEST: Alerta 5pm a número específico
    if (url.pathname.startsWith('/test-alerta-5pm/')) {
      const phone = url.pathname.split('/').pop();
      console.log(`TEST: Enviando alerta 5pm a ${phone}...`);
      const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
      const phoneFormatted = phone?.startsWith('52') ? phone : '52' + phone;

      const mexicoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const hoyInicio = new Date(mexicoNow);
      hoyInicio.setHours(0, 0, 0, 0);

      const { data: leadsPendientes } = await supabase.client
        .from('leads')
        .select('id, name, status, score')
        .in('status', ['new', 'contacted', 'scheduled', 'negotiation'])
        .or(`last_interaction.is.null,last_interaction.lt.${hoyInicio.toISOString()}`)
        .order('score', { ascending: false })
        .limit(10);

      const manana = new Date(mexicoNow);
      manana.setDate(manana.getDate() + 1);
      manana.setHours(0, 0, 0, 0);
      const mananaFin = new Date(manana);
      mananaFin.setHours(23, 59, 59, 999);

      const { data: citasManana } = await supabase.client
        .from('appointments')
        .select('id, date')
        .eq('status', 'scheduled')
        .gte('date', manana.toISOString())
        .lt('date', mananaFin.toISOString());

      const pendientes = leadsPendientes?.length || 0;
      const citas = citasManana?.length || 0;

      let msg = `🌅 *RESUMEN DEL DÍA - TEST*\n\n`;

      if (pendientes > 0) {
        const leadsMasUrgentes = leadsPendientes?.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
        msg += `📋 *${pendientes} leads* pendientes de contactar:\n`;
        for (const lead of leadsMasUrgentes || []) {
          msg += `  • ${lead.name?.split(' ')[0] || 'Lead'} (${lead.status})\n`;
        }
        msg += '\n';
      } else {
        msg += `✅ Todos los leads fueron contactados hoy\n\n`;
      }

      if (citas > 0) {
        msg += `📅 *${citas} citas* programadas para mañana\n\n`;
      }

      msg += pendientes > 3
        ? '⚠️ _Aún tienes tiempo de hacer llamadas antes de cerrar el día_'
        : '✨ _¡Buen trabajo hoy! Descansa bien_';

      await meta.sendWhatsAppMessage(phoneFormatted!, msg);
      return corsResponse(JSON.stringify({ ok: true, message: `Alerta 5pm enviada a ${phoneFormatted}`, pendientes, citas }));
    }

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
        { name: '📋 BRIEFING CONSOLIDADO', hora: '8:00', dias: 'L-V', desc: 'Citas + Leads pendientes + Hipotecas + Cumples + Promos' },
        { name: 'Reporte diario CEO', hora: '8:00', dias: 'L-V' },
        { name: 'Reporte semanal CEO', hora: '8:00', dias: 'Lunes' },
        { name: 'Reporte mensual CEO', hora: '8:00', dias: 'Dia 1' },
        { name: 'Alertas proactivas CEO', hora: '8:00', dias: 'L-V' },
        { name: 'Felicitaciones cumple', hora: '9:00', dias: 'Diario' },
        { name: 'Video semanal', hora: '18:00', dias: 'Viernes' },
        { name: 'Recap diario', hora: '19:00', dias: 'L-V' },
        { name: 'Recap semanal', hora: '12:00', dias: 'Sabado' },
        { name: 'Recordatorios citas', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Follow-ups automáticos', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Videos pendientes', hora: 'c/2min', dias: 'Siempre' },
        { name: 'Remarketing fríos', hora: '8:00', dias: 'Miércoles' },
        { name: 'Seguimiento hipotecas', hora: '8:00', dias: 'Mar/Jue' },
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

    // Solo ejecutar tareas horarias en el minuto exacto (evita duplicados)
    const isFirstRunOfHour = mexicoMinute === 0;

    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`🕐 CRON EJECUTADO`);
    console.log(`   UTC: ${now.toISOString()}`);
    console.log(`   México: ${mexicoHour}:${mexicoMinute.toString().padStart(2, '0')} (${mexicoWeekday})`);
    console.log(`   Día semana: ${dayOfWeek} (0=Dom, 1=Lun...)`);
    console.log(`   isFirstRunOfHour: ${isFirstRunOfHour}`);
    console.log(`   Cron trigger: ${event.cron}`);
    console.log(`═══════════════════════════════════════════════════════════`);

    // Log CRON execution (solo cada hora para no saturar)
    if (isFirstRunOfHour) {
      await logEvento(supabase, 'cron', `CRON horario: ${mexicoHour}:00 (${mexicoWeekday})`, { hora: mexicoHour, dia: dayOfWeek });
    }

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
        console.log(`   - ${v.name} (${v.role}): phone=${v.phone ? '✅' : '❌'}, recibe_briefing=${v.recibe_briefing ? '✅' : '❌'}, last_briefing=${v.last_briefing_sent || 'nunca'}`);
      });
    }

    // ═══════════════════════════════════════════════════════════
    // REASIGNAR LEADS SIN VENDEDOR - Cada 2 minutos
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '*/2 * * * *') {
      console.log('🔍 Buscando leads sin vendedor asignado...');
      try {
        // Buscar leads con assigned_to = null creados en las últimas 24h
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: leadsSinVendedor, error: lsvError } = await supabase.client
          .from('leads')
          .select('id, name, phone, property_interest, created_at')
          .is('assigned_to', null)
          .gte('created_at', hace24h)
          .limit(10);

        if (lsvError) {
          console.error('❌ Error buscando leads sin vendedor:', lsvError);
        } else if (leadsSinVendedor && leadsSinVendedor.length > 0) {
          console.log(`🚨 ENCONTRADOS ${leadsSinVendedor.length} leads SIN VENDEDOR:`);

          for (const lead of leadsSinVendedor) {
            console.log(`   - ${lead.name || 'Sin nombre'} (${lead.phone}) - ${lead.property_interest || 'Sin desarrollo'}`);

            // Intentar asignar vendedor
            const vendedorDisponible = getAvailableVendor(vendedores || []);
            if (vendedorDisponible) {
              const { error: updateError } = await supabase.client
                .from('leads')
                .update({
                  assigned_to: vendedorDisponible.id,
                  notes: {
                    reasignado_automaticamente: true,
                    reasignado_at: new Date().toISOString(),
                    reasignado_a: vendedorDisponible.name
                  }
                })
                .eq('id', lead.id);

              if (!updateError) {
                console.log(`   ✅ REASIGNADO a ${vendedorDisponible.name}`);

                // Notificar al vendedor
                if (vendedorDisponible.phone) {
                  try {
                    await meta.sendWhatsAppMessage(vendedorDisponible.phone,
                      `🚨 *LEAD REASIGNADO*\n\n` +
                      `Se te asignó un lead que estaba sin vendedor:\n\n` +
                      `👤 *${lead.name || 'Sin nombre'}*\n` +
                      `📱 ${lead.phone}\n` +
                      `🏠 ${lead.property_interest || 'Sin desarrollo definido'}\n\n` +
                      `⚠️ Este lead estuvo sin atención, contáctalo lo antes posible.\n\n` +
                      `Escribe *leads* para ver tu lista completa.`
                    );
                    console.log(`   📤 Notificación enviada a ${vendedorDisponible.name}`);
                  } catch (notifError) {
                    console.log(`   ⚠️ Error enviando notificación:`, notifError);
                  }
                }
              } else {
                console.log(`   ❌ Error reasignando:`, updateError);
              }
            } else {
              console.log(`   ⚠️ No hay vendedor disponible para reasignar`);
            }
          }
        } else {
          console.log('✅ No hay leads sin vendedor en las últimas 24h');
        }
      } catch (e) {
        console.error('❌ Error en reasignación de leads:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ACTUALIZACIÓN DE PRECIOS - 1ero de cada mes a la 1am México (7am UTC)
    // Incremento: 0.5% mensual (6% anual)
    // ═══════════════════════════════════════════════════════════
    if (event.cron === '0 7 1 * *') {
      console.log('💰 ACTUALIZANDO PRECIOS MENSUALES (+0.5%)...');
      try {
        // Obtener todas las propiedades con precios
        const { data: properties, error: propsError } = await supabase.client
          .from('properties')
          .select('id, name, price_from, price_to');

        if (propsError) {
          console.error('❌ Error obteniendo properties:', propsError);
        } else if (properties && properties.length > 0) {
          const factor = 1.005; // 0.5% de incremento
          let actualizadas = 0;

          for (const prop of properties) {
            const newPriceFrom = prop.price_from ? Math.round(prop.price_from * factor) : null;
            const newPriceTo = prop.price_to ? Math.round(prop.price_to * factor) : null;

            const { error: updateError } = await supabase.client
              .from('properties')
              .update({
                price_from: newPriceFrom,
                price_to: newPriceTo,
                updated_at: new Date().toISOString()
              })
              .eq('id', prop.id);

            if (!updateError) {
              actualizadas++;
              console.log(`   ✅ ${prop.name}: $${prop.price_from?.toLocaleString()} → $${newPriceFrom?.toLocaleString()}`);
            } else {
              console.log(`   ❌ Error actualizando ${prop.name}:`, updateError);
            }
          }

          console.log(`💰 PRECIOS ACTUALIZADOS: ${actualizadas}/${properties.length} propiedades`);

          // Notificar al CEO
          try {
            await meta.sendWhatsAppMessage('5212224558475',
              `💰 *PRECIOS ACTUALIZADOS*\n\n` +
              `Se aplicó el incremento mensual del 0.5%\n` +
              `📊 ${actualizadas} propiedades actualizadas\n\n` +
              `_Incremento anual: 6%_`
            );
          } catch (e) {
            console.log('⚠️ No se pudo notificar al CEO sobre precios');
          }
        } else {
          console.log('⚠️ No hay propiedades para actualizar');
        }
      } catch (e) {
        console.error('❌ Error en actualización de precios:', e);
      }
    }

    // (Cumpleaños movido más abajo para incluir leads + equipo)

    // ═══════════════════════════════════════════════════════════
    // 🎓 ONE-TIME: Reset onboarding 23-ene-2026 7:56am (antes del briefing)
    // Para que todos los vendedores vean el tutorial de SARA
    // ═══════════════════════════════════════════════════════════
    const fechaHoy = now.toISOString().split('T')[0];
    if (fechaHoy === '2026-01-23' && mexicoHour === 7 && mexicoMinute >= 54 && mexicoMinute <= 58) {
      console.log('🎓 ONE-TIME: Reseteando onboarding de todos los vendedores...');
      try {
        const { data: todosVendedores } = await supabase.client
          .from('team_members')
          .select('id, name, notes')
          .eq('active', true);

        let reseteados = 0;
        for (const v of todosVendedores || []) {
          const notas = typeof v.notes === 'string' ? JSON.parse(v.notes || '{}') : (v.notes || {});
          if (notas.onboarding_completed) {
            delete notas.onboarding_completed;
            delete notas.onboarding_date;
            await supabase.client.from('team_members').update({ notes: notas }).eq('id', v.id);
            reseteados++;
            console.log(`   ✅ Reset onboarding: ${v.name}`);
          }
        }
        console.log(`🎓 ONBOARDING RESET COMPLETADO: ${reseteados} vendedores`);

        // Notificar al admin
        await meta.sendWhatsAppMessage('5212224558475',
          `🎓 *ONBOARDING RESET*\n\n` +
          `Se reseteó el tutorial de ${reseteados} vendedores.\n\n` +
          `La próxima vez que escriban a SARA, verán el tutorial completo con comandos.`
        );
      } catch (e) {
        console.error('❌ Error reseteando onboarding:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7:55am L-V: REACTIVAR VENTANAS 24H - Enviar templates a quienes no han
    // interactuado en 24h para que les lleguen los briefings
    // ═══════════════════════════════════════════════════════════════════════════
    if (mexicoHour === 7 && mexicoMinute >= 55 && mexicoMinute <= 59 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🔄 REACTIVACIÓN 24H - Checando ventanas de WhatsApp...');
      try {
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const hoyReactivacion = new Date().toISOString().split('T')[0];

        // Obtener team members activos que reciben briefings
        const { data: miembros } = await supabase.client
          .from('team_members')
          .select('id, name, phone, notes')
          .eq('active', true)
          .eq('recibe_briefing', true);

        let reactivados = 0;
        for (const m of miembros || []) {
          if (!m.phone) continue;

          const notas = typeof m.notes === 'object' ? m.notes : {};
          const lastInteraction = notas?.last_sara_interaction;
          const yaReactivadoHoy = notas?.reactivacion_enviada === hoyReactivacion;

          // Si nunca ha interactuado O hace más de 24h Y no se le reactivó hoy
          const necesitaReactivar = (!lastInteraction || lastInteraction < hace24h) && !yaReactivadoHoy;

          if (necesitaReactivar) {
            console.log(`   📤 Reactivando ventana para ${m.name}...`);
            try {
              // Enviar template de reactivación
              const response = await fetch(`https://sara-backend.edson-633.workers.dev/send-template?phone=${m.phone}&template=reactivar_equipo&nombre=${encodeURIComponent(m.name.split(' ')[0])}`);

              if (response.ok) {
                // Marcar como reactivado hoy para no repetir
                const updatedNotes = { ...notas, reactivacion_enviada: hoyReactivacion };
                await supabase.client
                  .from('team_members')
                  .update({ notes: updatedNotes })
                  .eq('id', m.id);
                reactivados++;
                console.log(`   ✅ ${m.name} reactivado`);
              }
            } catch (e) {
              console.log(`   ⚠️ Error reactivando ${m.name}:`, e);
            }
          }
        }

        if (reactivados > 0) {
          console.log(`🔄 REACTIVACIÓN COMPLETADA: ${reactivados} ventanas reactivadas`);
          await logEvento(supabase, 'reactivacion_24h', `Reactivadas ${reactivados} ventanas de WhatsApp`, { reactivados });
        } else {
          console.log('✅ REACTIVACIÓN - Todos dentro de ventana 24h');
        }
      } catch (e) {
        console.error('❌ Error en reactivación 24h:', e);
      }
    }

    // 8am L-V: Briefing matutino (solo primer ejecucion de la hora)
    console.log(`📋 BRIEFING CHECK: hora=${mexicoHour}===8? ${mexicoHour === 8}, isFirst=${isFirstRunOfHour}, dia=${dayOfWeek} (1-5)? ${dayOfWeek >= 1 && dayOfWeek <= 5}, vendedores=${!!vendedores}`);
    // 8am-8:30am L-V: Briefing matutino (procesa en lotes para evitar timeout)
    const hoyStrBriefing = new Date().toISOString().split('T')[0];
    if (mexicoHour === 8 && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      // Filtrar solo los que NO han recibido briefing hoy
      const pendientes = vendedores.filter((v: any) =>
        v.phone && v.recibe_briefing && v.last_briefing_sent !== hoyStrBriefing
      );

      if (pendientes.length > 0) {
        console.log(`✅ BRIEFING - ${pendientes.length} vendedores pendientes de ${vendedores.length} totales`);

        // Procesar máximo 5 por CRON para evitar timeout
        const BATCH_SIZE = 5;
        const lote = pendientes.slice(0, BATCH_SIZE);
        let enviados = 0;

        for (const v of lote) {
          console.log(`   📤 Enviando briefing a ${v.name} (${v.phone})...`);
          try {
            await enviarBriefingMatutino(supabase, meta, v);
            enviados++;
          } catch (err) {
            console.error(`   ❌ Error enviando briefing a ${v.name}:`, err);
          }
        }

        const restantes = pendientes.length - enviados;
        console.log(`📊 BRIEFING RESULTADO: ${enviados} enviados, ${restantes > 0 ? restantes + ' pendientes para siguiente CRON' : 'todos completados'}`);
        await logEvento(supabase, 'briefing', `Briefing matutino: ${enviados} enviados, ${restantes} pendientes`, { enviados, restantes, total: vendedores.length });
      } else {
        console.log(`✅ BRIEFING - Todos los ${vendedores.length} vendedores ya recibieron su briefing hoy`);
      }
    } else if (mexicoHour !== 8) {
      console.log(`⏭️ BRIEFING NO EJECUTADO - hora=${mexicoHour} (solo a las 8am)`);
    }

    // 8am L-V: Briefing de supervisión para admins
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('👁️ Enviando briefing de supervisión a admins...');
      await enviarBriefingSupervision(supabase, meta);
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

    // 9am LUNES: Reporte semanal individual a vendedores
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📊 Enviando reportes semanales a vendedores...');
      await enviarReporteSemanalVendedores(supabase, meta);
    }

    // 9am LUNES: Reporte semanal individual a asesores hipotecarios
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📊 Enviando reportes semanales a asesores...');
      await enviarReporteSemanalAsesores(supabase, meta);
    }

    // 9am LUNES: Reporte semanal marketing
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek === 1) {
      console.log('📊 Enviando reporte semanal a marketing...');
      await enviarReporteSemanalMarketing(supabase, meta);
    }

    // 10am MARTES: Coaching automático personalizado a vendedores
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 2) {
      console.log('🎓 Enviando coaching personalizado a vendedores...');
      const coachingService = new IACoachingService(supabase, meta);
      await coachingService.enviarCoachingEquipo(7); // Solo si no recibió en 7 días
    }

    // 8am DÍA 1 DE CADA MES: Reporte mensual CEO/Admin
    if (mexicoHour === 8 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reporte mensual a CEO...');
      await enviarReporteMensualCEO(supabase, meta);
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual individual a vendedores
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reportes mensuales a vendedores...');
      await enviarReporteMensualVendedores(supabase, meta);
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual individual a asesores hipotecarios
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reportes mensuales a asesores...');
      await enviarReporteMensualAsesores(supabase, meta);
    }

    // 9am DÍA 1 DE CADA MES: Reporte mensual marketing
    if (mexicoHour === 9 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('📊 Enviando reporte mensual a marketing...');
      await enviarReporteMensualMarketing(supabase, meta);
    }

    // 12:01am DÍA 1 DE CADA MES: Aplicar nuevos precios programados
    if (mexicoHour === 0 && isFirstRunOfHour && now.getUTCDate() === 1) {
      console.log('💰 Aplicando precios programados del mes...');
      await aplicarPreciosProgramados(supabase, meta);
    }

    // ═══════════════════════════════════════════════════════════════
    // 9am L-V: REACTIVAR EQUIPO - Enviar template a quienes no han interactuado en 24h
    // ═══════════════════════════════════════════════════════════════
    if (mexicoHour === 9 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log('🔄 Verificando equipo para reactivación...');
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      let reactivados = 0;

      for (const v of vendedores) {
        if (!v.phone || !v.active) continue;

        // Verificar si no ha interactuado en 24h
        const ultimaInteraccion = v.last_sara_interaction;
        const necesitaReactivar = !ultimaInteraccion || ultimaInteraccion < hace24h;

        if (necesitaReactivar) {
          console.log(`   📤 Reactivando a ${v.name} (última: ${ultimaInteraccion || 'nunca'})`);
          try {
            // Enviar template de reactivación
            await meta.sendTemplate(v.phone, 'reactivar_equipo', 'es_MX', [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: v.name?.split(' ')[0] || 'Equipo' }
                ]
              }
            ]);
            reactivados++;

            // Marcar que se envió template (para no repetir)
            await supabase.client
              .from('team_members')
              .update({ last_sara_interaction: new Date().toISOString() })
              .eq('id', v.id);

          } catch (err) {
            console.log(`   ⚠️ Error reactivando ${v.name}:`, err);
          }
        }
      }
      console.log(`🔄 REACTIVACIÓN: ${reactivados} miembros reactivados`);
    }

    // 7pm L-V: Recap del dia (solo primer ejecucion de la hora)
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5 && vendedores) {
      console.log('Enviando recap del dia...');
      let recapEnviados = 0;
      for (const v of vendedores) {
        if (!v.phone || !v.recibe_recap) continue;
        await enviarRecapDiario(supabase, meta, v);
        recapEnviados++;
      }
      await logEvento(supabase, 'recap', `Recap diario: ${recapEnviados} enviados`, { enviados: recapEnviados });
    }

    // 7pm L-V: Reporte diario individual a vendedores
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reportes diarios a vendedores...');
      await enviarReporteDiarioVendedores(supabase, meta);
    }

    // 7pm L-V: Reporte diario individual a asesores hipotecarios
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reportes diarios a asesores...');
      await enviarReporteDiarioAsesores(supabase, meta);
    }

    // 10am L-V: Alertas de leads fríos (vendedores, asesores, CEO)
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🥶 Enviando alertas de leads fríos...');
      await enviarAlertasLeadsFrios(supabase, meta);
    }

    // 7pm L-V: Reporte diario marketing
    if (mexicoHour === 19 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Enviando reporte diario a marketing...');
      await enviarReporteDiarioMarketing(supabase, meta);
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

    // ═══════════════════════════════════════════════════════════
    // SISTEMA CENTRALIZADO DE NOTIFICACIONES
    // ═══════════════════════════════════════════════════════════
    const notificationService = new NotificationService(supabase, meta);

    // RECORDATORIOS DE CITAS - cada ejecución del cron (24h y 2h antes)
    // ✅ FIX 14-ENE-2026: Verificar consistencia ANTES de enviar mensajes
    console.log('🔄 Verificando consistencia calendario...');
    await verificarConsistenciaCalendario(supabase, env);

    console.log('🔔 Verificando recordatorios de citas...');
    const recordatoriosResult = await notificationService.enviarRecordatoriosCitas();
    if (recordatoriosResult.enviados > 0) {
      console.log(`✅ ${recordatoriosResult.enviados} recordatorios enviados`);
    }

    // ENCUESTAS POST-CITA - cada ejecución (2-24h después de cita completada)
    console.log('📋 Verificando encuestas post-cita...');
    const encuestasResult = await notificationService.enviarEncuestasPostCita();
    if (encuestasResult.enviados > 0) {
      console.log(`✅ ${encuestasResult.enviados} encuestas enviadas`);
    }

    // FOLLOW-UP POST-CITA - día siguiente de cita completada
    console.log('📧 Verificando follow-ups post-cita...');
    const followupPostCitaResult = await notificationService.enviarFollowupPostCita();
    if (followupPostCitaResult.enviados > 0) {
      console.log(`✅ ${followupPostCitaResult.enviados} follow-ups post-cita enviados`);
      await logEvento(supabase, 'followup', `Follow-ups post-cita: ${followupPostCitaResult.enviados} enviados`, { enviados: followupPostCitaResult.enviados });
    }

    // NO-SHOWS - detectar citas donde no se presentó el lead (cada 2 min)
    console.log('👻 Verificando no-shows...');
    await detectarNoShows(supabase, meta);

    // TIMEOUT VENDEDOR - si no responde en 2hrs, enviar encuesta al lead
    console.log('⏰ Verificando timeouts de confirmación...');
    await verificarTimeoutConfirmaciones(supabase, meta);

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

    // ═══════════════════════════════════════════════════════════
    // FOLLOW-UPS CON APROBACIÓN - Sistema de aprobación por vendedor
    // ═══════════════════════════════════════════════════════════
    const approvalService = new FollowupApprovalService(supabase);

    // Enviar propuestas pendientes a vendedores (cada ejecución)
    console.log('📋 Enviando propuestas de follow-up a vendedores...');
    await approvalService.enviarPropuestasPendientes(async (phone, message) => {
      try {
        await meta.sendWhatsAppMessage(phone, message);
        return true;
      } catch (e) {
        console.log('Error enviando propuesta:', e);
        return false;
      }
    });

    // Expirar aprobaciones viejas (cada ejecución)
    await approvalService.expirarAprobacionesViejas();

    // 10am L-V: Pedir status a vendedores sobre leads estancados
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Pidiendo status a vendedores sobre leads estancados...');
      await approvalService.pedirStatusLeadsEstancados(async (phone, message) => {
        try {
          await meta.sendWhatsAppMessage(phone, message);
          return true;
        } catch (e) {
          console.log('Error pidiendo status:', e);
          return false;
        }
      });
    }

    // ENCUESTAS AUTOMÁTICAS - cada hora verifica citas completadas hace 2h
    console.log('📋 Verificando encuestas post-cita pendientes...');
    await enviarEncuestasPostCita(supabase, meta);

    // ENCUESTAS NPS - 10am L-V, 7 días después del cierre
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📊 Verificando encuestas NPS pendientes...');
      await enviarEncuestasNPS(supabase, meta);
    }

    // ═══════════════════════════════════════════════════════════
    // NOTA: Las siguientes tareas ahora están CONSOLIDADAS en el
    // briefing matutino de las 8am:
    // - Alertas de leads estancados
    // - Recordatorios a asesores hipotecarios
    // - Cumpleaños del día
    // - Promociones activas
    //
    // Esto evita "notification fatigue" y consolida toda la info
    // relevante en UN solo mensaje matutino.
    // ═══════════════════════════════════════════════════════════

    // 8am L-V: Alertas proactivas CEO (situaciones críticas) - JUNTO CON BRIEFING
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🚨 Verificando alertas proactivas CEO...');
      await enviarAlertasProactivasCEO(supabase, meta);
    }

    // MIÉRCOLES 8am: Remarketing leads fríos
    if (mexicoHour === 8 && isFirstRunOfHour && dayOfWeek === 3) {
      console.log('📣 Ejecutando remarketing leads fríos...');
      await remarketingLeadsFrios(supabase, meta);
    }

    // PRIMER LUNES DEL MES 10am: Reactivación de leads perdidos
    const dayOfMonth = new Date().getDate();
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 1 && dayOfMonth <= 7) {
      console.log('🔄 Ejecutando reactivación de leads perdidos...');
      await reactivarLeadsPerdidos(supabase, meta);
    }

    // 9am DIARIO (TODOS LOS DÍAS): Felicitaciones de cumpleaños (leads + equipo)
    if (mexicoHour === 9 && isFirstRunOfHour) {
      console.log('🎂 Enviando felicitaciones de cumpleaños...');
      await felicitarCumpleañosLeads(supabase, meta);
      await felicitarCumpleañosEquipo(supabase, meta);
      // Aniversarios solo L-V
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        console.log('🏠 Verificando aniversarios de compra...');
        await felicitarAniversarioCompra(supabase, meta);
      }
    }

    // 11am L-V: Follow-up automático a leads inactivos (3+ días sin responder)
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📬 Ejecutando follow-up de leads inactivos...');
      await followUpLeadsInactivos(supabase, meta);
    }

    // 10am DIARIO: Recordatorios de pago de apartados (5 días antes, 1 día antes, día del pago)
    if (mexicoHour === 10 && isFirstRunOfHour) {
      console.log('💰 Verificando recordatorios de pago de apartados...');
      await recordatoriosPagoApartado(supabase, meta);
    }

    // 2pm L-V: Alerta leads HOT sin contactar hoy
    if (mexicoHour === 14 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🔥 Verificando leads HOT sin contactar hoy...');
      await alertaLeadsHotUrgentes(supabase, meta);
    }

    // 5pm L-V: Recordatorio final del día - pendientes críticos
    if (mexicoHour === 17 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('⏰ Enviando recordatorio final del día...');
      await recordatorioFinalDia(supabase, meta);
    }

    // 11am y 3pm L-V: Alerta de inactividad de vendedores a admins
    if (isFirstRunOfHour && (mexicoHour === 11 || mexicoHour === 15) && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('👔 Verificando inactividad de vendedores...');
      await alertaInactividadVendedor(supabase, meta);
    }

    // MARTES y JUEVES 8am: Seguimiento hipotecas estancadas (alerta adicional a asesores)
    if (mexicoHour === 8 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      console.log('🏦 Verificando hipotecas estancadas...');
      await seguimientoHipotecas(supabase, meta);
    }

    // RE-ENGAGEMENT AUTOMÁTICO: Cada hora de 9am a 7pm L-V
    // Envía mensajes a leads que no han respondido en 48h+
    if (isFirstRunOfHour && mexicoHour >= 9 && mexicoHour <= 19 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🔄 Verificando leads para re-engagement...');
      await verificarReengagement(supabase, meta);
    }

    // LEADS FRÍOS - Secuencia de mensajes directos al lead
    // 11am y 5pm L-S: Día 3, Día 7, Día 14
    if (isFirstRunOfHour && (mexicoHour === 11 || mexicoHour === 17) && dayOfWeek >= 1 && dayOfWeek <= 6) {
      console.log('❄️ Verificando leads fríos para re-engagement directo...');
      await reengagementDirectoLeads(supabase, meta);
    }

    // SEGUIMIENTO POST-VENTA: 10am diario
    // Mensajes a clientes que compraron: 30 días (cómo estás), 60 días (referidos), 90 días (recordatorio)
    if (mexicoHour === 10 && isFirstRunOfHour) {
      console.log('🎉 Verificando seguimiento post-venta...');
      await seguimientoPostVenta(supabase, meta);
    }

    // CUMPLEAÑOS: 9am diario
    // Enviar felicitación a leads/clientes que cumplen años hoy
    if (mexicoHour === 9 && isFirstRunOfHour) {
      console.log('🎂 Verificando cumpleaños del día...');
      await enviarFelicitacionesCumple(supabase, meta);
    }

    // SEGUIMIENTO CRÉDITO: 12pm L-V
    // Leads que necesitan crédito pero no han avanzado
    if (mexicoHour === 12 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🏦 Verificando seguimiento de crédito...');
      await seguimientoCredito(supabase, meta);
    }

    // FOLLOW-UP 24H LEADS NUEVOS: 10am y 4pm L-V
    // Leads status='new' que no han respondido en 24h (usa campo alerta_enviada_24h)
    if (isFirstRunOfHour && (mexicoHour === 10 || mexicoHour === 16) && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('⏰ Verificando leads nuevos sin respuesta 24h...');
      await followUp24hLeadsNuevos(supabase, meta);
    }

    // REMINDER DOCS CRÉDITO: 11am L-V
    // Leads con credit_status='docs_requested' por 3+ días sin avanzar
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📄 Verificando leads pendientes de documentos...');
      await reminderDocumentosCredito(supabase, meta);
    }

    // VIDEO FELICITACIÓN POST-VENTA: 10am diario
    // Genera video personalizado Veo 3 para leads que acaban de comprar (status='sold')
    if (mexicoHour === 10 && isFirstRunOfHour) {
      console.log('🎬 Verificando nuevas ventas para video felicitación...');
      await videoFelicitacionPostVenta(supabase, meta, env);
    }

    // VIDEO BIENVENIDA LEADS NUEVOS: cada 2 horas en horario laboral (8am-8pm)
    // Genera video personalizado Veo 3 para leads que acaban de entrar al sistema
    if (isFirstRunOfHour && mexicoHour >= 8 && mexicoHour <= 20 && mexicoHour % 2 === 0) {
      console.log('🎬 Verificando leads nuevos para video de bienvenida...');
      await videoBienvenidaLeadNuevo(supabase, meta, env);
    }

    // RECUPERACIÓN ABANDONOS CRÉDITO: 3pm L-V
    // Re-engagement para leads que empezaron proceso de crédito pero no continuaron
    if (mexicoHour === 15 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('🏦 Verificando abandonos de crédito para recuperación...');
      await recuperarAbandonosCredito(supabase, meta);
    }

    // LEAD SCORING AUTOMÁTICO: cada 2 horas en horario laboral
    // Actualiza scores de leads basado en comportamiento y señales
    if (isFirstRunOfHour && mexicoHour >= 8 && mexicoHour <= 20 && mexicoHour % 2 === 0) {
      console.log('📊 Actualizando lead scores...');
      await actualizarLeadScores(supabase);
    }

    // FOLLOW-UP POST-VISITA: 4pm L-V
    // Re-engagement para leads que visitaron pero no avanzaron
    if (mexicoHour === 16 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('📍 Verificando leads post-visita para follow-up...');
      await followUpPostVisita(supabase, meta);
    }

    // NURTURING EDUCATIVO: Martes y Jueves 11am
    // Contenido educativo sobre crédito y compra de casa
    if (mexicoHour === 11 && isFirstRunOfHour && (dayOfWeek === 2 || dayOfWeek === 4)) {
      console.log('📚 Enviando nurturing educativo...');
      await nurturingEducativo(supabase, meta);
    }

    // PROGRAMA DE REFERIDOS: Miércoles 11am
    // Solicitar referidos a clientes satisfechos (30-90 días post-venta)
    if (mexicoHour === 11 && isFirstRunOfHour && dayOfWeek === 3) {
      console.log('🤝 Solicitando referidos a clientes...');
      await solicitarReferidos(supabase, meta);
    }

    // ENCUESTAS NPS: Viernes 10am
    // Medir satisfacción de clientes post-visita y post-venta
    if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek === 5) {
      console.log('📊 Enviando encuestas NPS...');
      await enviarEncuestaNPS(supabase, meta);
    }

    // ═══════════════════════════════════════════════════════════
    // BRIDGES - Verificar bridges por expirar (cada 2 min)
    // ═══════════════════════════════════════════════════════════
    console.log('🔗 Verificando bridges por expirar...');
    await verificarBridgesPorExpirar(supabase, meta);

    // ═══════════════════════════════════════════════════════════
    // BROADCAST QUEUE - Procesar broadcasts encolados (cada 2 min)
    // ═══════════════════════════════════════════════════════════
    console.log('📤 Procesando broadcasts encolados...');
    await procesarBroadcastQueue(supabase, meta);
  },
};

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// VERIFICAR BRIDGES POR EXPIRAR
// ═══════════════════════════════════════════════════════════
async function verificarBridgesPorExpirar(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: miembros } = await supabase.client
      .from('team_members')
      .select('id, name, phone, notes')
      .eq('active', true);

    if (!miembros) return;

    const ahora = new Date();
    let advertidos = 0;

    for (const miembro of miembros) {
      if (!miembro.notes || !miembro.phone) continue;

      let notes: any = {};
      try {
        notes = typeof miembro.notes === 'string' ? JSON.parse(miembro.notes) : miembro.notes;
      } catch { continue; }

      const bridge = notes.active_bridge;
      if (!bridge || !bridge.expires_at) continue;

      const expiraEn = new Date(bridge.expires_at);
      const minutosRestantes = (expiraEn.getTime() - ahora.getTime()) / (1000 * 60);

      if (minutosRestantes > 0.5 && minutosRestantes <= 2 && !bridge.warning_sent) {
        const phoneLimpio = miembro.phone.replace(/\D/g, '');
        const leadName = bridge.lead_name || 'el lead';

        // Mensaje al vendedor - incluir comando para extender
        await meta.sendWhatsAppMessage(phoneLimpio,
          '⏰ Por terminar con ' + leadName + '\n\n' +
          '*#mas* = 6 min más\n' +
          '*#cerrar* = terminar'
        );

        // Mensaje al lead - simple, sin tecnicismos
        if (bridge.lead_phone) {
          await meta.sendWhatsAppMessage(bridge.lead_phone,
            '¿Algo más en lo que pueda ayudarte? 🏠'
          );
        }

        notes.active_bridge.warning_sent = true;
        await supabase.client
          .from('team_members')
          .update({ notes })
          .eq('id', miembro.id);

        advertidos++;
        console.log('⏰ Advertencia bridge: ' + miembro.name + ' ↔ ' + leadName);
      }
    }

    console.log(advertidos > 0 ? '🔗 Bridges advertidos: ' + advertidos : '🔗 No hay bridges por expirar');
  } catch (e) {
    console.error('❌ Error verificando bridges:', e);
  }
}

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
      .select('*, team_members:assigned_to(name, phone)')
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
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const fechaFormato = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;

  // Ayer
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const inicioAyer = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate()).toISOString();

  // Mismo día semana pasada (para comparar)
  const semPasada = new Date(hoy);
  semPasada.setDate(semPasada.getDate() - 7);
  const inicioSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate()).toISOString();
  const finSemPasada = new Date(semPasada.getFullYear(), semPasada.getMonth(), semPasada.getDate() + 1).toISOString();

  // === QUERIES ===
  const { data: leadsAyer } = await supabase.client
    .from('leads')
    .select('*, team_members:assigned_to(name)')
    .gte('created_at', inicioAyer)
    .lt('created_at', inicioHoy);

  const { data: leadsSemPasada } = await supabase.client
    .from('leads')
    .select('id')
    .gte('created_at', inicioSemPasada)
    .lt('created_at', finSemPasada);

  const { data: cierresAyer } = await supabase.client
    .from('leads')
    .select('*, properties(price)')
    .in('status', ['closed', 'delivered'])
    .gte('status_changed_at', inicioAyer)
    .lt('status_changed_at', inicioHoy);

  const { data: cierresSemPasada } = await supabase.client
    .from('leads')
    .select('id, properties(price)')
    .in('status', ['closed', 'delivered'])
    .gte('status_changed_at', inicioSemPasada)
    .lt('status_changed_at', finSemPasada);

  const { data: citasAyer } = await supabase.client
    .from('appointments')
    .select('*')
    .eq('scheduled_date', ayer.toISOString().split('T')[0]);

  const { data: citasHoy } = await supabase.client
    .from('appointments')
    .select('*, team_members(name), leads(name, phone)')
    .eq('scheduled_date', hoy.toISOString().split('T')[0])
    .eq('status', 'scheduled');

  const { data: pipelineDiario } = await supabase.client
    .from('leads')
    .select('*, properties(price)')
    .in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);

  const { data: estancados } = await supabase.client
    .from('leads')
    .select('id')
    .eq('status', 'new')
    .lt('created_at', inicioAyer);

  const { data: perdidosAyer } = await supabase.client
    .from('leads')
    .select('id, lost_reason')
    .eq('status', 'lost')
    .gte('status_changed_at', inicioAyer)
    .lt('status_changed_at', inicioHoy);

  const { data: vendedoresDiario } = await supabase.client
    .from('team_members')
    .select('id, name')
    .eq('role', 'vendedor')
    .eq('active', true);

  // Proyección del mes
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
  const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes);
  const { data: leadsMes } = await supabase.client.from('leads').select('id').gte('created_at', inicioMes);

  // Follow-ups de ayer
  const { data: followupsAyer } = await supabase.client
    .from('followup_approvals')
    .select('status')
    .gte('created_at', inicioAyer)
    .lt('created_at', inicioHoy);

  // === CÁLCULOS ===
  let revenueAyer = 0, pipelineValueDiario = 0;
  cierresAyer?.forEach(c => revenueAyer += c.properties?.price || 2000000);
  pipelineDiario?.forEach(p => pipelineValueDiario += p.properties?.price || 2000000);

  const leadsAyerCount = leadsAyer?.length || 0;
  const leadsSemPasadaCount = leadsSemPasada?.length || 0;
  const cierresAyerCount = cierresAyer?.length || 0;
  const cierresSemPasadaCount = cierresSemPasada?.length || 0;

  const calcVarDiario = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

  // Citas ayer stats
  const citasAyerCompletadas = citasAyer?.filter(c => c.status === 'completed').length || 0;
  const citasAyerTotal = citasAyer?.length || 0;
  const showRateAyer = citasAyerTotal > 0 ? Math.round((citasAyerCompletadas / citasAyerTotal) * 100) : 0;

  // Pipeline por etapa
  const negociacionDiario = pipelineDiario?.filter(p => p.status === 'negotiation').length || 0;
  const reservadosDiario = pipelineDiario?.filter(p => p.status === 'reserved').length || 0;

  // Cálculos proyección
  let revenueMes = 0;
  cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
  const cierresMesCount = cierresMes?.length || 0;
  const leadsMesCount = leadsMes?.length || 0;
  const diaActual = hoy.getDate();
  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasRestantes = diasEnMes - diaActual;
  const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
  const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

  // Rendimiento vendedores ayer
  const rendimientoAyer: string[] = [];
  vendedoresDiario?.forEach(v => {
    const leadsV = leadsAyer?.filter(l => l.assigned_to === v.id).length || 0;
    const cierresV = cierresAyer?.filter(c => c.assigned_to === v.id).length || 0;
    if (leadsV > 0 || cierresV > 0) {
      rendimientoAyer.push(`• ${v.name?.split(' ')[0] || 'V'}: ${cierresV}c/${leadsV}L`);
    }
  });

  // Citas de hoy detalle
  const citasHoyDetalle: string[] = [];
  citasHoy?.slice(0, 5).forEach(c => {
    const hora = c.scheduled_time || '00:00';
    const vendedor = c.team_members?.name?.split(' ')[0] || 'Sin asignar';
    const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
    citasHoyDetalle.push(`• ${hora} - ${cliente} (${vendedor})`);
  });

  // Follow-ups stats
  const followupsEnviadosAyer = followupsAyer?.filter(f => f.status === 'sent').length || 0;
  const followupsPendientesAyer = followupsAyer?.filter(f => f.status === 'pending').length || 0;

  // Alertas
  const alertasDiarias: string[] = [];
  if (estancados && estancados.length > 0) alertasDiarias.push(`• ${estancados.length} leads sin contactar >24h`);
  if (perdidosAyer && perdidosAyer.length > 0) alertasDiarias.push(`• ${perdidosAyer.length} leads perdidos ayer`);
  if (followupsPendientesAyer > 0) alertasDiarias.push(`• ${followupsPendientesAyer} follow-ups sin aprobar`);

  // === CONSTRUIR MENSAJE ===
  const msg = `☀️ *BUENOS DÍAS CEO*
_${fechaFormato}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE AYER*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsAyerCount}* ${calcVarDiario(leadsAyerCount, leadsSemPasadaCount)}
• Cierres: *${cierresAyerCount}* ${calcVarDiario(cierresAyerCount, cierresSemPasadaCount)}
• Revenue: *$${(revenueAyer/1000000).toFixed(1)}M*
• Citas: ${citasAyerCompletadas}/${citasAyerTotal} (${showRateAyer}% show)
${followupsEnviadosAyer > 0 ? `• Follow-ups enviados: *${followupsEnviadosAyer}*` : ''}

━━━━━━━━━━━━━━━━━━━━━
📅 *AGENDA DE HOY*
━━━━━━━━━━━━━━━━━━━━━
${citasHoy && citasHoy.length > 0 ? `*${citasHoy.length} citas agendadas:*\n${citasHoyDetalle.join('\n')}${citasHoy.length > 5 ? '\n_...y ' + (citasHoy.length - 5) + ' más_' : ''}` : '• Sin citas agendadas'}

━━━━━━━━━━━━━━━━━━━━━
🔥 *PIPELINE HOT*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValueDiario/1000000).toFixed(1)}M*
• En negociación: ${negociacionDiario}
• Reservados: ${reservadosDiario}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*
• Leads mes: ${leadsMesCount}
• Días restantes: ${diasRestantes}
${alertasDiarias.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ *ALERTAS*\n━━━━━━━━━━━━━━━━━━━━━\n${alertasDiarias.join('\n')}` : ''}
${rendimientoAyer.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n👥 *EQUIPO AYER*\n━━━━━━━━━━━━━━━━━━━━━\n${rendimientoAyer.slice(0, 5).join('\n')}` : ''}

_Escribe *resumen* para más detalles_`;

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
  const { data: admins } = await supabase.client
    .from('team_members')
    .select('*')
    .in('role', ['admin', 'coordinador'])
    .eq('active', true);

  if (!admins || admins.length === 0) return;

  const hoy = new Date();
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - 7);
  const inicioSemanaAnterior = new Date(inicioSemana);
  inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() - 7);

  // Queries
  const { data: leadsSemana } = await supabase.client.from('leads').select('*, team_members:assigned_to(name)').gte('created_at', inicioSemana.toISOString());
  const { data: cierresSemana } = await supabase.client.from('leads').select('*, properties(price), team_members:assigned_to(name)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString());
  const { data: citasSemana } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]);
  const { data: leadsSemanaAnt } = await supabase.client.from('leads').select('id').gte('created_at', inicioSemanaAnterior.toISOString()).lt('created_at', inicioSemana.toISOString());
  const { data: cierresSemanaAnt } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemanaAnterior.toISOString()).lt('status_changed_at', inicioSemana.toISOString());
  const { data: perdidosSemana } = await supabase.client.from('leads').select('id, lost_reason').eq('status', 'lost').gte('status_changed_at', inicioSemana.toISOString());
  const { data: pipeline } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);
  const { data: vendedores } = await supabase.client.from('team_members').select('id, name').eq('role', 'vendedor').eq('active', true);

  // Proyección del mes
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
  const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMes);
  const { data: leadsMes } = await supabase.client.from('leads').select('id').gte('created_at', inicioMes);

  // Cálculos básicos
  let revenue = 0, revenueAnt = 0, pipelineValue = 0, revenueMes = 0;
  cierresSemana?.forEach(c => revenue += c.properties?.price || 2000000);
  cierresSemanaAnt?.forEach(c => revenueAnt += (c as any).properties?.price || 2000000);
  pipeline?.forEach(p => pipelineValue += p.properties?.price || 2000000);
  cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);

  const leadsActual = leadsSemana?.length || 0;
  const leadsAnterior = leadsSemanaAnt?.length || 0;
  const cierresActual = cierresSemana?.length || 0;
  const cierresAnterior = cierresSemanaAnt?.length || 0;
  const perdidosCount = perdidosSemana?.length || 0;

  // Citas stats
  const citasTotal = citasSemana?.length || 0;
  const citasCompletadas = citasSemana?.filter(c => c.status === 'completed').length || 0;
  const citasCanceladas = citasSemana?.filter(c => c.status === 'cancelled').length || 0;
  const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;

  // Conversión y métricas
  const conversionRate = leadsActual > 0 ? Math.round(cierresActual / leadsActual * 100) : 0;

  // Tiempo de respuesta promedio
  let tiempoRespuesta = 0, leadsConResp = 0;
  leadsSemana?.forEach(l => {
    if (l.first_contact_at && l.created_at) {
      const diff = (new Date(l.first_contact_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60);
      if (diff > 0 && diff < 24 * 60) { tiempoRespuesta += diff; leadsConResp++; }
    }
  });
  const tiempoRespProm = leadsConResp > 0 ? Math.round(tiempoRespuesta / leadsConResp) : 0;

  // Proyección
  const diaActual = hoy.getDate();
  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const cierresMesCount = cierresMes?.length || 0;
  const proyeccionCierres = diaActual > 0 ? Math.round((cierresMesCount / diaActual) * diasEnMes) : 0;
  const proyeccionRevenue = diaActual > 0 ? (revenueMes / diaActual) * diasEnMes : 0;

  const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

  // Top fuentes
  const fuenteCount: Record<string, number> = {};
  leadsSemana?.forEach(l => { const f = l.source || 'Otro'; fuenteCount[f] = (fuenteCount[f] || 0) + 1; });
  const topFuentes = Object.entries(fuenteCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Razones de pérdida
  const razonesCount: Record<string, number> = {};
  perdidosSemana?.forEach(l => { const r = l.lost_reason || 'Sin especificar'; razonesCount[r] = (razonesCount[r] || 0) + 1; });
  const topRazones = Object.entries(razonesCount).sort((a, b) => b[1] - a[1]).slice(0, 2);

  // Rendimiento vendedores
  const rendimiento: { nombre: string; cierres: number; citas: number; leads: number; revenue: number }[] = [];
  vendedores?.forEach(v => {
    const l = leadsSemana?.filter(x => x.assigned_to === v.id).length || 0;
    const c = cierresSemana?.filter(x => x.assigned_to === v.id).length || 0;
    let rev = 0;
    cierresSemana?.filter(x => x.assigned_to === v.id).forEach(x => rev += x.properties?.price || 2000000);
    const ci = citasSemana?.filter(x => x.team_member_id === v.id && x.status === 'completed').length || 0;
    if (l > 0 || c > 0) rendimiento.push({ nombre: v.name?.split(' ')[0] || 'V', cierres: c, citas: ci, leads: l, revenue: rev });
  });
  rendimiento.sort((a, b) => b.cierres - a.cierres || b.revenue - a.revenue);

  // Insights
  const insights: string[] = [];
  if (tiempoRespProm > 0 && tiempoRespProm <= 30) insights.push('✅ Tiempo respuesta excelente');
  else if (tiempoRespProm > 120) insights.push('⚠️ Mejorar tiempo de respuesta');
  if (leadsActual > leadsAnterior * 1.2) insights.push('📈 Semana fuerte en leads (+20%)');
  if (cierresActual > cierresAnterior) insights.push('🎯 Cierres arriba vs semana pasada');
  if (showRate >= 70) insights.push('✅ Buen show rate de citas');
  else if (showRate < 50 && citasTotal > 0) insights.push('⚠️ Show rate bajo, revisar confirmaciones');
  if (insights.length === 0) insights.push('📊 Semana estable');

  const msg = `📈 *REPORTE SEMANAL CEO*
_${inicioSemana.getDate()}/${inicioSemana.getMonth()+1} - ${hoy.getDate()}/${hoy.getMonth()+1} ${meses[hoy.getMonth()]}_

━━━━━━━━━━━━━━━━━━━━━
📊 *RESULTADOS DE LA SEMANA*
━━━━━━━━━━━━━━━━━━━━━
• Leads: *${leadsActual}* ${calcVar(leadsActual, leadsAnterior)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresAnterior)}
• Revenue: *$${(revenue/1000000).toFixed(1)}M* ${calcVar(revenue, revenueAnt)}
• Perdidos: ${perdidosCount}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Completadas: ${citasCompletadas}/${citasTotal} (*${showRate}%* show)
• Canceladas: ${citasCanceladas}
• Conversión cita→cierre: *${citasCompletadas > 0 ? Math.round(cierresActual/citasCompletadas*100) : 0}%*

━━━━━━━━━━━━━━━━━━━━━
💰 *PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• En negociación: ${pipeline?.filter(p => p.status === 'negotiation').length || 0}
• Reservados: ${pipeline?.filter(p => p.status === 'reserved').length || 0}

━━━━━━━━━━━━━━━━━━━━━
📈 *PROYECCIÓN ${meses[hoy.getMonth()].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
• Cierres: ${cierresMesCount} → *${proyeccionCierres}* proyectados
• Revenue: $${(revenueMes/1000000).toFixed(1)}M → *$${(proyeccionRevenue/1000000).toFixed(1)}M*

━━━━━━━━━━━━━━━━━━━━━
⏱️ *VELOCIDAD*
━━━━━━━━━━━━━━━━━━━━━
• Tiempo respuesta: *${tiempoRespProm > 60 ? Math.round(tiempoRespProm/60) + 'h' : tiempoRespProm + 'min'}* ${tiempoRespProm > 0 && tiempoRespProm <= 30 ? '✅' : tiempoRespProm > 120 ? '⚠️' : ''}
• Conversión: *${conversionRate}%*

━━━━━━━━━━━━━━━━━━━━━
👥 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendimiento.slice(0,5).map((v, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${v.nombre}: ${v.cierres}c $${(v.revenue/1000000).toFixed(1)}M`).join('\n') || '• Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📣 *TOP FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${topFuentes.map(f => `• ${f[0]}: ${f[1]} leads`).join('\n') || '• Sin datos'}
${perdidosCount > 0 && topRazones.length > 0 ? `\n━━━━━━━━━━━━━━━━━━━━━\n❌ *RAZONES PÉRDIDA*\n━━━━━━━━━━━━━━━━━━━━━\n${topRazones.map(r => `• ${r[0]}: ${r[1]}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insights.join('\n')}

_Escribe *resumen* para más detalles_`;

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

    // Mes anterior al reporte (para comparar MoM)
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);

    // Mismo mes año anterior (para comparar YoY)
    const inicioMesYoY = new Date(anioReporte - 1, mesReporte, 1);
    const finMesYoY = new Date(anioReporte - 1, mesReporte + 1, 0, 23, 59, 59);

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    // ═══ DATOS DEL MES REPORTADO ═══

    // Leads del mes
    const { data: leadsMes } = await supabase.client
      .from('leads')
      .select('*, team_members:assigned_to(name)')
      .gte('created_at', inicioMesReporte.toISOString())
      .lte('created_at', finMesReporte.toISOString());

    // Leads mes anterior (MoM)
    const { data: leadsMesAnterior } = await supabase.client
      .from('leads')
      .select('id')
      .gte('created_at', inicioMesAnterior.toISOString())
      .lte('created_at', finMesAnterior.toISOString());

    // Leads YoY (mismo mes año anterior)
    const { data: leadsYoY } = await supabase.client
      .from('leads')
      .select('id')
      .gte('created_at', inicioMesYoY.toISOString())
      .lte('created_at', finMesYoY.toISOString());

    // Cierres del mes
    const { data: cierresMes } = await supabase.client
      .from('leads')
      .select('*, properties(price, name), team_members:assigned_to(name)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioMesReporte.toISOString())
      .lte('status_changed_at', finMesReporte.toISOString());

    // Cierres mes anterior (MoM)
    const { data: cierresMesAnterior } = await supabase.client
      .from('leads')
      .select('id, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioMesAnterior.toISOString())
      .lte('status_changed_at', finMesAnterior.toISOString());

    // Cierres YoY
    const { data: cierresYoY } = await supabase.client
      .from('leads')
      .select('id, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioMesYoY.toISOString())
      .lte('status_changed_at', finMesYoY.toISOString());

    // Pipeline actual (forecast)
    const { data: pipeline } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .in('status', ['negotiation', 'reserved', 'scheduled', 'visited']);

    // Leads perdidos
    const { data: leadsPerdidos } = await supabase.client
      .from('leads')
      .select('id, lost_reason')
      .eq('status', 'lost')
      .gte('status_changed_at', inicioMesReporte.toISOString())
      .lte('status_changed_at', finMesReporte.toISOString());

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

    // YoY Revenue
    let revenueYoY = 0;
    for (const c of cierresYoY || []) {
      revenueYoY += c.properties?.price || 2000000;
    }

    // Pipeline value
    let pipelineValue = 0;
    for (const p of pipeline || []) {
      pipelineValue += p.properties?.price || 2000000;
    }

    // Variaciones
    const leadsActual = leadsMes?.length || 0;
    const leadsPrev = leadsMesAnterior?.length || 0;
    const leadsYoYCount = leadsYoY?.length || 0;
    const cierresActual = cierresMes?.length || 0;
    const cierresPrev = cierresMesAnterior?.length || 0;
    const cierresYoYCount = cierresYoY?.length || 0;
    const perdidosCount = leadsPerdidos?.length || 0;

    // Función para calcular variación con flechas
    const calcVar = (a: number, b: number) => b === 0 ? (a > 0 ? '↑' : '→') : a > b ? `↑${Math.round((a-b)/b*100)}%` : a < b ? `↓${Math.round((b-a)/b*100)}%` : '→';

    // Conversión lead→cierre
    const conversionMes = leadsActual > 0 ? Math.round((cierresActual / leadsActual) * 100) : 0;

    // Citas stats
    const citasCompletadas = citasMes?.filter(c => c.status === 'completed').length || 0;
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

    // Leads perdidos por razón
    const razonesLost: Record<string, number> = {};
    for (const l of leadsPerdidos || []) {
      const razon = l.lost_reason || 'Sin razón';
      razonesLost[razon] = (razonesLost[razon] || 0) + 1;
    }
    const topRazones = Object.entries(razonesLost).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Pipeline por etapa
    const negociacion = pipeline?.filter(p => p.status === 'negotiation').length || 0;
    const reservados = pipeline?.filter(p => p.status === 'reserved').length || 0;

    // Ticket promedio
    const ticketPromedio = cierresActual > 0 ? revenueMes / cierresActual : 0;

    // Conversión cita→cierre
    const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresActual / citasCompletadas) * 100) : 0;

    // Tiempo de respuesta promedio
    let tiemposRespuesta: number[] = [];
    for (const l of leadsMes || []) {
      if (l.first_response_at && l.created_at) {
        const created = new Date(l.created_at).getTime();
        const responded = new Date(l.first_response_at).getTime();
        const diffMin = (responded - created) / 60000;
        if (diffMin > 0 && diffMin < 1440) {
          tiemposRespuesta.push(diffMin);
        }
      }
    }
    const tiempoPromedioMin = tiemposRespuesta.length > 0
      ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
      : 0;
    const tiempoRespuestaStr = tiempoPromedioMin > 60
      ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
      : `${tiempoPromedioMin}min`;

    // Vendedores con revenue
    const vendedoresConCierres = (vendedores || []).map(v => {
      const cierresV = cierresMes?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      for (const c of cierresV) {
        revenueV += c.properties?.price || 2000000;
      }
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.revenueV - a.revenueV);

    const rendVendedoresConRevenue: string[] = [];
    vendedoresConCierres.slice(0, 5).forEach((v, i) => {
      const medallas = ['🥇', '🥈', '🥉', '4.', '5.'];
      const revenueStr = v.revenueV >= 1000000 ? `$${(v.revenueV/1000000).toFixed(1)}M` : `$${Math.round(v.revenueV/1000)}K`;
      rendVendedoresConRevenue.push(`${medallas[i]} ${v.name?.split(' ')[0]}: ${v.cierresCount}c → ${revenueStr}`);
    });

    // ═══ INSIGHTS INTELIGENTES ═══
    const insights: string[] = [];

    if (revenueMes > revenueMesAnterior) {
      const pctCrecimiento = revenueMesAnterior > 0 ? Math.round(((revenueMes - revenueMesAnterior) / revenueMesAnterior) * 100) : 100;
      insights.push(`✅ Revenue creció ${pctCrecimiento}% vs mes anterior`);
    } else if (revenueMes < revenueMesAnterior) {
      const pctBaja = revenueMesAnterior > 0 ? Math.round(((revenueMesAnterior - revenueMes) / revenueMesAnterior) * 100) : 0;
      insights.push(`⚠️ Revenue bajó ${pctBaja}% - revisar pipeline`);
    }

    if (showRate >= 75) {
      insights.push(`✅ Excelente show rate: ${showRate}%`);
    } else if (showRate < 60) {
      insights.push(`⚠️ Show rate bajo (${showRate}%) - mejorar confirmaciones`);
    }

    if (convCitaCierre >= 30) {
      insights.push(`✅ Gran conversión cita→cierre: ${convCitaCierre}%`);
    } else if (convCitaCierre < 15 && citasCompletadas > 5) {
      insights.push(`⚠️ Conversión cita→cierre baja: ${convCitaCierre}%`);
    }

    if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 15) {
      insights.push(`✅ Tiempo respuesta excelente: ${tiempoRespuestaStr}`);
    } else if (tiempoPromedioMin > 60) {
      insights.push(`⚠️ Tiempo respuesta alto: ${tiempoRespuestaStr}`);
    }

    if (perdidosCount > cierresActual && cierresActual > 0) {
      insights.push(`⚠️ Más perdidos (${perdidosCount}) que cierres (${cierresActual})`);
    }

    const insightsText = insights.length > 0 ? insights.join('\n') : '✅ Mes estable';

    // ═══ CONSTRUIR MENSAJE ÚNICO ═══

    const msg = `📊 *REPORTE MENSUAL CEO*
*${nombreMes.toUpperCase()} ${anioReporte}*

━━━━━━━━━━━━━━━━━━━━━
💰 *RESULTADOS DEL MES*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueMes/1000000).toFixed(1)}M* ${calcVar(revenueMes, revenueMesAnterior)}
  YoY: ${calcVar(revenueMes, revenueYoY)}
• Cierres: *${cierresActual}* ${calcVar(cierresActual, cierresPrev)}
• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*
• Tiempo respuesta: *${tiempoRespuestaStr}*

━━━━━━━━━━━━━━━━━━━━━
📈 *CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Leads: ${leadsActual} ${calcVar(leadsActual, leadsPrev)}
• Citas: ${citasMes?.length || 0} (show: *${showRate}%*)
• Lead→Cierre: *${conversionMes}%*
• Cita→Cierre: *${convCitaCierre}%*

━━━━━━━━━━━━━━━━━━━━━
📊 *PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• Negociación: ${negociacion} | Reservados: ${reservados}

━━━━━━━━━━━━━━━━━━━━━
🏆 *TOP VENDEDORES*
━━━━━━━━━━━━━━━━━━━━━
${rendVendedoresConRevenue.join('\n') || 'Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
📢 *TOP 3 FUENTES*
━━━━━━━━━━━━━━━━━━━━━
${fuentesOrdenadas.map((f, i) => `${i+1}. ${f[0]}: ${f[1]}`).join('\n') || 'Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
❌ *RAZONES DE PÉRDIDA*
━━━━━━━━━━━━━━━━━━━━━
${topRazones.length > 0 ? topRazones.map((r, i) => `${i+1}. ${r[0]}: ${r[1]}`).join('\n') : 'Sin datos'}

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_Generado por SARA_`;

    // Enviar a cada admin (mensaje único)
    const telefonosEnviados = new Set<string>();
    for (const admin of admins) {
      if (!admin.phone) continue;
      const tel = admin.phone.replace(/\D/g, '');
      if (telefonosEnviados.has(tel)) continue;
      telefonosEnviados.add(tel);

      try {
        await meta.sendWhatsAppMessage(admin.phone, msg);
        console.log(`📊 Reporte mensual enviado a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando reporte mensual a ${admin.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en reporte mensual:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE SEMANAL INDIVIDUAL VENDEDORES - Lunes 9am
// ═══════════════════════════════════════════════════════════════

async function enviarReporteSemanalVendedores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener vendedores activos
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) return;

    const hoy = new Date();
    const diaSemana = hoy.getDay();

    // Semana pasada (lunes a domingo)
    const inicioSemPasada = new Date(hoy);
    inicioSemPasada.setDate(hoy.getDate() - diaSemana - 6);
    inicioSemPasada.setHours(0, 0, 0, 0);

    const finSemPasada = new Date(inicioSemPasada);
    finSemPasada.setDate(inicioSemPasada.getDate() + 6);
    finSemPasada.setHours(23, 59, 59, 999);

    // Semana anterior (para comparar)
    const inicioSemAnterior = new Date(inicioSemPasada);
    inicioSemAnterior.setDate(inicioSemPasada.getDate() - 7);
    const finSemAnterior = new Date(finSemPasada);
    finSemAnterior.setDate(finSemPasada.getDate() - 7);

    // Datos globales de la semana
    const { data: todosLeadsSem } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .gte('created_at', inicioSemPasada.toISOString())
      .lte('created_at', finSemPasada.toISOString());

    const { data: todosCierresSem } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioSemPasada.toISOString())
      .lte('status_changed_at', finSemPasada.toISOString());

    const { data: todasCitasSem } = await supabase.client
      .from('appointments')
      .select('*')
      .gte('scheduled_date', inicioSemPasada.toISOString().split('T')[0])
      .lte('scheduled_date', finSemPasada.toISOString().split('T')[0]);

    // Datos semana anterior para comparación
    const { data: todosLeadsSemAnt } = await supabase.client
      .from('leads')
      .select('id, assigned_to')
      .gte('created_at', inicioSemAnterior.toISOString())
      .lte('created_at', finSemAnterior.toISOString());

    const { data: todosCierresSemAnt } = await supabase.client
      .from('leads')
      .select('id, assigned_to, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioSemAnterior.toISOString())
      .lte('status_changed_at', finSemAnterior.toISOString());

    // Calcular ranking por revenue
    const vendedoresConRevenue = vendedores.map(v => {
      const cierresV = todosCierresSem?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.revenueV - a.revenueV);

    // Función para calcular variación
    const calcVar = (a: number, b: number) => {
      if (b === 0) return a > 0 ? '↑' : '→';
      if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
      if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
      return '→';
    };

    // Enviar reporte a cada vendedor
    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      // Datos individuales del vendedor
      const leadsVendedor = todosLeadsSem?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedor = todosCierresSem?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedor = todasCitasSem?.filter(c => c.vendedor_id === vendedor.id) || [];

      // Datos semana anterior
      const leadsVendedorAnt = todosLeadsSemAnt?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorAnt = todosCierresSemAnt?.filter(c => c.assigned_to === vendedor.id) || [];

      // Cálculos
      const leadsCount = leadsVendedor.length;
      const leadsCountAnt = leadsVendedorAnt.length;
      const cierresCount = cierresVendedor.length;
      const cierresCountAnt = cierresVendedorAnt.length;

      let revenueVendedor = 0;
      cierresVendedor.forEach(c => revenueVendedor += c.properties?.price || 2000000);

      let revenueVendedorAnt = 0;
      cierresVendedorAnt.forEach(c => revenueVendedorAnt += c.properties?.price || 2000000);

      // Citas
      const citasTotal = citasVendedor.length;
      const citasCompletadas = citasVendedor.filter(c => c.status === 'completed').length;
      const citasCanceladas = citasVendedor.filter(c => c.status === 'cancelled').length;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;

      // Conversiones
      const convLeadCierre = leadsCount > 0 ? Math.round((cierresCount / leadsCount) * 100) : 0;
      const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresCount / citasCompletadas) * 100) : 0;

      // Tiempo de respuesta promedio
      let tiemposRespuesta: number[] = [];
      for (const l of leadsVendedor) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) {
            tiemposRespuesta.push(diffMin);
          }
        }
      }
      const tiempoPromedioMin = tiemposRespuesta.length > 0
        ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
        : 0;
      const tiempoRespuestaStr = tiempoPromedioMin > 60
        ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
        : `${tiempoPromedioMin}min`;

      // Posición en ranking
      const posicion = vendedoresConRevenue.findIndex(v => v.id === vendedor.id) + 1;
      const totalVendedores = vendedoresConRevenue.length;
      const medallas = ['🥇', '🥈', '🥉'];
      const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;

      // Revenue total del equipo
      let revenueEquipo = 0;
      todosCierresSem?.forEach(c => revenueEquipo += c.properties?.price || 2000000);
      const porcentajeEquipo = revenueEquipo > 0 ? Math.round((revenueVendedor / revenueEquipo) * 100) : 0;

      // Insights personalizados
      const insights: string[] = [];

      if (cierresCount > cierresCountAnt) {
        insights.push(`✅ Mejoraste en cierres: ${cierresCountAnt}→${cierresCount}`);
      } else if (cierresCount < cierresCountAnt && cierresCountAnt > 0) {
        insights.push(`⚠️ Menos cierres que la semana pasada`);
      }

      if (showRate >= 80) {
        insights.push(`✅ Excelente show rate: ${showRate}%`);
      } else if (showRate < 60 && citasTotal > 0) {
        insights.push(`💡 Tip: Confirma citas 1 día antes`);
      }

      if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 10) {
        insights.push(`✅ Respuesta rápida: ${tiempoRespuestaStr}`);
      } else if (tiempoPromedioMin > 60) {
        insights.push(`💡 Tip: Responde más rápido a leads`);
      }

      if (posicion === 1) {
        insights.push(`🏆 ¡Eres el #1 del equipo esta semana!`);
      } else if (posicion <= 3) {
        insights.push(`🎯 Estás en el Top 3 del equipo`);
      }

      if (convCitaCierre >= 40) {
        insights.push(`✅ Gran cierre en citas: ${convCitaCierre}%`);
      }

      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Sigue así!';

      // Construir mensaje
      const nombreCorto = vendedor.name?.split(' ')[0] || 'Vendedor';
      const fechaSemana = `${inicioSemPasada.getDate()}/${inicioSemPasada.getMonth()+1} - ${finSemPasada.getDate()}/${finSemPasada.getMonth()+1}`;

      const msg = `📊 *TU REPORTE SEMANAL*
Hola *${nombreCorto}* 👋
_Semana: ${fechaSemana}_

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedor/1000000).toFixed(1)}M* ${calcVar(revenueVendedor, revenueVendedorAnt)}
• Cierres: *${cierresCount}* ${calcVar(cierresCount, cierresCountAnt)}
• Leads: *${leadsCount}* ${calcVar(leadsCount, leadsCountAnt)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Agendadas: ${citasTotal}
• Completadas: ${citasCompletadas}
• Show rate: *${showRate}%* ${showRate >= 70 ? '✅' : '⚠️'}

━━━━━━━━━━━━━━━━━━━━━
📈 *TUS CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierre}%*
• Cita→Cierre: *${convCitaCierre}%*
• Tiempo respuesta: *${tiempoRespuestaStr}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStr}* de ${totalVendedores}
• Aportaste: *${porcentajeEquipo}%* del revenue

━━━━━━━━━━━━━━━━━━━━━
💡 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_¡Éxito esta semana!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
        console.log(`📊 Reporte semanal enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${vendedor.name}:`, e);
      }

      // Esperar 1s entre mensajes para no saturar
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`✅ Reportes semanales enviados a ${vendedores.length} vendedores`);
  } catch (e) {
    console.log('Error en reporte semanal vendedores:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// ENCUESTAS AUTOMÁTICAS
// ═══════════════════════════════════════════════════════════════

// Enviar encuesta post-cita (2 horas después de cita completada)
// Busca citas completadas cuya hora programada fue hace 2-3 horas
async function enviarEncuestasPostCita(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();

    // Usar timezone México
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const hoyMexico = mexicoFormatter.format(ahora);

    // Obtener hora actual en México
    const horaFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const horaMexico = horaFormatter.format(ahora);
    const [horaActual, minActual] = horaMexico.split(':').map(Number);
    const minutosActuales = horaActual * 60 + minActual;

    console.log(`📋 Verificando encuestas: ${hoyMexico} ${horaMexico} (${minutosActuales} min desde medianoche)`);

    // Buscar citas completadas de hoy
    const { data: citasCompletadas, error: errorCitas } = await supabase.client
      .from('appointments')
      .select('*, leads(id, name, phone), team_members:vendedor_id(id, name)')
      .eq('status', 'completed')
      .eq('scheduled_date', hoyMexico);

    console.log(`📋 Citas completadas hoy: ${citasCompletadas?.length || 0}, error: ${errorCitas?.message || 'ninguno'}`);

    if (!citasCompletadas || citasCompletadas.length === 0) {
      console.log('📋 No hay citas completadas hoy');
      return;
    }

    // Filtrar citas cuya hora programada fue hace 2-3 horas
    const citasParaEncuesta = citasCompletadas.filter(cita => {
      const horaCita = cita.scheduled_time || '12:00';
      const [h, m] = horaCita.split(':').map(Number);
      const minutosCita = (h || 12) * 60 + (m || 0);

      // La cita debió terminar hace 2-3 horas (asumiendo 1h de duración)
      const minutosDesdeFinCita = minutosActuales - (minutosCita + 60);
      const entreDosTresHoras = minutosDesdeFinCita >= 120 && minutosDesdeFinCita <= 180;

      if (entreDosTresHoras) {
        console.log(`📋 Cita ${cita.id?.slice(0,8)} elegible: ${horaCita} -> terminó hace ${minutosDesdeFinCita} min`);
      }
      return entreDosTresHoras;
    });

    console.log(`📋 Citas elegibles para encuesta: ${citasParaEncuesta.length}`);

    if (citasParaEncuesta.length === 0) {
      console.log('📋 No hay citas en el rango de 2-3h para enviar encuesta');
      return;
    }

    for (const cita of citasCompletadas) {
      const lead = cita.leads as any;
      const vendedor = cita.team_members as any;
      if (!lead?.phone) continue;

      // Verificar si ya se envió encuesta para esta cita
      const { data: encuestaExistente } = await supabase.client
        .from('surveys')
        .select('id')
        .eq('appointment_id', cita.id)
        .eq('survey_type', 'post_cita')
        .single();

      if (encuestaExistente) continue;

      const nombreCliente = lead.name?.split(' ')[0] || 'Cliente';
      const nombreVendedor = vendedor?.name?.split(' ')[0] || 'nuestro asesor';

      const mensaje = `Hola *${nombreCliente}* 👋

¿Cómo calificas tu cita con *${nombreVendedor}*?

1️⃣ Excelente
2️⃣ Buena
3️⃣ Regular
4️⃣ Mala

_Responde con el número_

Tu opinión nos ayuda a mejorar 🙏`;

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);

        // Registrar encuesta enviada (esto evita duplicados al verificar en surveys)
        await supabase.client.from('surveys').insert({
          lead_id: lead.id,
          lead_phone: lead.phone,
          lead_name: lead.name,
          vendedor_id: vendedor?.id,
          vendedor_name: vendedor?.name,
          appointment_id: cita.id,
          survey_type: 'post_cita',
          status: 'sent',
          expires_at: new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString() // Expira en 24h
        });

        console.log(`📋 Encuesta post-cita enviada a ${lead.name}`);
      } catch (e) {
        console.log(`Error enviando encuesta a ${lead.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.log('Error en encuestas post-cita:', e);
  }
}

// Enviar encuesta NPS post-cierre (7 días después)
async function enviarEncuestasNPS(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace8Dias = new Date(ahora.getTime() - 8 * 24 * 60 * 60 * 1000);

    // Buscar leads que cerraron hace 7-8 días
    const { data: cierres } = await supabase.client
      .from('leads')
      .select('*, team_members:assigned_to(id, name)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', hace8Dias.toISOString())
      .lte('status_changed_at', hace7Dias.toISOString());

    if (!cierres || cierres.length === 0) return;

    for (const lead of cierres) {
      if (!lead.phone) continue;

      // Verificar si ya se envió encuesta NPS
      const { data: encuestaExistente } = await supabase.client
        .from('surveys')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('survey_type', 'nps')
        .single();

      if (encuestaExistente) continue;

      const nombreCliente = lead.name?.split(' ')[0] || 'Cliente';
      const vendedor = lead.team_members as any;

      const mensaje = `¡Hola *${nombreCliente}*! 🏠

¡Felicidades por tu nueva casa!

Del *0 al 10*, ¿qué tan probable es que nos recomiendes con amigos o familia?

0 = Nada probable
10 = Muy probable

_Responde con un número del 0 al 10_

¡Gracias por confiar en nosotros! 🙏`;

      try {
        await meta.sendWhatsAppMessage(lead.phone, mensaje);

        await supabase.client.from('surveys').insert({
          lead_id: lead.id,
          lead_phone: lead.phone,
          lead_name: lead.name,
          vendedor_id: vendedor?.id,
          vendedor_name: vendedor?.name,
          survey_type: 'nps',
          status: 'sent',
          expires_at: new Date(ahora.getTime() + 72 * 60 * 60 * 1000).toISOString() // Expira en 72h
        });

        console.log(`📋 Encuesta NPS enviada a ${lead.name}`);
      } catch (e) {
        console.log(`Error enviando encuesta NPS a ${lead.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.log('Error en encuestas NPS:', e);
  }
}

// Procesar respuesta de encuesta
async function procesarRespuestaEncuesta(supabase: SupabaseService, phone: string, mensaje: string): Promise<string | null> {
  try {
    // Buscar encuesta pendiente para este teléfono
    const { data: encuesta } = await supabase.client
      .from('surveys')
      .select('*')
      .eq('lead_phone', phone)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (!encuesta) return null;

    const textoLimpio = mensaje.trim();

    // Encuesta post-cita (espera 1-4)
    if (encuesta.survey_type === 'post_cita') {
      const respuesta = parseInt(textoLimpio);
      if (respuesta >= 1 && respuesta <= 4) {
        const ratings: { [key: number]: { rating: number; texto: string } } = {
          1: { rating: 5, texto: 'Excelente' },
          2: { rating: 4, texto: 'Buena' },
          3: { rating: 3, texto: 'Regular' },
          4: { rating: 2, texto: 'Mala' }
        };

        await supabase.client
          .from('surveys')
          .update({
            status: 'answered',
            answered_at: new Date().toISOString(),
            rating: ratings[respuesta].rating,
            feedback: ratings[respuesta].texto
          })
          .eq('id', encuesta.id);

        const respuestas: { [key: number]: string } = {
          1: `¡Gracias *${encuesta.lead_name?.split(' ')[0]}*! 🌟\n\nNos alegra que tu experiencia haya sido excelente. ¡Seguiremos trabajando para ti!`,
          2: `¡Gracias *${encuesta.lead_name?.split(' ')[0]}*! 😊\n\nNos da gusto que hayas tenido una buena experiencia.`,
          3: `Gracias por tu respuesta *${encuesta.lead_name?.split(' ')[0]}*.\n\n¿Hay algo específico que podamos mejorar? Tu opinión es muy valiosa para nosotros.`,
          4: `Lamentamos que tu experiencia no haya sido buena *${encuesta.lead_name?.split(' ')[0]}*.\n\nNos gustaría saber qué pasó para mejorar. Un supervisor se pondrá en contacto contigo.`
        };

        // Si fue mala, notificar al admin
        if (respuesta === 4) {
          const { data: admins } = await supabase.client
            .from('team_members')
            .select('phone')
            .eq('role', 'admin')
            .eq('active', true);

          // Notificación asíncrona - no esperamos
          console.log(`⚠️ Encuesta negativa de ${encuesta.lead_name} sobre ${encuesta.vendedor_name}`);
        }

        return respuestas[respuesta];
      }
    }

    // Encuesta NPS (espera 0-10)
    if (encuesta.survey_type === 'nps') {
      const nps = parseInt(textoLimpio);
      if (nps >= 0 && nps <= 10) {
        await supabase.client
          .from('surveys')
          .update({
            status: 'answered',
            answered_at: new Date().toISOString(),
            nps_score: nps,
            would_recommend: nps >= 7
          })
          .eq('id', encuesta.id);

        if (nps >= 9) {
          return `¡Wow, gracias *${encuesta.lead_name?.split(' ')[0]}*! 🌟\n\nTu recomendación significa mucho para nosotros. ¡Que disfrutes tu nuevo hogar!`;
        } else if (nps >= 7) {
          return `¡Gracias *${encuesta.lead_name?.split(' ')[0]}*! 😊\n\nNos alegra haberte ayudado. ¡Disfruta tu nueva casa!`;
        } else {
          return `Gracias por tu honestidad *${encuesta.lead_name?.split(' ')[0]}*.\n\n¿Hay algo que pudimos haber hecho mejor? Nos encantaría escucharte.`;
        }
      }
    }

    return null;
  } catch (e) {
    console.log('Error procesando respuesta encuesta:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE DIARIO INDIVIDUAL VENDEDORES - L-V 7pm
// ═══════════════════════════════════════════════════════════════

async function enviarReporteDiarioVendedores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener vendedores activos
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) return;

    const hoy = new Date();

    // Inicio y fin de hoy
    const inicioHoy = new Date(hoy);
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(hoy);
    finHoy.setHours(23, 59, 59, 999);

    // Ayer para comparar
    const inicioAyer = new Date(inicioHoy);
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    const finAyer = new Date(finHoy);
    finAyer.setDate(finAyer.getDate() - 1);

    // Datos globales de hoy
    const { data: todosLeadsHoy } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .gte('created_at', inicioHoy.toISOString())
      .lte('created_at', finHoy.toISOString());

    const { data: todosCierresHoy } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioHoy.toISOString())
      .lte('status_changed_at', finHoy.toISOString());

    const { data: todasCitasHoy } = await supabase.client
      .from('appointments')
      .select('*')
      .eq('scheduled_date', inicioHoy.toISOString().split('T')[0]);

    // Citas de mañana
    const manana = new Date(inicioHoy);
    manana.setDate(manana.getDate() + 1);
    const { data: citasManana } = await supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .eq('scheduled_date', manana.toISOString().split('T')[0])
      .eq('status', 'scheduled');

    // Datos de ayer para comparar
    const { data: todosLeadsAyer } = await supabase.client
      .from('leads')
      .select('id, assigned_to')
      .gte('created_at', inicioAyer.toISOString())
      .lte('created_at', finAyer.toISOString());

    const { data: todosCierresAyer } = await supabase.client
      .from('leads')
      .select('id, assigned_to, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioAyer.toISOString())
      .lte('status_changed_at', finAyer.toISOString());

    // Pipeline activo
    const { data: pipelineActivo } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .in('status', ['new', 'contacted', 'qualified', 'negotiation', 'scheduled', 'visited']);

    // Follow-ups de hoy
    const { data: followupsHoy } = await supabase.client
      .from('followup_approvals')
      .select('vendedor_id, status, sent_at')
      .gte('created_at', inicioHoy.toISOString())
      .lte('created_at', finHoy.toISOString());

    // Calcular ranking del día por cierres
    const vendedoresConCierres = vendedores.map(v => {
      const cierresV = todosCierresHoy?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.cierresCount - a.cierresCount || b.revenueV - a.revenueV);

    // Función para calcular variación
    const calcVar = (a: number, b: number) => {
      if (b === 0) return a > 0 ? '↑' : '→';
      if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
      if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
      return '→';
    };

    const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

    // Enviar reporte a cada vendedor
    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      // Datos individuales del vendedor - HOY
      const leadsVendedorHoy = todosLeadsHoy?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorHoy = todosCierresHoy?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedorHoy = todasCitasHoy?.filter(c => c.vendedor_id === vendedor.id) || [];
      const citasVendedorManana = citasManana?.filter(c => c.vendedor_id === vendedor.id) || [];
      const pipelineVendedor = pipelineActivo?.filter(p => p.assigned_to === vendedor.id) || [];

      // Datos de ayer
      const leadsVendedorAyer = todosLeadsAyer?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorAyer = todosCierresAyer?.filter(c => c.assigned_to === vendedor.id) || [];

      // Cálculos
      const leadsHoyCount = leadsVendedorHoy.length;
      const leadsAyerCount = leadsVendedorAyer.length;
      const cierresHoyCount = cierresVendedorHoy.length;
      const cierresAyerCount = cierresVendedorAyer.length;

      let revenueHoy = 0;
      cierresVendedorHoy.forEach(c => revenueHoy += c.properties?.price || 2000000);

      // Citas de hoy
      const citasHoyTotal = citasVendedorHoy.length;
      const citasCompletadas = citasVendedorHoy.filter(c => c.status === 'completed').length;
      const citasPendientes = citasVendedorHoy.filter(c => c.status === 'scheduled').length;
      const showRateHoy = citasHoyTotal > 0 ? Math.round((citasCompletadas / citasHoyTotal) * 100) : 0;

      // Pipeline value
      let pipelineValue = 0;
      pipelineVendedor.forEach(p => pipelineValue += p.properties?.price || 2000000);

      // Leads por estatus en pipeline
      const leadsNuevos = pipelineVendedor.filter(p => p.status === 'new').length;
      const leadsContactados = pipelineVendedor.filter(p => ['contacted', 'qualified'].includes(p.status)).length;
      const leadsNegociacion = pipelineVendedor.filter(p => ['negotiation', 'scheduled', 'visited'].includes(p.status)).length;

      // Follow-ups del vendedor hoy
      const followupsVendedor = followupsHoy?.filter(f => f.vendedor_id === vendedor.id) || [];
      const followupsEnviados = followupsVendedor.filter(f => f.status === 'sent').length;
      const followupsPendientes = followupsVendedor.filter(f => f.status === 'pending').length;

      // Tiempo de respuesta hoy
      let tiemposRespuesta: number[] = [];
      for (const l of leadsVendedorHoy) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuesta.push(diffMin);
        }
      }
      const tiempoPromedioMin = tiemposRespuesta.length > 0
        ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
        : 0;
      const tiempoRespuestaStr = tiempoPromedioMin > 60
        ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
        : `${tiempoPromedioMin}min`;

      // Posición en ranking del día
      const posicion = vendedoresConCierres.findIndex(v => v.id === vendedor.id) + 1;
      const totalVendedores = vendedoresConCierres.length;

      // Citas de mañana detalle
      const citasMananaDetalle: string[] = [];
      citasVendedorManana.slice(0, 3).forEach(c => {
        const hora = c.scheduled_time?.substring(0, 5) || '00:00';
        const cliente = c.leads?.name?.split(' ')[0] || 'Cliente';
        citasMananaDetalle.push(`  • ${hora} - ${cliente}`);
      });

      // Insights del día
      const insights: string[] = [];

      if (cierresHoyCount > 0) {
        insights.push(`🎉 ¡${cierresHoyCount} cierre${cierresHoyCount > 1 ? 's' : ''} hoy! $${(revenueHoy/1000000).toFixed(1)}M`);
      }

      if (leadsHoyCount > leadsAyerCount && leadsHoyCount > 0) {
        insights.push(`📈 Más leads que ayer: ${leadsAyerCount}→${leadsHoyCount}`);
      }

      if (citasPendientes > 0) {
        insights.push(`⚠️ ${citasPendientes} cita${citasPendientes > 1 ? 's' : ''} pendiente${citasPendientes > 1 ? 's' : ''} de hoy`);
      }

      if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 10) {
        insights.push(`✅ Respuesta rápida: ${tiempoRespuestaStr}`);
      } else if (tiempoPromedioMin > 30) {
        insights.push(`💡 Tip: Responde más rápido`);
      }

      if (leadsNuevos > 3) {
        insights.push(`📋 ${leadsNuevos} leads nuevos por contactar`);
      }

      if (citasVendedorManana.length > 0) {
        insights.push(`📅 Mañana: ${citasVendedorManana.length} cita${citasVendedorManana.length > 1 ? 's' : ''}`);
      }

      if (followupsEnviados > 0) {
        insights.push(`📤 ${followupsEnviados} follow-up${followupsEnviados > 1 ? 's' : ''} enviado${followupsEnviados > 1 ? 's' : ''}`);
      }

      if (followupsPendientes > 0) {
        insights.push(`📬 ${followupsPendientes} mensaje${followupsPendientes > 1 ? 's' : ''} pendiente${followupsPendientes > 1 ? 's' : ''} de aprobar`);
      }

      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen trabajo hoy!';

      // Construir mensaje
      const nombreCorto = vendedor.name?.split(' ')[0] || 'Vendedor';

      const msg = `📊 *TU RESUMEN DEL DÍA*
Hola *${nombreCorto}* 👋
_${fechaHoy}_

━━━━━━━━━━━━━━━━━━━━━
💰 *HOY*
━━━━━━━━━━━━━━━━━━━━━
• Leads nuevos: *${leadsHoyCount}* ${calcVar(leadsHoyCount, leadsAyerCount)}
• Cierres: *${cierresHoyCount}* ${cierresHoyCount > 0 ? '🎉' : ''}
${cierresHoyCount > 0 ? `• Revenue: *$${(revenueHoy/1000000).toFixed(1)}M*` : ''}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS HOY*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasHoyTotal}
• Completadas: ${citasCompletadas} ${showRateHoy >= 80 ? '✅' : ''}
• Pendientes: ${citasPendientes} ${citasPendientes > 0 ? '⚠️' : '✅'}

━━━━━━━━━━━━━━━━━━━━━
📋 *TU PIPELINE*
━━━━━━━━━━━━━━━━━━━━━
• Valor: *$${(pipelineValue/1000000).toFixed(1)}M*
• Nuevos: ${leadsNuevos} | Contactados: ${leadsContactados}
• En negociación: ${leadsNegociacion}

${citasVendedorManana.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS MAÑANA*
━━━━━━━━━━━━━━━━━━━━━
${citasMananaDetalle.join('\n')}${citasVendedorManana.length > 3 ? `\n  _+${citasVendedorManana.length - 3} más..._` : ''}

` : ''}━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_¡Descansa y mañana con todo!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
        console.log(`📊 Reporte diario enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte diario a ${vendedor.name}:`, e);
      }

      // Esperar 1s entre mensajes
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`✅ Reportes diarios enviados a ${vendedores.length} vendedores`);
  } catch (e) {
    console.log('Error en reporte diario vendedores:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL INDIVIDUAL VENDEDORES - Día 1 de cada mes 9am
// ═══════════════════════════════════════════════════════════════

async function enviarReporteMensualVendedores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    // Mes pasado (el que reportamos)
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;

    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);

    // Mes anterior para comparar
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    // Datos globales del mes
    const { data: todosLeadsMes } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .gte('created_at', inicioMesReporte.toISOString())
      .lte('created_at', finMesReporte.toISOString());

    const { data: todosCierresMes } = await supabase.client
      .from('leads')
      .select('*, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioMesReporte.toISOString())
      .lte('status_changed_at', finMesReporte.toISOString());

    const { data: todasCitasMes } = await supabase.client
      .from('appointments')
      .select('*')
      .gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0])
      .lte('scheduled_date', finMesReporte.toISOString().split('T')[0]);

    // Datos mes anterior
    const { data: todosLeadsMesAnt } = await supabase.client
      .from('leads')
      .select('id, assigned_to')
      .gte('created_at', inicioMesAnterior.toISOString())
      .lte('created_at', finMesAnterior.toISOString());

    const { data: todosCierresMesAnt } = await supabase.client
      .from('leads')
      .select('id, assigned_to, properties(price)')
      .in('status', ['closed', 'delivered'])
      .gte('status_changed_at', inicioMesAnterior.toISOString())
      .lte('status_changed_at', finMesAnterior.toISOString());

    const { data: todasCitasMesAnt } = await supabase.client
      .from('appointments')
      .select('id, vendedor_id, status')
      .gte('scheduled_date', inicioMesAnterior.toISOString().split('T')[0])
      .lte('scheduled_date', finMesAnterior.toISOString().split('T')[0]);

    // Encuestas del mes
    const { data: todasEncuestasMes } = await supabase.client
      .from('surveys')
      .select('*')
      .eq('status', 'answered')
      .gte('answered_at', inicioMesReporte.toISOString())
      .lte('answered_at', finMesReporte.toISOString());

    // Calcular ranking por revenue
    const vendedoresConRevenue = vendedores.map(v => {
      const cierresV = todosCierresMes?.filter(c => c.assigned_to === v.id) || [];
      let revenueV = 0;
      cierresV.forEach(c => revenueV += c.properties?.price || 2000000);
      return { ...v, cierresCount: cierresV.length, revenueV };
    }).sort((a, b) => b.revenueV - a.revenueV);

    // Revenue total del equipo
    let revenueEquipo = 0;
    todosCierresMes?.forEach(c => revenueEquipo += c.properties?.price || 2000000);

    const calcVar = (a: number, b: number) => {
      if (b === 0) return a > 0 ? '↑' : '→';
      if (a > b) return `↑${Math.round((a-b)/b*100)}%`;
      if (a < b) return `↓${Math.round((b-a)/b*100)}%`;
      return '→';
    };

    // Enviar a cada vendedor
    for (const vendedor of vendedores) {
      if (!vendedor.phone) continue;

      // Datos del mes
      const leadsVendedor = todosLeadsMes?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedor = todosCierresMes?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedor = todasCitasMes?.filter(c => c.vendedor_id === vendedor.id) || [];

      // Datos mes anterior
      const leadsVendedorAnt = todosLeadsMesAnt?.filter(l => l.assigned_to === vendedor.id) || [];
      const cierresVendedorAnt = todosCierresMesAnt?.filter(c => c.assigned_to === vendedor.id) || [];
      const citasVendedorAnt = todasCitasMesAnt?.filter(c => c.vendedor_id === vendedor.id) || [];

      // Cálculos
      const leadsCount = leadsVendedor.length;
      const leadsCountAnt = leadsVendedorAnt.length;
      const cierresCount = cierresVendedor.length;
      const cierresCountAnt = cierresVendedorAnt.length;

      let revenueVendedor = 0;
      cierresVendedor.forEach(c => revenueVendedor += c.properties?.price || 2000000);

      let revenueVendedorAnt = 0;
      cierresVendedorAnt.forEach(c => revenueVendedorAnt += c.properties?.price || 2000000);

      // Citas
      const citasTotal = citasVendedor.length;
      const citasTotalAnt = citasVendedorAnt.length;
      const citasCompletadas = citasVendedor.filter(c => c.status === 'completed').length;
      const citasCompletadasAnt = citasVendedorAnt.filter(c => c.status === 'completed').length;
      const showRate = citasTotal > 0 ? Math.round((citasCompletadas / citasTotal) * 100) : 0;
      const showRateAnt = citasTotalAnt > 0 ? Math.round((citasCompletadasAnt / citasTotalAnt) * 100) : 0;

      // Conversiones
      const convLeadCierre = leadsCount > 0 ? Math.round((cierresCount / leadsCount) * 100) : 0;
      const convCitaCierre = citasCompletadas > 0 ? Math.round((cierresCount / citasCompletadas) * 100) : 0;

      // Ticket promedio
      const ticketPromedio = cierresCount > 0 ? revenueVendedor / cierresCount : 0;

      // Tiempo de respuesta promedio
      let tiemposRespuesta: number[] = [];
      for (const l of leadsVendedor) {
        if (l.first_response_at && l.created_at) {
          const created = new Date(l.created_at).getTime();
          const responded = new Date(l.first_response_at).getTime();
          const diffMin = (responded - created) / 60000;
          if (diffMin > 0 && diffMin < 1440) tiemposRespuesta.push(diffMin);
        }
      }
      const tiempoPromedioMin = tiemposRespuesta.length > 0
        ? Math.round(tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length)
        : 0;
      const tiempoRespuestaStr = tiempoPromedioMin > 60
        ? `${Math.floor(tiempoPromedioMin/60)}h ${tiempoPromedioMin%60}m`
        : `${tiempoPromedioMin}min`;

      // Posición en ranking
      const posicion = vendedoresConRevenue.findIndex(v => v.id === vendedor.id) + 1;
      const totalVendedores = vendedoresConRevenue.length;
      const medallas = ['🥇', '🥈', '🥉'];
      const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;

      // Porcentaje del equipo
      const porcentajeEquipo = revenueEquipo > 0 ? Math.round((revenueVendedor / revenueEquipo) * 100) : 0;

      // Mejor semana del mes (por cierres)
      let mejorSemana = 0;
      let mejorSemanaNum = 1;
      for (let sem = 0; sem < 5; sem++) {
        const inicioSem = new Date(inicioMesReporte);
        inicioSem.setDate(inicioSem.getDate() + (sem * 7));
        const finSem = new Date(inicioSem);
        finSem.setDate(finSem.getDate() + 6);
        if (finSem > finMesReporte) finSem.setTime(finMesReporte.getTime());

        const cierresSem = cierresVendedor.filter(c => {
          const fecha = new Date(c.status_changed_at);
          return fecha >= inicioSem && fecha <= finSem;
        }).length;

        if (cierresSem > mejorSemana) {
          mejorSemana = cierresSem;
          mejorSemanaNum = sem + 1;
        }
      }

      // Insights del mes
      const insights: string[] = [];

      if (revenueVendedor > revenueVendedorAnt && revenueVendedorAnt > 0) {
        const pctCrecimiento = Math.round(((revenueVendedor - revenueVendedorAnt) / revenueVendedorAnt) * 100);
        insights.push(`🚀 Revenue creció ${pctCrecimiento}% vs mes anterior`);
      } else if (revenueVendedor < revenueVendedorAnt && revenueVendedorAnt > 0) {
        insights.push(`📉 Revenue bajó vs mes anterior`);
      }

      if (posicion === 1) {
        insights.push(`🏆 ¡Fuiste el #1 del equipo!`);
      } else if (posicion <= 3) {
        insights.push(`🎯 Top 3 del equipo`);
      }

      if (showRate >= 80) {
        insights.push(`✅ Excelente show rate: ${showRate}%`);
      } else if (showRate < 60 && citasTotal > 5) {
        insights.push(`💡 Mejorar confirmación de citas`);
      }

      if (convCitaCierre >= 35) {
        insights.push(`✅ Gran conversión cita→cierre: ${convCitaCierre}%`);
      }

      if (tiempoPromedioMin > 0 && tiempoPromedioMin <= 15) {
        insights.push(`✅ Respuesta rápida promedio`);
      }

      if (mejorSemana > 0) {
        insights.push(`📅 Mejor semana: S${mejorSemanaNum} (${mejorSemana} cierres)`);
      }

      // ═══════════════════════════════════════════════════════════
      // ENCUESTAS DE SATISFACCIÓN
      // ═══════════════════════════════════════════════════════════
      const encuestasVendedor = todasEncuestasMes?.filter(e => e.vendedor_id === vendedor.id) || [];
      const encuestasPostCita = encuestasVendedor.filter(e => e.survey_type === 'post_cita');
      const encuestasNPS = encuestasVendedor.filter(e => e.survey_type === 'nps');

      // Promedio de calificación post-cita (rating 1-5)
      const ratingsPostCita = encuestasPostCita.filter(e => e.rating).map(e => e.rating);
      const promedioRating = ratingsPostCita.length > 0
        ? (ratingsPostCita.reduce((a: number, b: number) => a + b, 0) / ratingsPostCita.length).toFixed(1)
        : null;

      // NPS Score
      const scoresNPS = encuestasNPS.filter(e => e.nps_score !== null).map(e => e.nps_score);
      const promedioNPS = scoresNPS.length > 0
        ? Math.round(scoresNPS.reduce((a: number, b: number) => a + b, 0) / scoresNPS.length)
        : null;

      // Promotores, Pasivos, Detractores
      const promotores = scoresNPS.filter(s => s >= 9).length;
      const pasivos = scoresNPS.filter(s => s >= 7 && s < 9).length;
      const detractores = scoresNPS.filter(s => s < 7).length;

      // Calcular NPS real (% promotores - % detractores)
      const npsReal = scoresNPS.length > 0
        ? Math.round(((promotores - detractores) / scoresNPS.length) * 100)
        : null;

      // Emojis según calificación
      const getRatingEmoji = (rating: number) => {
        if (rating >= 4.5) return '⭐⭐⭐⭐⭐';
        if (rating >= 3.5) return '⭐⭐⭐⭐';
        if (rating >= 2.5) return '⭐⭐⭐';
        return '⭐⭐';
      };

      // Insights de encuestas
      if (promedioRating && parseFloat(promedioRating) >= 4.5) {
        insights.push(`⭐ Excelente satisfacción: ${promedioRating}/5`);
      } else if (promedioRating && parseFloat(promedioRating) < 3.5) {
        insights.push(`💡 Mejorar satisfacción del cliente`);
      }

      if (npsReal !== null && npsReal >= 50) {
        insights.push(`🌟 NPS excepcional: ${npsReal > 0 ? '+' : ''}${npsReal}`);
      }

      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen mes!';

      const nombreCorto = vendedor.name?.split(' ')[0] || 'Vendedor';

      const msg = `📊 *TU REPORTE MENSUAL*
Hola *${nombreCorto}* 👋
*${nombreMes.toUpperCase()} ${anioReporte}*

━━━━━━━━━━━━━━━━━━━━━
💰 *TUS RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━
• Revenue: *$${(revenueVendedor/1000000).toFixed(1)}M* ${calcVar(revenueVendedor, revenueVendedorAnt)}
• Cierres: *${cierresCount}* ${calcVar(cierresCount, cierresCountAnt)}
• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*
• Leads: *${leadsCount}* ${calcVar(leadsCount, leadsCountAnt)}

━━━━━━━━━━━━━━━━━━━━━
📅 *CITAS*
━━━━━━━━━━━━━━━━━━━━━
• Total: ${citasTotal} ${calcVar(citasTotal, citasTotalAnt)}
• Completadas: ${citasCompletadas}
• Show rate: *${showRate}%* ${calcVar(showRate, showRateAnt)}

━━━━━━━━━━━━━━━━━━━━━
📈 *CONVERSIONES*
━━━━━━━━━━━━━━━━━━━━━
• Lead→Cierre: *${convLeadCierre}%*
• Cita→Cierre: *${convCitaCierre}%*
• Tiempo respuesta: *${tiempoRespuestaStr}*

━━━━━━━━━━━━━━━━━━━━━
🏆 *RANKING EQUIPO*
━━━━━━━━━━━━━━━━━━━━━
• Posición: *${posicionStr}* de ${totalVendedores}
• Aportaste: *${porcentajeEquipo}%* del revenue total
• Revenue equipo: $${(revenueEquipo/1000000).toFixed(1)}M
${encuestasVendedor.length > 0 ? `
━━━━━━━━━━━━━━━━━━━━━
⭐ *SATISFACCIÓN CLIENTES*
━━━━━━━━━━━━━━━━━━━━━
• Encuestas: ${encuestasVendedor.length}${promedioRating ? `\n• Calificación: *${promedioRating}/5* ${getRatingEmoji(parseFloat(promedioRating))}` : ''}${npsReal !== null ? `\n• NPS: *${npsReal > 0 ? '+' : ''}${npsReal}* (${promotores}👍 ${pasivos}😐 ${detractores}👎)` : ''}` : ''}

━━━━━━━━━━━━━━━━━━━━━
💡 *RESUMEN DEL MES*
━━━━━━━━━━━━━━━━━━━━━
${insightsText}

_¡Éxito en ${meses[mesActual]}!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
        console.log(`📊 Reporte mensual enviado a ${vendedor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte mensual a ${vendedor.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`✅ Reportes mensuales enviados a ${vendedores.length} vendedores`);
  } catch (e) {
    console.log('Error en reporte mensual vendedores:', e);
  }
}


// ═══════════════════════════════════════════════════════════════
// REPORTE DIARIO INDIVIDUAL ASESORES HIPOTECARIOS - L-V 7pm
// ═══════════════════════════════════════════════════════════════

async function enviarReporteDiarioAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: asesores } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'asesor')
      .eq('active', true);

    if (!asesores || asesores.length === 0) return;

    const hoy = new Date();
    const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
    const inicioAyer = new Date(inicioHoy); inicioAyer.setDate(inicioAyer.getDate() - 1);
    const finAyer = new Date(finHoy); finAyer.setDate(finAyer.getDate() - 1);

    const { data: hipotecasHoy } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString());
    const { data: aprobadasHoy } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioHoy.toISOString()).lte('updated_at', finHoy.toISOString());
    const { data: hipotecasAyer } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioAyer.toISOString()).lte('created_at', finAyer.toISOString());
    const { data: pipelineActivo } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').in('status', ['pending', 'in_progress', 'sent_to_bank']);

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };
    const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

    for (const asesor of asesores) {
      if (!asesor.phone || asesor.is_active === false) continue;

      const nuevasHoy = hipotecasHoy?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const aprobadasAsesorHoy = aprobadasHoy?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const nuevasAyer = hipotecasAyer?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const pipelineAsesor = pipelineActivo?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const pendientes = pipelineAsesor.filter(h => h.status === 'pending').length;
      const enProceso = pipelineAsesor.filter(h => h.status === 'in_progress').length;
      const enBanco = pipelineAsesor.filter(h => h.status === 'sent_to_bank').length;

      const insights: string[] = [];
      if (aprobadasAsesorHoy.length > 0) insights.push(`🎉 ¡${aprobadasAsesorHoy.length} hipoteca${aprobadasAsesorHoy.length > 1 ? 's' : ''} aprobada${aprobadasAsesorHoy.length > 1 ? 's' : ''} hoy!`);
      if (nuevasHoy.length > nuevasAyer.length && nuevasHoy.length > 0) insights.push(`📈 Más solicitudes que ayer: ${nuevasAyer.length}→${nuevasHoy.length}`);
      if (pendientes > 3) insights.push(`📋 ${pendientes} solicitudes pendientes de revisar`);
      if (enBanco > 0) insights.push(`🏦 ${enBanco} en banco - dar seguimiento`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen trabajo hoy!';
      const nombreCorto = asesor.name?.split(' ')[0] || 'Asesor';

      const msg = `📊 *TU RESUMEN DEL DÍA*\nHola *${nombreCorto}* 👋\n_${fechaHoy}_\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes nuevas: *${nuevasHoy.length}* ${calcVar(nuevasHoy.length, nuevasAyer.length)}\n• Aprobadas: *${aprobadasAsesorHoy.length}* ${aprobadasAsesorHoy.length > 0 ? '🎉' : ''}\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *TU PIPELINE*\n━━━━━━━━━━━━━━━━━━━━━\n• Pendientes: ${pendientes}\n• En proceso: ${enProceso}\n• En banco: ${enBanco}\n• Total activo: *${pipelineAsesor.length}*\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Descansa y mañana con todo!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(asesor.phone, msg);
        console.log(`📊 Reporte diario asesor enviado a ${asesor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte diario a ${asesor.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes diarios enviados a ${asesores.length} asesores`);
  } catch (e) {
    console.log('Error en reporte diario asesores:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE SEMANAL INDIVIDUAL ASESORES HIPOTECARIOS - Lunes 9am
// ═══════════════════════════════════════════════════════════════

async function enviarReporteSemanalAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: asesores } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
    if (!asesores || asesores.length === 0) return;

    const hoy = new Date();
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7); inicioSemana.setHours(0, 0, 0, 0);
    const finSemana = new Date(hoy); finSemana.setHours(23, 59, 59, 999);
    const inicioSemAnt = new Date(inicioSemana); inicioSemAnt.setDate(inicioSemAnt.getDate() - 7);
    const finSemAnt = new Date(inicioSemana); finSemAnt.setDate(finSemAnt.getDate() - 1); finSemAnt.setHours(23, 59, 59, 999);

    const { data: hipotecasSemana } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioSemana.toISOString()).lte('created_at', finSemana.toISOString());
    const { data: aprobadasSemana } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioSemana.toISOString()).lte('updated_at', finSemana.toISOString());
    const { data: rechazadasSemana } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'rejected').gte('updated_at', inicioSemana.toISOString()).lte('updated_at', finSemana.toISOString());
    const { data: hipotecasSemAnt } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioSemAnt.toISOString()).lte('created_at', finSemAnt.toISOString());
    const { data: aprobadasSemAnt } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioSemAnt.toISOString()).lte('updated_at', finSemAnt.toISOString());
    const { data: pipelineActivo } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').in('status', ['pending', 'in_progress', 'sent_to_bank']);

    const asesoresConAprobaciones = asesores.map(a => ({ ...a, aprobaciones: (aprobadasSemana?.filter(h => h.assigned_advisor_id === a.id) || []).length })).sort((a, b) => b.aprobaciones - a.aprobaciones);
    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    for (const asesor of asesores) {
      if (!asesor.phone || asesor.is_active === false) continue;

      const nuevasSem = hipotecasSemana?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const aprobadasAsesor = aprobadasSemana?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const rechazadasAsesor = rechazadasSemana?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const nuevasSemAnt = hipotecasSemAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const aprobadasAnt = aprobadasSemAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const pipelineAsesor = pipelineActivo?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const tasaAprobacion = (aprobadasAsesor.length + rechazadasAsesor.length) > 0 ? Math.round((aprobadasAsesor.length / (aprobadasAsesor.length + rechazadasAsesor.length)) * 100) : 0;
      const posicion = asesoresConAprobaciones.findIndex(a => a.id === asesor.id) + 1;
      const medallas = ['🥇', '🥈', '🥉'];
      const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;

      const insights: string[] = [];
      if (aprobadasAsesor.length > aprobadasAnt.length && aprobadasAnt.length > 0) insights.push(`🚀 Aprobaciones crecieron ${Math.round(((aprobadasAsesor.length - aprobadasAnt.length) / aprobadasAnt.length) * 100)}% vs semana anterior`);
      if (posicion === 1) insights.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicion <= 3) insights.push(`🎯 Top 3 del equipo`);
      if (tasaAprobacion >= 70) insights.push(`✅ Excelente tasa de aprobación: ${tasaAprobacion}%`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buena semana!';
      const nombreCorto = asesor.name?.split(' ')[0] || 'Asesor';

      const msg = `📊 *TU REPORTE SEMANAL*\nHola *${nombreCorto}* 👋\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *ESTA SEMANA*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes nuevas: *${nuevasSem.length}* ${calcVar(nuevasSem.length, nuevasSemAnt.length)}\n• Aprobadas: *${aprobadasAsesor.length}* ${calcVar(aprobadasAsesor.length, aprobadasAnt.length)}\n• Rechazadas: ${rechazadasAsesor.length}\n• Tasa aprobación: *${tasaAprobacion}%*\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *PIPELINE ACTIVO*\n━━━━━━━━━━━━━━━━━━━━━\n• Pendientes: ${pipelineAsesor.filter(h => h.status === 'pending').length}\n• En proceso: ${pipelineAsesor.filter(h => h.status === 'in_progress').length}\n• En banco: ${pipelineAsesor.filter(h => h.status === 'sent_to_bank').length}\n• Total: *${pipelineAsesor.length}*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING EQUIPO*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStr}* de ${asesoresConAprobaciones.length}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito esta semana!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(asesor.phone, msg);
        console.log(`📊 Reporte semanal asesor enviado a ${asesor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte semanal a ${asesor.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes semanales enviados a ${asesores.length} asesores`);
  } catch (e) {
    console.log('Error en reporte semanal asesores:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL INDIVIDUAL ASESORES HIPOTECARIOS - Día 1 9am
// ═══════════════════════════════════════════════════════════════

async function enviarReporteMensualAsesores(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: asesores } = await supabase.client.from('team_members').select('*').eq('role', 'asesor').eq('active', true);
    if (!asesores || asesores.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;
    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    const { data: hipotecasMes } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').gte('created_at', inicioMesReporte.toISOString()).lte('created_at', finMesReporte.toISOString());
    const { data: aprobadasMes } = await supabase.client.from('mortgage_applications').select('*, leads(name, phone)').eq('status', 'approved').gte('updated_at', inicioMesReporte.toISOString()).lte('updated_at', finMesReporte.toISOString());
    const { data: rechazadasMes } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'rejected').gte('updated_at', inicioMesReporte.toISOString()).lte('updated_at', finMesReporte.toISOString());
    const { data: hipotecasMesAnt } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').gte('created_at', inicioMesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString());
    const { data: aprobadasMesAnt } = await supabase.client.from('mortgage_applications').select('id, assigned_advisor_id').eq('status', 'approved').gte('updated_at', inicioMesAnterior.toISOString()).lte('updated_at', finMesAnterior.toISOString());

    const asesoresConAprobaciones = asesores.map(a => ({ ...a, aprobaciones: (aprobadasMes?.filter(h => h.assigned_advisor_id === a.id) || []).length })).sort((a, b) => b.aprobaciones - a.aprobaciones);
    const totalAprobacionesEquipo = aprobadasMes?.length || 0;
    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    for (const asesor of asesores) {
      if (!asesor.phone || asesor.is_active === false) continue;

      const nuevasMes = hipotecasMes?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const aprobadasAsesor = aprobadasMes?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const rechazadasAsesor = rechazadasMes?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const nuevasMesAnt = hipotecasMesAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const aprobadasAnt = aprobadasMesAnt?.filter(h => h.assigned_advisor_id === asesor.id) || [];
      const tasaAprobacion = (aprobadasAsesor.length + rechazadasAsesor.length) > 0 ? Math.round((aprobadasAsesor.length / (aprobadasAsesor.length + rechazadasAsesor.length)) * 100) : 0;
      const posicion = asesoresConAprobaciones.findIndex(a => a.id === asesor.id) + 1;
      const medallas = ['🥇', '🥈', '🥉'];
      const posicionStr = posicion <= 3 ? medallas[posicion - 1] : `#${posicion}`;
      const porcentajeEquipo = totalAprobacionesEquipo > 0 ? Math.round((aprobadasAsesor.length / totalAprobacionesEquipo) * 100) : 0;

      const insights: string[] = [];
      if (aprobadasAsesor.length > aprobadasAnt.length && aprobadasAnt.length > 0) insights.push(`🚀 Aprobaciones crecieron ${Math.round(((aprobadasAsesor.length - aprobadasAnt.length) / aprobadasAnt.length) * 100)}% vs mes anterior`);
      else if (aprobadasAsesor.length < aprobadasAnt.length && aprobadasAnt.length > 0) insights.push(`📉 Aprobaciones bajaron vs mes anterior`);
      if (posicion === 1) insights.push(`🏆 ¡Fuiste el #1 del equipo!`);
      else if (posicion <= 3) insights.push(`🎯 Top 3 del equipo`);
      if (tasaAprobacion >= 70) insights.push(`✅ Excelente tasa de aprobación: ${tasaAprobacion}%`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen mes!';
      const nombreCorto = asesor.name?.split(' ')[0] || 'Asesor';

      const msg = `📊 *TU REPORTE MENSUAL*\nHola *${nombreCorto}* 👋\n*${nombreMes.toUpperCase()} ${anioReporte}*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏦 *TUS RESULTADOS*\n━━━━━━━━━━━━━━━━━━━━━\n• Solicitudes: *${nuevasMes.length}* ${calcVar(nuevasMes.length, nuevasMesAnt.length)}\n• Aprobadas: *${aprobadasAsesor.length}* ${calcVar(aprobadasAsesor.length, aprobadasAnt.length)}\n• Rechazadas: ${rechazadasAsesor.length}\n• Tasa aprobación: *${tasaAprobacion}%*\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING EQUIPO*\n━━━━━━━━━━━━━━━━━━━━━\n• Posición: *${posicionStr}* de ${asesoresConAprobaciones.length}\n• Aportaste: *${porcentajeEquipo}%* de aprobaciones\n• Total equipo: ${totalAprobacionesEquipo} aprobadas\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *RESUMEN DEL MES*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito en ${meses[mesActual]}!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(asesor.phone, msg);
        console.log(`📊 Reporte mensual asesor enviado a ${asesor.name}`);
      } catch (e) {
        console.log(`Error enviando reporte mensual a ${asesor.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes mensuales enviados a ${asesores.length} asesores`);
  } catch (e) {
    console.log('Error en reporte mensual asesores:', e);
  }
}


// ═══════════════════════════════════════════════════════════════
// REPORTE DIARIO MARKETING - L-V 7pm
// ═══════════════════════════════════════════════════════════════

async function enviarReporteDiarioMarketing(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: marketing } = await supabase.client.from('team_members').select('*').eq('role', 'marketing').eq('active', true);
    if (!marketing || marketing.length === 0) return;

    const hoy = new Date();
    const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
    const inicioAyer = new Date(inicioHoy); inicioAyer.setDate(inicioAyer.getDate() - 1);
    const finAyer = new Date(finHoy); finAyer.setDate(finAyer.getDate() - 1);

    const { data: leadsHoy } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioHoy.toISOString()).lte('created_at', finHoy.toISOString());
    const { data: leadsAyer } = await supabase.client.from('leads').select('id, source').gte('created_at', inicioAyer.toISOString()).lte('created_at', finAyer.toISOString());
    const { data: citasHoy } = await supabase.client.from('appointments').select('*').eq('scheduled_date', inicioHoy.toISOString().split('T')[0]);
    const { data: cierresHoy } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioHoy.toISOString()).lte('status_changed_at', finHoy.toISOString());

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };
    const fechaHoy = `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`;

    // Leads por fuente
    const fuenteHoy: Record<string, number> = {};
    const fuenteAyer: Record<string, number> = {};
    leadsHoy?.forEach(l => { const f = l.source || 'Directo'; fuenteHoy[f] = (fuenteHoy[f] || 0) + 1; });
    leadsAyer?.forEach(l => { const f = l.source || 'Directo'; fuenteAyer[f] = (fuenteAyer[f] || 0) + 1; });
    const topFuentes = Object.entries(fuenteHoy).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Citas agendadas hoy
    const citasAgendadas = citasHoy?.filter(c => c.status === 'scheduled').length || 0;
    const citasCompletadas = citasHoy?.filter(c => c.status === 'completed').length || 0;

    // Revenue del día
    let revenueHoy = 0;
    cierresHoy?.forEach(c => revenueHoy += c.properties?.price || 2000000);

    // Conversión leads->cita
    const convLeadCita = (leadsHoy?.length || 0) > 0 ? Math.round((citasAgendadas / (leadsHoy?.length || 1)) * 100) : 0;

    for (const mkt of marketing) {
      if (!mkt.phone) continue;

      const fuentesStr = topFuentes.length > 0 
        ? topFuentes.map(([f, c]) => `  • ${f}: ${c} ${calcVar(c, fuenteAyer[f] || 0)}`).join('\n')
        : '  Sin leads hoy';

      const insights: string[] = [];
      if ((leadsHoy?.length || 0) > (leadsAyer?.length || 0)) insights.push(`📈 +${(leadsHoy?.length || 0) - (leadsAyer?.length || 0)} leads vs ayer`);
      if (cierresHoy && cierresHoy.length > 0) insights.push(`🎉 ${cierresHoy.length} cierre${cierresHoy.length > 1 ? 's' : ''} hoy!`);
      if (convLeadCita >= 30) insights.push(`✅ Buena conversión lead→cita: ${convLeadCita}%`);
      const mejorFuente = topFuentes[0];
      if (mejorFuente && mejorFuente[1] >= 3) insights.push(`🔥 ${mejorFuente[0]} fue la mejor fuente`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen día de marketing!';
      const nombreCorto = mkt.name?.split(' ')[0] || 'Marketing';

      const msg = `📊 *REPORTE DIARIO MARKETING*\nHola *${nombreCorto}* 👋\n_${fechaHoy}_\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *LEADS HOY*\n━━━━━━━━━━━━━━━━━━━━━\n• Total: *${leadsHoy?.length || 0}* ${calcVar(leadsHoy?.length || 0, leadsAyer?.length || 0)}\n• Conv. lead→cita: *${convLeadCita}%*\n${cierresHoy && cierresHoy.length > 0 ? `• Revenue: *$${(revenueHoy/1000000).toFixed(1)}M*\n` : ''}\n━━━━━━━━━━━━━━━━━━━━━\n📍 *POR FUENTE*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n📅 *CITAS*\n━━━━━━━━━━━━━━━━━━━━━\n• Agendadas: ${citasAgendadas}\n• Completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Mañana seguimos!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(mkt.phone, msg);
        console.log(`📊 Reporte diario marketing enviado a ${mkt.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${mkt.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes diarios enviados a ${marketing.length} de marketing`);
  } catch (e) {
    console.log('Error en reporte diario marketing:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE SEMANAL MARKETING - Lunes 9am
// ═══════════════════════════════════════════════════════════════

async function enviarReporteSemanalMarketing(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: marketing } = await supabase.client.from('team_members').select('*').eq('role', 'marketing').eq('active', true);
    if (!marketing || marketing.length === 0) return;

    const hoy = new Date();
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 7); inicioSemana.setHours(0, 0, 0, 0);
    const finSemana = new Date(hoy); finSemana.setHours(23, 59, 59, 999);
    const inicioSemAnt = new Date(inicioSemana); inicioSemAnt.setDate(inicioSemAnt.getDate() - 7);
    const finSemAnt = new Date(inicioSemana); finSemAnt.setDate(finSemAnt.getDate() - 1); finSemAnt.setHours(23, 59, 59, 999);

    const { data: leadsSemana } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioSemana.toISOString()).lte('created_at', finSemana.toISOString());
    const { data: leadsSemAnt } = await supabase.client.from('leads').select('id, source').gte('created_at', inicioSemAnt.toISOString()).lte('created_at', finSemAnt.toISOString());
    const { data: citasSemana } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioSemana.toISOString().split('T')[0]).lte('scheduled_date', finSemana.toISOString().split('T')[0]);
    const { data: cierresSemana } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemana.toISOString()).lte('status_changed_at', finSemana.toISOString());
    const { data: cierresSemAnt } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioSemAnt.toISOString()).lte('status_changed_at', finSemAnt.toISOString());

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    // Leads por fuente
    const fuenteSemana: Record<string, {leads: number, citas: number, cierres: number}> = {};
    leadsSemana?.forEach(l => {
      const f = l.source || 'Directo';
      if (!fuenteSemana[f]) fuenteSemana[f] = {leads: 0, citas: 0, cierres: 0};
      fuenteSemana[f].leads++;
    });

    // Citas por fuente (basado en lead_id)
    const leadIds = new Set(leadsSemana?.map(l => l.id) || []);
    citasSemana?.forEach(c => {
      if (leadIds.has(c.lead_id)) {
        const lead = leadsSemana?.find(l => l.id === c.lead_id);
        const f = lead?.source || 'Directo';
        if (fuenteSemana[f]) fuenteSemana[f].citas++;
      }
    });

    // Cierres por fuente
    cierresSemana?.forEach(c => {
      const f = c.source || 'Directo';
      if (fuenteSemana[f]) fuenteSemana[f].cierres++;
    });

    const topFuentes = Object.entries(fuenteSemana).sort((a, b) => b[1].leads - a[1].leads).slice(0, 5);

    // Revenue
    let revenueSemana = 0;
    let revenueSemAnt = 0;
    cierresSemana?.forEach(c => revenueSemana += c.properties?.price || 2000000);
    cierresSemAnt?.forEach(c => revenueSemAnt += c.properties?.price || 2000000);

    // Conversiones globales
    const citasTotal = citasSemana?.length || 0;
    const citasCompletadas = citasSemana?.filter(c => c.status === 'completed').length || 0;
    const convLeadCita = (leadsSemana?.length || 0) > 0 ? Math.round((citasTotal / (leadsSemana?.length || 1)) * 100) : 0;
    const convCitaCierre = citasCompletadas > 0 ? Math.round(((cierresSemana?.length || 0) / citasCompletadas) * 100) : 0;

    for (const mkt of marketing) {
      if (!mkt.phone) continue;

      const fuentesStr = topFuentes.length > 0
        ? topFuentes.map(([f, data]) => {
            const conv = data.leads > 0 ? Math.round((data.cierres / data.leads) * 100) : 0;
            return `  • ${f}: ${data.leads} leads → ${data.cierres} cierres (${conv}%)`;
          }).join('\n')
        : '  Sin datos';

      const insights: string[] = [];
      if ((leadsSemana?.length || 0) > (leadsSemAnt?.length || 0)) {
        const pct = Math.round((((leadsSemana?.length || 0) - (leadsSemAnt?.length || 0)) / (leadsSemAnt?.length || 1)) * 100);
        insights.push(`📈 Leads crecieron ${pct}% vs semana anterior`);
      }
      if (revenueSemana > revenueSemAnt && revenueSemAnt > 0) insights.push(`💰 Revenue creció vs semana anterior`);
      const mejorFuente = topFuentes.find(([f, d]) => d.cierres > 0);
      if (mejorFuente) insights.push(`🏆 Mejor fuente: ${mejorFuente[0]}`);
      if (convLeadCita >= 25) insights.push(`✅ Buena conversión lead→cita: ${convLeadCita}%`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buena semana!';
      const nombreCorto = mkt.name?.split(' ')[0] || 'Marketing';

      const msg = `📊 *REPORTE SEMANAL MARKETING*\nHola *${nombreCorto}* 👋\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *ESTA SEMANA*\n━━━━━━━━━━━━━━━━━━━━━\n• Leads: *${leadsSemana?.length || 0}* ${calcVar(leadsSemana?.length || 0, leadsSemAnt?.length || 0)}\n• Cierres: *${cierresSemana?.length || 0}* ${calcVar(cierresSemana?.length || 0, cierresSemAnt?.length || 0)}\n• Revenue: *$${(revenueSemana/1000000).toFixed(1)}M* ${calcVar(revenueSemana, revenueSemAnt)}\n\n━━━━━━━━━━━━━━━━━━━━━\n📈 *CONVERSIONES*\n━━━━━━━━━━━━━━━━━━━━━\n• Lead→Cita: *${convLeadCita}%*\n• Cita→Cierre: *${convCitaCierre}%*\n• Citas completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n📍 *PERFORMANCE POR FUENTE*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito esta semana!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(mkt.phone, msg);
        console.log(`📊 Reporte semanal marketing enviado a ${mkt.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${mkt.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes semanales enviados a ${marketing.length} de marketing`);
  } catch (e) {
    console.log('Error en reporte semanal marketing:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORTE MENSUAL MARKETING - Día 1 9am
// ═══════════════════════════════════════════════════════════════

async function enviarReporteMensualMarketing(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: marketing } = await supabase.client.from('team_members').select('*').eq('role', 'marketing').eq('active', true);
    if (!marketing || marketing.length === 0) return;

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const mesReporte = mesActual === 0 ? 11 : mesActual - 1;
    const anioReporte = mesActual === 0 ? anioActual - 1 : anioActual;
    const inicioMesReporte = new Date(anioReporte, mesReporte, 1);
    const finMesReporte = new Date(anioReporte, mesReporte + 1, 0, 23, 59, 59);
    const mesAnterior = mesReporte === 0 ? 11 : mesReporte - 1;
    const anioAnterior = mesReporte === 0 ? anioReporte - 1 : anioReporte;
    const inicioMesAnterior = new Date(anioAnterior, mesAnterior, 1);
    const finMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0, 23, 59, 59);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = meses[mesReporte];

    const { data: leadsMes } = await supabase.client.from('leads').select('*, properties(price)').gte('created_at', inicioMesReporte.toISOString()).lte('created_at', finMesReporte.toISOString());
    const { data: leadsMesAnt } = await supabase.client.from('leads').select('id, source').gte('created_at', inicioMesAnterior.toISOString()).lte('created_at', finMesAnterior.toISOString());
    const { data: citasMes } = await supabase.client.from('appointments').select('*').gte('scheduled_date', inicioMesReporte.toISOString().split('T')[0]).lte('scheduled_date', finMesReporte.toISOString().split('T')[0]);
    const { data: cierresMes } = await supabase.client.from('leads').select('*, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesReporte.toISOString()).lte('status_changed_at', finMesReporte.toISOString());
    const { data: cierresMesAnt } = await supabase.client.from('leads').select('id, properties(price)').in('status', ['closed', 'delivered']).gte('status_changed_at', inicioMesAnterior.toISOString()).lte('status_changed_at', finMesAnterior.toISOString());

    const calcVar = (a: number, b: number) => { if (b === 0) return a > 0 ? '↑' : '→'; if (a > b) return `↑${Math.round((a-b)/b*100)}%`; if (a < b) return `↓${Math.round((b-a)/b*100)}%`; return '→'; };

    // Leads por fuente con conversiones
    const fuenteMes: Record<string, {leads: number, cierres: number, revenue: number}> = {};
    leadsMes?.forEach(l => {
      const f = l.source || 'Directo';
      if (!fuenteMes[f]) fuenteMes[f] = {leads: 0, cierres: 0, revenue: 0};
      fuenteMes[f].leads++;
    });
    cierresMes?.forEach(c => {
      const f = c.source || 'Directo';
      if (!fuenteMes[f]) fuenteMes[f] = {leads: 0, cierres: 0, revenue: 0};
      fuenteMes[f].cierres++;
      fuenteMes[f].revenue += c.properties?.price || 2000000;
    });

    const topFuentes = Object.entries(fuenteMes).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);

    // Totales
    let revenueMes = 0;
    let revenueMesAnt = 0;
    cierresMes?.forEach(c => revenueMes += c.properties?.price || 2000000);
    cierresMesAnt?.forEach(c => revenueMesAnt += c.properties?.price || 2000000);

    const citasTotal = citasMes?.length || 0;
    const citasCompletadas = citasMes?.filter(c => c.status === 'completed').length || 0;
    const convLeadCita = (leadsMes?.length || 0) > 0 ? Math.round((citasTotal / (leadsMes?.length || 1)) * 100) : 0;
    const convLeadCierre = (leadsMes?.length || 0) > 0 ? Math.round(((cierresMes?.length || 0) / (leadsMes?.length || 1)) * 100) : 0;
    const ticketPromedio = (cierresMes?.length || 0) > 0 ? revenueMes / (cierresMes?.length || 1) : 0;

    for (const mkt of marketing) {
      if (!mkt.phone) continue;

      const fuentesStr = topFuentes.length > 0
        ? topFuentes.map(([f, data]) => {
            const conv = data.leads > 0 ? Math.round((data.cierres / data.leads) * 100) : 0;
            return `  • ${f}\n    ${data.leads} leads → ${data.cierres} cierres (${conv}%)\n    Revenue: $${(data.revenue/1000000).toFixed(1)}M`;
          }).join('\n')
        : '  Sin datos';

      const insights: string[] = [];
      if ((leadsMes?.length || 0) > (leadsMesAnt?.length || 0) && (leadsMesAnt?.length || 0) > 0) {
        const pct = Math.round((((leadsMes?.length || 0) - (leadsMesAnt?.length || 0)) / (leadsMesAnt?.length || 1)) * 100);
        insights.push(`📈 Leads crecieron ${pct}% vs mes anterior`);
      } else if ((leadsMes?.length || 0) < (leadsMesAnt?.length || 0)) {
        insights.push(`📉 Leads bajaron vs mes anterior`);
      }
      if (revenueMes > revenueMesAnt && revenueMesAnt > 0) {
        const pct = Math.round(((revenueMes - revenueMesAnt) / revenueMesAnt) * 100);
        insights.push(`💰 Revenue creció ${pct}%`);
      }
      const mejorFuente = topFuentes[0];
      if (mejorFuente && mejorFuente[1].revenue > 0) insights.push(`🏆 Mejor ROI: ${mejorFuente[0]}`);
      if (convLeadCierre >= 5) insights.push(`✅ Conversión lead→cierre: ${convLeadCierre}%`);
      const insightsText = insights.length > 0 ? insights.join('\n') : '💪 ¡Buen mes!';
      const nombreCorto = mkt.name?.split(' ')[0] || 'Marketing';

      const msg = `📊 *REPORTE MENSUAL MARKETING*\nHola *${nombreCorto}* 👋\n*${nombreMes.toUpperCase()} ${anioReporte}*\n\n━━━━━━━━━━━━━━━━━━━━━\n📣 *RESULTADOS DEL MES*\n━━━━━━━━━━━━━━━━━━━━━\n• Leads: *${leadsMes?.length || 0}* ${calcVar(leadsMes?.length || 0, leadsMesAnt?.length || 0)}\n• Cierres: *${cierresMes?.length || 0}* ${calcVar(cierresMes?.length || 0, cierresMesAnt?.length || 0)}\n• Revenue: *$${(revenueMes/1000000).toFixed(1)}M* ${calcVar(revenueMes, revenueMesAnt)}\n• Ticket promedio: *$${(ticketPromedio/1000000).toFixed(2)}M*\n\n━━━━━━━━━━━━━━━━━━━━━\n📈 *CONVERSIONES*\n━━━━━━━━━━━━━━━━━━━━━\n• Lead→Cita: *${convLeadCita}%*\n• Lead→Cierre: *${convLeadCierre}%*\n• Citas totales: ${citasTotal}\n• Citas completadas: ${citasCompletadas}\n\n━━━━━━━━━━━━━━━━━━━━━\n📍 *TOP FUENTES (por revenue)*\n━━━━━━━━━━━━━━━━━━━━━\n${fuentesStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *INSIGHTS*\n━━━━━━━━━━━━━━━━━━━━━\n${insightsText}\n\n_¡Éxito en ${meses[mesActual]}!_ 🚀`;

      try {
        await meta.sendWhatsAppMessage(mkt.phone, msg);
        console.log(`📊 Reporte mensual marketing enviado a ${mkt.name}`);
      } catch (e) {
        console.log(`Error enviando reporte a ${mkt.name}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Reportes mensuales enviados a ${marketing.length} de marketing`);
  } catch (e) {
    console.log('Error en reporte mensual marketing:', e);
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
    await logEvento(supabase, 'cumpleanos', `Felicitación enviada a ${persona.name}`, { phone: persona.phone });
  }
}

// ═══════════════════════════════════════════════════════════
// Helper: Loggear eventos importantes a Supabase
// ═══════════════════════════════════════════════════════════
async function logEvento(
  supabase: SupabaseService,
  tipo: string,
  mensaje: string,
  datos?: any
): Promise<void> {
  try {
    await supabase.client.from('sara_logs').insert({
      tipo,
      mensaje,
      datos: datos || {},
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Error logging evento:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// Helper: Ejecutar tarea one-time sin duplicados
// Usa system_config para trackear si ya se ejecutó
// ═══════════════════════════════════════════════════════════
async function ejecutarTareaOneTime(
  supabase: SupabaseService,
  taskId: string,
  tarea: () => Promise<void>
): Promise<boolean> {
  const key = `onetime_${taskId}_done`;

  // Verificar si ya se ejecutó
  const { data: yaEjecutado } = await supabase.client
    .from('system_config')
    .select('value')
    .eq('key', key)
    .single();

  if (yaEjecutado) {
    console.log(`⏭️ Tarea one-time "${taskId}" ya fue ejecutada, saltando...`);
    return false;
  }

  // Marcar como ejecutada ANTES de ejecutar (evita race condition con CRON cada 2 min)
  await supabase.client.from('system_config').upsert({
    key: key,
    value: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Ejecutar la tarea
  console.log(`🚀 Ejecutando tarea one-time: ${taskId}`);
  await tarea();
  console.log(`✅ Tarea one-time "${taskId}" completada`);

  return true;
}

async function enviarBriefingMatutino(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaFormato = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;

  // Tips de uso de SARA para el briefing
  const TIPS_SARA = [
    '💡 *Tip:* Escribe *bridge Juan* para chatear directo con tu lead sin que SARA intervenga.',
    '💡 *Tip:* Escribe *mis leads* para ver todos tus prospectos y su estado actual.',
    '💡 *Tip:* Escribe *cita María mañana 4pm* para agendar una visita rápidamente.',
    '💡 *Tip:* Escribe *enviar video a Pedro* para mandarle el video del desarrollo.',
    '💡 *Tip:* Escribe *resumen* para ver un reporte rápido de tu día.',
    '💡 *Tip:* Escribe *#ayuda* para ver todos los comandos disponibles.',
    '💡 *Tip:* Usa *confirmar cita* cuando tu lead confirme asistencia.',
    '💡 *Tip:* Escribe *status Juan compró* para actualizar el estado de tu lead.',
    '💡 *Tip:* SARA te avisa 2h antes de cada cita. ¡No olvides confirmar!',
    '💡 *Tip:* Responde rápido a leads nuevos - cada minuto cuenta para la conversión.',
    '💡 *Tip:* Escribe *enviar GPS a María* para compartir la ubicación del desarrollo.',
    '💡 *Tip:* Si un lead no responde, escribe *seguimiento Juan* para reactivarlo.',
  ];
  const tipDelDia = TIPS_SARA[hoy.getDate() % TIPS_SARA.length]; // Tip diferente cada día

  // PROTECCIÓN ANTI-DUPLICADOS
  if (vendedor.last_briefing_sent === hoyStr) {
    console.log(`⏭️ Briefing ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // 1. CITAS DEL DÍA
  // ═══════════════════════════════════════════════════════════
  const { data: citasHoy } = await supabase.client
    .from('appointments')
    .select('*, leads(name, phone)')
    .eq('team_member_id', vendedor.id)
    .eq('scheduled_date', hoyStr)
    .eq('status', 'scheduled')
    .order('scheduled_time', { ascending: true });

  // ═══════════════════════════════════════════════════════════
  // 2. LEADS QUE REQUIEREN ACCIÓN
  // ═══════════════════════════════════════════════════════════
  // 2a. Leads nuevos sin contactar
  const { data: leadsSinContactar } = await supabase.client
    .from('leads')
    .select('name, phone, created_at')
    .eq('assigned_to', vendedor.id)
    .eq('status', 'new');

  // 2b. Leads estancados (3+ días sin actividad)
  const hace3dias = new Date();
  hace3dias.setDate(hace3dias.getDate() - 3);
  const { data: leadsEstancados } = await supabase.client
    .from('leads')
    .select('name, phone, status, updated_at')
    .eq('assigned_to', vendedor.id)
    .in('status', ['contacted', 'appointment_scheduled'])
    .lt('updated_at', hace3dias.toISOString());

  // ═══════════════════════════════════════════════════════════
  // 3. HIPOTECAS ESTANCADAS (si es asesor)
  // ═══════════════════════════════════════════════════════════
  let hipotecasEstancadas: any[] = [];
  if (vendedor.role === 'asesor') {
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);
    const { data: hips } = await supabase.client
      .from('mortgage_applications')
      .select('lead_name, bank, status, updated_at')
      .eq('assigned_advisor_id', vendedor.id)
      .in('status', ['pending', 'in_review', 'documents', 'sent_to_bank'])
      .lt('updated_at', hace7dias.toISOString());
    hipotecasEstancadas = hips || [];
  }

  // ═══════════════════════════════════════════════════════════
  // 4. CUMPLEAÑOS DEL DÍA
  // ═══════════════════════════════════════════════════════════
  const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
  const diaActual = String(hoy.getDate()).padStart(2, '0');
  const { data: cumpleaneros } = await supabase.client
    .from('leads')
    .select('name, phone')
    .eq('assigned_to', vendedor.id)
    .ilike('birthday', `%-${mesActual}-${diaActual}`);

  // ═══════════════════════════════════════════════════════════
  // 5. PROMOCIONES ACTIVAS
  // ═══════════════════════════════════════════════════════════
  const { data: promos } = await supabase.client
    .from('promotions')
    .select('name, development, discount_percent, end_date')
    .lte('start_date', hoyStr)
    .gte('end_date', hoyStr)
    .eq('status', 'active')
    .limit(3);

  // ═══════════════════════════════════════════════════════════
  // CONSTRUIR MENSAJE CONSOLIDADO
  // ═══════════════════════════════════════════════════════════
  let mensaje = `📋 *BRIEFING DIARIO*\n`;
  mensaje += `${fechaFormato}\n\n`;

  // Citas
  mensaje += `🗓️ *CITAS HOY*`;
  if (citasHoy && citasHoy.length > 0) {
    mensaje += ` (${citasHoy.length}):\n`;
    citasHoy.forEach((c: any) => {
      mensaje += `  • ${(c.scheduled_time || '').substring(0,5)} - ${c.leads?.name || 'Cliente'}\n`;
    });
  } else {
    mensaje += `: Sin citas\n`;
  }

  // Acciones requeridas
  const totalAcciones = (leadsSinContactar?.length || 0) + (leadsEstancados?.length || 0) + hipotecasEstancadas.length;
  if (totalAcciones > 0) {
    mensaje += `\n⚠️ *REQUIEREN ACCIÓN* (${totalAcciones}):\n`;

    if (leadsSinContactar && leadsSinContactar.length > 0) {
      leadsSinContactar.slice(0, 3).forEach((l: any) => {
        mensaje += `  • ${l.name || 'Sin nombre'} - sin contactar\n`;
      });
      if (leadsSinContactar.length > 3) {
        mensaje += `  _...y ${leadsSinContactar.length - 3} más_\n`;
      }
    }

    if (leadsEstancados && leadsEstancados.length > 0) {
      leadsEstancados.slice(0, 3).forEach((l: any) => {
        const diasSinMover = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / (1000*60*60*24));
        mensaje += `  • ${l.name || 'Sin nombre'} - ${diasSinMover}d sin actividad\n`;
      });
      if (leadsEstancados.length > 3) {
        mensaje += `  _...y ${leadsEstancados.length - 3} más_\n`;
      }
    }

    if (hipotecasEstancadas.length > 0) {
      hipotecasEstancadas.slice(0, 2).forEach((h: any) => {
        mensaje += `  • 🏦 ${h.lead_name} - hipoteca estancada\n`;
      });
    }
  } else {
    mensaje += `\n✅ *Sin acciones pendientes urgentes*\n`;
  }

  // Cumpleaños
  if (cumpleaneros && cumpleaneros.length > 0) {
    mensaje += `\n🎂 *CUMPLEAÑOS*:\n`;
    cumpleaneros.forEach((c: any) => {
      mensaje += `  • ${c.name}\n`;
    });
  }

  // Promociones
  if (promos && promos.length > 0) {
    mensaje += `\n💰 *PROMOS ACTIVAS*:\n`;
    promos.forEach((p: any) => {
      const diasRestantes = Math.ceil((new Date(p.end_date).getTime() - hoy.getTime()) / (1000*60*60*24));
      mensaje += `  • ${p.name} (${diasRestantes}d restantes)\n`;
    });
  }

  // Tip del día
  mensaje += `\n${tipDelDia}\n`;
  mensaje += `\n_¡Éxito hoy!_ 💪`;

  // ═══════════════════════════════════════════════════════════
  // ENVIAR VÍA TEMPLATE (para que llegue aunque no hayan escrito en 24h)
  // Estrategia: Template llega, vendedor responde "Sí", ENTONCES enviamos briefing
  // ═══════════════════════════════════════════════════════════
  try {
    const nombreCorto = vendedor.name?.split(' ')[0] || 'Hola';

    // 1. Guardar briefing completo en notes ANTES de enviar template
    const notasActuales = typeof vendedor.notes === 'string' ? JSON.parse(vendedor.notes || '{}') : (vendedor.notes || {});
    notasActuales.pending_briefing = {
      sent_at: new Date().toISOString(),
      fecha: fechaFormato,
      citas: citasHoy?.length || 0,
      acciones_pendientes: totalAcciones,
      mensaje_completo: mensaje  // Guardar el briefing completo para enviar cuando respondan
    };
    await supabase.client
      .from('team_members')
      .update({
        last_briefing_sent: hoyStr,
        notes: JSON.stringify(notasActuales)
      })
      .eq('id', vendedor.id);

    // 2. Enviar template (el briefing se envía cuando respondan)
    const templateComponents = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombreCorto },
          { type: 'text', text: 'tu briefing del día' }
        ]
      }
    ];
    await meta.sendTemplate(vendedor.phone, 'seguimiento_lead', 'es_MX', templateComponents);
    console.log(`📤 Template briefing enviado a ${vendedor.name} (briefing completo pendiente hasta que responda)`);
  } catch (error) {
    console.error(`❌ Error enviando briefing a ${vendedor.name}:`, error);
    // Fallback: intentar enviar solo mensaje normal (para vendedores que SÍ han escrito en 24h)
    try {
      await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
      const notasActuales = typeof vendedor.notes === 'string' ? JSON.parse(vendedor.notes || '{}') : (vendedor.notes || {});
      notasActuales.last_briefing_context = { sent_at: new Date().toISOString(), citas: citasHoy?.length || 0 };
      await supabase.client.from('team_members').update({ last_briefing_sent: hoyStr, notes: JSON.stringify(notasActuales) }).eq('id', vendedor.id);
      console.log(`📋 Briefing enviado directo a ${vendedor.name} (fallback)`);
    } catch (e2) {
      console.error(`❌ Fallback también falló para ${vendedor.name}`);
    }
  }

  console.log(`✅ Briefing consolidado enviado a ${vendedor.name}`);
}

async function enviarRecapDiario(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

  // PROTECCIÓN ANTI-DUPLICADOS: Verificar si ya se envió hoy
  if (vendedor.last_recap_sent === hoy) {
    console.log(`⏭️ Recap ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  const nombreCorto = vendedor.name?.split(' ')[0] || 'Hola';
  const mensaje = `*Resumen del dia, ${vendedor.name}*\n\n` +
    `Gracias por tu esfuerzo hoy. Recuerda actualizar el status de tus leads en el CRM.\n\n` +
    `Descansa y manana con todo!`;

  // ═══════════════════════════════════════════════════════════
  // ENVIAR VÍA TEMPLATE (para que llegue aunque no hayan escrito en 24h)
  // Estrategia: Template llega, vendedor responde, ENTONCES enviamos recap
  // ═══════════════════════════════════════════════════════════
  try {
    // 1. Guardar recap en notes ANTES de enviar template
    const notasActuales = typeof vendedor.notes === 'string' ? JSON.parse(vendedor.notes || '{}') : (vendedor.notes || {});
    notasActuales.pending_recap = {
      sent_at: new Date().toISOString(),
      tipo: 'diario',
      mensaje_completo: mensaje
    };
    await supabase.client
      .from('team_members')
      .update({
        last_recap_sent: hoy,
        notes: JSON.stringify(notasActuales)
      })
      .eq('id', vendedor.id);

    // 2. Enviar template (recap se envía cuando respondan)
    const templateComponents = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombreCorto },
          { type: 'text', text: 'tu resumen del día' }
        ]
      }
    ];
    await meta.sendTemplate(vendedor.phone, 'seguimiento_lead', 'es_MX', templateComponents);
    console.log(`📤 Template recap enviado a ${vendedor.name} (recap completo pendiente hasta que responda)`);
  } catch (error) {
    console.error(`❌ Error enviando recap a ${vendedor.name}:`, error);
    // Fallback: enviar directo si la ventana está abierta
    try {
      await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
      await supabase.client.from('team_members').update({ last_recap_sent: hoy }).eq('id', vendedor.id);
      console.log(`📋 Recap enviado directo a ${vendedor.name} (fallback)`);
    } catch (e2) {
      console.error(`❌ Fallback recap también falló para ${vendedor.name}`);
    }
  }
  console.log(`✅ Recap diario enviado a ${vendedor.name}`);
}

async function enviarRecapSemanal(supabase: SupabaseService, meta: MetaWhatsAppService, vendedor: any): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];

  // PROTECCIÓN ANTI-DUPLICADOS: Verificar si ya se envió esta semana
  if (vendedor.last_recap_semanal_sent === hoy) {
    console.log(`⏭️ Recap semanal ya enviado hoy a ${vendedor.name}, saltando...`);
    return;
  }

  const nombreCorto = vendedor.name?.split(' ')[0] || 'Hola';
  const mensaje = `*Resumen semanal, ${vendedor.name}*\n\n` +
    `Esta semana trabajaste duro. Revisa tus metricas en el CRM.\n\n` +
    `Disfruta tu fin de semana!`;

  // ═══════════════════════════════════════════════════════════
  // ENVIAR VÍA TEMPLATE (para que llegue aunque no hayan escrito en 24h)
  // Estrategia: Template llega, vendedor responde, ENTONCES enviamos recap
  // ═══════════════════════════════════════════════════════════
  try {
    // 1. Guardar recap en notes ANTES de enviar template
    const notasActuales = typeof vendedor.notes === 'string' ? JSON.parse(vendedor.notes || '{}') : (vendedor.notes || {});
    notasActuales.pending_recap = {
      sent_at: new Date().toISOString(),
      tipo: 'semanal',
      mensaje_completo: mensaje
    };
    await supabase.client
      .from('team_members')
      .update({
        last_recap_semanal_sent: hoy,
        notes: JSON.stringify(notasActuales)
      })
      .eq('id', vendedor.id);

    // 2. Enviar template (recap se envía cuando respondan)
    const templateComponents = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombreCorto },
          { type: 'text', text: 'tu resumen semanal' }
        ]
      }
    ];
    await meta.sendTemplate(vendedor.phone, 'seguimiento_lead', 'es_MX', templateComponents);
    console.log(`📤 Template recap semanal enviado a ${vendedor.name} (recap completo pendiente hasta que responda)`);
  } catch (error) {
    console.error(`❌ Error enviando recap semanal a ${vendedor.name}:`, error);
    // Fallback
    try {
      await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
      await supabase.client.from('team_members').update({ last_recap_semanal_sent: hoy }).eq('id', vendedor.id);
      console.log(`📋 Recap semanal enviado directo a ${vendedor.name} (fallback)`);
    } catch (e2) {
      console.error(`❌ Fallback recap semanal también falló para ${vendedor.name}`);
    }
  }
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

    const nombreCorto = lead.name?.split(' ')[0] || 'Hola';
    const desarrollo = cita.property_interest || 'Santa Rita';
    const ubicacion = cita.location || desarrollo;
    const hora = cita.scheduled_time || '10:00 AM';

    try {
      // Usar template: recordatorio_cita_24h
      // Template: 📅 ¡Hola {{1}}! Te recordamos tu cita mañana. 🏠 {{2}} 📍 {{3}} ⏰ {{4}}
      const templateComponents = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nombreCorto },
            { type: 'text', text: desarrollo },
            { type: 'text', text: ubicacion },
            { type: 'text', text: hora }
          ]
        }
      ];

      await meta.sendTemplate(lead.phone, 'recordatorio_cita_24h', 'es_MX', templateComponents);
      console.log(`📅 Recordatorio 24h (template) enviado a ${lead.name}`);

      await supabase.client
        .from('appointments')
        .update({ reminder_24h_sent: true })
        .eq('id', cita.id);
    } catch (err) {
      console.error(`❌ Error enviando recordatorio 24h a ${lead.name}:`, err);
    }
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

    const nombreCorto = lead.name?.split(' ')[0] || 'Hola';
    const desarrollo = cita.property_interest || 'Santa Rita';
    const ubicacion = cita.location || desarrollo;

    try {
      // Usar template: recordatorio_cita_2h
      // Template: ⏰ ¡{{1}}, tu cita es en 2 horas! 🏠 {{2}} 📍 {{3}}
      const templateComponents = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nombreCorto },
            { type: 'text', text: desarrollo },
            { type: 'text', text: ubicacion }
          ]
        }
      ];

      await meta.sendTemplate(lead.phone, 'recordatorio_cita_2h', 'es_MX', templateComponents);
      console.log(`⏰ Recordatorio 2h (template) enviado a ${lead.name}`);

      await supabase.client
        .from('appointments')
        .update({ reminder_2h_sent: true })
        .eq('id', cita.id);
    } catch (err) {
      console.error(`❌ Error enviando recordatorio 2h a ${lead.name}:`, err);
    }
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
    if (!asesor.phone || asesor.is_active === false) continue;

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

// ═══════════════════════════════════════════════════════════════
// ALERTAS DE LEADS FRÍOS - Diario 10am L-V
// ═══════════════════════════════════════════════════════════════
async function enviarAlertasLeadsFrios(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🥶 Iniciando verificación de leads fríos...');

    const ahora = new Date();
    const hace2Dias = new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000);
    const hace3Dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hace5Dias = new Date(ahora.getTime() - 5 * 24 * 60 * 60 * 1000);
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Obtener todos los leads activos (no cerrados ni caídos)
    const { data: leadsActivos } = await supabase.client
      .from('leads')
      .select('*, team_members:assigned_to(id, name, phone, role)')
      .not('status', 'in', '("closed","delivered","fallen")')
      .order('updated_at', { ascending: true });

    if (!leadsActivos || leadsActivos.length === 0) {
      console.log('✅ No hay leads activos para revisar');
      return;
    }

    // Categorizar leads fríos
    const leadsFrios: {
      vendedor: any;
      leads: { lead: any; razon: string; diasSinContacto: number }[];
    }[] = [];

    // Agrupar por vendedor
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
        mensaje += `📱 ${lead.phone}\n`;
        mensaje += `⏰ ${diasSinContacto} días sin contacto\n`;
        if (lead.property_interest) mensaje += `🏠 ${lead.property_interest}\n`;
        mensaje += `\n`;
      }

      if (leadsDelVendedor.length > 5) {
        mensaje += `_...y ${leadsDelVendedor.length - 5} más_\n\n`;
      }

      mensaje += `⚡ *¡Contacta hoy para no perderlos!*`;

      await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
      alertasEnviadas++;
      console.log(`📤 Alerta enviada a ${vendedor.name}: ${leadsDelVendedor.length} leads fríos`);
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
        const hipotecas = hipotecasPorAsesor.get(asesorId) || [];
        if (hipotecas.length === 0) continue;

        let mensaje = `🥶 *ALERTA: ${hipotecas.length} CRÉDITO(S) SIN MOVIMIENTO*\n`;
        mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (const hip of hipotecas.slice(0, 5)) {
          const diasSinMov = Math.floor((ahora.getTime() - new Date(hip.updated_at).getTime()) / (1000 * 60 * 60 * 24));
          mensaje += `👤 *${hip.leads?.name || 'Sin nombre'}*\n`;
          mensaje += `📱 ${hip.leads?.phone || 'N/A'}\n`;
          mensaje += `⏰ ${diasSinMov} días sin movimiento\n`;
          mensaje += `📊 Status: ${hip.status}\n\n`;
        }

        if (hipotecas.length > 5) {
          mensaje += `_...y ${hipotecas.length - 5} más_\n\n`;
        }

        mensaje += `⚡ *¡Dar seguimiento para no perder la venta!*`;

        await meta.sendWhatsAppMessage(asesor.phone, mensaje);
        alertasEnviadas++;
        console.log(`📤 Alerta créditos enviada a ${asesor.name}: ${hipotecas.length} créditos fríos`);
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
          if (admin.phone) {
            await meta.sendWhatsAppMessage(admin.phone, mensaje);
            alertasEnviadas++;
            console.log(`📤 Resumen enviado a ${admin.name} (${admin.role})`);
          }
        }
      }
    }

    console.log(`✅ Alertas de leads fríos completadas: ${alertasEnviadas} mensajes enviados`);

  } catch (error) {
    console.error('❌ Error en alertas de leads fríos:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// ✅ FIX 14-ENE-2026: VERIFICACIÓN DE CONSISTENCIA GOOGLE CALENDAR
// Verifica que las citas en BD tengan su evento correspondiente en Google
// Si el evento fue borrado de Google, marca la cita como cancelled
// ═══════════════════════════════════════════════════════════════
async function verificarConsistenciaCalendario(
  supabase: SupabaseService,
  env: any
): Promise<{ canceladas: number; verificadas: number }> {
  const resultado = { canceladas: 0, verificadas: 0 };

  try {
    console.log('🔄 Verificando consistencia Google Calendar <-> Supabase...');

    // Obtener citas activas (scheduled o completed) con google_event_vendedor_id
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
        console.log(`⚠️ Cita ${cita.id} (${cita.lead_name}) - evento NO existe en Google Calendar`);

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
        console.log(`❌ Cita ${cita.id} marcada como cancelled (evento borrado de Google)`);
      }
    }

    if (resultado.canceladas > 0) {
      console.log(`🔄 Consistencia: ${resultado.verificadas} verificadas, ${resultado.canceladas} canceladas por inconsistencia`);
    } else {
      console.log(`✅ Consistencia OK: ${resultado.verificadas} citas verificadas`);
    }

  } catch (error) {
    console.error('Error verificando consistencia calendario:', error);
  }

  return resultado;
}

// ═══════════════════════════════════════════════════════════════
// NO-SHOW DETECTION & RESCHEDULE
// Pregunta al vendedor si el cliente se presentó a la cita
// ═══════════════════════════════════════════════════════════════
async function detectarNoShows(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
    // (no fueron marcadas como completadas ni canceladas)
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
      console.log(`🔍 Evaluando cita ${cita.id}: ${cita.lead_name} a las ${cita.scheduled_time}`);

      // Parsear fecha y hora de la cita
      const horaCita = cita.scheduled_time || '12:00';

      // Crear fecha/hora completa de la cita
      const [horas, minutos] = horaCita.split(':').map(Number);
      const fechaHoraCita = new Date(hoyStr + 'T00:00:00Z'); // Forzar UTC
      fechaHoraCita.setUTCHours(horas || 12, minutos || 0, 0, 0);

      // La hora de la cita está en tiempo México (UTC-6)
      // Convertir a UTC sumando 6 horas
      const fechaHoraCitaUTC = new Date(fechaHoraCita.getTime() + 6 * 60 * 60 * 1000);

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
        console.log(`⚠️ Cita ${cita.id} sin vendedor o sin teléfono, saltando`);
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
          // Puede ser string o ya un objeto
          notasActuales = typeof vendedorData.notes === 'string'
            ? JSON.parse(vendedorData.notes)
            : vendedorData.notes;
        }
      } catch (e) {
        console.log(`⚠️ Error parseando notas de ${vendedor.name}:`, e);
        notasActuales = {};
      }

      // Si ya tiene CUALQUIER confirmación pendiente o feedback pendiente, saltar (no saturar al vendedor)
      if (notasActuales?.pending_show_confirmation || notasActuales?.pending_post_visit_feedback) {
        console.log(`⏭️ Vendedor ${vendedor.name} ya tiene confirmación/feedback pendiente, saltando cita ${cita.id}`);
        continue;
      }

      // Verificar si ya preguntamos sobre ESTA cita específica (evitar duplicados)
      const citasPreguntadas = notasActuales?.citas_preguntadas || [];
      if (citasPreguntadas.includes(cita.id)) {
        console.log(`⏭️ Ya se preguntó sobre cita ${cita.id}, saltando`);
        continue;
      }

      // Formatear hora bonita
      const ampm = horas >= 12 ? 'pm' : 'am';
      const hora12 = horas > 12 ? horas - 12 : (horas === 0 ? 12 : horas);
      const horaFormateada = `${hora12}:${String(minutos || 0).padStart(2, '0')} ${ampm}`;

      // Mensaje al vendedor preguntando si llegó el cliente - NOMBRE MUY CLARO
      const leadName = lead?.name || cita.lead_name || 'el cliente';
      const mensajeVendedor = `📋 *¿LLEGÓ ${leadName.toUpperCase()}?*

Cita de las ${horaFormateada}
🏠 ${cita.property_interest || cita.property_name || cita.location || 'la propiedad'}

Responde para *${leadName}*:
1️⃣ Sí llegó
2️⃣ No llegó`;

      await meta.sendWhatsAppMessage(vendedor.phone, mensajeVendedor);
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

      // Agregar esta cita a la lista de citas preguntadas para evitar duplicados
      if (!notasActuales.citas_preguntadas) {
        notasActuales.citas_preguntadas = [];
      }
      notasActuales.citas_preguntadas.push(cita.id);

      await supabase.client
        .from('team_members')
        .update({ notes: JSON.stringify(notasActuales) })
        .eq('id', vendedor.id);

      preguntasEnviadas++;
    }

    console.log(`✅ Preguntas de asistencia enviadas: ${preguntasEnviadas}`);

  } catch (error) {
    console.error('❌ Error verificando asistencia:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// TIMEOUT DE CONFIRMACIONES
// Si el vendedor no responde en 2 horas, enviar encuesta al lead de todas formas
// ═══════════════════════════════════════════════════════════════
async function verificarTimeoutConfirmaciones(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
          await meta.sendWhatsAppMessage(vendedor.phone,
            `⏰ *Recordatorio pendiente*\n\n` +
            `No respondiste sobre la cita con *${confirmacion.lead_name}*.\n\n` +
            `¿Llegó a la visita?\n` +
            `1️⃣ Sí llegó\n` +
            `2️⃣ No llegó\n\n` +
            `_Responde para que pueda dar seguimiento adecuado._`
          );
          console.log(`📤 Recordatorio enviado a ${vendedor.name} sobre ${confirmacion.lead_name}`);
        }

        // Marcar que ya enviamos recordatorio (no limpiar, solo marcar)
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
    }

    console.log(`⏰ Timeouts procesados: ${timeoutsEncontrados}`);

  } catch (error) {
    console.error('❌ Error verificando timeouts:', error);
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
      // Si ya tiene URL válida (de un intento anterior), intentar enviar directamente
      if (video.video_url && !video.video_url.startsWith('ERROR')) {
        console.log(`📦 Video ${video.id} ya tiene URL, intentando enviar...`);
        try {
          const videoResponse = await fetch(video.video_url, {
            headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
          });

          if (videoResponse.ok) {
            const videoBuffer = await videoResponse.arrayBuffer();
            console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

            const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
            console.log(`✅ Video subido a Meta: ${mediaId}`);

            await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
              `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

            await supabase.client
              .from('pending_videos')
              .update({ sent: true, completed_at: new Date().toISOString() })
              .eq('id', video.id);

            console.log(`✅ Video ${video.id} enviado exitosamente (retry)`);
            continue;
          }
        } catch (retryError: any) {
          console.log(`⚠️ Error en retry de video ${video.id}: ${retryError.message}`);
        }
      }

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

          // Guardar URL primero (para retry si falla el envío)
          await supabase.client
            .from('pending_videos')
            .update({ video_url: videoUri })
            .eq('id', video.id);

          try {
            // 1. Descargar video de Google (requiere API key)
            console.log(`📥 Descargando video de Google...`);
            const videoResponse = await fetch(videoUri, {
              headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
            });

            if (!videoResponse.ok) {
              console.log(`❌ Error descargando video: ${videoResponse.status}`);
              // NO marcar como enviado, se reintentará
              continue;
            }

            const videoBuffer = await videoResponse.arrayBuffer();
            console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

            // 2. Subir a Meta
            const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
            console.log(`✅ Video subido a Meta: ${mediaId}`);

            // 3. Enviar por WhatsApp
            let enviadoExitoso = false;
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
                  enviadoExitoso = true;
                } catch (e: any) {
                  console.log(`⚠️ Error enviando video a ${miembro.name}: ${e.message}`);
                }
              }
            } else {
              // Video individual (bienvenida)
              await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
                `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);
              console.log(`✅ Video enviado a ${video.lead_name}`);
              enviadoExitoso = true;
            }

            // ✅ SOLO marcar como enviado DESPUÉS de envío exitoso
            if (enviadoExitoso) {
              await supabase.client
                .from('pending_videos')
                .update({ sent: true, completed_at: new Date().toISOString() })
                .eq('id', video.id);
              console.log(`✅ Video ${video.id} marcado como enviado`);
            }
          } catch (downloadError: any) {
            console.log(`❌ Error en flujo de video: ${downloadError.message}`);
            // NO marcar como enviado, se reintentará en próximo cron
          }

        } else if (status.error) {
          console.log(`❌ Video fallido: ${status.error.message}`);
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR: ${status.error.message}` })
            .eq('id', video.id);
        } else {
          // Verificar si fue bloqueado por filtros de seguridad (RAI)
          const raiReasons = status.response?.generateVideoResponse?.raiMediaFilteredReasons;
          if (raiReasons && raiReasons.length > 0) {
            console.log(`🚫 Video bloqueado por políticas de seguridad: ${raiReasons[0]}`);
            await supabase.client
              .from('pending_videos')
              .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR_RAI: ${raiReasons[0]}` })
              .eq('id', video.id);
          } else {
            console.log(`⚠️ Video completado pero sin URI`);
            console.log(`📦 Estructura completa:`, JSON.stringify(status));
            await supabase.client
              .from('pending_videos')
              .update({ sent: true, completed_at: new Date().toISOString(), video_url: 'ERROR: No URI found' })
              .eq('id', video.id);
          }
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

// ═══════════════════════════════════════════════════════════════════════════
// ALERTA INACTIVIDAD VENDEDOR - Notifica a admins cuando vendedores no actúan
// ═══════════════════════════════════════════════════════════════════════════
async function alertaInactividadVendedor(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener admins para notificar
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .in('role', ['admin', 'coordinador', 'ceo', 'director'])
      .eq('active', true);

    if (!admins || admins.length === 0) {
      console.log('⚠️ No hay admins para notificar');
      return;
    }

    // Obtener vendedores activos
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone, last_sara_interaction')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores || vendedores.length === 0) {
      console.log('⚠️ No hay vendedores activos');
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
        await meta.sendWhatsAppMessage(admin.phone, msg);
        console.log(`👔 Alerta inactividad enviada a ${admin.name}`);
      } catch (e) {
        console.log(`Error enviando alerta inactividad a ${admin.name}:`, e);
      }
    }

    console.log(`👔 ALERTA INACTIVIDAD: ${vendedoresInactivos.length} vendedores reportados`);
  } catch (e) {
    console.error('Error en alertaInactividadVendedor:', e);
  }
}

async function alertaLeadsHotSinSeguimiento(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
// ALERTA 2PM - LEADS HOT URGENTES (sin contactar hoy)
// ═══════════════════════════════════════════════════════════════

async function alertaLeadsHotUrgentes(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
        console.log(`⚡ Alerta 2pm enviada a ${vendedor.name} (${todosUrgentes.length} leads)`);
      } catch (e) {
        console.log(`Error enviando alerta 2pm a ${vendedor.name}:`, e);
      }
    }
  } catch (e) {
    console.log('Error en alertaLeadsHotUrgentes:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// RECORDATORIO 5PM - FIN DEL DÍA
// ═══════════════════════════════════════════════════════════════

async function recordatorioFinalDia(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
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
            await meta.sendWhatsAppMessage(admin.phone, adminMsg);
            console.log(`⚠️ Alerta admin 5pm enviada a ${admin.name}`);
          } catch (e) {
            console.log(`Error enviando alerta admin 5pm:`, e);
          }
        }
      }
    }
  } catch (e) {
    console.log('Error en recordatorioFinalDia:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
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
        .replace('{nombre}', lead.name?.split(' ')[0] || '');

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

// ═══════════════════════════════════════════════════════════════
// REACTIVACIÓN DE LEADS PERDIDOS
// ═══════════════════════════════════════════════════════════════
// FOLLOW-UP AUTOMÁTICO A LEADS INACTIVOS (3+ días sin responder)
// Se ejecuta a las 11am L-V
// ═══════════════════════════════════════════════════════════════
async function followUpLeadsInactivos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('📬 Iniciando follow-up de leads inactivos...');

    const ahora = new Date();
    const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Usar timezone de México para el registro de follow-up
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

    // Filtrar leads que ya recibieron follow-up hoy o recientemente
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const leadsParaFollowup = leadsInactivos.filter(lead => {
      const notes = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
      // Verificar si tiene follow-up reciente (últimos 7 días)
      if (notes.last_auto_followup) {
        const ultimoFollowup = new Date(notes.last_auto_followup);
        if (ultimoFollowup > hace7dias) {
          return false; // Ya tuvo follow-up reciente
        }
      }
      return true;
    }).slice(0, 10); // Máximo 10 por día

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

        // Marcar en notes (objeto JSON)
        const notesActuales = typeof lead.notes === 'object' && lead.notes ? lead.notes : {};
        await supabase.client
          .from('leads')
          .update({
            notes: { ...notesActuales, last_auto_followup: ahora.toISOString() },
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
        console.log(`❌ Error enviando follow-up a ${lead.name}:`, e);
      }
    }

    // Notificar a vendedores sobre los follow-ups enviados
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
          await meta.sendWhatsAppMessage(vendedor.phone, msg);
        }
      }
    }

    console.log(`✅ Follow-up completado: ${enviados} mensajes enviados`);

  } catch (error) {
    console.error('❌ Error en followUpLeadsInactivos:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// RECORDATORIOS DE PAGO DE APARTADOS
// Envía recordatorios 5 días antes, 1 día antes y el día del pago
// ═══════════════════════════════════════════════════════════════
async function recordatoriosPagoApartado(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('💰 Verificando recordatorios de pago de apartados...');

    // Usar timezone de México para cálculos de fecha
    const ahora = new Date();
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const hoyStr = mexicoFormatter.format(ahora); // Formato YYYY-MM-DD

    // Calcular fechas para recordatorios (en timezone de México)
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
    const vendedorMap = new Map(vendedores?.map(v => [v.id, v]) || []);

    console.log(`📋 Verificando ${leadsReservados.length} leads reservados...`);

    let recordatoriosEnviados = 0;

    for (const lead of leadsReservados) {
      const notes = lead.notes || {};
      const apartado = notes.apartado;

      if (!apartado || !apartado.fecha_pago) {
        continue; // Sin fecha de pago definida
      }

      const fechaPago = apartado.fecha_pago;
      const recordatoriosYaEnviados = apartado.recordatorios_enviados || 0;
      console.log(`🔍 Lead ${lead.name}: fechaPago=${fechaPago}, en5dias=${en5dias}, en1dia=${en1dia}, hoy=${hoyStr}, recordatorios=${recordatoriosYaEnviados}`);
      const vendedor = lead.assigned_to ? vendedorMap.get(lead.assigned_to) : null;

      let tipoRecordatorio: '5dias' | '1dia' | 'hoy' | 'vencido' | null = null;
      let mensajeCliente = '';
      let mensajeVendedor = '';

      // Calcular días para pago usando fechas en formato string (más confiable para comparación)
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
            await meta.sendWhatsAppMessage(vendedor.phone, mensajeVendedor);
          }

          // Actualizar contador de recordatorios + guardar contexto para respuesta
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
          await new Promise(r => setTimeout(r, 1000)); // Rate limiting
        } catch (e) {
          console.log(`❌ Error enviando recordatorio a ${lead.name}:`, e);
        }
      }
    }

    console.log(`✅ Recordatorios de pago: ${recordatoriosEnviados} enviados`);

  } catch (error) {
    console.error('❌ Error en recordatoriosPagoApartado:', error);
  }
}

// Contacta leads marcados como "lost" o "fallen" después de 30 días
// ═══════════════════════════════════════════════════════════════
async function reactivarLeadsPerdidos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
      .limit(50); // Traer más para filtrar después

    if (error) {
      console.error('❌ Error buscando leads perdidos:', error);
      return;
    }

    if (!leadsPerdidos || leadsPerdidos.length === 0) {
      console.log('📭 No hay leads perdidos para reactivar');
      return;
    }

    // Filtrar leads que ya recibieron reactivación (revisar notes)
    const leadsParaReactivar = leadsPerdidos.filter(lead => {
      const notes = lead.notes || '';
      return !notes.includes('Reactivación automática enviada');
    }).slice(0, 15); // Máximo 15

    if (leadsParaReactivar.length === 0) {
      console.log('📭 Todos los leads perdidos ya fueron reactivados anteriormente');
      return;
    }

    console.log(`📋 Encontrados ${leadsParaReactivar.length} leads para reactivar (de ${leadsPerdidos.length} perdidos)`);

    // Cargar vendedores para notificaciones
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

        await supabase.client
          .from('leads')
          .update({
            status: 'contacted',
            updated_at: ahora.toISOString(),
            notes: (lead.notes || '') + `\n[${ahora.toISOString().split('T')[0]}] Reactivación automática enviada`
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
        console.log(`❌ Error reactivando ${lead.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    // Notificar a vendedores
    for (const [vendedorId, leads] of leadsPorVendedor) {
      const vendedor = leads[0].vendedor;
      if (!vendedor?.phone) continue;

      let msg = `🔄 *LEADS REACTIVADOS*\n\nSe enviaron mensajes a ${leads.length} lead(s) que habías dado por perdidos:\n\n`;
      for (const { lead } of leads.slice(0, 5)) {
        msg += `• *${lead.name}* - ${lead.phone}\n`;
        if (lead.lost_reason) msg += `  _Razón: ${lead.lost_reason}_\n`;
      }
      if (leads.length > 5) msg += `\n_...y ${leads.length - 5} más_\n`;
      msg += `\n💡 *Si responden, ya están en tu pipeline como "contactados".*`;

      await meta.sendWhatsAppMessage(vendedor.phone, msg);
    }

    console.log(`✅ Reactivación completada: ${reactivados} leads contactados`);
  } catch (error) {
    console.error('❌ Error en reactivación:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE CUMPLEAÑOS A LEADS
// Envía mensaje personalizado a leads que cumplen años hoy
// ═══════════════════════════════════════════════════════════════
async function felicitarCumpleañosLeads(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
    const fechaMexico = mexicoFormatter.format(ahora); // YYYY-MM-DD
    const [añoActual, mes, dia] = fechaMexico.split('-');
    const fechaHoy = `${mes}-${dia}`;
    console.log(`🎂 Buscando cumpleaños para fecha: ${fechaHoy} (México)`);

    // Buscar leads con birthday y filtrar por mes-día
    // NOTA: El campo birthday es tipo DATE, no se puede usar ilike
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

    // Filtrar leads cuyo cumpleaños sea hoy (comparar MM-DD)
    const leadsCumple = leadsConBirthday?.filter(l => {
      if (!l.birthday) return false;
      const bday = l.birthday.toString(); // YYYY-MM-DD
      return bday.endsWith(`-${fechaHoy}`);
    });

    console.log(`🎂 Leads con birthday: ${leadsConBirthday?.length || 0}, cumpliendo hoy: ${leadsCumple?.length || 0}`);

    if (!leadsCumple || leadsCumple.length === 0) {
      console.log('🎂 No hay leads cumpliendo años hoy');
      return;
    }

    // Cargar vendedores para notificarles
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('active', true);

    await procesarCumpleañosLeads(supabase, meta, leadsCumple, teamMembers, fechaHoy);

  } catch (error) {
    console.error('❌ Error en felicitaciones de cumpleaños:', error);
  }
}

async function procesarCumpleañosLeads(
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

    // Verificar si ya lo felicitamos este año (revisar notes)
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

      // Marcar en notes que ya lo felicitamos + guardar contexto para respuesta
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

      // Agrupar por vendedor para notificarle
      const vendedorId = lead.assigned_to;
      const vendedor = lead.team_members || teamMembers?.find(tm => tm.id === vendedorId);
      if (vendedor?.id) {
        if (!cumplesPorVendedor.has(vendedor.id)) {
          cumplesPorVendedor.set(vendedor.id, []);
        }
        cumplesPorVendedor.get(vendedor.id)!.push({ lead, vendedor });
      }

    } catch (e) {
      console.log(`❌ Error felicitando a ${lead.name}:`, e);
    }

    // Esperar entre mensajes
    await new Promise(r => setTimeout(r, 1500));
  }

  // Notificar a vendedores sobre cumpleaños de sus leads
  for (const [vendedorId, cumples] of cumplesPorVendedor) {
    const vendedor = cumples[0].vendedor;
    if (!vendedor?.phone) continue;

    let msg = `🎂 *CUMPLEAÑOS DE TUS CLIENTES*\n\n`;
    msg += `Hoy cumplen años ${cumples.length} de tus leads:\n\n`;

    for (const { lead } of cumples) {
      msg += `• *${lead.name}*\n`;
      msg += `  📱 ${lead.phone}\n`;
      if (lead.property_interest) msg += `  🏠 Interés: ${lead.property_interest}\n`;
      msg += `\n`;
    }

    msg += `💡 *Ya les enviamos felicitación automática.*\n`;
    msg += `_Es buen momento para dar seguimiento personalizado._`;

    try {
      await meta.sendWhatsAppMessage(vendedor.phone, msg);
      console.log(`📤 Notificación de cumpleaños enviada a vendedor ${vendedor.name}`);
    } catch (e) {
      console.log(`Error notificando a vendedor:`, e);
    }
  }

  console.log(`✅ Felicitaciones de cumpleaños completadas: ${felicitados} leads`);
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE CUMPLEAÑOS AL EQUIPO
// Envía mensaje personalizado a vendedores/asesores que cumplen años
// ═══════════════════════════════════════════════════════════════
async function felicitarCumpleañosEquipo(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
    const [, mes, dia] = fechaMexico.split('-');
    const fechaHoy = `${mes}-${dia}`;
    console.log(`🎂 Buscando cumpleaños equipo para fecha: ${fechaHoy} (México)`);

    // Buscar miembros del equipo con birthday (filtrar por mes-día en JS)
    const { data: equipoConBirthday, error } = await supabase.client
      .from('team_members')
      .select('*')
      .not('birthday', 'is', null)
      .eq('active', true)
      .not('phone', 'is', null);

    if (error) {
      console.error('🎂 Error en query equipo:', error);
      return;
    }

    // Filtrar por cumpleaños hoy
    const equipoCumple = equipoConBirthday?.filter(m => {
      if (!m.birthday) return false;
      const bday = m.birthday.toString();
      return bday.endsWith(`-${fechaHoy}`);
    });

    console.log(`🎂 Equipo con birthday: ${equipoConBirthday?.length || 0}, cumpliendo hoy: ${equipoCumple?.length || 0}`);

    if (!equipoCumple || equipoCumple.length === 0) {
      console.log('🎂 No hay miembros del equipo cumpliendo años hoy');
      return;
    }

    const mensajesCumple = [
      `🎂 *¡Feliz Cumpleaños {nombre}!* 🎉\n\nTodo el equipo de Santa Rita te desea un día increíble lleno de alegría.\n\n¡Que este nuevo año de vida te traiga muchos éxitos! 🌟`,
      `🎊 *¡Muchísimas felicidades {nombre}!* 🎂\n\nHoy celebramos contigo este día tan especial.\n\nGracias por ser parte del equipo. ¡Disfruta tu día al máximo! 🥳`,
      `✨ *¡Feliz Cumpleaños {nombre}!* 🎁\n\nEn Santa Rita te enviamos un fuerte abrazo.\n\n¡Que la vida te siga llenando de momentos increíbles! 🎈`
    ];

    let felicitados = 0;

    for (const miembro of equipoCumple) {
      if (!miembro.phone) continue;

      // Verificar si ya lo felicitamos (revisar notes)
      const notes = typeof miembro.notes === 'object' ? miembro.notes : {};
      const notesStr = JSON.stringify(notes);
      if (notesStr.includes(`cumple_felicitado_${fechaHoy}`)) {
        console.log(`⏭️ ${miembro.name} ya felicitado hoy`);
        continue;
      }

      const nombre = miembro.name?.split(' ')[0] || 'compañero';
      const mensaje = mensajesCumple[felicitados % mensajesCumple.length].replace('{nombre}', nombre);

      try {
        await meta.sendWhatsAppMessage(miembro.phone, mensaje);
        felicitados++;
        console.log(`🎂 Felicitado: ${miembro.name}`);

        // Marcar como felicitado + guardar contexto para respuesta
        const pendingBirthdayResponse = {
          type: 'cumpleanos_equipo',
          sent_at: new Date().toISOString(),
          member_id: miembro.id,
          member_name: miembro.name
        };
        await supabase.client.from('team_members').update({
          notes: {
            ...notes,
            [`cumple_felicitado_${fechaHoy}`]: true,
            pending_birthday_response: pendingBirthdayResponse
          }
        }).eq('id', miembro.id);

      } catch (e) {
        console.log(`❌ Error felicitando a ${miembro.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    // Notificar al grupo/CEO si alguien cumple años
    if (felicitados > 0) {
      // Buscar CEO o admin para notificar
      const { data: admins } = await supabase.client
        .from('team_members')
        .select('phone, name')
        .or(`role.eq.ceo,role.eq.admin,role.ilike.%director%`)
        .eq('active', true)
        .not('phone', 'is', null);

      if (admins && admins.length > 0) {
        let msgGrupo = `🎂 *CUMPLEAÑOS DEL EQUIPO HOY*\n\n`;
        for (const m of equipoCumple) {
          msgGrupo += `• *${m.name}* (${m.role || m.position || 'Equipo'})\n`;
        }
        msgGrupo += `\n🎉 ¡Ya les enviamos felicitación automática!`;

        for (const admin of admins) {
          // No notificar al cumpleañero mismo si es admin
          if (equipoCumple.find(e => e.phone === admin.phone)) continue;

          try {
            await meta.sendWhatsAppMessage(admin.phone, msgGrupo);
          } catch (e) {
            console.log('Error notificando admin:', e);
          }
        }
      }
    }

    console.log(`✅ Felicitaciones al equipo completadas: ${felicitados} personas`);
  } catch (error) {
    console.error('❌ Error en felicitaciones de cumpleaños al equipo:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE ANIVERSARIO DE COMPRA
// Envía mensaje a clientes que cumplen 1, 2, 3... años de haber comprado
// ═══════════════════════════════════════════════════════════════
async function felicitarAniversarioCompra(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🏠 Verificando aniversarios de compra...');

    // Usar timezone de México
    const ahora = new Date();
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const fechaMexico = mexicoFormatter.format(ahora);
    const [añoHoy, mesStr, diaStr] = fechaMexico.split('-');
    const mesHoy = parseInt(mesStr);
    const diaHoy = parseInt(diaStr);
    console.log(`🏠 Buscando aniversarios para: ${diaHoy}/${mesHoy} (México)`);

    // Buscar leads que compraron (delivered) y cuyo mes/día de status_changed_at coincide con hoy
    const { data: clientesDelivered, error } = await supabase.client
      .from('leads')
      .select('*')
      .eq('status', 'delivered')
      .not('status_changed_at', 'is', null)
      .not('phone', 'is', null);

    console.log(`🏠 DEBUG: error=${JSON.stringify(error)}, clientes=${clientesDelivered?.length || 0}`);
    if (clientesDelivered && clientesDelivered.length > 0) {
      console.log(`🏠 DEBUG: Primer cliente: ${JSON.stringify({ name: clientesDelivered[0].name, phone: clientesDelivered[0].phone, status: clientesDelivered[0].status, status_changed_at: clientesDelivered[0].status_changed_at })}`);
    }

    if (error || !clientesDelivered || clientesDelivered.length === 0) {
      console.log('🏠 No hay clientes con status delivered');
      return;
    }

    // Filtrar los que cumplen aniversario hoy (usando timezone México)
    const aniversariosHoy = clientesDelivered.filter((cliente: any) => {
      if (!cliente.status_changed_at) return false;
      // Convertir fecha de compra a timezone México
      const fechaCompra = new Date(cliente.status_changed_at);
      const compraEnMexico = mexicoFormatter.format(fechaCompra);
      const [añoCompraStr, mesCompraStr, diaCompraStr] = compraEnMexico.split('-');
      const mesCompra = parseInt(mesCompraStr);
      const diaCompra = parseInt(diaCompraStr);
      const añoCompra = parseInt(añoCompraStr);
      const añosTranscurridos = parseInt(añoHoy) - añoCompra;

      // Solo si es aniversario (mismo día/mes) y ya pasó al menos 1 año
      return mesCompra === mesHoy && diaCompra === diaHoy && añosTranscurridos >= 1;
    });

    if (aniversariosHoy.length === 0) {
      console.log('🏠 No hay aniversarios de compra hoy');
      return;
    }

    console.log(`🏠 Encontrados ${aniversariosHoy.length} aniversarios de compra hoy`);

    // Cargar vendedores por si el join falló
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('active', true);

    let felicitados = 0;
    const aniversariosPorVendedor = new Map<string, any[]>();

    for (const cliente of aniversariosHoy) {
      if (!cliente.phone) continue;

      // Calcular años transcurridos
      const fechaCompra = new Date(cliente.status_changed_at);
      const compraEnMexico = mexicoFormatter.format(fechaCompra);
      const añoCompraNum = parseInt(compraEnMexico.split('-')[0]);
      const años = parseInt(añoHoy) - añoCompraNum;

      // Verificar si ya felicitamos este año (revisar notes)
      const notes = cliente.notes || '';
      const añoActual = parseInt(añoHoy);
      if (typeof notes === 'string' && notes.includes(`Aniversario ${añoActual}`)) {
        console.log(`⏭️ ${cliente.name} ya felicitado este año`);
        continue;
      }
      if (typeof notes === 'object' && JSON.stringify(notes).includes(`Aniversario ${añoActual}`)) {
        console.log(`⏭️ ${cliente.name} ya felicitado este año`);
        continue;
      }

      const nombre = cliente.name?.split(' ')[0] || 'vecino';
      const añoTexto = años === 1 ? 'un año' : `${años} años`;
      const desarrollo = cliente.property_interest || 'Santa Rita';

      // Mensaje personalizado según el año
      let mensaje = '';
      if (años === 1) {
        mensaje = `🏠🎉 *¡Feliz primer aniversario en tu hogar, ${nombre}!*

Hace exactamente un año comenzaste esta nueva etapa en *${desarrollo}*.

Esperamos que este tiempo haya sido lleno de momentos increíbles. ¡Gracias por ser parte de nuestra comunidad!

¿Cómo te ha ido? Nos encantaría saber de ti 😊`;
      } else {
        mensaje = `🏠🎉 *¡Felicidades ${nombre}!*

Hoy se cumplen *${añoTexto}* desde que recibiste las llaves de tu hogar en *${desarrollo}*.

Esperamos que sigas disfrutando tu casa y creando recuerdos increíbles. ¡Gracias por seguir siendo parte de la familia Santa Rita!

🎁 Recuerda que tenemos beneficios especiales para ti si nos recomiendas.`;
      }

      try {
        await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        felicitados++;
        console.log(`🏠 Aniversario ${años} año(s) felicitado: ${cliente.name}`);

        // Marcar como felicitado + guardar contexto para respuesta
        const notesActuales = typeof cliente.notes === 'object' ? cliente.notes : {};
        const pendingAutoResponse = {
          type: 'aniversario',
          sent_at: new Date().toISOString(),
          vendedor_id: cliente.assigned_to,
          años: años
        };
        await supabase.client.from('leads').update({
          notes: typeof notesActuales === 'object'
            ? { ...notesActuales, [`Aniversario ${añoActual}`]: true, pending_auto_response: pendingAutoResponse }
            : `${notesActuales}\n[Aniversario ${añoActual}] Felicitado`
        }).eq('id', cliente.id);

        // Agrupar por vendedor para notificar
        const vendedorId = cliente.assigned_to;
        if (vendedorId) {
          if (!aniversariosPorVendedor.has(vendedorId)) {
            aniversariosPorVendedor.set(vendedorId, []);
          }
          aniversariosPorVendedor.get(vendedorId)!.push({ cliente, años });
        }

      } catch (e) {
        console.log(`❌ Error felicitando aniversario de ${cliente.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    // Notificar a vendedores sobre aniversarios de sus clientes
    for (const [vendedorId, clientes] of aniversariosPorVendedor) {
      const vendedor = teamMembers?.find(tm => tm.id === vendedorId) ||
                       (clientes[0].cliente.team_members as any);
      if (!vendedor?.phone) continue;

      let msg = `🏠 *ANIVERSARIOS DE COMPRA*\n\n`;
      msg += `Hoy celebran aniversario ${clientes.length} de tus clientes:\n\n`;

      for (const { cliente, años } of clientes.slice(0, 5)) {
        msg += `• *${cliente.name}* - ${años} año(s)\n`;
        msg += `  📱 ${cliente.phone}\n`;
        if (cliente.property_interest) msg += `  🏠 ${cliente.property_interest}\n`;
        msg += `\n`;
      }
      if (clientes.length > 5) msg += `_...y ${clientes.length - 5} más_\n`;

      msg += `💡 *Ya les enviamos felicitación automática.*\n`;
      msg += `_Buen momento para pedir referidos 🎁_`;

      try {
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
        console.log(`📤 Notificación de aniversarios enviada a ${vendedor.name}`);
      } catch (e) {
        console.log('Error notificando vendedor:', e);
      }
    }

    console.log(`✅ Felicitaciones de aniversario completadas: ${felicitados} clientes`);
  } catch (error) {
    console.error('❌ Error en felicitaciones de aniversario:', error);
  }
}

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

    // Notificar a asesores (solo si están activos)
    for (const hip of hipotecasEstancadas) {
      const asesor = hip.team_members;
      const lead = hip.leads;

      if (!asesor?.phone || asesor?.is_active === false) continue;

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

    // Enviar resumen a admins (no CEOs)
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('name, phone')
      .in('role', ['admin', 'coordinador'])
      .eq('active', true);

    if (admins && admins.length > 0 && hipotecasEstancadas.length > 0) {
      let resumenAdmin = `📊 *RESUMEN HIPOTECAS ESTANCADAS*\n\n`;
      resumenAdmin += `Total: ${hipotecasEstancadas.length} hipotecas en banco +7 días\n\n`;

      for (const hip of hipotecasEstancadas.slice(0, 5)) {
        const lead = hip.leads;
        const asesor = hip.team_members;
        const diasEnBanco = Math.floor((Date.now() - new Date(hip.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        resumenAdmin += `• *${lead?.name || 'Sin nombre'}*\n`;
        resumenAdmin += `  ${hip.bank || 'Sin banco'} | ${diasEnBanco} días | Asesor: ${asesor?.name || 'N/A'}\n`;
      }

      if (hipotecasEstancadas.length > 5) {
        resumenAdmin += `\n...y ${hipotecasEstancadas.length - 5} más`;
      }

      const telefonosEnviados = new Set<string>();
      for (const admin of admins) {
        if (!admin.phone) continue;
        const tel = admin.phone.replace(/\D/g, '');
        if (telefonosEnviados.has(tel)) continue;
        telefonosEnviados.add(tel);

        try {
          await meta.sendWhatsAppMessage(admin.phone, resumenAdmin);
          console.log(`📊 Resumen hipotecas enviado a admin ${admin.name}`);
        } catch (e) {
          console.log(`Error enviando resumen a admin:`, e);
        }
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
            .replace(/{nombre}/gi, lead.name || '')
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

// ═══════════════════════════════════════════════════════════════════════════
// BRIEFING DE SUPERVISIÓN - Para admins, resumen de todo el funnel
// ═══════════════════════════════════════════════════════════════════════════
async function enviarBriefingSupervision(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // Obtener admins activos
    const { data: admins } = await supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'admin')
      .eq('active', true);

    if (!admins || admins.length === 0) {
      console.log('⏭️ No hay admins activos para enviar briefing de supervisión');
      return;
    }

    // Fechas
    const ahora = new Date();
    const hoyMexico = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
    const hoyStr = hoyMexico.toISOString().split('T')[0];
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const finSemana = new Date(hoyMexico.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Obtener vendedores para mapear nombres
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name')
      .eq('role', 'vendedor')
      .eq('active', true);
    const vendedorMap = new Map((vendedores || []).map(v => [v.id, v.name]));

    // ═══════════════════════════════════════════════════════════════════
    // 1. LEADS NUEVOS SIN CONTACTAR (+24h)
    // ═══════════════════════════════════════════════════════════════════
    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, created_at')
      .eq('status', 'new')
      .lt('created_at', hace24h)
      .order('created_at', { ascending: true });

    // ═══════════════════════════════════════════════════════════════════
    // 2. CITAS DE HOY SIN CONFIRMAR
    // ═══════════════════════════════════════════════════════════════════
    const { data: citasSinConfirmar } = await supabase.client
      .from('appointments')
      .select('id, lead_name, scheduled_time, vendedor_id, status')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled');

    // ═══════════════════════════════════════════════════════════════════
    // 3. PAGOS DE APARTADO PRÓXIMOS (esta semana)
    // ═══════════════════════════════════════════════════════════════════
    const { data: leadsApartado } = await supabase.client
      .from('leads')
      .select('id, name, notes, assigned_to')
      .eq('status', 'reserved');

    const pagosPendientes: any[] = [];
    const pagosVencidos: any[] = [];

    if (leadsApartado) {
      for (const lead of leadsApartado) {
        const apartado = lead.notes?.apartado;
        if (apartado?.fecha_pago) {
          const fechaPago = apartado.fecha_pago;
          const diffDays = Math.ceil((new Date(fechaPago).getTime() - hoyMexico.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            pagosVencidos.push({ ...lead, diasVencido: Math.abs(diffDays) });
          } else if (diffDays <= 7) {
            pagosPendientes.push({ ...lead, diasRestantes: diffDays });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. LEADS ESTANCADOS POR ETAPA
    // ═══════════════════════════════════════════════════════════════════
    // Contacted > 48h sin avanzar
    const { data: leadsContactedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'contacted')
      .lt('updated_at', hace48h);

    // Qualified > 7 días sin cita
    const { data: leadsQualifiedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'qualified')
      .lt('updated_at', hace7d);

    // ═══════════════════════════════════════════════════════════════════
    // 5. FOLLOW-UPS PENDIENTES
    // ═══════════════════════════════════════════════════════════════════
    const { data: followupsPendientes } = await supabase.client
      .from('follow_ups')
      .select('id, lead_id, vendedor_id, scheduled_for, notes')
      .eq('status', 'pending')
      .lte('scheduled_for', ahora.toISOString())
      .order('scheduled_for', { ascending: true });

    // ═══════════════════════════════════════════════════════════════════
    // 6. NO-SHOWS DE AYER
    // ═══════════════════════════════════════════════════════════════════
    const ayerStr = new Date(hoyMexico.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: noShowsAyer } = await supabase.client
      .from('appointments')
      .select('id, lead_name, vendedor_id')
      .eq('scheduled_date', ayerStr)
      .eq('status', 'no-show');

    // ═══════════════════════════════════════════════════════════════════
    // 7. RESUMEN DEL PIPELINE
    // ═══════════════════════════════════════════════════════════════════
    const { data: pipelineCounts } = await supabase.client
      .from('leads')
      .select('status');

    const pipeline: Record<string, number> = {};
    if (pipelineCounts) {
      for (const lead of pipelineCounts) {
        pipeline[lead.status] = (pipeline[lead.status] || 0) + 1;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUIR MENSAJE
    // ═══════════════════════════════════════════════════════════════════
    let mensaje = `👁️ *BRIEFING DE SUPERVISIÓN*\n`;
    mensaje += `📅 ${hoyStr}\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Alertas críticas primero
    let hayAlertas = false;

    if (pagosVencidos.length > 0) {
      hayAlertas = true;
      mensaje += `🚨 *PAGOS VENCIDOS (${pagosVencidos.length})*\n`;
      for (const p of pagosVencidos.slice(0, 5)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `   • ${p.name} - ${p.diasVencido} días (${vendedor})\n`;
      }
      if (pagosVencidos.length > 5) {
        mensaje += `   _... y ${pagosVencidos.length - 5} más_\n`;
      }
      mensaje += `\n`;
    }

    if ((leadsSinContactar?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `⚠️ *LEADS SIN CONTACTAR +24h (${leadsSinContactar!.length})*\n`;
      for (const l of leadsSinContactar!.slice(0, 5)) {
        const vendedor = vendedorMap.get(l.assigned_to) || '?';
        const horasTranscurridas = Math.floor((ahora.getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60));
        const nombreLead = l.name || l.phone || 'Sin nombre';
        mensaje += `   • ${nombreLead} - ${horasTranscurridas}h (${vendedor})\n`;
      }
      if (leadsSinContactar!.length > 5) {
        mensaje += `   _... y ${leadsSinContactar!.length - 5} más_\n`;
      }
      mensaje += `\n`;
    }

    if ((noShowsAyer?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `👻 *NO-SHOWS AYER (${noShowsAyer!.length})*\n`;
      for (const ns of noShowsAyer!.slice(0, 5)) {
        const vendedor = vendedorMap.get(ns.vendedor_id) || '?';
        mensaje += `   • ${ns.lead_name} (${vendedor})\n`;
      }
      if (noShowsAyer!.length > 5) {
        mensaje += `   _... y ${noShowsAyer!.length - 5} más_\n`;
      }
      mensaje += `\n`;
    }

    // Atención requerida
    mensaje += `📋 *ATENCIÓN HOY*\n`;

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `   📅 Citas sin confirmar: ${citasSinConfirmar!.length}\n`;
      for (const c of citasSinConfirmar!.slice(0, 3)) {
        const vendedor = vendedorMap.get(c.vendedor_id) || '?';
        mensaje += `      • ${c.lead_name} ${c.scheduled_time?.slice(0, 5)} (${vendedor})\n`;
      }
    } else {
      mensaje += `   📅 Citas: ✅ Todas confirmadas\n`;
    }

    if (pagosPendientes.length > 0) {
      mensaje += `   💰 Pagos esta semana: ${pagosPendientes.length}\n`;
      for (const p of pagosPendientes.slice(0, 3)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `      • ${p.name} en ${p.diasRestantes}d (${vendedor})\n`;
      }
    }

    if ((followupsPendientes?.length || 0) > 0) {
      mensaje += `   📞 Follow-ups vencidos: ${followupsPendientes!.length}\n`;
    }

    mensaje += `\n`;

    // Leads estancados
    const totalEstancados = (leadsContactedEstancados?.length || 0) + (leadsQualifiedEstancados?.length || 0);
    if (totalEstancados > 0) {
      mensaje += `⏳ *LEADS ESTANCADOS (${totalEstancados})*\n`;
      if ((leadsContactedEstancados?.length || 0) > 0) {
        mensaje += `   • Contacted +48h: ${leadsContactedEstancados!.length}\n`;
      }
      if ((leadsQualifiedEstancados?.length || 0) > 0) {
        mensaje += `   • Qualified +7d: ${leadsQualifiedEstancados!.length}\n`;
      }
      mensaje += `\n`;
    }

    // Resumen pipeline
    mensaje += `📊 *PIPELINE ACTUAL*\n`;
    mensaje += `   New: ${pipeline['new'] || 0} | Contacted: ${pipeline['contacted'] || 0}\n`;
    mensaje += `   Qualified: ${pipeline['qualified'] || 0} | Visited: ${pipeline['visited'] || 0}\n`;
    mensaje += `   Reserved: ${pipeline['reserved'] || 0} | Sold: ${pipeline['sold'] || 0}\n`;
    mensaje += `\n`;

    // Análisis por vendedor - quién necesita atención
    const vendedorStats: Record<string, { sinContactar: number; estancados: number; citasPendientes: number }> = {};

    // Inicializar todos los vendedores
    for (const [id, name] of vendedorMap) {
      vendedorStats[name] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
    }

    // Contar leads sin contactar por vendedor
    if (leadsSinContactar) {
      for (const l of leadsSinContactar) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].sinContactar++;
      }
    }

    // Contar estancados por vendedor
    if (leadsContactedEstancados) {
      for (const l of leadsContactedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }
    if (leadsQualifiedEstancados) {
      for (const l of leadsQualifiedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }

    // Contar citas pendientes por vendedor
    if (citasSinConfirmar) {
      for (const c of citasSinConfirmar) {
        const v = vendedorMap.get(c.vendedor_id) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].citasPendientes++;
      }
    }

    // Vendedores que necesitan atención (tienen pendientes)
    const vendedoresConProblemas = Object.entries(vendedorStats)
      .filter(([_, stats]) => stats.sinContactar > 0 || stats.estancados > 0 || stats.citasPendientes > 0)
      .sort((a, b) => (b[1].sinContactar + b[1].estancados) - (a[1].sinContactar + a[1].estancados))
      .slice(0, 5);

    // ═══════════════════════════════════════════════════════════════════
    // ANÁLISIS INTELIGENTE - Detectar situación crítica
    // ═══════════════════════════════════════════════════════════════════
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    const totalSinContactar = leadsSinContactar?.length || 0;
    const pipelineParado = (pipeline['contacted'] || 0) === 0 && (pipeline['qualified'] || 0) === 0;
    const leadMasViejo = leadsSinContactar?.[0];
    const horasMasViejo = leadMasViejo ? Math.floor((ahora.getTime() - new Date(leadMasViejo.created_at).getTime()) / (1000 * 60 * 60)) : 0;

    // Determinar nivel de criticidad
    const esCritico = totalSinContactar >= 10 || horasMasViejo > 48 || pipelineParado;
    const esPreocupante = totalSinContactar >= 5 || horasMasViejo > 24;

    if (esCritico) {
      mensaje += `🚨 *SITUACIÓN CRÍTICA*\n\n`;

      if (pipelineParado && totalSinContactar > 0) {
        mensaje += `⛔ El pipeline está PARADO:\n`;
        mensaje += `   • ${pipeline['new'] || 0} leads en "new"\n`;
        mensaje += `   • 0 avanzando a siguiente etapa\n`;
        mensaje += `   • Los leads se van a enfriar\n\n`;
      }

      if (totalSinContactar >= 10) {
        mensaje += `⚠️ ${totalSinContactar} leads sin primer contacto\n`;
        mensaje += `   • El más viejo: ${horasMasViejo}h (${Math.floor(horasMasViejo/24)} días)\n`;
        mensaje += `   • Probabilidad de conversión cayendo\n\n`;
      }

      mensaje += `📢 *ACCIÓN INMEDIATA REQUERIDA*\n`;
      mensaje += `1. Junta urgente con vendedores\n`;
      mensaje += `2. Cada uno debe contactar sus leads HOY\n`;
      mensaje += `3. Meta: 0 leads +24h para mañana\n\n`;

    } else if (esPreocupante) {
      mensaje += `⚠️ *ATENCIÓN REQUERIDA*\n\n`;
      mensaje += `${totalSinContactar} leads esperando contacto\n`;
      mensaje += `Lead más viejo: ${horasMasViejo}h\n\n`;
    }

    // Mostrar vendedores con problemas
    if (vendedoresConProblemas.length > 0) {
      mensaje += `👥 *VENDEDORES CON PENDIENTES*\n`;
      for (const [nombre, stats] of vendedoresConProblemas) {
        const problemas: string[] = [];
        if (stats.sinContactar > 0) problemas.push(`${stats.sinContactar} sin contactar`);
        if (stats.estancados > 0) problemas.push(`${stats.estancados} estancados`);
        if (stats.citasPendientes > 0) problemas.push(`${stats.citasPendientes} citas`);
        mensaje += `• ${nombre}: ${problemas.join(', ')}\n`;
      }
      mensaje += `\n`;
    }

    // Acciones concretas del día
    mensaje += `📌 *CHECKLIST DE HOY*\n`;

    if (esCritico) {
      mensaje += `☐ Llamar a cada vendedor para revisar leads\n`;
      if (totalSinContactar > 0) {
        mensaje += `☐ Asegurar contacto de ${Math.min(totalSinContactar, 10)} leads\n`;
      }
    }

    if (pagosVencidos.length > 0) {
      mensaje += `☐ Cobrar ${pagosVencidos.length} pago(s) vencido(s)\n`;
    }

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `☐ Confirmar ${citasSinConfirmar!.length} cita(s) de hoy\n`;
    }

    if (pagosPendientes.length > 0) {
      const proximo = pagosPendientes.sort((a, b) => a.diasRestantes - b.diasRestantes)[0];
      mensaje += `☐ Recordar pago: ${proximo.name} (${proximo.diasRestantes}d)\n`;
    }

    if (!esCritico && !esPreocupante && pagosVencidos.length === 0 && (citasSinConfirmar?.length || 0) === 0) {
      mensaje += `✅ Todo en orden - buen trabajo!\n`;
    }

    // Enviar a cada admin
    for (const admin of admins) {
      if (!admin.phone) continue;
      try {
        await meta.sendWhatsAppMessage(admin.phone, mensaje);
        console.log(`✅ Briefing supervisión enviado a ${admin.name}`);
      } catch (err) {
        console.error(`❌ Error enviando briefing a ${admin.name}:`, err);
      }
    }

  } catch (e) {
    console.error('Error en briefing de supervisión:', e);
  }
}

// Versión test para enviar a un número específico
async function enviarBriefingSupervisionTest(supabase: SupabaseService, meta: MetaWhatsAppService, testPhone: string): Promise<void> {
  try {
    // Fechas
    const ahora = new Date();
    const hoyMexico = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
    const hoyStr = hoyMexico.toISOString().split('T')[0];
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Obtener vendedores para mapear nombres
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name')
      .eq('role', 'vendedor')
      .eq('active', true);
    const vendedorMap = new Map((vendedores || []).map(v => [v.id, v.name]));

    // 1. LEADS NUEVOS SIN CONTACTAR (+24h)
    const { data: leadsSinContactar } = await supabase.client
      .from('leads')
      .select('id, name, phone, assigned_to, created_at')
      .eq('status', 'new')
      .lt('created_at', hace24h)
      .order('created_at', { ascending: true });

    // 2. CITAS DE HOY SIN CONFIRMAR
    const { data: citasSinConfirmar } = await supabase.client
      .from('appointments')
      .select('id, lead_name, scheduled_time, vendedor_id, status')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled');

    // 3. PAGOS DE APARTADO
    const { data: leadsApartado } = await supabase.client
      .from('leads')
      .select('id, name, notes, assigned_to')
      .eq('status', 'reserved');

    const pagosPendientes: any[] = [];
    const pagosVencidos: any[] = [];

    if (leadsApartado) {
      for (const lead of leadsApartado) {
        const apartado = lead.notes?.apartado;
        if (apartado?.fecha_pago) {
          const fechaPago = apartado.fecha_pago;
          const diffDays = Math.ceil((new Date(fechaPago).getTime() - hoyMexico.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            pagosVencidos.push({ ...lead, diasVencido: Math.abs(diffDays) });
          } else if (diffDays <= 7) {
            pagosPendientes.push({ ...lead, diasRestantes: diffDays });
          }
        }
      }
    }

    // 4. LEADS ESTANCADOS
    const { data: leadsContactedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'contacted')
      .lt('updated_at', hace48h);

    const { data: leadsQualifiedEstancados } = await supabase.client
      .from('leads')
      .select('id, name, assigned_to, updated_at')
      .eq('status', 'qualified')
      .lt('updated_at', hace7d);

    // 5. FOLLOW-UPS PENDIENTES
    const { data: followupsPendientes } = await supabase.client
      .from('follow_ups')
      .select('id, lead_id, vendedor_id, scheduled_for, notes')
      .eq('status', 'pending')
      .lte('scheduled_for', ahora.toISOString());

    // 6. NO-SHOWS DE AYER
    const ayerStr = new Date(hoyMexico.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: noShowsAyer } = await supabase.client
      .from('appointments')
      .select('id, lead_name, vendedor_id')
      .eq('scheduled_date', ayerStr)
      .eq('status', 'no-show');

    // 7. PIPELINE
    const { data: pipelineCounts } = await supabase.client.from('leads').select('status');
    const pipeline: Record<string, number> = {};
    if (pipelineCounts) {
      for (const lead of pipelineCounts) {
        pipeline[lead.status] = (pipeline[lead.status] || 0) + 1;
      }
    }

    // CONSTRUIR MENSAJE
    let mensaje = `👁️ *BRIEFING DE SUPERVISIÓN*\n`;
    mensaje += `📅 ${hoyStr}\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    let hayAlertas = false;

    if (pagosVencidos.length > 0) {
      hayAlertas = true;
      mensaje += `🚨 *PAGOS VENCIDOS (${pagosVencidos.length})*\n`;
      for (const p of pagosVencidos.slice(0, 5)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `   • ${p.name} - ${p.diasVencido} días (${vendedor})\n`;
      }
      mensaje += `\n`;
    }

    if ((leadsSinContactar?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `⚠️ *LEADS SIN CONTACTAR +24h (${leadsSinContactar!.length})*\n`;
      for (const l of leadsSinContactar!.slice(0, 5)) {
        const vendedor = vendedorMap.get(l.assigned_to) || '?';
        const horasTranscurridas = Math.floor((ahora.getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60));
        const nombreLead = l.name || l.phone || 'Sin nombre';
        mensaje += `   • ${nombreLead} - ${horasTranscurridas}h (${vendedor})\n`;
      }
      mensaje += `\n`;
    }

    if ((noShowsAyer?.length || 0) > 0) {
      hayAlertas = true;
      mensaje += `👻 *NO-SHOWS AYER (${noShowsAyer!.length})*\n`;
      for (const ns of noShowsAyer!.slice(0, 5)) {
        const vendedor = vendedorMap.get(ns.vendedor_id) || '?';
        mensaje += `   • ${ns.lead_name} (${vendedor})\n`;
      }
      mensaje += `\n`;
    }

    mensaje += `📋 *ATENCIÓN HOY*\n`;

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `   📅 Citas sin confirmar: ${citasSinConfirmar!.length}\n`;
      for (const c of citasSinConfirmar!.slice(0, 3)) {
        const vendedor = vendedorMap.get(c.vendedor_id) || '?';
        mensaje += `      • ${c.lead_name} ${c.scheduled_time?.slice(0, 5)} (${vendedor})\n`;
      }
    } else {
      mensaje += `   📅 Citas: ✅ Todas confirmadas\n`;
    }

    if (pagosPendientes.length > 0) {
      mensaje += `   💰 Pagos esta semana: ${pagosPendientes.length}\n`;
      for (const p of pagosPendientes.slice(0, 3)) {
        const vendedor = vendedorMap.get(p.assigned_to) || '?';
        mensaje += `      • ${p.name} en ${p.diasRestantes}d (${vendedor})\n`;
      }
    }

    if ((followupsPendientes?.length || 0) > 0) {
      mensaje += `   📞 Follow-ups vencidos: ${followupsPendientes!.length}\n`;
    }

    mensaje += `\n`;

    const totalEstancados = (leadsContactedEstancados?.length || 0) + (leadsQualifiedEstancados?.length || 0);
    if (totalEstancados > 0) {
      mensaje += `⏳ *LEADS ESTANCADOS (${totalEstancados})*\n`;
      if ((leadsContactedEstancados?.length || 0) > 0) {
        mensaje += `   • Contacted +48h: ${leadsContactedEstancados!.length}\n`;
      }
      if ((leadsQualifiedEstancados?.length || 0) > 0) {
        mensaje += `   • Qualified +7d: ${leadsQualifiedEstancados!.length}\n`;
      }
      mensaje += `\n`;
    }

    mensaje += `📊 *PIPELINE ACTUAL*\n`;
    mensaje += `   New: ${pipeline['new'] || 0} | Contacted: ${pipeline['contacted'] || 0}\n`;
    mensaje += `   Qualified: ${pipeline['qualified'] || 0} | Visited: ${pipeline['visited'] || 0}\n`;
    mensaje += `   Reserved: ${pipeline['reserved'] || 0} | Sold: ${pipeline['sold'] || 0}\n`;
    mensaje += `\n`;

    // Análisis por vendedor
    const vendedorStats: Record<string, { sinContactar: number; estancados: number; citasPendientes: number }> = {};

    for (const [id, name] of vendedorMap) {
      vendedorStats[name] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
    }

    if (leadsSinContactar) {
      for (const l of leadsSinContactar) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].sinContactar++;
      }
    }

    if (leadsContactedEstancados) {
      for (const l of leadsContactedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }
    if (leadsQualifiedEstancados) {
      for (const l of leadsQualifiedEstancados) {
        const v = vendedorMap.get(l.assigned_to) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].estancados++;
      }
    }

    if (citasSinConfirmar) {
      for (const c of citasSinConfirmar) {
        const v = vendedorMap.get(c.vendedor_id) || 'Sin asignar';
        if (!vendedorStats[v]) vendedorStats[v] = { sinContactar: 0, estancados: 0, citasPendientes: 0 };
        vendedorStats[v].citasPendientes++;
      }
    }

    const vendedoresConProblemas = Object.entries(vendedorStats)
      .filter(([_, stats]) => stats.sinContactar > 0 || stats.estancados > 0 || stats.citasPendientes > 0)
      .sort((a, b) => (b[1].sinContactar + b[1].estancados) - (a[1].sinContactar + a[1].estancados))
      .slice(0, 5);

    // Análisis inteligente
    mensaje += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    const totalSinContactar = leadsSinContactar?.length || 0;
    const pipelineParado = (pipeline['contacted'] || 0) === 0 && (pipeline['qualified'] || 0) === 0;
    const leadMasViejo = leadsSinContactar?.[0];
    const horasMasViejo = leadMasViejo ? Math.floor((ahora.getTime() - new Date(leadMasViejo.created_at).getTime()) / (1000 * 60 * 60)) : 0;

    const esCritico = totalSinContactar >= 10 || horasMasViejo > 48 || pipelineParado;
    const esPreocupante = totalSinContactar >= 5 || horasMasViejo > 24;

    if (esCritico) {
      mensaje += `🚨 *SITUACIÓN CRÍTICA*\n\n`;

      if (pipelineParado && totalSinContactar > 0) {
        mensaje += `⛔ El pipeline está PARADO:\n`;
        mensaje += `   • ${pipeline['new'] || 0} leads en "new"\n`;
        mensaje += `   • 0 avanzando a siguiente etapa\n`;
        mensaje += `   • Los leads se van a enfriar\n\n`;
      }

      if (totalSinContactar >= 10) {
        mensaje += `⚠️ ${totalSinContactar} leads sin primer contacto\n`;
        mensaje += `   • El más viejo: ${horasMasViejo}h (${Math.floor(horasMasViejo/24)} días)\n`;
        mensaje += `   • Probabilidad de conversión cayendo\n\n`;
      }

      mensaje += `📢 *ACCIÓN INMEDIATA REQUERIDA*\n`;
      mensaje += `1. Junta urgente con vendedores\n`;
      mensaje += `2. Cada uno debe contactar sus leads HOY\n`;
      mensaje += `3. Meta: 0 leads +24h para mañana\n\n`;

    } else if (esPreocupante) {
      mensaje += `⚠️ *ATENCIÓN REQUERIDA*\n\n`;
      mensaje += `${totalSinContactar} leads esperando contacto\n`;
      mensaje += `Lead más viejo: ${horasMasViejo}h\n\n`;
    }

    if (vendedoresConProblemas.length > 0) {
      mensaje += `👥 *VENDEDORES CON PENDIENTES*\n`;
      for (const [nombre, stats] of vendedoresConProblemas) {
        const problemas: string[] = [];
        if (stats.sinContactar > 0) problemas.push(`${stats.sinContactar} sin contactar`);
        if (stats.estancados > 0) problemas.push(`${stats.estancados} estancados`);
        if (stats.citasPendientes > 0) problemas.push(`${stats.citasPendientes} citas`);
        mensaje += `• ${nombre}: ${problemas.join(', ')}\n`;
      }
      mensaje += `\n`;
    }

    mensaje += `📌 *CHECKLIST DE HOY*\n`;

    if (esCritico) {
      mensaje += `☐ Llamar a cada vendedor para revisar leads\n`;
      if (totalSinContactar > 0) {
        mensaje += `☐ Asegurar contacto de ${Math.min(totalSinContactar, 10)} leads\n`;
      }
    }

    if (pagosVencidos.length > 0) {
      mensaje += `☐ Cobrar ${pagosVencidos.length} pago(s) vencido(s)\n`;
    }

    if ((citasSinConfirmar?.length || 0) > 0) {
      mensaje += `☐ Confirmar ${citasSinConfirmar!.length} cita(s) de hoy\n`;
    }

    if (pagosPendientes.length > 0) {
      const proximo = pagosPendientes.sort((a, b) => a.diasRestantes - b.diasRestantes)[0];
      mensaje += `☐ Recordar pago: ${proximo.name} (${proximo.diasRestantes}d)\n`;
    }

    if (!esCritico && !esPreocupante && pagosVencidos.length === 0 && (citasSinConfirmar?.length || 0) === 0) {
      mensaje += `✅ Todo en orden - buen trabajo!\n`;
    }

    await meta.sendWhatsAppMessage(testPhone, mensaje);
    console.log(`✅ Briefing supervisión TEST enviado a ${testPhone}`);

  } catch (e) {
    console.error('Error en briefing de supervisión test:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RE-ENGAGEMENT - Alerta a vendedores sobre leads sin respuesta
// ═══════════════════════════════════════════════════════════════════════════
async function verificarReengagement(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // Buscar leads que necesitan atención:
    // - Status: new o contacted
    // - No han sido actualizados en 48h
    const { data: leads, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, updated_at, assigned_to, lead_category')
      .in('status', ['new', 'contacted'])
      .lt('updated_at', hace48h)
      .not('phone', 'is', null)
      .order('updated_at', { ascending: true });

    if (error || !leads || leads.length === 0) {
      console.log('📭 Sin leads para re-engagement');
      return;
    }

    console.log(`🔄 Re-engagement: ${leads.length} leads sin respuesta 48h+`);

    // Obtener vendedores
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores) return;

    // Agrupar leads por vendedor
    const leadsPorVendedor: Record<string, { vendedor: any; leads: any[] }> = {};

    for (const v of vendedores) {
      leadsPorVendedor[v.id] = { vendedor: v, leads: [] };
    }

    for (const lead of leads) {
      if (lead.assigned_to && leadsPorVendedor[lead.assigned_to]) {
        // Solo incluir si no le hemos alertado hoy
        const alertaHoy = lead.notes?.reengagement_alert_sent;
        const hoyStr = ahora.toISOString().split('T')[0];

        if (alertaHoy !== hoyStr) {
          leadsPorVendedor[lead.assigned_to].leads.push(lead);
        }
      }
    }

    // Enviar alerta a cada vendedor que tenga leads pendientes
    for (const vendedorId of Object.keys(leadsPorVendedor)) {
      const { vendedor, leads: leadsVendedor } = leadsPorVendedor[vendedorId];

      if (leadsVendedor.length === 0 || !vendedor.phone) continue;

      // Calcular horas sin respuesta
      const leadsConHoras = leadsVendedor.map(l => ({
        ...l,
        horasSinRespuesta: Math.floor((ahora.getTime() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60))
      })).slice(0, 5); // Máximo 5 por mensaje

      let mensaje = `🔔 *LEADS SIN RESPUESTA*\n\n`;
      mensaje += `Tienes ${leadsVendedor.length} lead(s) que no han respondido en 48h+:\n\n`;

      for (const lead of leadsConHoras) {
        const nombre = lead.name || lead.phone;
        const categoria = lead.lead_category ? ` (${lead.lead_category})` : '';
        const interes = lead.notes?.interested_in ? `\n   Interés: ${lead.notes.interested_in}` : '';
        mensaje += `• *${nombre}*${categoria}\n   ⏰ ${lead.horasSinRespuesta}h sin respuesta${interes}\n\n`;
      }

      if (leadsVendedor.length > 5) {
        mensaje += `_...y ${leadsVendedor.length - 5} más_\n\n`;
      }

      mensaje += `💡 *¿Qué hacer?*\n`;
      mensaje += `Revisa cada lead y decide si:\n`;
      mensaje += `• Enviarles un mensaje personalizado\n`;
      mensaje += `• Llamarles directamente\n`;
      mensaje += `• Marcarlos como "no interesado"\n`;

      try {
        await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
        console.log(`   ✅ Alerta enviada a ${vendedor.name}: ${leadsVendedor.length} leads`);

        // Marcar que ya se alertó hoy para estos leads
        const hoyStr = ahora.toISOString().split('T')[0];
        for (const lead of leadsVendedor) {
          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...lead.notes,
                reengagement_alert_sent: hoyStr
              }
            })
            .eq('id', lead.id);
        }

      } catch (err) {
        console.error(`   ❌ Error alertando a ${vendedor.name}:`, err);
      }
    }

    console.log(`🔄 Re-engagement completado`);

  } catch (e) {
    console.error('Error en verificarReengagement:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADS FRÍOS - Secuencia de re-engagement directo al lead
// Día 3: Recordatorio amigable
// Día 7: Propuesta de valor / oferta
// Día 14: Último intento antes de marcar como frío
// ═══════════════════════════════════════════════════════════════════════════
async function reengagementDirectoLeads(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();

    // Fechas límite para cada etapa
    const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace14dias = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
    const hace21dias = new Date(ahora.getTime() - 21 * 24 * 60 * 60 * 1000);

    // Buscar leads potenciales para re-engagement
    // Status: new, contacted, qualified (no scheduled, visited, negotiation, etc.)
    const { data: leads, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, status, notes, updated_at, assigned_to, property_interest, lead_category')
      .in('status', ['new', 'contacted', 'qualified'])
      .lt('updated_at', hace3dias.toISOString())
      .not('phone', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(50);

    console.log(`❄️ DEBUG: Buscando leads con updated_at < ${hace3dias.toISOString()}`);
    console.log(`❄️ DEBUG: Query result - error: ${error?.message || 'ninguno'}, leads: ${leads?.length || 0}`);

    if (error || !leads || leads.length === 0) {
      console.log('❄️ Sin leads fríos para re-engagement');
      return;
    }

    console.log(`❄️ Leads fríos encontrados: ${leads.length}`);

    let mensajesEnviados = 0;
    const hoyStr = ahora.toISOString().split('T')[0];

    for (const lead of leads) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const ultimaActualizacion = new Date(lead.updated_at);
      const diasSinRespuesta = Math.floor((ahora.getTime() - ultimaActualizacion.getTime()) / (1000 * 60 * 60 * 24));

      // Verificar qué mensajes ya se enviaron
      const reengagement = notas?.reengagement || {};
      const paso1Enviado = reengagement.paso1_sent;
      const paso2Enviado = reengagement.paso2_sent;
      const paso3Enviado = reengagement.paso3_sent;
      const ultimoEnvio = reengagement.last_sent;

      // No enviar si ya enviamos hoy
      if (ultimoEnvio === hoyStr) {
        continue;
      }

      // No enviar si ya completamos la secuencia
      if (paso3Enviado) {
        // Si pasaron 21+ días sin respuesta después del paso 3, marcar como frío
        if (diasSinRespuesta >= 21 && !notas?.marked_cold) {
          await supabase.client
            .from('leads')
            .update({
              status: 'cold',
              notes: { ...notas, marked_cold: true, marked_cold_at: ahora.toISOString() }
            })
            .eq('id', lead.id);
          console.log(`🥶 Lead ${lead.name} marcado como FRÍO (21+ días sin respuesta)`);
        }
        continue;
      }

      const nombreCorto = lead.name?.split(' ')[0] || '';
      const desarrollo = lead.property_interest || 'nuestros desarrollos';
      let pasoActual = '';

      // Determinar qué paso enviar
      // PASO 1: Día 3-6 - Recordatorio amigable
      if (!paso1Enviado && diasSinRespuesta >= 3 && diasSinRespuesta < 7) {
        pasoActual = 'paso1';
      }
      // PASO 2: Día 7-13 - Segundo intento
      else if (paso1Enviado && !paso2Enviado && diasSinRespuesta >= 7 && diasSinRespuesta < 14) {
        pasoActual = 'paso2';
      }
      // PASO 3: Día 14+ - Último intento
      else if (paso1Enviado && paso2Enviado && !paso3Enviado && diasSinRespuesta >= 14) {
        pasoActual = 'paso3';
      }

      // Enviar template si corresponde
      if (pasoActual) {
        try {
          // Usar template aprobado "seguimiento_lead" con variables
          // Template: ¡Hola {{1}}! 👋 Hace unos días platicamos sobre *{{2}}*...
          const templateComponents = [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: nombreCorto },
                { type: 'text', text: desarrollo }
              ]
            }
          ];

          await meta.sendTemplate(lead.phone, 'seguimiento_lead', 'es_MX', templateComponents);
          console.log(`❄️ Re-engagement ${pasoActual} (template) enviado a ${lead.name} (${diasSinRespuesta} días)`);

          // Actualizar tracking + guardar contexto para respuesta
          const nuevoReengagement = {
            ...reengagement,
            [`${pasoActual}_sent`]: hoyStr,
            last_sent: hoyStr,
            last_step: pasoActual
          };

          // Guardar pending_auto_response para que el sistema sepa responder si el lead contesta
          const pendingAutoResponse = {
            type: 'lead_frio',
            sent_at: ahora.toISOString(),
            vendedor_id: lead.assigned_to,
            step: pasoActual
          };

          await supabase.client
            .from('leads')
            .update({
              notes: { ...notas, reengagement: nuevoReengagement, pending_auto_response: pendingAutoResponse }
            })
            .eq('id', lead.id);

          // Registrar actividad
          await supabase.client.from('lead_activities').insert({
            lead_id: lead.id,
            team_member_id: lead.assigned_to,
            activity_type: 'reengagement',
            notes: `Re-engagement automático ${pasoActual}: ${diasSinRespuesta} días sin respuesta`,
            created_at: ahora.toISOString()
          });

          mensajesEnviados++;

          // Limitar a 10 mensajes por ejecución para no saturar
          if (mensajesEnviados >= 10) {
            console.log('❄️ Límite de 10 mensajes alcanzado, continuará en próxima ejecución');
            break;
          }

        } catch (err) {
          console.error(`❄️ Error enviando re-engagement a ${lead.name}:`, err);
        }
      }
    }

    console.log(`❄️ Re-engagement directo completado: ${mensajesEnviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en reengagementDirectoLeads:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGUIMIENTO POST-VENTA - Pedir referidos después de la venta
// ═══════════════════════════════════════════════════════════════════════════
async function seguimientoPostVenta(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();

    // Buscar leads con status 'sold'
    const { data: clientes, error } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, updated_at, assigned_to')
      .eq('status', 'sold')
      .not('phone', 'is', null);

    if (error || !clientes || clientes.length === 0) {
      console.log('📭 Sin clientes para seguimiento post-venta');
      return;
    }

    console.log(`🎉 Post-venta: ${clientes.length} clientes vendidos`);

    // Obtener vendedores
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('role', 'vendedor')
      .eq('active', true);
    const vendedorMap = new Map((vendedores || []).map(v => [v.id, v]));

    let enviados = 0;

    for (const cliente of clientes) {
      // Calcular días desde la venta
      const fechaVenta = cliente.notes?.fecha_venta || cliente.updated_at;
      const diasDesdeVenta = Math.floor((ahora.getTime() - new Date(fechaVenta).getTime()) / (1000 * 60 * 60 * 24));

      // Obtener estado de seguimiento
      const postVenta = cliente.notes?.post_venta || { etapa: 0, ultimo_contacto: null };
      const nombreCliente = cliente.name?.split(' ')[0] || 'vecino';

      // Determinar qué mensaje enviar
      let mensaje: string | null = null;
      let etapaNueva = postVenta.etapa;
      let notificarVendedor = false;

      // Etapa 0 → 1: A los 30 días, preguntar cómo está
      if (postVenta.etapa === 0 && diasDesdeVenta >= 30) {
        mensaje = `¡Hola ${nombreCliente}! 🏡\n\n`;
        mensaje += `Han pasado unas semanas desde que te entregamos tu nuevo hogar y queríamos saber cómo te ha ido.\n\n`;
        mensaje += `¿Todo bien con la propiedad? ¿Hay algo en lo que podamos ayudarte?\n\n`;
        mensaje += `Nos da mucho gusto que seas parte de nuestra comunidad. 😊`;
        etapaNueva = 1;

      // Etapa 1 → 2: A los 60 días, pedir referidos (usando TEMPLATE)
      } else if (postVenta.etapa === 1 && diasDesdeVenta >= 60) {
        // Usar template referidos_postventa
        const desarrollo = cliente.notes?.property_interest || cliente.notes?.desarrollo || 'tu desarrollo';
        try {
          const templateComponents = [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: nombreCliente },
                { type: 'text', text: desarrollo }
              ]
            }
          ];
          await meta.sendTemplate(cliente.phone, 'referidos_postventa', 'es_MX', templateComponents);
          console.log(`   ✅ Post-venta etapa 2 (template referidos) enviado a ${cliente.name}`);

          // Actualizar notas + guardar contexto para respuesta
          const nuevasNotas = {
            ...cliente.notes,
            post_venta: {
              etapa: 2,
              ultimo_contacto: ahora.toISOString(),
              historial: [...(postVenta.historial || []), { etapa: 2, fecha: ahora.toISOString() }]
            },
            pending_auto_response: {
              type: 'postventa',
              sent_at: ahora.toISOString(),
              vendedor_id: cliente.assigned_to,
              etapa: 2
            }
          };
          await supabase.client.from('leads').update({ notes: nuevasNotas }).eq('id', cliente.id);
          enviados++;

          // Notificar al vendedor
          const vendedor = vendedorMap.get(cliente.assigned_to);
          if (vendedor?.phone) {
            await meta.sendWhatsAppMessage(vendedor.phone,
              `🎯 *Oportunidad de referidos*\n\nSe envió mensaje pidiendo referidos a *${cliente.name}*.\n\nSi responde con contactos, dale seguimiento rápido.`
            );
          }
        } catch (templateErr) {
          console.log(`⚠️ Template referidos falló para ${cliente.name}:`, templateErr);
        }
        continue; // Ya procesamos este cliente

      // Etapa 2 → 3: A los 90 días, último recordatorio de referidos
      } else if (postVenta.etapa === 2 && diasDesdeVenta >= 90) {
        mensaje = `¡Hola ${nombreCliente}! 🌟\n\n`;
        mensaje += `¿Cómo va todo con tu casa? Esperamos que de maravilla.\n\n`;
        mensaje += `Te recordamos que si recomiendas a alguien que compre con nosotros, tienes un *bono de agradecimiento* esperándote.\n\n`;
        mensaje += `¿Tienes a alguien en mente? Solo mándanos su contacto. 📲\n\n`;
        mensaje += `¡Gracias por ser parte de nuestra familia! 🏠❤️`;
        etapaNueva = 3;
      }

      // Enviar mensaje si corresponde
      if (mensaje) {
        try {
          await meta.sendWhatsAppMessage(cliente.phone, mensaje);
          console.log(`   ✅ Post-venta etapa ${etapaNueva} enviado a ${cliente.name || cliente.phone}`);

          // Actualizar notas del cliente + guardar contexto para respuesta
          const nuevasNotas = {
            ...cliente.notes,
            post_venta: {
              etapa: etapaNueva,
              ultimo_contacto: ahora.toISOString(),
              historial: [
                ...(postVenta.historial || []),
                { etapa: etapaNueva, fecha: ahora.toISOString() }
              ]
            },
            pending_auto_response: {
              type: 'postventa',
              sent_at: ahora.toISOString(),
              vendedor_id: cliente.assigned_to,
              etapa: etapaNueva
            }
          };

          await supabase.client
            .from('leads')
            .update({ notes: nuevasNotas })
            .eq('id', cliente.id);

          // Notificar al vendedor cuando se piden referidos
          if (notificarVendedor) {
            const vendedor = vendedorMap.get(cliente.assigned_to);
            if (vendedor?.phone) {
              const notif = `🎯 *Oportunidad de referidos*\n\n`;
              const notifMsg = notif + `Se envió mensaje pidiendo referidos a *${cliente.name}*.\n\nSi responde con contactos, dale seguimiento rápido.`;
              await meta.sendWhatsAppMessage(vendedor.phone, notifMsg);
            }
          }

          enviados++;

        } catch (err) {
          console.error(`   ❌ Error enviando post-venta a ${cliente.phone}:`, err);
        }
      }
    }

    console.log(`🎉 Post-venta completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en seguimientoPostVenta:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE CUMPLEAÑOS - USA TEMPLATE feliz_cumple
// ═══════════════════════════════════════════════════════════════
async function enviarFelicitacionesCumple(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🎂 Verificando cumpleaños del día...');

    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${mes}-${dia}`;
    const añoActual = hoy.getFullYear();

    // Buscar leads cuyo cumpleaños sea hoy (formato: YYYY-MM-DD o MM-DD)
    const { data: leadsCumple } = await supabase.client
      .from('leads')
      .select('id, name, phone, birthday, notes, assigned_to')
      .or(`birthday.ilike.%-${fechaHoy},birthday.ilike.${fechaHoy}%`)
      .not('phone', 'is', null)
      .not('status', 'in', '("lost","fallen")');

    if (!leadsCumple || leadsCumple.length === 0) {
      console.log('🎂 No hay leads cumpliendo años hoy');
      return;
    }

    console.log(`🎂 Encontrados ${leadsCumple.length} leads cumpliendo años hoy`);

    let enviados = 0;

    for (const lead of leadsCumple) {
      if (!lead.phone) continue;

      // Verificar si ya lo felicitamos este año
      const notesStr = typeof lead.notes === 'string' ? lead.notes : JSON.stringify(lead.notes || '');
      if (notesStr.includes(`cumple_felicitado_${añoActual}`)) {
        console.log(`⏭️ Ya felicitamos a ${lead.name} este año`);
        continue;
      }

      const nombreCorto = lead.name?.split(' ')[0] || '';

      try {
        // Intentar usar template feliz_cumple
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto }
            ]
          }
        ];

        await meta.sendTemplate(lead.phone, 'feliz_cumple', 'es_MX', templateComponents);
        console.log(`🎂 Felicitación (template) enviada a ${lead.name}`);

        // Marcar como felicitado
        const notasActuales = lead.notes || {};
        const nuevasNotas = typeof notasActuales === 'object'
          ? { ...notasActuales, [`cumple_felicitado_${añoActual}`]: true }
          : { [`cumple_felicitado_${añoActual}`]: true };

        await supabase.client
          .from('leads')
          .update({ notes: nuevasNotas })
          .eq('id', lead.id);

        enviados++;

      } catch (templateErr) {
        console.log(`⚠️ Template feliz_cumple no disponible para ${lead.name}, usando fallback...`);

        // Fallback: mensaje regular (solo si estamos dentro de 24hrs)
        try {
          const mensajeFallback = `🎂 ¡Feliz cumpleaños ${nombreCorto}! 🎉\n\n` +
            `Todo el equipo te desea un día increíble.\n\n` +
            `Gracias por ser parte de nuestra familia. 🏠💙`;

          await meta.sendWhatsAppMessage(lead.phone, mensajeFallback);
          console.log(`🎂 Felicitación (fallback) enviada a ${lead.name}`);

          // Marcar como felicitado
          const notasActuales = lead.notes || {};
          const nuevasNotas = typeof notasActuales === 'object'
            ? { ...notasActuales, [`cumple_felicitado_${añoActual}`]: true }
            : { [`cumple_felicitado_${añoActual}`]: true };

          await supabase.client
            .from('leads')
            .update({ notes: nuevasNotas })
            .eq('id', lead.id);

          enviados++;
        } catch (fallbackErr) {
          console.log(`❌ No se pudo enviar felicitación a ${lead.name}:`, fallbackErr);
        }
      }
    }

    // También felicitar al equipo
    await felicitarEquipoCumple(supabase, meta, fechaHoy, añoActual);

    console.log(`🎂 Felicitaciones completadas: ${enviados} leads felicitados`);

  } catch (e) {
    console.error('Error en enviarFelicitacionesCumple:', e);
  }
}

// Felicitar a miembros del equipo que cumplen años
async function felicitarEquipoCumple(supabase: SupabaseService, meta: MetaWhatsAppService, fechaHoy: string, añoActual: number): Promise<void> {
  try {
    const { data: equipo } = await supabase.client
      .from('team_members')
      .select('id, name, phone, birthday, notes')
      .or(`birthday.ilike.%-${fechaHoy},birthday.ilike.${fechaHoy}%`)
      .eq('active', true)
      .not('phone', 'is', null);

    if (!equipo || equipo.length === 0) {
      console.log('🎂 No hay miembros del equipo cumpliendo años hoy');
      return;
    }

    console.log(`🎂 ${equipo.length} miembro(s) del equipo cumplen años hoy`);

    for (const miembro of equipo) {
      if (!miembro.phone) continue;

      const notesStr = typeof miembro.notes === 'string' ? miembro.notes : JSON.stringify(miembro.notes || '');
      if (notesStr.includes(`cumple_felicitado_${añoActual}`)) {
        console.log(`⏭️ Ya felicitamos a ${miembro.name} (equipo) este año`);
        continue;
      }

      const nombreCorto = miembro.name?.split(' ')[0] || 'colega';

      try {
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto }
            ]
          }
        ];

        await meta.sendTemplate(miembro.phone, 'feliz_cumple', 'es_MX', templateComponents);
        console.log(`🎂 Felicitación (template) enviada a ${miembro.name} (equipo)`);

        // Marcar como felicitado
        const notasActuales = miembro.notes || {};
        const nuevasNotas = typeof notasActuales === 'object'
          ? { ...notasActuales, [`cumple_felicitado_${añoActual}`]: true }
          : { [`cumple_felicitado_${añoActual}`]: true };

        await supabase.client
          .from('team_members')
          .update({ notes: nuevasNotas })
          .eq('id', miembro.id);

      } catch (err) {
        console.log(`⚠️ Error felicitando a ${miembro.name} (equipo):`, err);
      }
    }

  } catch (e) {
    console.error('Error felicitando equipo:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// SEGUIMIENTO DE CRÉDITO HIPOTECARIO - USA TEMPLATE info_credito
// Para leads que necesitan crédito pero no han avanzado
// ═══════════════════════════════════════════════════════════════
async function seguimientoCredito(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🏦 Verificando leads con crédito pendiente...');

    const ahora = new Date();
    const hace5dias = new Date(ahora.getTime() - 5 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que:
    // 1. Necesitan crédito (needs_mortgage = true)
    // 2. No tienen solicitud de hipoteca activa (o está estancada)
    // 3. No han tenido actividad en 5+ días
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, property_interest, updated_at, needs_mortgage')
      .eq('needs_mortgage', true)
      .not('status', 'in', '("lost","fallen","cold","closed")')
      .lt('updated_at', hace5dias.toISOString())
      .not('phone', 'is', null)
      .limit(20);

    if (!leads || leads.length === 0) {
      console.log('🏦 No hay leads con crédito pendiente para seguimiento');
      return;
    }

    console.log(`🏦 Leads con crédito pendiente encontrados: ${leads.length}`);

    let enviados = 0;

    for (const lead of leads) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};

      // No enviar si ya enviamos seguimiento de crédito hoy
      if (notas?.credito_seguimiento_sent === hoyStr) {
        continue;
      }

      // No enviar si ya enviamos en los últimos 7 días
      const ultimoEnvioCredito = notas?.ultimo_seguimiento_credito;
      if (ultimoEnvioCredito) {
        const ultimaFecha = new Date(ultimoEnvioCredito);
        const diasDesdeUltimo = Math.floor((ahora.getTime() - ultimaFecha.getTime()) / (1000 * 60 * 60 * 24));
        if (diasDesdeUltimo < 7) {
          continue;
        }
      }

      // Verificar si ya tiene solicitud de hipoteca activa
      const { data: solicitud } = await supabase.client
        .from('mortgage_applications')
        .select('id, status')
        .eq('lead_id', lead.id)
        .neq('status', 'cancelled')
        .single();

      // Si ya tiene solicitud activa, no enviar
      if (solicitud) {
        continue;
      }

      const nombreCorto = lead.name?.split(' ')[0] || '';
      const desarrollo = lead.property_interest || 'tu casa ideal';

      try {
        // Usar template info_credito
        const templateComponents = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreCorto },
              { type: 'text', text: desarrollo }
            ]
          }
        ];

        await meta.sendTemplate(lead.phone, 'info_credito', 'es_MX', templateComponents);
        console.log(`🏦 Seguimiento crédito (template) enviado a ${lead.name}`);

        // Marcar como enviado
        await supabase.client
          .from('leads')
          .update({
            notes: {
              ...notas,
              credito_seguimiento_sent: hoyStr,
              ultimo_seguimiento_credito: ahora.toISOString()
            }
          })
          .eq('id', lead.id);

        // Registrar actividad
        await supabase.client.from('activities').insert([{
          type: 'system',
          lead_id: lead.id,
          activity_type: 'seguimiento_credito',
          notes: 'Template info_credito enviado automáticamente',
          created_at: ahora.toISOString()
        }]);

        enviados++;

      } catch (templateErr) {
        console.log(`⚠️ Template info_credito no disponible para ${lead.name}, usando fallback...`);

        // Fallback: mensaje regular (solo funcionará si hay ventana de 24hrs abierta)
        try {
          const mensajeFallback = `🏦 ¡Hola ${nombreCorto}!\n\n` +
            `Te comparto información sobre crédito hipotecario para *${desarrollo}*:\n\n` +
            `✅ Hasta 20 años de plazo\n` +
            `✅ Tasa competitiva\n` +
            `✅ Varios bancos disponibles\n\n` +
            `¿Te gustaría que un asesor te contacte? Responde *Sí*.`;

          await meta.sendWhatsAppMessage(lead.phone, mensajeFallback);
          console.log(`🏦 Seguimiento crédito (fallback) enviado a ${lead.name}`);

          await supabase.client
            .from('leads')
            .update({
              notes: {
                ...notas,
                credito_seguimiento_sent: hoyStr,
                ultimo_seguimiento_credito: ahora.toISOString()
              }
            })
            .eq('id', lead.id);

          enviados++;
        } catch (fallbackErr) {
          console.log(`❌ No se pudo enviar seguimiento crédito a ${lead.name}:`, fallbackErr);
        }
      }
    }

    console.log(`🏦 Seguimiento crédito completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en seguimientoCredito:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// BROADCAST QUEUE - Procesa broadcasts encolados
// ═══════════════════════════════════════════════════════════════
async function procesarBroadcastQueue(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    // 🚨 KILL SWITCH - Verificar si broadcasts están habilitados
    // Por seguridad, si no existe el config o hay error, NO procesar
    try {
      const { data: config, error } = await supabase.client
        .from('system_config')
        .select('value')
        .eq('key', 'broadcasts_enabled')
        .single();

      // SEGURO POR DEFECTO: Si no hay config, error, o está en false -> NO procesar
      if (error || !config || config.value === 'false' || config.value === false) {
        console.log('🛑 BROADCASTS DESHABILITADOS - Kill switch activo (config:', config?.value, 'error:', !!error, ')');
        return;
      }
    } catch (e) {
      console.log('🛑 BROADCASTS DESHABILITADOS - Error verificando config');
      return;
    }

    const queueService = new BroadcastQueueService(supabase);

    // Procesar broadcasts pendientes
    const result = await queueService.processPendingBroadcasts(
      async (phone: string, templateName: string, lang: string, components: any[]) => {
        return meta.sendTemplate(phone, templateName, lang, components);
      },
      async (phone: string, message: string) => {
        // ⚠️ BROADCASTS usan rate limiting (bypassRateLimit = false)
        return meta.sendWhatsAppMessage(phone, message, false);
      }
    );

    if (result.processed > 0) {
      console.log(`📤 QUEUE: Procesados ${result.processed} jobs, ${result.sent} enviados, ${result.errors} errores`);
    }

    // Notificar broadcasts completados
    const completedJobs = await queueService.getCompletedJobsToNotify();

    for (const job of completedJobs) {
      if (job.created_by_phone) {
        try {
          const mensaje = `✅ *Broadcast completado*\n\n` +
            `📊 Segmento: ${job.segment}\n` +
            `📤 Enviados: ${job.sent_count}/${job.total_leads}\n` +
            `❌ Errores: ${job.error_count}\n\n` +
            `El envío masivo ha finalizado.`;

          await meta.sendWhatsAppMessage(job.created_by_phone, mensaje);
          await queueService.markAsNotified(job.id);
          console.log(`📤 QUEUE: Notificación enviada a ${job.created_by_phone}`);
        } catch (notifyErr) {
          console.error(`Error notificando broadcast completado:`, notifyErr);
        }
      }
    }

  } catch (e) {
    console.error('Error en procesarBroadcastQueue:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// FOLLOW-UP 24H LEADS NUEVOS
// Envía mensaje a leads status='new' que no respondieron en 24h
// Usa campo alerta_enviada_24h para no duplicar
// ═══════════════════════════════════════════════════════════
async function followUp24hLeadsNuevos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads nuevos sin respuesta en 24h que NO tengan alerta ya enviada
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, property_interest, alerta_enviada_24h, assigned_to, notes, team_members:assigned_to(name, phone)')
      .eq('status', 'new')
      .lt('created_at', hace24h.toISOString())
      .is('alerta_enviada_24h', null)
      .not('phone', 'is', null)
      .limit(20);

    if (!leads || leads.length === 0) {
      console.log('⏰ No hay leads nuevos pendientes de follow-up 24h');
      return;
    }

    console.log(`⏰ Leads nuevos sin respuesta 24h: ${leads.length}`);

    let enviados = 0;
    const mensajes = [
      '¡Hola {nombre}! 👋 Soy Sara de Grupo Santa Rita. Vi que nos contactaste ayer interesado en nuestras casas. ¿Te gustaría que te cuente más sobre lo que tenemos disponible?',
      'Hola {nombre}, ¿cómo estás? 🏡 Quedé pendiente de platicarte sobre las opciones que tenemos para ti. ¿Tienes un momento?',
      '¡Hey {nombre}! 👋 No quiero ser insistente pero vi que no pudimos conectar ayer. ¿Hay algo en particular que busques? Me encantaría ayudarte.'
    ];

    for (const lead of leads) {
      if (!lead.phone) continue;

      const phoneLimpio = lead.phone.replace(/\D/g, '');
      const nombre = lead.name?.split(' ')[0] || 'amigo';

      // Seleccionar mensaje aleatorio
      const mensajeTemplate = mensajes[Math.floor(Math.random() * mensajes.length)];
      const mensaje = mensajeTemplate.replace('{nombre}', nombre);

      try {
        await meta.sendWhatsAppMessage(phoneLimpio, mensaje);

        // Marcar alerta como enviada
        await supabase.client
          .from('leads')
          .update({
            alerta_enviada_24h: hoyStr,
            updated_at: new Date().toISOString()
          })
          .eq('id', lead.id);

        enviados++;
        console.log(`⏰ Follow-up 24h enviado a: ${lead.name}`);

        // También alertar al vendedor asignado
        const vendedor = lead.team_members as any;
        if (vendedor?.phone) {
          const vendedorPhone = vendedor.phone.replace(/\D/g, '');
          await meta.sendWhatsAppMessage(vendedorPhone,
            `📢 *Alerta lead sin respuesta*\n\n` +
            `${lead.name} lleva +24h sin contestar.\n` +
            `Le envié un recordatorio automático.\n\n` +
            `💡 Considera llamarle directamente.`
          );
        }

        // Pequeña pausa entre mensajes
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`Error enviando follow-up 24h a ${lead.name}:`, err);
      }
    }

    console.log(`⏰ Follow-up 24h completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en followUp24hLeadsNuevos:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// REMINDER DOCUMENTOS CRÉDITO
// Recuerda a leads con credit_status='docs_requested' por 3+ días
// ═══════════════════════════════════════════════════════════
async function reminderDocumentosCredito(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();
    const hace3dias = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que llevan 3+ días con documentos solicitados
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, property_interest, credit_status, team_members:assigned_to(name, phone)')
      .eq('credit_status', 'docs_requested')
      .lt('updated_at', hace3dias.toISOString())
      .not('phone', 'is', null)
      .limit(15);

    if (!leads || leads.length === 0) {
      console.log('📄 No hay leads pendientes de documentos para recordar');
      return;
    }

    console.log(`📄 Leads pendientes de docs por 3+ días: ${leads.length}`);

    let enviados = 0;

    for (const lead of leads) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};

      // No enviar si ya recordamos hoy
      if ((notas as any)?.docs_reminder_sent === hoyStr) continue;

      // No enviar si ya enviamos en los últimos 5 días
      const ultimoReminder = (notas as any)?.ultimo_docs_reminder;
      if (ultimoReminder) {
        const ultimaFecha = new Date(ultimoReminder);
        const diasDesdeUltimo = Math.floor((ahora.getTime() - ultimaFecha.getTime()) / (1000 * 60 * 60 * 24));
        if (diasDesdeUltimo < 5) continue;
      }

      const phoneLimpio = lead.phone.replace(/\D/g, '');
      const nombre = lead.name?.split(' ')[0] || 'Hola';

      const mensaje = `¡Hola ${nombre}! 📋\n\n` +
        `Te recuerdo que estamos esperando tus documentos para continuar con tu trámite de crédito hipotecario.\n\n` +
        `📄 Los documentos que necesitamos son:\n` +
        `• INE (frente y vuelta)\n` +
        `• Comprobante de ingresos\n` +
        `• Comprobante de domicilio\n\n` +
        `¿Necesitas ayuda con algo? Estoy aquí para apoyarte. 🏡`;

      try {
        await meta.sendWhatsAppMessage(phoneLimpio, mensaje);

        // Actualizar notas
        const notasActualizadas = {
          ...notas,
          docs_reminder_sent: hoyStr,
          ultimo_docs_reminder: ahora.toISOString()
        };

        await supabase.client
          .from('leads')
          .update({
            notes: notasActualizadas,
            updated_at: new Date().toISOString()
          })
          .eq('id', lead.id);

        enviados++;
        console.log(`📄 Reminder docs enviado a: ${lead.name}`);

        // Notificar al vendedor
        const vendedor = lead.team_members as any;
        if (vendedor?.phone) {
          const vendedorPhone = vendedor.phone.replace(/\D/g, '');
          await meta.sendWhatsAppMessage(vendedorPhone,
            `📋 *Lead pendiente de documentos*\n\n` +
            `${lead.name} lleva 3+ días sin enviar docs.\n` +
            `Le envié un recordatorio automático.\n\n` +
            `💡 Quizás una llamada ayude a destrabarlo.`
          );
        }

        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`Error enviando reminder docs a ${lead.name}:`, err);
      }
    }

    console.log(`📄 Reminder docs completado: ${enviados} mensajes enviados`);

  } catch (e) {
    console.error('Error en reminderDocumentosCredito:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// VIDEO FELICITACIÓN POST-VENTA (Veo 3)
// Genera video personalizado cuando lead pasa a status='sold'
// ═══════════════════════════════════════════════════════════
async function videoFelicitacionPostVenta(supabase: SupabaseService, meta: MetaWhatsAppService, env: Env): Promise<void> {
  try {
    const ahora = new Date();
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que vendieron en los últimos 7 días y no tienen video generado
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, property_interest, notes, updated_at')
      .eq('status', 'sold')
      .gt('updated_at', hace7dias.toISOString())
      .not('phone', 'is', null)
      .limit(5);

    if (!leads || leads.length === 0) {
      console.log('🎬 No hay nuevas ventas para video felicitación');
      return;
    }

    console.log(`🎬 Ventas recientes sin video: ${leads.length}`);

    // Fotos de fachadas por desarrollo (para el video)
    const fotosDesarrollo: Record<string, string> = {
      'Monte Verde': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/EUCALIPTO-0-scaled.jpg',
      'Los Encinos': 'https://gruposantarita.com.mx/wp-content/uploads/2021/07/M4215335.jpg',
      'Andes': 'https://gruposantarita.com.mx/wp-content/uploads/2022/09/Dalia_act.jpg',
      'Miravalle': 'https://gruposantarita.com.mx/wp-content/uploads/2025/02/FACHADA-MIRAVALLE-DESARROLLO-edit-min-scaled-e1740520053367.jpg',
      'Distrito Falco': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/img03-7.jpg',
      'Acacia': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/ACACIA-1-scaled.jpg'
    };

    let generados = 0;

    for (const lead of leads) {
      console.log(`🎬 Procesando lead: ${lead.name} | phone: ${lead.phone || 'SIN TELEFONO'}`);

      if (!lead.phone) {
        console.log(`🎬 SKIP: ${lead.name} no tiene teléfono`);
        continue;
      }

      const notas = typeof lead.notes === 'object' ? lead.notes : {};

      // Verificar si ya se generó video de felicitación
      if ((notas as any)?.video_felicitacion_generado) {
        console.log(`🎬 SKIP: ${lead.name} ya tiene video_felicitacion_generado`);
        continue;
      }

      const nombre = lead.name?.split(' ')[0] || 'amigo';
      const desarrollo = lead.property_interest || 'Grupo Santa Rita';

      // Obtener foto del desarrollo
      let fotoDesarrollo = fotosDesarrollo[desarrollo];
      if (!fotoDesarrollo) {
        for (const [key, url] of Object.entries(fotosDesarrollo)) {
          if (desarrollo.toLowerCase().includes(key.toLowerCase())) {
            fotoDesarrollo = url;
            break;
          }
        }
      }
      fotoDesarrollo = fotoDesarrollo || fotosDesarrollo['Monte Verde'];

      // Prompt para Veo 3 - Avatar felicitando al nuevo propietario (FRENTE a la fachada)
      const prompt = `A friendly female real estate agent standing in front of the house facade shown in the image. The beautiful house exterior is clearly visible behind her. She smiles warmly and speaks congratulating in Spanish: "¡Felicidades ${nombre}! Ya eres parte de la familia ${desarrollo}. Gracias por confiar en Grupo Santa Rita". Wide shot showing agent and house facade, golden hour lighting, 4k. No text, no subtitles, no captions, no overlays, clean video only.`;

      try {
        // Verificar límites de API antes de intentar
        const { data: configData } = await supabase.client
          .from('system_config')
          .select('value')
          .eq('key', 'veo3_daily_count')
          .single();

        const dailyCount = configData?.value ? parseInt(configData.value) : 0;
        if (dailyCount >= 15) {
          console.log('🎬 Límite diario de videos Veo 3 alcanzado');
          break;
        }

        // Llamar a Google Veo 3 API
        const googleApiKey = env.GEMINI_API_KEY;
        if (!googleApiKey) {
          console.log('🎬 GEMINI_API_KEY no configurada');
          break;
        }

        // Descargar imagen y convertir a base64
        console.log(`🎬 Descargando imagen de ${desarrollo}...`);
        const imgResponse = await fetch(fotoDesarrollo);
        if (!imgResponse.ok) {
          console.error(`Error descargando imagen para ${lead.name}`);
          continue;
        }
        const imgBuffer = await imgResponse.arrayBuffer();
        // Convertir a base64 de forma eficiente (evita stack overflow en imágenes grandes)
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const imgBase64 = btoa(binary);
        console.log(`🎬 Imagen descargada: ${bytes.length} bytes`);

        const veoResponse = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': googleApiKey
            },
            body: JSON.stringify({
              instances: [{
                prompt: prompt,
                image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' }
              }],
              parameters: {
                aspectRatio: '9:16',
                durationSeconds: 8
              }
            })
          }
        );

        if (!veoResponse.ok) {
          const errorText = await veoResponse.text();
          console.error(`Error Veo 3 para ${lead.name}:`, errorText);
          continue;
        }

        const veoData = await veoResponse.json() as any;
        const operationName = veoData.name;

        if (operationName) {
          // Normalizar teléfono (agregar código de país México si no lo tiene)
          let phoneNormalizado = lead.phone?.replace(/\D/g, '') || '';
          if (phoneNormalizado.length === 10) {
            phoneNormalizado = '521' + phoneNormalizado;
          } else if (phoneNormalizado.startsWith('1') && phoneNormalizado.length === 11) {
            phoneNormalizado = '52' + phoneNormalizado;
          } else if (!phoneNormalizado.startsWith('52')) {
            phoneNormalizado = '52' + phoneNormalizado;
          }

          // Guardar operación pendiente
          await supabase.client.from('pending_videos').insert({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: phoneNormalizado,
            desarrollo: desarrollo,
            operation_id: operationName,
            video_type: 'felicitacion_postventa',
            sent: false,
            created_at: new Date().toISOString()
          });

          // Marcar en notas que se generó el video
          const notasActualizadas = {
            ...notas,
            video_felicitacion_generado: hoyStr,
            video_felicitacion_operation: operationName
          };

          await supabase.client
            .from('leads')
            .update({ notes: notasActualizadas })
            .eq('id', lead.id);

          // Actualizar contador diario
          await supabase.client
            .from('system_config')
            .upsert({
              key: 'veo3_daily_count',
              value: String(dailyCount + 1),
              updated_at: new Date().toISOString()
            });

          generados++;
          console.log(`🎬 Video felicitación iniciado para: ${lead.name} (${desarrollo})`);
        }

        await new Promise(r => setTimeout(r, 3000)); // Pausa entre llamadas API

      } catch (err) {
        console.error(`Error generando video para ${lead.name}:`, err);
      }
    }

    console.log(`🎬 Videos de felicitación iniciados: ${generados}`);
    if (generados > 0) {
      await logEvento(supabase, 'video', `Videos felicitación postventa: ${generados} iniciados`, { generados, tipo: 'felicitacion' });
    }

  } catch (e) {
    console.error('Error en videoFelicitacionPostVenta:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// VIDEO DE BIENVENIDA PARA LEADS NUEVOS (Veo 3)
// Genera video personalizado cuando un lead nuevo interactúa
// ═══════════════════════════════════════════════════════════
async function videoBienvenidaLeadNuevo(supabase: SupabaseService, meta: MetaWhatsAppService, env: Env): Promise<void> {
  try {
    const ahora = new Date();
    const hace2horas = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads nuevos de las últimas 2 horas que NO tienen video de bienvenida
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, property_interest, notes, created_at, status')
      .eq('status', 'new')
      .gt('created_at', hace2horas.toISOString())
      .not('phone', 'is', null)
      .limit(5);

    if (!leads || leads.length === 0) {
      console.log('🎬 No hay leads nuevos para video de bienvenida');
      return;
    }

    // Filtrar los que ya tienen video de bienvenida
    const leadsParaVideo = leads.filter(lead => {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      return !(notas as any)?.video_bienvenida_enviado;
    });

    if (leadsParaVideo.length === 0) {
      console.log('🎬 Todos los leads nuevos ya tienen video de bienvenida');
      return;
    }

    console.log(`🎬 Leads nuevos para video de bienvenida: ${leadsParaVideo.length}`);

    // Fotos de fachadas por desarrollo
    const fotosDesarrollo: Record<string, string> = {
      'Monte Verde': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/EUCALIPTO-0-scaled.jpg',
      'Los Encinos': 'https://gruposantarita.com.mx/wp-content/uploads/2021/07/M4215335.jpg',
      'Andes': 'https://gruposantarita.com.mx/wp-content/uploads/2022/09/Dalia_act.jpg',
      'Miravalle': 'https://gruposantarita.com.mx/wp-content/uploads/2025/02/FACHADA-MIRAVALLE-DESARROLLO-edit-min-scaled-e1740520053367.jpg',
      'Distrito Falco': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/img03-7.jpg',
      'Acacia': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/ACACIA-1-scaled.jpg'
    };

    let generados = 0;

    for (const lead of leadsParaVideo) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const nombre = lead.name?.split(' ')[0] || 'amigo';
      const desarrollo = lead.property_interest || 'Grupo Santa Rita';

      // Obtener foto del desarrollo
      let fotoDesarrollo = fotosDesarrollo[desarrollo];
      if (!fotoDesarrollo) {
        for (const [key, url] of Object.entries(fotosDesarrollo)) {
          if (desarrollo.toLowerCase().includes(key.toLowerCase())) {
            fotoDesarrollo = url;
            break;
          }
        }
      }
      fotoDesarrollo = fotoDesarrollo || fotosDesarrollo['Monte Verde'];

      // Prompt para video de bienvenida - Avatar dando la bienvenida
      const prompt = `A friendly female real estate agent standing in front of the beautiful house facade shown in the image. She smiles warmly and speaks welcoming in Spanish: "¡Hola ${nombre}! Soy Sara de Grupo Santa Rita. Me da mucho gusto que te interese ${desarrollo}. Estoy aquí para ayudarte a encontrar tu casa ideal. ¿Te gustaría agendar una visita?". Wide shot showing agent and house facade, warm daylight, 4k. No text, no subtitles, no captions, no overlays, clean video only.`;

      try {
        // Verificar límites de API
        const { data: configData } = await supabase.client
          .from('system_config')
          .select('value')
          .eq('key', 'veo3_daily_count')
          .single();

        const dailyCount = configData?.value ? parseInt(configData.value) : 0;
        if (dailyCount >= 20) { // Límite de 20 videos/día incluyendo bienvenida + felicitación
          console.log('🎬 Límite diario de videos Veo 3 alcanzado');
          break;
        }

        const googleApiKey = env.GEMINI_API_KEY;
        if (!googleApiKey) {
          console.log('🎬 GEMINI_API_KEY no configurada');
          break;
        }

        // Descargar imagen y convertir a base64
        console.log(`🎬 Descargando imagen para bienvenida ${nombre} (${desarrollo})...`);
        const imgResponse = await fetch(fotoDesarrollo);
        if (!imgResponse.ok) {
          console.error(`Error descargando imagen para ${lead.name}`);
          continue;
        }
        const imgBuffer = await imgResponse.arrayBuffer();
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const imgBase64 = btoa(binary);

        const veoResponse = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': googleApiKey
            },
            body: JSON.stringify({
              instances: [{
                prompt: prompt,
                image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' }
              }],
              parameters: {
                aspectRatio: '9:16',
                durationSeconds: 8
              }
            })
          }
        );

        if (!veoResponse.ok) {
          const errorText = await veoResponse.text();
          console.error(`Error Veo 3 bienvenida para ${lead.name}:`, errorText);
          continue;
        }

        const veoData = await veoResponse.json() as any;
        const operationName = veoData.name;

        if (operationName) {
          // Normalizar teléfono
          let phoneNormalizado = lead.phone?.replace(/\D/g, '') || '';
          if (phoneNormalizado.length === 10) {
            phoneNormalizado = '521' + phoneNormalizado;
          } else if (phoneNormalizado.startsWith('1') && phoneNormalizado.length === 11) {
            phoneNormalizado = '52' + phoneNormalizado;
          } else if (!phoneNormalizado.startsWith('52')) {
            phoneNormalizado = '52' + phoneNormalizado;
          }

          // Guardar operación pendiente
          await supabase.client.from('pending_videos').insert({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: phoneNormalizado,
            desarrollo: desarrollo,
            operation_id: operationName,
            video_type: 'bienvenida_lead_nuevo',
            sent: false,
            created_at: new Date().toISOString()
          });

          // Marcar en notas que se generó el video
          const notasActualizadas = {
            ...notas,
            video_bienvenida_enviado: hoyStr,
            video_bienvenida_operation: operationName
          };

          await supabase.client
            .from('leads')
            .update({ notes: notasActualizadas })
            .eq('id', lead.id);

          // Actualizar contador diario
          await supabase.client
            .from('system_config')
            .upsert({
              key: 'veo3_daily_count',
              value: String(dailyCount + 1),
              updated_at: new Date().toISOString()
            });

          generados++;
          console.log(`🎬 Video bienvenida iniciado para: ${lead.name} (${desarrollo})`);
        }

        await new Promise(r => setTimeout(r, 3000)); // Pausa entre llamadas API

      } catch (err) {
        console.error(`Error generando video bienvenida para ${lead.name}:`, err);
      }
    }

    console.log(`🎬 Videos de bienvenida iniciados: ${generados}`);
    if (generados > 0) {
      await logEvento(supabase, 'video', `Videos bienvenida leads nuevos: ${generados} iniciados`, { generados, tipo: 'bienvenida' });
    }

  } catch (e) {
    console.error('Error en videoBienvenidaLeadNuevo:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// DETECCIÓN DE LEADS CALIENTES
// Analiza mensajes para detectar señales de compra y alertar al vendedor
// ═══════════════════════════════════════════════════════════
interface HotLeadSignal {
  tipo: string;
  intensidad: 'media' | 'alta' | 'muy_alta';
  keywords: string[];
}

function detectarSeñalesCalientes(mensaje: string): HotLeadSignal[] {
  const msgLower = mensaje.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const señales: HotLeadSignal[] = [];

  // Señales de PRECIO (alta intención)
  const precioPatterns = [
    /cuanto (cuesta|vale|es)/i, /precio/i, /costo/i, /cotiza/i,
    /que precio/i, /cuanto saldria/i, /a cuanto/i, /valor/i
  ];
  if (precioPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'precio', intensidad: 'alta', keywords: ['precio', 'costo', 'cotización'] });
  }

  // Señales de CRÉDITO (alta intención)
  const creditoPatterns = [
    /credito/i, /hipoteca/i, /infonavit/i, /fovissste/i,
    /financiamiento/i, /prestamo/i, /banco/i, /mensualidad/i
  ];
  if (creditoPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'credito', intensidad: 'alta', keywords: ['crédito', 'hipoteca', 'financiamiento'] });
  }

  // Señales de VISITA (muy alta intención)
  const visitaPatterns = [
    /quiero (ver|visitar|conocer)/i, /cuando puedo (ir|visitar)/i,
    /agendar (cita|visita)/i, /recorrido/i, /mostrar/i,
    /quisiera (ver|conocer|visitar)/i, /me gustaria (ver|visitar)/i
  ];
  if (visitaPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'visita', intensidad: 'muy_alta', keywords: ['visita', 'cita', 'recorrido'] });
  }

  // Señales de ENGANCHE/APARTADO (muy alta intención)
  const apartadoPatterns = [
    /enganche/i, /apartado/i, /apartar/i, /reservar/i,
    /cuanto (necesito|ocupo) para/i, /pago inicial/i
  ];
  if (apartadoPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'apartado', intensidad: 'muy_alta', keywords: ['enganche', 'apartado', 'reservar'] });
  }

  // Señales de URGENCIA (muy alta intención)
  const urgenciaPatterns = [
    /urgente/i, /lo mas pronto/i, /cuanto antes/i, /rapido/i,
    /necesito (ya|pronto|hoy)/i, /de inmediato/i, /esta semana/i
  ];
  if (urgenciaPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'urgencia', intensidad: 'muy_alta', keywords: ['urgente', 'pronto', 'inmediato'] });
  }

  // Señales de DECISIÓN (muy alta intención)
  const decisionPatterns = [
    /quiero comprar/i, /voy a comprar/i, /me decid/i, /estoy listo/i,
    /me interesa (mucho|bastante)/i, /es justo lo que busco/i, /perfecto/i,
    /lo quiero/i, /me lo llevo/i
  ];
  if (decisionPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'decision', intensidad: 'muy_alta', keywords: ['comprar', 'decidido', 'listo'] });
  }

  // Señales de DISPONIBILIDAD (media intención)
  const dispPatterns = [
    /disponib/i, /hay (casas|lotes|terrenos)/i, /quedan/i,
    /todavia hay/i, /aun tienen/i
  ];
  if (dispPatterns.some(p => p.test(msgLower))) {
    señales.push({ tipo: 'disponibilidad', intensidad: 'media', keywords: ['disponible', 'quedan'] });
  }

  return señales;
}

async function alertarLeadCaliente(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string,
  señales: HotLeadSignal[]
): Promise<void> {
  try {
    if (señales.length === 0) return;

    // Determinar intensidad máxima
    const intensidadMax = señales.some(s => s.intensidad === 'muy_alta') ? 'muy_alta' :
                          señales.some(s => s.intensidad === 'alta') ? 'alta' : 'media';

    // Solo alertar si es alta o muy_alta
    if (intensidadMax === 'media') return;

    // Buscar vendedor asignado
    const { data: vendedor } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('id', lead.assigned_to)
      .single();

    if (!vendedor?.phone) {
      console.log(`🔥 Lead caliente ${lead.name} pero vendedor sin teléfono`);
      return;
    }

    // Verificar que no se haya enviado alerta en los últimos 30 minutos
    const notas = typeof lead.notes === 'object' ? lead.notes : {};
    const ultimaAlerta = (notas as any)?.ultima_alerta_caliente;
    if (ultimaAlerta) {
      const hace30min = new Date(Date.now() - 30 * 60 * 1000);
      if (new Date(ultimaAlerta) > hace30min) {
        console.log(`🔥 Lead ${lead.name} ya tiene alerta reciente, omitiendo`);
        return;
      }
    }

    // Construir mensaje de alerta
    const tiposDetectados = señales.map(s => s.tipo).join(', ');
    const emoji = intensidadMax === 'muy_alta' ? '🔥🔥🔥' : '🔥🔥';

    const alertaMsg = `${emoji} *LEAD CALIENTE - ACTÚA YA*

👤 *${lead.name}*
📱 ${lead.phone}
🏠 Interés: ${lead.property_interest || 'No especificado'}

💬 Dijo: "${mensaje.substring(0, 100)}${mensaje.length > 100 ? '...' : ''}"

📊 Señales detectadas: *${tiposDetectados}*
⚡ Intensidad: *${intensidadMax.toUpperCase()}*

💡 Acción recomendada:
${señales.some(s => s.tipo === 'visita') ? '→ Agendar visita HOY si es posible\n' : ''}${señales.some(s => s.tipo === 'precio') ? '→ Enviar cotización personalizada\n' : ''}${señales.some(s => s.tipo === 'credito') ? '→ Explicar opciones de crédito\n' : ''}${señales.some(s => s.tipo === 'apartado') ? '→ Explicar proceso de apartado\n' : ''}${señales.some(s => s.tipo === 'urgencia') ? '→ CONTACTAR INMEDIATAMENTE\n' : ''}
📞 Responde: bridge ${lead.name?.split(' ')[0]}`;

    await meta.sendWhatsAppMessage(vendedor.phone, alertaMsg);
    console.log(`🔥 Alerta enviada a ${vendedor.name} por lead caliente: ${lead.name} (${tiposDetectados})`);

    // Guardar en notas del lead
    const notasActualizadas = {
      ...notas,
      ultima_alerta_caliente: new Date().toISOString(),
      historial_señales_calientes: [
        ...((notas as any)?.historial_señales_calientes || []).slice(-9),
        {
          fecha: new Date().toISOString(),
          señales: señales.map(s => s.tipo),
          intensidad: intensidadMax,
          mensaje: mensaje.substring(0, 200)
        }
      ]
    };

    // Actualizar notas Y recalcular score inmediatamente
    const leadActualizado = { ...lead, notes: notasActualizadas };
    const { score, categoria } = calcularLeadScore(leadActualizado);

    await supabase.client
      .from('leads')
      .update({
        notes: notasActualizadas,
        score: score,
        lead_score: score,
        lead_category: categoria
      })
      .eq('id', lead.id);

    console.log(`📊 Lead ${lead.name} score actualizado: ${score} (${categoria})`);

  } catch (e) {
    console.error('Error en alertarLeadCaliente:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// RECUPERACIÓN DE ABANDONOS EN PROCESO DE CRÉDITO
// Re-engagement para leads que empezaron crédito pero no continuaron
// ═══════════════════════════════════════════════════════════
async function recuperarAbandonosCredito(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
      .not('status', 'in', '("credit_qualified","pre_approved","approved","sold","closed","delivered","lost","fallen")')
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
            .select('name, phone')
            .eq('id', lead.assigned_to)
            .single();

          if (vendedor?.phone) {
            const notifVendedor = `📬 *Recuperación de crédito enviada*

Lead: ${lead.name}
Interés: ${desarrollo}
Etapa abandonada: ${etapa}

💡 Si responde, podrás continuar con: bridge ${nombre}`;

            await meta.sendWhatsAppMessage(vendedor.phone, notifVendedor);
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
  }
}

// ═══════════════════════════════════════════════════════════
// LEAD SCORING AUTOMÁTICO
// Calcula score basado en señales, comportamiento e interacciones
// ═══════════════════════════════════════════════════════════
interface LeadScoreFactors {
  statusScore: number;
  interactionScore: number;
  hotSignalsScore: number;
  recencyScore: number;
  creditReadyScore: number;
  engagementScore: number;
}

function calcularLeadScore(lead: any): { score: number; factors: LeadScoreFactors; categoria: string } {
  const notas = typeof lead.notes === 'object' ? lead.notes : {};
  let factors: LeadScoreFactors = {
    statusScore: 0,
    interactionScore: 0,
    hotSignalsScore: 0,
    recencyScore: 0,
    creditReadyScore: 0,
    engagementScore: 0
  };

  // 1. SCORE POR STATUS (0-30 puntos)
  const statusScores: Record<string, number> = {
    'new': 5,
    'contacted': 10,
    'qualified': 15,
    'appointment_scheduled': 20,
    'visited': 25,
    'negotiation': 28,
    'reserved': 30,
    'credit_qualified': 22,
    'pre_approved': 25,
    'approved': 28,
    'sold': 30,
    'closed': 30,
    'delivered': 30,
    'cold': 2,
    'lost': 0,
    'fallen': 0
  };
  factors.statusScore = statusScores[lead.status] || 5;

  // 2. SCORE POR INTERACCIONES (0-20 puntos)
  // Basado en historial de actividades si existe
  const historialCaliente = (notas as any)?.historial_señales_calientes || [];
  const numInteracciones = historialCaliente.length;
  factors.interactionScore = Math.min(numInteracciones * 4, 20);

  // 3. SCORE POR SEÑALES CALIENTES (0-25 puntos)
  if (historialCaliente.length > 0) {
    const ultimaSenal = historialCaliente[historialCaliente.length - 1];
    const intensidadScores: Record<string, number> = {
      'muy_alta': 25,
      'alta': 15,
      'media': 8
    };
    factors.hotSignalsScore = intensidadScores[ultimaSenal?.intensidad] || 0;

    // Bonus por múltiples tipos de señales
    const tiposUnicos = new Set(historialCaliente.flatMap((h: any) => h.señales || []));
    factors.hotSignalsScore = Math.min(factors.hotSignalsScore + tiposUnicos.size * 2, 25);
  }

  // 4. SCORE POR RECENCIA (0-15 puntos)
  const ahora = new Date();
  const ultimaActualizacion = lead.updated_at ? new Date(lead.updated_at) : new Date(lead.created_at);
  const diasSinActividad = Math.floor((ahora.getTime() - ultimaActualizacion.getTime()) / (1000 * 60 * 60 * 24));

  if (diasSinActividad === 0) factors.recencyScore = 15;
  else if (diasSinActividad === 1) factors.recencyScore = 12;
  else if (diasSinActividad <= 3) factors.recencyScore = 10;
  else if (diasSinActividad <= 7) factors.recencyScore = 6;
  else if (diasSinActividad <= 14) factors.recencyScore = 3;
  else factors.recencyScore = 0;

  // 5. SCORE POR PREPARACIÓN DE CRÉDITO (0-10 puntos)
  const creditContext = (notas as any)?.credit_flow_context;
  if (creditContext) {
    if (creditContext.pre_approved || lead.credit_status === 'pre_approved') {
      factors.creditReadyScore = 10;
    } else if (creditContext.capacidad_credito) {
      factors.creditReadyScore = 8;
    } else if (creditContext.step && creditContext.step !== 'asking_employment') {
      factors.creditReadyScore = 5;
    } else {
      factors.creditReadyScore = 3;
    }
  }
  if (lead.needs_mortgage === false) {
    factors.creditReadyScore = 10; // Pago de contado = máximo score
  }

  // 6. SCORE POR ENGAGEMENT (0-10 puntos)
  // Respuestas a mensajes, citas agendadas, etc.
  if ((notas as any)?.pending_response_to) factors.engagementScore += 3;
  if ((notas as any)?.appointment_scheduled) factors.engagementScore += 4;
  if ((notas as any)?.active_bridge_to_vendedor) factors.engagementScore += 3;
  if (lead.property_interest) factors.engagementScore += 2;
  factors.engagementScore = Math.min(factors.engagementScore, 10);

  // CALCULAR SCORE TOTAL (0-100)
  const totalScore =
    factors.statusScore +
    factors.interactionScore +
    factors.hotSignalsScore +
    factors.recencyScore +
    factors.creditReadyScore +
    factors.engagementScore;

  // DETERMINAR CATEGORÍA
  let categoria: string;
  if (totalScore >= 80) categoria = 'HOT';
  else if (totalScore >= 60) categoria = 'WARM';
  else if (totalScore >= 40) categoria = 'LUKEWARM';
  else if (totalScore >= 20) categoria = 'COLD';
  else categoria = 'FROZEN';

  return { score: Math.min(totalScore, 100), factors, categoria };
}

async function actualizarLeadScores(supabase: SupabaseService): Promise<void> {
  try {
    // Obtener leads activos (no cerrados/perdidos) que necesitan actualización
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, status, notes, updated_at, created_at, property_interest, needs_mortgage, credit_status, score, lead_score')
      .not('status', 'in', '("closed","delivered","lost","fallen")')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (!leads || leads.length === 0) {
      console.log('📊 No hay leads para actualizar scores');
      return;
    }

    let actualizados = 0;
    let hotLeads = 0;
    let warmLeads = 0;

    for (const lead of leads) {
      const { score, factors, categoria } = calcularLeadScore(lead);

      // Solo actualizar si el score cambió significativamente (±5 puntos)
      const scoreActual = lead.score || lead.lead_score || 0;
      if (Math.abs(score - scoreActual) >= 5 || !lead.score) {
        await supabase.client
          .from('leads')
          .update({
            score: score,
            lead_score: score,
            lead_category: categoria
          })
          .eq('id', lead.id);

        actualizados++;
      }

      if (categoria === 'HOT') hotLeads++;
      else if (categoria === 'WARM') warmLeads++;
    }

    console.log(`📊 Lead scoring completado: ${actualizados} actualizados, ${hotLeads} HOT, ${warmLeads} WARM`);

  } catch (e) {
    console.error('Error en actualizarLeadScores:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// FOLLOW-UP POST-VISITA
// Re-engagement para leads que visitaron pero no avanzaron
// ═══════════════════════════════════════════════════════════
async function followUpPostVisita(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
            .select('name, phone')
            .eq('id', lead.assigned_to)
            .single();

          if (vendedor?.phone) {
            const notifVendedor = `📍 *Follow-up post-visita enviado*

Lead: ${lead.name}
Visitó: ${desarrollo}
Hace: ${diasDesdeVisita} días

💡 Si responde: bridge ${nombre}`;

            await meta.sendWhatsAppMessage(vendedor.phone, notifVendedor);
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
  }
}

// ═══════════════════════════════════════════════════════════
// NURTURING EDUCATIVO
// Envía contenido educativo sobre compra de casa y crédito
// ═══════════════════════════════════════════════════════════
const CONTENIDO_EDUCATIVO = [
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

async function nurturingEducativo(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
  }
}

// ═══════════════════════════════════════════════════════════
// PROGRAMA DE REFERIDOS
// Pide referidos a clientes satisfechos post-venta
// ═══════════════════════════════════════════════════════════
async function solicitarReferidos(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
          ]
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', cliente.id);

        // Notificar al vendedor
        if (cliente.assigned_to) {
          const { data: vendedor } = await supabase.client
            .from('team_members')
            .select('name, phone')
            .eq('id', cliente.assigned_to)
            .single();

          if (vendedor?.phone) {
            const notifVendedor = `🤝 *Solicitud de referidos enviada*

Cliente: ${cliente.name}
Compró: ${desarrollo}
Hace: ${diasDesdeCompra} días

💡 Si responde con un referido, agrégalo al CRM con fuente "referido"`;

            await meta.sendWhatsAppMessage(vendedor.phone, notifVendedor);
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
  }
}

// ═══════════════════════════════════════════════════════════
// DETECCIÓN Y MANEJO DE OBJECIONES
// Detecta objeciones comunes y alerta al vendedor con respuestas sugeridas
// ═══════════════════════════════════════════════════════════
interface Objecion {
  tipo: string;
  patron: RegExp;
  respuestaSugerida: string;
  prioridad: 'alta' | 'media' | 'baja';
}

const OBJECIONES_COMUNES: Objecion[] = [
  // PRECIO
  {
    tipo: 'precio_alto',
    patron: /muy caro|esta caro|no me alcanza|fuera de (mi )?presupuesto|no tengo (tanto|ese) dinero|es mucho|demasiado caro/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Precio:*
→ "Entiendo tu preocupación. ¿Te gustaría que revisemos opciones de financiamiento? Con crédito, la mensualidad puede ser menor a una renta."
→ "Tenemos diferentes modelos. ¿Cuál es tu presupuesto ideal? Así te muestro opciones que se ajusten."
→ "También tenemos promociones de enganche diferido. ¿Te interesa conocerlas?"`,
    prioridad: 'alta'
  },
  {
    tipo: 'ubicacion',
    patron: /muy lejos|esta lejos|no me gusta la zona|no conozco (esa|la) zona|queda lejos|mal ubicado/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Ubicación:*
→ "La zona está en crecimiento y tiene excelente plusvalía. ¿Te gustaría que te muestre los accesos y servicios cercanos?"
→ "Tenemos desarrollos en diferentes zonas. ¿Cuál ubicación te quedaría mejor?"
→ "Muchos clientes pensaban igual, pero al visitar cambiaron de opinión. ¿Agendamos un recorrido?"`,
    prioridad: 'media'
  },
  {
    tipo: 'timing',
    patron: /no es (buen )?momento|mas adelante|despues|ahorita no|todavia no|en unos meses|el proximo año|cuando tenga|primero tengo que/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Timing:*
→ "Entiendo. ¿Puedo preguntarte qué necesitas resolver primero? Quizá podamos ayudarte."
→ "Los precios suben cada mes. Apartar ahora te garantiza el precio actual con un mínimo de enganche."
→ "¿Te gustaría que te mantenga informado de promociones? Así cuando estés listo tendrás las mejores opciones."`,
    prioridad: 'media'
  },
  {
    tipo: 'desconfianza',
    patron: /no confio|es seguro|de verdad|no se si|sera cierto|me da desconfianza|tienen garantia|estan registrados/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Confianza:*
→ "Grupo Santa Rita tiene más de 15 años entregando casas. Te puedo compartir testimoniales de clientes."
→ "Todas nuestras propiedades tienen escrituras en orden y están registradas. Te muestro la documentación."
→ "¿Te gustaría visitar un desarrollo terminado y platicar con vecinos actuales?"`,
    prioridad: 'alta'
  },
  {
    tipo: 'competencia',
    patron: /vi algo mas barato|en otro lado|otra inmobiliaria|otra constructora|me ofrecieron|cotizando con otros|comparando opciones/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Competencia:*
→ "¡Qué bueno que estás comparando! ¿Puedo saber qué opciones viste? Te ayudo a comparar beneficios."
→ "A veces lo barato sale caro. Nosotros incluimos: escrituración, servicios y garantía. ¿Ellos también?"
→ "¿Qué es lo que más te gustó de la otra opción? Quiero entender qué es importante para ti."`,
    prioridad: 'alta'
  },
  {
    tipo: 'credito_negado',
    patron: /no califico|me rechazaron|no me dan credito|no tengo buro|mal historial|deudas|no paso el credito/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Crédito:*
→ "Trabajamos con múltiples bancos y cada uno tiene criterios diferentes. ¿Te gustaría que revisemos otras opciones?"
→ "También tenemos esquemas de pago directo con la constructora. ¿Te interesa conocerlos?"
→ "A veces el problema no es el buró, sino cómo se presenta la solicitud. Nuestros asesores de crédito pueden ayudarte."`,
    prioridad: 'alta'
  },
  {
    tipo: 'tamaño',
    patron: /muy chica|muy pequeña|necesito mas espacio|es pequeña|no cabe|muy grande|mucho espacio|no necesito tanto/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Tamaño:*
→ "Tenemos diferentes modelos. ¿Cuántas recámaras necesitas idealmente?"
→ "Los metros cuadrados son optimizados. ¿Te gustaría visitar para ver cómo se siente el espacio real?"
→ "Muchos modelos permiten ampliaciones a futuro. Te explico las opciones."`,
    prioridad: 'media'
  },
  {
    tipo: 'indecision',
    patron: /no se|tengo que pensarlo|dejame ver|lo voy a pensar|consultarlo|platicarlo con|mi esposo|mi esposa|mi familia/i,
    respuestaSugerida: `💡 *Respuesta sugerida - Indecisión:*
→ "Claro, es una decisión importante. ¿Hay alguna duda específica que pueda resolver para ayudarte a decidir?"
→ "¿Te gustaría que agende una visita para que tu familia también conozca? Sin compromiso."
→ "Te puedo enviar información detallada para que la revisen juntos. ¿Qué te gustaría saber?"`,
    prioridad: 'baja'
  }
];

function detectarObjeciones(mensaje: string): Objecion[] {
  const msgNormalizado = mensaje.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return OBJECIONES_COMUNES.filter(obj => obj.patron.test(msgNormalizado));
}

async function alertarObjecion(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  lead: any,
  mensaje: string,
  objeciones: Objecion[]
): Promise<void> {
  try {
    if (objeciones.length === 0) return;

    // Buscar vendedor asignado
    const { data: vendedor } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('id', lead.assigned_to)
      .single();

    if (!vendedor?.phone) {
      console.log(`⚠️ Objeción detectada para ${lead.name} pero vendedor sin teléfono`);
      return;
    }

    // Verificar cooldown (no alertar misma objeción en 2 horas)
    const notas = typeof lead.notes === 'object' ? lead.notes : {};
    const ultimaObjecion = (notas as any)?.ultima_alerta_objecion;
    if (ultimaObjecion) {
      const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
      if (new Date(ultimaObjecion) > hace2h) {
        console.log(`⚠️ Lead ${lead.name} ya tiene alerta de objeción reciente`);
        return;
      }
    }

    // Construir mensaje de alerta
    const tiposObjecion = objeciones.map(o => o.tipo).join(', ');
    const prioridadMax = objeciones.some(o => o.prioridad === 'alta') ? 'ALTA' :
                         objeciones.some(o => o.prioridad === 'media') ? 'MEDIA' : 'BAJA';

    let alertaMsg = `⚠️ *OBJECIÓN DETECTADA*

👤 *${lead.name}*
📱 ${lead.phone}
🏠 Interés: ${lead.property_interest || 'No especificado'}

💬 Dijo: "${mensaje.substring(0, 150)}${mensaje.length > 150 ? '...' : ''}"

📊 Tipo: *${tiposObjecion}*
⚡ Prioridad: *${prioridadMax}*

`;

    // Agregar respuestas sugeridas (máximo 2)
    objeciones.slice(0, 2).forEach(obj => {
      alertaMsg += `\n${obj.respuestaSugerida}\n`;
    });

    alertaMsg += `\n📞 Responde: bridge ${lead.name?.split(' ')[0]}`;

    await meta.sendWhatsAppMessage(vendedor.phone, alertaMsg);
    console.log(`⚠️ Alerta de objeción enviada a ${vendedor.name}: ${lead.name} (${tiposObjecion})`);

    // Guardar en notas
    const notasActualizadas = {
      ...notas,
      ultima_alerta_objecion: new Date().toISOString(),
      historial_objeciones: [
        ...((notas as any)?.historial_objeciones || []).slice(-9),
        {
          fecha: new Date().toISOString(),
          tipos: objeciones.map(o => o.tipo),
          mensaje: mensaje.substring(0, 200)
        }
      ]
    };

    await supabase.client
      .from('leads')
      .update({ notes: notasActualizadas })
      .eq('id', lead.id);

  } catch (e) {
    console.error('Error en alertarObjecion:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// ENCUESTAS NPS (Net Promoter Score)
// Mide satisfacción en puntos clave del journey
// ═══════════════════════════════════════════════════════════
async function enviarEncuestaNPS(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
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
      return;
    }

    // Filtrar los que no han recibido encuesta
    const clientesElegibles = clientes.filter(cliente => {
      const notas = typeof cliente.notes === 'object' ? cliente.notes : {};
      return !(notas as any)?.encuesta_nps_enviada;
    });

    if (clientesElegibles.length === 0) {
      console.log('📊 Todos los clientes ya tienen encuesta NPS');
      return;
    }

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
        await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        enviados++;
        console.log(`📊 Encuesta NPS enviada a: ${cliente.name} (${cliente.status})`);

        // Marcar como enviada
        const notasActualizadas = {
          ...notas,
          encuesta_nps_enviada: hoyStr,
          encuesta_nps_status: cliente.status,
          esperando_respuesta_nps: true
        };

        await supabase.client
          .from('leads')
          .update({ notes: notasActualizadas })
          .eq('id', cliente.id);

        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`Error enviando encuesta NPS a ${cliente.name}:`, err);
      }
    }

    console.log(`📊 Encuestas NPS enviadas: ${enviados}`);

  } catch (e) {
    console.error('Error en enviarEncuestaNPS:', e);
  }
}

// Procesar respuesta NPS
async function procesarRespuestaNPS(
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

  // Extraer número del mensaje
  const match = mensaje.match(/\b([0-9]|10)\b/);
  if (!match) {
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

    // Alertar al vendedor sobre detractor
    if (lead.assigned_to) {
      const { data: vendedor } = await supabase.client
        .from('team_members')
        .select('phone')
        .eq('id', lead.assigned_to)
        .single();

      if (vendedor?.phone) {
        await meta.sendWhatsAppMessage(vendedor.phone,
          `🚨 *ALERTA NPS BAJO*

Cliente: ${lead.name}
Score: ${score}/10 (${categoria})
Status: ${lead.status}

⚠️ Requiere atención inmediata. Contacta al cliente para resolver su experiencia.

📞 bridge ${nombre}`);
      }
    }
  }

  // Enviar respuesta al cliente
  await meta.sendWhatsAppMessage(lead.phone, respuesta);

  // Guardar en notas
  const notasActualizadas = {
    ...notas,
    esperando_respuesta_nps: false,
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
