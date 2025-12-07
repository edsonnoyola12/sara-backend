with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Cambiar substring(0, 50) a substring(0, 25) en todos
content = content.replace('.substring(0, 50)', '.substring(0, 25)')

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Contexto reducido")
