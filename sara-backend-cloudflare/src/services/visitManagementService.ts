// ═══════════════════════════════════════════════════════════════════════════
// VISIT MANAGEMENT SERVICE - Gestión de Visitas
// Manages property visits, scheduling, follow-ups, and visit analytics
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Visit {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  property_id: string | null;
  development: string;
  scheduled_date: string;
  scheduled_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  vendor_id: string | null;
  vendor_name: string | null;
  notes: string | null;
  feedback: string | null;
  rating: number | null;        // 1-5
  created_at: string;
  updated_at: string;
}

export interface VisitSummary {
  generated_at: string;
  period: string;

  // Counts
  total_visits: number;
  completed: number;
  cancelled: number;
  no_shows: number;
  pending: number;

  // Rates
  completion_rate: string;
  no_show_rate: string;
  conversion_rate: string;     // Visits that led to sale

  // By development
  by_development: Array<{
    development: string;
    visits: number;
    completed: number;
    conversion_rate: string;
  }>;

  // By vendor
  by_vendor: Array<{
    vendor_id: string;
    vendor_name: string;
    visits: number;
    completed: number;
    no_shows: number;
    conversion_rate: string;
  }>;

  // Today/upcoming
  today: Visit[];
  tomorrow: Visit[];
  this_week: Visit[];

  // Analytics
  avg_rating: number;
  best_day: string;
  peak_hour: string;
}

export interface VisitScheduleRequest {
  lead_phone: string;
  development: string;
  preferred_date?: string;
  preferred_time?: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class VisitManagementService {
  constructor(private supabase: SupabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET VISITS
  // ═══════════════════════════════════════════════════════════════════════════

  async getTodayVisits(): Promise<Visit[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getVisitsByDate(today);
  }

  async getTomorrowVisits(): Promise<Visit[]> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.getVisitsByDate(tomorrow.toISOString().split('T')[0]);
  }

  async getWeekVisits(): Promise<Visit[]> {
    const today = new Date();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);

    return this.getVisitsByDateRange(
      today.toISOString().split('T')[0],
      weekEnd.toISOString().split('T')[0]
    );
  }

  async getVisitsByDate(date: string): Promise<Visit[]> {
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .eq('scheduled_date', date)
      .order('scheduled_time', { ascending: true });

    if (!appointments || appointments.length === 0) return [];

    // Get vendor names
    const vendorIds = [...new Set(appointments.map(a => a.assigned_to).filter(Boolean))];
    const { data: vendors } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .in('id', vendorIds);

    const vendorMap = new Map(vendors?.map(v => [v.id, v.name]) || []);

    return appointments.map(a => this.mapToVisit(a, vendorMap));
  }

  async getVisitsByDateRange(startDate: string, endDate: string): Promise<Visit[]> {
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (!appointments || appointments.length === 0) return [];

    const vendorIds = [...new Set(appointments.map(a => a.assigned_to).filter(Boolean))];
    const { data: vendors } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .in('id', vendorIds);

    const vendorMap = new Map(vendors?.map(v => [v.id, v.name]) || []);

    return appointments.map(a => this.mapToVisit(a, vendorMap));
  }

  async getVisitsByVendor(vendorId: string, days: number = 30): Promise<Visit[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone)')
      .eq('assigned_to', vendorId)
      .gte('scheduled_date', startDate.toISOString().split('T')[0])
      .order('scheduled_date', { ascending: false });

    if (!appointments || appointments.length === 0) return [];

    const { data: vendor } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .eq('id', vendorId)
      .single();

    const vendorMap = new Map([[vendorId, vendor?.name || 'Desconocido']]);

    return appointments.map(a => this.mapToVisit(a, vendorMap));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VISIT SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  async getVisitSummary(days: number = 30): Promise<VisitSummary> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const today = new Date().toISOString().split('T')[0];

    // Get all visits in period
    const { data: appointments } = await this.supabase.client
      .from('appointments')
      .select('*, leads(name, phone, status)')
      .gte('scheduled_date', startDate.toISOString().split('T')[0])
      .order('scheduled_date', { ascending: true });

    // Get vendors
    const { data: vendors } = await this.supabase.client
      .from('team_members')
      .select('id, name')
      .eq('active', true);

    const vendorMap = new Map(vendors?.map(v => [v.id, v.name]) || []);

    const visits = (appointments || []).map(a => this.mapToVisit(a, vendorMap));

    // Calculate stats
    const completed = visits.filter(v => v.status === 'completed').length;
    const cancelled = visits.filter(v => v.status === 'cancelled').length;
    const noShows = visits.filter(v => v.status === 'no_show').length;
    const pending = visits.filter(v => v.status === 'scheduled' || v.status === 'confirmed').length;

    const totalWithOutcome = completed + cancelled + noShows;
    const completionRate = totalWithOutcome > 0
      ? ((completed / totalWithOutcome) * 100).toFixed(1) + '%'
      : '0%';
    const noShowRate = totalWithOutcome > 0
      ? ((noShows / totalWithOutcome) * 100).toFixed(1) + '%'
      : '0%';

