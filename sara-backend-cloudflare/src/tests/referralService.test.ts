import { describe, it, expect, vi } from 'vitest';
import { ReferralService } from '../services/referralService';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

function createMockReferredLeads() {
  return [
    {
      id: 'ref-1', name: 'Referido Uno', phone: '5211111111111', status: 'sold',
      referred_by: 'referrer-1', property_interest: 'Monte Verde', assigned_to: 'vendor-1',
      notes: { referido_por: 'Carlos' }, created_at: new Date().toISOString(), budget: 2000000
    },
    {
      id: 'ref-2', name: 'Referido Dos', phone: '5212222222222', status: 'contacted',
      referred_by: 'referrer-1', property_interest: 'Distrito Falco', assigned_to: 'vendor-2',
      notes: { referido_por: 'Carlos' }, created_at: new Date().toISOString(), budget: 3500000
    },
    {
      id: 'ref-3', name: 'Referido Tres', phone: '5213333333333', status: 'lost',
      referred_by: 'referrer-2', property_interest: 'Monte Verde', assigned_to: 'vendor-1',
      notes: { referido_por: 'María' }, created_at: new Date().toISOString(), budget: 1500000
    },
    {
      id: 'ref-4', name: 'Referido Cuatro', phone: '5214444444444', status: 'delivered',
      referred_by: 'referrer-1', property_interest: 'Los Encinos', assigned_to: 'vendor-1',
      notes: { referido_por: 'Carlos' }, created_at: new Date().toISOString(), budget: 3000000
    },
  ];
}

function createMockReferrers() {
  return [
    { id: 'referrer-1', name: 'Carlos García', phone: '5215551111111' },
    { id: 'referrer-2', name: 'María López', phone: '5215552222222' },
  ];
}

function createMockTeamMembers() {
  return [
    { id: 'vendor-1', name: 'Javier Frausto' },
    { id: 'vendor-2', name: 'Karla Muedano' },
  ];
}

