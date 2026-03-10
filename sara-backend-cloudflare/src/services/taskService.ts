import { SupabaseService } from './supabase';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TaskType = 'general' | 'follow_up' | 'call' | 'visit' | 'document' | 'payment' | 'other';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface CreateTaskData {
  tenant_id: string;
  title: string;
  description?: string;
  task_type?: TaskType;
  priority?: TaskPriority;
  assigned_to?: string;
  lead_id?: string;
  property_id?: string;
  due_date?: string;
  due_time?: string;
  recurrence?: string;
  parent_task_id?: string;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  task_type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigned_to?: string | null;
  lead_id?: string | null;
  property_id?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  recurrence?: string | null;
  parent_task_id?: string | null;
  metadata?: Record<string, any>;
}

export interface ListTasksFilters {
  tenant_id: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string;
  lead_id?: string;
  task_type?: TaskType;
  due_date_from?: string;
  due_date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TaskStatsFilters {
  tenant_id: string;
  assigned_to?: string;
  lead_id?: string;
}

export interface TaskStats {
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  overdue: number;
  total: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Create a new task. Returns the created task or { data, error }. */
export async function createTask(supabase: SupabaseService, data: CreateTaskData) {
  const { data: task, error } = await supabase.client
    .from('tasks')
    .insert([data])
    .select()
    .single();

  if (error) {
    console.error('Error creating task:', error.message);
    return { data: null, error };
  }
  return { data: task, error: null };
}

/** Get a single task by ID. */
export async function getTask(supabase: SupabaseService, taskId: string) {
  const { data, error } = await supabase.client
    .from('tasks')
    .select('*, assigned:team_members!assigned_to(id, name, phone), lead:leads!lead_id(id, name, phone), property:properties!property_id(id, name)')
    .eq('id', taskId)
    .single();

  if (error) {
    console.error('Error getting task:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/** List tasks with filters, search, and pagination. Returns { data, total }. */
export async function listTasks(supabase: SupabaseService, filters: ListTasksFilters) {
  const { tenant_id, status, priority, assigned_to, lead_id, task_type, due_date_from, due_date_to, search, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = supabase.client
    .from('tasks')
    .select('*, assigned:team_members!assigned_to(id, name, phone), lead:leads!lead_id(id, name, phone), property:properties!property_id(id, name)', { count: 'exact' })
    .eq('tenant_id', tenant_id);

  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (assigned_to) query = query.eq('assigned_to', assigned_to);
  if (lead_id) query = query.eq('lead_id', lead_id);
  if (task_type) query = query.eq('task_type', task_type);
  if (due_date_from) query = query.gte('due_date', due_date_from);
  if (due_date_to) query = query.lte('due_date', due_date_to);
  if (search) query = query.ilike('title', `%${search}%`);

  query = query.order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error listing tasks:', error.message);
    return { data: [], total: 0, error };
  }
  return { data: data || [], total: count || 0, error: null };
}

/** Update a task's fields. Returns the updated task. */
export async function updateTask(supabase: SupabaseService, taskId: string, updates: UpdateTaskData) {
  const { data, error } = await supabase.client
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('Error updating task:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/** Soft-delete a task by setting its status to 'cancelled'. */
export async function deleteTask(supabase: SupabaseService, taskId: string) {
  return updateTask(supabase, taskId, { status: 'cancelled' });
}

/** Mark a task as completed with timestamp and who completed it. */
export async function completeTask(supabase: SupabaseService, taskId: string, completedBy: string) {
  const { data, error } = await supabase.client
    .from('tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('Error completing task:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

/** Get all tasks for a specific lead, ordered by due date. */
export async function getTasksByLead(supabase: SupabaseService, leadId: string) {
  const { data, error } = await supabase.client
    .from('tasks')
    .select('*, assigned:team_members!assigned_to(id, name, phone)')
    .eq('lead_id', leadId)
    .neq('status', 'cancelled')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting tasks by lead:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

/** Get tasks assigned to a team member, optionally filtered by status. */
export async function getTasksByAssignee(supabase: SupabaseService, assigneeId: string, status?: TaskStatus) {
  let query = supabase.client
    .from('tasks')
    .select('*, lead:leads!lead_id(id, name, phone), property:properties!property_id(id, name)')
    .eq('assigned_to', assigneeId);

  if (status) {
    query = query.eq('status', status);
  } else {
    query = query.neq('status', 'cancelled');
  }

  query = query.order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error getting tasks by assignee:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

/** Get overdue tasks (due_date < today, status pending or in_progress). */
export async function getOverdueTasks(supabase: SupabaseService) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase.client
    .from('tasks')
    .select('*, assigned:team_members!assigned_to(id, name, phone), lead:leads!lead_id(id, name, phone)')
    .lt('due_date', today)
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Error getting overdue tasks:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

/** Get task statistics: counts by status, by priority, overdue count. Optional filters. */
export async function getTaskStats(supabase: SupabaseService, filters?: TaskStatsFilters): Promise<TaskStats> {
  const today = new Date().toISOString().split('T')[0];

  let baseQuery = supabase.client.from('tasks').select('status, priority, due_date');

  if (filters?.tenant_id) baseQuery = baseQuery.eq('tenant_id', filters.tenant_id);
  if (filters?.assigned_to) baseQuery = baseQuery.eq('assigned_to', filters.assigned_to);
  if (filters?.lead_id) baseQuery = baseQuery.eq('lead_id', filters.lead_id);

  const { data: tasks, error } = await baseQuery;

  if (error || !tasks) {
    console.error('Error getting task stats:', error?.message);
    return { by_status: {}, by_priority: {}, overdue: 0, total: 0 };
  }

  const by_status: Record<string, number> = {};
  const by_priority: Record<string, number> = {};
  let overdue = 0;

  for (const task of tasks) {
    by_status[task.status] = (by_status[task.status] || 0) + 1;
    by_priority[task.priority] = (by_priority[task.priority] || 0) + 1;

    if (task.due_date && task.due_date < today && (task.status === 'pending' || task.status === 'in_progress')) {
      overdue++;
    }
  }

  return { by_status, by_priority, overdue, total: tasks.length };
}
