// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE TESTS — Prevent recurring bugs
// Tests for the 3 categories of bugs that keep coming back:
//   1. Model confused with Development
//   2. Carousel + Resources redundancy
//   3. 24h window violations
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  isDevelopment, isModel, resolveToDevelopment,
  extractDevelopmentsFromText, getModelDevelopment,
  getAllDevelopmentNames, getAllModelNames, getDevelopmentInfo,
  DEVELOPMENTS,
} from '../constants/developments';
import { MessagePipeline } from '../services/messagePipeline';

// ═══════════════════════════════════════════════════════════════════════════
// 1. DEVELOPMENT VS MODEL — Never confuse them again
// ═══════════════════════════════════════════════════════════════════════════
describe('Development vs Model Registry', () => {
  describe('isDevelopment()', () => {
    it('should recognize all 9 developments', () => {
      const devNames = [
        'Monte Verde', 'Los Encinos', 'Miravalle', 'Paseo Colorines',
        'Andes', 'Alpes', 'Distrito Falco', 'Villa Campelo', 'Villa Galiano',
      ];
      for (const name of devNames) {
        expect(isDevelopment(name)).toBe(true);
      }
    });

    it('should be case-insensitive', () => {
      expect(isDevelopment('monte verde')).toBe(true);
      expect(isDevelopment('DISTRITO FALCO')).toBe(true);
      expect(isDevelopment('los encinos')).toBe(true);
    });

    it('should NOT recognize models as developments', () => {
      const modelNames = ['Chipre', 'Mirlo', 'Calandria', 'Laurel', 'Dalia', 'Acacia', 'Fresno', 'Maple', 'Roble'];
      for (const name of modelNames) {
        expect(isDevelopment(name)).toBe(false);
      }
    });
  });

  describe('isModel()', () => {
    it('should recognize model names', () => {
      expect(isModel('Chipre')).toBe(true);
      expect(isModel('Mirlo')).toBe(true);
      expect(isModel('Laurel')).toBe(true);
      expect(isModel('Acacia')).toBe(true);
      expect(isModel('Encino Verde')).toBe(true);
    });

    it('should NOT recognize developments as models', () => {
      expect(isModel('Monte Verde')).toBe(false);
      expect(isModel('Distrito Falco')).toBe(false);
      expect(isModel('Andes')).toBe(false);
    });
  });

  describe('getModelDevelopment()', () => {
    it('should map Chipre → Distrito Falco', () => {
      expect(getModelDevelopment('Chipre')).toBe('Distrito Falco');
    });

    it('should map Mirlo → Distrito Falco', () => {
      expect(getModelDevelopment('Mirlo')).toBe('Distrito Falco');
    });

    it('should map Laurel → Andes', () => {
      expect(getModelDevelopment('Laurel')).toBe('Andes');
    });

    it('should map Acacia → Monte Verde', () => {
      expect(getModelDevelopment('Acacia')).toBe('Monte Verde');
    });

    it('should map Encino Verde → Los Encinos', () => {
      expect(getModelDevelopment('Encino Verde')).toBe('Los Encinos');
    });

    it('should return null for unknown names', () => {
      expect(getModelDevelopment('random')).toBeNull();
      expect(getModelDevelopment('Zacatecas')).toBeNull();
    });
  });

  describe('resolveToDevelopment()', () => {
    it('should resolve development names to themselves', () => {
      expect(resolveToDevelopment('Distrito Falco')).toBe('Distrito Falco');
      expect(resolveToDevelopment('Monte Verde')).toBe('Monte Verde');
    });

    it('should resolve model names to their parent development', () => {
      expect(resolveToDevelopment('Chipre')).toBe('Distrito Falco');
      expect(resolveToDevelopment('Chipre Light')).toBe('Distrito Falco');
      expect(resolveToDevelopment('Calandria')).toBe('Distrito Falco');
      expect(resolveToDevelopment('Laurel')).toBe('Andes');
      expect(resolveToDevelopment('Fresno')).toBe('Monte Verde');
      expect(resolveToDevelopment('Maple')).toBe('Los Encinos');
    });

    it('should return null for unknown names', () => {
      expect(resolveToDevelopment('Zacatecas')).toBeNull();
      expect(resolveToDevelopment('premium')).toBeNull();
      expect(resolveToDevelopment('')).toBeNull();
    });
  });

  describe('extractDevelopmentsFromText()', () => {
    it('should extract ONLY developments from transcript text', () => {
      const text = 'Me interesa Distrito Falco, el modelo Chipre es el más popular';
      const result = extractDevelopmentsFromText(text);
      expect(result).toContain('Distrito Falco');
      expect(result).not.toContain('Chipre'); // Chipre is a model, not a development
    });

    it('should extract multiple developments', () => {
      const text = 'Quiero comparar Monte Verde con Los Encinos';
      const result = extractDevelopmentsFromText(text);
      expect(result).toContain('Monte Verde');
      expect(result).toContain('Los Encinos');
      expect(result.length).toBe(2);
    });

    it('should handle Citadella/Nogal aliases', () => {
      const text = 'Me interesan los terrenos en Citadella del Nogal';
      const result = extractDevelopmentsFromText(text);
      expect(result).toContain('Villa Campelo');
      expect(result).toContain('Villa Galiano');
    });

    it('should handle Priv. Andes alias', () => {
      const text = 'Quiero ver Priv. Andes';
      const result = extractDevelopmentsFromText(text);
      expect(result).toContain('Andes');
    });

    it('should return empty for text without developments', () => {
      const text = 'Hola, quiero casas bonitas de lujo';
      const result = extractDevelopmentsFromText(text);
      expect(result.length).toBe(0);
    });

    it('should not return model names', () => {
      const text = 'Me gusta el Chipre y el Mirlo de Distrito Falco';
      const result = extractDevelopmentsFromText(text);
      expect(result).toEqual(['Distrito Falco']);
      // Chipre and Mirlo should NOT be in the result
    });
  });

  describe('Registry completeness', () => {
    it('should have 9 developments', () => {
      expect(getAllDevelopmentNames().length).toBe(9);
    });

    it('should have models for every development', () => {
      for (const [name, info] of Object.entries(DEVELOPMENTS)) {
        expect(info.models.length).toBeGreaterThan(0);
      }
    });

    it('should have zone for every development', () => {
      for (const [name, info] of Object.entries(DEVELOPMENTS)) {
        expect(['colinas_del_padre', 'guadalupe', 'citadella']).toContain(info.zone);
      }
    });

    it('should have NO development with alberca', () => {
      const withPool = Object.entries(DEVELOPMENTS)
        .filter(([_, info]) => info.amenities.includes('alberca'))
        .map(([name]) => name);
      expect(withPool).toEqual([]);
    });

    it('getDevelopmentInfo should return correct zone', () => {
      expect(getDevelopmentInfo('Monte Verde')?.zone).toBe('colinas_del_padre');
      expect(getDevelopmentInfo('Distrito Falco')?.zone).toBe('guadalupe');
      expect(getDevelopmentInfo('Villa Campelo')?.zone).toBe('citadella');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CAROUSEL + RESOURCES MUTUAL EXCLUSION
// ═══════════════════════════════════════════════════════════════════════════
describe('Carousel vs Resources Mutual Exclusion', () => {
  describe('MessagePipeline.shouldSendCarousel()', () => {
    it('should send carousel for general queries (no specific dev)', () => {
      expect(MessagePipeline.shouldSendCarousel('premium', null, false)).toBe(true);
      expect(MessagePipeline.shouldSendCarousel('economico', null, false)).toBe(true);
      expect(MessagePipeline.shouldSendCarousel('all', null, false)).toBe(true);
    });

    it('should NOT send carousel when specific dev + resources', () => {
      expect(MessagePipeline.shouldSendCarousel('premium', 'Distrito Falco', true)).toBe(false);
      expect(MessagePipeline.shouldSendCarousel('economico', 'Monte Verde', true)).toBe(false);
      expect(MessagePipeline.shouldSendCarousel('guadalupe', 'Andes', true)).toBe(false);
    });

    it('should send carousel when dev detected but NO resources', () => {
      // Edge case: dev detected in text but Claude didn't set send_video_desarrollo
      expect(MessagePipeline.shouldSendCarousel('premium', 'Distrito Falco', false)).toBe(true);
    });

    it('should return false when no carousel segment', () => {
      expect(MessagePipeline.shouldSendCarousel(null, null, false)).toBe(false);
      expect(MessagePipeline.shouldSendCarousel(undefined, null, false)).toBe(false);
      expect(MessagePipeline.shouldSendCarousel('', null, false)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 24H WINDOW CHECKS
// ═══════════════════════════════════════════════════════════════════════════
describe('24h Window Checks', () => {
  describe('MessagePipeline.isWindowOpen()', () => {
    it('should return true if message was < 24h ago', () => {
      const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1h ago
      expect(MessagePipeline.isWindowOpen(recentTime)).toBe(true);
    });

    it('should return false if message was > 24h ago', () => {
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
      expect(MessagePipeline.isWindowOpen(oldTime)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(MessagePipeline.isWindowOpen(null)).toBe(false);
      expect(MessagePipeline.isWindowOpen(undefined)).toBe(false);
      expect(MessagePipeline.isWindowOpen('')).toBe(false);
    });

    it('should return true at exactly 23h59m (edge case)', () => {
      const almostExpired = new Date(Date.now() - 23 * 60 * 60 * 1000 - 59 * 60 * 1000).toISOString();
      expect(MessagePipeline.isWindowOpen(almostExpired)).toBe(true);
    });

    it('should return false at exactly 24h01m (edge case)', () => {
      const justExpired = new Date(Date.now() - 24 * 60 * 60 * 1000 - 60 * 1000).toISOString();
      expect(MessagePipeline.isWindowOpen(justExpired)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. INTEGRATION SCENARIOS — Real-world bug reproductions
// ═══════════════════════════════════════════════════════════════════════════
describe('Integration: Bug Reproduction Prevention', () => {
  it('BUG #1: Chipre should NOT be treated as a development in transcript parsing', () => {
    const transcript = 'Agent: Distrito Falco tiene casas premium. User: Me gusta el Chipre. Agent: El Chipre es excelente.';
    const developments = extractDevelopmentsFromText(transcript);

    // Only Distrito Falco should be detected, NOT Chipre
    expect(developments).toEqual(['Distrito Falco']);

    // But resolveToDevelopment should know Chipre belongs to Distrito Falco
    expect(resolveToDevelopment('Chipre')).toBe('Distrito Falco');
  });

  it('BUG #2: Specific dev request should NOT get generic carousel', () => {
    // User says "info de Distrito Falco" → Claude sets send_carousel=premium AND send_video_desarrollo=true
    const shouldCarousel = MessagePipeline.shouldSendCarousel('premium', 'Distrito Falco', true);
    expect(shouldCarousel).toBe(false); // Should NOT send carousel
  });

  it('BUG #3: Free-form message to lead without 24h window should fail', () => {
    // Lead hasn't messaged in 48h
    const lastMsgAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(MessagePipeline.isWindowOpen(lastMsgAt)).toBe(false);
    // Must use template instead
  });

  it('BUG #4: All model names resolve to correct development', () => {
    // Every model in the system should resolve to a known development
    for (const [devName, info] of Object.entries(DEVELOPMENTS)) {
      for (const model of info.models) {
        const resolved = resolveToDevelopment(model);
        expect(resolved).toBe(devName);
      }
    }
  });

  it('BUG #5: "Casas de lujo" is general, should get carousel', () => {
    const developments = extractDevelopmentsFromText('quiero casas de lujo en zacatecas');
    expect(developments.length).toBe(0); // No specific development
    // So carousel SHOULD be sent
    const shouldCarousel = MessagePipeline.shouldSendCarousel('premium', null, false);
    expect(shouldCarousel).toBe(true);
  });

  it('BUG #6: Multiple developments in transcript should NOT be treated as specific', () => {
    const transcript = 'Hablamos de Monte Verde y Distrito Falco';
    const developments = extractDevelopmentsFromText(transcript);
    expect(developments.length).toBe(2);
    // With 2+ developments, it's a general request → carousel is OK
  });
});
