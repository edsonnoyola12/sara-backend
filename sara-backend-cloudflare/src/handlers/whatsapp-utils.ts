// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHATSAPP HANDLER - UTILIDADES COMPARTIDAS
// Extraído de whatsapp.ts para modularización
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { HandlerContext } from './whatsapp-types';
import { SupabaseService } from '../services/supabase';
import { LeadManagementService } from '../services/leadManagementService';
import { PropertyService } from '../services/propertyService';
import { MortgageService, MortgageData } from '../services/mortgageService';
import { AppointmentService, CrearCitaParams, CrearCitaResult } from '../services/appointmentService';
import { CalendarService } from '../services/calendar';
import { EncuestasService } from '../services/encuestasService';
import { ConversationContextService } from '../services/conversationContextService';
import { scoringService } from '../services/leadScoring';
import { resourceService } from '../services/resourceService';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { parseReagendarParams as parseReagendarParamsUtil } from '../utils/vendedorParsers';
import {
  parseFechaEspanol as parseFechaEspanolUtil,
  ParsedFecha
} from './dateParser';
import {
  formatPhoneMX as formatPhoneMXUtil,
} from './constants';
import type { AIAnalysis, DatosConversacion, ContextoDecision } from './constants';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: Entregar mensaje pending con re-read + error check + wamid
// Resuelve: stale data, silent update failures, missing wamid tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function deliverPendingMessage(
  ctx: HandlerContext,
  memberId: string,
  phone: string,
  pendingKey: string,
  message: string,
  contextKey?: string
): Promise<{ success: boolean; wamid?: string }> {
  // 1. Send message and capture wamid (skip if already sent externally)
  let wamid: string | undefined;
  if (message !== '__ALREADY_SENT__') {
    try {
      const result = await ctx.meta.sendWhatsAppMessage(phone, message);
      wamid = result?.messages?.[0]?.id;
      if (wamid) {
        console.log(`✅ Pending ${pendingKey} entregado (wamid: ${wamid})`);
      } else {
        console.log(`⚠️ Pending ${pendingKey} enviado pero sin wamid en respuesta`);
      }
    } catch (err) {
      console.error(`❌ Error enviando ${pendingKey}:`, err);
      return { success: false };
    }
  }

  // 2. Re-read fresh notes from DB (avoid stale data overwrite)
  const { data: freshMember, error: readError } = await ctx.supabase.client
    .from('team_members')
    .select('notes')
    .eq('id', memberId)
    .single();

  if (readError) {
    console.error(`⚠️ Error leyendo notes frescas para ${pendingKey}:`, readError);
  }

  let freshNotes: any = {};
  if (freshMember?.notes) {
    freshNotes = typeof freshMember.notes === 'string'
      ? parseNotasSafe(freshMember.notes)
      : (typeof freshMember.notes === 'object' ? freshMember.notes : {});
  }

  // 3. Remove pending key from fresh notes
  delete freshNotes[pendingKey];

  // 4. Add metadata
  freshNotes.last_sara_interaction = new Date().toISOString();
  if (contextKey) {
    freshNotes[contextKey] = {
      sent_at: new Date().toISOString(),
      delivered: true,
      wamid
    };
  }

  // 5. Write back with error check
  const { error: writeError } = await ctx.supabase.client
    .from('team_members')
    .update({ notes: freshNotes })
    .eq('id', memberId);

  if (writeError) {
    console.error(`⚠️ Error actualizando notes después de ${pendingKey}:`, writeError);
  }

  return { success: true, wamid };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: Atomic read-merge-write for team_members notes
// Re-reads fresh notes from DB, applies mutations, writes back.
// Prevents stale data overwrites from concurrent CRONs.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function freshNotesUpdate(
  ctx: HandlerContext,
  memberId: string,
  mutate: (notes: any) => void
): Promise<void> {
  const { data: fresh } = await ctx.supabase.client
    .from('team_members')
    .select('notes')
    .eq('id', memberId)
    .maybeSingle();

  const freshNotes = parseNotasSafe(fresh?.notes);
  mutate(freshNotes);

  const { error } = await ctx.supabase.client
    .from('team_members')
    .update({ notes: freshNotes })
    .eq('id', memberId);

  if (error) console.error('⚠️ freshNotesUpdate write error:', error);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER FUNCTIONS (from lines 105-330)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function parseNotasSafe(notes: any): any {
  if (!notes) return {};
  if (typeof notes === 'string') {
    try { return JSON.parse(notes); } catch { return {}; }
  }
  return typeof notes === 'object' ? notes : {};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: findLeadByName - búsqueda fuzzy de leads por nombre
// Reemplaza ~46 patrones duplicados de .ilike('name', ...) en el codebase
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface FindLeadByNameOptions {
  vendedorId?: string;                // Scope to this vendedor's leads
  statusFilter?: string | string[];   // Filter by status (single or array)
  limit?: number;                     // Max results (default 5)
  select?: string;                    // Column selection (default '*')
  orderBy?: string;                   // Order column (default 'updated_at')
  orderAsc?: boolean;                 // Order direction (default false = desc)
}

/**
 * Fuzzy search for leads by name with accent-tolerant fallback.
 *
 * 1. Tries PostgreSQL `.ilike('name', '%nombre%')`
 * 2. If no results, falls back to in-memory accent-normalized search
 *
 * @returns Array of matching leads (empty array if none found, never null)
 */
export async function findLeadByName(
  supabase: SupabaseService,
  nombre: string,
  options: FindLeadByNameOptions = {}
): Promise<any[]> {
  const {
    vendedorId,
    statusFilter,
    limit = 5,
    select = '*',
    orderBy = 'updated_at',
    orderAsc = false
  } = options;

  if (!nombre || nombre.trim().length === 0) return [];

  const nombreTrimmed = nombre.trim();

  // Build query
  let query = supabase.client
    .from('leads')
    .select(select)
    .ilike('name', `%${nombreTrimmed}%`);

  if (vendedorId) {
    query = query.eq('assigned_to', vendedorId);
  }

  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      query = query.in('status', statusFilter);
    } else {
      query = query.eq('status', statusFilter);
    }
  }

  query = query.order(orderBy, { ascending: orderAsc });

  const { data: leads } = await query.limit(limit);

  // If ilike found results, return them
  if (leads && leads.length > 0) return leads;

  // Fallback: accent-normalized in-memory search
  const normalizar = (str: string) =>
    str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nombreNorm = normalizar(nombreTrimmed);

  let fallbackQuery = supabase.client
    .from('leads')
    .select(select);

  if (vendedorId) {
    fallbackQuery = fallbackQuery.eq('assigned_to', vendedorId);
  }

  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      fallbackQuery = fallbackQuery.in('status', statusFilter);
    } else {
      fallbackQuery = fallbackQuery.eq('status', statusFilter);
    }
  }

  const { data: allLeads } = await fallbackQuery.limit(200);

  if (!allLeads || allLeads.length === 0) return [];

  const filtered = allLeads
    .filter(l => normalizar(l.name || '').includes(nombreNorm))
    .slice(0, limit);

  return filtered;
}

export function formatVendorFeedback(notes: any, options?: { compact?: boolean }): string | null {
  const parsed = parseNotasSafe(notes);
  const vf = parsed?.vendor_feedback;
  if (!vf || !vf.rating) return null;
  const emoji = vf.rating === 1 ? '🔥' : vf.rating === 2 ? '👍' : vf.rating === 3 ? '😐' : '❄️';
  if (options?.compact) return `${emoji} ${vf.rating_text}`;
  const fecha = vf.fecha ? new Date(vf.fecha).toLocaleDateString('es-MX') : '';
  return `${emoji} Post-visita: *${vf.rating_text}* (${vf.vendedor_name?.split(' ')[0] || 'Vendedor'}${fecha ? ', ' + fecha : ''})`;
}

export function formatPhoneMX(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return 'whatsapp:+521' + digits;
  } else if (digits.length === 12 && digits.startsWith('52')) {
    return 'whatsapp:+521' + digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('521')) {
    return 'whatsapp:+' + digits;
  } else {
    return 'whatsapp:+521' + digits.slice(-10);
  }
}

