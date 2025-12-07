with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Insertar ANTES del flujo normal, justo después de limpiar el teléfono
insert_after = content.find("const cleanPhone = from.replace('whatsapp:', '');")
insert_pos = content.find("\n", insert_after) + 1

comandos_block = '''
      // ========================================
      // SISTEMA DE COMANDOS WHATSAPP
      // ========================================
      
      // Detectar si es vendedor/asesor
      const { data: teamMember } = await this.supabase.client
        .from('team_members')
        .select('*')
        .eq('phone', cleanPhone)
        .eq('active', true)
        .single();
      
      const isTeamMember = !!teamMember;
      const bodyLower = body.toLowerCase();
      
      // COMANDO: CANCELAR CITA
      if (bodyLower.includes('cancelar') && bodyLower.includes('cita')) {
        if (isTeamMember) {
          // Vendedor/Asesor cancela cita de cliente
          const phoneMatch = body.match(/\\+?5?2?1?(\\d{10})/);
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
              return;
            } else {
              await this.twilio.sendWhatsAppMessage(from, '❌ No encontré cita activa para ese cliente');
              return;
            }
          }
        } else {
          // Cliente cancela su propia cita
          const { data: appointment } = await this.supabase.client
            .from('appointments')
            .select('*')
            .eq('lead_phone', cleanPhone)
            .eq('status', 'scheduled')
            .order('scheduled_date', { ascending: true })
            .limit(1)
            .single();
          
          if (appointment) {
            await this.supabase.client
              .from('appointments')
              .update({ status: 'cancelled' })
              .eq('id', appointment.id);
            
            if (appointment.google_calendar_event_id) {
              await this.calendar.deleteEvent(appointment.google_calendar_event_id);
            }
            
            await this.twilio.sendWhatsAppMessage(from, '✅ Tu cita ha sido cancelada. ¿Quieres agendar otra?');
            return;
          } else {
            await this.twilio.sendWhatsAppMessage(from, '❌ No tienes citas activas');
            return;
          }
        }
      }
      
      // COMANDO: VER MI CITA
      if ((bodyLower.includes('mi cita') || bodyLower.includes('mis citas')) && !isTeamMember) {
        const { data: appointments } = await this.supabase.client
          .from('appointments')
          .select('*, properties(*)')
          .eq('lead_phone', cleanPhone)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true });
        
        if (appointments && appointments.length > 0) {
          const cita = appointments[0];
          const fecha = new Date(cita.scheduled_date + 'T' + cita.scheduled_time);
          const mensaje = `📅 Tu próxima cita:\\n\\n🏠 Propiedad: ${cita.properties?.name}\\n📆 Fecha: ${fecha.toLocaleDateString('es-MX')}\\n🕐 Hora: ${fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\\n\\n¿Necesitas cancelar o cambiar?`;
          await this.twilio.sendWhatsAppMessage(from, mensaje);
          return;
        } else {
          await this.twilio.sendWhatsAppMessage(from, '📅 No tienes citas programadas. ¿Te gustaría agendar una?');
          return;
        }
      }
      
      // COMANDO: MOVER LEAD (solo vendedores/asesores)
      if (isTeamMember && bodyLower.includes('mover lead')) {
        const phoneMatch = body.match(/\\+?5?2?1?(\\d{10})/);
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
      
'''

content = content[:insert_pos] + comandos_block + content[insert_pos:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Sistema de comandos WhatsApp implementado:")
print("   - Cliente: 'cancelar mi cita', 'mi cita'")
print("   - Vendedor: 'cancelar cita de +52...', 'mover lead +52... a negociación'")
