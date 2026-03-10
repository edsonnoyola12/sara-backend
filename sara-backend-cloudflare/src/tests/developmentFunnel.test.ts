import { describe, it, expect, vi } from 'vitest';
import { DevelopmentFunnelService } from '../services/developmentFunnelService';
import type { DevelopmentFunnel, DevelopmentComparison } from '../services/developmentFunnelService';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

function createMockLeads(statuses: string[], development: string = 'Monte Verde') {
  return statuses.map((status, i) => ({
    id: `lead-${i}`,
    name: `Lead ${i}`,
    status,
    assigned_to: i % 2 === 0 ? 'vendor-1' : 'vendor-2',
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    property_interest: development,
    notes: {}
  }));
}

function createMockSupabase(leads: any[] = [], vendors: any[] = [], properties: any[] = []) {
  return {
    client: {
      from: (table: string) => {
        if (table === 'leads') {
          return {
            select: () => ({
              ilike: () => ({
                gte: () => ({
                  order: () => ({ data: leads, error: null })
                })
              }),
              not: () => ({
                gte: () => ({ data: leads, error: null })
              })
            })
          };
        }
        if (table === 'team_members') {
          return {
            select: () => ({
              in: () => ({ data: vendors, error: null })
            })
          };
        }
        if (table === 'properties') {
          return {
            select: () => ({
              not: () => ({ data: properties, error: null })
            })
          };
        }
        return {
          select: () => ({
            eq: () => ({ data: null, error: null }),
            not: () => ({ data: [], error: null }),
            gte: () => ({ data: [], error: null })
          })
        };
      }
    }
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// getFunnel TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DevelopmentFunnelService.getFunnel', () => {
  it('should return funnel with correct counts for mixed statuses', async () => {
    const leads = createMockLeads([
      'new', 'contacted', 'scheduled', 'visited', 'negotiation', 'reserved', 'sold', 'lost', 'inactive'
    ]);
    const vendors = [
      { id: 'vendor-1', name: 'Vendedor A' },
      { id: 'vendor-2', name: 'Vendedor B' }
    ];
    const supabase = createMockSupabase(leads, vendors);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('Monte Verde');

    expect(result.development).toBe('Monte Verde');
    expect(result.period_days).toBe(90);
    expect(result.funnel.total).toBe(9);
    // contacted includes all that progressed past contact
    expect(result.funnel.contacted).toBe(6); // contacted, scheduled, visited, negotiation, reserved, sold
    expect(result.funnel.scheduled).toBe(5); // scheduled, visited, negotiation, reserved, sold
    expect(result.funnel.visited).toBe(4); // visited, negotiation, reserved, sold
    expect(result.funnel.negotiation).toBe(3); // negotiation, reserved, sold
    expect(result.funnel.reserved).toBe(2); // reserved, sold
    expect(result.funnel.sold).toBe(1); // sold
    expect(result.funnel.lost).toBe(2); // lost + inactive
  });

  it('should return empty funnel for no leads', async () => {
    const supabase = createMockSupabase([], []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('NonExistent');

    expect(result.funnel.total).toBe(0);
    expect(result.funnel.contacted).toBe(0);
    expect(result.funnel.sold).toBe(0);
    expect(result.conversion_rates.contact_rate).toBe(0);
    expect(result.conversion_rates.close_rate).toBe(0);
    expect(result.avg_days_to_close).toBeNull();
    expect(result.top_vendors).toHaveLength(0);
    expect(result.recent_sales).toHaveLength(0);
  });

  it('should calculate conversion rates correctly', async () => {
    // 10 leads: 8 contacted, 5 visited, 2 sold
    const leads = createMockLeads([
      'new', 'new', 'contacted', 'contacted', 'contacted',
      'visited', 'visited', 'visited', 'sold', 'sold'
    ]);
    const supabase = createMockSupabase(leads, []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('Monte Verde');

    expect(result.funnel.total).toBe(10);
    expect(result.funnel.sold).toBe(2);
    // close_rate = 2/10 = 0.2
    expect(result.conversion_rates.close_rate).toBe(0.2);
    // visit_rate = (visited + sold) / 10 = 5/10 = 0.5
    expect(result.conversion_rates.visit_rate).toBe(0.5);
  });

  it('should calculate avg_days_to_close for sold leads', async () => {
    const now = Date.now();
    const leads = [
      {
        id: 'lead-1', name: 'Lead 1', status: 'sold', assigned_to: 'v1',
        created_at: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        property_interest: 'Test', notes: {}
      },
      {
        id: 'lead-2', name: 'Lead 2', status: 'delivered', assigned_to: 'v1',
        created_at: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        property_interest: 'Test', notes: {}
      }
    ];
    const supabase = createMockSupabase(leads, []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('Test');

    expect(result.avg_days_to_close).not.toBeNull();
    // Lead 1: 10 days, Lead 2: 30 days → avg = 20
    expect(result.avg_days_to_close).toBe(20);
  });

  it('should return top vendors sorted by sales', async () => {
    const leads = [
      { id: '1', name: 'A', status: 'sold', assigned_to: 'v1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: {} },
      { id: '2', name: 'B', status: 'sold', assigned_to: 'v1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: {} },
      { id: '3', name: 'C', status: 'sold', assigned_to: 'v2', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: {} },
      { id: '4', name: 'D', status: 'new', assigned_to: 'v2', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: {} },
      { id: '5', name: 'E', status: 'visited', assigned_to: 'v3', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: {} },
    ];
    const vendors = [
      { id: 'v1', name: 'Karla' },
      { id: 'v2', name: 'Javier' },
      { id: 'v3', name: 'Fabian' }
    ];
    const supabase = createMockSupabase(leads, vendors);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('Test');

    expect(result.top_vendors.length).toBeGreaterThan(0);
    // v1 has 2 sales, v2 has 1 sale → v1 first
    expect(result.top_vendors[0].name).toBe('Karla');
    expect(result.top_vendors[0].sales).toBe(2);
  });

  it('should return recent sales', async () => {
    const now = Date.now();
    const leads = [
      { id: '1', name: 'Juan Sold', status: 'sold', assigned_to: 'v1', created_at: new Date(now - 5 * 86400000).toISOString(), updated_at: new Date(now - 1 * 86400000).toISOString(), notes: {} },
      { id: '2', name: 'Ana Delivered', status: 'delivered', assigned_to: 'v1', created_at: new Date(now - 10 * 86400000).toISOString(), updated_at: new Date(now - 2 * 86400000).toISOString(), notes: {} },
      { id: '3', name: 'Not Sold', status: 'new', assigned_to: 'v1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: {} },
    ];
    const vendors = [{ id: 'v1', name: 'Vendedor A' }];
    const supabase = createMockSupabase(leads, vendors);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('Test');

    expect(result.recent_sales).toHaveLength(2);
    expect(result.recent_sales[0].lead_name).toBe('Juan Sold');
    expect(result.recent_sales[1].lead_name).toBe('Ana Delivered');
  });

  it('should use custom days parameter', async () => {
    const supabase = createMockSupabase([], []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('Test', 30);

    expect(result.period_days).toBe(30);
  });

  it('should handle leads without assigned_to', async () => {
    const leads = [
      { id: '1', name: 'Unassigned', status: 'new', assigned_to: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: {} }
    ];
    const supabase = createMockSupabase(leads, []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.getFunnel('Test');

    expect(result.funnel.total).toBe(1);
    expect(result.top_vendors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// compareAll TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DevelopmentFunnelService.compareAll', () => {
  it('should group leads by development', async () => {
    const leads = [
      { status: 'new', property_interest: 'Monte Verde', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'visited', property_interest: 'Monte Verde', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'sold', property_interest: 'Monte Verde', created_at: new Date(Date.now() - 10 * 86400000).toISOString(), updated_at: new Date().toISOString() },
      { status: 'new', property_interest: 'Distrito Falco', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'sold', property_interest: 'Distrito Falco', created_at: new Date(Date.now() - 5 * 86400000).toISOString(), updated_at: new Date().toISOString() },
    ];
    const supabase = createMockSupabase(leads, [], []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.compareAll();

    expect(result.developments).toHaveLength(2);
    // Sorted by most leads first
    const mv = result.developments.find(d => d.name === 'Monte Verde');
    const df = result.developments.find(d => d.name === 'Distrito Falco');
    expect(mv).toBeDefined();
    expect(mv!.leads).toBe(3);
    expect(mv!.visits).toBe(2); // visited + sold
    expect(mv!.sales).toBe(1);
    expect(df).toBeDefined();
    expect(df!.leads).toBe(2);
    expect(df!.sales).toBe(1);
  });

  it('should identify best conversion (min 3 leads)', async () => {
    const leads = [
      // Dev A: 4 leads, 2 sold → 50% close_rate
      { status: 'sold', property_interest: 'Dev A', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'sold', property_interest: 'Dev A', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'new', property_interest: 'Dev A', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'new', property_interest: 'Dev A', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      // Dev B: 2 leads, 2 sold → 100% but < 3 leads so excluded
      { status: 'sold', property_interest: 'Dev B', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'sold', property_interest: 'Dev B', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];
    const supabase = createMockSupabase(leads, [], []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.compareAll();

    // Dev B has 100% conversion but only 2 leads → excluded from best_conversion
    expect(result.best_conversion).toBe('Dev A');
  });

  it('should identify most leads', async () => {
    const leads = [
      { status: 'new', property_interest: 'Popular Dev', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'new', property_interest: 'Popular Dev', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'new', property_interest: 'Popular Dev', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { status: 'new', property_interest: 'Small Dev', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];
    const supabase = createMockSupabase(leads, [], []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.compareAll();

    expect(result.most_leads).toBe('Popular Dev');
  });

  it('should return N/A when no developments', async () => {
    const supabase = createMockSupabase([], [], []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.compareAll();

    expect(result.developments).toHaveLength(0);
    expect(result.best_conversion).toBe('N/A');
    expect(result.most_leads).toBe('N/A');
  });

  it('should calculate avg_days_to_close per development', async () => {
    const now = Date.now();
    const leads = [
      { status: 'sold', property_interest: 'Dev A', created_at: new Date(now - 20 * 86400000).toISOString(), updated_at: new Date(now).toISOString() },
      { status: 'sold', property_interest: 'Dev A', created_at: new Date(now - 10 * 86400000).toISOString(), updated_at: new Date(now).toISOString() },
      { status: 'new', property_interest: 'Dev B', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];
    const supabase = createMockSupabase(leads, [], []);
    const service = new DevelopmentFunnelService(supabase);

    const result = await service.compareAll();

    const devA = result.developments.find(d => d.name === 'Dev A');
    const devB = result.developments.find(d => d.name === 'Dev B');
    expect(devA!.avg_days_to_close).toBe(15); // (20 + 10) / 2
    expect(devB!.avg_days_to_close).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT WHATSAPP TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DevelopmentFunnelService.formatFunnelForWhatsApp', () => {
  const service = new DevelopmentFunnelService({} as any);

  const sampleFunnel: DevelopmentFunnel = {
    development: 'Monte Verde',
    period_days: 90,
    generated_at: new Date().toISOString(),
    funnel: {
      total: 100,
      contacted: 80,
      scheduled: 60,
      visited: 40,
      negotiation: 20,
      reserved: 10,
      sold: 5,
      lost: 15
    },
    conversion_rates: {
      contact_rate: 0.8,
      visit_rate: 0.4,
      schedule_rate: 0.6,
      close_rate: 0.05,
      visit_to_close: 0.125
    },
    avg_days_to_close: 45,
    top_vendors: [
      { name: 'Karla', leads: 30, visits: 15, sales: 3 },
      { name: 'Javier', leads: 25, visits: 10, sales: 2 }
    ],
    recent_sales: [
      { lead_name: 'Juan Pérez', date: '01/03/2026', vendor: 'Karla' }
    ]
  };

  it('should include development name in uppercase', () => {
    const msg = service.formatFunnelForWhatsApp(sampleFunnel);
    expect(msg).toContain('MONTE VERDE');
  });

  it('should include period days', () => {
    const msg = service.formatFunnelForWhatsApp(sampleFunnel);
    expect(msg).toContain('90 días');
  });

  it('should include visual funnel with bar charts', () => {
    const msg = service.formatFunnelForWhatsApp(sampleFunnel);
    expect(msg).toContain('█');
    expect(msg).toContain('░');
    expect(msg).toContain('Total:');
    expect(msg).toContain('Contactados:');
    expect(msg).toContain('Vendidos:');
  });

  it('should include conversion rates as percentages', () => {
    const msg = service.formatFunnelForWhatsApp(sampleFunnel);
    expect(msg).toContain('Contacto: 80%');
    expect(msg).toContain('Visita: 40%');
    expect(msg).toContain('Cierre: 5%');
    expect(msg).toContain('Visita→Cierre: 13%'); // Math.round(0.125 * 100) = 13
  });

  it('should include avg days to close', () => {
    const msg = service.formatFunnelForWhatsApp(sampleFunnel);
    expect(msg).toContain('45 días');
    expect(msg).toContain('Promedio para cerrar');
  });

  it('should include top vendors', () => {
    const msg = service.formatFunnelForWhatsApp(sampleFunnel);
    expect(msg).toContain('Karla');
    expect(msg).toContain('30 leads');
    expect(msg).toContain('3 ventas');
  });

  it('should include recent sales', () => {
    const msg = service.formatFunnelForWhatsApp(sampleFunnel);
    expect(msg).toContain('Juan Pérez');
    expect(msg).toContain('Karla');
  });

  it('should hide visit_to_close when 0', () => {
    const zeroFunnel: DevelopmentFunnel = {
      ...sampleFunnel,
      conversion_rates: { ...sampleFunnel.conversion_rates, visit_to_close: 0 }
    };
    const msg = service.formatFunnelForWhatsApp(zeroFunnel);
    expect(msg).not.toContain('Visita→Cierre');
  });

  it('should hide avg_days_to_close when null', () => {
    const noCloseFunnel: DevelopmentFunnel = {
      ...sampleFunnel,
      avg_days_to_close: null
    };
    const msg = service.formatFunnelForWhatsApp(noCloseFunnel);
    expect(msg).not.toContain('Promedio para cerrar');
  });
});

describe('DevelopmentFunnelService.formatComparisonForWhatsApp', () => {
  const service = new DevelopmentFunnelService({} as any);

  const sampleComparison: DevelopmentComparison = {
    generated_at: new Date().toISOString(),
    period_days: 90,
    developments: [
      { name: 'Monte Verde', leads: 50, visits: 20, sales: 5, close_rate: 0.1, avg_days_to_close: 30 },
      { name: 'Distrito Falco', leads: 30, visits: 15, sales: 3, close_rate: 0.1, avg_days_to_close: 45 }
    ],
    best_conversion: 'Monte Verde',
    most_leads: 'Monte Verde'
  };

  it('should include title', () => {
    const msg = service.formatComparisonForWhatsApp(sampleComparison);
    expect(msg).toContain('COMPARATIVO DE DESARROLLOS');
  });

  it('should include period', () => {
    const msg = service.formatComparisonForWhatsApp(sampleComparison);
    expect(msg).toContain('90 días');
  });

  it('should list developments with metrics', () => {
    const msg = service.formatComparisonForWhatsApp(sampleComparison);
    expect(msg).toContain('Monte Verde');
    expect(msg).toContain('50 leads');
    expect(msg).toContain('20 visitas');
    expect(msg).toContain('5 ventas');
    expect(msg).toContain('10%');
  });

  it('should include avg days to close per development', () => {
    const msg = service.formatComparisonForWhatsApp(sampleComparison);
    expect(msg).toContain('30 días promedio');
    expect(msg).toContain('45 días promedio');
  });

  it('should show best conversion and most leads', () => {
    const msg = service.formatComparisonForWhatsApp(sampleComparison);
    expect(msg).toContain('Mayor conversión');
    expect(msg).toContain('Más leads');
  });

  it('should limit to 8 developments', () => {
    const manyDevs: DevelopmentComparison = {
      ...sampleComparison,
      developments: Array.from({ length: 12 }, (_, i) => ({
        name: `Dev ${i}`, leads: 10, visits: 5, sales: 1, close_rate: 0.1, avg_days_to_close: null
      }))
    };
    const msg = service.formatComparisonForWhatsApp(manyDevs);
    expect(msg).toContain('Dev 0');
    expect(msg).toContain('Dev 7');
    expect(msg).not.toContain('Dev 8');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CEO COMMAND DETECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('CEO Command Detection: funnel/comparar', () => {
  // We test the detection via the service's detectCommand
  // Need a minimal mock for the service
  async function createCEOService() {
    const supabase = createMockSupabase([], [], []);
    const { CEOCommandsService } = await import('../services/ceoCommandsService');
    return new CEOCommandsService(supabase);
  }

  it('should detect "funnel monte verde"', async () => {
    const service = await createCEOService();
    const result = service.detectCommand('funnel monte verde');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('developmentFunnel');
    expect(result.handlerParams.desarrollo).toBe('monte verde');
  });

  it('should detect "embudo distrito falco"', async () => {
    const service = await createCEOService();
    const result = service.detectCommand('embudo distrito falco');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('developmentFunnel');
    expect(result.handlerParams.desarrollo).toBe('distrito falco');
  });

  it('should detect "conversión andes"', async () => {
    const service = await createCEOService();
    const result = service.detectCommand('conversión andes');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('developmentFunnel');
    expect(result.handlerParams.desarrollo).toBe('andes');
  });

  it('should detect "comparar" as developmentComparison', async () => {
    const service = await createCEOService();
    const result = service.detectCommand('comparar desarrollos');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('developmentComparison');
  });

  it('should detect "comparativo" as developmentComparison', async () => {
    const service = await createCEOService();
    const result = service.detectCommand('comparativo');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('developmentComparison');
  });

  it('should detect "desarrollos" as developmentComparison', async () => {
    const service = await createCEOService();
    const result = service.detectCommand('desarrollos');
    expect(result.action).toBe('call_handler');
    expect(result.handlerName).toBe('developmentComparison');
  });

  it('should NOT detect plain "funnel" as developmentFunnel (it is pipeline)', async () => {
    const service = await createCEOService();
    const result = service.detectCommand('funnel');
    // Plain "funnel" is the pipeline command, not developmentFunnel
    expect(result.handlerName).not.toBe('developmentFunnel');
  });
});
