// ═══════════════════════════════════════════════════════════════════════════
// RETELL ROUTES - Voice call webhooks and configuration
// Extracted from index.ts for better code organization
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { formatPhoneForDisplay } from '../handlers/whatsapp-utils';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  API_SECRET?: string;
  SARA_CACHE?: KVNamespace;
  RETELL_API_KEY?: string;
  RETELL_AGENT_ID?: string;
  RETELL_PHONE_NUMBER?: string;
  OPENAI_API_KEY?: string;
}

type CorsResponseFn = (body: string | null, status?: number, contentType?: string, request?: Request) => Response;
type CheckApiAuthFn = (request: Request, env: Env) => Response | null;

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

        // Buscar el número de SARA (+524923860066)
        const saraNumber = env.RETELL_PHONE_NUMBER || '+524923860066';
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
    // CONFIGURE RETELL TOOLS - Registrar custom tools en el LLM de Retell
    // USO: /configure-retell-tools?api_key=XXX
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

        // 3. Definir las custom tools de SARA
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
            speak_during_execution: true,
            execution_message_description: 'Dile que estás buscando la información del desarrollo.',
            timeout_ms: 10000,
            parameters: {
              type: 'object',
              properties: {
                desarrollo: {
                  type: 'string',
                  description: 'Nombre del desarrollo. Opciones: Monte Verde, Los Encinos, Miravalle, Distrito Falco, Andes, Paseo Colorines, Citadella del Nogal, Villa Campelo, Villa Galiano'
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
            speak_during_execution: true,
            execution_message_description: 'Dile que estás buscando las opciones que se ajustan a su presupuesto.',
            timeout_ms: 10000,
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
            speak_during_execution: true,
            execution_message_description: 'Dile que estás agendando su cita.',
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
            speak_during_execution: true,
            execution_message_description: 'Dile que estás cancelando su cita.',
            timeout_ms: 10000,
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
            speak_during_execution: true,
            execution_message_description: 'Dile que estás cambiando su cita.',
            timeout_ms: 15000,
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
            speak_during_execution: true,
            execution_message_description: 'Dile que le estás enviando la información por WhatsApp.',
            timeout_ms: 10000,
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
            description: 'Consulta información sobre crédito hipotecario, INFONAVIT, FOVISSSTE, o bancario. Calcula capacidad de crédito aproximada basada en ingreso.',
            url: `${baseUrl}/webhook/retell/tool/info-credito`,
            method: 'POST',
            speak_during_execution: true,
            execution_message_description: 'Dile que estás calculando sus opciones de crédito.',
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

        // 4. Definir el prompt de SARA para llamadas INBOUND
        const saraPrompt = `Eres SARA, asistente virtual de ventas de Grupo Santa Rita, inmobiliaria en Zacatecas. Eres IA, no persona real.

REGLA #1: Habla CORTO. Máximo una o dos oraciones por turno. Es llamada telefónica, no discurso.
REGLA #2: UNA sola pregunta por turno. Nunca dos preguntas juntas.
REGLA #3: Precios SIEMPRE en palabras: "un millón seiscientos mil pesos", nunca números ni abreviaciones.
REGLA #4: No te cicles. Si ya tienes nombre, día y hora, agenda de una vez con la herramienta.
REGLA #5: NUNCA pidas el celular ni el teléfono del cliente. Ya estás hablando con él por teléfono, ya tienes su número.
REGLA #6: SÍ puedes enviar info por WhatsApp. Usa la herramienta enviar_info_whatsapp. Dile "Te mando la info por WhatsApp ahorita mismo".
REGLA #7: NUNCA sugieras un día específico (sábado, domingo, fin de semana, finde, mañana). SIEMPRE pregunta abierto: "¿Qué día te queda bien?" y espera a que EL CLIENTE diga el día.
REGLA #8: Cuando el cliente dice su nombre, RECUÉRDALO. No lo vuelvas a preguntar. Si ya lo tienes, úsalo directamente al agendar.
REGLA #9: Cuando el cliente da presupuesto, usa la herramienta buscar_por_presupuesto. Presenta TODAS las opciones que te devuelva, agrupadas por desarrollo y zona. No elijas solo una.

Variables: {{call_direction}} (inbound/outbound), {{lead_name}}, {{is_new_lead}}, {{desarrollo_interes}}, {{vendedor_nombre}}

Si inbound: el saludo ya se envió, NO lo repitas. Escucha y responde.
Si outbound: el saludo ya se envió. Menciona {{desarrollo_interes}} si tiene valor.

FLUJO DE VENTA:
1. "¿Buscas en Zacatecas o en Guadalupe?" (si dice las dos, está bien)
2. "¿Y tienes un presupuesto en mente?"
3. Con presupuesto, usa la herramienta buscar_por_presupuesto. Menciona TODAS las opciones que devuelva:
   "Con cinco millones hay varias opciones: en Colinas del Padre tienes Los Encinos, Miravalle y Paseo Colorines. En Guadalupe está Distrito Falco. Y las más económicas Monte Verde y Andes. ¿Cuál te llama más la atención?"
   Si solo hay pocas opciones, menciónalas todas con precio.
4. "¿Te gustaría conocerlo? ¿Qué día te queda para visitarlas?"
5. Pide nombre, agenda con la herramienta. Listo.

CITAS:
- Zacatecas (Monte Verde, Los Encinos, Miravalle, Paseo Colorines): "Te veo en las oficinas de Santa Rita en Colinas del Padre"
- Guadalupe (Andes, Distrito Falco, Citadella): "Te veo directamente en el desarrollo"
- Dos desarrollos: "Empezamos con uno y de ahí vamos al otro. ¿Qué día te queda para visitarlas?"
- Si dice un día sin hora, pregunta: "¿A qué hora te queda bien?"
- Después de agendar: "¡Listo, te esperamos! Te mando la ubicación por WhatsApp"

DESARROLLOS:
Zacatecas (Colinas del Padre) - SOLO CASAS:
- Monte Verde: desde un millón seiscientos mil pesos
- Los Encinos: desde tres millones
- Miravalle: desde tres millones
- Paseo Colorines: desde tres millones

Guadalupe - CASAS:
- Priv. Andes (Siglo Veintiuno): desde un millón seiscientos mil. ÚNICO CON ALBERCA, gym, asadores
- Distrito Falco (Calzada Solidaridad): desde tres millones setecientos mil. Premium, domótica

Terrenos Citadella del Nogal (Guadalupe):
- Villa Campelo: ocho mil quinientos a nueve mil quinientos por metro cuadrado
- Villa Galiano: seis mil cuatrocientos a seis mil setecientos por metro cuadrado

OBJECIONES (responde corto y cierra con pregunta):
- Caro: "Tenemos desde un millón seiscientos mil. ¿Cuál es tu presupuesto?"
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

        // 5. Actualizar el LLM con tools + prompt
        const updateResult = await retell.updateLlm(llmId, {
          general_tools: saraTools,
          general_prompt: saraPrompt
        });

        // 6. Configurar begin_message en el agente para que SARA conteste inmediatamente
        // Usa {{greeting}} que viene del lookup webhook
        const agentUpdate = await retell.updateAgent(agent.agent_id, {
          begin_message: '{{greeting}}',
          webhook_url: 'https://sara-backend.edson-633.workers.dev/webhook/retell'
        });

        if (updateResult.success) {
          return corsResponse(JSON.stringify({
            success: true,
            message: `${saraTools.length} tools + prompt inbound + begin_message configurados`,
            agent_id: agent.agent_id,
            llm_id: llmId,
            tools: saraTools.map(t => ({ name: t.name, type: t.type })),
            previous_tools_count: existingTools.length,
            prompt_length: saraPrompt.length,
            begin_message: '{{greeting}}',
            agent_update: agentUpdate.success ? 'ok' : agentUpdate.error
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
              precio_desde: '$1.5 millones'
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
          const nombre = lead.name.split(' ')[0]; // Solo primer nombre
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
          let precioDesde = '$1.5 millones';
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
              precio_desde: '$1.5 millones'
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (error) {
        console.error('❌ Retell Lookup Error:', error);
        return new Response(JSON.stringify({
          dynamic_variables: {
            call_direction: 'inbound',
            lead_name: '',
            is_new_lead: 'true',
            greeting: '¡Hola! Gracias por llamar a Grupo Santa Rita, soy Sara. Estoy aquí para apoyarte en lo que necesites — casas, terrenos, crédito. ¿Con quién tengo el gusto?',
            desarrollo_interes: '',
            vendedor_nombre: 'un asesor',
            precio_desde: '$1.5 millones'
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
          return new Response(JSON.stringify({
            result: `No encontré información de "${desarrollo}". Los desarrollos disponibles son: Monte Verde (desde $1.6M), Los Encinos (desde $3M), Miravalle (desde $3M), Distrito Falco (desde $3.7M), Andes (desde $1.6M), Paseo Colorines (desde $3M), y terrenos en Citadella del Nogal.`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const modelos = props.map((p: any) => {
          const precio = p.price_equipped || p.price || 0;
          return `${p.name}: $${(precio/1000000).toFixed(2)}M, ${p.bedrooms || '?'} rec, ${p.area_m2 || '?'}m² construcción${p.land_size ? `, ${p.land_size}m² terreno` : ''}`;
        }).join('. ');

        const gps = props[0]?.gps_link || '';
        const tieneAlberca = desarrollo.toLowerCase().includes('andes') ? ' Este desarrollo TIENE alberca.' : '';

        return new Response(JSON.stringify({
          result: `${desarrollo} tiene ${props.length} modelos: ${modelos}.${tieneAlberca} Todos incluyen closets y cocina integral (precio equipada).${gps ? ` Ubicación: ${gps}` : ''}`
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
          // Normalizar hora
          horaISO = hora.replace(/\s*(am|pm)/i, (m: string, p: string) => {
            return p.toLowerCase() === 'pm' ? '' : '';
          });
          if (!/^\d{1,2}:\d{2}$/.test(horaISO)) {
            const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
            if (horaMatch) {
              let h = parseInt(horaMatch[1]);
              const min = horaMatch[2] || '00';
              const period = horaMatch[3]?.toLowerCase();
              if (period === 'pm' && h < 12) h += 12;
              if (period === 'am' && h === 12) h = 0;
              horaISO = `${h.toString().padStart(2, '0')}:${min}`;
            }
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
        const { CalendarService } = await import('../services/calendarService');
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
            const { MetaWhatsAppService } = await import('../services/metaWhatsAppService');
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
            } catch (e) { /* usar fecha original */ }

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
        const { CalendarService } = await import('../services/calendarService');
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
        const { CalendarService } = await import('../services/calendarService');
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
        return new Response(JSON.stringify({ result: 'Error reagendando. Le confirmo por WhatsApp.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // TOOL: Enviar información por WhatsApp al cliente
    if (url.pathname === '/webhook/retell/tool/enviar-whatsapp' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const args = body.args || body;
        const callObj = body.call || {};
        console.log(`🔧 RETELL TOOL enviar-whatsapp FULL BODY:`, JSON.stringify(body).substring(0, 500));

        const tipo = args.tipo || 'info'; // 'brochure', 'ubicacion', 'video', 'info'
        const desarrollo = args.desarrollo || '';

        // Extraer teléfono de múltiples posibles ubicaciones en el body de Retell
        let callerPhone = callObj.from_number?.replace('+', '')
          || callObj.to_number?.replace('+', '')
          || body.from_number?.replace('+', '')
          || body.to_number?.replace('+', '')
          || body.metadata?.caller_phone?.replace('+', '')
          || '';

        // Fallback: buscar en KV por call_id o última llamada
        if (!callerPhone && env.SARA_CACHE) {
          const callId = callObj.call_id || body.call_id || '';
          if (callId) {
            callerPhone = await env.SARA_CACHE.get(`retell_call_phone:${callId}`) || '';
            if (callerPhone) console.log(`📞 Phone recuperado de KV por call_id: ${callerPhone}`);
          }
          if (!callerPhone) {
            callerPhone = await env.SARA_CACHE.get('retell_last_caller_phone') || '';
            if (callerPhone) console.log(`📞 Phone recuperado de KV (última llamada): ${callerPhone}`);
          }
        }
        console.log(`🔧 RETELL TOOL enviar-whatsapp callerPhone: ${callerPhone}`);
        if (!callerPhone) {
          // Si no tenemos teléfono, enviar la info cuando termine la llamada
          return new Response(JSON.stringify({ result: 'Listo, le envío la información por WhatsApp cuando termine la llamada.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Normalizar teléfono para WhatsApp (agregar 521 si necesario)
        let whatsappPhone = callerPhone.replace('+', '');
        if (whatsappPhone.startsWith('52') && whatsappPhone.length === 12) {
          whatsappPhone = '521' + whatsappPhone.substring(2);
        }

        const { MetaWhatsAppService } = await import('../services/metaWhatsAppService');
        const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

        if (tipo === 'ubicacion' || tipo === 'gps') {
          const { data: prop } = await supabase.client
            .from('properties')
            .select('gps_link, development')
            .ilike('development', `%${desarrollo}%`)
            .limit(1)
            .maybeSingle();

          if (prop?.gps_link) {
            await meta.sendWhatsAppMessage(whatsappPhone, `📍 Ubicación de ${desarrollo}:\n${prop.gps_link}`);
            return new Response(JSON.stringify({ result: `Ubicación de ${desarrollo} enviada por WhatsApp.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ result: `No encontré la ubicación de ${desarrollo}.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (tipo === 'brochure') {
          const { data: prop } = await supabase.client
            .from('properties')
            .select('brochure_urls, development')
            .ilike('development', `%${desarrollo}%`)
            .limit(1)
            .maybeSingle();

          if (prop?.brochure_urls && prop.brochure_urls.length > 0) {
            const brochureUrl = prop.brochure_urls[0];
            await meta.sendWhatsAppMessage(whatsappPhone, `📋 Brochure de ${desarrollo}:\n${brochureUrl}`);
            return new Response(JSON.stringify({ result: `Brochure de ${desarrollo} enviado por WhatsApp.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ result: `No encontré brochure de ${desarrollo}.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (tipo === 'video') {
          const { data: prop } = await supabase.client
            .from('properties')
            .select('youtube_link, development')
            .ilike('development', `%${desarrollo}%`)
            .limit(1)
            .maybeSingle();

          if (prop?.youtube_link) {
            await meta.sendWhatsAppMessage(whatsappPhone, `🎬 Video de ${desarrollo}:\n${prop.youtube_link}`);
            return new Response(JSON.stringify({ result: `Video de ${desarrollo} enviado por WhatsApp.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ result: `No encontré video de ${desarrollo}.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Info general del desarrollo
        if (desarrollo) {
          const { data: props } = await supabase.client
            .from('properties')
            .select('name, development, price_equipped, price, bedrooms, area_m2')
            .ilike('development', `%${desarrollo}%`);

          if (props && props.length > 0) {
            let msg = `🏡 *${desarrollo}*\n\n`;
            for (const p of props) {
              const precio = p.price_equipped || p.price || 0;
              msg += `• ${p.name}: $${(precio/1000000).toFixed(2)}M - ${p.bedrooms || '?'} rec, ${p.area_m2 || '?'}m²\n`;
            }
            msg += `\nSoy Sara de Grupo Santa Rita. ¿Te agendo una visita? 😊`;
            await meta.sendWhatsAppMessage(whatsappPhone, msg);
            return new Response(JSON.stringify({ result: `Info de ${desarrollo} enviada por WhatsApp con ${props.length} modelos y precios.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ result: `No encontré información de ${desarrollo}.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ result: 'Necesito saber qué desarrollo enviar. Pregúntale al cliente.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool enviar-whatsapp error:', e);
        return new Response(JSON.stringify({ result: 'Error enviando WhatsApp. Le mando la info después de la llamada.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

        if (tipoCredito.toLowerCase().includes('infonavit')) {
          respuesta = `Con INFONAVIT, el monto depende de tu subcuenta y salario. Con salario de $${ingreso ? (ingreso/1000).toFixed(0) + 'K' : '?'} mensual, podrías acceder a casas desde $1.6 millones usando INFONAVIT + crédito bancario (Cofinavit). Opciones: Monte Verde o Andes desde $1.6M. ¿Quieres que un asesor hipotecario te contacte para hacer la precalificación?`;
        } else if (tipoCredito.toLowerCase().includes('fovissste')) {
          respuesta = `FOVISSSTE es para trabajadores del gobierno. El monto depende de tu antigüedad y puntos. También se puede combinar con crédito bancario. Tenemos asesores hipotecarios que te pueden precalificar sin costo. ¿Quieres que te contacte un asesor?`;
        } else {
          if (ingreso && ingreso > 0) {
            const capacidadAprox = ingreso * 0.33 * 240; // 33% de ingreso, 20 años
            const capacidadM = (capacidadAprox / 1000000).toFixed(1);
            respuesta = `Con un ingreso de $${(ingreso/1000).toFixed(0)}K mensuales, podrías obtener un crédito bancario de aproximadamente $${capacidadM}M (20 años, ~33% de ingreso). Bancos: BBVA, Banorte, Santander, HSBC. Las tasas van del 9% al 12% anual. ¿Quieres que un asesor hipotecario te contacte gratis?`;
          } else {
            respuesta = `Trabajamos con todos los bancos: BBVA, Banorte, Santander, HSBC, Scotiabank. También INFONAVIT, FOVISSSTE y Cofinavit. El enganche mínimo es 10% y con INFONAVIT puede ser 0%. Dime tu ingreso mensual aproximado y te digo para qué casas calificas.`;
          }
        }

        return new Response(JSON.stringify({ result: respuesta }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool info-credito error:', e);
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

        const citasText = citas.map((c: any) => `${c.scheduled_date} a las ${c.scheduled_time} en ${c.property_name || 'desarrollo'}${c.vendedor_name ? ` con ${c.vendedor_name}` : ''}`).join('. ');
        return new Response(JSON.stringify({
          result: `${lead.name || 'El cliente'} tiene ${citas.length} cita(s): ${citasText}. ¿Quiere cambiar alguna?`
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool consultar-citas error:', e);
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
              result: `Con ${(presupuesto/1000000).toFixed(1)} millones no tenemos casas disponibles. La más económica es Acacia en Monte Verde a un millón seiscientos mil. También tenemos terrenos en Citadella del Nogal desde seis mil cuatrocientos por metro cuadrado. ¿Le interesa alguna de estas opciones?`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({
            result: `No encontré opciones exactas para ${(presupuesto/1000000).toFixed(1)} millones. Nuestras casas van desde un millón seiscientos hasta cinco millones y medio. ¿Quiere que le muestre las más cercanas a su presupuesto?`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Agrupar por desarrollo
        const porDesarrollo: Record<string, any[]> = {};
        for (const p of props) {
          const dev = p.development || 'Otro';
          if (!porDesarrollo[dev]) porDesarrollo[dev] = [];
          porDesarrollo[dev].push(p);
        }

        let resultado = `Con presupuesto de ${(presupuesto/1000000).toFixed(1)} millones${recamaras ? ` y ${recamaras}+ recámaras` : ''}, tienes estas opciones:\n`;

        for (const [dev, modelos] of Object.entries(porDesarrollo)) {
          const zona = ['Monte Verde', 'Los Encinos', 'Miravalle', 'Paseo Colorines'].includes(dev)
            ? 'Colinas del Padre' : 'Guadalupe';
          resultado += `\n${dev} (${zona}): `;
          resultado += modelos.map((m: any) => {
            const precio = m.price_equipped || m.price || 0;
            return `${m.name} $${(precio/1000000).toFixed(2)}M ${m.bedrooms || '?'}rec ${m.area_m2 || '?'}m²`;
          }).join(', ');
        }

        resultado += `\n\nTotal: ${props.length} opciones en ${Object.keys(porDesarrollo).length} desarrollos.`;
        if (props.some((p: any) => p.development === 'Andes')) {
          resultado += ' Andes es el único con alberca.';
        }

        return new Response(JSON.stringify({ result: resultado }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('❌ Retell tool buscar-por-presupuesto error:', e);
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

          if (lead?.team_members) {
            const vendedorPhone = (lead.team_members as any).phone;
            const vendedorName = (lead.team_members as any).name;
            const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

            if (isInbound) {
              // Llamada entrante: el lead nos está llamando
              await meta.sendWhatsAppMessage(vendedorPhone,
                `📞📥 ${lead.name || leadPhone} está LLAMANDO a SARA...\n` +
                `La IA está atendiendo la llamada.`
              );
            } else {
              // Llamada saliente: nosotros llamamos al lead
              await meta.sendWhatsAppMessage(vendedorPhone,
                `📞📤 SARA está llamando a ${lead.name || leadPhone}...`
              );
            }
          } else if (isInbound) {
            // Llamada entrante de número desconocido
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

                // Notificar al vendedor asignado
                if (vendedorId) {
                  const { data: vendedor } = await supabase.client
                    .from('team_members')
                    .select('phone, name')
                    .eq('id', vendedorId)
                    .single();

                  if (vendedor?.phone) {
                    const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
                    await meta.sendWhatsAppMessage(vendedor.phone,
                      `🆕📞 NUEVO LEAD POR TELÉFONO\n\n` +
                      `👤 ${nombreFromCall}\n` +
                      `📱 ${leadPhone}\n` +
                      `🏠 Interés: ${desarrolloInteres || 'Por definir'}\n` +
                      `💰 Presupuesto: ${presupuesto || 'Por definir'}\n\n` +
                      `La llamada ya terminó. Te recomiendo dar seguimiento por WhatsApp.`
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
                outcome: call.call_analysis?.call_successful ? 'successful' : 'unknown',
                created_at: new Date().toISOString()
              });
              console.log(`✅ Call log guardado: ${call.call_id}`);
            } catch (clError) {
              console.log(`⚠️ call_logs no disponible, continuando...`);
            }

            // Detectar desarrollo mencionado en el transcript (antes de if(lead) para que esté en scope)
            // Transcript puede ser string ("Agent: ...\nUser: ...") o array ([{role, content}])
            let desarrolloDelTranscript = '';
            const desarrollosConocidos = ['monte verde', 'los encinos', 'miravalle', 'paseo colorines', 'andes', 'distrito falco', 'citadella', 'villa campelo', 'villa galiano'];
            if (call.transcript) {
              let userMessages: string[] = [];
              if (typeof call.transcript === 'string') {
                const lines = call.transcript.split('\n');
                for (const line of lines) {
                  if (line.startsWith('User:')) {
                    userMessages.push(line.substring(5).trim().toLowerCase());
                  }
                }
              } else if (Array.isArray(call.transcript)) {
                for (const entry of call.transcript) {
                  if (entry.role === 'user') {
                    userMessages.push(entry.content.toLowerCase());
                  }
                }
              }
              for (let i = userMessages.length - 1; i >= 0; i--) {
                const encontrado = desarrollosConocidos.find(d => userMessages[i].includes(d));
                if (encontrado) {
                  desarrolloDelTranscript = encontrado.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  break;
                }
              }
            }

            const nuevoDesarrollo = call.call_analysis?.custom_analysis_data?.desarrollo_interes ||
                                    call.call_analysis?.custom_analysis?.desarrollo_interes ||
                                    call.metadata?.desarrollo_interes ||
                                    call.metadata?.desarrollo;
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
              if (desarrolloFinal) {
                updateData.property_interest = desarrolloFinal;
                console.log(`🏠 Actualizado property_interest: ${desarrolloFinal}`);
              }

              await supabase.client.from('leads').update(updateData).eq('id', lead.id);
              console.log(`📝 Nota de llamada agregada a lead ${lead.id}`);
            }

            // Notificar al vendedor (re-leer lead para tener nombre fresco)
            if (lead?.assigned_to) {
              const { data: freshLead } = await supabase.client.from('leads').select('name').eq('id', lead.id).single();
              const leadDisplayName = (freshLead?.name && freshLead.name !== 'Lead Telefónico' && freshLead.name !== 'Lead')
                ? freshLead.name
                : (isInbound ? call.from_number : call.to_number);

              const { data: vendedor } = await supabase.client
                .from('team_members')
                .select('phone, name')
                .eq('id', lead.assigned_to)
                .single();

              if (vendedor?.phone) {
                const durationMin = call.duration_ms ? Math.round(call.duration_ms / 60000) : 0;
                const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);
                let mensaje = `📞 Llamada IA completada con ${leadDisplayName}\n`;
                mensaje += `⏱️ Duración: ${durationMin} minutos\n`;
                if (call.call_analysis?.summary) {
                  mensaje += `📝 Resumen: ${call.call_analysis.summary.substring(0, 300)}`;
                }
                await meta.sendWhatsAppMessage(vendedor.phone, mensaje);
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
            if (event === 'call_analyzed' && lead && call.transcript) {
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
HORA ACTUAL: ${horaActual} (zona horaria México Central, UTC-6)

TRANSCRIPT:
${transcriptText}

Responde SOLO con JSON válido, sin markdown ni texto adicional:
{"callback_requested": true/false, "type": "llamada" | "visita" | "seguimiento" | "none", "date": "YYYY-MM-DD" o null, "time": "HH:MM" (24h) o null, "description": "breve descripción", "raw_text": "frase exacta del lead"}

Tipos:
- "visita" = el lead quiere IR PRESENCIALMENTE a ver casas/desarrollo
- "llamada" = el lead pide que le VUELVAN A MARCAR/LLAMAR
- "seguimiento" = acordaron dar seguimiento general (enviar info, WhatsApp, contactar después) SIN ser visita ni llamada específica

Reglas:
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
                  const citaTipo = callbackData.type === 'visita' ? 'visita' : callbackData.type === 'seguimiento' ? 'seguimiento' : 'llamada';

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
                        property_name: desarrolloFinal || lead.property_interest || (citaTipo === 'visita' ? null : citaTipo === 'llamada' ? 'Llamada programada' : 'Seguimiento'),
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
                      let desarrolloNombre = desarrolloFinal || 'General';
                      if (desarrolloFinal && (citaTipo === 'visita' || citaTipo === 'seguimiento')) {
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
                          msgVendedor += `🏠 *Desarrollo:* ${desarrolloNombre}\n`;
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
                                desarrolloNombre,
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
                      const tipoTexto = citaTipo === 'visita' ? 'visita presencial' : citaTipo === 'llamada' ? 'llamada telefónica' : 'seguimiento';
                      const primerNombreLead = lead.name?.split(' ')[0] || '';
                      let msgLead = `📅 ¡Listo${primerNombreLead ? ', ' + primerNombreLead : ''}! Queda agendado tu *${tipoTexto}* para el *${fechaBonita}*.\n\n`;
                      msgLead += `🏠 *Desarrollo:* ${desarrolloNombre}\n`;
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
                        desarrollo: desarrolloNombre,
                        gpsLink: gpsLink
                      };

                      debugLog.push({ t: Date.now(), step: 'callback_appointment_created', fecha: citaFecha, hora: citaHora, tipo: citaTipo });
                    }
                  }
                }
              } catch (callbackError: any) {
                console.error('Error detectando callback:', callbackError?.message);
                debugLog.push({ t: Date.now(), step: 'callback_error', error: callbackError?.message });
              }
            }

            // ═══════════════════════════════════════════════════════════════
            // SEGUIMIENTO AUTOMÁTICO POR WHATSAPP AL LEAD
            // Enviar mensaje + brochure + GPS después de la llamada
            // RESPETA VENTANA 24H: si cerrada → usa template
            // SOLO en call_analyzed (no call_ended) para evitar mensajes dobles
            // ═══════════════════════════════════════════════════════════════
            if (event === 'call_analyzed' && leadPhone && call.duration_ms && call.duration_ms > 15000) {
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

                const desarrolloInteres = desarrolloDelTranscript ||
                                          call.call_analysis?.custom_analysis_data?.desarrollo_interes ||
                                          call.call_analysis?.custom_analysis?.desarrollo_interes ||
                                          call.metadata?.desarrollo_interes ||
                                          call.metadata?.desarrollo ||
                                          lead?.property_interest;

                if (ventanaAbierta) {
                  // VENTANA ABIERTA → enviar mensajes directos
                  const primerNombre = lead?.name ? ' ' + lead.name.split(' ')[0] : '';
                  let mensajeFollowUp = `¡Hola${primerNombre}! 👋\n\n`;
                  if (isInbound) {
                    mensajeFollowUp += `Soy Sara de Grupo Santa Rita. ¡Gracias por llamarnos! `;
                  } else {
                    mensajeFollowUp += `Soy Sara de Grupo Santa Rita. Gracias por la llamada. `;
                  }
                  if (desarrolloInteres) {
                    mensajeFollowUp += `Me da gusto que te interese *${desarrolloInteres}*. `;
                  }
                  mensajeFollowUp += `\n\nTe comparto información por aquí para que la revises con calma. `;
                  mensajeFollowUp += `Si tienes cualquier duda, aquí estoy para ayudarte. 🏠`;

                  debugLog.push({ t: Date.now(), step: 'sending_whatsapp', desarrollo: desarrolloInteres, ventana: 'abierta' });
                  await meta.sendWhatsAppMessage(leadPhone, mensajeFollowUp);
                  debugLog.push({ t: Date.now(), step: 'whatsapp_sent_ok' });
                  console.log(`📱 WhatsApp directo enviado a ${leadPhone}`);

                  // Enviar recursos
                  if (desarrolloInteres) {
                    const desarrolloNormalizado = desarrolloInteres.toLowerCase()
                      .replace('priv.', 'privada').replace('priv ', 'privada ').trim();

                    const { data: props } = await supabase.client
                      .from('properties')
                      .select('name, development, brochure_urls, gps_link, youtube_link, matterport_link, price, price_equipped')
                      .or(`name.ilike.%${desarrolloNormalizado}%,development.ilike.%${desarrolloNormalizado}%`)
                      .limit(3);

                    if (props && props.length > 0) {
                      const prop = props[0];
                      await new Promise(resolve => setTimeout(resolve, 1500));

                      let recursosMensaje = `📋 *Información de ${prop.development || prop.name || desarrolloInteres}:*\n\n`;
                      const precioDesde = props.reduce((min, p) => {
                        const precio = p.price_equipped || p.price || 0;
                        return precio > 0 && precio < min ? precio : min;
                      }, Infinity);
                      if (precioDesde < Infinity) {
                        recursosMensaje += `💰 Desde $${(precioDesde / 1000000).toFixed(1)}M equipada\n`;
                      }
                      if (prop.youtube_link) recursosMensaje += `🎬 Video: ${prop.youtube_link}\n`;
                      if (prop.matterport_link) recursosMensaje += `🏠 Recorrido 3D: ${prop.matterport_link}\n`;
                      if (prop.gps_link) recursosMensaje += `📍 Ubicación: ${prop.gps_link}\n`;
                      const brochureRaw = prop.brochure_urls;
                      if (brochureRaw) {
                        const urls = Array.isArray(brochureRaw) ? brochureRaw : [brochureRaw];
                        const htmlUrl = urls.find((u: string) => u.includes('.html') || u.includes('pages.dev'));
                        if (htmlUrl) recursosMensaje += `📄 Brochure: ${htmlUrl}\n`;
                      }
                      recursosMensaje += `\n¿Te gustaría agendar una visita? 😊`;
                      await meta.sendWhatsAppMessage(leadPhone, recursosMensaje);
                      console.log(`📋 Recursos enviados para ${desarrolloInteres}`);
                    }
                  }
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
                          const htmlUrl = urls.find((u: string) => u.includes('.html') || u.includes('pages.dev'));
                          if (htmlUrl) {
                            // Extraer slug: "https://brochures-santarita.pages.dev/monte_verde.html" → "monte_verde.html"
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
                      : 'qR8vK3xYz9M';

                    await metaCb.sendTemplate(callbackConfirmacionPendiente.phone, 'appointment_confirmation_v2', 'es', [
                      {
                        type: 'body',
                        parameters: [
                          { type: 'text', text: cbNombre },              // {{1}} Nombre
                          { type: 'text', text: 'Grupo Santa Rita' },    // {{2}} Empresa
                          { type: 'text', text: cbTipoTexto },           // {{3}} Tipo (visita a Monte Verde / llamada telefónica)
                          { type: 'text', text: cbFechaStr },            // {{4}} Fecha
                          { type: 'text', text: cbHoraStr }              // {{5}} Hora
                        ]
                      },
                      {
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [
                          { type: 'text', text: cbGpsCode }              // GPS link suffix
                        ]
                      }
                    ]);
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
        return new Response('OK', { status: 200 });
      }
    }

  return null; // Not a Retell route
}
