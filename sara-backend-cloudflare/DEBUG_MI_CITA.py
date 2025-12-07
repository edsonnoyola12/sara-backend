with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el bloque de "mi cita"
old_mi_cita = '''      // COMANDO: VER MI CITA
      if ((bodyLower.includes('mi cita') || bodyLower.includes('mis citas')) && !isTeamMember) {
        const { data: appointments } = await this.supabase.client
          .from('appointments')
          .select('*, properties(*)')
          .eq('lead_phone', cleanPhone)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true });'''

new_mi_cita = '''      // COMANDO: VER MI CITA
      if ((bodyLower.includes('mi cita') || bodyLower.includes('mis citas')) && !isTeamMember) {
        console.log('🔍 Buscando citas para:', cleanPhone);
        
        const { data: appointments, error } = await this.supabase.client
          .from('appointments')
          .select('*, properties(*)')
          .eq('lead_phone', cleanPhone)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true });
        
        console.log('📅 Citas encontradas:', appointments?.length, 'Error:', error);'''

content = content.replace(old_mi_cita, new_mi_cita)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Debug agregado")
