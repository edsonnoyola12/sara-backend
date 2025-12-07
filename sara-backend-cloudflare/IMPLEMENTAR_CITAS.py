with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Insertar código de detección de citas DESPUÉS del parsing financiero
insert_point = content.find("console.log('💰 PARSEADO:', {")
insert_point = content.find('\n', content.find('});', insert_point)) + 1

codigo_citas = '''
      // ========================================
      // DETECTAR CITA
      // ========================================
      const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?/i);
      const dateMatch = body.match(/(?:mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
      
      let citaData = null;
      if (timeMatch && dateMatch && matchedProperty) {
        let appointmentDate = new Date();
        const dateText = dateMatch[0].toLowerCase();
        
        // Parsear fecha
        if (dateText === 'mañana') {
          appointmentDate.setDate(appointmentDate.getDate() + 1);
        } else if (dateText.includes('pasado')) {
          appointmentDate.setDate(appointmentDate.getDate() + 2);
        }
        
        // Parsear hora
        let hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const meridiem = timeMatch[0].toLowerCase();
        
        if (meridiem.includes('pm') && hour < 12) hour += 12;
        if (meridiem.includes('am') && hour === 12) hour = 0;
        if (!meridiem.includes('am') && !meridiem.includes('pm') && hour < 8) hour += 12;
        
        appointmentDate.setHours(hour, minute, 0, 0);
        
        citaData = {
          date: appointmentDate.toISOString().split('T')[0],
          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
          datetime: appointmentDate.toISOString(),
          dateText: dateText,
          timeText: `${hour}:${minute.toString().padStart(2, '0')}`
        };
        
        console.log('📅 Cita detectada:', citaData);
      }

'''

content = content[:insert_point] + codigo_citas + content[insert_point:]

# Ahora agregar creación de cita DESPUÉS de crear hipoteca
insert_point2 = content.find("console.log('🏦 Solicitud hipotecaria creada para:', clientName);")
insert_point2 = content.find('\n', insert_point2) + 1

codigo_crear_cita = '''
          // CREAR CITA si se detectó
          if (citaData && lead.assigned_to) {
            const { data: appointment } = await this.supabase.client.from('appointments').insert([{
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
            
            console.log('📅 Cita creada en DB:', appointment?.id);
            
            // Crear en Google Calendar
            try {
              const calendarEvent = await this.calendar.createEvent({
                summary: `Cita - ${clientName} - ${matchedProperty.name}`,
                description: `Cliente: ${clientName}\\nTeléfono: ${cleanPhone}\\nPropiedad: ${matchedProperty.name}`,
                startTime: citaData.datetime,
                endTime: new Date(new Date(citaData.datetime).getTime() + 60*60*1000).toISOString(),
                attendees: []
              });
              
              // Actualizar con ID de Google Calendar
              await this.supabase.client.from('appointments')
                .update({
                  google_calendar_event_id: calendarEvent.id,
                  google_calendar_event_url: calendarEvent.htmlLink
                })
                .eq('id', appointment.id);
              
              console.log('📅 Evento creado en Google Calendar:', calendarEvent.id);
            } catch (err) {
              console.error('Error creando evento en Calendar:', err);
            }
          }

'''

content = content[:insert_point2] + codigo_crear_cita + content[insert_point2:]

# Modificar notificaciones para incluir cita
old_notif = '''              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*\\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}\\n\\n¡Contactar pronto!`'''

new_notif = '''              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*\\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\n\\n📅 *CITA AGENDADA:*\\n• ${citaData.dateText} a las ${citaData.timeText}\\n• Ubicación: ${matchedProperty.name}` : ''}\\n\\n¡Contactar pronto!`'''

content = content.replace(old_notif, new_notif)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Agendamiento de citas implementado:")
print("  1. Detección de fecha/hora")
print("  2. Creación en Supabase")
print("  3. Creación en Google Calendar")
print("  4. Incluido en notificaciones")
