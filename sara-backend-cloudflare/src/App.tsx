import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts'
import { Users, Calendar as CalendarIcon, Settings, TrendingUp, Phone, DollarSign, Target, Award, Building, UserCheck, Flame, X, Save, Plus, Edit, Trash2, CreditCard, AlertTriangle, Clock, CheckCircle, XCircle, ArrowRight, Megaphone, BarChart3, Eye, MousePointer, Lightbulb, TrendingDown, AlertCircle } from 'lucide-react'

type View = 'dashboard' | 'leads' | 'properties' | 'team' | 'calendar' | 'mortgage' | 'marketing' | 'referrals' | 'goals' | 'config' | 'followups'

interface Lead {
  id: string
  name: string
  phone: string
  property_interest: string
  budget: string
  score: number
  status: string
  created_at: string
  conversation_history: any[]
  assigned_to?: string
  source?: string
  campaign_id?: string
  updated_at?: string
  fallen_reason?: string
  notes?: any
  credit_status?: string
  status_changed_at?: string
}

interface Property {
  id: string
  name: string
  category: string
  price: number
  bedrooms: number
  bathrooms: number
  area_m2: number
  total_units: number
  sold_units: number
  photo_url: string
  description: string
  neighborhood: string
  city: string
  development: string
  ideal_client: string
  sales_phrase: string
  youtube_link: string
  matterport_link: string
  gps_link: string
  brochure_urls: string
  gallery_urls: string
  address: string
  floors: number
}

interface TeamMember {
  id: string
  name: string
  phone: string
  role: string
  sales_count: number
  commission: number
  active: boolean
  photo_url: string
  email: string
}

interface MortgageApplication {
  id: string
  lead_id: string
  lead_name: string
  lead_phone: string
  property_id: string
  property_name: string
  monthly_income: number
  additional_income: number
  current_debt: number
  down_payment: number
  requested_amount: number
  credit_term_years: number
  prequalification_score: number
  max_approved_amount: number
  estimated_monthly_payment: number
  assigned_advisor_id: string
  assigned_advisor_name: string
  bank: string
  status: string
  status_notes: string
  pending_at: string
  in_review_at: string
  sent_to_bank_at: string
  decision_at: string
  stalled_alert_sent: boolean
  created_at: string
  updated_at: string
}

interface AlertSetting {
  id: string
  category: string
  stage: string
  max_days: number
}

interface Campaign {
  id: string
  name: string
  channel: string
  status: string
  budget: number
  spent: number
  impressions: number
  clicks: number
  leads_generated: number
  sales_closed: number
  revenue_generated: number
  start_date: string
  end_date: string
  notes: string
  target_audience: string
  creative_url: string
  created_at: string
}

interface Appointment {
  id: string
  lead_id: string
  lead_phone: string
  lead_name?: string
  property_id: string
  property_name: string
  vendedor_id?: string
  vendedor_name?: string
  asesor_id?: string
  asesor_name?: string
  scheduled_date: string
  scheduled_time: string
  status: 'scheduled' | 'cancelled' | 'completed'
  appointment_type: string
  duration_minutes: number
  google_event_vendedor_id?: string
  google_event_asesor_id?: string
  cancelled_by?: string
  created_at: string
  updated_at: string
}


interface ReminderConfig {
  id: string
  lead_category: string
  reminder_hours: number
  active: boolean
  message_template: string
  send_start_hour: number
  send_end_hour: number
}

