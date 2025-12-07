import re

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el log de PARSEADO
match = re.search(r"(console\.log\('💰 PARSEADO:', \{[^}]+\}\);)", content)
if not match:
    print("❌ No encontré el log de PARSEADO")
    exit(1)

insert_pos = match.end()

codigo_citas = '''

      // DETECTAR CITA
      const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm)/i);
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
'''

content = content[:insert_pos] + codigo_citas + content[insert_pos:]

# Guardar cita
match2 = re.search(r"(console\.log\('🏦 Solicitud hipotecaria creada para:', clientName\);)", content)
if match2:
    insert_pos2 = match2.end()
    codigo_guardar = '''

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
'''
    content = content[:insert_pos2] + codigo_guardar + content[insert_pos2:]

# Notificaciones
content = content.replace(
    "\\n\\n¡Contactar pronto!`",
    "${citaData ? `\\n\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\n\\n¡Contactar pronto!`"
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

# VERIFICAR
with open('src/handlers/whatsapp.ts', 'r') as f:
    verify = f.read()
    
if "CITA DETECTADA" in verify and "const timeMatch" in verify:
    print("✅ Código de citas agregado y VERIFICADO")
else:
    print("❌ ERROR: Código no se agregó correctamente")
    exit(1)
