import re

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# ========================================
# PASO 1: NUEVO PROMPT DE SARA
# ========================================

# Encontrar el systemPrompt actual
prompt_start = content.find('const systemPrompt = `')
prompt_end = content.find('`;', prompt_start)

new_prompt = '''const systemPrompt = `Eres SARA, asistente de Grupo Santa Rita.

🎯 OBJETIVO: Calificar leads y agendar citas

📝 FLUJO DE CALIFICACIÓN:
1. Saludo + capturar nombre
2. ¿Qué propiedad te interesa?
3. ¿Necesitas financiamiento/crédito?

SI NECESITA CRÉDITO:
4. ¿Cuánto ganas al mes?
5. ¿Tienes deudas? ¿Cuánto?
6. ¿Cuánto tienes de enganche?
7. ¿Cuándo quieres ver la propiedad?

SI NO NECESITA CRÉDITO:
4. ¿Cuándo quieres ver la propiedad?

🔔 CUANDO TENGAS TODO:
Termina tu mensaje con EXACTAMENTE esto en una línea separada:

Para crédito CON cita:
[READY:credit:yes:FECHA:HORA]

Para crédito SIN cita:
[READY:credit:no]

Para contado CON cita:
[READY:cash:yes:FECHA:HORA]

Para contado SIN cita:
[READY:cash:no]

Ejemplos:
- "¡Perfecto! Te agendo para mañana a las 10am\\n[READY:credit:yes:mañana:10am]"
- "Excelente, con esos datos te contacta el asesor\\n[READY:credit:no]"

💬 ESTILO:
- Mexicano natural: "¿Qué tal?", "¿Te late?", "Órale"
- Corto (max 2 preguntas)
- Si dan datos → confirma y agenda INMEDIATO
- Urgencia: "Solo 3 unidades disponibles"
- NUNCA pidas email/dirección

Propiedades: ${JSON.stringify(properties.map(p => ({ name: p.name, price: p.price })))}
Hoy: ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;'''

content = content[:prompt_start] + new_prompt + content[prompt_end:]

# ========================================
# PASO 2: ELIMINAR TODO EL CÓDIGO VIEJO DE DETECCIÓN
# ========================================

# Eliminar bloque de parsing financiero viejo (después de matchedProperty)
old_parsing_start = content.find('// Detectar necesidad de hipoteca')
if old_parsing_start != -1:
    old_parsing_end = content.find('// Si NO necesita crédito', old_parsing_start)
    if old_parsing_end != -1:
        content = content[:old_parsing_start] + content[old_parsing_end:]

# Eliminar bloque de detección de cita viejo
old_cita_start = content.find('// DETECTAR SOLICITUD DE CITA')
if old_cita_start != -1:
    old_cita_end = content.find('// Si NO necesita crédito', old_cita_start)
    if old_cita_end == -1:
        old_cita_end = content.find('// NOTIFICAR AL VENDEDOR', old_cita_start)
    if old_cita_end != -1:
        content = content[:old_cita_start] + content[old_cita_end:]

# ========================================
# PASO 3: AGREGAR NUEVA LÓGICA DE DETECCIÓN
# ========================================

# Buscar punto de inserción (después de enviar respuesta de SARA)
insert_point = content.find('await this.twilio.sendWhatsAppMessage(from, aiResponse);')
insert_point = content.find('\\n', insert_point) + 1

