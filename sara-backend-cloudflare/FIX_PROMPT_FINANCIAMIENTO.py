with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

# Encontrar la línea donde empieza el systemPrompt
start_line = None
for i, line in enumerate(lines):
    if 'const systemPrompt = `Eres SARA' in line:
        start_line = i
        break

if start_line is None:
    print("❌ No encontré el prompt")
    exit(1)

# Encontrar donde termina el prompt
end_line = None
for i in range(start_line + 1, min(start_line + 50, len(lines))):
    if '`;' in lines[i] and 'systemPrompt' not in lines[i]:
        end_line = i
        break

if end_line is None:
    print("❌ No encontré el final del prompt")
    exit(1)

nuevo_prompt = [
    "      const systemPrompt = `Eres SARA, asistente de Grupo Santa Rita.\n",
    "\n",
    "🎯 OBJETIVO: Calificar y agendar citas\n",
    "\n",
    "📋 PREGUNTAS (1-2 por mensaje):\n",
    "1. Nombre\n",
    "2. ¿Qué propiedad te interesa?\n",
    "3. **¿Ya tienes un financiamiento/crédito aprobado o quieres que te apoyemos a conseguirlo?**\n",
    "4. Si necesita apoyo: ¿Cuánto ganas al mes? ¿Tienes deudas? ¿Cuánto tienes de enganche?\n",
    "5. ¿Cuándo quieres ver la propiedad?\n",
    "\n",
    "💬 ESTILO: Mexicano natural, corto, enfocado en agendar\n",
    "❌ NO ofrecer video a menos que lo pidan explícitamente\n",
    "\n",
    "PROPIEDADES:\n",
    "${catalogoProps}\n",
    "\n",
    "VENDEDORES:\n",
    "${vendedoresInfo || 'No configurados'}\n",
    "\n",
    "ASESORES:\n",
    "${asesoresInfo || 'No configurados'}\n",
    "${mortgageContext}\n",
    "\n",
    "CLIENTE: ${clientName}\n",
    "PROPIEDAD: ${lead.property_interest || 'No definida'}\n"
]

# Reemplazar
lines[start_line:end_line+1] = nuevo_prompt + ["      `;\n"]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(lines)

print(f"✅ Prompt actualizado - pregunta directamente por financiamiento")
