// ═══════════════════════════════════════════════════════════════════════════
// TESTS - Flujos Post-Compra
// Tests para seguimiento post-entrega, satisfacción y mantenimiento
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockSupabase(leadData: any = {}) {
  const defaultLead = {
    id: 'lead-1',
    name: 'Juan Pérez',
    phone: '5215559876543',
    status: 'delivered',
    assigned_to: 'tm-1',
    property_interest: 'Monte Verde',
    notes: {},
    status_changed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 días atrás
    ...leadData
  };

  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null })
  });

  return {
    client: {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: defaultLead, error: null }),
            lt: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [defaultLead], error: null })
                })
              })
            })
          }),
          in: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [defaultLead], error: null })
                })
              })
            })
          })
        }),
        update: updateFn,
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      }))
    },
    updateFn
  };
}

function createMockMeta() {
  return {
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true })
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Detección de respuestas post-entrega
// ═══════════════════════════════════════════════════════════════════════════

describe('Flujos Post-Compra', () => {

  describe('Detección de problemas post-entrega', () => {
    const palabrasProblema = ['no ', 'falta', 'problema', 'pendiente', 'mal', 'error', 'todavía', 'aún', 'revisar'];
    const palabrasBien = ['sí', 'si', 'todo bien', 'perfecto', 'excelente', 'ok', 'listo', 'correcto', 'gracias'];

    function detectarProblema(mensaje: string): boolean {
      const mensajeLower = mensaje.toLowerCase();
      const hayProblema = palabrasProblema.some(p => mensajeLower.includes(p));
      const todoBien = palabrasBien.some(p => mensajeLower.includes(p));
      return hayProblema && !todoBien;
    }

    it('debe detectar problema cuando dice "no tengo las llaves"', () => {
      expect(detectarProblema('no tengo las llaves')).toBe(true);
    });

    it('debe detectar problema cuando dice "falta la escritura"', () => {
      expect(detectarProblema('falta la escritura')).toBe(true);
    });

    it('debe detectar problema cuando dice "hay un problema con el gas"', () => {
      expect(detectarProblema('hay un problema con el gas')).toBe(true);
    });

    it('debe detectar problema cuando dice "todavía no me entregan"', () => {
      expect(detectarProblema('todavía no me entregan')).toBe(true);
    });

    it('debe detectar problema cuando dice "hay algo pendiente"', () => {
      expect(detectarProblema('hay algo pendiente')).toBe(true);
    });

    it('NO debe detectar problema cuando dice "sí, todo bien"', () => {
      expect(detectarProblema('sí, todo bien')).toBe(false);
    });

    it('NO debe detectar problema cuando dice "perfecto, gracias"', () => {
      expect(detectarProblema('perfecto, gracias')).toBe(false);
    });

    it('NO debe detectar problema cuando dice "todo listo"', () => {
      expect(detectarProblema('todo listo')).toBe(false);
    });

    it('NO debe detectar problema cuando dice "ok todo correcto"', () => {
      expect(detectarProblema('ok todo correcto')).toBe(false);
    });

    it('NO debe detectar problema cuando dice "excelente servicio"', () => {
      expect(detectarProblema('excelente servicio')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS: Clasificación de satisfacción con la casa
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Clasificación de satisfacción con la casa', () => {
    // Updated to match FIXED logic (strict number matching)
    function clasificarSatisfaccion(mensaje: string): { calificacion: number | null, categoria: string } {
      const mensajeLower = mensaje.toLowerCase();
      const trimmed = mensaje.trim();

      // Numbers ONLY if they are the ENTIRE message
      const matchNum = trimmed.match(/^\s*([1-4])\s*$/);
      if (matchNum) {
        const num = parseInt(matchNum[1]);
        if (num === 1) return { calificacion: 1, categoria: 'excelente' };
        if (num === 2) return { calificacion: 2, categoria: 'buena' };
        if (num === 3) return { calificacion: 3, categoria: 'regular' };
        if (num === 4) return { calificacion: 4, categoria: 'mala' };
      }

      if (mensajeLower.includes('excelente') || mensajeLower.includes('encanta')) {
        return { calificacion: 1, categoria: 'excelente' };
      } else if (mensajeLower.includes('buena') || mensajeLower.includes('contento')) {
        return { calificacion: 2, categoria: 'buena' };
      } else if (mensajeLower.includes('regular') || mensajeLower.includes('mejorar')) {
        return { calificacion: 3, categoria: 'regular' };
      } else if (mensajeLower.includes('mala') || mensajeLower.includes('problema')) {
        return { calificacion: 4, categoria: 'mala' };
      }

      return { calificacion: null, categoria: '' };
    }

    it('debe clasificar "1" como excelente', () => {
      const result = clasificarSatisfaccion('1');
      expect(result.calificacion).toBe(1);
      expect(result.categoria).toBe('excelente');
    });

    it('debe clasificar "me encanta mi casa" como excelente', () => {
      const result = clasificarSatisfaccion('me encanta mi casa');
      expect(result.calificacion).toBe(1);
      expect(result.categoria).toBe('excelente');
    });

    it('debe clasificar "2" como buena', () => {
      const result = clasificarSatisfaccion('2');
      expect(result.calificacion).toBe(2);
      expect(result.categoria).toBe('buena');
    });

    it('debe clasificar "estoy contento" como buena', () => {
      const result = clasificarSatisfaccion('estoy contento');
      expect(result.calificacion).toBe(2);
      expect(result.categoria).toBe('buena');
    });

    it('debe clasificar "3" como regular', () => {
      const result = clasificarSatisfaccion('3');
      expect(result.calificacion).toBe(3);
      expect(result.categoria).toBe('regular');
    });

    it('debe clasificar "hay cosas por mejorar" como regular', () => {
      const result = clasificarSatisfaccion('hay cosas por mejorar');
      expect(result.calificacion).toBe(3);
      expect(result.categoria).toBe('regular');
    });

    it('debe clasificar "4" como mala', () => {
      const result = clasificarSatisfaccion('4');
      expect(result.calificacion).toBe(4);
      expect(result.categoria).toBe('mala');
    });

    it('debe clasificar "tengo muchos problemas" como mala', () => {
      const result = clasificarSatisfaccion('tengo muchos problemas');
      expect(result.calificacion).toBe(4);
      expect(result.categoria).toBe('mala');
    });

    it('debe retornar null para mensaje sin calificación', () => {
      const result = clasificarSatisfaccion('hola qué tal');
      expect(result.calificacion).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS: Detección de necesidad de proveedores (mantenimiento)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Detección de necesidad de proveedores', () => {
    function necesitaProveedores(mensaje: string): boolean {
      const mensajeLower = mensaje.toLowerCase();
      const palabrasAyuda = ['ayuda', 'proveedor', 'contacto', 'recomend', 'necesito', 'busco', 'quien', 'quién'];
      const palabrasBien = ['sí', 'si', 'bien', 'todo ok', 'listo', 'gracias'];

      const pideAyuda = palabrasAyuda.some(p => mensajeLower.includes(p));
      const todoBien = palabrasBien.some(p => mensajeLower.includes(p)) && !pideAyuda;

      return pideAyuda || !todoBien;
    }

    it('debe detectar necesidad cuando dice "necesito ayuda"', () => {
      expect(necesitaProveedores('necesito ayuda')).toBe(true);
    });

    it('debe detectar necesidad cuando dice "me recomiendas un plomero"', () => {
      expect(necesitaProveedores('me recomiendas un plomero')).toBe(true);
    });

    it('debe detectar necesidad cuando dice "busco electricista"', () => {
      expect(necesitaProveedores('busco electricista')).toBe(true);
    });

    it('debe detectar necesidad cuando dice "quién hace impermeabilización"', () => {
      expect(necesitaProveedores('quién hace impermeabilización')).toBe(true);
    });

    it('debe detectar necesidad cuando dice "me pasas el contacto"', () => {
      expect(necesitaProveedores('me pasas el contacto')).toBe(true);
    });

    it('NO debe detectar necesidad cuando dice "sí todo bien"', () => {
      expect(necesitaProveedores('sí todo bien')).toBe(false);
    });

    it('NO debe detectar necesidad cuando dice "gracias, todo listo"', () => {
      expect(necesitaProveedores('gracias, todo listo')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS: Cálculo de tiempos post-entrega
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cálculo de tiempos post-entrega', () => {
    function calcularDiasDesdeEntrega(statusChangedAt: string): number {
      const ahora = new Date();
      const fechaEntrega = new Date(statusChangedAt);
      return Math.floor((ahora.getTime() - fechaEntrega.getTime()) / (1000 * 60 * 60 * 24));
    }

    function calcularMesesDesdeEntrega(statusChangedAt: string): number {
      const ahora = new Date();
      const fechaEntrega = new Date(statusChangedAt);
      return Math.floor((ahora.getTime() - fechaEntrega.getTime()) / (1000 * 60 * 60 * 24 * 30));
    }

    it('debe calcular correctamente 5 días desde entrega', () => {
      const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(calcularDiasDesdeEntrega(hace5dias)).toBe(5);
    });

    it('debe calcular correctamente 30 días desde entrega', () => {
      const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      expect(calcularDiasDesdeEntrega(hace30dias)).toBe(30);
    });

    it('debe calcular correctamente 3 meses desde entrega', () => {
      const hace90dias = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      expect(calcularMesesDesdeEntrega(hace90dias)).toBe(3);
    });

    it('debe calcular correctamente 6 meses desde entrega', () => {
      const hace180dias = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      expect(calcularMesesDesdeEntrega(hace180dias)).toBe(6);
    });

    it('debe calcular correctamente 12 meses desde entrega', () => {
      const hace365dias = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      expect(calcularMesesDesdeEntrega(hace365dias)).toBe(12);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS: Elegibilidad para flujos post-compra
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Elegibilidad para flujos post-compra', () => {

    function esElegiblePostEntrega(lead: any): boolean {
      if (lead.status !== 'delivered') return false;
      if (!lead.phone) return false;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      if ((notas as any)?.seguimiento_entrega_enviado) return false;

      const ahora = Date.now();
      const hace3dias = ahora - 3 * 24 * 60 * 60 * 1000;
      const hace7dias = ahora - 7 * 24 * 60 * 60 * 1000;
      const statusChanged = new Date(lead.status_changed_at).getTime();

      return statusChanged < hace3dias && statusChanged > hace7dias;
    }

    function esElegibleSatisfaccionCasa(lead: any): boolean {
      if (lead.status !== 'delivered') return false;
      if (!lead.phone) return false;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      if ((notas as any)?.encuesta_satisfaccion_casa_enviada) return false;

      const ahora = Date.now();
      const hace3meses = ahora - 90 * 24 * 60 * 60 * 1000;
      const hace6meses = ahora - 180 * 24 * 60 * 60 * 1000;
      const statusChanged = new Date(lead.status_changed_at).getTime();

      return statusChanged < hace3meses && statusChanged > hace6meses;
    }

    function esElegibleMantenimiento(lead: any): boolean {
      if (lead.status !== 'delivered') return false;
      if (!lead.phone) return false;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const añoActual = new Date().getFullYear();
      const ultimoCheckin = (notas as any)?.ultimo_checkin_mantenimiento;
      if (ultimoCheckin && ultimoCheckin.startsWith(String(añoActual))) return false;

      const ahora = Date.now();
      const hace11meses = ahora - 330 * 24 * 60 * 60 * 1000;
      const hace13meses = ahora - 390 * 24 * 60 * 60 * 1000;
      const statusChanged = new Date(lead.status_changed_at).getTime();

      return statusChanged < hace11meses && statusChanged > hace13meses;
    }

    it('lead entregado hace 5 días debe ser elegible para post-entrega', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: {},
        status_changed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegiblePostEntrega(lead)).toBe(true);
    });

    it('lead entregado hace 2 días NO debe ser elegible para post-entrega', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: {},
        status_changed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegiblePostEntrega(lead)).toBe(false);
    });

    it('lead entregado hace 10 días NO debe ser elegible para post-entrega', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: {},
        status_changed_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegiblePostEntrega(lead)).toBe(false);
    });

    it('lead que ya recibió seguimiento NO debe ser elegible', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: { seguimiento_entrega_enviado: '2026-01-25' },
        status_changed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegiblePostEntrega(lead)).toBe(false);
    });

    it('lead sin teléfono NO debe ser elegible', () => {
      const lead = {
        status: 'delivered',
        phone: null,
        notes: {},
        status_changed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegiblePostEntrega(lead)).toBe(false);
    });

    it('lead con status "sold" NO debe ser elegible para post-entrega', () => {
      const lead = {
        status: 'sold',
        phone: '5215559876543',
        notes: {},
        status_changed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegiblePostEntrega(lead)).toBe(false);
    });

    it('lead entregado hace 4 meses debe ser elegible para satisfacción casa', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: {},
        status_changed_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegibleSatisfaccionCasa(lead)).toBe(true);
    });

    it('lead entregado hace 2 meses NO debe ser elegible para satisfacción casa', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: {},
        status_changed_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegibleSatisfaccionCasa(lead)).toBe(false);
    });

    it('lead entregado hace 12 meses debe ser elegible para mantenimiento', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: {},
        status_changed_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegibleMantenimiento(lead)).toBe(true);
    });

    it('lead con check-in de mantenimiento este año NO debe ser elegible', () => {
      const lead = {
        status: 'delivered',
        phone: '5215559876543',
        notes: { ultimo_checkin_mantenimiento: `${new Date().getFullYear()}-01-15` },
        status_changed_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(esElegibleMantenimiento(lead)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS: Generación de mensajes
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Generación de mensajes post-compra', () => {

    function generarMensajePostEntrega(nombre: string, desarrollo: string): string {
      return `¡Hola ${nombre}! 🏠🔑

¡Felicidades por tu nueva casa en ${desarrollo}!

Queremos asegurarnos de que todo esté perfecto. Por favor, confirma:

1️⃣ ¿Recibiste todas las llaves correctamente?
2️⃣ ¿Las escrituras están en orden?
3️⃣ ¿Todos los servicios (agua, luz, gas) funcionan bien?

Si hay algo pendiente o algún detalle por resolver, responde y te ayudamos de inmediato.

¡Bienvenido a la familia Santa Rita! 🎉`;
    }

    function generarMensajeSatisfaccion(nombre: string, desarrollo: string, meses: number): string {
      return `¡Hola ${nombre}! 🏠

Ya llevas ${meses} meses disfrutando tu casa en ${desarrollo}. ¡Qué rápido pasa el tiempo!

Queremos saber cómo te ha ido:

*¿Cómo calificarías tu satisfacción con tu casa?*

1️⃣ Excelente - ¡Me encanta!
2️⃣ Buena - Estoy contento
3️⃣ Regular - Algunas cosas por mejorar
4️⃣ Mala - Tengo problemas

Tu opinión nos ayuda a mejorar 🙏`;
    }

    it('debe generar mensaje de post-entrega con nombre y desarrollo', () => {
      const mensaje = generarMensajePostEntrega('Juan', 'Monte Verde');
      expect(mensaje).toContain('¡Hola Juan!');
      expect(mensaje).toContain('Monte Verde');
      expect(mensaje).toContain('llaves');
      expect(mensaje).toContain('escrituras');
      expect(mensaje).toContain('servicios');
    });

    it('debe generar mensaje de satisfacción con meses', () => {
      const mensaje = generarMensajeSatisfaccion('María', 'Distrito Falco', 4);
      expect(mensaje).toContain('¡Hola María!');
      expect(mensaje).toContain('Distrito Falco');
      expect(mensaje).toContain('4 meses');
      expect(mensaje).toContain('1️⃣ Excelente');
      expect(mensaje).toContain('4️⃣ Mala');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS: Respuestas según calificación
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Respuestas según calificación de satisfacción', () => {

    function generarRespuestaSatisfaccion(calificacion: number, nombre: string): { respuesta: string, requiereAtencion: boolean } {
      switch (calificacion) {
        case 1:
          return {
            respuesta: `¡Nos alegra muchísimo, ${nombre}! 🎉\n\nEs un placer saber que amas tu casa.`,
            requiereAtencion: false
          };
        case 2:
          return {
            respuesta: `¡Qué bueno saberlo, ${nombre}! 😊\n\nNos da gusto que estés contento.`,
            requiereAtencion: false
          };
        case 3:
          return {
            respuesta: `Gracias por tu honestidad, ${nombre}.\n\nQueremos que estés 100% satisfecho.`,
            requiereAtencion: true
          };
        case 4:
          return {
            respuesta: `Lamentamos mucho escuchar eso, ${nombre}. 😔\n\nTu satisfacción es nuestra prioridad.`,
            requiereAtencion: true
          };
        default:
          return {
            respuesta: `Gracias por tu respuesta, ${nombre}.`,
            requiereAtencion: false
          };
      }
    }

    it('calificación 1 (excelente) no requiere atención', () => {
      const result = generarRespuestaSatisfaccion(1, 'Juan');
      expect(result.requiereAtencion).toBe(false);
      expect(result.respuesta).toContain('alegra');
    });

    it('calificación 2 (buena) no requiere atención', () => {
      const result = generarRespuestaSatisfaccion(2, 'María');
      expect(result.requiereAtencion).toBe(false);
      expect(result.respuesta).toContain('contento');
    });

    it('calificación 3 (regular) SÍ requiere atención', () => {
      const result = generarRespuestaSatisfaccion(3, 'Pedro');
      expect(result.requiereAtencion).toBe(true);
      expect(result.respuesta).toContain('100% satisfecho');
    });

    it('calificación 4 (mala) SÍ requiere atención', () => {
      const result = generarRespuestaSatisfaccion(4, 'Ana');
      expect(result.requiereAtencion).toBe(true);
      expect(result.respuesta).toContain('Lamentamos');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS: Prevención de falsos positivos en encuestas
  // Bug original: "Si me gustaría el sábado a las 10 am" → NPS score 10
  // ═══════════════════════════════════════════════════════════════════════════

  describe('isLikelySurveyResponse - Prevención de falsos positivos', () => {
    // Replicate the function from nurturing.ts for testing (same logic)
    function isLikelySurveyResponse(mensaje: string, maxWords: number = 6, maxChars: number = 40): boolean {
      const trimmed = mensaje.trim();
      if (trimmed.split(/\s+/).length > maxWords || trimmed.length > maxChars) return false;
      const schedulingWords = /\b(sábado|sabado|domingo|lunes|martes|miércoles|miercoles|jueves|viernes|hora|am|pm|mañana|manana|tarde|noche|cita|visita|agendar|agenda)\b/i;
      if (schedulingWords.test(trimmed)) return false;
      const propertyWords = /\b(casas?|recámaras?|recamaras?|desarrollos?|créditos?|creditos?|terrenos?|precios?|infonavit|presupuesto|ubicación|ubicacion)\b/i;
      if (propertyWords.test(trimmed)) return false;
      return true;
    }

    // These should NOT be treated as survey responses
    it('"Si me gustaría el sábado a las 10 am" should NOT trigger survey', () => {
      expect(isLikelySurveyResponse('Si me gustaría el sábado a las 10 am')).toBe(false);
    });

    it('"quiero casa de 1 planta" should NOT trigger survey', () => {
      expect(isLikelySurveyResponse('quiero casa de 1 planta')).toBe(false);
    });

    it('"no tengo presupuesto todavía" should NOT trigger survey', () => {
      expect(isLikelySurveyResponse('no tengo presupuesto todavía')).toBe(false);
    });

    it('"si me interesa ver las casas" should NOT trigger survey', () => {
      expect(isLikelySurveyResponse('si me interesa ver las casas')).toBe(false);
    });

    it('"me gustaría agendar una cita para el viernes" should NOT trigger survey', () => {
      expect(isLikelySurveyResponse('me gustaría agendar una cita para el viernes')).toBe(false);
    });

    it('"busco terreno en el nogal" should NOT trigger survey', () => {
      expect(isLikelySurveyResponse('busco terreno en el nogal')).toBe(false);
    });

    it('"cuanto cuesta el credito infonavit" should NOT trigger survey', () => {
      expect(isLikelySurveyResponse('cuanto cuesta el credito infonavit')).toBe(false);
    });

    // These SHOULD be treated as survey responses
    it('"10" SHOULD be treated as survey response', () => {
      expect(isLikelySurveyResponse('10')).toBe(true);
    });

    it('"3" SHOULD be treated as survey response', () => {
      expect(isLikelySurveyResponse('3')).toBe(true);
    });

    it('"si" SHOULD be treated as survey response', () => {
      expect(isLikelySurveyResponse('si')).toBe(true);
    });

    it('"no" SHOULD be treated as survey response', () => {
      expect(isLikelySurveyResponse('no')).toBe(true);
    });

    it('"excelente" SHOULD be treated as survey response', () => {
      expect(isLikelySurveyResponse('excelente')).toBe(true);
    });

    it('"todo bien gracias" SHOULD be treated as survey response', () => {
      expect(isLikelySurveyResponse('todo bien gracias')).toBe(true);
    });
  });

  describe('Satisfacción casa - clasificación estricta (sin falsos positivos)', () => {
    // Simulates the FIXED logic in procesarRespuestaSatisfaccionCasa
    function clasificarSatisfaccionEstricta(mensaje: string): { calificacion: number | null, categoria: string } {
      const mensajeLower = mensaje.toLowerCase();
      const trimmed = mensaje.trim();

      // Numbers ONLY if they are the ENTIRE message
      const matchNum = trimmed.match(/^\s*([1-4])\s*$/);
      if (matchNum) {
        const num = parseInt(matchNum[1]);
        if (num === 1) return { calificacion: 1, categoria: 'excelente' };
        if (num === 2) return { calificacion: 2, categoria: 'buena' };
        if (num === 3) return { calificacion: 3, categoria: 'regular' };
        if (num === 4) return { calificacion: 4, categoria: 'mala' };
      }
      if (mensajeLower.includes('excelente') || mensajeLower.includes('encanta')) return { calificacion: 1, categoria: 'excelente' };
      if (mensajeLower.includes('buena') || mensajeLower.includes('contento')) return { calificacion: 2, categoria: 'buena' };
      if (mensajeLower.includes('regular') || mensajeLower.includes('mejorar')) return { calificacion: 3, categoria: 'regular' };
      if (mensajeLower.includes('mala') || mensajeLower.includes('problema')) return { calificacion: 4, categoria: 'mala' };
      return { calificacion: null, categoria: '' };
    }

    it('"1" solo → excelente', () => {
      expect(clasificarSatisfaccionEstricta('1').calificacion).toBe(1);
    });

    it('"3" solo → regular', () => {
      expect(clasificarSatisfaccionEstricta('3').calificacion).toBe(3);
    });

    it('"quiero casa de 1 planta" → NO debe clasificar (1 es parte de texto)', () => {
      // After isLikelySurveyResponse filters it, this wouldn't reach clasificar
      // But even if it did, the strict regex wouldn't match
      expect(clasificarSatisfaccionEstricta('quiero casa de 1 planta').calificacion).toBeNull();
    });

    it('"10" → NO debe clasificar (fuera de rango 1-4)', () => {
      expect(clasificarSatisfaccionEstricta('10').calificacion).toBeNull();
    });

    it('"me encanta mi casa" → excelente (text match)', () => {
      expect(clasificarSatisfaccionEstricta('me encanta mi casa').calificacion).toBe(1);
    });
  });
});
