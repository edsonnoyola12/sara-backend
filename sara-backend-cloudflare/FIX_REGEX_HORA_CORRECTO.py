with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el bloque de detección de cita
old_time_regex = "const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm)/i);"
new_time_regex = "const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)/i);"

content = content.replace(old_time_regex, new_time_regex)

# Agregar log DESPUÉS de definir timeMatch y dateMatch
old_check = "let citaData = null;\n      if (timeMatch && dateMatch) {"
new_check = """let citaData = null;
      
      console.log('🔍 Buscando cita - Hora:', timeMatch?.[0], 'Fecha:', dateMatch?.[0]);
      
      if (timeMatch && dateMatch) {"""

content = content.replace(old_check, new_check)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Regex de hora mejorado + debug en scope correcto")
