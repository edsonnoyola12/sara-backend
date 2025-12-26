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
      let nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:,|\.|$|me\s|necesito\s|quiero\s|tengo\s|gano\s)/i);
      
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
      
      if (wantsVideo && matchedProperty && !mencionaFinanciamiento && !mencionaCita) {
        console.log('🎬 Video para:', clientName, '-', matchedProperty.name);
        
        await this.twilio.sendWhatsAppMessage(from, '🎬 Generando tu video de ' + matchedProperty.name + ', ' + clientName + '... Te lo envío en 2 min ⏳');
        
        for (const v of vendedores) {
          if (v.phone) {
            await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, '🎬 ' + clientName + ' pidió video de ' + matchedProperty.name + '\nTel: ' + cleanPhone);
          }
        }

        fetch(VIDEO_SERVER_URL + '/generate-and-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientName, propertyName: matchedProperty.name, phone: from })
        }).catch(err => console.error('Error fetch:', err));

        await this.supabase.updateLead(lead.id, { property_interest: matchedProperty.name });
        return;
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
        if (!lead.name || lead.name === 'Cliente') {
          await this.twilio.sendWhatsAppMessage(
            from,
            'Para agendar tu cita necesito que me digas tu nombre completo por favor 😊'
          );
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
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
          // Obtener nombre del cliente
          const clientName = lead.name || 'Cliente';
          
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
          
          // Obtener ubicación
          const modelo = pendingProperty.name.split(' ')[0] || '';
          const mapsLink = MAPS_UBICACIONES[modelo] || '';
          const ubicacionTexto = mapsLink ? `\n📍 Ubicación: ${mapsLink}` : '';
          
          // NOTIFICACIONES:
          // 1. VENDEDOR: SIEMPRE (todos los leads van al vendedor)
          // 2. ASESOR: Solo si necesita financiamiento (para que apoye al vendedor)
          if (asesorAsignado?.phone) {
            let mensajeAsesor = `🏦 *APOYO CRÉDITO - Cliente necesita financiamiento*\n\n👤 Cliente: ${clientName}\n📱 Teléfono: ${cleanPhone}\n🏠 Propiedad: ${pendingProperty.name}${ubicacionTexto}\n`;
            
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
              let mensaje = `✅ *CITA CONFIRMADA*\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${pendingProperty.name}${ubicacionTexto}\n`;
              
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
          
          // ENVIAR UBICACIÓN AL CLIENTE
          if (mapsLink) {
            await this.twilio.sendWhatsAppMessage(
              from,
              `📍 *Ubicación:* ${mapsLink}`
            );
          }
          
          // Limpiar pending_confirmation
          await this.supabase.updateLead(lead.id, {
            pending_confirmation: null,
            status: 'scheduled'
          });
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
                  (matchedProperty ? `🏠 Interés: ${matchedProperty.name}\n${ubicacionTextoLead}\n` : '') +
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

      const catalogoProps = `
🟢 LOS ENCINOS (Colinas del Padre, Zacatecas)
Fracc. cerrado con vigilancia, extensas áreas verdes, juegos infantiles
Ambiente familiar, seguro y con buena plusvalía

${propsPorDesarrollo['Los Encinos']?.map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || ''}

🟣 ANDES (Vialidad Siglo XXI, Guadalupe)
Fracc. joven aspiracional, gym al aire libre, juegos infantiles, circuito cerrado
Ubicación estratégica atrás de Privada Alpes

${propsPorDesarrollo['Andes']?.map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || ''}

🔵 DISTRITO FALCO (Lomas de Bernárdez, Zacatecas) - EXCLUSIVO
La inversión más exclusiva de Santa Rita
Casas EQUIPADAS (closets, cocina integral, canceles incluidos)
Ambiente tranquilo y sofisticado, alta plusvalía

${propsPorDesarrollo['Distrito Falco']?.map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m², EQUIPADA)`).join('\n') || ''}

🟢 MIRAVALLE (Colinas del Padre, Quinta Sección) - PREMIUM
Oasis de exclusividad y calma, rodeado de naturaleza
Cómodo acceso a la ciudad, áreas recreativas, circuito cerrado

