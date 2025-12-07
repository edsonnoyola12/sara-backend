with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el bloque de parsing
old_parsing = '''      if (incomeMatch) {
        let rawIncome = incomeMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(incomeMatch.index);
        if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);
      }
      if (debtMatch) {
        mortgageData.current_debt = parseFloat(debtMatch[1].replace(/,/g, ''));
      }
      if (downPaymentMatch) {
        mortgageData.down_payment = parseFloat(downPaymentMatch[1].replace(/,/g, ''));
      }'''

new_parsing = '''      if (incomeMatch) {
        let rawIncome = incomeMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(incomeMatch.index);
        if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);
      }
      if (debtMatch) {
        let rawDebt = debtMatch[1].replace(/,/g, '');
        const debtContext = body.substring(debtMatch.index);
        if (/mil/i.test(debtContext.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000).toString();
        }
        mortgageData.current_debt = parseFloat(rawDebt);
      }
      if (downPaymentMatch) {
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const downContext = body.substring(downPaymentMatch.index);
        if (/mil/i.test(downContext.substring(0, 50))) {
          rawDown = (parseFloat(rawDown) * 1000).toString();
        }
        mortgageData.down_payment = parseFloat(rawDown);
      }'''

content = content.replace(old_parsing, new_parsing)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Parsing de 'mil' arreglado para deudas y enganche")
