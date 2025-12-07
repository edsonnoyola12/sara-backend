with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    line_num = i + 1
    
    # FIX 1: Línea 364 - Reemplazar notificación al asesor
    if line_num == 364 and 'mortgageData.monthly_income' in line:
        new_lines.append('              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || \'Por definir\'}\\n💰 Ingreso: $${(mortgageInsert.data?.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageInsert.data?.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageInsert.data?.down_payment || 0).toLocaleString()}\\n\\n¡Contactar pronto!`\n')
    
    # FIX 2: Líneas 367-374 - Comentar notificación duplicada a vendedores
    elif 367 <= line_num <= 374:
        new_lines.append('          // ELIMINADO DUPLICADO: ' + line)
    
    else:
        new_lines.append(line)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(new_lines)

print("✅ Fixes aplicados correctamente")
