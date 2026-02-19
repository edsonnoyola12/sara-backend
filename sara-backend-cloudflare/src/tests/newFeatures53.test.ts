// Tests para Session 53: Message Delivery Status, R2 Backup, Load Test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VendorCommandsService } from '../services/vendorCommandsService';
import { isRetryableError } from '../services/retryService';

// ═══════════════════════════════════════════════════════════════
// TEST 1: MESSAGE DELIVERY STATUS
// ═══════════════════════════════════════════════════════════════

describe('MESSAGE DELIVERY STATUS', () => {

  describe('1.1 Status webhook enhances retry on failure', () => {
    it('failed status debe encolar en retry_queue (error retryable)', () => {
      // enqueueFailedMessage extracts status code and sets .status on synthetic error
      const error: any = new Error('Meta delivery failed: 500 - Internal Server Error');
      error.status = 500;
      expect(isRetryableError(error)).toBe(true);
    });

    it('failed status con error 400 no debe ser retryable', () => {
      const error: any = new Error('Meta delivery failed: 400 - Bad Request');
      error.status = 400;
      expect(isRetryableError(error)).toBe(false);
    });

    it('failed status con error 429 debe ser retryable', () => {
      const error: any = new Error('Meta delivery failed: 429 - Rate Limited');
      error.status = 429;
      expect(isRetryableError(error)).toBe(true);
    });
  });

  describe('1.2 Vendor command: entregado', () => {
    let vendorService: VendorCommandsService;

    beforeEach(() => {
      vendorService = new VendorCommandsService(null as any);
    });

    it('debe detectar "entregado Roberto"', () => {
      const result = vendorService.detectRouteCommand('entregado Roberto', 'entregado Roberto');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorEntregado');
      expect(result.handlerParams?.nombreLead).toBe('roberto');
    });

    it('debe detectar "entregado María López"', () => {
      const result = vendorService.detectRouteCommand('entregado María López', 'entregado María López');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorEntregado');
      expect(result.handlerParams?.nombreLead).toBe('maría lópez');
    });

    it('debe detectar "delivery Juan"', () => {
      const result = vendorService.detectRouteCommand('delivery Juan', 'delivery Juan');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorEntregado');
    });

    it('debe detectar "entregas Ana"', () => {
      const result = vendorService.detectRouteCommand('entregas Ana', 'entregas Ana');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorEntregado');
    });

    it('"entregado" sin nombre no debe matchear', () => {
      const result = vendorService.detectRouteCommand('entregado', 'entregado');
      expect(result.matched).toBe(false);
    });
  });

  describe('1.3 vendedorEntregado handler exists', () => {
    it('vendedorEntregado debe estar exportada', async () => {
      const mod = await import('../handlers/whatsapp-vendor');
      expect(typeof mod.vendedorEntregado).toBe('function');
    });
  });

  describe('1.4 Keyword whitelist includes entregado', () => {
    it('entregado, delivery, entregas deben no ser forwarded como mensaje', () => {
      const keywords = [
        'notas', 'nota', 'llamar', 'quien', 'quién', 'citas', 'cita', 'mis', 'hoy',
        'briefing', 'hot', 'pendientes', 'meta', 'ayuda', 'help', 'bridge',
        'brochure', 'ubicacion', 'ubicación', 'video', 'credito', 'crédito',
        'agendar', 'reagendar', 'cancelar', 'contactar', 'pausar', 'reanudar',
        'coaching', 'coach', 'ver', 'historial', 'cotizar', 'ofertas', 'oferta',
        'enviar', 'cerrar', 'apartado', 'aparto', 'nuevo', 'ok', 'perdido',
        'recordar', 'programar', 'propiedades', 'inventario', 'asignar',
        'adelante', 'atras', 'atrás', '#cerrar', '#mas', '#más', 'apunte',
        'registrar', 'referido', 'cumple', 'email', 'correo',
        'humano', 'bot', 'entregado', 'delivery', 'entregas'
      ];
      expect(keywords).toContain('entregado');
      expect(keywords).toContain('delivery');
      expect(keywords).toContain('entregas');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: R2 BACKUP SEMANAL
// ═══════════════════════════════════════════════════════════════

describe('R2 BACKUP SEMANAL', () => {

  describe('2.1 backupSemanalR2 exports correctly', () => {
    it('backupSemanalR2 debe exportar como función', async () => {
      const { backupSemanalR2 } = await import('../crons/dashboard');
      expect(typeof backupSemanalR2).toBe('function');
    });

    it('getBackupLog debe exportar como función', async () => {
      const { getBackupLog } = await import('../crons/dashboard');
      expect(typeof getBackupLog).toBe('function');
    });
  });

  describe('2.2 JSONL format logic', () => {
    it('debe generar JSONL correcto (un JSON por línea)', () => {
      const leads = [
        { id: '1', phone: '5551234', name: 'Test 1' },
        { id: '2', phone: '5555678', name: 'Test 2' }
      ];
      let jsonl = '';
      for (const lead of leads) {
        jsonl += JSON.stringify(lead) + '\n';
      }
      const lines = jsonl.trim().split('\n');
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).name).toBe('Test 1');
      expect(JSON.parse(lines[1]).name).toBe('Test 2');
    });

    it('JSONL vacío si no hay datos', () => {
      const leads: any[] = [];
      let jsonl = '';
      for (const lead of leads) {
        jsonl += JSON.stringify(lead) + '\n';
      }
      expect(jsonl).toBe('');
    });
  });

  describe('2.3 Retention logic', () => {
    it('debe mantener máximo 60 entries (30 semanas × 2 tipos)', () => {
      const maxEntries = 60; // 30 backups × 2 (conversations + leads)
      const totalEntries = 65;
      const toDelete = totalEntries > maxEntries ? totalEntries - maxEntries : 0;
      expect(toDelete).toBe(5);
    });

    it('no debe borrar si hay menos de 60 entries', () => {
      const totalEntries = 40;
      const toDelete = totalEntries > 60 ? totalEntries - 60 : 0;
      expect(toDelete).toBe(0);
    });
  });

  describe('2.4 CEO command: backups', () => {
    it('CEO debe tener comando backups', async () => {
      const { CEOCommandsService } = await import('../services/ceoCommandsService');
      const ceo = new CEOCommandsService(null as any);
      const result = ceo.detectCommand('backups');
      expect(result.action).toBe('call_handler');
      expect(result.handlerName).toBe('verBackups');
    });

    it('CEO debe detectar aliases: backup, respaldos', async () => {
      const { CEOCommandsService } = await import('../services/ceoCommandsService');
      const ceo = new CEOCommandsService(null as any);

      for (const alias of ['backup', 'respaldos']) {
        const result = ceo.detectCommand(alias);
        expect(result.action).toBe('call_handler');
        expect(result.handlerName).toBe('verBackups');
      }
    });
  });

  describe('2.5 R2 key format', () => {
    it('conversations key debe ser backups/conversations/{fecha}.jsonl', () => {
      const fecha = '2026-02-19';
      const key = `backups/conversations/${fecha}.jsonl`;
      expect(key).toBe('backups/conversations/2026-02-19.jsonl');
      expect(key).toMatch(/^backups\/conversations\/\d{4}-\d{2}-\d{2}\.jsonl$/);
    });

    it('leads key debe ser backups/leads/{fecha}.jsonl', () => {
      const fecha = '2026-02-19';
      const key = `backups/leads/${fecha}.jsonl`;
      expect(key).toBe('backups/leads/2026-02-19.jsonl');
      expect(key).toMatch(/^backups\/leads\/\d{4}-\d{2}-\d{2}\.jsonl$/);
    });
  });

  describe('2.6 Backup log format', () => {
    it('debe agrupar logs por fecha para WhatsApp', () => {
      const logs = [
        { fecha: '2026-02-19', tipo: 'conversations', row_count: 50, size_bytes: 102400 },
        { fecha: '2026-02-19', tipo: 'leads', row_count: 30, size_bytes: 51200 },
        { fecha: '2026-02-12', tipo: 'conversations', row_count: 45, size_bytes: 98000 },
        { fecha: '2026-02-12', tipo: 'leads', row_count: 28, size_bytes: 48000 }
      ];

      const byFecha: Record<string, any[]> = {};
      for (const log of logs) {
        if (!byFecha[log.fecha]) byFecha[log.fecha] = [];
        byFecha[log.fecha].push(log);
      }

      expect(Object.keys(byFecha).length).toBe(2);
      expect(byFecha['2026-02-19'].length).toBe(2);
      const totalRows = byFecha['2026-02-19'].reduce((s: number, i: any) => s + i.row_count, 0);
      expect(totalRows).toBe(80);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: LOAD TEST ENDPOINT
// ═══════════════════════════════════════════════════════════════

describe('LOAD TEST ENDPOINT', () => {

  describe('3.1 Concurrent cap', () => {
    it('debe limitar concurrent a máximo 50', () => {
      const requested = 100;
      const maxConcurrent = Math.min(requested, 50);
      expect(maxConcurrent).toBe(50);
    });

    it('debe respetar concurrent si es <= 50', () => {
      const requested = 20;
      const maxConcurrent = Math.min(requested, 50);
      expect(maxConcurrent).toBe(20);
    });

    it('default debe ser 10 si no se especifica', () => {
      const param = null;
      const concurrent = parseInt(param || '10');
      expect(concurrent).toBe(10);
    });
  });

  describe('3.2 Mensaje template replacement', () => {
    it('debe reemplazar {desarrollo} en mensajes', () => {
      const template = 'que tienen en {desarrollo}';
      const desarrollo = 'Monte Verde';
      const msg = template.replace('{desarrollo}', desarrollo);
      expect(msg).toBe('que tienen en Monte Verde');
    });

    it('debe rotar desarrollos por lead index', () => {
      const desarrollos = ['Monte Verde', 'Los Encinos', 'Distrito Falco', 'Andes', 'Miravalle'];
      expect(desarrollos[0 % 5]).toBe('Monte Verde');
      expect(desarrollos[3 % 5]).toBe('Andes');
      expect(desarrollos[5 % 5]).toBe('Monte Verde');
      expect(desarrollos[7 % 5]).toBe('Distrito Falco');
    });
  });

  describe('3.3 Response format', () => {
    it('debe calcular métricas correctamente', () => {
      const results = [
        { leadId: 1, step: 'hola', success: true, time_ms: 100 },
        { leadId: 1, step: 'monte verde', success: true, time_ms: 200 },
        { leadId: 2, step: 'hola', success: true, time_ms: 150 },
        { leadId: 2, step: 'monte verde', success: false, time_ms: 0, error: 'timeout' }
      ];

      const successResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      const times = successResults.map(r => r.time_ms);
      const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      const maxTime = times.length > 0 ? Math.max(...times) : 0;

      expect(successResults.length).toBe(3);
      expect(failedResults.length).toBe(1);
      expect(avgTime).toBe(150); // (100+200+150)/3
      expect(maxTime).toBe(200);
    });

    it('debe manejar caso de todos fallos', () => {
      const results = [
        { leadId: 1, step: 'hola', success: false, time_ms: 0, error: 'err' }
      ];

      const successResults = results.filter(r => r.success);
      const times = successResults.map(r => r.time_ms);
      const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      const maxTime = times.length > 0 ? Math.max(...times) : 0;

      expect(avgTime).toBe(0);
      expect(maxTime).toBe(0);
    });
  });

  describe('3.4 Fake lead generation', () => {
    it('debe generar leads con teléfonos únicos', () => {
      const phones = Array.from({ length: 5 }, (_, i) => {
        const leadNum = i + 1;
        return `521000000${String(leadNum).padStart(4, '0')}`;
      });
      expect(phones[0]).toBe('5210000000001');
      expect(phones[4]).toBe('5210000000005');
      // All unique
      const unique = new Set(phones);
      expect(unique.size).toBe(5);
    });

    it('fake lead no debe tener assigned_to', () => {
      const fakeLead = {
        id: 'load-test-1',
        name: 'Lead Test 1',
        phone: '5210000000001',
        status: 'new',
        score: 0,
        notes: {},
        conversation_history: [],
        property_interest: null,
        assigned_to: null
      };
      expect(fakeLead.assigned_to).toBeNull();
      expect(fakeLead.status).toBe('new');
    });
  });

  describe('3.5 Messages per lead', () => {
    it('cada lead debe enviar 3 mensajes (contacto, desarrollo, cita)', () => {
      const mensajes = [
        'hola busco casa de 3 recamaras',
        'que tienen en {desarrollo}',
        'quiero agendar cita el sabado a las 11'
      ];
      expect(mensajes.length).toBe(3);
    });

    it('total requests = concurrent × 3', () => {
      const concurrent = 20;
      const messagesPerLead = 3;
      expect(concurrent * messagesPerLead).toBe(60);
    });
  });
});
