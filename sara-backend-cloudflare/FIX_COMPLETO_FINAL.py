with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. VER QUÉ REGEX TIENE AHORA
import re
current_regex = re.search(r'const downPaymentMatch = body\.match\((.*?)\);', content)
print(f"REGEX ACTUAL: {current_regex.group(1) if current_regex else 'NO ENCONTRADO'}")

# 2. REEMPLAZAR CON REGEX QUE SÍ FUNCIONA
content = re.sub(
    r'const downPaymentMatch = body\.match\(.*?\);',
    r'const downPaymentMatch = body.match(/(\d[\d,\.]*)\s*(millones?|mill[oó]n(?:es)?|mil)?\s*(?:de\s+)?(?:enganche|ahorro)/i);',
    content
)

# 3. ASEGURAR que el código de procesamiento use grupo 2
old_process = r'console\.log\(\'💰 downPaymentMatch:\', downPaymentMatch\);[\s\S]*?mortgageData\.down_payment = parseFloat\(rawDown\);\s+}'

new_process = '''console.log('💰 downPaymentMatch:', downPaymentMatch);
      if (downPaymentMatch) {
        console.log('  Grupo 1 (número):', downPaymentMatch[1]);
        console.log('  Grupo 2 (multiplicador):', downPaymentMatch[2]);
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const multiplier = downPaymentMatch[2];
        
        console.log('  rawDown:', rawDown, 'multiplier:', multiplier);
        
        if (multiplier && /mill[oó]n(?:es)?/i.test(multiplier)) {
          rawDown = (parseFloat(rawDown) * 1000000).toString();
          console.log('  Multiplicado por millón:', rawDown);
        } else if (multiplier && /\\bmil\\b/i.test(multiplier)) {
          rawDown = (parseFloat(rawDown) * 1000).toString();
          console.log('  Multiplicado por mil:', rawDown);
        }
        mortgageData.down_payment = parseFloat(rawDown);
        console.log('  FINAL down_payment:', mortgageData.down_payment);
      }'''

content = re.sub(old_process, new_process, content, flags=re.DOTALL)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("\n✅ REGEX Y CÓDIGO ARREGLADOS")
