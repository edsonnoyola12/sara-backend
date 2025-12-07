with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Cambiar lógica de matching
old = """let matchedProperty = null;
      for (const prop of properties) {
        if (body.toLowerCase().includes(prop.name.toLowerCase())) {
          matchedProperty = prop;
          break;
        }
      }"""

new = """let matchedProperty = null;
      const bodyLower = body.toLowerCase();
      
      // Buscar coincidencia directa
      for (const prop of properties) {
        if (prop.name.toLowerCase().includes(bodyLower) || bodyLower.includes(prop.name.toLowerCase())) {
          matchedProperty = prop;
          break;
        }
      }
      
      // Si no encontró, buscar por palabras clave
      if (!matchedProperty) {
        const words = bodyLower.split(' ');
        for (const word of words) {
          if (word.length > 3) { // palabras de más de 3 letras
            for (const prop of properties) {
              if (prop.name.toLowerCase().includes(word)) {
                matchedProperty = prop;
                console.log('🔍 Encontrada por keyword "' + word + '":', prop.name);
                break;
              }
            }
            if (matchedProperty) break;
          }
        }
      }"""

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
print("✅ Matching arreglado")
