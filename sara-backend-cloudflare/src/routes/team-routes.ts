import { SupabaseService } from '../services/supabase';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function handleTeamRoutes(request: Request, env: any, supabase: SupabaseService): Promise<Response | null> {
  const url = new URL(request.url);
  
  if (url.pathname === '/api/team-members' && request.method === 'GET') {
    const { data, error } = await supabase.client
      .from('team_members')
      .select('*')
      .order('name');
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  if (url.pathname === '/api/team-members' && request.method === 'POST') {
    const body = await request.json();
    
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
    
    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  if (url.pathname.startsWith('/api/team-members/') && request.method === 'PUT') {
    const id = url.pathname.split('/')[3];
    const body = await request.json() as any;

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
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  return null;
}