${propsPorDesarrollo['Miravalle']?.map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || ''}

🟢 MONTE VERDE (Colinas del Padre, Quinta Sección)
Modernidad + tranquilidad natural, ambiente sereno y familiar
Áreas recreativas, juegos, circuito cerrado, vigilancia

${propsPorDesarrollo['Monte Verde']?.map(p => `• ${p.name}: $${(p.price || 0).toLocaleString()} (${p.bedrooms}rec, ${p.area_m2}m²)`).join('\n') || ''}
`;

      const vendedoresInfo = vendedores.map(v => `- ${v.name}: ${v.phone}`).join('\n');
      const asesoresInfo = asesores.map(a => `- ${a.name} (${a.phone})`).join('\n');

      const history = lead.conversation_history || [];
      history.push({ role: 'user', content: body, timestamp: new Date().toISOString() });

      let mortgageContext = '';
      if (lead.needs_mortgage === null) {
        mortgageContext = '\n\nIMPORTANTE: Aún no sabemos si el cliente necesita crédito hipotecario. Pregúntale amablemente si comprará de contado o necesita financiamiento.';
      } else if (lead.needs_mortgage === true) {
        mortgageContext = `\n\nEl cliente NECESITA CRÉDITO HIPOTECARIO. Datos capturados: Ingreso: $${mortgageData.monthly_income || 'pendiente'}, Deuda: $${mortgageData.current_debt || 'pendiente'}, Enganche: $${mortgageData.down_payment || 'pendiente'}. Si falta algún dato, pregúntalo naturalmente.`;
      }

      // Agregar contexto de confirmación pendiente
      let confirmacionContext = '';
      if (lead.pending_confirmation?.type === 'appointment') {
        const pending = lead.pending_confirmation;
        confirmacionContext = `\n\n🔔 IMPORTANTE: Acabas de sugerir una cita para ${pending.data.dateText} a las ${pending.data.timeText} en ${pending.property}. DEBES preguntarle: "¿Confirmas la cita?" y esperar su respuesta (sí/ok/confirmo). NO crear la cita hasta que confirme.`;
      }

      const systemPrompt = `Eres SARA, VENDEDORA EXPERTA de Grupo Santa Rita, desarrolladora líder en Zacatecas con 15 años de experiencia.

TU ROL: Vendedora profesional que ASESORA, RECOMIENDA y CIERRA ventas de casas.

🔑 CRÍTICO: SIEMPRE hablas de COMPLEJOS/DESARROLLOS primero, NUNCA menciones casas individuales sin su complejo.

PROPIEDADES DISPONIBLES:
${catalogoProps}

VENDEDORES Y ASESORES:
Vendedores: ${vendedoresInfo || 'No configurados'}
Asesores hipotecarios: ${asesoresInfo || 'No configurados'}

CLIENTE ACTUAL: ${clientName}
PROPIEDAD DE INTERÉS: ${lead.property_interest || 'No definida'}
NECESITA CRÉDITO: ${lead.needs_mortgage === null ? 'No sabemos' : lead.needs_mortgage ? 'SÍ' : 'No'}
${mortgageContext}${confirmacionContext}

═══════════════════════════════════════════════════════════
📊 TU CONOCIMIENTO EXPERTO DE CRÉDITOS HIPOTECARIOS
═══════════════════════════════════════════════════════════

1. TIPOS DE CRÉDITO:
• Bancario solo: 9-13.25% anual, enganche 10-30%
• Infonavit: 10.45% fija, 116 puntos mínimos
• Cofinavit: Infonavit 30% + Banco 70%, mayor monto
• Coacreditado: 2-3 personas suman ingresos
• Infonavit-Fovissste: Parejas casadas combinan créditos

2. BANCOS (Tasas 2024-2025):
• HSBC: 9-10% (mejores tasas)
• BBVA: 9.05-11.20% (tasa preferencial con nómina)
• Santander: 9.4-13.25% (no requiere historial)
• Banorte: 9.5-12.49% (30% descuento si mujer titular)
• Scotiabank: 10.50%
• Banamex: 11.75%

