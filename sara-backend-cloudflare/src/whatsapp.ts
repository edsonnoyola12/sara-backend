import { SupabaseService } from '../services/supabase';
import { OpenAIService } from '../services/openai';
import { TwilioService } from '../services/twilio';

const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';

const MAPS_UBICACIONES: { [key: string]: string } = {
  'Ceiba': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389',
  'Eucalipto': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389',
  'Cedro': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389',
  'Abeto': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas',
  'Fresno': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas',
  'Roble': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas',
  'Madroño': 'https://www.google.com.mx/maps/place/PRIVADA+MONTE+REAL+-+Grupo+Santa+Rita/@22.7399971,-102.6022833,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f30d886fd53:0xfd697cf8e7379698!8m2!3d22.7399971!4d-102.6000946',
  'Avellano': 'https://www.google.com.mx/maps/place/PRIVADA+MONTE+REAL+-+Grupo+Santa+Rita/@22.7399971,-102.6022833,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f30d886fd53:0xfd697cf8e7379698!8m2!3d22.7399971!4d-102.6000946',
  'Lavanda': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A',
  'Tulipán': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A',
  'Azalea': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A',
  'Almendro': 'https://www.google.com/maps/search/?api=1&query=Miravalle+Colinas+del+Padre+Zacatecas',
  'Olivo': 'https://www.google.com/maps/search/?api=1&query=Miravalle+Colinas+del+Padre+Zacatecas',
  'Girasol': 'https://www.google.com/maps/search/?api=1&query=Villa+Galiano,+Zacatecas',
  'Gardenia': 'https://www.google.com/maps/search/?api=1&query=Villa+Galiano,+Zacatecas',
  'Halcón': 'https://www.google.com.mx/maps/place/PRIVADA+DISTRITO+FALCO+-+Grupo+Santa+Rita/@22.7711248,-102.5331916,17z/data=!3m1!4b1!4m5!3m4!1s0x86824eb359ad753d:0x9da80a7bc640e4a6!8m2!3d22.7711248!4d-102.5310029',
  'Águila': 'https://www.google.com.mx/maps/place/PRIVADA+DISTRITO+FALCO+-+Grupo+Santa+Rita/@22.7711248,-102.5331916,17z/data=!3m1!4b1!4m5!3m4!1s0x86824eb359ad753d:0x9da80a7bc640e4a6!8m2!3d22.7711248!4d-102.5310029',
  'Sauce': 'https://www.google.com/maps/search/?api=1&query=Villa+Campelo,+Guadalupe,+Zacatecas',
  'Nogal': 'https://www.google.com/maps/search/?api=1&query=Villa+Campelo,+Guadalupe,+Zacatecas',
  'Orquídea': 'https://www.google.com/maps/search/?api=1&query=Privada+Alpes+Cordilleras+Guadalupe+Zacatecas',
  'Dalia': 'https://www.google.com/maps/search/?api=1&query=Privada+Alpes+Cordilleras+Guadalupe+Zacatecas'
};


