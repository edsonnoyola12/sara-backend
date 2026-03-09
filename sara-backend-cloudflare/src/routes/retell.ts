// ═══════════════════════════════════════════════════════════════════════════
// RETELL ROUTES - Voice call webhooks and configuration
// Extracted from index.ts for better code organization
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { formatPhoneForDisplay, getMexicoNow } from '../handlers/whatsapp-utils';
import { enviarMensajeTeamMember } from '../utils/teamMessaging';
import { ClaudeService } from '../services/claude';
import { AIConversationService } from '../services/aiConversationService';
import { logErrorToDB } from '../crons/healthCheck';
import { extractDevelopmentsFromText, getAllDevelopmentNames } from '../constants/developments';

import type { Env, CorsResponseFn, CheckApiAuthFn } from '../types/env';

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINAR OUTCOME DE LLAMADA
// Lee disconnection_reason de Retell + call_analysis para mapear a outcome preciso
// ═══════════════════════════════════════════════════════════════════════════
function determinarOutcome(call: any): string {
  const reason = call.disconnection_reason || '';

  // Razones de no-conexión (Retell disconnection_reason values)
  if (reason === 'dial_no_answer' || reason === 'no_answer') return 'no_answer';
  if (reason === 'dial_busy' || reason === 'busy') return 'busy';
  if (reason === 'dial_failed' || reason === 'call_failed') return 'failed';
  if (reason === 'voicemail_reached' || reason === 'machine_detected') return 'voicemail';

  // Si la llamada conectó, usar call_analysis
  if (call.call_analysis) {
    if (call.call_analysis.call_successful === true) return 'successful';
    if (call.call_analysis.call_successful === false) return 'not_interested';
  }

  // Si hubo duración > 10s, asumir que conectó pero sin análisis
  if (call.duration_ms && call.duration_ms > 10000) return 'successful';

  return 'unknown';
}

// Outcomes que ameritan reintento
const RETRYABLE_OUTCOMES = ['no_answer', 'busy', 'failed', 'voicemail'];

