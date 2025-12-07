with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar la detección de mañana
old_manana = """        if (timeWords.includes('mañana')) {
          const tomorrow = new Date(now.getTime() + 24*60*60*1000);
          year = tomorrow.getFullYear();
          month = tomorrow.getMonth() + 1;
          day = tomorrow.getDate();
          dateText = 'mañana';
        }"""

new_manana = """        if (timeWords.includes('mañana')) {
          // Usar timezone de México (UTC-6)
          const nowMexico = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
          const tomorrow = new Date(nowMexico.getTime() + 24*60*60*1000);
          year = tomorrow.getFullYear();
          month = tomorrow.getMonth() + 1;
          day = tomorrow.getDate();
          dateText = 'mañana';
        }"""

content = content.replace(old_manana, new_manana)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Timezone México aplicado a 'mañana'")
