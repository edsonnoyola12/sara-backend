with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el bloque de confirmación y mejorarlo
old_confirm = '''// CONFIRMAR CITA
      if (/confirmar|confirmo|sí|si|dale|ok/i.test(body) && lead.notes?.pending_appointment) {'''

new_confirm = '''// CONFIRMAR CITA
      if ((/confirmar|confirmo|sí|si|dale|ok/i.test(body)) && lead.notes?.pending_appointment) {
        console.log('✅ Confirmando cita pendiente');'''

content = content.replace(old_confirm, new_confirm)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Confirmación mejorada")
