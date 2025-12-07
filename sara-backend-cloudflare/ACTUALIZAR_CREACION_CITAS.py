with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar donde se crea la cita
old_crear_cita = '''          if (citaData && lead.assigned_to && matchedProperty) {
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

new_crear_cita = '''          if (citaData && lead.assigned_to && matchedProperty) {
            // Buscar vendedor asignado
            const { data: vendedor } = await this.supabase.client
              .from('team_members')
              .select('*')
              .eq('id', lead.assigned_to)
              .single();
            
            // Buscar asesor asignado (si hay hipoteca)
            let asesorAsignado = null;
            if (needsMortgageStatus && mortgageData.monthly_income) {
              const { data: mortgage } = await this.supabase.client
                .from('mortgage_applications')
                .select('assigned_advisor_id, assigned_advisor_name')
                .eq('lead_phone', cleanPhone)
                .single();
              
              if (mortgage?.assigned_advisor_id) {
                const { data: asesor } = await this.supabase.client
                  .from('team_members')
                  .select('*')
                  .eq('id', mortgage.assigned_advisor_id)
                  .single();
                asesorAsignado = asesor;
              }
            }
            
            // Guardar cita en Supabase
            const { data: appt } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: vendedor?.id,
              vendedor_name: vendedor?.name,
              asesor_id: asesorAsignado?.id,
              asesor_name: asesorAsignado?.name,
              scheduled_date: citaData.date,
              scheduled_time: citaData.time,
              status: 'scheduled',
              appointment_type: asesorAsignado ? 'property_viewing_with_credit' : 'property_viewing',
              duration_minutes: 60
            }]).select().single();
            console.log('📅 CITA GUARDADA EN DB:', appt?.id);
            
            // Crear eventos en Google Calendar
            if (appt) {
              try {
                const startDateTime = `${citaData.date}T${citaData.time}`;
                const endDate = new Date(startDateTime);
                endDate.setHours(endDate.getHours() + 1);
                const endDateTime = endDate.toISOString().split('.')[0];
                
                let vendedorEventId = null;
                let asesorEventId = null;
                
                // Evento para vendedor
                if (vendedor) {
                  const vendedorEvent = await this.calendar.createEvent(
                    `Cita - ${clientName} - ${matchedProperty.name}`,
                    `Cliente: ${clientName}\\nTeléfono: ${cleanPhone}\\nPropiedad: ${matchedProperty.name}${asesorAsignado ? `\\nAsesor: ${asesorAsignado.name}` : ''}`,
                    startDateTime,
                    endDateTime,
                    []
                  );
                  vendedorEventId = vendedorEvent?.id;
                  console.log('📅 Evento vendedor creado:', vendedorEventId);
                }
                
                // Evento para asesor (si aplica)
                if (asesorAsignado) {
                  const asesorEvent = await this.calendar.createEvent(
                    `Cita Crédito - ${clientName} - ${matchedProperty.name}`,
                    `Cliente: ${clientName}\\nTeléfono: ${cleanPhone}\\nPropiedad: ${matchedProperty.name}\\nVendedor: ${vendedor?.name}\\n\\nIngreso: $${mortgageData.monthly_income?.toLocaleString()}\\nEnganche: $${mortgageData.down_payment?.toLocaleString()}`,
                    startDateTime,
                    endDateTime,
                    []
                  );
                  asesorEventId = asesorEvent?.id;
                  console.log('📅 Evento asesor creado:', asesorEventId);
                }
                
                // Actualizar cita con IDs de eventos
                await this.supabase.client.from('appointments')
                  .update({
                    google_event_vendedor_id: vendedorEventId,
                    google_event_asesor_id: asesorEventId
                  })
                  .eq('id', appt.id);
                
                console.log('✅ Eventos de Calendar guardados');
              } catch (calErr) {
                console.error('❌ Error Google Calendar:', calErr);
              }
            }
          }'''

content = content.replace(old_crear_cita, new_crear_cita)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Creación de citas actualizada:")
print("   - Guarda vendedor_id + asesor_id")
print("   - Crea eventos separados en Calendar")
print("   - Guarda google_event_vendedor_id + google_event_asesor_id")
