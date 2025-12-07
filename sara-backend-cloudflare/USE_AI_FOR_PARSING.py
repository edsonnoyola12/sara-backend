with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar donde está la llamada a OpenAI
# Agregar una segunda llamada SOLO para extraer datos financieros

extraction_code = '''
      // EXTRAER DATOS FINANCIEROS CON IA
      if (/(?:gano|ingreso|deuda|enganche|crédito|hipoteca)/i.test(body)) {
        const extractionPrompt = `Extrae la siguiente información del mensaje. Responde SOLO con JSON:
{
  "monthly_income": número en pesos (si dice "30 mil" = 30000, "2 millones" = 2000000),
  "current_debt": número en pesos (si dice "no tengo deudas" = 0),
  "down_payment": número en pesos del enganche,
  "needs_mortgage": true/false,
  "needs_advisor": true si menciona "asesor" o "crédito"
}

Mensaje: "${body}"`;

        try {
          const extraction = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: extractionPrompt }],
            response_format: { type: "json_object" }
          });
          
          const financialData = JSON.parse(extraction.choices[0].message.content);
          console.log('🤖 IA extrajo:', financialData);
          
          if (financialData.monthly_income) mortgageData.monthly_income = financialData.monthly_income;
          if (financialData.current_debt !== undefined) mortgageData.current_debt = financialData.current_debt;
          if (financialData.down_payment) mortgageData.down_payment = financialData.down_payment;
          if (financialData.needs_mortgage !== undefined) needsMortgageStatus = financialData.needs_mortgage;
        } catch (err) {
          console.error('Error extrayendo con IA:', err);
        }
      }
'''

# Insertar ANTES de crear la hipoteca
insert_point = content.find('if (Object.keys(mortgageData).length > 0 && needsMortgageStatus) {')
if insert_point > 0:
    content = content[:insert_point] + extraction_code + '\n      ' + content[insert_point:]
    print("✅ Código de extracción con IA agregado")
else:
    print("❌ No encontré donde insertar")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

