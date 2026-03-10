// ═══════════════════════════════════════════════════════════════════════════
// API REPORTS PRO ROUTES — Report Builder, Forecast, Scorecard
// Phase 5: Custom reports, revenue forecasting, agent performance
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { buildReport, saveReport, getReport, listReports, updateReport, deleteReport, saveSnapshot, getSnapshots, exportReportToCSV } from '../services/reportBuilderService';
import { generateForecast } from '../services/forecastingService';
import { generateAgentScorecard, generateTeamScorecard } from '../services/agentScorecardService';
import { isAllowedCrmOrigin, parsePagination, validateRequired } from './cors';
import type { Env, CorsResponseFn, CheckApiAuthFn } from '../types/env';

function checkAuth(request: Request, env: Env, corsResponse: CorsResponseFn, checkApiAuth: CheckApiAuthFn): Response | null {
  const apiAuthResult = checkApiAuth(request, env);
  if (!apiAuthResult) return null;
  const origin = request.headers.get('Origin');
  if (isAllowedCrmOrigin(origin)) return null;
  return corsResponse(JSON.stringify({ error: 'No autorizado' }), 401);
}

export async function handleApiReportsProRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn
): Promise<Response | null> {

  // ═══════════════════════════════════════════════════════════════
  // REPORT BUILDER
  // ═══════════════════════════════════════════════════════════════

  // POST /api/reports/build — Execute a report from config
  if (url.pathname === '/api/reports/build' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['entity']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const result = await buildReport(supabase, body);
    return corsResponse(JSON.stringify({ data: result }));
  }

  // POST /api/reports/build-and-save — Execute + save snapshot
  if (url.pathname === '/api/reports/build-and-save' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['report_id']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);

    const report = await getReport(supabase, body.report_id);
    if (!report) return corsResponse(JSON.stringify({ error: 'Reporte no encontrado' }), 404);

    const result = await buildReport(supabase, report.config);
    await saveSnapshot(supabase, body.report_id, result);
    return corsResponse(JSON.stringify({ data: result }));
  }

  // ═══════════════════════════════════════════════════════════════
  // SAVED REPORTS CRUD
  // ═══════════════════════════════════════════════════════════════

  // GET /api/reports/saved
  if (url.pathname === '/api/reports/saved' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const filters: any = {};
    if (url.searchParams.get('report_type')) filters.report_type = url.searchParams.get('report_type');
    if (url.searchParams.get('created_by')) filters.created_by = url.searchParams.get('created_by');
    const reports = await listReports(supabase, filters);
    return corsResponse(JSON.stringify({ data: reports }));
  }

  // POST /api/reports/saved
  if (url.pathname === '/api/reports/saved' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['name', 'config']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const report = await saveReport(supabase, body);
    if (!report) return corsResponse(JSON.stringify({ error: 'Error guardando reporte' }), 500);
    return corsResponse(JSON.stringify({ data: report }), 201);
  }

  // GET /api/reports/saved/:id
  const reportMatch = url.pathname.match(/^\/api\/reports\/saved\/([0-9a-f-]{36})$/);
  if (reportMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const report = await getReport(supabase, reportMatch[1]);
    if (!report) return corsResponse(JSON.stringify({ error: 'Reporte no encontrado' }), 404);
    return corsResponse(JSON.stringify({ data: report }));
  }

  // PUT /api/reports/saved/:id
  if (reportMatch && request.method === 'PUT') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const updated = await updateReport(supabase, reportMatch[1], body);
    if (!updated) return corsResponse(JSON.stringify({ error: 'Error actualizando reporte' }), 500);
    return corsResponse(JSON.stringify({ data: updated }));
  }

  // DELETE /api/reports/saved/:id
  if (reportMatch && request.method === 'DELETE') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await deleteReport(supabase, reportMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // GET /api/reports/saved/:id/snapshots
  const snapshotsMatch = url.pathname.match(/^\/api\/reports\/saved\/([0-9a-f-]{36})\/snapshots$/);
  if (snapshotsMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const snapshots = await getSnapshots(supabase, snapshotsMatch[1], limit);
    return corsResponse(JSON.stringify({ data: snapshots }));
  }

  // ═══════════════════════════════════════════════════════════════
  // FORECAST
  // ═══════════════════════════════════════════════════════════════

  // GET /api/reports/forecast
  if (url.pathname === '/api/reports/forecast' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const forecast = await generateForecast(supabase);
    return corsResponse(JSON.stringify({ data: forecast }));
  }

  // ═══════════════════════════════════════════════════════════════
  // SCORECARD
  // ═══════════════════════════════════════════════════════════════

  // GET /api/reports/scorecard — Team scorecard
  if (url.pathname === '/api/reports/scorecard' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const period = url.searchParams.get('period') || undefined;
    const scorecard = await generateTeamScorecard(supabase, period);
    return corsResponse(JSON.stringify({ data: scorecard }));
  }

  // GET /api/reports/scorecard/:agentId
  const scorecardMatch = url.pathname.match(/^\/api\/reports\/scorecard\/([0-9a-f-]{36})$/);
  if (scorecardMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const period = url.searchParams.get('period') || undefined;
    const scorecard = await generateAgentScorecard(supabase, scorecardMatch[1], period);
    if (!scorecard) return corsResponse(JSON.stringify({ error: 'Agente no encontrado' }), 404);
    return corsResponse(JSON.stringify({ data: scorecard }));
  }

  // ═══════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════

  // POST /api/reports/export/csv — Export report result as CSV
  if (url.pathname === '/api/reports/export/csv' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;

    let result;
    if (body.report_id) {
      const report = await getReport(supabase, body.report_id);
      if (!report) return corsResponse(JSON.stringify({ error: 'Reporte no encontrado' }), 404);
      result = await buildReport(supabase, report.config);
    } else if (body.config) {
      result = await buildReport(supabase, body.config);
    } else {
      return corsResponse(JSON.stringify({ error: 'Se requiere report_id o config' }), 400);
    }

    const csv = exportReportToCSV(result);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="report_export.csv"',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  return null;
}
