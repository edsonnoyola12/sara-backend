with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. DECLARAR variable citaData
insert_at = content.find("let mortgageData: any = {")
if insert_at == -1:
    print("❌ No encontré mortgageData")
    exit(1)

declare_cita = "let citaData: any = null;\n      "
content = content[:insert_at] + declare_cita + content[insert_at:]

# 2. DETECTAR CITA (después del log de parseado)
insert_after = content.find("console.log('💰 PARSEADO:', {")
insert_after = content.find("});", insert_after) + 3

detect_cita = """

      // DETECTAR CITA
      const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm)/i);
      const dateMatch = body.match(/(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
      
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
        console.log('📅 Cita detectada:', citaData);
      }
"""

content = content[:insert_after] + detect_cita + content[insert_after:]

# 3. GUARDAR CITA (después de crear hipoteca)
insert_after2 = content.find("console.log('🏦 Solicitud hipotecaria creada para:', clientName);")
if insert_after2 != -1:
    insert_after2 = content.find("\n", insert_after2) + 1
    
    save_cita = """
          // GUARDAR CITA
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
            console.log('📅 Cita guardada:', appt?.id);
          }

"""
    
    content = content[:insert_after2] + save_cita + content[insert_after2:]

# 4. INCLUIR EN NOTIFICACIONES
old_asesor = "\\\\n\\\\n¡Contactar pronto!`"
new_asesor = "${citaData ? `\\\\n\\\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\\\n\\\\n¡Contactar pronto!`"
content = content.replace(old_asesor, new_asesor)

old_vendedor = "\\\\n\\\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`"
new_vendedor = "${citaData ? `\\\\n\\\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\\\n\\\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`"
content = content.replace(old_vendedor, new_vendedor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Sistema de citas agregado COMPLETO")
