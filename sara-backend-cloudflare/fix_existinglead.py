with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar donde se busca el lead existente y agregar flag
old_lead_check = '''const { data: lead, error: leadError } = await this.supabase.getLeadByPhone(from);'''

new_lead_check = '''const { data: lead, error: leadError } = await this.supabase.getLeadByPhone(from);
    let isNewLead = false;'''

content = content.replace(old_lead_check, new_lead_check)

# Cuando se crea el lead, marcar como nuevo
old_create = '''console.log('✅ Lead creado:', newLead.data);
        lead = newLead.data;'''

new_create = '''console.log('✅ Lead creado:', newLead.data);
        lead = newLead.data;
        isNewLead = true;'''

content = content.replace(old_create, new_create)

# Cambiar condición de existingLead a isNewLead
content = content.replace(
    'if (!existingLead) {',
    'if (isNewLead) {'
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Variable isNewLead agregada")
