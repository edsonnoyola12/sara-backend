with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. Arreglar INSERT de appointments - agregar lead_phone
old_insert = '''await this.supabase.client.from('appointments').insert([{
            lead_id: lead.id,
            lead_name: clientName,
            lead_phone: cleanPhone,'''

# Ya está bien, pero verificar que se esté ejecutando

# 2. Arreglar detección de cancelación - debe buscar por teléfono directamente
old_cancel = '''if (/cancelar cita|cancelar|no puedo/i.test(body)) {
        const { data: appointment } = await this.supabase.client
          .from('appointments')
          .select('*')
          .eq('lead_phone', cleanPhone)
          .eq('status', 'confirmed')
          .order('scheduled_at', { ascending: false })
          .limit(1)
          .single();'''

new_cancel = '''if (/cancelar cita|cancelar|no puedo/i.test(body)) {
        console.log('🔍 Buscando cita para cancelar:', cleanPhone);
        
        const { data: appointments } = await this.supabase.client
          .from('appointments')
          .select('*')
          .eq('lead_id', lead.id)
          .eq('status', 'confirmed')
          .order('scheduled_at', { ascending: false });
        
        const appointment = appointments && appointments.length > 0 ? appointments[0] : null;
        console.log('📋 Cita encontrada:', appointment);'''

content = content.replace(old_cancel, new_cancel)

# 3. Agregar logs para debugging del INSERT
old_insert_block = '''const calEvent = await this.calendar.createEvent(
          summary,
          description,
          pending.startTime,
          pending.endTime,
          attendees
        );
        
        if (calEvent && calEvent.id) {
          // Guardar en Supabase
          await this.supabase.client.from('appointments').insert([{'''

new_insert_block = '''const calEvent = await this.calendar.createEvent(
          summary,
          description,
          pending.startTime,
          pending.endTime,
          attendees
        );
        
        console.log('📅 Evento de calendar creado:', calEvent);
        
        if (calEvent && calEvent.id) {
          // Guardar en Supabase
          const appointmentData = {'''

content = content.replace(old_insert_block, new_insert_block)

# Modificar el objeto de insert para tener logs
old_obj = '''const appointmentData = {
            lead_id: lead.id,
            lead_name: clientName,
            lead_phone: cleanPhone,
            vendedor_id: vendedor?.id || null,
            vendedor_name: vendedor?.name || null,
            asesor_id: asesor?.id || null,
            asesor_name: asesor?.name || null,
            property_name: matchedProperty?.name || 'Por definir',
            scheduled_at: pending.startTime,
            google_event_vendedor_id: calEvent.id,
            status: 'confirmed'
          }]);'''

new_obj = '''const appointmentData = {
            lead_id: lead.id,
            lead_name: clientName,
            lead_phone: cleanPhone,
            vendedor_id: vendedor?.id || null,
            vendedor_name: vendedor?.name || null,
            asesor_id: asesor?.id || null,
            asesor_name: asesor?.name || null,
            property_name: matchedProperty?.name || 'Por definir',
            scheduled_at: pending.startTime,
            google_event_vendedor_id: calEvent.id,
            status: 'confirmed'
          };
          
          console.log('💾 Guardando cita:', appointmentData);
          
          const { data: savedAppointment, error: appointmentError } = await this.supabase.client
            .from('appointments')
            .insert([appointmentData])
            .select()
            .single();
          
          if (appointmentError) {
            console.error('❌ Error guardando cita:', appointmentError);
          } else {
            console.log('✅ Cita guardada:', savedAppointment);
          }'''

content = content.replace(old_obj, new_obj)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Arreglado sistema de citas")