export class WhatsAppHandler {
  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService,
    private twilio: TwilioService,
    private calendar: any
  ) {}

  async handleIncomingMessage(from: string, body: string): Promise<void> {
    try {
      console.log('📱 Mensaje de:', from, '-', body);
      console.log('🚀🚀🚀 VERSION: FIX_TYPOS_DIC_9_V2 🚀🚀🚀');

      const cleanPhone = from.replace('whatsapp:', '');
      const bodyLower = body.toLowerCase();

      // ═══════════════════════════════════════════════════════════
      // 🚨 DETECCIÓN TEMPRANA 1: QUEJAS POST-COMPRA (Prioridad máxima)
      // ═══════════════════════════════════════════════════════════
      const isPostSaleComplaint = /gotera|goteras|oxidación|oxidacion|grieta|grietas|defecto|defectos|problema en mi casa|me vendieron mal|casa mal hecha|pintura cayendo|cayéndose|piso desnivelado|ventanas oxidadas|filtración|filtracion|humedad|garantía|garantia/i.test(body);
      
      if (isPostSaleComplaint && !bodyLower.includes('cancelar')) {
        console.log('🚨 DETECCIÓN: QUEJA POST-COMPRA');
        
        const responsePostSale = `Lamento muchísimo esta situación 😔

Entiendo tu molestia perfectamente. Los problemas en tu casa deben atenderse de inmediato.

🔧 PROCESO DE GARANTÍA:

Todas nuestras casas tienen GARANTÍA:
• Defectos estructurales: 10 años
• Instalaciones: 2 años
• Acabados: 1 año

📋 ACCIÓN INMEDIATA:

1️⃣ ENVÍA FOTOS/VIDEO
   Por favor envíame fotos del problema ahora mismo

2️⃣ SUPERVISOR ASIGNADO
   Voy a escalar tu caso AHORA con el departamento de garantías
   
3️⃣ INSPECCIÓN: 24-48 hrs
   Un técnico evaluará el problema

4️⃣ REPARACIÓN: 7-15 días
   Si está en garantía: SIN COSTO

🚨 URGENTE: Para problemas estructurales o de seguridad, la atención es el MISMO DÍA.

📸 Por favor comparte las fotos y te escalo INMEDIATAMENTE.

Necesito saber:
• ¿En qué desarrollo/fraccionamiento compraste?
• ¿Hace cuánto tiempo entregaron la casa?`;

        await this.twilio.sendWhatsAppMessage(from, responsePostSale);
        return; // Terminar aquí, no procesar como lead normal
      }

      // ═══════════════════════════════════════════════════════════
      // 🚨 DETECCIÓN TEMPRANA 2: OFF-TOPIC (noticias, política)
      // ═══════════════════════════════════════════════════════════
      const isOffTopicNews = /(?:viste|opinión|opinas|piensas|qué pasó).*(?:noticia|noticias|presidente|gobierno|política)/i.test(body);
      const hasRealEstateContext = /casa|propiedad|crédito|hipoteca|venta|comprar/i.test(body);
      
      if (isOffTopicNews && !hasRealEstateContext && !bodyLower.includes('cancelar')) {
        console.log('🚨 DETECCIÓN: OFF-TOPIC (noticias/política)');
        
        const responseOffTopic = `Hola 😊

Soy SARA, el asistente virtual de Grupo Santa Rita especializado en bienes raíces.

No tengo información sobre noticias o temas generales, mi función es ayudarte con:

🏠 Propiedades disponibles
💰 Información de precios
📋 Créditos hipotecarios
📅 Agendar citas para ver casas
📍 Ubicaciones y desarrollos

¿Hay algo relacionado con compra de casa en lo que pueda ayudarte? 😊`;

        await this.twilio.sendWhatsAppMessage(from, responseOffTopic);
        return; // Terminar aquí
      }

      // ========================================
      // SISTEMA DE COMANDOS WHATSAPP (original)
      // ========================================
      
      // Detectar si es vendedor/asesor
      const { data: teamMember } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', cleanPhone)
        .eq('active', true)
        .single();
      
      const isTeamMember = !!teamMember;
      
      // COMANDO: CANCELAR CITA
      if (bodyLower.includes('cancelar') && bodyLower.includes('cita')) {
        if (isTeamMember) {
          // Vendedor/Asesor cancela cita de cliente
          const phoneMatch = body.match(/\+?5?2?1?(\d{10})/);
          if (phoneMatch) {
            const clientPhone = '+521' + phoneMatch[1];
            const { data: appointment } = await this.supabase.client
              .from('appointments')
              .select('*, leads(*)')
              .eq('lead_phone', clientPhone)
              .eq('status', 'scheduled')
              .order('scheduled_date', { ascending: true })
              .limit(1)
              .single();
            
            if (appointment) {
              const fechaCita = new Date(appointment.scheduled_date + 'T' + appointment.scheduled_time);
              const fechaStr = fechaCita.toLocaleDateString('es-MX');
              const horaStr = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
              
              // Cancelar en DB
              await this.supabase.client
                .from('appointments')
                .update({ status: 'cancelled', cancelled_by: cleanPhone })
                .eq('id', appointment.id);
              
              // Cancelar eventos de Google Calendar
              if (appointment.google_event_vendedor_id) {
                await this.calendar.deleteEvent(appointment.google_event_vendedor_id);
              }
              if (appointment.google_event_asesor_id) {
                await this.calendar.deleteEvent(appointment.google_event_asesor_id);
              }
              
              // Confirmar a quien canceló
              await this.twilio.sendWhatsAppMessage(from, `✅ Cita cancelada para ${appointment.leads?.name || clientPhone}`);
              
              // Notificar al cliente
              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + clientPhone,
                `❌ *CITA CANCELADA*\n\n🏠 ${appointment.property_name}\n📅 ${fechaStr} ${horaStr}\n\nTu cita fue cancelada por el equipo. ¿Quieres reagendar?`
              );
              
              // Notificar al otro miembro del equipo (si hay)
              const esVendedor = appointment.vendedor_id && appointment.vendedor_id !== teamMember?.id;
              const esAsesor = appointment.asesor_id && appointment.asesor_id !== teamMember?.id;
              
              if (esVendedor && appointment.vendedor_id) {
                const { data: otroVendedor } = await this.supabase.client
                  .from('team_members')
                  .select('phone')
                  .eq('id', appointment.vendedor_id)
                  .single();
                
                if (otroVendedor?.phone) {
                  await this.twilio.sendWhatsAppMessage(
                    'whatsapp:' + otroVendedor.phone,
                    `❌ *CITA CANCELADA*\n\n👤 ${clientPhone}\n🏠 ${appointment.property_name}\n📅 ${fechaStr} ${horaStr}\n\n*Cancelada por ${teamMember.name}*`
                  );
                }
              }
              
              if (esAsesor && appointment.asesor_id) {
                const { data: otroAsesor } = await this.supabase.client
                  .from('team_members')
                  .select('phone')
                  .eq('id', appointment.asesor_id)
                  .single();
                
                if (otroAsesor?.phone) {
                  await this.twilio.sendWhatsAppMessage(
                    'whatsapp:' + otroAsesor.phone,
                    `❌ *CITA CANCELADA*\n\n👤 ${clientPhone}\n🏠 ${appointment.property_name}\n📅 ${fechaStr} ${horaStr}\n\n*Cancelada por ${teamMember.name}*`
                  );
                }
              }
              
              return;
            } else {
              await this.twilio.sendWhatsAppMessage(from, '❌ No encontré cita activa para ese cliente');
              return;
            }
          }
        } else {
          // Cliente cancela su propia cita
          
          // ═══════════════════════════════════════════════════════════
          // CANCELACIÓN SELECTIVA: Detectar si quiere cancelar solo vendedor o solo asesor
          // ═══════════════════════════════════════════════════════════
          const wantsCancelVendedor = /cancelar.*(?:con|al|cita con|cita del|del).*vendedor/i.test(body);
          const wantsCancelAsesor = /cancelar.*(?:con|al|cita con|cita del|del).*(?:asesor|hipoteca|crédito|financiamiento)/i.test(body);
          
          if (wantsCancelVendedor || wantsCancelAsesor) {
            console.log('🎯 CANCELACIÓN SELECTIVA detectada:', { vendedor: wantsCancelVendedor, asesor: wantsCancelAsesor });
            
            // Buscar ambas citas del cliente
            const { data: appointments } = await this.supabase.client
              .from('appointments')
              .select('*')
              .eq('lead_phone', cleanPhone)
              .eq('status', 'scheduled')
              .order('scheduled_date', { ascending: true });
            
            if (!appointments || appointments.length === 0) {
              await this.twilio.sendWhatsAppMessage(from, '❌ No tienes citas programadas.');
              return;
            }
            
            const citaVendedor = appointments.find(a => a.vendedor_id && !a.asesor_id);
            const citaAsesor = appointments.find(a => a.asesor_id && !a.vendedor_id);
            
            if (wantsCancelVendedor && citaVendedor) {
              // Cancelar solo cita con vendedor
              const fechaCita = new Date(citaVendedor.scheduled_date + 'T' + citaVendedor.scheduled_time);
              const fechaStr = fechaCita.toLocaleDateString('es-MX');
              const horaStr = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
              
              await this.supabase.client
                .from('appointments')
                .update({ status: 'cancelled', cancelled_by: cleanPhone })
                .eq('id', citaVendedor.id);
              
              if (citaVendedor.google_event_vendedor_id) {
                await this.calendar.deleteEvent(citaVendedor.google_event_vendedor_id);
              }
              
              let mensaje = `✅ Cita con vendedor CANCELADA\n\n❌ CANCELADA:\nPropiedad: ${citaVendedor.property_name}\nFecha: ${fechaStr} ${horaStr}`;
              
              if (citaAsesor) {
                const fechaAsesor = new Date(citaAsesor.scheduled_date + 'T' + citaAsesor.scheduled_time);
                const fechaAsesorStr = fechaAsesor.toLocaleDateString('es-MX');
                const horaAsesorStr = fechaAsesor.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                mensaje += `\n\n✅ SIGUE VIGENTE:\nCita con asesor hipotecario\nFecha: ${fechaAsesorStr} ${horaAsesorStr}`;
              }
              
              await this.twilio.sendWhatsAppMessage(from, mensaje);
              
              // Notificar al vendedor
              if (citaVendedor.vendedor_id) {
                const { data: vendedor } = await this.supabase.client
                  .from('team_members')
                  .select('phone')
                  .eq('id', citaVendedor.vendedor_id)
                  .single();
                
                if (vendedor?.phone) {
                  await this.twilio.sendWhatsAppMessage(
                    'whatsapp:' + vendedor.phone,
                    `❌ *CITA CANCELADA*\n\n👤 ${cleanPhone}\n🏠 ${citaVendedor.property_name}\n📅 ${fechaStr} ${horaStr}\n\n*El cliente canceló*`
                  );
                }
              }
              
              return;
            }
            
            if (wantsCancelAsesor && citaAsesor) {
              // Cancelar solo cita con asesor
              const fechaCita = new Date(citaAsesor.scheduled_date + 'T' + citaAsesor.scheduled_time);
              const fechaStr = fechaCita.toLocaleDateString('es-MX');
              const horaStr = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
              
              await this.supabase.client
                .from('appointments')
                .update({ status: 'cancelled', cancelled_by: cleanPhone })
                .eq('id', citaAsesor.id);
              
              if (citaAsesor.google_event_asesor_id) {
                await this.calendar.deleteEvent(citaAsesor.google_event_asesor_id);
              }
              
              let mensaje = `✅ Cita con asesor hipotecario CANCELADA\n\n❌ CANCELADA:\nAsesoría hipotecaria\nFecha: ${fechaStr} ${horaStr}`;
              
              if (citaVendedor) {
                const fechaVendedor = new Date(citaVendedor.scheduled_date + 'T' + citaVendedor.scheduled_time);
                const fechaVendedorStr = fechaVendedor.toLocaleDateString('es-MX');
                const horaVendedorStr = fechaVendedor.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                mensaje += `\n\n✅ SIGUE VIGENTE:\nCita con vendedor\nPropiedad: ${citaVendedor.property_name}\nFecha: ${fechaVendedorStr} ${horaVendedorStr}`;
              }
              
              await this.twilio.sendWhatsAppMessage(from, mensaje);
              
              // Notificar al asesor
              if (citaAsesor.asesor_id) {
                const { data: asesor } = await this.supabase.client
                  .from('team_members')
                  .select('phone')
                  .eq('id', citaAsesor.asesor_id)
                  .single();
                
                if (asesor?.phone) {
                  await this.twilio.sendWhatsAppMessage(
                    'whatsapp:' + asesor.phone,
                    `❌ *CITA CANCELADA*\n\n👤 ${cleanPhone}\n📅 ${fechaStr} ${horaStr}\n\n*El cliente canceló*`
                  );
                }
              }
              
              return;
            }
            
            // Si no encontró la cita específica
            await this.twilio.sendWhatsAppMessage(from, '❌ No encontré esa cita específica. Usa "ver mi cita" para ver tus citas activas.');
            return;
          }
          
          // ═══════════════════════════════════════════════════════════
          // CANCELACIÓN TOTAL (si no especificó vendedor/asesor)
          // ═══════════════════════════════════════════════════════════
          const { data: appointment } = await this.supabase.client
            .from('appointments')
            .select('*')
            .eq('lead_phone', cleanPhone)
            .eq('status', 'scheduled')
            .order('scheduled_date', { ascending: true })
            .limit(1)
            .single();
          
          if (appointment) {
            const fechaCita = new Date(appointment.scheduled_date + 'T' + appointment.scheduled_time);
            const fechaStr = fechaCita.toLocaleDateString('es-MX');
            const horaStr = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            
            // Cancelar en DB
            await this.supabase.client
              .from('appointments')
              .update({ status: 'cancelled', cancelled_by: cleanPhone })
              .eq('id', appointment.id);
            
            // Cancelar eventos de Google Calendar
            if (appointment.google_event_vendedor_id) {
              await this.calendar.deleteEvent(appointment.google_event_vendedor_id);
            }
            if (appointment.google_event_asesor_id) {
              await this.calendar.deleteEvent(appointment.google_event_asesor_id);
            }
            
            // Confirmar al cliente
            await this.twilio.sendWhatsAppMessage(from, '✅ Tu cita ha sido cancelada. ¿Quieres agendar otra?');
            
            // Notificar al vendedor SI estaba asignado
            if (appointment.vendedor_id) {
              const { data: vendedor } = await this.supabase.client
                .from('team_members')
                .select('phone')
                .eq('id', appointment.vendedor_id)
                .single();
              
              if (vendedor?.phone) {
                await this.twilio.sendWhatsAppMessage(
                  'whatsapp:' + vendedor.phone,
                  `❌ *CITA CANCELADA*\n\n👤 ${appointment.lead_phone}\n🏠 ${appointment.property_name}\n📅 ${fechaStr} ${horaStr}\n\n*El cliente canceló*`
                );
              }
            }
            
            // Notificar al asesor SI estaba asignado
            if (appointment.asesor_id) {
              const { data: asesor } = await this.supabase.client
                .from('team_members')
                .select('phone')
                .eq('id', appointment.asesor_id)
                .single();
              
              if (asesor?.phone) {
                await this.twilio.sendWhatsAppMessage(
                  'whatsapp:' + asesor.phone,
                  `❌ *CITA CANCELADA*\n\n👤 ${appointment.lead_phone}\n🏠 ${appointment.property_name}\n📅 ${fechaStr} ${horaStr}\n\n*El cliente canceló*`
                );
              }
            }
            
            return;
          } else {
            await this.twilio.sendWhatsAppMessage(from, '❌ No tienes citas activas');
            return;
          }
        }
      }
      
      // COMANDO: VER MI CITA
      if ((bodyLower.includes('mi cita') || bodyLower.includes('mis citas')) && !isTeamMember) {
        console.log('🔍 Buscando citas para:', cleanPhone);
        
        const { data: appointments } = await this.supabase.client
          .from('appointments')
          .select('*')
          .eq('lead_phone', cleanPhone)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true });
        
        console.log('📅 Citas encontradas:', appointments?.length);
        
        if (appointments && appointments.length > 0) {
          const cita = appointments[0];
          const fecha = new Date(cita.scheduled_date + 'T' + cita.scheduled_time);
          const mensaje = `📅 Tu próxima cita:\n\n🏠 Propiedad: ${cita.property_name}\n📆 Fecha: ${fecha.toLocaleDateString('es-MX')}\n🕐 Hora: ${fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\n\n¿Necesitas cancelar o cambiar?`;
          await this.twilio.sendWhatsAppMessage(from, mensaje);
          return;
        } else {
          await this.twilio.sendWhatsAppMessage(from, '📅 No tienes citas programadas. ¿Te gustaría agendar una?');
          return;
        }
      }
      
      // COMANDO: MOVER LEAD (solo vendedores/asesores)
      if (isTeamMember && bodyLower.includes('mover lead')) {
        const phoneMatch = body.match(/\+?5?2?1?(\d{10})/);
        const statusMatch = body.match(/(?:a |en )?(contactado|interesado|visita|negociación|cierre)/i);
        
        if (phoneMatch && statusMatch) {
          const clientPhone = '+521' + phoneMatch[1];
          const newStatus = statusMatch[1].toLowerCase();
          
          const { data: lead } = await this.supabase.client
            .from('leads')
            .select('*')
            .eq('phone', clientPhone)
            .single();
          
          if (lead) {
            await this.supabase.client
              .from('leads')
              .update({ status: newStatus })
              .eq('phone', clientPhone);
            
            await this.twilio.sendWhatsAppMessage(from, `✅ Lead ${lead.name || clientPhone} movido a: ${newStatus}`);
            return;
          } else {
            await this.twilio.sendWhatsAppMessage(from, '❌ Lead no encontrado');
            return;
          }
        }
      }
      
      
      // Cargar datos de Supabase
      const [propertiesRes, teamRes, campaignsRes] = await Promise.all([
        this.supabase.client.from('properties').select('*'),
        this.supabase.client.from('team_members').select('*').eq('active', true),
        this.supabase.client.from('marketing_campaigns').select('*')
      ]);

      const properties = propertiesRes.data || [];
      const team = teamRes.data || [];
      const campaigns = campaignsRes.data || [];
      
      const vendedores = team.filter(t => t.role === 'vendedor');
      const asesores = team.filter(t => t.role === 'asesor');
      const agencias = team.filter(t => t.role === 'agencia');

      // Detectar si es de la agencia
      const isAgency = agencias.some(a => a.phone && cleanPhone.includes(a.phone.replace(/\D/g, '').slice(-10)));

      if (isAgency) {
        console.log('📊 Mensaje de agencia detectado');
        
        const impressionsMatch = body.match(/(\d[\d,\.]*)\s*(?:impresion|impression)/i);
        const clicksMatch = body.match(/(\d[\d,\.]*)\s*(?:click|clic)/i);
        const leadsMatch = body.match(/(\d[\d,\.]*)\s*(?:lead)/i);
        const spentMatch = body.match(/(?:gastamos?|invertimos?|spent).*?(\d[\d,\.]*)/i);
        
        let campaignName = '';
        for (const campaign of campaigns) {
          if (body.toLowerCase().includes(campaign.name.toLowerCase())) {
            campaignName = campaign.name;
            break;
          }
        }

        if ((impressionsMatch || clicksMatch || leadsMatch || spentMatch) && campaignName) {
          const campaign = campaigns.find(c => c.name === campaignName);
          
          if (campaign) {
            const updates: any = {};
            
            if (impressionsMatch) {
              updates.impressions = (campaign.impressions || 0) + parseFloat(impressionsMatch[1].replace(/,/g, ''));
            }
            if (clicksMatch) {
              updates.clicks = (campaign.clicks || 0) + parseFloat(clicksMatch[1].replace(/,/g, ''));
            }
            if (leadsMatch) {
              updates.leads_generated = (campaign.leads_generated || 0) + parseFloat(leadsMatch[1].replace(/,/g, ''));
            }
            if (spentMatch) {
              updates.spent = (campaign.spent || 0) + parseFloat(spentMatch[1].replace(/,/g, ''));
            }

            await this.supabase.client
              .from('marketing_campaigns')
              .update(updates)
              .eq('id', campaign.id);

            console.log('📊 Campaña actualizada:', campaignName, updates);

            await this.twilio.sendWhatsAppMessage(
              from,
              `✅ Métricas actualizadas para campaña "${campaignName}":\n\n` +
              (impressionsMatch ? `📊 Impresiones: +${impressionsMatch[1]}\n` : '') +
              (clicksMatch ? `👆 Clicks: +${clicksMatch[1]}\n` : '') +
              (leadsMatch ? `🎯 Leads: +${leadsMatch[1]}\n` : '') +
              (spentMatch ? `💰 Gastado: +$${spentMatch[1]}` : '')
            );
            return;
          }
        }

        const campaignsList = campaigns.map(c => c.name).join(', ');
        await this.twilio.sendWhatsAppMessage(
          from,
          `📊 Para reportar métricas, usa este formato:\n\n` +
          `"Campaña [nombre]: [X] impresiones, [Y] clicks, [Z] leads"\n\n` +
          `Campañas activas: ${campaignsList || 'Ninguna'}\n\n` +
          `Ejemplo: "Campaña Black Friday: 5000 impresiones, 200 clicks, 50 leads"`
        );
        return;
      }

      // Detectar si es un vendedor
      const vendedor = vendedores.find(v => v.phone && cleanPhone.includes(v.phone.replace(/\D/g, '').slice(-10)));

      if (vendedor) {
        console.log('👤 Mensaje de vendedor detectado:', vendedor.name);

        // Detectar reporte de venta: "Juan Pérez cerró venta del Fresno"
        const ventaMatch = body.match(/(?:cerr[óo]|vendi[óo]|venta).*?(?:de |del |la )?([A-Za-záéíóúñÁÉÍÓÚÑ\s]+)/i);
        
        if (ventaMatch) {
          const propertyName = ventaMatch[1].trim();
          const property = properties.find(p => 
            propertyName.toLowerCase().includes(p.name.toLowerCase()) ||
            p.name.toLowerCase().includes(propertyName.toLowerCase())
          );

          if (property) {
            // Buscar el lead mencionado en el mensaje
            const leadNameMatch = body.match(/^([A-Za-záéíóúñÁÉÍÓÚÑ\s]+)\s+(?:cerr[óo]|vendi[óo])/i);
            const leadName = leadNameMatch ? leadNameMatch[1].trim() : null;

            // Actualizar vendedor
            const newSalesCount = (vendedor.sales_count || 0) + 1;
            const newCommission = (vendedor.commission || 0) + (property.price * 0.03); // 3% comisión

            await this.supabase.client
              .from('team_members')
              .update({ 
                sales_count: newSalesCount,
                commission: newCommission
              })
              .eq('id', vendedor.id);

            // Actualizar propiedad
            await this.supabase.client
              .from('properties')
              .update({ 
                sold_units: (property.sold_units || 0) + 1
              })
              .eq('id', property.id);

            // Si se encontró el lead, actualizar su status
            if (leadName) {
              const leadRes = await this.supabase.client
                .from('leads')
                .select('*')
                .ilike('name', `%${leadName}%`)
                .single();

              if (leadRes.data) {
                await this.supabase.client
                  .from('leads')
                  .update({ status: 'closed_won' })
                  .eq('id', leadRes.data.id);
              }
            }

            console.log('💰 Venta registrada:', property.name, 'por', vendedor.name);

            await this.twilio.sendWhatsAppMessage(
              from,
              `🎉 ¡Venta registrada!\n\n` +
              `🏠 Propiedad: ${property.name}\n` +
              `👤 Vendedor: ${vendedor.name}\n` +
              `💰 Comisión: $${(property.price * 0.03).toLocaleString()}\n` +
              `📊 Total ventas: ${newSalesCount}\n\n` +
              `¡Excelente trabajo! 🚀`
            );

            // Notificar a otros vendedores
            for (const v of vendedores) {
              if (v.phone && v.id !== vendedor.id) {
                await this.twilio.sendWhatsAppMessage(
                  'whatsapp:' + v.phone,
                  `🎉 ${vendedor.name} cerró venta de ${property.name}! 💪`
                );
              }
            }

            return;
          }
        }

        // Si no detectó venta, dar instrucciones
        await this.twilio.sendWhatsAppMessage(
          from,
          `👋 Hola ${vendedor.name}!\n\n` +
          `Para reportar una venta, usa:\n` +
          `"[Cliente] cerró venta del [Propiedad]"\n\n` +
          `Ejemplo: "Juan Pérez cerró venta del Fresno"`
        );
        return;
      }

      // ========================================
      // FLUJO PARA CLIENTES
      // ========================================

      // PASO 1: DETECTAR ESCALADA INMEDIATA
      const escaladaInmediata = 
        // Pide vendedor
        /(?:quiero|quero|pasame|dame|comunicame|contacto|hablar).*(?:vendedor|asesor|persona|humano|alguien)/i.test(bodyLower) ||
        /(?:no quiero|ya no).*(?:chatbot|robot|bot|ia|inteligencia)/i.test(bodyLower) ||
        bodyLower.includes('pásame con') ||
        bodyLower.includes('dame un teléfono') ||
        bodyLower.includes('dame un número') ||
        
        // Frustración
        /no\s+(?:me\s+)?entiendes?/i.test(bodyLower) ||
        /esto\s+no\s+sirve/i.test(bodyLower) ||
        /no\s+funciona/i.test(bodyLower) ||
        bodyLower.includes('no me ayudas') ||
        
        // Negociación
        /(?:cual|cuanto|dame|hay|tienen).*(?:mejor\s+precio|descuento|promocion|oferta)/i.test(bodyLower) ||
        bodyLower.includes('qué promociones') ||
        bodyLower.includes('rebaja') ||
        
        // Alta intención
        /(?:cuando|donde|como).*(?:puedo\s+ir|voy|visitar|verla|conocerla)/i.test(bodyLower) ||
        /(?:tengo|cuento\s+con).*(?:dinero|efectivo|listo)/i.test(bodyLower) ||
        /quiero\s+apartar/i.test(bodyLower) ||
        bodyLower.includes('ya quiero comprar') ||
        
        // Pregunta técnica específica
        /(?:que|cual|cuanto).*(?:calibre|tuberia|cisterna|medidas|m2|terreno|construccion)/i.test(bodyLower);

      if (escaladaInmediata) {
        console.log('🔥 ESCALADA INMEDIATA DETECTADA');
        
        // Crear o actualizar lead
        let lead = await this.supabase.getLeadByPhone(cleanPhone);
        
        if (!lead) {
          const assignedVendedor = vendedores.length > 0 ? vendedores[Math.floor(Math.random() * vendedores.length)] : null;
          
          lead = await this.supabase.createLead({
            phone: cleanPhone,
            conversation_history: [],
            score: 10,
            status: 'requires_immediate_contact',
            assigned_to: assignedVendedor?.id || null,
            needs_mortgage: null,
            mortgage_data: {}
          });
        } else {
          await this.supabase.updateLead(lead.id, {
            status: 'requires_immediate_contact',
            score: 10
          });
        }

        // Determinar razón de escalada
        let razonEscalada = '';
        if (/(?:quiero|pasame|dame).*(?:vendedor|asesor|persona)/i.test(bodyLower)) {
          razonEscalada = '📞 Cliente solicita contacto humano';
        } else if (/no\s+(?:me\s+)?entiendes?|esto\s+no\s+sirve/i.test(bodyLower)) {
          razonEscalada = '⚠️ Cliente frustrado con IA';
        } else if (/mejor\s+precio|descuento|promocion/i.test(bodyLower)) {
          razonEscalada = '💰 Cliente quiere negociar precio';
        } else if (/cuando.*puedo\s+ir|tengo.*dinero|quiero\s+apartar/i.test(bodyLower)) {
          razonEscalada = '🔥🔥🔥 ALTA INTENCIÓN DE COMPRA';
        } else {
          razonEscalada = '📋 Pregunta técnica específica';
        }

        // Notificar URGENTE a vendedores
        for (const v of vendedores) {
          if (v.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + v.phone,
              `🚨 *ESCALADA URGENTE*\n\n${razonEscalada}\n\n👤 ${lead.name || 'Sin nombre'}\n📱 ${cleanPhone}\n💬 "${body}"\n\n⚡ *CONTACTAR INMEDIATAMENTE*`
            );
          }
        }

        // Responder al cliente
        await this.twilio.sendWhatsAppMessage(
          from,
          `Perfecto, te conecto con nuestro equipo de inmediato. Un asesor te contactará en los próximos minutos para ayudarte personalmente. 📞`
        );
        
        return;
      }

      // PASO 2: Resto del flujo normal para clientes
      let lead = await this.supabase.getLeadByPhone(cleanPhone);
      
      if (!lead) {
        const assignedVendedor = vendedores.length > 0 ? vendedores[Math.floor(Math.random() * vendedores.length)] : null;
        
        lead = await this.supabase.createLead({
          phone: cleanPhone,
          conversation_history: [],
          score: 5,
          status: 'new',
          assigned_to: assignedVendedor?.id || null,
          needs_mortgage: null,
          mortgage_data: {},
          pending_confirmation: null
        });

        console.log('📝 Lead creado:', lead.id);
      }

      // FUNCIÓN: Determinar qué pregunta hacer según el estado del lead

      // Capturar nombre
      let nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{2,50}?)(?=\s*\d|\s*$)/i);
      
      // Si no encontró con keywords pero el mensaje es corto (2-4 palabras) y parece nombre
      if (!nameMatch && !lead.name && body.split(' ').length >= 2 && body.split(' ').length <= 4) {
        const palabras = body.trim().split(' ');
        const todasEmpiezanMayuscula = palabras.every(p => /^[A-ZÁÉÍÓÚÑ]/.test(p));
        const noTieneNumeros = !/\d/.test(body);
        const noEsPregunta = !body.includes('?');
        
        // Si parece nombre (2-4 palabras, empiezan con mayúscula, sin números)
        if (todasEmpiezanMayuscula && noTieneNumeros && noEsPregunta) {
          nameMatch = [body, body]; // Simular match
          console.log('🔍 Nombre detectado por contexto:', body);
        }
      }
      
      let clientName = lead.name || 'Cliente';
      
      if (nameMatch) {
        console.log('🔍 Nombre raw capturado:', nameMatch[1]);
        clientName = nameMatch[1].trim().split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        console.log('👤 Nombre formateado:', clientName);
        await this.supabase.updateLead(lead.id, { name: clientName });
        console.log('👤 Nombre actualizado en DB:', clientName);
        
        // RECARGAR lead para tener datos actualizados
        lead = await this.supabase.getLeadByPhone(cleanPhone);
        console.log('🔄 Lead recargado - nombre ahora:', lead.name);
      }

      // Video handling
      const videoKeywords = ['video', 'ver video', 'quiero ver', 'muéstrame', 'enseñame'];
      const wantsVideo = videoKeywords.some(kw => body.toLowerCase().includes(kw));

      let matchedProperty = null;
      let propertyNameMentioned = null;
      
      // Buscar propiedad mencionada en el mensaje
      for (const prop of properties) {
        if (body.toLowerCase().includes(prop.name.toLowerCase())) {
          matchedProperty = prop;
          propertyNameMentioned = prop.name;
          break;
        }
      }
      
      // Si no encontró por nombre completo, buscar por modelo (primera palabra)
      if (!matchedProperty) {
        for (const prop of properties) {
          const modelo = prop.name.split(' ')[0];
          if (body.toLowerCase().includes(modelo.toLowerCase())) {
            matchedProperty = prop;
            propertyNameMentioned = prop.name;
            break;
          }
        }
      }
      
      // TOLERANCIA A TYPOS: Buscar desarrollos aunque tengan errores de escritura
      if (!matchedProperty) {
        const bodyLowerClean = body.toLowerCase().replace(/[^a-záéíóúñ\s]/g, '');
        
        // Mapeo de desarrollos con variaciones comunes
        const desarrolloMap: { [key: string]: string[] } = {
          'Distrito Falco': ['distrito falco', 'distirto falco', 'distrito falcon', 'falco', 'dstrito falco', 'distrto falco'],
          'Andes': ['andes', 'los andes', 'privada andes'],
          'Los Encinos': ['encinos', 'los encinos', 'encino'],
          'Miravalle': ['miravalle', 'mira valle', 'miraballe'],
          'Monte Verde': ['monte verde', 'monteverde', 'monteverde']
        };
        
        for (const [desarrollo, variaciones] of Object.entries(desarrolloMap)) {
          for (const variacion of variaciones) {
            if (bodyLowerClean.includes(variacion)) {
              // Encontró el desarrollo, buscar primera propiedad de ese desarrollo
              matchedProperty = properties.find(p => p.name.toLowerCase().includes(desarrollo.toLowerCase().split(' ').pop() || ''));
              if (matchedProperty) {
                propertyNameMentioned = matchedProperty.name;
                console.log('🔍 Desarrollo detectado por fuzzy match:', variacion, '→', matchedProperty.name);
                break;
              }
            }
          }
          if (matchedProperty) break;
        }
      }
      
      // Si sigue sin encontrar pero el usuario mencionó algo que parece propiedad
      if (!matchedProperty) {
        const propMention = body.match(/(?:me interesa|quiero|necesito|busco)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s|,|$)/i);
        if (propMention) {
          propertyNameMentioned = propMention[1].trim();
        }
      }

      if (!matchedProperty && lead.property_interest) {
        matchedProperty = properties.find(p => p.name.toLowerCase() === lead.property_interest.toLowerCase());
      }
      
      // GUARDAR propiedad si se detectó y no estaba guardada
      if (matchedProperty && !lead.property_interest) {
        await this.supabase.updateLead(lead.id, { 
          property_interest: matchedProperty.name 
        });
        console.log('🏠 Propiedad guardada en DB:', matchedProperty.name);
        
        // RECARGAR lead para tener datos actualizados
        lead = await this.supabase.getLeadByPhone(cleanPhone);
        console.log('🔄 Lead recargado - propiedad ahora:', lead.property_interest);
      }

      const mencionaFinanciamiento = /(?:crédito|financiamiento|apoyo|gano|ingreso|deuda|enganche)/i.test(body);
      const mencionaCita = /(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|am|pm|ver)/i.test(body);
      
      // VIDEO PERSONALIZADO: Enviar automáticamente en PRIMERA INTERACCIÓN
      const esPrimeraInteraccion = history.length <= 2;
      const yaEnvioVideo = lead.videos_sent && lead.videos_sent.length > 0;
      const debeEnviarVideoAuto = esPrimeraInteraccion && !yaEnvioVideo && matchedProperty;
      
      // Enviar video si: (a) es primera vez Y tiene propiedad, O (b) lo pide explícitamente
      if ((debeEnviarVideoAuto || wantsVideo) && matchedProperty && !mencionaFinanciamiento && !mencionaCita) {
        const partesNombreVideo = matchedProperty.name.split(' ');
        const desarrolloVideo = partesNombreVideo.length > 1 ? partesNombreVideo.slice(1).join(' ') : matchedProperty.name;
        console.log('🎬 Video para:', clientName, '- Desarrollo:', desarrolloVideo);
        
        const mensajeVideo = esPrimeraInteraccion 
          ? `🎬 Te preparo un video personalizado de ${desarrolloVideo} con tu nombre, ${clientName}. Te lo envío en 2 minutos ⏳`
          : `🎬 Generando tu video de ${desarrolloVideo}, ${clientName}... Te lo envío en 2 min ⏳`;
        
        await this.twilio.sendWhatsAppMessage(from, mensajeVideo);
        
        for (const v of vendedores) {
          if (v.phone) {
            const motivo = esPrimeraInteraccion ? '(Primera interacción - automático)' : '(Solicitado)';
            await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, `🎬 ${clientName} - Video de ${desarrolloVideo} ${motivo}\nTel: ${cleanPhone}`);
          }
        }

        fetch('https://sara-backend.edson-633.workers.dev/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientName, propertyName: desarrolloVideo, phone: from })
        }).catch(err => console.error('Error fetch:', err));

        // Actualizar lead con video enviado
        const videosSent = lead.videos_sent || [];
        if (!videosSent.includes(matchedProperty.name)) {
          videosSent.push(matchedProperty.name);
        }
        
        await this.supabase.updateLead(lead.id, { 
          property_interest: matchedProperty.name,
          videos_sent: videosSent
        });
        
        // Si es automático, continuar la conversación; si lo pidió explícitamente, hacer return
        if (!esPrimeraInteraccion && wantsVideo) {
          return;
        }
      }

      // Parsing financiero
      const needsMortgage = /(?:si|sí|necesito|quiero|me interesa).*(?:crédito|hipoteca|financiamiento)/i.test(body) ||
                           /(?:no tengo|sin).*(?:efectivo|dinero|recursos)/i.test(body);
      const hasMortgage = /(?:ya tengo|tengo aprobado|cuento con).*(?:crédito|hipoteca)/i.test(body);
      const noMortgage = /(?:no necesito|no quiero|de contado|efectivo)/i.test(body);

      let mortgageData = lead.mortgage_data || {};
      let needsMortgageStatus = lead.needs_mortgage;

      // INGRESO
      const incomeMatch = body.match(/(?:gano|ingreso|sueldo|salario)[^\d]{0,20}(\d[\d,\.]*)\s*(mil|millones?|millón(?:es)?)?/i);
      if (incomeMatch) {
        let amount = parseFloat(incomeMatch[1].replace(/,/g, ''));
        const mult = incomeMatch[2];
        if (mult && /millón(?:es)?/i.test(mult)) amount *= 1000000;
        else if (mult && /mil/i.test(mult)) amount *= 1000;
        mortgageData.monthly_income = amount;
      }

      // DEUDAS
      const hasNoDebt = /(?:no|sin|cero)\s+(?:tengo)?\s*(?:deuda|adeudo)/i.test(body);
      if (hasNoDebt) {
        mortgageData.current_debt = 0;
      } else {
        const debtMatch = body.match(/(\d[\d,\.]*)\s*(mil|millones?|millón(?:es)?)?[^\d]{0,30}(?:de\s+)?(?:deuda|adeudo)/i);
        if (debtMatch) {
          let amount = parseFloat(debtMatch[1].replace(/,/g, ''));
          const mult = debtMatch[2];
          if (mult && /millón(?:es)?/i.test(mult)) amount *= 1000000;
          else if (mult && /mil/i.test(mult)) amount *= 1000;
          mortgageData.current_debt = amount;
        }
      }

      // ENGANCHE
      const downPaymentMatch = body.match(/(\d[\d,\.]*)\s*(millones?|millón(?:es)?|mil)?[^\d]{0,30}(?:de\s+)?(?:enganche|ahorro)/i);
      if (downPaymentMatch) {
        let amount = parseFloat(downPaymentMatch[1].replace(/,/g, ''));
        const mult = downPaymentMatch[2];
        console.log('🔍 Enganche capturado:', { numero: downPaymentMatch[1], multiplicador: mult, texto: downPaymentMatch[0] });
        
        if (mult) {
          const multLower = mult.toLowerCase();
          if (multLower.includes('millon') || multLower.includes('millón')) {
            amount *= 1000000;
            console.log('✅ Multiplicando por 1,000,000');
          } else if (multLower === 'mil') {
            amount *= 1000;
            console.log('✅ Multiplicando por 1,000');
          }
        }
        mortgageData.down_payment = amount;
      }

      console.log('💰 PARSEADO:', {
        ingreso: mortgageData.monthly_income,
        deudas: mortgageData.current_debt,
        enganche: mortgageData.down_payment
      });

      // DETECTAR CITA (pero NO crearla aún)
      const timeMatch = body.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)/i);
      const dateMatch = body.match(/(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
      
      let citaData = null;
      if (timeMatch && dateMatch) {
        const nowMexico = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
        let appointmentDate = new Date(nowMexico);
        const dateText = dateMatch[0].toLowerCase();
        
        console.log('📅 FECHA MÉXICO HOY:', nowMexico.toISOString().split('T')[0]);
        if (dateText === 'mañana') {
          appointmentDate.setDate(appointmentDate.getDate() + 1);
          console.log('📅 FECHA MAÑANA:', appointmentDate.toISOString().split('T')[0]);
        }
        
        let hour = parseInt(timeMatch[1]);
        const meridiem = timeMatch[0].toLowerCase();
        if (meridiem.includes('pm') && hour < 12) hour += 12;
        if (meridiem.includes('am') && hour === 12) hour = 0;
        
        appointmentDate.setHours(hour, timeMatch[2] ? parseInt(timeMatch[2]) : 0, 0, 0);
        
        citaData = {
          date: appointmentDate.toISOString().split('T')[0],
          time: `${hour.toString().padStart(2, '0')}:${(timeMatch[2] || '00').padStart(2, '0')}:00`,
          dateText: dateText,
          timeText: timeMatch[0]
        };
        console.log('📅 CITA DETECTADA (pendiente confirmación):', citaData);
        
        // GUARDAR en pending_confirmation (NO crear todavía)
        await this.supabase.updateLead(lead.id, {
          pending_confirmation: {
            type: 'appointment',
            data: citaData,
            property: propertyNameMentioned || matchedProperty?.name,
            asked_at: new Date().toISOString()
          }
        });
      }

      // DETECTAR CONFIRMACIÓN DE CITA (INTELIGENTE - acepta TODO tipo de "sí")
      const bodyClean = bodyLower.trim();
      
      // Palabras que obviamente significan "sí"
      const palabrasSi = ['si', 'sí', 'see', 'sep', 'oc', 'ok', 'okey', 'dale', 'va', 'confirmo', 'perfecto', 'exacto', 'correcto', 'simón', 'sisas', 'claro', 'adelante', 'vale', 'afirmativo'];
      
      // Si contiene CUALQUIERA de estas palabras = confirmación
      const confirmaciOnCita = lead.pending_confirmation?.type === 'appointment' && (
        palabrasSi.some(palabra => bodyClean.includes(palabra)) ||
        bodyClean === 's' ||
        /s+i+/.test(bodyClean)  // cualquier variación: si, sii, siii, ssi, etc
      );
      
      if (confirmaciOnCita && lead.pending_confirmation?.type === 'appointment') {
        console.log('✅ CONFIRMACIÓN DE CITA RECIBIDA');
        
        const pendingCita = lead.pending_confirmation.data;
        let pendingProperty = properties.find(p => p.name === lead.pending_confirmation.property);
        
        // Si no encuentra la propiedad exacta, crear objeto temporal
        if (!pendingProperty && lead.pending_confirmation.property) {
          const modelo = lead.pending_confirmation.property.split(' ')[0];
          pendingProperty = properties.find(p => p.name.startsWith(modelo));
          
          // Si aún no la encuentra, crear objeto temporal con el nombre mencionado
          if (!pendingProperty) {
            pendingProperty = {
              id: 'temp',
              name: lead.pending_confirmation.property,
              price: 0
            };
          }
        }
        
        console.log('🔍 DEBUG CONFIRMACIÓN:', {
          tiene_pendingCita: !!pendingCita,
          tiene_pendingProperty: !!pendingProperty,
          pendingProperty_name: pendingProperty?.name,
          buscando_propiedad: lead.pending_confirmation.property,
          tiene_assigned_to: !!lead.assigned_to,
          tiene_nombre: !!(lead.name && lead.name !== 'Cliente'),
          total_properties: properties.length
        });
        
        // VALIDAR DATOS MÍNIMOS: Nombre + Propiedad
        let clientName = lead.name;
        if (!clientName || clientName === 'Cliente') {
          // ⚠️ Usar teléfono como fallback temporal para que el flujo continúe
          clientName = `Cliente ${cleanPhone.slice(-4)}`;
          console.log('⚠️ Sin nombre, usando fallback:', clientName);
          
          // Pedir nombre pero NO cortar ejecución
          await this.twilio.sendWhatsAppMessage(
            from,
            'Perfecto! Por cierto, ¿cómo te llamo? (puedes decirme después)'
          );
          // NO RETURN - continuar flujo
        }
        
        if (!pendingProperty) {
          await this.twilio.sendWhatsAppMessage(
            from,
            '¿En qué propiedad estás interesado? Así puedo agendar tu cita correctamente 🏡'
          );
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (pendingCita && pendingProperty && lead.assigned_to) {
          // Ya tenemos clientName de arriba (lead.name o fallback)
          
          // Buscar cita existente
          const { data: existingAppointment } = await this.supabase.client
            .from('appointments')
            .select('*')
            .eq('lead_phone', cleanPhone)
            .eq('status', 'scheduled')
            .single();
          
          // Si hay cita existente, cancelarla primero
          if (existingAppointment) {
            console.log('🔄 Cancelando cita anterior:', existingAppointment.id);
            
            await this.supabase.client
              .from('appointments')
              .update({ status: 'cancelled', cancelled_by: 'system' })
              .eq('id', existingAppointment.id);
            
            if (existingAppointment.google_event_vendedor_id) {
              await this.calendar.deleteEvent(existingAppointment.google_event_vendedor_id);
            }
            if (existingAppointment.google_event_asesor_id) {
              await this.calendar.deleteEvent(existingAppointment.google_event_asesor_id);
            }
          }
          
          // Crear hipoteca si necesita
          let asesorAsignado = null;
          if (needsMortgageStatus && mortgageData.monthly_income) {
            const existingMortgage = await this.supabase.client
              .from('mortgage_applications')
              .select('*')
              .eq('lead_phone', cleanPhone)
              .single();

            if (!existingMortgage.data) {
              const assignedAsesor = asesores.length > 0 ? asesores[Math.floor(Math.random() * asesores.length)] : null;

              await this.supabase.client.from('mortgage_applications').insert([{
                lead_id: lead.id,
                lead_name: clientName,
                lead_phone: cleanPhone,
                property_id: pendingProperty.id !== 'temp' ? pendingProperty.id : null,
                property_name: pendingProperty.name,
                monthly_income: mortgageData.monthly_income || 0,
                additional_income: mortgageData.additional_income || 0,
                current_debt: mortgageData.current_debt || 0,
                down_payment: mortgageData.down_payment || 0,
                requested_amount: pendingProperty.price || 0,
                credit_term_years: 20,
                assigned_advisor_id: assignedAsesor?.id,
                assigned_advisor_name: assignedAsesor?.name,
                status: 'pending'
              }]);

              console.log('🏦 Solicitud hipotecaria creada para:', clientName);
              asesorAsignado = assignedAsesor;
            }
          }
          
          // Buscar vendedor
          const { data: vendedor } = await this.supabase.client
            .from('team_members')
            .select('*')
            .eq('id', lead.assigned_to)
            .single();
          
          // CITA 1: VENDEDOR (SIEMPRE - todos los leads van al vendedor)
          const { data: apptVendedor, error: apptVendedorError} = await this.supabase.client.from('appointments').insert([{
            lead_id: lead.id,
            lead_phone: cleanPhone,
            lead_name: clientName,
            property_id: pendingProperty.id !== 'temp' ? pendingProperty.id : null,
            property_name: pendingProperty.name,
            vendedor_id: vendedor?.id,
            vendedor_name: vendedor?.name,
            asesor_id: null,
            asesor_name: null,
            scheduled_date: pendingCita.date,
            scheduled_time: pendingCita.time,
            status: 'scheduled',
            appointment_type: 'property_viewing',
            duration_minutes: 60
          }]).select().single();
          
          if (apptVendedorError) {
            console.error('❌ ERROR AL GUARDAR CITA VENDEDOR:', apptVendedorError);
          }
          console.log('📅 CITA VENDEDOR GUARDADA:', apptVendedor?.id);
          
          // CITA 2: ASESOR (solo si necesita financiamiento)
          let apptAsesor = null;
          if (asesorAsignado) {
            const { data: apptAsesorData, error: apptAsesorError } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              lead_name: clientName,
              property_id: pendingProperty.id !== 'temp' ? pendingProperty.id : null,
              property_name: pendingProperty.name,
              vendedor_id: null,
              vendedor_name: null,
              asesor_id: asesorAsignado.id,
              asesor_name: asesorAsignado.name,
              scheduled_date: pendingCita.date,
              scheduled_time: pendingCita.time,
              status: 'scheduled',
              appointment_type: 'credit_consultation',
              duration_minutes: 60
            }]).select().single();
            
            if (apptAsesorError) {
              console.error('❌ ERROR AL GUARDAR CITA ASESOR:', apptAsesorError);
            }
            apptAsesor = apptAsesorData;
            console.log('📅 CITA ASESOR GUARDADA:', apptAsesor?.id);
          }
          
          
          // Crear eventos Calendar para AMBAS citas
          try {
            const startDateTime = `${pendingCita.date}T${pendingCita.time}`;
            const endDate = new Date(startDateTime);
            endDate.setHours(endDate.getHours() + 1);
            const endDateTime = endDate.toISOString().split('.')[0];
            
            // Evento 1: Vendedor
            let vendedorEventId = null;
            if (apptVendedor && vendedor) {
              const vendedorEvent = await this.calendar.createEvent(
                `Cita - ${clientName} - ${pendingProperty.name}`,
                `Cliente: ${clientName}\nTeléfono: ${cleanPhone}\nPropiedad: ${pendingProperty.name}${asesorAsignado ? `\n\n🏦 Cliente requiere financiamiento\nAsesor: ${asesorAsignado.name}` : ''}`,
                startDateTime,
                endDateTime,
                []
              );
              vendedorEventId = vendedorEvent?.id;
              console.log('📅 Evento vendedor creado:', vendedorEventId);
              
              // Guardar event_id en la cita del vendedor
              if (vendedorEventId) {
                await this.supabase.client
                  .from('appointments')
                  .update({ google_event_vendedor_id: vendedorEventId })
                  .eq('id', apptVendedor.id);
              }
            }
            
            // Evento 2: Asesor (solo si hay cita de asesor)
            let asesorEventId = null;
            if (apptAsesor && asesorAsignado) {
              const asesorEvent = await this.calendar.createEvent(
                `Apoyo Crédito - ${clientName} - ${pendingProperty.name}`,
                `Cliente: ${clientName}\nTeléfono: ${cleanPhone}\nPropiedad: ${pendingProperty.name}\nVendedor: ${vendedor?.name}\n\n💰 Datos financieros:\nIngreso: $${mortgageData.monthly_income?.toLocaleString()}\nEnganche: $${mortgageData.down_payment?.toLocaleString()}`,
                startDateTime,
                endDateTime,
                []
              );
              asesorEventId = asesorEvent?.id;
              console.log('📅 Evento asesor creado:', asesorEventId);
              
              // Guardar event_id en la cita del asesor
              if (asesorEventId) {
                await this.supabase.client
                  .from('appointments')
                  .update({ google_event_asesor_id: asesorEventId })
                  .eq('id', apptAsesor.id);
              }
            }
            
            console.log('✅ Eventos de Calendar guardados');
          } catch (calErr) {
            console.error('❌ Error Google Calendar:', calErr);
          }
          
          // EXTRAER MODELO Y DESARROLLO
          const nombrePartes = pendingProperty.name.split(' ');
          const modelo = nombrePartes[0] || '';
          const desarrollo = nombrePartes.length > 1 ? nombrePartes.slice(1).join(' ') : pendingProperty.name;
          console.log('🏠 Modelo:', modelo, '| Desarrollo:', desarrollo);
          
          // BUSCAR GPS Y LINK EN BD
          let mapsLink = '';
          let desarrolloLink = '';
          try {
            const { data: devData } = await this.supabase.client
              .from('developments').select('name, gps_link, website_url')
              .eq('name', desarrollo).single();
            if (devData) {
              mapsLink = devData.gps_link || '';
              desarrolloLink = devData.website_url || '';
              console.log('✅ Datos BD:', { desarrollo: devData.name, gps: !!mapsLink, web: !!desarrolloLink });
            }
          } catch (e) { console.log('⚠️ Fallback a hardcode'); }
          
          if (!mapsLink) mapsLink = MAPS_UBICACIONES[modelo] || '';
          if (!desarrolloLink) desarrolloLink = pendingProperty.website_url || '';
          
          // ENVIAR VIDEO DEL DESARROLLO
          try {
            console.log('🎬 Solicitando video para:', desarrollo);
            const videoResp = await fetch('https://sara-backend.edson-633.workers.dev/generate-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ propertyName: desarrollo, clientName: clientName, phone: from })
            });
            if (videoResp.ok) {
              const vData = await videoResp.json();
              if (vData.video_url) {
                await this.twilio.sendWhatsAppMessage(from, `🎬 *Video de ${desarrollo}:*\n${vData.video_url}`);
                console.log('✅ Video enviado al cliente');
              }
            }
          } catch (videoErr) { console.error('❌ Error video:', videoErr); }
          
          // NOTIFICACIONES:
          // 1. VENDEDOR: SIEMPRE (todos los leads van al vendedor)
          // 2. ASESOR: Solo si necesita financiamiento (para que apoye al vendedor)
          if (asesorAsignado?.phone) {
            let mensajeAsesor = `🏦 *APOYO CRÉDITO - Cliente necesita financiamiento*\n\n👤 Cliente: ${clientName}\n📱 Teléfono: ${cleanPhone}\n🏠 Propiedad: ${pendingProperty.name}\n`;
            
            // AGREGAR GPS
            if (mapsLink) {
              mensajeAsesor += `📍 Ubicación: ${mapsLink}\n`;
            }
            
            // AGREGAR LINK DEL DESARROLLO
            if (desarrolloLink) {
              mensajeAsesor += `🌐 Complejo: ${desarrolloLink}\n`;
            }
            
            if (mortgageData.monthly_income || mortgageData.down_payment || mortgageData.current_debt) {
              mensajeAsesor += `\n💰 *DATOS FINANCIEROS:*\n`;
              if (mortgageData.monthly_income) mensajeAsesor += `• Ingreso mensual: $${mortgageData.monthly_income.toLocaleString()}\n`;
              if (mortgageData.current_debt !== undefined && mortgageData.current_debt !== null) mensajeAsesor += `• Deudas actuales: $${mortgageData.current_debt.toLocaleString()}\n`;
              if (mortgageData.down_payment) mensajeAsesor += `• Enganche disponible: $${mortgageData.down_payment.toLocaleString()}\n`;
            }
            
            mensajeAsesor += `\n📅 CITA CON VENDEDOR: ${pendingCita.dateText} a las ${pendingCita.timeText}\n\n📞 Coordina con el vendedor para apoyar con el tema de crédito`;
            
            await this.twilio.sendWhatsAppMessage('whatsapp:' + asesorAsignado.phone, mensajeAsesor);
          }

          for (const v of vendedores) {
            if (v.phone) {
              // Construir mensaje con solo los datos que SÍ tiene
              let mensaje = `✅ *CITA CONFIRMADA*\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${pendingProperty.name}\n`;
              
              // AGREGAR GPS
              if (mapsLink) {
                mensaje += `📍 Ubicación: ${mapsLink}\n`;
              }
              
              // AGREGAR LINK DEL DESARROLLO
              if (desarrolloLink) {
                mensaje += `🌐 Complejo: ${desarrolloLink}\n`;
              }
              
              // Solo agregar datos financieros si los tiene
              if (mortgageData.monthly_income || mortgageData.down_payment || mortgageData.current_debt) {
                mensaje += `\n💰 *DATOS FINANCIEROS:*\n`;
                if (mortgageData.monthly_income) mensaje += `• Ingreso: $${mortgageData.monthly_income.toLocaleString()}\n`;
                if (mortgageData.current_debt !== undefined && mortgageData.current_debt !== null) mensaje += `• Deudas: $${mortgageData.current_debt.toLocaleString()}\n`;
                if (mortgageData.down_payment) mensaje += `• Enganche: $${mortgageData.down_payment.toLocaleString()}\n`;
              }
              
              mensaje += `\n📅 CITA: ${pendingCita.dateText} a las ${pendingCita.timeText}\n`;
              
              if (asesorAsignado) {
                mensaje += `\n🏦 Cliente requiere financiamiento\n💼 Asesor de apoyo: ${asesorAsignado.name}`;
              }
              
              await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, mensaje);
            }
          }
          
          // ═══════════════════════════════════════════════════════════
          // CONFIRMACIÓN AL CLIENTE
          // ═══════════════════════════════════════════════════════════
          let msgCliente = `✅ *¡CITA CONFIRMADA!*\n\n`;
          msgCliente += `👤 Te atenderá: ${vendedor?.name || 'Nuestro equipo'}\n`;
          if (vendedor?.phone) msgCliente += `📱 Contacto: ${vendedor.phone}\n`;
          msgCliente += `🏠 ${desarrollo}\n`;
          msgCliente += `📅 ${pendingCita.dateText} a las ${pendingCita.timeText}\n`;
          await this.twilio.sendWhatsAppMessage(from, msgCliente);
          console.log('✅ Confirmación enviada al cliente');
          
          // ENVIAR GPS AL CLIENTE
          if (mapsLink) {
            await this.twilio.sendWhatsAppMessage(from, `📍 *Ubicación de ${desarrollo}:*\n${mapsLink}`);
            console.log('✅ GPS enviado al cliente');
            if (vendedor?.phone) {
              await this.twilio.sendWhatsAppMessage('whatsapp:' + vendedor.phone, `📍 *GPS para cita de ${clientName}:*\n${mapsLink}`);
              console.log('✅ GPS enviado al vendedor');
            }
          }
          
          // ENVIAR LINK DEL DESARROLLO/COMPLEJO AL CLIENTE
          if (desarrolloLink) {
            await this.twilio.sendWhatsAppMessage(
              from,
              `🌐 *Más información del complejo:*\n${desarrolloLink}`
            );
          }
          
          // Limpiar pending_confirmation
          await this.supabase.updateLead(lead.id, {
            pending_confirmation: null,
            status: 'scheduled'
          });
          
          console.log('✅ CITA CONFIRMADA - Todas las acciones ejecutadas');
        }
      }

      if (needsMortgage) {
        needsMortgageStatus = true;
      }
      if (hasMortgage || noMortgage) {
        needsMortgageStatus = false;
      }

      await this.supabase.updateLead(lead.id, { 
        mortgage_data: mortgageData,
        needs_mortgage: needsMortgageStatus
      });

      // Clasificar temperatura del lead
      let leadTemp = '❄️ COLD';
      let leadPriority = 3;
      
      if (matchedProperty && mortgageData.monthly_income && citaData) {
        leadTemp = '🔥 HOT';
        leadPriority = 1;
      } else if ((matchedProperty && mortgageData.monthly_income) || (matchedProperty && clientName !== 'Cliente')) {
        leadTemp = '🟡 WARM';
        leadPriority = 2;
      }

      // Notificar según temperatura (SOLO si NO es confirmación de cita)
      if (!confirmaciOnCita) {
        // Decidir si enviar notificación completa
        const hayDatosParaNotificar = matchedProperty || mortgageData.monthly_income || citaData;
        
        if (hayDatosParaNotificar) {
          const notificationDelay = leadPriority === 1 ? 0 : (leadPriority === 2 ? 0 : 5000);
          
          // Obtener ubicación para notificación (si hay propiedad)
          const modeloLead = matchedProperty ? (matchedProperty.name.split(' ')[0] || '') : '';
          const mapsLinkLead = modeloLead ? (MAPS_UBICACIONES[modeloLead] || '') : '';
          const ubicacionTextoLead = mapsLinkLead ? `📍 Ubicación: ${mapsLinkLead}\n` : '';
          
          setTimeout(async () => {
            for (const v of vendedores) {
              if (v.phone) {
                await this.twilio.sendWhatsAppMessage(
                  'whatsapp:' + v.phone,
                  `🆕 *NUEVO LEAD*\n\n🌡️ Temperatura: ${leadTemp}\n👤 ${clientName}\n📱 ${cleanPhone}\n` +
                  (matchedProperty ? `🏠 Interés: ${desarrolloVideo}\n${ubicacionTextoLead}\n` : '') +
                  (mortgageData.monthly_income ? `💰 Ingreso: $${mortgageData.monthly_income.toLocaleString()}\n` : '') +
                  (mortgageData.current_debt !== undefined ? `Deudas: $${mortgageData.current_debt.toLocaleString()}\n` : '') +
                  (mortgageData.down_payment ? `Enganche: $${mortgageData.down_payment.toLocaleString()}\n` : '') +
                  (citaData ? `\n📅 Quiere cita: ${citaData.dateText} ${citaData.timeText} (PENDIENTE CONFIRMACIÓN)\n` : '') +
                  `\n⚡ Acción: ${leadPriority === 1 ? 'CONTACTAR INMEDIATO' : (leadPriority === 2 ? 'Dar seguimiento pronto' : 'Seguimiento en 30 min')}`
                );
              }
            }
          }, notificationDelay);
        }
      }

      // Organizar propiedades por DESARROLLO
      const propsPorDesarrollo: Record<string, any[]> = {};
      properties.forEach(p => {
        const dev = p.development || 'Otros';
        if (!propsPorDesarrollo[dev]) propsPorDesarrollo[dev] = [];
        propsPorDesarrollo[dev].push(p);
      });

      // Extraer props por desarrollo ANTES del template
      const encinos = (propsPorDesarrollo['Los Encinos'] || []).map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || '';
      const andes = (propsPorDesarrollo['Andes'] || []).map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || '';
      const falco = (propsPorDesarrollo['Distrito Falco'] || []).map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m², EQUIPADA)`).join('\n') || '';
      const miravalle = (propsPorDesarrollo['Miravalle'] || []).map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || '';
      const monteverde = (propsPorDesarrollo['Monte Verde'] || []).map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || '';
      
      const catalogoProps = `
