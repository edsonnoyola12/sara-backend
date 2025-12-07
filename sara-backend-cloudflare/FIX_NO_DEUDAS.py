with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Encontrar el bloque de debtMatch
old_debt = '''      if (debtMatch) {
        let rawDebt = debtMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(debtMatch.index);
        if (/mill[oó]n/i.test(fullMatch.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000000).toString();
        } else if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000).toString();
        }
        mortgageData.current_debt = parseFloat(rawDebt);
      }'''

new_debt = '''      // DETECTAR "NO TENGO DEUDAS" PRIMERO
      const hasNoDebt = /(?:no|sin|cero|nada)\s+(?:tengo|tiene)?\s*(?:deuda|adeudo)/i.test(body);
      
      if (hasNoDebt) {
        mortgageData.current_debt = 0;
      } else if (debtMatch) {
        let rawDebt = debtMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(debtMatch.index);
        if (/mill[oó]n/i.test(fullMatch.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000000).toString();
        } else if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000).toString();
        }
        mortgageData.current_debt = parseFloat(rawDebt);
      }'''

content = content.replace(old_debt, new_debt)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Fix 'no tengo deudas' agregado")
