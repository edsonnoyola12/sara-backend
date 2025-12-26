with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. Buscar notificación ASESOR (buscar por el texto único)
old_asesor = "\\n\\n¡Contactar pronto!`\n            );"
new_asesor = "${citaData && ubicacion ? `\\n\\n📍 Ubicación: ${ubicacion.name}\\n🗺️ Google Maps: ${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}` : ''}\\n\\n¡Contactar pronto!`\n            );"

if old_asesor in content and 'getGoogleMapsLink' not in content.split(old_asesor)[0].split('assignedAsesor.phone')[-1]:
    content = content.replace(old_asesor, new_asesor, 1)
    print("✅ 1. Notificación asesor actualizada")
else:
    print("⚠️ 1. Notificación asesor ya tiene Maps o no encontrada")

# 2. Buscar notificación VENDEDOR
old_vendedor = "\\n\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`\n              );"
new_vendedor = "${citaData && ubicacion ? `\\n\\n📍 Ubicación: ${ubicacion.name}\\n🗺️ Google Maps: ${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}` : ''}\\n\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`\n              );"

if old_vendedor in content:
    # Contar cuántas veces aparece
    count = content.count(old_vendedor)
    # Solo reemplazar la primera (dentro del bloque de mortgage)
    parts = content.split(old_vendedor)
    if len(parts) >= 2:
        content = parts[0] + new_vendedor + old_vendedor.join(parts[1:])
        print(f"✅ 2. Notificación vendedor actualizada")
else:
    print("⚠️ 2. Notificación vendedor no encontrada o ya tiene Maps")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("\n✅ LISTO")
