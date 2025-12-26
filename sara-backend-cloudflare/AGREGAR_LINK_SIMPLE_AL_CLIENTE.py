with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Buscar donde se envía la respuesta al cliente (última línea antes del catch)
# Y agregar el link de Maps SI existe la cita

old_response = """      console.log('🤖 Respuesta de SARA:', response);

      // 15. ENVIAR RESPUESTA AL CLIENTE
      await this.twilio.sendWhatsAppMessage(from, response);"""

new_response = """      console.log('🤖 Respuesta de SARA:', response);

      // 15. ENVIAR RESPUESTA AL CLIENTE (con ubicación si hay cita)
      let finalResponse = response;
      if (citaDetectada && mapsLink) {
        finalResponse = response + `\\n\\n📍 Ubicación: ${mapsLink}`;
      }
      await this.twilio.sendWhatsAppMessage(from, finalResponse);"""

content = content.replace(old_response, new_response)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Link agregado DESPUÉS de la respuesta de SARA")
print("✅ NO se toca el prompt de OpenAI")
print("✅ Solo se concatena el link al final")
