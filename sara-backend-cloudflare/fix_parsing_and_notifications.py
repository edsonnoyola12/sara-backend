with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. Fix parsing "mil" - agregar contexto más largo
content = content.replace(
    '''const debtMatch = body.match(/(?:debo|deuda|adeudo|cr[eé]ditos?).*?(\\d+(?:\\.\\d+)?)/i);
        if (debtMatch) {
          const debtContext = body.substring(Math.max(0, debtMatch.index! - 15), debtMatch.index! + 30);
          // Check for "no debo" or "sin deuda"
          if (/(?:no|sin|cero)\\s+(?:debo|deuda|adeudo)/i.test(debtContext)) {
            mortgageData.current_debt = 0;
          } else {
            let rawDebt = debtMatch[1];
            if (/mill[oó]n/i.test(debtContext.substring(0, 30))) {
              rawDebt = (parseFloat(rawDebt) * 1000000).toString();
            } else if (/mil/i.test(debtContext.substring(0, 30))) {
              rawDebt = (parseFloat(rawDebt) * 1000).toString();
            }
            mortgageData.current_debt = parseFloat(rawDebt);
          }
        }''',
    '''const debtMatch = body.match(/(?:debo|deuda|adeudo|cr[eé]ditos?).*?(\\d+(?:\\.\\d+)?)/i);
        if (debtMatch) {
          const fullMatch = body.substring(Math.max(0, debtMatch.index! - 10), Math.min(body.length, debtMatch.index! + 50));
          // Check for "no debo" or "sin deuda"
          if (/(?:no|sin|cero)\\s+(?:debo|deuda|adeudo)/i.test(fullMatch)) {
            mortgageData.current_debt = 0;
          } else {
            let rawDebt = debtMatch[1];
            if (/mill[oó]n/i.test(fullMatch)) {
              rawDebt = (parseFloat(rawDebt) * 1000000).toString();
            } else if (/mil(?!l[oó]n)/i.test(fullMatch)) {
              rawDebt = (parseFloat(rawDebt) * 1000).toString();
            }
            mortgageData.current_debt = parseFloat(rawDebt);
          }
        }'''
)

# 2. Fix parsing "millones" en enganche
content = content.replace(
    '''const downMatch = body.match(/(?:enganche|inicial|anticipo|tengo|cuento con|dispongo).*?(\\d+(?:\\.\\d+)?)/i);
        if (downMatch) {
          const downContext = body.substring(Math.max(0, downMatch.index! - 10), downMatch.index! + 50);
          let rawDown = downMatch[1];
          if (/mill[oó]n/i.test(downContext)) {
            rawDown = (parseFloat(rawDown) * 1000000).toString();
          } else if (/mil/i.test(downContext.substring(0, 30))) {
            rawDown = (parseFloat(rawDown) * 1000).toString();
          }
          mortgageData.down_payment = parseFloat(rawDown);
        }''',
    '''const downMatch = body.match(/(?:enganche|inicial|anticipo|tengo|cuento con|dispongo).*?(\\d+(?:\\.\\d+)?)/i);
        if (downMatch) {
          const fullMatch = body.substring(Math.max(0, downMatch.index! - 10), Math.min(body.length, downMatch.index! + 60));
          let rawDown = downMatch[1];
          if (/mill[oó]n/i.test(fullMatch)) {
            rawDown = (parseFloat(rawDown) * 1000000).toString();
          } else if (/mil(?!l[oó]n)/i.test(fullMatch)) {
            rawDown = (parseFloat(rawDown) * 1000).toString();
          }
          mortgageData.down_payment = parseFloat(rawDown);
        }'''
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Parsing mejorado")