export async function handleRetellRoutes(
  url: URL,
  request: Request,
  env: Env,
  supabase: SupabaseService,
  corsResponse: CorsResponseFn,
  checkApiAuth: CheckApiAuthFn
): Promise<Response | null> {
    if (url.pathname === '/configure-retell-inbound' && request.method === 'GET') {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        const { createRetellService } = await import('../services/retellService');
        const retell = createRetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID || '', env.RETELL_PHONE_NUMBER || '');

        // 1. Listar números de teléfono para encontrar el ID
        const phoneNumbersRaw = await retell.listPhoneNumbers();
        // Retell puede devolver un array directo o un objeto con key
        const phoneNumbers = Array.isArray(phoneNumbersRaw) ? phoneNumbersRaw : (phoneNumbersRaw as any)?.phone_numbers || (phoneNumbersRaw as any)?.data || [];
        if (!phoneNumbers || phoneNumbers.length === 0) {
          return corsResponse(JSON.stringify({
            error: 'No se encontraron números en Retell',
            raw_response: phoneNumbersRaw,
            retell_phone_number_env: env.RETELL_PHONE_NUMBER || 'NOT SET'
          }), 400);
        }

        // Buscar el número de SARA (desde env, sin fallback hardcodeado)
        const saraNumber = env.RETELL_PHONE_NUMBER;
        const saraNumberClean = saraNumber.replace('+', '');
        const found = phoneNumbers.find((pn: any) =>
          pn.phone_number?.replace('+', '') === saraNumberClean ||
          pn.phone_number === saraNumber
        );

        if (!found) {
          return corsResponse(JSON.stringify({
            error: `Número ${saraNumber} no encontrado en Retell`,
            available_numbers: phoneNumbers.map((pn: any) => ({
              phone_number: pn.phone_number,
              inbound_agent_id: pn.inbound_agent_id || 'NOT SET'
            }))
          }), 400);
        }

        const currentInboundAgent = found.inbound_agent_id;
        const forceReconfigure = url.searchParams.get('force') === 'true';

        // 2. Verificar si ya está configurado (skip si force=true)
        if (!forceReconfigure && currentInboundAgent === (env.RETELL_AGENT_ID || '')) {
          return corsResponse(JSON.stringify({
            success: true,
            message: 'Inbound ya estaba configurado',
            phone_number: found.phone_number,
            inbound_agent_id: currentInboundAgent,
            inbound_agent_version: found.inbound_agent_version,
            agent_current_version: found.version,
            hint: 'Usa ?force=true para re-configurar'
          }));
        }

        // 3. Configurar inbound_agent_id + webhook URL limpia
        const result = await retell.configureInbound(found.phone_number);

        if (result.success) {
          return corsResponse(JSON.stringify({
            success: true,
            message: 'Inbound configurado exitosamente',
            phone_number: found.phone_number,
            agent_id: env.RETELL_AGENT_ID,
            previous_inbound_agent: currentInboundAgent || 'NONE',
            retell_response: result.data
          }));
        } else {
          return corsResponse(JSON.stringify({
            success: false,
            error: result.error,
            phone_number: found.phone_number
          }), 500);
        }
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEBUG RETELL CONFIG - Ver configuración completa del agente y LLM
    // USO: /debug-retell?api_key=XXX
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === '/debug-retell' && request.method === 'GET') {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        const { createRetellService } = await import('../services/retellService');
        const retell = createRetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID || '', env.RETELL_PHONE_NUMBER || '');

        const agent = await retell.getAgent();
        const llmId = agent?.response_engine?.llm_id;
        let llm = null;
        if (llmId) {
          llm = await retell.getLlm(llmId);
        }

        // Also get phone number details and concurrency
        const phoneNumbers = await retell.listPhoneNumbers();
        const phoneDetails = Array.isArray(phoneNumbers) ? phoneNumbers : [];
        const concurrency = await retell.getConcurrency();

        return corsResponse(JSON.stringify({
          agent,
          llm,
          concurrency,
          phone_numbers: phoneDetails,
          env_vars: {
            RETELL_AGENT_ID: env.RETELL_AGENT_ID || 'NOT SET',
            RETELL_PHONE_NUMBER: env.RETELL_PHONE_NUMBER || 'NOT SET',
            RETELL_API_KEY: env.RETELL_API_KEY ? 'SET' : 'NOT SET'
          }
        }, null, 2));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RETELL VOICES - Listar voces disponibles (para elegir la mejor)
    // USO: /retell-voices?api_key=XXX&lang=es
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === '/retell-voices' && request.method === 'GET') {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        const { createRetellService } = await import('../services/retellService');
        const retell = createRetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID || '', env.RETELL_PHONE_NUMBER || '');

        const allVoices = await retell.listVoices();
        const langFilter = url.searchParams.get('lang') || '';
        const genderFilter = url.searchParams.get('gender') || '';

        let filtered = allVoices;
        if (langFilter) {
          filtered = filtered.filter((v: any) => {
            const lang = (v.language || '').toLowerCase();
            const accent = (v.accent || '').toLowerCase();
            const name = (v.voice_name || v.name || '').toLowerCase();
            return lang.includes(langFilter.toLowerCase()) ||
                   accent.includes(langFilter.toLowerCase()) ||
                   name.includes(langFilter.toLowerCase());
          });
        }
        if (genderFilter) {
          filtered = filtered.filter((v: any) =>
            (v.gender || '').toLowerCase().includes(genderFilter.toLowerCase())
          );
        }

        // Get current agent voice
        const agent = await retell.getAgent();
        const currentVoiceId = agent?.voice_id || 'unknown';
        const currentVoiceModel = agent?.voice_model || 'unknown';

        return corsResponse(JSON.stringify({
          current_voice_id: currentVoiceId,
          current_voice_model: currentVoiceModel,
          total_voices: allVoices.length,
          filtered_count: filtered.length,
          voices: filtered.map((v: any) => ({
            voice_id: v.voice_id,
            name: v.voice_name || v.name,
            provider: v.provider,
            gender: v.gender,
            accent: v.accent,
            language: v.language,
            age: v.age,
            preview_audio_url: v.preview_audio_url
          }))
        }));
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURE RETELL TOOLS - Registrar custom tools en el LLM de Retell
    // USO: /configure-retell-tools?api_key=XXX&voice_id=XXX (optional)
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname === '/configure-retell-tools' && request.method === 'GET') {
      try {
        const authError = checkApiAuth(request, env);
        if (authError) return authError;

        const { createRetellService } = await import('../services/retellService');
        const retell = createRetellService(env.RETELL_API_KEY, env.RETELL_AGENT_ID || '', env.RETELL_PHONE_NUMBER || '');

        // 1. Obtener agent para encontrar el llm_id
        const agent = await retell.getAgent();
        if (!agent) {
          return corsResponse(JSON.stringify({ error: 'No se pudo obtener el agente de Retell' }), 500);
        }

        const llmId = agent.response_engine?.llm_id;
        if (!llmId) {
          return corsResponse(JSON.stringify({
            error: 'El agente no tiene un Retell LLM configurado',
            agent_id: agent.agent_id,
            response_engine: agent.response_engine
          }), 400);
        }

        // 2. Obtener LLM actual para ver tools existentes
        const llm = await retell.getLlm(llmId);
        const existingTools = llm?.general_tools || [];

        // 3. Consultar precios reales de la BD para el prompt dinámico
        const { data: allProperties } = await supabase.client
          .from('properties')
          .select('name, development, price, price_equipped');

        // Helper: precio mínimo equipado por desarrollo
        function getMinPriceByDev(devName: string): number {
          if (!allProperties) return 0;
          const devProps = allProperties.filter((p: any) =>
            (p.development || '').toLowerCase().includes(devName.toLowerCase())
          );
          if (devProps.length === 0) return 0;
          return devProps.reduce((min: number, p: any) => {
            const precio = p.price_equipped || p.price || 0;
            return precio > 0 && precio < min ? precio : min;
          }, Infinity);
        }

        // Helper: convertir precio numérico a palabras en español (para voz)
        function precioAPalabras(precio: number): string {
          if (precio <= 0) return 'precio por confirmar';

          // Convertir número (0-999) a palabras en español
          function numATexto(n: number): string {
            if (n === 0) return '';
            const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
            const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
            const decenas = ['', '', 'veinti', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
            const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

            if (n === 100) return 'cien';

            let texto = '';
            if (n >= 100) {
              texto += centenas[Math.floor(n / 100)] + ' ';
              n = n % 100;
            }
            if (n >= 20) {
              const dec = Math.floor(n / 10);
              const uni = n % 10;
              if (dec === 2 && uni > 0) {
                texto += 'veinti' + unidades[uni];
              } else {
                texto += decenas[dec] + (uni > 0 ? ' y ' + unidades[uni] : '');
              }
            } else if (n >= 10) {
              texto += especiales[n - 10];
            } else if (n > 0) {
              texto += unidades[n];
            }
            return texto.trim();
          }

          // Convertir miles (0-999) a palabras + "mil"
          function milesATexto(miles: number): string {
            if (miles === 0) return '';
            if (miles === 1) return 'mil';
            return numATexto(miles) + ' mil';
          }

          const millones = Math.floor(precio / 1000000);
          const restoMiles = Math.round((precio % 1000000) / 1000);

          if (millones >= 1 && restoMiles === 0) {
            if (millones === 1) return 'un millón de pesos';
            return `${numATexto(millones)} millones de pesos`;
          }

          if (millones >= 1) {
            const milPalabra = milesATexto(restoMiles);
            if (millones === 1) return `un millón ${milPalabra} pesos`;
            return `${numATexto(millones)} millones ${milPalabra} pesos`;
          }

          // Solo miles (para terrenos precio/m²)
          if (precio >= 1000) {
            return `${milesATexto(Math.round(precio / 1000))} pesos`;
          }
          return `${numATexto(precio)} pesos`;
        }

        // Helper: rango de precio/m² para terrenos
        function precioM2Palabras(devName: string): string {
          if (!allProperties) return 'precio por confirmar';
          const devProps = allProperties.filter((p: any) =>
            (p.development || '').toLowerCase().includes(devName.toLowerCase())
          );
          if (devProps.length === 0) return 'precio por confirmar';
          const precios = devProps.map((p: any) => p.price_equipped || p.price || 0).filter((x: number) => x > 0);
          if (precios.length === 0) return 'precio por confirmar';
          const min = Math.min(...precios);
          const max = Math.max(...precios);
          if (min === max) return precioAPalabras(min) + ' por metro cuadrado';
          return `${precioAPalabras(min)} a ${precioAPalabras(max)} por metro cuadrado`;
        }

        // Precios dinámicos por desarrollo
        const precioMonteVerde = getMinPriceByDev('Monte Verde');
        const precioEncinos = getMinPriceByDev('Los Encinos');
        const precioMiravalle = getMinPriceByDev('Miravalle');
        const precioColorines = getMinPriceByDev('Paseo Colorines');
        const precioAndes = getMinPriceByDev('Andes');
        const precioFalco = getMinPriceByDev('Distrito Falco');

        // Precio mínimo global (para objeciones "caro")
        const todosPrecios = [precioMonteVerde, precioEncinos, precioMiravalle, precioColorines, precioAndes, precioFalco].filter(p => p > 0 && p < Infinity);
        const precioMinimoGlobal = todosPrecios.length > 0 ? Math.min(...todosPrecios) : 1600000;

        // Lista dinámica de desarrollos desde DB (para tool descriptions)
        const desarrollosFromDB = allProperties
          ? [...new Set(allProperties.map((p: any) => p.development || p.name || '').filter((d: string) => d && d.length > 2))]
          : ['Monte Verde', 'Los Encinos', 'Miravalle', 'Distrito Falco', 'Andes', 'Paseo Colorines', 'Citadella del Nogal', 'Villa Campelo', 'Villa Galiano'];
        const desarrollosListStr = desarrollosFromDB.join(', ');

        // 4. Definir las custom tools de SARA
        const baseUrl = 'https://sara-backend.edson-633.workers.dev';
        const saraTools: any[] = [
          {
            type: 'end_call',
            name: 'end_call',
            description: 'Termina la llamada cuando el cliente se despide o no necesita nada más.'
          },
          {
            type: 'custom',
            name: 'buscar_info_desarrollo',
            description: 'Busca información detallada de un desarrollo inmobiliario específico: modelos, precios, recámaras, metros cuadrados. Usa SOLO cuando el cliente pregunte por un desarrollo específico por nombre.',
            url: `${baseUrl}/webhook/retell/tool/info-desarrollo`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 8000,
            parameters: {
              type: 'object',
              properties: {
                desarrollo: {
                  type: 'string',
                  description: `Nombre del desarrollo. Opciones: ${desarrollosListStr}`
                }
              },
              required: ['desarrollo']
            }
          },
          {
            type: 'custom',
            name: 'buscar_por_presupuesto',
            description: 'Busca TODAS las casas de TODOS los desarrollos que se ajusten a un presupuesto. Usa esta herramienta cuando el cliente diga cuánto tiene para gastar o su presupuesto. Ejemplo: "tengo 5 millones", "mi presupuesto es 2 millones", "busco algo de 3 millones".',
            url: `${baseUrl}/webhook/retell/tool/buscar-por-presupuesto`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 8000,
            parameters: {
              type: 'object',
              properties: {
                presupuesto: {
                  type: 'number',
                  description: 'Presupuesto del cliente en pesos mexicanos. Ejemplo: 5000000 para 5 millones.'
                },
                recamaras: {
                  type: 'number',
                  description: 'Número mínimo de recámaras deseadas (opcional). Si no lo dice, dejar en 0.'
                }
              },
              required: ['presupuesto']
            }
          },
          {
            type: 'custom',
            name: 'agendar_cita',
            description: 'Agenda una cita de visita. Usa esta herramienta en cuanto tengas nombre, fecha y hora. Si no sabe qué desarrollo, usa "Oficinas Santa Rita" como punto de encuentro.',
            url: `${baseUrl}/webhook/retell/tool/agendar-cita`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 15000,
            parameters: {
              type: 'object',
              properties: {
                nombre_cliente: { type: 'string', description: 'Nombre completo del cliente' },
                desarrollo: { type: 'string', description: 'Nombre del desarrollo a visitar' },
                fecha: { type: 'string', description: 'Fecha de la cita. Puede ser relativa (sábado, mañana, lunes) o absoluta (2026-02-15)' },
                hora: { type: 'string', description: 'Hora de la cita (ejemplo: 11:00, 10 am, 4 de la tarde)' }
              },
              required: ['nombre_cliente', 'desarrollo', 'fecha', 'hora']
            }
          },
          {
            type: 'custom',
            name: 'cancelar_cita',
            description: 'Cancela la cita próxima del cliente. Usa cuando el cliente diga que quiere cancelar su cita.',
            url: `${baseUrl}/webhook/retell/tool/cancelar-cita`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 8000,
            parameters: {
              type: 'object',
              properties: {
                razon: { type: 'string', description: 'Razón de la cancelación' }
              },
              required: []
            }
          },
          {
            type: 'custom',
            name: 'cambiar_cita',
            description: 'Reagenda la cita del cliente a una nueva fecha y hora. Usa cuando quiera cambiar su cita existente.',
            url: `${baseUrl}/webhook/retell/tool/cambiar-cita`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 12000,
            parameters: {
              type: 'object',
              properties: {
                nueva_fecha: { type: 'string', description: 'Nueva fecha (sábado, mañana, 2026-02-15, etc.)' },
                nueva_hora: { type: 'string', description: 'Nueva hora (11:00, 10 am, etc.)' }
              },
              required: ['nueva_fecha', 'nueva_hora']
            }
          },
          {
            type: 'custom',
            name: 'enviar_info_whatsapp',
            description: 'Envía información al cliente por WhatsApp: brochure, ubicación GPS, video, o info general de un desarrollo. Usa cuando el cliente pida que le mandes info.',
            url: `${baseUrl}/webhook/retell/tool/enviar-whatsapp`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 8000,
            parameters: {
              type: 'object',
              properties: {
                tipo: { type: 'string', description: 'Tipo de info: brochure, ubicacion, video, info' },
                desarrollo: { type: 'string', description: 'Nombre del desarrollo' }
              },
              required: ['tipo', 'desarrollo']
            }
          },
          {
            type: 'custom',
            name: 'consultar_credito',
            description: 'Consulta información sobre crédito hipotecario. Soporta: INFONAVIT (subcuenta+salario), FOVISSSTE (gobierno), bancario (BBVA, Banorte, Santander, HSBC, Scotiabank), y Cofinavit (INFONAVIT+banco). Calcula capacidad de crédito basada en ingreso mensual. Usa cuando el cliente pregunte por financiamiento, crédito, enganche, mensualidades, o cómo pagar.',
            url: `${baseUrl}/webhook/retell/tool/info-credito`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 8000,
            parameters: {
              type: 'object',
              properties: {
                ingreso_mensual: { type: 'number', description: 'Ingreso mensual del cliente en pesos' },
                tipo_credito: { type: 'string', description: 'Tipo de crédito: infonavit, fovissste, bancario, cofinavit' }
              },
              required: []
            }
          },
          {
            type: 'custom',
            name: 'consultar_citas',
            description: 'Consulta las citas próximas del cliente. Usa cuando pregunte por su cita o quiera verificar fecha/hora.',
            url: `${baseUrl}/webhook/retell/tool/consultar-citas`,
            method: 'POST',
            speak_during_execution: false,
            timeout_ms: 8000,
            parameters: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ];

        // 5. Definir el prompt de SARA para llamadas INBOUND (precios dinámicos de DB)
        const saraPrompt = `Eres SARA, asistente virtual de ventas de Grupo Santa Rita, inmobiliaria en Zacatecas. Eres IA, no persona real.

REGLA #1: Habla CORTO. Máximo una o dos oraciones por turno. Es llamada telefónica, no discurso.
REGLA #2: UNA sola pregunta por turno. Nunca dos preguntas juntas.
REGLA #3: Precios SIEMPRE en palabras: "un millón seiscientos mil pesos", nunca números ni abreviaciones.
REGLA #4: No te cicles. Si ya tienes nombre, día y hora, agenda de una vez con la herramienta.
REGLA #5: NUNCA pidas el celular ni el teléfono del cliente. Ya estás hablando con él por teléfono, ya tienes su número.
REGLA #6: SÍ puedes enviar info por WhatsApp. Usa la herramienta enviar_info_whatsapp. Di UNA VEZ "Te mando la info por WhatsApp" y ESPERA el resultado de la herramienta. NO repitas que lo estás enviando.
REGLA #6.1: ANTI-LOOP: Cuando uses CUALQUIER herramienta, di UNA sola frase corta y ESPERA en silencio el resultado. NUNCA repitas "te lo envío" o "estoy buscando". Si ya dijiste que vas a hacer algo, NO lo repitas.
REGLA #7: NUNCA sugieras un día específico (sábado, domingo, fin de semana, finde, mañana). SIEMPRE pregunta abierto: "¿Qué día te queda bien?" y espera a que EL CLIENTE diga el día.
REGLA #8: Cuando el cliente dice su nombre, RECUÉRDALO. No lo vuelvas a preguntar. Si ya lo tienes, úsalo directamente al agendar.
REGLA #9: Cuando el cliente da presupuesto, usa la herramienta buscar_por_presupuesto. Presenta TODAS las opciones que te devuelva, agrupadas por desarrollo y zona. No elijas solo una.

Variables: {{call_direction}} (inbound/outbound), {{lead_name}}, {{is_new_lead}}, {{desarrollo_interes}}, {{vendedor_nombre}}, {{motivo}}, {{motivo_instrucciones}}

CONTEXTO DE ESTA LLAMADA: {{motivo_instrucciones}}

Si inbound: el saludo ya se envió, NO lo repitas. Escucha y responde.
Si outbound: el saludo ya se envió. Sigue las instrucciones del CONTEXTO DE ESTA LLAMADA. Menciona {{desarrollo_interes}} si tiene valor.

FLUJO DE VENTA:
1. Pregunta qué buscan: "¿Buscas casa o terreno?" Si casa: "¿De dos o tres recámaras? ¿Y tienes un presupuesto en mente?"
2. Con presupuesto, usa la herramienta buscar_por_presupuesto. Menciona TODAS las opciones que devuelva, agrupadas por desarrollo y zona. No elijas solo una.
3. Si NO tiene presupuesto, ofrece rangos: "Tenemos casas accesibles desde ${precioAPalabras(precioMinimoGlobal)}, y opciones premium con domótica y alberca. ¿Qué rango te acomoda?"
4. "¿Te gustaría conocerlo? ¿Qué día te queda para visitarlas?"
5. Pide nombre, agenda con la herramienta. Listo.

CITAS:
- Zacatecas (Monte Verde, Los Encinos, Miravalle, Paseo Colorines): "Te veo en las oficinas de Santa Rita en Colinas del Padre"
- Guadalupe (Andes, Distrito Falco, Citadella): "Te veo directamente en el desarrollo"
- Dos desarrollos: "Empezamos con uno y de ahí vamos al otro. ¿Qué día te queda para visitarlas?"
- Si dice un día sin hora, pregunta: "¿A qué hora te queda bien?"
- Después de agendar: "¡Listo, te esperamos! Te mando la ubicación por WhatsApp"

DESARROLLOS (menciona zona solo si el cliente pregunta):
Accesibles (desde ${precioAPalabras(precioMinimoGlobal)}):
- Monte Verde (Colinas del Padre): desde ${precioAPalabras(precioMonteVerde)}, 2 y 3 recámaras
- Priv. Andes (Vialidad Siglo Veintiuno): desde ${precioAPalabras(precioAndes)}, ÚNICO CON ALBERCA, gym, asadores

Premium (desde tres millones):
- Los Encinos (Colinas del Padre): desde ${precioAPalabras(precioEncinos)}, amplias, muy seguro
- Miravalle (Colinas del Padre): desde ${precioAPalabras(precioMiravalle)}, moderno
- Paseo Colorines (Colinas del Padre): desde ${precioAPalabras(precioColorines)}
- Distrito Falco (Calzada Solidaridad): desde ${precioAPalabras(precioFalco)}, premium, domótica

Terrenos:
- Citadella del Nogal: Villa Campelo ${precioM2Palabras('Villa Campelo')}, Villa Galiano ${precioM2Palabras('Villa Galiano')}

OBJECIONES (responde corto y cierra con pregunta):
- Caro: "Tenemos desde ${precioAPalabras(precioMinimoGlobal)}. ¿Cuál es tu presupuesto?"
- Pensar: "Con veinte mil de apartado congelas precio. ¿Te gustaría al menos conocerlo? ¿Qué día te queda bien?"
- Lejos: "La plusvalía es del ocho al diez por ciento anual. ¿Te gustaría conocer la zona?"
- Sin enganche: "INFONAVIT financia hasta el cien por ciento. ¿Ya tienes tu precalificación?"
- Urge: "Tenemos entrega inmediata en Monte Verde, Encinos y Andes"
- 4 o 5 recámaras: "Tenemos de tres recámaras muy amplias, hasta doscientos quince metros. Se pueden adecuar espacios. ¿Te gustaría conocerlas?"
- Competencia: no critiques. "Nosotros no cobramos cuota de mantenimiento"

INFO RÁPIDA:
- Apartado: veinte mil pesos reembolsable
- Enganche: diez por ciento mínimo
- Créditos: INFONAVIT, FOVISSSTE, BBVA, Banorte, HSBC, Banregio, Santander, Scotiabank
- Entrega: tres a cuatro meses
- Sin cuota de mantenimiento
- Mascotas: sí excepto Distrito Falco
- SOLO vendemos, NO rentamos
- SOLO Andes tiene alberca
- Precios equipados (closets y cocina) por default
- No inventes tasas de interés

CASOS ESPECIALES:
- Renta: "Solo vendemos. Pero la mensualidad puede quedar similar a una renta. ¿Cuánto pagas?"
- Ya compró: "¡Felicidades! Si algún familiar busca, con gusto lo atiendo"
- Persona real: "Soy SARA, asistente virtual. Si prefieres, te comunico con un asesor"
- No contacto: "Respeto tu decisión. ¡Excelente día!" y usa end_call
- Inglés: responde en inglés, precios en pesos y dólares
- Se despide: usa end_call
- Pide humano: "Te comunico con tu asesor. También puedes escribirnos por WhatsApp"
- No sabes algo: usa la herramienta adecuada`;

        // 6. Actualizar el LLM con tools + prompt
        const updateResult = await retell.updateLlm(llmId, {
          general_tools: saraTools,
          general_prompt: saraPrompt
        });

        // 7. Configurar begin_message + voz en el agente
        // Usa {{greeting}} que viene del lookup webhook
        // voice_id se puede pasar como query param para overridear
        const voiceIdParam = url.searchParams.get('voice_id') || '';
        const agentUpdates: Record<string, any> = {
          begin_message: '{{greeting}}',
          webhook_url: 'https://sara-backend.edson-633.workers.dev/webhook/retell'
        };
        if (voiceIdParam) {
          agentUpdates.voice_id = voiceIdParam;
        }
        const agentUpdate = await retell.updateAgent(agent.agent_id, agentUpdates);

        if (updateResult.success) {
          return corsResponse(JSON.stringify({
            success: true,
            message: `${saraTools.length} tools + prompt dinámico + begin_message configurados`,
            agent_id: agent.agent_id,
            llm_id: llmId,
            tools: saraTools.map(t => ({ name: t.name, type: t.type })),
            previous_tools_count: existingTools.length,
            prompt_length: saraPrompt.length,
            begin_message: '{{greeting}}',
            voice_id: voiceIdParam || '(sin cambio)',
            agent_update: agentUpdate.success ? 'ok' : agentUpdate.error,
            precios_dinamicos: {
              monte_verde: precioMonteVerde < Infinity ? `$${(precioMonteVerde/1000000).toFixed(2)}M` : 'N/A',
              los_encinos: precioEncinos < Infinity ? `$${(precioEncinos/1000000).toFixed(2)}M` : 'N/A',
              miravalle: precioMiravalle < Infinity ? `$${(precioMiravalle/1000000).toFixed(2)}M` : 'N/A',
              paseo_colorines: precioColorines < Infinity ? `$${(precioColorines/1000000).toFixed(2)}M` : 'N/A',
              andes: precioAndes < Infinity ? `$${(precioAndes/1000000).toFixed(2)}M` : 'N/A',
              distrito_falco: precioFalco < Infinity ? `$${(precioFalco/1000000).toFixed(2)}M` : 'N/A',
              minimo_global: `$${(precioMinimoGlobal/1000000).toFixed(2)}M`
            }
          }));
        } else {
          return corsResponse(JSON.stringify({
            success: false,
            error: updateResult.error,
            llm_id: llmId
          }), 500);
        }
      } catch (e: any) {
        return corsResponse(JSON.stringify({ error: e.message }), 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // Retell.ai - Pre-Call Lookup (buscar lead antes de contestar)
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/retell/lookup' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        console.log(`📞 RETELL LOOKUP: Buscando lead para llamada...`, JSON.stringify(body));

        // Retell envía el número del que llama en from_number
        const callerPhone = body.from_number?.replace('+', '') || body.to_number?.replace('+', '');
        const callId = body.call_id || '';

        // Guardar phone→call_id en KV para que los tools puedan resolver el teléfono
        if (callerPhone && callId && env.SARA_CACHE) {
          await env.SARA_CACHE.put(`retell_call_phone:${callId}`, callerPhone, { expirationTtl: 3600 });
          // También guardar como "última llamada" para fallback
          await env.SARA_CACHE.put('retell_last_caller_phone', callerPhone, { expirationTtl: 3600 });
          console.log(`📞 RETELL LOOKUP: Guardado phone ${callerPhone} para call_id ${callId}`);
        }

        const defaultGreeting = '¡Hola! Gracias por llamar a Grupo Santa Rita, soy Sara. Estoy aquí para apoyarte en lo que necesites — casas, terrenos, crédito. ¿Con quién tengo el gusto?';

        // Calcular precio mínimo global dinámico
        const { data: minPriceProps } = await supabase.client
          .from('properties')
          .select('price_equipped, price')
          .order('price_equipped', { ascending: true })
          .limit(10);
        let precioDesdeGlobal = '$1.6 millones';
        if (minPriceProps && minPriceProps.length > 0) {
          const minP = minPriceProps.reduce((min: number, p: any) => {
            const precio = p.price_equipped || p.price || 0;
            return precio > 0 && precio < min ? precio : min;
          }, Infinity);
          if (minP < Infinity) {
            precioDesdeGlobal = `$${(minP / 1000000).toFixed(1)} millones`;
          }
        }

        if (!callerPhone) {
          console.log('📞 RETELL LOOKUP: No se recibió número de teléfono');
          return new Response(JSON.stringify({
            dynamic_variables: {
              call_direction: 'inbound',
              lead_name: '',
              is_new_lead: 'true',
              greeting: defaultGreeting,
              desarrollo_interes: '',
              vendedor_nombre: 'un asesor',
              precio_desde: precioDesdeGlobal
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Buscar lead en base de datos
        const { data: lead } = await supabase.client
          .from('leads')
          .select('id, name, phone, status, notes, assigned_to, property_interest')
          .or(`phone.eq.${callerPhone},phone.like.%${callerPhone.slice(-10)}`)
          .maybeSingle();

        if (lead && lead.name && lead.name !== 'Lead Telefónico' && lead.name !== 'Lead') {
          // Lead conocido con nombre real - saludar por nombre
          const nombre = lead.name?.split(' ')[0] || 'Cliente'; // Solo primer nombre
          console.log(`📞 RETELL LOOKUP: Lead encontrado - ${lead.name} (${callerPhone})`);

          // Buscar desarrollo de interés: primero property_interest, luego notes
          let desarrolloInteres = lead.property_interest || '';
          if (!desarrolloInteres && lead.notes) {
            const notesStr = typeof lead.notes === 'string' ? lead.notes : JSON.stringify(lead.notes);
            const matchDesarrollo = notesStr.match(/desarrollo[:\s]*([\w\s]+)/i);
            if (matchDesarrollo) desarrolloInteres = matchDesarrollo[1].trim();
          }

          // Buscar vendedor asignado
          let vendedorNombre = 'un asesor';
          if (lead.assigned_to) {
            const { data: vendorLookup } = await supabase.client
              .from('team_members')
              .select('name')
              .eq('id', lead.assigned_to)
              .maybeSingle();
            if (vendorLookup?.name) vendedorNombre = vendorLookup.name.split(' ')[0];
          }

          // Buscar precio del desarrollo de interés
          let precioDesde = precioDesdeGlobal;
          if (desarrolloInteres) {
            const { data: propPrecio } = await supabase.client
              .from('properties')
              .select('price_equipped, price')
              .ilike('development', `%${desarrolloInteres}%`)
              .limit(5);
            if (propPrecio && propPrecio.length > 0) {
              const minPrecio = propPrecio.reduce((min: number, p: any) => {
                const precio = p.price_equipped || p.price || 0;
                return precio > 0 && precio < min ? precio : min;
              }, Infinity);
              if (minPrecio < Infinity) {
                precioDesde = `$${(minPrecio / 1000000).toFixed(1)} millones`;
              }
            }
          }

          const greetingConDesarrollo = desarrolloInteres
            ? `¡Hola de nuevo ${nombre}! Qué gusto que nos vuelvas a llamar. Soy Sara de Grupo Santa Rita. La vez pasada platicamos de ${desarrolloInteres}. ¿En qué te puedo ayudar?`
            : `¡Hola de nuevo ${nombre}! Qué gusto que nos vuelvas a llamar. Soy Sara de Grupo Santa Rita. ¿En qué te puedo ayudar?`;

          return new Response(JSON.stringify({
            dynamic_variables: {
              call_direction: 'inbound',
              lead_name: nombre,
              lead_full_name: lead.name,
              lead_id: lead.id,
              is_new_lead: 'false',
              desarrollo_interes: desarrolloInteres,
              greeting: greetingConDesarrollo,
              vendedor_nombre: vendedorNombre,
              precio_desde: precioDesde
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          // Lead nuevo - pedir nombre PRIMERO para personalizar la llamada
          console.log(`📞 RETELL LOOKUP: Número nuevo - ${callerPhone}`);
          return new Response(JSON.stringify({
            dynamic_variables: {
              call_direction: 'inbound',
              lead_name: '',
              is_new_lead: 'true',
              greeting: defaultGreeting,
              desarrollo_interes: '',
              vendedor_nombre: 'un asesor',
              precio_desde: precioDesdeGlobal
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (error) {
        console.error('❌ Retell Lookup Error:', error);
        try { await logErrorToDB(supabase, 'retell_lookup_error', (error as Error).message || String(error), { severity: 'error', source: 'retell.ts', stack: (error as Error).stack?.substring(0, 1000) }); } catch {}
        return new Response(JSON.stringify({
          dynamic_variables: {
            call_direction: 'inbound',
            lead_name: '',
            is_new_lead: 'true',
            greeting: '¡Hola! Gracias por llamar a Grupo Santa Rita, soy Sara. Estoy aquí para apoyarte en lo que necesites — casas, terrenos, crédito. ¿Con quién tengo el gusto?',
            desarrollo_interes: '',
            vendedor_nombre: 'un asesor',
            precio_desde: '$1.6 millones'
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Retell Custom Tools - SARA ejecuta acciones durante la llamada
    // ═══════════════════════════════════════════════════════════════

    // TOOL: Buscar información de un desarrollo
    if (url.pathname === '/webhook/retell/tool/info-desarrollo' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        const desarrollo = args.desarrollo || '';
        console.log(`🔧 RETELL TOOL info-desarrollo: ${desarrollo}`);

        if (!desarrollo) {
          return new Response(JSON.stringify({
            result: 'No especificaste el desarrollo. Pregúntale al cliente cuál le interesa. Opciones: Monte Verde, Los Encinos, Miravalle, Distrito Falco, Andes, Paseo Colorines, Citadella del Nogal (terrenos).'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const { data: props } = await supabase.client
          .from('properties')
          .select('name, development, price, price_equipped, bedrooms, bathrooms, area_m2, land_size, gps_link, brochure_urls, youtube_link')
          .ilike('development', `%${desarrollo}%`);

        if (!props || props.length === 0) {
          // Construir lista dinámica de desarrollos con precios mínimos de DB
          const { data: allDevProps } = await supabase.client
            .from('properties')
            .select('development, price_equipped, price');
          const devMap = new Map<string, number>();
          if (allDevProps) {
            for (const p of allDevProps) {
              const dev = p.development || '';
              const precio = p.price_equipped || p.price || 0;
              if (dev && precio > 0) {
                const current = devMap.get(dev) || Infinity;
                if (precio < current) devMap.set(dev, precio);
              }
            }
          }
          const devList = Array.from(devMap.entries())
            .map(([dev, price]) => `${dev}, desde ${precioAPalabras(price)}`)
            .join('. ');
          return new Response(JSON.stringify({
            result: `No encontré información de "${desarrollo}". Los desarrollos disponibles son: ${devList || 'Monte Verde, Los Encinos, Miravalle, Distrito Falco, Andes, Paseo Colorines'}, y terrenos en Citadella del Nogal.`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const modelos = props.map((p: any) => {
          const precio = p.price_equipped || p.price || 0;
          return `${p.name}, ${precioAPalabras(precio)}, ${p.bedrooms || '?'} recámaras, ${p.area_m2 || '?'} metros cuadrados de construcción${p.land_size ? `, terreno de ${p.land_size} metros cuadrados` : ''}`;
        }).join('. ');

        const tieneAlberca = desarrollo.toLowerCase().includes('andes') ? ' Este desarrollo TIENE alberca.' : '';

        return new Response(JSON.stringify({
          result: `${desarrollo} tiene ${props.length} modelos: ${modelos}.${tieneAlberca} Todos incluyen closets y cocina integral. La info completa se la mando por WhatsApp.`
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool info-desarrollo error:', e);
        return new Response(JSON.stringify({ result: 'Error buscando información. Dile al cliente que le mandas la info por WhatsApp.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Agendar una cita de visita
    if (url.pathname === '/webhook/retell/tool/agendar-cita' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        const callObj = body.call || {};
        console.log(`🔧 RETELL TOOL agendar-cita:`, JSON.stringify(args));

        const nombre = args.nombre_cliente || '';
        const desarrollo = args.desarrollo || '';
        const fecha = args.fecha || ''; // formato: YYYY-MM-DD o "sábado", "mañana"
        const hora = args.hora || '';   // formato: HH:MM o "11 am"

        if (!nombre || !desarrollo || !fecha || !hora) {
          const faltantes = [];
          if (!nombre) faltantes.push('nombre del cliente');
          if (!desarrollo) faltantes.push('desarrollo a visitar');
          if (!fecha) faltantes.push('fecha (día)');
          if (!hora) faltantes.push('hora');
          return new Response(JSON.stringify({
            result: `Faltan datos para agendar: ${faltantes.join(', ')}. Pregúntale al cliente.`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Parsear fecha y hora
        const { parseFechaEspanol } = await import('../handlers/dateParser');
        let fechaISO = fecha;
        let horaISO = hora;

        // Si la fecha es relativa (sábado, mañana, etc.), parsear
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          const parsed = parseFechaEspanol(`${fecha} ${hora}`);
          if (parsed) {
            fechaISO = parsed.fecha; // DD/MM/YYYY
            horaISO = parsed.hora;   // HH:MM
          } else {
            return new Response(JSON.stringify({
              result: `No pude entender la fecha "${fecha}". Pide la fecha de nuevo en formato claro, como "sábado 15 de febrero" o "mañana".`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        } else {
          // Convertir YYYY-MM-DD a DD/MM/YYYY
          const [y, m, d] = fechaISO.split('-');
          fechaISO = `${d}/${m}/${y}`;
          // Normalizar hora (siempre parsear AM/PM correctamente a 24h)
          const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
          if (horaMatch) {
            let h = parseInt(horaMatch[1]);
            const min = horaMatch[2] || '00';
            const period = horaMatch[3]?.toLowerCase();
            if (period === 'pm' && h < 12) h += 12;
            if (period === 'am' && h === 12) h = 0;
            // Si no dice am/pm y hora <= 7, asumir PM (nadie agenda citas a las 2am)
            if (!period && h >= 1 && h <= 7) h += 12;
            horaISO = `${h.toString().padStart(2, '0')}:${min}`;
          }
        }

        // Buscar o crear lead por teléfono de la llamada
        let callerPhone = callObj.to_number?.replace('+', '') || callObj.from_number?.replace('+', '') || '';
        let leadPhone = callerPhone;
        // Para inbound: from_number es el cliente, to_number es SARA
        if (callObj.direction === 'inbound' || (callObj.from_number && callObj.from_number !== (env.RETELL_PHONE_NUMBER || ''))) {
          leadPhone = callObj.from_number?.replace('+', '') || callerPhone;
        }

        // Fallback: si no tenemos phone del call object, buscar en KV
        if (!leadPhone && env.SARA_CACHE) {
          const callId = callObj.call_id || body.call_id || '';
          if (callId) {
            leadPhone = await env.SARA_CACHE.get(`retell_call_phone:${callId}`) || '';
          }
          if (!leadPhone) {
            leadPhone = await env.SARA_CACHE.get('retell_last_caller_phone') || '';
          }
          if (leadPhone) console.log(`📞 agendar-cita: Phone recuperado de KV: ${leadPhone}`);
        }

        let { data: lead } = await supabase.client
          .from('leads')
          .select('*')
          .or(`phone.eq.${leadPhone},phone.like.%${leadPhone.slice(-10)}`)
          .maybeSingle();

        // Si no existe el lead, CREARLO con el nombre real (no esperar a call_ended)
        if (!lead && leadPhone) {
          console.log(`📞 agendar-cita: Lead no existe para ${leadPhone}, creándolo con nombre: ${nombre}`);

          // Buscar vendedor disponible (round-robin)
          const { data: vendedoresDisp } = await supabase.client
            .from('team_members')
            .select('id')
            .eq('role', 'vendedor')
            .eq('active', true)
            .limit(5);
          const vendedorIdAsign = vendedoresDisp && vendedoresDisp.length > 0
            ? vendedoresDisp[Math.floor(Math.random() * vendedoresDisp.length)].id
            : null;

          const { data: nuevoLead, error: createErr } = await supabase.client
            .from('leads')
            .insert({
              name: nombre || 'Lead Telefónico',
              phone: leadPhone,
              source: 'phone_inbound',
              status: 'new',
              assigned_to: vendedorIdAsign,
              property_interest: desarrollo,
              notes: {
                notas: [{
                  text: `📞 Lead creado desde herramienta agendar_cita durante llamada`,
                  author: 'SARA (Retell)',
                  timestamp: new Date().toISOString(),
                  type: 'system'
                }]
              }
            })
            .select('*')
            .single();

          if (nuevoLead) {
            lead = nuevoLead;
            console.log(`✅ Lead creado desde agendar-cita: ${nuevoLead.id} - ${nombre}`);
          } else {
            console.error('❌ Error creando lead desde agendar-cita:', createErr);
            return new Response(JSON.stringify({
              result: `Hubo un problema registrando tu cita. Confírmale: "${nombre}, tu cita queda el ${fecha} a las ${hora} en ${desarrollo}. Te mando confirmación por WhatsApp."`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }

        if (!lead) {
          return new Response(JSON.stringify({
            result: `No pude encontrar o crear al cliente. Confírmale: "${nombre}, tu cita queda el ${fecha} a las ${hora} en ${desarrollo}. Te mando confirmación por WhatsApp."`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Buscar team members y properties para el appointment service
        const { data: teamMembers } = await supabase.client.from('team_members').select('*').eq('active', true);
        const { data: properties } = await supabase.client.from('properties').select('*');

        const { AppointmentService } = await import('../services/appointmentService');
        const { CalendarService } = await import('../services/calendar');
        const calendarService = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        const appointmentService = new AppointmentService(supabase, calendarService, null as any);

        const result = await appointmentService.crearCitaCompleta({
          from: leadPhone,
          cleanPhone: leadPhone,
          lead,
          desarrollo,
          fecha: fechaISO,
          hora: horaISO,
          teamMembers: teamMembers || [],
          analysis: { extracted_data: { client_name: nombre } },
          properties: properties || [],
          env
        });

        if (result.success) {
          // 0. Save KV flag so call_analyzed skips Claude callback analysis (prevents duplicate appointments)
          const callIdForFlag = callObj.call_id || body.call_id || '';
          if (callIdForFlag && env.SARA_CACHE) {
            try {
              await env.SARA_CACHE.put(`retell_cita_created:${callIdForFlag}`, '1', { expirationTtl: 3600 });
              console.log(`🔒 KV flag retell_cita_created:${callIdForFlag} saved — will skip Claude callback`);
            } catch (kvErr) { console.error('⚠️ KV error saving retell_cita_created flag:', kvErr); }
          }

          // 1. Actualizar nombre del lead si dio uno real
          const nombreReal = nombre && nombre !== 'Lead Telefónico' && nombre !== 'Lead' ? nombre : '';
          if (nombreReal) {
            const { error: nameErr } = await supabase.client.from('leads').update({ name: nombreReal }).eq('id', lead.id);
            if (nameErr) {
              console.error(`❌ Error actualizando nombre del lead: ${nameErr.message}`);
            } else {
              console.log(`📝 Lead nombre actualizado: ${lead.name} → ${nombreReal}`);
            }
            // También actualizar lead_name en la cita
            if (result.appointment?.id) {
              await supabase.client.from('appointments').update({ lead_name: nombreReal }).eq('id', result.appointment.id);
            }
          }
          const displayNombre = nombreReal || nombre || 'cliente';

          // 2. Enviar confirmación por WhatsApp al lead
          try {
            const { MetaWhatsAppService } = await import('../services/meta-whatsapp');
            const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

            // Normalizar teléfono para WhatsApp
            let wpPhone = leadPhone.replace('+', '');
            if (wpPhone.startsWith('52') && wpPhone.length === 12) {
              wpPhone = '521' + wpPhone.substring(2);
            }
            console.log(`📱 Normalizando teléfono: ${leadPhone} → ${wpPhone}`);

            // Buscar GPS del desarrollo
            const { data: propGps } = await supabase.client
              .from('properties')
              .select('gps_link, development')
              .ilike('development', `%${desarrollo}%`)
              .limit(1)
              .maybeSingle();

            const gpsLink = propGps?.gps_link ? `\n📍 Ubicación: ${propGps.gps_link}` : '';
            const vendedorNombre = result.vendedor?.name?.split(' ')[0] || '';
            const vendedorInfo = vendedorNombre ? `\nTu asesor será ${vendedorNombre}.` : '';

            // Formatear fecha para el mensaje (más legible)
            let fechaDisplay = fecha;
            try {
              // Si fechaISO es DD/MM/YYYY, convertir a formato más legible
              const dateMatch = fechaISO.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
              if (dateMatch) {
                const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
                fechaDisplay = `${parseInt(dateMatch[1])} de ${meses[parseInt(dateMatch[2])-1]}`;
              }
            } catch (e) { console.error('⚠️ Error parseando fecha para display:', e); }

            await meta.sendWhatsAppMessage(wpPhone,
              `✅ ¡Cita confirmada!\n\n📅 ${fechaDisplay} a las ${horaISO || hora}\n🏠 ${desarrollo}${vendedorInfo}${gpsLink}\n\n¡Te esperamos, ${displayNombre}!`
            );
            console.log(`📤 Confirmación WhatsApp enviada a lead ${wpPhone}`);

            // Marcar lead_notified
            if (result.appointment?.id) {
              await supabase.client.from('appointments').update({ lead_notified: true }).eq('id', result.appointment.id);
            }

            // 3. Notificar al vendedor asignado
            let vendedorToNotify = result.vendedor;
            // Fallback: si crearCitaCompleta no retornó vendedor, buscarlo directo
            if (!vendedorToNotify?.phone && lead.assigned_to) {
              console.log(`⚠️ result.vendedor sin phone, buscando vendedor por assigned_to: ${lead.assigned_to}`);
              const { data: vendFallback } = await supabase.client
                .from('team_members')
                .select('*')
                .eq('id', lead.assigned_to)
                .maybeSingle();
              if (vendFallback?.phone) vendedorToNotify = vendFallback;
            }

            if (vendedorToNotify?.phone) {
              const { enviarMensajeTeamMember } = await import('../utils/teamMessaging');
              console.log(`📤 Notificando a vendedor: ${vendedorToNotify.name} (${vendedorToNotify.phone})`);
              await enviarMensajeTeamMember(supabase, meta, vendedorToNotify,
                `📞 ¡Nueva cita desde llamada!\n\n👤 ${displayNombre}\n📅 ${fechaDisplay} a las ${horaISO || hora}\n🏠 ${desarrollo}\n📱 ${leadPhone}`,
                { tipoMensaje: 'notificacion' }
              );
              console.log(`📤 Notificación enviada a vendedor ${vendedorToNotify.name}`);

              // Marcar vendedor_notified
              if (result.appointment?.id) {
                await supabase.client.from('appointments')
                  .update({ vendedor_notified: true })
                  .eq('id', result.appointment.id);
              }
            } else {
              console.log(`⚠️ No hay vendedor asignado para notificar. result.vendedor:`, JSON.stringify(result.vendedor), `lead.assigned_to:`, lead.assigned_to);
            }
          } catch (notifError: any) {
            console.error('⚠️ Error enviando notificaciones (cita sí se creó):', notifError.message, notifError.stack?.split('\n')[1]);
          }

          const vendedorMsg = result.vendedor ? ` Tu asesor será ${result.vendedor.name?.split(' ')[0]}.` : '';
          return new Response(JSON.stringify({
            result: `Cita agendada para ${displayNombre} el ${fecha} a las ${hora} en ${desarrollo}.${vendedorMsg} Ya le envié la confirmación y ubicación por WhatsApp.`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else {
          const errorMsg = result.error || 'Error desconocido';
          console.log(`❌ agendar-cita falló: type=${result.errorType}, error=${errorMsg}, fecha=${fechaISO}, hora=${horaISO}`);
          if (result.errorType === 'duplicate') {
            return new Response(JSON.stringify({
              result: `${nombre} ya tiene una cita agendada próximamente. Pregúntale si quiere cambiarla o confirmar la existente.`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (result.errorType === 'out_of_hours') {
            const h = result.horaInvalida;
            return new Response(JSON.stringify({
              result: `Esa hora no está disponible. El horario de atención es de ${h?.horaInicio || 9} a ${h?.horaFin || 18} horas${h?.esSabado ? ' (sábado hasta las 14)' : ''}. Pregúntale otra hora.`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({
            result: `Hubo un problema al agendar. Confírmale: "${nombre}, tu cita queda el ${fecha} a las ${hora} en ${desarrollo}. Te mando confirmación por WhatsApp."`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      } catch (e: any) {
        console.error('❌ Retell tool agendar-cita error:', e.message, e.stack?.split('\n')[1]);
        try { await logErrorToDB(supabase, 'retell_tool_error', e.message || String(e), { severity: 'error', source: 'retell.ts', stack: e.stack?.substring(0, 1000), context: { tool: 'agendar-cita' } }); } catch {}
        return new Response(JSON.stringify({ result: 'Hubo un problema técnico. Confírmale la cita verbalmente y dile que le mandas confirmación por WhatsApp.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Cancelar una cita existente
    if (url.pathname === '/webhook/retell/tool/cancelar-cita' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        const callObj = body.call || {};
        console.log(`🔧 RETELL TOOL cancelar-cita:`, JSON.stringify(args));

        const razon = args.razon || 'Cancelado por el cliente vía llamada';

        // Buscar lead por teléfono de la llamada
        const callerPhone = callObj.from_number?.replace('+', '') || callObj.to_number?.replace('+', '') || '';
        const { data: lead } = await supabase.client
          .from('leads')
          .select('id, name')
          .or(`phone.eq.${callerPhone},phone.like.%${callerPhone.slice(-10)}`)
          .maybeSingle();

        if (!lead) {
          return new Response(JSON.stringify({
            result: 'No encontré al cliente en el sistema. Pídele su nombre o teléfono para buscarlo.'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Buscar cita activa del lead
        const hoy = new Date().toISOString().split('T')[0];
        const { data: cita } = await supabase.client
          .from('appointments')
          .select('id, scheduled_date, scheduled_time, property_name, vendedor_name')
          .eq('lead_id', lead.id)
          .in('status', ['scheduled', 'confirmed'])
          .gte('scheduled_date', hoy)
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!cita) {
          return new Response(JSON.stringify({
            result: `${lead.name || 'El cliente'} no tiene citas próximas activas. ¿Quiere agendar una nueva?`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const { AppointmentService } = await import('../services/appointmentService');
        const { CalendarService } = await import('../services/calendar');
        const calendarService = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        const appointmentService = new AppointmentService(supabase, calendarService, null as any);

        const cancelado = await appointmentService.cancelAppointment(cita.id, razon);

        if (cancelado) {
          return new Response(JSON.stringify({
            result: `Cita cancelada. ${lead.name || 'El cliente'} tenía cita el ${cita.scheduled_date} a las ${cita.scheduled_time} en ${cita.property_name || 'desarrollo'}. Se notificó al vendedor. ¿Quiere reagendar para otra fecha?`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else {
          return new Response(JSON.stringify({
            result: 'No pude cancelar la cita en el sistema. Dile que lo gestiono y le confirmo por WhatsApp.'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      } catch (e: any) {
        console.error('❌ Retell tool cancelar-cita error:', e);
        try { await logErrorToDB(supabase, 'retell_tool_error', (e as Error).message || String(e), { severity: 'error', source: 'retell.ts', stack: (e as Error).stack?.substring(0, 1000), context: { tool: 'cancelar-cita' } }); } catch {}
        return new Response(JSON.stringify({ result: 'Error cancelando cita. Le confirmo por WhatsApp.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Cambiar/reagendar una cita
    if (url.pathname === '/webhook/retell/tool/cambiar-cita' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        const callObj = body.call || {};
        console.log(`🔧 RETELL TOOL cambiar-cita:`, JSON.stringify(args));

        const nuevaFecha = args.nueva_fecha || '';
        const nuevaHora = args.nueva_hora || '';

        if (!nuevaFecha || !nuevaHora) {
          return new Response(JSON.stringify({
            result: 'Necesito la nueva fecha y hora. Pregúntale al cliente cuándo quiere reagendar.'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Buscar lead
        const callerPhone = callObj.from_number?.replace('+', '') || callObj.to_number?.replace('+', '') || '';
        const { data: lead } = await supabase.client
          .from('leads')
          .select('*')
          .or(`phone.eq.${callerPhone},phone.like.%${callerPhone.slice(-10)}`)
          .maybeSingle();

        if (!lead) {
          return new Response(JSON.stringify({
            result: 'No encontré al cliente. Dile que le confirmo por WhatsApp.'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Buscar cita actual
        const hoy = new Date().toISOString().split('T')[0];
        const { data: citaActual } = await supabase.client
          .from('appointments')
          .select('id, scheduled_date, scheduled_time, property_name')
          .eq('lead_id', lead.id)
          .in('status', ['scheduled', 'confirmed'])
          .gte('scheduled_date', hoy)
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!citaActual) {
          return new Response(JSON.stringify({
            result: `${lead.name || 'El cliente'} no tiene citas activas. ¿Quiere agendar una nueva?`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Cancelar la cita actual
        await supabase.client.from('appointments').update({ status: 'rescheduled' }).eq('id', citaActual.id);

        // Parsear nueva fecha/hora
        const { parseFechaEspanol } = await import('../handlers/dateParser');
        let fechaISO = nuevaFecha;
        let horaISO = nuevaHora;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) {
          const parsed = parseFechaEspanol(`${nuevaFecha} ${nuevaHora}`);
          if (parsed) {
            fechaISO = parsed.fecha;
            horaISO = parsed.hora;
          } else {
            return new Response(JSON.stringify({
              result: `No pude entender la fecha "${nuevaFecha}". Pide la fecha de nuevo.`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        } else {
          const [y, m, d] = fechaISO.split('-');
          fechaISO = `${d}/${m}/${y}`;
          const horaMatch = nuevaHora.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
          if (horaMatch) {
            let h = parseInt(horaMatch[1]);
            const min = horaMatch[2] || '00';
            const period = horaMatch[3]?.toLowerCase();
            if (period === 'pm' && h < 12) h += 12;
            if (period === 'am' && h === 12) h = 0;
            horaISO = `${h.toString().padStart(2, '0')}:${min}`;
          }
        }

        // Crear nueva cita
        const { data: teamMembers } = await supabase.client.from('team_members').select('*').eq('active', true);
        const { data: properties } = await supabase.client.from('properties').select('*');

        const { AppointmentService } = await import('../services/appointmentService');
        const { CalendarService } = await import('../services/calendar');
        const calendarService = new CalendarService(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY, env.GOOGLE_CALENDAR_ID);
        const appointmentService = new AppointmentService(supabase, calendarService, null as any);

        const result = await appointmentService.crearCitaCompleta({
          from: callerPhone,
          cleanPhone: callerPhone,
          lead,
          desarrollo: citaActual.property_name || lead.property_interest || '',
          fecha: fechaISO,
          hora: horaISO,
          teamMembers: teamMembers || [],
          analysis: { extracted_data: { client_name: lead.name } },
          properties: properties || [],
          env,
          isReschedule: true
        });

        if (result.success) {
          // Notificar al vendedor asignado del reagendamiento (24h-safe)
          try {
            const vendorAsignado = (teamMembers || []).find((tm: any) => tm.id === lead.assigned_to);
            if (vendorAsignado) {
              const metaNotif = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
              const msgReagendar = `📅 *CITA REAGENDADA*\n\n` +
                `Cliente: ${lead.name || 'Cliente'}\n` +
                `Antes: ${citaActual.scheduled_date} ${citaActual.scheduled_time}\n` +
                `Ahora: ${nuevaFecha} ${nuevaHora}\n` +
                `Desarrollo: ${citaActual.property_name || lead.property_interest || ''}`;
              await enviarMensajeTeamMember(supabase, metaNotif, vendorAsignado, msgReagendar, {
                tipoMensaje: 'alerta_lead',
                pendingKey: 'pending_alerta_lead'
              });
              console.log(`✅ Vendedor ${vendorAsignado.name} notificado de reagendamiento via Retell`);
            }
          } catch (notifErr: any) {
            console.error('⚠️ Error notificando reagendamiento al vendedor:', notifErr);
            logErrorToDB(supabase, 'retell_notification_error', 'warning', 'retell/cambiar-cita/notify', notifErr?.message, notifErr?.stack, { tool: 'cambiar-cita' });
          }

          return new Response(JSON.stringify({
            result: `Cita reagendada. Antes: ${citaActual.scheduled_date} ${citaActual.scheduled_time}. Ahora: ${nuevaFecha} ${nuevaHora} en ${citaActual.property_name || 'el desarrollo'}. Se envió confirmación por WhatsApp.`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else {
          return new Response(JSON.stringify({
            result: `No pude reagendar: ${result.error}. Dile que le confirmo por WhatsApp.`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      } catch (e: any) {
        console.error('❌ Retell tool cambiar-cita error:', e);
        try { await logErrorToDB(supabase, 'retell_tool_error', (e as Error).message || String(e), { severity: 'error', source: 'retell.ts', stack: (e as Error).stack?.substring(0, 1000), context: { tool: 'cambiar-cita' } }); } catch {}
        return new Response(JSON.stringify({ result: 'Error reagendando. Le confirmo por WhatsApp.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Enviar información por WhatsApp al cliente
    // NOTA: NO enviamos nada durante la llamada. Todo se envía en call_analyzed
    // para garantizar: (1) orden correcto, (2) sin duplicados, (3) carousels con fotos
    if (url.pathname === '/webhook/retell/tool/enviar-whatsapp' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        const tipo = args.tipo || 'info';
        const desarrollo = args.desarrollo || '';
        console.log(`🔧 RETELL TOOL enviar-whatsapp: tipo=${tipo}, desarrollo=${desarrollo} — DEFERRED to call_analyzed`);

        // Guardar en KV qué se pidió para que call_analyzed lo envíe
        // VALIDAR contra desarrollos conocidos para evitar "Zacatecas" u otros no-desarrollos
        const callObj = body.call || {};
        const callId = callObj.call_id || body.call_id || '';
        // Obtener desarrollos válidos dinámicamente desde DB
        const { data: devProps } = await supabase.client
          .from('properties')
          .select('development, name');
        const desarrollosValidos = devProps
          ? [...new Set(devProps.flatMap((p: any) => [p.development, p.development_name, p.name].filter(Boolean).map((d: string) => d.toLowerCase())))]
          : ['monte verde', 'los encinos', 'miravalle', 'paseo colorines', 'andes', 'distrito falco', 'citadella', 'villa campelo', 'villa galiano', 'monte real', 'alpes'];
        const esDesarrolloValido = desarrollo && desarrollosValidos.some(d => desarrollo.toLowerCase().includes(d) || d.includes(desarrollo.toLowerCase()));
        if (callId && env.SARA_CACHE && esDesarrolloValido) {
          const existingRaw = await env.SARA_CACHE.get(`retell_send_queue:${callId}`);
          const existing: string[] = existingRaw ? JSON.parse(existingRaw) : [];
          if (!existing.includes(desarrollo)) {
            existing.push(desarrollo);
            await env.SARA_CACHE.put(`retell_send_queue:${callId}`, JSON.stringify(existing), { expirationTtl: 3600 });
          }
        } else if (desarrollo && !esDesarrolloValido) {
          console.log(`⚠️ enviar-whatsapp: "${desarrollo}" no es un desarrollo conocido, no se agrega a KV queue`);
        }

        const devLabel = desarrollo ? ` de ${desarrollo}` : '';
        return new Response(JSON.stringify({
          result: `Perfecto, le envío toda la información${devLabel} por WhatsApp al terminar la llamada.`
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool enviar-whatsapp error:', e);
        logErrorToDB(supabase, 'retell_tool_error', 'error', 'retell/enviar-whatsapp', e?.message, e?.stack, { tool: 'enviar-whatsapp' });
        return new Response(JSON.stringify({ result: 'Le mando la información por WhatsApp al terminar la llamada.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Consultar información de crédito hipotecario
    if (url.pathname === '/webhook/retell/tool/info-credito' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        console.log(`🔧 RETELL TOOL info-credito:`, JSON.stringify(args));

        const ingreso = args.ingreso_mensual || 0;
        const tipoCredito = args.tipo_credito || ''; // infonavit, bancario, fovissste, cofinavit

        let respuesta = '';

        const ingresoTexto = ingreso ? precioAPalabras(ingreso).replace(' pesos', '') + ' pesos mensuales' : '';

        if (tipoCredito.toLowerCase().includes('infonavit')) {
          respuesta = `Con INFONAVIT, el monto depende de tu subcuenta y salario.${ingresoTexto ? ` Con salario de ${ingresoTexto}` : ''} podrías acceder a casas desde un millón seiscientos mil pesos usando INFONAVIT más crédito bancario, que es Cofinavit. Opciones: Monte Verde o Andes. ¿Quieres que un asesor hipotecario te contacte para hacer la precalificación?`;
        } else if (tipoCredito.toLowerCase().includes('fovissste')) {
          respuesta = `FOVISSSTE es para trabajadores del gobierno. El monto depende de tu antigüedad y puntos. También se puede combinar con crédito bancario. Tenemos asesores hipotecarios que te pueden precalificar sin costo. ¿Quieres que te contacte un asesor?`;
        } else {
          if (ingreso && ingreso > 0) {
            const capacidadAprox = ingreso * 0.33 * 240; // 33% de ingreso, 20 años
            respuesta = `Con un ingreso de ${ingresoTexto}, podrías obtener un crédito bancario de aproximadamente ${precioAPalabras(capacidadAprox)}, a veinte años pagando el treinta y tres por ciento de tu ingreso. Bancos: BBVA, Banorte, Santander, HSBC. Las tasas van del nueve al doce por ciento anual. ¿Quieres que un asesor hipotecario te contacte gratis?`;
          } else {
            respuesta = `Trabajamos con todos los bancos: BBVA, Banorte, Santander, HSBC, Scotiabank. También INFONAVIT, FOVISSSTE y Cofinavit. El enganche mínimo es diez por ciento y con INFONAVIT puede ser cero. Dime tu ingreso mensual aproximado y te digo para qué casas calificas.`;
          }
        }

        return new Response(JSON.stringify({ result: respuesta }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool info-credito error:', e);
        logErrorToDB(supabase, 'retell_tool_error', 'error', 'retell/info-credito', e?.message, e?.stack, { tool: 'info-credito' });
        return new Response(JSON.stringify({ result: 'Error consultando crédito. Dile que le mando info por WhatsApp.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Consultar citas existentes del cliente
    if (url.pathname === '/webhook/retell/tool/consultar-citas' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const callObj = body.call || {};
        console.log(`🔧 RETELL TOOL consultar-citas`);

        const callerPhone = callObj.from_number?.replace('+', '') || callObj.to_number?.replace('+', '') || '';
        const { data: lead } = await supabase.client
          .from('leads')
          .select('id, name')
          .or(`phone.eq.${callerPhone},phone.like.%${callerPhone.slice(-10)}`)
          .maybeSingle();

        if (!lead) {
          return new Response(JSON.stringify({ result: 'No encontré al cliente. No tiene citas registradas.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const hoy = new Date().toISOString().split('T')[0];
        const { data: citas } = await supabase.client
          .from('appointments')
          .select('scheduled_date, scheduled_time, property_name, status, vendedor_name')
          .eq('lead_id', lead.id)
          .gte('scheduled_date', hoy)
          .in('status', ['scheduled', 'confirmed'])
          .order('scheduled_date', { ascending: true });

        if (!citas || citas.length === 0) {
          return new Response(JSON.stringify({ result: `${lead.name || 'El cliente'} no tiene citas próximas. ¿Quiere agendar una visita?` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const citasText = citas.map((c: any) => {
          const [year, month, day] = (c.scheduled_date || '').split('-').map(Number);
          const fecha = new Date(year, month - 1, day);
          const diaSemana = diasSemana[fecha.getDay()] || '';
          const mesNombre = meses[(month || 1) - 1] || '';
          const fechaHumana = `el ${diaSemana} ${day} de ${mesNombre}`;
          const hora = c.scheduled_time ? ` a las ${c.scheduled_time.replace(':00', ' horas').replace(':30', ' y media')}` : '';
          return `${fechaHumana}${hora} en ${c.property_name || 'desarrollo'}${c.vendedor_name ? ` con ${c.vendedor_name}` : ''}`;
        }).join('. ');
        return new Response(JSON.stringify({
          result: `${lead.name || 'El cliente'} tiene ${citas.length} cita(s): ${citasText}. ¿Quiere cambiar alguna?`
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool consultar-citas error:', e);
        logErrorToDB(supabase, 'retell_tool_error', 'error', 'retell/consultar-citas', e?.message, e?.stack, { tool: 'consultar-citas' });
        return new Response(JSON.stringify({ result: 'Error consultando citas.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Buscar casas por presupuesto (TODOS los desarrollos)
    if (url.pathname === '/webhook/retell/tool/buscar-por-presupuesto' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        const presupuesto = args.presupuesto || 0;
        const recamaras = args.recamaras || 0;
        console.log(`🔧 RETELL TOOL buscar-por-presupuesto: $${presupuesto}, ${recamaras} rec`);

        if (!presupuesto || presupuesto <= 0) {
          return new Response(JSON.stringify({
            result: 'Pregúntale su presupuesto aproximado. Tenemos casas desde un millón seiscientos mil hasta cinco millones y medio. También terrenos desde seis mil cuatrocientos pesos por metro cuadrado.'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Buscar TODAS las propiedades dentro del presupuesto
        let query = supabase.client
          .from('properties')
          .select('name, development, price, price_equipped, bedrooms, area_m2, land_size, gps_link')
          .lte('price_equipped', presupuesto * 1.1); // 10% de margen

        if (recamaras && recamaras > 0) {
          query = query.gte('bedrooms', recamaras);
        }

        const { data: props } = await query.order('price_equipped', { ascending: true });

        if (!props || props.length === 0) {
          if (presupuesto < 1500000) {
            return new Response(JSON.stringify({
              result: `Con ${precioAPalabras(presupuesto)} no tenemos casas disponibles. La más económica es Acacia en Monte Verde a un millón seiscientos mil pesos. También tenemos terrenos en Citadella del Nogal desde seis mil cuatrocientos pesos por metro cuadrado. ¿Le interesa alguna de estas opciones?`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({
            result: `No encontré opciones exactas para ${precioAPalabras(presupuesto)}. Nuestras casas van desde un millón seiscientos mil hasta cinco millones y medio. ¿Quiere que le muestre las más cercanas a su presupuesto?`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Agrupar por desarrollo
        const porDesarrollo: Record<string, any[]> = {};
        for (const p of props) {
          const dev = p.development || 'Otro';
          if (!porDesarrollo[dev]) porDesarrollo[dev] = [];
          porDesarrollo[dev].push(p);
        }

        let resultado = `Con presupuesto de ${precioAPalabras(presupuesto)}${recamaras ? ` y ${recamaras} o más recámaras` : ''}, tienes estas opciones: `;

        // Mapa de zonas dinámico basado en properties (con fallback)
        const colPadreDevs = new Set(['Monte Verde', 'Los Encinos', 'Miravalle', 'Paseo Colorines', 'Monte Real', 'Alpes']);
        for (const [dev, modelos] of Object.entries(porDesarrollo)) {
          const zona = colPadreDevs.has(dev) ? 'Colinas del Padre' : 'Guadalupe';
          resultado += `En ${dev}, ${zona}: `;
          resultado += modelos.map((m: any) => {
            const precio = m.price_equipped || m.price || 0;
            return `modelo ${m.name}, ${precioAPalabras(precio)}, ${m.bedrooms || '?'} recámaras`;
          }).join('. ');
          resultado += '. ';
        }

        resultado += `En total ${props.length} opciones en ${Object.keys(porDesarrollo).length} desarrollos.`;
        if (props.some((p: any) => p.development === 'Andes')) {
          resultado += ' Andes es el único con alberca.';
        }

        return new Response(JSON.stringify({ result: resultado }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool buscar-por-presupuesto error:', e);
        logErrorToDB(supabase, 'retell_tool_error', 'error', 'retell/buscar-por-presupuesto', e?.message, e?.stack, { tool: 'buscar-por-presupuesto' });
        return new Response(JSON.stringify({ result: 'Error buscando opciones. Dile que le mando info por WhatsApp.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Webhook Retell.ai - Eventos de llamadas telefónicas con IA
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname === '/webhook/retell' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        console.log(`📞 RETELL WEBHOOK: Evento ${body.event} recibido`);

        // Debug: guardar en KV para poder verificar que el webhook fue recibido
        const debugLog: any[] = [];
        debugLog.push({ t: Date.now(), step: 'webhook_received', event: body.event, call_id: body.call?.call_id });

        const { event, call } = body;

        if (!call || !call.call_id) {
          console.error('❌ Retell webhook: evento inválido (sin call_id)');
          debugLog.push({ t: Date.now(), step: 'invalid_event' });
          await env.SARA_CACHE.put(`retell_debug_${Date.now()}`, JSON.stringify(debugLog), { expirationTtl: 3600 });
          return new Response('OK', { status: 200 });
        }

        // KV dedup — prevent duplicate processing of same call+event combo
        try {
          const retellDedupKey = `retell:${call.call_id}:${event}`;
          if (await env.SARA_CACHE.get(retellDedupKey)) {
            console.log(`⏭️ Retell event ya procesado: ${event} ${call.call_id}`);
            return new Response('OK', { status: 200 });
          }
          await env.SARA_CACHE.put(retellDedupKey, '1', { expirationTtl: 86400 });
        } catch (_kvErr) { /* KV failure: process anyway, side-effects are mostly idempotent */ }

        // Procesar evento según tipo
        if (event === 'call_started') {
          const isInbound = call.direction === 'inbound';
          const leadPhone = isInbound
            ? call.from_number?.replace('+', '')
            : call.to_number?.replace('+', '');

          console.log(`📞 Llamada ${isInbound ? 'ENTRANTE' : 'SALIENTE'} iniciada: ${call.call_id} ${isInbound ? '←' : '→'} ${leadPhone}`);

          // Buscar lead existente
          const { data: lead } = await supabase.client
            .from('leads')
            .select('*, team_members!leads_assigned_to_fkey(phone, name)')
            .or(`phone.eq.${leadPhone},phone.like.%${leadPhone?.slice(-10)}`)
            .maybeSingle();

          // Solo log — la notificación real al vendedor se envía en call_analyzed
          // con información útil (duración, sentimiento, resumen, resultado)
          if (lead?.team_members) {
            const vendedorName = (lead.team_members as any).name;
            console.log(`📞 ${isInbound ? 'Entrante' : 'Saliente'}: ${lead.name || leadPhone} → vendedor ${vendedorName} (notificación en call_analyzed)`);
          } else if (isInbound) {
            console.log(`📞 Llamada entrante de número nuevo: ${leadPhone}`);
          }
        }

        if (event === 'call_ended' || event === 'call_analyzed') {
          // Intentar guardar en call_logs (si la tabla existe)
          try {
            // Para llamadas ENTRANTES, el lead llama a nosotros (from_number es el lead)
            // Para llamadas SALIENTES, nosotros llamamos al lead (to_number es el lead)
            const isInbound = call.direction === 'inbound';
            const leadPhone = isInbound
              ? call.from_number?.replace('+', '')
              : call.to_number?.replace('+', '');

            debugLog.push({ t: Date.now(), step: 'processing_call', event, leadPhone, duration_ms: call.duration_ms, has_transcript: !!call.transcript, has_analysis: !!call.call_analysis });

            let { data: lead } = await supabase.client
              .from('leads')
              .select('id, assigned_to, name')
              .or(`phone.eq.${leadPhone},phone.like.%${leadPhone?.slice(-10)}`)
              .maybeSingle();

            debugLog.push({ t: Date.now(), step: 'lead_found', found: !!lead, lead_id: lead?.id, name: lead?.name });

            // Si es llamada ENTRANTE y NO existe el lead, CREARLO (puede que agendar_cita ya lo creó)
            if (isInbound && !lead && leadPhone) {
              console.log(`📞 call_ended: Lead no existe para ${leadPhone}, creándolo...`);

              // Extraer nombre del análisis de la llamada si está disponible
              const nombreFromCall = call.call_analysis?.custom_analysis?.lead_name ||
                                     call.metadata?.lead_name ||
                                     'Lead Telefónico';

              // Buscar vendedor disponible para asignar (round-robin)
              const { data: vendedores } = await supabase.client
                .from('team_members')
                .select('id')
                .eq('role', 'vendedor')
                .eq('active', true)
                .limit(5);

              const vendedorId = vendedores && vendedores.length > 0
                ? vendedores[Math.floor(Math.random() * vendedores.length)].id
                : null;

              // Extraer datos del análisis de la llamada
              const desarrolloInteres = call.call_analysis?.custom_analysis?.desarrollo_interes ||
                                        call.metadata?.desarrollo || null;
              const presupuesto = call.call_analysis?.custom_analysis?.presupuesto || null;
              const tipoCredito = call.call_analysis?.custom_analysis?.tipo_credito || null;

              const { data: nuevoLead, error: createError } = await supabase.client
                .from('leads')
                .insert({
                  name: nombreFromCall,
                  phone: leadPhone,
                  source: 'phone_inbound',
                  status: 'new',
                  assigned_to: vendedorId,
                  property_interest: desarrolloInteres,
                  notes: {
                    notas: [{
                      text: `📞 Lead creado desde llamada telefónica entrante`,
                      author: 'SARA (Retell)',
                      timestamp: new Date().toISOString(),
                      type: 'system'
                    }],
                    presupuesto: presupuesto,
                    tipo_credito: tipoCredito,
                    primera_llamada: new Date().toISOString()
                  },
                  created_at: new Date().toISOString()
                })
                .select('id, assigned_to, name')
                .single();

              if (nuevoLead) {
                lead = nuevoLead;
                console.log(`✅ Lead creado desde llamada: ${nuevoLead.id} - ${nombreFromCall}`);

                // Notificar al vendedor asignado (24h-safe)
                if (vendedorId) {
                  const { data: vendedor } = await supabase.client
                    .from('team_members')
                    .select('*')
                    .eq('id', vendedorId)
                    .single();

                  if (vendedor) {
                    const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
                    await enviarMensajeTeamMember(supabase, meta, vendedor,
                      `🆕📞 NUEVO LEAD POR TELÉFONO\n\n` +
                      `👤 ${nombreFromCall}\n` +
                      `📱 ${leadPhone}\n` +
                      `🏠 Interés: ${desarrolloInteres || 'Por definir'}\n` +
                      `💰 Presupuesto: ${presupuesto || 'Por definir'}\n\n` +
                      `La llamada ya terminó. Te recomiendo dar seguimiento por WhatsApp.`,
                      { tipoMensaje: 'alerta_lead', pendingKey: 'pending_alerta_lead' }
                    );
                  }
                }
              } else if (createError) {
                console.error('❌ Error creando lead desde llamada:', createError);
              }
            }

            // Guardar en call_logs (no bloquea si falla)
            try {
              await supabase.client.from('call_logs').insert({
                call_id: call.call_id,
                lead_id: lead?.id || null,
                lead_phone: isInbound ? call.from_number : call.to_number,
                vendor_id: lead?.assigned_to || call.metadata?.vendor_id || null,
                duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : null,
                transcript: call.transcript || null,
                summary: call.call_analysis?.summary || null,
                sentiment: call.call_analysis?.sentiment || null,
                outcome: determinarOutcome(call),
                created_at: new Date().toISOString()
              });
              console.log(`✅ Call log guardado: ${call.call_id}`);
            } catch (clError) {
              console.log(`⚠️ call_logs no disponible, continuando...`);
            }

            // Detectar TODOS los desarrollos mencionados en el transcript (por SARA o el lead)
            // Transcript puede ser string ("Agent: ...\nUser: ...") o array ([{role, content}])
            let desarrolloDelTranscript = '';
            let todosDesarrollosTranscript: string[] = [];
            // Use centralized registry — never confuses models with developments
            const desarrollosConocidos = getAllDevelopmentNames().map(d => d.toLowerCase());
            // Sentinel values que Retell retorna cuando no detectó desarrollo — FILTRAR siempre
            const sentinelValues = ['no_mencionado', 'general', 'por definir', 'no mencionado', 'sin desarrollo', 'n/a', 'none', 'null', 'undefined', ''];
            const isSentinel = (v: string) => !v || sentinelValues.includes(v.toLowerCase().trim());
            // Normalize development name for dedup
            const normDev = (d: string) => d.toLowerCase().trim().replace(/^priv\.?\s*/, 'privada ');
            if (call.transcript) {
              // Use centralized extractDevelopmentsFromText — only returns DEVELOPMENT names, never models
              const transcriptText = typeof call.transcript === 'string'
                ? call.transcript
                : Array.isArray(call.transcript)
                  ? call.transcript.map((e: any) => e.content).join(' ')
                  : '';
              todosDesarrollosTranscript = extractDevelopmentsFromText(transcriptText);
              desarrolloDelTranscript = todosDesarrollosTranscript[0] || '';
              if (todosDesarrollosTranscript.length > 0) {
                console.log(`🏠 Desarrollos detectados en transcript: ${todosDesarrollosTranscript.join(', ')}`);
              }
            }

            const nuevoDesarrolloRaw = call.call_analysis?.custom_analysis_data?.desarrollo_interes ||
                                    call.call_analysis?.custom_analysis?.desarrollo_interes ||
                                    call.metadata?.desarrollo_interes ||
                                    call.metadata?.desarrollo || '';
            // Filter out sentinel values like "no_mencionado"
            const nuevoDesarrollo = isSentinel(nuevoDesarrolloRaw) ? '' : nuevoDesarrolloRaw;
            const desarrolloFinal = desarrolloDelTranscript || nuevoDesarrollo;

            // Agregar nota al lead
            if (lead) {
              const durationMin = call.duration_ms ? Math.round(call.duration_ms / 60000) : 0;
              const sentimentEmoji = call.call_analysis?.sentiment === 'positive' ? '😊' :
                                     call.call_analysis?.sentiment === 'negative' ? '😟' : '😐';

              let nota = `📞 Llamada IA (${durationMin}min) ${sentimentEmoji}`;
              if (call.call_analysis?.summary) {
                nota += `: ${call.call_analysis.summary.substring(0, 200)}`;
              }

              const { data: existingLead } = await supabase.client
                .from('leads')
                .select('notes')
                .eq('id', lead.id)
                .single();

              let notesObj = existingLead?.notes || {};
              if (typeof notesObj === 'string') {
                try { notesObj = JSON.parse(notesObj); } catch { notesObj = {}; }
              }
              const notasArray = notesObj.notas || [];
              notasArray.push({
                text: nota,
                author: 'SARA (Retell)',
                timestamp: new Date().toISOString(),
                type: 'call'
              });
              notesObj.notas = notasArray;

              const updateData: any = { notes: notesObj };
              if (desarrolloFinal && !isSentinel(desarrolloFinal)) {
                updateData.property_interest = desarrolloFinal;
                console.log(`🏠 Actualizado property_interest: ${desarrolloFinal}`);
              }

              // ═══ DETENER CADENCIA SI LA LLAMADA CONECTÓ ═══
              // Si el lead habló (exitosa o no interesado), la cadencia cumplió su propósito
              const callOutcomeForCadencia = determinarOutcome(call);
              if (['successful', 'not_interested'].includes(callOutcomeForCadencia) && notesObj.cadencia?.activa) {
                const motivoFin = callOutcomeForCadencia === 'not_interested' ? 'no_interesado_llamada' : 'llamada_exitosa';
                notesObj.cadencia = {
                  ...notesObj.cadencia,
                  activa: false,
                  motivo_fin: motivoFin,
                  respondio_en_paso: notesObj.cadencia.paso_actual,
                  respondio_at: new Date().toISOString()
                };
                console.log(`🛑 Cadencia ${notesObj.cadencia.tipo} detenida: ${motivoFin} (lead ${lead.name})`);
              }

              await supabase.client.from('leads').update(updateData).eq('id', lead.id);
              console.log(`📝 Nota de llamada agregada a lead ${lead.id}`);

              // ═══ RETRY: Si no contestó y es outbound, agendar reintento ═══
              const callOutcomeForRetry = determinarOutcome(call);
              if (RETRYABLE_OUTCOMES.includes(callOutcomeForRetry) && !isInbound && lead) {
                try {
                  // Re-leer notes frescas (acabamos de escribir arriba)
                  const { data: freshForRetry } = await supabase.client
                    .from('leads')
                    .select('notes')
                    .eq('id', lead.id)
                    .single();
                  const retryNotes = freshForRetry?.notes || {};
                  const existing = retryNotes.pending_retry_call;
                  const currentAttempt = existing?.attempt || 0;

                  if (currentAttempt < 2) {
                    const nextAttempt = currentAttempt + 1;
                    const ahora = new Date();
                    let retryAfter: string;

                    if (nextAttempt === 1) {
                      // Retry 1: en 3 horas
                      retryAfter = new Date(ahora.getTime() + 3 * 60 * 60 * 1000).toISOString();
                    } else {
                      // Retry 2: mañana 10am MX (UTC-6 = 16:00 UTC)
                      const manana = new Date(ahora);
                      manana.setDate(manana.getDate() + 1);
                      manana.setUTCHours(16, 0, 0, 0); // 10am MX
                      retryAfter = manana.toISOString();
                    }

                    retryNotes.pending_retry_call = {
                      motivo: call.metadata?.motivo || 'seguimiento',
                      attempt: nextAttempt,
                      retry_after: retryAfter,
                      original_call_id: call.call_id,
                      reason: callOutcomeForRetry,
                      created_at: ahora.toISOString()
                    };

                    await supabase.client.from('leads').update({ notes: retryNotes }).eq('id', lead.id);
                    console.log(`🔄 Retry ${nextAttempt} agendado para lead ${lead.id} (${callOutcomeForRetry}) → ${retryAfter}`);
                  } else {
                    // Max reintentos alcanzados - limpiar
                    if (retryNotes.pending_retry_call) {
                      delete retryNotes.pending_retry_call;
                      await supabase.client.from('leads').update({ notes: retryNotes }).eq('id', lead.id);
                      console.log(`⏹️ Max reintentos alcanzados para lead ${lead.id}, limpiando pending_retry_call`);
                    }
                  }
                } catch (retryErr) {
                  console.error('⚠️ Error agendando retry:', retryErr);
                }
              }
            }

            // Notificar al vendedor (re-leer lead para tener nombre fresco)
            if (lead?.assigned_to) {
              const { data: freshLead } = await supabase.client.from('leads').select('name').eq('id', lead.id).single();
              const leadDisplayName = (freshLead?.name && freshLead.name !== 'Lead Telefónico' && freshLead.name !== 'Lead')
                ? freshLead.name
                : (isInbound ? call.from_number : call.to_number);

              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('*')
                .eq('id', lead.assigned_to)
                .single();

              if (vendedor) {
                const durationMin = call.duration_ms ? Math.round(call.duration_ms / 60000) : 0;
                const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

                // Sentimiento del lead
                const sentimentMap: Record<string, string> = {
                  'Positive': '😊 Positivo',
                  'Negative': '😟 Negativo',
                  'Neutral': '😐 Neutral',
                  'Unknown': '❓ Sin determinar'
                };
                const sentiment = sentimentMap[call.call_analysis?.user_sentiment || ''] || '';

                // Resultado de la llamada (usa determinarOutcome)
                const callOutcome = determinarOutcome(call);
                const outcomeDisplayMap: Record<string, string> = {
                  'successful': '🔥 EXITOSA',
                  'not_interested': '❌ No interesado',
                  'no_answer': '📵 No contestó',
                  'voicemail': '📭 Buzón de voz',
                  'busy': '📵 Ocupado',
                  'failed': '⚠️ Falló conexión',
                  'unknown': '❓ Sin clasificar',
                };
                const outcome = outcomeDisplayMap[callOutcome] || '';

                let mensaje = `📞 Llamada IA completada con *${leadDisplayName}*\n`;
                mensaje += `⏱️ Duración: ${durationMin} min\n`;
                if (sentiment) mensaje += `💭 Sentimiento: ${sentiment}\n`;
                if (outcome) mensaje += `📊 Resultado: ${outcome}\n`;
                if (desarrolloFinal) mensaje += `🏠 Desarrollo: ${desarrolloFinal}\n`;
                if (call.call_analysis?.summary) {
                  mensaje += `\n📝 *Resumen:*\n${call.call_analysis.summary.substring(0, 400)}`;
                }

                await enviarMensajeTeamMember(supabase, meta, vendedor, mensaje, {
                  tipoMensaje: 'alerta_lead',
                  pendingKey: 'pending_alerta_lead'
                });
              }
            }

            // Variable para enviar confirmación de callback DESPUÉS de greeting/recursos
            let callbackConfirmacionPendiente: { phone: string; msg: string; leadName: string; tipo: string; fecha: string; hora: string; desarrollo: string; gpsLink: string } | null = null;

            // ═══════════════════════════════════════════════════════════════
            // DETECTAR SOLICITUD DE CALLBACK / CITA EN EL TRANSCRIPT (con Claude)
            // Analiza el transcript completo con IA para detectar cualquier formato:
            // "márcame el viernes", "en 15 minutos", "la próxima semana", etc.
            // → Crear appointment tipo 'llamada' + notificar vendedor + confirmar al lead
            // ═══════════════════════════════════════════════════════════════
            // Solo analizar con Claude si la llamada duró >30s (skip spam/wrong number/quick hang-ups)
            const durationSeconds = call.duration_ms ? Math.round(call.duration_ms / 1000) : 0;

            // Check if agendar-cita tool already created an appointment during this call
            let citaYaCreada = false;
            if (call.call_id && env.SARA_CACHE) {
              try {
                const citaFlag = await env.SARA_CACHE.get(`retell_cita_created:${call.call_id}`);
                if (citaFlag) {
                  citaYaCreada = true;
                  console.log(`🔒 Skip Claude callback: agendar-cita ya creó cita durante la llamada ${call.call_id}`);
                  debugLog.push({ t: Date.now(), step: 'skip_callback_analysis', reason: 'cita_already_created_by_tool' });
                }
              } catch (kvErr) { console.error('⚠️ KV error reading retell_cita_created flag:', kvErr); }
            }

            if (event === 'call_analyzed' && lead && call.transcript && durationSeconds > 30 && !citaYaCreada) {
              try {
                // Obtener transcript como texto plano
                let transcriptText = '';
                if (typeof call.transcript === 'string') {
                  transcriptText = call.transcript;
                } else if (Array.isArray(call.transcript)) {
                  transcriptText = call.transcript.map((e: any) => `${e.role === 'agent' ? 'Agent' : 'User'}: ${e.content}`).join('\n');
                }

                // Usar Claude para analizar el transcript
                const mexicoNow = getMexicoNow();
                const fechaHoy = `${mexicoNow.getFullYear()}-${(mexicoNow.getMonth() + 1).toString().padStart(2, '0')}-${mexicoNow.getDate().toString().padStart(2, '0')}`;
                const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                const diaSemanaHoy = diasSemana[mexicoNow.getDay()];
                const horaActual = `${mexicoNow.getHours().toString().padStart(2, '0')}:${mexicoNow.getMinutes().toString().padStart(2, '0')}`;

                const claude = new ClaudeService(env.ANTHROPIC_API_KEY);
                const callbackPrompt = `Analiza este transcript de una llamada telefónica y determina si el lead (User) pidió que le volvieran a llamar/marcar, agendar una cita, o cualquier tipo de seguimiento con fecha/hora.

FECHA DE HOY: ${fechaHoy} (${diaSemanaHoy})
HORA ACTUAL: ${horaActual} (zona horaria México Central)

TRANSCRIPT:
${transcriptText}

Responde SOLO con JSON válido, sin markdown ni texto adicional:
{"callback_requested": true/false, "type": "llamada" | "visita" | "seguimiento" | "none", "date": "YYYY-MM-DD" o null, "time": "HH:MM" (24h) o null, "description": "breve descripción", "raw_text": "frase exacta del lead"}

Tipos:
- "visita" = el lead quiere IR PRESENCIALMENTE a ver casas/desarrollo. ESTA ES LA MÁS COMÚN.
- "llamada" = el lead pide EXPLÍCITAMENTE que le VUELVAN A MARCAR/LLAMAR por teléfono
- "seguimiento" = acordaron dar seguimiento general (enviar info, WhatsApp, contactar después) SIN ser visita ni llamada específica

REGLA CRÍTICA DE TIPO:
- Si el lead mencionó un DESARROLLO (Monte Verde, Andes, Los Encinos, Distrito Falco, Miravalle, Paseo Colorines, Citadella, etc.) Y quiere ir a verlo → type: "visita" SIEMPRE
- "quiero ir a ver las casas" → type: "visita" (NO "llamada")
- "quiero conocer el desarrollo" → type: "visita" (NO "llamada")
- "el sábado paso" → type: "visita"
- "voy a ir" / "me gustaría ir" → type: "visita"
- SOLO usa "llamada" si EXPLÍCITAMENTE dice "márcame", "llámame", "marca", "llama"
- Si hay DUDA entre visita y llamada → usa "visita"

Reglas de fecha:
- "márcame el viernes" → callback_requested: true, type: "llamada", date: próximo viernes
- "en 15 minutos" → callback_requested: true, type: "llamada", date: hoy, time: hora actual + 15 min
- "la próxima semana" → callback_requested: true, type: "seguimiento", date: próximo lunes
- "mañana por la tarde" → callback_requested: true, type: "llamada", date: mañana, time: "16:00"
- "quiero visitar el sábado" → callback_requested: true, type: "visita", date: próximo sábado
- "me mandan info por WhatsApp" → callback_requested: true, type: "seguimiento", date: hoy
- Si NO pidió seguimiento → callback_requested: false
- "a las cuatro de la tarde" → time: "16:00"
- Si no especifica hora, default: "10:00"`;
                const callbackAnalysis = await claude.chat([{ role: 'user', content: callbackPrompt }]);

                // Parsear respuesta de Claude
                let callbackData: any = null;
                try {
                  const jsonMatch = callbackAnalysis.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    callbackData = JSON.parse(jsonMatch[0]);
                  }
                } catch (parseErr) {
                  console.log('⚠️ No se pudo parsear JSON de callback analysis');
                }

                debugLog.push({ t: Date.now(), step: 'callback_ai_analysis', data: callbackData });

                if (callbackData?.callback_requested && callbackData.date) {
                  console.log(`📅 Callback detectado por IA: ${callbackData.description} → ${callbackData.date} ${callbackData.time}`);
                  debugLog.push({ t: Date.now(), step: 'callback_detected', date: callbackData.date, time: callbackData.time, type: callbackData.type });

                  const citaFecha = callbackData.date;
                  const citaHora = callbackData.time || '10:00';
                  // Respetar SIEMPRE el tipo que Claude detectó de la conversación.
                  // Si Claude dice "llamada" (ej: "márcame mañana"), es LLAMADA aunque haya desarrollo mencionado.
                  // Solo usar default si Claude no especificó tipo.
                  let citaTipo: string;
                  if (callbackData.type === 'llamada') {
                    citaTipo = 'llamada';
                  } else if (callbackData.type === 'visita') {
                    citaTipo = 'visita';
                  } else if (callbackData.type === 'seguimiento') {
                    citaTipo = 'seguimiento';
                  } else {
                    // Default solo si Claude no especificó tipo: si hay desarrollo → visita, sino → llamada
                    citaTipo = desarrolloFinal ? 'visita' : 'llamada';
                  }

                  // Calcular si es callback rápido (< 2 horas) o cita formal (>= 2 horas)
                  const mexicoNowCb = getMexicoNow();
                  const [cbHh, cbMm] = citaHora.split(':').map(Number);
                  const citaDateTime = new Date(citaFecha);
                  citaDateTime.setHours(cbHh, cbMm, 0, 0);
                  const minutosHastaCita = (citaDateTime.getTime() - mexicoNowCb.getTime()) / (1000 * 60);
                  const esCallbackRapido = minutosHastaCita < 120; // < 2 horas = callback rápido

                  console.log(`📅 Callback en ${Math.round(minutosHastaCita)} min → ${esCallbackRapido ? 'RÁPIDO (solo notificar)' : 'FORMAL (crear cita)'}`);
                  debugLog.push({ t: Date.now(), step: 'callback_type', minutos: Math.round(minutosHastaCita), rapido: esCallbackRapido });

                  const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

                  if (esCallbackRapido) {
                    // CALLBACK RÁPIDO: solo notificar al vendedor, NO crear cita formal
                    if (lead.assigned_to) {
                      const { data: vendedorCb } = await supabase.client
                        .from('team_members')
                        .select('*')
                        .eq('id', lead.assigned_to)
                        .single();

                      if (vendedorCb?.phone) {
                        const minutos = Math.max(1, Math.round(minutosHastaCita));
                        const msgCallbackRapido =
                          `📞⚡ *CALLBACK RÁPIDO*\n\n` +
                          `👤 *Lead:* ${lead.name || 'Sin nombre'}\n` +
                          `📱 *Teléfono:* wa.me/${formatPhoneForDisplay(leadPhone).replace('+', '')}\n` +
                          `🏠 *Desarrollo:* ${desarrolloFinal || 'General'}\n` +
                          `⏰ *Tiempo:* Pidió que le marquen en ~${minutos} minutos\n\n` +
                          `💬 ${callbackData.description || 'El lead pidió que le volvieran a marcar pronto.'}`;
                        await enviarMensajeTeamMember(supabase, meta, vendedorCb, msgCallbackRapido, {
                          tipoMensaje: 'alerta_lead',
                          guardarPending: true,
                          pendingKey: 'pending_mensaje',
                          templateOverride: {
                            name: 'notificacion_cita_vendedor',
                            params: [
                              'CALLBACK RÁPIDO',
                              lead.name || 'Sin nombre',
                              `wa.me/${formatPhoneForDisplay(leadPhone).replace('+', '')}`,
                              desarrolloFinal || 'General',
                              `En ~${minutos} minutos`
                            ]
                          }
                        });
                      }
                    }
                    debugLog.push({ t: Date.now(), step: 'callback_rapido_notificado' });

                  } else {
                    // CALLBACK FORMAL (>= 2 horas): crear appointment + notificar + confirmar

                    // Cross-call dedup: verificar si ya existe cita para este lead en la misma fecha
                    const { data: citaExistente } = await supabase.client
                      .from('appointments')
                      .select('id, scheduled_time, appointment_type')
                      .eq('lead_id', lead.id)
                      .eq('scheduled_date', citaFecha)
                      .in('status', ['scheduled', 'confirmed'])
                      .limit(1);

                    if (citaExistente && citaExistente.length > 0) {
                      console.log(`⏭️ Cita duplicada detectada: lead ${lead.name} ya tiene cita el ${citaFecha} a las ${citaExistente[0].scheduled_time} (${citaExistente[0].appointment_type}). Saltando.`);
                      debugLog.push({ t: Date.now(), step: 'callback_dedup_skipped', existingTime: citaExistente[0].scheduled_time });
                    } else {

                    const { error: citaError } = await supabase.client
                      .from('appointments')
                      .insert([{
                        lead_id: lead.id,
                        lead_name: lead.name || null,
                        lead_phone: leadPhone,
                        vendedor_id: lead.assigned_to || null,
                        scheduled_date: citaFecha,
                        scheduled_time: citaHora,
                        appointment_type: citaTipo,
                        status: 'scheduled',
                        property_name: desarrolloFinal || lead.property_interest || null,
                        location: citaTipo === 'llamada' ? 'Llamada telefónica' : citaTipo === 'seguimiento' ? 'Seguimiento por WhatsApp' : null,
                        duration_minutes: citaTipo === 'visita' ? 60 : 15,
                        created_at: new Date().toISOString()
                      }]);

                    if (citaError) {
                      console.error('❌ Error creando cita:', citaError);
                      debugLog.push({ t: Date.now(), step: 'callback_db_error', error: citaError.message });
                    } else {
                      console.log(`✅ Cita creada: ${citaFecha} ${citaHora} (${citaTipo})`);

                      // Formatear fecha bonita
                      const fechaObj = new Date(citaFecha + 'T12:00:00');
                      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
                      const diaSemana = diasSemana[fechaObj.getDay()];
                      const diaMes = fechaObj.getDate();
                      const mes = meses[fechaObj.getMonth()];
                      const horaNum = parseInt(citaHora.split(':')[0]);
                      const minutosStr = citaHora.split(':')[1] || '00';
                      const horaFormateada = horaNum >= 13 ? `${horaNum - 12}:${minutosStr} PM` : horaNum === 12 ? `12:${minutosStr} PM` : `${horaNum}:${minutosStr} AM`;
                      const fechaBonita = `${diaSemana} ${diaMes} de ${mes} a las ${horaFormateada}`;

                      // Buscar GPS del desarrollo para incluir en notificaciones
                      let gpsLink = '';
                      let desarrolloNombre = (desarrolloFinal && !isSentinel(desarrolloFinal)) ? desarrolloFinal : '';
                      if (desarrolloNombre && (citaTipo === 'visita' || citaTipo === 'seguimiento')) {
                        try {
                          const { data: propGps } = await supabase.client
                            .from('properties')
                            .select('gps_link, development')
                            .ilike('development', `%${desarrolloFinal}%`)
                            .not('gps_link', 'is', null)
                            .limit(1);
                          if (propGps?.[0]?.gps_link) {
                            gpsLink = propGps[0].gps_link;
                            desarrolloNombre = propGps[0].development || desarrolloFinal;
                          }
                        } catch (gpsErr: any) {
                          console.log('No se encontró GPS para:', desarrolloFinal);
                        }
                      }

                      // Notificar al vendedor con detalle completo (respeta ventana 24h)
                      let vendedorNombre = '';
                      if (lead.assigned_to) {
                        const { data: vendedorCita } = await supabase.client
                          .from('team_members')
                          .select('*')
                          .eq('id', lead.assigned_to)
                          .single();

                        if (vendedorCita?.name) vendedorNombre = vendedorCita.name;

                        if (vendedorCita?.phone) {
                          let msgVendedor = '';
                          if (citaTipo === 'visita') {
                            msgVendedor = `📅🏠 *VISITA PRESENCIAL AGENDADA*\n\n`;
                          } else if (citaTipo === 'llamada') {
                            msgVendedor = `📅📞 *LLAMADA TELEFÓNICA AGENDADA*\n\n`;
                          } else {
                            msgVendedor = `📅📋 *SEGUIMIENTO AGENDADO*\n\n`;
                          }
                          msgVendedor += `👤 *Lead:* ${lead.name || 'Sin nombre'}\n`;
                          msgVendedor += `📱 *Teléfono:* wa.me/${formatPhoneForDisplay(leadPhone).replace('+', '')}\n`;
                          if (desarrolloNombre) msgVendedor += `🏠 *Desarrollo:* ${desarrolloNombre}\n`;
                          msgVendedor += `📅 *Fecha:* ${fechaBonita}\n`;
                          if (citaTipo === 'visita' && gpsLink) {
                            msgVendedor += `📍 *Ubicación:* ${gpsLink}\n`;
                          } else if (citaTipo === 'llamada') {
                            msgVendedor += `📍 *Modalidad:* Llamada telefónica al lead\n`;
                          } else if (citaTipo === 'seguimiento') {
                            msgVendedor += `📍 *Modalidad:* Seguimiento por WhatsApp/info\n`;
                          }
                          msgVendedor += `\n💬 ${callbackData.description || 'El lead pidió seguimiento.'}`;
                          msgVendedor += `\n\n✅ La cita ya está registrada en el sistema.`;

                          // Template con datos reales para cuando ventana cerrada
                          const tipoTituloVendedor = citaTipo === 'visita'
                            ? 'VISITA PRESENCIAL AGENDADA'
                            : citaTipo === 'llamada'
                              ? 'LLAMADA TELEFÓNICA AGENDADA'
                              : 'SEGUIMIENTO AGENDADO';
                          const vendorNotifResult = await enviarMensajeTeamMember(supabase, meta, vendedorCita, msgVendedor, {
                            tipoMensaje: 'alerta_lead',
                            guardarPending: true,
                            pendingKey: 'pending_mensaje',
                            templateOverride: {
                              name: 'notificacion_cita_vendedor',
                              params: [
                                tipoTituloVendedor,
                                lead.name || 'Sin nombre',
                                `wa.me/${formatPhoneForDisplay(leadPhone).replace('+', '')}`,
                                desarrolloNombre || 'Por confirmar',
                                fechaBonita
                              ]
                            }
                          });
                          // Marcar cita como vendedor notificado si se envió algo
                          if (vendorNotifResult.success) {
                            await supabase.client.from('appointments').update({ vendedor_notified: true })
                              .eq('lead_id', lead.id).eq('scheduled_date', citaFecha).eq('scheduled_time', citaHora);
                            console.log(`✅ vendedor_notified=true para cita ${citaFecha} ${citaHora}`);
                          }
                        }
                      }

                      // Guardar confirmación para enviar DESPUÉS de greeting/recursos (orden correcto)
                      const tipoTexto = citaTipo === 'visita' ? 'visita' : citaTipo === 'llamada' ? 'llamada' : 'seguimiento';
                      const primerNombreLead = lead.name?.split(' ')[0] || '';
                      let msgLead = `📅 ¡Listo${primerNombreLead ? ', ' + primerNombreLead : ''}! Queda agendado tu *${tipoTexto}* para el *${fechaBonita}*.\n\n`;
                      if (desarrolloNombre) msgLead += `🏠 *Desarrollo:* ${desarrolloNombre}\n`;
                      if (citaTipo === 'visita' && gpsLink) {
                        msgLead += `📍 *Ubicación:* ${gpsLink}\n`;
                      }
                      if (vendedorNombre) {
                        msgLead += `👤 *Te atiende:* ${vendedorNombre}\n`;
                      }
                      if (citaTipo === 'visita') {
                        msgLead += `\n¡Te esperamos! 🏠 Si necesitas cambiar la fecha, solo responde aquí. 😊`;
                      } else if (citaTipo === 'llamada') {
                        msgLead += `\nTe marcaremos a este número. 📞 Si necesitas cambiar la fecha, solo responde aquí. 😊`;
                      } else {
                        msgLead += `\nTe contactaremos por aquí. 📋 Si necesitas cambiar algo, solo responde aquí. 😊`;
                      }

                      callbackConfirmacionPendiente = {
                        phone: leadPhone,
                        msg: msgLead,
                        leadName: lead.name || '',
                        tipo: citaTipo,
                        fecha: fechaBonita,
                        hora: citaHora,
                        desarrollo: desarrolloNombre || 'Por confirmar',
                        gpsLink: gpsLink
                      };

                      debugLog.push({ t: Date.now(), step: 'callback_appointment_created', fecha: citaFecha, hora: citaHora, tipo: citaTipo });
                    }
                  } // close dedup else
                  }
                }
              } catch (callbackError: any) {
                console.error('Error detectando callback:', callbackError?.message);
                logErrorToDB(supabase, 'retell_callback_error', 'error', 'retell/call_analyzed/callback', callbackError?.message, callbackError?.stack, { call_id: call?.call_id });
                debugLog.push({ t: Date.now(), step: 'callback_error', error: callbackError?.message });
              }
            } else if (event === 'call_analyzed' && (!lead || durationSeconds <= 30 || citaYaCreada)) {
              const skipReason = citaYaCreada ? 'cita_created_by_tool' : !lead ? 'no_lead' : 'short_call';
              console.log(`⏭️ Skip Claude analysis: lead=${!!lead}, duration=${durationSeconds}s, citaYaCreada=${citaYaCreada} (reason: ${skipReason})`);
              debugLog.push({ t: Date.now(), step: 'skip_claude_analysis', reason: skipReason, duration: durationSeconds });
            }

            // ═══════════════════════════════════════════════════════════════
            // SEGUIMIENTO AUTOMÁTICO POR WHATSAPP AL LEAD
            // Enviar mensaje + brochure + GPS después de la llamada
            // RESPETA VENTANA 24H: si cerrada → usa template
            // Se ejecuta en call_ended O call_analyzed (el primero que llegue)
            // KV dedup previene doble envío si ambos eventos llegan
            // ═══════════════════════════════════════════════════════════════
            const durationMsForCheck = call.duration_ms || (durationSeconds ? durationSeconds * 1000 : 0);
            const dedupKey = `retell_followup:${call.call_id}`;
            let yaEnvioFollowUp = false;
            try {
              if (env.SARA_CACHE) {
                const existing = await env.SARA_CACHE.get(dedupKey);
                if (existing) {
                  yaEnvioFollowUp = true;
                  console.log(`⏭️ Follow-up ya enviado para call ${call.call_id} (dedup KV)`);
                }
              }
            } catch (_kvErr) { /* ignore */ }

            if (!yaEnvioFollowUp && leadPhone && durationMsForCheck > 15000) {
              try {
                const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

                // Verificar ventana de 24h
                let ventanaAbierta = false;
                if (lead?.id) {
                  const { data: leadFresh } = await supabase.client
                    .from('leads')
                    .select('last_message_at')
                    .eq('id', lead.id)
                    .single();
                  if (leadFresh?.last_message_at) {
                    const hace24h = Date.now() - 24 * 60 * 60 * 1000;
                    ventanaAbierta = new Date(leadFresh.last_message_at).getTime() > hace24h;
                  }
                }

                console.log(`📱 Ventana 24h para ${leadPhone}: ${ventanaAbierta ? 'ABIERTA' : 'CERRADA'}`);
                debugLog.push({ t: Date.now(), step: 'ventana_check', abierta: ventanaAbierta, leadPhone });

                const desarrolloInteresRaw = desarrolloDelTranscript ||
                                          call.call_analysis?.custom_analysis_data?.desarrollo_interes ||
                                          call.call_analysis?.custom_analysis?.desarrollo_interes ||
                                          call.metadata?.desarrollo_interes ||
                                          call.metadata?.desarrollo ||
                                          lead?.property_interest || '';
                // Filter sentinel values
                const desarrolloInteres = isSentinel(desarrolloInteresRaw) ? '' : desarrolloInteresRaw;

                if (ventanaAbierta) {
                  // VENTANA ABIERTA → enviar mensajes directos
                  const primerNombre = lead?.name ? ' ' + lead.name.split(' ')[0] : '';
                  let mensajeFollowUp = `¡Hola${primerNombre}! 👋\n\n`;
                  if (isInbound) {
                    mensajeFollowUp += `Soy Sara de Grupo Santa Rita. ¡Gracias por llamarnos! `;
                  } else {
                    mensajeFollowUp += `Soy Sara de Grupo Santa Rita. Gracias por la llamada. `;
                  }
                  // Use ALL developments from transcript, not just one
                  const desarrollosMencionados = todosDesarrollosTranscript.length > 0
                    ? [...todosDesarrollosTranscript]
                    : (desarrolloInteres ? [desarrolloInteres] : []);

                  // Merge in developments from KV queue (saved by enviar_info_whatsapp tool during call)
                  // VALIDATE against known developments to avoid "Zacatecas" etc.
                  try {
                    if (call.call_id && env.SARA_CACHE) {
                      const kvQueueRaw = await env.SARA_CACHE.get(`retell_send_queue:${call.call_id}`);
                      if (kvQueueRaw) {
                        const kvDevs: string[] = JSON.parse(kvQueueRaw);
                        for (const kvDev of kvDevs) {
                          if (isSentinel(kvDev)) continue; // Skip sentinel values
                          // Double-check: only merge if it matches a known development
                          const kvDevNorm = normDev(kvDev);
                          const esConocido = desarrollosConocidos.some(d => kvDevNorm.includes(d) || d.includes(kvDevNorm));
                          // Dedup with normalized comparison
                          const yaExiste = desarrollosMencionados.some((d: string) => normDev(d) === kvDevNorm);
                          if (esConocido && !yaExiste) {
                            desarrollosMencionados.push(kvDev);
                          } else if (!esConocido) {
                            console.log(`⚠️ KV queue: "${kvDev}" filtrado (no es desarrollo conocido)`);
                          }
                        }
                        // NOTE: Do NOT delete KV here — the outside block reads it too
                        console.log(`📋 KV queue merged for greeting: total: ${desarrollosMencionados.join(', ')}`);
                      }
                    }
                  } catch (kvMergeErr) { /* ignore KV errors */ }

                  // Filter sentinels from greeting list
                  const devsParaGreeting = desarrollosMencionados.filter((d: string) => !isSentinel(d));
                  if (devsParaGreeting.length > 1) {
                    // Proper Spanish: "A, B y C" instead of "A y B y C"
                    const last = devsParaGreeting.pop()!;
                    mensajeFollowUp += `Me da gusto que te interesen *${devsParaGreeting.join('*, *')}* y *${last}*. `;
                  } else if (devsParaGreeting.length === 1) {
                    mensajeFollowUp += `Me da gusto que te interese *${devsParaGreeting[0]}*. `;
                  }
                  mensajeFollowUp += `\n\nTe comparto información por aquí para que la revises con calma. `;
                  mensajeFollowUp += `Si tienes cualquier duda, aquí estoy para ayudarte. 🏠`;

                  debugLog.push({ t: Date.now(), step: 'sending_whatsapp', desarrollos: desarrollosMencionados, ventana: 'abierta' });
                  await meta.sendWhatsAppMessage(leadPhone, mensajeFollowUp);
                  debugLog.push({ t: Date.now(), step: 'whatsapp_sent_ok' });
                  console.log(`📱 WhatsApp directo enviado a ${leadPhone}`);

                  // CTA resources require 24h window — skip for closed window
                  // (carousels + resources sent below OUTSIDE ventana check)
                } else {
                  // VENTANA CERRADA → enviar template info_desarrollo con datos REALES
                  console.log(`📱 Ventana cerrada, enviando template con info real a ${leadPhone}`);
                  const primerNombre = lead?.name ? lead.name.split(' ')[0] : 'cliente';

                  let templateEnviado = false;

                  // Intentar enviar template info_desarrollo con datos reales del desarrollo
                  if (desarrolloInteres) {
                    try {
                      const desarrolloNorm = desarrolloInteres.toLowerCase()
                        .replace('priv.', 'privada').replace('priv ', 'privada ').trim();

                      const { data: props } = await supabase.client
                        .from('properties')
                        .select('name, development, brochure_urls, gps_link, price, price_equipped')
                        .or(`name.ilike.%${desarrolloNorm}%,development.ilike.%${desarrolloNorm}%`)
                        .limit(3);

                      if (props && props.length > 0) {
                        const prop = props[0];
                        const precioDesde = props.reduce((min: number, p: any) => {
                          const precio = p.price_equipped || p.price || 0;
                          return precio > 0 && precio < min ? precio : min;
                        }, Infinity);
                        const precioStr = precioDesde < Infinity ? `$${(precioDesde / 1000000).toFixed(1)}M equipada` : 'consultar';

                        // Obtener slug de brochure HTML
                        const brochureRaw = prop.brochure_urls;
                        let brochureSlug = '';
                        if (brochureRaw) {
                          const urls = Array.isArray(brochureRaw) ? brochureRaw : [brochureRaw];
                          const htmlUrl = urls.find((u: string) => u.includes('.html') || u.includes('pages.dev') || u.includes('/brochure/'));
                          if (htmlUrl) {
                            // Extraer slug: "https://sara-backend.edson-633.workers.dev/brochure/monte-verde" → "monte-verde"
                            const parts = htmlUrl.split('/');
                            brochureSlug = parts[parts.length - 1] || '';
                          }
                        }

                        // Obtener código corto de GPS
                        let gpsSlug = '';
                        if (prop.gps_link) {
                          // "https://maps.app.goo.gl/abc123" → "abc123"
                          const gpsParts = prop.gps_link.split('/');
                          gpsSlug = gpsParts[gpsParts.length - 1] || '';
                        }

                        const desarrolloNombre = prop.development || prop.name || desarrolloInteres;

                        // Construir componentes del template
                        const templateComponents: any[] = [
                          {
                            type: 'body',
                            parameters: [
                              { type: 'text', text: primerNombre },
                              { type: 'text', text: desarrolloNombre },
                              { type: 'text', text: precioStr }
                            ]
                          }
                        ];

                        // Agregar botones URL si tenemos datos
                        if (brochureSlug) {
                          templateComponents.push({
                            type: 'button',
                            sub_type: 'url',
                            index: '0',
                            parameters: [{ type: 'text', text: brochureSlug }]
                          });
                        }
                        if (gpsSlug) {
                          templateComponents.push({
                            type: 'button',
                            sub_type: 'url',
                            index: '1',
                            parameters: [{ type: 'text', text: gpsSlug }]
                          });
                        }

                        await meta.sendTemplate(leadPhone, 'info_desarrollo', 'es_MX', templateComponents);
                        console.log(`📱 Template info_desarrollo enviado a ${leadPhone} (${desarrolloNombre}, ${precioStr})`);
                        templateEnviado = true;
                      }
                    } catch (infoErr: any) {
                      console.log(`⚠️ Template info_desarrollo falló: ${infoErr.message}`);
                    }
                  }

                  // Fallback: seguimiento_lead genérico si info_desarrollo no se pudo enviar
                  if (!templateEnviado) {
                    try {
                      await meta.sendTemplate(leadPhone, 'seguimiento_lead', 'es_MX', [
                        { type: 'body', parameters: [{ type: 'text', text: primerNombre }] }
                      ]);
                      console.log(`📱 Template seguimiento_lead (fallback) enviado a ${leadPhone}`);
                    } catch (templateErr: any) {
                      console.log(`⚠️ seguimiento_lead falló, intentando reactivar_equipo...`);
                      try {
                        await meta.sendTemplate(leadPhone, 'reactivar_equipo', 'es_MX', [
                          { type: 'body', parameters: [{ type: 'text', text: primerNombre }] }
                        ]);
                      } catch (e2) {
                        console.error(`❌ Todos los templates fallaron para ${leadPhone}`);
                      }
                    }
                  }

                  // Guardar recursos como pending para cuando responda (siempre, como backup)
                  if (lead?.id && desarrolloInteres) {
                    const { data: leadForPending } = await supabase.client
                      .from('leads').select('notes').eq('id', lead.id).single();
                    let pendingNotes = leadForPending?.notes || {};
                    if (typeof pendingNotes === 'string') {
                      try { pendingNotes = JSON.parse(pendingNotes); } catch { pendingNotes = {}; }
                    }
                    pendingNotes.pending_retell_resources = {
                      desarrollo: desarrolloInteres,
                      sent_at: new Date().toISOString(),
                      call_id: call.call_id
                    };
                    await supabase.client.from('leads').update({ notes: pendingNotes }).eq('id', lead.id);
                    console.log(`💾 Recursos pendientes guardados para ${lead.id} (${desarrolloInteres})`);
                  }
                }

                // ═══════════════════════════════════════════════════════════════
                // CAROUSELS + RECURSOS — FUERA del check de ventana 24h
                // Carousels son TEMPLATES → no necesitan ventana 24h
                // CTA buttons SÍ necesitan ventana → fallback a texto plano si cerrada
                // ═══════════════════════════════════════════════════════════════
                // Collect all developments mentioned (same logic as ventana abierta, but accessible outside)
                // Filter sentinels from transcript results
                const transcriptFiltered = todosDesarrollosTranscript.filter((d: string) => !isSentinel(d));
                const desarrollosMencionadosFinal = transcriptFiltered.length > 0
                  ? [...transcriptFiltered]
                  : (desarrolloInteres && !isSentinel(desarrolloInteres) ? [desarrolloInteres] : []);

                // Merge in developments from KV queue
                try {
                  if (call.call_id && env.SARA_CACHE) {
                    const kvQueueRaw2 = await env.SARA_CACHE.get(`retell_send_queue:${call.call_id}`);
                    if (kvQueueRaw2) {
                      const kvDevs2: string[] = JSON.parse(kvQueueRaw2);
                      for (const kvDev of kvDevs2) {
                        if (isSentinel(kvDev)) continue; // Skip sentinel values
                        const kvDevNorm = normDev(kvDev);
                        const esConocido = desarrollosConocidos.some((d: string) => kvDevNorm.includes(d) || d.includes(kvDevNorm));
                        const yaExiste = desarrollosMencionadosFinal.some((d: string) => normDev(d) === kvDevNorm);
                        if (esConocido && !yaExiste) {
                          desarrollosMencionadosFinal.push(kvDev);
                        }
                      }
                    }
                  }
                } catch (_kvErr) { console.error('⚠️ KV error reading retell_send_queue:', _kvErr); }

                // Send carousels + resources even if no specific development detected
                // (e.g., user asked "casas en Zacatecas" — send both carousels)
                const enviarCarousels = desarrollosMencionadosFinal.length > 0 || (durationSeconds > 30);
                console.log(`🎠 Carousel decision: enviar=${enviarCarousels}, devsMencionados=${desarrollosMencionadosFinal.length} [${desarrollosMencionadosFinal.join(', ')}], duration=${durationSeconds}s`);
                debugLog.push({ t: Date.now(), step: 'carousel_decision', enviar: enviarCarousels, devs: desarrollosMencionadosFinal, duration: durationSeconds });

                if (enviarCarousels) {
                  console.log(`🎠 Iniciando envío de carousels + recursos...`);
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const { data: allProps, error: propsError } = await supabase.client
                    .from('properties')
                    .select('name, development, brochure_urls, gps_link, youtube_link, matterport_link, price, price_equipped, photo_url, bedrooms, area_m2, land_size');

                  console.log(`🎠 Properties loaded: ${allProps?.length || 0} props, error: ${propsError?.message || 'none'}`);
                  if (allProps && allProps.length > 0) {
                    // Determine if request is specific (1 dev) or general (multiple/none)
                    // If specific → skip carousel, only send resources for that dev
                    // If general → send carousel(s) + resources
                    const esRequestEspecifico = desarrollosMencionadosFinal.length === 1;

                    if (!esRequestEspecifico) {
                    // 1. Send carousels only for GENERAL requests (multiple devs or none)
                    const segmentosEnviados = new Set<string>();
                    for (const dev of desarrollosMencionadosFinal) {
                      const seg = getCarouselSegmentForDesarrollo(dev);
                      if (seg && !segmentosEnviados.has(seg)) segmentosEnviados.add(seg);
                    }
                    // If no specific segments found (general request like "casas en Zacatecas"), send both
                    if (segmentosEnviados.size === 0) {
                      segmentosEnviados.add('economico');
                      segmentosEnviados.add('premium');
                    }
                    console.log(`🎠 Segmentos a enviar: [${[...segmentosEnviados].join(', ')}]`);
                    for (const seg of segmentosEnviados) {
                      try {
                        const cards = AIConversationService.buildCarouselCards(allProps, seg as any);
                        const templateName = (AIConversationService.CAROUSEL_SEGMENTS as any)[seg]?.template;
                        console.log(`🎠 Segment "${seg}": ${cards.length} cards, template=${templateName || 'NONE'}`);
                        if (cards.length > 0 && templateName) {
                          const bodyParams = seg === 'terrenos'
                            ? []
                            : seg === 'economico'
                              ? [AIConversationService.precioMinGlobal(allProps)]
                              : ['$3M+'];
                          await meta.sendCarouselTemplate(leadPhone, templateName, bodyParams, cards);
                          await new Promise(r => setTimeout(r, 500));
                          console.log(`🎠 Carousel "${templateName}" post-call enviado (ventana: ${ventanaAbierta ? 'abierta' : 'cerrada'})`);
                        }
                      } catch (err: any) {
                        console.error(`❌ Carousel post-call "${seg}" falló para ${leadPhone}:`, err?.message);
                        try {
                          const errDetails = err?.response ? JSON.stringify(err.response) : (err?.data ? JSON.stringify(err.data) : err?.stack?.substring(0, 500));
                          if (errDetails) console.error(`❌ Carousel error details:`, errDetails);
                        } catch (parseErr) { console.error('⚠️ Error parsing carousel error details:', parseErr); }
                        debugLog.push({ t: Date.now(), step: 'carousel_error', segment: seg, error: err?.message });
                      }
                    }
                    } else {
                      console.log(`📋 Request específico (${desarrollosMencionadosFinal[0]}) — enviando solo recursos, sin carousel`);
                    }

                    // 2. Send resources for EACH mentioned development
                    console.log(`📋 Recursos: procesando ${desarrollosMencionadosFinal.length} desarrollos`);
                    for (const dev of desarrollosMencionadosFinal) {
                      const devNorm = dev.toLowerCase().replace('priv.', 'privada').replace('priv ', 'privada ').trim();
                      const devProps = allProps.filter((p: any) => {
                        const pName = (p.development || p.development_name || p.name || '').toLowerCase();
                        return pName.includes(devNorm) || devNorm.includes(pName);
                      });
                      console.log(`📋 Dev "${dev}" (norm: "${devNorm}"): ${devProps.length} props encontradas`);
                      if (devProps.length > 0) {
                        await new Promise(r => setTimeout(r, 500));
                        if (ventanaAbierta) {
                          // CTA buttons (interactive) — require 24h window
                          await enviarRecursosCTARetell(meta, leadPhone, dev, devProps);
                          console.log(`📋 Recursos CTA enviados para ${dev}`);
                        } else {
                          // Ventana cerrada → enviar como texto plano (no interactivo)
                          await enviarRecursosTextoRetell(meta, leadPhone, dev, devProps);
                          console.log(`📋 Recursos texto (ventana cerrada) enviados para ${dev}`);
                        }
                      }
                    }
                  }
                }

                // Cleanup KV queue AFTER all carousels + resources sent
                try {
                  if (call.call_id && env.SARA_CACHE) {
                    await env.SARA_CACHE.delete(`retell_send_queue:${call.call_id}`);
                    // Mark follow-up as sent (dedup for call_ended vs call_analyzed)
                    await env.SARA_CACHE.put(dedupKey, 'sent', { expirationTtl: 3600 });
                    console.log(`✅ Follow-up marcado como enviado en KV (dedup 1h)`);
                  }
                } catch (kvErr) { console.error('⚠️ KV error cleanup:', kvErr); }

                // Actualizar lead
                if (lead?.id) {
                  await supabase.client
                    .from('leads')
                    .update({
                      last_contact_at: new Date().toISOString(),
                      status: lead.status === 'new' ? 'contacted' : lead.status
                    })
                    .eq('id', lead.id);
                }

              } catch (whatsappError: any) {
                debugLog.push({ t: Date.now(), step: 'whatsapp_error', error: whatsappError?.message });
                console.error('Error enviando WhatsApp de seguimiento:', whatsappError);
              }
            }
            // ═══════════════════════════════════════════════════════════════
            // ENVIAR CONFIRMACIÓN DE CALLBACK/CITA (DESPUÉS de greeting y recursos)
            // Respeta ventana 24h: si cerrada → intenta template
            // ═══════════════════════════════════════════════════════════════
            if (callbackConfirmacionPendiente) {
              try {
                const { data: leadCbWindow } = await supabase.client
                  .from('leads')
                  .select('last_message_at')
                  .eq('id', lead?.id || '')
                  .single();
                const cbWindowOpen = leadCbWindow?.last_message_at &&
                  (Date.now() - new Date(leadCbWindow.last_message_at).getTime()) < 24 * 60 * 60 * 1000;

                await new Promise(resolve => setTimeout(resolve, 2000));
                const metaCb = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

                if (cbWindowOpen) {
                  await metaCb.sendWhatsAppMessage(callbackConfirmacionPendiente.phone, callbackConfirmacionPendiente.msg);
                  console.log('📅 Confirmación de callback enviada al lead (ventana abierta)');
                } else {
                  // Ventana cerrada → usar template appointment_confirmation_v2 con datos reales
                  console.log('📅 Ventana cerrada para lead, enviando template con datos de cita...');
                  try {
                    const cbNombre = callbackConfirmacionPendiente.leadName?.split(' ')[0] || 'Hola';
                    const cbTipoTexto = callbackConfirmacionPendiente.tipo === 'visita'
                      ? `visita a ${callbackConfirmacionPendiente.desarrollo}`
                      : callbackConfirmacionPendiente.tipo === 'llamada'
                        ? 'llamada telefónica'
                        : `seguimiento sobre ${callbackConfirmacionPendiente.desarrollo}`;
                    // Extraer fecha y hora por separado del fechaBonita (ej: "domingo 15 de febrero a las 10:00 AM")
                    const cbFechaParts = callbackConfirmacionPendiente.fecha.split(' a las ');
                    const cbFechaStr = cbFechaParts[0] || callbackConfirmacionPendiente.fecha;
                    const cbHoraStr = cbFechaParts[1] || callbackConfirmacionPendiente.hora;
                    const cbGpsCode = callbackConfirmacionPendiente.gpsLink
                      ? callbackConfirmacionPendiente.gpsLink.replace(/^https?:\/\/maps\.app\.goo\.gl\//, '')
                      : '';

                    const templateComponents: any[] = [
                      {
                        type: 'body',
                        parameters: [
                          { type: 'text', text: cbNombre },              // {{1}} Nombre
                          { type: 'text', text: 'Grupo Santa Rita' },    // {{2}} Empresa
                          { type: 'text', text: cbTipoTexto },           // {{3}} Tipo (visita a Monte Verde / llamada telefónica)
                          { type: 'text', text: cbFechaStr },            // {{4}} Fecha
                          { type: 'text', text: cbHoraStr }              // {{5}} Hora
                        ]
                      }
                    ];
                    // Solo agregar botón GPS si tenemos link real
                    if (cbGpsCode) {
                      templateComponents.push({
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [
                          { type: 'text', text: cbGpsCode }              // GPS link suffix
                        ]
                      });
                    }

                    await metaCb.sendTemplate(callbackConfirmacionPendiente.phone, 'appointment_confirmation_v2', 'es', templateComponents);
                    console.log('📅 Template appointment_confirmation_v2 enviado al lead (ventana cerrada)');
                  } catch (templateCbErr: any) {
                    console.log('⚠️ Template appointment_confirmation_v2 falló:', templateCbErr?.message);
                    // Fallback: seguimiento_lead genérico
                    try {
                      await metaCb.sendTemplate(callbackConfirmacionPendiente.phone, 'seguimiento_lead', 'es_MX', [
                        { type: 'body', parameters: [{ type: 'text', text: callbackConfirmacionPendiente.leadName?.split(' ')[0] || 'Hola' }] }
                      ]);
                    } catch (e2) {
                      console.log('⚠️ Todos los templates fallaron para lead');
                    }
                  }
                }
              } catch (cbConfErr: any) {
                console.error('Error enviando confirmación callback:', cbConfErr?.message);
              }
            }

          } catch (processError: any) {
            debugLog.push({ t: Date.now(), step: 'process_error', error: processError?.message });
            console.error('Error procesando llamada:', processError?.message || processError);
          }
        }

        // Guardar debug log en KV
        try {
          await env.SARA_CACHE.put(`retell_debug_${call?.call_id || Date.now()}`, JSON.stringify(debugLog), { expirationTtl: 3600 });
        } catch (kvErr) { /* ignore */ }

        return new Response('OK', { status: 200 });
      } catch (error: any) {
        console.error('Retell Webhook Error:', error);
        // Guardar error en KV
        try {
          await env.SARA_CACHE.put(`retell_error_${Date.now()}`, JSON.stringify({ error: error?.message, stack: error?.stack?.substring(0, 500) }), { expirationTtl: 3600 });
        } catch (kvErr) { /* ignore */ }
        try { await logErrorToDB(supabase, 'retell_webhook_error', error?.message || String(error), { severity: 'critical', source: 'retell.ts', stack: error?.stack?.substring(0, 1000), context: { url: url.pathname } }); } catch {}
        return new Response('OK', { status: 200 });
      }
    }

  return null; // Not a Retell route
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Determinar segmento de carousel para un desarrollo
// ═══════════════════════════════════════════════════════════════
function getCarouselSegmentForDesarrollo(desarrollo: string): string | null {
  const devLower = desarrollo.toLowerCase();
  for (const [segment, config] of Object.entries(AIConversationService.CAROUSEL_SEGMENTS)) {
    for (const dev of config.developments) {
      if (devLower.includes(dev.toLowerCase()) || dev.toLowerCase().includes(devLower)) {
        return segment;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Enviar recursos con CTA buttons (no texto plano)
// ═══════════════════════════════════════════════════════════════
async function enviarRecursosCTARetell(
  meta: MetaWhatsAppService,
  phone: string,
  desarrollo: string,
  props: any[]
): Promise<void> {
  const prop = props[0];
  const devName = prop.development || prop.development_name || prop.name || desarrollo;

  // Buscar recursos en TODAS las propiedades del desarrollo (no solo props[0])
  const youtubeLink = props.find((p: any) => p.youtube_link)?.youtube_link;
  const matterportLink = props.find((p: any) => p.matterport_link)?.matterport_link;
  const gpsLink = props.find((p: any) => p.gps_link)?.gps_link;
  const brochureProp = props.find((p: any) => {
    const raw = p.brochure_urls;
    if (!raw) return false;
    const urls = Array.isArray(raw) ? raw : [raw];
    return urls.some((u: string) => u.includes('.html') || u.includes('pages.dev') || u.includes('/brochure/'));
  });

  // Precio mínimo
  const precioDesde = props.reduce((min: number, p: any) => {
    const precio = Number(p.price_equipped || p.price || 0);
    return precio > 0 && precio < min ? precio : min;
  }, Infinity);
  const precioStr = precioDesde < Infinity ? `$${(precioDesde / 1000000).toFixed(1)}M` : '';

  // Mensaje resumen con precio
  const resumen = `🏡 *${devName}*${precioStr ? ` — Desde ${precioStr} equipada` : ''}\n\nAquí te comparto la información:`;
  await meta.sendWhatsAppMessage(phone, resumen);

  // CTA buttons para cada recurso disponible
  const delay = () => new Promise(r => setTimeout(r, 400));

  if (youtubeLink) {
    await delay();
    await meta.sendCTAButton(phone, `🎬 *Video de ${devName}*\nConoce el desarrollo`, 'Ver video', youtubeLink);
  }

  if (matterportLink) {
    await delay();
    await meta.sendCTAButton(phone, `🏠 *Recorrido 3D de ${devName}*\nExplora las casas por dentro`, 'Recorrido 3D', matterportLink);
  }

  if (gpsLink) {
    await delay();
    await meta.sendCTAButton(phone, `📍 *Ubicación de ${devName}*`, 'Abrir mapa', gpsLink);
  }

  if (brochureProp) {
    const brochureRaw = brochureProp.brochure_urls;
    const urls = Array.isArray(brochureRaw) ? brochureRaw : [brochureRaw];
    const htmlUrl = urls.find((u: string) => u.includes('.html') || u.includes('pages.dev') || u.includes('/brochure/'));
    if (htmlUrl) {
      await delay();
      await meta.sendCTAButton(phone, `📋 *Brochure de ${devName}*\nToda la info y precios`, 'Ver brochure', htmlUrl);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Enviar recursos como texto plano (ventana 24h cerrada)
// CTA buttons requieren ventana abierta; este fallback usa texto
// ═══════════════════════════════════════════════════════════════
async function enviarRecursosTextoRetell(
  meta: MetaWhatsAppService,
  phone: string,
  desarrollo: string,
  props: any[]
): Promise<void> {
  const prop = props[0];
  const devName = prop.development || prop.development_name || prop.name || desarrollo;

  // Buscar recursos en TODAS las propiedades del desarrollo
  const youtubeLink = props.find((p: any) => p.youtube_link)?.youtube_link;
  const matterportLink = props.find((p: any) => p.matterport_link)?.matterport_link;
  const gpsLink = props.find((p: any) => p.gps_link)?.gps_link;
  const brochureProp = props.find((p: any) => {
    const raw = p.brochure_urls;
    if (!raw) return false;
    const urls = Array.isArray(raw) ? raw : [raw];
    return urls.some((u: string) => u.includes('.html') || u.includes('pages.dev') || u.includes('/brochure/'));
  });

  // Precio mínimo
  const precioDesde = props.reduce((min: number, p: any) => {
    const precio = Number(p.price_equipped || p.price || 0);
    return precio > 0 && precio < min ? precio : min;
  }, Infinity);
  const precioStr = precioDesde < Infinity ? `$${(precioDesde / 1000000).toFixed(1)}M` : '';

  // Build a single text message with all available resources
  let msg = `🏡 *${devName}*${precioStr ? ` — Desde ${precioStr} equipada` : ''}\n`;

  if (youtubeLink) {
    msg += `\n🎬 Video: ${youtubeLink}`;
  }
  if (matterportLink) {
    msg += `\n🏠 Recorrido 3D: ${matterportLink}`;
  }
  if (gpsLink) {
    msg += `\n📍 Ubicación: ${gpsLink}`;
  }

  if (brochureProp) {
    const brochureRaw = brochureProp.brochure_urls;
    const urls = Array.isArray(brochureRaw) ? brochureRaw : [brochureRaw];
    const htmlUrl = urls.find((u: string) => u.includes('.html') || u.includes('pages.dev') || u.includes('/brochure/'));
    if (htmlUrl) {
      msg += `\n📋 Brochure: ${htmlUrl}`;
    }
  }

  msg += `\n\n¿Te gustaría agendar una visita? 🏠`;
  await meta.sendWhatsAppMessage(phone, msg);
}