🟢 LOS ENCINOS (Colinas del Padre, Zacatecas)
Fracc. cerrado con vigilancia, extensas áreas verdes, juegos infantiles
Ambiente familiar, seguro y con buena plusvalía

${encinos}

🟣 ANDES (Vialidad Siglo XXI, Guadalupe)
Fracc. joven aspiracional, gym al aire libre, juegos infantiles, circuito cerrado
Ubicación estratégica atrás de Privada Alpes

${andes}

🔵 DISTRITO FALCO (Lomas de Bernárdez, Zacatecas) - EXCLUSIVO
La inversión más exclusiva de Santa Rita
Casas EQUIPADAS (closets, cocina integral, canceles incluidos)
Ambiente tranquilo y sofisticado, alta plusvalía

${falco}

🟢 MIRAVALLE (Colinas del Padre, Quinta Sección) - PREMIUM
Oasis de exclusividad y calma, rodeado de naturaleza
Cómodo acceso a la ciudad, áreas recreativas, circuito cerrado

${miravalle}

🟢 MONTE VERDE (Colinas del Padre, Quinta Sección)
Modernidad + tranquilidad natural, ambiente sereno y familiar
Áreas recreativas, juegos, circuito cerrado, vigilancia

${monteverde}
`;

      const vendedoresInfo = vendedores.map(v => `- ${v.name}: ${v.phone}`).join('\n');
      const asesoresInfo = asesores.map(a => `- ${a.name} (${a.phone})`).join('\n');

      const history = lead.conversation_history || [];
      history.push({ role: 'user', content: body, timestamp: new Date().toISOString() });

      let mortgageContext = '';
      if (lead.needs_mortgage === null) {
        mortgageContext = '\n\nIMPORTANTE: Aún no sabemos si el cliente tiene crédito hipotecario. En el momento apropiado (después de mostrar casas), pregúntale: "¿Ya tienes un crédito hipotecario aprobado o te ayudo con el trámite?"';
      } else if (lead.needs_mortgage === true) {
        mortgageContext = `\n\nEl cliente NECESITA CRÉDITO HIPOTECARIO. Datos capturados: Ingreso: $${mortgageData.monthly_income || 'pendiente'}, Deuda: $${mortgageData.current_debt || 'pendiente'}, Enganche: $${mortgageData.down_payment || 'pendiente'}. Si falta algún dato, pregúntalo naturalmente.`;
      }

      // Agregar contexto de confirmación pendiente
      let confirmacionContext = '';
      if (lead.pending_confirmation?.type === 'appointment') {
        const pending = lead.pending_confirmation;
        confirmacionContext = `\n\n🔔 IMPORTANTE: Acabas de sugerir una cita para ${pending.data.dateText} a las ${pending.data.timeText} en ${pending.property}. DEBES preguntarle: "¿Confirmas la cita?" y esperar su respuesta (sí/ok/confirmo). NO crear la cita hasta que confirme.`;
      }

      const systemPrompt = `
