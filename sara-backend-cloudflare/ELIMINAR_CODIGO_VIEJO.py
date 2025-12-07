with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar y eliminar el bloque completo de notificación viejo
start_marker = "for (const v of vendedores) {"
end_marker = "} // end for vendedores"

# Encontrar el bloque
start_pos = content.find(start_marker)
if start_pos != -1:
    # Buscar el cierre del for loop
    # Contar llaves para encontrar el cierre correcto
    brace_count = 0
    pos = start_pos + len(start_marker)
    
    while pos < len(content):
        if content[pos] == '{':
            brace_count += 1
        elif content[pos] == '}':
            if brace_count == 0:
                # Encontramos el cierre del for
                content = content[:start_pos] + content[pos+1:]
                print("✅ Bloque de notificación viejo eliminado")
                break
            brace_count -= 1
        pos += 1

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

