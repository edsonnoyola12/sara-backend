with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar donde se guarda la cita
old_save_cita = '''          if (citaData && lead.assigned_to && matchedProperty) {
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
          }'''

new_save_cita = '''          if (citaData && lead.assigned_to && matchedProperty) {
            // Guardar en Supabase
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
            console.log('📅 CITA GUARDADA EN DB:', appt?.id);
            
            // Crear en Google Calendar
            if (appt) {
              try {
                const startDateTime = `${citaData.date}T${citaData.time}`;
                const endDate = new Date(startDateTime);
                endDate.setHours(endDate.getHours() + 1);
                const endDateTime = endDate.toISOString().split('.')[0];
                
                const calendarEvent = await this.calendar.createEvent(
                  `Cita - ${clientName} - ${matchedProperty.name}`,
                  `Cliente: ${clientName}\\nTeléfono: ${cleanPhone}\\nPropiedad: ${matchedProperty.name}\\nVendedor asignado`,
                  startDateTime,
                  endDateTime,
                  []
                );
                
                if (calendarEvent && calendarEvent.id) {
                  // Actualizar cita con datos de Google Calendar
                  await this.supabase.client.from('appointments')
                    .update({
                      google_calendar_event_id: calendarEvent.id,
                      google_calendar_event_url: calendarEvent.htmlLink
                    })
                    .eq('id', appt.id);
                  
                  console.log('📅 EVENTO CREADO EN GOOGLE CALENDAR:', calendarEvent.id);
                  console.log('🔗 Link:', calendarEvent.htmlLink);
                } else {
                  console.log('⚠️ No se pudo crear evento en Calendar');
                }
              } catch (calErr) {
                console.error('❌ Error Google Calendar:', calErr);
              }
            }
          }'''

content = content.replace(old_save_cita, new_save_cita)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Integración Google Calendar agregada")
print("   - Crea evento automáticamente")
print("   - Guarda event_id y link en DB")
