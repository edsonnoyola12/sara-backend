with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

old = """await this.supabase.client.from('mortgage_applications').insert([{"""

new = """const mortgageInsert = await this.supabase.client.from('mortgage_applications').insert([{"""

content = content.replace(old, new)

old = """console.log('🏦 Solicitud hipotecaria creada para:', clientName);"""

new = """if (mortgageInsert.error) {
            console.error('❌ Error creando hipoteca:', mortgageInsert.error);
          } else {
            console.log('🏦 Solicitud hipotecaria creada:', mortgageInsert.data);
          }"""

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
print("✅ Error logging agregado")
