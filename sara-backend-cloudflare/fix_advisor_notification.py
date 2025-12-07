with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el mensaje al asesor y hacer que matchedProperty.name sea opcional
old_pattern = """🏦 Nueva solicitud hipotecaria!

👤 ${clientName}
📱 ${cleanPhone}
🏠 ${matchedProperty.name}
💰 Ingreso: $${mortgageData.monthly_income?.toLocaleString()}/mes

¡Contactar pronto!"""

new_pattern = """🏦 Nueva solicitud hipotecaria!

👤 ${clientName}
📱 ${cleanPhone}
🏠 ${matchedProperty?.name || 'Por definir'}
💰 Ingreso: $${mortgageData.monthly_income?.toLocaleString()}/mes

¡Contactar pronto!"""

content = content.replace(old_pattern, new_pattern)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
    
print("✅ Notificación de asesor arreglada")
