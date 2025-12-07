with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el bloque donde se guarda la cita
old_save = '''const appointmentDate = new Date(pending.startTime);
          const appointmentData = {
            lead_id: lead.id,
            lead_phone: cleanPhone,
            vendedor_id: vendedor?.id || null,
            vendedor_name: vendedor?.name || null,
            asesor_id: asesor?.id || null,
            asesor_name: asesor?.name || null,
            property_name: matchedProperty?.name || 'Por definir',
            scheduled_date: appointmentDate.toISOString().split('T')[0],
            scheduled_time: appointmentDate.toTimeString().split(' ')[0],
            google_calendar_event_id: calEvent.id,
            status: 'confirmed'
          };'''

new_save = '''// Extraer fecha y hora del ISO string (formato: 2025-12-06T18:00:00-06:00)
          const [datePart, timePart] = pending.startTime.split('T');
          const hourMinuteSecond = timePart.split('-')[0]; // "18:00:00"
          
          const appointmentData = {
            lead_id: lead.id,
            lead_phone: cleanPhone,
            vendedor_id: vendedor?.id || null,
            vendedor_name: vendedor?.name || null,
            asesor_id: asesor?.id || null,
            asesor_name: asesor?.name || null,
            property_name: matchedProperty?.name || 'Por definir',
            scheduled_date: datePart,
            scheduled_time: hourMinuteSecond,
            google_calendar_event_id: calEvent.id,
            status: 'confirmed'
          };'''

content = content.replace(old_save, new_save)

# Arreglar también el mensaje que se envía al cliente
old_msg = '''await this.twilio.sendWhatsAppMessage(
            from,
            `✅ ¡Cita confirmada!\n\n📅 ${new Date(pending.startTime).toLocaleString('es-MX')}\n👤 ${vendedor?.name || ''}${asesor ? '\n🏦 ' + asesor.name : ''}\n\n¡Te esperamos!`
          );'''

new_msg = '''// Formatear hora en México City timezone
          const [dateStr, timeStr] = pending.startTime.split('T');
          const [year, month, day] = dateStr.split('-');
          const hour = timeStr.split(':')[0];
          const hourNum = parseInt(hour);
          const ampm = hourNum >= 12 ? 'p.m.' : 'a.m.';
          const hour12 = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
          
          await this.twilio.sendWhatsAppMessage(
            from,
            `✅ ¡Cita confirmada!\n\n📅 ${day}/${month}/${year}, ${hour12}:00 ${ampm}\n👤 ${vendedor?.name || ''}${asesor ? '\n🏦 ' + asesor.name : ''}\n\n¡Te esperamos!`
          );'''

content = content.replace(old_msg, new_msg)

# También arreglar notificación a vendedor
old_vendor_msg = '''await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + vendedor.phone,
              `📅 Nueva cita confirmada\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty?.name || 'Por definir'}\n⏰ ${new Date(pending.startTime).toLocaleString('es-MX')}`
            );'''

new_vendor_msg = '''await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + vendedor.phone,
              `📅 Nueva cita confirmada\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty?.name || 'Por definir'}\n⏰ ${day}/${month}/${year}, ${hour12}:00 ${ampm}`
            );'''

content = content.replace(old_vendor_msg, new_vendor_msg)

# Y la del asesor
old_advisor_msg = '''await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + asesor.phone,
              `📅 Nueva cita confirmada\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty?.name || 'Por definir'}\n⏰ ${new Date(pending.startTime).toLocaleString('es-MX')}`
            );'''

new_advisor_msg = '''await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + asesor.phone,
              `📅 Nueva cita confirmada\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty?.name || 'Por definir'}\n⏰ ${day}/${month}/${year}, ${hour12}:00 ${ampm}`
            );'''

content = content.replace(old_advisor_msg, new_advisor_msg)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Timezone arreglado")
