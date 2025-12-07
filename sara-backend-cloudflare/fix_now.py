with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

old = '''      if (downPaymentMatch) {
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(downPaymentMatch.index, downPaymentMatch.index + 100);
        // Verificar millones PRIMERO (más específico)
        if (/millón(?:es)?/i.test(fullMatch)) {
          rawDown = (parseFloat(rawDown) * 1000000).toString();
        } else if (/\\bmil\\b/i.test(fullMatch) && !/millón/i.test(fullMatch)) {
          rawDown = (parseFloat(rawDown) * 1000).toString();
        }
        mortgageData.down_payment = parseFloat(rawDown);
      }'''

new = '''      if (downPaymentMatch) {
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const multiplier = downPaymentMatch[2]; // "millones", "millón", "mil"
        
        if (multiplier && /mill[oó]n(?:es)?/i.test(multiplier)) {
          rawDown = (parseFloat(rawDown) * 1000000).toString();
        } else if (multiplier && /\\bmil\\b/i.test(multiplier)) {
          rawDown = (parseFloat(rawDown) * 1000).toString();
        }
        mortgageData.down_payment = parseFloat(rawDown);
      }'''

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ ARREGLADO")
