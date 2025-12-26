with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# PASO 1: Agregar objeto después de VIDEO_SERVER_URL
maps_object = """
const MAPS_UBICACIONES: { [key: string]: string } = {
  'Ceiba': 'https://www.google.com/maps?q=19.0319,-98.2063',
  'Eucalipto': 'https://www.google.com/maps?q=19.0319,-98.2063',
  'Cedro': 'https://www.google.com/maps?q=19.0319,-98.2063',
  'Abeto': 'https://www.google.com/maps?q=19.0325,-98.2070',
  'Fresno': 'https://www.google.com/maps?q=19.0325,-98.2070',
  'Roble': 'https://www.google.com/maps?q=19.0325,-98.2070',
  'Madroño': 'https://www.google.com/maps?q=19.0330,-98.2075',
  'Avellano': 'https://www.google.com/maps?q=19.0330,-98.2075',
  'Lavanda': 'https://www.google.com/maps?q=19.0315,-98.2055',
  'Tulipán': 'https://www.google.com/maps?q=19.0315,-98.2055',
  'Azalea': 'https://www.google.com/maps?q=19.0315,-98.2055',
  'Almendro': 'https://www.google.com/maps?q=19.0340,-98.2080',
  'Olivo': 'https://www.google.com/maps?q=19.0340,-98.2080',
  'Girasol': 'https://www.google.com/maps?q=19.0310,-98.2050',
  'Gardenia': 'https://www.google.com/maps?q=19.0310,-98.2050',
  'Halcón': 'https://www.google.com/maps?q=19.0450,-98.1850',
  'Águila': 'https://www.google.com/maps?q=19.0450,-98.1850',
  'Sauce': 'https://www.google.com/maps?q=19.0460,-98.1860',
  'Nogal': 'https://www.google.com/maps?q=19.0460,-98.1860',
  'Orquídea': 'https://www.google.com/maps?q=19.0200,-98.2200',
  'Dalia': 'https://www.google.com/maps?q=19.0200,-98.2200'
};
"""

content = content.replace(
    "const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';",
    "const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';" + maps_object
)

# PASO 2: Extraer modelo y obtener link ANTES de crear hipoteca
marker = """      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {
        const existingMortgage = await this.supabase.client"""

replacement = """      // Obtener link de Google Maps (el modelo es la primera palabra del nombre)
      const modelo = matchedProperty?.name?.split(' ')[0] || '';
      const mapsLink = MAPS_UBICACIONES[modelo] || '';
      const ubicacionTexto = mapsLink ? `\\n📍 Ubicación: ${mapsLink}` : '';

      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {
        const existingMortgage = await this.supabase.client"""

content = content.replace(marker, replacement)

# PASO 3: Agregar en notificación ASESOR
content = content.replace(
    "              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*",
    "              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}${ubicacionTexto}\\n\\n💰 *DATOS FINANCIEROS:*"
)

# PASO 4: Agregar en notificación VENDEDOR
content = content.replace(
    "                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso:",
    "                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}${ubicacionTexto}\\n\\n💰 Ingreso:"
)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ GPS con split corregido:")
print("  1. Extrae modelo: matchedProperty.name.split(' ')[0]")
print("  2. Busca en MAPS_UBICACIONES[modelo]")
print("  3. Link agregado en notificaciones")
