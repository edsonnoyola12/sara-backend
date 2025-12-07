with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

fixed_count = 0
for i, line in enumerate(lines):
    # Buscar líneas con += y template literals con emojis
    if 'message +=' in line and '`' in line and any(emoji in line for emoji in ['💳', '💰', '🏦', '🆕', '📱', '🏠', '⭐', '👤']):
        # Convertir de template literal a concatenación
        # message += `\n\nTexto...` → message += '\n\nTexto...'
        line_fixed = line.replace('`', "'")
        # Reemplazar interpolaciones ${} por concatenación
        import re
        # Patrones como ${variable} → ' + variable + '
        line_fixed = re.sub(r'\$\{([^}]+)\}', r"' + \\1 + '", line_fixed)
        # Limpiar concatenaciones vacías
        line_fixed = line_fixed.replace(" + '' + ", ' + ')
        line_fixed = line_fixed.replace("'' + ", '')
        line_fixed = line_fixed.replace(" + ''", '')
        lines[i] = line_fixed
        fixed_count += 1
        print(f"✅ Línea {i+1} arreglada")

print(f"\n✅ Total de {fixed_count} líneas arregladas")

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)

