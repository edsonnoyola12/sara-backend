with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Reemplazar el uso de assignedVendedor por lead.assigned_to
old = '''      // Notificar vendedores CON datos completos
      for (const v of vendedores) {
        if (v.phone) {
          const isAssigned = assignedVendedor?.id === v.id;
          await this.twilio.sendWhatsAppMessage(
            'whatsapp:' + v.phone,
            `🆕 Nuevo lead!\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}${isAssigned ? '\\n\\n✅ Asignado a ti' : ''}`
          );
        }
      }'''

new = '''      // Notificar vendedores CON datos completos
      for (const v of vendedores) {
        if (v.phone) {
          const isAssigned = lead.assigned_to === v.id;
          await this.twilio.sendWhatsAppMessage(
            'whatsapp:' + v.phone,
            `🆕 Nuevo lead!\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}${isAssigned ? '\\n\\n✅ Asignado a ti' : ''}`
          );
        }
      }'''

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ assignedVendedor fixed")
