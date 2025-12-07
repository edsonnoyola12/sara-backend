with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# REEMPLAZAR los 3 regex Y agregar lógica de multiplicadores
old_block = '''      const incomeMatch = body.match(/(?:gano|ingreso|sueldo|salario).*?(\\d[\\d,\\.]*)/i);
      const debtMatch = body.match(/(?:debo|deuda|pago mensual).*?(\\d[\\d,\\.]*)/i);
      const downPaymentMatch = body.match(/(?:enganche|ahorro|tengo).*?(\\d[\\d,\\.]*)/i);
      
      const needsMortgage = /(?:si|sí|necesito|quiero|me interesa).*(?:crédito|hipoteca|financiamiento)/i.test(body) ||
                           /(?:no tengo|sin).*(?:efectivo|dinero|recursos)/i.test(body);
      const hasMortgage = /(?:ya tengo|tengo aprobado|cuento con).*(?:crédito|hipoteca)/i.test(body);
      const noMortgage = /(?:no necesito|no quiero|de contado|efectivo)/i.test(body);

      let mortgageData = lead.mortgage_data || {};
      let needsMortgageStatus = lead.needs_mortgage;

      if (incomeMatch) {
        mortgageData.monthly_income = parseFloat(incomeMatch[1].replace(/,/g, ''));
      }
      if (debtMatch) {
        mortgageData.current_debt = parseFloat(debtMatch[1].replace(/,/g, ''));
      }
      if (downPaymentMatch) {
        mortgageData.down_payment = parseFloat(downPaymentMatch[1].replace(/,/g, ''));
      }'''

new_block = '''      // Parsing con multiplicadores
      const needsMortgage = /(?:si|sí|necesito|quiero|me interesa).*(?:crédito|hipoteca|financiamiento)/i.test(body) ||
                           /(?:no tengo|sin).*(?:efectivo|dinero|recursos)/i.test(body);
      const hasMortgage = /(?:ya tengo|tengo aprobado|cuento con).*(?:crédito|hipoteca)/i.test(body);
      const noMortgage = /(?:no necesito|no quiero|de contado|efectivo)/i.test(body);

      let mortgageData = lead.mortgage_data || {};
      let needsMortgageStatus = lead.needs_mortgage;

      // INGRESO
      const incomeMatch = body.match(/(?:gano|ingreso|sueldo|salario)[^\\d]{0,20}(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?/i);
      if (incomeMatch) {
        let amount = parseFloat(incomeMatch[1].replace(/,/g, ''));
        const mult = incomeMatch[2];
        if (mult && /millón(?:es)?/i.test(mult)) amount *= 1000000;
        else if (mult && /mil/i.test(mult)) amount *= 1000;
        mortgageData.monthly_income = amount;
      }

      // DEUDAS
      const hasNoDebt = /(?:no|sin|cero)\\s+(?:tengo)?\\s*(?:deuda|adeudo)/i.test(body);
      if (hasNoDebt) {
        mortgageData.current_debt = 0;
      } else {
        const debtMatch = body.match(/(?:deuda|adeudo|debo)[^\\d]{0,20}(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?/i);
        if (debtMatch) {
          let amount = parseFloat(debtMatch[1].replace(/,/g, ''));
          const mult = debtMatch[2];
          if (mult && /millón(?:es)?/i.test(mult)) amount *= 1000000;
          else if (mult && /mil/i.test(mult)) amount *= 1000;
          mortgageData.current_debt = amount;
        }
      }

      // ENGANCHE
      const downPaymentMatch = body.match(/(?:enganche|ahorro)[^\\d]{0,20}(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?/i);
      if (downPaymentMatch) {
        let amount = parseFloat(downPaymentMatch[1].replace(/,/g, ''));
        const mult = downPaymentMatch[2];
        if (mult && /millón(?:es)?/i.test(mult)) amount *= 1000000;
        else if (mult && /mil/i.test(mult)) amount *= 1000;
        mortgageData.down_payment = amount;
      }

      console.log('💰 PARSEADO:', {
        ingreso: mortgageData.monthly_income,
        deudas: mortgageData.current_debt,
        enganche: mortgageData.down_payment
      });'''

content = content.replace(old_block, new_block)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Regex y multiplicadores arreglados")