function createMockSupabase(referred: any[] = [], referrers: any[] = [], teamMembers: any[] = []) {
  return {
    client: {
      from: (table: string) => {
        if (table === 'leads') {
          return {
            select: (fields?: string) => ({
              not: () => ({
                data: referred,
                error: null,
                gte: () => ({
                  order: () => ({ data: referred, error: null })
                })
              }),
              ilike: () => ({
                in: () => ({
                  limit: () => ({ data: referrers.length > 0 ? [referrers[0]] : [], error: null })
                })
              }),
              like: () => ({
                maybeSingle: () => ({ data: null, error: null })
              }),
              in: (field: string, ids: string[]) => ({
                data: referrers.filter(r => ids.includes(r.id)),
                error: null
              }),
              eq: (field: string, val: string) => {
                if (field === 'referred_by') {
                  return { data: referred.filter(r => r.referred_by === val), error: null };
                }
                if (field === 'id') {
                  const all = [...referred, ...referrers];
                  return {
                    maybeSingle: () => ({ data: all.find(l => l.id === val) || null, error: null })
                  };
                }
                return { data: [], error: null, maybeSingle: () => ({ data: null, error: null }) };
              }
            }),
            insert: () => ({
              select: () => ({
                single: () => ({ data: { id: 'new-lead-1', name: 'Nuevo Referido' }, error: null })
              })
            }),
            update: () => ({
              eq: () => ({ data: null, error: null })
            })
          };
        }
        if (table === 'team_members') {
          return {
            select: () => ({ data: teamMembers, error: null })
          };
        }
        return {
          select: () => ({
            eq: () => ({ data: null, error: null }),
            not: () => ({ data: [], error: null })
          })
        };
      }
    }
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ReferralService', () => {
  // ─── getTier ────────────────────────────────────────────────────────────
  describe('getTier', () => {
    it('should return bronce for 1-2 conversions', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      expect(service.getTier(1).tier).toBe('bronce');
      expect(service.getTier(2).tier).toBe('bronce');
    });

    it('should return plata for 3-5 conversions', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      expect(service.getTier(3).tier).toBe('plata');
      expect(service.getTier(5).tier).toBe('plata');
    });

    it('should return oro for 6-9 conversions', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      expect(service.getTier(6).tier).toBe('oro');
      expect(service.getTier(9).tier).toBe('oro');
    });

    it('should return diamante for 10+ conversions', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      expect(service.getTier(10).tier).toBe('diamante');
      expect(service.getTier(50).tier).toBe('diamante');
    });

    it('should return bronce for 0 conversions (fallback)', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      expect(service.getTier(0).tier).toBe('bronce');
    });

    it('should have increasing reward percentages', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      const bronce = service.getTier(1);
      const plata = service.getTier(3);
      const oro = service.getTier(6);
      const diamante = service.getTier(10);
      expect(bronce.reward_pct).toBeLessThan(plata.reward_pct);
      expect(plata.reward_pct).toBeLessThan(oro.reward_pct);
      expect(oro.reward_pct).toBeLessThan(diamante.reward_pct);
    });
  });

  // ─── generateReferralCode ──────────────────────────────────────────────
  describe('generateReferralCode', () => {
    it('should generate a slug-based code', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      const code = service.generateReferralCode('Carlos García');
      expect(code).toMatch(/^carlos-garcia-[a-z0-9]{4}$/);
    });

    it('should handle accented characters', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      const code = service.generateReferralCode('José María Ñoño');
      expect(code).toMatch(/^jose-maria-nono-[a-z0-9]{4}$/);
    });

    it('should truncate long names', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      const code = service.generateReferralCode('A Very Long Name That Exceeds Twenty Characters');
      // Slug part should be max 20 chars
      const slug = code.split('-').slice(0, -1).join('-');
      expect(slug.length).toBeLessThanOrEqual(20);
    });

    it('should generate unique codes', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);
      const code1 = service.generateReferralCode('Carlos');
      const code2 = service.generateReferralCode('Carlos');
      expect(code1).not.toBe(code2); // Random suffix differs
    });
  });

  // ─── getReferralStats ──────────────────────────────────────────────────
  describe('getReferralStats', () => {
    it('should return stats with correct counts', async () => {
      const referred = createMockReferredLeads();
      const referrers = createMockReferrers();
      const teamMembers = createMockTeamMembers();
      const supabase = createMockSupabase(referred, referrers, teamMembers);
      const service = new ReferralService(supabase);

      const stats = await service.getReferralStats(90);

      expect(stats.periodo).toBe('Últimos 90 días');
      expect(stats.dias).toBe(90);
      expect(stats.total_referidos).toBe(4);
      // sold + delivered = 2 converted
      expect(stats.referidos_convertidos).toBe(2);
      // contacted = 1 in process
      expect(stats.referidos_en_proceso).toBe(1);
      // lost = 1
      expect(stats.referidos_perdidos).toBe(1);
    });

    it('should calculate conversion rate', async () => {
      const referred = createMockReferredLeads();
      const supabase = createMockSupabase(referred, createMockReferrers(), createMockTeamMembers());
      const service = new ReferralService(supabase);

      const stats = await service.getReferralStats(90);
      // 2/4 = 50%
      expect(stats.tasa_conversion).toBe(50);
    });

    it('should calculate revenue from converted leads', async () => {
      const referred = createMockReferredLeads();
      const supabase = createMockSupabase(referred, createMockReferrers(), createMockTeamMembers());
      const service = new ReferralService(supabase);

      const stats = await service.getReferralStats(90);
      // ref-1 (sold, 2M) + ref-4 (delivered, 3M) = 5M
      expect(stats.ingreso_generado).toBe(5000000);
    });

    it('should return top referrers sorted by conversions', async () => {
      const referred = createMockReferredLeads();
      const supabase = createMockSupabase(referred, createMockReferrers(), createMockTeamMembers());
      const service = new ReferralService(supabase);

      const stats = await service.getReferralStats(90);
      expect(stats.top_referidores.length).toBeGreaterThan(0);
      // referrer-1 has 3 referrals (2 converted), referrer-2 has 1 (0 converted)
      expect(stats.top_referidores[0].name).toBe('Carlos García');
      expect(stats.top_referidores[0].referidos_totales).toBe(3);
      expect(stats.top_referidores[0].referidos_convertidos).toBe(2);
    });

    it('should group stats by development', async () => {
      const referred = createMockReferredLeads();
      const supabase = createMockSupabase(referred, createMockReferrers(), createMockTeamMembers());
      const service = new ReferralService(supabase);

      const stats = await service.getReferralStats(90);
      expect(stats.por_desarrollo.length).toBeGreaterThan(0);
      const mv = stats.por_desarrollo.find(d => d.desarrollo === 'Monte Verde');
      expect(mv).toBeDefined();
      expect(mv!.referidos).toBe(2);
    });

    it('should return empty stats when no referrals', async () => {
      const supabase = createMockSupabase([], [], []);
      const service = new ReferralService(supabase);

      const stats = await service.getReferralStats(90);
      expect(stats.total_referidos).toBe(0);
      expect(stats.referidos_convertidos).toBe(0);
      expect(stats.tasa_conversion).toBe(0);
      expect(stats.top_referidores).toEqual([]);
    });
  });

  // ─── getReferralRecords ────────────────────────────────────────────────
  describe('getReferralRecords', () => {
    it('should return referral records', async () => {
      const referred = createMockReferredLeads();
      const supabase = createMockSupabase(referred, createMockReferrers(), createMockTeamMembers());
      const service = new ReferralService(supabase);

      const records = await service.getReferralRecords(90);
      expect(records.length).toBe(4);
      expect(records[0].referrer_name).toBeDefined();
      expect(records[0].referred_name).toBeDefined();
    });

    it('should mark converted_at for sold/closed/delivered/reserved', async () => {
      const referred = createMockReferredLeads();
      const supabase = createMockSupabase(referred, createMockReferrers(), createMockTeamMembers());
      const service = new ReferralService(supabase);

      const records = await service.getReferralRecords(90);
      const sold = records.find(r => r.status === 'sold');
      const contacted = records.find(r => r.status === 'contacted');
      expect(sold?.converted_at).toBeTruthy();
      expect(contacted?.converted_at).toBeNull();
    });

    it('should return empty array when no referrals', async () => {
      const supabase = createMockSupabase([], [], []);
      const service = new ReferralService(supabase);

      const records = await service.getReferralRecords(90);
      expect(records).toEqual([]);
    });
  });

  // ─── checkAndNotifyReferrerConversion ──────────────────────────────────
  describe('checkAndNotifyReferrerConversion', () => {
    it('should return null if lead has no referrer', async () => {
      const supabase = createMockSupabase();
      // Override eq for this test
      supabase.client.from = (table: string) => ({
        select: () => ({
          eq: (_f: string, _v: string) => ({
            maybeSingle: () => ({ data: { id: 'lead-1', status: 'sold', referred_by: null }, error: null })
          })
        })
      }) as any;

      const service = new ReferralService(supabase);
      const result = await service.checkAndNotifyReferrerConversion('lead-1');
      expect(result).toBeNull();
    });

    it('should return notification for converted referral', async () => {
      const referred = createMockReferredLeads();
      const referrers = createMockReferrers();
      const supabase = createMockSupabase(referred, referrers, []);

      // Make eq return the lead, then the referrer
      let eqCallCount = 0;
      const origFrom = supabase.client.from.bind(supabase.client);
      supabase.client.from = (table: string) => {
        if (table === 'leads') {
          return {
            select: () => ({
              eq: (field: string, val: string) => {
                eqCallCount++;
                if (eqCallCount === 1) {
                  // First call: get the lead
                  return {
                    maybeSingle: () => ({ data: { id: 'ref-1', name: 'Referido Uno', referred_by: 'referrer-1', status: 'sold', property_interest: 'Monte Verde', budget: 2000000 }, error: null })
                  };
                }
                if (eqCallCount === 2) {
                  // Second call: get the referrer
                  return {
                    maybeSingle: () => ({ data: { id: 'referrer-1', name: 'Carlos García', phone: '5215551111111', notes: {} }, error: null })
                  };
                }
                if (field === 'referred_by') {
                  return { data: referred.filter(r => r.referred_by === val), error: null };
                }
                return { data: [], error: null, maybeSingle: () => ({ data: null, error: null }) };
              },
              not: () => ({ data: referred, error: null })
            }),
            update: () => ({
              eq: () => ({ data: null, error: null })
            })
          };
        }
        return origFrom(table);
      };

      const service = new ReferralService(supabase);
      const result = await service.checkAndNotifyReferrerConversion('ref-1');

      expect(result).not.toBeNull();
      expect(result!.referrerName).toBe('Carlos García');
      expect(result!.message).toContain('Referido');
      expect(result!.message).toContain('cerrar');
    });
  });

  // ─── formatStatsForWhatsApp ────────────────────────────────────────────
  describe('formatStatsForWhatsApp', () => {
    it('should format stats with summary', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);

      const stats = {
        periodo: 'Últimos 90 días',
        dias: 90,
        total_referidos: 10,
        referidos_convertidos: 4,
        referidos_en_proceso: 3,
        referidos_perdidos: 3,
        tasa_conversion: 40,
        ingreso_generado: 8000000,
        top_referidores: [
          { id: '1', name: 'Carlos', phone: '521...', referidos_totales: 5, referidos_convertidos: 3, ingreso_generado: 6000000, tier: 'plata' as const, incentivo_estimado: 30000 }
        ],
        por_desarrollo: [
          { desarrollo: 'Monte Verde', referidos: 6, convertidos: 3, tasa: 50 }
        ],
        por_vendedor: [
          { vendor_id: 'v1', vendor_name: 'Javier', referidos_recibidos: 5, convertidos: 2, tasa: 40 }
        ],
        incentivos_estimados: 30000
      };

      const msg = service.formatStatsForWhatsApp(stats);
      expect(msg).toContain('PROGRAMA DE REFERIDOS');
      expect(msg).toContain('Total referidos: *10*');
      expect(msg).toContain('Convertidos: *4*');
      expect(msg).toContain('40%');
      expect(msg).toContain('$8.0M');
      expect(msg).toContain('Carlos');
      expect(msg).toContain('Monte Verde');
      expect(msg).toContain('Niveles de Referidor');
    });

    it('should handle empty stats', () => {
      const supabase = createMockSupabase();
      const service = new ReferralService(supabase);

      const stats = {
        periodo: 'Últimos 90 días',
        dias: 90,
        total_referidos: 0,
        referidos_convertidos: 0,
        referidos_en_proceso: 0,
        referidos_perdidos: 0,
        tasa_conversion: 0,
        ingreso_generado: 0,
        top_referidores: [],
        por_desarrollo: [],
        por_vendedor: [],
        incentivos_estimados: 0
      };

      const msg = service.formatStatsForWhatsApp(stats);
      expect(msg).toContain('PROGRAMA DE REFERIDOS');
      expect(msg).toContain('Total referidos: *0*');
    });
  });

  // ─── CEO Command Detection ─────────────────────────────────────────────
  describe('CEO Command Detection', () => {
    async function createCEOService() {
      const supabase = createMockSupabase([], [], []);
      const { CEOCommandsService } = await import('../services/ceoCommandsService');
      return new CEOCommandsService(supabase);
    }

    it('should detect "programa referidos"', async () => {
      const service = await createCEOService();
      const result = service.detectCommand('programa referidos');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('referralProgram');
    });

    it('should detect "referidos programa"', async () => {
      const service = await createCEOService();
      const result = service.detectCommand('referidos programa');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('referralProgram');
    });

    it('should detect "programa de referidos"', async () => {
      const service = await createCEOService();
      const result = service.detectCommand('programa de referidos');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('referralProgram');
    });

    it('should detect "referral"', async () => {
      const service = await createCEOService();
      const result = service.detectCommand('referral');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('referralProgram');
    });

    it('should detect "referrals"', async () => {
      const service = await createCEOService();
      const result = service.detectCommand('referrals');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('referralProgram');
    });

    it('should keep "referidos" for CLV (not referral program)', async () => {
      const service = await createCEOService();
      const result = service.detectCommand('referidos');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('valorCliente');
    });

    it('should keep "clv" for CLV', async () => {
      const service = await createCEOService();
      const result = service.detectCommand('clv');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('valorCliente');
    });
  });
});