Eres SARA, una **agente inmobiliaria humana y conversacional** de Grupo Santa Rita, en Zacatecas, México.

Tu objetivo es:
- Ayudar a la persona a encontrar la mejor casa para su contexto.
- Guiar la conversación de forma natural, NO como formulario.
- Generar confianza y emoción, NO sonar como chatbot mecánico.
- Conseguir datos clave (personas, recámaras, zona, presupuesto, crédito, urgencia) sin interrogar.

Respondes SIEMPRE en español neutro mexicano, con tono cálido, profesional y vendedor, usando algunos emojis pero sin exagerar (1–2 máximo por mensaje).

PROPIEDADES DISPONIBLES:
${catalogoProps}

VENDEDORES Y ASESORES:
Vendedores: ${vendedoresInfo || 'No configurados'}
Asesores hipotecarios: ${asesoresInfo || 'No configurados'}

CLIENTE ACTUAL: ${clientName}
PROPIEDAD DE INTERÉS: ${lead.property_interest || 'No definida'}
NECESITA CRÉDITO: ${lead.needs_mortgage === null ? 'No sabemos' : lead.needs_mortgage ? 'SÍ' : 'No'}
${mortgageContext}${confirmacionContext}

────────────────────────
🚨 REGLA #1: PEDIR NOMBRE Y CELULAR RÁPIDO
────────────────────────

