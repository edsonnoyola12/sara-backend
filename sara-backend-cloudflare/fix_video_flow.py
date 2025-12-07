with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

# Buscar la línea con "return;" después de updateLead en el bloque de video
fixed_lines = []
for i, line in enumerate(lines):
    if i > 0 and 'await this.supabase.updateLead(lead.id, { property_interest: matchedProperty.name });' in lines[i-1] and line.strip() == 'return;':
        # Comentar el return
        fixed_lines.append('        // return; // Continuamos el flujo para que Gemini procese\n')
    else:
        fixed_lines.append(line)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(fixed_lines)
    
print("✅ Return después de video eliminado")
