import re

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. MODIFICAR PROMPT DE SARA para que capture TODO y decida cuándo notificar
prompt_section = content.find("You are SARA")
if prompt_section == -1:
    print("❌ No encontré el prompt")
    exit(1)

# Encontrar el final del prompt (siguiente comilla triple)
prompt_end = content.find('`', prompt_section + 100)

new_prompt = '''You are SARA, the AI assistant for Grupo Santa Rita real estate.

🎯 YOUR MISSION: Qualify leads and schedule appointments

📋 INFORMATION TO CAPTURE (in order):
1. Name
2. Which property interests them (Andes, Prados, Ciprés, etc.)
3. Is it for living or investment?
4. Do they need financing/mortgage?
5. If YES to financing: monthly income, debts, down payment
6. Appointment: date and time to visit

✅ QUALIFICATION RULES:
- CASH LEAD (no financing): Name + Property + Appointment = READY
- CREDIT LEAD (needs financing): Name + Property + Financial data + Appointment = READY

🔔 WHEN YOU HAVE ALL INFO:
Send this EXACT message (Claude will detect it):
"LEAD_QUALIFIED|{type}|{has_appointment}"

Where:
- type: "cash" or "credit"
- has_appointment: "yes" or "no"

Example: "LEAD_QUALIFIED|credit|yes"

💬 COMMUNICATION STYLE:
- Speak like a friendly Mexican: "¿Qué tal?", "¿Te late?", "Perfecto"
- Short messages (max 2 questions)
- If they give financial data → confirm and schedule IMMEDIATELY
- Use urgency: "Solo quedan 3 unidades"
- NEVER ask for email/address
- Close towards appointment: "¿Te viene bien mañana a las 10am?"

❌ NEVER:
- Send long lists
- Ask what you already know
- Give technical explanations unless asked
- Say "¿necesitas algo más?" (always close to appointment)

Current properties available: {{properties}}
Today is: {{currentDate}}'''

content = content[:prompt_section] + new_prompt + content[prompt_end:]

# 2. AGREGAR DETECCIÓN DE LEAD_QUALIFIED
detection_code = '''
    // DETECTAR SI SARA CALIFICÓ EL LEAD
    const qualifiedMatch = aiResponse.match(/LEAD_QUALIFIED\|(\w+)\|(\w+)/);
    
    if (qualifiedMatch) {
      const leadType = qualifiedMatch[1]; // 'cash' o 'credit'
      const hasAppointment = qualifiedMatch[2] === 'yes';
      
      console.log('🎯 Lead calificado:', { leadType, hasAppointment });
      
      // Extraer datos de la conversación completa
      const fullConversation = lead.conversation_history.map(msg => msg.content).join(' ');
      
      // Parsear datos financieros si es crédito
      let mortgageData: any = null;
      if (leadType === 'credit') {
        const incomeMatch = fullConversation.match(/(\d[\d,\.]*)\s*(?:mil|millones?|millón(?:es)?)?.*?(?:ingreso|gano|salario)/i);
        const debtMatch = fullConversation.match(/(\d[\d,\.]*)\s*(?:mil|millones?|millón(?:es)?)?.*?(?:deuda|adeudo)/i);
        const downMatch = fullConversation.match(/(\d[\d,\.]*)\s*(?:mil|millones?|millón(?:es)?)?.*?(?:enganche|ahorro)/i);
        
        const parseAmount = (match: RegExpMatchArray | null, text: string): number => {
          if (!match) return 0;
          let amount = parseFloat(match[1].replace(/,/g, ''));
          const context = text.substring(match.index || 0, (match.index || 0) + 100);
          if (/millón(?:es)?/i.test(context)) {
            amount *= 1000000;
          } else if (/\bmil\b/i.test(context) && !/millón/i.test(context)) {
            amount *= 1000;
          }
          return amount;
        };
        
        mortgageData = {
          monthly_income: parseAmount(incomeMatch, fullConversation),
          current_debt: parseAmount(debtMatch, fullConversation),
          down_payment: parseAmount(downMatch, fullConversation)
        };
      }
      
      // Parsear cita si existe
      let appointmentData: any = null;
      if (hasAppointment) {
        const timeMatch = fullConversation.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|a\.m\.|p\.m\.)?/i);
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
          appointmentDate.setHours(hour, minute, 0, 0);
          
          appointmentData = {
            date: appointmentDate.toISOString().split('T')[0],
            time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
            datetime: appointmentDate.toISOString()
          };
        }
      }
      
      // CREAR/ACTUALIZAR TODO DE UNA VEZ
      if (leadType === 'credit' && mortgageData) {
        // Crear hipoteca
        const { data: mortgage } = await this.supabase.client.from('mortgage_applications').insert([{
          lead_id: lead.id,
          lead_name: lead.name,
          lead_phone: lead.phone,
          property_id: matchedProperty?.id,
          property_name: matchedProperty?.name,
          monthly_income: mortgageData.monthly_income,
          current_debt: mortgageData.current_debt,
          down_payment: mortgageData.down_payment,
          assigned_advisor_id: '603ccf06-3f2e-4443-af1c-cd3315fd0eb7',
          assigned_advisor_name: 'Edson Noyola - Asesor Hipotecario',
          status: 'pending'
        }]).select().single();
        
        console.log('🏦 Hipoteca creada:', mortgage);
      }
      
      // Crear cita si existe
      if (appointmentData && matchedProperty) {
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
      notificationMessage += `🏘️ Propiedad: ${matchedProperty?.name}\\n\\n`;
      
      if (leadType === 'credit' && mortgageData) {
        notificationMessage += `💰 *DATOS FINANCIEROS:*\\n`;
        notificationMessage += `• Ingreso mensual: $${mortgageData.monthly_income?.toLocaleString()}\\n`;
        notificationMessage += `• Deudas actuales: $${mortgageData.current_debt?.toLocaleString()}\\n`;
        notificationMessage += `• Enganche disponible: $${mortgageData.down_payment?.toLocaleString()}\\n\\n`;
      }
      
      if (appointmentData) {
        notificationMessage += `📅 *CITA AGENDADA:*\\n`;
        notificationMessage += `• Fecha: ${appointmentData.date}\\n`;
        notificationMessage += `• Hora: ${appointmentData.time}\\n\\n`;
      }
      
      // NOTIFICAR VENDEDOR SIEMPRE
      if (vendedor?.whatsapp_number) {
        await this.twilio.sendMessage(vendedor.whatsapp_number, notificationMessage);
        console.log('🔔 Vendedor notificado');
      }
      
      // NOTIFICAR ASESOR SI ES CRÉDITO
      if (leadType === 'credit') {
        await this.twilio.sendMessage(
          '+5212222848084',
          notificationMessage + '\\n⚠️ Lead requiere asesoría hipotecaria'
        );
        console.log('🔔 Asesor hipotecario notificado');
      }
    }
'''

# Buscar dónde insertar (después de crear el lead y antes del return)
insert_point = content.find('return new Response(')
if insert_point == -1:
    print("❌ No encontré punto de inserción")
    exit(1)

content = content[:insert_point] + detection_code + '\n\n    ' + content[insert_point:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Sistema completo implementado")
