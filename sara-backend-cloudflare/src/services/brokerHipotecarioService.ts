// ============================================
// BROKER HIPOTECARIO AUTOMATIZADO - SARA
// ============================================
// Cliente solo manda fotos y firma
// SARA hace todo lo demás
// Asesor del banco solo evalúa y aprueba
// Archivo: src/handlers/brokerHipotecarioService.ts

import { SupabaseClient } from '@supabase/supabase-js';

// Tipos
interface DatosExtraidos {
  // De INE
  nombre_completo?: string;
  nombre?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  direccion?: string;
  colonia?: string;
  cp?: string;
  ciudad?: string;
  estado?: string;
  curp?: string;
  clave_elector?: string;
  fecha_nacimiento?: string;
  sexo?: string;
  vigencia_ine?: string;
  
  // De nóminas
  empresa?: string;
  rfc_empresa?: string;
  puesto?: string;
  sueldo_bruto?: number;
  sueldo_neto?: number;
  fecha_nomina?: string;
  num_empleado?: string;
  
  // De comprobante domicilio
  tipo_comprobante?: string;
  fecha_comprobante?: string;
  
  // De Infonavit
  nss?: string;
  puntos_infonavit?: number;
  saldo_subcuenta?: number;
  
  // Calculados
  ingreso_promedio?: number;
  antiguedad_estimada?: string;
}

interface AsessorBanco {
  id: string;
  banco: string;
  nombre: string;
  email: string;
  telefono: string;
  activo: boolean;
}

interface SolicitudBanco {
  id: string;
  expediente_id: string;
  asesor_id: string;
  banco: string;
  status: 'enviado' | 'en_revision' | 'aprobado' | 'rechazado' | 'sin_respuesta';
  monto_aprobado?: number;
  tasa?: number;
  cat?: number;
  plazo?: number;
  mensualidad?: number;
  razon_rechazo?: string;
  fecha_envio: string;
  fecha_respuesta?: string;
}

export class BrokerHipotecarioService {
  private supabase: SupabaseClient;
  private openaiKey: string;
  private sendWhatsApp: (to: string, message: string) => Promise<void>;

  constructor(
    supabase: SupabaseClient,
    openaiKey: string,
    sendWhatsApp: (to: string, message: string) => Promise<void>
  ) {
    this.supabase = supabase;
    this.openaiKey = openaiKey;
    this.sendWhatsApp = sendWhatsApp;
  }

