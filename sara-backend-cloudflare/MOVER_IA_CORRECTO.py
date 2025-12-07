with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Encontrar y REMOVER el bloque de IA mal ubicado
import re
ai_block = re.search(r'// 🤖 USAR IA PARA EXTRAER DATOS FINANCIEROS[\s\S]*?}\s*}\s*}\s*\n', content)

if ai_block:
    ai_code = ai_block.group(0)
    content = content.replace(ai_code, '')
    print("✅ Removido bloque de IA mal ubicado")
    
    # Insertar DESPUÉS de "let mortgageData = lead.mortgage_data || {};"
    insert_after = "let mortgageData = lead.mortgage_data || {};"
    insert_pos = content.find(insert_after)
    
    if insert_pos > 0:
        insert_pos += len(insert_after)
        content = content[:insert_pos] + '\n' + ai_code + content[insert_pos:]
        print("✅ IA reubicada correctamente DESPUÉS de mortgageData")
    else:
        print("❌ No encontré donde insertar")
else:
    print("❌ No encontré bloque de IA")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

