with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# BUSCAR donde se crea la hipoteca (después de notificar al asesor)
insert_point = content.find("console.log('🔔 Asesor notificado');")

if insert_point == -1:
    print("❌ No encontré el punto de inserción")
    exit(1)

# Mover al final de esa línea
insert_point = content.find('\n', insert_point) + 1

# Código para detectar y crear cita
cita_code = '''
          // DETECTAR Y CREAR CITA
          const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?/i);
          const dateMatch = body.match(/(?:mañana|hoy|pasado mañana|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
          
          if (timeMatch && dateMatch && matchedProperty) {
            console.log('🔍 Detectada solicitud de cita:', { time: timeMatch[0], date: dateMatch[0] });
            
            let appointmentDate = new Date();
            const dateText = dateMatch[0].toLowerCase();
            
            // Calcular fecha
            if (dateText === 'mañana') {
              appointmentDate.setDate(appointmentDate.getDate() + 1);
            } else if (dateText.includes('pasado')) {
              appointmentDate.setDate(appointmentDate.getDate() + 2);
            }
            
            // Parsear hora
            let hour = parseInt(timeMatch[1]);
            const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const meridiem = timeMatch[3]?.toLowerCase();
            
            if (meridiem?.includes('pm') && hour < 12) hour += 12;
            if (meridiem?.includes('am') && hour === 12) hour = 0;
            if (!meridiem && hour < 8) hour += 12; // Asumir PM si no especifica
            
            appointmentDate.setHours(hour, minute, 0, 0);
            
            const appointmentData = {
              date: appointmentDate.toISOString().split('T')[0],
              time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
              datetime: appointmentDate.toISOString(),
              dateText: dateText
            };
            
            // Crear cita en DB
            const { data: appointment } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: lead.phone,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: lead.assigned_to,
              scheduled_date: appointmentData.date,
              scheduled_time: appointmentData.time,
              status: 'scheduled',
              appointment_type: 'property_viewing',
              duration_minutes: 60
            }]).select().single();
            
            console.log('📅 Cita creada:', appointment);
            
            // REENVIAR NOTIFICACIÓN AL VENDEDOR CON LA CITA
            if (lead.assigned_to) {
              const { data: vendedor } = await this.supabase.client
                .from('team_members')
                .select('*')
                .eq('id', lead.assigned_to)
                .single();
                
              if (vendedor?.whatsapp_number) {
                const citaMsg = `📅 *CITA AGENDADA*\\n\\n👤 Cliente: ${lead.name}\\n📱 ${lead.phone}\\n🏘️ Propiedad: ${matchedProperty.name}\\n\\n⏰ ${dateText} a las ${hour}:${minute.toString().padStart(2, '0')}${meridiem || ''}\\n\\n💰 Datos financieros:\\n• Ingreso: $${mortgageData.monthly_income?.toLocaleString()}\\n• Deudas: $${mortgageData.current_debt?.toLocaleString()}\\n• Enganche: $${mortgageData.down_payment?.toLocaleString()}`;
                
                await this.twilio.sendMessage(vendedor.whatsapp_number, citaMsg);
                console.log('📅 Vendedor notificado de cita');
              }
            }
            
            // NOTIFICAR TAMBIÉN AL ASESOR DE LA CITA
            const citaMsgAsesor = `📅 *CITA AGENDADA - LEAD CON CRÉDITO*\\n\\n👤 ${lead.name}\\n📱 ${lead.phone}\\n🏘️ ${matchedProperty.name}\\n\\n⏰ ${dateText} a las ${hour}:${minute.toString().padStart(2, '0')}${meridiem || ''}\\n\\n💰 Ingreso: $${mortgageData.monthly_income?.toLocaleString()}\\nDeudas: $${mortgageData.current_debt?.toLocaleString()}\\nEnganche: $${mortgageData.down_payment?.toLocaleString()}`;
            
            await this.twilio.sendMessage('+5212222848084', citaMsgAsesor);
            console.log('📅 Asesor notificado de cita');
          }
'''

content = content[:insert_point] + cita_code + '\n' + content[insert_point:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Detección de citas agregada al sistema actual")