CUANDO EL CLIENTE MENCIONA UN DESARROLLO O QUIERE CONOCER:
→ INMEDIATAMENTE pide nombre y celular para agendar cita.
→ NO des información larga antes de tener sus datos.

FLUJO CORRECTO:
Cliente: "Quiero conocer Distrito Falco"
SARA: "¡Excelente elección! 😊 ¿Me das tu nombre y celular para agendarte una visita?"

Cliente: "María López 5512345678"
SARA: "¡Perfecto María! ¿Qué día y hora te quedan bien?"

Cliente: "Mañana a las 5pm"  
SARA: "Listo María, te agendo mañana 5pm en Distrito Falco 📅
Tenemos: Colibrí $3.8M, Calandria $4.2M, Mirlo $4M (todas 3 rec)
Te mando video del desarrollo 🎬
¿Ya tienes crédito o te ayudo con el trámite?"

────────────────────────
REGLAS ABSOLUTAS
────────────────────────

1) PROHIBIDO "CONTADO" - Nunca digas "de contado"
2) NUNCA DECIR "OK" AL FINAL - Suena naco
3) DESARROLLO PRIMERO - "En Distrito Falco tenemos..."
4) VENDER NO CATALOGAR - "Es una joya" no solo precio
5) NO REPETIR PREGUNTAS
6) MENSAJES CORTOS - 2-3 renglones máximo

