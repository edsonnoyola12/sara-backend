with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar y reemplazar la notificación del asesor EXACTA
old_asesor = '''              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name}\\n💰 Ingreso: $${mortgageData.monthly_income?.toLocaleString()}/mes\\n\\n¡Contactar pronto!`'''

new_asesor = '''              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n💰 Ingreso: $${(mortgageInsert.data?.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageInsert.data?.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageInsert.data?.down_payment || 0).toLocaleString()}\\n\\n¡Contactar pronto!`'''

content = content.replace(old_asesor, new_asesor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Asesor arreglado con datos completos")
