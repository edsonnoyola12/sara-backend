with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Cambiar requested_amount para que sea opcional
old = "requested_amount: matchedProperty.base_price || 0,"
new = "requested_amount: matchedProperty?.base_price || 0,"

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
print("✅ base_price opcional")