new_logic = '''
      // ========================================
      // DETECCIÓN DE LEAD CALIFICADO POR SARA
      // ========================================
      const readyMatch = aiResponse.match(/\\[READY:(\\w+):(yes|no)(?::([^:]+):([^\\]]+))?\\]/);
      
      if (readyMatch) {
        const leadType = readyMatch[1]; // 'credit' o 'cash'
        const hasCita = readyMatch[2] === 'yes';
        const fechaTexto = readyMatch[3]; // 'mañana', 'hoy', etc.
        const horaTexto = readyMatch[4]; // '10am', '14:00', etc.
        
        console.log('✅ SARA CALIFICÓ LEAD:', { leadType, hasCita, fechaTexto, horaTexto });
        
        // ========================================
        // PARSEAR DATOS FINANCIEROS
        // ========================================
        let financialData = null;
        
        if (leadType === 'credit') {
          const fullConvo = lead.conversation_history.map((msg: any) => msg.content).join(' ');
          
          // Helper para parsear montos
          const parseMoneyAmount = (keyword: string): number => {
            // Buscar patrón: número + (mil/millones) + cerca de keyword
            const patterns = [
              new RegExp(`(\\\\d[\\\\d,\\\\.]*)\\\\s*(millones?|millón(?:es)?)\\\\s*(?:de\\\\s+)?(?:pesos\\\\s+)?(?:de\\\\s+)?${keyword}`, 'i'),
              new RegExp(`(\\\\d[\\\\d,\\\\.]*)\\\\s*(?:mil)\\\\s*(?:pesos\\\\s+)?(?:de\\\\s+)?${keyword}`, 'i'),
              new RegExp(`${keyword}[^\\\\d]{0,20}(\\\\d[\\\\d,\\\\.]*)\\\\s*(millones?|millón(?:es)?|mil)?`, 'i')
            ];
            
            for (const pattern of patterns) {
              const match = fullConvo.match(pattern);
              if (match) {
                let amount = parseFloat(match[1].replace(/,/g, ''));
                const multiplier = match[2]?.toLowerCase();
                
                if (multiplier && /millón(?:es)?/.test(multiplier)) {
                  amount *= 1000000;
                } else if (multiplier && /mil/.test(multiplier)) {
                  amount *= 1000;
                }
                
                return amount;
              }
            }
            return 0;
          };
          
          // Detectar "no tengo deudas"
          const hasNoDebt = /(?:no|sin|cero|nada)\\s+(?:tengo|tiene)?\\s*(?:deuda|adeudo)/i.test(fullConvo);
          
          financialData = {
            monthly_income: parseMoneyAmount('(?:gano|ingreso|salario|mensual)'),
            current_debt: hasNoDebt ? 0 : parseMoneyAmount('(?:deuda|adeudo|debo)'),
            down_payment: parseMoneyAmount('(?:enganche|ahorro|tengo\\\\s+para)')
          };
          
          console.log('💰 Datos financieros:', financialData);
        }
        
        // ========================================
        // PARSEAR CITA
        // ========================================
        let citaData = null;
        
        if (hasCita && fechaTexto && horaTexto) {
          let appointmentDate = new Date();
          
          // Parsear fecha
          const fecha = fechaTexto.toLowerCase();
          if (fecha.includes('mañana')) {
            appointmentDate.setDate(appointmentDate.getDate() + 1);
          } else if (fecha.includes('pasado')) {
            appointmentDate.setDate(appointmentDate.getDate() + 2);
          } else if (fecha === 'hoy') {
            // ya está en hoy
          }
          
          // Parsear hora
          const horaMatch = horaTexto.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?/i);
          if (horaMatch) {
            let hour = parseInt(horaMatch[1]);
            const minute = horaMatch[2] ? parseInt(horaMatch[2]) : 0;
            const meridiem = horaMatch[3]?.toLowerCase();
            
            if (meridiem === 'pm' && hour < 12) hour += 12;
            if (meridiem === 'am' && hour === 12) hour = 0;
            if (!meridiem && hour < 8) hour += 12;
            
            appointmentDate.setHours(hour, minute, 0, 0);
            
            citaData = {
              date: appointmentDate.toISOString().split('T')[0],
              time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
              dateText: fecha,
              timeText: horaTexto
            };
            
            console.log('📅 Cita parseada:', citaData);
          }
        }
        
        // ========================================
        // CREAR REGISTROS EN DB
        // ========================================
        
        // 1. Crear hipoteca si es crédito
        let mortgage = null;
        if (leadType === 'credit' && financialData && matchedProperty) {
          const { data: mtg } = await this.supabase.client.from('mortgage_applications').insert([{
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: lead.phone,
            property_id: matchedProperty.id,
            property_name: matchedProperty.name,
            monthly_income: financialData.monthly_income,
            current_debt: financialData.current_debt,
            down_payment: financialData.down_payment,
            assigned_advisor_id: '603ccf06-3f2e-4443-af1c-cd3315fd0eb7',
            assigned_advisor_name: 'Edson Noyola - Asesor Hipotecario',
            status: 'pending'
          }]).select().single();
          
          mortgage = mtg;
          console.log('🏦 Hipoteca creada:', mortgage?.id);
        }
        
        // 2. Crear cita si existe
        let appointment = null;
        if (citaData && matchedProperty && lead.assigned_to) {
          const { data: appt } = await this.supabase.client.from('appointments').insert([{
            lead_id: lead.id,
            lead_phone: lead.phone,
            property_id: matchedProperty.id,
            property_name: matchedProperty.name,
            vendedor_id: lead.assigned_to,
            scheduled_date: citaData.date,
            scheduled_time: citaData.time,
            status: 'scheduled',
            appointment_type: 'property_viewing',
            duration_minutes: 60
          }]).select().single();
          
          appointment = appt;
          console.log('📅 Cita creada:', appointment?.id);
        }
        
        // ========================================
        // NOTIFICACIONES COMPLETAS
        // ========================================
        
        // Obtener vendedor
        const { data: vendedor } = await this.supabase.client
          .from('team_members')
          .select('*')
          .eq('id', lead.assigned_to)
          .single();
        
        // Construir mensaje de notificación
        let notification = `🏠 *LEAD CALIFICADO*\\n\\n`;
        notification += `👤 ${lead.name}\\n`;
        notification += `📱 ${lead.phone}\\n`;
        notification += `🏘️ ${matchedProperty?.name || 'Propiedad de interés'}\\n`;
        notification += `💼 Tipo: ${leadType === 'credit' ? 'CON CRÉDITO' : 'DE CONTADO'}\\n\\n`;
        
        if (financialData) {
          notification += `💰 *FINANZAS:*\\n`;
          notification += `• Ingreso: $${financialData.monthly_income.toLocaleString()}\\n`;
          notification += `• Deudas: $${financialData.current_debt.toLocaleString()}\\n`;
          notification += `• Enganche: $${financialData.down_payment.toLocaleString()}\\n\\n`;
        }
        
        if (citaData) {
          notification += `📅 *CITA AGENDADA:*\\n`;
          notification += `• ${citaData.dateText} a las ${citaData.timeText}\\n`;
          notification += `• Ubicación: ${matchedProperty?.name}\\n\\n`;
        }
        
        // Enviar a vendedor
        if (vendedor?.whatsapp_number) {
          await this.twilio.sendWhatsAppMessage(vendedor.whatsapp_number, notification);
          console.log('🔔 Vendedor notificado');
        }
        
        // Enviar a asesor si es crédito
        if (leadType === 'credit') {
          await this.twilio.sendWhatsAppMessage(
            '+5212222848084',
            notification + '⚠️ *Requiere asesoría hipotecaria*'
          );
          console.log('🔔 Asesor notificado');
        }
      }
'''

content = content[:insert_point] + new_logic + content[insert_point:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Reescritura completa finalizada")
print("")
print("NUEVA ARQUITECTURA:")
print("1. SARA controla flujo completo")
print("2. SARA envía [READY:tipo:cita:fecha:hora]")
print("3. Backend procesa TODO de una vez")
print("4. Una notificación completa")
