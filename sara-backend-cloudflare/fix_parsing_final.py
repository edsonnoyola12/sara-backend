# Este script arregla SOLO el parsing financiero sin tocar nada más

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el bloque de parsing de deudas
old_debt_pattern = '''const debtMatch = body.match(/(\\d[\\d,\\.]*).*?(?:deuda|adeudo)/i);'''

new_debt_pattern = '''// Buscar patrón: palabra clave PRIMERO, luego número
      const debtMatch = body.match(/(?:deuda|adeudo)[^\\d]{0,20}(\\d[\\d,\\.]*)/i);'''

content = content.replace(old_debt_pattern, new_debt_pattern)

# Buscar el bloque de parsing de enganche
old_down_pattern = '''const downPaymentMatch = body.match(/(\\d[\\d,\\.]*).*?(?:de\\s+)?(?:enganche|ahorro)/i);'''

new_down_pattern = '''// Buscar patrón: palabra clave PRIMERO, luego número  
      const downPaymentMatch = body.match(/(?:enganche|ahorro)[^\\d]{0,20}(\\d[\\d,\\.]*)/i);'''

content = content.replace(old_down_pattern, new_down_pattern)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Parsing arreglado")
print("Ahora los regex buscan la palabra clave PRIMERO, luego capturan el número asociado")
