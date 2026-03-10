// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES — Login, verify, refresh, me
// POST /api/auth/login   — email + password → JWT + refresh token
// GET  /api/auth/me       — current user info
// POST /api/auth/verify   — verify JWT validity
// POST /api/auth/refresh  — refresh token → new JWT
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import type { Env, CorsResponseFn } from '../types/env';
import {
  createJWT,
  createRefreshToken,
  verifyJWT,
  verifyPassword,
  hashPassword,
  authenticateRequest,
  getJWTSecret,
  JWTPayload,
} from '../middleware/auth';

export async function handleAuthRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // ━━━ POST /api/auth/login ━━━
  if (path === '/api/auth/login' && method === 'POST') {
    try {
      const body = await request.json() as { email?: string; password?: string };
      const { email, password } = body;

      if (!email || !password) {
        return corsResponse(JSON.stringify({
          error: 'Email y password son requeridos'
        }), 400, 'application/json', request);
      }

      // Look up user by email (across all tenants — login doesn't know tenant yet)
      const { data: user, error } = await supabase.client
        .from('auth_users')
        .select('*, tenants!auth_users_tenant_id_fk(id, slug, name, timezone, plan, logo_url, primary_color, secondary_color)')
        .eq('email', email.toLowerCase().trim())
        .eq('active', true)
        .single();

      if (error || !user) {
        return corsResponse(JSON.stringify({
          error: 'Credenciales inválidas'
        }), 401, 'application/json', request);
      }

      // Verify password
      const passwordValid = await verifyPassword(password, user.password_hash);
      if (!passwordValid) {
        return corsResponse(JSON.stringify({
          error: 'Credenciales inválidas'
        }), 401, 'application/json', request);
      }

      // Create JWT
      const jwtSecret = getJWTSecret(env.API_SECRET);
      const tokenPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        teamMemberId: user.team_member_id || undefined,
      };

      const accessToken = await createJWT(tokenPayload, jwtSecret);
      const refreshToken = await createRefreshToken(tokenPayload, jwtSecret);

      // Update last_login
      await supabase.client
        .from('auth_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id);

      const tenant = user.tenants || {};

      return corsResponse(JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          team_member_id: user.team_member_id,
        },
        tenant: {
          id: user.tenant_id,
          slug: tenant.slug,
          name: tenant.name,
          timezone: tenant.timezone,
          plan: tenant.plan,
          logo_url: tenant.logo_url,
          primary_color: tenant.primary_color,
          secondary_color: tenant.secondary_color,
        },
      }), 200, 'application/json', request);
    } catch (err: any) {
      console.error('Auth login error:', err);
      return corsResponse(JSON.stringify({
        error: 'Error interno de autenticación'
      }), 500, 'application/json', request);
    }
  }

  // ━━━ GET /api/auth/me ━━━
  if (path === '/api/auth/me' && method === 'GET') {
    const jwtSecret = getJWTSecret(env.API_SECRET);
    const payload = await authenticateRequest(request, jwtSecret);

    if (!payload) {
      return corsResponse(JSON.stringify({
        error: 'No autorizado'
      }), 401, 'application/json', request);
    }

    // Get fresh user data
    const { data: user } = await supabase.client
      .from('auth_users')
      .select('*, tenants!auth_users_tenant_id_fk(id, slug, name, timezone, plan, logo_url, primary_color, secondary_color)')
      .eq('id', payload.sub)
      .eq('active', true)
      .single();

    if (!user) {
      return corsResponse(JSON.stringify({
        error: 'Usuario no encontrado'
      }), 404, 'application/json', request);
    }

    const tenant = user.tenants || {};

    return corsResponse(JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        team_member_id: user.team_member_id,
      },
      tenant: {
        id: user.tenant_id,
        slug: tenant.slug,
        name: tenant.name,
        timezone: tenant.timezone,
        plan: tenant.plan,
        logo_url: tenant.logo_url,
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
      },
    }), 200, 'application/json', request);
  }

  // ━━━ POST /api/auth/verify ━━━
  if (path === '/api/auth/verify' && method === 'POST') {
    const jwtSecret = getJWTSecret(env.API_SECRET);
    const payload = await authenticateRequest(request, jwtSecret);

    return corsResponse(JSON.stringify({
      valid: !!payload,
      payload: payload ? {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        tenantId: payload.tenantId,
        exp: payload.exp,
      } : null,
    }), payload ? 200 : 401, 'application/json', request);
  }

  // ━━━ POST /api/auth/refresh ━━━
  if (path === '/api/auth/refresh' && method === 'POST') {
    try {
      const body = await request.json() as { refresh_token?: string };
      if (!body.refresh_token) {
        return corsResponse(JSON.stringify({
          error: 'refresh_token requerido'
        }), 400, 'application/json', request);
      }

      const jwtSecret = getJWTSecret(env.API_SECRET);
      const payload = await verifyJWT(body.refresh_token, jwtSecret);

      if (!payload) {
        return corsResponse(JSON.stringify({
          error: 'Refresh token inválido o expirado'
        }), 401, 'application/json', request);
      }

      // Verify user still exists and is active
      const { data: user } = await supabase.client
        .from('auth_users')
        .select('id, email, role, tenant_id, team_member_id')
        .eq('id', payload.sub)
        .eq('active', true)
        .single();

      if (!user) {
        return corsResponse(JSON.stringify({
          error: 'Usuario desactivado'
        }), 401, 'application/json', request);
      }

      // Issue new access token
      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        teamMemberId: user.team_member_id || undefined,
      };
      const accessToken = await createJWT(newPayload, jwtSecret);

      return corsResponse(JSON.stringify({
        access_token: accessToken,
      }), 200, 'application/json', request);
    } catch (err: any) {
      console.error('Auth refresh error:', err);
      return corsResponse(JSON.stringify({
        error: 'Error al refrescar token'
      }), 500, 'application/json', request);
    }
  }

  // ━━━ POST /api/auth/setup-password ━━━
  // One-time password setup for seeded users
  if (path === '/api/auth/setup-password' && method === 'POST') {
    try {
      const body = await request.json() as { email?: string; password?: string; setup_key?: string };

      if (!body.email || !body.password || !body.setup_key) {
        return corsResponse(JSON.stringify({
          error: 'email, password, y setup_key son requeridos'
        }), 400, 'application/json', request);
      }

      // Verify setup_key matches API_SECRET (only admins can setup passwords)
      if (body.setup_key !== env.API_SECRET) {
        return corsResponse(JSON.stringify({ error: 'setup_key inválida' }), 403, 'application/json', request);
      }

      if (body.password.length < 8) {
        return corsResponse(JSON.stringify({ error: 'Password mínimo 8 caracteres' }), 400, 'application/json', request);
      }

      const passwordHash = await hashPassword(body.password);

      const { error } = await supabase.client
        .from('auth_users')
        .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq('email', body.email.toLowerCase().trim());

      if (error) {
        return corsResponse(JSON.stringify({ error: 'Error actualizando password' }), 500, 'application/json', request);
      }

      return corsResponse(JSON.stringify({ ok: true }), 200, 'application/json', request);
    } catch (err: any) {
      console.error('Setup password error:', err);
      return corsResponse(JSON.stringify({ error: 'Error interno' }), 500, 'application/json', request);
    }
  }

  return null; // Not an auth route
}
