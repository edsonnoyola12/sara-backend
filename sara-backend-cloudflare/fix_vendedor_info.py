with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar la notificación simple del vendedor (línea ~215)
old_vendedor = '''        for (const v of vendedores) {
          if (v.phone) {
            await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, `🆕 Nuevo lead!\\nTel: ${cleanPhone}${assignedVendedor?.id === v.id ? '\\n✅ Asignado a ti' : ''}`);
          }
        }'''

new_vendedor = '''        for (const v of vendedores) {
          if (v.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + v.phone, 
              `🆕 Nuevo lead!\\n\\n👤 ${clientName || 'Sin nombre'}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n⭐ Score: ${lead.score}${assignedVendedor?.id === v.id ? '\\n\\n✅ Asignado a ti' : ''}`
            );
          }
        }'''

content = content.replace(old_vendedor, new_vendedor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificación vendedor actualizada")
