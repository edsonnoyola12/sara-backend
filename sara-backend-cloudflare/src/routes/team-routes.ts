import { SupabaseService } from '../services/supabase';
import { isAllowedCrmOrigin, getCorsHeaders, parsePagination, paginatedResponse, validateRequired, validatePhone, validateRole } from './cors';

function checkTeamAuth(request: Request, env: any): boolean {
  // API key auth
  const authHeader = request.headers.get('Authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  const url = new URL(request.url);
  const queryKey = url.searchParams.get('api_key');
  if (env.API_SECRET && (apiKey === env.API_SECRET || queryKey === env.API_SECRET)) return true;
  // Origin-based auth
  const origin = request.headers.get('Origin');
  if (isAllowedCrmOrigin(origin)) return true;
  // No API_SECRET configured = dev mode
  if (!env.API_SECRET) return true;
  return false;
}

export async function handleTeamRoutes(request: Request, env: any, supabase: SupabaseService): Promise<Response | null> {
  const url = new URL(request.url);

  const corsHeaders = getCorsHeaders(request);

  if (url.pathname === '/api/team-members' && request.method === 'GET') {
    if (!checkTeamAuth(request, env)) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { limit, offset, page } = parsePagination(url);

    const { count } = await supabase.client
      .from('team_members')
      .select('id', { count: 'exact', head: true });

    const { data, error } = await supabase.client
      .from('team_members')
      .select('*')
      .order('name')
      .range(offset, offset + limit - 1);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(paginatedResponse(data || [], count || 0, page, limit)), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/api/team-members' && request.method === 'POST') {
    const body = await request.json() as any;

    // Validate required fields
    const reqError = validateRequired(body, ['name', 'phone', 'role']);
    if (reqError) {
      return new Response(JSON.stringify({ error: reqError }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!validatePhone(body.phone)) {
      return new Response(JSON.stringify({ error: 'Formato de teléfono inválido (10-15 dígitos)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!validateRole(body.role)) {
      return new Response(JSON.stringify({ error: 'Rol inválido. Válidos: admin, vendedor, coordinador, asesor, agencia' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data, error } = await supabase.client
      .from('team_members')
      .insert([{
        name: body.name,
        email: body.email || null,
        phone: body.phone,
        role: body.role,
        active: body.active !== false
      }])
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Invalidate team_members cache
    if (env.SARA_CACHE) {
      try { await env.SARA_CACHE.delete('team_members:all'); } catch (_) {}
    }

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname.startsWith('/api/team-members/') && request.method === 'PUT') {
    const id = url.pathname.split('/')[3];
    const body = await request.json() as any;

    // Validate optional fields if present
    if (body.phone !== undefined && body.phone !== null && !validatePhone(body.phone)) {
      return new Response(JSON.stringify({ error: 'Formato de teléfono inválido (10-15 dígitos)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (body.role !== undefined && !validateRole(body.role)) {
      return new Response(JSON.stringify({ error: 'Rol inválido. Válidos: admin, vendedor, coordinador, asesor, agencia' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Construir objeto de actualización solo con campos presentes
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.active !== undefined) updateData.active = body.active;
    // Campos de disponibilidad
    if (body.vacation_start !== undefined) updateData.vacation_start = body.vacation_start || null;
    if (body.vacation_end !== undefined) updateData.vacation_end = body.vacation_end || null;
    if (body.is_on_duty !== undefined) updateData.is_on_duty = body.is_on_duty;
    if (body.work_start !== undefined) updateData.work_start = body.work_start || null;
    if (body.work_end !== undefined) updateData.work_end = body.work_end || null;
    if (body.working_days !== undefined) updateData.working_days = body.working_days;

    const { data, error } = await supabase.client
      .from('team_members')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Invalidate team_members cache
    if (env.SARA_CACHE) {
      try { await env.SARA_CACHE.delete('team_members:all'); } catch (_) {}
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname.startsWith('/api/team-members/') && request.method === 'DELETE') {
    const id = url.pathname.split('/')[3];

    const { error } = await supabase.client
      .from('team_members')
      .delete()
      .eq('id', id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Invalidate team_members cache
    if (env.SARA_CACHE) {
      try { await env.SARA_CACHE.delete('team_members:all'); } catch (_) {}
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return null;
}
