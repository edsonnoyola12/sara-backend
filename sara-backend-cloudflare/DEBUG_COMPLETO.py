with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Agregar log ANTES de crear hipoteca
old_hipoteca_check = "if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {"
new_hipoteca_check = """console.log('🔍 Check hipoteca:', {
        needsMortgageStatus,
        tieneIngreso: !!mortgageData.monthly_income,
        tienePropiedad: !!matchedProperty,
        propiedad: matchedProperty?.name
      });
      
      if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {"""

content = content.replace(old_hipoteca_check, new_hipoteca_check)

# Agregar log de detección de needsMortgage
old_needs = "const needsMortgage = /(?:si|sí|necesito|quiero|me interesa).*(?:crédito|hipoteca|financiamiento)/i.test(body) ||"
new_needs = """const bodyLower = body.toLowerCase();
      const needsMortgage = /(?:si|sí|necesito|quiero|me interesa|apoyo|ayuda).*(?:crédito|hipoteca|financiamiento)/i.test(body) ||"""

content = content.replace(old_needs, new_needs)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Debug agregado")