interface Insight {
  type: 'opportunity' | 'warning' | 'success'
  title: string
  description: string
  action?: string
  icon: any
}

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [leads, setLeads] = useState<Lead[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [mortgages, setMortgages] = useState<MortgageApplication[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [alertSettings, setAlertSettings] = useState<AlertSetting[]>([])
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [loginPhone, setLoginPhone] = useState('')
  const [loginError, setLoginError] = useState('')
  const [showAllData, setShowAllData] = useState(false)
  const [leadViewMode, setLeadViewMode] = useState<'list' | 'funnel'>('list')
  const [showNewLead, setShowNewLead] = useState(false)
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [statusChange, setStatusChange] = useState<{lead: Lead, newStatus: string} | null>(null)
  const [statusNote, setStatusNote] = useState("")
  const [newLead, setNewLead] = useState({ name: '', phone: '', property_interest: '', budget: '', status: 'new' })
  const [reminderConfigs, setReminderConfigs] = useState<ReminderConfig[]>([])
  const [editingReminder, setEditingReminder] = useState<ReminderConfig | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState<Insight[]>([])
  
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [editingMortgage, setEditingMortgage] = useState<MortgageApplication | null>(null)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [showNewProperty, setShowNewProperty] = useState(false)
  const [showNewMember, setShowNewMember] = useState(false)
  const [showNewMortgage, setShowNewMortgage] = useState(false)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<any[]>([])
  const [referrals, setReferrals] = useState<any[]>([])
  const [monthlyGoals, setMonthlyGoals] = useState<{month: string, company_goal: number}>({ month: "", company_goal: 0 })
  const [vendorGoals, setVendorGoals] = useState<{vendor_id: string, goal: number, name: string}[]>([])
  const [selectedGoalMonth, setSelectedGoalMonth] = useState(new Date().toISOString().slice(0, 7))
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [showNewEvent, setShowNewEvent] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [leadsRes, propsRes, teamRes, mortgagesRes, campaignsRes, remindersRes, appointmentsRes, alertRes] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('properties').select('*'),
      supabase.from('team_members').select('*'),
      supabase.from('mortgage_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('reminder_config').select('*').order('lead_category'),
      supabase.from('appointments').select('*').order('scheduled_date', { ascending: true }),
      supabase.from('alert_settings').select('*').order('category').order('stage')
    ])
    setLeads(leadsRes.data || [])
    setProperties(propsRes.data || [])
    setTeam(teamRes.data || [])
    setMortgages(mortgagesRes.data || [])
    setCampaigns(campaignsRes.data || [])
    setAlertSettings(alertRes.data || [])
    setReminderConfigs(remindersRes.data || [])
    setAppointments(appointmentsRes.data || [])
    console.log('🔍 Reminders cargados:', remindersRes.data)
    
    generateInsights(leadsRes.data || [], teamRes.data || [], campaignsRes.data || [])
    
    setLoading(false)
    loadCalendarEvents()
  }

  
  // Extraer thumbnail de YouTube
  const getYoutubeThumbnail = (url: string) => {
    if (!url) return null
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([^&?]+)/)
    return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null
  }

  // ============ METAS MENSUALES ============
  const loadMonthlyGoals = async (month: string) => {
    const { data: companyGoal } = await supabase
      .from('monthly_goals')
      .select('*')
      .eq('month', month)
      .single()
    
    if (companyGoal) {
      setMonthlyGoals({ month: companyGoal.month, company_goal: companyGoal.company_goal })
    } else {
      setMonthlyGoals({ month, company_goal: 0 })
    }
    
    const { data: vendorGoalsData } = await supabase
      .from('vendor_monthly_goals')
      .select('*')
      .eq('month', month)
    
    const activeVendors = team.filter(t => t.role === 'vendedor' && t.active)
    const goals = activeVendors.map(v => {
      const existing = vendorGoalsData?.find((vg: any) => vg.vendor_id === v.id)
      return { vendor_id: v.id, goal: existing?.goal || 0, name: v.name }
    })
    setVendorGoals(goals)
  }
  
  const saveCompanyGoal = async (goal: number) => {
    await supabase.from('monthly_goals').upsert({ 
      month: selectedGoalMonth, 
      company_goal: goal 
    }, { onConflict: 'month' })
    setMonthlyGoals({ month: selectedGoalMonth, company_goal: goal })
  }
  
  const saveVendorGoal = async (vendorId: string, goal: number) => {
    await supabase.from('vendor_monthly_goals').upsert({
      month: selectedGoalMonth,
      vendor_id: vendorId,
      goal: goal
    }, { onConflict: 'month,vendor_id' })
  }
  
  const getClosedByVendor = (vendorId: string) => {
    return leads.filter(l => 
      l.assigned_to === vendorId && 
      (l.status === 'closed' || l.status === 'Cerrado')
    ).length
  }
  
  const getReservedByVendor = (vendorId: string) => {
    return leads.filter(l => 
      l.assigned_to === vendorId && 
      (l.status === 'reserved' || l.status === 'Reservado')
    ).length
  }
  
  const getNegotiationByVendor = (vendorId: string) => {
    return leads.filter(l => 
      l.assigned_to === vendorId && 
      (l.status === 'negotiation' || l.status === 'Negociacion')
    ).length
  }

  useEffect(() => {
    if (team.length > 0) loadMonthlyGoals(selectedGoalMonth)
  }, [selectedGoalMonth, team.length])


  function generateInsights(leads: Lead[], team: TeamMember[], campaigns: Campaign[]) {
    const newInsights: Insight[] = []

    const hotLeadsNoActivity = leads.filter(l => {
      if (l.score >= 8 && l.status === 'new') {
        const updatedAt = new Date(l.updated_at || l.created_at)
        const horasSinActividad = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60)
        return horasSinActividad > 2
      }
      return false
    })

    if (hotLeadsNoActivity.length > 0) {
      newInsights.push({
        type: 'warning',
        title: `${hotLeadsNoActivity.length} leads HOT sin atención`,
        description: 'Tienes leads calificados que no han recibido seguimiento en las últimas 2 horas',
        action: 'Contactar urgente',
        icon: Flame
      })
    }

    const highCPLCampaigns = campaigns.filter(c => {
      const cpl = c.leads_generated > 0 ? c.spent / c.leads_generated : 0
      return cpl > 1000 && c.status === 'active'
    })

    if (highCPLCampaigns.length > 0) {
      newInsights.push({
        type: 'warning',
        title: `CPL alto en ${highCPLCampaigns[0].name}`,
        description: `El costo por lead es de $${(highCPLCampaigns[0].spent / highCPLCampaigns[0].leads_generated).toFixed(0)}. Considera ajustar segmentación`,
        action: 'Revisar campaña',
        icon: TrendingDown
      })
    }

    const mostInterested = leads.reduce((acc: Record<string, number>, l) => {
      if (l.property_interest) {
        acc[l.property_interest] = (acc[l.property_interest] || 0) + 1
      }
      return acc
    }, {})

    const topProperty = Object.entries(mostInterested).sort((a, b) => b[1] - a[1])[0]
    if (topProperty && topProperty[1] > 5) {
      newInsights.push({
        type: 'success',
        title: `${topProperty[0]} tiene alta demanda`,
        description: `${topProperty[1]} leads interesados. Considera aumentar precio o crear campaña específica`,
        action: 'Ver propiedad',
        icon: TrendingUp
      })
    }

    const topSeller = team.filter(t => t.role === 'vendedor').sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))[0]
    if (topSeller && topSeller.sales_count > 0) {
      newInsights.push({
        type: 'success',
        title: `${topSeller.name} lidera en ventas`,
        description: `${topSeller.sales_count} ventas cerradas. Comparte sus mejores prácticas con el equipo`,
        action: 'Ver estadísticas',
        icon: Award
      })
    }

    const negativeROICampaigns = campaigns.filter(c => {
      const roi = c.spent > 0 ? ((c.revenue_generated - c.spent) / c.spent * 100) : 0
      return roi < -20 && c.status === 'active'
    })

    if (negativeROICampaigns.length > 0) {
      newInsights.push({
        type: 'warning',
        title: `${negativeROICampaigns.length} campañas con ROI negativo`,
        description: 'Revisa la efectividad de estas campañas y considera pausarlas o ajustarlas',
        action: 'Ver campañas',
        icon: AlertCircle
      })
    }

    const qualifiedLeads = leads.filter(l => l.score >= 7 && l.status === 'qualified')
    if (qualifiedLeads.length > 3) {
      newInsights.push({
        type: 'opportunity',
        title: `${qualifiedLeads.length} clientes listos para cerrar`,
        description: 'Tienes leads calificados que están en la etapa final. Prioriza el seguimiento',
        action: 'Ver leads',
        icon: Target
      })
    }


    // ============ INSIGHTS DE METAS ============
    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const dayOfMonth = today.getDate()
    const daysRemaining = daysInMonth - dayOfMonth
    
    const closedThisMonth = leads.filter(l => 
      (l.status === 'closed' || l.status === 'Cerrado') &&
      new Date(l.updated_at || l.created_at).getMonth() === today.getMonth()
    ).length
    
    const currentMonthGoal = monthlyGoals.company_goal || 0
    if (currentMonthGoal > 0) {
      const percentComplete = Math.round((closedThisMonth / currentMonthGoal) * 100)
      const expectedPercent = Math.round((dayOfMonth / daysInMonth) * 100)
      
      if (percentComplete < expectedPercent - 10) {
        newInsights.push({
          type: 'warning',
          title: `Meta en riesgo: ${percentComplete}% completado`,
          description: `Faltan ${daysRemaining} días y deberían ir al ${expectedPercent}%. Necesitan cerrar ${currentMonthGoal - closedThisMonth} más.`,
          action: 'Ver metas',
          icon: Target
        })
      }
    }
    
    // Reservados estancados (+7 días)
    const stuckReserved = leads.filter(l => {
      if (l.status === 'reserved' || l.status === 'Reservado') {
        const updatedAt = new Date(l.updated_at || l.created_at)
        const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
        return daysSinceUpdate > 7
      }
      return false
    })
    
    if (stuckReserved.length > 0) {
      newInsights.push({
        type: 'warning',
        title: `${stuckReserved.length} reservados estancados`,
        description: 'Llevan más de 7 días sin avance en crédito. Revisar con asesores hipotecarios.',
        action: 'Ver leads',
        icon: Clock
      })
    }

    setInsights(newInsights)
  }

  async function loadCalendarEvents() {
    try {
      const response = await fetch("https://sara-backend.edson-633.workers.dev/api/calendar/events")
      const data = await response.json()
      setCalendarEvents(data.items || [])
    } catch (error) {
      console.error("Error loading calendar:", error)
    }
  }

  async function createCalendarEvent(eventData: any) {
    try {
      await fetch("https://sara-backend.edson-633.workers.dev/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventData)
      })
      loadCalendarEvents()
      setShowNewEvent(false)
    } catch (error) {
      console.error("Error creating event:", error)
    }
  }

  async function deleteCalendarEvent(eventId: string) {
    if (confirm("¿Cancelar esta cita?")) {
      try {
        await fetch(`https://sara-backend.edson-633.workers.dev/api/calendar/events/${eventId}`, {
          method: "DELETE"
        })
        loadCalendarEvents()
      } catch (error) {
        console.error("Error deleting event:", error)
      }
    }
  }

  async function saveProperty(prop: Partial<Property>) {
    if (prop.id) {
      await supabase.from('properties').update(prop).eq('id', prop.id)
    } else {
      await supabase.from('properties').insert([prop])
    }
    loadData()
    setEditingProperty(null)
    setShowNewProperty(false)
  }

  async function deleteProperty(id: string) {
    if (confirm('¿Eliminar esta propiedad?')) {
      await supabase.from('properties').delete().eq('id', id)
      loadData()
    }
  }

  async function saveMember(member: Partial<TeamMember>) {
    try {
      const API_URL = 'https://sara-backend.edson-633.workers.dev/api/team-members'
      
      if (member.id) {
        // Editar existente
        await fetch(`${API_URL}/${member.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(member)
        })
      } else {
        // Crear nuevo
        await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(member)
        })
      }
      
      loadData()
      setEditingMember(null)
      setShowNewMember(false)
    } catch (error) {
      console.error('Error guardando miembro:', error)
      alert('Error al guardar. Revisa la consola.')
    }
  }

  async function deleteMember(id: string) {
    if (!confirm('¿Eliminar este miembro del equipo?')) return
    
    try {
      await fetch(`https://sara-backend.edson-633.workers.dev/api/team-members/${id}`, {
        method: 'DELETE'
      })
      loadData()
    } catch (error) {
      console.error('Error eliminando miembro:', error)
      alert('Error al eliminar. Revisa la consola.')
    }
  }

  async function saveMortgage(mortgage: Partial<MortgageApplication>) {
    const now = new Date().toISOString()
    if (mortgage.id) {
      const current = mortgages.find(m => m.id === mortgage.id)
      if (current && current.status !== mortgage.status) {
        if (mortgage.status === 'in_review') mortgage.in_review_at = now
        if (mortgage.status === 'sent_to_bank') mortgage.sent_to_bank_at = now
        if (mortgage.status === 'approved' || mortgage.status === 'rejected') mortgage.decision_at = now
      }
      await supabase.from('mortgage_applications').update(mortgage).eq('id', mortgage.id)
    } else {
      mortgage.pending_at = now
      await supabase.from('mortgage_applications').insert([mortgage])
    }
    loadData()
    setEditingMortgage(null)
    setShowNewMortgage(false)
  }

  async function updateMortgageStatus(id: string, newStatus: string) {
    const now = new Date().toISOString()
    const updates: any = { status: newStatus }
    if (newStatus === 'in_review') updates.in_review_at = now
    if (newStatus === 'sent_to_bank') updates.sent_to_bank_at = now
    if (newStatus === 'approved' || newStatus === 'rejected') updates.decision_at = now
    
    await supabase.from('mortgage_applications').update(updates).eq('id', id)
    loadData()
  }

  async function saveCampaign(campaign: Partial<Campaign>) {
    if (campaign.id) {
      await supabase.from('marketing_campaigns').update(campaign).eq('id', campaign.id)
    } else {
      await supabase.from('marketing_campaigns').insert([campaign])
    }
    loadData()
    setEditingCampaign(null)
    setShowNewCampaign(false)
  }

  async function deleteCampaign(id: string) {
    if (confirm('¿Eliminar esta campaña?')) {
      await supabase.from('marketing_campaigns').delete().eq('id', id)
      loadData()
    }
  }

  function getDaysInStatus(mortgage: MortgageApplication): number {
    let statusDate: string | null = null
    switch (mortgage.status) {
      case 'pending': statusDate = mortgage.pending_at; break
      case 'in_review': statusDate = mortgage.in_review_at; break
      case 'sent_to_bank': statusDate = mortgage.sent_to_bank_at; break
      default: statusDate = mortgage.updated_at
    }
    if (!statusDate) return 0
    return Math.floor((Date.now() - new Date(statusDate).getTime()) / (1000 * 60 * 60 * 24))
  }

  const hotLeads = leads.filter(l => l.score >= 8).length
  const warmLeads = leads.filter(l => l.score >= 5 && l.score < 8).length
  const coldLeads = leads.filter(l => l.score < 5).length
  const totalSales = team.reduce((acc, t) => acc + (t.sales_count || 0), 0)
  const totalCommissions = team.reduce((acc, t) => acc + (t.commission || 0), 0)
  const availableUnits = properties.reduce((acc, p) => acc + ((p.total_units || 0) - (p.sold_units || 0) - 0), 0)
  const soldUnits = properties.reduce((acc, p) => acc + (p.sold_units || 0), 0)

  const totalBudget = campaigns.reduce((acc, c) => acc + (c.budget || 0), 0)
  const totalSpent = campaigns.reduce((acc, c) => acc + (c.spent || 0), 0)
  const totalLeadsFromCampaigns = campaigns.reduce((acc, c) => acc + (c.leads_generated || 0), 0)
  const totalSalesFromCampaigns = campaigns.reduce((acc, c) => acc + (c.sales_closed || 0), 0)
  const totalRevenue = campaigns.reduce((acc, c) => acc + (c.revenue_generated || 0), 0)
  const avgCPL = totalLeadsFromCampaigns > 0 ? totalSpent / totalLeadsFromCampaigns : 0
  const avgCPA = totalSalesFromCampaigns > 0 ? totalSpent / totalSalesFromCampaigns : 0
  const roi = totalSpent > 0 ? ((totalRevenue - totalSpent) / totalSpent) * 100 : 0

  const scoreData = [
    { name: 'HOT', value: hotLeads, color: '#ef4444' },
    { name: 'WARM', value: warmLeads, color: '#f97316' },
    { name: 'COLD', value: coldLeads, color: '#3b82f6' }
  ]

  const roiByChannel = campaigns.reduce((acc: any[], c) => {
    const existing = acc.find(x => x.channel === c.channel)
    if (existing) {
      existing.spent += c.spent || 0
      existing.leads += c.leads_generated || 0
      existing.sales += c.sales_closed || 0
      existing.revenue += c.revenue_generated || 0
    } else {
      acc.push({ 
        channel: c.channel, 
        spent: c.spent || 0, 
        leads: c.leads_generated || 0, 
        sales: c.sales_closed || 0,
        revenue: c.revenue_generated || 0
      })
    }
    return acc
  

}, [])

  const saveReminderConfig = async (config: ReminderConfig) => {
    try {
      const { error } = await supabase
        .from('reminder_config')
        .update({
          reminder_hours: config.reminder_hours,
          message_template: config.message_template,
          send_start_hour: config.send_start_hour,
          send_end_hour: config.send_end_hour
        })
        .eq('id', config.id)
      
      if (error) throw error
      
      setReminderConfigs(prev => prev.map(r => r.id === config.id ? config : r))
      setEditingReminder(null)
    } catch (error) {
      console.error('Error updating reminder config:', error)
    }
  }


  const vendedoresRanking = [...team].filter(t => t.role === 'vendedor').sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
  const asesoresRanking = [...team].filter(t => t.role === 'asesor').sort((a, b) => (b.commission || 0) - (a.commission || 0))
  const asesores = team.filter(t => t.role === 'asesor')

  // ============ NUEVAS MÉTRICAS DEL DASHBOARD ============
  
  // 1. Tiempo promedio de respuesta (primera respuesta a lead nuevo)
  const avgResponseTime = (() => {
    const leadsWithResponse = leads.filter(l => l.status !== 'new' && l.created_at && l.status_changed_at)
    if (leadsWithResponse.length === 0) return 0
    const totalMinutes = leadsWithResponse.reduce((sum, l) => {
      const created = new Date(l.created_at).getTime()
      const changed = new Date(l.status_changed_at || l.created_at).getTime()
      return sum + (changed - created) / (1000 * 60)
    }, 0)
    return Math.round(totalMinutes / leadsWithResponse.length)
  })()

  // 2. Tasa de conversión por etapa
  const conversionByStage = (() => {
    const stages = ['new', 'contacted', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed']
    const counts = stages.map(s => leads.filter(l => l.status === s || stages.indexOf(l.status) > stages.indexOf(s)).length)
    return stages.map((stage, i) => ({
      stage: stage === 'new' ? 'Nuevo' : stage === 'contacted' ? 'Contactado' : stage === 'scheduled' ? 'Cita' : stage === 'visited' ? 'Visitó' : stage === 'negotiation' ? 'Negociación' : stage === 'reserved' ? 'Reservado' : 'Cerrado',
      count: leads.filter(l => l.status === stage).length,
      conversion: i === 0 ? 100 : counts[0] > 0 ? Math.round((counts[i] / counts[0]) * 100) : 0
    }))
  })()

  // 3. Conversión por vendedor
  const conversionByVendor = (() => {
    const vendedores = team.filter(t => t.role === 'vendedor')
    return vendedores.map(v => {
      const vendorLeads = leads.filter(l => l.assigned_to === v.id)
      const closed = vendorLeads.filter(l => l.status === 'closed' || l.status === 'Cerrado').length
      return {
        name: v.name?.split(' ')[0] || 'Sin nombre',
        total: vendorLeads.length,
        closed,
        conversion: vendorLeads.length > 0 ? Math.round((closed / vendorLeads.length) * 100) : 0
      }
    }).sort((a, b) => b.conversion - a.conversion)
  })()

  // 4. CPL por fuente/canal
  const cplBySource = (() => {
    return roiByChannel.map(c => ({
      channel: c.channel,
      cpl: c.leads > 0 ? Math.round(c.spent / c.leads) : 0,
      leads: c.leads,
      spent: c.spent
    })).sort((a, b) => a.cpl - b.cpl)
  })()

  // 5. Tendencia mensual (últimos 6 meses)
  const monthlyTrend = (() => {
    const months: {month: string, leads: number, closed: number, revenue: number}[] = []
    for (let i = 5; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const monthStr = date.toLocaleDateString('es-MX', { month: 'short' })
      const monthNum = date.getMonth()
      const yearNum = date.getFullYear()
      
      const monthLeads = leads.filter(l => {
        const d = new Date(l.created_at)
        return d.getMonth() === monthNum && d.getFullYear() === yearNum
      }).length
      
      const monthClosed = leads.filter(l => {
        const d = new Date(l.updated_at || l.created_at)
        return d.getMonth() === monthNum && d.getFullYear() === yearNum && (l.status === 'closed' || l.status === 'Cerrado')
      }).length
      
      const monthRevenue = campaigns.filter(c => {
        const d = new Date(c.created_at)
        return d.getMonth() === monthNum && d.getFullYear() === yearNum
      }).reduce((sum, c) => sum + (c.revenue_generated || 0), 0)
      
      months.push({ month: monthStr, leads: monthLeads, closed: monthClosed, revenue: monthRevenue })
    }
    return months
  })()

  // 6. Comparativo mes actual vs anterior
  const monthComparison = (() => {
    const now = new Date()
    const thisMonth = now.getMonth()
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const thisYear = now.getFullYear()
    const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear
    
    const thisMonthLeads = leads.filter(l => {
      const d = new Date(l.created_at)
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear
    }).length
    
    const lastMonthLeads = leads.filter(l => {
      const d = new Date(l.created_at)
      return d.getMonth() === lastMonth && d.getFullYear() === lastYear
    }).length
    
    const thisMonthClosed = leads.filter(l => {
      const d = new Date(l.updated_at || l.created_at)
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear && (l.status === 'closed' || l.status === 'Cerrado')
    }).length
    
    const lastMonthClosed = leads.filter(l => {
      const d = new Date(l.updated_at || l.created_at)
      return d.getMonth() === lastMonth && d.getFullYear() === lastYear && (l.status === 'closed' || l.status === 'Cerrado')
    }).length
    
    return {
      leadsChange: lastMonthLeads > 0 ? Math.round(((thisMonthLeads - lastMonthLeads) / lastMonthLeads) * 100) : 0,
      closedChange: lastMonthClosed > 0 ? Math.round(((thisMonthClosed - lastMonthClosed) / lastMonthClosed) * 100) : 0,
      thisMonthLeads,
      lastMonthLeads,
      thisMonthClosed,
      lastMonthClosed
    }
  })()

  // 7. Proyección de cierre (basado en pipeline actual)
  const closingProjection = (() => {
    const weights: Record<string, number> = {
      'new': 0.05, 'contacted': 0.10, 'scheduled': 0.20, 'visited': 0.40,
      'negotiation': 0.60, 'reserved': 0.85, 'closed': 1.0
    }
    const avgTicket = 2000000 // Precio promedio propiedad
    const projectedDeals = leads.reduce((sum, l) => sum + (weights[l.status] || 0), 0)
    return {
      deals: Math.round(projectedDeals),
      revenue: Math.round(projectedDeals * avgTicket)
    }
  })()

  // 8. Valor del pipeline ($)
  const pipelineValue = (() => {
    const avgTicket = 2000000
    const stageValues: Record<string, number> = {
      'negotiation': avgTicket * 0.6,
      'reserved': avgTicket * 0.85,
      'visited': avgTicket * 0.4
    }
    return leads.reduce((sum, l) => sum + (stageValues[l.status] || 0), 0)
  })()

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'bg-red-500'
    if (score >= 5) return 'bg-orange-500'
    return 'bg-blue-500'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 8) return 'HOT'
    if (score >= 5) return 'WARM'
    return 'COLD'
  }

  const mortgageStatuses = [
    { key: 'pending', label: 'Pendiente', icon: Clock, color: 'bg-gray-500' },
    { key: 'in_review', label: 'En Revisión', icon: AlertTriangle, color: 'bg-yellow-500' },
    { key: 'sent_to_bank', label: 'Enviado a Banco', icon: ArrowRight, color: 'bg-blue-500' },
    { key: 'approved', label: 'Aprobado', icon: CheckCircle, color: 'bg-green-500' },
    { key: 'rejected', label: 'Rechazado', icon: XCircle, color: 'bg-red-500' }
  ]

  const channelColors: Record<string, string> = {
    'Facebook': 'bg-blue-600',
    'Google Ads': 'bg-red-500',
    'Instagram': 'bg-pink-500',
    'TikTok': 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50',
    'TV': 'bg-purple-600',
    'Radio': 'bg-yellow-600',
    'Espectaculares': 'bg-green-600',
    'Referidos': 'bg-cyan-500'
  }

  if (loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando...</div>

  // Función de login
  const handleLogin = async () => {
    const cleanPhone = loginPhone.replace(/\D/g, '').slice(-10)
    if (cleanPhone.length !== 10) {
      setLoginError('Ingresa un número de 10 dígitos')
      return
    }
    
    const user = team.find((m: TeamMember) => {
      const memberPhone = m.phone?.replace(/\D/g, '').slice(-10)
      return memberPhone === cleanPhone
    })
    
    if (user) {
      setCurrentUser(user)
      setLoginError('')
      localStorage.setItem('sara_user_phone', cleanPhone)
    } else {
      setLoginError('Número no registrado en el equipo')
    }
  }

  // Filtrar leads por usuario
  const filteredLeads = currentUser && currentUser.role !== 'admin'
    ? leads.filter(l => l.assigned_to === currentUser.id)
    : leads

  // Filtrar solicitudes hipotecarias
  const filteredMortgages = currentUser && currentUser.role !== 'admin'
    ? mortgages.filter(m => 
        currentUser.role === 'asesor' 
          ? m.assigned_advisor_id === currentUser.id
          : leads.some(l => l.id === m.lead_id && l.assigned_to === currentUser.id)
      )
    : mortgages

  // Pantalla de login
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-xl w-96">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">SARA CRM</h1>
            <p className="text-slate-400 mt-2">Real Estate AI</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Tu número de WhatsApp</label>
              <input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} placeholder="5610016226" className="w-full p-3 bg-slate-700 rounded-xl border border-slate-600 focus:border-cyan-500 focus:outline-none" onKeyPress={(e) => e.key === 'Enter' && handleLogin()} />
            </div>
            {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
            <button onClick={handleLogin} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-semibold hover:opacity-90 transition">Entrar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <div className="w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800 p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">S</div><h1 className="text-2xl font-bold">SARA</h1></div>
        <p className="text-slate-400 text-sm mb-4">Real Estate AI</p>
        
        {currentUser && (
          <div className="bg-slate-800 rounded-xl p-3 mb-4">
            <p className="text-sm text-slate-400">Conectado como:</p>
            <p className="font-semibold">{currentUser.name}</p>
            <p className="text-xs text-slate-500">{currentUser.role}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setCurrentUser(null); localStorage.removeItem('sara_user_phone') }} className="text-xs px-2 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30">
                Salir
              </button>
            </div>
          </div>
        )}
        
        <nav className="flex-1 space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'dashboard' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <TrendingUp size={20} /> Dashboard
          </button>
          <button onClick={() => setView('leads')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'leads' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <Users size={20} /> Leads
          </button>
          <button onClick={() => setView('properties')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'properties' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <Building size={20} /> Propiedades
          </button>
          <button onClick={() => setView('team')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'team' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <UserCheck size={20} /> Equipo
          </button>
          <button onClick={() => setView('mortgage')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'mortgage' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <CreditCard size={20} /> Hipotecas
            {mortgages.filter(m => getDaysInStatus(m) > 3 && !['approved', 'rejected', 'cancelled'].includes(m.status)).length > 0 && (
              <span className="bg-red-500 text-xs px-2 py-1 rounded-full">
                {mortgages.filter(m => getDaysInStatus(m) > 3 && !['approved', 'rejected', 'cancelled'].includes(m.status)).length}
              </span>
            )}
          </button>
          <button onClick={() => setView('marketing')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'marketing' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <Megaphone size={20} /> Marketing
          </button>
          <button onClick={() => setView('calendar')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'calendar' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <CalendarIcon size={20} /> Calendario
          </button>
          {(!currentUser || currentUser.role === 'admin') && (
            <button onClick={() => setView('goals')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'goals' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
              <Target size={20} /> Metas
            </button>
          )}
          <button onClick={() => setView('followups')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'followups' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <Clock size={20} /> Follow-ups
          </button>
          <button onClick={() => setView('config')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'config' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
            <Settings size={20} /> Configuración
          </button>
        </nav>
      </div>

      <div className="flex-1 p-8 overflow-auto">
        {view === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">Dashboard</h2>
            
            {(() => {
              const maxDays: Record<string, number> = { new: 1, contacted: 3, scheduled: 1, visited: 5, negotiation: 10, reserved: 30 }
              const alertMsgs: Record<string, string> = { new: 'sin contactar', contacted: 'sin agendar cita', scheduled: 'confirmar visita', visited: 'sin seguimiento', negotiation: 'estancado', reserved: 'sin cerrar' }
              const now = new Date()
              const stalledLeads = filteredLeads.filter(lead => {
                const max = maxDays[lead.status]
                if (!max) return false
                const changedAt = lead.status_changed_at ? new Date(lead.status_changed_at) : new Date(lead.created_at)
                const days = Math.floor((now.getTime() - changedAt.getTime()) / (1000 * 60 * 60 * 24))
                return days >= max
              })
              
              const stalledMortgages = filteredMortgages.filter(m => {
                const maxM: Record<string, number> = { pending: 3, in_review: 5, sent_to_bank: 7 }
                const max = maxM[m.status]
                if (!max) return false
                const updatedAt = m.updated_at ? new Date(m.updated_at) : new Date(m.created_at)
                const days = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
                return days >= max
              })

              if (stalledLeads.length === 0 && stalledMortgages.length === 0) return null
              
              return (
                <div className="bg-red-900/30 border border-red-500/50 rounded-2xl p-4 mb-4">
                  <h3 className="text-lg font-bold text-red-400 mb-3">⚠️ Requieren atención</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {stalledLeads.length > 0 && (
                      <div>
                        <p className="text-sm text-red-300 mb-2">Leads estancados ({stalledLeads.length})</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {stalledLeads.slice(0, 5).map(lead => {
                            const changedAt = lead.status_changed_at ? new Date(lead.status_changed_at) : new Date(lead.created_at)
                            const days = Math.floor((now.getTime() - changedAt.getTime()) / (1000 * 60 * 60 * 24))
                            return (
                              <div key={lead.id} onClick={() => { setSelectedLead(lead); setView('leads') }} className="bg-red-900/50 p-2 rounded cursor-pointer hover:bg-red-800/50">
                                <p className="text-sm font-semibold">{lead.name || 'Sin nombre'}</p>
                                <p className="text-xs text-red-300">{days}d - {alertMsgs[lead.status]}</p>
                              </div>
                            )
                          })}
                          {stalledLeads.length > 5 && <p className="text-xs text-red-400">+{stalledLeads.length - 5} más</p>}
                        </div>
                      </div>
                    )}
                    {stalledMortgages.length > 0 && (
                      <div>
                        <p className="text-sm text-red-300 mb-2">Créditos sin avance ({stalledMortgages.length})</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {stalledMortgages.slice(0, 5).map(m => {
                            const updatedAt = m.updated_at ? new Date(m.updated_at) : new Date(m.created_at)
                            const days = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
                            return (
                              <div key={m.id} onClick={() => setView('mortgage')} className="bg-red-900/50 p-2 rounded cursor-pointer hover:bg-red-800/50">
                                <p className="text-sm font-semibold">{m.lead_name}</p>
                                <p className="text-xs text-red-300">{days}d - {m.bank || 'Sin banco'}</p>
                              </div>
                            )
                          })}
                          {stalledMortgages.length > 5 && <p className="text-xs text-red-400">+{stalledMortgages.length - 5} más</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            
            {insights.length > 0 && (
              <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all border border-purple-500/30">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="text-yellow-400" size={24} />
                  <h3 className="text-xl font-bold">AI Strategic Advisor</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {insights.map((insight, i) => {
                    const Icon = insight.icon
                    return (
                      <div key={i} className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-4 rounded-xl border-l-4 ${
                        insight.type === 'warning' ? 'border-yellow-500' : 
                        insight.type === 'success' ? 'border-green-500' : 
                        'border-blue-500'
                      }`}>
                        <div className="flex items-start gap-3">
                          <Icon className={
                            insight.type === 'warning' ? 'text-yellow-500' : 
                            insight.type === 'success' ? 'text-green-400 bg-green-500/20 p-2 rounded-xl' : 
                            'text-blue-400 bg-blue-500/20 p-2 rounded-xl'
                          } size={20} />
                          <div className="flex-1">
                            <p className="font-semibold mb-1">{insight.title}</p>
                            <p className="text-sm text-slate-400 mb-2">{insight.description}</p>
                            {insight.action && (
                              <button className="text-sm text-blue-400 hover:text-blue-300">
                                {insight.action} →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-slate-400">Total Leads</p>
                    <p className="text-3xl font-bold">{filteredLeads.length}</p>
                  </div>
                  <Users className="text-blue-400 bg-blue-500/20 p-2 rounded-xl" />
                </div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-slate-400">Leads HOT 🔥</p>
                    <p className="text-3xl font-bold text-red-400 bg-red-500/20 p-2 rounded-xl">{hotLeads}</p>
                  </div>
                  <Flame className="text-red-400 bg-red-500/20 p-2 rounded-xl" />
                </div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-slate-400">Ventas Cerradas</p>
                    <p className="text-3xl font-bold text-green-400 bg-green-500/20 p-2 rounded-xl">{totalSales}</p>
                  </div>
                  <Target className="text-green-400 bg-green-500/20 p-2 rounded-xl" />
                </div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-slate-400">ROI Marketing</p>
                    <p className={`text-3xl font-bold ${roi >= 0 ? 'text-green-400 bg-green-500/20 p-2 rounded-xl' : 'text-red-400 bg-red-500/20 p-2 rounded-xl'}`}>{roi.toFixed(0)}%</p>
                  </div>
                  <BarChart3 className="text-purple-400 bg-purple-500/20 p-2 rounded-xl" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <h3 className="text-xl font-semibold mb-4">Distribución de Leads</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={scoreData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {scoreData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <h3 className="text-xl font-semibold mb-4">Leads por Canal</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={roiByChannel}>
                    <XAxis dataKey="channel" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip />
                    <Bar dataKey="leads" fill="#3b82f6" name="Leads" />
                    <Bar dataKey="sales" fill="#22c55e" name="Ventas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Award className="text-yellow-500" /> Leaderboard Vendedores
              </h3>
              <div className="space-y-3">
                {vendedoresRanking.slice(0, 5).map((v, i) => (
                  <div key={v.id} className="flex items-center justify-between bg-slate-700 p-3 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-600' : 'bg-gray-600'}`}>
                        {i + 1}
                      </span>
                      <span>{v.name}</span>
                    </div>
                    <span className="font-bold text-green-400 bg-green-500/20 p-2 rounded-xl">{v.sales_count || 0} ventas</span>
                  </div>
                ))}
                {vendedoresRanking.length === 0 && <p className="text-slate-500">Sin vendedores registrados</p>}
              </div>
            </div>

            {/* ============ NUEVAS MÉTRICAS ============ */}
            
            {/* Fila de KPIs secundarios */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-4 rounded-2xl">
                <p className="text-slate-400 text-sm">⏱️ Tiempo Respuesta</p>
                <p className={`text-2xl font-bold ${avgResponseTime <= 30 ? 'text-green-400' : avgResponseTime <= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {avgResponseTime < 60 ? `${avgResponseTime} min` : `${Math.round(avgResponseTime/60)}h`}
                </p>
                <p className="text-xs text-slate-500">promedio 1er contacto</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-4 rounded-2xl">
                <p className="text-slate-400 text-sm">💰 Pipeline</p>
                <p className="text-2xl font-bold text-cyan-400">${(pipelineValue / 1000000).toFixed(1)}M</p>
                <p className="text-xs text-slate-500">valor en negociación</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-4 rounded-2xl">
                <p className="text-slate-400 text-sm">🎯 Proyección</p>
                <p className="text-2xl font-bold text-purple-400">{closingProjection.deals} cierres</p>
                <p className="text-xs text-slate-500">${(closingProjection.revenue / 1000000).toFixed(1)}M estimado</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-4 rounded-2xl">
                <p className="text-slate-400 text-sm">📈 vs Mes Anterior</p>
                <div className="flex gap-2 items-center">
                  <span className={`text-lg font-bold ${monthComparison.leadsChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {monthComparison.leadsChange >= 0 ? '↑' : '↓'}{Math.abs(monthComparison.leadsChange)}%
                  </span>
                  <span className="text-xs text-slate-500">leads</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`text-lg font-bold ${monthComparison.closedChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {monthComparison.closedChange >= 0 ? '↑' : '↓'}{Math.abs(monthComparison.closedChange)}%
                  </span>
                  <span className="text-xs text-slate-500">ventas</span>
                </div>
              </div>
            </div>

            {/* Gráfica de Tendencia Mensual */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl">
              <h3 className="text-xl font-semibold mb-4">📊 Tendencia Mensual (6 meses)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthlyTrend}>
                  <XAxis dataKey="month" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                  <Legend />
                  <Line type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} name="Leads" dot={{ fill: '#3b82f6' }} />
                  <Line type="monotone" dataKey="closed" stroke="#22c55e" strokeWidth={2} name="Cerrados" dot={{ fill: '#22c55e' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Grid de 3 columnas: Conversión por Etapa, por Vendedor, CPL por Canal */}
            <div className="grid grid-cols-3 gap-6">
              
              {/* Conversión por Etapa (Funnel) */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl">
                <h3 className="text-lg font-semibold mb-4">🔄 Conversión por Etapa</h3>
                <div className="space-y-2">
                  {conversionByStage.map((stage, i) => (
                    <div key={stage.stage} className="flex items-center gap-2">
                      <div className="w-20 text-xs text-slate-400">{stage.stage}</div>
                      <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
                        <div 
                          className={`h-full ${i === 0 ? 'bg-slate-500' : i < 3 ? 'bg-blue-500' : i < 5 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${stage.conversion}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-sm font-semibold">{stage.count}</span>
                        <span className="text-xs text-slate-500 ml-1">({stage.conversion}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conversión por Vendedor */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl">
                <h3 className="text-lg font-semibold mb-4">👤 Conversión por Vendedor</h3>
                <div className="space-y-2">
                  {conversionByVendor.slice(0, 5).map((v, i) => (
                    <div key={v.name} className="flex items-center gap-2">
                      <div className="w-20 text-xs text-slate-400 truncate">{v.name}</div>
                      <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
                        <div 
                          className={`h-full ${v.conversion >= 20 ? 'bg-green-500' : v.conversion >= 10 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(v.conversion * 2, 100)}%` }}
                        />
                      </div>
                      <div className="w-20 text-right">
                        <span className="text-sm font-semibold">{v.conversion}%</span>
                        <span className="text-xs text-slate-500 ml-1">({v.closed}/{v.total})</span>
                      </div>
                    </div>
                  ))}
                  {conversionByVendor.length === 0 && <p className="text-slate-500 text-sm">Sin datos</p>}
                </div>
              </div>

              {/* CPL por Canal */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl">
                <h3 className="text-lg font-semibold mb-4">💵 CPL por Canal</h3>
                <div className="space-y-2">
                  {cplBySource.slice(0, 5).map((c, i) => (
                    <div key={c.channel} className="flex items-center justify-between bg-slate-700/50 p-2 rounded-lg">
                      <div>
                        <p className="text-sm font-semibold">{c.channel}</p>
                        <p className="text-xs text-slate-500">{c.leads} leads</p>
                      </div>
                      <div className={`text-right px-3 py-1 rounded-lg ${c.cpl <= 300 ? 'bg-green-500/20 text-green-400' : c.cpl <= 600 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                        <p className="text-lg font-bold">${c.cpl}</p>
                        <p className="text-xs">por lead</p>
                      </div>
                    </div>
                  ))}
                  {cplBySource.length === 0 && <p className="text-slate-500 text-sm">Sin campañas</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'leads' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold">Leads ({filteredLeads.length})</h2>
              <div className="flex gap-4 items-center">
                <div className="flex gap-2">
                  <button onClick={() => setLeadViewMode('list')} className={`px-3 py-1 rounded-lg text-sm ${leadViewMode === 'list' ? 'bg-blue-600' : 'bg-slate-700'}`}>Lista</button>
                  <button onClick={() => setLeadViewMode('funnel')} className={`px-3 py-1 rounded-lg text-sm ${leadViewMode === 'funnel' ? 'bg-blue-600' : 'bg-slate-700'}`}>Funnel</button>
                </div>
                <button onClick={() => setShowNewLead(true)} className="bg-green-600 px-4 py-2 rounded-xl hover:bg-green-700 flex items-center gap-2">
                  <Plus size={20} /> Agregar Lead
                </button>
              </div>
              <div className="flex gap-2">
                <span className="bg-red-500 px-3 py-1 rounded-full text-sm">HOT ({hotLeads})</span>
                <span className="bg-orange-500 px-3 py-1 rounded-full text-sm">WARM ({warmLeads})</span>
                <span className="bg-blue-500 px-3 py-1 rounded-full text-sm">COLD ({coldLeads})</span>
              </div>
            </div>

            {leadViewMode === 'funnel' ? (
              <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                {[
                  { key: 'new', label: 'Nuevo', color: 'bg-slate-600' },
                  { key: 'contacted', label: 'Contactado', color: 'bg-blue-600' },
                  { key: 'scheduled', label: 'Cita', color: 'bg-cyan-600' },
                  { key: 'visited', label: 'Visitó', color: 'bg-purple-600' },
                  { key: 'negotiation', label: 'Negociación', color: 'bg-yellow-600' },
                  { key: 'reserved', label: 'Reservado', color: 'bg-orange-600' },
                  { key: 'closed', label: 'Cerrado', color: 'bg-green-600' },
                  { key: 'delivered', label: 'Entregado', color: 'bg-emerald-500' }
                ].map(stage => {
                  const stageLeads = filteredLeads.filter(l => l.status === stage.key)
                  return (
                    <div 
                      key={stage.key} 
                      className="bg-slate-800/50 rounded-xl p-2 min-h-[200px] border-2 border-dashed border-slate-600"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault()
                        if (draggedLead && draggedLead.status !== stage.key) {
                          await supabase.from('leads').update({ status: stage.key, status_changed_at: new Date().toISOString() }).eq('id', draggedLead.id)
                          setLeads(leads.map(l => l.id === draggedLead.id ? {...l, status: stage.key} : l))
                        }
                        setDraggedLead(null)
                      }}
                    >
                      <div className="bg-slate-600 text-center py-2 rounded-lg mb-2">
                        <p className="font-semibold text-xs">{stage.label}</p>
                        <p className="text-xl font-bold">{stageLeads.length}</p>
                      </div>
                      <div className="space-y-1 space-y-1">
                        {stageLeads.map(lead => (
                          <div 
                            key={lead.id} 
                            className="bg-slate-700 p-2 rounded hover:bg-slate-600"
                          >
                            <p onClick={() => setSelectedLead(lead)} className="font-semibold text-xs truncate cursor-pointer">{lead.name || 'Sin nombre'}</p>
                            <p className="text-xs text-slate-400">...{lead.phone?.slice(-4)}</p>
                            <select 
                              value={lead.status} 
                              onChange={(e) => {
                                if (e.target.value !== lead.status) {
                                  setStatusChange({lead, newStatus: e.target.value})
                                  setStatusNote('')
                                }
                              }}
                              className="w-full mt-1 p-1 text-xs bg-slate-600 rounded border-none"
                            >
                              <option value="new">Nuevo</option>
                              <option value="contacted">Contactado</option>
                              <option value="scheduled">Cita</option>
                              <option value="visited">Visitó</option>
                              <option value="negotiation">Negociación</option>
                              <option value="reserved">Reservado</option>
                              <option value="closed">Cerrado</option>
                              <option value="delivered">Entregado</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="text-left p-4">Nombre</th>
                    <th className="text-left p-4">Teléfono</th>
                    <th className="text-left p-4">Interés</th>
                    <th className="text-left p-4">Score</th>
                    <th className="text-left p-4">Estado</th>
                    <th className="text-left p-4">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => (
                    <tr key={lead.id} onClick={() => setSelectedLead(lead)} className="border-t border-slate-700 hover:bg-slate-700 cursor-pointer">
                      <td className="p-4">{lead.name || 'Sin nombre'}</td>
                      <td className="p-4 flex items-center gap-2"><Phone size={16} /> {lead.phone}</td>
                      <td className="p-4">{lead.property_interest || '-'}</td>
                      <td className="p-4">
                        <span className={`${getScoreColor(lead.score)} px-2 py-1 rounded text-sm`}>
                          {getScoreLabel(lead.score)} ({lead.score})
                        </span>
                      </td>
                      <td className="p-4">{lead.status}</td>
                      <td className="p-4">{new Date(lead.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            {statusChange && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-slate-800 p-6 rounded-2xl w-[400px]">
                  <h3 className="text-xl font-bold mb-4">Cambiar a: {statusChange.newStatus}</h3>
                  <p className="text-sm text-slate-400 mb-2">Lead: {statusChange.lead.name}</p>
                  <textarea 
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Agrega una nota (opcional)..."
                    className="w-full p-3 bg-slate-700 rounded-xl h-24 mb-4"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setStatusChange(null)}
                      className="flex-1 py-2 bg-slate-600 rounded-xl"
                    >Cancelar</button>
                    <button 
                      onClick={async () => {
                        const lead = statusChange.lead
                        const newStatus = statusChange.newStatus
                        const note = statusNote.trim()
                        const timestamp = new Date().toISOString()
                        const historyEntry = {date: timestamp, from: lead.status, to: newStatus, note: note}
                        const existingHistory = lead.notes?.status_history || []
                        const newNotes = {...(lead.notes || {}), status_history: [...existingHistory, historyEntry], last_note: note}
                        await supabase.from('leads').update({ status: newStatus, status_changed_at: timestamp, notes: newNotes }).eq('id', lead.id)
                        setLeads(leads.map(l => l.id === lead.id ? {...l, status: newStatus, notes: newNotes} : l))
                        setStatusChange(null)
                        setStatusNote('')
                      }}
                      className="flex-1 py-2 bg-green-600 rounded-xl font-semibold"
                    >Guardar</button>
                  </div>
                </div>
              </div>
            )}

            {showNewLead && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-slate-800 p-6 rounded-2xl w-[500px]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Nuevo Lead</h3>
                    <button onClick={() => setShowNewLead(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Nombre *</label>
                      <input type="text" value={newLead.name} onChange={(e) => setNewLead({...newLead, name: e.target.value})} className="w-full p-3 bg-slate-700 rounded-xl" placeholder="Juan Pérez" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Teléfono *</label>
                      <input type="tel" value={newLead.phone} onChange={(e) => setNewLead({...newLead, phone: e.target.value})} className="w-full p-3 bg-slate-700 rounded-xl" placeholder="5512345678" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Interés</label>
                      <input type="text" value={newLead.property_interest} onChange={(e) => setNewLead({...newLead, property_interest: e.target.value})} className="w-full p-3 bg-slate-700 rounded-xl" placeholder="Casa 3 recámaras" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Presupuesto</label>
                      <input type="text" value={newLead.budget} onChange={(e) => setNewLead({...newLead, budget: e.target.value})} className="w-full p-3 bg-slate-700 rounded-xl" placeholder="2,000,000" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Estado</label>
                      <select value={newLead.status} onChange={(e) => setNewLead({...newLead, status: e.target.value})} className="w-full p-3 bg-slate-700 rounded-xl">
                        <option value="new">Nuevo</option>
                        <option value="contacted">Contactado</option>
                        <option value="scheduled">Cita Agendada</option>
                        <option value="visited">Visitó</option>
                        <option value="negotiation">Negociación</option>
                      </select>
                    </div>
                    <button onClick={async () => {
                      if (!newLead.name || !newLead.phone) { alert('Nombre y teléfono requeridos'); return }
                      const { error } = await supabase.from('leads').insert({
                        name: newLead.name,
                        phone: newLead.phone,
                        property_interest: newLead.property_interest,
                        budget: newLead.budget,
                        status: newLead.status,
                        score: 0,
                        assigned_to: currentUser?.id,
                        created_at: new Date().toISOString()
                      })
                      if (error) { alert('Error: ' + error.message); return }
                      setShowNewLead(false)
                      setNewLead({ name: '', phone: '', property_interest: '', budget: '', status: 'new' })
                      const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
                      if (data) setLeads(data)
                    }} className="w-full py-3 bg-green-600 rounded-xl font-semibold hover:bg-green-700">
                      Guardar Lead
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'properties' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold">Propiedades ({properties.length})</h2>
              <button onClick={() => setShowNewProperty(true)} className="bg-blue-600 px-4 py-2 rounded-xl hover:bg-blue-700 flex items-center gap-2">
                <Plus size={20} /> Agregar Propiedad
              </button>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {properties.map(prop => (
                <div key={prop.id} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden group relative">
                  <div className="h-40 bg-slate-700 flex items-center justify-center">
                    {prop.photo_url ? (
                      <img src={prop.photo_url} alt={prop.name} className="w-full h-full object-cover" />
                    ) : prop.youtube_link ? (
                      <img src={getYoutubeThumbnail(prop.youtube_link) || ''} alt={prop.name} className="w-full h-full object-cover" />
                    ) : (
                      <Building size={48} className="text-slate-500" />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-1">{prop.name}</h3>
                    <p className="text-xs text-slate-400 mb-2">{prop.development || ''} - {prop.city || ''}</p>
                    <p className="text-2xl font-bold text-green-400 bg-green-500/20 p-2 rounded-xl mb-2">${(prop.price || 0).toLocaleString()}</p>
                    <p className="text-slate-400 text-sm mb-2">{prop.bedrooms || 0} rec | {prop.bathrooms || 0} baños | {prop.area_m2 || 0}m²</p>
                    <p className="text-cyan-400 text-xs mb-3 line-clamp-2">{prop.sales_phrase || prop.description || ''}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {prop.youtube_link && (
                        <a href={prop.youtube_link} target="_blank" rel="noreferrer" className="bg-red-600/20 text-red-400 px-2 py-1 rounded text-xs hover:bg-red-600/40">▶ Video</a>
                      )}
                      {prop.matterport_link && (
                        <a href={prop.matterport_link} target="_blank" rel="noreferrer" className="bg-purple-600/20 text-purple-400 px-2 py-1 rounded text-xs hover:bg-purple-600/40">🏠 3D</a>
                      )}
                      {prop.gps_link && (
                        <a href={prop.gps_link} target="_blank" rel="noreferrer" className="bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs hover:bg-green-600/40">📍 GPS</a>
                      )}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400 bg-green-500/20 p-2 rounded-xl">{prop.sold_units || 0} vendidas</span>
                      <span className="text-blue-400 bg-blue-500/20 p-2 rounded-xl">{(prop.total_units || 0) - (prop.sold_units || 0)} disponibles</span>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onClick={() => setEditingProperty(prop)} className="bg-blue-600 p-2 rounded-xl hover:bg-blue-700">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => deleteProperty(prop.id)} className="bg-red-600 p-2 rounded-xl hover:bg-red-700">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'team' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold">Equipo ({team.length})</h2>
              <button onClick={() => setShowNewMember(true)} className="bg-blue-600 px-4 py-2 rounded-xl hover:bg-blue-700 flex items-center gap-2">
                <Plus size={20} /> Agregar Miembro
              </button>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <h3 className="text-xl font-semibold mb-4">Vendedores</h3>
                <div className="space-y-3">
                  {team.filter(t => t.role === 'vendedor').map(member => (
                    <div key={member.id} className="flex items-center justify-between bg-slate-700 p-4 rounded-xl group">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
                          <Users size={24} />
                        </div>
                        <div>
                          <p className="font-semibold">{member.name}</p>
                          <p className="text-slate-400 text-sm">{member.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-green-400 bg-green-500/20 p-2 rounded-xl font-bold">{member.sales_count || 0} ventas</p>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100">
                          <button onClick={() => setEditingMember(member)} className="bg-blue-600 p-2 rounded-xl hover:bg-blue-700">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => deleteMember(member.id)} className="bg-red-600 p-2 rounded-xl hover:bg-red-700">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {team.filter(t => t.role === 'vendedor').length === 0 && <p className="text-slate-500 text-center py-4">Sin vendedores</p>}
                </div>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <h3 className="text-xl font-semibold mb-4">Asesores Hipotecarios</h3>
                <div className="space-y-3">
                  {team.filter(t => t.role === 'asesor').map(member => (
                    <div key={member.id} className="flex items-center justify-between bg-slate-700 p-4 rounded-xl group">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
                          <Users size={24} />
                        </div>
                        <div>
                          <p className="font-semibold">{member.name}</p>
                          <p className="text-slate-400 text-sm">{member.phone}</p>
                        </div>
                      </div>
                      <button onClick={() => setEditingMember(member)} className="opacity-0 group-hover:opacity-100 bg-blue-600 p-2 rounded-xl">
                        <Edit size={16} />
                      </button>
                    </div>
                  ))}
                  {team.filter(t => t.role === 'asesor').length === 0 && <p className="text-slate-500 text-center py-4">Sin asesores</p>}
                </div>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <h3 className="text-xl font-semibold mb-4">Marketing / Agencia</h3>
                <div className="space-y-3">
                  {team.filter(t => t.role === 'agencia').map(member => (
                    <div key={member.id} className="flex items-center justify-between bg-slate-700 p-4 rounded-xl group">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
                          <Megaphone size={24} />
                        </div>
                        <div>
                          <p className="font-semibold">{member.name}</p>
                          <p className="text-slate-400 text-sm">{member.phone}</p>
                        </div>
                      </div>
                      <button onClick={() => setEditingMember(member)} className="opacity-0 group-hover:opacity-100 bg-blue-600 p-2 rounded-xl">
                        <Edit size={16} />
                      </button>
                    </div>
                  ))}
                  {team.filter(t => t.role === 'agencia').length === 0 && <p className="text-slate-500 text-center py-4">Sin personal de marketing</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'mortgage' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold">Solicitudes Hipotecarias ({mortgages.length})</h2>
              <button onClick={() => setShowNewMortgage(true)} className="bg-blue-600 px-4 py-2 rounded-xl hover:bg-blue-700 flex items-center gap-2">
                <Plus size={20} /> Nueva Solicitud
              </button>
            </div>

            <div className="grid grid-cols-5 gap-4">
              {mortgageStatuses.map(status => {
                const StatusIcon = status.icon
                const statusMortgages = mortgages.filter(m => m.status === status.key)
                return (
                  <div key={status.key} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <StatusIcon className="text-white" size={20} />
                      <h3 className="font-semibold">{status.label}</h3>
                      <span className={`${status.color} text-xs px-2 py-1 rounded-full ml-auto`}>
                        {statusMortgages.length}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {statusMortgages.map(mortgage => {
                        const daysInStatus = getDaysInStatus(mortgage)
                        return (
                          <div key={mortgage.id} onClick={() => setEditingMortgage(mortgage)} className="bg-slate-700 p-3 rounded-xl cursor-pointer hover:bg-gray-600 relative">
                            {daysInStatus > 3 && !['approved', 'rejected'].includes(mortgage.status) && (
                              <AlertTriangle className="absolute top-2 right-2 text-red-400 bg-red-500/20 p-2 rounded-xl" size={16} />
                            )}
                            <p className="font-semibold text-sm">{mortgage.lead_name}</p>
                            <p className="text-xs text-slate-400">{mortgage.property_name}</p>
                            <p className="text-xs text-slate-400 mt-1">${(mortgage.requested_amount || 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-500 mt-1">{daysInStatus}d en {status.label.toLowerCase()}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'marketing' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold">Marketing ({campaigns.length} campañas)</h2>
              <button onClick={() => setShowNewCampaign(true)} className="bg-blue-600 px-4 py-2 rounded-xl hover:bg-blue-700 flex items-center gap-2">
                <Plus size={20} /> Nueva Campaña
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <p className="text-slate-400 mb-1">Presupuesto Total</p>
                <p className="text-2xl font-bold">${totalBudget.toLocaleString()}</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <p className="text-slate-400 mb-1">Gastado</p>
                <p className="text-2xl font-bold text-orange-500">${totalSpent.toLocaleString()}</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <p className="text-slate-400 mb-1">CPL Promedio</p>
                <p className="text-2xl font-bold">${avgCPL.toFixed(0)}</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <p className="text-slate-400 mb-1">ROI</p>
                <p className={`text-2xl font-bold ${roi >= 0 ? 'text-green-400 bg-green-500/20 p-2 rounded-xl' : 'text-red-400 bg-red-500/20 p-2 rounded-xl'}`}>{roi.toFixed(0)}%</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <h3 className="text-xl font-semibold mb-4">Inversión vs Leads por Canal</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={roiByChannel}>
                    <XAxis dataKey="channel" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="spent" fill="#f97316" name="Invertido" />
                    <Bar dataKey="leads" fill="#3b82f6" name="Leads" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
                <h3 className="text-xl font-semibold mb-4">Revenue vs Inversión</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={roiByChannel}>
                    <XAxis dataKey="channel" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="spent" fill="#ef4444" name="Invertido" />
                    <Bar dataKey="revenue" fill="#22c55e" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="text-left p-4">Campaña</th>
                    <th className="text-left p-4">Canal</th>
                    <th className="text-left p-4">Gastado</th>
                    <th className="text-left p-4">Leads</th>
                    <th className="text-left p-4">CPL</th>
                    <th className="text-left p-4">Ventas</th>
                    <th className="text-left p-4">ROI</th>
                    <th className="text-left p-4">Estado</th>
                    <th className="text-left p-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(campaign => {
                    const cpl = campaign.leads_generated > 0 ? campaign.spent / campaign.leads_generated : 0
                    const campaignROI = campaign.spent > 0 ? ((campaign.revenue_generated - campaign.spent) / campaign.spent * 100) : 0
                    return (
                      <tr key={campaign.id} className="border-t border-slate-700 hover:bg-slate-700">
                        <td className="p-4 font-semibold">{campaign.name}</td>
                        <td className="p-4">
                          <span className={`${channelColors[campaign.channel]} px-2 py-1 rounded text-sm`}>
                            {campaign.channel}
                          </span>
                        </td>
                        <td className="p-4">${campaign.spent.toLocaleString()}</td>
                        <td className="p-4">{campaign.leads_generated}</td>
                        <td className="p-4">${cpl.toFixed(0)}</td>
                        <td className="p-4">{campaign.sales_closed}</td>
                        <td className="p-4">
                          <span className={campaignROI >= 0 ? 'text-green-400 bg-green-500/20 p-2 rounded-xl' : 'text-red-400 bg-red-500/20 p-2 rounded-xl'}>
                            {campaignROI.toFixed(0)}%
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-sm ${
                            campaign.status === 'active' ? 'bg-green-600' : 
                            campaign.status === 'paused' ? 'bg-yellow-600' : 
                            'bg-gray-600'
                          }`}>
                            {campaign.status}
                          </span>
                        </td>
                        <td className="p-4 flex gap-2">
                          <button onClick={() => setEditingCampaign(campaign)} className="bg-blue-600 p-2 rounded hover:bg-blue-700">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => deleteCampaign(campaign.id)} className="bg-red-600 p-2 rounded hover:bg-red-700">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'calendar' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold">Calendario de Citas</h2>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-green-600 rounded-xl text-sm">Programadas: {appointments.filter(a => a.status === 'scheduled').length}</span>
                <span className="px-3 py-1 bg-red-600 rounded-xl text-sm">Canceladas: {appointments.filter(a => a.status === 'cancelled').length}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {appointments.filter(a => a.status === 'scheduled').map((appt) => {
                const fecha = new Date(appt.scheduled_date + 'T' + appt.scheduled_time)
                return (
                  <div key={appt.id} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all hover:bg-slate-700">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <CalendarIcon className="text-blue-400 bg-blue-500/20 p-2 rounded-xl mt-1" size={32} />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="font-bold text-lg">{appt.property_name}</p>
                            <span className="px-2 py-1 bg-blue-600 rounded text-xs">{appt.appointment_type}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-slate-400">👤 Cliente</p>
                              <p className="font-semibold">{appt.lead_name || appt.lead_phone}</p>
                              {appt.lead_name && <p className="text-xs text-slate-400">{appt.lead_phone}</p>}
                            </div>
                            <div>
                              <p className="text-slate-400">📅 Fecha y Hora</p>
                              <p className="font-semibold text-blue-400">
                                {fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} - {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            {appt.vendedor_name && (
                              <div>
                                <p className="text-slate-400">🏢 Vendedor</p>
                                <p className="font-semibold">{appt.vendedor_name}</p>
                              </div>
                            )}
                            {appt.asesor_name && (
                              <div>
                                <p className="text-slate-400">💼 Asesor</p>
                                <p className="font-semibold">{appt.asesor_name}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={async () => {
                          if (confirm('¿Cancelar esta cita?')) {
                            await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id)
                            if (appt.google_event_vendedor_id || appt.google_event_asesor_id) {
                              // Llamar al backend para cancelar en Calendar
                              await fetch('https://sara-backend.edson-633.workers.dev/api/cancel-appointment', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                  appointmentId: appt.id,
                                  vendedorEventId: appt.google_event_vendedor_id,
                                  asesorEventId: appt.google_event_asesor_id
                                })
                              })
                            }
                            loadData()
                          }
                        }}
                        className="text-red-400 hover:text-red-300 p-2 hover:bg-red-900/20 rounded-xl"
                      >
                        <XCircle size={24} />
                      </button>
                    </div>
                  </div>
                )
              })}
              
              {appointments.filter(a => a.status === 'scheduled').length === 0 && (
                <div className="text-center py-12">
                  <CalendarIcon size={64} className="mx-auto text-gray-600 mb-4" />
                  <p className="text-slate-400 text-lg">Sin citas programadas</p>
                </div>
              )}
            </div>

            {/* Citas Canceladas */}
            {appointments.filter(a => a.status === 'cancelled').length > 0 && (
              <div className="mt-8">
                <h3 className="text-xl font-bold mb-4 text-slate-400">Citas Canceladas</h3>
                <div className="space-y-2">
                  {appointments.filter(a => a.status === 'cancelled').map((appt) => {
                    const fecha = new Date(appt.scheduled_date + 'T' + appt.scheduled_time)
                    return (
                      <div key={appt.id} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-4 rounded-xl opacity-60">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <XCircle className="text-red-400 bg-red-500/20 p-2 rounded-xl" size={20} />
                            <div>
                              <p className="font-semibold">{appt.property_name} - {appt.lead_name || appt.lead_phone}</p>
                              <p className="text-sm text-slate-400">
                                {fecha.toLocaleDateString('es-MX')} {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          {appt.cancelled_by && (
                            <p className="text-xs text-slate-500">Cancelada por: {appt.cancelled_by}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ METAS ============ */}
        {view === 'goals' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Metas Mensuales</h2>
              <input 
                type="month" 
                value={selectedGoalMonth}
                onChange={(e) => setSelectedGoalMonth(e.target.value)}
                className="bg-slate-700 px-4 py-2 rounded-lg"
              />
            </div>
            
            <div className="bg-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4">Meta del Mes - Empresa</h3>
              <div className="flex items-center gap-4">
                <input 
                  type="number"
                  value={monthlyGoals.company_goal}
                  onChange={(e) => setMonthlyGoals({...monthlyGoals, company_goal: parseInt(e.target.value) || 0})}
                  className="bg-slate-700 px-4 py-3 rounded-lg w-32 text-2xl font-bold text-center"
                />
                <span className="text-xl">casas</span>
                <button 
                  onClick={() => saveCompanyGoal(monthlyGoals.company_goal)}
                  className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-medium"
                >
                  Guardar
                </button>
              </div>
              <div className="mt-6">
                <div className="flex justify-between text-sm mb-2">
                  <span>Avance del equipo</span>
                  <span>{leads.filter(l => l.status === 'closed' || l.status === 'Cerrado').length} / {monthlyGoals.company_goal || 0}</span>
                </div>
                <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                    style={{ width: `${Math.min(100, (leads.filter(l => l.status === 'closed' || l.status === 'Cerrado').length / (monthlyGoals.company_goal || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4">Metas por Vendedor</h3>
              <div className="space-y-4">
                {vendorGoals.map(vg => {
                  const closed = getClosedByVendor(vg.vendor_id)
                  const reserved = getReservedByVendor(vg.vendor_id)
                  const negotiation = getNegotiationByVendor(vg.vendor_id)
                  const percentage = vg.goal > 0 ? Math.round((closed / vg.goal) * 100) : 0
                  
                  return (
                    <div key={vg.vendor_id} className="bg-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center font-bold">
                            {vg.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium">{vg.name}</p>
                            <p className="text-sm text-slate-400">
                              {closed} cerrados | {reserved} reservados | {negotiation} negociando
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number"
                            value={vg.goal}
                            onChange={(e) => {
                              const newGoals = vendorGoals.map(g => 
                                g.vendor_id === vg.vendor_id ? {...g, goal: parseInt(e.target.value) || 0} : g
                              )
                              setVendorGoals(newGoals)
                            }}
                            onBlur={() => saveVendorGoal(vg.vendor_id, vg.goal)}
                            className="bg-slate-600 px-3 py-2 rounded-lg w-20 text-center font-bold"
                          />
                          <span className="text-slate-400">meta</span>
                        </div>
                      </div>
                      <div className="relative pt-4">
                        <div className="h-3 bg-slate-600 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${percentage >= 100 ? 'bg-green-500' : percentage >= 70 ? 'bg-blue-500' : percentage >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, percentage)}%` }}
                          />
                        </div>
                        <span className={`absolute right-0 top-0 text-sm font-bold ${percentage >= 100 ? 'text-green-400' : percentage >= 70 ? 'text-blue-400' : percentage >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {percentage}%
                        </span>
                      </div>
                      {reserved > 0 && (
                        <p className="text-xs text-cyan-400 mt-2">
                          Si cierras los {reserved} reservados llegas a {Math.round(((closed + reserved) / (vg.goal || 1)) * 100)}%
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-600 flex justify-between items-center">
                <span className="text-slate-400">Total asignado:</span>
                <span className="text-xl font-bold">{vendorGoals.reduce((sum, vg) => sum + vg.goal, 0)} casas</span>
              </div>
              {vendorGoals.reduce((sum, vg) => sum + vg.goal, 0) !== monthlyGoals.company_goal && monthlyGoals.company_goal > 0 && (
                <p className="text-yellow-400 text-sm mt-2">
                  La suma de metas ({vendorGoals.reduce((sum, vg) => sum + vg.goal, 0)}) no coincide con meta empresa ({monthlyGoals.company_goal})
                </p>
              )}
            </div>
          </div>
        )}

        {view === 'followups' && (
          <FollowupsView supabase={supabase} />
        )}

        {view === 'config' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">Configuración</h2>
            
            <div className="bg-slate-800/50 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">⏰ Alertas de Estancamiento - Leads</h3>
              <p className="text-slate-400 text-sm mb-4">Días máximos antes de alertar al vendedor</p>
              <div className="grid grid-cols-3 gap-4">
                {alertSettings.filter(s => s.category === 'leads').map(setting => (
                  <div key={setting.id} className="bg-slate-700 p-4 rounded-xl">
                    <label className="block text-sm text-slate-400 mb-2 capitalize">{setting.stage.replace('_', ' ')}</label>
                    <input 
                      type="number" 
                      value={setting.max_days}
                      onChange={async (e) => {
                        const newDays = parseInt(e.target.value) || 1
                        await supabase.from('alert_settings').update({ max_days: newDays }).eq('id', setting.id)
                        setAlertSettings(alertSettings.map(s => s.id === setting.id ? {...s, max_days: newDays} : s))
                      }}
                      className="w-full p-2 bg-slate-600 rounded-lg text-center text-xl font-bold text-white"
                      min="1"
                    />
                    <p className="text-xs text-slate-500 mt-1 text-center">días</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">👔 Seguimiento a Asesores Hipotecarios</h3>
              <p className="text-slate-400 text-sm mb-4">SARA contacta al asesor y escala al vendedor si no responde</p>
              <div className="grid grid-cols-2 gap-4">
                {alertSettings.filter(s => s.category === 'asesor').map(setting => (
                  <div key={setting.id} className="bg-slate-700 p-4 rounded-xl">
                    <label className="block text-sm text-slate-400 mb-2">
                      {setting.stage === 'recordatorio' ? '📱 Recordatorio al Asesor' : '🚨 Escalar al Vendedor'}
                    </label>
                    <input 
                      type="number" 
                      value={setting.max_days}
                      onChange={async (e) => {
                        const newDays = parseInt(e.target.value) || 1
                        await supabase.from('alert_settings').update({ max_days: newDays }).eq('id', setting.id)
                        setAlertSettings(alertSettings.map(s => s.id === setting.id ? {...s, max_days: newDays} : s))
                      }}
                      className="w-full p-2 bg-slate-600 rounded-lg text-center text-xl font-bold text-white"
                      min="1"
                    />
                    <p className="text-xs text-slate-500 mt-1 text-center">días sin actualizar</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">El asesor puede responder: "Aprobado Juan", "Rechazado Juan", "Documentos Juan"</p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all">
              <h3 className="text-xl font-semibold mb-4">Notificaciones por WhatsApp</h3>
              <p className="text-slate-400 mb-4">Todos los miembros activos recibirán notificaciones según su rol.</p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Vendedores (reciben: nuevos leads, leads olvidados)</h4>
                  <div className="space-y-2">
                    {team.filter(t => t.role === 'vendedor').map(v => (
                      <div key={v.id} className="flex items-center justify-between bg-slate-700 p-3 rounded-xl">
                        <span>{v.name} - {v.phone}</span>
                        <span className={`px-2 py-1 rounded text-sm ${v.active ? 'bg-green-600' : 'bg-gray-600'}`}>
                          {v.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Asesores (reciben: solicitudes hipotecarias, solicitudes estancadas)</h4>
                  <div className="space-y-2">
                    {team.filter(t => t.role === 'asesor').map(a => (
                      <div key={a.id} className="flex items-center justify-between bg-slate-700 p-3 rounded-xl">
                        <span>{a.name} - {a.phone}</span>
                        <span className={`px-2 py-1 rounded text-sm ${a.active ? 'bg-green-600' : 'bg-gray-600'}`}>
                          {a.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Marketing (pueden reportar métricas, reciben: alertas ROI, CPL alto)</h4>
                  <div className="space-y-2">
                    {team.filter(t => t.role === 'agencia').map(m => (
                      <div key={m.id} className="flex items-center justify-between bg-slate-700 p-3 rounded-xl">
                        <span>{m.name} - {m.phone}</span>
                        <span className={`px-2 py-1 rounded text-sm ${m.active ? 'bg-green-600' : 'bg-gray-600'}`}>
                          {m.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Configuración de Recordatorios */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all mt-6">
              <h3 className="text-xl font-semibold mb-4">⏰ Recordatorios Automáticos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {reminderConfigs.map(config => (
                  <div key={config.id} className="bg-slate-700 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-bold ${
                        config.lead_category === 'HOT' ? 'text-red-400 bg-red-500/20 p-2 rounded-xl' :
                        config.lead_category === 'WARM' ? 'text-yellow-500' : 'text-blue-400 bg-blue-500/20 p-2 rounded-xl'
                      }`}>{config.lead_category}</span>
                      <button onClick={() => setEditingReminder(config)} className="text-blue-400 hover:text-blue-300">
                        Editar
                      </button>
                    </div>
                    <p className="text-2xl font-bold">Cada {config.reminder_hours}h</p>
                    <p className="text-sm text-slate-400 mt-2">
                      {config.send_start_hour}:00 - {config.send_end_hour}:00
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>


      {editingReminder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingReminder(null)}>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Editar {editingReminder.lead_category}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Frecuencia (horas)</label>
                <input type="number" defaultValue={editingReminder.reminder_hours} id="hrs" className="w-full bg-slate-700 rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2">Inicio</label>
                  <input type="number" defaultValue={editingReminder.send_start_hour} id="start" className="w-full bg-slate-700 rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm mb-2">Fin</label>
                  <input type="number" defaultValue={editingReminder.send_end_hour} id="end" className="w-full bg-slate-700 rounded px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-2">Mensaje</label>
                <textarea defaultValue={editingReminder.message_template} id="msg" rows={4} className="w-full bg-slate-700 rounded px-3 py-2" />
              </div>
              <div className="flex gap-3">
                                            <button onClick={() => setEditingReminder(null)} className="flex-1 bg-gray-600 hover:bg-slate-700 py-2 rounded">
                                              Cancelar
                                            </button>
                                            <button onClick={() => saveReminderConfig({...editingReminder, reminder_hours: parseInt((document.getElementById('hrs') as HTMLInputElement).value), send_start_hour: parseInt((document.getElementById('start') as HTMLInputElement).value), send_end_hour: parseInt((document.getElementById('end') as HTMLInputElement).value), message_template: (document.getElementById('msg') as HTMLTextAreaElement).value})} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded">Guardar</button>
                                          </div>
            </div>
          </div>
        </div>
      )}

      {(editingProperty || showNewProperty) && (
        <PropertyModal
          property={editingProperty}
          onSave={saveProperty}
          onClose={() => { setEditingProperty(null); setShowNewProperty(false); }}
        />
      )}

      {(editingMember || showNewMember) && (
        <MemberModal
          member={editingMember}
          onSave={saveMember}
          onClose={() => { setEditingMember(null); setShowNewMember(false); }}
        />
      )}

      {(editingMortgage || showNewMortgage) && (
        <MortgageModal
          mortgage={editingMortgage}
          leads={leads}
          properties={properties}
          asesores={asesores}
          onSave={saveMortgage}
          onClose={() => { setEditingMortgage(null); setShowNewMortgage(false); }}
        />
      )}

      {(editingCampaign || showNewCampaign) && (
        <CampaignModal
          campaign={editingCampaign}
          onSave={saveCampaign}
          onClose={() => { setEditingCampaign(null); setShowNewCampaign(false); }}
        />
      )}

      {showNewEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewEvent(false)}>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Agendar Cita</h3>
              <button onClick={() => setShowNewEvent(false)} className="text-slate-400 hover:text-white"><X /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Cliente</label>
                <select id="evt-cliente" className="w-full bg-slate-700 rounded-xl p-3">
                  <option value="">Seleccionar</option>
                  {leads.map(l => <option key={l.id} value={(l.name||"")+ "|" + (l.phone||"")}>{l.name || l.phone}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Propiedad</label>
                <select id="evt-prop" className="w-full bg-slate-700 rounded-xl p-3">
                  <option value="">Seleccionar</option>
                  {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Fecha</label>
                <input type="date" id="evt-date" className="w-full bg-slate-700 rounded-xl p-3" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Hora</label>
                <select id="evt-time" className="w-full bg-slate-700 rounded-xl p-3">
                  <option value="09:00">9:00 AM</option>
                  <option value="10:00">10:00 AM</option>
                  <option value="11:00">11:00 AM</option>
                  <option value="12:00">12:00 PM</option>
                  <option value="13:00">1:00 PM</option>
                  <option value="14:00">2:00 PM</option>
                  <option value="15:00">3:00 PM</option>
                  <option value="16:00">4:00 PM</option>
                  <option value="17:00">5:00 PM</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowNewEvent(false)} className="px-4 py-2 rounded-xl bg-slate-700">Cancelar</button>
              <button onClick={() => {
                const cv = (document.getElementById("evt-cliente") as HTMLSelectElement).value.split("|");
                const cn = cv[0];
                const cp = cv[1] || "";
                const pr = (document.getElementById("evt-prop") as HTMLSelectElement).value;
                const dt = (document.getElementById("evt-date") as HTMLInputElement).value;
                const tm = (document.getElementById("evt-time") as HTMLSelectElement).value;
                if(cn && dt){
                  createCalendarEvent({
                    summary: "Cita: " + cn + " - " + pr,
                    description: "Cliente: " + cn + "\nTelefono: " + cp + "\nPropiedad: " + pr,
                    startTime: dt + "T" + tm + ":00-06:00",
                    endTime: dt + "T" + String(parseInt(tm.split(":")[0])+1).padStart(2,"0") + ":00:00-06:00"
                  });
                }
              }} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center gap-2"><Save size={20} /> Agendar</button>
            </div>
          </div>
        </div>
      )}

      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedLead(null)}>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Conversación con {selectedLead.name || 'Lead'}</h3>
              <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-white"><X /></button>
            </div>
            <div className="space-y-3">
              <p><span className="font-semibold">Teléfono:</span> {selectedLead.phone}</p>
              <p><span className="font-semibold">Score:</span> <span className={`${getScoreColor(selectedLead.score)} px-2 py-1 rounded`}>{selectedLead.score}</span></p>
              <p><span className="font-semibold">Estado:</span> {selectedLead.status}</p>
              {selectedLead.status === 'fallen' && selectedLead.fallen_reason && (
                <p><span className="font-semibold">Motivo:</span> <span className="text-red-400">{selectedLead.fallen_reason}</span></p>
              )}
              {selectedLead.credit_status && (
                <p><span className="font-semibold">Crédito:</span> <span className={selectedLead.credit_status === 'approved' ? 'text-green-400' : selectedLead.credit_status === 'active' ? 'text-yellow-400' : 'text-red-400'}>{selectedLead.credit_status}</span></p>
              )}
              <p><span className="font-semibold">Interés:</span> {selectedLead.property_interest || 'No definido'}</p>
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Historial de conversación:</h4>
                <div className="bg-slate-700 p-4 rounded-xl max-h-96 overflow-y-auto">
                  {selectedLead.conversation_history && selectedLead.conversation_history.length > 0 ? (
                    selectedLead.conversation_history.map((msg: any, i: number) => (
                      <div key={i} className={`mb-3 ${msg.role === 'user' ? 'text-blue-400' : 'text-green-400'}`}>
                        <span className="font-semibold">{msg.role === 'user' ? 'Cliente' : 'SARA'}:</span> {msg.content}
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500">Sin historial de conversación</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PropertyModal({ property, onSave, onClose }: { property: Property | null, onSave: (p: Partial<Property>) => void, onClose: () => void }) {
  const [form, setForm] = useState<Partial<Property>>(property || {
    name: '', category: '', price: 0, bedrooms: 0, bathrooms: 0, area_m2: 0, 
    total_units: 0, sold_units: 0, photo_url: '', description: '', 
    neighborhood: '', city: '', youtube_link: ''
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{property ? 'Editar Propiedad' : 'Nueva Propiedad'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre</label>
            <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Categoría</label>
            <input value={form.category || ''} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Precio Base</label>
            <input type="number" value={form.price || ''} onChange={e => setForm({...form, price: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Recámaras</label>
            <input type="number" value={form.bedrooms || ''} onChange={e => setForm({...form, bedrooms: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Baños</label>
            <input type="number" value={form.bathrooms || ''} onChange={e => setForm({...form, bathrooms: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">m²</label>
            <input type="number" value={form.area_m2 || ''} onChange={e => setForm({...form, area_m2: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Total Unidades</label>
            <input type="number" value={form.total_units || ''} onChange={e => setForm({...form, total_units: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Vendidas</label>
            <input type="number" value={form.sold_units || ''} onChange={e => setForm({...form, sold_units: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">Descripción</label>
            <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" rows={3} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">URL Imagen</label>
            <input value={form.photo_url || ''} onChange={e => setForm({...form, photo_url: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">YouTube Link</label>
            <input value={form.youtube_link || ''} onChange={e => setForm({...form, youtube_link: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="https://youtu.be/..." />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">Matterport 3D</label>
            <input value={form.matterport_link || ''} onChange={e => setForm({...form, matterport_link: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="https://my.matterport.com/..." />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">GPS / Ubicación</label>
            <input value={form.gps_link || ''} onChange={e => setForm({...form, gps_link: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="https://maps.google.com/..." />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">Brochure PDF</label>
            <input value={form.brochure_urls || ''} onChange={e => setForm({...form, brochure_urls: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="URL del PDF..." />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">Galería (URLs separadas por coma)</label>
            <input value={form.gallery_urls || ''} onChange={e => setForm({...form, gallery_urls: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="url1, url2, url3..." />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">Frase de Venta</label>
            <input value={form.sales_phrase || ''} onChange={e => setForm({...form, sales_phrase: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="El pitch de venta..." />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">Cliente Ideal</label>
            <input value={form.ideal_client || ''} onChange={e => setForm({...form, ideal_client: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="Para quién es esta propiedad..." />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Desarrollo</label>
            <input value={form.development || ''} onChange={e => setForm({...form, development: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Ciudad</label>
            <input value={form.city || ''} onChange={e => setForm({...form, city: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-gray-600">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
            <Save size={20} /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function MemberModal({ member, onSave, onClose }: { member: TeamMember | null, onSave: (m: Partial<TeamMember>) => void, onClose: () => void }) {
  const [form, setForm] = useState<Partial<TeamMember>>(member || {
    name: '', phone: '', role: 'vendedor', sales_count: 0, commission: 0, active: true, photo_url: '', email: ''
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{member ? 'Editar Miembro' : 'Nuevo Miembro'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre</label>
            <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="nombre@gruposantarita.com" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">WhatsApp</label>
            <input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" placeholder="+5215512345678" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Rol</label>
            <select value={form.role || ''} onChange={e => setForm({...form, role: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3">
              <option value="vendedor">Vendedor</option>
              <option value="asesor">Asesor Hipotecario</option>
              <option value="agencia">Marketing / Agencia</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} className="w-5 h-5" />
            <label>Activo (recibe notificaciones)</label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-gray-600">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
            <Save size={20} /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function MortgageModal({ mortgage, leads, properties, asesores, onSave, onClose }: { 
  mortgage: MortgageApplication | null, 
  leads: Lead[], 
  properties: Property[],
  asesores: TeamMember[],
  onSave: (m: Partial<MortgageApplication>) => void, 
  onClose: () => void 
}) {
  const [form, setForm] = useState<Partial<MortgageApplication>>(mortgage || {
    lead_id: '', lead_name: '', lead_phone: '', property_id: '', property_name: '',
    monthly_income: 0, additional_income: 0, current_debt: 0, down_payment: 0,
    requested_amount: 0, credit_term_years: 20, assigned_advisor_id: '', 
    assigned_advisor_name: '', bank: '', status: 'pending', status_notes: ''
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{mortgage ? 'Editar Solicitud' : 'Nueva Solicitud'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Lead</label>
            <select value={form.lead_id || ''} onChange={e => {
              const lead = leads.find(l => l.id === e.target.value)
              setForm({...form, lead_id: e.target.value, lead_name: lead?.name || '', lead_phone: lead?.phone || ''})
            }} className="w-full bg-slate-700 rounded-xl p-3">
              <option value="">Seleccionar lead</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name || l.phone}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Propiedad</label>
            <select value={form.property_id || ''} onChange={e => {
              const prop = properties.find(p => p.id === e.target.value)
              setForm({...form, property_id: e.target.value, property_name: prop?.name || '', requested_amount: prop?.price || 0})
            }} className="w-full bg-slate-700 rounded-xl p-3">
              <option value="">Seleccionar propiedad</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Ingreso Mensual</label>
            <input type="number" value={form.monthly_income || ''} onChange={e => setForm({...form, monthly_income: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Deuda Actual</label>
            <input type="number" value={form.current_debt || ''} onChange={e => setForm({...form, current_debt: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Enganche</label>
            <input type="number" value={form.down_payment || ''} onChange={e => setForm({...form, down_payment: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Asesor</label>
            <select value={form.assigned_advisor_id || ''} onChange={e => {
              const asesor = asesores.find(a => a.id === e.target.value)
              setForm({...form, assigned_advisor_id: e.target.value, assigned_advisor_name: asesor?.name || ''})
            }} className="w-full bg-slate-700 rounded-xl p-3">
              <option value="">Seleccionar asesor</option>
              {asesores.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Estado</label>
            <select value={form.status || ''} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3">
              <option value="pending">Pendiente</option>
              <option value="in_review">En Revisión</option>
              <option value="sent_to_bank">Enviado a Banco</option>
              <option value="approved">Aprobado</option>
              <option value="rejected">Rechazado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Banco</label>
            <input value={form.bank || ''} onChange={e => setForm({...form, bank: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-gray-600">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
            <Save size={20} /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function CampaignModal({ campaign, onSave, onClose }: { campaign: Campaign | null, onSave: (c: Partial<Campaign>) => void, onClose: () => void }) {
  const [form, setForm] = useState<Partial<Campaign>>(campaign || {
    name: '', channel: 'Facebook', status: 'active', budget: 0, spent: 0,
    impressions: 0, clicks: 0, leads_generated: 0, sales_closed: 0, revenue_generated: 0,
    start_date: '', end_date: '', notes: '', target_audience: '', creative_url: ''
  })

  const ctr = form.impressions && form.impressions > 0 ? ((form.clicks || 0) / form.impressions * 100) : 0
  const cpl = form.leads_generated && form.leads_generated > 0 ? ((form.spent || 0) / form.leads_generated) : 0
  const roi = form.spent && form.spent > 0 ? (((form.revenue_generated || 0) - form.spent) / form.spent * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-6 rounded-2xl hover:border-slate-600/50 transition-all w-full max-w-3xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{campaign ? 'Editar Campaña' : 'Nueva Campaña'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-slate-400 mb-1">Nombre de Campaña</label>
            <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Estado</label>
            <select value={form.status || ''} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3">
              <option value="active">Activa</option>
              <option value="paused">Pausada</option>
              <option value="completed">Completada</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Canal</label>
            <select value={form.channel || ''} onChange={e => setForm({...form, channel: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3">
              <option value="Facebook">Facebook</option>
              <option value="Google Ads">Google Ads</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="TV">TV</option>
              <option value="Radio">Radio</option>
              <option value="Espectaculares">Espectaculares</option>
              <option value="Referidos">Referidos</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Presupuesto</label>
            <input type="number" value={form.budget || ''} onChange={e => setForm({...form, budget: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Gastado</label>
            <input type="number" value={form.spent || ''} onChange={e => setForm({...form, spent: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Impresiones</label>
            <input type="number" value={form.impressions || ''} onChange={e => setForm({...form, impressions: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Clicks</label>
            <input type="number" value={form.clicks || ''} onChange={e => setForm({...form, clicks: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Leads Generados</label>
            <input type="number" value={form.leads_generated || ''} onChange={e => setForm({...form, leads_generated: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Ventas Cerradas</label>
            <input type="number" value={form.sales_closed || ''} onChange={e => setForm({...form, sales_closed: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Revenue Generado</label>
            <input type="number" value={form.revenue_generated || ''} onChange={e => setForm({...form, revenue_generated: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Fecha Inicio</label>
            <input type="date" value={form.start_date || ''} onChange={e => setForm({...form, start_date: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Fecha Fin</label>
            <input type="date" value={form.end_date || ''} onChange={e => setForm({...form, end_date: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div className="col-span-3">
            <label className="block text-sm text-slate-400 mb-1">Audiencia Target</label>
            <input value={form.target_audience || ''} onChange={e => setForm({...form, target_audience: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" />
          </div>
          <div className="col-span-3">
            <label className="block text-sm text-slate-400 mb-1">Notas</label>
            <textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="w-full bg-slate-700 rounded-xl p-3" rows={2} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6 p-4 bg-slate-700 rounded-xl">
          <div>
            <p className="text-slate-400 text-sm">CTR</p>
            <p className="text-xl font-bold">{ctr.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">CPL</p>
            <p className="text-xl font-bold">${cpl.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">ROI</p>
            <p className={`text-xl font-bold ${roi >= 0 ? 'text-green-400 bg-green-500/20 p-2 rounded-xl' : 'text-red-400 bg-red-500/20 p-2 rounded-xl'}`}>{roi.toFixed(0)}%</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-gray-600">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
            <Save size={20} /> Guardar
          </button>
        </div>
      </div>
    </div>


  )
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE FOLLOWUPS VIEW - Sistema de seguimiento 90 días
// ═══════════════════════════════════════════════════════════

interface FollowupRule {
  id: string
  name: string
  funnel: 'ventas' | 'hipoteca'
  trigger_event: string
  trigger_status: string | null
  requires_no_response: boolean
  delay_hours: number
  message_template: string
  is_active: boolean
  sequence_order: number
  sequence_group: string
}

interface ScheduledFollowup {
  id: string
  lead_id: string
  rule_id: string
  lead_phone: string
  lead_name: string
  desarrollo: string
  message: string
  scheduled_at: string
  sent: boolean
  sent_at: string | null
  cancelled: boolean
  cancel_reason: string | null
  created_at: string
}

function FollowupsView({ supabase }: { supabase: any }) {
  const [rules, setRules] = useState<FollowupRule[]>([])
  const [scheduled, setScheduled] = useState<ScheduledFollowup[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'rules' | 'scheduled' | 'history'>('rules')
  const [stats, setStats] = useState({ pendientes: 0, enviadosHoy: 0, canceladosHoy: 0 })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    
    const { data: rulesData } = await supabase
      .from('followup_rules')
      .select('*')
      .order('funnel')
      .order('sequence_order')
    
    const { data: scheduledData } = await supabase
      .from('scheduled_followups')
      .select('*')
      .order('scheduled_at', { ascending: true })
      .limit(100)
    
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    
    const { count: pendientes } = await supabase
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('sent', false)
      .eq('cancelled', false)
    
    const { count: enviadosHoy } = await supabase
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('sent', true)
      .gte('sent_at', hoy.toISOString())
    
    const { count: canceladosHoy } = await supabase
      .from('scheduled_followups')
      .select('*', { count: 'exact', head: true })
      .eq('cancelled', true)
      .gte('created_at', hoy.toISOString())

    setRules(rulesData || [])
    setScheduled(scheduledData || [])
    setStats({
      pendientes: pendientes || 0,
      enviadosHoy: enviadosHoy || 0,
      canceladosHoy: canceladosHoy || 0
    })
    setLoading(false)
  }

  async function toggleRuleActive(rule: FollowupRule) {
    await supabase
      .from('followup_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id)
    setRules(rules.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
  }

  async function updateRuleDelay(rule: FollowupRule, newDelay: number) {
    await supabase
      .from('followup_rules')
      .update({ delay_hours: newDelay })
      .eq('id', rule.id)
    setRules(rules.map(r => r.id === rule.id ? { ...r, delay_hours: newDelay } : r))
  }

  async function cancelFollowup(followup: ScheduledFollowup) {
    if (!confirm(`¿Cancelar follow-up para ${followup.lead_name}?`)) return
    await supabase
      .from('scheduled_followups')
      .update({ cancelled: true, cancel_reason: 'manual_cancel' })
      .eq('id', followup.id)
    loadData()
  }

  function formatDelay(hours: number): string {
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    if (remainingHours === 0) return `${days}d`
    return `${days}d ${remainingHours}h`
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  }

  const ventasRules = rules.filter(r => r.funnel === 'ventas')
  const hipotecaRules = rules.filter(r => r.funnel === 'hipoteca')
  const pendingFollowups = scheduled.filter(s => !s.sent && !s.cancelled)
  const sentFollowups = scheduled.filter(s => s.sent)
  const cancelledFollowups = scheduled.filter(s => s.cancelled)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">📬 Follow-ups Automáticos</h2>
        <button onClick={loadData} className="px-4 py-2 bg-slate-700 rounded-xl hover:bg-slate-600 flex items-center gap-2">
          🔄 Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl">
          <p className="text-blue-200 text-sm">Pendientes</p>
          <p className="text-4xl font-bold">{stats.pendientes}</p>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-green-800 p-6 rounded-2xl">
          <p className="text-green-200 text-sm">Enviados Hoy</p>
          <p className="text-4xl font-bold">{stats.enviadosHoy}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-600 to-orange-800 p-6 rounded-2xl">
          <p className="text-orange-200 text-sm">Cancelados Hoy</p>
          <p className="text-4xl font-bold">{stats.canceladosHoy}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button onClick={() => setActiveTab('rules')} className={`px-4 py-2 rounded-t-xl ${activeTab === 'rules' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
          ⚙️ Reglas ({rules.length})
        </button>
        <button onClick={() => setActiveTab('scheduled')} className={`px-4 py-2 rounded-t-xl ${activeTab === 'scheduled' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
          📅 Programados ({pendingFollowups.length})
        </button>
        <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-t-xl ${activeTab === 'history' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
          📜 Historial
        </button>
      </div>

      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              🏠 Funnel Ventas
              <span className="text-sm font-normal text-slate-400">({ventasRules.length} reglas)</span>
            </h3>
            <div className="space-y-3">
              {ventasRules.map(rule => (
                <div key={rule.id} className={`flex items-center justify-between p-4 rounded-xl ${rule.is_active ? 'bg-slate-700' : 'bg-slate-800 opacity-50'}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${rule.is_active ? 'bg-green-400' : 'bg-gray-500'}`}></span>
                      <span className="font-semibold">{rule.name}</span>
                      {rule.requires_no_response && (
                        <span className="text-xs bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded">Solo sin respuesta</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{rule.trigger_event} → {rule.trigger_status || 'cualquier'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">Delay:</span>
                      <input type="number" value={rule.delay_hours} onChange={(e) => updateRuleDelay(rule, parseInt(e.target.value) || 1)} className="w-20 bg-slate-600 rounded-lg p-2 text-center font-bold" min="1" />
                      <span className="text-slate-400 text-sm">hrs</span>
                      <span className="text-slate-500 text-xs">({formatDelay(rule.delay_hours)})</span>
                    </div>
                    <button onClick={() => toggleRuleActive(rule)} className={`px-3 py-2 rounded-lg ${rule.is_active ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-500'}`}>
                      {rule.is_active ? '✓ Activa' : 'Inactiva'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              💳 Funnel Hipoteca
              <span className="text-sm font-normal text-slate-400">({hipotecaRules.length} reglas)</span>
            </h3>
            <div className="space-y-3">
              {hipotecaRules.map(rule => (
                <div key={rule.id} className={`flex items-center justify-between p-4 rounded-xl ${rule.is_active ? 'bg-slate-700' : 'bg-slate-800 opacity-50'}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${rule.is_active ? 'bg-green-400' : 'bg-gray-500'}`}></span>
                      <span className="font-semibold">{rule.name}</span>
                      {rule.requires_no_response && (
                        <span className="text-xs bg-yellow-600/30 text-yellow-400 px-2 py-1 rounded">Solo sin respuesta</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{rule.trigger_event} → {rule.trigger_status || 'cualquier'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">Delay:</span>
                      <input type="number" value={rule.delay_hours} onChange={(e) => updateRuleDelay(rule, parseInt(e.target.value) || 1)} className="w-20 bg-slate-600 rounded-lg p-2 text-center font-bold" min="1" />
                      <span className="text-slate-400 text-sm">hrs</span>
                      <span className="text-slate-500 text-xs">({formatDelay(rule.delay_hours)})</span>
                    </div>
                    <button onClick={() => toggleRuleActive(rule)} className={`px-3 py-2 rounded-lg ${rule.is_active ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-500'}`}>
                      {rule.is_active ? '✓ Activa' : 'Inactiva'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4">
            <p className="text-blue-300 text-sm">
              💡 <strong>Tip:</strong> Modifica el delay (horas) para ajustar cuándo se envía cada follow-up. 
              Los cambios aplican a futuros follow-ups, no a los ya programados.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'scheduled' && (
        <div className="bg-slate-800/50 rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">📅 Follow-ups Programados</h3>
          {pendingFollowups.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-2">📭</p>
              <p>No hay follow-ups pendientes</p>
              <p className="text-sm mt-2">Se programarán automáticamente cuando los leads agenden citas o cambien de status</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingFollowups.map(followup => (
                <div key={followup.id} className="flex items-center justify-between p-4 bg-slate-700 rounded-xl">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{followup.lead_name || 'Sin nombre'}</span>
                      <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-1 rounded">{followup.desarrollo}</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1 truncate max-w-md">{followup.message}</p>
                    <p className="text-xs text-slate-500 mt-1">📱 {followup.lead_phone}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-yellow-400">⏰ {formatDate(followup.scheduled_at)}</p>
                      <p className="text-xs text-slate-500">Programado</p>
                    </div>
                    <button onClick={() => cancelFollowup(followup)} className="px-3 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/40">
                      Cancelar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4 text-green-400">✅ Enviados ({sentFollowups.length})</h3>
            {sentFollowups.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No hay follow-ups enviados aún</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-auto">
                {sentFollowups.slice(0, 20).map(followup => (
                  <div key={followup.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <div>
                      <span className="font-semibold">{followup.lead_name}</span>
                      <span className="text-slate-400 text-sm ml-2">• {followup.desarrollo}</span>
                    </div>
                    <span className="text-sm text-green-400">{formatDate(followup.sent_at || '')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4 text-orange-400">❌ Cancelados ({cancelledFollowups.length})</h3>
            {cancelledFollowups.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No hay follow-ups cancelados</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-auto">
                {cancelledFollowups.slice(0, 20).map(followup => (
                  <div key={followup.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <div>
                      <span className="font-semibold">{followup.lead_name}</span>
                      <span className="text-slate-400 text-sm ml-2">• {followup.desarrollo}</span>
                    </div>
                    <span className="text-sm text-orange-400">{followup.cancel_reason || 'manual'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
