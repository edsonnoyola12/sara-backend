with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

old_block = '''        console.log('🔍 Buscando citas para:', cleanPhone);
        
        const { data: appointments, error } = await this.supabase.client
          .from('appointments')
          .select('*, properties(*)')
          .eq('lead_phone', cleanPhone)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true });
        
        console.log('📅 Citas encontradas:', appointments?.length, 'Error:', error);
        
        if (appointments && appointments.length > 0) {
          const cita = appointments[0];
          const fecha = new Date(cita.scheduled_date + 'T' + cita.scheduled_time);
          const mensaje = `📅 Tu próxima cita:\\n\\n🏠 Propiedad: ${cita.properties?.name}\\n📆 Fecha: ${fecha.toLocaleDateString('es-MX')}\\n🕐 Hora: ${fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\\n\\n¿Necesitas cancelar o cambiar?`;
          await this.twilio.sendWhatsAppMessage(from, mensaje);
          return;
        } else {
          await this.twilio.sendWhatsAppMessage(from, '📅 No tienes citas programadas. ¿Te gustaría agendar una?');
          return;
        }'''

new_block = '''        console.log('🔍 Buscando citas para:', cleanPhone);
        
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
          const mensaje = `📅 Tu próxima cita:\\n\\n🏠 Propiedad: ${cita.property_name}\\n📆 Fecha: ${fecha.toLocaleDateString('es-MX')}\\n🕐 Hora: ${fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\\n\\n¿Necesitas cancelar o cambiar?`;
          await this.twilio.sendWhatsAppMessage(from, mensaje);
          return;
        } else {
          await this.twilio.sendWhatsAppMessage(from, '📅 No tienes citas programadas. ¿Te gustaría agendar una?');
          return;
        }'''

content = content.replace(old_block, new_block)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Búsqueda de citas arreglada (sin join)")
