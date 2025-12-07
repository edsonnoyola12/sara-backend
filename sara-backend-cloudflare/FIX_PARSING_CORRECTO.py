with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. FIX DEUDAS: Buscar "deuda/adeudo" PRIMERO, luego el número
old_debt = "const debtMatch = body.match(/(\\d[\\d,\\.]*).*?(?:deuda|adeudo)/i);"
new_debt = "const debtMatch = body.match(/(?:deuda|adeudo)[^\\d]{0,30}(\\d[\\d,\\.]*)/i);"

if old_debt in content:
    content = content.replace(old_debt, new_debt)
    print("✅ Regex de deudas arreglado")
else:
    print("⚠️ No encontré el regex de deudas")

# 2. FIX ENGANCHE: Buscar "enganche/ahorro" PRIMERO, luego el número
old_down = "const downPaymentMatch = body.match(/(\\d[\\d,\\.]*).*?(?:de\\s+)?(?:enganche|ahorro)/i);"
new_down = "const downPaymentMatch = body.match(/(?:enganche|ahorro)[^\\d]{0,30}(\\d[\\d,\\.]*)/i);"

if old_down in content:
    content = content.replace(old_down, new_down)
    print("✅ Regex de enganche arreglado")
else:
    print("⚠️ No encontré el regex de enganche")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("\n✅ FIX APLICADO - Ahora busca palabra clave PRIMERO")