    // Conversion rate (leads with visits that became sold)
    const soldLeads = (appointments || []).filter(a =>
      a.status === 'completed' && a.leads?.status === 'sold'
    ).length;
    const conversionRate = completed > 0
      ? ((soldLeads / completed) * 100).toFixed(1) + '%'
      : '0%';

    // By development
    const devStats: Record<string, { visits: number; completed: number; sold: number }> = {};
    for (const v of visits) {
      if (!devStats[v.development]) {
        devStats[v.development] = { visits: 0, completed: 0, sold: 0 };
      }
      devStats[v.development].visits++;
      if (v.status === 'completed') devStats[v.development].completed++;
    }
    for (const a of appointments || []) {
      const dev = a.development || a.property_interest || 'Otro';
      if (a.status === 'completed' && a.leads?.status === 'sold') {
        if (devStats[dev]) devStats[dev].sold++;
      }
    }

    const byDevelopment = Object.entries(devStats)
      .map(([development, stats]) => ({
        development,
        visits: stats.visits,
        completed: stats.completed,
        conversion_rate: stats.completed > 0
          ? ((stats.sold / stats.completed) * 100).toFixed(1) + '%'
          : '0%'
      }))
      .sort((a, b) => b.visits - a.visits);

    // By vendor
    const vendorStats: Record<string, { visits: number; completed: number; noShows: number; sold: number }> = {};
    for (const v of visits) {
      if (!v.vendor_id) continue;
      if (!vendorStats[v.vendor_id]) {
        vendorStats[v.vendor_id] = { visits: 0, completed: 0, noShows: 0, sold: 0 };
      }
      vendorStats[v.vendor_id].visits++;
      if (v.status === 'completed') vendorStats[v.vendor_id].completed++;
      if (v.status === 'no_show') vendorStats[v.vendor_id].noShows++;
    }
    for (const a of appointments || []) {
      if (a.assigned_to && a.status === 'completed' && a.leads?.status === 'sold') {
        if (vendorStats[a.assigned_to]) vendorStats[a.assigned_to].sold++;
      }
    }

    const byVendor = Object.entries(vendorStats)
      .map(([vendorId, stats]) => ({
        vendor_id: vendorId,
        vendor_name: vendorMap.get(vendorId) || 'Desconocido',
        visits: stats.visits,
        completed: stats.completed,
        no_shows: stats.noShows,
        conversion_rate: stats.completed > 0
          ? ((stats.sold / stats.completed) * 100).toFixed(1) + '%'
          : '0%'
      }))
      .sort((a, b) => b.visits - a.visits);

    // Today/tomorrow/week
    const todayVisits = visits.filter(v => v.scheduled_date === today);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    const tomorrowVisits = visits.filter(v => v.scheduled_date === tomorrowDate);

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekVisits = visits.filter(v => {
      const vDate = new Date(v.scheduled_date);
      return vDate >= new Date(today) && vDate <= weekEnd;
    });

    // Analytics
    const ratings = visits.filter(v => v.rating).map(v => v.rating!);
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : 0;

