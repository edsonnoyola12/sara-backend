with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Reemplazar getTeamMemberById por query directo
old_code = '''          // NOTIFICAR AL VENDEDOR con datos completos
          if (lead.assigned_to) {
            const vendedor = await this.supabase.getTeamMemberById(lead.assigned_to);
            if (vendedor && vendedor.whatsapp_number) {'''

new_code = '''          // NOTIFICAR AL VENDEDOR con datos completos
          if (lead.assigned_to) {
            const { data: vendedor } = await this.supabase.client
              .from('team_members')
              .select('*')
              .eq('id', lead.assigned_to)
              .single();
            if (vendedor && vendedor.whatsapp_number) {'''

content = content.replace(old_code, new_code)

# También arreglar la notificación de contado
old_contado = '''      if (hasBasicInfo && !needsCredit && lead.assigned_to) {
        const vendedor = await this.supabase.getTeamMemberById(lead.assigned_to);
        if (vendedor && vendedor.whatsapp_number) {'''

new_contado = '''      if (hasBasicInfo && !needsCredit && lead.assigned_to) {
        const { data: vendedor } = await this.supabase.client
          .from('team_members')
          .select('*')
          .eq('id', lead.assigned_to)
          .single();
        if (vendedor && vendedor.whatsapp_number) {'''

content = content.replace(old_contado, new_contado)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Queries a team_members arreglados")
