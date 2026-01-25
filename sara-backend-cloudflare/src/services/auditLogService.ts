// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG SERVICE - Bitácora de acciones
// ═══════════════════════════════════════════════════════════════════════════
// Registra todas las acciones importantes del sistema
// Útil para debugging, compliance y análisis
// Almacena en KV con rotación automática
// ═══════════════════════════════════════════════════════════════════════════

export type AuditAction =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.assigned'
  | 'lead.status_changed'
  | 'appointment.created'
  | 'appointment.completed'
  | 'appointment.canceled'
  | 'message.sent'
  | 'message.received'
  | 'broadcast.sent'
  | 'team.login'
  | 'team.action'
  | 'api.call'
  | 'flag.changed'
  | 'error.occurred'
  | 'system.cron'
  | 'system.backup';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  actor: {
    type: 'system' | 'lead' | 'team_member' | 'api';
    id?: string;
    name?: string;
    phone?: string;
  };
  target?: {
    type: string;
    id?: string;
    name?: string;
  };
  details?: Record<string, any>;
  ip?: string;
  requestId?: string;
}

export interface AuditQuery {
  action?: AuditAction;
  actorType?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

const AUDIT_PREFIX = 'audit:';
const AUDIT_INDEX_KEY = 'audit:index';
const MAX_ENTRIES = 10000; // Máximo de entradas en índice
const ENTRY_TTL = 60 * 60 * 24 * 30; // 30 días de retención

export class AuditLogService {
  private kv: KVNamespace | undefined;
  private enabled: boolean = true;

  constructor(kv?: KVNamespace, enabled: boolean = true) {
    this.kv = kv;
    this.enabled = enabled;
  }

  /**
   * Genera un ID único para la entrada
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Registra una acción en la bitácora
   */
  async log(
    action: AuditAction,
    actor: AuditEntry['actor'],
    target?: AuditEntry['target'],
    details?: Record<string, any>,
    meta?: { ip?: string; requestId?: string }
  ): Promise<string | null> {
    if (!this.enabled || !this.kv) {
      // Log a consola si KV no disponible
      console.log(`[AUDIT] ${action}`, { actor, target, details });
      return null;
    }

    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      action,
      actor,
      target,
      details,
      ip: meta?.ip,
      requestId: meta?.requestId
    };

    try {
      // 1. Guardar la entrada individual
      const entryKey = `${AUDIT_PREFIX}${entry.id}`;
      await this.kv.put(entryKey, JSON.stringify(entry), {
        expirationTtl: ENTRY_TTL
      });

      // 2. Actualizar índice (lista de IDs)
      await this.updateIndex(entry.id);

      console.log(`[AUDIT] ${action}: ${entry.id}`);
      return entry.id;
    } catch (e) {
      console.error('Error guardando audit log:', e);
      return null;
    }
  }

