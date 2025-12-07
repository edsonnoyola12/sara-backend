with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# BUSCAR el bloque completo de parsing financiero y REEMPLAZARLO
# Buscar desde "Detectar necesidad de hipoteca" hasta antes de crear la hipoteca

# Encontrar inicio del bloque
inicio = content.find('// Detectar necesidad de hipoteca')
if inicio == -1:
    print("❌ No encontré el bloque de parsing")
    exit(1)

# Encontrar fin del bloque (justo antes de crear hipoteca)
fin = content.find("await this.supabase.client.from('mortgage_applications').insert([", inicio)
if fin == -1:
    print("❌ No encontré donde termina el parsing")
    exit(1)

# NUEVO BLOQUE COMPLETO DE PARSING
nuevo_bloque = '''// Detectar necesidad de hipoteca
      const needsMortgage = /(?:crédito|credito|hipoteca|financiamiento|asesor)/i.test(body);
      
      let mortgageData: any = {
        monthly_income: 0,
        current_debt: 0,
        down_payment: 0
      };

      if (needsMortgage) {
        // INGRESO MENSUAL
        const incomeMatch = body.match(/(\\d[\\d,\\.]*)\\s*(?:mil|millones?|millón(?:es)?)?.*?(?:gano|ingreso|salario|mensual)/i);
        if (incomeMatch) {
          let rawIncome = incomeMatch[1].replace(/,/g, '');
          const fullMatch = body.substring(incomeMatch.index || 0, (incomeMatch.index || 0) + 100);
          
          if (/millón(?:es)?/i.test(fullMatch)) {
            rawIncome = (parseFloat(rawIncome) * 1000000).toString();
          } else if (/\\bmil\\b/i.test(fullMatch) && !/millón/i.test(fullMatch)) {
            rawIncome = (parseFloat(rawIncome) * 1000).toString();
          }
          mortgageData.monthly_income = parseFloat(rawIncome);
        }

        // DEUDAS - Buscar "deuda/adeudo" PRIMERO, luego el número DESPUÉS
        const hasNoDebt = /(?:no|sin|cero|nada)\\s+(?:tengo|tiene)?\\s*(?:deuda|adeudo)/i.test(body);
        
        if (hasNoDebt) {
          mortgageData.current_debt = 0;
        } else {
          const debtMatch = body.match(/(?:deuda|adeudo)[^\\d]{0,30}(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?/i);
          if (debtMatch) {
            let rawDebt = debtMatch[1].replace(/,/g, '');
            const multiplier = debtMatch[2];
            
            if (multiplier && /millón(?:es)?/i.test(multiplier)) {
              rawDebt = (parseFloat(rawDebt) * 1000000).toString();
            } else if (multiplier && /mil/i.test(multiplier)) {
              rawDebt = (parseFloat(rawDebt) * 1000).toString();
            }
            mortgageData.current_debt = parseFloat(rawDebt);
          }
        }

        // ENGANCHE - Buscar "enganche/ahorro" PRIMERO, luego el número DESPUÉS
        const downPaymentMatch = body.match(/(?:enganche|ahorro)[^\\d]{0,30}(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?/i);
        if (downPaymentMatch) {
          let rawDown = downPaymentMatch[1].replace(/,/g, '');
          const multiplier = downPaymentMatch[2];
          
          if (multiplier && /millón(?:es)?/i.test(multiplier)) {
            rawDown = (parseFloat(rawDown) * 1000000).toString();
          } else if (multiplier && /mil/i.test(multiplier)) {
            rawDown = (parseFloat(rawDown) * 1000).toString();
          }
          mortgageData.down_payment = parseFloat(rawDown);
        }

        console.log('💰 DATOS FINANCIEROS PARSEADOS:', {
          ingreso: mortgageData.monthly_income,
          deudas: mortgageData.current_debt,
          enganche: mortgageData.down_payment
        });

        // Crear hipoteca
        '''

# Reemplazar el bloque viejo con el nuevo
content = content[:inicio] + nuevo_bloque + content[fin:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ PARSING COMPLETO REESCRITO")
print("")
print("CAMBIOS:")
print("1. Busca palabra clave PRIMERO (deuda, enganche)")
print("2. Captura número DESPUÉS de la palabra")
print("3. Aplica multiplicador correcto")
print("4. Log claro de valores parseados")
