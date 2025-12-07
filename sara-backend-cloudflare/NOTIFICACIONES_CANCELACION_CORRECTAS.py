with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# CLIENTE CANCELA SU CITA
old_cliente_cancela = '''          if (appointment) {
            await this.supabase.client
              .from('appointments')
              .update({ status: 'cancelled' })
              .eq('id', appointment.id);
            
            if (appointment.google_calendar_event_id) {
              await this.calendar.deleteEvent(appointment.google_calendar_event_id);
            }
            
            await this.twilio.sendWhatsAppMessage(from, '✅ Tu cita ha sido cancelada. ¿Quieres agendar otra?');
            return;'''

new_cliente_cancela = '''          if (appointment) {
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
                  `❌ *CITA CANCELADA*\\n\\n👤 ${appointment.lead_phone}\\n🏠 ${appointment.property_name}\\n📅 ${fechaStr} ${horaStr}\\n\\n*El cliente canceló*`
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
                  `❌ *CITA CANCELADA*\\n\\n👤 ${appointment.lead_phone}\\n🏠 ${appointment.property_name}\\n📅 ${fechaStr} ${horaStr}\\n\\n*El cliente canceló*`
                );
              }
            }
            
            return;'''

content = content.replace(old_cliente_cancela, new_cliente_cancela)

# VENDEDOR/ASESOR CANCELA CITA DE CLIENTE
old_vendedor_cancela = '''            if (appointment) {
              // Cancelar en DB
              await this.supabase.client
                .from('appointments')
                .update({ status: 'cancelled' })
                .eq('id', appointment.id);
              
              // Cancelar en Google Calendar
              if (appointment.google_calendar_event_id) {
                await this.calendar.deleteEvent(appointment.google_calendar_event_id);
              }
              
              await this.twilio.sendWhatsAppMessage(from, `✅ Cita cancelada para ${appointment.leads.name || clientPhone}`);
              return;'''

new_vendedor_cancela = '''            if (appointment) {
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
                `❌ *CITA CANCELADA*\\n\\n🏠 ${appointment.property_name}\\n📅 ${fechaStr} ${horaStr}\\n\\nTu cita fue cancelada por el equipo. ¿Quieres reagendar?`
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
                    `❌ *CITA CANCELADA*\\n\\n👤 ${clientPhone}\\n🏠 ${appointment.property_name}\\n📅 ${fechaStr} ${horaStr}\\n\\n*Cancelada por ${teamMember.name}*`
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
                    `❌ *CITA CANCELADA*\\n\\n👤 ${clientPhone}\\n🏠 ${appointment.property_name}\\n📅 ${fechaStr} ${horaStr}\\n\\n*Cancelada por ${teamMember.name}*`
                  );
                }
              }
              
              return;'''

content = content.replace(old_vendedor_cancela, new_vendedor_cancela)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificaciones inteligentes:")
print("   - Cliente cancela → Notifica solo a quien esté en ESA cita")
print("   - Vendedor/asesor cancela → Notifica al cliente + al otro (si hay)")
print("   - Cancela eventos de Google Calendar de ambos")
