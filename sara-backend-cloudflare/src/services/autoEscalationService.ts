// ═══════════════════════════════════════════════════════════════════════════
// AUTO-ESCALATION SERVICE - Reasignación y escalación automática de leads
// ═══════════════════════════════════════════════════════════════════════════
// 5 min sin respuesta → reasignar a otro vendedor
// 15 min sin respuesta → escalar a CEO
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';
import { MetaWhatsAppService } from './meta-whatsapp';
import { getAvailableVendor, TeamMemberAvailability } from './leadManagementService';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { safeJsonParse } from '../utils/safeHelpers';

// ═══════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════

export interface EscalationResult {
  reassigned: number;
  escalatedToCEO: number;
  errors: number;
  details: Array<{
    leadId: string;
    leadName: string;
    action: 'reassigned' | 'escalated_ceo' | 'error';
    minutesWaiting: number;
    from?: string;
    to?: string;
    error?: string;
  }>;
}

export interface SpeedMetrics {
  period: string;
  totalResponses: number;
  avgMinutes: number;
  medianMinutes: number;
  p95Minutes: number;
  byVendor: Array<{
    vendorId: string;
    vendorName: string;
    totalResponses: number;
    avgMinutes: number;
    medianMinutes: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// SERVICIO
// ═══════════════════════════════════════════════════════════════

export class AutoEscalationService {
  constructor(
    private supabase: SupabaseService,
    private meta: MetaWhatsAppService,
    private kvCache: KVNamespace
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // MAIN CRON: Verificar SLA breaches y escalar
  // ═══════════════════════════════════════════════════════════════

  async checkAndEscalate(): Promise<EscalationResult> {
    const result: EscalationResult = {
      reassigned: 0,
      escalatedToCEO: 0,
      errors: 0,
      details: []
    };

    // 1. Verificar horario de negocio (9am-7pm México, Lun-Sáb)
    if (!this.isBusinessHours()) {
      console.log('⏰ AutoEscalation: fuera de horario de negocio, skipping');
      return result;
    }

    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);

    try {
      // 2. Query leads con mensajes recientes sin respuesta del vendedor
      const { data: leads, error: queryError } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status, assigned_to, last_message_at, notes, team_members:assigned_to(id, name, phone, role)')
        .in('status', ['new', 'contacted'])
        .gte('last_message_at', twentyMinAgo.toISOString())
        .lte('last_message_at', fiveMinAgo.toISOString())
        .order('last_message_at', { ascending: true })
        .limit(20);

      if (queryError) {
        console.error('❌ AutoEscalation: error querying leads:', queryError.message);
        return result;
      }

      if (!leads || leads.length === 0) {
        console.log('✅ AutoEscalation: no hay leads pendientes de respuesta');
        return result;
      }

      console.log(`🔍 AutoEscalation: ${leads.length} leads candidatos para escalación`);

      // 3. Pre-fetch team members para reasignación
      const { data: allTeamMembers } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('active', true);

      const teamMembers = allTeamMembers || [];

      // Encontrar CEO para escalaciones
      const ceo = teamMembers.find(tm => tm.role === 'ceo' || tm.role === 'admin');

      let processedCount = 0;

      // 4. Procesar cada lead (max 10 por run)
      for (const lead of leads) {
        if (processedCount >= 10) {
          console.log('⚠️ AutoEscalation: límite de 10 escalaciones alcanzado');
          break;
        }

        try {
          const notes = safeJsonParse(lead.notes);
          const lastMessageAt = new Date(lead.last_message_at);
          const minutesWaiting = Math.round((now.getTime() - lastMessageAt.getTime()) / (1000 * 60));
          const messageTimestamp = lastMessageAt.getTime().toString();

          // Skip si el vendedor ya respondió a este mensaje
          if (notes.vendor_responded === true) {
            continue;
          }

          // Skip si ya se escaló para este mensaje específico
          if (notes.last_escalation_message_id === messageTimestamp) {
            continue;
          }

          // KV dedup check
          const dedupKey = `escalation:${lead.id}:${messageTimestamp}`;
          const alreadyProcessed = await this.kvCache.get(dedupKey);
          if (alreadyProcessed) {
            continue;
          }

          // Mark-before-send: escribir dedup en KV ANTES de enviar
          await this.kvCache.put(dedupKey, JSON.stringify({
            action: minutesWaiting >= 15 ? 'ceo' : 'reassign',
            timestamp: now.toISOString()
          }), { expirationTtl: 1800 }); // 30 min TTL

          const vendedorActual = lead.team_members as any;
          const vendedorName = vendedorActual?.name || 'Vendedor desconocido';

          // ═══ 15+ MINUTOS → ESCALAR A CEO ═══
          if (minutesWaiting >= 15 && ceo) {
            const mensajeCEO = `🚨 *LEAD SIN ATENDER 15min*\n\n` +
              `👤 *${lead.name || 'Sin nombre'}*\n` +
              `📱 ${lead.phone}\n` +
              `⏱️ ${minutesWaiting} min sin respuesta\n` +
              `👤 Vendedor: ${vendedorName}\n\n` +
              `❌ Requiere intervención inmediata`;

            await enviarMensajeTeamMember(
              this.supabase,
              this.meta,
              ceo,
              mensajeCEO,
              {
                tipoMensaje: 'alerta_lead',
                prioridad: 'critico',
                guardarPending: true
              }
            );

            // Fresh read notes before writing (JSONB race prevention)
            const { data: freshLead } = await this.supabase.client
              .from('leads')
              .select('notes')
              .eq('id', lead.id)
              .single();

            const freshNotes = safeJsonParse(freshLead?.notes);
            freshNotes.last_escalation_message_id = messageTimestamp;
            freshNotes.last_escalation_type = 'ceo';
            freshNotes.last_escalation_at = now.toISOString();

            await this.supabase.client
              .from('leads')
              .update({ notes: freshNotes })
              .eq('id', lead.id);

            result.escalatedToCEO++;
            processedCount++;
            result.details.push({
              leadId: lead.id,
              leadName: lead.name || 'Sin nombre',
              action: 'escalated_ceo',
              minutesWaiting,
              from: vendedorName,
              to: ceo.name
            });

            console.log(`🚨 CEO escalation: ${lead.name} (${minutesWaiting}min, vendedor: ${vendedorName})`);

          // ═══ 5-14 MINUTOS → REASIGNAR A OTRO VENDEDOR ═══
          } else if (minutesWaiting >= 5 && minutesWaiting < 15) {
            // Encontrar otro vendedor disponible (excluyendo el actual)
            const otrosVendedores = teamMembers.filter(
              tm => tm.id !== lead.assigned_to
            ) as TeamMemberAvailability[];

            const nuevoVendedor = getAvailableVendor(otrosVendedores);

            if (!nuevoVendedor) {
              console.log(`⚠️ AutoEscalation: no hay otro vendedor disponible para ${lead.name}`);
              // Limpiar dedup key ya que no se pudo procesar
              await this.kvCache.delete(dedupKey);
              continue;
            }

            // Reasignar lead
            await this.supabase.client
              .from('leads')
              .update({ assigned_to: nuevoVendedor.id })
              .eq('id', lead.id);

            // Notificar nuevo vendedor
            const mensajeNuevo = `📋 *Lead reasignado*\n\n` +
              `👤 *${lead.name || 'Sin nombre'}*\n` +
              `📱 ${lead.phone}\n` +
              `⏱️ ${vendedorName} no respondió en ${minutesWaiting} min\n\n` +
              `¡Contáctalo pronto!`;

            const nuevoTM = teamMembers.find(tm => tm.id === nuevoVendedor.id);
            if (nuevoTM) {
              await enviarMensajeTeamMember(
                this.supabase,
                this.meta,
                nuevoTM,
                mensajeNuevo,
                {
                  tipoMensaje: 'alerta_lead',
                  prioridad: 'critico',
                  guardarPending: true
                }
              );
            }

            // Notificar vendedor anterior
            if (vendedorActual) {
              const vendedorAnteriorTM = teamMembers.find(tm => tm.id === vendedorActual.id);
              if (vendedorAnteriorTM) {
                const mensajeAnterior = `⚠️ *${lead.name || 'Lead'} fue reasignado*\n\n` +
                  `No hubo respuesta en ${minutesWaiting} min.\n` +
                  `Reasignado a ${nuevoVendedor.name}.`;

                await enviarMensajeTeamMember(
                  this.supabase,
                  this.meta,
                  vendedorAnteriorTM,
                  mensajeAnterior,
                  {
                    tipoMensaje: 'notificacion',
                    prioridad: 'normal',
                    guardarPending: true
                  }
                );
              }
            }

            // Fresh read notes before writing (JSONB race prevention)
            const { data: freshLead } = await this.supabase.client
              .from('leads')
              .select('notes')
              .eq('id', lead.id)
              .single();

            const freshNotes = safeJsonParse(freshLead?.notes);
            freshNotes.last_escalation_message_id = messageTimestamp;
            freshNotes.last_escalation_type = 'reassigned';
            freshNotes.last_escalation_at = now.toISOString();
            freshNotes.reassigned_from = vendedorActual?.id;
            freshNotes.reassigned_to = nuevoVendedor.id;

            await this.supabase.client
              .from('leads')
              .update({ notes: freshNotes })
              .eq('id', lead.id);

            result.reassigned++;
            processedCount++;
            result.details.push({
              leadId: lead.id,
              leadName: lead.name || 'Sin nombre',
              action: 'reassigned',
              minutesWaiting,
              from: vendedorName,
              to: nuevoVendedor.name
            });

            console.log(`🔄 Reassigned: ${lead.name} (${minutesWaiting}min, ${vendedorName} → ${nuevoVendedor.name})`);
          }

        } catch (leadError) {
          const errorMsg = leadError instanceof Error ? leadError.message : String(leadError);
          console.error(`❌ AutoEscalation error for lead ${lead.id}:`, errorMsg);
          result.errors++;
          result.details.push({
            leadId: lead.id,
            leadName: lead.name || 'Sin nombre',
            action: 'error',
            minutesWaiting: 0,
            error: errorMsg
          });
        }
      }

    } catch (outerError) {
      console.error('❌ AutoEscalation: error general:', outerError);
      result.errors++;
    }

    console.log(`📊 AutoEscalation completado: ${result.reassigned} reasignados, ${result.escalatedToCEO} escalados a CEO, ${result.errors} errores`);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRAR RESPUESTA DEL VENDEDOR
  // ═══════════════════════════════════════════════════════════════

  async recordVendorResponse(leadId: string, vendorId: string): Promise<void> {
    try {
      const now = new Date();

      // Fresh read para evitar race condition
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('notes, last_message_at')
        .eq('id', leadId)
        .single();

      if (!lead) {
        console.log(`⚠️ recordVendorResponse: lead ${leadId} no encontrado`);
        return;
      }

      const notes = safeJsonParse(lead.notes);

      // Calcular speed_to_lead
      let speedToLeadMinutes: number | null = null;
      if (lead.last_message_at) {
        const lastMsg = new Date(lead.last_message_at);
        speedToLeadMinutes = Math.round((now.getTime() - lastMsg.getTime()) / (1000 * 60) * 10) / 10;
      }

      notes.vendor_responded = true;
      notes.vendor_responded_by = vendorId;
      notes.first_vendor_response_at = notes.first_vendor_response_at || now.toISOString();
      notes.last_vendor_response_at = now.toISOString();

      if (speedToLeadMinutes !== null) {
        notes.speed_to_lead = speedToLeadMinutes;

        // Mantener historial de velocidades (últimas 10)
        if (!Array.isArray(notes.speed_to_lead_history)) {
          notes.speed_to_lead_history = [];
        }
        notes.speed_to_lead_history = [
          ...notes.speed_to_lead_history.slice(-9),
          {
            minutes: speedToLeadMinutes,
            vendor_id: vendorId,
            timestamp: now.toISOString()
          }
        ];
      }

      const { error } = await this.supabase.client
        .from('leads')
        .update({ notes })
        .eq('id', leadId);

      if (error) {
        console.error(`❌ recordVendorResponse: error updating lead ${leadId}:`, error.message);
      } else {
        console.log(`✅ Vendor response recorded: lead ${leadId}, speed ${speedToLeadMinutes}min`);
      }

    } catch (err) {
      console.error(`❌ recordVendorResponse error:`, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTRICAS DE SPEED-TO-LEAD
  // ═══════════════════════════════════════════════════════════════

  async getSpeedToLeadMetrics(period: 'today' | 'week' | 'month'): Promise<SpeedMetrics> {
    const now = new Date();
    let fromDate: Date;

    switch (period) {
      case 'today':
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const periodLabel = period === 'today'
      ? now.toISOString().split('T')[0]
      : `${fromDate!.toISOString().split('T')[0]} - ${now.toISOString().split('T')[0]}`;

    const emptyMetrics: SpeedMetrics = {
      period: periodLabel,
      totalResponses: 0,
      avgMinutes: 0,
      medianMinutes: 0,
      p95Minutes: 0,
      byVendor: []
    };

    try {
      // Query leads that have speed_to_lead data in the period
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, assigned_to, notes, team_members:assigned_to(id, name)')
        .gte('updated_at', fromDate!.toISOString())
        .not('notes', 'is', null)
        .limit(500);

      if (!leads || leads.length === 0) return emptyMetrics;

      // Extract speed_to_lead_history entries within period
      const allSpeeds: number[] = [];
      const vendorSpeeds: Map<string, { name: string; speeds: number[] }> = new Map();

      for (const lead of leads) {
        const notes = safeJsonParse(lead.notes);
        const history = notes.speed_to_lead_history;

        if (!Array.isArray(history)) continue;

        for (const entry of history) {
          if (!entry?.minutes || !entry?.timestamp) continue;

          const entryDate = new Date(entry.timestamp);
          if (entryDate < fromDate!) continue;

          const minutes = Number(entry.minutes);
          if (isNaN(minutes) || minutes < 0) continue;

          allSpeeds.push(minutes);

          const vendorId = entry.vendor_id || lead.assigned_to;
          const vendorName = (lead.team_members as any)?.name || 'Desconocido';

          if (!vendorSpeeds.has(vendorId)) {
            vendorSpeeds.set(vendorId, { name: vendorName, speeds: [] });
          }
          vendorSpeeds.get(vendorId)!.speeds.push(minutes);
        }
      }

      if (allSpeeds.length === 0) return emptyMetrics;

      // Calculate global metrics
      allSpeeds.sort((a, b) => a - b);

      const avg = allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length;
      const median = allSpeeds[Math.floor(allSpeeds.length / 2)];
      const p95Index = Math.min(Math.floor(allSpeeds.length * 0.95), allSpeeds.length - 1);
      const p95 = allSpeeds[p95Index];

      // Calculate per-vendor metrics
      const byVendor: SpeedMetrics['byVendor'] = [];
      for (const [vendorId, data] of vendorSpeeds) {
        data.speeds.sort((a, b) => a - b);
        const vAvg = data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length;
        const vMedian = data.speeds[Math.floor(data.speeds.length / 2)];

        byVendor.push({
          vendorId,
          vendorName: data.name,
          totalResponses: data.speeds.length,
          avgMinutes: Math.round(vAvg * 10) / 10,
          medianMinutes: Math.round(vMedian * 10) / 10
        });
      }

      // Sort by avg response time (fastest first)
      byVendor.sort((a, b) => a.avgMinutes - b.avgMinutes);

      return {
        period: periodLabel,
        totalResponses: allSpeeds.length,
        avgMinutes: Math.round(avg * 10) / 10,
        medianMinutes: Math.round(median * 10) / 10,
        p95Minutes: Math.round(p95 * 10) / 10,
        byVendor
      };

    } catch (err) {
      console.error('❌ getSpeedToLeadMetrics error:', err);
      return emptyMetrics;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  private isBusinessHours(): boolean {
    const mexicoNow = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })
    );
    const day = mexicoNow.getDay(); // 0=Dom, 6=Sáb
    const hour = mexicoNow.getHours();

    // Lun-Sáb (1-6), 9am-7pm
    if (day === 0) return false; // Domingo
    if (hour < 9 || hour >= 19) return false;

    return true;
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

export function createAutoEscalationService(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  kvCache: KVNamespace
): AutoEscalationService {
  return new AutoEscalationService(supabase, meta, kvCache);
}
