import { SupabaseService } from '../services/supabase';
import { OpenAIService } from '../services/openai';
import { TwilioService } from '../services/twilio';
import { FollowupService } from '../services/followupService';
import { BrokerHipotecarioService } from '../services/brokerHipotecarioService';

const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

interface AIAnalysis {
  intent: string;
  extracted_data: {
    nombre?: string;
    fecha?: string;
    hora?: string;
    desarrollo?: string;
    desarrollos?: string[];  // Múltiples desarrollos
    modelos?: string[];      // Modelos/casas específicas
    num_recamaras?: number;
    necesita_credito?: boolean;
    // CAMPOS DE CRÉDITO - OpenAI extrae aunque tenga typos
    banco_preferido?: string;      // "Scotiabank" aunque escriba "soctia"
    ingreso_mensual?: number;      // 67000 aunque escriba "67 mil"
    enganche_disponible?: number;  // 234000 aunque escriba "234m1l"
    modalidad_contacto?: string;   // "telefonica"|"videollamada"|"presencial"
    quiere_asesor?: boolean;       // true si dice "sí", "va", "sale", etc
  };
  response: string;
  send_gps?: boolean;
  send_video_desarrollo?: boolean;
  send_contactos?: boolean;
  contactar_vendedor?: boolean;
}

// ═══════════════════════════════════════════════════════════
// CLASE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export class WhatsAppHandler {
  private brokerService: BrokerHipotecarioService;
  
  // Normaliza telefono mexicano a formato Twilio: +521XXXXXXXXXX
  private formatPhoneMX(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return 'whatsapp:+521' + digits;
    } else if (digits.length === 12 && digits.startsWith('52')) {
      return 'whatsapp:+521' + digits.slice(2);
    } else if (digits.length === 13 && digits.startsWith('521')) {
      return 'whatsapp:+' + digits;
    } else {
      return 'whatsapp:+521' + digits.slice(-10);
    }
  }


  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService,
    private twilio: TwilioService,
    private calendar: any
  ) {
    // Inicializar broker hipotecario
    this.brokerService = new BrokerHipotecarioService(
      supabase.client,
      openai.apiKey || process.env.OPENAI_API_KEY || '',
      async (to: string, message: string) => {
        await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(to), message);
      }
    );
  }

  // ═══════════════════════════════════════════════════════════
  // LISTAS DE DESARROLLOS Y MODELOS CONOCIDOS
  // ═══════════════════════════════════════════════════════════
  
  private readonly DESARROLLOS_CONOCIDOS = [
    'Monte Verde', 'Monte Real', 'Los Encinos', 'Miravalle', 'Andes', 'Distrito Falco'
  ];
  
  private readonly MODELOS_CONOCIDOS = [
    // Los Encinos
    'Ascendente', 'Descendente', 'Encino Blanco', 'Encino Verde', 'Encino Dorado',
    // Andes
    'Gardenia', 'Dalia', 'Lavanda', 'Azalea', 'Magnolia',
    // Distrito Falco
    'Calandria', 'Colibrí', 'Colibri', 'Chipre', 'Mirlo',
    // Monte Verde
    'Pino', 'Roble', 'Cedro',
    // Monte Real
    'Real I', 'Real II', 'Real III',
    // Miravalle
    'Bilbao', 'Vizcaya', 'Navarra'
  ];

  // ═══════════════════════════════════════════════════════════
  // PARSEAR MÚLTIPLES DESARROLLOS Y MODELOS
  // ═══════════════════════════════════════════════════════════

  private parsearDesarrollosYModelos(texto: string): { desarrollos: string[], modelos: string[] } {
    const textoLower = texto.toLowerCase();
    const desarrollos: string[] = [];
    const modelos: string[] = [];
    
    // Buscar desarrollos mencionados
    for (const dev of this.DESARROLLOS_CONOCIDOS) {
      if (textoLower.includes(dev.toLowerCase())) {
        desarrollos.push(dev);
      }
    }
    
    // Buscar modelos/casas específicas mencionadas
    for (const modelo of this.MODELOS_CONOCIDOS) {
      if (textoLower.includes(modelo.toLowerCase())) {
        modelos.push(modelo);
      }
    }
    
    return { desarrollos, modelos };
  }

  // Obtener propiedades para múltiples desarrollos
  private getPropsParaDesarrollos(desarrollos: string[], properties: any[]): any[] {
    const props: any[] = [];
    const seen = new Set<string>();
    
    for (const dev of desarrollos) {
      const propsDelDesarrollo = properties.filter(p => 
        p.development?.toLowerCase().includes(dev.toLowerCase())
      );
      for (const prop of propsDelDesarrollo) {
        if (!seen.has(prop.id)) {
          seen.add(prop.id);
          props.push(prop);
        }
      }
    }
    return props;
  }

  // Obtener propiedades para modelos específicos
  private getPropsParaModelos(modelos: string[], properties: any[]): any[] {
    const props: any[] = [];
    const seen = new Set<string>();
    
    for (const modelo of modelos) {
      const propDelModelo = properties.find(p => 
        p.model?.toLowerCase().includes(modelo.toLowerCase()) ||
        p.name?.toLowerCase().includes(modelo.toLowerCase())
      );
      if (propDelModelo && !seen.has(propDelModelo.id)) {
        seen.add(propDelModelo.id);
        props.push(propDelModelo);
      }
    }
    return props;
  }

  // ═══════════════════════════════════════════════════════════
  // MÉTODO PRINCIPAL
  // ═══════════════════════════════════════════════════════════

  async handleIncomingMessage(from: string, body: string, env?: any, rawRequest?: any): Promise<void> {
    try {
      const trimmedBody = (body || '').trim();
      
      // Filtrar status callbacks de Twilio
      if (rawRequest?.SmsStatus || rawRequest?.MessageStatus || rawRequest?.EventType) {
        console.log('⏭ï¸ Ignorando status callback');
        return;
      }
      
      // Filtrar mensajes vacíos o status
      const ignoredMessages = ['OK', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'QUEUED'];
      if (!trimmedBody || ignoredMessages.includes(trimmedBody.toUpperCase())) {
        console.log('⏭ï¸ Ignorando:', trimmedBody);
        return;
      }

      console.log('📱 Mensaje de:', from, '-', body);
      const cleanPhone = from.replace('whatsapp:', '').replace('+', '');

      // Obtener datos
      const [lead, properties, teamMembers] = await Promise.all([
        this.getOrCreateLead(cleanPhone),
        this.getAllProperties(),
        this.getAllTeamMembers()
      ]);

      // ═══════════════════════════════════════════════════════════
      // DETECTAR SI ES VENDEDOR/ASESOR
      // ═══════════════════════════════════════════════════════════
      const vendedor = teamMembers.find((tm: any) => {
        if (!tm.phone) return false;
        const tmPhone = tm.phone.replace(/\D/g, '').slice(-10);
        const msgPhone = cleanPhone.replace(/\D/g, '').slice(-10);
        return tmPhone === msgPhone;
      });

      if (vendedor) {
        // Detectar rol específico
        const rol = vendedor.role?.toLowerCase() || 'vendedor';
        
        // CEO / Admin / Director / Gerente
        if (rol.includes('ceo') || rol.includes('admin') || rol.includes('director') || rol.includes('gerente') || rol.includes('dueño') || rol.includes('owner')) {
          console.log('👔 MODO CEO/ADMIN detectado:', vendedor.name);
          await this.handleCEOMessage(from, body, vendedor, teamMembers);
          return;
        }
        
        if (rol.includes('asesor') || rol.includes('hipoteca') || rol.includes('credito')) {
          console.log('🏦 MODO ASESOR HIPOTECARIO detectado:', vendedor.name);
          await this.handleAsesorMessage(from, body, vendedor, teamMembers);
          return;
        }
        
        // Agencia / Marketing / Coordinador Marketing
        if (rol.includes('agencia') || rol.includes('marketing') || rol.includes('mkt')) {
          console.log('📣 MODO AGENCIA detectado:', vendedor.name);
          await this.handleAgenciaMessage(from, body, vendedor, teamMembers);
          return;
        }

        console.log('👔 MODO VENDEDOR detectado:', vendedor.name);
        await this.handleVendedorMessage(from, body, vendedor, teamMembers);
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // BROKER HIPOTECARIO - NUEVO FLUJO A/B
      // ═══════════════════════════════════════════════════════════
      
      // Verificar si el lead está en flujo de broker
      if (lead.broker_stage) {
        console.log('🏦 BROKER: Lead en stage:', lead.broker_stage);
        
        // PROCESAR ELECCIÓN A/B
        if (lead.broker_stage === 'esperando_eleccion') {
          const resultado = await this.brokerService.procesarEleccion(lead.id, body);
          
          if (resultado.modo) {
            await this.twilio.sendWhatsAppMessage(from, resultado.respuesta);
            
            if (resultado.modo === 'auto') {
              await this.supabase.client.from('leads').update({
                broker_stage: 'preguntando_disponibilidad'
              }).eq('id', lead.id);
            } else if (resultado.modo === 'asesor') {
              await this.supabase.client.from('leads').update({
                broker_mode: 'asesor_directo',
                broker_stage: 'seleccionando_banco'
              }).eq('id', lead.id);
            }
            return;
          }
        }
        
        // PREGUNTAR SI TIENE DOCUMENTOS A LA MANO
        if (lead.broker_stage === 'preguntando_disponibilidad') {
          const resultado = await this.brokerService.procesarDisponibilidadDocs(lead.id, body);
          await this.twilio.sendWhatsAppMessage(from, resultado.respuesta);
          
          if (resultado.tiene) {
            await this.supabase.client.from('leads').update({
              broker_stage: 'recopilando_docs'
            }).eq('id', lead.id);
          } else {
            await this.supabase.client.from('leads').update({
              broker_stage: 'agendando_seguimiento'
            }).eq('id', lead.id);
          }
          return;
        }
        
        // AGENDAR SEGUIMIENTO PARA DOCUMENTOS
        if (lead.broker_stage === 'agendando_seguimiento') {
          const respuesta = await this.brokerService.agendarSeguimientoDocs(lead.id, body);
          await this.twilio.sendWhatsAppMessage(from, respuesta);
          
          await this.supabase.client.from('leads').update({
            broker_stage: 'esperando_docs'
          }).eq('id', lead.id);
          return;
        }
        
        // SELECCIONAR BANCO (Opción B)
        if (lead.broker_stage === 'seleccionando_banco') {
          const resultado = await this.brokerService.procesarSeleccionBanco(lead.id, body);
          await this.twilio.sendWhatsAppMessage(from, resultado.respuesta);
          
          if (resultado.bancoSeleccionado) {
            await this.supabase.client.from('leads').update({
              broker_stage: 'conectando_asesor',
              banco_preferido: resultado.bancoSeleccionado
            }).eq('id', lead.id);
          }
          return;
        }
        
        // RECOPILANDO DOCUMENTOS
        if (lead.broker_stage === 'recopilando_docs' || lead.broker_stage === 'esperando_docs') {
          // Si manda imagen/documento, procesarlo
          if (rawRequest?.MediaUrl0 || rawRequest?.mediaUrl) {
            const mediaUrl = rawRequest?.MediaUrl0 || rawRequest?.mediaUrl;
            const resultado = await this.brokerService.procesarDocumento(lead.id, mediaUrl);
            await this.twilio.sendWhatsAppMessage(from, resultado.respuesta);
            
            if (resultado.todosCompletos) {
              await this.supabase.client.from('leads').update({
                broker_stage: 'pendiente_firma'
              }).eq('id', lead.id);
            }
            return;
          }
          
          // Si dice que ya no quiere
          const msgLower = body.toLowerCase();
          if (msgLower.includes('ya no') || msgLower.includes('cancelar') || msgLower.includes('no quiero')) {
            const respuesta = await this.brokerService.procesarCancelacion(lead.id);
            await this.twilio.sendWhatsAppMessage(from, respuesta);
            return;
          }
        }
      }

      // Si el lead está en encuesta, manejar encuesta
      if (lead.survey_step > 0) {
        console.log('📋 Lead en encuesta, step:', lead.survey_step);
        await this.handleSurveyResponse(from, body, lead);
        return;
      }

      // REFERIDO desde cliente: "Referido Juan 5512345678"
      const refClientMatch = body.match(/^r[eéi]f[eéi]r[ií]?do\s+([a-zA-ZáéíóúñÍÉÍÓÚÑ\s]+)\s+(\d{10,})/i);
      if (refClientMatch && lead.status === 'delivered') {
        const nombreRef = refClientMatch[1].trim();
        const telRef = refClientMatch[2].replace(/\D/g, '').slice(-10);
        
        // Crear lead referido
        await this.supabase.client.from('leads').insert({
          name: nombreRef,
          phone: '521' + telRef,
          source: 'referido',
          referrer_id: lead.id,
          assigned_to: lead.assigned_to,
          status: 'new',
          score: 80,
          notes: { referido_por: lead.name, fecha_referido: new Date().toISOString() }
        });
        
        // Notificar al vendedor
        if (lead.assigned_to) {
          const { data: vendedorData } = await this.supabase.client
            .from('team_members')
            .select('phone, name')
            .eq('id', lead.assigned_to)
            .single();
          if (vendedorData?.phone) {
            await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(vendedorData.phone),
              '🎁 *REFERIDO NUEVO*\n\n' +
              'Tu cliente *' + (lead.name || 'Cliente') + '* te refirio a:\n' +
              '👤 ' + nombreRef + '\n' +
              '📱 ' + telRef + '\n\n' +
              'Contactalo pronto.');
          }
        }
        
        // Confirmar al cliente
        await this.twilio.sendWhatsAppMessage(from,
          '🎉 *Gracias por tu referido!*\n\n' +
          'Ya registramos a *' + nombreRef + '* y tu asesor lo contactara pronto.\n\n' +
          'Cuando compre, recibiras tus beneficios del Programa Embajador. 🎁');
        
        // Mensaje al referido
        await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(telRef),
          '👋 Hola *' + nombreRef.split(' ')[0] + '*!\n\n' +
          'Tu amigo *' + (lead.name?.split(' ')[0] || '') + '* te recomendo con Grupo Santa Rita para ayudarte a encontrar tu casa ideal. 🏠\n\n' +
          'Pronto te contactara uno de nuestros asesores.\n\n' +
          'Responde *SI* si quieres ver opciones de casas.');
        
        console.log('🎁 Referido registrado:', nombreRef, telRef);
        return;
      }

      // Analizar con IA
      const analysis = await this.analyzeWithAI(body, lead, properties);
      console.log('🧠 AI Analysis:', JSON.stringify(analysis, null, 2));

      // Si la IA detectó nombre y el lead no lo tenía, actualizar en memoria Y en DB
      if (analysis.extracted_data?.nombre && !lead.name) {
        lead.name = analysis.extracted_data.nombre;
        console.log('✅ Nombre actualizado en memoria:', lead.name);
        
        // GUARDAR EN DB TAMBIÉN
        await this.supabase.client
          .from('leads')
          .update({ name: lead.name })
          .eq('id', lead.id);
        console.log('✅ Nombre guardado en DB:', lead.name);
      }

      // Ejecutar
      await this.executeAIDecision(analysis, from, cleanPhone, lead, properties, teamMembers, body, env);

    } catch (error) {
      console.error('❌ Error:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje? 🙏');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MODO ASISTENTE VENDEDOR
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // ENCUESTA DE SATISFACCIÓN
  // ═══════════════════════════════════════════════════════════
  
  private async handleSurveyResponse(from: string, body: string, lead: any): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const step = lead.survey_step;
    const isDelivered = lead.status === 'delivered';
    
    // DELIVERED: Steps 1-6
    // FALLEN: Steps 10-15
    
    // Step 1 o 10: Espera "SÍ" para comenzar
    if (step === 1 || step === 10) {
      if (mensaje.includes('si') || mensaje.includes('sí') || mensaje === 'ok' || mensaje === 'dale') {
        const nextStep = isDelivered ? 2 : 11;
        const pregunta = isDelivered 
          ? '¡Gracias! 🙌\n\n*Pregunta 1 de 5*\n¿Cuándo es tu cumpleaños?\n(ej: 15 marzo)'
          : '¡Gracias por tu tiempo! 🙏\n\n*Pregunta 1 de 5*\n¿Qué fue lo que no te convenció?';
        
        await this.supabase.client.from('leads').update({ survey_step: nextStep }).eq('id', lead.id);
        await this.twilio.sendWhatsAppMessage(from, pregunta);
      } else {
        await this.twilio.sendWhatsAppMessage(from, 'Responde *SÍ* cuando estés listo para continuar 🙏');
      }
      return;
    }
    
    // DELIVERED Step 2: Cumpleaños
    if (step === 2) {
      const fechaMatch = body.match(/(\d{1,2})\s*(de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{1,2})/i);
      let birthday = null;
      if (fechaMatch) {
        const dia = fechaMatch[1].padStart(2, '0');
        const mesTexto = fechaMatch[3].toLowerCase();
        const meses: Record<string, string> = { enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06', julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12' };
        const mes = meses[mesTexto] || mesTexto.padStart(2, '0');
        birthday = '2000-' + mes + '-' + dia;
      }
      await this.supabase.client.from('leads').update({ birthday, survey_step: 3 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '*Pregunta 2 de 5*\n¿Cuál es tu email?');
      return;
    }
    
    // DELIVERED Step 3: Email
    if (step === 3) {
      const emailMatch = body.match(/([^\s]+@[^\s]+\.[^\s]+)/i);
      const email = emailMatch ? emailMatch[1].toLowerCase() : null;
      await this.supabase.client.from('leads').update({ email, survey_step: 4 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '*Pregunta 3 de 5*\nDel 1 al 10, ¿cómo calificarías tu experiencia con nosotros?');
      return;
    }
    
    // DELIVERED Step 4: Rating
    if (step === 4) {
      const rating = parseInt(body.match(/\d+/)?.[0] || '0');
      await this.supabase.client.from('leads').update({ survey_rating: rating || null, survey_step: 5 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '*Pregunta 4 de 5*\n¿Qué fue lo que más te gustó del proceso?');
      return;
    }
    
    // DELIVERED Step 5: Feedback
    if (step === 5) {
      await this.supabase.client.from('leads').update({ survey_feedback: body, survey_step: 6 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, 
        '*Pregunta 5 de 5*\n🎁 *Programa Embajador*\n\n' +
        'Si recomiendas a alguien y compra, recibirás regalos, promociones y beneficios exclusivos.\n\n' +
        '¿Conoces a alguien buscando casa?\n' +
        'Comparte: *Nombre y Teléfono*\n\n' +
        'Si no conoces a nadie, responde *No*');
      return;
    }
    
    // DELIVERED Step 6: Referido
    if (step === 6) {
      if (!mensaje.includes('no')) {
        const refMatch = body.match(/([a-zA-ZáéíóúñÍÉÍÓÚÑ\s]+)\s+(\d{10})/);
        if (refMatch) {
          const nombreRef = refMatch[1].trim();
          const telRef = refMatch[2];
          await this.supabase.client.from('leads').insert({
            name: nombreRef,
            phone: '52' + telRef.slice(-10),
            source: 'referido',
            referrer_id: lead.id,
            assigned_to: lead.assigned_to,
            status: 'new',
            score: 80,
            notes: { referido_por: lead.name, fecha_referido: new Date().toISOString() }
          });
          await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(telRef),
            '👋 ¡Hola *' + nombreRef.split(' ')[0] + '*!\n\n' +
            'Tu amigo *' + (lead.name?.split(' ')[0] || '') + '* te recomendó con nosotros para ayudarte a encontrar tu casa ideal. 🏠\n\n' +
            'Tenemos opciones increíbles para ti.\n\n' +
            'Pronto te contactará uno de nuestros asesores. ¿Mientras tanto, te gustaría ver información de nuestras propiedades?\n\n' +
            'Responde *SÍ* para conocer más.');
        }
      }
      await this.supabase.client.from('leads').update({ survey_completed: true, survey_step: 0 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, 
        '🙏 *¡Muchas gracias ' + (lead.name?.split(' ')[0] || '') + '!*\n\n' +
        'Tu opinión es muy valiosa para nosotros.\n\n' +
        '🎁 *Programa Embajador*\n' +
        'Cuando conozcas a alguien buscando casa, mandanos:\n' +
        '*Referido Nombre Telefono*\n\n' +
        'Ejemplo: _Referido Juan 5512345678_\n\n' +
        'Y participas por premios automaticamente.\n\n' +
        'Disfruta tu nuevo hogar. 🏠❤ï¸');
      return;
    }
    
    // FALLEN Step 11: Qué no convenció
    if (step === 11) {
      await this.supabase.client.from('leads').update({ 
        survey_feedback: body, 
        survey_step: 12,
        notes: { ...(lead.notes || {}), no_convencio: body }
      }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '*Pregunta 2 de 5*\n¿Hay algo que podríamos haber hecho diferente?');
      return;
    }
    
    // FALLEN Step 12: Qué mejorar
    if (step === 12) {
      await this.supabase.client.from('leads').update({ 
        survey_step: 13,
        notes: { ...(lead.notes || {}), que_mejorar: body }
      }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '*Pregunta 3 de 5*\nDel 1 al 10, ¿cómo calificarías la atención recibida?');
      return;
    }
    
    // FALLEN Step 13: Rating
    if (step === 13) {
      const rating = parseInt(body.match(/\d+/)?.[0] || '0');
      await this.supabase.client.from('leads').update({ survey_rating: rating || null, survey_step: 14 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '*Pregunta 4 de 5*\n¿Cuándo es tu cumpleaños?\nPor si en el futuro hay algo especial para ti 🎁\n(ej: 15 marzo)');
      return;
    }
    
    // FALLEN Step 14: Cumpleaños
    if (step === 14) {
      const fechaMatch = body.match(/(\d{1,2})\s*(de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{1,2})/i);
      let birthday = null;
      if (fechaMatch) {
        const dia = fechaMatch[1].padStart(2, '0');
        const mesTexto = fechaMatch[3].toLowerCase();
        const meses: Record<string, string> = { enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06', julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12' };
        const mes = meses[mesTexto] || mesTexto.padStart(2, '0');
        birthday = '2000-' + mes + '-' + dia;
      }
      await this.supabase.client.from('leads').update({ birthday, survey_step: 15 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, 
        '*Pregunta 5 de 5*\n🎁 *Programa Embajador*\n\n' +
        'Aunque no compraste, puedes ganar. Si recomiendas a alguien y compra, recibirás regalos, promociones y beneficios exclusivos.\n\n' +
        '¿Conoces a alguien buscando casa?\n' +
        'Comparte: *Nombre y Teléfono*\n\n' +
        'Si no conoces a nadie, responde *No*');
      return;
    }
    
    // FALLEN Step 15: Referido
    if (step === 15) {
      if (!mensaje.includes('no')) {
        const refMatch = body.match(/([a-zA-ZáéíóúñÍÉÍÓÚÑ\s]+)\s+(\d{10})/);
        if (refMatch) {
          const nombreRef = refMatch[1].trim();
          const telRef = refMatch[2];
          await this.supabase.client.from('leads').insert({
            name: nombreRef,
            phone: '52' + telRef.slice(-10),
            source: 'referido',
            referrer_id: lead.id,
            assigned_to: lead.assigned_to,
            status: 'new',
            score: 80,
            notes: { referido_por: lead.name, fecha_referido: new Date().toISOString() }
          });
          await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(telRef),
            '👋 ¡Hola *' + nombreRef.split(' ')[0] + '*!\n\n' +
            'Tu amigo *' + (lead.name?.split(' ')[0] || '') + '* te recomendó con nosotros para ayudarte a encontrar tu casa ideal. 🏠\n\n' +
            'Tenemos opciones increíbles para ti.\n\n' +
            'Pronto te contactará uno de nuestros asesores.');
        }
      }
      await this.supabase.client.from('leads').update({ survey_completed: true, survey_step: 0 }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, 
        '🙏 *¡Gracias ' + (lead.name?.split(' ')[0] || '') + '!*\n\n' +
        'Apreciamos mucho tu tiempo y retroalimentación.\n\n' +
        'Si en el futuro buscas una casa, aquí estaremos para ti. 🏠');
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HANDLER CEO / ADMIN / DIRECTOR
  // ═══════════════════════════════════════════════════════════════
  private async handleCEOMessage(from: string, body: string, ceo: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreCEO = ceo.name?.split(' ')[0] || 'Jefe';

    console.log('CEO Command:', mensaje);

    // Comando: AYUDA / COMANDOS
    if (mensaje === 'ayuda' || mensaje === 'comandos' || mensaje === 'help' || mensaje === '?') {
      await this.twilio.sendWhatsAppMessage(from,
        '*Comandos CEO - ' + nombreCEO + '*\n\n' +
        '*Reportes:*\n' +
        '- *resumen* - Resumen ejecutivo del dia\n' +
        '- *pipeline* - Valor del pipeline actual\n' +
        '- *cierres* - Cierres del mes\n' +
        '- *proyeccion* - Proyeccion vs meta\n\n' +
        '*Equipo:*\n' +
        '- *ranking* - Top vendedores\n' +
        '- *equipo* - Estado del equipo\n\n' +
        '*Alertas:*\n' +
        '- *alertas* - Leads estancados\n' +
        '- *hot* - Leads HOT activos\n\n' +
        '*Marketing:*\n' +
        '- *roi* - ROI por canal\n' +
        '- *fuentes* - Leads por fuente'
      );
      return;
    }

    // Comando: RESUMEN / RESUMEN DEL DÍA
    if (mensaje === 'resumen' || mensaje.includes('resumen del dia') || mensaje === 'reporte') {
      await this.enviarResumenCEO(from, nombreCEO);
      return;
    }

    // Comando: PIPELINE
    if (mensaje === 'pipeline' || mensaje.includes('valor pipeline') || mensaje === 'funnel') {
      await this.enviarPipelineCEO(from, nombreCEO);
      return;
    }

    // Comando: RANKING / TOP VENDEDORES
    if (mensaje === 'ranking' || mensaje.includes('top vendedor') || mensaje === 'vendedores' || mensaje === 'leaderboard') {
      await this.enviarRankingCEO(from, nombreCEO, teamMembers);
      return;
    }

    // Comando: CIERRES
    if (mensaje === 'cierres' || mensaje.includes('ventas del mes') || mensaje === 'ventas') {
      await this.enviarCierresCEO(from, nombreCEO);
      return;
    }

    // Comando: ALERTAS
    if (mensaje === 'alertas' || mensaje.includes('estancados') || mensaje === 'atencion') {
      await this.enviarAlertasCEO(from, nombreCEO);
      return;
    }

    // Comando: HOT
    if (mensaje === 'hot' || mensaje.includes('leads hot') || mensaje === 'calientes') {
      await this.enviarLeadsHotCEO(from, nombreCEO);
      return;
    }

    // Comando: PROYECCIÓN
    if (mensaje === 'proyeccion' || mensaje === 'meta' || mensaje === 'forecast') {
      await this.enviarProyeccionCEO(from, nombreCEO);
      return;
    }

    // Comando: ROI
    if (mensaje === 'roi' || mensaje.includes('roi marketing') || mensaje === 'marketing') {
      await this.enviarROICEO(from, nombreCEO);
      return;
    }

    // Comando: FUENTES
    if (mensaje === 'fuentes' || mensaje.includes('leads por fuente') || mensaje === 'canales') {
      await this.enviarFuentesCEO(from, nombreCEO);
      return;
    }

    // Comando: EQUIPO
    if (mensaje === 'equipo' || mensaje === 'team' || mensaje.includes('estado equipo')) {
      await this.enviarEquipoCEO(from, nombreCEO, teamMembers);
      return;
    }

    // Si no reconoce el comando
    await this.twilio.sendWhatsAppMessage(from,
      'Hola ' + nombreCEO + ', no reconoci ese comando.\n\n' +
      'Escribe *ayuda* para ver los comandos disponibles.'
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // HANDLER AGENCIA - Marketing Commands
  // ═══════════════════════════════════════════════════════════════

  private async handleAgenciaMessage(from: string, body: string, agencia: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreAgencia = agencia.name?.split(' ')[0] || 'Marketing';

    console.log('Agencia Command:', mensaje);

    // Comando: AYUDA
    if (mensaje === 'ayuda' || mensaje === 'comandos' || mensaje === 'help' || mensaje === '?') {
      await this.twilio.sendWhatsAppMessage(from,
        '*Comandos Agencia - ' + nombreAgencia + '*\n\n' +
        '*Campañas:*\n' +
        '- *campanas* - Estado de campañas activas\n' +
        '- *mejor* - Mejor campaña actual\n' +
        '- *peor* - Campaña a optimizar\n\n' +
        '*Métricas:*\n' +
        '- *cpl* - Costo por lead\n' +
        '- *leads* - Leads por campaña\n' +
        '- *roi* - ROI por campaña\n\n' +
        '*Presupuesto:*\n' +
        '- *gasto* - Gasto vs presupuesto\n' +
        '- *resumen* - Resumen general'
      );
      return;
    }

    // Comando: CAMPAÑAS
    if (mensaje === 'campanas' || mensaje === 'campañas' || mensaje === 'campaigns') {
      await this.enviarCampanasAgencia(from, nombreAgencia);
      return;
    }

    // Comando: CPL
    if (mensaje === 'cpl' || mensaje === 'costo por lead' || mensaje === 'costoperlead') {
      await this.enviarCPLAgencia(from, nombreAgencia);
      return;
    }

    // Comando: LEADS
    if (mensaje === 'leads' || mensaje === 'generados') {
      await this.enviarLeadsAgencia(from, nombreAgencia);
      return;
    }

    // Comando: ROI
    if (mensaje === 'roi' || mensaje === 'retorno') {
      await this.enviarROIAgencia(from, nombreAgencia);
      return;
    }

    // Comando: MEJOR
    if (mensaje === 'mejor' || mensaje === 'top' || mensaje === 'best') {
      await this.enviarMejorCampanaAgencia(from, nombreAgencia);
      return;
    }

    // Comando: PEOR
    if (mensaje === 'peor' || mensaje === 'optimizar' || mensaje === 'worst') {
      await this.enviarPeorCampanaAgencia(from, nombreAgencia);
      return;
    }

    // Comando: GASTO
    if (mensaje === 'gasto' || mensaje === 'presupuesto' || mensaje === 'budget') {
      await this.enviarGastoAgencia(from, nombreAgencia);
      return;
    }

    // Comando: RESUMEN
    if (mensaje === 'resumen' || mensaje === 'summary') {
      await this.enviarResumenAgencia(from, nombreAgencia);
      return;
    }

    // Si no reconoce el comando
    await this.twilio.sendWhatsAppMessage(from,
      'Hola ' + nombreAgencia + ', no reconoci ese comando.\n\n' +
      'Escribe *ayuda* para ver los comandos disponibles.'
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // FUNCIONES DE REPORTE PARA AGENCIA
  // ═══════════════════════════════════════════════════════════════

  private async enviarCampanasAgencia(from: string, nombre: string): Promise<void> {
    try {
      const { data: campanas } = await this.supabase.client
        .from('marketing_campaigns')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (!campanas || campanas.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay campañas activas en este momento.');
        return;
      }

      let msg = '*CAMPAÑAS ACTIVAS*\n' + nombre + '\n\n';
      
      for (const c of campanas.slice(0, 10)) {
        const cpl = c.leads_generated > 0 ? Math.round(c.budget_spent / c.leads_generated) : 0;
        msg += `📣 *${c.name}*\n`;
        msg += `   Plataforma: ${c.platform}\n`;
        msg += `   Leads: ${c.leads_generated || 0}\n`;
        msg += `   CPL: $${cpl.toLocaleString()}\n`;
        msg += `   Gasto: $${(c.budget_spent || 0).toLocaleString()}\n\n`;
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en campanas agencia:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener campañas.');
    }
  }

  private async enviarCPLAgencia(from: string, nombre: string): Promise<void> {
    try {
      const { data: campanas } = await this.supabase.client
        .from('marketing_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!campanas || campanas.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay datos de campañas.');
        return;
      }

      // Agrupar por plataforma
      const porPlataforma: Record<string, { gasto: number, leads: number }> = {};
      for (const c of campanas) {
        const plat = c.platform || 'Otro';
        if (!porPlataforma[plat]) porPlataforma[plat] = { gasto: 0, leads: 0 };
        porPlataforma[plat].gasto += c.budget_spent || 0;
        porPlataforma[plat].leads += c.leads_generated || 0;
      }

      let msg = '*CPL POR PLATAFORMA*\n' + nombre + '\n\n';
      
      const sorted = Object.entries(porPlataforma)
        .map(([plat, data]) => ({
          plat,
          cpl: data.leads > 0 ? Math.round(data.gasto / data.leads) : 0,
          leads: data.leads,
          gasto: data.gasto
        }))
        .sort((a, b) => a.cpl - b.cpl);

      for (const item of sorted) {
        const emoji = item.cpl < 150 ? '🟢' : item.cpl < 300 ? '🟡' : '🔴';
        msg += `${emoji} *${item.plat}*\n`;
        msg += `   CPL: $${item.cpl} | Leads: ${item.leads}\n`;
      }

      const totalGasto = sorted.reduce((s, i) => s + i.gasto, 0);
      const totalLeads = sorted.reduce((s, i) => s + i.leads, 0);
      const cplGlobal = totalLeads > 0 ? Math.round(totalGasto / totalLeads) : 0;

      msg += `\n📊 *CPL GLOBAL: $${cplGlobal}*`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en CPL agencia:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al calcular CPL.');
    }
  }

  private async enviarLeadsAgencia(from: string, nombre: string): Promise<void> {
    try {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);

      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('source, status, created_at')
        .gte('created_at', inicioMes.toISOString());

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay leads este mes.');
        return;
      }

      // Agrupar por fuente
      const porFuente: Record<string, { total: number, hot: number }> = {};
      for (const l of leads) {
        const fuente = l.source || 'Directo';
        if (!porFuente[fuente]) porFuente[fuente] = { total: 0, hot: 0 };
        porFuente[fuente].total++;
        if (['negotiation', 'reserved', 'closed'].includes(l.status)) {
          porFuente[fuente].hot++;
        }
      }

      let msg = '*LEADS POR FUENTE (MES)*\n' + nombre + '\n\n';
      
      const sorted = Object.entries(porFuente)
        .map(([fuente, data]) => ({
          fuente,
          ...data,
          conversion: data.total > 0 ? Math.round(data.hot / data.total * 100) : 0
        }))
        .sort((a, b) => b.total - a.total);

      for (const item of sorted) {
        msg += `📣 *${item.fuente}*\n`;
        msg += `   Total: ${item.total} | HOT: ${item.hot} | Conv: ${item.conversion}%\n`;
      }

      msg += `\n📊 *TOTAL: ${leads.length} leads*`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en leads agencia:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener leads.');
    }
  }

  private async enviarROIAgencia(from: string, nombre: string): Promise<void> {
    try {
      const { data: campanas } = await this.supabase.client
        .from('marketing_campaigns')
        .select('*');

      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('source, status, properties(price)')
        .in('status', ['closed', 'delivered']);

      const totalGasto = campanas?.reduce((s, c) => s + (c.budget_spent || 0), 0) || 0;
      
      // Calcular revenue por fuente
      let totalRevenue = 0;
      const revenuePorFuente: Record<string, number> = {};
      
      for (const l of leads || []) {
        const precio = l.properties?.price || 2000000;
        totalRevenue += precio;
        const fuente = l.source || 'Directo';
        revenuePorFuente[fuente] = (revenuePorFuente[fuente] || 0) + precio;
      }

      const roi = totalGasto > 0 ? Math.round((totalRevenue - totalGasto) / totalGasto * 100) : 0;

      let msg = '*ROI MARKETING*\n' + nombre + '\n\n';
      msg += `💰 Invertido: $${totalGasto.toLocaleString()}\n`;
      msg += `📈 Revenue: $${(totalRevenue / 1000000).toFixed(1)}M\n`;
      msg += `📊 ROI: ${roi}%\n\n`;

      msg += '*Por fuente:*\n';
      for (const [fuente, rev] of Object.entries(revenuePorFuente).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        msg += `• ${fuente}: $${(rev / 1000000).toFixed(1)}M\n`;
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en ROI agencia:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al calcular ROI.');
    }
  }

  private async enviarMejorCampanaAgencia(from: string, nombre: string): Promise<void> {
    try {
      const { data: campanas } = await this.supabase.client
        .from('marketing_campaigns')
        .select('*')
        .gt('leads_generated', 0)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!campanas || campanas.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay campañas con leads.');
        return;
      }

      // Encontrar la de menor CPL
      const conCPL = campanas.map(c => ({
        ...c,
        cpl: c.budget_spent / c.leads_generated
      })).sort((a, b) => a.cpl - b.cpl);

      const mejor = conCPL[0];

      await this.twilio.sendWhatsAppMessage(from,
        '*🏆 MEJOR CAMPAÑA*\n' + nombre + '\n\n' +
        `📣 *${mejor.name}*\n\n` +
        `Plataforma: ${mejor.platform}\n` +
        `Leads: ${mejor.leads_generated}\n` +
        `CPL: $${Math.round(mejor.cpl)}\n` +
        `Gasto: $${mejor.budget_spent?.toLocaleString()}\n\n` +
        '💡 *Recomendación:*\n' +
        'Considera escalar esta campaña aumentando presupuesto gradualmente.'
      );
    } catch (e) {
      console.log('Error en mejor campaña:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener mejor campaña.');
    }
  }

  private async enviarPeorCampanaAgencia(from: string, nombre: string): Promise<void> {
    try {
      const { data: campanas } = await this.supabase.client
        .from('marketing_campaigns')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!campanas || campanas.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay campañas activas.');
        return;
      }

      // Encontrar la de mayor CPL o sin leads
      const conCPL = campanas.map(c => ({
        ...c,
        cpl: c.leads_generated > 0 ? c.budget_spent / c.leads_generated : 999999
      })).sort((a, b) => b.cpl - a.cpl);

      const peor = conCPL[0];

      let recomendacion = '';
      if (peor.leads_generated === 0) {
        recomendacion = 'Sin leads generados. Revisa segmentación y creativos urgente.';
      } else if (peor.cpl > 500) {
        recomendacion = 'CPL muy alto. Considera pausar y optimizar antes de continuar.';
      } else {
        recomendacion = 'Revisa audiencias y prueba nuevos creativos.';
      }

      await this.twilio.sendWhatsAppMessage(from,
        '*⚠️ CAMPAÑA A OPTIMIZAR*\n' + nombre + '\n\n' +
        `📣 *${peor.name}*\n\n` +
        `Plataforma: ${peor.platform}\n` +
        `Leads: ${peor.leads_generated || 0}\n` +
        `CPL: ${peor.leads_generated > 0 ? '$' + Math.round(peor.cpl) : 'Sin leads'}\n` +
        `Gasto: $${peor.budget_spent?.toLocaleString()}\n\n` +
        '💡 *Recomendación:*\n' +
        recomendacion
      );
    } catch (e) {
      console.log('Error en peor campaña:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener campaña a optimizar.');
    }
  }

  private async enviarGastoAgencia(from: string, nombre: string): Promise<void> {
    try {
      const { data: campanas } = await this.supabase.client
        .from('marketing_campaigns')
        .select('*');

      if (!campanas || campanas.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay campañas registradas.');
        return;
      }

      const totalPresupuesto = campanas.reduce((s, c) => s + (c.budget || 0), 0);
      const totalGasto = campanas.reduce((s, c) => s + (c.budget_spent || 0), 0);
      const porcentaje = totalPresupuesto > 0 ? Math.round(totalGasto / totalPresupuesto * 100) : 0;

      // Por plataforma
      const porPlataforma: Record<string, { budget: number, spent: number }> = {};
      for (const c of campanas) {
        const plat = c.platform || 'Otro';
        if (!porPlataforma[plat]) porPlataforma[plat] = { budget: 0, spent: 0 };
        porPlataforma[plat].budget += c.budget || 0;
        porPlataforma[plat].spent += c.budget_spent || 0;
      }

      let msg = '*GASTO VS PRESUPUESTO*\n' + nombre + '\n\n';
      msg += `💰 Presupuesto: $${totalPresupuesto.toLocaleString()}\n`;
      msg += `💸 Gastado: $${totalGasto.toLocaleString()}\n`;
      msg += `📊 Utilizado: ${porcentaje}%\n\n`;

      msg += '*Por plataforma:*\n';
      for (const [plat, data] of Object.entries(porPlataforma)) {
        const pct = data.budget > 0 ? Math.round(data.spent / data.budget * 100) : 0;
        const emoji = pct > 100 ? '🔴' : pct > 80 ? '🟡' : '🟢';
        msg += `${emoji} ${plat}: $${data.spent.toLocaleString()} / $${data.budget.toLocaleString()} (${pct}%)\n`;
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en gasto agencia:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener gasto.');
    }
  }

  private async enviarResumenAgencia(from: string, nombre: string): Promise<void> {
    try {
      const { data: campanas } = await this.supabase.client
        .from('marketing_campaigns')
        .select('*');

      const inicioMes = new Date();
      inicioMes.setDate(1);
      
      const { data: leadsMes } = await this.supabase.client
        .from('leads')
        .select('source, status')
        .gte('created_at', inicioMes.toISOString());

      const activas = campanas?.filter(c => c.status === 'active').length || 0;
      const totalGasto = campanas?.reduce((s, c) => s + (c.budget_spent || 0), 0) || 0;
      const totalLeadsCamp = campanas?.reduce((s, c) => s + (c.leads_generated || 0), 0) || 0;
      const cplGlobal = totalLeadsCamp > 0 ? Math.round(totalGasto / totalLeadsCamp) : 0;

      const leadsMesTotal = leadsMes?.length || 0;
      const leadsHot = leadsMes?.filter(l => ['negotiation', 'reserved', 'closed'].includes(l.status)).length || 0;
      const conversionRate = leadsMesTotal > 0 ? Math.round(leadsHot / leadsMesTotal * 100) : 0;

      await this.twilio.sendWhatsAppMessage(from,
        '*📊 RESUMEN MARKETING*\n' + nombre + '\n\n' +
        '*Campañas:*\n' +
        `• Activas: ${activas}\n` +
        `• Gasto total: $${totalGasto.toLocaleString()}\n` +
        `• CPL global: $${cplGlobal}\n\n` +
        '*Leads (mes):*\n' +
        `• Generados: ${leadsMesTotal}\n` +
        `• HOT: ${leadsHot}\n` +
        `• Conversión: ${conversionRate}%\n\n` +
        '💡 Escribe *mejor* o *peor* para ver campañas destacadas.'
      );
    } catch (e) {
      console.log('Error en resumen agencia:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener resumen.');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FUNCIONES DE REPORTE PARA CEO
  // ═══════════════════════════════════════════════════════════════

  private async enviarResumenCEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

      const { data: leadsHoy } = await this.supabase.client
        .from('leads')
        .select('*')
        .gte('created_at', inicioHoy);

      const { data: leadsMes } = await this.supabase.client
        .from('leads')
        .select('*')
        .gte('created_at', inicioMes);

      const { data: allLeads } = await this.supabase.client
        .from('leads')
        .select('*');

      const { data: citasHoy } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('scheduled_date', hoy.toISOString().split('T')[0]);

      const leads = allLeads || [];
      const nuevosHoy = leadsHoy?.length || 0;
      const nuevosMes = leadsMes?.length || 0;
      const cierresHoy = leadsHoy?.filter((l: any) => l.status === 'closed').length || 0;
      const cierresMes = leadsMes?.filter((l: any) => l.status === 'closed').length || 0;
      const leadsHot = leads.filter((l: any) => ['negotiation', 'reserved'].includes(l.status)).length;
      const citasAgendadas = citasHoy?.length || 0;

      const avgTicket = 2000000;
      const pipelineValue = leads.reduce((sum: number, l: any) => {
        const weights: Record<string, number> = { 'negotiation': 0.6, 'reserved': 0.85, 'visited': 0.4 };
        return sum + (weights[l.status] || 0) * avgTicket;
      }, 0);

      await this.twilio.sendWhatsAppMessage(from,
        '*RESUMEN EJECUTIVO*\n' +
        nombreCEO + ' | ' + hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) + '\n\n' +
        '*HOY:*\n' +
        '- Leads nuevos: ' + nuevosHoy + '\n' +
        '- Cierres: ' + cierresHoy + '\n' +
        '- Citas agendadas: ' + citasAgendadas + '\n\n' +
        '*ESTE MES:*\n' +
        '- Leads totales: ' + nuevosMes + '\n' +
        '- Cierres: ' + cierresMes + '\n\n' +
        '*PIPELINE:*\n' +
        '- Valor: $' + (pipelineValue / 1000000).toFixed(1) + 'M\n' +
        '- Leads HOT: ' + leadsHot + '\n\n' +
        'Escribe *pipeline*, *ranking* o *alertas* para mas detalles.'
      );
    } catch (error) {
      console.error('Error en resumen CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al generar resumen. Intenta de nuevo.');
    }
  }

  private async enviarPipelineCEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client.from('leads').select('*');
      const allLeads = leads || [];

      const stages = [
        { key: 'new', label: 'Nuevos', count: 0 },
        { key: 'contacted', label: 'Contactados', count: 0 },
        { key: 'scheduled', label: 'Con cita', count: 0 },
        { key: 'visited', label: 'Visitaron', count: 0 },
        { key: 'negotiation', label: 'Negociacion', count: 0 },
        { key: 'reserved', label: 'Reservados', count: 0 },
        { key: 'closed', label: 'Cerrados', count: 0 },
      ];

      allLeads.forEach((l: any) => {
        const stage = stages.find(s => s.key === l.status);
        if (stage) stage.count++;
      });

      const avgTicket = 2000000;
      const pipelineValue = allLeads.reduce((sum: number, l: any) => {
        const weights: Record<string, number> = { 'negotiation': 0.6, 'reserved': 0.85 };
        return sum + (weights[l.status] || 0) * avgTicket;
      }, 0);

      let msg = '*PIPELINE ACTUAL*\n' + nombreCEO + '\n\n';
      msg += '*Valor: $' + (pipelineValue / 1000000).toFixed(1) + 'M*\n';
      msg += 'Total leads: ' + allLeads.length + '\n\n';
      
      stages.forEach(s => {
        const pct = allLeads.length > 0 ? Math.round((s.count / allLeads.length) * 100) : 0;
        msg += s.label + ': ' + s.count + ' (' + pct + '%)\n';
      });

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en pipeline CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al generar pipeline.');
    }
  }

  private async enviarRankingCEO(from: string, nombreCEO: string, teamMembers: any[]): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client.from('leads').select('*');
      const allLeads = leads || [];

      const vendedores = teamMembers
        .filter((t: any) => t.role === 'vendedor')
        .map((v: any) => {
          const vendorLeads = allLeads.filter((l: any) => l.assigned_to === v.id);
          const cierres = vendorLeads.filter((l: any) => l.status === 'closed' || l.status === 'delivered').length;
          const hot = vendorLeads.filter((l: any) => ['negotiation', 'reserved'].includes(l.status)).length;
          return { ...v, cierres, hot, totalLeads: vendorLeads.length };
        })
        .sort((a: any, b: any) => b.cierres - a.cierres);

      let msg = '*RANKING VENDEDORES*\n' + nombreCEO + '\n\n';

      vendedores.slice(0, 5).forEach((v: any, i: number) => {
        const medal = i === 0 ? '1.' : i === 1 ? '2.' : i === 2 ? '3.' : (i + 1) + '.';
        msg += medal + ' *' + (v.name?.split(' ')[0] || 'Sin nombre') + '*\n';
        msg += '   ' + v.cierres + ' cierres | ' + v.hot + ' HOT | ' + v.totalLeads + ' leads\n\n';
      });

      if (vendedores.length === 0) {
        msg += 'No hay vendedores registrados.';
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en ranking CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al generar ranking.');
    }
  }

  private async enviarCierresCEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

      const { data: cierres } = await this.supabase.client
        .from('leads')
        .select('*')
        .in('status', ['closed', 'delivered'])
        .gte('updated_at', inicioMes);

      const totalCierres = cierres?.length || 0;
      const avgTicket = 2000000;
      const revenueEstimado = totalCierres * avgTicket;

      let msg = '*CIERRES DEL MES*\n' + nombreCEO + '\n\n';
      msg += '*Total: ' + totalCierres + ' cierres*\n';
      msg += 'Revenue estimado: $' + (revenueEstimado / 1000000).toFixed(1) + 'M\n\n';

      if (cierres && cierres.length > 0) {
        msg += '*Ultimos cierres:*\n';
        cierres.slice(0, 5).forEach((c: any) => {
          msg += '- ' + (c.name || 'Sin nombre') + ' - ' + (c.property_interest || 'Sin propiedad') + '\n';
        });
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en cierres CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al generar reporte de cierres.');
    }
  }

  private async enviarAlertasCEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client.from('leads').select('*');
      const allLeads = leads || [];
      const now = new Date();

      const maxDays: Record<string, number> = { 
        new: 1, contacted: 3, scheduled: 1, visited: 5, negotiation: 10, reserved: 30 
      };

      const estancados = allLeads.filter((l: any) => {
        const max = maxDays[l.status];
        if (!max) return false;
        const changedAt = l.status_changed_at ? new Date(l.status_changed_at) : new Date(l.created_at);
        const days = Math.floor((now.getTime() - changedAt.getTime()) / (1000 * 60 * 60 * 24));
        return days >= max;
      });

      let msg = '*ALERTAS - LEADS ESTANCADOS*\n' + nombreCEO + '\n\n';
      msg += '*Total: ' + estancados.length + ' leads requieren atencion*\n\n';

      if (estancados.length > 0) {
        const porEtapa: Record<string, number> = {};
        estancados.forEach((l: any) => {
          porEtapa[l.status] = (porEtapa[l.status] || 0) + 1;
        });

        Object.entries(porEtapa).forEach(([status, count]) => {
          msg += '- ' + status + ': ' + count + ' leads\n';
        });

        msg += '\n*Criticos (mas antiguos):*\n';
        estancados.slice(0, 5).forEach((l: any) => {
          const changedAt = l.status_changed_at ? new Date(l.status_changed_at) : new Date(l.created_at);
          const days = Math.floor((now.getTime() - changedAt.getTime()) / (1000 * 60 * 60 * 24));
          msg += '- ' + (l.name || 'Sin nombre') + ' - ' + days + 'd en ' + l.status + '\n';
        });
      } else {
        msg += 'Todo en orden! No hay leads estancados.';
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en alertas CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al generar alertas.');
    }
  }

  private async enviarLeadsHotCEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .in('status', ['negotiation', 'reserved']);

      const hotLeads = leads || [];

      let msg = '*LEADS HOT*\n' + nombreCEO + '\n\n';
      msg += '*Total: ' + hotLeads.length + ' leads listos para cerrar*\n\n';

      if (hotLeads.length > 0) {
        const negociacion = hotLeads.filter((l: any) => l.status === 'negotiation');
        const reservados = hotLeads.filter((l: any) => l.status === 'reserved');

        if (negociacion.length > 0) {
          msg += '*En negociacion (' + negociacion.length + '):*\n';
          negociacion.slice(0, 5).forEach((l: any) => {
            msg += '- ' + (l.name || 'Sin nombre') + ' - ' + (l.property_interest || 'Sin propiedad') + '\n';
          });
          msg += '\n';
        }

        if (reservados.length > 0) {
          msg += '*Reservados (' + reservados.length + '):*\n';
          reservados.slice(0, 5).forEach((l: any) => {
            msg += '- ' + (l.name || 'Sin nombre') + ' - ' + (l.property_interest || 'Sin propiedad') + '\n';
          });
        }
      } else {
        msg += 'No hay leads HOT en este momento.\nEnfocate en mover leads de etapas anteriores.';
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en leads hot CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener leads hot.');
    }
  }

  private async enviarProyeccionCEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client.from('leads').select('*');
      const allLeads = leads || [];

      const weights: Record<string, number> = {
        'new': 0.05, 'contacted': 0.10, 'scheduled': 0.20, 'visited': 0.40,
        'negotiation': 0.60, 'reserved': 0.85
      };

      const avgTicket = 2000000;
      const projectedDeals = allLeads.reduce((sum: number, l: any) => sum + (weights[l.status] || 0), 0);
      const projectedRevenue = projectedDeals * avgTicket;

      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const { data: cierresMes } = await this.supabase.client
        .from('leads')
        .select('*')
        .in('status', ['closed', 'delivered'])
        .gte('updated_at', inicioMes);

      const cierresActuales = cierresMes?.length || 0;
      const totalProyectado = cierresActuales + Math.round(projectedDeals);

      let msg = '*PROYECCION DEL MES*\n' + nombreCEO + '\n\n';
      msg += 'Cierres actuales: ' + cierresActuales + '\n';
      msg += 'Proyeccion adicional: ' + Math.round(projectedDeals) + '\n';
      msg += '*Total proyectado: ' + totalProyectado + ' cierres*\n\n';
      msg += '*Revenue proyectado: $' + (projectedRevenue / 1000000).toFixed(1) + 'M*\n\n';
      msg += 'Basado en probabilidades por etapa del funnel.';

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en proyeccion CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al calcular proyeccion.');
    }
  }

  private async enviarROICEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const { data: campaigns } = await this.supabase.client.from('marketing_campaigns').select('*');
      const allCampaigns = campaigns || [];

      const totalSpent = allCampaigns.reduce((sum: number, c: any) => sum + (c.spent || 0), 0);
      const totalRevenue = allCampaigns.reduce((sum: number, c: any) => sum + (c.revenue_generated || 0), 0);
      const totalLeads = allCampaigns.reduce((sum: number, c: any) => sum + (c.leads_generated || 0), 0);
      const roi = totalSpent > 0 ? ((totalRevenue - totalSpent) / totalSpent) * 100 : 0;
      const cpl = totalLeads > 0 ? totalSpent / totalLeads : 0;

      let msg = '*ROI MARKETING*\n' + nombreCEO + '\n\n';
      msg += 'Invertido: $' + totalSpent.toLocaleString() + '\n';
      msg += 'Revenue: $' + totalRevenue.toLocaleString() + '\n';
      msg += '*ROI: ' + roi.toFixed(0) + '%*\n';
      msg += 'Leads: ' + totalLeads + '\n';
      msg += 'CPL: $' + Math.round(cpl) + '\n\n';

      const byChannel: Record<string, { spent: number, leads: number, revenue: number }> = {};
      allCampaigns.forEach((c: any) => {
        if (!byChannel[c.channel]) byChannel[c.channel] = { spent: 0, leads: 0, revenue: 0 };
        byChannel[c.channel].spent += c.spent || 0;
        byChannel[c.channel].leads += c.leads_generated || 0;
        byChannel[c.channel].revenue += c.revenue_generated || 0;
      });

      msg += '*Por canal:*\n';
      Object.entries(byChannel).forEach(([channel, data]) => {
        const channelROI = data.spent > 0 ? ((data.revenue - data.spent) / data.spent) * 100 : 0;
        msg += channel + ': ' + channelROI.toFixed(0) + '% ROI | ' + data.leads + ' leads\n';
      });

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en ROI CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al calcular ROI.');
    }
  }

  private async enviarFuentesCEO(from: string, nombreCEO: string): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client.from('leads').select('*');
      const allLeads = leads || [];

      const bySource: Record<string, { total: number, closed: number }> = {};
      allLeads.forEach((l: any) => {
        const source = l.source || 'Directo';
        if (!bySource[source]) bySource[source] = { total: 0, closed: 0 };
        bySource[source].total++;
        if (l.status === 'closed' || l.status === 'delivered') {
          bySource[source].closed++;
        }
      });

      const sorted = Object.entries(bySource)
        .map(([source, data]) => ({ source, ...data, conv: data.total > 0 ? (data.closed / data.total) * 100 : 0 }))
        .sort((a, b) => b.total - a.total);

      let msg = '*LEADS POR FUENTE*\n' + nombreCEO + '\n\n';

      sorted.slice(0, 8).forEach((s) => {
        msg += '*' + s.source + '*\n';
        msg += '   ' + s.total + ' leads | ' + s.closed + ' cierres | ' + s.conv.toFixed(1) + '%\n\n';
      });

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en fuentes CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener fuentes.');
    }
  }

  private async enviarEquipoCEO(from: string, nombreCEO: string, teamMembers: any[]): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client.from('leads').select('*');
      const allLeads = leads || [];

      const vendedores = teamMembers.filter((t: any) => t.role === 'vendedor' && t.active);
      const asesores = teamMembers.filter((t: any) => t.role === 'asesor' && t.active);

      let msg = '*ESTADO DEL EQUIPO*\n' + nombreCEO + '\n\n';
      msg += 'Vendedores activos: ' + vendedores.length + '\n';
      msg += 'Asesores hipotecarios: ' + asesores.length + '\n\n';

      msg += '*Carga de trabajo:*\n';
      vendedores.forEach((v: any) => {
        const vendorLeads = allLeads.filter((l: any) => l.assigned_to === v.id);
        const pendientes = vendorLeads.filter((l: any) => !['closed', 'delivered', 'fallen'].includes(l.status)).length;
        const status = pendientes > 20 ? '[ALTO]' : pendientes > 10 ? '[MEDIO]' : '[OK]';
        msg += status + ' ' + (v.name?.split(' ')[0] || 'Sin nombre') + ': ' + pendientes + ' leads activos\n';
      });

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en equipo CEO:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener estado del equipo.');
    }
  }

  private async handleVendedorMessage(from: string, body: string, vendedor: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreVendedor = vendedor.name?.split(' ')[0] || 'crack';

    // ══════════════════════════════════════════════════════════
    // DETECTAR INTENCIÓN DEL VENDEDOR
    // ══════════════════════════════════════════════════════════

    // RESPUESTA A MOTIVO DE CAÍDA (1, 2, 3, 4)
    if (['1', '2', '3', '4'].includes(mensaje.trim())) {
      await this.vendedorMotivoRespuesta(from, mensaje.trim(), vendedor);
      return;
    }

    // MOTIVO PERSONALIZADO (después de elegir 4)
    const { data: leadPendiente } = await this.supabase.client
      .from('leads')
      .select('id, notes')
      .eq('assigned_to', vendedor.id)
      .eq('status', 'fallen')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (leadPendiente?.notes?.pending_custom_reason) {
      await this.vendedorMotivoCustom(from, body, vendedor);
      return;
    }

    // FUNNEL: Reservó/Apartó
    if (mensaje.includes('reserv') || mensaje.includes('reserb') || mensaje.includes('apart')) {
      await this.vendedorCambiarEtapa(from, body, vendedor, 'reserved', 'ðŸ“ RESERVADO');
      return;
    }

    // FUNNEL: Cerró/Escrituró
    if (((mensaje.includes('cerr') && !mensaje.includes('encerr')) || mensaje.includes('escritur')) && !mensaje.includes('mover') && !mensaje.includes('mueve') && !mensaje.includes('pasó a') && !mensaje.includes('paso a') && !mensaje.includes('pasa a')) {
      await this.vendedorCambiarEtapa(from, body, vendedor, 'closed', 'âœï¸ CERRADO');
      return;
    }

    // FUNNEL: Entregado
    if ((mensaje.includes('entreg') || mensaje.includes('entrg') || mensaje.includes('enterg')) && !mensaje.includes('entrega a')) {
      await this.vendedorCambiarEtapa(from, body, vendedor, 'delivered', '🔑 ENTREGADO');
      return;
    }

    // FUNNEL: Se cayó
    if (mensaje.includes('se cay') || mensaje.includes('cayo') || mensaje.includes('cayó') || mensaje.includes('canceló')) {
      await this.vendedorCambiarEtapa(from, body, vendedor, 'fallen', '❌ CAÍDO');
      return;
    }

    // HIPOTECA: Manda a banco
    if ((mensaje.includes('manda') || mensaje.includes('envia') || mensaje.includes('envía')) && 
        (mensaje.includes('bbva') || mensaje.includes('santander') || mensaje.includes('banorte') || 
         mensaje.includes('hsbc') || mensaje.includes('infonavit') || mensaje.includes('fovissste') ||
         mensaje.includes('banamex') || mensaje.includes('scotiabank') || mensaje.includes('banregio'))) {
      await this.vendedorEnviarABanco(from, body, vendedor);
      return;
    }

    // HIPOTECA: ¿Cómo va el crédito?
    if ((mensaje.includes('cómo va') || mensaje.includes('como va') || mensaje.includes('estatus') || mensaje.includes('status')) && 
        (mensaje.includes('crédit') || mensaje.includes('credit') || mensaje.includes('hipoteca') || mensaje.includes('banco'))) {
      await this.vendedorConsultarCredito(from, body, vendedor);
      return;
    }

    // =====================================================
    // ACTIVIDADES: Llamé, Visité, Cotización, WhatsApp, Email
    // =====================================================
    
    // ACTIVIDAD: Llamé a Juan / Llame a Juan
    const llameMatch = body.match(/^(?:llam[eé]|hable|hablé)\s+(?:a\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)$/i);
    if (llameMatch) {
      const nombreLead = llameMatch[1].trim();
      await this.registrarActividad(from, nombreLead, 'call', vendedor);
      return;
    }

    // ACTIVIDAD: Visité a María / Visite a María
    const visiteMatch = body.match(/^(?:visit[eé]|vi)\s+(?:a\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)$/i);
    if (visiteMatch) {
      const nombreLead = visiteMatch[1].trim();
      await this.registrarActividad(from, nombreLead, 'visit', vendedor);
      return;
    }

    // ACTIVIDAD: Cotización a Pedro / Cotizacion a Pedro 850k
    const cotizMatch = body.match(/^(?:cotizaci[oó]n|cotice|coticé)\s+(?:a\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+(\d+(?:\.\d+)?)\s*(?:k|m|mil|millon|millones)?)?$/i);
    if (cotizMatch) {
      const nombreLead = cotizMatch[1].trim();
      const montoRaw = cotizMatch[2];
      let monto = null;
      if (montoRaw) {
        const montoLower = body.toLowerCase();
        let multiplicador = 1;
        if (montoLower.includes('m') || montoLower.includes('millon')) multiplicador = 1000000;
        else if (montoLower.includes('k') || montoLower.includes('mil')) multiplicador = 1000;
        monto = parseFloat(montoRaw) * multiplicador;
      }
      await this.registrarActividad(from, nombreLead, 'quote', vendedor, monto);
      return;
    }

    // ACTIVIDAD: WhatsApp a Ana / Le escribí a Ana
    const waMatch = body.match(/^(?:whatsapp|whats|mensaje|le\s+escrib[ií])\s+(?:a\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)$/i);
    if (waMatch) {
      const nombreLead = waMatch[1].trim();
      await this.registrarActividad(from, nombreLead, 'whatsapp', vendedor);
      return;
    }

    // ACTIVIDAD: Email a Luis / Correo a Luis
    const emailActMatch = body.match(/^(?:email|correo|mail)\s+(?:a\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)$/i);
    if (emailActMatch) {
      const nombreLead = emailActMatch[1].trim();
      await this.registrarActividad(from, nombreLead, 'email', vendedor);
      return;
    }

    // ACTIVIDAD: ¿Qué hice hoy? / Mis actividades
    if (mensaje.includes('qué hice') || mensaje.includes('que hice') || mensaje.includes('mis actividades')) {
      await this.mostrarActividadesHoy(from, vendedor);
      return;
    }

    // ACTIVIDAD: Historial de Juan
    const historialMatch = body.match(/^historial\s+(?:de\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)$/i);
    if (historialMatch) {
      const nombreLead = historialMatch[1].trim();
      await this.mostrarHistorialLead(from, nombreLead, vendedor);
      return;
    }

    // CREAR LEAD: Nuevo Juan Pérez 5512345678
    const nuevoLeadMatch = body.match(/^nuevo\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)\s+(\d{10,13})$/i);
    if (nuevoLeadMatch) {
      const nombreLead = nuevoLeadMatch[1].trim();
      const telefono = nuevoLeadMatch[2];
      await this.crearLeadDesdeWhatsApp(from, nombreLead, telefono, vendedor);
      return;
    }

    // =====================================================
    // FIN ACTIVIDADES
    // =====================================================

    // POST-VENTA: Cumple Juan 15/03
    const cumpleMatch = body.match(/^cumple\s+([a-zA-ZáéíóúñÍÉÍÓÚÑ0-9\s]+)\s+(\d{1,2})[\/\-](\d{1,2})$/i);
    if (cumpleMatch) {
      const nombreCliente = cumpleMatch[1].trim();
      const dia = cumpleMatch[2].padStart(2, '0');
      const mes = cumpleMatch[3].padStart(2, '0');
      
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .eq('status', 'delivered')
        .ilike('name', '%' + nombreCliente + '%')
        .single();
      
      if (!lead) {
        await this.twilio.sendWhatsAppMessage(from, '❌ No encontré cliente entregado "' + nombreCliente + '"');
        return;
      }
      
      await this.supabase.client.from('leads').update({ birthday: '2000-' + mes + '-' + dia }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '🎚 Cumpleaños de *' + lead.name + '* guardado: *' + dia + '/' + mes + '*');
      return;
    }

    // POST-VENTA: Email Juan correo@ejemplo.com
    const emailMatch = body.match(/^email\s+([a-zA-ZáéíóúñÍÉÍÓÚÑ0-9\s]+)\s+([^\s]+@[^\s]+)$/i);
    if (emailMatch) {
      const nombreCliente = emailMatch[1].trim();
      const correo = emailMatch[2].toLowerCase();
      
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .eq('status', 'delivered')
        .ilike('name', '%' + nombreCliente + '%')
        .single();
      
      if (!lead) {
        await this.twilio.sendWhatsAppMessage(from, '❌ No encontré cliente entregado "' + nombreCliente + '"');
        return;
      }
      
      await this.supabase.client.from('leads').update({ email: correo }).eq('id', lead.id);
      await this.twilio.sendWhatsAppMessage(from, '📧 Email de *' + lead.name + '* guardado: *' + correo + '*');
      return;
    }

    // REFERIDOS: Vendedor registra referido "Referido Juan 5512345678 por Pedro"
    const refVendMatch = body.match(/^referido\s+([a-zA-ZáéíóúñÍÉÍÓÚÑ0-9\s]+)\s+(\d{10})\s+por\s+([a-zA-ZáéíóúñÍÉÍÓÚÑ0-9\s]+)$/i);
    if (refVendMatch) {
      const nombreReferido = refVendMatch[1].trim();
      const telReferido = refVendMatch[2];
      const nombreReferidor = refVendMatch[3].trim();
      
      // Buscar cliente referidor
      const { data: referidor } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('status', 'delivered')
        .ilike('name', '%' + nombreReferidor + '%')
        .single();
      
      // Crear lead referido
      const { data: nuevoLead } = await this.supabase.client
        .from('leads')
        .insert({
          name: nombreReferido,
          phone: '52' + telReferido.slice(-10),
          source: 'referido',
          referrer_id: referidor?.id || null,
          assigned_to: vendedor.id,
          status: 'new',
          score: 80,
          notes: { referido_por: nombreReferidor, fecha_referido: new Date().toISOString() }
        })
        .select()
        .single();
      
      // Mensaje al referido
      await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(telReferido),
        '👋 ¡Hola *' + nombreReferido.split(' ')[0] + '*!\n\n' +
        'Tu amigo *' + nombreReferidor.split(' ')[0] + '* te recomendó con nosotros para ayudarte a encontrar tu casa ideal. 🏠\n\n' +
        'Tenemos opciones increíbles para ti.\n\n' +
        'Pronto te contactará uno de nuestros asesores. ¿Mientras tanto, te gustaría ver información de nuestras propiedades?\n\n' +
        'Responde *SÍ* para conocer más.');
      
      await this.twilio.sendWhatsAppMessage(from,
        '✅ *Referido registrado*\n\n' +
        '*' + nombreReferido + '* - ' + telReferido + '\n' +
        '👤 Por: ' + nombreReferidor + '\n\n' +
        'Ya le enviamos mensaje de bienvenida.');
      return;
    }

    // 0. RESPUESTA A CONFIRMACIÓN: "1", "sí", "si manda"
    if ((mensaje === '1' || mensaje === 'si' || mensaje === 'sí' || mensaje.includes('si manda') || mensaje.includes('sí manda')) && await this.hayConfirmacionPendiente(vendedor.id)) {
      await this.enviarConfirmacionAlLead(from, vendedor, nombreVendedor);
      return;
    }

    // 0.1 RESPUESTA NEGATIVA: "2", "no"
    if ((mensaje === '2' || mensaje === 'no' || mensaje.includes('yo le aviso')) && await this.hayConfirmacionPendiente(vendedor.id)) {
      await this.cancelarConfirmacionPendiente(from, vendedor, nombreVendedor);
      return;
    }

    // 0.2 AYUDA CONTEXTUAL: "¿Cómo agendo cita?" "¿Cómo cancelo?"
    if (mensaje.includes('cómo ') || mensaje.includes('como ') || mensaje.includes('como hago') || mensaje.includes('cómo hago') || mensaje.includes('como agendo') || mensaje.includes('como cancelo') || mensaje.includes('como creo')) {
      await this.vendedorAyudaContextual(from, body, nombreVendedor);
      return;
    }

    // 1. AGENDAR CITA: "Cita mañana 5pm con Juan 5512345678 en Distrito Falco"
    const esAgendarCita = mensaje.includes('cita') && (
      mensaje.includes('mañana') || mensaje.includes('pasado') ||
      mensaje.includes('lunes') || mensaje.includes('martes') ||
      mensaje.includes('miércoles') || mensaje.includes('miercoles') ||
      mensaje.includes('jueves') || mensaje.includes('viernes') ||
      mensaje.includes('sábado') || mensaje.includes('sabado') ||
      mensaje.includes('domingo') || mensaje.includes(' en ') ||
      /\d{1,2}\s*(am|pm)/i.test(mensaje) || mensaje.includes(' con ')
    );
    if (esAgendarCita) {
      await this.vendedorAgendarCitaCompleta(from, body, vendedor, nombreVendedor);
      return;
    }

    // 1.1 ¿Qué citas tengo hoy?
    if (mensaje.includes('cita') && (mensaje.includes('tengo') || mensaje.includes('mis citas') || mensaje.includes('agenda'))) {
      await this.vendedorCitasHoy(from, vendedor, nombreVendedor);
      return;
    }

    // 1.2 MI FUNNEL - Ver resumen de leads por etapa
    if (mensaje.includes('mi funnel') || mensaje.includes('mis leads') || mensaje === 'funnel') {
      await this.vendedorMiFunnel(from, vendedor, nombreVendedor);
      return;
    }

    // 1.3 FUNNEL DE [NOMBRE] - Ver detalle de un lead
    const matchFunnelLead = body.match(/(?:funnel de|ver a|estado de|info de)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+)/i);
    if (matchFunnelLead) {
      await this.vendedorFunnelLead(from, matchFunnelLead[1].trim(), vendedor, nombreVendedor);
      return;
    }

    // 2. ¿Cómo va mi meta? / ¿Cuánto llevo?
    if (mensaje.includes('meta') || mensaje.includes('llevo') || mensaje.includes('avance') || mensaje.includes('ventas')) {
      await this.vendedorMetaAvance(from, vendedor, nombreVendedor);
      return;
    }

    // 3. ¿Cuántos leads tengo?
    if (mensaje.includes('lead') || mensaje.includes('prospectos') || mensaje.includes('clientes nuevos')) {
      await this.vendedorResumenLeads(from, vendedor, nombreVendedor);
      return;
    }

    // 4. ¿Qué pendientes tengo?
    if (mensaje.includes('pendiente') || mensaje.includes('follow') || mensaje.includes('seguimiento')) {
      await this.vendedorPendientes(from, vendedor, nombreVendedor);
      return;
    }

    // 5. Briefing / Buenos días
    if (mensaje.includes('briefing') || mensaje.includes('buenos días') || mensaje.includes('buen dia') || mensaje === 'hola') {
      await this.vendedorBriefing(from, vendedor, nombreVendedor);
      return;
    }

    // 6. Ayuda / ¿Qué puedes hacer?
    if (mensaje.includes('ayuda') || mensaje.includes('help') || mensaje.includes('qué puedes') || mensaje.includes('comandos')) {
      await this.vendedorAyuda(from, nombreVendedor);
      return;
    }

    // 6.5 MATERIAL DE VENTAS - Brochure, video, ubicación
    const matchMaterial = body.match(/(?:manda(?:me)?|envia(?:me)?|dame|necesito|quiero)\s*(?:el|la|un|una)?\s*(?:brochure|brouchure|brocure|folleto|video|youtube|ubicaci[oó]n|mapa|material|info|recorrido|matterport|3d)\s*(?:de|del)?\s*([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+)/i);
    const matchMaterial2 = body.match(/(?:brochure|brouchure|brocure|folleto|video|youtube|ubicaci[oó]n|mapa|material|recorrido|matterport|3d)\s*(?:de|del)?\s*([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+)/i);
    
    if (matchMaterial || matchMaterial2) {
      const desarrollo = (matchMaterial?.[1] || matchMaterial2?.[1])?.trim();
      if (desarrollo) {
        await this.vendedorEnviarMaterial(from, desarrollo, body, vendedor);
        return;
      }
    }


    // ══════════════════════════════════════════════════════════
    // COMANDOS DE ACTUALIZACIÓN
    // ══════════════════════════════════════════════════════════

    // 7. Cerré venta con [nombre]
    if (mensaje.includes('cerré') || mensaje.includes('cerre') || mensaje.includes('vendí') || mensaje.includes('vendi')) {
      await this.vendedorCerrarVenta(from, body, vendedor, nombreVendedor);
      return;
    }

    // 8. [Nombre] pasó a [etapa] - múltiples formatos
    if (mensaje.includes('pasó a') || mensaje.includes('paso a') || mensaje.includes('pasa a') || mensaje.includes('cambiar a') || mensaje.includes('mover a') || mensaje.includes('mover ') || mensaje.includes('mueve ') || mensaje.includes('siguiente') || mensaje.includes('adelante') || mensaje.includes('atras') || mensaje.includes('atrás') || mensaje.includes('anterior') || mensaje.includes('regresar')) {
      
      // Formato especial: "Mover Hilda al siguiente paso" / "Hilda al siguiente" / "Hilda adelante"
      const matchSiguiente = body.match(/(?:mover\s+(?:a\s+)?)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:al?\s+)?(?:siguiente|proximo|próximo|avanzar|adelante)/i);
      if (matchSiguiente) {
        const nombreLead = matchSiguiente[1].trim();
        console.log('📝 Comando siguiente paso detectado para:', nombreLead);
        
        // Buscar lead para obtener status actual
        let query = this.supabase.client
          .from('leads')
          .select('id, name, phone, status, assigned_to')
          .ilike('name', '%' + nombreLead + '%')
          .order('updated_at', { ascending: false });
        
        if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
          query = query.eq('assigned_to', vendedor.id);
        }
        
        const { data: leads } = await query;
        
        if (!leads || leads.length === 0) {
          await this.twilio.sendWhatsAppMessage(from, `No encontre a *${nombreLead}*`);
          return;
        }
        
        if (leads.length > 1) {
          let msg = `Encontre ${leads.length} leads:\n`;
          leads.forEach((l: any, i: number) => {
            msg += `${i+1}. ${l.name} - ${l.status}\n`;
          });
          await this.twilio.sendWhatsAppMessage(from, msg);
          return;
        }
        
        const lead = leads[0];
        
        // Definir orden del funnel
        const funnelOrder = ['new', 'contacted', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed', 'delivered'];
        const currentIndex = funnelOrder.indexOf(lead.status);
        
        if (currentIndex === -1 || currentIndex >= funnelOrder.length - 1) {
          await this.twilio.sendWhatsAppMessage(from, `*${lead.name}* ya esta en la ultima etapa (${lead.status})`);
          return;
        }
        
        const siguienteEtapa = funnelOrder[currentIndex + 1];
        const etapaLabels: Record<string, string> = {
          'contacted': '📞 CONTACTADO',
          'scheduled': '📅 CITA',
          'visited': '🏠 VISITÓ',
          'negotiation': '💰 NEGOCIACIÓN',
          'reserved': '📝 RESERVADO',
          'closed': '✅ CERRADO',
          'delivered': '🔑 ENTREGADO'
        };
        
        await this.vendedorCambiarEtapaConNombre(from, lead.name, vendedor, siguienteEtapa, etapaLabels[siguienteEtapa] || siguienteEtapa);
        return;
      }
      
      // Formato: "Hilda atrás" / "Hilda para atrás" / "regresar a Hilda"
      const matchAtras = body.match(/(?:regresar\s+(?:a\s+)?)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:para\s+)?(?:atras|atrás|regresar|anterior)/i);
      if (matchAtras) {
        const nombreLead = matchAtras[1].trim();
        console.log('📝 Comando atrás detectado para:', nombreLead);
        
        let query = this.supabase.client
          .from('leads')
          .select('id, name, phone, status, assigned_to')
          .ilike('name', '%' + nombreLead + '%')
          .order('updated_at', { ascending: false });
        
        if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
          query = query.eq('assigned_to', vendedor.id);
        }
        
        const { data: leads } = await query;
        
        if (!leads || leads.length === 0) {
          await this.twilio.sendWhatsAppMessage(from, `No encontre a *${nombreLead}*`);
          return;
        }
        
        if (leads.length > 1) {
          let msg = `Encontre ${leads.length} leads:\n`;
          leads.forEach((l: any, i: number) => {
            msg += `${i+1}. ${l.name} - ${l.status}\n`;
          });
          await this.twilio.sendWhatsAppMessage(from, msg);
          return;
        }
        
        const lead = leads[0];
        
        const funnelOrder = ['new', 'contacted', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed', 'delivered'];
        const currentIndex = funnelOrder.indexOf(lead.status);
        
        if (currentIndex <= 0) {
          await this.twilio.sendWhatsAppMessage(from, `*${lead.name}* ya esta en la primera etapa (${lead.status})`);
          return;
        }
        
        const anteriorEtapa = funnelOrder[currentIndex - 1];
        const etapaLabels: Record<string, string> = {
          'new': '🆕 NUEVO',
          'contacted': '📞 CONTACTADO',
          'scheduled': '📅 CITA',
          'visited': '🏠 VISITÓ',
          'negotiation': '💰 NEGOCIACIÓN',
          'reserved': '📝 RESERVADO',
          'closed': '✅ CERRADO'
        };
        
        await this.vendedorCambiarEtapaConNombre(from, lead.name, vendedor, anteriorEtapa, etapaLabels[anteriorEtapa] || anteriorEtapa);
        return;
      }
      
      // Formato 1: "Hilda pasó a negociación" / "Hilda pasa a reservado"
      let matchEtapa = body.match(/^([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s*(?:pasó a|paso a|pasa a)\s*(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
      
      // Formato 2: "Mover/Mueve a Hilda a cerrado" - con "a" antes del nombre
      if (!matchEtapa) {
        const match2 = body.match(/(?:mover|mueve)\s+a\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+a\s+(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
        if (match2) matchEtapa = match2;
      }
      
      // Formato 3: "Mover/Mueve Hilda a cerrado" - sin "a" antes del nombre (non-greedy)
      if (!matchEtapa) {
        const match3 = body.match(/(?:mover|mueve)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+a\s+(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
        if (match3) matchEtapa = match3;
      }
      
      // Formato 4: "Mover/Mueve Hilda de X a negociación"
      if (!matchEtapa) {
        matchEtapa = body.match(/(?:mover|mueve)\s+(?:a\s+)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+de\s+\w+\s+a\s+(contactado|cita|scheduled|visitó|visito|negociación|negociacion|reservado|cerrado|entregado|nuevo|new)/i);
      }
      
      if (matchEtapa) {
        const nombreLead = matchEtapa[1].trim();
        const etapaRaw = matchEtapa[2].toLowerCase();
        const etapaMap: Record<string, {key: string, label: string}> = {
          'contactado': {key: 'contacted', label: '📞 CONTACTADO'},
          'cita': {key: 'scheduled', label: '📅 CITA'},
          'scheduled': {key: 'scheduled', label: '📅 CITA'},
          'visitó': {key: 'visited', label: '🏠 VISITÓ'},
          'visito': {key: 'visited', label: '🏠 VISITÓ'},
          'negociación': {key: 'negotiation', label: '💰 NEGOCIACIÓN'},
          'negociacion': {key: 'negotiation', label: '💰 NEGOCIACIÓN'},
          'reservado': {key: 'reserved', label: '📝 RESERVADO'},
          'cerrado': {key: 'closed', label: '✅ CERRADO'},
          'entregado': {key: 'delivered', label: '🔑 ENTREGADO'},
          'nuevo': {key: 'new', label: '🆕 NUEVO'},
          'new': {key: 'new', label: '🆕 NUEVO'}
        };
        const etapa = etapaMap[etapaRaw];
        if (etapa) {
          console.log('📝 Comando mover detectado:', nombreLead, '->', etapa.key);
          await this.vendedorCambiarEtapaConNombre(from, nombreLead, vendedor, etapa.key, etapa.label);
          return;
        }
      }
      // Si no matcheó, mostrar ayuda
      await this.twilio.sendWhatsAppMessage(from, 
        `📊 *Para cambiar etapa escribe:*\n\n"[nombre] pasó a [etapa]"\n\n*Etapas:* contactado, cita, visitó, negociación, reservado, cerrado, entregado\n\n*Ejemplo:*\n• "Juan pasó a negociación"\n• "Mover María a reservado"\n• "Hilda al siguiente"`
      );
      return;
    }

    // 9. [Nombre] canceló
    if (mensaje.includes('canceló') || mensaje.includes('cancelo') || mensaje.includes('ya no') || mensaje.includes('perdí') || mensaje.includes('perdi')) {
      await this.vendedorCancelarLead(from, body, vendedor, nombreVendedor);
      return;
    }

    // 10. Agendar cita con [nombre] [fecha] [hora]
    if (mensaje.includes('agendar') || mensaje.includes('agenda') || mensaje.includes('programar')) {
      await this.vendedorAgendarCita(from, body, vendedor, nombreVendedor);
      return;
    }

    // 12. CREAR LEAD: "Crear Ana García 5512345678"
    if (mensaje.startsWith('crear ') && mensaje.match(/\d{10}/)) {
      await this.vendedorCrearLead(from, body, vendedor, nombreVendedor);
      return;
    }

    // 13. CANCELAR CITA: "Cancelar cita con Ana"
    if (mensaje.includes('cancelar cita') || mensaje.includes('cancela cita')) {
      await this.vendedorCancelarCita(from, body, vendedor, nombreVendedor);
      return;
    }

    // 14. REAGENDAR CITA: "Reagendar Ana para lunes 3pm"
    if (mensaje.includes('reagendar') || mensaje.includes('mover cita') || mensaje.includes('cambiar cita')) {
      await this.vendedorReagendarCita(from, body, vendedor, nombreVendedor);
      return;
    }

    // 15. AGENDAR CITA COMPLETA: "Cita con Ana mañana 10am en Distrito Falco"
    if ((mensaje.includes('cita con') || mensaje.includes('agendar')) && (mensaje.includes('am') || mensaje.includes('pm') || mensaje.includes(':') || mensaje.includes('mañana') || mensaje.includes('lunes') || mensaje.includes('martes') || mensaje.includes('miercoles') || mensaje.includes('jueves') || mensaje.includes('viernes') || mensaje.includes('sabado'))) {
      await this.vendedorAgendarCitaCompleta(from, body, vendedor, nombreVendedor);
      return;
    }

    // 16. Agregar nota: "Nota Juan: le interesa jardín"
    if (mensaje.includes('nota ') || mensaje.includes('apunte ') || mensaje.includes('anotar ')) {
      await this.vendedorAgregarNota(from, body, vendedor, nombreVendedor);
      return;
    }

    // 12. Ver notas: "Notas de Juan" o "Info de María"
    if ((mensaje.includes('notas de') || mensaje.includes('info de') || mensaje.includes('qué sé de'))) {
      await this.vendedorVerNotas(from, body, vendedor, nombreVendedor);
      return;
    }

    // 13. COACHING IA: "Coach Juan" o "Cómo le hago con María"
    const coachMatch = body.match(/^coach\s+(.+)$/i) || body.match(/cómo le (?:hago|vendo|cierro) (?:con|a)\s+(.+)$/i);
    if (coachMatch || mensaje.includes('coach ')) {
      const nombreLead = coachMatch ? (coachMatch[1] || coachMatch[2])?.trim() : body.replace(/coach/i, '').trim();
      await this.vendedorCoaching(from, nombreLead, vendedor, nombreVendedor);
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // COMANDOS VENDEDOR MEJORADOS
    // ═══════════════════════════════════════════════════════════════

    // COMISIONES: "comisiones" / "cuánto gané" / "mis ganancias"
    if (mensaje.includes('comision') || mensaje.includes('gané') || mensaje.includes('gane') || mensaje.includes('ganancia') || mensaje === 'dinero') {
      await this.vendedorComisiones(from, vendedor, nombreVendedor);
      return;
    }

    // MEJOR LEAD: "mejor" / "mejor lead" / "quién está más cerca"
    if (mensaje === 'mejor' || mensaje === 'mejor lead' || mensaje.includes('más cerca') || mensaje.includes('mas cerca')) {
      await this.vendedorMejorLead(from, vendedor, nombreVendedor);
      return;
    }

    // LEADS FRÍOS: "frios" / "leads frios" / "sin actividad"
    if (mensaje === 'frios' || mensaje === 'fríos' || mensaje.includes('leads frios') || mensaje.includes('sin actividad') || mensaje.includes('abandonados')) {
      await this.vendedorLeadsFrios(from, vendedor, nombreVendedor);
      return;
    }

    // RANKING: "ranking" / "cómo voy" / "comparar"
    if (mensaje === 'ranking' || mensaje.includes('cómo voy') || mensaje.includes('como voy') || mensaje === 'comparar' || mensaje.includes('posición')) {
      await this.vendedorRanking(from, vendedor, nombreVendedor);
      return;
    }

    // PROPIEDADES: "propiedades" / "desarrollos" / "qué tenemos"
    if (mensaje === 'propiedades' || mensaje === 'desarrollos' || mensaje.includes('qué tenemos') || mensaje.includes('que tenemos') || mensaje.includes('inventario')) {
      await this.vendedorPropiedades(from, vendedor);
      return;
    }

    // BUSCAR: "buscar 5512345678" / "quien es 5512345678"
    const buscarMatch = body.match(/(?:buscar|quien es|quién es|tel[eé]fono)\s*(\d{10,})/i);
    if (buscarMatch) {
      await this.vendedorBuscarPorTelefono(from, buscarMatch[1], vendedor);
      return;
    }

    // RECORDATORIO: "recordar Juan mañana" / "recordatorio llamar a María"
    const recordatorioMatch = body.match(/(?:recordar|recordatorio|reminder)\s+(.+)/i);
    if (recordatorioMatch) {
      await this.vendedorCrearRecordatorio(from, recordatorioMatch[1], vendedor, nombreVendedor);
      return;
    }

    // HOY: "hoy" - Resumen rápido del día
    if (mensaje === 'hoy' || mensaje === 'mi dia' || mensaje === 'mi día') {
      await this.vendedorResumenHoy(from, vendedor, nombreVendedor);
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // VOICE AI - Comandos de llamadas
    // ═══════════════════════════════════════════════════════════════

    // LLAMAR: "llamar Juan" / "tel Juan" / "marcar a Juan"
    const llamarMatch = body.match(/(?:llamar|tel|marcar|telefono|teléfono)\s+(?:a\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i);
    if (llamarMatch) {
      await this.vendedorLlamar(from, llamarMatch[1].trim(), vendedor, nombreVendedor);
      return;
    }

    // PROGRAMAR LLAMADA: "llamar Juan en 2 horas" / "recordar llamar a María mañana 10am"
    const programarLlamadaMatch = body.match(/(?:llamar|recordar llamar)\s+(?:a\s+)?([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)\s+(?:en|a las?|mañana|hoy)\s+(.+)/i);
    if (programarLlamadaMatch) {
      await this.vendedorProgramarLlamada(from, programarLlamadaMatch[1].trim(), programarLlamadaMatch[2].trim(), vendedor, nombreVendedor);
      return;
    }

    // LLAMADAS PENDIENTES: "llamadas" / "a quién llamar"
    if (mensaje === 'llamadas' || mensaje.includes('quién llamar') || mensaje.includes('quien llamar') || mensaje.includes('por llamar')) {
      await this.vendedorLlamadasPendientes(from, vendedor, nombreVendedor);
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // COMANDOS VENDEDOR MEJORADOS V2
    // ═══════════════════════════════════════════════════════════════

    // QUIÉN ES: "quién es Juan" / "quien es María" / "info Juan"
    const quienEsMatch = body.match(/(?:qui[eé]n es|perfil|datos de)\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i);
    if (quienEsMatch) {
      await this.vendedorQuienEs(from, quienEsMatch[1].trim(), vendedor, nombreVendedor);
      return;
    }

    // MIS HOT: "mis hot" / "hot" / "calientes" / "leads calientes"
    if (mensaje === 'hot' || mensaje === 'mis hot' || mensaje.includes('calientes') || mensaje === 'urgentes') {
      await this.vendedorMisHot(from, vendedor, nombreVendedor);
      return;
    }

    // PRÓXIMA CITA: "próxima cita" / "siguiente cita" / "próxima"
    if (mensaje.includes('próxima') || mensaje.includes('proxima') || mensaje.includes('siguiente cita')) {
      await this.vendedorProximaCita(from, vendedor, nombreVendedor);
      return;
    }

    // DISPONIBILIDAD: "disponibilidad" / "huecos" / "agenda libre"
    if (mensaje === 'disponibilidad' || mensaje.includes('huecos') || mensaje.includes('agenda libre') || mensaje.includes('cuando puedo')) {
      await this.vendedorDisponibilidad(from, vendedor, nombreVendedor);
      return;
    }

    // ENVIAR INFO: "enviar Los Encinos a Juan" / "manda info de Andes a María"
    const enviarInfoMatch = body.match(/(?:envia|envía|enviar|manda|mandar)\s+(?:info\s+(?:de\s+)?)?([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+a\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+)/i);
    if (enviarInfoMatch) {
      await this.vendedorEnviarInfoALead(from, enviarInfoMatch[1].trim(), enviarInfoMatch[2].trim(), vendedor, nombreVendedor);
      return;
    }

    // RESUMEN LEAD: "resumen Juan" / "summary María"  
    const resumenLeadMatch = body.match(/^(?:resumen|summary|reporte)\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i);
    if (resumenLeadMatch) {
      await this.vendedorResumenLead(from, resumenLeadMatch[1].trim(), vendedor, nombreVendedor);
      return;
    }

    // Default: Si no matcheó nada, usar IA para clasificar
    await this.vendedorIntentIA(from, body, vendedor, nombreVendedor);
  }

  // ══════════════════════════════════════════════════════════
  // FUNCIONES DEL ASISTENTE VENDEDOR
  // ══════════════════════════════════════════════════════════

  private async vendedorCitasHoy(from: string, vendedor: any, nombre: string): Promise<void> {
    // Obtener fecha de hoy en formato YYYY-MM-DD (zona horaria México)
    const ahora = new Date();
    const hoyMexico = new Date(ahora.getTime() - 6 * 60 * 60 * 1000); // UTC-6
    const hoyStr = hoyMexico.toISOString().split('T')[0];
    
    console.log('📅 Buscando citas para:', hoyStr, 'Vendedor:', vendedor.name, 'Role:', vendedor.role);

    // Si es admin/coordinador, ver TODAS las citas. Si es vendedor, solo las suyas.
    let query = this.supabase.client
      .from('appointments')
      .select('*')
      .eq('scheduled_date', hoyStr)
      .eq('status', 'scheduled')
      .order('scheduled_time', { ascending: true });
    
    // Solo filtrar por vendedor si NO es admin/coordinador
    if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
      query = query.eq('vendedor_id', vendedor.id);
    }
    
    const { data: citas, error } = await query;
    
    console.log('📋 Citas encontradas:', citas?.length, 'Error:', error?.message);

    if (!citas || citas.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 
        `☀️ *Buenos días ${nombre}!*

Hoy no tienes citas agendadas. ¡Buen momento para hacer follow-up a tus leads! 💪`
      );
      return;
    }

    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    let respuesta = `☀️ *Buenos días ${nombre}!*

📅 *${esAdmin ? 'Citas de hoy' : 'Tus citas de hoy'}:*
`;
    
    citas.forEach((cita: any, i: number) => {
      const hora = cita.scheduled_time?.substring(0, 5) || '??:??';
      const clienteNombre = cita.lead_name || 'Cliente';
      const desarrollo = cita.property_name || '';
      respuesta += `
${i + 1}. *${hora}* - ${clienteNombre}`;
      if (desarrollo) respuesta += `
   📍 ${desarrollo}`;
      if (esAdmin && cita.vendedor_name) respuesta += `
   👤 ${cita.vendedor_name}`;
    });

    respuesta += `

¡Éxito hoy! 🔥`;
    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

  // ═══════════════════════════════════════════════════════════════
  // MI FUNNEL - Resumen de leads por etapa CON BARRAS VISUALES
  // ═══════════════════════════════════════════════════════════════
  private async vendedorMiFunnel(from: string, vendedor: any, nombre: string): Promise<void> {
    // Si es admin/coordinador, ver TODOS los leads. Si es vendedor, solo los suyos.
    let query = this.supabase.client
      .from('leads')
      .select('id, name, status, score, phone, updated_at');
    
    if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
      query = query.eq('assigned_to', vendedor.id);
    }
    
    const { data: leads } = await query;
    
    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `📊 No tienes leads asignados aún.`);
      return;
    }

    const total = leads.length;

    // Contar por etapa
    const statusCount: Record<string, number> = {};
    leads.forEach((l: any) => {
      statusCount[l.status] = (statusCount[l.status] || 0) + 1;
    });

    // Funnel con etapas en orden
    const funnel = [
      { name: 'Nuevos', status: 'new', emoji: '🆕' },
      { name: 'Contactados', status: 'contacted', emoji: '📞' },
      { name: 'Cita', status: 'scheduled', emoji: '📅' },
      { name: 'Visitaron', status: 'visited', emoji: '🏠' },
      { name: 'Negociación', status: 'negotiation', emoji: '💰' },
      { name: 'Reservado', status: 'reserved', emoji: '📝' },
      { name: 'Cerrado', status: 'closed', emoji: '✅' },
      { name: 'Entregado', status: 'delivered', emoji: '🔑' },
    ];

    // Función para crear barra visual
    const crearBarra = (count: number, max: number): string => {
      const porcentaje = max > 0 ? count / max : 0;
      const llenos = Math.round(porcentaje * 10);
      const vacios = 10 - llenos;
      return '█'.repeat(llenos) + '░'.repeat(vacios);
    };

    const esAdmin = vendedor.role === 'admin' || vendedor.role === 'coordinador';
    let msg = `📊 *${esAdmin ? 'FUNNEL GENERAL' : 'MI FUNNEL'}*
━━━━━━━━━━━━━━━━━━━━

`;

    // Encontrar el máximo para escalar las barras
    const maxCount = Math.max(...Object.values(statusCount), 1);

    for (const etapa of funnel) {
      const count = statusCount[etapa.status] || 0;
      if (count > 0 || etapa.status === 'new') {
        const barra = crearBarra(count, maxCount);
        const porc = total > 0 ? Math.round((count / total) * 100) : 0;
        msg += `${etapa.emoji} ${etapa.name.padEnd(12)} ${barra} ${count} (${porc}%)\n`;
      }
    }

    // Caídos aparte
    const caidos = statusCount['fallen'] || 0;
    if (caidos > 0) {
      msg += `\n❌ Caídos: ${caidos}`;
    }

    msg += `
━━━━━━━━━━━━━━━━━━━━
📈 *Total:* ${total} leads

💡 *"funnel de [nombre]"* → Ver detalle`;

    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  // ═══════════════════════════════════════════════════════════════
  // FUNNEL DE [NOMBRE] - Detalle de un lead específico
  // ═══════════════════════════════════════════════════════════════
  private async vendedorFunnelLead(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    // Si es admin/coordinador, buscar en TODOS los leads
    let query = this.supabase.client
      .from('leads')
      .select('*')
      .ilike('name', '%' + nombreLead + '%');
    
    if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
      query = query.eq('assigned_to', vendedor.id);
    }
    
    const { data: leads } = await query;
    
    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `No encontré a *${nombreLead}*`);
      return;
    }

    if (leads.length > 1) {
      let msg = `Encontré ${leads.length} leads:\n`;
      leads.forEach((l: any, i: number) => {
        msg += `${i+1}. ${l.name} - ${l.status}\n`;
      });
      msg += `\nEscribe el nombre completo.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];
    
    // Emojis de etapas
    const statusEmojis: Record<string, string> = {
      'new': '🆕 Nuevo',
      'contacted': '📞 Contactado',
      'scheduled': '📅 Cita agendada',
      'visited': '🏠 Visitó',
      'negotiation': '💰 En negociación',
      'reserved': '📝 Reservado',
      'closed': '✅ Cerrado',
      'delivered': '🔑 Entregado',
      'fallen': '❌ Caído'
    };

    // Crear barra de progreso visual
    const funnelOrder = ['new', 'contacted', 'scheduled', 'visited', 'negotiation', 'reserved', 'closed', 'delivered'];
    const currentIndex = funnelOrder.indexOf(lead.status);
    let progressBar = '';
    funnelOrder.forEach((etapa, i) => {
      if (i <= currentIndex) {
        progressBar += '🟢';
      } else {
        progressBar += '⚪';
      }
    });

    // Calcular días en etapa actual
    const lastUpdate = lead.status_changed_at || lead.updated_at;
    let diasEnEtapa = 0;
    if (lastUpdate) {
      diasEnEtapa = Math.floor((Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24));
    }

    let respuesta = `👤 *${lead.name}*
━━━━━━━━━━━━━━━━━━━━

📱 ${lead.phone || 'Sin teléfono'}
🏠 ${lead.property_interest || 'Sin desarrollo'}

📊 *Estado:* ${statusEmojis[lead.status] || lead.status}
🎯 *Score:* ${lead.score || 0}
⏱️ *Días en etapa:* ${diasEnEtapa}

*Progreso:*
${progressBar}
`;

    // Agregar notas si existen
    if (lead.notes && typeof lead.notes === 'object') {
      const notasStr = lead.notes.notas_adicionales || lead.notes.observaciones;
      if (notasStr) {
        respuesta += `\n📝 *Notas:* ${notasStr}`;
      }
    }

    respuesta += `
━━━━━━━━━━━━━━━━━━━━
💡 *Comandos:*
• "${lead.name.split(' ')[0]} al siguiente"
• "${lead.name.split(' ')[0]} pasó a [etapa]"`;

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }


  // ═══════════════════════════════════════════════════════════════
  // ENVIAR MATERIAL DE VENTAS - Brochure, video, ubicación
  // ═══════════════════════════════════════════════════════════════
  private async vendedorEnviarMaterial(from: string, desarrollo: string, mensaje: string, vendedor: any): Promise<void> {
    console.log('📦 Buscando material para:', desarrollo);
    
    // Buscar el desarrollo en properties
    const { data: properties } = await this.supabase.client
      .from('properties')
      .select('*')
      .or(`development.ilike.%${desarrollo}%,name.ilike.%${desarrollo}%`);
    
    if (!properties || properties.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré el desarrollo "${desarrollo}"`);
      return;
    }

    const prop = properties[0];
    const nombreDesarrollo = prop.development || prop.name;
    const mensajeLower = mensaje.toLowerCase();
    
    // Determinar qué material pide
    const pideBrochure = mensajeLower.includes('brochure') || mensajeLower.includes('folleto') || mensajeLower.includes('material') || mensajeLower.includes('info');
    const pideVideo = mensajeLower.includes('video') || mensajeLower.includes('youtube');
    const pideUbicacion = mensajeLower.includes('ubicaci') || mensajeLower.includes('mapa') || mensajeLower.includes('gps');
    const pideRecorrido = mensajeLower.includes('recorrido') || mensajeLower.includes('matterport') || mensajeLower.includes('3d');
    
    // Si no especifica, enviar todo lo disponible
    const enviarTodo = !pideBrochure && !pideVideo && !pideUbicacion && !pideRecorrido;
    
    let materialesEnviados = 0;
    
    // 1. Brochure
    if (pideBrochure || enviarTodo) {
      const brochureUrl = this.getBrochureUrl(nombreDesarrollo);
      await this.twilio.sendWhatsAppMessage(from, `📄 *Brochure ${nombreDesarrollo}:*\n${brochureUrl}`);
      materialesEnviados++;
    }
    
    // 2. Video YouTube
    if ((pideVideo || enviarTodo) && prop.youtube_link) {
      await this.twilio.sendWhatsAppMessage(from, `🎬 *Video ${nombreDesarrollo}:*\n${prop.youtube_link}`);
      materialesEnviados++;
    }
    
    // 3. Ubicación GPS
    if ((pideUbicacion || enviarTodo) && prop.gps_link) {
      await this.twilio.sendWhatsAppMessage(from, `📍 *Ubicación ${nombreDesarrollo}:*\n${prop.gps_link}`);
      materialesEnviados++;
    }
    
    // 4. Recorrido 3D / Matterport
    if ((pideRecorrido || enviarTodo) && prop.matterport_link) {
      await this.twilio.sendWhatsAppMessage(from, `🏠 *Recorrido 3D ${nombreDesarrollo}:*\n${prop.matterport_link}`);
      materialesEnviados++;
    }
    
    // Si pidió algo específico que no existe
    if (materialesEnviados === 0) {
      let msg = `⚠️ *${nombreDesarrollo}* no tiene `;
      if (pideVideo) msg += 'video registrado';
      else if (pideUbicacion) msg += 'ubicación GPS registrada';
      else if (pideRecorrido) msg += 'recorrido 3D registrado';
      else msg += 'ese material';
      
      msg += `\n\n📦 *Disponible:*\n`;
      msg += `• Brochure ✅\n`;
      msg += prop.youtube_link ? `• Video ✅\n` : `• Video ❌\n`;
      msg += prop.gps_link ? `• Ubicación ✅\n` : `• Ubicación ❌\n`;
      msg += prop.matterport_link ? `• Recorrido 3D ✅` : `• Recorrido 3D ❌`;
      
      await this.twilio.sendWhatsAppMessage(from, msg);
    }
    
    console.log('✅ Material enviado:', materialesEnviados, 'items para', nombreDesarrollo);
  }



  private async vendedorMetaAvance(from: string, vendedor: any, nombre: string): Promise<void> {
    // Obtener cierres del mes actual
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

    const { data: cierres, count } = await this.supabase.client
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('assigned_to', vendedor.id)
      .eq('status', 'sold')
      .gte('updated_at', inicioMes);

    const { count: citasAgendadas } = await this.supabase.client
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('team_member_id', vendedor.id)
      .gte('date', inicioMes);

    const metaMensual = vendedor.monthly_goal || 3; // Default 3 cierres
    const cierresMes = count || 0;
    const porcentaje = Math.round((cierresMes / metaMensual) * 100);

    let emoji = 'ðŸ”´';
    let mensaje = 'Necesitas acelerar';
    if (porcentaje >= 100) { emoji = '😢'; mensaje = '¡Vas arriba! 🎉'; }
    else if (porcentaje >= 70) { emoji = '😡'; mensaje = 'Vas bien, sigue así'; }
    else if (porcentaje >= 50) { emoji = 'ðŸŸ '; mensaje = 'A medio camino'; }

    const respuesta = `📊 *Tu avance ${nombre}:*

${emoji} *${porcentaje}%* de tu meta mensual

✅ Cierres: *${cierresMes}* de ${metaMensual}
📅 Citas este mes: *${citasAgendadas || 0}*

${mensaje}`;

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

  private async vendedorResumenLeads(from: string, vendedor: any, nombre: string): Promise<void> {
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .in('status', ['new', 'contacted', 'scheduled']);

    const hot = leads?.filter((l: any) => l.lead_category?.toUpperCase() === 'HOT').length || 0;
    const warm = leads?.filter((l: any) => l.lead_category?.toUpperCase() === 'WARM').length || 0;
    const cold = leads?.filter((l: any) => l.lead_category?.toUpperCase() === 'COLD').length || 0;
    const total = leads?.length || 0;

    const respuesta = `📋 *Tus leads activos ${nombre}:*

🔥 HOT: *${hot}* ${hot > 0 ? 'â† ¡Atender YA!' : ''}
😡 WARM: *${warm}*
â„ï¸ COLD: *${cold}*
â”â”â”â”â”â”â”â”â”â”â”â”
📊 Total: *${total}* leads

${hot > 0 ? '💡 _Tip: Los HOT tienen alta probabilidad de cierre. ¡Llámalos hoy!_' : ''}`;

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

  private async vendedorPendientes(from: string, vendedor: any, nombre: string): Promise<void> {
    // Leads sin contactar en más de 3 días
    const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pendientes } = await this.supabase.client
      .from('leads')
      .select('name, phone, temperature, updated_at')
      .eq('assigned_to', vendedor.id)
      .in('status', ['new', 'contacted'])
      .lt('updated_at', hace3Dias)
      .order('temperature', { ascending: false })
      .limit(5);

    if (!pendientes || pendientes.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 
        `✅ *${nombre}, no tienes pendientes urgentes!*

Todos tus leads han sido contactados recientemente. ¡Sigue así! 💪`
      );
      return;
    }

    let respuesta = `⏰ *Pendientes de follow-up ${nombre}:*
`;

    pendientes.forEach((lead: any, i: number) => {
      const temp = lead.temperature === 'HOT' ? '🔥' : lead.temperature === 'WARM' ? '😡' : 'â„ï¸';
      const dias = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      respuesta += `
${i + 1}. ${temp} *${lead.name || 'Sin nombre'}*`;
      respuesta += `
   📱 ${lead.phone} â€¢ ${dias} días sin contacto`;
    });

    respuesta += `

💡 _Llama primero a los 🔥_`;
    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }


  // ═══════════════════════════════════════════════════════════
  // MODO ASISTENTE ASESOR HIPOTECARIO
  // ═══════════════════════════════════════════════════════════

  private async handleAsesorMessage(from: string, body: string, asesor: any, teamMembers: any[]): Promise<void> {
    const mensaje = body.toLowerCase().trim();
    const nombreAsesor = asesor.name?.split(' ')[0] || 'crack';

    // 1. Briefing
    if (mensaje.includes('briefing') || mensaje.includes('buenos días') || mensaje.includes('buen dia') || mensaje === 'hola') {
      await this.asesorBriefing(from, asesor, nombreAsesor);
      return;
    }

    // 2. Respuestas de estatus: "Aprobado Juan", "Rechazado Juan", etc.
    const respuestaMatch = body.match(/^(aprobado|rechazado|documentos|en proceso)\s+(.+)$/i);
    if (respuestaMatch) {
      const accion = respuestaMatch[1].toLowerCase();
      const nombreCliente = respuestaMatch[2].trim();
      
      const { data: solicitud } = await this.supabase.client
        .from('mortgage_applications')
        .select('*, leads!mortgage_applications_lead_id_fkey(assigned_to, team_members!leads_assigned_to_fkey(phone, name))')
        .eq('assigned_advisor_id', asesor.id)
        .ilike('lead_name', '%' + nombreCliente + '%')
        .in('status', ['pending', 'in_review', 'sent_to_bank'])
        .single();
      
      if (!solicitud) {
        await this.twilio.sendWhatsAppMessage(from, 
          '❌ No encontré crédito activo para "' + nombreCliente + '".');
        return;
      }
      
      let nuevoStatus = solicitud.status;
      let emoji = '📋';
      
      if (accion === 'aprobado') { nuevoStatus = 'approved'; emoji = '✅'; }
      else if (accion === 'rechazado') { nuevoStatus = 'rejected'; emoji = '❌'; }
      else if (accion === 'documentos') { nuevoStatus = 'pending'; emoji = '📄'; }
      else if (accion === 'en proceso') { nuevoStatus = 'in_review'; emoji = '⏳'; }
      
      await this.supabase.client
        .from('mortgage_applications')
        .update({ 
          status: nuevoStatus, 
          updated_at: new Date().toISOString(),
          advisor_reminder_sent: false,
          escalated_to_vendor: false
        })
        .eq('id', solicitud.id);
      
      // Notificar al vendedor
      const vendedor = solicitud.leads?.team_members;
      if (vendedor?.phone) {
        const vPhone = vendedor.phone.replace(/[^0-9]/g, '');
        const vFormatted = vPhone.startsWith('52') ? vPhone : '52' + vPhone.slice(-10);
        await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(vFormatted),
          emoji + ' *Actualización de crédito*\n\n' +
          '*' + solicitud.lead_name + '*\n' +
          '🏦 ' + (solicitud.bank || 'Sin banco') + '\n' +
          '📊 Estatus: *' + nuevoStatus + '*\n' +
          '👔 Asesor: ' + asesor.name);
      }
      
      await this.twilio.sendWhatsAppMessage(from,
        emoji + ' Actualizado *' + solicitud.lead_name + '* a *' + nuevoStatus + '*. Se notificó al vendedor.');
      return;
    }

    // 3. Mis leads
    if (mensaje.includes('lead') || mensaje.includes('cliente') || mensaje.includes('prospectos')) {
      await this.asesorMisLeads(from, asesor, nombreAsesor);
      return;
    }

    // 3. Pendientes
    if (mensaje.includes('pendiente') || mensaje.includes('seguimiento')) {
      await this.asesorPendientes(from, asesor, nombreAsesor);
      return;
    }

    // 4. Citas
    if (mensaje.includes('cita') && (mensaje.includes('hoy') || mensaje.includes('tengo'))) {
      await this.asesorCitasHoy(from, asesor, nombreAsesor);
      return;
    }

    // 5. FUNNEL: "Juan pasó a revisión/banco/aprobado"
    if (mensaje.includes('pasó a') || mensaje.includes('paso a') || mensaje.includes('enviar a') || mensaje.includes('enviado a')) {
      await this.asesorMoverFunnel(from, body, asesor, nombreAsesor);
      return;
    }

    // 6. Aprobado: "Aprobado Juan" o "Juan aprobado"
    if (mensaje.includes('aprobado') || mensaje.includes('aprobó')) {
      await this.asesorAprobar(from, body, asesor, nombreAsesor);
      return;
    }

    // 7. Rechazado ON: "Rechazado on Juan" (puede reintentar)
    if (mensaje.includes('rechazado on') || mensaje.includes('rechazar on')) {
      await this.asesorRechazarOn(from, body, asesor, nombreAsesor);
      return;
    }

    // 8. Rechazado OFF: "Rechazado off Juan" (definitivo)
    if (mensaje.includes('rechazado off') || mensaje.includes('rechazar off') || mensaje.includes('rechazado definitivo')) {
      await this.asesorRechazarOff(from, body, asesor, nombreAsesor);
      return;
    }

    // 9. Agendar cita: "Cita mañana 10am con Juan en oficina"
    if ((mensaje.includes('cita') && (mensaje.includes('mañana') || mensaje.includes('lunes') || mensaje.includes('martes') || mensaje.includes('miércoles') || mensaje.includes('jueves') || mensaje.includes('viernes'))) || mensaje.includes('agendar')) {
      await this.asesorAgendarCita(from, body, asesor, nombreAsesor);
      return;
    }

    // 7. Nota
    if (mensaje.includes('nota ') || mensaje.includes('apunte ')) {
      await this.asesorAgregarNota(from, body, asesor, nombreAsesor);
      return;
    }

    // ADELANTE: "Juan adelante" - mover al siguiente paso del funnel hipotecario
    const matchAdelante = body.match(/([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:adelante|siguiente|avanzar)/i);
    if (matchAdelante) {
      const nombreCliente = matchAdelante[1].trim();
      const { data: solicitud } = await this.supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('assigned_advisor_id', asesor.id)
        .ilike('lead_name', '%' + nombreCliente + '%')
        .not('status', 'in', '("approved","rejected")')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!solicitud) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré crédito activo para "${nombreCliente}".`);
        return;
      }
      
      const funnelHipoteca = ['pending', 'in_review', 'sent_to_bank', 'approved'];
      const funnelLabels: Record<string, string> = {
        'pending': '📄 PENDIENTE',
        'in_review': '🔍 EN REVISIÓN',
        'sent_to_bank': '🏦 ENVIADO A BANCO',
        'approved': '✅ APROBADO'
      };
      
      const currentIndex = funnelHipoteca.indexOf(solicitud.status);
      if (currentIndex === -1 || currentIndex >= funnelHipoteca.length - 1) {
        await this.twilio.sendWhatsAppMessage(from, `*${solicitud.lead_name}* ya está en la última etapa (${funnelLabels[solicitud.status] || solicitud.status})`);
        return;
      }
      
      const siguienteEtapa = funnelHipoteca[currentIndex + 1];
      await this.supabase.client
        .from('mortgage_applications')
        .update({ status: siguienteEtapa, updated_at: new Date().toISOString() })
        .eq('id', solicitud.id);
      
      await this.twilio.sendWhatsAppMessage(from, 
        `✅ *${solicitud.lead_name}* movido a ${funnelLabels[siguienteEtapa]}`);
      return;
    }

    // ATRÁS: "Juan atrás" - regresar al paso anterior del funnel hipotecario
    const matchAtras = body.match(/([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)\s+(?:atras|atrás|regresar|anterior)/i);
    if (matchAtras) {
      const nombreCliente = matchAtras[1].trim();
      const { data: solicitud } = await this.supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('assigned_advisor_id', asesor.id)
        .ilike('lead_name', '%' + nombreCliente + '%')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!solicitud) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré crédito para "${nombreCliente}".`);
        return;
      }
      
      const funnelHipoteca = ['pending', 'in_review', 'sent_to_bank', 'approved'];
      const funnelLabels: Record<string, string> = {
        'pending': '📄 PENDIENTE',
        'in_review': '🔍 EN REVISIÓN',
        'sent_to_bank': '🏦 ENVIADO A BANCO',
        'approved': '✅ APROBADO'
      };
      
      const currentIndex = funnelHipoteca.indexOf(solicitud.status);
      if (currentIndex <= 0) {
        await this.twilio.sendWhatsAppMessage(from, `*${solicitud.lead_name}* ya está en la primera etapa (${funnelLabels[solicitud.status] || solicitud.status})`);
        return;
      }
      
      const anteriorEtapa = funnelHipoteca[currentIndex - 1];
      await this.supabase.client
        .from('mortgage_applications')
        .update({ status: anteriorEtapa, updated_at: new Date().toISOString() })
        .eq('id', solicitud.id);
      
      await this.twilio.sendWhatsAppMessage(from, 
        `⬅️ *${solicitud.lead_name}* regresado a ${funnelLabels[anteriorEtapa]}`);
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // COMANDOS ASESOR MEJORADOS
    // ═══════════════════════════════════════════════════════════════

    // RESUMEN: "resumen" / "dashboard"
    if (mensaje === 'resumen' || mensaje === 'dashboard' || mensaje === 'kpis') {
      await this.asesorResumen(from, asesor, nombreAsesor);
      return;
    }

    // EN BANCO: "en banco" / "enviados" / "esperando respuesta"
    if (mensaje.includes('en banco') || mensaje === 'enviados' || mensaje.includes('esperando')) {
      await this.asesorEnBanco(from, asesor, nombreAsesor);
      return;
    }

    // RECHAZADOS: "rechazados" / "para reintentar"
    if (mensaje === 'rechazados' || mensaje.includes('reintentar')) {
      await this.asesorRechazados(from, asesor, nombreAsesor);
      return;
    }

    // SIMULAR: "simular 2.5m 15 años" / "calcular credito"
    const simularMatch = body.match(/(?:simular|calcular|credito|crédito)\s*(\d+(?:\.\d+)?)\s*(?:m|millones?)?\s*(?:a\s*)?(\d+)?\s*(?:años?)?/i);
    if (simularMatch || mensaje.includes('simular') || mensaje.includes('calculadora')) {
      await this.asesorSimular(from, simularMatch, nombreAsesor);
      return;
    }

    // HOY: "hoy" - Resumen rápido
    if (mensaje === 'hoy') {
      await this.asesorHoy(from, asesor, nombreAsesor);
      return;
    }

    // BANCOS: "bancos" / "distribución por banco"
    if (mensaje === 'bancos' || mensaje.includes('por banco') || mensaje.includes('distribución')) {
      await this.asesorPorBanco(from, asesor, nombreAsesor);
      return;
    }

    // 8. Ayuda
    await this.asesorAyuda(from, nombreAsesor);
  }

  private async asesorBriefing(from: string, asesor: any, nombre: string): Promise<void> {
    const hoy = new Date().toISOString().split('T')[0];

    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*')
      .eq('asesor_id', asesor.id)
      .eq('status', 'scheduled')
      .eq('scheduled_date', hoy);

    const { data: pendientes } = await this.supabase.client
      .from('leads')
      .select('name, phone')
      .eq('needs_credit', true)
      .is('mortgage_status', null)
      .limit(5);

    let resp = `â˜€ï¸ *Buenos días ${nombre}!*\n\n`;
    resp += citas?.length ? `📅 *Citas hoy:* ${citas.length}\n` : `📅 Sin citas hoy\n`;
    resp += pendientes?.length ? `⏳ *Pendientes:* ${pendientes.length}\n` : ``;
    resp += `\n💡 Escribe *"ayuda"* para comandos`;

    await this.twilio.sendWhatsAppMessage(from, resp);
  }

  private async asesorMisLeads(from: string, asesor: any, nombre: string): Promise<void> {
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('name, phone, mortgage_status')
      .eq('needs_credit', true)
      .limit(10);

    const pendientes = leads?.filter((l: any) => !l.mortgage_status).length || 0;
    const aprobados = leads?.filter((l: any) => l.mortgage_status === 'precalificado').length || 0;

    let resp = `📋 *Leads ${nombre}:*\n\n⏳ Pendientes: *${pendientes}*\n✅ Aprobados: *${aprobados}*`;
    await this.twilio.sendWhatsAppMessage(from, resp);
  }

  private async asesorPendientes(from: string, asesor: any, nombre: string): Promise<void> {
    const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pend } = await this.supabase.client
      .from('leads')
      .select('name, phone')
      .eq('needs_credit', true)
      .is('mortgage_status', null)
      .lt('updated_at', hace7Dias)
      .limit(5);

    if (!pend?.length) {
      await this.twilio.sendWhatsAppMessage(from, `✅ *${nombre}*, sin pendientes urgentes! 💪`);
      return;
    }

    let resp = `⏰ *Pendientes ${nombre}:*\n`;
    pend.forEach((l: any, i: number) => { resp += `${i+1}. ${l.name}\n`; });
    await this.twilio.sendWhatsAppMessage(from, resp);
  }

  private async asesorCitasHoy(from: string, asesor: any, nombre: string): Promise<void> {
    const hoy = new Date().toISOString().split('T')[0];

    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*')
      .eq('asesor_id', asesor.id)
      .eq('scheduled_date', hoy);

    if (!citas?.length) {
      await this.twilio.sendWhatsAppMessage(from, `📅 Sin citas hoy ${nombre}`);
      return;
    }

    let resp = `📅 *Citas hoy:*\n`;
    citas.forEach((c: any) => { resp += `â€¢ ${c.scheduled_time} - ${c.lead_name}\n`; });
    await this.twilio.sendWhatsAppMessage(from, resp);
  }

  private async asesorPrecalificar(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    const match = body.match(/(?:precalific|aprobado)[oa]?\s+(?:a\s+)?([a-záéíóúñ\s]+)/i);
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Precalificó Juan"*`);
      return;
    }

    const nombreLead = match[1].trim();
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name')
      .eq('needs_credit', true)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads?.length) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    await this.supabase.client
      .from('leads')
      .update({ mortgage_status: 'precalificado', updated_at: new Date().toISOString() })
      .eq('id', leads[0].id);

    await this.twilio.sendWhatsAppMessage(from, `✅ *${leads[0].name}* PRECALIFICADO! 🎉`);
  }

  private async asesorRechazar(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    const match = body.match(/(?:rechaz|no calific)[oa]?\s+(?:a\s+)?([a-záéíóúñ\s]+)/i);
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Rechazado Juan"*`);
      return;
    }

    const nombreLead = match[1].trim();
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name')
      .eq('needs_credit', true)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads?.length) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    await this.supabase.client
      .from('leads')
      .update({ mortgage_status: 'rechazado', updated_at: new Date().toISOString() })
      .eq('id', leads[0].id);

    await this.twilio.sendWhatsAppMessage(from, `❌ *${leads[0].name}* marcado como RECHAZADO`);
  }

  private async asesorAgregarNota(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    const match = body.match(/(?:nota|apunte)\s+([a-záéíóúñ\s]+?):\s*(.+)/i);
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Nota Juan: necesita docs"*`);
      return;
    }

    const nombreLead = match[1].trim();
    const texto = match[2].trim();

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, notes')
      .ilike('name', '%' + nombreLead + '%');

    if (!leads?.length) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    const lead = leads[0];
    const notas = lead.notes || {};
    const hist = notas.historial || [];
    hist.push({ fecha: new Date().toISOString(), texto, autor: nombre + ' (Asesor)' });

    await this.supabase.client
      .from('leads')
      .update({ notes: { ...notas, historial: hist }, updated_at: new Date().toISOString() })
      .eq('id', lead.id);

    await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Nota agregada a *${lead.name}*`);
  }

  private async asesorAyuda(from: string, nombre: string): Promise<void> {
    const ayuda = `🏦 *Comandos Asesor*

📊 *CONSULTAS:*
- *briefing* - Resumen del día
- *mis leads* - Ver leads
- *pendientes* - Sin seguimiento
- *citas hoy* - Tus citas

ðŸ“ *ACTUALIZAR:*
- *Precalificó Juan*
- *Rechazado Juan*
- *Nota Juan: texto*

¿En qué te ayudo ${nombre}?`;

    await this.twilio.sendWhatsAppMessage(from, ayuda);
  }

  // ═══════════════════════════════════════════════════════════════
  // FUNCIONES ASESOR MEJORADAS
  // ═══════════════════════════════════════════════════════════════

  private async asesorResumen(from: string, asesor: any, nombre: string): Promise<void> {
    try {
      const { data: solicitudes } = await this.supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('assigned_advisor_id', asesor.id);

      const total = solicitudes?.length || 0;
      const pending = solicitudes?.filter(s => s.status === 'pending').length || 0;
      const inReview = solicitudes?.filter(s => s.status === 'in_review').length || 0;
      const sentToBank = solicitudes?.filter(s => s.status === 'sent_to_bank').length || 0;
      const approved = solicitudes?.filter(s => s.status === 'approved').length || 0;
      const rejected = solicitudes?.filter(s => s.status === 'rejected').length || 0;
      const finalizados = approved + rejected;
      const tasaAprobacion = finalizados > 0 ? Math.round(approved / finalizados * 100) : 0;

      await this.twilio.sendWhatsAppMessage(from,
        `*📊 DASHBOARD HIPOTECARIO*\n${nombre}\n\n` +
        `*Pipeline:*\n` +
        `📄 Pendientes: ${pending}\n` +
        `🔍 En revisión: ${inReview}\n` +
        `🏦 En banco: ${sentToBank}\n` +
        `✅ Aprobados: ${approved}\n` +
        `❌ Rechazados: ${rejected}\n\n` +
        `*KPIs:*\n` +
        `• Total: ${total} | Tasa: ${tasaAprobacion}%`
      );
    } catch (e) {
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener resumen.');
    }
  }

  private async asesorEnBanco(from: string, asesor: any, nombre: string): Promise<void> {
    try {
      const { data: enBanco } = await this.supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('assigned_advisor_id', asesor.id)
        .eq('status', 'sent_to_bank')
        .order('updated_at', { ascending: true });

      if (!enBanco || enBanco.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `✅ ${nombre}, no tienes solicitudes en banco.`);
        return;
      }

      let msg = `*🏦 EN BANCO*\n${nombre}\n\n`;
      for (const s of enBanco.slice(0, 10)) {
        const dias = Math.floor((Date.now() - new Date(s.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        msg += `• *${s.lead_name}* - ${s.bank || 'N/A'} (${dias}d)\n`;
      }
      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener en banco.');
    }
  }

  private async asesorRechazados(from: string, asesor: any, nombre: string): Promise<void> {
    try {
      const { data: rechazados } = await this.supabase.client
        .from('mortgage_applications')
        .select('*')
        .eq('assigned_advisor_id', asesor.id)
        .eq('status', 'rejected')
        .limit(10);

      if (!rechazados || rechazados.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `✅ ${nombre}, no tienes rechazados.`);
        return;
      }

      let msg = `*❌ RECHAZADOS*\n${nombre}\n\n`;
      for (const s of rechazados) {
        msg += `• *${s.lead_name}* - ${s.bank || 'N/A'}\n`;
      }
      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener rechazados.');
    }
  }

  private async asesorSimular(from: string, match: RegExpMatchArray | null, nombre: string): Promise<void> {
    let monto = 2500000;
    let plazo = 20;
    if (match) {
      monto = parseFloat(match[1]) * 1000000;
      plazo = parseInt(match[2]) || 20;
    }
    const tasas = [
      { banco: 'BBVA', tasa: 10.5 },
      { banco: 'Santander', tasa: 11.0 },
      { banco: 'Banorte', tasa: 10.8 },
      { banco: 'Infonavit', tasa: 10.45 }
    ];
    let msg = `*💰 SIMULADOR*\n$${(monto/1000000).toFixed(1)}M a ${plazo} años\n\n`;
    for (const t of tasas) {
      const r = t.tasa / 100 / 12;
      const n = plazo * 12;
      const pago = monto * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      msg += `• ${t.banco}: $${Math.round(pago).toLocaleString()}/mes\n`;
    }
    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  private async asesorHoy(from: string, asesor: any, nombre: string): Promise<void> {
    const hoyStr = new Date().toISOString().split('T')[0];
    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*')
      .eq('asesor_id', asesor.id)
      .eq('scheduled_date', hoyStr);
    const { data: pendientes } = await this.supabase.client
      .from('mortgage_applications')
      .select('*')
      .eq('assigned_advisor_id', asesor.id)
      .in('status', ['pending', 'in_review']);
    await this.twilio.sendWhatsAppMessage(from,
      `☀️ *Hoy ${nombre}*\n\n` +
      `📅 Citas: ${citas?.length || 0}\n` +
      `📋 Pendientes: ${pendientes?.length || 0}`
    );
  }

  private async asesorPorBanco(from: string, asesor: any, nombre: string): Promise<void> {
    const { data: solicitudes } = await this.supabase.client
      .from('mortgage_applications')
      .select('bank, status')
      .eq('assigned_advisor_id', asesor.id);
    if (!solicitudes?.length) {
      await this.twilio.sendWhatsAppMessage(from, 'No tienes solicitudes.');
      return;
    }
    const porBanco: Record<string, number> = {};
    for (const s of solicitudes) {
      const banco = s.bank || 'Sin banco';
      porBanco[banco] = (porBanco[banco] || 0) + 1;
    }
    let msg = `*🏦 POR BANCO*\n${nombre}\n\n`;
    for (const [banco, count] of Object.entries(porBanco).sort((a, b) => b[1] - a[1])) {
      msg += `• ${banco}: ${count}\n`;
    }
    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  // ═══════════════════════════════════════════════════════════
  // FUNNEL HIPOTECARIO
  // ═══════════════════════════════════════════════════════════

  private async asesorMoverFunnel(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    // "Juan pasó a revisión" o "Enviar Juan a BBVA"
    const matchReview = body.match(/([a-záéíóúñ\s]+?)\s*(?:pasó a|paso a)\s*(revisión|revision|revisar)/i);
    const matchBank = body.match(/(?:enviar|enviado)\s+(?:a\s+)?([a-záéíóúñ\s]+?)\s+(?:a|al?)\s+(bbva|santander|banorte|hsbc|banamex|infonavit|fovissste|banregio|scotiabank)/i);
    const matchBankAlt = body.match(/([a-záéíóúñ\s]+?)\s*(?:pasó a|paso a|enviado a)\s*(banco|bbva|santander|banorte|hsbc|banamex|infonavit|fovissste|banregio|scotiabank)/i);

    let nombreLead = '';
    let nuevaEtapa = '';
    let banco = '';

    if (matchReview) {
      nombreLead = matchReview[1].trim();
      nuevaEtapa = 'in_review';
    } else if (matchBank) {
      nombreLead = matchBank[1].trim();
      nuevaEtapa = 'sent_to_bank';
      banco = matchBank[2].toUpperCase();
    } else if (matchBankAlt) {
      nombreLead = matchBankAlt[1].trim();
      nuevaEtapa = 'sent_to_bank';
      banco = matchBankAlt[2].toUpperCase();
    } else {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe:\nâ€¢ *"Juan pasó a revisión"*\nâ€¢ *"Enviar Juan a BBVA"*`);
      return;
    }

    // Buscar solicitud
    const { data: solicitudes } = await this.supabase.client
      .from('mortgage_applications')
      .select('*')
      .ilike('lead_name', '%' + nombreLead + '%');

    if (!solicitudes?.length) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré solicitud de *${nombreLead}*`);
      return;
    }

    const sol = solicitudes[0];
    const updateData: any = { 
      status: nuevaEtapa, 
      updated_at: new Date().toISOString() 
    };

    if (nuevaEtapa === 'in_review') {
      updateData.in_review_at = new Date().toISOString();
    } else if (nuevaEtapa === 'sent_to_bank') {
      updateData.sent_to_bank_at = new Date().toISOString();
      if (banco) updateData.bank = banco;
    }

    await this.supabase.client
      .from('mortgage_applications')
      .update(updateData)
      .eq('id', sol.id);

    const etapaTexto = nuevaEtapa === 'in_review' ? 'EN REVISIÓN 📋' : `ENVIADO A ${banco || 'BANCO'} 🏦`;
    await this.twilio.sendWhatsAppMessage(from, `✅ *${sol.lead_name}* movido a *${etapaTexto}*`);
  }

  private async asesorAprobar(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    const match = body.match(/(?:aprobado|aprobó)\s+([a-záéíóúñ\s]+)|([a-záéíóúñ\s]+?)\s+(?:aprobado|aprobó)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Aprobado Juan"* o *"Juan aprobado"*`);
      return;
    }

    const nombreLead = (match[1] || match[2]).trim();

    const { data: solicitudes } = await this.supabase.client
      .from('mortgage_applications')
      .select('*')
      .ilike('lead_name', '%' + nombreLead + '%');

    if (!solicitudes?.length) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré solicitud de *${nombreLead}*`);
      return;
    }

    const sol = solicitudes[0];

    await this.supabase.client
      .from('mortgage_applications')
      .update({ 
        status: 'approved', 
        decision_at: new Date().toISOString(),
        updated_at: new Date().toISOString() 
      })
      .eq('id', sol.id);

    // Notificar al vendedor si existe
    if (sol.lead_id) {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('assigned_to')
        .eq('id', sol.lead_id)
        .single();

      if (lead?.assigned_to) {
        const { data: vendedor } = await this.supabase.client
          .from('team_members')
          .select('phone, name')
          .eq('id', lead.assigned_to)
          .single();

        if (vendedor?.phone) {
          const vendedorPhone = vendedor.phone.replace(/\D/g, '');
          await this.twilio.sendWhatsAppMessage(
            vendedorPhone,
            `🎉 *¡Buenas noticias!*\n\n*${sol.lead_name}* fue APROBADO por ${sol.bank || 'el banco'}!\n\n💰 Monto: $${sol.requested_amount?.toLocaleString() || 'N/A'}\n\n¡Coordina la firma! 🏠`
          );
        }
      }
    }

    await this.twilio.sendWhatsAppMessage(from, `🎉 *${sol.lead_name}* APROBADO!\n\nVendedor notificado ✅`);
  }

  private async asesorRechazarOn(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    const match = body.match(/rechazado? on\s+([a-záéíóúñ\s]+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Rechazado on Juan"*\n(Puede reintentar después)`);
      return;
    }

    const nombreLead = match[1].trim();

    const { data: solicitudes } = await this.supabase.client
      .from('mortgage_applications')
      .select('*')
      .ilike('lead_name', '%' + nombreLead + '%');

    if (!solicitudes?.length) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré solicitud de *${nombreLead}*`);
      return;
    }

    const sol = solicitudes[0];

    await this.supabase.client
      .from('mortgage_applications')
      .update({ 
        status: 'rejected_on', 
        decision_at: new Date().toISOString(),
        status_notes: 'Rechazado ON - Puede reintentar',
        updated_at: new Date().toISOString() 
      })
      .eq('id', sol.id);

    await this.twilio.sendWhatsAppMessage(from, `âš ï¸ *${sol.lead_name}* marcado *RECHAZADO ON*\n\nPuede reintentar en el futuro.`);
  }

  private async asesorRechazarOff(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    const match = body.match(/rechazado? (?:off|definitivo)\s+([a-záéíóúñ\s]+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Rechazado off Juan"*\n(Definitivo, sin opción)`);
      return;
    }

    const nombreLead = match[1].trim();

    const { data: solicitudes } = await this.supabase.client
      .from('mortgage_applications')
      .select('*')
      .ilike('lead_name', '%' + nombreLead + '%');

    if (!solicitudes?.length) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré solicitud de *${nombreLead}*`);
      return;
    }

    const sol = solicitudes[0];

    await this.supabase.client
      .from('mortgage_applications')
      .update({ 
        status: 'rejected_off', 
        decision_at: new Date().toISOString(),
        status_notes: 'Rechazado OFF - Definitivo',
        updated_at: new Date().toISOString() 
      })
      .eq('id', sol.id);

    // Notificar al vendedor
    if (sol.lead_id) {
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('assigned_to')
        .eq('id', sol.lead_id)
        .single();

      if (lead?.assigned_to) {
        const { data: vendedor } = await this.supabase.client
          .from('team_members')
          .select('phone')
          .eq('id', lead.assigned_to)
          .single();

        if (vendedor?.phone) {
          const vendedorPhone = vendedor.phone.replace(/\D/g, '');
          await this.twilio.sendWhatsAppMessage(
            vendedorPhone,
            `❌ *${sol.lead_name}* fue rechazado definitivamente.\n\nBusca otras opciones de pago o propiedad.`
          );
        }
      }
    }

    await this.twilio.sendWhatsAppMessage(from, `❌ *${sol.lead_name}* RECHAZADO OFF (definitivo)\n\nVendedor notificado.`);
  }

  private async asesorAgendarCita(from: string, body: string, asesor: any, nombre: string): Promise<void> {
    // Extraer teléfono si viene
    const matchTelefono = body.match(/(\d{10})/);
    const telefono = matchTelefono ? matchTelefono[1] : null;

    // Extraer nombre - más flexible
    let nombreLead = '';
    const matchNombreConTel = body.match(/(?:con|para)\s+([a-záéíóúñ\s]+?)\s+\d{10}/i);
    const matchNombreSinTel = body.match(/(?:cita|agendar).*?(?:con|para)\s+([a-záéíóúñ\s]+?)(?:\s+(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|\d))/i);
    
    if (matchNombreConTel) {
      nombreLead = matchNombreConTel[1].trim();
    } else if (matchNombreSinTel) {
      nombreLead = matchNombreSinTel[1].trim();
    }

    const matchFecha = body.match(/(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)/i);
    const matchHora = body.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    const matchLugar = body.match(/(?:en|lugar:?)\s+([a-záéíóúñ\s]+?)(?:\s*$|\s+\d)/i);

    if (!nombreLead || !matchHora) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Cita mañana 10am con Juan 5512345678 en oficina"*`);
      return;
    }

    const lugar = matchLugar ? matchLugar[1].trim() : 'Oficina';

    // Buscar solicitud o lead existente
    let leadPhone = telefono || '';
    let leadName = nombreLead;
    let leadId = null;

    const { data: solicitudes } = await this.supabase.client
      .from('mortgage_applications')
      .select('lead_id, lead_name, lead_phone')
      .ilike('lead_name', '%' + nombreLead + '%');

    if (solicitudes?.length) {
      leadName = solicitudes[0].lead_name;
      leadPhone = solicitudes[0].lead_phone || leadPhone;
      leadId = solicitudes[0].lead_id;
    } else if (telefono) {
      // No existe, buscar por teléfono o crear lead nuevo
      const { data: leadExistente } = await this.supabase.client
        .from('leads')
        .select('id, name, phone')
        .eq('phone', telefono)
        .single();

      if (leadExistente) {
        leadId = leadExistente.id;
        leadName = leadExistente.name || nombreLead;
        leadPhone = leadExistente.phone;
        console.log('📱 Lead encontrado por teléfono:', leadName);
      } else {
        // Crear lead nuevo
        const { data: nuevoLead, error: errorLead } = await this.supabase.client
          .from('leads')
          .insert({
            name: nombreLead,
            phone: telefono,
            status: 'new',
            lead_category: 'WARM',
            source: 'asesor_referido',
            needs_credit: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (nuevoLead) {
          leadId = nuevoLead.id;
          leadPhone = telefono;
          console.log('✅ Lead creado por asesor:', nombreLead);
        }
      }
    }

    // Calcular fecha
    const fecha = new Date();
    if (matchFecha) {
      const dia = matchFecha[1].toLowerCase();
      if (dia === 'mañana') {
        fecha.setDate(fecha.getDate() + 1);
      } else if (dia !== 'hoy') {
        const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado'];
        const targetDay = dias.indexOf(dia) % 7;
        const currentDay = fecha.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        fecha.setDate(fecha.getDate() + daysToAdd);
      }
    }

    // Hora
    let hora = parseInt(matchHora[1]);
    const minutos = matchHora[2] ? parseInt(matchHora[2]) : 0;
    const ampm = matchHora[3].toLowerCase();
    if (ampm === 'pm' && hora < 12) hora += 12;
    if (ampm === 'am' && hora === 12) hora = 0;
    fecha.setHours(hora, minutos, 0, 0);

    const horaDB = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

    // Crear cita
    const { error } = await this.supabase.client
      .from('appointments')
      .insert({
        lead_name: leadName,
        lead_phone: leadPhone.replace(/\D/g, ''),
        property_name: lugar,
        asesor_id: asesor.id,
        asesor_name: asesor.name,
        scheduled_date: fecha.toISOString().split('T')[0],
        scheduled_time: horaDB,
        status: 'scheduled',
        appointment_type: 'hipoteca',
        duration_minutes: 60
      });

    if (error) {
      await this.twilio.sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
      return;
    }

    // Google Calendar
    try {
      const endFecha = new Date(fecha.getTime() + 60 * 60 * 1000);
      const formatDate = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
      };

      await this.calendar.createEvent({
        summary: `🏦 Hipoteca - ${leadName}`,
        description: `Cliente: ${leadName}\nTeléfono: ${leadPhone}\nLugar: ${lugar}`,
        location: lugar,
        start: { dateTime: formatDate(fecha), timeZone: 'America/Mexico_City' },
        end: { dateTime: formatDate(endFecha), timeZone: 'America/Mexico_City' }
      });
    } catch (e) {
      console.error('Error GCal:', e);
    }

    const fechaStr = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
    const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    await this.twilio.sendWhatsAppMessage(from, `✅ *Cita agendada:*\n\n📅 ${fechaStr}, ${horaStr}\n👤 ${leadName}\n📍 ${lugar}\n\nðŸ“† Agregada a tu calendario`);
  }



  // ═══════════════════════════════════════════════════════════
  // MOTIVO DE CAÍDA
  // ═══════════════════════════════════════════════════════════

  private async vendedorMotivoRespuesta(from: string, opcion: string, vendedor: any): Promise<void> {
    // Buscar lead con pending_fallen_reason
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .eq('status', 'fallen')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `No encontré un lead caído reciente.`);
      return;
    }

    const lead = leads[0];
    const motivos: any = {
      '1': 'Rechazaron crédito',
      '2': 'Se arrepintió',
      '3': 'Problemas de precio'
    };

    // Si elige 4, pedir motivo personalizado
    if (opcion === '4') {
      const notasActuales = lead.notes || {};
      notasActuales.pending_custom_reason = true;
      
      await this.supabase.client
        .from('leads')
        .update({ notes: notasActuales })
        .eq('id', lead.id);

      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ ¿Cuál fue el motivo? Escríbelo:`);
      return;
    }

    const motivo = motivos[opcion] || 'Otro';

    // Guardar motivo en notes
    const notasActuales = lead.notes || {};
    notasActuales.fallen_reason = motivo;
    notasActuales.fallen_date = new Date().toISOString();
    delete notasActuales.pending_fallen_reason;

    await this.supabase.client
      .from('leads')
      .update({ 
        notes: notasActuales,
        fallen_reason: motivo,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Guardado: *${lead.name}* se cayó por *${motivo}*`);
  }

  private async vendedorMotivoCustom(from: string, motivo: string, vendedor: any): Promise<void> {
    // Buscar lead esperando motivo custom
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .eq('status', 'fallen')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (!leads || leads.length === 0 || !leads[0].notes?.pending_custom_reason) {
      return; // No hay lead esperando motivo
    }

    const lead = leads[0];
    const notasActuales = lead.notes || {};
    notasActuales.fallen_reason = motivo;
    notasActuales.fallen_date = new Date().toISOString();
    delete notasActuales.pending_custom_reason;
    delete notasActuales.pending_fallen_reason;

    await this.supabase.client
      .from('leads')
      .update({ 
        notes: notasActuales,
        fallen_reason: motivo,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Guardado: *${lead.name}* se cayó por *${motivo}*`);
  }

  // ═══════════════════════════════════════════════════════════
  // FUNNEL VENDEDOR - CAMBIO DE ETAPAS
  // ═══════════════════════════════════════════════════════════

  // Función auxiliar para cambiar etapa por nombre
  private async vendedorCambiarEtapaConNombre(from: string, nombreLead: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
    // Buscar lead por nombre
    // Admin/coordinador puede mover CUALQUIER lead, vendedor solo los suyos
    let query = this.supabase.client
      .from('leads')
      .select('id, name, phone, status, assigned_to')
      .ilike('name', '%' + nombreLead + '%')
      .order('updated_at', { ascending: false });
    
    if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
      query = query.eq('assigned_to', vendedor.id);
    }
    
    const { data: leads } = await query;

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads`);
      return;
    }

    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads:\n`;
      leads.forEach((l: any, i: number) => {
        msg += `${i+1}. ${l.name} (...${l.phone?.slice(-4)}) - ${l.status}\n`;
      });
      msg += `\nEscribe el nombre completo.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];
    console.log('📝 Moviendo lead:', lead.name, 'de', lead.status, 'a', nuevaEtapa);

    // Calcular score basado en FUNNEL (igual que index.ts)
    const statusScores: Record<string, number> = {
      'new': 10,
      'contacted': 20,
      'scheduled': 35,
      'visited': 50,
      'negotiation': 70,
      'reserved': 85,
      'closed': 100,
      'delivered': 100
    };
    
    const newScore = statusScores[nuevaEtapa] || 10;
    const oldStatus = lead.status;

    // Calcular temperatura basada en etapa
    const etapasHot = ['negotiation', 'reserved'];
    const etapasCliente = ['closed', 'delivered'];
    let nuevaCategoria = 'COLD';
    if (etapasCliente.includes(nuevaEtapa)) nuevaCategoria = 'CLIENTE';
    else if (etapasHot.includes(nuevaEtapa)) nuevaCategoria = 'HOT';
    else if (newScore >= 35) nuevaCategoria = 'WARM';

    // Actualizar en Supabase
    const { error } = await this.supabase.client
      .from('leads')
      .update({ 
        status: nuevaEtapa,
        status_changed_at: new Date().toISOString(),
        stalled_alert_sent: false,
        updated_at: new Date().toISOString(),
        score: newScore,
        lead_score: newScore,
        lead_category: nuevaCategoria
      })
      .eq('id', lead.id);
    
    if (error) {
      console.log('❌ Error actualizando lead:', error);
      await this.twilio.sendWhatsAppMessage(from, `Error al mover ${lead.name}`);
      return;
    }
    
    console.log('✅ Lead actualizado:', lead.name, '- Score:', newScore, 'Temp:', nuevaCategoria);

    // NOTIFICAR AL VENDEDOR ASIGNADO (si existe y no es quien hizo el cambio)
    if (lead.assigned_to && lead.assigned_to !== vendedor.id) {
      try {
        const { data: vendedorAsignado } = await this.supabase.client
          .from('team_members')
          .select('name, phone')
          .eq('id', lead.assigned_to)
          .single();
        
        if (vendedorAsignado?.phone) {
          const statusEmojis: Record<string, string> = {
            'new': '🆕 NUEVO',
            'contacted': '📞 CONTACTADO',
            'scheduled': '📅 CITA',
            'visited': '🏠 VISITÓ',
            'negotiation': '💰 NEGOCIACIÓN',
            'reserved': '📝 RESERVADO',
            'closed': '✅ CERRADO',
            'delivered': '🔑 ENTREGADO',
            'fallen': '❌ CAÍDO'
          };
          
          const statusAnterior = statusEmojis[oldStatus] || oldStatus;
          const statusNuevo = statusEmojis[nuevaEtapa] || nuevaEtapa;
          
          const mensaje = `📊 *LEAD ACTUALIZADO*
━━━━━━━━━━━━━━━━━━━━

👤 *${lead.name}*
📱 ${lead.phone}

${statusAnterior} → ${statusNuevo}

🎯 Score: ${newScore}
👔 Movido por: ${vendedor.name}`;
          
          await this.twilio.sendWhatsAppMessage(vendedorAsignado.phone, mensaje);
          console.log('📤 Notificación enviada al vendedor:', vendedorAsignado.name);
        }
      } catch (e) {
        console.log('⚠️ Error notificando vendedor:', e);
      }
    }

    // PROGRAMAR FOLLOW-UPS automáticos según nuevo status
    try {
      const followupService = new FollowupService(this.supabase);
      await followupService.programarFollowups(lead.id, lead.phone || '', lead.name, 'Por definir', 'status_change', nuevaEtapa);
      console.log(`📬 Follow-ups programados para ${lead.name} (${nuevaEtapa})`);
    } catch (e) {
      console.log('⚠️ Error programando follow-ups:', e);
    }

    await this.twilio.sendWhatsAppMessage(from, `✅ *${lead.name}* movido a ${etapaTexto}`);
  }

  private async vendedorCambiarEtapa(from: string, body: string, vendedor: any, nuevaEtapa: string, etapaTexto: string): Promise<void> {
    // Extraer nombre del lead
    const match = body.match(/([a-záéíóúñA-ZÍÉÍÓÚÑ0-9 ]+)\s+(?:reserv|apart|cerr|escritur|entreg|se cay|cayo|cayó|cancel)/i) ||
                  body.match(/(?:reserv|apart|cerr|escritur|entreg|se cay|cayo|cayó|cancel)[oóa]*\s+(?:a\s+)?([a-záéíóúñ\s]+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe el nombre: *"Juan reservó"* o *"Reservó Juan"*`);
      return;
    }

    const nombreLead = match[1].trim();

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, status')
      .eq('assigned_to', vendedor.id)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}* en tus leads`);
      return;
    }

    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads:\n`;
      leads.forEach((l: any, i: number) => {
        msg += `${i+1}. ${l.name} (...${l.phone?.slice(-4)}) - ${l.status}\n`;
      });
      msg += `\nEscribe el nombre completo.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Actualizar etapa
    await this.supabase.client
      .from('leads')
      .update({ 
        status: nuevaEtapa,
        status_changed_at: new Date().toISOString(),
        stalled_alert_sent: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    // PROGRAMAR FOLLOW-UPS automáticos según nuevo status
    try {
      const followupService = new FollowupService(this.supabase);
      await followupService.programarFollowups(lead.id, lead.phone || '', lead.name, 'Por definir', 'status_change', nuevaEtapa);
      console.log(`ðŸ“¬ Follow-ups programados para ${lead.name} (${nuevaEtapa})`);
    } catch (e) {
      console.log('âš ï¸ Error programando follow-ups:', e);
    }

    let respuesta = `✅ *${lead.name}* movido a ${etapaTexto}`;

    // Si es entregado, es VENTA REAL
    if (nuevaEtapa === 'delivered') {
      await this.supabase.client
        .from('leads')
        .update({ 
          delivery_date: new Date().toISOString().split('T')[0],
          survey_step: 1
        })
        .eq('id', lead.id);
      
      // Enviar encuesta al cliente
      const leadPhone = lead.phone.replace(/[^0-9]/g, '');
      const leadFormatted = leadPhone.startsWith('52') ? leadPhone : '52' + leadPhone.slice(-10);
      await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(leadFormatted),
        '🏠✨ *¡Felicidades ' + (lead.name?.split(' ')[0] || '') + '!*\n\n' +
        'Bienvenido a nuestra familia. Estamos muy felices de haberte acompañado en este paso tan importante.\n\n' +
        'Queremos mantenernos cerca de ti para:\n' +
        '🎚 Celebrar tus fechas especiales\n' +
        '🎉 Invitarte a eventos exclusivos\n' +
        '💡 Compartirte tips para tu nuevo hogar\n' +
        '🎁 Darte beneficios especiales\n\n' +
        '¿Me regalas 1 minuto? 🙏\n' +
        'Responde *SÍ* para continuar');
      
      respuesta = `🎉🔑 *¡VENTA CERRADA!*\n\n*${lead.name}* recibió sus llaves!\n\n¡Felicidades! 🏆\n\n📤 Ya le envié la encuesta de satisfacción.`;
    }

    // Si se cayó, preguntar motivo al vendedor Y enviar encuesta al lead
    if (nuevaEtapa === 'fallen') {
      respuesta = `❌ *${lead.name}* marcado como CAÍDO\n\n¿Por qué se cayó?\n1. Rechazaron crédito\n2. Se arrepintió\n3. Problemas de precio\n4. Otro`;
      
      await this.supabase.client
        .from('leads')
        .update({ 
          notes: { ...(lead.notes || {}), pending_fallen_reason: true },
          survey_step: 10
        })
        .eq('id', lead.id);
      
      // Enviar encuesta al lead caído
      if (lead.phone) {
        const leadPhone = lead.phone.replace(/[^0-9]/g, '');
        const leadFormatted = leadPhone.startsWith('52') ? leadPhone : '52' + leadPhone.slice(-10);
        await this.twilio.sendWhatsAppMessage(this.formatPhoneMX(leadFormatted),
          'Hola *' + (lead.name?.split(' ')[0] || '') + '*,\n\n' +
          'Lamentamos que no se haya concretado en esta ocasión. Tu opinión nos ayuda mucho a mejorar.\n\n' +
          '¿Me regalas 1 minuto? 🙏\n' +
          'Responde *SÍ* para continuar');
        
        respuesta += '\n\n📤 Ya le envié encuesta de retroalimentación al cliente.';
      }
    }

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

  // ═══════════════════════════════════════════════════════════
  // HIPOTECA - ENVIAR A BANCO
  // ═══════════════════════════════════════════════════════════

  private async vendedorEnviarABanco(from: string, body: string, vendedor: any): Promise<void> {
    // Extraer nombre y banco
    const bancos = ['bbva', 'santander', 'banorte', 'hsbc', 'infonavit', 'fovissste', 'banamex', 'scotiabank', 'banregio'];
    let bancoEncontrado = '';
    for (const b of bancos) {
      if (body.toLowerCase().includes(b)) {
        bancoEncontrado = b.toUpperCase();
        break;
      }
    }

    const matchNombre = body.match(/(?:manda|envia|envía)\s+(?:a\s+)?([a-záéíóúñ\s]+?)\s+(?:a\s+)?(?:bbva|santander|banorte|hsbc|infonavit|fovissste|banamex|scotiabank|banregio)/i);
    
    if (!matchNombre) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ“ Escribe: *"Manda Juan a BBVA"*`);
      return;
    }

    const nombreLead = matchNombre[1].trim();

    // Buscar lead
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    const lead = leads[0];

    // Buscar asesor de ese banco
    const { data: asesores } = await this.supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'asesor')
      .select('*')  // TEMP: removed active filter
      .ilike('name', '%' + bancoEncontrado + '%');

    let asesorAsignado = asesores?.[0] || null;

    // Si no hay asesor específico del banco, buscar cualquier asesor
    if (!asesorAsignado) {
      const { data: cualquierAsesor } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('role', 'asesor')
        .select('*')  // TEMP: removed active filter
        .limit(1);
      asesorAsignado = cualquierAsesor?.[0];
    }

    // Crear solicitud hipotecaria
    const { data: solicitud, error } = await this.supabase.client
      .from('mortgage_applications')
      .insert({
        lead_id: lead.id,
        lead_name: lead.name,
        lead_phone: lead.phone,
        bank: bancoEncontrado,
        status: 'pending',
        pending_at: new Date().toISOString(),
        assigned_advisor_id: asesorAsignado?.id,
        assigned_advisor_name: asesorAsignado?.name,
        requested_amount: lead.budget,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      await this.twilio.sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
      return;
    }

    // Actualizar lead
    await this.supabase.client
      .from('leads')
      .update({ 
        needs_credit: true,
        credit_status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    // Notificar al asesor si existe
    if (asesorAsignado?.phone) {
      const asesorPhone = asesorAsignado.phone.replace(/\D/g, '');
      await this.twilio.sendWhatsAppMessage(
        asesorPhone,
        `🆕 *Nueva solicitud de crédito*\n\n👤 ${lead.name}\n📱 ${lead.phone}\n🏦 ${bancoEncontrado}\n💰 ${lead.budget ? '$' + lead.budget.toLocaleString() : 'Por definir'}\n\nVendedor: ${vendedor.name}`
      );
    }

    await this.twilio.sendWhatsAppMessage(from, 
      `✅ *${lead.name}* enviado a *${bancoEncontrado}*\n\n🏦 Asesor: ${asesorAsignado?.name || 'Por asignar'}\n📋 Solicitud creada\n\nTe avisaré cuando haya novedades.`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // HIPOTECA - CONSULTAR ESTADO
  // ═══════════════════════════════════════════════════════════

  private async vendedorConsultarCredito(from: string, body: string, vendedor: any): Promise<void> {
    // Extraer nombre
    const matchNombre = body.match(/(?:cómo va|como va|estatus|status).*?(?:de\s+)?([a-záéíóúñ\s]+?)(?:\?|$)/i) ||
                        body.match(/([a-záéíóúñA-ZÍÉÍÓÚÑ0-9 ]+).*?(?:cómo va|como va|crédit|hipoteca)/i);
    
    let nombreLead = '';
    if (matchNombre) {
      nombreLead = matchNombre[1].replace(/(?:el\s+)?(?:crédit|credit|hipoteca|banco).*$/i, '').trim();
    }

    // Si no hay nombre, mostrar todos los créditos activos
    if (!nombreLead || nombreLead.length < 2) {
      const { data: solicitudes } = await this.supabase.client
        .from('mortgage_applications')
        .select('*')
        .in('status', ['pending', 'in_review', 'sent_to_bank'])
        .order('updated_at', { ascending: false })
        .limit(10);

      if (!solicitudes || solicitudes.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `📋 No hay créditos en proceso actualmente.`);
        return;
      }

      let resp = `📋 *Créditos en proceso:*\n\n`;
      solicitudes.forEach((s: any) => {
        const emoji = s.status === 'pending' ? '⏳' : s.status === 'in_review' ? '📋' : '🏦';
        resp += `${emoji} *${s.lead_name}* - ${s.bank}\n   ${s.status === 'pending' ? 'Pendiente' : s.status === 'in_review' ? 'En revisión' : 'En banco'}\n`;
      });
      resp += `\n💡 Escribe *"¿Cómo va crédito de Juan?"* para detalle`;

      await this.twilio.sendWhatsAppMessage(from, resp);
      return;
    }

    // Buscar solicitudes del lead
    const { data: solicitudes } = await this.supabase.client
      .from('mortgage_applications')
      .select('*')
      .ilike('lead_name', '%' + nombreLead + '%')
      .order('created_at', { ascending: false });

    if (!solicitudes || solicitudes.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré solicitudes de crédito para *${nombreLead}*`);
      return;
    }

    let resp = `📋 *Créditos de ${solicitudes[0].lead_name}:*\n\n`;

    solicitudes.forEach((s: any) => {
      let emoji = '⏳';
      let estadoTexto = 'Pendiente';
      
      switch(s.status) {
        case 'pending': emoji = '⏳'; estadoTexto = 'Pendiente docs'; break;
        case 'in_review': emoji = '📋'; estadoTexto = 'En revisión'; break;
        case 'sent_to_bank': emoji = '🏦'; estadoTexto = 'En banco'; break;
        case 'approved': emoji = '✅'; estadoTexto = 'APROBADO'; break;
        case 'rejected_on': emoji = 'âš ï¸'; estadoTexto = 'Rechazado (puede reintentar)'; break;
        case 'rejected_off': emoji = '❌'; estadoTexto = 'Rechazado definitivo'; break;
      }

      resp += `${emoji} *${s.bank}*: ${estadoTexto}\n`;
      if (s.status_notes) resp += `   ðŸ“ ${s.status_notes}\n`;
    });

    // Preguntar al asesor si hay solicitud activa
    const solicitudActiva = solicitudes.find((s: any) => ['pending', 'in_review', 'sent_to_bank'].includes(s.status));
    if (solicitudActiva && solicitudActiva.assigned_advisor_id) {
      resp += `\n¿Quieres que le pregunte al asesor?\n*1.* Sí, pregúntale\n*2.* No, está bien`;
      
      // Guardar estado para siguiente mensaje
      const { data: lead } = await this.supabase.client
        .from('leads')
        .select('id, notes')
        .ilike('name', '%' + nombreLead + '%')
        .single();
      
      if (lead) {
        await this.supabase.client
          .from('leads')
          .update({ 
            notes: { 
              ...(lead.notes || {}), 
              pending_credit_inquiry: solicitudActiva.id 
            } 
          })
          .eq('id', lead.id);
      }
    }

    await this.twilio.sendWhatsAppMessage(from, resp);
  }

  private async vendedorBriefing(from: string, vendedor: any, nombre: string): Promise<void> {
    // Combinar citas + leads + meta en un solo briefing
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
    const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();

    const [citasRes, leadsRes] = await Promise.all([
      this.supabase.client.from('appointments')
        .select('*, leads(name)')
        .eq('team_member_id', vendedor.id)
        .gte('date', inicioHoy)
        .lt('date', finHoy)
        .order('date', { ascending: true }),
      this.supabase.client.from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['new', 'contacted', 'scheduled'])
    ]);

    const citas = citasRes.data || [];
    const leads = leadsRes.data || [];
    const hot = leads.filter((l: any) => l.lead_category?.toUpperCase() === 'HOT').length;

    let respuesta = `â˜€ï¸ *Buenos días ${nombre}!*

`;

    // Citas
    if (citas.length > 0) {
      respuesta += `📅 *${citas.length} cita(s) hoy:*
`;
      citas.slice(0, 3).forEach((cita: any) => {
        const hora = new Date(cita.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        respuesta += `â€¢ ${hora} - ${cita.leads?.name || 'Cliente'}
`;
      });
      if (citas.length > 3) respuesta += `  _+${citas.length - 3} más..._
`;
    } else {
      respuesta += `📅 Sin citas hoy
`;
    }

    // Leads HOT
    respuesta += `
🔥 *${hot} leads HOT* esperando`;
    if (hot > 0) respuesta += ` â† ¡Atender!`;

    respuesta += `
📊 *${leads.length} leads* activos total`;

    respuesta += `

¡A vender! 💪`;

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

  // ══════════════════════════════════════════════════════════
  // FUNCIONES DE ACTUALIZACIÓN DEL VENDEDOR
  // ══════════════════════════════════════════════════════════

  private async vendedorCerrarVenta(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Extraer nombre del lead del mensaje
    const match = body.match(/cerr[eé].*(?:con|a|el lead|la lead|cliente)\s+([a-záéíóúñ\s]+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, 
        `🤔 No entendí el nombre del cliente.

Escribe así:
*"Cerré venta con Juan García"*`
      );
      return;
    }

    const nombreLead = match[1].trim();
    
    // Buscar el lead
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .ilike('name', `%${nombreLead}%`)
      .limit(1);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌ No encontré a *${nombreLead}* en tus leads.

¿Está bien escrito el nombre?`
      );
      return;
    }

    const lead = leads[0];
    
    // Actualizar a vendido
    await this.supabase.client
      .from('leads')
      .update({ 
        status: 'sold',
        lead_category: 'CLOSED',
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    await this.twilio.sendWhatsAppMessage(from,
      `🎉 *¡VENTA CERRADA!*

✅ *${lead.name}* actualizado a VENDIDO

¡Felicidades ${nombre}! 🏆`
    );
  }


  private async vendedorCancelarLead(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Extraer nombre
    const match = body.match(/([a-záéíóúñ\s]+)\s+(?:cancel[oó]|ya no|se perdió|perdi)/i) ||
                  body.match(/(?:cancel[oó]|perdí|perdi).*(?:a|con|el lead)?\s+([a-záéíóúñ\s]+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from,
        `🤔 No entendí.

Escribe así:
*"Juan García canceló"*
o
*"Perdí a María López"*`
      );
      return;
    }

    const nombreLead = match[1].trim();

    // Buscar TODOS los leads que coincidan
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .ilike('name', `%${nombreLead}%`);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌ No encontré a *${nombreLead}* en tus leads.`
      );
      return;
    }

    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads con ese nombre:\n\n`;
      leads.forEach((l: any, i: number) => {
        const tel = l.phone?.slice(-4) || '????';
        msg += `${i + 1}. ${l.name} (...${tel})\n`;
      });
      msg += `\nEscribe el nombre completo.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Pedir motivo
    await this.supabase.client
      .from('leads')
      .update({ 
        status: 'cancelled',
        lead_category: 'LOST',
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    await this.twilio.sendWhatsAppMessage(from,
      `ðŸ“ *${lead.name}* marcado como CANCELADO.

¿Cuál fue el motivo?
1. Compró otra casa
2. Ya no le interesa
3. Sin presupuesto
4. No contestó
5. Otro`
    );
  }

  private async vendedorAgendarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Extraer: agendar cita con [nombre] [fecha/día] [hora]
    const match = body.match(/agendar?.*(?:con|a)\s+([a-záéíóúñ\s]+?)(?:\s+(?:para\s+)?(?:el\s+)?)?(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|sábado|domingo)?/i);

    if (!match) {
      await this.twilio.sendWhatsAppMessage(from,
        `🤔 No entendí.

Escribe así:
*"Agendar cita con Juan García mañana 10am"*`
      );
      return;
    }

    const nombreLead = match[1].trim();

    // Buscar lead
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', vendedor.id)
      .ilike('name', `%${nombreLead}%`)
      .limit(1);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌ No encontré a *${nombreLead}* en tus leads.`
      );
      return;
    }

    const lead = leads[0];
    
    // Por ahora solo confirmar - después agregaremos fecha/hora parsing
    await this.twilio.sendWhatsAppMessage(from,
      `📅 ¿Para cuándo quieres la cita con *${lead.name}*?

Responde con fecha y hora:
*"Mañana 10am"*
*"Viernes 3pm"*`
    );
  }

    // ══════════════════════════════════════════════════════════
  // NOTAS POR LEAD
  // ══════════════════════════════════════════════════════════

  private async vendedorAgregarNota(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Formato: "Nota Juan: le interesa jardín" o "Apunte María: presupuesto 2M"
    const match = body.match(/(?:nota|apunte|anotar)\s+([a-záéíóúñ\s]+?):\s*(.+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from,
        `ðŸ“ Para agregar nota escribe:

*"Nota Juan: le interesa jardín"*
*"Apunte María: presupuesto 2M"*`
      );
      return;
    }

    const nombreLead = match[1].trim();
    const textoNota = match[2].trim();

    // Buscar TODOS los leads que coincidan
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, notes, phone')
      .eq('assigned_to', vendedor.id)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌ No encontré a *${nombreLead}* en tus leads.`
      );
      return;
    }

    // Si hay múltiples, pedir que especifique
    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads con ese nombre:

`;
      leads.forEach((l, i) => {
        const tel = l.phone?.slice(-4) || '????';
        msg += `${i + 1}. ${l.name} (...${tel})
`;
      });
      msg += `
Escribe el nombre completo para continuar.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];
    
    // Agregar nota al JSON existente
    const notasActuales = lead.notes || {};
    const historialNotas = notasActuales.historial || [];
    
    historialNotas.push({
      fecha: new Date().toISOString(),
      texto: textoNota,
      autor: vendedor.name || nombre
    });

    await this.supabase.client
      .from('leads')
      .update({ 
        notes: { ...notasActuales, historial: historialNotas },
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    await this.twilio.sendWhatsAppMessage(from,
      `✅ Nota guardada para *${lead.name}*:

_"${textoNota}"_

ðŸ“ Total: ${historialNotas.length} nota(s)`
    );
  }

  private async vendedorVerNotas(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Formato: "Notas de Juan" o "Info de María"
    const match = body.match(/(?:notas de|info de|qué sé de)\s+([a-záéíóúñ\s]+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from,
        `ðŸ“ Para ver notas escribe:

*"Notas de Juan"*
*"Info de María"*`
      );
      return;
    }

    const nombreLead = match[1].trim();

    // Buscar TODOS los leads que coincidan
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, notes, phone, lead_category, banco_preferido, enganche_disponible, status')
      .eq('assigned_to', vendedor.id)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌ No encontré a *${nombreLead}* en tus leads.`
      );
      return;
    }

    // Si hay múltiples, pedir que especifique
    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads con ese nombre:

`;
      leads.forEach((l, i) => {
        const tel = l.phone?.slice(-4) || '????';
        msg += `${i + 1}. ${l.name} (...${tel})
`;
      });
      msg += `
Escribe el nombre completo para continuar.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];
    const notas = lead.notes?.historial || [];
    
    let respuesta = `📋 *Info de ${lead.name}*

`;
    respuesta += `📱 ${lead.phone}
`;
    respuesta += `🏷ï¸ ${lead.lead_category || 'Sin categoría'} | ${lead.status || 'nuevo'}
`;
    
    if (lead.banco_preferido) respuesta += `🏦 ${lead.banco_preferido}
`;
    if (lead.enganche_disponible) respuesta += `💰 Enganche: $${lead.enganche_disponible.toLocaleString()}
`;
    
    if (notas.length > 0) {
      respuesta += `
ðŸ“ *Notas (${notas.length}):*
`;
      notas.slice(-5).forEach((n: any, i: number) => {
        const fecha = new Date(n.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        respuesta += `${i + 1}. _${n.texto}_ (${fecha})
`;
      });
      if (notas.length > 5) respuesta += `_...y ${notas.length - 5} más_`;
    } else {
      respuesta += `
ðŸ“ Sin notas aún`;
    }

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

    // ══════════════════════════════════════════════════════════
  // AYUDA CONTEXTUAL
  // ══════════════════════════════════════════════════════════

  private async vendedorAyudaContextual(from: string, body: string, nombre: string): Promise<void> {
    const msg = body.toLowerCase();
    
    if (msg.includes('cita') && (msg.includes('agend') || msg.includes('crear') || msg.includes('hago'))) {
      await this.twilio.sendWhatsAppMessage(from,
        `📅 *Para agendar cita escribe:*\n\n"Cita con [nombre] [día] [hora] en [desarrollo]"\n\n*Ejemplos:*\nâ€¢ "Cita con Ana mañana 10am en Distrito Falco"\nâ€¢ "Agendar Juan viernes 3pm en Los Encinos"\n\n*Si el lead es nuevo:*\nâ€¢ "Crear Ana García 5512345678"`
      );
      return;
    }
    
    if (msg.includes('cancel')) {
      await this.twilio.sendWhatsAppMessage(from,
        `❌ *Para cancelar cita escribe:*\n\n"Cancelar cita con [nombre]"\n\n*Ejemplo:*\nâ€¢ "Cancelar cita con Ana"`
      );
      return;
    }
    
    if (msg.includes('reagend') || msg.includes('mover') || msg.includes('cambiar')) {
      await this.twilio.sendWhatsAppMessage(from,
        `ðŸ”„ *Para reagendar cita escribe:*\n\n"Reagendar [nombre] para [día] [hora]"\n\n*Ejemplo:*\nâ€¢ "Reagendar Ana para lunes 3pm"`
      );
      return;
    }
    
    if (msg.includes('nota') || msg.includes('apunte')) {
      await this.twilio.sendWhatsAppMessage(from,
        `ðŸ“ *Para agregar nota escribe:*\n\n"Nota [nombre]: [texto]"\n\n*Ejemplos:*\nâ€¢ "Nota Juan: le interesa jardín"\nâ€¢ "Apunte María: presupuesto 2M"\n\n*Para ver notas:*\nâ€¢ "Notas de Juan"`
      );
      return;
    }
    
    if (msg.includes('cerr') || msg.includes('venta') || msg.includes('vend')) {
      await this.twilio.sendWhatsAppMessage(from,
        `🎉 *Para cerrar venta escribe:*\n\n"Cerré venta con [nombre]"\n\n*Ejemplo:*\nâ€¢ "Cerré venta con Juan García"`
      );
      return;
    }
    
    if (msg.includes('etapa') || msg.includes('avanz') || msg.includes('mover lead')) {
      await this.twilio.sendWhatsAppMessage(from,
        `📊 *Para cambiar etapa escribe:*\n\n"[nombre] pasó a [etapa]"\n\n*Etapas:* contactado, cita agendada, visitó, negociación, cierre\n\n*Ejemplo:*\nâ€¢ "Juan pasó a negociación"`
      );
      return;
    }
    
    if (msg.includes('lead') && msg.includes('crear')) {
      await this.twilio.sendWhatsAppMessage(from,
        `👤 *Para crear lead nuevo escribe:*\n\n"Crear [nombre] [teléfono]"\n\n*Ejemplo:*\nâ€¢ "Crear Ana García 5512345678"`
      );
      return;
    }
    
    // Default: mostrar todo
    await this.twilio.sendWhatsAppMessage(from,
      `🤔 ¿Qué necesitas saber ${nombre}?\n\nâ€¢ ¿Cómo agendo cita?\nâ€¢ ¿Cómo cancelo cita?\nâ€¢ ¿Cómo agrego nota?\nâ€¢ ¿Cómo cierro venta?\nâ€¢ ¿Cómo cambio etapa?\nâ€¢ ¿Cómo creo lead?\n\nPregúntame cualquiera ðŸ‘†`
    );
  }

  // ══════════════════════════════════════════════════════════
  // CREAR LEAD NUEVO
  // ══════════════════════════════════════════════════════════

  private async vendedorCrearLead(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Formato: "Crear Ana García 5512345678"
    const match = body.match(/crear\s+(.+?)\s+(\d{10})/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from,
        `👤 Formato: *"Crear Ana García 5512345678"*`
      );
      return;
    }

    const nombreLead = match[1].trim();
    const telefono = match[2];

    // Verificar si ya existe
    const { data: existente } = await this.supabase.client
      .from('leads')
      .select('id, name')
      .eq('phone', telefono)
      .limit(1);

    if (existente && existente.length > 0) {
      await this.twilio.sendWhatsAppMessage(from,
        `âš ï¸ Ya existe un lead con ese teléfono:\n*${existente[0].name}*`
      );
      return;
    }

    // Crear lead
    const { data: nuevoLead, error } = await this.supabase.client
      .from('leads')
      .insert({
        name: nombreLead,
        phone: telefono,
        assigned_to: vendedor.id,
        status: 'new',
        lead_category: 'WARM',
        source: 'vendedor_whatsapp',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      await this.twilio.sendWhatsAppMessage(from, `❌ Error al crear lead: ${error.message}`);
      return;
    }

    await this.twilio.sendWhatsAppMessage(from,
      `✅ *Lead creado:*\n\n👤 ${nombreLead}\n📱 ${telefono}\n🏷ï¸ WARM\n\nYa puedes agendar cita con este lead.`
    );
  }

  // ══════════════════════════════════════════════════════════
  // AGENDAR CITA COMPLETA
  // ══════════════════════════════════════════════════════════

  private async vendedorAgendarCitaCompleta(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    // Parsear: "Cita mañana 5pm con Spiderman Canseco 5512345678 en Distrito Falco"
    // Extraer teléfono si viene
    const matchTelefono = body.match(/(\d{10})/);
    const telefono = matchTelefono ? matchTelefono[1] : null;
    
    // Extraer nombre - más flexible
    let nombreLead = '';
    const matchNombreConTel = body.match(/(?:con|para)\s+([a-záéíóúñ\s]+?)\s+\d{10}/i);
    const matchNombreSinTel = body.match(/(?:cita con|agendar|para)\s+([a-záéíóúñ\s]+?)(?:\s+(?:mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|para el|para|el|a las|\d))/i);
    
    if (matchNombreConTel) {
      nombreLead = matchNombreConTel[1].trim();
    } else if (matchNombreSinTel) {
      nombreLead = matchNombreSinTel[1].trim();
    }
    
    const matchNombre = { 1: nombreLead }; // Para compatibilidad con código abajo
    const matchHora = body.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    const matchDia = body.match(/(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)/i);
    const matchDesarrollo = body.match(/(?:en|desarrollo)\s+([a-záéíóúñ\s]+)$/i);

    if (!matchNombre) {
      await this.twilio.sendWhatsAppMessage(from,
        `📅 Escribe así:\n*"Cita con Ana mañana 10am en Distrito Falco"*`
      );
      return;
    }

    // nombreLead ya definido arriba
    
    // Buscar lead
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone')
      .eq('assigned_to', vendedor.id)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads || leads.length === 0) {
      // Buscar por teléfono si tenemos
      if (telefono) {
        const { data: leadPorTel } = await this.supabase.client
          .from('leads')
          .select('*')
          .eq('phone', telefono)
          .single();
        
        if (leadPorTel) {
          // Lead ya existe con ese teléfono, usarlo
          console.log('📱 Lead encontrado por teléfono:', leadPorTel.name);
          leads = [leadPorTel];
        } else {
          // No existe, CREAR AUTOMÍTICAMENTE
          const { data: nuevoLead, error } = await this.supabase.client
            .from('leads')
            .insert({
              name: nombreLead,
              phone: telefono,
              assigned_to: vendedor.id,
              status: 'scheduled',
              lead_category: 'COLD',
              source: 'vendedor_calle',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (error || !nuevoLead) {
            await this.twilio.sendWhatsAppMessage(from, `❌ Error creando lead: ${error?.message}`);
            return;
          }
          
          console.log('✅ Lead creado automáticamente:', nuevoLead.name);
          leads = [nuevoLead];
        }
      } else {
        // No tiene teléfono, pedir
        await this.twilio.sendWhatsAppMessage(from,
          `📱 No encontré a *${nombreLead}*. Incluye el teléfono:\n\n*"Cita mañana 5pm con ${nombreLead} 55XXXXXXXX en Distrito Falco"*`
        );
        return;
      }
    }

    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads:\n\n`;
      leads.forEach((l: any, i: number) => {
        msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
      });
      msg += `\nEscribe nombre completo.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Calcular fecha
    let fecha = new Date();
    if (matchDia) {
      const dia = matchDia[1].toLowerCase();
      if (dia === 'mañana') {
        fecha.setDate(fecha.getDate() + 1);
      } else if (dia !== 'hoy') {
        const dias: any = { 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0 };
        const targetDay = dias[dia];
        const currentDay = fecha.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        fecha.setDate(fecha.getDate() + daysToAdd);
      }
    }

    // Calcular hora
    if (matchHora) {
      let hora = parseInt(matchHora[1]);
      const minutos = matchHora[2] ? parseInt(matchHora[2]) : 0;
      const ampm = matchHora[3].toLowerCase();
      if (ampm === 'pm' && hora < 12) hora += 12;
      if (ampm === 'am' && hora === 12) hora = 0;
      fecha.setHours(hora, minutos, 0, 0);
    }

    const desarrollo = matchDesarrollo ? matchDesarrollo[1].trim() : 'Por definir';

    // Crear cita
    const horaForDB = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    const { error, data: citaCreada } = await this.supabase.client
      .from('appointments')
      .insert({
        lead_id: lead.id,
        lead_phone: lead.phone,
        lead_name: lead.name,
        property_id: null,
        property_name: desarrollo,
        vendedor_id: vendedor.id,
        vendedor_name: nombre,
        scheduled_date: fecha.toISOString().split('T')[0],
        scheduled_time: horaForDB,
        status: 'scheduled',
        appointment_type: 'visita',
        duration_minutes: 60
      });

    if (error) {
      await this.twilio.sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
      return;
    }

    // Crear evento en Google Calendar
    try {
      const endFecha = new Date(fecha.getTime() + 60 * 60 * 1000); // +1 hora
      
      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:00`;
      };

      const eventData = {
        summary: `🏠 Visita ${desarrollo} - ${lead.name}`,
        description: `👤 Cliente: ${lead.name}\n📱 Teléfono: ${lead.phone}\n🏠 Desarrollo: ${desarrollo}\nðŸ“ Agendada via WhatsApp`,
        location: desarrollo,
        start: { dateTime: formatDate(fecha), timeZone: 'America/Mexico_City' },
        end: { dateTime: formatDate(endFecha), timeZone: 'America/Mexico_City' },
        attendees: []
      };

      const eventResult = await this.calendar.createEvent(eventData);
      console.log('📅 Evento Google Calendar creado:', eventResult?.id || 'OK');
      
      // Guardar ID del evento en la cita
      if (citaCreada?.id && eventResult?.id) {
        await this.supabase.client
          .from('appointments')
          .update({ google_event_vendedor_id: eventResult.id })
          .eq('id', citaCreada.id);
      }
    } catch (calError) {
      console.error('❌ Error Google Calendar:', calError);
      // No bloqueamos el flujo si falla el calendario
    }

    // Actualizar status del lead
    await this.supabase.client
      .from('leads')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .eq('id', lead.id);

    const fechaStr = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
    const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    await this.twilio.sendWhatsAppMessage(from,
      `✅ *Cita agendada:*\n\n📅 ${fechaStr}, ${horaStr}\n👤 ${lead.name} (...${lead.phone?.slice(-4)})\n🏠 ${desarrollo}\n\n¿Le mando confirmación a ${lead.name}?\n*1.* Sí, mándale\n*2.* No, yo le aviso`
    );
    
    // Guardar estado para la siguiente respuesta
    await this.supabase.client
      .from('leads')
      .update({ 
        notes: { 
          ...(lead.notes || {}), 
          pending_confirmation: { lead_id: lead.id, phone: lead.phone, fecha: fechaStr, hora: horaStr, desarrollo } 
        }
      })
      .eq('id', lead.id);
  }

  // ══════════════════════════════════════════════════════════
  // CANCELAR CITA
  // ══════════════════════════════════════════════════════════

  private async vendedorCancelarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    const match = body.match(/cancelar cita (?:con|de)\s+([a-záéíóúñ\s]+)/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `❌ Escribe: *"Cancelar cita con Ana"*`);
      return;
    }

    const nombreLead = match[1].trim();

    // Buscar lead
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone')
      .eq('assigned_to', vendedor.id)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads:\n\n`;
      leads.forEach((l: any, i: number) => {
        msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
      });
      msg += `\nEscribe nombre completo.`;
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Buscar cita pendiente
    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('status', 'scheduled')
      .order('date', { ascending: true })
      .limit(1);

    if (!citas || citas.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `âš ï¸ ${lead.name} no tiene citas pendientes.`);
      return;
    }

    const cita = citas[0];
    const fechaCita = new Date(cita.date);
    const fechaStr = fechaCita.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
    const horaStr = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    // Cancelar
    await this.supabase.client
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', cita.id);

    await this.twilio.sendWhatsAppMessage(from,
      `❌ *Cita cancelada:*\n\n👤 ${lead.name}\n📅 Era: ${fechaStr}, ${horaStr}\n\n¿Le aviso a ${lead.name}?\n*1.* Sí, mándale\n*2.* No, yo le aviso`
    );
  }

  // ══════════════════════════════════════════════════════════
  // REAGENDAR CITA
  // ══════════════════════════════════════════════════════════

  private async vendedorReagendarCita(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    const match = body.match(/reagendar\s+([a-záéíóúñ\s]+?)(?:\s+para)?\s+(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)?\s*(\d{1,2})?(?::(\d{2}))?\s*(am|pm)?/i);
    
    if (!match) {
      await this.twilio.sendWhatsAppMessage(from, `ðŸ”„ Escribe: *"Reagendar Ana para lunes 3pm"*`);
      return;
    }

    const nombreLead = match[1].trim();
    const diaStr = match[2];
    const horaNum = match[3];
    const ampm = match[5];

    // Buscar lead
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone')
      .eq('assigned_to', vendedor.id)
      .ilike('name', '%' + nombreLead + '%');

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
      return;
    }

    if (leads.length > 1) {
      let msg = `🤔 Encontré ${leads.length} leads:\n\n`;
      leads.forEach((l: any, i: number) => {
        msg += `${i + 1}. ${l.name} (...${l.phone?.slice(-4) || '????'})\n`;
      });
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Buscar cita existente
    const { data: citas } = await this.supabase.client
      .from('appointments')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('status', 'scheduled')
      .limit(1);

    if (!citas || citas.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, `âš ï¸ ${lead.name} no tiene citas pendientes para reagendar.`);
      return;
    }

    const cita = citas[0];
    const fechaAnterior = new Date(cita.date);

    // Calcular nueva fecha
    let nuevaFecha = new Date();
    if (diaStr) {
      const dia = diaStr.toLowerCase();
      if (dia === 'mañana') {
        nuevaFecha.setDate(nuevaFecha.getDate() + 1);
      } else if (dia !== 'hoy') {
        const dias: any = { 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0 };
        const targetDay = dias[dia];
        const currentDay = nuevaFecha.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        nuevaFecha.setDate(nuevaFecha.getDate() + daysToAdd);
      }
    }

    if (horaNum && ampm) {
      let hora = parseInt(horaNum);
      if (ampm.toLowerCase() === 'pm' && hora < 12) hora += 12;
      if (ampm.toLowerCase() === 'am' && hora === 12) hora = 0;
      nuevaFecha.setHours(hora, 0, 0, 0);
    }

    // Actualizar cita
    await this.supabase.client
      .from('appointments')
      .update({ date: nuevaFecha.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cita.id);

    const fechaAnteriorStr = fechaAnterior.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
    const horaAnteriorStr = fechaAnterior.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const fechaNuevaStr = nuevaFecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
    const horaNuevaStr = nuevaFecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    await this.twilio.sendWhatsAppMessage(from,
      `✅ *Cita reagendada:*\n\n👤 ${lead.name}\n📅 Antes: ${fechaAnteriorStr}, ${horaAnteriorStr}\n📅 Ahora: ${fechaNuevaStr}, ${horaNuevaStr}\n\n¿Le aviso del cambio?\n*1.* Sí\n*2.* No`
    );
  }

    // ══════════════════════════════════════════════════════════
  // IA HÍBRIDA - Clasificar intent cuando no matchea palabras
  // ══════════════════════════════════════════════════════════

  private async vendedorIntentIA(from: string, body: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const prompt = `Eres un clasificador de intents para un asistente de vendedores inmobiliarios.

El vendedor escribió: "${body}"

Clasifica en UNO de estos intents:
- ayuda_citas: pregunta CÓMO agendar/cancelar/reagendar citas
- ayuda_notas: pregunta CÓMO agregar notas
- ayuda_ventas: pregunta CÓMO cerrar ventas o cambiar etapas
- ayuda_general: pregunta qué puede hacer el asistente
- briefing: saludo o quiere resumen del día
- ver_citas: quiere VER sus citas de hoy
- ver_meta: quiere ver su avance/meta
- ver_leads: quiere ver sus leads
- agendar_cita: quiere AGENDAR una cita (incluye nombre y/o fecha)
- cancelar_cita: quiere CANCELAR una cita
- reagendar_cita: quiere MOVER/CAMBIAR fecha de cita
- cerrar_venta: reporta que CERRÓ una venta
- cambiar_etapa: quiere mover lead en el funnel
- agregar_nota: quiere AGREGAR una nota a un lead
- ver_notas: quiere VER notas/info de un lead
- crear_lead: quiere crear un lead nuevo
- no_entiendo: no es ninguna de las anteriores

Responde SOLO con el intent, nada más.`;

      const response = await this.openai.chat([
        { role: 'system', content: 'Responde solo con el intent exacto, sin explicaciones.' },
        { role: 'user', content: prompt }
      ], { max_tokens: 20, temperature: 0 });

      const intent = response.trim().toLowerCase().replace(/[^a-z_]/g, '');
      console.log('ðŸ¤– IA Intent detectado:', intent, 'para mensaje:', body);

      // Ejecutar según intent
      switch (intent) {
        case 'ayuda_citas':
          await this.twilio.sendWhatsAppMessage(from,
            `📅 *Para agendar cita escribe:*\n\n"Cita con [nombre] [día] [hora] en [desarrollo]"\n\n*Ejemplos:*\nâ€¢ "Cita con Ana mañana 10am en Distrito Falco"\nâ€¢ "Agendar Juan viernes 3pm"\n\n*Para cancelar:* "Cancelar cita con Ana"\n*Para mover:* "Reagendar Ana para lunes 3pm"`
          );
          break;
        case 'ayuda_notas':
          await this.twilio.sendWhatsAppMessage(from,
            `ðŸ“ *Para agregar nota escribe:*\n\n"Nota [nombre]: [texto]"\n\n*Ejemplos:*\nâ€¢ "Nota Juan: le interesa jardín"\nâ€¢ "Apunte María: presupuesto 2M"\n\n*Para ver notas:* "Notas de Juan"`
          );
          break;
        case 'ayuda_ventas':
          await this.twilio.sendWhatsAppMessage(from,
            `🎉 *Para cerrar venta:*\n"Cerré venta con [nombre]"\n\n*Para cambiar etapa:*\n"[nombre] pasó a [etapa]"\n\n*Etapas:* contactado, cita agendada, visitó, negociación, cierre`
          );
          break;
        case 'ayuda_general':
          await this.vendedorAyuda(from, nombre);
          break;
        case 'briefing':
          await this.vendedorBriefing(from, vendedor, nombre);
          break;
        case 'ver_citas':
          await this.vendedorCitasHoy(from, vendedor, nombre);
          break;
        case 'ver_meta':
          await this.vendedorMetaAvance(from, vendedor, nombre);
          break;
        case 'ver_leads':
          await this.vendedorResumenLeads(from, vendedor, nombre);
          break;
        case 'agendar_cita':
          await this.vendedorAgendarCitaCompleta(from, body, vendedor, nombre);
          break;
        case 'cancelar_cita':
          await this.vendedorCancelarCita(from, body, vendedor, nombre);
          break;
        case 'reagendar_cita':
          await this.vendedorReagendarCita(from, body, vendedor, nombre);
          break;
        case 'cerrar_venta':
          await this.vendedorCerrarVenta(from, body, vendedor, nombre);
          break;
        case 'cambiar_etapa':
          await this.vendedorCambiarEtapa(from, body, vendedor, nombre);
          break;
        case 'agregar_nota':
          await this.vendedorAgregarNota(from, body, vendedor, nombre);
          break;
        case 'ver_notas':
          await this.vendedorVerNotas(from, body, vendedor, nombre);
          break;
        case 'crear_lead':
          await this.vendedorCrearLead(from, body, vendedor, nombre);
          break;
        default:
          await this.vendedorAyuda(from, nombre);
      }
    } catch (error) {
      console.error('❌ Error en IA Intent:', error);
      await this.vendedorAyuda(from, nombre);
    }
  }

  // ══════════════════════════════════════════════════════════
  // COACHING IA - Análisis y sugerencias por lead
  // ══════════════════════════════════════════════════════════

  private async vendedorCoaching(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar lead por nombre
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .ilike('name', `%${nombreLead}%`)
        .limit(5);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from,
          `❌ No encontré ningún lead con nombre "${nombreLead}".\n\n` +
          `Escribe *"coach [nombre exacto]"* para recibir coaching.`
        );
        return;
      }

      // Si hay múltiples matches, usar el primero
      const lead = leads[0];
      const leadName = lead.name || 'Cliente';
      const firstName = leadName.split(' ')[0];

      // Obtener citas del lead (futuras y pasadas)
      const { data: citas } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('lead_id', lead.id)
        .order('date', { ascending: true });

      // Separar citas futuras y pasadas
      const ahora = new Date();
      const citasFuturas = citas?.filter((c: any) => new Date(c.date) > ahora) || [];
      const citasPasadas = citas?.filter((c: any) => new Date(c.date) <= ahora) || [];
      const proximaCita = citasFuturas[0];

      // Calcular días en etapa actual
      const statusChangedAt = lead.status_changed_at ? new Date(lead.status_changed_at) : new Date(lead.created_at);
      const diasEnEtapa = Math.floor((Date.now() - statusChangedAt.getTime()) / (1000 * 60 * 60 * 24));

      // Calcular score real basado en datos
      let scoreCalculado = lead.lead_score || lead.score || 0;
      if (proximaCita) scoreCalculado = Math.max(scoreCalculado, 70);
      if (lead.banco_preferido) scoreCalculado = Math.max(scoreCalculado, 60);
      if (lead.enganche_disponible > 0) scoreCalculado = Math.max(scoreCalculado, 75);

      // Formatear cita próxima
      let citaInfo = 'Sin cita agendada';
      if (proximaCita) {
        const fechaCita = new Date(proximaCita.date);
        const opciones: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };
        citaInfo = `${fechaCita.toLocaleDateString('es-MX', opciones)} en ${proximaCita.property_development || 'desarrollo'}`;
      }

      // Datos de hipoteca
      const tieneHipoteca = lead.banco_preferido || lead.enganche_disponible || lead.mortgage_data?.ingreso_mensual;
      const ingresoMensual = lead.mortgage_data?.ingreso_mensual || 0;
      
      // Preparar prompt con TODA la info
      const prompt = `Eres un coach de ventas inmobiliarias experto mexicano. Analiza este lead y da consejos MUY ESPECÍFICOS basados en los datos reales.

═══════════════════════════════════════
DATOS DEL LEAD: ${leadName}
═══════════════════════════════════════
📊 Score: ${scoreCalculado}/100
📍 Etapa: ${lead.status} (${diasEnEtapa} días en esta etapa)
🏠 Interés: ${lead.property_interest || 'No especificado'}
💰 Presupuesto: ${lead.budget || 'No especificado'}

═══════════════════════════════════════
DATOS DE CRÉDITO HIPOTECARIO:
═══════════════════════════════════════
🏦 Banco preferido: ${lead.banco_preferido || 'No especificado'}
💵 Ingreso mensual: ${ingresoMensual > 0 ? '$' + ingresoMensual.toLocaleString() : 'No declarado'}
💰 Enganche disponible: ${lead.enganche_disponible > 0 ? '$' + lead.enganche_disponible.toLocaleString() : 'No declarado'}
📞 Modalidad asesoría: ${lead.modalidad_asesoria || 'No especificada'}
${tieneHipoteca ? '✅ YA INICIÓ PROCESO DE CRÉDITO' : '❌ No ha iniciado proceso de crédito'}

═══════════════════════════════════════
CITAS:
═══════════════════════════════════════
📅 Próxima cita: ${citaInfo}
📋 Citas pasadas: ${citasPasadas.length}
📋 Citas agendadas: ${citasFuturas.length}

═══════════════════════════════════════
HISTORIAL (últimos mensajes):
═══════════════════════════════════════
${(lead.conversation_history || []).slice(-8).map((m: any) => `${m.role === 'user' ? '👤' : 'ðŸ¤–'} ${m.content?.substring(0, 100)}`).join('\n') || 'Sin historial'}

═══════════════════════════════════════
INSTRUCCIONES PARA TU ANÍLISIS:
═══════════════════════════════════════
1. PERFIL: ¿Qué tipo de comprador es? (inversor, primera vivienda, upgrade, etc.)
2. FORTALEZAS: ¿Qué datos positivos tiene? (cita agendada, crédito iniciado, etc.)
3. OBJECIONES PROBABLES: Basado en la conversación, ¿qué le preocupa?
4. ACCIÓN INMEDIATA: ¿Qué debe hacer el vendedor HOY?
5. TÉCNICA DE CIERRE: Una técnica específica para este cliente

SÉ MUY CONCRETO. NO repitas los datos, ANALÍZALOS. Máximo 200 palabras.`;

      const response = await this.openai.chatText(
        'Eres un coach de ventas inmobiliarias mexicano. Das consejos directos, prácticos y accionables. Usas emojis. NO repites los datos del lead, los analizas.',
        prompt
      );

      // Construir respuesta estructurada
      let mensaje = `🎯 *COACHING: ${firstName}*\n`;
      mensaje += `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n\n`;
      
      // Score con emoji correcto
      mensaje += `📊 *Score:* ${scoreCalculado}/100 `;
      if (scoreCalculado >= 80) mensaje += `🔥 HOT\n`;
      else if (scoreCalculado >= 60) mensaje += `💡ï¸ WARM\n`;
      else if (scoreCalculado >= 40) mensaje += `ðŸ˜ TIBIO\n`;
      else mensaje += `â„ï¸ COLD\n`;
      
      // Etapa
      mensaje += `📍 *Etapa:* ${this.formatStatusCoaching(lead.status)} (${diasEnEtapa} días)\n`;
      
      // Propiedad de interés
      if (lead.property_interest) mensaje += `🏠 *Interés:* ${lead.property_interest}\n`;
      
      // Cita próxima (IMPORTANTE)
      if (proximaCita) {
        const fechaCita = new Date(proximaCita.date);
        const hoy = new Date();
        const diffDias = Math.ceil((fechaCita.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        const cuando = diffDias === 0 ? '📌 HOY' : diffDias === 1 ? '📌 MAÑANA' : `📅 En ${diffDias} días`;
        mensaje += `\n${cuando}: *Cita ${fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}* en ${proximaCita.property_development}\n`;
      }
      
      // Datos de crédito
      if (tieneHipoteca) {
        mensaje += `\n💳 *CRÉDITO:*\n`;
        if (lead.banco_preferido) mensaje += `   🏦 ${lead.banco_preferido}\n`;
        if (ingresoMensual > 0) mensaje += `   💵 Ingreso: $${ingresoMensual.toLocaleString()}/mes\n`;
        if (lead.enganche_disponible > 0) mensaje += `   💰 Enganche: $${lead.enganche_disponible.toLocaleString()}\n`;
      }
      
      mensaje += `\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n`;
      mensaje += `${response}`;

      await this.twilio.sendWhatsAppMessage(from, mensaje);

    } catch (error) {
      console.error('❌ Error en coaching:', error);
      await this.twilio.sendWhatsAppMessage(from,
        `❌ Error al analizar el lead. Intenta de nuevo.\n\nUso: *coach [nombre del lead]*`
      );
    }
  }

  private formatStatusCoaching(status: string): string {
    const statusMap: Record<string, string> = {
      'new': '🆕 Nuevo',
      'contacted': '📞 Contactado',
      'scheduled': '📅 Cita agendada',
      'visited': '🏠 Visitó',
      'negotiation': '💬 Negociación',
      'reserved': 'ðŸ“ Reservado',
      'closed': '✅ Cerrado',
      'delivered': '🔑 Entregado',
      'fallen': '❌ Caído'
    };
    return statusMap[status] || status;
  }

    // ══════════════════════════════════════════════════════════
  // CONFIRMACIÓN DE CITA AL LEAD
  // ══════════════════════════════════════════════════════════

  private async hayConfirmacionPendiente(vendedorId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from('leads')
      .select('id, notes')
      .eq('assigned_to', vendedorId)
      .not('notes->pending_confirmation', 'is', null)
      .limit(1);
    
    return data && data.length > 0;
  }

  private async enviarConfirmacionAlLead(from: string, vendedor: any, nombre: string): Promise<void> {
    // Buscar lead con confirmación pendiente
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, phone, notes')
      .eq('assigned_to', vendedor.id)
      .not('notes->pending_confirmation', 'is', null)
      .limit(1);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 'âš ï¸ No encontré cita pendiente de confirmar.');
      return;
    }

    const lead = leads[0];
    const conf = lead.notes?.pending_confirmation;

    if (!conf || !lead.phone) {
      await this.twilio.sendWhatsAppMessage(from, 'âš ï¸ El lead no tiene teléfono registrado.');
      return;
    }

    // Formatear teléfono del lead
    const leadPhone = lead.phone.replace(/\D/g, '').slice(-10);
    
    // Enviar confirmación al lead
    const msgLead = `¡Hola ${lead.name?.split(' ')[0] || ''}! 🏠

Te confirmamos tu cita:
📅 ${conf.fecha}
ðŸ• ${conf.hora}
📍 ${conf.desarrollo || 'Por confirmar ubicación'}

Te esperamos. ¿Tienes alguna duda? 😊`;

    try {
      await this.twilio.sendWhatsAppMessage(leadPhone, msgLead);
      
      // Limpiar confirmación pendiente
      const notasLimpias = { ...(lead.notes || {}) };
      delete notasLimpias.pending_confirmation;
      
      await this.supabase.client
        .from('leads')
        .update({ notes: notasLimpias })
        .eq('id', lead.id);

      await this.twilio.sendWhatsAppMessage(from,
        `✅ *Confirmación enviada a ${lead.name}*\n\n📱 ${lead.phone}\n\n¡Listo ${nombre}!`
      );
    } catch (error: any) {
      console.error('Error enviando confirmación:', error);
      await this.twilio.sendWhatsAppMessage(from,
        `❌ No pude enviar a ${lead.name}. Verifica el número: ${lead.phone}`
      );
    }
  }

  private async cancelarConfirmacionPendiente(from: string, vendedor: any, nombre: string): Promise<void> {
    // Buscar y limpiar confirmación pendiente
    let { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, name, notes')
      .eq('assigned_to', vendedor.id)
      .not('notes->pending_confirmation', 'is', null)
      .limit(1);

    if (leads && leads.length > 0) {
      const lead = leads[0];
      const notasLimpias = { ...(lead.notes || {}) };
      delete notasLimpias.pending_confirmation;
      
      await this.supabase.client
        .from('leads')
        .update({ notes: notasLimpias })
        .eq('id', lead.id);

      await this.twilio.sendWhatsAppMessage(from,
        `👍 Ok ${nombre}, tú le avisas a ${lead.name}.`
      );
    }
  }

    private async vendedorAyuda(from: string, nombre: string): Promise<void> {
    const respuesta = `*Hola ${nombre}!* 👋

Soy SARA, tu asistente. Aquí mis comandos:

*📊 CONSULTAS:*
• *hoy* - Resumen de tu día
• *citas* - Citas agendadas
• *próxima* - Tu siguiente cita
• *disponibilidad* - Huecos en agenda
• *leads* - Tus prospectos
• *meta* - Tu avance de ventas
• *comisiones* - Lo que has ganado
• *ranking* - Tu posición vs equipo

*🔥 LEADS:*
• *hot* - Tus leads calientes
• *mejor* - Lead más cerca de cerrar
• *frios* - Leads sin actividad
• *quién es Juan* - Info completa
• *resumen Juan* - Resumen ejecutivo
• *buscar 5512345678* - Por teléfono
• *mi funnel* - Ver pipeline

*📞 CONTACTO:*
• *llamar Juan* - Click-to-call
• *llamadas* - Pendientes
• *enviar Andes a Juan* - Manda info

*✏️ ACTUALIZAR:*
• *Cerré con Juan*
• *Juan adelante* (siguiente etapa)
• *Nota Juan: le gusta jardín*

*📅 CITAS:*
• *Cita mañana 5pm con Ana*
• *Cancelar cita Ana*

*🏠 INFO:*
• *propiedades* - Desarrollos
• *coach Juan* - Tips de venta

¡Pregúntame lo que necesites! 💪`;

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

  // ═══════════════════════════════════════════════════════════════
  // COMANDOS VENDEDOR MEJORADOS - FUNCIONES
  // ═══════════════════════════════════════════════════════════════

  private async vendedorComisiones(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);

      // Cierres del mes
      const { data: cierres } = await this.supabase.client
        .from('leads')
        .select('*, properties(price)')
        .eq('assigned_to', vendedor.id)
        .in('status', ['closed', 'delivered'])
        .gte('status_changed_at', inicioMes.toISOString());

      const numCierres = cierres?.length || 0;
      let revenue = 0;
      for (const c of cierres || []) {
        revenue += c.properties?.price || 2000000;
      }

      // Comisión estimada (1.5% del revenue)
      const comisionRate = 0.015;
      const comision = revenue * comisionRate;

      // Comisión acumulada del vendedor
      const comisionAcumulada = vendedor.commission || 0;

      await this.twilio.sendWhatsAppMessage(from,
        `*💰 TUS COMISIONES*\n${nombre}\n\n` +
        `*Este mes:*\n` +
        `• Cierres: ${numCierres}\n` +
        `• Revenue: $${(revenue/1000000).toFixed(1)}M\n` +
        `• Comisión estimada: $${comision.toLocaleString()}\n\n` +
        `*Acumulado:*\n` +
        `• Total ganado: $${comisionAcumulada.toLocaleString()}\n\n` +
        `_*Nota:* Comisión al 1.5% del precio de venta_`
      );
    } catch (e) {
      console.log('Error en comisiones:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al calcular comisiones.');
    }
  }

  private async vendedorMejorLead(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Lead más avanzado en el funnel
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*, properties(name, price)')
        .eq('assigned_to', vendedor.id)
        .in('status', ['negotiation', 'reserved', 'visited'])
        .order('updated_at', { ascending: false });

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from,
          `${nombre}, no tienes leads en etapas avanzadas.\n\n` +
          `Enfócate en mover leads a *visited* o *negotiation* 💪`
        );
        return;
      }

      // Ordenar por etapa (reserved > negotiation > visited)
      const orden: Record<string, number> = { 'reserved': 3, 'negotiation': 2, 'visited': 1 };
      const sorted = leads.sort((a, b) => (orden[b.status] || 0) - (orden[a.status] || 0));
      const mejor = sorted[0];

      const etapaEmoji: Record<string, string> = {
        'visited': '🏠 Visitó',
        'negotiation': '💰 Negociación',
        'reserved': '📝 Reservado'
      };

      await this.twilio.sendWhatsAppMessage(from,
        `*🎯 TU MEJOR LEAD*\n${nombre}\n\n` +
        `👤 *${mejor.name || 'Sin nombre'}*\n` +
        `📱 ${mejor.phone?.slice(-10)}\n` +
        `📊 ${etapaEmoji[mejor.status] || mejor.status}\n` +
        `🏠 ${mejor.properties?.name || 'Sin propiedad'}\n\n` +
        `_Este lead está muy cerca de cerrar. ¡Dale seguimiento hoy!_\n\n` +
        `💡 Escribe *coach ${mejor.name?.split(' ')[0]}* para tips`
      );
    } catch (e) {
      console.log('Error en mejor lead:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al buscar mejor lead.');
    }
  }

  private async vendedorLeadsFrios(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);

      const { data: frios } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['new', 'contacted', 'scheduled'])
        .lt('updated_at', hace7dias.toISOString())
        .order('updated_at', { ascending: true })
        .limit(5);

      if (!frios || frios.length === 0) {
        await this.twilio.sendWhatsAppMessage(from,
          `✅ *${nombre}*, no tienes leads fríos!\n\n` +
          `Todos tus leads tienen actividad reciente. ¡Excelente trabajo! 💪`
        );
        return;
      }

      let msg = `*❄️ LEADS FRÍOS*\n${nombre}\n\n`;
      msg += `_Sin actividad en +7 días:_\n\n`;

      for (const lead of frios) {
        const diasSinActividad = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        msg += `• *${lead.name || 'Sin nombre'}*\n`;
        msg += `  ${lead.status} | ${diasSinActividad} días sin actividad\n`;
      }

      msg += `\n⚡ _Contacta a estos leads hoy para reactivarlos_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en leads frios:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al buscar leads fríos.');
    }
  }

  private async vendedorRanking(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const { data: vendedores } = await this.supabase.client
        .from('team_members')
        .select('id, name, sales_count, commission')
        .eq('role', 'vendedor')
        .eq('active', true)
        .order('sales_count', { ascending: false });

      if (!vendedores || vendedores.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay vendedores registrados.');
        return;
      }

      // Encontrar posición del vendedor actual
      const posicion = vendedores.findIndex(v => v.id === vendedor.id) + 1;
      const total = vendedores.length;

      let msg = `*🏆 RANKING DE VENDEDORES*\n\n`;

      const medallas = ['🥇', '🥈', '🥉'];
      for (let i = 0; i < Math.min(5, vendedores.length); i++) {
        const v = vendedores[i];
        const medal = medallas[i] || `${i + 1}.`;
        const esYo = v.id === vendedor.id ? ' ← TÚ' : '';
        msg += `${medal} *${v.name}*${esYo}\n`;
        msg += `   ${v.sales_count || 0} cierres | $${((v.commission || 0)/1000).toFixed(0)}K\n`;
      }

      if (posicion > 5) {
        msg += `\n...\n\n`;
        msg += `${posicion}. *${nombre}* ← TÚ\n`;
        msg += `   ${vendedor.sales_count || 0} cierres | $${((vendedor.commission || 0)/1000).toFixed(0)}K\n`;
      }

      msg += `\n📊 Tu posición: *${posicion}/${total}*`;

      if (posicion === 1) {
        msg += `\n\n🎉 *¡Eres el #1! Sigue así!*`;
      } else {
        const diferencia = (vendedores[posicion - 2]?.sales_count || 0) - (vendedor.sales_count || 0);
        msg += `\n\n💪 _Te faltan ${diferencia} cierres para subir_`;
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en ranking:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener ranking.');
    }
  }

  private async vendedorPropiedades(from: string, vendedor: any): Promise<void> {
    try {
      const { data: properties } = await this.supabase.client
        .from('properties')
        .select('*')
        .eq('status', 'available')
        .order('name');

      if (!properties || properties.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 'No hay propiedades disponibles.');
        return;
      }

      // Agrupar por desarrollo
      const porDesarrollo: Record<string, any[]> = {};
      for (const p of properties) {
        const desarrollo = p.development || 'Sin desarrollo';
        if (!porDesarrollo[desarrollo]) porDesarrollo[desarrollo] = [];
        porDesarrollo[desarrollo].push(p);
      }

      let msg = `*🏠 PROPIEDADES DISPONIBLES*\n\n`;

      for (const [desarrollo, props] of Object.entries(porDesarrollo)) {
        msg += `📍 *${desarrollo}*\n`;
        const precios = props.map(p => p.price || 0);
        const minPrecio = Math.min(...precios);
        const maxPrecio = Math.max(...precios);
        msg += `   ${props.length} unidades\n`;
        msg += `   $${(minPrecio/1000000).toFixed(1)}M - $${(maxPrecio/1000000).toFixed(1)}M\n\n`;
      }

      msg += `_Escribe *brochure [desarrollo]* para más info_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en propiedades:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener propiedades.');
    }
  }

  private async vendedorBuscarPorTelefono(from: string, telefono: string, vendedor: any): Promise<void> {
    try {
      const digits = telefono.replace(/\D/g, '').slice(-10);

      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*, team_members!leads_assigned_to_fkey(name)')
        .like('phone', '%' + digits);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré lead con teléfono *${digits}*`);
        return;
      }

      const lead = leads[0];
      const vendedorAsignado = lead.team_members?.name || 'Sin asignar';

      const etapaEmoji: Record<string, string> = {
        'new': '🆕 Nuevo',
        'contacted': '📞 Contactado',
        'scheduled': '📅 Cita',
        'visited': '🏠 Visitó',
        'negotiation': '💰 Negociación',
        'reserved': '📝 Reservado',
        'closed': '✅ Cerrado',
        'delivered': '🔑 Entregado',
        'fallen': '❌ Caído'
      };

      await this.twilio.sendWhatsAppMessage(from,
        `*🔍 LEAD ENCONTRADO*\n\n` +
        `👤 *${lead.name || 'Sin nombre'}*\n` +
        `📱 ${lead.phone}\n` +
        `📊 ${etapaEmoji[lead.status] || lead.status}\n` +
        `💯 Score: ${lead.score || 0}\n` +
        `👔 Vendedor: ${vendedorAsignado}\n` +
        `📅 Creado: ${new Date(lead.created_at).toLocaleDateString('es-MX')}`
      );
    } catch (e) {
      console.log('Error buscando por telefono:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al buscar lead.');
    }
  }

  private async vendedorCrearRecordatorio(from: string, texto: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Intentar extraer nombre y tiempo del texto
      // "llamar a Juan mañana" o "Juan en 2 horas" o "seguimiento María"
      
      let scheduledFor = new Date();
      scheduledFor.setHours(scheduledFor.getHours() + 24); // Default: mañana

      if (texto.includes('mañana')) {
        scheduledFor.setDate(scheduledFor.getDate() + 1);
        scheduledFor.setHours(9, 0, 0, 0);
      } else if (texto.includes('hoy')) {
        scheduledFor.setHours(scheduledFor.getHours() + 2);
      } else if (texto.match(/(\d+)\s*hora/)) {
        const horas = parseInt(texto.match(/(\d+)\s*hora/)![1]);
        scheduledFor = new Date();
        scheduledFor.setHours(scheduledFor.getHours() + horas);
      }

      // Guardar recordatorio
      await this.supabase.client
        .from('scheduled_followups')
        .insert({
          lead_id: null,
          rule_id: null,
          scheduled_for: scheduledFor.toISOString(),
          message_template: `📝 Recordatorio: ${texto}`,
          status: 'pending'
        });

      await this.twilio.sendWhatsAppMessage(from,
        `✅ *Recordatorio creado*\n\n` +
        `📝 ${texto}\n` +
        `⏰ ${scheduledFor.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}\n\n` +
        `_Te avisaré cuando sea el momento_`
      );
    } catch (e) {
      console.log('Error creando recordatorio:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al crear recordatorio.');
    }
  }

  private async vendedorResumenHoy(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const hoy = new Date();
      const hoyStr = hoy.toISOString().split('T')[0];
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

      // Citas de hoy
      const { data: citas } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('vendedor_id', vendedor.id)
        .eq('scheduled_date', hoyStr)
        .eq('status', 'scheduled');

      // Leads nuevos hoy
      const { data: nuevos } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .gte('created_at', inicioHoy);

      // Leads HOT
      const { data: hot } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['negotiation', 'reserved']);

      // Actividades hoy
      const { data: actividades } = await this.supabase.client
        .from('lead_activities')
        .select('*')
        .eq('created_by', vendedor.id)
        .gte('created_at', inicioHoy);

      const hora = hoy.getHours();
      const saludo = hora < 12 ? '☀️ Buenos días' : hora < 19 ? '🌤️ Buenas tardes' : '🌙 Buenas noches';

      await this.twilio.sendWhatsAppMessage(from,
        `${saludo} *${nombre}!*\n\n` +
        `*📅 HOY:*\n` +
        `• Citas: ${citas?.length || 0}\n` +
        `• Leads nuevos: ${nuevos?.length || 0}\n` +
        `• Actividades: ${actividades?.length || 0}\n\n` +
        `*🔥 PIPELINE:*\n` +
        `• Leads HOT: ${hot?.length || 0}\n\n` +
        `_Escribe *citas* para ver tu agenda_`
      );
    } catch (e) {
      console.log('Error en resumen hoy:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener resumen del día.');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COMANDOS VENDEDOR MEJORADOS V2 - FUNCIONES
  // ═══════════════════════════════════════════════════════════════

  // QUIÉN ES: Info completa de un lead
  private async vendedorQuienEs(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar lead
      let query = this.supabase.client
        .from('leads')
        .select('*, team_members!leads_assigned_to_fkey(name)')
        .ilike('name', '%' + nombreLead + '%')
        .order('updated_at', { ascending: false });
      
      if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
        query = query.eq('assigned_to', vendedor.id);
      }

      const { data: leads } = await query.limit(5);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
        return;
      }

      if (leads.length > 1) {
        let msg = `Encontré ${leads.length} leads:\n\n`;
        leads.forEach((l: any, i: number) => {
          msg += `${i+1}. *${l.name}*\n   📱 ${l.phone?.slice(-10) || 'Sin tel'}\n   📊 ${l.status}\n\n`;
        });
        msg += `Sé más específico con nombre completo.`;
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }

      const lead = leads[0];
      
      // Temperatura
      const hotStages = ['negotiation', 'reserved'];
      const clientStages = ['closed', 'delivered'];
      let temperatura = '❄️ Frío';
      if (clientStages.includes(lead.status)) temperatura = '🏆 CLIENTE';
      else if (hotStages.includes(lead.status)) temperatura = '🔥 HOT';
      else if (lead.score >= 70) temperatura = '🌡️ Tibio';

      // Etapa legible
      const etapas: Record<string, string> = {
        'new': '🆕 Nuevo',
        'contacted': '📞 Contactado',
        'scheduled': '📅 Cita agendada',
        'visited': '🏠 Visitó',
        'negotiation': '💰 Negociación',
        'reserved': '📝 Reservado',
        'closed': '✅ Cerrado',
        'delivered': '🔑 Entregado',
        'fallen': '❌ Caído'
      };

      // Días desde creación
      const creado = new Date(lead.created_at);
      const diasEnFunnel = Math.floor((Date.now() - creado.getTime()) / (1000 * 60 * 60 * 24));

      // Buscar última actividad
      const { data: ultimaAct } = await this.supabase.client
        .from('lead_activities')
        .select('activity_type, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Buscar citas
      const { data: citas } = await this.supabase.client
        .from('appointments')
        .select('date, status')
        .eq('lead_id', lead.id)
        .order('date', { ascending: false })
        .limit(3);

      let msg = `👤 *${lead.name}*\n`;
      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `📱 ${lead.phone || 'Sin teléfono'}\n`;
      msg += `📧 ${lead.email || 'Sin email'}\n\n`;
      
      msg += `📊 *ESTADO*\n`;
      msg += `• Etapa: ${etapas[lead.status] || lead.status}\n`;
      msg += `• Temp: ${temperatura}\n`;
      msg += `• Score: ${lead.score || 0}/100\n`;
      msg += `• Días en funnel: ${diasEnFunnel}\n\n`;

      if (lead.property_interest) {
        msg += `🏠 *INTERÉS*\n`;
        msg += `• Desarrollo: ${lead.property_interest}\n`;
        if (lead.quote_amount) msg += `• Cotización: $${lead.quote_amount.toLocaleString()}\n`;
        msg += `\n`;
      }

      msg += `📈 *ORIGEN*\n`;
      msg += `• Fuente: ${lead.source || 'Desconocida'}\n`;
      msg += `• Creado: ${creado.toLocaleDateString('es-MX')}\n`;
      
      if (ultimaAct) {
        const fechaAct = new Date(ultimaAct.created_at);
        msg += `• Última actividad: ${fechaAct.toLocaleDateString('es-MX')}\n`;
      }

      if (citas && citas.length > 0) {
        msg += `\n📅 *CITAS*\n`;
        citas.forEach((c: any) => {
          const fechaCita = new Date(c.date);
          const statusCita = c.status === 'completed' ? '✅' : c.status === 'cancelled' ? '❌' : '⏳';
          msg += `• ${statusCita} ${fechaCita.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}\n`;
        });
      }

      if (lead.notes && typeof lead.notes === 'object') {
        const notasTexto = Object.entries(lead.notes)
          .filter(([k, v]) => typeof v === 'string' && !k.startsWith('pending'))
          .map(([k, v]) => v)
          .join(', ');
        if (notasTexto) {
          msg += `\n📝 *NOTAS*\n${notasTexto.substring(0, 200)}\n`;
        }
      }

      msg += `\n_Escribe "coach ${lead.name.split(' ')[0]}" para tips de venta_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en vendedorQuienEs:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error buscando lead');
    }
  }

  // MIS HOT: Leads calientes asignados
  private async vendedorMisHot(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('id, name, phone, status, property_interest, quote_amount, updated_at')
        .eq('assigned_to', vendedor.id)
        .in('status', ['negotiation', 'reserved'])
        .order('updated_at', { ascending: false });

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 
          `${nombre}, no tienes leads HOT en este momento.\n\n` +
          `Los leads HOT son los que están en *negociación* o *reservado*.\n\n` +
          `_Escribe "mejor" para ver tu lead más avanzado._`
        );
        return;
      }

      let msg = `🔥 *TUS LEADS HOT*\n`;
      msg += `━━━━━━━━━━━━━━━\n\n`;

      let totalPotencial = 0;

      leads.forEach((lead: any, i: number) => {
        const diasSinMovimiento = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        const etapa = lead.status === 'negotiation' ? '💰 Negociación' : '📝 Reservado';
        const alerta = diasSinMovimiento > 2 ? ' ⚠️' : '';
        
        msg += `${i+1}. *${lead.name}*${alerta}\n`;
        msg += `   ${etapa}\n`;
        if (lead.property_interest) msg += `   🏠 ${lead.property_interest}\n`;
        if (lead.quote_amount) {
          msg += `   💵 $${(lead.quote_amount / 1000000).toFixed(1)}M\n`;
          totalPotencial += lead.quote_amount;
        }
        if (diasSinMovimiento > 0) msg += `   ⏰ ${diasSinMovimiento} días sin mov.\n`;
        msg += `\n`;
      });

      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `📊 Total HOT: ${leads.length}\n`;
      if (totalPotencial > 0) {
        msg += `💰 Potencial: $${(totalPotencial / 1000000).toFixed(1)}M\n`;
      }
      msg += `\n_⚠️ = +2 días sin movimiento_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en vendedorMisHot:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error obteniendo leads HOT');
    }
  }

  // PRÓXIMA CITA: Tu siguiente cita
  private async vendedorProximaCita(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const ahora = new Date();
      
      const { data: cita } = await this.supabase.client
        .from('appointments')
        .select('*, leads(name, phone, property_interest)')
        .eq('team_member_id', vendedor.id)
        .gte('date', ahora.toISOString())
        .in('status', ['scheduled', 'confirmed'])
        .order('date', { ascending: true })
        .limit(1)
        .single();

      if (!cita) {
        await this.twilio.sendWhatsAppMessage(from, 
          `${nombre}, no tienes citas próximas agendadas.\n\n` +
          `_Escribe "Cita mañana 5pm con Juan en Los Encinos" para agendar._`
        );
        return;
      }

      const fechaCita = new Date(cita.date);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaCitaDia = new Date(fechaCita);
      fechaCitaDia.setHours(0, 0, 0, 0);
      
      const diffDias = Math.floor((fechaCitaDia.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      
      let cuandoEs = '';
      if (diffDias === 0) cuandoEs = '📍 *HOY*';
      else if (diffDias === 1) cuandoEs = '📍 *MAÑANA*';
      else cuandoEs = `📍 En ${diffDias} días`;

      const hora = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const fechaStr = fechaCita.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

      let msg = `📅 *PRÓXIMA CITA*\n`;
      msg += `━━━━━━━━━━━━━━━\n\n`;
      msg += `${cuandoEs}\n`;
      msg += `🕐 ${hora}\n`;
      msg += `📆 ${fechaStr}\n\n`;
      msg += `👤 *${cita.leads?.name || 'Cliente'}*\n`;
      if (cita.leads?.phone) msg += `📱 ${cita.leads.phone.slice(-10)}\n`;
      if (cita.property_development || cita.leads?.property_interest) {
        msg += `🏠 ${cita.property_development || cita.leads?.property_interest}\n`;
      }
      if (cita.notes) msg += `\n📝 ${cita.notes}\n`;

      // Tiempo hasta la cita
      const diffMinutos = Math.floor((fechaCita.getTime() - ahora.getTime()) / (1000 * 60));
      if (diffMinutos < 60) {
        msg += `\n⏰ *¡En ${diffMinutos} minutos!*`;
      } else if (diffMinutos < 120) {
        msg += `\n⏰ En ~1 hora`;
      }

      msg += `\n\n_Escribe "llamar ${cita.leads?.name?.split(' ')[0] || 'cliente'}" para contactar_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en vendedorProximaCita:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error obteniendo próxima cita');
    }
  }

  // DISPONIBILIDAD: Huecos en agenda
  private async vendedorDisponibilidad(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Próximos 3 días
      const hoy = new Date();
      const en3Dias = new Date(hoy.getTime() + 3 * 24 * 60 * 60 * 1000);

      const { data: citas } = await this.supabase.client
        .from('appointments')
        .select('date')
        .eq('team_member_id', vendedor.id)
        .gte('date', hoy.toISOString())
        .lte('date', en3Dias.toISOString())
        .in('status', ['scheduled', 'confirmed'])
        .order('date', { ascending: true });

      // Horarios de trabajo: 9am - 7pm
      const horasOcupadas: Record<string, string[]> = {};
      
      if (citas) {
        citas.forEach((c: any) => {
          const fecha = new Date(c.date);
          const diaKey = fecha.toISOString().split('T')[0];
          const hora = fecha.getHours();
          if (!horasOcupadas[diaKey]) horasOcupadas[diaKey] = [];
          horasOcupadas[diaKey].push(`${hora}:00`);
        });
      }

      let msg = `📅 *TU DISPONIBILIDAD*\n`;
      msg += `━━━━━━━━━━━━━━━\n\n`;

      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      
      for (let i = 0; i < 3; i++) {
        const dia = new Date(hoy.getTime() + i * 24 * 60 * 60 * 1000);
        const diaKey = dia.toISOString().split('T')[0];
        const nombreDia = i === 0 ? 'HOY' : i === 1 ? 'MAÑANA' : diasSemana[dia.getDay()].toUpperCase();
        
        const ocupadas = horasOcupadas[diaKey] || [];
        const libres: string[] = [];
        
        // Horarios disponibles (9am - 6pm, cada 2 horas)
        for (let h = 9; h <= 18; h += 2) {
          if (!ocupadas.includes(`${h}:00`)) {
            libres.push(`${h}:00`);
          }
        }

        msg += `*${nombreDia}* (${dia.getDate()}/${dia.getMonth() + 1})\n`;
        if (libres.length === 0) {
          msg += `❌ Sin disponibilidad\n`;
        } else if (libres.length >= 4) {
          msg += `✅ Disponible todo el día\n`;
        } else {
          msg += `✅ Libre: ${libres.slice(0, 3).join(', ')}\n`;
        }
        if (ocupadas.length > 0) {
          msg += `📅 Citas: ${ocupadas.length}\n`;
        }
        msg += `\n`;
      }

      msg += `_Para agendar: "Cita mañana 3pm con Juan"_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en vendedorDisponibilidad:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error obteniendo disponibilidad');
    }
  }

  // ENVIAR INFO A LEAD: Manda info de desarrollo a un lead
  private async vendedorEnviarInfoALead(from: string, desarrollo: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar lead
      let query = this.supabase.client
        .from('leads')
        .select('id, name, phone')
        .ilike('name', '%' + nombreLead + '%');
      
      if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
        query = query.eq('assigned_to', vendedor.id);
      }

      const { data: leads } = await query.limit(3);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
        return;
      }

      if (leads.length > 1) {
        let msg = `Encontré varios:\n`;
        leads.forEach((l: any, i: number) => {
          msg += `${i+1}. ${l.name}\n`;
        });
        msg += `\nSé más específico.`;
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }

      const lead = leads[0];

      // Buscar desarrollo
      const { data: props } = await this.supabase.client
        .from('properties')
        .select('*')
        .or(`development.ilike.%${desarrollo}%,name.ilike.%${desarrollo}%`)
        .limit(1);

      if (!props || props.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, 
          `❌ No encontré el desarrollo *${desarrollo}*\n\n` +
          `_Escribe "propiedades" para ver disponibles_`
        );
        return;
      }

      const prop = props[0];
      const leadPhone = this.formatPhoneMX(lead.phone);

      // Enviar info al lead
      let msgLead = `¡Hola ${lead.name.split(' ')[0]}! 👋\n\n`;
      msgLead += `Tu asesor *${vendedor.name}* te envía información sobre:\n\n`;
      msgLead += `🏠 *${prop.development || prop.name}*\n`;
      if (prop.model) msgLead += `📐 Modelo: ${prop.model}\n`;
      if (prop.price) msgLead += `💰 Desde: $${prop.price.toLocaleString()}\n`;
      if (prop.bedrooms) msgLead += `🛏️ ${prop.bedrooms} recámaras\n`;
      if (prop.size) msgLead += `📏 ${prop.size} m²\n`;
      if (prop.description) msgLead += `\n${prop.description.substring(0, 200)}...\n`;
      msgLead += `\n¿Te gustaría agendar una visita? 🏡`;

      await this.twilio.sendWhatsAppMessage(leadPhone, msgLead);

      // Actualizar lead
      await this.supabase.client
        .from('leads')
        .update({ 
          property_interest: prop.development || prop.name,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      // Registrar actividad
      await this.supabase.client.from('lead_activities').insert({
        lead_id: lead.id,
        team_member_id: vendedor.id,
        activity_type: 'whatsapp',
        notes: `Envió info de ${prop.development || prop.name}`
      });

      // Confirmar al vendedor
      await this.twilio.sendWhatsAppMessage(from, 
        `✅ Info enviada a *${lead.name}*\n\n` +
        `📤 ${prop.development || prop.name}\n` +
        `📱 ${lead.phone.slice(-10)}\n\n` +
        `_Te avisaré cuando responda_`
      );

    } catch (error) {
      console.error('Error en vendedorEnviarInfoALead:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error enviando info');
    }
  }

  // RESUMEN LEAD: Resumen ejecutivo de un lead
  private async vendedorResumenLead(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      let query = this.supabase.client
        .from('leads')
        .select('*')
        .ilike('name', '%' + nombreLead + '%')
        .order('updated_at', { ascending: false });
      
      if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
        query = query.eq('assigned_to', vendedor.id);
      }

      const { data: leads } = await query.limit(1);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
        return;
      }

      const lead = leads[0];

      // Contar actividades
      const { count: numActividades } = await this.supabase.client
        .from('lead_activities')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', lead.id);

      // Contar citas
      const { count: numCitas } = await this.supabase.client
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', lead.id);

      const diasEnFunnel = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      
      const etapas: Record<string, string> = {
        'new': '🆕 Nuevo', 'contacted': '📞 Contactado', 'scheduled': '📅 Cita',
        'visited': '🏠 Visitó', 'negotiation': '💰 Negociación', 'reserved': '📝 Reservado',
        'closed': '✅ Cerrado', 'delivered': '🔑 Entregado', 'fallen': '❌ Caído'
      };

      let msg = `📋 *RESUMEN: ${lead.name}*\n`;
      msg += `━━━━━━━━━━━━━━━\n\n`;
      msg += `📊 Etapa: ${etapas[lead.status] || lead.status}\n`;
      msg += `⭐ Score: ${lead.score || 0}/100\n`;
      msg += `📅 ${diasEnFunnel} días en funnel\n`;
      msg += `📞 ${numActividades || 0} actividades\n`;
      msg += `🗓️ ${numCitas || 0} citas\n\n`;
      
      if (lead.property_interest) msg += `🏠 Interés: ${lead.property_interest}\n`;
      if (lead.quote_amount) msg += `💰 Cotización: $${lead.quote_amount.toLocaleString()}\n`;
      if (lead.source) msg += `📣 Fuente: ${lead.source}\n`;
      
      msg += `\n_"coach ${lead.name.split(' ')[0]}" para tips_`;

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (error) {
      console.error('Error en vendedorResumenLead:', error);
      await this.twilio.sendWhatsAppMessage(from, '❌ Error obteniendo resumen');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VOICE AI - Funciones de llamadas
  // ═══════════════════════════════════════════════════════════════

  private async vendedorLlamar(from: string, nombreLead: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar lead
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .ilike('name', '%' + nombreLead + '%')
        .limit(3);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
        return;
      }

      if (leads.length > 1) {
        let msg = `Encontré ${leads.length} leads:\n\n`;
        for (const l of leads) {
          const tel = l.phone?.slice(-10) || 'Sin tel';
          msg += `• *${l.name}* - ${tel}\n`;
        }
        msg += '\n_Sé más específico con el nombre_';
        await this.twilio.sendWhatsAppMessage(from, msg);
        return;
      }

      const lead = leads[0];
      const telefono = lead.phone?.replace(/\D/g, '').slice(-10) || '';

      if (!telefono) {
        await this.twilio.sendWhatsAppMessage(from, `❌ *${lead.name}* no tiene teléfono registrado`);
        return;
      }

      // Registrar actividad de llamada
      await this.supabase.client.from('lead_activities').insert({
        lead_id: lead.id,
        type: 'call',
        description: 'Llamada iniciada desde WhatsApp',
        created_by: vendedor.id
      });

      // Actualizar lead
      await this.supabase.client.from('leads').update({
        updated_at: new Date().toISOString(),
        last_contact: new Date().toISOString()
      }).eq('id', lead.id);

      await this.twilio.sendWhatsAppMessage(from,
        `📞 *LLAMAR A ${lead.name?.toUpperCase()}*\n\n` +
        `👆 Toca para llamar:\n` +
        `tel:+52${telefono}\n\n` +
        `O marca: *${telefono.slice(0,3)}-${telefono.slice(3,6)}-${telefono.slice(6)}*\n\n` +
        `_Cuando termines, escribe "llamé a ${lead.name?.split(' ')[0]}" para registrar_`
      );
    } catch (e) {
      console.log('Error en llamar:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al procesar llamada.');
    }
  }

  private async vendedorProgramarLlamada(from: string, nombreLead: string, cuando: string, vendedor: any, nombre: string): Promise<void> {
    try {
      // Buscar lead
      const { data: leads } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .ilike('name', '%' + nombreLead + '%')
        .limit(1);

      if (!leads || leads.length === 0) {
        await this.twilio.sendWhatsAppMessage(from, `❌ No encontré a *${nombreLead}*`);
        return;
      }

      const lead = leads[0];

      // Calcular hora del recordatorio
      let scheduledFor = new Date();
      const cuandoLower = cuando.toLowerCase();

      if (cuandoLower.includes('mañana')) {
        scheduledFor.setDate(scheduledFor.getDate() + 1);
        scheduledFor.setHours(9, 0, 0, 0);
      } else if (cuandoLower.includes('hora')) {
        const horas = parseInt(cuandoLower.match(/(\d+)/)?.[1] || '1');
        scheduledFor.setHours(scheduledFor.getHours() + horas);
      } else if (cuandoLower.match(/(\d{1,2})\s*(am|pm)/i)) {
        const match = cuandoLower.match(/(\d{1,2})\s*(am|pm)/i);
        let hora = parseInt(match![1]);
        if (match![2].toLowerCase() === 'pm' && hora < 12) hora += 12;
        if (match![2].toLowerCase() === 'am' && hora === 12) hora = 0;
        scheduledFor.setHours(hora, 0, 0, 0);
        if (scheduledFor < new Date()) scheduledFor.setDate(scheduledFor.getDate() + 1);
      }

      // Crear recordatorio
      await this.supabase.client.from('scheduled_followups').insert({
        lead_id: lead.id,
        rule_id: null,
        scheduled_for: scheduledFor.toISOString(),
        message_template: `📞 Recordatorio: Llamar a ${lead.name}\nTel: ${lead.phone?.slice(-10)}`,
        status: 'pending'
      });

      const fechaFormato = scheduledFor.toLocaleString('es-MX', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      await this.twilio.sendWhatsAppMessage(from,
        `⏰ *LLAMADA PROGRAMADA*\n\n` +
        `👤 *${lead.name}*\n` +
        `📅 ${fechaFormato}\n\n` +
        `_Te avisaré cuando sea el momento_`
      );
    } catch (e) {
      console.log('Error programando llamada:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al programar llamada.');
    }
  }

  private async vendedorLlamadasPendientes(from: string, vendedor: any, nombre: string): Promise<void> {
    try {
      const hace3dias = new Date();
      hace3dias.setDate(hace3dias.getDate() - 3);

      // Leads que necesitan llamada (new sin contactar, scheduled sin confirmar)
      const { data: porLlamar } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['new', 'contacted', 'scheduled'])
        .lt('updated_at', hace3dias.toISOString())
        .order('score', { ascending: false })
        .limit(5);

      // Leads HOT que necesitan seguimiento
      const { data: hotPendientes } = await this.supabase.client
        .from('leads')
        .select('*')
        .eq('assigned_to', vendedor.id)
        .in('status', ['visited', 'negotiation', 'reserved'])
        .order('score', { ascending: false })
        .limit(3);

      let msg = `📞 *LLAMADAS PENDIENTES*\n${nombre}\n\n`;

      if (hotPendientes && hotPendientes.length > 0) {
        msg += `*🔥 URGENTES (HOT):*\n`;
        for (const l of hotPendientes) {
          const tel = l.phone?.slice(-10) || '';
          msg += `• *${l.name}* - ${l.status}\n`;
          msg += `  tel:+52${tel}\n`;
        }
        msg += '\n';
      }

      if (porLlamar && porLlamar.length > 0) {
        msg += `*⏳ SIN CONTACTAR (+3 días):*\n`;
        for (const l of porLlamar) {
          const tel = l.phone?.slice(-10) || '';
          msg += `• *${l.name}* - ${l.status}\n`;
          msg += `  tel:+52${tel}\n`;
        }
      }

      if ((!porLlamar || porLlamar.length === 0) && (!hotPendientes || hotPendientes.length === 0)) {
        msg = `✅ *${nombre}*, no tienes llamadas pendientes urgentes!\n\n_Buen trabajo manteniéndote al día_ 💪`;
      } else {
        msg += '\n_Toca el número para llamar_';
      }

      await this.twilio.sendWhatsAppMessage(from, msg);
    } catch (e) {
      console.log('Error en llamadas pendientes:', e);
      await this.twilio.sendWhatsAppMessage(from, 'Error al obtener llamadas pendientes.');
    }
  }

    // ═══════════════════════════════════════════════════════════
  // OBTENER O CREAR LEAD
  // ═══════════════════════════════════════════════════════════

  private async getOrCreateLead(phone: string): Promise<any> {
    // Normalizar telefono: extraer ultimos 10 digitos y agregar 521
    const digits = phone.replace(/\D/g, '').slice(-10);
    const normalizedPhone = '521' + digits;
    
    // Buscar por ultimos 10 digitos (flexible)
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .like('phone', '%' + digits)
      .order('survey_step', { ascending: false });
    
    // Priorizar lead con encuesta activa o con nombre
    const existingLead = leads && leads.length > 0 
      ? leads.find((l: any) => l.survey_step > 0) || leads.find((l: any) => l.name) || leads[0] 
      : null;

    if (existingLead) {
      console.log('📋 Lead existente:', existingLead.id);
      return existingLead;
    }

    const vendedor = await this.getVendedorMenosCarga();
    
    const newLead = {
      phone: normalizedPhone,
      conversation_history: [],
      score: 0,
      status: 'new',
      assigned_to: vendedor?.id,
      needs_mortgage: null,
      mortgage_data: {},
      lead_score: 0,
      lead_category: 'cold'
    };

    console.log('ðŸ“ Creando lead...');
    const { data, error } = await this.supabase.client
      .from('leads')
      .insert([newLead])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creando lead:', error);
      return newLead;
    }

    console.log('✅ Lead creado:', data.id);
    return data;
  }

  private async getVendedorMenosCarga(): Promise<any> {
    const { data: vendedores } = await this.supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'vendedor')
      .eq('active', true);

    if (!vendedores?.length) return null;

    const now = new Date();
    const horaActual = now.getHours();
    const diaActual = now.getDay(); // 0=Dom, 1=Lun...
    const fechaHoy = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Obtener disponibilidades de hoy
    const { data: disponibilidades } = await this.supabase.client
      .from('vendor_availability')
      .select('*')
      .eq('specific_date', fechaHoy);

    // Verificar si hoy es día festivo (cerrado para todos)
    const esFestivo = disponibilidades?.some(d => 
      d.type === 'bloqueado' && !d.notas?.toLowerCase().includes('vacaciones')
    );

    // Si es festivo, buscar guardia
    if (esFestivo) {
      const guardiaVendedor = disponibilidades?.find(d => 
        d.type === 'guardia' && d.desarrollo === 'vendedor'
      );
      if (guardiaVendedor) {
        const vendedorGuardia = vendedores.find(v => v.id === guardiaVendedor.team_member_id);
        if (vendedorGuardia) {
          console.log('🛡️ Día festivo - Asignando a guardia:', vendedorGuardia.name);
          return vendedorGuardia;
        }
      }
      console.log('⚠️ Día festivo sin guardia asignada');
      return null;
    }

    // IDs de vendedores en vacaciones hoy
    const enVacaciones = disponibilidades
      ?.filter(d => d.type === 'vacaciones' || (d.type === 'bloqueado' && d.notas?.toLowerCase().includes('vacaciones')))
      .map(d => d.team_member_id) || [];

    // Verificar si hay guardia asignada para hoy (domingo u otro día especial)
    const guardiaHoy = disponibilidades?.find(d => 
      d.type === 'guardia' && d.desarrollo === 'vendedor'
    );

    // Si hay guardia asignada para hoy, usar esa persona
    if (guardiaHoy) {
      const vendedorGuardia = vendedores.find(v => v.id === guardiaHoy.team_member_id);
      if (vendedorGuardia && !enVacaciones.includes(vendedorGuardia.id)) {
        console.log('🛡️ Guardia del día asignada:', vendedorGuardia.name);
        return vendedorGuardia;
      }
    }

    // Filtrar vendedores disponibles
    const vendedoresDisponibles = vendedores.filter(v => {
      // Excluir los que están de vacaciones
      if (enVacaciones.includes(v.id)) {
        console.log(`🏖️ ${v.name} está de vacaciones, saltando...`);
        return false;
      }

      // Verificar horario
      const horaInicio = v.hora_inicio || 9;
      const horaFin = v.hora_fin || 19;
      const diasLaborales = (v.dias_laborales || '1,2,3,4,5,6').split(',').map(Number);
      
      const enHorario = horaActual >= horaInicio && horaActual < horaFin;
      const enDiaLaboral = diasLaborales.includes(diaActual);
      
      return enHorario && enDiaLaboral;
    });

    // Si no hay nadie disponible, usar todos excepto los de vacaciones
    const candidatos = vendedoresDisponibles.length > 0 
      ? vendedoresDisponibles 
      : vendedores.filter(v => !enVacaciones.includes(v.id));

    if (candidatos.length === 0) {
      console.log('⚠️ No hay vendedores disponibles (todos de vacaciones)');
      return null;
    }

    // Round-robin por carga de trabajo
    const conCarga = await Promise.all(candidatos.map(async (v) => {
      const { count } = await this.supabase.client
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', v.id)
        .in('status', ['new', 'contacted', 'scheduled']);
      return { ...v, carga: count || 0 };
    }));

    conCarga.sort((a, b) => a.carga - b.carga);
    console.log('✅ Vendedor asignado:', conCarga[0].name, '(carga:', conCarga[0].carga, ')');
    return conCarga[0];
  }


  // ═══════════════════════════════════════════════════════════════
  // HELPER: Obtener URL del brochure
  // ═══════════════════════════════════════════════════════════════
  private getBrochureUrl(desarrollo: string, modelo?: string): string {
    const brochureBase = 'https://brochures-santarita.pages.dev';
    
    // Mapeo de desarrollo a archivo
    const devToFile: Record<string, string> = {
      'alpes': 'alpes',
      'andes': 'andes',
      'distrito falco': 'distrito_falco',
      'falco': 'distrito_falco',
      'los encinos': 'los_encinos',
      'encinos': 'los_encinos',
      'miravalle': 'miravalle',
      'monte real': 'monte_real',
      'monte verde': 'monte_verde',
      'villa campelo': 'villa_campelo',
      'campelo': 'villa_campelo'
    };
    
    // Buscar el archivo correcto
    const devLower = desarrollo.toLowerCase();
    let fileName = '';
    for (const [key, value] of Object.entries(devToFile)) {
      if (devLower.includes(key)) {
        fileName = value;
        break;
      }
    }
    
    if (!fileName) return '';
    
    // Si hay modelo, agregar ancla
    if (modelo) {
      const anchor = modelo.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/í/g, 'i')
        .replace(/á/g, 'a')
        .replace(/é/g, 'e')
        .replace(/ó/g, 'o')
        .replace(/ú/g, 'u')
        .replace(/ñ/g, 'n');
      return `${brochureBase}/${fileName}.html#${anchor}`;
    }
    
    return `${brochureBase}/${fileName}.html`;
  }

  private async getAllProperties(): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from('properties')
      .select('*');
    
    if (error) {
      console.error('❌ Error cargando properties:', error);
      return [];
    }
    
    console.log(`ðŸ“¦ Properties cargadas: ${data?.length || 0}`);
    return data || [];
  }

  private async getAllTeamMembers(): Promise<any[]> {
    const { data } = await this.supabase.client
      .from('team_members')
      .select("*");
    console.log("ðŸ” getAllTeamMembers RAW:", JSON.stringify(data)); return data || [];
  }

  // ═══════════════════════════════════════════════════════════
  // ANÍLISIS CON IA - EL CEREBRO
  // ═══════════════════════════════════════════════════════════

  private async analyzeWithAI(message: string, lead: any, properties: any[]): Promise<AIAnalysis> {
    
    // Formatear historial para OpenAI - asegurar que content sea siempre string
    const historialParaOpenAI = (lead?.conversation_history || [])
      .slice(-8)
      .map((m: any) => ({ 
        role: m.role, 
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) 
      }))
      .filter((m: any) => m.content && typeof m.content === 'string');

    // Verificar si ya existe cita confirmada para este lead
    let citaExistenteInfo = '';
    try {
      const { data: citaExistente } = await this.supabase.client
        .from('appointments')
        .select('scheduled_date, scheduled_time, property_name')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (citaExistente && citaExistente.length > 0) {
        const cita = citaExistente[0];
        citaExistenteInfo = `✅ YA TIENE CITA CONFIRMADA: ${cita.scheduled_date} a las ${cita.scheduled_time} en ${cita.property_name}`;
        console.log('🚫 CITA EXISTENTE DETECTADA:', citaExistenteInfo);
      } else {
        console.log('📅 No hay cita existente para este lead');
      }
    } catch (e) {
      console.log('âš ï¸ Error verificando cita existente para prompt:', e);
    }

    // Crear catálogo desde DB
    const catalogoDB = this.crearCatalogoDB(properties);
    console.log('📋 Catálogo generado:', catalogoDB.substring(0, 500) + '...');

    const prompt = `
âš ï¸ INSTRUCCIÓN CRÍTICA: Debes responder ÚNICAMENTE con un objeto JSON válido.
NO escribas texto antes ni después del JSON. Tu respuesta debe empezar con { y terminar con }.

Eres SARA, una **agente inmobiliaria HUMANA y conversacional** de Grupo Santa Rita en Zacatecas, México.

Tu objetivo:
- Ayudar a la persona a encontrar la mejor casa según su vida real.
- Hablar como asesora profesional mexicana, NO como robot ni formulario.
- Generar confianza, emoción y claridad.
- Vender sin presión, pero con seguridad y entusiasmo.

Respondes SIEMPRE en español neutro mexicano, con tono cálido, cercano y profesional.
Usa emojis con moderación: máximo 1â€“2 por mensaje, solo donde sumen emoción.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SOBRE GRUPO SANTA RITA (INFORMACIÓN DE LA EMPRESA)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ðŸ¢ **QUIÉNES SOMOS:**
- Constructora líder en Zacatecas desde 1972 (más de 50 años de experiencia)
- Slogan: "Construyendo confianza desde 1972"
- #OrgulloZacatecano #ConstruimosZacatecas
- Pioneros en desarrollos habitacionales que se han convertido en centros productivos

📍 **OFICINA:**
- Av. Cumbres No. 110, Fracc. Colinas del Vergel, Zacatecas, Zac. C.P. 98085
- Tel: (492) 924 77 78
- WhatsApp: (492) 173 09 05

🎯 **FILOSOFÍA:**
- Desarrollos que trascienden más allá de la construcción
- Elevar la calidad de vida de la comunidad
- Innovación tecnológica constante
- Compromiso con el medio ambiente (proyectos sostenibles)
- Estudios detallados del entorno antes de construir
- Armonía con el paisaje y diseño arquitectónico único

🏆 **¿POR QUÉ ELEGIRNOS? (usa esto cuando pregunten):**
- 50+ años construyendo en Zacatecas
- Materiales de primera calidad
- Diseños que superan expectativas
- Ubicaciones estratégicas con plusvalía
- Acabados premium en cada casa
- Privadas con seguridad y amenidades
- Financiamiento flexible (Infonavit, Fovissste, bancario)
- Equipo de asesores VIP personalizados

ðŸ”§ **CALIDAD DE CONSTRUCCIÓN (usa esto cuando pregunten por materiales/calidad):**
- Análisis del suelo antes de construir
- Cimientos y estructuras reforzadas
- Instalaciones eléctricas e hidráulicas de alta calidad
- Acabados de lujo (pisos, cocinas, baños)
- Garantía de construcción
- Supervisión constante de obra

💡 **SI PREGUNTAN POR QUÉ EL PRECIO:**
"Nuestros precios reflejan 50 años de experiencia, materiales premium, ubicaciones con plusvalía, y el respaldo de la constructora más confiable de Zacatecas. No solo compras una casa, compras tranquilidad y un patrimonio que crece."

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CUANDO PIDE INFORMACIÓN GENERAL (sin mencionar desarrollo específico)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸ Si el cliente dice:
- "quiero información"
- "qué tienen disponible"
- "qué casas venden"
- "cuánto cuestan sus casas"
- "info"
- "hola quiero comprar casa"

DEBES responder con la lista de TODOS los desarrollos disponibles:

"¡Hola! 😊 Soy SARA de Grupo Santa Rita, constructora líder en Zacatecas desde 1972.

Te presento nuestros desarrollos:

🏡 *Los Encinos* - Desde $2.4M
â†’ Casas amplias en privada, ideal para familias.

🏡 *Miravalle* - Desde $3.5M
â†’ Diseño moderno con roof garden.

🏡 *Distrito Falco* - Desde $3.6M
â†’ Zona de alta plusvalía en Guadalupe.

🏡 *Monte Verde* - Desde $1.3M
â†’ Ambiente familiar y naturaleza.

🏡 *Andes* - Desde $1.5M
â†’ Excelente ubicación en Guadalupe.

🏡 *Villa Campelo* - Desde $1.8M
â†’ Privada con amenidades.

¿Cuál te gustaría conocer más a detalle? 😊"

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸âš ï¸âš ï¸ DIFERENCIA CRÍTICA: VENDEDOR vs ASESOR DE CRÉDITO âš ï¸âš ï¸âš ï¸
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SON ROLES DIFERENTES:
- VENDEDOR = Vende casas, muestra desarrollos, atiende visitas
- ASESOR DE CRÉDITO/ASESOR VIP = Solo para trámites de crédito hipotecario con bancos

âš ï¸ NUNCA confundas estos roles. Si pide vendedor, NO le ofrezcas asesor VIP.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CUANDO QUIERE HABLAR CON VENDEDOR/PERSONA REAL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸ Si el cliente dice:
- "quiero hablar con un vendedor"
- "pásame con una persona real"
- "prefiero hablar por teléfono"
- "hay alguien que me pueda atender?"
- "me pueden llamar?"
- "quiero que me llamen"
- "mejor llámame"

DEBES:
1) Si NO tienes nombre â†’ Pedir nombre: "¡Claro! Para conectarte con un vendedor, ¿me das tu nombre?"
2) Si NO tienes celular â†’ Pedir celular: "¡Perfecto [nombre]! ¿Me das tu número para que el vendedor te contacte?"
3) Si tienes nombre Y celular â†’ Responder:
   "¡Listo [nombre]! Ya notifiqué a nuestro equipo de ventas para que te contacten pronto.
   
   ¿Hay algún desarrollo en particular que te interese para pasarle el dato al vendedor?"
4) Activar contactar_vendedor: true en el JSON (NO send_contactos)

âš ï¸ IMPORTANTE: Después de conectar con vendedor, NO preguntes si quiere asesor VIP ni menciones crédito.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ESTILO DE RESPUESTA Y FORMATO VISUAL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
- 2 a 5 frases por mensaje, no una línea seca.
- Frases cortas, naturales, como chat de WhatsApp.
- Siempre mezcla EMOCIÓN + INFORMACIÓN concreta.
- Cierra casi siempre con una PREGUNTA que haga avanzar la conversación.

âš ï¸ FORMATO VISUAL OBLIGATORIO:
Cuando listes opciones, desarrollos o información estructurada, USA:
- Saltos de línea entre secciones (\\n\\n)
- Viñetas con â€¢ para listas
- Negritas con *texto* para nombres de desarrollos y modelos
- Separación clara entre cada opción

Ejemplo CORRECTO (fácil de leer):
"¡Claro [nombre]! 😊 Te resumo nuestros desarrollos:

â€¢ *Monte Verde*: 2-3 recámaras, ambiente familiar, desde $1.3M

â€¢ *Los Encinos*: 3 recámaras, 3 plantas, ideal familias grandes

â€¢ *Distrito Falco*: Premium, acabados de lujo, 1 planta

¿Cuál te llama más la atención?"

Ejemplo INCORRECTO (difícil de leer):
"Tenemos Monte Verde con 2-3 recámaras y ambiente familiar desde 1.3M, también Los Encinos con 3 recámaras y 3 plantas ideal para familias grandes, y Distrito Falco que es premium con acabados de lujo en 1 planta. ¿Cuál te interesa?"

Prohibido:
- Respuestas genéricas tipo "tenemos varias opciones que se adaptan a ti".
- Relleno vacío tipo "estoy para ayudarte en lo que necesites".
- Sonar como PDF o landing.
- Texto corrido sin estructura cuando hay múltiples opciones.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CATÍLOGO DESDE BASE DE DATOS (USO OBLIGATORIO)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Tienes este catálogo de desarrollos y modelos:

${catalogoDB}

REGLAS:
1) Cuando el cliente pida "opciones", "resumen", "qué tienen", "qué manejan", "qué casas tienes", DEBES:
   - Mencionar SIEMPRE mínimo **2 desarrollos por NOMBRE** del catálogo.
   - Explicar en 1 frase qué los hace diferentes (zona, número de recámaras, nivel, etc.).
   - Ejemplo de estructura:
     - "En Zacatecas tenemos *Monte Verde* (familias que quieren 2â€“3 recámaras y amenidades) y *Monte Real* (más exclusivo, con salón de eventos y gimnasio)."
2) Nunca digas solo "tenemos varios desarrollos" sin nombrarlos.
3) Si ya sabes la zona o presupuesto, prioriza los desarrollos que mejor encajen.
4) Cuando recomiendes modelos, usa el formato:
   - "Dentro de Monte Verde te quedarían súper bien los modelos Fresno y Olivo: 3 recámaras, cochera para 2 autos y áreas verdes para la familia."

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FLUJO OBLIGATORIO DE CONVERSACIÓN
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
PASO 1: SALUDO â†’ Cálido, emocional y pide nombre (si no lo tienes)
- "¡Hola! 😊 Qué emoción que estés buscando tu nuevo hogar. Soy SARA de Grupo Santa Rita y me encantaría ayudarte a encontrar ese lugar especial donde vas a crear recuerdos increíbles. ¿Cómo te llamas?"

PASO 2: DESPUÉS de tener nombre â†’ Conecta emocionalmente
- "¡Mucho gusto [nombre]! 🏠 Cuéntame, ¿ya tienes algo en mente o apenas estás empezando a soñar con tu nueva casa?"

PASO 3: Entiende necesidades (zona, recámaras, presupuesto)
- Haz preguntas naturales, una a la vez, mezclando comentarios cálidos:
  - "¿Te gustaría vivir en Zacatecas o en Guadalupe?"
  - "¿Buscas 2 o 3 recámaras?"
  - "¿Más o menos en qué presupuesto te quieres mover?"

PASO 4: Recomienda desarrollo + modelos con frases vendedoras
- Siempre menciona:
  1) Nombre del desarrollo.
  2) 1â€“3 modelos con sus ventajas.
  3) Por qué encajan con lo que dijo la persona.

PASO 5: CUANDO QUIERA VISITAR/CONOCER â†’ Verificar datos antes de agendar
âš ï¸ CRÍTICO: Antes de confirmar una cita DEBES tener LOS 3:
  1) NOMBRE del cliente
  2) CELULAR del cliente
  3) FECHA Y HORA de la visita

SECUENCIA OBLIGATORIA (sigue este orden EXACTO):
1. Si NO tienes nombre â†’ Pide nombre: "¡Con gusto! Para agendarte, ¿me compartes tu nombre?"
2. Si tienes nombre pero NO celular â†’ Pide celular: "¡Perfecto [nombre]! ¿Me compartes tu celular para confirmarte?"
3. Si tienes nombre Y celular pero NO fecha/hora â†’ âš ï¸ OBLIGATORIO pedir fecha/hora: "¡Listo [nombre]! ¿Qué día y hora te gustaría visitarnos?"
4. SOLO cuando tengas nombre + celular + fecha + hora â†’ Confirma cita

🚫🚫🚫 PROHIBIDO 🚫🚫🚫
- NUNCA digas "¡Listo! Te agendo..." si NO tienes fecha y hora
- NUNCA confirmes cita sin los 3 datos completos
- NUNCA saltes a preguntar por crédito sin haber confirmado la cita primero

PASO 6: AL CONFIRMAR CITA â†’ SIEMPRE pregunta por crédito
âš ï¸ OBLIGATORIO: Cuando confirmes la cita, SIEMPRE termina con:
"¿Te gustaría que te ayudemos con el crédito hipotecario? Responde *SÍ* para orientarte 😊"

Ejemplo de confirmación completa:
"¡Listo [nombre]! Te agendo para [fecha] a las [hora] en *[desarrollo]*. Te esperamos con mucho gusto. 😊

¿Te gustaría que te ayudemos con el crédito hipotecario? Responde *SÍ* para orientarte 😊"

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INTERPRETACIÓN DE CRÉDITO
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸ CRÍTICO - "NO NECESITO CRÉDITO":
- Si dice "no necesito crédito", "no ocupo crédito", "tengo recursos", "pago de contado" â†’ TIENE RECURSOS PROPIOS
- NO le ofrezcas corrida financiera
- NO le preguntes cuánto gana
- Si NO tiene cita: "¡Perfecto! Entonces, ¿qué día y hora te gustaría visitar?"
- Si YA tiene cita: "¡Perfecto! Te esperamos en tu cita. ¿Necesitas algo más?"

âš ï¸ CRÍTICO - "SÍ NECESITO CRÉDITO":
- Si dice "sí necesito", "necesito apoyo", "quisiera que me ayudaran" â†’ NECESITA CRÉDITO
- Ofrece corrida financiera y pregunta ingreso

âš ï¸ CRÍTICO - DESPUÉS DE CORRIDA FINANCIERA:
- Si YA tiene cita agendada â†’ NO digas "¿te gustaría visitar las casas?"
- En su lugar PREGUNTA: "¿Te gustaría que te conectemos con uno de nuestros asesores VIP para ayudarte con el crédito?"
- âš ï¸ NO ACTIVES send_contactos: true todavía. Espera a que el cliente responda "sí".
- Solo cuando el cliente responda "sí", "claro", "dale", etc. ENTONCES activas send_contactos: true

âš ï¸ CRÍTICO - "YA AGENDÉ" / "YA TENGO CITA":
- Si el cliente dice "ya agendé", "ya tengo cita", "ya quedamos" â†’ NO crees otra cita
- Confirma su cita existente y pregunta si necesita algo más
- Ejemplo: "¡Perfecto [nombre]! Ya tienes tu cita confirmada. ¿Te gustaría que te conectemos con un asesor para el crédito?"
- âš ï¸ NO actives send_contactos hasta que confirme

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
RESPUESTAS CORTAS ("SÍ", "OK", "DALE")
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸ CRÍTICO: Si el mensaje anterior de SARA preguntó sobre visita/conocer y el cliente responde:
- "sí", "si", "ok", "dale", "claro", "por favor", "me interesa", "quiero"

Entonces el cliente QUIERE VISITAR. Tu respuesta debe ser:
- Si NO tienes nombre: "¡Perfecto! 😊 Para agendarte, ¿me compartes tu nombre?"
- Si tienes nombre pero NO celular: "¡Perfecto [nombre]! ¿Me compartes tu celular para confirmarte?"
- Si tienes nombre Y celular: "¡Perfecto [nombre]! ¿Qué día y hora te gustaría visitarnos?"

El intent debe ser "solicitar_cita", NO "interes_desarrollo".

âš ï¸ CRÍTICO: Si el mensaje anterior de SARA preguntó sobre ASESOR/CRÉDITO y el cliente responde:
- "sí", "si", "ok", "dale", "claro", "por favor", "quiero asesor", "ayúdame con el crédito"

Entonces el cliente QUIERE ASESOR. Tu respuesta debe ser:
- "¡Perfecto [nombre]! Te voy a conectar con uno de nuestros asesores VIP."
- âš ï¸ AHORA SÍ activa send_contactos: true

âš ï¸ NO respondas con frases genéricas como:
- "Si tienes alguna pregunta..."
- "Estoy aquí para ayudarte..."
- "Házmelo saber..."

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸âš ï¸âš ï¸ DETECCIÓN DE RESPUESTAS FUERA DE CONTEXTO âš ï¸âš ï¸âš ï¸
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ERES INTELIGENTE. Si el usuario responde algo que NO corresponde a lo que preguntaste, DEBES:

1) DETECTAR el error amablemente
2) ACLARAR qué esperabas  
3) REPETIR la pregunta correcta

EJEMPLOS:

📌 Si preguntaste NOMBRE y responde con fecha/hora:
Usuario: "mañana a las 10"
Tú: "¡Esa es una excelente hora! 😊 Pero primero necesito tu nombre para agendarte. ¿Cómo te llamas?"

📌 Si preguntaste CELULAR y responde con nombre:
Usuario: "Juan Pérez"
Tú: "¡Mucho gusto Juan! 😊 Ahora sí, ¿me pasas tu número de celular para confirmarte la cita?"

📌 Si preguntaste FECHA/HORA y responde con otra cosa:
Usuario: "el modelo chipre"
Tú: "¡El Chipre es excelente! 😊 Para que lo conozcas, ¿qué día y hora te gustaría visitarnos?"

📌 Si preguntaste BANCO y responde número:
Usuario: "50 mil"
Tú: "¡Perfecto! Ese dato lo usaremos después 😊 Primero dime, ¿con qué banco te gustaría trabajar tu crédito? (Scotiabank, BBVA, Santander, etc.)"

📌 Si preguntaste INGRESO y responde banco:
Usuario: "bbva"
Tú: "¡BBVA es buena opción! 😊 Pero ya tenía tu banco. Lo que necesito ahora es: ¿más o menos cuánto ganas al mes?"

📌 Si preguntaste ENGANCHE y responde otra cosa:
Usuario: "quiero el de 3 recámaras"
Tú: "¡Excelente elección! 😊 Para calcular tu capacidad, ¿cuánto tienes ahorrado para el enganche?"

📌 Si preguntaste MODALIDAD (1, 2, 3) y responde otra cosa:
Usuario: "el viernes"
Tú: "¡El viernes está bien para la cita con el vendedor! 😊 Pero para el asesor de crédito, ¿cómo prefieres que te contacte? 1ï¸âƒ£ Llamada, 2ï¸âƒ£ Videollamada, o 3ï¸âƒ£ Presencial"

âš ï¸ IMPORTANTE: 
- NO guardes datos incorrectos (no guardes "mañana a las 10" como nombre)
- Siempre sé amable al corregir
- Mantén el contexto de la conversación
- Si el usuario parece confundido, ofrece ayuda

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ESCENARIOS ESPECIALES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸ CUANDO DIGA "APENAS EMPIEZO", "QUÉ TIENEN", "QUÉ OPCIONES HAY", "DAME UN RESUMEN":
Esto significa que quiere conocer TODO. DEBES listar TODOS los desarrollos (los 6), no solo 2-3.

Formato OBLIGATORIO:
"¡Claro [nombre]! 😊 Te presento todos nuestros desarrollos:

**EN ZACATECAS:**

😢 *Monte Verde* - Colinas del Padre
Desde $1.3M | 2-3 recámaras
_El refugio familiar donde la modernidad se mezcla con la naturaleza: fraccionamiento seguro, ambiente tranquilo y una vida más lenta, pero mejor pensada._

😡 *Monte Real* - Zona exclusiva
Desde $1.8M | 2-3 recámaras
_El siguiente nivel de Monte Verde: las mismas áreas verdes, pero con salón de eventos, gimnasio y alberca para los que quieren ese plus de exclusividad._

😢 *Los Encinos* - Zona residencial  
Desde $2.2M | 3 recámaras
_El fraccionamiento donde tus hijos crecen entre áreas verdes y juegos, mientras tú inviertes en una zona tranquila que vale más mañana._

😢 *Miravalle* - Premium
Desde $2.8M | 3-4 recámaras
_Tu oasis en la ciudad: rodeado de cerros y calma, con el silencio suficiente para escuchar a tu familia y todo a unos minutos._

**EN GUADALUPE:**

ðŸŸ£ *Andes* - Excelente ubicación
Desde $1.5M | 2-3 recámaras
_La privada de la generación que quiere todo: seguridad, ubicación estratégica y un entorno joven donde la vida pasa entre gym, niños en bici y vecinos que piensan como tú._

ðŸ”µ *Distrito Falco* - El más exclusivo
Desde $3.5M | 3-4 recámaras
_La dirección que suena a logro: un desarrollo exclusivo y sobrio, para quienes ya no compran casa, compran nivel de vida e inversión inteligente._

¿Hay alguno que te llame la atención o quieres que te detalle alguno en particular?"

CUANDO PIDA INFO DE UN DESARROLLO ESPECÍFICO (ej. "cuéntame de Los Encinos"):
- Lista TODOS los modelos de ese desarrollo con precios y características
- Usa formato visual con viñetas y saltos de línea
- Ejemplo:
  "¡Excelente elección! 😊 En *Los Encinos* tenemos:

  â€¢ *Ascendente*: $3.2M | 3 rec | 210mÂ² | 3 plantas con terraza
  
  â€¢ *Descendente*: $2.9M | 3 rec | 182mÂ² | 3 plantas, vistas increíbles
  
  â€¢ *Encino Blanco*: $2.2M | 3 rec | 125mÂ² | 2 plantas, privada
  
  ¿Te gustaría ver el video o agendar una visita?"

CUANDO PIDA "UBICACIÓN", "MAPA", "DÓNDE ESTÍ":
- Da una explicación corta de la zona.
- Marca send_gps: true en el JSON.

CUANDO PIDA INFO DE UN DESARROLLO (genérico):
- Si dice "info de Los Encinos", "cuéntame de Andes", "qué tienen en Miravalle"
- Lista los modelos con precios y características
- Al final OFRECE: "¿Te mando el brochure con videos, recorrido 3D y ubicación? O si te interesa algún modelo te platico de ese 🏠"
- âš ï¸ NO actives send_video_desarrollo, espera a que confirme

CUANDO PIDA UN MODELO ESPECÍFICO:
- Si dice "quiero ver el Ascendente", "info del modelo Gardenia", "cuéntame del Fresno"
- Responde con info del modelo
- âš ï¸ SÍ activa send_video_desarrollo: true (enviará video + matterport + GPS + brochure automático)
- Termina con: "¿Qué te parece? ¿Te gustaría visitarlo? 😊"

CUANDO CONFIRME QUE QUIERE BROCHURE/VIDEO:
- Si responde "sí", "mándamelo", "dale", "va", "el brochure", "el video" a tu oferta
- âš ï¸ SÍ activa send_video_desarrollo: true
- Termina con: "¿Qué te parece? ¿Te gustaría visitarlo? 😊"

CUANDO QUIERA "HABLAR CON ASESOR":
- Explícale que con gusto un asesor humano lo va a contactar.
- Activa send_contactos: true.

────────────────────────────
⚠️⚠️⚠️ INTELIGENCIA CONVERSACIONAL - CASOS ESPECIALES ⚠️⚠️⚠️
────────────────────────────

🏠 **CLIENTES QUE YA COMPRARON (POST-VENTA):**
Si dice: "ya compré", "soy propietario", "ya tengo casa con ustedes", "compré en [desarrollo]", "soy dueño", "mi casa en [desarrollo]"

DEBES:
1) Felicitarlo genuinamente: "¡Qué gusto saludarte! Bienvenido a la familia Santa Rita 🏠"
2) Preguntar en qué puedes ayudarle
3) Si tiene PROBLEMA → "Entiendo perfectamente. Déjame conectarte con nuestro equipo de postventa para que te atiendan como mereces."
4) Si pregunta sobre ESCRITURAS, ENTREGA, PAGOS → "Claro, ese tema lo maneja directamente nuestro equipo administrativo. Te paso con ellos para que te den info precisa."
5) Activar: contactar_vendedor: true (para que lo atienda su vendedor asignado o postventa)

Ejemplos de respuesta:
- "¡Qué gusto que seas parte de la familia Santa Rita! 🏠 ¿En qué puedo ayudarte hoy?"
- "¡Felicidades por tu casa! Cuéntame, ¿tienes alguna duda o necesitas algo?"

🔐 **PREGUNTAS SOBRE SEGURIDAD:**
Si pregunta: "¿es seguro?", "¿tiene vigilancia?", "¿hay robos?", "¿es privada?", "seguridad del fraccionamiento"

DEBES responder con confianza y datos:
"¡Muy buena pregunta! 👮 La seguridad es prioridad para nosotros:

• Acceso controlado 24/7 con caseta de vigilancia
• Circuito cerrado de cámaras
• Bardas perimetrales en todo el fraccionamiento
• Solo residentes y visitantes autorizados entran
• Iluminación en áreas comunes

Además, la comunidad de vecinos está muy organizada. Es de esos lugares donde los niños pueden jugar en la calle tranquilos 😊

¿Te gustaría visitarlo para que veas la seguridad en persona?"

🔧 **QUEJAS O PROBLEMAS:**
Si dice: "tengo un problema", "algo está mal", "no funciona", "necesito que arreglen", "me quedaron mal", "estoy molesto", "no me han atendido"

DEBES:
1) NO minimizar ni justificar
2) Mostrar empatía genuina: "Entiendo tu frustración y lamento mucho que estés pasando por esto."
3) Tomar acción: "Déjame conectarte con la persona correcta para que esto se resuelva hoy mismo."
4) Pedir datos si no los tienes: "Para ayudarte mejor, ¿me das tu nombre y el desarrollo donde está tu casa?"
5) Activar: contactar_vendedor: true

Ejemplo:
"Lamento mucho escuchar eso 😔 No es la experiencia que queremos que tengas. Déjame conectarte directamente con nuestro equipo para que lo resuelvan lo antes posible. ¿Me compartes tu nombre y número de casa para ubicarte rápido?"

🛑 **"NO ME PRESIONES" / "SOLO QUIERO INFO":**
Si dice: "solo quiero información", "no me presiones", "no quiero que me llamen", "solo estoy viendo", "no estoy listo", "solo cotizando"

DEBES:
1) Respetar su espacio: "¡Claro! Sin presión ninguna 😊"
2) Dar la info que pida sin pedir datos
3) NO insistir en cita ni en teléfono
4) Cerrar con opción abierta: "Cuando quieras más detalle o visitar, aquí estoy."

Ejemplo:
"¡Tranquilo! 😊 Estoy aquí para darte información sin compromiso. Pregúntame lo que quieras y cuando estés listo para dar el siguiente paso, me dices. Sin presión."

🤷 **PREGUNTAS QUE NO SÉ / FUERA DE MI ALCANCE:**
Si pregunta algo técnico específico que no sé: materiales exactos, fechas de entrega, trámites legales, detalles de escrituras, problemas de obra

DEBES:
1) Ser honesta: "Esa es una pregunta muy específica que prefiero no contestarte a medias."
2) Ofrecer solución: "Déjame conectarte con la persona indicada que te dará la respuesta exacta."
3) NO inventar datos

Ejemplo:
"¡Buena pregunta! 🤔 Eso lo maneja directamente el área técnica/legal/administrativa. Para darte información precisa, te conecto con ellos. ¿Te parece?"

💬 **CONVERSACIÓN CASUAL / SALUDOS:**
Si solo dice: "hola", "buenos días", "qué tal", "hey"

DEBES responder como persona, NO como robot:
- "¡Hola! 😊 ¿Cómo estás? Soy SARA de Grupo Santa Rita. ¿En qué te puedo ayudar hoy?"
- "¡Buenos días! ☀️ Qué gusto saludarte. ¿Buscas info de casas o en qué te echo la mano?"
- "¡Hey! 👋 ¿Qué onda? Cuéntame, ¿en qué andas?"

NO respondas con:
- "Bienvenido al sistema de atención de Grupo Santa Rita..."
- "Gracias por contactarnos. ¿En qué podemos servirle?"

🎭 **PERSONALIDAD - CÓMO HABLAR:**
Eres SARA, una persona real. Hablas como alguien de Zacatecas que le apasiona su trabajo:

✅ CORRECTO (natural):
- "¡Órale! Ese modelo está bien padre"
- "¿Neta? Pues mira, te cuento..."
- "¡Qué emoción! Ya me imagino a tu familia ahí"
- "Mira, te voy a ser honesta..."
- "¡Claro que sí! A ver, cuéntame..."

❌ INCORRECTO (robot):
- "Entendido. Procedo a brindarte información."
- "Le informo que tenemos las siguientes opciones disponibles."
- "¿En qué más puedo asistirle?"
- "Su solicitud ha sido recibida."
- "Agradecemos su preferencia."

🔄 **CUANDO NO ENTIENDAS EL MENSAJE:**
Si el mensaje es confuso, incompleto o no tiene sentido:

NO digas: "No entendí tu mensaje. ¿Podrías repetirlo?"

SÍ di: "Perdón, creo que no te caché bien 😅 ¿Me lo explicas de otra forma?"

o: "Hmm, no estoy segura de entender. ¿Te refieres a [opción A] o a [opción B]?"

📞 **CUANDO QUIERA LLAMAR O QUE LE LLAMEN:**
Si dice: "llámame", "me pueden marcar", "prefiero por teléfono", "quiero hablar con alguien"

DEBES:
1) Si NO tienes teléfono → "¡Claro! ¿Me pasas tu número para que te marquen?"
2) Si YA tienes teléfono → "¡Listo! Le paso tu número a [vendedor] para que te contacte. ¿A qué hora te conviene más?"
3) Activar: contactar_vendedor: true

NO le digas que no puedes hacer llamadas. Sí puedes conectarlo con alguien que lo llame.

âš ï¸ CUANDO EL CLIENTE MENCIONE UN PRESUPUESTO CLARO (ej. "3 millones", "2.5M", "hasta 1.8", "tengo X"):
Es OBLIGATORIO que:
1) Menciones mínimo 2 desarrollos por NOMBRE que entren en ese rango (según el catálogo).
2) Expliques en 1 frase por qué encajan con ese presupuesto.
3) Cierres con una pregunta para avanzar (zona, recámaras o cita).

Ejemplo:
Cliente: "Tengo un presupuesto de 3 millones, dame opciones"
Respuesta en "response":
"Con 3 millones estás en una muy buena posición, [nombre] 😊
En Zacatecas te puedo recomendar *Los Encinos*, donde modelos como Ascendente te dan 3 recámaras, cochera para 2 autos y un entorno muy familiar.
También está *Miravalle*, más premium, con casas de 3 niveles y terraza para reuniones.
Si prefieres Guadalupe, *Andes* es excelente por ubicación y relación precioâ€“beneficio.
¿Te gustaría que te detalle primero Zacatecas o Guadalupe?"

❌ PROHIBIDO responder con frases genéricas como:
- "Tenemos desarrollos en diferentes zonas y presupuestos"
- "¿En qué zona te gustaría vivir?"
- "Cuéntame más, ¿qué tipo de casa buscas?"
Estas frases son INACEPTABLES cuando el cliente YA dio su presupuesto.

âš ï¸ CUANDO EL CLIENTE DICE QUE NO TIENE CRÉDITO O PREGUNTA POR FINANCIAMIENTO:
NO te quedes en loop preguntando "¿te gustaría que te ayude?". 
Sigue este flujo concreto:

PASO 1: Ofrece hacer una CORRIDA FINANCIERA
"¡No te preocupes, [nombre]! 😊 Te puedo hacer una *corrida financiera ilustrativa* para que veas:

â€¢ Cuánto te puede prestar un banco aproximadamente
â€¢ Cómo quedarían tus mensualidades
â€¢ El enganche que necesitarías

Para eso solo necesito saber: *¿más o menos cuánto ganas al mes?*"

PASO 2: Cuando diga su ingreso, CALCULA con estas fórmulas:
- Crédito MÍNIMO = ingreso mensual Í— 60
- Crédito MÍXIMO = ingreso mensual Í— 80
- Mensualidad = 30% del ingreso mensual

Ejemplo si gana $30,000:
- Crédito: $1,800,000 - $2,400,000
- Mensualidad: ~$9,000

Responde así:
"¡Perfecto [nombre]! Con un ingreso de $[X] al mes, *aproximadamente* podrías acceder a:

â€¢ *Crédito estimado*: $[mínimo] - $[máximo]
â€¢ *Mensualidad aproximada*: ~$[30% del ingreso]
â€¢ *Enganche sugerido*: 10-20% del valor

âš ï¸ *Nota: Estos números son ilustrativos. El monto final depende del banco y tu historial.*

Con esto podrías ver casas en [desarrollos que encajen]. ¿Te gustaría agendar una visita para conocerlas?"

PASO 3: SIEMPRE regresa a ofrecer CITA después de dar info de crédito
No te quedes dando vueltas con el crédito. Después de 2-3 intercambios sobre crédito, ofrece:
"Mientras avanzas con el crédito, ¿te gustaría visitar las casas para ir viendo cuál te enamora?"

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
TU PERSONALIDAD
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
- Cálida, empática, clara.
- Frases naturales: "Perfecto", "Súper bien", "Te va a encantar", "Excelente elección".
- NUNCA dices que eres IA o bot.
- Eres SARA, asesora inmobiliaria de Grupo Santa Rita.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DATOS DEL CLIENTE
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
- Nombre: ${lead.name || '❌ NO TENGO - DEBES PEDIRLO'}
- Celular: ${lead.phone ? '✅ Sí tengo' : '❌ NO TENGO - DEBES PEDIRLO'}
- Interés: ${lead.property_interest || 'No definido'}
- Crédito: ${lead.needs_mortgage === null ? '❌ NO SÉ - PREGUNTAR DESPUÉS DE CITA' : lead.needs_mortgage ? 'Sí necesita' : 'Tiene recursos propios'}
- Score: ${lead.lead_score || 0}/100
${citaExistenteInfo ? `- Cita: ${citaExistenteInfo}` : '- Cita: ❌ NO TIENE CITA AÚN'}

${!lead.name ? 'âš ï¸ CRÍTICO: NO TENGO NOMBRE. Pide el nombre antes de agendar cita.' : ''}
${citaExistenteInfo ? `
🚫🚫🚫 PROHIBIDO - LEE ESTO 🚫🚫🚫
EL CLIENTE YA TIENE CITA CONFIRMADA.
- NUNCA digas "¿te gustaría visitar las casas?"
- NUNCA digas "¿qué día te gustaría visitarnos?"
- NUNCA crees otra cita
- Si habla de crédito â†’ ofrece ASESOR VIP, no visita
- Si dice "ya agendé" â†’ confirma su cita existente
- Respuesta correcta: "¿Te gustaría que te conectemos con uno de nuestros asesores VIP para ayudarte con el crédito?"
🚫🚫🚫 FIN PROHIBICIÓN 🚫🚫🚫
` : ''}

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
REGLAS DE CITA
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
âš ï¸ Para CONFIRMAR una cita necesitas EN ESTE ORDEN:
1) Nombre âœ“ â†’ Si no tienes, pídelo: "¿Me compartes tu nombre?"
2) Celular âœ“ â†’ Si no tienes, pídelo: "¡Perfecto [nombre]! ¿Me compartes tu número de celular?"
3) Fecha y hora âœ“ â†’ Solo después de tener nombre Y celular

âš ï¸ SECUENCIA OBLIGATORIA:
- Cliente dice "sí quiero visitar" â†’ Pide NOMBRE primero
- Cliente da nombre â†’ Pide CELULAR
- Cliente da celular â†’ Pide FECHA/HORA
- Cliente da fecha/hora â†’ Confirma cita + pregunta crédito

🚫🚫🚫 PROHIBIDO - DATOS YA PROPORCIONADOS 🚫🚫🚫
Si en el historial o en DATOS_LEAD ya aparece:
- Nombre del cliente â†’ NUNCA preguntes "¿me compartes tu nombre?"
- Número de celular â†’ NUNCA preguntes "¿me compartes tu celular?"
- Cita confirmada â†’ NUNCA preguntes "¿te gustaría visitar?"

Si el cliente dice "ya te lo di" o similar:
- Busca el dato en el historial
- Úsalo y continúa el flujo
- NUNCA vuelvas a pedirlo
🚫🚫🚫 FIN PROHIBICIÓN 🚫🚫🚫

âš ï¸ Si en DATOS_LEAD dice "YA TIENE CITA CONFIRMADA":
- NO preguntes si quiere agendar otra visita
- NO digas "¿te gustaría visitar las casas?"
- NO digas "¿te gustaría conocer en persona?"
- Confirma que ya tiene cita y pregunta si necesita algo más
- Si pregunta algo de crédito, responde sobre crédito SIN ofrecer visita

âš ï¸ Si pide hablar con asesor hipotecario:
- Confirma que lo vas a conectar
- Pon send_contactos: true en el JSON

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
EXTRACCIÓN OBLIGATORIA DE NOMBRE
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Siempre que el cliente diga frases como:
- "soy X"
- "me llamo X"  
- "mi nombre es X"
DEBES OBLIGATORIAMENTE:
1) Usar ese nombre en tu respuesta.
2) Ponerlo en extracted_data.nombre EN EL JSON.

Ejemplo:
Cliente: "soy el karate kid"
JSON: { "extracted_data": { "nombre": "el karate kid" }, ... }

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INTENTS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
- "saludo": primer contacto (hola, buen día) â†’ PIDE NOMBRE
- "interes_desarrollo": pide info, opciones, resumen de casas o desarrollos
- "solicitar_cita": quiere visitar SIN fecha/hora específica
- "confirmar_cita": da fecha Y hora específica
- "info_credito": responde sobre su situación de crédito/ingresos
- "otro": dudas generales
- "post_venta": ya es cliente, compró casa, tiene duda de propietario
- "queja": tiene problema, algo salió mal, está molesto
- "hablar_humano": quiere hablar con persona real, que le llamen

Flags:
- "send_video_desarrollo": true SOLO cuando:
  * Pide un MODELO específico (ej. "el Ascendente", "modelo Gardenia")
  * Confirma que quiere brochure/video (ej. "sí mándamelo", "dale", "el brochure")
  * âš ï¸ NO lo actives solo porque pregunta por un desarrollo genérico
- "send_gps": true si pide ubicación, mapa, cómo llegar.
- "send_contactos": true SOLO cuando:
  * El cliente dice EXPLÍCITAMENTE "sí quiero asesor", "conéctame", "sí", "dale" EN RESPUESTA a tu pregunta sobre asesor
  * âš ï¸ NO lo actives cuando TÚ ofreces asesor por primera vez
  * âš ï¸ NO lo actives junto con corrida financiera
  * âš ï¸ ESPERA a que el cliente confirme

âš ï¸âš ï¸âš ï¸ REGLA CRÍTICA PARA send_contactos âš ï¸âš ï¸âš ï¸
Si el ÚLTIMO mensaje de SARA en el historial contiene:
- "ASESOR VIP DISPONIBLE"
- "te conectemos con uno"
- "asesor hipotecario"

Y el cliente responde: "sí", "si", "claro", "dale", "ok", "por favor", "quiero"

ENTONCES:
1) send_contactos: true (OBLIGATORIO)
2) response: "¡Perfecto! Te voy a conectar con uno de nuestros asesores VIP..."
3) intent: "info_credito"

âš ï¸ NO confundas con solicitar_cita. Si preguntamos sobre ASESOR y dice "sí", es para ASESOR, no para cita.
âš ï¸âš ï¸âš ï¸ FIN REGLA CRÍTICA âš ï¸âš ï¸âš ï¸

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FORMATO JSON OBLIGATORIO
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Responde SIEMPRE solo con **JSON válido**, sin texto antes ni después.

{
  "intent": "saludo|interes_desarrollo|solicitar_cita|confirmar_cita|info_credito|post_venta|queja|hablar_humano|otro",
  "extracted_data": {
    "nombre": null,
    "desarrollo": null,
    "desarrollos": [],
    "modelos": [],
    "fecha": null,
    "hora": null,
    "necesita_credito": null,
    "num_recamaras": null,
    "banco_preferido": null,
    "ingreso_mensual": null,
    "enganche_disponible": null,
    "modalidad_contacto": null,
    "quiere_asesor": null
  },
  "response": "Tu respuesta conversacional para WhatsApp",
  "send_video_desarrollo": false,
  "send_gps": false,
  "send_contactos": false,
  "contactar_vendedor": false
}

âš ï¸ EXTRACCIÓN DE MÚLTIPLES DESARROLLOS Y MODELOS:
- Si el cliente menciona varios desarrollos (ej. "Los Encinos y Andes"), ponlos en "desarrollos": ["Los Encinos", "Andes"]
- Si menciona casas/modelos específicos (ej. "el Ascendente y el Gardenia"), ponlos en "modelos": ["Ascendente", "Gardenia"]
- "desarrollo" es para un solo desarrollo, "desarrollos" es para múltiples

âš ï¸ EXTRACCIÓN DE FECHAS Y HORAS:
La fecha de hoy es: ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

- Si dice "hoy" â†’ fecha: "hoy"
- Si dice "mañana" â†’ fecha: "mañana"  
- Si dice "el lunes", "el martes", etc â†’ fecha: "lunes", "martes", etc
- Si dice "a las 4", "4pm", "16:00" â†’ hora: "16:00"
- Si dice "a las 2", "2pm", "14:00" â†’ hora: "14:00"
- Si dice "en la mañana" â†’ hora: "10:00"
- Si dice "en la tarde" â†’ hora: "16:00"

âš ï¸ EXTRACCIÓN DE DATOS DE CRÉDITO (MUY IMPORTANTE):
- Si menciona banco (aunque tenga typos): "soctia", "escotia", "scotibank" â†’ banco_preferido: "Scotiabank"
- "bvba", "vbba" â†’ "BBVA" | "santaner", "santnader" â†’ "Santander" | "vanorte", "baorte" â†’ "Banorte"
- "infonavi", "imfonavit" â†’ "Infonavit" | "fovisste", "fobissste" â†’ "Fovissste"
- Si menciona ingreso: "67 mil", "67000", "sesenta y siete mil" â†’ ingreso_mensual: 67000
- Si menciona enganche: "234m1l", "234 mil", "doscientos" â†’ enganche_disponible: 234000
- Si dice "sí" a asesor: "si", "va", "sale", "ok", "claro" â†’ quiere_asesor: true
- Si elige modalidad: "1", "llamada", "telefono" â†’ modalidad_contacto: "telefonica"
- "2", "zoom", "video" â†’ modalidad_contacto: "videollamada"
- "3", "oficina", "presencial" â†’ modalidad_contacto: "presencial"

RECUERDA: 
- Tu respuesta debe ser SOLO JSON válido
- Empieza con { y termina con }
- NO escribas texto antes del { ni después del }
- Pon tu mensaje conversacional DENTRO del campo "response"
`;

    // Variable para guardar respuesta raw de OpenAI (accesible en catch)
    let openaiRawResponse = '';

    try {
      // Firma correcta: chat(history, userMsg, systemPrompt)
      const response = await this.openai.chat(
        historialParaOpenAI,
        message,
        prompt
      );

      openaiRawResponse = response || ''; // Guardar para usar en catch si falla JSON
      console.log('ðŸ¤– OpenAI response:', response?.substring(0, 300));
      
      // Extraer JSON
      let jsonStr = response;
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const parsed = JSON.parse(jsonStr);
      
      // ═══════════════════════════════════════════════════════════
      // CINTURÓN DE SEGURIDAD: Forzar extracción de nombre si la IA no lo puso
      // ═══════════════════════════════════════════════════════════
      if (!parsed.extracted_data) {
        parsed.extracted_data = {};
      }

      if (!parsed.extracted_data.nombre) {
        const nameMatch = message.match(/(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ0-9\s]+)/i);
        if (nameMatch) {
          parsed.extracted_data.nombre = nameMatch[1].trim();
          console.log('👤 Nombre detectado por regex:', parsed.extracted_data.nombre);
        }
      }
      
      // CORRECCIÓN: Si tiene fecha Y hora, forzar confirmar_cita
      if (parsed.extracted_data?.fecha && parsed.extracted_data?.hora) {
        parsed.intent = 'confirmar_cita';
      }
      
      return {
        intent: parsed.intent || 'otro',
        extracted_data: parsed.extracted_data || {},
        response: parsed.response || '¡Hola! ¿En qué puedo ayudarte?',
        send_gps: parsed.send_gps || false,
        send_video_desarrollo: parsed.send_video_desarrollo || false,
        send_contactos: parsed.send_contactos || false,
        contactar_vendedor: parsed.contactar_vendedor || false
      };
      
      // ═══════════════════════════════════════════════════════════════
      // INTENTS ESPECIALES: Forzar contactar_vendedor
      // ═══════════════════════════════════════════════════════════════
      const intentsQueNecesitanVendedor = ['post_venta', 'queja', 'hablar_humano'];
      if (intentsQueNecesitanVendedor.includes(analysis.intent)) {
        console.log(`📞 Intent ${analysis.intent} detectado - activando contactar_vendedor`);
        analysis.contactar_vendedor = true;
      }
      
    } catch (e) {
      console.error('❌ Error OpenAI:', e);
      
      // ═══════════════════════════════════════════════════════════
      // FALLBACK INTELIGENTE: Si OpenAI respondió texto plano, ¡usarlo!
      // ═══════════════════════════════════════════════════════════
      
      // Limpiar la respuesta de OpenAI (quitar markdown, etc)
      let respuestaLimpia = openaiRawResponse
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .replace(/^\s*\{[\s\S]*\}\s*$/g, '') // Quitar JSON malformado
        .trim();
      
      // Si OpenAI dio una respuesta de texto útil (más de 20 chars, no es JSON roto)
      if (respuestaLimpia.length > 20 && !respuestaLimpia.startsWith('{')) {
        console.log('ðŸ”„ Usando respuesta de texto plano de OpenAI');
        
        // Detectar intent basado en el mensaje del usuario
        const msgLower = message.toLowerCase();
        let fallbackIntent = 'otro';
        let fallbackContactarVendedor = false;
        
        // Detectar intents especiales primero
        if (msgLower.includes('ya compr') || msgLower.includes('soy propietario') || msgLower.includes('soy dueño') || msgLower.includes('mi casa')) {
          fallbackIntent = 'post_venta';
          fallbackContactarVendedor = true;
        } else if (msgLower.includes('problema') || msgLower.includes('queja') || msgLower.includes('molesto') || msgLower.includes('mal') || msgLower.includes('arreglen')) {
          fallbackIntent = 'queja';
          fallbackContactarVendedor = true;
        } else if (msgLower.includes('llamar') || msgLower.includes('llamen') || msgLower.includes('persona real') || msgLower.includes('hablar con alguien')) {
          fallbackIntent = 'hablar_humano';
          fallbackContactarVendedor = true;
        } else if (msgLower.includes('opcion') || msgLower.includes('casa') || msgLower.includes('tienen') || msgLower.includes('millon')) {
          fallbackIntent = 'interes_desarrollo';
        } else if (msgLower.includes('cita') || msgLower.includes('visita')) {
          fallbackIntent = 'solicitar_cita';
        }
        
        return {
          intent: fallbackIntent,
          extracted_data: {},
          response: respuestaLimpia,
          send_gps: false,
          send_video_desarrollo: false,
          send_contactos: false,
          contactar_vendedor: fallbackContactarVendedor
        };
      }
      
      // Si no hay respuesta útil de OpenAI, usar fallback contextual
      const msgLower = message.toLowerCase();
      const leadTieneNombre = lead.name;
      let fallbackResponse = '';
      let fallbackIntent = 'saludo';
      
      // Si YA tenemos nombre, no pedirlo de nuevo
      if (leadTieneNombre) {
        // ═══════════════════════════════════════════════════════════
        // PRIORIDAD 1: Si menciona presupuesto, DAR OPCIONES CONCRETAS
        // ═══════════════════════════════════════════════════════════
        if (msgLower.includes('millon') || msgLower.includes('millón') || msgLower.match(/\d+\s*m\b/i)) {
          // Detectar rango de presupuesto
          const numMatch = msgLower.match(/(\d+(?:\.\d+)?)\s*(?:millon|millón|m\b)/i);
          const presupuesto = numMatch ? parseFloat(numMatch[1]) : 0;
          
          if (presupuesto >= 3) {
            fallbackResponse = `${lead.name}, con ${presupuesto}M estás en excelente posición 😊

En Zacatecas te recomiendo *Los Encinos* (modelo Ascendente: 3 rec, 210mÂ², terraza) o *Miravalle* (Bilbao/Vizcaya: 3 niveles, roof garden).

En Guadalupe, *Distrito Falco* tiene modelos premium como Halcón con 4 rec y acabados de lujo.

¿Te gustaría que te detalle primero Zacatecas o Guadalupe?`;
          } else if (presupuesto >= 2) {
            fallbackResponse = `${lead.name}, con ${presupuesto}M tienes muy buenas opciones 😊

En Zacatecas: *Monte Verde* (Fresno/Olivo: 3 rec, áreas verdes) o *Los Encinos* (Descendente: 3 plantas, terraza).

En Guadalupe: *Andes* es excelente por ubicación y precio, modelos como Aconcagua te dan 3 rec con jardín.

¿Cuál zona te llama más la atención?`;
          } else {
            fallbackResponse = `${lead.name}, con ${presupuesto}M tenemos opciones accesibles 😊

*Monte Verde* tiene modelos desde $1.3M con 2-3 recámaras y amenidades familiares.
*Andes* en Guadalupe también maneja precios competitivos.

¿Te gustaría conocer más de alguno?`;
          }
          fallbackIntent = 'interes_desarrollo';
        }
        // ═══════════════════════════════════════════════════════════
        // PRIORIDAD 2: Pide opciones pero SIN presupuesto
        // ═══════════════════════════════════════════════════════════
        else if (msgLower.includes('opcion') || msgLower.includes('casa') || msgLower.includes('tienen') || msgLower.includes('dame')) {
          fallbackResponse = `¡Claro ${lead.name}! 😊 Te cuento rápido:

En *Zacatecas* tenemos Monte Verde (familiar), Los Encinos (espacioso) y Miravalle (premium).
En *Guadalupe* está Andes (excelente ubicación) y Distrito Falco (el más exclusivo).

Para orientarte mejor: ¿más o menos en qué presupuesto andas?`;
          fallbackIntent = 'interes_desarrollo';
        } else if (msgLower.includes('sí') || msgLower.includes('si') || msgLower.includes('claro')) {
          fallbackResponse = `¡Perfecto ${lead.name}! 😊 ¿Qué día y hora te gustaría visitarnos?`;
          fallbackIntent = 'solicitar_cita';
        } else if (msgLower.includes('cita') || msgLower.includes('visita')) {
          fallbackResponse = `¡Con gusto ${lead.name}! 🏠 ¿Qué día y hora te funcionan mejor para la visita?`;
          fallbackIntent = 'solicitar_cita';
        } else {
          fallbackResponse = `${lead.name}, para darte las mejores opciones: ¿en qué zona te gustaría vivir (Zacatecas o Guadalupe) y más o menos en qué presupuesto andas? 🏠`;
          fallbackIntent = 'otro';
        }
      } else {
        // Sin nombre - pedirlo de forma cálida
        fallbackResponse = '¡Hola! 😊 Soy SARA de Grupo Santa Rita. Me encantaría ayudarte a encontrar tu nuevo hogar. ¿Cómo te llamas?';
        fallbackIntent = 'saludo';
      }
      
      return {
        intent: fallbackIntent,
        extracted_data: {},
        response: fallbackResponse,
        send_gps: false,
        send_video_desarrollo: false,
        send_contactos: false
      };
    }
  }

  private crearCatalogoDB(properties: any[]): string {
    const porDesarrollo = new Map<string, any[]>();
    
    for (const p of properties) {
      const dev = p.development || 'Otros';
      if (!porDesarrollo.has(dev)) porDesarrollo.set(dev, []);
      porDesarrollo.get(dev)!.push(p);
    }

    let catalogo = '';
    porDesarrollo.forEach((props, dev) => {
      catalogo += `\nDESARROLLO: ${dev}\n`;
      props.forEach(p => {
        const precio = p.price ? `$${(Number(p.price)/1000000).toFixed(1)}M` : '';
        const plantas = p.floors === 1 ? '1 planta' : `${p.floors} plantas`;
        const extras = [];
        if (p.has_study) extras.push('estudio');
        if (p.has_terrace) extras.push('terraza');
        if (p.has_roof_garden) extras.push('roof garden');
        if (p.has_garden) extras.push('jardín');
        if (p.is_equipped) extras.push('equipada');
        
        catalogo += `â€¢ ${p.name}: ${precio} | ${p.bedrooms} rec | ${p.area_m2}mÂ² | ${plantas}`;
        if (extras.length > 0) catalogo += ` | ${extras.join(', ')}`;
        catalogo += '\n';
        if (p.sales_phrase) {
          catalogo += `  â†’ "${p.sales_phrase}"\n`;
        }
        if (p.ideal_client) {
          catalogo += `  👤 Ideal: ${p.ideal_client}\n`;
        }
      });
    });
    
    return catalogo;
  }

  // ═══════════════════════════════════════════════════════════
  // EJECUTAR DECISIÓN
  // ═══════════════════════════════════════════════════════════

  private async executeAIDecision(
    analysis: AIAnalysis,
    from: string,
    cleanPhone: string,
    lead: any,
    properties: any[],
    teamMembers: any[],
    originalMessage: string,
    env: any
  ): Promise<void> {

    // ðŸ” DEBUG: Verificar qué recibe executeAIDecision
    console.log('ðŸ” executeAIDecision RECIBE:');
    console.log('   - properties:', Array.isArray(properties) ? `Array[${properties.length}]` : typeof properties);
    console.log('   - teamMembers:', Array.isArray(teamMembers) ? `Array[${teamMembers.length}]` : typeof teamMembers);

    // ═══════════════════════════════════════════════════════════
    // RE-FETCH: Obtener historial FRESCO para evitar race conditions
    // ═══════════════════════════════════════════════════════════
    let historialFresco: any[] = [];
    try {
      const { data: leadFresco } = await this.supabase.client
        .from('leads')
        .select('conversation_history')
        .eq('id', lead.id)
        .single();
      historialFresco = leadFresco?.conversation_history || [];
      console.log('ðŸ”„ Historial re-fetched, mensajes:', historialFresco.length);
    } catch (e) {
      console.log('âš ï¸ Error re-fetching historial, usando cache');
      historialFresco = lead.conversation_history || [];
    }

    // ═══════════════════════════════════════════════════════════
    // DETECCIÓN FORZADA: Flujo de ASESOR VIP con BANCOS y MODALIDADES
    // ═══════════════════════════════════════════════════════════
    const historial = historialFresco;
    const mensajesSara = historial.filter((m: any) => m.role === 'assistant');
    const ultimoMsgSara = mensajesSara.length > 0 ? mensajesSara[mensajesSara.length - 1] : null;
    
    // DEBUG: Ver qué hay en el historial
    console.log('ðŸ” DEBUG - Mensajes de SARA en historial:', mensajesSara.length);
    console.log('ðŸ” DEBUG - Último mensaje SARA:', ultimoMsgSara?.content?.substring(0, 100) || 'NINGUNO');
    console.log('ðŸ” DEBUG - Mensaje original cliente:', originalMessage);
    
    // Lista de bancos disponibles
    const bancosDisponibles = [
      { nombre: 'Scotiabank', codigos: ['scotiabank', 'scotia'] },
      { nombre: 'BBVA', codigos: ['bbva'] },
      { nombre: 'Santander', codigos: ['santander'] },
      { nombre: 'Banorte', codigos: ['banorte'] },
      { nombre: 'HSBC', codigos: ['hsbc'] },
      { nombre: 'Banamex', codigos: ['banamex', 'citibanamex', 'citi'] },
      { nombre: 'Banregio', codigos: ['banregio'] },
      { nombre: 'Infonavit', codigos: ['infonavit'] },
      { nombre: 'Fovissste', codigos: ['fovissste'] }
    ];
    
    // Detectar banco mencionado
    const mensajeLower = originalMessage.toLowerCase().trim();
    let bancoDetectado = bancosDisponibles.find(b => 
      b.codigos.some(codigo => mensajeLower.includes(codigo))
    );
    
    // Detectar modalidad
    const modalidades = [
      { nombre: 'Telefónica', codigos: ['telefon', 'llamada', 'llamar', 'celular', '1'] },
      { nombre: 'Videollamada', codigos: ['zoom', 'videollamada', 'video', 'meet', 'teams', '2'] },
      { nombre: 'Presencial', codigos: ['presencial', 'oficina', 'persona', 'fisico', 'física', '3'] }
    ];
    let modalidadDetectada = modalidades.find(m =>
      m.codigos.some(codigo => mensajeLower.includes(codigo))
    );
    
    // Detectar ingreso en el mensaje
    let ingresoDetectado = 0;
    const matchMil = originalMessage.match(/(\d+)\s*mil/i);
    const matchPesos = originalMessage.match(/\$?\s*([\d,]+)\s*(?:pesos|mensual|al mes)?/i);
    const matchNumero = originalMessage.match(/(?:gano|ingreso|sueldo|cobro)?\s*(\d{2,})/i);
    
    if (matchMil) {
      ingresoDetectado = parseInt(matchMil[1]) * 1000;
    } else if (matchPesos && parseInt(matchPesos[1].replace(/,/g, '')) > 5000) {
      ingresoDetectado = parseInt(matchPesos[1].replace(/,/g, ''));
    } else if (matchNumero && parseInt(matchNumero[1]) >= 10) {
      const num = parseInt(matchNumero[1]);
      ingresoDetectado = num > 1000 ? num : num * 1000;
    }
    
    // Detectar enganche en el mensaje
    let engancheDetectado = 0;
    const matchEngancheMil = originalMessage.match(/(\d+)\s*mil/i);
    const matchEnganchePesos = originalMessage.match(/\$?\s*([\d,]+)/);
    if (matchEngancheMil) {
      engancheDetectado = parseInt(matchEngancheMil[1]) * 1000;
    } else if (matchEnganchePesos && parseInt(matchEnganchePesos[1].replace(/,/g, '')) >= 10000) {
      engancheDetectado = parseInt(matchEnganchePesos[1].replace(/,/g, ''));
    }
    
    // Detectar contextos del último mensaje de SARA
    const preguntabaBanco = (ultimoMsgSara?.content?.includes('Scotiabank') &&
                            ultimoMsgSara?.content?.includes('BBVA')) ||
                            ultimoMsgSara?.content?.includes('Con cuál te gustaría trabajar') ||
                            ultimoMsgSara?.content?.includes('¿Cuál banco es de tu preferencia');
    
    const preguntabaIngreso = ultimoMsgSara?.content?.includes('cuánto ganas') ||
                              ultimoMsgSara?.content?.includes('ingreso mensual') ||
                              ultimoMsgSara?.content?.includes('ganas al mes');
    
    const preguntabaEnganche = ultimoMsgSara?.content?.includes('enganche') &&
                               (ultimoMsgSara?.content?.includes('ahorrado') || 
                                ultimoMsgSara?.content?.includes('tienes algo'));
    
    // Detectar si SARA preguntó sobre crédito (después de crear cita)
    const preguntabaCredito = ultimoMsgSara?.content?.includes('ya tienes crédito') ||
                              ultimoMsgSara?.content?.includes('crédito hipotecario aprobado') ||
                              ultimoMsgSara?.content?.includes('te gustaría que te orientáramos') ||
                              ultimoMsgSara?.content?.includes('ayudemos con el crédito');
    
    const preguntabaAsesorVIP = ultimoMsgSara?.content?.toLowerCase()?.includes('asesor vip') ||
                                ultimoMsgSara?.content?.includes('te conecte con') ||
                                ultimoMsgSara?.content?.includes('te gustaría que te conecte') ||
                                (ultimoMsgSara?.content?.includes('asesor') && ultimoMsgSara?.content?.includes('?'));
    
    // PRIORIDAD: Detectar si preguntó por VISITA (buscar en últimos 3 mensajes de SARA)
    const ultimos3MsgSara = mensajesSara.slice(-3);
    const preguntabaVisita = ultimos3MsgSara.some((msg: any) => 
                             msg?.content?.includes('CONOCERLO EN PERSONA') || 
                             msg?.content?.includes('gustaría visitarlos') ||
                             msg?.content?.includes('Puedo agendarte') ||
                             msg?.content?.includes('agendar una cita'));
    
    const contenidoLower = ultimoMsgSara?.content?.toLowerCase() || '';
    const preguntabaModalidad = (contenidoLower.includes('llamada telef') || contenidoLower.includes('1ï¸âƒ£')) &&
                                (contenidoLower.includes('videollamada') || contenidoLower.includes('2ï¸âƒ£')) &&
                                (contenidoLower.includes('presencial') || contenidoLower.includes('3ï¸âƒ£'));
    
    let respuestaAfirmativa = /^(sí|si|claro|dale|ok|por favor|quiero|va|órale|orale|porfa|yes|yeah|simón|simon|arre|sale)$/i.test(originalMessage.trim()) ||
                                /^(sí|si|claro|dale|ok)\s/i.test(originalMessage.trim());
    
    const respuestaNegativa = /^(no|nel|nop|nope|negativo|para nada)$/i.test(originalMessage.trim());
    
    console.log('ðŸ” DEBUG - preguntabaCredito:', preguntabaCredito);
    console.log('ðŸ” DEBUG - preguntabaBanco:', preguntabaBanco);
    console.log('ðŸ” DEBUG - preguntabaIngreso:', preguntabaIngreso);
    console.log('ðŸ” DEBUG - preguntabaEnganche:', preguntabaEnganche);
    console.log('ðŸ” DEBUG - preguntabaAsesorVIP:', preguntabaAsesorVIP);
    console.log('ðŸ” DEBUG - preguntabaVisita:', preguntabaVisita);
    console.log('ðŸ” DEBUG - preguntabaModalidad:', preguntabaModalidad);
    // ═══════════════════════════════════════════════════════════
    // FALLBACK INTELIGENTE: Si el regex no detectó, usar lo que OpenAI extrajo
    // ═══════════════════════════════════════════════════════════
    
    // Banco: si regex no detectó pero OpenAI sí
    if (!bancoDetectado && analysis.extracted_data?.banco_preferido) {
      const bancoAI = analysis.extracted_data?.banco_preferido;
      bancoDetectado = bancosDisponibles.find(b => b.nombre.toLowerCase() === bancoAI.toLowerCase()) || { nombre: bancoAI };
      console.log('ðŸ¤– Banco detectado por OpenAI:', bancoAI);
    }
    
    // Ingreso: si regex no detectó pero OpenAI sí
    if (ingresoDetectado === 0 && analysis.extracted_data?.ingreso_mensual) {
      ingresoDetectado = analysis.extracted_data?.ingreso_mensual;
      console.log('ðŸ¤– Ingreso detectado por OpenAI:', ingresoDetectado);
    }
    
    // Enganche: si regex no detectó pero OpenAI sí
    if (engancheDetectado === 0 && analysis.extracted_data?.enganche_disponible) {
      engancheDetectado = analysis.extracted_data?.enganche_disponible;
      console.log('ðŸ¤– Enganche detectado por OpenAI:', engancheDetectado);
    }
    
    // Modalidad: si regex no detectó pero OpenAI sí
    if (!modalidadDetectada && analysis.extracted_data?.modalidad_contacto) {
      const modAI = (analysis.extracted_data?.modalidad_contacto || '').toLowerCase();
      if (modAI.includes('telefon') || modAI === 'telefonica') {
        modalidadDetectada = { nombre: 'Telefónica', tipo: 'llamada' };
      } else if (modAI.includes('video') || modAI === 'videollamada') {
        modalidadDetectada = { nombre: 'Videollamada', tipo: 'zoom' };
      } else if (modAI.includes('presencial') || modAI === 'oficina') {
        modalidadDetectada = { nombre: 'Presencial', tipo: 'oficina' };
      }
      if (modalidadDetectada) console.log('ðŸ¤– Modalidad detectada por OpenAI:', modalidadDetectada.nombre);
    }
    
    // Quiere asesor: si OpenAI lo detectó
    if (!respuestaAfirmativa && analysis.extracted_data?.quiere_asesor === true) {
      respuestaAfirmativa = true;
      console.log('ðŸ¤– Quiere asesor detectado por OpenAI');
    }
    
    console.log('ðŸ” DEBUG - bancoDetectado:', bancoDetectado?.nombre || 'NINGUNO');
    console.log('ðŸ” DEBUG - ingresoDetectado:', ingresoDetectado);
    console.log('ðŸ” DEBUG - engancheDetectado:', engancheDetectado);
    console.log('ðŸ” DEBUG - modalidadDetectada:', modalidadDetectada?.nombre || 'NINGUNA');
    console.log('ðŸ” DEBUG - respuestaAfirmativa:', respuestaAfirmativa);
    
    const nombreCliente = lead.name || analysis.extracted_data?.nombre || 'amigo';
    
    // ═══════════════════════════════════════════════════════════
    // PRIORIDAD MÍXIMA: Si preguntó por visita y cliente dice SÍ â†’ Agendar cita
    // ═══════════════════════════════════════════════════════════
    // Detectar respuesta negativa (no tengo, no, aún no, todavía no)
    
    // ═══════════════════════════════════════════════════════════
    // PRIORIDAD: Si SARA preguntó sobre crédito y cliente dice NO â†’ Preguntar BANCO
    // ═══════════════════════════════════════════════════════════
    if (preguntabaCredito && respuestaAfirmativa) {
      console.log('🏦 FLUJO CRÉDITO INICIO: Cliente necesita crédito â†’ Preguntar BANCO');
      analysis.intent = 'info_credito';
      analysis.response = `¡Claro ${nombreCliente}! 😊 Te ayudo con tu crédito hipotecario.

¿Cuál banco es de tu preferencia?
🏦 Scotiabank
🏦 BBVA
🏦 Santander
🏦 Banorte
🏦 HSBC
🏦 Banamex
🏦 Banregio
🏦 Infonavit
🏦 Fovissste

¿Con cuál te gustaría trabajar?`;
    }
    
    // Si preguntó crédito y cliente dice NO â†’ Cerrar amigablemente
    if (preguntabaCredito && respuestaNegativa) {
      console.log('🏦 Cliente NO quiere ayuda con crédito â†’ Cierre amigable');
      analysis.response = `¡Perfecto ${nombreCliente}! Si más adelante necesitas ayuda con el crédito, aquí estoy. 😊

¡Te esperamos en tu cita! 🏠`;
    }
    
    let forzandoCita = false;
    if (preguntabaVisita && respuestaAfirmativa) {
      console.log('🏠 FORZANDO CITA - Cliente dijo SÍ a visita');
      analysis.intent = 'solicitar_cita';
      forzandoCita = true;
      
      // Verificar si tiene nombre válido
      const tieneNombreValido = lead.name && lead.name.length > 2 && 
                                !['test', 'prueba', 'cliente'].some(inv => lead.name.toLowerCase().includes(inv));
      const tieneCelular = lead.phone && lead.phone.length >= 10;
      
      if (!tieneNombreValido) {
        console.log('ðŸ“ Pidiendo NOMBRE para cita');
        analysis.response = `¡Perfecto! 😊 Para agendarte, ¿me compartes tu nombre completo?`;
      } else if (!tieneCelular) {
        console.log('📱 Pidiendo CELULAR para cita');
        analysis.response = `¡Perfecto ${nombreCliente}! 😊 ¿Me compartes tu número de celular para agendarte?`;
      } else {
        console.log('📅 Tiene nombre y celular, pidiendo FECHA');
        analysis.response = `¡Perfecto ${nombreCliente}! 😊 ¿Qué día y hora te gustaría visitarnos?`;
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 1: Cliente pide crédito â†’ Preguntar BANCO
    // ═══════════════════════════════════════════════════════════
    // Detectar si es solicitud de crédito: intent de OpenAI O mensaje contiene palabras clave
    const mensajeEsCredito = originalMessage.toLowerCase().includes('crédito') || 
                             originalMessage.toLowerCase().includes('credito') ||
                             originalMessage.toLowerCase().includes('hipoteca') ||
                             originalMessage.toLowerCase().includes('préstamo') ||
                             originalMessage.toLowerCase().includes('prestamo') ||
                             originalMessage.toLowerCase().includes('financiamiento');
    
    const pidioCredito = (analysis.intent === 'info_credito' || mensajeEsCredito) && 
                         !lead.banco_preferido && 
                         !preguntabaBanco &&
                         !preguntabaIngreso &&
                         !preguntabaEnganche;
    
    if (pidioCredito && !bancoDetectado && !preguntabaVisita && !lead.broker_stage) {
      console.log('🏦 BROKER: Iniciando flujo A/B');
      
      // Marcar lead en flujo de broker
      await this.supabase.client.from('leads').update({
        broker_stage: 'esperando_eleccion'
      }).eq('id', lead.id);
      
      // Enviar mensaje inicial con opciones A/B
      const mensajeInicial = this.brokerService.getMensajeInicial(nombreCliente);
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
      analysis.response = mensajeInicial;
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 2: Cliente eligió BANCO â†’ Dar info + Preguntar INGRESO
    // ═══════════════════════════════════════════════════════════
    else if (bancoDetectado && (preguntabaBanco || pidioCredito || preguntabaCredito)) {
      console.log('🏦 FLUJO CRÉDITO PASO 2: Banco elegido:', bancoDetectado.nombre, 'â†’ Info + Preguntar INGRESO');
      
      // Guardar banco en lead
      try {
        await this.supabase.client
          .from('leads')
          .update({ banco_preferido: bancoDetectado.nombre })
          .eq('id', lead.id);
        lead.banco_preferido = bancoDetectado.nombre;
        console.log('✅ Banco guardado:', bancoDetectado.nombre);
      } catch (e) {
        console.log('âš ï¸ Error guardando banco');
      }
      
      // Buscar datos del banco
      let datosBanco: any = null;
      try {
        const { data } = await this.supabase.client
          .from('bancos_hipotecarios')
          .select('*')
          .eq('banco', bancoDetectado.nombre)
          .eq('activo', true)
          .single();
        datosBanco = data;
      } catch (e) {
        console.log('âš ï¸ No se encontraron datos del banco');
      }
      
      if (datosBanco) {
        analysis.response = `¡Excelente elección! 🏦 *${bancoDetectado.nombre}*

📊 *Lo que ofrece ${bancoDetectado.nombre}:*
â€¢ Tasa: ${datosBanco.tasa_min}% - ${datosBanco.tasa_max}% anual
â€¢ Plazo: hasta ${datosBanco.plazo_max_anos} años
â€¢ Enganche mínimo: ${Math.round((datosBanco.enganche_minimo || 0.10) * 100)}%

💡 *Tip:* ${datosBanco.nota_sara || 'Buena opción para tu perfil.'}

Para darte una corrida personalizada, ¿más o menos cuánto ganas al mes?`;
      } else {
        analysis.response = `¡Excelente elección! 🏦 *${bancoDetectado.nombre}*

Para darte una corrida personalizada, ¿más o menos cuánto ganas al mes?`;
      }
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 3: Cliente dio INGRESO â†’ Corrida + Preguntar ENGANCHE
    // ═══════════════════════════════════════════════════════════
    else if (preguntabaIngreso && ingresoDetectado > 0) {
      console.log('🏦 FLUJO CRÉDITO PASO 3: Ingreso detectado:', ingresoDetectado, 'â†’ Corrida + Preguntar ENGANCHE');
      
      // GUARDAR INGRESO EN DB
      try {
        await this.supabase.client
          .from('leads')
          .update({ ingreso_mensual: ingresoDetectado })
          .eq('id', lead.id);
        console.log('✅ Ingreso guardado en DB:', ingresoDetectado);
      } catch (e) {
        console.log('âš ï¸ Error guardando ingreso:', e);
      }
      
      // Obtener banco del lead
      let bancoPreferido = lead.banco_preferido;
      if (!bancoPreferido) {
        try {
          const { data: leadActualizado } = await this.supabase.client
            .from('leads')
            .select('banco_preferido')
            .eq('id', lead.id)
            .single();
          bancoPreferido = leadActualizado?.banco_preferido;
        } catch (e) {}
      }
      
      // Buscar datos del banco
      let datosBanco: any = null;
      if (bancoPreferido) {
        try {
          const { data } = await this.supabase.client
            .from('bancos_hipotecarios')
            .select('*')
            .eq('banco', bancoPreferido)
            .eq('activo', true)
            .single();
          datosBanco = data;
        } catch (e) {}
      }
      
      // Calcular corrida
      const creditoMin = ingresoDetectado * 60;
      const creditoMax = ingresoDetectado * 80;
      const mensualidadAprox = ingresoDetectado * 0.30;
      
      const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');
      
      if (datosBanco) {
        analysis.response = `¡Muy bien ${nombreCliente}! Con tu ingreso de ${formatMoney(ingresoDetectado)} en *${bancoPreferido}*:

📊 *Tu corrida estimada:*
â€¢ Crédito: ${formatMoney(creditoMin)} - ${formatMoney(creditoMax)}
â€¢ Mensualidad: ~${formatMoney(mensualidadAprox)}
â€¢ Tasa: ${datosBanco.tasa_min}% - ${datosBanco.tasa_max}% anual
â€¢ Plazo: hasta ${datosBanco.plazo_max_anos} años

¿Tienes algo ahorrado para el enganche? (aunque sea un aproximado)`;
      } else {
        analysis.response = `¡Muy bien ${nombreCliente}! Con tu ingreso de ${formatMoney(ingresoDetectado)}:

📊 *Tu corrida estimada:*
â€¢ Crédito: ${formatMoney(creditoMin)} - ${formatMoney(creditoMax)}
â€¢ Mensualidad: ~${formatMoney(mensualidadAprox)}

¿Tienes algo ahorrado para el enganche? (aunque sea un aproximado)`;
      }
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 4: Cliente dio ENGANCHE â†’ Cálculo final + Preguntar ASESOR VIP
    // ═══════════════════════════════════════════════════════════
    else if (preguntabaEnganche && engancheDetectado > 0) {
      console.log('🏦 FLUJO CRÉDITO PASO 4: Enganche detectado:', engancheDetectado, 'â†’ Cálculo final + Preguntar ASESOR');
      
      // Guardar enganche
      try {
        await this.supabase.client
          .from('leads')
          .update({ enganche_disponible: engancheDetectado })
          .eq('id', lead.id);
        console.log('✅ Enganche guardado:', engancheDetectado);
      } catch (e) {
        console.log('âš ï¸ Error guardando enganche');
      }
      
      // Obtener banco e ingreso del historial
      let bancoPreferido = lead.banco_preferido;
      let ingresoGuardado = 0;
      
      // Buscar ingreso en historial
      for (const msg of historial) {
        if (msg.role === 'assistant' && msg.content?.includes('ingreso de')) {
          const match = msg.content.match(/\$\s*([\d,]+)/);
          if (match) {
            ingresoGuardado = parseInt(match[1].replace(/,/g, ''));
            break;
          }
        }
      }
      
      const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');
      
      // Calcular capacidad total
      const creditoMax = ingresoGuardado > 0 ? ingresoGuardado * 80 : 0;
      const capacidadTotal = engancheDetectado + creditoMax;
      
      if (capacidadTotal > 0) {
        analysis.response = `¡Excelente ${nombreCliente}! 💪

📊 *Tu capacidad de compra:*
â€¢ Enganche: ${formatMoney(engancheDetectado)}
â€¢ Crédito estimado: ${formatMoney(creditoMax)}
â€¢ *Total: ${formatMoney(capacidadTotal)}* para tu casa

âš ï¸ Cifras ilustrativas. El banco define el monto final.

¿Te gustaría que te conecte con nuestro *asesor VIP de ${bancoPreferido || 'crédito'}*?`;
      } else {
        analysis.response = `¡Excelente ${nombreCliente}! 💪

Con ${formatMoney(engancheDetectado)} de enganche más el crédito, tienes buenas opciones.

âš ï¸ Cifras ilustrativas. El banco define el monto final.

¿Te gustaría que te conecte con nuestro *asesor VIP de ${bancoPreferido || 'crédito'}*?`;
      }
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
    }
    
    // ═══════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 4.5: Preguntó enganche pero no detectó número â†’ Confirmar
    // ═══════════════════════════════════════════════════════════
    else if (preguntabaEnganche && engancheDetectado === 0) {
      console.log('🏦 FLUJO CRÉDITO PASO 4.5: No detectó enganche claro, interpretando...');
      
      // Extraer cualquier número del mensaje
      const numerosEnMensaje = originalMessage.match(/\d+/g);
      const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');
      
      if (numerosEnMensaje && numerosEnMensaje.length > 0) {
        // Tomar el número más grande encontrado
        let numeroBase = Math.max(...numerosEnMensaje.map((n: string) => parseInt(n)));
        
        // Si el mensaje tiene "mil", "m" o "k", multiplicar por 1000
        const tieneMil = originalMessage.toLowerCase().includes('mil') || 
                         /\d+\s*m(?!i?l)/i.test(originalMessage) ||
                         originalMessage.toLowerCase().includes('k');
        
        const numeroInterpretado = tieneMil || numeroBase < 1000 ? numeroBase * 1000 : numeroBase;
        
        console.log('ðŸ” Número interpretado:', numeroInterpretado, '(base:', numeroBase, ', tieneMil:', tieneMil, ')');
        
        // Preguntar confirmación
        analysis.response = '¿Quisiste decir ' + formatMoney(numeroInterpretado) + ' de enganche? 🤔';
        
        // Guardar el número interpretado para usarlo si confirma
        try {
          await this.supabase.client
            .from('leads')
            .update({ enganche_pendiente_confirmar: numeroInterpretado })
            .eq('id', lead.id);
        } catch (e) {}
        
      } else {
        // No hay números, pedir de nuevo
        analysis.response = 'No capté bien el monto ðŸ˜… ¿Cuánto tienes ahorrado para el enganche? (por ejemplo: 200 mil, 500k, etc.)';
      }
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 4.6: Cliente CONFIRMÓ enganche â†’ Continuar a PASO 4
    // ═══════════════════════════════════════════════════════════
    const preguntabaConfirmacionEnganche = ultimoMsgSara?.content?.includes('Quisiste decir') && 
                                            ultimoMsgSara?.content?.includes('enganche');
    
    if (preguntabaConfirmacionEnganche && respuestaAfirmativa) {
      console.log('🏦 FLUJO CRÉDITO PASO 4.6: Cliente confirmó enganche â†’ Ejecutando PASO 4');
      
      // Extraer enganche del mensaje anterior de SARA: "¿Quisiste decir $234,000 de enganche?"
      let engancheConfirmado = 0;
      const matchEnganche = ultimoMsgSara?.content?.match(/\$([\d,]+)/);
      if (matchEnganche) {
        engancheConfirmado = parseInt(matchEnganche[1].replace(/,/g, ''));
      }
      console.log('✅ Enganche confirmado (del mensaje):', engancheConfirmado);
      
      if (engancheConfirmado > 0) {
        // Guardar enganche confirmado
        try {
          await this.supabase.client
            .from('leads')
            .update({ enganche_disponible: engancheConfirmado })
            .eq('id', lead.id);
          console.log('✅ Enganche guardado:', engancheConfirmado);
        } catch (e) {}
        
        // Obtener banco e ingreso del historial
        let bancoPreferido = lead.banco_preferido;
        let ingresoGuardado = 0;
        
        for (const msg of historial) {
          if (msg.role === 'assistant' && msg.content?.includes('ingreso de')) {
            const match = msg.content.match(/\$\s*([\d,]+)/);
            if (match) {
              ingresoGuardado = parseInt(match[1].replace(/,/g, ''));
              break;
            }
          }
        }
        
        const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');
        const creditoMax = ingresoGuardado > 0 ? ingresoGuardado * 80 : 0;
        const capacidadTotal = engancheConfirmado + creditoMax;
        
        if (capacidadTotal > 0) {
          analysis.response = '¡Excelente ' + nombreCliente + '! 💪\n\n📊 *Tu capacidad de compra:*\nâ€¢ Enganche: ' + formatMoney(engancheConfirmado) + '\nâ€¢ Crédito estimado: ' + formatMoney(creditoMax) + '\nâ€¢ *Total: ' + formatMoney(capacidadTotal) + '* para tu casa\n\nâš ï¸ Cifras ilustrativas. El banco define el monto final.\n\n¿Te gustaría que te conecte con nuestro *asesor VIP de ' + (bancoPreferido || 'crédito') + '*?';
        } else {
          analysis.response = '¡Excelente ' + nombreCliente + '! 💪\n\nCon ' + formatMoney(engancheConfirmado) + ' de enganche más el crédito, tienes buenas opciones.\n\nâš ï¸ Cifras ilustrativas. El banco define el monto final.\n\n¿Te gustaría que te conecte con nuestro *asesor VIP de ' + (bancoPreferido || 'crédito') + '*?';
        }
      } else {
        analysis.response = '¡Perfecto! ¿Cuánto tienes ahorrado para el enganche?';
      }
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 1.5: Cliente dijo SÍ a asesor â†’ Verificar si ya tiene banco
    // ═══════════════════════════════════════════════════════════
    else if (preguntabaAsesorVIP && respuestaAfirmativa && !preguntabaVisita) {
      console.log('🏦 FLUJO CRÉDITO PASO 1.5: Quiere asesor');
      
      const nombreCliente = lead.name || 'amigo';
      
      // Verificar si YA tiene banco elegido
      let bancoYaElegido = lead.banco_preferido;
      if (!bancoYaElegido) {
        try {
          const { data: leadDB } = await this.supabase.client
            .from('leads')
            .select('banco_preferido')
            .eq('id', lead.id)
            .single();
          bancoYaElegido = leadDB?.banco_preferido;
        } catch (e) {}
      }
      
      if (bancoYaElegido) {
        // Ya tiene banco â†’ ir directo a MODALIDAD
        console.log('🏦 Ya tiene banco:', bancoYaElegido, 'â†’ Preguntar MODALIDAD');
        analysis.response = `¡Perfecto ${nombreCliente}! 😊 ¿Cómo prefieres que te contacte el asesor de ${bancoYaElegido}?

1ï¸âƒ£ *Llamada telefónica*
2ï¸âƒ£ *Videollamada* (Zoom/Meet)
3ï¸âƒ£ *Presencial* (en oficina)`;
      } else {
        // No tiene banco â†’ preguntar banco
        console.log('🏦 No tiene banco â†’ Preguntar BANCO');
        analysis.response = `¡Claro ${nombreCliente}! 😊 Te ayudo con tu crédito hipotecario.

¿Cuál banco es de tu preferencia?

🏦 Scotiabank
🏦 BBVA
🏦 Santander
🏦 Banorte
🏦 HSBC
🏦 Banamex
🏦 Banregio
🏦 Infonavit
🏦 Fovissste

¿Con cuál te gustaría trabajar?`;
      }
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 5.5: Cliente dio NOMBRE/CELULAR â†’ Preguntar MODALIDAD
    // ═══════════════════════════════════════════════════════════
    const preguntabaNombreCelular = ultimoMsgSara?.content?.includes('nombre completo');
    
    // Detectar si el mensaje tiene un número de teléfono (10 dígitos)
    const telefonoEnMensaje = originalMessage.match(/\d{10,}/);
    // Detectar si tiene algo que parece nombre
    const textoSinNumeros = originalMessage.replace(/[\d\-\+\(\)]/g, '').trim();
    const pareceNombre = textoSinNumeros.length > 3;
    
    if (preguntabaNombreCelular && (telefonoEnMensaje || pareceNombre) && analysis.intent !== 'solicitar_cita' && !preguntabaVisita) {
      console.log('🏦 FLUJO CRÉDITO PASO 5.5: Nombre/Celular recibido â†’ Preguntar MODALIDAD');
      
      // Extraer y guardar nombre (preferir el extraído por OpenAI, ya limpio)
      const nombreLimpio = analysis.extracted_data?.nombre || textoSinNumeros;
      if (nombreLimpio && nombreLimpio.length > 2) {
        try {
          await this.supabase.client
            .from('leads')
            .update({ name: nombreLimpio })
            .eq('id', lead.id);
          lead.name = nombreLimpio;
          console.log('✅ Nombre guardado:', nombreLimpio);
        } catch (e) {}
      }
      
      // Extraer y guardar teléfono
      if (telefonoEnMensaje) {
        const telLimpio = telefonoEnMensaje[0];
        try {
          await this.supabase.client
            .from('leads')
            .update({ phone: telLimpio })
            .eq('id', lead.id);
          console.log('✅ Teléfono guardado:', telLimpio);
        } catch (e) {}
      }
      
      const nombreSaludo = lead.name || textoSinNumeros || 'amigo';
      
      analysis.response = `¡Gracias ${nombreSaludo}! 😊 ¿Cómo prefieres que te contacte el asesor?

1ï¸âƒ£ *Llamada telefónica*
2ï¸âƒ£ *Videollamada* (Zoom/Meet)
3ï¸âƒ£ *Presencial* (en oficina)`;
      
      analysis.send_contactos = false;
      analysis.intent = 'info_credito';
    }
    
    // ═══════════════════════════════════════════════════════════
    // FLUJO CRÉDITO PASO 6: Cliente eligió MODALIDAD â†’ CONECTAR CON ASESOR
    // ═══════════════════════════════════════════════════════════
    else if (preguntabaModalidad && modalidadDetectada) {
      console.log('🏦 FLUJO CRÉDITO PASO 6: Modalidad elegida:', modalidadDetectada.nombre, 'â†’ CONECTANDO');
      
      // Guardar modalidad
      try {
        await this.supabase.client
          .from('leads')
          .update({ modalidad_asesoria: modalidadDetectada.nombre })
          .eq('id', lead.id);
        console.log('✅ Modalidad guardada:', modalidadDetectada.nombre);
      } catch (e) {}
      
      // Obtener banco del lead
      let bancoPreferido = lead.banco_preferido;
      if (!bancoPreferido) {
        try {
          const { data: leadActualizado } = await this.supabase.client
            .from('leads')
            .select('banco_preferido')
            .eq('id', lead.id)
            .single();
          bancoPreferido = leadActualizado?.banco_preferido;
        } catch (e) {}
      }
      
      // Buscar asesor del banco
      let asesorBanco = teamMembers.find((t: any) => 
        t.role === 'asesor' && 
        t.banco?.toLowerCase() === bancoPreferido?.toLowerCase()
      );
      
      // Verificar si el asesor está de vacaciones hoy
      if (asesorBanco) {
        const fechaHoy = new Date().toISOString().split('T')[0];
        const { data: vacaciones } = await this.supabase.client
          .from('vendor_availability')
          .select('*')
          .eq('team_member_id', asesorBanco.id)
          .eq('specific_date', fechaHoy)
          .or('type.eq.vacaciones,notas.ilike.%vacaciones%');
        
        if (vacaciones && vacaciones.length > 0) {
          console.log(`🏖️ Asesor ${asesorBanco.name} de vacaciones, buscando otro...`);
          // Buscar otro asesor disponible
          const otroAsesor = teamMembers.find((t: any) => 
            t.role === 'asesor' && 
            t.id !== asesorBanco.id &&
            t.active
          );
          if (otroAsesor) {
            asesorBanco = otroAsesor;
            console.log(`📌 Reasignando a asesor: ${otroAsesor.name}`);
          } else {
            asesorBanco = null;
          }
        }
      }
      
      // Verificar que teléfono no sea placeholder
      const telefonoValido = asesorBanco?.phone && !asesorBanco.phone.startsWith('+5200000000');
      
      console.log('ðŸ” Buscando asesor de', bancoPreferido, 'â†’', asesorBanco?.name || 'NO ENCONTRADO', '| Tel válido:', telefonoValido);
      
      // Obtener datos del lead para la notificación
      let ingresoMensual = 'No especificado';
      let engancheDisponible = 'No especificado';
      
      // Buscar ingreso en historial
      for (const msg of historial) {
        if (msg.role === 'assistant' && msg.content?.includes('ingreso de')) {
          const match = msg.content.match(/\$\s*([\d,]+)/);
          if (match) {
            ingresoMensual = `$${match[1]}/mes`;
            break;
          }
        }
      }
      
      // Buscar enganche en historial
      for (const msg of historial) {
        if (msg.role === 'assistant' && msg.content?.includes('Enganche:')) {
          const match = msg.content.match(/Enganche:\s*\$?([\d,]+)/);
          if (match) {
            engancheDisponible = `$${match[1]}`;
            break;
          }
        }
      }
      
      // Re-fetch enganche de DB
      try {
        const { data: leadData } = await this.supabase.client
          .from('leads')
          .select('enganche_disponible')
          .eq('id', lead.id)
          .single();
        if (leadData?.enganche_disponible) {
          engancheDisponible = `$${leadData.enganche_disponible.toLocaleString('es-MX')}`;
        }
      } catch (e) {}
      
      if (asesorBanco && telefonoValido) {
        // ═══════════════════════════════════════════════════════════
        // NOTIFICAR AL ASESOR DEL BANCO
        // ═══════════════════════════════════════════════════════════
        const score = lead.lead_score || lead.score || 0;
        const temp = score >= 70 ? 'HOT 🔥' : score >= 40 ? 'WARM 💡ï¸' : 'COLD â„ï¸';
        
        const msgAsesorBanco = `🔥🔥🔥 *¡NUEVO LEAD DE CRÉDITO!* 🔥🔥🔥
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

🏦 *Banco:* ${bancoPreferido}
📹 *Modalidad:* ${modalidadDetectada.nombre}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

👤 *Cliente:* ${nombreCliente}
📱 *WhatsApp:* ${cleanPhone}
💰 *Ingreso:* ${ingresoMensual}
💵 *Enganche:* ${engancheDisponible}
📊 *Score:* ${score}/100 ${temp}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
âš¡ *¡CONTACTAR A LA BREVEDAD!* âš¡`;

        await this.twilio.sendWhatsAppMessage(
          asesorBanco.phone,
          msgAsesorBanco
        );
        console.log('📤 Notificación enviada a asesor de', bancoPreferido);
        
        // Guardar asesor asignado
        try {
          await this.supabase.client
            .from('leads')
            .update({ asesor_banco_id: asesorBanco.id })
            .eq('id', lead.id);
        } catch (e) {}
        
        // ═══════════════════════════════════════════════════════════
        // CREAR SOLICITUD HIPOTECARIA EN CRM
        // ═══════════════════════════════════════════════════════════
        try {
          const ingresoNum = parseInt(ingresoMensual.replace(/[^0-9]/g, '')) || 0;
          const engancheNum = parseInt(engancheDisponible.replace(/[^0-9]/g, '')) || 0;
          const creditoEstimado = ingresoNum * 60;
          
          await this.supabase.client
            .from('mortgage_applications')
            .insert([{
              lead_id: lead.id,
              lead_name: nombreCliente,
              lead_phone: cleanPhone,
              bank: bancoPreferido,
              monthly_income: ingresoNum,
              down_payment: engancheNum,
              requested_amount: creditoEstimado,
              assigned_advisor_id: asesorBanco.id,
              assigned_advisor_name: asesorBanco.name,
              status: 'pending',
              status_notes: `Modalidad: ${modalidadDetectada.nombre}`,
              pending_at: new Date().toISOString()
            }]);
          console.log('📋 Solicitud hipotecaria creada en CRM');
        } catch (mortgageError) {
          console.error('❌ Error creando solicitud hipotecaria:', mortgageError);
        }
        
        // Respuesta al cliente
        analysis.response = `¡Listo ${nombreCliente}! 🎉

*${asesorBanco.name}* de *${bancoPreferido}* se pondrá en contacto contigo a la brevedad por *${modalidadDetectada.nombre}*.

📱 Su teléfono: ${asesorBanco.phone}

✅ Ya le avisé de tu interés. ¡Éxito con tu crédito!`;
        
        analysis.send_contactos = true;
        
      } else {
        // No hay asesor disponible
        analysis.response = `¡Perfecto ${nombreCliente}! 😊

He registrado tu solicitud de asesoría con *${bancoPreferido || 'crédito'}* por *${modalidadDetectada.nombre}*.

Un asesor te contactará muy pronto. ¿Hay algo más en lo que pueda ayudarte?`;
        
        console.log('âš ï¸ No hay asesor disponible para', bancoPreferido);
      }
      
      analysis.intent = 'info_credito';
    }
    
    // 1. Enviar respuesta principal
    let respuestaPrincipal = analysis.response;
    
    // Verificar si ya tiene cita para quitar preguntas de visita
    const yaTieneCita = historial.some((msg: any) => 
      msg.content?.includes('¡Cita confirmada!') || 
      msg.content?.includes('Te agendo para')
    );
    
    // Si YA TIENE CITA, quitar CUALQUIER pregunta de visita de la respuesta
    if (yaTieneCita) {
      respuestaPrincipal = respuestaPrincipal
        .replace(/\n*¿[Tt]e gustaría visitar.*\?/gi, '')
        .replace(/\n*¿[Qq]uieres conocer.*\?/gi, '')
        .replace(/\n*¿[Qq]uieres agendar.*\?/gi, '')
        .replace(/\n*¿[Tt]e gustaría agendar.*\?/gi, '')
        .replace(/\n*¿[Tt]e gustaría conocer.*\?/gi, '')
        .replace(/\n*¿[Qq]uieres visitar.*\?/gi, '')
        .replace(/Con esto podrías ver casas en[^.]*\./gi, '')
        .replace(/Mientras avanzas con el crédito[^?]*\?/gi, '')
        .trim();
      console.log('ðŸ”„ Limpiando preguntas de visita (ya tiene cita)');
    }
    
    // Si es confirmar_cita, quitar la pregunta de crédito del mensaje principal
    const esConfirmarCita = analysis.intent === 'confirmar_cita' && 
                            analysis.extracted_data?.fecha && 
                            analysis.extracted_data?.hora;
    
    if (esConfirmarCita && respuestaPrincipal.includes('crédito')) {
      respuestaPrincipal = respuestaPrincipal
        .replace(/\n*Por cierto,.*crédito hipotecario.*\?/gi, '')
        .replace(/\n*¿Ya tienes crédito.*\?/gi, '')
        .replace(/\n*¿Te gustaría que te ayudemos con el crédito hipotecario\?.*😊/gi, '')
        .replace(/\n*Responde \*?SÍ\*? para orientarte.*😊/gi, '')
        .replace(/\n*¿Te gustaría que te ayudemos con el crédito.*$/gi, '')
        .trim();
      console.log('ðŸ§¹ Limpiado mensaje de crédito de respuesta de cita');
    }
    
    await this.twilio.sendWhatsAppMessage(from, respuestaPrincipal);
    console.log('✅ Respuesta enviada');
    
    // ═══════════════════════════════════════════════════════════
    // NOTIFICAR A VENDEDOR - Solo cuando SARA confirma notificación
    // ═══════════════════════════════════════════════════════════
    const saraConfirmoNotificacion = respuestaPrincipal.includes('Ya notifiqué') || 
                                      respuestaPrincipal.includes('equipo de ventas');
    const nombreParaVendedor = analysis.extracted_data?.nombre || lead.name;
    
    if (saraConfirmoNotificacion && nombreParaVendedor) {
      console.log('📞 CONTACTAR VENDEDOR - Notificando...');
      
      // Guardar nombre si no está guardado
      if (analysis.extracted_data?.nombre && !lead.name) {
        try {
          await this.supabase.client
            .from('leads')
            .update({ name: analysis.extracted_data?.nombre })
            .eq('id', lead.id);
          console.log('✅ Nombre guardado:', analysis.extracted_data?.nombre);
        } catch (e) {
          console.log('âš ï¸ Error guardando nombre');
        }
      }
      
      // Buscar vendedor
      let vendedor = teamMembers.find((tm: any) => tm.id === lead.assigned_to && tm.role === 'vendedor');
      if (!vendedor) {
        vendedor = teamMembers.find((tm: any) => tm.role === 'vendedor' && tm.active);
      }
      
      if (vendedor?.phone) {
        const telefonoCliente = lead.phone || from;
        const desarrolloInteres = analysis.extracted_data?.desarrollo || lead.property_interest || 'Por definir';
        
        const msgVendedor = `ðŸ”” *LEAD QUIERE CONTACTO DIRECTO*

👤 *${nombreParaVendedor}*
📱 ${telefonoCliente}
🏠 Interés: ${desarrolloInteres}

El cliente pidió hablar con un vendedor. ¡Contáctalo pronto!`;
        
        try {
          await this.twilio.sendWhatsAppMessage(vendedor.phone, msgVendedor);
          console.log('✅ Vendedor notificado:', vendedor.name);
        } catch (e) {
          console.log('âš ï¸ Error enviando WhatsApp a vendedor');
        }
      } else {
        console.log('âš ï¸ No hay vendedor disponible');
      }
    }
    
    // NOTA: Ya NO enviamos mensaje separado de ASESOR VIP
    // El flujo nuevo de bancos maneja todo en los PASOS 1-6 arriba

    // Obtener desarrollo(s) - considerar array de desarrollos si existe
    const desarrollosArray = analysis.extracted_data?.desarrollos || [];
    const desarrolloSingle = analysis.extracted_data?.desarrollo;
    let desarrollo = desarrolloSingle || desarrollosArray[0] || lead.property_interest;
    
    // Si OpenAI no detectó desarrollo, buscarlo manualmente en el mensaje
    if (!desarrollo || desarrollo === 'Por definir') {
      const { desarrollos: desarrollosDelMensaje } = this.parsearDesarrollosYModelos(originalMessage);
      if (desarrollosDelMensaje.length > 0) {
        desarrollo = desarrollosDelMensaje[0];
        console.log('ðŸ” Desarrollo detectado manualmente del mensaje:', desarrollo);
      }
    }
    
    const desarrollosParaCita = desarrollosArray.length > 0 ? desarrollosArray.join(' y ') : desarrollo;
    
    const propsDesarrollo = desarrollo ? 
      properties.filter(p => p.development?.toLowerCase().includes(desarrollo.toLowerCase())) : [];

    // 2. CITA: Solo si intent es confirmar_cita Y tiene fecha+hora Y tenemos nombre
    const tieneNombre = lead.name || analysis.extracted_data?.nombre;
    const preguntamosCredito = lead.needs_mortgage !== null || analysis.extracted_data?.necesita_credito !== null;
    
    // Verificar si ya tiene cita para el MISMO desarrollo
    let yaExisteCita = false;
    let citaPreviaDesarrollo = '';
    try {
      const { data: citaPrevia } = await this.supabase.client
        .from('appointments')
        .select('id, property_name')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .limit(1);
      if (citaPrevia && citaPrevia.length > 0) {
        citaPreviaDesarrollo = citaPrevia[0].property_name || '';
        // Solo bloquear si es el MISMO desarrollo
        const desarrolloActual = desarrollosParaCita || desarrollo || analysis.extracted_data?.desarrollo || '';
        yaExisteCita = citaPreviaDesarrollo.toLowerCase().includes(desarrolloActual.toLowerCase()) ||
                       desarrolloActual.toLowerCase().includes(citaPreviaDesarrollo.toLowerCase());
        if (!yaExisteCita && citaPrevia.length > 0) {
          console.log('📅 Tiene cita en', citaPreviaDesarrollo, 'pero quiere cita en', desarrolloActual, '- SE PERMITE');
        }
      }
    } catch (e) {
      console.log('âš ï¸ Error verificando cita previa');
    }
    
    if (analysis.intent === 'confirmar_cita' && 
        analysis.extracted_data?.fecha && 
        analysis.extracted_data?.hora) {
      
      // Determinar el desarrollo final
      const desarrolloFinal = desarrollosParaCita || desarrollo;
      
      // Si ya tiene cita, NO crear otra
      if (yaExisteCita) {
        console.log('🚫 YA TIENE CITA - No se creará duplicada');
        // No hacer nada, la respuesta de OpenAI ya debería ser adecuada
      }
      // Si NO hay desarrollo válido, NO crear cita
      else if (!desarrolloFinal || desarrolloFinal === 'Por definir') {
        console.log('🚫 NO HAY DESARROLLO VÍLIDO - No se creará cita');
        // No crear cita sin desarrollo, redirigir a asesor
        await this.twilio.sendWhatsAppMessage(from, '¡Perfecto! 😊 Para recomendarte el mejor desarrollo según tu presupuesto, ¿te gustaría que un asesor te contacte directamente?');
      }
      // Verificación de seguridad: NO crear cita sin nombre
      else if (!tieneNombre) {
        console.log('âš ï¸ Intento de cita SIN NOMBRE - no se creará');
        await this.twilio.sendWhatsAppMessage(from, '¡Me encanta que quieras visitarnos! 😊 Solo para darte mejor atención, ¿me compartes tu nombre?');
      }
      // Si tenemos nombre, desarrollo válido y NO tiene cita previa, crear cita
      else {
        console.log('✅ CREANDO CITA COMPLETA...');
        console.log('ðŸ” PASANDO A crearCitaCompleta:');
        console.log('   - properties:', Array.isArray(properties) ? `Array[${properties.length}]` : typeof properties);
        console.log('   - teamMembers:', Array.isArray(teamMembers) ? `Array[${teamMembers.length}]` : typeof teamMembers);
        if (!preguntamosCredito) {
          console.log('âš ï¸ Nota: Cita creada sin info de crédito');
        }
        await this.crearCitaCompleta(
          from, cleanPhone, lead, desarrolloFinal,
          analysis.extracted_data?.fecha || '',
          analysis.extracted_data?.hora || '',
          teamMembers, analysis, properties, env
        );
      }
    }

    // 3. Enviar recursos si aplica (MÚLTIPLES DESARROLLOS Y MODELOS)
    const clientName = analysis.extracted_data?.nombre || lead.name || 'Cliente';
    
    // Parsear desarrollos y modelos del mensaje original
    const { desarrollos: desarrollosDetectados, modelos: modelosDetectados } = this.parsearDesarrollosYModelos(originalMessage);
    
    // También considerar lo que extrajo OpenAI
    const desarrollosOpenAI = analysis.extracted_data?.desarrollos || [];
    const modelosOpenAI = analysis.extracted_data?.modelos || [];
    
    // Combinar todas las fuentes de desarrollos (usar 'desarrollo' ya definido arriba)
    const todosDesarrollos = [...new Set([
      ...desarrollosDetectados,
      ...desarrollosOpenAI,
      ...(desarrollo ? [desarrollo] : [])
    ])];
    
    // Combinar todas las fuentes de modelos
    const todosModelos = [...new Set([
      ...modelosDetectados,
      ...modelosOpenAI
    ])];
    
    console.log('📋 Desarrollos detectados:', todosDesarrollos);
    console.log('📋 Modelos detectados:', todosModelos);
    
    // Verificar si ya se enviaron recursos para estos desarrollos (evitar duplicados)
    // Nota: historial ya está declarado arriba
    
    // Verificar en historial si hay mensajes con emojis de recursos
    const recursosEnHistorial = historial.some((msg: any) => 
      msg.role === 'assistant' && 
      (msg.content?.includes('🎬') || 
       msg.content?.includes('video') ||
       msg.content?.includes('Matterport') ||
       msg.content?.includes('matterport') ||
       msg.content?.includes('tour virtual') ||
       msg.content?.includes('youtu'))
    );
    
    // También verificar si el último mensaje de SARA preguntó sobre visitar
    const ultimoMensajeSara = historial.filter((m: any) => m.role === 'assistant').pop();
    const preguntoPorVisita = ultimoMensajeSara?.content?.includes('visitarlos') || 
                              ultimoMensajeSara?.content?.includes('conocer') ||
                              ultimoMensajeSara?.content?.includes('en persona');
    
    // Si el lead ya tiene property_interest del mismo desarrollo, ya se enviaron recursos
    const mismoDesarrollo = lead.property_interest && 
                           todosDesarrollos.some(d => 
                             lead.property_interest?.toLowerCase().includes(d.toLowerCase())
                           );
    
    // Solo bloquear si realmente se enviaron videos/matterports en el historial
    const recursosYaEnviados = recursosEnHistorial;
    
    console.log('ðŸ” ¿Recursos ya enviados?', recursosYaEnviados, 
                '| En historial:', recursosEnHistorial, 
                '| Mismo desarrollo:', mismoDesarrollo,
                '| Preguntó visita:', preguntoPorVisita);
    
    // Solo enviar recursos si hay interés Y NO se enviaron antes
    // FORZAR envío si hay modelos específicos detectados
    const tieneModelosEspecificos = todosModelos.length > 0;
    if (tieneModelosEspecificos) {
      console.log('🎯 MODELOS ESPECÍFICOS DETECTADOS:', todosModelos, 'â†’ FORZANDO ENVÍO DE RECURSOS');
    }
    
    const debeEnviarRecursos = (analysis.send_video_desarrollo || 
                               analysis.intent === 'interes_desarrollo' ||
                               tieneModelosEspecificos) &&
                               !recursosYaEnviados;
    
    // NO enviar recursos duplicados
    if (recursosYaEnviados && (analysis.intent === 'interes_desarrollo' || analysis.send_video_desarrollo)) {
      console.log('⏭ï¸ Recursos ya enviados antes, no se duplican');
    }
    
    if (debeEnviarRecursos) {
      const videosEnviados = new Set<string>();
      const matterportsEnviados = new Set<string>();
      
      // ⏳ Pequeño delay para asegurar que el texto llegue primero
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // CASO 1: Modelos específicos (ej. "el Ascendente y el Gardenia")
      if (todosModelos.length > 0) {
        const propsModelos = this.getPropsParaModelos(todosModelos, properties);
        
        for (const prop of propsModelos) {
          const nombreModelo = prop.model || prop.name || 'Casa';
          const nombreDesarrollo = prop.development || 'Desarrollo';
          
          // Video YouTube del modelo (personalizado + texto vendedor)
          if (prop.youtube_link && !videosEnviados.has(prop.youtube_link)) {
            const saludo = clientName !== 'Cliente' ? `*${clientName}*, mira` : 'Mira';
            const msgVideo = `🎬 ${saludo} cómo es *${nombreModelo}* en ${nombreDesarrollo} por dentro:\n${prop.youtube_link}`;
            await this.twilio.sendWhatsAppMessage(from, msgVideo);
            videosEnviados.add(prop.youtube_link);
            console.log(`✅ Video YouTube enviado: ${nombreModelo}`);
          }
          
          // Matterport del modelo (personalizado)
          if (prop.matterport_link && !matterportsEnviados.has(prop.matterport_link)) {
            const saludo = clientName !== 'Cliente' ? `*${clientName}*, recorre` : 'Recorre';
            const msgMatterport = `🏠 ${saludo} *${nombreModelo}* en 3D como si estuvieras ahí:\n${prop.matterport_link}`;
            await this.twilio.sendWhatsAppMessage(from, msgMatterport);
            matterportsEnviados.add(prop.matterport_link);
            console.log(`✅ Matterport enviado: ${nombreModelo}`);
          }
          
          // ❌ GPS NO se envía automáticamente - solo con cita confirmada
        }
      }
      
      // CASO 2: Desarrollos (ej. "Los Encinos y Andes")
      // âš ï¸ Solo si NO se enviaron recursos en CASO 1 (modelos específicos)
      if (todosDesarrollos.length > 0 && videosEnviados.size === 0 && matterportsEnviados.size === 0) {
        for (const dev of todosDesarrollos) {
          const propsDelDesarrollo = properties.filter(p => 
            p.development?.toLowerCase().includes(dev.toLowerCase())
          );
          
          if (propsDelDesarrollo.length > 0) {
            const prop = propsDelDesarrollo[0]; // Primera propiedad del desarrollo
            console.log(`📹 ${dev}: youtube_link=${prop.youtube_link ? 'SÍ' : 'NO'}, matterport=${prop.matterport_link ? 'SÍ' : 'NO'}, gps=${prop.gps_link ? 'SÍ' : 'NO'}`);
            
            // Video YouTube del desarrollo (personalizado + texto vendedor)
            if (prop.youtube_link && !videosEnviados.has(prop.youtube_link)) {
              const saludo = clientName !== 'Cliente' ? `*${clientName}*, mira` : 'Mira';
              const msgVideo = `🎬 ${saludo} cómo es *${dev}* por dentro:\n${prop.youtube_link}`;
              await this.twilio.sendWhatsAppMessage(from, msgVideo);
              videosEnviados.add(prop.youtube_link);
              console.log(`✅ Video YouTube enviado: ${dev}`);
            } else if (!prop.youtube_link) {
              console.log(`âš ï¸ ${dev} NO tiene youtube_link en DB`);
            }
            
            // Matterport del desarrollo (personalizado)
            if (prop.matterport_link && !matterportsEnviados.has(prop.matterport_link)) {
              const nombreModelo = prop.model || prop.name || 'la casa modelo';
              const saludo = clientName !== 'Cliente' ? `*${clientName}*, recorre` : 'Recorre';
              const msgMatterport = `🏠 ${saludo} *${nombreModelo}* de ${dev} en 3D:\n${prop.matterport_link}`;
              await this.twilio.sendWhatsAppMessage(from, msgMatterport);
              matterportsEnviados.add(prop.matterport_link);
              console.log(`✅ Matterport enviado: ${dev}`);
            }
            
            // ❌ GPS NO se envía automáticamente - solo con cita confirmada
          }
        }
      }
      
      console.log(`📊 Resumen: ${videosEnviados.size} videos, ${matterportsEnviados.size} matterports (GPS solo con cita)`);
      
      // Marcar en el lead que ya se enviaron recursos (para evitar duplicados)
      try {
        const recursosEnviados = [];
        if (videosEnviados.size > 0) recursosEnviados.push('video');
        if (matterportsEnviados.size > 0) recursosEnviados.push('matterport');
        
        // Agregar nota al historial indicando que se enviaron recursos
        const notaRecursos = `[SISTEMA: Se enviaron recursos (${recursosEnviados.join(', ')}) para ${todosDesarrollos.join(', ')}]`;
        await this.supabase.client
          .from('leads')
          .update({ 
            property_interest: todosDesarrollos[0] || desarrollo,
            // Agregar flag de recursos enviados en metadata o similar
          })
          .eq('id', lead.id);
        console.log('ðŸ“ Marcado: recursos ya enviados para', todosDesarrollos.join(', '));
      } catch (e) {
        console.log('âš ï¸ Error marcando recursos enviados');
      }
      
      // Mensaje de seguimiento después de enviar recursos - MÍS LLAMATIVO
      if (videosEnviados.size > 0 || matterportsEnviados.size > 0) {
        const desarrollosMencionados = todosDesarrollos.length > 0 ? todosDesarrollos.join(' y ') : 'nuestros desarrollos';
        
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 segundos
        
        // Enviar brochure del desarrollo PRIMERO
        const desarrolloParaBrochure = todosDesarrollos[0] || '';
        if (desarrolloParaBrochure) {
          const brochureUrl = this.getBrochureUrl(desarrolloParaBrochure);
          if (brochureUrl) {
            const msgBrochure = `📄 *Brochure completo de ${desarrolloParaBrochure}:*
${brochureUrl}

Ahí encuentras fotos, videos, tour 3D, ubicación y precios.`;
            await this.twilio.sendWhatsAppMessage(from, msgBrochure);
            console.log(`✅ Brochure enviado: ${desarrolloParaBrochure}`);
          }
        }
        
        // Luego pregunta de visita
        const msgSeguimiento = `🏠 *¿QUIERES CONOCERLO EN PERSONA?* 🏠

Puedo agendarte una cita para que visites *${desarrollosMencionados}*. ¿Qué dices? 😊`;
        
        await this.twilio.sendWhatsAppMessage(from, msgSeguimiento);
        console.log('✅ Mensaje de seguimiento enviado (formato llamativo)');
        
        // Agregar mensaje de seguimiento al historial para que OpenAI lo vea
        try {
          const historialActual = lead.conversation_history || [];
          historialActual.push({ 
            role: 'assistant', 
            content: msgSeguimiento, 
            timestamp: new Date().toISOString() 
          });
          await this.supabase.client
            .from('leads')
            .update({ conversation_history: historialActual.slice(-30) })
            .eq('id', lead.id);
          console.log('ðŸ“ Mensaje de seguimiento agregado al historial');
        } catch (e) {
          console.log('âš ï¸ Error agregando mensaje al historial');
        }
      }
    }

    // 4. Si pide contacto con asesor, notificar al asesor Y confirmar al cliente
    // âš ï¸ Solo se ejecuta si NO se usó el nuevo flujo de banco/modalidad
    if (analysis.send_contactos) {
      console.log('📤 VERIFICANDO NOTIFICACIÓN A ASESOR...');
      
      // Si ya se procesó con el flujo de banco, NO usar este flujo viejo
      const leadActualizado = await this.supabase.client
        .from('leads')
        .select('banco_preferido, modalidad_asesoria')
        .eq('id', lead.id)
        .single();
      
      if (leadActualizado?.data?.banco_preferido && leadActualizado?.data?.modalidad_asesoria) {
        console.log('✅ Lead tiene banco/modalidad - notificación ya se envió en PASO 6');
        // NO hacer return - continuar con el resto del código
      }
      
      // Verificar si ya se envió notificación al asesor (evitar duplicados)
      const historialCompleto = lead.conversation_history || [];
      const yaSeEnvioAsesor = historialCompleto.some((msg: any) => 
        msg.role === 'assistant' && 
        (msg.content?.includes('Tu asesor hipotecario es') || 
         msg.content?.includes('Te voy a conectar con') ||
         msg.content?.includes('te contactará pronto'))
      );
      
      if (yaSeEnvioAsesor) {
        console.log('⏭ï¸ Ya se envió notificación al asesor anteriormente, no se duplica');
        return;
      }
      
      // PRIMERO buscar asesor del banco elegido
      const bancoPreferidoLead = lead.banco_preferido || leadActualizado?.data?.banco_preferido;
      console.log('🏦 Banco preferido del lead:', bancoPreferidoLead || 'NO ESPECIFICADO');
      
      let asesorHipotecario = null;
      
      // Si tiene banco preferido, buscar asesor de ese banco
      if (bancoPreferidoLead) {
        asesorHipotecario = teamMembers.find(t => 
          (t.role?.toLowerCase().includes('asesor') || t.role?.toLowerCase().includes('hipotec')) &&
          t.banco?.toLowerCase().includes(bancoPreferidoLead.toLowerCase())
        );
        console.log('ðŸ” Buscando asesor de', bancoPreferidoLead, 'â†’', asesorHipotecario?.name || 'NO ENCONTRADO');
      }
      
      // Si no encontró por banco, buscar cualquier asesor
      if (!asesorHipotecario) {
        asesorHipotecario = teamMembers.find(t => 
          t.role?.toLowerCase().includes('hipotec') || 
          t.role?.toLowerCase().includes('credito') ||
          t.role?.toLowerCase().includes('crédito') ||
          t.role?.toLowerCase().includes('asesor')
        );
        console.log('ðŸ” Usando asesor genérico:', asesorHipotecario?.name || 'NO');
      }
      
      console.log('👤 Asesor encontrado:', asesorHipotecario?.name || 'NO', '| Tel:', asesorHipotecario?.phone || 'NO');
      
      // Obtener datos de ubicación
      const desarrolloInteres = desarrollo || lead.property_interest || 'Por definir';
      const propDesarrollo = properties.find(p => 
        p.development?.toLowerCase().includes(desarrolloInteres.toLowerCase())
      );
      const direccionAsesor = propDesarrollo?.address || propDesarrollo?.location || `Fraccionamiento ${desarrolloInteres}, Zacatecas`;
      const gpsAsesor = propDesarrollo?.gps_link || '';
      
      // OBTENER INGRESO DE LA DB PRIMERO (fuente de verdad)
      let ingresoMensual = 'No especificado';
      try {
        const { data: leadActualizado } = await this.supabase.client
          .from('leads')
          .select('ingreso_mensual')
          .eq('id', lead.id)
          .single();
        
        if (leadActualizado?.ingreso_mensual) {
          ingresoMensual = `$${Number(leadActualizado.ingreso_mensual).toLocaleString('es-MX')}/mes`;
          console.log('💰 Ingreso obtenido de DB:', ingresoMensual);
        }
      } catch (e) {
        console.log('âš ï¸ Error obteniendo ingreso de DB:', e);
      }
      
      // Solo buscar en historial si no hay ingreso en DB
      if (ingresoMensual === 'No especificado') {
        const historialConversacion = lead.conversation_history || [];
        
        // Buscar mensajes donde SARA preguntaba por ingreso Y el siguiente es respuesta del cliente
        for (let i = 0; i < historialConversacion.length - 1; i++) {
          const msgSara = historialConversacion[i];
          const msgCliente = historialConversacion[i + 1];
          
          // Solo si SARA preguntaba por ingreso
          const preguntabaIngreso = msgSara.role === 'assistant' && 
            (msgSara.content?.includes('cuánto ganas') || 
             msgSara.content?.includes('ingreso') ||
             msgSara.content?.includes('sueldo'));
          
          if (preguntabaIngreso && msgCliente.role === 'user') {
            const matchMil = msgCliente.content?.match(/(\d+)\s*mil/i);
            const matchNumero = msgCliente.content?.match(/(\d+)/);
            
            if (matchMil) {
              ingresoMensual = `$${matchMil[1]},000/mes`;
              console.log('💰 Ingreso detectado en historial CON CONTEXTO (mil):', ingresoMensual);
              break;
            } else if (matchNumero) {
              const num = parseInt(matchNumero[1]);
              if (num > 1000 && num < 1000000) { // Rango razonable de ingreso
                ingresoMensual = `$${num.toLocaleString('es-MX')}/mes`;
                console.log('💰 Ingreso detectado en historial CON CONTEXTO (número):', ingresoMensual);
                break;
              }
            }
          }
        }
      }
      
      console.log('💰 Ingreso final a enviar:', ingresoMensual);
      
      // Obtener cita existente del lead (de la DB, no solo del análisis)
      let citaExistente = '';
      try {
        const { data: citaDB } = await this.supabase.client
          .from('appointments')
          .select('scheduled_date, scheduled_time, property_name')
          .eq('lead_id', lead.id)
          .eq('status', 'scheduled')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (citaDB && citaDB.length > 0) {
          const cita = citaDB[0];
          citaExistente = `${cita.scheduled_date} a las ${cita.scheduled_time} en ${cita.property_name}`;
          console.log('📅 Cita encontrada en DB:', citaExistente);
        }
      } catch (e) {
        console.log('âš ï¸ Error buscando cita en DB');
      }
      
      // Si no hay en DB, usar del análisis
      let fechaCita = '';
      let horaCita = '';
      if (!citaExistente) {
        fechaCita = analysis.extracted_data?.fecha || '';
        horaCita = analysis.extracted_data?.hora || '';
        if (fechaCita && horaCita) {
          citaExistente = `${fechaCita} a las ${horaCita}`;
        }
      }
      
      // Formatear fecha legible para el cliente
      const formatearFechaLegible = (fechaDB: string) => {
        if (!fechaDB) return '';
        // Si ya es legible (mañana, hoy, etc), retornar
        if (fechaDB.includes('mañana') || fechaDB.includes('hoy')) return fechaDB;
        // Si es formato ISO, convertir
        try {
          const fecha = new Date(fechaDB);
          const opciones: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
          return fecha.toLocaleDateString('es-MX', opciones);
        } catch {
          return fechaDB;
        }
      };
      
      const formatearHoraLegible = (horaDB: string) => {
        if (!horaDB) return '';
        // Si tiene formato HH:MM:SS, simplificar
        const match = horaDB.match(/(\d{1,2}):(\d{2})/);
        if (match) {
          const hora = parseInt(match[1]);
          const minutos = match[2];
          const periodo = hora >= 12 ? 'pm' : 'am';
          const hora12 = hora > 12 ? hora - 12 : hora === 0 ? 12 : hora;
          return minutos === '00' ? `${hora12} ${periodo}` : `${hora12}:${minutos} ${periodo}`;
        }
        return horaDB;
      };
      
      // Crear versión legible de la cita para el cliente
      let citaLegible = '';
      if (citaExistente) {
        const partes = citaExistente.match(/(.+) a las (.+) en (.+)/);
        if (partes) {
          citaLegible = `${formatearFechaLegible(partes[1])} a las ${formatearHoraLegible(partes[2])} en *${partes[3]}*`;
        } else {
          citaLegible = citaExistente;
        }
      }
      
      const temp = lead.lead_score >= 70 ? 'HOT 🔥' : lead.lead_score >= 40 ? 'WARM 💡ï¸' : 'COLD â„ï¸';
      
      // Definir nombre del cliente
      const clientName = lead.name || analysis.extracted_data?.nombre || 'Cliente';
      const cleanPhone = from.replace('whatsapp:+', '').replace('whatsapp:', '');
      
      // Formatear ingreso y enganche para mostrar
      let ingresoReal = ingresoMensual; // Ya viene formateado de la lógica anterior
      let engancheReal = 'No especificado';
      
      // Si hay enganche en la DB, formatearlo
      if (lead.enganche_disponible) {
        engancheReal = `$${Number(lead.enganche_disponible).toLocaleString('es-MX')}`;
      }
      
      console.log('📊 Datos para asesor - Nombre:', clientName, '| Ingreso:', ingresoReal, '| Enganche:', engancheReal);
      
      if (asesorHipotecario?.phone) {
        // 1. MENSAJE COMPLETO AL ASESOR (incluye GPS)
        const msgAsesor = `🔥🔥🔥 *¡NUEVO LEAD VIP!* 🔥🔥🔥
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

💳 *SOLICITA ASESORÍA HIPOTECARIA*

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone}
🏠 *Interés:* ${desarrolloInteres}
💰 *Ingreso mensual:* ${ingresoReal}
💵 *Enganche ahorrado:* ${engancheReal}
${citaExistente ? `📅 *Cita:* ${citaExistente}` : '📅 *Cita:* Por agendar'}
📊 *Score:* ${lead.lead_score || 0}/100 ${temp}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

📍 ${direccionAsesor}
${gpsAsesor ? `ðŸ—ºï¸ ${gpsAsesor}` : ''}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
âš¡ *¡CONTÍCTALO YA!* âš¡`;

        console.log('📨 MENSAJE A ASESOR:', msgAsesor);
        
        await this.twilio.sendWhatsAppMessage(
          asesorHipotecario.phone,
          msgAsesor
        );
        console.log('📤 Notificación enviada a asesor (solicitud directa)');
        
        // 2. CONFIRMAR AL CLIENTE CON DATOS DEL ASESOR (SIN GPS para no saturar)
        const nombreAsesor = asesorHipotecario.name?.replace(/ - Asesor.*$/i, '') || 'Nuestro asesor';
        const telAsesor = asesorHipotecario.phone;
        
        // Obtener modalidad elegida
        const modalidadElegida = lead.modalidad_asesoria || leadActualizado?.data?.modalidad_asesoria || '';
        let msgContacto = 'Se pondrá en contacto contigo pronto';
        
        if (modalidadElegida.toLowerCase().includes('telefon') || modalidadElegida.toLowerCase().includes('llamada')) {
          msgContacto = 'Te llamará pronto para orientarte con tu crédito';
        } else if (modalidadElegida.toLowerCase().includes('video')) {
          msgContacto = 'Te contactará para agendar tu videollamada';
        } else if (modalidadElegida.toLowerCase().includes('presencial')) {
          msgContacto = citaLegible ? `Te verá ${citaLegible}` : 'Te contactará para agendar una cita presencial';
        }
        
        const msgConfirmacionCliente = `✅ *¡Listo ${clientName}!* Tu asesor hipotecario es:

👤 *${nombreAsesor}*
📱 ${telAsesor}

${msgContacto}`;

        await this.twilio.sendWhatsAppMessage(from, msgConfirmacionCliente);
        console.log('📤 Confirmación de asesor enviada al cliente');
        
        // Agregar confirmación al historial para evitar duplicados
        try {
          const historialActual = lead.conversation_history || [];
          historialActual.push({ 
            role: 'assistant', 
            content: msgConfirmacionCliente, 
            timestamp: new Date().toISOString() 
          });
          await this.supabase.client
            .from('leads')
            .update({ conversation_history: historialActual.slice(-30) })
            .eq('id', lead.id);
          console.log('ðŸ“ Confirmación de asesor agregada al historial');
        } catch (e) {
          console.log('âš ï¸ Error agregando confirmación al historial');
        }
        
        // 3. CREAR CITA DE ASESORÍA EN DB (si tiene fecha/hora del análisis)
        const fechaAnalisis = analysis.extracted_data?.fecha;
        const horaAnalisis = analysis.extracted_data?.hora;
        if (fechaAnalisis && horaAnalisis) {
          try {
            const { error: citaError } = await this.supabase.client
              .from('appointments')
              .insert([{
                lead_id: lead.id,
                lead_name: clientName,
                lead_phone: cleanPhone,
                property_name: desarrolloInteres,
                location: direccionAsesor,
                scheduled_date: this.parseFechaISO(fechaAnalisis),
                scheduled_time: this.parseHoraISO(horaAnalisis),
                status: 'scheduled',
                vendedor_id: asesorHipotecario.id,
                vendedor_name: nombreAsesor,
                appointment_type: 'asesoria_credito',
                duration_minutes: 60
              }]);
            
            if (citaError) {
              console.error('❌ Error creando cita asesor en DB:', citaError);
            } else {
              console.log('📅 Cita de asesoría creada en DB');
            }
          } catch (e) {
            console.error('❌ Error en cita asesor:', e);
          }
        }
      } else {
        console.log('âš ï¸ No se encontró asesor con teléfono para notificar');
      }
    }

    // 5. Actualizar lead
    await this.actualizarLead(lead, analysis, originalMessage);
  }

  // ═══════════════════════════════════════════════════════════
  // CREAR CITA COMPLETA
  // ═══════════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════════
  // GENERAR VIDEO (MUJER + ESPAÑOL + PRIMER NOMBRE)
  // ═══════════════════════════════════════════════════════════
  private async generarVideoBienvenida(
    leadPhone: string, 
    nombreCliente: string, 
    desarrollo: string, 
    photoUrl: string, 
    env: any
  ): Promise<string | null> {
    try {
      // Extraer solo el primer nombre (Ej: "Luis Jimenez" -> "Luis")
      const primerNombre = nombreCliente.trim().split(/\s+/)[0];
      console.log(`🎬 Iniciando proceso Veo 3 para: ${primerNombre} (Full: ${nombreCliente})`);

      const apiKey = env?.GEMINI_API_KEY;
      if (!apiKey) {
        console.error('❌ ERROR: Falta GEMINI_API_KEY.');
        return null;
      }

      if (!photoUrl) {
        console.log('âš ï¸ No hay foto disponible');
        return null;
      }
      
      console.log('📸 Foto a usar:', photoUrl);
      
      const imgResponse = await fetch(photoUrl);
      if (!imgResponse.ok) {
        console.log('âš ï¸ Error descargando imagen');
        return null;
      }
      const imgBuffer = await imgResponse.arrayBuffer();
      const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
      
      // PROMPT: Con Primer Nombre solamente
      const prompt = `Cinematic medium shot of a friendly professional Mexican woman real estate agent standing in front of the luxury house shown in the image. She looks at the camera, smiles warmly and gestures welcome. 
      Audio: A clear female voice speaking in Mexican Spanish saying "Hola ${primerNombre}, bienvenido a tu nuevo hogar aquí en ${desarrollo}". 
      High quality, photorealistic, 4k resolution, natural lighting.`;

      console.log('🎬 Prompt:', prompt);

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          instances: [{
            prompt: prompt,
            image: {
              bytesBase64Encoded: imgBase64,
              mimeType: "image/jpeg"
            }
          }],
          parameters: {
            aspectRatio: "9:16",
            durationSeconds: 6, 
            personGeneration: "allow_adult"
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`âš ï¸ Veo 3 Error API (${response.status}):`, errorText);
        return null;
      }

      const result = await response.json();
      
      if (result.error) {
         console.log('❌ Google rechazó:', JSON.stringify(result.error));
         return null;
      }

      const operationName = result.name;
      if (!operationName) return null;

      console.log('🎬 Veo 3 operación iniciada:', operationName);

      await this.supabase.client
        .from('pending_videos')
        .insert({
          operation_id: operationName,
          lead_phone: leadPhone.replace(/\D/g, ''),
          lead_name: nombreCliente,
          desarrollo: desarrollo
        });
      
      console.log('ðŸ“ Video encolado en DB');
      return operationName;
      
    } catch (e) {
      console.log('❌ Excepción en generarVideoBienvenida:', e);
      return null;
    }
  }


  private async crearCitaCompleta(
    from: string,
    cleanPhone: string,
    lead: any,
    desarrollo: string,
    fecha: string,
    hora: string,
    teamMembers: any[],
    analysis: AIAnalysis,
    properties: any[],
    env: any
  ): Promise<void> {
    
    // Validación defensiva
    const teamMembersArray = Array.isArray(teamMembers) ? teamMembers : [];
    
    const vendedor = teamMembersArray.find(t => t.id === lead.assigned_to);
    console.log('👤 Vendedor encontrado:', vendedor?.name || 'NO', '| Email:', vendedor?.email || 'NO', '| Phone:', vendedor?.phone || 'NO');
    
    // Buscar asesor hipotecario en el equipo (ampliar búsqueda)
    const asesorHipotecario = teamMembersArray.find(t => 
      t.role?.toLowerCase().includes('hipotec') || 
      t.role?.toLowerCase().includes('credito') ||
      t.role?.toLowerCase().includes('crédito') ||
      t.role?.toLowerCase().includes('financ') ||
      t.role?.toLowerCase().includes('asesor') ||
      t.position?.toLowerCase().includes('hipotec') ||
      t.position?.toLowerCase().includes('credito') ||
      t.name?.toLowerCase().includes('asesor')
    );
    console.log('💳 Asesor hipotecario encontrado:', asesorHipotecario?.name || 'NO', '| Email:', asesorHipotecario?.email || 'NO', '| Phone:', asesorHipotecario?.phone || 'NO');
    console.log('📋 Team members disponibles:', teamMembersArray.map(t => ({ name: t.name, role: t.role, position: t.position })));
    
    const clientName = analysis.extracted_data?.nombre || lead.name || 'Cliente';
    const score = lead.lead_score || 0;
    const temp = score >= 70 ? 'HOT 🔥' : score >= 40 ? 'WARM 💡ï¸' : 'COLD â„ï¸';
    const necesitaCredito = lead.needs_mortgage === true || analysis.extracted_data?.necesita_credito === true;

    // Buscar propiedad para obtener dirección y GPS (properties ya viene como parámetro)
    // VALIDACIÓN DEFENSIVA: asegurar que properties es un array
    const propertiesArray = Array.isArray(properties) ? properties : [];
    console.log(`🏠 Properties recibidas en crearCitaCompleta: ${propertiesArray.length} (tipo: ${typeof properties}, isArray: ${Array.isArray(properties)})`);
    
    const propDesarrollo = propertiesArray.find(p => 
      p.development?.toLowerCase().includes(desarrollo.toLowerCase())
    );
    console.log(`📍 Propiedad encontrada para ${desarrollo}:`, propDesarrollo ? `address=${propDesarrollo.address}, location=${propDesarrollo.location}` : 'NO ENCONTRADA');
    const direccion = propDesarrollo?.address || propDesarrollo?.location || `Fraccionamiento ${desarrollo}, Zacatecas`;
    const gpsLink = propDesarrollo?.gps_link || '';

    // âš ï¸ VERIFICAR SI YA EXISTE UNA CITA RECIENTE (últimos 30 minutos)
    try {
      const { data: citaExistente } = await this.supabase.client
        .from('appointments')
        .select('id, created_at, lead_name')
        .eq('lead_id', lead.id)
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (citaExistente && citaExistente.length > 0) {
        console.log('âš ï¸ Ya existe cita reciente para este lead, no se creará duplicada');
        
        // Solo actualizar el nombre si no lo teníamos y ahora sí lo tenemos
        if (analysis.extracted_data?.nombre && !citaExistente[0].lead_name) {
          await this.supabase.client
            .from('appointments')
            .update({ lead_name: analysis.extracted_data?.nombre })
            .eq('id', citaExistente[0].id);
          console.log('✅ Nombre actualizado en cita existente:', analysis.extracted_data?.nombre);
        }
        return; // NO crear cita duplicada
      }
    } catch (checkError) {
      console.log('âš ï¸ Error verificando cita existente, continuando...', checkError);
    }

    try {
      // 1. Crear cita en DB con columnas correctas
      const { data: appointment, error } = await this.supabase.client
        .from('appointments')
        .insert([{
          lead_id: lead.id,
          lead_name: clientName,
          lead_phone: cleanPhone,
          property_name: desarrollo,
          location: direccion,
          scheduled_date: this.parseFechaISO(fecha),
          scheduled_time: this.parseHoraISO(hora),
          status: 'scheduled',
          vendedor_id: vendedor?.id,
          vendedor_name: vendedor?.name,
          appointment_type: 'visita',
          duration_minutes: 60
        }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error creando cita en DB:', error);
      } else {
        console.log('📅 Cita creada en DB:', appointment?.id);
        
        // PROGRAMAR FOLLOW-UPS de cita agendada
        try {
          const followupService = new FollowupService(this.supabase);
          await followupService.programarFollowups(lead.id, from, clientName, desarrollo, 'appointment_scheduled', 'scheduled');
          console.log(`ðŸ“¬ Follow-ups de cita programados para ${clientName}`);
        } catch (e) {
          console.log('âš ï¸ Error programando follow-ups de cita:', e);
        }
      }

      const fechaEvento = this.parseFecha(fecha, hora);
      console.log('ðŸ“† Fecha evento parseada:', fechaEvento.toISOString());
      console.log('ðŸ“† Calendar object exists:', !!this.calendar);
      console.log('ðŸ“† Calendar.createEvent exists:', typeof this.calendar?.createEvent);
      
      // Formatear fechas para Google Calendar API (RFC3339 con offset)
      const endEvento = new Date(fechaEvento.getTime() + 60 * 60 * 1000);
      
      // Formato RFC3339 con offset de zona horaria México (UTC-6)
      const formatDateForCalendar = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        // Formato ISO 8601 completo
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      };
      
      // Calcular fechas una sola vez para ambos eventos
      const startDateTime = formatDateForCalendar(fechaEvento);
      const endDateTime = formatDateForCalendar(endEvento);
      
      // 2. Google Calendar - CITA VENDEDOR
      try {
        console.log('ðŸ“† Intentando crear evento VENDEDOR en Google Calendar...');
        console.log('ðŸ“† Start:', startDateTime, '| End:', endDateTime);
        
        // Normalizar evento para evitar error "Start and end times must either both be date or both be dateTime"
        const eventData: any = {
          summary: `🏠 Visita ${desarrollo} - ${clientName}`,
          description: `👤 Cliente: ${clientName}
📱 Teléfono: ${cleanPhone}
🏠 Desarrollo: ${desarrollo}
📍 Dirección: ${direccion}
ðŸ—ºï¸ GPS: ${gpsLink}
📊 Score: ${score}/100 ${temp}
💳 Necesita crédito: ${necesitaCredito ? 'SÍ' : 'No especificado'}`,
          location: direccion,
          start: {
            dateTime: startDateTime,
            timeZone: 'America/Mexico_City'
          },
          end: {
            dateTime: endDateTime,
            timeZone: 'America/Mexico_City'
          },
          attendees: []
        };
        
        // Asegurar que no haya mezcla de date y dateTime
        if (eventData.start?.dateTime) delete eventData.start.date;
        if (eventData.end?.dateTime) delete eventData.end.date;
        
        console.log('ðŸ“† Event data (normalizado):', JSON.stringify(eventData, null, 2));
        
        const eventResult = await this.calendar.createEvent(eventData);
        console.log('📅 Evento Google Calendar VENDEDOR creado:', eventResult);
      } catch (calError) {
        console.error('❌ Error Calendar Vendedor:', calError);
        console.error('❌ Error details:', JSON.stringify(calError, null, 2));
      }

      // 3. Google Calendar - CITA ASESOR HIPOTECARIO (si necesita crédito)
      console.log('💳 ¿Necesita crédito?', necesitaCredito, '| ¿Tiene asesor email?', asesorHipotecario?.email || 'NO');
      if (necesitaCredito && asesorHipotecario?.email) {
        try {
          console.log('ðŸ“† Intentando crear evento ASESOR en Google Calendar...');
          
          // Normalizar evento
          const eventAsesorData: any = {
            summary: `💳 Asesoría Crédito - ${clientName} (${desarrollo})`,
            description: `👤 Cliente: ${clientName}
📱 Teléfono: ${cleanPhone}
🏠 Desarrollo de interés: ${desarrollo}
📍 Dirección: ${direccion}
ðŸ—ºï¸ GPS: ${gpsLink}
📊 Score: ${score}/100 ${temp}
👤 Vendedor asignado: ${vendedor?.name || 'Por asignar'}`,
            location: direccion,
            start: {
              dateTime: startDateTime,
              timeZone: 'America/Mexico_City'
            },
            end: {
              dateTime: endDateTime,
              timeZone: 'America/Mexico_City'
            },
            attendees: []
          };
          
          // Asegurar que no haya mezcla de date y dateTime
          if (eventAsesorData.start?.dateTime) delete eventAsesorData.start.date;
          if (eventAsesorData.end?.dateTime) delete eventAsesorData.end.date;
          
          const eventAsesor = await this.calendar.createEvent(eventAsesorData);
          console.log('📅 Evento Google Calendar ASESOR HIPOTECARIO creado:', eventAsesor);
        } catch (calError) {
          console.error('❌ Error Calendar Asesor:', calError);
        }
      } else {
        console.log('⏭ï¸ No se creó cita de asesor:', necesitaCredito ? 'Falta email de asesor' : 'No necesita crédito');
      }

      // 4. Notificar al VENDEDOR con dirección y GPS
      if (vendedor?.phone) {
        const msgVendedor = `ðŸ””ðŸ””ðŸ”” *¡NUEVA CITA!* ðŸ””ðŸ””ðŸ””
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

🏠 *${desarrollo}*
📅 *${fecha}* a las *${hora}*

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone}
📊 *Score:* ${score}/100 ${temp}
💳 *Crédito:* ${necesitaCredito ? 'âš ï¸ SÍ NECESITA' : 'No especificado'}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

📍 ${direccion}
ðŸ—ºï¸ ${gpsLink}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
âš¡ *¡PREPÍRATE PARA RECIBIRLO!* âš¡`;

        await this.twilio.sendWhatsAppMessage(
          vendedor.phone,
          msgVendedor
        );
        console.log('📤 Notificación enviada a vendedor');
      }

      // 5. Notificar al ASESOR HIPOTECARIO (si necesita crédito)
      if (necesitaCredito && asesorHipotecario?.phone) {
        const msgAsesor = `🔥🔥🔥 *LEAD NECESITA CRÉDITO* 🔥🔥🔥
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

🏠 *${desarrollo}*
📅 *Visita:* ${fecha} a las ${hora}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

👤 *Cliente:* ${clientName}
📱 *Tel:* ${cleanPhone}
📊 *Score:* ${score}/100 ${temp}
👤 *Vendedor:* ${vendedor?.name || 'Por asignar'}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

📍 ${direccion}
ðŸ—ºï¸ ${gpsLink}

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
âš¡ *¡CONTÍCTALO PARA INICIAR TRÍMITE!* âš¡`;

        await this.twilio.sendWhatsAppMessage(
          asesorHipotecario.phone,
          msgAsesor
        );
        console.log('📤 Notificación enviada a asesor hipotecario');
      }

      // 6. Enviar confirmación al CLIENTE con info de vendedor y asesor
      let infoContactos = '';
      if (vendedor?.name) {
        infoContactos += `\n👤 *Vendedor:* ${vendedor.name}`;
        if (vendedor.phone) {
          infoContactos += `\n📱 *Tel vendedor:* ${vendedor.phone}`;
        }
      }
      if (necesitaCredito && asesorHipotecario?.name) {
        infoContactos += `\n\n💳 *Asesor de crédito:* ${asesorHipotecario.name}`;
        if (asesorHipotecario.phone) {
          infoContactos += `\n📱 *Tel asesor:* ${asesorHipotecario.phone}`;
        }
      }

      const confirmacion = `✅ *¡Cita confirmada!*

📅 *Fecha:* ${fecha}
ðŸ• *Hora:* ${hora}
🏠 *Desarrollo:* ${desarrollo}

📍 *Dirección:* ${direccion}
ðŸ—ºï¸ *Google Maps:* ${gpsLink}
${infoContactos}

¡Te esperamos! 🎉`;

      await this.twilio.sendWhatsAppMessage(from, confirmacion);
      console.log('✅ Confirmación de cita enviada');
      
      // ═══════════════════════════════════════════════════════════
      // VIDEO DE BIENVENIDA - Solo para PRIMERA cita
      // ═══════════════════════════════════════════════════════════
      try {
        // Verificar si es primera cita (solo 1 cita = la que acabamos de crear)
        const { data: todasCitas } = await this.supabase.client
          .from('appointments')
          .select('id')
          .eq('lead_id', lead.id);
        
        const esPrimeraCita = !todasCitas || todasCitas.length <= 1;
        
        // Obtener foto del desarrollo desde el CRM
        const propsConFoto = properties.filter(
          (p: any) => p.development?.toLowerCase().includes(desarrollo.toLowerCase()) && p.photo_url
        );
        const propConFoto = propsConFoto.length > 0 ? propsConFoto[Math.floor(Math.random() * propsConFoto.length)] : null;
        const fotoDesarrollo = propConFoto?.photo_url || '';
        
        if (esPrimeraCita && fotoDesarrollo) {
          console.log('🎬 PRIMERA CITA - Generando video de bienvenida...');
          
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Mensaje de bienvenida inmediato
          const msgBienvenida = `🎉 *¡Bienvenido/a ${lead.name || "Cliente"} a tu nuevo hogar!*

Estamos muy emocionados de que hayas elegido conocer *${desarrollo}*.

🏠 Con más de *50 años* construyendo hogares, Grupo Santa Rita te garantiza:
✅ Calidad premium en materiales
✅ Ubicaciones con plusvalía
✅ El mejor servicio post-venta

_Preparando algo especial para ti..._ 🎬`;
          
          await this.twilio.sendWhatsAppMessage(from, msgBienvenida);
          console.log('✅ Mensaje de bienvenida enviado');
          
          // Generar video con Veo 3 en background (el cron lo enviará)
          this.generarVideoBienvenida(from, lead.name || "Cliente", desarrollo, fotoDesarrollo, env)
            .catch(err => console.log('Error iniciando video:', err));
        } else {
          console.log('📹 No es primera cita o no hay foto:', esPrimeraCita, fotoDesarrollo ? 'SÍ' : 'NO');
        }
      } catch (videoErr) {
        console.log('âš ï¸ Error en proceso de video bienvenida:', videoErr);
      }
      
      // Enviar pregunta de crédito como mensaje SEPARADO (más visible)
      await new Promise(resolve => setTimeout(resolve, 2500)); // 2.5 segundos
      
      const msgPreguntaCredito = `💳 ¿Te gustaría que te ayudemos con el crédito hipotecario? Responde *SÍ* para orientarte 😊`;
      
      await this.twilio.sendWhatsAppMessage(from, msgPreguntaCredito);
      console.log('✅ Pregunta de crédito enviada (mensaje separado)');

      console.log('✅ CITA COMPLETA CREADA');

    } catch (error) {
      console.error('❌ Error en crearCitaCompleta:', error);
    }
  }

  private parseFecha(fecha: string, hora: string): Date {
    const now = new Date();
    const fechaLower = fecha.toLowerCase();
    
    let targetDate = new Date(now);

    if (fechaLower.includes('hoy')) {
      // Hoy
    } else if (fechaLower.includes('mañana')) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (fechaLower.includes('lunes')) {
      targetDate = this.getNextDayOfWeek(1);
    } else if (fechaLower.includes('martes')) {
      targetDate = this.getNextDayOfWeek(2);
    } else if (fechaLower.includes('miércoles') || fechaLower.includes('miercoles')) {
      targetDate = this.getNextDayOfWeek(3);
    } else if (fechaLower.includes('jueves')) {
      targetDate = this.getNextDayOfWeek(4);
    } else if (fechaLower.includes('viernes')) {
      targetDate = this.getNextDayOfWeek(5);
    } else if (fechaLower.includes('sábado') || fechaLower.includes('sabado')) {
      targetDate = this.getNextDayOfWeek(6);
    } else if (fechaLower.includes('domingo')) {
      targetDate = this.getNextDayOfWeek(0);
    }

    // Parsear hora
    const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
    if (horaMatch) {
      let hours = parseInt(horaMatch[1]);
      const minutes = parseInt(horaMatch[2] || '0');
      
      if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
      if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;
      
      targetDate.setHours(hours, minutes, 0, 0);
    }

    return targetDate;
  }

  private getNextDayOfWeek(dayOfWeek: number): Date {
    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    
    const result = new Date(now);
    result.setDate(result.getDate() + daysUntil);
    return result;
  }

  // Parsear fecha a formato ISO (YYYY-MM-DD) para Supabase
  private parseFechaISO(fecha: string): string {
    const targetDate = this.parseFecha(fecha, '12:00');
    return targetDate.toISOString().split('T')[0];
  }

  // Parsear hora a formato TIME (HH:MM:SS) para Supabase
  private parseHoraISO(hora: string): string {
    const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?/);
    if (horaMatch) {
      let hours = parseInt(horaMatch[1]);
      const minutes = horaMatch[2] || '00';
      
      if (hora.toLowerCase().includes('pm') && hours < 12) hours += 12;
      if (hora.toLowerCase().includes('am') && hours === 12) hours = 0;
      
      return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
    }
    return '12:00:00';
  }

  // ═══════════════════════════════════════════════════════════
  // ACTUALIZAR LEAD
  // ═══════════════════════════════════════════════════════════

  private async actualizarLead(lead: any, analysis: AIAnalysis, originalMessage: string): Promise<void> {
    const updates: any = {};
    const data = analysis.extracted_data;

    // Actualizar datos extraídos
    if (data.nombre && !lead.name) {
      updates.name = data.nombre;
    }
    if (data.desarrollo && !lead.property_interest) {
      updates.property_interest = data.desarrollo;
    }
    if (data.necesita_credito !== null && data.necesita_credito !== undefined && lead.needs_mortgage === null) {
      updates.needs_mortgage = data.necesita_credito;
    }
    // num_recamaras deshabilitado - columna no existe en DB
    // if (data.num_recamaras && !lead.num_recamaras) {
    //   updates.num_recamaras = data.num_recamaras;
    // }

    // Calcular score
    let score = lead.lead_score || 0;
    
    if (!lead.name && data.nombre) {
      score += 15;
      console.log('📊 +15 por nombre');
    }
    if (!lead.property_interest && data.desarrollo) {
      score += 15;
      console.log('📊 +15 por desarrollo');
    }
    if (lead.needs_mortgage === null && data.necesita_credito !== null && data.necesita_credito !== undefined) {
      score += 10;
      console.log('📊 +10 por crédito');
    }
    if (analysis.intent === 'confirmar_cita' && data.fecha && data.hora) {
      score += 20;
      console.log('📊 +20 por cita confirmada');
    }

    updates.lead_score = Math.min(score, 100);
    updates.lead_category = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';

    // Actualizar historial
    const newHistory = [
      ...(lead.conversation_history || []),
      { role: 'user', content: originalMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: analysis.response, timestamp: new Date().toISOString() }
    ].slice(-30);

    updates.conversation_history = newHistory;
    updates.updated_at = new Date().toISOString();

    // Guardar
    const { error, data: citaCreada } = await this.supabase.client
      .from('leads')
      .update(updates)
      .eq('id', lead.id);

    if (error) {
      console.error('❌ Error actualizando lead:', error);
    } else {
      console.log('ðŸ“ Lead actualizado:', { score: updates.lead_score, temp: updates.lead_category });
    }
  }

  // =====================================================
  // FUNCIONES DE ACTIVIDADES
  // =====================================================

  private async registrarActividad(from: string, nombreLead: string, tipo: string, vendedor: any, monto?: number | null): Promise<void> {
    // Buscar lead
    let query = this.supabase.client
      .from('leads')
      .select('id, name, phone, status, score, property_interest')
      .ilike('name', '%' + nombreLead + '%')
      .order('updated_at', { ascending: false });
    
    if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
      query = query.eq('assigned_to', vendedor.id);
    }

    const { data: leads } = await query;

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 
        'No encontre a "' + nombreLead + '"\n\nCrealo con:\nNuevo ' + nombreLead + ' [telefono]');
      return;
    }

    if (leads.length > 1) {
      let msg = 'Encontre ' + leads.length + ' leads:\n';
      leads.slice(0, 5).forEach((l: any, i: number) => {
        msg += (i+1) + '. ' + l.name + ' (' + l.status + ')\n';
      });
      msg += '\nSe mas especifico o usa el telefono.';
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Registrar actividad
    await this.supabase.client.from('lead_activities').insert({
      lead_id: lead.id,
      team_member_id: vendedor.id,
      activity_type: tipo,
      amount: monto || null,
      property_id: lead.property_interest || null
    });

    // Score basado en FUNNEL (no acumulativo por actividades)
    const scoreByFunnel: Record<string, number> = {
      'new': 10,
      'contacted': 20,
      'scheduled': 35,
      'visited': 50,
      'negotiation': 70,
      'reserved': 85,
      'closed': 100,
      'delivered': 100,
      'fallen': 0
    };
    
    // Si es visita y estaba en scheduled, mover a visited
    let nuevoStatus = lead.status;
    if (tipo === 'visit' && lead.status === 'scheduled') {
      nuevoStatus = 'visited';
    }

    // Score base por etapa + ajuste pequeño por cotización
    let nuevoScore = scoreByFunnel[nuevoStatus] || 10;
    if (tipo === 'quote' && monto) {
      nuevoScore = Math.min(nuevoScore + 5, 100);
    }

    // Calcular temperatura basada en etapa
    const etapasHot = ['negotiation', 'reserved'];
    const etapasCliente = ['closed', 'delivered'];
    let nuevaCategoria = 'COLD';
    if (etapasCliente.includes(nuevoStatus)) nuevaCategoria = 'CLIENTE';
    else if (etapasHot.includes(nuevoStatus)) nuevaCategoria = 'HOT';
    else if (nuevoScore >= 35) nuevaCategoria = 'WARM';

    const updateData: any = {
      score: nuevoScore,
      lead_score: nuevoScore,
      lead_category: nuevaCategoria,
      status: nuevoStatus,
      updated_at: new Date().toISOString()
    };
    if (tipo === 'quote' && monto) {
      updateData.quote_amount = monto;
    }

    await this.supabase.client.from('leads').update(updateData).eq('id', lead.id);

    // Mensaje de confirmacion
    const tipoLabels: Record<string, string> = {
      'call': 'Llamada',
      'visit': 'Visita',
      'quote': 'Cotizacion',
      'whatsapp': 'WhatsApp',
      'email': 'Email'
    };

    let respuesta = tipoLabels[tipo] + ' a ' + lead.name + ' registrada\n';
    respuesta += 'Etapa: ' + nuevoStatus;
    // HOT = negotiation y reserved (pueden cerrar pronto)
    // CLIENTE = closed y delivered (ya cerraron)
    if (etapasCliente.includes(nuevoStatus)) respuesta += ' CLIENTE';
    else if (etapasHot.includes(nuevoStatus)) respuesta += ' HOT';
    if (monto) respuesta += '\nMonto: $' + monto.toLocaleString();
    if (tipo === 'visit' && nuevoStatus === 'visited') {
      respuesta += '\nMovido a VISITO automaticamente';
    }

    await this.twilio.sendWhatsAppMessage(from, respuesta);
  }

  private async mostrarActividadesHoy(from: string, vendedor: any): Promise<void> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data: actividades } = await this.supabase.client
      .from('lead_activities')
      .select('activity_type, amount, created_at, leads:lead_id (name)')
      .eq('team_member_id', vendedor.id)
      .gte('created_at', hoy.toISOString())
      .order('created_at', { ascending: false });

    if (!actividades || actividades.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 
        'No registraste actividad hoy.\n\nRegistra con:\n- "Llame a Juan"\n- "Visite a Maria"\n- "Cotizacion a Pedro 850k"');
      return;
    }

    // Agrupar por tipo
    const resumen: Record<string, string[]> = {
      'call': [],
      'visit': [],
      'quote': [],
      'whatsapp': [],
      'email': []
    };

    let montoTotal = 0;
    actividades.forEach((a: any) => {
      const nombre = a.leads?.name || 'Desconocido';
      if (resumen[a.activity_type]) {
        resumen[a.activity_type].push(nombre);
      }
      if (a.amount) montoTotal += a.amount;
    });

    let msg = 'Tu actividad hoy:\n\n';
    
    if (resumen.call.length > 0) {
      msg += 'Llamadas: ' + resumen.call.length + '\n';
      msg += '  ' + resumen.call.slice(0, 5).join(', ') + '\n\n';
    }
    if (resumen.visit.length > 0) {
      msg += 'Visitas: ' + resumen.visit.length + '\n';
      msg += '  ' + resumen.visit.join(', ') + '\n\n';
    }
    if (resumen.quote.length > 0) {
      msg += 'Cotizaciones: ' + resumen.quote.length;
      if (montoTotal > 0) msg += ' ($' + montoTotal.toLocaleString() + ')';
      msg += '\n  ' + resumen.quote.join(', ') + '\n\n';
    }
    if (resumen.whatsapp.length > 0) {
      msg += 'WhatsApps: ' + resumen.whatsapp.length + '\n';
    }
    if (resumen.email.length > 0) {
      msg += 'Emails: ' + resumen.email.length + '\n';
    }

    msg += '\nTotal: ' + actividades.length + ' actividades';

    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  private async mostrarHistorialLead(from: string, nombreLead: string, vendedor: any): Promise<void> {
    // Buscar lead
    let query = this.supabase.client
      .from('leads')
      .select('id, name, phone, status, score, property_interest, quote_amount, source, created_at')
      .ilike('name', '%' + nombreLead + '%')
      .order('updated_at', { ascending: false });
    
    if (vendedor.role !== 'admin' && vendedor.role !== 'coordinador') {
      query = query.eq('assigned_to', vendedor.id);
    }

    const { data: leads } = await query.limit(5);

    if (!leads || leads.length === 0) {
      await this.twilio.sendWhatsAppMessage(from, 'No encontre a "' + nombreLead + '"');
      return;
    }

    if (leads.length > 1) {
      let msg = 'Encontre ' + leads.length + ' leads:\n';
      leads.forEach((l: any, i: number) => {
        msg += (i+1) + '. ' + l.name + ' (' + l.status + ') ' + l.phone + '\n';
      });
      msg += '\nSe mas especifico o usa el telefono.';
      await this.twilio.sendWhatsAppMessage(from, msg);
      return;
    }

    const lead = leads[0];

    // Buscar actividades
    const { data: actividades } = await this.supabase.client
      .from('lead_activities')
      .select('activity_type, amount, notes, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(10);

    let msg = lead.name + '\n';
    msg += 'Tel: ' + lead.phone + '\n';
    msg += 'Etapa: ' + lead.status;
    // HOT = negotiation y reserved
    // CLIENTE = closed y delivered
    const hotStages = ['negotiation', 'reserved'];
    const clientStages = ['closed', 'delivered'];
    if (clientStages.includes(lead.status)) msg += ' CLIENTE';
    else if (hotStages.includes(lead.status)) msg += ' HOT';
    msg += '\n';
    if (lead.property_interest) msg += 'Desarrollo: ' + lead.property_interest + '\n';
    if (lead.quote_amount) msg += 'Cotizacion: $' + lead.quote_amount.toLocaleString() + '\n';
    if (lead.source) msg += 'Origen: ' + lead.source + '\n';

    msg += '\nHISTORIAL:\n';

    if (actividades && actividades.length > 0) {
      const tipoEmoji: Record<string, string> = {
        'call': 'Tel',
        'visit': 'Visita',
        'quote': 'Cotiz',
        'whatsapp': 'WA',
        'email': 'Email',
        'created': 'Creado',
        'status_change': 'Movio'
      };

      actividades.forEach((a: any) => {
        const fecha = new Date(a.created_at);
        const fechaStr = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        msg += fechaStr + ' - ' + (tipoEmoji[a.activity_type] || a.activity_type);
        if (a.amount) msg += ' $' + a.amount.toLocaleString();
        msg += '\n';
      });
    } else {
      msg += 'Sin actividades registradas\n';
    }

    // Fecha creacion
    const creado = new Date(lead.created_at);
    msg += '\nCreado: ' + creado.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  private async crearLeadDesdeWhatsApp(from: string, nombre: string, telefono: string, vendedor: any): Promise<void> {
    // Normalizar telefono
    const digits = telefono.replace(/\D/g, '').slice(-10);
    const normalizedPhone = '521' + digits;

    // Verificar si ya existe
    const { data: existente } = await this.supabase.client
      .from('leads')
      .select('id, name, status')
      .like('phone', '%' + digits)
      .limit(1);

    if (existente && existente.length > 0) {
      await this.twilio.sendWhatsAppMessage(from, 
        'Ya existe: ' + existente[0].name + ' (' + existente[0].status + ')\n\nTel: ' + digits);
      return;
    }

    // Crear lead
    const { data: nuevoLead, error } = await this.supabase.client
      .from('leads')
      .insert({
        name: nombre,
        phone: normalizedPhone,
        status: 'new',
        score: 10,
        assigned_to: vendedor.id,
        created_by: vendedor.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando lead:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Error al crear lead. Intenta de nuevo.');
      return;
    }

    // Registrar actividad de creacion
    await this.supabase.client.from('lead_activities').insert({
      lead_id: nuevoLead.id,
      team_member_id: vendedor.id,
      activity_type: 'created'
    });

    // Guardar estado pendiente para desarrollo y origen
    await this.supabase.client.from('leads').update({
      notes: { pending_setup: true }
    }).eq('id', nuevoLead.id);

    // Obtener desarrollos
    const { data: props } = await this.supabase.client
      .from('properties')
      .select('id, name')
      .eq('active', true);

    let msg = 'Lead creado: ' + nombre + '\n';
    msg += 'Tel: ' + normalizedPhone + '\n\n';
    msg += 'Desarrollo?\n';
    
    if (props && props.length > 0) {
      props.slice(0, 6).forEach((p: any, i: number) => {
        msg += (i+1) + '. ' + p.name + '\n';
      });
      msg += '\nResponde con el numero o nombre.';
    } else {
      msg += 'Escribe el nombre del desarrollo.';
    }

    await this.twilio.sendWhatsAppMessage(from, msg);
  }

  // ═══════════════════════════════════════════════════════════
  // CRON: SEGUIMIENTO BROKER HIPOTECARIO
  // ═══════════════════════════════════════════════════════════
  async cronSeguimientoBroker(): Promise<{ recordados: number; escalados: number; docsPendientes: number; sinRespuesta: number }> {
    // Seguimiento a asesores de bancos
    const resultadoAsesores = await this.brokerService.seguimientoAutomatico();
    
    // Seguimiento a clientes que no han mandado docs
    const docsPendientes = await this.brokerService.seguimientoDocsPendientes();
    
    // Seguimiento a clientes que no respondieron al recordatorio
    const sinRespuesta = await this.brokerService.seguimientoSinRespuesta();
    
    console.log(`🏦 Broker CRON: 
      - ${resultadoAsesores.recordados} recordatorios a asesores
      - ${resultadoAsesores.escalados} escalados
      - ${docsPendientes} recordatorios de docs
      - ${sinRespuesta} seguimientos sin respuesta`);
    
    return { ...resultadoAsesores, docsPendientes, sinRespuesta };
  }
}
