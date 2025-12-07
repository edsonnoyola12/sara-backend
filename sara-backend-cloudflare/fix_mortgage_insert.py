with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

old = "const mortgageInsert = await this.supabase.client.from('mortgage_applications').insert([{"
new = "const mortgageInsert = await this.supabase.client.from('mortgage_applications').insert([{"

# Encontrar el cierre del insert y agregar .select().single()
old_end = """status: 'pending'
          }])"""
new_end = """status: 'pending'
          }]).select().single()"""

content = content.replace(old_end, new_end)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
print("✅ SELECT agregado al INSERT")
