import re

with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. AGREGAR obtención de ubicación ANTES de guardar cita
# Buscar: "// Guardar cita en Supabase"
ubicacion_code = """
            // Obtener ubicación GPS
            let ubicacion = null;
            let mapsLink = null;
            if (matchedProperty?.name) {
              ubicacion = getUbicacionPropiedad(matchedProperty.name);
              mapsLink = ubicacion ? getGoogleMapsLink(ubicacion.lat, ubicacion.lng) : null;
            }
            
            // Guardar cita en Supabase"""

content = content.replace(
    "            // Guardar cita en Supabase",
    ubicacion_code
)

# 2. MODIFICAR INSERT para incluir coordenadas
old_insert = """const { data: appt, error: apptError } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              lead_name: clientName,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: vendedor?.id,
              vendedor_name: vendedor?.name,
              asesor_id: asesorAsignado?.id,
              asesor_name: asesorAsignado?.name,
              scheduled_date: citaData.date,
              scheduled_time: citaData.time,
              status: 'scheduled',
              appointment_type: asesorAsignado ? 'property_viewing_with_credit' : 'property_viewing',
              duration_minutes: 60
            }]).select().single();"""

new_insert = """const { data: appt, error: apptError } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              lead_name: clientName,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: vendedor?.id,
              vendedor_name: vendedor?.name,
              asesor_id: asesorAsignado?.id,
              asesor_name: asesorAsignado?.name,
              scheduled_date: citaData.date,
              scheduled_time: citaData.time,
              status: 'scheduled',
              appointment_type: asesorAsignado ? 'property_viewing_with_credit' : 'property_viewing',
              duration_minutes: 60,
              location: ubicacion?.nombre || null,
              location_lat: ubicacion?.lat || null,
              location_lng: ubicacion?.lng || null
            }]).select().single();"""

content = content.replace(old_insert, new_insert)

# 3. AGREGAR link en notificación ASESOR
old_asesor = """`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*\\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\n\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\n\\n¡Contactar pronto!`"""

new_asesor = """`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}${mapsLink ? `\\n📍 Ubicación: ${mapsLink}` : ''}\\n\\n💰 *DATOS FINANCIEROS:*\\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\n\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\n\\n¡Contactar pronto!`"""

content = content.replace(old_asesor, new_asesor)

# 4. AGREGAR link en notificación VENDEDOR
old_vendedor = """`🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\n\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\n\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`"""

new_vendedor = """`🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}${mapsLink ? `\\n📍 Ubicación: ${mapsLink}` : ''}\\n\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}${citaData ? `\\n\\n📅 CITA: ${citaData.dateText} a las ${citaData.timeText}` : ''}\\n\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`"""

content = content.replace(old_vendedor, new_vendedor)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Cambios aplicados:")
print("  1. Obtención de ubicación GPS agregada")
print("  2. Coordenadas guardadas en appointments")
print("  3. Link de Google Maps en notificación asesor")
print("  4. Link de Google Maps en notificación vendedor")
