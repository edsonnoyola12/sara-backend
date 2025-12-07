with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar donde se actualiza el nombre
old_prompt = """        // Actualizar nombre si lo mencionó
        const nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\\s+([A-ZÁ-Úa-zá-ú]+)/i);"""

new_prompt = """        // Actualizar nombre si lo mencionó (capturar nombre completo)
        const nameMatch = body.match(/(?:soy|me llamo|mi nombre es)\\s+([A-ZÁ-Úa-zá-ú]+(?:\\s+[A-ZÁ-Úa-zá-ú]+)*)/i);"""

content = content.replace(old_prompt, new_prompt)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Regex actualizado para capturar nombre completo")
