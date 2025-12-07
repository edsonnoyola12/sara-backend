with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar la notificación al vendedor sobre crédito
old_vendedor = '''              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + v.phone,
                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}\\n\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`
              );'''

new_vendedor = '''              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + v.phone,
                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\n\\n📅 *CITA:*\\n• ${citaData.dateText} a las ${citaData.timeText}\\n• ${matchedProperty.name}` : ''}\\n\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`
              );'''

content = content.replace(old_vendedor, new_vendedor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificación de cita agregada a vendedor")
