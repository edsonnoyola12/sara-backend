import re

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. Encontrar donde se procesan los datos financieros y agregar IA ANTES
insert_point = content.find("const incomeMatch = body.match")

if insert_point == -1:
    print("❌ No encontré incomeMatch")
    exit(1)

# Código de IA para extraer datos
ai_extraction = '''
      // 🤖 USAR IA PARA EXTRAER DATOS FINANCIEROS
      if (/(?:gano|ingreso|deuda|enganche|crédito|hipoteca|asesor|financiamiento)/i.test(body)) {
        try {
          const extractionPrompt = `Analiza este mensaje y extrae la información financiera. Responde SOLO con JSON válido:
{
  "monthly_income": número en pesos (ej: "40 mil" = 40000, "2 millones" = 2000000),
  "current_debt": número en pesos (si dice "no tengo deudas" = 0),
  "down_payment": número en pesos (ej: "200 mil" = 200000),
  "needs_mortgage": true si menciona crédito/hipoteca/financiamiento,
  "needs_advisor": true si menciona "asesor" explícitamente
}

Mensaje: "${body}"`;

          const extraction = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: extractionPrompt }],
            response_format: { type: "json_object" }
          });
          
          const aiData = JSON.parse(extraction.choices[0].message.content);
          console.log('🤖 IA extrajo:', aiData);
          
          if (aiData.monthly_income) mortgageData.monthly_income = aiData.monthly_income;
          if (aiData.current_debt !== undefined) mortgageData.current_debt = aiData.current_debt;
          if (aiData.down_payment) mortgageData.down_payment = aiData.down_payment;
          if (aiData.needs_mortgage !== undefined) needsMortgageStatus = aiData.needs_mortgage;
          
          // NOTIFICAR ASESOR SI LO PIDIÓ EXPLÍCITAMENTE
          if (aiData.needs_advisor) {
            console.log('🔔 Cliente pidió asesor explícitamente');
            needsMortgageStatus = true;
          }
        } catch (err) {
          console.error('❌ Error IA:', err);
        }
      }

'''

content = content[:insert_point] + ai_extraction + '\n      ' + content[insert_point:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ IA agregada correctamente")
