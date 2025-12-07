with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Mejorar el regex de hora para capturar mejor
old_regex = "const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm)/i);"
new_regex = "const timeMatch = body.match(/(\\d{1,2})(?::(\\d{2}))?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)/i);"

content = content.replace(old_regex, new_regex)

# Agregar log para debug
old_cita_detect = "let citaData: any = null;"
new_cita_detect = """let citaData: any = null;
      console.log('🔍 Detectando cita en:', body);"""

content = content.replace(old_cita_detect, new_cita_detect)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Regex de hora mejorado + debug agregado")
