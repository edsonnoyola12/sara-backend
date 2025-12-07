with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Agregar lógica de detección de citas DESPUÉS de actualizar la propiedad
insert_point = content.find('      // Si NO necesita crédito y ya tenemos nombre + propiedad, notificar vendedor')

if insert_point == -1:
    print("❌ No encontré el punto de inserción")
    exit(1)

appointment_code = '''
      // DETECTAR SOLICITUD DE CITA
      const appointmentRequest = /(?:cita|agendar|ver|visitar|mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i.test(body);
      const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;
      const datePattern = /(?:mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i;
      
      if (appointmentRequest && timePattern.test(body) && datePattern.test(body) && matchedProperty) {
        const timeMatch = body.match(timePattern);
        const dateMatch = body.match(datePattern);
        
        // Parsear fecha
        let appointmentDate = new Date();
        const dateText = dateMatch[0].toLowerCase();
        
        if (dateText === 'mañana') {
          appointmentDate.setDate(appointmentDate.getDate() + 1);
        } else if (dateText === 'pasado') {
          appointmentDate.setDate(appointmentDate.getDate() + 2);
        } else if (dateText === 'hoy') {
          // Hoy
        } else {
          // Días de la semana
          const daysMap = {
            'lunes': 1, 'martes': 2, 'miércoles': 3, 'miércoles': 3,
            'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0
          };
          const targetDay = daysMap[dateText];
          const currentDay = appointmentDate.getDay();
          let daysToAdd = targetDay - currentDay;
          if (daysToAdd <= 0) daysToAdd += 7;
          appointmentDate.setDate(appointmentDate.getDate() + daysToAdd);
        }
        
        // Parsear hora
        let hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const meridiem = timeMatch[3]?.toLowerCase();
        
        if (meridiem && meridiem.includes('pm') && hour < 12) {
          hour += 12;
        } else if (meridiem && meridiem.includes('am') && hour === 12) {
          hour = 0;
        } else if (!meridiem && hour < 8) {
          hour += 12; // Asumir PM si es hora baja sin especificar
        }
        
        appointmentDate.setHours(hour, minute, 0, 0);
        
        // Verificar disponibilidad
        const startTime = appointmentDate.toISOString();
        const endTime = new Date(appointmentDate.getTime() + 60*60*1000).toISOString();
        
        try {
          const events = await this.calendar.listEvents(startTime, endTime);
          
          if (events.length > 0) {
            // Ocupado - ofrecer alternativas
            await this.twilio.sendWhatsAppMessage(
              from,
              `Lo siento, ${dateText} a las ${timeMatch[0]} ya está ocupado. ¿Te funcionan estas opciones?\\n\\n1. ${dateText} a las ${hour + 1}:00\\n2. ${dateText} a las ${hour + 2}:00\\n3. Al día siguiente a la misma hora`
            );
          } else {
            // Disponible - crear evento
            const eventData = {
              summary: `Cita - ${lead.name || 'Cliente'} - ${matchedProperty.name}`,
              description: `Cliente: ${lead.name}\\nTeléfono: ${lead.phone}\\nPropiedad: ${matchedProperty.name}`,
              startTime,
              endTime,
              attendees: []
            };
            
            const calendarEvent = await this.calendar.createEvent(eventData);
            
            // Guardar en appointments
            const { data: appointment } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: lead.phone,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: lead.assigned_to,
              scheduled_date: appointmentDate.toISOString().split('T')[0],
              scheduled_time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
              status: 'scheduled',
              google_calendar_event_id: calendarEvent.id,
              google_calendar_event_url: calendarEvent.htmlLink,
              appointment_type: 'property_viewing',
              duration_minutes: 60
            }]).select().single();
            
            console.log('📅 Cita creada:', appointment);
            
            // Notificar cliente
            await this.twilio.sendWhatsAppMessage(
              from,
              `✅ *CITA CONFIRMADA*\\n\\nFecha: ${dateText}\\nHora: ${hour}:${minute.toString().padStart(2, '0')}\\nPropiedad: ${matchedProperty.name}\\n\\n¡Nos vemos ahí! 🏠`
            );
            
            // Notificar vendedor
            if (lead.assigned_to) {
              const { data: vendedor } = await this.supabase.client
                .from('team_members')
                .select('*')
                .eq('id', lead.assigned_to)
                .single();
                
              if (vendedor && vendedor.whatsapp_number) {
                await this.twilio.sendMessage(
                  vendedor.whatsapp_number,
                  `📅 *CITA AGENDADA*\\n\\nCliente: ${lead.name}\\nTeléfono: ${lead.phone}\\nPropiedad: ${matchedProperty.name}\\nFecha: ${dateText}\\nHora: ${hour}:${minute.toString().padStart(2, '0')}\\n\\nLink calendario: ${calendarEvent.htmlLink}`
                );
                console.log('📅 Vendedor notificado de cita');
              }
            }
          }
        } catch (err) {
          console.error('Error agendando cita:', err);
          await this.twilio.sendWhatsAppMessage(from, 'Disculpa, hubo un problema al agendar la cita. ¿Puedes intentar de nuevo?');
        }
      }

'''

# Insertar el código ANTES de la notificación de leads de contado
content = content[:insert_point] + appointment_code + content[insert_point:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Agendamiento Google Calendar implementado")
