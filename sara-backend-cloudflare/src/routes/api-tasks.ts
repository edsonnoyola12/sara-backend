// ═══════════════════════════════════════════════════════════════════════════
// API TASKS ROUTES — Tasks, Tags, Notes, Custom Fields, Import/Export
// Phase 3: Structured data management
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { createTask, getTask, listTasks, updateTask, deleteTask, completeTask, getTasksByLead, getTasksByAssignee, getOverdueTasks, getTaskStats, type TaskStatus } from '../services/taskService';
import { createTag, getTag, listTags, updateTag, deleteTag, addTagToLead, removeTagFromLead, getLeadTags, getLeadsByTag, bulkTagLeads } from '../services/tagService';
import { createNote, getNote, listNotes, updateNote, deleteNote, pinNote, unpinNote, getPinnedNotes, searchNotes } from '../services/noteService';
import { createField, getField, listFields, updateField, deleteField, setFieldValue, getFieldValues, bulkSetFieldValues, validateFieldValue } from '../services/customFieldService';
import { parseCSV, validateImportData, importLeads, exportLeads, exportLeadsWithCustomFields, generateCSV } from '../services/importExportService';
import { isAllowedCrmOrigin, parsePagination, paginatedResponse, validateRequired } from './cors';
import type { Env, CorsResponseFn, CheckApiAuthFn } from '../types/env';

function checkAuth(request: Request, env: Env, corsResponse: CorsResponseFn, checkApiAuth: CheckApiAuthFn): Response | null {
  const apiAuthResult = checkApiAuth(request, env);
  if (!apiAuthResult) return null;
  const origin = request.headers.get('Origin');
  if (isAllowedCrmOrigin(origin)) return null;
  return corsResponse(JSON.stringify({ error: 'No autorizado' }), 401);
}

