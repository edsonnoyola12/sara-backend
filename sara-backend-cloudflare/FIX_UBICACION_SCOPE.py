with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar donde se define citaData (que es el scope correcto)
# Necesitamos definir ubicacion justo después de citaData

old_cita_data = "      let citaData = null;"
new_cita_data = """      let citaData = null;
      let ubicacion = null;"""

if old_cita_data in content and 'let ubicacion = null;' not in content:
    content = content.replace(old_cita_data, new_cita_data)
    print("✅ Variable ubicacion declarada en scope correcto")
else:
    print("⚠️ Ya existe o no se encontró")

# Ahora buscar donde se asigna ubicacion dentro del if de validación
# y moverla ANTES del if de validación de disponibilidad

old_ubicacion_assignment = """            // Obtener ubicación de la propiedad
            const ubicacion = getUbicacionPropiedad(matchedProperty.name);
            
            const { data: appt"""

new_ubicacion_assignment = """            const { data: appt"""

if old_ubicacion_assignment in content:
    content = content.replace(old_ubicacion_assignment, new_ubicacion_assignment)
    print("✅ Asignación de ubicacion movida")
    
    # Ahora insertar la asignación ANTES de la validación
    validation_start = "            // Validar disponibilidad"
    new_assignment = """            // Obtener ubicación de la propiedad
            ubicacion = getUbicacionPropiedad(matchedProperty.name);
            
            """
    
    if validation_start in content:
        content = content.replace(validation_start, new_assignment + validation_start)
        print("✅ Ubicación ahora se asigna ANTES de validación")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("\n✅ SCOPE CORREGIDO")
