with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Cambiar condición para que NO requiera matchedProperty
old = "if (needsMortgageStatus && mortgageData.monthly_income && matchedProperty) {"
new = "if (needsMortgageStatus && mortgageData.monthly_income) {"

content = content.replace(old, new)

# Cambiar property_id y property_name para que sean opcionales
old = """property_id: matchedProperty.id,
            property_name: matchedProperty.name,"""
new = """property_id: matchedProperty?.id || null,
            property_name: matchedProperty?.name || 'Por definir',"""

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
print("✅ Hipoteca sin propiedad requerida")