────────────────────────
EJEMPLOS
────────────────────────

✅ "¡Excelente! ¿Me das tu nombre y cel?"
✅ "¡Perfecto Juan! ¿Qué día y hora?"
✅ "Listo, te agendo + info + video 🎬"

❌ Dar info larga ANTES de pedir datos
❌ Terminar con "OK"
❌ Preguntar lo que ya dijo

────────────────────────
CHECKLIST ANTES DE RESPONDER
────────────────────────

Antes de mandar cualquier respuesta, hazte estas 5 preguntas:

1. ¿El cliente **ya dijo** su número de recámaras, zona, presupuesto, urgencia o crédito?
   - Si ya lo dijo, NO lo vuelvas a preguntar.

2. ¿Mi mensaje suena a **formulario**?
   - Si estás haciendo una lista de preguntas frías, reescribe para que suene a conversación.

3. ¿Estoy siendo **conversacional y empática**?
   - Usa expresiones humanas: "Perfecto", "Súper", "Te va a encantar", "Buenísimo".

4. ¿Mencioné "de contado" o algo similar?
   - Si sí, corrige. Está PROHIBIDO.

5. ¿Mencioné el **complejo** antes que los nombres de casas o modelos?
   - Ajusta si no lo hiciste.

────────────────────────
DATOS CLAVE QUE DEBES DETECTAR
────────────────────────

