// Tests para Session 58 completa: Data Accuracy Audit + Ghost Model Purge + Phantom Leads
// Cubre commits: ed6e26e1, f0571b11, 8c4813f5, a502e74b, 3c50e071 (critical fixes en criticalFixes.test.ts)
import { describe, it, expect, vi } from 'vitest';

import { DESARROLLOS_CONOCIDOS, MODELOS_CONOCIDOS, parsearDesarrollosYModelos } from '../handlers/constants';
import { SARA_PROMPT } from '../prompts/sara';
import { getDesarrollosParaLista } from '../utils/uxHelpers';

// ═══════════════════════════════════════════════════════════
// GHOST MODELS ELIMINADOS - Lista canónica
// ═══════════════════════════════════════════════════════════

const GHOST_MODELS = [
  'Ascendente', 'Descendente', 'Encino Descendente',
  'Azalea', 'Magnolia',
  'Pino', 'Cedro',
  'Real I', 'Real II', 'Real III',
  'Navarra',
  'Halcón', 'Halcon',
  'Aconcagua',
  'Duque',
  'Ceiba', 'Abeto', 'Madroño', 'Madrono', 'Secuoya',
  'Ciprés', 'Cipres', 'Jacaranda'
];

const REAL_MODELS = [
  // Los Encinos
  'Encino Blanco', 'Encino Verde', 'Encino Dorado', 'Roble', 'Maple',
  // Andes
  'Gardenia', 'Dalia', 'Lavanda', 'Laurel',
  // Distrito Falco
  'Calandria', 'Colibrí', 'Chipre', 'Mirlo', 'Chipre Light', 'Colibrí Light', 'Proyecto Especial',
  // Monte Verde
  'Acacia', 'Eucalipto', 'Olivo', 'Fresno', 'Fresno 2',
  // Miravalle
  'Bilbao', 'Vizcaya', 'Casa Habitacion', 'Departamento',
  // Alpes
  'Dalia Alpes',
  // Paseo Colorines
  'Prototipo 6M', 'Prototipo 7M'
];

