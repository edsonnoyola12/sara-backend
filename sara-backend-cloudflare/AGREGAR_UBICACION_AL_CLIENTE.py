with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Buscar donde se construye el prompt de SARA y agregar ubicación
marker = """${citaDetectada ? `- Cita agendada: ${citaDetectada.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}

Instrucciones:"""

replacement = """${citaDetectada ? `- Cita agendada: ${citaDetectada.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
${mapsLink ? `- Ubicación de la propiedad: ${mapsLink}` : ''}

Instrucciones:"""

content = content.replace(marker, replacement)

# Ahora agregar en las instrucciones que incluya la ubicación en la respuesta
old_instructions = """Instrucciones:
1. Confirma SIEMPRE la información que el cliente proporcionó (${ingresoMensual ? 'ingreso' : ''}${deudasMensuales !== null ? ', deudas' : ''}${enganche ? ', enganche' : ''}${citaDetectada ? ', cita' : ''})
2. Si falta información financiera, pregunta de forma natural
3. Si ya tiene cita agendada, confírmala y menciona que su asesor se pondrá en contacto
4. Sé cálida, profesional y breve
5. NO uses emojis
6. Máximo 3 líneas"""

new_instructions = """Instrucciones:
1. Confirma SIEMPRE la información que el cliente proporcionó (${ingresoMensual ? 'ingreso' : ''}${deudasMensuales !== null ? ', deudas' : ''}${enganche ? ', enganche' : ''}${citaDetectada ? ', cita' : ''})
2. Si falta información financiera, pregunta de forma natural
3. Si ya tiene cita agendada, confírmala, menciona que su asesor se pondrá en contacto, e INCLUYE la ubicación de Google Maps en tu respuesta
4. Sé cálida, profesional y breve
5. NO uses emojis
6. Máximo 4 líneas si incluyes ubicación"""

content = content.replace(old_instructions, new_instructions)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Ubicación agregada al contexto de SARA")
print("✅ SARA ahora incluirá el link de Maps en su respuesta al cliente")
