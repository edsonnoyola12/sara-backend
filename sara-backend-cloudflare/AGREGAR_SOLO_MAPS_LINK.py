with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Obtener ubicación ANTES de las notificaciones (después de crear eventos)
old_marker = "            console.log('✅ Eventos de Calendar guardados');"
new_marker = """            console.log('✅ Eventos de Calendar guardados');
            
            // Obtener ubicación GPS para notificaciones
            let mapsLink = '';
            if (matchedProperty?.name) {
              const ubicacion = getUbicacionPropiedad(matchedProperty.name);
              if (ubicacion) {
                mapsLink = `\\n📍 Ubicación: ${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}`;
              }
            }"""

content = content.replace(old_marker, new_marker)

# 2. Agregar link en notificación ASESOR (línea ~720)
content = content.replace(
    "`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*",
    "`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}${mapsLink}\\n\\n💰 *DATOS FINANCIEROS:*"
)

# 3. Agregar link en notificación VENDEDOR (línea ~733)
content = content.replace(
    "`🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso:",
    "`🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}${mapsLink}\\n\\n💰 Ingreso:"
)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Link de Google Maps agregado en notificaciones")
print("✅ NO se tocó nada más")
