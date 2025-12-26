with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# PASO 1: Agregar import DESPUÉS de la línea 3
lines = content.split('\n')
import_line = "import { getUbicacionPropiedad, getGoogleMapsLink } from '../utils/pricing-and-locations';"

# Buscar línea de TwilioService e insertar después
for i, line in enumerate(lines):
    if "import { TwilioService } from '../services/twilio';" in line:
        lines.insert(i + 1, import_line)
        break

content = '\n'.join(lines)

# PASO 2: Agregar código para obtener ubicación ANTES de crear hipoteca
marker = """      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {
        const existingMortgage = await this.supabase.client"""

replacement = """      // Obtener ubicación GPS
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

# PASO 3: Agregar en notificación ASESOR
content = content.replace(
    "              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*",
    "              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}${mapsLink}\\n\\n💰 *DATOS FINANCIEROS:*"
)

# PASO 4: Agregar en notificación VENDEDOR
content = content.replace(
    "                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso:",
    "                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}${mapsLink}\\n\\n💰 Ingreso:"
)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ CAMBIOS APLICADOS:")
print("  1. Import agregado")
print("  2. Ubicación GPS obtenida")
print("  3. Link Maps en notificación asesor")
print("  4. Link Maps en notificación vendedor")
