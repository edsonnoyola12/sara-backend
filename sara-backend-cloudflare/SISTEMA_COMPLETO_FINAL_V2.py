import re

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. ENCONTRAR Y REEMPLAZAR EL PROMPT COMPLETO
old_prompt_start = "const systemPrompt = `Eres SARA"
prompt_start_pos = content.find(old_prompt_start)

if prompt_start_pos == -1:
    print("❌ No encontré el systemPrompt")
    exit(1)

# Encontrar el cierre del prompt (buscar el ` que cierra)
prompt_end_pos = content.find('`;', prompt_start_pos)

if prompt_end_pos == -1:
    print("❌ No encontré el final del prompt")
    exit(1)

# Nuevo prompt
new_prompt = '''const systemPrompt = `Eres SARA, asistente virtual de Grupo Santa Rita.

🎯 TU MISIÓN: Calificar leads y agendar citas

📋 INFORMACIÓN A CAPTURAR (en orden):
1. Nombre
2. ¿Qué propiedad le interesa? (Andes, Prados, Ciprés, etc.)
3. ¿Es para vivir o inversión?
4. ¿Necesita financiamiento/crédito?
5. Si SÍ necesita crédito: ingreso mensual, deudas, enganche
6. Cita: fecha y hora para visitar

✅ REGLAS DE CALIFICACIÓN:
- LEAD DE CONTADO (sin financiamiento): Nombre + Propiedad + Cita = LISTO
- LEAD DE CRÉDITO (con financiamiento): Nombre + Propiedad + Datos financieros + Cita = LISTO

🔔 CUANDO TENGAS TODA LA INFO:
Envía este mensaje EXACTO (yo lo detectaré):
"LEAD_QUALIFIED|{tipo}|{tiene_cita}"

Donde:
- tipo: "cash" o "credit"
- tiene_cita: "yes" o "no"

Ejemplo: "LEAD_QUALIFIED|credit|yes"

💬 ESTILO DE COMUNICACIÓN:
- Habla como mexicano amigable: "¿Qué tal?", "¿Te late?", "Perfecto"
- Mensajes cortos (máximo 2 preguntas)
- Si dan datos financieros → confirmar y agendar INMEDIATAMENTE
- Usa urgencia: "Solo quedan 3 unidades"
- NUNCA pidas email/dirección
- Cierra hacia cita: "¿Te viene bien mañana a las 10am?"

❌ NUNCA:
- Listas largas
- Preguntar lo que ya sabes
- Explicaciones técnicas sin que pregunten
- Decir "¿necesitas algo más?" (siempre cierra hacia cita)

Propiedades disponibles: ${JSON.stringify(properties.map(p => ({ name: p.name, price: p.price })))}
Hoy es: ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;'''

# Reemplazar el prompt
content = content[:prompt_start_pos] + new_prompt + content[prompt_end_pos:]

