with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Eliminar TODO el bloque con isNewLead
old_block = '''      // Notificar vendedores y asesor con datos completos (solo en primer mensaje)
      if (isNewLead) {
        const assignedVendedor = vendedores.find(v => v.id === lead.assigned_to);
        
        // Notificar vendedor SIEMPRE
        for (const v of vendedores) {
          if (v.phone) {
            const isAssigned = lead.assigned_to === v.id;
            let message = `🆕 Nuevo lead!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}`;
            
            // Si necesita crédito, agregar datos financieros
            if (needsMortgage && mortgageData.monthly_income) {
              message += `\\n\\n💳 NECESITA CRÉDITO HIPOTECARIO\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageData.down_payment || 0).toLocaleString()}`;
              
              // Agregar nombre del asesor asignado
              const assignedAsesor = vendedores.find(v => v.role === 'asesor');
              if (assignedAsesor) {
                message += `\\n\\n✅ Asignado a: ${assignedAsesor.name}`;
              }
            } else {
              message += isAssigned ? '\\n\\n✅ Asignado a ti' : '';
            }
            
            await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, message);
          }
        }
        console.log('🔔 Vendedor notificado');
        
        // Notificar asesor SOLO si necesita crédito
        if (needsMortgage && mortgageData.monthly_income) {
          const assignedAsesor = vendedores.find(v => v.role === 'asesor');
          if (assignedAsesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageData.down_payment || 0).toLocaleString()}\\n\\n📍 Lead asignado desde: ${assignedVendedor?.name || 'Vendedor'}\\n\\n¡Contactar pronto!`
            );
            console.log('🔔 Asesor notificado');
          }
        }
      }'''

new_block = '''      // Notificar vendedores y asesor (solo en primer mensaje)
      if (history.length <= 2) {
        const assignedVendedor = vendedores.find(v => v.id === lead.assigned_to);
        
        // Notificar vendedor SIEMPRE
        for (const v of vendedores) {
          if (v.phone) {
            const isAssigned = lead.assigned_to === v.id;
            let message = `🆕 Nuevo lead!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}`;
            
            // Si necesita crédito, agregar datos financieros
            if (needsMortgage && mortgageData.monthly_income) {
              message += `\\n\\n💳 NECESITA CRÉDITO HIPOTECARIO\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageData.down_payment || 0).toLocaleString()}`;
              
              // Agregar nombre del asesor asignado
              const assignedAsesor = vendedores.find(v => v.role === 'asesor');
              if (assignedAsesor) {
                message += `\\n\\n✅ Asignado a: ${assignedAsesor.name}`;
              }
            } else {
              message += isAssigned ? '\\n\\n✅ Asignado a ti' : '';
            }
            
            await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, message);
          }
        }
        console.log('🔔 Vendedor notificado');
        
        // Notificar asesor SOLO si necesita crédito
        if (needsMortgage && mortgageData.monthly_income) {
          const assignedAsesor = vendedores.find(v => v.role === 'asesor');
          if (assignedAsesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageData.down_payment || 0).toLocaleString()}\\n\\n📍 Lead asignado desde: ${assignedVendedor?.name || 'Vendedor'}\\n\\n¡Contactar pronto!`
            );
            console.log('🔔 Asesor notificado');
          }
        }
      }'''

content = content.replace(old_block, new_block)

# Eliminar declaración de isNewLead
content = content.replace(
    '''const { data: lead, error: leadError } = await this.supabase.getLeadByPhone(from);
    let isNewLead = false;''',
    '''const { data: lead, error: leadError } = await this.supabase.getLeadByPhone(from);'''
)

content = content.replace(
    '''console.log('✅ Lead creado:', newLead.data);
        lead = newLead.data;
        isNewLead = true;''',
    '''console.log('✅ Lead creado:', newLead.data);
        lead = newLead.data;'''
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Arreglado - usando history.length")