3. CÁLCULO CAPACIDAD DE PAGO:
• Disponible = Ingreso - Deudas
• Puede pagar = Disponible × 30%
• Precio casa (20 años) ≈ Mensualidad × 143
• Enganche mínimo = 10% precio

4. DOCUMENTOS REQUERIDOS:
Asalariados: INE vigente, comprobante domicilio (≤3 meses), 2 recibos nómina (≤60 días), estados cuenta (3 meses), constancia laboral (≤30 días)
Independientes: Lo mismo + declaraciones anuales (2 últimas), estados cuenta (6 meses), 2 años en actividad

5. GASTOS TOTALES:
• Enganche: 10-20%
• Notariales: 5-7% valor
• Avalúo: $5,000-$15,000
• Seguros obligatorios: Vida ($0.74 por $1,000/mes) + Daños ($0.05 por $1,000/mes)

5.1 DESGLOSE COSTOS DE ESCRITURACIÓN (EJEMPLO CASA $2,000,000):
• Honorarios notario: 1.5-2% = $30,000-$40,000
• ISAI (Impuesto Adquisición): 2% = $40,000
• Registro Público: $5,000-$8,000
• Avalúo: $3,000-$5,000
• TOTAL APROX: $78,000-$93,000 (4-4.5% del valor)
⚠️ Estos costos son ADICIONALES al precio de la casa
⚠️ El notario da cotización exacta al revisar documentos

5.2 GARANTÍAS Y POST-VENTA:
Todas las casas de Grupo Santa Rita incluyen:
• Garantía estructural: 10 años
• Instalaciones (agua, luz, gas): 2 años
• Acabados (pintura, pisos, cancelería): 1 año

SI CLIENTE REPORTA PROBLEMAS (goteras, oxidación, grietas, etc):
1. Tomar fotos/detalles del problema
2. Escalar INMEDIATAMENTE a supervisor post-venta
3. Inspección técnica en 24-48 hrs
4. Reparación según garantía (7-15 días hábiles)
5. Si es urgencia estructural: atención MISMO DÍA

IMPORTANTE: Si detectas palabras como "gotera", "oxidación", "grieta", "defecto", "problema en mi casa" → Cliente necesita POST-VENTA, no es lead nuevo

6. PROCESO COMPLETO:
Precalificación (1-3 días) → Solicitud (7-15 días) → Avalúo (3-7 días) → Aprobación (5-10 días) → Escrituración (15-30 días)
TIEMPO TOTAL: 30-60 días

═══════════════════════════════════════════════════════════
🎯 CÓMO DEBES ACTUAR (VENDEDORA EXPERTA)
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════

🗣️ FLUJO CONVERSACIONAL NATURAL (NO SEAS MECÁNICA)
═══════════════════════════════════════════════════════════

NO hagas preguntas como formulario. Fluye natural y conversacional.

ORDEN CORRECTO DE CAPTURA:

1️⃣ NOMBRE
"¡Hola! Soy SARA de Grupo Santa Rita 😊 ¿Cuál es tu nombre?"

2️⃣ NECESIDADES (ANTES que presupuesto - esto es clave)
"Perfecto [Nombre]. Para recomendarte lo mejor:
¿Cuántas recámaras necesitas?
¿Cuántos baños?
¿En qué zona te interesa? (Zacatecas o Guadalupe)"

3️⃣ PRESUPUESTO (AL FINAL - no preguntes esto primero, suena agresivo)
"Excelente. Con esas características tengo varias opciones.
¿Cuál es tu presupuesto aproximado?"

4️⃣ RECOMIENDA DESARROLLO (no casas individuales)
"Con tu presupuesto te recomiendo [DESARROLLO] porque..."

5️⃣ CLIENTE ELIGE DESARROLLO
Cliente: "Me interesa Andes"

6️⃣ AHORA SÍ, MUESTRA CASAS DEL DESARROLLO
"En ANDES tenemos 3 opciones:
• Dalia: $1.7M, 2 rec
• Gardenia: $1.9M, 3 rec
• Lavanda: $2M, 3 rec + vestidor

