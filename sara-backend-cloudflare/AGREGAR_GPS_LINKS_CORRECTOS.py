with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# PASO 1: Agregar objeto con links CORRECTOS después de VIDEO_SERVER_URL
maps_object = """
const MAPS_UBICACIONES: { [key: string]: string } = {
  'Ceiba': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389',
  'Eucalipto': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389',
  'Cedro': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389',
  'Abeto': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas',
  'Fresno': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas',
  'Roble': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas',
  'Madroño': 'https://www.google.com.mx/maps/place/PRIVADA+MONTE+REAL+-+Grupo+Santa+Rita/@22.7399971,-102.6022833,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f30d886fd53:0xfd697cf8e7379698!8m2!3d22.7399971!4d-102.6000946',
  'Avellano': 'https://www.google.com.mx/maps/place/PRIVADA+MONTE+REAL+-+Grupo+Santa+Rita/@22.7399971,-102.6022833,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f30d886fd53:0xfd697cf8e7379698!8m2!3d22.7399971!4d-102.6000946',
  'Lavanda': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A',
  'Tulipán': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A',
  'Azalea': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A',
  'Almendro': 'https://www.google.com/maps/search/?api=1&query=Miravalle+Colinas+del+Padre+Zacatecas',
  'Olivo': 'https://www.google.com/maps/search/?api=1&query=Miravalle+Colinas+del+Padre+Zacatecas',
  'Girasol': 'https://www.google.com/maps/search/?api=1&query=Villa+Galiano,+Zacatecas',
  'Gardenia': 'https://www.google.com/maps/search/?api=1&query=Villa+Galiano,+Zacatecas',
  'Halcón': 'https://www.google.com.mx/maps/place/PRIVADA+DISTRITO+FALCO+-+Grupo+Santa+Rita/@22.7711248,-102.5331916,17z/data=!3m1!4b1!4m5!3m4!1s0x86824eb359ad753d:0x9da80a7bc640e4a6!8m2!3d22.7711248!4d-102.5310029',
  'Águila': 'https://www.google.com.mx/maps/place/PRIVADA+DISTRITO+FALCO+-+Grupo+Santa+Rita/@22.7711248,-102.5331916,17z/data=!3m1!4b1!4m5!3m4!1s0x86824eb359ad753d:0x9da80a7bc640e4a6!8m2!3d22.7711248!4d-102.5310029',
  'Sauce': 'https://www.google.com/maps/search/?api=1&query=Villa+Campelo,+Guadalupe,+Zacatecas',
  'Nogal': 'https://www.google.com/maps/search/?api=1&query=Villa+Campelo,+Guadalupe,+Zacatecas',
  'Orquídea': 'https://www.google.com/maps/search/?api=1&query=Privada+Alpes+Cordilleras+Guadalupe+Zacatecas',
  'Dalia': 'https://www.google.com/maps/search/?api=1&query=Privada+Alpes+Cordilleras+Guadalupe+Zacatecas'
};
"""

content = content.replace(
    "const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';",
    "const VIDEO_SERVER_URL = 'https://sara-videos.onrender.com';" + maps_object
)

# PASO 2: Agregar código para obtener ubicación ANTES de crear hipoteca
marker = """      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {
        const existingMortgage = await this.supabase.client"""

replacement = """      // Obtener link de Google Maps
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

print("✅ GPS agregado con links oficiales correctos")
print("✅ Link aparecerá en notificaciones a asesor y vendedor")
