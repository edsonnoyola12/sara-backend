// ═══════════════════════════════════════════════════════════════════════════
// AUTO-ASSIGNMENT SERVICE - Motor de reglas para asignación de leads
// ═══════════════════════════════════════════════════════════════════════════
// Asigna leads automáticamente basado en reglas configurables:
// - Por desarrollo/propiedad
// - Por horario
// - Por carga de trabajo
// - Por idioma del lead
// ═══════════════════════════════════════════════════════════════════════════

export type RuleConditionType =
  | 'development' // Por desarrollo de interés
  | 'schedule' // Por horario
  | 'workload' // Por carga de trabajo
  | 'language' // Por idioma
  | 'source' // Por fuente (Facebook, Google, etc.)
  | 'location' // Por ubicación del lead
  | 'score' // Por score del lead
  | 'round_robin'; // Round robin simple

export interface RuleCondition {
  type: RuleConditionType;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: string | number | string[];
}

export interface AssignmentRule {
  id: string;
  name: string;
  description?: string;
  priority: number; // Menor número = mayor prioridad
  conditions: RuleCondition[];
  conditionLogic: 'AND' | 'OR'; // Cómo combinar condiciones
  assignTo: {
    type: 'specific' | 'pool' | 'round_robin' | 'least_workload';
    vendorIds?: string[]; // Para specific o pool
    fallbackToRoundRobin?: boolean;
  };
  schedule?: {
    enabled: boolean;
    days: number[]; // 0-6 (Dom-Sab)
    startTime: string; // "09:00"
    endTime: string; // "19:00"
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
  // Métricas
  timesUsed: number;
  lastUsedAt?: string;
}

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  role?: string;
  active: boolean;
  developments?: string[]; // Desarrollos que maneja
  languages?: string[]; // Idiomas que habla
  maxActiveLeads?: number; // Límite de leads activos
  currentActiveLeads?: number;
  schedule?: {
    days: number[];
    startTime: string;
    endTime: string;
  };
  onVacation?: boolean;
}

export interface Lead {
  id?: string;
  name?: string;
  phone: string;
  development?: string;
  source?: string;
  language?: string;
  location?: string;
  score?: number;
}

export interface AssignmentResult {
  success: boolean;
  vendorId?: string;
  vendorName?: string;
  vendorPhone?: string;
  ruleId?: string;
  ruleName?: string;
  reason: string;
  fallbackUsed?: boolean;
}

const RULES_KEY = 'assignment:rules';
const ROUND_ROBIN_KEY = 'assignment:round_robin_index';

export class AutoAssignmentService {
  private kv: KVNamespace | undefined;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  // ═══════════════════════════════════════════════════════════════
  // GESTIÓN DE REGLAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene todas las reglas
   */
  async getRules(): Promise<AssignmentRule[]> {
    if (!this.kv) return this.getDefaultRules();

    try {
      const data = await this.kv.get(RULES_KEY, 'json');
      const rules = (data as AssignmentRule[]) || this.getDefaultRules();
      return rules.sort((a, b) => a.priority - b.priority);
    } catch (e) {
      return this.getDefaultRules();
    }
  }

  /**
   * Obtiene una regla por ID
   */
  async getRule(id: string): Promise<AssignmentRule | null> {
    const rules = await this.getRules();
    return rules.find(r => r.id === id) || null;
  }

  /**
   * Crea una nueva regla
   */
  async createRule(rule: Omit<AssignmentRule, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed'>): Promise<AssignmentRule> {
    const rules = await this.getRules();

    const newRule: AssignmentRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timesUsed: 0
    };

    rules.push(newRule);
    await this.saveRules(rules);