A lo largo de la conversación, sin prisa pero con intención, trata de obtener:

- Para cuántas personas es la casa (para inferir recámaras).
- Zona preferida (Zacatecas, Guadalupe, etc.).
- Presupuesto aproximado.
- Urgencia de mudanza.
- Si ya tiene crédito hipotecario aprobado.
- Si es para vivir, inversión o familia.

No preguntes todo de golpe. Integralo en la conversación.

────────────────────────
EJEMPLOS NEGATIVOS (NO LOS IMITES)
────────────────────────

❌ EJEMPLO 1 – FORMULARIO ROBOT
Cliente: "Hola"
SARA: "¿Cuál es tu nombre?"
Cliente: "Juan"
SARA: "¿Cuántas recámaras necesitas?"
Cliente: "3"
SARA: "¿En qué zona?"
Cliente: "Guadalupe"
SARA: "¿De contado o financiamiento?"

Problemas:
- Se siente como encuesta.
- No aportas información de valor.
- Usas "de contado o financiamiento" (PROHIBIDO).
- No comentas nada sobre lo que el cliente dice.

❌ EJEMPLO 2 – IGNORAR CONTEXTO
Cliente: "Busco 3 rec, 2M, Guadalupe"
SARA: "¿Cuántas recámaras necesitas y cuál es tu presupuesto?"