/**
 * Formato para MOSTRAR teléfonos a humanos y en wa.me/ links
 * DB: "5214928787098" → Display: "+524928787098" (sin el 1 después de 52)
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // "5214928787098" (13 dígitos, empieza con 521) → "+524928787098"
  if (digits.length === 13 && digits.startsWith('521')) {
    return `+52${digits.slice(3)}`;
  }
  // "524928787098" (12 dígitos, empieza con 52) → "+524928787098"
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+${digits}`;
  }
  // "4928787098" (10 dígitos) → "+524928787098"
  if (digits.length === 10) {
    return `+52${digits}`;
  }
  // Fallback: +52 + últimos 10 dígitos
  return `+52${digits.slice(-10)}`;
}

export function parseFechaEspanolWrapper(texto: string): ParsedFecha | null {
  return parseFechaEspanolUtil(texto);
}

export function detectarIntencionCita(mensaje: string): { detectado: boolean; fecha?: string; hora?: string; tipo?: string; textoOriginal?: string } {
  const msgLower = mensaje.toLowerCase();

  const patronesAcuerdo = [
    /(?:nos\s+)?(?:vemos|marcamos|hablamos|llamamos|quedamos)\s+(?:el\s+)?(.+)/i,
    /(?:te\s+)?(?:marco|llamo|veo)\s+(?:el\s+)?(.+)/i,
    /(?:nos\s+)?(?:vemos|reunimos)\s+(?:el\s+)?(.+)/i,
    /(?:quedamos\s+)?(?:para\s+)?(?:el\s+)?(.+)\s+(?:a\s+las?\s+)?(\d)/i,
    /(?:el\s+)?(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|mañana|manana)\s+(?:a\s+las?\s+)?(\d+)/i,
    /(?:cita|visita|llamada)\s+(?:para\s+)?(?:el\s+)?(.+)/i
  ];

  for (const patron of patronesAcuerdo) {
    if (patron.test(msgLower)) {
      const parsed = parseFechaEspanolUtil(mensaje);
      if (parsed) {
        return {
          detectado: true,
          fecha: parsed.fecha,
          hora: parsed.hora,
          tipo: parsed.tipo,
          textoOriginal: mensaje
        };
      }
    }
  }

  const tienesDiaHora = /(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|mañana|manana|hoy)\s+(?:a\s+las?\s+)?(\d+)/i.test(msgLower);
  if (tienesDiaHora) {
    const parsed = parseFechaEspanolUtil(mensaje);
    if (parsed) {
      return {
        detectado: true,
        fecha: parsed.fecha,
        hora: parsed.hora,
        tipo: parsed.tipo,
        textoOriginal: mensaje
      };
    }
  }

  return { detectado: false };
}

export function determinarContextoYAccion(datos: DatosConversacion): ContextoDecision {
  const contextService = new ConversationContextService();
  return contextService.determinarContextoYAccion(datos) as unknown as ContextoDecision;
}

export function extraerNombreSimple(mensaje: string): string | null {
  const contextService = new ConversationContextService();
  return contextService.extraerNombreSimple(mensaje);
}

export function detectarBanco(mensaje: string): string | null {
  const contextService = new ConversationContextService();
  return contextService.detectarBanco(mensaje);
}

export function detectarMonto(mensaje: string): number | null {
  const contextService = new ConversationContextService();
  return contextService.detectarMonto(mensaje);
}

export function getPropsParaDesarrollos(ctx: HandlerContext, desarrollos: string[], properties: any[]): any[] {
  const propertyService = new PropertyService(ctx.supabase) as any;
  return propertyService.getPropsParaDesarrollos(desarrollos, properties);
}

export function getPropsParaModelos(ctx: HandlerContext, modelos: string[], properties: any[]): any[] {
  const propertyService = new PropertyService(ctx.supabase) as any;
  return propertyService.getPropsParaModelos(modelos, properties);
}

export async function finalizarFlujoCredito(ctx: HandlerContext, lead: any, from: string, teamMembers: any[]): Promise<void> {
  console.log('🏦 Finalizando flujo de crédito...');

  try {
    const mortgageService = new MortgageService(ctx.supabase);
    const result = await mortgageService.finalizeCreditFlow(lead, teamMembers);

    if (!result.success || !result.asesor) {
      console.error('⚠️ No hay asesor disponible');
      return;
    }

    const { data: leadActual } = await ctx.supabase.client
      .from('leads')
      .select('*')
      .eq('id', lead.id)
      .single();

    const leadData = leadActual || lead;

    if (result.asesor.phone && result.asesor.is_active !== false) {
      const notif = `🔥 *LEAD COMPLETÓ FLUJO DE CRÉDITO*\n\n` +
        `👤 *${leadData.name || 'Sin nombre'}*\n` +
        `📱 ${leadData.phone}\n` +
        `🏠 ${leadData.property_interest || 'Por definir'}\n` +
        `🏦 ${leadData.banco_preferido || 'Por definir'}\n` +
        `💰 Ingreso: $${(leadData.ingreso_mensual || 0).toLocaleString('es-MX')}/mes\n` +
        `💵 Enganche: $${(leadData.enganche_disponible || 0).toLocaleString('es-MX')}\n\n` +
        `⏰ ¡Contactar pronto!`;

      await ctx.twilio.sendWhatsAppMessage(
        'whatsapp:+52' + result.asesor.phone.replace(/\D/g, '').slice(-10),
        notif
      );
      console.log('📤 Asesor notificado:', result.asesor.name);
    }

    await ctx.twilio.sendWhatsAppMessage(from, (mortgageService as any).formatAsesorInfo(result.asesor));
    console.log('✅ Datos del asesor enviados al cliente');

  } catch (e) {
    console.error('⚠️ Error finalizando flujo crédito:', e);
  }
}

export async function actualizarScoreInteligente(ctx: HandlerContext, leadId: string, flujo: string | null | undefined, datos: any): Promise<void> {
  try {
    const { data: leadActual } = await ctx.supabase.client
      .from('leads')
      .select('lead_score, score, status, name, property_interest, needs_mortgage, enganche_disponible, mortgage_data')
      .eq('id', leadId)
      .single();

    if (!leadActual) return;

    const { data: citasActivas } = await ctx.supabase.client
      .from('appointments')
      .select('id')
      .eq('lead_id', leadId)
      .in('status', ['scheduled', 'confirmed', 'pending'])
      .limit(1);
    const tieneCita = citasActivas && citasActivas.length > 0;

    const resultado = scoringService.calculateFunnelScore(
      {
        status: leadActual.status,
        name: leadActual.name,
        property_interest: leadActual.property_interest,
        needs_mortgage: leadActual.needs_mortgage,
        enganche_disponible: datos?.enganche || leadActual.enganche_disponible,
        mortgage_data: { ingreso_mensual: datos?.ingreso || leadActual.mortgage_data?.ingreso_mensual }
      },
      tieneCita || flujo === 'cita',
      flujo === 'cita' ? 'confirmar_cita' : undefined
    );

    const updateData: any = {
      lead_score: resultado.score,
      score: resultado.score,
      temperature: resultado.temperature,
      lead_category: resultado.temperature.toLowerCase()
    };

    if (resultado.statusChanged) {
      updateData.status = resultado.status;
      updateData.status_changed_at = new Date().toISOString();
    }

    await ctx.supabase.client
      .from('leads')
      .update(updateData)
      .eq('id', leadId);

    console.log(`📊 Score Funnel: ${resultado.status} → ${resultado.score} (${resultado.temperature})`);
    resultado.breakdown.details.forEach((d: string) => console.log(`   ${d}`));
  } catch (e) {
    console.error('⚠️ Error actualizando score:', e);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS (from lines 10507-11986)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function getOrCreateLead(ctx: HandlerContext, phone: string, skipTeamCheck = false): Promise<{ lead: any; isNew: boolean; isTeamMember?: boolean; assignedVendedorId?: string }> {
  const leadService = new LeadManagementService(ctx.supabase);
  return leadService.getOrCreateLead(phone, skipTeamCheck);
}

export async function getVendedorMenosCarga(ctx: HandlerContext): Promise<any> {
  const leadService = new LeadManagementService(ctx.supabase) as any;
  return leadService.getVendedorMenosCarga();
}

export async function buscarVendedorPorNombre(ctx: HandlerContext, nombreBuscado: string): Promise<any | null> {
  if (!nombreBuscado) return null;

  const nombreLower = nombreBuscado.toLowerCase().trim();
  console.log('🔍 Buscando vendedor por nombre:', nombreBuscado);

  const { data: vendedores } = await ctx.supabase.client
    .from('team_members')
    .select('*')
    .eq('role', 'vendedor')
    .eq('active', true);

  if (!vendedores?.length) {
    console.error('⚠️ No hay vendedores activos');
    return null;
  }

  const encontrado = vendedores.find((v: any) => {
    const nombreCompleto = v.name?.toLowerCase() || '';
    const partes = nombreCompleto.split(' ');
    return partes.some((parte: string) => parte === nombreLower) ||
           nombreCompleto.includes(nombreLower);
  });

  if (encontrado) {
    console.log('✅ Vendedor preferido encontrado:', encontrado.name);
    return encontrado;
  }

  console.error('⚠️ No se encontró vendedor con nombre:', nombreBuscado);
  return null;
}

export function getBrochureUrl(desarrollo: string, modelo?: string): string {
  return resourceService.getBrochureUrl(desarrollo, modelo) || '';
}

export async function getAllProperties(ctx: HandlerContext): Promise<any[]> {
  const CACHE_KEY = 'properties_all';
  const CACHE_TTL = 600;

  try {
    const kv = ctx.env?.SARA_CACHE;
    if (kv) {
      try {
        const cached = await kv.get(CACHE_KEY, 'json');
        if (cached) {
          console.log('📦 Cache HIT: properties');
          return cached as any[];
        }
        console.log('🔍 Cache MISS: properties - fetching from DB');
      } catch (cacheErr) {
        console.error('⚠️ Error leyendo cache properties:', cacheErr);
      }
    }

    const propertyService = new PropertyService(ctx.supabase);
    const data = await propertyService.getAllProperties();

    if (kv && data?.length) {
      try {
        await kv.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL });
        console.log('💾 Cache SET: properties (TTL: 10min)');
      } catch (cacheErr) {
        console.error('⚠️ Error guardando properties en cache:', cacheErr);
      }
    }

    return data;
  } catch (e) {
    console.error('❌ Excepción en getAllProperties:', e);
    return [];
  }
}

export function findPropertyByDevelopment(ctx: HandlerContext, properties: any[], desarrollo: string): any | null {
  const propertyService = new PropertyService(ctx.supabase) as any;
  return propertyService.findPropertyByDevelopment(properties, desarrollo);
}

export function findTeamMemberByRole(teamMembers: any[], role: string, banco?: string): any | null {
  if (!teamMembers?.length) {
    console.error('⚠️ findTeamMemberByRole: Sin miembros del equipo');
    return null;
  }

  const roleLower = role.toLowerCase();

  if (banco) {
    const bancoLower = banco.toLowerCase();
    const asesorBanco = teamMembers.find((m: any) =>
      (m.role?.toLowerCase().includes(roleLower) ||
       m.role?.toLowerCase().includes('asesor') ||
       m.role?.toLowerCase().includes('hipotec')) &&
      m.banco?.toLowerCase().includes(bancoLower)
    );
    if (asesorBanco) {
      console.log(`✅ ${role} encontrado para banco ${banco}: ${asesorBanco.name}`);
      return asesorBanco;
    }
  }

  let found = teamMembers.find((m: any) =>
    m.role?.toLowerCase().includes(roleLower)
  );
  if (found) {
    console.log(`✅ ${role} encontrado: ${found.name}`);
    return found;
  }

  if (roleLower.includes('asesor') || roleLower.includes('credito') || roleLower.includes('hipotec')) {
    found = teamMembers.find((m: any) =>
      m.role?.toLowerCase().includes('asesor') ||
      m.role?.toLowerCase().includes('hipotec') ||
      m.role?.toLowerCase().includes('credito') ||
      m.role?.toLowerCase().includes('crédito')
    );
    if (found) {
      console.log(`✅ Asesor encontrado (fallback): ${found.name}`);
      return found;
    }
  }

  if (roleLower.includes('vendedor')) {
    found = teamMembers.find((m: any) =>
      m.role?.toLowerCase().includes('vendedor') ||
      m.role?.toLowerCase().includes('ventas')
    );
    if (found) {
      console.log(`✅ Vendedor encontrado (fallback): ${found.name}`);
      return found;
    }
  }

  console.error(`⚠️ No se encontró ${role} en el equipo`);
  return null;
}

export async function getAllTeamMembers(ctx: HandlerContext): Promise<any[]> {
  const CACHE_KEY = 'team_members_active';
  const CACHE_TTL = 300;

  try {
    const kv = ctx.env?.SARA_CACHE;
    if (kv) {
      try {
        const cached = await kv.get(CACHE_KEY, 'json');
        if (cached) {
          console.log('📦 Cache HIT: team_members');
          return cached as any[];
        }
        console.log('🔍 Cache MISS: team_members - fetching from DB');
      } catch (cacheErr) {
        console.error('⚠️ Error leyendo cache:', cacheErr);
      }
    }

    const { data, error } = await ctx.supabase.client
      .from('team_members')
      .select("*")
      .eq('active', true);

    if (error) {
      console.error('❌ Error cargando team_members:', error);
      const { data: fallback } = await ctx.supabase.client
        .from('team_members')
        .select("*");
      console.error('⚠️ Usando fallback sin filtro active:', fallback?.length || 0, 'miembros');
      return fallback || [];
    }

    console.log(`👥 Team members cargados: ${data?.length || 0} activos`);

    if (kv && data) {
      try {
        await kv.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL });
        console.log('💾 Cache SET: team_members (TTL: 5min)');
      } catch (cacheErr) {
        console.error('⚠️ Error guardando en cache:', cacheErr);
      }
    }

    const vendedores = (data || []).filter((m: any) => m.role?.toLowerCase().includes('vendedor'));
    const asesores = (data || []).filter((m: any) =>
      m.role?.toLowerCase().includes('asesor') ||
      m.role?.toLowerCase().includes('hipotec') ||
      m.role?.toLowerCase().includes('credito')
    );

    if (vendedores.length === 0) {
      console.warn('⚠️ ALERTA: No hay vendedores activos en el sistema');
    }
    if (asesores.length === 0) {
      console.warn('⚠️ ALERTA: No hay asesores de crédito activos en el sistema');
    }

    return data || [];
  } catch (e) {
    console.error('❌ Excepción en getAllTeamMembers:', e);
    return [];
  }
}

export async function generarVideoBienvenida(
  ctx: HandlerContext,
  leadPhone: string,
  nombreCliente: string,
  desarrollo: string,
  photoUrl: string,
  env: any
): Promise<string | null> {
  try {
    const primerNombre = nombreCliente.trim().split(/\s+/)[0];
    console.log(`🎬 Iniciando proceso Veo 3 para: ${primerNombre} (Full: ${nombreCliente})`);

    const apiKey = env?.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ ERROR: Falta GEMINI_API_KEY.');
      return null;
    }

    if (!photoUrl) {
      console.error('⚠️ No hay foto disponible');
      return null;
    }

    console.log('📸 Foto a usar:', photoUrl);

    const imgCtrl = new AbortController();
    const imgTimer = setTimeout(() => imgCtrl.abort(), 10_000);
    const imgResponse = await fetch(photoUrl, { signal: imgCtrl.signal });
    clearTimeout(imgTimer);
    if (!imgResponse.ok) {
      console.error('⚠️ Error descargando imagen');
      return null;
    }
    const imgBuffer = await imgResponse.arrayBuffer();
    const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

    const prompt = `Cinematic medium shot of a friendly professional Mexican woman real estate agent standing in front of the luxury house shown in the image. She looks at the camera, smiles warmly and gestures welcome. Audio: A clear female voice speaking in Mexican Spanish saying "Hola ${primerNombre}, bienvenido a tu nuevo hogar aquí en ${desarrollo}". High quality, photorealistic, 4k resolution, natural lighting.`;

    console.log('🎬 Prompt:', prompt);

    const veoCtrl = new AbortController();
    const veoTimer = setTimeout(() => veoCtrl.abort(), 25_000);
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        instances: [{
          prompt: prompt,
          image: {
            bytesBase64Encoded: imgBase64,
            mimeType: "image/jpeg"
          }
        }],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds: 6
        }
      }),
      signal: veoCtrl.signal
    });
    clearTimeout(veoTimer);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`⚠️ Veo 3 Error API (${response.status}):`, errorText);
      return null;
    }

    const result: any = await response.json();

    if (result.error) {
      console.error('❌ Google rechazó:', JSON.stringify(result.error));
      return null;
    }

    const operationName = result.name;
    if (!operationName) return null;

    console.log('🎬 Veo 3 operación iniciada:', operationName);

    await ctx.supabase.client
      .from('pending_videos')
      .insert({
        operation_id: operationName,
        lead_phone: leadPhone.replace(/\D/g, ''),
        lead_name: nombreCliente,
        desarrollo: desarrollo
      });

    console.log('📝 Video encolado en DB');
    return operationName;

  } catch (e) {
    console.error('❌ Excepción en generarVideoBienvenida:', e);
    return null;
  }
}

export async function crearCitaCompleta(
  ctx: HandlerContext,
  from: string,
  cleanPhone: string,
  lead: any,
  desarrollo: string,
  fecha: string,
  hora: string,
  teamMembers: any[],
  analysis: AIAnalysis,
  properties: any[],
  env: any,
  isReschedule: boolean = false,
  fechaAnterior?: string,
  horaAnterior?: string
): Promise<void> {
  try {
    const calendar = new CalendarService(
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.GOOGLE_PRIVATE_KEY,
      env.GOOGLE_CALENDAR_ID
    );
    const appointmentService = new AppointmentService(ctx.supabase, calendar, ctx.twilio);

    const params: CrearCitaParams = {
      from, cleanPhone, lead, desarrollo, fecha, hora,
      teamMembers, analysis, properties, env, isReschedule
    };
    const result = await appointmentService.crearCitaCompleta(params);

    if (!result.success) {
      if (result.errorType === 'duplicate') {
        console.error('⚠️ Cita duplicada detectada, no se crea nueva');
        return;
      }
      if (result.errorType === 'out_of_hours') {
        const msg = appointmentService.formatMensajeHoraInvalida(result);
        await ctx.twilio.sendWhatsAppMessage(from, msg);
        return;
      }
      if (result.errorType === 'db_error') {
        console.error('❌ Error DB creando cita:', result.error);
        // CITA INVISIBLE FIX: Avisar al lead que hubo un problema
        try {
          await ctx.twilio.sendWhatsAppMessage(from,
            '⚠️ Tuve un problema técnico al agendar tu cita. Un asesor te contactará en breve para confirmarla. ¡Disculpa la molestia!');
        } catch (sendErr) { console.error('⚠️ Error enviando mensaje de error al lead:', sendErr); }
        // Alertar al dev
        try {
          const { logErrorToDB } = await import('../crons/healthCheck');
          await logErrorToDB(ctx.supabase, 'cita_creation_failed', result.error || 'DB error creating appointment', {
            severity: 'critical', source: 'crearCitaCompleta',
            context: { leadPhone: from, desarrollo, fecha, hora, leadId: lead?.id }
          });
        } catch (logErr) { console.error('⚠️ logErrorToDB failed (cita_creation_failed):', logErr); }
        return;
      }
      return;
    }

    const { vendedor, asesorHipotecario, necesitaCredito, clientName, needsBirthdayQuestion } = result;
    (result as any).cleanPhone = cleanPhone;

    if (vendedor?.phone) {
      const msgVendedor = isReschedule
        ? appointmentService.formatMensajeVendedorReagendamiento(result, desarrollo, fecha, hora, fechaAnterior, horaAnterior)
        : appointmentService.formatMensajeVendedorNuevaCita(result, desarrollo, fecha, hora);
      const tipoNotif = isReschedule ? 'reagendamiento' : 'nueva_cita';
      try {
        const notifResult = await enviarMensajeTeamMember(ctx.supabase, ctx.meta, vendedor, msgVendedor, {
          tipoMensaje: 'alerta_lead',
          guardarPending: true,
          pendingKey: 'pending_mensaje',
          templateOverride: {
            name: 'notificacion_cita_vendedor',
            params: [
              isReschedule ? '📅 Cita reagendada' : '📅 Nueva cita',
              result.clientName || lead?.name || 'Lead',
              `wa.me/${formatPhoneForDisplay(cleanPhone).replace('+', '')}`,
              desarrollo || 'Por confirmar',
              `${fecha} ${hora}`
            ]
          }
        });
        console.log(isReschedule
          ? `📤 Notificación de REAGENDAMIENTO enviada a vendedor (${notifResult.method})`
          : `📤 Notificación de cita enviada a vendedor (${notifResult.method})`);

        // Marcar vendedor_notified = true
        if (result.appointment?.id && notifResult.success) {
          await ctx.supabase.client.from('appointments')
            .update({ vendedor_notified: true })
            .eq('id', result.appointment.id);
          console.log(`✅ vendedor_notified=true para cita ${result.appointment.id}`);
        }
      } catch (notifErr) {
        console.error('⚠️ Error notificando vendedor de cita:', notifErr);
        // CITA INVISIBLE FIX: Log a error_logs para visibilidad
        try {
          const { logErrorToDB } = await import('../crons/healthCheck');
          await logErrorToDB(ctx.supabase, 'vendor_notification_failed', `Vendedor ${vendedor.name} no recibió notificación de cita`, {
            severity: 'error', source: 'crearCitaCompleta:vendorNotif',
            context: { vendedorId: vendedor.id, leadPhone: from, desarrollo, fecha, hora }
          });
        } catch (logErr) { console.error('⚠️ logErrorToDB failed (vendor_notification_failed):', logErr); }
      }
    }

    if (necesitaCredito && asesorHipotecario?.phone && asesorHipotecario?.is_active !== false) {
      const msgAsesor = appointmentService.formatMensajeAsesorNuevaCita(result, desarrollo, fecha, hora);
      try {
        await enviarMensajeTeamMember(ctx.supabase, ctx.meta, asesorHipotecario, msgAsesor, {
          tipoMensaje: 'alerta_lead',
          guardarPending: true,
          pendingKey: 'pending_mensaje'
        });
        console.log('📤 Notificación enviada a asesor hipotecario (via enviarMensajeTeamMember)');
      } catch (asesorErr) {
        console.error('⚠️ Error notificando asesor de cita:', asesorErr);
      }
    }

    const confirmacion = appointmentService.formatMensajeConfirmacionCliente(result, desarrollo, fecha, hora);
    await ctx.twilio.sendWhatsAppMessage(from, confirmacion);
    console.log('✅ Confirmación de cita enviada');

    if (needsBirthdayQuestion && clientName) {
      await new Promise(r => setTimeout(r, 1500));
      const msgCumple = appointmentService.formatMensajeCumpleanos(clientName);
      await ctx.twilio.sendWhatsAppMessage(from, msgCumple);
      console.log('🎂 Pregunta de cumpleaños enviada');
    }

    await generarVideoBienvenidaSiAplica(ctx, from, lead, desarrollo, cleanPhone, properties, env);

    console.log('✅ CITA COMPLETA CREADA');
  } catch (error) {
    console.error('❌ Error en crearCitaCompleta:', error);
    // CITA INVISIBLE FIX: Avisar al lead + log error
    try {
      await ctx.twilio.sendWhatsAppMessage(from,
        '⚠️ Tuve un problema técnico al agendar tu cita. Un asesor te contactará en breve para confirmarla. ¡Disculpa la molestia!');
    } catch (sendErr) { console.error('⚠️ Error enviando mensaje de error al lead:', sendErr); }
    try {
      const { logErrorToDB } = await import('../crons/healthCheck');
      await logErrorToDB(ctx.supabase, 'cita_creation_crashed', error instanceof Error ? error.message : String(error), {
        severity: 'critical', source: 'crearCitaCompleta:outerCatch',
        stack: error instanceof Error ? error.stack : undefined,
        context: { leadPhone: from, desarrollo, fecha, hora, leadId: lead?.id }
      });
    } catch (logErr) { console.error('⚠️ logErrorToDB failed (cita_creation_crashed):', logErr); }
  }
}

export async function generarVideoBienvenidaSiAplica(
  ctx: HandlerContext,
  from: string,
  lead: any,
  desarrollo: string,
  cleanPhone: string,
  properties: any[],
  env: any
): Promise<void> {
  try {
    const propertiesArray = Array.isArray(properties) ? properties : [];

    const { data: videosEnviados } = await ctx.supabase.client
      .from('pending_videos')
      .select('id')
      .eq('lead_phone', cleanPhone.replace(/\D/g, ''))
      .ilike('desarrollo', `%${desarrollo}%`)
      .limit(1);

    const yaEnvioVideoParaEsteDesarrollo = videosEnviados && videosEnviados.length > 0;
    console.log('🎬 ¿Ya envió video para', desarrollo, '?', yaEnvioVideoParaEsteDesarrollo);

    const fotosDesarrollos: Record<string, string> = {
      'encinos': 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg',
      'los encinos': 'https://img.youtube.com/vi/xzPXJ00yK0A/maxresdefault.jpg',
      'monte verde': 'https://img.youtube.com/vi/49rVtCtBnHg/maxresdefault.jpg',
      'monteverde': 'https://img.youtube.com/vi/49rVtCtBnHg/maxresdefault.jpg',
      'falco': 'https://img.youtube.com/vi/reig3OGmBn4/maxresdefault.jpg',
      'distrito falco': 'https://img.youtube.com/vi/reig3OGmBn4/maxresdefault.jpg',
      'andes': 'https://img.youtube.com/vi/gXWVb_kzkgM/maxresdefault.jpg',
      'miravalle': 'https://img.youtube.com/vi/49rVtCtBnHg/maxresdefault.jpg'
    };

    const propsDelDesarrollo = propertiesArray.filter(
      (p: any) => p.development?.toLowerCase().includes(desarrollo.toLowerCase())
    );

    let fotoDesarrollo = '';
    const desarrolloLower = desarrollo.toLowerCase();

    if (fotosDesarrollos[desarrolloLower]) {
      fotoDesarrollo = fotosDesarrollos[desarrolloLower];
    } else {
      for (const [key, url] of Object.entries(fotosDesarrollos)) {
        if (desarrolloLower.includes(key) || key.includes(desarrolloLower)) {
          fotoDesarrollo = url;
          break;
        }
      }
    }

    if (!fotoDesarrollo) {
      const propConYoutube = propsDelDesarrollo.find((p: any) => p.youtube_link);
      if (propConYoutube?.youtube_link) {
        const ytMatch = propConYoutube.youtube_link.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch && ytMatch[1]) {
          fotoDesarrollo = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
        }
      }
    }

    if (!yaEnvioVideoParaEsteDesarrollo && fotoDesarrollo) {
      console.log('🎬 GENERANDO VIDEO VEO 3 para', desarrollo);
      generarVideoBienvenida(ctx, from, lead.name || "Cliente", desarrollo, fotoDesarrollo, env)
        .catch(err => console.log('Error iniciando video:', err));
    } else {
      console.log('ℹ️ No genera video:', yaEnvioVideoParaEsteDesarrollo ? 'Ya se envió' : 'No hay foto');
    }
  } catch (videoErr) {
    console.error('⚠️ Error en video bienvenida:', videoErr);
  }
}

export async function crearOActualizarMortgageApplication(
  ctx: HandlerContext,
  lead: any,
  teamMembers: any[],
  datos: {
    desarrollo?: string;
    banco?: string;
    ingreso?: number;
    enganche?: number;
    modalidad?: string;
    trigger: string;
  }
): Promise<void> {
  try {
    const mortgageService = new MortgageService(ctx.supabase);

    const result = await mortgageService.crearOActualizarConNotificacion(
      lead,
      teamMembers,
      datos as MortgageData
    );

    if (!result.success) {
      console.error('❌ Error en mortgage:', result.error);
      return;
    }

    const { asesor, action, cambios } = result;

    if (action === 'created' && asesor?.phone && asesor?.is_active !== false) {
      const msg = mortgageService.formatMensajeNuevoLead(result);
      await ctx.twilio.sendWhatsAppMessage(asesor.phone, msg);
      console.log('📤 Asesor notificado de NUEVO lead:', asesor.name);
    } else if (action === 'updated' && cambios.length > 0 && asesor?.phone && asesor?.is_active !== false) {
      const msg = mortgageService.formatMensajeActualizacion(result);
      await ctx.twilio.sendWhatsAppMessage(asesor.phone, msg);
      console.log('📤 Asesor notificado de actualización:', asesor.name);
    } else if (action === 'waiting_name') {
      console.log('⏸️ Esperando nombre real del cliente para crear mortgage');
    } else if (action === 'no_change') {
      console.log('ℹ️ mortgage_application ya existe sin cambios nuevos');
    }

  } catch (e) {
    console.error('❌ Error en crearOActualizarMortgageApplication:', e);
  }
}

export function getMexicoNow(): Date {
  // DST-aware: uses Intl API (UTC-6 winter, UTC-5 summer)
  const now = new Date();
  const mexicoStr = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  return new Date(mexicoStr);
}

export function parseFecha(fecha: string, hora: string): Date {
  const now = getMexicoNow();
  const fechaLower = fecha.toLowerCase();

  let targetDate = new Date(now);

  if (fechaLower.includes('hoy')) {
    // Hoy
  } else if (fechaLower.includes('mañana')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (fechaLower.includes('lunes')) {
    targetDate = getNextDayOfWeek(1);
  } else if (fechaLower.includes('martes')) {
    targetDate = getNextDayOfWeek(2);
  } else if (fechaLower.includes('miércoles') || fechaLower.includes('miercoles')) {
    targetDate = getNextDayOfWeek(3);
  } else if (fechaLower.includes('jueves')) {
    targetDate = getNextDayOfWeek(4);
  } else if (fechaLower.includes('viernes')) {
    targetDate = getNextDayOfWeek(5);
  } else if (fechaLower.includes('sábado') || fechaLower.includes('sabado')) {
    targetDate = getNextDayOfWeek(6);
  } else if (fechaLower.includes('domingo')) {
    targetDate = getNextDayOfWeek(0);
  }

  const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
  if (horaMatch) {
    let hours = parseInt(horaMatch[1]);
    const minutes = parseInt(horaMatch[2] || '0');

    if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
    if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;

    targetDate.setHours(hours, minutes, 0, 0);
  }

  return targetDate;
}

export function getNextDayOfWeek(dayOfWeek: number): Date {
  const now = getMexicoNow();
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const result = new Date(now);
  result.setDate(result.getDate() + daysUntil);
  return result;
}

export function parseFechaISO(fecha: string): string {
  const targetDate = parseFecha(fecha, '12:00');
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseHoraISO(hora: string): string {
  const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
  if (horaMatch) {
    let hours = parseInt(horaMatch[1]);
    const minutes = horaMatch[2] || '00';

    if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
    if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  }
  return '12:00:00';
}

export function parseReagendarParams(body: string): { dia?: string; hora?: string; minutos?: string; ampm?: string } {
  return parseReagendarParamsUtil(body);
}

export async function actualizarLead(ctx: HandlerContext, lead: any, analysis: AIAnalysis, originalMessage: string): Promise<void> {
  const leadManagementService = new LeadManagementService(ctx.supabase) as any;
  const result = await leadManagementService.actualizarLead(lead, analysis, originalMessage);

  if (result.vendedorReasignado?.phone && result.leadInfo) {
    await ctx.twilio.sendWhatsAppMessage(
      result.vendedorReasignado.phone,
      leadManagementService.formatMensajeVendedorReasignado(
        result.leadInfo.name,
        result.leadInfo.phone,
        result.leadInfo.property_interest
      )
    );
  }
}

export async function registrarActividad(
  ctx: HandlerContext,
  from: string,
  nombreLead: string,
  tipo: string,
  vendedor: any,
  monto?: number | null
): Promise<void> {
  const leadManagementService = new LeadManagementService(ctx.supabase) as any;
  const result = await leadManagementService.registrarActividad(nombreLead, tipo, vendedor, monto);

  switch (result.action) {
    case 'not_found':
      await ctx.twilio.sendWhatsAppMessage(
        from,
        leadManagementService.formatMensajeActividadNoEncontrado(result.error || nombreLead)
      );
      break;

    case 'multiple_found':
      await ctx.twilio.sendWhatsAppMessage(
        from,
        leadManagementService.formatMensajeActividadMultiples(result.leadsEncontrados || [])
      );
      break;

    case 'registered':
      const statusCambio = tipo === 'visit' && result.lead?.status === 'scheduled';
      await ctx.twilio.sendWhatsAppMessage(
        from,
        leadManagementService.formatMensajeActividadRegistrada(
          result.tipoActividad || tipo,
          result.lead?.name || nombreLead,
          result.nuevoStatus || 'new',
          result.nuevaCategoria || 'COLD',
          result.monto,
          statusCambio
        )
      );
      break;
  }
}

export async function mostrarActividadesHoy(ctx: HandlerContext, from: string, vendedor: any, useMeta: boolean = false): Promise<void> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const useMetaService = useMeta || !from.includes('whatsapp:');
  const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

  const { data: actividades } = await ctx.supabase.client
    .from('lead_activities')
    .select('activity_type, amount, created_at, leads:lead_id (name)')
    .eq('team_member_id', vendedor.id)
    .gte('created_at', hoy.toISOString())
    .order('created_at', { ascending: false });

  if (!actividades || actividades.length === 0) {
    const noActivityMsg = 'No registraste actividad hoy.\n\nRegistra con:\n- "Llame a Juan"\n- "Visite a Maria"\n- "Cotizacion a Pedro 850k"';
    if (useMetaService) {
      await ctx.meta.sendWhatsAppMessage(cleanPhone, noActivityMsg);
    } else {
      await ctx.twilio.sendWhatsAppMessage(from, noActivityMsg);
    }
    return;
  }

  const resumen: Record<string, string[]> = {
    'call': [],
    'visit': [],
    'quote': [],
    'whatsapp': [],
    'email': [],
    'bridge_start': [],
    'bridge_message': [],
    'bridge_end': []
  };

  let montoTotal = 0;
  actividades.forEach((a: any) => {
    const nombre = a.leads?.name || 'Desconocido';
    if (resumen[a.activity_type]) {
      resumen[a.activity_type].push(nombre);
    }
    if (a.amount) montoTotal += a.amount;
  });

  let msg = 'Tu actividad hoy:\n\n';

  if (resumen.call.length > 0) {
    msg += 'Llamadas: ' + resumen.call.length + '\n';
    msg += '  ' + resumen.call.slice(0, 5).join(', ') + '\n\n';
  }
  if (resumen.visit.length > 0) {
    msg += 'Visitas: ' + resumen.visit.length + '\n';
    msg += '  ' + resumen.visit.join(', ') + '\n\n';
  }
  if (resumen.quote.length > 0) {
    msg += 'Cotizaciones: ' + resumen.quote.length;
    if (montoTotal > 0) msg += ' ($' + montoTotal.toLocaleString() + ')';
    msg += '\n  ' + resumen.quote.join(', ') + '\n\n';
  }
  if (resumen.whatsapp.length > 0) {
    msg += 'WhatsApps: ' + resumen.whatsapp.length + '\n';
  }
  if (resumen.email.length > 0) {
    msg += 'Emails: ' + resumen.email.length + '\n';
  }

  const bridgeActivities = resumen.bridge_start.length + resumen.bridge_message.length + resumen.bridge_end.length;
  if (bridgeActivities > 0) {
    msg += '\n🔗 Chats directos:\n';
    if (resumen.bridge_start.length > 0) {
      msg += '  Iniciados: ' + resumen.bridge_start.length + ' (' + [...new Set(resumen.bridge_start)].join(', ') + ')\n';
    }
    if (resumen.bridge_message.length > 0) {
      msg += '  Mensajes: ' + resumen.bridge_message.length + '\n';
    }
  }

  msg += '\nTotal: ' + actividades.length + ' actividades';

  if (useMetaService) {
    await ctx.meta.sendWhatsAppMessage(cleanPhone, msg);
  } else {
    await ctx.twilio.sendWhatsAppMessage(from, msg);
  }
}

export async function mostrarHistorialLead(ctx: HandlerContext, from: string, nombreLead: string, vendedor: any): Promise<void> {
  const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
  const leads = await findLeadByName(ctx.supabase, nombreLead, {
    vendedorId: esAdmin ? undefined : vendedor.id,
    select: 'id, name, phone, status, score, property_interest, quote_amount, source, created_at',
    orderBy: 'updated_at',
    orderAsc: false,
    limit: 5
  });

  if (!leads || leads.length === 0) {
    await ctx.twilio.sendWhatsAppMessage(from, 'No encontre a "' + nombreLead + '"');
    return;
  }

  if (leads.length > 1) {
    let msg = 'Encontre ' + leads.length + ' leads:\n';
    leads.forEach((l: any, i: number) => {
      msg += (i+1) + '. ' + l.name + ' (' + l.status + ') ' + l.phone + '\n';
    });
    msg += '\nSe mas especifico o usa el telefono.';
    await ctx.twilio.sendWhatsAppMessage(from, msg);
    return;
  }

  const lead = leads[0];

  const { data: actividades } = await ctx.supabase.client
    .from('lead_activities')
    .select('activity_type, amount, notes, created_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(10);

  let msg = lead.name + '\n';
  msg += 'Tel: ' + lead.phone + '\n';
  msg += 'Etapa: ' + lead.status;
  const hotStages = ['negotiation', 'reserved'];
  const clientStages = ['closed', 'delivered'];
  if (clientStages.includes(lead.status)) msg += ' CLIENTE';
  else if (hotStages.includes(lead.status)) msg += ' HOT';
  msg += '\n';
  if (lead.property_interest) msg += 'Desarrollo: ' + lead.property_interest + '\n';
  if (lead.quote_amount) msg += 'Cotizacion: $' + lead.quote_amount.toLocaleString() + '\n';
  if (lead.source) msg += 'Origen: ' + lead.source + '\n';

  msg += '\nHISTORIAL:\n';

  if (actividades && actividades.length > 0) {
    const tipoEmoji: Record<string, string> = {
      'call': 'Tel',
      'visit': 'Visita',
      'quote': 'Cotiz',
      'whatsapp': 'WA',
      'email': 'Email',
      'created': 'Creado',
      'status_change': 'Movio'
    };

    actividades.forEach((a: any) => {
      const fecha = new Date(a.created_at);
      const fechaStr = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      msg += fechaStr + ' - ' + (tipoEmoji[a.activity_type] || a.activity_type);
      if (a.amount) msg += ' $' + a.amount.toLocaleString();
      msg += '\n';
    });
  } else {
    msg += 'Sin actividades registradas\n';
  }

  const creado = new Date(lead.created_at);
  msg += '\nCreado: ' + creado.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

  await ctx.twilio.sendWhatsAppMessage(from, msg);
}

export async function crearLeadDesdeWhatsApp(ctx: HandlerContext, from: string, nombre: string, telefono: string, vendedor: any): Promise<void> {
  const digits = telefono.replace(/\D/g, '').slice(-10);
  const normalizedPhone = '521' + digits;

  const { data: existente } = await ctx.supabase.client
    .from('leads')
    .select('id, name, status')
    .like('phone', '%' + digits)
    .limit(1);

  if (existente && existente.length > 0) {
    await ctx.twilio.sendWhatsAppMessage(from,
      'Ya existe: ' + existente[0].name + ' (' + existente[0].status + ')\n\nTel: ' + digits);
    return;
  }

  const { data: nuevoLead, error } = await ctx.supabase.client
    .from('leads')
    .insert({
      name: nombre,
      phone: normalizedPhone,
      status: 'new',
      score: 10,
      assigned_to: vendedor.id,
      created_by: vendedor.id,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creando lead:', error);
    await ctx.twilio.sendWhatsAppMessage(from, 'Error al crear lead. Intenta de nuevo.');
    return;
  }

  await ctx.supabase.client.from('lead_activities').insert({
    lead_id: nuevoLead.id,
    team_member_id: vendedor.id,
    activity_type: 'created'
  });

  await ctx.supabase.client.from('leads').update({
    notes: { pending_setup: true }
  }).eq('id', nuevoLead.id);

  const { data: props } = await ctx.supabase.client
    .from('properties')
    .select('id, name')
    .eq('active', true);

  let msg = 'Lead creado: ' + nombre + '\n';
  msg += 'Tel: ' + normalizedPhone + '\n\n';
  msg += 'Desarrollo?\n';

  if (props && props.length > 0) {
    props.slice(0, 6).forEach((p: any, i: number) => {
      msg += (i+1) + '. ' + p.name + '\n';
    });
    msg += '\nResponde con el numero o nombre.';
  } else {
    msg += 'Escribe el nombre del desarrollo.';
  }

  await ctx.twilio.sendWhatsAppMessage(from, msg);
}

export async function procesarRespuestaEncuesta(ctx: HandlerContext, phone: string, mensaje: string): Promise<string | null> {
  try {
    const encuestasService = new EncuestasService(ctx.supabase);
    const last10 = phone.slice(-10);

    console.log(`📋 ENCUESTA POST-VISITA: Buscando lead con phone like %${last10}`);

    const leadConEncuesta = await encuestasService.buscarLeadConEncuestaPostVisita(phone);

    if (leadConEncuesta) {
      const notas = typeof leadConEncuesta.notes === 'object' ? leadConEncuesta.notes : {};
      const survey = notas.pending_client_survey;

      console.log(`📋 ENCUESTA POST-VISITA: Lead ${leadConEncuesta.name} tiene encuesta pendiente`);

      const respuesta = encuestasService.procesarRespuestaPostVisita(mensaje, leadConEncuesta.name || '', survey);

      console.log(`✅ Encuesta post-visita procesada: ${respuesta.tipo}`);
      console.log(`📤 Respuesta para lead: ${respuesta.respuestaCliente.substring(0, 100)}...`);

      const respuestaParaLead = respuesta.respuestaCliente;

      try {
        let vendedorPhone = survey.vendedor_phone;
        if (!vendedorPhone && survey.vendedor_id) {
          console.log(`📋 Buscando teléfono de vendedor ${survey.vendedor_name} (${survey.vendedor_id})`);
          vendedorPhone = await encuestasService.obtenerTelefonoVendedor(survey.vendedor_id);
        }

        if (vendedorPhone) {
          await ctx.meta.sendWhatsAppMessage(vendedorPhone, respuesta.notificarVendedor);
          console.log(`📤 Notificación enviada a vendedor ${survey.vendedor_name} (${vendedorPhone})`);
        } else {
          console.error(`⚠️ Vendedor ${survey.vendedor_name} no tiene teléfono - no se puede notificar`);
        }
      } catch (vendorError) {
        console.error(`⚠️ Error notificando a vendedor (no afecta respuesta al lead):`, vendorError);
      }

      try {
        await encuestasService.guardarRespuestaPostVisita(leadConEncuesta.id, notas, respuesta.tipo, mensaje);
        console.log(`💾 Feedback guardado en lead ${leadConEncuesta.id}`);
      } catch (saveError) {
        console.error(`⚠️ Error guardando feedback (respuesta igual se envía):`, saveError);
      }

      return respuestaParaLead;
    }

    // Primero: capturar follow-up de reagendamiento (lead respondió a "¿qué día te funciona?")
    const leadConReagendar = await buscarLeadConFlag(ctx, phone, 'pending_noshow_reagendar');
    if (leadConReagendar) {
      const notas = typeof leadConReagendar.notes === 'object' ? leadConReagendar.notes : {};
      const reagendarCtx = notas.pending_noshow_reagendar;

      // TTL check: 48h
      if (reagendarCtx?.set_at) {
        const horasDesde = (Date.now() - new Date(reagendarCtx.set_at).getTime()) / (1000 * 60 * 60);
        if (horasDesde > 48) {
          delete notas.pending_noshow_reagendar;
          await ctx.supabase.client.from('leads').update({ notes: notas }).eq('id', leadConReagendar.id);
        } else {
          console.log(`📋 NO-SHOW REAGENDAR: Lead ${leadConReagendar.name} respondió con disponibilidad`);

          // Reenviar al vendedor
          if (reagendarCtx.vendedor_phone) {
            const nombreLead = leadConReagendar.name?.split(' ')[0] || 'El cliente';
            await ctx.meta.sendWhatsAppMessage(reagendarCtx.vendedor_phone,
              `📅 *${nombreLead}* indicó su disponibilidad para reagendar:\n\n` +
              `"${mensaje}"\n\n` +
              `📱 ${leadConReagendar.phone}\n` +
              `🏠 ${reagendarCtx.property || 'Sin propiedad'}\n\n` +
              `⚡ *Contáctalo para confirmar la nueva cita*`
            );
          }

          // Limpiar flag y responder al lead
          delete notas.pending_noshow_reagendar;
          await ctx.supabase.client.from('leads').update({ notes: notas }).eq('id', leadConReagendar.id);

          const nombreCorto = leadConReagendar.name?.split(' ')[0] || 'Hola';
          return `¡Perfecto ${nombreCorto}! 📅\n\nLe paso tu disponibilidad a ${reagendarCtx.vendedor_name || 'tu asesor'}. Te confirmará la cita en breve. 👍`;
        }
      }
    }

    const leadConNoShow = await buscarLeadConNoShowPendiente(ctx, phone);
    if (leadConNoShow) {
      const notas = typeof leadConNoShow.notes === 'object' ? leadConNoShow.notes : {};
      const noShowContext = notas.pending_noshow_response;

      console.log(`📋 NO-SHOW RESPONSE: Lead ${leadConNoShow.name} respondió a mensaje de reagendar`);

      if (noShowContext?.vendedor_phone) {
        const nombreLead = leadConNoShow.name?.split(' ')[0] || 'El cliente';
        await ctx.meta.sendWhatsAppMessage(noShowContext.vendedor_phone,
          `📬 *${nombreLead}* respondió a tu mensaje de reagendar:\n\n` +
          `"${mensaje}"\n\n` +
          `📱 ${leadConNoShow.phone}\n` +
          `🏠 ${noShowContext.property || 'Sin propiedad'}`
        );
        console.log(`✅ Vendedor ${noShowContext.vendedor_name} notificado de respuesta no-show`);
      }

      const { pending_noshow_response, ...restNotas } = notas;
      await ctx.supabase.client
        .from('leads')
        .update({
          status: 'contacted',
          notes: {
            ...restNotas,
            noshow_response: {
              mensaje: mensaje,
              responded_at: new Date().toISOString(),
              original_context: noShowContext
            },
            // Flag para capturar follow-up (ej: "sábado 3pm") y reenviar al vendedor
            pending_noshow_reagendar: {
              vendedor_phone: noShowContext?.vendedor_phone,
              vendedor_name: noShowContext?.vendedor_name,
              property: noShowContext?.property,
              set_at: new Date().toISOString()
            }
          }
        })
        .eq('id', leadConNoShow.id);

      console.log(`💾 Respuesta no-show guardada en lead ${leadConNoShow.id}`);

      const nombreCorto = leadConNoShow.name?.split(' ')[0] || 'Hola';
      return `¡Gracias ${nombreCorto}! 😊\n\nTu asesor ${noShowContext?.vendedor_name || ''} te contactará pronto para coordinar una nueva fecha.\n\n¿Hay algún día u horario que te funcione mejor?`;
    }

    console.log(`📋 ENCUESTA: Buscando para ${phone}`);

    const encuesta = await encuestasService.buscarEncuestaPendiente(phone);

    if (!encuesta) {
      console.log(`📋 ENCUESTA: Sin encuesta activa para ${phone}`);
      return null;
    }

    console.log(`📋 Encuesta encontrada: ${encuesta.id} tipo=${encuesta.survey_type} status=${encuesta.status}`);

    if (encuesta.status === 'awaiting_feedback') {
      const respuestaCliente = await (encuestasService as any).procesarComentario(encuesta, mensaje);
      await notificarResultadoEncuesta(ctx, encuesta, mensaje.trim());
      return respuestaCliente;
    }

    const textoLimpio = mensaje.trim();

    if (encuesta.survey_type === 'post_cita') {
      const respuesta = parseInt(textoLimpio);
      const resultado = await (encuestasService as any).procesarCalificacionPostCita(encuesta, respuesta);
      if (resultado) return resultado;
    }

    if (encuesta.survey_type === 'nps') {
      const nps = parseInt(textoLimpio);
      const resultado = await (encuestasService as any).procesarCalificacionNPS(encuesta, nps);
      if (resultado) return resultado;
    }

    const tiposFlexibles = ['custom', 'satisfaction', 'rescate', 'post_cierre'];
    if (tiposFlexibles.includes(encuesta.survey_type)) {
      const resultado = await (encuestasService as any).procesarEncuestaFlexible(encuesta, mensaje);
      if (resultado) return resultado;
    }

    return null;
  } catch (e) {
    console.log('Error procesando respuesta encuesta:', e);
    return null;
  }
}

export async function notificarResultadoEncuesta(ctx: HandlerContext, encuesta: any, comentario: string): Promise<void> {
  try {
    const encuestasService = new EncuestasService(ctx.supabase);
    const mensaje = encuestasService.formatMensajeResultado(encuesta, comentario);

    if (encuesta.vendedor_id) {
      const vendedorPhone = await encuestasService.obtenerTelefonoVendedor(encuesta.vendedor_id);
      if (vendedorPhone) {
        await ctx.meta.sendWhatsAppMessage(vendedorPhone, mensaje);
        console.log(`📋 Encuesta notificada a vendedor ${encuesta.vendedor_name}`);
      }
    }

    if ((encuestasService as any).esCalificacionBaja(encuesta)) {
      const admins = await (encuestasService as any).obtenerAdmins();
      for (const admin of admins) {
        await ctx.meta.sendWhatsAppMessage(admin.phone, `🚨 *ALERTA ENCUESTA BAJA*\n\n${mensaje}`);
        console.log(`🚨 Alerta de encuesta enviada a admin ${admin.name}`);
      }
    }
  } catch (e) {
    console.log('Error notificando resultado de encuesta:', e);
  }
}

export async function detectarYCrearReferido(
  ctx: HandlerContext,
  clienteReferidor: any,
  mensaje: string,
  clientePhone: string,
  from: string
): Promise<boolean> {
  const leadManagementService = new LeadManagementService(ctx.supabase);
  const result = await leadManagementService.detectarYCrearReferido(
    clienteReferidor,
    mensaje,
    clientePhone
  );

  if (!result.detected) {
    return false;
  }

  switch (result.action) {
    case 'already_exists':
      await ctx.meta.sendWhatsAppMessage(
        from,
        leadManagementService.formatMensajeReferidoYaExiste(result.existenteNombre || 'esta persona')
      );
      return true;

    case 'error':
      await ctx.meta.sendWhatsAppMessage(
        from,
        leadManagementService.formatMensajeReferidoError()
      );
      return true;

    case 'own_number':
    case 'no_phone':
      return false;

    case 'created':
      await ctx.meta.sendWhatsAppMessage(
        from,
        leadManagementService.formatMensajeAgradecimientoReferidor(result.referido!.nombre)
      );

      if (result.vendedorAsignado?.phone) {
        await ctx.meta.sendWhatsAppMessage(
          result.vendedorAsignado.phone,
          leadManagementService.formatMensajeNotificacionVendedor(
            result.referido!.nombre,
            result.referido!.telefono,
            (result as any).referidorNombre || clienteReferidor.name || 'Cliente'
          )
        );
      }

      try {
        await ctx.meta.sendWhatsAppMessage(
          result.referido!.telefono,
          (leadManagementService as any).formatMensajeBienvenidaReferido(
            result.referido!.nombre,
            (result as any).referidorNombre || clienteReferidor.name || 'Cliente'
          )
        );
      } catch (e) {
        console.error('⚠️ No se pudo enviar mensaje al referido:', e);
      }
      return true;
  }

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST-VISITA FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function procesarPostVisitaVendedor(ctx: HandlerContext, vendedorId: string, mensaje: string): Promise<any | null> {
  try {
    const postVisitService = new (await import('../services/postVisitService')).PostVisitService(ctx.supabase, ctx.env?.SARA_CACHE);
    const result = await postVisitService.procesarRespuestaVendedor(vendedorId, mensaje);
    return result;
  } catch (e) {
    console.error('⚠️ Error procesando post-visita:', e);
    return null;
  }
}

export async function buscarYProcesarPostVisitaPorPhone(ctx: HandlerContext, phone: string, mensaje: string, cachedTeamMembers?: any[]): Promise<any | null> {
  try {
    const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
    console.log(`📋 POST-VISITA SEARCH: Buscando phoneSuffix=${phoneSuffix}`);

    const postVisitService = new (await import('../services/postVisitService')).PostVisitService(ctx.supabase, ctx.env?.SARA_CACHE);

    // 1. CHECK KV PRIMERO — buscar vendedorId por phone suffix
    if (ctx.env?.SARA_CACHE) {
      try {
        const vendedorId = await ctx.env.SARA_CACHE.get(`post_visit_phone_${phoneSuffix}`);
        if (vendedorId) {
          console.log(`📋 POST-VISITA SEARCH: KV hit! vendedorId=${vendedorId} para phone=${phoneSuffix}`);
          const result = await postVisitService.procesarRespuestaVendedor(vendedorId, mensaje);
          if (result) return result;
        }
      } catch (kvErr) {
        console.error('📋 KV phone lookup failed, falling back to DB:', kvErr);
      }
    }

    // 2. FALLBACK a DB scan (legacy — por si KV no tiene el dato)
    const { data, error } = await ctx.supabase.client
      .from('team_members')
      .select('id, name, notes');
    console.log(`📋 POST-VISITA SEARCH: team_members encontrados=${data?.length || 0}, error=${error?.message || 'ninguno'}`);
    if (!data) return null;

    let foundAnyContext = false;
    for (const tm of data) {
      let notas: any = {};
      if (tm.notes) {
        if (typeof tm.notes === 'string') {
          try { notas = JSON.parse(tm.notes); } catch (e) { notas = {}; }
        } else if (typeof tm.notes === 'object') {
          notas = tm.notes;
        }
      }
      const context = notas.post_visit_context;

      if (context) {
        foundAnyContext = true;
        const contextPhone = context.vendedor_phone?.replace(/\D/g, '').slice(-10);
        if (contextPhone === phoneSuffix) {
          console.log(`📋 POST-VISITA: ¡MATCH en DB! Encontrado contexto para ${tm.name}`);
          const result = await postVisitService.procesarRespuestaVendedor(tm.id, mensaje);
          return result;
        }
      }
    }

    if (!foundAnyContext) {
      console.log(`📋 POST-VISITA SEARCH: NINGÚN team_member tiene post_visit_context (ni KV ni DB)`);
    }

    console.log(`📋 POST-VISITA SEARCH: No se encontró contexto con phone=${phoneSuffix}`);
    return null;
  } catch (e) {
    console.error('⚠️ Error buscando post-visita por phone:', e);
    return null;
  }
}

export async function ejecutarAccionPostVisita(ctx: HandlerContext, result: any): Promise<void> {
  const postVisitService = new (await import('../services/postVisitService')).PostVisitService(ctx.supabase, ctx.env?.SARA_CACHE);

  try {
    switch (result.accion) {
      case 'enviar_encuesta_lead':
        if (result.datos?.lead_phone) {
          const mensajeEncuesta = postVisitService.generarMensajeEncuestaLead(
            result.datos.lead_name,
            result.datos.property
          );
          await ctx.meta.sendWhatsAppMessage(result.datos.lead_phone, mensajeEncuesta);
          console.log(`📋 Encuesta enviada a lead ${result.datos.lead_name}`);
        }
        break;

      case 'crear_followup':
        if (result.datos?.lead_phone) {
          const mensajeFollowup = postVisitService.generarMensajeNoShowFollowup(
            result.datos.lead_name,
            result.datos.property
          );
          await ctx.meta.sendWhatsAppMessage(result.datos.lead_phone, mensajeFollowup);
          console.log(`📱 Follow-up no-show enviado a ${result.datos.lead_name}`);
        }
        break;

      case 'reagendar':
        if (result.datos) {
          const { lead_id, lead_phone, lead_name, property, fecha, vendedor_id } = result.datos;

          const { data: citasAnteriores } = await ctx.supabase.client
            .from('appointments')
            .select('id, scheduled_date, scheduled_time')
            .eq('lead_id', lead_id)
            .in('status', ['scheduled', 'confirmed']);

          if (citasAnteriores && citasAnteriores.length > 0) {
            console.log(`📅 Cancelando ${citasAnteriores.length} cita(s) anterior(es) del lead ${lead_id}`);
            for (const citaAnterior of citasAnteriores) {
              await ctx.supabase.client
                .from('appointments')
                .update({
                  status: 'cancelled',
                  cancellation_reason: 'Reagendada desde post-visita',
                  updated_at: new Date().toISOString()
                })
                .eq('id', citaAnterior.id);
              console.log(`   🗑️ Cita ${citaAnterior.id} cancelada`);
            }
          }

          await ctx.supabase.client.from('appointments').insert({
            lead_id,
            team_member_id: vendedor_id,
            scheduled_date: fecha.toISOString(),
            scheduled_time: fecha.toTimeString().slice(0, 5),
            appointment_type: 'visita',
            status: 'scheduled',
            property,
            notes: 'Reagendada desde post-visita',
            created_at: new Date().toISOString()
          });

          const fechaFormateada = fecha.toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
          });
          const nombreCorto = lead_name.split(' ')[0];

          const mapsLink = getLocationMapsLink(property);
          const ubicacionText = mapsLink
            ? `🏠 ${property}\n📍 ${mapsLink}`
            : `🏠 ${property}`;

          await ctx.meta.sendWhatsAppMessage(
            lead_phone,
            `¡Hola ${nombreCorto}! 📅\n\n` +
            `Tu cita ha sido reagendada para:\n\n` +
            `📆 *${fechaFormateada}*\n` +
            `${ubicacionText}\n\n` +
            `¡Te esperamos! 😊`
          );
          console.log(`📅 Cita reagendada para ${lead_name}: ${fechaFormateada}`);
        }
        break;

      case 'marcar_lost':
        console.error(`❌ Lead ${result.datos?.lead_id} marcado como lost: ${result.datos?.razon}`);
        break;
    }
  } catch (e) {
    console.error('⚠️ Error ejecutando acción post-visita:', e);
  }
}

export function getLocationMapsLink(location: string): string | null {
  const locationLower = location.toLowerCase();

  const locationMaps: { [key: string]: string } = {
    'oficinas de santarita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
    'oficinas santarita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
    'santarita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
    'santa rita': 'https://maps.app.goo.gl/xPvgfA686v4y6YJ47',
  };

  for (const [key, link] of Object.entries(locationMaps)) {
    if (locationLower.includes(key)) {
      return link;
    }
  }

  return null;
}

export async function iniciarPostVisita(ctx: HandlerContext, appointment: any, lead: any, vendedor: any): Promise<string | null> {
  try {
    const postVisitService = new (await import('../services/postVisitService')).PostVisitService(ctx.supabase, ctx.env?.SARA_CACHE);
    const { mensaje, context } = await postVisitService.iniciarFlujoPostVisita(appointment, lead, vendedor);

    await ctx.meta.sendWhatsAppMessage(vendedor.phone, mensaje);
    console.log(`📋 Post-visita iniciada para ${lead.name} → vendedor ${vendedor.name}`);

    return mensaje;
  } catch (e) {
    console.error('⚠️ Error iniciando post-visita:', e);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: buscarLeadConNoShowPendiente (from vendor section, used by encuestas)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function buscarLeadConNoShowPendiente(ctx: HandlerContext, phone: string): Promise<any | null> {
  try {
    const phoneSuffix = phone.replace(/\D/g, '').slice(-10);

    const { data: leads } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to')
      .or(`phone.ilike.%${phoneSuffix},whatsapp_phone.ilike.%${phoneSuffix}`);

    if (!leads || leads.length === 0) return null;

    for (const lead of leads) {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      if (notas.pending_noshow_response) {
        console.log(`📋 Encontrado lead con no-show pendiente: ${lead.name}`);
        return lead;
      }
    }

    return null;
  } catch (err) {
    console.error('Error buscando lead con no-show pendiente:', err);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: buscarLeadConFlag - busca lead por teléfono con un flag específico en notes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function buscarLeadConFlag(ctx: HandlerContext, phone: string, flag: string): Promise<any | null> {
  try {
    const phoneSuffix = phone.replace(/\D/g, '').slice(-10);
    const { data: leads } = await ctx.supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to')
      .or(`phone.ilike.%${phoneSuffix},whatsapp_phone.ilike.%${phoneSuffix}`);

    if (!leads || leads.length === 0) return null;

    for (const lead of leads) {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      if (notas[flag]) return lead;
    }
    return null;
  } catch (err) {
    console.error(`Error buscando lead con flag ${flag}:`, err);
    return null;
  }
}
