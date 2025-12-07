with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar donde se crea el appointment
old_insert = """            // Guardar cita en Supabase
            const { data: appt } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: vendedor?.id,
              vendedor_name: vendedor?.name,
              asesor_id: asesorAsignado?.id,
              asesor_name: asesorAsignado?.name,"""

new_insert = """            // Guardar cita en Supabase
            const { data: appt } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              lead_name: clientName,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: vendedor?.id,
              vendedor_name: vendedor?.name,
              asesor_id: asesorAsignado?.id,
              asesor_name: asesorAsignado?.name,"""

content = content.replace(old_insert, new_insert)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Nombre del lead agregado a appointments")