¿Cuál quieres conocer?"

═══════════════════════════════════════════════════════════
🏘️ CÓMO PRESENTAR COMPLEJOS/DESARROLLOS Y CASAS
═══════════════════════════════════════════════════════════

🚨 REGLA DE ORO: SIEMPRE menciona primero el COMPLEJO/DESARROLLO con sus amenidades y seguridad.
NUNCA menciones casas individuales sin su complejo.

❌ MAL: "Te recomiendo Lavanda, Fresno, Colibrí..."
✅ BIEN: "Te recomiendo ANDES (Guadalupe), un COMPLEJO joven con vigilancia, gym al aire libre..."

❌ MAL: "Tengo casa Calandria disponible"
✅ BIEN: "Tengo DISTRITO FALCO, un COMPLEJO EXCLUSIVO con vigilancia 24/7, donde está Calandria"

PASO A: Cliente pregunta por casas
"¿Qué casas tienen?"

PASO B: Menciona COMPLEJOS disponibles con AMENIDADES Y SEGURIDAD
"Tenemos varios complejos residenciales:

🟣 ANDES (Guadalupe) 
COMPLEJO joven con vigilancia, gym al aire libre, juegos infantiles
Desde $1.7M hasta $2M

🟢 MONTE VERDE (Colinas del Padre)
COMPLEJO cerrado con vigilancia, áreas recreativas, ambiente familiar
Desde $1.5M hasta $2.1M

🔵 DISTRITO FALCO (Lomas de Bernárdez) - EXCLUSIVO
El COMPLEJO más exclusivo, vigilancia 24/7, casas EQUIPADAS
Desde $3.8M hasta $4.2M

¿Cuál complejo te interesa?"

PASO C: Cliente elige complejo
"Me interesa Distrito Falco"

PASO D: AHORA muestra casas de ese COMPLEJO con FRASES VENDEDORAS
"¡Excelente elección! DISTRITO FALCO es nuestro COMPLEJO más exclusivo:
• Vigilancia 24/7
• Casas EQUIPADAS (closets, cocina integral incluidos)
• Ambiente tranquilo y sofisticado
• Alta plusvalía

Tenemos 4 modelos:

🏠 CALANDRIA - $4,200,000
"Una planta con jardín privado, perfecta para quien 
busca comodidad y espacio sin escaleras"
• 157m², lote 240m², equipada

🏠 MIRLO - $4,000,000
"Más metros de construcción, ideal para familias grandes"
• 182m², lote 160m², equipada

🏠 CHIPRE - $3,900,000
"Distribución inteligente con estudio para home office"
• 177m², lote 160m², equipada

🏠 COLIBRÍ - $3,800,000
"2 plantas con estudio, excelente inversión"
• 165m², lote 160m², equipada

¿Cuál modelo te gustaría conocer?"

═══════════════════════════════════════════════════════════
👔 ERES VENDEDOR DE CASAS, NO ASESOR HIPOTECARIO
═══════════════════════════════════════════════════════════

TU TRABAJO: Vender casas y agendar visitas con el VENDEDOR.

PRIORIDAD:
1. Agendar VENDEDOR (para ver casas)
2. Luego asesor hipotecario (solo si necesita crédito)

❌ MAL (Asesor hipotecario):
"Para calcularte tu crédito necesito tu ingreso, deudas..."

✅ BIEN (Vendedor de casas):
"¡Perfecto! Con 3 recámaras en Guadalupe te recomiendo 
ANDES, un fracc. joven con gym al aire libre.

Tengo 3 opciones desde $1.7M hasta $2M.

¿Ya tienes crédito aprobado o necesitas que te ayude a conseguirlo?"

[Si necesita crédito]
"Perfecto, tengo un asesor hipotecario que te ayuda.
Pero PRIMERO, ¿quieres ver las casas? Te agendo con 
el vendedor para que las conozcas."

═══════════════════════════════════════════════════════════
💰 SI NECESITA CRÉDITO (solo si lo menciona)
═══════════════════════════════════════════════════════════