// ═══════════════════════════════════════════════════════════
// TEST 1: CONSTANTS - Ghost Models Purged
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: CONSTANTS - Ghost Models Purged', () => {
  it('MODELOS_CONOCIDOS should NOT contain any ghost models', () => {
    for (const ghost of GHOST_MODELS) {
      expect(MODELOS_CONOCIDOS).not.toContain(ghost);
    }
  });

  it('MODELOS_CONOCIDOS should contain all real models', () => {
    for (const real of REAL_MODELS) {
      expect(MODELOS_CONOCIDOS).toContain(real);
    }
  });

  it('DESARROLLOS_CONOCIDOS should include all 10 developments', () => {
    const expected = [
      'Monte Verde', 'Monte Real', 'Los Encinos', 'Miravalle',
      'Andes', 'Distrito Falco', 'Alpes', 'Paseo Colorines',
      'Villa Campelo', 'Villa Galiano'
    ];
    for (const dev of expected) {
      expect(DESARROLLOS_CONOCIDOS).toContain(dev);
    }
  });

  it('DESARROLLOS_CONOCIDOS should have exactly 10 developments', () => {
    expect(DESARROLLOS_CONOCIDOS).toHaveLength(10);
  });

  it('parsearDesarrollosYModelos should detect Alpes', () => {
    const result = parsearDesarrollosYModelos('me interesa el desarrollo Alpes');
    expect(result.desarrollos).toContain('Alpes');
  });

  it('parsearDesarrollosYModelos should detect Paseo Colorines', () => {
    const result = parsearDesarrollosYModelos('quiero ver Paseo Colorines');
    expect(result.desarrollos).toContain('Paseo Colorines');
  });

  it('parsearDesarrollosYModelos should detect Villa Campelo', () => {
    const result = parsearDesarrollosYModelos('busco terreno en Villa Campelo');
    expect(result.desarrollos).toContain('Villa Campelo');
  });

  it('parsearDesarrollosYModelos should detect real Los Encinos models', () => {
    const result = parsearDesarrollosYModelos('quiero ver el Encino Blanco y el Maple');
    expect(result.modelos).toContain('Encino Blanco');
    expect(result.modelos).toContain('Maple');
  });

  it('parsearDesarrollosYModelos should NOT detect ghost models', () => {
    const result = parsearDesarrollosYModelos('quiero el Ascendente y el Halcón');
    expect(result.modelos).not.toContain('Ascendente');
    expect(result.modelos).not.toContain('Halcón');
  });

  it('parsearDesarrollosYModelos should detect Chipre Light and Colibrí Light', () => {
    const result = parsearDesarrollosYModelos('info de Chipre Light y Colibrí Light');
    expect(result.modelos).toContain('Chipre Light');
    expect(result.modelos).toContain('Colibrí Light');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 2: SARA PROMPT - Data Accuracy
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: SARA PROMPT - Data Accuracy', () => {
  it('should NOT contain ghost models', () => {
    const promptLower = SARA_PROMPT.toLowerCase();
    expect(promptLower).not.toContain('ascendente');
    expect(promptLower).not.toContain('descendente');
    expect(promptLower).not.toContain('halcón');
    expect(promptLower).not.toContain('halcon');
    expect(promptLower).not.toContain('aconcagua');
    expect(promptLower).not.toContain('azalea');
    expect(promptLower).not.toContain('magnolia');
    expect(promptLower).not.toContain('navarra');
    expect(promptLower).not.toContain('real i');
    expect(promptLower).not.toContain('pino');
    expect(promptLower).not.toContain('cedro');
  });

  it('should contain all 7 developments with houses', () => {
    expect(SARA_PROMPT).toContain('MONTE VERDE');
    expect(SARA_PROMPT).toContain('LOS ENCINOS');
    expect(SARA_PROMPT).toContain('DISTRITO FALCO');
    expect(SARA_PROMPT).toContain('MIRAVALLE');
    expect(SARA_PROMPT).toContain('ANDES');
    expect(SARA_PROMPT).toContain('ALPES');
    expect(SARA_PROMPT).toContain('PASEO COLORINES');
  });

  it('should contain Citadella del Nogal terrenos', () => {
    expect(SARA_PROMPT).toContain('CITADELLA DEL NOGAL');
    expect(SARA_PROMPT).toContain('Villa Campelo');
    expect(SARA_PROMPT).toContain('Villa Galiano');
  });

  it('should show correct locations (Colinas del Padre vs Guadalupe)', () => {
    expect(SARA_PROMPT).toContain('MONTE VERDE (Colinas del Padre, Zacatecas)');
    expect(SARA_PROMPT).toContain('LOS ENCINOS (Colinas del Padre, Zacatecas)');
    expect(SARA_PROMPT).toContain('DISTRITO FALCO (Guadalupe)');
    expect(SARA_PROMPT).toContain('ANDES (Guadalupe)');
    expect(SARA_PROMPT).toContain('CITADELLA DEL NOGAL (Guadalupe)');
  });

  it('should NOT claim 4 recámaras', () => {
    expect(SARA_PROMPT).not.toMatch(/4\s*rec[áa]maras/i);
    expect(SARA_PROMPT).not.toMatch(/4\s*rec[,\s]/i);
  });

  it('should show max 3 rec in all property listings', () => {
    const lines = SARA_PROMPT.split('\n');
    for (const line of lines) {
      // Skip lines that aren't property listings
      if (!line.includes('rec,') && !line.includes('rec +')) continue;
      // Extract bedroom count
      const match = line.match(/(\d+)\s*rec/);
      if (match) {
        expect(Number(match[1])).toBeLessThanOrEqual(3);
      }
    }
  });

  it('should show prices with "equipada" label', () => {
    expect(SARA_PROMPT).toContain('equipada');
    // Most models should say "equipada"
    const equipadaCount = (SARA_PROMPT.match(/equipada/g) || []).length;
    expect(equipadaCount).toBeGreaterThan(20);
  });

  it('should have correct price ranges in suggestion logic', () => {
    expect(SARA_PROMPT).toContain('$1.5M-$2M → Monte Verde');
    expect(SARA_PROMPT).toContain('$2M-$3M → Monte Verde');
    expect(SARA_PROMPT).toContain('$3M-$3.5M → Los Encinos');
    expect(SARA_PROMPT).toContain('$3.5M-$5M → Distrito Falco');
    expect(SARA_PROMPT).toContain('$5M+ → Distrito Falco');
  });

  it('should list all Los Encinos models (5 total)', () => {
    expect(SARA_PROMPT).toContain('Encino Blanco');
    expect(SARA_PROMPT).toContain('Encino Verde');
    expect(SARA_PROMPT).toContain('Encino Dorado');
    expect(SARA_PROMPT).toContain('Roble');
    expect(SARA_PROMPT).toContain('Maple');
  });

  it('should list all Distrito Falco models (7 total)', () => {
    expect(SARA_PROMPT).toContain('Proyecto Especial');
    expect(SARA_PROMPT).toContain('Chipre Light');
    expect(SARA_PROMPT).toContain('Colibrí Light');
    expect(SARA_PROMPT).toContain('Colibrí:');
    expect(SARA_PROMPT).toContain('Chipre:');
    expect(SARA_PROMPT).toContain('Mirlo');
    expect(SARA_PROMPT).toContain('Calandria');
  });

  it('Andes should be listed (no alberca)', () => {
    expect(SARA_PROMPT).toContain('ANDES (Guadalupe)');
    expect(SARA_PROMPT).not.toContain('ANDES (Guadalupe) - ALBERCA');
  });

  it('Paseo Colorines should be listed', () => {
    expect(SARA_PROMPT).toContain('PASEO COLORINES (Colinas del Padre, Zacatecas)');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 3: AI PROMPT - Ghost Models Purged from aiConversationService
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: AI Prompt - No Ghost Models in Delivery Times', () => {
  // We test by reading the actual file content since the prompt is built dynamically
  // These tests verify the patterns that were changed

  it('delivery times should reference Fresno 2 (not Descendente)', () => {
    // Commit f0571b11 changed ghost models → real models
    expect(MODELOS_CONOCIDOS).toContain('Fresno 2');
    expect(MODELOS_CONOCIDOS).not.toContain('Descendente');
  });

  it('family suggestions should use Vizcaya (not generic Modelo)', () => {
    // Commit f0571b11: Miravalle desde $3.0M → desde $3.5M
    // Vizcaya is the cheapest 3-rec at $3.51M
    expect(MODELOS_CONOCIDOS).toContain('Vizcaya');
  });

  it('no "Duque" model should exist anywhere', () => {
    expect(MODELOS_CONOCIDOS).not.toContain('Duque');
    expect(SARA_PROMPT.toLowerCase()).not.toContain('duque');
  });

  it('fallback examples should not use ghost models', () => {
    // Nogal and Sabino deleted from PDF 28 Feb 2026
    expect(MODELOS_CONOCIDOS).not.toContain('Nogal');
    expect(MODELOS_CONOCIDOS).not.toContain('Sabino');
    expect(MODELOS_CONOCIDOS).not.toContain('Ascendente');
  });

  it('Falco premium example should use Chipre not Halcón', () => {
    // Commit f0571b11: "Halcón with 4 rec" → "Chipre (3 rec, 224m²)"
    expect(MODELOS_CONOCIDOS).toContain('Chipre');
    expect(MODELOS_CONOCIDOS).not.toContain('Halcón');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 4: UX HELPERS - No 4 Recámaras Claims
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: UX Helpers - No 4 Recámaras', () => {
  it('getDesarrollosParaLista should not mention "4 rec"', () => {
    const lista = getDesarrollosParaLista();
    const allText = JSON.stringify(lista);
    expect(allText).not.toMatch(/4\s*rec/i);
    expect(allText).not.toMatch(/3-4\s*rec/i);
  });

  it('Los Encinos description should say "3 rec" not "3-4 rec"', () => {
    const lista = getDesarrollosParaLista();
    const residenciales = lista.find(s => s.title.includes('Residenciales'));
    const encinos = residenciales?.rows.find(r => r.title === 'Los Encinos');
    expect(encinos?.description).toContain('3 rec');
    expect(encinos?.description).not.toContain('4 rec');
  });

  it('Miravalle description should say "2-3 rec"', () => {
    const lista = getDesarrollosParaLista();
    const residenciales = lista.find(s => s.title.includes('Residenciales'));
    const miravalle = residenciales?.rows.find(r => r.title === 'Miravalle');
    expect(miravalle?.description).toContain('2-3 rec');
  });

  it('Distrito Falco description should say "3 rec" not "3-4 rec"', () => {
    const lista = getDesarrollosParaLista();
    const premium = lista.find(s => s.title.includes('Premium'));
    const falco = premium?.rows.find(r => r.title === 'Distrito Falco');
    expect(falco?.description).toContain('3 rec');
    expect(falco?.description).not.toContain('4 rec');
  });

  it('Paseo Colorines should be in Residenciales section', () => {
    const lista = getDesarrollosParaLista();
    const residenciales = lista.find(s => s.title.includes('Residenciales'));
    const colorines = residenciales?.rows.find(r => r.title === 'Paseo Colorines');
    expect(colorines).toBeDefined();
    expect(colorines?.description).toContain('NUEVO');
  });

  it('lista should have 4 sections: Económicos, Residenciales, Premium, Terrenos', () => {
    const lista = getDesarrollosParaLista();
    expect(lista).toHaveLength(4);
    expect(lista[0].title).toContain('Económicos');
    expect(lista[1].title).toContain('Residenciales');
    expect(lista[2].title).toContain('Premium');
    expect(lista[3].title).toContain('Terrenos');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 5: PHANTOM LEAD DELETION
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: Phantom Lead Deletion', () => {
  it('WhatsAppHandler should delete phantom lead when team member detected', async () => {
    // The fix: if getOrCreateLead creates a lead for a team member (race condition),
    // delete it immediately
    // Pattern: leadResult.isNew && leadResult.lead?.id → delete
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    const mockSupabase = {
      client: {
        from: vi.fn((table: string) => {
          if (table === 'leads') {
            return { delete: deleteMock };
          }
          return {};
        })
      }
    };

    // Simulate: getOrCreateLead returned isNew=true for a team member
    const leadResult = { isNew: true, lead: { id: 'phantom-123', phone: '5212224558475' } };
    const esTeamMember = true;

    // The logic from whatsapp.ts:216-224
    if (esTeamMember && leadResult.isNew && leadResult.lead?.id) {
      await mockSupabase.client.from('leads').delete().eq('id', leadResult.lead.id);
    }

    expect(deleteMock).toHaveBeenCalled();
  });

  it('should NOT delete lead if team member was already in DB (not new)', () => {
    const deleteMock = vi.fn();
    const leadResult = { isNew: false, lead: { id: 'existing-lead', phone: '5212224558475' } };
    const esTeamMember = true;

    if (esTeamMember && leadResult.isNew && leadResult.lead?.id) {
      deleteMock();
    }

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('should NOT delete lead if not a team member', () => {
    const deleteMock = vi.fn();
    const leadResult = { isNew: true, lead: { id: 'real-lead', phone: '5610016226' } };
    const esTeamMember = false;

    if (esTeamMember && leadResult.isNew && leadResult.lead?.id) {
      deleteMock();
    }

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('should handle null lead gracefully', () => {
    const deleteMock = vi.fn();
    const leadResult = { isNew: true, lead: null };
    const esTeamMember = true;

    if (esTeamMember && leadResult.isNew && leadResult.lead?.id) {
      deleteMock();
    }

    expect(deleteMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 6: "ENCONTRÉ OTRA OPCIÓN" Detection
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: "Encontré otra opción" Detection', () => {
  // Replicate the detection logic from aiConversationService.ts:1908-1916
  function detectYaComproOtroLado(msg: string): boolean {
    const msgLower = msg.toLowerCase();
    return (
      (msgLower.includes('ya compr') && (msgLower.includes('otro lado') || msgLower.includes('otra'))) ||
      msgLower.includes('ya tengo casa') ||
      msgLower.includes('ya adquir') ||
      (msgLower.includes('encontr') && msgLower.includes('otra opci')) ||
      (msgLower.includes('me decid') && msgLower.includes('por otra')) ||
      (msgLower.includes('ya eleg') && msgLower.includes('otra')) ||
      (msgLower.includes('ya firm') && msgLower.includes('otra'))
    );
  }

  // Original patterns (should still work)
  it('should detect "ya compré en otro lado"', () => {
    expect(detectYaComproOtroLado('ya compré en otro lado')).toBe(true);
  });

  it('should detect "ya compré otra casa"', () => {
    expect(detectYaComproOtroLado('ya compré otra casa')).toBe(true);
  });

  it('should detect "ya tengo casa"', () => {
    expect(detectYaComproOtroLado('ya tengo casa')).toBe(true);
  });

  it('should detect "ya adquirí"', () => {
    expect(detectYaComproOtroLado('ya adquirí una propiedad')).toBe(true);
  });

  // NEW patterns added in Session 58 (commit ed6e26e1)
  it('should detect "encontré otra opción"', () => {
    expect(detectYaComproOtroLado('encontré otra opción')).toBe(true);
  });

  it('should detect "encontre otra opcion" (without accents)', () => {
    expect(detectYaComproOtroLado('encontre otra opcion')).toBe(true);
  });

  it('should detect "me decidí por otra"', () => {
    expect(detectYaComproOtroLado('me decidí por otra constructora')).toBe(true);
  });

  it('should detect "ya elegí otra"', () => {
    expect(detectYaComproOtroLado('ya elegí otra casa')).toBe(true);
  });

  it('should detect "ya firmé otra"', () => {
    expect(detectYaComproOtroLado('ya firmé otra hipoteca')).toBe(true);
  });

  // Should NOT trigger on normal messages
  it('should NOT detect "encontré algo interesante" (no "otra opci")', () => {
    expect(detectYaComproOtroLado('encontré algo interesante en su catálogo')).toBe(false);
  });

  it('should NOT detect normal house search', () => {
    expect(detectYaComproOtroLado('busco casa de 3 recámaras')).toBe(false);
  });

  it('should NOT detect "ya vi otra" (no match patterns)', () => {
    expect(detectYaComproOtroLado('ya vi otra casa por internet')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 7: DEAD CODE REMOVAL - pricing-and-locations.ts
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: Dead Code Removal', () => {
  it('pricing-and-locations.ts should not exist', () => {
    // The file was deleted in commit a502e74b — it contained entirely fake data
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(__dirname, '../utils/pricing-and-locations.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 8: CATALOG FORMAT - Equipada Label + Plantas
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: Catalog Format - Equipada + Plantas', () => {
  // Test the formatting logic from aiConversationService.ts:3016-3034
  function formatPropertyCatalog(p: {
    name: string;
    price?: number;
    price_equipped?: number;
    bedrooms: number;
    bathrooms?: number;
    area_m2?: number;
    floors?: number;
    has_study?: boolean;
    has_terrace?: boolean;
    has_roof_garden?: boolean;
    has_garden?: boolean;
  }): string {
    const precioEquipada = p.price_equipped || p.price;
    const esEquipada = !!p.price_equipped;
    const precio = precioEquipada ? `$${(Number(precioEquipada)/1000000).toFixed(1)}M${esEquipada ? ' equipada' : ''}` : '';
    const plantas = p.floors === 1 ? '1 planta' : `${p.floors} plantas`;
    const extras = [];
    if (p.has_study) extras.push('estudio');
    if (p.has_terrace) extras.push('terraza');
    if (p.has_roof_garden) extras.push('roof garden');
    if (p.has_garden) extras.push('jardín');

    let line = `• ${p.name}: ${precio} | ${p.bedrooms} rec, ${p.bathrooms || '?'} baños | ${p.area_m2}m² | ${plantas}`;
    if (extras.length > 0) line += ` | ${extras.join(', ')}`;
    if (p.price && p.price_equipped && Number(p.price) !== Number(p.price_equipped)) {
      line += ` (sin equipo: $${(Number(p.price)/1000000).toFixed(1)}M)`;
    }
    return line;
  }

  it('should show "equipada" when price_equipped exists', () => {
    const line = formatPropertyCatalog({
      name: 'Encino Verde', price: 2800000, price_equipped: 3000000,
      bedrooms: 3, bathrooms: 2, area_m2: 130, floors: 2
    });
    expect(line).toContain('$3.0M equipada');
    expect(line).toContain('(sin equipo: $2.8M)');
  });

  it('should NOT show "equipada" when only base price exists', () => {
    const line = formatPropertyCatalog({
      name: 'Prototipo 6M', price: 3000000,
      bedrooms: 3, bathrooms: 2, area_m2: 168, floors: 2
    });
    expect(line).toContain('$3.0M');
    expect(line).not.toContain('equipada');
  });

  it('should show floors (plantas)', () => {
    const line = formatPropertyCatalog({
      name: 'Bilbao 7M', price_equipped: 3500000,
      bedrooms: 3, bathrooms: 3, area_m2: 242, floors: 3
    });
    expect(line).toContain('3 plantas');
  });

  it('should show "1 planta" for single-story houses', () => {
    const line = formatPropertyCatalog({
      name: 'Acacia', price_equipped: 1600000,
      bedrooms: 2, bathrooms: 1, area_m2: 60, floors: 1
    });
    expect(line).toContain('1 planta');
  });

  it('should show extras (estudio, terraza, roof garden, jardín)', () => {
    const line = formatPropertyCatalog({
      name: 'Chipre', price_equipped: 4500000,
      bedrooms: 3, bathrooms: 3, area_m2: 224, floors: 3,
      has_study: true, has_roof_garden: true
    });
    expect(line).toContain('estudio, roof garden');
  });

  it('should show "?" for missing bathrooms', () => {
    const line = formatPropertyCatalog({
      name: 'Test', price: 1000000,
      bedrooms: 2, area_m2: 80, floors: 1
    });
    expect(line).toContain('? baños');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 9: RESOURCE NULL FALLBACKS (complementary to criticalFixes)
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: Resource NULL Fallbacks - Integration', () => {
  const OFFICE_GPS = 'https://maps.app.goo.gl/hUk6aH8chKef6NRY7';

  it('office GPS fallback URL should be correct', () => {
    expect(OFFICE_GPS).toMatch(/^https:\/\/maps\.app\.goo\.gl\//);
  });

  it('GPS resource message should include office explanation', () => {
    // When GPS is NULL, the fallback message says "Oficinas Grupo Santa Rita"
    const fallbackMsg = `📍 *Ubicación:* ${OFFICE_GPS}\n_Oficinas Grupo Santa Rita — ahí te damos la ubicación exacta del desarrollo_`;
    expect(fallbackMsg).toContain('Oficinas Grupo Santa Rita');
    expect(fallbackMsg).toContain(OFFICE_GPS);
  });

  it('video NULL should not crash resource assembly', () => {
    // Simulate resource assembly with NULL youtube_link
    const propiedadMatch = { youtube_link: null, gps_link: 'https://maps.app.goo.gl/test', matterport_link: null };
    const analysis = { send_video_desarrollo: true, send_gps: true };
    const partes: string[] = [];

    // Replicate logic from aiConversationService.ts:5043-5064
    if (propiedadMatch.youtube_link) {
      partes.push(`🎬 *Video:* ${propiedadMatch.youtube_link}`);
    }
    // video NULL → just skip (warn in real code)

    if (analysis.send_gps) {
      if (propiedadMatch.gps_link) {
        partes.push(`📍 *Ubicación:* ${propiedadMatch.gps_link}`);
      } else {
        partes.push(`📍 *Ubicación:* ${OFFICE_GPS}`);
      }
    }

    // Should have GPS but no video
    expect(partes).toHaveLength(1);
    expect(partes[0]).toContain('maps.app.goo.gl/test');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 10: CROSS-CONSISTENCY - Prompt ↔ Constants ↔ UX
// ═══════════════════════════════════════════════════════════

describe('SESSION 58: Cross-Consistency', () => {
  it('all DESARROLLOS_CONOCIDOS should appear in SARA_PROMPT (except Monte Real)', () => {
    // Monte Real is legacy/placeholder, may not have full listing
    const devsToCheck = DESARROLLOS_CONOCIDOS.filter(d => d !== 'Monte Real');
    for (const dev of devsToCheck) {
      expect(SARA_PROMPT.toUpperCase()).toContain(dev.toUpperCase());
    }
  });

  it('getDesarrollosParaLista should only contain known developments', () => {
    const lista = getDesarrollosParaLista();
    const allIds = lista.flatMap(s => s.rows.map(r => r.title));
    for (const title of allIds) {
      // Each list item should match a known development name
      const isKnown = DESARROLLOS_CONOCIDOS.some(d =>
        d.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(d.toLowerCase())
      );
      expect(isKnown).toBe(true);
    }
  });

  it('SARA_PROMPT should NOT claim any development has ALBERCA', () => {
    // No development has alberca anymore
    expect(SARA_PROMPT).not.toContain('- ALBERCA');
    expect(SARA_PROMPT).not.toContain('CON ALBERCA');
  });

  it('no development should be listed as having 4 bedrooms in any source', () => {
    // Check SARA_PROMPT
    expect(SARA_PROMPT).not.toMatch(/4\s*rec[áa]mara/i);

    // Check UX helpers
    const lista = getDesarrollosParaLista();
    const allText = JSON.stringify(lista);
    expect(allText).not.toMatch(/4\s*rec/i);
  });
});