Problemas:
- Preguntas cosas que YA DIJO.
- Ignoras por completo la información dada.

────────────────────────
EJEMPLOS POSITIVOS (IMITA ESTE ESTILO)
────────────────────────

✅ EJEMPLO 1 – INICIO NATURAL
Cliente: "Hola"
SARA: "¡Hola! Soy SARA 😊 ¿Qué tal, ya tienes algo en mente o apenas estás viendo opciones?"

Cliente: "Busco casa"
SARA: "Perfecto, te ayudo con eso. Cuéntame, ¿para cuántas personas sería la casa?"

Cliente: "Somos 5"
SARA: "Buenísimo, con 5 casi seguro necesitas mínimo 3 recámaras para estar cómodos. 
¿Tienes alguna zona en mente, como Guadalupe o Zacatecas centro?"

Cliente: "Guadalupe"
SARA: "Excelente elección, Guadalupe está creciendo muchísimo. 
¿Más o menos en cuánto traes pensado tu presupuesto para la casa?"

Cliente: "2 millones"
SARA: "Perfecto, con 2M te va a encantar **ANDES**. Es un complejo súper joven en Guadalupe, con vigilancia 24/7, gym y áreas verdes. 
Dentro de ANDES tenemos modelos de 3 recámaras que le quedan perfecto a una familia de 5. 
¿Te enseño primero uno en una sola planta o prefieres dos plantas?"

---

✅ EJEMPLO 2 – CLIENTE YA TRAE CASI TODO CLARO
Cliente: "Busco 3 rec, 2M, Guadalupe"
SARA: "Traes la idea súper clara, eso ayuda muchísimo. 
Con 3 recámaras, 2M de presupuesto y en Guadalupe, una de las mejores opciones para ti es **ANDES**, un complejo con vigilancia 24/7 y ambiente muy familiar. 
Ahí tenemos modelos de 3 recámaras que se acomodan a tu rango de precio.
¿Quieres que te describa uno que suele gustar mucho a familias como la tuya o te mando varias opciones para que elijas?"

---

✅ EJEMPLO 3 – URGENCIA
Cliente: "Necesito mudarme en 2 meses"
SARA: "Perfecto, con 2 meses todavía estamos en muy buen tiempo, pero sí te conviene ver casas **listas para entrega**. 
Tenemos opciones que puedes estrenar en menos de 30 días si avanzamos rápido con el crédito. 
Cuéntame rápido: ¿para cuántas personas sería y en qué zona te gustaría, por ejemplo Guadalupe o Zacatecas?"

---

✅ EJEMPLO 4 – CRÉDITO HIPOTECARIO (SIN DECIR "DE CONTADO")
Cliente: "Tengo crédito aprobado"
SARA: "Eso es una súper ventaja, nos va a ahorrar tiempo. 
Con tu crédito aprobado podemos enfocarnos en las casas que se ajusten mejor a tu monto y zona. 
Recuérdame, ¿para cuántas personas sería la casa y qué zona te interesa más?"

Cliente: "No tengo crédito todavía"
SARA: "Sin problema, también te podemos ayudar con el trámite de tu crédito hipotecario. 
Mientras, vayamos viendo opciones: ¿para cuántas personas sería la casa y en qué zona te gustaría vivir?"

---

✅ EJEMPLO 5 – PEDIR NOMBRE SIN SONAR A CALL CENTER
Cliente: "Me interesa una casa en ANDES"
SARA: "Excelente elección, ANDES suele gustar muchísimo por la seguridad y las amenidades. 
Para ayudarte mejor y poder darte seguimiento, ¿me compartes tu nombre y un número de contacto?"

────────────────────────
INFORMACIÓN DE CRÉDITOS
────────────────────────

TIPOS DE CRÉDITO:
• Bancario: 9-13.25% anual, enganche 10-30%
• Infonavit: 10.45% fija, 116 puntos mínimos
• Cofinavit: Infonavit 30% + Banco 70%
• Coacreditado: 2-3 personas suman ingresos

CÁLCULO CAPACIDAD:
• Disponible = Ingreso - Deudas
• Puede pagar = Disponible × 30%
• Precio casa (20 años) ≈ Mensualidad × 143
• Enganche mínimo = 10% precio

AGENDAR CITAS:
Cuando mencione fecha/hora:
- Repite fecha y hora claramente
- Pregunta: "¿Confirmas la cita para [fecha] a las [hora]?"
- Espera confirmación ("sí"/"ok"/"confirmo")
- Sistema envía automáticamente: GPS, Calendar, WhatsApp a vendedor/asesor

────────────────────────
CUANDO DUDES, PRIORIZA:
────────────────────────

1. Ser útil y clara.
2. Sonar como humana, no como formulario.
3. Usar el contexto ya dado (no repetir preguntas).
4. Recomendar primero el COMPLEJO, luego el modelo.
5. Evitar por completo la frase "de contado" y sus variantes.

Siempre responde como SARA, agente inmobiliaria de Grupo Santa Rita en Zacatecas. 
Nunca te presentes como modelo de lenguaje o inteligencia artificial.
`;

      // DEJAR QUE CLAUDE MANEJE TODO CONVERSACIONALMENTE
      // NO usar sistema de preguntas mecánicas
      const response = await this.openai.chat(history.slice(-10), body, systemPrompt);

      history.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
      
      let newScore = lead.score || 5;
      if (needsMortgage || matchedProperty) newScore = Math.min(10, newScore + 1);
      if (mortgageData.monthly_income) newScore = Math.min(10, newScore + 2);
      if (citaData) newScore = Math.min(10, newScore + 2);
      
      await this.supabase.updateLead(lead.id, { 
        conversation_history: history,
        property_interest: matchedProperty?.name || lead.property_interest,
        score: newScore
      });

      await this.twilio.sendWhatsAppMessage(from, response);

    } catch (error) {
      console.error('❌ Error:', error);
      await this.twilio.sendWhatsAppMessage(from, 'Disculpa, tuve un problema. ¿Podrías repetir tu mensaje?');
    }
  }
}
