with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Reemplazar la lógica del multiplicador de enganche
old_logic = '''        console.log('🔍 Enganche capturado:', { numero: downPaymentMatch[1], multiplicador: mult, texto: downPaymentMatch[0] });
        
        if (mult && /millón(?:es)?/i.test(mult)) {
          amount *= 1000000;
        } else if (mult && /^mil$/i.test(mult)) {
          amount *= 1000;
        }'''

new_logic = '''        console.log('🔍 Enganche capturado:', { numero: downPaymentMatch[1], multiplicador: mult, texto: downPaymentMatch[0] });
        
        if (mult) {
          const multLower = mult.toLowerCase();
          if (multLower.includes('millon') || multLower.includes('millón')) {
            amount *= 1000000;
            console.log('✅ Multiplicando por 1,000,000');
          } else if (multLower === 'mil') {
            amount *= 1000;
            console.log('✅ Multiplicando por 1,000');
          }
        }'''

content = content.replace(old_logic, new_logic)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Multiplicador cambiado a comparación simple (includes)")
