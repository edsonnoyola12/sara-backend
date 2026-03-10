import { SupabaseService } from './supabase';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AgentScorecard {
  agent_id: string;
  agent_name: string;
  period: string;                // YYYY-MM
  leads_assigned: number;
  leads_contacted: number;
  appointments_scheduled: number;
  appointments_completed: number;
  visits_completed: number;
  deals_closed: number;
  revenue: number;
  conversion_rate: number;       // leads -> closed %
  avg_response_time_hours: number;
  tasks_completed: number;
  tasks_pending: number;
  score: number;                 // 0-100 composite
}

export interface TeamScorecard {
  period: string;
  agents: AgentScorecard[];
  team_totals: Omit<AgentScorecard, 'agent_id' | 'agent_name' | 'period' | 'score'>;
  top_performer: { agent_id: string; agent_name: string; score: number };
}

const CONTACTED = ['contacted', 'qualified', 'visit_scheduled', 'scheduled', 'visited', 'negotiating', 'negotiation', 'reserved', 'sold', 'closed', 'delivered'];
const CLOSED = ['sold', 'closed', 'delivered'];
const SUM_KEYS: (keyof AgentScorecard)[] = ['leads_assigned', 'leads_contacted', 'appointments_scheduled', 'appointments_completed', 'visits_completed', 'deals_closed', 'revenue', 'tasks_completed', 'tasks_pending'];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Pure function. Weighted composite score (0-100). */
export function calculateCompositeScore(sc: Partial<AgentScorecard>): number {
  const assigned = sc.leads_assigned || 0;
  const totalTasks = (sc.tasks_completed || 0) + (sc.tasks_pending || 0);
  const hours = sc.avg_response_time_hours ?? 24;

  const convPts = Math.min((sc.conversion_rate || 0) / 20, 1) * 30;         // 30% — max if >=20%
  const apptPts = Math.min((sc.appointments_completed || 0) / 10, 1) * 20;  // 20% — max if >=10
  const contPts = (assigned > 0 ? Math.min((sc.leads_contacted || 0) / assigned, 1) : 0) * 20;
  const taskPts = (totalTasks > 0 ? (sc.tasks_completed || 0) / totalTasks : 0) * 15;
  const timePts = Math.max(0, 1 - hours / 24) * 15;                         // 15% — 0h=100%, >=24h=0%

  return Math.round(Math.min(100, convPts + apptPts + contPts + taskPts + timePts));
}

/** Generate scorecard for one agent. Period defaults to current YYYY-MM. */
export async function generateAgentScorecard(
  supabase: SupabaseService, agentId: string, period?: string
): Promise<AgentScorecard | null> {
  const p = period || currentPeriod();
  const [y, m] = p.split('-').map(Number);
  const start = `${p}-01`;
  const end = `${p}-${new Date(y, m, 0).getDate()}`;

  const { data: agent } = await supabase.client
    .from('team_members').select('id, name').eq('id', agentId).single();
  if (!agent) return null;

  // Parallel queries
  const [leadsRes, apptsRes, tasksRes] = await Promise.all([
    supabase.client.from('leads')
      .select('id, status, created_at, last_sara_interaction, budget')
      .eq('assigned_to', agentId).gte('created_at', start).lte('created_at', end),
    supabase.client.from('appointments')
      .select('id, status')
      .eq('vendor_id', agentId).gte('scheduled_date', start).lte('scheduled_date', end),
    supabase.client.from('tasks')
      .select('id, status')
      .eq('assigned_to', agentId).gte('created_at', start).lte('created_at', end),
  ]);

  const leads = leadsRes.data || [];
  const appts = apptsRes.data || [];
  const tasks = tasksRes.data || [];

  const leadsAssigned = leads.length;
  const leadsContacted = leads.filter(l => CONTACTED.includes(l.status)).length;
  const dealsClosed = leads.filter(l => CLOSED.includes(l.status)).length;
  const revenue = leads.filter(l => CLOSED.includes(l.status))
    .reduce((s, l) => s + (Number(l.budget) || 0), 0);
  const conversionRate = leadsAssigned > 0 ? round2((dealsClosed / leadsAssigned) * 100) : 0;

  const appointmentsScheduled = appts.length;
  const appointmentsCompleted = appts.filter(a => a.status === 'completed').length;

  const tasksCompleted = tasks.filter(t => t.status === 'completed').length;
  const tasksPending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;

  // Avg response time (hours between lead creation and first SARA interaction)
  const times = leads
    .filter(l => l.last_sara_interaction && l.created_at)
    .map(l => Math.max(0, (new Date(l.last_sara_interaction).getTime() - new Date(l.created_at).getTime()) / 3_600_000));
  const avgResponseTimeHours = times.length > 0 ? round1(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  const sc: AgentScorecard = {
    agent_id: agent.id, agent_name: agent.name, period: p,
    leads_assigned: leadsAssigned, leads_contacted: leadsContacted,
    appointments_scheduled: appointmentsScheduled, appointments_completed: appointmentsCompleted,
    visits_completed: appointmentsCompleted, deals_closed: dealsClosed,
    revenue, conversion_rate: conversionRate, avg_response_time_hours: avgResponseTimeHours,
    tasks_completed: tasksCompleted, tasks_pending: tasksPending, score: 0,
  };
  sc.score = calculateCompositeScore(sc);
  return sc;
}

/** Generate scorecards for all active vendedores. Returns TeamScorecard. */
export async function generateTeamScorecard(
  supabase: SupabaseService, period?: string
): Promise<TeamScorecard> {
  const p = period || currentPeriod();

  const { data: vendors } = await supabase.client
    .from('team_members').select('id').eq('role', 'vendedor').eq('active', true);

  const agents: AgentScorecard[] = [];
  for (const v of (vendors || [])) {
    const sc = await generateAgentScorecard(supabase, v.id, p);
    if (sc) agents.push(sc);
  }

  // Aggregate totals
  const totals = {} as TeamScorecard['team_totals'];
  for (const k of SUM_KEYS) totals[k as any] = 0;
  for (const a of agents) {
    for (const k of SUM_KEYS) (totals as any)[k] += (a as any)[k];
  }
  totals.conversion_rate = totals.leads_assigned > 0 ? round2((totals.deals_closed / totals.leads_assigned) * 100) : 0;
  const validTimes = agents.filter(a => a.avg_response_time_hours > 0);
  totals.avg_response_time_hours = validTimes.length > 0
    ? round1(validTimes.reduce((s, a) => s + a.avg_response_time_hours, 0) / validTimes.length) : 0;

  const top = agents.length > 0
    ? agents.reduce((best, a) => a.score > best.score ? a : best, agents[0])
    : null;

  return {
    period: p, agents, team_totals: totals,
    top_performer: top
      ? { agent_id: top.agent_id, agent_name: top.agent_name, score: top.score }
      : { agent_id: '', agent_name: 'N/A', score: 0 },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
