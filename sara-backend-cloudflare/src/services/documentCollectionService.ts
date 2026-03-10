// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT COLLECTION SERVICE - Tracking de documentos para crédito hipotecario
// ═══════════════════════════════════════════════════════════════════════════
// Gestiona la checklist de documentos requeridos para crédito hipotecario,
// detecta tipo de documento por caption/filename, y genera reportes WhatsApp
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DocumentDefinition {
  id: string;
  name: string;
  required: boolean;
}

export interface ReceivedDocument {
  type: string;
  receivedAt: string;
  mediaId?: string;
}

export interface DocumentChecklist {
  required: string[];
  received: ReceivedDocument[];
  completionPct: number;
  missing: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const MORTGAGE_DOCUMENTS: DocumentDefinition[] = [
  { id: 'ine_frente', name: 'INE (frente)', required: true },
  { id: 'ine_reverso', name: 'INE (reverso)', required: true },
  { id: 'comprobante_domicilio', name: 'Comprobante de domicilio', required: true },
  { id: 'comprobante_ingresos', name: 'Comprobante de ingresos (3 meses)', required: true },
  { id: 'acta_nacimiento', name: 'Acta de nacimiento', required: true },
  { id: 'curp', name: 'CURP', required: true },
  { id: 'constancia_fiscal', name: 'Constancia de situación fiscal', required: false },
  { id: 'estados_cuenta', name: 'Estados de cuenta (3 meses)', required: true },
];

// ═══════════════════════════════════════════════════════════════════════════
// DETECTION RULES
// ═══════════════════════════════════════════════════════════════════════════

interface DetectionRule {
  docType: string;
  keywords: string[];
  excludeKeywords?: string[];
}

const DETECTION_RULES: DetectionRule[] = [
  {
    docType: 'ine_reverso',
    keywords: ['ine reverso', 'ine atras', 'ine atrás', 'credencial reverso', 'credencial atras', 'credencial atrás', 'identificacion reverso', 'identificación reverso', 'reverso ine', 'atras ine', 'atrás ine', 'parte trasera', 'lado b'],
  },
  {
    docType: 'ine_frente',
    keywords: ['ine', 'credencial', 'identificacion', 'identificación', 'id oficial', 'ine frente', 'frente ine'],
    excludeKeywords: ['reverso', 'atras', 'atrás', 'trasera', 'lado b'],
  },
  {
    docType: 'comprobante_domicilio',
    keywords: ['domicilio', 'luz', 'agua', 'telefono', 'teléfono', 'cfe', 'recibo luz', 'recibo agua', 'comprobante domicilio', 'predial', 'gas'],
  },
  {
    docType: 'comprobante_ingresos',
    keywords: ['nomina', 'nómina', 'recibo nomina', 'recibo nómina', 'ingreso', 'ingresos', 'salario', 'sueldo', 'comprobante ingresos', 'comprobante de ingresos', 'recibo de sueldo'],
  },
  {
    docType: 'acta_nacimiento',
    keywords: ['acta', 'nacimiento', 'acta de nacimiento', 'acta nacimiento'],
  },
  {
    docType: 'curp',
    keywords: ['curp'],
  },
  {
    docType: 'constancia_fiscal',
    keywords: ['fiscal', 'sat', 'constancia', 'situacion fiscal', 'situación fiscal', 'constancia fiscal', 'rfc', 'constancia sat'],
  },
  {
    docType: 'estados_cuenta',
    keywords: ['estado cuenta', 'estados cuenta', 'estado de cuenta', 'estados de cuenta', 'banco', 'bancario', 'extracto', 'movimientos bancarios'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class DocumentCollectionService {
  constructor(private supabase: SupabaseService) {}

  // ─────────────────────────────────────────────────────────────────────
  // Initialize checklist for a lead entering credit flow
  // ─────────────────────────────────────────────────────────────────────
  async initializeChecklist(leadId: string): Promise<DocumentChecklist> {
    const lead = await this.supabase.getLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const notes = lead.notes || {};

    // Don't re-initialize if already exists
    if (notes.document_checklist) {
      return notes.document_checklist as DocumentChecklist;
    }

    const requiredDocs = MORTGAGE_DOCUMENTS.filter((d) => d.required).map((d) => d.id);

    const checklist: DocumentChecklist = {
      required: requiredDocs,
      received: [],
      completionPct: 0,
      missing: [...requiredDocs],
    };

    await this.supabase.updateLead(leadId, {
      notes: { ...notes, document_checklist: checklist },
    });

    console.log(`📋 Document checklist initialized for lead ${leadId}`);
    return checklist;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Detect document type from caption/filename
  // ─────────────────────────────────────────────────────────────────────
  detectDocumentType(
    caption: string | undefined,
    filename: string | undefined,
    mimeType: string
  ): string | null {
    // Only process images and PDFs
    const isDocument = mimeType.startsWith('image/') || mimeType === 'application/pdf';
    if (!isDocument) return null;

    const text = [caption, filename].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (!text.trim()) return null;

    for (const rule of DETECTION_RULES) {
      // Check exclude keywords first
      if (rule.excludeKeywords) {
        const hasExclude = rule.excludeKeywords.some((kw) => text.includes(kw));
        if (hasExclude) continue;
      }

      const matched = rule.keywords.some((kw) => text.includes(kw));
      if (matched) return rule.docType;
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Mark a document as received
  // ─────────────────────────────────────────────────────────────────────
  async markDocumentReceived(
    leadId: string,
    docType: string,
    mediaId?: string
  ): Promise<DocumentChecklist> {
    // Fresh read to avoid JSONB race condition
    const lead = await this.supabase.getLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const notes = lead.notes || {};
    const checklist: DocumentChecklist = notes.document_checklist || {
      required: MORTGAGE_DOCUMENTS.filter((d) => d.required).map((d) => d.id),
      received: [],
      completionPct: 0,
      missing: MORTGAGE_DOCUMENTS.filter((d) => d.required).map((d) => d.id),
    };

    // Avoid duplicates — replace if already received
    const existingIdx = checklist.received.findIndex((r) => r.type === docType);
    const receivedDoc: ReceivedDocument = {
      type: docType,
      receivedAt: new Date().toISOString(),
      mediaId,
    };

    if (existingIdx >= 0) {
      checklist.received[existingIdx] = receivedDoc;
    } else {
      checklist.received.push(receivedDoc);
    }

    // Recalculate missing and completion
    const receivedTypes = new Set(checklist.received.map((r) => r.type));
    checklist.missing = checklist.required.filter((id) => !receivedTypes.has(id));
    checklist.completionPct = checklist.required.length > 0
      ? Math.round(((checklist.required.length - checklist.missing.length) / checklist.required.length) * 100)
      : 0;

    await this.supabase.updateLead(leadId, {
      notes: { ...notes, document_checklist: checklist },
    });

    const docName = MORTGAGE_DOCUMENTS.find((d) => d.id === docType)?.name || docType;
    console.log(`✅ Document received: ${docName} for lead ${leadId} (${checklist.completionPct}%)`);

    return checklist;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Get current checklist status
  // ─────────────────────────────────────────────────────────────────────
  async getChecklistStatus(leadId: string): Promise<DocumentChecklist | null> {
    const lead = await this.supabase.getLeadById(leadId);
    if (!lead) return null;

    return (lead.notes?.document_checklist as DocumentChecklist) || null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Format checklist for WhatsApp (status view)
  // ─────────────────────────────────────────────────────────────────────
  formatChecklist(checklist: DocumentChecklist, leadName: string): string {
    const lines: string[] = [];

    lines.push(`📋 *Documentos de ${leadName}*`);
    lines.push('━━━━━━━━━━━━━━━━━');

    const receivedTypes = new Set(checklist.received.map((r) => r.type));

    // Show all mortgage documents (required + optional)
    for (const doc of MORTGAGE_DOCUMENTS) {
      const icon = receivedTypes.has(doc.id) ? '✅' : '⬜';
      const optionalTag = !doc.required ? ' _(opcional)_' : '';
      lines.push(`${icon} ${doc.name}${optionalTag}`);
    }

    lines.push('');

    // Progress bar
    const totalRequired = checklist.required.length;
    const received = totalRequired - checklist.missing.length;
    const filledBlocks = Math.round((checklist.completionPct / 100) * 10);
    const emptyBlocks = 10 - filledBlocks;
    const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

    lines.push(`Progreso: ${received}/${totalRequired} (${checklist.completionPct}%) ${progressBar}`);

    if (checklist.missing.length === 0) {
      lines.push('');
      lines.push('🎉 *¡Documentación completa!*');
    }

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Generate checklist request message to send to lead
  // ─────────────────────────────────────────────────────────────────────
  generateChecklistMessage(leadName: string): string {
    const firstName = leadName.split(' ')[0];
    const lines: string[] = [];

    lines.push(`¡Hola ${firstName}! 👋`);
    lines.push('');
    lines.push('Para avanzar con tu trámite de crédito hipotecario, necesitamos los siguientes documentos:');
    lines.push('');

    const requiredDocs = MORTGAGE_DOCUMENTS.filter((d) => d.required);
    for (let i = 0; i < requiredDocs.length; i++) {
      lines.push(`${i + 1}. ${requiredDocs[i].name}`);
    }

    lines.push('');
    lines.push('📎 Puedes enviarlos como foto o PDF directamente por aquí.');
    lines.push('');
    lines.push('_Opcional:_');
    const optionalDocs = MORTGAGE_DOCUMENTS.filter((d) => !d.required);
    for (const doc of optionalDocs) {
      lines.push(`• ${doc.name}`);
    }

    lines.push('');
    lines.push('¿Tienes alguna duda? Con gusto te ayudo. 😊');

    return lines.join('\n');
  }
}
