with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Agregar console.log justo después de encontrar downPaymentMatch
old = '''      if (downPaymentMatch) {
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const multiplier = downPaymentMatch[2];'''

new = '''      console.log('💰 downPaymentMatch:', downPaymentMatch);
      if (downPaymentMatch) {
        console.log('  Grupo 1 (número):', downPaymentMatch[1]);
        console.log('  Grupo 2 (multiplicador):', downPaymentMatch[2]);
        let rawDown = downPaymentMatch[1].replace(/,/g, '');
        const multiplier = downPaymentMatch[2];'''

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Logs de debug agregados")
