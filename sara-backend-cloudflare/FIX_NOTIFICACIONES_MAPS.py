with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar la notificación al asesor y agregar Maps
import re

# 1. Notificación ASESOR
pattern_asesor = r"(await this\.twilio\.sendWhatsAppMessage\(\s*'whatsapp:' \+ assignedAsesor\.phone,\s*`🏦 \*NUEVA SOLICITUD HIPOTECARIA\*\\n\\n[^`]+¡Contactar pronto!)`"

match = re.search(pattern_asesor, content)
if match:
    old_notif = match.group(0)
    # Verificar si ya tiene Maps
    if 'getGoogleMapsLink' not in old_notif:
        # Reemplazar antes de "¡Contactar pronto!"
        new_notif = old_notif.replace(
            "': ''}\\n\\n¡Contactar pronto!`",
            "': ''}${citaData && ubicacion ? `\\n📍 ${ubicacion.name}\\n🗺️ ${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}` : ''}\\n\\n¡Contactar pronto!`"
        )
        content = content.replace(old_notif, new_notif)
        print("✅ 1. Notificación asesor actualizada con Maps")
    else:
        print("⚠️ 1. Notificación asesor ya tiene Maps")
else:
    print("❌ 1. No se encontró notificación asesor")

# 2. Notificación VENDEDOR
pattern_vendedor = r"(await this\.twilio\.sendWhatsAppMessage\(\s*'whatsapp:' \+ v\.phone,\s*`🏦 \*LEAD CON CRÉDITO\*\\n\\n[^`]+Asesor: \$\{assignedAsesor\?\.name \|\| 'Sin asignar'\}`"

match = re.search(pattern_vendedor, content)
if match:
    old_notif = match.group(0)
    if 'getGoogleMapsLink' not in old_notif:
        new_notif = old_notif.replace(
            "': ''}\\n\\nAsesor:",
            "': ''}${citaData && ubicacion ? `\\n📍 ${ubicacion.name}\\n🗺️ ${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}` : ''}\\n\\nAsesor:"
        )
        content = content.replace(old_notif, new_notif)
        print("✅ 2. Notificación vendedor actualizada con Maps")
    else:
        print("⚠️ 2. Notificación vendedor ya tiene Maps")
else:
    print("❌ 2. No se encontró notificación vendedor")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("\n✅ NOTIFICACIONES ACTUALIZADAS")
