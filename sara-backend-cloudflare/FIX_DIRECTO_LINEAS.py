with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    # Buscar línea de debtMatch
    if 'const debtMatch = body.match' in line and 'deuda|adeudo' in line:
        lines[i] = "        const debtMatch = body.match(/(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?[^\\d]{0,30}(?:de\\s+)?(?:deuda|adeudo)/i);\n"
        print(f"✅ Línea {i+1} debtMatch reemplazada")
    
    # Buscar línea de downPaymentMatch  
    if 'const downPaymentMatch = body.match' in line and 'enganche|ahorro' in line:
        lines[i] = "      const downPaymentMatch = body.match(/(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?[^\\d]{0,30}(?:de\\s+)?(?:enganche|ahorro)/i);\n"
        print(f"✅ Línea {i+1} downPaymentMatch reemplazada")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(lines)

print("\n✅ REGEX INVERTIDOS")
