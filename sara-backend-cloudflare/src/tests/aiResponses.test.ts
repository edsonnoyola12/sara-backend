import { describe, it, expect } from 'vitest';

// ============================================================
// AI RESPONSE VALIDATION TESTS
// Tests para validar que las respuestas de SARA cumplen reglas críticas
// ============================================================

// Función helper para validar respuestas
function validateSARAResponse(response: string, context: {
  leadName?: string;
  preguntaPorNogal?: boolean;
  preguntaPorAlberca?: boolean;
  preguntaPorRenta?: boolean;
  mensajeIngles?: boolean;
  clienteDiceNoInteresa?: boolean;
  clienteDiceYaCompro?: boolean;
  clienteDiceNoContactar?: boolean;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const respLower = response.toLowerCase();

  // REGLA 1: No inventar nombres si no hay leadName
  if (!context.leadName) {
    const nombresComunes = ['María', 'Maria', 'Juan', 'Pedro', 'Ana', 'Luis', 'Carlos',
      'Carmen', 'José', 'Jose', 'Rosa', 'Salma', 'Miguel', 'Laura', 'Antonio',
      'Sofía', 'Sofia', 'Diana', 'Jorge', 'Patricia', 'Roberto', 'Andrea'];
    for (const nombre of nombresComunes) {
      if (response.includes(`Hola ${nombre}`) ||
          response.includes(`${nombre},`) ||
          response.includes(`${nombre}!`)) {
        errors.push(`Nombre inventado detectado: "${nombre}" (lead sin nombre)`);
      }
    }
  }

  // REGLA 2: Citadella del Nogal - nunca decir que no lo tenemos
  if (context.preguntaPorNogal) {
    const frasesProhibidasNogal = [
      'no lo tenemos',
      'no tenemos el nogal',
      'no es de nuestros desarrollos',
      'no contamos con',
      'nogal no está disponible'
    ];
    for (const frase of frasesProhibidasNogal) {
      if (respLower.includes(frase)) {
        errors.push(`Error Nogal: dice "${frase}" (SÍ tenemos Nogal = Villa Campelo/Galiano)`);
      }
    }
    // Debe mencionar Villa Campelo o Galiano
    if (!respLower.includes('campelo') && !respLower.includes('galiano') && !respLower.includes('villa')) {
      errors.push('Error Nogal: no menciona Villa Campelo ni Villa Galiano');
    }
  }

  // REGLA 3: Alberca - SOLO Priv. Andes tiene
  if (context.preguntaPorAlberca) {
    const desarrollosSinAlberca = ['monte verde', 'distrito falco', 'los encinos', 'miravalle', 'alpes'];
    for (const desarrollo of desarrollosSinAlberca) {
      if (respLower.includes(desarrollo) && respLower.includes('alberca') &&
          !respLower.includes('no tiene alberca') && !respLower.includes('sin alberca')) {
        // Verificar si está diciendo incorrectamente que tiene alberca
        const regex = new RegExp(`${desarrollo}.*tiene.*alberca|${desarrollo}.*con.*alberca`, 'i');
        if (regex.test(response)) {
          errors.push(`Error Alberca: dice que ${desarrollo} tiene alberca (SOLO Andes tiene)`);
        }
      }
    }
  }

  // REGLA 4: No ofrecer rentas
  if (context.preguntaPorRenta) {
    const frasesRentaPositiva = [
      'sí tenemos rentas',
      'sí rentamos',
      'tenemos casas en renta',
      'opciones de renta'
    ];
    for (const frase of frasesRentaPositiva) {
      if (respLower.includes(frase)) {
        errors.push(`Error Renta: dice "${frase}" (SOLO vendemos, NO rentamos)`);
      }
    }
  }

  // REGLA 5: Si cliente dice "no me interesa", no ofrecer cita directa
  if (context.clienteDiceNoInteresa) {
    if (respLower.includes('sábado o domingo') || respLower.includes('sabado o domingo') ||
        respLower.includes('qué día te gustaría') || respLower.includes('qué día puedes') ||
        respLower.includes('qué día te funciona') || respLower.includes('qué día y hora')) {
      errors.push('Error: ofrece cita a cliente que dijo "no me interesa"');
    }
  }

  // REGLA 6: Si cliente ya compró, felicitar (no seguir vendiendo)
  if (context.clienteDiceYaCompro) {
    const frasesVenta = ['te muestro', 'te enseño', 'visita', 'agendar'];
    let sigueVendiendo = false;
    for (const frase of frasesVenta) {
      if (respLower.includes(frase)) {
        sigueVendiendo = true;
        break;
      }
    }
    if (sigueVendiendo && !respLower.includes('felicidad') && !respLower.includes('felicita')) {
      errors.push('Error: sigue vendiendo a cliente que ya compró (debe felicitar)');
    }
  }

  // REGLA 7: Respetar petición de no contacto
  if (context.clienteDiceNoContactar) {
    const frasesInsistentes = ['te muestro', 'te cuento', 'déjame', 'permíteme'];
    for (const frase of frasesInsistentes) {
      if (respLower.includes(frase)) {
        errors.push(`Error: insiste después de "no me contactes" (frase: "${frase}")`);
      }
    }
  }

  // REGLA 8: Respuestas en inglés si mensaje fue en inglés
  if (context.mensajeIngles) {
    const palabrasEspanol = ['hola', 'casa', 'precio', 'visita', 'gracias', 'desarrollo'];
    let tieneEspanol = false;
    for (const palabra of palabrasEspanol) {
      if (respLower.includes(palabra)) {
        tieneEspanol = true;
        break;
      }
    }
    if (tieneEspanol && !respLower.includes('mxn')) {
      errors.push('Error: responde en español a mensaje en inglés');
    }
  }

  // REGLA 9: No usar frases prohibidas
  const frasesProhibidas = [
    'sin problema',
    'no hay problema',
    'entendido roberto',
    'entendido juan',
    'le aviso a vendedor',
    'procedo a',
    'agradecemos su preferencia'
  ];
  for (const frase of frasesProhibidas) {
    if (respLower.includes(frase)) {
      errors.push(`Frase prohibida detectada: "${frase}"`);
    }
  }

  // REGLA 10: Respuestas no deben estar truncadas
  if (response.endsWith(',') || response.endsWith('...') && response.length < 50) {
    errors.push('Respuesta parece truncada');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================
// TESTS
// ============================================================

describe('AI Response Validation', () => {

  describe('Nombres inventados', () => {
    it('detecta nombre inventado cuando lead no tiene nombre', () => {
      const result = validateSARAResponse(
        '¡Hola María! Soy SARA de Grupo Santa Rita',
        { leadName: undefined }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Nombre inventado');
    });

    it('permite nombre real del lead', () => {
      const result = validateSARAResponse(
        '¡Hola Roberto! Soy SARA de Grupo Santa Rita',
        { leadName: 'Roberto García' }
      );
      expect(result.valid).toBe(true);
    });

    it('permite respuesta sin nombre', () => {
      const result = validateSARAResponse(
        '¡Hola! Soy SARA de Grupo Santa Rita 🏠',
        { leadName: undefined }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Citadella del Nogal', () => {
    it('detecta error si dice que no tenemos El Nogal', () => {
      const result = validateSARAResponse(
        'El Nogal no lo tenemos disponible actualmente',
        { preguntaPorNogal: true }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Error Nogal');
    });

    it('acepta respuesta correcta con Villa Campelo/Galiano', () => {
      const result = validateSARAResponse(
        'Citadella del Nogal tiene Villa Campelo desde $452,250 y Villa Galiano desde $552,750',
        { preguntaPorNogal: true }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Alberca (solo Andes)', () => {
    it('detecta error si dice que Falco tiene alberca', () => {
      const result = validateSARAResponse(
        'Distrito Falco tiene alberca y vigilancia 24/7',
        { preguntaPorAlberca: true }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Error Alberca');
    });

    it('acepta respuesta correcta mencionando Andes', () => {
      const result = validateSARAResponse(
        'Solo Priv. Andes tiene alberca. Casas desde $1.5M',
        { preguntaPorAlberca: true }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Rentas', () => {
    it('detecta error si ofrece rentas', () => {
      const result = validateSARAResponse(
        'Sí tenemos casas en renta, te puedo mostrar opciones',
        { preguntaPorRenta: true }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Error Renta');
    });

    it('acepta respuesta que aclara que solo vendemos', () => {
      const result = validateSARAResponse(
        'En Santa Rita solo vendemos casas, no rentamos. Pero con mensualidades desde $12K es como pagar renta',
        { preguntaPorRenta: true }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Objeciones - No me interesa', () => {
    it('detecta error si ofrece cita a quien dijo no interesa', () => {
      const result = validateSARAResponse(
        '¿Qué día te gustaría visitarnos?',
        { clienteDiceNoInteresa: true }
      );
      expect(result.valid).toBe(false);
    });

    it('acepta respuesta que hace pregunta de rescate', () => {
      const result = validateSARAResponse(
        'Entiendo. ¿Qué te detiene? Muchos pensaban igual y ahora son propietarios felices',
        { clienteDiceNoInteresa: true }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Ya compré en otro lado', () => {
    it('detecta error si sigue vendiendo', () => {
      const result = validateSARAResponse(
        '¡Qué interesante! Te muestro nuestras opciones también',
        { clienteDiceYaCompro: true }
      );
      expect(result.valid).toBe(false);
    });

    it('acepta respuesta que felicita', () => {
      const result = validateSARAResponse(
        '¡Muchas felicidades por tu nueva casa! Si algún familiar busca, aquí estaré',
        { clienteDiceYaCompro: true }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('No me contactes', () => {
    it('detecta error si insiste después de no contactar', () => {
      const result = validateSARAResponse(
        'Entiendo, pero déjame mostrarte una última opción',
        { clienteDiceNoContactar: true }
      );
      expect(result.valid).toBe(false);
    });

    it('acepta respuesta que respeta la decisión', () => {
      const result = validateSARAResponse(
        'Entendido, respeto tu decisión. Que tengas excelente día',
        { clienteDiceNoContactar: true }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Idioma inglés', () => {
    it('detecta respuesta en español a mensaje en inglés', () => {
      const result = validateSARAResponse(
        'Hola! Tenemos casas desde $1.5 millones',
        { mensajeIngles: true }
      );
      expect(result.valid).toBe(false);
    });

    it('acepta respuesta en inglés', () => {
      const result = validateSARAResponse(
        'Hi! We have homes starting at $1.5M MXN (~$88,000 USD)',
        { mensajeIngles: true }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Frases prohibidas', () => {
    it('detecta "sin problema"', () => {
      const result = validateSARAResponse(
        'Sin problema, cuando gustes me contactas',
        {}
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Frase prohibida');
    });

    it('detecta "le aviso a vendedor"', () => {
      const result = validateSARAResponse(
        'Perfecto, le aviso a vendedor para que te contacte',
        {}
      );
      expect(result.valid).toBe(false);
    });

    it('acepta respuesta sin frases prohibidas', () => {
      const result = validateSARAResponse(
        '¡Perfecto! ¿Qué día te gustaría visitarnos?',
        {}
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Respuestas truncadas', () => {
    it('detecta respuesta truncada con coma', () => {
      const result = validateSARAResponse(
        'Tenemos casas en Monte Verde,',
        {}
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('truncada');
    });

    it('acepta respuesta completa', () => {
      const result = validateSARAResponse(
        'Tenemos casas en Monte Verde desde $1.5M. ¿Te interesa visitarlo?',
        {}
      );
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================
// INTEGRATION TESTS - Validar respuestas reales del endpoint
// ============================================================

describe('AI Response Integration (mock)', () => {
  // Estas son respuestas mock que simulan lo que devolvería el endpoint
  // En un entorno real, se llamaría al endpoint /test-ai-response

  const mockResponses = {
    saludo: '¡Hola! Soy SARA de Grupo Santa Rita 🏠 Tenemos casas increíbles desde $1.5M. ¿Buscas 2 o 3 recámaras?',
    monteVerde: 'Monte Verde tiene 5 modelos: Acacia ($1.5M), Eucalipto ($1.9M), Olivo ($2.0M), Fresno ($2.4M), Fresno 2 ($2.6M). ¿Cuál te interesa?',
    alberca: '¡Sí tenemos desarrollo con alberca! Priv. Andes es nuestro único fraccionamiento con ALBERCA. ¿Te gustaría visitarlo?',
    nogal: 'Citadella del Nogal tiene Villa Campelo ($452,250) y Villa Galiano ($552,750). ¿Qué día te gustaría visitarlos?',
    renta: 'En Santa Rita solo vendemos casas, no rentamos. Pero la mensualidad puede ser similar a una renta. ¿Cuál es tu presupuesto?',
    noInteresa: 'Entiendo. Solo una pregunta: ¿rentas o ya tienes casa? Muchos que rentaban ahora tienen su casa propia.',
    yaCompro: '¡Muchas felicidades por tu nueva casa! 🎉 Si algún familiar busca, con gusto lo atiendo.',
    noContactar: 'Entendido, respeto tu decisión. Si en el futuro te interesa, aquí estaré. ¡Excelente día! 👋',
    english: 'Hi! We have homes from $1.5M MXN (~$88,000 USD). What budget do you have in mind?'
  };

  it('respuesta a saludo es válida', () => {
    const result = validateSARAResponse(mockResponses.saludo, {});
    expect(result.valid).toBe(true);
  });

  it('respuesta sobre Monte Verde es válida', () => {
    const result = validateSARAResponse(mockResponses.monteVerde, {});
    expect(result.valid).toBe(true);
  });

  it('respuesta sobre alberca es válida', () => {
    const result = validateSARAResponse(mockResponses.alberca, { preguntaPorAlberca: true });
    expect(result.valid).toBe(true);
  });

  it('respuesta sobre Nogal es válida', () => {
    const result = validateSARAResponse(mockResponses.nogal, { preguntaPorNogal: true });
    expect(result.valid).toBe(true);
  });

  it('respuesta sobre renta es válida', () => {
    const result = validateSARAResponse(mockResponses.renta, { preguntaPorRenta: true });
    expect(result.valid).toBe(true);
  });

  it('respuesta a "no me interesa" es válida', () => {
    const result = validateSARAResponse(mockResponses.noInteresa, { clienteDiceNoInteresa: true });
    expect(result.valid).toBe(true);
  });

  it('respuesta a "ya compré" es válida', () => {
    const result = validateSARAResponse(mockResponses.yaCompro, { clienteDiceYaCompro: true });
    expect(result.valid).toBe(true);
  });

  it('respuesta a "no me contactes" es válida', () => {
    const result = validateSARAResponse(mockResponses.noContactar, { clienteDiceNoContactar: true });
    expect(result.valid).toBe(true);
  });

  it('respuesta en inglés es válida', () => {
    const result = validateSARAResponse(mockResponses.english, { mensajeIngles: true });
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// EDGE CASE TESTS - Casos extremos adicionales
// ============================================================

describe('Edge Cases Adicionales', () => {
  describe('Mensajes de emoji solo', () => {
    it('valida respuesta a emoji positivo 👍', () => {
      // Emoji positivo debería continuar la conversación
      const response = '¡Perfecto! ¿Te gustaría agendar una visita?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
    });

    it('valida respuesta a emoji de casa 🏠', () => {
      const response = '¡Te interesa una casa! Tenemos desde 2 hasta 3 recámaras. ¿Cuántas necesitas?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Mensajes muy largos', () => {
    it('maneja respuesta a mensaje largo sin truncar', () => {
      const longResponse = 'Entiendo tu interés. ' + 'Tenemos varias opciones. '.repeat(20) + '¿Te agendo una visita?';
      const result = validateSARAResponse(longResponse, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Local comercial', () => {
    it('responde correctamente a pregunta de local comercial', () => {
      const response = 'Nuestros desarrollos son 100% residenciales, no tenemos locales comerciales. ¿Buscas casa?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
      expect(response.toLowerCase()).not.toContain('sí tenemos local');
    });
  });

  describe('Horarios de atención', () => {
    it('proporciona horarios correctos', () => {
      const response = 'Atendemos de lunes a viernes 9am-6pm y sábados 9am-2pm. ¿Qué día te queda mejor?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Competencia', () => {
    it('no critica a la competencia', () => {
      const response = 'Cada desarrollo tiene sus ventajas. Nosotros destacamos por la plusvalía en Zacatecas. ¿Te muestro?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
      // No debería criticar
      expect(response.toLowerCase()).not.toContain('mejor que');
      expect(response.toLowerCase()).not.toContain('son malos');
    });
  });

  describe('Spanglish', () => {
    it('entiende y responde a Spanglish', () => {
      // Un mensaje tipo "quiero house cerca del downtown"
      const response = '¡Claro! Tenemos casas en excelentes ubicaciones. ¿Qué zona te interesa?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Typos comunes', () => {
    it('detecta respuesta válida a mensaje con typos', () => {
      // "informasion monteverde" debería entenderse
      const response = 'Monte Verde tiene 5 modelos desde $1.5M. ¿Te gustaría conocerlo?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
      expect(response.toLowerCase()).toContain('monte verde');
    });
  });

  describe('Mensajes duplicados/spam', () => {
    it('maneja respuesta a 3+ mensajes idénticos', () => {
      const response = 'Noté que me enviaste el mismo mensaje varias veces. ¿Hay algo específico en lo que pueda ayudarte?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Urgencia de compra', () => {
    it('responde con opciones de entrega inmediata', () => {
      const response = 'Tengo opciones de ENTREGA INMEDIATA: Monte Verde, Los Encinos y Priv. Andes. ¿Cuál te gustaría visitar?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
      expect(response.toLowerCase()).toContain('inmediata');
    });
  });

  describe('Preguntas de financiamiento', () => {
    it('no inventa tasas de interés', () => {
      const response = 'Trabajamos con INFONAVIT, FOVISSSTE y varios bancos. Las tasas varían según tu perfil. ¿Tienes precalificación?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
      // No debería mencionar tasas específicas inventadas
      expect(response).not.toMatch(/\d+\.?\d*%.*anual/i);
    });
  });

  describe('Mascotas', () => {
    it('confirma que se aceptan mascotas', () => {
      const response = 'Sí, nuestros desarrollos aceptan mascotas. ¿Tienes perro o gato?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Preguntas fuera de tema', () => {
    it('redirige amablemente preguntas no relacionadas', () => {
      // Pregunta tipo "venden hamburguesas"
      const response = 'Jaja, solo vendemos casas, no hamburguesas 😄 ¿Buscas casa?';
      const result = validateSARAResponse(response, {});
      expect(result.valid).toBe(true);
      expect(response.toLowerCase()).toContain('casa');
    });
  });
});
