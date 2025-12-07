with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# La variable citaData se define DENTRO del scope del parsing
# Necesitamos moverla ANTES del bloque de hipoteca para que esté disponible

# Buscar donde se define citaData
cita_def_start = content.find("// DETECTAR CITA")
cita_def_end = content.find("console.log('📅 Cita detectada:', citaData);") + len("console.log('📅 Cita detectada:', citaData);")

# Extraer el bloque
cita_block = content[cita_def_start:cita_def_end+1]

# Eliminar de donde está
content = content[:cita_def_start] + content[cita_def_end+1:]

# Insertar ANTES del bloque needsMortgageStatus
insert_before = content.find("if (needsMortgage) {")
content = content[:insert_before] + cita_block + "\n\n      " + content[insert_before:]

print("✅ Variable citaData movida al scope correcto")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
