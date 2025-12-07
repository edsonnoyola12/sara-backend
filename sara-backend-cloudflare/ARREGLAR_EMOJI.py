with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Buscar y arreglar todas las líneas con el problema del emoji
fixed = False
for i, line in enumerate(lines):
    if '🆕 Nuevo lead!' in line and 'let message = `' in line:
        # La línea está mal formada, arreglarla
        # Cambiar de template literal a concatenación de strings
        lines[i] = line.replace(
            'let message = `🆕 Nuevo lead!',
            'let message = "🆕 Nuevo lead!"'
        )
        # Cambiar el cierre también
        if '${' in lines[i]:
            # Es un template literal complejo, necesitamos reconstruirlo
            # Mejor opción: usar comillas simples para el emoji
            indent = len(line) - len(line.lstrip())
            lines[i] = ' ' * indent + "let message = '🆕 Nuevo lead!\\n\\n👤 ' + clientName + '\\n📱 ' + cleanPhone + '\\n🏠 ' + (matchedProperty?.name || lead.property_interest || 'Por definir') + '\\n⭐ Score: ' + newScore;\n"
        fixed = True
        print(f"✅ Línea {i+1} arreglada")

if not fixed:
    print("❌ No encontré la línea con el emoji problemático")
    # Mostrar líneas alrededor de 420
    for i in range(418, min(425, len(lines))):
        print(f"{i+1}: {lines[i][:80]}")

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)

