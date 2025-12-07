with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. Arreglar INSERT para usar columnas correctas
old_insert = '''const appointmentData = {
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
          };'''

new_insert = '''const appointmentDate = new Date(pending.startTime);
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

content = content.replace(old_insert, new_insert)

# 2. Arreglar parsing de "40 mil" que multiplica de más
# El problema está en que detecta "mil" dentro de "millones"
old_income_parse = '''if (incomeMatch) {
        let rawIncome = incomeMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(incomeMatch.index);
        if (/mill[oó]n/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000000).toString();
        } else if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);
      }'''

new_income_parse = '''if (incomeMatch) {
        let rawIncome = incomeMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(incomeMatch.index, incomeMatch.index + 50);
        // Verificar millones primero, luego miles
        if (/mill[oó]n(?:es)?/i.test(fullMatch)) {
          rawIncome = (parseFloat(rawIncome) * 1000000).toString();
        } else if (/\\bmil\\b/i.test(fullMatch)) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);
      }'''

content = content.replace(old_income_parse, new_income_parse)

# 3. Mismo fix para enganche
old_down_parse = '''if (downPaymentMatch) {
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(downPaymentMatch.index);
        if (/mill[oó]n/i.test(fullMatch.substring(0, 50))) {
          rawDown = (parseFloat(rawDown) * 1000000).toString();
        } else if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawDown = (parseFloat(rawDown) * 1000).toString();
        }
        mortgageData.down_payment = parseFloat(rawDown);
      }'''

new_down_parse = '''if (downPaymentMatch) {
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(downPaymentMatch.index, downPaymentMatch.index + 50);
        // Verificar millones primero, luego miles
        if (/mill[oó]n(?:es)?/i.test(fullMatch)) {
          rawDown = (parseFloat(rawDown) * 1000000).toString();
        } else if (/\\bmil\\b/i.test(fullMatch)) {
          rawDown = (parseFloat(rawDown) * 1000).toString();
        }
        mortgageData.down_payment = parseFloat(rawDown);
      }'''

content = content.replace(old_down_parse, new_down_parse)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ INSERT y parsing arreglados")
