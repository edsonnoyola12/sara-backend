with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Encontrar y eliminar el bloque COMPLETO de sugerencias mal escapado
start_marker = "// SUGERENCIAS INTELIGENTES"
end_marker = "const catalogoProps = properties.map"

start_pos = content.find(start_marker)
end_pos = content.find(end_marker)

if start_pos > 0 and end_pos > start_pos:
    # Eliminar el bloque malo
    content = content[:start_pos] + content[end_pos:]
    print("✅ Bloque problemático eliminado")
    
    # Insertar el bloque correcto (sin escapes extras)
    sugerencias_correcto = """// SUGERENCIAS INTELIGENTES
      const pideSugerencia = /(?:qué me recomiendas|no sé cuál|cuál me conviene|recomiéndame)/i.test(body);
      if (pideSugerencia && !matchedProperty) {
        if (mortgageData.down_payment) {
          const sugeridas = sugerirPropiedadesPorPresupuesto(mortgageData.down_payment * 5, 3);
          if (sugeridas.length > 0) {
            const listaSugeridas = sugeridas.map(nombre => {
              const precio = getPrecioActual(nombre);
              return `• ${nombre}: $${(precio / 1000000).toFixed(1)}M`;
            }).join('\\n');
            await this.twilio.sendWhatsAppMessage(
              from,
              `💡 Basado en tu presupuesto, te recomiendo:\\n\\n${listaSugeridas}\\n\\n¿Cuál te gustaría ver?`
            );
            return;
          }
        } else {
          await this.twilio.sendWhatsAppMessage(
            from,
            '💡 Para recomendarte algo ideal, ¿cuánto tienes de enganche aproximadamente?'
          );
          return;
        }
      }

      """
    
    # Insertar ANTES de catalogoProps
    catalog_pos = content.find("const catalogoProps = properties.map")
    content = content[:catalog_pos] + sugerencias_correcto + content[catalog_pos:]
    print("✅ Bloque correcto insertado")
else:
    print("❌ No se encontraron los marcadores")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ ARCHIVO CORREGIDO")