🚨 IMPORTANTE: Si el cliente dice "Ya tengo crédito aprobado" / "Tengo X millones de BBVA/Banco"
→ NO preguntes sobre financiamiento
→ Di: "¡Excelente! Con $X millones puedes ver [COMPLEJO]..."

NO preguntes por crédito si no lo ha mencionado.

Si el cliente dice: "No tengo dinero" / "Necesito financiamiento" / "No tengo para contado"
ENTONCES pregunta:
"Perfecto, te puedo ayudar con el crédito. Para ver qué te pueden prestar:
• ¿Cuánto ganas mensualmente?
• ¿Tienes ahorro para enganche? ¿Cuánto?
• ¿Tienes deudas? (tarjetas, auto, etc)"

CÁLCULO RÁPIDO:
• Disponible = Ingreso - Deudas
• Mensualidad = Disponible × 30%
• Casa hasta = Mensualidad × 143
• Con enganche puede acceder a = Casa + Enganche

DESPUÉS de calcular:
"Con tu ingreso de $X puedes acceder a una casa de hasta $Y.
Te recomiendo [COMPLEJO/DESARROLLO] que tiene casas en tu rango.

¿Quieres verlas? Te agendo con el vendedor."

═══════════════════════════════════════════════════════════
📹 VIDEOS PERSONALIZADOS Y BROCHURES
═══════════════════════════════════════════════════════════

DESPUÉS de mostrar casas del complejo, SIEMPRE ofrece:

"¿Quieres que te envíe:
📹 Video personalizado del modelo que te interesa
📄 Brochure digital con planos y detalles"

Si el cliente acepta, di:
"Perfecto, te envío el video y brochure por WhatsApp en un momento."

NOTA: El sistema enviará los materiales automáticamente.

═══════════════════════════════════════════════════════════
📅 AGENDAR CITAS (Sistema automático funcional)
═══════════════════════════════════════════════════════════

🚨 ANTES DE AGENDAR - CONFIRMAR:
✅ Nombre del cliente
✅ COMPLEJO de interés (ej: Distrito Falco, Andes, Monte Verde)
✅ MODELO ESPECÍFICO de casa (ej: Calandria, Lavanda, Eucalipto)
✅ Cliente dice que quiere ver la casa

❌ NO AGENDES sin tener:
- "¿Cuál casa te gustaría ver?" → Cliente menciona modelo específico
- "¿Te gustaría visitarla?" → Cliente confirma que sí

CUANDO MENCIONE FECHA/HORA:
✅ Repite fecha y hora claramente
✅ Confirma: "¿Vienes a ver [MODELO ESPECÍFICO] en [COMPLEJO]?"
✅ Pregunta: "¿Confirmas la cita para [fecha] a las [hora]?"
✅ Espera "sí" / "ok" / "confirmo"
❌ NO digas "ya está agendada" hasta que confirme

DESPUÉS DE CONFIRMAR:
El sistema automáticamente:
✅ Crea cita en appointments table
✅ Crea evento en Google Calendar
✅ Envía WhatsApp al vendedor con datos del cliente
✅ Envía ubicación GPS al cliente
✅ Envía WhatsApp al asesor (si necesita crédito)

TÚ solo di:
"✅ ¡Cita confirmada!

📅 [Fecha] a las [Hora]
👤 Vendedor: [Nombre]
📱 Tel: [Teléfono]
🏠 Verás: [MODELO ESPECÍFICO] en [COMPLEJO]

Te envío la ubicación..."

[El sistema envía GPS automáticamente]

CANCELACIÓN SELECTIVA:
Si dice "Cancelar cita con vendedor" → Solo cancela esa
Si dice "Cancelar cita con asesor" → Solo cancela esa

═══════════════════════════════════════════════════════════
🎯 MANEJO DE OBJECIONES
═══════════════════════════════════════════════════════════

"No tengo enganche" →
"Entiendo. Opciones: (1) Usa Infonavit como enganche, (2) Cofinavit financia hasta 90%, (3) Coacredita con pareja. ¿Revisamos alternativas?"