# 2. AGREGAR DETECCIÓN DESPUÉS DE LA RESPUESTA DE SARA
detection_code = '''
      // DETECTAR SI SARA CALIFICÓ EL LEAD
      const qualifiedMatch = aiResponse.match(/LEAD_QUALIFIED\\|(\\w+)\\|(\\w+)/);
      
      if (qualifiedMatch) {
        const leadType = qualifiedMatch[1]; // 'cash' o 'credit'
        const hasAppointment = qualifiedMatch[2] === 'yes';
        
        console.log('🎯 Lead calificado por SARA:', { leadType, hasAppointment });
        
        // Extraer datos de la conversación completa
        const fullConversation = lead.conversation_history.map((msg: any) => msg.content).join(' ');
        
        // Parsear datos financieros si es crédito
        let mortgageData: any = null;
        if (leadType === 'credit') {
          const parseAmount = (pattern: RegExp, text: string): number => {
            const match = text.match(pattern);
            if (!match) return 0;
            let amount = parseFloat(match[1].replace(/,/g, ''));
            const context = text.substring(match.index || 0, (match.index || 0) + 100);
            if (/millón(?:es)?/i.test(context)) {
              amount *= 1000000;
            } else if (/\\bmil\\b/i.test(context) && !/millón/i.test(context)) {
              amount *= 1000;
            }
            return amount;
          };
          
          mortgageData = {
            monthly_income: parseAmount(/([\\d,\\.]+)\\s*(?:mil|millones?|millón(?:es)?)?.*?(?:ingreso|gano|salario)/i, fullConversation),
            current_debt: parseAmount(/([\\d,\\.]+)\\s*(?:mil|millones?|millón(?:es)?)?.*?(?:deuda|adeudo)/i, fullConversation),
            down_payment: parseAmount(/([\\d,\\.]+)\\s*(?:mil|millones?|millón(?:es)?)?.*?(?:enganche|ahorro)/i, fullConversation)
          };
          
          console.log('💰 Datos financieros parseados:', mortgageData);
        }
        
        // Parsear cita si existe
        let appointmentData: any = null;
        if (hasAppointment) {
          const timeMatch = fullConversation.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?/i);
          const dateMatch = fullConversation.match(/(?:mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
          
          if (timeMatch && dateMatch) {
            let appointmentDate = new Date();
            const dateText = dateMatch[0].toLowerCase();
            
            if (dateText === 'mañana') {
              appointmentDate.setDate(appointmentDate.getDate() + 1);
            } else if (dateText === 'pasado') {
              appointmentDate.setDate(appointmentDate.getDate() + 2);
            }
            
            let hour = parseInt(timeMatch[1]);
            const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const meridiem = timeMatch[3]?.toLowerCase();
            
            if (meridiem?.includes('pm') && hour < 12) hour += 12;
            if (meridiem?.includes('am') && hour === 12) hour = 0;
            appointmentDate.setHours(hour, minute, 0, 0);
            
            appointmentData = {
              date: appointmentDate.toISOString().split('T')[0],
              time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
              datetime: appointmentDate.toISOString(),
              dateText: dateText
            };
            
            console.log('📅 Cita parseada:', appointmentData);
          }
        }
        
        // CREAR HIPOTECA SI ES CRÉDITO
        if (leadType === 'credit' && mortgageData && matchedProperty) {
          const { data: mortgage } = await this.supabase.client.from('mortgage_applications').insert([{
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: lead.phone,
            property_id: matchedProperty.id,
            property_name: matchedProperty.name,
            monthly_income: mortgageData.monthly_income,
            current_debt: mortgageData.current_debt,
            down_payment: mortgageData.down_payment,
            assigned_advisor_id: '603ccf06-3f2e-4443-af1c-cd3315fd0eb7',
            assigned_advisor_name: 'Edson Noyola - Asesor Hipotecario',
            status: 'pending'
          }]).select().single();
          
          console.log('🏦 Hipoteca creada:', mortgage);
        }
        
        // CREAR CITA SI EXISTE
        if (appointmentData && matchedProperty && lead.assigned_to) {
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
          
          console.log('📅 Cita creada en DB:', appointment);
        }
        
        // NOTIFICACIONES INTELIGENTES
        const { data: vendedor } = await this.supabase.client
          .from('team_members')
          .select('*')
          .eq('id', lead.assigned_to)
          .single();
        
        let notificationMessage = `🏠 *NUEVO LEAD CALIFICADO*\\n\\n`;
        notificationMessage += `👤 Cliente: ${lead.name}\\n`;
        notificationMessage += `📱 Teléfono: ${lead.phone}\\n`;
        notificationMessage += `🏘️ Propiedad: ${matchedProperty?.name || 'N/A'}\\n\\n`;
        
        if (leadType === 'credit' && mortgageData) {
          notificationMessage += `💰 *DATOS FINANCIEROS:*\\n`;
          notificationMessage += `• Ingreso mensual: $${mortgageData.monthly_income?.toLocaleString()}\\n`;
          notificationMessage += `• Deudas actuales: $${mortgageData.current_debt?.toLocaleString()}\\n`;
          notificationMessage += `• Enganche disponible: $${mortgageData.down_payment?.toLocaleString()}\\n\\n`;
        }
        
        if (appointmentData) {
          notificationMessage += `📅 *CITA AGENDADA:*\\n`;
          notificationMessage += `• ${appointmentData.dateText} a las ${appointmentData.time.substring(0, 5)}\\n\\n`;
        }
        
        // NOTIFICAR VENDEDOR SIEMPRE
        if (vendedor?.whatsapp_number) {
          await this.twilio.sendMessage(vendedor.whatsapp_number, notificationMessage);
          console.log('🔔 Vendedor notificado con lead completo');
        }
        
        // NOTIFICAR ASESOR SI ES CRÉDITO
        if (leadType === 'credit') {
          await this.twilio.sendMessage(
            '+5212222848084',
            notificationMessage + '⚠️ Lead requiere asesoría hipotecaria'
          );
          console.log('🔔 Asesor hipotecario notificado');
        }
      }
'''

# Buscar dónde insertar (después de enviar el mensaje de SARA al usuario)
insert_point = content.find('await this.twilio.sendWhatsAppMessage(from, aiResponse);')
if insert_point == -1:
    print("❌ No encontré dónde insertar detección")
    exit(1)

# Insertar DESPUÉS del sendWhatsAppMessage
insert_point = content.find('\n', insert_point) + 1

content = content[:insert_point] + detection_code + '\n' + content[insert_point:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Sistema completo implementado correctamente")
