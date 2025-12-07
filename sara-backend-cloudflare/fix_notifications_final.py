with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. Eliminar notificación temprana del vendedor (línea ~215)
content = content.replace(
    '''        // Notificación al vendedor se envía después de detectar propiedad
        console.log('🔔 Vendedores se notificarán después de procesar mensaje');''',
    '''        // Notificación se envía al final con datos completos'''
)

# 2. Eliminar notificación de asignación dentro del bloque de hipoteca
old_asesor_block = '''          if (assignedAsesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n💰 Ingreso: $${(mortgageInsert.data?.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageInsert.data?.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageInsert.data?.down_payment || 0).toLocaleString()}\\n\\n¡Contactar pronto!`
            );
          }

          // Notificar a vendedores que el lead fue asignado a asesor
          for (const v of vendedores) {
            if (v.phone) {
              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + v.phone,
                `🏦 ${clientName} fue asignado a ${assignedAsesor?.name || 'Asesor Hipotecario'}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name}`
              );
            }
          }'''

new_asesor_block = '''          // Notificaciones se envían al final con datos completos'''

content = content.replace(old_asesor_block, new_asesor_block)

# 3. Eliminar bloque con isNewLead
old_isnewlead = '''      // Notificar vendedores con datos completos
      if (isNewLead) {
        for (const v of vendedores) {
          if (v.phone) {
            const isAssigned = lead.assigned_to === v.id;
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + v.phone, 
              `🆕 Nuevo lead!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}${isAssigned ? '\\n\\n✅ Asignado a ti' : ''}`
            );
          }
        }
        console.log('🔔 Vendedores notificados con datos completos');
      }

    } catch (error) {'''

new_isnewlead = '''      // Notificar vendedores y asesor con datos completos (solo en primer mensaje)
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
      }

    } catch (error) {'''

content = content.replace(old_isnewlead, new_isnewlead)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificaciones consolidadas")
