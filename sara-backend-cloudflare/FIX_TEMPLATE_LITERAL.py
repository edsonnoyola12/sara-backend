with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Arreglar la línea completa con template literal correcto
old_broken = "let message = '🆕 Nuevo lead!\\n\\n👤 ' + clientName\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}`;"

new_fixed = "let message = `🆕 Nuevo lead!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}`;"

content = content.replace(old_broken, new_fixed)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Template literal corregido")
