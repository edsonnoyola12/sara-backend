with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Reemplazar el mensaje al asesor para usar mortgageInsert.data
old_message = '''          if (assignedAsesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 Nueva solicitud hipotecaria!\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty?.name}\n💰 Ingreso: $${mortgageData.monthly_income?.toLocaleString()}/mes\n\n¡Contactar pronto!`
            );
          }'''

new_message = '''          if (assignedAsesor?.phone && mortgageInsert.data) {
            const income = mortgageInsert.data.monthly_income || 0;
            const propertyName = mortgageInsert.data.property_name || 'Por definir';
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 Nueva solicitud hipotecaria!\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${propertyName}\n💰 Ingreso: $${income.toLocaleString()}/mes\n\n¡Contactar pronto!`
            );
          }'''

content = content.replace(old_message, new_message)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
    
print("✅ Notificación de asesor con datos correctos")
