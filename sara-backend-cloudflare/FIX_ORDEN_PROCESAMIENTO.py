with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# En lugar de mover el bloque, cambiar la condición para que video sea lo ÚLTIMO
# Buscar el if (wantsVideo && matchedProperty)
old_condition = "if (wantsVideo && matchedProperty) {"
new_condition = """// Video SOLO si NO pidió datos financieros ni cita
      const mencionaFinanciamiento = /(?:crédito|financiamiento|apoyo|gano|ingreso|deuda|enganche)/i.test(body);
      const mencionaCita = /(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|am|pm|ver)/i.test(body);
      
      if (wantsVideo && matchedProperty && !mencionaFinanciamiento && !mencionaCita) {"""

content = content.replace(old_condition, new_condition)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Video solo se activa si NO hay solicitud financiera o cita")