  /**
   * Actualiza el índice de entradas
   */
  private async updateIndex(newId: string): Promise<void> {
    if (!this.kv) return;

    try {
      const indexData = await this.kv.get(AUDIT_INDEX_KEY, 'json') as string[] | null;
      let index = indexData || [];

      // Agregar nuevo ID al principio
      index.unshift(newId);

      // Limitar tamaño del índice
      if (index.length > MAX_ENTRIES) {
        const removed = index.splice(MAX_ENTRIES);
        // Eliminar entradas antiguas en background
        for (const id of removed.slice(0, 100)) {
          await this.kv.delete(`${AUDIT_PREFIX}${id}`);
        }
      }

      await this.kv.put(AUDIT_INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.error('Error actualizando índice de audit:', e);
    }
  }

  /**
   * Obtiene entradas de la bitácora
   */
  async query(options: AuditQuery = {}): Promise<AuditEntry[]> {
    if (!this.kv) {
      return [];
    }

    const limit = options.limit || 100;

    try {
      // Obtener índice
      const indexData = await this.kv.get(AUDIT_INDEX_KEY, 'json') as string[] | null;
      if (!indexData || indexData.length === 0) {
        return [];
      }

      // Obtener entradas (batch)
      const entries: AuditEntry[] = [];
      const idsToFetch = indexData.slice(0, limit * 2); // Fetch más por si hay filtros

      for (const id of idsToFetch) {
        if (entries.length >= limit) break;

        const entry = await this.kv.get(`${AUDIT_PREFIX}${id}`, 'json') as AuditEntry | null;
        if (!entry) continue;

        // Aplicar filtros
        if (options.action && entry.action !== options.action) continue;
        if (options.actorType && entry.actor.type !== options.actorType) continue;
        if (options.actorId && entry.actor.id !== options.actorId) continue;
        if (options.targetType && entry.target?.type !== options.targetType) continue;
        if (options.targetId && entry.target?.id !== options.targetId) continue;

        if (options.startDate && entry.timestamp < options.startDate) continue;
        if (options.endDate && entry.timestamp > options.endDate) continue;

        entries.push(entry);
      }

      return entries;
    } catch (e) {
      console.error('Error consultando audit log:', e);
      return [];
    }
  }

  /**
   * Obtiene una entrada específica
   */
  async get(id: string): Promise<AuditEntry | null> {
    if (!this.kv) return null;

    try {
      return await this.kv.get(`${AUDIT_PREFIX}${id}`, 'json') as AuditEntry | null;
    } catch (e) {
      console.error('Error obteniendo audit entry:', e);
      return null;
    }
  }

  /**
   * Obtiene resumen de actividad
   */
  async getSummary(hours: number = 24): Promise<Record<AuditAction, number>> {
    const entries = await this.query({
      startDate: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
      limit: 1000
    });

    const summary: Record<string, number> = {};
    for (const entry of entries) {
      summary[entry.action] = (summary[entry.action] || 0) + 1;
    }

    return summary as Record<AuditAction, number>;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS - Métodos convenientes para acciones comunes
  // ═══════════════════════════════════════════════════════════════

  async logLeadCreated(leadId: string, leadName: string, source?: string): Promise<string | null> {
    return this.log('lead.created', { type: 'system' }, { type: 'lead', id: leadId, name: leadName }, { source });
  }

  async logLeadAssigned(leadId: string, leadName: string, assignedTo: string, assignedName: string): Promise<string | null> {
    return this.log('lead.assigned',
      { type: 'system' },
      { type: 'lead', id: leadId, name: leadName },
      { assigned_to: assignedTo, assigned_name: assignedName }
    );
  }

  async logMessageReceived(leadId: string, leadPhone: string, messageType: string): Promise<string | null> {
    return this.log('message.received',
      { type: 'lead', id: leadId, phone: leadPhone },
      { type: 'conversation' },
      { message_type: messageType }
    );
  }

  async logMessageSent(leadId: string, sender: 'ai' | 'team_member', senderId?: string): Promise<string | null> {
    return this.log('message.sent',
      { type: sender === 'ai' ? 'system' : 'team_member', id: senderId },
      { type: 'lead', id: leadId },
      { sender_type: sender }
    );
  }

  async logApiCall(endpoint: string, method: string, ip?: string, requestId?: string): Promise<string | null> {
    return this.log('api.call',
      { type: 'api' },
      { type: 'endpoint', name: endpoint },
      { method },
      { ip, requestId }
    );
  }

  async logError(error: string, context?: Record<string, any>, requestId?: string): Promise<string | null> {
    return this.log('error.occurred',
      { type: 'system' },
      undefined,
      { error, ...context },
      { requestId }
    );
  }

  async logFlagChanged(flag: string, oldValue: any, newValue: any, changedBy?: string): Promise<string | null> {
    return this.log('flag.changed',
      { type: changedBy ? 'team_member' : 'api', id: changedBy },
      { type: 'feature_flag', name: flag },
      { old_value: oldValue, new_value: newValue }
    );
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createAuditLog(kv?: KVNamespace, enabled: boolean = true): AuditLogService {
  return new AuditLogService(kv, enabled);
}
