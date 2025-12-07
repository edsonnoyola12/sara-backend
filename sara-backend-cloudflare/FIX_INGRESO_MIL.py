with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Encontrar el bloque de incomeMatch
old_income = '''      if (incomeMatch) {
        let rawIncome = incomeMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(incomeMatch.index);
        if (/mill[oó]n/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000000).toString();
        } else if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);
      }'''

new_income = '''      if (incomeMatch) {
        let rawIncome = incomeMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(incomeMatch.index, incomeMatch.index + 100);
        
        // Verificar millones PRIMERO (más específico)
        if (/millón(?:es)?/i.test(fullMatch)) {
          rawIncome = (parseFloat(rawIncome) * 1000000).toString();
        } else if (/\\bmil\\b/i.test(fullMatch) && !/millón/i.test(fullMatch)) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);
      }'''

content = content.replace(old_income, new_income)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Fix ingreso 'mil' vs 'millones'")
