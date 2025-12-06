import { SupabaseService } from '../services/supabase';
import { OpenAIService } from '../services/openai';
import { TwilioService } from '../services/twilio';

const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';

export class WhatsAppHandler {
  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService,
    private twilio: TwilioService
  ) {}

  async handleIncomingMessage(from: string, body: string): Promise<void> {
    try {
      console.log('📱 Mensaje de:', from, '-', body);

      const cleanPhone = from.replace('whatsapp:', '');
      
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
            const newCommission = (vendedor.commission || 0) + (property.base_price * 0.03); // 3% comisión

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
              `💰 Comisión: $${(property.base_price * 0.03).toLocaleString()}\n` +
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

      // Resto del flujo normal para clientes
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
          mortgage_data: {}
        });

        for (const v of vendedores) {
          if (v.phone) {
            await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, '🆕 Nuevo lead!\nTel: ' + cleanPhone + (assignedVendedor?.id === v.id ? '\n✅ Asignado a ti' : ''));
          }
        }
        console.log('🔔 Vendedores notificados:', vendedores.length);
      }

      const nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\s+([A-Za-záéíóúñÁÉÍÓÚÑ]+)/i);
      let clientName = lead.name || 'Cliente';
      
      if (nameMatch) {
        clientName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
        await this.supabase.updateLead(lead.id, { name: clientName });
        console.log('👤 Nombre actualizado:', clientName);
      }

      const videoKeywords = ['video', 'ver video', 'quiero ver', 'muéstrame', 'enseñame'];
      const wantsVideo = videoKeywords.some(kw => body.toLowerCase().includes(kw));

      let matchedProperty = null;
      for (const prop of properties) {
        if (body.toLowerCase().includes(prop.name.toLowerCase())) {
          matchedProperty = prop;
          break;
        }
      }

      if (!matchedProperty && lead.property_interest) {
        matchedProperty = properties.find(p => p.name.toLowerCase() === lead.property_interest.toLowerCase());
      }

      // Video SOLO si NO pidió datos financieros ni cita
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

      // Parsing con multiplicadores
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

      // ENGANCHE - Debug mejorado
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

      // DETECTAR CITA
      const timeMatch = body.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)/i);
      const dateMatch = body.match(/(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
      
      let citaData = null;
      if (timeMatch && dateMatch) {
        let appointmentDate = new Date();
        const dateText = dateMatch[0].toLowerCase();
        
        if (dateText === 'mañana') appointmentDate.setDate(appointmentDate.getDate() + 1);
        
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
        console.log('📅 CITA DETECTADA:', citaData);
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

      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {
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
            property_id: matchedProperty.id,
            property_name: matchedProperty.name,
            monthly_income: mortgageData.monthly_income || 0,
            additional_income: mortgageData.additional_income || 0,
            current_debt: mortgageData.current_debt || 0,
            down_payment: mortgageData.down_payment || 0,
            requested_amount: matchedProperty.base_price || 0,
            credit_term_years: 20,
            assigned_advisor_id: assignedAsesor?.id,
            assigned_advisor_name: assignedAsesor?.name,
            status: 'pending'
          }]);

          console.log('🏦 Solicitud hipotecaria creada para:', clientName);

          if (citaData && lead.assigned_to && matchedProperty) {
            const { data: appt } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: lead.assigned_to,
              scheduled_date: citaData.date,
              scheduled_time: citaData.time,
              status: 'scheduled',
              appointment_type: 'property_viewing',
              duration_minutes: 60
            }]).select().single();
            console.log('📅 CITA GUARDADA:', appt?.id);
          }


          if (assignedAsesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\n\n👤 Cliente: ${clientName}\n📱 Teléfono: ${cleanPhone}\n🏠 Propiedad: ${matchedProperty.name}\n\n💰 *DATOS FINANCIEROS:*\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\n\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\n\n¡Contactar pronto!`
            );
          }

          for (const v of vendedores) {
            if (v.phone) {
              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + v.phone,
                `🏦 *LEAD CON CRÉDITO*\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty.name}\n\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\n\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\n\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`
              );
            }
          }
        }
      }

      const catalogoProps = properties.map(p => 
        `- ${p.name}: ${p.description || 'Sin descripción'}. Precio: $${(p.base_price || 0).toLocaleString()}. ${p.bedrooms || 0} recámaras, ${p.bathrooms || 0} baños, ${p.sqm || 0}m². Categoría: ${p.category || 'General'}. Disponibles: ${(p.total_units || 0) - (p.sold_units || 0)}`
      ).join('\n');

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

      const systemPrompt = `Eres SARA, asistente virtual de Grupo Santa Rita, una desarrolladora inmobiliaria en Zacatecas.

TU MISIÓN: 
1. Obtener nombre y teléfono del cliente
2. Identificar la propiedad de interés
3. Preguntar si comprará de contado o necesita CRÉDITO HIPOTECARIO
4. Si necesita crédito, capturar: ingreso mensual, deudas actuales, enganche disponible
5. Agendar cita con vendedor

PROPIEDADES DISPONIBLES:
${catalogoProps}

VENDEDORES DISPONIBLES PARA CITAS:
${vendedoresInfo || 'No hay vendedores configurados'}

ASESORES HIPOTECARIOS (para créditos):
${asesoresInfo || 'No hay asesores configurados'}
${mortgageContext}

REGLAS:
1. Sé amigable y profesional
2. Si preguntan por una propiedad, usa la descripción exacta del catálogo
3. Ofrece enviar video personalizado si muestran interés
4. SIEMPRE pregunta si necesitan financiamiento si aún no lo sabes
5. Si necesitan crédito, pregunta cuánto ganan mensualmente de forma natural
6. Cuando tengas los datos de crédito, confirma que un asesor los contactará
7. Ofrece agendar cita con vendedor para visita
8. Responde en español, máximo 2-3 oraciones

CLIENTE ACTUAL: ${clientName}
PROPIEDAD DE INTERÉS: ${lead.property_interest || 'No definida'}
¿NECESITA HIPOTECA?: ${lead.needs_mortgage === null ? 'No sabemos aún' : lead.needs_mortgage ? 'SÍ' : 'No, compra de contado'}`;

      const response = await this.openai.chat(history.slice(-10), body, systemPrompt);

      history.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
      
      let newScore = lead.score || 5;
      if (needsMortgage || matchedProperty) newScore = Math.min(10, newScore + 1);
      if (mortgageData.monthly_income) newScore = Math.min(10, newScore + 2);
      
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
