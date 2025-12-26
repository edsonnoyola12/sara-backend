with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# PASO 1: Obtener ubicación JUSTO DESPUÉS de matchedProperty (línea ~596)
# Buscar el bloque donde se crea la solicitud hipotecaria
marker = """      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {
        const existingMortgage = await this.supabase.client"""

replacement = """      // Obtener ubicación GPS del desarrollo
      let mapsLink = '';
      if (matchedProperty?.name) {
        const ubicacion = getUbicacionPropiedad(matchedProperty.name);
        if (ubicacion) {
          mapsLink = `\\n📍 Ubicación: ${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}`;
        }
      }

      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {
        const existingMortgage = await this.supabase.client"""

content = content.replace(marker, replacement)

# PASO 2: Agregar en notificación ASESOR
content = content.replace(
    "              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*",
    "              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}${mapsLink}\\n\\n💰 *DATOS FINANCIEROS:*"
)

# PASO 3: Agregar en notificación VENDEDOR
content = content.replace(
    "                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso:",
    "                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}${mapsLink}\\n\\n💰 Ingreso:"
)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ GPS agregado correctamente:")
print("  1. Ubicación obtenida ANTES de notificaciones")
print("  2. Link agregado en notificación asesor")
print("  3. Link agregado en notificación vendedor")
