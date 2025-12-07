with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

old_insert = """            // Guardar cita en Supabase
            const { data: appt } = await this.supabase.client.from('appointments').insert([{"""

new_insert = """            // Guardar cita en Supabase
            const { data: appt, error: apptError } = await this.supabase.client.from('appointments').insert([{"""

content = content.replace(old_insert, new_insert)

old_log = """            console.log('📅 CITA GUARDADA EN DB:', appt?.id);"""

new_log = """            if (apptError) {
              console.error('❌ ERROR AL GUARDAR CITA:', apptError);
            }
            console.log('📅 CITA GUARDADA EN DB:', appt?.id);"""

content = content.replace(old_log, new_log)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Error logging agregado")