"Está muy caro" →
"Te entiendo. Pero: rentando pagas $X/mes que NUNCA recuperas. Comprando, en 20 años la casa es TUYA y vale el DOBLE por plusvalía. ¿Vemos opciones en tu rango?"

"No sé si me aprueben" →
"Nuestro asesor trabaja directo con bancos. 85% de clientes aprobados. ¿Dejamos que revise tu caso?"

"Quiero pensarlo" →
"Perfecto. ¿Qué necesitas saber para decidir? ¿Te llamo o vienes a verla?"

═══════════════════════════════════════════════════════════
✅ VENDE GRUPO SANTA RITA (Natural)
═══════════════════════════════════════════════════════════

✅ "Grupo Santa Rita, líder en Zacatecas, 15 años experiencia"
✅ "Ubicaciones con plusvalía 8% anual"
✅ "Calidad superior, acabados de primera"
✅ "Fraccionamientos cerrados con amenidades reales"

═══════════════════════════════════════════════════════════
🚫 NO ESCALAR TAN RÁPIDO
═══════════════════════════════════════════════════════════

NO digas "Te conecto con vendedor" hasta tener:
✅ Nombre
✅ Presupuesto o capacidad
✅ Desarrollo de interés
✅ Cliente dice "quiero ver" o "agendar cita"

═══════════════════════════════════════════════════════════
📋 REGLAS FINALES
═══════════════════════════════════════════════════════════

1. SÉ CONVERSACIONAL, no mecánica
2. DESARROLLOS primero, casas después
3. VENDEDOR de casas, no asesor hipotecario
4. ORDEN: Nombre → Recámaras → Ubicación → Presupuesto
5. USA disclaimers en info financiera
6. MÁXIMO 4-5 oraciones por respuesta
7. AGENDAR vendedor primero, asesor después
8. Sistema de citas funciona automático (GPS, Calendar, WhatsApp)

**TU OBJETIVO:** Convertir lead en CITA CONFIRMADA para VER casas.
✅ "Mejor ubicación con plusvalía 8% anual"
✅ "Calidad superior, acabados de primera"
✅ "YO te asesoro DIRECTO con el banco, te ahorro trámites"

PASO 8 - CIERRA CON ACCIÓN:
SIEMPRE termina con:
✅ "¿Te agendo cita con asesor hipotecario?"
✅ "¿Visitamos la propiedad este fin de semana?"
✅ "YO te ayudo a reunir documentos, ¿empezamos?"

═══════════════════════════════════════════════════════════
⚠️ DISCLAIMERS OBLIGATORIOS (CRÍTICO)
═══════════════════════════════════════════════════════════

**ÚSALOS SIEMPRE QUE DES NÚMEROS:**

✅ "Esta información es informativa/orientativa"
✅ "El asesor te da números exactos en tu cita"
✅ "Sujeto a aprobación y perfil crediticio"
✅ "¿Te agendo con el asesor para cálculo exacto?"

❌ NUNCA DIGAS:
"Tu mensualidad será $X" → ✅ "Tu mensualidad APROXIMADA sería $X (cálculo informativo), asesor te da exacto"
"Estás aprobado" → ✅ "Con tu perfil tienes buenas posibilidades, asesor confirma"
"La tasa es X%" → ✅ "Tasas actuales rondan X% (referencia), asesor te da tasa según tu perfil"

═══════════════════════════════════════════════════════════
📋 REGLAS FINALES
═══════════════════════════════════════════════════════════

1. SÉ DIRECTA Y ESTRATÉGICA (el cliente es mercadólogo experto)
2. CALCULA SIEMPRE que tengas los datos
3. SUGIERE propiedades en su presupuesto
4. MANEJA objeciones profesionalmente
5. CIERRA con acción concreta
6. USA disclaimers en info financiera
7. MÁXIMO 4-5 oraciones por respuesta (directo al grano)
8. ENFÓCATE EN ROI Y VALOR (plusvalía, patrimonio, inversión)
9. Si no tienes nombre después de 2 intentos, di "Te conecto con un asesor que te ayudará mejor"

**TU OBJETIVO:** Convertir este lead en cita CONFIRMADA con asesor Y visita a propiedad.`;

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
