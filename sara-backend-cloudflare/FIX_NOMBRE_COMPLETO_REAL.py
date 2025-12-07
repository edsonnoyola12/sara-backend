with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Cambiar el regex para capturar nombre completo (múltiples palabras)
old_regex = r"const nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\s+([A-Za-záéíóúñÁÉÍÓÚÑ]+)/i);"

new_regex = r"const nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:,|\.|$|me\s|necesito\s|quiero\s|tengo\s|gano\s)/i);"

content = content.replace(old_regex, new_regex)

# Agregar log después del match
old_clientname = """      let clientName = lead.name || 'Cliente';
      
      if (nameMatch) {
        clientName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();"""

new_clientname = """      let clientName = lead.name || 'Cliente';
      
      if (nameMatch) {
        console.log('🔍 Nombre raw capturado:', nameMatch[1]);
        clientName = nameMatch[1].trim().split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        console.log('👤 Nombre formateado:', clientName);"""

content = content.replace(old_clientname, new_clientname)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Regex de nombre actualizado para capturar nombre completo")
