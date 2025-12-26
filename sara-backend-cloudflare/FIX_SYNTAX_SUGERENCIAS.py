with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# El problema está en la línea con return \` - necesita escaparse correctamente
old_line = "              return \\`• \\${nombre}: $\\${(precio / 1000000).toFixed(1)}M\\`;"
new_line = "              return `• ${nombre}: $${(precio / 1000000).toFixed(1)}M`;"

if old_line in content:
    content = content.replace(old_line, new_line)
    print("✅ Sintaxis corregida")
else:
    # Buscar la línea problemática y arreglarla
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'return' in line and 'nombre}: $' in line and 'toFixed' in line:
            # Encontrar el inicio del return
            if '\\`' in line or 'return \\' in line:
                # Limpiar escapes incorrectos
                lines[i] = line.replace('\\`', '`').replace('\\$', '$')
                print(f"✅ Línea {i+1} corregida")
                break
    content = '\n'.join(lines)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ ARCHIVO CORREGIDO")
