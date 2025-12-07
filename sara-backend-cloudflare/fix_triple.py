with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# FIX 1: Limpiar puntuación en palabras para matching
old = "const palabrasBuscar = body.toLowerCase().split(/\\s+/);"
new = """const palabrasBuscar = body.toLowerCase()
  .replace(/[.,!?;:]/g, ' ')  // Quitar puntuación
  .split(/\\s+/)
  .filter(w => w.length > 0);"""
content = content.replace(old, new)

# FIX 2: Parsing de números (mil, miles, k)
old = "mortgageData.monthly_income = parseFloat(incomeMatch[1].replace(/,/g, ''));"
new = """let rawIncome = incomeMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(incomeMatch.index);
        if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);"""
content = content.replace(old, new)

# FIX 3: Buscar TODOS los matchedProperty.name y hacerlos opcionales
content = content.replace(
    "matchedProperty.name",
    "matchedProperty?.name"
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
    
print("✅ Triple fix aplicado")