  // ═══════════════════════════════════════════════════════════════
  // MENSAJE INICIAL - OFRECER OPCIONES A/B
  // ═══════════════════════════════════════════════════════════════
  getMensajeInicial(nombreCliente: string): string {
    return `¡Hola ${nombreCliente}! 👋

Te puedo ayudar de dos formas:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A) 🤖 YO ME ENCARGO DE TODO

Solo mándame fotos por aquí:

📸 Tu INE (los dos lados)
📸 Tus recibos de nómina (3 meses)
📸 Un recibo de luz o agua

Yo hago el resto:
✓ Saco tus datos de las fotos
✓ Lleno los formatos de los bancos
✓ Lo mando a varios bancos a la vez
✓ Te consigo la mejor opción

Tú solo firmas con tu dedo 👆

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

B) 👤 ASESOR DIRECTO

Te conecto con un asesor del banco
y tú ves todo con él.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

¿Qué prefieres? ¿A o B?`;
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCESAR ELECCIÓN DEL CLIENTE
  // ═══════════════════════════════════════════════════════════════
  async procesarEleccion(leadId: string, mensaje: string): Promise<{ modo: 'auto' | 'asesor' | null; respuesta: string }> {
    const msgLower = mensaje.toLowerCase().trim();
    
    // Opción A - Automático
    if (msgLower === 'a' || msgLower.includes('tu te encargas') || msgLower.includes('tú te encargas') || 
        msgLower.includes('automatico') || msgLower.includes('automático') || msgLower.includes('opcion a') ||
        msgLower.includes('opción a') || msgLower.includes('la a')) {
      
      await this.iniciarModoAutomatico(leadId);
      
      return {
        modo: 'auto',
        respuesta: `¡Perfecto! 💪 Yo me encargo.

¿Tienes tus documentos a la mano 
o necesitas tiempo para juntarlos?`
      };
    }
    
    // Opción B - Asesor directo
    if (msgLower === 'b' || msgLower.includes('asesor') || msgLower.includes('directo') ||
        msgLower.includes('opcion b') || msgLower.includes('opción b') || msgLower.includes('la b')) {
      
      return {
        modo: 'asesor',
        respuesta: `¡Muy bien! Te conecto con un asesor.

¿De qué banco prefieres?
• BBVA
• Scotiabank
• Banorte
• Santander
• HSBC
• Infonavit directo

¿O prefieres que yo escoja el mejor para ti?`
      };
    }
    
    return { modo: null, respuesta: '' };
  }

  // ═══════════════════════════════════════════════════════════════
  // INICIAR MODO AUTOMÁTICO
  // ═══════════════════════════════════════════════════════════════
  private async iniciarModoAutomatico(leadId: string): Promise<void> {
    await this.supabase.from('expedientes_broker').upsert({
      lead_id: leadId,
      modo: 'automatico',
      status: 'recopilando_docs',
      documentos_recibidos: [],
      datos_extraidos: {},
      created_at: new Date().toISOString()
    }, { onConflict: 'lead_id' });

    await this.supabase.from('leads').update({
      broker_mode: 'automatico',
      broker_stage: 'recopilando_docs'
    }).eq('id', leadId);
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCESAR DOCUMENTO (FOTO/PDF)
  // ═══════════════════════════════════════════════════════════════
  async procesarDocumento(leadId: string, mediaUrl: string, mediaType: string): Promise<string> {
    // Obtener expediente actual
    const { data: expediente } = await this.supabase
      .from('expedientes_broker')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (!expediente) {
      return 'Primero dime si quieres que yo me encargue (A) o prefieres asesor directo (B)';
    }

    const docsRecibidos = expediente.documentos_recibidos || [];
    const datosActuales = expediente.datos_extraidos || {};

    // Analizar documento con Vision API
    const analisis = await this.analizarDocumentoCompleto(mediaUrl, docsRecibidos, datosActuales);

    if (analisis.error) {
      return analisis.mensaje;
    }

    // Guardar documento
    await this.supabase.from('documentos_broker').insert({
      expediente_id: expediente.id,
      lead_id: leadId,
      tipo: analisis.tipo,
      subtipo: analisis.subtipo,
      media_url: mediaUrl,
      datos_extraidos: analisis.datos,
      valido: analisis.valido,
      problema: analisis.problema
    });

    // Actualizar expediente
    if (analisis.tipo && analisis.valido) {
      const nuevoDoc = analisis.subtipo ? `${analisis.tipo}_${analisis.subtipo}` : analisis.tipo;
      if (!docsRecibidos.includes(nuevoDoc)) {
        docsRecibidos.push(nuevoDoc);
      }
      
      // Merge de datos extraídos
      const nuevosDatos = { ...datosActuales, ...analisis.datos };
      
      await this.supabase.from('expedientes_broker').update({
        documentos_recibidos: docsRecibidos,
        datos_extraidos: nuevosDatos
      }).eq('id', expediente.id);
    }

    // Verificar qué falta
    const siguientePaso = this.determinarSiguientePaso(docsRecibidos);
    
    if (siguientePaso.completo) {
      // ¡Todo listo! Pedir firma
      await this.supabase.from('expedientes_broker').update({
        status: 'pendiente_firma'
      }).eq('id', expediente.id);

      return `${analisis.mensaje}

🎉 ¡Ya tengo todo!

${this.getResumenDatos(expediente.datos_extraidos, analisis.datos)}

Para mandarlo a los bancos necesito 
tu firma. Entra aquí y firma con 
tu dedo:

👉 [LINK DE FIRMA]

Es rápido, 10 segundos ✍️`;
    }

    return `${analisis.mensaje}

${siguientePaso.mensaje}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALIZAR DOCUMENTO CON VISION API
  // ═══════════════════════════════════════════════════════════════
  private async analizarDocumentoCompleto(
    mediaUrl: string,
    docsRecibidos: string[],
    datosActuales: DatosExtraidos
  ): Promise<{
    tipo: string;
    subtipo?: string;
    datos: DatosExtraidos;
    valido: boolean;
    problema?: string;
    mensaje: string;
    error?: boolean;
  }> {
    
    const prompt = `Analiza este documento para un trámite de crédito hipotecario en México.

DOCUMENTOS QUE YA TENEMOS:
${docsRecibidos.join(', ') || 'Ninguno aún'}

DATOS QUE YA TENEMOS:
${JSON.stringify(datosActuales, null, 2)}

ANALIZA Y EXTRAE TODO:

1. ¿QUÉ DOCUMENTO ES?
   - INE (frente o reverso)
   - Recibo de nómina
   - Comprobante de domicilio (luz, agua, gas, teléfono)
   - Estado de cuenta Infonavit
   - CURP
   - Otro

2. EXTRAE TODOS LOS DATOS VISIBLES:
   
   Si es INE:
   - Nombre completo (separado: nombre, apellido paterno, materno)
   - Dirección completa (calle, número, colonia, CP, ciudad, estado)
   - CURP
   - Clave de elector
   - Fecha de nacimiento
   - Sexo
   - Vigencia
   
   Si es NÓMINA:
   - Nombre de la empresa
   - RFC de la empresa
   - Puesto del empleado
   - Sueldo bruto y neto
   - Fecha del recibo
   - Número de empleado
   - Percepciones y deducciones
   
   Si es COMPROBANTE DOMICILIO:
   - Tipo (CFE, agua, gas, teléfono)
   - Dirección completa
   - Fecha de emisión
   
   Si es INFONAVIT:
   - NSS
   - Puntos
   - Saldo de subcuenta

3. VALIDACIONES:
   - ¿Está vigente? (INE, comprobante)
   - ¿Es legible?
   - ¿Está completo?
   - Comprobante domicilio debe ser de menos de 3 meses

Responde JSON:
{
  "tipo_documento": "ine_frente|ine_reverso|nomina|comprobante_domicilio|infonavit|curp|otro",
  "subtipo": "si es nómina: mes (ej: 'octubre_2024'), si es comprobante: tipo (ej: 'cfe')",
  "es_valido": true/false,
  "datos_extraidos": {
    "nombre_completo": "",
    "nombre": "",
    "apellido_paterno": "",
    "apellido_materno": "",
    "direccion": "",
    "colonia": "",
    "cp": "",
    "ciudad": "",
    "estado": "",
    "curp": "",
    "clave_elector": "",
    "fecha_nacimiento": "",
    "sexo": "",
    "vigencia_ine": "",
    "empresa": "",
    "rfc_empresa": "",
    "puesto": "",
    "sueldo_bruto": 0,
    "sueldo_neto": 0,
    "fecha_nomina": "",
    "num_empleado": "",
    "tipo_comprobante": "",
    "fecha_comprobante": "",
    "nss": "",
    "puntos_infonavit": 0,
    "saldo_subcuenta": 0
  },
  "problemas": [],
  "mensaje_casual": "Mensaje amigable para el cliente, tipo '✅ Ya tengo tu INE, se ve bien' o '⚠️ La foto salió borrosa, ¿me la mandas de nuevo?'"
}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: mediaUrl } }
            ]
          }],
          max_tokens: 1000
        })
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');

      // Limpiar datos extraídos (quitar nulls y vacíos)
      const datosLimpios: DatosExtraidos = {};
      if (parsed.datos_extraidos) {
        for (const [key, value] of Object.entries(parsed.datos_extraidos)) {
          if (value !== null && value !== undefined && value !== '' && value !== 0) {
            (datosLimpios as any)[key] = value;
          }
        }
      }

      return {
        tipo: parsed.tipo_documento?.split('_')[0] || 'desconocido',
        subtipo: parsed.subtipo || parsed.tipo_documento?.split('_')[1],
        datos: datosLimpios,
        valido: parsed.es_valido === true,
        problema: parsed.problemas?.join(', '),
        mensaje: parsed.mensaje_casual || '✅ Documento recibido'
      };

    } catch (error) {
      console.error('Error analizando documento:', error);
      return {
        tipo: 'error',
        datos: {},
        valido: false,
        mensaje: 'No pude leer bien la foto 😕 ¿Me la mandas de nuevo con mejor luz?',
        error: true
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DETERMINAR SIGUIENTE PASO
  // ═══════════════════════════════════════════════════════════════
  private determinarSiguientePaso(docsRecibidos: string[]): { completo: boolean; mensaje: string } {
    const tieneINEFrente = docsRecibidos.some(d => d.includes('ine') && d.includes('frente'));
    const tieneINEReverso = docsRecibidos.some(d => d.includes('ine') && d.includes('reverso'));
    const tieneINE = docsRecibidos.includes('ine') || (tieneINEFrente && tieneINEReverso);
    
    const nominasRecibidas = docsRecibidos.filter(d => d.includes('nomina')).length;
    const tieneNominas = nominasRecibidas >= 3;
    
    const tieneComprobante = docsRecibidos.some(d => 
      d.includes('comprobante') || d.includes('cfe') || d.includes('luz') || d.includes('agua')
    );

    // Verificar qué falta
    if (!tieneINEFrente && !tieneINE) {
      return {
        completo: false,
        mensaje: 'Ahora mándame la parte de ATRÁS de tu INE 📸'
      };
    }

    if (tieneINEFrente && !tieneINEReverso && !tieneINE) {
      return {
        completo: false,
        mensaje: 'Ahora mándame la parte de ATRÁS de tu INE 📸'
      };
    }

    if (!tieneNominas) {
      const faltantes = 3 - nominasRecibidas;
      if (nominasRecibidas === 0) {
        return {
          completo: false,
          mensaje: `Ahora mándame tus recibos de nómina 
de los últimos 3 meses 📄

(si los tienes en PDF también jalan)`
        };
      } else {
        return {
          completo: false,
          mensaje: `✅ ${nominasRecibidas} nómina${nominasRecibidas > 1 ? 's' : ''} recibida${nominasRecibidas > 1 ? 's' : ''}

Faltan ${faltantes} más para completar 3 meses 📄`
        };
      }
    }

    if (!tieneComprobante) {
      return {
        completo: false,
        mensaje: `Ahora mándame un comprobante de domicilio 🏠

Puede ser:
• Recibo de luz (CFE)
• Recibo de agua
• Recibo de gas
• Estado de cuenta bancario

(que sea de los últimos 3 meses)`
      };
    }

    // ¡TODO COMPLETO!
    return {
      completo: true,
      mensaje: ''
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RESUMEN DE DATOS EXTRAÍDOS
  // ═══════════════════════════════════════════════════════════════
  private getResumenDatos(datosAnteriores: DatosExtraidos, datosNuevos: DatosExtraidos): string {
    const datos = { ...datosAnteriores, ...datosNuevos };
    
    let resumen = '📋 Tus datos:\n\n';
    
    if (datos.nombre_completo) {
      resumen += `👤 ${datos.nombre_completo}\n`;
    }
    
    if (datos.empresa) {
      resumen += `🏢 ${datos.empresa}\n`;
    }
    
    if (datos.sueldo_neto || datos.ingreso_promedio) {
      const sueldo = datos.ingreso_promedio || datos.sueldo_neto;
      resumen += `💰 $${sueldo?.toLocaleString()}/mes\n`;
    }
    
    if (datos.puntos_infonavit) {
      resumen += `📊 ${datos.puntos_infonavit} puntos Infonavit\n`;
    }

    return resumen;
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCESAR FIRMA Y ENVIAR A BANCOS
  // ═══════════════════════════════════════════════════════════════
  async procesarFirmaYEnviar(leadId: string, firmaUrl: string): Promise<string> {
    // Obtener expediente
    const { data: expediente } = await this.supabase
      .from('expedientes_broker')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (!expediente) {
      return 'No encontré tu expediente. ¿Empezamos de nuevo?';
    }

    // Guardar firma
    await this.supabase.from('expedientes_broker').update({
      firma_url: firmaUrl,
      firma_fecha: new Date().toISOString(),
      status: 'enviando_bancos'
    }).eq('id', expediente.id);

    // Obtener asesores activos de cada banco
    const { data: asesores } = await this.supabase
      .from('asesores_banco')
      .select('*')
      .eq('activo', true)
      .order('calificacion', { ascending: false });

    if (!asesores?.length) {
      return 'Error: No hay asesores disponibles. Te contactamos pronto.';
    }

    // Generar PDFs y enviar a cada banco
    const bancosEnviados: string[] = [];
    
    for (const asesor of asesores.slice(0, 3)) { // Máximo 3 bancos
      await this.enviarABanco(expediente, asesor);
      bancosEnviados.push(asesor.banco);
    }

    // Actualizar status
    await this.supabase.from('expedientes_broker').update({
      status: 'enviado_bancos',
      bancos_enviados: bancosEnviados,
      fecha_envio: new Date().toISOString()
    }).eq('id', expediente.id);

    return `✅ ¡Firmado y enviado!

Ya mandé tu expediente a:
${bancosEnviados.map(b => `• ${b}`).join('\n')}

Te aviso cuando respondan 
(normalmente 2-5 días) 📨

Mientras, cualquier duda me dices 👍`;
  }

  // ═══════════════════════════════════════════════════════════════
  // ENVIAR A BANCO ESPECÍFICO
  // ═══════════════════════════════════════════════════════════════
  private async enviarABanco(expediente: any, asesor: AsessorBanco): Promise<void> {
    // Crear registro de solicitud
    const { data: solicitud } = await this.supabase.from('solicitudes_banco').insert({
      expediente_id: expediente.id,
      lead_id: expediente.lead_id,
      asesor_id: asesor.id,
      banco: asesor.banco,
      status: 'enviado',
      fecha_envio: new Date().toISOString()
    }).select().single();

    // Obtener documentos
    const { data: documentos } = await this.supabase
      .from('documentos_broker')
      .select('*')
      .eq('expediente_id', expediente.id)
      .eq('valido', true);

    // Obtener datos del lead
    const { data: lead } = await this.supabase
      .from('leads')
      .select('*')
      .eq('id', expediente.lead_id)
      .single();

    // Enviar email al asesor del banco
    const emailContent = this.generarEmailAsesor(expediente, lead, documentos, asesor);
    
    // TODO: Integrar con servicio de email
    // await this.sendEmail(asesor.email, emailContent);

    // Notificar por WhatsApp al asesor si tiene teléfono
    if (asesor.telefono) {
      const msgAsesor = `📋 NUEVO EXPEDIENTE

👤 ${lead?.name}
📱 ${lead?.phone}

💰 Solicita: ${expediente.datos_extraidos?.tipo_credito || 'Hipotecario'}
📊 Ingreso: $${(expediente.datos_extraidos?.ingreso_promedio || 0).toLocaleString()}/mes

📎 Expediente completo adjunto
✅ Documentos validados
✅ Firmado

Solo evalúa y responde 👍`;

      await this.sendWhatsApp(asesor.telefono, msgAsesor);
    }

    console.log(`Enviado a ${asesor.banco} - ${asesor.nombre}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // GENERAR EMAIL PARA ASESOR
  // ═══════════════════════════════════════════════════════════════
  private generarEmailAsesor(expediente: any, lead: any, documentos: any[], asesor: AsessorBanco): string {
    const datos = expediente.datos_extraidos || {};
    
    return `
EXPEDIENTE HIPOTECARIO - LISTO PARA EVALUAR

═══════════════════════════════════════════════════

DATOS DEL SOLICITANTE:

Nombre: ${datos.nombre_completo || lead?.name}
CURP: ${datos.curp || 'Ver INE adjunta'}
Teléfono: ${lead?.phone}
Email: ${lead?.email || 'No proporcionado'}

═══════════════════════════════════════════════════

DATOS LABORALES:

Empresa: ${datos.empresa || 'Ver nóminas'}
Puesto: ${datos.puesto || 'No especificado'}
Ingreso mensual: $${(datos.ingreso_promedio || datos.sueldo_neto || 0).toLocaleString()}
Antigüedad: ${datos.antiguedad_estimada || 'Ver nóminas'}

═══════════════════════════════════════════════════

CRÉDITO SOLICITADO:

Tipo: ${datos.tipo_credito || 'Hipotecario'}
Monto aproximado: $${(expediente.monto_solicitado || 0).toLocaleString()}
Plazo deseado: ${expediente.plazo_deseado || '20'} años

${datos.puntos_infonavit ? `Puntos Infonavit: ${datos.puntos_infonavit}` : ''}
${datos.saldo_subcuenta ? `Saldo subcuenta: $${datos.saldo_subcuenta.toLocaleString()}` : ''}

═══════════════════════════════════════════════════

DOCUMENTOS ADJUNTOS:

${documentos?.map(d => `✅ ${d.tipo} ${d.subtipo ? `(${d.subtipo})` : ''}`).join('\n') || 'Ver adjuntos'}

═══════════════════════════════════════════════════

SOLICITUD FIRMADA: Sí
FECHA: ${new Date().toLocaleDateString('es-MX')}

═══════════════════════════════════════════════════

Por favor evalúa y responde a este correo con:
- APROBADO: Monto, tasa, CAT, plazo, mensualidad
- RECHAZADO: Motivo

Gracias.
    `;
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRAR RESPUESTA DEL BANCO
  // ═══════════════════════════════════════════════════════════════
  async registrarRespuestaBanco(
    solicitudId: string, 
    status: 'aprobado' | 'rechazado',
    datos?: {
      monto?: number;
      tasa?: number;
      cat?: number;
      plazo?: number;
      mensualidad?: number;
      razon_rechazo?: string;
    }
  ): Promise<void> {
    await this.supabase.from('solicitudes_banco').update({
      status,
      monto_aprobado: datos?.monto,
      tasa: datos?.tasa,
      cat: datos?.cat,
      plazo: datos?.plazo,
      mensualidad: datos?.mensualidad,
      razon_rechazo: datos?.razon_rechazo,
      fecha_respuesta: new Date().toISOString()
    }).eq('id', solicitudId);

    // Verificar si ya respondieron todos los bancos
    const { data: solicitud } = await this.supabase
      .from('solicitudes_banco')
      .select('*, expedientes_broker(*)')
      .eq('id', solicitudId)
      .single();

    if (solicitud) {
      await this.verificarYNotificarCliente(solicitud.expediente_id);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VERIFICAR RESPUESTAS Y NOTIFICAR CLIENTE
  // ═══════════════════════════════════════════════════════════════
  private async verificarYNotificarCliente(expedienteId: string): Promise<void> {
    // Obtener todas las solicitudes del expediente
    const { data: solicitudes } = await this.supabase
      .from('solicitudes_banco')
      .select('*, asesores_banco(*)')
      .eq('expediente_id', expedienteId);

    if (!solicitudes?.length) return;

    const pendientes = solicitudes.filter(s => s.status === 'enviado' || s.status === 'en_revision');
    const aprobadas = solicitudes.filter(s => s.status === 'aprobado');
    const rechazadas = solicitudes.filter(s => s.status === 'rechazado');

    // Si aún hay pendientes y no hay aprobados, esperar
    if (pendientes.length > 0 && aprobadas.length === 0) return;

    // Obtener datos del expediente y lead
    const { data: expediente } = await this.supabase
      .from('expedientes_broker')
      .select('*, leads(*)')
      .eq('id', expedienteId)
      .single();

    if (!expediente?.leads?.phone) return;

    // Generar mensaje según resultados
    let mensaje = '';

    if (aprobadas.length > 0) {
      // ¡Hay opciones!
      const mejorOpcion = this.encontrarMejorOpcion(aprobadas);
      
      mensaje = `🎉 ¡${expediente.leads.name.split(' ')[0]}, tengo buenas noticias!

Te aprobaron ${aprobadas.length} opción${aprobadas.length > 1 ? 'es' : ''}:

`;

      // Ordenar por conveniencia
      const ordenadas = aprobadas.sort((a, b) => (a.cat || 100) - (b.cat || 100));

      ordenadas.forEach((s, i) => {
        const emoji = i === 0 ? '🏆' : i === 1 ? '🥈' : '🥉';
        mensaje += `${emoji} ${s.banco}
   $${s.monto_aprobado?.toLocaleString()} a ${s.tasa}%
   Pagas $${s.mensualidad?.toLocaleString()}/mes

`;
      });

      if (ordenadas.length > 1) {
        mensaje += `💡 Te conviene ${mejorOpcion.banco} porque ${mejorOpcion.razon}

`;
      }

      mensaje += `El asesor te contacta hoy para cerrar.
¿A qué hora te queda bien? 📞`;

      // Actualizar expediente
      await this.supabase.from('expedientes_broker').update({
        status: 'aprobado',
        mejor_opcion: mejorOpcion.solicitudId
      }).eq('id', expedienteId);

    } else if (rechazadas.length === solicitudes.length) {
      // Todos rechazaron :(
      mensaje = `Hola ${expediente.leads.name.split(' ')[0]},

Los bancos no aprobaron tu solicitud en esta ocasión 😔

${rechazadas.map(s => `• ${s.banco}: ${s.razon_rechazo || 'Sin especificar'}`).join('\n')}

Pero no te preocupes, hay opciones:
• Mejorar tu historial crediticio
• Aumentar tu enganche
• Buscar un coacreditado

¿Quieres que te explique qué puedes hacer?`;

      await this.supabase.from('expedientes_broker').update({
        status: 'rechazado'
      }).eq('id', expedienteId);
    }

    if (mensaje) {
      await this.sendWhatsApp(expediente.leads.phone, mensaje);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ENCONTRAR MEJOR OPCIÓN
  // ═══════════════════════════════════════════════════════════════
  private encontrarMejorOpcion(aprobadas: any[]): { solicitudId: string; banco: string; razon: string } {
    if (aprobadas.length === 1) {
      return { 
        solicitudId: aprobadas[0].id, 
        banco: aprobadas[0].banco, 
        razon: 'es tu única opción aprobada' 
      };
    }

    // Ordenar por CAT (menor es mejor)
    const ordenadas = [...aprobadas].sort((a, b) => (a.cat || 100) - (b.cat || 100));
    const mejor = ordenadas[0];
    const segundo = ordenadas[1];

    // Calcular diferencia
    const diferenciaMensual = (segundo.mensualidad || 0) - (mejor.mensualidad || 0);
    const diferenciaTotal = diferenciaMensual * (mejor.plazo || 20) * 12;

    let razon = '';
    if (diferenciaMensual > 0) {
      razon = `pagas $${diferenciaMensual.toLocaleString()} menos al mes (ahorras $${diferenciaTotal.toLocaleString()} en total)`;
    } else {
      razon = `tiene mejor tasa (${mejor.tasa}% vs ${segundo.tasa}%)`;
    }

    return {
      solicitudId: mejor.id,
      banco: mejor.banco,
      razon
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // COMANDOS DEL ADMIN/ASESOR INTERNO
  // ═══════════════════════════════════════════════════════════════
  async procesarComandoAdmin(mensaje: string): Promise<string | null> {
    const msgLower = mensaje.toLowerCase().trim();

    // RESPUESTA [BANCO] [CLIENTE] [APROBADO/RECHAZADO] [DATOS]
    // Ejemplo: "respuesta bbva juan aprobado 650000 10.8 12.5 20 6890"
    const matchRespuesta = msgLower.match(/respuesta\s+(\w+)\s+(.+?)\s+(aprobado|rechazado)\s*(.*)/i);
    if (matchRespuesta) {
      return await this.procesarRespuestaManual(
        matchRespuesta[1], // banco
        matchRespuesta[2], // nombre cliente
        matchRespuesta[3] as 'aprobado' | 'rechazado',
        matchRespuesta[4]  // datos adicionales
      );
    }

    // STATUS [CLIENTE]
    const matchStatus = msgLower.match(/status\s+(.+)/i);
    if (matchStatus) {
      return await this.getStatusExpediente(matchStatus[1]);
    }

    // EXPEDIENTES PENDIENTES
    if (msgLower.includes('pendientes') || msgLower.includes('sin respuesta')) {
      return await this.getExpedientesPendientes();
    }

    // RECORDAR [BANCO]
    const matchRecordar = msgLower.match(/recordar\s+(\w+)/i);
    if (matchRecordar) {
      return await this.recordarAsesorBanco(matchRecordar[1]);
    }

    return null;
  }

  private async procesarRespuestaManual(
    banco: string, 
    nombreCliente: string, 
    status: 'aprobado' | 'rechazado',
    datosStr: string
  ): Promise<string> {
    // Buscar solicitud
    const { data: solicitudes } = await this.supabase
      .from('solicitudes_banco')
      .select('*, expedientes_broker(*, leads(*))')
      .ilike('banco', `%${banco}%`)
      .eq('status', 'enviado');

    const solicitud = solicitudes?.find(s => 
      s.expedientes_broker?.leads?.name?.toLowerCase().includes(nombreCliente.toLowerCase())
    );

    if (!solicitud) {
      return `No encontré solicitud de ${nombreCliente} en ${banco}`;
    }

    if (status === 'aprobado') {
      // Parsear datos: monto tasa cat plazo mensualidad
      const partes = datosStr.trim().split(/\s+/);
      await this.registrarRespuestaBanco(solicitud.id, 'aprobado', {
        monto: parseInt(partes[0]) || 0,
        tasa: parseFloat(partes[1]) || 0,
        cat: parseFloat(partes[2]) || 0,
        plazo: parseInt(partes[3]) || 20,
        mensualidad: parseInt(partes[4]) || 0
      });
      return `✅ Registrado: ${banco} aprobó a ${nombreCliente} por $${partes[0]}`;
    } else {
      await this.registrarRespuestaBanco(solicitud.id, 'rechazado', {
        razon_rechazo: datosStr || 'No especificada'
      });
      return `❌ Registrado: ${banco} rechazó a ${nombreCliente}`;
    }
  }

  private async getStatusExpediente(nombreCliente: string): Promise<string> {
    const { data: expedientes } = await this.supabase
      .from('expedientes_broker')
      .select('*, leads(*), solicitudes_banco(*, asesores_banco(*))')
      .eq('modo', 'automatico');

    const exp = expedientes?.find(e => 
      e.leads?.name?.toLowerCase().includes(nombreCliente.toLowerCase())
    );

    if (!exp) return `No encontré expediente de ${nombreCliente}`;

    let msg = `📋 ${exp.leads?.name}\n`;
    msg += `Status: ${exp.status}\n\n`;

    if (exp.solicitudes_banco?.length) {
      msg += `Bancos:\n`;
      exp.solicitudes_banco.forEach((s: any) => {
        const icon = s.status === 'aprobado' ? '✅' : s.status === 'rechazado' ? '❌' : '⏳';
        msg += `${icon} ${s.banco}: ${s.status}`;
        if (s.monto_aprobado) msg += ` $${s.monto_aprobado.toLocaleString()}`;
        msg += '\n';
      });
    }

    return msg;
  }

  private async getExpedientesPendientes(): Promise<string> {
    const { data: solicitudes } = await this.supabase
      .from('solicitudes_banco')
      .select('*, expedientes_broker(*, leads(*)), asesores_banco(*)')
      .eq('status', 'enviado')
      .order('fecha_envio', { ascending: true });

    if (!solicitudes?.length) return '✅ No hay expedientes pendientes de respuesta';

    let msg = `⏳ PENDIENTES DE RESPUESTA:\n\n`;
    
    solicitudes.forEach((s: any) => {
      const dias = Math.floor((Date.now() - new Date(s.fecha_envio).getTime()) / (1000 * 60 * 60 * 24));
      const alerta = dias >= 3 ? '⚠️' : '';
      
      msg += `${alerta} ${s.expedientes_broker?.leads?.name}\n`;
      msg += `   ${s.banco} - ${dias} días\n`;
      msg += `   Asesor: ${s.asesores_banco?.nombre}\n\n`;
    });

    return msg;
  }

  private async recordarAsesorBanco(banco: string): Promise<string> {
    const { data: solicitudes } = await this.supabase
      .from('solicitudes_banco')
      .select('*, expedientes_broker(*, leads(*)), asesores_banco(*)')
      .eq('status', 'enviado')
      .ilike('banco', `%${banco}%`);

    if (!solicitudes?.length) return `No hay expedientes pendientes en ${banco}`;

    for (const sol of solicitudes) {
      if (sol.asesores_banco?.telefono) {
        const dias = Math.floor((Date.now() - new Date(sol.fecha_envio).getTime()) / (1000 * 60 * 60 * 24));
        
        await this.sendWhatsApp(sol.asesores_banco.telefono, 
          `👋 Hola ${sol.asesores_banco.nombre},

¿Ya pudiste revisar el expediente de ${sol.expedientes_broker?.leads?.name}?

Lo mandé hace ${dias} días y el cliente está esperando respuesta.

Gracias 🙏`
        );
      }
    }

    return `✅ Recordatorio enviado a asesores de ${banco}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // SEGUIMIENTO AUTOMÁTICO (CRON)
  // ═══════════════════════════════════════════════════════════════
  async seguimientoAutomatico(): Promise<{ recordados: number; escalados: number }> {
    let recordados = 0;
    let escalados = 0;

    // Solicitudes sin respuesta hace 3+ días
    const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const hace5Dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const { data: solicitudes } = await this.supabase
      .from('solicitudes_banco')
      .select('*, expedientes_broker(*, leads(*)), asesores_banco(*)')
      .eq('status', 'enviado')
      .lt('fecha_envio', hace3Dias);

    for (const sol of solicitudes || []) {
      const fechaEnvio = new Date(sol.fecha_envio).getTime();
      const dias = Math.floor((Date.now() - fechaEnvio) / (1000 * 60 * 60 * 24));

      if (dias >= 5) {
        // Escalar - notificar a admin
        escalados++;
        await this.supabase.from('solicitudes_banco').update({
          status: 'sin_respuesta'
        }).eq('id', sol.id);
        
        // Bajar calificación del asesor
        if (sol.asesores_banco?.id) {
          await this.supabase.rpc('decrementar_calificacion_asesor', {
            asesor_id: sol.asesores_banco.id
          });
        }
      } else if (dias >= 3 && !sol.recordatorio_enviado) {
        // Enviar recordatorio
        if (sol.asesores_banco?.telefono) {
          await this.sendWhatsApp(sol.asesores_banco.telefono,
            `⏰ Recordatorio: Expediente de ${sol.expedientes_broker?.leads?.name} pendiente desde hace ${dias} días.`
          );
          
          await this.supabase.from('solicitudes_banco').update({
            recordatorio_enviado: true
          }).eq('id', sol.id);
          
          recordados++;
        }
      }
    }

    return { recordados, escalados };
  }

  // ═══════════════════════════════════════════════════════════════
  // MANEJAR DISPONIBILIDAD DE DOCUMENTOS
  // ═══════════════════════════════════════════════════════════════
  async procesarDisponibilidadDocs(leadId: string, mensaje: string): Promise<{ tiene: boolean; respuesta: string }> {
    const msgLower = mensaje.toLowerCase();
    
    // ¿Tiene los papeles?
    const tienePapeles = msgLower.includes('sí') || msgLower.includes('si ') || 
                         msgLower.includes('los tengo') || msgLower.includes('ya los tengo') ||
                         msgLower.includes('ahorita') || msgLower.includes('aquí') ||
                         msgLower.includes('ahi te van') || msgLower.includes('ahí te van') ||
                         msgLower.includes('tengo todo') || msgLower.includes('a la mano');
    
    if (tienePapeles) {
      await this.supabase.from('expedientes_broker').update({
        status: 'recopilando_docs'
      }).eq('lead_id', leadId);
      
      return {
        tiene: true,
        respuesta: `¡Perfecto! 

Mándame primero tu INE 
(foto de los dos lados) 📸

No te preocupes si no sale perfecta,
solo que se vea bien la información.`
      };
    }
    
    // No tiene papeles
    const noTiene = msgLower.includes('no') || msgLower.includes('necesito') ||
                    msgLower.includes('tiempo') || msgLower.includes('después') ||
                    msgLower.includes('luego') || msgLower.includes('ahorita no') ||
                    msgLower.includes('todavía') || msgLower.includes('todavia');
    
    if (noTiene) {
      await this.supabase.from('expedientes_broker').update({
        status: 'esperando_docs'
      }).eq('lead_id', leadId);
      
      return {
        tiene: false,
        respuesta: `No hay problema, sin prisa 👍

Lo que voy a necesitar es:
📸 Tu INE (los dos lados)
📸 Tus recibos de nómina (3 meses)
📸 Un recibo de luz o agua

¿Cuánto tiempo necesitas para 
juntarlos? ¿Un par de días?`
      };
    }
    
    // No entendió
    return {
      tiene: false,
      respuesta: `¿Tienes los documentos a la mano 
o necesitas unos días para juntarlos?`
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // AGENDAR SEGUIMIENTO PARA DOCUMENTOS
  // ═══════════════════════════════════════════════════════════════
  async agendarSeguimientoDocs(leadId: string, mensaje: string): Promise<string> {
    const msgLower = mensaje.toLowerCase();
    
    // Detectar tiempo
    let diasSeguimiento = 2; // default
    let fechaTexto = '';
    
    // Días específicos de la semana
    const diasSemana: Record<string, string> = {
      'mañana': 'mañana',
      'manana': 'mañana',
      'pasado': 'pasado mañana',
      'lunes': 'el lunes',
      'martes': 'el martes',
      'miércoles': 'el miércoles',
      'miercoles': 'el miércoles',
      'jueves': 'el jueves',
      'viernes': 'el viernes',
      'sábado': 'el sábado',
      'sabado': 'el sábado',
      'domingo': 'el domingo',
      'semana': 'en una semana',
      'fin de semana': 'el fin de semana'
    };

    for (const [key, value] of Object.entries(diasSemana)) {
      if (msgLower.includes(key)) {
        fechaTexto = value;
        diasSeguimiento = this.calcularDiasHasta(key);
        break;
      }
    }
    
    // Números específicos: "2 días", "3 dias"
    const matchDias = msgLower.match(/(\d+)\s*(día|dias|días)/);
    if (matchDias) {
      diasSeguimiento = parseInt(matchDias[1]);
      fechaTexto = `en ${diasSeguimiento} día${diasSeguimiento > 1 ? 's' : ''}`;
    }
    
    // Si no detectó nada específico
    if (!fechaTexto) {
      diasSeguimiento = 2;
      fechaTexto = 'en un par de días';
    }
    
    // Calcular fecha
    const fechaSeguimiento = new Date();
    fechaSeguimiento.setDate(fechaSeguimiento.getDate() + diasSeguimiento);
    fechaSeguimiento.setHours(10, 0, 0, 0); // 10am
    
    // Guardar en expediente
    await this.supabase.from('expedientes_broker').update({
      status: 'esperando_docs',
      fecha_seguimiento_docs: fechaSeguimiento.toISOString()
    }).eq('lead_id', leadId);
    
    // Crear scheduled_followup para el CRON
    const { data: expediente } = await this.supabase
      .from('expedientes_broker')
      .select('id')
      .eq('lead_id', leadId)
      .single();
      
    if (expediente) {
      await this.supabase.from('scheduled_followups').insert({
        lead_id: leadId,
        tipo: 'broker_docs',
        scheduled_for: fechaSeguimiento.toISOString(),
        mensaje: 'seguimiento_docs_broker',
        metadata: { expediente_id: expediente.id }
      });
    }
    
    return `Muy bien, te escribo ${fechaTexto} 📅

Si tienes alguna duda antes, 
aquí estoy para ayudarte.

¡Éxito! 💪`;
  }

  private calcularDiasHasta(referencia: string): number {
    const diasSemana: Record<string, number> = {
      'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
    };
    
    if (referencia === 'mañana' || referencia === 'manana') return 1;
    if (referencia === 'pasado') return 2;
    if (referencia === 'semana') return 7;
    if (referencia === 'fin de semana') {
      const hoy = new Date().getDay();
      return hoy <= 5 ? (6 - hoy) : 1;
    }
    
    const objetivo = diasSemana[referencia.toLowerCase()];
    if (objetivo !== undefined) {
      const hoy = new Date().getDay();
      let diff = objetivo - hoy;
      if (diff <= 0) diff += 7;
      return diff;
    }
    
    return 2; // default
  }

  // ═══════════════════════════════════════════════════════════════
  // CRON - SEGUIMIENTO DE DOCUMENTOS PENDIENTES
  // ═══════════════════════════════════════════════════════════════
  async seguimientoDocsPendientes(): Promise<number> {
    const ahora = new Date().toISOString();
    
    // Buscar seguimientos programados que ya tocaron
    const { data: seguimientos } = await this.supabase
      .from('scheduled_followups')
      .select('*, leads(*)')
      .eq('tipo', 'broker_docs')
      .eq('sent', false)
      .lte('scheduled_for', ahora);
    
    let enviados = 0;
    
    for (const seg of seguimientos || []) {
      if (seg.leads?.phone) {
        const nombre = seg.leads.name?.split(' ')[0] || '';
        
        await this.sendWhatsApp(seg.leads.phone, 
`¡Hola ${nombre}! 👋

¿Ya pudiste juntar tus documentos?

Aquí estoy para recibirlos cuando gustes 📸`
        );
        
        // Marcar como enviado
        await this.supabase.from('scheduled_followups').update({
          sent: true,
          sent_at: ahora
        }).eq('id', seg.id);
        
        enviados++;
      }
    }
    
    return enviados;
  }

  // ═══════════════════════════════════════════════════════════════
  // SEGUIMIENTO SI NO RESPONDE DESPUÉS DEL RECORDATORIO
  // ═══════════════════════════════════════════════════════════════
  async seguimientoSinRespuesta(): Promise<number> {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Buscar expedientes que se les mandó seguimiento pero no respondieron
    const { data: expedientes } = await this.supabase
      .from('expedientes_broker')
      .select('*, leads(*)')
      .eq('status', 'esperando_docs')
      .lt('updated_at', hace24h);
    
    let enviados = 0;
    
    for (const exp of expedientes || []) {
      // Verificar que no se le haya mandado ya un segundo recordatorio
      const { data: followups } = await this.supabase
        .from('scheduled_followups')
        .select('*')
        .eq('lead_id', exp.lead_id)
        .eq('tipo', 'broker_docs_segundo')
        .limit(1);
      
      if (!followups?.length && exp.leads?.phone) {
        const nombre = exp.leads.name?.split(' ')[0] || '';
        
        await this.sendWhatsApp(exp.leads.phone,
`Hola ${nombre}, ¿todo bien? 

¿Necesitas más tiempo para juntar 
tus documentos o te puedo ayudar 
con algo?`
        );
        
        // Marcar segundo seguimiento
        await this.supabase.from('scheduled_followups').insert({
          lead_id: exp.lead_id,
          tipo: 'broker_docs_segundo',
          scheduled_for: new Date().toISOString(),
          sent: true,
          sent_at: new Date().toISOString()
        });
        
        enviados++;
      }
    }
    
    return enviados;
  }

  // ═══════════════════════════════════════════════════════════════
  // MANEJAR CUANDO CLIENTE YA NO QUIERE CONTINUAR
  // ═══════════════════════════════════════════════════════════════
  async procesarCancelacion(leadId: string): Promise<string> {
    await this.supabase.from('expedientes_broker').update({
      status: 'cancelado'
    }).eq('lead_id', leadId);
    
    await this.supabase.from('leads').update({
      broker_mode: null,
      broker_stage: null
    }).eq('id', leadId);
    
    return `Entendido, sin problema.

Si más adelante te interesa, 
aquí estoy para ayudarte 🏠`;
  }
}