    // Best day (most visits)
    const dayStats: Record<string, number> = {};
    for (const v of visits) {
      const day = new Date(v.scheduled_date).toLocaleDateString('es-MX', { weekday: 'long' });
      dayStats[day] = (dayStats[day] || 0) + 1;
    }
    const bestDay = Object.entries(dayStats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Peak hour
    const hourStats: Record<string, number> = {};
    for (const v of visits) {
      const hour = v.scheduled_time.split(':')[0];
      hourStats[hour] = (hourStats[hour] || 0) + 1;
    }
    const peakHour = Object.entries(hourStats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return {
      generated_at: new Date().toISOString(),
      period: `Últimos ${days} días`,
      total_visits: visits.length,
      completed,
      cancelled,
      no_shows: noShows,
      pending,
      completion_rate: completionRate,
      no_show_rate: noShowRate,
      conversion_rate: conversionRate,
      by_development: byDevelopment,
      by_vendor: byVendor,
      today: todayVisits,
      tomorrow: tomorrowVisits,
      this_week: weekVisits,
      avg_rating: avgRating,
      best_day: bestDay,
      peak_hour: peakHour + ':00'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE VISIT STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  async updateVisitStatus(
    visitId: string,
    status: 'confirmed' | 'completed' | 'cancelled' | 'no_show',
    feedback?: string,
    rating?: number
  ): Promise<boolean> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (feedback) updateData.notes = feedback;
    if (rating) updateData.rating = rating;

    const { error } = await this.supabase.client
      .from('appointments')
      .update(updateData)
      .eq('id', visitId);

    if (error) {
      console.error('Error updating visit:', error);
      return false;
    }

    // If completed, update lead status
    if (status === 'completed') {
      const { data: visit } = await this.supabase.client
        .from('appointments')
        .select('lead_id')
        .eq('id', visitId)
        .single();

      if (visit?.lead_id) {
        await this.supabase.client
          .from('leads')
          .update({
            status: 'visited',
            funnel_status: 'visited',
            updated_at: new Date().toISOString()
          })
          .eq('id', visit.lead_id);
      }
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  formatSummaryForWhatsApp(summary: VisitSummary): string {
    let msg = `📅 *GESTIÓN DE VISITAS*\n`;
    msg += `📊 ${summary.period}\n\n`;

    msg += `*Estadísticas:*\n`;
    msg += `• Total: ${summary.total_visits} visitas\n`;
    msg += `• ✅ Completadas: ${summary.completed}\n`;
    msg += `• ❌ Canceladas: ${summary.cancelled}\n`;
    msg += `• 👻 No shows: ${summary.no_shows}\n`;
    msg += `• ⏳ Pendientes: ${summary.pending}\n\n`;

    msg += `*Métricas:*\n`;
    msg += `• Tasa completación: ${summary.completion_rate}\n`;
    msg += `• Tasa no-show: ${summary.no_show_rate}\n`;
    msg += `• Conversión a venta: ${summary.conversion_rate}\n`;
    if (summary.avg_rating > 0) {
      msg += `• Calificación promedio: ${summary.avg_rating}/5\n`;
    }
    msg += `\n`;

    if (summary.today.length > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📌 *HOY (${summary.today.length}):*\n`;
      for (const v of summary.today.slice(0, 5)) {
        const icon = v.status === 'confirmed' ? '✅' : '⏳';
        msg += `${icon} ${v.scheduled_time} - ${v.lead_name}\n`;
        msg += `   📍 ${v.development}\n`;
      }
      msg += `\n`;
    }

    if (summary.tomorrow.length > 0) {
      msg += `📌 *MAÑANA (${summary.tomorrow.length}):*\n`;
      for (const v of summary.tomorrow.slice(0, 3)) {
        msg += `⏳ ${v.scheduled_time} - ${v.lead_name}\n`;
      }
      msg += `\n`;
    }

    if (summary.by_development.length > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🏠 *POR DESARROLLO:*\n`;
      for (const d of summary.by_development.slice(0, 5)) {
        msg += `• ${d.development}: ${d.visits} (${d.conversion_rate} conv)\n`;
      }
      msg += `\n`;
    }

    msg += `💡 _Mejor día: ${summary.best_day}_\n`;
    msg += `💡 _Hora pico: ${summary.peak_hour}_`;

    return msg;
  }

  formatTodayForWhatsApp(visits: Visit[]): string {
    if (visits.length === 0) {
      return `📅 *VISITAS DE HOY*\n\n_No hay visitas programadas para hoy._\n\n¿Quieres ver las de mañana?`;
    }

    let msg = `📅 *VISITAS DE HOY*\n`;
    msg += `📊 ${visits.length} visita(s) programada(s)\n\n`;

    for (const v of visits) {
      const statusIcon = {
        'scheduled': '⏳',
        'confirmed': '✅',
        'completed': '✔️',
        'cancelled': '❌',
        'no_show': '👻'
      }[v.status] || '⏳';

      msg += `${statusIcon} *${v.scheduled_time}* - ${v.lead_name}\n`;
      msg += `   📍 ${v.development}\n`;
      if (v.vendor_name) {
        msg += `   👤 ${v.vendor_name}\n`;
      }
      if (v.notes) {
        msg += `   📝 ${v.notes}\n`;
      }
      msg += `\n`;
    }

    const pending = visits.filter(v => v.status === 'scheduled' || v.status === 'confirmed');
    if (pending.length > 0) {
      msg += `\n_${pending.length} visita(s) pendiente(s) de confirmar_`;
    }

    return msg;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private mapToVisit(appointment: any, vendorMap: Map<string, string>): Visit {
    return {
      id: appointment.id,
      lead_id: appointment.lead_id,
      lead_name: appointment.leads?.name || appointment.lead_name || 'Sin nombre',
      lead_phone: appointment.leads?.phone || appointment.lead_phone || '',
      property_id: appointment.property_id || null,
      development: appointment.development || appointment.property_interest || 'Sin especificar',
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time || '10:00',
      status: appointment.status || 'scheduled',
      vendor_id: appointment.assigned_to || null,
      vendor_name: appointment.assigned_to ? vendorMap.get(appointment.assigned_to) || null : null,
      notes: appointment.notes || null,
      feedback: appointment.feedback || null,
      rating: appointment.rating || null,
      created_at: appointment.created_at,
      updated_at: appointment.updated_at
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getVisitStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    'scheduled': '⏳',
    'confirmed': '✅',
    'completed': '✔️',
    'cancelled': '❌',
    'no_show': '👻'
  };
  return icons[status] || '⏳';
}
