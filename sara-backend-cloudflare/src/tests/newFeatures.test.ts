// src/tests/newFeatures.test.ts
// Tests para funcionalidades nuevas: notas en CRM, recap condicional, sugerencias IA
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VendorCommandsService, sanitizeNotes } from '../services/vendorCommandsService';

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS PARA COMANDO NOTA - Parsing y detección
// ═══════════════════════════════════════════════════════════════════════════════
describe('Comando Nota - Parsing', () => {
  let vendorService: VendorCommandsService;

  beforeEach(() => {
    vendorService = new VendorCommandsService(null as any);
  });

  describe('detectRouteCommand - nota [nombre] [texto]', () => {
    it('debe detectar "nota rodrigo hablé por teléfono"', () => {
      const result = vendorService.detectRouteCommand('nota rodrigo hablé por teléfono', 'nota rodrigo hablé por teléfono');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAgregarNota');
      expect(result.handlerParams?.nombreLead).toBe('rodrigo');
      expect(result.handlerParams?.textoNota).toBe('hablé por teléfono');
    });

    it('debe detectar "nota Juan: le interesa el depto"', () => {
      const result = vendorService.detectRouteCommand('nota Juan: le interesa el depto', 'nota Juan: le interesa el depto');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAgregarNota');
      expect(result.handlerParams?.nombreLead).toBe('juan');
      expect(result.handlerParams?.textoNota).toBe('le interesa el depto');
    });

    it('debe detectar "apunte María presupuesto 2M"', () => {
      const result = vendorService.detectRouteCommand('apunte María presupuesto 2M', 'apunte María presupuesto 2M');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorAgregarNota');
      expect(result.handlerParams?.nombreLead).toBe('maría');
    });

    it('debe manejar nombres con acentos', () => {
      const result = vendorService.detectRouteCommand('nota josé quiere visita', 'nota josé quiere visita');
      expect(result.matched).toBe(true);
      expect(result.handlerParams?.nombreLead).toBe('josé');
    });

    it('NO debe confundir con otros comandos', () => {
      // "nota" sola no debería matchear
      const result1 = vendorService.detectRouteCommand('nota', 'nota');
      expect(result1.matched).toBe(false);

      // "notas" es diferente comando
      const result2 = vendorService.detectRouteCommand('notas juan', 'notas juan');
      expect(result2.handlerName).toBe('vendedorVerNotas');
    });
  });

  describe('detectRouteCommand - notas [nombre]', () => {
    it('debe detectar "notas juan"', () => {
      const result = vendorService.detectRouteCommand('notas juan', 'notas juan');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorVerNotas');
      expect(result.handlerParams?.nombreLead).toBe('juan');
    });

    it('debe detectar "notas de María"', () => {
      const result = vendorService.detectRouteCommand('notas de María', 'notas de María');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorVerNotas');
      expect(result.handlerParams?.nombreLead).toBe('maría');
    });

    it('debe detectar "ver notas de Pedro"', () => {
      const result = vendorService.detectRouteCommand('ver notas de Pedro', 'ver notas de Pedro');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorVerNotas');
      expect(result.handlerParams?.nombreLead).toBe('pedro');
    });

    it('debe detectar "ver notas carlos"', () => {
      const result = vendorService.detectRouteCommand('ver notas carlos', 'ver notas carlos');
      expect(result.matched).toBe(true);
      expect(result.handlerName).toBe('vendedorVerNotas');
      expect(result.handlerParams?.nombreLead).toBe('carlos');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS PARA COMANDO VER - Historial de leads
// ═══════════════════════════════════════════════════════════════════════════════
describe('Comando Ver - Historial de leads', () => {
  let vendorService: VendorCommandsService;

  beforeEach(() => {
    vendorService = new VendorCommandsService(null as any);
  });

  it('debe detectar "ver juan"', () => {
    const result = vendorService.detectRouteCommand('ver juan', 'ver juan');
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('vendedorVerHistorial');
    expect(result.handlerParams?.identificador).toBe('juan');
  });

  it('debe detectar "historial 5551234567"', () => {
    const result = vendorService.detectRouteCommand('historial 5551234567', 'historial 5551234567');
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('vendedorVerHistorial');
    expect(result.handlerParams?.identificador).toBe('5551234567');
  });

  it('debe detectar "chat María"', () => {
    const result = vendorService.detectRouteCommand('chat María', 'chat María');
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('vendedorVerHistorial');
  });

  it('NO debe confundir "ver" con "ver notas"', () => {
    // "ver notas juan" debe ir a vendedorVerNotas, no vendedorVerHistorial
    const result = vendorService.detectRouteCommand('ver notas juan', 'ver notas juan');
    expect(result.handlerName).toBe('vendedorVerNotas');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS PARA LÓGICA DE RECAP CONDICIONAL
// ═══════════════════════════════════════════════════════════════════════════════
describe('Recap Condicional - Lógica last_sara_interaction', () => {

  // Helper para simular la lógica de enviarRecapDiario
  function debeEnviarRecap(vendedor: any): { enviar: boolean; razon: string } {
    const hoy = new Date().toISOString().split('T')[0];

    // Ya se envió hoy
    if (vendedor.last_recap_sent === hoy) {
      return { enviar: false, razon: 'recap ya enviado hoy' };
    }

    // Verificar si usó SARA hoy
    const notasVendedor = typeof vendedor.notes === 'string'
      ? JSON.parse(vendedor.notes || '{}')
      : (vendedor.notes || {});
    const lastInteraction = notasVendedor.last_sara_interaction;

    if (lastInteraction) {
      const fechaInteraccion = lastInteraction.split('T')[0];
      if (fechaInteraccion === hoy) {
        return { enviar: false, razon: 'vendedor ya usó SARA hoy' };
      }
    }

    return { enviar: true, razon: 'vendedor NO usó SARA hoy' };
  }

  it('debe enviar recap si vendedor NO tiene last_sara_interaction', () => {
    const vendedor = { id: '1', name: 'Juan', notes: {} };
    const result = debeEnviarRecap(vendedor);
    expect(result.enviar).toBe(true);
    expect(result.razon).toBe('vendedor NO usó SARA hoy');
  });

  it('debe enviar recap si last_sara_interaction es de AYER', () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const vendedor = {
      id: '1',
      name: 'Juan',
      notes: { last_sara_interaction: ayer.toISOString() }
    };
    const result = debeEnviarRecap(vendedor);
    expect(result.enviar).toBe(true);
  });

  it('NO debe enviar recap si last_sara_interaction es de HOY', () => {
    const hoy = new Date().toISOString();
    const vendedor = {
      id: '1',
      name: 'Juan',
      notes: { last_sara_interaction: hoy }
    };
    const result = debeEnviarRecap(vendedor);
    expect(result.enviar).toBe(false);
    expect(result.razon).toBe('vendedor ya usó SARA hoy');
  });

  it('NO debe enviar recap si ya se envió hoy (last_recap_sent)', () => {
    const hoy = new Date().toISOString().split('T')[0];
    const vendedor = {
      id: '1',
      name: 'Juan',
      notes: {},
      last_recap_sent: hoy
    };
    const result = debeEnviarRecap(vendedor);
    expect(result.enviar).toBe(false);
    expect(result.razon).toBe('recap ya enviado hoy');
  });

  it('debe manejar notes como string JSON', () => {
    const hoy = new Date().toISOString();
    const vendedor = {
      id: '1',
      name: 'Juan',
      notes: JSON.stringify({ last_sara_interaction: hoy })
    };
    const result = debeEnviarRecap(vendedor);
    expect(result.enviar).toBe(false);
  });

  it('debe enviar si notes es null', () => {
    const vendedor = { id: '1', name: 'Juan', notes: null };
    const result = debeEnviarRecap(vendedor);
    expect(result.enviar).toBe(true);
  });

  it('debe enviar si notes está vacío', () => {
    const vendedor = { id: '1', name: 'Juan', notes: '{}' };
    const result = debeEnviarRecap(vendedor);
    expect(result.enviar).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS PARA SUGERENCIAS IA - Comandos no reconocidos
// ═══════════════════════════════════════════════════════════════════════════════
describe('Sugerencias IA - Comandos no reconocidos', () => {
  let vendorService: VendorCommandsService;

  beforeEach(() => {
    vendorService = new VendorCommandsService(null as any);
  });

  // Estos tests verifican que ciertos textos NO son comandos reconocidos
  // y por lo tanto irían a sugerencias IA

  it('texto libre NO debe matchear comando', () => {
    const result = vendorService.detectRouteCommand(
      'hablé con juan y le interesa',
      'hablé con juan y le interesa'
    );
    expect(result.matched).toBe(false);
  });

  it('pregunta de seguimiento NO debe matchear', () => {
    const result = vendorService.detectRouteCommand(
      'qué hago con este lead que no contesta',
      'qué hago con este lead que no contesta'
    );
    expect(result.matched).toBe(false);
  });

  it('typo en comando NO debe matchear', () => {
    // "auyda" en vez de "ayuda"
    const result = vendorService.detectRouteCommand('auyda', 'auyda');
    expect(result.matched).toBe(false);
  });

  it('comando incompleto NO debe matchear', () => {
    // "nota" sin nombre ni texto
    const result = vendorService.detectRouteCommand('nota', 'nota');
    expect(result.matched).toBe(false);
  });

  it('mensaje casual NO debe matchear', () => {
    const result = vendorService.detectRouteCommand('buenos dias', 'buenos dias');
    expect(result.matched).toBe(false);
  });

  it('pregunta sobre lead NO debe matchear (va a IA)', () => {
    const result = vendorService.detectRouteCommand(
      'como le hablo a un cliente que solo vio precios',
      'como le hablo a un cliente que solo vio precios'
    );
    expect(result.matched).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS PARA COMANDOS EXISTENTES QUE NO DEBEN ROMPERSE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Comandos existentes - Regresión', () => {
  let vendorService: VendorCommandsService;

  beforeEach(() => {
    vendorService = new VendorCommandsService(null as any);
  });

  // Estos comandos deben seguir funcionando

  it('citas debe funcionar', () => {
    expect(vendorService.detectRouteCommand('citas', 'citas').matched).toBe(true);
    expect(vendorService.detectRouteCommand('mis citas', 'mis citas').matched).toBe(true);
  });

  it('leads debe funcionar', () => {
    expect(vendorService.detectRouteCommand('leads', 'leads').matched).toBe(true);
    expect(vendorService.detectRouteCommand('mis leads', 'mis leads').matched).toBe(true);
  });

  it('ayuda debe funcionar', () => {
    expect(vendorService.detectRouteCommand('ayuda', 'ayuda').matched).toBe(true);
    expect(vendorService.detectRouteCommand('help', 'help').matched).toBe(true);
    expect(vendorService.detectRouteCommand('?', '?').matched).toBe(true);
  });

  it('hoy/resumen debe funcionar', () => {
    expect(vendorService.detectRouteCommand('hoy', 'hoy').matched).toBe(true);
    expect(vendorService.detectRouteCommand('resumen', 'resumen').matched).toBe(true);
  });

  it('meta debe funcionar', () => {
    expect(vendorService.detectRouteCommand('meta', 'meta').matched).toBe(true);
    expect(vendorService.detectRouteCommand('mi meta', 'mi meta').matched).toBe(true);
  });

  it('briefing debe funcionar', () => {
    expect(vendorService.detectRouteCommand('briefing', 'briefing').matched).toBe(true);
  });

  it('hot debe funcionar', () => {
    expect(vendorService.detectRouteCommand('hot', 'hot').matched).toBe(true);
  });

  it('pendientes debe funcionar', () => {
    expect(vendorService.detectRouteCommand('pendientes', 'pendientes').matched).toBe(true);
  });

  it('agendar cita debe funcionar', () => {
    const result = vendorService.detectRouteCommand(
      'agendar cita con juan mañana 4pm',
      'agendar cita con juan mañana 4pm'
    );
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('vendedorAgendarCitaCompleta');
  });

  it('reagendar debe funcionar', () => {
    const result = vendorService.detectRouteCommand(
      'reagendar juan viernes 3pm',
      'reagendar juan viernes 3pm'
    );
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('vendedorReagendarCita');
  });

  it('bridge debe funcionar', () => {
    const result = vendorService.detectRouteCommand('bridge juan', 'bridge juan');
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('bridgeLead');
  });

  it('quien es debe funcionar', () => {
    const result = vendorService.detectRouteCommand('quien es juan', 'quien es juan');
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('vendedorQuienEs');
  });

  it('coaching debe funcionar', () => {
    const result = vendorService.detectRouteCommand('coaching juan', 'coaching juan');
    expect(result.matched).toBe(true);
    expect(result.handlerName).toBe('vendedorCoaching');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS PARA SANITIZACIÓN DE NOTAS
// ═══════════════════════════════════════════════════════════════════════════════
describe('sanitizeNotes - Prevención de corrupción', () => {
  it('debe eliminar keys numéricos (señal de corrupción)', () => {
    const corrupted = { '0': 'bad', '1': 'data', 'last_sara_interaction': '2024-01-01' };
    const result = sanitizeNotes(corrupted);
    expect(result).toEqual({ 'last_sara_interaction': '2024-01-01' });
    expect(result['0']).toBeUndefined();
    expect(result['1']).toBeUndefined();
  });

  it('debe mantener pending_recap intacto', () => {
    const notes = {
      pending_recap: { sent_at: '2024-01-01', mensaje_completo: 'Hola' },
      last_sara_interaction: '2024-01-01'
    };
    const result = sanitizeNotes(notes);
    expect(result.pending_recap).toEqual(notes.pending_recap);
  });

  it('debe manejar notes vacíos', () => {
    expect(sanitizeNotes(null)).toEqual({});
    expect(sanitizeNotes(undefined)).toEqual({});
    expect(sanitizeNotes({})).toEqual({});
  });

  it('debe rechazar arrays', () => {
    expect(sanitizeNotes(['bad', 'data'])).toEqual({});
  });
});
