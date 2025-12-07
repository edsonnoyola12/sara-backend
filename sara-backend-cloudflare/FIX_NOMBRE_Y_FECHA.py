with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. FIX NOMBRE COMPLETO - agregar log para debug
old_name = """        // Actualizar nombre si lo mencionó (capturar nombre completo)
        const nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\\s+([A-ZÁ-Úa-zá-ú]+(?:\\s+[A-ZÁ-Úa-zá-ú]+)*)/i);
        if (nameMatch) {
          const clientName = nameMatch[1];"""

new_name = """        // Actualizar nombre si lo mencionó (capturar nombre completo)
        const nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\\s+([A-ZÁ-Úa-zá-ú]+(?:\\s+[A-ZÁ-Úa-zá-ú]+)*)/i);
        console.log('🔍 Nombre match:', nameMatch);
        if (nameMatch) {
          const clientName = nameMatch[1];
          console.log('👤 Nombre capturado completo:', clientName);"""

content = content.replace(old_name, new_name)

# 2. FIX FECHA MAÑANA - usar Date directamente con offset
old_tomorrow = """        if (timeWords.includes('mañana')) {
          // Usar timezone de México (UTC-6)
          const nowMexico = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
          const tomorrow = new Date(nowMexico.getTime() + 24*60*60*1000);
          year = tomorrow.getFullYear();
          month = tomorrow.getMonth() + 1;
          day = tomorrow.getDate();
          dateText = 'mañana';
        }"""

new_tomorrow = """        if (timeWords.includes('mañana')) {
          // México está en UTC-6, ajustar para obtener fecha correcta
          const mexicoOffset = -6 * 60; // minutos
          const localOffset = now.getTimezoneOffset();
          const diff = (mexicoOffset - localOffset) * 60 * 1000;
          const nowMexico = new Date(now.getTime() + diff);
          const tomorrow = new Date(nowMexico.getTime() + 24*60*60*1000);
          year = tomorrow.getFullYear();
          month = tomorrow.getMonth() + 1;
          day = tomorrow.getDate();
          console.log('📅 MAÑANA calculado:', { nowMexico: nowMexico.toISOString(), tomorrow: tomorrow.toISOString(), year, month, day });
          dateText = 'mañana';
        }"""

content = content.replace(old_tomorrow, new_tomorrow)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Logs agregados para debug de nombre y fecha")
