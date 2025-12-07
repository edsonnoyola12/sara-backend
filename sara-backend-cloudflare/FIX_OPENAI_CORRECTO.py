with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar y reemplazar la llamada incorrecta a OpenAI
old_call = '''          const extraction = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: extractionPrompt }],
            response_format: { type: "json_object" }
          });
          
          const aiData = JSON.parse(extraction.choices[0].message.content);'''

new_call = '''          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.openai['apiKey']}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: extractionPrompt }],
              response_format: { type: "json_object" },
              temperature: 0.3
            })
          });
          
          const extraction = await res.json();
          const aiData = JSON.parse(extraction.choices[0].message.content);'''

content = content.replace(old_call, new_call)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ OpenAI arreglado con fetch")
