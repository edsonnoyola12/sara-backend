with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el código de IA y corregir nombre de variable
content = content.replace(
    "const needsMortgage = /(?:crédito|hipoteca|financiamiento)/i.test(body)",
    "// needsMortgage detectado por IA más abajo"
)

content = content.replace(
    "const hasMortgage = /(?:ya tengo|tengo aprobado|cuento con).*(?:crédito|hipoteca)/i.test(body)",
    "// hasMortgage detectado por IA más abajo"
)

content = content.replace(
    "const noMortgage = /(?:no necesito|no quiero|de contado|efectivo)/i.test(body)",
    "// noMortgage detectado por IA más abajo"
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Variables arregladas")
