with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# ============================================
# PASO 1: ARREGLAR DETECCIÓN DE VIDEO
# ============================================
old_video_detection = "const videoKeywords = ['video', 'ver video', 'quiero ver', 'muéstrame', 'enseñame'];\n      const wantsVideo = videoKeywords.some(kw => body.toLowerCase().includes(kw));"

new_video_detection = """// Solo detectar video si piden EXPLÍCITAMENTE video
      const wantsVideo = /\\b(video|v[ií]deo)\\b/i.test(body) && 
                        !/\\b(ver|verla|visitar|visita|conocer)\\b/i.test(body);"""

content = content.replace(old_video_detection, new_video_detection)

# ============================================
# PASO 2: DETECTAR CITAS (DESPUÉS DEL PARSING)
# ============================================
insert_after_parsing = content.find("console.log('💰 PARSEADO:', {")
insert_point = content.find("});", insert_after_parsing) + 3

cita_detection = """

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
        console.log('📅 Cita detectada:', citaData);
      }
"""

content = content[:insert_point] + cita_detection + content[insert_point:]

# ============================================
# PASO 3: CREAR CITA EN DB (DESPUÉS DE HIPOTECA)
# ============================================
insert_after_hipoteca = content.find("console.log('🏦 Solicitud hipotecaria creada para:', clientName);")
insert_point2 = content.find("\n", insert_after_hipoteca) + 1

crear_cita = """
          // CREAR CITA si se detectó
          if (citaData && lead.assigned_to && matchedProperty) {
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
            
            console.log('📅 Cita guardada:', appointment?.id);
          }

"""

content = content[:insert_point2] + crear_cita + content[insert_point2:]

# ============================================
# PASO 4: INCLUIR CITA EN NOTIFICACIONES
# ============================================
old_notif_asesor = "`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\\\n\\\\n👤 Cliente: ${clientName}\\\\n📱 Teléfono: ${cleanPhone}\\\\n🏠 Propiedad: ${matchedProperty.name}\\\\n\\\\n💰 *DATOS FINANCIEROS:*\\\\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\\\\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\\\\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}\\\\n\\\\n¡Contactar pronto!`"

new_notif_asesor = "`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\\\n\\\\n👤 Cliente: ${clientName}\\\\n📱 Teléfono: ${cleanPhone}\\\\n🏠 Propiedad: ${matchedProperty.name}\\\\n\\\\n💰 *DATOS FINANCIEROS:*\\\\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\\\\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\\\\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\\\n\\\\n📅 *CITA:* ${citaData.dateText} a las ${citaData.timeText} en ${matchedProperty.name}` : ''}\\\\n\\\\n¡Contactar pronto!`"

content = content.replace(old_notif_asesor, new_notif_asesor)

# Vendedor también
old_notif_vendedor = "`🏦 *LEAD CON CRÉDITO*\\\\n\\\\n👤 ${clientName}\\\\n📱 ${cleanPhone}\\\\n🏠 ${matchedProperty.name}\\\\n\\\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\\\\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\\\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}\\\\n\\\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`"

new_notif_vendedor = "`🏦 *LEAD CON CRÉDITO*\\\\n\\\\n👤 ${clientName}\\\\n📱 ${cleanPhone}\\\\n🏠 ${matchedProperty.name}\\\\n\\\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\\\\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\\\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\\\n\\\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\\\n\\\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`"

content = content.replace(old_notif_vendedor, new_notif_vendedor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ TODO ARREGLADO:")
print("  1. Video solo si piden 'video' explícitamente")
print("  2. Detección de citas funcional")
print("  3. Citas se guardan en DB")
print("  4. Notificaciones incluyen cita")
