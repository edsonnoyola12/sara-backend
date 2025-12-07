with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. ARREGLAR debtMatch - Agregar detección de "no tengo deudas"
old_debt_block = '''      if (debtMatch) {
        let rawDebt = debtMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(debtMatch.index);
        if (/mill[oó]n/i.test(fullMatch.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000000).toString();
        } else if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000).toString();
        }
        mortgageData.current_debt = parseFloat(rawDebt);
      }'''

new_debt_block = '''      // Detectar "no tengo deudas" PRIMERO
      const hasNoDebt = /(?:no|sin|cero|nada)\\s+(?:tengo|tiene)?\\s*(?:deuda|adeudo)/i.test(body);
      
      if (hasNoDebt) {
        mortgageData.current_debt = 0;
      } else if (debtMatch) {
        let rawDebt = debtMatch[1].replace(/,/g, '');
        const fullMatch = body.substring(debtMatch.index, debtMatch.index + 100);
        if (/millón(?:es)?/i.test(fullMatch)) {
          rawDebt = (parseFloat(rawDebt) * 1000000).toString();
        } else if (/\\bmil\\b/i.test(fullMatch) && !/millón/i.test(fullMatch)) {
          rawDebt = (parseFloat(rawDebt) * 1000).toString();
        }
        mortgageData.current_debt = parseFloat(rawDebt);
      }'''

content = content.replace(old_debt_block, new_debt_block)

# 2. ARREGLAR downPaymentMatch - Cambiar regex para NO agarrar "tengo" en contexto de deudas
old_down_regex = "const downPaymentMatch = body.match(/(?:enganche|ahorro|tengo).*?(\\d[\\d,\\.]*)

/i);"
new_down_regex = "const downPaymentMatch = body.match(/(?:enganche|ahorro).*?(\\d[\\d,\\.]*)|(?:tengo)\\s+([0-9.]+)\\s*(?:mill)/i);"

content = content.replace(old_down_regex, new_down_regex)

# 3. ARREGLAR procesamiento de downPaymentMatch para usar grupo correcto
old_down_process = '''      if (downPaymentMatch) {
        let rawDown = downPaymentMatch[1].replace(/,/g, '');'''

new_down_process = '''      if (downPaymentMatch) {
        // Puede estar en grupo 1 o 2
        let rawDown = (downPaymentMatch[1] || downPaymentMatch[2] || '0').replace(/,/g, '');'''

content = content.replace(old_down_process, new_down_process)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Arreglado correctamente")
