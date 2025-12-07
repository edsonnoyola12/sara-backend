with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

old = """const needsMortgage = /(?:si|sí|necesito|quiero|me interesa).*(?:crédito|hipoteca|financiamiento)/i.test(body) ||
                           /(?:no tengo|sin).*(?:efectivo|dinero|recursos)/i.test(body);"""

new = """const needsMortgage = /(?:crédito|hipoteca|financiamiento)/i.test(body) ||
                           /(?:no tengo|sin).*(?:efectivo|dinero|recursos)/i.test(body);"""

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
print("✅ Detección de hipoteca arreglada")
