with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar la línea problemática
bad_line = "let message = `🆕 Nuevo lead!\\n\\n👤 ${clientName}"

if bad_line in content:
    # Reemplazar con sintaxis correcta
    good_line = "let message = '🆕 Nuevo lead!\\n\\n👤 ' + clientName"
    content = content.replace(bad_line, good_line)
    print("✅ Línea corregida")
else:
    # Buscar variantes
    import re
    # Encontrar todas las líneas con problemas de template literal
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '🆕' in line and '`' in line:
            print(f"Línea {i+1}: {line[:100]}")
    
with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("Archivo guardado")
