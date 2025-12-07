with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Agregar log de respuesta de SARA
old_send = "await this.twilio.sendWhatsAppMessage(from, aiResponse);"
new_send = """console.log('🤖 SARA dice:', aiResponse.substring(0, 200));
      await this.twilio.sendWhatsAppMessage(from, aiResponse);"""

content = content.replace(old_send, new_send)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Log agregado")
