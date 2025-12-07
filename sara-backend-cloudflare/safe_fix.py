with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    # PASO 1: Comentar notificación temprana de vendedores (líneas 213-218)
    if i >= 212 and i <= 217:
        new_lines.append('      // MOVIDO AL FINAL: ' + line)
    # PASO 2: Insertar nueva notificación después de enviar respuesta al cliente (línea 443)
    elif 'await this.twilio.sendWhatsAppMessage(from, response);' in line:
        new_lines.append(line)
        # Agregar nueva notificación CON datos completos
        new_lines.append('\n      // Notificar vendedores CON datos completos\n')
        new_lines.append('      for (const v of vendedores) {\n')
        new_lines.append('        if (v.phone) {\n')
        new_lines.append('          const isAssigned = assignedVendedor?.id === v.id;\n')
        new_lines.append('          await this.twilio.sendWhatsAppMessage(\n')
        new_lines.append("            'whatsapp:' + v.phone,\n")
        new_lines.append("            `🆕 Nuevo lead!\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}${isAssigned ? '\\n\\n✅ Asignado a ti' : ''}`\n")
        new_lines.append('          );\n')
        new_lines.append('        }\n')
        new_lines.append('      }\n')
        new_lines.append('      console.log(\'🔔 Vendedores notificados con datos completos\');\n')
    else:
        new_lines.append(line)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(new_lines)

print("✅ Notificación de vendedores movida al final")