    console.log(`📋 Regla de asignación creada: ${newRule.name}`);
    return newRule;
  }

  /**
   * Actualiza una regla
   */
  async updateRule(id: string, updates: Partial<AssignmentRule>): Promise<AssignmentRule | null> {
    const rules = await this.getRules();
    const index = rules.findIndex(r => r.id === id);

    if (index === -1) return null;

    rules[index] = {
      ...rules[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.saveRules(rules);
    return rules[index];
  }

  /**
   * Elimina una regla
   */
  async deleteRule(id: string): Promise<boolean> {
    const rules = await this.getRules();
    const filtered = rules.filter(r => r.id !== id);

    if (filtered.length === rules.length) return false;

    await this.saveRules(filtered);
    return true;
  }

  private async saveRules(rules: AssignmentRule[]): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(RULES_KEY, JSON.stringify(rules));
  }

  private getDefaultRules(): AssignmentRule[] {
    return [
      {
        id: 'rule_default_round_robin',
        name: 'Round Robin Default',
        description: 'Asignación por round robin cuando ninguna otra regla aplica',
        priority: 999,
        conditions: [],
        conditionLogic: 'AND',
        assignTo: {
          type: 'round_robin'
        },
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timesUsed: 0
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════════
  // MOTOR DE ASIGNACIÓN
  // ═══════════════════════════════════════════════════════════════

  /**
   * Asigna un lead usando las reglas configuradas
   */
  async assignLead(lead: Lead, availableVendors: Vendor[]): Promise<AssignmentResult> {
    if (availableVendors.length === 0) {
      return {
        success: false,
        reason: 'No hay vendedores disponibles'
      };
    }

    // Filtrar vendedores activos y no de vacaciones
    const activeVendors = availableVendors.filter(v =>
      v.active && !v.onVacation && this.isVendorInSchedule(v)
    );

    if (activeVendors.length === 0) {
      return {
        success: false,
        reason: 'No hay vendedores activos en horario'
      };
    }

    const rules = await this.getRules();
    const activeRules = rules.filter(r => r.active);

    // Evaluar reglas en orden de prioridad
    for (const rule of activeRules) {
      // Verificar si la regla está activa según su horario
      if (rule.schedule?.enabled && !this.isRuleInSchedule(rule)) {
        continue;
      }

      // Evaluar condiciones
      if (this.evaluateConditions(rule, lead)) {
        const result = await this.applyRule(rule, lead, activeVendors);

        if (result.success) {
          // Actualizar métricas de la regla
          await this.updateRuleMetrics(rule.id);
          return result;
        }
      }
    }

    // Fallback: round robin
    return this.roundRobinAssignment(activeVendors, 'Ninguna regla aplicó, usando round robin');
  }

  /**
   * Evalúa las condiciones de una regla
   */
  private evaluateConditions(rule: AssignmentRule, lead: Lead): boolean {
    if (rule.conditions.length === 0) {
      return true; // Sin condiciones = siempre aplica
    }

    const results = rule.conditions.map(condition => this.evaluateCondition(condition, lead));

    if (rule.conditionLogic === 'AND') {
      return results.every(r => r);
    } else {
      return results.some(r => r);
    }
  }

  /**
   * Evalúa una condición individual
   */
  private evaluateCondition(condition: RuleCondition, lead: Lead): boolean {
    let leadValue: any;

    switch (condition.type) {
      case 'development':
        leadValue = lead.development?.toLowerCase();
        break;
      case 'source':
        leadValue = lead.source?.toLowerCase();
        break;
      case 'language':
        leadValue = lead.language?.toLowerCase();
        break;
      case 'location':
        leadValue = lead.location?.toLowerCase();
        break;
      case 'score':
        leadValue = lead.score;
        break;
      default:
        return true;
    }

    if (leadValue === undefined || leadValue === null) {
      return false;
    }

    const conditionValue = typeof condition.value === 'string'
      ? condition.value.toLowerCase()
      : condition.value;

    switch (condition.operator) {
      case 'equals':
        return leadValue === conditionValue;
      case 'contains':
        return typeof leadValue === 'string' && leadValue.includes(conditionValue as string);
      case 'greater_than':
        return typeof leadValue === 'number' && leadValue > (conditionValue as number);
      case 'less_than':
        return typeof leadValue === 'number' && leadValue < (conditionValue as number);
      case 'in':
        return Array.isArray(conditionValue) &&
          conditionValue.map(v => v.toLowerCase()).includes(leadValue);
      case 'not_in':
        return Array.isArray(conditionValue) &&
          !conditionValue.map(v => v.toLowerCase()).includes(leadValue);
      default:
        return false;
    }
  }

  /**
   * Aplica una regla y asigna a un vendedor
   */
  private async applyRule(rule: AssignmentRule, lead: Lead, vendors: Vendor[]): Promise<AssignmentResult> {
    const { assignTo } = rule;

    switch (assignTo.type) {
      case 'specific':
        if (assignTo.vendorIds && assignTo.vendorIds.length > 0) {
          const vendor = vendors.find(v => assignTo.vendorIds!.includes(v.id));
          if (vendor) {
            return {
              success: true,
              vendorId: vendor.id,
              vendorName: vendor.name,
              vendorPhone: vendor.phone,
              ruleId: rule.id,
              ruleName: rule.name,
              reason: `Regla "${rule.name}" asignó a vendedor específico`
            };
          }
        }
        break;

      case 'pool':
        if (assignTo.vendorIds && assignTo.vendorIds.length > 0) {
          const poolVendors = vendors.filter(v => assignTo.vendorIds!.includes(v.id));
          if (poolVendors.length > 0) {
            return this.leastWorkloadAssignment(poolVendors, rule);
          }
        }
        break;

      case 'least_workload':
        return this.leastWorkloadAssignment(vendors, rule);

      case 'round_robin':
        return this.roundRobinAssignment(vendors, `Regla "${rule.name}"`, rule);
    }

    // Fallback si la regla falla
    if (assignTo.fallbackToRoundRobin) {
      return this.roundRobinAssignment(vendors, `Fallback de regla "${rule.name}"`, rule);
    }

    return {
      success: false,
      ruleId: rule.id,
      ruleName: rule.name,
      reason: `Regla "${rule.name}" no pudo asignar vendedor`
    };
  }

  /**
   * Asignación por menor carga de trabajo
   */
  private leastWorkloadAssignment(vendors: Vendor[], rule?: AssignmentRule): AssignmentResult {
    // Ordenar por carga de trabajo (menor primero)
    const sorted = [...vendors].sort((a, b) => {
      const loadA = a.currentActiveLeads || 0;
      const loadB = b.currentActiveLeads || 0;
      return loadA - loadB;
    });

    // Filtrar los que no han excedido su límite
    const available = sorted.filter(v => {
      if (!v.maxActiveLeads) return true;
      return (v.currentActiveLeads || 0) < v.maxActiveLeads;
    });

    if (available.length === 0) {
      // Usar el de menor carga aunque haya excedido
      const vendor = sorted[0];
      return {
        success: true,
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorPhone: vendor.phone,
        ruleId: rule?.id,
        ruleName: rule?.name,
        reason: 'Asignado por menor carga (todos excedieron límite)',
        fallbackUsed: true
      };
    }

    const vendor = available[0];
    return {
      success: true,
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorPhone: vendor.phone,
      ruleId: rule?.id,
      ruleName: rule?.name,
      reason: `Asignado por menor carga de trabajo (${vendor.currentActiveLeads || 0} leads activos)`
    };
  }

  /**
   * Asignación round robin
   */
  private async roundRobinAssignment(
    vendors: Vendor[],
    reason: string,
    rule?: AssignmentRule
  ): Promise<AssignmentResult> {
    const index = await this.getRoundRobinIndex();
    const vendorIndex = index % vendors.length;
    const vendor = vendors[vendorIndex];

    // Incrementar índice para el próximo
    await this.setRoundRobinIndex(index + 1);

    return {
      success: true,
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorPhone: vendor.phone,
      ruleId: rule?.id,
      ruleName: rule?.name,
      reason: `Round robin: ${reason}`
    };
  }

  private async getRoundRobinIndex(): Promise<number> {
    if (!this.kv) return 0;

    try {
      const value = await this.kv.get(ROUND_ROBIN_KEY);
      return value ? parseInt(value, 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  private async setRoundRobinIndex(index: number): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(ROUND_ROBIN_KEY, index.toString());
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS DE HORARIO
  // ═══════════════════════════════════════════════════════════════

  private isVendorInSchedule(vendor: Vendor): boolean {
    if (!vendor.schedule) return true;

    return this.isInSchedule(
      vendor.schedule.days,
      vendor.schedule.startTime,
      vendor.schedule.endTime
    );
  }

  private isRuleInSchedule(rule: AssignmentRule): boolean {
    if (!rule.schedule?.enabled) return true;

    return this.isInSchedule(
      rule.schedule.days,
      rule.schedule.startTime,
      rule.schedule.endTime
    );
  }

  private isInSchedule(days: number[], startTime: string, endTime: string): boolean {
    const now = new Date();
    const mexicoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));

    const dayOfWeek = mexicoTime.getDay();
    const hours = mexicoTime.getHours();
    const minutes = mexicoTime.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    // Verificar día
    if (!days.includes(dayOfWeek)) {
      return false;
    }

    // Verificar hora
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  private async updateRuleMetrics(ruleId: string): Promise<void> {
    const rules = await this.getRules();
    const index = rules.findIndex(r => r.id === ruleId);

    if (index !== -1) {
      rules[index].timesUsed++;
      rules[index].lastUsedAt = new Date().toISOString();
      await this.saveRules(rules);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ESTADÍSTICAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtiene estadísticas de uso de reglas
   */
  async getStats(): Promise<{
    totalRules: number;
    activeRules: number;
    ruleUsage: Array<{
      id: string;
      name: string;
      timesUsed: number;
      lastUsedAt?: string;
    }>;
  }> {
    const rules = await this.getRules();

    return {
      totalRules: rules.length,
      activeRules: rules.filter(r => r.active).length,
      ruleUsage: rules
        .map(r => ({
          id: r.id,
          name: r.name,
          timesUsed: r.timesUsed,
          lastUsedAt: r.lastUsedAt
        }))
        .sort((a, b) => b.timesUsed - a.timesUsed)
    };
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createAutoAssignment(kv?: KVNamespace): AutoAssignmentService {
  return new AutoAssignmentService(kv);
}
