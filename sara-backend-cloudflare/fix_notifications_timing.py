with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
vendedor_notification_block = []
capturing_vendedor_block = False
vendedor_block_start = -1

# PASO 1: Encontrar y remover el bloque de notificación de vendedores
for i, line in enumerate(lines):
    if '🔔 Vendedores notificados' in line or (capturing_vendedor_block and i < vendedor_block_start + 10):
        if not capturing_vendedor_block:
            capturing_vendedor_block = True
            vendedor_block_start = i - 5  # Incluir las líneas anteriores del for
        vendedor_notification_block.append(line)
        continue
    
    if capturing_vendedor_block and 'for (const v of vendedores)' in line:
        vendedor_notification_block.append(line)
        continue
        
    if capturing_vendedor_block and line.strip().startswith('}') and i > vendedor_block_start + 8:
        vendedor_notification_block.append(line)
        capturing_vendedor_block = False
        continue
    
    if not capturing_vendedor_block:
        new_lines.append(line)

# PASO 2: Buscar donde insertar la notificación de vendedores (después del procesamiento de IA)
final_lines = []
inserted = False

for i, line in enumerate(new_lines):
    final_lines.append(line)
    
    # Insertar después de actualizar el lead con la respuesta de IA
    if 'await this.supabase.updateLead(lead.id' in line and 'conversation_history' in line and not inserted:
        # Agregar notificación de vendedores aquí
        final_lines.append('\n      // Notificar vendedores CON datos completos\n')
        final_lines.append('      for (const v of vendedores) {\n')
        final_lines.append('        if (v.phone) {\n')
        final_lines.append('          await this.twilio.sendWhatsAppMessage(\n')
        final_lines.append("            'whatsapp:' + v.phone,\n")
        final_lines.append("            `🆕 Nuevo lead!\\n👤 ${clientName || 'Sin nombre'}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${lead.score || 5}\\n\\n✅ Asignado a ti`\n")
        final_lines.append('          );\n')
        final_lines.append('        }\n')
        final_lines.append('      }\n')
        final_lines.append('      console.log(\'🔔 Vendedores notificados con datos completos\');\n\n')
        inserted = True

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(final_lines)

print("✅ Paso 1: Notificación vendedores movida")
