// ═══════════════════════════════════════════════════════════════════════════
// LEAD DEDUPLICATION SERVICE - Detección y fusión de leads duplicados
// ═══════════════════════════════════════════════════════════════════════════
// Detecta leads duplicados por teléfono, email o nombre similar
// Permite fusionar datos de leads duplicados
// ═══════════════════════════════════════════════════════════════════════════

export interface Lead {
  id: string;
  phone?: string;
  email?: string;
  name?: string;
  created_at?: string;
  status?: string;
  source?: string;
  assigned_vendor?: string;
  property_interest?: string;
  notes?: string;
  conversation_count?: number;
  last_interaction?: string;
  [key: string]: any;
}

export interface DuplicateMatch {
  lead1: Lead;
  lead2: Lead;
  matchType: 'phone' | 'email' | 'name' | 'combined';
  confidence: number; // 0-1
  reasons: string[];
  suggestedAction: 'merge' | 'review' | 'ignore';
  suggestedPrimary: string; // ID del lead que debería ser el primario
}

export interface MergeResult {
  success: boolean;
  primaryLead: Lead;
  mergedFrom: string[];
  fieldsUpdated: string[];
  errors?: string[];
}

export interface DeduplicationStats {
  totalLeads: number;
  duplicateGroups: number;
  potentialDuplicates: number;
  duplicatesByType: {
    phone: number;
    email: number;
    name: number;
  };
}

export class LeadDeduplicationService {
  constructor() {}

  // ═══════════════════════════════════════════════════════════════
  // DETECCIÓN DE DUPLICADOS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Encuentra todos los duplicados en una lista de leads
   */
  findDuplicates(leads: Lead[]): DuplicateMatch[] {
    const duplicates: DuplicateMatch[] = [];
    const processedPairs = new Set<string>();

    for (let i = 0; i < leads.length; i++) {
      for (let j = i + 1; j < leads.length; j++) {
        const lead1 = leads[i];
        const lead2 = leads[j];
        const pairKey = [lead1.id, lead2.id].sort().join('-');

        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const match = this.compareLeads(lead1, lead2);
        if (match) {
          duplicates.push(match);
        }
      }
    }

    return duplicates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Verifica si un lead nuevo es duplicado de alguno existente
   */
  checkForDuplicate(newLead: Lead, existingLeads: Lead[]): DuplicateMatch | null {
    let bestMatch: DuplicateMatch | null = null;

    for (const existing of existingLeads) {
      const match = this.compareLeads(newLead, existing);
      if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
        bestMatch = match;
      }
    }

    return bestMatch;
  }

