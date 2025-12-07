with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Encontrar la sección de detección de mañana
old_manana = """        if (timeWords.includes('mañana')) {
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

# Simplificar - usar Date UTC directamente sumando 1 día
new_manana = """        if (timeWords.includes('mañana')) {
          // Simplemente sumar 1 día a la fecha actual
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          year = tomorrow.getFullYear();
          month = tomorrow.getMonth() + 1;
          day = tomorrow.getDate();
          console.log('📅 HOY:', now.toISOString().split('T')[0], 'MAÑANA:', `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
          dateText = 'mañana';
        }"""

content = content.replace(old_manana, new_manana)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Cálculo de 'mañana' simplificado")
