with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Reemplazar la línea exacta 850
old_line = "      await this.twilio.sendWhatsAppMessage(from, response);"

new_code = """      // Agregar ubicación si hay cita
      let finalResponse = response;
      if (citaDetectada && mapsLink) {
        finalResponse = response + `\\n\\n📍 Ubicación: ${mapsLink}`;
      }
      await this.twilio.sendWhatsAppMessage(from, finalResponse);"""

content = content.replace(old_line, new_code)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Link agregado después de la respuesta de SARA")
print("✅ Si hay cita Y link, se agrega al final del mensaje")