export async function handleApiTasksRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn
): Promise<Response | null> {

  // ═══════════════════════════════════════════════════════════════
  // TASKS CRUD
  // ═══════════════════════════════════════════════════════════════

  // GET /api/tasks — List tasks
  if (url.pathname === '/api/tasks' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const { page, limit } = parsePagination(url);
    const filters: any = { page, limit, tenant_id: supabase.getTenantId() };
    if (url.searchParams.get('status')) filters.status = url.searchParams.get('status');
    if (url.searchParams.get('priority')) filters.priority = url.searchParams.get('priority');
    if (url.searchParams.get('assigned_to')) filters.assigned_to = url.searchParams.get('assigned_to');
    if (url.searchParams.get('lead_id')) filters.lead_id = url.searchParams.get('lead_id');
    if (url.searchParams.get('task_type')) filters.task_type = url.searchParams.get('task_type');
    if (url.searchParams.get('due_date_from')) filters.due_date_from = url.searchParams.get('due_date_from');
    if (url.searchParams.get('due_date_to')) filters.due_date_to = url.searchParams.get('due_date_to');
    if (url.searchParams.get('search')) filters.search = url.searchParams.get('search');
    const { data, total } = await listTasks(supabase, filters);
    return corsResponse(JSON.stringify(paginatedResponse(data, total, page, limit)));
  }

  // GET /api/tasks/overdue — Overdue tasks
  if (url.pathname === '/api/tasks/overdue' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const overdueResult = await getOverdueTasks(supabase);
    return corsResponse(JSON.stringify({ data: overdueResult.data }));
  }

  // GET /api/tasks/stats — Task statistics
  if (url.pathname === '/api/tasks/stats' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const statsFilters: any = { tenant_id: supabase.getTenantId() };
    if (url.searchParams.get('assigned_to')) statsFilters.assigned_to = url.searchParams.get('assigned_to');
    if (url.searchParams.get('lead_id')) statsFilters.lead_id = url.searchParams.get('lead_id');
    const stats = await getTaskStats(supabase, statsFilters);
    return corsResponse(JSON.stringify(stats));
  }

  // POST /api/tasks — Create task
  if (url.pathname === '/api/tasks' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['title']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    body.tenant_id = supabase.getTenantId();
    const { data, error } = await createTask(supabase, body);
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data }), 201);
  }

  // GET /api/tasks/:id
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})$/);
  if (taskMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const taskResult = await getTask(supabase, taskMatch[1]);
    if (!taskResult.data) return corsResponse(JSON.stringify({ error: 'Tarea no encontrada' }), 404);
    return corsResponse(JSON.stringify({ data: taskResult.data }));
  }

  // PUT /api/tasks/:id
  if (taskMatch && request.method === 'PUT') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const { data, error } = await updateTask(supabase, taskMatch[1], body);
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data }));
  }

  // DELETE /api/tasks/:id
  if (taskMatch && request.method === 'DELETE') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await deleteTask(supabase, taskMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // POST /api/tasks/:id/complete
  const taskCompleteMatch = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})\/complete$/);
  if (taskCompleteMatch && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json().catch(() => ({})) as any;
    const { data, error } = await completeTask(supabase, taskCompleteMatch[1], body.completed_by);
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data }));
  }

  // ═══════════════════════════════════════════════════════════════
  // TAGS CRUD
  // ═══════════════════════════════════════════════════════════════

  // GET /api/tags
  if (url.pathname === '/api/tags' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const filters: any = {};
    if (url.searchParams.get('category')) filters.category = url.searchParams.get('category');
    const data = await listTags(supabase, filters);
    return corsResponse(JSON.stringify({ data }));
  }

  // POST /api/tags
  if (url.pathname === '/api/tags' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['name']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const tag = await createTag(supabase, body);
    if (!tag) return corsResponse(JSON.stringify({ error: 'Error creando tag' }), 500);
    return corsResponse(JSON.stringify({ data: tag }), 201);
  }

  // GET /api/tags/:id
  const tagMatch = url.pathname.match(/^\/api\/tags\/([0-9a-f-]{36})$/);
  if (tagMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const tag = await getTag(supabase, tagMatch[1]);
    if (!tag) return corsResponse(JSON.stringify({ error: 'Tag no encontrado' }), 404);
    return corsResponse(JSON.stringify({ data: tag }));
  }

  // PUT /api/tags/:id
  if (tagMatch && request.method === 'PUT') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const updated = await updateTag(supabase, tagMatch[1], body);
    if (!updated) return corsResponse(JSON.stringify({ error: 'Error actualizando tag' }), 500);
    return corsResponse(JSON.stringify({ data: updated }));
  }

  // DELETE /api/tags/:id
  if (tagMatch && request.method === 'DELETE') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await deleteTag(supabase, tagMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // ═══════════════════════════════════════════════════════════════
  // LEAD TAGS
  // ═══════════════════════════════════════════════════════════════

  // GET /api/leads/:id/tags
  const leadTagsMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/tags$/);
  if (leadTagsMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const tags = await getLeadTags(supabase, leadTagsMatch[1]);
    return corsResponse(JSON.stringify({ data: tags }));
  }

  // POST /api/leads/:id/tags
  if (leadTagsMatch && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['tag_id']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const leadTag = await addTagToLead(supabase, leadTagsMatch[1], body.tag_id, body.created_by);
    if (!leadTag) return corsResponse(JSON.stringify({ error: 'Error asignando tag' }), 500);
    return corsResponse(JSON.stringify({ data: leadTag }), 201);
  }

  // DELETE /api/leads/:id/tags/:tagId
  const leadTagDeleteMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/tags\/([0-9a-f-]{36})$/);
  if (leadTagDeleteMatch && request.method === 'DELETE') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await removeTagFromLead(supabase, leadTagDeleteMatch[1], leadTagDeleteMatch[2]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // POST /api/tags/:id/bulk-tag
  const bulkTagMatch = url.pathname.match(/^\/api\/tags\/([0-9a-f-]{36})\/bulk-tag$/);
  if (bulkTagMatch && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['lead_ids']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const result = await bulkTagLeads(supabase, body.lead_ids, bulkTagMatch[1], body.created_by);
    return corsResponse(JSON.stringify(result));
  }

  // ═══════════════════════════════════════════════════════════════
  // LEAD NOTES
  // ═══════════════════════════════════════════════════════════════

  // GET /api/leads/:id/notes
  const leadNotesMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/notes$/);
  if (leadNotesMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const { page, limit } = parsePagination(url);
    const filters: any = { page, limit };
    if (url.searchParams.get('note_type')) filters.note_type = url.searchParams.get('note_type');
    if (url.searchParams.get('pinned') === 'true') filters.pinned = true;
    const { data, total } = await listNotes(supabase, leadNotesMatch[1], filters);
    return corsResponse(JSON.stringify(paginatedResponse(data, total, page, limit)));
  }

  // GET /api/leads/:id/notes/pinned
  const pinnedNotesMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/notes\/pinned$/);
  if (pinnedNotesMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const data = await getPinnedNotes(supabase, pinnedNotesMatch[1]);
    return corsResponse(JSON.stringify({ data }));
  }

  // POST /api/leads/:id/notes
  if (leadNotesMatch && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    body.lead_id = leadNotesMatch[1];
    const err = validateRequired(body, ['content']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const note = await createNote(supabase, body);
    if (!note) return corsResponse(JSON.stringify({ error: 'Error creando nota' }), 500);
    return corsResponse(JSON.stringify({ data: note }), 201);
  }

  // PUT /api/notes/:id
  const noteMatch = url.pathname.match(/^\/api\/notes\/([0-9a-f-]{36})$/);
  if (noteMatch && request.method === 'PUT') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const updated = await updateNote(supabase, noteMatch[1], body);
    if (!updated) return corsResponse(JSON.stringify({ error: 'Error actualizando nota' }), 500);
    return corsResponse(JSON.stringify({ data: updated }));
  }

  // DELETE /api/notes/:id
  if (noteMatch && request.method === 'DELETE') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await deleteNote(supabase, noteMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // POST /api/notes/:id/pin
  const notePinMatch = url.pathname.match(/^\/api\/notes\/([0-9a-f-]{36})\/pin$/);
  if (notePinMatch && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await pinNote(supabase, notePinMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // DELETE /api/notes/:id/pin
  if (notePinMatch && request.method === 'DELETE') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await unpinNote(supabase, notePinMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // GET /api/notes/search
  if (url.pathname === '/api/notes/search' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const query = url.searchParams.get('q') || '';
    if (!query) return corsResponse(JSON.stringify({ error: 'Parametro q es requerido' }), 400);
    const leadId = url.searchParams.get('lead_id') || undefined;
    const data = await searchNotes(supabase, query, leadId);
    return corsResponse(JSON.stringify({ data }));
  }

  // ═══════════════════════════════════════════════════════════════
  // CUSTOM FIELDS
  // ═══════════════════════════════════════════════════════════════

  // GET /api/custom-fields?entity_type=lead
  if (url.pathname === '/api/custom-fields' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const entityType = url.searchParams.get('entity_type');
    if (!entityType) return corsResponse(JSON.stringify({ error: 'entity_type es requerido' }), 400);
    const result = await listFields(supabase, entityType);
    return corsResponse(JSON.stringify({ data: result.data }));
  }

  // POST /api/custom-fields
  if (url.pathname === '/api/custom-fields' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const err = validateRequired(body, ['entity_type', 'field_name', 'field_label', 'field_type']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    body.tenant_id = supabase.getTenantId();
    const { data, error } = await createField(supabase, body);
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data }), 201);
  }

  // GET /api/custom-fields/:id
  const fieldMatch = url.pathname.match(/^\/api\/custom-fields\/([0-9a-f-]{36})$/);
  if (fieldMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const fieldResult = await getField(supabase, fieldMatch[1]);
    if (!fieldResult.data) return corsResponse(JSON.stringify({ error: 'Campo no encontrado' }), 404);
    return corsResponse(JSON.stringify({ data: fieldResult.data }));
  }

  // PUT /api/custom-fields/:id
  if (fieldMatch && request.method === 'PUT') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    const { data, error } = await updateField(supabase, fieldMatch[1], body);
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data }));
  }

  // DELETE /api/custom-fields/:id
  if (fieldMatch && request.method === 'DELETE') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    await deleteField(supabase, fieldMatch[1]);
    return corsResponse(JSON.stringify({ ok: true }));
  }

  // GET /api/entities/:id/custom-values?entity_type=lead
  const entityValuesMatch = url.pathname.match(/^\/api\/entities\/([0-9a-f-]{36})\/custom-values$/);
  if (entityValuesMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const entityType = url.searchParams.get('entity_type');
    if (!entityType) return corsResponse(JSON.stringify({ error: 'entity_type es requerido' }), 400);
    const valuesResult = await getFieldValues(supabase, entityValuesMatch[1], entityType);
    return corsResponse(JSON.stringify({ data: valuesResult.data }));
  }

  // POST /api/entities/:id/custom-values
  if (entityValuesMatch && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const body = await request.json() as any;
    if (body.values && Array.isArray(body.values)) {
      const result = await bulkSetFieldValues(supabase, entityValuesMatch[1], body.values);
      return corsResponse(JSON.stringify(result));
    }
    const err = validateRequired(body, ['field_id', 'value']);
    if (err) return corsResponse(JSON.stringify({ error: err }), 400);
    const { data, error } = await setFieldValue(supabase, body.field_id, entityValuesMatch[1], body.value);
    if (error) return corsResponse(JSON.stringify({ error: error.message }), 500);
    return corsResponse(JSON.stringify({ data }));
  }

  // ═══════════════════════════════════════════════════════════════
  // IMPORT / EXPORT
  // ═══════════════════════════════════════════════════════════════

  // POST /api/leads/import
  if (url.pathname === '/api/leads/import' && request.method === 'POST') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    try {
      const body = await request.json() as any;
      const err = validateRequired(body, ['csv']);
      if (err) return corsResponse(JSON.stringify({ error: err }), 400);

      const { headers, rows } = parseCSV(body.csv);
      const { valid, errors: validationErrors } = validateImportData(rows);

      if (valid.length === 0) {
        return corsResponse(JSON.stringify({
          error: 'No se encontraron filas validas',
          validation_errors: validationErrors
        }), 400);
      }

      const result = await importLeads(supabase, valid, {
        assignTo: body.assign_to,
        defaultSource: body.default_source,
        skipDuplicates: body.skip_duplicates !== false
      });

      return corsResponse(JSON.stringify({
        ...result,
        validation_errors: validationErrors,
        total_rows: rows.length
      }));
    } catch (e: any) {
      return corsResponse(JSON.stringify({ error: e.message }), 400);
    }
  }

  // GET /api/leads/export
  if (url.pathname === '/api/leads/export' && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const filters: any = {};
    if (url.searchParams.get('status')) filters.status = url.searchParams.get('status');
    if (url.searchParams.get('assigned_to')) filters.assigned_to = url.searchParams.get('assigned_to');
    if (url.searchParams.get('source')) filters.source = url.searchParams.get('source');
    if (url.searchParams.get('created_from')) filters.created_from = url.searchParams.get('created_from');
    if (url.searchParams.get('created_to')) filters.created_to = url.searchParams.get('created_to');

    const includeCustomFields = url.searchParams.get('include_custom_fields') === 'true';
    const csv = includeCustomFields
      ? await exportLeadsWithCustomFields(supabase, filters)
      : await exportLeads(supabase, filters);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads_export.csv"',
        ...Object.fromEntries(Object.entries({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        }))
      }
    });
  }

  // GET /api/leads/:id/tasks
  const leadTasksMatch = url.pathname.match(/^\/api\/leads\/([0-9a-f-]{36})\/tasks$/);
  if (leadTasksMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const leadTasksResult = await getTasksByLead(supabase, leadTasksMatch[1]);
    return corsResponse(JSON.stringify({ data: leadTasksResult.data }));
  }

  // GET /api/team-members/:id/tasks
  const memberTasksMatch = url.pathname.match(/^\/api\/team-members\/([0-9a-f-]{36})\/tasks$/);
  if (memberTasksMatch && request.method === 'GET') {
    const authErr = checkAuth(request, env, corsResponse, checkApiAuth);
    if (authErr) return authErr;
    const status = (url.searchParams.get('status') || undefined) as TaskStatus | undefined;
    const assigneeResult = await getTasksByAssignee(supabase, memberTasksMatch[1], status);
    return corsResponse(JSON.stringify({ data: assigneeResult.data }));
  }

  return null;
}
