with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

# Encontrar la línea exacta del debtMatch regex
for i, line in enumerate(lines):
    if 'const debtMatch = body.match' in line:
        print(f"LÍNEA {i+1} ACTUAL:")
        print(f"  {line.strip()}")
        # Cambiar para incluir "deudas" (plural)
        lines[i] = '      const debtMatch = body.match(/(?:debo|deudas?|pago mensual).*?(\\d[\\d,\\.]*)i);\n'
        print(f"LÍNEA {i+1} NUEVA:")
        print(f"  {lines[i].strip()}")
        break

# Encontrar downPaymentMatch y cambiar para NO incluir "tengo"
for i, line in enumerate(lines):
    if 'const downPaymentMatch = body.match' in line:
        print(f"\nLÍNEA {i+1} ACTUAL:")
        print(f"  {line.strip()}")
        # Solo buscar después de "enganche" o "ahorro"
        lines[i] = '      const downPaymentMatch = body.match(/(?:enganche|ahorro).*?(\\d[\\d,\\.]*)i);\n'
        print(f"LÍNEA {i+1} NUEVA:")
        print(f"  {lines[i].strip()}")
        break

# Encontrar el bloque "if (debtMatch)" y agregar hasNoDebt ANTES
for i, line in enumerate(lines):
    if 'if (debtMatch) {' in line and 'hasNoDebt' not in lines[i-1]:
        print(f"\nINSERTANDO ANTES DE LÍNEA {i+1}")
        # Insertar 4 líneas antes del if (debtMatch)
        new_lines = [
            '      // Detectar "no tengo deudas" PRIMERO\n',
            '      const hasNoDebt = /(?:no|sin|cero|nada)\\s+(?:tengo|tiene)?\\s*(?:deudas?|adeudo)/i.test(body);\n',
            '      \n',
            '      if (hasNoDebt) {\n',
            '        mortgageData.current_debt = 0;\n',
            '      } else if (debtMatch) {\n'
        ]
        # Cambiar "if (debtMatch)" por "} else if (debtMatch)"
        lines[i] = '      } else if (debtMatch) {\n'
        # Insertar las líneas nuevas antes
        for j, new_line in enumerate(new_lines[:-1]):  # -1 porque la última ya la pusimos
            lines.insert(i + j, new_line)
        print("CÓDIGO INSERTADO:")
        for nl in new_lines:
            print(f"  {nl.strip()}")
        break

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(lines)

print("\n✅ CAMBIOS APLICADOS")
print("\nVERIFICANDO...")

# Verificar
with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()
    if 'hasNoDebt' in content and 'deudas?' in content and 'enganche|ahorro' in content:
        print("✅ Todos los cambios confirmados en el archivo")
    else:
        print("❌ FALTA ALGÚN CAMBIO")

