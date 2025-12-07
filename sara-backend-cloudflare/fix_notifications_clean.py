with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    line_num = i + 1
    
    # Comentar líneas 215 y 218 (notificación vieja vendedores)
    if line_num == 215 or line_num == 218:
        new_lines.append('        // ELIMINADO: ' + line)
    else:
        new_lines.append(line)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(new_lines)

print("✅ Notificaciones viejas comentadas")
