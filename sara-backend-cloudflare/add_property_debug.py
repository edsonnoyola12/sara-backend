with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Agregar log de las palabras buscadas
old = """// Si no encontró, buscar por palabras clave
      if (!matchedProperty) {
        const words = bodyLower.split(' ');"""

new = """// Si no encontró, buscar por palabras clave
      if (!matchedProperty) {
        const words = bodyLower.split(' ');
        console.log('🔍 Palabras a buscar:', words.filter(w => w.length > 3));"""

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
print("✅ Debug logs agregados")
