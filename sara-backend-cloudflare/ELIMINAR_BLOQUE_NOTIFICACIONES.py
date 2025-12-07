with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Eliminar TODO el bloque de notificaciones problemático
# Buscar desde "for (const v of vendedores)" hasta su cierre

import re

# Patrón para encontrar el for loop completo
pattern = r'for \(const v of vendedores\) \{[^}]*\{[^}]*\}[^}]*\}'

# Intentar encontrar y eliminar
match = re.search(pattern, content, re.DOTALL)
if match:
    content = content[:match.start()] + '\n        // Notificaciones movidas a nueva arquitectura\n' + content[match.end():]
    print("✅ Bloque de notificaciones eliminado")
else:
    # Método manual: buscar y eliminar línea por línea
    lines = content.split('\n')
    new_lines = []
    skip = False
    brace_count = 0
    
    for i, line in enumerate(lines):
        if 'for (const v of vendedores)' in line:
            skip = True
            brace_count = 0
            new_lines.append('        // Notificaciones movidas a nueva arquitectura')
            continue
            
        if skip:
            if '{' in line:
                brace_count += line.count('{')
            if '}' in line:
                brace_count -= line.count('}')
                if brace_count <= 0:
                    skip = False
            continue
        
        new_lines.append(line)
    
    content = '\n'.join(new_lines)
    print("✅ Bloque eliminado manualmente")

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

