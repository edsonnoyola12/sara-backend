with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar la notificación del vendedor (que NO es la de crédito)
# La notificación inicial del vendedor cuando se crea el lead
old_vendedor_inicial = "await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, '🆕 Nuevo lead!\\nTel: ' + cleanPhone + (assignedVendedor?.id === v.id ? '\\n✅ Asignado a ti' : ''));"

new_vendedor_inicial = "await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, '🆕 Nuevo lead!\\nTel: ' + cleanPhone + (assignedVendedor?.id === v.id ? '\\n✅ Asignado a ti' : ''));"

# Esto está bien, el problema es con la notificación de CRÉDITO
# Buscar notificación vendedor sobre crédito (la que ya tiene datos financieros)
import re
pattern = r"await this\.twilio\.sendWhatsAppMessage\(\s*'whatsapp:' \+ v\.phone,\s*`🏦 \*LEAD CON CRÉDITO\*[^`]+`\s*\);"

matches = list(re.finditer(pattern, content, re.DOTALL))
if not matches:
    print("❌ No encontré la notificación del vendedor")
    exit(1)

# Debe haber 1 match
for match in matches:
    old_notif = match.group(0)
    # Verificar si ya tiene citaData
    if "citaData" not in old_notif:
        # Agregar citaData antes de Asesor
        new_notif = old_notif.replace(
            "\\n\\nAsesor:",
            "${citaData ? `\\n\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\n\\nAsesor:"
        )
        content = content.replace(old_notif, new_notif)
        print("✅ Cita agregada a notificación de vendedor")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