  /**
   * Compara dos leads y determina si son duplicados
   */
  compareLeads(lead1: Lead, lead2: Lead): DuplicateMatch | null {
    const reasons: string[] = [];
    let totalScore = 0;
    let matchType: 'phone' | 'email' | 'name' | 'combined' = 'combined';

    // Comparar teléfono (alta prioridad)
    if (lead1.phone && lead2.phone) {
      const phone1 = this.normalizePhone(lead1.phone);
      const phone2 = this.normalizePhone(lead2.phone);

      if (phone1 === phone2) {
        totalScore += 0.9;
        reasons.push('Mismo número de teléfono');
        matchType = 'phone';
      } else if (this.phonesAreSimilar(phone1, phone2)) {
        totalScore += 0.4;
        reasons.push('Teléfono similar (posible error de captura)');
      }
    }

    // Comparar email (alta prioridad)
    if (lead1.email && lead2.email) {
      const email1 = lead1.email.toLowerCase().trim();
      const email2 = lead2.email.toLowerCase().trim();

      if (email1 === email2) {
        totalScore += 0.85;
        reasons.push('Mismo email');
        if (matchType !== 'phone') matchType = 'email';
      } else if (this.emailsAreSimilar(email1, email2)) {
        totalScore += 0.3;
        reasons.push('Email similar (posible typo)');
      }
    }

    // Comparar nombre (prioridad media)
    if (lead1.name && lead2.name) {
      const similarity = this.calculateNameSimilarity(lead1.name, lead2.name);

      if (similarity > 0.9) {
        totalScore += 0.5;
        reasons.push('Nombre idéntico o muy similar');
        if (matchType !== 'phone' && matchType !== 'email') matchType = 'name';
      } else if (similarity > 0.7) {
        totalScore += 0.25;
        reasons.push('Nombre parcialmente similar');
      }
    }

    // Si no hay suficiente evidencia, no es duplicado
    if (totalScore < 0.5 || reasons.length === 0) {
      return null;
    }

    // Normalizar confianza a 0-1
    const confidence = Math.min(1, totalScore);

    // Determinar acción sugerida
    let suggestedAction: 'merge' | 'review' | 'ignore';
    if (confidence >= 0.85) {
      suggestedAction = 'merge';
    } else if (confidence >= 0.5) {
      suggestedAction = 'review';
    } else {
      suggestedAction = 'ignore';
    }

    // Determinar lead primario (el más antiguo o con más interacciones)
    const suggestedPrimary = this.determinePrimaryLead(lead1, lead2);

    return {
      lead1,
      lead2,
      matchType,
      confidence: Math.round(confidence * 100) / 100,
      reasons,
      suggestedAction,
      suggestedPrimary
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // FUSIÓN DE LEADS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fusiona dos leads en uno
   */
  mergeLeads(primary: Lead, secondary: Lead): MergeResult {
    const fieldsUpdated: string[] = [];
    const errors: string[] = [];

    // Campos que se fusionan (tomar el que tiene valor o el más reciente)
    const mergeableFields = [
      'email', 'name', 'source', 'property_interest', 'notes',
      'assigned_vendor', 'status'
    ];

    const mergedLead: Lead = { ...primary };

    for (const field of mergeableFields) {
      // Si el primario no tiene valor pero el secundario sí
      if (!primary[field] && secondary[field]) {
        mergedLead[field] = secondary[field];
        fieldsUpdated.push(field);
      }
      // Si ambos tienen notas, combinarlas
      else if (field === 'notes' && primary.notes && secondary.notes) {
        mergedLead.notes = `${primary.notes}\n\n--- Fusionado de lead ${secondary.id} ---\n${secondary.notes}`;
        fieldsUpdated.push('notes');
      }
    }

    // Combinar contadores
    if (secondary.conversation_count) {
      mergedLead.conversation_count = (primary.conversation_count || 0) + secondary.conversation_count;
      fieldsUpdated.push('conversation_count');
    }

    // Tomar la interacción más reciente
    if (secondary.last_interaction) {
      const primaryDate = primary.last_interaction ? new Date(primary.last_interaction) : new Date(0);
      const secondaryDate = new Date(secondary.last_interaction);
      if (secondaryDate > primaryDate) {
        mergedLead.last_interaction = secondary.last_interaction;
        fieldsUpdated.push('last_interaction');
      }
    }

    return {
      success: true,
      primaryLead: mergedLead,
      mergedFrom: [secondary.id],
      fieldsUpdated,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Genera instrucciones SQL para fusionar leads (para ejecutar en Supabase)
   */
  generateMergeSQL(primaryId: string, secondaryId: string): string[] {
    const queries: string[] = [];

    // 1. Mover conversaciones del lead secundario al primario
    queries.push(`
      UPDATE conversations
      SET lead_id = '${primaryId}'
      WHERE lead_id = '${secondaryId}';
    `);

    // 2. Mover citas del lead secundario al primario
    queries.push(`
      UPDATE appointments
      SET lead_id = '${primaryId}'
      WHERE lead_id = '${secondaryId}';
    `);

    // 3. Mover notas del lead secundario al primario
    queries.push(`
      UPDATE lead_notes
      SET lead_id = '${primaryId}'
      WHERE lead_id = '${secondaryId}';
    `);

    // 4. Actualizar contadores en el lead primario
    queries.push(`
      UPDATE leads
      SET
        conversation_count = COALESCE(conversation_count, 0) + (
          SELECT COALESCE(conversation_count, 0) FROM leads WHERE id = '${secondaryId}'
        ),
        notes = COALESCE(notes, '') || E'\\n\\n--- Fusionado ---\\n' || COALESCE(
          (SELECT notes FROM leads WHERE id = '${secondaryId}'), ''
        )
      WHERE id = '${primaryId}';
    `);

    // 5. Marcar lead secundario como fusionado (soft delete)
    queries.push(`
      UPDATE leads
      SET
        status = 'merged',
        merged_into = '${primaryId}',
        merged_at = NOW()
      WHERE id = '${secondaryId}';
    `);

    return queries;
  }

  // ═══════════════════════════════════════════════════════════════
  // ESTADÍSTICAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Genera estadísticas de duplicados
   */
  getStats(leads: Lead[]): DeduplicationStats {
    const duplicates = this.findDuplicates(leads);

    // Contar por tipo
    const byType = { phone: 0, email: 0, name: 0 };
    const seenLeads = new Set<string>();

    for (const dup of duplicates) {
      byType[dup.matchType === 'combined' ? 'phone' : dup.matchType]++;
      seenLeads.add(dup.lead1.id);
      seenLeads.add(dup.lead2.id);
    }

    // Agrupar duplicados conectados
    const groups = this.groupConnectedDuplicates(duplicates);

    return {
      totalLeads: leads.length,
      duplicateGroups: groups.length,
      potentialDuplicates: seenLeads.size,
      duplicatesByType: byType
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ═══════════════════════════════════════════════════════════════

  private normalizePhone(phone: string): string {
    // Eliminar todo excepto números
    return phone.replace(/\D/g, '');
  }

  private phonesAreSimilar(phone1: string, phone2: string): boolean {
    // Verificar si difieren solo por código de país
    if (phone1.length !== phone2.length) {
      const longer = phone1.length > phone2.length ? phone1 : phone2;
      const shorter = phone1.length > phone2.length ? phone2 : phone1;
      return longer.endsWith(shorter) && longer.length - shorter.length <= 3;
    }

    // Verificar si difieren en solo 1-2 dígitos (error de captura)
    let differences = 0;
    for (let i = 0; i < phone1.length; i++) {
      if (phone1[i] !== phone2[i]) differences++;
    }
    return differences <= 2;
  }

  private emailsAreSimilar(email1: string, email2: string): boolean {
    // Comparar solo la parte local (antes de @)
    const [local1, domain1] = email1.split('@');
    const [local2, domain2] = email2.split('@');

    // Mismo dominio y local similar
    if (domain1 === domain2) {
      const similarity = this.calculateStringSimilarity(local1, local2);
      return similarity > 0.85;
    }

    return false;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();

    // Coincidencia exacta
    if (n1 === n2) return 1;

    // Uno contiene al otro
    if (n1.includes(n2) || n2.includes(n1)) return 0.85;

    // Similaridad de strings
    return this.calculateStringSimilarity(n1, n2);
  }

  private calculateStringSimilarity(s1: string, s2: string): number {
    // Algoritmo de Levenshtein normalizado
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[s1.length][s2.length];
  }

  private determinePrimaryLead(lead1: Lead, lead2: Lead): string {
    // Prioridad 1: El lead más antiguo
    if (lead1.created_at && lead2.created_at) {
      const date1 = new Date(lead1.created_at);
      const date2 = new Date(lead2.created_at);
      if (date1 < date2) return lead1.id;
      if (date2 < date1) return lead2.id;
    }

    // Prioridad 2: El lead con más conversaciones
    const conv1 = lead1.conversation_count || 0;
    const conv2 = lead2.conversation_count || 0;
    if (conv1 !== conv2) {
      return conv1 > conv2 ? lead1.id : lead2.id;
    }

    // Prioridad 3: El lead con más datos completos
    const fields1 = Object.values(lead1).filter(v => v !== null && v !== undefined).length;
    const fields2 = Object.values(lead2).filter(v => v !== null && v !== undefined).length;

    return fields1 >= fields2 ? lead1.id : lead2.id;
  }

  private groupConnectedDuplicates(duplicates: DuplicateMatch[]): Set<string>[] {
    const groups: Map<string, Set<string>> = new Map();

    for (const dup of duplicates) {
      const id1 = dup.lead1.id;
      const id2 = dup.lead2.id;

      let group1 = this.findGroup(groups, id1);
      let group2 = this.findGroup(groups, id2);

      if (!group1 && !group2) {
        // Crear nuevo grupo
        const newGroup = new Set([id1, id2]);
        groups.set(id1, newGroup);
        groups.set(id2, newGroup);
      } else if (group1 && !group2) {
        // Agregar id2 al grupo de id1
        group1.add(id2);
        groups.set(id2, group1);
      } else if (!group1 && group2) {
        // Agregar id1 al grupo de id2
        group2.add(id1);
        groups.set(id1, group2);
      } else if (group1 !== group2) {
        // Fusionar grupos
        for (const id of group2!) {
          group1!.add(id);
          groups.set(id, group1!);
        }
      }
    }

    // Obtener grupos únicos
    const uniqueGroups = new Set<Set<string>>();
    for (const group of groups.values()) {
      uniqueGroups.add(group);
    }

    return Array.from(uniqueGroups);
  }

  private findGroup(groups: Map<string, Set<string>>, id: string): Set<string> | undefined {
    return groups.get(id);
  }
}

/**
 * Helper para crear instancia del servicio
 */
export function createLeadDeduplication(): LeadDeduplicationService {
  return new LeadDeduplicationService();
}

/**
 * Helper rápido para verificar si un lead es duplicado
 */
export function checkDuplicate(newLead: Lead, existingLeads: Lead[]): DuplicateMatch | null {
  return new LeadDeduplicationService().checkForDuplicate(newLead, existingLeads);
}
